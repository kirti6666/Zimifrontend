/* Native controller boundary tests: no phone, camera, account or network use. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let count = 0; count < 30; count++) await Promise.resolve(); };

function fixture(options = {}) {
  const calls = [], events = [], states = [], peers = [], captures = [], timers = new Map();
  let now = 1000, trackId = 0, streamId = 0, requestId = 0, beautyListener;
  class Track {
    constructor(kind, settings = {}) { this.id = `track-${++trackId}`; this.kind = kind; this.enabled = true; this.readyState = 'live'; this.settings = settings; this.effects = []; this.volume = 1; }
    stop() { this.readyState = 'ended'; calls.push(['stop', this.id]); }
    getSettings() { return { ...this.settings }; }
    async applyConstraints(next) { calls.push(['constraints', this.id, plain(next)]); if (options.flip) await options.flip.promise; this.settings = { ...this.settings, ...next }; }
    _setVideoEffects(names) { this.effects = [...names]; calls.push(['effects', this.id, [...names]]); }
    _setVolume(value) { this.volume = value; }
  }
  class Stream {
    constructor(tracks = []) { this.id = `stream-${++streamId}`; this.tracks = [...tracks]; this.released = false; }
    getTracks() { return [...this.tracks]; }
    getVideoTracks() { return this.tracks.filter(track => track.kind === 'video'); }
    getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio'); }
    addTrack(track) { if (!this.tracks.includes(track)) this.tracks.push(track); }
    removeTrack(track) { this.tracks = this.tracks.filter(current => current !== track); }
    release(stop = true) { this.released = true; if (stop) this.tracks.forEach(track => track.stop()); this.tracks = []; }
    toURL() { return this.id; }
  }
  function makeStream(video = true, audio = true) { return new Stream([...(audio ? [new Track('audio')] : []), ...(video ? [new Track('video', { width: 1920, height: 1440, frameRate: 30, facingMode: 'user' })] : [])]); }
  class Peer {
    constructor(config) { this.config = config; this.handlers = {}; this.senders = []; this.addedCandidates = []; this.signalingState = 'stable'; this.connectionState = 'new'; this.iceConnectionState = 'new'; this.localDescription = this.remoteDescription = null; this.stats = new Map(); peers.push(this); }
    addTrack(track) {
      const sender = { track, params: { encodings: [{ active: true }], degradationPreference: null }, getParameters() { return structuredClone(this.params); }, async setParameters(params) { this.params = params; calls.push(['parameters', track.kind, plain(params)]); } };
      this.senders.push(sender); return sender;
    }
    getSenders() { return this.senders; }
    addEventListener(type, handler) { (this.handlers[type] ||= []).push(handler); }
    emit(type, event) { this.handlers[type]?.forEach(handler => handler(event)); }
    async createOffer(config) { calls.push(['offer', config]); return { type: 'offer', sdp: 'native-offer' }; }
    async createAnswer() { calls.push(['answer']); return { type: 'answer', sdp: 'native-answer' }; }
    async setLocalDescription(description) { if (options.description) await options.description.promise; this.localDescription = description; this.signalingState = description.type === 'offer' ? 'have-local-offer' : 'stable'; }
    async setRemoteDescription(description) { this.remoteDescription = description; this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable'; }
    async addIceCandidate(candidate) { this.addedCandidates.push(candidate); }
    getStats() { return Promise.resolve(this.stats); }
    close() { this.signalingState = this.connectionState = this.iceConnectionState = 'closed'; }
  }
  const beauty = {
    BEAUTY_PROCESSOR: 'facebetter', beautySupported: () => options.supported !== false,
    applyBeauty: commands => calls.push(['beauty', plain(commands)]),
    setBeautyEnabled: enabled => calls.push(['beautyEnabled', enabled]),
    configureBeauty: token => calls.push(['configure', token]),
    startCallAudio: video => calls.push(['startCallAudio', video]), stopCallAudio: () => calls.push(['stopCallAudio']),
    releaseBeauty: async () => { calls.push(['releaseBeauty']); if (options.release) await options.release.promise; },
    onBeautyStatus: listener => { beautyListener = listener; return { remove() { calls.push(['unsubscribe']); } }; },
  };
  const api = {
    rtcConfig: async () => { calls.push(['iceConfig']); return options.config ? options.config.promise : { iceServers: [{ urls: 'stun:example.test' }] }; },
    beautyAuthAndroid: async () => { calls.push(['androidAuth']); if (options.authFailure) throw new Error('Unavailable'); return options.license ? options.license.promise : { licenseToken: 'fixture-token' }; },
  };
  const mediaDevices = {
    getUserMedia: async constraints => { captures.push(plain(constraints)); return options.capture ? options.capture.promise : makeStream(!!constraints.video, !!constraints.audio); },
  };
  const clock = { ...Date, now: () => now };
  const module = { exports: {} };
  const filename = path.join(__dirname, '../src/native-media/controller.ts');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const timeout = (work, delay, interval) => { const id = Symbol(); timers.set(id, { work, delay, interval }); return id; };
  vm.runInNewContext(code, {
    module, exports: module.exports, console, Date: clock,
    setTimeout: (work, delay) => timeout(work, delay, false), setInterval: (work, delay) => timeout(work, delay, true),
    clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
    require: name => {
      if (name === 'react-native-webrtc') return { mediaDevices, MediaStream: Stream, RTCPeerConnection: Peer };
      if (name === '../api/endpoints') return { api };
      if (name === '../../modules/binzo-media') return beauty;
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { filename });
  const controller = module.exports.createNativeMedia(event => {
    events.push(event);
    if (event.type === 'rtc.signal' && event.data.description) {
      const video = peers.at(-1)?.getSenders().find(sender => sender.track.kind === 'video');
      calls.push(['signaled', event.data.description.type, video ? plain(video.params) : null]);
    }
  }, state => states.push({ ...state }));
  async function rpc(action, data = {}) { const id = ++requestId; await controller.handle({ action, requestId: id, data }); return events.find(event => event.type === 'native.media.result' && event.data.requestId === id)?.data; }
  async function connect(data = {}) { controller.event({ type: 'call.connected', data: { callId: 'call-one', peerId: 'peer-one', initiator: true, ...data } }); await flush(); return peers.at(-1); }
  async function tick(delay) { now += delay; const found = [...timers].filter(([, timer]) => timer.delay === delay); found.forEach(([id, timer]) => { if (!timer.interval) timers.delete(id); timer.work(); }); await flush(); }
  return { controller, rpc, connect, tick, calls, events, states, peers, captures, timers, makeStream, Track, Stream, beautyListener: status => beautyListener(status), state: () => states.at(-1) };
}

test('native capture uses reference framing; preview and sender share one GPU-processed camera track', async () => {
  const h = fixture();
  await h.rpc('beauty', { enabled: true, settings: [['setSmoothing', [.6]]] });
  const response = await h.rpc('prepare', { video: true }); await flush();
  assert.equal(response.result.hasVideo, true);
  assert.deepEqual(h.captures, [{ audio: true, video: { width: 1920, height: 1440, frameRate: 30, facingMode: 'user' } }]);
  const local = h.state().local, video = local.getVideoTracks()[0], microphone = local.getAudioTracks()[0];
  assert.deepEqual(video.effects, ['facebetter']);
  assert.equal(h.calls.filter(call => call[0] === 'configure').length, 1);
  await h.rpc('prepare', { video: true }); await flush();
  assert.equal(h.captures.length, 1, 'Reusing preview does not open another camera');
  assert.equal(h.calls.filter(call => call[0] === 'androidAuth').length, 1, 'An active licensed processor does not repeatedly fetch a token');
  assert.equal(h.calls.some(call => call[0] === 'startCallAudio'), false, 'Camera preview does not change the device audio route');
  const pc = await h.connect();
  assert.deepEqual(h.calls.find(call => call[0] === 'startCallAudio'), ['startCallAudio', true]);
  assert.equal(pc.getSenders().find(sender => sender.track.kind === 'video').track, video);
  assert.equal(pc.getSenders().find(sender => sender.track.kind === 'audio').track, microphone);
  const videoParameters = pc.getSenders().find(sender => sender.track.kind === 'video').params;
  assert.equal(videoParameters.encodings[0].maxBitrate, 2500000);
  assert.equal(videoParameters.encodings[0].maxFramerate, 30);
  assert.equal(videoParameters.encodings[0].scaleResolutionDownBy, 1);
  assert.equal(videoParameters.degradationPreference, 'maintain-resolution');
  assert.deepEqual(h.calls.find(call => call[0] === 'signaled')[2], plain(videoParameters), '1080p limits are applied before signaling the first offer');
  assert.equal(h.calls.some(call => call[0] === 'parameters' && call[1] === 'audio'), false);
  await h.rpc('controls', { camera: false, microphone: false });
  assert.equal(video.enabled, false); assert.equal(microphone.enabled, false);
  const flip = await h.rpc('flipCamera');
  assert.equal(flip.result.facing, 'environment');
  assert.equal(local.getVideoTracks()[0], video, 'Camera flip keeps the preview and RTP track stable');
  h.controller.close(); await flush();
  assert.equal(video.readyState, 'ended'); assert.equal(microphone.readyState, 'ended');
  assert.equal(h.timers.size, 0);
  assert.equal(h.calls.filter(call => call[0] === 'stopCallAudio').length, 1);
});

test('hangup during camera acquisition stops a late stream and rejects the pending RPC', async () => {
  const capture = deferred(), h = fixture({ capture });
  const pending = h.rpc('prepare', { video: true }); await flush();
  h.controller.stop();
  const opened = h.makeStream(), tracks = opened.getTracks(); capture.resolve(opened);
  const result = await pending; await flush();
  assert.match(result.error, /cancelled/);
  assert.ok(tracks.every(track => track.readyState === 'ended'));
  assert.equal(h.state().local, null);
  assert.equal(h.events.some(event => event.type === 'rtc.signal'), false);
  h.controller.close();
});

test('hangup invalidates a pending ICE configuration and never constructs or signals a peer', async () => {
  const config = deferred(), h = fixture({ config });
  await h.rpc('prepare', { video: true });
  h.controller.event({ type: 'call.connected', data: { callId: 'call-one', peerId: 'peer-one', initiator: true } }); await flush();
  h.controller.event({ type: 'call.ended', data: { callId: 'call-one' } });
  config.resolve({ iceServers: [] }); await flush();
  assert.equal(h.peers.length, 0);
  assert.equal(h.events.some(event => event.type === 'rtc.signal'), false);
  assert.equal(h.state().local, null);
  h.controller.close();
});

test('early ICE waits for the matching remote description; foreign callers cannot alter negotiation', async () => {
  const h = fixture();
  h.controller.event({ type: 'call.incoming', data: { callId: 'call-one' } });
  const candidate = { candidate: 'candidate:early', sdpMid: '0', sdpMLineIndex: 0 };
  h.controller.event({ type: 'rtc.signal', data: { callId: 'call-one', from: 'peer-one', candidate } });
  const pc = await h.connect({ initiator: false });
  assert.equal(pc.addedCandidates.length, 0);
  h.controller.event({ type: 'rtc.signal', data: { callId: 'call-one', from: 'foreign-peer', description: { type: 'offer', sdp: 'foreign' } } }); await flush();
  assert.equal(pc.remoteDescription, null);
  h.controller.event({ type: 'rtc.signal', data: { callId: 'call-one', from: 'peer-one', description: { type: 'offer', sdp: 'remote-offer' } } }); await flush();
  assert.deepEqual(plain(pc.addedCandidates), [candidate]);
  assert.equal(pc.remoteDescription.sdp, 'remote-offer');
  assert.ok(h.events.some(event => event.type === 'rtc.signal' && event.data.description?.type === 'answer'));
  const signaledAnswer = h.calls.find(call => call[0] === 'signaled' && call[1] === 'answer')[2];
  assert.equal(signaledAnswer.encodings[0].maxBitrate, 2500000);
  assert.equal(signaledAnswer.encodings[0].scaleResolutionDownBy, 1, 'The answering side starts at full1080p too');
  const offerWrites = h.calls.filter(call => call[0] === 'offer'); assert.equal(offerWrites.length, 0);
  h.controller.close(); await flush();
});

test('native beauty authorization failure preserves raw call tracks; a stale license never configures a retired camera', async () => {
  for (const authFailure of [true, false]) {
    const license = deferred(), h = fixture({ authFailure, license });
    await h.rpc('beauty', { enabled: true, settings: [['setWhitening', [.3]]] });
    await h.rpc('prepare', { video: true }); await flush();
    const tracks = h.state().local.getTracks();
    if (authFailure) {
      assert.equal(h.state().beautyStatus, 'authFailed');
      assert.ok(tracks.every(track => track.readyState === 'live' && track.enabled));
      assert.equal(h.events.some(event => event.type === 'call.end'), false);
    } else {
      h.controller.stop(); license.resolve({ licenseToken: 'late-token' }); await flush();
      assert.equal(h.calls.some(call => call[0] === 'configure'), false);
      assert.ok(tracks.every(track => track.readyState === 'ended'));
    }
    h.controller.close(); await flush();
  }
});

test('voice calls never capture video or authorize beauty; split remote streams merge and honor playback mute', async () => {
  const h = fixture();
  await h.rpc('beauty', { enabled: true, settings: [['setSmoothing', [.6]]] });
  const pc = await h.connect({ voice: true });
  assert.deepEqual(h.captures, [{ audio: true, video: false }]);
  assert.equal(h.calls.some(call => call[0] === 'androidAuth'), false);
  assert.deepEqual(pc.getSenders().map(sender => sender.track.kind), ['audio']);
  assert.deepEqual(h.calls.find(call => call[0] === 'startCallAudio'), ['startCallAudio', false]);
  const audio = new h.Track('audio'), video = new h.Track('video');
  pc.emit('track', { track: audio, streams: [new h.Stream([audio])] });
  assert.equal(h.state().remoteVideo, false);
  await h.rpc('setPlaybackMuted', { muted: true }); assert.equal(audio.volume, 0);
  pc.emit('track', { track: video, streams: [new h.Stream([video])] });
  assert.deepEqual(h.state().remote.getTracks().map(track => track.kind), ['audio', 'video']);
  assert.equal(h.state().remoteVideo, true);
  await h.rpc('setPlaybackMuted', { muted: false }); assert.equal(audio.volume, 1);
  h.controller.close(); await flush();
});

test('Retry and an off/on toggle retire a rejected native engine even with the same offline token', async () => {
  for (const toggle of [false, true]) {
  const h = fixture();
  const command = { enabled: true, settings: [['setSmoothing', [.6]]] };
  await h.rpc('beauty', command); await h.rpc('prepare', { video: true }); await flush();
  const track = h.state().local.getVideoTracks()[0], initialConfigure = h.calls.filter(call => call[0] === 'configure').length;
  h.beautyListener('authFailed');
  if (toggle) await h.rpc('beauty', { ...command, enabled: false });
  await h.rpc('beauty', command); await flush();
  assert.equal(h.calls.filter(call => call[0] === 'configure').length, initialConfigure + 1);
  const release = h.calls.findIndex(call => call[0] === 'releaseBeauty');
  assert.ok(release > 0);
  assert.ok(h.calls.slice(release + 1).some(call => call[0] === 'configure' && call[1] === 'fixture-token'));
  assert.equal(h.state().local.getVideoTracks()[0], track); assert.equal(track.readyState, 'live');
  assert.equal(h.captures.length, 1);
  h.controller.close(); await flush();
  }
});

test('handoff preserves camera and microphone; mismatched terminal events cannot end the next call', async () => {
  const h = fixture(), pc = await h.connect();
  const local = h.state().local, tracks = local.getTracks();
  await h.rpc('handoff', { callId: 'call-one' });
  h.controller.event({ type: 'call.ended', data: { callId: 'call-one' } }); await flush();
  assert.equal(pc.connectionState, 'closed'); assert.equal(h.state().local, local);
  assert.ok(tracks.every(track => track.readyState === 'live'));
  const next = await h.connect({ callId: 'call-two' });
  assert.equal(h.captures.length, 1);
  h.controller.event({ type: 'call.ended', data: { callId: 'call-one' } }); await flush();
  assert.notEqual(next.connectionState, 'closed'); assert.equal(h.state().local, local);
  h.controller.close(); await flush();
});

test('only the initiator restarts ICE, recovery is bounded, and cleanup cancels timers', async () => {
  for (const initiator of [true, false]) {
    const h = fixture(), pc = await h.connect({ initiator });
    if (initiator) {
      h.controller.event({ type: 'rtc.signal', data: { callId: 'call-one', from: 'peer-one', description: { type: 'answer', sdp: 'initial-answer' } } }); await flush();
    }
    pc.connectionState = pc.iceConnectionState = 'disconnected'; pc.onconnectionstatechange();
    await h.tick(3000);
    assert.equal(h.calls.some(call => call[0] === 'offer' && call[1]?.iceRestart), initiator);
    for (let count = 0; count < 9; count++) await h.tick(3000);
    assert.equal(h.events.filter(event => event.type === 'call.end').length, 1);
    assert.equal(h.state().local, null); assert.equal(h.timers.size, 0);
    h.controller.close(); await flush();
  }
});

test('native RTP adaptation uses sustained receiver evidence and never treats a repeated report as recovery', async () => {
  const h = fixture(), pc = await h.connect();
  pc.connectionState = pc.iceConnectionState = 'connected'; pc.onconnectionstatechange();
  const stats = (timestamp, loss) => new Map([
    ['transport', { id: 'transport', type: 'transport', timestamp, selectedCandidatePairId: 'pair' }],
    ['pair', { id: 'pair', type: 'candidate-pair', timestamp, currentRoundTripTime: .1 }],
    ['receiver', { id: 'receiver', type: 'remote-inbound-rtp', timestamp, fractionLost: loss }],
  ]);
  pc.stats = stats(1, .3); await h.tick(2000);
  assert.equal(pc.getSenders().find(sender => sender.track.kind === 'video').params.encodings[0].maxBitrate, 2500000);
  pc.stats = stats(2, .3); await h.tick(2000);
  assert.equal(pc.getSenders().find(sender => sender.track.kind === 'video').params.encodings[0].maxBitrate, 450000);
  for (let count = 0; count < 4; count++) await h.tick(2000);
  assert.equal(pc.getSenders().find(sender => sender.track.kind === 'video').params.encodings[0].maxBitrate, 450000);
  for (let timestamp = 3; timestamp <= 5; timestamp++) { pc.stats = stats(timestamp, 0); await h.tick(2000); }
  assert.equal(pc.getSenders().find(sender => sender.track.kind === 'video').params.encodings[0].maxBitrate, 900000);
  assert.equal(pc.getSenders().find(sender => sender.track.kind === 'video').params.degradationPreference, 'maintain-framerate');
  pc.stats = stats(6, 0); await h.tick(2000);
  assert.equal(pc.getSenders().find(sender => sender.track.kind === 'video').params.encodings[0].maxBitrate, 1800000);
  assert.equal(pc.getSenders().find(sender => sender.track.kind === 'video').params.encodings[0].scaleResolutionDownBy, 1920 / 1280);
  pc.stats = stats(7, 0); await h.tick(2000);
  assert.equal(pc.getSenders().find(sender => sender.track.kind === 'video').params.encodings[0].maxBitrate, 2500000);
  assert.equal(pc.getSenders().find(sender => sender.track.kind === 'video').params.encodings[0].scaleResolutionDownBy, 1);
  assert.equal(pc.getSenders().find(sender => sender.track.kind === 'video').params.degradationPreference, 'maintain-resolution');
  h.controller.close(); await flush();
});

test('sustained encoder CPU pressure lowers 1080p to the 720p profile while keeping 30fps motion', async () => {
  const h = fixture(), pc = await h.connect();
  pc.connectionState = pc.iceConnectionState = 'connected'; pc.onconnectionstatechange();
  const video = pc.getSenders().find(sender => sender.track.kind === 'video');
  for (const timestamp of [1, 2]) {
    pc.stats = new Map([['encoder', { id: 'encoder', type: 'outbound-rtp', kind: 'video', timestamp, qualityLimitationReason: 'cpu' }]]);
    await h.tick(2000);
    if (timestamp === 1) assert.equal(video.params.encodings[0].scaleResolutionDownBy, 1, 'A single transient CPU report keeps the requested1080p');
  }
  assert.equal(video.params.encodings[0].scaleResolutionDownBy, 1920 / 1280);
  assert.equal(video.params.encodings[0].maxBitrate, 1800000);
  assert.equal(video.params.encodings[0].maxFramerate, 30);
  assert.equal(video.params.degradationPreference, 'maintain-framerate');
  assert.equal(h.state().local.getVideoTracks()[0].getSettings().width, 1920, 'Adaptation does not reopen or crop the original camera');
  assert.equal(h.captures.length, 1);
  h.controller.close(); await flush();
});
