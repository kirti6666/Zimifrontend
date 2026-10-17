import type { RefObject } from "react";
import type WebView from "react-native-webview";
import { AppState, Linking, Share } from "react-native";

import { ApiError, errorMessage } from "./api/client";
import { api } from "./api/endpoints";
import { VERIFY_PEER, connectRealtime, type RealtimeConnection } from "./api/realtime";
import type { Account, BlockedUsers, Catalog, ChatsData, HomeData, HomeQuery, HomeStream, Host, Message, PrivacySettings, ProfileSettings, ProfileSettingsPatch, Purchase, Role, ServerRole, RtcConfig, RtcPayload, StreamChat, StreamCallRequest, StreamPrivateCall, StreamReaction, StreamRequests, ThemeCatalog, UserPost, Verification, Wallet } from "./api/types";
import { clearToken, getCachedToken, getToken, getSessionVersion, onSessionExpired, setSessionTokens } from "./session";
import { parseLiveLink, parseWebMessage } from "./web-message";
import { approvedHost } from "./host-access";

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
  | { type: "stream.join" | "stream.leave" | "stream.end" | "stream.ready" | "stream.share"; data: { streamId: string } }
  | { type: "stream.message"; data: { streamId: string; text: string } }
  | { type: "stream.requests.load" | "stream.request" | "stream.react"; data: { streamId: string } }
  | { type: "stream.request.cancel" | "stream.request.decline" | "stream.request.accept"; data: { streamId: string; id: string } }
  | { type: "wallet.checkout"; data: { packId: string; idempotencyKey: string } }
  | { type: "wallet.verify"; data: { merchantOrderId: string } }
  | { type: "themes.load"; data: Record<string, never> }
  | { type: "themes.select"; data: { themeId: string; requestId?: number } }
  | { type: "themes.premium.checkout"; data: { idempotencyKey: string } }
  | { type: "themes.premium.verify"; data: { merchantOrderId: string } }
  | { type: "theme"; data: { theme: "light" | "dark"; canvas?: string; ink?: string; primary?: string; contrast?: string; surface?: string; raised?: string } }
  | { type: "ui.haptic"; data: { kind: "selection" | "success" | "error" | "light" } }
  | { type: "auth.sendOtp"; data: { phone: string; role: Role; requestId?: number } }
  | { type: "auth.verifyOtp"; data: { phone: string; code: string; role: Role; signup: boolean; requestId?: number } }
  | { type: "auth.google"; data: { role: Role; signup: boolean } }
  | { type: "auth.logout"; data: Record<string, never> }
  | { type: "profile.save"; data: Record<string, unknown> }
  | { type: "media.post.create"; data: { photo: string; caption: string; requestId?: number } }
  | { type: "verification.submit"; data: Record<string, unknown> }
  | { type: "presence.set"; data: { online: boolean; visible: boolean } }
  | { type: "profile.settings.load"; data: Record<string, never> }
  | { type: "profile.settings.save" | "settings.set"; data: ProfileSettingsPatch & { requestId?: number } }
  | { type: "privacy.save"; data: Partial<Pick<PrivacySettings, "discoverable" | "showActivity">> & { requestId?: number } }
  | { type: "blocked.load"; data: { page?: number } }
  | { type: "block.set"; data: { id: string; blocked: boolean; requestId?: number } }
  | { type: "follow.set"; data: { id: string; on: boolean } }
  | { type: "chat.open"; data: { with: string } }
  | { type: "chats.reload"; data: { page?: number } }
  | { type: "chats.readAll"; data: Record<string, never> }
  | { type: "chat.send"; data: { to: string; text: string; inCall?: boolean } }
  | { type: "gift.send"; data: { to: string; gift: string; coins: number; inCall: boolean; streamId?: string; idempotencyKey?: string } }
  | { type: "call.start"; data: { to: string; voice?: boolean } }
  | { type: "call.accept"; data: { callId: string } }
  | { type: "call.decline"; data: { callId: string } }
  | { type: "call.end"; data: { callId?: string; reason?: string } }
  | { type: "verify.accept" | "verify.end"; data: { callId: string } }
  | { type: "payout.request"; data: { coins: number; upi: string } }
  | { type: "awards.claim"; data: { task: string } };

/* App -> screens. The live events (call.*, gift.received, chat.message,
   wallet.balance, verification.status) come straight from the server socket. */
