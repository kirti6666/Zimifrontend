export type NativeMediaRequest = { requestId: number; action: string; data?: Record<string, unknown> };
export type VideoSlot = { kind: "local" | "remote"; x: number; y: number; width: number; height: number; radius: number; fit: "contain" | "cover" };
export type NativeMediaLayout = { width: number; height: number; slots: VideoSlot[] };
export type NativeMediaMessage =
  | { type: "native.media"; data: NativeMediaRequest }
  | { type: "native.media.layout"; data: NativeMediaLayout };
export type NativeMediaEvent = {
  type: "native.media.result" | "native.media.state" | "native.media.dimensions";
  data: Record<string, unknown>;
};

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
const finite = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const boolean = (v: unknown) => typeof v === "boolean";
// Native Basic-plan operations, with the same ranges as the web controls.
const amount = new Set(["setSmoothing", "setWhitening", "setRosiness", "setBlemish", "setClarity"]);
const color = new Set(["setBrightness", "setContrast", "setSaturation", "setColorTemperature", "setColorTint"]);
export function validNativeMediaRequest(v: Record<string, unknown>): boolean {
  if (!keys(v, ["requestId", "action", "data"]) || !Number.isSafeInteger(v.requestId) || Number(v.requestId) <= 0) return false;
  const d = v.data ?? {};
  if (!record(d)) return false;
  switch (v.action) {
    case "prepare": return keys(d, ["video"]) && boolean(d.video);
    case "stop": case "flipCamera": return keys(d, []);
    case "setPlaybackMuted": return keys(d, ["muted"]) && boolean(d.muted);
    case "controls": return keys(d, ["camera", "microphone"]) && boolean(d.camera) && boolean(d.microphone);
    case "handoff": return keys(d, ["callId"]) && typeof d.callId === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(d.callId);
    case "beauty": return keys(d, ["settings", "enabled"]) && boolean(d.enabled) && Array.isArray(d.settings) && d.settings.length <= 20 && d.settings.every(command => {
      if (!Array.isArray(command) || command.length !== 2 || typeof command[0] !== "string" || !Array.isArray(command[1]) || command[1].length !== 1) return false;
      const [method, [value]] = command;
      return amount.has(method) ? finite(value, 0, 1) : color.has(method) ? finite(value, -1, 1) : method === "setBeautySkinOnly" ? boolean(value) :
        ["setSmoothingStyle", "setWhiteningStyle"].includes(method) && Number.isInteger(value) && finite(value, 0, 10);
    });
    default: return false;
  }
}

export function validNativeMediaLayout(v: Record<string, unknown>): boolean {
  return keys(v, ["width", "height", "slots"]) && finite(v.width, 1, 10000) && finite(v.height, 1, 10000) && Array.isArray(v.slots) && v.slots.length <= 2 &&
    new Set(v.slots.map(slot => record(slot) ? slot.kind : null)).size === v.slots.length && v.slots.every(slot => record(slot) &&
      keys(slot, ["kind", "x", "y", "width", "height", "radius", "fit"]) && ["local", "remote"].includes(String(slot.kind)) &&
      finite(slot.x, -10000, 10000) && finite(slot.y, -10000, 10000) && finite(slot.width, 1, 10000) && finite(slot.height, 1, 10000) &&
      finite(slot.radius, 0, 5000) && ["contain", "cover"].includes(String(slot.fit)));
}
