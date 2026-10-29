/* Exercise production Home with real image decoding and repeated native updates.
   No accounts, purchases or production services are used. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const hosts = Array.from({ length: 12 }, (_, i) => ({
  id: `507f1f77bcf86cd799439${String(i + 100).padStart(3, '0')}`, name: `Creator ${i + 1}`,
  serverRole: 'host', role: 'host', verified: true, online: true, availableForCall: true,
  category: 'Music', tag: `Conversation ${i + 1}`, ratePerMin: 10,
  avatarUrl: `https://media.example.test/creator-${i}.svg`, coverUrl: `https://media.example.test/creator-${i}.svg`
}));
const feed = (rows, extra = {}) => ({ hosts: rows, stage: [], featured: rows[0], total: rows.length, page: 1, limit: 4, unreadCount: 0, categories: ['Music'], ...extra });
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
    const errors = []; let navigations = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
    await page.route('https://**/*', route => route.request().url().startsWith('https://media.example.test/')
      ? route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="480"><rect width="360" height="480" fill="#365975"/></svg>' })
      : route.abort());
    await page.addInitScript(() => { window.__sent = []; window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) }; });
    const receive = (type, data) => page.evaluate(message => Native.receive(message), { type, data });
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href);
    await receive('session', { user: { id: '507f1f77bcf86cd799439099', name: 'Member', role: 'sender', serverRole: 'user', hostStatus: 'none', isPhoneVerified: true }, requiresOnboarding: false });
    await receive('data.home', feed(hosts.slice(0, 8)));
    await receive('wallet.balance', { coins: 500 });
    await page.waitForFunction(() => [...document.querySelectorAll('.zh-dashboard img')].every(img => img.complete && img.naturalWidth));
    await page.evaluate(() => { HomeFeatured.paused = true; homeFeaturedStop(); r(); });
    await page.evaluate(() => {
      window.__stable = {
        panel: document.getElementById('home-feed-panel'), hero: document.getElementById('home-featured-card'),
        grid: document.getElementById('home-host-grid'), header: document.querySelector('.zh-header'),
        nav: document.querySelector('[data-tab="home"]'), images: [...document.querySelectorAll('.zh-dashboard img')],
        cards: [...document.querySelectorAll('article[data-host-id]')], removedImages: 0
      };
      __stable.observer = new MutationObserver(records => {
        for (const record of records) for (const node of record.removedNodes) {
          if (node.nodeType === 1) __stable.removedImages += (node.matches('img') ? 1 : 0) + node.querySelectorAll('img').length;
        }
      });
      __stable.observer.observe(document.getElementById('screen'), { childList: true, subtree: true });
      const control = __stable.cards[1].querySelector('button'); control.focus({ preventScroll: true });
      document.getElementById('scroll-root').scrollTop = 120;
      __stable.focus = control; __stable.scroll = document.getElementById('scroll-root').scrollTop;
    });
    for (let i = 0; i < 12; i++) {
      await receive('data.loading', { resource: 'home', loading: true, page: 1, background: true });
      assert.equal(await page.locator('.zh-dashboard .zh-skeleton').count(), 0, 'Background revalidation keeps the real cards on screen');
      await receive('data.home', { ...feed(hosts.slice(0, 8).map((host, at) => at === 3 ? { ...host, tag: `Updated ${i}` } : host)), background: true });
      await receive('data.loading', { resource: 'home', loading: false, page: 1, background: true });
      await receive('data.loading', { resource: 'wallet', loading: true });
      assert.equal(await page.getByRole('status', { name: 'Loading balance', exact: true }).count(), 0, 'An established Home balance does not blink into a skeleton');
      await receive('wallet.balance', { coins: 500 + i });
      await receive('data.loading', { resource: 'wallet', loading: false });
      await receive('presence.saved', { online: true, visible: true });
      await receive('data.chats', { chats: [] });
      await receive('realtime.status', { connected: true });
    }
    const stable = await page.evaluate(() => ({
      panel: __stable.panel === document.getElementById('home-feed-panel'),
      hero: __stable.hero === document.getElementById('home-featured-card'),
      grid: __stable.grid === document.getElementById('home-host-grid'),
      header: __stable.header === document.querySelector('.zh-header'),
      nav: __stable.nav === document.querySelector('[data-tab="home"]'),
      cards: __stable.cards.every(card => card.isConnected),
      photos: __stable.images.every(img => img.isConnected && img.complete && img.naturalWidth && !img.classList.contains('zh-photo-pending')),
      focus: document.activeElement === __stable.focus,
      scroll: document.getElementById('scroll-root').scrollTop === __stable.scroll,
      removedImages: __stable.removedImages
    }));
    assert.deepEqual(stable, { panel: true, hero: true, grid: true, header: true, nav: true, cards: true, photos: true, focus: true, scroll: true, removedImages: 0 });
    assert.equal(await page.locator('.zh-wallet-value').innerText(), '511', 'Live values still update');
    assert.match(await page.locator(`[data-host-id="${hosts[3].id}"]`).innerText(), /Updated 11/);
    await receive('data.home', { ...feed(hosts.slice(0, 8).map((host, at) => at === 3 ? { ...host, name: 'Renamed creator' } : host)), background: true });
    assert.equal(await page.evaluate(() => __stable.images.every(img => img.isConnected && !img.classList.contains('zh-photo-pending'))), true, 'Renaming a creator keeps the already decoded photo');
    await receive('data.loading', { resource: 'home', loading: false, page: 1, background: true, error: 'Updates are temporarily unavailable' });
    assert.equal(await page.locator('article[data-host-id]').count(), 8, 'A background error keeps the existing feed');
    await page.getByRole('button', { name: 'Retry updates', exact: true }).waitFor();
    await receive('data.home', { ...feed(hosts.slice(0, 8)), background: true });
    await receive('data.loading', { resource: 'home', loading: false, background: true });
    await page.evaluate(() => {
      __stable.observer.disconnect(); document.activeElement.blur();
      document.getElementById('scroll-root').scrollTop = 0; HomeFeatured.offscreen = false;
      HomeFeatured.paused = false; homeFeaturedSchedule();
      document.getElementById('home-host-grid').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    });
    assert.equal(await page.evaluate(() => HomeFeatured.touching && !HomeFeatured.timer), true, 'Touching or scrolling the feed holds automatic profile rotation');
    await page.evaluate(() => {
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }));
      HomeFeatured.paused = true; homeFeaturedStop();
      window.__rotationCards = [...document.querySelectorAll('#home-host-grid article[data-host-id]')].slice(1);
      homeFeaturedNext();
    });
    assert.equal(await page.evaluate(() => __rotationCards.every(card => card.isConnected)), true, 'Featured rotation does not rebuild the unaffected grid cards');
    assert.equal(await page.locator('article[data-host-id]').count(), 8, 'Featured rotation never duplicates a creator');

    await receive('data.home', feed(hosts.slice(0, 4), { total: 12 }));
    await receive('data.home', feed(hosts.slice(4, 8), { page: 2, total: 12 }));
    await page.evaluate(() => { window.__pageTwo = document.querySelector('#home-host-grid article:last-child'); });
    await receive('data.loading', { resource: 'home', loading: true, page: 1, background: true });
    await receive('data.home', { ...feed(hosts.slice(0, 4), { total: 12 }), background: true });
    await receive('data.loading', { resource: 'home', loading: false, page: 1, background: true });
    assert.equal(await page.locator('article[data-host-id]').count(), 8, 'A first-page live update retains later pages');
    assert.equal(await page.evaluate(() => Home.page === 2 && __pageTwo.isConnected), true);
    await page.evaluate(() => homeLoad(true));
    assert.equal(await page.evaluate(() => __sent.filter(message => message.type === 'home.reload').at(-1).data.page), 3, 'Pagination continues from the loaded page');
    await receive('data.home', feed(hosts.slice(8), { page: 3, total: 12 }));
    await receive('data.loading', { resource: 'home', loading: false, page: 3 });
    assert.equal(await page.locator('article[data-host-id]').count(), 12);

    await page.evaluate(() => { go('chats'); go('home'); });
    await page.locator('#home-feed-panel').waitFor();
    assert.equal(await page.locator('article[data-host-id]').count(), 12, 'Returning from a different screen cannot reuse an outdated render cache');
    await page.evaluate(() => homeDashboardFilter('following'));
    assert.ok(await page.locator('.zh-dashboard .zh-skeleton').count() > 0, 'An intentional filter change still shows its real loading state');
    await receive('data.home', feed([hosts[11]]));
    await receive('data.loading', { resource: 'home', loading: false, page: 1 });
    assert.deepEqual(await page.locator('article[data-host-id]').evaluateAll(nodes => nodes.map(node => node.dataset.hostId)), [hosts[11].id]);
    assert.equal(navigations, 1, 'All updates use the current document without a WebView reload');
    assert.deepEqual(errors, []);
    console.log('PASS Home stability: 12 update bursts, decoded photos and cards retained, focus/scroll preserved, quiet wallet refresh, error recovery, stable featured rotation, retained pagination, navigation/filter isolation and no document reload');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
