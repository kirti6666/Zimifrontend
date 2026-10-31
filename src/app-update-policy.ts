import type { UpdateIdentity } from "./app-update-events";
import { configurationError } from "./config";
export interface AppRelease {
  _id: string; version: string; versionName: string; versionCode: number; packageName: string;
  releaseNotes: string; fileName: string; sizeBytes: number; sha256: string; publishedAt: string; downloadPath: string;
}
export interface UpdatePolicy { updateRequired: boolean; minimumVersionCode: number | null; release: AppRelease | null }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const build = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
const invalid = (stage: string) => Object.assign(new Error("Couldn't verify the available app version. Please try again."), { validationStage: stage });
/** Validate server and cached metadata identically; never accept an arbitrary download URL. */
export function parseUpdatePolicy(value: unknown, installed: UpdateIdentity): UpdatePolicy {
  if (!object(value) || typeof value.updateRequired !== "boolean") throw invalid("policy-envelope");
  if (value.release === null) {
    if (value.updateRequired || value.minimumVersionCode !== null) throw invalid("empty-policy");
    return { updateRequired: false, minimumVersionCode: null, release: null };
  }
  const r = value.release;
  if (!object(r) || !build(r.versionCode) || !build(value.minimumVersionCode) || value.minimumVersionCode !== r.versionCode ||
    r.packageName !== installed.packageName || typeof r._id !== "string" || !/^[a-f\d]{24}$/i.test(r._id) ||
    r.downloadPath !== `/api/v1/app/releases/${r._id}/download` || typeof r.sha256 !== "string" || !/^[a-f\d]{64}$/i.test(r.sha256) ||
    typeof r.sizeBytes !== "number" || !Number.isSafeInteger(r.sizeBytes) || r.sizeBytes < 1 || r.sizeBytes > 250 * 1024 * 1024 ||
    typeof r.versionName !== "string" || !r.versionName.trim() || r.versionName.length > 100 ||
    typeof r.publishedAt !== "string" || !Number.isFinite(Date.parse(r.publishedAt))) throw invalid("release-fields");
  const required = installed.versionCode < r.versionCode;
  if (value.updateRequired !== required) throw invalid("update-decision");
  const release: AppRelease = {
    _id: r._id, version: typeof r.version === "string" ? r.version.slice(0, 100) : r.versionName,
    versionName: r.versionName, versionCode: r.versionCode, packageName: installed.packageName,
    releaseNotes: typeof r.releaseNotes === "string" ? r.releaseNotes.slice(0, 4000) : "",
    fileName: typeof r.fileName === "string" ? r.fileName.slice(0, 200) : "BinzoLive.apk",
    sizeBytes: r.sizeBytes, sha256: r.sha256.toLowerCase(), publishedAt: r.publishedAt, downloadPath: r.downloadPath as string,
  };
  return { updateRequired: required, minimumVersionCode: r.versionCode, release };
}
export async function fetchUpdatePolicy(apiUrl: string, installed: UpdateIdentity): Promise<UpdatePolicy> {
  // Use the API's Debug-only local HTTP policy for version checks as well.
  if (configurationError(apiUrl)) throw invalid("api-origin");
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => {
      abort.abort(); reject(new Error("The version check took too long. Check your connection and retry."));
    }, 12000); });
    return await Promise.race([(async () => {
      const url = `${apiUrl}/app/update-check?platform=android&versionCode=${installed.versionCode}`;
      const response = await fetch(url, { headers: { Accept: "application/json" }, credentials: "omit", redirect: "error", cache: "no-store", signal: abort.signal });
      if (!response.ok) throw new Error("Can't check for app updates. Please try again.");
      const body: unknown = await response.json();
      if (!object(body) || body.success !== true) throw invalid("response-envelope");
      return parseUpdatePolicy(body.data, installed);
    })(), timeout]);
  } catch (error) {
    if (error instanceof Error && "validationStage" in error) console.warn("APP_UPDATE_INVALID", error.validationStage);
    throw error;
  } finally { clearTimeout(timer); }
}
