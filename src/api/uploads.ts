import { getSessionVersion } from "../session";
import { ApiError, request } from "./client";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function ensureSession(version: number): void {
  if (getSessionVersion() !== version) throw new ApiError("Your sign-in changed. Please try again.", 401);
}

// Decode inside the native layer. Image data never enters a JSON API body.
export function decodePhoto(source: string): { contentType: string; bytes: ArrayBuffer } {
  if (typeof source !== "string") throw new ApiError("Choose a valid photo.", 400);
  const comma = source.indexOf(",");
  const header = source.slice(0, comma), encoded = source.slice(comma + 1);
  const matched = /^data:(image\/(?:jpeg|png|webp));base64$/.exec(header);
  if (!matched || !encoded || encoded.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new ApiError("Choose a JPEG, PNG or WebP photo smaller than 5 MB.", 400);
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  const length = encoded.length / 4 * 3 - padding;
  if (length <= 0 || length > MAX_PHOTO_BYTES) throw new ApiError("Each photo must be smaller than 5 MB.", 400);
  const bytes = new Uint8Array(length);
  let cursor = 0;
  for (let index = 0; index < encoded.length; index += 4) {
    const a = ALPHABET.indexOf(encoded[index]), b = ALPHABET.indexOf(encoded[index + 1]);
    const c = ALPHABET.indexOf(encoded[index + 2]), d = ALPHABET.indexOf(encoded[index + 3]);
    const bits = a << 18 | b << 12 | Math.max(0, c) << 6 | Math.max(0, d);
    if (cursor < length) bytes[cursor++] = bits >>> 16 & 255;
    if (cursor < length) bytes[cursor++] = bits >>> 8 & 255;
    if (cursor < length) bytes[cursor++] = bits & 255;
  }
  const type = matched[1];
  const signatureMatches = type === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : type === "image/png" ? [137,80,78,71,13,10,26,10].every((byte, index) => bytes[index] === byte)
      : [82,73,70,70].every((byte, index) => bytes[index] === byte) && [87,69,66,80].every((byte, index) => bytes[index + 8] === byte);
  if (!signatureMatches) throw new ApiError("This photo could not be read. Choose a different image.", 400);
  return { contentType: type, bytes: bytes.buffer };
}
function safeUploadUrl(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new ApiError("The photo upload service returned an invalid address.", 502); }
  const development = typeof __DEV__ !== "undefined" && __DEV__;
  const local = /^(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(url.hostname);
  if ((url.protocol !== "https:" && !(development && local && url.protocol === "http:")) || url.username || url.password || url.hash) throw new ApiError("The photo upload address must use a secure connection.", 502);
  return url.toString();
}
type PhotoPurpose = "avatar" | "cover" | "post" | "chat";
async function sendPhoto(source: string, version: number, route: string, purpose?: PhotoPurpose): Promise<string> {
  ensureSession(version);
  const { contentType, bytes } = decodePhoto(source);
  const upload = await request<{ uploadUrl: string; key: string }>("POST", route, { ...(purpose ? { purpose } : {}), contentType, contentLength: bytes.byteLength });
  ensureSession(version);
  if (!upload || typeof upload.uploadUrl !== "string" || typeof upload.key !== "string" || !upload.key) throw new ApiError("The photo upload could not be prepared. Try again.", 502);
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(safeUploadUrl(upload.uploadUrl), { method: "PUT", headers: { "Content-Type": contentType }, body: bytes, credentials: "omit", redirect: "error", signal: controller.signal });
    if (!response.ok) throw new ApiError("Your photo could not be uploaded. Please try again.", response.status);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(controller.signal.aborted ? "Photo upload timed out. Check your connection and try again." : "Your photo could not be uploaded. Check your connection and try again.", 0);
  } finally { clearTimeout(timeout); }
  ensureSession(version);
  return upload.key;
}
export function uploadMedia(source: string, purpose: PhotoPurpose, version: number): Promise<string> {
  return sendPhoto(source, version, "/media/upload-url", purpose);
}
export async function uploadPhotos(sources: string[], version: number, progress?: (done: number, total: number) => void, existingPhotos: { key: string; url: string }[] = []): Promise<string[]> {
  if (sources.length < 3 || sources.length > 6) throw new ApiError("Choose between 3 and 6 photos to continue.", 400);
  // These mappings come only from authenticated /auth/me. A URL supplied by the
  // screen cannot become a storage key or cause a remote image download.
  const existing = new Map(existingPhotos.map(photo => [photo.url, photo.key]));
  const reused = new Set<string>();
  // Validate the entire batch before making network requests.
  sources.forEach(source => {
    const key = existing.get(source);
    if (key) {
      if (reused.has(key)) throw new ApiError("Choose a different image for each photo in your profile.", 400);
      reused.add(key);
    } else {
      if (typeof source === "string" && !source.startsWith("data:")) throw new ApiError("This saved photo is no longer available in your profile. Add it again from your gallery.", 400);
      decodePhoto(source);
    }
  });
  const keys: string[] = [];
  progress?.(0, sources.length);
  for (const source of sources) {
    ensureSession(version);
    const existingKey = existing.get(source);
    if (existingKey) {
      keys.push(existingKey);
      progress?.(keys.length, sources.length);
      continue;
    }
    keys.push(await sendPhoto(source, version, "/auth/profile/avatar/upload-url"));
    progress?.(keys.length, sources.length);
  }
  return keys;
}
