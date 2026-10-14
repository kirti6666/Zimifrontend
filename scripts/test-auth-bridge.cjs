/* Exercises the native bridge with real session storage semantics and mocked API/OS edges. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..');
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tokenPair = (id = 'alice') => ({ accessToken: `${id}.access.${'a'.repeat(30)}`, refreshToken: `${id}.refresh.${'r'.repeat(30)}`, expiresIn: 900, refreshExpiresIn: 86400 });
const account = (id = 'alice') => ({ user: { id, name: id, role: 'sender' }, verification: 'none', requiresOnboarding: true });
const approvedAccount = (id = 'alice') => ({ ...account(id), user: { ...account(id).user, role: 'host', hostStatus: 'approved', isVerifiedHost: true }, verification: 'verified', requiresOnboarding: false });
const profileSettings = (appearance = 'dark') => ({ profile: { id: 'alice', name: 'Alice', bio: '', city: 'Pune', languages: ['English'], maskedPhone: '+91 ••••••3210', countryCode: '+91', isPhoneVerified: true, createdAt: '2026-10-13T09:00:00.000Z' },
  stats: { fans: 2, following: 3, giftsSent: 4, giftsReceived: 5, coinsSent: 40, coinsReceived: 50 }, preferences: { pushNotifications: false, matchCategory: null, appearance }, privacy: { discoverable: true, showActivity: true, allowRequests: false }, categories: ['Music'], capabilities: { pushNotifications: false, nativePushRegistered: false, liveAlerts: false, interfaceLanguages: ['en'], currency: 'INR' } });
const verifyMessage = (requestId = 1) => ({ type: 'auth.verifyOtp', data: { phone: '+919876543210', code: '123456', role: 'sender', signup: true, requestId } });
const sendMessage = (requestId = 1) => ({ type: 'auth.sendOtp', data: { phone: '+919876543210', role: 'sender', requestId } });

function harness() {
  const disk = new Map(), calls = [], posts = [], live = [], saved = [], haptics = [], effects = [], opened = [], signals = [], activities = [];
  const overrides = {};
  class ApiError extends Error {
    constructor(message, status, code, retryAfterSeconds) { super(message); Object.assign(this, { status, code, retryAfterSeconds }); }
  }
  const client = { ApiError, errorMessage: (error) => error instanceof ApiError ? error.message : 'Something went wrong. Please try again.' };
  const defaults = {
    me: () => account(), verifyOtp: () => ({ ...account(), tokens: tokenPair(), isNew: true }),
    sendOtp: () => ({ resendAfter: 60, expiresIn: 300 }), saveProfile: () => account(),
    hosts: () => ({ hosts: [] }), chats: () => ({ chats: [] }), missedCalls: () => ({ calls: [] }), callHistory: () => ({ calls: [] }),
    transactions: () => ({ items: [] }), wallet: () => ({ coins: 100, earningsPaise: 0 }), logout: () => {},
    home: () => ({ hosts: [], stage: [], featured: null, page: 1 }), notifications: () => ({ items: [], unreadCount: 0 }), catalog: () => ({ gifts: [], packs: [], paymentsAvailable: false }), presence: () => ({ online: true, visible: true }),
    profileSettings: () => profileSettings(), blockedUsers: () => ({ users: [], total: 0, page: 1, limit: 20 }),
  };
  const api = new Proxy({}, { get: (_, name) => async (...args) => {
    calls.push({ name, args });
    return (overrides[name] ?? defaults[name] ?? (() => undefined))(...args);
  } });
  const storage = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7,
    getItemAsync: async key => disk.get(key) ?? null,
    setItemAsync: async (key, value) => { disk.set(key, value); },
    deleteItemAsync: async key => { if (overrides.deleteStorage) await overrides.deleteStorage(key); disk.delete(key); },
  };
  const jsx = (type, props) => ({ type, props });
  const react = {
    useCallback: fn => fn, useMemo: fn => fn(), useRef: current => ({ current }),
    useState: initial => [initial, () => {}], useEffect: fn => { effects.push(fn()); },
  };
  const modules = new Map();
  const context = vm.createContext({ console, setTimeout, clearTimeout, Date });
  function load(relative) {
    const filename = path.resolve(ROOT, relative);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} }; modules.set(filename, module);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      fileName: filename,
    }).outputText;
    const requireMock = id => {
      if (id === 'expo-secure-store') return storage;
      if (id === './api/client' || id === './client') return client;
      if (id === './api/endpoints') return { api };
      if (id === './api/realtime') return { connectRealtime: (token, onEvent) => {
        const connection = { token, onEvent, stopped: false }; live.push(connection);
        const stop = () => { connection.stopped = true; };
        stop.send = async (...args) => { signals.push(args); };
        return stop;
      } };
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (id === 'react-native') return { AppState: { addEventListener: (_name, fn) => { activities.push(fn); return { remove: () => { activities.splice(activities.indexOf(fn), 1); } }; } }, Linking: { openURL: async url => opened.push(url) }, ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: styles => styles } };
      if (id === 'react-native-webview') return { WebView: 'WebView' };
      if (id === 'react-native-safe-area-context') return { SafeAreaProvider: 'SafeAreaProvider', SafeAreaView: 'SafeAreaView' };
      if (id === 'expo-status-bar') return { StatusBar: 'StatusBar' };
      if (id === 'expo-haptics') return { selectionAsync: async () => haptics.push('selection'), notificationAsync: async kind => haptics.push(kind), impactAsync: async kind => haptics.push(kind), NotificationFeedbackType: { Success: 'success', Error: 'error' }, ImpactFeedbackStyle: { Light: 'light' } };
      if (id === './assets/aurora-bundle') return { __esModule: true, default: '<html>Native app</html>' };
      if (id.startsWith('.')) return load(path.relative(ROOT, path.resolve(path.dirname(filename), `${id}.ts`)));
      throw new Error(`Unexpected import ${id}`);
    };
    vm.runInContext(`(function(require,module,exports){${compiled}\n})`, context, { filename })(requireMock, module, module.exports);
    return module.exports;
  }
  const session = load('src/session.ts');
  const setTokens = session.setSessionTokens;
  session.setSessionTokens = async (...args) => { saved.push(args); return setTokens(...args); };
  const bridgeModule = load('src/bridge.ts');
  const bridge = bridgeModule.createBridge(message => posts.push(message));
  const webMessages = load('src/web-message.ts');
  const count = name => calls.filter(call => call.name === name).length;
  const find = type => posts.filter(post => post.type === type);
  return { session, bridge, bridgeModule, webMessages, load, ApiError, overrides, calls, posts, live, saved, count, find, disk, haptics, effects, opened, signals, activities };
}

test('login and session restoration never post access or refresh credentials to the WebView', async () => {
  const h = harness();
  h.overrides.verifyOtp = () => ({ ...account(), tokens: tokenPair(), isNew: true, token: 'legacy-secret', refreshToken: 'loose-secret' });
  h.bridge.handle(verifyMessage(8));
  await settle();
  assert.equal(h.find('auth.ok').length, 1);
  assert.equal(h.find('auth.ok')[0].data.requestId, 8);
  assert.equal(await h.session.getToken(), tokenPair().accessToken);
  h.bridge.handle({ type: 'session.resume', data: {} });
  await settle();
  assert.equal(h.find('session').length, 1);
  const serialized = JSON.stringify(h.posts);
  for (const secret of [tokenPair().accessToken, tokenPair().refreshToken, 'legacy-secret', 'loose-secret']) assert.equal(serialized.includes(secret), false);
  assert.equal(h.live[0].token, tokenPair().accessToken);
  h.bridge.close();
});

test('malformed, unknown, oversized and invalid auth messages are ignored', async () => {
  const h = harness();
  const invalid = [null, [], {}, { type: 'auth.verifyOtp', data: [] }, { type: 'auth.verifyOtp', data: { ...verifyMessage().data, code: '123' } },
    { type: 'auth.sendOtp', data: { ...sendMessage().data, role: 'admin' } }, { type: 'auth.sendOtp', data: { ...sendMessage().data, phone: '+919876543210<script>' } },
    { type: 'auth.sendOtp', data: { ...sendMessage().data, requestId: -1 } }, { type: 'eval', data: { code: 'malicious' } },
    { type: 'gift.send', data: { to: 'alice', gift: 'gift', coins: -1000, inCall: false } },
    { type: 'profile.save', data: { photos: ['data:image/svg+xml;base64,AAAA'] } },
  ];
  for (const value of invalid) { assert.equal(h.webMessages.parseWebMessage(JSON.stringify(value)), null); h.bridge.handle(value); }
  assert.equal(h.webMessages.parseWebMessage('not-json'), null);
  assert.equal(h.webMessages.parseWebMessage('x'.repeat(12 * 1024 * 1024 + 1)), null);
  await settle();
  assert.equal(h.calls.length, 0);
  assert.equal(h.posts.length, 0);
  h.bridge.close();
});

test('a verification finishing after logout never stores tokens or signs the UI in', async () => {
  const h = harness(), pending = deferred();
  h.overrides.verifyOtp = () => pending.promise;
  h.bridge.handle(verifyMessage());
  h.bridge.handle({ type: 'auth.logout', data: {} });
  pending.resolve({ ...account(), tokens: tokenPair(), isNew: false });
  await settle();
  assert.equal(h.saved.length, 0);
  assert.equal(h.find('auth.ok').length, 0);
  assert.equal(await h.session.getToken(), null);
  h.bridge.close();
});

test('logout invalidates synchronously, revokes the captured session and leaves a new login intact', async () => {
  const h = harness(), pendingLogout = deferred();
  await h.session.setSessionTokens(tokenPair());
  const before = h.session.getSessionVersion();
  h.overrides.logout = () => pendingLogout.promise;
  h.bridge.handle({ type: 'auth.logout', data: {} });
  assert.ok(h.session.getSessionVersion() > before);
  assert.equal(h.session.getCachedToken(), null);
  await settle();
  assert.equal(h.count('logout'), 1, 'backend revocation must receive the captured access token');
  assert.equal(h.calls.find(call => call.name === 'logout').args[0], tokenPair().accessToken);
  await h.session.setSessionTokens(tokenPair('next'));
  pendingLogout.resolve();
  await settle();
  assert.equal(await h.session.getToken(), tokenPair('next').accessToken);
  h.bridge.close();
});

test('logout still revokes server credentials when secure-storage deletion fails', async () => {
  const h = harness(), revoked = deferred();
  await h.session.setSessionTokens(tokenPair());
  h.overrides.deleteStorage = key => { if (key === 'zimi.session.v1') throw new Error('secure storage unavailable'); };
  h.overrides.logout = () => revoked.promise;
  const before = h.session.getSessionVersion();
  h.bridge.handle({ type: 'auth.logout', data: {} });
  assert.ok(h.session.getSessionVersion() > before);
  assert.equal(h.session.getCachedToken(), null);
  await settle();
  assert.equal(h.count('logout'), 1);
  assert.equal(h.calls.find(call => call.name === 'logout').args[0], tokenPair().accessToken);
  assert.equal(await h.session.getToken(), null);
  assert.equal(h.find('operation.error').length, 1);
  assert.equal(h.find('operation.error')[0].data.action, 'auth.logout');
  assert.equal(JSON.stringify(h.posts).includes(tokenPair().accessToken), false);
  h.overrides.deleteStorage = undefined;
  await h.session.setSessionTokens(tokenPair('next'));
  revoked.resolve();
  await settle();
  assert.equal(await h.session.getToken(), tokenPair('next').accessToken);
  h.bridge.close();
});

test('a delayed logout storage failure cannot show an error over a newer session', async () => {
  const h = harness(), deletion = deferred();
  await h.session.setSessionTokens(tokenPair());
  h.overrides.deleteStorage = key => key === 'zimi.session.v1' ? deletion.promise : undefined;
  h.bridge.handle({ type: 'auth.logout', data: {} });
  await settle();
  const nextLogin = h.session.setSessionTokens(tokenPair('next'));
  deletion.reject(new Error('secure storage unavailable'));
  await nextLogin;
  await settle();
  assert.equal(h.count('logout'), 1);
  assert.equal(h.find('operation.error').length, 0);
  assert.equal(await h.session.getToken(), tokenPair('next').accessToken);
  h.bridge.close();
});

test('expiry invalidates immediately and notifies the UI even if secure-storage deletion fails', async () => {
  const h = harness();
  await h.session.setSessionTokens(tokenPair());
  h.overrides.deleteStorage = key => { if (key === 'zimi.session.v1') throw new Error('secure storage unavailable'); };
  const before = h.session.getSessionVersion();
  const expiry = h.session.expireSession(before);
  assert.ok(h.session.getSessionVersion() > before);
  assert.equal(h.session.getCachedToken(), null);
  assert.equal(h.find('session.expired').length, 1);
  await assert.rejects(expiry, error => error.name === 'SessionStorageError');
  assert.equal(await h.session.rotateSessionTokens(tokenPair('stale'), before), false);
  assert.equal(await h.session.getToken(), null);
  h.bridge.close();
});

test('duplicate OTP sends and verifications have at most one request in flight each', async () => {
  const h = harness(), send = deferred(), verify = deferred();
  h.overrides.sendOtp = () => send.promise;
  h.overrides.verifyOtp = () => verify.promise;
  h.bridge.handle(sendMessage(2)); h.bridge.handle(sendMessage(3));
  h.bridge.handle(verifyMessage(4)); h.bridge.handle(verifyMessage(5));
  assert.equal(h.count('sendOtp'), 1);
  assert.equal(h.count('verifyOtp'), 1);
  send.resolve({ resendAfter: 60, expiresIn: 300 });
  await settle();
  assert.equal(h.find('auth.otpSent')[0].data.requestId, 2);
  verify.resolve({ ...account(), tokens: tokenPair(), isNew: false });
  await settle();
  assert.equal(h.find('auth.ok')[0].data.requestId, 4);
  h.bridge.close();
});

test('rate-limit metadata reaches only the matching auth request', async () => {
  const h = harness();
  h.overrides.sendOtp = () => { throw new h.ApiError('Please wait', 429, 'OTP_RATE_LIMITED', 63); };
  h.bridge.handle(sendMessage(31));
  await settle();
  const error = h.find('auth.error')[0];
  assert.equal(error.data.requestId, 31);
  assert.equal(error.data.code, 'OTP_RATE_LIMITED');
  assert.equal(error.data.retryAfterSeconds, 63);
  assert.equal(error.data.action, 'auth.sendOtp');
  h.bridge.close();
});

test('profile progress, completion and errors retain request IDs and omit transport metadata', async () => {
  const h = harness(), pending = deferred();
  await h.session.setSessionTokens(tokenPair());
  h.overrides.saveProfile = (profile, progress) => {
    assert.equal(profile.requestId, undefined);
    assert.equal(profile.onboarding, undefined);
    progress(1, 3);
    return pending.promise;
  };
  h.bridge.handle({ type: 'profile.save', data: { onboarding: false, requestId: 44, name: 'Alice' } });
  await settle();
  assert.equal(h.find('profile.progress')[0].data.requestId, 44);
  pending.resolve(account());
  await settle();
  assert.equal(h.find('profile.saved')[0].data.requestId, 44);
  assert.equal(h.find('profile.saved')[0].data.account.user.id, 'alice');
  h.overrides.saveProfile = () => { throw new h.ApiError('Photo upload failed', 503); };
  h.bridge.handle({ type: 'profile.save', data: { onboarding: true, requestId: 45, name: 'Alice' } });
  await settle();
  assert.equal(h.find('profile.error')[0].data.requestId, 45);
  assert.equal(h.find('profile.error')[0].data.onboarding, true);
  h.bridge.close();
});

test('offline restoration is retryable without clearing secure credentials', async () => {
  const h = harness();
  await h.session.setSessionTokens(tokenPair());
  h.overrides.me = () => { throw new h.ApiError('Connection unavailable', 0, 'NETWORK_ERROR'); };
  h.bridge.handle({ type: 'ready', data: { demo: false } });
  await settle();
  assert.equal(h.find('session.restoring').length, 1);
  assert.equal(h.find('session.error').length, 1);
  assert.equal(h.find('session.expired').length, 0);
  assert.equal(await h.session.getToken(), tokenPair().accessToken);
  h.overrides.me = () => account();
  h.bridge.handle({ type: 'session.resume', data: {} });
  await settle();
  assert.equal(h.find('session').length, 1);
  h.bridge.close();
});

test('expired restoration emits expiry and suppresses stale account/error events', async () => {
  const h = harness();
  await h.session.setSessionTokens(tokenPair());
  h.overrides.me = async () => {
    await h.session.expireSession(h.session.getSessionVersion());
    throw new h.ApiError('Expired', 401, 'SESSION_EXPIRED');
  };
  h.bridge.handle({ type: 'session.resume', data: {} });
  await settle();
  assert.equal(h.find('session.expired').length, 1);
  assert.equal(h.find('session.error').length, 0);
  assert.equal(h.find('session').length, 0);
  assert.equal(await h.session.getToken(), null);
  h.bridge.close();
});

test('late realtime and profile events from the old identity are ignored after replacement', async () => {
  const h = harness(), pendingProfile = deferred();
  await h.session.setSessionTokens(tokenPair());
  h.bridge.handle({ type: 'session.resume', data: {} });
  await settle();
  const oldLive = h.live[0];
  h.overrides.saveProfile = () => pendingProfile.promise;
  h.bridge.handle({ type: 'profile.save', data: { name: 'Old', requestId: 90 } });
  h.overrides.verifyOtp = () => ({ ...account('new'), tokens: tokenPair('new'), isNew: false });
  h.bridge.handle(verifyMessage(91));
  await settle();
  assert.equal(oldLive.stopped, true);
  oldLive.onEvent({ type: 'chat.message', data: { from: 'private-old-peer', text: 'old account data' } });
  pendingProfile.resolve(account('old'));
  await settle();
  assert.equal(h.find('chat.message').length, 0);
  assert.equal(h.find('profile.saved').length, 0);
  h.bridge.close();
});

test('closing the bridge removes session observers and prevents pending UI delivery', async () => {
  const h = harness(), pending = deferred();
  h.overrides.sendOtp = () => pending.promise;
  h.bridge.handle(sendMessage());
  h.bridge.close();
  pending.resolve({ resendAfter: 60, expiresIn: 300 });
  await h.session.expireSession(h.session.getSessionVersion());
  await settle();
  assert.equal(h.posts.length, 0);
  h.bridge.handle(sendMessage());
  assert.equal(h.count('sendOtp'), 1);
});

test('native App refuses external document navigation and messages before privileged dispatch', async () => {
  const h = harness();
  const tree = h.load('App.tsx').default();
  function findWeb(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'WebView') return node;
    for (const child of [node.props?.children].flat()) { const found = findWeb(child); if (found) return found; }
    return null;
  }
  const web = findWeb(tree);
  assert.ok(web);
  for (const url of ['https://evil.example/', 'https://aurora.localhost.evil.example/', 'https://aurora.localhost/@evil', 'file:///tmp/evil.html', 'javascript:alert(1)', 'https://aurora.localhost/?spoof=1']) {
    assert.equal(web.props.onShouldStartLoadWithRequest({ url }), false);
    web.props.onMessage({ nativeEvent: { url, data: JSON.stringify(sendMessage()) } });
    web.props.onMessage({ nativeEvent: { url, data: JSON.stringify({ type: 'ui.haptic', data: { kind: 'success' } }) } });
  }
  assert.equal(h.count('sendOtp'), 0);
  assert.equal(h.haptics.length, 0);
  assert.equal(web.props.mixedContentMode, 'never');
  assert.equal(web.props.allowFileAccess, false);
  assert.equal(web.props.allowUniversalAccessFromFileURLs, false);
  assert.equal(web.props.onShouldStartLoadWithRequest({ url: 'https://aurora.localhost/' }), true);
  web.props.onMessage({ nativeEvent: { url: 'https://aurora.localhost/', data: JSON.stringify(sendMessage()) } });
  await settle();
  assert.equal(h.count('sendOtp'), 1);
  h.effects.forEach(cleanup => cleanup?.()); h.bridge.close();
});

test('Android origin-only WebView messages reach OTP and haptic handlers', async () => {
  const h = harness();
  const tree = h.load('App.tsx').default();
  function findWeb(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'WebView') return node;
    for (const child of [node.props?.children].flat()) { const found = findWeb(child); if (found) return found; }
    return null;
  }
  const web = findWeb(tree);
  // Android's WebMessageListener passes sourceOrigin.toString(), which has
  // no trailing slash. iOS and the legacy Android bridge pass a document URL.
  const url = 'https://aurora.localhost';
  assert.equal(web.props.onShouldStartLoadWithRequest({ url }), true);
  web.props.onMessage({ nativeEvent: { url, data: JSON.stringify(sendMessage()) } });
  web.props.onMessage({ nativeEvent: { url, data: JSON.stringify({ type: 'ui.haptic', data: { kind: 'success' } }) } });
  await settle();
  assert.equal(h.count('sendOtp'), 1, 'Android messages must dispatch a real OTP request');
  assert.deepEqual(h.haptics, ['success']);
  h.effects.forEach(cleanup => cleanup?.()); h.bridge.close();
});

test('postToWeb serializes text as data rather than executable JavaScript', () => {
  const h = harness();
  let script;
  const payload = { type: 'auth.error', data: { message: '");globalThis.injected=true;//\n</script>' } };
  h.bridgeModule.postToWeb({ current: { injectJavaScript: value => { script = value; } } }, payload);
  let received;
  const scope = { window: { zimiReceive: value => { received = JSON.parse(value); } } };
  vm.runInNewContext(script, scope);
  assert.equal(scope.injected, undefined);
  assert.deepEqual(received, payload);
  h.bridge.close();
});

test('home requests discard stale filters and never replace enriched feed with legacy hosts', async () => {
  const h = harness(), earlier = deferred();
  h.overrides.home = query => query.category === 'Music' ? earlier.promise : { hosts: [{ id: 'talk-host' }], page: 1 };
  h.bridge.handle({ type: 'home.reload', data: { category: 'Music' } });
  h.bridge.handle({ type: 'home.reload', data: { category: 'Talk' } });
  await settle();
  earlier.resolve({ hosts: [{ id: 'music-host' }], page: 1 });
  await settle();
  assert.equal(h.find('data.home').length, 1);
  assert.equal(h.find('data.home')[0].data.hosts[0].id, 'talk-host');
  assert.equal(h.count('hosts'), 0);
  h.bridge.close();
});

test('match previews a real host without creating a call and media signals stay in native transport', async () => {
  const h = harness();
  await h.session.setSessionTokens(tokenPair());
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.matchHost = () => ({ host: { id: 'eligible-host', ratePerMin: 0 } });
  h.bridge.handle({ type: 'call.match', data: { category: 'Music' } });
  await settle();
  assert.equal(h.count('startCall'), 0);
  assert.equal(h.find('call.matched')[0].data.host.id, 'eligible-host');
  h.bridge.handle({ type: 'rtc.signal', data: { callId: 'call-id', description: { type: 'offer', sdp: 'session-description' } } });
  h.bridge.handle({ type: 'stream.ready', data: { streamId: 'stream-id' } });
  await settle();
  assert.equal(h.signals[0][0], 'webrtc:signal'); assert.equal(h.signals[1][0], 'stream:ready');
  assert.equal(JSON.stringify(h.posts).includes(tokenPair().accessToken), false);
  h.bridge.close();
});

test('invalid room, payment and oversized media input never reaches privileged dispatch', async () => {
  const h = harness();
  const invalid = [
    { type: 'wallet.checkout', data: { packId: 'pack', idempotencyKey: 'short' } },
    { type: 'stream.start', data: { title: 'Live', category: 'unlisted' } },
    { type: 'rtc.signal', data: { callId: 'call', description: { type: 'offer', sdp: 'x'.repeat(60001) } } },
    { type: 'stream.signal', data: { streamId: 'stream', to: 'host', description: { type: 'answer', sdp: 'sdp' }, candidate: { candidate: '' } } },
    { type: 'notifications.read', data: { ids: [] } },
  ];
  for (const value of invalid) { assert.equal(h.webMessages.parseWebMessage(JSON.stringify(value)), null); h.bridge.handle(value); }
  await settle(); assert.equal(h.calls.length, 0); assert.equal(h.signals.length, 0);
  h.bridge.close();
});

test('checkout opens provider outside WebView once and session changes cancel late launches', async () => {
  const h = harness(), pending = deferred();
  h.overrides.checkout = () => pending.promise;
  const checkout = { type: 'wallet.checkout', data: { packId: 'pack-id', idempotencyKey: 'checkout-attempt-1' } };
  h.bridge.handle(checkout); h.bridge.handle(checkout);
  assert.equal(h.count('checkout'), 1);
  pending.resolve({ purchaseId: 'purchase', merchantOrderId: 'order', paymentUrl: 'https://checkout.example.test/pay', status: 'PENDING' });
  await settle();
  assert.deepEqual(h.opened, ['https://checkout.example.test/pay']);
  assert.equal(h.find('wallet.balance').length, 0, 'Opening payment does not credit coins');
  const late = deferred(); h.overrides.checkout = () => late.promise;
  h.bridge.handle(checkout); h.bridge.handle({ type: 'auth.logout', data: {} });
  late.resolve({ paymentUrl: 'https://checkout.example.test/old' }); await settle();
  assert.equal(h.opened.length, 1);
  h.bridge.close();
});

test('mission and gift rejection never credit or acknowledge success', async () => {
  const h = harness();
  h.overrides.me = () => approvedAccount();
  h.overrides.claimAward = () => { throw new h.ApiError('Mission target has not been reached', 409); };
  h.overrides.sendGift = () => { throw new h.ApiError('Not enough coins', 409); };
  h.bridge.handle({ type: 'awards.claim', data: { task: 'mission-id' } });
  h.bridge.handle({ type: 'gift.send', data: { to: 'host-id', gift: 'gift-id', coins: 10, inCall: false, idempotencyKey: 'gift-attempt-1' } });
  await settle();
  assert.equal(h.find('wallet.balance').length, 0); assert.equal(h.find('awards.claimed').length, 0); assert.equal(h.find('gift.sent').length, 0);
  assert.deepEqual(h.find('operation.error').map(item => item.data.action).sort(), ['awards.claim', 'gift.send']);
  h.bridge.close();
});

test('returning from provider checkout verifies the owned order and credits only the server wallet', async () => {
  const h = harness();
  h.overrides.checkout = () => ({ purchaseId: 'purchase', merchantOrderId: 'zimi_order', paymentUrl: 'https://checkout.example.test/pay', status: 'PENDING' });
  h.overrides.verifyPurchase = () => ({ purchaseId: 'purchase', merchantOrderId: 'zimi_order', status: 'SUCCESS' });
  h.overrides.wallet = () => ({ coins: 475, earningsPaise: 0 });
  h.bridge.handle({ type: 'wallet.checkout', data: { packId: 'pack-id', idempotencyKey: 'payment-attempt-1' } });
  await settle();
  h.activities.forEach(listener => listener('background')); await settle(); assert.equal(h.count('verifyPurchase'), 0);
  h.activities.forEach(listener => listener('active')); await settle();
  assert.equal(h.calls.find(call => call.name === 'verifyPurchase').args[0], 'zimi_order');
  assert.equal(h.find('wallet.purchase')[0].data.status, 'SUCCESS');
  assert.equal(h.find('wallet.balance')[0].data.coins, 475);
  h.activities.forEach(listener => listener('active')); await settle(); assert.equal(h.count('verifyPurchase'), 1);
  h.bridge.close(); assert.equal(h.activities.length, 0);
});

test('realtime home invalidation retains the category and refreshes first page', async () => {
  const h = harness();
  await h.session.setSessionTokens(tokenPair());
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.bridge.handle({ type: 'home.reload', data: { category: 'Music', mode: 'popular', page: 3 } }); await settle();
  h.live[0].onEvent({ type: 'home.updated', data: {} }); await settle();
  const last = h.calls.filter(call => call.name === 'home').at(-1);
  assert.equal(last.args[0].category, 'Music'); assert.equal(last.args[0].page, 1);
  h.bridge.close();
});

test('creator search uses its own latest request and preserves the home category', async () => {
  const h = harness(), older = deferred();
  await h.session.setSessionTokens(tokenPair());
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.home = query => query.q === 'old' ? older.promise : { hosts: [{ id: query.q || 'home-host' }], total: 30, page: query.page || 1 };
  h.bridge.handle({ type: 'home.reload', data: { category: 'Music', page: 2 } }); await settle();
  h.bridge.handle({ type: 'hosts.search', data: { q: 'old' } });
  h.bridge.handle({ type: 'hosts.search', data: { q: 'new', page: 2 } }); await settle();
  older.resolve({ hosts: [{ id: 'stale-host' }], total: 1, page: 1 }); await settle();
  assert.equal(h.find('data.search').length, 1);
  assert.equal(h.find('data.search')[0].data.q, 'new'); assert.equal(h.find('data.search')[0].data.page, 2);
  assert.equal(h.find('data.search')[0].data.total, 30);
  assert.equal(h.find('data.home').length, 1, 'Search must not emit a replacement home feed');
  const search = h.calls.filter(call => call.name === 'home' && call.args[0].q === 'new')[0];
  assert.equal(search.args[0].category, undefined); assert.equal(search.args[0].mode, 'popular');
  h.live[0].onEvent({ type: 'home.updated', data: {} }); await settle();
  assert.equal(h.calls.filter(call => call.name === 'home').at(-1).args[0].category, 'Music');
  for (const data of [{ q: 'x'.repeat(101) }, { q: 'valid', page: 0 }, { q: 42 }]) {
    assert.equal(h.webMessages.parseWebMessage(JSON.stringify({ type: 'hosts.search', data })), null);
  }
  h.bridge.close();
});

test('cancel before call creation returns ends the returned call without reopening the UI', async () => {
  const h = harness(), started = deferred();
  await h.session.setSessionTokens(tokenPair());
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.startCall = () => started.promise;
  h.bridge.handle({ type: 'call.start', data: { to: 'host-id', voice: false } });
  h.bridge.handle({ type: 'call.end', data: { reason: 'cancelled' } });
  assert.equal(h.count('endCall'), 0, 'The server call ID is not known until creation completes');
  started.resolve({ callId: 'late-call' }); await settle();
  assert.equal(h.count('endCall'), 1);
  assert.equal(h.calls.find(call => call.name === 'endCall').args[0], 'late-call');
  assert.equal(h.find('call.created').length, 0); assert.equal(h.find('call.failed').length, 0);
  h.live[0].onEvent({ type: 'call.connected', data: { callId: 'late-call', initiator: true, peerId: 'host-id', voice: false } });
  await settle();
  assert.equal(h.find('call.connected').length, 0, 'A delayed accepted event cannot revive a cancelled call');
  h.bridge.close();
});

test('accepted socket event before a cancelled call POST resolves is ended and suppressed', async () => {
  const h = harness(), started = deferred();
  await h.session.setSessionTokens(tokenPair());
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.startCall = () => started.promise;
  h.bridge.handle({ type: 'call.start', data: { to: 'host-id' } });
  h.bridge.handle({ type: 'call.end', data: {} });
  h.live[0].onEvent({ type: 'call.connected', data: { callId: 'fast-peer', initiator: true, peerId: 'host-id' } });
  await settle();
  assert.equal(h.find('call.connected').length, 0); assert.equal(h.count('endCall'), 1);
  started.resolve({ callId: 'fast-peer' }); await settle();
  assert.equal(h.find('call.created').length, 0);
  h.bridge.close();
});

test('logout during call creation retires the result without using a replacement identity for cleanup', async () => {
  const h = harness(), started = deferred();
  await h.session.setSessionTokens(tokenPair());
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  const oldLive = h.live[0];
  h.overrides.startCall = () => started.promise;
  h.bridge.handle({ type: 'call.start', data: { to: 'host-id' } });
  h.bridge.handle({ type: 'auth.logout', data: {} }); await settle();
  await h.session.setSessionTokens(tokenPair('replacement'));
  started.resolve({ callId: 'old-account-call' });
  oldLive.onEvent({ type: 'call.connected', data: { callId: 'old-account-call', initiator: true } });
  await settle();
  assert.equal(h.find('call.created').length, 0); assert.equal(h.find('call.connected').length, 0); assert.equal(h.find('call.failed').length, 0);
  assert.equal(h.count('endCall'), 0, 'Old cleanup must never borrow a new account access token');
  assert.equal(await h.session.getToken(), tokenPair('replacement').accessToken);
  h.bridge.close();
});

test('ending while accept is pending cannot reconnect after the accept response', async () => {
  const h = harness(), accepted = deferred();
  await h.session.setSessionTokens(tokenPair());
  h.overrides.me = () => approvedAccount();
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.acceptCall = () => accepted.promise;
  h.bridge.handle({ type: 'call.accept', data: { callId: 'incoming-id' } });
  await settle(); assert.equal(h.count('acceptCall'), 1);
  h.bridge.handle({ type: 'call.end', data: {} });
  accepted.resolve({ peerId: 'member-id', voice: true }); await settle();
  h.live[0].onEvent({ type: 'call.connected', data: { callId: 'incoming-id', initiator: false, peerId: 'member-id', voice: true } }); await settle();
  assert.equal(h.find('call.connected').length, 0);
  assert.ok(h.count('endCall') >= 1);
  h.bridge.close();
});

test('host capability requires the complete approved server tuple', async () => {
  const h = harness(), { approvedHost } = h.load('src/host-access.ts');
  assert.equal(approvedHost(undefined), false);
  assert.equal(approvedHost(approvedAccount()), true);
  for (const patch of [{ role: 'sender' }, { hostStatus: undefined }, { hostStatus: 'pending' }, { hostStatus: 'rejected' }, { hostStatus: 'suspended' }, { isVerifiedHost: undefined }, { isVerifiedHost: false }]) {
    assert.equal(approvedHost({ ...approvedAccount(), user: { ...approvedAccount().user, ...patch } }), false);
  }
  assert.equal(approvedHost({ ...approvedAccount(), verification: 'pending' }), false);
  h.bridge.close();
});

test('unapproved native host actions cannot reach stream, online presence, call accept or publishing endpoints', async () => {
  const cases = [account(), ...['pending','rejected','suspended','approved'].map(status => ({ ...approvedAccount(), user: { ...approvedAccount().user, hostStatus: status, isVerifiedHost: status !== 'approved' } }))];
  for (const denied of cases) {
    const h = harness(); h.overrides.me = () => denied;
    h.bridge.handle({ type: 'stream.start', data: { title: 'Blocked broadcast', category: 'Music' } });
    h.bridge.handle({ type: 'presence.set', data: { online: true, visible: true } });
    h.bridge.handle({ type: 'call.accept', data: { callId: 'incoming' } });
    h.bridge.handle({ type: 'media.post.create', data: { photo: 'data:image/png;base64,AAAA', caption: 'Blocked post', requestId: 2 } });
    h.bridge.handle({ type: 'awards.claim', data: { task: 'mission-id' } });
    h.bridge.handle({ type: 'payout.request', data: { coins: 100, upi: 'member@upi' } });
    await settle();
    for (const name of ['startStream', 'setPresence', 'acceptCall', 'createPost', 'claimAward', 'requestPayout']) assert.equal(h.count(name), 0, `${denied.user.hostStatus || 'member'} cannot invoke ${name}`);
    assert.ok(h.find('host.access').every(event => event.data.approved === false));
    assert.equal(h.find('stream.opened').length, 0); assert.equal(h.find('post.saved').length, 0); assert.equal(h.find('call.connected').length, 0);
    h.bridge.handle({ type: 'presence.set', data: { online: false, visible: false } });
    h.bridge.handle({ type: 'stream.end', data: { streamId: 'owned-cleanup' } }); await settle();
    assert.equal(h.count('setPresence'), 1, 'Going offline remains available for cleanup');
    assert.equal(h.count('endStream'), 1, 'Ending an existing broadcast remains available');
    h.bridge.close();
  }
});

test('approved native host actions revalidate server approval before execution', async () => {
  const h = harness(); h.overrides.me = () => approvedAccount();
  h.overrides.startStream = () => ({ id: 'stream-id' }); h.overrides.streamMessages = () => [];
  h.overrides.setPresence = (online, visible) => ({ online, visible });
  h.overrides.acceptCall = () => ({ peerId: 'member', voice: false });
  h.overrides.createPost = () => ({ id: 'post-id' });
  h.bridge.handle({ type: 'stream.start', data: { title: 'Approved broadcast', category: 'Music' } });
  h.bridge.handle({ type: 'presence.set', data: { online: true, visible: true } });
  h.bridge.handle({ type: 'call.accept', data: { callId: 'incoming' } });
  h.bridge.handle({ type: 'media.post.create', data: { photo: 'data:image/png;base64,AAAA', caption: 'Approved post', requestId: 2 } }); await settle();
  for (const name of ['startStream','setPresence','acceptCall','createPost']) assert.equal(h.count(name), 1);
  assert.equal(h.count('me'), 4); assert.ok(h.calls.filter(call => call.name === 'me').every(call => call.args[0] === true), 'Each host action bypasses older cached account reads');
  assert.equal(h.find('stream.opened').length, 1); assert.equal(h.find('call.connected').length, 1); assert.equal(h.find('post.saved').length, 1);
  h.bridge.close();
});

test('admin revocation retires hosted activity and cannot be undone by a pending approval response', async () => {
  const h = harness(), permission = deferred(), revoked = deferred();
  await h.session.setSessionTokens(tokenPair()); h.overrides.me = () => approvedAccount();
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.startStream = () => ({ id: 'hosted' }); h.overrides.streamMessages = () => [];
  h.bridge.handle({ type: 'stream.start', data: { title: 'Session', category: 'Music' } }); await settle();
  h.overrides.me = () => permission.promise;
  h.bridge.handle({ type: 'presence.set', data: { online: true, visible: true } });
  h.overrides.me = () => revoked.promise;
  h.live[0].onEvent({ type: 'verification.status', data: { status: 'rejected', hostStatus: 'suspended' } });
  assert.equal(h.find('host.access').at(-1).data.approved, false, 'Revocation is immediate before the account refetch completes');
  assert.equal(h.find('stream.ended').at(-1).data.streamId, 'hosted');
  permission.resolve(approvedAccount()); await settle();
  assert.equal(h.count('setPresence'), 0, 'An older positive approval cannot authorize after revocation');
  assert.equal(h.find('host.access').at(-1).data.approved, false);
  revoked.resolve({ ...account(), user: { ...account().user, hostStatus: 'suspended', isVerifiedHost: false } }); await settle();
  assert.equal(h.count('endStream'), 1);
  h.live[0].onEvent({ type: 'call.incoming', data: { callId: 'denied-incoming', from: { id: 'member' } } }); await settle();
  assert.equal(h.find('call.incoming').length, 0); assert.equal(h.count('declineCall'), 1);
  h.bridge.close();
});

test('a stream created while approval is revoked is ended without opening the camera room', async () => {
  const h = harness(), pending = deferred();
  await h.session.setSessionTokens(tokenPair()); h.overrides.me = () => approvedAccount();
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.startStream = () => pending.promise;
  h.bridge.handle({ type: 'stream.start', data: { title: 'Session', category: 'Music' } }); await settle();
  assert.equal(h.count('startStream'), 1);
  h.overrides.me = () => ({ ...account(), user: { ...account().user, hostStatus: 'suspended', isVerifiedHost: false } });
  h.live[0].onEvent({ type: 'verification.status', data: { status: 'rejected', hostStatus: 'suspended' } });
  pending.resolve({ id: 'late-hosted' }); await settle();
  assert.equal(h.find('stream.opened').length, 0); assert.equal(h.count('endStream'), 1);
  assert.equal(h.calls.find(call => call.name === 'endStream').args[0], 'late-hosted');
  h.bridge.close();
});

test('a newer denial from the account API invalidates an older positive check even without a socket review', async () => {
  const h = harness(), older = deferred();
  await h.session.setSessionTokens(tokenPair()); h.overrides.me = () => approvedAccount();
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.me = () => older.promise;
  h.bridge.handle({ type: 'presence.set', data: { online: true, visible: true } });
  h.overrides.me = () => ({ ...account(), user: { ...account().user, hostStatus: 'suspended', isVerifiedHost: false } });
  h.bridge.handle({ type: 'stream.start', data: { title: 'Denied', category: 'Music' } }); await settle();
  assert.equal(h.find('host.access').at(-1).data.approved, false);
  older.resolve(approvedAccount()); await settle();
  assert.equal(h.count('startStream'), 0); assert.equal(h.count('setPresence'), 0);
  assert.equal(h.find('host.access').at(-1).data.approved, false);
  h.bridge.close();
});

test('an approval notification alone never grants host capability without confirmed account metadata', async () => {
  const h = harness(), refresh = deferred();
  await h.session.setSessionTokens(tokenPair());
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.me = () => refresh.promise;
  h.live[0].onEvent({ type: 'verification.status', data: { status: 'verified', hostStatus: 'approved' } });
  assert.equal(h.find('host.access').at(-1).data.approved, false);
  refresh.resolve({ ...approvedAccount(), user: { ...approvedAccount().user, isVerifiedHost: false } }); await settle();
  assert.equal(h.find('host.access').at(-1).data.approved, false);
  h.bridge.close();
});

test('reconnect revalidates approval while preserving an established host call until a confirmed denial', async () => {
  const h = harness(), reconnect = deferred();
  await h.session.setSessionTokens(tokenPair()); h.overrides.me = () => approvedAccount();
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.acceptCall = () => ({ peerId: 'member', voice: false });
  h.bridge.handle({ type: 'call.accept', data: { callId: 'active-host-call' } }); await settle();
  h.overrides.me = () => reconnect.promise;
  const before = h.count('me');
  h.live[0].onEvent({ type: 'realtime.status', data: { connected: false } });
  let access = h.find('host.access').at(-1).data;
  assert.equal(access.approved, false); assert.equal(access.checking, true); assert.equal(access.role, 'host');
  assert.equal(h.count('endCall'), 0, 'Temporary transport loss does not terminate an authorized active call');
  h.live[0].onEvent({ type: 'realtime.status', data: { connected: true } }); await settle();
  assert.equal(h.count('me'), before + 1, 'Reconnect must fetch the current account even when no review event was received');
  assert.equal(h.calls.filter(call => call.name === 'me').at(-1).args[0], true);
  assert.equal(h.find('host.access').at(-1).data.approved, false, 'New hosting remains unavailable while approval is unknown');
  reconnect.resolve(approvedAccount()); await settle();
  access = h.find('host.access').at(-1).data;
  assert.equal(access.approved, true); assert.equal(access.checking, false); assert.equal(h.count('endCall'), 0);
  const denied = deferred(); h.overrides.me = () => denied.promise;
  h.live[0].onEvent({ type: 'realtime.status', data: { connected: false } });
  h.live[0].onEvent({ type: 'realtime.status', data: { connected: true } });
  assert.equal(h.count('endCall'), 0);
  denied.resolve({ ...account(), user: { ...account().user, hostStatus: 'suspended', isVerifiedHost: false } }); await settle();
  access = h.find('host.access').at(-1).data;
  assert.equal(access.approved, false); assert.equal(access.checking, false); assert.equal(access.hostStatus, 'suspended');
  assert.equal(h.find('call.ended').at(-1).data.callId, 'active-host-call'); assert.equal(h.count('endCall'), 1);
  h.bridge.close();
});

test('a failed reconnect approval check stays closed to new hosting without ending the existing broadcast', async () => {
  const h = harness(), checking = deferred();
  await h.session.setSessionTokens(tokenPair()); h.overrides.me = () => approvedAccount();
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.startStream = () => ({ id: 'existing-live' }); h.overrides.streamMessages = () => [];
  h.bridge.handle({ type: 'stream.start', data: { title: 'Live', category: 'Music' } }); await settle();
  h.overrides.me = () => checking.promise;
  h.live[0].onEvent({ type: 'realtime.status', data: { connected: true } });
  checking.reject(new h.ApiError('Connection unavailable', 503)); await settle();
  const access = h.find('host.access').at(-1).data;
  assert.equal(access.approved, false); assert.equal(access.checking, true);
  assert.equal(h.count('endStream'), 0); assert.equal(h.find('stream.ended').length, 0);
  assert.equal(h.find('operation.error').at(-1).data.action, 'host.refresh');
  h.bridge.close();
});

test('profile responses crossing an admin review refetch authority before acknowledging the saved profile', async () => {
  for (const approved of [false, true]) {
    const h = harness(), saved = deferred();
    const initial = approved ? { ...account(), requiresOnboarding: false } : approvedAccount();
    await h.session.setSessionTokens(tokenPair()); h.overrides.me = () => initial;
    h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
    h.overrides.saveProfile = () => saved.promise;
    h.bridge.handle({ type: 'profile.save', data: { name: 'Saved Name', requestId: 27 } });
    const latest = approved ? approvedAccount() : { ...account(), user: { ...account().user, hostStatus: 'suspended', isVerifiedHost: false }, requiresOnboarding: false };
    latest.user.name = 'Saved Name'; h.overrides.me = () => latest;
    h.live[0].onEvent({ type: 'verification.status', data: { status: approved ? 'verified' : 'rejected', hostStatus: approved ? 'approved' : 'suspended' } }); await settle();
    const readsAfterReview = h.count('me');
    saved.resolve(initial); await settle();
    const delivered = h.find('profile.saved').at(-1).data;
    assert.equal(delivered.requestId, 27); assert.equal(delivered.account.user.name, 'Saved Name', 'Ordinary profile data is retained from the current saved account');
    assert.equal(delivered.account.user.role, approved ? 'host' : 'sender');
    assert.equal(delivered.account.user.isVerifiedHost, approved);
    assert.equal(delivered.account.user.hostStatus, approved ? 'approved' : 'suspended');
    assert.equal(h.count('me'), readsAfterReview + 1, 'A stale save response is replaced by a fresh account read');
    h.bridge.close();
  }
});

test('a delayed session restore cannot regrant an approval revoked while the account request was pending', async () => {
  const h = harness(), older = deferred();
  await h.session.setSessionTokens(tokenPair()); h.overrides.me = () => approvedAccount();
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.me = () => older.promise;
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.me = () => ({ ...account(), user: { ...account().user, hostStatus: 'rejected', isVerifiedHost: false }, requiresOnboarding: false });
  h.live[0].onEvent({ type: 'verification.status', data: { status: 'rejected', hostStatus: 'rejected' } }); await settle();
  assert.equal(h.find('host.access').at(-1).data.approved, false);
  older.resolve(approvedAccount()); await settle();
  const restored = h.find('session').at(-1).data;
  assert.equal(restored.user.role, 'sender'); assert.equal(restored.user.hostStatus, 'rejected'); assert.equal(restored.user.isVerifiedHost, false);
  assert.equal(h.find('session').length, 2, 'Restore completes normally using current account state');
  assert.equal(h.find('host.access').at(-1).data.approved, false);
  h.bridge.close();
});

test('resource loading starts before list reads and settles failures with an explicit error', async () => {
  const h = harness(), chats = deferred();
  await h.session.setSessionTokens(tokenPair());
  h.overrides.chats = () => {
    assert.equal(h.find('data.loading').filter(event => event.data.resource === 'chats').at(-1).data.loading, true);
    return chats.promise;
  };
  h.bridge.handle({ type: 'data.reload', data: {} }); await settle();
  const resources = ['home', 'notifications', 'catalog', 'chats', 'missed', 'calls', 'transactions', 'posts', 'wallet', 'profileSettings'];
  for (const resource of resources) {
    const loading = h.find('data.loading').filter(event => event.data.resource === resource);
    assert.equal(loading[0].data.loading, true, `${resource} begins loading`);
    assert.equal(loading.at(-1).data.loading, resource === 'chats', `${resource} tracks actual completion`);
  }
  chats.reject(new h.ApiError('Chat history is temporarily unavailable', 503)); await settle();
  const ended = h.find('data.loading').filter(event => event.data.resource === 'chats').at(-1).data;
  assert.equal(ended.loading, false); assert.equal(ended.error, 'Chat history is temporarily unavailable');
  assert.equal(h.find('data.chats').length, 0, 'A failed read must not masquerade as an empty list');
  h.bridge.close();
});

test('stale home and search reads cannot finish or error a newer skeleton', async () => {
  for (const [type, resource] of [['home.reload', 'home'], ['hosts.search', 'search']]) {
    const h = harness(), older = deferred(), newer = deferred();
    h.overrides.home = query => query.q === 'old' ? older.promise : newer.promise;
    h.bridge.handle({ type, data: { q: 'old', page: 1 } });
    h.bridge.handle({ type, data: { q: 'latest', page: 2 } });
    older.reject(new h.ApiError('Old request failed', 503)); await settle();
    let loading = h.find('data.loading').filter(event => event.data.resource === resource);
    assert.equal(loading.length, 2); assert.ok(loading.every(event => event.data.loading));
    assert.equal(h.find('operation.error').length, 0, 'Stale failures cannot show over the current request');
    newer.resolve({ hosts: [], total: 0, page: 2 }); await settle();
    loading = h.find('data.loading').filter(event => event.data.resource === resource);
    assert.equal(loading.length, 3); assert.equal(loading[2].data.loading, false);
    assert.equal(loading[2].data.q, 'latest'); assert.equal(loading[2].data.page, 2);
    assert.equal(loading[2].data.error, undefined);
    h.bridge.close();
  }
});

test('thread loading follows the newest conversation and ends after its messages arrive', async () => {
  const h = harness(), older = deferred(), newer = deferred();
  h.overrides.thread = id => id === 'old-peer' ? older.promise : newer.promise;
  h.bridge.handle({ type: 'chat.open', data: { with: 'old-peer' } });
  h.bridge.handle({ type: 'chat.open', data: { with: 'new-peer' } });
  older.resolve({ messages: [{ text: 'old private message' }] }); await settle();
  assert.equal(h.find('data.thread').length, 0);
  assert.equal(h.find('data.loading').filter(event => event.data.resource === 'thread' && !event.data.loading).length, 0);
  newer.resolve({ messages: [{ text: 'new message' }] }); await settle();
  const thread = h.find('data.thread')[0]; assert.equal(thread.data.with, 'new-peer');
  const done = h.find('data.loading').filter(event => event.data.resource === 'thread').at(-1);
  assert.equal(done.data.loading, false); assert.ok(h.posts.indexOf(done) > h.posts.indexOf(thread));
  h.bridge.close();
});

test('conversation reload validates page requests and keeps the latest response authoritative', async () => {
  const h = harness(), old = deferred(), latest = deferred();
  for (const page of [0, -1, 1.5, '2', 10001]) {
    const message = { type: 'chats.reload', data: { page } };
    assert.equal(h.webMessages.parseWebMessage(JSON.stringify(message)), null);
    h.bridge.handle(message);
  }
  assert.equal(h.count('chats'), 0);
  h.overrides.chats = page => page === 1 ? old.promise : latest.promise;
  h.bridge.handle({ type: 'chats.reload', data: {} });
  h.bridge.handle({ type: 'chats.reload', data: { page: 2 } });
  old.resolve({ chats: [{ last: 'Stale first page' }], page: 1 }); await settle();
  assert.equal(h.find('data.chats').length, 0);
  assert.equal(h.find('data.loading').filter(event => event.data.resource === 'chats' && !event.data.loading).length, 0);
  latest.resolve({ chats: [{ last: 'Current second page' }], page: 2, unreadCount: 8 }); await settle();
  assert.equal(h.find('data.chats')[0].data.page, 2);
  assert.equal(h.find('data.chats')[0].data.unreadCount, 8);
  assert.equal(h.find('data.loading').at(-1).data.page, 2);
  assert.equal(h.find('data.loading').at(-1).data.loading, false);
  h.bridge.close();
});

test('mark all read waits for the server, rejects duplicate submissions and reloads real unread counts', async () => {
  const h = harness(), write = deferred(), reload = deferred();
  h.overrides.readAllChats = () => write.promise;
  h.overrides.chats = () => reload.promise;
  h.bridge.handle({ type: 'chats.readAll', data: {} });
  h.bridge.handle({ type: 'chats.readAll', data: {} });
  await settle();
  assert.equal(h.count('readAllChats'), 1);
  assert.equal(h.find('chats.readAll').length, 0, 'A tap is not a read acknowledgment');
  assert.equal(h.find('data.chats').length, 0);
  write.resolve({ updated: 9, readAt: '2026-10-13T09:00:00.000Z' }); await settle();
  assert.equal(h.find('chats.readAll')[0].data.updated, 9);
  assert.equal(h.count('chats'), 1);
  assert.equal(h.find('data.chats').length, 0, 'Do not fabricate zero unread after acknowledgment');
  reload.resolve({ chats: [{ unread: 1 }], unreadCount: 1, unreadConversations: 1 }); await settle();
  assert.equal(h.find('data.chats')[0].data.unreadCount, 1, 'A message arriving during read-all stays unread');
  assert.equal(h.find('data.loading').at(-1).data.loading, false);
  h.bridge.close();
});

test('failed or retired read-all work cannot acknowledge or clear unread conversations', async () => {
  const h = harness();
  h.overrides.readAllChats = () => { throw new h.ApiError('Read status could not be saved', 503); };
  h.bridge.handle({ type: 'chats.readAll', data: {} }); await settle();
  assert.equal(h.find('chats.readAll').length, 0);
  assert.equal(h.count('chats'), 0);
  assert.equal(h.find('operation.error')[0].data.action, 'chats.readAll');
  const pending = deferred(); h.overrides.readAllChats = () => pending.promise;
  h.bridge.handle({ type: 'chats.readAll', data: {} });
  h.bridge.handle({ type: 'auth.logout', data: {} }); await settle();
  pending.resolve({ updated: 3, readAt: '2026-10-13T09:00:00.000Z' }); await settle();
  assert.equal(h.find('chats.readAll').length, 0);
  assert.equal(h.count('chats'), 0);
  h.bridge.close();
});

test('thread reads acknowledge only server success and preserve unread messages outside the fetched page', async () => {
  const h = harness(), pending = deferred();
  h.overrides.thread = () => pending.promise;
  h.overrides.chats = () => ({ chats: [{ user: { id: 'peer' }, unread: 7 }], unreadCount: 7 });
  h.bridge.handle({ type: 'chat.open', data: { with: 'peer' } });
  assert.equal(h.count('chats'), 0, 'Opening a thread must not optimistically reset counts');
  pending.resolve({ messages: [{ id: 'message-id', text: 'Fetched message', mine: false }], readAt: '2026-10-13T09:00:00.000Z' }); await settle();
  assert.equal(h.find('data.thread')[0].data.readAt, '2026-10-13T09:00:00.000Z');
  assert.equal(h.find('data.chats')[0].data.unreadCount, 7);
  h.overrides.thread = () => { throw new h.ApiError('Messages unavailable', 503); };
  h.bridge.handle({ type: 'chat.open', data: { with: 'other-peer' } }); await settle();
  assert.equal(h.find('data.thread').length, 1);
  assert.equal(h.count('chats'), 1, 'Failed history does not announce a read');
  h.bridge.close();
});

test('read receipt and reconnect invalidations reload conversations and stop after logout', async () => {
  const h = harness();
  await h.session.setSessionTokens(tokenPair());
  h.overrides.me = () => ({ ...account(), requiresOnboarding: false });
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  const initial = h.count('chats');
  h.overrides.chats = () => ({ chats: [], unreadCount: 4, unreadConversations: 2 });
  h.live[0].onEvent({ type: 'chats.updated', data: {} }); await settle();
  assert.equal(h.count('chats'), initial + 1);
  assert.equal(h.find('data.chats').at(-1).data.unreadCount, 4);
  assert.equal(h.find('chats.updated').length, 0, 'Internal invalidations are consumed by the native bridge');
  h.live[0].onEvent({ type: 'realtime.status', data: { connected: true } }); await settle();
  assert.equal(h.count('chats'), initial + 2);
  h.bridge.handle({ type: 'auth.logout', data: {} }); await settle();
  h.live[0].onEvent({ type: 'chats.updated', data: {} }); await settle();
  assert.equal(h.count('chats'), initial + 2);
  h.bridge.close();
});

test('a successful message send refreshes conversations while failed sends leave server unread state intact', async () => {
  const h = harness(), pending = deferred();
  h.overrides.sendMessage = () => pending.promise;
  h.bridge.handle({ type: 'chat.send', data: { to: 'peer', text: 'Hello' } });
  assert.equal(h.count('chats'), 0);
  pending.resolve({}); await settle();
  assert.equal(h.count('chats'), 1);
  h.overrides.sendMessage = () => { throw new h.ApiError('Message could not be sent', 503); };
  h.bridge.handle({ type: 'chat.send', data: { to: 'peer', text: 'Try again' } }); await settle();
  assert.equal(h.count('chats'), 1);
  assert.equal(h.find('operation.error').at(-1).data.action, 'chat.send');
  h.bridge.close();
});

test('profile settings and privacy messages accept only supported preferences, never account authority or call availability', async () => {
  const h = harness();
  const invalid = [
    { type: 'profile.settings.save', data: {} }, { type: 'profile.settings.save', data: { requestId: 1 } },
    { type: 'profile.settings.save', data: { role: 'host', hostStatus: 'approved' } },
    { type: 'profile.settings.save', data: { appearance: 'javascript:alert(1)' } },
    { type: 'profile.settings.save', data: { pushNotifications: 1 } },
    { type: 'profile.settings.save', data: { matchCategory: 'Fake category' } },
    { type: 'profile.settings.save', data: { languages: ['English', ' english '] } },
    { type: 'profile.settings.save', data: { languages: ['<script>'] } },
    { type: 'profile.settings.save', data: { city: 'x'.repeat(101) } },
    { type: 'privacy.save', data: { allowRequests: true } }, { type: 'privacy.save', data: { showActivity: 'true' } },
    { type: 'settings.set', data: { showMvps: true } }, { type: 'blocked.load', data: { page: -1 } },
    { type: 'block.set', data: { id: '../other-user', blocked: true } }, { type: 'block.set', data: { id: 'user', blocked: 'false' } },
  ];
  for (const message of invalid) { assert.equal(h.webMessages.parseWebMessage(JSON.stringify(message)), null); h.bridge.handle(message); }
  for (const data of [{ matchCategory: null }, { appearance: 'system' }, { languages: ['English', 'हिन्दी'] }, { city: '' }]) assert.ok(h.webMessages.parseWebMessage(JSON.stringify({ type: 'profile.settings.save', data })));
  await settle(); assert.equal(h.calls.length, 0); h.bridge.close();
});

test('profile settings reads report actual loading and never allow stale responses to replace the current summary', async () => {
  const h = harness(), old = deferred(), latest = deferred(); let reads = 0;
  h.overrides.profileSettings = () => ++reads === 1 ? old.promise : latest.promise;
  h.bridge.handle({ type: 'profile.settings.load', data: {} });
  h.bridge.handle({ type: 'profile.settings.load', data: {} });
  old.resolve(profileSettings('dark')); await settle();
  assert.equal(h.find('data.profileSettings').length, 0);
  assert.equal(h.find('data.loading').filter(event => !event.data.loading).length, 0);
  latest.resolve(profileSettings('light')); await settle();
  assert.equal(h.find('data.profileSettings')[0].data.preferences.appearance, 'light');
  assert.equal(h.find('data.loading').at(-1).data.resource, 'profileSettings'); assert.equal(h.find('data.loading').at(-1).data.loading, false);
  h.overrides.profileSettings = () => { throw new h.ApiError('Settings unavailable', 503); };
  h.bridge.handle({ type: 'profile.settings.load', data: {} }); await settle();
  assert.equal(h.find('data.loading').at(-1).data.error, 'Settings unavailable');
  assert.equal(h.find('data.profileSettings').length, 1, 'A failed read never fabricates empty statistics or defaults');
  h.bridge.close();
});

test('profile edits retire settings reads from before and during the write, then reload the saved fields', async () => {
  const h = harness(), before = deferred(), during = deferred(), saved = deferred(), fresh = deferred(); let reads = 0;
  h.overrides.profileSettings = () => [before, during, fresh][reads++].promise;
  h.overrides.saveProfile = () => saved.promise;
  h.bridge.handle({ type: 'profile.settings.load', data: {} });
  h.bridge.handle({ type: 'profile.save', data: { name: 'Updated Name', requestId: 29 } });
  before.resolve(profileSettings()); await settle();
  assert.equal(h.find('data.profileSettings').length, 0, 'A read begun before editing is retired immediately');
  h.bridge.handle({ type: 'profile.settings.load', data: {} });
  saved.resolve({ ...account(), user: { ...account().user, name: 'Updated Name', city: 'Delhi' } }); await settle();
  assert.equal(h.find('profile.saved')[0].data.account.user.name, 'Updated Name');
  assert.equal(reads, 3, 'Successful profile save reloads the canonical settings summary');
  during.resolve(profileSettings()); await settle();
  assert.equal(h.find('data.profileSettings').length, 0, 'A read begun during the write cannot overwrite saved fields');
  const summary = profileSettings(); summary.profile.name = 'Updated Name'; summary.profile.city = 'Delhi';
  fresh.resolve(summary); await settle();
  assert.equal(h.find('data.profileSettings')[0].data.profile.name, 'Updated Name');
  assert.equal(h.find('data.profileSettings')[0].data.profile.city, 'Delhi');
  assert.equal(h.find('data.loading').filter(event => event.data.resource === 'profileSettings').at(-1).data.loading, false);
  h.bridge.close();
});

test('settings saves acknowledge server values once and retire an older summary read', async () => {
  const h = harness(), oldRead = deferred(), save = deferred();
  h.overrides.profileSettings = () => oldRead.promise; h.overrides.saveProfileSettings = () => save.promise;
  h.bridge.handle({ type: 'profile.settings.load', data: {} });
  const mutation = { type: 'profile.settings.save', data: { appearance: 'light', requestId: 7 } };
  h.bridge.handle(mutation); h.bridge.handle(mutation); h.bridge.handle({ type: 'settings.set', data: mutation.data }); await settle();
  assert.equal(h.count('saveProfileSettings'), 1, 'New and legacy aliases share the same mutation lock');
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.find(call => call.name === 'saveProfileSettings').args[0])), { appearance: 'light' }, 'The correlation ID is never persisted as a preference');
  assert.equal(h.find('profile.settings.saved').length, 0); assert.equal(h.find('data.profileSettings').length, 0);
  save.resolve(profileSettings('light')); await settle();
  assert.equal(h.find('profile.settings.saved')[0].data.requestId, 7);
  assert.equal(h.find('profile.settings.saved')[0].data.settings.preferences.appearance, 'light');
  oldRead.resolve(profileSettings('dark')); await settle();
  assert.equal(h.find('data.profileSettings').length, 1); assert.equal(h.find('data.profileSettings')[0].data.preferences.appearance, 'light');
  assert.equal(h.find('data.loading').at(-1).data.loading, false);
  h.bridge.close();
});

test('settings write failures retain the previous server summary and account changes suppress late acknowledgments', async () => {
  const h = harness();
  h.overrides.saveProfileSettings = () => { throw new h.ApiError('Could not save preferences', 503); };
  h.bridge.handle({ type: 'profile.settings.save', data: { pushNotifications: false, requestId: 11 } }); await settle();
  assert.equal(h.find('profile.settings.error')[0].data.requestId, 11); assert.equal(h.find('profile.settings.saved').length, 0); assert.equal(h.find('data.profileSettings').length, 0);
  const save = deferred(); h.overrides.saveProfileSettings = () => save.promise;
  h.bridge.handle({ type: 'profile.settings.save', data: { appearance: 'light', requestId: 12 } });
  h.bridge.handle({ type: 'auth.logout', data: {} }); await settle();
  save.resolve(profileSettings('light')); await settle();
  assert.equal(h.find('profile.settings.saved').length, 0); assert.equal(h.find('data.profileSettings').length, 0);
  h.bridge.close();
});

test('privacy updates send only the selected public preference and acknowledge effective server privacy', async () => {
  const h = harness(), write = deferred(); h.overrides.savePrivacy = () => write.promise;
  h.bridge.handle({ type: 'privacy.save', data: { discoverable: false, requestId: 4 } }); await settle();
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.find(call => call.name === 'savePrivacy').args[0])), { discoverable: false });
  assert.equal(h.find('privacy.saved').length, 0);
  write.resolve({ discoverable: false, showActivity: true, allowRequests: false }); await settle();
  assert.equal(h.find('privacy.saved')[0].data.privacy.allowRequests, false); assert.equal(h.find('privacy.saved')[0].data.requestId, 4);
  assert.equal(h.count('profileSettings'), 1); assert.equal(h.count('home'), 1);
  h.overrides.savePrivacy = () => { throw new h.ApiError('Privacy could not be saved', 503); };
  h.bridge.handle({ type: 'privacy.save', data: { showActivity: false, requestId: 5 } }); await settle();
  assert.equal(h.find('privacy.error')[0].data.requestId, 5); assert.equal(h.find('privacy.saved').length, 1);
  h.bridge.close();
});

test('blocking waits for server success and refreshes real lists while failures retain the existing block state', async () => {
  const h = harness(), write = deferred(); h.overrides.setBlocked = () => write.promise;
  h.overrides.blockedUsers = page => ({ users: [{ id: 'blocked-user', name: 'Blocked User' }], total: 1, page, limit: 20 });
  h.bridge.handle({ type: 'block.set', data: { id: 'blocked-user', blocked: true, requestId: 14 } }); await settle();
  assert.equal(h.find('block.saved').length, 0); assert.equal(h.count('blockedUsers'), 0);
  write.resolve(); await settle();
  assert.equal(h.find('block.saved')[0].data.id, 'blocked-user'); assert.equal(h.find('block.saved')[0].data.blocked, true);
  assert.equal(h.find('data.blocked')[0].data.users[0].id, 'blocked-user');
  for (const name of ['blockedUsers', 'profileSettings', 'home', 'chats']) assert.equal(h.count(name), 1);
  assert.equal(h.find('data.loading').filter(event => event.data.resource === 'blocked').at(-1).data.loading, false);
  h.overrides.setBlocked = () => { throw new h.ApiError('Unblock failed', 503); };
  h.bridge.handle({ type: 'block.set', data: { id: 'blocked-user', blocked: false, requestId: 15 } }); await settle();
  assert.equal(h.find('block.error')[0].data.id, 'blocked-user'); assert.equal(h.find('block.error')[0].data.blocked, false);
  assert.equal(h.find('block.saved').length, 1); assert.equal(h.count('blockedUsers'), 1);
  h.bridge.handle({ type: 'blocked.load', data: { page: 2 } }); await settle();
  assert.equal(h.find('data.blocked').at(-1).data.page, 2); assert.equal(h.find('data.loading').filter(event => event.data.resource === 'blocked').at(-1).data.page, 2);
  h.bridge.close();
});

test('account preference events reload the summary without changing host authority and stop after logout', async () => {
  const h = harness(); await h.session.setSessionTokens(tokenPair());
  h.overrides.me = () => ({ ...account(), requiresOnboarding: false });
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  const reads = h.count('profileSettings'), authority = h.find('host.access').length;
  h.overrides.profileSettings = () => profileSettings('system');
  h.live[0].onEvent({ type: 'account.updated', data: {} }); await settle();
  assert.equal(h.count('profileSettings'), reads + 1); assert.equal(h.find('data.profileSettings').at(-1).data.preferences.appearance, 'system');
  assert.equal(h.find('host.access').length, authority);
  h.bridge.handle({ type: 'auth.logout', data: {} }); await settle();
  h.live[0].onEvent({ type: 'account.updated', data: {} }); await settle();
  assert.equal(h.count('profileSettings'), reads + 1); h.bridge.close();
});

test('realtime wallet reads use loading events and logout suppresses old completion', async () => {
  const h = harness(), wallet = deferred(), catalog = deferred();
  await h.session.setSessionTokens(tokenPair());
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.wallet = () => wallet.promise;
  h.live[0].onEvent({ type: 'wallet.refresh', data: {} });
  assert.equal(h.find('data.loading').filter(event => event.data.resource === 'wallet').at(-1).data.loading, true);
  wallet.resolve({ coins: 42, earningsPaise: 0 }); await settle();
  assert.equal(h.find('wallet.balance').at(-1).data.coins, 42);
  assert.equal(h.find('data.loading').filter(event => event.data.resource === 'wallet').at(-1).data.loading, false);
  h.overrides.catalog = () => catalog.promise;
  h.bridge.handle({ type: 'catalog.load', data: {} });
  h.bridge.handle({ type: 'auth.logout', data: {} }); await settle();
  const previous = h.posts.length;
  catalog.reject(new h.ApiError('Old account catalog failed', 503)); await settle();
  assert.equal(h.posts.length, previous, 'An old session cannot finish a new screen loading state');
  h.bridge.close();
});
