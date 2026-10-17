/* Staff verification calls on the applicant's phone. The native bridge is a local stub;
   a second RTCPeerConnection in the page plays the staff side, so the real media.js call
   session negotiates, connects and plays the staff video. No server is contacted. */
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const id = suffix => `507f1f77bcf86cd7994391${suffix}`;
const applicant = { user: { id: id('01'), name: 'Riya Applicant', role: 'host', serverRole: 'host', hostStatus: 'pending', isVerifiedHost: false, isPhoneVerified: true }, balance: 0, verification: 'pending', requiresOnboarding: false };

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera', 'microphone'], reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(message.text()); });
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => {
      window.__sent = [];
      window.ReactNativeWebView = { postMessage: raw => {
        const message = JSON.parse(raw); window.__sent.push(message);
        // Act as the native bridge for the requests a call needs.
        if (message.type === 'rtc.config') setTimeout(() => Native.receive({ type: 'rtc.config', data: { iceServers: [] } }));
        if (message.type === 'rtc.signal' && window.__staff) window.__staff.deliver(message.data);
      } };
    });
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href);
    const receive = (type, data = {}) => page.evaluate(message => Native.receive(message), { type, data });
    const sent = type => page.evaluate(value => window.__sent.filter(message => message.type === value).map(message => message.data), type);
    const dialog = () => page.getByRole('dialog', { name: /ZimiLive team is calling|ZimiLive verification/ });
    await receive('session', applicant);

    await receive('verify.incoming', { callId: 'call-declined' });
    await dialog().waitFor();
    assert.equal(await page.getByRole('button', { name: 'Accept verification video call' }).evaluate(el => el === document.activeElement), true, 'Accept is focused for a quick answer');
    await page.screenshot({ path: path.join(os.tmpdir(), 'zimi-verification-ringing.png') });
    await page.getByRole('button', { name: 'Decline verification call' }).click();
    assert.deepEqual(await sent('verify.end'), [{ callId: 'call-declined' }]);
    assert.equal(await dialog().count(), 0);
    console.log('PASS verification call: incoming overlay, focus and decline');

    await receive('verify.incoming', { callId: 'call-live' });
    await page.getByRole('button', { name: 'Accept verification video call' }).click();
    await page.waitForFunction(() => window.__sent.some(message => message.type === 'verify.accept'));
    assert.deepEqual(await sent('verify.accept'), [{ callId: 'call-live' }], 'Camera and microphone start before answering');
    await page.getByText('Connecting…').waitFor();
    // The staff browser, played by a second peer in this page.
    await page.evaluate(() => {
      const pc = new RTCPeerConnection();
      const canvas = Object.assign(document.createElement('canvas'), { width: 160, height: 120 });
      const paint = canvas.getContext('2d'); let frame = 0;
      // A canvas stream only sends frames when the canvas changes.
      window.__staffPaint = setInterval(() => { paint.fillStyle = frame++ % 2 ? '#c9086a' : '#e9409a'; paint.fillRect(0, 0, 160, 120); }, 100);
      canvas.captureStream(5).getTracks().forEach(track => pc.addTrack(track));
      pc.onicecandidate = event => { if (event.candidate) Native.receive({ type: 'rtc.signal', data: { callId: 'call-live', from: 'zimi-team', candidate: event.candidate.toJSON() } }); };
      window.__staff = { pc, deliver: async data => {
        if (data.callId !== 'call-live') return;
        if (data.description) await pc.setRemoteDescription(data.description);
        if (data.candidate) await pc.addIceCandidate(data.candidate);
      } };
    });
    await receive('verify.connected', { callId: 'call-live', peerId: 'zimi-team', initiator: false, voice: false });
    await page.evaluate(async () => {
      const pc = window.__staff.pc, offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      Native.receive({ type: 'rtc.signal', data: { callId: 'call-live', from: 'zimi-team', description: { type: offer.type, sdp: offer.sdp } } });
    });
    await page.waitForFunction(() => window.__staff.pc.connectionState === 'connected');
    await page.waitForFunction(() => { const video = document.querySelector('.zv-remote'); return video && video.srcObject && video.srcObject.getVideoTracks().length > 0; });
    assert.equal(await page.locator('.zv-local').evaluate(video => Boolean(video.srcObject && video.srcObject.getVideoTracks().length)), true, 'The applicant sees their own camera');
    const answers = (await sent('rtc.signal')).filter(signal => signal.description);
    assert.equal(answers.length, 1); assert.equal(answers[0].description.type, 'answer'); assert.equal(answers[0].callId, 'call-live');
    assert.match(await page.locator('#zv-timer').innerText(), /^\d+:\d\d$/);
    // Frames, not just attached tracks: both pictures are actually playing.
    for (const selector of ['.zv-local', '.zv-remote'])
      await page.waitForFunction(value => document.querySelector(value)?.videoWidth > 0, selector).catch(async error => {
        console.log(selector, await page.locator(selector).evaluate(video => JSON.stringify({ readyState: video.readyState, paused: video.paused, tracks: video.srcObject?.getTracks().map(track => [track.kind, track.readyState, track.enabled, track.muted]) })));
        throw error;
      });
    await page.screenshot({ path: path.join(os.tmpdir(), 'zimi-verification-connected.png') });
    console.log('PASS verification call: accept, answer the staff offer, connect and show both videos');

    await page.getByRole('button', { name: 'Mute microphone' }).click();
    assert.equal(await page.getByRole('button', { name: 'Unmute microphone' }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.zv-local').evaluate(video => video.srcObject.getAudioTracks().every(track => !track.enabled)), true);
    await page.getByRole('button', { name: 'End verification call' }).click();
    assert.deepEqual((await sent('verify.end')).at(-1), { callId: 'call-live' });
    assert.equal(await dialog().count(), 0);
    await page.getByText('Thanks for joining. The team will update your application soon.').waitFor();
    console.log('PASS verification call: mute and hang up');

    await receive('verify.incoming', { callId: 'call-missed' });
    await receive('verify.ended', { callId: 'call-missed', status: 'missed' });
    assert.equal(await dialog().count(), 0);
    await page.getByText('You missed the verification call. The team can call you again.').waitFor();
    await receive('verify.incoming', { callId: 'call-failed' });
    await receive('verify.ended', { callId: 'call-other', status: 'ended' });
    assert.equal(await dialog().count(), 1, 'Another call ending does not close this one');
    await receive('verify.ended', { callId: 'call-failed', status: 'failed' });
    assert.equal(await dialog().count(), 0);
    assert.equal((await sent('call.decline')).length + (await sent('call.end')).length, 0, 'Member-call paths are never used');
    console.log('PASS verification call: missed and failed calls close the right overlay');
    assert.deepEqual(errors, []);
    console.log('PASS no uncaught browser errors');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
