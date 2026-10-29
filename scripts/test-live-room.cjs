/* Live-room UI regression contracts. Production data is delivered by a local
   native-bridge stub; browser fake devices never use a real camera/account. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const viewports = [
  { width: 390, height: 844 },
  { width: 390, height: 693 },
  { width: 320, height: 640 },
  { width: 1280, height: 900 },
];
const member = {
  user: { id: '507f1f77bcf86cd799439001', name: 'Test Member', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false, isPhoneVerified: true },
  balance: 1250, verification: 'none', requiresOnboarding: false,
};
const creator = {
  id: '507f1f77bcf86cd799439011', name: 'Test Creator', role: 'host', category: 'Music', tag: 'Acoustic session',
  online: true, verified: true, availableForCall: true, ratePerMin: 0, entryFee: 0,
};
const hostAccount = {
  ...member,
  user: { ...member.user, id: creator.id, name: creator.name, role: 'host', serverRole: 'host', hostStatus: 'approved', isVerifiedHost: true },
  verification: 'verified',
};
const stream = { id: '507f1f77bcf86cd799439021', hostId: creator.id, title: 'Local regression live', category: 'Music', kind: 'video', viewers: 7 };
const hostFixture = { ...creator, stream };
const homeData = { hosts: [hostFixture], stage: [hostFixture], featured: hostFixture, total: 1, page: 1, limit: 20, categories: ['Music'], broadcasterCount: 1, availableCount: 1, speedMatchEnabled: true, bonus: null, unreadCount: 0 };
const queueRequest = { id: '507f1f77bcf86cd799439031', streamId: stream.id, userId: member.user.id, name: member.user.name, avatarUrl: '', status: 'pending', createdAt: new Date().toISOString() };
const rose = { id: '507f1f77bcf86cd799439041', name: 'Test Rose', emoji: '🌹', coins: 10 };

const receive = (page, type, data = {}) => page.evaluate(message => Native.receive(message), { type, data });
const lastSent = (page, type) => page.evaluate(value => window.__sent.filter(message => message.type === value).at(-1)?.data, type);
const sentCount = (page, type) => page.evaluate(value => window.__sent.filter(message => message.type === value).length, type);
const button = (page, name) => page.getByRole('button', { name, exact: true });
const closeSheet = async page => {
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0, 'Escape dismisses the sheet');
};

async function newPage(browser, errors, production = false, query = '', streaming = false) {
  const page = await browser.newPage({ viewport: viewports[0], reducedMotion: 'reduce' });
  page.setDefaultTimeout(7000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !/^Failed to load resource: net::ERR_/.test(message.text())) errors.push(message.text());
  });
  await page.route('https://**/*', route => route.abort());
  await page.addInitScript(enabled => {
    // Browser-only fixture: preserve coverage of dormant streaming code without
    // adding any runtime opt-in to the shipped app.
    if (enabled) Object.defineProperty(window, 'ZIMI_LIVE_STREAMING_ENABLED', { configurable: true, get: () => true, set: () => {} });
    window.__sent = [];
    window.ReactNativeWebView = { postMessage: raw => window.__sent.push(JSON.parse(raw)) };
  }, streaming);
  await page.goto(pathToFileURL(path.join(root, production ? 'assets/aurora.html' : 'dist/index.html')).href + query);
  return page;
}

const newStreamingPage = (browser, errors, production = false, query = '') => newPage(browser, errors, production, query, true);

