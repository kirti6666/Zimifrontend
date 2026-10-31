/* Refer a Friend & Earn in the generated bundles: the Settings row and page, sharing and
   applying a friend's code, the once-a-day Home pop-up for members and the call card one
   minute into a video call. Native traffic stays local; no production services are used. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const member = { user: { id: '507f1f77bcf86cd799439001', name: 'Member', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false, isPhoneVerified: true }, verification: 'none', requiresOnboarding: false };
const host = { ...member, user: { ...member.user, id: '507f1f77bcf86cd799439002', role: 'host', serverRole: 'host', hostStatus: 'approved', isVerifiedHost: true }, verification: 'verified' };
const summary = { code: 'AB2CD3', shareUrl: 'https://binzolive.com/?ref=AB2CD3', rewardCoins: 1000, friendBonusCoins: 100, applyDays: 7, friendsJoined: 2, friendsRewarded: 1, coinsEarned: 1000, appliedCode: null, canApplyCode: true };
const creator = { id: '507f1f77bcf86cd799439011', name: 'Aanya', role: 'host', serverRole: 'host', hostStatus: 'approved', isVerifiedHost: true, online: true, availableForCall: true, ratePerMin: 0, country: 'India' };
const feed = { hosts: [creator], stage: [], featured: creator, total: 1, page: 1, limit: 20, categories: [], broadcasterCount: 0, availableCount: 1 };
const receive = (page, type, data = {}) => page.evaluate(message => Native.receive(message), { type, data });
const sent = (page, type) => page.evaluate(type => __sent.filter(message => message.type === type).map(message => message.data), type);
const promo = page => page.locator('#zrf-promo[open]');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  async function open(file, query, account) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(8000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => { window.__sent = []; window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) }; });
    await page.goto(pathToFileURL(path.join(root, file)).href + query);
    if (account) {
      await receive(page, 'session', account);
      await page.evaluate(() => go('home'));
      await receive(page, 'data.home', feed);
      await receive(page, 'data.loading', { resource: 'home', loading: false, page: 1 });
      await receive(page, 'wallet.balance', { coins: 500 });
    }
    return page;
  }
  try {
    // The Home pop-up follows the server's summary, at most once a day.
    const page = await open('assets/aurora.html', '?role=sender', member);
    assert.equal((await sent(page, 'referral.load')).length, 1, 'Home asks for the referral summary once');
    await page.waitForTimeout(2000);
    assert.equal(await promo(page).count(), 0, 'Nothing is promoted before the server confirms the program');
    await receive(page, 'data.referral', summary);
    await promo(page).waitFor();
    assert.match(await promo(page).innerText(), /Refer a Friend & Earn 1,000 Coins[\s\S]*100 coins for joining[\s\S]*Have a friend's code\? Get 100 coins/);
    await promo(page).getByRole('button', { name: 'Not now', exact: true }).click();
    assert.equal(await promo(page).count(), 0);
    await page.evaluate(() => { go('chats'); go('home'); });
    await page.waitForTimeout(2000);
    assert.equal(await promo(page).count(), 0, 'The pop-up shows at most once a day');
    await page.evaluate(id => localStorage.setItem('zimi.referPromo.' + id, '2000-1-1'), member.user.id);
    await page.evaluate(() => { go('chats'); go('home'); });
    await promo(page).waitFor();
    assert.equal((await sent(page, 'referral.load')).length, 1, 'Coming back to Home does not ask again');
    await promo(page).getByRole('button', { name: 'Invite friends', exact: true }).click();
    assert.equal(await page.evaluate(() => S.v), 'refer');
    assert.equal(await page.locator('#nav').isVisible(), false, 'Refer & Earn is a detail page without the bottom tabs');
    assert.equal(await page.locator('#top .zb-back').getAttribute('aria-label'), 'Back to home');

    // The page: code, stats, sharing and a friend's code.
    const refer = page.locator('.zrf-page');
    assert.equal(await refer.locator('.zrf-code').innerText(), 'AB2CD3');
    assert.deepEqual(await refer.locator('.zrf-stats b').allInnerTexts(), ['2', '1', '1,000']);
    await refer.getByRole('button', { name: 'Share invite', exact: true }).click();
    assert.deepEqual(await sent(page, 'referral.share'), [{}], 'Sharing goes through the native share sheet');
    const code = refer.locator('#zrf-code'), applyButton = refer.getByRole('button', { name: 'Apply', exact: true });
    await code.fill('ab2-x');
    await applyButton.click();
    assert.match(await refer.getByRole('alert').innerText(), /6-character code/);
    assert.equal((await sent(page, 'referral.apply')).length, 0, 'A malformed code never reaches the server');
    await code.fill('xy7-zk9');
    await applyButton.click();
    const [request] = await sent(page, 'referral.apply');
    assert.equal(request.code, 'XY7ZK9');
    assert.equal(await refer.getByRole('button', { name: 'Applying…', exact: true }).isDisabled(), true);
    await receive(page, 'referral.error', { requestId: request.requestId + 1, message: 'Old answer' });
    assert.equal(await refer.getByRole('alert').count(), 0, 'An answer for another request is ignored');
    await receive(page, 'referral.error', { requestId: request.requestId, message: "That code doesn't match any account. Check it and try again.", status: 404 });
    assert.match(await refer.getByRole('alert').innerText(), /doesn't match any account/);
    assert.equal(await page.locator('#app-notice').count(), 0, 'A refused code is explained beside the field, not in a toast');
    await refer.locator('#zrf-code').fill('XY7ZK9');
    await refer.getByRole('button', { name: 'Apply', exact: true }).click();
    const retry = (await sent(page, 'referral.apply')).at(-1);
    await receive(page, 'referral.applied', { ...summary, appliedCode: 'XY7ZK9', canApplyCode: false, requestId: retry.requestId });
    assert.match(await page.locator('#app-notice').innerText(), /You got 100 coins/);
    assert.equal(await refer.locator('.zrf-apply').count(), 0, 'The code form closes once a code is used');
    assert.match(await refer.locator('.zrf-joined').innerText(), /You joined with code XY7ZK9/);
    await page.locator('#top .zb-back').click();
    assert.equal(await page.evaluate(() => S.v), 'home');

    // Settings leads with the row, and the page returns there.
    await page.evaluate(() => go('settings'));
    const row = page.locator('.zp-simple-section .zp-simple-row').first();
    assert.equal(await row.innerText(), 'Refer a Friend & Earn 1,000 Coins');
    await row.click();
    assert.equal(await page.evaluate(() => S.v), 'refer');
    assert.equal(await page.locator('#top .zb-back').getAttribute('aria-label'), 'Back to settings');
    assert.ok((await sent(page, 'referral.load')).length >= 2, 'Opening the page refreshes the stats');
    await page.close();

    // Approved hosts get the row and the page, but no Home pop-up.
    const hosting = await open('assets/aurora.html', '?role=host', host);
    await receive(hosting, 'data.referral', summary);
    await hosting.waitForTimeout(2200);
    assert.equal(await promo(hosting).count(), 0, 'Hosts are not interrupted on Home');
    await hosting.close();

    // The call card: a minute into a member's video call, for eight seconds, once per call.
    const calling = await open('dist/index.html', '?role=sender');
    await calling.evaluate(() => { go('call', 'meher'); S.sec = 75; });
    await calling.waitForTimeout(1600);
    assert.equal(await calling.locator('.zrf-call-card').count(), 0, 'No card before the server confirms the program');
    await receive(calling, 'data.referral', summary);
    const card = calling.locator('.zrf-call-card');
    await card.waitFor();
    assert.match(await card.innerText(), /Refer a friend, earn 1,000 coins[\s\S]*first coin purchase[\s\S]*Invite/);
    const [cardBox, dockBox, pipBox] = await Promise.all([card.boundingBox(), calling.locator('.zr-call-dock').boundingBox(), calling.locator('.zr-pip').boundingBox()]);
    assert.ok(cardBox.y + cardBox.height <= dockBox.y, 'The card never covers the call controls');
    assert.ok(cardBox.y + cardBox.height <= pipBox.y, 'The card stays above your camera preview');
    await card.waitFor({ state: 'detached', timeout: 10000 });
    await calling.waitForTimeout(1500);
    assert.equal(await card.count(), 0, 'The card shows once per call');
    await calling.evaluate(() => { endCall(); go('voice', 'meher'); S.sec = 75; });
    await calling.waitForTimeout(1600);
    assert.equal(await card.count(), 0, 'Voice calls stay uninterrupted');
    await calling.close();

    assert.deepEqual(errors, [], 'No browser exceptions');
    console.log('PASS referral: Settings row and page, sharing, friend-code validation/errors/success, once-a-day member-only Home pop-up after the server summary, and a one-time call card above the camera and controls');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
