import { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { RTCView } from "react-native-webrtc";
import { nativeMediaAvailable } from "../../modules/binzo-media";
import type { NativeMediaState } from "./controller";
import type { NativeMediaLayout } from "./protocol";

// Older/iOS binaries retain the browser media path until a native module exists.
export const NATIVE_MEDIA_ENABLED = Platform.OS === "android" && nativeMediaAvailable;

export function NativeMediaLayer({ state, layout, onDimensions }: {
  state: NativeMediaState | null;
  layout: NativeMediaLayout | null;
  onDimensions: (kind: "local" | "remote", width: number, height: number) => void;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const scale = size.width && layout?.width ? size.width / layout.width : 1;
  const slots = [...layout?.slots || []].sort((a, b) => b.width * b.height - a.width * a.height);
  return <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={event => setSize(event.nativeEvent.layout)}>
    {slots.map((slot, index) => {
      const stream = slot.kind === "local" ? state?.local : state?.remote;
      if (!stream || slot.kind === "local" && !state?.camera) return null;
      return <View key={slot.kind} style={{ position: "absolute", left: slot.x * scale, top: slot.y * scale, width: slot.width * scale, height: slot.height * scale, borderRadius: slot.radius * scale, overflow: "hidden" }}>
        <RTCView style={StyleSheet.absoluteFill} streamURL={stream.toURL()} objectFit={slot.fit}
          mirror={slot.kind === "local" && state?.facing === "user"} zOrder={index === 0 ? 0 : 1}
          onDimensionsChange={event => onDimensions(slot.kind, event.nativeEvent.width, event.nativeEvent.height)} />
      </View>;
    })}
  </View>;
}
