import { NativeModules, Platform } from "react-native";
import { notificationPreferencesFrom } from "./notification-preferences";
import type { ProfileSettings } from "./api/types";

export const NATIVE_PUSH_PROTOCOL = "binzo.push.v1" as const;
interface NativePush {
  protocol: string;
  setAccount(accountId: string | null, enabled: boolean, categories: Record<string, boolean>): Promise<void>;
  dismissCall(callId: string | null): Promise<void>;
}
const native = Platform.OS === "android" ? NativeModules?.BinzoNotifications as NativePush | undefined : undefined;
const validId = (id: string) => /^[a-f\d]{24}$/i.test(id);
export function pushDeliveryProtocol(): typeof NATIVE_PUSH_PROTOCOL | undefined {
  return native?.protocol === NATIVE_PUSH_PROTOCOL ? NATIVE_PUSH_PROTOCOL : undefined;
}
/** Only ownership and category switches are persisted. Credentials stay in SecureStore. */
export async function syncPushAccount(accountId: string | null, preferences?: ProfileSettings["preferences"]): Promise<void> {
  if (!native) return;
  const categories = notificationPreferencesFrom(preferences?.notificationPreferences);
  const owner = accountId && validId(accountId) ? accountId : null;
  const switches = categories ? Object.fromEntries(Object.entries(categories).filter(([, value]) => typeof value === "boolean")) as Record<string, boolean> : {};
  await native.setAccount(owner, !!owner && preferences?.pushNotifications === true && !!categories, switches);
}
export async function dismissIncomingCallNotification(callId?: string): Promise<void> {
  if (native && (callId === undefined || validId(callId))) await native.dismissCall(callId ?? null);
}
