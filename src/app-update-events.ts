/** Native build identity stays outside the WebView and account credentials. */
export interface UpdateIdentity { packageName: string; versionName: string; versionCode: number }
let identity: UpdateIdentity | undefined;
const listeners = new Set<(required: boolean) => void>();
export function configureAppUpdates(value: UpdateIdentity): void { identity = { ...value }; }
export function getAppUpdateHeaders(): Record<string, string> {
  return identity ? { "X-App-Platform": "android", "X-App-Version-Code": String(identity.versionCode), "X-App-Update-Capable": "1" } : {};
}
export function getAppUpdateAuth(): Record<string, string | number> {
  return identity ? { appPlatform: "android", appVersionCode: identity.versionCode, appUpdateCapable: 1 } : {};
}
export function notifyAppUpdate(required = false): void {
  for (const listener of listeners) { try { listener(required); } catch { /* Isolate observers. */ } }
}
export function onAppUpdate(listener: (required: boolean) => void): () => void {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
