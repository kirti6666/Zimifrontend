/* Production UI, with a fake native media host. Verifies the WebView cannot
   start a second camera/peer and that all native video surfaces remain visible
   through transparent ancestors while web controls stay above them. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const creator = { id: '507f1f77bcf86cd799439011', name: 'Camera tester', role: 'host', serverRole: 'host', category: 'Music', availableForCall: true, online: true, verified: true, ratePerMin: 60, entryFee: 0 };
const member = { id: '507f1f77bcf86cd799439012', name: 'Native caller', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false, isPhoneVerified: true };
const receive = (page, type, data) => page.evaluate(message => Native.receive(message), { type, data });
const count = (page, action) => page.evaluate(action => __sent.filter(message => message.type === 'native.media' && message.data.action === action).length, action);
async function checkGeometry(page, label, slots = 2) {
  await page.waitForFunction(slots => {
    const layout = __sent.filter(message => message.type === 'native.media.layout').at(-1)?.data;
    if (!layout || layout.width !== innerWidth || layout.height !== innerHeight || layout.slots.length !== slots) return false;
    return layout.slots.every(slot => {
      const rect = document.querySelector(`video[data-zimi-${slot.kind}]`).getBoundingClientRect();
      return ['x', 'y', 'width', 'height'].every(key => Math.abs(slot[key] - rect[key]) < 0.6);
    });
  }, slots);
  assert.equal(await page.evaluate(() => __sent.filter(message => message.type === 'native.media.layout').at(-1).data.slots.every(slot => slot.fit === 'contain')), true, label + ': native video preserves the whole camera frame without cropping');
  assert.equal(await page.locator('video[data-zimi-native-video]').evaluateAll(videos => videos.every(video => getComputedStyle(video).objectFit === 'contain')), true, label + ': preview fitting preserves camera proportions without zooming');
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**/*', route => route.abort());
  await page.addInitScript(() => {
    window.ZIMI_NATIVE_MEDIA = true;
    window.__sent = [];
    window.__browserMedia = { captures: 0, peers: 0 };
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { __browserMedia.captures++; throw new Error('Browser capture must not run'); };
    window.RTCPeerConnection = function () { __browserMedia.peers++; throw new Error('Browser peer must not run'); };
    window.ReactNativeWebView = { postMessage(raw) {
      const event = JSON.parse(raw); __sent.push(event);
      if (event.type !== 'native.media') return;
      queueMicrotask(() => {
        const { action, requestId, data } = event.data;
        const result = action === 'prepare' ? { hasVideo: data.video } : action === 'flipCamera' ? { facing: 'environment' } : {};
        window.zimiReceive?.({ type: 'native.media.result', data: { requestId, result } });
      });
    } };
  });
  try {
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href);
    await receive(page, 'session', { user: member, verification: 'none', requiresOnboarding: false });
    await receive(page, 'data.home', { hosts: [creator], stage: [], featured: creator, total: 1, page: 1, categories: ['Music'], availableCount: 1 });
    await receive(page, 'wallet.balance', { coins: 1250, earned: 0 });
    await receive(page, 'data.catalog', { gifts: [], packs: [], paymentsAvailable: false });
    await page.evaluate(async creator => {
      S.callId = 'native-ui-call'; S.callRate = 60; S.mic = S.cam = S.scam = 1;
      await ZimiMedia.prepare(true);
      go('call', creator.id); r();
    }, creator);
    await receive(page, 'native.media.state', { hasVideo: true, remoteVideo: true, camera: true, microphone: true, facing: 'user', quality: 'good', beautyStatus: 'idle', status: 'Connected' });
    await page.waitForFunction(() => __sent.some(message => message.type === 'native.media.layout' && message.data.slots.length === 2));
    assert.deepEqual(await page.evaluate(() => __browserMedia), { captures: 0, peers: 0 }, 'Native UI never opens browser media');
    const holes = await page.locator('video[data-zimi-native-video]').evaluateAll(videos => videos.map(video => {
      const opaque = []; let parent = video;
      while (parent) { const style = getComputedStyle(parent); if (style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.backgroundImage !== 'none') opaque.push(parent.id || parent.className || parent.tagName); parent = parent.parentElement; }
      return opaque;
    }));
    assert.deepEqual(holes, [[], []], 'Every ancestor between each native surface and the transparent WebView is transparent');
    const layout = await page.evaluate(() => __sent.filter(message => message.type === 'native.media.layout').at(-1).data);
    assert.equal(layout.slots.length, 2);
    assert.ok(layout.slots.every(slot => slot.width > 0 && slot.height > 0 && slot.fit === 'contain'), 'Both native camera frames remain wholly visible within their video area');
    assert.equal(await page.locator('.zr-call-toolbar button').first().isVisible(), true, 'Web controls stay mounted above native video');
    for (const viewport of [{ width: 320, height: 640 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await checkGeometry(page, `${viewport.width}x${viewport.height}`);
    }
    await receive(page, 'native.media.dimensions', { kind: 'local', width: 720, height: 1280 });
    await page.waitForFunction(() => document.querySelector('video[data-zimi-local]').dataset.zimiShape === 'portrait');
    assert.equal(await page.locator('video[data-zimi-local]').getAttribute('data-zimi-shape'), 'portrait', 'Native rotation informs full-frame display without a browser decoder');
    assert.equal(await page.locator('video[data-zimi-local]').evaluate(video => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(video).transform);
      return Math.abs(matrix.m12) < .001 && Math.abs(matrix.m21) < .001 && matrix.m22 > 0;
    }), true, 'The WebView never rotates or vertically inverts the upright native camera texture');
    await page.evaluate(() => zrOpen('beauty'));
    await page.locator('[data-zimi-beauty-panel]').waitFor();
    await checkGeometry(page, 'Beauty enlarged local preview');
    assert.equal(await page.evaluate(() => {
      const slots = __sent.filter(message => message.type === 'native.media.layout').at(-1).data.slots;
      const local = slots.find(slot => slot.kind === 'local'), remote = slots.find(slot => slot.kind === 'remote');
      return local.width * local.height > remote.width * remote.height;
    }), true, 'Beauty enlarges one native local preview while retaining remote video');
    await page.evaluate(() => zrClose());
    await checkGeometry(page, 'Closed beauty preview');
    await receive(page, 'native.media.dimensions', { kind: 'local', width: 1920, height: 1080 });
    await page.waitForFunction(() => document.querySelector('video[data-zimi-local]').dataset.zimiShape === 'landscape');
    await checkGeometry(page, 'Whole landscape camera frame');
    await page.evaluate(() => { S.mic = 0; S.scam = 0; r(); });
    await page.waitForFunction(() => __sent.filter(message => message.type === 'native.media' && message.data.action === 'controls').at(-1).data.data.camera === false);
    assert.deepEqual(await page.evaluate(() => __sent.filter(message => message.type === 'native.media' && message.data.action === 'controls').at(-1).data.data), { camera: false, microphone: false });
    await page.evaluate(() => { S.mic = S.scam = 1; r(); });
    await page.waitForFunction(() => __sent.filter(message => message.type === 'native.media.layout').at(-1).data.slots.length === 2);
    await page.evaluate(() => ZimiBeauty.setParam('smoothing', 0.6));
    await page.waitForFunction(() => __sent.some(message => message.type === 'native.media' && message.data.action === 'beauty' && message.data.data.enabled));
    const beforeRetry = await count(page, 'beauty');
    await receive(page, 'native.media.state', { beautyStatus: 'authFailed' });
    await page.evaluate(() => ZimiBeauty.sync());
    assert.ok(await count(page, 'beauty') > beforeRetry, 'Retry resubmits unchanged beauty settings after native authorization failure');
    await page.evaluate(() => callMinimize());
    await page.waitForFunction(() => document.getElementById('zimi-ongoing'));
    await page.waitForFunction(() => __sent.filter(message => message.type === 'native.media.layout').at(-1).data.slots.length === 1);
    assert.equal(await page.evaluate(() => __sent.filter(message => message.type === 'native.media.layout').at(-1).data.slots[0].kind), 'remote', 'Minimizing keeps the native remote thumbnail');
    await page.evaluate(() => callRestore());
    await page.waitForFunction(() => __sent.filter(message => message.type === 'native.media.layout').at(-1).data.slots.length === 2);
    await page.evaluate(() => ZimiMedia.stop());
    await page.waitForFunction(() => __sent.filter(message => message.type === 'native.media.layout').at(-1).data.slots.length === 0);
    assert.equal(await page.locator('[data-zimi-native-underlay]').count(), 0, 'Stopping restores normal opaque page backgrounds');
    // Setup and its smaller beauty preview must retain the same camera field
    // of view as the call instead of cropping it to fill a different ratio.
    await receive(page, 'session', { user: { ...creator, hostStatus: 'approved', isVerifiedHost: true, isPhoneVerified: true }, verification: 'verified', requiresOnboarding: false });
    await page.evaluate(async () => {
      S.callId = null; S.bgCall = null; S.cam = S.mic = 1; go('setup');
      await ZimiMedia.prepare(true); HostCalls.preview = 'ready'; r();
    });
    await receive(page, 'native.media.state', { hasVideo: true, remoteVideo: false, camera: true, facing: 'user', beautyStatus: 'ready' });
    await page.locator('.hc-setup').waitFor();
    await checkGeometry(page, 'Host camera setup', 1);
    await page.evaluate(() => hsOpenSheet('appearance'));
    await page.locator('.hc-setup.zb-previewing [data-zimi-beauty-panel]').waitFor();
    await checkGeometry(page, 'Host setup beauty preview', 1);
    await receive(page, 'native.media.dimensions', { kind: 'local', width: 720, height: 1280 });
    await page.waitForFunction(() => document.querySelector('.hc-stage>video').dataset.zimiShape === 'portrait');
    await checkGeometry(page, 'Host portrait beauty preview', 1);
    await page.evaluate(() => { hsCloseSheet(); ZimiMedia.stop(); });
    await page.waitForFunction(() => __sent.filter(message => message.type === 'native.media.layout').at(-1).data.slots.length === 0);
    assert.deepEqual(errors, [], 'Native UI produces no page errors');
    console.log('Native media UI: browser isolation, uncropped camera frames, upright metadata, call/setup beauty previews, controls, retry and minimize/restore passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