async function callsOnlyChecks(browser, errors) {
  for (const query of ['?preview=live', '?preview=host-live&role=host&approvedHost=1']) {
    const page = await newPage(browser, errors, false, query);
    assert.equal(await page.evaluate(() => window.ZIMI_LIVE_STREAMING_ENABLED), false);
    assert.equal(await page.locator('.zr-viewer,.zr-host,.zh-broadcast').count(), 0, 'Old preview URLs cannot open streaming screens');
    assert.equal(await page.evaluate(() => ['live', 'broadcast'].includes(S.v)), false);
    assert.equal(await page.locator('.zh-live-shortcut,.zh-person-watch').count(), 0, 'Discovery has no watch-live entry points');
    await page.close();
  }
  for (const hosting of [false, true]) {
    const page = await newPage(browser, errors, true, hosting ? '?role=host' : '?role=sender');
    await receive(page, 'session', hosting ? hostAccount : member);
    await receive(page, 'data.home', homeData);
    await page.evaluate(() => { window.__openedStreams = 0; ZimiMedia.openStream = async () => { window.__openedStreams++; }; });
    const view = await page.evaluate(() => S.v);
    for (const route of ['live', 'broadcast']) {
      await page.evaluate(route => go(route), route);
      assert.equal(await page.evaluate(() => S.v), view, `Direct ${route} navigation is blocked`);
    }
    await page.evaluate(() => { homeGoLive(); homeStartStream(); });
    assert.equal(await sentCount(page, 'stream.start'), 0, 'Even approved hosts cannot start a broadcast');
    await receive(page, 'stream.link.loading', { streamId: stream.id, loading: true });
    await receive(page, 'stream.link', { stream: { ...stream, status: 'live', host: creator } });
    assert.equal(await page.getByRole('dialog', { name: 'Live invitation' }).count(), 0, 'Stale deep-link events cannot open an invitation');
    await page.evaluate(id => homeOpen(id), creator.id);
    assert.equal(await sentCount(page, 'stream.join'), 0, 'Opening a creator never joins the server stream');
    assert.equal(await page.evaluate(() => ['live', 'broadcast'].includes(S.v)), false);
    if (!hosting) assert.equal(await page.evaluate(() => S.v), 'precall', 'Available stream hosts use the ordinary 1:1 setup');
    const currentView = await page.evaluate(() => S.v);
    await receive(page, 'stream.opened', { stream, hosting, messages: [] });
    assert.deepEqual(await lastSent(page, hosting ? 'stream.end' : 'stream.leave'), { streamId: stream.id }, 'Late room acknowledgments are cleaned up');
    assert.equal(await page.evaluate(() => window.__openedStreams), 0, 'Late acknowledgments cannot open streaming media');
    assert.equal(await page.evaluate(() => S.v), currentView);
    assert.equal(await page.locator('.zr-viewer,.zr-host').count(), 0);
    await page.close();
  }
  console.log('PASS calls-only rollout: old previews, direct routes, deep links, discovery, approved host start and late stream acknowledgments');
}

