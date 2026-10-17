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
    assert.deepEqual(errors, []);
    console.log('PASS chat safety: hidden phone numbers and abuse show blurred and uncopyable in the list, conversation, in-call and live chat; senders see what was delivered');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
