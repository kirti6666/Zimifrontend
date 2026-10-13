import { io } from "socket.io-client";
import { SOCKET_URL } from "../config";
import { getToken, onTokenChanged } from "../session";
import { api } from "./endpoints";
import { idOf, record, string, verificationOf } from "./adapters";

export interface ServerEvent { type: string; data?: Record<string, unknown> }

// Socket.IO authentication lives in its handshake, never in a URL or the WebView.
export function connectRealtime(_initialToken: string, onEvent: (event: ServerEvent) => void, initialUserId?: string): () => void {
  if (!SOCKET_URL) return () => {};
  let closed = false, recovering = false, userId = initialUserId, lastRecovery = 0;
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  const socket = io(SOCKET_URL, {
    autoConnect: false, forceNew: true, transports: ["websocket", "polling"], tryAllTransports: true,
    reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 30000, timeout: 15000,
    auth: callback => {
      void getToken().then(token => { if (!closed && token) callback({ token }); else socket.disconnect(); }).catch(() => socket.disconnect());
    },
  });
  const emit = (type: string, data: Record<string, unknown>) => { if (!closed) onEvent({ type, data }); };
  const refreshWallet = () => { void api.wallet().then(wallet => emit("wallet.balance", { ...wallet })).catch(() => emit("realtime.status", { connected: socket.connected, message: "Your wallet could not be refreshed. Retry from Wallet." })); };
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
  socket.on("connect", () => emit("realtime.status", { connected: true }));
  socket.on("disconnect", reason => {
    emit("realtime.status", { connected: false });
    // The backend closes sockets when access tokens expire. Normal transport failures
    // are retried by the Socket.IO manager; server disconnects need fresh auth.
    if (reason === "io server disconnect") void recover();
  });
  socket.on("connect_error", () => {
    emit("realtime.status", { connected: false, message: "Reconnecting to live updates…" });
    if (!socket.active) void recover();
  });
  socket.on("call:updated", payload => {
    try {
      const call = record(payload), callId = idOf(call);
      if (!callId || !userId) return;
      if (call.status === "ringing" && idOf(call.calleeId) === userId) emit("call.incoming", { callId, from: { id: idOf(call.callerId), name: "" }, kind: call.kind });
      else if (call.status === "accepted") emit("call.connected", { callId });
      else if (["ended", "missed", "declined"].includes(string(call.status))) emit("call.ended", { callId });
    } catch { /* Ignore malformed events instead of corrupting screen state. */ }
  });
  socket.on("chat:message", payload => {
    try {
      const message = record(payload), from = idOf(message.senderId);
      if (!from || !userId || from === userId || idOf(message.recipientId) !== userId || typeof message.text !== "string") return;
      emit("chat.message", { from, name: "", text: message.text.slice(0, 2000), id: idOf(message) });
    } catch { /* Ignore malformed events. */ }
  });
  socket.on("gift:received", payload => {
    try {
      const gift = record(payload);
      if (idOf(gift.recipientId) !== userId) return;
      if (typeof gift.coins === "number" && Number.isSafeInteger(gift.coins) && gift.coins > 0) emit("gift.received", { gift: "Gift", coins: gift.coins, from: idOf(gift.senderId) });
      refreshWallet();
    } catch { /* Ignore malformed events. */ }
  });
  socket.on("host:reviewed", payload => {
    try { emit("verification.status", { status: verificationOf(record(payload).status) }); } catch { /* Ignore malformed events. */ }
  });
  const unsubscribe = onTokenChanged(() => {
    if (closed) return;
    socket.disconnect();
    void getToken().then(token => { if (!closed && token) socket.connect(); }).catch(() => {});
  });
  if (userId) socket.connect(); else void recover();
  return () => { closed = true; clearTimeout(recoveryTimer); unsubscribe(); socket.removeAllListeners(); socket.disconnect(); };
}
