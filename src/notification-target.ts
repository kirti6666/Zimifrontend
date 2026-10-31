import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "./notification-preferences";
export const NOTIFICATION_TARGETS = ["inbox", "thread", "call", "post", "creator", "host", "appUpdate"] as const;
export interface NotificationTarget {
  notificationId?: string;
  category?: NotificationCategory;
  targetType: typeof NOTIFICATION_TARGETS[number];
  targetId?: string;
  actorId?: string;
  recipientId?: string;
  expiresAt?: string;
}
const id = (value: unknown): value is string => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
/** A notification is a navigation hint, never authority to answer, pay or update. */
export function notificationTargetFrom(value: unknown): NotificationTarget | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { targetType: "inbox" };
  const raw = value as Record<string, unknown>;
  if (raw.recipientId !== undefined && !id(raw.recipientId)) return null;
  const targetType = NOTIFICATION_TARGETS.includes(raw.targetType as NotificationTarget["targetType"]) ? raw.targetType as NotificationTarget["targetType"] : "inbox";
  const target: NotificationTarget = { targetType, ...(id(raw.notificationId) ? { notificationId: raw.notificationId } : {}),
    ...(id(raw.recipientId) ? { recipientId: raw.recipientId } : {}), ...(id(raw.actorId) ? { actorId: raw.actorId } : {}),
    ...(NOTIFICATION_CATEGORIES.includes(raw.category as NotificationCategory) ? { category: raw.category as NotificationCategory } : {}) };
  if (raw.expiresAt !== undefined) {
    if (typeof raw.expiresAt !== "string" || raw.expiresAt.length > 40 || !/^\d{4}-\d\d-\d\dT/.test(raw.expiresAt) || !Number.isFinite(Date.parse(raw.expiresAt))) return { ...target, targetType: "inbox" };
    target.expiresAt = raw.expiresAt;
  }
  if (id(raw.targetId)) target.targetId = raw.targetId;
  else if (["thread", "call", "post", "creator"].includes(targetType)) target.targetType = "inbox";
  return target;
}
