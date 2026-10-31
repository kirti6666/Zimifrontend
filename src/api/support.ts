import { ApiError } from "./client";
import type { SupportConversation, SupportMessage, SupportReceipt, SupportTicket, SupportTickets } from "./types";

export const SUPPORT_CATEGORIES = ["general", "account", "coins", "payments", "calls", "gifts", "technical", "payouts"] as const;
export const SUPPORT_STATUSES = ["open", "in_progress", "resolved"] as const;
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const id = (value: unknown): value is string => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;
const date = (value: unknown): value is string => text(value, 40) && Number.isFinite(Date.parse(value));
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const fail = (): never => { throw new ApiError("Support details could not be confirmed. Please try again.", 502); };
export function supportTicketFrom(value: unknown): SupportTicket {
  const row = record(value), requester = record(row.requester), assignee = row.assignee == null ? null : record(row.assignee), last = row.lastMessage == null ? null : record(row.lastMessage);
  if (!id(row.id) || !text(row.subject, 120) || !SUPPORT_CATEGORIES.includes(row.category as never) || !SUPPORT_STATUSES.includes(row.status as never) || !text(row.priority, 30) ||
    !id(requester.id) || !text(requester.name, 100) || !["user", "host"].includes(String(requester.role)) || (requester.avatar != null && !text(requester.avatar, 2048)) ||
    (assignee && (!id(assignee.id) || !text(assignee.name, 100))) ||
    (last && (!text(last.body, 4000) || !["user", "staff"].includes(String(last.senderType)) || !date(last.createdAt))) ||
    !count(row.unreadUser) || !count(row.unreadStaff) || !date(row.createdAt) || !date(row.updatedAt) || !date(row.lastMessageAt)) return fail();
  return { id: row.id, subject: row.subject, category: row.category as SupportTicket["category"], status: row.status as SupportTicket["status"], priority: row.priority,
    requester: { id: requester.id, name: requester.name, role: requester.role as "user" | "host", avatar: requester.avatar as string | null ?? null },
    assignee: assignee as SupportTicket["assignee"], lastMessage: last as SupportTicket["lastMessage"], unreadUser: row.unreadUser, unreadStaff: row.unreadStaff,
    createdAt: row.createdAt, updatedAt: row.updatedAt, lastMessageAt: row.lastMessageAt };
}
export function supportMessageFrom(value: unknown): SupportMessage {
  const row = record(value);
  if (!id(row.id) || !id(row.ticketId) || !text(row.body, 4000) || !["user", "staff"].includes(String(row.senderType)) || !text(row.senderName, 100) ||
    !text(row.clientMessageId, 100) || !date(row.createdAt) || (row.sequence !== undefined && (!count(row.sequence) || row.sequence === 0))) return fail();
  return { id: row.id, ticketId: row.ticketId, body: row.body, senderType: row.senderType as "user" | "staff", senderName: row.senderName, clientMessageId: row.clientMessageId,
    createdAt: row.createdAt, ...(row.sequence === undefined ? {} : { sequence: row.sequence as number }) };
}
export function supportTicketsFrom(value: unknown): SupportTickets {
  const row = record(value);
  if (!Array.isArray(row.tickets) || row.tickets.length > 100 || !count(row.page) || !row.page || !count(row.limit) || !row.limit || !count(row.total) || !count(row.unreadCount)) return fail();
  return { tickets: row.tickets.map(supportTicketFrom), page: row.page, limit: row.limit, total: row.total, unreadCount: row.unreadCount };
}
export function supportConversationFrom(value: unknown, ticketId: string): SupportConversation {
  const row = record(value), ticket = supportTicketFrom(row.ticket);
  if (ticket.id !== ticketId || !Array.isArray(row.messages) || row.messages.length > 100 || !count(row.total) || typeof row.hasMore !== "boolean" || (row.before != null && !id(row.before))) return fail();
  const messages = row.messages.map(supportMessageFrom);
  if (messages.some(message => message.ticketId !== ticketId)) return fail();
  return { ticket, messages, total: row.total, hasMore: row.hasMore, before: row.before as string | null ?? null };
}
export function supportReceiptFrom(value: unknown): SupportReceipt {
  const row = record(value), ticket = supportTicketFrom(row.ticket), message = supportMessageFrom(row.message);
  if (message.ticketId !== ticket.id) return fail();
  return { ticket, message };
}
