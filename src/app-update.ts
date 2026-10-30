import { useEffect, useMemo, useState } from "react";
import { AppState, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { API_CONFIGURATION_ERROR, API_URL } from "./config";
import { configureAppUpdates, onAppUpdate } from "./app-update-events";
import { fetchUpdatePolicy, parseUpdatePolicy } from "./app-update-policy";
import { AppUpdateController, INITIAL_UPDATE_STATE, type UpdateState } from "./app-update-controller";
import * as updater from "./native-apk-updater";

const POLICY_KEY = "binzo.app.update-policy.v1";
const ANDROID = Platform?.OS === "android";
export function useAppUpdates() {
  const [state, setState] = useState<UpdateState>(ANDROID ? INITIAL_UPDATE_STATE : { ...INITIAL_UPDATE_STATE, status: "allowed", checking: false });
  const controller = useMemo(() => ANDROID ? new AppUpdateController({
    installed: updater.getInstalledApp,
    configure: configureAppUpdates,
    check: installed => {
      if (API_CONFIGURATION_ERROR) return Promise.reject(new Error(API_CONFIGURATION_ERROR));
      return fetchUpdatePolicy(API_URL, installed);
    },
    load: async installed => {
      const cached = await SecureStore.getItemAsync(POLICY_KEY);
      return cached ? parseUpdatePolicy(JSON.parse(cached), installed) : null;
    },
    save: policy => SecureStore.setItemAsync(POLICY_KEY, JSON.stringify(policy), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
    url: release => new URL(release.downloadPath, API_URL).href,
    download: updater.downloadRelease, receipt: updater.getVerifiedRelease,
    install: updater.installRelease, cancel: updater.cancelDownload,
  }, setState) : undefined, []);
  useEffect(() => {
    if (!controller) return;
    let active = AppState.currentState === "active";
    const stopProgress = updater.addDownloadProgressListener(event => controller.progress(event));
    const stopUpdates = onAppUpdate(required => { if (active || required) void controller.check(required); });
    const activity = AppState.addEventListener("change", next => {
      active = next === "active";
      if (active) void controller.check();
    });
    // Poll also covers signed-out users and devices whose socket is unavailable.
    const timer = setInterval(() => { if (active) void controller.check(); }, 30000);
    void controller.start();
    return () => { clearInterval(timer); stopProgress(); stopUpdates(); activity.remove(); controller.close(); };
  }, [controller]);
  return { state, check: () => { void controller?.check(true); }, update: () => { void controller?.update(); } };
}
