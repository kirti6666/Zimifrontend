/* Isolated contract checks: no SMS, accounts, storage buckets, or payments are touched. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
let version = 1, token = 'native-access-token', requests = [], uploads = [], expected = [], uploadError, tokenListeners = [];
class ApiError extends Error { constructor(message, status, code) { super(message); Object.assign(this, { status, code }); } }
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
const voiceBytes = Buffer.from([26, 69, 223, 163, 0, 1, 2, 3]);
const voice = 'data:audio/webm;codecs=opus;base64,' + voiceBytes.toString('base64');

(async () => {
  const { api, phonePayload } = load('src/api/endpoints.ts');
  const adapters = load('src/api/adapters.ts');
  const ordered = adapters.messagesFrom({items:[{_id:'seq2',sequence:2,createdAt:'2026-10-30T10:00:00Z'},{_id:'legacy',createdAt:'2026-10-30T11:00:00Z'},{_id:'seq1',sequence:1,createdAt:'2026-10-30T12:00:00Z'}]},'self').messages;
  assert.deepEqual(plain(ordered.map(message=>message.id)),['legacy','seq1','seq2'],'Transport preserves server sequence ahead of clock skew, with legacy history first');
  const agencyStatus = { agency: { _id: 'agency-1', name: 'Dream Star', recruitmentCode: 'BINZO7K9Q2M', status: 'ACTIVE' }, joiningCode: 'BINZO7K9Q2M8X4R', codeType: 'host-invite', canJoin: true, hostStatus: 'none', isVerifiedHost: false, eligible: true, requirements: [], nextStep: 'application' };
  expect('GET', '/hosts/agency', { ...agencyStatus, agency: null, nextStep: 'agency' });
  assert.equal((await api.hostAgency()).agency, null);
  expect('POST', '/hosts/verify-agency-code', agencyStatus, body => assert.deepEqual(plain(body), { agencyCode: 'BINZO7K9Q2M8X4R' }));
  const invitePreview = await api.verifyAgencyCode(' binzo7k9q2m8x4r ');
  assert.equal(invitePreview.agency.id, 'agency-1');
  assert.equal(invitePreview.agency.recruitmentCode, 'BINZO7K9Q2M');
  assert.equal(invitePreview.joiningCode, 'BINZO7K9Q2M8X4R');
  assert.equal(invitePreview.codeType, 'host-invite'); assert.equal(invitePreview.canJoin, true);
  expect('POST', '/hosts/activate', agencyStatus, body => assert.deepEqual(plain(body), { agencyCode: 'BINZO7K9Q2M8X4R' }));
  assert.equal((await api.joinAgency('BINZO7K9Q2M8X4R')).isVerifiedHost, false, 'Agency membership cannot become creator approval');
  await assert.rejects(api.verifyAgencyCode('!bad'), /joining code/);
  await assert.rejects(api.joinAgency('BINZO7K9Q2M'), /public agency ID/, 'A common agency ID cannot activate host membership');
  expect('POST', '/hosts/verify-agency-code', { ...agencyStatus, joiningCode: null, codeType: 'agency', canJoin: false, eligible: false, requirements: ['Ask for your individual host joining code'] }, body => assert.deepEqual(plain(body), { agencyCode: 'BINZO7K9Q2M' }));
  const commonPreview = await api.verifyAgencyCode('binzo7k9q2m');
  assert.equal(commonPreview.canJoin, false); assert.equal(commonPreview.joiningCode, null);
  expect('GET', '/hosts/agency', { ...agencyStatus, agency: null, nextStep: 'agency' });
  await assert.rejects(api.submitVerification({ name: 'Riya', bio: 'I love music and meeting people.', langs: ['English'] }), /Join your agency/);
  expect('GET', '/hosts/agency', agencyStatus);
  expect('POST', '/hosts/application', { status: 'pending' }, body => assert.deepEqual(plain(body), { displayName: 'Riya', bio: 'I love music and meeting people.', languages: ['English'] }));
  assert.equal((await api.submitVerification({ name: 'Riya', bio: 'I love music and meeting people.', langs: ['English'] })).status, 'pending');
  expect('GET', '/hosts/agency', { ...agencyStatus, requirements: 'untrusted' });
  await assert.rejects(api.hostAgency(), /agency details/);
  for (const invalid of [{ joiningCode: 'BINZO7K9Q2M' }, { joiningCode: ['BINZO7K9Q2M8X4R'] }, { canJoin: 'true' }, { codeType: 'trusted-client' }, { codeType: ['host-invite'] }]) {
    expect('GET', '/hosts/agency', { ...agencyStatus, ...invalid });
    await assert.rejects(api.hostAgency(), /agency details/);
  }
  const media = load('src/api/uploads.ts');
  const invitation = { id: 'invite-1', source: 'automatic', label: 'Automatic call invitation', host: { id: 'real-host', name: 'Asha', city: 'Pune' }, kind: 'video', coinsPerMinute: 60, entryFeeCoins: 10, requiredCoins: 70, affordable: false, expiresAt: new Date(Date.now() + 600000).toISOString(), status: 'pending' };
  expect('POST', '/calls/automatic-invitation', invitation, body => assert.deepEqual(plain(body), {}));
  assert.deepEqual(plain(await api.automaticCallInvitation()), invitation);
  expect('GET', '/calls/automatic-invitation/active', null, body => assert.equal(body, undefined));
  assert.equal(await api.automaticCallInvitation(true), null, 'Disabled or unavailable suggestions are a valid quiet result');
  for (const invalid of [{ source: 'host' }, { label: 'Host is calling' }, { requiredCoins: 60 }, { coinsPerMinute: -1 }, { coinsPerMinute: 1000001 }, { affordable: 'true' }]) {
    expect('POST', '/calls/automatic-invitation', { ...invitation, ...invalid });
    await assert.rejects(api.automaticCallInvitation(), /could not be verified/);
  }
  const invitationCall = { _id: 'call-invite', calleeId: 'real-host', source: 'automatic', automaticInvitationId: 'invite-1', status: 'ringing', coinsPerMinute: 60, entryFeeCoins: 10 };
  expect('POST', '/calls/automatic-invitation/invite-1/connect', invitationCall, body => assert.deepEqual(plain(body), { expectedCoinsPerMinute: 60, expectedEntryFeeCoins: 10 }, 'Only the explicitly displayed quote reaches the dedicated endpoint'));
  const connectedInvitation = await api.connectAutomaticInvitation('invite-1', 60, 10);
  assert.equal(connectedInvitation.callId, 'call-invite'); assert.equal(connectedInvitation.connected, false); assert.equal(connectedInvitation.source, 'automatic');
  expect('POST', '/calls/automatic-invitation/invite-1/connect', { ...invitationCall, status: 'accepted' });
  assert.equal((await api.connectAutomaticInvitation('invite-1', 60, 10)).connected, true, 'A durable accepted replay resumes the same real call');
  expect('POST', '/calls/automatic-invitation/invite-1/connect', { ...invitationCall, status: 'ended' });
  await assert.rejects(api.connectAutomaticInvitation('invite-1', 60, 10), error => error.code === 'INVITATION_CALL_ENDED', 'A terminal replay must never start another call');
  expect('POST', '/calls/automatic-invitation/invite-1/connect', { ...invitationCall, entryFeeCoins: 11 });
  await assert.rejects(api.connectAutomaticInvitation('invite-1', 60, 10), error => error.code === 'CALL_PRICE_CHANGED');
  for (const bad of [{ automaticInvitationId: 'other' }, { source: 'manual' }, { hostInitiated: true }]) {
    expect('POST', '/calls/automatic-invitation/invite-1/connect', { ...invitationCall, ...bad });
    await assert.rejects(api.connectAutomaticInvitation('invite-1', 60, 10), /connected safely/);
  }
  await assert.rejects(api.connectAutomaticInvitation('invite-1', 1000001, 0), /current call price/);
  expect('POST', '/calls/automatic-invitation/invite-1/dismiss', { ...invitation, status: 'dismissed' }, body => assert.deepEqual(plain(body), {}));
  assert.equal((await api.dismissAutomaticInvitation('invite-1')).status, 'dismissed');
  const held = { _id: 'real-incoming', status: 'ringing', hostInitiated: true, waitingForTopup: true, topupHoldStartedAt: new Date().toISOString(), topupHoldUntil: new Date(Date.now() + 300000).toISOString() };
  expect('POST', '/calls/real-incoming/topup-hold', held, body => assert.deepEqual(plain(body), {}));
  assert.deepEqual(plain(await api.holdIncomingForTopup('real-incoming')), { callId: 'real-incoming', until: held.topupHoldUntil });
  for (const bad of [{ _id: 'other' }, { status: 'ended' }, { hostInitiated: false }, { waitingForTopup: false }, { topupHoldUntil: new Date(Date.now() + 301000).toISOString() }]) {
    expect('POST', '/calls/real-incoming/topup-hold', { ...held, ...bad });
    await assert.rejects(api.holdIncomingForTopup('real-incoming'), /cannot be held/);
  }
  expect('GET', '/calls/real-incoming', { ...held, expiresAt: held.topupHoldUntil, coinsPerMinute: 60 });
  assert.equal((await api.reviewIncomingTopup('real-incoming')).ringing, true);
  expect('GET', '/calls/real-incoming', { ...held, status: 'ended', expiresAt: held.topupHoldUntil });
  assert.equal((await api.reviewIncomingTopup('real-incoming')).ringing, false, 'Payment return review checks the real call instead of accepting it');
  const separateHostImages=adapters.hostFrom({_id:'image-host',coverUrl:'https://cdn.example.test/cover.jpg',creatorCardUrl:'https://cdn.example.test/card.jpg'});
  assert.equal(separateHostImages.coverUrl,'https://cdn.example.test/cover.jpg');
  assert.equal(separateHostImages.creatorCardUrl,'https://cdn.example.test/card.jpg','Discovery keeps the card separate from the profile cover');
  assert.equal('creatorCardUrl' in adapters.hostFrom({_id:'partial-host',coverUrl:'https://cdn.example.test/cover.jpg'}),false,'Partial profile updates cannot clear a known discovery card');
  const reacted = adapters.postFrom({ _id: 'p1', mediaUrl: 'https://media.example.test/p.jpg', kind: 'photo', caption: 'Hi', likes: 3.7, comments: -2, liked: true });
  assert.deepEqual([reacted.likes, reacted.comments, reacted.liked], [3, 0, true], 'Post reactions are whole, non-negative counts');
  assert.equal('likes' in adapters.postFrom({ _id: 'p2', mediaUrl: 'https://media.example.test/p.jpg', kind: 'photo' }), false, 'Posts without reactions stay without them');
  assert.deepEqual(plain(adapters.commentFrom({ _id: 'c1', text: 'Lovely', createdAt: '2026-10-29T09:00:00.000Z', userId: { _id: 'u1', name: 'Asha', avatar: { url: 'https://media.example.test/a.jpg' } } })),
    { id: 'c1', text: 'Lovely', createdAt: '2026-10-29T09:00:00.000Z', user: { id: 'u1', name: 'Asha', avatarUrl: 'https://media.example.test/a.jpg' } });
  assert.throws(() => adapters.commentFrom({ _id: 'c2' }), /comment could not be loaded/);
  assert.deepEqual(plain(phonePayload('+91 98765 43210')), { country_code: '+91', phone: '9876543210' });
  assert.throws(() => phonePayload('+91 5467985456'), /Indian/, 'India keeps its mobile number check');
  assert.deepEqual(plain(phonePayload('+14155550123', '+1')), { country_code: '+1', phone: '4155550123' });
  assert.deepEqual(plain(phonePayload('+4407911123456', '+44')), { country_code: '+44', phone: '7911123456' }, 'A kept trunk 0 is dropped');
  assert.deepEqual(plain(phonePayload('+971501234567', '+971')), { country_code: '+971', phone: '501234567' });
  assert.throws(() => phonePayload('+14155550123'), /country code/, 'Other countries need the chosen calling code');
  assert.throws(() => phonePayload('+14155550123', '+44'), /country code/);
  assert.throws(() => phonePayload('+1415', '+1'), /valid mobile/);
  expect('POST', '/auth/otp/request', { expiresIn: 300, retryAfterSeconds: 75 }, (body, options) => {
    assert.deepEqual(plain(body), { country_code: '+91', phone: '9876543210' }); assert.equal(options.auth, false);
  });
  const legacyOtp = await api.sendOtp('+919876543210', 'host');
  assert.equal(legacyOtp.resendAfter, 75);
  assert.equal(legacyOtp.otpLength, 6, 'Older servers retain six-digit input');
  for (const otpLength of [4, 5, 6, 7, 8]) {
    expect('POST', '/auth/otp/request', { expiresIn: 60, resendAfter: 60, otpLength });
    assert.equal((await api.sendOtp('+919876543210')).otpLength, otpLength);
  }
  for (const otpLength of [3, 9, 4.5, '4', null]) {
    expect('POST', '/auth/otp/request', { expiresIn: 60, otpLength });
    assert.equal((await api.sendOtp('+919876543210')).otpLength, 6, 'Malformed server lengths cannot create arbitrary input counts');
  }
  expect('POST', '/auth/otp/request', { expiresIn: 300, resendAfter: 30 }, body => {
    assert.deepEqual(plain(body), { country_code: '+44', phone: '7911123456' }, 'Other countries post their own calling code');
  });
  assert.equal((await api.sendOtp('+447911123456', 'sender', '+44')).resendAfter, 30);
  expect('POST', '/auth/otp/verify', { user, tokens: { accessToken: 'access', refreshToken: 'refresh', expiresIn: 900, refreshExpiresIn: 3600 }, isNewUser: true, requiresOnboarding: true }, (body, options) => {
    assert.deepEqual(plain(body), { country_code: '+91', phone: '9876543210', otp: '123456', client: 'native' }); assert.equal(options.auth, false);
  });
  const signedIn = await api.verifyOtp('+919876543210', '123456', 'host', true);
  assert.equal(signedIn.user.role, 'sender'); assert.equal(signedIn.tokens.refreshToken, 'refresh');
  assert.equal(signedIn.balance, undefined); assert.equal(signedIn.earned, undefined); assert.equal(signedIn.requiresOnboarding, true);
  for (const code of ['0123', '01234567']) {
    expect('POST', '/auth/otp/verify', { user, tokens: { accessToken: 'access', refreshToken: 'refresh', expiresIn: 900, refreshExpiresIn: 3600 }, isNewUser: false, requiresOnboarding: false }, body => {
      assert.equal(body.otp, code, 'Provider OTP length and leading zeroes survive the native API');
    });
    await api.verifyOtp('+919876543210', code, 'sender', false);
  }
  for (const status of ['none', 'pending', 'rejected', 'suspended']) assert.equal(adapters.accountFrom({ user: { ...user, role: 'host', hostStatus: status, isVerifiedHost: true } }).user.role, 'sender');
  for (const status of ['none', 'pending', 'rejected', 'suspended']) assert.equal(adapters.accountFrom({ user: { ...user, role: 'host', hostStatus: status } }).user.serverRole, 'host', 'Presentation role must not grant an unapproved host member chat permissions');
  assert.equal(adapters.accountFrom({ user: { ...user, role: 'user', hostStatus: 'pending' } }).user.serverRole, 'user', 'A member applying to host remains a member until approved');
  assert.equal(adapters.accountFrom({ user: { ...user, role: 'host', hostStatus: 'approved', isVerifiedHost: true } }).user.role, 'host');
  assert.equal(adapters.accountFrom({ user: { ...user, role: 'host', hostStatus: 'approved', isVerifiedHost: true } }).user.isVerifiedHost, true);
  assert.equal(adapters.accountFrom({ user: { ...user, role: 'host', hostStatus: 'approved' } }).user.isVerifiedHost, false);
  for (const code of ['123', '123456789', '12a4', '12 4']) await assert.rejects(api.verifyOtp('9876543210', code, 'sender', false), /verification code/);
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
  const committedProfile = { ...updatedUser, role: 'user', onboardingStatus: 'completed', name: 'Saved Name', bio: '', city: '', country: 'India', gender: 'undisclosed' };
  expect('PATCH', '/profile', committedProfile, body => assert.deepEqual(plain(body), { name: 'Saved Name', bio: '', city: '', country: 'India', gender: 'undisclosed' }));
  const committed = await api.saveProfile({ name: 'Saved Name', about: '', city: '', country: ' India ', gender: 'undisclosed' });
  assert.equal(committed.user.name, 'Saved Name'); assert.equal(committed.user.about, ''); assert.equal(committed.user.city, ''); assert.equal(committed.user.country, 'India');
  assert.equal(requests.length, 1, 'A committed profile remains a successful save without a second network request'); finished();
  reset();
  await assert.rejects(api.saveProfile({ name: 'Asha', country: 'x'.repeat(101) }), /country/);
  assert.equal(requests.length, 0);

  reset();
  let releaseProfileWrite;
  expect('PATCH', '/profile', new Promise(resolve => { releaseProfileWrite = resolve; }), body => assert.equal(body.name, 'Earlier Choice'));
  expect('PATCH', '/profile', { ...committedProfile, name: 'Latest Choice' }, body => assert.equal(body.name, 'Latest Choice'));
  const earlierProfile = api.saveProfile({ name: 'Earlier Choice' }), latestProfile = api.saveProfile({ name: 'Latest Choice' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 1, 'A later edit cannot race ahead of an earlier pending profile upload/write');
  releaseProfileWrite({ ...committedProfile, name: 'Earlier Choice' });
  await earlierProfile;
  assert.equal((await latestProfile).user.name, 'Latest Choice'); finished();

  reset();
  expect('GET', '/auth/me', { user: { ...user, role:'host', hostStatus:'pending', isVerifiedHost:false } });
  await assert.rejects(api.createPost(png, 'Hello'), /Verify your account/);
  assert.equal(uploads.length, 0, 'A pending host cannot bypass publishing access'); finished();
  reset();
  const memberPost={_id:'sender-post',mediaKey:'posts/member-id/sender.png',mediaUrl:'https://cdn.example.test/sender.png',kind:'photo',caption:'Hello'};
  expect('GET', '/auth/me', { user });
  expect('POST','/media/upload-url',{uploadUrl:'https://storage.example.test/member-post',key:memberPost.mediaKey},body=>assert.equal(body.purpose,'post'));
  expect('POST','/posts',memberPost,body=>assert.equal(body.kind,'photo'));
  assert.equal((await api.createPost(png,'Hello')).id,'sender-post','Sender photos use the confirmed upload and publication path');finished();
  expect('DELETE','/posts/sender-post',{});await api.deletePost('sender-post');finished();
  expect('POST','/account/deactivate',{deactivated:true},body=>assert.deepEqual(plain(body),{confirmed:true}));await api.deactivateAccount();finished();
  const connections={items:[{user:{_id:'follower-id',name:'Mira',role:'host',hostStatus:'approved',isVerifiedHost:true,isFollowing:true,canViewProfile:true,avatar:{url:'https://cdn.example.test/mira.jpg'}}}],total:21,page:2,limit:20};
  expect('GET','/users/member-id/followers?page=2&limit=20',connections);
  const followers=await api.relationships('followers',2);
  assert.equal(followers.users[0].id,'follower-id');assert.equal(followers.users[0].following,true);assert.equal(followers.users[0].canViewProfile,true);assert.equal(followers.page,2);finished();
  expect('GET','/users/member-id/following?page=1&limit=20',{items:[{user:{_id:'unnamed-id',name:null}}],total:1,page:1,limit:20});
  const following=await api.relationships('following');assert.equal(following.users[0].name,'BinzoLive member');assert.equal(following.users[0].canViewProfile,false);finished();
  for(const invalid of [{...connections,total:-1},{...connections,page:0},{...connections,limit:0},{...connections,items:[{user:{name:'Missing ID'}}]}])assert.throws(()=>adapters.relationshipsFrom(invalid,'followers'),/connections could not be loaded/);
  reset();
  const imageOwner={...user,role:'host',hostStatus:'approved',isVerifiedHost:true,onboardingStatus:'completed',coverKey:'covers/member-id/profile.png',coverUrl:'https://cdn.example.test/profile-cover.png'};
  let independentImages=imageOwner;
  for(const file of ['card','updated-card']){
    reset();
    const key=`creator-cards/member-id/${file}.png`,url=`https://cdn.example.test/${file}.png`;
    independentImages={...independentImages,creatorCardKey:key,creatorCardUrl:url};
    expect('POST','/media/upload-url',{uploadUrl:`https://storage.example.test/${file}`,key},body=>assert.equal(body.purpose,'creator-card'));
    expect('PATCH','/profile',independentImages,body=>assert.deepEqual(plain(body),{creatorCardKey:key}));
    const card=await api.saveCreatorCard(png);
    assert.equal(card.user.creatorCardUrl,url);
    assert.equal(card.user.creatorCardKey,key);
    assert.equal(card.user.coverUrl,imageOwner.coverUrl,'Adding or replacing a card preserves the profile cover');
    assert.equal(card.user.coverKey,imageOwner.coverKey);
    assert.equal(uploads.length,1);finished();
  }
  reset();
  const newCoverKey='covers/member-id/independent.png',newCoverUrl='https://cdn.example.test/independent-cover.png';
  independentImages={...independentImages,coverKey:newCoverKey,coverUrl:newCoverUrl};
  expect('POST','/media/upload-url',{uploadUrl:'https://storage.example.test/independent-cover',key:newCoverKey},body=>assert.equal(body.purpose,'cover'));
  expect('PATCH','/profile',independentImages,body=>assert.deepEqual(plain(body),{coverKey:newCoverKey}));
  const independentlyCovered=await api.saveCoverPhoto(png);
  assert.equal(independentlyCovered.user.coverUrl,newCoverUrl);
  assert.equal(independentlyCovered.user.creatorCardUrl,independentImages.creatorCardUrl,'Changing the profile cover preserves the creator card');
  assert.equal(independentlyCovered.user.creatorCardKey,independentImages.creatorCardKey);finished();
  expect('GET','/auth/me',{user:independentImages});
  const reloadedImages=(await api.me(true)).user;
  assert.equal(reloadedImages.coverUrl,newCoverUrl,'The profile cover survives an account reload');
  assert.equal(reloadedImages.creatorCardUrl,independentImages.creatorCardUrl,'The separate card survives an account reload');finished();
  reset();
  expect('POST','/media/upload-url',{uploadUrl:'https://storage.example.test/member-cover',key:'covers/member-id/new.png'},body=>assert.equal(body.purpose,'cover'));
  expect('PATCH','/profile',{},body=>assert.deepEqual(plain(body),{coverKey:'covers/member-id/new.png'}));
  expect('GET','/auth/me',{user:{...user,coverUrl:'https://cdn.example.test/new-cover.png'}});
  const covered=await api.saveCoverPhoto(png);
  assert.equal(covered.user.role,'sender','A member can change their cover without becoming a host');
  assert.equal(covered.user.coverUrl,'https://cdn.example.test/new-cover.png');
  assert.equal(uploads.length,1);finished();
  reset();
  await assert.rejects(api.saveCoverPhoto('https://cdn.example.test/remote.png'),/Choose a JPEG/);
  assert.equal(requests.length,0,'Remote URLs never enter the cover upload flow');
  uploadError=new Error('Connection dropped');
  expect('POST','/media/upload-url',{uploadUrl:'https://storage.example.test/member-cover',key:'covers/member-id/failure.png'});
  await assert.rejects(api.saveCoverPhoto(png),/could not be uploaded/);
  assert.equal(requests.length,1,'A failed upload never patches the account');finished();
  reset();
  expect('POST','/media/upload-url',{uploadUrl:'https://storage.example.test/stale-cover',key:'covers/member-id/stale.png'},undefined,{run:()=>{version++;}});
  await assert.rejects(api.saveCoverPhoto(png),/sign-in changed/);
  assert.equal(uploads.length,0,'A session change after signing the upload prevents PUT and profile mutation');finished();
  reset();
  let finishFirstCoverRead;
  const firstCoverRead=new Promise(resolve=>{finishFirstCoverRead=resolve});
  expect('POST','/media/upload-url',{uploadUrl:'https://storage.example.test/first-cover',key:'covers/member-id/first.png'});
  expect('PATCH','/profile',{},body=>assert.deepEqual(plain(body),{coverKey:'covers/member-id/first.png'}));
  expect('GET','/auth/me',firstCoverRead);
  expect('POST','/media/upload-url',{uploadUrl:'https://storage.example.test/second-cover',key:'covers/member-id/second.png'});
  expect('PATCH','/profile',{},body=>assert.deepEqual(plain(body),{coverKey:'covers/member-id/second.png'}));
  expect('GET','/auth/me',{user:{...user,coverUrl:'https://cdn.example.test/second-cover.png'}});
  const firstCoverSave=api.saveCoverPhoto(png),secondCoverSave=api.saveCoverPhoto(png);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests.length,3,'Concurrent cover choices serialize through the fresh account read');
  finishFirstCoverRead({user:{...user,coverUrl:'https://cdn.example.test/first-cover.png'}});
  await firstCoverSave;
  assert.equal((await secondCoverSave).user.coverUrl,'https://cdn.example.test/second-cover.png');finished();
  reset();
  const approvedUser = { ...updatedUser, role: 'host', hostStatus: 'approved', isVerifiedHost: true };
  const newPost = { _id: 'new-post', mediaKey: 'posts/member-id/new.png', mediaUrl: 'https://cdn.example.test/post.png', kind: 'photo', caption: 'Hello' };
  expect('GET', '/auth/me', { user: approvedUser });
  expect('POST', '/media/upload-url', { uploadUrl: 'https://storage.example.test/post', key: newPost.mediaKey }, body => assert.equal(body.purpose, 'post'));
  expect('POST', '/posts', newPost, body => assert.deepEqual(plain(body), { caption: 'Hello', kind: 'photo', mediaKey: newPost.mediaKey }));
  assert.equal((await api.createPost(png, ' Hello ')).mediaUrl, newPost.mediaUrl);
  assert.equal(uploads.length, 1); finished();
  reset();
  expect('POST','/chats/activity',{},body=>assert.deepEqual(plain(body),{with:'host-id',active:true}));await api.setChatActivity('host-id',true);
  expect('POST','/chats/host-id',{_id:'ordered-text',text:'Hello',createdAt:'2026-10-30T10:00:00Z',sequence:12},body=>assert.deepEqual(plain(body),{text:'Hello',clientId:'text-client-1'}));
  const textReceipt=await api.sendMessage('host-id','Hello',undefined,undefined,'text-client-1');assert.equal(textReceipt.sequence,12);assert.equal(textReceipt.createdAt,'2026-10-30T10:00:00Z');
  expect('POST','/media/upload-url',{uploadUrl:'https://storage.example.test/retry-photo',key:'chats/member-id/retry.png'});
  expect('POST','/chats/host-id',null,body=>assert.deepEqual(plain(body),{imageKey:'chats/member-id/retry.png',clientId:'photo-client-1'}),{error:new ApiError('Lost send response',503)});
  await assert.rejects(api.sendPhotoMessage('host-id',png,undefined,'photo-client-1'),/Lost send response/);
  expect('POST','/chats/host-id',{_id:'ordered-photo',createdAt:'2026-10-30T10:00:01Z',sequence:13},body=>assert.deepEqual(plain(body),{imageKey:'chats/member-id/retry.png',clientId:'photo-client-1'}));
  assert.equal((await api.sendPhotoMessage('host-id',png,undefined,'photo-client-1')).sequence,13);assert.equal(uploads.length,1,'An uncertain photo retry reuses its uploaded key and original client ID');
  await assert.rejects(api.sendPhotoMessage('other-host',png,undefined,'photo-client-1'),/earlier send/);finished();reset();
  expect('GET', '/users/member-id/posts', { items: [newPost] });
  assert.equal((await api.myPosts()).posts[0].id, 'new-post'); finished();
  reset();
  expect('GET', '/auth/me', { user: approvedUser });
  expect('POST', '/media/upload-url', { uploadUrl: 'https://storage.example.test/post', key: newPost.mediaKey }, undefined, { run: () => version++ });
  await assert.rejects(api.createPost(png, 'Hello'), /sign-in changed/);
  assert.equal(uploads.length, 0, 'A sign-in change cancels post upload and publication'); finished();

  reset();
  expect('POST', '/media/upload-url', { uploadUrl: 'https://storage.example.test/chat', key: 'chats/member-id/photo.png' }, body => assert.equal(body.purpose, 'chat'));
  expect('POST', '/chats/host-id', { _id: 'photo-message', text: '', image: { url: 'https://cdn.example.test/chat.png' } }, body => assert.deepEqual(plain(body), { imageKey: 'chats/member-id/photo.png' }));
  assert.deepEqual(plain(await api.sendPhotoMessage('host-id', png)), { id: 'photo-message', reply: null });
  assert.equal(uploads.length, 1, 'Chat photos go straight to storage, then only the key is sent'); finished();
  reset();
  expect('POST', '/media/upload-url', { uploadUrl: 'https://storage.example.test/chat-reply', key: 'chats/member-id/reply.png' }, body => assert.equal(body.purpose, 'chat'));
  expect('POST', '/chats/host-id', {
    _id: 'photo-reply', senderId: 'member-id', text: '', image: { url: 'https://cdn.example.test/chat-reply.png' },
    reply: { id: 'question-1', senderId: 'host-id', text: '', image: false, deleted: true },
  }, body => assert.deepEqual(plain(body), { imageKey: 'chats/member-id/reply.png', replyTo: 'question-1' }));
  assert.deepEqual(plain(await api.sendPhotoMessage('host-id', png, 'question-1')), {
    id: 'photo-reply', reply: { id: 'question-1', mine: false, text: '', image: false, deleted: true },
  }, 'A photo keeps its reply target and the authoritative deletion state returned after upload');
  assert.equal(uploads.length, 1); finished();
  const photoThread = adapters.messagesFrom({ items: [{ _id: 'photo-message', senderId: 'host-id', text: '', image: { url: 'https://cdn.example.test/chat.png' } }] }, 'member-id').messages[0];
  assert.deepEqual([photoThread.kind, photoThread.imageUrl], ['image', 'https://cdn.example.test/chat.png']);
  assert.equal(adapters.chatsFrom({ items: [{ participants: [{ _id: 'host-id', name: 'Creator' }], lastMessage: { text: '', kind: 'image' } }] }, 'member-id').chats[0].lastKind, 'image');

  for (const [mime, bytes, header] of [
    ['audio/webm', voiceBytes, 'audio/webm;codecs=opus'],
    ['audio/ogg', Buffer.from([79,103,103,83,0,1,2,3]), 'audio/ogg;codecs=opus'],
    ['audio/mp4', Buffer.from([0,0,0,24,102,116,121,112,77,52,65,32]), 'audio/mp4;codecs=mp4a.40.2'],
  ]) {
    const decoded = media.decodeAudio(`data:${header};base64,${bytes.toString('base64')}`);
    assert.equal(decoded.contentType, mime, 'Recorder codecs are removed from the canonical upload MIME');
    assert.deepEqual(Buffer.from(decoded.bytes), bytes);
  }
  for (const audio of ['https://example.test/audio.webm', 'data:audio/wav;base64,AAAA', 'data:audio/webm;base64,', 'data:audio/webm;base64,AAAA=', 'data:audio/webm;base64,AA!A', 'data:audio/webm;codecs=h264;base64,AAAA', png.replace('image/png', 'audio/webm'), 'data:audio/mp4;base64,AAAAAA==']) {
    assert.throws(() => media.decodeAudio(audio), /voice|recording/, 'Invalid or mismatched recording bytes cannot be uploaded');
  }
  const oversizedVoice = 'data:audio/webm;base64,' + Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64');
  assert.throws(() => media.decodeAudio(oversizedVoice), /5 MB/);

  reset();
  expect('GET', '/chats/host-id/messages/photo-id/photo', { url: 'https://cdn.example.test/chat/photo.png' });
  assert.equal(await api.chatPhotoUrl('host-id', 'photo-id'), 'https://cdn.example.test/chat/photo.png');
  expect('GET', '/chats/host%2Fid/messages/photo%2Fid/photo', { url: 'https://cdn.example.test/chat/photo.png' });
  await api.chatPhotoUrl('host/id', 'photo/id');
  for (const unsafe of [undefined, 'http://cdn.example.test/photo.png', 'file:///private/photo.png', 'https://user:secret@cdn.example.test/photo.png', 'https://cdn.example.test/photo.png#fragment', 'https://cdn.example.test\\@evil.test/photo.png', 'https://[broken']) {
    expect('GET', '/chats/host-id/messages/photo-id/photo', { url: unsafe });
    await assert.rejects(api.chatPhotoUrl('host-id', 'photo-id'), /secure download/);
  }
  expect('GET', '/chats/host-id/messages/photo-id/photo', undefined, undefined, { error: new ApiError('Photo no longer available', 404) });
  await assert.rejects(api.chatPhotoUrl('host-id', 'photo-id'), error => error.status === 404);
  expect('GET', '/chats/host-id/messages/photo-id/photo', { url: 'https://cdn.example.test/chat/photo.png' }, undefined, { run: () => version++ });
  await assert.rejects(api.chatPhotoUrl('host-id', 'photo-id'), /sign-in changed/);

  const voiceDto = { _id: 'voice-message', senderId: 'member-id', recipientId: 'host-id', text: '', kind: 'voice', createdAt: '2026-10-21T09:00:00.000Z',
    audio: { key: 'chat-audio/member-id/clip.webm', url: 'https://cdn.example.test/clip.webm', mimeType: 'audio/webm', durationMs: 2300 },
    reply: { id: 'earlier-voice', senderId: 'host-id', text: '', image: false, voice: true, deleted: false } };
  expect('POST', '/media/upload-url', { uploadUrl: 'https://storage.example.test/clip?signature=temporary', key: voiceDto.audio.key }, body => assert.deepEqual(plain(body), { purpose: 'chat-audio', contentType: 'audio/webm', contentLength: voiceBytes.length }));
  expect('POST', '/chats/host-id', voiceDto, body => assert.deepEqual(plain(body), { audioKey: voiceDto.audio.key, durationMs: 2300, clientId: 'voice-attempt-1', replyTo: 'earlier-voice' }));
  const sentVoice = await api.sendVoiceMessage('host-id', voice, 2300, 'voice-attempt-1', 'earlier-voice');
  assert.equal(sentVoice.kind, 'voice'); assert.equal(sentVoice.audioUrl, voiceDto.audio.url); assert.equal(sentVoice.durationMs, 2300); assert.equal(sentVoice.mine, true);
  assert.deepEqual(plain(sentVoice.reply), { id: 'earlier-voice', mine: false, text: '', image: false, voice: true, deleted: false });
  assert.equal(uploads.length, 1); assert.equal(uploads[0].options.headers['Content-Type'], 'audio/webm');
  assert.equal(uploads[0].options.credentials, 'omit'); assert.equal(uploads[0].options.redirect, 'error');
  assert.equal(uploads[0].options.headers.Authorization, undefined); assert.deepEqual(Buffer.from(uploads[0].options.body), voiceBytes);
  finished();
  const voiceHistory = adapters.messagesFrom({ items: [voiceDto] }, 'member-id').messages[0];
  assert.deepEqual(plain(voiceHistory), plain(sentVoice), 'Voice send and history use the same representation');
  assert.equal(adapters.chatsFrom({ items: [{ participants: [{ _id: 'host-id' }], lastMessage: { text: '', kind: 'voice' } }] }, 'member-id').chats[0].lastKind, 'voice');

  reset();
  expect('POST', '/media/upload-url', { uploadUrl: 'https://storage.example.test/retry.webm', key: voiceDto.audio.key });
  expect('POST', '/chats/host-id', undefined, undefined, { error: new ApiError('Connection lost after send', 0) });
  await assert.rejects(api.sendVoiceMessage('host-id', voice, 2300, 'voice-retry-1'), /Connection lost/);
  expect('POST', '/chats/host-id', voiceDto, body => assert.deepEqual(plain(body), { audioKey: voiceDto.audio.key, durationMs: 2300, clientId: 'voice-retry-1' }));
  assert.equal((await api.sendVoiceMessage('host-id', voice, 2300, 'voice-retry-1')).id, 'voice-message');
  assert.equal(uploads.length, 1, 'A retry reuses the uploaded object and server idempotency ID'); finished();
  expect('POST', '/chats/host-id', { ...voiceDto, audio: undefined, text: '', deletedAt: '2026-10-21T09:01:00.000Z' }, body => assert.equal(body.clientId, 'voice-retry-1'));
  const deletedVoice = await api.sendVoiceMessage('host-id', voice, 2300, 'voice-retry-1');
  assert.equal(deletedVoice.id, voiceDto._id); assert.equal(deletedVoice.deleted, true); assert.equal(deletedVoice.audioUrl, undefined);
  assert.equal(uploads.length, 1, 'A replay of a deleted successful send resolves to its tombstone without another upload'); finished();
  await assert.rejects(api.sendVoiceMessage('another-host', voice, 2300, 'voice-retry-1'), /earlier send/);
  await assert.rejects(api.sendVoiceMessage('host-id', voice, 2400, 'voice-retry-1'), /earlier send/);

  reset();
  for (const duration of [0, 499, 120001, 1000.5, NaN, '1000']) await assert.rejects(api.sendVoiceMessage('host-id', voice, duration, 'voice-invalid-duration'), /half a second/);
  for (const clientId of ['', undefined, '../other', 'x'.repeat(129)]) await assert.rejects(api.sendVoiceMessage('host-id', voice, 1000, clientId), /Record a new/);
  await assert.rejects(api.sendVoiceMessage('host-id', png, 1000, 'voice-invalid-audio'), /voice message/);
  assert.equal(requests.length, 0, 'Invalid voice data fails before signing or uploading');
  expect('POST', '/media/upload-url', { uploadUrl: 'https://storage.example.test/failed.webm', key: voiceDto.audio.key });
  uploadError = new Error('offline');
  await assert.rejects(api.sendVoiceMessage('host-id', voice, 1000, 'voice-upload-failed'), /Check your connection/);
  assert.equal(requests.length, 1, 'Upload failure cannot create a message'); finished();
  reset();
  expect('POST', '/media/upload-url', { uploadUrl: 'http://public.example.test/clip.webm', key: voiceDto.audio.key });
  await assert.rejects(api.sendVoiceMessage('host-id', voice, 1000, 'voice-insecure-upload'), /secure connection/);
  assert.equal(uploads.length, 0); finished();
  reset();
  expect('POST', '/media/upload-url', { uploadUrl: 'https://storage.example.test/retired.webm', key: voiceDto.audio.key }, undefined, { run: () => version++ });
  await assert.rejects(api.sendVoiceMessage('host-id', voice, 1000, 'voice-retired-session'), /sign-in changed/);
  assert.equal(uploads.length, 0, 'A session change during signing cancels upload and message creation'); finished();
  reset();
  expect('POST', '/media/upload-url', { uploadUrl: 'https://storage.example.test/next-session.webm', key: 'chat-audio/member-id/next.webm' });
  expect('POST', '/chats/host-id', voiceDto, body => assert.equal(body.audioKey, 'chat-audio/member-id/next.webm'));
  await api.sendVoiceMessage('host-id', voice, 2300, 'voice-retry-1');
  assert.equal(uploads.length, 1, 'Cached upload keys do not cross session versions'); finished();

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
  assert.equal(adapters.hostFrom({ _id: 'h', previewVideoUrl: 'https://media.example.test/v.mp4' }).previewVideoUrl, 'https://media.example.test/v.mp4');
  assert.equal(adapters.hostFrom({ _id: 'h', previewVideoUrl: 'http://media.example.test/v.mp4' }).previewVideoUrl, null, 'Only secure video addresses reach the cards');
  assert.equal(adapters.hostFrom({ _id: 'h', previewVideoUrl: null }).previewVideoUrl, null);
  assert.equal('previewVideoUrl' in adapters.hostFrom({ _id: 'h' }), false, 'Feeds without videos never clear a known one');
  const restricted = adapters.messagesFrom({ items: [], canSend: false, sendDisabledReason: 'Wait for this member to reply.' }, 'host-id');
  assert.equal(restricted.canSend, false); assert.equal(restricted.sendDisabledReason, 'Wait for this member to reply.');
  const restrictedInbox = adapters.chatsFrom({ items: [{ participants: [{ _id: 'host-id' }, { _id: 'member-id', role: 'user' }], automatedOnly: true, canSend: false }] }, 'host-id');
  assert.equal(restrictedInbox.chats[0].canSend, false); assert.equal(restrictedInbox.chats[0].automatedOnly, true);
  expect('GET', '/calls?limit=100', { items: [{ callerId: { _id: 'host-id' }, calleeId: { _id: 'member-id' }, status: 'missed', kind: 'audio' }, { callerId: 'member-id', calleeId: 'host-id', status: 'missed' }] });
  const missed = await api.missedCalls(); assert.equal(missed.calls.length, 1); assert.equal(missed.calls[0].kind, 'voice');
  // Call history keeps voice/video, who placed the call and how it ended, from this account's side.
  expect('GET', '/calls?limit=100', { items: [
    { callerId: { _id: 'member-id' }, calleeId: { _id: 'host-id', name: 'Mira' }, status: 'ended', kind: 'video', durationSeconds: 125, coins: 120, createdAt: chatAt },
    { callerId: { _id: 'host-id', name: 'Mira' }, calleeId: { _id: 'member-id' }, status: 'missed', kind: 'audio', createdAt: chatAt },
    { callerId: { _id: 'host-id', name: 'Mira' }, calleeId: 'member-id', status: 'paused' }] });
  const history = await api.callHistory();
  assert.deepEqual(plain(history.calls.map(call => [call.user.id, call.direction, call.kind, call.status ?? null, call.duration, call.coins ?? null, call.at ?? null])), [
    ['host-id', 'outgoing', 'video', 'ended', '2:05', 120, chatAt],
    ['host-id', 'incoming', 'voice', 'missed', '0:00', null, chatAt],
    ['host-id', 'incoming', 'video', null, '0:00', null, null]], 'Unknown statuses and missing times are left out');
  expect('GET', '/wallet', { coins: 200, earningsPaise: 12345, reservedPaise: 2000 });
  const wallet = await api.wallet(); assert.equal(wallet.earningsPaise, 12345); assert.equal(wallet.earned, undefined);
  assert.throws(() => adapters.walletFrom({ coins: '200', earningsPaise: 0 }), /wallet/);
  assert.equal(wallet.minimumWithdrawalPaise, undefined, 'An older wallet response does not invent a withdrawal minimum');
  assert.equal(wallet.withdrawalsEnabled, false, 'Missing payout capability cannot enable withdrawals');
  expect('GET', '/wallet', { coins: 200, earningsPaise: 123450, reservedPaise: 2000, minimumWithdrawalPaise: 50000, withdrawalsEnabled: true });
  assert.deepEqual(plain(await api.wallet()), { coins: 200, earningsPaise: 123450, reservedPaise: 2000, minimumWithdrawalPaise: 50000, withdrawalsEnabled: true });
  const invalidPayoutConfig = adapters.walletFrom({ coins: 0, earningsPaise: 100, minimumWithdrawalPaise: 1.5, withdrawalsEnabled: 'true' });
  assert.equal(invalidPayoutConfig.minimumWithdrawalPaise, undefined); assert.equal(invalidPayoutConfig.withdrawalsEnabled, false);
  const payoutDto = { _id: 'payout-id', amountPaise: 50000, payoutAddress: 'creator@upi', status: 'paid', createdAt: '2026-10-22T08:00:00.000Z', reason: 'Reviewed', payoutReference: 'bank-reference', userId: 'private-owner' };
  const payoutReceipt = { id: 'payout-id', amountPaise: 50000, payoutAddress: 'creator@upi', status: 'paid', createdAt: payoutDto.createdAt, reason: 'Reviewed', payoutReference: 'bank-reference' };
  expect('GET', '/wallet/withdrawals?page=2&limit=20', { items: [payoutDto], total: 21, page: 2, limit: 20 });
  assert.deepEqual(plain(await api.payouts(2)), { items: [payoutReceipt], total: 21, page: 2, limit: 20 }, 'History maps the actual payout receipt without leaking server metadata');
  expect('GET', '/wallet/withdrawals?page=1&limit=20', { items: [], total: 0, page: 1, limit: 20 });
  assert.equal((await api.payouts()).page, 1);
  const payoutBody = { amountPaise: 50000, payoutAddress: 'creator@upi', idempotencyKey: 'withdrawal-attempt-1' };
  expect('POST', '/wallet/withdraw', payoutDto, body => assert.deepEqual(plain(body), payoutBody));
  assert.deepEqual(plain(await api.requestPayout(50000, '  creator@upi  ', payoutBody.idempotencyKey)), payoutReceipt, 'Submission trims the destination and returns its receipt independently from wallet refresh');
  for (const patch of [{ amountPaise: '50000' }, { amountPaise: 1.5 }, { amountPaise: -1 }, { amountPaise: 100000001 }, { _id: '' }, { status: 'complete' }, { payoutAddress: '' }, { createdAt: 'not-a-date' }]) {
    expect('POST', '/wallet/withdraw', { ...payoutDto, ...patch });
    await assert.rejects(api.requestPayout(50000, 'creator@upi', payoutBody.idempotencyKey), /withdrawal/i, 'Malformed payout confirmation stays unconfirmed');
  }
  expect('GET', '/wallet/withdrawals?page=1&limit=20', { items: [{ ...payoutDto, status: 'unknown' }], total: 1, page: 1, limit: 20 });
  await assert.rejects(api.payouts(), /withdrawal/i, 'History also validates returned payout records');
  finished();
  expect('POST', '/calls', { _id: 'call-id' }, body => assert.deepEqual(plain(body), { calleeId: 'host-id', kind: 'audio' }));
  assert.equal((await api.startCall('host-id', true)).callId, 'call-id');
  expect('POST', '/calls/call-id/end', {}); await api.declineCall('call-id');
  expect('POST', '/chats/host-id', {}, body => assert.deepEqual(plain(body), { text: 'Hello' })); assert.equal((await api.sendMessage('host-id', 'Hello')).reply, null);
  expect('POST', '/chats/host-id', {}, body => assert.deepEqual(plain(body), { text: 'Hello in our call', callId: 'accepted-call' })); await api.sendMessage('host-id', 'Hello in our call', 'accepted-call');
  expect('POST', '/chats/host-id', { _id: 'text-reply', senderId: 'member-id', text: 'Delivered words', reply: { id: 'question-1', senderId: 'host-id', text: 'Updated question', image: false, deleted: false } },
    body => assert.deepEqual(plain(body), { text: 'Original words', replyTo: 'question-1' }));
  assert.deepEqual(plain(await api.sendMessage('host-id', 'Original words', undefined, 'question-1')), {
    id: 'text-reply', text: 'Delivered words', reply: { id: 'question-1', mine: false, text: 'Updated question', image: false, deleted: false },
  }, 'Sending returns both moderated message text and the current server quote');
  expect('POST', '/chats/host-id', { _id: 'own-photo-reply', senderId: 'member-id', text: 'My photo', reply: { id: 'own-photo', senderId: 'member-id', text: '', image: true, deleted: false } },
    body => assert.deepEqual(plain(body), { text: 'My photo', callId: 'accepted-call', replyTo: 'own-photo' }));
  assert.deepEqual(plain((await api.sendMessage('host-id', 'My photo', 'accepted-call', 'own-photo')).reply), {
    id: 'own-photo', mine: true, text: '', image: true, deleted: false,
  }, 'A reply to the sender\'s own photo keeps its ownership and photo label');
  expect('POST', '/users/host-id/follow', { following: true }, body => assert.deepEqual(plain(body), { following: true })); assert.equal((await api.follow('host-id', true)).following, true);
  expect('POST', '/users/host-id/follow', {}); await assert.rejects(api.follow('host-id', true), /could not be confirmed/, 'Follow needs an explicit acknowledgement');

  const publicHost = { _id: 'host-id', name: 'Aster', role: 'host', hostStatus: 'approved', isPhoneVerified: true,
    bio: 'Live music and conversation', avatar: { url: 'https://cdn.example.test/avatar.jpg' }, coverUrl: 'https://cdn.example.test/cover.jpg',
    city: 'Pune', followers: 42, following: 3, isFollowing: true, level: 4, crown: false, createdAt: '2026-01-01T00:00:00.000Z',
    languages: ['English', 'Hindi'], interests: ['Music'], category: 'Music', callRateCoinsPerMinute: 35, isOnline: true, availableForCall: true, stream: null };
  expect('GET', '/users/host-id', publicHost);
  const publicProfile = await api.publicProfile('host-id');
  assert.equal(publicProfile.id, 'host-id'); assert.equal(publicProfile.followingCount, 3); assert.equal(publicProfile.followers, 42); assert.equal(publicProfile.following, true);
  assert.equal(publicProfile.role, 'host'); assert.equal(publicProfile.serverRole, 'host'); assert.equal(publicProfile.verified, true);
  assert.equal(publicProfile.joined, publicHost.createdAt); assert.equal(publicProfile.ratePerMin, 35); assert.equal(publicProfile.availableForCall, true);
  assert.deepEqual(plain(publicProfile.interests), ['Music']);
  assert.equal(adapters.publicProfileFrom({ ...publicHost, isVerifiedHost: false }).verified, false, 'Explicit server approval overrides legacy verification');
  assert.equal(adapters.publicProfileFrom({ ...publicHost, role: 'user', isVerifiedHost: true }).verified, false, 'A member never gains creator authority');
  for (const invalid of [{ ...publicHost, followers: undefined }, { ...publicHost, following: -1 }, { ...publicHost, isFollowing: undefined }]) assert.throws(() => adapters.publicProfileFrom(invalid), /could not be loaded/, 'Missing counts never become invented zeroes');
  expect('GET', '/users/different-id', publicHost); await assert.rejects(api.publicProfile('different-id'), /could not be loaded/, 'A mismatched target profile is refused');
  expect('GET', '/users/host-id/posts?page=2&limit=12', { items: [{ _id: 'post-id', kind: 'photo', mediaUrl: 'https://cdn.example.test/post.jpg', caption: 'A song for today' }], total: 13, page: 2, limit: 12 });
  const publicPosts = await api.publicPosts('host-id', 2);
  assert.equal(publicPosts.posts[0].caption, 'A song for today'); assert.equal(publicPosts.total, 13); assert.equal(publicPosts.page, 2);
  assert.throws(() => adapters.publicPostsFrom({ items: [], total: undefined, page: 1, limit: 12 }), /could not be loaded/);
  finished();
  reset();
  await assert.rejects(api.sendGift('host-id','Rose',10), /No coins were spent/);
  assert.equal(requests.length, 0, 'Legacy money flows cannot debit or fake success');

  const creator = { _id: 'creator-id', name: 'Asha Live', avatar: { url: 'https://cdn.example.test/host.jpg' }, isVerifiedHost: true, isOnline: true, availableForCall: true, callRateCoinsPerMinute: 0,
    stream: { _id: 'stream-id', title: 'Acoustic night', category: 'Music', kind: 'video', viewers: 12 } };
  expect('GET', '/home?category=Music&page=2&limit=20', { items: [creator], stage: [creator], featured: creator, total: 21, page: 2, limit: 20, categories: ['Music'], broadcasterCount: 5, availableCount: 3, speedMatchEnabled: true, unreadNotifications: 4,
    bonus: { _id: 'mission-id', title: 'Creator bonus', target: 10, progress: 5, rewardCoins: 200, claimed: false } });
  const home = await api.home({ category: 'Music', page: 2 });
  assert.equal(home.hosts[0].ratePerMin, 0, 'Free calls must not invent a per-minute charge');
  assert.equal(home.hosts[0].stream.hostId, creator._id); assert.equal(home.hosts[0].verified, true);
  assert.equal(home.availableCount, 3); assert.equal(home.bonus.progress, 5); assert.equal(home.unreadCount, 4);
  expect('GET', '/home?mode=online&page=2&limit=20', { items: [{ ...creator, stream: null, availableForCall: false }], stage: [], featured: null, total: 21, page: 2, limit: 20 });
  const onlineHome = await api.home({ mode: 'online', page: 2 });
  assert.equal(onlineHome.total, 21); assert.equal(onlineHome.page, 2);
  assert.equal(onlineHome.hosts[0].online, true); assert.equal(onlineHome.hosts[0].availableForCall, false);
  assert.equal(onlineHome.hosts[0].live, false, 'Home eligibility is independent from call or streaming availability');
  expect('GET', '/home?mode=following&page=2&limit=20', { items: [creator], stage: [], featured: creator, total: 22, page: 2, limit: 20 });
  const followingHome = await api.home({ mode: 'following', page: 2 });
  assert.equal(followingHome.hosts[0].id, creator._id); assert.equal(followingHome.total, 22); assert.equal(followingHome.page, 2);
  expect('GET', '/home?mode=following&page=1&limit=20', { items: [], stage: [], featured: null, total: 0, page: 1, limit: 20 });
  const noFollows = await api.home({ mode: 'following', page: 1 });
  assert.deepEqual(plain(noFollows.hosts), []); assert.equal(noFollows.featured, null); assert.equal(noFollows.total, 0);
  expect('GET', '/home/match?category=Music', { host: creator });
  assert.equal((await api.matchHost('Music')).host.id, creator._id);
  expect('PATCH', '/safety', { onlineForCalls: false, allowRequests: false, showActivity: false, discoverable: true }, body => assert.deepEqual(plain(body), { onlineForCalls: false, allowRequests: false, showActivity: false, discoverable: true }));
  assert.deepEqual(plain(await api.setPresence(false, true)), { online: false, visible: true });
  expect('PATCH', '/safety', { allowRequests: false, showActivity: true, discoverable: true });
  assert.equal((await api.setPresence(true, true)).online, false, 'Presence acknowledges effective server permission, not the requested optimistic toggle');
  expect('GET', '/safety', { onlineForCalls: false, allowRequests: true, showActivity: true, discoverable: true });
  assert.equal((await api.presence()).online, false, 'An explicit saved Offline choice wins over legacy safety defaults');
  expect('GET', '/safety', { onlineForCalls: true, allowRequests: true, showActivity: true, discoverable: true });
  assert.equal((await api.presence()).online, true, 'Saved Online availability restores on app startup');
  const serverSettings = {
    profile: { id: 'member-id', name: 'Asha', bio: 'Acoustic music', city: 'Pune', languages: ['English', 'Hindi'], maskedPhone: '+91 ••••••3210', countryCode: '+91', isPhoneVerified: true, createdAt: chatAt, phone: '9876543210', role: 'host', isVerifiedHost: true },
    stats: { fans: 42, following: 8, giftsSent: 5, giftsReceived: 12, coinsSent: 300, coinsReceived: 950 },
    standing: { level: 4, crown: true },
    preferences: { pushNotifications: true, matchCategory: 'Music', appearance: 'system' },
    privacy: { discoverable: true, showActivity: false, allowRequests: false },
    categories: ['Music', 'Gaming'], capabilities: { pushNotifications: true, liveAlerts: false, interfaceLanguages: ['en'], currency: 'INR' },
  };
  expect('GET', '/account/settings', serverSettings);
  const settings = await api.profileSettings();
  assert.deepEqual(plain(settings.standing), { level: 4, crown: true }); assert.deepEqual(plain(adapters.profileSettingsFrom({ ...serverSettings, standing: undefined }).standing), { level: 0, crown: false }, 'An older server reports no level or crown rather than fabricated ones');
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
  const noteSince = '2026-10-01T00:00:00.000Z';
  expect('GET', `/notifications?limit=20&page=2&q=event%20%26%20music&status=unread&audience=personal&since=${encodeURIComponent(noteSince)}&sort=oldest`, {
    items: [{ _id: 'personal-note', userId: 'member-id', title: 'Event', body: 'A personal update', read: false, createdAt: noteSince }],
    total: 21, unreadCount: 25, totalCount: 40, page: 2, limit: 20,
  });
  const filteredNotes = await api.notifications({ page: 2, q: 'event & music', status: 'unread', audience: 'personal', since: noteSince, sort: 'oldest' });
  assert.deepEqual(plain(filteredNotes), { items: [{ id: 'personal-note', title: 'Event', body: 'A personal update', read: false, createdAt: noteSince, audience: 'personal' }], total: 21, unreadCount: 25, totalCount: 40, page: 2, limit: 20 });
  assert.equal(adapters.notificationsFrom({ items: [{ _id: 'global-note', userId: null }] }).items[0].audience, 'announcements');
  const noteBefore = '2026-10-02T00:00:00.000Z';
  expect('GET', `/notifications?limit=20&since=${encodeURIComponent(noteSince)}&before=${encodeURIComponent(noteBefore)}`, { items: [], total: 0, totalCount: 40, unreadCount: 25, page: 1, limit: 20 });
  assert.equal((await api.notifications({ since: noteSince, before: noteBefore })).items.length, 0, 'A bounded date tab sends its inclusive start and exclusive end to the API');
  expect('GET', `/notifications?limit=20&before=${encodeURIComponent(noteSince)}`, { items: [], total: 0, totalCount: 40, unreadCount: 25, page: 1, limit: 20 });
  await api.notifications({ before: noteSince });
  for (const input of [{ ids: ['note-id'], read: false }, { all: true, read: true }]) {
    expect('POST', '/notifications/read', { count: 1, unreadCount: 3, totalCount: 5 }, body => assert.deepEqual(plain(body), input));
    assert.deepEqual(plain(await api.updateNotificationRead(input)), { count: 1, unreadCount: 3, totalCount: 5 });
  }
  for (const response of [{}, { count: 1, unreadCount: -1, totalCount: 5 }, { count: 1, unreadCount: 6, totalCount: 5 }]) assert.throws(() => adapters.notificationReadFrom(response), /notification status could not be confirmed/);
  const giftId = '0123456789abcdef01234567', packId = '1123456789abcdef01234567';
  expect('GET', '/gifts?limit=100', { items: [{ _id: giftId, name: 'Rose', emoji: 'rose', coins: 25 }] });
  expect('GET', '/coins/packs', { items: [{ _id: packId, name: 'Starter', coins: 100, pricePaise: 9900, bonusPercent: 100, badge: 'hot' }], paymentsAvailable: true });
  const catalog = await api.catalog(); assert.equal(catalog.gifts[0].id, giftId); assert.equal(catalog.packs[0].pricePaise, 9900); assert.equal(catalog.paymentsAvailable, true);
  assert.equal(catalog.packs[0].bonusPercent,100,'The catalog retains an authoritative purchase bonus');
  assert.equal(catalog.packs[0].badge,'hot','The catalog retains a supported promotion badge');
  for(const bonusPercent of [1,125,1000])assert.equal(adapters.catalogFrom({items:[]},{items:[{_id:packId,name:'Pack',coins:200,pricePaise:9899,bonusPercent}]}).packs[0].bonusPercent,bonusPercent,'Bounded positive integer bonus metadata is retained');
  for(const badge of ['hot','popular'])assert.equal(adapters.catalogFrom({items:[]},{items:[{_id:packId,name:'Pack',coins:200,pricePaise:9899,badge}]}).packs[0].badge,badge);
  for(const metadata of [{bonusPercent:0},{bonusPercent:-1},{bonusPercent:1001},{bonusPercent:12.5},{bonusPercent:'150'},{bonusPercent:null},{badge:'featured'},{badge:'<img src=x onerror=alert(1)>'},{badge:100}]){
    const pack=adapters.catalogFrom({items:[]},{items:[{_id:packId,name:'Pack',coins:200,pricePaise:9899,...metadata}]}).packs[0];
    assert.equal(pack.bonusPercent,undefined,'Invalid promotional percentages are omitted, not coerced into claims');
    assert.equal(pack.badge,undefined,'Unsupported or injected badges are omitted');
  }
  const ordinaryPack=adapters.catalogFrom({items:[]},{items:[{_id:packId,name:'Starter',coins:200,pricePaise:9899}]}).packs[0];
  assert.equal(ordinaryPack.bonusPercent,undefined,'An ordinary catalog pack receives no invented bonus');
  assert.equal(ordinaryPack.badge,undefined,'An ordinary catalog pack receives no invented popularity badge');
  expect('POST', '/gifts/send', { _id: 'transfer-id', coins: 25 }, body => { assert.deepEqual(plain(body), { recipientId: 'creator-id', giftId, quantity: 1, streamId: 'stream-id', idempotencyKey: 'gift-attempt-1' }); assert.equal(body.coins, undefined, 'Price must come from the server catalog'); });
  assert.deepEqual(plain(await api.sendGift('creator-id', giftId, 1, undefined, 'stream-id', 'gift-attempt-1')), { id: 'transfer-id', coins: 25 }, 'A committed gift returns its server receipt without depending on a second network request');
  const chatGift = { giftId, transferId: 'direct-transfer', name: 'Golden Rose', emoji: 'rose', mediaUrl: 'https://cdn.example.test/gifts/golden-rose.svg', coins: 25, quantity: 1 };
  const giftMessage = { _id: 'direct-gift-message', senderId: 'member-id', recipientId: 'creator-id', text: '', kind: 'gift', gift: chatGift, sequence: 15, createdAt: chatAt, automated: false };
  const normalizedGift = adapters.messageFrom(giftMessage, 'member-id');
  const timedGiftMessage = { ...giftMessage, gift: { ...chatGift, durationMs: 6400 } };
  const timedGift = adapters.messageFrom(timedGiftMessage, 'member-id');
  assert.equal(timedGift.gift.durationMs, 6400); assert.equal(timedGift.durationMs, undefined, 'Animation timing stays inside the gift snapshot, separate from voice duration');
  const timedCatalog = adapters.catalogFrom({ items: [{ _id: giftId, name: 'Golden Rose', coins: 25, media: { url: chatGift.mediaUrl, durationMs: 6400 } }] }, { items: [] });
  assert.equal(timedCatalog.gifts[0].durationMs, 6400, 'Catalog gifts retain the original media timing');
  assert.equal(Object.hasOwn(adapters.messageFrom(giftMessage, 'member-id').gift, 'durationMs'), false, 'Legacy snapshots do not receive invented timing');
  for (const durationMs of [-1, 1.5, Infinity, NaN, '6400', null, true]) {
    assert.equal(Object.hasOwn(adapters.messageFrom({ ...giftMessage, gift: { ...chatGift, durationMs } }, 'member-id').gift, 'durationMs'), false);
    assert.equal(Object.hasOwn(adapters.catalogFrom({ items: [{ _id: giftId, coins: 25, media: { durationMs } }] }, { items: [] }).gifts[0], 'durationMs'), false);
  }
  assert.equal(adapters.chatGiftFrom({ ...chatGift, durationMs: 0 }).durationMs, 0, 'Zero metadata remains explicit for the playback layer to handle');
  assert.equal(normalizedGift.kind, 'gift'); assert.equal(normalizedGift.mine, true); assert.equal(normalizedGift.sequence, 15); assert.deepEqual(plain(normalizedGift.gift), chatGift);
  assert.equal(adapters.messageFrom(giftMessage, 'creator-id').mine, false, 'The same durable receipt is incoming for its actual recipient');
  assert.equal(adapters.messageFrom({ ...giftMessage, gift: { ...chatGift, mediaUrl: 'javascript:alert(1)' } }, 'member-id').gift.mediaUrl, '', 'Unsafe gift artwork is never rendered, while the genuine receipt amount stays intact');
  assert.equal(adapters.messageFrom({ ...giftMessage, gift: { ...chatGift, coins: '25000' } }, 'member-id').gift, undefined, 'Invalid historical prices receive no fabricated replacement');
  const anchoredGift = { ...giftMessage, _id: 'historical-gift', sequence: undefined, orderAfterSequence: 15 };
  const giftHistory = adapters.messagesFrom({ items: [{ _id: 'human-after-gift', sequence: 16, createdAt: chatAt }, anchoredGift, giftMessage] }, 'member-id').messages;
  assert.deepEqual(plain(giftHistory.map(row => row.id)), ['direct-gift-message', 'historical-gift', 'human-after-gift'], 'Backfilled gift receipts keep their server sequence anchor');
  const giftPreview = adapters.chatsFrom({ items: [{ participants: [{ _id: 'creator-id', name: 'Creator' }], lastMessage: anchoredGift }] }, 'member-id').chats[0];
  assert.equal(giftPreview.lastKind, 'gift'); assert.equal(giftPreview.last, 'Golden Rose'); assert.equal(giftPreview.lastOrderAfterSequence, 15);
  expect('POST', '/gifts/send', { _id: 'direct-transfer', coins: 25, message: giftMessage }, body => assert.equal(body.coins, undefined));
  assert.deepEqual(plain((await api.sendGift('creator-id', giftId, 999999, undefined, undefined, 'direct-gift-attempt')).message), plain(normalizedGift), 'Gift confirmations expose the committed message instead of reconstructing a bubble from the current catalog');
  expect('POST', '/gifts/send', { _id: 'direct-transfer', coins: 25, message: giftMessage });
  assert.equal((await api.sendGift('creator-id', giftId, 999999, undefined, undefined, 'direct-gift-attempt')).message.id, 'direct-gift-message', 'A replay returns the same canonical message ID');
  expect('POST', '/gifts/send', { _id: 'stream-transfer', coins: 25, message: null });
  assert.equal((await api.sendGift('creator-id', giftId, 1, undefined, 'stream-id', 'stream-gift-attempt')).message, null, 'Stream gifts do not create direct-chat receipts');
  expect('POST', '/gifts/send', { _id: 'direct-transfer', giftId, coins: 25, quantity: 1, message: timedGiftMessage });
  const timedReceipt = await api.sendGift('creator-id', giftId, 1, undefined, undefined, 'timed-gift-attempt');
  assert.equal(timedReceipt.message.gift.durationMs, 6400); assert.equal(timedReceipt.giftDetails.durationMs, 6400); assert.equal(timedReceipt.giftDetails.transferId, 'direct-transfer');
  expect('POST', '/gifts/send', { _id: 'stream-transfer', giftId, coins: 25, quantity: 1, giftSnapshot: { name: chatGift.name, emoji: chatGift.emoji, mediaUrl: chatGift.mediaUrl, durationMs: 6400 }, message: null });
  const timedStreamReceipt = await api.sendGift('creator-id', giftId, 1, undefined, 'stream-id', 'timed-stream-attempt');
  assert.equal(timedStreamReceipt.giftDetails.durationMs, 6400, 'Stream confirmations retain transfer timing even without a direct-chat message');
  const freeGift = { ...chatGift, transferId: 'free-transfer', coins: 0, durationMs: 6400 };
  const freeMessage = { ...giftMessage, _id: 'free-gift-message', gift: freeGift };
  const freeCatalog = adapters.catalogFrom({ items: [{ _id: giftId, name: 'Free Rose', coins: 0, media: { url: chatGift.mediaUrl, durationMs: 6400 } }, ...[-1, 1.5, '0', null, undefined, NaN, Infinity].map(coins => ({ _id: 'invalid-price', name: 'Malformed gift', coins }))] }, { items: [] });
  assert.equal(freeCatalog.gifts.length, 1, 'Invalid or missing prices never turn into free catalog gifts');
  assert.equal(freeCatalog.gifts[0].coins, 0); assert.equal(freeCatalog.gifts[0].durationMs, 6400);
  assert.equal(adapters.messageFrom(freeMessage, 'member-id').gift.coins, 0, 'Historical zero-cost gifts remain zero rather than falling back to a paid catalog price');
  const beforeFreeRequests = requests.length;
  expect('POST', '/gifts/send', { _id: 'free-transfer', giftId, coins: 0, quantity: 1, message: freeMessage }, body => assert.deepEqual(plain(body), { recipientId: 'creator-id', giftId, quantity: 1, idempotencyKey: 'free-gift-attempt' }));
  const freeReceipt = await api.sendGift('creator-id', giftId, 0, undefined, undefined, 'free-gift-attempt');
  assert.equal(freeReceipt.coins, 0); assert.equal(freeReceipt.message.gift.coins, 0); assert.equal(freeReceipt.giftDetails.coins, 0); assert.equal(freeReceipt.giftDetails.durationMs, 6400);
  assert.equal(requests.length - beforeFreeRequests, 1, 'A free gift requires no balance lookup or wallet side effect');
  expect('POST', '/gifts/send', { _id: 'paid-transfer', coins: 25 }, body => assert.equal(body.coins, undefined));
  assert.equal((await api.sendGift('creator-id', giftId, 0, undefined, undefined, 'paid-gift-client-zero')).coins, 25, 'Forged zero client metadata never changes the server price of a paid gift');
  expect('POST', '/gifts/send', { _id: 'invalid-free', coins: '0' });
  await assert.rejects(api.sendGift('creator-id', giftId, 0, undefined, undefined, 'invalid-zero-receipt'), /confirmation could not be read/);
  expect('POST', '/gifts/send', {});
  await assert.rejects(api.sendGift('creator-id', giftId, 1, undefined, undefined, 'gift-attempt-2'), /confirmation could not be read/, 'Malformed confirmation remains retryable with the same key');
  expect('POST', '/missions/mission-id/claim', {}); expect('GET', '/wallet', { coins: 275, earningsPaise: 0 });
  assert.equal((await api.claimAward('mission-id')).coins, 275);
  expect('POST', '/coins/purchase', { _id: 'purchase-id', merchantOrderId: 'binzolive_order', status: 'created', paymentUrl: 'https://checkout.example.test/pay', packId, coins: 100, amountPaise: 9900, payableAmountPaise: 10000, expiresAt: '2026-10-20T12:00:00.000Z', idempotencyKey: 'payment-attempt-1' }, body => assert.deepEqual(plain(body), { packId, idempotencyKey: 'payment-attempt-1' }));
  const checkout = await api.checkout(packId, 'payment-attempt-1');
  assert.equal(checkout.status, 'PENDING'); assert.equal(checkout.packId, packId); assert.equal(checkout.coins, 100); assert.equal(checkout.amountPaise, 9900); assert.equal(checkout.payableAmountPaise, 10000); assert.equal(checkout.idempotencyKey, 'payment-attempt-1'); assert.equal(checkout.expiresAt, '2026-10-20T12:00:00.000Z');
  const route = { route: 'UPI_INTENT', pageStyle: 'INTENT', upiIntent: true, takingPayments: true, currency: 'INR' };
  const routes = { mode: 'SINGLE', routeChoice: true, routes: [route, { ...route, route: 'DISABLED', takingPayments: false }, { ...route, route: 'USD_METHOD', currency: 'USD' }] };
  expect('GET', '/payments/routes', routes);
  assert.deepEqual(plain(await api.paymentRoutes()), { mode: 'SINGLE', routeChoice: true, routes: [route] }, 'Only enabled INR routes reach the selector');
  assert.equal(adapters.paymentRoutesFrom({ mode: 'ROTATION', routeChoice: false, routes: [route] }).routeChoice, false, 'Rotation can expose route metadata without offering manual selection');
  for (const invalid of [{ ...routes, mode: 'random' }, { ...routes, routeChoice: 'true' }, { ...routes, routes: [route, route] }, ...[
    { route: 'https://evil.test' }, { pageStyle: '<script>' }, { upiIntent: 1 }, { takingPayments: 'true' }, { currency: null },
  ].map(patch => ({ ...routes, routes: [{ ...route, ...patch }] }))]) assert.throws(() => adapters.paymentRoutesFrom(invalid), /Payment methods/);
  const routedOrder = { _id: 'routed-purchase', merchantOrderId: 'routed_order', status: 'pending', requestedRoute: 'UPI_INTENT', route: 'UPI_INTENT', pageStyle: 'INTENT', currency: 'INR' };
  expect('POST', '/coins/purchase', routedOrder, body => assert.deepEqual(plain(body), { packId, idempotencyKey: 'routed-attempt-1', route: 'UPI_INTENT' }));
  const routedCheckout = await api.checkout(packId, 'routed-attempt-1', 'UPI_INTENT');
  assert.equal(routedCheckout.requestedRoute, 'UPI_INTENT'); assert.equal(routedCheckout.pageStyle, 'INTENT'); assert.equal(routedCheckout.currency, 'INR');
  expect('POST', '/themes/premium/purchase', { ...routedOrder, kind: 'premium' }, body => assert.deepEqual(plain(body), { idempotencyKey: 'premium-route-1', route: 'UPI_INTENT' }));
  assert.equal((await api.checkoutPremium('premium-route-1', 'UPI_INTENT')).route, 'UPI_INTENT');
  expect('POST', '/coins/purchase', { ...routedOrder, requestedRoute: undefined }, body => assert.deepEqual(plain(body), { packId, idempotencyKey: 'automatic-route-1' }));
  const automaticCheckout = await api.checkout(packId, 'automatic-route-1');
  assert.equal(automaticCheckout.requestedRoute, undefined, 'A provider-selected route never becomes a manually requested route'); assert.equal(automaticCheckout.route, 'UPI_INTENT');
  const requestsBeforeInvalidRoutes = requests.length;
  assert.equal(adapters.validPaymentRoute('upi-intent_2'), true, 'Provider route tokens need not be uppercase');
  for (const invalid of ['', 'upi route', '../UPI', 'A'.repeat(101)]) {
    await assert.rejects(api.checkout(packId, 'valid-attempt-1', invalid), /valid payment method/);
    await assert.rejects(api.checkoutPremium('valid-attempt-1', invalid), /valid payment method/);
  }
  assert.equal(requests.length, requestsBeforeInvalidRoutes, 'Malformed methods never reach checkout HTTP calls');
  for (const paymentUrl of ['https://user:secret@checkout.example.test/pay', 'https://checkout.example.test\n.evil.test/pay', 'http://checkout.example.test/pay', 'javascript:steal()']) assert.throws(() => adapters.purchaseFrom({ paymentUrl }), /secure payment/);
  for (const patch of [{ requestedRoute: '../UPI' }, { route: 'UPI<>' }, { pageStyle: 'x'.repeat(101) }, { currency: 'USD' }]) assert.throws(() => adapters.purchaseFrom({ ...routedOrder, ...patch }), /payment method|currency/);
  expect('POST', '/coins/purchase/verify', { _id: 'purchase-id', merchantOrderId: 'binzolive_order', status: 'paid' });
  assert.equal((await api.verifyPurchase('binzolive_order')).status, 'SUCCESS');
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
    { type: 'call_charge', coins: -150, amountPaise: 0 },
    { type: 'call_earning', coins: 0, amountPaise: 3000 },
    { type: 'welcome_bonus', coins: 100, amountPaise: 0 },
  ] }).items;
  assert.deepEqual(transactions.slice(6).map(tx => [tx.kind, tx.coins]), [['call', -150], ['call', 0], ['reward', 100]], 'Call charges and welcome coins are labelled');
  assert.equal(transactions[0].displayAmountPaise, -19950); assert.equal(transactions[0].amountPaise, 19950);
  assert.equal(transactions[1].displayAmountPaise, 19950); assert.equal(transactions[1].amountPaise, -19950);
  assert.deepEqual(transactions.slice(2, 6).map(tx => tx.displayAmountPaise), [undefined, undefined, undefined, undefined]);
  assert.deepEqual(transactions.slice(0, 6).map(tx => tx.coins), [0, 0, 100, -100, -25, 0]);
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
  const heldUntil = new Date(Date.now() + 300000).toISOString();
  socket.emitServer('call:updated', { _id: 'held-host-outgoing', callerId: 'member-id', calleeId: 'peer-member', status: 'ringing', waitingForTopup: true, topupHoldUntil: heldUntil });
  assert.deepEqual(plain(events.at(-1)), { type: 'call.topup.waiting', data: { callId: 'held-host-outgoing', until: heldUntil } }, 'The caller receives a waiting update without a new incoming ring');
  const beforeUnrelatedHold = events.length;
  socket.emitServer('call:updated', { _id: 'unrelated-hold', callerId: 'stranger-a', calleeId: 'stranger-b', status: 'ringing', waitingForTopup: true, topupHoldUntil: heldUntil });
  assert.equal(events.length, beforeUnrelatedHold, 'Unrelated top-up metadata never reaches this account');
  socket.emitServer('chat:message',{_id:'other-device-human',senderId:'member-id',recipientId:'host-id',text:'My other device',clientId:'text-client-2',sequence:14,createdAt:chatAt});
  const senderEcho=events.filter(event=>event.type==='chat.updated').at(-1);assert.equal(senderEcho.data.message.mine,true);assert.equal(senderEcho.data.message.sequence,14);assert.equal(senderEcho.data.message.clientId,'text-client-2');
  socket.emitServer('chat:message', { _id: 'incoming-photo-reply', senderId: 'host-id', recipientId: 'member-id', text: '', image: { url: 'https://cdn.example.test/reply.png' }, reply: { id: 'own-question', senderId: 'member-id', text: 'Your question', image: false, deleted: false } });
  const incomingPhotoReply = events.filter(event => event.type === 'chat.message').at(-1).data;
  assert.equal(incomingPhotoReply.kind, 'image'); assert.equal(incomingPhotoReply.imageUrl, 'https://cdn.example.test/reply.png');
  assert.deepEqual(plain(incomingPhotoReply.reply), { id: 'own-question', mine: true, text: 'Your question', image: false, deleted: false }, 'Incoming photo replies use the same quote format as send confirmations');
  socket.emitServer('chat:message', { ...voiceDto, senderId: 'host-id', recipientId: 'member-id' });
  const incomingVoice = events.filter(event => event.type === 'chat.message').at(-1).data;
  assert.equal(incomingVoice.kind, 'voice'); assert.equal(incomingVoice.audioUrl, voiceDto.audio.url); assert.equal(incomingVoice.durationMs, 2300); assert.equal(incomingVoice.reply.voice, true);
  socket.emitServer('chat:message', { _id: 'call-message', senderId: 'host-id', recipientId: 'member-id', text: 'Call message', callId: 'accepted-call', inCall: true });
  const callMessage=events.filter(event=>event.type==='chat.message').at(-1);assert.equal(callMessage.data.callId,'accepted-call');assert.equal(callMessage.data.inCall,true);
  const receivedGift={_id:'gift-delivery',senderId:'host-id',recipientId:'member-id',streamId:'stream-id',giftId:'catalog-gift',giftName:'Diamond Crown',coins:250,senderName:'Asha Live',emoji:'💎',mediaUrl:'https://cdn.example.test/crown.png',senderAvatarUrl:'https://cdn.example.test/asha.png'};
  socket.emitServer('gift:received',receivedGift);
  const giftEvent=events.filter(event=>event.type==='gift.received').at(-1);
  assert.deepEqual(plain(giftEvent.data),{gift:'Diamond Crown',coins:250,from:'host-id',id:'gift-delivery',streamId:'stream-id',giftId:'catalog-gift',giftName:'Diamond Crown',senderName:'Asha Live',emoji:'💎',mediaUrl:'https://cdn.example.test/crown.png',senderAvatarUrl:'https://cdn.example.test/asha.png'});
  socket.emitServer('gift:received', { ...receivedGift, durationMs: 6400 });
  assert.equal(events.filter(event => event.type === 'gift.received').at(-1).data.durationMs, 6400);
  socket.emitServer('gift:received', { ...receivedGift, durationMs: -10 });
  assert.equal(Object.hasOwn(events.filter(event => event.type === 'gift.received').at(-1).data, 'durationMs'), false);
  const walletRefreshesBeforeFree = events.filter(event => event.type === 'wallet.refresh').length;
  socket.emitServer('gift:received', { ...receivedGift, _id: 'free-live-transfer', coins: 0, durationMs: 6400 });
  const freeIncoming = events.filter(event => event.type === 'gift.received').at(-1).data;
  assert.equal(freeIncoming.id, 'free-live-transfer'); assert.equal(freeIncoming.coins, 0); assert.equal(freeIncoming.durationMs, 6400);
  assert.equal(events.filter(event => event.type === 'wallet.refresh').length, walletRefreshesBeforeFree, 'Receiving a free gift does not request an unchanged wallet');
  const giftCount=events.filter(event=>event.type==='gift.received').length;
  socket.emitServer('gift:received',{...receivedGift,recipientId:'other-user'});assert.equal(events.filter(event=>event.type==='gift.received').length,giftCount,'Unrelated gift events do not reach the room');
  socket.emitServer('account:updated', {}); assert.equal(events.at(-1).type, 'account.updated');
  socket.emitServer('profile:updated', { name: 'Untrusted socket name' }); assert.deepEqual(plain(events.at(-1)), { type: 'profile.updated', data: {} }, 'Profile sockets invalidate identity without accepting private account fields');
  for (const event of ['notification:new', 'notifications:read']) {
    const beforeNotification = events.length;
    socket.emitServer(event, { userId: 'member-id', title: 'Socket data does not populate the inbox', unreadCount: 900 });
    assert.deepEqual(plain(events.slice(beforeNotification)), [{ type: 'notifications.changed', data: {} }, { type: 'official.changed', data: {} }, { type: 'chats.updated', data: {} }, ...(event === 'notification:new' ? [{ type: 'home.updated', data: {} }] : [])], 'Notification socket signals refresh the inbox, official conversation and chat list without trusting payload counts or text');
  }
  socket.emitServer('call:updated', { _id: 'paid-call', callerId: 'member-id', calleeId: 'host-id', status: 'accepted', kind: 'video', coinsPerMinute: 60 });
  assert.deepEqual(plain(events.at(-1)), { type: 'call.connected', data: { callId: 'paid-call', initiator: true, peerId: 'host-id', voice: false, rate: 60 } }, 'A paid call carries its price');
  socket.emitServer('call:updated', { _id: 'paid-call', callerId: 'member-id', calleeId: 'host-id', status: 'ended', coinsPerMinute: 60, coinsCharged: 150, endReason: 'out_of_coins' });
  assert.deepEqual(plain(events.at(-1)), { type: 'call.ended', data: { callId: 'paid-call', coins: 150, reason: 'out_of_coins' } }, 'An ended call reports its charge and why it ended');
  socket.emitServer('call:updated', { _id: 'free-call', callerId: 'member-id', calleeId: 'host-id', status: 'ended', coinsPerMinute: 0, coinsCharged: 0 });
  assert.deepEqual(plain(events.at(-1)), { type: 'call.ended', data: { callId: 'free-call' } }, 'Free calls report no charge');
  socket.emitServer('chat:message-updated', { _id: 'm-1', senderId: 'host-id', recipientId: 'member-id', text: 'Edited words', editedAt: chatAt, reply: { _id: 'm-0', senderId: 'member-id', text: 'Question', image: false, deleted: false } });
  const update = events.filter(event => event.type === 'chat.updated').at(-1);
  assert.equal(update.data.with, 'host-id');
  assert.deepEqual([update.data.message.text, update.data.message.edited, update.data.message.reply.mine, update.data.message.reply.text], ['Edited words', true, true, 'Question']);
  socket.emitServer('chat:message-updated', { _id: 'm-2', senderId: 'stranger', recipientId: 'other-user', text: 'Not ours' });
  assert.equal(events.filter(event => event.type === 'chat.updated').length, 2, 'Updates to other conversations are ignored');
  socket.emitServer('chat:message', { ...giftMessage, senderId: 'host-id', recipientId: 'member-id' });
  const incomingGiftMessage = events.filter(event => event.type === 'chat.message').at(-1).data;
  assert.equal(incomingGiftMessage.kind, 'gift'); assert.deepEqual(plain(incomingGiftMessage.gift), chatGift); assert.equal(incomingGiftMessage.sequence, 15);
  socket.emitServer('chat:message', { ...timedGiftMessage, senderId: 'host-id', recipientId: 'member-id' });
  assert.equal(events.filter(event => event.type === 'chat.message').at(-1).data.gift.durationMs, 6400);
  socket.emitServer('chat:message', { ...anchoredGift, senderId: 'host-id', recipientId: 'member-id' });
  assert.equal(events.filter(event => event.type === 'chat.message').at(-1).data.orderAfterSequence, 15);
  socket.emitServer('chat:message', { ...giftMessage, senderId: 'member-id', recipientId: 'host-id' });
  const sentGiftEcho = events.filter(event => event.type === 'chat.updated').at(-1).data.message;
  assert.equal(sentGiftEcho.kind, 'gift'); assert.equal(sentGiftEcho.mine, true); assert.equal(sentGiftEcho.gift.transferId, 'direct-transfer');
  socket.emitServer('chat:message-hidden', { _id: 'm-3', conversationId: 'conversation-id' });
  assert.equal(events.filter(event => event.type === 'chat.removed').at(-1).data.id, 'm-3');
  const deletedMessage = adapters.messageFrom({ _id: 'm-4', senderId: 'member-id', text: '', deletedAt: chatAt }, 'member-id');
  assert.deepEqual([deletedMessage.deleted, deletedMessage.mine, deletedMessage.text], [true, true, '']);
  assert.equal(adapters.chatsFrom({ items: [{ participants: [{ _id: 'host-id', name: 'Creator' }], lastMessage: { text: '', deleted: true } }] }, 'member-id').chats[0].lastDeleted, true);
  for (const event of ['themes:updated', 'appearance:updated', 'premium:updated']) {
    socket.emitServer(event, { active: true }); assert.deepEqual(plain(events.at(-1)), { type: 'themes.updated', data: {} });
  }
  assert.equal(events.at(-2).type, 'ads.updated', 'Premium also refreshes which ads this member may see');
  socket.emitServer('ads:updated', { campaign: 'ignored' }); assert.deepEqual(plain(events.at(-1)), { type: 'ads.updated', data: {} }, 'Campaign changes only invalidate');
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
  reset();
  const adId = '6a0000000000000000000001';
  const creative = { _id: adId, format: 'banner', advertiser: '  BinzoLive Studio ', headline: 'Edit reels', body: 'Free on Android', ctaLabel: 'Install now', domain: 'play.google.com',
    media: { url: 'https://media.example.test/ads/a.png', contentType: 'image/png' }, logoUrl: 'javascript:alert(1)', placements: ['home', 'feed', 'home'] };
  expect('GET', '/ads', { adFree: false, items: [creative, 'junk', { ...creative },
    { ...creative, _id: '6a0000000000000000000002', media: { url: 'http://insecure.example/a.png', contentType: 'image/png' } },
    { ...creative, _id: '6a0000000000000000000003', format: 'video', media: { url: 'https://media.example.test/a.png', contentType: 'image/png' } },
    { ...creative, _id: '6a0000000000000000000004', placements: ['feed'] },
    { ...creative, _id: '6a0000000000000000000005', format: 'campaign', placements: ['chats', 'explore', 'home'] },
    { ...creative, _id: '6a0000000000000000000006', format: 'campaign', placements: ['chats', 'call_summary'] },
    { ...creative, _id: '6a0000000000000000000007', format: 'campaign', media: { url: 'https://media.example.test/a.mp4', contentType: 'video/mp4' } }] });
  const adFeed = await api.ads();
  assert.deepEqual(plain(adFeed), { adFree: false, items: [{ id: adId, format: 'banner', advertiser: 'BinzoLive Studio', headline: 'Edit reels', body: 'Free on Android', ctaLabel: 'Install now',
    domain: 'play.google.com', mediaUrl: 'https://media.example.test/ads/a.png', mediaType: 'image/png', logoUrl: '', placements: ['home'] },
    { id: '6a0000000000000000000005', format: 'campaign', advertiser: 'BinzoLive Studio', headline: 'Edit reels', body: 'Free on Android', ctaLabel: 'Install now',
    domain: 'play.google.com', mediaUrl: 'https://media.example.test/ads/a.png', mediaType: 'image/png', logoUrl: '', placements: ['explore', 'home'] }] },
    'Unsafe, mismatched, malformed, untargeted and repeated campaigns are dropped; campaign banners keep only the host-grid placements');
  expect('GET', '/ads', { adFree: true, items: [creative] });
  assert.deepEqual(plain(await api.ads()), { adFree: true, items: [] }, 'An ad-free member gets no ads even if some are sent');
  expect('GET', '/ads', { items: [] });
  await assert.rejects(api.ads(), /Sponsored content/);
  expect('POST', `/ads/${adId}/impression`, { counted: true, servable: false }, body => assert.deepEqual(plain(body), { placement: 'home' }));
  assert.deepEqual(plain(await api.adImpression(adId, 'home')), { counted: true, servable: false });
  expect('POST', `/ads/${adId}/click`, { counted: true, url: 'https://play.google.com/store/apps/details?id=com.zimi' }, body => assert.deepEqual(plain(body), { placement: 'chats' }));
  assert.equal(await api.adClick(adId, 'chats'), 'https://play.google.com/store/apps/details?id=com.zimi');
  for (const url of ['http://example.com', 'intent://scan/#Intent;end', 'https://user:pw@example.com', 'javascript:alert(1)', 'https://example.com/"quote']) {
    expect('POST', `/ads/${adId}/click`, { counted: true, url });
    await assert.rejects(api.adClick(adId, 'home'), /secure link/, url);
  }
  finished();
  console.log('API adapter checks passed: authentication, media, home feed, matches, presence, notifications, catalog, server-priced gifts, missions, checkout, withdrawal configuration/history/receipts, streams, and Socket.IO.');
})().catch(error => { console.error(error); process.exitCode = 1; });
