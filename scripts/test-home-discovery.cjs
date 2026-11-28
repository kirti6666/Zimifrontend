/* Production Home with authenticated fixture responses: feed tabs, Search and Notifications,
   Popular/India chips, one square-card grid and the host's floating availability button.
   Also checks that the leaderboard is hidden by default and exercises it when enabled. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const member = { user: { id: '507f1f77bcf86cd799439001', name: 'Member', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false, isPhoneVerified: true }, verification: 'none', requiresOnboarding: false };
const host = { ...member, user: { ...member.user, role: 'host', serverRole: 'host', hostStatus: 'approved', isVerifiedHost: true }, verification: 'verified' };
const creators = ['Aanya', 'Mira', 'Tara'].map((name, index) => ({ id: `507f1f77bcf86cd79943901${index}`, name, role: 'host', serverRole: 'host', hostStatus: 'approved', isVerifiedHost: true, verified: true, online: true, availableForCall: true, ratePerMin: 0, category: ['Music', 'Dance', 'Gaming'][index], country: index === 2 ? 'Nepal' : 'India' }));
const feed = rows => ({ hosts: rows, stage: [], featured: rows[0] || null, total: rows.length, page: 1, limit: 20, categories: ['Music', 'Dance', 'Gaming'], broadcasterCount: 0, availableCount: rows.length, unreadCount: 2 });
const receive = (page, type, data = {}) => page.evaluate(message => Native.receive(message), { type, data });
const lastSent = (page, type) => page.evaluate(type => __sent.filter(message => message.type === type).at(-1)?.data, type);
const shownIds = page => page.locator('.zh-discover article[data-host-id]').evaluateAll(nodes => nodes.map(node => node.dataset.hostId));

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  async function open(reducedMotion = 'no-preference', account = member, coins = 1250) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion });
    page.setDefaultTimeout(8000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => { window.__sent = []; window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) }; });
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href + '?role=sender');
    await receive(page, 'session', account);
    await receive(page, 'data.home', feed(creators));
    if(coins!==null)await receive(page, 'wallet.balance', { coins });
    return page;
  }
  try {
    const page = await open('no-preference',member,null);
    assert.equal(await page.evaluate(() => DEMO), false);
    assert.equal(await page.locator('.zh-home-coins').getByRole('status',{name:'Loading balance'}).isVisible(),true);
    assert.equal(await page.locator('.zh-home-coin-exact').count(),0,'Home waits for a confirmed balance');
    assert.equal(await page.evaluate(() => typeof lbPreviewRows), 'undefined', 'The live app never bundles sample leaderboard rows');
    const tabs = page.locator('.zh-feed-tabs').getByRole('tab');
    assert.deepEqual(await tabs.allInnerTexts(), ['Following', 'Explore', 'For You', 'New']);
    assert.equal(await page.getByRole('tab', { name: 'Explore', exact: true }).getAttribute('aria-selected'), 'true', 'Explore is the default feed');
    assert.equal(await page.locator('.zh-brand,.zh-logo,.zh-dashboard-filters,.zh-dashboard .zh-filters').count(), 0);
    assert.deepEqual(await page.locator('.zh-header-actions button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))), ['Search creators', 'Notifications'], 'Home hides the leaderboard trophy');
    assert.equal(await page.locator('.zh-bell>i').count(), 1, 'Unread notifications show the reference accent dot');
    assert.equal(await page.locator('.zh-feed-tabs').evaluate(tabs => { const last=tabs.lastElementChild.getBoundingClientRect(), viewport=tabs.getBoundingClientRect(); return last.left>=viewport.left-1&&last.right<=viewport.right+1; }),true,'All four Home tabs remain fully visible beside Search and Notifications');
    const balance = page.locator('.zh-home-coin-count [aria-hidden="true"]');
    for (const [coins, label] of [[1250,'1,250'],[99999,'99,999'],[100000,'100K'],[331700,'331.7K'],[1200000,'1200K']]) {
      await receive(page,'wallet.balance',{coins});
      assert.equal(await balance.innerText(),label);
      assert.equal(await page.locator('.zh-home-coin-count').getAttribute('title'),`${await page.evaluate(value=>n(value),coins)} coins`,'The exact balance stays accessible above the display threshold');
    }
    await receive(page,'wallet.balance',{coins:331700});
    for(const dark of [false,true]){
      await page.evaluate(dark=>ZimiThemes.setDark(dark),dark);
      for(const width of [320,390]){
        await page.setViewportSize({width,height:844});
        const layout=await page.locator('.zh-home-toolbar').evaluate(row=>{
          const coins=row.querySelector('.zh-home-coins').getBoundingClientRect(),filters=row.querySelector('.zh-home-discovery').getBoundingClientRect(),box=row.getBoundingClientRect();
          const lastChip=row.querySelector('.zh-region-chips > button:last-child').getBoundingClientRect();
          return {coinsEnd:coins.right,filterEnd:filters.right,lastChipEnd:lastChip.right,coinsStart:coins.left,topDistance:Math.abs(coins.top-filters.top),end:box.right,width:innerWidth};
        });
        assert.ok(layout.lastChipEnd<=layout.filterEnd+1&&layout.filterEnd<=layout.coinsStart&&layout.coinsEnd<=layout.end+1&&layout.end<=layout.width+1&&layout.topDistance<=4,`${width}px: both country filters and balance fit on the reference row without overlap`);
      }
    }
    await page.evaluate(()=>ZimiThemes.setDark(false));
    await receive(page,'wallet.balance',{coins:1250});
    await page.getByRole('button', { name: 'Notifications', exact: true }).click();
    assert.equal(await page.evaluate(() => S.v), 'notifications', 'The Home bell opens the real notification inbox');
    await page.getByRole('button', { name: 'Back to home', exact: true }).click();
    assert.equal(await page.locator('.zh-host-status').count(), 0, 'Sender accounts never see the host status control');
    // The selected tab reads larger and bolder, as in the reference.
    const [following, explore] = await Promise.all(['Following', 'Explore'].map(name => page.getByRole('tab', { name, exact: true }).evaluate(el => { const style = getComputedStyle(el); return { size: parseFloat(style.fontSize), weight: Number(style.fontWeight) }; })));
    assert.ok(explore.size > following.size && explore.weight > following.weight, 'The selected feed stands out');
    await page.evaluate(() => { go('search'); go('board'); });
    assert.equal(await page.evaluate(() => S.v), 'home', 'The hidden leaderboard route returns to Home');
    assert.equal(await page.locator('.zlb-page').count(), 0, 'The hidden leaderboard does not render');
    assert.equal(await lastSent(page, 'leaderboard.load'), undefined, 'The hidden leaderboard does not request rankings');

    // One square-card grid in the server's order, every profile once, no featured card.
    assert.equal(await page.locator('.zh-featured-host,.zh-featured-carousel,.zh-featured-dots').count(), 0, 'Home has no featured card');
    assert.deepEqual(await shownIds(page), creators.map(creator => creator.id));
    const cards = await page.locator('.zh-discover article.zh-creator-card').evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(); return { width: box.width, height: box.height }; }));
    assert.ok(cards.every(card => Math.abs(card.width - card.height) < 2), 'Cards are square like the reference');
    const card = page.locator(`article[data-host-id="${creators[0].id}"]`);
    assert.equal(await card.locator('.zh-creator-status').innerText(), 'Online');
    assert.equal(await card.locator('[data-creator-country] [role="img"]').getAttribute('aria-label'), 'India', 'India shows as a flag');
    const nepal = page.locator(`article[data-host-id="${creators[2].id}"] [data-creator-country] [role="img"]`);
    assert.equal(await nepal.getAttribute('aria-label'), 'Nepal', 'Known countries retain their accessible name');
    assert.equal(await nepal.innerText(), '🇳🇵', 'Known countries outside India use their system flag');
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

    // Enable the leaderboard in this test context to keep its behavior covered.
    await page.evaluate(() => { window.ZIMI_CREATOR_LEADERBOARD_ENABLED = true; r(); });
    assert.equal(await page.locator('.zh-trophy').evaluate(el => getComputedStyle(el).color), await page.evaluate(() => { const probe = document.createElement('i'); probe.style.color = 'var(--gold)'; document.body.append(probe); const color = getComputedStyle(probe).color; probe.remove(); return color; }));
    await page.getByRole('button', { name: 'Leaderboard', exact: true }).click();
    assert.equal(await page.evaluate(() => S.v), 'board');
    assert.equal(await page.locator('#nav').isVisible(), false, 'The leaderboard has Back instead of the bottom tabs');
    assert.deepEqual(await page.locator('.zlb-periods [role="tab"]').allInnerTexts(), ['Daily', 'Weekly', 'Monthly']);
    assert.deepEqual(await lastSent(page, 'leaderboard.load'), { period: 'daily' });
    assert.equal(await page.getByRole('status', { name: 'Loading leaderboard', exact: true }).count(), 1, 'The leaderboard waits on its request');
    const rows = [{ id: creators[1].id, name: 'Mira <b>', avatarUrl: '', coins: 4200, rank: 1 }, { id: '507f1f77bcf86cd799439099', name: 'Not loaded yet', avatarUrl: '', coins: 900, rank: 2 }];
    await receive(page, 'data.leaderboard', { period: 'daily', items: rows, total: 2 });
    await receive(page, 'data.loading', { resource: 'leaderboard', loading: false });
    assert.deepEqual(await page.locator('.zlb-row .zlb-name').allInnerTexts(), ['Mira <b>', 'Not loaded yet'], 'Only returned, escaped host names are shown');
    assert.deepEqual(await page.locator('.zlb-coins').allInnerTexts(), ['4,200', '900'], 'Only the actual server scores are shown');
    assert.match(await page.getByRole('button', { name: /^Rank 1, Mira <b>/ }).innerText(), /4,200/, 'The server rank and score stay together');
    await page.getByRole('tab', { name: 'Weekly', exact: true }).click();
    assert.deepEqual(await lastSent(page, 'leaderboard.load'), { period: 'weekly' });
    await receive(page, 'data.leaderboard', { period: 'daily', items: rows, total: 2 });
    assert.equal(await page.locator('.zlb-row').count(), 0, 'A late answer for another period cannot paint rows');
    assert.equal(await page.getByRole('status', { name: 'Loading leaderboard', exact: true }).count(), 1, 'A stale answer cannot settle the active period');
    await receive(page, 'data.leaderboard', { period: 'weekly', items: [], total: 0 });
    await receive(page, 'data.loading', { resource: 'leaderboard', loading: false });
    assert.equal(await page.locator('.zlb-row').count(), 0, 'An empty period adds no filler rows');
    await page.getByRole('heading', { name: 'No rankings yet', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Monthly', exact: true }).click();
    assert.deepEqual(await lastSent(page, 'leaderboard.load'), { period: 'monthly' });
    await receive(page, 'data.leaderboard', { period: 'monthly', items: [{ ...rows[1], rank: 1, coins: 7250 }], total: 1 });
    assert.deepEqual(await page.locator('.zlb-coins').allInnerTexts(), ['7,250'], 'Monthly shows the server total for that period');
    await page.getByRole('tab', { name: 'Daily', exact: true }).click();
    await receive(page, 'data.loading', { resource: 'leaderboard', loading: false, error: 'Leaderboard is unavailable' });
    assert.match(await page.getByRole('alert').innerText(), /Leaderboard is unavailable/);
    await page.getByRole('alert').getByRole('button', { name: 'Retry', exact: true }).click();
    assert.equal((await page.evaluate(() => __sent.filter(message => message.type === 'leaderboard.load').length)), 5, 'Retry asks again');
    await receive(page, 'data.leaderboard', { period: 'daily', items: rows, total: 2 });
    await receive(page, 'data.loading', { resource: 'leaderboard', loading: false });
    await page.getByRole('button', { name: /^Rank 2, Not loaded yet/ }).click();
    assert.equal(await page.evaluate(() => S.v), 'host', 'A ranked creator opens their profile');
    assert.equal(await lastSent(page, 'profile.load').then(data => data?.id), rows[1].id);
    await page.evaluate(() => go('board'));

    const sampleHosts = [
      { id: '507f1f77bcf86cd799439091', name: 'Admin Host A', avatarUrl: '', coins: 1_300_000, rank: 1, sample: true },
      { id: '507f1f77bcf86cd799439092', name: 'Admin Host B', avatarUrl: '', coins: 800_000, rank: 2, sample: true },
      { id: '507f1f77bcf86cd799439093', name: 'Admin Host C', avatarUrl: '', coins: 67_000, rank: 3, sample: true },
    ];
    await receive(page, 'data.leaderboard', { period: 'daily', page: 1, items: rows, total: 2, sampleItems: sampleHosts.slice(0, 2), sampleTotal: 3 });
    const sampleRankings = page.getByRole('region', { name: 'Top creators', exact: true });
    assert.equal(await page.locator('#board-panel > :first-child').getByRole('heading', { name: 'Top creators', exact: true }).count(), 1, 'Top creators is the first ranking section');
    assert.deepEqual(await sampleRankings.locator('.zlb-coins').allInnerTexts(), ['1.3M', '800K']);
    assert.equal(await page.getByText(/sample rankings/i).count(), 0, 'The leaderboard never presents creators as a sample');
    assert.equal(await sampleRankings.locator('.zlb-score small').count(), 0, 'Ranking rows have no demo-style badge');
    assert.equal(await page.getByRole('button', { name: /^Rank 1, Mira <b>, 4,200 coins$/ }).count(), 1, 'Sample scores leave gift ranks and totals intact');
    await sampleRankings.getByRole('button', { name: 'Load more creators' }).click();
    assert.deepEqual(await lastSent(page, 'leaderboard.load'), { period: 'daily', page: 2 });
    await receive(page, 'data.loading', { resource: 'leaderboard', period: 'weekly', page: 2, loading: false, error: 'Old period failed' });
    assert.equal(await sampleRankings.getByRole('status', { name: 'Loading more creators' }).count(), 1, 'A stale error cannot settle the new page');
    await receive(page, 'data.leaderboard', { period: 'daily', page: 1, items: [], total: 0, sampleItems: [], sampleTotal: 0 });
    assert.equal(await sampleRankings.locator('.zlb-row').count(), 2, 'A late first page cannot clear the displayed sample hosts');
    await receive(page, 'data.loading', { resource: 'leaderboard', period: 'daily', page: 2, loading: false, error: 'Sample hosts unavailable' });
    await sampleRankings.getByRole('button', { name: 'Retry', exact: true }).click();
    assert.deepEqual(await lastSent(page, 'leaderboard.load'), { period: 'daily', page: 2 });
    await receive(page, 'data.leaderboard', { period: 'daily', page: 2, items: [], total: 2, sampleItems: [sampleHosts[2]], sampleTotal: 3 });
    assert.deepEqual(await sampleRankings.locator('.zlb-coins').allInnerTexts(), ['1.3M', '800K', '67K']);
    assert.equal(await sampleRankings.getByRole('button', { name: 'Load more creators' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: /^Rank 1, Mira <b>, 4,200 coins$/ }).count(), 1, 'Paging sample ranks never replaces the actual leaderboard');
    for (const [period, coins, amount] of [['weekly', 2_100_000, '2.1M'], ['monthly', 4_600_000, '4.6M']]) {
      await page.getByRole('tab', { name: period[0].toUpperCase() + period.slice(1), exact: true }).click();
      await receive(page, 'data.leaderboard', { period, page: 1, items: [], total: 0, sampleItems: [{ ...sampleHosts[0], coins }], sampleTotal: 1 });
      assert.equal(await sampleRankings.locator('.zlb-coins').innerText(), amount, `${period} uses its own server sample score`);
    }
    await sampleRankings.getByRole('button', { name: /^Rank 1, Admin Host A,/ }).click();
    assert.equal((await lastSent(page, 'profile.load')).id, sampleHosts[0].id, 'A sample row opens the admin-created Host profile');
    await receive(page, 'app.back', {});
    assert.equal(await page.evaluate(() => S.v), 'board');
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

    const preview = await browser.newPage({ viewport: { width: 360, height: 761 }, reducedMotion: 'reduce' });
    preview.on('pageerror', error => errors.push(error.message));
    await preview.route('https://**/*', route => route.abort());
    await preview.clock.install({ time: new Date('2026-11-25T23:59:00Z') });
    await preview.goto(pathToFileURL(path.join(root, 'dist/index.html')).href + '?role=sender');
    assert.equal(await preview.getByRole('button', { name: 'Leaderboard', exact: true }).count(), 0, 'The standalone preview also hides the leaderboard by default');
    await preview.evaluate(() => { window.ZIMI_CREATOR_LEADERBOARD_ENABLED = true; r(); });
    await preview.getByRole('button', { name: 'Leaderboard', exact: true }).click();
    await preview.getByText(/Top creators by Coins received/).waitFor();
    assert.doesNotMatch(await preview.locator('.zlb-page').innerText(), /sample|design preview|posed by models/i, 'The leaderboard reads like a finished ranking');
    const previewHosts = ['Pihu Mishra', 'Simran Kaur', 'Ishita Verma', 'Sana Khan', 'Aarohi Sharma'];
    const sampleRow = name => preview.getByRole('button', { name: new RegExp(`^Rank \\d+, ${name},`) });
    const score = name => sampleRow(name).locator('.zlb-coins').innerText();
    const previousDay = await score('Pihu Mishra');
    assert.match(previousDay, /M$/);
    assert.match(await score('Simran Kaur'), /K$/);
    assert.match(await score('Aarohi Sharma'), /K$/);
    await preview.clock.fastForward(61_000);
    assert.notEqual(await score('Pihu Mishra'), previousDay, 'An open preview refreshes its daily scores at midnight UTC');
    for (const period of ['Daily', 'Weekly', 'Monthly']) {
      await preview.getByRole('tab', { name: period, exact: true }).click();
      assert.equal(await preview.locator('.zlb-coins').count(), 17);
      for (const name of previewHosts) assert.equal(await sampleRow(name).count(), 1, `${period} includes ${name}`);
    }
    const actual = await preview.evaluate(() => {
      const date = day => new Date(`2026-03-0${day}T12:00:00Z`);
      const coins = (period, day) => lbPreviewRows(period, date(day)).find(row => row.id === 'preview-board-pihu-mishra').coins;
      const [sunday, monday, tuesday] = [1, 2, 3].map(day => coins('daily', day));
      return [
        coins('monthly', 1) === sunday,
        coins('weekly', 2) === monday,
        coins('weekly', 3) === monday + tuesday,
        coins('monthly', 3) === sunday + monday + tuesday,
      ];
    });
    assert.deepEqual(actual, [true, true, true, true], 'Sample totals accumulate only within their UTC calendar week and month');
    await sampleRow('Pihu Mishra').click();
    await preview.getByRole('heading', { name: 'Pihu Mishra', exact: true }).waitFor();
    assert.equal(await preview.evaluate(() => S.v), 'host', 'A new leaderboard sample opens its preview profile');
    await preview.close();
    assert.deepEqual(errors, [], 'No browser exceptions');
    console.log('PASS Home discovery: Search and Notifications, keyboard feed tabs, country filters, square cards, ad placement, host availability and the default-off leaderboard');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
