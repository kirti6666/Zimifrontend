/* Profile/settings UI contracts. Native reads and writes are simulated locally;
   this suite never edits a real account or sends a notification. */
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const account = {
  user: { id: '507f1f77bcf86cd799439011', name: 'Mira North', role: 'sender', hostStatus: 'none', isVerifiedHost: false, city: 'Pune', about: 'Acoustic songs and long conversations.', languages: ['English', 'Hindi'] },
  verification: 'none', requiresOnboarding: false
};
const approved = { ...account, user: { ...account.user, role: 'host', hostStatus: 'approved', isVerifiedHost: true }, verification: 'verified' };
const settings = {
  profile: { id: account.user.id, name: account.user.name, bio: account.user.about, city: 'Pune', languages: ['English', 'Hindi'], maskedPhone: '+91 ••••••3210', countryCode: '+91', isPhoneVerified: true, createdAt: '2026-01-01T10:00:00.000Z' },
  stats: { fans: 17, following: 5, giftsSent: 4, giftsReceived: 9, coinsSent: 125, coinsReceived: 400 },
  standing: { level: 3, crown: true },
  preferences: { pushNotifications: false, matchCategory: null, appearance: 'dark' },
  privacy: { discoverable: true, showActivity: true, allowRequests: false },
  categories: ['Music', 'Talk', 'Gaming'],
  capabilities: { pushNotifications: false, nativePushRegistered: false, liveAlerts: false, interfaceLanguages: ['en'], currency: 'INR' }
};

