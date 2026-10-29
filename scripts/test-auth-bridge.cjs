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
const themeCatalog = (premium = false, selectedThemeId = '000000000000000000000001') => ({ items: [], selectedThemeId, premium: { active: premium, pricePaise: 29900, currency: 'INR', paymentsAvailable: true, purchaseType: 'lifetime' } });
const payoutReceipt = (id = 'payout-1') => ({ id, amountPaise: 50000, payoutAddress: 'creator@upi', status: 'pending', createdAt: '2026-10-22T08:00:00.000Z' });
const payoutMessage = (requestId = 1) => ({ type: 'payout.request', data: { amountPaise: 50000, payoutAddress: 'creator@upi', idempotencyKey: 'withdrawal-attempt-1', requestId } });
const plain = value => JSON.parse(JSON.stringify(value));

function harness(initialAppState = 'active', initialLink = null, liveStreaming = false) {
  const disk = new Map(), calls = [], posts = [], live = [], saved = [], haptics = [], capture = [], effects = [], opened = [], signals = [], activities = [], keyboards = [], links = [], shares = [], backs = [], alerts = [], exits = [];
  const overrides = {};
  // The FCM edge: OS permission, the device token and notification taps.
  const push = { status: 'registered', token: 'fcm:device-token', modes: [], cleared: 0, stopped: 0, open: undefined, answer: undefined, tracked: [], tokenListener: undefined };
  const pushModule = {
    startPush: (onOpen, onAnswer) => { push.open = onOpen; push.answer = onAnswer; return () => { push.stopped++; }; },
    trackCall: message => { push.tracked.push(message.type); },
    askForCallAlerts: () => {},
    registerPush: async (save, mode) => {
      push.modes.push(mode);
      if (push.status !== 'registered') return push.status;
      try { await save(push.token); return 'registered'; } catch { return 'unavailable'; }
    },
    onPushTokenChange: listener => { push.tokenListener = listener; return () => { push.tokenListener = undefined; }; },
    clearDeliveredPush: () => { push.cleared++; },
  };
  class ApiError extends Error {
    constructor(message, status, code, retryAfterSeconds) { super(message); Object.assign(this, { status, code, retryAfterSeconds }); }
  }
  const connectionListeners = new Set();
  let connectionStatus;
  const connection = {
    listeners: connectionListeners,
    emit: status => { connectionStatus = status; for (const listener of connectionListeners) listener(status); },
  };
  const client = {
    ApiError, errorMessage: (error) => error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
    getConnectionStatus: () => connectionStatus,
    onConnectionChanged: listener => { connectionListeners.add(listener); return () => connectionListeners.delete(listener); },
    checkConnection: async () => { calls.push({ name: 'checkConnection', args: [] }); return overrides.checkConnection ? overrides.checkConnection() : true; },
  };
  const defaults = {
    me: () => account(), verifyOtp: () => ({ ...account(), tokens: tokenPair(), isNew: true }),
    sendOtp: () => ({ resendAfter: 60, expiresIn: 300, otpLength: 6 }), saveProfile: () => account(),
    hosts: () => ({ hosts: [] }), chats: () => ({ chats: [] }), thread: () => ({ messages: [], canSend: true }), missedCalls: () => ({ calls: [] }), callHistory: () => ({ calls: [] }),
    transactions: () => ({ items: [] }), wallet: () => ({ coins: 100, earningsPaise: 0 }), logout: () => {},
    home: () => ({ hosts: [], stage: [], featured: null, page: 1 }), notifications: () => ({ items: [], unreadCount: 0 }), catalog: () => ({ gifts: [], packs: [], paymentsAvailable: false }), presence: () => ({ online: true, visible: true }),
    profileSettings: () => profileSettings(), themes: () => themeCatalog(), blockedUsers: () => ({ users: [], total: 0, page: 1, limit: 20 }),
    payouts: (page = 1) => ({ items: [], total: 0, page, limit: 20 }),
    streamRequests: streamId => ({ streamId, requests: [], count: 0, ownRequestId: null }),
    ads: () => ({ adFree: false, items: [] }),
  };
  const api = new Proxy({}, { get: (_, name) => async (...args) => {
    calls.push({ name, args });
    return (overrides[name] ?? defaults[name] ?? (() => undefined))(...args);
  } });
  const storage = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7,
    getItem: key => disk.get(key) ?? null,
    getItemAsync: async key => { if (overrides.getStorage) await overrides.getStorage(key); return disk.get(key) ?? null; },
    setItemAsync: async (key, value) => { if (overrides.setStorage) await overrides.setStorage(key, value); disk.set(key, value); },
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
      if (id === './push') return pushModule;
      if (id === './features') return { LIVE_STREAMING_ENABLED: liveStreaming };
      if (id === './chat-photo-download') return { downloadChatPhoto: async (to, messageId, current) => { calls.push({ name: 'downloadChatPhoto', args: [to, messageId, current] }); if (overrides.downloadChatPhoto) return overrides.downloadChatPhoto(to, messageId, current); } };
      if (id === './api/realtime') return { VERIFY_PEER: 'zimi-team', connectRealtime: (token, onEvent, userId, initiallyActive) => {
        const connection = { token, onEvent, userId, initiallyActive, activeStates: [], stopped: false }; live.push(connection);
        const stop = () => { connection.stopped = true; };
        stop.send = async (...args) => { signals.push(args); };
        stop.setActive = active => { connection.activeStates.push(active); };
        return stop;
      } };
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (id === 'react-native') return { Alert: { alert: (...args) => alerts.push(args) }, Keyboard: { addListener: (name, fn) => { const entry = [name, fn]; keyboards.push(entry); return { remove: () => { keyboards.splice(keyboards.indexOf(entry), 1); } }; } }, BackHandler: { exitApp: () => exits.push(true), addEventListener: (_name, fn) => { backs.push(fn); return { remove: () => { backs.splice(backs.indexOf(fn), 1); } }; } }, AppState: { currentState: initialAppState, addEventListener: (_name, fn) => { activities.push(fn); return { remove: () => { activities.splice(activities.indexOf(fn), 1); } }; } }, Linking: { openURL: async url => { if (overrides.openURL) await overrides.openURL(url); opened.push(url); }, getInitialURL: async () => typeof initialLink === 'function' ? initialLink() : initialLink, addEventListener: (_name, fn) => { links.push(fn); return { remove: () => { links.splice(links.indexOf(fn), 1); } }; } }, Share: { share: async content => { shares.push(content); return overrides.share ? overrides.share(content) : { action: 'sharedAction' }; } }, ActivityIndicator: 'ActivityIndicator', KeyboardAvoidingView: 'KeyboardAvoidingView', Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: styles => styles } };
      if (id === 'react-native-webview') return { WebView: 'WebView' };
      if (id === 'react-native-safe-area-context') return { SafeAreaProvider: 'SafeAreaProvider', SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 28, right: 0, bottom: 24, left: 0 }) };
      if (id === 'expo-status-bar') return { StatusBar: 'StatusBar' };
      if (id === 'expo-screen-capture') return { preventScreenCaptureAsync: async key => capture.push(['prevent', key]), allowScreenCaptureAsync: async key => capture.push(['allow', key]) };
      if (id === 'expo-haptics') return { selectionAsync: async () => haptics.push('selection'), notificationAsync: async kind => haptics.push(kind), impactAsync: async kind => haptics.push(kind), NotificationFeedbackType: { Success: 'success', Error: 'error' }, ImpactFeedbackStyle: { Light: 'light' } };
      if (id === './assets/aurora-bundle') return { __esModule: true, default: '<html>Native app</html>' };
      if (id === './src/launch-screen') return { LaunchScreen: 'LaunchScreen' };
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
  return { session, bridge, bridgeModule, webMessages, load, ApiError, overrides, calls, posts, live, saved, count, find, disk, haptics, capture, effects, opened, signals, activities, keyboards, links, shares, backs, alerts, exits, connection, push };
}

// Retain dormant broadcasting coverage for a future rollout, with explicit opt-in
// at the mocked module boundary. Normal tests run with the production default.
const streamingHarness = (state = 'active', link = null) => harness(state, link, true);

test('the calls-only rollout blocks streaming commands and links while preserving cleanup, calls and gifts', async () => {
  const h = harness('active', 'binzolive://live/cold-room');
  assert.equal(h.load('src/features.ts').LIVE_STREAMING_ENABLED, false, 'The shipped native feature switch stays off');
  h.overrides.me = () => approvedAccount();
  await h.session.setSessionTokens(tokenPair());
  h.bridge.handle({ type: 'ready', data: { demo: false } }); await settle();
  h.links.forEach(listener => listener({ url: 'binzolive://live/warm-room' }));
  const commands = [
    { type: 'stream.start', data: { title: 'Blocked', category: 'Music' } },
    ...['join', 'ready', 'share', 'requests.load', 'request', 'react'].map(action => ({ type: 'stream.' + action, data: { streamId: 'room' } })),
    ...['cancel', 'decline', 'accept'].map(action => ({ type: 'stream.request.' + action, data: { streamId: 'room', id: 'entry' } })),
    { type: 'stream.message', data: { streamId: 'room', text: 'Hello' } },
    { type: 'stream.signal', data: { streamId: 'room', to: 'host', description: { type: 'offer', sdp: 'offer' } } },
    { type: 'gift.send', data: { to: 'host', gift: 'rose', coins: 10, inCall: false, streamId: 'room', idempotencyKey: 'stream-gift' } },
  ];
  const before = h.calls.length;
  for (const command of commands) h.bridge.handle(command);
  await settle();
  assert.equal(h.calls.length, before, 'Disabled stream actions never reach the API');
  assert.equal(h.find('operation.error').filter(event => event.data.code === 'LIVE_STREAMING_DISABLED').length, commands.length);
  assert.equal(h.count('stream'), 0); assert.equal(h.find('stream.link').length, 0); assert.equal(h.signals.length, 0); assert.equal(h.shares.length, 0);
  h.bridge.handle({ type: 'stream.end', data: { streamId: 'old-hosted-room' } });
  h.bridge.handle({ type: 'stream.leave', data: { streamId: 'old-viewed-room' } });
  h.overrides.startCall = () => ({ callId: 'direct-call' });
  h.bridge.handle({ type: 'call.start', data: { to: 'host', voice: false } }); await settle();
  h.overrides.sendGift = () => ({ id: 'call-gift', coins: 10 });
  h.bridge.handle({ type: 'gift.send', data: { to: 'host', gift: 'rose', coins: 10, inCall: true, idempotencyKey: 'direct-gift' } });
  h.bridge.handle({ type: 'rtc.signal', data: { callId: 'direct-call', description: { type: 'offer', sdp: 'offer' } } }); await settle();
  assert.equal(h.count('endStream'), 1); assert.equal(h.count('leaveStream'), 1);
  assert.equal(h.find('call.created').at(-1).data.callId, 'direct-call');
  assert.equal(h.calls.find(call => call.name === 'sendGift').args[3], 'direct-call');
  assert.equal(h.find('gift.sent').at(-1).data.id, 'call-gift'); assert.equal(h.signals[0][0], 'webrtc:signal');
  h.bridge.close();
});

test('disabled streaming ignores room events and cleans up delayed queue calls without disrupting direct calls', async () => {
  const h = harness(); h.overrides.me = () => approvedAccount();
  await h.session.setSessionTokens(tokenPair());
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  const before = h.posts.length;
  for (const type of ['stream.signal', 'stream.peer', 'stream.message', 'stream.requests.changed', 'stream.reaction']) {
    h.live[0].onEvent({ type, data: { streamId: 'old-room' } });
  }
  h.live[0].onEvent({ type: 'gift.received', data: { streamId: 'old-room', gift: 'rose' } });
  h.live[0].onEvent({ type: 'stream.privateCall', data: { streamId: 'old-room', callId: 'late-room-call', initiator: false } }); await settle();
  assert.equal(h.posts.length, before); assert.equal(h.count('streamRequests'), 0);
  assert.equal(h.calls.find(call => call.name === 'endCall').args[0], 'late-room-call');
  h.live[0].onEvent({ type: 'call.connected', data: { callId: 'direct-call', initiator: true } });
  assert.equal(h.find('call.connected').at(-1).data.callId, 'direct-call');
  h.live[0].onEvent({ type: 'gift.received', data: { gift: 'rose', coins: 10, from: 'member' } });
  assert.equal(h.find('gift.received').length, 1);
  h.bridge.close();
});

test('connection status follows the current WebView and retry never reloads account data', async () => {
  const h = harness();
  h.connection.emit({ connected: false, checking: false });
  assert.equal(h.find('connection.status').length, 0, 'Do not post into an unready document');
  h.bridge.handle({ type: 'ready', data: { demo: false } });
  await settle();
  assert.equal(h.find('connection.status').at(-1).data.connected, false, 'Replay the current connection after readiness');
  assert.equal(h.webMessages.parseWebMessage(JSON.stringify({ type: 'connection.check', data: { url: 'https://other.example' } })), null);
  h.overrides.checkConnection = () => {
    h.connection.emit({ connected: false, checking: true });
    h.connection.emit({ connected: true, checking: false });
    return true;
  };
  const before = h.calls.length;
  h.bridge.handle({ type: 'connection.check', data: {} });
  await settle();
  assert.deepEqual(h.calls.slice(before).map(call => call.name), ['checkConnection']);
  assert.equal(h.find('connection.status').at(-1).data.connected, true);
  h.bridge.documentLoading();
  const count = h.find('connection.status').length;
  h.connection.emit({ connected: false, checking: false });
  assert.equal(h.find('connection.status').length, count);
  h.bridge.close();
  assert.equal(h.connection.listeners.size, 0);
  h.connection.emit({ connected: true, checking: false });
  assert.equal(h.find('connection.status').length, count);
});

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

test('welcome activity stays disabled until onboarding completes and follows every app transition', async () => {
  const h = harness();
  h.bridge.handle(verifyMessage()); await settle();
  const connection = h.live[0];
  assert.equal(connection.initiallyActive, false, 'Onboarding sessions do not start automated welcomes');
  h.activities.forEach(listener => listener('active'));
  assert.deepEqual(connection.activeStates, [false]);
  h.overrides.saveProfile = () => ({ ...account(), requiresOnboarding: false });
  h.bridge.handle({ type: 'profile.save', data: { name: 'Alice', onboarding: true } }); await settle();
  assert.equal(connection.activeStates.at(-1), true, 'Completing onboarding enables foreground welcomes without reconnecting');
  for (const state of ['inactive', 'background', 'active']) h.activities.forEach(listener => listener(state));
  assert.deepEqual(connection.activeStates.slice(-3), [false, false, true]);
  const chatsBefore = h.count('chats');
  connection.onEvent({ type: 'chats.updated', data: {} }); await settle();
  assert.ok(h.count('chats') > chatsBefore, 'Post-onboarding chat events refresh the inbox');
  h.bridge.close(); assert.equal(connection.stopped, true); assert.equal(h.activities.length, 0);
});

test('a restored session in background waits for foreground before allowing welcomes', async () => {
  const h = harness('background');
  h.overrides.me = () => ({ ...account(), requiresOnboarding: false });
  await h.session.setSessionTokens(tokenPair());
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  assert.equal(h.live[0].initiallyActive, false);
  h.activities.forEach(listener => listener('active'));
  assert.equal(h.live[0].activeStates.at(-1), true);
  h.bridge.close();
});

