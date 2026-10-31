// Paid calls in the app: one-minute minimum, running cost, out-of-coins ending and the final charge.
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const hostId = '507f1f77bcf86cd799439011';
const host = { id: hostId, name: '[Test] Sara', category: 'Fitness', online: true, availableForCall: true, verified: true, ratePerMin: 60, entryFee: 0 };
const account = { user: { id: '507f1f77bcf86cd799439019', name: 'Caller', role: 'sender', hostStatus: 'none', isVerifiedHost: false }, verification: 'none', requiresOnboarding: false };
const receive = (page, type, data) => page.evaluate(message => Native.receive(message), { type, data });
const calls = page => page.evaluate(() => __sent.filter(message => message.type === 'call.start').length);

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => { window.__sent = []; window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) }; });
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href + '?role=sender');
    await receive(page, 'session', account);
    await receive(page, 'data.home', { hosts: [host], stage: [], featured: host, total: 1, page: 1, categories: ['Fitness'], availableCount: 1 });
    const call = async (callId, rate) => {
      const before = await calls(page);
      await page.evaluate(id => go('precall', id), hostId);
      await page.getByRole('button', { name: 'Start video call', exact: true }).click();
      await page.waitForFunction(count => __sent.filter(message => message.type === 'call.start').length > count, before);
      await receive(page, 'call.connected', { callId, initiator: true, peerId: hostId, voice: false, ...(rate ? { rate } : {}) });
      await page.locator('#zr-call-cost').waitFor();
    };
    const summary = () => page.locator('.zh-summary').innerText();

    await receive(page, 'wallet.balance', { coins: 30 });
    await page.evaluate(id => go('precall', id), hostId);
    await page.getByRole('button', { name: 'Buy coins to call' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Start video call', exact: true }).count(), 0, 'Less than a minute of coins cannot start a call');
    assert.match(await page.locator('.zpc-setup').innerText(), /at least 60 coins for a one-minute call/);

    await receive(page, 'wallet.balance', { coins: 500 });
    await receive(page, 'data.home', { hosts: [{ ...host, entryFee: 20 }], total: 1, page: 1 });
    await receive(page, 'wallet.balance', { coins: 60 });
    const beforeFee = await calls(page);
    await page.evaluate(id => go('precall', id), hostId);
    await page.getByRole('button', { name: 'Buy coins to call' }).waitFor();
    await page.evaluate(() => homeStartCall());
    assert.equal(await calls(page), beforeFee, 'Entry fee plus one minute is required before capturing or ringing');
    assert.match(await page.locator('.zpc-setup').innerText(), /at least 80 coins/);
    await receive(page, 'data.home', { hosts: [host], total: 1, page: 1 });
    await receive(page, 'wallet.balance', { coins: 500 });
    await page.getByRole('button', { name: 'Start video call', exact: true }).click();
    await page.waitForFunction(count => __sent.filter(message => message.type === 'call.start').length > count, beforeFee);
    await receive(page, 'call.failed', { code: 'INSUFFICIENT_COINS', requiredCoins: 600, message: 'Not enough coins. Recharge to call.' });
    await page.getByRole('button', { name: 'Buy coins to call' }).waitFor();
    assert.match(await page.locator('.zpc-setup').innerText(), /Recharge to call/);
    await receive(page, 'wallet.balance', { coins: 500 });
    assert.equal(await page.getByRole('button', { name: 'Buy coins to call' }).isVisible(), true, 'A refreshed stale balance cannot hide the server recharge requirement');
    await receive(page, 'wallet.balance', { coins: 700 });
    assert.equal(await page.getByRole('button', { name: 'Start video call', exact: true }).isEnabled(), true, 'Recharge restores explicit Start, without placing a call automatically');
    assert.equal(await calls(page), beforeFee + 1);
    await receive(page, 'data.home', { hosts: [{ ...host, ratePerMin: 30 }], total: 1, page: 1 });
    await receive(page, 'wallet.balance', { coins: 100 });
    assert.equal(await page.getByRole('button', { name: 'Start video call', exact: true }).isEnabled(), true, 'Fresh lower server pricing clears an obsolete recharge requirement');
    await receive(page, 'data.home', { hosts: [host], total: 1, page: 1 });
    await receive(page, 'wallet.balance', { coins: 500 });
    await call('paid', 60);
    const cost = page.locator('#zr-call-cost');
    assert.match(await cost.innerText(), /^60\/min · [01] coins$/);
    await page.evaluate(() => { S.sec = 30; tick(); });
    assert.equal(await cost.innerText(), '60/min · 30 coins', 'The cost grows by the second');
    await receive(page, 'wallet.balance', { coins: 40 });
    await page.evaluate(() => tick());
    assert.equal(await cost.innerText(), '60/min · 30 coins · under a minute left');
    await page.screenshot({ path: path.join(os.tmpdir(), 'zimi-paid-call.png') });
    await receive(page, 'call.ended', { callId: 'paid', coins: 150, reason: 'out_of_coins' });
    await page.getByRole('heading', { name: 'Your coins ran out.' }).waitFor();
    assert.match(await summary(), /Call charge\s*150 coins/);
    await page.screenshot({ path: path.join(os.tmpdir(), 'zimi-out-of-coins.png') });
    await page.getByRole('button', { name: 'Buy coins', exact: true }).click();
    assert.equal(await page.evaluate(() => S.v), 'coins', 'Recharging is one tap away');

    await receive(page, 'wallet.balance', { coins: 500 });
    await call('hangup', 30);
    await page.evaluate(() => { S.sec = 45; });
    await page.locator('.zr-hangup').click();
    assert.match(await summary(), /Call charge\s*23 coins/, 'Hanging up shows the estimate at once: 45 seconds at 30 a minute');
    assert.equal(await page.evaluate(() => __sent.filter(message => message.type === 'call.end').at(-1).data.callId), 'hangup');
    await receive(page, 'call.ended', { callId: 'hangup', coins: 22 });
    await page.waitForFunction(() => /22 coins/.test(document.querySelector('.zh-summary')?.innerText || ''));
    assert.match(await summary(), /A moment well shared/, 'Hanging up is not reported as running out');

    await call('free', 0);
    assert.equal(await page.locator('#zr-call-cost').innerText(), 'Free call');
    await receive(page, 'call.ended', { callId: 'free' });
    await page.locator('.zh-summary').waitFor();
    assert.match(await summary(), /Call charge\s*Free/);
    assert.deepEqual(errors, []);
    console.log('PASS call charges: one-minute minimum, running cost, low balance, out-of-coins summary, hang-up estimate corrected by the server, free calls');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
