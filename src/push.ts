import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";

/* Device push through Firebase Cloud Messaging. The backend sends notification
   messages to this channel (backend/src/services/push/fcm.client.ts), so
   Android shows them in the tray while the app is closed. Registration needs
   google-services.json in the native build; without it the device reports
   "unavailable". iOS would also need APNs and the Firebase iOS SDK, which
   this build does not include. */

export type PushStatus = "registered" | "denied" | "unavailable";
/** silent: never prompt. prompt: ask if Android still allows it. settings: ask, else open system settings. */
export type PushMode = "silent" | "prompt" | "settings";

const CHANNEL = "default";
const DEVELOPMENT = typeof __DEV__ !== "undefined" && __DEV__;
const supported = () => Platform.OS === "android";

/** Creates the channel and reports notification taps, including the one that launched the app. */
export function startPush(onOpen: () => void): () => void {
  if (!supported()) return () => {};
  // In the foreground the inbox bell updates over the socket; a heads-up
  // banner would cover calls and live rooms, so only add it to the tray.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  void Notifications.setNotificationChannelAsync(CHANNEL, {
    name: "General",
    importance: Notifications.AndroidImportance.HIGH,
  }).catch(() => {});
  let handled: string | undefined;
  const opened = (response: Notifications.NotificationResponse | null) => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    // The launch response can arrive through both the listener and the query.
    const id = response.notification.request.identifier;
    if (id === handled) return;
    handled = id;
    void Notifications.clearLastNotificationResponseAsync().catch(() => {});
    onOpen();
  };
  const subscription = Notifications.addNotificationResponseReceivedListener(opened);
  void Notifications.getLastNotificationResponseAsync().then(opened).catch(() => {});
  return () => subscription.remove();
}

/** Gets this device's FCM token and hands it to `save`. Never throws. */
export async function registerPush(save: (token: string) => Promise<void>, mode: PushMode): Promise<PushStatus> {
  if (!supported()) return "unavailable";
  try {
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain && mode !== "silent") {
      permission = await Notifications.requestPermissionsAsync();
    } else if (!permission.granted && mode === "settings") {
      // Android stops showing the dialog after repeated denials.
      await Linking.openSettings();
    }
    if (!permission.granted) return "denied";
    const { data } = await Notifications.getDevicePushTokenAsync();
    if (typeof data !== "string" || !data) return "unavailable";
    await save(data);
    return "registered";
  } catch (error) {
    if (DEVELOPMENT) console.warn("Push registration failed", error);
    return "unavailable";
  }
}

/** FCM can rotate a device's token; the new one must replace the old registration. */
export function onPushTokenChange(listener: (token: string) => void): () => void {
  if (!supported()) return () => {};
  const subscription = Notifications.addPushTokenListener(token => {
    if (typeof token.data === "string" && token.data) listener(token.data);
  });
  return () => subscription.remove();
}

/** Removes the previous account's notifications from the tray. */
export function clearDeliveredPush() {
  if (supported()) void Notifications.dismissAllNotificationsAsync().catch(() => {});
}
