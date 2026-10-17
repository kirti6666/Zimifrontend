import { ApiError, request } from "./client";
import { getSessionVersion, isSessionTokens, type SessionTokens } from "../session";
import { accountFrom, blockedUsersFrom, callsFrom, catalogFrom, chatsFrom, homeFrom, hostFrom, idOf, items, messagesFrom, missedFrom, notificationsFrom, postFrom, privacyFrom, profileSettingsFrom, purchaseFrom, record, streamChatFrom, streamFrom, themesFrom, transactionsFrom, verificationOf, walletFrom } from "./adapters";
import { decodePhoto, ensureSession, uploadMedia, uploadPhotos } from "./uploads";
import type { Account, HomeQuery, PrivacySettings, ProfileSettingsPatch, Role, RtcConfig, RtcPayload, Session, StreamCallRequest, StreamPrivateCall, StreamReaction, StreamRequests, Verification, Wallet } from "./types";
import { approvedHost } from "../host-access";

let identity: { id: string; version: number } | undefined;
let pendingProfile: { version: number; promise: Promise<Account> } | undefined;
const remember = (account: Account) => { identity = { id: account.user.id, version: getSessionVersion() }; return account; };
async function selfId(): Promise<string> {
  return identity?.version === getSessionVersion() ? identity.id : (await api.me()).user.id;
}
export function phonePayload(phone: string): { country_code: string; phone: string } {
  const digits = phone.replace(/[\s()-]/g, "");
  const local = digits.startsWith("+91") ? digits.slice(3) : digits;
  if (!/^[6-9]\d{9}$/.test(local)) throw new ApiError("Enter a valid 10-digit Indian mobile number.", 400);
  return { country_code: "+91", phone: local };
}
function boundedStrings(value: unknown, label: string, min: number, max: number): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max || value.some(item => typeof item !== "string" || !item.trim() || item.length > 80)) throw new ApiError(`Check your ${label} and try again.`, 400);
  return [...new Set(value.map(item => (item as string).trim()))];
}
const unavailable = async <T>(message: string): Promise<T> => { throw new ApiError(message, 501); };
const queryString = (query: Record<string, string | number | undefined>) => Object.entries(query).filter(([, value]) => value !== undefined && value !== "").map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join("&");

