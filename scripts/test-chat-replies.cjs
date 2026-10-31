// Fixture-only browser coverage for swipe replies, quote navigation and live updates.
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const id = suffix => `507f1f77bcf86cd7994390${suffix}`;
const messages = { incoming: id('51'), own: id('52'), quoted: id('53'), unloaded: id('54'), absent: id('55'), failed: id('56'), deleted: id('57'), local: id('58'), photo: id('59'), shortOwn: id('61'), ownPhoto: id('62'), incomingPhoto: id('63') };
const mira = { id: id('11'), name: 'Mira North', role: 'host', category: 'Music', online: true, verified: true, availableForCall: true, ratePerMin: 0 };
const asha = { ...mira, id: id('12'), name: 'Asha Sen' };
const member = { user: { id: id('01'), name: 'Member', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false, isPhoneVerified: true }, balance: 0, verification: 'none', requiresOnboarding: false };
const at = minutes => new Date(Date.now() - minutes * 60000).toISOString();
const originalText = 'Are you joining my live set tonight?';
const originalReply = () => ({ id: messages.incoming, mine: false, text: originalText, image: false, deleted: false });
const threadRows = () => [
  { id: messages.incoming, mine: false, text: originalText, createdAt: at(8) },
  { id: messages.own, mine: true, text: 'I will be there at nine', createdAt: at(7), status: 'read' },
  { id: messages.quoted, mine: true, text: 'Looking forward to the acoustic session!', reply: originalReply(), createdAt: at(5), status: 'read' },
  { id: messages.unloaded, mine: false, text: 'This one has an earlier reference.', reply: { id: messages.absent, mine: true, text: 'An older message outside this page', image: false, deleted: false }, createdAt: at(3) },
];

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  const screenshots = [];
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: true });
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    // Every account, history row and photo is a local fixture. Never contact a server.
    await page.route(/^https?:\/\//, route => route.abort());
    await page.addInitScript(() => { window.__sent = []; window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) }; });
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href + '?role=sender');
    const receive = (type, data) => page.evaluate(message => Native.receive(message), { type, data });
    const last = type => page.evaluate(value => __sent.filter(message => message.type === value).at(-1)?.data, type);
    const row = messageId => page.locator(`#zc-m-${messageId}`);
    const stack = messageId => row(messageId).locator('.zc-msg-stack');
    const quote = messageId => row(messageId).locator('.zc-quote');
    const action = messageId => row(messageId).locator('.bub[aria-haspopup="dialog"],.zc-photo[aria-haspopup="dialog"]');
    const menu = page.getByRole('dialog', { name: 'Message options' });
    const replyContext = page.locator('.zc-context');
    const input = page.locator('#ti');
    const assertNoReply = async explanation => assert.equal(await replyContext.count(), 0, explanation);
    const assertNoMenu = async explanation => assert.equal(await menu.count(), 0, explanation);
    const selectedReply = () => page.evaluate(() => Chats.reply?.id ?? null);
    const cancelReply = () => page.getByRole('button', { name: 'Cancel reply', exact: true }).click();
    const keyboardOptions = async messageId => {
      await action(messageId).focus();
      await page.keyboard.press('Enter');
      await menu.waitFor({ state: 'visible' });
    };
    const reset = async (rows = threadRows(), extra = {}) => {
      await page.evaluate(()=>Chats.hidden.clear()); // Restore an independent server fixture after prior delete-for-me scenarios.
      await page.evaluate(peer => zcOpen(peer), mira.id);
      await receive('data.thread', { with: mira.id, canSend: true, messages: rows, ...extra });
      await input.waitFor();
      await page.evaluate(() => document.getElementById('app-notice')?.remove());
    };
    const startDrag = async (messageId, dx, dy = 0) => {
      const target = stack(messageId);
      await target.scrollIntoViewIfNeeded();
      const bounds = await target.boundingBox();
      assert.ok(bounds, 'The message has a visible drag surface');
      const inset = Math.min(24, bounds.width / 3);
      const x = bounds.x + (dx < 0 ? bounds.width - inset : inset);
      const y = bounds.y + Math.min(bounds.height / 2, 20);
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx, y + dy, { steps: 8 });
      return { x, y };
    };
    const drag = async (messageId, dx, dy = 0) => {
      await startDrag(messageId, dx, dy);
      await page.mouse.up();
    };
    const saveScreenshot = async name => {
      const file = path.join(os.tmpdir(), name);
      await page.screenshot({ path: file });
      screenshots.push(file);
    };
    const assertSwipeCue = async (messageId, direction) => {
      const metrics = await stack(messageId).evaluate(element => {
        const cue = element.querySelector('.zc-swipe-cue');
        const bubble = element.getBoundingClientRect();
        const bounds = cue.getBoundingClientRect();
        return { opacity: Number(getComputedStyle(cue).opacity), shift: new DOMMatrix(getComputedStyle(element).transform).m41, bubbleLeft: bubble.left, bubbleRight: bubble.right, cueLeft: bounds.left, cueRight: bounds.right, viewport: innerWidth };
      });
      assert.ok(metrics.opacity > 0, 'A reply cue appears while swiping');
      assert.ok(metrics.shift * direction > 0, 'The bubble follows the allowed reply direction');
      assert.ok(direction < 0 ? metrics.cueLeft >= metrics.bubbleRight : metrics.cueRight <= metrics.bubbleLeft, 'The reply cue appears behind the moving bubble');
      assert.ok(metrics.cueLeft >= 0 && metrics.cueRight <= metrics.viewport, 'The reply cue stays within the phone viewport');
    };

    await receive('session', member);
    await receive('data.home', { hosts: [mira, asha], stage: [], featured: mira, total: 2, page: 1, categories: ['Music'], availableCount: 2 });
    await reset();

    // Incoming messages reply on a right swipe; own messages reply on a left swipe.
    assert.match(await stack(messages.incoming).evaluate(element => getComputedStyle(element).touchAction), /(?:^| )pan-y(?: |$)/, 'Message gestures retain native vertical scrolling');
    await input.fill('Keep this draft while choosing a reply');
    await startDrag(messages.incoming, 82);
    await assertSwipeCue(messages.incoming, 1);
    await saveScreenshot('zimi-chat-replies-swipe-390.png');
    await page.mouse.up();
    assert.equal(await selectedReply(), messages.incoming);
    assert.match(await replyContext.innerText(), /Replying to Mira/);
    assert.match(await replyContext.innerText(), /Are you joining my live set tonight\?/);
    await assertNoMenu('Swiping must not open message options on pointer release');
    await cancelReply();
    assert.equal(await input.inputValue(), 'Keep this draft while choosing a reply', 'Cancelling a reply preserves the draft');
    await startDrag(messages.own, -82);
    await assertSwipeCue(messages.own, -1);
    await saveScreenshot('zimi-chat-replies-own-left-swipe-390.png');
    await page.mouse.up();
    assert.equal(await selectedReply(), messages.own);
    assert.match(await replyContext.innerText(), /Replying to yourself/);
    await cancelReply();

    for (const [messageId, dx, label] of [[messages.own, 82, 'Own right swipe'], [messages.incoming, -82, 'Incoming left swipe']]) {
      await drag(messageId, dx);
      await assertNoReply(`${label} cannot select a reply`);
      await assertNoMenu(`${label} cannot open message options`);
    }

    for (const [messageId, direction] of [[messages.incoming, 1], [messages.own, -1]]) {
      await drag(messageId, direction * 63);
      await assertNoReply('A 63 CSS-pixel drag does not reach the reply threshold in either allowed direction');
      await drag(messageId, direction * 72);
      assert.equal(await selectedReply(), messageId, 'A drag past 64 CSS pixels reaches the reply threshold in either allowed direction');
      await cancelReply();
    }

    // Aborted and scrolling gestures never become a reply or an accidental tap menu.
    for (const gesture of [
      { label: 'Short horizontal drag', dx: 35, dy: 0 },
      { label: 'Vertical scroll intent', dx: 18, dy: 80 },
      { label: 'Incoming leftward drag', dx: -35, dy: 0 },
      { label: 'Diagonal scroll intent', dx: 75, dy: 100 },
    ]) {
      await drag(messages.incoming, gesture.dx, gesture.dy);
      await assertNoReply(`${gesture.label} cannot select a reply`);
      await assertNoMenu(`${gesture.label} cannot trigger tap options`);
    }
    // pointercancel is sent by the OS when scrolling/another gesture takes ownership.
    await startDrag(messages.incoming, 82);
    await stack(messages.incoming).dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', isPrimary: true });
    await page.mouse.up();
    await assertNoReply('OS pointer cancellation discards a qualifying drag');
    await assertNoMenu('OS pointer cancellation opens no menu');

    // Real browser touch input checks WebView-style touch-action arbitration.
    const touch = await page.context().newCDPSession(page);
    const touchPoint = async (target, centered = false) => {
      await target.scrollIntoViewIfNeeded();
      const bounds = await target.boundingBox();
      assert.ok(bounds, 'Touch starts on a visible message');
      return { x: bounds.x + (centered ? bounds.width / 2 : Math.min(24, bounds.width / 3)), y: bounds.y + Math.min(20, bounds.height / 2) };
    };
    const touchStart = point => touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    const touchEnd = () => touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const touchDragFrom = async ({ x, y }, dx, dy) => {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 8; step++) {
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * step / 8, y: y + dy * step / 8 }] });
      }
      await touchEnd();
    };
    const touchDrag = async (messageId, dx, dy) => touchDragFrom(await touchPoint(stack(messageId)), dx, dy);
    const touchTap = async target => {
      await touchStart(await touchPoint(target, true));
      await touchEnd();
    };
    const touchHold = async target => {
      await touchStart(await touchPoint(target, true));
      try { await menu.waitFor({ state: 'visible' }); }
      finally { await touchEnd(); }
    };
    for (const [messageId, dx] of [[messages.incoming, 84], [messages.own, -84]]) {
      await touchDrag(messageId, dx, 0);
      assert.equal(await selectedReply(), messageId, 'A real touch swipe selects its incoming or own original message');
      await assertNoMenu('Touch swipe release cannot open message options');
      await cancelReply();
    }
    for (const [messageId, dx, label] of [[messages.own, 84, 'Own right swipe'], [messages.incoming, -84, 'Incoming left swipe']]) {
      await touchDragFrom(await touchPoint(stack(messageId), true), dx, 0);
      await assertNoReply(`${label} cannot select a reply on real touch input`);
      await assertNoMenu(`${label} cannot open options on touch release`);
    }

    await reset([{ id: messages.shortOwn, mine: true, text: 'Hi', createdAt: at(1), status: 'read' }]);
    const edgeStart = await touchPoint(action(messages.shortOwn), true);
    assert.ok(page.viewportSize().width - 8 - edgeStart.x < 64, 'The short own bubble leaves less than 64px of rightward room');
    const edgeTravel = Math.min(84, edgeStart.x - 8);
    assert.ok(edgeTravel >= 64 && edgeStart.x - edgeTravel >= 8, 'The short own bubble has enough leftward room to reply within the screen');
    await touchDragFrom(edgeStart, -edgeTravel, 0);
    assert.equal(await selectedReply(), messages.shortOwn, 'A short own message can be swiped left from its center without leaving the screen');
    await assertNoMenu('An edge-constrained touch swipe cannot open options');
    await cancelReply();

    const longHistory = Array.from({ length: 24 }, (_, index) => ({
      id: id(String(70 + index)), mine: index % 2 === 0,
      text: `History message ${index + 1}: a longer conversation leaves room to scroll naturally.`,
      createdAt: at(30 - index), status: 'read',
    }));
    await reset(longHistory);
    const scrollMessage = longHistory[9].id;
    await page.evaluate(messageId => {
      const list = document.getElementById('tf');
      const message = document.getElementById(`zc-m-${messageId}`);
      list.scrollTop += message.getBoundingClientRect().top - list.getBoundingClientRect().top - list.clientHeight / 2;
    }, scrollMessage);
    const scrollBefore = await page.locator('#tf').evaluate(element => element.scrollTop);
    await touchDrag(scrollMessage, 5, -130);
    await page.waitForFunction(before => document.getElementById('tf').scrollTop > before + 20, scrollBefore);
    await assertNoReply('A real vertical touch scroll cannot select a reply');
    await assertNoMenu('A real vertical touch scroll cannot open message options');
    const imageUrl = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 48; canvas.height = 48;
      const context = canvas.getContext('2d'); context.fillStyle = '#7459ca'; context.fillRect(0, 0, 48, 48);
      return canvas.toDataURL('image/png');
    });
    await reset([
      ...threadRows().slice(0, 2),
      { id: messages.ownPhoto, mine: true, kind: 'image', imageUrl, text: '', createdAt: at(2), status: 'read' },
      { id: messages.incomingPhoto, mine: false, kind: 'image', imageUrl, text: '', createdAt: at(1) },
    ]);
    const ownTextOptions = ['Reply', 'Edit', 'Delete for everyone', 'Delete for me', 'Cancel'];
    const incomingOptions = ['Reply', 'Delete for me', 'Cancel'];
    const messageCases = [
      { id: messages.own, label: 'Own text', options: ownTextOptions },
      { id: messages.incoming, label: 'Incoming text', options: incomingOptions },
      { id: messages.ownPhoto, label: 'Own photo', options: ['Reply', 'Delete for everyone', 'Delete for me', 'Cancel'] },
      { id: messages.incomingPhoto, label: 'Incoming photo', options: incomingOptions },
    ];
    // Text taps leave messages alone; photo taps open their viewer. Holds own options.
    // Tap first so a preceding long press cannot hide a click bug via suppression.
    for (const message of messageCases) {
      await touchTap(action(message.id));
      await assertNoMenu(`${message.label}: a regular touch tap does not open options`);
      await assertNoReply(`${message.label}: a regular touch tap does not select a reply`);
      if ([messages.ownPhoto, messages.incomingPhoto].includes(message.id)) {
        const viewer = page.getByRole('dialog', { name: 'Photo viewer', exact: true });
        await viewer.waitFor();
        await touchTap(viewer.getByRole('button', { name: 'Close photo', exact: true }));
        await viewer.waitFor({ state: 'detached' });
        await action(message.id).focus();
        await page.keyboard.press('Enter');
        await viewer.waitFor();
        await assertNoMenu(`${message.label}: Enter opens the photo viewer without message options`);
        await page.keyboard.press('Escape');
        await viewer.waitFor({ state: 'detached' });
      }
    }
    for (const [messageId, dx] of [[messages.ownPhoto, -84], [messages.incomingPhoto, 84]]) {
      await touchDrag(messageId, dx, 0);
      assert.equal(await selectedReply(), messageId, 'Photo messages use the same ownership-based reply direction as text');
      await assertNoMenu('A photo swipe opens no message options');
      assert.equal(await page.getByRole('dialog', { name: 'Photo viewer', exact: true }).count(), 0, 'A photo reply swipe opens no viewer');
      await cancelReply();
    }
    for (const message of messageCases) {
      await touchHold(action(message.id));
      assert.equal(await page.evaluate(() => Chats.menu), message.id, `${message.label}: the held message owns the options`);
      assert.equal(await page.getByRole('dialog', { name: 'Photo viewer', exact: true }).count(), 0, 'Holding a message opens options without a photo viewer');
      assert.deepEqual(await menu.getByRole('button').allInnerTexts(), message.options, `${message.label}: touch-and-hold respects edit/delete permissions`);
      if (message.id === messages.own) {
        await saveScreenshot('zimi-chat-options-own-touch-390.png');
        await touchTap(menu.getByRole('button', { name: 'Edit', exact: true }));
        assert.equal(await page.evaluate(() => Chats.editing?.id), message.id, 'The next real touch tap can choose Edit after holding');
        assert.equal(await input.inputValue(), 'I will be there at nine');
        await touchTap(page.getByRole('button', { name: 'Cancel editing', exact: true }));
        await touchHold(action(message.id));
      }
      await touchTap(menu.getByRole('button', { name: 'Reply', exact: true }));
      assert.equal(await selectedReply(), message.id, `${message.label}: Reply selects the held message`);
      await assertNoMenu(`${message.label}: the next real touch tap chooses Reply and closes options`);
      await cancelReply();
    }

    // Swiping or holding a quote acts on its enclosing message, while tapping jumps.
    await reset();
    await touchDragFrom(await touchPoint(quote(messages.quoted)), -84, 0);
    assert.equal(await selectedReply(), messages.quoted, 'Swiping a quote replies to the enclosing own message, not the quoted original');
    await assertNoMenu('Swiping a quote opens no options');
    assert.equal(await row(messages.incoming).evaluate(element => element.classList.contains('zc-flash')), false, 'Swiping a quote does not accidentally jump to its original');
    await cancelReply();
    for (const [messageId, options] of [[messages.quoted, ownTextOptions], [messages.unloaded, incomingOptions]]) {
      await touchHold(quote(messageId));
      assert.equal(await page.evaluate(() => Chats.menu), messageId, 'Holding a quote opens options for its enclosing message');
      assert.deepEqual(await menu.getByRole('button').allInnerTexts(), options, 'A quoted message retains its own edit/delete permissions');
      await touchTap(menu.getByRole('button', { name: 'Cancel', exact: true }));
      await assertNoMenu('A real touch tap can cancel options after holding a quote');
    }
    // A fresh rendering prevents a preceding hold's click suppression masking tap.
    await reset();
    await touchTap(quote(messages.quoted));
    assert.ok(await row(messages.incoming).evaluate(element => element.classList.contains('zc-flash')), 'A plain quote touch tap jumps to and highlights the original');
    await assertNoMenu('A plain quote touch tap opens no parent options');
    await assertNoReply('A plain quote touch tap does not start a reply');

    // Quotes have their own keyboard-accessible control outside the options trigger.
    assert.equal(await quote(messages.quoted).evaluate(element => element.tagName), 'BUTTON');
    assert.equal(await quote(messages.quoted).evaluate(element => element.closest('.bub')), null, 'Quotes are not nested inside the message action trigger');
    await quote(messages.quoted).focus();
    await page.keyboard.press('Enter');
    assert.ok(await row(messages.incoming).evaluate(element => element.classList.contains('zc-flash')), 'Enter jumps to and highlights the loaded original');
    await assertNoMenu('Quote navigation cannot bubble into message options');
    await page.waitForFunction(messageId => !document.getElementById(`zc-m-${messageId}`).classList.contains('zc-flash'), messages.incoming);
    await quote(messages.quoted).focus();
    await page.keyboard.press('Space');
    assert.ok(await row(messages.incoming).evaluate(element => element.classList.contains('zc-flash')), 'Space activates the quote button');
    await assertNoMenu('Space on a quote opens no parent message menu');
    await quote(messages.unloaded).click();
    await page.locator('#app-notice').waitFor({ state: 'visible' });
    assert.match(await page.locator('#app-notice').innerText(), /not (?:loaded|available|in the loaded)|earlier|history|unavailable/i, 'An unloaded original gets an honest explanation');
    await assertNoMenu('An unavailable original does not open message options');

    // Both loaded and unloaded originals update existing previews from live events.
    await drag(messages.incoming, 82);
    await receive('chat.updated', { with: mira.id, message: { id: messages.incoming, mine: false, text: 'The live set now starts at ten', edited: true, kind: 'text' } });
    assert.match(await quote(messages.quoted).innerText(), /The live set now starts at ten/);
    assert.match(await replyContext.innerText(), /The live set now starts at ten/, 'A selected original stays current after an edit');
    await receive('chat.updated', { with: mira.id, message: { id: messages.absent, mine: true, text: 'Corrected earlier reference', edited: true, kind: 'text' } });
    assert.match(await quote(messages.unloaded).innerText(), /Corrected earlier reference/, 'An unloaded original can still update its quoted preview');
    await receive('chat.updated', { with: mira.id, message: { id: messages.incoming, mine: false, text: '', deleted: true, kind: 'text' } });
    await assertNoReply('Deleting the selected original clears the reply context');
    assert.match(await quote(messages.quoted).innerText(), /Deleted message/);
    assert.doesNotMatch(await quote(messages.quoted).innerText(), /starts at ten/);
    await receive('chat.updated', { with: mira.id, message: { id: messages.absent, mine: true, text: '', deleted: true, kind: 'text' } });
    assert.match(await quote(messages.unloaded).innerText(), /Deleted message/, 'Deletion scrubs a quote even when its original is not loaded');

    await reset();
    await keyboardOptions(messages.incoming);
    await menu.getByRole('button', { name: 'Delete for me', exact: true }).click();
    await row(messages.incoming).waitFor({ state: 'detached' });
    assert.match(await quote(messages.quoted).innerText(), /Are you joining my live set tonight\?/, 'Delete for me preserves already sent quotation content');

    // Read-only threads and messages without a successful server identity cannot reply.
    await reset(threadRows(), { canSend: false, sendDisabledReason: 'This conversation is read-only.' });
    await drag(messages.incoming, 82);
    await assertNoReply('Read-only permissions apply to swipe replies');
    await assertNoMenu('A disallowed reply swipe must not become an accidental menu tap');
    await keyboardOptions(messages.incoming);
    assert.equal(await menu.getByRole('button', { name: 'Reply', exact: true }).count(), 0);
    await menu.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.evaluate(messageId => zcStartReply(messageId), messages.incoming);
    await assertNoReply('The direct reply handler also enforces thread permission');
    await reset();
    await page.evaluate(ids => {
      S.msgs = [
        { id: ids.local, local: true, mine: true, text: 'Pending server identity', status: 'sent' },
        { id: ids.failed, mine: true, text: 'Failed send', status: 'failed' },
        { id: ids.deleted, mine: false, text: '', deleted: true },
        { mine: false, text: 'No server identity' },
      ];
      paint();
    }, messages);
    for (const messageId of [messages.local, messages.failed, messages.deleted]) {
      await drag(messageId, messageId === messages.deleted ? 82 : -82);
      await assertNoReply('Pending, failed and deleted messages cannot be swiped into a reply');
      assert.equal(await row(messageId).locator('[aria-haspopup="dialog"]').count(), 0, 'Unavailable messages expose no action trigger');
      await page.evaluate(value => zcStartReply(value), messageId);
      await assertNoReply('The reply handler rejects unavailable messages');
    }
    await page.evaluate(() => zcStartReply(undefined));
    await assertNoReply('A missing message identity cannot be replied to');

    // Navigation clears reply state while each conversation keeps its own draft.
    await reset();
    await input.fill('Draft for Mira only');
    await drag(messages.incoming, 82);
    await page.evaluate(() => go('chats'));
    assert.equal(await selectedReply(), null, 'Leaving the thread clears its reply target');
    await page.evaluate(peer => zcOpen(peer), asha.id);
    await receive('data.thread', { with: asha.id, canSend: true, messages: [] });
    await assertNoReply('A new peer cannot inherit the previous conversation reply');
    assert.equal(await input.inputValue(), '', 'A new peer cannot inherit the previous conversation draft');
    await reset();
    assert.equal(await input.inputValue(), 'Draft for Mira only');
    await assertNoReply('Returning to a peer restores the draft without stale reply context');

    // Text sends identify the original; the server's authoritative reply wins.
    await drag(messages.incoming, 82);
    await input.fill('I will bring my guitar');
    await input.press('Enter');
    const replySend=await last('chat.send');assert.ok(replySend.clientId);assert.deepEqual({...replySend,clientId:undefined}, { to: mira.id, text: 'I will bring my guitar', replyTo: messages.incoming,clientId:undefined });
    await assertNoReply('Sending text closes the selected reply');
    await receive('chat.sent', { to: mira.id, sent: 'I will bring my guitar', text: 'I will bring my guitar', id: id('60'), inCall: false, reply: { ...originalReply(), text: 'Server-confirmed preview' } });
    assert.match(await quote(id('60')).innerText(), /Server-confirmed preview/);

    // The photo picker uses the same reply target and keeps its optimistic quote.
    await drag(messages.incoming, 82);
    const photo = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 48; canvas.height = 48;
      const context = canvas.getContext('2d'); context.fillStyle = '#7459ca'; context.fillRect(0, 0, 48, 48);
      return canvas.toDataURL('image/png').split(',')[1];
    }), 'base64');
    const photoChooser = page.waitForEvent('filechooser');
    await page.evaluate(() => zcPickPhoto());
    await (await photoChooser).setFiles({ name: 'reply-fixture.png', mimeType: 'image/png', buffer: photo });
    await page.waitForFunction(() => __sent.some(message => message.type === 'chat.photo'));
    const photoRequest = await last('chat.photo');
    assert.equal(photoRequest.to, mira.id);
    assert.equal(photoRequest.replyTo, messages.incoming, 'Photo sends carry the selected original ID');
    assert.match(photoRequest.photo, /^data:image\/jpeg;base64,/);
    await assertNoReply('Selecting a photo consumes the reply target');
    assert.match(await page.locator('.zc-msg-image').last().locator('.zc-quote').innerText(), /Are you joining my live set tonight\?/);
    await receive('chat.photoSent', { to: mira.id, id: messages.photo, reply: { ...originalReply(), text: 'Authoritative photo reply preview' } });
    assert.match(await quote(messages.photo).innerText(), /Authoritative photo reply preview/, 'Photo acknowledgement retains authoritative reply metadata');

    // Native keyboard avoidance must shrink the WebView. Browser fixtures emulate
    // that resulting viewport; isVisible alone cannot detect a covered composer.
    const assertKeyboardLayout = async (label, hasContext) => {
      const metrics = await page.evaluate(() => {
        const measure = selector => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const box = element.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return { top: box.top, bottom: box.bottom, width: box.width, height: box.height, hittable: !!hit && (hit === element || element.contains(hit)) };
        };
        return { height: innerHeight, focused: document.activeElement.id, header: measure('.zc-thread-header'), composer: measure('.zc-composer'), input: measure('#ti'), send: measure('.zc-composer-send'), context: measure('.zc-context'), cancel: measure('.zc-context>button') };
      });
      for (const name of ['header', 'composer', 'input', 'send', ...(hasContext ? ['context', 'cancel'] : [])]) {
        const box = metrics[name];
        assert.ok(box && box.width > 0 && box.height > 0, `${label}: ${name} has usable geometry`);
        assert.ok(box.top >= -1 && box.bottom <= metrics.height + 1, `${label}: ${name} stays within the keyboard-free viewport (${JSON.stringify(box)})`);
      }
      for (const name of ['input', 'send', ...(hasContext ? ['cancel'] : [])]) assert.equal(metrics[name].hittable, true, `${label}: ${name} is not covered`);
      assert.equal(metrics.focused, 'ti', `${label}: keyboard resizing preserves input focus`);
      if (!hasContext) assert.equal(metrics.context, null, `${label}: ordinary composing has no reply/edit context`);
    };
    for (const { width, keyboardHeight } of [{ width: 390, keyboardHeight: 500 }, { width: 320, keyboardHeight: 420 }]) {
      await page.setViewportSize({ width, height: 844 });
      await reset(threadRows().slice(0, 2));
      await input.fill(`Normal draft at ${width}px`);
      await page.setViewportSize({ width, height: keyboardHeight });
      await assertKeyboardLayout(`${width}px normal composer`, false);
      await input.press('End');
      await input.pressSequentially(' while typing');
      const normalDraft = await input.inputValue();
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await input.inputValue(), normalDraft, 'Closing the keyboard retains the ordinary draft');
      await page.setViewportSize({ width, height: keyboardHeight });
      await assertKeyboardLayout(`${width}px reopened normal composer`, false);

      const replyId = width === 390 ? messages.own : messages.incoming;
      await touchDrag(replyId, replyId === messages.own ? -84 : 84, 0);
      assert.equal(await selectedReply(), replyId, 'Swiping while the keyboard is open selects the intended original');
      assert.equal(await input.inputValue(), normalDraft, 'Choosing a reply with the keyboard open preserves the draft');
      await input.press('End');
      await input.pressSequentially(' with a reply');
      const replyDraft = await input.inputValue();
      for (let cycle = 0; cycle < 2; cycle++) {
        await assertKeyboardLayout(`${width}px reply composer, keyboard cycle ${cycle + 1}`, true);
        await page.setViewportSize({ width, height: 844 });
        assert.equal(await input.inputValue(), replyDraft, 'Closing the keyboard retains the reply draft');
        assert.equal(await selectedReply(), replyId, 'Closing the keyboard retains the reply target');
        await page.setViewportSize({ width, height: keyboardHeight });
        assert.equal(await input.inputValue(), replyDraft, 'Reopening the keyboard retains the reply draft');
      }
      await assertKeyboardLayout(`${width}px reply composer after repeated resize`, true);
      await saveScreenshot(`zimi-chat-keyboard-reply-${width}.png`);
      await cancelReply();
      assert.equal(await input.inputValue(), replyDraft, 'Cancelling the reply above the keyboard preserves the draft');
      await assertKeyboardLayout(`${width}px composer after cancelling reply`, false);

      await page.setViewportSize({ width, height: 844 });
      await keyboardOptions(messages.own);
      await touchTap(menu.getByRole('button', { name: 'Edit', exact: true }));
      assert.equal(await page.evaluate(() => Chats.editing?.id), messages.own);
      await input.fill(`Edited while typing at ${width}px`);
      const editDraft = await input.inputValue();
      for (let cycle = 0; cycle < 2; cycle++) {
        await page.setViewportSize({ width, height: keyboardHeight });
        await assertKeyboardLayout(`${width}px edit composer, keyboard cycle ${cycle + 1}`, true);
        assert.equal(await input.inputValue(), editDraft, 'Reopening the keyboard retains edited text');
        assert.equal(await page.evaluate(() => Chats.editing?.id), messages.own, 'Resizing retains the message being edited');
        await page.setViewportSize({ width, height: 844 });
      }
      await page.getByRole('button', { name: 'Cancel editing', exact: true }).click();
    }
    await touch.detach();

    // Phone-width visual checks include a long quoted message and active composer.
    await reset([
      ...threadRows().slice(0, 2),
      { id: messages.quoted, mine: true, text: 'Yes! I have a few songs in mind.', createdAt: at(1), status: 'read', reply: { ...originalReply(), text: 'Are you joining my live set tonight? Bring a song request and we can play something together.' } },
    ]);
    await input.fill('Looking forward to it!');
    await drag(messages.incoming, 82);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => { const thread = document.getElementById('tf'); thread.scrollTop = thread.scrollHeight; });
      await startDrag(messages.own, -82);
      await assertSwipeCue(messages.own, -1);
      if (width === 320) await saveScreenshot('zimi-chat-replies-own-left-swipe-320.png');
      await page.mouse.up();
      assert.equal(await selectedReply(), messages.own, 'Own left swipe works at both phone widths');
      await startDrag(messages.incoming, 82);
      await assertSwipeCue(messages.incoming, 1);
      await page.mouse.up();
      assert.equal(await selectedReply(), messages.incoming, 'Incoming right swipe works at both phone widths');
      const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth, thread: document.getElementById('tf').clientWidth, threadScroll: document.getElementById('tf').scrollWidth }));
      assert.ok(dimensions.page <= dimensions.viewport + 1, `Reply UI fits the ${width}px viewport`);
      assert.ok(dimensions.threadScroll <= dimensions.thread + 1, `Quotes do not overflow the ${width}px message list (${JSON.stringify(dimensions)})`);
      assert.ok(await page.getByRole('button', { name: 'Cancel reply', exact: true }).isVisible());
      assert.ok(await page.getByRole('button', { name: 'Send message', exact: true }).isVisible());
      await saveScreenshot(`zimi-chat-replies-${width}.png`);
    }
    assert.deepEqual(errors, [], 'Reply interactions must not produce browser errors');
    console.log('PASS chat replies: own-left/incoming-right mouse/touch swipes including short own messages and photos, opposite-direction rejection, cue placement, native touch scroll, cancellation, touch tap/hold permissions, quote swipe/hold/tap, keyboard quote navigation, live edit/delete, navigation, text/photo reply acknowledgement, repeated keyboard viewport resizing, and 390/320px layout.');
    console.log(screenshots.join('\n'));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(os.tmpdir(), 'zimi-chat-replies-failure.png') }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
