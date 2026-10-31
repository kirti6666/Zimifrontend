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
    await preview.locator('.zu-own-page').waitFor();
    for (const width of [373, 390, 630, 1280]) {
      await preview.setViewportSize({ width, height: width === 373 || width === 630 ? 1600 : 900 });
      assert.equal(await preview.locator('.zh-header').count(), 0, 'Profile uses its own page heading');
      assert.equal(await preview.locator('#top').isVisible(), false, 'Profile has no unused Home header strip');
      assert.equal(await preview.locator('.zh-nav button').count(), 4);
      assert.equal(await preview.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Profile does not overflow at ${width}px`);
      assert.equal(await preview.locator('.zu-own-page .zh-skeleton').count(), 0, 'The demo profile is immediately usable');
      await preview.screenshot({ path: path.join(os.tmpdir(), `zimi-profile-preview-${width}.png`) });
    }
    const page = await open();
    await receive(page, 'session', account);
    await navigate(page, 'settings');
    await page.locator('.zp-page').waitFor();
    await page.waitForFunction(() => window.__sent.some(message => message.type === 'profile.settings.load'));
    assert.equal(await page.locator('.zp-summary-stats .zh-skeleton-shape').count(), 1, 'Unknown statistics are skeletons rather than fabricated zeroes');
    assert.equal(await page.locator('.zp-balance strong').innerText(), '', 'An unknown wallet does not display sample coins');
    assert.equal(await page.getByRole('switch', { name: '1-on-1 Call Availability', exact: true }).count(), 0, 'Members do not see host availability');
    const animations = await page.locator('.zp-page .zh-skeleton-shape').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).animationName));
    assert.ok(animations.length >= 2 && animations.every(name => name === 'none'), 'Profile skeletons respect reduced motion');
    await settleSettings(page);
    await receive(page, 'wallet.balance', { coins: 3750, earningsPaise: 123450, reservedPaise: 5000 });
    const profile = () => page.locator('.zp-page');
    const row = name => page.locator('.zp-page,.zp-dialog').getByRole('button', { name: new RegExp(`^${name}`) });
    const dialog = name => page.getByRole('dialog', { name, exact: true });
    const close = () => page.getByRole('button', { name: 'Close settings', exact: true }).click();
    const openMenu = async name => { await page.evaluate(() => zpClose()); await profile().getByRole('button', { name, exact: true }).click(); };
    const readyProfile = async () => { await navigate(page, 'settings'); await settleSettings(page, saved); };
    let saved = structuredClone(settings);
    const settleSelf = async () => {
      const request = await lastSent(page, 'profile.load'), user = await page.evaluate(() => S.user);
      await receive(page, 'data.publicProfile', { ...request, profile: { ...user, id: user.id, name: saved.profile.name, about: saved.profile.bio, city: saved.profile.city, languages: saved.profile.languages, verified: user.isVerifiedHost === true, followers: saved.stats.fans, followingCount: saved.stats.following, joined: '2026-01-01T10:00:00Z' } });
    };

    await profile().getByRole('heading', { name: 'Settings', exact: true }).waitFor();
    assert.equal(await page.locator('.zp-summary-copy>b').innerText(), 'Mira North');
    assert.equal(await page.locator('.zp-summary-stats [aria-label="Fans: 17"]').count(), 1);
    assert.equal(await page.locator('.zp-summary-stats [aria-label="Following: 5"]').count(), 1);
    assert.equal(await page.locator('.zp-summary-stats [aria-label="Gifts received: 9"]').count(), 1);
    assert.doesNotMatch(await profile().innerText(), /Aditi Rao|VIP Tier|Host Score|858350921|12\.4k|\$38\.50/i, 'Production never substitutes screenshot identity, scores, or an invented exchange rate');
    assert.equal(await row('1:1 Call Studio').count(), 0);
    await loading(page, 'profileSettings', true);
    assert.equal(await page.locator('.zp-summary-stats .zh-skeleton-shape').count(), 1, 'Reload replaces cached profile statistics with skeletons');
    await loading(page, 'profileSettings', false, { error: 'Account settings are temporarily unavailable' });
    await profile().getByRole('alert').filter({ hasText: 'Account settings are temporarily unavailable' }).waitFor();
    assert.doesNotMatch(await page.locator('.zp-summary-stats').innerText(), /\b17\b/, 'A failed refresh does not present cached statistics as current');
    await profile().getByRole('button', { name: 'Retry', exact: true }).click();
    assert.ok(await sentCount(page, 'profile.settings.load') >= 2);
    await settleSettings(page, saved);
    console.log('PASS profile: responsive layout, production identity/stats/wallet, skeletons, reduced motion and load retry');

    await readyProfile();
    assert.match(await page.locator('.zp-balance strong').innerText(), /3,750/);
    await openMenu('Account');
    await row('Account ID & QR code').click();
    await dialog('Your BinzoLive ID').waitFor();
    assert.equal(await dialog('Your BinzoLive ID').locator('.zp-account-id').innerText(), account.user.id);
    assert.ok(await dialog('Your BinzoLive ID').locator('.zp-qr svg').count() > 0, 'The account ID has a generated QR image');
    await dialog('Your BinzoLive ID').getByRole('button', { name: 'Copy account ID', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.__copied), [account.user.id]);
    await close();
    await openMenu('Account');
    await row('Edit profile').click();
    assert.equal(await page.evaluate(() => S.v), 'editprofile');
    assert.equal(await page.getByLabel('Display name', { exact: true }).inputValue(), 'Mira North');
    await readyProfile();
    await row('Add coins').click();
    assert.equal(await page.evaluate(() => S.v), 'coins');
    assert.ok(await sentCount(page, 'catalog.load') > 0);
    await readyProfile();
    await openMenu('Payments');
    await row('Wallet & Activity').click();
    assert.equal(await page.evaluate(() => S.v), 'wallet');
    await readyProfile();
    await openMenu('Account');
    await row('Phone & Email Security').click();
    assert.match(await dialog('Phone & Email Security').innerText(), /3210/);
    assert.match(await dialog('Phone & Email Security').innerText(), /Verified for sign-in/);
    await close();

    await openMenu('General');
    for (const removed of ['Match & Speed Pulse', 'Notifications & Alerts', '1-on-1 Call Availability'])
      assert.equal(await page.locator('.zp-page,.zp-dialog').getByText(removed, { exact: true }).count(), 0, `${removed} is not a settings item`);
    await row('Language & Region').click();
    const language = dialog('Language & Region');
    const city = language.getByLabel('City / region', { exact: true });
    await city.fill('Mumbai');
    await city.evaluate(input => input.setSelectionRange(1, 4));
    await receive(page, 'data.profileSettings', saved);
    assert.deepEqual(await city.evaluate(input => ({ value: input.value, focused: document.activeElement === input, start: input.selectionStart, end: input.selectionEnd })), { value: 'Mumbai', focused: true, start: 1, end: 4 }, 'Background account refresh preserves an unsaved dialog draft and cursor');
    await language.getByLabel('Hindi', { exact: true }).uncheck();
    await language.getByRole('button', { name: 'Save preferences', exact: true }).click();
    let request = await lastSent(page, 'profile.settings.save');
    assert.equal(request.city, 'Mumbai');
    assert.deepEqual(request.languages, ['English']);
    await language.getByRole('status', { name: 'Saving preferences', exact: true }).waitFor();
    assert.equal(await city.isDisabled(), true);
    assert.deepEqual(await page.evaluate(() => ZProfile.data.profile.languages), ['English', 'Hindi'], 'Pending saves do not claim a persisted preference');
    await receive(page, 'profile.settings.error', { requestId: request.requestId, message: 'Your languages could not be saved' });
    await language.getByRole('alert').filter({ hasText: 'Your languages could not be saved' }).waitFor();
    assert.equal(await language.getByRole('button', { name: 'Save preferences', exact: true }).isEnabled(), true);
    assert.deepEqual(await page.evaluate(() => ZProfile.data.profile.languages), ['English', 'Hindi']);
    await language.getByRole('button', { name: 'Save preferences', exact: true }).click();
    const retry = await lastSent(page, 'profile.settings.save');
    assert.ok(retry.requestId > request.requestId);
    await receive(page, 'profile.settings.saved', { settings: saved, requestId: request.requestId });
    assert.equal(await language.isVisible(), true, 'A stale acknowledgment cannot close a newer request');
    saved = { ...saved, profile: { ...saved.profile, city: 'Mumbai', languages: ['English'] } };
    await receive(page, 'data.profileSettings', saved);
    await receive(page, 'profile.settings.saved', { settings: saved, requestId: retry.requestId });
    await language.waitFor({ state: 'hidden' });
    await navigate(page, 'profile');
    await settleSelf();
    assert.match(await page.locator('.zu-meta').innerText(), /Mumbai/, 'The saved region updates the visible profile');
    await readyProfile();
    await openMenu('General');
    await row('Language & Region').click();
    assert.equal(await dialog('Language & Region').getByLabel('English', { exact: true }).isChecked(), true, 'Saved languages reopen selected');
    assert.equal(await dialog('Language & Region').getByLabel('Hindi', { exact: true }).isChecked(), false);
    await close();
    await openMenu('General');

    await row('Appearance & Theme').click();
    const appearance = page.locator('.zt-page');
    assert.equal(await page.evaluate(() => S.v), 'themes');
    assert.equal(await page.getByRole('dialog').count(), 0, 'Appearance opens a page, not a settings modal');
    await appearance.getByRole('status', { name: 'Loading themes', exact: true }).waitFor();
    const themes = await page.evaluate(() => ({ items: [ZThemeOriginal, ZThemeRose], selectedThemeId: ZThemeOriginal.id, premium: { active: false, pricePaise: 19900, currency: 'INR', paymentsAvailable: false, purchaseType: 'lifetime' } }));
    await receive(page, 'data.themes', themes);
    await appearance.getByRole('button', { name: 'Use Soft Rose', exact: true }).click();
    request = await lastSent(page, 'themes.select');
    assert.equal(request.themeId, themes.items[1].id);
    await receive(page, 'themes.selected', { catalog: { ...themes, selectedThemeId: request.themeId }, requestId: request.requestId });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
    await page.getByRole('button', { name: 'Back to settings', exact: true }).click();
    await page.locator('.zh-nav').getByRole('button', { name: 'Chat', exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light', 'Saved appearance applies across tabs');
    await readyProfile();
    console.log('PASS profile: real ID/QR and edit/wallet actions, settings saves wait for acknowledgment, error recovery, stale response isolation, draft preservation and shared appearance');

    await page.evaluate(() => znPreferences());
    const notifications = dialog('Notification preferences');
    assert.equal(await notifications.getByRole('checkbox', { name: 'Push notifications', exact: true }).isDisabled(), true, 'Unavailable push registration cannot be presented as functional');
    await notifications.getByRole('button', { name: 'Open notifications', exact: true }).click();
    assert.equal(await page.evaluate(() => S.v), 'notifications');
    await readyProfile();
    const pushCapabilities = status => ({ ...saved, capabilities: { ...saved.capabilities, pushNotifications: true, nativePushRegistered: status === 'registered', nativePushStatus: status } });
    await settleSettings(page, pushCapabilities('denied'));
    await page.evaluate(() => znPreferences());
    assert.equal(await notifications.getByRole('checkbox', { name: 'Push notifications', exact: true }).isDisabled(), true, 'Blocked by the phone: the toggle cannot claim to work');
    assert.match(await notifications.innerText(), /turned off for BinzoLive on this phone/);
    await notifications.getByRole('button', { name: 'Turn on notifications', exact: true }).click();
    assert.deepEqual(await lastSent(page, 'push.enable'), {}, 'The native shell decides whether to ask again or open system settings');
    await receive(page, 'data.profileSettings', pushCapabilities('registered'));
    assert.equal(await notifications.getByRole('checkbox', { name: 'Push notifications', exact: true }).isDisabled(), false, 'The open dialog updates once the phone allows notifications');
    assert.equal(await notifications.getByRole('button', { name: 'Turn on notifications', exact: true }).count(), 0);
    for(const name of ['Calls','Messages','Likes','Comments','Gifts','App updates','Following creators coming online','Quiet hours (except calls)'])assert.equal(await notifications.getByRole('checkbox',{name,exact:true}).count(),1);
    assert.equal(await notifications.getByRole('checkbox',{name:'Creator earning inspiration',exact:true}).count(),0,'Members cannot opt into host earning alerts');
    await notifications.getByRole('checkbox',{name:'Messages',exact:true}).uncheck();
    await notifications.getByRole('checkbox',{name:'Quiet hours (except calls)',exact:true}).check();
    await notifications.getByRole('combobox',{name:'Quiet hours start',exact:true}).selectOption('21');
    assert.equal(await page.evaluate(()=>ZProfile.data.preferences.notificationPreferences?.messages),undefined,'Editing nested preferences cannot mutate the saved account before acknowledgment');
    await notifications.getByRole('button',{name:'Save preferences',exact:true}).click();
    const notificationSave=await lastSent(page,'profile.settings.save');
    assert.equal(notificationSave.notificationPreferences.messages,false);assert.equal(notificationSave.notificationPreferences.quietHours.enabled,true);assert.equal(notificationSave.notificationPreferences.quietHours.startHour,21);assert.equal(notificationSave.notificationPreferences.earningsAlerts,false);
    await receive(page,'profile.settings.saved',{requestId:notificationSave.requestId,settings:{...pushCapabilities('registered'),preferences:{...saved.preferences,notificationPreferences:notificationSave.notificationPreferences}}});
    assert.equal(await notifications.count(),0,'Notification preferences wait for the server acknowledgment');
    await receive(page,'session',approved);await settleSettings(page,{...pushCapabilities('registered'),capabilities:{...pushCapabilities('registered').capabilities,earningsAlerts:true}});await page.evaluate(()=>znPreferences());
    assert.equal(await notifications.getByRole('checkbox',{name:'Creator earning inspiration',exact:true}).isChecked(),false,'Competitive earning alerts are opt-in for approved hosts');
    assert.equal(await notifications.getByRole('checkbox',{name:'Following creators coming online',exact:true}).count(),0);
    const checkNotificationLayout=async role=>{
      for(const mode of ['light','dark']){
        await page.setViewportSize({width:320,height:568});await page.evaluate(dark=>ZimiThemes.setDark(dark),mode==='dark');
        await notifications.evaluate(dialog=>{dialog.scrollTop=0;dialog.querySelector('.zp-dialog-body').scrollTop=0});
        assert.equal(await notifications.evaluate(dialog=>dialog.scrollWidth>dialog.clientWidth+1),false,`${role} preferences fit 320px in ${mode} mode`);
        await page.screenshot({path:path.join(os.tmpdir(),`zimi-notification-preferences-${role}-${mode}-top.png`)});
        const save=notifications.getByRole('button',{name:'Save preferences',exact:true});await save.scrollIntoViewIfNeeded();
        const bounds=await save.boundingBox();assert.ok(bounds.y>=0&&bounds.y+bounds.height<=568,`${role} preferences Save remains reachable on a small screen`);
        await page.screenshot({path:path.join(os.tmpdir(),`zimi-notification-preferences-${role}-${mode}-bottom.png`)});
      }
      await page.setViewportSize({width:373,height:1600});await page.evaluate(()=>ZimiThemes.setDark(false));
    };
    await checkNotificationLayout('host');
    await close();
    await receive(page,'session',account);
    await readyProfile();
    await page.evaluate(()=>znPreferences());await checkNotificationLayout('sender');await close();
    await openMenu('Privacy & Terms');
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
    assert.equal(await page.evaluate(() => ZProfile.data.privacy.discoverable), true, 'Privacy remains authoritative while saving');
    await receive(page, 'privacy.error', { requestId: request.requestId, message: 'Privacy changes could not be saved' });
    await privacy.getByRole('alert').filter({ hasText: 'Privacy changes could not be saved' }).waitFor();
    await privacy.getByRole('button', { name: 'Save preferences', exact: true }).click();
    request = await lastSent(page, 'privacy.save');
    saved = { ...saved, privacy: { ...saved.privacy, discoverable: false } };
    await receive(page, 'privacy.saved', { privacy: saved.privacy, requestId: request.requestId });
    await openMenu('Privacy & Terms');
    await row('Privacy & Blocked Users').click();
    assert.equal(await page.getByRole('checkbox', { name: 'Discoverable profile', exact: true }).isChecked(), false, 'The saved discovery choice reopens off');
    await close();

    await openMenu('Payments');
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
    for (const [button, title] of [['Help & tips', 'Help Center'], ['Community Guidelines', 'Community Guidelines']]) {
      if (button === 'Community Guidelines') await openMenu('Privacy & Terms');
      await row(button).click(); await dialog(title).waitFor(); assert.ok((await dialog(title).innerText()).length > 100); await close();
    }
    // Ringing calls and live rooms defer a tap until navigation is safe.
    // Connected/minimized call navigation is covered with real media in test-ongoing-call.
    for (const view of ['incoming', 'live']) {
      await page.evaluate(value => { S.v = value; }, view);
      await receive(page, 'push.opened');
      assert.equal(await page.evaluate(() => S.v), view, `A push tap leaves ${view} on screen`);
    }
    await navigate(page, 'home');
    await receive(page, 'push.opened');
    assert.equal(await page.evaluate(() => S.v), 'notifications');
    assert.ok(await sentCount(page, 'notifications.load') > 0, 'Opening from a push loads the current inbox');
    await readyProfile();
    console.log('PASS profile: capability-aware notifications, blocked account loading/unblock recovery, real privacy saves, gift history and support dialogs');

    for (const hostStatus of ['none', 'pending', 'rejected', 'suspended']) {
      await receive(page, 'session', { ...approved, user: { ...approved.user, hostStatus } });
      await readyProfile();
      assert.equal(await row('1:1 Call Studio').count(), 0);
    }
    await receive(page, 'session', approved);
    await readyProfile();
    await openMenu('Creator tools');
    assert.equal(await page.getByRole('switch', { name: '1-on-1 Call Availability', exact: true }).count(), 0, 'Approved hosts manage availability from Home and the call studio');
    await row('Earnings & Wallet').click();
    assert.match(await dialog('Your Earnings').innerText(), /1,234\.50/);
    assert.match(await dialog('Your Earnings').innerText(), /50\.00 reserved/);
    assert.doesNotMatch(await dialog('Your Earnings').innerText(), /\$/);
    await close();
    await openMenu('Creator tools');
    await row('1:1 Call Studio').click();
    assert.equal(await page.evaluate(() => S.v), 'setup');
    assert.equal(await sentCount(page, 'stream.start'), 0, 'Opening private call studio never starts a broadcast');
    await readyProfile();
    const hostileName = '<img src=x onerror="window.__profileXss=1">';
    const hostileBio = '<svg onload="window.__profileXss=2">About</svg>';
    saved = { ...saved, profile: { ...saved.profile, name: hostileName, bio: hostileBio } };
    await receive(page, 'session', { ...approved, user: { ...approved.user, name: hostileName, about: hostileBio } });
    await readyProfile();
    await navigate(page, 'profile');
    await settleSelf();
    assert.match(await page.locator('.zu-identity h1').innerText(), /<img/);
    assert.equal(await page.locator('.zu-bio').innerText(), hostileBio);
    assert.equal(await page.locator('.zu-page [onload],.zu-page script').count(), 0);
    assert.equal(await page.evaluate(() => window.__profileXss), undefined);
    await readyProfile();
    await row('Log out').click();
    const logout = dialog('Log Out');
    await logout.getByRole('button', { name: 'Stay signed in', exact: true }).click();
    assert.equal(await sentCount(page, 'auth.logout'), 0);
    await row('Log out').click();
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
