/* Android Back is delivered through the native bridge, not browser history.
   All accounts, media and outbound requests in these regressions stay local. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const member = {
  user: { id: '507f1f77bcf86cd799439001', name: 'Test Member', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false, isPhoneVerified: true },
  balance: 1250, verification: 'none', requiresOnboarding: false,
};
const creator = { id: '507f1f77bcf86cd799439011', name: 'Test Creator', role: 'host', category: 'Music', online: true, verified: true, availableForCall: true, ratePerMin: 0, entryFee: 0 };
const host = { ...member, user: { ...member.user, id: creator.id, name: creator.name, role: 'host', serverRole: 'host', hostStatus: 'approved', isVerifiedHost: true }, verification: 'verified' };
const home = { hosts: [creator], stage: [], featured: creator, total: 1, page: 1, categories: ['Music'], availableCount: 1, broadcasterCount: 0, speedMatchEnabled: true, bonus: null, unreadCount: 0 };
const photoUrl = 'https://back.fixture.test/photo.png';
const messages = [
  { id: '507f1f77bcf86cd799439051', mine: true, text: 'Keep this conversation open', status: 'read', createdAt: new Date().toISOString() },
  { id: '507f1f77bcf86cd799439052', mine: false, kind: 'image', text: '', imageUrl: photoUrl, createdAt: new Date().toISOString() },
];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=', 'base64');
const receive = (page, type, data = {}) => page.evaluate(message => Native.receive(message), { type, data });
const back = page => receive(page, 'app.back');
const current = page => page.evaluate(() => S.v);
const sent = (page, type) => page.evaluate(value => __sent.filter(message => message.type === value).map(message => message.data), type);
const navigate = (page, view, id) => page.evaluate(value => go(value.view, value.id), { view, id });

async function open(browser, errors) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(7000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !/^Failed to load resource: net::ERR_/.test(message.text())) errors.push(message.text()); });
  await page.route(/^https?:\/\//, route => route.request().url() === photoUrl ? route.fulfill({ contentType: 'image/png', body: png }) : route.abort());
  await page.addInitScript(() => {
    window.__sent = [];
    window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) };
  });
  await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href);
  await page.evaluate(() => {
    window.__mediaStops = 0;
    window.ZimiMedia.attach = () => {};
    window.ZimiMedia.stop = () => { __mediaStops += 1; };
    window.ZimiMedia.prepare = async () => {};
  });
  return page;
}

async function seed(page, account = member) {
  await receive(page, 'session', account);
  await receive(page, 'data.home', home);
  await receive(page, 'wallet.balance', { coins: 1250, earningsPaise: 0 });
  await receive(page, 'data.chats', { chats: [], page: 1, total: 0, unreadCount: 0, unreadConversations: 0 });
  await receive(page, 'data.calls', { calls: [] });
  await navigate(page, 'home');
}

async function openThread(page) {
  await page.evaluate(id => zcOpen(id), creator.id);
  await receive(page, 'data.thread', { with: creator.id, canSend: true, messages });
  await page.locator('#ti').waitFor();
}

async function navigationChecks(page) {
  await seed(page);
  for (const view of ['profile', 'settings', 'all-creators', 'chats']) {
    await navigate(page, view);
    await back(page);
    assert.equal(await current(page), 'home', `${view} returns Home instead of exiting`);
  }
  for (const origin of ['profile', 'settings']) {
    await navigate(page, origin);
    await page.evaluate(() => zpOpen('identity'));
    await back(page);
    await page.locator('#zp-dialog').waitFor({ state: 'detached' });
    assert.equal(await current(page), origin, 'Back closes settings before leaving its page');
    await page.evaluate(() => ztOpen());
    assert.equal(await current(page), 'themes', 'Appearance is a full page');
    assert.equal(await page.getByRole('dialog').count(), 0, 'Appearance does not leave a settings modal open');
    await back(page);
    assert.equal(await current(page), origin, 'Native Back returns from Appearance to its caller');
    await navigate(page, 'editprofile');
    await back(page);
    assert.equal(await current(page), origin, 'Edit profile returns to the page that opened it');
  }
  await navigate(page, 'chats');
  await navigate(page, 'host', creator.id);
  await back(page);
  assert.equal(await current(page), 'chats', 'Public profile uses its existing origin-aware Back action');
  await navigate(page, 'search');
  await back(page);
  assert.equal(await current(page), 'home');
  await navigate(page, 'wallet');
  await back(page);
  assert.equal(await current(page), 'settings');
  assert.deepEqual(await sent(page, 'app.exit.request'), [], 'No inner page asks Android to exit');
  await navigate(page, 'home');
  await back(page);
  assert.deepEqual(await sent(page, 'app.exit.request'), [{}], 'Only root Back asks the native shell to confirm exit');
}

async function chatChecks(page) {
  await openThread(page);
  await page.evaluate(id => ZimiChatPhoto.open(id), messages[1].id);
  await page.locator('#zc-photo-viewer').waitFor();
  const closesBefore = (await sent(page, 'chat.photoViewer')).filter(message => message.open === false).length;
  await back(page);
  assert.equal(await page.locator('#zc-photo-viewer').count(), 0);
  assert.equal(await current(page), 'thread', 'One Back closes only the photo, not its thread');
  assert.equal((await sent(page, 'chat.photoViewer')).filter(message => message.open === false).length, closesBefore + 1, 'Photo cleanup occurs once');
  assert.equal(await page.locator('main.app').evaluate(element => element.inert), false, 'Closing a photo restores the app interaction surface');
  await page.evaluate(id => homeGifts(id), creator.id);
  await page.evaluate(() => homeGiftTopup());
  await back(page);
  assert.equal(await page.evaluate(() => CoinUI.topup), false, 'Back from top-up returns to gifts');
  assert.equal(await page.evaluate(() => Home.giftTo), creator.id);
  await back(page);
  assert.equal(await page.evaluate(() => Home.giftTo), null);
  assert.equal(await current(page), 'thread', 'Closing gifts preserves the underlying conversation');
  await page.evaluate(id => zcMessageMenu(id), messages[0].id);
  await back(page);
  assert.equal(await page.locator('.zc-message-menu').count(), 0);
  for (const [openMenu, selector] of [['zcThreadMenu', '.zc-thread-menu'], ['zcThreadAttach', '#zc-attach'], ['zcThreadEmoji', '#zc-emoji']]) {
    await page.evaluate(name => window[name](true), openMenu);
    assert.equal(await page.locator(selector).isVisible(), true);
    await back(page);
    assert.equal(await page.locator(selector).isVisible(), false, `${openMenu} closes before navigation`);
    assert.equal(await current(page), 'thread');
  }
  await page.evaluate(id => zcStartReply(id), messages[0].id);
  await back(page);
  assert.equal(await page.evaluate(() => Chats.reply), null, 'Back cancels reply context');
  await page.evaluate(id => zcStartEdit(id), messages[0].id);
  await back(page);
  assert.equal(await page.evaluate(() => Chats.editing), null, 'Back cancels editing context');
  await page.evaluate(() => {
    window.__realVoiceActive = ZimiChatVoice.active;
    window.__realVoiceCancel = ZimiChatVoice.cancel;
    window.__voiceCancelled = 0;
    ZimiChatVoice.active = () => true;
    ZimiChatVoice.cancel = () => { __voiceCancelled += 1; };
  });
  await back(page);
  assert.equal(await current(page), 'thread', 'Back preserves an unfinished voice recording');
  assert.equal(await page.evaluate(() => __voiceCancelled), 0, 'Voice recording is not silently discarded');
  await page.evaluate(() => { ZimiChatVoice.active = __realVoiceActive; ZimiChatVoice.cancel = __realVoiceCancel; });
  await back(page);
  assert.equal(await current(page), 'chats');
  for (const field of ['filtersOpen', 'composeOpen']) {
    await page.evaluate(value => { Chats[value] = true; r(); }, field);
    await back(page);
    assert.equal(await page.evaluate(value => Chats[value], field), false);
    assert.equal(await current(page), 'chats', 'Chat dialog dismissal keeps the Chats tab open');
  }
}

async function mediaChecks(page) {
  await seed(page);
  await navigate(page, 'precall', creator.id);
  await page.evaluate(() => {
    ZimiMedia.prepare = () => new Promise(resolve => { window.__finishPreparation = resolve; });
    homeStartCall(false);
  });
  assert.equal(await page.evaluate(() => Home.preparingCall), true);
  const startsBefore = (await sent(page, 'call.start')).length;
  await back(page);
  assert.equal(await page.evaluate(() => Home.preparingCall), false);
  assert.equal(await current(page), 'precall', 'First Back cancels pending camera preparation');
  await page.evaluate(() => __finishPreparation());
  assert.equal((await sent(page, 'call.start')).length, startsBefore, 'Late camera permission cannot start the cancelled call');
  await back(page);
  assert.equal(await current(page), 'home');

  for (const view of ['call', 'voice', 'hcall']) {
    await seed(page, view === 'hcall' ? host : member);
    await page.evaluate(({ view, peer }) => {
      S.callId = 'test-' + view;
      S.caller = { id: peer, n: 'Test Member', seed: 1, callId: S.callId };
      go(view, peer);
    }, { view, peer: creator.id });
    const endedBefore = (await sent(page, 'call.end')).length;
    // Back keeps the call going behind other screens, like other calling apps.
    await back(page);
    assert.equal(await current(page), 'home', `${view}: Back minimizes the call`);
    assert.equal(await page.evaluate(() => S.bgCall?.view), view);
    assert.equal(await page.locator('#zimi-ongoing').count(), 1, 'Other screens show the ongoing call');
    assert.equal((await sent(page, 'call.end')).length, endedBefore, 'Minimizing never ends the call');
    await back(page);
    assert.equal(await current(page), view, 'Back on Home returns to the call instead of leaving the app');
    assert.equal(await page.locator('#zimi-ongoing').count(), 0);
    // Ending still asks first from the call controls; Back closes that sheet and keeps the call.
    await page.evaluate(() => zrExit());
    assert.equal(await page.evaluate(() => Room.sheet), 'exit', `${view} asks before ending`);
    await back(page);
    assert.equal(await page.evaluate(() => Room.sheet), '');
    assert.equal(await current(page), view, 'Back from the end-call sheet keeps the call active');
    await page.evaluate(() => zrExit());
    await page.locator('.zr-sheet .zr-danger').click();
    assert.equal(await current(page), 'summary');
    assert.equal((await sent(page, 'call.end')).length, endedBefore + 1, 'Only explicit confirmation ends the call');
    await back(page);
    assert.equal(await current(page), 'home');
    assert.equal(await page.evaluate(() => S.callId), null);
  }

  for (const account of [member, host]) {
    await seed(page, account);
    await page.evaluate(() => { go('live'); go('broadcast'); });
    assert.equal(await current(page),'home','Paused streaming routes preserve the current Home screen');
    assert.equal(await page.evaluate(()=>Room.sheet),'','Blocked routes do not leave a room sheet behind');
    assert.equal((await sent(page,'stream.join')).length+(await sent(page,'stream.start')).length,0);
  }

  for (const view of ['dial', 'dialback']) {
    await seed(page, view === 'dialback' ? host : member);
    await page.evaluate(({ view, peer }) => {
      S.caller = { id: peer, n: 'Test Member', seed: 1, callId: 'test-dialback' };
      S.allowPreparedCall = true;
      go(view, peer);
      S.allowPreparedCall = false;
    }, { view, peer: creator.id });
    const endsBefore = (await sent(page, 'call.end')).length;
    // Back minimizes a ringing call too; the bar's red button cancels it where the person is.
    await back(page);
    assert.equal(await current(page), 'home', `${view}: Back minimizes the ringing call`);
    assert.equal((await sent(page, 'call.end')).length, endsBefore, 'The call keeps ringing');
    assert.match(await page.locator('#zimi-ongoing').innerText(), /Calling/);
    await page.locator('#zimi-ongoing .voiceend').click();
    assert.equal(await current(page), 'home');
    assert.equal(await page.locator('#zimi-ongoing').count(), 0);
    assert.equal((await sent(page, 'call.end')).length, endsBefore + 1);
    assert.equal((await sent(page, 'call.end')).at(-1).reason, 'cancelled');
  }

  await seed(page, host);
  await receive(page, 'verify.incoming', { callId: 'local-verification' });
  const verificationEnds = (await sent(page, 'verify.end')).length;
  await back(page);
  assert.equal(await page.locator('#zv-call').count(), 1, 'Back preserves verification and its media until an explicit action');
  assert.equal((await sent(page, 'verify.end')).length, verificationEnds);
  await page.locator('.zv-decline').click();
  assert.equal(await page.locator('#zv-call').count(), 0);
}

async function onboardingChecks(page) {
  await receive(page, 'session.none');
  await page.evaluate(() => { S.auth.busy = false; S.auth.uploading = false; S.auth.step = 'otp'; S.auth.code = '123'; go('login'); });
  await back(page);
  assert.equal(await page.evaluate(() => S.auth.step), 'phone');
  assert.equal(await current(page), 'login');
  await page.evaluate(() => { S.auth.busy = 'auth.otp'; });
  await back(page);
  assert.equal(await current(page), 'login', 'Busy onboarding cannot fall through to an exit request');
  await page.evaluate(() => { S.auth.busy = false; });
  await back(page);
  assert.equal(await current(page), 'welcome');
  const requestsBefore = (await sent(page, 'app.exit.request')).length;
  await back(page);
  assert.equal((await sent(page, 'app.exit.request')).length, requestsBefore + 1);
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  try {
    const page = await open(browser, errors);
    await navigationChecks(page);
    await chatChecks(page);
    await mediaChecks(page);
    await onboardingChecks(page);
    assert.deepEqual(errors, [], 'Back handling has no browser runtime errors');
    console.log('PASS back navigation: native bridge routing, settings and chat overlays, photo cleanup, recording protection, call minimizing and end confirmation, disabled streaming, preparation cancellation and minimized ringing calls, onboarding, and root-only exit requests.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
