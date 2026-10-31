export const NOTIFICATION_CATEGORIES = ["calls", "messages", "likes", "comments", "gifts", "appUpdates", "liveAlerts", "earningsAlerts"] as const;
export type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number];
export interface QuietHours { enabled: boolean; startHour: number; endHour: number; timeZone: string }
export type NotificationPreferences = Record<NotificationCategory, boolean> & { quietHours: QuietHours };
export type NotificationPreferencesPatch = Partial<Record<NotificationCategory, boolean>> & { quietHours?: Partial<QuietHours> };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
export function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 100) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(0); return true; } catch { return false; }
}
export function validNotificationPreferencesPatch(value: unknown): value is NotificationPreferencesPatch {
  if (!object(value) || !Object.keys(value).length || Object.keys(value).some(key => ![...NOTIFICATION_CATEGORIES, "quietHours"].includes(key))) return false;
  if (NOTIFICATION_CATEGORIES.some(key => value[key] !== undefined && typeof value[key] !== "boolean")) return false;
  if (value.quietHours === undefined) return true;
  const quiet = value.quietHours;
  return object(quiet) && Object.keys(quiet).length > 0 && Object.keys(quiet).every(key => ["enabled", "startHour", "endHour", "timeZone"].includes(key)) &&
    (quiet.enabled === undefined || typeof quiet.enabled === "boolean") &&
    [quiet.startHour, quiet.endHour].every(hour => hour === undefined || Number.isInteger(hour) && Number(hour) >= 0 && Number(hour) <= 23) &&
    (quiet.timeZone === undefined || validTimeZone(quiet.timeZone));
}
/** Older servers may omit granular preferences; preserve the existing master switch. */
export function notificationPreferencesFrom(value: unknown): NotificationPreferences | null {
  if (value !== undefined && (!object(value) || !validNotificationPreferencesPatch(value))) return null;
  const input = value as NotificationPreferencesPatch | undefined;
  return { calls: true, messages: true, likes: true, comments: true, gifts: true, appUpdates: true, liveAlerts: true, earningsAlerts: false,
    ...input, quietHours: { enabled: false, startHour: 22, endHour: 8, timeZone: "Asia/Kolkata", ...input?.quietHours } };
}
