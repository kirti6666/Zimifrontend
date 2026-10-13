import type { RefObject } from "react";
import type WebView from "react-native-webview";
import { AppState, Linking } from "react-native";

import { ApiError, errorMessage } from "./api/client";
import { api } from "./api/endpoints";
import { connectRealtime, type RealtimeConnection } from "./api/realtime";
import type { Account, Catalog, HomeData, HomeQuery, HomeStream, Host, Message, Purchase, Role, RtcConfig, RtcPayload, StreamChat, UserPost, Verification, Wallet } from "./api/types";
import { clearToken, getCachedToken, getToken, getSessionVersion, onSessionExpired, setSessionTokens } from "./session";
import { parseWebMessage } from "./web-message";

/* The screens (web/, shown in the WebView) and the app talk in small JSON
   messages: { type, data }. The screens never call the server themselves;
   they report what the user did (WebMessage) and the app answers with what
   the server said (AppMessage). The matching code is web/bridge.js and the
   Native.send / Native.on calls in web/aurora-runtime.js. */

/* Screens -> app. */
export type WebMessage =
  | { type: "ready"; data: { demo: boolean } }
  | { type: "session.resume"; data: Record<string, never> }
  | { type: "data.reload"; data: Record<string, never> }
  | { type: "home.reload"; data: HomeQuery }
  | { type: "hosts.search"; data: { q: string; page?: number } }
  | { type: "notifications.load" | "catalog.load" | "rtc.config"; data: Record<string, never> }
  | { type: "notifications.read"; data: { ids: string[] } }
  | { type: "call.match"; data: { category?: string } }
  | { type: "rtc.signal"; data: RtcPayload & { callId: string } }
  | { type: "stream.signal"; data: RtcPayload & { streamId: string; to: string } }
  | { type: "stream.start"; data: { title: string; category: string; kind?: "video" | "audio" } }
  | { type: "stream.join" | "stream.leave" | "stream.end" | "stream.ready"; data: { streamId: string } }
  | { type: "stream.message"; data: { streamId: string; text: string } }
  | { type: "wallet.checkout"; data: { packId: string; idempotencyKey: string } }
  | { type: "wallet.verify"; data: { merchantOrderId: string } }
  | { type: "theme"; data: { theme: "light" | "dark"; canvas?: string } }
  | { type: "ui.haptic"; data: { kind: "selection" | "success" | "error" | "light" } }
  | { type: "auth.sendOtp"; data: { phone: string; role: Role; requestId?: number } }
  | { type: "auth.verifyOtp"; data: { phone: string; code: string; role: Role; signup: boolean; requestId?: number } }
  | { type: "auth.google"; data: { role: Role; signup: boolean } }
  | { type: "auth.logout"; data: Record<string, never> }
  | { type: "profile.save"; data: Record<string, unknown> }
  | { type: "media.post.create"; data: { photo: string; caption: string; requestId?: number } }
  | { type: "verification.submit"; data: Record<string, unknown> }
  | { type: "presence.set"; data: { online: boolean; visible: boolean } }
  | { type: "settings.set"; data: Record<string, unknown> }
  | { type: "follow.set"; data: { id: string; on: boolean } }
  | { type: "chat.open"; data: { with: string } }
  | { type: "chat.send"; data: { to: string; text: string; inCall?: boolean } }
  | { type: "gift.send"; data: { to: string; gift: string; coins: number; inCall: boolean; streamId?: string; idempotencyKey?: string } }
  | { type: "call.start"; data: { to: string; voice?: boolean } }
  | { type: "call.accept"; data: { callId: string } }
  | { type: "call.decline"; data: { callId: string } }
  | { type: "call.end"; data: { callId?: string; reason?: string } }
  | { type: "wallet.recharge"; data: { pack: number; coins: number; price: number; method: string } }
  | { type: "payout.request"; data: { coins: number; upi: string } }
  | { type: "awards.claim"; data: { task: string } };

/* App -> screens. The live events (call.*, gift.received, chat.message,
   wallet.balance, verification.status) come straight from the server socket. */