export type DataResource = "home" | "search" | "catalog" | "notifications" | "chats" | "wallet" | "transactions" | "calls" | "posts" | "thread" | "missed" | "profileSettings" | "blocked" | "themes";
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
  | { type: "data.themes"; data: ThemeCatalog }
  | { type: "themes.selected"; data: { catalog: ThemeCatalog; requestId?: number } }
  | { type: "themes.error"; data: { action: string; message: string; code?: string; requestId?: number } }
  | { type: "themes.premium.checkout" | "themes.premium.purchase"; data: Purchase }
  | { type: "data.profileSettings"; data: ProfileSettings }
  | { type: "profile.settings.saved"; data: { settings: ProfileSettings; requestId?: number } }
  | { type: "profile.settings.error" | "privacy.error"; data: { message: string; requestId?: number } }
  | { type: "privacy.saved"; data: { privacy: PrivacySettings; requestId?: number } }
  | { type: "data.blocked"; data: BlockedUsers }
  | { type: "block.saved"; data: { id: string; blocked: boolean; requestId?: number } }
  | { type: "block.error"; data: { id: string; blocked: boolean; message: string; requestId?: number } }
  | { type: "presence.saved"; data: { online: boolean; visible: boolean } }
  | { type: "host.access"; data: { approved: boolean; role: Role; serverRole?: ServerRole; hostStatus: string; verified: boolean; checking?: boolean } }
  | { type: "awards.claimed"; data: { task: string } }
  | { type: "gift.sent"; data: { gift: string; to: string; idempotencyKey?: string } }
  | { type: "rtc.config"; data: RtcConfig }
  | { type: "rtc.signal"; data: RtcPayload & { callId: string; from: string } }
  | { type: "stream.signal"; data: RtcPayload & { streamId: string; to: string; from: string } }
  | { type: "stream.peer" | "stream.peerLeft"; data: { streamId: string; userId: string } }
  | { type: "stream.opened"; data: { stream: HomeStream; hosting: boolean; messages: StreamChat[] } }
  | { type: "stream.link"; data: { stream: HomeStream } }
  | { type: "stream.link.loading"; data: { streamId: string; loading: boolean } }
  | { type: "stream.shareLink"; data: { streamId: string; url: string } }
  | { type: "stream.closed" | "stream.ended"; data: { streamId: string } }
  | { type: "stream.viewers"; data: { streamId: string; count: number } }
  | { type: "stream.message"; data: StreamChat }
  | { type: "stream.gift"; data: Record<string, unknown> }
  | { type: "stream.requests"; data: StreamRequests }
  | { type: "stream.request.updated"; data: { streamId: string; request: StreamCallRequest } }
  | { type: "stream.privateCall"; data: StreamPrivateCall }
  | { type: "stream.reaction"; data: StreamReaction }
  | { type: "call.matched"; data: { host: Host } }
  | { type: "call.created"; data: { callId: string; to: string; voice: boolean } }
  | { type: "wallet.checkout" | "wallet.purchase"; data: Purchase }
  | { type: "data.chats"; data: Awaited<ReturnType<typeof api.chats>> }
  | { type: "chats.readAll"; data: { updated: number; readAt: string } }
  | { type: "data.thread"; data: { with: string; messages: Message[]; readAt?: string; canSend?: boolean; sendDisabledReason?: string } }
  | { type: "data.missed"; data: Awaited<ReturnType<typeof api.missedCalls>> }
  | { type: "data.calls"; data: Awaited<ReturnType<typeof api.callHistory>> }
  | { type: "data.transactions"; data: Awaited<ReturnType<typeof api.transactions>> }
  | { type: "wallet.balance"; data: Partial<Wallet> }
  | { type: "verification.status"; data: { status: Verification; hostStatus?: string; message?: string } }
  | { type: "call.connected"; data: { callId: string; initiator?: boolean; peerId?: string; voice?: boolean } }
  | { type: "call.failed"; data: { message: string } }
  | { type: "call.incoming"; data: { callId: string; from: Record<string, unknown>; voice?: boolean } }
  | { type: "call.ended"; data: { callId: string } }
  | { type: "verify.incoming"; data: { callId: string } }
  | { type: "verify.connected"; data: { callId: string; peerId: string; initiator: false; voice: false } }
  | { type: "verify.ended"; data: { callId: string; status: string } }
  | { type: "gift.received"; data: { gift: string; coins: number; from: string; id?: string; streamId?: string; giftId?: string; giftName?: string; senderName?: string; emoji?: string; mediaUrl?: string; senderAvatarUrl?: string } }
  | { type: "chat.message"; data: { from: string; name: string; text: string; id?: string; createdAt?: string; kind?: "text"; inCall?: boolean; callId?: string; automated?: boolean } };

/* Sends one message into the page. */
export function postToWeb(web: RefObject<WebView | null>, msg: AppMessage) {
  const json = JSON.stringify(JSON.stringify(msg));
  web.current?.injectJavaScript(`window.zimiReceive && window.zimiReceive(${json}); true;`);
}

