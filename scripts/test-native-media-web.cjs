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
    const videoRoute = !S.bgCall && (['call', 'hcall'].includes(S.v) && !!document.querySelector('[aria-label="Private video call"]') || ['dial', 'dialback'].includes(S.v) && !!document.querySelector('.ringscr.is-video'));
    if (layout.fullScreen !== videoRoute) return false;
    return layout.slots.every(slot => {
      const video = document.querySelector(`video[data-zimi-${slot.kind}]`), rect = video.getBoundingClientRect();
      return video.hasAttribute('data-zimi-native-video') && getComputedStyle(video).objectFit === slot.fit && ['x', 'y', 'width', 'height'].every(key => Math.abs(slot[key] - rect[key]) < 0.6);
    });
  }, slots).catch(async error => {
    const diagnostic = await page.evaluate(() => ({ view: S.v, layout: __sent.filter(message => message.type === 'native.media.layout').at(-1)?.data,
      videos: [...document.querySelectorAll('video[data-zimi-local],video[data-zimi-remote]')].map(video => ({ local: video.hasAttribute('data-zimi-local'), native: video.hasAttribute('data-zimi-native-video'), fit: getComputedStyle(video).objectFit, rect: video.getBoundingClientRect().toJSON() })) })).catch(() => null);
    error.message = label + ': native layout did not settle: ' + JSON.stringify(diagnostic) + '\n' + error.message;
    throw error;
  });
  const fitting = await page.evaluate(() => __sent.filter(message => message.type === 'native.media.layout').at(-1).data.slots.map(slot => {
    const video = document.querySelector(`video[data-zimi-${slot.kind}]`);
    const stage = video.parentElement.matches('.zr-call:not(.zb-previewing)>.zr-video,.ringscr.dial.is-video>.ringbg') || video.hasAttribute('data-zimi-local') && !!video.closest('.zr-call.zb-previewing');
    return { kind: slot.kind, emitted: slot.fit, css: getComputedStyle(video).objectFit, expected: stage ? 'cover' : 'contain', native: video.hasAttribute('data-zimi-native-video'), view: S.v };
  }));
  assert.ok(fitting.every(value => value.emitted === value.expected && value.css === value.emitted), label + ': main call video fills its stage while PiP/setup/beauty retain their framing: ' + JSON.stringify(fitting));
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
    assert.ok(layout.slots.every(slot => slot.width > 0 && slot.height > 0));
    assert.equal(layout.fullScreen, true, 'A visible video call requests an edge-to-edge native viewport');
    assert.equal(layout.slots.find(slot => slot.kind === 'remote').fit, 'cover');
    assert.equal(layout.slots.find(slot => slot.kind === 'local').fit, 'contain');
    await receive(page, 'app.insets', { top: 32, right: 0, bottom: 24, left: 0 });
    await page.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.zr-call>.zr-top')).paddingTop) === 32);
    assert.equal(await page.evaluate(() => {
      const stage = document.querySelector('.zr-call>.zr-video').getBoundingClientRect();
      const top = document.querySelector('.zr-call-toolbar').getBoundingClientRect();
      const end = document.querySelector('.zr-hangup').getBoundingClientRect();
      return Math.abs(stage.x) < 1 && Math.abs(stage.y) < 1 && Math.abs(stage.width - innerWidth) < 1 && Math.abs(stage.height - innerHeight) < 1 && top.top >= 32 && end.bottom <= innerHeight - 24;
    }), true, 'Video reaches every viewport edge while header and hangup avoid native system bars');
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
    assert.equal(await page.locator('video[data-zimi-local]').evaluate(video => {
      const rect = video.getBoundingClientRect(), panel = document.querySelector('[data-zimi-beauty-panel]').getBoundingClientRect();
      return Math.abs(rect.x) < 1 && Math.abs(rect.y) < 1 && Math.abs(rect.width - innerWidth) < 1 && Math.abs(rect.height - innerHeight) < 1 && panel.top < rect.bottom && getComputedStyle(video).objectFit === 'cover' && getComputedStyle(video).borderTopLeftRadius === '0px' && getComputedStyle(video.parentElement).borderTopLeftRadius === '0px';
    }), true, 'Opening beauty overlays its controls without reducing the full-screen camera background');
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
    assert.equal(await page.evaluate(() => __sent.filter(message => message.type === 'native.media.layout').at(-1).data.fullScreen), false, 'Minimizing returns safe-area ownership to the native navigation shell');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--safe-top').trim()), '0px');
    await page.evaluate(() => callRestore());
    await page.waitForFunction(() => __sent.filter(message => message.type === 'native.media.layout').at(-1).data.slots.length === 2);
    await page.evaluate(() => ZimiMedia.stop());
    await page.waitForFunction(() => __sent.filter(message => message.type === 'native.media.layout').at(-1).data.slots.length === 0);
    assert.equal(await page.locator('[data-zimi-native-underlay]').count(), 0, 'Stopping restores normal opaque page backgrounds');
    // Setup and its smaller beauty preview must retain the same camera field
    // of view as the call instead of cropping it to fill a different ratio.
    await receive(page, 'session', { user: { ...creator, hostStatus: 'approved', isVerifiedHost: true, isPhoneVerified: true }, verification: 'verified', requiresOnboarding: false });
    await page.evaluate(async member => {
      S.cam = S.mic = 1; S.swap = false; S.bgCall = null;
      S.caller = { ...member, n: member.name, callId: 'native-host-call', voice: false };
      await ZimiMedia.prepare(true); go('hcall'); r();
    }, member);
    await receive(page, 'native.media.state', { hasVideo: true, remoteVideo: true, camera: true, facing: 'user', beautyStatus: 'ready' });
    await checkGeometry(page, 'Host full-screen video call');
    assert.equal(await page.evaluate(() => {
      const layout = __sent.filter(message => message.type === 'native.media.layout').at(-1).data;
      const stage = document.querySelector('.zr-call>.zr-video').getBoundingClientRect();
      const toolbar = document.querySelector('.zr-call-toolbar').getBoundingClientRect();
      const hangup = document.querySelector('.zr-hangup').getBoundingClientRect();
      return layout.fullScreen && layout.slots.find(slot => slot.kind === 'local').fit === 'cover' && Math.abs(stage.width - innerWidth) < 1 && Math.abs(stage.height - innerHeight) < 1 && toolbar.top >= 32 && hangup.bottom <= innerHeight - 24;
    }), true, 'Host camera fills the viewport with reachable overlaid controls');
    await page.evaluate(() => { S.swap = true; r(); });
    await checkGeometry(page, 'Swapped host full-screen call');
    assert.equal(await page.evaluate(() => __sent.filter(message => message.type === 'native.media.layout').at(-1).data.slots.find(slot => slot.kind === 'remote').fit), 'cover', 'Swapping fills the same stage with the other participant');
    await page.evaluate(() => hsOpenSheet('appearance'));
    await page.locator('.zr-call.zb-previewing [data-zimi-beauty-panel]').waitFor();
    await checkGeometry(page, 'Host call beauty preview');
    assert.equal(await page.locator('video[data-zimi-local]').evaluate(video => {
      const rect = video.getBoundingClientRect();
      return Math.abs(rect.x) < 1 && Math.abs(rect.y) < 1 && Math.abs(rect.width - innerWidth) < 1 && Math.abs(rect.height - innerHeight) < 1;
    }), true, 'Swapped host beauty also keeps the existing local camera full-screen');
    await page.evaluate(() => { hsCloseSheet(); S.caller.voice = true; go('hcall'); r(); });
    await page.waitForFunction(() => __sent.filter(message => message.type === 'native.media.layout').at(-1).data.fullScreen === false);
    assert.equal(await page.locator('.zr-voice-call').count(), 1, 'Voice calls retain the ordinary safe-area shell');
    await page.evaluate(() => { S.caller.voice = false; S.cam = 1; go('dialback'); r(); });
    await page.waitForFunction(() => __sent.filter(message => message.type === 'native.media.layout').at(-1).data.fullScreen === true);
    await checkGeometry(page, 'Outgoing host video preview', 1);
    assert.equal(await page.evaluate(() => __sent.filter(message => message.type === 'native.media.layout').at(-1).data.slots[0].fit), 'cover', 'A ringing video preview also fills the screen');
    await page.evaluate(async () => {
      ZimiMedia.stop(); S.callId = null; S.bgCall = null; S.cam = S.mic = 1; go('setup');
      await ZimiMedia.prepare(true); HostCalls.preview = 'ready'; r();
    });
    await receive(page, 'native.media.state', { hasVideo: true, remoteVideo: false, camera: true, facing: 'user', beautyStatus: 'ready' });
    await page.locator('.hc-setup').waitFor();
    await checkGeometry(page, 'Host camera setup', 1);
    assert.equal(await page.evaluate(() => __sent.filter(message => message.type === 'native.media.layout').at(-1).data.fullScreen), false, 'Host setup retains native safe-area padding and whole-camera preview');
    await page.evaluate(() => hsOpenSheet('appearance'));
    await page.locator('.hc-setup.zb-previewing [data-zimi-beauty-panel]').waitFor();
    await checkGeometry(page, 'Host setup beauty preview', 1);
    await receive(page, 'native.media.dimensions', { kind: 'local', width: 720, height: 1280 });
    await page.waitForFunction(() => document.querySelector('.hc-stage>video').dataset.zimiShape === 'portrait');
    await checkGeometry(page, 'Host portrait beauty preview', 1);
    await page.evaluate(() => { hsCloseSheet(); ZimiMedia.stop(); });
    await page.waitForFunction(() => __sent.filter(message => message.type === 'native.media.layout').at(-1).data.slots.length === 0);
    assert.deepEqual(errors, [], 'Native UI produces no page errors');
    console.log('Native media UI: fullscreen caller/host video and call beauty, safe controls, voice/minimize restoration, standalone setup framing and browser isolation passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
