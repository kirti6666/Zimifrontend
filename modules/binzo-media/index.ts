import { NativeModule, requireOptionalNativeModule } from "expo";

/** Engine states reported by the camera-thread processor. */
export type BeautyStatus = "idle" | "loading" | "ready" | "authFailed" | "initFailed" | "glUnsupported" | "error";

export type BeautyStats = {
  status: BeautyStatus;
  supported: boolean;
  enabled: boolean;
  cameraWidth?: number;
  cameraHeight?: number;
  inputWidth?: number;
  inputHeight?: number;
  inputFps?: number;
  rotation?: number;
  width?: number;
  height?: number;
  fps?: number;
  frameMs?: number;
  frameMaxMs?: number;
  sdkMs?: number;
  dropped?: number;
  gl?: string;
};

/** Same shape as the WebView worker's apply commands: [operation, args]. */
export type BeautyCommand = [operation: string, args: Array<number | boolean>];

declare class BinzoMediaNative extends NativeModule<{ onBeautyStatus: (event: { status: BeautyStatus }) => void; onCallServiceStopped: (event: { callId: string; lease: string }) => void }> {
  isBeautySupported(): boolean;
  beginCallAudio(video: boolean): void;
  endCallAudio(): void;
  beginCallService(callId: string, video: boolean, lease: string): Promise<void>;
  endCallService(lease: string): void;
  configureBeauty(licenseToken: string): void;
  applyBeauty(commandsJson: string): void;
  setBeautyEnabled(enabled: boolean): void;
  getBeautyStats(): BeautyStats;
  releaseBeauty(): Promise<void>;
}

// Absent in web builds, older APKs and x86 emulators without the module.
const native = requireOptionalNativeModule<BinzoMediaNative>("BinzoMedia");

/** react-native-webrtc processor name for track._setVideoEffects. */
export const BEAUTY_PROCESSOR = "facebetter";

export const nativeMediaAvailable = !!native;

/** Own communication mode/focus only while a real call is connecting or active. */
export function startCallAudio(video: boolean): void { native?.beginCallAudio(video); }

export function stopCallAudio(): void { native?.endCallAudio(); }

/** The native service starts only for a trusted ringing/accepted call, after capture permission. */
export async function startCallService(callId: string, video: boolean, lease: string): Promise<void> { await native?.beginCallService?.(callId, video, lease); }
export function stopCallService(lease: string): void { native?.endCallService?.(lease); }
export function onCallServiceStopped(listener: (callId: string, lease: string) => void): { remove(): void } | null {
  return native ? native.addListener("onCallServiceStopped", event => listener(event.callId, event.lease)) : null;
}

export function beautySupported(): boolean {
  try { return !!native?.isBeautySupported(); } catch { return false; }
}

export function configureBeauty(licenseToken: string): void { native?.configureBeauty(licenseToken); }

export function applyBeauty(commands: BeautyCommand[]): void { native?.applyBeauty(JSON.stringify(commands)); }

export function setBeautyEnabled(enabled: boolean): void { native?.setBeautyEnabled(enabled); }

export function beautyStats(): BeautyStats | null { return native ? native.getBeautyStats() : null; }

/** Frees the engine on its owning GL thread. Await before stopping the camera track. */
export async function releaseBeauty(timeoutMs = 2000): Promise<void> {
  if (!native) return;
  await Promise.race([native.releaseBeauty(), new Promise<void>(resolve => setTimeout(resolve, timeoutMs))]);
}

export function onBeautyStatus(listener: (status: BeautyStatus) => void): { remove(): void } | null {
  return native ? native.addListener("onBeautyStatus", event => listener(event.status)) : null;
}
