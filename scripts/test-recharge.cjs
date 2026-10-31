/* Insufficient coins use one recoverable recharge dialog. Native-edge fixtures
   only: no accounts, purchases, wallet writes or real message deliveries. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const id = value => value.toString(16).padStart(24, '0');
const member = { user: { id: id(1), name: 'Recharge member', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false, isPhoneVerified: true }, verification: 'none', requiresOnboarding: false };
const host = { id: id(2), name: 'Recharge host', role: 'host', serverRole: 'host', hostStatus: 'approved', verified: true, online: true, availableForCall: true, ratePerMin: 60 };
const paid = { id: id(100), name: 'Paid sticker', emoji: 'Rose', coins: 50, mediaUrl: '' };
const free = { id: id(101), name: 'Free sticker', emoji: 'Rose', coins: 0, mediaUrl: '' };
const catalog = { gifts: [paid, free], packs: [{ id: id(200), name: 'Starter', coins: 200, pricePaise: 9900 }], paymentsAvailable: true };
const receive = (page, type, data = {}) => page.evaluate(message => Native.receive(message), { type, data });
const sends = (page, type) => page.evaluate(type => __sent.filter(message => message.type === type).map(message => message.data), type);
const recharge = page => page.getByRole('dialog', { name: 'Recharge to continue', exact: true });
const gifts = page => page.getByRole('dialog', { name: 'Send a gift', exact: true });
const sendGift = page => gifts(page).getByRole('button', { name: 'Send gift', exact: true });

async function openThread(page) {
  await page.evaluate(peer => zcOpen(peer), host.id);
  await receive(page, 'data.thread', { with: host.id, canSend: true, messages: [] });
}
async function chooseGift(page, gift = paid) {
  await page.evaluate(peer => homeGifts(peer), host.id);
  await receive(page, 'data.catalog', catalog);
  await gifts(page).getByRole('button', { name: gift.name + ', ' + (gift.coins ? gift.coins + ' coins' : 'Free'), exact: true }).click();
}
async function expectPackages(page) {
  assert.equal(await page.evaluate(() => S.v), 'coins', 'Recharge opens the full Coin Packages screen');
  assert.equal(await page.evaluate(() => Home.giftTo), null, 'The gift sheet does not cover packages');
  assert.equal(await recharge(page).count(), 0);
  await receive(page, 'data.catalog', catalog);
  await page.getByRole('group', { name: 'Coin packs', exact: true }).waitFor();
  assert.equal((await sends(page, 'wallet.checkout')).length, 0, 'Opening packages never starts a purchase');
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/^https?:\/\//, route => route.abort());
    await page.addInitScript(() => { window.__sent = []; window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) }; });
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href);
    await receive(page, 'session', member);
    await receive(page, 'data.home', { hosts: [host], total: 1, page: 1 });
    await receive(page, 'wallet.balance', { coins: 0 });
    await openThread(page);
    await page.locator('#ti').fill('Keep this draft while I recharge');
    await chooseGift(page);
    assert.equal(await sendGift(page).isEnabled(), true, 'A low balance still permits the explicit recharge action');
    await sendGift(page).click();
    await recharge(page).waitFor();
    assert.equal((await sends(page, 'gift.send')).length, 0, 'A local shortfall sends no gift request');
    assert.equal(await recharge(page).getByRole('button', { name: 'Recharge', exact: true }).evaluate(button => button === document.activeElement), true, 'The primary action receives focus');

    const artifacts = path.join(root, 'artifacts', 'recharge');
    fs.mkdirSync(artifacts, { recursive: true });
    for (const dark of [false, true]) {
      await page.evaluate(dark => ZimiThemes.setDark(dark), dark);
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 568 });
        const box = await recharge(page).boundingBox();
        assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= 569, 'Recharge stays within the small viewport');
        assert.equal(await recharge(page).evaluate(node => getComputedStyle(node).boxShadow), 'none', 'The pop-up keeps the minimal shared design');
        await page.screenshot({ path: path.join(artifacts, `recharge-${width}-${dark ? 'dark' : 'light'}.png`) });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await receive(page, 'wallet.balance', { coins: 0 });
    assert.equal(await recharge(page).count(), 1, 'A wallet redraw does not duplicate or dismiss the prompt');
    await recharge(page).getByRole('button', { name: 'Not now', exact: true }).click();
    assert.equal(await gifts(page).count(), 1, 'Dismissal keeps the sender at the chosen sticker');
    assert.equal(await page.locator('#ti').inputValue(), 'Keep this draft while I recharge');
    await sendGift(page).click();
    await page.keyboard.press('Escape');
    assert.equal(await recharge(page).count(), 0, 'Escape dismisses recharge first');
    assert.equal(await gifts(page).count(), 1);
    await sendGift(page).click();
    await receive(page, 'app.back');
    assert.equal(await recharge(page).count(), 0, 'Android Back dismisses recharge first');
    assert.equal(await gifts(page).count(), 1);
    await sendGift(page).click();
    await recharge(page).getByRole('button', { name: 'Recharge', exact: true }).click();
    await expectPackages(page);
    assert.equal((await sends(page, 'gift.send')).length, 0);

    // Free catalog items remain sendable with zero coins; funded gifts wait for
    // authoritative confirmation, and a server shortfall uses the same dialog.
    await openThread(page);
    await receive(page, 'wallet.balance', { coins: 0 });
    await chooseGift(page, free);
    await sendGift(page).click();
    const freeAttempt = (await sends(page, 'gift.send')).at(-1);
    assert.equal(freeAttempt.coins, 0);
    assert.equal(await recharge(page).count(), 0, 'Free stickers do not request recharge');
    await receive(page, 'gift.sent', { ...freeAttempt, id: id(300), coins: 0 });
    await receive(page, 'wallet.balance', { coins: 100 });
    await chooseGift(page);
    await sendGift(page).click();
    const paidAttempt = (await sends(page, 'gift.send')).at(-1);
    assert.equal(paidAttempt.coins, paid.coins);
    assert.equal(await recharge(page).count(), 0, 'Funded sends follow the normal send workflow');
    const giftCount = (await sends(page, 'gift.send')).length;
    await receive(page, 'operation.error', { action: 'gift.send', ...paidAttempt, code: 'INSUFFICIENT_COINS', status: 402, message: 'Fixture insufficient balance' });
    await recharge(page).waitFor();
    assert.equal(await page.evaluate(() => Home.giftAttempt), null, 'A definite refusal clears the rejected gift attempt');
    assert.equal(await page.evaluate(() => Home.giftBusy), false);
    assert.equal(await page.evaluate(() => S.bal), 100, 'Refusal never invents a wallet debit');
    await receive(page, 'wallet.balance', { coins: 0 });
    await receive(page, 'data.catalog', catalog);
    assert.equal(await recharge(page).count(), 1);
    await recharge(page).getByRole('button', { name: 'Recharge', exact: true }).click();
    await expectPackages(page);
    assert.equal((await sends(page, 'gift.send')).length, giftCount, 'Recharge never resends a rejected sticker');

    // Messages are currently free. A server refusal must still be recoverable
    // without turning every zero-balance message into a paid feature.
    await openThread(page);
    await page.locator('#ti').fill('A free zero-balance message');
    await page.locator('#ti').press('Enter');
    const message = (await sends(page, 'chat.send')).at(-1);
    assert.equal(message.text, 'A free zero-balance message');
    assert.equal(await recharge(page).count(), 0);
    await receive(page, 'operation.error', { action: 'chat.send', ...message, code: 'INSUFFICIENT_COINS', status: 402, message: 'Fixture message requires coins' });
    await recharge(page).waitFor();
    assert.equal(await page.evaluate(clientId => S.msgs.find(message => message.clientId === clientId)?.status, message.clientId), 'failed', 'A rejected message is not shown as delivered');
    const messageCount = (await sends(page, 'chat.send')).length;
    await recharge(page).getByRole('button', { name: 'Recharge', exact: true }).click();
    await expectPackages(page);
    assert.equal((await sends(page, 'chat.send')).length, messageCount, 'Navigating to packages does not resend messages');

    // Purchasing from an active call preserves its native session and clock.
    await page.evaluate(peer => { S.callId = 'recharge-active-call'; go('call', peer); }, host.id);
    await receive(page, 'wallet.balance', { coins: 0 });
    await chooseGift(page);
    await sendGift(page).click();
    await recharge(page).getByRole('button', { name: 'Recharge', exact: true }).click();
    await expectPackages(page);
    assert.equal(await page.evaluate(() => S.bgCall?.callId), 'recharge-active-call', 'Coin Packages keeps the existing call minimized');
    assert.equal((await sends(page, 'call.end')).length, 0);

    await receive(page, 'operation.error', { action: 'chat.send', code: 'NETWORK_ERROR', status: 500, message: 'Fixture temporary failure' });
    assert.equal(await recharge(page).count(), 0, 'Unrelated failures keep their own recovery');
    await receive(page, 'operation.error', { action: 'chat.send', code: 'INSUFFICIENT_COINS', status: 402, message: 'Fixture insufficient balance' });
    await recharge(page).waitFor();
    await page.evaluate(() => go('home'));
    assert.equal(await recharge(page).count(), 0, 'Navigation clears a stale prompt');
    await receive(page, 'operation.error', { action: 'chat.send', code: 'INSUFFICIENT_COINS', status: 402, message: 'Fixture insufficient balance' });
    await recharge(page).waitFor();
    await receive(page, 'session.none');
    assert.equal(await recharge(page).count(), 0, 'Signing out removes the prompt');
    assert.deepEqual(errors, []);
    console.log('PASS recharge: local/server sticker and message shortfalls, direct packages, no unintended send/purchase, free/funded actions, draft preservation, accessible dismissal, responsive themes and ongoing calls.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
