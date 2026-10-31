import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";
import { notificationTargetFrom, type NotificationTarget } from "./notification-target";

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
let channelsReady: Promise<void> | undefined;
/** Android 13 needs channels before permission/token registration. The OS lets
 * people independently change sound and visibility for each kind of alert. */
function ensureChannels(): Promise<void> {
  if (!supported()) return Promise.resolve();
  if (!channelsReady) channelsReady = Promise.all([
    [CHANNEL, "General", Notifications.AndroidImportance.DEFAULT],
    ["calls", "Incoming calls", Notifications.AndroidImportance.MAX],
    ["messages", "Messages", Notifications.AndroidImportance.HIGH],
    ["activity", "Likes, comments and gifts", Notifications.AndroidImportance.DEFAULT],
    ["updates", "App updates", Notifications.AndroidImportance.DEFAULT],
    ["live-alerts", "Creator availability", Notifications.AndroidImportance.DEFAULT],
    ["earnings-alerts", "Creator earning inspiration", Notifications.AndroidImportance.DEFAULT],
  ].map(([channel, name, importance]) => Notifications.setNotificationChannelAsync(String(channel), {
    name: String(name), importance: importance as Notifications.AndroidImportance,
    // Expo 57 treats a sound string as a bundled filename. Omit it to keep
    // Android's default system notification sound; null would make it silent.
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    ...(channel === "calls" ? { vibrationPattern: [0, 300, 200, 300] } : {}),
  }))).then(() => {}).catch(error => { channelsReady = undefined; throw error; });
  return channelsReady;
}

/** Creates the channel and reports notification taps, including the one that launched the app. */
export function startPush(onOpen: (target: NotificationTarget) => void, belongsToCurrentAccount?: (recipientId?: string) => boolean): () => void {
  if (!supported()) return () => {};
  // In the foreground the inbox bell updates over the socket; a heads-up
  // banner would cover calls and live rooms, so only add it to the tray.
  Notifications.setNotificationHandler({
    handleNotification: async notification => {
      const target = notificationTargetFrom(notification.request.content.data);
      const current = !!target && (!belongsToCurrentAccount || belongsToCurrentAccount(target.recipientId));
      const expired = !!target?.expiresAt && Date.parse(target.expiresAt) <= Date.now();
      return { shouldShowBanner: false, shouldShowList: current && !expired,
        shouldPlaySound: current && !expired && target?.category === "calls" && target.targetType === "call", shouldSetBadge: false };
    },
  });
  void ensureChannels().catch(() => {});
  const handled = new Set<string>();
  const opened = (response: Notifications.NotificationResponse | null) => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    // The launch response can arrive through both the listener and the query.
    const id = response.notification.request.identifier;
    if (handled.has(id)) return;
    handled.add(id);if (handled.size > 128) handled.delete(handled.values().next().value!);
    void Notifications.clearLastNotificationResponseAsync().catch(() => {});
    const target = notificationTargetFrom(response.notification.request.content.data);
    if (target) onOpen(target);
  };
  const subscription = Notifications.addNotificationResponseReceivedListener(opened);
  void Notifications.getLastNotificationResponseAsync().then(opened).catch(() => {});
  return () => subscription.remove();
}

/** Gets this device's FCM token and hands it to `save`. Never throws. */
export async function registerPush(save: (token: string) => Promise<void>, mode: PushMode): Promise<PushStatus> {
  if (!supported()) return "unavailable";
  try {
    await ensureChannels();
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
