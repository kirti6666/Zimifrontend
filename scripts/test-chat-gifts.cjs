/* Production chat-gift UI regression. Every account, catalog, wallet and receipt
   is supplied at the native bridge boundary; no live gift/payment API is used. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'artifacts', 'chat-gifts');
const realArtPath = process.env.CHAT_GIFT_ART_PATH || (fs.existsSync(path.join(root, '..', 'Gifts', 'Rose_buqa.webp')) ? path.join(root, '..', 'Gifts', 'Rose_buqa.webp') : path.join(root, 'artifacts', 'chat-gift-playback', 'rose-original.webp'));
const realArt = fs.existsSync(realArtPath) ? fs.readFileSync(realArtPath) : null;
const id = n => Number(n).toString(16).padStart(24, '0');
const at = n => new Date(Date.UTC(2026, 9, 30, 8, n)).toISOString();
const member = { user: { id: id(1), name: 'Aarav Gift QA', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false, isPhoneVerified: true }, verification: 'none', requiresOnboarding: false };
const hostAccount = { user: { id: id(2), name: 'Mira Gift QA', role: 'host', serverRole: 'host', hostStatus: 'approved', isVerifiedHost: true, isPhoneVerified: true }, verification: 'verified', requiresOnboarding: false };
const host = { id: id(2), name: 'Mira Gift QA', role: 'host', serverRole: 'host', hostStatus: 'approved', verified: true, online: true, availableForCall: true, ratePerMin: 0 };
const fan = { id: id(1), name: member.user.name, role: 'sender', serverRole: 'user', online: true, verified: false };
const names = ['Orbit Rose', 'Coral Heart', 'Comet Party', 'Amber Crown', 'Cloud Hug', 'Lemon Bloom', 'Velvet Wave', 'Solar Wish'];
const prices = [37, 83, 149, 277, 421, 607, 809, 1301];
const emojis = ['🌹', '💗', '🎉', '👑', '🧸', '🌼', '🌊', '✨'];
const gifts = names.map((name, index) => ({ id: id(100 + index), name, emoji: emojis[index], coins: prices[index], mediaUrl: `https://media.fixture.test/gifts/${index}.png` }));
const catalog = { gifts, packs: [{ id: id(500), name: 'Fixture coins', coins: 200, pricePaise: 9900 }], paymentsAvailable: true };
const receive = (page, type, data = {}) => page.evaluate(message => Native.receive(message), { type, data });
const sent = (page, type) => page.evaluate(type => __sent.filter(message => message.type === type).map(message => message.data), type);
const last = async (page, type) => (await sent(page, type)).at(-1);
const sheet = page => page.getByRole('dialog', { name: 'Send a gift', exact: true });
const strip = page => page.getByRole('group', { name: 'Quick gifts', exact: true });
const tile = (page, gift) => sheet(page).locator('.zw-gifts>button').filter({ has: page.locator('b').filter({ hasText: new RegExp('^' + gift.name + '$') }) });
const quick = (page, gift) => strip(page).getByRole('button', { name: `${gift.name}, ${gift.coins.toLocaleString('en-IN')} coins`, exact: true });
const openQuick = async (page, gift) => { await quick(page, gift).click(); await receive(page, 'data.catalog', catalog); await sheet(page).waitFor(); };
const receipt = (n, transfer, gift = gifts[0], mine = true, sequence = 2) => ({ id: id(n), sequence, mine, text: '', kind: 'gift', status: 'sent', createdAt: at(sequence), gift: { giftId: gift.id, transferId: id(transfer), name: gift.name, emoji: gift.emoji, mediaUrl: gift.mediaUrl, coins: gift.coins, quantity: 1 } });
const baseHistory = [{ id: id(900), sequence: 1, mine: false, text: 'Choose a gift when you feel like it.', createdAt: at(1) }];
const previewShapes = [['portrait', 360, 640], ['landscape', 1200, 450], ['square', 800, 800]].map(([name, width, height]) => ({
  name, width, height, url: `https://media.fixture.test/receipt-${name}.svg`,
  artwork: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect x="4" y="4" width="${width - 8}" height="${height - 8}" rx="12" fill="#a8268433" stroke="#db2878" stroke-width="8"/><path d="M16 16L${width - 16} ${height - 16}M${width - 16} 16L16 ${height - 16}" stroke="#e8ad36" stroke-width="8"/><text x="50%" y="50%" text-anchor="middle" fill="#a82684" font-size="34">${name} gift</text></svg>`
}));

async function makePage(browser, errors, account = member, peer = host, history = baseHistory) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(error.message));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=', 'base64');
  await page.route(/^https?:\/\//, route => {
    const shape = previewShapes.find(item => item.url === route.request().url());
    if (shape) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: shape.artwork });
    return route.request().url().startsWith('https://media.fixture.test/')
      ? route.fulfill({ status: 200, contentType: realArt && route.request().url().endsWith('/0.png') ? 'image/webp' : 'image/png', body: realArt && route.request().url().endsWith('/0.png') ? realArt : png }) : route.abort();
  });
  await page.addInitScript(() => { window.__sent = []; window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) }; });
  await page.goto(pathToFileURL(path.join(root, 'assets', 'aurora.html')).href);
  await receive(page, 'session', account);
  await receive(page, 'wallet.balance', { coins: 10000, earningsPaise: 0, reservedPaise: 0 });
  await receive(page, 'data.home', { hosts: [host], stage: [], featured: null, total: 1, page: 1 });
  await receive(page, 'data.chats', { chats: [{ id: id(800), user: peer, last: 'Conversation fixture', lastAt: at(1), unread: 0, canSend: true }], total: 1, page: 1, unreadCount: 0, unreadConversations: 0 });
  await page.evaluate(peer => zcOpen(peer), peer.id);
  await receive(page, 'data.thread', { with: peer.id, canSend: true, messages: history });
  await receive(page, 'data.catalog', catalog);
  await page.locator('#ti').waitFor();
  return page;
}

async function geometry(page, width, dark) {
  await page.setViewportSize({ width, height: width >= 1000 ? 900 : 844 });
  await page.evaluate(dark => ZimiThemes.setDark(dark), dark);
  const row = strip(page);
  await row.waitFor();
  const metrics = await page.evaluate(() => {
    const box = element => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };
    const row = document.querySelector('.zc-gift-strip'), input = document.getElementById('ti'), button = document.querySelector('.zc-gift-button');
    const buttons = [...row.querySelectorAll('button')];
    return { overflow: document.documentElement.scrollWidth > innerWidth + 1, row: box(row), input: box(input), button: box(button), viewport: innerHeight,
      art: buttons.map(node => box(node.querySelector('.zc-quick-gift-art'))), artContent: buttons.map(node => ({ image: node.querySelector('img') ? box(node.querySelector('img')) : null, art: box(node.querySelector('.zc-quick-gift-art')), name: box(node.querySelector('.zc-quick-gift-name')) })), buttonText: button.textContent.trim(), reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
  });
  assert.equal(metrics.overflow, false, `${width}px ${dark ? 'dark' : 'light'} has no horizontal page overflow`);
  assert.ok(metrics.row.bottom <= metrics.input.top + 1, 'Quick gifts sit above the message input');
  assert.ok(metrics.button.bottom <= metrics.viewport + 1, 'Gift action stays inside the viewport');
  assert.ok(metrics.button.left >= metrics.input.right, 'Visible Gift action is separate from the message field');
  assert.match(metrics.buttonText, /Gift/, 'Gift action includes its visible text');
  assert.ok(metrics.art.every(art => art.width > 0 && art.width <= 80 && art.height <= 80), 'Gift artwork stays compact');
  assert.ok(metrics.artContent.every(item => !item.image || item.image.bottom <= item.name.top + 1 && item.image.bottom <= item.art.bottom + 1), 'Portrait animation stays inside its artwork slot and never overlaps gift name or price');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), dark ? 'dark' : 'light');
  await page.locator('#ti').fill('Keep this draft while choosing gifts');
  const before = (await sent(page, 'gift.send')).length;
  await openQuick(page, gifts[0]);
  await sheet(page).waitFor();
  assert.equal(await tile(page, gifts[0]).getAttribute('aria-pressed'), 'true', 'Quick gift opens the full picker with that gift selected');
  assert.equal(await sheet(page).locator('.zw-gifts>button').count(), gifts.length, 'Full picker retains the whole server catalog');
  assert.equal((await sent(page, 'gift.send')).length, before, 'Opening or selecting a quick gift never spends coins');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#ti').inputValue(), 'Keep this draft while choosing gifts');
  await page.getByRole('button', { name: 'Gift', exact: true }).click();
  await receive(page, 'data.catalog', catalog);
  await sheet(page).waitFor();
  assert.equal((await sent(page, 'gift.send')).length, before, 'Separate Gift button only opens the full picker');
  await sheet(page).getByRole('button', { name: 'Close gifts', exact: true }).click();
  await page.locator('#ti').evaluate(input => input.blur());
  await page.screenshot({ path: path.join(out, `thread-${dark ? 'dark' : 'light'}-${width}.png`) });
  return { width, dark, ...metrics };
}

async function receiptPreviewLayouts(browser, errors) {
  const results = [];
  let next = 2000;
  for (const mine of [true, false]) {
    const peer = mine ? host : fan, page = await makePage(browser, errors, mine ? member : hostAccount, peer, []);
    for (const dark of [false, true]) for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(dark => ZimiThemes.setDark(dark), dark);
      for (const shape of previewShapes) {
        const item = receipt(next++, next++, { ...gifts[0], name: `${shape.name} gift`, mediaUrl: shape.url }, mine);
        await receive(page, 'data.thread', { with: peer.id, canSend: true, messages: [item] });
        const card = page.locator(`#zc-m-${item.id} .zc-gift-card`);
        await card.locator('img').evaluate(image => image.decode());
        const layout = await card.evaluate(card => {
          const box = element => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }; };
          const image = card.querySelector('img'), style = getComputedStyle(card), row = card.closest('.zc-msg');
          return { card: box(card), art: box(card.querySelector('.zc-gift-icon')), image: box(image), title: box(card.querySelector('h3')), row: box(row), stack: box(card.parentElement), natural: { width: image.naturalWidth, height: image.naturalHeight }, padding: [style.paddingLeft, style.paddingRight], margin: [style.marginLeft, style.marginRight], overflow: document.documentElement.scrollWidth > innerWidth + 1, cardOverflow: card.scrollWidth > card.clientWidth + 1 };
        });
        const label = `${mine ? 'sent' : 'received'} ${shape.name} ${width}px ${dark ? 'dark' : 'light'}`;
        assert.deepEqual(layout.padding, ['0px', '0px'], `${label}: no card side padding`);
        assert.deepEqual(layout.margin, ['0px', '0px'], `${label}: no card side margin`);
        assert.equal(layout.overflow || layout.cardOverflow, false, `${label}: preview and metadata stay within the screen`);
        assert.deepEqual(layout.natural, { width: shape.width, height: shape.height });
        assert.ok(Math.abs(layout.image.width / layout.image.height - shape.width / shape.height) < .01, `${label}: original aspect ratio has no letterboxed image slot`);
        for (const edge of ['left', 'right']) {
          assert.ok(Math.abs(layout.image[edge] - layout.art[edge]) < 1, `${label}: artwork uses its whole preview ${edge} edge`);
          assert.ok(Math.abs(layout.art[edge] - layout.card[edge]) < 1, `${label}: preview has no blank internal ${edge} gutter`);
        }
        assert.ok(layout.image.width > 100 && layout.image.width <= 260 && layout.image.height <= 340, `${label}: artwork has a readable bounded size`);
        assert.ok(layout.image.bottom <= layout.title.top + 1, `${label}: name and coins stay beneath the artwork`);
        assert.ok(Math.abs(layout.card[mine ? 'right' : 'left'] - layout.stack[mine ? 'right' : 'left']) < 1, `${label}: message keeps its sender/recipient alignment`);
        if (mine) assert.ok(Math.abs(layout.card.right - layout.row.right) < 1, `${label}: sent gift stays on the right`);
        if (!dark && width === 390) await page.screenshot({ path: path.join(out, `receipt-${mine ? 'sent' : 'received'}-${shape.name}-390.png`) });
        results.push({ mine, dark, width, shape: shape.name, ...layout });
      }
    }
    await page.close();
  }
  return results;
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [], layouts = [];
  try {
    const page = await makePage(browser, errors);
    assert.equal(await strip(page).locator('button').count() > 0, true);
    assert.equal(await quick(page, gifts[0]).locator('img').getAttribute('src'), gifts[0].mediaUrl, 'Quick row uses catalog artwork from the server');
    if (realArt) {
      await quick(page, gifts[0]).locator('img').evaluate(image => image.decode());
      assert.deepEqual(await quick(page, gifts[0]).locator('img').evaluate(image => [image.naturalWidth, image.naturalHeight]), [360, 640], 'Real 192-frame transparent Rose animation renders at its original canvas dimensions');
    }
    const decoration = await quick(page, gifts[0]).locator('.zc-quick-gift-art').evaluate(node => { const style = getComputedStyle(node); return { background: style.backgroundImage, color: style.backgroundColor, border: style.borderTopWidth, shadow: style.boxShadow, filter: style.filter }; });
    assert.equal(decoration.background, 'none'); assert.equal(decoration.border, '0px'); assert.equal(decoration.shadow, 'none'); assert.equal(decoration.filter, 'none'); assert.ok(['rgba(0, 0, 0, 0)', 'transparent'].includes(decoration.color), 'Quick artwork has no added background');
    assert.match(await quick(page, gifts[0]).innerText(), /37/, 'Quick row uses the real catalog price');
    assert.equal(await strip(page).getByText('99', { exact: true }).count(), 0, 'Reference demo prices are never fabricated');
    for (const dark of [false, true]) for (const width of [320, 390, 1280]) layouts.push(await geometry(page, width, dark));

    // An uncertain native/server failure keeps one retry identity and creates no receipt.
    await openQuick(page, gifts[1]);
    await sheet(page).getByRole('button', { name: 'Send gift', exact: true }).click();
    const attempt = await last(page, 'gift.send');
    assert.equal(attempt.to, host.id); assert.equal(attempt.gift, gifts[1].id); assert.equal(attempt.coins, gifts[1].coins); assert.ok(attempt.idempotencyKey);
    assert.equal(await page.locator('.zc-gift-card').count(), 0, 'Sending waits for a server receipt');
    await receive(page, 'operation.error', { action: 'gift.send', ...attempt, status: 500, message: 'Fixture delivery could not be confirmed' });
    await sheet(page).getByRole('button', { name: 'Send gift', exact: true }).click();
    assert.equal((await last(page, 'gift.send')).idempotencyKey, attempt.idempotencyKey, 'Uncertain retry preserves the gift request identity');
    await receive(page, 'operation.error', { action: 'gift.send', ...attempt, code: 'INSUFFICIENT_COINS', status: 402, message: 'Fixture balance is too low' });
    assert.equal(await page.locator('.zc-gift-card').count(), 0, 'Failed wallet request does not create a delivered gift receipt');
    assert.equal(await page.evaluate(() => S.bal), 10000, 'Only authoritative wallet events change balance');
    await receive(page, 'wallet.balance', { coins: 0 });
    await receive(page, 'data.catalog', catalog);
    const recharge = page.getByRole('dialog', { name: 'Recharge to continue', exact: true });
    await recharge.waitFor();
    await recharge.getByRole('button', { name: 'Not now', exact: true }).click();
    const beforeRecharge = (await sent(page, 'gift.send')).length;
    assert.equal(await sheet(page).getByRole('button', { name: 'Send gift', exact: true }).isEnabled(), true, 'Insufficient balance offers recharge');
    await sheet(page).getByRole('button', { name: 'Send gift', exact: true }).click();
    await recharge.waitFor();
    assert.equal((await sent(page, 'gift.send')).length, beforeRecharge, 'The local balance guard opens recharge without another gift send');
    await recharge.getByRole('button', { name: 'Not now', exact: true }).click();
    await sheet(page).getByRole('button', { name: 'Close gifts', exact: true }).click();
    await receive(page, 'wallet.balance', { coins: 10000 });

    // Legacy send acknowledgment followed by canonical history must reconcile one transfer.
    await openQuick(page, gifts[0]);
    await sheet(page).getByRole('button', { name: 'Send gift', exact: true }).click();
    const successful = await last(page, 'gift.send');
    const ack = { to: host.id, gift: gifts[0].id, idempotencyKey: successful.idempotencyKey, id: id(700), coins: gifts[0].coins, createdAt: at(2) };
    await receive(page, 'gift.sent', ack);
    await receive(page, 'gift.sent', ack);
    assert.equal(await page.locator('.zc-gift-card').count(), 1, 'Repeated send confirmation creates one gift receipt');
    const canonical = receipt(701, 700);
    await receive(page, 'data.thread', { with: host.id, canSend: true, messages: [...baseHistory, canonical] });
    assert.equal(await page.locator('.zc-gift-card').count(), 1, 'Persisted canonical receipt replaces its legacy acknowledgment by transfer ID');
    const card = page.locator(`#zc-m-${canonical.id} .zc-gift-card`);
    await card.waitFor();
    assert.match(await card.innerText(), /Gift sent/i); assert.match(await card.innerText(), /Orbit Rose/); assert.match(await card.innerText(), /37/);
    assert.equal(await card.locator('img').getAttribute('src'), gifts[0].mediaUrl);
    assert.equal(await card.locator('.zc-gift-icon>i').count(), 0, 'Receipt artwork has no crown overlay');
    assert.equal(await card.evaluate(node => node.querySelector('img').getBoundingClientRect().bottom <= node.querySelector('h3').getBoundingClientRect().top + 1), true, 'Portrait receipt artwork stays above its name and price');
    const cardDecoration = await card.evaluate(node => { const style = getComputedStyle(node); return { background: style.backgroundImage, color: style.backgroundColor, border: style.borderTopWidth, shadow: style.boxShadow, filter: style.filter }; });
    assert.equal(cardDecoration.background, 'none'); assert.equal(cardDecoration.border, '0px'); assert.equal(cardDecoration.shadow, 'none'); assert.equal(cardDecoration.filter, 'none'); assert.ok(['rgba(0, 0, 0, 0)', 'transparent'].includes(cardDecoration.color), 'Gift receipt has no added artwork backdrop');
    await receive(page, 'data.catalog', { ...catalog, gifts: gifts.map(gift => ({ ...gift, coins: gift.coins + 500, name: gift.name + ' new catalog' })) });
    await receive(page, 'data.thread', { with: host.id, canSend: true, messages: [...baseHistory, canonical] });
    assert.match(await card.innerText(), /Orbit Rose/); assert.doesNotMatch(await card.innerText(), /new catalog/, 'Historical receipts keep their saved catalog snapshot');
    assert.equal(await page.locator('#ti').inputValue(), 'Keep this draft while choosing gifts');
    assert.equal(await page.evaluate(() => S.bal), 10000, 'Gift acknowledgment does not invent a wallet debit');
    await page.screenshot({ path: path.join(out, 'sent-canonical-receipt.png') });

    // A fresh WebView reads persisted receipts without any earlier gift.sent event.
    const restored = await makePage(browser, errors, member, host, [...baseHistory, canonical]);
    await restored.locator(`#zc-m-${canonical.id} .zc-gift-card`).waitFor();
    assert.equal(await restored.locator('.zc-gift-card').count(), 1, 'Gift receipt survives a fresh app document/history read');
    assert.equal((await sent(restored, 'gift.send')).length, 0);
    await receive(restored, 'data.catalog', { ...catalog, gifts: [] });
    assert.equal(await strip(restored).locator('button').count(), 0, 'An empty server catalog never invents quick gifts');
    assert.equal(await restored.getByRole('button', { name: 'Gift', exact: true }).isVisible(), true, 'Full gift action remains discoverable for an empty catalog');

    // Host reception follows the existing policy: receive gifts, no member gifting controls.
    const incoming = receipt(711, 710, gifts[2], false, 2);
    const hostPage = await makePage(browser, errors, hostAccount, fan, [incoming]);
    const incomingCard = hostPage.locator(`#zc-m-${incoming.id} .zc-gift-card`);
    await incomingCard.waitFor(); assert.match(await incomingCard.innerText(), /Gift received/i); assert.match(await incomingCard.innerText(), /Comet Party/);
    assert.equal(await hostPage.locator('.zc-gift-strip').count(), 0, 'Host does not get member-only quick send controls');
    assert.equal(await hostPage.locator('.zc-gift-button').count(), 0, 'Host reception does not grant new gift-sending permission');
    const realtime = { ...receipt(713, 712, gifts[3], false, 3), from: fan.id, name: fan.name };
    await receive(hostPage, 'chat.message', realtime);
    await receive(hostPage, 'gift.received', { id: id(712), from: fan.id, gift: gifts[3].name, giftId: gifts[3].id, giftName: gifts[3].name, coins: gifts[3].coins, emoji: gifts[3].emoji, mediaUrl: gifts[3].mediaUrl });
    await receive(hostPage, 'chat.message', realtime);
    await receive(hostPage, 'data.thread', { with: fan.id, canSend: true, messages: [incoming, realtime] });
    assert.equal(await hostPage.locator('.zc-gift-card').count(), 2, 'Realtime receipt, gift notification and history converge without duplicates');
    assert.equal((await sent(hostPage, 'gift.send')).length, 0);
    await hostPage.screenshot({ path: path.join(out, 'host-received-receipts.png') });
    const receiptLayouts = await receiptPreviewLayouts(browser, errors);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ actualArtwork: realArt ? { path: realArtPath, bytes: realArt.length, width: 360, height: 640 } : null, layouts, receiptLayouts, checks: ['production bundle', 'native-edge fixtures only', '320/390/1280 light/dark', 'server artwork and prices', 'quick-select full picker', 'separate Gift action', 'no automatic spend', 'wallet failure and retry identity', 'persisted receipts', 'transfer deduplication', 'host reception', 'sent/received natural-aspect previews without side gaps'], pageErrors: errors }, null, 2));
    console.log('PASS chat gifts: compact quick row, explicit server-priced sends, retry/deduplication, persisted receipts, and sent/received portrait/landscape/square previews without side gaps at 320/390px in both themes.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
