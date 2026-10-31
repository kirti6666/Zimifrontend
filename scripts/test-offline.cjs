/* Offline presentation and recovery contracts. No account or network service is used. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const account = { user: { id: '507f1f77bcf86cd799439019', name: 'Offline tester', role: 'sender', hostStatus: 'none', isVerifiedHost: false }, verification: 'none', requiresOnboarding: false };
const host = { id: '507f1f77bcf86cd799439011', name: 'Mira North', category: 'Music', role: 'host', serverRole: 'host', hostStatus: 'approved', isVerifiedHost: true, online: true, verified: true, availableForCall: true, ratePerMin: 0, entryFee: 0 };
const feed = { hosts: [host], stage: [], featured: host, total: 1, page: 1, categories: ['Music'], availableCount: 1 };
const receive = (page, type, data = {}) => page.evaluate(message => Native.receive(message), { type, data });
const sentCount = (page, type) => page.evaluate(value => __sent.filter(message => message.type === value).length, type);
const panel = page => page.locator('#zimi-offline-screen');
const banner = page => page.locator('#zimi-offline-banner');
const offlineHidden = async page => {
  await panel(page).waitFor({ state: 'hidden' });
  await banner(page).waitFor({ state: 'hidden' });
};
const chromeSize = page => page.evaluate(() => ['top', 'nav'].map(id => {
  const { width, height } = document.getElementById(id).getBoundingClientRect();
  return { id, width, height };
}));

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  async function open({ demo = false, preview = false, offline = false, native = false, role = true } = {}) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', offline });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && !/^Failed to load resource: net::ERR_/.test(message.text())) errors.push(message.text());
    });
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(hasNative => {
      window.__sent = [];
      if (hasNative) window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) };
    }, native);
    const query = new URLSearchParams();
    if (role) query.set('role', 'sender');
    if (preview) query.set('preview', 'offline');
    await page.goto(pathToFileURL(path.join(root, demo ? 'dist/index.html' : 'assets/aurora.html')).href + '?' + query);
    return page;
  }
  try {
    await fs.mkdir(artifacts, { recursive: true });
    const preview = await open({ demo: true, preview: true });
    await panel(preview).getByRole('heading', { name: "You're offline", exact: true }).waitFor();
    assert.equal(await preview.locator('#screen').count(), 1, 'The offline view retains the underlying screen');
    const dimensions = await chromeSize(preview);
    for (const mode of ['original', 'rose']) {
      await preview.evaluate(mode => {
        const theme = ZThemes.catalog.items.filter(item => !item.isPremium)[mode === 'original' ? 0 : 1];
        if (!theme) throw new Error('Missing free preview theme: ' + mode);
        ztSelect(theme.id);
      }, mode);
      assert.equal(await preview.evaluate(() => document.documentElement.dataset.theme), 'light');
      for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
        await preview.setViewportSize(viewport);
        assert.equal(await preview.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${mode} offline page fits ${viewport.width}px`);
        assert.equal(await panel(preview).evaluate(el => el.scrollWidth > el.clientWidth + 1), false, `${mode} offline panel has no horizontal overflow`);
        const retry = panel(preview).getByRole('button', { name: 'Try again', exact: true });
        await retry.scrollIntoViewIfNeeded();
        const bounds = await retry.boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y >= 0 && bounds.y + bounds.height <= viewport.height + 1, 'Retry remains reachable on a small screen');
      }
      await preview.screenshot({ path: path.join(artifacts, `offline-preview-${mode}.png`) });
    }
    assert.deepEqual(await chromeSize(preview), dimensions, 'Theme changes and offline presentation retain shared chrome dimensions');
    const animations = await panel(preview).evaluate(el => [el, ...el.querySelectorAll('*')].flatMap(node => {
      const style = getComputedStyle(node);
      return style.animationName.split(',').map((name, index) => ({ name: name.trim(), duration: parseFloat(style.animationDuration.split(',')[index] || style.animationDuration) }));
    }));
    assert.ok(animations.every(animation => animation.name === 'none' || animation.duration <= 0.01), 'Reduced motion disables decorative offline animation');
    await panel(preview).getByRole('button', { name: 'Try again', exact: true }).click();
    await offlineHidden(preview);
    assert.equal(await preview.evaluate(() => S.v), 'home');
    console.log('PASS offline preview: white-canvas accent screenshots, responsive layouts, reduced motion, retry and stable chrome');

    // The compact profile fits a tall phone, so saved positions are checked on a short one.
    await preview.setViewportSize({ width: 390, height: 568 });
    const scroll = preview.locator('#scroll-root');
    const homeScroll = await scroll.evaluate(el => { el.scrollTop = 220; return el.scrollTop; });
    assert.ok(homeScroll > 100, 'The preview home has enough content to verify saved scroll');
    await preview.getByRole('button', { name: 'Profile', exact: true }).click();
    const profileScroll = await scroll.evaluate(el => { el.scrollTop = 130; return el.scrollTop; });
    assert.ok(profileScroll > 50, 'Profile has a distinct saved scroll position');
    await preview.getByRole('button', { name: 'Home', exact: true }).click();
    assert.ok(Math.abs(await scroll.evaluate(el => el.scrollTop) - homeScroll) < 2);
    await preview.context().setOffline(true);
    await panel(preview).waitFor({ state: 'visible' });
    assert.equal(await scroll.evaluate(el => el.scrollTop), 0, 'Entering offline mode starts at the top of the offline panel');
    await preview.getByRole('button', { name: 'Profile', exact: true }).click();
    await banner(preview).waitFor({ state: 'visible' });
    await panel(preview).waitFor({ state: 'hidden' });
    assert.ok(Math.abs(await scroll.evaluate(el => el.scrollTop) - profileScroll) < 2, 'Offline Profile retains its own content position under the compact banner');
    await preview.getByRole('button', { name: 'Home', exact: true }).click();
    await panel(preview).waitFor({ state: 'visible' });
    assert.equal(await scroll.evaluate(el => el.scrollTop), 0, 'Returning to offline Home starts at the panel top');
    await preview.context().setOffline(false);
    await offlineHidden(preview);
    assert.ok(Math.abs(await scroll.evaluate(el => el.scrollTop) - homeScroll) < 2, 'Recovery restores the home content position saved before it was covered');
    await preview.getByRole('button', { name: 'Profile', exact: true }).click();
    assert.ok(Math.abs(await scroll.evaluate(el => el.scrollTop) - profileScroll) < 2, 'Offline navigation does not overwrite the other primary tab scroll position');
    await preview.setViewportSize({ width: 390, height: 844 });
    await preview.evaluate(() => go('all-creators'));
    assert.equal(await preview.locator('#nav').isVisible(), false, 'All Creators is a detail page without bottom tabs');
    await preview.context().setOffline(true);
    await panel(preview).waitFor({ state: 'visible' });
    await banner(preview).waitFor({ state: 'hidden' });
    await receive(preview, 'app.back');
    assert.equal(await preview.evaluate(() => S.v), 'home', 'Android Back leaves the covered directory for Home');
    assert.equal(await preview.locator('#nav').isVisible(), true, 'Back restores Home tabs during connectivity loss');
    await preview.context().setOffline(false);
    await offlineHidden(preview);
    console.log('PASS offline navigation: covered Home, preserved Profile scroll and All Creators detail-page Back recovery');

    const production = await open({ preview: true, native: true, role: false });
    await offlineHidden(production);
    assert.equal(await production.evaluate(() => DEMO), false, 'The offline preview switch is limited to the demo build');

    const cold = await open({ offline: true, role: false });
    assert.equal(await cold.evaluate(() => navigator.onLine), false);
    await panel(cold).getByRole('heading', { name: "You're offline", exact: true }).waitFor();
    await cold.context().setOffline(false);
    await offlineHidden(cold);
    console.log('PASS offline browser: a cold launch detects missing connectivity and automatically recovers');

    const page = await open({ native: true });
    await receive(page, 'session', account);
    await receive(page, 'data.home', feed);
    await receive(page, 'data.loading', { resource: 'home', loading: false });
    await receive(page, 'connection.status', { connected: true, checking: false });
    const onlineChrome = await chromeSize(page);
    await page.evaluate(() => { window.__screen = document.getElementById('screen'); window.__content = __screen.firstElementChild; });
    const reloadBeforeBrowserLoss = await sentCount(page, 'data.reload');
    const checksBeforeBrowserLoss = await sentCount(page, 'connection.check');
    await page.context().setOffline(true);
    await panel(page).getByRole('heading', { name: "You're offline", exact: true }).waitFor();
    assert.deepEqual(await chromeSize(page), onlineChrome, 'Losing connectivity leaves the shared header and tabs the same size');
    assert.equal(await page.evaluate(() => __screen === document.getElementById('screen') && __content === __screen.firstElementChild), true, 'Offline presentation never replaces the current content DOM');
    assert.equal(await page.locator('#screen').isVisible(), false, 'Stale home content is hidden behind the dedicated offline presentation');
    await page.context().setOffline(false);
    await page.waitForFunction(expected => __sent.filter(message => message.type === 'connection.check').length === expected, checksBeforeBrowserLoss + 1);
    assert.equal(await panel(page).locator('button').first().isDisabled(), true, 'Restored device connectivity waits for a real native reachability check');
    await receive(page, 'connection.status', { connected: true, checking: false });
    await offlineHidden(page);
    assert.equal(await page.locator('#screen').isVisible(), true);
    assert.equal(await sentCount(page, 'data.reload'), reloadBeforeBrowserLoss + 1, 'A recovered signed-in session refreshes once');
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    assert.equal(await sentCount(page, 'data.reload'), reloadBeforeBrowserLoss + 1, 'Repeated online events do not start duplicate refreshes');
    console.log('PASS offline browser: warm loss, preserved content/chrome and single automatic refresh');

    const reloadBeforeNativeLoss = await sentCount(page, 'data.reload');
    const checksBefore = await sentCount(page, 'connection.check');
    await receive(page, 'connection.status', { connected: false, checking: false });
    await panel(page).getByRole('heading', { name: 'Connection lost', exact: true }).waitFor();
    await panel(page).getByRole('button', { name: 'Try again', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.evaluate(() => { ZimiOffline.retry(); ZimiOffline.retry(); });
    assert.equal(await sentCount(page, 'connection.check'), checksBefore + 1, 'Rapid repeated retry taps send only one connectivity check');
    await receive(page, 'connection.status', { connected: false, checking: true });
    await panel(page).getByText('Checking connection…', { exact: true }).waitFor();
    assert.equal(await panel(page).locator('button').first().isDisabled(), true, 'Retry is disabled while checking');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'zo-title', 'A pending keyboard retry moves focus to the visible status heading');
    await receive(page, 'connection.status', { connected: false, checking: false });
    assert.equal(await panel(page).getByRole('button', { name: 'Try again', exact: true }).isEnabled(), true, 'A failed check enables a subsequent retry');
    assert.equal(await page.evaluate(() => document.activeElement.matches('#zimi-offline-screen .zo-retry')), true, 'A failed check restores keyboard focus to retry');
    await page.keyboard.press('Enter');
    assert.equal(await sentCount(page, 'connection.check'), checksBefore + 2);
    await receive(page, 'operation.error', { action: 'connection.check', message: 'Connection check unavailable' });
    assert.equal(await panel(page).getByRole('button', { name: 'Try again', exact: true }).isEnabled(), true, 'A native check error settles the pending retry');
    await receive(page, 'connection.status', { connected: true, checking: false });
    await offlineHidden(page);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'screen', 'Recovery returns keyboard focus to the visible content');
    assert.equal(await sentCount(page, 'data.reload'), reloadBeforeNativeLoss + 1);
    await receive(page, 'connection.status', { connected: true, checking: false });
    assert.equal(await sentCount(page, 'data.reload'), reloadBeforeNativeLoss + 1, 'Duplicate native success events do not duplicate reloads');
    console.log('PASS offline native: server-specific copy, pending/failed retry and deduplicated recovery');

    await page.getByRole('button', { name: 'Search creators', exact: true }).click();
    const search = page.getByRole('textbox', { name: 'Search creators', exact: true });
    await search.fill('Mira');
    await page.waitForFunction(() => __sent.filter(message => message.type === 'hosts.search').at(-1)?.data.q === 'Mira');
    await receive(page, 'data.search', { q: 'Mira', hosts: [host], total: 1, page: 1 });
    await receive(page, 'data.loading', { resource: 'search', loading: false, q: 'Mira', page: 1 });
    const searchesBeforeLoss = await sentCount(page, 'hosts.search');
    await receive(page, 'connection.status', { connected: false, checking: false });
    await panel(page).waitFor({ state: 'visible' });
    await receive(page, 'connection.status', { connected: true, checking: false });
    await offlineHidden(page);
    assert.equal(await search.inputValue(), 'Mira', 'Recovery keeps the current search text');
    assert.equal(await sentCount(page, 'hosts.search'), searchesBeforeLoss + 1, 'Recovery refreshes the contextual creator search');
    assert.deepEqual(await page.evaluate(() => __sent.filter(message => message.type === 'hosts.search').at(-1).data), { q: 'Mira', page: 1 }, 'The search retry uses the current query and first page');
    await receive(page, 'connection.status', { connected: true, checking: false });
    assert.equal(await sentCount(page, 'hosts.search'), searchesBeforeLoss + 1, 'Duplicate connection events do not repeat the search');
    console.log('PASS offline search: reconnect retries the current query exactly once');

    await receive(page, 'data.chats', { chats: [{ user: host, last: 'Hello from Mira', time: 'Today', unread: 0 }] });
    await page.evaluate(id => go('thread', id), host.id);
    await receive(page, 'data.thread', { with: host.id, messages: [], canSend: true });
    await receive(page, 'data.loading', { resource: 'thread', loading: false });
    const draft = page.locator('#ti');
    await draft.fill('Keep this message until the connection returns');
    await draft.focus();
    await page.evaluate(() => { window.__draft = document.getElementById('ti'); });
    const threadReadsBeforeLoss = await sentCount(page, 'chat.open');
    await receive(page, 'connection.status', { connected: false, checking: false });
    await banner(page).waitFor({ state: 'visible' });
    await panel(page).waitFor({ state: 'hidden' });
    assert.equal(await draft.inputValue(), 'Keep this message until the connection returns');
    assert.equal(await page.evaluate(() => __draft === document.getElementById('ti') && document.activeElement === __draft), true, 'A lost connection preserves the exact composer node and keyboard focus');
    const composerBounds = await draft.boundingBox();
    assert.ok(composerBounds && composerBounds.y >= 0 && composerBounds.y + composerBounds.height <= 844, 'The compact banner keeps the thread composer inside the viewport: ' + JSON.stringify(composerBounds));
    await receive(page, 'connection.status', { connected: true, checking: false });
    await offlineHidden(page);
    assert.equal(await draft.inputValue(), 'Keep this message until the connection returns');
    assert.equal(await page.evaluate(() => __draft === document.getElementById('ti')), true, 'Recovery leaves an unsent draft in place');
    assert.equal(await sentCount(page, 'chat.open'), threadReadsBeforeLoss + 1, 'Recovery refreshes the active conversation');
    assert.deepEqual(await page.evaluate(() => __sent.filter(message => message.type === 'chat.open').at(-1).data), { with: host.id }, 'The conversation retry targets the currently open person');
    await receive(page, 'connection.status', { connected: true, checking: false });
    assert.equal(await sentCount(page, 'chat.open'), threadReadsBeforeLoss + 1, 'Duplicate connection events do not repeat the conversation read');

    await page.evaluate(id => go('precall', id), host.id);
    await page.getByRole('button', { name: 'Start video call', exact: true }).click();
    await page.waitForFunction(() => __sent.some(message => message.type === 'call.start'));
    await receive(page, 'call.connected', { callId: 'offline-test-call', initiator: true, peerId: host.id, voice: false });
    await page.locator('.zr-call').waitFor();
    await page.evaluate(() => { window.__call = document.querySelector('.zr-call'); });
    await receive(page, 'connection.status', { connected: false, checking: false });
    await banner(page).waitFor({ state: 'visible' });
    await panel(page).waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.zr-call').isVisible(), true, 'An active call stays visible during connection loss');
    assert.equal(await page.evaluate(() => __call === document.querySelector('.zr-call')), true, 'An offline banner never remounts an active call');
    const callControls = await page.locator('.zr-call-dock').boundingBox();
    assert.ok(callControls && callControls.y >= 0 && callControls.y + callControls.height <= 844, 'The compact banner keeps call controls inside the viewport: ' + JSON.stringify(callControls));
    await receive(page, 'connection.status', { connected: true, checking: false });
    await offlineHidden(page);
    assert.equal(await page.evaluate(() => __call === document.querySelector('.zr-call')), true);
    await receive(page, 'call.ended', { callId: 'offline-test-call' });
    console.log('PASS offline continuity: the compact banner preserves thread drafts, focus and active-call DOM');

    await receive(production, 'session.error', { message: 'Connection interrupted' });
    await receive(production, 'connection.status', { connected: false, checking: false });
    await panel(production).waitFor({ state: 'visible' });
    const resumesBefore = await sentCount(production, 'session.resume');
    await receive(production, 'connection.status', { connected: true, checking: false });
    await offlineHidden(production);
    assert.equal(await sentCount(production, 'session.resume'), resumesBefore + 1, 'Recovery retries a failed session restore');
    await receive(production, 'connection.status', { connected: true, checking: false });
    assert.equal(await sentCount(production, 'session.resume'), resumesBefore + 1);
    assert.deepEqual(errors, [], 'Offline transitions have no JavaScript or bridge-handler errors');
    console.log('PASS offline recovery: interrupted sign-in restoration resumes once');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
