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
  let now = 1000, trackId = 0, streamId = 0, requestId = 0, beautyListener, serviceStopped;
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
    startCallService: async (id, video) => { calls.push(['startCallService', id, video]); if (options.service) await options.service.promise; if (options.serviceFailure) throw new Error('Return to the app before connecting'); },
    stopCallService: id => calls.push(['stopCallService', id]),
    onCallServiceStopped: listener => { serviceStopped = listener; return { remove() { calls.push(['unsubscribeService']); } }; },
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
  return { controller, rpc, connect, tick, calls, events, states, peers, captures, timers, makeStream, Track, Stream, beautyListener: status => beautyListener(status), serviceStopped: id => serviceStopped(id), state: () => states.at(-1) };
}

test('permissioned preview and an unanswered incoming call do not start a foreground capture service', async () => {
  const h = fixture(); await h.rpc('prepare', { video: true });
  h.controller.event({ type: 'call.incoming', data: { callId: 'incoming-one' } }); await flush();
  assert.equal(h.calls.filter(call => call[0] === 'startCallService').length, 0);
  await h.connect({ callId: 'incoming-one', initiator: false });
  assert.deepEqual(h.calls.find(call => call[0] === 'startCallService'), ['startCallService', 'incoming-one', true]);
  h.controller.close();
});

test('outgoing ringing promotes capture while visible, reuses that service after answer, and retires it on cancel', async () => {
  const h = fixture(); await h.rpc('prepare', { video: false });
  h.controller.event({ type: 'call.created', data: { callId: 'call-one' } }); await flush();
  assert.deepEqual(h.calls.find(call => call[0] === 'startCallService'), ['startCallService', 'call-one', false]);
  await h.connect({ voice: true });
  assert.equal(h.calls.filter(call => call[0] === 'startCallService').length, 1, 'A background answer reuses the already promoted ringing service');
  h.controller.event({ type: 'call.ended', data: { callId: 'call-one' } }); await flush();
  assert.deepEqual(h.calls.filter(call => call[0] === 'stopCallService'), [['stopCallService', 'call-one']]);
  h.controller.close();
});

test('foreground service promotion is acknowledged before audio focus, peer creation or signaling', async () => {
  const service = deferred(), h = fixture({ service });
  const connected = h.connect(); await flush();
  assert.equal(h.peers.length, 0); assert.equal(h.calls.some(call => call[0] === 'startCallAudio'), false);
  service.resolve(); await connected; await flush();
  assert.equal(h.peers.length, 1); assert.ok(h.calls.find(call => call[0] === 'startCallAudio'));
  h.controller.close();
});

test('denied foreground promotion ends ringing/accepted calls without leaving capture or billable media behind', async () => {
  for (const ringing of [false, true]) {
    const h = fixture({ serviceFailure: true });
    if (ringing) { await h.rpc('prepare', { video: true }); h.controller.event({ type: 'call.created', data: { callId: 'call-one' } }); }
    else await h.connect();
    await flush();
    assert.equal(h.peers.length, 0);
    assert.ok(h.events.find(event => event.type === 'call.end' && event.data.callId === 'call-one'));
    assert.ok(h.events.find(event => event.type === 'call.ended' && event.data.callId === 'call-one'));
    assert.equal(h.state().local, null);
    assert.ok(h.calls.find(call => call[0] === 'stopCallService'));
    h.controller.close();
  }
});

test('late service completion cannot revive a cancelled call or retire another call and notification end is scoped', async () => {
  const service = deferred(), h = fixture({ service });
  const connected = h.connect(); await flush();
  h.controller.event({ type: 'call.ended', data: { callId: 'call-one' } }); await flush();
  service.resolve(); await connected; await flush();
  assert.equal(h.peers.length, 0);
  await h.connect({ callId: 'call-two' });
  h.serviceStopped('call-one'); await flush();
  assert.equal(h.peers.at(-1).connectionState, 'new');
  h.serviceStopped('call-two'); await flush();
  assert.equal(h.peers.at(-1).connectionState, 'closed');
  assert.ok(h.events.find(event => event.type === 'call.end' && event.data.callId === 'call-two' && event.data.reason === 'ended_from_notification'));
  h.controller.close();
  assert.ok(h.calls.find(call => call[0] === 'unsubscribeService'));
});

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
  assert.equal(pc.config.bundlePolicy, 'max-bundle'); assert.equal(pc.config.rtcpMuxPolicy, 'require');
  assert.deepEqual(h.calls.find(call => call[0] === 'startCallAudio'), ['startCallAudio', true]);
  assert.equal(pc.getSenders().find(sender => sender.track.kind === 'video').track, video);
  assert.equal(pc.getSenders().find(sender => sender.track.kind === 'audio').track, microphone);
  const videoParameters = pc.getSenders().find(sender => sender.track.kind === 'video').params;
  assert.equal(videoParameters.encodings[0].maxBitrate, 2500000);
  assert.equal(videoParameters.encodings[0].maxFramerate, 30);
  assert.equal(videoParameters.encodings[0].scaleResolutionDownBy, 1);
  assert.equal(videoParameters.degradationPreference, 'maintain-framerate');
  assert.deepEqual(h.calls.find(call => call[0] === 'signaled')[2], plain(videoParameters), 'Full-source limits are applied before signaling the first offer');
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

