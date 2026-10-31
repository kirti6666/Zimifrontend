// Production-bundle fixtures only: no real microphone, account or server access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const fixtureUrl = pathToFileURL(path.join(root, 'assets/aurora.html')).href + '?role=sender';
const id = suffix => `507f1f77bcf86cd7994390${suffix}`;
const mira = { id: id('11'), name: 'Mira North', role: 'host', category: 'Music', online: true, verified: true, availableForCall: true, ratePerMin: 0 };
const asha = { ...mira, id: id('12'), name: 'Asha Sen' };
const member = { user: { id: id('01'), name: 'Member', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false, isPhoneVerified: true }, balance: 0, verification: 'none', requiresOnboarding: false };
const original = { id: id('51'), mine: false, text: 'Send me your song idea.', createdAt: new Date().toISOString() };
const ownText = { id: id('52'), mine: true, text: 'I have an acoustic version in mind.', createdAt: new Date().toISOString(), status: 'read' };
const launchOptions = { headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) };

function installMediaFixtures() {
  const harness = window.__voiceHarness = { permission: 'allow', bytes: 2048, streams: [], recorders: [], audios: [], requests: [], deferred: [], createdUrls: [], revokedUrls: [], failPlayback: false, failConstructor: false };
  const emit = (target, type, values = {}) => {
    const event = new Event(type);
    for (const [key, value] of Object.entries(values)) Object.defineProperty(event, key, { value });
    target.dispatchEvent(event);
    target[`on${type}`]?.call(target, event);
  };
  const makeStream = () => {
    const track = { kind: 'audio', enabled: true, readyState: 'live', stops: 0, stop() { this.readyState = 'ended'; this.stops++; } };
    const stream = { getTracks: () => [track], getAudioTracks: () => [track], get active() { return track.readyState === 'live'; } };
    harness.streams.push(stream);
    return stream;
  };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: async constraints => {
      harness.requests.push(constraints);
      if (harness.permission === 'deny') throw new DOMException('Microphone permission denied', 'NotAllowedError');
      if (harness.permission === 'defer') return new Promise((resolve, reject) => harness.deferred.push({ resolve, reject }));
      return makeStream();
    },
  } });
  class FixtureRecorder extends EventTarget {
    static isTypeSupported(type) { return /^audio\/(webm|ogg|mp4)(?:;|$)/i.test(type); }
    constructor(stream, options = {}) {
      super();
      if (harness.failConstructor) throw new DOMException('Fixture encoder unavailable', 'NotSupportedError');
      this.stream = stream; this.mimeType = options.mimeType || 'audio/webm;codecs=opus'; this.state = 'inactive'; this.emittedBytes = 0;
      harness.recorders.push(this);
    }
    start(timeslice) { this.state = 'recording'; this.timeslice = timeslice; emit(this, 'start'); }
    chunk(bytes = harness.bytes) { this.emittedBytes += bytes; emit(this, 'dataavailable', { data: new Blob([new Uint8Array(bytes)], { type: this.mimeType }) }); }
    requestData() { if (this.state === 'recording') this.chunk(); }
    stop() {
      if (this.state === 'inactive') return;
      this.state = 'inactive';
      queueMicrotask(() => { if (!this.emittedBytes) this.chunk(); emit(this, 'stop'); });
    }
    fail() { emit(this, 'error', { error: new DOMException('Fixture microphone disconnected', 'NotReadableError') }); }
  }
  window.MediaRecorder = FixtureRecorder;
  class FixtureAudio extends EventTarget {
    constructor(src = '') { super(); this.src = src; this.currentTime = 0; this.duration = 3.2; this.paused = true; this.ended = false; this.playCalls = 0; this.pauseCalls = 0; harness.audios.push(this); }
    async play() {
      this.playCalls++;
      if (harness.failPlayback) { harness.failPlayback = false; throw new DOMException('Fixture playback unavailable', 'NotSupportedError'); }
      this.paused = false; this.ended = false; emit(this, 'play'); emit(this, 'playing');
    }
    pause() { this.pauseCalls++; this.paused = true; emit(this, 'pause'); }
    finish() { this.currentTime = this.duration; this.paused = true; this.ended = true; emit(this, 'ended'); }
    load() {}
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    canPlayType() { return 'probably'; }
  }
  window.Audio = FixtureAudio;
  const createUrl = URL.createObjectURL.bind(URL), revokeUrl = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = blob => { const url = createUrl(blob); harness.createdUrls.push(url); return url; };
  URL.revokeObjectURL = url => { harness.revokedUrls.push(url); revokeUrl(url); };
  harness.resolvePermission = () => { const pending = harness.deferred.shift(); if (!pending) throw new Error('No pending microphone permission'); pending.resolve(makeStream()); };
  harness.finishAudio = () => harness.audios.findLast(audio => !audio.paused)?.finish();
  harness.setHidden = hidden => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => hidden ? 'hidden' : 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  };
}

