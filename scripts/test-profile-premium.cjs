/* Premium profile interaction contracts. Native messages are intercepted so
   these checks never read or change a real account. Run after build:web. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const account = {
  user: { id: '507f1f77bcf86cd799439011', name: 'Mira North', role: 'sender', hostStatus: 'none', isVerifiedHost: false, city: 'Pune', about: 'Acoustic songs and long conversations.', languages: ['English', 'Hindi'] },
  verification: 'none', requiresOnboarding: false,
};
const settings = {
  profile: { id: account.user.id, name: account.user.name, bio: account.user.about, city: 'Pune', languages: ['English', 'Hindi'], maskedPhone: '+91 *******3210', isPhoneVerified: true, createdAt: '2026-01-01T10:00:00.000Z' },
  stats: { fans: 17, following: 5, giftsSent: 4, giftsReceived: 9 },
  standing: { level: 3, crown: false },
  preferences: { pushNotifications: false, matchCategory: null, appearance: 'dark' },
  privacy: { discoverable: true, showActivity: true, allowRequests: false },
  categories: ['Music', 'Talk', 'Gaming'],
  capabilities: { pushNotifications: false, nativePushRegistered: false, liveAlerts: false, interfaceLanguages: ['en'], currency: 'INR' },
};
const receive = (page, type, data = {}) => page.evaluate(message => Native.receive(message), { type, data });
const exactButton = (page, name) => page.getByRole('button', { name, exact: true });
const search = page => page.getByLabel('Search settings', { exact: true });
const chip = (page, name) => page.locator('.zp-filters').getByRole('button', { name, exact: true });
const rows = page => page.locator('[data-zp-category]:not([hidden]) .zp-row:not([hidden])');
const groups = page => page.locator('[data-zp-category]:not([hidden])');
const visibleTitles = page => rows(page).locator('.zp-row-text>b').allTextContents();
const capture = async (page, name, selector) => {
  if (selector) await page.locator(selector).evaluate(node => node.scrollIntoView({ block: 'start', behavior: 'instant' }));
  else await page.locator('#scroll-root').evaluate(node => { node.scrollTop = 0; });
  await page.screenshot({ path: path.join(artifacts, `profile-premium-${name}.png`), fullPage: true });
};

async function assertLayout(page, label, expectedNavCount = 4) {
  const actual = await page.locator('.zp-page').evaluate(element => {
    const pageBounds = element.getBoundingClientRect();
    const visible = node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
    return {
      documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      pageOverflow: element.scrollWidth > element.clientWidth + 1,
      clippedControls: [...element.querySelectorAll('button,input')].filter(visible).filter(node => {
        const box = node.getBoundingClientRect();
        return box.left < pageBounds.left - 1 || box.right > pageBounds.right + 1;
      }).map(node => node.getAttribute('aria-label') || node.textContent.trim()),
      runningAnimations: element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length,
    };
  });
  assert.equal(actual.documentOverflow, false, `${label}: no document overflow`);
  assert.equal(actual.pageOverflow, false, `${label}: no profile overflow`);
  assert.deepEqual(actual.clippedControls, [], `${label}: profile controls remain inside the page`);
  assert.equal(actual.runningAnimations, 0, `${label}: reduced motion suppresses decoration and transitions`);
  assert.equal(await page.locator('.zh-header').count(), 0, `${label}: profile uses its own heading without the Home header`);
  assert.equal(await page.locator('#top').isVisible(), false, `${label}: no unused header strip`);
  assert.equal(await page.getByRole('heading', { name: 'Profile & Settings', exact: true }).count(), 1);
  assert.equal(await page.locator('.zh-nav button').count(), expectedNavCount);
}

async function run() {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  async function open(demo = false) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => {
      window.__sent = [];
      window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) };
    });
    await page.goto(pathToFileURL(path.join(root, demo ? 'dist/index.html' : 'assets/aurora.html')).href + (demo ? '?role=host&approvedHost=1' : '?role=sender'));
    if (!demo) await receive(page, 'session', account);
    await page.evaluate(() => go('profile'));
    await page.locator('.zp-page').waitFor();
    if (!demo) {
      await receive(page, 'data.profileSettings', settings);
      await receive(page, 'data.loading', { resource: 'profileSettings', loading: false });
      await receive(page, 'wallet.balance', { coins: 3750, earningsPaise: 0, reservedPaise: 0 });
    }
    return page;
  }
  try {
    const page = await open();
    const allTitles = await visibleTitles(page);
    assert.ok(allTitles.length >= 9, 'All available account settings are present by default');
    assert.equal(await chip(page, 'All settings').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#zp-search-status').getAttribute('role'), 'status');
    assert.equal(await page.locator('.zp-search-empty').isVisible(), false);
    assert.equal(await exactButton(page, 'Edit profile').count(), 1);
    assert.equal(await exactButton(page, 'Your BinzoLive QR code').count(), 1);

    await search(page).fill('language');
    assert.deepEqual(await visibleTitles(page), ['Language & Region']);
    assert.equal(await groups(page).count(), 1, 'Groups without matches disappear');
    assert.equal(await page.locator('.zp-page [hidden]').evaluateAll(nodes => nodes.every(node => !node.getClientRects().length)), true, 'Custom row styles do not override hidden search results');
    assert.match(await page.locator('#zp-search-status').textContent(), /\b1\b/, 'The live status announces the matching setting count');
    assert.equal(await search(page).evaluate(node => node === document.activeElement), true, 'Searching preserves keyboard focus');
    await page.getByRole('button', { name: /^Language & Region/ }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog', { name: 'Language & Region', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0, 'Settings dialogs can close with Escape');
    assert.equal(await search(page).inputValue(), 'language', 'Opening settings preserves the query');
    await exactButton(page, 'Clear search').click();
    assert.equal(await search(page).inputValue(), '');
    assert.deepEqual(await visibleTitles(page), allTitles, 'Clear restores every matching setting');

    for (const [label, category] of [['Account', 'account'], ['Preferences', 'preferences'], ['Support', 'support']]) {
      await chip(page, label).click();
      assert.equal(await chip(page, label).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.zp-filters button[aria-pressed="true"]').count(), 1, 'Only the current category is pressed');
      assert.deepEqual(await groups(page).evaluateAll(nodes => [...new Set(nodes.map(node => node.dataset.zpCategory))]), [category]);
      assert.ok(await rows(page).count() > 0, `${label} contains settings`);
    }
    await search(page).fill('language');
    assert.equal(await rows(page).count(), 0, 'Search and category filters work together');
    assert.equal(await page.locator('.zp-search-empty').isVisible(), true);
    assert.match(await page.locator('#zp-search-status').textContent(), /(?:\b0\b|no settings|no results)/i);
    await exactButton(page, 'Reset filters').click();
    assert.equal(await search(page).inputValue(), '');
    assert.equal(await chip(page, 'All settings').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await visibleTitles(page), allTitles);
    assert.equal(await page.locator('.zp-search-empty').isVisible(), false);

    await chip(page, 'Preferences').click();
    await search(page).fill('language');
    await search(page).evaluate(node => node.setSelectionRange(1, 4));
    await receive(page, 'data.profileSettings', { ...settings, stats: { ...settings.stats, fans: 18 } });
    assert.equal(await search(page).inputValue(), 'language', 'Account refresh preserves the search query');
    assert.deepEqual(await search(page).evaluate(node => ({ focused: document.activeElement === node, start: node.selectionStart, end: node.selectionEnd })), { focused: true, start: 1, end: 4 }, 'Account refresh preserves search focus and the selected text');
    assert.equal(await chip(page, 'Preferences').getAttribute('aria-pressed'), 'true', 'Account refresh preserves the category');
    assert.deepEqual(await visibleTitles(page), ['Language & Region'], 'Refreshed data keeps filters applied');
    await search(page).fill('" <img src=x onerror=window.__premiumXss=1>');
    assert.equal(await page.locator('.zp-search-empty').isVisible(), true);
    assert.equal(await page.evaluate(() => window.__premiumXss), undefined, 'Search text never becomes executable markup');
    assert.equal(await page.locator('.zp-page [onerror],.zp-page script').count(), 0);
    await exactButton(page, 'Reset filters').click();
    console.log('PASS premium profile: search, accessible result count, categories, keyboard dialogs, clear/reset and native refresh');

    await exactButton(page, 'Customize your look').click();
    const appearance = page.locator('.zt-page');
    await appearance.waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0, 'The style shortcut opens a dedicated page');
    assert.equal(await page.locator('.zh-nav button').count(), 0, 'The theme page has no bottom tabs');
    assert.ok(await page.evaluate(() => __sent.some(message => message.type === 'themes.load')), 'The style shortcut loads the real theme catalog');
    const themes = await page.evaluate(() => ({ items: [ZThemeOriginal, ZThemeRose], selectedThemeId: ZThemeOriginal.id, premium: { active: false, pricePaise: 19900, currency: 'INR', paymentsAvailable: false, purchaseType: 'lifetime' } }));
    await receive(page, 'data.themes', themes);
    await exactButton(appearance, 'Use Soft Rose').click();
    const request = await page.evaluate(() => __sent.filter(message => message.type === 'themes.select').at(-1).data);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'The shortcut retains acknowledgment-based theme selection');
    await receive(page, 'themes.selected', { catalog: { ...themes, selectedThemeId: request.themeId }, requestId: request.requestId });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
    await exactButton(page, 'Back to profile').click();
    assert.match(await page.locator('[data-theme-label]').first().textContent(), /Soft Rose/);
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
      await assertLayout(page, `Light profile at ${width}px`);
    }
    console.log('PASS premium profile: theme shortcut waits for server acknowledgment, responsive light layout and reduced motion');

    const preview = await open(true);
    for (const width of [320, 390, 1280]) {
      await preview.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
      await assertLayout(preview, `Dark profile at ${width}px`, 5);
    }
    fs.mkdirSync(artifacts, { recursive: true });
    await preview.setViewportSize({ width: 390, height: 844 });
    await capture(preview, 'mobile-dark');
    await capture(preview, 'mobile-settings', '.zp-settings-tools');
    await exactButton(preview, 'Customize your look').click();
    await exactButton(preview, 'Use Soft Rose').click();
    await exactButton(preview, 'Back to profile').click();
    await assertLayout(preview, 'Light demo profile', 5);
    await capture(preview, 'mobile-light');
    await exactButton(preview, 'Customize your look').click();
    await exactButton(preview, 'Use BinzoLive Original').click();
    await exactButton(preview, 'Back to profile').click();
    await preview.setViewportSize({ width: 1280, height: 1000 });
    await capture(preview, 'desktop');
    assert.deepEqual(errors, [], 'The redesigned profile has no uncaught browser errors');
    console.log('PASS premium profile: 320/390/1280px dark layout and mobile dark/light/desktop screenshots');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