for (const missing of ['microphone', 'camera']) test(`native video preparation rejects and retires a stream missing its required ${missing}`, async () => {
  const capture = deferred(), h = fixture({ capture });
  const pending = h.rpc('prepare', { video: true }); await flush();
  // react-native-webrtc can resolve with only the permission that was granted.
  const opened = h.makeStream(missing !== 'camera', missing !== 'microphone');
  const tracks = opened.getTracks(); capture.resolve(opened);
  const response = await pending; await flush();
  assert.match(response.error || '', new RegExp(missing, 'i'));
  assert.ok(tracks.every(track => track.readyState === 'ended'));
  assert.equal(opened.released, true);
  assert.equal(h.state()?.local || null, null);
  assert.equal(h.calls.some(call => call[0] === 'startCallAudio'), false);
  assert.equal(h.events.some(event => event.type === 'rtc.signal'), false);
  h.controller.close();
});

test('failed video upgrade keeps the existing microphone and its mute state', async () => {
  const options = {}, h = fixture(options);
  await h.rpc('prepare', { video: false });
  await h.rpc('controls', { camera: true, microphone: false });
  const original = h.state().local, microphone = original.getAudioTracks()[0];
  options.capture = deferred();
  const pending = h.rpc('prepare', { video: true }); await flush();
  const opened = h.makeStream(false, false); options.capture.resolve(opened);
  const response = await pending;
  assert.match(response.error, /camera/i);
  assert.equal(opened.released, true);
  assert.equal(h.state().local, original);
  assert.equal(microphone.readyState, 'live');
  assert.equal(microphone.enabled, false);
  h.controller.close(); await flush();
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
  assert.equal(signaledAnswer.encodings[0].scaleResolutionDownBy, 1, 'The answering side starts at full source size too');
  assert.equal(signaledAnswer.degradationPreference, 'maintain-framerate');
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

function qualityStats({ sample, feedback = sample, loss = 0, rtt = .1, jitter = 0, available = 4000000, delay = sample, frames = sample * 60, encode = sample * .18, reason = 'none', received = feedback * 1000, lost = 0, incoming, markers = true } = {}) {
  const values = [
    ['transport', { id: 'transport', type: 'transport', timestamp: sample * 2000, selectedCandidatePairId: 'pair' }],
    ['pair', { id: 'pair', type: 'candidate-pair', timestamp: sample * 2000, responsesReceived: sample, currentRoundTripTime: rtt, availableOutgoingBitrate: available }],
    ['receiver', { id: 'receiver', type: 'remote-inbound-rtp', timestamp: sample * 2000, ...(markers ? { reportsReceived: feedback } : {}), packetsReceived: received, packetsLost: lost, fractionLost: loss, jitter, roundTripTime: rtt }],
    ['encoder', { id: 'encoder', type: 'outbound-rtp', kind: 'video', timestamp: sample * 2000, packetsSent: sample * 500, framesEncoded: frames, bytesSent: sample * 200000, totalPacketSendDelay: delay, totalEncodeTime: encode, qualityLimitationReason: reason, mediaSourceId: 'source' }],
    ['source', { id: 'source', type: 'media-source', timestamp: sample * 2000, framesPerSecond: 30 }],
  ];
  if (incoming) values.push(['incoming', { id: 'incoming', type: 'inbound-rtp', timestamp: sample * 2000, ...incoming }]);
  return new Map(values);
}
function videoSender(pc) { return pc.getSenders().find(sender => sender.track.kind === 'video'); }
function markConnected(pc) { pc.connectionState = pc.iceConnectionState = 'connected'; pc.onconnectionstatechange(); }

test('fresh receiver loss reduces the sender; repeated reports are neutral and recovery waits at each step', async () => {
  const h = fixture(), pc = await h.connect();
  markConnected(pc);
  pc.stats = qualityStats({ sample: 1, loss: .3 }); await h.tick(2000);
  assert.equal(videoSender(pc).params.encodings[0].maxBitrate, 2500000);
  assert.equal(h.state().quality, 'good', 'One bad receiver report does not warn');
  pc.stats = qualityStats({ sample: 2, loss: .3 }); await h.tick(2000);
  assert.equal(videoSender(pc).params.encodings[0].maxBitrate, 450000);
  assert.equal(h.state().quality, 'poor');
  for (let count = 0; count < 4; count++) await h.tick(2000);
  assert.equal(videoSender(pc).params.encodings[0].maxBitrate, 450000);
  for (let sample = 3; sample <= 5; sample++) { pc.stats = qualityStats({ sample }); await h.tick(2000); }
  assert.equal(videoSender(pc).params.encodings[0].maxBitrate, 450000, 'Three fresh recovery polls do not immediately raise resolution');
  pc.stats = qualityStats({ sample: 6 }); await h.tick(2000);
  assert.equal(videoSender(pc).params.encodings[0].maxBitrate, 900000);
  assert.equal(h.state().quality, 'good');
  assert.equal(videoSender(pc).params.degradationPreference, 'maintain-framerate');
  for (let sample = 7; sample <= 10; sample++) { pc.stats = qualityStats({ sample }); await h.tick(2000); }
  assert.equal(videoSender(pc).params.encodings[0].maxBitrate, 900000, 'Each quality increase observes the10s dwell');
  pc.stats = qualityStats({ sample: 11 }); await h.tick(2000);
  assert.equal(videoSender(pc).params.encodings[0].maxBitrate, 1800000);
  for (let sample = 12; sample <= 16; sample++) { pc.stats = qualityStats({ sample }); await h.tick(2000); }
  assert.equal(videoSender(pc).params.encodings[0].maxBitrate, 2500000);
  assert.equal(videoSender(pc).params.encodings[0].scaleResolutionDownBy, 1);
  h.controller.close(); await flush();
});

test('sustained encoder CPU pressure lowers resolution without reporting a poor connection', async () => {
  const h = fixture(), pc = await h.connect();
  markConnected(pc); const video = videoSender(pc);
  pc.stats = qualityStats({ sample: 1 }); await h.tick(2000);
  for (const sample of [2, 3]) {
    pc.stats = qualityStats({ sample, reason: 'cpu' });
    await h.tick(2000);
    if (sample === 2) assert.equal(video.params.encodings[0].scaleResolutionDownBy, 1, 'One CPU interval keeps full source resolution');
  }
  assert.equal(video.params.encodings[0].scaleResolutionDownBy, 1920 / 1280);
  assert.equal(video.params.encodings[0].maxBitrate, 1800000);
  assert.equal(video.params.encodings[0].maxFramerate, 30);
  assert.equal(video.params.degradationPreference, 'maintain-framerate');
  assert.equal(h.state().quality, 'good');
  assert.equal(h.state().local.getVideoTracks()[0].getSettings().width, 1920, 'Adaptation does not reopen or crop the original camera');
  assert.equal(h.captures.length, 1);
  h.controller.close(); await flush();
});

test('stable distant-relay RTT with near-zero loss does not show poor connection or shrink video', async () => {
  const h = fixture(), pc = await h.connect(); markConnected(pc);
  for (let sample = 1; sample <= 10; sample++) {
    pc.stats = qualityStats({ sample, rtt: .75, loss: .001, jitter: .003 }); await h.tick(2000);
  }
  assert.equal(h.state().quality, 'good');
  assert.equal(videoSender(pc).params.encodings[0].scaleResolutionDownBy, 1);
  assert.equal(h.captures.length, 1);
  h.controller.close(); await flush();
});

test('extreme fresh RTT remains visible but propagation delay alone never reduces sender resolution', async () => {
  const h = fixture(), pc = await h.connect(); markConnected(pc);
  pc.stats = qualityStats({ sample: 1, rtt: 1.4 }); await h.tick(2000);
  assert.equal(h.state().quality, 'good');
  pc.stats = qualityStats({ sample: 2, rtt: 1.4 }); await h.tick(2000);
  assert.equal(h.state().quality, 'poor');
  assert.equal(videoSender(pc).params.encodings[0].scaleResolutionDownBy, 1);
  for (let sample = 3; sample <= 5; sample++) { pc.stats = qualityStats({ sample }); await h.tick(2000); }
  assert.equal(h.state().quality, 'good');
  h.controller.close(); await flush();
});

test('a changing collection timestamp cannot turn one old RTCP loss report into sustained impairment', async () => {
  const h = fixture(), pc = await h.connect(); markConnected(pc);
  for (let sample = 1; sample <= 10; sample++) {
    pc.stats = qualityStats({ sample, feedback: 1, loss: .3 }); await h.tick(2000);
  }
  assert.equal(h.state().quality, 'good');
  assert.equal(videoSender(pc).params.encodings[0].scaleResolutionDownBy, 1);
  assert.equal(h.events.some(event => event.type === 'native.media.state' && event.data.quality === 'poor'), false);
  h.controller.close(); await flush();
});

test('fresh counter-based RTP loss works without fractionLost and incoming loss only warns the receiver', async () => {
  for (const direction of ['incoming', 'outgoing']) {
    const h = fixture(), pc = await h.connect(); markConnected(pc);
    for (let sample = 1; sample <= 3; sample++) {
      pc.stats = qualityStats({ sample, markers: false,
        ...(direction === 'outgoing' ? { received: sample * 100, lost: sample * 50 } :
          { incoming: { packetsReceived: sample * 100, packetsLost: sample * 50, freezeCount: 0 } }) });
      if (direction === 'outgoing') delete pc.stats.get('receiver').fractionLost;
      await h.tick(2000);
    }
    assert.equal(h.state().quality, 'poor');
    assert.equal(videoSender(pc).params.encodings[0].scaleResolutionDownBy > 1, direction === 'outgoing');
    h.controller.close(); await flush();
  }
});

test('fresh pacer backlog reduces a congested sender while an idle stale CPU gauge is neutral', async () => {
  for (const stalled of [false, true]) {
    const h = fixture(), pc = await h.connect(); markConnected(pc);
    for (let sample = 1; sample <= 3; sample++) {
      pc.stats = qualityStats({ sample, ...(stalled ? { frames: 60, reason: 'cpu', delay: 1 } : { delay: sample * 150, available: 550000 }) });
      if (stalled) pc.stats.get('encoder').packetsSent = 500;
      await h.tick(2000);
    }
    assert.equal(h.state().quality, stalled ? 'good' : 'poor');
    assert.equal(videoSender(pc).params.encodings[0].scaleResolutionDownBy > 1, !stalled);
    h.controller.close(); await flush();
  }
});

test('one bounded healthy quality probe can escape a bandwidth estimate limited by the current sender cap', async () => {
  const h = fixture(), pc = await h.connect(); markConnected(pc);
  for (let sample = 1; sample <= 2; sample++) { pc.stats = qualityStats({ sample, loss: .3 }); await h.tick(2000); }
  assert.equal(videoSender(pc).params.encodings[0].maxBitrate, 450000);
  for (let sample = 3; sample <= 10; sample++) { pc.stats = qualityStats({ sample, available: 400000 }); await h.tick(2000); }
  assert.equal(videoSender(pc).params.encodings[0].maxBitrate, 450000, 'A low estimate prevents an immediate increase');
  pc.stats = qualityStats({ sample: 11, available: 400000 }); await h.tick(2000);
  assert.equal(videoSender(pc).params.encodings[0].maxBitrate, 900000, 'A15s healthy one-step probe avoids permanently trapping the call at low resolution');
  h.controller.close(); await flush();
});

test('stale or removed RTCP impairment expires while active healthy RTP clears a genuine old warning', async () => {
  for (const remove of [false, true]) {
    const h = fixture(), pc = await h.connect(); markConnected(pc);
    for (let sample = 1; sample <= 2; sample++) { pc.stats = qualityStats({ sample, loss: .3 }); await h.tick(2000); }
    assert.equal(h.state().quality, 'poor');
    for (let sample = 3; sample <= 10; sample++) {
      pc.stats = qualityStats({ sample, feedback: 2, loss: .3 });
      if (remove) pc.stats.delete('receiver');
      await h.tick(2000);
    }
    assert.equal(h.state().quality, 'good', 'Collection timestamps cannot keep an expired or removed receiver warning alive');
    h.controller.close(); await flush();
  }
});

test('RTCP packet deltas remain useful when an optional feedback measurement counter is stuck at zero', async () => {
  const h = fixture(), pc = await h.connect(); markConnected(pc);
  for (let sample = 1; sample <= 3; sample++) {
    pc.stats = qualityStats({ sample, feedback: 0, received: sample * 100, lost: sample * 50 });
    delete pc.stats.get('receiver').fractionLost;
    pc.stats.get('receiver').roundTripTimeMeasurements = 0;
    await h.tick(2000);
  }
  assert.equal(h.state().quality, 'poor');
  assert.equal(videoSender(pc).params.encodings[0].maxBitrate, 450000);
  h.controller.close(); await flush();
});

test('changed receiver loss or jitter remains fresh when RTT measurement markers stay at zero', async () => {
  for (const gauge of ['loss', 'jitter']) {
    const h = fixture(), pc = await h.connect(); markConnected(pc);
    for (let sample = 1; sample <= 3; sample++) {
      pc.stats = qualityStats({ sample, feedback: 0, received: 1000, lost: 0,
        [gauge]: sample === 1 ? 0 : sample === 2 ? .25 : .3 });
      pc.stats.get('receiver').roundTripTimeMeasurements = 0;
      await h.tick(2000);
    }
    assert.equal(h.state().quality, 'poor', `Two fresh changed${gauge} reports remain visible without RTT measurements`);
    assert.equal(videoSender(pc).params.encodings[0].maxBitrate, 450000);
    h.controller.close(); await flush();
  }
});

test('unchanged loss and jitter with static RTT markers remain neutral despite fresh collection timestamps', async () => {
  const h = fixture(), pc = await h.connect(); markConnected(pc);
  for (let sample = 1; sample <= 8; sample++) {
    pc.stats = qualityStats({ sample, feedback: 0, received: 1000, lost: 0, loss: .3, jitter: .3 });
    pc.stats.get('receiver').roundTripTimeMeasurements = 0;
    await h.tick(2000);
  }
  assert.equal(h.state().quality, 'good');
  assert.equal(videoSender(pc).params.encodings[0].scaleResolutionDownBy, 1);
  h.controller.close(); await flush();
});

test('actual interval encode cost or bandwidth-limited frame loss adapts even without packet loss', async () => {
  for (const bottleneck of ['encode', 'bandwidth']) {
    const h = fixture(), pc = await h.connect(); markConnected(pc);
    for (let sample = 1; sample <= 3; sample++) {
      pc.stats = qualityStats({ sample, ...(bottleneck === 'encode' ? { encode: sample * 3 } : { reason: 'bandwidth', frames: sample * 24, available: 1500000 }) });
      await h.tick(2000);
    }
    assert.equal(videoSender(pc).params.encodings[0].scaleResolutionDownBy > 1, true);
    assert.equal(h.state().quality, bottleneck === 'encode' ? 'good' : 'poor');
    assert.equal(h.captures.length, 1);
    h.controller.close(); await flush();
  }
});

test('startup or CPU-only receiver freezes do not become a poor-network warning without fresh jitter evidence', async () => {
  const h = fixture(), pc = await h.connect(); markConnected(pc);
  for (let sample = 1; sample <= 4; sample++) {
    pc.stats = qualityStats({ sample, incoming: { packetsReceived: sample * 1000, packetsLost: 0, freezeCount: 100 + sample, jitter: .003 } });
    await h.tick(2000);
  }
  assert.equal(h.state().quality, 'good', 'Initial and subsequent decoder freezes alone are not network loss');
  for (let sample = 5; sample <= 6; sample++) {
    pc.stats = qualityStats({ sample, incoming: { packetsReceived: sample * 1000, packetsLost: 0, freezeCount: 100 + sample, jitter: .12 } });
    await h.tick(2000);
  }
  assert.equal(h.state().quality, 'poor', 'Repeated fresh receive freezes with high actual jitter remain visible');
  assert.equal(videoSender(pc).params.encodings[0].scaleResolutionDownBy, 1);
  h.controller.close(); await flush();
});
