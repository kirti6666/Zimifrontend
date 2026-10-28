import { deleteToken, getInitialNotification, getMessaging, getToken, onMessage, onNotificationOpenedApp, onTokenRefresh, setBackgroundMessageHandler, type RemoteMessage } from "@react-native-firebase/messaging";
import * as Notifications from "expo-notifications";
import { Alert, AppState, Linking, Platform } from "react-native";
import notifee, { AndroidCategory, AndroidForegroundServiceType, AndroidImportance, AndroidVisibility, EventType, type Event } from "react-native-notify-kit";
import { CallScreen } from "../modules/call-screen";
import { api } from "./api/endpoints";

/* Device push through Firebase Cloud Messaging (@react-native-firebase/messaging),
   shown with react-native-notify-kit. The server sends data-only messages, which
   handlePush turns into notifications even while the app is closed:
   - incoming_call {callId, callerName, callerAvatar?, kind?, sentAt} rings on CALLS
     with Answer/Decline until answered, declined, call_cancelled or 30s after sentAt;
   - call_cancelled {callId, reason, callerName} stops it; reason "missed" adds a
     Missed call notice;
   - anything else with a title (gifts, coins, earnings, followers) shows on GENERAL.
   Announcements sent as notification messages are still shown by Android itself.
   Registration needs google-services.json in the native build; without it the device
   reports "unavailable". iOS would also need APNs and the Firebase iOS SDK, which
   this build does not include (react-native.config.js leaves Firebase out of iOS). */

export type PushStatus = "registered" | "denied" | "unavailable";
/** silent: never prompt. prompt: ask if Android still allows it. settings: ask, else open system settings. */
export type PushMode = "silent" | "prompt" | "settings";

/* Channel settings are fixed once created on a phone; changing one needs a new id. */
const CALLS = "incoming_calls", GENERAL = "general", ONGOING = "ongoing_call";
/* A ring older than this is a call the caller has already given up on. */
const RING_MS = 30000;
const LOOK = { smallIcon: "notification_icon", color: "#EC0785" };
const DEVELOPMENT = typeof __DEV__ !== "undefined" && __DEV__;
const supported = () => Platform.OS === "android";
const text = (value: unknown) => typeof value === "string" ? value : "";
const ringId = (callId: string) => `ring:${callId}`;
const openApp = { id: "default", launchActivity: "default" };

/* Without google-services.json there is no Firebase app, and getMessaging throws. */
function messaging() {
  try { return getMessaging(); } catch { return undefined; }
}

let channels: Promise<unknown> | undefined;
const createChannels = () => channels ??= Promise.all([
  notifee.createChannel({ id: CALLS, name: "Incoming calls", importance: AndroidImportance.HIGH, visibility: AndroidVisibility.PUBLIC, sound: "content://settings/system/ringtone", vibration: true }),
  notifee.createChannel({ id: GENERAL, name: "General", importance: AndroidImportance.DEFAULT }),
  notifee.createChannel({ id: ONGOING, name: "Ongoing call", importance: AndroidImportance.LOW }),
  // Replaced by GENERAL; Android falls back to GENERAL for messages still naming it.
  notifee.deleteChannel("default"),
]).catch(error => { channels = undefined; throw error; });

