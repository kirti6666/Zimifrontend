/* Screenshot-inspired Chats UI contracts. All production data is supplied by a
   local native-bridge stub; no real messages, calls, or account writes occur. */
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const id = suffix => `507f1f77bcf86cd7994390${suffix}`;
const now = Date.now();
const at = minutes => new Date(now - minutes * 60000).toISOString();
const mira = { id: id('11'), name: 'Mira North', role: 'host', category: 'Music', tag: 'Acoustic evenings', online: true, verified: true, availableForCall: true, ratePerMin: 0 };
const asha = { id: id('12'), name: 'Asha Sen', role: 'host', category: 'Talk', tag: 'Books and stories', online: false, verified: true, availableForCall: false, ratePerMin: 0 };
const rohan = { id: id('13'), name: 'Rohan Patel', role: 'sender', category: '', tag: '', online: false, verified: false, availableForCall: false };
const memberAccount = { user: { id: id('01'), name: 'Test Member', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false, isPhoneVerified: true }, balance: 1250, verification: 'none', requiresOnboarding: false };
const hostAccount = { ...memberAccount, user: { ...memberAccount.user, id: id('02'), name: 'Test Creator', role: 'host', serverRole: 'host', hostStatus: 'approved', isVerifiedHost: true }, verification: 'verified' };
const conversations = [
  { id: id('21'), user: rohan, last: 'Weekend coffee plans', time: '1m ago', lastAt: at(1), unread: 1, lastKind: 'text', lastMine: false, lastStatus: 'sent', hasCalls: false },
  { id: id('22'), user: mira, last: 'Your acoustic song request is ready', time: '2m ago', lastAt: at(2), unread: 2, lastKind: 'text', lastMine: false, lastStatus: 'sent', hasCalls: true, lastAutomated: true },
  { id: id('23'), user: asha, last: 'Thanks for the session', time: '1h ago', lastAt: at(60), unread: 0, lastKind: 'text', lastMine: true, lastStatus: 'read', hasCalls: false },
];
const chatData = (chats = conversations) => ({ chats, total: chats.length, page: 1, limit: 50, unreadCount: chats.reduce((sum, chat) => sum + chat.unread, 0), unreadConversations: chats.filter(chat => chat.unread > 0).length });
const homeData = { hosts: [mira, asha], stage: [mira], featured: mira, total: 2, page: 1, limit: 20, categories: ['Music', 'Talk'], broadcasterCount: 0, availableCount: 1, speedMatchEnabled: true, bonus: null, unreadCount: 0 };

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  const captureErrors = page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && !/^Failed to load resource: net::ERR_FAILED/.test(message.text())) errors.push(message.text());
    });
  };
  try {
    const preview = await browser.newPage({ viewport: { width: 373, height: 844 }, reducedMotion: 'reduce' });
    preview.setDefaultTimeout(7000);
    captureErrors(preview);
    await preview.route('https://**/*', route => route.abort());
    await preview.goto(pathToFileURL(path.join(root, 'dist/index.html')).href + '?role=sender');
    await preview.getByRole('button', { name: 'Chats', exact: true }).click();
    await preview.getByRole('heading', { name: 'Chats', exact: true }).waitFor();
    assert.equal(await preview.locator('.zh-header').count(), 1, 'Chats shares the branded app header');
    assert.equal(await preview.evaluate(() => document.documentElement.dataset.theme), 'dark');
    assert.ok(await preview.locator('button.zc-row').count() > 0, 'Demo conversations are immediately usable');
    assert.equal(await preview.locator('.zh-skeleton').count(), 0, 'Demo fixtures do not wait for an absent server');
    for (const width of [320, 373, 630, 1280]) {
      await preview.setViewportSize({ width, height: width === 630 ? 1600 : 900 });
      assert.equal(await preview.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Chats does not overflow at ${width}px`);
      assert.equal(await preview.getByRole('button', { name: 'New chat', exact: true }).isVisible(), true);
      assert.equal(await preview.locator('.zh-nav button').count(), 4);
      const animations = await preview.locator('.zc-row,.zc-person').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).animationName));
      assert.ok(animations.every(name => name === 'none'), 'Reduced motion removes decorative chat entrance animations');
      await preview.screenshot({ path: path.join(os.tmpdir(), `zimi-chats-preview-${width}.png`) });
    }
    console.log('PASS chats: screenshot layout at 320/373/630/1280px, shared header/navigation, demo, reduced motion');

    await preview.evaluate(() => go('thread', 'aanya'));
    await preview.locator('.zc-thread').waitFor();
    assert.equal(await preview.locator('.zc-thread-live').count(), 1, 'A live creator shows the live banner');
    assert.equal(await preview.locator('.zc-gift-card').count(), 1);
    assert.equal(await preview.locator('.zc-voice').count(), 1);
    for (const width of [320, 373, 630, 1280]) {
      await preview.setViewportSize({ width, height: 844 });
      assert.equal(await preview.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `The thread does not overflow at ${width}px`);
      assert.equal(await preview.getByRole('button', { name: 'Send message', exact: true }).isVisible(), true);
      await preview.screenshot({ path: path.join(os.tmpdir(), `zimi-thread-preview-${width}.png`) });
    }
    await preview.getByRole('button', { name: 'More options', exact: true }).click();
    await preview.getByRole('menuitem', { name: 'View profile' }).waitFor();
    await preview.keyboard.press('Escape');
    assert.equal(await preview.getByRole('menu').count(), 0, 'Escape closes the thread menu');
    await preview.locator('#ti').focus();
    assert.equal(await preview.locator('#ti').evaluate(input => getComputedStyle(input).outlineStyle), 'none', 'The focused composer shows focus on its pill, not a box inside it');
    console.log('PASS chats: thread preview layout at 320/373/630/1280px and menu');

    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(7000);
    captureErrors(page);
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => {
      window.__sent = [];
      window.ReactNativeWebView = { postMessage: raw => window.__sent.push(JSON.parse(raw)) };
    });
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href + '?role=sender');
    const receive = (type, data = {}) => page.evaluate(message => Native.receive(message), { type, data });
    const loading = (resource, value, extra = {}) => receive('data.loading', { resource, loading: value, ...extra });
    const lastSent = type => page.evaluate(value => window.__sent.filter(message => message.type === value).at(-1)?.data, type);
    const sentCount = type => page.evaluate(value => window.__sent.filter(message => message.type === value).length, type);
    const navigate = view => page.evaluate(value => go(value), view);
    const rows = () => page.locator('button.zc-row');
    const names = () => rows().evaluateAll(nodes => nodes.map(node => node.innerText));
    const tab = name => page.getByRole('tab', { name: new RegExp(`^${name}(?:\\s|\\(|$)`) });
    const selectTab = async name => { await tab(name).click(); assert.equal(await tab(name).getAttribute('aria-selected'), 'true'); };
    const search = () => page.getByRole('textbox', { name: 'Search conversations', exact: true });
    const settle = async (type, data, resource) => { await receive(type, data); await loading(resource, false); };
    const loadChats = data => settle('data.chats', data, 'chats');

    await receive('session', memberAccount);
    await navigate('chats');
    await page.getByRole('status', { name: 'Loading conversations', exact: true }).waitFor();
    assert.equal(await rows().count(), 0, 'Production never substitutes sample conversations while loading');
    assert.equal(await page.getByText('Zimi Rewards & Bot', { exact: true }).count(), 0, 'Production does not invent a rewards bot');
    assert.equal(await page.getByText(/No conversations/).count(), 0, 'The empty state waits for the request');
    assert.equal(await page.getByRole('button', { name: 'Mark all as read', exact: true }).isDisabled(), true);
    await settle('data.home', homeData, 'home');
    await settle('wallet.balance', { coins: 1250, earningsPaise: 0 }, 'wallet');
    await settle('data.calls', { calls: [{ user: mira, time: 'Yesterday', duration: '1:20', coins: 0 }] }, 'calls');
    await settle('data.missed', { calls: [] }, 'missed');
    await loadChats(chatData());
    assert.equal(await rows().count(), 3);
    assert.equal(await rows().filter({ hasText: 'Mira North' }).locator('.zc-automated').textContent(), 'Automated welcome');
    assert.equal(await rows().filter({ hasText: 'Rohan Patel' }).locator('.zc-automated').count(), 0, 'Personal replies have no automation label');
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'The welcome preview label fits narrow screens');
    }
    await page.getByText('2 new', { exact: true }).waitFor();
    assert.match((await names())[0], /Rohan Patel/);
    assert.deepEqual(await page.getByRole('tab').allInnerTexts(), ['All', 'Unread', 'Calls', 'Missed calls'], 'Four plain filters, without counts');
    assert.equal(await page.locator('.zc-pulse,.zc-match-footer').count(), 0, 'Speed matching stays on Home, not in the chat list');
    await selectTab('Calls');
    assert.equal(await rows().count(), 1);
    assert.match((await names())[0], /Mira North/);
    await selectTab('Unread');
    assert.equal(await rows().count(), 2);
    await selectTab('Missed calls');
    await page.getByRole('heading', { name: 'No missed calls', exact: true }).waitFor();
    await selectTab('All');
    await search().fill('coffee');
    assert.equal(await rows().count(), 1);
    assert.match((await names())[0], /Rohan Patel/);
    await search().fill('books');
    assert.equal(await rows().count(), 1);
    assert.match((await names())[0], /Asha Sen/);
    await search().fill('MIRA');
    assert.equal(await rows().count(), 1);
    await search().evaluate(input => input.setSelectionRange(1, 3));
    const conversationFocus = () => search().evaluate(input => ({ focused: document.activeElement === input, value: input.value, start: input.selectionStart, end: input.selectionEnd }));
    await loading('chats', true);
    assert.deepEqual(await conversationFocus(), { focused: true, value: 'MIRA', start: 1, end: 3 }, 'Refresh preserves conversation query focus and selection');
    await loadChats(chatData());
    assert.deepEqual(await conversationFocus(), { focused: true, value: 'MIRA', start: 1, end: 3 }, 'Realtime results preserve the search cursor');
    await search().fill('');
    assert.equal(await rows().count(), 3);

    await page.getByRole('button', { name: 'Conversation filters', exact: true }).click();
    const filters = page.getByRole('dialog', { name: 'Conversation filters', exact: true });
    await filters.waitFor();
    await filters.getByLabel('Sort conversations', { exact: true }).selectOption({ label: 'Name' });
    assert.match((await names())[0], /Asha Sen/);
    await filters.getByLabel('Sort conversations', { exact: true }).selectOption({ label: 'Unread first' });
    assert.match((await names())[0], /Mira North/);
    await filters.getByLabel('Sort conversations', { exact: true }).selectOption({ label: 'Most recent' });
    assert.match((await names())[0], /Rohan Patel/);
    await filters.getByLabel('Online only', { exact: true }).check();
    assert.equal(await rows().count(), 1);
    assert.match((await names())[0], /Mira North/);
    await filters.getByLabel('Sort conversations', { exact: true }).selectOption({ label: 'Name' });
    await filters.getByRole('button', { name: 'Reset filters', exact: true }).click();
    assert.equal(await rows().count(), 3);
    assert.equal(await filters.getByLabel('Online only', { exact: true }).isChecked(), false);
    assert.equal(await filters.getByLabel('Sort conversations', { exact: true }).inputValue(), 'recent');
    await page.keyboard.press('Escape');
    await filters.waitFor({ state: 'hidden' });
    console.log('PASS chats: All/Creators/Calls/Unread filters, name/message/tag search, sort and online filter');

    const readAll = () => page.getByRole('button', { name: 'Mark all as read', exact: true });
    await readAll().click();
    assert.equal(await sentCount('chats.readAll'), 1);
    assert.equal(await readAll().isDisabled(), true);
    assert.equal(await page.getByText('2 new', { exact: true }).count(), 1, 'Sending a request does not optimistically erase unread messages');
    await receive('operation.error', { action: 'chats.readAll', message: 'Could not update read status. Try again.' });
    assert.equal(await readAll().isEnabled(), true);
    assert.equal(await page.getByText('2 new', { exact: true }).count(), 1);
    await page.getByRole('alert').filter({ hasText: 'Could not update read status' }).waitFor();
    await readAll().click();
    const readAt = new Date().toISOString();
    const afterRead = conversations.map(chat => ({ ...chat, unread: 0 }));
    afterRead[0] = { ...afterRead[0], last: 'A message arriving after mark all', unread: 1, lastAt: new Date(Date.parse(readAt) + 1000).toISOString() };
    await loadChats(chatData(afterRead));
    await receive('chats.readAll', { updated: 3, readAt });
    assert.equal(await page.getByText('1 new', { exact: true }).count(), 1, 'A late acknowledgment preserves messages newer than its readAt');
    await loadChats(chatData(conversations.map(chat => ({ ...chat, unread: 0 }))));
    assert.equal(await readAll().isDisabled(), true);
    console.log('PASS chats: read-all waits for acknowledgment, recovers from failure and preserves newer unread messages');

    await loadChats(chatData());
    await rows().filter({ hasText: 'Mira North' }).click();
    assert.equal(await page.evaluate(() => S.v), 'thread');
    assert.equal((await lastSent('chat.open')).with, mira.id);
    await page.getByRole('status', { name: 'Loading messages', exact: true }).waitFor();
    await settle('data.thread', { with: mira.id, messages: [{ mine: false, text: 'A real thread response', time: '12:00', automated: true }], readAt: new Date().toISOString() }, 'thread');
    assert.match(await page.locator('#tf').innerText(), /A real thread response/);
    assert.equal(await page.locator('#tf .zc-automated').textContent(), 'Automated welcome', 'Initial history retains automated welcome labels');
    const draft = page.getByPlaceholder('Type a message to Mira', { exact: true });
    await draft.fill('Keep this unsent draft');
    const openedBeforeIncoming = await sentCount('chat.open');
    await receive('chat.message', { from: mira.id, text: 'A new message in the active thread', id: id('31'), createdAt: new Date().toISOString(), automated: true });
    assert.equal(await page.locator('#tf .zc-automated').count(), 2, 'Realtime messages carry the same automation label as history');
    assert.equal(await sentCount('chat.open'), openedBeforeIncoming + 1, 'An incoming message in the active thread requests a server read acknowledgment');
    assert.equal((await lastSent('chat.open')).with, mira.id);
    assert.equal(await page.evaluate(() => window.ZimiChats.unread()), 2, 'Opening or receiving a message does not optimistically clear unread counts');
    await loading('thread', true);
    assert.equal(await draft.inputValue(), 'Keep this unsent draft');
    await settle('data.thread', { with: mira.id, messages: [{ mine: false, text: 'A real thread response', time: '12:00', automated: true }, { mine: false, text: 'A new message in the active thread', time: '12:01', automated: true }], readAt: new Date().toISOString() }, 'thread');
    assert.equal(await page.locator('#tf .zc-automated').count(), 2, 'Refreshing history preserves automation labels');
    assert.equal(await draft.inputValue(), 'Keep this unsent draft', 'The authoritative thread response preserves an unsent draft');
    await receive('chat.message', { from: asha.id, text: 'Message in another conversation', id: id('32') });
    await receive('chat.message', { from: mira.id, text: 'An in-call message', inCall: true, id: id('33') });
    assert.equal(await sentCount('chat.open'), openedBeforeIncoming + 1, 'Other conversations and in-call events do not mark the active thread read');
    await settle('data.thread', { with: mira.id, messages: [{ mine: true, text: 'Seen already', createdAt: at(3), status: 'read' }, { mine: true, text: 'Not seen yet', createdAt: at(2), status: 'sent' }, { mine: false, text: 'Reply from Mira', createdAt: at(1) }], readAt: new Date().toISOString() }, 'thread');
    assert.deepEqual(await page.locator('#tf .zc-tick').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))), ['Read', 'Sent'], 'Read ticks follow the server read state of own messages');
    assert.equal(await page.locator('#tf .zc-automated').count(), 0, 'Ordinary thread messages are not marked automated');
    assert.equal(await page.locator('.zc-thread-day').textContent(), 'Today');
    assert.equal(await page.locator('.zc-voice, .zc-gift-card, .zc-thread-live').count(), 0, 'Production threads show only server history, without preview content');
    assert.equal(await page.locator('.zc-thread-header small').textContent(), 'Online', 'An unknown call rate is never presented as a price');
    await draft.fill('Hello Mira');
    await draft.press('Enter');
    assert.equal((await lastSent('chat.send')).text, 'Hello Mira');
    assert.equal(await draft.inputValue(), '', 'Sending clears the draft');
    await receive('operation.error', { action: 'chat.send', message: 'Message could not be sent.' });
    await page.locator('#tf .zc-meta').filter({ hasText: 'Not sent' }).waitFor();
    await page.getByRole('button', { name: 'Love it', exact: true }).click();
    assert.equal((await lastSent('chat.send')).text, 'Love it 🔥', 'Quick replies send real messages');
    const rose = { id: id('41'), name: 'Rose', emoji: '🌹', coins: 10 };
    await page.getByRole('button', { name: 'Send a gift', exact: true }).click();
    await settle('data.catalog', { gifts: [rose], packs: [], paymentsAvailable: false }, 'catalog');
    await page.getByRole('dialog', { name: 'Send a gift', exact: true }).getByRole('button').filter({ hasText: 'Rose' }).click();
    await page.getByRole('button', { name: 'Send gift', exact: true }).click();
    assert.equal((await lastSent('gift.send')).gift, rose.id);
    assert.equal((await lastSent('gift.send')).inCall, false);
    assert.equal(await page.locator('.zc-gift-card').count(), 0, 'A gift card waits for server confirmation');
    await receive('gift.sent', { to: mira.id, gift: rose.id, idempotencyKey: (await lastSent('gift.send')).idempotencyKey });
    assert.match(await page.locator('.zc-gift-card').innerText(), /Rose[\s\S]*Delivered to Mira/);
    await settle('data.thread', { with: mira.id, messages: [{ mine: false, text: 'Thank you!', createdAt: new Date().toISOString() }] }, 'thread');
    assert.equal(await page.locator('.zc-gift-card').count(), 1, 'A confirmed gift stays in the thread across history refreshes');
    assert.equal(await page.locator('#app-notice').textContent(), 'Gift sent!');
    await page.evaluate(() => document.getElementById('app-notice')?.remove()); // the toast would cover later steps for 7s
    console.log('PASS chats: thread read ticks, quick replies, failed sends and confirmed gift cards');
    await navigate('chats');
    await page.getByRole('button', { name: 'New chat', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'New conversation', exact: true });
    await picker.waitFor();
    await picker.getByRole('textbox').fill('Asha');
    await picker.getByRole('textbox').evaluate(input => input.setSelectionRange(1, 3));
    await settle('data.home', homeData, 'home');
    assert.deepEqual(await picker.getByRole('textbox').evaluate(input => ({ focused: document.activeElement === input, value: input.value, start: input.selectionStart, end: input.selectionEnd })), { focused: true, value: 'Asha', start: 1, end: 3 }, 'Background creator updates preserve contact search focus and selection');
    await picker.getByRole('button').filter({ hasText: 'Asha Sen' }).click();
    assert.equal((await lastSent('chat.open')).with, asha.id);
    assert.equal(await page.evaluate(() => S.v), 'thread');
    await navigate('chats');
    await page.getByRole('button', { name: 'New chat', exact: true }).click();
    await picker.getByRole('button', { name: 'Find more creators', exact: true }).click();
    assert.equal(await page.evaluate(() => S.v), 'search');
    await navigate('chats');
    await page.locator('.zc-available .zc-person').filter({ hasText: 'Mira' }).click();
    assert.equal(await page.evaluate(() => S.v), 'precall');
    assert.equal(await page.evaluate(() => S.h), mira.id);
    console.log('PASS chats: real thread navigation, new contact picker and available creator');

    await navigate('chats');
    await loadChats({ ...chatData(conversations.slice(0, 2)), total: 3 });
    await page.getByRole('button', { name: 'Load more conversations', exact: true }).click();
    await page.getByRole('status', { name: 'Loading conversations', exact: true }).waitFor();
    assert.equal(await rows().count(), 2, 'Pagination retains previously loaded conversations');
    assert.ok(await page.locator('.zc-list .zc-skeleton-row').count() > 0, 'Pagination appends shaped placeholders');
    assert.equal((await lastSent('chats.reload')).page, 2);
    await receive('data.chats', { ...chatData(conversations.slice(2)), page: 2, total: 3, unreadCount: 3, unreadConversations: 2 });
    await loading('chats', false, { page: 2 });
    assert.equal(await rows().count(), 3, 'The next page appends real conversations');
    assert.equal(await page.locator('.zc-list .zc-skeleton-row').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Chats', exact: true }).locator('.zh-nav-dot').count(), 1, 'A page with zero local unread messages cannot hide the global unread badge');
    await loading('chats', true);
    await page.getByRole('status', { name: 'Loading conversations', exact: true }).waitFor();
    assert.equal(await rows().count(), 0, 'Refresh conceals stale conversation cards');
    await loading('chats', false, { error: 'Conversation service unavailable' });
    await page.getByRole('alert').filter({ hasText: 'Conversation service unavailable' }).waitFor();
    assert.equal(await page.getByText(/No conversations/).count(), 0, 'A load failure is not rendered as an empty inbox');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('status', { name: 'Loading conversations', exact: true }).waitFor();
    assert.ok((await sentCount('chats.reload')) > 0, 'Retry reloads the inbox');
    await loadChats(chatData([]));
    assert.equal(await rows().count(), 0);
    assert.equal(await page.locator('.zc-list .zh-skeleton').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Chats', exact: true }).locator('.zh-nav-dot').count(), 0, 'An authoritative zero unread count clears the navigation badge');
    const hostile = { ...mira, id: id('99'), name: '<img src=x onerror="window.__chatXss=1">' };
    await loadChats(chatData([{ ...conversations[1], user: hostile, last: '<svg onload="window.__chatXss=2">unsafe message</svg>' }]));
    assert.match(await rows().innerText(), /<img src=x/);
    assert.match(await rows().innerText(), /<svg onload=/);
    assert.equal(await page.locator('.zc-row img[onerror],.zc-row svg[onload],.zc-row script').count(), 0);
    assert.equal(await page.evaluate(() => window.__chatXss), undefined);
    assert.equal(await page.getByText('Zimi Rewards & Bot', { exact: true }).count(), 0);
    console.log('PASS chats: request skeletons, error/retry/empty lifecycle, production isolation and escaped server data');

    await loadChats(chatData());
    await page.evaluate(value => go('thread', value), mira.id);
    const guardedDraft = page.getByPlaceholder('Type a message to Mira', { exact: true });
    const sendButton = page.getByRole('button', { name: 'Send message', exact: true });
    const quickReply = page.getByRole('button', { name: 'Love it', exact: true });
    const sendsBeforeGuard = await sentCount('chat.send');
    await page.getByRole('status', { name: 'Loading messages', exact: true }).waitFor();
    await guardedDraft.fill('Keep my draft through failed thread loads');
    assert.equal(await sendButton.isDisabled(), true, 'Thread loading cannot send before server permissions arrive');
    assert.equal(await quickReply.isDisabled(), true, 'Quick replies wait for the same thread authorization');
    await guardedDraft.press('Enter');
    await page.evaluate(() => zcThreadSend('A quick reply attempted while loading'));
    assert.equal(await sentCount('chat.send'), sendsBeforeGuard);
    assert.equal(await guardedDraft.inputValue(), 'Keep my draft through failed thread loads');

    await loading('thread', false, { error: 'Connections are allowed only between a member and an approved host' });
    await page.getByRole('alert').filter({ hasText: 'Connections are allowed only between' }).waitFor();
    assert.equal(await sendButton.isDisabled(), true, 'A forbidden thread cannot keep a working send control');
    assert.equal(await quickReply.isDisabled(), true);
    await guardedDraft.press('Enter');
    await page.evaluate(() => zcThreadSend('A quick reply attempted after a thread error'));
    assert.equal(await sentCount('chat.send'), sendsBeforeGuard, 'Error states cannot bypass disabled buttons through Enter or quick-reply handlers');
    assert.equal(await guardedDraft.inputValue(), 'Keep my draft through failed thread loads');

    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('status', { name: 'Loading messages', exact: true }).waitFor();
    await settle('data.thread', { with: mira.id, messages: [], canSend: true }, 'thread');
    assert.equal(await sendButton.isEnabled(), true, 'A successful retry restores the permitted composer');
    assert.equal(await guardedDraft.inputValue(), 'Keep my draft through failed thread loads');
    await page.evaluate(() => document.getElementById('app-notice')?.remove());
    await sendButton.click();
    assert.equal(await sentCount('chat.send'), sendsBeforeGuard + 1);
    assert.equal((await lastSent('chat.send')).text, 'Keep my draft through failed thread loads');
    await guardedDraft.fill('Keep my draft while this conversation is read-only');
    await settle('data.thread', { with: mira.id, messages: [], canSend: false, sendDisabledReason: 'The member must reply before the host can send messages.' }, 'thread');
    assert.equal(await sendButton.isDisabled(), true, 'Authoritative canSend:false takes precedence over local account and peer roles');
    assert.equal(await quickReply.isDisabled(), true);
    await guardedDraft.press('Enter');
    await page.evaluate(() => zcThreadSend('Cannot bypass canSend:false'));
    assert.equal(await sentCount('chat.send'), sendsBeforeGuard + 1);
    assert.equal(await guardedDraft.inputValue(), 'Keep my draft while this conversation is read-only');
    console.log('PASS chats: thread loading/error/read-only guards prevent sends and preserve drafts through retry');

    await navigate('chats');
    await page.evaluate(() => document.getElementById('app-notice')?.remove());
    await page.getByRole('button', { name: 'New chat', exact: true }).click();
    assert.deepEqual(await picker.locator('.zc-contact b').allTextContents(), ['Mira North', 'Asha Sen'], 'Members can choose only creators, even when unrelated member data is cached');
    await page.keyboard.press('Escape');
    let opened = await sentCount('chat.open');
    await page.evaluate(value => go('thread', value), rohan.id);
    assert.equal(await page.evaluate(() => S.v), 'chats');
    assert.equal(await sentCount('chat.open'), opened, 'A member cannot navigate directly into another member thread');

    const welcomeMember = { ...rohan, id: id('14'), name: 'Welcome-only Member' };
    const hostChats = chatData([
      { ...conversations[0], automatedOnly: false },
      { ...conversations[0], id: id('24'), user: welcomeMember, automatedOnly: true, last: 'An automated hello', lastAutomated: true },
      conversations[1],
    ]);
    await receive('session', hostAccount);
    await settle('data.home', homeData, 'home');
    await loadChats(hostChats);
    await navigate('chats');
    assert.equal(await page.evaluate(() => S.user.serverRole), 'host');
    await page.evaluate(() => document.getElementById('app-notice')?.remove());
    await page.getByRole('button', { name: 'New chat', exact: true }).click();
    assert.deepEqual(await picker.locator('.zc-contact b').allTextContents(), ['Rohan Patel'], 'Approved creators can select only existing member-initiated conversations');
    await page.keyboard.press('Escape');
    opened = await sentCount('chat.open');
    await page.evaluate(value => go('thread', value), mira.id);
    assert.equal(await page.evaluate(() => S.v), 'chats');
    assert.equal(await sentCount('chat.open'), opened, 'An approved creator cannot open another creator from stale discovery data');
    await page.evaluate(value => go('thread', value), id('98'));
    assert.equal(await sentCount('chat.open'), opened, 'A creator cannot initiate a chat with an unknown member ID');
    await page.evaluate(value => go('thread', value), rohan.id);
    assert.equal(await page.evaluate(() => S.v), 'thread');
    assert.equal((await lastSent('chat.open')).with, rohan.id, 'Existing member conversations remain accessible to approved creators');
    await settle('data.thread', { with: rohan.id, messages: [], canSend: true }, 'thread');
    await page.evaluate(() => document.getElementById('app-notice')?.remove());
    await page.getByPlaceholder('Type a message to Rohan', { exact: true }).fill('A creator replies to an existing member');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    assert.equal((await lastSent('chat.send')).to, rohan.id);

    await page.evaluate(({ member, creatorId }) => {
      personFrom(member);
      go('host', creatorId);
      go('user', member.id);
    }, { member: rohan, creatorId: mira.id });
    assert.deepEqual(await page.evaluate(() => ({ view: S.v, memberId: S.u, backId: S.backId })), { view: 'user', memberId: rohan.id, backId: mira.id });
    const profileMessage = page.getByRole('button', { name: 'Message', exact: true });
    assert.equal(await profileMessage.isEnabled(), true, 'An approved creator can reply from an existing member profile');
    opened = await sentCount('chat.open');
    await profileMessage.click();
    assert.equal(await sentCount('chat.open'), opened + 1);
    assert.equal((await lastSent('chat.open')).with, rohan.id, 'Profile Message targets the displayed member rather than the previous creator profile');
    assert.equal(await page.evaluate(() => S.h), rohan.id);
    await page.evaluate(value => go('host', value), mira.id);
    assert.equal(await profileMessage.isDisabled(), true, 'A creator profile cannot offer another creator a Message action');
    await profileMessage.evaluate(button => button.click());
    assert.equal(await sentCount('chat.open'), opened + 1, 'A disabled creator-to-creator profile action never opens a thread');
    console.log('PASS chats: member profile Message targets its displayed account despite a stale creator back target');

    for (const hostStatus of ['pending', 'suspended']) {
      await receive('session', { ...hostAccount, user: { ...hostAccount.user, role: 'sender', serverRole: 'host', hostStatus, isVerifiedHost: false }, verification: hostStatus === 'pending' ? 'pending' : 'rejected' });
      await settle('data.home', homeData, 'home');
      await loadChats(hostChats);
      await navigate('chats');
      assert.equal(await page.evaluate(() => S.role), 'sender');
      assert.equal(await page.evaluate(() => S.user.serverRole), 'host', 'Presentation fallback preserves the real server role');
      opened = await sentCount('chat.open');
      for (const peer of [mira.id, rohan.id]) await page.evaluate(value => go('thread', value), peer);
      assert.equal(await page.evaluate(() => S.v), 'chats');
      assert.equal(await sentCount('chat.open'), opened, `${hostStatus} hosts cannot masquerade as ordinary members when opening a conversation`);
      await page.evaluate(() => document.getElementById('app-notice')?.remove());
      await page.getByRole('button', { name: 'New chat', exact: true }).click();
      assert.equal(await picker.locator('.zc-contact').count(), 0, `${hostStatus} hosts have no selectable chat peers`);
      await page.keyboard.press('Escape');
    }
    console.log('PASS chats: authoritative member/approved/pending/suspended role matrix and existing-conversation picker');
    assert.deepEqual(errors, [], 'Chats renders and handles native events without browser errors');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
