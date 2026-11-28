import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";
import { requestDevicePermissions } from "./device-permissions";
import { hasStoredInstallationId } from "./installation";

const KEY = "zimi.permissions.first-launch.v1";
const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
let complete = false;
let pending: Promise<void> | undefined;

function waitForForeground(signal: AbortSignal): Promise<boolean> {
  if (signal.aborted || AppState.currentState === "active") return Promise.resolve(!signal.aborted);
  return new Promise(resolve => {
    function finish(active: boolean) {
      subscription.remove();
      signal.removeEventListener("abort", cancel);
      resolve(active);
    }
    const cancel = () => finish(false);
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") finish(true);
    });
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    else if (AppState.currentState === "active") finish(true);
  });
}

/** First open is installation-scoped. Permission results stay on the phone,
 * and the existing registration dialog remains available for denied access. */
export async function requestFirstLaunchPermissions(signal: AbortSignal): Promise<void> {
  if (Platform.OS !== "android" || signal.aborted || complete) return;
  while (pending) await pending;
  if (signal.aborted || complete) return;

  const request = (async () => {
    try {
      if (await SecureStore.getItemAsync(KEY, OPTIONS) || await hasStoredInstallationId()) {
        complete = true;
        return;
      }
      if (!await waitForForeground(signal)) return;
      await requestDevicePermissions(() => !signal.aborted, () => waitForForeground(signal));
      if (signal.aborted) return;
      complete = true;
      await SecureStore.setItemAsync(KEY, "1", OPTIONS);
    } catch {
      // Installation storage can be temporarily unavailable at startup.
      // Permission choices never block access to the app.
    }
  })();
  pending = request;
  try { await request; } finally { if (pending === request) pending = undefined; }
}
