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
// Start at full 4:3 camera resolution and 30fps. Sustained connection/device evidence can lower the full
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
const RECEIVER_EVIDENCE_MS = 8000;
const VIDEO_RECOVERY_DWELL_MS = 10000;
type QualitySnapshot = {
  sampledAt: number; timestamp?: number; received?: number; lost?: number;
  sent?: number; frames?: number; encode?: number; delay?: number; bytes?: number;
  reports?: number; measurements?: number; remoteTimestamp?: number; fraction?: number; jitter?: number;
  freezes?: number; buffer?: number; emitted?: number; responses?: number; rtt?: number;
  impairment?: number; impairedUntil?: number; latencyUntil?: number;
};
const number = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) ? value : undefined;
const increase = (value: unknown, before: unknown): number | undefined => {
  const current = number(value), previous = number(before);
  return current !== undefined && previous !== undefined && current >= previous ? current - previous : undefined;
};
const changedCounter = (value: unknown, before: unknown) => (increase(value, before) || 0) > 0;
type Signal = { callId: string; from?: string; description?: { type: "offer" | "answer"; sdp: string }; candidate?: Record<string, unknown> };
type Session = {
  id: string; peerId: string; initiator: boolean; voice: boolean; version: number;
  pc: RTCPeerConnection | null; pending: Signal[]; candidates: Record<string, unknown>[];
  queue: Promise<void>; started: Promise<void> | null;
  monitor?: ReturnType<typeof setInterval>; recovery?: ReturnType<typeof setTimeout>;
  recoveryStarted: number; sampling: boolean; level: number; tuned: number; target: number;
  poorSamples: number; goodSamples: number; downSamples: number; upSamples: number; changedAt: number; healthySince: number;
  stats: Map<string, QualitySnapshot>;
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
        // Prioritize motion at every level. WebRTC may reduce its adapted
        // source before beauty/encoding when the device or connection needs it;
        // our fresh interval checks also select sustainable profile ceilings.
        parameters.degradationPreference = "maintain-framerate";
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
      if (valid(current)) {
        if (current.tuned !== level) {
          current.changedAt = Date.now(); current.upSamples = current.downSamples = 0;
        }
        current.tuned = current.level = level;
      }
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
    const restarting = current.recoveryStarted > 0 || state.quality === "reconnecting";
    clearTimeout(current.recovery); current.recovery = undefined; current.recoveryStarted = 0;
    if (restarting) {
      current.stats.clear(); current.poorSamples = current.goodSamples = current.upSamples = current.downSamples = 0;
      current.healthySince = 0;
    }
    publish({ status: "Connected", quality: restarting ? "good" : state.quality });
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
      const now = Date.now(), next = new Map<string, QualitySnapshot>();
      let freshPoor = false, heldPoor = false, freshNetwork = false;
      let outgoingPoor = false, outgoingSevere = false, heldOutgoingPoor = false, cpu = false, freshOutgoing = false;
      let availableBitrate: number | undefined, sentBitrate: number | undefined;
      let selectedPair: string | undefined;
      report.forEach(stat => { if (stat.type === "transport") selectedPair = stat.selectedCandidatePairId; });
      report.forEach((stat, id) => {
        if (!["candidate-pair", "remote-inbound-rtp", "inbound-rtp", "outbound-rtp"].includes(stat.type)) return;
        const key = String(stat.id || id), before = current.stats.get(key), timestamp = number(stat.timestamp);
        const updated = timestamp !== undefined ? !before || before.timestamp === undefined || timestamp > before.timestamp :
          !before || changedCounter(stat.packetsReceived, before.received) || changedCounter(stat.packetsSent, before.sent) ||
          changedCounter(stat.framesEncoded, before.frames) || changedCounter(stat.reportsReceived, before.reports) || changedCounter(stat.roundTripTimeMeasurements, before.measurements);
        const snapshot: QualitySnapshot = {
          sampledAt: updated ? now : before?.sampledAt || now, timestamp,
          received: number(stat.packetsReceived), lost: number(stat.packetsLost), sent: number(stat.packetsSent),
          frames: number(stat.framesEncoded), encode: number(stat.totalEncodeTime), delay: number(stat.totalPacketSendDelay), bytes: number(stat.bytesSent),
          reports: number(stat.reportsReceived), measurements: number(stat.roundTripTimeMeasurements), remoteTimestamp: number(stat.remoteTimestamp),
          fraction: number(stat.fractionLost), jitter: number(stat.jitter), freezes: number(stat.freezeCount), buffer: number(stat.jitterBufferDelay), emitted: number(stat.jitterBufferEmittedCount),
          responses: number(stat.responsesReceived), rtt: number(stat.currentRoundTripTime),
        };
        next.set(key, snapshot);
        if (stat.type === "candidate-pair" && (selectedPair ? stat.id === selectedPair : stat.nominated && stat.state === "succeeded")) {
          if (number(stat.availableOutgoingBitrate) !== undefined && stat.availableOutgoingBitrate > 0) availableBitrate = stat.availableOutgoingBitrate;
          const freshRtt = updated && (snapshot.responses === undefined || !before ? true : changedCounter(snapshot.responses, before.responses));
          if (freshRtt) {
            freshNetwork = true;
            // A distant relay can have a stable 600ms path without packet loss.
            // Keep extreme delay visible, but shrinking video cannot remove
            // propagation latency and must not be triggered by RTT alone.
            if (snapshot.rtt !== undefined && snapshot.rtt >= 1.2) freshPoor = true;
          }
        }
        const received = increase(snapshot.received, before?.received), lost = increase(snapshot.lost, before?.lost);
        const packets = (received || 0) + (lost || 0);
        const intervalLoss = before && received !== undefined && lost !== undefined && packets >= 20 ? lost / packets : undefined;
        if (stat.type === "remote-inbound-rtp") {
          let impairedUntil = Number(before?.impairedUntil || 0), impairment = Number(before?.impairment || 0);
          let latencyUntil = Number(before?.latencyUntil || 0);
          // A collection timestamp advances even when the last RTCP report did
          // not. Prefer actual feedback counters; packet/remote timestamps are
          // the fallback, even if an optional measurement marker stays at zero.
          // Unchanged loss/jitter gauges are not another receiver report.
          const markerAdvanced = !before ? (snapshot.reports || snapshot.measurements || snapshot.remoteTimestamp || 0) > 0 :
              changedCounter(snapshot.reports, before.reports) || changedCounter(snapshot.measurements, before.measurements) ||
              snapshot.remoteTimestamp !== undefined && before.remoteTimestamp !== undefined && snapshot.remoteTimestamp > before.remoteTimestamp;
          const feedback = updated && (markerAdvanced || !!before &&
            (changedCounter(snapshot.received, before.received) || changedCounter(snapshot.lost, before.lost) ||
              snapshot.fraction !== undefined && before.fraction !== undefined && snapshot.fraction !== before.fraction ||
              snapshot.jitter !== undefined && before.jitter !== undefined && snapshot.jitter !== before.jitter));
          const reset = !!before && ([ [snapshot.reports, before.reports], [snapshot.measurements, before.measurements],
            [snapshot.received, before.received], [snapshot.lost, before.lost] ].some(([value, previous]) => value !== undefined && previous !== undefined && value < previous));
          if (reset) { impairedUntil = latencyUntil = impairment = 0; }
          if (feedback && !reset) {
            const loss = Math.max(snapshot.fraction !== undefined && snapshot.fraction >= 0 && snapshot.fraction <= 1 ? snapshot.fraction : 0, intervalLoss || 0);
            impairment = loss > .2 || stat.jitter > .2 ? 2 : loss > .08 || stat.jitter > .08 ? 1 : 0;
            impairedUntil = impairment ? now + RECEIVER_EVIDENCE_MS : 0;
            latencyUntil = stat.roundTripTime >= 1.2 ? now + RECEIVER_EVIDENCE_MS : 0;
            freshNetwork = freshOutgoing = true;
            if (impairment || latencyUntil) freshPoor = true;
            if (impairment) outgoingPoor = true;
            if (impairment > 1) outgoingSevere = true;
          }
          if (impairedUntil > now) heldPoor = heldOutgoingPoor = true;
          if (latencyUntil > now) heldPoor = true;
          Object.assign(snapshot, { impairment, impairedUntil, latencyUntil });
        }
        if (stat.type === "inbound-rtp" && before && updated) {
          const freezes = increase(snapshot.freezes, before.freezes), emitted = increase(snapshot.emitted, before.emitted), buffer = increase(snapshot.buffer, before.buffer);
          const receiving = packets >= 20 || (emitted || 0) >= 8;
          if (receiving) {
            freshNetwork = true;
            // Receiving a bad picture must not reduce the picture we send.
            // A decoder/render freeze can be local CPU work or startup. Treat
            // it as a network warning only with fresh jitter/packet evidence.
            if ((intervalLoss || 0) > .08 || emitted && buffer !== undefined && buffer / emitted > .2 ||
              (freezes || 0) > 0 && stat.jitter > .08) freshPoor = true;
          }
        }
        if (stat.type === "outbound-rtp" && (stat.kind === "video" || stat.mediaType === "video") && state.camera && stat.active !== false && before && updated) {
          const frames = increase(snapshot.frames, before.frames), sent = increase(snapshot.sent, before.sent), encode = increase(snapshot.encode, before.encode), delay = increase(snapshot.delay, before.delay);
          const elapsed = (now - before.sampledAt) / 1000, bytes = increase(snapshot.bytes, before.bytes);
          if (bytes !== undefined && elapsed > 0) sentBitrate = bytes * 8 / elapsed;
          if ((frames || 0) >= 8 || (sent || 0) >= 20) freshOutgoing = freshNetwork = true;
          if (frames && frames >= 8) {
            cpu ||= stat.qualityLimitationReason === "cpu" || encode !== undefined && encode / frames > 1 / PROFILES[current.level].maxFramerate;
            const source = report.get(stat.mediaSourceId), sourceFps = number(source?.framesPerSecond), encodedFps = elapsed > 0 ? frames / elapsed : undefined;
            if (stat.qualityLimitationReason === "bandwidth" && sourceFps !== undefined && sourceFps >= 18 && encodedFps !== undefined && encodedFps < sourceFps * .65) {
              outgoingPoor = freshPoor = true;
              outgoingSevere ||= encodedFps < 8;
            }
          }
          if (sent && sent >= 20 && delay !== undefined && delay / sent > .08) {
            outgoingPoor = freshPoor = true;
            outgoingSevere ||= delay / sent > .2;
          }
        }
      });
      current.stats = next;
      // Warning hysteresis is independent of sender adaptation. Stale RTCP can
      // hold a recent warning briefly, but cannot count as another bad sample.
      if (freshPoor) { current.poorSamples++; current.goodSamples = 0; }
      else if (!heldPoor && freshNetwork) { current.goodSamples++; current.poorSamples = 0; }
      if (current.poorSamples >= 2 && state.quality !== "poor") publish({ quality: "poor" });
      else if (current.goodSamples >= 3 && state.quality !== "good") publish({ quality: "good" });
      if (current.voice || !state.camera) return;
      if (outgoingPoor || cpu) {
        current.upSamples = 0; current.healthySince = 0;
        let target = outgoingSevere ? 0 : Math.max(0, current.level - 1);
        if (outgoingPoor && availableBitrate !== undefined) {
          const capacity = PROFILES.reduce((level, profile, index) => profile.maxBitrate <= availableBitrate! * .85 ? index : level, 0);
          target = Math.min(target, capacity);
        }
        current.downSamples = target === current.target ? current.downSamples + 1 : 1; current.target = target;
        if (target < current.level && current.downSamples >= 2) await tune(current, target);
      } else if (heldOutgoingPoor) {
        current.upSamples = 0; current.healthySince = 0;
      } else if (freshOutgoing) {
        current.downSamples = 0;
        current.healthySince ||= now;
        current.upSamples++;
        const headroom = availableBitrate === undefined || availableBitrate >= Math.max((sentBitrate || 0) * 1.25, PROFILES[current.level].maxBitrate * 1.05);
        // A sender cap can itself limit the bandwidth estimator. Permit a
        // bounded one-step probe after longer healthy operation so recovery
        // cannot remain locked at a small profile forever.
        const probe = now - current.healthySince >= 15000;
        if (current.level < VIDEO_MAX_LEVEL && current.upSamples >= 4 && now - current.changedAt >= VIDEO_RECOVERY_DWELL_MS && (headroom || probe)) {
          await tune(current, current.level + 1);
          current.healthySince = now;
        }
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
      recoveryStarted: 0, sampling: false, level: VIDEO_START_LEVEL, tuned: -1, target: VIDEO_START_LEVEL,
      poorSamples: 0, goodSamples: 0, downSamples: 0, upSamples: 0, changedAt: 0, healthySince: 0, stats: new Map(),
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
        const pc = new RTCPeerConnection({ iceServers: config.iceServers, bundlePolicy: "max-bundle", rtcpMuxPolicy: "require" }); current.pc = pc;
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
