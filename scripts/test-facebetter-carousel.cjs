/* The shipped call UI with real browser fake capture and a deterministic canvas
   processor. This proves live preview/interaction continuity, not SDK quality;
   the separate licensed visual and worker suites cover actual Facebetter pixels. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { PNG } = require('pngjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts', 'facebetter-carousel');
const creator = { id: '507f1f77bcf86cd799439011', name: 'Carousel host', role: 'host', serverRole: 'host', hostStatus: 'approved', isVerifiedHost: true, verified: true, availableForCall: true, online: true, ratePerMin: 0, entryFee: 0 };
const member = { id: '507f1f77bcf86cd799439012', name: 'Carousel member', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false };
const button = (page, name) => page.getByRole('button', { name, exact: true });
const receive = (page, type, data) => page.evaluate(message => Native.receive(message), { type, data });

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  fs.mkdirSync(artifacts, { recursive: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => {
      window.__sent = []; window.__captures = 0;
      window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) };
      const acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = constraints => { __captures++; return acquire(constraints); };
    });
    async function session() {
      await receive(page, 'session', { user: member, verification: 'none', requiresOnboarding: false });
      await receive(page, 'data.home', { hosts: [creator], stage: [], total: 1, page: 1, categories: ['Music'] });
      await receive(page, 'wallet.balance', { coins: 5000, earned: 0 });
    }
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href);
    await session();
    await page.evaluate(() => {
      ZimiBeauty.reset();
      window.__processors = [];
      window.__colorFor = id => {
        const index = ZimiBeautyCatalog.FILTER_IDS.indexOf(id) + 1;
        return [45 + index * 53 % 150, 50 + index * 79 % 150, 55 + index * 31 % 150];
      };
      // Keep real settings, save/restore, media attachment, capture and audio.
      // Only the licensed image-processing boundary is deterministic here.
      ZimiBeauty.create = async raw => {
        if (!ZimiBeauty.isEnabled()) return null;
        const previous = __processors.find(handle => handle.raw === raw && !handle.destroyed);
        if (previous) return previous;
        const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
        const paint = canvas.getContext('2d'), output = canvas.captureStream(24);
        const handle = { raw, canvas, stream: new MediaStream([...output.getVideoTracks(), ...raw.getAudioTracks()]), destroyed: false, frames: 0,
          setEnabled(enabled) { raw.getVideoTracks().forEach(track => { track.enabled = enabled; }); output.getVideoTracks().forEach(track => { track.enabled = enabled; }); },
          destroy() { if (this.destroyed) return; this.destroyed = true; clearInterval(this.timer); output.getTracks().forEach(track => track.stop()); }
        };
        const draw = () => {
          const id = ZimiBeauty.getParams().filterId, color = __colorFor(id);
          paint.fillStyle = `rgb(${color.join(',')})`; paint.fillRect(0, 0, canvas.width, canvas.height);
          paint.fillStyle = '#fff'; paint.fillRect(handle.frames++ % canvas.width, canvas.height - 5, 4, 5);
          handle.filterId = id;
        };
        draw(); handle.timer = setInterval(draw, 40); __processors.push(handle); return handle;
      };
      window.__previewPixel = () => {
        const video = document.querySelector('video[data-zimi-local]');
        if (!video || video.readyState < 2) return [];
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const paint = canvas.getContext('2d'); paint.drawImage(video, 0, 0, 1, 1);
        return [...paint.getImageData(0, 0, 1, 1).data].slice(0, 3);
      };
    });
    await page.evaluate(async id => {
      await ZimiMedia.prepare(true);
      S.callId = '507f1f77bcf86cd799439099'; S.callRate = 0; S.mic = 1; S.cam = 1; S.scam = 1;
      go('call', id); Home.mediaStatus = 'Connected'; r();
      // Keep a beauty effect active when selecting Original, so changes within
      // the rail exercise one persistent processor rather than intentional off.
      ZimiBeauty.setParam('smoothing', .12); await ZimiMedia.refreshBeauty();
    }, creator.id);
    await page.waitForFunction(() => __processors.length === 1 && document.querySelector('video[data-zimi-local]')?.srcObject === __processors[0].stream && __previewPixel().length === 3);
    await button(page, 'Call options').click();
    await button(page, 'Beauty and filters').click();
    const rail = page.locator('[data-zimi-filter-rail]');
    const panel = page.locator('[data-zimi-beauty-panel]');
    const ids = await page.evaluate(() => ['', ...ZimiBeautyCatalog.FILTER_IDS]);
    assert.deepEqual(await rail.locator('[data-zimi-filter-id]').evaluateAll(nodes => nodes.map(node => node.dataset.zimiFilterId)), ids, 'The rail contains Original and the complete SDK filter order');
    assert.equal(await panel.evaluate(node => !!node.closest('[aria-modal="true"]')), false, 'Camera controls do not trap the call behind a modal');
    assert.equal(await page.locator('video[data-zimi-local]').count(), 1, 'The live preview enlarges the existing camera instead of cloning it');
    await page.evaluate(() => {
      const processor = __processors[0];
      window.__mounted = { stage: document.querySelector('.zr-call'), rail: document.querySelector('[data-zimi-filter-rail]'), video: document.querySelector('video[data-zimi-local]'), stream: processor.stream, raw: processor.raw, audio: processor.raw.getAudioTracks()[0], rawVideo: processor.raw.getVideoTracks()[0], output: processor.stream.getVideoTracks()[0], captures: __captures, frames: processor.frames };
      window.__renderCount = 0; window.__originalRender = r;
      r = function () { __renderCount++; return __originalRender.apply(this, arguments); };
    });
    async function selected(id) {
      await page.waitForFunction(id => {
        const chosen = document.querySelector('[data-zimi-filter-rail] [aria-pressed="true"]');
        return chosen?.dataset.zimiFilterId === id && ZimiBeauty.getParams().filterId === (id || null);
      }, id);
      await page.waitForFunction(() => {
        const rail = document.querySelector('[data-zimi-filter-rail]'), item = rail?.querySelector('[aria-pressed="true"]');
        if (!item) return false;
        const a = rail.getBoundingClientRect(), b = item.getBoundingClientRect();
        return Math.abs((b.left + b.width / 2) - (a.left + a.width / 2)) < 4;
      });
      assert.equal(await rail.locator('[aria-pressed="true"]').count(), 1, 'Exactly one filter is selected');
      assert.equal((await page.locator('[data-zimi-filter-name]').innerText()).trim(), await rail.locator('[aria-pressed="true"]').getAttribute('aria-label'), 'The current caption names the selected filter');
    }
    await selected('');
    await rail.locator('[data-zimi-filter-id="natural"]').tap();
    await selected('natural');
    await page.waitForFunction(() => __previewPixel().every((value, index) => Math.abs(value - __colorFor('natural')[index]) < 8));
    assert.equal(await panel.isVisible(), true, 'A tap changes live preview pixels while controls remain open');
    // Selecting the same filter should not restart processing or send another
    // request; the controller's sync calls the real media manager when changed.
    await page.evaluate(() => { window.__selectionWrites = 0; window.__oldSetParam = ZimiBeauty.setParam; ZimiBeauty.setParam = function (key) { if (key === 'filterId') __selectionWrites++; return __oldSetParam.apply(this, arguments); }; });
    await rail.locator('[data-zimi-filter-id="natural"]').tap();
    await selected('natural');
    assert.equal(await page.evaluate(() => __selectionWrites), 0, 'A repeated tap on the centered filter is a no-op');
    await page.evaluate(() => { ZimiBeauty.setParam = __oldSetParam; });

    async function key(value) {
      await rail.locator('[aria-pressed="true"]').focus();
      await page.keyboard.press(value);
    }
    await key('Home'); await selected('');
    await key('ArrowRight'); await selected(ids[1]);
    await key('End'); await selected(ids.at(-1));
    await key('ArrowRight'); await selected(ids.at(-1));
    await key('ArrowLeft'); await selected(ids.at(-2));
    await key('Home'); await selected('');
    await key('ArrowLeft'); await selected('');

    // Send genuine browser touch input, exercising native overflow and snap
    // rather than invoking the controller or assigning scrollLeft directly.
    const cdp = await context.newCDPSession(page);
    async function touchSwipe(direction) {
      const box = await rail.boundingBox(), start = box.x + box.width * (direction < 0 ? .8 : .2), end = box.x + box.width * (direction < 0 ? .2 : .8), y = box.y + box.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start, y }] });
      for (let step = 1; step <= 10; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start + (end - start) * step / 10, y }] });
        await page.waitForTimeout(25);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await touchSwipe(-1);
    await page.waitForFunction(() => ZimiBeauty.getParams().filterId !== null);
    const afterTouch = await page.evaluate(() => ZimiBeauty.getParams().filterId);
    await selected(afterTouch);
    assert.ok(ids.indexOf(afterTouch) > 0, 'A native swipe selects the filter snapped into the center');
    const box = await rail.boundingBox();
    await page.mouse.move(box.x + box.width * .8, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .2, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.waitForFunction(id => ZimiBeauty.getParams().filterId !== id, afterTouch);
    const afterDrag = await page.evaluate(() => ZimiBeauty.getParams().filterId);
    await selected(afterDrag);
    assert.ok(ids.indexOf(afterDrag) > ids.indexOf(afterTouch), 'Mouse dragging selects the next centered filter without an accidental click');

    // Production smooth centering crosses many unselected items. The settled
    // scroll handler must keep the explicit target instead of applying those
    // intermediate items as the rail animates past them.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), false);
    await rail.evaluate(node => {
      window.__normalWrites = []; window.__normalMoves = 0; window.__normalLastScroll = performance.now();
      window.__normalSetParam = ZimiBeauty.setParam;
      ZimiBeauty.setParam = function (key, value) { if (key === 'filterId') __normalWrites.push(value); return __normalSetParam.apply(this, arguments); };
      window.__normalScroll = () => { __normalMoves++; __normalLastScroll = performance.now(); };
      node.addEventListener('scroll', __normalScroll);
    });
    async function normalSelection(action, target, longJump = false) {
      await page.evaluate(() => { __normalWrites.length = 0; __normalMoves = 0; __normalLastScroll = performance.now(); });
      await action();
      await selected(target);
      await page.waitForFunction(() => performance.now() - __normalLastScroll > 220);
      await selected(target);
      assert.deepEqual(await page.evaluate(() => __normalWrites), [target || null], 'Smooth centering applies only the explicitly selected filter, once');
      if (longJump) assert.ok(await page.evaluate(() => __normalMoves > 1), 'The normal-motion case actually traversed multiple animation positions');
    }
    await normalSelection(() => key('End'), ids.at(-1), true);
    await normalSelection(() => key('Home'), '', true);
    await normalSelection(() => rail.locator(`[data-zimi-filter-id="${ids[1]}"]`).tap(), ids[1]);
    await rail.evaluate(node => { node.removeEventListener('scroll', __normalScroll); ZimiBeauty.setParam = __normalSetParam; });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(id => ZimiBeauty.choose('filterId', id), afterDrag);
    await selected(afterDrag);

    const strength = page.locator('[data-zimi-beauty-param="filterIntensity"]');
    await strength.evaluate(input => { input.value = '43'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.evaluate(() => ZimiBeauty.getParams().filterIntensity), .43, 'Filter strength remains adjustable with the live rail open');
    assert.deepEqual(await page.evaluate(() => ({ renders: __renderCount, stage: __mounted.stage === document.querySelector('.zr-call'), rail: __mounted.rail === document.querySelector('[data-zimi-filter-rail]'), video: __mounted.video === document.querySelector('video[data-zimi-local]'), stream: __mounted.video.srcObject === __mounted.stream, raw: __processors[0].raw === __mounted.raw, source: __mounted.raw.getVideoTracks()[0] === __mounted.rawVideo, audio: __processors[0].stream.getAudioTracks()[0] === __mounted.audio, output: __processors[0].stream.getVideoTracks()[0] === __mounted.output, captures: __captures - __mounted.captures, processors: __processors.length, live: [...__mounted.raw.getTracks(), __mounted.output].every(track => track.readyState === 'live'), fresh: __processors[0].frames > __mounted.frames })), { renders: 0, stage: true, rail: true, video: true, stream: true, raw: true, source: true, audio: true, output: true, captures: 0, processors: 1, live: true, fresh: true }, 'Swipe, tap, keyboard and strength preserve the mounted live camera, output and microphone');
    await page.evaluate(() => { r = __originalRender; });

    async function visiblePreview(name) {
      await page.waitForFunction(() => __previewPixel().every((value, index) => Math.abs(value - __colorFor(ZimiBeauty.getParams().filterId)[index]) < 8));
      const sample = await page.evaluate(() => {
        const video = document.querySelector('video[data-zimi-local]'), dock = document.querySelector('[data-zimi-beauty-panel]'), box = video.getBoundingClientRect(), bottom = dock.getBoundingClientRect().top;
        const scale = Math.min(box.width / video.videoWidth, box.height / video.videoHeight), height = video.videoHeight * scale;
        const y = box.top + (box.height - height) / 2 + height * .3, x = box.left + box.width / 2;
        const hit = document.elementFromPoint(x, y);
        return { x, y, color: __colorFor(ZimiBeauty.getParams().filterId), unobscured: x >= 0 && x < innerWidth && y >= 0 && y < bottom && video.parentElement.contains(hit), width: box.width, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
      });
      assert.equal(sample.overflow, false, 'The swipe rail scrolls without widening the phone document');
      assert.ok(sample.width >= (await page.viewportSize()).width * .7, 'The existing local camera is large enough to judge filters');
      assert.equal(sample.unobscured, true, 'Live camera pixels remain reachable above the dock without a modal backdrop');
      const image = PNG.sync.read(await page.screenshot({ path: path.join(artifacts, name + '.png') }));
      const offset = (Math.floor(sample.y) * image.width + Math.floor(sample.x)) * 4;
      const actual = [...image.data.subarray(offset, offset + 3)];
      assert.ok(actual.every((value, index) => Math.abs(value - sample.color[index]) < 25), `The open dock leaves the actual camera image visible: expected ${sample.color}, got ${actual}`);
    }
    for (const dark of [false, true]) {
      await page.evaluate(dark => ZimiThemes.setDark(dark), dark);
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
        await selected(afterDrag);
        await visiblePreview(`${dark ? 'dark' : 'light'}-${width}`);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await button(page, 'Close panel').click();
    assert.equal(await page.locator('.zb-previewing').count(), 0, 'Closing the dock restores the ordinary call layout');
    await button(page, 'Call options').click(); await button(page, 'Beauty and filters').click();
    await selected(afterDrag);
    assert.equal(await strength.inputValue(), '43', 'Reopening restores filter strength');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('zimi.beauty.v2')).filterId), afterDrag, 'The chosen SDK filter is persisted');
    await page.evaluate(() => ZimiMedia.stop());
    await page.reload(); await session();
    assert.equal(await page.evaluate(() => ZimiBeauty.getParams().filterId), afterDrag, 'A fresh document restores the selected filter');
    assert.equal(await page.evaluate(() => ZimiBeauty.getParams().filterIntensity), .43, 'A fresh document restores filter strength');
    assert.equal(await page.evaluate(() => __captures), 0, 'Restoring saved filters does not automatically start a camera');
    assert.equal(await page.evaluate(() => __sent.some(message => message.type === 'beauty.auth')), false, 'Restoring saved filters does not request a license before capture');
    assert.deepEqual(errors, [], 'No browser exceptions');
    await context.close();
    console.log('PASS Facebetter carousel: real touch swipe, mouse drag, tap/keyboard center selection, normal-motion smooth settling without intermediate filter writes, live synthetic preview pixels, stable media/audio/capture, responsive light/dark screenshots and persisted settings without automatic capture.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
