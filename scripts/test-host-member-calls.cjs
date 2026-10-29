/* Hosts call members within the member's permissions, and members answer: video-call
   permission on a host profile, Follow back, host Voice/Video buttons, the member's ring
   screen and host-to-anyone messaging. All bridge traffic stays local. */
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
    // The member lets this host video-call them from the host's profile.
    const m = await open(browser, member);
    await m.receive('wallet.balance', { coins: 30, earningsPaise: 0 });
    await openProfile(m, hostId, hostProfile);
    const permission = m.page.locator('#zu-permission');
    assert.equal(await permission.getAttribute('aria-checked'), 'false');
    assert.match(await m.page.locator('.zu-permission').innerText(), /Video calls from Ananya[\s\S]*Let Ananya video call you/);
    await permission.click();
    const asked = (await m.sent('call.permission.set')).at(-1);
    assert.deepEqual([asked.id, asked.video], [hostId, true]);
    await m.receive('call.permission.error', { ...asked, message: 'Your call permission could not be confirmed. Try again.' });
    assert.match(await m.page.locator('.zu-inline-error').innerText(), /could not be confirmed/);
    assert.equal(await permission.getAttribute('aria-checked'), 'false', 'A failed save keeps the old setting');
    await permission.click();
    const retried = (await m.sent('call.permission.set')).at(-1);
    await m.receive('call.permission.saved', { id: hostId, video: true, requestId: retried.requestId });
    assert.equal(await permission.getAttribute('aria-checked'), 'true');
    assert.match(await m.page.locator('.zu-permission').innerText(), /Ananya can video call you/);
    assert.equal(await m.page.locator('#zu-permission').evaluate(el => getComputedStyle(el).borderRadius), '999px', 'Switches are round');

    // A host's call rings the member, who needs one minute of coins to answer.
    await m.page.evaluate(() => go('chats'));
    await m.receive('call.incoming', { callId: 'host-call', from: { id: hostId, name: 'Ananya Iyer', host: true }, voice: true, fromHost: true, rate: 60 });
    assert.equal(await view(m.page), 'incoming');
    const ring = m.page.locator('.ringscr');
    assert.match(await ring.innerText(), /Incoming voice call[\s\S]*Ananya Iyer[\s\S]*60 coins\/min · charged once you answer[\s\S]*You need 60 coins to answer/i);
    const accept = m.page.getByRole('button', { name: 'Accept', exact: true });
    assert.equal(await accept.isDisabled(), true, 'Too few coins: the member adds coins first');
    await m.receive('wallet.balance', { coins: 500, earningsPaise: 0 });
    assert.equal(await accept.isDisabled(), false, 'A recharge enables Accept on the ring screen');
    for (const name of ['Accept', 'Decline']) assert.equal(await m.page.getByRole('button', { name, exact: true }).evaluate(el => getComputedStyle(el).borderRadius), '999px', `${name} is round`);
    await m.receive('call.failed', { callId: 'host-call', message: 'You need at least 60 coins to answer this call (one minute). Recharge to answer.', code: 'INSUFFICIENT_COINS' });
    assert.match(await ring.innerText(), /You need at least 60 coins to answer this call/, 'A refused answer is explained on the ring screen');
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

    // The host follows the member back, which opens voice calls; video waits for the member.
    const h = await open(browser, host);
    await openProfile(h, memberId, memberProfile);
    assert.equal(await h.page.locator('#zu-follow').innerText(), 'Follow back');
    assert.equal(await h.page.locator('.zu-follows-you').innerText(), 'Follows you');
    const voiceCall = h.page.getByRole('button', { name: 'Voice call', exact: true }), videoCall = h.page.getByRole('button', { name: 'Video call', exact: true });
    assert.deepEqual([await voiceCall.isDisabled(), await videoCall.isDisabled()], [true, true]);
    assert.match(await h.page.locator('.zu-action-note').innerText(), /Voice calls open when you follow each other\. Video calls need Riya’s permission\./);
    assert.equal(await h.page.getByRole('button', { name: 'Message', exact: true }).isDisabled(), false, 'Hosts message members at any time');
    await h.page.locator('#zu-follow').click();
    const follow = (await h.sent('follow.set')).at(-1);
    assert.deepEqual([follow.id, follow.on], [memberId, true]);
    await h.receive('follow.saved', { id: memberId, on: true, requestId: follow.requestId });
    assert.equal(await h.page.locator('#zu-follow').innerText(), 'Following');
    assert.deepEqual([await voiceCall.isDisabled(), await videoCall.isDisabled()], [false, true]);
    assert.match(await h.page.locator('.zu-action-note').innerText(), /Riya hasn’t allowed video calls yet\./);
    const fits = await h.page.locator('.zu-action-buttons').evaluate(el => el.scrollWidth <= el.clientWidth + 1);
    assert.equal(fits, true, 'Message, Voice and Video fit the action bar');

    await voiceCall.click();
    await h.page.waitForFunction(() => __sent.some(message => message.type === 'call.start'));
    assert.deepEqual((await h.sent('call.start')).at(-1), { to: memberId, voice: true });
    assert.equal(await view(h.page), 'dialback');
    await h.receive('call.failed', { message: 'You can voice-call a member when you follow each other.' });
    assert.equal(await view(h.page), 'host', 'A refused call returns to the profile');
    assert.equal(await notice(h.page), 'You can voice-call a member when you follow each other.');
    const reload = (await h.sent('profile.load')).at(-1);
    await h.receive('data.publicProfile', { ...reload, profile: { ...memberProfile, following: true, canVoiceCall: true } });

    await voiceCall.click();
    await h.page.waitForFunction(() => __sent.filter(message => message.type === 'call.start').length === 2);
    await h.receive('call.created', { callId: 'to-member', to: memberId, voice: true });
    await h.receive('call.connected', { callId: 'to-member', initiator: true, peerId: memberId, voice: true, rate: 60 });
    assert.equal(await view(h.page), 'hcall', 'The host is in the call with the member');
    assert.deepEqual(await h.page.evaluate(() => [S.caller.id, S.caller.voice, S.caller.callId]), [memberId, true, 'to-member']);
    await h.receive('call.ended', { callId: 'to-member' });

    // The chat header shows the same permissions, and explains a locked call.
    await h.page.evaluate(id => go('thread', id), memberId);
    await h.receive('data.thread', { with: memberId, messages: [], canSend: true, canVoiceCall: true, canVideoCall: false });
    assert.equal(await h.page.locator('#zc-host-voice').getAttribute('aria-disabled'), 'false');
    assert.equal(await h.page.locator('#zc-host-video').getAttribute('aria-disabled'), 'true');
    // A locked call button still answers a tap with how to unlock it.
    await h.page.locator('#zc-host-video').click({ force: true });
    assert.match(await notice(h.page), /hasn’t allowed video calls from you yet/);
    assert.equal(await h.page.evaluate(() => zcThreadBlocked()), '', 'The host can write to the member straight away');
    assert.equal(await h.page.evaluate(id => zcChatBlockReason(id), otherHostId), '', 'Hosts can message other hosts');
    assert.deepEqual(h.errors, []);
    await h.page.close();
    console.log('PASS host and member calls: member video-call permission, ring screen with coins check, answer/decline/missed, Follow back, host Voice/Video within permissions, refused calls and open host messaging');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