async function layout(page, room, controls, label) {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${label} fits the ${viewport.width}px document`);
    const rect = await room.boundingBox();
    assert.ok(rect && rect.x >= -1 && rect.y >= -1 && rect.x + rect.width <= viewport.width + 1 && rect.y + rect.height <= viewport.height + 1, `${label} fits ${viewport.width}×${viewport.height}`);
    for (const control of controls()) {
      assert.equal(await control.isVisible(), true, `${label} control is visible`);
      const box = await control.boundingBox();
      assert.ok(box && box.x >= rect.x - 1 && box.y >= rect.y - 1 && box.x + box.width <= rect.x + rect.width + 1 && box.y + box.height <= rect.y + rect.height + 1, `${label} control stays inside room at ${viewport.width}×${viewport.height}`);
    }
  }
  await page.setViewportSize(viewports[0]);
}

async function openProductionLive(page, hosting = false, messages = []) {
  await receive(page, 'session', hosting ? hostAccount : member);
  await receive(page, 'data.home', homeData);
  await receive(page, 'wallet.balance', { coins: 1250, earned: 0 });
  if (hosting) await page.evaluate(() => go('broadcast'));
  else await page.evaluate(id => homeOpen(id), creator.id);
  await receive(page, 'stream.opened', { stream, hosting, messages });
  await receive(page, 'stream.requests', { streamId: stream.id, requests: [], ownRequestId: null, count: 0 });
}

async function previewChecks(browser, errors) {
  const viewer = await newStreamingPage(browser, errors, false, '?preview=live');
  await viewer.locator('.zr-viewer').waitFor();
  assert.equal(await viewer.locator('.zr-tag').filter({ hasText: 'HOST' }).count(), 1, 'Only the creator message carries the host label');
  await layout(viewer, viewer.locator('.zr-room'), () => [
    viewer.getByRole('textbox', { name: 'Live chat message' }), viewer.locator('.zr-follow'),
    button(viewer, 'Request'), button(viewer, 'Send a gift'), button(viewer, 'Send heart'), button(viewer, 'Share live'),
  ], 'Viewer live');
  await viewer.screenshot({ path: path.join(root, 'live-preview-viewer.png') });
  const followed = await viewer.evaluate(() => !!S.following[S.h]);
  await viewer.locator('.zr-follow').click();
  assert.equal(await viewer.evaluate(() => !!S.following[S.h]), !followed, 'Follow changes the visible relationship');
  assert.equal((await lastSent(viewer, 'follow.set')).on, !followed);
  const chat = viewer.getByRole('textbox', { name: 'Live chat message' });
  await chat.fill('A preview message from the test');
  await chat.press('Enter');
  assert.match(await viewer.getByRole('log', { name: 'Live chat' }).innerText(), /A preview message from the test/);
  assert.equal(await chat.inputValue(), '');
  await button(viewer, 'Add emoji').click();
  await button(viewer, 'Add ✨').click();
  assert.equal(await chat.inputValue(), '✨');
  await chat.fill('');
  const likes = await viewer.evaluate(() => Room.likes);
  await button(viewer, 'Send heart').click();
  assert.equal(await viewer.evaluate(() => Room.likes), likes + 1);
  await button(viewer, 'Request').click();
  const privateRequest = viewer.getByRole('dialog', { name: 'Your private call' });
  await privateRequest.waitFor();
  assert.match(await privateRequest.innerText(), /Request sent/);
  await button(privateRequest, 'Cancel request').click();
  assert.equal(await viewer.evaluate(() => Room.ownRequestId), null);
  await closeSheet(viewer);
  const balance = await viewer.evaluate(() => S.bal);
  await button(viewer, 'Send a gift').click();
  const gifts = viewer.getByRole('dialog', { name: 'Send a gift' });
  await gifts.locator('.zh-gifts button').filter({ has: viewer.locator('b', { hasText: /^Rose$/ }) }).click();
  await button(gifts, 'Send gift').click();
  assert.equal(await viewer.evaluate(() => S.bal), balance - 99, 'The preview gift updates the preview balance');
  assert.equal(await gifts.count(), 0);
  for (const [control, title] of [['Live viewers', 'Together, live'], ['Share live', 'Good moments are shared'], ['Leave live', 'Leave this live?']]) {
    await button(viewer, control).click();
    await viewer.getByRole('dialog', { name: title, exact: true }).waitFor();
    await closeSheet(viewer);
  }
  await viewer.close();

  const host = await newStreamingPage(browser, errors, false, '?preview=host-live&role=host&approvedHost=1');
  await host.locator('.zr-host').waitFor();
  assert.equal(await host.locator('.zr-video img.zh-photo').count(), 1, 'The host preview has a portrait backdrop');
  await layout(host, host.locator('.zr-room'), () => [
    host.getByRole('textbox', { name: 'Live chat message' }), button(host, 'Accept'),
    button(host, 'Flip'), button(host, 'Mute'), button(host, 'Camera off'), button(host, 'Queue'), button(host, 'Settings'),
  ], 'Host live');
  await host.screenshot({ path: path.join(root, 'live-preview-host.png') });
  await button(host, 'Mute').click();
  assert.equal(await button(host, 'Unmute').getAttribute('aria-pressed'), 'true');
  await button(host, 'Unmute').click();
  await button(host, 'Camera off').click();
  assert.equal(await button(host, 'Camera on').getAttribute('aria-pressed'), 'true');
  await button(host, 'Camera on').click();
  await button(host, 'Flip').click();
  assert.equal(await host.evaluate(() => Room.demoFacing), 'environment');
  await button(host, 'Settings').click();
  await button(host.getByRole('dialog', { name: 'Live studio' }), 'Set a session gift goal').click();
  const goal = host.getByRole('dialog', { name: 'Your session goal' });
  await goal.getByLabel('What are you working toward?', { exact: true }).fill('Our next studio session');
  await goal.getByLabel('Goal in coins', { exact: true }).fill('20000');
  await button(goal, 'Save goal').click();
  assert.match(await button(host, 'Edit session gift goal').innerText(), /Our next studio session/);
  assert.equal(await host.getByRole('progressbar', { name: 'Session gift goal' }).getAttribute('aria-valuenow'), '72');
  await button(host, 'Settings').click();
  await button(host.getByRole('dialog', { name: 'Live studio' }), 'Camera preview appearance').click();
  await button(host.getByRole('dialog', { name: 'Your camera preview' }), 'Warm').click();
  assert.equal(await host.locator('.zr-video').getAttribute('data-effect'), 'warm');
  await closeSheet(host);
  await button(host, 'Session gifts').click();
  assert.match(await host.getByRole('dialog', { name: 'Session supporters' }).innerText(), /Rohan_VIP/);
  await closeSheet(host);
  await button(host, 'Queue').click();
  const queue = host.getByRole('dialog', { name: '1-on-1 call requests' });
  assert.equal(await queue.locator('.zr-queue-row').count(), 2);
  await button(queue, 'Decline Sana').click();
  assert.equal(await queue.locator('.zr-queue-row').count(), 1);
  await button(queue, 'Accept').click();
  await host.getByRole('region', { name: 'Private video call' }).waitFor();
  assert.equal(await host.evaluate(() => S.v), 'hcall', 'Accepting a preview request transitions into the private host call');
  assert.equal(await host.evaluate(() => Home.stream), null);
  assert.match(await host.locator('.zr-call-person').innerText(), /Arjun/);
  await host.close();

  const call = await newPage(browser, errors, false, '?preview=call');
  await call.locator('.zr-call').waitFor();
  await layout(call, call.locator('.zr-room'), () => [
    button(call, 'Leave call'), button(call, 'Call options'), button(call, 'Open call chat'),
    button(call, 'Add coins'), button(call, 'Send a gift'), call.locator('.zr-hangup'),
  ], 'Private video call');
  await call.screenshot({ path: path.join(root, 'live-preview-call.png') });
  // Microphone, camera and sound controls open from the three-dot menu.
  await button(call, 'Call options').click();
  await button(call, 'Mute').click();
  assert.equal(await button(call, 'Unmute').getAttribute('aria-pressed'), 'true');
  await button(call, 'Camera off').click();
  assert.equal(await call.locator('.zr-pip').evaluate(node => node.classList.contains('camera-off')), true);
  await button(call, 'Sound off').click();
  assert.equal(await button(call, 'Sound on').isVisible(), true);
  await closeSheet(call);
  await button(call, 'Open call chat').click();
  const callChat = call.getByRole('textbox', { name: 'Call message' });
  await callChat.fill('Hello from a private call');
  await callChat.press('Enter');
  assert.match(await call.getByRole('log', { name: 'Call chat' }).innerText(), /Hello from a private call/);
  assert.equal((await lastSent(call, 'chat.send')).inCall, true);
  await call.locator('.zr-hangup').click();
  assert.equal(await call.evaluate(() => S.v), 'summary', 'End call leaves the media room');
  assert.equal(await call.locator('.zr-room').count(), 0);
  await call.close();
  console.log('PASS live-room: viewer/host/private-call layouts at 390×844, 390×693, 320×640 and desktop; chat, follow, gifts, hearts, queue, goal, settings and call controls');
}

async function productionChecks(browser, errors) {
  const page = await newStreamingPage(browser, errors, true, '?role=sender');
  await openProductionLive(page);
  await page.locator('.zr-viewer').waitFor();
  assert.equal(await page.locator('.zr-demo-note,.zr-gift-alert,.zr-video img').count(), 0, 'Production has no sample video, activity or gift banner');
  assert.equal(await page.getByRole('log', { name: 'Live chat' }).innerText(), '');
  assert.doesNotMatch(await page.locator('.zr-room').innerText(), /Ananya|Kabir_99|Rohan_VIP|Ishaan|Sana|Arjun/);
  assert.equal((await lastSent(page, 'stream.join')).streamId, stream.id);
  assert.equal((await lastSent(page, 'stream.requests.load')).streamId, stream.id);

  await button(page, 'Follow Test Creator').click();
  assert.deepEqual(await lastSent(page, 'follow.set'), { id: creator.id, on: true });
  const chat = page.getByRole('textbox', { name: 'Live chat message' });
  await chat.fill('Production chat waits for the server');
  await chat.press('Enter');
  assert.deepEqual(await lastSent(page, 'stream.message'), { streamId: stream.id, text: 'Production chat waits for the server' });
  assert.equal(await page.getByRole('log', { name: 'Live chat' }).innerText(), '', 'Live chat waits for its server acknowledgment');
  await receive(page, 'stream.message', { id: 'message-1', streamId: stream.id, userId: member.user.id, name: member.user.name, text: 'Production chat waits for the server' });
  assert.match(await page.getByRole('log', { name: 'Live chat' }).innerText(), /Production chat waits for the server/);
  await chat.fill('An unsent draft');
  await chat.evaluate(input => input.setSelectionRange(3, 7));
  await receive(page, 'stream.viewers', { streamId: stream.id, count: 9 });
  assert.deepEqual(await chat.evaluate(input => ({ value: input.value, start: input.selectionStart, end: input.selectionEnd, focused: input === document.activeElement })), { value: 'An unsent draft', start: 3, end: 7, focused: true }, 'Live refresh preserves the composer and cursor');
  await chat.fill('');
  await button(page, 'Send heart').click();
  assert.deepEqual(await lastSent(page, 'stream.react'), { streamId: stream.id });
  assert.equal(await page.evaluate(() => Room.likes), 0, 'Hearts wait for the server event');
  await receive(page, 'stream.reaction', { id: 'reaction-1', streamId: stream.id, userId: member.user.id, emoji: '❤️' });
  await receive(page, 'stream.reaction', { id: 'reaction-1', streamId: stream.id, userId: member.user.id, emoji: '❤️' });
  assert.equal(await page.evaluate(() => Room.likes), 1, 'The HTTP/socket reaction echo is counted once');

  await button(page, 'Request').click();
  assert.deepEqual(await lastSent(page, 'stream.request'), { streamId: stream.id });
  assert.equal(await page.evaluate(() => Room.ownRequestId), null, 'Queue membership waits for server acknowledgment');
  await receive(page, 'operation.error', { action: 'stream.request', message: 'Queue temporarily unavailable' });
  assert.equal(await button(page, 'Request').isEnabled(), true, 'A failed queue request can be retried');
  await button(page, 'Request').click();
  assert.equal(await sentCount(page, 'stream.request'), 2);
  const ownQueue = { streamId: stream.id, requests: [queueRequest], ownRequestId: queueRequest.id, count: 1 };
  await receive(page, 'stream.requests', ownQueue);
  await button(page, 'Requested').click();
  await page.getByRole('status', { name: 'Loading call requests', exact: true }).waitFor();
  await receive(page, 'stream.requests', ownQueue);
  await button(page.getByRole('dialog', { name: 'Your private call' }), 'Cancel request').click();
  assert.deepEqual(await lastSent(page, 'stream.request.cancel'), { streamId: stream.id, id: queueRequest.id });
  await receive(page, 'stream.requests', { streamId: stream.id, requests: [], ownRequestId: null, count: 0 });
  await closeSheet(page);
  assert.equal(await button(page, 'Request').isVisible(), true);

  await button(page, 'Share live').click();
  const share = page.getByRole('dialog', { name: 'Good moments are shared' });
  await button(share, 'Share this live').click();
  assert.deepEqual(await lastSent(page, 'stream.share'), { streamId: stream.id }, 'Production sharing delegates to the native share action');
  await receive(page, 'stream.shareLink', { streamId: 'other-stream', url: 'binzolive://live/other-stream' });
  assert.equal(await share.getByRole('textbox', { name: 'Live invite link' }).count(), 0, 'Another room cannot replace the share link');
  const inviteUrl = `binzolive://live/${stream.id}`;
  await receive(page, 'stream.shareLink', { streamId: stream.id, url: inviteUrl });
  const link = share.getByRole('textbox', { name: 'Live invite link' });
  assert.equal(await link.inputValue(), inviteUrl);
  assert.equal(await link.getAttribute('readonly'), '');
  await link.click();
  assert.deepEqual(await link.evaluate(input => [input.selectionStart, input.selectionEnd]), [0, inviteUrl.length], 'The returned invitation link is selectable for copying');
  await closeSheet(page);

  await button(page, 'Send a gift').click();
  await page.getByRole('status', { name: 'Loading gifts', exact: true }).waitFor();
  await receive(page, 'data.catalog', { gifts: [rose], packs: [], paymentsAvailable: false });
  const gifts = page.getByRole('dialog', { name: 'Send a gift' });
  await gifts.getByRole('button').filter({ hasText: 'Test Rose' }).click();
  await button(gifts, 'Send gift').click();
  const giftSent = await lastSent(page, 'gift.send');
  assert.equal(giftSent.gift, rose.id); assert.equal(giftSent.to, creator.id); assert.equal(giftSent.coins, 10);
  assert.equal(giftSent.streamId, stream.id); assert.equal(giftSent.inCall, false);
  assert.equal(await page.locator('.zr-gift-alert').count(), 0, 'Gifts do not invent an incoming gift event');
  await receive(page, 'gift.sent', { id: 'gift-1', to: creator.id, gift: rose.id, idempotencyKey: giftSent.idempotencyKey });
  const gift = { id: 'gift-1', streamId: stream.id, senderId: member.user.id, senderName: member.user.name, giftName: rose.name, coins: 10, emoji: rose.emoji };
  await receive(page, 'stream.gift', gift);
  await receive(page, 'stream.gift', gift);
  assert.equal(await page.evaluate(() => Room.received), 10, 'Duplicate gifts are counted once');
  assert.match(await page.locator('.zr-gift-alert').innerText(), /Test Member sent Test Rose/);

  const hostileText = '<img src=x onerror="window.__roomXss=1"> O\'Neil & "friends"';
  await receive(page, 'stream.message', { id: 'message-hostile', streamId: stream.id, userId: creator.id, name: hostileText, text: hostileText });
  assert.ok((await page.getByRole('log', { name: 'Live chat' }).innerText()).includes(hostileText));
  await receive(page, 'stream.gift', { ...gift, id: 'gift-hostile', senderName: hostileText, giftName: hostileText });
  assert.ok((await page.locator('.zr-gift-alert').innerText()).includes(hostileText));
  assert.equal(await page.locator('.zr-room [onerror],.zr-room [onload],.zr-room script').count(), 0);
  assert.equal(await page.evaluate(() => window.__roomXss), undefined, 'Remote chat and gift strings remain text');
  await receive(page, 'stream.message', { id: 'other-message', streamId: 'different-stream', name: 'Wrong room', text: 'Do not show this' });
  assert.doesNotMatch(await page.getByRole('log', { name: 'Live chat' }).innerText(), /Do not show this/);
  await page.close();

  const host = await newStreamingPage(browser, errors, true, '?role=host');
  await openProductionLive(host, true);
  await host.locator('.zr-host').waitFor();
  assert.equal(await host.locator('.zr-demo-note,.zr-gift-alert,.zr-incoming').count(), 0, 'Production host has no fabricated gift or caller');
  const pending = { ...queueRequest, name: hostileText };
  const hostQueue = { streamId: stream.id, requests: [pending], ownRequestId: null, count: 1 };
  await receive(host, 'stream.requests', hostQueue);
  assert.ok((await host.locator('.zr-incoming').innerText()).includes(hostileText));
  assert.equal(await host.locator('.zr-incoming img[onerror]').count(), 0);
  await button(host, 'Queue').click();
  await receive(host, 'stream.requests', hostQueue);
  await button(host.getByRole('dialog', { name: '1-on-1 call requests' }), `Decline ${hostileText}`).click();
  assert.deepEqual(await lastSent(host, 'stream.request.decline'), { streamId: stream.id, id: pending.id });
  await receive(host, 'operation.error', { action: 'stream.request.decline', message: 'Retry this queue update' });
  await host.getByRole('alert').filter({ hasText: 'Retry this queue update' }).waitFor();
  await receive(host, 'stream.requests', hostQueue);
  await closeSheet(host);
  await button(host, 'Accept').click();
  assert.deepEqual(await lastSent(host, 'stream.request.accept'), { streamId: stream.id, id: pending.id });
  assert.equal(await host.evaluate(() => S.v), 'live', 'Accepting waits for the server private-call event');
  assert.equal(await host.evaluate(() => window.__roomXss), undefined, 'Queue names remain escaped text');
  await host.close();
  console.log('PASS live-room: production Native contracts, server-authoritative queue/chat/gifts, failure recovery, reaction/gift deduplication, draft preservation and escaped remote content');
}