export type DataResource = "home" | "search" | "catalog" | "notifications" | "chats" | "wallet" | "transactions" | "calls" | "posts" | "thread" | "missed";
export type AppMessage =
  | { type: "session"; data: Account }
  | { type: "session.restoring" | "session.none"; data: Record<string, never> }
  | { type: "session.error" | "session.expired"; data: { message: string } }
  | { type: "auth.ok"; data: Account & { isNew: boolean; requestId?: number } }
  | { type: "auth.otpSent"; data: { phone: string; resendAfter: number; expiresIn: number; requestId?: number } }
  | { type: "auth.error"; data: { message: string; code?: string; retryAfterSeconds?: number; action?: string; requestId?: number } }
  | { type: "profile.saved"; data: { onboarding: boolean; account?: Account; requestId?: number } }
  | { type: "profile.progress"; data: { done: number; total: number; requestId?: number } }
  | { type: "profile.error"; data: { onboarding: boolean; message: string; requestId?: number } }
  | { type: "post.saved"; data: { post: UserPost; requestId?: number } }
  | { type: "post.error"; data: { message: string; requestId?: number } }
  | { type: "data.posts"; data: { posts: UserPost[] } }
  | { type: "data.error" | "operation.error"; data: { message: string; action?: string } }
  | { type: "data.loaded"; data: Record<string, never> }
  | { type: "data.loading"; data: { resource: DataResource; loading: boolean; page?: number; q?: string; error?: string } }
  | { type: "realtime.status"; data: { connected: boolean; message?: string } }
  | { type: "data.hosts"; data: { hosts: Host[] } }
  | { type: "data.home"; data: HomeData }
  | { type: "data.search"; data: { q: string; hosts: Host[]; total: number; page: number } }
  | { type: "home.updated"; data: Record<string, never> }
  | { type: "data.notifications"; data: Awaited<ReturnType<typeof api.notifications>> }
  | { type: "data.catalog"; data: Catalog }
  | { type: "presence.saved"; data: { online: boolean; visible: boolean } }
  | { type: "awards.claimed"; data: { task: string } }
  | { type: "gift.sent"; data: { gift: string; to: string; idempotencyKey?: string } }
  | { type: "rtc.config"; data: RtcConfig }
  | { type: "rtc.signal"; data: RtcPayload & { callId: string; from: string } }
  | { type: "stream.signal"; data: RtcPayload & { streamId: string; to: string; from: string } }
  | { type: "stream.peer" | "stream.peerLeft"; data: { streamId: string; userId: string } }
  | { type: "stream.opened"; data: { stream: HomeStream; hosting: boolean; messages: StreamChat[] } }
  | { type: "stream.closed" | "stream.ended"; data: { streamId: string } }
  | { type: "stream.viewers"; data: { streamId: string; count: number } }
  | { type: "stream.message"; data: StreamChat }
  | { type: "stream.gift"; data: Record<string, unknown> }
  | { type: "call.matched"; data: { host: Host } }
  | { type: "call.created"; data: { callId: string; to: string; voice: boolean } }
  | { type: "wallet.checkout" | "wallet.purchase"; data: Purchase }
  | { type: "data.chats"; data: Awaited<ReturnType<typeof api.chats>> }
  | { type: "data.thread"; data: { with: string; messages: Message[] } }
  | { type: "data.missed"; data: Awaited<ReturnType<typeof api.missedCalls>> }
  | { type: "data.calls"; data: Awaited<ReturnType<typeof api.callHistory>> }
  | { type: "data.transactions"; data: Awaited<ReturnType<typeof api.transactions>> }
  | { type: "wallet.balance"; data: Partial<Wallet> }
  | { type: "verification.status"; data: { status: Verification; message?: string } }
  | { type: "call.connected"; data: { callId: string; initiator?: boolean; peerId?: string; voice?: boolean } }
  | { type: "call.failed"; data: { message: string } }
  | { type: "call.incoming"; data: { callId: string; from: Record<string, unknown>; voice?: boolean } }
  | { type: "call.ended"; data: { callId: string } }
  | { type: "gift.received"; data: { gift: string; coins: number; from: string } }
  | { type: "chat.message"; data: { from: string; name: string; text: string; inCall?: boolean } };