async function setupPage(browser, fakeMedia = true) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: true });
  page.setDefaultTimeout(7000);
  await page.route(/^https?:\/\//, route => route.abort());
  if (fakeMedia) {
    await page.clock.install();
    await page.addInitScript(installMediaFixtures);
  }
  await page.addInitScript(() => { window.__sent = []; window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) }; });
  await page.goto(fixtureUrl);
  return page;
}

async function authenticate(page) {
  await page.evaluate(({ member, mira, asha }) => {
    Native.receive({ type: 'session', data: member });
    Native.receive({ type: 'data.home', data: { hosts: [mira, asha], stage: [], featured: mira, total: 2, page: 1, categories: ['Music'], availableCount: 2 } });
  }, { member, mira, asha });
}

async function openThread(page, peer = mira, messages = [original], extra = {}) {
  await page.evaluate(({ peer, messages, extra }) => {
    zcOpen(peer.id);
    Native.receive({ type: 'data.thread', data: { with: peer.id, canSend: true, messages, ...extra } });
    document.getElementById('app-notice')?.remove();
  }, { peer, messages, extra });
  await page.locator('#ti').waitFor();
}

async function deterministicSuite() {
  const browser = await chromium.launch(launchOptions);
  const errors = [], screenshots = [];
  let page;
  try {
    page = await setupPage(browser);
    page.on('pageerror', error => errors.push(error.message));
    await authenticate(page);
    await openThread(page);
    const button = name => page.getByRole('button', { name, exact: true });
    const mic = button('Record voice message'), stop = button('Stop recording'), cancel = button('Cancel recording'), preview = button('Play recording'), voiceSend = button('Send voice message');
    const input = page.locator('#ti');
    const receive = (type, data) => page.evaluate(message => Native.receive(message), { type, data });
    const voiceRequests = () => page.evaluate(() => __sent.filter(message => message.type === 'chat.voice').map(message => message.data));
    const configure = values => page.evaluate(values => Object.assign(__voiceHarness, values), values);
    const audit = () => page.evaluate(() => ({ liveTracks: __voiceHarness.streams.flatMap(stream => stream.getTracks()).filter(track => track.readyState !== 'ended').length, activeRecorders: __voiceHarness.recorders.filter(recorder => recorder.state !== 'inactive').length, playing: __voiceHarness.audios.filter(audio => !audio.paused).length, mediaRequests: __voiceHarness.requests.length, openUrls: __voiceHarness.createdUrls.filter(url => !__voiceHarness.revokedUrls.includes(url)).length }));
    const idle = async label => {
      assert.ok(await mic.isVisible(), `${label}: the microphone action is available again`);
      assert.equal(await stop.isVisible(), false, `${label}: recording controls are removed`);
      assert.equal(await voiceSend.isVisible(), false, `${label}: no discarded clip can be sent`);
      const resources = await audit();
      assert.equal(resources.liveTracks, 0, `${label}: microphone tracks are stopped`);
      assert.equal(resources.activeRecorders, 0, `${label}: no recorder is active`);
      assert.equal(resources.playing, 0, `${label}: no audio keeps playing`);
      assert.equal(resources.openUrls, 0, `${label}: temporary recording URLs are released`);
    };
    const start = async () => { await mic.click(); await stop.waitFor(); assert.equal((await audit()).liveTracks, 1, 'Recording owns one microphone track'); };
    const record = async (durationMs = 1800) => { await start(); await page.clock.fastForward(durationMs); await stop.click(); await preview.waitFor(); assert.equal((await audit()).liveTracks, 0, 'Stopping recording immediately releases the microphone'); };
    const reset = async () => {
      await page.evaluate(() => ZimiChatVoice.cancel());
      await configure({ permission: 'allow', bytes: 2048, failPlayback: false, failConstructor: false });
      await openThread(page);
      await input.fill('');
    };
    const screenshot = async name => { const file = path.join(os.tmpdir(), name); await page.screenshot({ path: file }); screenshots.push(file); };
    const fits = async (selector, label) => {
      const metrics = await page.locator(selector).evaluate(element => {
        const box = element.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height, viewportWidth: innerWidth, viewportHeight: innerHeight };
      });
      assert.ok(metrics.width > 0 && metrics.height > 0 && metrics.top >= -1 && metrics.left >= -1 && metrics.bottom <= metrics.viewportHeight + 1 && metrics.right <= metrics.viewportWidth + 1, `${label} stays inside the keyboard-free viewport: ${JSON.stringify(metrics)}`);
    };

    // The one primary action follows text content without losing the draft.
    assert.ok(await mic.isVisible());
    assert.equal(await button('Send message').isVisible(), false);
    await input.fill('A text message');
    assert.ok(await button('Send message').isVisible());
    assert.equal(await mic.isVisible(), false);
    await input.fill('   ');
    assert.ok(await mic.isVisible(), 'Whitespace alone keeps the microphone action');
    await input.fill('');

    await record();
    assert.equal((await voiceRequests()).length, 0, 'Stopping creates a preview without sending audio');
    await preview.click();
    assert.equal((await audit()).playing, 1);
    await button('Pause recording').click();
    assert.equal((await audit()).playing, 0);
    await preview.click();
    await page.evaluate(() => __voiceHarness.finishAudio());
    await preview.waitFor();
    assert.equal((await audit()).playing, 0, 'Preview playback returns to Play when it ends');
    await cancel.click();
    await idle('Cancelled preview');

    await start();
    await page.clock.fastForward(1500);
    await cancel.click();
    await idle('Cancelled capture');
    assert.equal((await voiceRequests()).length, 0, 'Cancelling never sends recorded audio');

    await configure({ permission: 'deny' });
    await mic.click();
    await page.locator('#app-notice').waitFor();
    assert.match(await page.locator('#app-notice').innerText(), /microphone|permission|allow/i);
    await idle('Denied microphone permission');
    await configure({ permission: 'allow' });
    await record();
    await cancel.click();

    await configure({ failConstructor: true });
    await mic.click();
    await page.locator('#app-notice').waitFor();
    await idle('Encoder construction failure');
    await configure({ failConstructor: false });

    // A pending permission result cannot reopen a recorder in another conversation.
    await reset();
    await configure({ permission: 'defer' });
    await mic.click();
    await page.waitForFunction(() => __voiceHarness.deferred.length === 1);
    const recordersBefore = await page.evaluate(() => __voiceHarness.recorders.length);
    await openThread(page, asha, []);
    await page.evaluate(() => __voiceHarness.resolvePermission());
    await page.waitForFunction(() => __voiceHarness.streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')));
    assert.equal(await page.evaluate(() => __voiceHarness.recorders.length), recordersBefore, 'Late microphone permission cannot create a recorder for a stale peer');
    await idle('Stale permission result');
    await reset();

    await configure({ permission: 'defer' });
    await mic.click();
    await page.waitForFunction(() => __voiceHarness.deferred.length === 1);
    assert.equal(await page.evaluate(() => document.hidden), false);
    await receive('app.background', {});
    await page.evaluate(() => __voiceHarness.resolvePermission());
    await page.waitForFunction(() => __voiceHarness.streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')));
    await idle('Native background event cancels pending permission');
    await reset();

    await openThread(page, mira, [original, ownText]);
    await start();
    await page.evaluate(messageId => zcStartEdit(messageId), ownText.id);
    assert.equal(await page.evaluate(() => Chats.editing), null, 'Text editing cannot replace an active recording');
    assert.match(await page.locator('#app-notice').innerText(), /finish|cancel.*recording|recording.*edit/i);
    assert.ok(await stop.isVisible(), 'A blocked edit leaves capture running');
    await page.clock.fastForward(1800);
    await stop.click();
    await preview.waitFor();
    await page.evaluate(messageId => zcStartEdit(messageId), ownText.id);
    assert.equal(await page.evaluate(() => Chats.editing), null, 'Text editing cannot replace an unsent recording preview');
    assert.ok(await preview.isVisible());
    await cancel.click();
    await page.evaluate(messageId => zcStartEdit(messageId), ownText.id);
    assert.equal(await page.evaluate(() => Chats.editing?.id), ownText.id, 'Cancelling the recording makes text editing available');
    assert.equal(await input.inputValue(), ownText.text);
    await button('Cancel editing').click();
    await reset();

    await start();
    await page.clock.fastForward(120100);
    await preview.waitFor();
    assert.equal((await audit()).liveTracks, 0, 'The two-minute limit stops the microphone');
    await voiceSend.click();
    await page.waitForFunction(() => __sent.some(message => message.type === 'chat.voice'));
    const limited = (await voiceRequests()).at(-1);
    assert.ok(limited.durationMs > 119000 && limited.durationMs <= 120000, 'Automatic stop never reports more than120seconds');
    await receive('operation.error', { action: 'chat.voice', to: limited.to, clientId: limited.clientId, message: 'Fixture reset after duration check' });
    await cancel.click();
    await idle('Duration-limited clip discarded');

    const sendsBeforeOversize = (await voiceRequests()).length;
    await start();
    await page.clock.fastForward(1800);
    await page.evaluate(() => __voiceHarness.recorders.at(-1).chunk(5 * 1024 * 1024 + 1));
    await mic.waitFor();
    await idle('Recording exceeds5MiB');
    assert.equal((await voiceRequests()).length, sendsBeforeOversize, 'Oversize audio never crosses the native bridge');
    assert.match(await page.locator('#app-notice').innerText(), /large|size|5\s*(?:MB|MiB)|limit/i);

    // Send failures retain the same recording and retry identity, including reply.
    await reset();
    await openThread(page, mira, [original, ownText]);
    await page.evaluate(messageId => zcStartReply(messageId), original.id);
    await record();
    await voiceSend.click();
    await page.waitForFunction(count => __sent.filter(message => message.type === 'chat.voice').length > count, sendsBeforeOversize);
    const request = (await voiceRequests()).at(-1);
    assert.equal(request.to, mira.id);
    assert.equal(request.replyTo, original.id);
    assert.match(request.audio, /^data:audio\/(?:webm|ogg|mp4)(?:;codecs=[^;,]+)?;base64,/i);
    assert.ok(request.durationMs >= 1500 && request.durationMs < 5000);
    assert.ok(typeof request.clientId === 'string' && request.clientId.length >= 8, 'Each clip has an idempotent client identity');
    const countAfterSend = (await voiceRequests()).length;
    assert.ok(await page.locator('.zc-msg-voice .zc-voice-play').isDisabled(), 'Pending audio uses the recorder preview so an acknowledgement cannot strand playback under a temporary ID');
    await page.evaluate(() => ZimiChatVoice.play(S.msgs.find(message => message.local && message.kind === 'voice').id));
    assert.equal((await audit()).playing, 0, 'Pending optimistic voice playback is guarded');
    await page.evaluate(() => ZimiChatVoice.send());
    assert.equal((await voiceRequests()).length, countAfterSend, 'Sending twice while pending cannot duplicate the upload');
    await receive('operation.error', { action: 'chat.voice', to: mira.id, clientId: 'unrelated-clip', message: 'Unrelated failure' });
    assert.equal(await voiceSend.isVisible(), false, 'An unrelated failure cannot unlock the pending recording');
    await receive('operation.error', { action: 'chat.voice', to: request.to, clientId: request.clientId, message: 'Connection interrupted. Try again.' });
    await voiceSend.waitFor();
    assert.ok(await voiceSend.isEnabled(), 'A failed send offers the saved recording for retry');
    await page.evaluate(messageId => zcStartReply(messageId), ownText.id);
    assert.equal(await page.evaluate(() => Chats.reply?.id), original.id, 'A failed upload keeps its original reply target when another reply is selected');
    assert.match(await page.locator('#app-notice').innerText(), /retry or cancel.*voice message/i);
    await button('Cancel reply').click();
    assert.equal(await page.evaluate(() => Chats.reply?.id), original.id, 'Cancelling reply context cannot change an attempted voice upload');
    assert.match(await page.locator('#app-notice').innerText(), /retry or cancel.*voice message/i);
    assert.match(await page.locator('.zc-context').innerText(), /Send me your song idea/);
    await preview.click();
    assert.equal((await audit()).playing, 1, 'The unsent recording still has playable audio');
    await button('Pause recording').click();
    const permissionsBeforeRetry = (await audit()).mediaRequests;
    await voiceSend.click();
    const retry = (await voiceRequests()).at(-1);
    assert.deepEqual(retry, request, 'Retry keeps the exact audio, duration, reply and clientId');
    assert.equal((await audit()).mediaRequests, permissionsBeforeRetry, 'Retry does not ask to record again');
    const confirmedId = id('71');
    const serverReply = { id: original.id, mine: false, text: 'Authoritative original preview', image: false, deleted: false };
    await receive('chat.voiceSent', { to: asha.id, clientId: request.clientId, message: { id: id('99'), mine: true, kind: 'voice', audioUrl: 'https://media.invalid/wrong-peer.webm', durationMs: request.durationMs } });
    assert.equal(await page.locator(`#zc-m-${id('99')}`).count(), 0, 'An acknowledgement for another peer cannot enter this thread');
    await receive('chat.voiceSent', { to: mira.id, clientId: request.clientId, message: { id: confirmedId, mine: true, kind: 'voice', audioUrl: 'https://media.invalid/confirmed.webm', durationMs: request.durationMs, reply: serverReply } });
    await page.locator(`#zc-m-${confirmedId}.zc-msg-voice`).waitFor();
    assert.match(await page.locator(`#zc-m-${confirmedId} .zc-quote`).innerText(), /Authoritative original preview/);
    await idle('Acknowledged voice send');

    for (const removed of [false, true]) {
      await reset();
      await page.evaluate(messageId => zcStartReply(messageId), original.id);
      await record();
      await voiceSend.click();
      const staleReplyRequest = (await voiceRequests()).at(-1);
      await receive('operation.error', { action: 'chat.voice', to: mira.id, clientId: staleReplyRequest.clientId, message: 'The response was interrupted after storage' });
      if (removed) await receive('chat.removed', { with: mira.id, id: original.id });
      else await receive('chat.updated', { with: mira.id, message: { id: original.id, mine: false, kind: 'text', text: '', deleted: true } });
      const attemptsBeforeRetry = (await voiceRequests()).length;
      await voiceSend.click();
      assert.equal((await voiceRequests()).length, attemptsBeforeRetry + 1, `An attempted upload can retry after its original is ${removed ? 'hidden' : 'deleted'}`);
      assert.deepEqual((await voiceRequests()).at(-1), staleReplyRequest, 'A stale original cannot alter the already-attempted idempotent payload');
      const reply = { id: original.id, mine: false, text: '', deleted: true, image: false };
      const messageId = id(removed ? '79' : '78');
      await receive('chat.voiceSent', { to: mira.id, clientId: staleReplyRequest.clientId, message: { id: messageId, mine: true, kind: 'voice', text: '', audioUrl: 'https://media.invalid/stale-reply.webm', durationMs: staleReplyRequest.durationMs, reply } });
      assert.match(await page.locator(`#zc-m-${messageId} .zc-quote`).innerText(), /Deleted message/);
      await idle('Retry acknowledged after its original became unavailable');
    }

    // A server tombstone is still a successful idempotent acknowledgement.
    await reset();
    await record();
    await voiceSend.click();
    const deletedRequest = (await voiceRequests()).at(-1);
    const tombstoneId = id('74');
    await receive('chat.voiceSent', { to: mira.id, clientId: deletedRequest.clientId, message: { id: tombstoneId, mine: true, kind: 'text', text: '', deleted: true, audioUrl: '', durationMs: 0, reply: null } });
    const tombstone = page.locator(`#zc-m-${tombstoneId}`);
    await tombstone.waitFor();
    assert.match(await tombstone.innerText(), /deleted this message/i, 'A deleted voice acknowledgement displays its tombstone');
    assert.equal(await tombstone.locator('.zc-voice,[aria-haspopup="dialog"]').count(), 0, 'A tombstone exposes no stale audio or message actions');
    await idle('Acknowledged deleted voice message');

    const history = [original,
      { id: id('72'), mine: false, kind: 'voice', audioUrl: 'https://media.invalid/one.webm', durationMs: 3200, createdAt: new Date().toISOString() },
      { id: id('73'), mine: true, kind: 'voice', audioUrl: 'https://media.invalid/two.webm', durationMs: 7200, createdAt: new Date().toISOString(), status: 'read' },
    ];
    await openThread(page, mira, history);
    const firstPlay = page.locator(`#zc-m-${id('72')} .zc-voice-play`), secondPlay = page.locator(`#zc-m-${id('73')} .zc-voice-play`);
    const touch = await page.context().newCDPSession(page);
    const touchPoint = async target => {
      await target.scrollIntoViewIfNeeded();
      const box = await target.boundingBox();
      assert.ok(box, 'A voice gesture starts on a visible control');
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const touchStart = point => touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    const touchEnd = () => touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const touchTap = async target => { await touchStart(await touchPoint(target)); await touchEnd(); };
    const options = page.getByRole('dialog', { name: 'Message options' });
    for (const [messageId, direction, expectedOptions] of [
      [id('72'), 1, ['Reply', 'Delete for me', 'Cancel']],
      [id('73'), -1, ['Reply', 'Delete for everyone', 'Delete for me', 'Cancel']],
    ]) {
      const card = page.locator(`#zc-m-${messageId} .zc-voice`);
      await card.scrollIntoViewIfNeeded();
      const box = await card.boundingBox();
      const point = { x: box.x + Math.min(46, box.width / 2), y: box.y + box.height / 2 };
      const swipe = async dx => {
        assert.ok(point.x + dx >= 8 && point.x + dx <= page.viewportSize().width - 8, 'Both gesture directions stay inside the screen');
        await touchStart(point);
        for (let step = 1; step <= 8; step++) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + dx * step / 8, y: point.y }] });
        await touchEnd();
      };
      await swipe(-direction * 84);
      assert.equal(await page.evaluate(() => Chats.reply?.id ?? null), null, 'The opposite swipe direction cannot select a voice reply');
      assert.equal(await options.count(), 0, 'The opposite swipe direction cannot open message options');
      assert.equal((await audit()).playing, 0, 'The opposite swipe direction cannot trigger audio playback');
      await swipe(direction * 84);
      assert.equal(await page.evaluate(() => Chats.reply?.id), messageId, direction === 1 ? 'Incoming voice messages reply on a right swipe' : 'Own voice messages reply on a left swipe');
      assert.equal(await options.count(), 0, 'A reply swipe cannot open message options');
      assert.match(await page.locator('.zc-context').innerText(), /Voice message/, 'Reply context identifies an audio original');
      assert.equal((await audit()).playing, 0, 'Swiping across an audio control cannot start playback');
      await button('Cancel reply').click();

      // Hold directly on Play: its release must keep options open without playing.
      await touchStart(await touchPoint(card.locator('.zc-voice-play')));
      try { await page.clock.fastForward(500); await options.waitFor(); }
      finally { await touchEnd(); }
      assert.equal(await page.evaluate(() => Chats.menu), messageId);
      assert.deepEqual(await options.getByRole('button').allInnerTexts(), expectedOptions, 'Voice options allow reply/delete, never text editing');
      assert.equal((await audit()).playing, 0, 'Holding Play opens options without starting audio on release');
      await touchTap(options.getByRole('button', { name: 'Cancel', exact: true }));
      assert.equal(await options.count(), 0, 'The next deliberate touch can close voice options');
    }
    await touchTap(firstPlay);
    assert.equal((await audit()).playing, 1, 'A plain touch tap on Play starts audio');
    await touchTap(firstPlay);
    assert.equal((await audit()).playing, 0, 'A second touch tap pauses audio');
    await touch.detach();

    await firstPlay.click();
    assert.equal((await audit()).playing, 1);
    assert.match(await firstPlay.getAttribute('aria-label'), /pause/i);
    await secondPlay.click();
    assert.equal((await audit()).playing, 1, 'Only one received voice message plays at a time');
    assert.match(await firstPlay.getAttribute('aria-label'), /play/i);
    assert.match(await secondPlay.getAttribute('aria-label'), /pause/i);
    await secondPlay.click();
    assert.equal((await audit()).playing, 0, 'Tapping the playing message pauses it');
    await firstPlay.click();
    await page.evaluate(() => __voiceHarness.finishAudio());
    assert.match(await firstPlay.getAttribute('aria-label'), /play/i);
    assert.equal((await audit()).playing, 0, 'Ended playback resets the voice message control');
    await configure({ failPlayback: true });
    await secondPlay.click();
    await page.locator('#app-notice').waitFor();
    assert.equal((await audit()).playing, 0, 'Playback failures leave no stuck playing state');
    assert.match(await secondPlay.getAttribute('aria-label'), /play/i);
    await firstPlay.click();
    assert.equal(await page.evaluate(() => document.hidden), false);
    await receive('app.background', {});
    assert.equal((await audit()).playing, 0, 'Native background notification pauses received audio even when document.hidden is false');
    await firstPlay.click();
    await page.evaluate(() => go('chats'));
    assert.equal((await audit()).playing, 0, 'Leaving a thread pauses received audio');

    for (const { messageId, everyone } of [
      { messageId: id('72'), everyone: false },
      { messageId: id('73'), everyone: false },
      { messageId: id('73'), everyone: true },
    ]) {
      // Each iteration restores an independent server fixture after its prior deletion.
      await page.evaluate(()=>Chats.hidden.clear());
      await openThread(page, mira, history);
      const message = page.locator(`#zc-m-${messageId}`);
      await message.locator('.zc-voice-play').click();
      assert.equal((await audit()).playing, 1);
      await message.getByRole('button', { name: 'Voice message options', exact: true }).click();
      await options.getByRole('button', { name: everyone ? 'Delete for everyone' : 'Delete for me', exact: true }).click();
      assert.equal((await audit()).playing, 0, 'Deleting a playing voice message stops audio immediately, without waiting for acknowledgement');
      assert.deepEqual(await page.evaluate(() => __sent.filter(message => message.type === 'chat.delete').at(-1).data), { to: mira.id, id: messageId, everyone });
      if (everyone) assert.match(await message.innerText(), /deleted this message/i);
      else assert.equal(await message.count(), 0, 'Delete for me removes the playing voice card immediately');
    }

    // Losing the current screen, session or foreground always releases the mic.
    for (const reason of ['navigation', 'background', 'app.background', 'session.none', 'session.expired']) {
      await authenticate(page);
      await reset();
      await start();
      await page.clock.fastForward(1000);
      if (reason === 'navigation') await page.evaluate(() => go('chats'));
      else if (reason === 'background') await page.evaluate(() => __voiceHarness.setHidden(true));
      else {
        if (reason === 'app.background') assert.equal(await page.evaluate(() => document.hidden), false);
        await receive(reason, {});
      }
      const resources = await audit();
      assert.equal(resources.liveTracks, 0, `${reason}: the microphone is released`);
      assert.equal(resources.activeRecorders, 0, `${reason}: recording is stopped`);
      assert.equal(resources.openUrls, 0, `${reason}: no recording URL is retained`);
      await page.evaluate(() => __voiceHarness.setHidden(false));
    }
    await authenticate(page);
    await reset();
    await record();
    await preview.click();
    await receive('app.background', {});
    assert.equal((await audit()).playing, 0, 'Native background notification pauses preview audio');
    await preview.click();
    await page.evaluate(() => __voiceHarness.setHidden(true));
    assert.equal((await audit()).playing, 0, 'Backgrounding pauses preview audio');
    await page.evaluate(() => __voiceHarness.setHidden(false));
    await reset();
    await openThread(page, mira, [original], { canSend: false, sendDisabledReason: 'This conversation is read-only.' });
    const permissionsBeforeBlock = (await audit()).mediaRequests;
    await page.evaluate(() => ZimiChatVoice.start());
    assert.equal((await audit()).mediaRequests, permissionsBeforeBlock, 'A read-only thread cannot request microphone access');

    // Record/preview controls and reply context fit a narrow keyboard viewport.
    await reset();
    await page.setViewportSize({ width: 320, height: 420 });
    await fits('.zc-composer', 'Empty composer');
    await input.fill('Text still fits');
    await fits('.zc-composer', 'Text composer');
    await input.fill('');
    await page.evaluate(messageId => zcStartReply(messageId), original.id);
    await start();
    await fits('#zc-recording', 'Recording controls');
    await fits('.zc-context', 'Recording reply context');
    await screenshot('zimi-chat-voice-recording-320.png');
    await page.clock.fastForward(1800);
    await stop.click();
    await preview.waitFor();
    await fits('#zc-recording', 'Recording preview controls');
    for (const control of [cancel, preview, voiceSend]) {
      const box = await control.boundingBox();
      assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 321 && box.y + box.height <= 421, 'Every preview action remains visible above the keyboard');
    }
    await screenshot('zimi-chat-voice-preview-320.png');
    await cancel.click();
    await idle('Final cleanup');

    const themes = await page.evaluate(() => [ZThemeOriginal, ZThemeRose]);
    await receive('data.themes', { items: themes, selectedThemeId: themes[1].id, premium: { active: false } });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await openThread(page, mira, history);
      await input.fill('');
      assert.ok(await mic.isVisible());
      await fits('.zc-composer', `${width}px light idle composer`);
      const incomingBox = await page.locator(`#zc-m-${id('72')} .zc-voice`).boundingBox();
      const ownBox = await page.locator(`#zc-m-${id('73')} .zc-voice`).boundingBox();
      assert.ok(ownBox.x > incomingBox.x && ownBox.x + ownBox.width <= width, 'Own and incoming voice cards align to their conversation sides');
      await screenshot(`zimi-chat-voice-idle-light-${width}.png`);
      await input.fill('That sounds lovely!');
      assert.ok(await button('Send message').isVisible());
      await fits('.zc-composer', `${width}px light text composer`);
      await screenshot(`zimi-chat-voice-typed-light-${width}.png`);
    }

    // A history refresh can beat the upload response, including after a response
    // failed even though the server stored the clip. Retry must still render once.
    for (const retryAfterHistory of [false, true]) {
      await reset();
      await record();
      await voiceSend.click();
      const racedRequest = (await voiceRequests()).at(-1);
      if (retryAfterHistory) await receive('operation.error', { action: 'chat.voice', to: mira.id, clientId: racedRequest.clientId, message: 'Upload response interrupted' });
      const serverMessage = { id: id(retryAfterHistory ? '77' : '76'), mine: true, kind: 'voice', text: '', audioUrl: 'https://media.invalid/race.webm', durationMs: racedRequest.durationMs, createdAt: new Date().toISOString(), status: 'sent' };
      await receive('data.thread', { with: mira.id, canSend: true, messages: [original, serverMessage] });
      assert.equal(await page.locator(`#zc-m-${serverMessage.id}`).count(), 1, 'The server history initially contains one copy');
      if (retryAfterHistory) {
        await voiceSend.click();
        assert.equal((await voiceRequests()).at(-1).clientId, racedRequest.clientId, 'History refresh preserves the clip retry identity');
      }
      await receive('chat.voiceSent', { to: mira.id, clientId: racedRequest.clientId, message: serverMessage });
      assert.equal(await page.locator(`#zc-m-${serverMessage.id}.zc-msg-voice`).count(), 1, `History arriving before ${retryAfterHistory ? 'retry' : 'first'} acknowledgement cannot duplicate a voice bubble`);
      assert.equal(await page.evaluate(() => S.msgs.filter(message => message.local && message.clientId).length), 0, 'Acknowledgement consumes any optimistic copy');
      await idle('History/acknowledgement race settled');
    }
    assert.deepEqual(errors, [], 'Voice interactions produce no uncaught browser errors');
    console.log('PASS chat voice fixtures: composer, capture/preview/cancel, permission races,120s/5MiB limits, reply send/retry/ack, playback, lifecycle cleanup, and narrow keyboard layout.');
    console.log(screenshots.join('\n'));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(os.tmpdir(), 'zimi-chat-voice-failure.png') }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
}