/** Turns a data message into a notification. Runs headless while the app is closed. */
export async function handlePush(message: RemoteMessage, foreground = false) {
  const data = message.data ?? {}, type = text(data.type), callId = text(data.callId);
  await createChannels();
  if (type === "incoming_call" && callId) {
    const age = Date.now() - (Number(data.sentAt) || message.sentTime || 0);
    // In the app, the socket's ring screen takes the call instead.
    if (foreground || !(age <= RING_MS)) return;
    const avatar = text(data.callerAvatar);
    await notifee.displayNotification({
      id: ringId(callId), title: text(data.callerName) || "BinzoLive",
      body: data.kind === "audio" ? "Incoming voice call" : "Incoming video call",
      data: { type, callId },
      android: {
        channelId: CALLS, ...LOOK, category: AndroidCategory.CALL, importance: AndroidImportance.HIGH, visibility: AndroidVisibility.PUBLIC,
        ongoing: true, autoCancel: false, loopSound: true, timeoutAfter: Math.min(RING_MS, RING_MS - age),
        ...(avatar.startsWith("https://") ? { largeIcon: avatar, circularLargeIcon: true } : {}),
        pressAction: openApp, fullScreenAction: openApp,
        actions: [
          { title: "Decline", pressAction: { id: "decline" } },
          { title: "Answer", pressAction: { id: "answer", launchActivity: "default" } },
        ],
      },
    });
  } else if (type === "call_cancelled" && callId) {
    await notifee.cancelNotification(ringId(callId));
    if (data.reason === "missed" && !foreground) await notifee.displayNotification({
      id: `missed:${callId}`, title: "Missed call", body: `${text(data.callerName) || "Someone"} tried to call you.`,
      data: { type }, android: { channelId: GENERAL, ...LOOK, pressAction: openApp },
    });
  } else if (text(data.title) && !foreground) {
    // In the app, the inbox bell already updates over the socket.
    await notifee.displayNotification({ title: text(data.title), body: text(data.body), data: { type }, android: { channelId: GENERAL, ...LOOK, pressAction: openApp } });
  }
}

let onOpen: (() => void) | undefined, onAnswer: ((callId: string) => void) | undefined;
let openPending = false, answerPending: string | undefined, lastEvent: string | undefined;

/** Notification taps and buttons, in the app or headless. */
export async function handlePushEvent({ type, detail }: Event) {
  const notification = detail.notification, data = notification?.data ?? {}, callId = text(data.callId), action = detail.pressAction?.id;
  if (type !== EventType.PRESS && type !== EventType.ACTION_PRESS) return;
  // A launch tap arrives both as an event and as the initial notification.
  const key = `${notification?.id}:${action}`;
  if (key === lastEvent) return;
  lastEvent = key;
  if (data.type === "incoming_call" && callId) {
    // Its screen may show over the lock screen; the ring screen arrives over the socket.
    if (action !== "decline") CallScreen?.showOverLockScreen(true);
    if (action === "default") return;
    await notifee.cancelNotification(ringId(callId));
    if (action === "decline") await api.declineCall(callId).catch(() => {});
    else if (onAnswer) onAnswer(callId); else answerPending = callId;
  } else if (notification?.android?.channelId === GENERAL) {
    if (onOpen) onOpen(); else openPending = true;
  }
}

/** Runs from index.js before the app starts, so pushes and buttons work while it is closed. */
export function registerBackgroundPush() {
  if (!supported()) return;
  notifee.onBackgroundEvent(handlePushEvent);
  // The ongoing-call notification keeps camera and microphone working in the background until stopForegroundService.
  notifee.registerForegroundService(() => new Promise(() => {}));
  const fcm = messaging();
  if (fcm) setBackgroundMessageHandler(fcm, message => handlePush(message));
}

let ringing: string | undefined, liveCall: string | undefined;
/** Stops a ring once the call screen shows it, answered elsewhere or ended. */
const stopRing = (callId: string) => { if (ringing === callId) ringing = undefined; void notifee.cancelNotification(ringId(callId)).catch(() => {}); };
const endCall = () => {
  liveCall = undefined;
  void notifee.stopForegroundService().catch(() => {});
  CallScreen?.showOverLockScreen(false);
};

