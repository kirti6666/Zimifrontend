/* Exercise the shipped WebView with the supplied green-screen MP4 and mock
   receipts. No real account, gift or balance is changed. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const clip = fs.readFileSync(process.argv[2] || path.join(__dirname, '../../Gifts/Pink_rose_bouquet.mp4'));
const cover = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=', 'base64');
const origin = 'https://gift-video.fixture.test';
const id = value => value.toString(16).padStart(24, '0');
const member = { id: id(1), name: 'Member', role: 'sender', serverRole: 'user', isPhoneVerified: true };
const host = { id: id(2), name: 'Host', role: 'host', serverRole: 'host', hostStatus: 'approved', isPhoneVerified: true, isVerifiedHost: true, verified: true, online: true, availableForCall: true };
const gift = { id: id(3), name: 'Pink Rose Bouquet', emoji: '🌹', coins: 5, mediaUrl: origin + '/rose.mp4', coverUrl: origin + '/cover.png', durationMs: 8000 };
const callId = id(4);
const receive = (page, type, data) => page.evaluate(message => Native.receive(message), { type, data });

async function open(browser, account, reducedMotion = 'no-preference') {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion });
  page.setDefaultTimeout(10000);
  await page.route(/^https?:\/\//, route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/unavailable.mp4') return route.abort('blockedbyresponse');
    const video = url.pathname.endsWith('.mp4');
    return route.fulfill({
      contentType: video ? 'video/mp4' : 'image/png',
      headers: { 'access-control-allow-origin': '*' },
      body: video ? clip : cover,
    });
  });
  await page.addInitScript(() => {
    window.__sent = [];
    window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) };
    const draw = WebGLRenderingContext.prototype.drawArrays;
    WebGLRenderingContext.prototype.drawArrays = function(...args) {
      draw.apply(this, args);
      if (!this.canvas.dataset.mediaUrl) return;
      const corner = new Uint8Array(4), center = new Uint8Array(4);
      this.readPixels(8, 8, 1, 1, this.RGBA, this.UNSIGNED_BYTE, corner);
      this.readPixels(this.canvas.width / 2, this.canvas.height / 2, 1, 1, this.RGBA, this.UNSIGNED_BYTE, center);
      window.__giftPixels = { corner: [...corner], center: [...center] };
    };
  });
  await page.goto(pathToFileURL(path.join(__dirname, '../assets/aurora.html')).href);
  await receive(page, 'session', { user: account, verification: account === host ? 'verified' : 'none', requiresOnboarding: false });
  await receive(page, 'data.home', { hosts: [host], stage: [], featured: null, total: 1, page: 1 });
  await receive(page, 'wallet.balance', { coins: 100, earningsPaise: 0, diamondUnits: 0, diamondScale: 1000000 });
  await receive(page, 'data.catalog', { gifts: [gift], packs: [] });
  return page;
}

async function expectKeyedVideo(page, stage, transferId) {
  const canvas = page.locator(`#${stage}[data-state="playing"] canvas[data-transfer-id="${transferId}"]`);
  await canvas.waitFor();
  assert.equal(await canvas.evaluate(el => getComputedStyle(el).objectFit), 'contain');
  await page.waitForFunction(() => __giftPixels?.corner[3] === 0 && __giftPixels.center[3] > 200 && __giftPixels.center[0] > __giftPixels.center[1]);
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  try {
    const sender = await open(browser, member);
    const recipient = await open(browser, host);
    const peer = { ...host, ratePerMin: 0 };
    await receive(sender, 'data.chats', { chats: [{ id: id(5), user: peer, canSend: true }], total: 1, page: 1 });
    await sender.evaluate(peer => zcOpen(peer), host.id);
    await receive(sender, 'data.thread', { with: host.id, canSend: true, messages: [] });
    await sender.evaluate(peer => homeGifts(peer), host.id);
    await receive(sender, 'data.catalog', { gifts: [gift], packs: [] });
    await receive(sender, 'wallet.balance', { coins: 100 });
    await sender.evaluate(giftId => homeSelectGift(giftId), gift.id);
    await sender.locator(`.zg-art img[src="${gift.coverUrl}"]`).waitFor();
    assert.equal(await sender.locator('img[src*=".mp4"], video[src*=".mp4"], #zc-gift-playback').count(), 0);
    await sender.evaluate(() => homeSendGift());
    const attempt = await sender.evaluate(() => __sent.findLast(message => message.type === 'gift.send')?.data);
    assert.ok(attempt?.idempotencyKey);
    assert.equal(await sender.locator('#zc-gift-playback').count(), 0, 'Pending MP4 send keeps the still until confirmation');
    const transferId = id(6);
    const sent = { ...attempt, id: transferId, coins: gift.coins, scope: 'chat', giftDetails: { ...gift, transferId, quantity: 1 } };
    await receive(sender, 'gift.sent', sent);
    await expectKeyedVideo(sender, 'zc-gift-playback', transferId);
    await sender.locator(`.zc-gift-icon img[src="${gift.coverUrl}"]`).waitFor();
    await receive(sender, 'gift.sent', sent);
    assert.equal(await sender.locator('#zc-gift-playback canvas').count(), 1);
    await sender.locator('#zc-gift-playback').waitFor({ state: 'detached', timeout: 11000 });

    await recipient.evaluate(({ member, callId }) => {
      S.callId = callId;
      S.caller = { id: member.id, n: member.name, callId, voice: false };
      go('hcall');
      Home.mediaStatus = 'Connected';
      r();
    }, { member, callId });
    const receipt = { id: id(7), callId, scope: 'call', senderId: member.id, senderName: member.name, giftName: gift.name,
      coins: gift.coins, mediaUrl: gift.mediaUrl, coverUrl: gift.coverUrl, durationMs: gift.durationMs, createdAt: new Date().toISOString() };
    await receive(recipient, 'gift.received', receipt);
    await expectKeyedVideo(recipient, 'zr-gift-playback', receipt.id);
    await recipient.evaluate(() => go('home'));
    assert.equal(await recipient.locator('#zr-gift-playback').count(), 0);

    await sender.evaluate(({ origin, gift }) => {
      window.__fallback = ZimiGiftPlayback.create({ id: 'zc-gift-playback', imageClass: 'zc-gift-playback-art', available: () => true });
      __fallback.enqueue({ transferId: 'load-failure', media: origin + '/unavailable.mp4', poster: gift.coverUrl });
    }, { origin, gift });
    await sender.locator(`#zc-gift-playback[data-state="playing"] img[src="${gift.coverUrl}"]`).waitFor();
    assert.equal(await sender.locator('#zc-gift-playback canvas, #zc-gift-playback video').count(), 0);
    await sender.evaluate(() => __fallback.clear());
    await sender.emulateMedia({ reducedMotion: 'reduce' });
    await sender.evaluate(gift => __fallback.enqueue({ transferId: 'reduced-motion', media: gift.mediaUrl, poster: gift.coverUrl }), gift);
    await sender.locator(`#zc-gift-playback[data-state="playing"] img[src="${gift.coverUrl}"]`).waitFor();
    assert.equal(await sender.locator('#zc-gift-playback canvas').count(), 0);
    await sender.evaluate(() => __fallback.clear());
    await sender.emulateMedia({ reducedMotion: 'no-preference' });
    await sender.evaluate(peer => { go('host', peer); homeGifts(peer); }, host.id);
    await receive(sender, 'data.catalog', { gifts: [gift], packs: [] });
    await receive(sender, 'wallet.balance', { coins: 100 });
    await sender.evaluate(giftId => { homeSelectGift(giftId); homeSendGift(); }, gift.id);
    const profileAttempt = await sender.evaluate(() => __sent.findLast(message => message.type === 'gift.send')?.data);
    assert.notEqual(profileAttempt.idempotencyKey, attempt.idempotencyKey);
    assert.equal(await sender.locator('#zc-gift-playback').count(), 0);
    await receive(sender, 'gift.sent', { ...sent, ...profileAttempt, id: id(8) });
    await expectKeyedVideo(sender, 'zc-gift-playback', id(8));
    console.log('PASS actual MP4: static cover in lists and receipts, confirmed chat and call playback, transparent green, no duplicate, and still fallbacks');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