async function pendingPrivateCall(browser, errors, hosting, suffix) {
  const page = await newStreamingPage(browser, errors, true, hosting ? '?role=host' : '?role=sender');
  await page.evaluate(() => {
    const prepare = ZimiMedia.prepare;
    // The stream transport is covered by the separate two-party media test.
    // Keep the real private-call listener and media prepare/connected path.
    ZimiMedia.openStream = async () => {};
    window.__prepareRequests = [];
    window.__connectedCalls = [];
    ZimiMedia.prepare = video => {
      window.__prepareRequests.push(video);
      return new Promise((resolve, reject) => {
        window.__allowCapture = () => prepare(video).then(resolve, reject);
        window.__finishLateCapture = resolve;
        window.__denyCapture = () => reject(new Error('Camera permission denied by test'));
      });
    };
    Native.on('call.connected', data => window.__connectedCalls.push(data));
    const post = ReactNativeWebView.postMessage;
    ReactNativeWebView.postMessage = raw => {
      post(raw);
      if (JSON.parse(raw).type === 'rtc.config') queueMicrotask(() => Native.receive({ type: 'rtc.config', data: { iceServers: [] } }));
    };
  });
  await openProductionLive(page, hosting);
  const peer = hosting ? { id: member.user.id, name: member.user.name } : creator;
  const event = { streamId: stream.id, requestId: queueRequest.id, callId: `private-${hosting ? 'host' : 'viewer'}-${suffix}`, peerId: peer.id, peer: { id: peer.id, name: peer.name }, initiator: hosting, voice: false };
  await receive(page, 'stream.privateCall', event);
  const view = hosting ? 'hcall' : 'call';
  assert.equal(await page.evaluate(() => S.v), view, 'The private-call event opens the correct participant UI before capture resolves');
  assert.equal(await page.evaluate(() => Home.stream), null, 'The public stream is cleared before its ended event');
  assert.equal(await page.evaluate(() => Home.hosting), false);
  assert.equal(await page.evaluate(() => S.callId), event.callId);
  assert.match(await page.locator('.zr-call-person').innerText(), new RegExp(peer.name));
  assert.deepEqual(await page.evaluate(() => window.__prepareRequests), [true], 'Private video capture is prepared once');
  assert.equal(await page.evaluate(() => window.__connectedCalls.length), 0, 'Call connection waits for asynchronous media permission');
  await receive(page, 'stream.privateCall', event);
  assert.equal(await page.evaluate(() => window.__prepareRequests.length), 1, 'A duplicate private-call event cannot start another capture');
  await receive(page, 'stream.ended', { streamId: stream.id });
  assert.equal(await page.evaluate(() => S.v), view, 'The old broadcast ended event cannot close the new private call');
  assert.equal(await sentCount(page, 'stream.end'), 0, 'A private transition does not redundantly end the accepted broadcast');
  assert.equal(await sentCount(page, 'stream.leave'), 0);
  return { page, event, peer, view };
}

