/* Production Home with authenticated fixture responses: the reference header (feed tabs,
   Search and the leaderboard trophy), Popular/India chips, one square-card grid, the host's
   floating availability button and the leaderboard. No sample creators or network requests. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const member = { user: { id: '507f1f77bcf86cd799439001', name: 'Member', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false, isPhoneVerified: true }, verification: 'none', requiresOnboarding: false };
const host = { ...member, user: { ...member.user, role: 'host', serverRole: 'host', hostStatus: 'approved', isVerifiedHost: true }, verification: 'verified' };
const creators = ['Aanya', 'Mira', 'Tara'].map((name, index) => ({ id: `507f1f77bcf86cd79943901${index}`, name, role: 'host', serverRole: 'host', hostStatus: 'approved', isVerifiedHost: true, verified: true, online: true, availableForCall: true, ratePerMin: 0, category: ['Music', 'Dance', 'Gaming'][index], country: index === 2 ? 'Nepal' : 'India' }));
const feed = rows => ({ hosts: rows, stage: [], featured: rows[0] || null, total: rows.length, page: 1, limit: 20, categories: ['Music', 'Dance', 'Gaming'], broadcasterCount: 0, availableCount: rows.length });
const receive = (page, type, data = {}) => page.evaluate(message => Native.receive(message), { type, data });
const lastSent = (page, type) => page.evaluate(type => __sent.filter(message => message.type === type).at(-1)?.data, type);
const shownIds = page => page.locator('.zh-discover article[data-host-id]').evaluateAll(nodes => nodes.map(node => node.dataset.hostId));

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
    return page;
  }
  try {
    const page = await open();
    assert.equal(await page.evaluate(() => DEMO), false);
    const tabs = page.locator('.zh-feed-tabs').getByRole('tab');
    assert.deepEqual(await tabs.allInnerTexts(), ['Following', 'Explore', 'For You', 'New']);
    assert.equal(await page.getByRole('tab', { name: 'Explore', exact: true }).getAttribute('aria-selected'), 'true', 'Explore is the default feed');
    assert.equal(await page.locator('.zh-brand,.zh-logo,.zh-dashboard-filters,.zh-dashboard .zh-filters').count(), 0);
    assert.deepEqual(await page.locator('.zh-header-actions button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))), ['Search creators', 'Leaderboard'], 'Search and the trophy are the only header actions');
    assert.equal(await page.locator('.zh-host-status').count(), 0, 'Sender accounts never see the host status control');
    // The selected tab reads larger and bolder, as in the reference.
    const [following, explore] = await Promise.all(['Following', 'Explore'].map(name => page.getByRole('tab', { name, exact: true }).evaluate(el => { const style = getComputedStyle(el); return { size: parseFloat(style.fontSize), weight: Number(style.fontWeight) }; })));
    assert.ok(explore.size > following.size && explore.weight > following.weight, 'The selected feed stands out');
    // The trophy is gold in every theme.
    assert.equal(await page.locator('.zh-trophy').evaluate(el => getComputedStyle(el).color), await page.evaluate(() => { const probe = document.createElement('i'); probe.style.color = 'var(--gold)'; document.body.append(probe); const color = getComputedStyle(probe).color; probe.remove(); return color; }));

    // One square-card grid in the server's order, every profile once, no featured card.
    assert.equal(await page.locator('.zh-featured-host,.zh-featured-carousel,.zh-featured-dots').count(), 0, 'Home has no featured card');
    assert.deepEqual(await shownIds(page), creators.map(creator => creator.id));
    const cards = await page.locator('.zh-discover article.zh-creator-card').evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(); return { width: box.width, height: box.height }; }));
    assert.ok(cards.every(card => Math.abs(card.width - card.height) < 2), 'Cards are square like the reference');
    const card = page.locator(`article[data-host-id="${creators[0].id}"]`);
    assert.equal(await card.locator('.zh-creator-status').innerText(), 'Online');
    assert.equal(await card.locator('[data-creator-country] [role="img"]').getAttribute('aria-label'), 'India', 'India shows as a flag');
    assert.equal(await page.locator(`article[data-host-id="${creators[2].id}"] [data-creator-country]`).innerText(), 'Nepal', 'Other countries show their name');
    const call = card.locator('.zh-creator-call');
    assert.equal(await call.isEnabled(), true);
    assert.equal(await call.evaluate(el => getComputedStyle(el).borderRadius), '999px', 'Call buttons are round');
    assert.deepEqual(await card.locator('.zh-flag').evaluate(el => { const box = el.getBoundingClientRect(); return { radius: getComputedStyle(el).borderRadius, wide: box.width > box.height }; }), { radius: '0px', wide: true }, 'Flags are plain rectangles, never circles');
    await call.click();
    assert.equal(await page.evaluate(() => S.v), 'precall', 'The card call button opens the call setup');
    await page.evaluate(() => go('home'));
    await card.click({ position: { x: 60, y: 60 } });
    assert.equal(await page.evaluate(() => S.v), 'host', 'Tapping the photo opens the profile');
    await page.evaluate(() => go('home'));

    // Feed tabs and the keyboard.
    for (const [name, mode] of [['Following', 'following'], ['For You', 'foryou'], ['New', 'new'], ['Explore', 'popular']]) {
      await page.getByRole('tab', { name, exact: true }).click();
      assert.deepEqual(await lastSent(page, 'home.reload'), { page: 1, mode }, `${name} asks the server for its feed`);
      assert.equal(await page.locator('#home-feed-panel').getAttribute('aria-labelledby'), 'home-tab-' + mode);
      assert.equal(await page.locator('.zh-region-chips').count(), mode === 'following' ? 0 : 1, 'Country chips belong to the discovery feeds');
      await receive(page, 'data.home', feed(creators));
    }
    await page.getByRole('tab', { name: 'Explore', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'home-tab-foryou', 'Arrow keys move between feeds');
    assert.deepEqual(await lastSent(page, 'home.reload'), { page: 1, mode: 'foryou' });
    await page.keyboard.press('Home');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'home-tab-following');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'home-tab-new', 'Arrow keys wrap around');
    await page.getByRole('tab', { name: 'Explore', exact: true }).click();

    // Country chips: Popular and India only; India filters on the server and survives tab changes.
    const chips = page.locator('.zh-region-chips');
    assert.deepEqual(await chips.getByRole('button').allInnerTexts(), ['Popular', 'India']);
    await chips.getByRole('button', { name: 'India', exact: true }).click();
    assert.deepEqual(await lastSent(page, 'home.reload'), { page: 1, mode: 'popular', country: 'India' });
    assert.equal(await chips.getByRole('button', { name: 'India', exact: true }).getAttribute('aria-pressed'), 'true');
    await receive(page, 'data.home', feed(creators.slice(0, 2)));
    await page.getByRole('tab', { name: 'New', exact: true }).click();
    assert.deepEqual(await lastSent(page, 'home.reload'), { page: 1, mode: 'new', country: 'India' }, 'The country stays chosen across discovery feeds');
    await page.getByRole('tab', { name: 'Following', exact: true }).click();
    assert.deepEqual(await lastSent(page, 'home.reload'), { page: 1, mode: 'following' }, 'Following lists every followed creator, wherever they are');
    await page.getByRole('tab', { name: 'Explore', exact: true }).click();
    await page.locator('.zh-region-chips').getByRole('button', { name: 'Popular', exact: true }).click();
    assert.deepEqual(await lastSent(page, 'home.reload'), { page: 1, mode: 'popular' });
    await receive(page, 'data.home', feed(creators));

    // Like the reference, campaign banners rotate after two rows of hosts; the sponsored card follows ten hosts.
    const ad = { id: '6a0000000000000000000001', format: 'banner', advertiser: 'BinzoLive Studio', headline: 'Edit reels in seconds', body: 'Templates and captions.', ctaLabel: 'Install now', domain: 'play.google.com', mediaUrl: 'https://media.example.test/ads/banner.png', mediaType: 'image/png', logoUrl: '', placements: ['home', 'explore'] };
    const banner = (n, headline) => ({ id: `6a000000000000000000000${n}`, format: 'campaign', advertiser: 'BinzoLive', headline, body: '', ctaLabel: 'Open', domain: 'binzolive.com', mediaUrl: `https://media.example.test/ads/campaign-${n}.png`, mediaType: 'image/png', logoUrl: '', placements: ['home', 'explore'] });
    const banners = [banner(2, 'Diwali Gift Festival'), banner(3, 'Weekend Call Marathon')];
    const many = Array.from({ length: 12 }, (_, index) => ({ ...creators[index % 3], id: `507f1f77bcf86cd7994391${String(index).padStart(2, '0')}`, name: `Creator ${index}` }));
    const gridOrder = selector => page.locator(selector).evaluate(grid => [...grid.children].map(child => child.matches('[data-za-campaigns]') ? 'banners' : child.matches('[data-za-slot]') ? 'ad' : 'host'));
    await receive(page, 'data.ads', { adFree: false, items: [ad, ...banners] });
    await receive(page, 'data.home', feed(many));
    assert.deepEqual(await gridOrder('#home-host-grid'), [...Array(4).fill('host'), 'banners', ...Array(6).fill('host'), 'ad', 'host', 'host'], 'Banners follow two rows of hosts and the card follows ten hosts');
    const carousel = page.locator('#home-host-grid .za-campaigns');
    const bannerBox = await carousel.boundingBox(), first = await page.locator('#home-host-grid article').first().boundingBox();
    assert.ok(Math.abs(bannerBox.width / bannerBox.height - 11 / 3) < .05, 'The banner is a wide 11:3 picture');
    assert.ok(bannerBox.width > first.width * 1.9, 'The banner spans both columns');
    assert.deepEqual(await carousel.locator('.za-campaign-slide').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))), ['Diwali Gift Festival, BinzoLive, sponsored, 1 of 2', 'Weekend Call Marathon, BinzoLive, sponsored, 2 of 2']);
    assert.equal(await carousel.locator('.za-campaign-ad').innerText(), 'Ad', 'Each banner carries a small Ad label');
    assert.deepEqual(await carousel.locator('.za-campaign-dots>i').evaluateAll(nodes => nodes.map(node => node.className)), ['on', ''], 'Dots show the position');
    await page.waitForFunction(id => __sent.some(message => message.type === 'ads.impression' && message.data.id === id && message.data.placement === 'home'), banners[0].id, { timeout: 4000 });
    assert.equal(await page.evaluate(id => __sent.some(message => message.type === 'ads.impression' && message.data.id === id), banners[1].id), false, 'A slide out of view is not counted');
    // The banners advance by themselves, and the next slide counts its own view.
    await page.mouse.move(1, 1);
    await page.waitForFunction(() => document.querySelector('.za-campaign-dots>i:last-child')?.className === 'on', null, { timeout: 9000 });
    await page.waitForFunction(id => __sent.some(message => message.type === 'ads.impression' && message.data.id === id), banners[1].id, { timeout: 4000 });
    await carousel.getByRole('button', { name: 'About this ad', exact: true }).click();
    assert.match(await page.getByRole('dialog').innerText(), /BinzoLive/, 'The Ad label explains the banner on screen');
    await page.keyboard.press('Escape');
    await carousel.getByRole('button', { name: /^Weekend Call Marathon/ }).click();
    assert.deepEqual(await lastSent(page, 'ads.click'), { id: banners[1].id, placement: 'home' }, 'A tap goes through the counted click');
    await receive(page, 'ads.opened', { id: banners[1].id });
    await page.evaluate(() => go('all-creators'));
    assert.deepEqual(await gridOrder('.zac-page .zh-grid'), [...Array(4).fill('host'), 'banners', ...Array(6).fill('host'), 'ad', 'host', 'host'], 'All Creators places them the same way');
    await page.evaluate(() => go('home'));
    await receive(page, 'data.home', feed(creators));
    assert.deepEqual(await gridOrder('#home-host-grid'), ['host', 'host', 'host', 'banners', 'ad'], 'A short grid keeps the banners and the card below its hosts');
    await receive(page, 'data.ads', { adFree: false, items: [banners[0]] });
    assert.equal(await page.locator('.za-campaign-dots').count(), 0, 'A single banner has no dots');
    await receive(page, 'data.ads', { adFree: true, items: [] });
    assert.equal(await page.locator('.za-campaigns,.za-card').count(), 0, 'Premium members see no banners');

    // The trophy opens the real leaderboard.
    await page.getByRole('button', { name: 'Leaderboard', exact: true }).click();
    assert.equal(await page.evaluate(() => S.v), 'board');
    assert.equal(await page.locator('#nav').isVisible(), false, 'The leaderboard has Back instead of the bottom tabs');
    assert.deepEqual(await lastSent(page, 'leaderboard.load'), { period: 'daily' });
    assert.equal(await page.getByRole('status', { name: 'Loading leaderboard', exact: true }).count(), 1, 'The leaderboard waits on its request');
    const rows = [{ id: creators[1].id, name: 'Mira <b>', avatarUrl: '', coins: 4200, rank: 1 }, { id: '507f1f77bcf86cd799439099', name: 'Not loaded yet', avatarUrl: '', coins: 900, rank: 2 }];
    await receive(page, 'data.leaderboard', { period: 'daily', items: rows, total: 2 });
    await receive(page, 'data.loading', { resource: 'leaderboard', loading: false });
    assert.deepEqual(await page.locator('.zlb-row .zlb-name').allInnerTexts(), ['Mira <b>', 'Not loaded yet'], 'Rows show escaped server names in rank order');
    assert.match(await page.locator('.zlb-row').first().innerText(), /4,200/);
    await page.getByRole('tab', { name: 'Weekly', exact: true }).click();
    assert.deepEqual(await lastSent(page, 'leaderboard.load'), { period: 'weekly' });
    await receive(page, 'data.leaderboard', { period: 'daily', items: rows, total: 2 });
    assert.equal(await page.locator('.zlb-row').count(), 0, 'A late answer for another period is ignored');
    await receive(page, 'data.leaderboard', { period: 'weekly', items: [], total: 0 });
    await receive(page, 'data.loading', { resource: 'leaderboard', loading: false });
    assert.equal(await page.getByRole('heading', { name: 'No rankings yet', exact: true }).count(), 1);
    await page.getByRole('tab', { name: 'Daily', exact: true }).click();
    await receive(page, 'data.loading', { resource: 'leaderboard', loading: false, error: 'Leaderboard is unavailable' });
    assert.match(await page.getByRole('alert').innerText(), /Leaderboard is unavailable/);
    await page.getByRole('alert').getByRole('button', { name: 'Retry', exact: true }).click();
    assert.equal((await page.evaluate(() => __sent.filter(message => message.type === 'leaderboard.load').length)), 4, 'Retry asks again');
    await receive(page, 'data.leaderboard', { period: 'daily', items: rows, total: 2 });
    await receive(page, 'data.loading', { resource: 'leaderboard', loading: false });
    await page.getByRole('button', { name: /^Rank 2, Not loaded yet/ }).click();
    assert.equal(await page.evaluate(() => S.v), 'host', 'A ranked creator opens their profile');
    assert.equal(await lastSent(page, 'profile.load').then(data => data?.id), rows[1].id);
    await page.evaluate(() => go('board'));
    await page.getByRole('button', { name: 'Back to home', exact: true }).click();
    assert.equal(await page.evaluate(() => S.v), 'home');

    // An approved host's availability floats over Home like the reference's LIVE button.
    const hosting = await open('reduce', host);
    const status = hosting.locator('.zh-host-status');
    assert.equal(await status.count(), 1, 'Approved host accounts keep their availability control');
    assert.equal(await status.innerText(), 'Go online');
    const box = await status.boundingBox(), nav = await hosting.locator('#nav').boundingBox();
    assert.ok(box.x + box.width > 350 && box.y + box.height <= nav.y, 'The button sits at the bottom right, above the tabs');
    await status.click();
    assert.equal(await hosting.evaluate(() => S.v), 'setup', 'It opens the private call setup');
    await receive(hosting, 'presence.saved', { online: true, visible: true });
    await hosting.evaluate(() => go('home'));
    assert.equal(await hosting.locator('.zh-host-status').innerText(), 'Online');
    assert.equal(await hosting.locator('.zh-host-status').getAttribute('aria-label'), 'Manage your call availability');
    assert.deepEqual(errors, [], 'No browser exceptions');
    console.log('PASS Home discovery: Following/Explore/For You/New header with Search and trophy, keyboard tabs, Popular/India chips on the server, square grid without a featured card, round call buttons and rectangular flags, campaign banners after two rows (11:3, Ad label, dots, auto-advance, per-slide views and counted taps) and cards after ten hosts, real leaderboard (periods, stale answers, empty, error/retry, profiles) and the host availability button');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
