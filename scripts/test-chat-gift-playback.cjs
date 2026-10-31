/* Confirmed chat-gift playback against the production WebView bundle. All
   receipts are native-edge fixtures; no accounts, gifts or payments are sent. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'artifacts', 'chat-gift-playback');
const artPath = process.env.CHAT_GIFT_ART_PATH || (fs.existsSync(path.resolve(root, '..', 'Gifts', 'Rose_buqa.webp')) ? path.resolve(root, '..', 'Gifts', 'Rose_buqa.webp') : path.join(out, 'rose-original.webp'));
const actualArt = fs.existsSync(artPath) ? fs.readFileSync(artPath) : null;
const actualArtHash = actualArt ? createHash('sha256').update(actualArt).digest('hex') : null;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=', 'base64');
const id = value => Number(value).toString(16).padStart(24, '0');
const at = value => new Date(Date.now() - 60000 + value * 100).toISOString();
const member = { user: { id: id(1), name: 'Gift playback member', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false, isPhoneVerified: true }, verification: 'none', requiresOnboarding: false };
const host = { id: id(2), name: 'Gift playback host', role: 'host', serverRole: 'host', hostStatus: 'approved', verified: true, online: true, availableForCall: true };
const hostAccount = { user: { id: id(2), name: 'Gift playback host', role: 'host', serverRole: 'host', hostStatus: 'approved', isVerifiedHost: true, isPhoneVerified: true }, verification: 'verified', requiresOnboarding: false };
const fan = { id: id(1), name: member.user.name, role: 'sender', serverRole: 'user', online: true, verified: false };
const otherHost = { ...host, id: id(3), name: 'Another host' };
const artUrl = 'https://media.fixture.test/original-rose.webp';
const gift = { id: id(100), name: 'Original Rose', emoji: '🌹', mediaUrl: artUrl, coins: 37, durationMs: 700 };
const receive = (page, type, data = {}) => page.evaluate(message => Native.receive(message), { type, data });
const stage = page => page.locator('#zc-gift-playback');
const receipt = (n, transfer = n, options = {}) => ({
  id: id(1000 + n), sequence: 100 + n, mine: true, text: '', status: 'sent', kind: 'gift', createdAt: at(n),
  gift: { giftId: gift.id, transferId: id(2000 + transfer), name: gift.name, emoji: gift.emoji, mediaUrl: artUrl, coins: gift.coins, quantity: 1, durationMs: 700 }, ...options,
});
const ack = message => ({ to: host.id, gift: message.gift.giftId, id: message.gift.transferId, coins: message.gift.coins, idempotencyKey: `fixture-${message.id}`, message });
const incoming = (message, peer = host) => ({ ...message, mine: false, from: peer.id, name: peer.name });
const history = Array.from({ length: 32 }, (_, index) => ({ id: id(500 + index), sequence: index + 1, mine: index % 2 === 0, text: `Conversation ${index + 1}. Keep this message readable while people exchange gifts.`, createdAt: at(index) }));

async function makePage(browser, errors, messages = history, account = member, peer = host) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page._giftFetches = [];
  await page.route(/^https?:\/\//, route => {
    if (!route.request().url().startsWith('https://media.fixture.test/')) return route.abort();
    if (route.request().resourceType() === 'fetch') page._giftFetches.push(route.request().url());
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: actualArt ? 'image/webp' : 'image/png', body: actualArt || png });
  });
  await page.addInitScript(() => { window.__sent = []; window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) }; });
  await page.goto(pathToFileURL(path.join(root, 'assets', 'aurora.html')).href);
  await receive(page, 'session', account);
  await receive(page, 'wallet.balance', { coins: 5000 });
  await receive(page, 'data.home', { hosts: [host, otherHost], stage: [], featured: null, total: 2, page: 1 });
  await receive(page, 'data.chats', { chats: [{ id: id(900), user: peer, last: 'A real conversation', lastAt: at(32), unread: 0, canSend: true }], total: 1, page: 1, unreadCount: 0, unreadConversations: 0 });
  await page.evaluate(peer => zcOpen(peer), peer.id);
  await receive(page, 'data.thread', { with: peer.id, canSend: true, messages });
  await receive(page, 'data.catalog', { gifts: [gift], packs: [], paymentsAvailable: false });
  await page.locator('#ti').waitFor();
  return page;
}

async function expectPlaying(page, transfer) {
  await stage(page).waitFor({ state: 'visible' });
  await page.waitForFunction(transfer => document.querySelector('#zc-gift-playback img')?.dataset.transferId === transfer && document.querySelector('#zc-gift-playback')?.dataset.state === 'playing', id(2000 + transfer));
  assert.equal(await page.locator('#zc-gift-playback:visible').count(), 1, 'Only one center animation plays at a time');
  assert.equal(await stage(page).locator('img').getAttribute('data-media-url'), artUrl, 'Center playback uses the original server media');
  assert.match(await stage(page).locator('img').getAttribute('src'), /^blob:/, 'CORS-allowed original artwork gets a fresh animation resource');
  const geometry = await stage(page).evaluate(node => { const p=node.getBoundingClientRect(),f=document.getElementById('tf').getBoundingClientRect(); return { p:{left:p.left,right:p.right,top:p.top,bottom:p.bottom}, f:{left:f.left,right:f.right,top:f.top,bottom:f.bottom} }; });
  assert.ok(geometry.p.left >= geometry.f.left-1 && geometry.p.right <= geometry.f.right+1 && geometry.p.top >= geometry.f.top-1 && geometry.p.bottom <= geometry.f.bottom+1, 'Center playback stays inside conversation history, clear of header and composer');
  assert.equal(await stage(page).getAttribute('aria-hidden'), 'true');
}
async function expectIdle(page, label) {
  await stage(page).waitFor({ state: 'hidden' });
  assert.equal(await stage(page).isVisible(), false, label);
}
async function keepComposer(page) {
  await page.locator('#ti').fill('Keep typing this real conversation draft');
  return page.evaluate(() => {
    const input = document.getElementById('ti'), frame = document.getElementById('tf');
    input.focus(); input.setSelectionRange(5, 12); frame.scrollTop = 260;
    const top = frame.getBoundingClientRect().top;
    const anchor = [...frame.querySelectorAll('.zc-msg')].find(node => node.getBoundingClientRect().bottom > top);
    return { value: input.value, start: input.selectionStart, end: input.selectionEnd, anchor: anchor?.id, offset: anchor?.getBoundingClientRect().top };
  });
}
async function assertComposer(page, before) {
  const current = await page.evaluate(anchor => ({ value: ti.value, start: ti.selectionStart, end: ti.selectionEnd, focused: document.activeElement === ti, offset: document.getElementById(anchor)?.getBoundingClientRect().top }), before.anchor);
  assert.equal(current.value, before.value, 'Gift playback preserves the draft');
  assert.equal(current.focused, true, 'Gift playback never steals composer focus');
  assert.deepEqual([current.start, current.end], [before.start, before.end], 'Gift playback preserves the selection');
  assert.ok(Math.abs(current.offset - before.offset) < 2, 'Gift playback and the receipt preserve the visible history anchor');
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [], checks = [];
  try {
    const old = receipt(1);
    const page = await makePage(browser, errors, [...history, old]);
    assert.equal(await stage(page).isVisible(), false, 'Loading gift history never starts center playback');
    await receive(page, 'chat.updated', { with: host.id, message: old });
    assert.equal(await stage(page).isVisible(), false, 'An echo of a gift already loaded from history never replays');
    await receive(page, 'operation.error', { action: 'gift.send', to: host.id, gift: gift.id, idempotencyKey: 'failed', status: 402, code: 'INSUFFICIENT_COINS', message: 'Fixture send failed' });
    assert.equal(await stage(page).isVisible(), false, 'Failed gift sends never play');
    checks.push('history and failures do not play');

    const before = await keepComposer(page), sent = receipt(2);
    // The sender socket echo may beat the HTTP send acknowledgement.
    await receive(page, 'chat.updated', { with: host.id, message: sent });
    assert.equal(await stage(page).isVisible(), false, 'Sender socket echo only merges the persisted receipt');
    await receive(page, 'gift.sent', ack(sent));
    await expectPlaying(page, 2);
    const firstUrl = await stage(page).locator('img').getAttribute('src');
    const blobProof = await stage(page).locator('img').evaluate(async image => { const bytes=await (await fetch(image.src)).arrayBuffer(); const digest=await crypto.subtle.digest('SHA-256',bytes); return {bytes:bytes.byteLength,sha256:[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')}; });
    if(actualArt){assert.equal(blobProof.bytes,actualArt.length);assert.equal(blobProof.sha256,actualArtHash,'Fresh animation Blob preserves every original file byte');}
    await stage(page).locator('img').evaluate(image => { window.__playingImage = image; });
    await receive(page, 'gift.sent', ack(sent));
    await receive(page, 'chat.updated', { with: host.id, message: sent });
    assert.equal(await stage(page).locator('img').evaluate(image => image === window.__playingImage), true, 'Echo and acknowledgment share one playback node');
    await assertComposer(page, before);
    const effects = await stage(page).evaluate(node => {
      const style = element => { const s = getComputedStyle(element); return { background: s.backgroundImage, color: s.backgroundColor, border: s.borderTopWidth, shadow: s.boxShadow, filter: s.filter, pointer: s.pointerEvents, animation: s.animationName }; };
      return { stage: style(node), image: style(node.querySelector('img')), children: node.querySelectorAll('*').length };
    });
    for (const effect of [effects.stage, effects.image]) {
      assert.equal(effect.background, 'none'); assert.ok(['transparent', 'rgba(0, 0, 0, 0)'].includes(effect.color));
      assert.equal(effect.border, '0px'); assert.equal(effect.shadow, 'none'); assert.equal(effect.filter, 'none'); assert.equal(effect.pointer, 'none');
    }
    assert.equal(await page.evaluate(() => { const r = ti.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === ti; }), true, 'Large gift artwork cannot intercept composer touches');
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => r());
      assert.equal(await stage(page).locator('img').evaluate(image => image === window.__playingImage), true, 'Resize and ordinary redraw do not restart the animation image');
    }
    await expectIdle(page, 'A confirmed gift ends after its supplied duration');
    assert.equal(await page.evaluate(async url=>{try{await fetch(url);return true}catch{return false}},firstUrl),false,'Finished playback revokes its Blob URL');
    await receive(page, 'gift.sent', ack(sent));
    await receive(page, 'chat.updated', { with: host.id, message: sent });
    assert.equal(await stage(page).isVisible(), false, 'Late duplicate events do not replay an expired transfer');
    assert.equal(await page.locator(`#zc-m-${sent.id} .zc-gift-card`).count(), 1, 'Center playback leaves one persisted sender receipt');
    checks.push('echo/ack dedupe', 'draft focus selection anchor', 'no artwork decorations or pointer interception', 'stable node across redraw and resize');

    const first = receipt(3), second = receipt(4);
    await receive(page, 'gift.sent', ack(first)); await expectPlaying(page, 3);
    const queueFirstUrl=await stage(page).locator('img').getAttribute('src');
    await receive(page, 'gift.sent', ack(second)); await receive(page, 'gift.sent', ack(first));
    assert.equal(await stage(page).locator('img').getAttribute('data-transfer-id'), first.gift.transferId, 'A second transfer queues behind the currently playing one');
    await expectPlaying(page, 4);
    const queueSecondUrl=await stage(page).locator('img').getAttribute('src');
    assert.notEqual(queueFirstUrl,queueSecondUrl,'Distinct gifts restart the original animation with fresh Blob URLs');
    assert.equal(page._giftFetches.length,1,'Queued plays reuse cached original bytes without another HTTP fetch');
    await expectIdle(page, 'The playback queue drains after both distinct gifts');
    checks.push('ordered distinct-transfer queue');

    const receiver = await makePage(browser, errors, history, hostAccount, fan);
    const incomingGift = receipt(5, 5, { mine: false });
    await receive(receiver, 'chat.message', incoming(incomingGift, fan)); await expectPlaying(receiver, 5);
    await receive(receiver, 'gift.received', { id: incomingGift.gift.transferId, from: fan.id, gift: gift.name, giftId: gift.id, giftName: gift.name, mediaUrl: artUrl, coins: gift.coins });
    await receive(receiver, 'chat.message', incoming(incomingGift, fan));
    await expectIdle(receiver, 'Incoming gift finishes once despite transport duplicates');
    assert.equal(await receiver.locator(`#zc-m-${incomingGift.id} .zc-gift-card`).count(), 1);
    checks.push('incoming canonical receipt plays once');

    await receive(page, 'gift.sent', ack(receipt(6))); await expectPlaying(page, 6);
    await receive(page, 'gift.sent', ack(receipt(7)));
    await page.evaluate(() => go('chats')); await expectIdle(page, 'Navigation cancels active playback and its queue');
    await page.evaluate(peer => zcOpen(peer), host.id);
    await receive(page, 'data.thread', { with: host.id, canSend: true, messages: [...history, receipt(6), receipt(7)] });
    assert.equal(await stage(page).isVisible(), false, 'Returning through history does not revive cancelled gifts');
    checks.push('navigation clears playback');

    await receive(receiver, 'chat.message', incoming(receipt(12, 12, { mine: false }), fan)); await expectPlaying(receiver,12);
    await receive(receiver, 'app.background'); await expectIdle(receiver,'Backgrounding clears the actively playing gift');
    await receive(receiver, 'chat.message', incoming(receipt(8, 8, { mine: false }), fan));
    assert.equal(await stage(receiver).isVisible(), false, 'Background arrivals do not start playback');
    await receive(receiver, 'app.foreground');
    assert.equal(await stage(receiver).isVisible(), false, 'Foregrounding does not replay gifts received while backgrounded');
    await receiver.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await receive(receiver, 'chat.message', incoming(receipt(9, 9, { mine: false }), fan));
    await receiver.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await stage(receiver).isVisible(), false, 'Hidden-document arrivals stay consumed when visibility returns');
    await receive(page, 'gift.sent', { ...ack(receipt(10)), to: otherHost.id });
    assert.equal(await stage(page).isVisible(), false, 'A receipt for another thread never plays here');
    checks.push('background/hidden/wrong-thread suppression');
    await receiver.close();

    // Capture the supplied transparent animation separately at its real duration.
    const visualPage = await makePage(browser,errors,history.slice(0,2));
    await visualPage.locator('#ti').fill('Keep chatting while the original gift plays');
    const visual = receipt(11); visual.gift.durationMs = 6400;
    await receive(visualPage, 'gift.sent', ack(visual)); await expectPlaying(visualPage, 11);
    await stage(visualPage).locator('img').evaluate(image => image.decode());
    for (const dark of [false, true]) {
      await visualPage.evaluate(dark => ZimiThemes.setDark(dark), dark);
      await visualPage.setViewportSize({ width: 390, height: 844 });
      await visualPage.screenshot({ path: path.join(out, `original-rose-${dark ? 'dark' : 'light'}-390.png`) });
    }
    const visualUrl=await stage(visualPage).locator('img').getAttribute('src');
    await receive(visualPage, 'gift.sent', ack(receipt(13)));
    await receive(visualPage, 'session.none'); await expectIdle(visualPage, 'Logout cancels active artwork and queued timers');
    assert.equal(await visualPage.evaluate(async url=>{try{await fetch(url);return true}catch{return false}},visualUrl),false,'Logout revokes active playback Blob URL');
    checks.push('original Rose animation screenshot', 'logout clears playback');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ actualArtwork: actualArt ? { path: artPath, bytes: actualArt.length } : null, checks, effects, blobProof, originalMediaFetches:page._giftFetches.length, pageErrors: errors }, null, 2));
    console.log('PASS chat gift playback: confirmed once, ordered queue, history/failure suppression, stable media node, typing/anchor preservation, navigation/logout/background cleanup, transparent original artwork.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
