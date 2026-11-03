import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { mediaDevices, type MediaStream, RTCView } from "react-native-webrtc";

import { api } from "../api/endpoints";
import { createNativeLoopback, type NativeLoopbackStats } from "./loopback";
import {
  applyBeauty, BEAUTY_PROCESSOR, beautyStats, type BeautyStats, configureBeauty, onBeautyStatus,
  releaseBeauty, setBeautyEnabled,
} from "../../modules/binzo-media";

/* Development-only native camera/beauty/encoder+decoder loopback. It never
   creates a backend call or sends media to another account. */
export const NATIVE_CAMERA_TEST = typeof __DEV__ !== "undefined" && __DEV__ && process.env.EXPO_PUBLIC_NATIVE_CAMERA_TEST === "1";

const CAMERA = { facingMode: "user", width: 1920, height: 1440, frameRate: 30 } as const;
const SKIN = [["setSmoothing", [0.6]], ["setWhitening", [0.3]], ["setRosiness", [0.15]], ["setClarity", [0.2]]] as const;

export function NativeCameraTest({ onClose }: { onClose: () => void }) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [stats, setStats] = useState<BeautyStats | null>(null);
  const [loopStats, setLoopStats] = useState<NativeLoopbackStats | null>(null);
  const [capture, setCapture] = useState("");
  const [message, setMessage] = useState("Starting camera...");
  const [beautyOn, setBeautyOn] = useState(true);
  const [license, setLicense] = useState("");
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false, sampling = false;
    let loopback: ReturnType<typeof createNativeLoopback> | null = null;
    const started = Date.now();
    // Provider error messages can contain private diagnostics. Logs below contain
    // only whitelisted performance values, never errors or credentials.
    const failure = (error: unknown) => error instanceof Error ? error.name : "Error";
    const status = onBeautyStatus(next => { if (!cancelled) setMessage(`Beauty: ${next}`); });
    (async () => {
      try {
        const opened = await mediaDevices.getUserMedia({ audio: false, video: CAMERA });
        if (cancelled) { opened.getTracks().forEach(track => track.stop()); opened.release(false); return; }
        streamRef.current = opened;
        setStream(opened);
        const track = opened.getVideoTracks()[0];
        const settings = track?.getSettings();
        setCapture(settings ? `${settings.width}x${settings.height} @ ${settings.frameRate}` : "");
        applyBeauty(SKIN.map(([name, args]) => [name, [...args]]));
        setBeautyEnabled(true);
        track?._setVideoEffects([BEAUTY_PROCESSOR]);
        setMessage("Requesting Android license...");
        const { licenseToken } = await api.beautyAuthAndroid();
        if (cancelled) return;
        configureBeauty(licenseToken);
        setLicense("Android authorization");
        loopback = createNativeLoopback(opened, next => { if (!cancelled) setRemote(next); });
        await loopback.ready;
        if (!cancelled) setMessage("Native 1080p loopback running");
      } catch (error) {
        loopback?.stop();
        if (!cancelled) setMessage(`Native benchmark could not start (${failure(error)})`);
      }
    })();
    const timer = setInterval(() => {
      if (cancelled || sampling) return;
      sampling = true;
      void (async () => {
        try {
          const beauty = beautyStats(), measured = await loopback?.sample();
          if (cancelled) return;
          setStats(beauty);
          if (measured) setLoopStats(measured);
          const camera = streamRef.current?.getVideoTracks()[0]?.getSettings();
          // No SDP, ICE, addresses, account data, license or provider response.
          console.log(`BinzoNative1080 ${JSON.stringify({
            elapsedMs: Date.now() - started,
            camera: { width: camera?.width || 0, height: camera?.height || 0, fps: camera?.frameRate || 0 },
            beauty: beauty ? {
              status: beauty.status, enabled: beauty.enabled, width: beauty.width || 0, height: beauty.height || 0,
              fps: beauty.fps || 0, inputWidth: beauty.inputWidth || 0, inputHeight: beauty.inputHeight || 0,
              inputFps: beauty.inputFps || 0, frameMs: beauty.frameMs || 0, frameMaxMs: beauty.frameMaxMs || 0,
              sdkMs: beauty.sdkMs || 0, dropped: beauty.dropped || 0,
            } : null,
            sender: measured?.sender || null, receiver: measured?.receiver || null,
            localRttMs: measured?.localRttMs || 0,
            senderState: measured?.senderState || "new", receiverState: measured?.receiverState || "new",
          })}`);
        } catch (error) {
          if (!cancelled) setMessage(`Native benchmark sampling failed (${failure(error)})`);
        } finally { sampling = false; }
      })();
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      status?.remove();
      loopback?.stop();
      const opened = streamRef.current;
      streamRef.current = null;
      void releaseBeauty().finally(() => {
        opened?.getTracks().forEach(track => track.stop());
        opened?.release(false);
      });
    };
  }, []);

  const toggle = () => { setBeautyEnabled(!beautyOn); setBeautyOn(!beautyOn); };
  const lines = [
    "1080p native encode/decode loopback",
    message,
    license,
    `capture ${capture || "..."}`,
    stats?.width ? `camera ${stats.cameraWidth}x${stats.cameraHeight} rot ${stats.rotation} -> processed ${stats.width}x${stats.height}` : "processed ...",
    stats?.fps ? `${stats.fps.toFixed(1)} fps / frame ${stats.frameMs?.toFixed(1)} ms / sdk ${stats.sdkMs?.toFixed(1)} ms / dropped ${stats.dropped}` : "",
    stats?.gl || "",
    stats ? `status ${stats.status} / supported ${stats.supported}` : "native module unavailable",
    loopStats ? `send ${loopStats.sender.width}x${loopStats.sender.height} ${loopStats.sender.fps.toFixed(1)} fps (${loopStats.sender.frames} encoded)` : "sender starting...",
    loopStats ? `receive ${loopStats.receiver.width}x${loopStats.receiver.height} ${loopStats.receiver.fps.toFixed(1)} fps (${loopStats.receiver.frames} decoded)` : "decoder starting...",
    loopStats ? `${loopStats.sender.codec} / local RTT ${loopStats.localRttMs.toFixed(1)} ms` : "",
  ].filter(Boolean);

  return (
    <View style={styles.root}>
      {stream ? <RTCView streamURL={stream.toURL()} objectFit="contain" mirror style={StyleSheet.absoluteFill} /> : null}
      {remote ? <View style={styles.decoder}><RTCView streamURL={remote.toURL()} objectFit="contain" zOrder={1} style={StyleSheet.absoluteFill} /></View> : null}
      <View style={styles.panel}>{lines.map(line => <Text key={line} style={styles.line}>{line}</Text>)}</View>
      <View style={styles.actions}>
        <Pressable onPress={toggle} style={styles.button}><Text style={styles.label}>{beautyOn ? "Beauty off" : "Beauty on"}</Text></Pressable>
        <Pressable onPress={onClose} style={styles.button}><Text style={styles.label}>Close</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: "#000000" },
  panel: { position: "absolute", top: 48, left: 12, right: 12, padding: 10, borderRadius: 10, backgroundColor: "#00000099" },
  line: { color: "#ffffff", fontSize: 12, lineHeight: 18 },
  decoder: { position: "absolute", width: 112, height: 200, right: 12, bottom: 100, backgroundColor: "#000000" },
  actions: { position: "absolute", bottom: 40, left: 12, right: 12, flexDirection: "row", justifyContent: "space-between" },
  button: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, backgroundColor: "#ffffffdd" },
  label: { color: "#101012", fontWeight: "700", fontSize: 14 },
});