export const api = {
  async sendOtp(phone: string, _role?: Role): Promise<{ expiresIn: number; resendAfter: number }> {
    const result = await request<{ expiresIn: number; resendAfter?: number; retryAfterSeconds?: number }>("POST", "/auth/otp/request", phonePayload(phone), { auth: false });
    return { expiresIn: result.expiresIn, resendAfter: result.resendAfter ?? result.retryAfterSeconds ?? 60 };
  },
  async verifyOtp(phone: string, code: string, _role?: Role, _signup?: boolean): Promise<Session> {
    if (!/^\d{6}$/.test(code)) throw new ApiError("Enter the 6-digit verification code.", 400);
    const response = await request<{ tokens: SessionTokens; user: unknown; isNewUser: boolean; requiresOnboarding: boolean }>("POST", "/auth/otp/verify", { ...phonePayload(phone), otp: code, client: "native" }, { auth: false });
    const data = record(response), tokens = data.tokens;
    if (!isSessionTokens(tokens)) throw new ApiError("Sign-in could not be completed. Request a new code and try again.", 502);
    return { ...accountFrom(data), tokens, isNew: response.isNewUser === true };
  },
  logout: (token?: string) => {
    identity = undefined;
    return request<void>("POST", "/auth/logout", undefined, token ? { auth: false, bearerToken: token, refresh: false } : undefined);
  },
  async me(fresh = false): Promise<Account> {
    const version = getSessionVersion();
    if (!fresh && pendingProfile?.version === version) return pendingProfile.promise;
    const promise = request("GET", "/auth/me").then(response => { ensureSession(version); return remember(accountFrom(response)); });
    pendingProfile = { version, promise };
    try { return await promise; } finally { if (pendingProfile?.promise === promise) pendingProfile = undefined; }
  },
  async saveProfile(profile: Record<string, unknown>, onProgress?: (done: number, total: number) => void): Promise<Account> {
    const version = getSessionVersion();
    if (typeof profile.name !== "string" || profile.name.trim().length < 2 || profile.name.trim().length > 100) throw new ApiError("Your name must be between 2 and 100 characters.", 400);
    if (profile.photos !== undefined && (!Array.isArray(profile.photos) || profile.photos.some(photo => typeof photo !== "string"))) throw new ApiError("Choose valid photos to continue.", 400);
    if (Array.isArray(profile.photos)) {
      const languages = boundedStrings(profile.langs ?? profile.languages ?? [], "languages", profile.preferredRole === "creator" ? 1 : 0, 8);
      const interests = boundedStrings(profile.interests ?? [], "interests", 0, 20);
      if (profile.adultConfirmed !== true) throw new ApiError("Confirm that you are 18 or older to continue.", 400);
      const email = typeof profile.email === "string" ? profile.email.trim() : "";
      if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new ApiError("Enter a valid email address.", 400);
      const sources = profile.photos as string[];
      const existingPhotos = sources.some(source => !source.startsWith("data:")) ? (await api.me()).user.photos ?? [] : [];
      ensureSession(version);
      const photoKeys = await uploadPhotos(sources, version, onProgress, existingPhotos);
      ensureSession(version);
      const response = await request("PATCH", "/auth/profile", {
        name: profile.name.trim(), onboarding: {
          ...(email ? { email } : {}), photoKeys, languages, interests,
          ...(typeof profile.category === "string" && profile.category ? { category: profile.category } : {}),
          ...(profile.preferredRole === "creator" || profile.preferredRole === "member" ? { preferredRole: profile.preferredRole } : {}), adultConfirmed: true,
        },
      });
      ensureSession(version);
      return remember(accountFrom(response));
    }
    if (profile.avatar !== undefined) decodePhoto(profile.avatar as string);
    if (profile.cover !== undefined && profile.cover !== null) decodePhoto(profile.cover as string);
    if (profile.city !== undefined && (typeof profile.city !== "string" || profile.city.length > 100)) throw new ApiError("Keep your location under 100 characters.", 400);
    if (profile.about !== undefined && (typeof profile.about !== "string" || profile.about.length > 500)) throw new ApiError("Keep your introduction under 500 characters.", 400);
    const media: { avatarKey?: string; coverKey?: string | null } = {};
    const total = Number(profile.avatar !== undefined) + Number(profile.cover !== undefined && profile.cover !== null);
    let done = 0;
    if (total) onProgress?.(done, total);
    if (profile.avatar !== undefined) { media.avatarKey = await uploadMedia(profile.avatar as string, "avatar", version); onProgress?.(++done, total); }
    if (profile.cover === null) media.coverKey = null;
    else if (profile.cover !== undefined) { media.coverKey = await uploadMedia(profile.cover as string, "cover", version); onProgress?.(++done, total); }
    ensureSession(version);
    await request("PATCH", "/profile", { name: profile.name.trim(), ...(typeof profile.city === "string" ? { city: profile.city.trim() } : {}), ...(typeof profile.about === "string" ? { bio: profile.about.trim() } : {}), ...media });
    ensureSession(version);
    // A /me read started before this mutation must not hide the saved media.
    pendingProfile = undefined;
    return api.me();
  },
  async myPosts() {
    const version = getSessionVersion(), id = await selfId();
    ensureSession(version);
    const response = await request("GET", `/users/${encodeURIComponent(id)}/posts`);
    ensureSession(version);
    return { posts: items(response).map(postFrom) };
  },
  async createPost(photo: string, caption: string) {
    const version = getSessionVersion();
    if (typeof caption !== "string" || caption.length > 2000) throw new ApiError("Keep your caption under 2,000 characters.", 400);
    decodePhoto(photo);
    const account = await api.me();
    ensureSession(version);
    if (!approvedHost(account)) throw new ApiError("Your creator profile must be approved before you can publish posts.", 403);
    const mediaKey = await uploadMedia(photo, "post", version);
    ensureSession(version);
    const response = await request("POST", "/posts", { caption: caption.trim(), kind: "photo", mediaKey });
    ensureSession(version);
    return postFrom(response);
  },
  async submitVerification(details: Record<string, unknown>): Promise<{ status: Verification }> {
    const displayName = typeof details.name === "string" ? details.name.trim() : "";
    const bio = typeof details.bio === "string" ? details.bio.trim() : "";
    if (displayName.length < 2 || bio.length < 20) throw new ApiError("Add your display name and an introduction of at least 20 characters to apply as a creator.", 400);
    const languages = boundedStrings(details.languages ?? details.langs, "languages", 1, 10);
    const application = await request<{ status: string }>("POST", "/hosts/application", { displayName, bio, languages });
    return { status: verificationOf(application.status) };
  },
  async setPresence(online: boolean, visible: boolean) {
    const data = privacyFrom(await request("PATCH", "/safety", { allowRequests: online, showActivity: online, discoverable: visible }));
    return { online: data.allowRequests && data.showActivity, visible: data.discoverable };
  },
  async presence() { const data = privacyFrom(await request("GET", "/safety")); return { online: data.allowRequests && data.showActivity, visible: data.discoverable }; },
  async profileSettings() { return profileSettingsFrom(await request("GET", "/account/settings")); },
  async saveProfileSettings(input: ProfileSettingsPatch) { return profileSettingsFrom(await request("PATCH", "/account/settings", input)); },
  async savePrivacy(input: Partial<Pick<PrivacySettings, "discoverable" | "showActivity">>) { return privacyFrom(await request("PATCH", "/safety", input)); },
  async blockedUsers(page = 1) { return blockedUsersFrom(await request("GET", `/users/blocked?page=${page}&limit=20`)); },
  setBlocked: (id: string, blocked: boolean) => request<void>(blocked ? "POST" : "DELETE", `/users/${encodeURIComponent(id)}/block`, blocked ? {} : undefined),
  async home(query: HomeQuery = {}) { return homeFrom(await request("GET", `/home?${queryString({ ...query, limit: 20 })}`)); },
  async matchHost(category?: string) { const result = record(await request("GET", `/home/match${category ? `?category=${encodeURIComponent(category)}` : ""}`)); return { host: hostFrom(result.host) }; },
  async notifications() { return notificationsFrom(await request("GET", "/notifications?limit=100")); },
  async readNotifications(ids: string[]) { await request("POST", "/notifications/read", { ids }); return api.notifications(); },
  async catalog() { const [gifts, packs] = await Promise.all([request("GET", "/gifts?limit=100"), request("GET", "/coins/packs")]); return catalogFrom(gifts, packs); },
  rtcConfig: () => request<RtcConfig>("GET", "/calls/ice-servers"),
  async stream(streamId: string) { return streamFrom(await request("GET", `/streams/${encodeURIComponent(streamId)}`)); },
  async streamMessages(streamId: string) { return items(await request("GET", `/streams/${encodeURIComponent(streamId)}/messages?limit=50`)).map(streamChatFrom).reverse(); },
  async startStream(input: { title: string; category: string; kind?: "video" | "audio" }) {
    const version = getSessionVersion();
    const stream = streamFrom(await request("POST", "/streams", input));
    try {
      ensureSession(version);
      await request("POST", `/streams/${encodeURIComponent(stream.id)}/join`);
      return await api.stream(stream.id);
    } catch (error) {
      if (getSessionVersion() === version) await api.endStream(stream.id).catch(() => {});
      throw error;
    }
  },
  async joinStream(streamId: string) {
    const version = getSessionVersion();
    try { await request("POST", `/streams/${encodeURIComponent(streamId)}/join`); ensureSession(version); return await api.stream(streamId); }
    catch (error) { if (getSessionVersion() === version) await api.leaveStream(streamId).catch(() => {}); throw error; }
  },
  leaveStream: (streamId: string) => request<void>("POST", `/streams/${encodeURIComponent(streamId)}/leave`),
  async endStream(streamId: string): Promise<void> {
    const version = getSessionVersion();
    try { await request<void>("PUT", `/streams/${encodeURIComponent(streamId)}/end`); }
    catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409) throw error;
      ensureSession(version);
      // A lost success response may leave the host retrying an already ended room.
      // Confirm ownership and terminal status; permission errors still propagate.
      const stream = await api.stream(streamId);
      if (stream.status === "ended" || stream.status === "terminated") {
        const userId = await selfId();
        ensureSession(version);
        if (stream.hostId === userId) return;
      }
      throw error;
    }
  },
  async sendStreamMessage(streamId: string, text: string) { return streamChatFrom(await request("POST", `/streams/${encodeURIComponent(streamId)}/messages`, { text })); },
  streamRequests: (streamId: string) => request<StreamRequests>("GET", `/streams/${encodeURIComponent(streamId)}/requests`),
  requestStreamCall: (streamId: string) => request<StreamRequests>("POST", `/streams/${encodeURIComponent(streamId)}/requests`, {}),
  updateStreamRequest: (streamId: string, id: string, action: "cancel" | "decline") => request<StreamCallRequest>("POST", `/streams/${encodeURIComponent(streamId)}/requests/${encodeURIComponent(id)}/${action}`, {}),
  acceptStreamRequest: (streamId: string, id: string) => request<StreamPrivateCall>("POST", `/streams/${encodeURIComponent(streamId)}/requests/${encodeURIComponent(id)}/accept`, {}),
  reactToStream: (streamId: string) => request<StreamReaction>("POST", `/streams/${encodeURIComponent(streamId)}/reactions`, {}),
  async hosts() { return { hosts: items(await request("GET", "/hosts?limit=100")).map(hostFrom) }; },
  async chats(page = 1) { const id = await selfId(); return chatsFrom(await request("GET", page === 1 ? "/chats" : `/chats?page=${page}`), id); },
  async readAllChats() {
    const data = record(await request("POST", "/chats/read-all", {}));
    if (!Number.isSafeInteger(data.updated) || Number(data.updated) < 0 || typeof data.readAt !== "string") throw new ApiError("The read status could not be confirmed. Refresh your conversations.", 502);
    return { updated: data.updated as number, readAt: data.readAt };
  },
  async thread(withId: string) { const id = await selfId(); return messagesFrom(await request("GET", `/chats/${encodeURIComponent(withId)}`), id); },
  async missedCalls() { const id = await selfId(); return missedFrom(await request("GET", "/calls?limit=100"), id); },
  async callHistory() { const id = await selfId(); return callsFrom(await request("GET", "/calls?limit=100"), id); },
  async transactions() { return transactionsFrom(await request("GET", "/wallet/transactions")); },
  async wallet(): Promise<Wallet> { return walletFrom(await request("GET", "/wallet")); },
  async startCall(to: string, voice: boolean) { const call = await request("POST", "/calls", { calleeId: to, kind: voice ? "audio" : "video" }); const callId = idOf(call); if (!callId) throw new ApiError("The call could not be started.", 502); return { callId }; },
  async acceptCall(callId: string) { const call = record(await request("POST", `/calls/${encodeURIComponent(callId)}/accept`)); return { peerId: idOf(call.callerId), voice: call.kind === "audio" }; },
  declineCall: (callId: string) => request<void>("POST", `/calls/${encodeURIComponent(callId)}/end`),
  endCall: (callId: string, _reason?: string) => request<void>("POST", `/calls/${encodeURIComponent(callId)}/end`),
  // Staff verification calls for host applicants: staff place the call and send the offer.
  acceptVerificationCall: (callId: string) => request<void>("POST", `/verification-calls/${encodeURIComponent(callId)}/accept`),
  endVerificationCall: (callId: string) => request<void>("POST", `/verification-calls/${encodeURIComponent(callId)}/end`),
  verificationSignal: (callId: string, signal: RtcPayload) => request<void>("POST", `/verification-calls/${encodeURIComponent(callId)}/signal`, signal),
  async sendGift(to: string, gift: string, _coins: number, _callId?: string, streamId?: string, idempotencyKey?: string): Promise<Wallet> {
    if (!/^[a-f\d]{24}$/i.test(gift) || !idempotencyKey || !/^[a-zA-Z0-9_-]{8,100}$/.test(idempotencyKey)) throw new ApiError("Choose a gift from the current server catalog. No coins were spent.", 400);
    await request("POST", "/gifts/send", { recipientId: to, giftId: gift, quantity: 1, ...(streamId ? { streamId } : {}), idempotencyKey });
    return api.wallet();
  },
  sendMessage: (to: string, text: string, callId?: string) => request<void>("POST", `/chats/${encodeURIComponent(to)}`, { text, ...(callId ? { callId } : {}) }),
  follow: (id: string, on: boolean) => request<void>("POST", `/users/${encodeURIComponent(id)}/follow`, { following: on }),
  async checkout(packId: string, idempotencyKey: string) { return purchaseFrom(await request("POST", "/coins/purchase", { packId, idempotencyKey })); },
  async verifyPurchase(merchantOrderId: string) { return purchaseFrom(await request("POST", "/coins/purchase/verify", { merchantOrderId })); },
  async themes() { return themesFrom(await request("GET", "/themes")); },
  async selectTheme(themeId: string) { return themesFrom(await request("PATCH", "/themes/preference", { themeId })); },
  async checkoutPremium(idempotencyKey: string) { return purchaseFrom(await request("POST", "/themes/premium/purchase", { idempotencyKey })); },
  async verifyPremium(merchantOrderId: string) { return purchaseFrom(await request("POST", "/themes/premium/verify", { merchantOrderId })); },
  requestPayout: (_coins: number, _upi: string) => unavailable<Wallet>("Withdrawals require the earnings balance in your account currency. This withdrawal screen is not available yet."),
  async claimAward(task: string): Promise<Wallet> { await request("POST", `/missions/${encodeURIComponent(task)}/claim`); return api.wallet(); },
};
