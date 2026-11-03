const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function fixture({ heldOffer } = {}) {
  const peers = [], calls = [], remoteEvents = [];
  const sourceTrack = { kind: 'video', stopped: false, stop() { this.stopped = true; } };
  class Stream {
    constructor(tracks = []) { this.tracks = tracks; this.released = false; }
    getVideoTracks() { return this.tracks.filter(track => track.kind === 'video'); }
    release(stop) { this.released = true; calls.push(['release', stop]); }
  }
  const source = new Stream([sourceTrack]), decoded = new Stream([{ kind: 'video' }]);
  class Peer {
    constructor(config) { this.id = peers.length; this.config = config; this.handlers = {}; this.remoteDescription = this.localDescription = null; this.connectionState = 'new'; this.stats = new Map(); this.senders = []; peers.push(this); }
    addEventListener(type, listener) { (this.handlers[type] ||= []).push(listener); }
    emit(type, value) { this.handlers[type]?.forEach(listener => listener(value)); }
    addTrack(track) {
      const sender = { track, parameters: { encodings: [{}] }, getParameters() { return structuredClone(this.parameters); }, async setParameters(parameters) { this.parameters = parameters; calls.push(['tune', parameters]); } };
      this.senders.push(sender);
    }
    getSenders() { return this.senders; }
    async createOffer() { if (heldOffer) await heldOffer; return { type: 'offer', sdp: 'private-offer' }; }
    async createAnswer() { return { type: 'answer', sdp: 'private-answer' }; }
    async setLocalDescription(value) {
      this.localDescription = value; calls.push(['local', this.id]);
      this.emit('icecandidate', { candidate: { toJSON: () => ({ candidate: 'private-candidate-address' }) } });
    }
    async setRemoteDescription(value) {
      this.remoteDescription = value; calls.push(['remote', this.id]);
      if (this.id === 1) this.emit('track', { track: decoded.tracks[0], streams: [decoded] });
    }
    async addIceCandidate() { assert.ok(this.remoteDescription, 'ICE must wait until remote SDP is installed'); calls.push(['ice', this.id]); }
    async getStats() { return this.stats; }
    close() { this.connectionState = 'closed'; calls.push(['close', this.id]); }
  }
  const module = { exports: {} }, filename = path.join(__dirname, '../src/native-media/loopback.ts');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Map, Number, Object, Promise, Error,
    require: name => { assert.equal(name, 'react-native-webrtc'); return { MediaStream: Stream, RTCPeerConnection: Peer }; },
  }, { filename });
  const loopback = module.exports.createNativeLoopback(source, remote => remoteEvents.push(remote));
  return { loopback, source, sourceTrack, decoded, peers, calls, remoteEvents };
}

test('isolated native loopback sets full1080 sender limits before exchanging SDP and queues ICE', async () => {
  const state = fixture();
  await state.loopback.ready;
  assert.equal(state.peers.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(state.peers.map(peer => peer.config))), [
    { iceServers: [], bundlePolicy: 'max-bundle' }, { iceServers: [], bundlePolicy: 'max-bundle' },
  ]);
  const firstTune = state.calls.findIndex(call => call[0] === 'tune');
  assert.ok(firstTune > state.calls.findIndex(call => call[0] === 'local' && call[1] === 0));
  assert.ok(firstTune < state.calls.findIndex(call => call[0] === 'remote' && call[1] === 1));
  const parameters = state.peers[0].getSenders()[0].parameters;
  assert.equal(parameters.encodings[0].maxBitrate, 2500000);
  assert.equal(parameters.encodings[0].maxFramerate, 30);
  assert.equal(parameters.encodings[0].scaleResolutionDownBy, 1);
  assert.equal(parameters.degradationPreference, 'maintain-resolution');
  assert.equal(state.calls.filter(call => call[0] === 'ice').length, 2);
  assert.equal(state.remoteEvents[0], state.decoded);
  state.loopback.stop(); state.loopback.stop();
  assert.equal(state.calls.filter(call => call[0] === 'close').length, 2);
  assert.equal(state.decoded.released, true);
  assert.equal(state.source.released, false);
  assert.equal(state.sourceTrack.stopped, false, 'The camera remains owned by the test screen');
});

test('native loopback reports actual RTP dimensions, frame deltas and codecs without private network fields', async () => {
  const state = fixture(); await state.loopback.ready;
  const output = { id: 'sender', type: 'outbound-rtp', kind: 'video', frameWidth: 1080, frameHeight: 1920, framesEncoded: 30, timestamp: 1000, codecId: 'codec' };
  const input = { id: 'receiver', type: 'inbound-rtp', kind: 'video', frameWidth: 1080, frameHeight: 1920, framesDecoded: 28, timestamp: 1000, codecId: 'codec' };
  state.peers[0].stats = new Map([
    ['sender', output], ['codec', { mimeType: 'video/H264' }],
    ['transport', { type: 'transport', selectedCandidatePairId: 'private-pair-id' }],
    ['private-pair-id', { type: 'candidate-pair', currentRoundTripTime: .002, address: '203.0.113.1' }],
  ]);
  state.peers[1].stats = new Map([['receiver', input], ['codec', { mimeType: 'video/H264' }]]);
  await state.loopback.sample();
  output.timestamp = input.timestamp = 3000;
  output.framesEncoded = 70; input.framesDecoded = 66;
  const result = await state.loopback.sample();
  assert.equal(result.sender.width, 1080); assert.equal(result.receiver.height, 1920);
  assert.equal(result.sender.frames, 70); assert.equal(result.receiver.frames, 66);
  assert.equal(result.sender.fps, 20); assert.equal(result.receiver.fps, 19);
  assert.equal(result.sender.codec, 'video/H264'); assert.equal(result.localRttMs, 2);
  assert.doesNotMatch(JSON.stringify(result), /private|203\.0\.113|sdp|candidate/);
  state.loopback.stop(); assert.equal(await state.loopback.sample(), null);
});

test('stop invalidates an unfinished negotiation without opening SDP or stopping source capture', async () => {
  let resolve;
  const heldOffer = new Promise(yes => { resolve = yes; });
  const state = fixture({ heldOffer });
  state.loopback.stop(); resolve();
  await assert.rejects(state.loopback.ready, /closed/);
  assert.equal(state.calls.some(call => call[0] === 'local' || call[0] === 'remote'), false);
  assert.equal(state.sourceTrack.stopped, false);
});
