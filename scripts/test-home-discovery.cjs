/* Production Home with authenticated fixture responses. Rotation uses its real
   six-second interval; no sample creators or production network requests run. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const member = { user: { id: '507f1f77bcf86cd799439001', name: 'Member', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false, isPhoneVerified: true }, verification: 'none', requiresOnboarding: false };
const host = { ...member, user: { ...member.user, role: 'host', serverRole: 'host', hostStatus: 'approved', isVerifiedHost: true }, verification: 'verified' };
const creators = ['Aanya', 'Mira', 'Tara'].map((name, index) => ({ id: `507f1f77bcf86cd79943901${index}`, name, role: 'host', serverRole: 'host', hostStatus: 'approved', isVerifiedHost: true, verified: true, online: true, availableForCall: true, ratePerMin: 0, category: ['Music', 'Dance', 'Gaming'][index] }));
const feed = rows => ({ hosts: rows, stage: [], featured: rows[0] || null, total: rows.length, page: 1, limit: 20, categories: ['Music', 'Dance', 'Gaming'], broadcasterCount: 0, availableCount: rows.length });
const receive = (page, type, data = {}) => page.evaluate(message => Native.receive(message), { type, data });
const featuredId = page => page.locator('.zh-featured-host').getAttribute('data-host-id');
const timerRunning = page => page.evaluate(() => !!HomeFeatured.timer);

async function assertUniqueProfiles(page, expected) {
  const ids = await page.locator('article[data-host-id]').evaluateAll(nodes => nodes.map(node => node.dataset.hostId));
  assert.equal(new Set(ids).size, ids.length, 'Featured and grid cards never duplicate a profile');
  assert.deepEqual([...ids].sort(), [...expected].sort(), 'Rotation keeps every loaded profile available');
  const current = await featuredId(page);
  assert.equal(await page.locator(`.zh-discover [data-host-id="${current}"]`).count(), 0, 'The grid excludes the current featured creator');
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  async function open(reducedMotion = 'no-preference', account = member) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion });
    page.setDefaultTimeout(8000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => { window.__sent = []; window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) }; });
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href + '?role=sender');
    await receive(page, 'session', account);
    await receive(page, 'data.home', feed(creators));
    await receive(page, 'wallet.balance', { coins: 1250 });
    await page.mouse.move(1, 1);
    return page;
  }
  try {
    const page = await open();
    assert.equal(await page.evaluate(() => DEMO), false);
    assert.deepEqual(await page.locator('.zh-feed-tabs').getByRole('tab').allInnerTexts(), ['All', 'Following']);
    assert.equal(await page.locator('.zh-brand,.zh-logo,.zh-dashboard-filters,.zh-dashboard .zh-filters').count(), 0);
    assert.equal(await page.locator('.zh-header-actions').getByRole('button', { name: /^Wallet/ }).count(), 1);
    assert.equal(await page.locator('.zh-header-actions').getByRole('button', { name: 'Search creators', exact: true }).count(), 1);
    assert.equal(await page.locator('.zh-host-status').count(), 0, 'Sender accounts never see the host status control');
    const first = await featuredId(page);
    assert.equal(first, creators[0].id);
    await page.waitForFunction(id => document.querySelector('.zh-featured-host')?.dataset.hostId !== id, first, { timeout: 8000 });
    await assertUniqueProfiles(page, creators.map(creator => creator.id));
    // No control row under the card: dots show the position and jump to a creator.
    assert.equal(await page.locator('.zh-featured-controls,.zh-featured-progress,.zh-featured-position').count(), 0, 'The featured card has no control row');
    const dots = page.locator('.zh-featured-dots > button');
    assert.equal(await dots.count(), creators.length);
    const currentDot = () => dots.evaluateAll(nodes => nodes.findIndex(node => node.getAttribute('aria-current') === 'true'));
    const shownId = await featuredId(page);
    const shownName = creators.find(creator => creator.id === shownId).name;
    assert.match(await dots.nth(await currentDot()).getAttribute('aria-label'), new RegExp(`^Show ${shownName}, \\d of ${creators.length}$`), 'The current dot names the featured creator');
    await dots.nth(2).click();
    assert.equal(await featuredId(page), creators[2].id, 'A dot shows its creator');
    assert.equal(await currentDot(), 2);
    await assertUniqueProfiles(page, creators.map(creator => creator.id));
    const start = await featuredId(page), cycle = [];
    for (let index = 0; index < creators.length; index++) {
      await page.evaluate(() => homeFeaturedNext());
      cycle.push(await featuredId(page));
      await assertUniqueProfiles(page, creators.map(creator => creator.id));
    }
    assert.equal(new Set(cycle).size, creators.length, 'Manual advancement visits every creator');
    assert.equal(cycle.at(-1), start, 'The rotation wraps to the current creator');

    // A sideways swipe moves the spotlight without opening the profile under the finger.
    const box = await page.locator('.zh-featured-host').boundingBox(), y = box.y + box.height / 2;
    // Like a browser, the click that may end a gesture targets whatever is under the finger after it lifts.
    const swipe = (from, to) => page.locator('.zh-featured-carousel').evaluate((el, { from, to, y }) => {
      for (const [type, x] of [['pointerdown', from], ['pointerup', to]]) el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y }));
      document.elementFromPoint(to, y).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: to, clientY: y }));
    }, { from, to, y });
    const beforeSwipe = await featuredId(page);
    await swipe(box.x + box.width - 30, box.x + 30);
    assert.notEqual(await featuredId(page), beforeSwipe, 'Swiping left shows the next creator');
    assert.equal(await page.evaluate(() => S.v), 'home', 'The swipe never opens a profile');
    await swipe(box.x + 30, box.x + box.width - 30);
    assert.equal(await featuredId(page), beforeSwipe, 'Swiping right goes back');
    await page.locator('.zh-featured-host').click({ position: { x: 40, y: 60 } });
    assert.equal(await page.evaluate(() => S.v), 'host', 'A tap still opens the featured profile');
    await page.evaluate(() => go('home'));

    // The always-active video call starts from the card itself.
    const call = page.locator('.zh-featured-host .zh-featured-call');
    assert.equal(await call.isEnabled(), true);
    assert.match(await call.getAttribute('aria-label'), /^Video call /);
    assert.equal(await call.evaluate(el => getComputedStyle(el).borderRadius), '999px', 'Call buttons are round');
    await call.click();
    assert.equal(await page.evaluate(() => S.v), 'precall', 'The featured call button opens the call setup');
    await page.evaluate(() => go('home'));
    await page.mouse.move(1, 1);
    await page.getByRole('tab', { name: 'All', exact: true }).focus();
    await page.locator('.zh-featured-carousel').evaluate(element => element.dispatchEvent(new MouseEvent('mouseleave')));
    await page.waitForFunction(() => !!HomeFeatured.timer);
    await page.locator('.zh-featured-carousel').hover();
    assert.equal(await timerRunning(page), false, 'Hover keeps the profile stable for interaction');
    await page.mouse.move(1, 1);
    await page.waitForFunction(() => !!HomeFeatured.timer);
    await page.locator('.zh-featured-host .zh-featured-profile-hit').focus();
    assert.equal(await timerRunning(page), false, 'Keyboard focus keeps the profile stable');
    await page.getByRole('tab', { name: 'All', exact: true }).focus();
    await page.waitForFunction(() => !!HomeFeatured.timer);

    await receive(page, 'app.background');
    assert.equal(await timerRunning(page), false, 'Native backgrounding suspends rotation');
    await receive(page, 'app.foreground');
    await page.waitForFunction(() => !!HomeFeatured.timer);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await timerRunning(page), false, 'Hidden pages suspend rotation');
    await page.evaluate(() => { delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => !!HomeFeatured.timer);
    await page.evaluate(() => go('chats'));
    assert.equal(await timerRunning(page), false, 'Navigation away from Home cancels rotation');
    await page.evaluate(() => go('home'));
    await page.waitForFunction(() => !!HomeFeatured.timer);
    await receive(page, 'data.loading', { resource: 'home', loading: true, page: 1 });
    assert.equal(await timerRunning(page), false, 'Loading suspends rotation until a real feed arrives');
    await receive(page, 'data.home', feed([creators[0]]));
    assert.equal(await timerRunning(page), false, 'A single profile has no unnecessary rotation timer');
    await receive(page, 'data.home', feed([]));
    assert.equal(await page.locator('.zh-featured-carousel').count(), 0, 'An empty feed has no carousel');

    const ad = { id: '6a0000000000000000000001', format: 'banner', advertiser: 'BinzoLive Studio', headline: 'Edit reels in seconds', body: 'Templates and captions.', ctaLabel: 'Install now', domain: 'play.google.com', mediaUrl: 'https://media.example.test/ads/banner.png', mediaType: 'image/png', logoUrl: '', placements: ['home', 'explore'] };
    const many = Array.from({ length: 10 }, (_, index) => ({ ...creators[index % 3], id: `507f1f77bcf86cd7994391${String(index).padStart(2, '0')}`, name: `Creator ${index}` }));
    const gridOrder = selector => page.locator(selector).evaluate(grid => [...grid.children].map(child => child.matches('[data-za-slot]') ? 'ad' : 'host'));
    await receive(page, 'data.ads', { adFree: false, items: [ad] });
    await receive(page, 'data.home', feed(many));
    assert.deepEqual(await gridOrder('#home-host-grid'), [...Array(6).fill('host'), 'ad', ...Array(3).fill('host')], 'Home shows six hosts, the ad, then the rest');
    await page.evaluate(() => { window.__ad = document.querySelector('#home-host-grid [data-za-slot]'); homeFeaturedNext(); });
    assert.equal(await page.evaluate(() => document.querySelector('#home-host-grid').children[6] === window.__ad), true, 'Rotation keeps the same ad element after the sixth host');
    await page.evaluate(() => go('all-creators'));
    assert.deepEqual(await gridOrder('.zac-page .zh-grid'), [...Array(6).fill('host'), 'ad', ...Array(4).fill('host')], 'All Creators places its ad after six creators too');
    await page.evaluate(() => go('home'));
    await receive(page, 'data.home', feed(creators));
    assert.deepEqual(await gridOrder('#home-host-grid'), ['host', 'host', 'ad'], 'A short grid keeps the ad below its hosts');

    const reduced = await open('reduce', host);
    assert.equal(await timerRunning(reduced), false, 'Reduced motion initializes rotation paused');
    assert.equal(await reduced.locator('.zh-featured-controls').count(), 0, 'Reduced motion has no control row either; dots and swipes still work');
    assert.equal(await reduced.locator('.zh-featured-dots > button').count(), creators.length);
    assert.equal(await reduced.locator('.zh-host-status').count(), 1, 'Approved host accounts retain their availability control');
    await reduced.getByRole('tab', { name: 'Following', exact: true }).click();
    assert.deepEqual(await reduced.evaluate(() => __sent.filter(message => message.type === 'home.reload').at(-1).data), { page: 1, mode: 'following' });
    await receive(reduced, 'data.home', feed([creators[2]]));
    assert.equal(await featuredId(reduced), creators[2].id, 'Following features only a server-confirmed followed creator');
    await assertUniqueProfiles(reduced, [creators[2].id]);
    await reduced.getByRole('tab', { name: 'All', exact: true }).click();
    assert.deepEqual(await reduced.evaluate(() => __sent.filter(message => message.type === 'home.reload').at(-1).data), { page: 1, mode: 'popular' });
    assert.deepEqual(errors, [], 'No browser exceptions');
    console.log('PASS Home discovery: All/Following header, host-only status, featured card without a control row (dots, swipe, call button), automatic and manual rotation, unique profiles, focus/hover/background/loading guards, ads after six hosts, and reduced motion');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
