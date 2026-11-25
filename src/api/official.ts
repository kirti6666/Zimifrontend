import { ApiError } from "./client";
import { OFFICIAL_CHAT_ID, OFFICIAL_CHAT_NAME, type OfficialChatData, type OfficialChatSummary, type OfficialMessage, type OfficialReadResult } from "./types";

const fail = (): never => { throw new ApiError("Binzo Team Chat could not be verified. Refresh and try again.", 502); };
const row = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : fail();
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const date = (value: unknown): value is string => text(value, 40) && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
export const officialMessageId = (value: unknown): value is string => typeof value === "string" && /^announcement:[a-f\d]{24}$/i.test(value);
export const officialCursor = officialMessageId;
function identity(value: unknown) {
  const data = row(value);
  // Deployed servers use canSend:true for shipped-client compatibility; older
  // summaries use the additive supportEnabled flag and negotiated read-only
  // variants may use readOnly. Exact verified forms normalize to no write path.
  const knownCapability = data.canSend === true || data.canSend === false && (data.supportEnabled === true || data.readOnly === true);
  if (data.id !== OFFICIAL_CHAT_ID || data.name !== OFFICIAL_CHAT_NAME || data.official !== true || data.verified !== true || !knownCapability) return fail();
  return { data, identity: { id: OFFICIAL_CHAT_ID, name: OFFICIAL_CHAT_NAME, official: true, verified: true, canSend: false } as const };
}
export function officialMessageFrom(value: unknown): OfficialMessage {
  const data = row(value);
  if (!officialMessageId(data.id) || data.kind !== "announcement" || data.senderType !== "official" ||
    !text(data.body, 8000) || !date(data.createdAt) || typeof data.read !== "boolean" ||
    (data.title !== undefined && !text(data.title, 200))) return fail();
  return { id: data.id, kind: "announcement", senderType: "official", body: data.body, createdAt: data.createdAt, read: data.read,
    ...(data.title === undefined ? {} : { title: data.title as string }) };
}
export function officialChatFrom(value: unknown): OfficialChatData {
  const { data, identity: verified } = identity(value);
  if (!Array.isArray(data.messages) || data.messages.length > 100 || !count(data.total) || !count(data.unreadCount) || typeof data.hasMore !== "boolean" ||
    (data.before !== null && !officialCursor(data.before))) return fail();
  const messages = data.messages.map(officialMessageFrom);
  if (new Set(messages.map(message => message.id)).size !== messages.length || data.total < messages.length) return fail();
  return { ...verified, messages, total: data.total, unreadCount: data.unreadCount, hasMore: data.hasMore, before: data.before as string | null };
}
export function officialChatSummaryFrom(value: unknown): OfficialChatSummary {
  const { data, identity: verified } = identity(value);
  if (!count(data.unread)) return fail();
  let lastMessage: OfficialChatSummary["lastMessage"] = null;
  if (data.lastMessage != null) {
    const last = row(data.lastMessage);
    if (!officialMessageId(last.id) || last.kind !== "announcement" || last.senderType !== "official" || !text(last.body, 8000) || !date(last.createdAt) || (last.title !== undefined && !text(last.title, 200))) return fail();
    lastMessage = { id: last.id, kind: "announcement", senderType: "official", body: last.body, createdAt: last.createdAt, ...(last.title === undefined ? {} : { title: last.title as string }) };
  }
  return { ...verified, unread: data.unread, lastMessage };
}
export function officialReadFrom(value: unknown): OfficialReadResult {
  const data = row(value);if (data.read !== true) return fail();
  return { read: true, official: officialChatSummaryFrom(data.official) };
}
