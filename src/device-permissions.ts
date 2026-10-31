import { AppState, Linking, PermissionsAndroid, Platform, type Permission } from "react-native";
import { queuePermissionRequest } from "./permission-requests";
import { readPushPermission, requestPushPermission, type PushPermissionStatus } from "./push";

export type DevicePermissionStatus = PushPermissionStatus;
export interface DevicePermissions {
  camera: DevicePermissionStatus;
  microphone: DevicePermissionStatus;
  notifications: DevicePermissionStatus;
}
const unavailable = (): DevicePermissions => ({ camera: "unavailable", microphone: "unavailable", notifications: "unavailable" });
// Android check() only returns granted/not granted. Remember an explicit
// NEVER_ASK_AGAIN result without guessing that a first-time denial is blocked.
const blocked = new Set<Permission>();
let setupRequest: { promise: Promise<DevicePermissions>; current: () => boolean } | undefined;
const supported = () => Platform.OS === "android";
const sensors = () => ({ camera: PermissionsAndroid.PERMISSIONS.CAMERA, microphone: PermissionsAndroid.PERMISSIONS.RECORD_AUDIO });

async function check(permission: Permission): Promise<DevicePermissionStatus> {
  try {
    if (await PermissionsAndroid.check(permission)) { blocked.delete(permission);return "granted"; }
    return blocked.has(permission) ? "blocked" : "denied";
  } catch { return "unavailable"; }
}
async function readSensors(): Promise<Pick<DevicePermissions, "camera" | "microphone">> {
  const permissions = sensors();
  const [camera, microphone] = await Promise.all([check(permissions.camera), check(permissions.microphone)]);
  return { camera, microphone };
}
async function readCurrent(): Promise<DevicePermissions> {
  if (!supported()) return unavailable();
  const [status, notifications] = await Promise.all([readSensors(), readPushPermission()]);
  return { ...status, notifications };
}

/** No dialog, recording, media stream or backend access. */
export function readDevicePermissions(): Promise<DevicePermissions> {
  return setupRequest?.promise ?? queuePermissionRequest(readCurrent);
}

async function requestSensors(isCurrent: () => boolean): Promise<Pick<DevicePermissions, "camera" | "microphone">> {
  const status = await readSensors(), permissions = sensors();
  if (!isCurrent() || AppState.currentState !== "active") return status;
  const missing = (Object.keys(permissions) as Array<keyof typeof permissions>).filter(key => status[key] === "denied");
  if (!missing.length) return status;
  try {
    const results = await PermissionsAndroid.requestMultiple(missing.map(key => permissions[key]));
    for (const key of missing) {
      const permission = permissions[key], result = results[permission];
      if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) { blocked.add(permission);status[key] = "blocked"; }
      else if (result === PermissionsAndroid.RESULTS.GRANTED) { blocked.delete(permission);status[key] = "granted"; }
      else status[key] = result === PermissionsAndroid.RESULTS.DENIED ? "denied" : "unavailable";
    }
  } catch { for (const key of missing) status[key] = "unavailable"; }
  return status;
}

/** Called only after the registration screen's Allow action. Duplicate taps
 * share one setup, and declining never changes account completion or access. */
export function requestDevicePermissions(isCurrent: () => boolean = () => true): Promise<DevicePermissions> {
  const current = () => { try { return isCurrent(); } catch { return false; } };
  if (setupRequest) {
    if (setupRequest.current()) return setupRequest.promise;
    // A new registration never inherits the retired registration's result.
    // Its explicit action can continue once the old OS dialog has settled.
    return setupRequest.promise.then(() => current() ? requestDevicePermissions(current) : readDevicePermissions());
  }
  const request = (async (): Promise<DevicePermissions> => {
    if (!supported()) return unavailable();
    const status = await queuePermissionRequest(() => requestSensors(current));
    const notifications = current() ? await requestPushPermission("prompt", current) : await readPushPermission();
    return { ...status, notifications };
  })();
  setupRequest = { promise: request, current };
  void request.then(() => { if (setupRequest?.promise === request) setupRequest = undefined; }, () => { if (setupRequest?.promise === request) setupRequest = undefined; });
  return request;
}

/** A blocked permission is changed by the person in system settings. */
export async function openDevicePermissionSettings(isCurrent: () => boolean = () => true): Promise<void> {
  if (supported()) await queuePermissionRequest(async () => { if (AppState.currentState === "active" && isCurrent()) await Linking.openSettings(); });
}
