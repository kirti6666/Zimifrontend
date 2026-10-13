import { ApiError } from "./client";
import type { Account, CallRecord, ChatSummary, Host, Message, MissedCall, Transaction, UserPost, Verification, Wallet } from "./types";

export type RecordValue = Record<string, unknown>;
export function record(value: unknown): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError("The server returned an unexpected response. Try again.", 502);
  return value as RecordValue;
}
export const string = (value: unknown): string => typeof value === "string" ? value : "";
const stringList = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const finite = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) ? value : undefined;
export function idOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return string((value as RecordValue).id || (value as RecordValue)._id);
  return "";
}
export function items(value: unknown): unknown[] {
  const result = record(value).items;
  if (!Array.isArray(result)) throw new ApiError("The server returned an unexpected list. Try again.", 502);
  return result;
}
export function verificationOf(status: unknown): Verification {
  return status === "approved" ? "verified" : status === "pending" ? "pending" : status === "rejected" || status === "suspended" ? "rejected" : "none";
}
export function accountFrom(value: unknown): Account {
  const data = record(value), user = record(data.user), id = idOf(user);
  if (!id) throw new ApiError("Your account could not be loaded. Please try signing in again.", 502);
  const photos = Array.isArray(user.photos) ? user.photos.map(record).map(photo => ({ key: string(photo.key), url: string(photo.url) })).filter(photo => photo.key && photo.url) : [];
  return {
    user: {
      id, name: string(user.name), role: user.role === "host" && user.hostStatus === "approved" && user.isVerifiedHost === true ? "host" : "sender",
      city: string(user.city), about: string(user.bio), email: string(user.email), avatarUrl: string(user.avatarUrl), avatarKey: string(user.avatarKey), coverUrl: string(user.coverUrl), coverKey: string(user.coverKey), photos,
      languages: stringList(user.languages), interests: stringList(user.interests), category: string(user.category), adultConfirmed: user.adultConfirmed === true,
      ...(user.onboardingPreference === "creator" || user.onboardingPreference === "member" ? { onboardingPreference: user.onboardingPreference } : {}),
      hostStatus: string(user.hostStatus),
    },
    verification: verificationOf(user.hostStatus), requiresOnboarding: user.onboardingStatus === "pending" || data.requiresOnboarding === true,
  };
}
export function postFrom(value: unknown): UserPost {
  const post = record(value), id = idOf(post);
  if (!id || typeof post.mediaUrl !== "string" || !/^https:\/\/[^\s"'<>]+$/.test(post.mediaUrl) || (post.kind !== "photo" && post.kind !== "video")) throw new ApiError("Your post could not be loaded. Please try again.", 502);
  return { id, mediaUrl: post.mediaUrl, kind: post.kind, caption: string(post.caption) };
}
export function hostFrom(value: unknown): Host {
  const host = typeof value === "string" ? { _id: value } : record(value);
  const avatar = host.avatar && typeof host.avatar === "object" ? record(host.avatar) : {};
  return {
    id: idOf(host), name: string(host.name), city: string(host.city), category: string(host.category), avatarUrl: string(host.avatarUrl || avatar.url), coverUrl: string(host.coverUrl),
    languages: stringList(host.languages), ratePerMin: finite(host.ratePerMin), entryFee: finite(host.entryFee), followers: finite(host.followers),
    ...(typeof host.online === "boolean" ? { online: host.online } : {}), ...(typeof host.live === "boolean" ? { live: host.live } : {}),
    ...(typeof host.isFollowing === "boolean" ? { following: host.isFollowing } : {}),
  };
}
export function timeOf(value: unknown): string {
  const date = new Date(string(value));
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
export function chatsFrom(value: unknown, userId: string): { chats: ChatSummary[] } {
  return { chats: items(value).map(record).map(chat => {
    const peer = (Array.isArray(chat.participants) ? chat.participants : []).find(person => idOf(person) !== userId);
    const last = chat.lastMessage && typeof chat.lastMessage === "object" ? record(chat.lastMessage) : {};
    return { user: hostFrom(peer), last: string(last.text), time: timeOf(chat.lastMessageAt), unread: finite(chat.unread) ?? 0 };
  }) };
}
export function messagesFrom(value: unknown, userId: string): { messages: Message[] } {
  return { messages: items(value).map(record).reverse().map(message => ({ mine: idOf(message.senderId) === userId, text: string(message.text), time: timeOf(message.createdAt) })) };
}
export function callsFrom(value: unknown, userId: string): { calls: CallRecord[] } {
  return { calls: items(value).map(record).map(call => {
    const seconds = finite(call.durationSeconds) ?? 0;
    return { user: hostFrom(idOf(call.callerId) === userId ? call.calleeId : call.callerId), time: timeOf(call.createdAt), duration: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`, coins: finite(call.coins) };
  }) };
}
export function missedFrom(value: unknown, userId: string): { calls: MissedCall[] } {
  return { calls: items(value).map(record).filter(call => idOf(call.calleeId) === userId && call.status === "missed").map(call => ({ user: hostFrom(call.callerId), when: timeOf(call.createdAt), kind: call.kind === "audio" ? "voice" : "video" })) };
}
export function walletFrom(value: unknown): Wallet {
  const wallet = record(value);
  if (!Number.isSafeInteger(wallet.coins) || !Number.isSafeInteger(wallet.earningsPaise) || (wallet.coins as number) < 0 || (wallet.earningsPaise as number) < 0) throw new ApiError("Your wallet could not be loaded. Try again.", 502);
  return { coins: wallet.coins as number, earningsPaise: wallet.earningsPaise as number, reservedPaise: finite(wallet.reservedPaise) };
}
export function transactionsFrom(value: unknown): { items: Transaction[] } {
  return { items: items(value).map(record).map(tx => ({
    title: string(tx.description) || string(tx.type).replace(/_/g, " "), time: timeOf(tx.createdAt), coins: finite(tx.coins) ?? 0, amountPaise: finite(tx.amountPaise),
    kind: string(tx.type).startsWith("gift") ? "gift" : string(tx.type).startsWith("purchase") ? "topup" : string(tx.type).startsWith("withdrawal") ? "withdrawal" : "reward",
  })) };
}
