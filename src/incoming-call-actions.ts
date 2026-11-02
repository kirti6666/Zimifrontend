import { NativeEventEmitter, NativeModules, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { api } from "./api/endpoints";

type VerifiedIncomingCall = NonNullable<Awaited<ReturnType<typeof api.notificationCall>>>;

export interface NativeCallAction {
  actionId: string;
  action: "open" | "answer" | "decline";
  recipientId: string;
  callId: string;
  expiresAt: string;
  callerName: string;
  callKind: "audio" | "video";
  callerAvatarUrl?: string;
}
interface IncomingNativeModule {
  protocol: string;
  initialCallAction?: unknown;
  getPendingCallAction(): Promise<unknown>;
  clearPendingCallAction(actionId: string): Promise<void>;
  addListener(event: string): void;
  removeListeners(count: number): void;
}
const native = Platform.OS === "android" && NativeModules?.BinzoNotifications?.protocol === "binzo.push.v1" &&
  typeof NativeModules.BinzoNotifications.getPendingCallAction === "function" && typeof NativeModules.BinzoNotifications.clearPendingCallAction === "function"
  ? NativeModules.BinzoNotifications as IncomingNativeModule : undefined;
const id = (value: unknown): value is string => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
const actionId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9._:-]{1,160}$/.test(value);
const safeName = (value: unknown): string => typeof value === "string"
  ? value.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").trim().slice(0, 80) || "Incoming caller" : "Incoming caller";
function parse(value: unknown): NativeCallAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>, expiry = typeof row.expiresAt === "string" && row.expiresAt.length <= 40 ? Date.parse(row.expiresAt) : NaN;
  if (!actionId(row.actionId) || !["open", "answer", "decline"].includes(String(row.action)) || typeof row.action !== "string" ||
    typeof row.expiresAt !== "string" || !/^\d{4}-\d\d-\d\dT/.test(row.expiresAt) ||
    !id(row.recipientId) || !id(row.callId) || !Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 180000 ||
    (row.callKind !== "audio" && row.callKind !== "video")) return null;
  let avatar: string | undefined;
  if (typeof row.callerAvatarUrl === "string" && row.callerAvatarUrl.length <= 2048) {
    try { const url = new URL(row.callerAvatarUrl); if (url.protocol === "https:" && !url.username && !url.password) avatar = url.href; } catch { /* Optional presentation only. */ }
  }
  return { actionId: row.actionId, action: row.action as NativeCallAction["action"], recipientId: row.recipientId, callId: row.callId,
    expiresAt: new Date(expiry).toISOString(), callerName: safeName(row.callerName), callKind: row.callKind, ...(avatar ? { callerAvatarUrl: avatar } : {}) };
}

// This synchronous constant lets the first React frame select the ringing surface.
// Every item remains a hint; the authenticated call endpoint must verify it.
let current = parse(native?.initialCallAction), revision = 0, references = 0, generation = 0;
let verified: { actionId: string; sessionVersion: number; receivedAt: number; snapshot: VerifiedIncomingCall } | undefined;
let nativeSubscription: { remove(): void } | undefined;
let expoSubscription: { remove(): void } | undefined;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<(action: NativeCallAction | null) => void>();
const retired = new Set<string>();
function retire(value: string) { retired.add(value); if (retired.size > 128) retired.delete(retired.values().next().value!); }
function notify() {
  for (const listener of listeners) { try { listener(current ? { ...current } : null); } catch { /* Isolate screen/bridge observers. */ } }
}
function scheduleExpiry() {
  clearTimeout(expiryTimer); expiryTimer = undefined;
  if (references && current) {
    const expected = current.actionId;
    expiryTimer = setTimeout(() => { if (current?.actionId === expected) clearIncomingCallAction(expected); }, Math.max(0, Date.parse(current.expiresAt) - Date.now()));
  }
}
function receive(value: unknown, queryRevision?: number) {
  if(value && typeof value==='object' && !Array.isArray(value)) {
    const terminal=value as Record<string,unknown>;
    if(terminal.action==='ended' && current && terminal.callId===current.callId && terminal.recipientId===current.recipientId) {
      clearIncomingCallAction(current.actionId);return;
    }
  }
  const incoming = parse(value);
  if (!incoming || retired.has(incoming.actionId)) return;
  if (queryRevision !== undefined && queryRevision !== revision && incoming.actionId !== current?.actionId) return;
  const sameCall = current?.callId === incoming.callId && current.recipientId === incoming.recipientId;
  // An incidental launch/query must never undo an explicit native/user choice.
  if (sameCall && current?.action !== "open" && incoming.action === "open") return;
  if (current?.actionId === incoming.actionId && current.action === incoming.action) return;
  if (current && current.actionId !== incoming.actionId) retire(current.actionId);
  if (!current || current.actionId !== incoming.actionId || current.callId !== incoming.callId || current.recipientId !== incoming.recipientId) verified = undefined;
  current = incoming; revision++; scheduleExpiry(); notify();
}
function expoAction(response: Notifications.NotificationResponse | null): NativeCallAction | null {
  if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null;
  const notification = response.notification, data = notification.request.content.data;
  if (data?.targetType !== "call" || data?.category !== "calls" || data?.action === "call-ended" || !id(data?.targetId) || !id(data?.recipientId)) return null;
  const identifier = notification.request.identifier;
  if (typeof identifier !== "string" || identifier.length > 256) return null;
  let hash = 2166136261;
  for (let index = 0; index < identifier.length; index++) hash = Math.imul(hash ^ identifier.charCodeAt(index), 16777619);
  return parse({actionId:`expo:${hash >>> 0}:${data.targetId}`,action:"open",recipientId:data.recipientId,callId:data.targetId,expiresAt:data.expiresAt,
    callerName:data.callerName ?? data.senderName,callKind:data.callKind === "audio" || data.callKind === "voice" ? "audio" : "video",callerAvatarUrl:data.callerAvatarUrl});
}

