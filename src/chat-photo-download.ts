import { requireOptionalNativeModule } from "expo";
import { fetch } from "expo/fetch";
import { File, Paths } from "expo-file-system";
import { Image, Platform } from "react-native";
import { api } from "./api/endpoints";
import { ApiError } from "./api/client";
import { getSessionVersion } from "./session";

const MAX_BYTES = 5 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 20000;
let sequence = 0;

function secureUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && url.hostname && !url.username && !url.password && !url.hash && !/[\s\\]/.test(value)) return url.href;
  } catch {}
  throw new ApiError("This photo does not have a secure download address.", 502);
}

function photoExtension(bytes: Uint8Array, contentType: string): string {
  const starts = (signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  if (contentType === "image/jpeg" && bytes.length >= 4 && starts([255, 216, 255]) && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217) return "jpg";
  if (contentType === "image/png" && bytes.length >= 33 && starts([137, 80, 78, 71, 13, 10, 26, 10])) return "png";
  if (contentType === "image/webp" && bytes.length >= 20 && starts([82, 73, 70, 70]) && [87, 69, 66, 80].every((byte, index) => bytes[index + 8] === byte)) return "webp";
  throw new ApiError("This download is not a supported photo. Choose a JPEG, PNG, or WebP photo.", 422);
}

/**
 * expo-media-library needs its native module as soon as it loads, and Expo Go or an app built
 * before the module was added has none. Loading it on the Download tap keeps the rest of the app running.
 */
async function mediaLibrary() {
  if (!requireOptionalNativeModule("ExpoMediaLibraryNext"))
    throw new ApiError("Saving photos needs the latest version of the BinzoLive app. Update the app and try again.", 501, "PHOTO_SAVE_UNAVAILABLE");
  return await import("expo-media-library");
}

/** Only a server-authorized message can reach this native gallery operation. */
export async function downloadChatPhoto(to: string, id: string, isCurrent: () => boolean): Promise<void> {
  const version = getSessionVersion();
  const ensureCurrent = () => {
    if (!isCurrent() || version !== getSessionVersion()) throw new ApiError("Your sign-in changed. Please try again.", 409);
  };
  ensureCurrent();
  const { Asset, getPermissionsAsync, requestPermissionsAsync } = await mediaLibrary();
  ensureCurrent();
  const url = secureUrl(await api.chatPhotoUrl(to, id));
  ensureCurrent();
  // This function is reached only from the person's explicit Download tap.
  // SDK57 uses scoped MediaStore insertion on Android 11+, which needs no
  // storage permission. Its legacy Android writer and iOS need add-only access.
  // Never ask for media reads or EXIF location just to save a new photo.
  if (Platform.OS !== "android" || Number(Platform.Version) < 30) {
    let permission = await getPermissionsAsync(true, []);
    ensureCurrent();
    if (!permission.granted && permission.canAskAgain) permission = await requestPermissionsAsync(true, []);
    ensureCurrent();
    if (!permission.granted) throw new ApiError("Allow BinzoLive to add photos in your device settings, then try Download again.", 403, "PHOTO_PERMISSION_DENIED");
  }

  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let file: File | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => { controller.abort(); reject(new ApiError("The photo download timed out. Please try again.", 408)); }, DOWNLOAD_TIMEOUT_MS);
  });
  try {
    const response = await Promise.race([fetch(url, { method: "GET", credentials: "omit", redirect: "error", headers: { Accept: "image/jpeg,image/png,image/webp" }, signal: controller.signal }), expired]);
    ensureCurrent();
    if (!response.ok || response.redirected || secureUrl(response.url) !== url) throw new ApiError("The photo could not be downloaded. Please try again.", 502);
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) throw new ApiError("This download is not a supported photo.", 422);
    const declared = response.headers.get("content-length");
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) <= 0 || Number(declared) > MAX_BYTES)) throw new ApiError("Photos must be no larger than 5 MB.", 413);
    if (!response.body) throw new ApiError("The photo download was empty. Please try again.", 502);
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await Promise.race([reader.read(), expired]);
      ensureCurrent();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new ApiError("Photos must be no larger than 5 MB.", 413);
      chunks.push(value);
    }
    if (!size) throw new ApiError("The photo download was empty. Please try again.", 502);
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const extension = photoExtension(bytes, contentType);
    ensureCurrent();
    file = new File(Paths.cache, `zimi-chat-photo-${Date.now()}-${++sequence}.${extension}`);
    file.create();
    file.write(bytes);
    // Have the native image decoder reject corrupt files before adding anything.
    const dimensions = await Promise.race([Image.getSize(file.uri), expired]);
    if (!(dimensions.width > 0 && dimensions.height > 0)) throw new ApiError("This photo could not be opened.", 422);
    ensureCurrent();
    // A permission prompt or slow transfer may outlive a delete/block event.
    // Recheck message visibility before the durable gallery write.
    const currentUrl = secureUrl(await Promise.race([api.chatPhotoUrl(to, id), expired]));
    ensureCurrent();
    if (currentUrl !== url) throw new ApiError("This photo changed. Reopen it and try again.", 409);
    clearTimeout(timeout);
    timeout = undefined;
    // This awaited native write is the commit point; success is never inferred
    // from the download, permission grant, or cached temporary file.
    await Asset.create(file.uri);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("The photo could not be saved. Please try again.", 502);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    controller.abort();
    void reader?.cancel().catch(() => {});
    try { if (file?.exists) file.delete(); } catch { /* The OS also clears cache files. */ }
  }
}
