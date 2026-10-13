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
  const disk = new Map(), calls = [], posts = [], live = [], saved = [], haptics = [], effects = [];
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
        return () => { connection.stopped = true; };
      } };
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (id === 'react-native') return { ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: styles => styles } };
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
  return { session, bridge, bridgeModule, webMessages, load, ApiError, overrides, calls, posts, live, saved, count, find, disk, haptics, effects };
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
