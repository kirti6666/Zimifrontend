/* Isolated Android permission contracts. No real prompts, capture or token registration. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const CAMERA = 'android.permission.CAMERA', MIC = 'android.permission.RECORD_AUDIO';
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
const deferred = () => { let resolve;const promise = new Promise(done => { resolve = done; });return { promise, resolve }; };

function harness(os = 'android') {
  const calls = [], state = { appState: 'active', grants: new Set(), permission: { granted: false, canAskAgain: true }, notificationResult: { granted: true, canAskAgain: true }, prompts: 0, maxPrompts: 0 };
  const start = () => { state.prompts++;state.maxPrompts = Math.max(state.maxPrompts, state.prompts); };
  const rn = {
    Platform: { OS: os }, AppState: { get currentState() { return state.appState; } },
    Linking: { openSettings: async () => { calls.push(['settings']); } },
    PermissionsAndroid: {
      PERMISSIONS: { CAMERA, RECORD_AUDIO: MIC }, RESULTS: { GRANTED: 'granted', DENIED: 'denied', NEVER_ASK_AGAIN: 'never_ask_again' },
      check: async permission => { calls.push(['check', permission]);if (state.checkError === permission) throw new Error('Native unavailable');return state.grants.has(permission); },
      requestMultiple: async permissions => {
        calls.push(['sensors', [...permissions]]);start();
        try {
          if (state.sensorError) throw new Error('Activity unavailable');
          const results = state.sensorResponse ? await state.sensorResponse(permissions) : Object.fromEntries(permissions.map(permission => [permission, 'granted']));
          for (const permission of permissions) if (results[permission] === 'granted') state.grants.add(permission);
          return results;
        } finally { state.prompts--; }
      },
    },
  };
  const notifications = {
    AndroidImportance: { DEFAULT: 5, HIGH: 6, MAX: 7 }, AndroidNotificationVisibility: { PRIVATE: 2 },
    setNotificationChannelAsync: async id => { calls.push(['channel', id]); },
    getPermissionsAsync: async () => { calls.push(['notification.read']);if (state.notificationRead) await state.notificationRead();if (state.notificationError) throw new Error('Notifications unavailable');return state.permission; },
    requestPermissionsAsync: async () => {
      calls.push(['notification.prompt']);start();
      try { if (state.notificationPrompt) await state.notificationPrompt();state.permission = state.notificationResult;return state.permission; }
      finally { state.prompts--; }
    },
    getDevicePushTokenAsync: async () => { calls.push(['token']);if (state.tokenRead) await state.tokenRead();return { data: 'fcm:fixture' }; },
  };
  const cache = new Map(), context = vm.createContext({ console, Date });
  const load = file => {
    const filename = path.resolve(root, file);if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };cache.set(filename, module);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const requireMock = id => id === 'react-native' ? rn : id === 'expo-notifications' ? notifications : load(path.relative(root, path.resolve(path.dirname(filename), id + '.ts')));
    vm.runInContext(`(function(require,module,exports){${compiled}\n})`, context)(requireMock, module, module.exports);return module.exports;
  };
  return { service: load('src/device-permissions.ts'), push: load('src/push.ts'), state, calls };
}
const plain = value => JSON.parse(JSON.stringify(value));

test('permission reads never prompt, register FCM or capture media; unsupported platforms stay honest', async () => {
  const h = harness();h.state.grants.add(CAMERA);
  assert.deepEqual(plain(await h.service.readDevicePermissions()), { camera: 'granted', microphone: 'denied', notifications: 'denied' });
  assert.deepEqual(h.calls.filter(call => !['check', 'notification.read'].includes(call[0])), []);
  h.state.permission = { granted: false, canAskAgain: false };
  assert.equal((await h.service.readDevicePermissions()).notifications, 'blocked');
  const ios = harness('ios');
  assert.deepEqual(plain(await ios.service.requestDevicePermissions()), { camera: 'unavailable', microphone: 'unavailable', notifications: 'unavailable' });
  assert.deepEqual(plain(await ios.service.readDevicePermissions()), { camera: 'unavailable', microphone: 'unavailable', notifications: 'unavailable' });
  assert.deepEqual(ios.calls, []);
});

test('an explicit setup requests only missing camera/microphone then notifications, and duplicate taps coalesce', async () => {
  const h = harness(), gate = deferred();h.state.grants.add(CAMERA);h.state.sensorResponse = () => gate.promise;
  const first = h.service.requestDevicePermissions(), duplicate = h.service.requestDevicePermissions();
  assert.equal(first, duplicate);await settle();assert.deepEqual(h.calls.find(call => call[0] === 'sensors')[1], [MIC]);
  assert.equal(h.calls.some(call => call[0] === 'notification.prompt'), false, 'The notification dialog waits for microphone permission');
  gate.resolve({ [MIC]: 'granted' });
  assert.deepEqual(plain(await first), { camera: 'granted', microphone: 'granted', notifications: 'granted' });
  assert.equal(h.state.maxPrompts, 1);assert.equal(h.calls.some(call => call[0] === 'token'), false, 'A permission grant is not FCM registration');
  assert.deepEqual(h.calls.filter(call => call[0] === 'sensors').flatMap(call => call[1]), [MIC], 'No contacts, location or storage permission is requested');
  await h.service.requestDevicePermissions();assert.equal(h.calls.filter(call => call[0] === 'sensors').length, 1);assert.equal(h.calls.filter(call => call[0] === 'notification.prompt').length, 1, 'Already granted permissions do not prompt again');
});

test('denied and never-ask-again stay distinct, and only an explicit Settings action opens the phone settings', async () => {
  const h = harness();h.state.sensorResponse = async () => ({ [CAMERA]: 'denied', [MIC]: 'never_ask_again' });h.state.notificationResult = { granted: false, canAskAgain: false };
  assert.deepEqual(plain(await h.service.requestDevicePermissions()), { camera: 'denied', microphone: 'blocked', notifications: 'blocked' });
  assert.equal((await h.service.readDevicePermissions()).microphone, 'blocked');assert.equal(h.calls.some(call => call[0] === 'settings'), false);
  h.state.sensorResponse = async permissions => Object.fromEntries(permissions.map(permission => [permission, 'denied']));
  await h.service.requestDevicePermissions();assert.deepEqual(h.calls.filter(call => call[0] === 'sensors').at(-1)[1], [CAMERA], 'A known blocked microphone is not requested repeatedly');
  await h.service.openDevicePermissionSettings();assert.equal(h.calls.filter(call => call[0] === 'settings').length, 1);
  h.state.grants.add(CAMERA);h.state.grants.add(MIC);h.state.permission = { granted: true, canAskAgain: true };
  assert.deepEqual(plain(await h.service.readDevicePermissions()), { camera: 'granted', microphone: 'granted', notifications: 'granted' });
  h.state.grants.delete(MIC);assert.equal((await h.service.readDevicePermissions()).microphone, 'denied', 'Revocation cannot retain a stale granted or blocked status');
});

test('the shared OS prompt queue serializes setup and existing push registration', async () => {
  const h = harness(), gate = deferred();h.state.sensorResponse = () => gate.promise;
  const setup = h.service.requestDevicePermissions();await settle();
  const saved = [], registration = h.push.registerPush(async token => saved.push(token), 'prompt');
  await settle();assert.equal(h.calls.some(call => call[0] === 'notification.prompt'), false);
  gate.resolve({ [CAMERA]: 'granted', [MIC]: 'granted' });
  assert.equal((await setup).notifications, 'granted');assert.equal(await registration, 'registered');
  assert.equal(h.calls.filter(call => call[0] === 'notification.prompt').length, 1);assert.equal(h.state.maxPrompts, 1);assert.deepEqual(saved, ['fcm:fixture']);
});

test('background setup and a registration retired during a sensor dialog cannot start another prompt', async () => {
  const inactive = harness();inactive.state.appState = 'background';await inactive.service.requestDevicePermissions();
  assert.equal(inactive.calls.some(call => ['sensors', 'notification.prompt', 'settings'].includes(call[0])), false);
  const h = harness(), gate = deferred();let current = true;h.state.sensorResponse = () => gate.promise;
  const setup = h.service.requestDevicePermissions(() => current);await settle();current = false;gate.resolve({ [CAMERA]: 'granted', [MIC]: 'denied' });
  assert.deepEqual(plain(await setup), { camera: 'granted', microphone: 'denied', notifications: 'denied' });
  assert.equal(h.calls.some(call => call[0] === 'notification.prompt'), false, 'Logout/reload cannot launch the next permission stage');
});

test('a retired registration cannot prompt after a queued notification permission read', async () => {
  const h = harness(), gate = deferred();let current = true;h.state.grants.add(CAMERA);h.state.grants.add(MIC);h.state.notificationRead = () => gate.promise;
  const setup = h.service.requestDevicePermissions(() => current);await settle();assert.ok(h.calls.some(call => call[0] === 'notification.read'));
  current = false;gate.resolve();await setup;assert.equal(h.calls.some(call => call[0] === 'notification.prompt'), false);
});

test('a replacement registration waits for an old dialog and starts its own current setup', async () => {
  const h = harness(), gate = deferred();let oldCurrent = true, sensorRuns = 0;
  h.state.sensorResponse = permissions => ++sensorRuns === 1 ? gate.promise : Promise.resolve(Object.fromEntries(permissions.map(permission => [permission, 'granted'])));
  const old = h.service.requestDevicePermissions(() => oldCurrent);await settle();oldCurrent = false;
  const replacement = h.service.requestDevicePermissions(() => true);assert.notEqual(old, replacement);
  gate.resolve({ [CAMERA]: 'granted', [MIC]: 'denied' });assert.equal((await old).microphone, 'denied');
  assert.deepEqual(plain(await replacement), { camera: 'granted', microphone: 'granted', notifications: 'granted' });
  assert.equal(sensorRuns, 2);assert.equal(h.calls.filter(call => call[0] === 'notification.prompt').length, 1);assert.equal(h.state.maxPrompts, 1);
});

test('OS failures report unavailable instead of claiming permission, without blocking other optional grants', async () => {
  const h = harness();h.state.checkError = CAMERA;h.state.sensorError = true;h.state.notificationError = true;
  assert.deepEqual(plain(await h.service.requestDevicePermissions()), { camera: 'unavailable', microphone: 'unavailable', notifications: 'unavailable' });
});

test('a Settings action retired while another OS dialog is open never launches Settings later', async () => {
  const h = harness(), gate = deferred();let settingsCurrent = true;h.state.sensorResponse = () => gate.promise;
  const setup = h.service.requestDevicePermissions();await settle();
  const settings = h.service.openDevicePermissionSettings(() => settingsCurrent);await settle();
  assert.equal(h.calls.some(call => call[0] === 'settings'), false);settingsCurrent = false;
  gate.resolve({ [CAMERA]: 'granted', [MIC]: 'granted' });await Promise.all([setup, settings]);
  assert.equal(h.calls.some(call => call[0] === 'settings'), false, 'Logout/reload/cancel retires a queued Settings action');
});

test('a queued or token-pending push enable cannot prompt, request credentials or save after retirement', async () => {
  const h = harness(), gate = deferred();let current = true;h.state.sensorResponse = () => gate.promise;
  const setup = h.service.requestDevicePermissions();await settle();
  const saved = [], registration = h.push.registerPush(async token => saved.push(token), 'prompt', () => current);
  current = false;gate.resolve({ [CAMERA]: 'granted', [MIC]: 'granted' });
  assert.equal(await registration, 'denied');await setup;
  assert.equal(h.calls.some(call => call[0] === 'token'), false);assert.deepEqual(saved, []);
  assert.equal(h.calls.filter(call => call[0] === 'notification.prompt').length, 1, 'Only the still-current setup may ask for notifications');
  const pending = harness(), tokenGate = deferred();let tokenCurrent = true;pending.state.permission = { granted: true, canAskAgain: true };pending.state.tokenRead = () => tokenGate.promise;
  const saving = pending.push.registerPush(async token => saved.push(token), 'silent', () => tokenCurrent);await settle();
  assert.equal(pending.calls.some(call => call[0] === 'token'), true);tokenCurrent = false;tokenGate.resolve();
  assert.equal(await saving, 'unavailable');assert.deepEqual(saved, [], 'A token finishing after logout never reaches the backend save callback');
  const granted = harness();granted.state.permission = { granted: true, canAskAgain: true };
  assert.equal(await granted.push.registerPush(async () => assert.fail(), 'silent', () => false), 'unavailable');
  assert.equal(granted.calls.some(call => call[0] === 'token'), false, 'A granted phone permission does not authorize a retired session to request a token');
});
