/* Notification OS edges are mocked: no device registration or real delivery. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const self = '507f1f77bcf86cd799439011', peer = '507f1f77bcf86cd799439012';
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); };
function harness(os = 'android') {
  const calls = [], state = { permission: { granted: true, canAskAgain: true }, token: 'fcm:local-fixture', nativeSoundErrors: [], channelSounds: new Map() };
  const notifications = {
    AndroidImportance: { DEFAULT: 5, HIGH: 6, MAX: 7 }, AndroidNotificationVisibility: { PRIVATE: 2 }, AndroidNotificationPriority: { HIGH: 'high', MAX: 'max' }, DEFAULT_ACTION_IDENTIFIER: 'default',
    setNotificationChannelAsync: async (id, options) => {
      calls.push(['channel', id, options]);
      // Expo 57 AndroidXNotificationsChannelManager.customSoundExists treats
      // every provided string as a raw resource filename, even "default".
      // This app bundles no custom sounds. Missing sound keeps the system
      // default; explicit null is accepted but deliberately makes it silent.
      if (Object.hasOwn(options, 'sound') && options.sound !== null) state.nativeSoundErrors.push(`Custom sound '${options.sound}' not found in native app`);
      const sound = Object.hasOwn(options, 'sound') && options.sound === null ? null : 'default';
      state.channelSounds.set(id, sound);return { ...options, id, sound };
    },
    setNotificationHandler: handler => { state.handler = handler; },
    addNotificationResponseReceivedListener: listener => { state.open = listener; return { remove: () => { state.removed = true; } }; },
    getLastNotificationResponseAsync: async () => state.last || null,
    clearLastNotificationResponseAsync: async () => { calls.push(['clear']); },
    dismissAllNotificationsAsync: async () => { calls.push(['dismiss']); },
    getPermissionsAsync: async () => { calls.push(['permission']); return state.permission; },
    requestPermissionsAsync: async () => { calls.push(['prompt']); return state.prompt || state.permission; },
    getDevicePushTokenAsync: async () => { calls.push(['token']); return { data: state.token }; },
    addPushTokenListener: listener => { state.rotate = listener; return { remove: () => { state.rotate = null; } }; },
  };
  const cache = new Map(), context = vm.createContext({ console, Date });
  const load = file => {
    const filename = path.resolve(root, file); if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const requireMock = id => id === 'expo-notifications' ? notifications : id === 'react-native' ? { Platform: { OS: os }, AppState: { currentState: 'active' }, Linking: { openSettings: async () => { calls.push(['settings']); } } } : load(path.relative(root, path.resolve(path.dirname(filename), id + '.ts')));
    vm.runInContext(`(function(require,module,exports){${compiled}\n})`, context)(requireMock, module, module.exports); return module.exports;
  };
  return { push: load('src/push.ts'), target: load('src/notification-target.ts'), preferences: load('src/notification-preferences.ts'), state, calls };
}
const response = (identifier, data, actionIdentifier = 'default') => ({ actionIdentifier, notification: { request: { identifier, content: { data } } } });
test('Expo 57 Android channels retain the system sound without requesting a missing custom resource', async () => {
  const h = harness(), stop = h.push.startPush(() => {});
  await settle();
  assert.equal(await h.push.registerPush(async () => {}, 'silent'), 'registered');
  assert.deepEqual(h.state.nativeSoundErrors, [], 'Channel initialization must not emit the native custom-sound error');
  assert.equal(h.state.channelSounds.size, 7);
  for (const [id, sound] of h.state.channelSounds) assert.equal(sound, 'default', `${id} retains the system sound instead of being silenced`);
  assert.equal(h.calls.filter(call => call[0] === 'channel').length, 7, 'Starting listeners and registering share one initialization');
  stop();
});
test('Android creates category channels before asking permission and registers only granted FCM tokens', async () => {
  const h = harness(), saved = [];
  assert.equal(await h.push.registerPush(async token => saved.push(token), 'prompt'), 'registered');
  assert.deepEqual(h.calls.filter(call => call[0] === 'channel').map(call => call[1]), ['default', 'calls', 'messages', 'activity', 'updates', 'live-alerts', 'earnings-alerts']);
  assert.ok(h.calls.findIndex(call => call[0] === 'permission') > h.calls.findLastIndex(call => call[0] === 'channel'));
  assert.deepEqual(saved, ['fcm:local-fixture']);
  h.state.permission = { granted: false, canAskAgain: true };
  assert.equal(await h.push.registerPush(async () => assert.fail(), 'silent'), 'denied');
  assert.equal(h.calls.some(call => call[0] === 'prompt'), false);
  h.state.permission.canAskAgain = false;
  assert.equal(await h.push.registerPush(async () => assert.fail(), 'settings'), 'denied');
  assert.equal(h.calls.at(-1)[0], 'settings');
  h.state.permission.granted = true; h.state.token = 123;
  assert.equal(await h.push.registerPush(async () => assert.fail(), 'silent'), 'unavailable');
  const ios = harness('ios'); assert.equal(await ios.push.registerPush(async () => assert.fail(), 'prompt'), 'unavailable'); assert.deepEqual(ios.calls, []);
});
test('taps preserve validated navigation, deduplicate launch/listener responses and clean up', async () => {
  const h = harness(), opens = [], stop = h.push.startPush(target => opens.push(target));
  const data = { targetType: 'thread', targetId: peer, recipientId: self, category: 'messages' };
  h.state.open(response('a', data)); h.state.open(response('b', data)); h.state.open(response('a', data));
  h.state.open(response('c', { ...data, recipientId: 'bad' })); h.state.open(response('d', data, 'custom'));
  await settle(); assert.equal(opens.length, 2); assert.equal(opens[0].targetId, peer);
  assert.equal(h.target.notificationTargetFrom({ targetType: 'thread', targetId: 'https://evil.test' }).targetType, 'inbox');
  assert.equal(h.target.notificationTargetFrom({ targetType: 'call', targetId: peer, expiresAt: 'bad' }).targetType, 'inbox');
  stop(); assert.equal(h.state.removed, true);
  const rotations = [], unsubscribe = h.push.onPushTokenChange(token => rotations.push(token));
  h.state.rotate({ data: 'rotated' }); h.state.rotate({ data: 42 }); unsubscribe(); assert.deepEqual(rotations, ['rotated']);
  h.push.clearDeliveredPush(); assert.equal(h.calls.at(-1)[0], 'dismiss');
});
test('foreground calls sound only for the current account and an unexpired authoritative-call hint', async () => {
  const h = harness(); h.push.startPush(() => {}, recipient => recipient === self);
  const behavior = data => h.state.handler.handleNotification({ request: { content: { data } } });
  const call = { targetType: 'call', targetId: peer, recipientId: self, category: 'calls', expiresAt: new Date(Date.now() + 30000).toISOString() };
  assert.equal((await behavior(call)).shouldPlaySound, true);
  for (const data of [{ ...call, expiresAt: new Date(0).toISOString() }, { ...call, recipientId: peer }, { ...call, targetId: 'bad' }, { ...call, expiresAt: 'bad' }]) assert.equal((await behavior(data)).shouldPlaySound, false);
  assert.equal((await behavior({ ...call, targetType: 'thread', category: 'messages' })).shouldPlaySound, true);
  assert.equal((await behavior(call)).shouldShowBanner, true);
  assert.equal((await behavior({ ...call, action: 'call-ended' })).shouldShowBanner, false);
  assert.equal((await behavior({ ...call, expiresAt: undefined })).shouldPlaySound, false);
  assert.equal((await behavior({ ...call, targetType: 'thread', category: 'messages' })).priority, 'high');
});
test('granular preferences normalize older servers and reject malformed/unknown quiet-hour authority', () => {
  const { preferences: p } = harness(); const defaults = p.notificationPreferencesFrom(undefined);
  assert.equal(defaults.calls, true); assert.equal(defaults.earningsAlerts, false); assert.equal(defaults.quietHours.enabled, false);
  assert.equal(p.validNotificationPreferencesPatch({ messages: false, quietHours: { enabled: true, startHour: 22, endHour: 8, timeZone: 'Asia/Kolkata' } }), true);
  for (const patch of [{ calls: 'false' }, { admin: true }, { quietHours: { startHour: 24 } }, { quietHours: { endHour: -1 } }, { quietHours: { timeZone: 'Invalid/Zone' } }, { quietHours: { minutes: 0 } }]) assert.equal(p.validNotificationPreferencesPatch(patch), false);
});
