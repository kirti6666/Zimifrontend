/* Actual generated production UI and real Chromium fake camera/microphone.
   Native messages stay local; no account, backend or physical camera is used. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const hostId = '507f1f77bcf86cd799439017', memberId = '507f1f77bcf86cd799439011';
const host = { user: { id: hostId, name: 'Incoming Host', role: 'host', serverRole: 'host', hostStatus: 'approved', isVerifiedHost: true, isPhoneVerified: true }, verification: 'verified', requiresOnboarding: false };
const member = { user: { id: memberId, name: 'Incoming Member', role: 'sender', serverRole: 'user', hostStatus: 'none', isPhoneVerified: true }, verification: 'none', requiresOnboarding: false };
const receive = (page, type, data) => page.evaluate(message => Native.receive(message), { type, data });
const action = (page, callId, actionId, intent = 'answer') => receive(page, 'call.nativeAction', { callId, actionId, action: intent });
const sent = (page, type) => page.evaluate(type => __sent.filter(message => message.type === type).map(message => message.data), type);
const state = page => page.evaluate(() => ({ view: S.v, accepting: !!S.acceptingCall, captures: __captureRequests.length, live: __tracks.filter(track => track.readyState === 'live').length }));
const ring = (callId, options = {}) => ({ callId, from: options.fromHost ? { id: hostId, name: 'Incoming Host', role: 'host', verified: true } : { id: memberId, name: 'Incoming Member' }, voice: false, fromHost: false, rate: 0, ...options });

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  async function open(account) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => {
      window.__sent = []; window.__captureRequests = []; window.__tracks = []; window.__captureMode = 'allow';
      window.ReactNativeWebView = { postMessage: raw => {
        const message = JSON.parse(raw); __sent.push(message);
        if (message.type === 'rtc.config') queueMicrotask(() => Native.receive({ type: 'rtc.config', data: { iceServers: [] } }));
      } };
      const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async constraints => {
        __captureRequests.push(constraints);
        if (__captureMode === 'pending') await new Promise(resolve => { window.__releaseCapture = resolve; });
        if (__captureMode === 'deny') throw new DOMException('Microphone or camera permission was denied.', 'NotAllowedError');
        const stream = await capture(constraints); __tracks.push(...stream.getTracks()); return stream;
      };
    });
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href);
    await receive(page, 'session', account);
    await receive(page, 'data.home', { hosts: [], stage: [], total: 0, page: 1, categories: [], unreadCount: 0 });
    await receive(page, 'wallet.balance', { coins: 1000, earningsPaise: 0 });
    // Keep the production media controller intact. Effects have their own
    // integration tests; no selected effect means no external license request.
    await page.evaluate(() => ZimiBeauty.reset());
    assert.equal((await state(page)).captures, 0, 'Opening the app never acquires media');
    return page;
  }
  async function handedOff(page, callId, actionId, intent) {
    await page.waitForFunction(({ callId, actionId }) => __sent.some(message => message.type === 'call.nativeResult' && message.data.callId === callId && message.data.actionId === actionId), { callId, actionId });
    const result = (await sent(page, 'call.nativeResult')).find(message => message.callId === callId && message.actionId === actionId);
    assert.deepEqual(result, { callId, actionId, action: intent, outcome: 'handedOff' });
  }
  async function awaitAccept(page, callId) {
    await page.waitForFunction(callId => __sent.some(message => message.type === 'call.accept' && message.data.callId === callId), callId);
    assert.deepEqual(await sent(page, 'call.accept'), [{ callId }], 'One explicit native answer sends exactly one accept');
  }
  try {
    const h = await open(host), hostCall = 'native-host-video';
    await receive(h, 'call.incoming', ring(hostCall));
    assert.equal((await state(h)).view, 'ring');
    await action(h, hostCall, 'host-open', 'open');
    await handedOff(h, hostCall, 'host-open', 'open');
    assert.equal((await state(h)).captures, 0, 'Open hands off to the ring screen without capture');
    assert.deepEqual(await sent(h, 'call.accept'), []);
    await action(h, 'different-call', 'wrong-host-answer');
    await handedOff(h, 'different-call', 'wrong-host-answer', 'answer');
    assert.equal((await state(h)).captures, 0, 'An answer for another call cannot acquire media');
    await h.evaluate(() => { __captureMode = 'pending'; });
    await action(h, hostCall, 'host-answer');
    await h.waitForFunction(() => __captureRequests.length === 1 && S.acceptingCall);
    await action(h, hostCall, 'host-answer');
    assert.equal((await state(h)).captures, 1, 'Duplicate native answers coalesce while permission/capture is pending');
    assert.deepEqual(await sent(h, 'call.accept'), [], 'Acceptance waits for real media preparation');
    await h.evaluate(() => { __captureMode = 'allow'; __releaseCapture(); });
    await awaitAccept(h, hostCall);
    assert.equal((await state(h)).live, 2, 'A video answer prepares microphone and camera');
    await receive(h, 'call.connected', { callId: hostCall, peerId: memberId, initiator: false, voice: false, rate: 0 });
    assert.equal((await state(h)).view, 'hcall');
    await receive(h, 'call.ended', { callId: hostCall });
    assert.equal((await state(h)).live, 0);
    await action(h, hostCall, 'ended-host-answer');
    await handedOff(h, hostCall, 'ended-host-answer', 'answer');
    assert.equal((await state(h)).captures, 1, 'An ended call cannot capture again');
    assert.deepEqual(await sent(h, 'call.accept'), [{ callId: hostCall }]);
    await h.close();

    const paid = await open(member), paidCall = 'native-paid-member';
    await receive(paid, 'call.incoming', ring(paidCall, { fromHost: true, voice: true, rate: 60 }));
    await action(paid, paidCall, 'paid-answer');
    await handedOff(paid, paidCall, 'paid-answer', 'answer');
    assert.equal((await state(paid)).view, 'incoming');
    assert.match(await paid.locator('.ringscr').innerText(), /60 coins\/min/);
    assert.equal((await state(paid)).captures, 0, 'A paid call requires review before media preparation');
    assert.deepEqual(await sent(paid, 'call.accept'), [], 'Native answer never bypasses the paid-call confirmation');
    await paid.close();

    const free = await open(member), freeCall = 'native-free-member';
    await receive(free, 'call.incoming', ring(freeCall, { fromHost: true, voice: true, rate: 0 }));
    await action(free, freeCall, 'free-open', 'open');
    await handedOff(free, freeCall, 'free-open', 'open');
    assert.equal((await state(free)).captures, 0);
    await action(free, freeCall, 'free-answer');
    await awaitAccept(free, freeCall);
    const freeCapture = await free.evaluate(() => ({ video: __captureRequests[0].video, tracks: __tracks.map(track => track.kind) }));
    assert.deepEqual(freeCapture, { video: false, tracks: ['audio'] }, 'A free voice answer prepares microphone only');
    await action(free, freeCall, 'free-answer');
    assert.deepEqual(await sent(free, 'call.accept'), [{ callId: freeCall }]);
    await receive(free, 'call.ended', { callId: freeCall });
    assert.equal((await state(free)).live, 0);
    await free.close();

    const denied = await open(host), deniedCall = 'native-denied-host';
    await receive(denied, 'call.incoming', ring(deniedCall));
    await denied.evaluate(() => { __captureMode = 'deny'; });
    await action(denied, deniedCall, 'denied-answer');
    await handedOff(denied, deniedCall, 'denied-answer', 'answer');
    assert.deepEqual(await sent(denied, 'call.accept'), [], 'Permission refusal cannot accept the call');
    assert.equal((await state(denied)).accepting, false);
    assert.equal((await state(denied)).live, 0);
    assert.match(await denied.locator('#app-notice').innerText(), /microphone|camera|permission/i);
    assert.equal(await denied.getByRole('button', { name: 'Accept', exact: true }).isEnabled(), true, 'Permission failure leaves the ring retryable');
    await denied.evaluate(() => { __captureMode = 'allow'; });
    await action(denied, deniedCall, 'retry-answer');
    await awaitAccept(denied, deniedCall);
    assert.equal((await state(denied)).captures, 2, 'A later explicit retry can acquire media');
    await receive(denied, 'call.ended', { callId: deniedCall });
    await denied.close();

    const cancelled = await open(host), cancelledCall = 'native-ended-during-permission';
    await receive(cancelled, 'call.incoming', ring(cancelledCall));
    await cancelled.evaluate(() => { __captureMode = 'pending'; });
    await action(cancelled, cancelledCall, 'pending-answer');
    await cancelled.waitForFunction(() => __captureRequests.length === 1);
    await receive(cancelled, 'call.ended', { callId: cancelledCall });
    await cancelled.evaluate(() => { __captureMode = 'allow'; __releaseCapture(); });
    await handedOff(cancelled, cancelledCall, 'pending-answer', 'answer');
    assert.equal((await state(cancelled)).live, 0, 'Late capture after peer cancellation releases every acquired track');
    assert.deepEqual(await sent(cancelled, 'call.accept'), [], 'Peer cancellation during permission cannot be answered afterward');
    await cancelled.close();
    assert.deepEqual(errors, [], 'No production browser exceptions');
    console.log('PASS native incoming web handoff: open without capture, explicit host/free answer, duplicate coalescing, paid-call review, stale IDs, denied-media retry and cancellation cleanup.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
