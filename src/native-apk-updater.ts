import { NativeEventEmitter, NativeModules, Platform } from "react-native";

export interface InstalledAndroidApp {
  supported: boolean;
  packageName: string;
  versionName: string;
  versionCode: number;
}
export interface ApkDownloadRequest {
  url: string;
  sha256: string;
  sizeBytes: number;
  versionCode: number;
  releaseId: string;
}
export interface VerifiedApkReceipt {
  receiptId: string;
  releaseId: string;
  versionCode: number;
  sizeBytes: number;
  sha256: string;
}
export interface ApkDownloadProgress {
  releaseId: string;
  downloadedBytes: number;
  totalBytes: number;
  phase: "downloading" | "verifying" | "ready" | "cancelled";
}
export type ApkInstallResult = { status: "installer_opened" | "permission_required" };

interface NativeUpdater {
  getInstalledApp(): Promise<InstalledAndroidApp>;
  downloadRelease(release: ApkDownloadRequest): Promise<VerifiedApkReceipt>;
  getVerifiedRelease(releaseId: string): Promise<VerifiedApkReceipt | null>;
  installRelease(receiptId: string): Promise<ApkInstallResult>;
  cancelDownload(releaseId: string, discard: boolean): Promise<void>;
  addListener(event: string): void;
  removeListeners(count: number): void;
}
const native = Platform.OS === "android" ? NativeModules.BinzoApkUpdater as NativeUpdater | undefined : undefined;
const MAX_APK_BYTES = 250 * 1024 * 1024;
function updater(): NativeUpdater {
  if (!native) throw Object.assign(new Error("In-app updates are unavailable in this build."), { code: "UPDATE_UNAVAILABLE" });
  return native;
}
function validReleaseId(value: string): boolean { return /^[A-Za-z0-9_-]{1,100}$/.test(value); }

/** Native app code only; no updater method is exposed through the WebView bridge. */
export async function getInstalledApp(): Promise<InstalledAndroidApp> {
  return native ? native.getInstalledApp() : { supported: false, packageName: "", versionName: "", versionCode: 0 };
}
export async function downloadRelease(release: ApkDownloadRequest): Promise<VerifiedApkReceipt> {
  let url: URL;
  try { url = new URL(release.url); } catch { throw new Error("The update download address is invalid."); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || !validReleaseId(release.releaseId) ||
    !/^[a-f\d]{64}$/i.test(release.sha256) || !Number.isSafeInteger(release.sizeBytes) || release.sizeBytes < 1 || release.sizeBytes > MAX_APK_BYTES ||
    !Number.isSafeInteger(release.versionCode) || release.versionCode < 1 || release.versionCode > 2147483647)
    throw new Error("This update has invalid download details. Please check again.");
  return updater().downloadRelease({ ...release, sha256: release.sha256.toLowerCase() });
}
export async function getVerifiedRelease(releaseId: string): Promise<VerifiedApkReceipt | null> {
  if (!validReleaseId(releaseId)) throw new Error("The update release is invalid.");
  return updater().getVerifiedRelease(releaseId);
}
export async function installRelease(receiptId: string): Promise<ApkInstallResult> {
  if (!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(receiptId)) throw new Error("Download and verify this update before installing it.");
  return updater().installRelease(receiptId);
}
/** Retain a resumable partial by default; superseded releases can discard it. */
export async function cancelDownload(releaseId: string, discard = false): Promise<void> {
  if (!validReleaseId(releaseId)) return;
  if (native) await native.cancelDownload(releaseId, discard);
}
export function addDownloadProgressListener(listener: (progress: ApkDownloadProgress) => void): () => void {
  if (!native) return () => {};
  const subscription = new NativeEventEmitter(native).addListener("BinzoApkUpdaterProgress", (event: ApkDownloadProgress) => {
    if (event && validReleaseId(event.releaseId) && ["downloading", "verifying", "ready", "cancelled"].includes(event.phase) &&
      Number.isFinite(event.downloadedBytes) && Number.isFinite(event.totalBytes)) listener(event);
  });
  return () => subscription.remove();
}
