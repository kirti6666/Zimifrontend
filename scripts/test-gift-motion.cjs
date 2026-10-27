// Production gift receipts drive a finite visual effect without replaying on redraw.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const host = { id: '507f1f77bcf86cd799439017', name: 'Host', role: 'host', hostStatus: 'approved', isVerifiedHost: true };

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => { window.ReactNativeWebView = { postMessage() {} }; });
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href + '?role=host');
    const receive = (type, data) => page.evaluate(message => Native.receive(message), { type, data });
    await receive('session', { user: host, verification: 'verified', requiresOnboarding: false });
    await page.evaluate(() => {
      S.callId = 'gift-motion-call'; S.callRate = 0;
      S.caller = { id: 'caller', n: 'Imran', callId: S.callId, voice: false };
      go('hcall'); Home.mediaStatus = 'Connected'; r();
    });
    const gift = { id: 'receipt-1', callId: 'gift-motion-call', senderId: 'caller', senderName: 'Imran', giftName: 'Berry', emoji: '🍓', coins: 299 };
    assert.equal(await page.locator('.zr-gift-celebration').count(), 0, 'No celebration before a real receipt');
    await receive('gift.received', gift);
    await page.locator('.zr-gift-celebration').waitFor();
    const start = await page.evaluate(() => Room.giftMotion.at);
    assert.match(await page.locator('.zr-gift-caption').innerText(), /Berry[\s\S]*Imran[\s\S]*299/);
    assert.equal(await page.evaluate(() => S.recvN), 1);
    await receive('gift.received', gift);
    assert.equal(await page.evaluate(() => S.recvN), 1, 'Duplicate receipts neither count nor replay');
    assert.equal(await page.evaluate(() => Room.giftMotion.at), start);
    await page.getByRole('button', { name: 'Open call chat', exact: true }).click();
    assert.equal(await page.evaluate(() => Room.giftMotion.at), start, 'Opening chat preserves the animation start');
    assert.ok(await page.locator('.zr-gift-celebration').evaluate(el => parseFloat(el.style.getPropertyValue('--gift-age')) < 0), 'Redraw resumes the elapsed timeline');
    assert.equal(await page.locator('.zr-gift-celebration').evaluate(el => getComputedStyle(el).pointerEvents), 'none', 'Celebrations never block controls');
    await page.waitForTimeout(300);
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'artifacts', 'host-gift-motion.png') });
    await page.waitForFunction(() => !Room.giftMotion, { timeout: 5000 });
    assert.equal(await page.locator('.zr-gift-celebration,.zr-gift-alert').count(), 0, 'Effect and banner expire together');
    await page.evaluate(() => r());
    assert.equal(await page.locator('.zr-gift-celebration').count(), 0, 'An expired gift does not return after redraw');
    await receive('gift.received', { ...gift, id: 'wrong-call', callId: 'old-call' });
    assert.equal(await page.locator('.zr-gift-celebration').count(), 0, 'A receipt from another call cannot animate here');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await receive('gift.received', { ...gift, id: 'receipt-2', giftName: '<img src=x onerror=alert(1)>', mediaUrl: 'javascript:alert(1)' });
    assert.equal(await page.locator('.zr-gift-stage-art img').count(), 0, 'Unsafe media falls back to the gift emoji');
    assert.equal(await page.locator('.zr-gift-caption img').count(), 0, 'Gift names are escaped');
    const animations = await page.locator('.zr-gift-celebration').evaluate(el => [el, ...el.querySelectorAll('*')].map(node => getComputedStyle(node).animationName));
    assert.ok(animations.every(name => name === 'none'), 'Reduced motion displays a static celebration');
    await page.evaluate(() => go('home'));
    assert.deepEqual(await page.evaluate(() => [Room.giftMotion, Room.giftTimer, Room.gift]), [null, null, null], 'Leaving the call clears visual state and its timer');
    await page.evaluate(() => { S.callId = 'next-call'; go('hcall'); });
    assert.equal(await page.locator('.zr-gift-celebration').count(), 0, 'A subsequent call starts without the previous gift');
    await receive('gift.received', { ...gift, id: 'receipt-3', callId: 'next-call' });
    await receive('session.expired', {});
    assert.deepEqual(await page.evaluate(() => [Room.giftMotion, Room.giftTimer]), [null, null], 'Session expiry cancels a running celebration');
    assert.deepEqual(errors, [], 'No browser errors');
    console.log('PASS gift motion: receipts, deduplication, redraw continuity, expiry, safe media, reduced motion, call and session cleanup');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
