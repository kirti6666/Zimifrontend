import { mediaDevices, MediaStream, RTCPeerConnection, type MediaStreamTrack } from "react-native-webrtc";
import { api } from "../api/endpoints";
import {
  applyBeauty, BEAUTY_PROCESSOR, beautySupported, configureBeauty, onBeautyStatus,
  releaseBeauty, setBeautyEnabled, startCallAudio, stopCallAudio, type BeautyCommand, type BeautyStatus,
} from "../../modules/binzo-media";

export type NativeMediaMessage = { type: string; data?: Record<string, unknown> };
export type NativeMediaRequest = { requestId: number; action: string; data?: Record<string, unknown> };
export type NativeMediaState = {
  local: MediaStream | null;
  remote: MediaStream | null;
  hasVideo: boolean;
  remoteVideo: boolean;
  camera: boolean;
  microphone: boolean;
  facing: "user" | "environment";
  playbackMuted: boolean;
  status: string;
  quality: "good" | "poor" | "reconnecting";
  beautyStatus: BeautyStatus;
};

// Match facebetter-expo's full camera framing and native GPU capture path.
// Start at 1080p/30. Sustained connection/device evidence can lower the full
// frame size; changing the encoding ceiling never crops the requested framing.
// The 4:3 mode retains full sensor framing and avoids the hardware encoder's
// 1080 -> 1072 alignment crop on supported devices.
const CAMERA = { width: 1920, height: 1440, frameRate: 30 };
const PROFILES = [
  { maxBitrate: 450000, maxFramerate: 20, maxEdge: 480 },
  { maxBitrate: 900000, maxFramerate: 24, maxEdge: 720 },
  { maxBitrate: 1800000, maxFramerate: 30, maxEdge: 1280 },
  { maxBitrate: 2500000, maxFramerate: 30, maxEdge: 1920 },
];
const VIDEO_MAX_LEVEL = PROFILES.length - 1;
const VIDEO_START_LEVEL = VIDEO_MAX_LEVEL;
type Signal = { callId: string; from?: string; description?: { type: "offer" | "answer"; sdp: string }; candidate?: Record<string, unknown> };
type Session = {
  id: string; peerId: string; initiator: boolean; voice: boolean; version: number;
  pc: RTCPeerConnection | null; pending: Signal[]; candidates: Record<string, unknown>[];
  queue: Promise<void>; started: Promise<void> | null;
  monitor?: ReturnType<typeof setInterval>; recovery?: ReturnType<typeof setTimeout>;
  recoveryStarted: number; sampling: boolean; level: number; tuned: number; target: number; samples: number;
  stats: Map<string, Record<string, number | string | boolean>>;
};

const message = (error: unknown) => error instanceof Error ? error.message : "The media connection could not be started. Please try again.";
const cancelled = () => new Error("Camera request cancelled. Start again when you are ready.");
const stopStream = (stream: MediaStream | null) => {
  stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
  stream?.release(false);
};

/** Native capture, GPU beauty and RTP stay outside the WebView. send() routes
 * rtc.signal/call.end through the authenticated bridge; native.media.* and the
 * local call.ended notification go back to the page. No frame crosses that bridge. */
