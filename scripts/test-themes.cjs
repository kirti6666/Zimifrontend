/* Browser contracts for server-owned appearance and verified premium access. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const user = { user: { id: '507f1f77bcf86cd799439011', name: 'Theme tester', role: 'sender', hostStatus: 'none', isVerifiedHost: false }, verification: 'none', requiresOnboarding: false };
const receive = (page, type, data) => page.evaluate(message => Native.receive(message), { type, data });
const sent = (page, type) => page.evaluate(type => __sent.filter(message => message.type === type), type);

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  async function open(demo, reducedMotion = 'reduce') {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion });
    page.setDefaultTimeout(5000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => { window.__sent = []; window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) }; });
    await page.goto(pathToFileURL(path.join(root, demo ? 'dist/index.html' : 'assets/aurora.html')).href + '?role=sender');
    if (!demo) await receive(page, 'session', user);
    await page.evaluate(() => { go('profile'); ztOpen(); });
    return page;
  }
  try {
    const preview = await open(true, 'no-preference');
    fs.mkdirSync(artifacts, { recursive: true });
    assert.equal(await preview.evaluate(() => S.v), 'themes', 'Appearance opens its own page');
    assert.equal(await preview.getByRole('dialog').count(), 0, 'Appearance is not a modal');
    assert.equal(await preview.getByRole('heading', { name: 'Appearance & Theme', exact: true }).count(), 1);
    assert.equal(await preview.getByRole('button', { name: 'Back to profile', exact: true }).count(), 1);
    assert.equal(await preview.locator('.zh-header').count(), 0, 'The theme page has no Home header');
    assert.equal(await preview.locator('.zh-nav button').count(), 0, 'The theme page has no bottom tabs');
    const fixture = await preview.evaluate(() => structuredClone(ZThemes.catalog));
    fixture.premium.paymentsAvailable = true;
    for (const width of [320, 390, 768, 1280]) {
      await preview.setViewportSize({ width, height: 900 });
      assert.equal(await preview.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await preview.locator('.zt-page').evaluate(el => el.scrollWidth > el.clientWidth + 1), false, `The theme page fits ${width}px`);
      assert.equal(await preview.locator('#zt-content').evaluate(el => el.scrollWidth > el.clientWidth + 1), false, `Theme controls fit ${width}px`);
    }
    await preview.setViewportSize({ width: 390, height: 844 });
    await preview.screenshot({ path: path.join(artifacts, 'theme-page-mobile-dark.png') });
    await preview.evaluate(() => { window.__screenNode = document.getElementById('screen').firstElementChild; window.__navNode = document.getElementById('nav').firstElementChild; });
    await preview.getByRole('button', { name: 'Use Soft Rose', exact: true }).click();
    assert.equal(await preview.evaluate(() => document.documentElement.classList.contains('zt-transition')), true);
    assert.equal(await preview.evaluate(() => __screenNode === document.getElementById('screen').firstElementChild && __navNode === document.getElementById('nav').firstElementChild), true, 'Theme switching never replaces content or shared chrome');
    await preview.waitForFunction(() => !document.documentElement.classList.contains('zt-transition'));
    assert.equal(await preview.locator('.app').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 245, 250)');
    await preview.screenshot({ path: path.join(artifacts, 'theme-page-mobile-light.png') });
    await preview.setViewportSize({ width: 1280, height: 1000 });
    await preview.screenshot({ path: path.join(artifacts, 'theme-page-desktop.png') });
    await preview.setViewportSize({ width: 390, height: 844 });
    await preview.getByRole('button', { name: 'Unlock Midnight Ocean', exact: true }).click();
    assert.equal(await preview.evaluate(() => document.activeElement.id), 'zt-premium');
    await preview.getByRole('button', { name: 'Try premium in preview', exact: true }).click();
    await preview.getByRole('button', { name: 'Use Midnight Ocean', exact: true }).click();
    await preview.waitForFunction(() => !document.documentElement.classList.contains('zt-transition'));
    await preview.getByRole('button', { name: 'Back to profile', exact: true }).click();
    assert.equal(await preview.evaluate(() => S.v), 'profile');
    for (const view of ['home', 'explore', 'chats', 'profile']) {
      await preview.evaluate(view => go(view), view);
      assert.equal(await preview.locator('.app').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(16, 27, 45)');
      assert.match(await preview.locator('body').evaluate(el => getComputedStyle(el).fontFamily), /Poppins/);
      if (view === 'home') assert.equal(await preview.locator('.zh-header').evaluate(el => getComputedStyle(el).height), '63px');
      else {
        assert.equal(await preview.locator('.zh-header').count(), 0, `${view} keeps the branded header on Home`);
        assert.equal(await preview.locator('#top').isVisible(), false, `${view} has no unused header strip`);
      }
    }
    await preview.screenshot({ path: path.join(os.tmpdir(), 'zimi-themes-ocean-profile.png') });
    console.log('PASS dedicated responsive theme page, no modal or tabs, shared palettes/fonts, real color transitions and stable content/chrome');

    for (const origin of ['profile', 'settings']) {
      await preview.evaluate(origin => go(origin), origin);
      await preview.getByRole('button', { name: 'Preferences', exact: true }).click();
      await preview.getByLabel('Search settings', { exact: true }).fill('appearance');
      await preview.getByRole('button', { name: /^Appearance & Theme/ }).click();
      assert.equal(await preview.evaluate(() => S.v), 'themes');
      await preview.getByRole('button', { name: `Back to ${origin}`, exact: true }).click();
      assert.equal(await preview.evaluate(() => S.v), origin, 'Header Back returns to the caller');
      assert.equal(await preview.getByLabel('Search settings', { exact: true }).inputValue(), 'appearance', 'Returning preserves the profile search query');
      assert.equal(await preview.getByRole('button', { name: 'Preferences', exact: true }).getAttribute('aria-pressed'), 'true', 'Returning preserves the profile category');
      await preview.getByRole('button', { name: /^Appearance & Theme/ }).click();
      await receive(preview, 'app.back', {});
      assert.equal(await preview.evaluate(() => S.v), origin, 'Native Back returns to the same caller');
      assert.equal(await preview.getByRole('dialog').count(), 0);
    }
    await preview.evaluate(() => { go('home'); go('themes'); });
    await preview.getByRole('button', { name: 'Back to profile', exact: true }).click();
    assert.equal(await preview.evaluate(() => S.v), 'profile', 'A direct route safely returns to Profile');
    assert.equal((await sent(preview, 'app.exit.request')).length, 0, 'Leaving the theme page never requests app exit');
    console.log('PASS profile/settings origins, native Back, preserved search/category and direct-route fallback');

    const defaultsPage = await open(false, 'no-preference');
    await receive(defaultsPage, 'data.themes', fixture);
    await defaultsPage.waitForFunction(() => !document.documentElement.classList.contains('zt-transition'));
    const customDefault = { ...fixture.items[1], id: '000000000000000000000099', name: 'Admin Slate', isDefault: true };
    const changedDefault = { ...fixture, selectedThemeId: customDefault.id, items: [...fixture.items.map(theme => ({ ...theme, isDefault: false })), customDefault] };
    await defaultsPage.evaluate(() => { window.__defaultScreen = document.getElementById('screen').firstElementChild; });
    await receive(defaultsPage, 'data.themes', changedDefault);
    assert.equal(await defaultsPage.locator('.zt-default').count(), 1);
    assert.equal(await defaultsPage.locator('.zt-default').locator('..').getAttribute('id'), 'zt-theme-' + customDefault.id);
    assert.equal(await defaultsPage.evaluate(() => document.documentElement.dataset.themeId), customDefault.id, 'The server-selected admin default applies to an unselected account');
    assert.equal(await defaultsPage.evaluate(() => document.documentElement.classList.contains('zt-transition')), true, 'Default changes use the same smooth transition');
    assert.equal(await defaultsPage.evaluate(() => __defaultScreen === document.getElementById('screen').firstElementChild), true);
    assert.equal((await sent(defaultsPage, 'themes.select')).length, 0, 'Receiving a default never silently pins it as a user choice');
    await defaultsPage.getByRole('button', { name: 'Current theme: Admin Slate', exact: true }).click();
    const pin = (await sent(defaultsPage, 'themes.select')).at(-1).data;
    assert.equal(pin.themeId, customDefault.id, 'Tapping the current default explicitly saves a personal choice');
    await receive(defaultsPage, 'themes.selected', { catalog: changedDefault, requestId: pin.requestId });
    const newDefaultWithPin = { ...changedDefault, items: changedDefault.items.map(theme => ({ ...theme, isDefault: theme.id === fixture.items[0].id })) };
    await receive(defaultsPage, 'data.themes', newDefaultWithPin);
    assert.equal(await defaultsPage.evaluate(() => document.documentElement.dataset.themeId), customDefault.id, 'A different admin default does not replace the acknowledged user selection');
    assert.equal(await defaultsPage.locator('.zt-default').locator('..').getAttribute('id'), 'zt-theme-' + fixture.items[0].id);
    await receive(defaultsPage, 'data.themes', fixture);
    assert.equal(await defaultsPage.evaluate(() => document.documentElement.dataset.themeId), fixture.selectedThemeId, 'An unavailable custom selection follows the current server default');
    console.log('PASS admin default badge, smooth updates, explicit default pinning and preserved personal selection');

    const page = await open(false);
    await page.getByRole('status', { name: 'Loading themes', exact: true }).waitFor();
    assert.equal((await sent(page, 'themes.load')).length, 1);
    assert.equal(await page.locator('.zt-placeholder .zh-skeleton-shape').first().evaluate(el => getComputedStyle(el).animationName), 'none');
    await receive(page, 'data.loading', { resource: 'themes', loading: false, error: 'Theme service unavailable' });
    await page.getByRole('alert').filter({ hasText: 'Theme service unavailable' }).waitFor();
    await page.getByRole('button', { name: 'Retry loading themes', exact: true }).click();
    await receive(page, 'data.themes', fixture);
    await page.getByRole('button', { name: 'Unlock Midnight Ocean', exact: true }).click();
    assert.equal((await sent(page, 'themes.select')).length, 0, 'A locked card cannot submit selection');
    await page.getByRole('button', { name: 'Use Soft Rose', exact: true }).click();
    let request = (await sent(page, 'themes.select')).at(-1).data;
    assert.equal(await page.evaluate(() => document.documentElement.dataset.themeId), fixture.selectedThemeId, 'Wait for authoritative save before applying');
    assert.equal(await page.getByRole('button', { name: 'Use Soft Rose', exact: true }).isDisabled(), true);
    await receive(page, 'themes.error', { action: 'themes.load', message: 'Background refresh interrupted' });
    assert.equal(await page.getByRole('button', { name: 'Use Soft Rose', exact: true }).isDisabled(), true, 'A background failure cannot release an in-flight selection');
    await receive(page, 'themes.error', { action: 'themes.select', requestId: request.requestId, message: 'Please try saving again' });
    await page.getByRole('alert').filter({ hasText: 'Please try saving again' }).waitFor();
    await page.getByRole('button', { name: 'Use Soft Rose', exact: true }).click();
    const retry = (await sent(page, 'themes.select')).at(-1).data;
    const light = { ...fixture, selectedThemeId: fixture.items[1].id };
    await receive(page, 'themes.selected', { catalog: light, requestId: request.requestId });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.themeId), fixture.selectedThemeId, 'Stale save acknowledgment is ignored');
    await receive(page, 'themes.selected', { catalog: light, requestId: retry.requestId });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('zt-transition')), false, 'Reduced motion disables theme animation');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'zt-theme-' + light.selectedThemeId);
    console.log('PASS catalog skeleton/error/retry, locked selection, acknowledged saves, stale isolation and reduced motion');

    await page.getByRole('button', { name: /^Unlock premium/ }).click();
    const purchaseRequest = (await sent(page, 'themes.premium.checkout')).at(-1).data;
    assert.ok(purchaseRequest.idempotencyKey);
    assert.deepEqual(Object.keys(purchaseRequest), ['idempotencyKey'], 'The client never supplies premium status or price');
    await receive(page, 'themes.error', { action: 'themes.premium.checkout', message: 'Checkout connection interrupted' });
    await page.getByRole('button', { name: /^Unlock premium/ }).click();
    assert.equal((await sent(page, 'themes.premium.checkout')).at(-1).data.idempotencyKey, purchaseRequest.idempotencyKey, 'An uncertain checkout retry reuses its idempotency key');
    const purchase = { purchaseId: 'purchase', merchantOrderId: 'order', status: 'PENDING' };
    await receive(page, 'themes.premium.checkout', purchase);
    await page.getByRole('button', { name: 'Continue checkout', exact: true }).click();
    assert.equal((await sent(page, 'themes.premium.checkout')).at(-1).data.idempotencyKey, purchaseRequest.idempotencyKey, 'Pending checkout can reopen the same order');
    await receive(page, 'themes.premium.checkout', purchase);
    await page.getByRole('button', { name: 'Check payment status', exact: true }).click();
    assert.deepEqual((await sent(page, 'themes.premium.verify')).at(-1).data, { merchantOrderId: 'order' });
    await receive(page, 'themes.premium.purchase', { ...purchase, status: 'SUCCESS' });
    assert.equal(await page.getByRole('button', { name: 'Unlock Midnight Ocean', exact: true }).count(), 1, 'A payment message alone cannot grant premium access');
    const premium = { ...light, premium: { ...light.premium, active: true } };
    await receive(page, 'data.themes', premium);
    await page.getByRole('button', { name: 'Use Midnight Ocean', exact: true }).click();
    request = (await sent(page, 'themes.select')).at(-1).data;
    await receive(page, 'themes.selected', { catalog: { ...premium, selectedThemeId: premium.items[2].id }, requestId: request.requestId });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.themeId), premium.items[2].id);
    await receive(page, 'data.themes', fixture);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.themeId), fixture.selectedThemeId, 'Revoked premium returns to a free theme');
    assert.equal(await page.getByRole('button', { name: /^Unlock premium/ }).isEnabled(), true, 'Revocation allows a new premium purchase');
    await page.getByRole('button', { name: /^Unlock premium/ }).click();
    const failedAttempt = (await sent(page, 'themes.premium.checkout')).at(-1).data.idempotencyKey;
    await receive(page, 'themes.error', { action: 'themes.premium.checkout', code: 'PAYIN_PROVISIONING_FAILED', message: 'Provider setup failed' });
    await page.getByRole('button', { name: /^Unlock premium/ }).click();
    assert.notEqual((await sent(page, 'themes.premium.checkout')).at(-1).data.idempotencyKey, failedAttempt, 'Only explicit terminal provisioning failure starts a new order');
    await receive(page, 'themes.error', { action: 'themes.premium.checkout', message: 'Network unavailable' });
    await receive(page, 'data.themes', { ...fixture, items: [...fixture.items, { ...fixture.items[0], id: 'invalid', name: 'Unsafe colors', colors: { ...fixture.items[0].colors, primary: 'red;position:fixed' } }] });
    assert.equal(await page.getByRole('button', { name: /Unsafe colors/ }).count(), 0);
    const expanded = { ...fixture, items: [...fixture.items, ...fixture.items.map((theme, i) => ({ ...theme, id: 'extra-' + i, name: 'Additional theme ' + i }))] };
    await receive(page, 'data.themes', expanded);
    await page.evaluate(() => { window.__themePage = document.querySelector('.zt-page'); document.getElementById('zt-theme-extra-0').focus({ preventScroll: true }); document.getElementById('scroll-root').scrollTop = 350; });
    await receive(page, 'data.loading', { resource: 'themes', loading: true });
    await receive(page, 'data.themes', expanded);
    assert.equal(await page.locator('#scroll-root').evaluate(el => el.scrollTop), 350, 'Refresh preserves the gallery scroll position');
    assert.equal(await page.evaluate(() => __themePage === document.querySelector('.zt-page')), true, 'Refresh keeps the theme page mounted');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'zt-theme-extra-0', 'Refresh restores keyboard focus');
    await receive(page, 'data.themes', { ...premium, selectedThemeId: premium.items[2].id });
    await page.evaluate(() => logout());
    assert.equal(await page.evaluate(() => ZThemes.catalog), null, 'Explicit logout clears the catalog even without session.none');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.themeId), '000000000000000000000001', 'Signed-out screens show the default theme, never the previous account’s');
    await page.evaluate(() => { go('login'); S.auth = { step: 'otp', requestId: 42, phone: '9000000000' }; });
    await receive(page, 'auth.ok', { ...user, user: { ...user.user, id: '507f1f77bcf86cd799439012' }, requestId: 42 });
    await receive(page, 'themes.error', { action: 'themes.load', message: 'New account catalog unavailable' });
    assert.equal(await page.evaluate(() => ZThemes.accountId), '507f1f77bcf86cd799439012');
    assert.equal(await page.evaluate(() => ZThemes.catalog), null, 'Failed loading on another account never restores prior premium access');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.themeId), fixture.items[0].id);
    await page.evaluate(() => { go('transactions'); S.txf = 'out'; r(); });
    await receive(page, 'data.transactions', { items: [
      { title: 'Lifetime premium themes', time: 'Now', coins: 0, kind: 'topup', displayAmountPaise: -19900 },
      { title: 'Premium themes payment reversed', time: 'Now', coins: 0, kind: 'topup', displayAmountPaise: 19900 },
      { title: 'Coin pack', time: 'Now', coins: 500, kind: 'topup' },
    ] });
    assert.match(await page.locator('.acctcard').innerText(), /Lifetime premium themes[\s\S]*−₹199\.00/);
    assert.doesNotMatch(await page.locator('.acctcard').innerText(), /Coin pack|payment reversed/);
    await page.evaluate(() => { S.txf = 'in'; r(); });
    assert.match(await page.locator('.acctcard').innerText(), /payment reversed[\s\S]*\+₹199\.00/);
    assert.match(await page.locator('.acctcard').innerText(), /Coin pack[\s\S]*\+500/);
    await receive(page, 'session.none', {});
    console.log('PASS idempotent checkout, pending verification, authoritative entitlement, revocation, unsafe data and logout cleanup');

    // Before the catalog answers: the account's cached theme, never another account's, else the admin default.
    const cached = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    cached.on('pageerror', error => errors.push(error.message));
    await cached.route('https://**/*', route => route.abort());
    const blush = { ...fixture.items[1], id: '000000000000000000000005', name: 'Blush & Cream' };
    await cached.addInitScript(cache => { window.__sent = []; window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) }; window.__zimiThemeCache = cache; },
      { default: blush, account: { id: user.user.id, theme: fixture.items[1] } });
    await cached.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href + '?role=sender');
    await receive(cached, 'session', user);
    await cached.evaluate(() => go('home'));
    const paintedId = () => cached.evaluate(() => document.documentElement.dataset.themeId);
    assert.equal(await paintedId(), fixture.items[1].id, 'A restored account paints its last theme before the catalog arrives');
    await receive(cached, 'session', { ...user, user: { ...user.user, id: '507f1f77bcf86cd799439099' } });
    assert.equal(await paintedId(), blush.id, 'Another account never inherits the cached theme; it gets the admin default');
    await receive(cached, 'theme.default', { ...blush, id: '000000000000000000000006' });
    assert.equal(await paintedId(), '000000000000000000000006', 'A changed admin default applies without waiting for a catalog');
    await cached.close();
    console.log('PASS cached account theme, account isolation and the admin default before the catalog arrives');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
