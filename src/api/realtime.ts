import { io } from "socket.io-client";
import { SOCKET_URL } from "../config";
import { getToken, onTokenChanged } from "../session";
import { api } from "./endpoints";
import { callerFrom, callPrice, coinCount, genderOf, idOf, messageFrom, record, streamChatFrom, string, verificationOf } from "./adapters";
import type { RtcPayload } from "./types";
import { ApiError } from "./client";
import { getAppUpdateAuth, notifyAppUpdate } from "../app-update-events";

export interface ServerEvent { type: string; data?: Record<string, unknown> }
/** What an ended call cost, and whether it ended because the caller's coins ran out. */
const callCharge = (call: Record<string, unknown>) => ({
  ...(coinCount(call.coinsPerMinute) ? { coins: coinCount(call.coinsCharged) } : {}),
  ...(call.endReason === "out_of_coins" || call.endReason === "switch" ? { reason: call.endReason } : {}),
});
/** The staff side of a verification call, as the call's media peer. */
export const VERIFY_PEER = "zimi-team";
export type RealtimeConnection = (() => void) & { setActive?: (active: boolean) => void; send?: (event: "webrtc:signal" | "stream:signal" | "stream:ready", data: RtcPayload & { callId?: string; streamId?: string; to?: string }) => Promise<void> };

