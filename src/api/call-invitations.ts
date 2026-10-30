import { ApiError } from "./client";
import { idOf, record } from "./adapters";
import type { AutomaticCallInvitation } from "./types";

export function automaticInvitationFrom(value: unknown): AutomaticCallInvitation | null {
  if (value === null) return null;
  const data = record(value), host = record(data.host);
  const count = (amount: unknown, max = 1_000_000) => typeof amount === "number" && Number.isSafeInteger(amount) && amount >= 0 && amount <= max;
  if (!idOf(data) || data.source !== "automatic" || data.label !== "Automatic call invitation" || !idOf(host) ||
      typeof host.name !== "string" || !host.name.trim() || data.kind !== "video" ||
      !["pending", "connected", "dismissed", "expired"].includes(String(data.status)) ||
      !count(data.coinsPerMinute) || !count(data.entryFeeCoins) || !count(data.requiredCoins, 2_000_000) ||
      Number(data.requiredCoins) !== Number(data.coinsPerMinute) + Number(data.entryFeeCoins) ||
      typeof data.affordable !== "boolean" || typeof data.expiresAt !== "string" || !Number.isFinite(Date.parse(data.expiresAt)))
    throw new ApiError("This automatic call invitation could not be verified. Please try again later.", 502);
  return { id: idOf(data), source: "automatic", label: "Automatic call invitation",
    host: { id: idOf(host), name: host.name, ...(typeof host.avatarUrl === "string" ? { avatarUrl: host.avatarUrl } : {}), ...(typeof host.city === "string" ? { city: host.city } : {}) },
    kind: "video", coinsPerMinute: Number(data.coinsPerMinute), entryFeeCoins: Number(data.entryFeeCoins), requiredCoins: Number(data.requiredCoins),
    affordable: data.affordable, expiresAt: data.expiresAt, status: data.status as AutomaticCallInvitation["status"],
    ...(data.callId === null ? { callId: null } : idOf(data.callId) ? { callId: idOf(data.callId) } : {}) };
}

export function topupHoldFrom(value: unknown, expectedId: string) {
  const data = record(value), until = data.topupHoldUntil, start = data.topupHoldStartedAt;
  if (idOf(data) !== expectedId || data.status !== "ringing" || data.hostInitiated !== true || data.waitingForTopup !== true ||
      typeof start !== "string" || typeof until !== "string" || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(until)) ||
      Date.parse(until) <= Date.now() || Date.parse(until) <= Date.parse(start) || Date.parse(until) - Date.parse(start) > 300000)
    throw new ApiError("This call cannot be held for a coin purchase. Return to the incoming call to check its status.", 409);
  return { callId: expectedId, until };
}