test('malformed, unknown, oversized and invalid auth messages are ignored', async () => {
  const h = harness();
  const invalid = [null, [], {}, { type: 'auth.verifyOtp', data: [] }, { type: 'auth.verifyOtp', data: { ...verifyMessage().data, code: '123' } },
    { type: 'auth.sendOtp', data: { ...sendMessage().data, role: 'admin' } }, { type: 'auth.sendOtp', data: { ...sendMessage().data, phone: '+919876543210<script>' } }, { type: 'auth.sendOtp', data: { ...sendMessage().data, phone: '+447911123456', dialCode: '+1' } },
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
  send.resolve({ resendAfter: 60, expiresIn: 300, otpLength: 4 });
  await settle();
  assert.equal(h.find('auth.otpSent')[0].data.requestId, 2);
  assert.equal(h.find('auth.otpSent')[0].data.otpLength, 4, 'The bridge forwards the configured input length');
  verify.resolve({ ...account(), tokens: tokenPair(), isNew: false });
  await settle();
  assert.equal(h.find('auth.ok')[0].data.requestId, 4);
  h.bridge.close();
});

test('OTP messages allow provider lengths four through eight and preserve leading zeroes', async () => {
  const h = harness();
  for (const code of ['0123', '01234', '012345', '0123456', '01234567']) {
    const message = { ...verifyMessage(), data: { ...verifyMessage().data, code } };
    assert.equal(h.webMessages.parseWebMessage(JSON.stringify(message)).data.code, code);
  }
  for (const code of ['012', '012345678', '01a3', '01 3']) {
    assert.equal(h.webMessages.parseWebMessage(JSON.stringify({ ...verifyMessage(), data: { ...verifyMessage().data, code } })), null);
  }
  h.bridge.handle({ ...verifyMessage(), data: { ...verifyMessage().data, code: '0123' } });
  await settle();
  assert.equal(h.count('verifyOtp'), 1);
  assert.equal(h.find('auth.ok').length, 1, 'A four-digit code reaches server verification');
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

test('email checks accept only bounded addresses, correlate answers and report failures apart from sign-in errors', async () => {
  const h = harness();
  await h.session.setSessionTokens(tokenPair());
  const parse = data => h.webMessages.parseWebMessage(JSON.stringify({ type: 'auth.emailCheck', data }));
  assert.ok(parse({ email: 'new@example.test', requestId: 3 }));
  for (const data of [
    { email: 'new@example.test' }, { email: 'not-an-email', requestId: 3 }, { email: 'new @example.test', requestId: 3 },
    { email: `${'a'.repeat(250)}@example.test`, requestId: 3 }, { email: 'new@example.test', requestId: 3, userId: 'someone-else' },
  ]) assert.equal(parse(data), null, JSON.stringify(data));

  h.overrides.emailAvailable = email => email !== 'taken@example.test';
  h.bridge.handle({ type: 'auth.emailCheck', data: { email: 'taken@example.test', requestId: 7 } });
  h.bridge.handle({ type: 'auth.emailCheck', data: { email: 'new@example.test', requestId: 8 } });
  await settle();
  assert.deepEqual(JSON.parse(JSON.stringify(h.find('auth.emailChecked').map(post => post.data))), [
    { email: 'taken@example.test', requestId: 7, available: false },
    { email: 'new@example.test', requestId: 8, available: true },
  ]);

  h.overrides.emailAvailable = () => { throw new h.ApiError('Invalid input', 400, 'VALIDATION_ERROR'); };
  h.bridge.handle({ type: 'auth.emailCheck', data: { email: 'odd@example.co', requestId: 9 } });
  await settle();
  assert.deepEqual(JSON.parse(JSON.stringify(h.find('auth.emailChecked')[2].data)), { email: 'odd@example.co', requestId: 9, message: 'Invalid input', code: 'VALIDATION_ERROR', status: 400 });
  assert.equal(h.find('auth.error').length, 0, 'A failed check must not look like a failed sign-in');

  h.overrides.saveProfile = () => { throw new h.ApiError('This email is already used by another account. Try a different one.', 409, 'EMAIL_IN_USE'); };
  h.bridge.handle({ type: 'profile.save', data: { onboarding: true, requestId: 10, name: 'Alice' } });
  await settle();
  assert.equal(h.find('profile.error')[0].data.code, 'EMAIL_IN_USE', 'Onboarding can return to the email field');
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

test('native shell resizes the WebView for keyboard overlap before applying safe-area insets', () => {
  const h = harness();
  const provider = h.load('App.tsx').default();
  const [shell] = [provider.props.children].flat();
  const keyboard = shell.type(shell.props);
  const safeArea = keyboard.props.children;
  const web = [safeArea.props.children].flat().find(node => node?.type === 'WebView');
  const style = node => Object.assign({}, ...[node.props.style].flat());
  assert.equal(provider.type, 'SafeAreaProvider');
  assert.equal(keyboard.type, 'KeyboardAvoidingView', 'Measure keyboard overlap from the full root, outside safe-area padding');
  assert.equal(keyboard.props.behavior, 'padding', 'Handle overlay keyboards even when Android leaves the WebView viewport unchanged');
  assert.notEqual(keyboard.props.enabled, false);
  // The keyboard covers the navigation bar, which the SafeAreaView below still pads for.
  assert.equal(keyboard.props.keyboardVerticalOffset, -24, 'Keyboard padding leaves out the bottom inset, so no gap opens above the keyboard');
  assert.equal(safeArea.type, 'SafeAreaView');
  assert.deepEqual(Array.from(safeArea.props.edges || []), ['top', 'right', 'bottom', 'left'], 'Native safe-area padding owns every edge, so the web tab bar must not reserve the bottom inset again');
  assert.ok(web, 'The actual WebView must be inside the resized content');
  for (const node of [keyboard, safeArea, web]) assert.equal(style(node).flex, 1, 'Allow keyboard padding to shrink the WebView');
  assert.equal(style(keyboard).backgroundColor, style(safeArea).backgroundColor);
  assert.equal(style(safeArea).backgroundColor, style(web).backgroundColor);
  h.effects.forEach(cleanup => cleanup?.()); h.bridge.close();
});

test('the animated logo covers the app at launch instead of a loading skeleton', () => {
  const h = harness();
  const provider = h.load('App.tsx').default();
  const [keyboard, launch] = [provider.props.children].flat();
  const web = [keyboard.props.children.props.children].flat().find(node => node?.type === 'WebView');
  assert.equal(launch.type, 'LaunchScreen', 'The logo is drawn over the whole screen, outside the safe-area padding');
  assert.equal(launch.props.ready, false, 'The logo stays until the page reports its first screen');
  assert.equal(typeof launch.props.onHidden, 'function');
  assert.equal(keyboard.props.importantForAccessibility, 'no-hide-descendants', 'Screen readers do not reach the app under the logo');
  assert.equal(keyboard.props.accessibilityElementsHidden, true);
  assert.equal(web.props.renderLoading, undefined, 'The WebView draws no skeleton of its own');
  assert.equal(web.props.startInLoadingState, undefined);
  assert.ok(h.webMessages.parseWebMessage(JSON.stringify({ type: 'app.launched', data: {} })));
  assert.equal(h.webMessages.parseWebMessage(JSON.stringify({ type: 'app.launched', data: { at: 1 } })), null);
  h.effects.forEach(cleanup => cleanup?.()); h.bridge.close();
});

test('native app inactivity explicitly notifies the WebView and removes its listener on unmount', () => {
  const h = harness();
  const tree = h.load('App.tsx').default();
  function findWeb(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'WebView') return node;
    for (const child of [node.props?.children].flat()) { const found = findWeb(child); if (found) return found; }
    return null;
  }
  const web = findWeb(tree), received = [];
  assert.ok(web);
  web.props.ref.current = { injectJavaScript: script => vm.runInNewContext(script, { window: { zimiReceive: raw => received.push(JSON.parse(raw)) } }) };
  for (const listener of [...h.activities]) listener('active');
  assert.deepEqual(received, [{ type: 'app.foreground', data: {} }], 'Foregrounding resumes media without sending a background cleanup event');
  received.length = 0;
  for (const state of ['inactive', 'background']) for (const listener of [...h.activities]) listener(state);
  assert.deepEqual(received, [{ type: 'app.background', data: {} }, { type: 'app.background', data: {} }], 'Cleanup does not depend on document.hidden reaching the WebView');
  assert.equal(h.count('endCall'), 0, 'The voice cleanup event does not change call lifecycle behavior');
  h.effects.forEach(cleanup => cleanup?.()); h.bridge.close();
  assert.equal(h.activities.length, 0, 'Both the native listener and bridge observers are removed');
});

test('native App tells the page when the keyboard opens and closes', () => {
  const h = harness();
  const tree = h.load('App.tsx').default();
  const findWeb = node => !node || typeof node !== 'object' ? null : node.type === 'WebView' ? node : [node.props?.children].flat().map(findWeb).find(Boolean) || null;
  const web = findWeb(tree), received = [];
  web.props.ref.current = { injectJavaScript: script => vm.runInNewContext(script, { window: { zimiReceive: raw => received.push(JSON.parse(raw)) } }) };
  assert.deepEqual(h.keyboards.map(([name]) => name).sort(), ['keyboardDidHide', 'keyboardDidShow']);
  for (const name of ['keyboardDidShow', 'keyboardDidHide']) h.keyboards.find(([event]) => event === name)[1]();
  assert.deepEqual(received, [{ type: 'keyboard', data: { open: true } }, { type: 'keyboard', data: { open: false } }]);
  h.effects.forEach(cleanup => cleanup?.()); h.bridge.close();
  assert.equal(h.keyboards.length, 0, 'Keyboard listeners are removed with the app');
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

test('the app page alone turns screenshot protection on and off for private screens', async () => {
  const h = harness();
  const tree = h.load('App.tsx').default();
  function findWeb(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'WebView') return node;
    for (const child of [node.props?.children].flat()) { const found = findWeb(child); if (found) return found; }
    return null;
  }
  const web = findWeb(tree);
  const send = (url, data) => web.props.onMessage({ nativeEvent: { url, data: JSON.stringify({ type: 'screen.secure', data }) } });
  send('https://evil.example/', { on: false });
  send('https://aurora.localhost/', { on: 'yes' });
  assert.deepEqual(h.capture, [], 'Other pages and malformed messages cannot change protection');
  send('https://aurora.localhost/', { on: true });
  send('https://aurora.localhost/', { on: false });
  await settle();
  assert.deepEqual(h.capture.map(([action]) => action), ['prevent', 'allow']);
  assert.equal(new Set(h.capture.map(([, key]) => key)).size, 1, 'Both use one key, so allowing undoes exactly this protection');
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

test('chat text the server partly hid is reported back as delivered, and photos are sent through the same checks', async () => {
  const h = harness();
  await h.session.setSessionTokens(tokenPair());
  h.overrides.me = () => ({ ...account(), user: { ...account().user, serverRole: 'user', isPhoneVerified: true }, requiresOnboarding: false });
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.thread = () => ({ messages: [], canSend: true });
  h.overrides.sendMessage = () => ({ id: 'message-1', text: 'call ██████████' });
  h.bridge.handle({ type: 'chat.send', data: { to: 'host-1', text: 'call 9876543210' } });
  await settle();
  assert.deepEqual(JSON.parse(JSON.stringify(h.find('chat.sent').map(post => post.data))), [{ to: 'host-1', sent: 'call 9876543210', text: 'call ██████████', id: 'message-1', inCall: false, reply: null }]);
  h.overrides.sendMessage = () => ({ id: 'message-2', text: 'hello' });
  h.bridge.handle({ type: 'chat.send', data: { to: 'host-1', text: 'hello' } });
  await settle();
  assert.deepEqual(JSON.parse(JSON.stringify(h.find('chat.sent')[1].data)), { to: 'host-1', sent: 'hello', text: 'hello', id: 'message-2', inCall: false, reply: null }, 'Every sent message learns its server ID, for reply, edit and delete');
  const photo = 'data:image/png;base64,' + Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString('base64');
  h.overrides.sendPhotoMessage = () => ({ id: 'photo-1' });
  h.bridge.handle({ type: 'chat.photo', data: { to: 'host-1', photo } });
  await settle();
  assert.equal(h.count('sendPhotoMessage'), 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.find('chat.photoSent').map(post => post.data))), [{ to: 'host-1', id: 'photo-1', reply: null }]);
  for (const data of [{ to: 'host-1', photo: 'https://example.test/x.png' }, { to: 'host-1', photo: 'data:image/svg+xml;base64,PHN2Zz4=' }, { to: '', photo }])
    assert.equal(h.webMessages.parseWebMessage(JSON.stringify({ type: 'chat.photo', data })), null, 'Only a JPEG, PNG or WebP photo from the page can be sent');
  h.bridge.close();
});

test('text and photo replies return authoritative quotes after the original changes during sending', async () => {
  const h = harness(), textSend = deferred(), photoSend = deferred();
  await h.session.setSessionTokens(tokenPair());
  h.overrides.me = () => ({ ...account(), user: { ...account().user, serverRole: 'user' }, requiresOnboarding: false });
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.thread = () => ({ messages: [], canSend: true });
  h.overrides.sendMessage = () => textSend.promise;
  h.bridge.handle({ type: 'chat.send', data: { to: 'host-1', text: 'Yes!', replyTo: 'question-1' } }); await settle();
  assert.deepEqual(h.calls.find(call => call.name === 'sendMessage').args, ['host-1', 'Yes!', undefined, 'question-1']);
  assert.equal(h.find('chat.sent').length, 0);
  const revisedQuote = { id: 'question-1', mine: false, text: 'Revised question', image: false, deleted: false };
  textSend.resolve({ id: 'text-reply', text: 'Yes!', reply: revisedQuote }); await settle();
  assert.deepEqual(plain(h.find('chat.sent').at(-1).data.reply), revisedQuote, 'The UI receives the current quote, not its earlier draft');

  const photo = 'data:image/png;base64,' + Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString('base64');
  const photoMessage = { type: 'chat.photo', data: { to: 'host-1', photo, replyTo: 'question-1' } };
  assert.deepEqual(plain(h.webMessages.parseWebMessage(JSON.stringify(photoMessage))), photoMessage);
  h.overrides.sendPhotoMessage = () => photoSend.promise;
  h.bridge.handle(photoMessage); await settle();
  assert.deepEqual(h.calls.find(call => call.name === 'sendPhotoMessage').args, ['host-1', photo, 'question-1']);
  assert.equal(h.find('chat.photoSent').length, 0);
  const deletedQuote = { id: 'question-1', mine: false, text: '', image: false, deleted: true };
  photoSend.resolve({ id: 'photo-reply', reply: deletedQuote }); await settle();
  assert.deepEqual(plain(h.find('chat.photoSent').at(-1).data), { to: 'host-1', id: 'photo-reply', reply: deletedQuote });
  for (const replyTo of [null, 42, '', '../message', 'x'.repeat(129), {}, []]) {
    assert.equal(h.webMessages.parseWebMessage(JSON.stringify({ ...photoMessage, data: { ...photoMessage.data, replyTo } })), null, 'Photo replies accept only a valid message identifier');
  }
  h.bridge.close();
});

test('photo download and viewer messages accept only exact screen identities and state', () => {
  const h = harness(), parse = message => h.webMessages.parseWebMessage(JSON.stringify(message));
  const request = { type: 'chat.photoDownload', data: { to: 'host-1', id: 'photo-1', requestId: 1 } };
  assert.ok(parse(request));
  for (const data of [{ ...request.data, url: 'https://evil.test/photo.png' }, { ...request.data, id: '../other' }, { ...request.data, to: 'https://peer' }, { ...request.data, requestId: 0 }, { ...request.data, requestId: -1 }, { ...request.data, requestId: 1.5 }, { ...request.data, requestId: Number.MAX_SAFE_INTEGER + 1 }, { to: 'host-1', id: 'photo-1' }]) assert.equal(parse({ ...request, data }), null);
  assert.ok(parse({ type: 'chat.photoViewer', data: { open: true } }));
  for (const data of [{ open: 'yes' }, { open: true, url: 'https://evil.test' }, { open: true, requestId: 1 }, {}]) assert.equal(parse({ type: 'chat.photoViewer', data }), null);
  h.bridge.handle({ type: 'chat.photoViewer', data: { open: true } });
  assert.equal(h.calls.length, 0, 'Viewer state has no server or gallery side effects');
  h.bridge.close();
});

test('photo downloads coalesce same-photo saves and correlate every distinct waiting request', async () => {
  const h = harness(), download = deferred();
  h.overrides.downloadChatPhoto = () => download.promise;
  const request = { type: 'chat.photoDownload', data: { to: 'host-1', id: 'photo-1', requestId: 7 } };
  h.bridge.handle(request); h.bridge.handle(request);
  h.bridge.handle({ ...request, data: { ...request.data, requestId: 8 } });
  await settle();
  assert.equal(h.count('downloadChatPhoto'), 1, 'A reopened viewer shares the pending gallery write');
  assert.equal(h.find('chat.photoDownloaded').length, 0, 'No acknowledgement before the durable native save');
  download.resolve(); await settle();
  assert.deepEqual(plain(h.find('chat.photoDownloaded').map(event => event.data)), [request.data, { ...request.data, requestId: 8 }]);
  h.overrides.downloadChatPhoto = () => { throw new h.ApiError('Photo permission denied', 403, 'PHOTO_PERMISSION_DENIED'); };
  h.bridge.handle({ ...request, data: { ...request.data, requestId: 9 } }); await settle();
  assert.deepEqual(plain(h.find('operation.error').at(-1).data), { action: 'chat.photoDownload', ...request.data, requestId: 9, message: 'Photo permission denied', status: 403, code: 'PHOTO_PERMISSION_DENIED' });
  assert.equal(h.count('downloadChatPhoto'), 2, 'Completion releases the pending operation for retry');
  h.bridge.close();
});

test('shared photo download errors settle every reopened viewer request', async () => {
  const h = harness(), download = deferred();
  h.overrides.downloadChatPhoto = () => download.promise;
  for (const requestId of [10, 11]) h.bridge.handle({ type: 'chat.photoDownload', data: { to: 'host-1', id: 'photo-1', requestId } });
  download.reject(new h.ApiError('Photo no longer available', 404)); await settle();
  assert.deepEqual(h.find('operation.error').map(event => event.data.requestId), [10, 11]);
  assert.equal(h.find('chat.photoDownloaded').length, 0); h.bridge.close();
});

test('retiring a document, account or bridge prevents photo saves and stale confirmations', async () => {
  for (const retire of ['document', 'account', 'bridge']) {
    const h = harness(), download = deferred(); let isCurrent;
    h.overrides.downloadChatPhoto = (_to, _id, current) => { isCurrent = current; return download.promise; };
    h.bridge.handle({ type: 'chat.photoDownload', data: { to: 'host-1', id: 'photo-1', requestId: 1 } });
    assert.equal(isCurrent(), true);
    if (retire === 'document') h.bridge.documentLoading();
    else if (retire === 'account') await h.session.clearToken();
    else h.bridge.close();
    assert.equal(isCurrent(), false, `${retire}: the native helper must reject further save work`);
    download.resolve(); await settle();
    assert.equal(h.find('chat.photoDownloaded').length, 0); assert.equal(h.find('operation.error').length, 0);
    h.bridge.close();
  }
});

function nativeAppHarness() {
  const h = harness(), tree = h.load('App.tsx').default();
  const findWeb = node => {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'WebView') return node;
    for (const child of [node.props?.children].flat()) { const found = findWeb(child); if (found) return found; }
    return null;
  };
  const web = findWeb(tree), received = [];
  web.props.ref.current = { injectJavaScript: script => vm.runInNewContext(script, { window: { zimiReceive: raw => received.push(JSON.parse(raw)) } }), reload() {} };
  const send = (type, data = {}, url = 'https://aurora.localhost/') => web.props.onMessage({ nativeEvent: { url, data: JSON.stringify({ type, data }) } });
  const close = () => { h.effects.forEach(cleanup => cleanup?.()); h.bridge.close(); };
  return { h, web, received, send, close };
}

test('Android Back forwards every press to the ready trusted document and resets on loading or failure', async () => {
  const { h, web, received, send, close } = nativeAppHarness();
  assert.equal(h.backs[0](), false, 'An unready document cannot intercept Back');
  send('ready', { demo: false }, 'https://evil.test/'); assert.equal(h.backs[0](), false);
  send('ready', { demo: 'false' }); assert.equal(h.backs[0](), false);
  send('chat.photoViewer', { open: true }); assert.equal(h.backs[0](), false, 'Photo state cannot establish readiness');
  send('ready', { demo: false });
  for (const listener of h.activities) listener('inactive');
  assert.equal(h.backs[0](), true, 'Temporary native dialogs do not discard document readiness');
  assert.deepEqual(received.at(-1), { type: 'app.back', data: {} });
  assert.equal(h.backs[0](), true, 'Repeated presses must navigate instead of falling through to Android exit');
  send('chat.photoViewer', { open: false }); assert.equal(h.backs[0](), true, 'Back works outside photo viewers');
  assert.equal(received.filter(message => message.type === 'app.back').length, 3);
  for (const reset of [() => web.props.onLoadStart(), () => web.props.onError({ nativeEvent: { description: 'fixture failure' } }), () => web.props.onRenderProcessGone(), () => web.props.onContentProcessDidTerminate()]) {
    reset(); assert.equal(h.backs[0](), false, 'A retired WebView cannot intercept Back');
    send('chat.photoViewer', { open: true }); assert.equal(h.backs[0](), false);
    send('ready', { demo: false }); assert.equal(h.backs[0](), true, 'The new document restores navigation after ready');
  }
  assert.equal(h.exits.length, 0, 'Native Back never exits a ready app directly');
  await settle(); close(); assert.equal(h.backs.length, 0);
});

test('app exit requests require valid trusted readiness and one explicit native confirmation', async () => {
  const { h, web, send, close } = nativeAppHarness();
  for (const data of [{ confirmed: true }, { requestId: 1 }, [], null, { route: 'home' }]) {
    assert.equal(h.webMessages.parseWebMessage(JSON.stringify({ type: 'app.exit.request', data })), null);
  }
  assert.ok(h.webMessages.parseWebMessage(JSON.stringify({ type: 'app.exit.request', data: {} })));
  h.bridge.handle({ type: 'app.exit.request', data: {} }); await settle();
  assert.equal(h.calls.length, 0, 'The API bridge leaves exit requests to the native shell');
  send('app.exit.request'); assert.equal(h.alerts.length, 0, 'Ignore requests before document readiness');
  send('ready', { demo: false });
  send('app.exit.request', {}, 'https://evil.test/');
  send('app.exit.request', { confirmed: true }); assert.equal(h.alerts.length, 0);
  send('app.exit.request'); send('app.exit.request');
  assert.equal(h.alerts.length, 1, 'Repeated Back responses do not stack confirmation dialogs');
  assert.equal(h.alerts[0][0], 'Close BinzoLive?');
  assert.deepEqual(plain(h.alerts[0][2].map(button => button.text)), ['Cancel', 'Close app']);
  assert.equal(h.exits.length, 0);
  h.alerts[0][2][0].onPress(); assert.equal(h.exits.length, 0, 'Cancel keeps the app open');
  send('app.exit.request'); assert.equal(h.alerts.length, 2);
  h.alerts[1][3].onDismiss();
  send('app.exit.request'); assert.equal(h.alerts.length, 3, 'Dismissing the native dialog allows another request');
  h.alerts[2][2][1].onPress(); h.alerts[2][2][1].onPress();
  assert.equal(h.exits.length, 1, 'Only an explicit Close app press exits, once');
  send('app.exit.request'); const stale = h.alerts.at(-1);
  web.props.onLoadStart(); stale[2][1].onPress(); assert.equal(h.exits.length, 1, 'Reload invalidates old confirmations');
  send('app.exit.request'); assert.equal(h.alerts.length, 4);
  send('ready', { demo: false }); send('app.exit.request'); assert.equal(h.alerts.length, 5, 'A new document can request its own confirmation');
  stale[2][0].onPress(); send('app.exit.request'); assert.equal(h.alerts.length, 5, 'Old callbacks cannot clear a newer confirmation');
  h.alerts.at(-1)[2][1].onPress(); assert.equal(h.exits.length, 2);
  await settle(); close();
});

test('voice messages validate recording limits and reject arbitrary upload metadata', () => {
  const h = harness();
  const audio = 'data:audio/webm;codecs=opus;base64,' + Buffer.from([26, 69, 223, 163, 0, 1, 2, 3]).toString('base64');
  const message = { type: 'chat.voice', data: { to: 'host-1', audio, durationMs: 1500, clientId: 'voice-attempt-1', replyTo: 'question-1' } };
  assert.deepEqual(plain(h.webMessages.parseWebMessage(JSON.stringify(message))), message);
  for (const durationMs of [500, 120000]) assert.ok(h.webMessages.parseWebMessage(JSON.stringify({ ...message, data: { ...message.data, durationMs } })));
  const invalid = [
    { audio: 'https://example.test/recording.webm' }, { audio: 'data:audio/wav;base64,AAAA' }, { audio: 'data:audio/webm;base64,AA!A' }, { audio: 'data:audio/webm;base64,AAAA=' },
    { audio: 'data:audio/webm;base64,' + Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64') },
    { durationMs: 499 }, { durationMs: 120001 }, { durationMs: 500.5 }, { durationMs: '1000' },
    { clientId: '' }, { clientId: null }, { clientId: '../recording' }, { clientId: 'x'.repeat(129) },
    { replyTo: 42 }, { to: '' }, { audioKey: 'chat-audio/someone-else/stolen.webm' }, { contentType: 'audio/webm' },
  ];
  for (const change of invalid) assert.equal(h.webMessages.parseWebMessage(JSON.stringify({ ...message, data: { ...message.data, ...change } })), null);
  h.bridge.close();
});

test('voice sends preserve attempt IDs, suppress duplicate work and return the server message', async () => {
  const h = harness(), first = deferred(), second = deferred();
  await h.session.setSessionTokens(tokenPair());
  h.overrides.me = () => ({ ...account(), user: { ...account().user, serverRole: 'user' }, requiresOnboarding: false });
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.thread = () => ({ messages: [], canSend: true });
  h.overrides.sendVoiceMessage = (_to, _audio, _duration, clientId) => clientId === 'voice-1' ? first.promise : second.promise;
  const audio = 'data:audio/webm;base64,' + Buffer.from([26, 69, 223, 163]).toString('base64');
  const request = { type: 'chat.voice', data: { to: 'host-1', audio, durationMs: 1500, clientId: 'voice-1', replyTo: 'question-1' } };
  h.bridge.handle(request); h.bridge.handle(request);
  h.bridge.handle({ ...request, data: { ...request.data, clientId: 'voice-2' } }); await settle();
  assert.equal(h.count('sendVoiceMessage'), 2, 'Only duplicate attempts are suppressed; another recording may proceed');
  assert.deepEqual(h.calls.find(call => call.name === 'sendVoiceMessage').args, ['host-1', audio, 1500, 'voice-1', 'question-1']);
  assert.equal(h.find('chat.voiceSent').length, 0);
  const delivered = { id: 'voice-server-1', mine: true, text: '', time: '9:00 AM', kind: 'voice', audioUrl: 'https://cdn.example.test/voice.webm', durationMs: 1500,
    reply: { id: 'question-1', mine: false, text: '', image: false, voice: true, deleted: false } };
  second.resolve({ ...delivered, id: 'voice-server-2' }); first.resolve(delivered); await settle();
  assert.deepEqual(plain(h.find('chat.voiceSent').find(event => event.data.clientId === 'voice-1').data), { to: 'host-1', clientId: 'voice-1', message: delivered });
  assert.equal(h.find('chat.voiceSent').find(event => event.data.clientId === 'voice-2').data.message.id, 'voice-server-2');
  h.bridge.close();
});

test('voice failures correlate to their recording, respect chat permission and allow the same retry ID', async () => {
  const h = harness();
  await h.session.setSessionTokens(tokenPair());
  h.overrides.me = () => ({ ...account(), user: { ...account().user, serverRole: 'user' }, requiresOnboarding: false });
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  const audio = 'data:audio/webm;base64,' + Buffer.from([26, 69, 223, 163]).toString('base64');
  const request = { type: 'chat.voice', data: { to: 'host-1', audio, durationMs: 1500, clientId: 'retry-recording' } };
  h.overrides.thread = () => ({ messages: [], canSend: false, sendDisabledReason: 'This conversation is read-only.' });
  h.bridge.handle(request); await settle();
  assert.equal(h.count('sendVoiceMessage'), 0);
  assert.deepEqual(plain(h.find('operation.error').at(-1).data), { message: 'This conversation is read-only.', action: 'chat.voice', to: 'host-1', clientId: 'retry-recording', status: 403 });
  h.overrides.thread = () => ({ messages: [], canSend: true });
  h.bridge.handle({ type: 'chat.open', data: { with: 'host-1' } }); await settle();
  h.overrides.sendVoiceMessage = () => { throw new h.ApiError('Voice upload failed', 503, 'VOICE_UPLOAD_FAILED'); };
  h.bridge.handle(request); await settle();
  assert.deepEqual(plain(h.find('operation.error').at(-1).data), { message: 'Voice upload failed', action: 'chat.voice', to: 'host-1', clientId: 'retry-recording', code: 'VOICE_UPLOAD_FAILED', status: 503 });
  assert.equal(h.find('chat.voiceSent').length, 0);
  h.overrides.sendVoiceMessage = () => ({ id: 'voice-retry-sent', mine: true, text: '', time: '', kind: 'voice', audioUrl: 'https://cdn.example.test/voice.webm', durationMs: 1500 });
  h.bridge.handle(request); await settle();
  assert.equal(h.count('sendVoiceMessage'), 2); assert.equal(h.find('chat.voiceSent').at(-1).data.clientId, 'retry-recording');
  h.bridge.close();
});

test('voice completion and failure from a retired account never reach the next screen', async () => {
  const h = harness(), success = deferred(), failure = deferred();
  await h.session.setSessionTokens(tokenPair());
  h.overrides.me = () => ({ ...account(), user: { ...account().user, serverRole: 'user' }, requiresOnboarding: false });
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.thread = () => ({ messages: [], canSend: true });
  h.overrides.sendVoiceMessage = (_to, _audio, _duration, clientId) => clientId === 'retired-success' ? success.promise : failure.promise;
  const audio = 'data:audio/webm;base64,' + Buffer.from([26, 69, 223, 163]).toString('base64');
  for (const clientId of ['retired-success', 'retired-failure']) h.bridge.handle({ type: 'chat.voice', data: { to: 'host-1', audio, durationMs: 1500, clientId } });
  await settle(); assert.equal(h.count('sendVoiceMessage'), 2);
  h.bridge.handle({ type: 'auth.logout', data: {} }); await settle();
  success.resolve({ id: 'retired-voice', kind: 'voice' }); failure.reject(new h.ApiError('Late failure', 503)); await settle();
  assert.equal(h.find('chat.voiceSent').length, 0);
  assert.equal(h.find('operation.error').filter(event => event.data.action === 'chat.voice').length, 0);
  h.bridge.close();
});

test('replies, edits and deletes reach the server and come back to the screen', async () => {
  const h = harness();
  await h.session.setSessionTokens(tokenPair());
  h.overrides.me = () => ({ ...account(), user: { ...account().user, serverRole: 'user', isPhoneVerified: true }, requiresOnboarding: false });
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.thread = () => ({ messages: [], canSend: true });
  h.overrides.sendMessage = () => ({ id: 'reply-1', text: 'Yes!' });
  h.bridge.handle({ type: 'chat.send', data: { to: 'host-1', text: 'Yes!', replyTo: 'question-1' } });
  await settle();
  assert.equal(h.calls.find(call => call.name === 'sendMessage').args[3], 'question-1', 'A reply names the message it answers');
  h.overrides.editMessage = () => ({ _id: 'reply-1', senderId: 'alice', recipientId: 'host-1', text: 'Yes, at 9!', editedAt: '2026-10-17T10:00:00.000Z' });
  h.bridge.handle({ type: 'chat.edit', data: { to: 'host-1', id: 'reply-1', text: 'Yes, at 9!' } });
  await settle();
  const edited = JSON.parse(JSON.stringify(h.find('chat.updated').at(-1).data));
  assert.deepEqual([edited.with, edited.message.id, edited.message.text, edited.message.edited, edited.message.mine], ['host-1', 'reply-1', 'Yes, at 9!', true, true]);
  h.overrides.deleteMessage = () => ({ _id: 'reply-1', senderId: 'alice', recipientId: 'host-1', text: '', deletedAt: '2026-10-17T10:01:00.000Z' });
  h.bridge.handle({ type: 'chat.delete', data: { to: 'host-1', id: 'reply-1', everyone: true } });
  await settle();
  assert.equal(h.find('chat.updated').at(-1).data.message.deleted, true);
  h.bridge.handle({ type: 'chat.delete', data: { to: 'host-1', id: 'other-1', everyone: false } });
  await settle();
  assert.deepEqual(h.calls.filter(call => call.name === 'deleteMessage').map(call => call.args[2]), [true, false]);
  assert.equal(h.find('chat.removed').at(-1).data.id, 'other-1', 'Deleting for me removes it from this screen only');
  for (const message of [{ type: 'chat.edit', data: { to: 'host-1', id: '', text: 'x' } }, { type: 'chat.delete', data: { to: 'host-1', id: 'm', everyone: 'yes' } }, { type: 'chat.send', data: { to: 'host-1', text: 'hi', replyTo: 42 } }])
    assert.equal(h.webMessages.parseWebMessage(JSON.stringify(message)), null, 'Malformed reply, edit and delete messages are refused');
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
  assert.equal(h.signals[0][0], 'webrtc:signal'); assert.equal(h.signals.length, 1);
  assert.equal(h.find('operation.error').at(-1).data.code, 'LIVE_STREAMING_DISABLED');
  assert.equal(JSON.stringify(h.posts).includes(tokenPair().accessToken), false);
  h.bridge.close();
});

test('staff verification calls ring applicants and answer through their own endpoints, never the member-call path', async () => {
  const h = harness();
  const plain = value => JSON.parse(JSON.stringify(value));
  await h.session.setSessionTokens(tokenPair());
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  const live = h.live.at(-1);
  live.onEvent({ type: 'verify.updated', data: { callId: 'verify-1', status: 'ringing' } });
  assert.deepEqual(plain(h.find('verify.incoming').map(post => post.data)), [{ callId: 'verify-1' }]);
  assert.equal(h.count('declineCall'), 0, 'Applicants without host access are not auto-declined');
  h.bridge.handle({ type: 'verify.accept', data: { callId: 'verify-1' } }); await settle();
  assert.equal(h.count('acceptVerificationCall'), 1);
  assert.deepEqual(plain(h.find('verify.connected')[0].data), { callId: 'verify-1', peerId: 'zimi-team', initiator: false, voice: false });
  live.onEvent({ type: 'verify.updated', data: { callId: 'verify-1', status: 'accepted' } });
  assert.equal(h.find('verify.ended').length, 0, 'Our own answer does not dismiss the call');
  h.bridge.handle({ type: 'rtc.signal', data: { callId: 'verify-1', description: { type: 'answer', sdp: 'answer-sdp' } } }); await settle();
  assert.equal(h.signals.length, 0, 'Verification signals never use the member-call socket');
  assert.deepEqual(plain(h.calls.find(call => call.name === 'verificationSignal').args), ['verify-1', { description: { type: 'answer', sdp: 'answer-sdp' } }]);
  h.bridge.handle({ type: 'call.end', data: { callId: 'verify-1', reason: 'media_failed' } }); await settle();
  assert.equal(h.count('endVerificationCall'), 1); assert.equal(h.count('endCall'), 0);
  assert.deepEqual(plain(h.find('verify.ended').at(-1).data), { callId: 'verify-1', status: 'failed' });
  live.onEvent({ type: 'verify.updated', data: { callId: 'verify-2', status: 'ringing' } });
  live.onEvent({ type: 'verify.updated', data: { callId: 'verify-2', status: 'accepted' } });
  assert.deepEqual(plain(h.find('verify.ended').at(-1).data), { callId: 'verify-2', status: 'accepted' }, 'A call answered on another device is dismissed here');
  h.overrides.acceptVerificationCall = () => { throw new h.ApiError('This call is no longer ringing', 409); };
  live.onEvent({ type: 'verify.updated', data: { callId: 'verify-3', status: 'ringing' } });
  h.bridge.handle({ type: 'verify.accept', data: { callId: 'verify-3' } }); await settle();
  assert.deepEqual(plain(h.find('verify.ended').at(-1).data), { callId: 'verify-3', status: 'unavailable' });
  h.bridge.handle({ type: 'verify.end', data: { callId: 'verify-3' } }); await settle();
  assert.equal(h.count('endVerificationCall'), 2);
  assert.equal(h.webMessages.parseWebMessage(JSON.stringify({ type: 'verify.accept', data: { callId: '../calls' } })), null);
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

test('payment-route messages accept safe dynamic tokens and reject unknown checkout authority fields', async () => {
  const h = harness(), parse = message => h.webMessages.parseWebMessage(JSON.stringify(message));
  for (const type of ['wallet.checkout', 'themes.premium.checkout']) {
    const base = { idempotencyKey: 'route-attempt-1', ...(type === 'wallet.checkout' ? { packId: 'pack-id' } : {}) };
    assert.ok(parse({ type, data: base })); assert.ok(parse({ type, data: { ...base, route: 'upi-intent_2' } }));
    for (const patch of [{ route: '' }, { route: 'https://evil.test' }, { route: 'a'.repeat(101) }, { route: null }, { requestedRoute: 'UPI' }, { paymentUrl: 'https://evil.test' }, { pricePaise: 1 }, { userId: 'other' }]) {
      const message = { type, data: { ...base, ...patch } }; assert.equal(parse(message), null); h.bridge.handle(message);
    }
  }
  for (const data of [{}, { requestId: 0 }, { requestId: 1.5 }, { requestId: 1, route: 'UPI' }]) {
    const message = { type: 'payments.routes.load', data }; assert.equal(parse(message), null); h.bridge.handle(message);
  }
  assert.ok(parse({ type: 'payments.routes.load', data: { requestId: 1 } }));
  await settle(); assert.equal(h.calls.length, 0); h.bridge.close();
});

test('payment-route loads correlate latest results and discard stale errors across documents and accounts', async () => {
  const h = harness(), old = deferred(), latest = deferred();
  const catalog = { mode: 'ROTATION', routeChoice: false, routes: [{ route: 'upi-intent_2', pageStyle: 'intent', upiIntent: true, takingPayments: true, currency: 'INR' }] };
  h.overrides.paymentRoutes = () => old.promise;
  h.bridge.handle({ type: 'payments.routes.load', data: { requestId: 1 } });
  h.overrides.paymentRoutes = () => latest.promise;
  h.bridge.handle({ type: 'payments.routes.load', data: { requestId: 2 } });
  latest.resolve(catalog); old.reject(new h.ApiError('Stale failure', 503)); await settle();
  assert.deepEqual(plain(h.find('payments.routes')[0].data), { ...catalog, requestId: 2 }); assert.equal(h.find('operation.error').length, 0);
  h.overrides.paymentRoutes = () => { throw new h.ApiError('Methods unavailable', 503, 'PAYIN_UNAVAILABLE'); };
  h.bridge.handle({ type: 'payments.routes.load', data: { requestId: 3 } }); await settle();
  assert.deepEqual(plain(h.find('operation.error')[0].data), { action: 'payments.routes.load', requestId: 3, message: 'Methods unavailable', status: 503, code: 'PAYIN_UNAVAILABLE' });
  for (const retirement of ['document', 'account']) for (const outcome of ['success', 'failure']) {
    const pending = deferred(); h.overrides.paymentRoutes = () => pending.promise;
    h.bridge.handle({ type: 'payments.routes.load', data: { requestId: 4 } });
    if (retirement === 'document') h.bridge.documentLoading(); else { await h.session.clearToken(); await h.session.setSessionTokens(tokenPair('next')); }
    if (outcome === 'success') pending.resolve(catalog); else pending.reject(new h.ApiError('Retired error', 503)); await settle();
    assert.equal(h.find('payments.routes').length, 1); assert.equal(h.find('operation.error').length, 1);
  }
  h.bridge.close();
});

test('coin and premium route selections survive bridge restart and same-key checkout recovery', async () => {
  for (const kind of ['coins', 'premium']) {
    const h = harness(), cache = h.load('src/payment-cache.ts');
    await h.session.setSessionTokens(tokenPair()); h.overrides.me = () => ({ ...account(), requiresOnboarding: false });
    h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
    const apiName = kind === 'coins' ? 'checkout' : 'checkoutPremium', verifyName = kind === 'coins' ? 'verifyPurchase' : 'verifyPremium';
    const type = kind === 'coins' ? 'wallet.checkout' : 'themes.premium.checkout', event = kind === 'coins' ? 'wallet.purchase' : 'themes.premium.purchase';
    const message = { type, data: { idempotencyKey: 'route-attempt-1', route: 'upi-intent_2', ...(kind === 'coins' ? { packId: 'pack-id' } : {}) } };
    h.overrides[apiName] = () => ({ purchaseId: 'route-purchase', merchantOrderId: 'route_order', kind, status: 'PENDING', route: 'provider-route_3', pageStyle: 'intent', currency: 'INR' });
    h.bridge.handle(message); h.bridge.handle(message); await settle();
    assert.equal(h.count(apiName), 1);
    assert.deepEqual(plain(h.calls.find(call => call.name === apiName).args), kind === 'coins' ? ['pack-id', 'route-attempt-1', 'upi-intent_2'] : ['route-attempt-1', 'upi-intent_2']);
    const stored = (await cache.readPendingPayments('alice'))[0];
    assert.equal(stored.requestedRoute, 'upi-intent_2'); assert.equal(stored.route, undefined); assert.equal(stored.pageStyle, undefined, 'Provider metadata is never promoted into selection state');
    h.bridge.close(); h.overrides[verifyName] = () => { throw new h.ApiError('Verification unavailable', 503); };
    const restarted = h.bridgeModule.createBridge(message => h.posts.push(message));
    restarted.handle({ type: 'session.resume', data: {} }); await settle();
    const recovery = h.find(event).at(-1).data;
    assert.equal(recovery.requestedRoute, 'upi-intent_2'); assert.equal(recovery.idempotencyKey, 'route-attempt-1'); assert.equal(recovery.route, undefined);
    restarted.handle({ type, data: { ...message.data, route: recovery.requestedRoute, idempotencyKey: recovery.idempotencyKey } }); await settle();
    assert.equal(h.count(apiName), 2); assert.equal(h.calls.filter(call => call.name === apiName).at(-1).args.at(-1), 'upi-intent_2');
    assert.equal(h.find(type).at(-1).data.route, 'provider-route_3'); assert.equal(h.find(type).at(-1).data.requestedRoute, 'upi-intent_2'); restarted.close();
  }
});

test('automatic rotation never pins the provider-selected route in checkout requests or recovery', async () => {
  const h = harness(), cache = h.load('src/payment-cache.ts');
  await h.session.setSessionTokens(tokenPair()); h.overrides.me = () => ({ ...account(), requiresOnboarding: false });
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.paymentRoutes = () => ({ mode: 'ROTATION', routeChoice: false, routes: [] });
  h.bridge.handle({ type: 'payments.routes.load', data: { requestId: 1 } }); await settle();
  h.overrides.checkout = () => ({ purchaseId: 'auto-purchase', merchantOrderId: 'auto_order', status: 'PENDING', route: 'provider-auto_1', pageStyle: 'intent', currency: 'INR' });
  h.bridge.handle({ type: 'wallet.checkout', data: { packId: 'pack-id', idempotencyKey: 'automatic-attempt-1' } }); await settle();
  const args = h.calls.find(call => call.name === 'checkout').args;
  assert.deepEqual(args.slice(0, 2), ['pack-id', 'automatic-attempt-1']); assert.equal(args[2], undefined);
  assert.equal(h.find('wallet.checkout')[0].data.route, 'provider-auto_1'); assert.equal(h.find('wallet.checkout')[0].data.requestedRoute, undefined);
  assert.equal((await cache.readPendingPayments('alice'))[0].requestedRoute, undefined);
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
  h.overrides.checkout = () => ({ purchaseId: 'purchase', merchantOrderId: 'binzolive_order', paymentUrl: 'https://checkout.example.test/pay', status: 'PENDING' });
  h.overrides.verifyPurchase = () => ({ purchaseId: 'purchase', merchantOrderId: 'binzolive_order', status: 'SUCCESS' });
  h.overrides.wallet = () => ({ coins: 475, earningsPaise: 0 });
  h.bridge.handle({ type: 'wallet.checkout', data: { packId: 'pack-id', idempotencyKey: 'payment-attempt-1' } });
  await settle();
  h.activities.forEach(listener => listener('background')); await settle(); assert.equal(h.count('verifyPurchase'), 0);
  h.activities.forEach(listener => listener('active')); await settle();
  assert.equal(h.calls.find(call => call.name === 'verifyPurchase').args[0], 'binzolive_order');
  assert.equal(h.find('wallet.purchase')[0].data.status, 'SUCCESS');
  assert.equal(h.find('wallet.balance')[0].data.coins, 475);
  h.activities.forEach(listener => listener('active')); await settle(); assert.equal(h.count('verifyPurchase'), 1);
  h.bridge.close(); assert.equal(h.activities.length, 0);
});

test('a confirmed gift stays successful when its independent wallet refresh fails', async () => {
  const h = harness();
  h.overrides.sendGift = () => ({ id: 'transfer-id', coins: 25 });
  h.overrides.wallet = () => { throw new Error('Connection lost'); };
  h.bridge.handle({ type: 'gift.send', data: { to: 'creator-id', gift: 'gift-id', coins: 1, inCall: false, idempotencyKey: 'gift-attempt-1' } });
  await settle();
  assert.deepEqual(plain(h.find('gift.sent')[0].data), { to: 'creator-id', gift: 'gift-id', idempotencyKey: 'gift-attempt-1', id: 'transfer-id', coins: 25 });
  assert.equal(h.find('wallet.balance').length, 0, 'Never infer the balance from the gift price');
  assert.deepEqual(h.find('operation.error').map(item => item.data.action), ['wallet.load']);
  assert.equal(h.find('data.loading').at(-1).data.error, 'Something went wrong. Please try again.');
  h.bridge.close();
});

test('withdrawal messages reject legacy amounts, malformed requests and extra authority fields', async () => {
  const h = harness(), parse = message => h.webMessages.parseWebMessage(JSON.stringify(message));
  const invalidWrites = [{ coins: 100, upi: 'creator@upi' }, ...[
    { amountPaise: 0 }, { amountPaise: 1.5 }, { amountPaise: '50000' }, { amountPaise: 100000001 },
    { payoutAddress: '  ' }, { payoutAddress: 'ab' }, { payoutAddress: 'x'.repeat(201) },
    { idempotencyKey: 'short' }, { idempotencyKey: 'invalid/key' }, { idempotencyKey: 'x'.repeat(101) },
    { requestId: undefined }, { requestId: 0 }, { requestId: 1.5 }, { userId: 'someone-else' }, { coins: 100 },
  ].map(patch => ({ ...payoutMessage().data, ...patch }))];
  const invalidReads = [{}, { requestId: 0 }, { requestId: 1.5 }, { requestId: 1, page: 0 }, { requestId: 1, page: 1.5 }, { requestId: 1, userId: 'other' }, { requestId: 1, limit: 100 }];
  for (const [type, rows] of [['payout.request', invalidWrites], ['payout.load', invalidReads]]) for (const data of rows) {
    const message = { type, data }; assert.equal(parse(message), null, JSON.stringify(message)); h.bridge.handle(message);
  }
  assert.ok(parse(payoutMessage())); assert.ok(parse({ type: 'payout.load', data: { requestId: 2, page: 2 } }));
  await settle(); assert.equal(h.calls.length, 0, 'Malformed messages never reach account checks or payout APIs'); h.bridge.close();
});

test('withdrawal history remains available after revocation while new submissions revalidate approval', async () => {
  const h = harness(); h.overrides.me = () => approvedAccount();
  await h.session.setSessionTokens(tokenPair()); h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.me = () => ({ ...approvedAccount(), user: { ...approvedAccount().user, hostStatus: 'suspended' } });
  const checks = h.count('me');
  h.bridge.handle({ type: 'payout.load', data: { requestId: 5 } }); h.bridge.handle(payoutMessage(6)); await settle();
  assert.ok(h.count('me') > checks, 'Cached approval cannot authorize a new withdrawal action');
  assert.equal(h.count('payouts'), 1); assert.equal(h.count('requestPayout'), 0);
  assert.equal(h.find('payout.loaded').length, 1);
  assert.deepEqual(h.find('payout.error').map(event => event.data.action), ['payout.request']);
  assert.equal(h.find('payout.requested').length, 0); h.bridge.close();
});

test('a pending withdrawal account check cannot undo a newer host revocation', async () => {
  for (const action of ['load', 'request']) {
    const h = harness(), earlier = deferred(), revoked = deferred();
    await h.session.setSessionTokens(tokenPair()); h.overrides.me = () => approvedAccount();
    h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
    h.overrides.me = () => earlier.promise;
    h.bridge.handle(action === 'request' ? payoutMessage() : { type: 'payout.load', data: { requestId: 1 } });
    h.overrides.me = () => revoked.promise;
    h.live[0].onEvent({ type: 'verification.status', data: { status: 'rejected', hostStatus: 'suspended' } });
    earlier.resolve(approvedAccount()); await settle();
    assert.equal(h.find('host.access').at(-1).data.approved, false, 'Payout authentication cannot restore stale host permission');
    assert.equal(h.count('requestPayout'), 0);
    assert.equal(h.count('payouts'), action === 'load' ? 1 : 0, 'Owned history remains readable during revocation');
    revoked.resolve({ ...account(), user: { ...account().user, hostStatus: 'suspended' } }); await settle(); h.bridge.close();
  }
});

test('withdrawal history keeps only the newest request and correlates failures', async () => {
  const h = harness(), old = deferred(), latest = deferred(); h.overrides.me = () => approvedAccount();
  h.overrides.payouts = page => page === 1 ? old.promise : latest.promise;
  h.bridge.handle({ type: 'payout.load', data: { page: 1, requestId: 1 } }); await settle();
  h.bridge.handle({ type: 'payout.load', data: { page: 2, requestId: 2 } }); await settle();
  assert.deepEqual(plain(h.calls.filter(call => call.name === 'payouts').map(call => call.args)), [[1], [2]]);
  latest.resolve({ items: [payoutReceipt('latest')], total: 21, page: 2, limit: 20 }); await settle();
  old.reject(new h.ApiError('Stale history failed', 503)); await settle();
  assert.equal(h.find('payout.loaded').length, 1); assert.equal(h.find('payout.loaded')[0].data.requestId, 2);
  assert.equal(h.find('payout.loaded')[0].data.items[0].id, 'latest'); assert.equal(h.find('payout.error').length, 0);
  h.overrides.payouts = () => { throw new h.ApiError('History unavailable', 503, 'TEMPORARY'); };
  h.bridge.handle({ type: 'payout.load', data: { requestId: 3 } }); await settle();
  assert.deepEqual(plain(h.find('payout.error')[0].data), { action: 'payout.load', requestId: 3, message: 'History unavailable', code: 'TEMPORARY', status: 503 }); h.bridge.close();
});

test('withdrawal submission serializes clicks, preserves retry keys and survives wallet refresh failure', async () => {
  const h = harness(), pending = deferred(); h.overrides.me = () => approvedAccount();
  h.overrides.requestPayout = () => { throw new h.ApiError('Connection lost', 503, 'TEMPORARY'); };
  h.bridge.handle(payoutMessage(7)); await settle();
  assert.deepEqual(plain(h.find('payout.error')[0].data), { action: 'payout.request', requestId: 7, idempotencyKey: 'withdrawal-attempt-1', message: 'Connection lost', code: 'TEMPORARY', status: 503 });
  assert.equal(h.count('wallet'), 0); assert.equal(h.find('payout.requested').length, 0);
  h.overrides.requestPayout = () => pending.promise;
  h.overrides.wallet = () => { throw new h.ApiError('Balance unavailable', 503); };
  const retry = payoutMessage(8); retry.data.payoutAddress = '  creator@upi  ';
  h.bridge.handle(retry); h.bridge.handle(retry);
  h.bridge.handle({ type: 'payout.request', data: { ...payoutMessage(9).data, idempotencyKey: 'different-attempt-2' } }); await settle();
  assert.equal(h.count('requestPayout'), 2, 'One failed attempt plus one retry; duplicate or competing clicks cannot submit again');
  assert.deepEqual(plain(h.calls.filter(call => call.name === 'requestPayout').map(call => call.args)), [[50000, 'creator@upi', 'withdrawal-attempt-1'], [50000, '  creator@upi  ', 'withdrawal-attempt-1']], 'Retries preserve the exact idempotency key; the API adapter normalizes the destination');
  pending.resolve(payoutReceipt()); await settle();
  assert.deepEqual(plain(h.find('payout.requested')[0].data), { payout: payoutReceipt(), requestId: 8 });
  assert.equal(h.find('payout.error').length, 1, 'Wallet failure does not turn a committed withdrawal into a failed request');
  assert.equal(h.find('wallet.balance').length, 0); assert.equal(h.find('operation.error').at(-1).data.action, 'wallet.load'); h.bridge.close();
});

test('a committed withdrawal retires history fetched before the balance reservation', async () => {
  const h = harness(), history = deferred(); h.overrides.me = () => approvedAccount();
  h.overrides.payouts = () => history.promise; h.overrides.requestPayout = () => payoutReceipt();
  h.overrides.wallet = () => ({ coins: 5, earningsPaise: 50000, reservedPaise: 50000, minimumWithdrawalPaise: 50000, withdrawalsEnabled: true });
  h.bridge.handle({ type: 'payout.load', data: { requestId: 1 } }); await settle();
  h.bridge.handle(payoutMessage(2)); await settle();
  history.resolve({ items: [], total: 0, page: 1, limit: 20 }); await settle();
  assert.equal(h.find('payout.loaded').length, 0, 'A pre-submission empty history cannot erase the confirmed receipt');
  assert.equal(h.find('payout.requested').length, 1);
  assert.deepEqual(plain(h.find('wallet.balance').at(-1).data), { coins: 5, earningsPaise: 50000, reservedPaise: 50000, minimumWithdrawalPaise: 50000, withdrawalsEnabled: true }); h.bridge.close();
});

test('retired withdrawal authorization cannot begin a read or a financial mutation', async () => {
  for (const retirement of ['document', 'account']) for (const action of ['load', 'request']) {
    const h = harness(), approval = deferred(); await h.session.setSessionTokens(tokenPair()); h.overrides.me = () => approval.promise;
    h.bridge.handle(action === 'request' ? payoutMessage() : { type: 'payout.load', data: { requestId: 1 } }); await settle();
    if (retirement === 'document') h.bridge.documentLoading(); else { await h.session.clearToken(); await h.session.setSessionTokens(tokenPair('new')); }
    approval.resolve(approvedAccount()); await settle();
    assert.equal(h.count('payouts') + h.count('requestPayout'), 0, `${retirement} retires pending payout ${action} authorization`);
    assert.equal(h.find('payout.error').length, 0); h.bridge.close();
  }
});

test('late payout receipts, history and errors never reach a replacement document or account', async () => {
  for (const retirement of ['document', 'account']) for (const action of ['load', 'request']) for (const outcome of ['success', 'failure']) {
    const h = harness(), pending = deferred(); await h.session.setSessionTokens(tokenPair()); h.overrides.me = () => approvedAccount();
    h.overrides[action === 'request' ? 'requestPayout' : 'payouts'] = () => pending.promise;
    h.bridge.handle(action === 'request' ? payoutMessage() : { type: 'payout.load', data: { requestId: 1 } }); await settle();
    assert.equal(h.count(action === 'request' ? 'requestPayout' : 'payouts'), 1);
    if (retirement === 'document') h.bridge.documentLoading(); else { await h.session.clearToken(); await h.session.setSessionTokens(tokenPair('new')); }
    if (outcome === 'failure') pending.reject(new h.ApiError('Retired failure', 503));
    else pending.resolve(action === 'request' ? payoutReceipt() : { items: [payoutReceipt()], total: 1, page: 1, limit: 20 });
    await settle();
    assert.equal(h.find('payout.requested').length + h.find('payout.loaded').length + h.find('payout.error').length, 0, `${retirement} hides stale ${action} ${outcome}`);
    assert.equal(h.count('wallet'), 0, 'An old receipt cannot refresh the next identity wallet'); h.bridge.close();
  }
});

test('durable withdrawal recovery survives bridge restart and host revocation without authorizing new attempts', async () => {
  const h = harness(); h.overrides.me = () => approvedAccount();
  h.overrides.requestPayout = () => {
    assert.deepEqual(JSON.parse(h.disk.get('zimi.payouts.v1.alice')), { amountPaise: 50000, payoutAddress: 'creator@upi', idempotencyKey: 'withdrawal-attempt-1' }, 'The attempt is durable before any POST');
    throw new h.ApiError('Connection interrupted', 503);
  };
  h.bridge.handle(payoutMessage()); await settle();
  assert.equal(h.count('requestPayout'), 1); assert.ok(h.disk.has('zimi.payouts.v1.alice'));
  h.bridge.close();
  const revoked = { ...approvedAccount(), user: { ...approvedAccount().user, hostStatus: 'suspended', isVerifiedHost: false }, verification: 'rejected' };
  h.overrides.me = () => revoked;
  const restarted = h.bridgeModule.createBridge(message => h.posts.push(message));
  restarted.handle({ type: 'payout.load', data: { requestId: 2 } }); await settle();
  assert.equal(h.find('payout.loaded').at(-1).data.pending.idempotencyKey, 'withdrawal-attempt-1');
  restarted.handle({ type: 'payout.request', data: { ...payoutMessage(3).data, idempotencyKey: 'unrelated-attempt-2' } }); await settle();
  assert.equal(h.count('requestPayout'), 1, 'An existing pending key cannot authorize another withdrawal');
  assert.equal(h.find('payout.error').at(-1).data.code, 'PAYOUT_PENDING_RECOVERY');
  h.overrides.requestPayout = () => ({ ...payoutReceipt(), idempotencyKey: 'withdrawal-attempt-1' });
  restarted.handle(payoutMessage(4)); await settle();
  assert.equal(h.count('requestPayout'), 2, 'The owning account may explicitly replay only the durable attempt after revocation');
  assert.equal(h.find('payout.requested').at(-1).data.requestId, 4); assert.equal(h.disk.has('zimi.payouts.v1.alice'), false);
  restarted.handle({ type: 'payout.request', data: { ...payoutMessage(5).data, idempotencyKey: 'new-withdrawal-3' } }); await settle();
  assert.equal(h.count('requestPayout'), 2, 'Reconciliation never restores permission to start a new withdrawal');
  assert.equal(h.find('payout.error').at(-1).data.status, 403); restarted.close();
});

test('withdrawal history reconciles only matching durable terms and keeps other accounts isolated', async () => {
  const h = harness(); h.overrides.me = () => account();
  const pending = { amountPaise: 50000, payoutAddress: 'creator@upi', idempotencyKey: 'withdrawal-attempt-1' };
  h.disk.set('zimi.payouts.v1.alice', JSON.stringify(pending));
  h.disk.set('zimi.payouts.v1.bob', JSON.stringify({ ...pending, idempotencyKey: 'bob-withdrawal-1' }));
  h.overrides.payouts = () => ({ items: [{ ...payoutReceipt(), amountPaise: 60000, idempotencyKey: pending.idempotencyKey }], total: 1, page: 1, limit: 20 });
  h.bridge.handle({ type: 'payout.load', data: { requestId: 1 } }); await settle();
  assert.equal(h.find('payout.loaded').at(-1).data.recovered, null); assert.ok(h.disk.has('zimi.payouts.v1.alice'));
  h.overrides.payouts = () => ({ items: [{ ...payoutReceipt(), idempotencyKey: pending.idempotencyKey }], total: 1, page: 1, limit: 20 });
  h.bridge.handle({ type: 'payout.load', data: { requestId: 2 } }); await settle();
  const loaded = h.find('payout.loaded').at(-1).data;
  assert.equal(loaded.pending, null); assert.equal(loaded.recovered.id, 'payout-1');
  assert.equal(h.disk.has('zimi.payouts.v1.alice'), false); assert.ok(h.disk.has('zimi.payouts.v1.bob'));
  assert.equal(h.count('requestPayout'), 0, 'History reconciliation never submits a financial mutation'); h.bridge.close();
});

test('withdrawals cannot submit before durable storage succeeds or after its document retires', async () => {
  const h = harness(), writing = deferred(); h.overrides.me = () => approvedAccount();
  h.overrides.setStorage = key => key === 'zimi.payouts.v1.alice' ? writing.promise : undefined;
  h.bridge.handle(payoutMessage()); await settle();
  assert.equal(h.count('requestPayout'), 0, 'The POST waits for the actual secure-storage write');
  h.bridge.documentLoading(); writing.resolve(); await settle();
  assert.equal(h.count('requestPayout'), 0);
  assert.ok(h.disk.has('zimi.payouts.v1.alice'), 'A retired document cannot erase an intent another document may already be recovering');
  h.bridge.close();
  for (const failure of ['read', 'write', 'malformed']) {
    const blocked = harness(); blocked.overrides.me = () => approvedAccount();
    if (failure === 'read') blocked.overrides.getStorage = key => { if (key.startsWith('zimi.payouts.')) throw new Error('Read unavailable'); };
    else if (failure === 'write') blocked.overrides.setStorage = key => { if (key.startsWith('zimi.payouts.')) throw new Error('Write unavailable'); };
    else blocked.disk.set('zimi.payouts.v1.alice', '{corrupt');
    blocked.bridge.handle(payoutMessage()); await settle();
    assert.equal(blocked.count('requestPayout'), 0, `${failure} recovery failure must block a fresh mutation`);
    assert.equal(blocked.find('payout.error').length, 1); blocked.bridge.close();
  }
});

test('gift retries share one request while distinct attempts retain their own acknowledgments', async () => {
  const h = harness(), first = deferred(), second = deferred();
  h.overrides.sendGift = to => to === 'first-host' ? first.promise : second.promise;
  const send = { type: 'gift.send', data: { to: 'first-host', gift: 'gift-1', coins: 10, inCall: false, idempotencyKey: 'gift-attempt-1' } };
  h.bridge.handle(send); h.bridge.handle(send);
  h.bridge.handle({ type: 'gift.send', data: { ...send.data, to: 'second-host', gift: 'gift-2', idempotencyKey: 'gift-attempt-2' } });
  assert.equal(h.count('sendGift'), 2);
  second.resolve({ id: 'transfer-2', coins: 30 }); await settle();
  first.resolve({ id: 'transfer-1', coins: 20 }); await settle();
  assert.deepEqual(h.find('gift.sent').map(item => [item.data.to, item.data.gift, item.data.idempotencyKey, item.data.coins]), [['second-host', 'gift-2', 'gift-attempt-2', 30], ['first-host', 'gift-1', 'gift-attempt-1', 20]]);
  h.bridge.close();
});

test('gift failures carry their own attempt and insufficient-coin code without confirming a spend', async () => {
  const h = harness();
  h.overrides.sendGift = () => { throw new h.ApiError('Not enough coins', 409, 'INSUFFICIENT_COINS'); };
  const send = { type: 'gift.send', data: { to: 'host-id', gift: 'gift-id', coins: 10, inCall: false, idempotencyKey: 'gift-attempt-1' } };
  h.bridge.handle(send); await settle();
  assert.deepEqual(plain(h.find('operation.error')[0].data), { action: 'gift.send', message: 'Not enough coins', to: 'host-id', gift: 'gift-id', idempotencyKey: 'gift-attempt-1', status: 409, code: 'INSUFFICIENT_COINS' });
  assert.equal(h.find('gift.sent').length, 0); assert.equal(h.count('wallet'), 0);
  const pending = deferred(); h.overrides.sendGift = () => pending.promise;
  h.bridge.handle(send); h.bridge.handle({ type: 'auth.logout', data: {} });
  pending.resolve({ id: 'retired-transfer', coins: 10 }); await settle();
  assert.equal(h.find('gift.sent').length, 0, 'A response from a signed-out identity cannot affect the next account');
  h.bridge.close();
});

test('completed checkout retries update only the server balance and retain attempt correlation', async () => {
  const h = harness();
  h.overrides.checkout = () => ({ purchaseId: 'purchase', merchantOrderId: 'binzolive_order', status: 'SUCCESS', coins: 100 });
  h.overrides.wallet = () => ({ coins: 575, earningsPaise: 0 });
  h.bridge.handle({ type: 'wallet.checkout', data: { packId: 'pack-id', idempotencyKey: 'payment-attempt-1' } }); await settle();
  assert.equal(h.find('wallet.checkout')[0].data.packId, 'pack-id'); assert.equal(h.find('wallet.checkout')[0].data.idempotencyKey, 'payment-attempt-1');
  assert.equal(h.find('wallet.balance')[0].data.coins, 575); assert.equal(h.opened.length, 0);
  h.overrides.checkout = () => { throw new h.ApiError('Start a new checkout', 502, 'PAYIN_PROVISIONING_FAILED'); };
  h.bridge.handle({ type: 'wallet.checkout', data: { packId: 'next-pack', idempotencyKey: 'payment-attempt-2' } }); await settle();
  assert.deepEqual(plain(h.find('operation.error')[0].data), { action: 'wallet.checkout', message: 'Start a new checkout', packId: 'next-pack', idempotencyKey: 'payment-attempt-2', status: 502, code: 'PAYIN_PROVISIONING_FAILED' });
  h.bridge.close();
});

test('failed external coin launch releases its UI after verification while preserving eventual credit', async () => {
  const h = harness();
  await h.session.setSessionTokens(tokenPair());
  h.overrides.me = () => ({ ...account(), requiresOnboarding: false });
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.checkout = () => ({ purchaseId: 'purchase', merchantOrderId: 'binzolive_order', status: 'PENDING', paymentUrl: 'https://checkout.example.test/pay' });
  h.overrides.verifyPurchase = () => ({ purchaseId: 'purchase', merchantOrderId: 'binzolive_order', status: 'PENDING' });
  h.overrides.openURL = () => { assert.equal(h.find('wallet.checkout').length, 1, 'Order must reach UI before external launch'); throw new Error('No handler'); };
  h.bridge.handle({ type: 'wallet.checkout', data: { packId: 'pack-id', idempotencyKey: 'payment-attempt-1' } }); await settle();
  assert.deepEqual(plain(h.find('wallet.payment-returned')[0].data), { merchantOrderId: 'binzolive_order', status: 'PENDING', packId: 'pack-id', idempotencyKey: 'payment-attempt-1' });
  assert.equal(h.find('operation.error').filter(message => message.data.code === 'PAYMENT_OPEN_FAILED').length, 0, 'A generic launch error cannot overwrite the return notice');
  assert.equal((await h.load('src/payment-cache.ts').readPendingPayments('alice')).length, 1, 'The authoritative pending order remains durable');
  h.overrides.verifyPurchase = () => { throw new h.ApiError('Check again shortly', 503, 'PAYIN_UNAVAILABLE'); };
  h.bridge.handle({ type: 'wallet.verify', data: { merchantOrderId: 'binzolive_order' } }); await settle();
  assert.equal(h.find('operation.error').at(-1).data.merchantOrderId, 'binzolive_order');
  h.overrides.verifyPurchase = () => ({ purchaseId: 'purchase', merchantOrderId: 'binzolive_order', status: 'SUCCESS' });
  h.activities.forEach(listener => listener('active')); await settle();
  assert.equal(h.find('wallet.purchase').at(-1).data.status, 'SUCCESS'); assert.equal(h.find('wallet.purchase').at(-1).data.idempotencyKey, 'payment-attempt-1');
  assert.equal(h.find('wallet.payment-returned').length, 1, 'Later tracking never repeats an abandoned-flow notice');
  h.bridge.close();
});

test('coin payment return notices require an externally launched checkout that actually left the app', async () => {
  const h = harness(), cache = h.load('src/payment-cache.ts');
  await h.session.setSessionTokens(tokenPair()); h.overrides.me = () => ({ ...account(), requiresOnboarding: false });
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.checkout = () => ({ purchaseId: 'purchase', merchantOrderId: 'return_order', status: 'PENDING', paymentUrl: 'https://checkout.example.test/pay' });
  h.overrides.verifyPurchase = () => ({ purchaseId: 'purchase', merchantOrderId: 'return_order', status: 'PENDING' });
  h.bridge.handle({ type: 'wallet.checkout', data: { packId: 'pack-id', idempotencyKey: 'payment-attempt-1', route: 'upi' } }); await settle();
  h.activities.forEach(listener => listener('active')); await settle();
  assert.equal(h.find('wallet.payment-returned').length, 0, 'An ordinary foreground callback is not an abandoned checkout');
  h.activities.forEach(listener => listener('background')); h.activities.forEach(listener => listener('active')); await settle();
  assert.deepEqual(plain(h.find('wallet.payment-returned')[0].data), { merchantOrderId: 'return_order', status: 'PENDING', packId: 'pack-id', idempotencyKey: 'payment-attempt-1' });
  assert.equal((await cache.readPendingPayments('alice'))[0].orderId, 'return_order', 'Dismissing UI never changes backend status or deletes its recovery reference');
  assert.equal(h.count('checkout'), 1); assert.equal(h.opened.length, 1, 'Returning does not create or reopen a payment');
  h.activities.forEach(listener => listener('background')); h.activities.forEach(listener => listener('active')); await settle();
  assert.equal(h.find('wallet.payment-returned').length, 1, 'The same external launch returns only once');
  h.overrides.verifyPurchase = () => ({ purchaseId: 'purchase', merchantOrderId: 'return_order', status: 'SUCCESS' });
  h.activities.forEach(listener => listener('active')); await settle();
  assert.equal(h.find('wallet.purchase').at(-1).data.status, 'SUCCESS'); assert.equal((await cache.readPendingPayments('alice')).length, 0, 'Late successful credit remains reconcilable');
  h.bridge.close();
});

test('returning coins wait for shared authoritative verification and never report a successful payment as failed', async () => {
  const h = harness(), verification = deferred();
  h.overrides.checkout = () => ({ purchaseId: 'purchase', merchantOrderId: 'successful_return', status: 'PENDING', paymentUrl: 'https://checkout.example.test/pay' });
  h.overrides.verifyPurchase = () => verification.promise;
  h.overrides.wallet = () => ({ coins: 5750, earningsPaise: 0 });
  h.bridge.handle({ type: 'wallet.checkout', data: { packId: 'pack-id', idempotencyKey: 'payment-attempt-1' } }); await settle();
  h.bridge.handle({ type: 'wallet.verify', data: { merchantOrderId: 'successful_return' } });
  h.activities.forEach(listener => listener('inactive')); h.activities.forEach(listener => listener('active')); await settle();
  assert.equal(h.count('verifyPurchase'), 1, 'Manual and return verification share their in-flight result');
  assert.equal(h.find('wallet.payment-returned').length, 0, 'No UNKNOWN or failure is emitted before verification completes');
  verification.resolve({ purchaseId: 'purchase', merchantOrderId: 'successful_return', status: 'SUCCESS' }); await settle();
  assert.equal(h.find('wallet.payment-returned')[0].data.status, 'SUCCESS');
  assert.equal(h.find('wallet.balance').at(-1).data.coins, 5750, 'Only the authenticated wallet provides credited coins');
  h.bridge.close();
});

test('old coin returns retain order identity and cannot dismiss a replacement checkout or document', async () => {
  const h = harness(), first = deferred();
  h.overrides.checkout = packId => ({ purchaseId: packId, merchantOrderId: packId === 'pack-first' ? 'old_order' : 'new_order', status: 'PENDING', paymentUrl: 'https://checkout.example.test/' + packId });
  h.overrides.verifyPurchase = orderId => orderId === 'old_order' ? first.promise : ({ purchaseId: 'new', merchantOrderId: orderId, status: 'PENDING' });
  h.bridge.handle({ type: 'wallet.checkout', data: { packId: 'pack-first', idempotencyKey: 'payment-first-1' } }); await settle();
  h.activities.forEach(listener => listener('background')); h.activities.forEach(listener => listener('active')); await settle();
  h.bridge.handle({ type: 'wallet.checkout', data: { packId: 'pack-second', idempotencyKey: 'payment-second-2' } }); await settle();
  first.resolve({ purchaseId: 'first', merchantOrderId: 'old_order', status: 'PENDING' }); await settle();
  assert.deepEqual(plain(h.find('wallet.payment-returned').map(message => message.data)), [{ merchantOrderId: 'old_order', status: 'PENDING', idempotencyKey: 'payment-first-1', packId: 'pack-first' }]);
  assert.equal(h.find('wallet.checkout').at(-1).data.merchantOrderId, 'new_order');
  h.activities.forEach(listener => listener('background')); h.bridge.documentLoading(); h.activities.forEach(listener => listener('active')); await settle();
  assert.equal(h.find('wallet.payment-returned').length, 1, 'A retired document cannot receive an old return notice');
  h.bridge.close();
});

test('coin return verification failures release UI as unknown while logout suppresses late notices', async () => {
  const h = harness();
  h.overrides.checkout = () => ({ purchaseId: 'purchase', merchantOrderId: 'unknown_return', status: 'PENDING', paymentUrl: 'https://checkout.example.test/pay' });
  h.overrides.verifyPurchase = () => { throw new h.ApiError('Verification unavailable', 503); };
  h.bridge.handle({ type: 'wallet.checkout', data: { packId: 'pack-id', idempotencyKey: 'payment-attempt-1' } }); await settle();
  h.activities.forEach(listener => listener('background')); h.activities.forEach(listener => listener('active')); await settle();
  assert.equal(h.find('wallet.payment-returned')[0].data.status, 'UNKNOWN', 'Network uncertainty never fabricates a terminal backend failure');
  const late = deferred(); h.overrides.verifyPurchase = () => late.promise;
  h.bridge.handle({ type: 'wallet.checkout', data: { packId: 'pack-id', idempotencyKey: 'payment-attempt-2' } }); await settle();
  h.activities.forEach(listener => listener('background')); h.activities.forEach(listener => listener('active')); await settle();
  h.bridge.handle({ type: 'auth.logout', data: {} }); await settle();
  late.resolve({ purchaseId: 'late', merchantOrderId: 'unknown_return', status: 'PENDING' }); await settle();
  assert.equal(h.find('wallet.payment-returned').length, 1, 'Late results cannot cross logout');
  h.bridge.close();
});

test('premium external-launch failures keep their existing recovery flow without coin return notices', async () => {
  const h = harness();
  h.overrides.checkoutPremium = () => ({ purchaseId: 'premium', merchantOrderId: 'premium_order', kind: 'premium', status: 'PENDING', paymentUrl: 'https://checkout.example.test/premium' });
  h.overrides.openURL = () => { throw new Error('No handler'); };
  h.bridge.handle({ type: 'themes.premium.checkout', data: { idempotencyKey: 'premium-attempt-1' } }); await settle();
  assert.equal(h.find('themes.error')[0].data.code, 'PAYMENT_OPEN_FAILED');
  assert.equal(h.find('wallet.payment-returned').length, 0);
  h.bridge.close();
});

test('restored pending coins release their UI after verification without changing premium recovery or native tracking', async () => {
  const h = harness(), cache = h.load('src/payment-cache.ts');
  await h.session.setSessionTokens(tokenPair());
  await cache.rememberPendingPayment('alice', { orderId: 'restored_coins', kind: 'coins', packId: 'old-pack', idempotencyKey: 'restored-attempt-1' });
  await cache.rememberPendingPayment('alice', { orderId: 'restored_premium', kind: 'premium', idempotencyKey: 'premium-attempt-1' });
  h.overrides.me = () => ({ ...account(), requiresOnboarding: false });
  h.overrides.verifyPurchase = () => ({ purchaseId: 'coin-purchase', merchantOrderId: 'restored_coins', status: 'PENDING' });
  h.overrides.verifyPremium = () => ({ purchaseId: 'premium-purchase', merchantOrderId: 'restored_premium', kind: 'premium', status: 'PENDING' });
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  assert.deepEqual(plain(h.find('wallet.payment-returned').map(message => message.data)), [{ merchantOrderId: 'restored_coins', status: 'PENDING', packId: 'old-pack', idempotencyKey: 'restored-attempt-1' }]);
  assert.equal(h.find('themes.premium.purchase').at(-1).data.status, 'PENDING', 'Premium retains its original pending verification flow');
  assert.equal((await cache.readPendingPayments('alice')).length, 2, 'Neither UI dismissal nor verification invents terminal payment status');
  assert.equal(h.opened.length, 0); assert.equal(h.count('checkout'), 0, 'Restoration never launches or creates payment');
  h.bridge.close();
});

test('a coin return already verifying cannot notify a replacement document', async () => {
  const h = harness(), verification = deferred();
  h.overrides.checkout = () => ({ purchaseId: 'purchase', merchantOrderId: 'retired_document', status: 'PENDING', paymentUrl: 'https://checkout.example.test/pay' });
  h.overrides.verifyPurchase = () => verification.promise;
  h.bridge.handle({ type: 'wallet.checkout', data: { packId: 'pack-id', idempotencyKey: 'payment-attempt-1' } }); await settle();
  h.activities.forEach(listener => listener('background')); h.activities.forEach(listener => listener('active')); await settle();
  assert.equal(h.count('verifyPurchase'), 1);
  h.bridge.documentLoading(); verification.resolve({ purchaseId: 'purchase', merchantOrderId: 'retired_document', status: 'PENDING' }); await settle();
  assert.equal(h.find('wallet.payment-returned').length, 0, 'Only the document that launched or restored the attempt owns its return notice');
  h.bridge.close();
});

test('pending payments survive a native restart and are verified only for their owning account', async () => {
  const h = harness(), cache = h.load('src/payment-cache.ts');
  await h.session.setSessionTokens(tokenPair());
  h.overrides.me = () => ({ ...account(), requiresOnboarding: false });
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.checkout = () => ({ purchaseId: 'purchase', merchantOrderId: 'binzolive_order', status: 'PENDING', paymentUrl: 'https://checkout.example.test/pay' });
  h.bridge.handle({ type: 'wallet.checkout', data: { packId: 'pack-id', idempotencyKey: 'payment-attempt-1' } }); await settle();
  assert.deepEqual(plain(await cache.readPendingPayments('alice')), [{ orderId: 'binzolive_order', kind: 'coins', packId: 'pack-id', idempotencyKey: 'payment-attempt-1' }]);
  h.bridge.close();
  const restarted = h.bridgeModule.createBridge(message => h.posts.push(message));
  h.overrides.verifyPurchase = () => ({ purchaseId: 'purchase', merchantOrderId: 'binzolive_order', status: 'SUCCESS' });
  restarted.handle({ type: 'session.resume', data: {} }); await settle();
  assert.equal(h.count('verifyPurchase'), 1); assert.equal(h.opened.length, 1, 'Recovery never reopens or initiates a charge');
  assert.equal(h.find('wallet.purchase')[0].data.status, 'PENDING', 'Restore the unconfirmed order before waiting for a provider response');
  assert.equal(h.find('wallet.purchase').at(-1).data.status, 'SUCCESS');
  assert.equal(h.find('wallet.purchase').at(-1).data.packId, 'pack-id'); assert.equal(h.find('wallet.purchase').at(-1).data.idempotencyKey, 'payment-attempt-1');
  assert.equal(h.find('wallet.payment-returned').at(-1).data.status, 'SUCCESS', 'A restored success never produces a failure notice');
  assert.deepEqual(plain(await cache.readPendingPayments('alice')), []);
  restarted.close();
  await cache.rememberPendingPayment('alice', { orderId: 'private_order', kind: 'coins' });
  h.overrides.me = () => ({ ...account('bob'), requiresOnboarding: false });
  await h.session.setSessionTokens(tokenPair('bob'));
  const otherAccount = h.bridgeModule.createBridge(message => h.posts.push(message));
  otherAccount.handle({ type: 'session.resume', data: {} }); await settle();
  assert.equal(h.count('verifyPurchase'), 1, 'Bob cannot restore Alice\'s pending order');
  otherAccount.close();
});

test('failed payment verification after restart keeps its recovered order available for the same-key retry', async () => {
  const h = harness(), cache = h.load('src/payment-cache.ts');
  await h.session.setSessionTokens(tokenPair());
  await cache.rememberPendingPayment('alice', { orderId: 'recover_order', kind: 'coins', packId: 'pack-id', idempotencyKey: 'payment-attempt-1' });
  h.overrides.me = () => ({ ...account(), requiresOnboarding: false });
  h.overrides.verifyPurchase = () => {
    assert.equal(h.find('wallet.purchase')[0].data.merchantOrderId, 'recover_order', 'Recovery state must exist before verification starts');
    throw new h.ApiError('Payment verification is temporarily unavailable', 503, 'PAYIN_UNAVAILABLE');
  };
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  assert.deepEqual(plain(h.find('wallet.purchase')[0].data), { purchaseId: '', merchantOrderId: 'recover_order', kind: 'coins', status: 'PENDING', packId: 'pack-id', idempotencyKey: 'payment-attempt-1' });
  assert.equal(h.find('operation.error').at(-1).data.merchantOrderId, 'recover_order');
  assert.equal((await cache.readPendingPayments('alice')).length, 1);
  assert.equal(h.opened.length, 0, 'Restoring a reference never launches or creates a payment');
  assert.deepEqual(plain(h.find('wallet.payment-returned')[0].data), { merchantOrderId: 'recover_order', status: 'UNKNOWN', packId: 'pack-id', idempotencyKey: 'payment-attempt-1' }, 'Restored coin UI can unlock while the pending reference remains tracked');
  h.overrides.verifyPurchase = () => ({ purchaseId: 'purchase-id', merchantOrderId: 'recover_order', status: 'SUCCESS' });
  h.bridge.handle({ type: 'wallet.verify', data: { merchantOrderId: 'recover_order' } }); await settle();
  assert.equal(h.find('wallet.purchase').at(-1).data.status, 'SUCCESS');
  assert.equal(h.find('wallet.purchase').at(-1).data.idempotencyKey, 'payment-attempt-1');
  assert.deepEqual(plain(await cache.readPendingPayments('alice')), []);
  h.bridge.close();
});

test('wallet refresh has its own loading state and cannot accept a client balance', async () => {
  const h = harness(), pending = deferred();
  assert.equal(h.webMessages.parseWebMessage(JSON.stringify({ type: 'wallet.load', data: { coins: 99999 } })), null);
  h.overrides.wallet = () => pending.promise;
  h.bridge.handle({ type: 'wallet.load', data: {} });
  assert.equal(h.find('data.loading')[0].data.resource, 'wallet'); assert.equal(h.find('data.loading')[0].data.loading, true);
  pending.resolve({ coins: 73, earningsPaise: 0 }); await settle();
  assert.equal(h.find('wallet.balance')[0].data.coins, 73); assert.equal(h.find('data.loading').at(-1).data.loading, false);
  h.bridge.close();
});

test('transaction history reloads independently and discards older ledger responses', async () => {
  const h = harness(), older = deferred();
  assert.equal(h.webMessages.parseWebMessage(JSON.stringify({ type: 'transactions.load', data: { userId: 'other-account' } })), null);
  h.overrides.transactions = () => older.promise;
  h.bridge.handle({ type: 'transactions.load', data: {} });
  assert.equal(h.find('data.loading')[0].data.resource, 'transactions'); assert.equal(h.find('data.loading')[0].data.loading, true);
  h.overrides.transactions = () => ({ items: [{ id: 'latest-gift', label: 'Rose', coins: -25 }] });
  h.bridge.handle({ type: 'transactions.load', data: {} }); await settle();
  older.resolve({ items: [{ id: 'older-purchase', coins: 200 }] }); await settle();
  assert.equal(h.find('data.transactions').length, 1); assert.equal(h.find('data.transactions')[0].data.items[0].id, 'latest-gift');
  assert.equal(h.count('home'), 0); assert.equal(h.count('wallet'), 0, 'Opening history only reloads the ledger');
  h.overrides.transactions = () => { throw new h.ApiError('Ledger unavailable', 503); };
  h.bridge.handle({ type: 'transactions.load', data: {} }); await settle();
  assert.equal(h.find('data.loading').at(-1).data.error, 'Ledger unavailable');
  assert.equal(h.find('operation.error').at(-1).data.action, 'transactions.load');
  h.bridge.close();
});

test('Home coalesces live-update bursts, revalidates on reconnect and waits while backgrounded', async () => {
  const h = harness(), pending = deferred();
  h.overrides.me = () => ({ ...account(), requiresOnboarding: false });
  await h.session.setSessionTokens(tokenPair());
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  const before = h.count('home');
  h.live[0].onEvent({ type: 'realtime.status', data: { connected: true } }); await settle();
  assert.equal(h.count('home'), before, 'The first socket connect shares the initial snapshot');
  h.overrides.home = () => pending.promise;
  for (let i = 0; i < 30; i++) h.live[0].onEvent({ type: 'home.updated', data: {} });
  assert.equal(h.count('home'), before + 1, 'Only one live refresh runs at a time');
  assert.equal(h.find('data.loading').filter(event => event.data.resource === 'home').at(-1).data.background, true);
  h.overrides.home = () => ({ hosts: [], page: 1, total: 0 });
  pending.resolve({ hosts: [], page: 1, total: 0 }); await settle();
  assert.equal(h.count('home'), before + 1, 'A fast response does not trigger another immediate fetch during a burst');
  await new Promise(resolve => setTimeout(resolve, 800)); await settle();
  assert.equal(h.count('home'), before + 2, 'One trailing read covers changes during the active read');
  assert.equal(h.find('data.home').at(-1).data.background, true);
  h.live[0].onEvent({ type: 'realtime.status', data: { connected: true } });
  await new Promise(resolve => setTimeout(resolve, 800)); await settle();
  assert.equal(h.count('home'), before + 3, 'A later connection revalidates Home');
  h.activities.forEach(listener => listener('background'));
  for (let i = 0; i < 20; i++) h.live[0].onEvent({ type: 'home.updated', data: {} });
  await settle(); assert.equal(h.count('home'), before + 3, 'A hidden app does not repeatedly fetch Home');
  h.activities.forEach(listener => listener('active')); await settle();
  assert.equal(h.count('home'), before + 4, 'Foreground fetches the outstanding updates once');
  h.bridge.close();
});

test('a live Home refresh cannot replace a newer filter or continue after logout', async () => {
  const h = harness(), old = deferred(), retired = deferred();
  h.overrides.me = () => ({ ...account(), requiresOnboarding: false });
  await h.session.setSessionTokens(tokenPair());
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.home = query => query.mode === 'following' ? { hosts: [{ id: 'followed' }], page: 1, total: 1 } : old.promise;
  h.live[0].onEvent({ type: 'home.updated', data: {} });
  h.live[0].onEvent({ type: 'home.updated', data: {} });
  h.bridge.handle({ type: 'home.reload', data: { mode: 'following', page: 1 } }); await settle();
  const delivered = h.find('data.home').length, reads = h.count('home');
  old.resolve({ hosts: [{ id: 'outdated' }], page: 1, total: 1 }); await settle();
  assert.equal(h.find('data.home').length, delivered);
  assert.equal(h.count('home'), reads, 'An older query cannot queue another invalidation');
  assert.equal(h.find('data.home').at(-1).data.hosts[0].id, 'followed');
  h.overrides.home = () => retired.promise;
  h.live[0].onEvent({ type: 'home.updated', data: {} });
  h.live[0].onEvent({ type: 'home.updated', data: {} });
  const beforeLogout = h.count('home');
  h.bridge.handle({ type: 'auth.logout', data: {} }); await settle();
  retired.resolve({ hosts: [{ id: 'retired-account' }], page: 1, total: 1 }); await settle();
  assert.equal(h.count('home'), beforeLogout);
  assert.equal(h.find('data.home').length, delivered);
  h.bridge.close();
});

test('Home starts with every host and keeps the requested mode through paging, search and realtime refresh', async () => {
  const h = harness();
  h.overrides.me = () => ({ ...account(), requiresOnboarding: false });
  await h.session.setSessionTokens(tokenPair());
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  assert.deepEqual(plain(h.calls.filter(call => call.name === 'home').at(-1).args[0]), { mode: 'popular' }, 'Home lists every host, online or offline');
  assert.ok(h.webMessages.parseWebMessage(JSON.stringify({ type: 'home.reload', data: { mode: 'online', page: 2 } })));
  assert.equal(h.webMessages.parseWebMessage(JSON.stringify({ type: 'home.reload', data: { mode: 'everyone' } })), null);
  h.bridge.handle({ type: 'home.reload', data: { mode: 'online', page: 2 } }); await settle();
  assert.deepEqual(plain(h.calls.filter(call => call.name === 'home').at(-1).args[0]), { mode: 'online', page: 2 });
  h.bridge.handle({ type: 'hosts.search', data: { q: 'offline creator' } }); await settle();
  assert.equal(h.calls.filter(call => call.name === 'home').at(-1).args[0].mode, 'popular', 'Header search can still discover all hosts');
  h.live[0].onEvent({ type: 'home.updated', data: {} }); await settle();
  assert.deepEqual(plain(h.calls.filter(call => call.name === 'home').at(-1).args[0]), { mode: 'online', page: 1 });
  h.bridge.handle({ type: 'home.reload', data: { mode: 'instant', category: 'Music' } }); await settle();
  h.bridge.handle({ type: 'auth.logout', data: {} }); await settle();
  h.overrides.verifyOtp = () => ({ ...account('bob'), requiresOnboarding: false, tokens: tokenPair('bob'), isNew: false });
  h.bridge.handle(verifyMessage(9)); await settle();
  assert.deepEqual(plain(h.calls.filter(call => call.name === 'home').at(-1).args[0]), { mode: 'popular' }, 'A fresh account starts with the full Home rather than the previous filtered query');
  h.bridge.close();
});

test('Following stays selected through paging, search, reconnect and confirmed relationship changes', async () => {
  const h = harness();
  h.overrides.me = () => ({ ...account(), requiresOnboarding: false });
  await h.session.setSessionTokens(tokenPair());
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  const latestQuery = () => plain(h.calls.filter(call => call.name === 'home').at(-1).args[0]);
  assert.ok(h.webMessages.parseWebMessage(JSON.stringify({ type: 'home.reload', data: { mode: 'following', page: 1 } })), 'The trusted web bridge accepts Following');
  h.bridge.handle({ type: 'home.reload', data: { mode: 'following', page: 1 } }); await settle();
  assert.deepEqual(latestQuery(), { mode: 'following', page: 1 });
  h.bridge.handle({ type: 'home.reload', data: { mode: 'following', page: 2 } }); await settle();
  assert.deepEqual(latestQuery(), { mode: 'following', page: 2 });
  h.bridge.handle({ type: 'hosts.search', data: { q: 'creator' } }); await settle();
  h.live[0].onEvent({ type: 'home.updated', data: {} }); await settle();
  assert.deepEqual(latestQuery(), { mode: 'following', page: 1 }, 'Search cannot replace the selected Home feed');
  h.live[0].onEvent({ type: 'realtime.status', data: { connected: false } });
  h.live[0].onEvent({ type: 'realtime.status', data: { connected: true } }); await settle();
  assert.deepEqual(latestQuery(), { mode: 'following', page: 1 }, 'Reconnect refreshes the Following feed');
  for (const on of [true, false]) {
    const write = deferred(); h.overrides.follow = () => write.promise;
    const before = h.count('home');
    h.bridge.handle({ type: 'follow.set', data: { id: 'host', on } }); await settle();
    assert.equal(h.count('home'), before, 'A pending relationship change does not refresh or fabricate Following content');
    write.resolve({ following: on }); await settle();
    assert.equal(h.find('follow.saved').at(-1).data.on, on);
    assert.deepEqual(latestQuery(), { mode: 'following', page: 1 }, 'Follow and unfollow refresh the selected feed after server confirmation');
    assert.equal(h.count('home'), before + 1);
  }
  h.bridge.close();
});

test('a fresh document or replacement account cannot inherit an Explore page as its initial Home feed', async () => {
  for (const replacement of ['document', 'account']) {
    const h = harness(), older = deferred();
    h.overrides.me = () => ({ ...account(), requiresOnboarding: false });
    await h.session.setSessionTokens(tokenPair());
    h.bridge.handle({ type: 'ready', data: { demo: false } }); await settle();
    h.overrides.home = query => query.category === 'Music' ? older.promise : { hosts: [{ id: 'active-home' }], stage: [], page: 1 };
    h.bridge.handle({ type: 'home.reload', data: { mode: 'popular', category: 'Music', page: 3 } });
    if (replacement === 'document') {
      h.bridge.documentLoading();
      h.bridge.handle({ type: 'ready', data: { demo: false } });
    } else {
      await h.session.setSessionTokens(tokenPair('bob'));
      h.overrides.me = () => ({ ...account('bob'), requiresOnboarding: false });
      h.bridge.handle({ type: 'session.resume', data: {} });
    }
    await settle();
    assert.deepEqual(plain(h.calls.filter(call => call.name === 'home').at(-1).args[0]), { mode: 'popular' }, replacement);
    const delivered = h.find('data.home').length;
    older.resolve({ hosts: [{ id: 'old-explore-page' }], stage: [], page: 3 }); await settle();
    assert.equal(h.find('data.home').length, delivered, 'The retired Explore response never replaces fresh Home');
    assert.equal(h.find('data.home').at(-1).data.hosts[0].id, 'active-home');
    h.bridge.close();
  }
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
    h.bridge.handle(payoutMessage());
    h.bridge.handle({ type: 'payout.load', data: { requestId: 2 } });
    await settle();
    for (const name of ['startStream', 'setPresence', 'acceptCall', 'createPost', 'claimAward', 'requestPayout']) assert.equal(h.count(name), 0, `${denied.user.hostStatus || 'member'} cannot invoke ${name}`);
    assert.equal(h.count('payouts'), 1, 'Account-owned history remains available when host capabilities are denied');
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
  const h = streamingHarness(); h.overrides.me = () => approvedAccount();
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
  const h = streamingHarness(), permission = deferred(), revoked = deferred();
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
  const h = streamingHarness(), pending = deferred();
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
  const h = streamingHarness(), older = deferred();
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

test('a recovered incoming ring waits for reconnect approval instead of being declined', async () => {
  const h = harness(), checking = deferred();
  await h.session.setSessionTokens(tokenPair()); h.overrides.me = () => approvedAccount();
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.me = () => checking.promise;
  h.live[0].onEvent({ type: 'realtime.status', data: { connected: false } });
  h.live[0].onEvent({ type: 'realtime.status', data: { connected: true } });
  const ring = { type: 'call.incoming', data: { callId: 'recovered-ring', from: { id: 'member', name: 'Member' }, voice: false } };
  h.live[0].onEvent(ring); await settle();
  assert.equal(h.count('declineCall'), 0, 'Checking approval is not a decline');
  assert.equal(h.find('call.incoming').length, 0, 'Unknown approval cannot display a new ring');
  checking.resolve(approvedAccount()); await settle();
  assert.equal(h.find('call.incoming').at(-1).data.callId, 'recovered-ring');
  assert.equal(h.count('declineCall'), 0);
  h.bridge.close();
});

test('a failed reconnect approval check stays closed to new hosting without ending the existing broadcast', async () => {
  const h = streamingHarness(), checking = deferred();
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

test('chat rejects host-to-host and unapproved host requests before sending them to the API', async () => {
  for (const status of ['approved', 'pending', 'suspended']) {
    const h = harness();
    h.overrides.me = () => ({ ...approvedAccount(), user: { ...approvedAccount().user, serverRole: 'host', role: status === 'approved' ? 'host' : 'sender', hostStatus: status, isVerifiedHost: status === 'approved' }, verification: status === 'approved' ? 'verified' : 'pending' });
    h.overrides.home = () => ({ hosts: [{ id: 'other-host', verified: true }], stage: [] });
    await h.session.setSessionTokens(tokenPair());
    h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
    h.bridge.handle({ type: 'chat.open', data: { with: 'other-host' } }); await settle();
    h.bridge.handle({ type: 'chat.send', data: { to: 'other-host', text: 'Hello' } }); await settle();
    assert.equal(h.count('thread'), 0); assert.equal(h.count('sendMessage'), 0);
    assert.match(h.find('operation.error').at(-1).data.message, status === 'approved' ? /reply to members only/ : /admin approval/);
    h.bridge.close();
  }
});

test('members applying to host still load and send valid member conversations', async () => {
  const h = harness();
  h.overrides.me = () => ({ ...account(), requiresOnboarding: false, user: { ...account().user, serverRole: 'user', hostStatus: 'pending' } });
  await h.session.setSessionTokens(tokenPair());
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  assert.ok(h.count('chats') > 0, 'A pending application does not hide a member inbox');
  h.bridge.handle({ type: 'chat.send', data: { to: 'approved-host', text: 'Hello' } }); await settle();
  assert.equal(h.count('thread'), 1, 'A normal send checks the conversation when there is no loaded thread');
  assert.equal(h.count('sendMessage'), 1);
  h.bridge.close();
});

test('read-only host welcomes cannot send until an authoritative member reply unlocks the conversation', async () => {
  const h = harness();
  h.overrides.me = () => ({ ...approvedAccount(), user: { ...approvedAccount().user, serverRole: 'host' } });
  h.overrides.thread = () => ({ messages: [], canSend: false, sendDisabledReason: 'Wait for this member to reply.' });
  h.overrides.chats = () => ({ chats: [{ user: { id: 'member', role: 'sender', serverRole: 'user' }, canSend: false }] });
  await h.session.setSessionTokens(tokenPair());
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.bridge.handle({ type: 'chat.open', data: { with: 'member' } }); await settle();
  assert.equal(h.find('data.thread').at(-1).data.canSend, false);
  h.bridge.handle({ type: 'chat.send', data: { to: 'member', text: 'Hello' } }); await settle();
  assert.equal(h.count('sendMessage'), 0);
  h.overrides.chats = () => ({ chats: [{ user: { id: 'member', role: 'sender', serverRole: 'user' }, canSend: true }] });
  h.live[0].onEvent({ type: 'chats.updated', data: {} }); await settle();
  h.bridge.handle({ type: 'chat.send', data: { to: 'member', text: 'Thanks for replying' } }); await settle();
  assert.equal(h.count('sendMessage'), 1, 'A member reply unlocks the cached read-only thread');
  h.bridge.close();
});

test('failed thread authorization never sends and a retired authorization cannot borrow a new login', async () => {
  const h = harness(), pending = deferred();
  h.overrides.thread = () => { throw new h.ApiError('Conversation unavailable', 403); };
  h.bridge.handle({ type: 'chat.send', data: { to: 'peer', text: 'Hello' } }); await settle();
  assert.equal(h.count('sendMessage'), 0);
  h.overrides.thread = () => pending.promise;
  h.bridge.handle({ type: 'chat.send', data: { to: 'peer', text: 'Pending' } }); await settle();
  h.bridge.handle({ type: 'auth.logout', data: {} }); await settle();
  pending.resolve({ messages: [], canSend: true }); await settle();
  assert.equal(h.count('sendMessage'), 0);
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

test('notification filters and mutations reject malformed data before making requests', async () => {
  const h = harness(), parse = message => h.webMessages.parseWebMessage(JSON.stringify(message));
  for (const data of [{ page: 0 }, { page: 1.5 }, { page: 10001 }, { limit: 0 }, { limit: 101 }, { q: 'x'.repeat(101) }, { status: 'archived' }, { audience: 'admin' }, { since: 'yesterday' }, { since: '2026-99-99T00:00:00Z' }, { since: '2026-02-31T00:00:00Z' }, { sort: 'random' }, { userId: 'other-user' }, { requestId: -1 }]) {
    const message = { type: 'notifications.load', data }; assert.equal(parse(message), null); h.bridge.handle(message);
  }
  for (const type of ['notifications.read', 'notifications.unread']) {
    for (const ids of [[], ['../note'], ['note', 'note'], Array.from({ length: 101 }, (_, i) => `note-${i}`)]) assert.equal(parse({ type, data: { ids, requestId: 1 } }), null);
    assert.equal(parse({ type, data: { ids: ['note'], requestId: 1, userId: 'other-user' } }), null);
  }
  assert.equal(parse({ type: 'notifications.unread', data: { ids: ['note'] } }), null);
  assert.equal(parse({ type: 'notifications.readAll', data: {} }), null);
  assert.equal(parse({ type: 'notifications.readAll', data: { requestId: 1, ids: ['note'] } }), null);
  assert.ok(parse({ type: 'notifications.read', data: { ids: ['note'] } }), 'Legacy read messages remain valid');
  assert.ok(parse({ type: 'notifications.load', data: { page: 2, limit: 20, q: 'music', status: 'unread', audience: 'personal', since: '2026-10-01T00:00:00.000Z', sort: 'oldest', requestId: 4 } }));
  assert.ok(parse({ type: 'notifications.load', data: { since: '2026-10-01T05:30:00+05:30' } }));
  for (const data of [
    { before: 'yesterday' }, { before: '2026-02-31T00:00:00Z' },
    { since: '2026-10-02T00:00:00Z', before: '2026-10-01T00:00:00Z' },
    { since: '2026-10-01T00:00:00Z', before: '2026-10-01T05:30:00+05:30' },
  ]) { const message = { type: 'notifications.load', data }; assert.equal(parse(message), null); h.bridge.handle(message); }
  assert.ok(parse({ type: 'notifications.load', data: { before: '2026-10-01T00:00:00.000Z' } }));
  assert.ok(parse({ type: 'notifications.load', data: { since: '2026-10-01T05:30:00+05:30', before: '2026-10-02T00:00:00.000Z' } }));
  assert.equal(h.calls.length, 0); h.bridge.close();
});

test('notification queries correlate load states and discard stale filters, accounts and documents', async () => {
  const h = harness(), old = deferred(), next = deferred();
  h.overrides.notifications = query => query.status === 'read' ? old.promise : next.promise;
  h.bridge.handle({ type: 'notifications.load', data: { status: 'read', page: 1, requestId: 1 } });
  h.bridge.handle({ type: 'notifications.load', data: { status: 'unread', page: 2, requestId: 2 } });
  assert.deepEqual(plain(h.calls.filter(call => call.name === 'notifications').map(call => call.args)), [[{ status: 'read', page: 1 }], [{ status: 'unread', page: 2 }]], 'Request metadata is not sent to the API');
  old.resolve({ items: [{ id: 'old' }] }); await settle(); assert.equal(h.find('data.notifications').length, 0);
  next.resolve({ items: [{ id: 'new' }], page: 2 }); await settle();
  assert.equal(h.find('data.notifications')[0].data.requestId, 2); assert.equal(h.find('data.notifications')[0].data.items[0].id, 'new');
  assert.deepEqual(h.find('data.loading').map(event => [event.data.requestId, event.data.page, event.data.loading]), [[1, 1, true], [2, 2, true], [2, 2, false]]);
  const lateDocument = deferred(); h.overrides.notifications = () => lateDocument.promise;
  h.bridge.handle({ type: 'notifications.load', data: { requestId: 3 } }); h.bridge.documentLoading(); lateDocument.resolve({ items: [{ id: 'retired-document' }] }); await settle();
  assert.equal(h.find('data.notifications').length, 1);
  const lateAccount = deferred(); h.overrides.notifications = () => lateAccount.promise;
  h.bridge.handle({ type: 'notifications.load', data: { requestId: 4 } }); await h.session.clearToken(); lateAccount.resolve({ items: [{ id: 'retired-account' }] }); await settle();
  assert.equal(h.find('data.notifications').length, 1); h.bridge.close();
});

test('global notification refresh preserves the owned filter and request while refreshing from page one', async () => {
  const h = harness(), older = deferred();
  await h.session.setSessionTokens(tokenPair());
  h.bridge.handle({ type: 'data.reload', data: {} }); await settle();
  assert.deepEqual(plain(h.calls.filter(call => call.name === 'notifications').at(-1).args), [null], 'Legacy background loads have no filter before the inbox owns one');
  h.overrides.notifications = query => query?.page === 3 ? older.promise : { items: [{ id: 'matching-note' }], page: query?.page || 1, unreadCount: 4 };
  const query = { q: 'my update', status: 'unread', audience: 'personal', since: '2026-10-01T00:00:00.000Z', before: '2026-10-02T00:00:00.000Z', sort: 'oldest', page: 3, limit: 20 };
  h.bridge.handle({ type: 'notifications.load', data: { ...query, requestId: 15 } });
  h.bridge.handle({ type: 'data.reload', data: {} }); await settle();
  assert.deepEqual(plain(h.calls.filter(call => call.name === 'notifications').at(-1).args), [{ ...query, page: 1 }]);
  assert.equal(h.find('data.notifications').at(-1).data.requestId, 15); assert.equal(h.find('data.notifications').at(-1).data.page, 1);
  const states = h.find('data.loading').filter(event => event.data.resource === 'notifications').slice(-2);
  assert.deepEqual(states.map(event => [event.data.requestId, event.data.page, event.data.loading]), [[15, 1, true], [15, 1, false]]);
  const delivered = h.find('data.notifications').length;
  older.resolve({ items: [{ id: 'old-page' }], page: 3 }); await settle();
  assert.equal(h.find('data.notifications').length, delivered, 'The older page cannot append after background refresh restarts the filter'); h.bridge.close();
});

test('notification query ownership is cleared by document, logout and account replacement', async () => {
  for (const retirement of ['document', 'logout', 'account']) {
    const h = harness(); await h.session.setSessionTokens(tokenPair());
    h.bridge.handle({ type: 'notifications.load', data: { q: 'private previous search', status: 'read', requestId: 20 } }); await settle();
    if (retirement === 'document') h.bridge.documentLoading();
    else if (retirement === 'logout') { h.bridge.handle({ type: 'auth.logout', data: {} }); await settle(); await h.session.setSessionTokens(tokenPair('bob')); }
    else { await h.session.clearToken(); await h.session.setSessionTokens(tokenPair('bob')); }
    h.bridge.handle({ type: 'data.reload', data: {} }); await settle();
    assert.deepEqual(plain(h.calls.filter(call => call.name === 'notifications').at(-1).args), [null], `${retirement} retires the prior inbox query`);
    assert.equal(h.find('data.notifications').at(-1).data.requestId, undefined); h.bridge.close();
  }
});

test('notification load failures stay correlated instead of sending an unkeyed stale search error', async () => {
  const h = harness(); h.overrides.notifications = () => { throw new h.ApiError('Prior search unavailable', 503); };
  h.bridge.handle({ type: 'notifications.load', data: { q: 'previous query', requestId: 27 } }); await settle();
  const failed = h.find('data.loading').at(-1).data;
  assert.equal(failed.requestId, 27); assert.equal(failed.error, 'Prior search unavailable'); assert.equal(failed.loading, false);
  assert.equal(h.find('operation.error').length, 0, 'A debouncing UI can ignore the retired request without a generic error ending its new skeleton');
  await h.session.setSessionTokens(tokenPair());
  h.bridge.handle({ type: 'notifications.load', data: { q: 'owned retry', requestId: 28 } }); await settle();
  h.bridge.handle({ type: 'data.reload', data: {} }); await settle();
  assert.equal(h.find('data.loading').filter(event => event.data.resource === 'notifications').at(-1).data.requestId, 28);
  assert.equal(h.find('operation.error').length, 0, 'Background failures keep the same inbox request correlation');
  assert.ok(h.find('data.error').length, 'Global refresh can still report an aggregate failure');
  h.bridge.handle({ type: 'notifications.load', data: {} }); await settle();
  assert.equal(h.find('operation.error').at(-1).data.action, 'notifications.load', 'Legacy messages retain generic error behavior'); h.bridge.close();
});

test('notification read actions wait for acknowledgement, preserve write failures and keep inbox loads independent', async () => {
  const h = harness(), write = deferred(); h.overrides.updateNotificationRead = () => write.promise;
  const message = { type: 'notifications.unread', data: { ids: ['note'], requestId: 5 } };
  h.bridge.handle(message); h.bridge.handle(message); await settle();
  assert.equal(h.count('updateNotificationRead'), 1); assert.equal(h.find('notifications.saved').length, 0);
  assert.equal(h.find('data.loading').filter(event => event.data.resource === 'notifications').length, 0);
  write.resolve({ count: 1, unreadCount: 3, totalCount: 8 }); await settle();
  assert.deepEqual(plain(h.find('notifications.saved')[0].data), { ids: ['note'], read: false, requestId: 5, count: 1, unreadCount: 3, totalCount: 8 });
  assert.equal(h.count('home'), 1); assert.equal(h.count('notifications'), 0, 'The web inbox owns its current query');
  h.overrides.updateNotificationRead = () => ({ count: 3, unreadCount: 0, totalCount: 8 });
  h.bridge.handle({ type: 'notifications.readAll', data: { requestId: 6 } }); await settle();
  assert.deepEqual(plain(h.calls.filter(call => call.name === 'updateNotificationRead').at(-1).args), [{ all: true, read: true }]);
  assert.equal(h.find('notifications.saved').at(-1).data.all, true);
  h.overrides.updateNotificationRead = () => { throw new h.ApiError('Notification update unavailable', 503); };
  h.bridge.handle({ type: 'notifications.read', data: { ids: ['note'], requestId: 7 } }); await settle();
  assert.deepEqual(plain(h.find('notifications.error')[0].data), { requestId: 7, message: 'Notification update unavailable' });
  assert.equal(h.find('operation.error').length, 0); assert.equal(h.find('data.loading').filter(event => event.data.resource === 'notifications').length, 0);
  h.overrides.readNotifications = () => ({ items: [{ id: 'legacy', read: true }], unreadCount: 0 });
  h.bridge.handle({ type: 'notifications.read', data: { ids: ['legacy'] } }); await settle();
  assert.equal(h.count('readNotifications'), 1); assert.equal(h.find('data.notifications').at(-1).data.items[0].id, 'legacy'); h.bridge.close();
});

test('notification mutation results and failures never leak to replacement documents or accounts', async () => {
  for (const retirement of ['document', 'account']) {
    for (const failure of [false, true]) {
      const h = harness(), write = deferred(); h.overrides.updateNotificationRead = () => write.promise;
      h.bridge.handle({ type: 'notifications.read', data: { ids: ['note'], requestId: 8 } });
      if (retirement === 'document') h.bridge.documentLoading(); else await h.session.clearToken();
      if (failure) write.reject(new h.ApiError('Old error', 503)); else write.resolve({ count: 1, unreadCount: 0, totalCount: 1 });
      await settle(); assert.equal(h.find('notifications.saved').length, 0); assert.equal(h.find('notifications.error').length, 0); assert.equal(h.count('home'), 0); h.bridge.close();
    }
  }
});

test('public profiles and posts validate target IDs and keep target/request metadata through loading and failure', async () => {
  const h = harness();
  for (const message of [
    { type: 'profile.load', data: { id: '../member' } }, { type: 'profile.load', data: { id: 'host', url: 'https://example.test' } },
    { type: 'profile.posts.load', data: { id: 'host', page: 0 } }, { type: 'profile.posts.load', data: { id: 'host', page: 1.5 } },
    { type: 'profile.posts.load', data: { id: 'host', requestId: -1 } }, { type: 'follow.set', data: { id: 'host', on: true, role: 'host' } },
  ]) { assert.equal(h.webMessages.parseWebMessage(JSON.stringify(message)), null); h.bridge.handle(message); }
  assert.equal(h.calls.length, 0);
  h.overrides.publicProfile = id => ({ id, name: 'Aster', role: 'host', serverRole: 'host', followingCount: 3, followers: 42, following: false, joined: '', interests: [] });
  h.bridge.handle({ type: 'profile.load', data: { id: 'host', requestId: 5 } }); await settle();
  assert.equal(h.find('data.publicProfile')[0].data.id, 'host'); assert.equal(h.find('data.publicProfile')[0].data.requestId, 5);
  assert.deepEqual(h.find('data.loading').map(event => [event.data.resource, event.data.id, event.data.requestId, event.data.loading]), [['publicProfile', 'host', 5, true], ['publicProfile', 'host', 5, false]]);
  h.overrides.publicPosts = () => { throw new h.ApiError('Posts are temporarily unavailable', 503); };
  h.bridge.handle({ type: 'profile.posts.load', data: { id: 'host', page: 2, requestId: 6 } }); await settle();
  const failure = h.find('data.loading').at(-1).data;
  assert.equal(failure.id, 'host'); assert.equal(failure.page, 2); assert.equal(failure.requestId, 6); assert.equal(failure.loading, false); assert.equal(failure.error, 'Posts are temporarily unavailable');
  assert.equal(h.find('data.publicPosts').length, 0, 'Media failure does not fabricate an empty gallery');
  assert.equal(h.find('data.publicProfile').length, 1, 'A failed gallery does not remove the loaded identity');
  h.bridge.close();
});

test('public profile and gallery reads suppress earlier people and previous sessions', async () => {
  const h = harness(), old = deferred(), next = deferred(), oldPosts = deferred(), nextPosts = deferred();
  h.overrides.publicProfile = id => id === 'old' ? old.promise : next.promise;
  h.overrides.publicPosts = id => id === 'old' ? oldPosts.promise : nextPosts.promise;
  for (const [id, requestId] of [['old', 1], ['next', 2]]) {
    h.bridge.handle({ type: 'profile.load', data: { id, requestId } });
    h.bridge.handle({ type: 'profile.posts.load', data: { id, requestId } });
  }
  old.resolve({ id: 'old' }); oldPosts.resolve({ posts: [], total: 0, page: 1, limit: 12 }); await settle();
  assert.equal(h.find('data.publicProfile').length, 0); assert.equal(h.find('data.publicPosts').length, 0);
  next.resolve({ id: 'next', name: 'Next' }); nextPosts.resolve({ posts: [{ id: 'next-post' }], total: 1, page: 1, limit: 12 }); await settle();
  assert.equal(h.find('data.publicProfile')[0].data.id, 'next'); assert.equal(h.find('data.publicPosts')[0].data.posts[0].id, 'next-post');
  const late = deferred(); h.overrides.publicProfile = () => late.promise;
  h.bridge.handle({ type: 'profile.load', data: { id: 'late', requestId: 3 } });
  await h.session.clearToken(); late.resolve({ id: 'late' }); await settle();
  assert.equal(h.find('data.publicProfile').length, 1, 'Account changes retire profile reads'); h.bridge.close();
});

test('follow waits for acknowledgement, protects in-flight relationship reads and exposes recoverable write failures', async () => {
  const h = harness(), write = deferred(), oldRead = deferred();
  h.overrides.publicProfile = () => oldRead.promise;
  h.overrides.follow = () => write.promise;
  h.bridge.handle({ type: 'profile.load', data: { id: 'host', requestId: 3 } });
  const message = { type: 'follow.set', data: { id: 'host', on: true, requestId: 4 } };
  h.bridge.handle(message); h.bridge.handle(message); await settle();
  assert.equal(h.count('follow'), 1, 'Duplicate pending follows are serialized per target'); assert.equal(h.find('follow.saved').length, 0);
  write.resolve({ following: true }); await settle();
  const saved = h.find('follow.saved')[0].data;
  assert.equal(saved.id, 'host'); assert.equal(saved.on, true); assert.equal(saved.requestId, 4);
  assert.equal(h.count('publicProfile'), 1, 'Acknowledging a follow does not start another profile skeleton'); assert.equal(h.count('profileSettings'), 1); assert.equal(h.count('home'), 1);
  oldRead.resolve({ id: 'host', following: false, followers: 41 }); await settle();
  assert.equal(h.find('data.publicProfile')[0].data.profile.following, true, 'An old relationship read cannot undo the acknowledged follow');
  assert.equal(h.find('data.publicProfile')[0].data.profile.followers, 42, 'The acknowledged relationship updates the count once');
  assert.equal(h.find('data.publicProfile')[0].data.requestId, 3);
  h.overrides.follow = () => { throw new h.ApiError('Follow unavailable', 503); };
  h.bridge.handle({ type: 'follow.set', data: { id: 'host', on: false, requestId: 5 } }); await settle();
  const failure = h.find('follow.error')[0].data;
  assert.equal(failure.id, 'host'); assert.equal(failure.on, false); assert.equal(failure.requestId, 5); assert.equal(failure.message, 'Follow unavailable');
  assert.equal(h.find('follow.saved').length, 1); h.bridge.close();
});

test('follow acknowledgements never leak into a replacement account', async () => {
  const h = harness(), write = deferred(); h.overrides.follow = () => write.promise;
  h.bridge.handle({ type: 'follow.set', data: { id: 'host', on: true, requestId: 9 } });
  await h.session.clearToken(); write.resolve({ following: true }); await settle();
  assert.equal(h.find('follow.saved').length, 0); assert.equal(h.count('home'), 0); h.bridge.close();
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

test('theme messages reject injected authority, arbitrary styles and malformed purchase requests', async () => {
  const h = harness();
  const invalid = [
    { type: 'themes.select', data: { themeId: '000000000000000000000001', premium: true } },
    { type: 'themes.select', data: { themeId: 'default', requestId: 1 } },
    { type: 'themes.select', data: { themeId: '000000000000000000000001', colors: { background: '#000000' } } },
    { type: 'themes.premium.checkout', data: { idempotencyKey: 'attempt-123', pricePaise: 1 } },
    { type: 'themes.premium.checkout', data: { idempotencyKey: 'short' } },
    { type: 'themes.premium.verify', data: { merchantOrderId: 'order', status: 'SUCCESS' } },
  ];
  for (const message of invalid) { assert.equal(h.webMessages.parseWebMessage(JSON.stringify(message)), null); h.bridge.handle(message); }
  await settle(); assert.equal(h.calls.length, 0);
  h.bridge.close();
});

test('theme selection waits for the server and retires preexisting catalog reads', async () => {
  const h = harness(), older = deferred(), selection = deferred();
  h.overrides.themes = () => older.promise;
  h.overrides.selectTheme = () => selection.promise;
  h.bridge.handle({ type: 'themes.load', data: {} });
  h.bridge.handle({ type: 'themes.select', data: { themeId: '000000000000000000000002', requestId: 27 } });
  assert.equal(h.find('themes.selected').length, 0);
  selection.resolve(themeCatalog(false, '000000000000000000000002')); await settle();
  assert.equal(h.find('themes.selected')[0].data.requestId, 27);
  older.resolve(themeCatalog()); await settle();
  assert.equal(h.find('data.themes').length, 1);
  assert.equal(h.find('data.themes')[0].data.selectedThemeId, '000000000000000000000002');
  assert.equal(h.find('data.loading').filter(event => event.data.resource === 'themes').at(-1).data.loading, false);
  h.bridge.close();
});

test('the admin default reaches signed-out screens and each account theme is cached until sign-out', async () => {
  const h = harness(), cache = () => h.load('src/theme-cache.ts').readThemeCache();
  const theme = (id, name, mode) => ({ id, slug: '', name, description: '', isPremium: false, active: true, isDefault: false, sortOrder: 0, mode,
    colors: { background: '#fbf5ee', surface: '#fffcf8', surfaceElevated: '#f8e3e5', text: '#3a272e', textMuted: '#76606a', primary: '#b03d66', primaryContrast: '#ffffff', secondary: '#933459', border: '#ead3d2', success: '#2b7a57', danger: '#b5364c' },
    typography: { fontFamily: 'system', fontScale: 1, fontWeight: '400', headingWeight: '700' } });
  h.overrides.defaultTheme = () => theme('000000000000000000000005', 'Blush & Cream', 'light');
  h.bridge.handle({ type: 'ready', data: { demo: false } }); await settle();
  assert.equal(h.find('theme.default')[0].data.name, 'Blush & Cream', 'Signed-out screens receive the admin default');
  assert.equal(cache().default.name, 'Blush & Cream', 'The default is kept for the next launch');
  const rose = theme('000000000000000000000002', 'Soft Rose', 'light');
  h.overrides.themes = () => ({ ...themeCatalog(false, rose.id), items: [rose] });
  h.overrides.verifyOtp = () => ({ ...account(), requiresOnboarding: false, tokens: tokenPair(), isNew: false });
  h.bridge.handle(verifyMessage()); await settle(); await settle();
  assert.deepEqual([cache().account.id, cache().account.theme.name], ['alice', 'Soft Rose'], 'The signed-in theme is kept for the next launch');
  h.bridge.handle({ type: 'auth.logout', data: {} }); await settle(); await settle();
  assert.equal(cache().account, undefined, 'Signing out forgets the account theme');
  assert.equal(cache().default.name, 'Blush & Cream', 'Signing out keeps the admin default');
  h.disk.set('zimi.theme.v1', '{"default":{"id":"x","colors":{"primary":"red;position:fixed"}}');
  assert.equal(JSON.stringify(cache()), '{}', 'A corrupt or unsafe entry reads as empty');
  h.bridge.close();
});

test('premium selection rejection reloads authoritative fallback and never acknowledges success', async () => {
  const h = harness();
  h.overrides.selectTheme = () => { throw new h.ApiError('Premium access is required', 403); };
  h.bridge.handle({ type: 'themes.select', data: { themeId: '000000000000000000000004', requestId: 9 } }); await settle();
  assert.equal(h.find('themes.selected').length, 0);
  assert.equal(h.find('themes.error')[0].data.requestId, 9);
  assert.equal(h.find('data.themes')[0].data.premium.active, false);
  h.bridge.close();
});

test('premium checkout preserves terminal API codes without treating network failures as terminal', async () => {
  const h = harness();
  h.overrides.checkoutPremium = () => { throw new h.ApiError('Payment setup failed. Start a new checkout.', 502, 'PAYIN_PROVISIONING_FAILED'); };
  const checkout = { type: 'themes.premium.checkout', data: { idempotencyKey: 'premium-attempt-1' } };
  h.bridge.handle(checkout); await settle();
  assert.equal(h.find('themes.error')[0].data.action, 'themes.premium.checkout');
  assert.equal(h.find('themes.error')[0].data.code, 'PAYIN_PROVISIONING_FAILED');
  assert.equal(h.find('themes.error')[0].data.message, 'Payment setup failed. Start a new checkout.');
  h.overrides.checkoutPremium = () => { throw new Error('Network connection lost'); };
  h.bridge.handle(checkout); await settle();
  assert.equal(h.find('themes.error')[1].data.code, undefined);
  assert.equal(h.find('themes.premium.checkout').length, 0);
  assert.equal(h.opened.length, 0);
  h.bridge.close();
});

test('premium checkout opens once, verifies on resume and derives access only from refreshed catalog', async () => {
  const h = harness(), checkout = deferred();
  h.overrides.checkoutPremium = () => checkout.promise;
  h.overrides.verifyPremium = () => ({ purchaseId: 'premium-purchase', merchantOrderId: 'premium_order', kind: 'premium', status: 'SUCCESS' });
  const message = { type: 'themes.premium.checkout', data: { idempotencyKey: 'premium-attempt-1' } };
  h.bridge.handle(message); h.bridge.handle(message);
  assert.equal(h.count('checkoutPremium'), 1);
  checkout.resolve({ purchaseId: 'premium-purchase', merchantOrderId: 'premium_order', kind: 'premium', status: 'PENDING', paymentUrl: 'https://checkout.example.test/premium' }); await settle();
  assert.deepEqual(h.opened, ['https://checkout.example.test/premium']);
  assert.equal(h.find('data.themes').length, 0, 'Opening the provider does not grant theme access');
  h.activities.forEach(listener => listener('active')); await settle();
  assert.equal(h.calls.find(call => call.name === 'verifyPremium').args[0], 'premium_order');
  assert.equal(h.find('themes.premium.purchase')[0].data.status, 'SUCCESS');
  assert.equal(h.find('data.themes')[0].data.premium.active, false, 'A payment event alone cannot grant entitlement');
  assert.equal(h.count('wallet'), 0, 'Premium payment does not fabricate wallet credits');
  h.activities.forEach(listener => listener('active')); await settle();
  assert.equal(h.count('verifyPremium'), 1);
  h.bridge.close();
});

test('foreground and realtime refresh theme entitlement while logout suppresses late purchase work', async () => {
  const h = harness(), pending = deferred();
  await h.session.setSessionTokens(tokenPair());
  h.overrides.me = () => ({ ...account(), requiresOnboarding: false });
  h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  assert.ok(h.count('themes') >= 1);
  const before = h.count('themes');
  h.activities.forEach(listener => listener('active')); await settle();
  h.live[0].onEvent({ type: 'themes.updated', data: { active: true } }); await settle();
  assert.equal(h.count('themes'), before + 2);
  assert.equal(h.find('data.themes').at(-1).data.premium.active, false);
  h.overrides.checkoutPremium = () => pending.promise;
  h.bridge.handle({ type: 'themes.premium.checkout', data: { idempotencyKey: 'premium-attempt-2' } });
  h.bridge.handle({ type: 'auth.logout', data: {} }); await settle();
  pending.resolve({ purchaseId: 'late', merchantOrderId: 'late_order', status: 'PENDING', paymentUrl: 'https://checkout.example.test/late' }); await settle();
  assert.equal(h.opened.length, 0);
  assert.equal(h.find('themes.premium.checkout').length, 0);
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

test('live queue refreshes from actual requests and ignores completion after leaving the room', async () => {
  const h = streamingHarness(), pending = deferred();
  await h.session.setSessionTokens(tokenPair()); h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.joinStream = id => ({ id }); h.overrides.streamMessages = () => [];
  h.bridge.handle({ type: 'stream.join', data: { streamId: 'room-one' } }); await settle();
  assert.equal(h.find('stream.requests').at(-1).data.count, 0);
  const item = { id: 'request-one', streamId: 'room-one', userId: 'alice', name: 'Alice', status: 'pending', createdAt: '2026-10-16T10:00:00Z' };
  h.overrides.requestStreamCall = streamId => ({ streamId, requests: [item], count: 1, ownRequestId: item.id });
  h.bridge.handle({ type: 'stream.request', data: { streamId: 'room-one' } }); await settle();
  assert.equal(h.find('stream.requests').at(-1).data.ownRequestId, item.id);
  assert.equal(h.count('startCall'), 0, 'Queueing must not ring or reserve a real call');
  h.overrides.streamRequests = () => pending.promise;
  h.live[0].onEvent({ type: 'stream.requests.changed', data: { streamId: 'room-one' } }); await settle();
  h.bridge.handle({ type: 'stream.leave', data: { streamId: 'room-one' } }); await settle();
  const delivered = h.find('stream.requests').length;
  pending.resolve({ streamId: 'room-one', requests: [item], count: 1, ownRequestId: item.id }); await settle();
  assert.equal(h.find('stream.requests').length, delivered, 'An old room cannot restore its queue after leave');
  h.bridge.close();
});

test('queued acceptance checks host access and never emits connected before UI media preparation', async () => {
  const denied = streamingHarness(); denied.overrides.me = () => account();
  denied.bridge.handle({ type: 'stream.request.accept', data: { streamId: 'room', id: 'entry' } }); await settle();
  assert.equal(denied.count('acceptStreamRequest'), 0); denied.bridge.close();
  const h = streamingHarness(); h.overrides.me = () => approvedAccount();
  h.overrides.acceptStreamRequest = () => ({ streamId: 'room', requestId: 'entry', callId: 'private-call', peerId: 'member', initiator: false, voice: false, peer: { id: 'member', name: 'Member' } });
  h.bridge.handle({ type: 'stream.request.accept', data: { streamId: 'room', id: 'entry' } }); await settle();
  assert.equal(h.count('acceptStreamRequest'), 1); assert.equal(h.find('stream.privateCall').length, 1);
  assert.equal(h.find('call.connected').length, 0, 'The UI acquires private media before connecting');
  h.bridge.handle({ type: 'call.end', data: {} }); await settle();
  assert.equal(h.calls.find(call => call.name === 'endCall').args[0], 'private-call', 'Private transitions retain normal call cleanup');
  h.bridge.close();
});

test('leaving during queued acceptance cancels a late call instead of reopening media', async () => {
  const h = streamingHarness(), pending = deferred(); h.overrides.me = () => approvedAccount();
  await h.session.setSessionTokens(tokenPair()); h.bridge.handle({ type: 'session.resume', data: {} }); await settle();
  h.overrides.startStream = () => ({ id: 'room' }); h.overrides.streamMessages = () => [];
  h.bridge.handle({ type: 'stream.start', data: { title: 'Music', category: 'Music' } }); await settle();
  h.overrides.acceptStreamRequest = () => pending.promise;
  h.bridge.handle({ type: 'stream.request.accept', data: { streamId: 'room', id: 'entry' } }); await settle();
  h.bridge.handle({ type: 'stream.end', data: { streamId: 'room' } }); await settle();
  const result = { streamId: 'room', requestId: 'entry', callId: 'late-private', peerId: 'member', initiator: false, voice: false, peer: { id: 'member', name: 'Member' } };
  h.live[0].onEvent({ type: 'stream.privateCall', data: result }); pending.resolve(result); await settle();
  assert.equal(h.find('stream.privateCall').length, 0);
  assert.ok(h.calls.filter(call => call.name === 'endCall').every(call => call.args[0] === result.callId));
  assert.ok(h.count('endCall') >= 1); h.bridge.close();
});

const linkedStream = id => ({ id, hostId: 'linked-host', host: { id: 'linked-host', name: 'Linked Creator' }, title: 'Live music', category: 'Music', kind: 'video', viewers: 3, createdAt: '', status: 'live' });

test('native live links and share messages reject arbitrary URLs, injected fields and malformed room IDs', () => {
  const h = harness();
  assert.equal(h.webMessages.parseLiveLink('binzolive://live/room_123-abc'), 'room_123-abc');
  for (const url of [null, {}, 'https://evil.test/live/room', 'javascript:alert(1)', 'binzolive://live.evil.test/room', 'binzolive://user@live/room', 'binzolive://live:443/room', 'binzolive://live/../room', 'binzolive://live/%2e%2e', 'binzolive://live/room?token=secret', 'binzolive://live/room#host', 'binzolive://live/room/extra', 'binzolive://live/', 'binzolive://live/'+ 'x'.repeat(129), ' binzolive://live/room']) assert.equal(h.webMessages.parseLiveLink(url), null);
  for (const data of [{streamId:'room',url:'https://evil.test'}, {streamId:'../room'}, {streamId:'room',hosting:true}]) assert.equal(h.webMessages.parseWebMessage(JSON.stringify({type:'stream.share',data})),null);
  h.bridge.close(); assert.equal(h.links.length,0,'Native URL subscriptions stop with the bridge');
});

test('a cold live link waits for WebView readiness, login and onboarding before selecting the server room', async () => {
  const h = streamingHarness('active','binzolive://live/cold-room'); h.overrides.stream = linkedStream;
  await settle(); assert.equal(h.count('stream'),0);
  h.bridge.handle({type:'ready',data:{demo:false}});await settle();assert.equal(h.find('session.none').length,1);assert.equal(h.count('stream'),0);
  h.bridge.handle(verifyMessage());await settle();assert.equal(h.count('stream'),0,'Onboarding is not interrupted by a live invite');
  h.overrides.saveProfile=()=>({...account(),requiresOnboarding:false});
  h.bridge.handle({type:'profile.save',data:{name:'Alice',onboarding:true}});await settle();
  assert.equal(h.find('stream.link')[0].data.stream.id,'cold-room');assert.equal(h.find('stream.link')[0].data.stream.host.name,'Linked Creator');
  assert.deepEqual(h.find('stream.link.loading').map(event=>event.data.loading),[true,false]);
  assert.equal(h.count('joinStream'),0,'An external link selects the room for confirmation without opening media');h.bridge.close();
});

test('warm live links use the latest selection and discard older responses and delayed cold URLs', async () => {
  const initial=deferred(), first=deferred(),second=deferred(),h=streamingHarness('active',()=>initial.promise);
  h.overrides.me=()=>({...account(),requiresOnboarding:false});h.overrides.stream=id=>id==='first'?first.promise:second.promise;
  await h.session.setSessionTokens(tokenPair());h.bridge.handle({type:'ready',data:{demo:false}});await settle();
  h.links.forEach(listener=>listener({url:'binzolive://live/first'}));await settle();
  h.links.forEach(listener=>listener({url:'binzolive://live/second'}));await settle();
  initial.resolve('binzolive://live/stale-cold-room');second.resolve(linkedStream('second'));await settle();first.resolve(linkedStream('first'));await settle();
  assert.deepEqual(h.calls.filter(call=>call.name==='stream').map(call=>call.args[0]),['first','second']);
  assert.deepEqual(h.find('stream.link').map(event=>event.data.stream.id),['second']);
  h.bridge.documentLoading();h.links.forEach(listener=>listener({url:'binzolive://live/reloaded'}));await settle();assert.equal(h.count('stream'),2);
  h.overrides.stream=linkedStream;h.bridge.handle({type:'ready',data:{demo:false}});await settle();assert.equal(h.find('stream.link').at(-1).data.stream.id,'reloaded');h.bridge.close();
});

test('logout suppresses pending live-link results and new signed-out links wait for the next login', async () => {
  const h=streamingHarness(), pending=deferred();h.overrides.me=()=>({...account(),requiresOnboarding:false});h.overrides.stream=()=>pending.promise;
  await h.session.setSessionTokens(tokenPair());h.bridge.handle({type:'ready',data:{demo:false}});await settle();
  h.links.forEach(listener=>listener({url:'binzolive://live/old-account-room'}));await settle();
  h.bridge.handle({type:'auth.logout',data:{}});await settle();pending.resolve(linkedStream('old-account-room'));await settle();assert.equal(h.find('stream.link').length,0);
  h.links.forEach(listener=>listener({url:'binzolive://live/new-room'}));await settle();assert.equal(h.count('stream'),1);
  h.overrides.stream=linkedStream;h.overrides.verifyOtp=()=>({...account('next'),requiresOnboarding:false,tokens:tokenPair('next'),isNew:false});
  h.bridge.handle(verifyMessage(7));await settle();assert.equal(h.find('stream.link')[0].data.stream.id,'new-room');h.bridge.close();
});

test('unavailable live links report an error and always settle their loading state', async () => {
  const h=streamingHarness();h.overrides.me=()=>({...account(),requiresOnboarding:false});h.overrides.stream=id=>({...linkedStream(id),status:'ended'});
  await h.session.setSessionTokens(tokenPair());h.bridge.handle({type:'ready',data:{demo:false}});await settle();
  h.links.forEach(listener=>listener({url:'binzolive://live/ended-room'}));await settle();
  assert.equal(h.find('stream.link').length,0);assert.equal(h.find('operation.error').at(-1).data.action,'stream.link');assert.equal(h.find('stream.link.loading').at(-1).data.loading,false);
  assert.equal(h.count('joinStream'),0);h.bridge.close();
});

test('ads load and count quietly, and a tap opens its counted link once', async () => {
  const h=harness(),id='6a0000000000000000000001',url='https://play.google.com/store/apps/details?id=com.zimi.studio';
  const feed={adFree:false,items:[{id,format:'banner'}]};h.overrides.me=()=>({...account(),requiresOnboarding:false});h.overrides.ads=()=>feed;
  await h.session.setSessionTokens(tokenPair());h.bridge.handle({type:'session.resume',data:{}});await settle();
  assert.equal(h.count('ads'),1,'Ads load with the account');assert.deepEqual(h.find('data.ads').at(-1).data,feed);
  const errors=()=>h.find('operation.error').length+h.find('data.error').length,quiet=errors();
  h.overrides.ads=()=>{throw new h.ApiError('Service unavailable',503)};h.bridge.handle({type:'ads.load',data:{}});await settle();
  assert.equal(errors(),quiet,'An unavailable ad list never interrupts with an error');
  h.overrides.adImpression=()=>({counted:false,servable:false});h.bridge.handle({type:'ads.impression',data:{id,placement:'home'}});await settle();
  assert.equal(h.find('ads.retired').at(-1).data.id,id,'A campaign the server stops serving leaves rotation');
  h.overrides.adImpression=()=>{throw new h.ApiError('Too many requests',429)};h.bridge.handle({type:'ads.impression',data:{id,placement:'home'}});await settle();
  assert.equal(errors(),quiet,'A missed view is never an error message');
  const click={type:'ads.click',data:{id,placement:'chats'}};h.overrides.adClick=()=>url;
  h.bridge.handle(click);h.bridge.handle(click);await settle();
  assert.equal(h.count('adClick'),1,'A double tap counts and opens once');assert.deepEqual([...h.calls.find(call=>call.name==='adClick').args],[id,'chats']);
  assert.deepEqual(h.opened,[url]);assert.deepEqual(h.find('ads.opened').map(post=>post.data.id),[id]);
  h.overrides.adClick=()=>{throw new h.ApiError('This promotion has ended.',410)};h.bridge.handle(click);await settle();
  const failure=h.find('operation.error').at(-1).data;assert.deepEqual([failure.action,failure.id,failure.message],['ads.click',id,'This promotion has ended.']);
  assert.equal(h.find('ads.retired').length,2);assert.equal(h.opened.length,1,'Nothing opens without a counted link');
  const reads=h.count('ads');h.live[0].onEvent({type:'ads.updated',data:{}});await settle();assert.equal(h.count('ads'),reads+1,'Campaign and premium changes refresh the ad list');
  for(const data of [{id:'not-an-id',placement:'home'},{id,placement:'feed'},{id,placement:'home',url},{id}])assert.equal(h.webMessages.parseWebMessage(JSON.stringify({type:'ads.click',data})),null);
  assert.equal(h.webMessages.parseWebMessage(JSON.stringify({type:'ads.load',data:{page:2}})),null);h.bridge.close();
});

test('share live opens one native share sheet with the active room link and returns selectable link text', async () => {
  const h=streamingHarness(),share=deferred();h.overrides.me=()=>({...account(),requiresOnboarding:false});h.overrides.joinStream=linkedStream;h.overrides.streamMessages=()=>[];h.overrides.share=()=>share.promise;
  await h.session.setSessionTokens(tokenPair());h.bridge.handle({type:'ready',data:{demo:false}});await settle();
  h.bridge.handle({type:'stream.join',data:{streamId:'shared-room'}});await settle();
  const message={type:'stream.share',data:{streamId:'shared-room'}};h.bridge.handle(message);h.bridge.handle(message);await settle();
  assert.equal(h.shares.length,1);assert.equal(h.shares[0].message,'Join this live on BinzoLive: binzolive://live/shared-room');
  assert.equal(h.find('stream.shareLink')[0].data.url,'binzolive://live/shared-room');share.resolve({action:'dismissedAction'});await settle();
  h.bridge.handle({type:'stream.share',data:{streamId:'another-room'}});await settle();assert.equal(h.shares.length,1);assert.equal(h.find('operation.error').at(-1).data.action,'stream.share');h.bridge.close();
});

test('accepted calls allow the first host message with server-verified call context without unlocking normal text chat', async () => {
  const h=harness();h.overrides.me=()=>approvedAccount();h.overrides.thread=()=>({messages:[],canSend:false});h.overrides.chats=()=>({chats:[{user:{id:'member',role:'sender',serverRole:'user'},canSend:false}]});
  await h.session.setSessionTokens(tokenPair());h.bridge.handle({type:'session.resume',data:{}});await settle();
  h.bridge.handle({type:'chat.open',data:{with:'member'}});await settle();
  h.bridge.handle({type:'chat.send',data:{to:'member',text:'No active call',inCall:true}});await settle();assert.equal(h.count('sendMessage'),0);
  h.live[0].onEvent({type:'call.connected',data:{callId:'accepted-call',initiator:false,peerId:'member',voice:false}});
  h.bridge.handle({type:'chat.send',data:{to:'member',text:'Hello on our call',inCall:true}});await settle();
  assert.equal(h.count('sendMessage'),1);assert.deepEqual(h.calls.find(call=>call.name==='sendMessage').args,['member','Hello on our call','accepted-call',undefined]);
  assert.equal(h.count('thread'),1,'The active call bypasses only the cached conversation restriction');
  h.live[0].onEvent({type:'call.ended',data:{callId:'accepted-call'}});
  h.bridge.handle({type:'chat.send',data:{to:'member',text:'After call',inCall:true}});h.bridge.handle({type:'chat.send',data:{to:'member',text:'Ordinary message'}});await settle();
  assert.equal(h.count('sendMessage'),1,'Ending the call does not grant permission to start ordinary text chat');h.bridge.close();
});

const pushSettings = (serverPush = true) => { const settings = profileSettings(); settings.capabilities.pushNotifications = serverPush; return settings; };
const signedIn = (id = 'alice') => ({ ...account(id), requiresOnboarding: false, tokens: tokenPair(id), isNew: false });
const pushCapability = h => h.find('data.profileSettings').at(-1).data.capabilities;

test('push registers each session only when the server can send, and settings report this device', async () => {
  const h = harness();
  h.overrides.verifyOtp = () => signedIn();
  h.overrides.profileSettings = () => pushSettings(false);
  h.bridge.handle(verifyMessage()); await settle();
  assert.deepEqual(h.push.modes, [], 'Never spend the permission prompt while the server cannot send');
  assert.deepEqual([pushCapability(h).nativePushRegistered, pushCapability(h).nativePushStatus], [false, 'unavailable']);

  h.overrides.profileSettings = () => pushSettings(true);
  h.bridge.handle({ type: 'profile.settings.load', data: {} }); await settle();
  assert.deepEqual(h.push.modes, ['prompt']);
  assert.deepEqual(h.calls.filter(call => call.name === 'registerPushDevice').map(call => call.args), [['fcm:device-token']]);
  assert.deepEqual([pushCapability(h).nativePushRegistered, pushCapability(h).nativePushStatus], [true, 'registered']);
  h.bridge.handle({ type: 'profile.settings.load', data: {} }); await settle();
  assert.equal(h.count('registerPushDevice'), 1, 'Settings reloads do not re-register the same session');

  h.bridge.handle({ type: 'auth.logout', data: {} }); await settle();
  assert.equal(h.push.cleared, 1, 'The previous account leaves nothing in the tray');
  h.push.tokenListener('fcm:rotated-after-logout'); await settle();
  assert.equal(h.count('registerPushDevice'), 1, 'A signed-out device registers nothing');

  h.overrides.verifyOtp = () => signedIn('bob');
  h.bridge.handle(verifyMessage(2)); await settle();
  assert.deepEqual(h.push.modes, ['prompt', 'silent'], 'A later account re-registers without prompting again');
  assert.equal(h.count('registerPushDevice'), 2);
  h.push.tokenListener('fcm:rotated'); await settle();
  assert.deepEqual(h.calls.filter(call => call.name === 'registerPushDevice').at(-1).args, ['fcm:rotated']);
  h.bridge.close();
  assert.equal(h.push.stopped, 1);
  assert.equal(h.push.tokenListener, undefined);
});

test('denied permission is reported, retried silently in the foreground and can be asked again from settings', async () => {
  const h = harness();
  h.push.status = 'denied';
  h.overrides.verifyOtp = () => signedIn();
  h.overrides.profileSettings = () => pushSettings(true);
  h.bridge.handle(verifyMessage()); await settle();
  assert.deepEqual([pushCapability(h).nativePushRegistered, pushCapability(h).nativePushStatus], [false, 'denied']);
  h.activities.forEach(listener => listener('active')); await settle();
  assert.deepEqual(h.push.modes, ['prompt', 'silent']);

  assert.ok(h.webMessages.parseWebMessage(JSON.stringify({ type: 'push.enable', data: {} })));
  assert.equal(h.webMessages.parseWebMessage(JSON.stringify({ type: 'push.enable', data: { token: 'injected' } })), null);
  h.push.status = 'registered';
  h.bridge.handle({ type: 'push.enable', data: {} }); await settle();
  assert.equal(h.push.modes.at(-1), 'settings');
  assert.deepEqual([pushCapability(h).nativePushRegistered, pushCapability(h).nativePushStatus], [true, 'registered']);
  h.activities.forEach(listener => listener('active')); await settle();
  assert.equal(h.push.modes.length, 3, 'A registered device is not re-checked on every foreground');

  h.overrides.saveProfileSettings = () => pushSettings(true);
  h.bridge.handle({ type: 'profile.settings.save', data: { pushNotifications: true, requestId: 4 } }); await settle();
  const saved = h.find('profile.settings.saved').at(-1);
  assert.equal(saved?.data.settings.capabilities.nativePushStatus, 'registered', 'Saved settings keep the device status');
  h.bridge.close();
});

test('Answer on a call notification reaches the screens once a signed-in screen can show it', async () => {
  const h = harness();
  h.overrides.me = () => ({ ...account(), requiresOnboarding: false });
  await h.session.setSessionTokens(tokenPair());
  h.push.answer('call-1'); await settle();
  assert.equal(h.find('call.answer').length, 0, 'The app launched from Answer waits for its document');
  h.bridge.handle({ type: 'ready', data: { demo: false } }); await settle();
  assert.deepEqual(h.find('call.answer').map(post => post.data.callId), ['call-1']);
  assert.ok(h.push.tracked.includes('call.answer'), 'Every message to the screens passes through trackCall');
  h.bridge.close();
});

test('a tapped notification opens the inbox once a signed-in, onboarded screen can show it', async () => {
  const h = harness();
  h.overrides.me = () => ({ ...account(), requiresOnboarding: false });
  await h.session.setSessionTokens(tokenPair());
  h.push.open(); await settle();
  assert.equal(h.find('push.opened').length, 0, 'The app launched from a notification waits for its document');
  h.bridge.handle({ type: 'ready', data: { demo: false } }); await settle();
  assert.equal(h.find('push.opened').length, 1);
  assert.ok(h.posts.findIndex(post => post.type === 'session') < h.posts.findIndex(post => post.type === 'push.opened'));
  h.push.open(); await settle();
  assert.equal(h.find('push.opened').length, 2);

  h.bridge.handle({ type: 'auth.logout', data: {} }); await settle();
  h.push.open(); await settle();
  assert.equal(h.find('push.opened').length, 2, 'Signed out: nothing opens');
  h.overrides.verifyOtp = () => ({ ...account(), tokens: tokenPair(), isNew: true });
  h.bridge.handle(verifyMessage()); await settle();
  assert.equal(h.find('push.opened').length, 2, 'Onboarding is never interrupted');
  h.overrides.saveProfile = () => ({ ...account(), requiresOnboarding: false });
  h.bridge.handle({ type: 'profile.save', data: { name: 'Alice', onboarding: true } }); await settle();
  assert.equal(h.find('push.opened').length, 3);
  h.bridge.close();
});
