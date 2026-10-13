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
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.acceptCall = () => accepted.promise;
  h.bridge.handle({ type: 'call.accept', data: { callId: 'incoming-id' } });
  h.bridge.handle({ type: 'call.end', data: {} });
  accepted.resolve({ peerId: 'member-id', voice: true }); await settle();
  h.live[0].onEvent({ type: 'call.connected', data: { callId: 'incoming-id', initiator: false, peerId: 'member-id', voice: true } }); await settle();
  assert.equal(h.find('call.connected').length, 0);
  assert.ok(h.count('endCall') >= 1);
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
  const resources = ['home', 'notifications', 'catalog', 'chats', 'missed', 'calls', 'transactions', 'posts', 'wallet'];
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
