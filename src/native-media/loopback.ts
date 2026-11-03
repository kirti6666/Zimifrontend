import { MediaStream, RTCPeerConnection } from "react-native-webrtc";

type Report = Map<string, Record<string, any>>;
export type LoopbackVideoStats = {
  width: number; height: number; fps: number; frames: number; codec: string;
};
export type NativeLoopbackStats = {
  sender: LoopbackVideoStats; receiver: LoopbackVideoStats;
  localRttMs: number; senderState: string; receiverState: string;
};

const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;

/** Development diagnostic only: two local native peers, no account signaling,
 * STUN, TURN, remote user, audio, or WebView frame transport. The caller owns
 * camera/beauty lifetime. stop() closes only these peers and the decoded stream. */
export function createNativeLoopback(
  stream: MediaStream,
  onRemote: (remote: MediaStream | null) => void,
  factory: () => RTCPeerConnection = () => new RTCPeerConnection({ iceServers: [], bundlePolicy: "max-bundle" }),
) {
  const sender = factory(), receiver = factory();
  const candidates = new Map<RTCPeerConnection, unknown[]>([[sender, []], [receiver, []]]);
  const history = new Map<string, { timestamp: number; frames: number }>();
  let closed = false, remote: MediaStream | null = null;

  const open = () => { if (closed) throw new Error("Native loopback closed."); };
  async function candidate(target: RTCPeerConnection, value: unknown) {
    if (closed || !value) return;
    if (!target.remoteDescription) { candidates.get(target)!.push(value); return; }
    try { await target.addIceCandidate(value); } catch (_) { /* A close can invalidate local ICE work. */ }
  }
  async function flush(target: RTCPeerConnection) {
    for (const value of candidates.get(target)!.splice(0)) { open(); await target.addIceCandidate(value); }
  }
  sender.addEventListener("icecandidate", event => { void candidate(receiver, event.candidate?.toJSON()); });
  receiver.addEventListener("icecandidate", event => { void candidate(sender, event.candidate?.toJSON()); });
  receiver.addEventListener("track", event => {
    if (closed || !event.track || event.track.kind !== "video") return;
    remote = event.streams[0] || new MediaStream([event.track]);
    onRemote(remote);
  });

  async function tune() {
    const video = sender.getSenders().find(current => current.track?.kind === "video");
    if (!video) throw new Error("Native loopback video sender unavailable.");
    const parameters = video.getParameters();
    if (!parameters.encodings.length) throw new Error("Native loopback encoding parameters unavailable.");
    parameters.encodings.forEach(encoding => Object.assign(encoding, {
      maxBitrate: 2500000, maxFramerate: 30, scaleResolutionDownBy: 1,
    }));
    parameters.degradationPreference = "maintain-resolution";
    await video.setParameters(parameters);
    open();
  }
  const ready = (async () => {
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error("Native loopback camera unavailable.");
    sender.addTrack(track, stream);
    const offer = await sender.createOffer(); open();
    await sender.setLocalDescription(offer); open();
    // Set real native encoder limits before the other peer sees the final SDP.
    await tune();
    await receiver.setRemoteDescription(sender.localDescription!); open();
    await flush(receiver);
    const answer = await receiver.createAnswer(); open();
    await receiver.setLocalDescription(answer); open();
    await sender.setRemoteDescription(receiver.localDescription!); open();
    await flush(sender);
    await tune();
  })();

  function videoStats(report: Report, direction: "outbound-rtp" | "inbound-rtp"): LoopbackVideoStats {
    const current = [...report.values()].find(value => value.type === direction && (value.kind === "video" || value.mediaType === "video"));
    if (!current) return { width: 0, height: 0, fps: 0, frames: 0, codec: "" };
    const frames = number(direction === "outbound-rtp" ? current.framesEncoded : current.framesDecoded);
    const timestamp = number(current.timestamp), before = history.get(direction);
    const measured = before && timestamp > before.timestamp ? Math.max(0, frames - before.frames) * 1000 / (timestamp - before.timestamp) : 0;
    history.set(direction, { timestamp, frames });
    const codec = report.get(current.codecId)?.mimeType;
    return {
      width: number(current.frameWidth), height: number(current.frameHeight),
      fps: number(current.framesPerSecond) || measured, frames,
      codec: typeof codec === "string" ? codec.slice(0, 80) : "",
    };
  }
  async function sample(): Promise<NativeLoopbackStats | null> {
    if (closed) return null;
    const [outbound, inbound]: [Report, Report] = await Promise.all([sender.getStats(), receiver.getStats()]);
    if (closed) return null;
    let pairId = "";
    outbound.forEach(value => { if (value.type === "transport" && value.selectedCandidatePairId) pairId = value.selectedCandidatePairId; });
    const pair = pairId ? outbound.get(pairId) : [...outbound.values()].find(value => value.type === "candidate-pair" && value.nominated && value.state === "succeeded");
    return {
      sender: videoStats(outbound, "outbound-rtp"), receiver: videoStats(inbound, "inbound-rtp"),
      localRttMs: number(pair?.currentRoundTripTime) * 1000,
      senderState: sender.connectionState, receiverState: receiver.connectionState,
    };
  }
  function stop() {
    if (closed) return;
    closed = true;
    candidates.forEach(queue => { queue.length = 0; });
    sender.close(); receiver.close();
    remote?.release(false); remote = null;
    onRemote(null);
  }
  return { ready, sample, stop };
}
