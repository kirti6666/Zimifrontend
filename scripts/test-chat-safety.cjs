// Phone numbers and abusive words hidden by the server show as a blur everywhere chat text appears.
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const id = suffix => `507f1f77bcf86cd7994390${suffix}`;
const mira = { id: id('11'), name: 'Mira North', role: 'host', category: 'Music', online: true, verified: true, availableForCall: true, ratePerMin: 0 };
const member = { user: { id: id('01'), name: 'Member', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false, isPhoneVerified: true }, balance: 0, verification: 'none', requiresOnboarding: false };
const hidden = '█'.repeat(10);
const host = { ...member, user: { ...member.user, id: id('02'), name: 'Mira North', role: 'host', serverRole: 'host', hostStatus: 'approved', isVerifiedHost: true }, verification: 'verified' };
const rohan = { id: id('13'), name: 'Rohan', role: 'sender', online: true, verified: false };


(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => { window.__sent = []; window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) }; });
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href + '?role=sender');
    const receive = (type, data) => page.evaluate(message => Native.receive(message), { type, data });
    await receive('session', member);
    await receive('data.home', { hosts: [mira], stage: [], featured: mira, total: 1, page: 1, categories: ['Music'], availableCount: 1 });

    await page.evaluate(() => go('chats'));
    await receive('data.chats', { chats: [{ id: id('21'), user: mira, last: `my number is ${hidden}`, time: '1m ago', lastAt: new Date().toISOString(), unread: 1, lastKind: 'text', lastMine: false, lastStatus: 'sent', hasCalls: false }], total: 1, page: 1, limit: 50, unreadCount: 1, unreadConversations: 1 });
    const row = page.locator('.zc-row').first();
    await row.locator('.chat-hidden').waitFor();
    const style = await row.locator('.chat-hidden').evaluate(node => ({ filter: getComputedStyle(node).filter, select: getComputedStyle(node).userSelect, label: node.getAttribute('aria-label') }));
    assert.match(style.filter, /blur/, 'Hidden text is blurred');
    assert.equal(style.select, 'none', 'Hidden text cannot be selected or copied');
    assert.equal(style.label, 'Hidden');

    await page.evaluate(person => go('thread', person), mira.id);
    await receive('data.thread', { with: mira.id, messages: [{ id: 'm1', mine: false, text: `you ${'█'.repeat(7)}`, at: new Date().toISOString() }], canSend: true });
    await page.locator('.zc-msg.theirs .bub .chat-hidden').waitFor();
    await page.locator('#ti').fill('call me 9876543210');
    await page.locator('#ti').press('Enter');
    assert.equal(await page.evaluate(() => __sent.filter(message => message.type === 'chat.send').at(-1).data.text), 'call me 9876543210', 'The server, not the screen, decides what is hidden');
    await receive('chat.sent', { to: mira.id, sent: 'call me 9876543210', text: `call me ${hidden}`, inCall: false });
    const mine = page.locator('.zc-msg.mine .bub').last();
    await mine.locator('.chat-hidden').waitFor();
    assert.equal((await mine.innerText()).includes('9876543210'), false, 'The sender sees what was delivered');
    await page.getByText('Phone numbers and abusive words are hidden in chat.').first().waitFor();
    await page.screenshot({ path: path.join(os.tmpdir(), 'zimi-chat-hidden.png') });

    const feeds = await page.evaluate(text => {
      const feed = document.createElement('div'); feed.id = 'rfeed'; document.body.append(feed);
      S.rmsgs = [['host', 'Mira', text]]; paintFeed();
      const call = feed.innerHTML; feed.remove();
      Home.messages = [{ name: 'Viewer', text }];
      return { call, live: zrMessageHTML() };
    }, `ping ${hidden}`);
    assert.match(feeds.call, /class="chat-hidden"/, 'In-call chat blurs hidden text');
    assert.match(feeds.live, /class="chat-hidden"/, 'Live-room chat blurs hidden text');
    // A member sends a photo: it is uploaded through the app and shows unblurred to them.
    await page.evaluate(person => go('thread', person), mira.id);
    await receive('data.thread', { with: mira.id, messages: [], canSend: true });
    // A real PNG drawn in the browser, so the picker resizes it like any camera photo.
    const png = Buffer.from(await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 8; const context = canvas.getContext('2d'); context.fillStyle = '#c0f'; context.fillRect(0, 0, 8, 8); return canvas.toDataURL('image/png').split(',')[1]; }), 'base64');
    await page.getByRole('button', { name: 'Add a photo or emoji', exact: true }).click();
    const picker = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: 'Photo', exact: true }).click();
    await (await picker).setFiles({ name: 'me.png', mimeType: 'image/png', buffer: png });
    await page.waitForFunction(() => __sent.some(message => message.type === 'chat.photo'));
    const photoMessage = await page.evaluate(() => __sent.filter(message => message.type === 'chat.photo').at(-1).data);
    assert.equal(photoMessage.to, mira.id);
    assert.match(photoMessage.photo, /^data:image\/jpeg;base64,/, 'Photos are resized to a JPEG before upload');
    const ownPhoto = page.locator('.zc-msg.mine .zc-photo').last();
    await ownPhoto.getByText('Sending…').waitFor();
    assert.equal(await ownPhoto.evaluate(node => node.classList.contains('is-blurred')), false, 'Senders see their own photo');
    await receive('chat.photoSent', { to: mira.id });
    await ownPhoto.getByText('Sending…').waitFor({ state: 'detached' });

    // A creator receives a member's photo: blurred until they choose to view it.
    const creator = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    creator.on('pageerror', error => errors.push(error.message));
    await creator.route('https://**/*', route => route.abort());
    await creator.addInitScript(() => { window.__sent = []; window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) }; });
    await creator.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href + '?role=host');
    const creatorReceive = (type, data) => creator.evaluate(message => Native.receive(message), { type, data });
    await creatorReceive('session', host);
    await creatorReceive('data.chats', { chats: [{ id: id('31'), user: rohan, last: '', lastKind: 'image', time: '1m ago', lastAt: new Date().toISOString(), unread: 1, lastMine: false, lastStatus: 'sent', hasCalls: false }], total: 1, page: 1, limit: 50, unreadCount: 1, unreadConversations: 1 });
    await creator.evaluate(() => go('chats'));
    await creator.locator('.zc-row').filter({ hasText: 'Photo' }).waitFor();
    await creator.evaluate(person => zcOpen(person), rohan.id);
    await creatorReceive('data.thread', { with: rohan.id, messages: [{ id: 'photo-1', mine: false, kind: 'image', imageUrl: 'https://cdn.example.test/chats/rohan/photo.jpg', text: '', at: new Date().toISOString() }], canSend: true });
    const blurred = creator.getByRole('button', { name: 'Photo hidden. Tap to view' });
    await blurred.waitFor();
    assert.match(await blurred.locator('img').evaluate(node => getComputedStyle(node).filter), /blur/, 'The photo itself is blurred');
    await creator.screenshot({ path: path.join(os.tmpdir(), 'zimi-chat-photo-blurred.png') });
    await blurred.click();
    await blurred.waitFor({ state: 'detached' });
    assert.equal(await creator.locator('.zc-msg.theirs .zc-photo img').evaluate(node => getComputedStyle(node).filter), 'none', 'Tapping shows the photo');
    await creator.evaluate(() => go('chats'));
    await creator.evaluate(person => zcOpen(person), rohan.id);
    await creatorReceive('data.thread', { with: rohan.id, messages: [{ id: 'photo-1', mine: false, kind: 'image', imageUrl: 'https://cdn.example.test/chats/rohan/photo.jpg', text: '', at: new Date().toISOString() }], canSend: true });
    await creator.getByRole('button', { name: 'Photo hidden. Tap to view' }).waitFor();
    await creator.close();

    assert.deepEqual(errors, []);
    console.log('PASS chat safety: hidden phone numbers and abuse show blurred and uncopyable in the list, conversation, in-call and live chat; senders see what was delivered; members send photos and creators see them blurred until they tap, again on every visit');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