async function privateCallChecks(browser, errors) {
  for (const hosting of [false, true]) {
    const accepted = await pendingPrivateCall(browser, errors, hosting, 'accepted');
    const { page, event, peer, view } = accepted;
    await page.evaluate(() => window.__allowCapture());
    await page.waitForFunction(() => window.__connectedCalls.length === 1);
    assert.equal(await page.evaluate(() => S.v), view);
    assert.deepEqual(await page.evaluate(() => window.__connectedCalls[0]), event, 'The accepted call metadata reaches the media connection');
    assert.equal(await sentCount(page, 'call.end'), 0, 'Successful permission does not terminate the call');
    await receive(page, 'stream.privateCall', event);
    assert.equal(await page.evaluate(() => window.__prepareRequests.length), 1);
    assert.equal(await page.evaluate(() => window.__connectedCalls.length), 1, 'The accepted call initializes once despite replay');
    await receive(page, 'stream.link', { stream: { ...stream, id: 'another-live', status: 'live', host: creator } });
    const invitation = page.getByRole('dialog', { name: 'Live invitation' });
    assert.equal(await button(invitation, 'Join live').isDisabled(), true, 'An invitation cannot interrupt a private call');
    await button(invitation, 'Dismiss invitation').click();
    assert.equal(await page.evaluate(() => S.v), view);
    const text = `${hosting ? 'Host' : 'Viewer'} receives a direct peer message`;
    await receive(page, 'chat.message', { id: `call-chat-${view}`, from: peer.id, name: peer.name, text });
    assert.match(await page.getByRole('log', { name: 'Call chat' }).innerText(), new RegExp(text), 'A matching peer message appears without an inCall flag');
    await receive(page, 'chat.message', { id: `other-chat-${view}`, from: '507f1f77bcf86cd799439099', name: 'Other account', text: 'Unrelated peer message must stay private', inCall: true });
    assert.doesNotMatch(await page.getByRole('log', { name: 'Call chat' }).innerText(), /Unrelated peer message must stay private/, 'Another conversation cannot leak into the call feed');
    if (!hosting) {
      // The same peer-routing contract also applies to the voice-call view.
      await page.evaluate(() => go('voice', S.h));
      await page.getByRole('region', { name: 'Private voice call', exact: true }).waitFor();
      await receive(page, 'chat.message', { id: 'voice-chat', from: peer.id, name: peer.name, text: 'A matching voice-call message' });
      assert.match(await page.getByRole('log', { name: 'Call chat' }).innerText(), /A matching voice-call message/);
      await receive(page, 'chat.message', { id: 'voice-other', from: '507f1f77bcf86cd799439099', name: 'Other account', text: 'Not part of this voice call', inCall: true });
      assert.doesNotMatch(await page.getByRole('log', { name: 'Call chat' }).innerText(), /Not part of this voice call/);
    }
    await page.locator('.zr-hangup').click();
    assert.equal((await lastSent(page, 'call.end')).callId, event.callId);
    await page.close();

    const rejected = await pendingPrivateCall(browser, errors, hosting, 'denied');
    await rejected.page.evaluate(() => window.__denyCapture());
    await rejected.page.waitForFunction(() => S.v === 'summary');
    assert.deepEqual(await lastSent(rejected.page, 'call.end'), { callId: rejected.event.callId, reason: 'media_failed' }, 'Denied camera permission ends the pending server call');
    assert.equal(await sentCount(rejected.page, 'call.end'), 1, 'Permission rejection ends the call once');
    assert.equal(await rejected.page.evaluate(() => window.__connectedCalls.length), 0);
    assert.equal(await rejected.page.locator('.zr-room').count(), 0);
    assert.match(await rejected.page.locator('#app-notice').innerText(), /Camera permission denied/);
    await rejected.page.close();

    const cancelled = await pendingPrivateCall(browser, errors, hosting, 'cancelled');
    await cancelled.page.locator('.zr-hangup').click();
    assert.equal(await cancelled.page.evaluate(() => S.v), 'summary');
    assert.equal((await lastSent(cancelled.page, 'call.end')).callId, cancelled.event.callId);
    await cancelled.page.evaluate(() => window.__finishLateCapture());
    assert.equal(await cancelled.page.evaluate(() => S.v), 'summary', 'A late permission result cannot reopen a cancelled private call');
    assert.equal(await cancelled.page.evaluate(() => window.__connectedCalls.length), 0);
    assert.equal(await cancelled.page.locator('.zr-room').count(), 0);
    assert.equal(await sentCount(cancelled.page, 'call.end'), 1, 'Cancellation is sent once even when preparation resolves later');
    await cancelled.page.close();
  }
  console.log('PASS live-room: both private-call roles, deferred capture, event ordering/replay, permission denial, cancelled preparation, and peer-isolated video/voice chat');
}

