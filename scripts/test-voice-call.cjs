/* Connected voice-call UI against the production bundle. Browser fake audio and
   native-edge fixtures only; no real account, call or payment API is invoked. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'artifacts', 'voice-call');
const creator = { id: '507f1f77bcf86cd799439011', name: 'Ananya Voice Creator', role: 'host', serverRole: 'host', hostStatus: 'approved', isVerifiedHost: true, isPhoneVerified: true, verified: true, availableForCall: true, ratePerMin: 0, entryFee: 0 };
const member = { id: '507f1f77bcf86cd799439012', name: 'Rahul Voice Member', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false, isPhoneVerified: true };
const receive = (page, type, data = {}) => page.evaluate(message => Native.receive(message), { type, data });
const sent = (page, type) => page.evaluate(type => __sent.filter(message => message.type === type).map(message => message.data), type);
const button = (page, name) => page.getByRole('button', { name, exact: true });
const micEnabled = page => page.evaluate(() => __voiceTracks.filter(track => track.kind === 'audio' && track.readyState === 'live').every(track => track.enabled));

async function open(browser, errors, hosting) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(7000);
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https?:\/\//, route => route.abort());
  await page.addInitScript(() => {
    window.__sent = []; window.__voiceTracks = [];
    window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) };
    const acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await acquire(constraints); __voiceTracks.push(...stream.getTracks()); return stream;
    };
  });
  await page.goto(pathToFileURL(path.join(root, 'assets', 'aurora.html')).href);
  await receive(page, 'session', { user: hosting ? creator : member, verification: hosting ? 'verified' : 'none', requiresOnboarding: false });
  await receive(page, 'data.home', { hosts: [creator], total: 1, page: 1 });
  await receive(page, 'wallet.balance', { coins: 1000, earned: 0 });
  await receive(page, 'data.catalog', { gifts: [], packs: [], paymentsAvailable: false });
  if (!hosting) {
    const openChat = async () => {
      await page.evaluate(peer => zcOpen(peer), creator.id);
      await receive(page, 'data.thread', { with: creator.id, canSend: true, messages: [] });
    };
    await openChat();
    await button(page, 'Voice call').click();
    assert.equal(await page.locator('[data-call-mode="voice"]').getAttribute('aria-pressed'), 'true', 'Chat Voice opens review with voice selected');
    await button(page, 'Start voice call').waitFor();
    assert.equal((await sent(page, 'call.start')).length, 0, 'Opening voice review never starts a call');
    assert.equal(await page.evaluate(() => __voiceTracks.length), 0, 'Opening voice review never captures microphone or camera');
    await openChat();
    await button(page, 'Video call').click();
    assert.equal(await page.locator('[data-call-mode="video"]').getAttribute('aria-pressed'), 'true', 'Chat Video resets review to video after a voice selection');
    await button(page, 'Start video call').waitFor();
    assert.equal((await sent(page, 'call.start')).length, 0, 'Opening video review still waits for explicit confirmation');
    assert.equal(await page.evaluate(() => __voiceTracks.length), 0, 'Opening video review never captures media');
  }
  await page.evaluate(async ({ hosting, creator, member }) => {
    await ZimiMedia.prepare(false);
    S.callId = hosting ? 'voice-host-fixture' : 'voice-member-fixture';
    S.callRate = 0; S.mic = 1; S.cam = 0; S.scam = 0;
    if (hosting) S.caller = { id: member.id, n: member.name, callId: S.callId, voice: true };
    go(hosting ? 'hcall' : 'voice', hosting ? undefined : creator.id);
    S.callFee = 0; Home.mediaStatus = 'Connected'; r();
    window.__voiceAudio = document.querySelector('audio[data-zimi-remote]');
  }, { hosting, creator, member });
  await page.locator('.zr-voice-call .zr-voice-stage').waitFor();
  return page;
}

async function layout(page, label) {
  const metrics = await page.evaluate(() => {
    const box = element => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
    const room = document.querySelector('.zr-voice-call'), stage = room.querySelector('.zr-voice-stage'), identity = stage.querySelector('.zr-voice');
    const controls = [...room.querySelectorAll('.zr-voice-controls button')];
    return { room: box(room), stage: box(stage), identity: box(identity), top: box(room.querySelector('.zr-top')), bottom: box(room.querySelector('.zr-bottom')),
      controls: controls.map(el => ({ label: el.getAttribute('aria-label'), box: box(el), round: parseFloat(getComputedStyle(el).borderRadius) })),
      overflow: document.documentElement.scrollWidth > innerWidth + 1 || room.scrollWidth > room.clientWidth + 1,
      viewport: { width: innerWidth, height: innerHeight }, audioStable: document.querySelector('audio[data-zimi-remote]') === window.__voiceAudio,
      cameraControls: [...room.querySelectorAll('button')].map(el => el.getAttribute('aria-label')).filter(label => /camera|swap videos|flip/i.test(label || '')),
      videos: room.querySelectorAll('video,.zr-pip').length,
      name: identity.querySelector('h2')?.textContent,
    };
  });
  assert.equal(metrics.overflow, false, `${label}: no horizontal overflow`);
  assert.ok(metrics.stage.top >= metrics.top.bottom - 1, `${label}: identity starts below the header and targets`);
  assert.ok(metrics.stage.bottom <= metrics.bottom.top + 1, `${label}: identity ends above call controls and chat`);
  assert.ok(metrics.identity.top >= metrics.stage.top - 1 && metrics.identity.bottom <= metrics.stage.bottom + 1, `${label}: avatar and name fit the available stage`);
  assert.ok(metrics.stage.height > 0, `${label}: the voice identity remains visible`);
  assert.equal(metrics.controls.length, 3, `${label}: microphone, caller sound and end are immediately available`);
  for (const control of metrics.controls) {
    assert.ok(control.box.width >= 44 && control.box.height >= 44, `${label}: ${control.label} has a usable touch target`);
    assert.ok(control.box.left >= 0 && control.box.right <= metrics.viewport.width + 1 && control.box.bottom <= metrics.viewport.height + 1, `${label}: ${control.label} stays on screen`);
    assert.ok(control.round >= control.box.width / 2, `${label}: ${control.label} is round`);
  }
  assert.equal(metrics.audioStable, true, `${label}: redraw retains the remote audio element`);
  assert.equal(metrics.videos, 0, `${label}: voice has no video or camera preview`);
  assert.deepEqual(metrics.cameraControls, [], `${label}: voice has no camera actions`);
  assert.ok(metrics.name, `${label}: caller identity remains readable`);
  return metrics;
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [], layouts = [];
  try {
    for (const hosting of [false, true]) {
      const page = await open(browser, errors, hosting), role = hosting ? 'host' : 'member';
      assert.equal(await page.evaluate(() => __voiceTracks.filter(track => track.readyState === 'live').map(track => track.kind).join(',')), 'audio', 'Voice only requests a live microphone');
      for (const dark of [false, true]) {
        await page.evaluate(value => ZimiThemes.setDark(value), dark);
        for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
          await page.setViewportSize(viewport); await page.evaluate(() => r());
          layouts.push({ role, dark, viewport, ...await layout(page, `${role} ${viewport.width}x${viewport.height} ${dark ? 'dark' : 'light'}`) });
          if (viewport.width === 390) await page.screenshot({ path: path.join(out, `${role}-${dark ? 'dark' : 'light'}-390.png`) });
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
      const controls = page.locator('.zr-voice-controls');
      await controls.getByRole('button', { name: 'Mute microphone', exact: true }).click();
      assert.equal(await micEnabled(page), false, 'Mute disables the real fake-device microphone track');
      assert.equal(await controls.getByRole('button', { name: 'Unmute microphone', exact: true }).getAttribute('aria-pressed'), 'true');
      await controls.getByRole('button', { name: 'Unmute microphone', exact: true }).click();
      assert.equal(await micEnabled(page), true);
      await controls.getByRole('button', { name: 'Mute caller', exact: true }).click();
      assert.equal(await page.locator('audio[data-zimi-remote]').evaluate(audio => audio.muted), true, 'Caller sound changes the actual media element');
      assert.equal(await controls.getByRole('button', { name: 'Unmute caller', exact: true }).getAttribute('aria-pressed'), 'true');
      await button(page, 'Open call chat').click();
      await page.getByRole('textbox', { name: 'Call message', exact: true }).fill('Hello from a voice call');
      await layout(page, role + ' typing');
      assert.equal(await controls.getByRole('button', { name: 'End call', exact: true }).isVisible(), true, 'End stays available while typing');
      await button(page, 'Send message').click();
      assert.deepEqual((await sent(page, 'chat.send')).at(-1), { to: hosting ? member.id : creator.id, text: 'Hello from a voice call', inCall: true });
      assert.equal(await page.evaluate(() => document.querySelector('audio[data-zimi-remote]') === __voiceAudio), true);
      if (!hosting) {
        await button(page, 'Add coins').click();
        await receive(page, 'data.catalog', { gifts: [], packs: [], paymentsAvailable: false });
        assert.equal(await page.evaluate(() => S.callId), 'voice-member-fixture', 'Top-up keeps the voice call session');
        await button(page, 'Close gifts').click();
      }
      await controls.getByRole('button', { name: 'Mute microphone', exact: true }).click();
      const before = await page.evaluate(() => ({ sec: S.sec, callId: S.callId }));
      await button(page, 'Minimize call').click();
      await page.locator('#zimi-ongoing').waitFor();
      assert.equal(await page.evaluate(() => S.bgCall.voice), true);
      assert.equal(await micEnabled(page), false, 'A minimized voice call preserves microphone mute');
      assert.equal(await page.locator('#zimi-ongoing audio[data-zimi-remote]').evaluate(audio => audio.muted), true, 'Minimizing preserves caller mute');
      await page.waitForFunction(sec => S.sec > sec, before.sec);
      await page.locator('#zimi-ongoing .zoc-return').click();
      assert.equal(await page.evaluate(() => S.callId), before.callId, 'Restoring keeps the same call');
      assert.equal(await page.locator('audio[data-zimi-remote]').evaluate(audio => audio.muted), true);
      assert.equal(await micEnabled(page), false);
      await controls.getByRole('button', { name: 'End call', exact: true }).click();
      assert.equal(await page.evaluate(() => S.v), 'summary');
      assert.equal((await sent(page, 'call.end')).at(-1).callId, before.callId);
      await page.close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ layouts, pageErrors: errors }, null, 2));
    console.log('PASS voice calls: member/host responsive identity, accessible direct mute/sound/end, real microphone control, stable audio on redraw, chat/top-up and minimized session continuity.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
