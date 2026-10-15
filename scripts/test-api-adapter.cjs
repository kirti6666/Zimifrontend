/* Isolated contract checks: no SMS, accounts, storage buckets, or payments are touched. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
let version = 1, token = 'native-access-token', requests = [], uploads = [], expected = [], uploadError, tokenListeners = [];
class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
const session = {
  getSessionVersion: () => version,
  isSessionTokens: value => value && typeof value.accessToken === 'string' && typeof value.refreshToken === 'string' && value.expiresIn > 0 && value.refreshExpiresIn > 0,
  getToken: async () => token,
  onTokenChanged: listener => { tokenListeners.push(listener); return () => { tokenListeners = tokenListeners.filter(item => item !== listener); }; },
};
const client = { ApiError, request: async (...args) => {
  requests.push(args);
  const item = expected.shift();
  assert.ok(item, `Unexpected request: ${args[0]} ${args[1]}`);
  assert.equal(args[0], item.method); assert.equal(args[1], item.path);
  if (item.check) item.check(args[2], args[3]);
  if (item.run) item.run();
  if (item.error) throw item.error;
  return item.data;
} };
let socketOptions, socketUrl, socket;
const io = (url, options) => {
  socketUrl = url; socketOptions = options;
  const handlers = new Map();
  socket = {
    active: true, connected: false, connects: 0, emitted: [],
    on: (name, handler) => { handlers.set(name, handler); },
    connect: () => { socket.connects++; },
    disconnect: () => { socket.connected = false; },
    removeAllListeners: () => handlers.clear(),
    emit: (name, data) => { socket.emitted.push({ name, data: plain(data) }); },
    emitServer: (name, data) => handlers.get(name)?.(data),
  };
  return socket;
};
const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = name => {
    if (name === './client') return client;
    if (name === '../session') return session;
    if (name === '../config') return { SOCKET_URL: 'https://api.example.test' };
    if (name === 'socket.io-client') return { io };
    return load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`)));
  };
  const context = { module, exports: module.exports, require: localRequire, console, URL, AbortController, setTimeout, clearTimeout, __DEV__: true,
    fetch: async (url, options) => { uploads.push({ url, options }); if (uploadError) throw uploadError; return { ok: true, status: 200 }; },
  };
  vm.runInNewContext(code, context, { filename });
  return module.exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
function reset() { requests = []; uploads = []; expected = []; uploadError = undefined; }
function expect(method, route, data, check, extra = {}) { expected.push({ method, path: route, data, check, ...extra }); }
function finished() { assert.equal(expected.length, 0, 'Every expected server call was made'); }
const user = { id: 'member-id', role: 'user', hostStatus: 'none', name: 'Asha', isVerifiedHost: false, onboardingStatus: 'pending', photos: [], languages: [], interests: [] };
const png = 'data:image/png;base64,' + Buffer.from([137,80,78,71,13,10,26,10,0]).toString('base64');

(async () => {
  const { api, phonePayload } = load('src/api/endpoints.ts');
  const adapters = load('src/api/adapters.ts');
  assert.deepEqual(plain(phonePayload('+91 98765 43210')), { country_code: '+91', phone: '9876543210' });
  assert.throws(() => phonePayload('+1 9876543210'), /Indian/);
  expect('POST', '/auth/otp/request', { expiresIn: 300, retryAfterSeconds: 75 }, (body, options) => {
    assert.deepEqual(plain(body), { country_code: '+91', phone: '9876543210' }); assert.equal(options.auth, false);
  });
  assert.equal((await api.sendOtp('9876543210', 'host')).resendAfter, 75);
  expect('POST', '/auth/otp/verify', { user, tokens: { accessToken: 'access', refreshToken: 'refresh', expiresIn: 900, refreshExpiresIn: 3600 }, isNewUser: true, requiresOnboarding: true }, (body, options) => {
    assert.deepEqual(plain(body), { country_code: '+91', phone: '9876543210', otp: '123456', client: 'native' }); assert.equal(options.auth, false);
  });
  const signedIn = await api.verifyOtp('+919876543210', '123456', 'host', true);
  assert.equal(signedIn.user.role, 'sender'); assert.equal(signedIn.tokens.refreshToken, 'refresh');
  assert.equal(signedIn.balance, undefined); assert.equal(signedIn.earned, undefined); assert.equal(signedIn.requiresOnboarding, true);
  for (const status of ['none', 'pending', 'rejected', 'suspended']) assert.equal(adapters.accountFrom({ user: { ...user, role: 'host', hostStatus: status, isVerifiedHost: true } }).user.role, 'sender');
  for (const status of ['none', 'pending', 'rejected', 'suspended']) assert.equal(adapters.accountFrom({ user: { ...user, role: 'host', hostStatus: status } }).user.serverRole, 'host', 'Presentation role must not grant an unapproved host member chat permissions');
  assert.equal(adapters.accountFrom({ user: { ...user, role: 'user', hostStatus: 'pending' } }).user.serverRole, 'user', 'A member applying to host remains a member until approved');
  assert.equal(adapters.accountFrom({ user: { ...user, role: 'host', hostStatus: 'approved', isVerifiedHost: true } }).user.role, 'host');
  assert.equal(adapters.accountFrom({ user: { ...user, role: 'host', hostStatus: 'approved', isVerifiedHost: true } }).user.isVerifiedHost, true);
  assert.equal(adapters.accountFrom({ user: { ...user, role: 'host', hostStatus: 'approved' } }).user.isVerifiedHost, false);
  await assert.rejects(api.verifyOtp('9876543210', '123', 'sender', false), /6-digit/);
  finished();

  reset();
  let resolveOlderProfile;
  const olderProfile = new Promise(resolve => { resolveOlderProfile = resolve; });
  expect('GET', '/auth/me', olderProfile);
  const olderAccount = api.me();
  expect('GET', '/auth/me', { user: { ...user, hostStatus: 'suspended', isVerifiedHost: false } });
  const currentAuthority = await api.me(true);
  assert.equal(currentAuthority.user.hostStatus, 'suspended', 'A fresh approval check must bypass an older in-flight account request');
  resolveOlderProfile({ user: { ...user, role: 'host', hostStatus: 'approved', isVerifiedHost: true } });
  assert.equal((await olderAccount).user.role, 'host');
  finished();

  reset();
  const progress = [];
  for (let index = 0; index < 3; index++) expect('POST', '/auth/profile/avatar/upload-url', { uploadUrl: `https://storage.example.test/photo${index}?signature=short-lived`, key: `avatars/member-id/${index}.png` }, body => assert.deepEqual(plain(body), { contentType: 'image/png', contentLength: 9 }));
  expect('PATCH', '/auth/profile', { user: { ...user, onboardingStatus: 'completed' } }, body => {
    assert.deepEqual(plain(body), { name: 'Asha', onboarding: { email: 'asha@example.test', photoKeys: ['avatars/member-id/0.png','avatars/member-id/1.png','avatars/member-id/2.png'], languages: [], interests: ['Music'], preferredRole: 'member', adultConfirmed: true } });
    assert.ok(!JSON.stringify(body).includes('base64'));
  });
  const profile = { name: ' Asha ', email: 'asha@example.test', photos: [png,png,png], langs: [], interests: ['Music'], adultConfirmed: true, preferredRole: 'member', role: 'host' };
  assert.equal((await api.saveProfile(profile, (done,total) => progress.push([done,total]))).requiresOnboarding, false);
  assert.deepEqual(progress, [[0,3],[1,3],[2,3],[3,3]]);
  assert.equal(uploads.length, 3);
  for (const upload of uploads) {
    assert.equal(upload.options.method, 'PUT'); assert.equal(upload.options.credentials, 'omit'); assert.equal(upload.options.headers.Authorization, undefined);
    assert.equal(upload.options.body.byteLength, 9);
  }
  finished();
  reset();
  await assert.rejects(api.saveProfile({ ...profile, adultConfirmed: false }), /18 or older/);
  await assert.rejects(api.saveProfile({ ...profile, photos: ['data:image/svg+xml;base64,PGh0bWw+',png,png] }), /JPEG/);
  await assert.rejects(api.saveProfile({ ...profile, preferredRole: 'creator' }), /languages/);
  assert.equal(requests.length, 0);

  expect('POST', '/auth/profile/avatar/upload-url', { uploadUrl: 'https://storage.example.test/first', key: 'avatars/member-id/first.png' });
  uploadError = new Error('offline');
  await assert.rejects(api.saveProfile(profile), /Check your connection/);
  assert.equal(requests.length, 1, 'Failed upload never saves a profile'); finished();
  reset();
  expect('POST', '/auth/profile/avatar/upload-url', { uploadUrl: 'https://storage.example.test/first', key: 'avatars/member-id/first.png' }, undefined, { run: () => version++ });
  await assert.rejects(api.saveProfile(profile), /sign-in changed/);
  assert.equal(uploads.length, 0, 'Logout during signing cancels the old upload'); finished();
  reset();
  expect('POST', '/auth/profile/avatar/upload-url', { uploadUrl: 'http://public.example.test/first', key: 'avatars/member-id/first.png' });
  await assert.rejects(api.saveProfile(profile), /secure connection/);
  assert.equal(uploads.length, 0); finished();

  reset();
  const existingPhotos = [0,1,2].map(index => ({ key: `avatars/member-id/saved-${index}.png`, url: `https://cdn.example.test/saved-${index}.png` }));
  expect('GET', '/auth/me', { user: { ...user, photos: existingPhotos } });
  expect('PATCH', '/auth/profile', { user: { ...user, photos: existingPhotos, onboardingStatus: 'completed' } }, body => assert.deepEqual(plain(body.onboarding.photoKeys), existingPhotos.map(photo => photo.key)));
  await api.saveProfile({ ...profile, photos: existingPhotos.map(photo => photo.url) });
  assert.equal(uploads.length, 0, 'Authenticated existing gallery keys are reused without downloading or reuploading images'); finished();
  reset();
  expect('GET', '/auth/me', { user: { ...user, photos: existingPhotos } });
  await assert.rejects(api.saveProfile({ ...profile, photos: [existingPhotos[0].url, existingPhotos[1].url, 'https://cdn.example.test/another-user.png'] }), /saved photo/);
  assert.equal(requests.length, 1, 'An arbitrary gallery URL is rejected before any profile change'); assert.equal(uploads.length, 0); finished();

  reset();
  const updatedUser = { ...user, onboardingStatus: 'completed', avatarKey: 'avatars/member-id/new.png', avatarUrl: 'https://cdn.example.test/avatar.png', coverKey: 'covers/member-id/new.png', coverUrl: 'https://cdn.example.test/cover.png' };
  for (const purpose of ['avatar', 'cover']) expect('POST', '/media/upload-url', { uploadUrl: `https://storage.example.test/${purpose}?signature=short-lived`, key: `${purpose}s/member-id/new.png` }, body => assert.deepEqual(plain(body), { purpose, contentType: 'image/png', contentLength: 9 }));
  expect('PATCH', '/profile', {}, body => {
    assert.deepEqual(plain(body), { name: 'Asha', city: 'Pune', bio: 'Hello there', avatarKey: updatedUser.avatarKey, coverKey: updatedUser.coverKey });
    assert.equal(JSON.stringify(body).includes('base64'), false, 'Only verified storage keys enter profile metadata');
  });
  expect('GET', '/auth/me', { user: updatedUser });
  const editProgress = [], edited = await api.saveProfile({ name: ' Asha ', city: ' Pune ', about: 'Hello there', avatar: png, cover: png }, (done,total) => editProgress.push([done,total]));
  assert.equal(edited.user.coverUrl, updatedUser.coverUrl); assert.equal(edited.user.avatarKey, updatedUser.avatarKey);
  assert.deepEqual(editProgress, [[0,2],[1,2],[2,2]]);
  assert.equal(uploads.length, 2);
  uploads.forEach(upload => { assert.equal(upload.options.credentials, 'omit'); assert.equal(upload.options.headers.Authorization, undefined); }); finished();

  reset();
  await assert.rejects(api.saveProfile({ name: 'Asha', avatar: png, cover: 'https://untrusted.example.test/photo.png' }), /JPEG/);
  assert.equal(requests.length, 0, 'Validate both photos before uploading either one');
  expect('POST', '/media/upload-url', { uploadUrl: 'https://storage.example.test/avatar', key: updatedUser.avatarKey });
  uploadError = new Error('offline');
  await assert.rejects(api.saveProfile({ name: 'Asha', avatar: png }), /Check your connection/);
  assert.equal(requests.length, 1, 'A failed media upload cannot save profile metadata'); finished();
  reset();
  expect('PATCH', '/profile', {}, body => assert.deepEqual(plain(body), { name: 'Asha', coverKey: null }));
  expect('GET', '/auth/me', { user: { ...updatedUser, coverKey: '', coverUrl: '' } });
  await api.saveProfile({ name: 'Asha', cover: null });
  assert.equal(uploads.length, 0, 'Removing a cover does not issue an upload'); finished();

  reset();
  expect('GET', '/auth/me', { user });
  await assert.rejects(api.createPost(png, 'Hello'), /approved/);
  assert.equal(uploads.length, 0, 'A member cannot upload post media through the creator UI'); finished();
  reset();
  const approvedUser = { ...updatedUser, role: 'host', hostStatus: 'approved', isVerifiedHost: true };
  const newPost = { _id: 'new-post', mediaKey: 'posts/member-id/new.png', mediaUrl: 'https://cdn.example.test/post.png', kind: 'photo', caption: 'Hello' };
  expect('GET', '/auth/me', { user: approvedUser });
  expect('POST', '/media/upload-url', { uploadUrl: 'https://storage.example.test/post', key: newPost.mediaKey }, body => assert.equal(body.purpose, 'post'));
  expect('POST', '/posts', newPost, body => assert.deepEqual(plain(body), { caption: 'Hello', kind: 'photo', mediaKey: newPost.mediaKey }));
  assert.equal((await api.createPost(png, ' Hello ')).mediaUrl, newPost.mediaUrl);
  assert.equal(uploads.length, 1); finished();
  expect('GET', '/users/member-id/posts', { items: [newPost] });
  assert.equal((await api.myPosts()).posts[0].id, 'new-post'); finished();
  reset();
  expect('GET', '/auth/me', { user: approvedUser });
  expect('POST', '/media/upload-url', { uploadUrl: 'https://storage.example.test/post', key: newPost.mediaKey }, undefined, { run: () => version++ });
  await assert.rejects(api.createPost(png, 'Hello'), /sign-in changed/);
  assert.equal(uploads.length, 0, 'A sign-in change cancels post upload and publication'); finished();

  reset();
  expect('GET', '/auth/me', { user }); await api.me();
  expect('GET', '/hosts?limit=100', { items: [{ _id: 'host-id', name: 'Creator', avatar: { url: 'https://cdn.example.test/creator.jpg' }, coverUrl: 'https://cdn.example.test/cover.jpg' }] });
  const hosts = await api.hosts(); assert.equal(hosts.hosts[0].id, 'host-id'); assert.equal(hosts.hosts[0].ratePerMin, undefined);
  assert.equal(hosts.hosts[0].avatarUrl, 'https://cdn.example.test/creator.jpg'); assert.equal(hosts.hosts[0].coverUrl, 'https://cdn.example.test/cover.jpg');
  expect('GET', '/chats', { items: [{ participants: [{ _id: 'member-id', name: 'Asha' }, { _id: 'host-id', name: 'Creator' }], lastMessage: { text: 'Hello' }, unread: 2 }] });
  assert.equal((await api.chats()).chats[0].user.id, 'host-id');
  const chatAt = '2026-10-13T09:00:00.000Z';
  expect('GET', '/chats?page=2', { items: [{ _id: 'conversation-id', participants: [{ _id: 'member-id' }, { _id: 'host-id', name: 'Creator', role: 'host', hostStatus: 'approved', isVerifiedHost: true, isOnline: true, availableForCall: true }],
    lastMessage: { text: 'A real reply', senderId: 'member-id', createdAt: chatAt, kind: 'text', mine: true, status: 'read' }, lastMessageAt: chatAt, unread: 2, hasCalls: true }], total: 31, page: 2, limit: 20, unreadCount: 12, unreadConversations: 4 });
  const chatPage = await api.chats(2), chat = chatPage.chats[0];
  assert.equal(chatPage.unreadCount, 12, 'Total unread comes from all server conversations, not only this page');
  assert.equal(chatPage.unreadConversations, 4); assert.equal(chatPage.page, 2); assert.equal(chatPage.total, 31);
  assert.equal(chat.id, 'conversation-id'); assert.equal(chat.lastAt, chatAt); assert.equal(chat.lastMine, true); assert.equal(chat.lastStatus, 'read'); assert.equal(chat.lastKind, 'text'); assert.equal(chat.hasCalls, true);
  assert.equal(chat.lastAutomated, false, 'Ordinary conversation previews are not labeled automated');
  const welcomeChat = adapters.chatsFrom({ items: [{ participants: [{ _id: 'member-id' }, { _id: 'host-id' }], lastMessage: { text: 'Welcome!', automated: true } }] }, 'member-id');
  assert.equal(welcomeChat.chats[0].lastAutomated, true, 'Persisted welcome metadata reaches the inbox');
  assert.equal(chat.user.role, 'host'); assert.equal(chat.user.online, true); assert.equal(chat.user.verified, true); assert.equal(chat.user.availableForCall, true);
  assert.equal(adapters.hostFrom({ _id: 'pending', role: 'host', hostStatus: 'pending', isVerifiedHost: true }).role, 'sender', 'Role labels require an approved host');
  expect('POST', '/chats/read-all', { updated: 12, readAt: chatAt }, body => assert.deepEqual(plain(body), {}));
  assert.deepEqual(plain(await api.readAllChats()), { updated: 12, readAt: chatAt });
  expect('POST', '/chats/read-all', { updated: '12', readAt: chatAt });
  await assert.rejects(api.readAllChats(), /read status could not be confirmed/);
  expect('GET', '/chats/host-id', { items: [{ _id: 'second', senderId: 'member-id', text: 'Second', createdAt: chatAt }, { _id: 'first', senderId: 'host-id', text: 'First', automated: true }], readAt: chatAt });
  const thread = await api.thread('host-id');
  assert.deepEqual(plain(thread.messages.map(message => [message.text,message.mine])), [['First',false],['Second',true]]);
  assert.equal(thread.readAt, chatAt); assert.equal(thread.messages[1].id, 'second'); assert.equal(thread.messages[1].createdAt, chatAt);
  assert.equal(thread.messages[0].automated, true); assert.equal(thread.messages[1].automated, false);
  assert.equal(adapters.messagesFrom({ items: [{ automated: 'true' }] }, 'member-id').messages[0].automated, false, 'Only a boolean server marker identifies an automated welcome');
  assert.equal(adapters.hostFrom({ _id: 'pending', role: 'host', hostStatus: 'pending' }).serverRole, 'host');
  const restricted = adapters.messagesFrom({ items: [], canSend: false, sendDisabledReason: 'Wait for this member to reply.' }, 'host-id');
  assert.equal(restricted.canSend, false); assert.equal(restricted.sendDisabledReason, 'Wait for this member to reply.');
  const restrictedInbox = adapters.chatsFrom({ items: [{ participants: [{ _id: 'host-id' }, { _id: 'member-id', role: 'user' }], automatedOnly: true, canSend: false }] }, 'host-id');
  assert.equal(restrictedInbox.chats[0].canSend, false); assert.equal(restrictedInbox.chats[0].automatedOnly, true);
  expect('GET', '/calls?limit=100', { items: [{ callerId: { _id: 'host-id' }, calleeId: { _id: 'member-id' }, status: 'missed', kind: 'audio' }, { callerId: 'member-id', calleeId: 'host-id', status: 'missed' }] });
  const missed = await api.missedCalls(); assert.equal(missed.calls.length, 1); assert.equal(missed.calls[0].kind, 'voice');
  expect('GET', '/wallet', { coins: 200, earningsPaise: 12345, reservedPaise: 2000 });
  const wallet = await api.wallet(); assert.equal(wallet.earningsPaise, 12345); assert.equal(wallet.earned, undefined);
  assert.throws(() => adapters.walletFrom({ coins: '200', earningsPaise: 0 }), /wallet/);
  expect('POST', '/calls', { _id: 'call-id' }, body => assert.deepEqual(plain(body), { calleeId: 'host-id', kind: 'audio' }));
  assert.equal((await api.startCall('host-id', true)).callId, 'call-id');
  expect('POST', '/calls/call-id/end', {}); await api.declineCall('call-id');
  expect('POST', '/chats/host-id', {}); await api.sendMessage('host-id', 'Hello');
  expect('POST', '/users/host-id/follow', {}, body => assert.deepEqual(plain(body), { following: true })); await api.follow('host-id', true);
  finished();
  reset();
  await assert.rejects(api.recharge({}), /checkout/); await assert.rejects(api.sendGift('host-id','Rose',10), /No coins were spent/);
  assert.equal(requests.length, 0, 'Legacy money flows cannot debit or fake success');

  const creator = { _id: 'creator-id', name: 'Asha Live', avatar: { url: 'https://cdn.example.test/host.jpg' }, isVerifiedHost: true, isOnline: true, availableForCall: true, callRateCoinsPerMinute: 0,
    stream: { _id: 'stream-id', title: 'Acoustic night', category: 'Music', kind: 'video', viewers: 12 } };
  expect('GET', '/home?category=Music&page=2&limit=20', { items: [creator], stage: [creator], featured: creator, total: 21, page: 2, limit: 20, categories: ['Music'], broadcasterCount: 5, availableCount: 3, speedMatchEnabled: true, unreadNotifications: 4,
    bonus: { _id: 'mission-id', title: 'Creator bonus', target: 10, progress: 5, rewardCoins: 200, claimed: false } });
  const home = await api.home({ category: 'Music', page: 2 });
  assert.equal(home.hosts[0].ratePerMin, 0, 'Free calls must not invent a per-minute charge');
  assert.equal(home.hosts[0].stream.hostId, creator._id); assert.equal(home.hosts[0].verified, true);
  assert.equal(home.availableCount, 3); assert.equal(home.bonus.progress, 5); assert.equal(home.unreadCount, 4);
  expect('GET', '/home/match?category=Music', { host: creator });
  assert.equal((await api.matchHost('Music')).host.id, creator._id);
  expect('PATCH', '/safety', { allowRequests: false, showActivity: false, discoverable: true }, body => assert.deepEqual(plain(body), { allowRequests: false, showActivity: false, discoverable: true }));
  assert.deepEqual(plain(await api.setPresence(false, true)), { online: false, visible: true });
  expect('PATCH', '/safety', { allowRequests: false, showActivity: true, discoverable: true });
  assert.equal((await api.setPresence(true, true)).online, false, 'Presence acknowledges effective server permission, not the requested optimistic toggle');
  const serverSettings = {
    profile: { id: 'member-id', name: 'Asha', bio: 'Acoustic music', city: 'Pune', languages: ['English', 'Hindi'], maskedPhone: '+91 ••••••3210', countryCode: '+91', isPhoneVerified: true, createdAt: chatAt, phone: '9876543210', role: 'host', isVerifiedHost: true },
    stats: { fans: 42, following: 8, giftsSent: 5, giftsReceived: 12, coinsSent: 300, coinsReceived: 950 },
    preferences: { pushNotifications: true, matchCategory: 'Music', appearance: 'system' },
    privacy: { discoverable: true, showActivity: false, allowRequests: false },
    categories: ['Music', 'Gaming'], capabilities: { pushNotifications: true, liveAlerts: false, interfaceLanguages: ['en'], currency: 'INR' },
  };
  expect('GET', '/account/settings', serverSettings);
  const settings = await api.profileSettings();
  assert.equal(settings.stats.fans, 42); assert.equal(settings.stats.coinsReceived, 950); assert.equal(settings.preferences.appearance, 'system');
  assert.equal(settings.profile.maskedPhone, '+91 ••••••3210'); assert.equal(settings.profile.countryCode, '+91'); assert.equal(settings.profile.isPhoneVerified, true);
  assert.equal(settings.capabilities.pushNotifications, true); assert.equal(settings.capabilities.nativePushRegistered, false, 'Server worker availability is not device push registration');
  assert.equal(JSON.stringify(settings).includes('9876543210'), false, 'Only the masked phone may reach the settings WebView');
  assert.equal(settings.profile.role, undefined); assert.equal(settings.profile.isVerifiedHost, undefined, 'Settings summaries cannot grant host authority');
  assert.throws(() => adapters.profileSettingsFrom({ ...serverSettings, stats: {} }), /settings could not be loaded/, 'Missing statistics must not become fabricated zero values');
  expect('PATCH', '/account/settings', { ...serverSettings, preferences: { pushNotifications: false, matchCategory: null, appearance: 'light' } }, body => assert.deepEqual(plain(body), { pushNotifications: false, matchCategory: null, appearance: 'light', languages: ['English'], city: 'Delhi' }));
  assert.equal((await api.saveProfileSettings({ pushNotifications: false, matchCategory: null, appearance: 'light', languages: ['English'], city: 'Delhi' })).preferences.appearance, 'light');
  expect('PATCH', '/safety', { discoverable: false, showActivity: true, allowRequests: false }, body => {
    assert.deepEqual(plain(body), { discoverable: false }); assert.equal(body.allowRequests, undefined);
  });
  assert.deepEqual(plain(await api.savePrivacy({ discoverable: false })), { discoverable: false, showActivity: true, allowRequests: false });
  expect('GET', '/users/blocked?page=2&limit=20', { items: [{ _id: 'block-id', blockedId: { _id: 'blocked-id', name: 'Blocked account', avatar: { url: 'https://cdn.example.test/blocked.jpg' } } }], total: 23, page: 2, limit: 20 });
  const blocked = await api.blockedUsers(2); assert.equal(blocked.users[0].id, 'blocked-id'); assert.equal(blocked.users[0].avatarUrl, 'https://cdn.example.test/blocked.jpg'); assert.equal(blocked.total, 23); assert.equal(blocked.page, 2);
  expect('POST', '/users/blocked-id/block', {}, body => assert.deepEqual(plain(body), {})); await api.setBlocked('blocked-id', true);
  expect('DELETE', '/users/blocked-id/block', {}, body => assert.equal(body, undefined)); await api.setBlocked('blocked-id', false);
  expect('POST', '/notifications/read', {}, body => assert.deepEqual(plain(body), { ids: ['note-id'] }));
  expect('GET', '/notifications?limit=100', { items: [{ _id: 'note-id', title: 'From admin', body: 'Event tonight', read: true }] });
  assert.equal((await api.readNotifications(['note-id'])).items[0].read, true);
  const giftId = '0123456789abcdef01234567', packId = '1123456789abcdef01234567';
  expect('GET', '/gifts?limit=100', { items: [{ _id: giftId, name: 'Rose', emoji: 'rose', coins: 25 }] });
  expect('GET', '/coins/packs', { items: [{ _id: packId, name: 'Starter', coins: 100, pricePaise: 9900 }], paymentsAvailable: true });
  const catalog = await api.catalog(); assert.equal(catalog.gifts[0].id, giftId); assert.equal(catalog.packs[0].pricePaise, 9900); assert.equal(catalog.paymentsAvailable, true);
  expect('POST', '/gifts/send', {}, body => { assert.deepEqual(plain(body), { recipientId: 'creator-id', giftId, quantity: 1, streamId: 'stream-id', idempotencyKey: 'gift-attempt-1' }); assert.equal(body.coins, undefined, 'Price must come from the server catalog'); });
  expect('GET', '/wallet', { coins: 75, earningsPaise: 0 });
  assert.equal((await api.sendGift('creator-id', giftId, 1, undefined, 'stream-id', 'gift-attempt-1')).coins, 75);
  expect('POST', '/missions/mission-id/claim', {}); expect('GET', '/wallet', { coins: 275, earningsPaise: 0 });
  assert.equal((await api.claimAward('mission-id')).coins, 275);
  expect('POST', '/coins/purchase', { _id: 'purchase-id', merchantOrderId: 'zimi_order', status: 'pending', paymentUrl: 'https://checkout.example.test/pay' }, body => assert.deepEqual(plain(body), { packId, idempotencyKey: 'payment-attempt-1' }));
  assert.equal((await api.checkout(packId, 'payment-attempt-1')).status, 'PENDING');
  expect('POST', '/coins/purchase/verify', { _id: 'purchase-id', merchantOrderId: 'zimi_order', status: 'paid' });
  assert.equal((await api.verifyPurchase('zimi_order')).status, 'SUCCESS');
  assert.throws(() => adapters.purchaseFrom({ paymentUrl: 'javascript:steal()' }), /secure payment/);
  const themeId = '000000000000000000000001';
  const theme = { _id: themeId, slug: 'primary', name: 'Primary', description: 'Free primary theme', active: true, isPremium: false, isDefault: true, sortOrder: 0, mode: 'dark',
    colors: { background: '#101012', surface: '#202022', surfaceElevated: '#303033', text: '#ffffff', textMuted: '#bbbbbb', primary: '#aa0055', primaryContrast: '#ffffff', secondary: '#aa1155', border: '#555555', success: '#006622', danger: '#bb0000' },
    typography: { fontFamily: 'system', fontScale: 1, fontWeight: '400', headingWeight: '700' } };
  const themes = { items: [theme], selectedThemeId: themeId, premium: { active: false, pricePaise: 29900, currency: 'INR', paymentsAvailable: true, purchaseType: 'lifetime' } };
  expect('GET', '/themes', themes);
  const appearance = await api.themes(); assert.equal(appearance.items[0].id, themeId); assert.equal(appearance.items[0]._id, undefined); assert.equal(appearance.premium.active, false);
  expect('PATCH', '/themes/preference', themes, body => assert.deepEqual(plain(body), { themeId })); await api.selectTheme(themeId);
  for (const unsafe of [
    { ...theme, colors: { ...theme.colors, background: 'url(https://evil.test)' } },
    { ...theme, typography: { ...theme.typography, fontFamily: 'injected' } },
    { ...theme, typography: { ...theme.typography, fontScale: 99 } },
  ]) assert.throws(() => adapters.themesFrom({ ...themes, items: [unsafe] }), /theme/);
  assert.throws(() => adapters.themesFrom({ ...themes, items: [{ ...theme, isPremium: true }] }), /confirmed/);
  expect('POST', '/themes/premium/purchase', { _id: 'premium-purchase', merchantOrderId: 'premium_order', kind: 'premium', status: 'pending' }, body => assert.deepEqual(plain(body), { idempotencyKey: 'premium-attempt-1' }));
  assert.equal((await api.checkoutPremium('premium-attempt-1')).kind, 'premium');
  expect('POST', '/themes/premium/verify', { _id: 'premium-purchase', merchantOrderId: 'premium_order', kind: 'premium', status: 'reverted' }, body => assert.deepEqual(plain(body), { merchantOrderId: 'premium_order' }));
  assert.equal((await api.verifyPremium('premium_order')).status, 'REVERTED');
  const transactions = adapters.transactionsFrom({ items: [
    { type: 'purchase', coins: 0, amountPaise: 19950, description: 'Lifetime premium themes' },
    { type: 'purchase_reversal', coins: 0, amountPaise: -19950, description: 'Premium payment reversed' },
    { type: 'purchase', coins: 100, amountPaise: 9900 },
    { type: 'purchase_reversal', coins: -100, amountPaise: -9900 },
    { type: 'gift_sent', coins: -25, amountPaise: 0 },
    { type: 'gift_received', coins: 0, amountPaise: 500 },
  ] }).items;
  assert.equal(transactions[0].displayAmountPaise, -19950); assert.equal(transactions[0].amountPaise, 19950);
  assert.equal(transactions[1].displayAmountPaise, 19950); assert.equal(transactions[1].amountPaise, -19950);
  assert.deepEqual(transactions.slice(2).map(tx => tx.displayAmountPaise), [undefined, undefined, undefined, undefined]);
  assert.deepEqual(transactions.map(tx => tx.coins), [0, 0, 100, -100, -25, 0]);
  assert.deepEqual(transactions.filter(tx => tx.kind === 'gift').map(tx => tx.coins), [-25, 0]);
  expect('POST', '/streams/stream-id/join', { count: 13 });
  expect('GET', '/streams/stream-id', { _id: 'stream-id', hostId: creator._id, host: creator, title: 'Acoustic night', viewers: 13 });
  assert.equal((await api.joinStream('stream-id')).host.name, 'Asha Live');
  for (const status of ['ended', 'terminated']) {
    expect('PUT', '/streams/owned-stream/end', undefined, undefined, { error: new ApiError('Stream is not live or you are not its host', 409) });
    expect('GET', '/streams/owned-stream', { _id: 'owned-stream', hostId: 'member-id', status });
    await api.endStream('owned-stream');
  }
  const stillLive = new ApiError('Stream changed. Retry.', 409);
  expect('PUT', '/streams/live-stream/end', undefined, undefined, { error: stillLive });
  expect('GET', '/streams/live-stream', { _id: 'live-stream', hostId: 'member-id', status: 'live' });
  await assert.rejects(api.endStream('live-stream'), error => error === stillLive);
  const notOwner = new ApiError('Stream is not live or you are not its host', 409);
  expect('PUT', '/streams/other-stream/end', undefined, undefined, { error: notOwner });
  expect('GET', '/streams/other-stream', { _id: 'other-stream', hostId: 'someone-else', status: 'ended' });
  await assert.rejects(api.endStream('other-stream'), error => error === notOwner);
  const denied = new ApiError('You cannot access this stream', 403);
  expect('PUT', '/streams/blocked-stream/end', undefined, undefined, { error: notOwner });
  expect('GET', '/streams/blocked-stream', undefined, undefined, { error: denied });
  await assert.rejects(api.endStream('blocked-stream'), error => error === denied);
  finished();

  const { connectRealtime } = load('src/api/realtime.ts');
  const events = [], stop = connectRealtime(token, event => events.push(event), 'member-id');
  assert.equal(socketUrl, 'https://api.example.test'); assert.equal(socketOptions.query, undefined);
  let handshake; socketOptions.auth(value => { handshake = value; }); await Promise.resolve();
  assert.deepEqual(plain(handshake), { token });
  socket.emitServer('chat:message', { senderId: 'member-id', recipientId: 'host-id', text: 'Own echo' });
  socket.emitServer('chat:message', { _id: 'message-id', senderId: 'host-id', recipientId: 'member-id', text: 'Hello', createdAt: chatAt, automated: true });
  socket.emitServer('chat:message', { senderId: 'stranger', recipientId: 'other-user', text: 'Private unrelated message' });
  socket.emitServer('chat:read', { userId: 'host-id', conversationIds: ['conversation-id'], readAt: chatAt });
  socket.emitServer('chat:read', { userId: 'host-id', conversationIds: 'malformed', readAt: chatAt });
  socket.emitServer('call:updated', { _id: 'incoming', callerId: 'host-id', calleeId: 'member-id', status: 'ringing' });
  socket.emitServer('host:reviewed', { status: 'approved' });
  assert.deepEqual(events.map(event => event.type), ['chats.updated','chat.message','chats.updated','chats.updated','call.incoming','verification.status']);
  assert.equal(events[1].data.id, 'message-id'); assert.equal(events[1].data.createdAt, chatAt);
  assert.equal(events[1].data.automated, true, 'Realtime delivery retains the automated label');
  socket.emitServer('account:updated', {}); assert.equal(events.at(-1).type, 'account.updated');
  for (const event of ['themes:updated', 'appearance:updated', 'premium:updated']) {
    socket.emitServer(event, { active: true }); assert.deepEqual(plain(events.at(-1)), { type: 'themes.updated', data: {} });
  }
  token = 'rotated-token'; tokenListeners.forEach(listener => listener()); await Promise.resolve();
  assert.equal(socket.connects, 2);
  socket.connected = true; socket.emitServer('connect');
  assert.deepEqual(socket.emitted, [{ name: 'app:activity', data: { active: true } }], 'Each connected session announces its initial foreground state');
  stop.setActive(false);
  assert.deepEqual(socket.emitted.at(-1), { name: 'app:activity', data: { active: false } });
  socket.connected = false; const emittedBeforeOffline = socket.emitted.length;
  stop.setActive(true); stop.setActive(false);
  assert.equal(socket.emitted.length, emittedBeforeOffline, 'Offline transitions are not buffered as stale foreground messages');
  socket.connected = true; socket.emitServer('connect');
  assert.deepEqual(socket.emitted.at(-1), { name: 'app:activity', data: { active: false } }, 'A reconnect announces the latest state');
  stop.setActive(true);
  assert.deepEqual(socket.emitted.at(-1), { name: 'app:activity', data: { active: true } });
  const beforeStop = events.length, emissionsBeforeStop = socket.emitted.length;
  stop(); stop.setActive(false); assert.equal(socket.emitted.length, emissionsBeforeStop);
  assert.equal(tokenListeners.length, 0); socket.emitServer('call:updated', { status: 'accepted', _id: 'late' }); assert.equal(events.length, beforeStop);
  const backgroundStop = connectRealtime(token, () => {}, 'member-id', false);
  socket.connected = true; socket.emitServer('connect');
  assert.deepEqual(socket.emitted, [{ name: 'app:activity', data: { active: false } }], 'A session opened in background never starts a welcome schedule');
  backgroundStop();
  console.log('API adapter checks passed: authentication, media, home feed, matches, presence, notifications, catalog, server-priced gifts, missions, checkout, streams, and Socket.IO.');
})().catch(error => { console.error(error); process.exitCode = 1; });
