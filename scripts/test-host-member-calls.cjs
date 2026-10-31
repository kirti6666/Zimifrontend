/* Hosts call members at any time, and members answer: no permission switch on a host
   profile, Follow back, host Voice/Video buttons, the member's ring screen and
   host-to-anyone messaging. All bridge traffic stays local. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const hostId = '507f1f77bcf86cd799439017', memberId = '507f1f77bcf86cd799439011', otherHostId = '507f1f77bcf86cd799439018';
const member = { user: { id: memberId, name: 'Riya Sharma', role: 'sender', serverRole: 'user', hostStatus: 'none', isPhoneVerified: true, city: 'Pune' }, verification: 'none', requiresOnboarding: false };
const host = { user: { id: hostId, name: 'Ananya Iyer', role: 'host', serverRole: 'host', hostStatus: 'approved', isVerifiedHost: true, isPhoneVerified: true }, verification: 'verified', requiresOnboarding: false };
const hostProfile = { id: hostId, name: 'Ananya Iyer', serverRole: 'host', role: 'host', verified: true, followers: 12, following: false, followingCount: 3, joined: '2026-01-01T00:00:00Z', languages: [], interests: [], online: true, availableForCall: true, ratePerMin: 60, allowsVideoCalls: false, followsYou: false };
const memberProfile = { id: memberId, name: 'Riya Sharma', serverRole: 'user', role: 'sender', verified: false, followers: 0, following: false, followingCount: 4, joined: '2026-02-01T00:00:00Z', languages: [], interests: [], followsYou: true, canVoiceCall: false, canVideoCall: false };

async function open(browser, account) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**/*', route => route.abort());
  await page.addInitScript(() => { window.__sent = []; window.ReactNativeWebView = { postMessage: raw => window.__sent.push(JSON.parse(raw)) }; });
  await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href);
  const receive = (type, data = {}) => page.evaluate(message => Native.receive(message), { type, data });
  const sent = type => page.evaluate(type => __sent.filter(message => message.type === type).map(message => message.data), type);
  await receive('session', account);
  await receive('data.home', { hosts: [], stage: [], total: 0, page: 1, categories: [], unreadCount: 0 });
  return { page, errors, receive, sent };
}
async function openProfile({ page, receive, sent }, id, profile) {
  await page.evaluate(id => go('host', id), id);
  const request = (await sent('profile.load')).at(-1);
  assert.equal(request.id, id);
  await receive('data.publicProfile', { ...request, profile });
}
const view = page => page.evaluate(() => S.v);
const notice = page => page.locator('#app-notice').innerText();

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  try {
    // A host's profile has no video-call permission switch: hosts may call members at any time.
    const m = await open(browser, member);
    await m.receive('wallet.balance', { coins: 30, earningsPaise: 0 });
    await openProfile(m, hostId, hostProfile);
    assert.equal(await m.page.locator('#zu-permission,.zu-permission').count(), 0);
    assert.doesNotMatch(await m.page.locator('.zu-page').innerText(), /Video calls from/);

    // A host's call rings the member, who needs one minute of coins to answer.
    await m.page.evaluate(() => go('chats'));
    await m.receive('call.incoming', { callId: 'host-call', from: { id: hostId, name: 'Ananya Iyer', host: true }, voice: true, fromHost: true, rate: 60 });
    assert.equal(await view(m.page), 'incoming');
    const ring = m.page.locator('.ringscr');
    assert.match(await ring.innerText(), /Incoming voice call[\s\S]*Ananya Iyer[\s\S]*60 coins\/min · charged once you answer[\s\S]*You need 60 coins to answer/i);
    const accept = m.page.getByRole('button', { name: 'Accept', exact: true });
    assert.equal(await accept.isEnabled(), true, 'An attempted answer offers recharge when coins are low');
    await m.page.evaluate(() => {
      window.__rechargePrepareCalls = 0;
      window.__rechargeOriginalPrepare = ZimiMedia.prepare;
      ZimiMedia.prepare = (...args) => { window.__rechargePrepareCalls++; return window.__rechargeOriginalPrepare(...args); };
    });
    await accept.click();
    const recharge = m.page.getByRole('dialog', { name: 'Recharge to continue', exact: true });
    await recharge.waitFor();
    assert.equal(await m.page.evaluate(() => window.__rechargePrepareCalls), 0, 'Low balance opens recharge before camera or microphone preparation');
    assert.equal(await m.page.evaluate(() => __sent.filter(message => message.type === 'call.accept').length), 0, 'Low balance cannot answer the call');
    await recharge.getByRole('button', { name: 'Not now', exact: true }).click();
    await accept.click();
    await recharge.getByRole('button', { name: 'Recharge', exact: true }).click();
    const hold = (await m.sent('call.topup.hold')).at(-1);
    assert.equal(hold.callId, 'host-call', 'Recharge holds the incoming call before opening packages');
    assert.equal(await view(m.page), 'incoming', 'Checkout waits for the server hold acknowledgement');
    const until = new Date(Date.now() + 300000).toISOString();
    await m.receive('call.topup.held', { callId: 'host-call', requestId: hold.requestId, until });
    assert.equal(await view(m.page), 'coins');
    assert.equal(await m.page.evaluate(() => S.memberRing?.callId), 'host-call', 'Coin Packages preserves the actual incoming caller');
    assert.deepEqual(await m.page.evaluate(() => [CallInvitations.topup?.kind, CallInvitations.topup?.callId, CallInvitations.topup?.until]), ['incoming', 'host-call', until]);
    assert.equal((await m.sent('call.accept')).length, 0, 'Recharge never accepts the call automatically');
    assert.equal((await m.sent('call.decline')).length, 0, 'Recharge never declines the held call');
    assert.equal(await m.page.evaluate(() => window.__rechargePrepareCalls), 0);
    await m.receive('wallet.balance', { coins: 500, earningsPaise: 0 });
    await m.page.getByRole('button', { name: 'Return to incoming call', exact: true }).click();
    const review = (await m.sent('call.topup.review')).at(-1);
    await m.receive('call.topup.reviewed', { callId: 'host-call', requestId: review.requestId, ringing: true, rate: 60 });
    assert.equal(await view(m.page), 'incoming');
    assert.equal((await m.sent('call.accept')).length, 0, 'Funding still requires a separate explicit Accept');
    await m.page.evaluate(() => { ZimiMedia.prepare = window.__rechargeOriginalPrepare; });
    assert.equal(await accept.isDisabled(), false, 'A recharge enables Accept on the ring screen');
    for (const name of ['Accept', 'Decline']) assert.equal(await m.page.getByRole('button', { name, exact: true }).evaluate(el => getComputedStyle(el).borderRadius), '999px', `${name} is round`);
    await m.receive('call.failed', { callId: 'host-call', message: 'You need at least 60 coins to answer this call (one minute). Recharge to answer.', code: 'INSUFFICIENT_COINS' });
    await recharge.getByRole('button', { name: 'Not now', exact: true }).click();
    assert.match(await ring.innerText(), /You need at least 60 coins to answer this call/, 'A refused answer is explained on the ring screen');
    await m.receive('wallet.balance', { coins: 500, earningsPaise: 0 });
    await accept.click();
    await m.page.waitForFunction(() => __sent.some(message => message.type === 'call.accept' && message.data.callId === 'host-call'));
    await m.receive('call.connected', { callId: 'host-call', initiator: false, peerId: hostId, voice: true, rate: 60 });
    assert.equal(await view(m.page), 'voice', 'The member joins the voice call with the host');
    assert.deepEqual(await m.page.evaluate(() => [S.h, S.callId, S.callRate]), [hostId, 'host-call', 60]);
    await m.receive('call.ended', { callId: 'host-call' });

    // Declining and missing a ring both return to the screen the member was on.
    await m.page.evaluate(() => go('chats'));
    await m.receive('call.incoming', { callId: 'declined-call', from: { id: hostId, name: 'Ananya Iyer', host: true }, voice: false, fromHost: true, rate: 0 });
    assert.match(await m.page.locator('.ringscr').innerText(), /Incoming video call[\s\S]*Free call/i);
    await m.page.getByRole('button', { name: 'Decline', exact: true }).click();
    assert.deepEqual((await m.sent('call.decline')).at(-1), { callId: 'declined-call' });
    assert.equal(await view(m.page), 'chats');
    await m.receive('call.incoming', { callId: 'missed-call', from: { id: hostId, name: 'Ananya Iyer', host: true }, voice: true, fromHost: true });
    await m.receive('call.ended', { callId: 'missed-call' });
    assert.equal(await view(m.page), 'chats');
    assert.equal(await notice(m.page), 'Missed call from Ananya');
    await m.receive('call.incoming', { callId: 'member-to-member', from: { id: otherHostId, name: 'Not a host' }, voice: true });
    assert.equal(await view(m.page), 'chats', 'Only a host\'s call rings a member');
    assert.deepEqual(m.errors, []);
    await m.page.close();

    // The host can call the member straight away, and may follow them back.
    const h = await open(browser, host);
    await openProfile(h, memberId, memberProfile);
    assert.equal(await h.page.locator('#zu-follow').innerText(), 'Follow back');
    assert.equal(await h.page.locator('.zu-follows-you').innerText(), 'Follows you');
    const voiceCall = h.page.getByRole('button', { name: 'Voice call', exact: true }), videoCall = h.page.getByRole('button', { name: 'Video call', exact: true });
    assert.deepEqual([await voiceCall.isDisabled(), await videoCall.isDisabled()], [false, false], 'Hosts call members at any time');
    assert.equal(await h.page.locator('.zu-action-note').count(), 0, 'No permission note');
    assert.equal(await h.page.getByRole('button', { name: 'Message', exact: true }).isDisabled(), false, 'Hosts message members at any time');
    await h.page.locator('#zu-follow').click();
    const follow = (await h.sent('follow.set')).at(-1);
    assert.deepEqual([follow.id, follow.on], [memberId, true]);
    await h.receive('follow.saved', { id: memberId, on: true, requestId: follow.requestId });
    assert.equal(await h.page.locator('#zu-follow').innerText(), 'Following');
    const fits = await h.page.locator('.zu-action-buttons').evaluate(el => el.scrollWidth <= el.clientWidth + 1);
    assert.equal(fits, true, 'Message, Voice and Video fit the action bar');

    await voiceCall.click();
    await h.page.waitForFunction(() => __sent.some(message => message.type === 'call.start'));
    assert.deepEqual((await h.sent('call.start')).at(-1), { to: memberId, voice: true });
    assert.equal(await view(h.page), 'dialback');
    await h.receive('call.failed', { message: 'This member can\'t take a call right now. Try again later.' });
    assert.equal(await view(h.page), 'host', 'A refused call returns to the profile');
    assert.equal(await notice(h.page), 'This member can\'t take a call right now. Try again later.');
    const reload = (await h.sent('profile.load')).at(-1);
    await h.receive('data.publicProfile', { ...reload, profile: { ...memberProfile, following: true } });

    await voiceCall.click();
    await h.page.waitForFunction(() => __sent.filter(message => message.type === 'call.start').length === 2);
    await h.receive('call.created', { callId: 'to-member', to: memberId, voice: true });
    await h.receive('call.connected', { callId: 'to-member', initiator: true, peerId: memberId, voice: true, rate: 60 });
    assert.equal(await view(h.page), 'hcall', 'The host is in the call with the member');
    assert.deepEqual(await h.page.evaluate(() => [S.caller.id, S.caller.voice, S.caller.callId]), [memberId, true, 'to-member']);
    await h.receive('call.ended', { callId: 'to-member' });

    // The chat header offers Voice and Video calls to the member too.
    await h.page.evaluate(id => go('thread', id), memberId);
    await h.receive('data.thread', { with: memberId, messages: [], canSend: true });
    for (const id of ['#zc-host-voice', '#zc-host-video']) assert.equal(await h.page.locator(id).getAttribute('aria-disabled'), null);
    await h.page.locator('#zc-host-video').click();
    await h.page.waitForFunction(() => __sent.filter(message => message.type === 'call.start').length === 3);
    assert.deepEqual((await h.sent('call.start')).at(-1), { to: memberId, voice: false }, 'Video calls start from the chat header');
    assert.equal(await h.page.evaluate(() => zcThreadBlocked()), '', 'The host can write to the member straight away');
    assert.equal(await h.page.evaluate(id => zcChatBlockReason(id), otherHostId), '', 'Hosts can message other hosts');
    assert.deepEqual(h.errors, []);
    await h.page.close();
    console.log('PASS host and member calls: no permission switch, ring screen with coins check, answer/decline/missed, Follow back, host Voice/Video at any time, refused calls and open host messaging');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