export function createNativeMedia(
  send: (event: NativeMediaMessage) => void,
  onState: (state: NativeMediaState) => void,
) {
  let state: NativeMediaState = {
    local: null, remote: null, hasVideo: false, remoteVideo: false, camera: true, microphone: true, facing: "user",
    playbackMuted: false, status: "", quality: "good", beautyStatus: "idle",
  };
  let generation = 0, closed = false, capture: Promise<MediaStream> | null = null;
  let retiring: Promise<void> = Promise.resolve(), mutations: Promise<unknown> = Promise.resolve();
  let session: Session | null = null, expectedCall: string | null = null, handoffCall: string | null = null;
  let earlySignals: Signal[] = [], beautyWanted = false, settings: BeautyCommand[] = [];
  let beautyRequest: Promise<void> | null = null, beautyRevision = 0, beautyConfigured = false, beautyNeedsReset = false, processorTrack: MediaStreamTrack | null = null;

  function publish(next: Partial<NativeMediaState> = {}) {
    if (closed) return;
    state = { ...state, ...next };
    state.hasVideo = !!state.local?.getVideoTracks().some(track => track.readyState === "live");
    state.remoteVideo = !!state.remote?.getVideoTracks().some(track => track.readyState === "live");
    onState(state);
    const { local, remote, ...serializable } = state;
    send({ type: "native.media.state", data: { ...serializable, hasRemote: !!remote } });
  }
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const pending = mutations.then(work, work);
    mutations = pending.catch(() => {});
    return pending;
  }
  const valid = (current: Session) => !closed && session === current && generation === current.version;
  const connected = (pc: RTCPeerConnection) => pc.connectionState === "connected" && !["failed", "disconnected", "closed"].includes(pc.iceConnectionState);
  function disposePeer() {
    const current = session;
    session = null;
    if (current) {
      stopCallAudio();
      clearInterval(current.monitor); clearTimeout(current.recovery);
      if (current.pc) {
        current.pc.onicecandidate = current.pc.ontrack = current.pc.onconnectionstatechange = current.pc.oniceconnectionstatechange = null;
        current.pc.close();
      }
    }
    // Closing the peer retires its native remote tracks. Release their JS stream
    // wrapper without stopping another connection's tracks.
    state.remote?.release(false);
    state = { ...state, remote: null };
  }
  function stop() {
    generation++; beautyRevision++;
    disposePeer();
    const pendingCapture = capture;
    expectedCall = handoffCall = null; earlySignals = []; capture = null; beautyRequest = null; processorTrack = null; beautyConfigured = false; beautyNeedsReset = false;
    const local = state.local;
    local?.getTracks().forEach(track => { track.enabled = false; track.onended = null; });
    setBeautyEnabled(false);
    // The engine owns textures on the camera thread. Free them before stopping
    // that thread, and finish this retirement before acquiring another camera.
    retiring = retiring.then(async () => {
      // A permission/camera request can finish after stop(). Its generation
      // check retires the late stream; wait before opening another camera.
      await pendingCapture?.catch(() => {});
      await releaseBeauty(); stopStream(local);
    }).catch(() => { stopStream(local); });
    publish({ local: null, remote: null, camera: true, microphone: true, facing: "user", playbackMuted: false, status: "", quality: "good", beautyStatus: "idle" });
  }
  function controls(camera: boolean, microphone: boolean) {
    state.local?.getVideoTracks().forEach(track => { track.enabled = camera && !session?.voice; });
    state.local?.getAudioTracks().forEach(track => { track.enabled = microphone; });
    setBeautyEnabled(beautyWanted && camera && !session?.voice);
    publish({ camera, microphone });
  }
  function playback(muted: boolean) {
    state.remote?.getAudioTracks().forEach(track => track._setVolume(muted ? 0 : 1));
    publish({ playbackMuted: muted });
  }
  async function beauty() {
    const track = state.local?.getVideoTracks()[0];
    if (!track || !beautyWanted || !beautySupported()) {
      setBeautyEnabled(false);
      if (track && beautyWanted && !beautySupported()) publish({ beautyStatus: "glUnsupported" });
      return;
    }
    applyBeauty(settings);
    setBeautyEnabled(state.camera);
    if (processorTrack !== track) { track._setVideoEffects([BEAUTY_PROCESSOR]); processorTrack = track; }
    if (beautyConfigured) return;
    if (beautyRequest) return beautyRequest;
    const version = generation, revision = beautyRevision;
    const retry = beautyNeedsReset;
    const task = (async () => {
      publish({ beautyStatus: "loading" });
      try {
        // A native engine remembers a rejected token. A server-delivered offline
        // token may be identical on Retry, so retire that engine first while
        // keeping the camera/encoder track and microphone alive.
        if (retry) await releaseBeauty();
        if (closed || version !== generation || revision !== beautyRevision || !beautyWanted) return;
        beautyNeedsReset = false;
        const { licenseToken } = await api.beautyAuthAndroid();
        if (closed || version !== generation || revision !== beautyRevision || state.local?.getVideoTracks()[0] !== track || !beautyWanted) return;
        configureBeauty(licenseToken);
        beautyConfigured = true;
      } catch (_) {
        if (closed || version !== generation || revision !== beautyRevision) return;
        // Effects are optional. Keep the original camera and microphone live.
        setBeautyEnabled(false);
        beautyNeedsReset = true;
        publish({ beautyStatus: "authFailed" });
      }
    })();
    beautyRequest = task;
    await task;
    if (beautyRequest === task) beautyRequest = null;
  }
  function requestBeauty() {
    const version = generation;
    void beauty().catch(() => {
      if (closed || version !== generation || !state.local) return;
      setBeautyEnabled(false);
      beautyNeedsReset = true;
      publish({ beautyStatus: "error" });
    });
  }
  const beautySubscription = onBeautyStatus(status => {
    if (!state.local || closed) return;
    if (["authFailed", "initFailed", "glUnsupported", "error"].includes(status)) {
      beautyConfigured = false;
      beautyNeedsReset = true;
      setBeautyEnabled(false);
    }
    publish({ beautyStatus: status });
  });

  async function prepare(video: boolean): Promise<MediaStream> {
    if (closed) throw cancelled();
    const version = generation;
    if (capture) {
      try { await capture; } catch (_) { /* A video/voice request may retry after a failed acquisition. */ }
      if (version !== generation || closed) throw cancelled();
    }
    const existing = state.local?.getAudioTracks().some(track => track.readyState === "live") ? state.local : null;
    if (state.local && !existing) {
      beautyRevision++; beautyRequest = null; processorTrack = null; beautyConfigured = false; beautyNeedsReset = false;
      setBeautyEnabled(false);
      await releaseBeauty();
      if (version !== generation || closed) throw cancelled();
      stopStream(state.local);
      publish({ local: null });
    }
    if (existing?.getAudioTracks().some(track => track.readyState === "live") && (!video || existing.getVideoTracks().some(track => track.readyState === "live"))) {
      if (!video && existing.getVideoTracks().length) {
        beautyRevision++; beautyRequest = null; processorTrack = null; beautyConfigured = false; beautyNeedsReset = false;
        setBeautyEnabled(false); await releaseBeauty();
        if (version !== generation || state.local !== existing || closed) throw cancelled();
        existing.getVideoTracks().forEach(track => { track.stop(); existing.removeTrack(track); });
      }
      controls(state.camera, state.microphone);
      if (video) requestBeauty();
      return existing;
    }
    // Upgrading an audio-only preview keeps its microphone track, including its
    // mute state. Native getUserMedia accepts video-only acquisition.
    const task = (async () => {
      await retiring;
      if (version !== generation || closed) throw cancelled();
      const opened = await mediaDevices.getUserMedia({ audio: !existing, video: video ? { ...CAMERA, facingMode: state.facing } : false });
      if (version !== generation || closed) { stopStream(opened); throw cancelled(); }
      let local = opened;
      if (existing) {
        opened.getTracks().forEach(track => existing.addTrack(track));
        opened.release(false);
        local = existing;
      }
      publish({ local, status: "Camera ready." });
      local.getTracks().forEach(track => {
        track.onended = () => { if (state.local === local) publish({ status: "Camera or microphone access ended. Leave and reconnect to continue." }); };
      });
      controls(state.camera, state.microphone);
      if (video) requestBeauty();
      return local;
    })();
    capture = task;
    try { return await task; }
    finally { if (capture === task) capture = null; }
  }

  async function tune(current: Session, level: number) {
    return serial(async () => {
      if (!valid(current) || !current.pc) return;
      const profile = PROFILES[level];
      for (const sender of current.pc.getSenders().filter(sender => sender.track?.kind === "video")) {
        if (!valid(current)) return;
        const parameters = sender.getParameters(), dimensions = sender.track?.getSettings() || {};
        if (!parameters.encodings.length) continue;
        parameters.encodings.forEach(encoding => Object.assign(encoding, {
          maxBitrate: profile.maxBitrate, maxFramerate: profile.maxFramerate,
          scaleResolutionDownBy: Math.max(1, Math.max(dimensions.width || 0, dimensions.height || 0) / profile.maxEdge),
        }));
        // WebRTC adapts its source before the effect processor. Keep the
        // requested 1080p at the top profile; our sustained CPU/network checks
        // explicitly select smaller profiles when needed. At those smaller
        // profiles WebRTC may prioritize motion under further pressure.
        parameters.degradationPreference = level === VIDEO_MAX_LEVEL ? "maintain-resolution" : "maintain-framerate";
        try { await sender.setParameters(parameters); }
        catch (_) {
          // Some OS/WebRTC versions reject degradationPreference. Retry the
          // same actual encoding limits using a fresh transaction.
          if (!valid(current)) return;
          const fallback = sender.getParameters();
          fallback.encodings.forEach((encoding, index) => Object.assign(encoding, parameters.encodings[index]));
          fallback.degradationPreference = null;
          try { await sender.setParameters(fallback); } catch (_) { return; }
        }
      }
      if (valid(current)) current.tuned = current.level = level;
    });
  }
  function signal(current: Session, payload: Record<string, unknown>) {
    if (valid(current)) send({ type: "rtc.signal", data: { callId: current.id, ...payload } });
  }
  function failed(current: Session, error: unknown) {
    if (!valid(current)) return;
    const callId = current.id, text = message(error);
    send({ type: "call.end", data: { callId, reason: "media_failed" } });
    stop();
    publish({ status: text });
    send({ type: "call.ended", data: { callId } });
  }
  function enqueue(current: Session, work: () => Promise<void>) {
    current.queue = current.queue.then(async () => { if (valid(current)) await work(); }).catch(error => failed(current, error));
  }
  async function offer(current: Session, restart = false) {
    const pc = current.pc;
    if (!pc || !valid(current)) return;
    if (pc.signalingState === "stable") {
      current.candidates = [];
      const description = await pc.createOffer(restart ? { iceRestart: true } : undefined);
      if (!valid(current)) return;
      await pc.setLocalDescription(description);
      await tune(current, current.level);
    }
    if (valid(current) && pc.localDescription?.type === "offer") {
      signal(current, { description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
      current.candidates.forEach(candidate => signal(current, { candidate }));
    }
  }
  function recovered(current: Session) {
    clearTimeout(current.recovery); current.recovery = undefined; current.recoveryStarted = 0;
    publish({ status: "Connected", quality: "good" });
  }
  function recover(current: Session) {
    if (!valid(current) || current.recovery) return;
    current.recoveryStarted ||= Date.now();
    publish({ status: "Connection interrupted. Reconnecting…", quality: "reconnecting" });
    current.recovery = setTimeout(() => {
      current.recovery = undefined;
      if (!valid(current) || !current.pc) return;
      if (connected(current.pc)) return recovered(current);
      if (Date.now() - current.recoveryStarted >= 30000) return failed(current, new Error("The media connection could not recover. Please reconnect."));
      if (current.initiator) enqueue(current, () => offer(current, true));
      recover(current);
    }, 3000);
  }
  async function sample(current: Session) {
    if (!valid(current) || !current.pc || current.sampling) return;
    current.sampling = true;
    try {
      const report: Map<string, Record<string, any>> = await current.pc.getStats();
      if (!valid(current) || !connected(current.pc)) return;
      let poor = false, severe = false, cpu = false, fresh = false;
      const next = new Map<string, Record<string, number | string | boolean>>();
      let selectedPair: string | undefined;
      report.forEach(stat => { if (stat.type === "transport") selectedPair = stat.selectedCandidatePairId; });
      report.forEach(stat => {
        const before = current.stats.get(stat.id), updated = !before || stat.timestamp == null || Number(stat.timestamp) > Number(before.timestamp);
        if (updated) fresh = true;
        if (stat.type === "candidate-pair" && (selectedPair ? stat.id === selectedPair : stat.nominated && stat.state === "succeeded")) {
          if (stat.currentRoundTripTime > .6) poor = true;
          if (stat.currentRoundTripTime > 1.2) severe = true;
        }
        if (stat.type === "remote-inbound-rtp") {
          let impairedUntil = Number(before?.impairedUntil || 0), impairment = Number(before?.impairment || 0);
          if (updated) {
            const received = stat.packetsReceived - Number(before?.received || 0), lost = stat.packetsLost - Number(before?.lost || 0);
            const loss = Math.max(stat.fractionLost || 0, before && received >= 0 && lost >= 0 && received + lost >= 20 ? lost / (received + lost) : 0);
            impairment = loss > .2 || stat.roundTripTime > 1.2 ? 2 : loss > .08 || stat.jitter > .08 || stat.roundTripTime > .6 ? 1 : 0;
            impairedUntil = impairment ? Date.now() + 8000 : 0;
          }
          if (impairedUntil > Date.now()) { poor ||= impairment > 0; severe ||= impairment > 1; }
          next.set(stat.id, { timestamp: stat.timestamp, received: stat.packetsReceived, lost: stat.packetsLost, impairment, impairedUntil });
        } else next.set(stat.id, { timestamp: stat.timestamp });
        if (stat.type === "outbound-rtp" && (stat.kind === "video" || stat.mediaType === "video") && state.camera) cpu ||= stat.qualityLimitationReason === "cpu";
      });
      current.stats = next;
      if (!fresh) return;
      const target = severe ? 0 : poor ? 1 : cpu ? Math.max(0, current.level - 1) : VIDEO_MAX_LEVEL;
      current.samples = target === current.target ? current.samples + 1 : 1; current.target = target;
      if (current.samples >= (target < current.level ? 2 : 3)) {
        publish({ quality: poor ? "poor" : "good" });
        if (target !== current.level) await tune(current, target < current.level ? target : current.level + 1);
      }
    } catch (_) { /* A stats read can race cleanup or be unavailable on an older OS. */ }
    finally { current.sampling = false; }
  }
  function receive(data: Signal) {
    const current = session;
    if (!current || current.id !== data.callId) {
      if (expectedCall === data.callId && earlySignals.length < 100) earlySignals.push(data);
      return;
    }
    if (data.from && data.from !== current.peerId) return;
    if (!current.pc) { if (current.pending.length < 100) current.pending.push(data); return; }
    enqueue(current, async () => {
      const pc = current.pc!;
      if (data.description) {
        if (data.description.type !== (current.initiator ? "answer" : "offer")) return;
        if (current.initiator && pc.signalingState !== "have-local-offer") return;
        await pc.setRemoteDescription(data.description);
        if (!valid(current)) return;
        const waiting = current.pending.splice(0);
        for (const pending of waiting) if (pending.candidate) { await pc.addIceCandidate(pending.candidate); if (!valid(current)) return; }
        if (data.description.type === "offer") {
          const answer = await pc.createAnswer();
          if (!valid(current)) return;
          await pc.setLocalDescription(answer);
          await tune(current, current.level);
          if (valid(current)) signal(current, { description: { type: pc.localDescription!.type, sdp: pc.localDescription!.sdp } });
        }
      }
      if (data.candidate && valid(current)) {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
        else if (current.pending.length < 100) current.pending.push(data);
      }
    });
  }
  async function connect(data: Record<string, unknown>) {
    const callId = String(data.callId || ""), peerId = String(data.peerId || "");
    if (!callId || !peerId) throw new Error("The call participant could not be identified. Please try again.");
    if (session?.id === callId) return session.started;
    disposePeer();
    handoffCall = null; expectedCall = callId;
    const current: Session = {
      id: callId, peerId, initiator: !!data.initiator, voice: !!data.voice, version: generation,
      pc: null, pending: earlySignals.filter(signal => signal.callId === callId), candidates: [], queue: Promise.resolve(), started: null,
      recoveryStarted: 0, sampling: false, level: VIDEO_START_LEVEL, tuned: -1, target: VIDEO_START_LEVEL, samples: 0, stats: new Map(),
    };
    earlySignals = []; session = current;
    current.started = (async () => {
      try {
        // Preview capture does not change communication audio routing. An
        // accepted call owns the route/focus until its peer is retired.
        startCallAudio(!current.voice);
        const local = await prepare(!current.voice);
        if (!valid(current)) return;
        const config = await api.rtcConfig();
        if (!valid(current)) return;
        if (!Array.isArray(config.iceServers)) throw new Error("The server returned invalid video connection settings.");
        const pc = new RTCPeerConnection({ iceServers: config.iceServers }); current.pc = pc;
        local.getTracks().forEach(track => { if (!current.voice || track.kind === "audio") pc.addTrack(track, local); });
        pc.addEventListener("icecandidate", event => {
          if (!valid(current) || !event.candidate) return;
          const candidate = event.candidate.toJSON() as unknown as Record<string, unknown>;
          if (current.candidates.length < 100) current.candidates.push(candidate);
          signal(current, { candidate });
        });
        pc.addEventListener("track", event => {
          if (!valid(current) || !event.track) return;
          const receivedTrack = event.track;
          const remote = state.remote || event.streams[0] || new MediaStream();
          event.streams.flatMap(stream => stream.getTracks()).forEach(track => {
            if (!remote.getTracks().some(existing => existing.id === track.id)) remote.addTrack(track);
          });
          if (!remote.getTracks().some(track => track.id === receivedTrack.id)) remote.addTrack(receivedTrack);
          remote.getAudioTracks().forEach(track => track._setVolume(state.playbackMuted ? 0 : 1));
          publish({ remote });
        });
        const changed = () => {
          if (!valid(current)) return;
          if (connected(pc)) recovered(current);
          else if ([pc.connectionState, pc.iceConnectionState].some(value => value === "failed" || value === "disconnected")) recover(current);
        };
        pc.onconnectionstatechange = pc.oniceconnectionstatechange = changed;
        current.monitor = setInterval(() => void sample(current), 2000);
        publish({ status: "Connecting your call…", quality: "good" });
        if (current.initiator) enqueue(current, () => offer(current));
        const pending = current.pending.splice(0);
        pending.forEach(receive);
      } catch (error) { failed(current, error); throw error; }
    })();
    return current.started;
  }

  async function handle(request: NativeMediaRequest): Promise<void> {
    const data = request.data || {};
    try {
      if (closed) throw cancelled();
      let result: unknown = {};
      switch (request.action) {
        case "prepare": {
          const local = await prepare(!!data.video), track = local.getVideoTracks()[0];
          result = { hasVideo: !!track, facing: state.facing, settings: track?.getSettings() || {} }; break;
        }
        case "connect": await connect(data); break;
        case "signal": receive(data as Signal); break;
        case "config": result = await api.rtcConfig(); break;
        case "stop": stop(); break;
        case "handoff": handoffCall = typeof data.callId === "string" ? data.callId : null; break;
        case "controls": controls(data.camera !== false, data.microphone !== false); break;
        case "setPlaybackMuted": playback(!!data.muted); break;
        case "flipCamera": {
          const version = generation;
          await serial(async () => {
            const track = state.local?.getVideoTracks()[0];
            if (!track || version !== generation) return;
            const facing = state.facing === "user" ? "environment" : "user";
            await track.applyConstraints({ ...CAMERA, facingMode: facing });
            if (version !== generation || closed) return;
            publish({ facing });
          });
          // A different lens can select a different actual capture size. Apply
          // the current encoder ceiling against those new dimensions.
          if (version === generation && session) await tune(session, session.level);
          result = { facing: state.facing }; break;
        }
        case "beauty": {
          beautyWanted = !!data.enabled;
          settings = Array.isArray(data.settings) ? data.settings as BeautyCommand[] : settings;
          if (!beautyWanted) { beautyRevision++; beautyRequest = null; setBeautyEnabled(false); publish({ beautyStatus: "idle" }); }
          else requestBeauty();
          break;
        }
        default: throw new Error("Unsupported native media action.");
      }
      if (!closed) send({ type: "native.media.result", data: { requestId: request.requestId, result } });
    } catch (error) {
      if (!closed) send({ type: "native.media.result", data: { requestId: request.requestId, error: message(error) } });
    }
  }
  function event(event: NativeMediaMessage) {
    const data = event.data || {};
    switch (event.type) {
      case "rtc.signal": receive(data as Signal); break;
      case "call.connected": case "verify.connected": void connect(data).catch(() => {}); break;
      case "call.created": case "call.incoming": case "verify.incoming": if (!session) expectedCall = String(data.callId || ""); break;
      case "call.ended": case "verify.ended": {
        if (handoffCall && handoffCall === data.callId) {
          handoffCall = null;
          if (session?.id === data.callId) { disposePeer(); publish({ remote: null, quality: "good" }); }
        } else if (session?.id === data.callId || !session && expectedCall === data.callId) stop();
        break;
      }
      case "call.failed": if (!session || !data.callId || session.id === data.callId) stop(); break;
      case "session.none": case "session.expired": stop(); break;
      case "operation.error":
        if (data.action === "rtc.signal" && session?.pc && !connected(session.pc)) recover(session);
        break;
      case "app.foreground": case "realtime.status": {
        if (session?.pc && (event.type === "app.foreground" || data.connected)) {
          if (!connected(session.pc)) recover(session);
          else void sample(session);
        }
        break;
      }
    }
  }
  function close() { if (closed) return; stop(); beautySubscription?.remove(); closed = true; }
  return { handle, event, stop, close };
}