export function getIncomingCallAction(): NativeCallAction | null {
  if (current && Date.parse(current.expiresAt) <= Date.now()) clearIncomingCallAction(current.actionId);
  return current ? { ...current } : null;
}
export function onIncomingCallAction(listener: (action: NativeCallAction | null) => void): () => void {
  const initial = getIncomingCallAction(); listeners.add(listener); listener(initial);
  return () => { listeners.delete(listener); };
}
/** Start once above the update gate; multiple screen/bridge owners share it. */
export function startIncomingCallActions(): () => void {
  references++;
  if (references === 1 && Platform.OS === "android") {
    const run = ++generation, active = () => references > 0 && run === generation;
    if (native) {
      nativeSubscription = new NativeEventEmitter(native).addListener("BinzoIncomingCallAction", value => { if (active()) receive(value); });
      const version = revision;
      void native.getPendingCallAction().then(value => { if (active()) receive(value, version); }).catch(() => {});
    }
    expoSubscription = Notifications.addNotificationResponseReceivedListener(response => { if (active()) receive(expoAction(response)); });
    const version = revision;
    void Notifications.getLastNotificationResponseAsync().then(response => { if (active()) receive(expoAction(response), version); }).catch(() => {});
    scheduleExpiry();
  }
  let stopped = false;
  return () => {
    if (stopped) return; stopped = true;
    if (--references === 0) { generation++; nativeSubscription?.remove(); nativeSubscription = undefined; expoSubscription?.remove(); expoSubscription = undefined; clearTimeout(expiryTimer); expiryTimer = undefined; }
  };
}
/** Exact-id acknowledgments cannot consume a newer action arriving meanwhile. */
export function clearIncomingCallAction(value: string): void {
  if (!actionId(value)) return;
  retire(value);
  if (current?.actionId === value) { current = null; verified = undefined; revision++; scheduleExpiry(); notify(); }
  if (native) void native.clearPendingCallAction(value).catch(() => {});
}
export function requestIncomingCallAction(value: string, action: "answer" | "decline"): void {
  if ((action !== "answer" && action !== "decline") || getIncomingCallAction()?.actionId !== value || !current || current.action === action) return;
  current = { ...current, action }; revision++; scheduleExpiry(); notify();
}
/** Retry transport without changing Open into an answer gesture. */
export function retryIncomingCallAction(value: string): void {
  if (getIncomingCallAction()?.actionId !== value) return;
  revision++; notify();
}
/** A short-lived memory handoff avoids a second lookup after the native gate.
 * The recipient, session and current action remain bound; accepting is server-owned. */
export function setVerifiedIncomingCall(value: string, snapshot: VerifiedIncomingCall | null, sessionVersion: number): void {
  const action = getIncomingCallAction();
  if (!snapshot || !action || action.actionId !== value || !Number.isSafeInteger(sessionVersion) || sessionVersion < 0 ||
    snapshot.callId !== action.callId || snapshot.recipientId !== action.recipientId || typeof snapshot.expiresAt !== "string" ||
    snapshot.expiresAt.length > 40 || !/^\d{4}-\d\d-\d\dT/.test(snapshot.expiresAt)) return;
  const expiry = Date.parse(snapshot.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 180000) return;
  verified = { actionId: value, sessionVersion, receivedAt: Date.now(), snapshot: JSON.parse(JSON.stringify(snapshot)) as VerifiedIncomingCall };
}
export function getVerifiedIncomingCall(value: string, sessionVersion: number): VerifiedIncomingCall | null {
  const action = getIncomingCallAction();
  if (!verified || !action || value !== action.actionId || verified.actionId !== value || verified.sessionVersion !== sessionVersion ||
    verified.snapshot.callId !== action.callId || verified.snapshot.recipientId !== action.recipientId) return null;
  if (Date.now() - verified.receivedAt >= 10000 || Date.parse(verified.snapshot.expiresAt) <= Date.now()) { verified = undefined; return null; }
  return JSON.parse(JSON.stringify(verified.snapshot)) as VerifiedIncomingCall;
}
