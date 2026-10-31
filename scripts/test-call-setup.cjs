/* The call setup uses local fake media devices and a mocked native transport.
   No real camera, remote participant, account, or network service is involved. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const setupSelector = '.zpc-setup';
const hostId = '507f1f77bcf86cd799439011';
const otherId = '507f1f77bcf86cd799439012';
const host = { id: hostId, name: '[Test] Sara', category: 'Fitness', tag: 'Fitness & good conversation', online: true, availableForCall: true, verified: true, ratePerMin: 0, entryFee: 0 };
const other = { ...host, id: otherId, name: 'Another creator' };
const account = { user: { id: '507f1f77bcf86cd799439019', name: 'Setup tester', role: 'sender', hostStatus: 'none', isVerifiedHost: false }, verification: 'none', requiresOnboarding: false };
const receive = (page, type, data) => page.evaluate(message => Native.receive(message), { type, data });
const sent = (page, type) => page.evaluate(type => __sent.filter(message => message.type === type), type);
const homeData = (person = host) => ({ hosts: [person, other], stage: [], featured: person, total: 2, page: 1, categories: ['Fitness'], availableCount: person.availableForCall ? 2 : 1 });
const button = (page, name) => page.getByRole('button', { name, exact: true });

// Model a WebView whose AudioContext starts suspended. Priming must unlock it
// without making sound, and a temporary constructor failure must be retryable.
function assertRingbackPriming() {
  const listeners = new Map(), events = new Map(), contexts = [], delayed = [];
  let blocked = false, oscillators = 0, resumes = 0;
  const gain = () => ({ value: 0, cancelScheduledValues() {}, setValueAtTime(value) { this.value = value; }, linearRampToValueAtTime(value) { this.value = value; } });
  class SuspendedAudio {
    constructor() { if (blocked) throw new Error('Audio output temporarily unavailable'); this.state = 'suspended'; this.currentTime = 0; this.destination = {}; contexts.push(this); }
    resume() { resumes++; this.state = 'running'; this.onstatechange?.(); return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    createGain() { return { gain: gain(), connect() {}, disconnect() {} }; }
    createOscillator() { return { frequency: { value: 0 }, connect() {}, start() { oscillators++; }, stop() {} }; }
  }
  const state = { v: 'precall', bgCall: null };
  const sandbox = { window: { AudioContext: SuspendedAudio }, S: state, document: { hidden: false, getElementById: () => null, addEventListener: (type, handler) => listeners.set(type, handler) }, Native: { on: (type, handler) => events.set(type, handler) }, performance: { now: () => 100 }, setInterval: () => 1, clearInterval() {}, setTimeout: handler => { delayed.push(handler); return delayed.length; }, clearTimeout() {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'web/call-ringback.js'), 'utf8'), sandbox);
  const ringing = sandbox.window.ZimiRingback;
  ringing.sync(); assert.equal(contexts.length, 0, 'Viewing setup does not acquire audio output');
  ringing.prime();
  assert.equal(resumes, 1, 'The explicit calling gesture resumes suspended audio before awaiting permission');
  assert.equal(oscillators, 0); assert.equal(ringing.playing(), false, 'Priming alone never rings during media preparation');
  ringing.release(); delayed.at(-1)();
  assert.equal(contexts[0].state, 'suspended', 'Cancelling before ringing releases the unused primed output');
  ringing.prime();
  state.v = 'dial'; ringing.sync();
  assert.equal(ringing.playing(), true); assert.equal(oscillators, 2, 'Entering the dial screen starts the shared double ringback');
  ringing.sync(); assert.equal(oscillators, 2, 'Redraws do not restart the ringback');
  ringing.release();
  assert.equal(contexts[0].state, 'running', 'Preparation cleanup cannot silence an active ringing call');
  state.bgCall = { view: 'dial' }; state.v = 'home'; ringing.sync(); assert.equal(ringing.playing(), true, 'A minimized call keeps ringing');
  events.get('app.background')(); assert.equal(ringing.playing(), false);
  events.get('app.foreground')(); assert.equal(ringing.playing(), true);
  state.bgCall = null; state.v = 'voice'; ringing.sync(); assert.equal(ringing.playing(), false, 'Answering the voice call stops ringback');
  const previousFade = delayed.at(-1);
  ringing.prime(); previousFade();
  assert.equal(contexts[0].state, 'running', 'An old ring fade cannot suspend a newer primed call awaiting media');
  contexts.at(-1).state = 'closed'; blocked = true; state.v = 'dial'; ringing.sync();
  assert.equal(ringing.playing(), false, 'Unavailable audio does not claim to be ringing');
  blocked = false; listeners.get('pointerup')();
  assert.equal(ringing.playing(), true, 'A new gesture retries temporarily unavailable audio');
  state.v = 'precall'; ringing.sync();
}

async function assertLayout(page, label) {
  const layout = await page.locator(setupSelector).evaluate(el => {
    const bounds = el.getBoundingClientRect(), app = document.querySelector('.app').getBoundingClientRect();
    const title = el.querySelector('h1'), back = el.querySelector('button[aria-label="Back"]');
    const theme = ztCurrent(), primary = el.querySelector('.zpc-primary'), selected = el.querySelector('.zpc-mode.selected');
    const color = value => { const swatch = document.createElement('span'); swatch.style.color = value; el.append(swatch); const result = getComputedStyle(swatch).color; swatch.remove(); return result; };
    const titleSize = innerWidth <= 360 ? 25 : innerHeight <= 740 ? 26 : innerWidth >= 600 ? 32 : 29;
    const visible = node => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return {
      widthOverflow: document.documentElement.scrollWidth > innerWidth + 1 || (!['hidden', 'clip'].includes(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 1),
      fillsApp: bounds.top <= app.top + 1 && bounds.bottom >= app.bottom - 1,
      titleColor: title && getComputedStyle(title).color,
      backColor: back && getComputedStyle(back).color,
      canvasColor: getComputedStyle(el).backgroundColor,
      expectedInk: color(ztDisplayColors(theme).text), expectedCanvas: color(ztDisplayColors(theme).background),
      expectedPrimary: color(ztDisplayColors(theme).primary), expectedPrimaryInk: color(ztDisplayColors(theme).primaryContrast),
      themeMode: window.ZimiThemes.dark() ? 'dark' : 'light', themeCanvas: ztDisplayColors(theme).background,
      nativeMode: document.documentElement.dataset.theme, nativeCanvas: document.documentElement.dataset.canvas,
      primaryDisabled: primary.disabled, primaryColor: getComputedStyle(primary).color,
      primaryBackground: getComputedStyle(primary).backgroundColor,
      selectedBorder: getComputedStyle(selected).borderTopColor,
      titleFont: getComputedStyle(title).fontFamily, primaryFont: getComputedStyle(primary).fontFamily,
      bodyFont: getComputedStyle(document.body).fontFamily,
      titleWeight: getComputedStyle(title).fontWeight, primaryWeight: getComputedStyle(primary).fontWeight,
      headingWeight: theme.typography.headingWeight,
      titleSize: parseFloat(getComputedStyle(title).fontSize), expectedTitleSize: titleSize * theme.typography.fontScale,
      titleVisible: !!title && visible(title), backVisible: !!back && visible(back),
      staleRoomClass: document.documentElement.classList.contains('zr-active'),
      navVisible: visible(document.getElementById('nav')),
      clippedButtons: [...el.querySelectorAll('button')].filter(visible).some(node => {
        const r = node.getBoundingClientRect();
        return r.left < bounds.left - 1 || r.right > bounds.right + 1;
      })
    };
  });
  assert.equal(layout.widthOverflow, false, `${label}: no horizontal overflow`);
  assert.equal(layout.fillsApp, true, `${label}: the setup fills the app instead of leaving a blank lower viewport`);
  assert.equal(layout.titleVisible && layout.backVisible, true, `${label}: identity and Back are present`);
  assert.equal(layout.titleColor, layout.expectedInk, `${label}: title uses the app text color`);
  assert.equal(layout.backColor, layout.expectedInk, `${label}: Back uses the app text color`);
  assert.equal(layout.canvasColor, layout.expectedCanvas, `${label}: setup uses the app canvas (white, or black in Dark Mode)`);
  assert.equal(layout.nativeMode, layout.themeMode, `${label}: native status-bar mode follows Dark Mode`);
  assert.equal(layout.nativeCanvas, layout.themeCanvas, `${label}: native safe-area canvas follows the app canvas`);
  assert.equal(layout.selectedBorder, layout.expectedPrimary, `${label}: selected call mode uses the theme accent`);
  if (!layout.primaryDisabled) {
    assert.equal(layout.primaryBackground, layout.expectedPrimary, `${label}: CTA follows selected primary color`);
    assert.equal(layout.primaryColor, layout.expectedPrimaryInk, `${label}: CTA follows selected contrast color`);
  }
  assert.equal(layout.titleFont, layout.bodyFont, `${label}: title inherits the selected typeface`);
  assert.equal(layout.primaryFont, layout.bodyFont, `${label}: CTA inherits the selected typeface`);
  assert.equal(layout.titleWeight, layout.headingWeight, `${label}: title follows selected heading weight`);
  assert.equal(layout.primaryWeight, layout.headingWeight, `${label}: CTA follows selected heading weight`);
  assert.ok(Math.abs(layout.titleSize - layout.expectedTitleSize) < .02, `${label}: title follows selected font scale`);
  assert.equal(layout.staleRoomClass, false, `${label}: leaving a live room clears room-only layout styles`);
  assert.equal(layout.navVisible, false, `${label}: setup hides the tab bar`);
  assert.equal(layout.clippedButtons, false, `${label}: controls stay inside the setup`);
}

(async () => {
  assertRingbackPriming();
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  async function open(preview = '') {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => {
      window.__sent = [];
      window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) };
      window.__media = { mode: 'auto', requests: [], tracks: [] };
      const acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async constraints => {
        const request = { constraints, mode: __media.mode };
        __media.requests.push(request);
        if (request.mode === 'deny') throw new DOMException('Permission denied by the test', 'NotAllowedError');
        const stream = await acquire(constraints);
        request.tracks = stream.getTracks();
        __media.tracks.push(...request.tracks);
        if (request.mode === 'defer') await new Promise(resolve => { request.release = resolve; });
        return stream;
      };
    });
    const file = preview ? 'dist/index.html' : 'assets/aurora.html';
    await page.goto(pathToFileURL(path.join(root, file)).href + '?role=sender' + (preview ? '&preview=' + preview : ''));
    if (!preview) {
      await receive(page, 'session', account);
      await receive(page, 'data.home', homeData());
      await receive(page, 'wallet.balance', { coins: 0 });
      await page.evaluate(id => go('precall', id), hostId);
    }
    await page.locator(setupSelector).waitFor();
    await page.evaluate(() => document.fonts.ready);
    return page;
  }
  async function startPending(page) {
    const count = await page.evaluate(() => __media.requests.length);
    await page.evaluate(() => { __media.mode = 'defer'; });
    await button(page, 'Video call').click();
    await button(page, 'Start video call').click();
    await page.waitForFunction(index => !!__media.requests[index]?.release, count);
    return count;
  }
  async function release(page, index) {
    await page.evaluate(index => __media.requests[index].release(), index);
    await page.waitForFunction(index => __media.requests[index].tracks.every(track => track.readyState === 'ended'), index);
  }
  try {
    const preview = await open('precall');
    await assertLayout(preview, 'available preview');
    await preview.screenshot({ path: path.join(root, 'call-setup-preview.png') });
    assert.equal(await preview.evaluate(() => __media.requests.length), 0, 'Viewing the preview never opens capture');
    const offline = await open('precall-offline');
    await assertLayout(offline, 'unavailable preview');
    await offline.screenshot({ path: path.join(root, 'call-setup-unavailable.png') });

    const page = await open();
    for (const theme of ['dark', 'light', 'custom']) {
      await page.evaluate(mode => {
        const base = mode === 'dark' ? ZThemeOriginal : ZThemeRose;
        const theme = mode === 'custom' ? { ...base, id: 'setup-custom-theme', colors: { ...base.colors, background: '#f3f2fc', surface: '#fffcff', surfaceElevated: '#e5def3', text: '#12132c', textMuted: '#615879', primary: '#6543b8', primaryContrast: '#f4ecff', secondary: '#4e2f94', border: '#c6b8de' }, typography: { fontFamily: 'mono', fontScale: 1.1, fontWeight: '500', headingWeight: '800' } } : base;
        Native.receive({ type: 'data.themes', data: { items: [theme], selectedThemeId: theme.id } });
        window.ZimiThemes.setDark(mode === 'dark');
        r();
      }, theme);
      for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 693 }, { width: 390, height: 844 }, { width: 1280, height: 900 }]) {
        await page.setViewportSize(viewport);
        await assertLayout(page, `${theme} ${viewport.width}x${viewport.height}`);
        if (theme !== 'dark' && viewport.width === 390 && viewport.height === 844) {
          const screenshot = path.join(os.tmpdir(), `zimi-call-setup-${theme}.png`);
          await page.screenshot({ path: screenshot });
          console.log(`Theme screenshot: ${screenshot}`);
        }
      }
    }
    await page.setViewportSize({ width: 320, height: 640 });
    await receive(page, 'data.home', homeData({ ...host, gender: 'female', name: 'Sara Alexandra AVeryLongUnbrokenCreatorNameThatMustNotOverflowTheScreen', tag: 'Fitness, wellbeing, and a thoughtful conversation about everything you love' }));
    await assertLayout(page, 'long name and no photo');
    assert.equal(await page.locator(`${setupSelector} img`).count(), 0, 'A creator without a photo shows no broken image');
    assert.equal(await page.locator(`${setupSelector} .zpc-avatar .zf-face`).getAttribute('data-face'), 'female', 'A creator without a photo gets the illustration for her chosen gender');
    await receive(page, 'data.home', homeData({ ...host, gender: 'male', avatarUrl: 'https://media.example.test/expired.jpg' }));
    await page.locator(`${setupSelector} .zpc-avatar .zf-face`).waitFor();
    assert.equal(await page.locator(`${setupSelector} .zpc-avatar .zf-face`).getAttribute('data-face'), 'male', 'A photo that fails to load becomes the matching illustration');
    assert.equal(await page.locator(`${setupSelector} .zpc-avatar img`).count(), 0, 'No broken image remains');
    await receive(page, 'data.home', homeData({ ...host, name: 'Sara <img src=x onerror=alert(1)>' }));
    assert.equal(await page.locator(`${setupSelector} img[onerror], ${setupSelector} script`).count(), 0, 'Creator content is escaped');
    assert.match(await page.locator(`${setupSelector} h1`).innerText(), /<img src=x/);
    await receive(page, 'data.home', homeData());
    await page.setViewportSize({ width: 390, height: 844 });

    await page.evaluate(id => go('live', id), hostId);
    assert.equal(await page.evaluate(() => S.v), 'precall', 'Paused streaming cannot replace call setup');
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('zr-active')), false);
    await assertLayout(page, 'after blocked stream route');

    await button(page, 'Voice call').click();
    assert.equal(await button(page, 'Start voice call').isVisible(), true);
    await button(page, 'Video call').click();
    assert.equal(await page.evaluate(() => __media.requests.length), 0, 'Choosing video or voice never captures before Start');
    assert.equal((await sent(page, 'call.start')).length, 0);

    await page.evaluate(() => {
      window.__ringPriming = [];
      const prime = ZimiRingback.prime;
      ZimiRingback.prime = () => { __ringPriming.push({ requests: __media.requests.length, view: S.v }); return prime(); };
    });
    const cancelled = await startPending(page);
    assert.equal(await page.evaluate(() => Home.preparingCall), true);
    assert.equal(await page.evaluate(() => __ringPriming[0]?.requests), cancelled, 'Audio is primed before the media permission request starts');
    assert.equal(await page.evaluate(() => ZimiRingback.playing()), false, 'Pending media permission remains silent');
    assert.equal(await button(page, 'Cancel preparation').isVisible(), true, 'Pending device access always has a cancel action');
    assert.equal(await page.getByRole('status', { name: 'Preparing video call', exact: true }).isVisible(), true);
    await assertLayout(page, 'pending camera access');
    await button(page, 'Cancel preparation').click();
    await release(page, cancelled);
    assert.equal(await page.evaluate(() => Home.preparingCall), false);
    assert.equal(await page.evaluate(() => S.v), 'precall');
    assert.equal((await sent(page, 'call.start')).length, 0, 'Late permission after cancellation cannot place a call');

    await page.evaluate(() => { __media.mode = 'deny'; });
    await button(page, 'Start video call').click();
    await page.getByRole('alert').filter({ hasText: /denied|settings/i }).first().waitFor();
    assert.equal(await page.evaluate(() => Home.preparingCall), false, 'A permission failure releases the pending state');
    await assertLayout(page, 'permission error');
    await page.evaluate(() => { __media.mode = 'auto'; });
    await button(page, 'Start video call').click();
    await page.waitForFunction(() => __sent.some(message => message.type === 'call.start'));
    assert.deepEqual((await sent(page, 'call.start')).at(-1).data, { to: hostId, voice: false });
    assert.equal(await page.evaluate(() => __media.requests.at(-1).constraints.video !== false), true);
    assert.equal(await page.evaluate(() => __media.tracks.filter(track => track.readyState === 'live').length), 2);
    // While the call rings, the caller hears ringback over their own camera: full screen,
    // mirrored like a mirror, with straight edges and flip, camera and mute beside Cancel.
    assert.equal(await page.evaluate(() => ZimiRingback.playing()), true, 'Ringback plays while the video call rings');
    await page.waitForFunction(() => { const video = document.querySelector('.ringscr.dial.is-video .ringbg video[data-zimi-local]'); return video?.videoWidth > 0 && !video.paused; });
    const selfView = await page.evaluate(() => {
      const video = document.querySelector('.ringscr.dial video[data-zimi-local]'), box = video.getBoundingClientRect(), style = getComputedStyle(video);
      return { live: video.srcObject.getVideoTracks().some(track => track.readyState === 'live' && track.enabled), fills: box.width >= innerWidth && box.height >= innerHeight, mirrored: style.transform === 'matrix(-1, 0, 0, 1, 0, 0)', corners: style.borderRadius };
    });
    assert.deepEqual(selfView, { live: true, fills: true, mirrored: true, corners: '0px' }, 'The caller sees their own camera full screen while it rings');
    assert.deepEqual(await page.locator('.ringscr.dial .dialtool').evaluateAll(tools => tools.map(tool => tool.getAttribute('aria-label'))), ['Flip camera', 'Turn camera off', 'Mute microphone']);
    await button(page, 'Turn camera off').click();
    assert.equal(await page.locator('.ringscr.dial.is-video').count(), 0, 'Turning the camera off leaves the calling screen without the preview');
    assert.equal(await page.evaluate(() => __media.tracks.some(track => track.kind === 'video' && track.readyState === 'live' && track.enabled)), false, 'The camera is off for the call too');
    assert.match(await page.locator('.ringscr.dial .ringeye').innerText(), /video call/i);
    await button(page, 'Turn camera on').click();
    await page.locator('.ringscr.dial.is-video').waitFor();
    await button(page, 'Cancel call').click();
    await page.waitForFunction(() => __media.tracks.every(track => track.readyState === 'ended'));
    assert.equal(await page.evaluate(() => ZimiRingback.playing()), false, 'Cancelling silences the ringback');
    await button(page, 'Voice call').click();
    await button(page, 'Start voice call').click();
    await page.waitForFunction(() => __sent.filter(message => message.type === 'call.start').length === 2);
    assert.deepEqual((await sent(page, 'call.start')).at(-1).data, { to: hostId, voice: true });
    assert.equal(await page.evaluate(() => __media.requests.at(-1).constraints.video), false, 'Voice requests microphone only');
    assert.equal(await page.evaluate(() => __media.tracks.filter(track => track.readyState === 'live' && track.kind === 'video').length), 0);
    assert.match(await page.locator('.ringscr.dial .ringeye').innerText(), /voice call/i);
    assert.equal(await page.locator('.ringscr.dial.is-voice').count(), 1, 'Voice uses its own calling layout');
    assert.equal(await page.locator('#app-notice').count(), 0, 'A successful retry removes the old permission error from the calling controls');
    assert.equal(await page.locator('.ringscr.dial video').count(), 0, 'A voice call rings without opening a camera preview');
    assert.deepEqual(await page.locator('.ringscr.dial .dialtool').evaluateAll(tools => tools.map(tool => tool.getAttribute('aria-label'))), ['Mute microphone'], 'Voice ringing exposes its microphone without camera controls');
    assert.equal(await page.evaluate(() => ZimiRingback.playing()), true, 'Voice calls use the same audible ringback as video');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      const geometry = await page.locator('.ringscr.dial.is-voice').evaluate(dial => {
        const bounds = node => { const r = node.getBoundingClientRect(); return { label: node.getAttribute('aria-label') || node.className || node.tagName, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
        const items = [...dial.querySelectorAll('.ringeye,.ringorb,h2,.dialstatus,.ringact>.rbtn')].map(bounds);
        return { items, outside: items.filter(r => r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1), horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1 || dial.scrollWidth > dial.clientWidth + 1,
          ripple: getComputedStyle(dial.querySelector('.ringorb'), '::before').animationName, dots: getComputedStyle(dial.querySelector('.dialdots i')).animationName };
      });
      assert.equal(geometry.horizontalOverflow, false, `Voice ringing ${viewport.width}x${viewport.height} has no horizontal overflow`);
      assert.deepEqual(geometry.outside, [], `Voice ringing ${viewport.width}x${viewport.height} keeps identity and controls inside the viewport: ${JSON.stringify(geometry.items)}`);
      assert.equal(geometry.ripple, 'dial-ripple', 'The voice avatar rings like the video caller when motion is enabled');
      assert.equal(geometry.dots, 'dial-dot', 'Calling dots share the video ring animation');
      if (viewport.width === 390) {
        const destination = path.join(root, 'artifacts', 'voice-call'); fs.mkdirSync(destination, { recursive: true });
        await page.screenshot({ path: path.join(destination, 'dial-light-390.png') });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await button(page, 'Mute microphone').click();
    assert.equal(await page.evaluate(() => S.mic), 0, 'Microphone can be muted while the voice call rings');
    assert.equal(await page.evaluate(() => __media.tracks.filter(track => track.kind === 'audio' && track.readyState === 'live').every(track => !track.enabled)), true, 'Muting during voice ringing disables the live microphone track');
    await button(page, 'Unmute microphone').click();
    assert.equal(await page.evaluate(() => __media.tracks.filter(track => track.kind === 'audio' && track.readyState === 'live').every(track => track.enabled)), true, 'Unmuting restores the microphone while ringing');
    await receive(page, 'app.background', {});
    assert.equal(await page.evaluate(() => ZimiRingback.playing()), false, 'Ringback stops when the app leaves the foreground');
    await receive(page, 'app.foreground', {});
    assert.equal(await page.evaluate(() => ZimiRingback.playing()), true, 'Ringback resumes while the call still rings');
    await button(page, 'Cancel call').click();

    const left = await startPending(page);
    await button(page, 'Back').click();
    await page.evaluate(id => go('precall', id), hostId);
    await release(page, left);
    assert.equal(await page.evaluate(() => S.v), 'precall');
    assert.equal((await sent(page, 'call.start')).length, 2, 'Leaving and returning to the same creator cannot revive a stale request');

    const replaced = await startPending(page);
    await page.evaluate(id => go('precall', id), otherId);
    await page.evaluate(() => { __media.mode = 'auto'; });
    await button(page, 'Start video call').click();
    await page.waitForFunction(() => __sent.filter(message => message.type === 'call.start').length === 3);
    await release(page, replaced);
    assert.deepEqual((await sent(page, 'call.start')).at(-1).data, { to: otherId, voice: false }, 'A new creator is the only target of the replacement request');
    assert.equal(await page.evaluate(() => __media.requests.at(-1).tracks.every(track => track.readyState === 'live')), true, 'Late cleanup cannot stop the newer call media');
    await button(page, 'Cancel call').click();
    await page.evaluate(id => go('precall', id), hostId);

    const availabilityChanged = await startPending(page);
    await receive(page, 'data.home', homeData({ ...host, availableForCall: false, online: true }));
    await page.evaluate(index => __media.requests[index].release(), availabilityChanged);
    await page.waitForFunction(() => __sent.filter(message => message.type === 'call.start').length === 4);
    assert.equal((await sent(page, 'call.start')).at(-1).data.to, hostId, 'An approved host turning availability off does not cancel a member call');
    await button(page, 'Cancel call').click();
    await receive(page, 'data.home', homeData());
    assert.equal(await button(page, 'Start video call').isEnabled(), true, 'Availability refresh updates the open setup');
    await receive(page, 'data.home', homeData({ ...host, availableForCall: false, online: false }));
    assert.equal(await button(page, 'Start video call').isEnabled(), true, 'An offline creator is still shown ready; the server rings until the call is missed');
    assert.doesNotMatch(await page.locator('.zpc-presence').innerText(), /offline|unavailable/i);
    await receive(page, 'data.home', homeData());
    await receive(page, 'data.hosts', { hosts: [host, other] });
    assert.equal(await button(page, 'Start video call').isEnabled(), true, 'A creator list update preserves server availability');
    await receive(page, 'data.hosts', { hosts: [{ ...host, availableForCall: false }, other] });
    assert.equal(await button(page, 'Start video call').isEnabled(), true, 'Availability off never disables manual calls to approved hosts');
    await button(page, 'Back').click();
    await page.locator(`.zh-creator-card[data-host-id="${hostId}"] .zh-creator-call`).click();
    assert.equal(await page.evaluate(() => S.v), 'precall', 'The Home card opens setup even with availability off');
    assert.equal(await button(page, 'Start video call').isEnabled(), true);
    assert.equal(await page.evaluate(() => __media.tracks.every(track => track.readyState === 'ended')), true);
    assert.deepEqual(errors, [], 'All setup states run without uncaught browser errors');
    console.log('PASS: themed call setup, explicit media consent, cancellation and late cleanup, permission retry, video/voice payloads, ringback, creator changes, offline and availability-off host calls.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
