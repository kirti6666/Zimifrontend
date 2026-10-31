/* A call keeps going behind other screens: Back minimizes it, a bar on every
   other screen returns to it or ends it, and nothing else may start or ring over
   it. Uses Chromium's fake camera and a mocked native bridge; no server is involved. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const hostId = '507f1f77bcf86cd799439011', memberId = '507f1f77bcf86cd799439019';
const creator = { id: hostId, name: 'Ananya Iyer', category: 'Music', tag: 'Music', online: true, availableForCall: true, verified: true, ratePerMin: 0, entryFee: 0 };
const member = { user: { id: memberId, name: 'Rahul', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false }, verification: 'none', requiresOnboarding: false };
const host = { user: { id: hostId, name: 'Ananya Iyer', role: 'host', serverRole: 'host', hostStatus: 'approved', isVerifiedHost: true }, verification: 'verified', requiresOnboarding: false };
const receive = (page, type, data = {}) => page.evaluate(message => Native.receive(message), { type, data });
const sent = (page, type) => page.evaluate(type => __sent.filter(message => message.type === type).map(message => message.data), type);
const button = (page, name) => page.getByRole('button', { name, exact: true });
const view = page => page.evaluate(() => S.v);
const bar = page => page.locator('#zimi-ongoing');
const liveTracks = page => page.evaluate(() => __tracks().filter(track => track.readyState === 'live').map(track => `${track.kind}${track.enabled ? '' : ':off'}`).sort().join(','));

async function open(browser, account, viewport = { width: 390, height: 844 }) {
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
  page.setDefaultTimeout(7000);
  page.on('pageerror', error => page.errors.push(error.message)); page.errors = [];
  await page.route('https://**/*', route => route.abort());
  await page.addInitScript(() => {
    window.__sent = [];
    window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) };
    const acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices), tracks = [];
    window.__tracks = () => tracks;
    navigator.mediaDevices.getUserMedia = async constraints => { const stream = await acquire(constraints); tracks.push(...stream.getTracks()); return stream; };
  });
  await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href + `?role=${account === host ? 'host' : 'sender'}`);
  await receive(page, 'session', account);
  await receive(page, 'data.home', { hosts: [creator], stage: [], featured: creator, total: 1, page: 1, categories: ['Music'], availableCount: 1 });
  await receive(page, 'wallet.balance', { coins: 500 });
  return page;
}
async function startVideoCall(page) {
  await page.evaluate(id => go('precall', id), hostId);
  await button(page, 'Start video call').click();
  await page.waitForFunction(() => S.v === 'dial' && __sent.some(message => message.type === 'call.start'));
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  try {
    /* A member's video call: ringing, answered, browsed away from, returned to and ended. */
    const page = await open(browser, member);
    await startVideoCall(page);
    await button(page, 'Minimize call').click();
    assert.equal(await view(page), 'home', 'Back on the calling screen minimizes the call');
    assert.match(await bar(page).innerText(), /Ananya Iyer[\s\S]*Calling/);
    assert.equal(await page.evaluate(() => ZimiRingback.playing()), true, 'A minimized call keeps ringing');
    assert.equal(await liveTracks(page), 'audio,video', 'Its camera and microphone stay on');
    assert.equal((await sent(page, 'call.end')).length, 0, 'Minimizing never ends the call');
    assert.equal((await sent(page, 'screen.secure')).at(-1).on, true, 'Screens stay secure while a call is minimized');
    const layout = await page.evaluate(() => ({ bar: document.getElementById('zimi-ongoing').getBoundingClientRect().bottom, top: document.getElementById('top').getBoundingClientRect().top }));
    assert.ok(layout.top >= layout.bar - 1, 'The bar sits above the header instead of covering it');
    await page.evaluate(id => go('precall', id), hostId);
    await button(page, 'Start video call').click();
    assert.equal((await sent(page, 'call.start')).length, 1, 'No second call starts while one is minimized');
    assert.equal(await liveTracks(page), 'audio,video', 'Opening a call setup leaves the minimized call’s camera on');
    await receive(page, 'call.incoming', { fromHost: true, callId: 'other-host-call', from: { id: '507f1f77bcf86cd7994390aa', name: 'Another host' }, voice: false });
    assert.deepEqual((await sent(page, 'call.decline')).map(data => data.callId), ['other-host-call'], 'Another call never rings over a minimized one');
    assert.notEqual(await view(page), 'incoming');

    await receive(page, 'call.connected', { callId: 'member-call', rate: 0, voice: false });
    assert.equal(await view(page), 'call', 'An answer opens the call screen');
    assert.equal(await bar(page).count(), 0);
    assert.equal(await page.evaluate(() => ZimiRingback.playing()), false);
    await page.waitForFunction(() => S.sec >= 1);
    await button(page, 'Minimize call').click();
    await page.evaluate(() => go('chats'));
    assert.equal(await view(page), 'chats');
    assert.equal(await bar(page).locator('video[data-zimi-remote]').count(), 1, 'A video call keeps the other person’s video (and audio) in the bar');
    const minimizedAt = await page.evaluate(() => S.sec);
    await page.waitForFunction(at => S.sec >= at + 2, minimizedAt);
    assert.match(await bar(page).innerText(), /Video call · 00:0\d/, 'The bar shows the running call time');
    assert.equal(await liveTracks(page), 'audio,video');
    await page.getByRole('button', { name: 'Return to your call with Ananya Iyer' }).click();
    assert.equal(await view(page), 'call', 'A tap on the bar returns to the call');
    assert.ok(await page.evaluate(at => S.sec >= at + 2, minimizedAt), 'The call clock kept running');
    assert.equal(await page.evaluate(() => !!document.querySelector('.zr-pip video[data-zimi-local]')?.srcObject), true, 'The caller’s camera is back in the call');
    await button(page, 'Minimize call').click();
    await receive(page, 'app.back');
    assert.equal(await view(page), 'call', 'Back on Home returns to the call instead of leaving the app');
    assert.equal((await sent(page, 'app.exit.request')).length, 0);
    await button(page, 'Minimize call').click();
    await bar(page).locator('.voiceend').click();
    assert.equal(await view(page), 'summary', 'Ending from the bar ends the call as the red button does');
    assert.deepEqual((await sent(page, 'call.end')).map(data => data.callId), ['member-call']);
    await page.waitForFunction(() => __tracks().every(track => track.readyState === 'ended'));
    assert.equal(await bar(page).count(), 0);
    errors.push(...page.errors);

    /* An unanswered minimized call ends as it does on screen; signing out stops a minimized call. */
    const unanswered = await open(browser, member, { width: 320, height: 640 });
    await startVideoCall(unanswered);
    await receive(unanswered, 'app.back');
    assert.equal(await unanswered.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'The bar fits a 320px screen');
    await receive(unanswered, 'call.ended', { callId: 'never-answered' });
    assert.equal(await view(unanswered), 'precall');
    assert.match(await unanswered.locator('[role="alert"]').first().innerText(), /not answered/);
    assert.equal(await bar(unanswered).count(), 0);
    assert.equal(await unanswered.evaluate(() => ZimiRingback.playing()), false);
    await startVideoCall(unanswered);
    await receive(unanswered, 'app.back');
    await receive(unanswered, 'session.none');
    assert.equal(await bar(unanswered).count(), 0, 'Signing out removes the bar');
    await unanswered.waitForFunction(() => __tracks().every(track => track.readyState === 'ended'));
    assert.equal(await unanswered.evaluate(() => ZimiRingback.playing()), false);
    errors.push(...unanswered.errors);

    /* A host's minimized call comes back when the next caller rings, with the banner. */
    const hostPage = await open(browser, host);
    await receive(hostPage, 'call.incoming', { callId: 'first-caller', from: { id: memberId, name: 'Rahul' }, rate: 0, voice: false });
    await button(hostPage, 'Accept').click();
    await hostPage.waitForFunction(() => __sent.some(message => message.type === 'call.accept'));
    await receive(hostPage, 'call.connected', { callId: 'first-caller', rate: 0, voice: false });
    assert.equal(await view(hostPage), 'hcall');
    await button(hostPage, 'Minimize call').click();
    assert.equal(await view(hostPage), 'home');
    assert.match(await bar(hostPage).innerText(), /Rahul/);
    await receive(hostPage, 'call.incoming', { callId: 'second-caller', from: { id: '507f1f77bcf86cd7994390bb', name: 'Second caller' }, rate: 0, voice: false });
    assert.equal(await view(hostPage), 'hcall', 'The next caller brings the host back to the call');
    assert.equal(await hostPage.evaluate(() => S.inc?.callId), 'second-caller', 'The caller rings as a banner, never a busy signal');
    assert.equal(await hostPage.evaluate(() => S.caller?.callId), 'first-caller');
    assert.equal(await bar(hostPage).count(), 0);
    errors.push(...hostPage.errors);

    assert.deepEqual(errors, [], 'No uncaught browser errors');
    console.log('PASS ongoing call: Back minimizes ringing and connected calls, the bar returns with the clock, camera and remote media intact or ends the call, answers reopen the call, no second call starts or rings, a host’s next caller reopens the call, unanswered and signed-out calls clean up, and the bar fits 320px');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