export function createBridge(post: (msg: AppMessage) => void) {
  let stopLive: RealtimeConnection = () => {};
  let appActive = AppState?.currentState !== "background" && AppState?.currentState !== "inactive";
  let liveOnboarding = false;
  let activeCall: string | undefined;
  // A staff verification call; `accepted` marks the device that answered it.
  let verifyCall: { callId: string; accepted: boolean } | undefined;
  let callGeneration = 0;
  let pendingOutgoing: { generation: number; callId?: string } | undefined;
  let pendingStreamAccept: { generation: number; streamId: string; id: string } | undefined;
  const cancelledCalls = new Set<string>();
  let epoch = 0;
  let closed = false;
  let restoring = false;
  let webReady = false, sessionAvailable = false, runtimeLinkReceived = false;
  let linkRevision = 0;
  let pendingStreamLink: { streamId: string; revision: number } | undefined;
  let loadingStreamLink: { revision: number; epoch: number } | undefined;
  let accountId: string | undefined;
  let hostStatus: string | undefined;
  let hostAccount: Account | undefined;
  let accountRole: ServerRole | undefined;
  const chatPeers = new Map<string, Host>();
  const threadPermissions = new Map<string, { canSend: boolean; reason?: string }>();
  let hostRevision = 0;
  let hostChecking = false;
  let activeHostCall = false;
  let publishingAt: number | undefined;
  let homeQuery: HomeQuery = {};
  const readRequests = new Map<DataResource, number>();
  let activeStream: { id: string; hosting: boolean } | undefined;
  let streamRequestsRevision = 0;
  type PurchaseKind = "coins" | "premium";
  const pendingPurchases = new Map<string, { orderId: string; kind: PurchaseKind; epoch: number; sessionVersion: number }>();
  const verifyingPurchases = new Set<string>();
  const operations = new Set<string>();
  const authWork = new Set<string>();
  const current = (version: number) => !closed && version === epoch;
  const emit = (message: AppMessage) => { if (!closed) post(message); };
  const metadata = (error: unknown) => ({
    message: errorMessage(error),
    ...(error instanceof ApiError ? { code: error.code, retryAfterSeconds: error.retryAfterSeconds } : {}),
  });
  const operationError = (error: unknown, action?: string) => {
    if (action?.startsWith("themes.")) emit({ type: "themes.error", data: { message: errorMessage(error), action, ...(error instanceof ApiError ? { code: error.code } : {}) } });
    else emit({ type: "operation.error", data: { message: errorMessage(error), action } });
  };
  const quietly = (work: Promise<unknown>, action?: string) => {
    const version = epoch;
    void work.catch(error => { if (current(version)) operationError(error, action); });
  };
  const flushStreamLink = async () => {
    const link = pendingStreamLink;
    if (!link || closed || !webReady || restoring || !sessionAvailable || !getCachedToken() || !hostAccount || hostAccount.requiresOnboarding || liveOnboarding) return;
    const version = epoch, sessionVersion = getSessionVersion();
    if (loadingStreamLink?.revision === link.revision && loadingStreamLink.epoch === version) return;
    const request = { revision: link.revision, epoch: version };
    loadingStreamLink = request;
    const applicable = () => current(version) && sessionVersion === getSessionVersion() && pendingStreamLink === link && webReady && sessionAvailable && !restoring && !hostAccount?.requiresOnboarding && !liveOnboarding;
    emit({ type: "stream.link.loading", data: { streamId: link.streamId, loading: true } });
    try {
      const stream = await api.stream(link.streamId);
      if (!applicable()) return;
      if (stream.id !== link.streamId || stream.status !== "live" || !stream.hostId) throw new ApiError("This live session has ended or is no longer available.", 404);
      pendingStreamLink = undefined;
      emit({ type: "stream.link", data: { stream } });
    } catch (error) {
      if (applicable()) { pendingStreamLink = undefined; operationError(error, "stream.link"); }
    } finally {
      if (loadingStreamLink === request) loadingStreamLink = undefined;
      if (current(version) && webReady && link.revision === linkRevision) emit({ type: "stream.link.loading", data: { streamId: link.streamId, loading: false } });
      // A reload or account restoration may have deferred this same link while
      // its old request was finishing. The current session owns the retry.
      if (pendingStreamLink && (pendingStreamLink !== link || !current(version))) void flushStreamLink();
    }
  };
  const openStreamLink = (url: unknown) => {
    const streamId = parseLiveLink(url);
    if (!streamId || closed) return false;
    if (pendingStreamLink?.streamId !== streamId) pendingStreamLink = { streamId, revision: ++linkRevision };
    void flushStreamLink();
    return true;
  };
  const loadStreamRequests = async (streamId: string) => {
    const version = epoch, revision = ++streamRequestsRevision;
    try {
      const data = await api.streamRequests(streamId);
      if (current(version) && activeStream?.id === streamId && revision === streamRequestsRevision) emit({ type: "stream.requests", data });
    } catch (error) { if (current(version) && activeStream?.id === streamId && revision === streamRequestsRevision) throw error; }
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
  const hasHostAccess = () => !hostChecking && approvedHost(hostAccount);
  const publishHostAccess = () => {
    const approved = hasHostAccess();
    emit({ type: "host.access", data: { approved, role: approved || (hostChecking && hostAccount?.user.role === "host") ? "host" : "sender", serverRole: accountRole, hostStatus: hostStatus || "", verified: approved || (hostChecking && hostAccount?.user.isVerifiedHost === true), checking: hostChecking } });
    if (!approved && !hostChecking) {
      if (activeStream?.hosting) {
        const streamId = activeStream.id; activeStream = undefined;
        emit({ type: "stream.ended", data: { streamId } });
        void api.endStream(streamId).catch(() => {});
      }
      if (activeHostCall && activeCall) {
        const callId = activeCall; activeCall = undefined; activeHostCall = false; callGeneration++;
        rememberCancelledCall(callId); emit({ type: "call.ended", data: { callId } });
        void api.endCall(callId, "host approval changed").catch(() => {});
      }
    }
  };
  const applyHostAccount = (account: Account, publish = true) => {
    const nextRole = account.user.serverRole ?? (account.user.role === "host" ? "host" : "user");
    if (accountId !== account.user.id) { chatPeers.clear(); threadPermissions.clear(); }
    if (accountRole !== nextRole || approvedHost(hostAccount) !== approvedHost(account)) threadPermissions.clear();
    accountRole = nextRole;
    if (approvedHost(hostAccount) && !approvedHost(account)) hostRevision++;
    accountId = account.user.id; hostStatus = account.user.hostStatus; hostAccount = account;
    hostChecking = false;
    if (publish) publishHostAccess();
  };
  const invalidateHostAccess = (checking: boolean) => {
    threadPermissions.clear();
    hostRevision++; hostChecking = checking;
    if (!checking) hostAccount = undefined;
    publishHostAccess();
  };
  const refreshHostAccount = async () => {
    const version = epoch, sessionVersion = getSessionVersion(), revision = hostRevision;
    const account = await api.me(true);
    if (!current(version) || sessionVersion !== getSessionVersion() || revision !== hostRevision) return;
    applyHostAccount(account);
  };
  const requireApprovedHost = async () => {
    const version = epoch, sessionVersion = getSessionVersion(), revision = hostRevision;
    const account = await api.me(true);
    if (!current(version) || sessionVersion !== getSessionVersion()) throw new ApiError("Your sign-in changed. Please try again.", 409);
    if (revision !== hostRevision) throw new ApiError("Your creator approval changed. Please try again.", 403);
    applyHostAccount(account);
    if (!approvedHost(account)) throw new ApiError("Your creator profile needs admin approval before you can host.", 403);
    return revision;
  };
  const requireChatPair = async (peerId: string) => {
    if (!hostAccount || hostChecking) await refreshHostAccount();
    if (!hostAccount || hostChecking) throw new ApiError("Your account is being checked. Try again in a moment.", 403);
    if (peerId === accountId) throw new ApiError("Choose another user.", 400);
    if (accountRole === "admin" || (accountRole === "host" && !hasHostAccess())) throw new ApiError("Your creator profile needs admin approval before you can chat.", 403);
    const peer = chatPeers.get(peerId);
    const peerRole = peer?.serverRole ?? (peer?.role === "host" || peer?.verified === true ? "host" : peer?.role === "sender" ? "user" : undefined);
    if (accountRole === "host" && peerRole === "host") throw new ApiError("Host accounts can reply to members only. Use a member account to message a host.", 403);
    if (accountRole === "user" && peerRole && peerRole !== "host") throw new ApiError("Members can message approved hosts only.", 403);
  };
  const rememberHomePeers = (data: HomeData) => {
    for (const peer of [...data.hosts, ...(data.stage ?? []), ...(data.featured ? [data.featured] : [])]) chatPeers.set(peer.id, { ...peer, serverRole: "host" });
  };
  const rememberThreadPermission = (peerId: string, data: { canSend?: boolean; sendDisabledReason?: string }) => {
    // Older servers may omit this flag; they still enforce every send. Hosts
    // require explicit permission because welcomes do not unlock manual replies.
    threadPermissions.set(peerId, { canSend: data.canSend ?? accountRole === "user", reason: data.sendDisabledReason });
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
    return readResource("home", () => api.home(query), data => { rememberHomePeers(data); emit({ type: "data.home", data }); }, { page: query.page ?? 1, ...(query.q !== undefined ? { q: query.q } : {}) });
  };
  const loadNotifications = () => readResource("notifications", () => api.notifications(), data => emit({ type: "data.notifications", data }));
  const loadCatalog = () => readResource("catalog", () => api.catalog(), data => emit({ type: "data.catalog", data }));
  const loadThemes = () => readResource("themes", () => api.themes(), data => emit({ type: "data.themes", data }));
  const loadProfileSettings = () => readResource("profileSettings", () => api.profileSettings(), data => emit({ type: "data.profileSettings", data }));
  const loadBlocked = (page = 1) => readResource("blocked", () => api.blockedUsers(page), data => emit({ type: "data.blocked", data }), { page });
  const deliverProfileSettings = (settings: ProfileSettings) => {
    // A GET started before this committed write cannot restore old preferences.
    readRequests.set("profileSettings", (readRequests.get("profileSettings") ?? 0) + 1);
    emit({ type: "data.profileSettings", data: settings });
    emit({ type: "data.loading", data: { resource: "profileSettings", loading: false } });
  };
  const loadChats = (page = 1) => readResource<ChatsData>("chats", () => accountRole === "host" && !hasHostAccess() && !hostChecking
    ? Promise.resolve({ chats: [], total: 0, page, limit: 20, unreadCount: 0, unreadConversations: 0 }) : api.chats(page), data => {
      for (const chat of data.chats) if (chat.user?.id) {
        chatPeers.set(chat.user.id, chat.user);
        if (threadPermissions.has(chat.user.id) && typeof chat.canSend === "boolean") rememberThreadPermission(chat.user.id, chat);
      }
      emit({ type: "data.chats", data });
    }, { page });
  const verifyPurchase = async (orderId: string, kind: PurchaseKind = "coins") => {
    const version = epoch, sessionVersion = getSessionVersion(), key = `${version}:${kind}:${orderId}`;
    if (verifyingPurchases.has(key)) return;
    verifyingPurchases.add(key);
    try {
      const purchase = await (kind === "premium" ? api.verifyPremium(orderId) : api.verifyPurchase(orderId));
      if (current(version) && getSessionVersion() === sessionVersion) {
        const resolvedKind = purchase.kind ?? kind;
        emit({ type: resolvedKind === "premium" ? "themes.premium.purchase" : "wallet.purchase", data: purchase });
        if (purchase.status !== "PENDING") pendingPurchases.delete(orderId);
        // Only a fresh authenticated catalog can grant or revoke theme access.
        if (resolvedKind === "premium") await loadThemes(); else await refreshWallet();
      }
    } finally { verifyingPurchases.delete(key); }
  };
  const activity = AppState?.addEventListener("change", state => {
    if (closed) return;
    appActive = state === "active";
    stopLive.setActive?.(appActive && !liveOnboarding);
    if (!appActive) return;
    for (const pending of pendingPurchases.values()) {
      if (pending.epoch === epoch && pending.sessionVersion === getSessionVersion()) {
        quietly(verifyPurchase(pending.orderId, pending.kind), pending.kind === "premium" ? "themes.premium.verify" : "wallet.verify");
      }
    }
    if (accountId && getCachedToken() && !hostAccount?.requiresOnboarding) quietly(loadThemes(), "themes.load");
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
      loadHome(), loadNotifications(), loadCatalog(), loadProfileSettings(), loadThemes(),
      api.presence().then(data => deliver({ type: "presence.saved", data: { ...data, online: hasHostAccess() && data.online } })),
      loadChats(),
      readResource("missed", () => api.missedCalls(), data => deliver({ type: "data.missed", data })),
      readResource("calls", () => api.callHistory(), data => deliver({ type: "data.calls", data })),
      readResource("transactions", () => api.transactions(), data => deliver({ type: "data.transactions", data })),
      readResource("posts", () => hasHostAccess() ? api.myPosts() : Promise.resolve({ posts: [] }), data => deliver({ type: "data.posts", data })),
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
    liveOnboarding = onboarding;
    sessionAvailable = true;
    const version = epoch;
    stopLive = connectRealtime(token, event => {
      if (!current(version)) return;
      if (event.type === "verification.status") {
        hostStatus = typeof event.data?.hostStatus === "string" ? event.data.hostStatus : event.data?.status === "verified" ? "approved" : String(event.data?.status || "none");
        invalidateHostAccess(false);
        quietly(refreshHostAccount(), "host.refresh");
      }
      if (event.type === "realtime.status") {
        if (event.data?.connected === true) {
          invalidateHostAccess(true);
          quietly(refreshHostAccount(), "host.refresh");
        } else if (!hostChecking) invalidateHostAccess(true);
      }
      if (event.type === "wallet.refresh") { quietly(refreshWallet(), "wallet.refresh"); return; }
      if (event.type === "chats.updated") { if (!liveOnboarding) quietly(loadChats(), "chats.reload"); return; }
      if (event.type === "account.updated") {
        if (!liveOnboarding) { quietly(loadProfileSettings(), "profile.settings.load"); quietly(loadThemes(), "themes.load"); }
        return;
      }
      if (event.type === "themes.updated") { if (!liveOnboarding) quietly(loadThemes(), "themes.load"); return; }
      const callId = event.data?.callId;
      if (event.type === "verify.updated" && typeof callId === "string") {
        const status = String(event.data?.status);
        if (status === "ringing") {
          if (verifyCall?.callId !== callId) verifyCall = { callId, accepted: false };
          emit({ type: "verify.incoming", data: { callId } });
        } else if (status !== "accepted" || (verifyCall?.callId === callId && !verifyCall.accepted)) {
          // Ended, or answered on another of this person's devices.
          if (verifyCall?.callId === callId) verifyCall = undefined;
          emit({ type: "verify.ended", data: { callId, status } });
        }
        return;
      }
      if (event.type === "stream.requests.changed") {
        if (event.data?.streamId === activeStream?.id && activeStream) quietly(loadStreamRequests(activeStream.id), "stream.requests.load");
        return;
      }
      if (event.type === "stream.privateCall" && typeof callId === "string") {
        if (cancelledCalls.has(callId) || (event.data?.initiator === false && !hasHostAccess()) ||
          (pendingStreamAccept && pendingStreamAccept.id === event.data?.requestId && pendingStreamAccept.generation !== callGeneration)) {
          quietly(endCancelledCall(callId, getSessionVersion()), "call.end"); return;
        }
        activeCall = callId; activeHostCall = event.data?.initiator === false;
        if (event.data?.streamId === activeStream?.id) activeStream = undefined;
      }
      if (event.type === "call.incoming" && typeof callId === "string" && !hasHostAccess()) {
        void api.declineCall(callId).catch(() => {}); return;
      }
      if (event.type === "call.ended" && typeof callId === "string") {
        rememberCancelledCall(callId);
        if (callId === activeCall) { activeCall = undefined; activeHostCall = false; callGeneration++; }
      }
      if (event.type === "call.connected" && typeof callId === "string") {
        if (event.data?.initiator === false && !hasHostAccess() && !(hostChecking && activeHostCall && activeCall === callId)) {
          quietly(endCancelledCall(callId, getSessionVersion()), "call.end");
          emit({ type: "call.ended", data: { callId } }); return;
        }
        if (cancelledCalls.has(callId) || (event.data?.initiator === true && pendingOutgoing && pendingOutgoing.generation !== callGeneration)) {
          quietly(endCancelledCall(callId, getSessionVersion()), "call.end");
          return;
        }
        if (event.data?.initiator === true && pendingOutgoing) pendingOutgoing.callId = callId;
        activeCall = callId;
        activeHostCall = event.data?.initiator === false;
      }
      if (event.type === "stream.ended" && event.data?.streamId === activeStream?.id) activeStream = undefined;
      if (event.type === "home.updated") quietly(loadHome({ ...homeQuery, page: 1 }), "home.reload");
      if (event.type === "realtime.status" && event.data?.connected === true && !liveOnboarding) {
        if (activeStream) quietly(loadStreamRequests(activeStream.id), "stream.requests.load");
        quietly(loadHome({ ...homeQuery, page: 1 }), "home.reload");
        quietly(loadChats(), "chats.reload");
        quietly(loadProfileSettings(), "profile.settings.load");
        quietly(loadThemes(), "themes.load");
      }
      emit(event as AppMessage);
    }, accountId, appActive && !liveOnboarding);
    if (!onboarding) void loadLists();
    void flushStreamLink();
  };
  const unsubscribe = onSessionExpired(() => {
    sessionAvailable = false;
    accountRole = undefined; chatPeers.clear(); threadPermissions.clear();
    epoch++; callGeneration++; pendingOutgoing = undefined; verifyCall = undefined; stopLive(); activeCall = undefined; activeStream = undefined; homeQuery = {}; pendingPurchases.clear();
    hostRevision++; hostChecking = false; hostAccount = undefined; hostStatus = undefined; activeHostCall = false;
    emit({ type: "session.expired", data: { message: "Your session has ended. Please sign in again." } });
  });
  const restoreSession = async () => {
    if (restoring) return;
    restoring = true;
    sessionAvailable = false;
    const version = epoch, sessionVersion = getSessionVersion();
    emit({ type: "session.restoring", data: {} });
    try {
      const token = await getToken();
      if (!current(version)) return;
      if (!token) { emit({ type: "session.none", data: {} }); return; }
      let revision = hostRevision;
      let account = await api.me();
      while (current(version) && sessionVersion === getSessionVersion() && revision !== hostRevision) {
        revision = hostRevision; account = await api.me(true);
      }
      if (!current(version) || sessionVersion !== getSessionVersion()) return;
      applyHostAccount(account, false);
      emit({ type: "session", data: account });
      const renewed = await getToken();
      if (renewed && current(version)) startSession(renewed, account.requiresOnboarding);
    } catch (error) {
      if (current(version)) emit({ type: "session.error", data: { message: errorMessage(error) } });
    } finally { restoring = false; void flushStreamLink(); }
  };

  async function handle(msg: WebMessage) {
    const version = epoch;
    switch (msg.type) {
      case "ready": webReady = !msg.data.demo; if (webReady) await restoreSession(); return;
      case "session.resume": return restoreSession();
      case "data.reload": if (await getToken()) await loadLists(); return;
      case "home.reload": return loadHome(msg.data);
      case "hosts.search": {
        const q = msg.data.q, page = msg.data.page ?? 1;
        return readResource("search", () => api.home({ q, mode: "popular", page }), data => { rememberHomePeers(data); emit({ type: "data.search", data: { q, hosts: data.hosts, total: data.total, page: data.page } }); }, { q, page });
      }
      case "notifications.load": return loadNotifications();
      case "notifications.read": return readResource("notifications", () => api.readNotifications(msg.data.ids), data => emit({ type: "data.notifications", data }));
      case "catalog.load": return loadCatalog();
      case "themes.load": return loadThemes();
      case "themes.select": {
        const { themeId, requestId } = msg.data, sessionVersion = getSessionVersion();
        try {
          const catalog = await api.selectTheme(themeId);
          if (current(version) && sessionVersion === getSessionVersion()) {
            // Reads started before this committed selection cannot restore an older choice.
            readRequests.set("themes", (readRequests.get("themes") ?? 0) + 1);
            emit({ type: "data.themes", data: catalog });
            emit({ type: "data.loading", data: { resource: "themes", loading: false } });
            emit({ type: "themes.selected", data: { catalog, requestId } });
          }
        } catch (error) {
          if (current(version) && sessionVersion === getSessionVersion()) {
            emit({ type: "themes.error", data: { action: msg.type, message: errorMessage(error), requestId, ...(error instanceof ApiError ? { code: error.code } : {}) } });
            quietly(loadThemes(), "themes.load");
          }
        }
        return;
      }
      case "profile.settings.load": return loadProfileSettings();
      case "blocked.load": return loadBlocked(msg.data.page);
      case "rtc.config": { const data = await api.rtcConfig(); if (current(version)) emit({ type: "rtc.config", data }); return; }
      case "rtc.signal": case "stream.signal": case "stream.ready": {
        if (msg.type === "rtc.signal" && msg.data.callId === verifyCall?.callId) {
          const { callId, ...signal } = msg.data;
          return api.verificationSignal(callId, signal);
        }
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
        const approval = hosting ? await requireApprovedHost() : hostRevision;
        const stream = msg.type === "stream.start" ? await api.startStream(msg.data) : await api.joinStream(msg.data.streamId);
        if (!current(version)) return;
        if (hosting && (approval !== hostRevision || !hasHostAccess())) { await api.endStream(stream.id); return; }
        activeStream = { id: stream.id, hosting };
        const messages = await api.streamMessages(stream.id).catch(() => []);
        if (current(version) && activeStream?.id === stream.id) emit({ type: "stream.opened", data: { stream, hosting, messages } });
        if (current(version) && activeStream?.id === stream.id) quietly(loadStreamRequests(stream.id), "stream.requests.load");
        quietly(loadHome(), "home.reload");
        return;
      }
      case "stream.share": {
        if (!sessionAvailable || !getCachedToken() || activeStream?.id !== msg.data.streamId) throw new ApiError("Open this live room before sharing it.", 409);
        const url = `zimilive://live/${msg.data.streamId}`;
        emit({ type: "stream.shareLink", data: { streamId: msg.data.streamId, url } });
        await Share.share({ title: "Zimi Live", message: `Join this live on Zimi Live: ${url}` });
        return;
      }
      case "stream.leave": case "stream.end": {
        if (pendingStreamAccept?.streamId === msg.data.streamId) callGeneration++;
        if (msg.type === "stream.end") await api.endStream(msg.data.streamId); else await api.leaveStream(msg.data.streamId);
        if (current(version)) {
          if (activeStream?.id === msg.data.streamId) activeStream = undefined;
          emit({ type: "stream.closed", data: { streamId: msg.data.streamId } });
          quietly(loadHome(), "home.reload");
        }
        return;
      }
      case "stream.message": { const data = await api.sendStreamMessage(msg.data.streamId, msg.data.text); if (current(version)) emit({ type: "stream.message", data }); return; }
      case "stream.requests.load": return loadStreamRequests(msg.data.streamId);
      case "stream.request": {
        const data = await api.requestStreamCall(msg.data.streamId);
        if (current(version) && activeStream?.id === msg.data.streamId) { streamRequestsRevision++; emit({ type: "stream.requests", data }); }
        return;
      }
      case "stream.request.cancel": case "stream.request.decline": {
        if (msg.type === "stream.request.decline") await requireApprovedHost();
        const data = await api.updateStreamRequest(msg.data.streamId, msg.data.id, msg.type === "stream.request.cancel" ? "cancel" : "decline");
        if (current(version)) { emit({ type: "stream.request.updated", data: { streamId: msg.data.streamId, request: data } }); await loadStreamRequests(msg.data.streamId); }
        return;
      }
      case "stream.request.accept": {
        const intent = { generation: ++callGeneration, streamId: msg.data.streamId, id: msg.data.id }, sessionVersion = getSessionVersion();
        pendingStreamAccept = intent;
        try {
          const approval = await requireApprovedHost();
          if (intent.generation !== callGeneration) return;
          const data = await api.acceptStreamRequest(msg.data.streamId, msg.data.id);
          if (!current(version) || intent.generation !== callGeneration || approval !== hostRevision || !hasHostAccess() || cancelledCalls.has(data.callId)) { await endCancelledCall(data.callId, sessionVersion); return; }
          activeCall = data.callId; activeHostCall = true;
          if (activeStream?.id === data.streamId) activeStream = undefined;
          emit({ type: "stream.privateCall", data });
        } finally { if (pendingStreamAccept === intent) pendingStreamAccept = undefined; }
        return;
      }
      case "stream.react": {
        const data = await api.reactToStream(msg.data.streamId);
        if (current(version)) emit({ type: "stream.reaction", data });
        return;
      }
      case "wallet.checkout": case "themes.premium.checkout": {
        const kind: PurchaseKind = msg.type === "themes.premium.checkout" ? "premium" : "coins", sessionVersion = getSessionVersion();
        const purchase = await (msg.type === "wallet.checkout" ? api.checkout(msg.data.packId, msg.data.idempotencyKey) : api.checkoutPremium(msg.data.idempotencyKey));
        if (!current(version) || sessionVersion !== getSessionVersion()) return;
        if (purchase.status === "PENDING" && purchase.merchantOrderId) pendingPurchases.set(purchase.merchantOrderId, { orderId: purchase.merchantOrderId, kind, epoch: version, sessionVersion });
        // Payment pages stay outside the privileged application WebView.
        if (purchase.status === "PENDING" && purchase.paymentUrl) await Linking.openURL(purchase.paymentUrl);
        if (current(version) && sessionVersion === getSessionVersion()) {
          emit({ type: kind === "premium" ? "themes.premium.checkout" : "wallet.checkout", data: purchase });
          if (kind === "premium" && purchase.status !== "PENDING") await loadThemes();
        }
        return;
      }
      case "wallet.verify": return verifyPurchase(msg.data.merchantOrderId);
      case "themes.premium.verify": return verifyPurchase(msg.data.merchantOrderId, "premium");
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
          epoch++; callGeneration++; pendingOutgoing = undefined; verifyCall = undefined; activeCall = undefined; pendingPurchases.clear(); chatPeers.clear(); threadPermissions.clear(); // Retire work and socket callbacks owned by the previous identity.
          // Tokens stay native; never spread a Session into a WebView event.
          const { user, balance, earned, verification, requiresOnboarding, isNew } = session;
          applyHostAccount({ user, balance, earned, verification, requiresOnboarding }, false);
          emit({ type: "auth.ok", data: { user, balance, earned, verification, requiresOnboarding, isNew, requestId: msg.data.requestId } });
          startSession(session.tokens.accessToken, requiresOnboarding);
        } catch (error) {
          if (current(version)) emit({ type: "auth.error", data: { ...metadata(error), action: msg.type, requestId: msg.data.requestId } });
        } finally { authWork.delete("verify"); }
        return;
      }
      case "auth.google": return emit({ type: "auth.error", data: { message: "Use your mobile number to sign in.", code: "UNSUPPORTED_PROVIDER" } });
      case "auth.logout": {
        sessionAvailable = false; pendingStreamLink = undefined; linkRevision++;
        accountRole = undefined; chatPeers.clear(); threadPermissions.clear();
        const logoutEpoch = ++epoch;
        callGeneration++; pendingOutgoing = undefined; verifyCall = undefined; stopLive(); activeCall = undefined; activeStream = undefined; homeQuery = {}; pendingPurchases.clear();
        const token = getCachedToken();
        const clearing = clearToken();
        const clearedVersion = getSessionVersion();
        accountId = undefined; hostStatus = undefined;
        hostRevision++; hostChecking = false; hostAccount = undefined; activeHostCall = false;
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
        const sessionVersion = getSessionVersion();
        let revision = hostRevision;
        // A summary fetched before this edit must not repaint old profile fields.
        readRequests.set("profileSettings", (readRequests.get("profileSettings") ?? 0) + 1);
        try {
          let account = await api.saveProfile(profile, (done, total) => {
            if (current(version)) emit({ type: "profile.progress", data: { done, total, requestId: id } });
          });
          while (current(version) && sessionVersion === getSessionVersion() && revision !== hostRevision) {
            revision = hostRevision; account = await api.me(true);
          }
          if (current(version) && sessionVersion === getSessionVersion()) {
            // Also retire summary reads started while the profile write was pending.
            readRequests.set("profileSettings", (readRequests.get("profileSettings") ?? 0) + 1);
            applyHostAccount(account, false);
            emit({ type: "profile.saved", data: { onboarding: onboarding === true, account, requestId: id } });
            if (onboarding) {
              liveOnboarding = account.requiresOnboarding === true;
              stopLive.setActive?.(appActive && !liveOnboarding);
              void loadLists();
              void flushStreamLink();
            }
            else quietly(loadProfileSettings(), "profile.settings.load");
          }
        } catch (error) {
          if (current(version) && sessionVersion === getSessionVersion()) {
            emit({ type: "profile.error", data: { onboarding: onboarding === true, message: errorMessage(error), requestId: id } });
            // The retired read cannot settle its skeleton; recover current data.
            quietly(loadProfileSettings(), "profile.settings.load");
          }
        }
        return;
      }
      case "media.post.create": {
        if (publishingAt === version) return;
        publishingAt = version;
        try {
          const approval = await requireApprovedHost();
          const post = await api.createPost(msg.data.photo, msg.data.caption);
          if (current(version) && approval === hostRevision && hasHostAccess()) emit({ type: "post.saved", data: { post, requestId: msg.data.requestId } });
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
        const approval = msg.data.online ? await requireApprovedHost() : hostRevision;
        const data = await api.setPresence(msg.data.online, msg.data.visible);
        if (current(version) && (!msg.data.online || (approval === hostRevision && hasHostAccess()))) { emit({ type: "presence.saved", data }); quietly(loadHome(), "home.reload"); }
        return;
      }
      case "profile.settings.save": case "settings.set": {
        const { requestId, ...patch } = msg.data;
        const sessionVersion = getSessionVersion();
        try {
          const settings = await api.saveProfileSettings(patch);
          if (current(version) && sessionVersion === getSessionVersion()) {
            deliverProfileSettings(settings);
            emit({ type: "profile.settings.saved", data: { settings, requestId } });
          }
        } catch (error) {
          if (current(version) && sessionVersion === getSessionVersion()) emit({ type: "profile.settings.error", data: { message: errorMessage(error), requestId } });
        }
        return;
      }
      case "privacy.save": {
        const { requestId, ...patch } = msg.data;
        const sessionVersion = getSessionVersion();
        try {
          const privacy = await api.savePrivacy(patch);
          if (current(version) && sessionVersion === getSessionVersion()) {
            emit({ type: "privacy.saved", data: { privacy, requestId } });
            quietly(loadProfileSettings(), "profile.settings.load");
            quietly(loadHome({ ...homeQuery, page: 1 }), "home.reload");
          }
        } catch (error) {
          if (current(version) && sessionVersion === getSessionVersion()) emit({ type: "privacy.error", data: { message: errorMessage(error), requestId } });
        }
        return;
      }
      case "block.set": {
        const { id, blocked, requestId } = msg.data, sessionVersion = getSessionVersion();
        try {
          await api.setBlocked(id, blocked);
          if (current(version) && sessionVersion === getSessionVersion()) {
            emit({ type: "block.saved", data: { id, blocked, requestId } });
            quietly(loadBlocked(), "blocked.load");
            quietly(loadProfileSettings(), "profile.settings.load");
            quietly(loadChats(), "chats.reload");
            quietly(loadHome({ ...homeQuery, page: 1 }), "home.reload");
          }
        } catch (error) {
          if (current(version) && sessionVersion === getSessionVersion()) emit({ type: "block.error", data: { id, blocked, message: errorMessage(error), requestId } });
        }
        return;
      }
      case "follow.set": return quietly(api.follow(msg.data.id, msg.data.on), msg.type);
      case "chats.reload": return loadChats(msg.data.page);
      case "chats.readAll": {
        const data = await api.readAllChats();
        if (current(version)) {
          emit({ type: "chats.readAll", data });
          quietly(loadChats(), "chats.reload");
        }
        return;
      }
      case "chat.open": {
        const withId = msg.data.with;
        threadPermissions.delete(withId);
        return readResource("thread", async () => {
          await requireChatPair(withId);
          if (!current(version)) throw new ApiError("Your sign-in changed. Please try again.", 409);
          const revision = hostRevision, data = await api.thread(withId);
          if (revision !== hostRevision) throw new ApiError("Your account permissions changed. Open the conversation again.", 403);
          return data;
        }, data => {
          rememberThreadPermission(withId, data);
          emit({ type: "data.thread", data: { with: withId, ...data } });
          // Only the messages returned by this page are marked read by the server.
          // Reload its counts instead of incorrectly clearing the entire conversation.
          quietly(loadChats(), "chats.reload");
        });
      }
      case "chat.send": {
        const callId = msg.data.inCall ? activeCall : undefined;
        if (msg.data.inCall && !callId) throw new ApiError("Your call has ended. Open the conversation to send a message.", 409);
        await requireChatPair(msg.data.to);
        if (!current(version)) return;
        if (callId && activeCall !== callId) throw new ApiError("Your call has ended. Open the conversation to send a message.", 409);
        if (!callId && !threadPermissions.has(msg.data.to)) {
          const revision = hostRevision;
          const data = await api.thread(msg.data.to);
          if (!current(version)) return;
          if (revision !== hostRevision) throw new ApiError("Your account permissions changed. Open the conversation again.", 403);
          rememberThreadPermission(msg.data.to, data);
        }
        const permission = threadPermissions.get(msg.data.to);
        if (!callId && !permission?.canSend) throw new ApiError(permission?.reason || "Wait for this member to reply before sending a message.", 403);
        // The server verifies that this accepted call belongs to both users;
        // an in-call reply need not wait for a preexisting text conversation.
        await api.sendMessage(msg.data.to, msg.data.text, callId);
        if (current(version)) quietly(loadChats(), "chats.reload");
        return;
      }
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
        finally { if (pendingOutgoing === intent) pendingOutgoing = undefined; verifyCall = undefined; }
        return;
      }
      case "call.accept": {
        if (cancelledCalls.has(msg.data.callId)) return;
        const generation = ++callGeneration, sessionVersion = getSessionVersion();
        activeCall = msg.data.callId; activeHostCall = true;
        try {
          const approval = await requireApprovedHost();
          if (generation !== callGeneration || cancelledCalls.has(msg.data.callId)) return;
          const details = await api.acceptCall(msg.data.callId);
          if (!current(version) || generation !== callGeneration || cancelledCalls.has(msg.data.callId) || approval !== hostRevision || !hasHostAccess()) {
            await endCancelledCall(msg.data.callId, sessionVersion);
            return;
          }
          emit({ type: "call.connected", data: { callId: msg.data.callId, initiator: false, ...details } });
        } catch {
          if (current(version) && generation === callGeneration) {
            activeCall = undefined; activeHostCall = false; rememberCancelledCall(msg.data.callId);
            emit({ type: "call.ended", data: { callId: msg.data.callId } });
          }
        }
        return;
      }
      case "call.decline": {
        rememberCancelledCall(msg.data.callId);
        if (activeCall === msg.data.callId) { activeCall = undefined; activeHostCall = false; callGeneration++; }
        return quietly(api.declineCall(msg.data.callId), msg.type);
      }
      case "verify.accept": {
        const callId = msg.data.callId;
        verifyCall = { callId, accepted: true };
        try {
          await api.acceptVerificationCall(callId);
          if (current(version) && verifyCall?.callId === callId) emit({ type: "verify.connected", data: { callId, peerId: VERIFY_PEER, initiator: false, voice: false } });
        } catch (error) {
          if (verifyCall?.callId === callId) verifyCall = undefined;
          if (current(version)) emit({ type: "verify.ended", data: { callId, status: "unavailable" } });
          throw error;
        }
        return;
      }
      case "verify.end": {
        if (verifyCall?.callId === msg.data.callId) verifyCall = undefined;
        return quietly(api.endVerificationCall(msg.data.callId), msg.type);
      }
      case "call.end": {
        if (msg.data.callId && msg.data.callId === verifyCall?.callId) {
          // The call media failed on this device.
          verifyCall = undefined;
          emit({ type: "verify.ended", data: { callId: msg.data.callId, status: "failed" } });
          return quietly(api.endVerificationCall(msg.data.callId), msg.type);
        }
        const callId = msg.data.callId ?? activeCall;
        if (!msg.data.callId || callId === activeCall || callId === pendingOutgoing?.callId) callGeneration++;
        if (callId) rememberCancelledCall(callId);
        if (callId === activeCall) { activeCall = undefined; activeHostCall = false; }
        if (callId) quietly(api.endCall(callId, msg.data.reason), msg.type);
        return;
      }
      case "payout.request": {
        await requireApprovedHost();
        return sendWallet(api.requestPayout(msg.data.coins, msg.data.upi), msg.type);
      }
      case "awards.claim": {
        const approval = await requireApprovedHost();
        const wallet = await api.claimAward(msg.data.task);
        if (current(version) && approval === hostRevision && hasHostAccess()) { emit({ type: "wallet.balance", data: wallet }); emit({ type: "awards.claimed", data: { task: msg.data.task } }); quietly(loadHome(), "home.reload"); }
        return;
      }
      case "theme": case "ui.haptic": return;
    }
  }

  const linkSubscription = Linking.addEventListener("url", event => {
    if (openStreamLink(event.url)) runtimeLinkReceived = true;
  });
  void Linking.getInitialURL().then(url => { if (!runtimeLinkReceived && !closed) openStreamLink(url); }).catch(() => {});

  return {
    documentLoading: () => { webReady = false; },
    handle: (msg: WebMessage) => {
      if (closed || !parseWebMessage(JSON.stringify(msg))) return;
      const version = epoch;
      const serialized = ["call.start", "call.accept", "verify.accept", "call.match", "stream.start", "stream.join", "stream.share", "stream.request", "stream.request.cancel", "stream.request.decline", "stream.request.accept", "stream.react", "wallet.checkout", "themes.premium.checkout", "themes.select", "gift.send", "awards.claim", "chats.readAll", "profile.settings.save", "settings.set", "privacy.save", "block.set"].includes(msg.type);
      const key = `${version}:${msg.type === "settings.set" ? "profile.settings.save" : msg.type}${msg.type === "block.set" ? `:${msg.data.id}` : ""}`;
      if (serialized && operations.has(key)) return;
      if (serialized) operations.add(key);
      void handle(msg).catch(error => {
        if (!current(version)) return;
        operationError(error, msg.type);
      }).finally(() => operations.delete(key));
    },
    close: () => { closed = true; epoch++; callGeneration++; unsubscribe(); activity?.remove(); linkSubscription.remove(); stopLive(); },
  };
}