async function invitationChecks(browser, errors) {
  const page = await newStreamingPage(browser, errors, true, '?role=sender');
  await receive(page, 'session', member);
  await receive(page, 'data.home', homeData);
  const invitation = page.getByRole('dialog', { name: 'Live invitation' });
  await receive(page, 'stream.link.loading', { streamId: stream.id, loading: true });
  await invitation.getByRole('status', { name: 'Loading live invitation', exact: true }).waitFor();
  assert.equal(await button(invitation, 'Join live').count(), 0, 'The invitation waits for server stream details');
  await receive(page, 'stream.link', { stream: { ...stream, status: 'ended', host: creator } });
  assert.equal(await button(invitation, 'Join live').isDisabled(), true, 'An ended live cannot be joined');
  assert.match(await invitation.innerText(), /This live session has ended/);
  await closeSheet(page);

  const attack = '<img src=x onerror="window.__inviteXss=1"> & O\'Neil';
  await receive(page, 'stream.link', { stream: { ...stream, status: 'live', title: attack, host: { ...creator, name: attack } } });
  assert.ok((await invitation.innerText()).includes(attack), 'Invitation details render as escaped text');
  assert.equal(await invitation.locator('[onerror],script,img').count(), 0);
  assert.equal(await page.evaluate(() => window.__inviteXss), undefined);
  assert.equal(await sentCount(page, 'stream.join'), 0, 'Opening an invitation does not automatically join');
  await button(invitation, 'Dismiss invitation').click();
  assert.equal(await invitation.count(), 0);

  await receive(page, 'stream.link', { stream: { ...stream, status: 'live', host: creator } });
  assert.equal(await button(invitation, 'Join live').isEnabled(), true);
  await button(invitation, 'Join live').click();
  assert.deepEqual(await lastSent(page, 'stream.join'), { streamId: stream.id }, 'Explicit Join live uses the authenticated stream join');
  assert.equal(await page.evaluate(() => S.v), 'live');
  assert.equal(await invitation.count(), 0);
  const joinCount = await sentCount(page, 'stream.join');
  await receive(page, 'stream.link', { stream: { ...stream, id: 'another-live', status: 'live', host: creator } });
  assert.equal(await button(invitation, 'Join live').isDisabled(), true, 'An invitation cannot replace an active live room');
  assert.match(await invitation.innerText(), /Finish your current session/);
  assert.equal(await sentCount(page, 'stream.join'), joinCount);
  assert.equal(await sentCount(page, 'stream.leave'), 0);
  await receive(page, 'session.expired', {});
  assert.equal(await invitation.count(), 0, 'Signing out removes pending invitation details');
  await page.close();
  console.log('PASS live-room: native sharing, selectable invitation URL, deep-link loading/confirmation, ended/busy guards, escaped invitation details and session cleanup');
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
  });
  const errors = [];
  try {
    await callsOnlyChecks(browser, errors);
    if (!process.argv.includes('--production')) await previewChecks(browser, errors);
    if (!process.argv.includes('--preview')) {
      await productionChecks(browser, errors);
      await privateCallChecks(browser, errors);
      await invitationChecks(browser, errors);
    }
    assert.deepEqual(errors, [], 'Live-room flows render without browser errors');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
