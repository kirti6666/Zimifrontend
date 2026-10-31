/* Production UI, with only the native API edge mocked. Never contacts a host,
   captures a real camera or opens a payment provider. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(os.tmpdir(), 'binzo-call-invitation-checks');
const memberId = '507f1f77bcf86cd799439011', hostId = '507f1f77bcf86cd799439017';
const invitationId = '607f1f77bcf86cd799439019', callId = '707f1f77bcf86cd799439019';
const account = { user: { id: memberId, name: 'QA Member', role: 'sender', serverRole: 'user', hostStatus: 'none', isPhoneVerified: true, adultConfirmed: true }, verification: 'none', requiresOnboarding: false };
const host = { id: hostId, name: 'QA Available Host', avatarUrl: '', city: 'Pune' };
const offer = (extra = {}) => ({ id: invitationId, source: 'automatic', label: 'Automatic call invitation', host, kind: 'video', coinsPerMinute: 60, entryFeeCoins: 10, requiredCoins: 70, affordable: true, expiresAt: new Date(Date.now() + 600000).toISOString(), status: 'pending', ...extra });
const checks = [];
const note = name => { checks.push(name); console.log(`PASS ${name}`); };
async function open(browser, coins = 200, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(8000); page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).protocol === 'file:' ? route.continue() : route.abort());
  await page.addInitScript(() => { window.__sent = []; window.ReactNativeWebView = { postMessage: raw => window.__sent.push(JSON.parse(raw)) }; });
  await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href);
  const receive = (type, data = {}) => page.evaluate(message => Native.receive(message), { type, data });
  const sent = type => page.evaluate(type => __sent.filter(message => message.type === type).map(message => message.data), type);
  await receive('session', account);
  await receive('data.home', { hosts: [], stage: [], total: 0, page: 1, categories: [], unreadCount: 0 });
  await receive('wallet.balance', { coins, earningsPaise: 0 });
  await receive('realtime.status', { connected: true });
  await page.waitForFunction(() => !!window.ZimiCallInvitations);
  return { context, page, errors, receive, sent };
}
async function load(f, invitation = offer()) {
  await f.page.evaluate(() => ZimiCallInvitations.request());
  await f.page.waitForFunction(() => __sent.some(message => message.type === 'call.invitation.load'));
  const request = (await f.sent('call.invitation.load')).at(-1);
  await f.receive('call.invitation.loaded', { invitation, requestId: request.requestId });
  return request;
}
async function visible(f) { await f.page.locator('#zci-invitation[open]').waitFor(); }
async function clean(f) {
  assert.deepEqual(f.errors, []);
  const storage = await f.page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, url: location.href }));
  assert.doesNotMatch(storage, new RegExp(`${invitationId}|${callId}|${hostId}|accessToken|refreshToken`));
  await f.context.close();
}
async function noConnection(f) {
  assert.equal((await f.sent('call.start')).length, 0);
  assert.equal((await f.sent('call.accept')).length, 0);
  assert.equal((await f.sent('call.invitation.connect')).length, 0);
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  try {
    // An automated suggestion never claims that a host personally placed a call.
    {
      const f = await open(browser);
      await load(f); await visible(f);
      const text = await f.page.locator('#zci-invitation').innerText();
      assert.match(text, /Automatic call invitation/);
      assert.match(text, /QA Available Host/);
      assert.doesNotMatch(text, /Incoming (video|voice) call|is calling you/i);
      assert.match(text, /60/); assert.match(text, /10/);
      assert.equal(await f.page.evaluate(() => S.v), 'home');
      assert.equal(await f.page.locator('.ringscr').count(), 0);
      await noConnection(f);
      await f.page.getByRole('button', { name: 'Not now', exact: true }).click();
      assert.equal((await f.sent('call.invitation.dismiss')).length, 1);
      const dismiss = (await f.sent('call.invitation.dismiss')).at(-1);
      assert.equal(dismiss.id, invitationId);
      await f.receive('call.invitation.dismissed', { id: invitationId, requestId: dismiss.requestId });
      assert.equal(await f.page.locator('#zci-invitation[open]').count(), 0);
      await noConnection(f); await clean(f);
      note('automatic invitation is disclosed, priced, dismissible and never impersonates an incoming host call');
    }
    // Real conversation/call screens take precedence over the app-open suggestion.
    {
      const f = await open(browser);
      await f.page.evaluate(id => go('thread', id), hostId);
      const before = (await f.sent('call.invitation.load')).length;
      await f.page.evaluate(() => ZimiCallInvitations.request());
      assert.equal((await f.sent('call.invitation.load')).length, before);
      assert.equal(await f.page.locator('#zci-invitation[open]').count(), 0);
      await f.page.evaluate(() => go('home'));
      await load(f); await visible(f);
      await f.receive('call.incoming', { callId, from: host, fromHost: true, voice: false, rate: 60 });
      assert.equal(await f.page.evaluate(() => S.v), 'incoming');
      assert.equal(await f.page.locator('#zci-invitation[open]').count(), 0);
      assert.equal((await f.sent('call.decline')).length, 0);
      await clean(f); note('chat suppresses suggestions and a real incoming call preempts the suggestion');
    }
    // Buying coins is never permission to start or answer a paid call.
    {
      const f = await open(browser, 0);
      await load(f, offer({ affordable: false })); await visible(f);
      await f.page.locator('#zci-invitation').getByRole('button', { name: 'Add coins', exact: true }).click();
      await f.page.getByRole('dialog', { name: 'Recharge to continue', exact: true }).getByRole('button', { name: 'Recharge', exact: true }).click();
      assert.equal(await f.page.evaluate(() => S.v), 'coins');
      await noConnection(f);
      await f.receive('wallet.balance', { coins: 200, earningsPaise: 0 });
      await f.receive('wallet.purchase', { merchantOrderId: 'fixture-payment-only', status: 'SUCCESS', coins: 200 });
      await noConnection(f);
      await f.page.getByRole('button', { name: 'Review invitation', exact: true }).click();
      const request = (await f.sent('call.invitation.load')).at(-1);
      assert.equal(request.active, true);
      await f.receive('call.invitation.loaded', { invitation: offer(), requestId: request.requestId });
      await visible(f);
      await f.page.locator('#zci-invitation').getByRole('button', { name: 'Connect', exact: true }).click();
      await f.page.waitForFunction(() => __sent.some(message => message.type === 'call.invitation.connect'));
      const connect = (await f.sent('call.invitation.connect')).at(-1);
      assert.equal(connect.id, invitationId);
      assert.equal(connect.expectedCoinsPerMinute, 60, 'Connect must bind the rate the member actually reviewed');
      assert.equal(connect.expectedEntryFeeCoins, 10, 'A refreshed quote on another device cannot authorize a different entry fee');
      assert.equal((await f.sent('call.start')).length, 0, 'An automatic offer must use the server-bound invitation endpoint');
      assert.equal((await f.sent('call.accept')).length, 0);
      await clean(f); note('coin purchase preserves the invitation but only explicit review and Connect can start a real call');
    }
    // A changed quote cannot escape into the ordinary call-start path on retry.
    {
      const f = await open(browser);
      await load(f); await visible(f);
      await f.page.locator('#zci-invitation').getByRole('button', { name: 'Connect', exact: true }).click();
      await f.page.waitForFunction(() => __sent.some(message => message.type === 'call.invitation.connect'));
      const first = (await f.sent('call.invitation.connect')).at(-1);
      await f.receive('call.failed', { invitationId, requestId: first.requestId, code: 'CALL_PRICE_CHANGED', message: 'The call price changed. Review the current price.' });
      let request = (await f.sent('call.invitation.load')).at(-1);
      const revised = offer({ coinsPerMinute: 90, requiredCoins: 100 });
      await f.receive('call.invitation.loaded', { invitation: revised, requestId: request.requestId });
      assert.equal((await f.sent('call.start')).length, 0);
      await f.page.getByRole('button', { name: 'Review automatic invitation', exact: true }).click();
      request = (await f.sent('call.invitation.load')).at(-1);
      await f.receive('call.invitation.loaded', { invitation: revised, requestId: request.requestId });
      await visible(f);
      assert.match(await f.page.locator('#zci-invitation').innerText(), /90 coins\/min/);
      assert.equal((await f.sent('call.invitation.connect')).length, 1, 'Reading a new quote cannot auto-connect');
      await f.page.locator('#zci-invitation').getByRole('button', { name: 'Connect', exact: true }).click();
      await f.page.waitForFunction(() => __sent.filter(message => message.type === 'call.invitation.connect').length === 2);
      const retry = (await f.sent('call.invitation.connect')).at(-1);
      assert.equal(retry.id, invitationId); assert.equal(retry.expectedCoinsPerMinute, 90); assert.equal(retry.expectedEntryFeeCoins, 10);
      assert.equal((await f.sent('call.start')).length, 0);
      await clean(f); note('price changes require explicit new quote consent and retain the dedicated invitation path');
    }
    // A failed hold cannot silently drop a host call or pretend it was reserved.
    {
      const f = await open(browser, 0);
      await f.page.evaluate(() => go('chats'));
      await f.receive('call.incoming', { callId, from: host, fromHost: true, voice: true, rate: 60 });
      await f.page.getByRole('button', { name: 'Add coins', exact: true }).click();
      const request = (await f.sent('call.topup.hold')).at(-1);
      assert.equal(request.callId, callId);
      assert.equal(await f.page.evaluate(() => S.v), 'incoming', 'Wait for server acknowledgement before entering checkout');
      await f.receive('call.topup.error', { callId, requestId: request.requestId, message: 'This host ended the call.' });
      assert.equal((await f.sent('call.decline')).length, 0);
      assert.equal((await f.sent('call.accept')).length, 0);
      assert.equal(await f.page.evaluate(() => S.v), 'incoming');
      await clean(f); note('genuine host top-up waits for server hold acknowledgement and does not decline on failure');
    }
    // An obsolete camera-permission continuation cannot clear a newer real hold.
    {
      const f = await open(browser);
      await load(f); await visible(f);
      await f.page.evaluate(() => { ZimiMedia.prepare = () => new Promise(resolve => { window.__finishOldPrepare = resolve; }); });
      await f.page.locator('#zci-invitation').getByRole('button', { name: 'Connect', exact: true }).click();
      await f.page.waitForFunction(() => typeof window.__finishOldPrepare === 'function');
      await f.receive('wallet.balance', { coins: 0 });
      await f.receive('call.incoming', { callId, from: host, fromHost: true, voice: true, rate: 60 });
      assert.equal(await f.page.evaluate(() => S.v), 'incoming');
      await f.page.getByRole('button', { name: 'Add coins', exact: true }).click();
      const request = (await f.sent('call.topup.hold')).at(-1);
      assert.equal(request.callId, callId);
      await f.page.evaluate(() => window.__finishOldPrepare());
      await f.page.waitForFunction(() => CallInvitations.busy === 'hold');
      await f.receive('call.topup.held', { callId, requestId: request.requestId, until: new Date(Date.now() + 300000).toISOString() });
      assert.equal(await f.page.evaluate(() => S.v), 'coins');
      assert.equal((await f.sent('call.invitation.connect')).length, 0);
      assert.equal((await f.sent('call.start')).length, 0);
      assert.equal((await f.sent('call.decline')).length, 0);
      await clean(f); note('late automatic camera preparation cannot cancel or corrupt the newer genuine call checkout hold');
    }
    // Hold acknowledgements and realtime repeats must not interrupt checkout.
    {
      const f = await open(browser, 0);
      await f.receive('call.incoming', { callId, from: host, fromHost: true, voice: false, rate: 60 });
      await f.page.getByRole('button', { name: 'Add coins', exact: true }).click();
      const request = (await f.sent('call.topup.hold')).at(-1), until = new Date(Date.now() + 300000).toISOString();
      await f.receive('call.topup.held', { callId, requestId: request.requestId, until });
      assert.equal(await f.page.evaluate(() => S.v), 'coins');
      await f.receive('call.incoming', { callId, from: host, fromHost: true, voice: false, rate: 60, waitingForTopup: true, topupHoldUntil: until });
      await f.receive('call.topup.waiting', { callId, until });
      assert.equal(await f.page.evaluate(() => S.v), 'coins');
      await f.receive('wallet.balance', { coins: 200, earningsPaise: 0 });
      await f.receive('wallet.purchase', { merchantOrderId: 'fixture-topup-only', status: 'SUCCESS', coins: 200 });
      assert.equal((await f.sent('call.accept')).length, 0);
      assert.equal((await f.sent('call.decline')).length, 0);
      await f.page.getByRole('button', { name: 'Return to incoming call', exact: true }).click();
      const review = (await f.sent('call.topup.review')).at(-1);
      assert.equal(review.callId, callId);
      await f.receive('call.topup.reviewed', { callId, requestId: review.requestId, ringing: true, rate: 60 });
      assert.equal(await f.page.evaluate(() => S.v), 'incoming');
      await f.page.getByRole('button', { name: 'Accept', exact: true }).click();
      await f.page.waitForFunction(() => __sent.some(message => message.type === 'call.accept'));
      assert.equal((await f.sent('call.accept')).at(-1).callId, callId);
      await clean(f); note('bounded host hold survives checkout updates and requires a separate explicit Accept after funding');
    }
    // A host can cancel during checkout, regardless of a later successful top-up.
    {
      const f = await open(browser, 0);
      await f.receive('call.incoming', { callId, from: host, fromHost: true, voice: true, rate: 60 });
      await f.page.getByRole('button', { name: 'Add coins', exact: true }).click();
      const request = (await f.sent('call.topup.hold')).at(-1);
      await f.receive('call.topup.held', { callId, requestId: request.requestId, until: new Date(Date.now() + 300000).toISOString() });
      await f.receive('call.ended', { callId });
      await f.receive('wallet.balance', { coins: 200 });
      await f.receive('realtime.status', { connected: true });
      await f.receive('wallet.purchase', { merchantOrderId: 'fixture-late-payment', status: 'SUCCESS', coins: 200 });
      assert.equal((await f.sent('call.accept')).length, 0);
      assert.equal((await f.sent('call.start')).length, 0);
      assert.equal(await f.page.getByRole('button', { name: 'Return to incoming call', exact: true }).count(), 0);
      assert.equal(await f.page.evaluate(() => S.memberRing), null);
      await clean(f); note('host cancellation during checkout wins over all late wallet/payment callbacks');
    }
    // A late response from the previous signed-in account has no call authority.
    {
      const f = await open(browser, 0);
      await f.receive('call.incoming', { callId, from: host, fromHost: true, voice: true, rate: 60 });
      await f.page.getByRole('button', { name: 'Add coins', exact: true }).click();
      const hold = (await f.sent('call.topup.hold')).at(-1);
      await f.receive('session.none');
      await f.receive('session', { ...account, user: { ...account.user, id: '507f1f77bcf86cd799439012', name: 'Another member' } });
      await f.receive('data.home', { hosts: [], stage: [], total: 0, page: 1, categories: [], unreadCount: 0 });
      await f.receive('wallet.balance', { coins: 200 });
      await f.receive('call.topup.held', { callId, requestId: hold.requestId, until: new Date(Date.now() + 300000).toISOString() });
      assert.notEqual(await f.page.evaluate(() => S.v), 'coins');
      assert.equal(await f.page.evaluate(() => CallInvitations.topup), null);
      assert.equal((await f.sent('call.accept')).length, 0);
      await clean(f); note('account changes reject late checkout hold acknowledgements from the previous account');
    }
    // Expiry retires the offered action even while Home receives no other events.
    {
      const f = await open(browser);
      await load(f, offer({ expiresAt: new Date(Date.now() + 600).toISOString() })); await visible(f);
      await f.page.locator('#zci-invitation[open]').waitFor({ state: 'detached' });
      await noConnection(f);
      await clean(f); note('an expired idle invitation cannot leave a stale Connect action onscreen');
    }
    // Layout and text escaping use the actual compiled UI in both palettes.
    for (const width of [320, 390]) {
      const f = await open(browser, 0, { width, height: 844 });
      if (width === 320) await f.page.evaluate(() => ZimiThemes.setDark(true));
      await load(f, offer({ affordable: false, host: { ...host, name: 'QA <b>Host</b>' } })); await visible(f);
      assert.equal(await f.page.locator('#zci-invitation b').filter({ hasText: 'Host' }).count(), 0);
      assert.match(await f.page.locator('#zci-invitation').innerText(), /QA <b>Host<\/b>/);
      const fits = await f.page.evaluate(() => ({ page: document.documentElement.scrollWidth <= innerWidth + 1, dialog: document.querySelector('#zci-invitation').scrollWidth <= document.querySelector('#zci-invitation').clientWidth + 1 }));
      assert.deepEqual(fits, { page: true, dialog: true });
      await f.page.screenshot({ path: path.join(output, `automatic-invitation-${width}.png`) });
      await noConnection(f); await clean(f);
    }
    note('automatic disclosure, escaped profile names and reachable coin/decline controls fit320/390 light/dark');
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ passed: true, checks, realNetworkRequests: 0 }, null, 2));
    console.log(`Artifacts: ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
