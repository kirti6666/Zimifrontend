/* Exercise the shipped host/member entry points with fake browser cameras.
   SDK processing and WebRTC transport are covered by their separate suites. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const creator = { id: '507f1f77bcf86cd799439011', name: 'Beauty host', role: 'host', serverRole: 'host', hostStatus: 'approved', isVerifiedHost: true, verified: true, availableForCall: true, online: true, ratePerMin: 0, entryFee: 0 };
const member = { id: '507f1f77bcf86cd799439012', name: 'Beauty member', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false };
const receive = (page, type, data) => page.evaluate(message => Native.receive(message), { type, data });
const button = (page, name) => page.getByRole('button', { name, exact: true });

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  fs.mkdirSync(artifacts, { recursive: true });
  try {
    async function open(hosting, plan = 'pro+', saved = null) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      page.setDefaultTimeout(7000);
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://**/*', route => route.abort());
      await page.addInitScript(({ plan, saved }) => {
        // Exercise every effect group unless a check asks for the shipped plan.
        if (plan) window.ZIMI_FACEBETTER_PLAN = plan;
        if (saved) localStorage.setItem('zimi.beauty.v2', saved);
        window.__sent = []; window.__captureCount = 0;
        window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) };
        const acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = constraints => { __captureCount++; return acquire(constraints); };
      }, { plan, saved });
      await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href);
      await receive(page, 'session', { user: hosting ? creator : member, verification: hosting ? 'verified' : 'none', requiresOnboarding: false });
      await receive(page, 'data.home', { hosts: [creator], stage: [], total: 1, page: 1, categories: ['Music'] });
      await receive(page, 'wallet.balance', { coins: 5000, earned: 0 });
      await page.evaluate(() => {
        // Keep this suite about the UI: settings still call the real controller,
        // while the processor/transport suites test track replacement and auth.
        window.__restoredBeauty = ZimiBeauty.getParams();
        window.__beautyRefreshes = 0;
        ZimiMedia.refreshBeauty = async () => { __beautyRefreshes++; };
        ZimiBeauty.reset();
      });
      return page;
    }
    async function startCall(page, hosting, voice = false) {
      await page.evaluate(async ({ hosting, voice, creator, member }) => {
        ZimiBeauty.reset();
        if (!voice) await ZimiMedia.prepare(true);
        S.callId = hosting ? 'beauty-host-call' : 'beauty-member-call';
        S.callRate = 0; S.mic = 1; S.cam = 1; S.scam = 1;
        if (hosting) S.caller = { id: member.id, n: member.name, callId: S.callId, voice };
        go(hosting ? 'hcall' : voice ? 'voice' : 'call', hosting ? undefined : creator.id);
        Home.mediaStatus = 'Connected'; r();
      }, { hosting, voice, creator, member });
      if (!voice) await page.waitForFunction(() => document.querySelector('video[data-zimi-local]')?.readyState >= 2);
    }
    async function nativeBackClosesPicker(page, label) {
      await page.evaluate(() => {
        window.__beautyBack = { view: S.v, callId: S.callId, bgCall: S.bgCall, captures: __captureCount, sent: __sent.length,
          videos: [...document.querySelectorAll('video')].map(video => ({ video, stream: video.srcObject, tracks: video.srcObject?.getTracks() || [] })) };
      });
      await receive(page, 'app.back', {});
      assert.equal(await page.locator('[data-zimi-beauty-panel]').count(), 0, label + ': Android Back closes the camera controls first');
      assert.equal(await page.locator('.zb-previewing').count(), 0, label + ': Android Back restores the ordinary camera layout');
      assert.deepEqual(await page.evaluate(() => ({ view: S.v === __beautyBack.view, call: S.callId === __beautyBack.callId, background: S.bgCall === __beautyBack.bgCall,
        captures: __captureCount - __beautyBack.captures,
        videos: __beautyBack.videos.length === document.querySelectorAll('video').length && __beautyBack.videos.every(({ video, stream, tracks }) => video.isConnected && video.srcObject === stream && tracks.every(track => track.readyState === 'live')),
        ended: __sent.slice(__beautyBack.sent).some(message => /^call\.(end|cancel|decline)$/.test(message.type)) })),
      { view: true, call: true, background: true, captures: 0, videos: true, ended: false }, label + ': Back preserves the route, call, live video and microphone instead of minimizing or ending');
    }
    async function landscapePreview(page, label) {
      await page.setViewportSize({ width: 844, height: 390 });
      const layout = await page.evaluate(() => {
        const video = document.querySelector('video[data-zimi-local]'), dock = document.querySelector('[data-zimi-beauty-panel]');
        const camera = video.getBoundingClientRect(), panel = dock.getBoundingClientRect();
        const point = [camera.left + Math.max(1, Math.min(camera.width, panel.left - camera.left)) / 2, camera.top + camera.height / 2];
        const hit = document.elementFromPoint(...point);
        return { checks: { visible: Math.abs(camera.left)<1 && Math.abs(camera.top)<1 && Math.abs(camera.width-innerWidth)<1 && Math.abs(camera.height-innerHeight)<1,
          overlays: panel.left < camera.right && panel.right > camera.left && panel.top < camera.bottom && panel.bottom > camera.top,
          // Host main-stage video intentionally ignores pointer input; its
          // containing call is the expected hit target in that branch.
          unobscured: video.parentElement.contains(hit) || (hit === video.closest('.zr-call') && getComputedStyle(video.parentElement).pointerEvents === 'none'), framing: getComputedStyle(video).objectFit,
          overflow: document.documentElement.scrollWidth > innerWidth + 1 }, debug: { camera: camera.toJSON(), panel: panel.toJSON(), hit: hit?.tagName + '.' + hit?.className, label: hit?.getAttribute('aria-label'), parent: video.parentElement.className, point } };
      });
      await page.screenshot({ path: path.join(artifacts, `facebetter-${label}-landscape.png`) });
      assert.deepEqual(layout.checks, { visible: true, overlays: true, unobscured: true, framing: 'cover', overflow: false }, label + ': Landscape keeps full-screen camera video behind the overlaid dock: ' + JSON.stringify(layout.debug));
    }
    async function exercisePicker(page, hosting) {
      const picker = page.locator('[data-zimi-beauty-picker]');
      assert.equal(await picker.count(), 1, 'The active route renders the shared Facebetter picker');
      assert.equal(await page.locator('[data-zimi-beauty-panel]').count(), 1, 'Video effects open in a compact nonmodal camera dock');
      assert.equal(await picker.locator('[data-zimi-beauty-tab="filter"]').getAttribute('aria-pressed'), 'true', 'Filters open first for immediate live preview');
      assert.equal(await picker.locator('[data-zimi-filter-id]').count(), 20, 'Original and every SDK filter are available in the swipe rail');
      assert.equal(await page.locator('.zr-call.zb-previewing').count(), 1, 'Opening the dock enlarges the existing local camera with CSS');
      assert.doesNotMatch(await picker.innerText(), /Preview only|caller sees the original/i);
      await page.evaluate(() => {
        window.__beautyStage = document.querySelector('.zr-call');
        window.__beautyVideos = [...__beautyStage.querySelectorAll('video')];
        window.__beautyStreams = __beautyVideos.map(video => video.srcObject);
        window.__beautyCaptureCount = __captureCount;
        window.__beautyRenders = 0;
        window.__beautyOriginalRender = r;
        r = function () { __beautyRenders++; return __beautyOriginalRender.apply(this, arguments); };
      });
      await picker.locator('[data-zimi-beauty-tab="skin"]').click();
      const smoothing = picker.locator('[data-zimi-beauty-param="smoothing"]');
      await smoothing.evaluate(input => { input.value = '37'; input.dispatchEvent(new Event('input', { bubbles: true })); });
      assert.equal(await page.evaluate(() => ZimiBeauty.getParams().smoothing), 0.37, 'The live skin control changes the SDK parameter');
      await picker.locator('[data-zimi-beauty-tab="filter"]').click();
      await picker.locator('[data-zimi-beauty-option="filterId:natural"]').click();
      assert.equal(await page.evaluate(() => ZimiBeauty.getParams().filterId), 'natural', 'A filter selection reaches the real controller');
      assert.equal(await page.evaluate(() => __beautyRefreshes > 0), true, 'Selections request processed media updates');
      assert.deepEqual(await page.evaluate(() => ({ renders: __beautyRenders, stage: __beautyStage === document.querySelector('.zr-call'), captures: __captureCount - __beautyCaptureCount, videos: __beautyVideos.every((video, i) => video.isConnected && video.srcObject === __beautyStreams[i] && (!__beautyStreams[i] || __beautyStreams[i].getTracks().every(track => track.readyState === 'live'))) })), { renders: 0, stage: true, captures: 0, videos: true }, 'Changing SDK controls leaves the camera, microphone, and call DOM running');
      await page.evaluate(() => { r = __beautyOriginalRender; });
      for (const dark of [false, true]) {
        await page.evaluate(dark => ZimiThemes.setDark(dark), dark);
        for (const width of [320, 390]) {
          await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Beauty controls fit small phones and both themes');
          if (width === 390) await page.screenshot({ path: path.join(artifacts, `facebetter-${hosting ? 'host' : 'member'}-${dark ? 'dark' : 'light'}.png`) });
        }
      }
      await landscapePreview(page, hosting ? 'host' : 'member');
      assert.equal(await page.evaluate(() => __beautyVideos.every((video, i) => video.isConnected && video.srcObject === __beautyStreams[i])), true, 'Landscape resizing preserves the same camera elements and streams');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => ZimiBeauty.unavailable());
      assert.equal(await picker.locator('[data-zimi-beauty-retry]').isVisible(), true, 'SDK errors expose Retry in the active sheet');
      await nativeBackClosesPicker(page, hosting ? 'Host video call' : 'Member video call');
      await button(page, 'Call options').click();
      await button(page, 'Beauty and filters').click();
      await button(page, hosting ? 'Close Beauty & filters' : 'Close panel').click();
      assert.equal(await page.locator('.zr-call.zb-previewing').count(), 0, 'Closing controls restores the call layout');
      await button(page, 'Call options').click();
      await button(page, 'Beauty and filters').click();
      assert.equal(await page.evaluate(() => ZimiBeauty.getParams().smoothing), 0.37, 'Reopening preserves skin settings');
      assert.equal(await page.evaluate(() => ZimiBeauty.getParams().filterId), 'natural', 'Reopening preserves the selected SDK filter');
      assert.equal(await picker.locator('[data-zimi-filter-id="natural"]').getAttribute('aria-pressed'), 'true', 'Reopening restores the selected carousel item');
      await button(page, 'Reset all').click();
      assert.equal(await page.evaluate(() => ZimiBeauty.isEnabled()), false, 'Reset clears SDK effects for the outgoing camera');
      await button(page, hosting ? 'Close Beauty & filters' : 'Close panel').click();
    }

    const host = await open(true);
    await button(host, 'Get ready to go online').click();
    await button(host, 'Beauty and filters').click();
    assert.equal(await host.locator('[data-zimi-beauty-picker]').count(), 1, 'Host setup opens the SDK picker from its star button');
    assert.equal(await host.locator('[data-zimi-filter-rail]').count(), 1, 'Host setup starts with the swipe filter rail');
    assert.equal(await host.evaluate(() => ZimiMedia.hasVideo()), false, 'Opening beauty before a call never starts a camera');
    assert.equal(await host.evaluate(() => __sent.filter(message => message.type === 'beauty.auth').length), 0, 'Opening beauty before capture does not request a license');
    await nativeBackClosesPicker(host, 'Host setup');
    assert.equal(await host.evaluate(() => S.v), 'setup', 'Android Back from setup effects stays on setup');
    assert.equal(await host.evaluate(() => ZimiMedia.hasVideo()), false, 'Closing setup effects does not capture a camera');
    await button(host, 'Beauty and filters').click();
    await button(host, 'Close Beauty & filters').click();
    await startCall(host, true);
    await button(host, 'Call options').click();
    await button(host, 'Beauty and filters').click();
    await exercisePicker(host, true);
    await host.evaluate(() => {
      S.swap = true; r();
      const video = document.querySelector('video[data-zimi-local]');
      window.__swappedBeauty = { video, stream: video.srcObject, tracks: video.srcObject.getTracks(), captures: __captureCount };
    });
    await button(host, 'Call options').click();
    await button(host, 'Beauty and filters').click();
    assert.equal(await host.locator('button.zr-pip:has(video[data-zimi-local])').isDisabled(), true, 'The host swap action cannot displace the live camera while controls are open');
    await landscapePreview(host, 'host-swapped');
    await host.locator('[data-zimi-filter-id="natural"]').click();
    assert.deepEqual(await host.evaluate(() => ({ swap: S.swap, video: __swappedBeauty.video === document.querySelector('video[data-zimi-local]'), stream: __swappedBeauty.video.srcObject === __swappedBeauty.stream, captures: __captureCount - __swappedBeauty.captures, live: __swappedBeauty.tracks.every(track => track.readyState === 'live') })),
      { swap: true, video: true, stream: true, captures: 0, live: true }, 'Opening and using the host swapped-camera preview changes only layout, preserving S.swap and media');
    await nativeBackClosesPicker(host, 'Swapped host video call');
    assert.equal(await host.evaluate(() => S.swap), true, 'Closing the preview restores the chosen host swap state');
    await host.setViewportSize({ width: 390, height: 844 });
    await startCall(host, true, true);
    await button(host, 'Call options').click();
    assert.equal(await button(host, 'Beauty and filters').count(), 0, 'Host voice calls hide camera effects');
    assert.equal(await host.evaluate(() => { hsOpenSheet('appearance'); return HostStudio.sheet; }), '', 'A stale host action cannot open camera effects during a voice call');
    await host.close();

    const sender = await open(false);
    await startCall(sender, false);
    await button(sender, 'Call options').click();
    await button(sender, 'Beauty and filters').click();
    await exercisePicker(sender, false);
    await startCall(sender, false, true);
    await button(sender, 'Call options').click();
    assert.equal(await button(sender, 'Beauty and filters').count(), 0, 'Member voice calls hide camera effects');
    assert.equal(await sender.evaluate(() => { Room.sheet = 'beauty'; return zrSheet(); }), '', 'A voice call cannot open the camera picker through a stale action');
    await sender.close();

    // The shipped Basic plan offers only skin beauty and colour grading.
    // Choices saved under the free plan must not keep a hidden effect running.
    const saved = { smoothing: .3, brightness: .2, filterId: 'natural', stickerId: 'kiss2', lipstick: .5, bgBlur: .5, reshape: Object.fromEntries(Array.from({ length: 40 }, (_, id) => [id, .4])) };
    const basic = await open(true, null, JSON.stringify(saved));
    const effects = p => ({ smoothing: p.smoothing, brightness: p.brightness, filter: p.filterId, sticker: p.stickerId, lipstick: p.lipstick, blur: p.bgBlur, reshape: Object.values(p.reshape).some(Boolean) });
    assert.deepEqual(await basic.evaluate(() => ({ plan: ZimiBeautyCatalog.PLAN, p: __restoredBeauty })).then(({ plan, p }) => ({ plan, ...effects(p) })),
      { plan: 'basic', smoothing: .3, brightness: .2, filter: null, sticker: null, lipstick: 0, blur: 0, reshape: false }, 'Basic restores saved skin and colour settings but drops hidden effects');
    await button(basic, 'Get ready to go online').click();
    await button(basic, 'Beauty and filters').click();
    assert.deepEqual(await basic.locator('[data-zimi-beauty-picker] [data-zimi-beauty-tab]').evaluateAll(nodes => nodes.map(node => [node.dataset.zimiBeautyTab, node.getAttribute('aria-pressed')])),
      [['skin', 'true'], ['color', 'false']], 'Basic offers only Skin and Color, opening on Skin');
    assert.equal(await basic.locator('[data-zimi-filter-rail]').count(), 0, 'Basic hides the LUT filter rail');
    const icons = selector => basic.locator(`[data-zimi-beauty-picker] ${selector}`).evaluateAll(nodes => nodes.map(node => [node.innerText.trim(), !!node.querySelector('svg')]));
    assert.deepEqual(await icons('[data-zimi-beauty-tab]'), [['Skin', true], ['Color', true]], 'Tabs carry icons');
    assert.deepEqual(await icons('[data-zimi-beauty-feature]'), [['Smooth', true], ['Blemish', true], ['Whiten', true], ['Rosy', true], ['Clarity', true]], 'Skin offers one icon per adjustment');
    const skinOnly = basic.getByRole('switch', { name: 'Apply to skin only', exact: true });
    await skinOnly.click();
    assert.deepEqual({ on: await basic.evaluate(() => ZimiBeauty.getParams().skinOnly), checked: await skinOnly.getAttribute('aria-checked') }, { on: true, checked: 'true' }, 'The skin-only switch reaches the controller');
    await skinOnly.click();
    await basic.locator('[data-zimi-beauty-tab="color"]').click();
    assert.deepEqual(await icons('[data-zimi-beauty-feature]'), [['Brightness', true], ['Contrast', true], ['Saturation', true], ['Warmth', true], ['Tint', true]], 'Color offers one icon per adjustment');
    await basic.locator('[data-zimi-beauty-param="brightness"]').evaluate(input => { input.value = '-25'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.deepEqual({ value: await basic.locator('[data-zimi-beauty-value="brightness"]').textContent(), dot: await basic.locator('[data-zimi-beauty-feature="brightness"]').evaluate(node => node.hasAttribute('data-active')) },
      { value: '-25%', dot: true }, 'Color adjustments show a signed value and mark the changed icon');
    const attempted = await basic.evaluate(() => {
      for (const [key, value] of [['filterId', 'natural'], ['stickerId', 'fox'], ['lipstick', .5], ['bgBlur', .5]]) ZimiBeauty.setParam(key, value);
      ZimiBeauty.setShape('reshape', Object.keys(ZimiBeauty.getParams().reshape)[0], .5);
      return ZimiBeauty.getParams();
    });
    const { smoothing: _, ...attemptedEffects } = effects(attempted);
    assert.deepEqual(attemptedEffects, { brightness: -.25, filter: null, sticker: null, lipstick: 0, blur: 0, reshape: false }, 'Colour sliders work while hidden effects cannot be set directly');
    assert.equal(await basic.evaluate(() => __sent.filter(message => message.type === 'beauty.auth').length), 0, 'Opening Basic controls does not request a license');
    await basic.close();
    assert.deepEqual(errors, [], 'No browser exceptions');
    console.log('PASS Facebetter UI: filter-first nonmodal camera docks, setup/host/member Android Back, swapped host preview, portrait/landscape themes, SDK controls, live media preservation, persisted selections, errors/reset, voice-call exclusion and Basic-plan gating.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
