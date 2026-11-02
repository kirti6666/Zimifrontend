/* Production call UI with real fake-device capture/WebRTC and a deterministic
   processed video track. No native server or external camera is contacted. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const hostId = '507f1f77bcf86cd799439011';
const creator = { id: hostId, name: 'Hangup host', online: true, availableForCall: true, verified: true, ratePerMin: 0, entryFee: 0 };
const account = { user: { id: '507f1f77bcf86cd799439012', name: 'Hangup member', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false }, verification: 'none', requiresOnboarding: false };
const receive = (page, type, data) => page.evaluate(message => Native.receive(message), { type, data });

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  async function open() {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => {
      window.__sent = []; window.__rawTracks = []; window.__peers = [];
      window.ReactNativeWebView = { postMessage: raw => {
        const message = JSON.parse(raw); __sent.push(message);
        if (message.type === 'rtc.config') queueMicrotask(() => Native.receive({ type: 'rtc.config', data: { iceServers: [] } }));
      } };
      const acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async constraints => { const stream = await acquire(constraints); __rawTracks.push(...stream.getTracks()); return stream; };
      const RealPeer = RTCPeerConnection;
      window.RTCPeerConnection = class extends RealPeer { constructor(...args) { super(...args); __peers.push(this); } };
    });
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href);
    await receive(page, 'session', account);
    await receive(page, 'data.home', { hosts: [creator], stage: [], featured: creator, total: 1, page: 1, categories: ['Music'] });
    await receive(page, 'wallet.balance', { coins: 500 });
    await page.evaluate(() => {
      // The actual SDK processor has its own tests; this output makes a leaked
      // processed capture track observable independently of the raw camera.
      window.__beautyHandles = [];
      ZimiBeauty.create = async source => {
        const existing = __beautyHandles.find(handle => handle.source === source && !handle.destroyed);
        if (existing) return existing;
        const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 120;
        const context = canvas.getContext('2d'); context.fillStyle = '#dd2277'; context.fillRect(0, 0, 160, 120);
        const processed = canvas.captureStream(24), output = processed.getVideoTracks()[0];
        const handle = { source, output, destroyed: false, stream: new MediaStream([...source.getAudioTracks(), output]),
          setEnabled(enabled) { output.enabled = enabled; },
          destroy() { this.destroyed = true; processed.getTracks().forEach(track => track.stop()); } };
        __beautyHandles.push(handle); return handle;
      };
      ZimiBeauty.stop = () => __beautyHandles.forEach(handle => handle.destroy());
    });
    return page;
  }
  async function start(page, callId, minimized = false) {
    await page.evaluate(async ({ hostId, callId }) => {
      await ZimiMedia.prepare(true);
      S.callId = callId; S.mic = 1; S.cam = 1; S.scam = 1;
      go('call', hostId);
      Native.receive({ type: 'call.connected', data: { callId, peerId: hostId, initiator: true, voice: false, rate: 0 } });
    }, { hostId, callId });
    await page.waitForFunction(() => __peers.length > 0 && __beautyHandles.some(handle => !handle.destroyed) && document.querySelector('video[data-zimi-local]')?.srcObject?.getVideoTracks().some(track => track.readyState === 'live'));
    if (minimized) await page.getByRole('button', { name: 'Minimize call', exact: true }).click();
  }
  async function cleaned(page, label) {
    assert.deepEqual(await page.evaluate(() => ({ view: S.v, minimized: !!S.bgCall, banner: !!document.getElementById('zimi-ongoing'), timer: !!S.t, rawStopped: __rawTracks.length >= 2 && __rawTracks.every(track => track.readyState === 'ended'), processedStopped: __beautyHandles.length > 0 && __beautyHandles.every(handle => handle.destroyed && handle.output.readyState === 'ended'), peersClosed: __peers.every(peer => peer.signalingState === 'closed'), mediaCleared: [...document.querySelectorAll('video[data-zimi-local],video[data-zimi-remote],audio[data-zimi-remote]')].every(media => media.srcObject === null) })), { view: 'summary', minimized: false, banner: false, timer: false, rawStopped: true, processedStopped: true, peersClosed: true, mediaCleared: true }, label);
  }
  async function failPeer(page) {
    await page.evaluate(() => {
      const peer = __peers.at(-1);
      Object.defineProperty(peer, 'connectionState', { configurable: true, get: () => 'failed' });
      Object.defineProperty(peer, 'iceConnectionState', { configurable: true, get: () => 'failed' });
      peer.onconnectionstatechange();
      // Advance only the elapsed recovery budget, retaining the real scheduled
      // callback and its session/peer identity checks.
      const realNow = Date.now.bind(Date); Date.now = () => realNow() + 40000;
    });
  }
  try {
    for (const minimized of [false, true]) {
      const page = await open(), callId = 'remote-hangup-' + minimized;
      await start(page, callId, minimized);
      await receive(page, 'call.ended', { callId });
      await cleaned(page, `Remote hangup cleans the ${minimized ? 'minimized' : 'foreground'} call and both camera tracks`);
      await receive(page, 'call.ended', { callId });
      assert.deepEqual(await page.evaluate(() => __sent.filter(message => message.type === 'call.end')), [], 'Remote/duplicate end notifications never send another hangup request');
      await page.close();
    }
    for (const minimized of [false, true]) {
      const page = await open(), callId = 'lost-hangup-' + minimized;
      await start(page, callId, minimized);
      await failPeer(page);
      await page.waitForFunction(() => __sent.some(message => message.type === 'call.end'), null, { timeout: 6000 });
      await cleaned(page, `Exhausted recovery without a server event closes the ${minimized ? 'minimized' : 'foreground'} UI`);
      assert.deepEqual(await page.evaluate(() => __sent.filter(message => message.type === 'call.end').map(message => message.data)), [{ callId, reason: 'media_failed' }], 'Local terminal handling sends exactly one server hangup');
      await receive(page, 'call.ended', { callId });
      assert.equal(await page.evaluate(() => __sent.filter(message => message.type === 'call.end').length), 1, 'A later authoritative event cannot send a duplicate hangup');
      await page.close();
    }
    const page = await open();
    await start(page, 'old-session');
    await page.evaluate(() => {
      const peer = __peers.at(-1); window.__oldFailure = peer.onconnectionstatechange;
      Object.defineProperty(peer, 'connectionState', { configurable: true, get: () => 'failed' });
      Object.defineProperty(peer, 'iceConnectionState', { configurable: true, get: () => 'failed' });
      const schedule = window.setTimeout;
      window.setTimeout = (fn, delay, ...args) => { if (delay === 3000) window.__oldRecovery = fn; return schedule(fn, delay, ...args); };
      peer.onconnectionstatechange(); window.setTimeout = schedule;
    });
    await receive(page, 'call.ended', { callId: 'old-session' });
    await start(page, 'new-session');
    await page.evaluate(() => { __oldFailure(); __oldRecovery(); });
    await receive(page, 'call.ended', { callId: 'old-session' });
    assert.deepEqual(await page.evaluate(() => ({ view: S.v, callId: S.callId, timer: !!S.t, rawLive: __rawTracks.filter(track => track.readyState === 'live').length, processedLive: __beautyHandles.filter(handle => !handle.destroyed && handle.output.readyState === 'live').length, ends: __sent.filter(message => message.type === 'call.end').length })), { view: 'call', callId: 'new-session', timer: true, rawLive: 2, processedLive: 1, ends: 0 }, 'Late failure/recovery callbacks and an old end event cannot terminate a newer call');
    await receive(page, 'call.ended', { callId: 'new-session' }); await cleaned(page, 'The newer call still cleans up on its own matching end');
    await page.close();
    assert.deepEqual(errors, [], 'No browser exceptions');
    console.log('PASS call hangup: remote and lost-event foreground/minimized endings, timer/banner/raw/processed cleanup, one server request, and stale-session protection.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
