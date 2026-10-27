// Host video previews on discovery cards: nothing loads before a card is in view, one video plays
// at a time, a redraw keeps the same playing element, leaving the screen pauses it, and Data Saver
// or reduced motion keep the photo.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const account = { user: { id: '507f1f77bcf86cd799439019', name: 'Member', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false, isPhoneVerified: true }, balance: 500, verification: 'none', requiresOnboarding: false };
const id = n => `507f1f77bcf86cd7994390${10 + n}`;
const host = (n, video = true) => ({ id: id(n), name: `Host ${n}`, role: 'host', serverRole: 'host', category: 'Talk', online: true, verified: true, availableForCall: true, ratePerMin: 10, entryFee: 0, previewVideoUrl: video ? `https://media.example.test/video-${n}.webm` : null });
const hosts = [host(0), host(1, false), host(2), host(3), host(4)];
const feed = { hosts, stage: [], featured: hosts[0], total: hosts.length, page: 1, limit: 20, categories: ['Talk'], broadcasterCount: 0, availableCount: hosts.length, speedMatchEnabled: false, bonus: null, unreadCount: 0 };

// A short real clip, recorded from a canvas so the test needs no media files.
async function recordClip(browser) {
  const page = await browser.newPage();
  const base64 = await page.evaluate(async () => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 160, height: 200 });
    const context = canvas.getContext('2d'), recorder = new MediaRecorder(canvas.captureStream(25), { mimeType: 'video/webm;codecs=vp8' });
    const chunks = []; recorder.ondataavailable = event => chunks.push(event.data);
    const stopped = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.start();
    for (let frame = 0; frame < 40; frame++) { context.fillStyle = `hsl(${frame * 9} 70% 50%)`; context.fillRect(0, 0, 160, 200); await new Promise(resolve => setTimeout(resolve, 40)); }
    recorder.stop(); await stopped;
    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
    let binary = ''; bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  });
  await page.close();
  return Buffer.from(base64, 'base64');
}

async function open(browser, clip, { reducedMotion = 'no-preference', saveData = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion });
  const requests = [];
  await page.route('https://**/*', route => {
    const url = route.request().url();
    if (!url.includes('/video-')) return route.abort();
    requests.push(url);
    return route.fulfill({ body: clip, contentType: 'video/webm' });
  });
  await page.addInitScript(saveData => {
    window.__sent = []; window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) };
    if (saveData) Object.defineProperty(navigator, 'connection', { value: { saveData: true, effectiveType: '4g', addEventListener() {} } });
  }, saveData);
  await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href + '?role=sender');
  await page.evaluate(account => Native.receive({ type: 'session', data: account }), account);
  await page.evaluate(feed => Native.receive({ type: 'data.home', data: feed }), feed);
  return { page, requests };
}
const playing = page => page.evaluate(() => [...document.querySelectorAll('.zh-card-video video')].filter(video => !video.paused).map(video => video.parentElement.dataset.video));

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  try {
    const clip = await recordClip(browser);
    const { page, requests } = await open(browser, clip);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.locator('.zh-featured-host .zh-card-video.is-playing').waitFor({ timeout: 8000 });
    assert.deepEqual(await playing(page), ['https://media.example.test/video-0.webm'], 'Only the card most in view plays');
    assert.ok(requests.every(url => url.endsWith('/video-0.webm')), 'Cards below the fold download nothing');
    assert.equal(await page.locator(`[data-host-id="${id(1)}"] .zh-card-video`).count(), 0, 'A host without a video keeps only the photo');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('.zh-grid .zh-card-video video')].filter(video => video.getAttribute('src')).length), 0);
    assert.deepEqual(await page.evaluate(() => { const video = document.querySelector('.zh-card-video video'); return [video.muted, video.loop, video.playsInline]; }), [true, true, true]);

    await page.evaluate(() => { window.__video = document.querySelector('.zh-featured-host .zh-card-video video'); r(); });
    assert.equal(await page.evaluate(() => document.querySelector('.zh-featured-host .zh-card-video video') === window.__video && !window.__video.paused), true, 'A redraw keeps the same playing video');
    const loads = requests.length;

    await page.evaluate(id => document.querySelector(`[data-host-id="${id}"]`).scrollIntoView({ block: 'center' }), id(3));
    await page.locator(`[data-host-id="${id(3)}"] .zh-card-video.is-playing`).waitFor({ timeout: 8000 });
    assert.deepEqual(await playing(page), ['https://media.example.test/video-3.webm'], 'Scrolling hands playback to the next card');
    assert.equal(await page.evaluate(() => window.__video.paused), true);
    assert.ok(requests.length > loads, 'The next card loads only once it is in view');

    await page.evaluate(() => go('explore'));
    await page.locator('.zh-tile .zh-card-video.is-playing').first().waitFor({ timeout: 8000 });
    assert.equal((await playing(page)).length, 1, 'Explore tiles preview one video at a time too');

    await page.evaluate(() => go('chats'));
    assert.deepEqual(await playing(page), [], 'Leaving discovery stops playback');
    assert.deepEqual(errors, [], 'No browser exceptions');

    for (const options of [{ reducedMotion: 'reduce' }, { saveData: true }]) {
      const quiet = await open(browser, clip, options);
      await quiet.page.waitForTimeout(1200);
      assert.deepEqual([quiet.requests, await playing(quiet.page)], [[], []], `${JSON.stringify(options)} keeps the photo`);
      await quiet.page.close();
    }
    console.log('PASS card video: lazy loading, one playing card, redraw reuse, scroll handoff, Explore tiles, pause on leave, Data Saver and reduced motion');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