/** Keeps the ring, the ongoing-call notification and the lock screen in step with the call screens. */
export function trackCall({ type, data }: { type: string; data?: object }) {
  if (!supported()) return;
  const details = (data ?? {}) as Record<string, unknown>, callId = text(details.callId);
  if (type === "call.incoming" && callId) {
    ringing = callId;
    CallScreen?.showOverLockScreen(true);
    if (AppState.currentState === "active") stopRing(callId);
  } else if (type === "call.connected" && callId) {
    stopRing(callId);
    CallScreen?.showOverLockScreen(true);
    // Android refuses a camera or microphone service started from the background.
    if (liveCall === callId || AppState.currentState !== "active") return;
    liveCall = callId;
    void notifee.displayNotification({
      id: ONGOING, title: "BinzoLive call", body: "Tap to return to your call.",
      android: {
        channelId: ONGOING, ...LOOK, category: AndroidCategory.CALL, asForegroundService: true, ongoing: true, pressAction: openApp,
        foregroundServiceTypes: [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_PHONE_CALL, AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_MICROPHONE,
          ...(details.voice === true ? [] : [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_CAMERA])],
      },
    }).catch(() => {});
  } else if (type === "call.ended" && callId) {
    stopRing(callId);
    // A queued caller hanging up must not end the call in progress.
    if (!liveCall || liveCall === callId) endCall();
  } else if (type === "session.expired") endCall();
}

/** Creates the channels and reports notification taps and Answer, including the one that launched the app. */
export function startPush(open: () => void, answer: (callId: string) => void): () => void {
  const fcm = supported() ? messaging() : undefined;
  if (!fcm) return () => {};
  onOpen = open; onAnswer = answer;
  if (openPending) { openPending = false; open(); }
  if (answerPending) { answer(answerPending); answerPending = undefined; }
  void createChannels().catch(() => {});
  const activity = AppState.addEventListener("change", state => { if (state === "active" && ringing) stopRing(ringing); });
  const stops = [
    onMessage(fcm, message => handlePush(message, true).catch(() => {})),
    notifee.onForegroundEvent(event => void handlePushEvent(event).catch(() => {})),
    // Announcements Android showed by itself.
    onNotificationOpenedApp(fcm, () => open()),
    () => activity.remove(),
  ];
  void getInitialNotification(fcm).then(message => { if (message) open(); }).catch(() => {});
  void notifee.getInitialNotification().then(initial => {
    if (initial) return handlePushEvent({ type: initial.pressAction.id === "default" ? EventType.PRESS : EventType.ACTION_PRESS, detail: initial });
  }).catch(() => {});
  return () => { onOpen = undefined; onAnswer = undefined; stops.forEach(stop => stop()); };
}

/** Gets this device's FCM token and hands it to `save`. Never throws. */
export async function registerPush(save: (token: string) => Promise<void>, mode: PushMode): Promise<PushStatus> {
  const fcm = supported() ? messaging() : undefined;
  if (!fcm) return "unavailable";
  try {
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain && mode !== "silent") {
      permission = await Notifications.requestPermissionsAsync();
    } else if (!permission.granted && mode === "settings") {
      // Android stops showing the dialog after repeated denials.
      await Linking.openSettings();
    }
    if (!permission.granted) return "denied";
    const token = await getToken(fcm);
    if (!token) return "unavailable";
    await save(token);
    return "registered";
  } catch (error) {
    if (DEVELOPMENT) console.warn("Push registration failed", error);
    return "unavailable";
  }
}

/** Android 14+ can switch off full-screen call alerts; a locked phone then only shows a banner. */
export function askForCallAlerts() {
  if (!supported() || !CallScreen || CallScreen.canUseFullScreenIntent()) return;
  Alert.alert("Allow full-screen calls", "Turn on full-screen notifications for BinzoLive so incoming calls ring on your lock screen.", [
    { text: "Not now", style: "cancel" },
    { text: "Open settings", onPress: () => CallScreen?.openFullScreenIntentSettings() },
  ]);
}

/** FCM can rotate a device's token; the new one must replace the old registration. */
export function onPushTokenChange(listener: (token: string) => void): () => void {
  const fcm = supported() ? messaging() : undefined;
  if (!fcm) return () => {};
  return onTokenRefresh(fcm, token => { if (typeof token === "string" && token) listener(token); });
}

/** On logout: clears the previous account's notifications and call, and retires this
    device's token so nothing more reaches it; the next login gets a new one. */
export function clearDeliveredPush() {
  const fcm = supported() ? messaging() : undefined;
  if (!fcm) return;
  endCall();
  void notifee.cancelAllNotifications().catch(() => {});
  void deleteToken(fcm).catch(() => {});
}