async function nativeRecorderSmoke() {
  // Chromium's synthetic audio device exercises the real browser encoder without
  // opening a physical microphone or sending the resulting clip to a server.
  const browser = await chromium.launch({ ...launchOptions, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  try {
    const page = await setupPage(browser, false);
    await authenticate(page);
    await openThread(page);
    const supported = await page.evaluate(() => !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder === 'function');
    if (!supported) { console.log('SKIP native recorder smoke: this browser does not expose MediaRecorder/getUserMedia.'); return; }
    await page.addScriptTag({ content: `window.__nativeVoiceStreams=[];const originalGetUserMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async options=>{const stream=await originalGetUserMedia(options);__nativeVoiceStreams.push(stream);return stream};` });
    await page.getByRole('button', { name: 'Record voice message', exact: true }).click();
    await page.getByRole('button', { name: 'Stop recording', exact: true }).waitFor();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
    await page.getByRole('button', { name: 'Play recording', exact: true }).waitFor();
    assert.ok(await page.evaluate(() => __nativeVoiceStreams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))), 'Real recording stops every synthetic microphone track');
    await page.getByRole('button', { name: 'Send voice message', exact: true }).click();
    await page.waitForFunction(() => __sent.some(message => message.type === 'chat.voice'));
    const request = await page.evaluate(() => __sent.findLast(message => message.type === 'chat.voice').data);
    const bytes = Buffer.from(request.audio.split(',')[1], 'base64');
    assert.ok(bytes.length > 100, 'The real browser encoder produces a nonempty audio container');
    assert.ok(request.durationMs >= 1000 && request.durationMs < 5000);
    const decoded = await page.evaluate(async data => {
      const context = new AudioContext();
      try { const buffer = await context.decodeAudioData(await (await fetch(data)).arrayBuffer()); return { duration: buffer.duration, channels: buffer.numberOfChannels }; }
      finally { await context.close(); }
    }, request.audio);
    assert.ok(decoded.duration > 0.5 && decoded.channels >= 1, 'The real encoded recording can be decoded as audio');
    const extension = request.audio.startsWith('data:audio/mp4') ? 'm4a' : request.audio.startsWith('data:audio/ogg') ? 'ogg' : 'webm';
    const file = path.join(os.tmpdir(), `zimi-voice-native-ui-fixture.${extension}`);
    fs.writeFileSync(file, bytes);
    console.log(`PASS real Chromium MediaRecorder UI smoke: ${bytes.length}bytes,${Math.round(decoded.duration * 1000)}ms decoded audio; ${file}`);
  } finally { await browser.close(); }
}

(async () => { await deterministicSuite(); await nativeRecorderSmoke(); })().catch(error => { console.error(error); process.exitCode = 1; });
