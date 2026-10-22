/* Browser contracts for sponsored cards: free members only, counted views and taps, stable redraws. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const user = { user: { id: '507f1f77bcf86cd799439011', name: 'Ad tester', role: 'sender', hostStatus: 'none', isVerifiedHost: false }, verification: 'none', requiresOnboarding: false };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const banner = { id: '6a0000000000000000000001', format: 'banner', advertiser: 'Zimi Studio', headline: 'Edit reels in seconds', body: 'Templates and captions. Free on Android.', ctaLabel: 'Install now', domain: 'play.google.com', mediaUrl: 'https://media.example.test/ads/banner.png', mediaType: 'image/png', logoUrl: '', placements: ['home', 'explore', 'chats', 'call_summary'] };
const video = { ...banner, id: '6a0000000000000000000002', format: 'video', advertiser: 'Zimi Music', headline: 'Your songs. Every mood.', body: '', ctaLabel: 'Listen now', domain: 'music.example', mediaUrl: 'https://media.example.test/ads/promo.mp4', mediaType: 'video/mp4', placements: ['home'] };
const catalog = premium => ({ selectedThemeId: '000000000000000000000001', premium: { active: premium, pricePaise: 19900, currency: 'INR', paymentsAvailable: true, purchaseType: 'lifetime' },
  items: [{ id: '000000000000000000000001', name: 'Zimi Original', description: '', mode: 'dark', active: true, isPremium: false, isDefault: true,
    colors: { background: '#210f1d', surface: '#321e2c', surfaceElevated: '#3c2635', text: '#fce8f2', textMuted: '#c5a9bc', primary: '#c9086a', primaryContrast: '#ffffff', secondary: '#ff9ccc', border: '#654356', success: '#45d5a0', danger: '#ffb2b9' },
    typography: { fontFamily: 'system', fontScale: 1, fontWeight: '400', headingWeight: '700' } }] });
const receive = (page, type, data) => page.evaluate(message => Native.receive(message), { type, data });
const sent = (page, type) => page.evaluate(type => __sent.filter(message => message.type === type).map(message => message.data), type);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const settled = { hosts: [], stage: [], featured: null, total: 0, page: 1 };
// Open a view with its own content loaded, so a missing ad is never just a loading screen.
async function show(page, view) {
  await page.evaluate(view => go(view), view);
  if (['home', 'explore'].includes(view)) await receive(page, 'data.home', settled);
  await page.locator(view === 'chats' ? '.zc-conversations' : '.zh-home').waitFor();
  // The chats banner does not depend on the conversation list, which may still be loading.
  if (view !== 'chats') assert.equal(await page.locator('.zh-skeleton').count(), 0, `${view} content has settled`);
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  async function open({ demo = false, reducedMotion = 'no-preference', items = [banner, video] } = {}) {
    const page = await browser.newPage({ viewport: { width: 360, height: 707 }, reducedMotion });
    page.setDefaultTimeout(5000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => {
      const url = route.request().url();
      if (url.endsWith('.png')) return route.fulfill({ status: 200, contentType: 'image/png', body: png });
      return route.abort();
    });
    await page.addInitScript(() => {
      window.__sent = []; window.__plays = 0;
      window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) };
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () { window.__plays++; return play.call(this); };
    });
    await page.goto(pathToFileURL(path.join(root, demo ? 'dist/index.html' : 'assets/aurora.html')).href + '?role=sender');
    if (!demo) {
      await receive(page, 'session', user);
      // Home shows its ad only beside settled content, never above loading placeholders.
      await page.evaluate(() => go('home'));
      await receive(page, 'data.ads', { adFree: false, items });
      assert.equal(await page.locator('[data-za-slot]').count(), 0, 'No ad above loading placeholders');
      await receive(page, 'data.home', { hosts: [], stage: [], featured: null, total: 0, page: 1 });
    } else await page.evaluate(() => go('home'));
    return page;
  }
  try {
    fs.mkdirSync(artifacts, { recursive: true });
    const page = await open();
    const card = page.locator('.za-card');
    await card.waitFor();
    assert.equal(await card.getAttribute('data-za-id'), banner.id, 'The first visit shows the highest ranked campaign');
    assert.match(await card.innerText(), /Zimi Studio[\s\S]*Sponsored[\s\S]*Edit reels in seconds[\s\S]*play\.google\.com[\s\S]*Install now/);
    assert.equal(await page.getByRole('button', { name: 'Install now: Zimi Studio, sponsored', exact: true }).count(), 1);
    assert.equal(await page.locator('.za-media').getAttribute('aria-hidden'), 'true', 'The decorative media leaves the action to the labelled button');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await card.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => __sent.some(message => message.type === 'ads.impression'), null, { timeout: 4000 });
    assert.deepEqual(await sent(page, 'ads.impression'), [{ id: banner.id, placement: 'home' }]);
    await receive(page, 'data.home', { hosts: [], stage: [], featured: null, total: 0, page: 1 });
    await wait(1400);
    assert.equal((await sent(page, 'ads.impression')).length, 1, 'A redraw is not a second view');
    assert.equal(await card.getAttribute('data-za-id'), banner.id, 'A redraw keeps the same campaign');
    await page.screenshot({ path: path.join(artifacts, 'ads-home-mobile.png') });
    console.log('PASS labelled sponsored card, one counted view per visit, stable through redraws');

    await page.evaluate(() => { go('profile'); go('home'); });
    await card.waitFor();
    assert.equal(await card.getAttribute('data-za-id'), video.id, 'The next visit rotates to the next campaign');
    const element = await page.evaluate(() => { window.__video = document.querySelector('.za-video'); return !!window.__video; });
    assert.equal(element, true, 'The video is mounted into its card');
    await page.evaluate(() => r());
    assert.equal(await page.evaluate(() => document.querySelector('.za-video') === window.__video), true, 'Redraws move the same video element instead of restarting it');
    await card.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => __plays > 0, null, { timeout: 3000 });
    const sound = page.getByRole('button', { name: 'Turn sound on', exact: true });
    assert.equal(await page.getByRole('button', { name: /^(Play|Pause) video$/ }).count(), 1, 'Moving video always offers a pause control');
    await sound.click();
    assert.equal(await page.evaluate(() => window.__video.muted), false);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Turn sound off', 'The sound control keeps focus and updates its label');
    await page.waitForFunction(id => __sent.some(message => message.type === 'ads.impression' && message.data.id === id), video.id, { timeout: 4000 });
    console.log('PASS rotation per visit, persistent muted video with pause and sound controls');

    await page.getByRole('button', { name: 'Listen now: Zimi Music, sponsored', exact: true }).click();
    assert.deepEqual(await sent(page, 'ads.click'), [{ id: video.id, placement: 'home' }]);
    const cta = page.locator('.za-card .za-cta');
    assert.equal(await cta.isDisabled(), true); assert.equal(await cta.innerText(), 'Opening…');
    await cta.click({ force: true }).catch(() => {});
    assert.equal((await sent(page, 'ads.click')).length, 1, 'One tap at a time');
    await receive(page, 'ads.opened', { id: video.id });
    assert.equal(await cta.isDisabled(), false); assert.equal(await cta.innerText(), 'Listen now');
    await cta.click();
    await receive(page, 'operation.error', { action: 'ads.click', id: video.id, message: 'This promotion has ended.' });
    assert.equal(await cta.isDisabled(), false);
    assert.equal(await page.locator('#app-notice').innerText(), 'This promotion has ended.');
    await receive(page, 'ads.retired', { id: video.id });
    assert.equal(await card.getAttribute('data-za-id'), video.id, 'A retired campaign finishes its current visit');
    await page.evaluate(() => { go('profile'); go('home'); });
    assert.equal(await card.getAttribute('data-za-id'), banner.id, 'A retired campaign leaves rotation');
    console.log('PASS taps go through the app, busy and error states recover, retired campaigns leave rotation');

    await page.getByRole('button', { name: 'About this ad', exact: true }).click();
    await page.locator('#za-about[open]').waitFor();
    assert.match(await page.locator('#za-about').innerText(), /Zimi Studio[\s\S]*play\.google\.com[\s\S]*free plan/);
    await receive(page, 'app.back', {});
    await page.locator('#za-about').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => S.v), 'home', 'Back closes the dialog without leaving Home');
    await page.getByRole('button', { name: 'About this ad', exact: true }).click();
    await page.getByRole('button', { name: 'Go ad-free with Premium', exact: true }).click();
    assert.equal(await page.evaluate(() => S.v), 'themes');
    console.log('PASS about dialog explains the ad, closes with back and leads to premium');

    for (const [view, selector] of [['explore', '.za-card[data-za-slot="explore"]'], ['chats', '.za-banner[data-za-slot="chats"]']]) {
      await page.evaluate(view => go(view), view);
      if (view === 'explore') {
        assert.equal(await page.locator(selector).count(), 0, 'Explore waits for its own results before showing an ad');
        await receive(page, 'data.home', { hosts: [], stage: [], featured: null, total: 0, page: 1 });
      }
      await page.locator(selector).waitFor();
      for (const width of [320, 360, 390]) {
        await page.setViewportSize({ width, height: 707 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${view} fits ${width}px`);
        const box = await page.locator(selector).boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width + 0.5, `${view} ad fits ${width}px`);
      }
      await page.setViewportSize({ width: 360, height: 707 });
      await page.screenshot({ path: path.join(artifacts, `ads-${view}-mobile.png`) });
    }
    await page.evaluate(() => { S.sum = { sec: 95, rate: 0, coins: 0, k: 'member' }; go('summary'); });
    await page.locator('.zh-summary .za-card[data-za-slot="call_summary"]').waitFor();
    assert.ok(await page.evaluate(() => document.querySelector('.zh-summary .za-card').compareDocumentPosition(document.querySelector('.zh-summary .zh-primary')) & Node.DOCUMENT_POSITION_PRECEDING), 'The call summary keeps its actions above the ad');
    console.log('PASS explore card, chats banner and call summary card fit 320-390px');

    await show(page, 'home');
    assert.equal(await page.locator('[data-za-slot]').count(), 1, 'A free member sees the Home ad');
    await receive(page, 'data.themes', catalog(true));
    await show(page, 'home');
    assert.equal(await page.locator('[data-za-slot]').count(), 0, 'Premium hides ads as soon as it is confirmed');
    await receive(page, 'data.themes', catalog(false));
    await receive(page, 'data.ads', { adFree: true, items: [] });
    for (const view of ['home', 'explore', 'chats']) {
      await show(page, view);
      assert.equal(await page.locator('[data-za-slot]').count(), 0, `An ad-free member sees no ads on ${view}`);
    }
    console.log('PASS premium and ad-free members never see ads');

    await receive(page, 'data.ads', { adFree: false, items: [
      { ...banner, id: '6a0000000000000000000003', headline: '<img src=x onerror="window.__xss=1">Trusted?' },
      { ...banner, id: '6a0000000000000000000004', mediaUrl: 'http://insecure.example/banner.png' },
      { ...banner, id: 'not-an-id' },
    ] });
    await show(page, 'home');
    await card.waitFor();
    assert.equal(await page.evaluate(() => ZAds.items.map(ad => ad.id).join()), '6a0000000000000000000003', 'Unsafe campaigns are dropped');
    assert.match(await card.locator('h3').innerText(), /<img src=x onerror/);
    assert.equal(await page.evaluate(() => window.__xss), undefined, 'Campaign text is never markup');
    await receive(page, 'session.expired', { message: 'Session ended' });
    assert.equal(await page.evaluate(() => ZAds.items.length + ZAds.videos.size), 0, 'Signing out forgets ads and releases video');
    console.log('PASS untrusted campaign content is escaped or dropped, and sign-out clears ads');
    await page.close();

    const calm = await open({ reducedMotion: 'reduce', items: [video] });
    await calm.locator('.za-card').scrollIntoViewIfNeeded();
    await wait(2300);
    assert.equal(await calm.evaluate(() => __plays), 0, 'Reduced motion never autoplays video');
    assert.equal((await sent(calm, 'ads.impression')).length, 1, 'A paused video still counts its view');
    await calm.getByRole('button', { name: 'Play video', exact: true }).click();
    assert.equal(await calm.evaluate(() => __plays), 1);
    await calm.close();
    console.log('PASS reduced motion keeps video still until the member plays it');

    const preview = await open({ demo: true });
    await preview.locator('.za-card').waitFor();
    await preview.getByRole('button', { name: 'Install now: Zimi Studio, sponsored', exact: true }).click();
    assert.match(await preview.locator('#app-notice').innerText(), /Design preview/);
    assert.equal((await sent(preview, 'ads.click')).length, 0, 'The preview never reports taps');
    await preview.screenshot({ path: path.join(artifacts, 'ads-preview-home.png') });
    await preview.close();
    console.log('PASS the preview shows a sample ad without reporting anything');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