// Socket.IO authentication lives in its handshake, never in a URL or the WebView.
export function connectRealtime(_initialToken: string, onEvent: (event: ServerEvent) => void, initialUserId?: string, initiallyActive = true): RealtimeConnection {
  if (!SOCKET_URL) return () => {};
  let closed = false, recovering = false, userId = initialUserId, lastRecovery = 0;
  let appActive = initiallyActive;
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  const socket = io(SOCKET_URL, {
    autoConnect: false, forceNew: true, transports: ["websocket", "polling"], tryAllTransports: true,
    reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 30000, timeout: 15000,
    auth: callback => {
      void getToken().then(token => { if (!closed && token) callback({ token, ...getAppUpdateAuth() }); else socket.disconnect(); }).catch(() => socket.disconnect());
    },
  });
  const emit = (type: string, data: Record<string, unknown>) => { if (!closed) onEvent({ type, data }); };
  const refreshWallet = () => emit("wallet.refresh", {});
  const recover = async () => {
    if (closed || recovering) return;
    if (Date.now() - lastRecovery < 30000) {
      if (!recoveryTimer) recoveryTimer = setTimeout(() => { recoveryTimer = undefined; void recover(); }, 30000 - (Date.now() - lastRecovery));
      return;
    }
    lastRecovery = Date.now();
    recovering = true;
    try {
      const account = await api.me(); // A revoked/expired session follows the same refresh policy as HTTP.
      if (closed) return;
      userId = account.user.id;
      socket.connect();
    } catch { emit("realtime.status", { connected: false, message: "Live updates are unavailable. Check your connection." }); }
    finally { recovering = false; }
  };
  socket.on("connect", () => {
    if (closed) return;
    socket.emit("app:activity", { active: appActive });
    emit("realtime.status", { connected: true });
  });
  socket.on("disconnect", reason => {
    emit("realtime.status", { connected: false });
    // The backend closes sockets when access tokens expire. Normal transport failures
    // are retried by the Socket.IO manager; server disconnects need fresh auth.
    if (reason === "io server disconnect") void recover();
  });
  socket.on("app:release-updated", () => notifyAppUpdate(true));
  socket.on("connect_error", error => {
    if (error?.data?.code === "APP_UPDATE_REQUIRED" || error?.data?.code === "APP_VERSION_REQUIRED") {
      notifyAppUpdate(true); socket.disconnect(); return;
    }
    emit("realtime.status", { connected: false, message: "Reconnecting to live updates…" });
    if (!socket.active) void recover();
  });
  socket.on("call:updated", payload => {
    try {
      const call = record(payload), callId = idOf(call);
      if (!callId || !userId) return;
      if (call.status === "ringing" && idOf(call.calleeId) === userId) emit("call.incoming", { callId, from: callerFrom(call), kind: call.kind, voice: call.kind === "audio", ...(call.hostInitiated === true ? { fromHost: true } : {}), ...callPrice(call) });
      else if (call.status === "accepted") emit("call.connected", { callId, initiator: idOf(call.callerId) === userId, peerId: idOf(call.callerId) === userId ? idOf(call.calleeId) : idOf(call.callerId), voice: call.kind === "audio", ...callPrice(call) });
      else if (["ended", "missed", "declined"].includes(string(call.status))) emit("call.ended", { callId, ...callCharge(call) });
    } catch { /* Ignore malformed events instead of corrupting screen state. */ }
  });
  socket.on("chat:message", payload => {
    try {
      const message = record(payload), from = idOf(message.senderId), to = idOf(message.recipientId);
      if (!from || !to || !userId || (from !== userId && to !== userId) || typeof message.text !== "string") return;
      const normalized = messageFrom(message, userId);
      if (from !== userId) emit("chat.message", { from, name: "", text: message.text.slice(0, 4000), id: idOf(message), createdAt: string(message.createdAt),
        kind: normalized.kind, ...(normalized.imageUrl ? { imageUrl: normalized.imageUrl } : {}),
        ...(normalized.audioUrl ? { audioUrl: normalized.audioUrl, durationMs: normalized.durationMs } : {}), automated: message.automated === true,
        ...(normalized.reply ? { reply: normalized.reply } : {}),
        ...(idOf(message.callId) ? { callId: idOf(message.callId), inCall: true } : message.inCall === true ? { inCall: true } : {}),
      });
      // Sender echoes also update the list, including messages sent on another device.
      emit("chats.updated", {});
    } catch { /* Ignore malformed events. */ }
  });
  // An edit or a delete for everyone, from either person.
  socket.on("chat:message-updated", payload => {
    try {
      const message = record(payload), from = idOf(message.senderId), to = idOf(message.recipientId);
      if (!userId || !idOf(message) || (from !== userId && to !== userId)) return;
      emit("chat.updated", { with: from === userId ? to : from, message: messageFrom(message, userId) });
      emit("chats.updated", {});
    } catch { /* Ignore malformed events. */ }
  });
  // A message this account deleted for itself on another device.
  socket.on("chat:message-hidden", payload => {
    try { const id = idOf(record(payload)); if (id) { emit("chat.removed", { id }); emit("chats.updated", {}); } } catch { /* Ignore malformed events. */ }
  });
  socket.on("chat:read", payload => {
    try {
      const receipt = record(payload);
      if (idOf(receipt.userId) && Array.isArray(receipt.conversationIds) && receipt.conversationIds.length > 0 && receipt.conversationIds.every(id => typeof id === "string" && id.length > 0) && typeof receipt.readAt === "string") emit("chats.updated", {});
    } catch { /* Ignore malformed read receipts. */ }
  });
  socket.on("gift:received", payload => {
    try {
      const gift = record(payload);
      if (idOf(gift.recipientId) !== userId) return;
      if (typeof gift.coins === "number" && Number.isSafeInteger(gift.coins) && gift.coins > 0) emit("gift.received", {
        gift: string(gift.giftName) || idOf(gift.giftId) || "Gift", coins: gift.coins, from: idOf(gift.senderId),
        id: idOf(gift), streamId: idOf(gift.streamId), giftId: idOf(gift.giftId), giftName: string(gift.giftName),
        senderName: string(gift.senderName), emoji: string(gift.emoji), mediaUrl: string(gift.mediaUrl), senderAvatarUrl: string(gift.senderAvatarUrl),
        senderGender: genderOf(gift.senderGender).gender,
      });
      refreshWallet();
    } catch { /* Ignore malformed events. */ }
  });
  socket.on("host:reviewed", payload => {
    try { const hostStatus = string(record(payload).status); emit("verification.status", { status: verificationOf(hostStatus), hostStatus }); } catch { /* Ignore malformed events. */ }
  });
  socket.on("webrtc:signal", payload => {
    try { const signal = record(payload); if (idOf(signal.callId) && idOf(signal.from)) emit("rtc.signal", signal); } catch { /* Invalid peer payload. */ }
  });
  socket.on("verification:call", payload => {
    try { const call = record(payload), callId = idOf(call); if (callId && typeof call.status === "string") emit("verify.updated", { callId, status: call.status }); } catch { /* Ignore malformed events. */ }
  });
  socket.on("verification:signal", payload => {
    try { const signal = record(payload); if (idOf(signal.callId)) emit("rtc.signal", { ...signal, from: VERIFY_PEER }); } catch { /* Invalid staff payload. */ }
  });
  socket.on("stream:signal", payload => {
    try { const signal = record(payload); if (idOf(signal.streamId) && idOf(signal.from)) emit("stream.signal", signal); } catch { /* Invalid peer payload. */ }
  });
  for (const [serverName, appName] of [["stream:peer", "stream.peer"], ["stream:peer-left", "stream.peerLeft"], ["stream:viewers", "stream.viewers"], ["stream:gift", "stream.gift"]]) {
    socket.on(serverName, payload => { try { const data = record(payload); if (idOf(data.streamId)) emit(appName, data); } catch { /* Invalid room payload. */ } });
  }
  socket.on("stream:ended", payload => { try { const data = record(payload), streamId = idOf(data.streamId) || idOf(data); if (streamId) emit("stream.ended", { streamId }); } catch { /* Invalid room payload. */ } });
  socket.on("stream:message", payload => { try { emit("stream.message", { ...streamChatFrom(payload) }); } catch { /* Invalid room message. */ } });
  for (const [serverName, appName] of [["stream:requests", "stream.requests.changed"], ["stream:request-updated", "stream.request.updated"], ["stream:private-call", "stream.privateCall"], ["stream:reaction", "stream.reaction"]]) {
    socket.on(serverName, payload => { try { const data = record(payload); if (idOf(data.streamId)) emit(appName, data); } catch { /* Invalid room payload. */ } });
  }
  socket.on("wallet:updated", refreshWallet);
  socket.on("home:updated", () => emit("home.updated", {}));
  // The inbox and badge read their authenticated counts; socket content is only an invalidation.
  socket.on("notification:new", () => { emit("notifications.changed", {}); emit("official.changed", {}); emit("chats.updated", {}); emit("home.updated", {}); });
  // Read receipts already have the server's home:updated signal for the badge.
  socket.on("notifications:read", () => { emit("notifications.changed", {}); emit("official.changed", {}); emit("chats.updated", {}); });
  socket.on("account:updated", () => emit("account.updated", {}));
  // Owner identity is fetched over the authenticated API, never trusted from a socket payload.
  socket.on("profile:updated", () => emit("profile.updated", {}));
  // Socket payloads only invalidate; entitlement and tokens come from GET /themes.
  for (const event of ["themes:updated", "appearance:updated", "premium:updated"]) socket.on(event, () => {
    // Premium also removes ads, so it refreshes which ads this member may see.
    if (event === "premium:updated") emit("ads.updated", {});
    emit("themes.updated", {});
  });
  socket.on("ads:updated", () => emit("ads.updated", {}));
  const unsubscribe = onTokenChanged(() => {
    if (closed) return;
    socket.disconnect();
    void getToken().then(token => { if (!closed && token) socket.connect(); }).catch(() => {});
  });
  if (userId) socket.connect(); else void recover();
  const stop: RealtimeConnection = () => { closed = true; clearTimeout(recoveryTimer); unsubscribe(); socket.removeAllListeners(); socket.disconnect(); };
  stop.setActive = active => {
    if (closed) return;
    appActive = active;
    // Never queue a stale foreground event while the connection is offline.
    if (socket.connected) socket.emit("app:activity", { active: appActive });
  };
  stop.send = (event, data) => new Promise<void>((resolve, reject) => {
    if (closed || !socket.connected) { reject(new ApiError("Live connection is unavailable. Reconnect and try again.", 503)); return; }
    socket.timeout(10000).emit(event, data, (error: Error | null, reply: { success?: boolean; message?: string } | undefined) => {
      if (error || reply?.success !== true) reject(new ApiError(reply?.message || "The media connection could not be established.", 503)); else resolve();
    });
  });
  return stop;
}
