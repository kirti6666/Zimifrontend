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
    active: true, connected: false, connects: 0,
    on: (name, handler) => { handlers.set(name, handler); },
    connect: () => { socket.connects++; },
    disconnect: () => { socket.connected = false; },
    removeAllListeners: () => handlers.clear(),
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
  assert.equal(adapters.accountFrom({ user: { ...user, role: 'host', hostStatus: 'approved', isVerifiedHost: true } }).user.role, 'host');
  await assert.rejects(api.verifyOtp('9876543210', '123', 'sender', false), /6-digit/);
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
  expect('GET', '/chats/host-id', { items: [{ senderId: 'member-id', text: 'Second' }, { senderId: 'host-id', text: 'First' }] });
  assert.deepEqual(plain((await api.thread('host-id')).messages.map(message => [message.text,message.mine])), [['First',false],['Second',true]]);
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
  assert.equal(requests.length, 0, 'Unimplemented money flows cannot debit or fake success');

  const { connectRealtime } = load('src/api/realtime.ts');
  const events = [], stop = connectRealtime(token, event => events.push(event), 'member-id');
  assert.equal(socketUrl, 'https://api.example.test'); assert.equal(socketOptions.query, undefined);
  let handshake; socketOptions.auth(value => { handshake = value; }); await Promise.resolve();
  assert.deepEqual(plain(handshake), { token });
  socket.emitServer('chat:message', { senderId: 'member-id', recipientId: 'host-id', text: 'Own echo' });
  socket.emitServer('chat:message', { senderId: 'host-id', recipientId: 'member-id', text: 'Hello' });
  socket.emitServer('call:updated', { _id: 'incoming', callerId: 'host-id', calleeId: 'member-id', status: 'ringing' });
  socket.emitServer('host:reviewed', { status: 'approved' });
  assert.deepEqual(events.map(event => event.type), ['chat.message','call.incoming','verification.status']);
  token = 'rotated-token'; tokenListeners.forEach(listener => listener()); await Promise.resolve();
  assert.equal(socket.connects, 2);
  stop(); assert.equal(tokenListeners.length, 0); socket.emitServer('call:updated', { status: 'accepted', _id: 'late' }); assert.equal(events.length, 3);
  console.log('API adapter checks passed: auth contracts, role authority, R2 avatar/cover/post uploads, metadata validation, session races, lists, wallet units, unsupported payments, and Socket.IO.');
})().catch(error => { console.error(error); process.exitCode = 1; });