/* Sends one message into the page. */
export function postToWeb(web: RefObject<WebView | null>, msg: AppMessage) {
  const json = JSON.stringify(JSON.stringify(msg));
  web.current?.injectJavaScript(`window.zimiReceive && window.zimiReceive(${json}); true;`);
}

export function createBridge(post: (msg: AppMessage) => void) {
  let stopLive: RealtimeConnection = () => {};
  let activeCall: string | undefined;
  let callGeneration = 0;
  let pendingOutgoing: { generation: number; callId?: string } | undefined;
  const cancelledCalls = new Set<string>();
  let epoch = 0;
  let closed = false;
  let restoring = false;
  let accountId: string | undefined;
  let hostStatus: string | undefined;
  let publishingAt: number | undefined;
  let homeQuery: HomeQuery = {};
  const readRequests = new Map<DataResource, number>();
  let activeStream: { id: string; hosting: boolean } | undefined;
  let pendingPurchase: { orderId: string; epoch: number } | undefined;
  let verifyingPurchase = false;
  const operations = new Set<string>();
  const authWork = new Set<string>();
  const current = (version: number) => !closed && version === epoch;
  const emit = (message: AppMessage) => { if (!closed) post(message); };
  const metadata = (error: unknown) => ({
    message: errorMessage(error),
    ...(error instanceof ApiError ? { code: error.code, retryAfterSeconds: error.retryAfterSeconds } : {}),
  });
  const operationError = (error: unknown, action?: string) => emit({ type: "operation.error", data: { message: errorMessage(error), action } });
  const quietly = (work: Promise<unknown>, action?: string) => {
    const version = epoch;
    void work.catch(error => { if (current(version)) operationError(error, action); });
  };
  const rememberCancelledCall = (callId: string) => {
    cancelledCalls.add(callId);
    if (cancelledCalls.size > 128) cancelledCalls.delete(cancelledCalls.values().next().value!);
  };
  const endCancelledCall = async (callId: string, sessionVersion: number) => {
    rememberCancelledCall(callId);
    // Never borrow credentials from a replacement login to clean up an old call.
    // Revocation/socket cleanup handles the old identity after a session change.
    if (getSessionVersion() !== sessionVersion) return;
    await api.endCall(callId, "cancelled");
  };
  const readResource = async <T>(resource: DataResource, read: () => Promise<T>, deliver: (data: T) => void, context: { page?: number; q?: string } = {}) => {
    const version = epoch, sessionVersion = getSessionVersion(), requestId = (readRequests.get(resource) ?? 0) + 1;
    readRequests.set(resource, requestId);
    const latest = () => current(version) && getSessionVersion() === sessionVersion && readRequests.get(resource) === requestId;
    let failure: string | undefined;
    emit({ type: "data.loading", data: { resource, loading: true, ...context } });
    try {
      const data = await read();
      if (latest()) deliver(data);
    } catch (error) {
      if (latest()) { failure = errorMessage(error); throw error; }
    } finally {
      if (latest()) emit({ type: "data.loading", data: { resource, loading: false, ...context, ...(failure ? { error: failure } : {}) } });
    }
  };
  const refreshWallet = () => readResource("wallet", () => api.wallet(), data => emit({ type: "wallet.balance", data }));
  const loadHome = (query = homeQuery) => {
    homeQuery = query;
    return readResource("home", () => api.home(query), data => emit({ type: "data.home", data }), { page: query.page ?? 1, ...(query.q !== undefined ? { q: query.q } : {}) });
  };
  const loadNotifications = () => readResource("notifications", () => api.notifications(), data => emit({ type: "data.notifications", data }));
  const loadCatalog = () => readResource("catalog", () => api.catalog(), data => emit({ type: "data.catalog", data }));
  const verifyPurchase = async (orderId: string) => {
    if (verifyingPurchase) return;
    verifyingPurchase = true;
    const version = epoch;
    try {
      const purchase = await api.verifyPurchase(orderId);
      if (current(version)) {
        emit({ type: "wallet.purchase", data: purchase });
        if (purchase.status !== "PENDING" && pendingPurchase?.orderId === orderId) pendingPurchase = undefined;
        await refreshWallet();
      }
    } finally { verifyingPurchase = false; }
  };
  const activity = AppState?.addEventListener("change", state => {
    if (state === "active" && pendingPurchase?.epoch === epoch && !closed) quietly(verifyPurchase(pendingPurchase.orderId), "wallet.verify");
  });
  const sendWallet = (work: Promise<Wallet>, action: string) => {
    const version = epoch;
    return work.then(wallet => { if (current(version)) emit({ type: "wallet.balance", data: wallet }); }).catch(error => {
      if (!current(version)) return;
      operationError(error, action);
      void refreshWallet().catch(() => {});
    });
  };
  const loadLists = async () => {
    const version = epoch;
    const deliver = (message: AppMessage) => { if (current(version)) emit(message); };
    const results = await Promise.allSettled([
      loadHome(), loadNotifications(), loadCatalog(),
      api.presence().then(data => deliver({ type: "presence.saved", data })),
      readResource("chats", () => ["pending", "rejected", "suspended"].includes(hostStatus || "") ? Promise.resolve({ chats: [] }) : api.chats(), data => deliver({ type: "data.chats", data })),
      readResource("missed", () => api.missedCalls(), data => deliver({ type: "data.missed", data })),
      readResource("calls", () => api.callHistory(), data => deliver({ type: "data.calls", data })),
      readResource("transactions", () => api.transactions(), data => deliver({ type: "data.transactions", data })),
      readResource("posts", () => hostStatus === "approved" ? api.myPosts() : Promise.resolve({ posts: [] }), data => deliver({ type: "data.posts", data })),
      refreshWallet(),
    ]);
    if (!current(version)) return;
    const failed = results.find(result => result.status === "rejected");
    emit(failed?.status === "rejected"
      ? { type: "data.error", data: { message: errorMessage(failed.reason) } }
      : { type: "data.loaded", data: {} });
  };
  const startSession = (token: string, onboarding = false) => {
    stopLive();
    const version = epoch;
    stopLive = connectRealtime(token, event => {
      if (!current(version)) return;
      if (event.type === "wallet.refresh") { quietly(refreshWallet(), "wallet.refresh"); return; }
      const callId = event.data?.callId;
      if (event.type === "call.ended" && typeof callId === "string") {
        rememberCancelledCall(callId);
        if (callId === activeCall) { activeCall = undefined; callGeneration++; }
      }
      if (event.type === "call.connected" && typeof callId === "string") {
        if (cancelledCalls.has(callId) || (event.data?.initiator === true && pendingOutgoing && pendingOutgoing.generation !== callGeneration)) {
          quietly(endCancelledCall(callId, getSessionVersion()), "call.end");
          return;
        }
        if (event.data?.initiator === true && pendingOutgoing) pendingOutgoing.callId = callId;
        activeCall = callId;
      }
      if (event.type === "stream.ended" && event.data?.streamId === activeStream?.id) activeStream = undefined;
      if (event.type === "home.updated") quietly(loadHome({ ...homeQuery, page: 1 }), "home.reload");
      if (event.type === "realtime.status" && event.data?.connected === true && !onboarding) quietly(loadHome({ ...homeQuery, page: 1 }), "home.reload");
      emit(event as AppMessage);
    }, accountId);
    if (!onboarding) void loadLists();
  };
  const unsubscribe = onSessionExpired(() => {
    epoch++; callGeneration++; pendingOutgoing = undefined; stopLive(); activeCall = undefined; activeStream = undefined; homeQuery = {}; pendingPurchase = undefined;
    emit({ type: "session.expired", data: { message: "Your session has ended. Please sign in again." } });
  });
  const restoreSession = async () => {
    if (restoring) return;
    restoring = true;
    const version = epoch;
    emit({ type: "session.restoring", data: {} });
    try {
      const token = await getToken();
      if (!current(version)) return;
      if (!token) { emit({ type: "session.none", data: {} }); return; }
      const account = await api.me();
      if (!current(version)) return;
      accountId = account.user.id; hostStatus = account.user.hostStatus;
      emit({ type: "session", data: account });
      const renewed = await getToken();
      if (renewed && current(version)) startSession(renewed, account.requiresOnboarding);
    } catch (error) {
      if (current(version)) emit({ type: "session.error", data: { message: errorMessage(error) } });
    } finally { restoring = false; }
  };

  async function handle(msg: WebMessage) {
    const version = epoch;
    switch (msg.type) {
      case "ready": if (!msg.data.demo) await restoreSession(); return;
      case "session.resume": return restoreSession();
      case "data.reload": if (await getToken()) await loadLists(); return;
      case "home.reload": return loadHome(msg.data);
      case "hosts.search": {
        const q = msg.data.q, page = msg.data.page ?? 1;
        return readResource("search", () => api.home({ q, mode: "popular", page }), data => emit({ type: "data.search", data: { q, hosts: data.hosts, total: data.total, page: data.page } }), { q, page });
      }
      case "notifications.load": return loadNotifications();
      case "notifications.read": return readResource("notifications", () => api.readNotifications(msg.data.ids), data => emit({ type: "data.notifications", data }));
      case "catalog.load": return loadCatalog();
      case "rtc.config": { const data = await api.rtcConfig(); if (current(version)) emit({ type: "rtc.config", data }); return; }
      case "rtc.signal": case "stream.signal": case "stream.ready": {
        if (!stopLive.send) throw new ApiError("Live connection is unavailable. Reconnect and try again.", 503);
        return stopLive.send(msg.type === "rtc.signal" ? "webrtc:signal" : msg.type === "stream.ready" ? "stream:ready" : "stream:signal", msg.data);
      }
      case "call.match": {
        try { const data = await api.matchHost(msg.data.category); if (current(version)) emit({ type: "call.matched", data }); }
        catch (error) { if (current(version)) operationError(error, msg.type); }
        return;
      }
      case "stream.start": case "stream.join": {
        if (activeStream) throw new ApiError("Leave your current live room before opening another.", 409);
        const hosting = msg.type === "stream.start";
        const stream = msg.type === "stream.start" ? await api.startStream(msg.data) : await api.joinStream(msg.data.streamId);
        if (!current(version)) return;
        activeStream = { id: stream.id, hosting };
        const messages = await api.streamMessages(stream.id).catch(() => []);
        if (current(version) && activeStream?.id === stream.id) emit({ type: "stream.opened", data: { stream, hosting, messages } });
        quietly(loadHome(), "home.reload");
        return;
      }
      case "stream.leave": case "stream.end": {
        if (msg.type === "stream.end") await api.endStream(msg.data.streamId); else await api.leaveStream(msg.data.streamId);
        if (current(version)) {
          if (activeStream?.id === msg.data.streamId) activeStream = undefined;
          emit({ type: "stream.closed", data: { streamId: msg.data.streamId } });
          quietly(loadHome(), "home.reload");
        }
        return;
      }
      case "stream.message": { const data = await api.sendStreamMessage(msg.data.streamId, msg.data.text); if (current(version)) emit({ type: "stream.message", data }); return; }
      case "wallet.checkout": {
        const purchase = await api.checkout(msg.data.packId, msg.data.idempotencyKey);
        if (!current(version)) return;
        pendingPurchase = purchase.status === "PENDING" && purchase.merchantOrderId ? { orderId: purchase.merchantOrderId, epoch: version } : undefined;
        // Payment pages stay outside the privileged application WebView.
        if (purchase.paymentUrl) await Linking.openURL(purchase.paymentUrl);
        if (current(version)) emit({ type: "wallet.checkout", data: purchase });
        return;
      }
      case "wallet.verify": return verifyPurchase(msg.data.merchantOrderId);
      case "auth.sendOtp": {
        if (authWork.has("send")) return;
        authWork.add("send");
        try {
          const result = await api.sendOtp(msg.data.phone, msg.data.role);
          if (current(version)) emit({ type: "auth.otpSent", data: { phone: msg.data.phone, resendAfter: result.resendAfter, expiresIn: result.expiresIn, requestId: msg.data.requestId } });
        } catch (error) {
          if (current(version)) emit({ type: "auth.error", data: { ...metadata(error), action: msg.type, requestId: msg.data.requestId } });
        } finally { authWork.delete("send"); }
        return;
      }
      case "auth.verifyOtp": {
        if (authWork.has("verify")) return;
        authWork.add("verify");
        const sessionVersion = getSessionVersion();
        try {
          const session = await api.verifyOtp(msg.data.phone, msg.data.code, msg.data.role, msg.data.signup);
          if (!current(version) || getSessionVersion() !== sessionVersion) return;
          if (!await setSessionTokens(session.tokens, sessionVersion)) return;
          if (!current(version)) return;
          epoch++; callGeneration++; pendingOutgoing = undefined; activeCall = undefined; // Retire work and socket callbacks owned by the previous identity.
          // Tokens stay native; never spread a Session into a WebView event.
          const { user, balance, earned, verification, requiresOnboarding, isNew } = session;
          accountId = user.id; hostStatus = user.hostStatus;
          emit({ type: "auth.ok", data: { user, balance, earned, verification, requiresOnboarding, isNew, requestId: msg.data.requestId } });
          startSession(session.tokens.accessToken, requiresOnboarding);
        } catch (error) {
          if (current(version)) emit({ type: "auth.error", data: { ...metadata(error), action: msg.type, requestId: msg.data.requestId } });
        } finally { authWork.delete("verify"); }
        return;
      }
      case "auth.google": return emit({ type: "auth.error", data: { message: "Use your mobile number to sign in.", code: "UNSUPPORTED_PROVIDER" } });
      case "auth.logout": {
        const logoutEpoch = ++epoch;
        callGeneration++; pendingOutgoing = undefined; stopLive(); activeCall = undefined; activeStream = undefined; homeQuery = {}; pendingPurchase = undefined;
        const token = getCachedToken();
        const clearing = clearToken();
        const clearedVersion = getSessionVersion();
        accountId = undefined; hostStatus = undefined;
        // Revocation must still run if secure-storage deletion fails. Local
        // invalidation is synchronous; this captured credential cannot revoke
        // a newer login, and network completion never clears its session.
        if (token) void api.logout(token).catch(() => {});
        try { await clearing; }
        catch (error) {
          if (current(logoutEpoch) && getSessionVersion() === clearedVersion) operationError(error, msg.type);
        }
        return;
      }
      case "profile.save": {
        const { onboarding, requestId, ...profile } = msg.data;
        const id = typeof requestId === "number" ? requestId : undefined;
        try {
          const account = await api.saveProfile(profile, (done, total) => {
            if (current(version)) emit({ type: "profile.progress", data: { done, total, requestId: id } });
          });
          if (current(version)) {
            emit({ type: "profile.saved", data: { onboarding: onboarding === true, account, requestId: id } });
            if (onboarding) void loadLists();
          }
        } catch (error) {
          if (current(version)) emit({ type: "profile.error", data: { onboarding: onboarding === true, message: errorMessage(error), requestId: id } });
        }
        return;
      }
      case "media.post.create": {
        if (publishingAt === version) return;
        publishingAt = version;
        try {
          const post = await api.createPost(msg.data.photo, msg.data.caption);
          if (current(version)) emit({ type: "post.saved", data: { post, requestId: msg.data.requestId } });
        } catch (error) {
          if (current(version)) emit({ type: "post.error", data: { message: errorMessage(error), requestId: msg.data.requestId } });
        } finally { if (publishingAt === version) publishingAt = undefined; }
        return;
      }
      case "verification.submit":
        try {
          const { status } = await api.submitVerification(msg.data);
          if (current(version)) emit({ type: "verification.status", data: { status } });
        } catch (error) {
          if (current(version)) emit({ type: "verification.status", data: { status: "none", message: errorMessage(error) } });
        }
        return;
      case "presence.set": {
        const data = await api.setPresence(msg.data.online, msg.data.visible);
        if (current(version)) { emit({ type: "presence.saved", data }); quietly(loadHome(), "home.reload"); }
        return;
      }
      case "settings.set": return quietly(api.saveSettings(msg.data), msg.type);
      case "follow.set": return quietly(api.follow(msg.data.id, msg.data.on), msg.type);
      case "chat.open": {
        const withId = msg.data.with;
        return readResource("thread", () => api.thread(withId), ({ messages }) => emit({ type: "data.thread", data: { with: withId, messages } }));
      }
      case "chat.send": return quietly(api.sendMessage(msg.data.to, msg.data.text, msg.data.inCall ? activeCall : undefined), msg.type);
      case "gift.send": {
        const wallet = await api.sendGift(msg.data.to, msg.data.gift, msg.data.coins, msg.data.inCall ? activeCall : undefined, msg.data.streamId, msg.data.idempotencyKey);
        if (current(version)) { emit({ type: "wallet.balance", data: wallet }); emit({ type: "gift.sent", data: { to: msg.data.to, gift: msg.data.gift, idempotencyKey: msg.data.idempotencyKey } }); }
        return;
      }
      case "call.start": {
        const intent = { generation: ++callGeneration, callId: undefined as string | undefined }, sessionVersion = getSessionVersion();
        pendingOutgoing = intent;
        try {
          const result = await api.startCall(msg.data.to, !!msg.data.voice);
          if (!current(version) || intent.generation !== callGeneration || cancelledCalls.has(result.callId)) {
            await endCancelledCall(result.callId, sessionVersion);
            return;
          }
          activeCall = result.callId;
          emit({ type: "call.created", data: { callId: activeCall, to: msg.data.to, voice: !!msg.data.voice } });
        } catch (error) { if (current(version) && intent.generation === callGeneration) emit({ type: "call.failed", data: { message: errorMessage(error) } }); }
        finally { if (pendingOutgoing === intent) pendingOutgoing = undefined; }
        return;
      }
      case "call.accept": {
        if (cancelledCalls.has(msg.data.callId)) return;
        const generation = ++callGeneration, sessionVersion = getSessionVersion();
        activeCall = msg.data.callId;
        try {
          const details = await api.acceptCall(msg.data.callId);
          if (!current(version) || generation !== callGeneration || cancelledCalls.has(msg.data.callId)) {
            await endCancelledCall(msg.data.callId, sessionVersion);
            return;
          }
          emit({ type: "call.connected", data: { callId: msg.data.callId, initiator: false, ...details } });
        } catch {
          if (current(version) && generation === callGeneration) {
            activeCall = undefined; rememberCancelledCall(msg.data.callId);
            emit({ type: "call.ended", data: { callId: msg.data.callId } });
          }
        }
        return;
      }
      case "call.decline": {
        rememberCancelledCall(msg.data.callId);
        if (activeCall === msg.data.callId) { activeCall = undefined; callGeneration++; }
        return quietly(api.declineCall(msg.data.callId), msg.type);
      }
      case "call.end": {
        const callId = msg.data.callId ?? activeCall;
        if (!msg.data.callId || callId === activeCall || callId === pendingOutgoing?.callId) callGeneration++;
        if (callId) rememberCancelledCall(callId);
        if (callId === activeCall) activeCall = undefined;
        if (callId) quietly(api.endCall(callId, msg.data.reason), msg.type);
        return;
      }
      case "wallet.recharge": return sendWallet(api.recharge(msg.data), msg.type);
      case "payout.request": return sendWallet(api.requestPayout(msg.data.coins, msg.data.upi), msg.type);
      case "awards.claim": {
        const wallet = await api.claimAward(msg.data.task);
        if (current(version)) { emit({ type: "wallet.balance", data: wallet }); emit({ type: "awards.claimed", data: { task: msg.data.task } }); quietly(loadHome(), "home.reload"); }
        return;
      }
      case "theme": case "ui.haptic": return;
    }
  }

  return {
    handle: (msg: WebMessage) => {
      if (closed || !parseWebMessage(JSON.stringify(msg))) return;
      const version = epoch;
      const serialized = ["call.start", "call.accept", "call.match", "stream.start", "stream.join", "wallet.checkout", "gift.send", "awards.claim"].includes(msg.type);
      const key = `${version}:${msg.type}`;
      if (serialized && operations.has(key)) return;
      if (serialized) operations.add(key);
      void handle(msg).catch(error => { if (current(version)) operationError(error, msg.type); }).finally(() => operations.delete(key));
    },
    close: () => { closed = true; epoch++; callGeneration++; unsubscribe(); activity?.remove(); stopLive(); },
  };
}
