import type { RefObject } from "react";
import type WebView from "react-native-webview";

import { ApiError, errorMessage } from "./api/client";
import { api } from "./api/endpoints";
import { connectRealtime } from "./api/realtime";
import type { Account, Host, Message, Role, UserPost, Verification, Wallet } from "./api/types";
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
  | { type: "gift.send"; data: { to: string; gift: string; coins: number; inCall: boolean } }
  | { type: "call.start"; data: { to: string; voice?: boolean } }
  | { type: "call.accept"; data: { callId: string } }
  | { type: "call.decline"; data: { callId: string } }
  | { type: "call.end"; data: { callId?: string; reason?: string } }
  | { type: "wallet.recharge"; data: { pack: number; coins: number; price: number; method: string } }
  | { type: "payout.request"; data: { coins: number; upi: string } }
  | { type: "awards.claim"; data: { task: string } };

/* App -> screens. The live events (call.*, gift.received, chat.message,
   wallet.balance, verification.status) come straight from the server socket. */
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
  | { type: "realtime.status"; data: { connected: boolean; message?: string } }
  | { type: "data.hosts"; data: { hosts: Host[] } }
  | { type: "data.chats"; data: Awaited<ReturnType<typeof api.chats>> }
  | { type: "data.thread"; data: { with: string; messages: Message[] } }
  | { type: "data.missed"; data: Awaited<ReturnType<typeof api.missedCalls>> }
  | { type: "data.calls"; data: Awaited<ReturnType<typeof api.callHistory>> }
  | { type: "data.transactions"; data: Awaited<ReturnType<typeof api.transactions>> }
  | { type: "wallet.balance"; data: Partial<Wallet> }
  | { type: "verification.status"; data: { status: Verification; message?: string } }
  | { type: "call.connected"; data: { callId: string } }
  | { type: "call.failed"; data: { message: string } }
  | { type: "call.incoming"; data: { callId: string; from: Record<string, unknown> } }
  | { type: "call.ended"; data: { callId: string } }
  | { type: "gift.received"; data: { gift: string; coins: number; from: string } }
  | { type: "chat.message"; data: { from: string; name: string; text: string; inCall?: boolean } };

/* Sends one message into the page. */
export function postToWeb(web: RefObject<WebView | null>, msg: AppMessage) {
  const json = JSON.stringify(JSON.stringify(msg));
  web.current?.injectJavaScript(`window.zimiReceive && window.zimiReceive(${json}); true;`);
}

export function createBridge(post: (msg: AppMessage) => void) {
  let stopLive = () => {};
  let activeCall: string | undefined;
  let epoch = 0;
  let closed = false;
  let restoring = false;
  let accountId: string | undefined;
  let hostStatus: string | undefined;
  let publishingAt: number | undefined;
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
  const refreshWallet = () => {
    const version = epoch;
    return api.wallet().then(wallet => { if (current(version)) emit({ type: "wallet.balance", data: wallet }); });
  };
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
      api.hosts().then(data => deliver({ type: "data.hosts", data })),
      (["pending", "rejected", "suspended"].includes(hostStatus || "") ? Promise.resolve({ chats: [] }) : api.chats()).then(data => deliver({ type: "data.chats", data })),
      api.missedCalls().then(data => deliver({ type: "data.missed", data })),
      api.callHistory().then(data => deliver({ type: "data.calls", data })),
      api.transactions().then(data => deliver({ type: "data.transactions", data })),
      (hostStatus === "approved" ? api.myPosts() : Promise.resolve({ posts: [] })).then(data => deliver({ type: "data.posts", data })),
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
      const callId = event.data?.callId;
      if (event.type === "call.ended" && callId === activeCall) activeCall = undefined;
      emit(event as AppMessage);
    }, accountId);
    if (!onboarding) void loadLists();
  };
  const unsubscribe = onSessionExpired(() => {
    epoch++; stopLive(); activeCall = undefined;
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
          epoch++; // Retire work and socket callbacks owned by the previous identity.
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
        stopLive(); activeCall = undefined;
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
      case "presence.set": return quietly(api.setPresence(msg.data.online, msg.data.visible), msg.type);
      case "settings.set": return quietly(api.saveSettings(msg.data), msg.type);
      case "follow.set": return quietly(api.follow(msg.data.id, msg.data.on), msg.type);
      case "chat.open": {
        const withId = msg.data.with;
        return quietly(api.thread(withId).then(({ messages }) => { if (current(version)) emit({ type: "data.thread", data: { with: withId, messages } }); }), msg.type);
      }
      case "chat.send": return quietly(api.sendMessage(msg.data.to, msg.data.text, msg.data.inCall ? activeCall : undefined), msg.type);
      case "gift.send": return sendWallet(api.sendGift(msg.data.to, msg.data.gift, msg.data.coins, msg.data.inCall ? activeCall : undefined), msg.type);
      case "call.start":
        try { const result = await api.startCall(msg.data.to, !!msg.data.voice); if (current(version)) activeCall = result.callId; }
        catch (error) { if (current(version)) emit({ type: "call.failed", data: { message: errorMessage(error) } }); }
        return;
      case "call.accept":
        try { await api.acceptCall(msg.data.callId); if (current(version)) { activeCall = msg.data.callId; emit({ type: "call.connected", data: { callId: activeCall } }); } }
        catch { if (current(version)) emit({ type: "call.ended", data: { callId: msg.data.callId } }); }
        return;
      case "call.decline": return quietly(api.declineCall(msg.data.callId), msg.type);
      case "call.end": {
        const callId = msg.data.callId ?? activeCall;
        if (callId === activeCall) activeCall = undefined;
        if (callId) quietly(api.endCall(callId, msg.data.reason), msg.type);
        return;
      }
      case "wallet.recharge": return sendWallet(api.recharge(msg.data), msg.type);
      case "payout.request": return sendWallet(api.requestPayout(msg.data.coins, msg.data.upi), msg.type);
      case "awards.claim": return sendWallet(api.claimAward(msg.data.task), msg.type);
      case "theme": case "ui.haptic": return;
    }
  }

  return {
    handle: (msg: WebMessage) => {
      if (closed || !parseWebMessage(JSON.stringify(msg))) return;
      const version = epoch;
      void handle(msg).catch(error => { if (current(version)) operationError(error, msg.type); });
    },
    close: () => { closed = true; epoch++; unsubscribe(); stopLive(); },
  };
}
