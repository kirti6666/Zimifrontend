import { ApiError } from "./client";
import { OFFICIAL_CHAT_ID, OFFICIAL_CHAT_NAME, type OfficialChatData, type OfficialChatSummary, type OfficialMessage, type OfficialReceipt, type OfficialReadResult } from "./types";

const fail = (): never => { throw new ApiError("The BinzoLive conversation could not be verified. Refresh and try again.", 502); };
const row = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : fail();
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const date = (value: unknown): value is string => text(value, 40) && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
export const officialMessageId = (value: unknown): value is string => typeof value === "string" && /^(?:announcement|support):[a-f\d]{24}$/i.test(value);
export const officialCursor = officialMessageId;
function identity(value: unknown, legacySummary = false) {
  const data = row(value);
  // Older shipped apps require canSend:false on the legacy chat-list summary.
  // Its explicit support capability permits the new client to normalize it;
  // unified thread responses continue to require canSend:true.
  const supportEnabled = data.canSend === true || (legacySummary && data.canSend === false && data.supportEnabled === true);
  if (data.id !== OFFICIAL_CHAT_ID || data.name !== OFFICIAL_CHAT_NAME || data.official !== true || data.verified !== true || !supportEnabled) return fail();
  return { data, identity: { id: OFFICIAL_CHAT_ID, name: OFFICIAL_CHAT_NAME, official: true, verified: true, canSend: true } as const };
}
export function officialMessageFrom(value: unknown): OfficialMessage {
  const data = row(value);
  if (!officialMessageId(data.id) || !["announcement", "support"].includes(String(data.kind)) || !data.id.startsWith(`${data.kind}:`) ||
    !["user", "official"].includes(String(data.senderType)) || (data.kind === "announcement" && data.senderType !== "official") ||
    !text(data.body, 8000) || !date(data.createdAt) || typeof data.read !== "boolean" ||
    (data.title !== undefined && !text(data.title, 200)) ||
    (data.clientMessageId !== undefined && (typeof data.clientMessageId !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(data.clientMessageId))) ||
    (data.ticketId !== undefined && (typeof data.ticketId !== "string" || !/^[a-f\d]{24}$/i.test(data.ticketId))) ||
    (data.sequence !== undefined && (!count(data.sequence) || data.sequence === 0))) return fail();
  if (data.kind === "support" && (!data.ticketId || !data.clientMessageId || !data.sequence)) return fail();
  return { id: data.id, kind: data.kind as OfficialMessage["kind"], senderType: data.senderType as OfficialMessage["senderType"], body: data.body, createdAt: data.createdAt, read: data.read,
    ...(data.title === undefined ? {} : { title: data.title as string }), ...(data.clientMessageId === undefined ? {} : { clientMessageId: data.clientMessageId as string }),
    ...(data.ticketId === undefined ? {} : { ticketId: data.ticketId as string }), ...(data.sequence === undefined ? {} : { sequence: data.sequence as number }) };
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
  const { data, identity: verified } = identity(value, true);
  if (!count(data.unread)) return fail();
  let lastMessage: OfficialChatSummary["lastMessage"] = null;
  if (data.lastMessage != null) {
    const last = row(data.lastMessage);
    if (!officialMessageId(last.id) || !["announcement", "support"].includes(String(last.kind)) || !last.id.startsWith(`${last.kind}:`) ||
      !["user", "official"].includes(String(last.senderType)) || (last.kind === "announcement" && last.senderType !== "official") || !text(last.body, 8000) || !date(last.createdAt) || (last.title !== undefined && !text(last.title, 200))) return fail();
    lastMessage = { id: last.id, kind: last.kind as OfficialMessage["kind"], senderType: last.senderType as OfficialMessage["senderType"], body: last.body, createdAt: last.createdAt, ...(last.title === undefined ? {} : { title: last.title as string }) };
  }
  return { ...verified, unread: data.unread, lastMessage };
}
export function officialReceiptFrom(value: unknown, clientMessageId: string): OfficialReceipt {
  const data = row(value), message = officialMessageFrom(data.message), official = officialChatSummaryFrom(data.official);
  if (message.kind !== "support" || message.senderType !== "user" || message.clientMessageId !== clientMessageId) return fail();
  return { message, official };
}
export function officialReadFrom(value: unknown): OfficialReadResult {
  const data = row(value);if (data.read !== true) return fail();
  return { read: true, official: officialChatSummaryFrom(data.official) };
}
