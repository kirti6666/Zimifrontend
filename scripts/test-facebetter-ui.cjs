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
    async function open(hosting) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      page.setDefaultTimeout(7000);
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://**/*', route => route.abort());
      await page.addInitScript(() => { window.__sent = []; window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) }; });
      await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href);
      await receive(page, 'session', { user: hosting ? creator : member, verification: hosting ? 'verified' : 'none', requiresOnboarding: false });
      await receive(page, 'data.home', { hosts: [creator], stage: [], total: 1, page: 1, categories: ['Music'] });
      await receive(page, 'wallet.balance', { coins: 5000, earned: 0 });
      await page.evaluate(() => {
        // Keep this suite about the UI: settings still call the real controller,
        // while the processor/transport suites test track replacement and auth.
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
    async function exercisePicker(page, hosting) {
      const picker = page.locator('[data-zimi-beauty-picker]');
      assert.equal(await picker.count(), 1, 'The active route renders the shared Facebetter picker');
      assert.doesNotMatch(await picker.innerText(), /Preview only|caller sees the original/i);
      await page.evaluate(() => {
        window.__beautyStage = document.querySelector('.zr-call');
        window.__beautyVideos = [...__beautyStage.querySelectorAll('video')];
        window.__beautyStreams = __beautyVideos.map(video => video.srcObject);
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
      assert.deepEqual(await page.evaluate(() => ({ renders: __beautyRenders, stage: __beautyStage === document.querySelector('.zr-call'), videos: __beautyVideos.every((video, i) => video.isConnected && video.srcObject === __beautyStreams[i] && (!__beautyStreams[i] || __beautyStreams[i].getTracks().every(track => track.readyState === 'live'))) })), { renders: 0, stage: true, videos: true }, 'Changing SDK controls leaves the camera, microphone, and call DOM running');
      await page.evaluate(() => { r = __beautyOriginalRender; });
      for (const dark of [false, true]) {
        await page.evaluate(dark => ZimiThemes.setDark(dark), dark);
        for (const width of [320, 390]) {
          await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Beauty controls fit small phones and both themes');
          if (width === 390) await page.screenshot({ path: path.join(artifacts, `facebetter-${hosting ? 'host' : 'member'}-${dark ? 'dark' : 'light'}.png`) });
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => ZimiBeauty.unavailable());
      assert.equal(await picker.locator('[data-zimi-beauty-retry]').isVisible(), true, 'SDK errors expose Retry in the active sheet');
      await button(page, hosting ? 'Close Beauty & filters' : 'Close panel').click();
      await button(page, 'Call options').click();
      await button(page, 'Beauty and filters').click();
      assert.equal(await page.evaluate(() => ZimiBeauty.getParams().smoothing), 0.37, 'Reopening preserves skin settings');
      assert.equal(await page.evaluate(() => ZimiBeauty.getParams().filterId), 'natural', 'Reopening preserves the selected SDK filter');
      await button(page, 'Reset all').click();
      assert.equal(await page.evaluate(() => ZimiBeauty.isEnabled()), false, 'Reset clears SDK effects for the outgoing camera');
      await button(page, hosting ? 'Close Beauty & filters' : 'Close panel').click();
    }

    const host = await open(true);
    await button(host, 'Get ready to go online').click();
    await button(host, 'Beauty and filters').click();
    assert.equal(await host.locator('[data-zimi-beauty-picker]').count(), 1, 'Host setup opens the SDK picker from its star button');
    assert.equal(await host.evaluate(() => ZimiMedia.hasVideo()), false, 'Opening beauty before a call never starts a camera');
    assert.equal(await host.evaluate(() => __sent.filter(message => message.type === 'beauty.auth').length), 0, 'Opening beauty before capture does not request a license');
    await button(host, 'Close Beauty & filters').click();
    await startCall(host, true);
    await button(host, 'Call options').click();
    await button(host, 'Beauty and filters').click();
    await exercisePicker(host, true);
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
    assert.deepEqual(errors, [], 'No browser exceptions');
    console.log('PASS Facebetter UI: host setup and both video-call pickers, SDK controls, live media preservation, persisted selections, errors/reset, responsive themes, and voice-call exclusion.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