async function run() {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  const open = async (demo = false) => {
    const page = await browser.newPage({ viewport: { width: 373, height: 1600 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && !/^Failed to load resource: net::ERR_FAILED/.test(message.text())) errors.push(message.text());
    });
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => {
      window.__sent = [];
      window.__copied = [];
      window.ReactNativeWebView = { postMessage: raw => window.__sent.push(JSON.parse(raw)) };
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => window.__copied.push(text) } });
    });
    await page.goto(pathToFileURL(path.join(root, demo ? 'dist/index.html' : 'assets/aurora.html')).href + (demo ? '?role=host&approvedHost=1' : '?role=sender'));
    return page;
  };
  const receive = (page, type, data = {}) => page.evaluate(message => Native.receive(message), { type, data });
  const loading = (page, resource, value, extra = {}) => receive(page, 'data.loading', { resource, loading: value, ...extra });
  const lastSent = (page, type) => page.evaluate(value => window.__sent.filter(message => message.type === value).at(-1)?.data, type);
  const sentCount = (page, type) => page.evaluate(value => window.__sent.filter(message => message.type === value).length, type);
  const navigate = (page, view) => page.evaluate(value => go(value), view);
  const settleSettings = async (page, data = settings) => { await receive(page, 'data.profileSettings', data); await loading(page, 'profileSettings', false); };
  try {
    const preview = await open(true);
    await preview.locator('.zh-nav').getByRole('button', { name: 'Profile', exact: true }).click();
    await preview.locator('.zp-page').waitFor();
    for (const width of [373, 390, 630, 1280]) {
      await preview.setViewportSize({ width, height: width === 373 || width === 630 ? 1600 : 900 });
      assert.equal(await preview.locator('.zh-header').count(), 0, 'Profile uses its own page heading');
      assert.equal(await preview.locator('#top').isVisible(), false, 'Profile has no unused Home header strip');
      assert.equal(await preview.locator('.zh-nav button').count(), 5);
      assert.equal(await preview.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Profile does not overflow at ${width}px`);
      assert.equal(await preview.locator('.zp-page .zh-skeleton').count(), 0, 'The demo profile is immediately usable');
      await preview.screenshot({ path: path.join(os.tmpdir(), `zimi-profile-preview-${width}.png`) });
    }
    const page = await open();
    await receive(page, 'session', account);
    await navigate(page, 'profile');
    await page.locator('.zp-page').waitFor();
    await page.waitForFunction(() => window.__sent.some(message => message.type === 'profile.settings.load'));
    assert.equal(await page.locator('.zp-stats .zh-skeleton-shape').count(), 4, 'Unknown statistics are skeletons rather than fabricated zeroes');
    assert.equal(await page.locator('.zp-balance strong').innerText(), '', 'An unknown wallet does not flash a fake balance');
    assert.equal(await page.getByRole('switch', { name: '1-on-1 Call Availability', exact: true }).count(), 0, 'Members do not see host availability');
    const animations = await page.locator('.zp-page .zh-skeleton-shape').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).animationName));
    assert.ok(animations.length >= 4 && animations.every(name => name === 'none'), 'Profile skeletons respect reduced motion');
    await settleSettings(page);
    await receive(page, 'wallet.balance', { coins: 3750, earningsPaise: 123450, reservedPaise: 5000 });
    const profile = () => page.locator('.zp-page');
    const row = name => profile().getByRole('button', { name: new RegExp(`^${name}`) });
    const dialog = name => page.getByRole('dialog', { name, exact: true });
    const close = () => page.getByRole('button', { name: 'Close settings', exact: true }).click();
    const readyProfile = async () => { await navigate(page, 'profile'); await settleSettings(page, saved); };
    let saved = structuredClone(settings);
    await profile().getByRole('heading', { name: 'Profile & Settings', exact: true }).waitFor();
    assert.equal(await page.locator('.zp-person h2').innerText(), 'Mira North');
    assert.match(await page.locator('.zp-person-text').innerText(), /Pune/);
    assert.match(await page.locator('.zp-person .zp-id').textContent(), /· Level 3 · Crown$/);
    await settleSettings(page, { ...settings, standing: { level: 3, crown: false } });
    assert.equal(await page.locator('.zp-crown').count(), 0, 'No crown once the server drops it');
    await settleSettings(page);
    assert.match(await page.locator('.zp-bio').innerText(), /Acoustic songs/);
    assert.equal(await page.locator('.zp-stats > div').filter({ hasText: 'Fans' }).locator('b').innerText(), '17');
    assert.equal(await page.locator('.zp-stats > div').filter({ hasText: 'Following' }).locator('b').innerText(), '5');
    assert.equal(await page.locator('.zp-stats > div').filter({ hasText: 'Gifts sent' }).locator('b').innerText(), '4');
    assert.equal(await page.locator('.zp-stats > div').filter({ hasText: 'Gifts received' }).locator('b').innerText(), '9');
    assert.match(await page.locator('.zp-balance strong').innerText(), /3,750/);
    assert.doesNotMatch(await profile().innerText(), /Elena Rostova|VIP Tier|Host Score|858350921|12\.4k|\$38\.50/i, 'Production never substitutes screenshot identity, scores, or an invented exchange rate');
    assert.equal(await row('Creator Studio').count(), 0);
    await loading(page, 'profileSettings', true);
    assert.equal(await page.locator('.zp-stats .zh-skeleton-shape').count(), 4, 'Reload replaces cached profile statistics with skeletons');
    await loading(page, 'profileSettings', false, { error: 'Account settings are temporarily unavailable' });
    await profile().getByRole('alert').filter({ hasText: 'Account settings are temporarily unavailable' }).waitFor();
    assert.doesNotMatch(await page.locator('.zp-stats').innerText(), /\b17\b/, 'A failed refresh does not present cached statistics as current');
    await profile().getByRole('button', { name: 'Retry', exact: true }).click();
    assert.ok(await sentCount(page, 'profile.settings.load') >= 2);
    await settleSettings(page, saved);
    console.log('PASS profile: responsive layout, production identity/stats/wallet, skeletons, reduced motion and load retry');

    await page.getByRole('button', { name: 'Your Zimi QR code', exact: true }).click();
    await dialog('Your Zimi ID').waitFor();
    assert.equal(await dialog('Your Zimi ID').locator('.zp-account-id').innerText(), account.user.id);
    assert.ok(await dialog('Your Zimi ID').locator('.zp-qr svg').count() > 0, 'The account ID has a generated QR image');
    await dialog('Your Zimi ID').getByRole('button', { name: 'Copy account ID', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.__copied), [account.user.id]);
    await close();
    await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
    assert.equal(await page.evaluate(() => S.v), 'editprofile');
    assert.equal(await page.getByLabel('Display name', { exact: true }).inputValue(), 'Mira North');
    await readyProfile();
    await row('Top Up').click();
    assert.equal(await page.evaluate(() => S.v), 'coins');
    assert.ok(await sentCount(page, 'catalog.load') > 0);
    await readyProfile();
    await row('Wallet & Activity').click();
    assert.equal(await page.evaluate(() => S.v), 'wallet');
    await readyProfile();
    await row('Phone & Email Security').click();
    assert.match(await dialog('Phone & Email Security').innerText(), /3210/);
    assert.match(await dialog('Phone & Email Security').innerText(), /Verified for sign-in/);
    await close();

    await row('Match & Speed Pulse').click();
    const match = dialog('Match & Speed Pulse');
    await match.getByLabel('Match category', { exact: true }).selectOption('Music');
    await match.getByRole('button', { name: 'Save preferences', exact: true }).click();
    let request = await lastSent(page, 'profile.settings.save');
    assert.equal(request.matchCategory, 'Music');
    await match.getByRole('status', { name: 'Saving preferences', exact: true }).waitFor();
    assert.equal(await match.getByLabel('Match category', { exact: true }).isDisabled(), true);
    assert.match(await row('Match & Speed Pulse').innerText(), /All creator categories/, 'Pending saves do not claim a persisted preference');
    await receive(page, 'profile.settings.error', { requestId: request.requestId, message: 'Your category could not be saved' });
    await match.getByRole('alert').filter({ hasText: 'Your category could not be saved' }).waitFor();
    assert.equal(await match.getByRole('button', { name: 'Save preferences', exact: true }).isEnabled(), true);
    assert.match(await row('Match & Speed Pulse').innerText(), /All creator categories/);
    await match.getByRole('button', { name: 'Save preferences', exact: true }).click();
    const retry = await lastSent(page, 'profile.settings.save');
    assert.ok(retry.requestId > request.requestId);
    await receive(page, 'profile.settings.saved', { settings: saved, requestId: request.requestId });
    assert.equal(await match.isVisible(), true, 'A stale acknowledgment cannot close a newer request');
    saved = { ...saved, preferences: { ...saved.preferences, matchCategory: 'Music' } };
    await receive(page, 'data.profileSettings', saved);
    await receive(page, 'profile.settings.saved', { settings: saved, requestId: retry.requestId });
    await match.waitFor({ state: 'hidden' });
    assert.match(await row('Match & Speed Pulse').innerText(), /Music/);

    await row('Language & Region').click();
    const language = dialog('Language & Region');
    const city = language.getByLabel('City / region', { exact: true });
    await city.fill('Mumbai');
    await city.evaluate(input => input.setSelectionRange(1, 4));
    await receive(page, 'data.profileSettings', saved);
    assert.deepEqual(await city.evaluate(input => ({ value: input.value, focused: document.activeElement === input, start: input.selectionStart, end: input.selectionEnd })), { value: 'Mumbai', focused: true, start: 1, end: 4 }, 'Background account refresh preserves an unsaved dialog draft and cursor');
    await language.getByLabel('Hindi', { exact: true }).uncheck();
    await language.getByRole('button', { name: 'Save preferences', exact: true }).click();
    request = await lastSent(page, 'profile.settings.save');
    assert.equal(request.city, 'Mumbai');
    assert.deepEqual(request.languages, ['English']);
    saved = { ...saved, profile: { ...saved.profile, city: 'Mumbai', languages: ['English'] } };
    await receive(page, 'data.profileSettings', saved);
    await receive(page, 'profile.settings.saved', { settings: saved, requestId: request.requestId });
    assert.match(await page.locator('.zp-person-text').innerText(), /Mumbai/, 'The saved region updates the visible profile');
    assert.match(await row('Language & Region').innerText(), /English/);
    assert.doesNotMatch(await row('Language & Region').innerText(), /Hindi/);

    await row('Appearance & Theme').click();
    const appearance = dialog('Appearance & Theme');
    await appearance.getByRole('status', { name: 'Loading themes', exact: true }).waitFor();
    const themes = await page.evaluate(() => ({ items: [ZThemeOriginal, ZThemeRose], selectedThemeId: ZThemeOriginal.id, premium: { active: false, pricePaise: 19900, currency: 'INR', paymentsAvailable: false, purchaseType: 'lifetime' } }));
    await receive(page, 'data.themes', themes);
    await appearance.getByRole('button', { name: 'Use Soft Rose', exact: true }).click();
    request = await lastSent(page, 'themes.select');
    assert.equal(request.themeId, themes.items[1].id);
    await receive(page, 'themes.selected', { catalog: { ...themes, selectedThemeId: request.themeId }, requestId: request.requestId });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
    await close();
    await page.locator('.zh-nav').getByRole('button', { name: 'Chats', exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light', 'Saved appearance applies across tabs');
    await readyProfile();
    console.log('PASS profile: real ID/QR and edit/wallet actions, settings saves wait for acknowledgment, error recovery, stale response isolation, draft preservation and shared appearance');

    await row('Notifications & Live Alerts').click();
    const notifications = dialog('Notification preferences');
    assert.equal(await notifications.getByRole('checkbox', { name: 'Push notifications', exact: true }).isDisabled(), true, 'Unavailable push registration cannot be presented as functional');
    await notifications.getByRole('button', { name: 'Open notifications', exact: true }).click();
    assert.equal(await page.evaluate(() => S.v), 'notifications');
    await readyProfile();
    await row('Privacy & Blocked Users').click();
    const privacy = dialog('Privacy & Blocked Users');
    await privacy.getByRole('status', { name: 'Loading blocked accounts', exact: true }).waitFor();
    await loading(page, 'blocked', false, { error: 'Blocked accounts are unavailable' });
    await privacy.getByRole('alert').filter({ hasText: 'Blocked accounts are unavailable' }).waitFor();
    await privacy.getByRole('button', { name: 'Retry', exact: true }).click();
    await privacy.getByRole('status', { name: 'Loading blocked accounts', exact: true }).waitFor();
    const blockedUser = { id: '507f1f77bcf86cd799439019', name: 'Blocked fixture', role: 'sender' };
    await receive(page, 'data.blocked', { users: [blockedUser], total: 1, page: 1, limit: 20 });
    await privacy.getByRole('button', { name: 'Unblock', exact: true }).click();
    const unblock = await lastSent(page, 'block.set');
    assert.equal(unblock.id, blockedUser.id); assert.equal(unblock.blocked, false);
    assert.match(await privacy.innerText(), /Blocked fixture/, 'Sending Unblock does not remove the account before acknowledgment');
    await receive(page, 'block.error', { ...unblock, message: 'Could not unblock this account' });
    await privacy.getByRole('alert').filter({ hasText: 'Could not unblock this account' }).waitFor();
    assert.equal(await privacy.getByRole('button', { name: 'Unblock', exact: true }).isEnabled(), true);
    await privacy.getByRole('button', { name: 'Unblock', exact: true }).click();
    await receive(page, 'block.saved', { id: blockedUser.id, blocked: false });
    await receive(page, 'data.blocked', { users: [], total: 0, page: 1, limit: 20 });
    assert.match(await privacy.innerText(), /No blocked accounts/);
    await privacy.getByRole('checkbox', { name: 'Discoverable profile', exact: true }).uncheck();
    await privacy.getByRole('button', { name: 'Save preferences', exact: true }).click();
    request = await lastSent(page, 'privacy.save');
    assert.equal(request.discoverable, false);
    assert.match(await row('Privacy & Blocked Users').innerText(), /Discovery, activity/, 'Privacy remains authoritative while saving');
    await receive(page, 'privacy.error', { requestId: request.requestId, message: 'Privacy changes could not be saved' });
    await privacy.getByRole('alert').filter({ hasText: 'Privacy changes could not be saved' }).waitFor();
    await privacy.getByRole('button', { name: 'Save preferences', exact: true }).click();
    request = await lastSent(page, 'privacy.save');
    saved = { ...saved, privacy: { ...saved.privacy, discoverable: false } };
    await receive(page, 'privacy.saved', { privacy: saved.privacy, requestId: request.requestId });
    assert.match(await row('Privacy & Blocked Users').innerText(), /Private discovery/);

    await row('Gift History').click();
    const gifts = dialog('Gift History');
    await gifts.getByRole('status', { name: 'Loading gift history', exact: true }).waitFor();
    await loading(page, 'transactions', false, { error: 'Gift history is unavailable' });
    await gifts.getByRole('alert').filter({ hasText: 'Gift history is unavailable' }).waitFor();
    await gifts.getByRole('button', { name: 'Retry', exact: true }).click();
    await receive(page, 'data.transactions', { items: [{ title: 'Gift to a real creator', time: 'Today', coins: -125, kind: 'gift' }, { title: 'Not a gift purchase', time: 'Yesterday', coins: 1000, kind: 'topup' }] });
    assert.match(await gifts.innerText(), /Gift to a real creator/);
    assert.doesNotMatch(await gifts.innerText(), /Not a gift purchase/);
    await gifts.getByRole('button', { name: 'All transactions', exact: true }).click();
    assert.equal(await page.evaluate(() => S.v), 'transactions');
    await readyProfile();
    for (const [button, title] of [['Help Center & Safety Guidelines', 'Help Center'], ['Community Guidelines', 'Community Guidelines']]) {
      await row(button).click(); await dialog(title).waitFor(); assert.ok((await dialog(title).innerText()).length > 100); await close();
    }
    console.log('PASS profile: capability-aware notifications, blocked account loading/unblock recovery, real privacy saves, gift history and support dialogs');

    for (const hostStatus of ['none', 'pending', 'rejected', 'suspended']) {
      await receive(page, 'session', { ...approved, user: { ...approved.user, hostStatus } });
      await readyProfile();
      assert.equal(await page.getByRole('switch', { name: '1-on-1 Call Availability', exact: true }).count(), 0);
      assert.equal(await row('Creator Studio').count(), 0);
      const before = await sentCount(page, 'presence.set');
      await page.evaluate(() => zpAvailabilitySet(true));
      assert.equal(await sentCount(page, 'presence.set'), before);
    }
    await receive(page, 'session', approved);
    await readyProfile();
    const availability = () => page.getByRole('switch', { name: '1-on-1 Call Availability', exact: true });
    assert.equal(await availability().getAttribute('aria-checked'), 'false');
    await availability().click();
    assert.equal((await lastSent(page, 'presence.set')).online, true);
    assert.equal(await availability().isDisabled(), true);
    assert.equal(await availability().getAttribute('aria-checked'), 'false', 'Pending presence changes do not advertise the host as online');
    await receive(page, 'operation.error', { action: 'presence.set', message: 'Presence service unavailable' });
    assert.equal(await availability().isEnabled(), true);
    await availability().click();
    await receive(page, 'presence.saved', { online: true, visible: false });
    assert.equal(await availability().getAttribute('aria-checked'), 'true');
    await row('Earnings & Wallet').click();
    assert.match(await dialog('Your Earnings').innerText(), /1,234\.50/);
    assert.match(await dialog('Your Earnings').innerText(), /50\.00 reserved/);
    assert.doesNotMatch(await dialog('Your Earnings').innerText(), /\$/);
    await close();
    await row('Creator Studio & Go Live').click();
    assert.equal(await page.evaluate(() => S.v), 'broadcast');
    assert.equal(await sentCount(page, 'stream.start'), 0, 'Opening studio never starts a broadcast');
    await readyProfile();
    const hostileName = '<img src=x onerror="window.__profileXss=1">';
    const hostileBio = '<svg onload="window.__profileXss=2">About</svg>';
    saved = { ...saved, profile: { ...saved.profile, name: hostileName, bio: hostileBio } };
    await receive(page, 'session', { ...approved, user: { ...approved.user, name: hostileName, about: hostileBio } });
    await readyProfile();
    assert.match(await page.locator('.zp-person h2').innerText(), /<img/);
    assert.equal(await page.locator('.zp-bio').innerText(), hostileBio);
    assert.equal(await page.locator('.zp-page [onerror],.zp-page [onload],.zp-page script').count(), 0);
    assert.equal(await page.evaluate(() => window.__profileXss), undefined);
    await row('Log Out').click();
    const logout = dialog('Log Out');
    await logout.getByRole('button', { name: 'Stay signed in', exact: true }).click();
    assert.equal(await sentCount(page, 'auth.logout'), 0);
    await row('Log Out').click();
    await logout.getByRole('button', { name: 'Log out of this device', exact: true }).click();
    assert.equal(await sentCount(page, 'auth.logout'), 1);
    assert.equal(await page.locator('.zp-page').count(), 0);
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.deepEqual(errors, [], 'Profile renders without browser errors');
    console.log('PASS profile: approved-host presence and studio, member denial, real INR earnings, escaped account data and explicit logout');
  } finally {
    await browser.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
