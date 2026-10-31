/* Terminal event regression against the generated app bundle. Native transport,
   accounts and media are local fixtures; server ring timing is tested separately. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const creatorId = '507f1f77bcf86cd799439011', memberId = '507f1f77bcf86cd799439019';
const creator = { id: creatorId, name: 'Call fixture creator', role: 'host', serverRole: 'host', hostStatus: 'approved', isVerifiedHost: true, isPhoneVerified: true, verified: true, online: true, availableForCall: true, ratePerMin: 0, entryFee: 0 };
const member = { id: memberId, name: 'Call fixture member', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false, isPhoneVerified: true, availableForCall: true, ratePerMin: 0, entryFee: 0 };
const unavailable = 'Host can\u2019t accept the call.';
const receive = (page, type, data = {}) => page.evaluate(message => Native.receive(message), { type, data });
const button = (page, name) => page.getByRole('button', { name, exact: true });

async function open(browser, hosting) {
  const page = await browser.newPage({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https?:\/\//, route => route.abort());
  await page.addInitScript(() => {
    window.__sent = []; window.__tracks = [];
    window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) };
    const acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await acquire(constraints); __tracks.push(...stream.getTracks()); return stream;
    };
  });
  await page.goto(pathToFileURL(path.join(root, 'assets', 'aurora.html')).href);
  await receive(page, 'session', { user: hosting ? creator : member, verification: hosting ? 'verified' : 'none', requiresOnboarding: false });
  await receive(page, 'data.home', { hosts: [creator], total: 1, page: 1, categories: [] });
  await receive(page, 'wallet.balance', { coins: 500 });
  return { page, errors };
}

async function start(page, hosting, voice, callId) {
  if (hosting) {
    await page.evaluate(id => go('host', id), memberId);
    const request = await page.evaluate(() => __sent.filter(message => message.type === 'profile.load').at(-1).data);
    await receive(page, 'data.publicProfile', { ...request, profile: member });
    await button(page, voice ? 'Voice call' : 'Video call').click();
  } else {
    await page.evaluate(id => go('precall', id), creatorId);
    if (voice) await button(page, 'Voice call').click();
    await button(page, voice ? 'Start voice call' : 'Start video call').click();
  }
  await page.waitForFunction(expected => S.v === expected && __sent.some(message => message.type === 'call.start'), hosting ? 'dialback' : 'dial');
  await receive(page, 'call.created', { callId, to: hosting ? memberId : creatorId, voice });
  await page.waitForFunction(() => ZimiRingback.playing());
  const starts = await page.evaluate(() => __sent.filter(message => message.type === 'call.start').map(message => message.data));
  assert.deepEqual(starts, [{ to: hosting ? memberId : creatorId, voice }]);
  assert.deepEqual(await page.evaluate(() => __tracks.filter(track => track.readyState === 'live').map(track => track.kind).sort()), voice ? ['audio'] : ['audio', 'video']);
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  let checks = 0;
  try {
    for (const hosting of [false, true]) for (const voice of [false, true]) for (const minimized of [false, true]) {
      const { page, errors } = await open(browser, hosting);
      const callId = `unavailable-${hosting ? 'dialback' : 'dial'}-${voice ? 'voice' : 'video'}-${minimized}`;
      try {
        await start(page, hosting, voice, callId);
        if (minimized) {
          await button(page, 'Minimize call').click();
          assert.equal(await page.evaluate(() => S.bgCall?.callId), callId);
          assert.equal(await page.evaluate(() => ZimiRingback.playing()), true);
          await page.locator('#zimi-ongoing').waitFor();
        }
        await receive(page, 'call.ended', { callId, reason: 'host_unavailable' });
        await page.waitForFunction(() => !ZimiRingback.playing() && __tracks.every(track => track.readyState === 'ended'));
        assert.equal(await page.evaluate(() => S.v), hosting ? 'host' : 'precall');
        const visibleReason = hosting ? await page.locator('#app-notice').innerText() : await page.locator('[role="alert"]').first().innerText();
        assert.ok(visibleReason.includes(unavailable), `${callId}: exact reason is visible`);
        assert.doesNotMatch(visibleReason, /not answered|didn't pick up/);
        assert.equal(await page.evaluate(() => S.callId), null);
        assert.equal(await page.evaluate(() => !!S.bgCall), false);
        assert.equal(await page.locator('#zimi-ongoing').count(), 0);
        assert.equal(await page.evaluate(() => __sent.filter(message => message.type === 'call.end' || message.type === 'call.accept').length), 0, 'Terminal server events never send another end or accept');
        await receive(page, 'call.ended', { callId, reason: 'host_unavailable' });
        assert.equal(await page.evaluate(() => ZimiRingback.playing()), false, 'A duplicate terminal event cannot restart the ringtone');
        assert.equal(await page.evaluate(() => __sent.filter(message => message.type === 'call.start').length), 1);
        assert.deepEqual(errors, []);
        checks++;
      } finally { await page.close(); }
    }
    console.log(`PASS ${checks} terminal call UI cases: exact unavailable reason, voice/video dial/dialback, minimized cleanup, stopped ringback/media, and duplicate-event safety.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
