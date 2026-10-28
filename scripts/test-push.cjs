/* Exercises src/push.ts with mocked Firebase, notify-kit and OS edges. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..');
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };

function harness() {
  const shown = [], cancelled = [], declined = [], lockScreen = [], app = { state: 'background' };
  let stoppedService = 0;
  const notifee = {
    createChannel: async () => {}, deleteChannel: async () => {},
    displayNotification: async notification => { shown.push(notification); },
    cancelNotification: async id => { cancelled.push(id); },
    stopForegroundService: async () => { stoppedService++; },
    onForegroundEvent: () => () => {}, getInitialNotification: async () => null,
  };
  const mocks = {
    '@react-native-firebase/messaging': { getMessaging: () => ({}), onMessage: () => () => {}, onNotificationOpenedApp: () => () => {}, getInitialNotification: async () => null },
    'expo-notifications': {},
    'react-native': { Platform: { OS: 'android' }, AppState: { get currentState() { return app.state; }, addEventListener: () => ({ remove() {} }) } },
    'react-native-notify-kit': { __esModule: true, default: notifee, AndroidCategory: { CALL: 'call' }, AndroidImportance: { HIGH: 4, DEFAULT: 3, LOW: 2 }, AndroidVisibility: { PUBLIC: 1 }, EventType: { PRESS: 1, ACTION_PRESS: 2 },
      AndroidForegroundServiceType: { FOREGROUND_SERVICE_TYPE_PHONE_CALL: 4, FOREGROUND_SERVICE_TYPE_MICROPHONE: 128, FOREGROUND_SERVICE_TYPE_CAMERA: 64 } },
    '../modules/call-screen': { CallScreen: { showOverLockScreen: on => lockScreen.push(on) } },
    './api/endpoints': { api: { declineCall: async callId => { declined.push(callId); } } },
  };
  const filename = path.join(ROOT, 'src/push.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename }).outputText;
  const module = { exports: {} };
  vm.runInContext(`(function(require,module,exports){${compiled}\n})`, vm.createContext({ console, Date, Promise }), { filename })(id => {
    if (!(id in mocks)) throw new Error(`Unexpected import ${id}`);
    return mocks[id];
  }, module, module.exports);
  return { push: module.exports, shown, cancelled, declined, lockScreen, app, stopped: () => stoppedService };
}
const message = (data, sentTime) => ({ data, sentTime });
const ring = (callId, sentAt = Date.now()) => message({ type: 'incoming_call', callId, callerName: 'Asha', sentAt: String(sentAt) });

test('a fresh incoming call rings with Answer and Decline until its 30s are up', async () => {
  const h = harness();
  await h.push.handlePush(ring('c1', Date.now() - 10000));
  assert.equal(h.shown.length, 1);
  const { id, title, android } = h.shown[0];
  assert.equal(id, 'ring:c1'); assert.equal(title, 'Asha');
  assert.equal(android.channelId, 'incoming_calls'); assert.equal(android.loopSound, true);
  assert.ok(android.fullScreenAction, 'Rings full screen on a locked phone');
  assert.ok(android.timeoutAfter <= 20000 && android.timeoutAfter > 19000, 'Stops when the 30s ring would have ended');
  assert.equal(android.actions.map(action => action.pressAction.id).join(), 'decline,answer');
});

test('stale, undated and foreground rings are skipped', async () => {
  const h = harness();
  await h.push.handlePush(ring('old', Date.now() - 31000));
  await h.push.handlePush(message({ type: 'incoming_call', callId: 'undated' }));
  await h.push.handlePush(ring('open'), true);
  assert.equal(h.shown.length, 0);
  await h.push.handlePush(message({ type: 'incoming_call', callId: 'fcm-dated' }, Date.now()));
  assert.equal(h.shown.length, 1, "FCM's own send time stands in for a missing sentAt");
});

test('call_cancelled stops the ring and only a missed call leaves a notice', async () => {
  const h = harness();
  await h.push.handlePush(message({ type: 'call_cancelled', callId: 'c1', reason: 'declined' }));
  await h.push.handlePush(message({ type: 'call_cancelled', callId: 'c2', reason: 'missed', callerName: 'Asha' }));
  assert.deepEqual(h.cancelled, ['ring:c1', 'ring:c2']);
  assert.equal(h.shown.length, 1);
  assert.equal(h.shown[0].title, 'Missed call'); assert.equal(h.shown[0].android.channelId, 'general');
});

test('monetization events show on the general channel, only in the background', async () => {
  const h = harness();
  await h.push.handlePush(message({ type: 'gift_received', title: 'Rose from Asha', body: '+50 coins' }));
  await h.push.handlePush(message({ type: 'gift_received', title: 'Rose from Asha' }), true);
  await h.push.handlePush(message({ type: 'gift_received' }));
  assert.equal(h.shown.length, 1);
  assert.equal(h.shown[0].android.channelId, 'general');
});

test('Decline ends the call on the server; Answer reaches the app once, even if delivered twice', async () => {
  const h = harness();
  const answers = [];
  const press = (id, action) => ({ type: 2, detail: { notification: { id: `ring:${id}`, data: { type: 'incoming_call', callId: id } }, pressAction: { id: action } } });
  await h.push.handlePushEvent(press('c1', 'decline'));
  assert.deepEqual(h.declined, ['c1']); assert.ok(h.cancelled.includes('ring:c1'));
  await h.push.handlePushEvent(press('c2', 'answer'));
  h.push.startPush(() => {}, callId => answers.push(callId));
  await h.push.handlePushEvent(press('c2', 'answer'));
  assert.deepEqual(answers, ['c2'], 'An answer before the app started is delivered when it starts, and only once');
  assert.equal(h.lockScreen.at(-1), true, 'The answered call may show over the lock screen');
});

test('a connected call runs the call service until that call ends', async () => {
  const h = harness();
  h.app.state = 'active';
  h.push.trackCall({ type: 'call.connected', data: { callId: 'c1', voice: false } });
  const service = h.shown.at(-1);
  assert.equal(service.android.asForegroundService, true);
  assert.equal(service.android.foregroundServiceTypes.join(), '4,128,64');
  h.push.trackCall({ type: 'call.ended', data: { callId: 'queued' } });
  assert.equal(h.stopped(), 0, 'A queued caller hanging up keeps the call going');
  h.push.trackCall({ type: 'call.ended', data: { callId: 'c1' } });
  assert.equal(h.stopped(), 1); assert.equal(h.lockScreen.at(-1), false);

  h.app.state = 'background';
  h.push.trackCall({ type: 'call.incoming', data: { callId: 'c2' } });
  assert.ok(!h.cancelled.includes('ring:c2'), 'A ring in the background keeps ringing');
  h.push.trackCall({ type: 'call.connected', data: { callId: 'c2', voice: true } });
  assert.equal(h.shown.length, 1, 'No camera or microphone service from the background');
  assert.ok(h.cancelled.includes('ring:c2'));
});
