// The creator call flow: camera check and going online, a second caller ringing as a banner
// (decline or switch, never a busy signal), the entry fee hold, early endings and the session summary.
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const host = { user: { id: '507f1f77bcf86cd799439017', name: 'Host', role: 'host', hostStatus: 'approved', isVerifiedHost: true }, verification: 'verified', requiresOnboarding: false };
const earlyEnds = today => ({ today, limit: 2, penaltyCoins: 60 });
const status = { rate: 50, tier: 2, earnedCoins: 180000, next: { tier: 3, rate: 85, atCoins: 500000 }, tiers: [{ tier: 1, rate: 17, minCoins: 0 }, { tier: 2, rate: 50, minCoins: 150000 }, { tier: 3, rate: 85, minCoins: 500000 }], entryFeeCoins: 60, entryFeeHoldSeconds: 60, earlyEnds: earlyEnds(2), visibleDuringCalls: true };
const terms = { rate: 50, entryFee: 60, feeHoldSeconds: 60 };
const shot = (page, name) => page.screenshot({ path: path.join(os.tmpdir(), `zimi-host-calls-${name}.png`) });

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => {
      window.__sent = []; window.__captures = 0;
      window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) };
      const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = constraints => { __captures++; return capture(constraints); };
    });
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href + '?role=host');
    const receive = (type, data) => page.evaluate(message => Native.receive(message), { type, data });
    const sent = type => page.evaluate(type => __sent.filter(message => message.type === type).map(message => message.data), type);
    const button = name => page.getByRole('button', { name, exact: true });

    // Getting ready: the terms load, and the camera starts only when the host asks.
    await receive('session', host);
    await page.evaluate(() => go('setup'));
    assert.equal((await sent('host.callStatus.load')).length, 1, 'Setup asks for the host call terms');
    await receive('host.callStatus', status);
    assert.match(await page.locator('.hc-setup').innerText(), /3,000\/h\s*3,20,000 left to upgrade/, 'The rate leads the setup card');
    await button('Call price details').click();
    const setup = await page.locator('.hc-setup').innerText();
    assert.match(setup, /50 coins \/ min[\s\S]*Tier 2 of 3[\s\S]*Earn 3,20,000 more coins to unlock 85\/min/);
    assert.match(setup, /60-coin entry fee[\s\S]*passes 1 minute/);
    await page.getByRole('switch').click();
    assert.deepEqual((await sent('presence.duringCalls')).at(-1), { on: false });
    await receive('presence.duringCalls.saved', { on: false });
    assert.equal(await page.getByRole('switch').getAttribute('aria-checked'), 'false', 'The host can hide from Home during calls');
    assert.equal(await page.evaluate(() => __captures), 0, 'Opening setup does not capture the camera');
    await button('Check camera').click();
    await page.waitForFunction(() => HostCalls.preview === 'ready' && document.querySelector('video[data-zimi-local]')?.srcObject?.active);
    assert.equal(await page.evaluate(() => __captures), 1);
    await button('Turn camera off').click();
    assert.equal(await page.locator('.hc-preview.is-off').count(), 1);
    assert.equal(await page.evaluate(() => document.querySelector('video[data-zimi-local]').srcObject.getVideoTracks()[0].enabled), false, 'Turning the camera off pauses its video');
    await button('Turn camera on').click();
    assert.equal(await page.locator('.hc-preview.is-off').count(), 0);
    assert.equal(await page.evaluate(() => __captures), 1, 'Turning the camera back on resumes the same preview');
    await page.waitForFunction(() => document.querySelector('video[data-zimi-local]').videoWidth > 0);
    await shot(page, 'setup');

    await button('Go online for calls').click();
    assert.equal((await sent('presence.set')).at(-1).online, true);
    await receive('presence.saved', { online: true, visible: true });
    await page.waitForFunction(() => S.v === 'waiting');
    assert.equal(await page.evaluate(() => HostCalls.preview), '', 'Leaving setup releases the preview');
    await receive('host.callStatus', { ...status, visibleDuringCalls: false });
    assert.match(await page.locator('.hc-waiting').innerText(), /You’re online[\s\S]*Waiting for callers/);

    // A caller who arrives while another is ringing waits, then rings as a banner on the answered call.
    await receive('call.incoming', { callId: 'c1', from: { id: 'm1', name: 'Riya Sharma', level: 5, city: 'Pune' }, voice: false, ...terms });
    await page.waitForFunction(() => S.v === 'ring');
    assert.match(await page.locator('.ringscr').innerText(), /You earn 50 coins\/min[\s\S]*\+60 entry fee once the call passes 1 minute/);
    await receive('call.incoming', { callId: 'c5', from: { id: 'm5', name: 'Meera' }, voice: true, ...terms });
    assert.equal(await page.evaluate(() => S.caller.callId), 'c1', 'The ringing call keeps the screen');
    await button('Accept').click();
    await page.waitForFunction(() => __sent.some(message => message.type === 'call.accept' && message.data.callId === 'c1'));
    await receive('call.connected', { callId: 'c1', initiator: false, peerId: 'm1', voice: false, ...terms, earlyEnds: earlyEnds(2) });
    await page.waitForFunction(() => S.v === 'hcall');
    // The caller sees the host's targets; they are shared once per change, never per redraw.
    await page.waitForFunction(() => __sent.some(message => message.type === 'call.targets.set'));
    assert.deepEqual(await sent('call.targets.set'), [{ callId: 'c1', giftId: null, giftCount: 10, giftProgress: 0, goalCoins: 1000000, earnedCoins: 0 }], 'The host shares their targets with the caller');
    await receive('gift.received', { id: 'targets-gift', callId: 'c1', from: 'm1', senderName: 'Riya Sharma', giftName: 'Rose', emoji: '🌹', coins: 99 });
    await page.waitForFunction(() => __sent.filter(message => message.type === 'call.targets.set').length === 2);
    assert.equal((await sent('call.targets.set')).at(-1).earnedCoins, 99, 'Gifts move the shared mission progress');
    await page.evaluate(() => { for (let i = 0; i < 5; i++) r(); });
    await page.waitForTimeout(700);
    assert.equal((await sent('call.targets.set')).length, 2, 'Redraws without changes send nothing');
    await page.locator('.hc-incoming').waitFor();
    assert.match(await page.locator('.hc-incoming').innerText(), /Meera[\s\S]*Voice/);
    await page.getByRole('button', { name: 'Decline Meera' }).click();
    assert.deepEqual((await sent('call.decline')).at(-1), { callId: 'c5' });
    assert.match(await page.locator('#fee').innerText(), /Entry fee\s*60 unlocks in/);
    assert.equal(await page.getByRole('button', { name: 'Hidden from Home during calls, tap to show' }).count(), 1, 'The call shows the visibility choice');

    // Switching before the fee unlocks asks first, then keeps one session across both callers.
    await receive('call.incoming', { callId: 'c2', from: { id: 'm2', name: 'Kabir Das', level: 3 }, voice: false, ...terms });
    await page.locator('.hc-incoming').waitFor();
    assert.equal(await page.evaluate(() => S.v), 'hcall', 'A second caller never interrupts the call');
    await shot(page, 'banner');
    await page.getByRole('button', { name: 'Switch to Kabir Das' }).click();
    await page.locator('.hc-confirm').waitFor();
    assert.match(await page.locator('.hc-confirm').innerText(), /early ending 3 today\. Past 2 a day, it takes 60 coins/);
    await shot(page, 'switch-confirm');
    await button('Switch anyway').click();
    await page.locator('.hc-connecting').waitFor();
    const switchingBefore=await page.evaluate(()=>({peer:S.caller.id,messages:S.rmsgs.length}));
    await receive('chat.message',{from:switchingBefore.peer,text:'Automated welcome during call switch',automated:true});
    assert.equal(await page.evaluate(()=>S.rmsgs.length),switchingBefore.messages,'Pending call switches never accept automated chat messages');
    await page.waitForFunction(() => __sent.some(message => message.type === 'call.accept' && message.data.callId === 'c2'));
    assert.equal((await sent('call.end')).length, 0, 'The server ends the first call as part of the switch');
    await receive('call.ended', { callId: 'c1', reason: 'switch' });
    assert.equal(await page.evaluate(() => S.v), 'hcall', 'The first call ending mid-switch keeps the session');
    await receive('call.connected', { callId: 'c2', initiator: false, peerId: 'm2', voice: false, ...terms, earlyEnds: earlyEnds(3) });
    await page.waitForFunction(() => !S.connecting);
    assert.deepEqual(await page.evaluate(() => [S.caller.n, S.callId, S.callersN, S.early]), ['Kabir Das', 'c2', 2, 3]);
    await page.waitForFunction(() => __sent.some(message => message.type === 'call.targets.set' && message.data.callId === 'c2'));

    // After the hold the fee is the host's; a caller still ringing when the call ends rings next.
    await page.evaluate(() => { S.sec = S.cstart + 60; hostTick(); });
    assert.equal(await page.evaluate(() => S.feeOk), 1, 'The fee unlocks after the hold');
    await receive('call.incoming', { callId: 'c4', from: { id: 'm4', name: 'Arjun' }, voice: false, ...terms });
    await receive('call.ended', { callId: 'c2' });
    await page.waitForFunction(() => S.v === 'ring' && S.caller.callId === 'c4');
    await page.evaluate(()=>CH.push(['m4','Prior message','Now',0]));
    await receive('chat.message',{from:'m4',text:'Automated welcome while ringing',automated:true});
    assert.deepEqual(await page.evaluate(()=>CH.find(row=>row[0]==='m4')),['m4','Prior message','Now',0],'Ringing screens suppress automated unread previews');
    await button('Decline').click();
    await page.waitForFunction(() => S.v === 'summary');
    const summary = await page.locator('.hc-summary').innerText();
    assert.match(summary, /Callers\s*2/i);
    assert.match(summary, /Riya[\s\S]*Ended early[\s\S]*Kabir[\s\S]*\+60 received/);
    assert.match(summary, /Early endings today: 3\. Past 2 a day, each one takes 60 coins/);
    await shot(page, 'summary');
    assert.deepEqual(errors, [], 'No browser exceptions');
    console.log('PASS host calls: camera check on request, going online, visibility during calls, queued and banner callers, decline, switch with early-ending warning, entry fee hold and session summary');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
