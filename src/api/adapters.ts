import { ApiError } from "./client";
import type { Account, AdCreative, AdFeed, AdPlacement, AppTheme, BlockedUsers, Gender, CallRecord, Catalog, ChatsData, HomeData, HomeStream, Host, Message, Mission, MissedCall, NotificationsData, NotificationReadResult, PaymentRoutes, Payout, Payouts, PrivacySettings, ProfileSettings, PublicProfile, PublicPosts, Purchase, StreamChat, ThemeCatalog, Transaction, UserPost, Verification, Wallet } from "./types";

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
export const genderOf = (value: unknown): { gender?: Gender } =>
  value === "female" || value === "male" || value === "undisclosed" ? { gender: value } : {};
export function accountFrom(value: unknown): Account {
  const data = record(value), user = record(data.user), id = idOf(user);
  if (!id) throw new ApiError("Your account could not be loaded. Please try signing in again.", 502);
  const photos = Array.isArray(user.photos) ? user.photos.map(record).map(photo => ({ key: string(photo.key), url: string(photo.url) })).filter(photo => photo.key && photo.url) : [];
  return {
    user: {
      id, name: string(user.name), role: user.role === "host" && user.hostStatus === "approved" && user.isVerifiedHost === true ? "host" : "sender",
      ...(user.role === "user" || user.role === "host" || user.role === "admin" ? { serverRole: user.role } : {}),
      city: string(user.city), about: string(user.bio), email: string(user.email), avatarUrl: string(user.avatarUrl), avatarKey: string(user.avatarKey), coverUrl: string(user.coverUrl), coverKey: string(user.coverKey), photos,
      languages: stringList(user.languages), interests: stringList(user.interests), category: string(user.category), ...genderOf(user.gender), adultConfirmed: user.adultConfirmed === true,
      ...(user.onboardingPreference === "creator" || user.onboardingPreference === "member" ? { onboardingPreference: user.onboardingPreference } : {}),
      hostStatus: string(user.hostStatus),
      isVerifiedHost: user.isVerifiedHost === true,
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
    languages: stringList(host.languages), ratePerMin: finite(host.callRateCoinsPerMinute ?? host.ratePerMin), entryFee: finite(host.entryFee), followers: finite(host.followers),
    about: string(host.bio), verified: host.isVerifiedHost === true, ...genderOf(host.gender),
    ...(typeof host.role === "string" ? { role: host.role === "host" && host.hostStatus === "approved" && host.isVerifiedHost === true ? "host" as const : "sender" as const } : {}),
    ...(host.role === "user" || host.role === "host" || host.role === "admin" ? { serverRole: host.role } : {}),
    ...(typeof (host.isOnline ?? host.online) === "boolean" ? { online: (host.isOnline ?? host.online) as boolean } : {}), ...(typeof host.live === "boolean" ? { live: host.live } : {}),
    ...(typeof host.availableForCall === "boolean" ? { availableForCall: host.availableForCall } : {}),
    ...(host.stream && typeof host.stream === "object" ? { stream: streamFrom(host.stream, idOf(host)), live: true } : host.stream === null ? { stream: null, live: false } : {}),
    ...(typeof host.isFollowing === "boolean" ? { following: host.isFollowing } : {}),
  };
}

const count = (value: unknown) => Math.max(0, Math.floor(finite(value) ?? 0));
export function publicProfileFrom(value: unknown): PublicProfile {
  const profile = record(value);
  if (!idOf(profile) || typeof profile.name !== "string" ||
    [profile.followers, profile.following].some(value => typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) ||
    typeof profile.isFollowing !== "boolean") throw new ApiError("This profile could not be loaded. Try again.", 502);
  // This route exposes phone verification and admin approval separately.
  const verified = profile.role === "host" && profile.hostStatus === "approved" &&
    (typeof profile.isVerifiedHost === "boolean" ? profile.isVerifiedHost : profile.isPhoneVerified === true);
  return {
    ...hostFrom({ ...profile, isVerifiedHost: verified }),
    followingCount: profile.following as number,
    joined: string(profile.createdAt),
    interests: stringList(profile.interests),
    ...(typeof profile.level === "number" && Number.isSafeInteger(profile.level) && profile.level >= 0 ? { level: profile.level } : {}),
    ...(typeof profile.crown === "boolean" ? { crown: profile.crown } : {}),
  };
}
export function publicPostsFrom(value: unknown): PublicPosts {
  const data = record(value);
  if ([data.total, data.page, data.limit].some(value => typeof value !== "number" || !Number.isSafeInteger(value)) ||
    Number(data.total) < 0 || Number(data.page) < 1 || Number(data.limit) < 1) throw new ApiError("These posts could not be loaded. Try again.", 502);
  return { posts: items(data).map(postFrom), total: data.total as number, page: data.page as number, limit: data.limit as number };
}
export function streamFrom(value: unknown, fallbackHost = ""): HomeStream {
  const stream = record(value), hostId = idOf(stream.hostId) || fallbackHost;
  return { id: idOf(stream), hostId, ...(stream.host && typeof stream.host === "object" ? { host: hostFrom(stream.host) } : stream.hostId && typeof stream.hostId === "object" ? { host: hostFrom(stream.hostId) } : {}),
    title: string(stream.title), category: string(stream.category), kind: stream.kind === "audio" ? "audio" : "video",
    viewers: count(stream.viewers), createdAt: string(stream.createdAt), status: string(stream.status) || "live" };
}
export function missionFrom(value: unknown): Mission {
  const mission = record(value);
  return { id: idOf(mission), title: string(mission.title), description: string(mission.description), metric: string(mission.metric),
    target: count(mission.target), progress: count(mission.progress), rewardCoins: count(mission.rewardCoins), claimed: mission.claimed === true, endsAt: string(mission.endsAt) };
}
export function homeFrom(value: unknown): HomeData {
  const data = record(value);
  return { hosts: items(data).map(hostFrom), stage: Array.isArray(data.stage) ? data.stage.map(hostFrom) : [],
    featured: data.featured ? hostFrom(data.featured) : null, total: count(data.total), page: count(data.page) || 1, limit: count(data.limit),
    categories: stringList(data.categories), broadcasterCount: count(data.broadcasterCount), availableCount: count(data.availableCount),
    speedMatchEnabled: data.speedMatchEnabled === true, bonus: data.bonus ? missionFrom(data.bonus) : null, unreadCount: count(data.unreadNotifications) };
}
export function notificationsFrom(value: unknown): NotificationsData {
  const data = record(value), list = items(data).map(record).map(note => ({ id: idOf(note), title: string(note.title), body: string(note.body), read: note.read === true, createdAt: string(note.createdAt), audience: idOf(note.userId) ? "personal" as const : "announcements" as const }));
  return { items: list, unreadCount: typeof data.unreadCount === "number" ? count(data.unreadCount) : list.filter(note => !note.read).length,
    total: typeof data.total === "number" ? count(data.total) : list.length, totalCount: typeof data.totalCount === "number" ? count(data.totalCount) : typeof data.total === "number" ? count(data.total) : list.length,
    page: count(data.page) || 1, limit: count(data.limit) || 100 };
}
export function notificationReadFrom(value: unknown): NotificationReadResult {
  const data = record(value);
  if ([data.count, data.unreadCount, data.totalCount].some(value => !Number.isSafeInteger(value) || Number(value) < 0) || Number(data.unreadCount) > Number(data.totalCount)) throw new ApiError("Your notification status could not be confirmed. Refresh and try again.", 502);
  return { count: data.count as number, unreadCount: data.unreadCount as number, totalCount: data.totalCount as number };
}
export function privacyFrom(value: unknown): PrivacySettings {
  const data = record(value);
  if (["discoverable", "showActivity", "allowRequests"].some(key => typeof data[key] !== "boolean")) throw new ApiError("Your privacy settings could not be loaded. Try again.", 502);
  return { discoverable: data.discoverable as boolean, showActivity: data.showActivity as boolean, allowRequests: data.allowRequests as boolean };
}
export function profileSettingsFrom(value: unknown): ProfileSettings {
  const data = record(value), profile = record(data.profile), stats = record(data.stats), preferences = record(data.preferences), capabilities = record(data.capabilities);
  const statKeys = ["fans", "following", "giftsSent", "giftsReceived", "coinsSent", "coinsReceived"] as const;
  if (!idOf(profile) || statKeys.some(key => !Number.isSafeInteger(stats[key]) || Number(stats[key]) < 0) ||
    typeof preferences.pushNotifications !== "boolean" || (preferences.matchCategory !== null && typeof preferences.matchCategory !== "string") ||
    !["dark", "light", "system"].includes(String(preferences.appearance))) throw new ApiError("Your account settings could not be loaded. Try again.", 502);
  return {
    profile: { id: idOf(profile), name: string(profile.name), bio: string(profile.bio), city: string(profile.city), languages: stringList(profile.languages), maskedPhone: string(profile.maskedPhone), countryCode: string(profile.countryCode), isPhoneVerified: profile.isPhoneVerified === true, createdAt: string(profile.createdAt) },
    stats: { fans: stats.fans as number, following: stats.following as number, giftsSent: stats.giftsSent as number, giftsReceived: stats.giftsReceived as number, coinsSent: stats.coinsSent as number, coinsReceived: stats.coinsReceived as number },
    standing: { level: count(record(data.standing ?? {}).level), crown: record(data.standing ?? {}).crown === true },
    preferences: { pushNotifications: preferences.pushNotifications, matchCategory: preferences.matchCategory as string | null, appearance: preferences.appearance as ProfileSettings["preferences"]["appearance"] },
    privacy: privacyFrom(data.privacy), categories: stringList(data.categories),
    // This native build does not register OS push tokens yet. Backend worker
    // availability alone must not be presented as notifications on this device.
    capabilities: { pushNotifications: capabilities.pushNotifications === true, nativePushRegistered: false, liveAlerts: capabilities.liveAlerts === true, interfaceLanguages: stringList(capabilities.interfaceLanguages), currency: string(capabilities.currency) },
  };
}
export function blockedUsersFrom(value: unknown): BlockedUsers {
  const data = record(value);
  const users = items(data).map(record).filter(block => block.blockedId && idOf(block.blockedId)).map(block => hostFrom(block.blockedId));
  if (!Number.isSafeInteger(data.total) || Number(data.total) < 0) throw new ApiError("Your blocked accounts could not be loaded. Try again.", 502);
  return { users, total: data.total as number, page: count(data.page) || 1, limit: count(data.limit) || 20 };
}
export function streamChatFrom(value: unknown): StreamChat {
  const message = record(value), user = message.userId && typeof message.userId === "object" ? record(message.userId) : {};
  return { id: idOf(message), streamId: idOf(message.streamId), userId: idOf(message.userId), name: string(user.name), text: string(message.text), createdAt: string(message.createdAt) };
}
export function catalogFrom(giftData: unknown, packData: unknown): Catalog {
  return { gifts: items(giftData).map(record).map(gift => ({ id: idOf(gift), name: string(gift.name), emoji: string(gift.emoji), coins: count(gift.coins), mediaUrl: gift.media && typeof gift.media === "object" ? string(record(gift.media).url) : "" })),
    packs: items(packData).map(record).map(pack => ({ id: idOf(pack), name: string(pack.name), coins: count(pack.coins), pricePaise: count(pack.pricePaise) })), paymentsAvailable: record(packData).paymentsAvailable === true };
}
export const validPaymentRoute = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
export function paymentRoutesFrom(value: unknown): PaymentRoutes {
  const data = record(value);
  if (!["SINGLE", "ROTATION"].includes(String(data.mode)) || typeof data.routeChoice !== "boolean" || !Array.isArray(data.routes) || data.routes.length > 100)
    throw new ApiError("Payment methods could not be loaded. Automatic checkout is still available.", 502);
  const routes = data.routes.map(value => {
    const route = record(value);
    if (!validPaymentRoute(route.route) || !validPaymentRoute(route.pageStyle) || typeof route.upiIntent !== "boolean" || typeof route.takingPayments !== "boolean" || typeof route.currency !== "string" || !/^[A-Z]{3}$/.test(route.currency))
      throw new ApiError("Payment methods could not be loaded. Automatic checkout is still available.", 502);
    return { route: route.route, pageStyle: route.pageStyle, upiIntent: route.upiIntent, takingPayments: route.takingPayments, currency: route.currency };
  });
  if (new Set(routes.map(route => route.route)).size !== routes.length) throw new ApiError("Payment methods could not be loaded.", 502);
  return { mode: data.mode as PaymentRoutes["mode"], routeChoice: data.routeChoice, routes: routes.filter(route => route.takingPayments && route.currency === "INR").map(route => ({ ...route, currency: "INR" as const })) };
}
export function purchaseFrom(value: unknown): Purchase {
  const data = record(value), paymentUrl = string(data.paymentUrl);
  if (paymentUrl) {
    let safe = false;
    try { const url = new URL(paymentUrl); safe = url.protocol === "https:" && !url.username && !url.password && /^https:\/\/[^\s"'<>]+$/.test(paymentUrl); } catch { /* reject malformed URLs */ }
    if (!safe) throw new ApiError("Checkout did not return a secure payment address.", 502);
  }
  if (data.currency != null && data.currency !== "INR") throw new ApiError("Checkout returned an unexpected currency.", 502);
  for (const key of ["requestedRoute", "route", "pageStyle"]) {
    if (data[key] != null && !validPaymentRoute(data[key])) throw new ApiError("Checkout returned an invalid payment method.", 502);
  }
  const status = string(data.status);
  return { purchaseId: idOf(data), merchantOrderId: string(data.merchantOrderId), status: status === "paid" ? "SUCCESS" : status === "failed" ? "FAILED" : status === "reverted" ? "REVERTED" : "PENDING", ...(paymentUrl ? { paymentUrl } : {}), ...(data.kind === "premium" || data.kind === "coins" ? { kind: data.kind } : {}),
    ...(idOf(data.packId) ? { packId: idOf(data.packId) } : {}), ...(typeof data.idempotencyKey === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(data.idempotencyKey) ? { idempotencyKey: data.idempotencyKey } : {}),
    ...Object.fromEntries(["requestedRoute", "route", "pageStyle"].filter(key => validPaymentRoute(data[key])).map(key => [key, data[key]])), ...(data.currency === "INR" ? { currency: "INR" as const } : {}),
    ...Object.fromEntries(["coins", "amountPaise", "payableAmountPaise"].filter(key => typeof data[key] === "number" && Number.isSafeInteger(data[key]) && Number(data[key]) >= 0).map(key => [key, data[key]])),
    ...(typeof data.expiresAt === "string" && Number.isFinite(Date.parse(data.expiresAt)) ? { expiresAt: data.expiresAt } : {}) };
}
export function themeFrom(value: unknown): AppTheme {
  const data = record(value), colors = record(data.colors), typography = record(data.typography);
  const colorKeys = ["background", "surface", "surfaceElevated", "text", "textMuted", "primary", "primaryContrast", "secondary", "border", "success", "danger"] as const;
  if (!/^[a-f\d]{24}$/i.test(idOf(data)) || !string(data.name) || !["light", "dark"].includes(String(data.mode)) ||
    colorKeys.some(key => typeof colors[key] !== "string" || !/^#[a-f\d]{6}$/i.test(colors[key] as string)) ||
    !["system", "rounded", "serif", "mono"].includes(String(typography.fontFamily)) ||
    typeof typography.fontScale !== "number" || !Number.isFinite(typography.fontScale) || typography.fontScale < 0.9 || typography.fontScale > 1.15 ||
    !["400", "500", "600"].includes(String(typography.fontWeight)) || !["600", "700", "800"].includes(String(typography.headingWeight))) {
    throw new ApiError("A theme could not be loaded. Refresh your themes and try again.", 502);
  }
  return { id: idOf(data), slug: string(data.slug), name: string(data.name), description: string(data.description), isPremium: data.isPremium === true,
    active: data.active === true, isDefault: data.isDefault === true, sortOrder: finite(data.sortOrder) ?? 0, mode: data.mode as AppTheme["mode"],
    colors: Object.fromEntries(colorKeys.map(key => [key, colors[key]])) as AppTheme["colors"],
    typography: { fontFamily: typography.fontFamily as AppTheme["typography"]["fontFamily"], fontScale: typography.fontScale,
      fontWeight: String(typography.fontWeight) as AppTheme["typography"]["fontWeight"], headingWeight: String(typography.headingWeight) as AppTheme["typography"]["headingWeight"] } };
}
export function themesFrom(value: unknown): ThemeCatalog {
  const data = record(value), premium = record(data.premium), themes = items(data).map(themeFrom), selectedThemeId = string(data.selectedThemeId);
  const selected = themes.find(theme => theme.id === selectedThemeId);
  if (typeof premium.active !== "boolean" || !Number.isSafeInteger(premium.pricePaise) || Number(premium.pricePaise) < 0 ||
    premium.currency !== "INR" || premium.purchaseType !== "lifetime" || !selected?.active || (selected.isPremium && !premium.active)) {
    throw new ApiError("Your themes could not be confirmed. Refresh and try again.", 502);
  }
  return { items: themes, selectedThemeId, premium: { active: premium.active, pricePaise: premium.pricePaise as number,
    currency: "INR", paymentsAvailable: premium.paymentsAvailable === true, purchaseType: "lifetime" } };
}
export function timeOf(value: unknown): string {
  const date = new Date(string(value));
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
export function chatsFrom(value: unknown, userId: string): ChatsData {
  const data = record(value);
  const chats = items(data).map(record).map(chat => {
    const peer = (Array.isArray(chat.participants) ? chat.participants : []).find(person => idOf(person) !== userId);
    const last = chat.lastMessage && typeof chat.lastMessage === "object" ? record(chat.lastMessage) : {};
    if (!peer || !idOf(peer)) throw new ApiError("A conversation could not be loaded. Try again.", 502);
    const lastAt = string(chat.lastMessageAt) || string(last.createdAt);
    return { id: idOf(chat), user: hostFrom(peer), last: string(last.text), time: timeOf(lastAt), unread: count(chat.unread),
      ...(typeof chat.canSend === "boolean" ? { canSend: chat.canSend } : {}), automatedOnly: chat.automatedOnly === true,
      ...(typeof chat.sendDisabledReason === "string" ? { sendDisabledReason: chat.sendDisabledReason } : {}),
      lastKind: last.kind === "voice" ? "voice" as const : last.kind === "image" ? "image" as const : "text" as const, ...(last.deleted === true ? { lastDeleted: true } : {}), lastMine: typeof last.mine === "boolean" ? last.mine : idOf(last.senderId) === userId,
      lastAutomated: last.automated === true,
      lastAt, lastStatus: last.status === "read" || Boolean(last.readAt) ? "read" as const : "sent" as const, hasCalls: chat.hasCalls === true };
  });
  return { chats, total: typeof data.total === "number" ? count(data.total) : chats.length, page: count(data.page) || 1, limit: count(data.limit) || 20,
    unreadCount: typeof data.unreadCount === "number" ? count(data.unreadCount) : chats.reduce((sum, chat) => sum + chat.unread, 0),
    unreadConversations: typeof data.unreadConversations === "number" ? count(data.unreadConversations) : chats.filter(chat => chat.unread > 0).length };
}
/** One chat message as the screens show it, including its edit, delete and reply state. */
export function messageFrom(value: unknown, userId: string): Message {
  const message = record(value);
  const mine = idOf(message.senderId) === userId;
  const imageUrl = message.image && typeof message.image === "object" ? string(record(message.image).url) : "";
  const audio = message.audio && typeof message.audio === "object" ? record(message.audio) : undefined;
  const audioUrl = string(audio?.url), durationMs = finite(audio?.durationMs);
  const reply = message.reply && typeof message.reply === "object" ? record(message.reply) : undefined;
  return { id: idOf(message), mine, text: string(message.text), time: timeOf(message.createdAt), createdAt: string(message.createdAt),
    ...(audioUrl ? { kind: "voice" as const, audioUrl, ...(durationMs !== undefined ? { durationMs } : {}) } : imageUrl ? { kind: "image" as const, imageUrl } : { kind: "text" as const }), automated: message.automated === true,
    ...(message.editedAt ? { edited: true } : {}), ...(message.deletedAt ? { deleted: true } : {}),
    ...(reply ? { reply: { id: idOf(reply), mine: idOf(reply.senderId) === userId, text: string(reply.text), image: reply.image === true, ...(reply.voice === true ? { voice: true } : {}), deleted: reply.deleted === true } } : {}),
    ...(mine ? { status: message.readAt ? "read" as const : "sent" as const } : {}) };
}
export function messagesFrom(value: unknown, userId: string): { messages: Message[]; readAt?: string; canSend?: boolean; sendDisabledReason?: string } {
  const data = record(value);
  return { ...(typeof data.canSend === "boolean" ? { canSend: data.canSend } : {}),
    ...(typeof data.sendDisabledReason === "string" ? { sendDisabledReason: data.sendDisabledReason } : {}),
    messages: items(data).map(record).reverse().map(message => messageFrom(message, userId)),
    ...(typeof data.readAt === "string" ? { readAt: data.readAt } : {}) };
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
  return {
    coins: wallet.coins as number, earningsPaise: wallet.earningsPaise as number,
    reservedPaise: finite(wallet.reservedPaise),
    minimumWithdrawalPaise: Number.isSafeInteger(wallet.minimumWithdrawalPaise) && Number(wallet.minimumWithdrawalPaise) > 0 ? Number(wallet.minimumWithdrawalPaise) : undefined,
    withdrawalsEnabled: wallet.withdrawalsEnabled === true,
  };
}
export function payoutFrom(value: unknown): Payout {
  const payout = record(value), id = idOf(payout);
  if (!id || !Number.isSafeInteger(payout.amountPaise) || Number(payout.amountPaise) <= 0 || Number(payout.amountPaise) > 100000000 ||
    typeof payout.payoutAddress !== "string" || payout.payoutAddress.trim().length < 3 || payout.payoutAddress.length > 200 ||
    !["pending", "approved", "paid", "rejected"].includes(String(payout.status)) || typeof payout.createdAt !== "string" || !Number.isFinite(Date.parse(payout.createdAt))) {
    throw new ApiError("Your withdrawal could not be confirmed. Check its status and try again.", 502);
  }
  return { id, amountPaise: Number(payout.amountPaise), payoutAddress: payout.payoutAddress, status: payout.status as Payout["status"], createdAt: payout.createdAt,
    ...(typeof payout.idempotencyKey === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(payout.idempotencyKey) ? { idempotencyKey: payout.idempotencyKey } : {}),
    ...(typeof payout.reason === "string" ? { reason: payout.reason } : {}), ...(typeof payout.payoutReference === "string" ? { payoutReference: payout.payoutReference } : {}) };
}
export function payoutsFrom(value: unknown): Payouts {
  const data = record(value);
  if (!Number.isSafeInteger(data.total) || Number(data.total) < 0 || !Number.isSafeInteger(data.page) || Number(data.page) < 1 ||
    !Number.isSafeInteger(data.limit) || Number(data.limit) < 1 || Number(data.limit) > 100) throw new ApiError("Your withdrawal history could not be loaded. Try again.", 502);
  return { items: items(value).map(payoutFrom), total: Number(data.total), page: Number(data.page), limit: Number(data.limit) };
}
export const coinCount = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
/** Coins per minute locked onto a paid call; free calls carry none. */
export const callPrice = (call: Record<string, unknown>) => coinCount(call.coinsPerMinute) ? { rate: coinCount(call.coinsPerMinute) } : {};
export function transactionsFrom(value: unknown): { items: Transaction[] } {
  return { items: items(value).map(record).map(tx => {
    const type = string(tx.type), coins = finite(tx.coins) ?? 0, amountPaise = finite(tx.amountPaise);
    // The ledger stores purchase charges as positive and reversals as negative.
    // Monetary-only purchases display the account holder's spending/refund sign.
    const monetaryPurchase = coins === 0 && amountPaise !== undefined && Number.isSafeInteger(amountPaise) && amountPaise !== 0 && ["purchase", "purchase_reversal"].includes(type);
    return {
      title: string(tx.description) || type.replace(/_/g, " "), time: timeOf(tx.createdAt), coins, amountPaise,
      ...(monetaryPurchase ? { displayAmountPaise: type === "purchase" ? -Math.abs(amountPaise) : Math.abs(amountPaise) } : {}),
      kind: type.startsWith("call") ? "call" : type.startsWith("gift") ? "gift" : type.startsWith("purchase") ? "topup" : type.startsWith("withdrawal") ? "withdrawal" : "reward",
    };
  }) };
}

export const AD_PLACEMENTS: readonly AdPlacement[] = ["home", "explore", "chats", "call_summary"];
export const isAdPlacement = (value: unknown): value is AdPlacement => AD_PLACEMENTS.includes(value as AdPlacement);
/** Campaign media is shown in the app and its link opens outside it: plain public HTTPS only. */
export function safeHttps(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048 || !/^https:\/\/[^\s"'<>\\]+$/.test(value)) return "";
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? value : ""; } catch { return ""; }
}
const adText = (value: unknown, max: number) => string(value).trim().slice(0, max);
function adFrom(value: unknown): AdCreative | null {
  const ad = record(value), id = idOf(ad), media = ad.media && typeof ad.media === "object" ? record(ad.media) : {};
  const format = ad.format === "video" || ad.format === "banner" ? ad.format : null;
  const mediaUrl = safeHttps(media.url), mediaType = string(media.contentType), placements = stringList(ad.placements).filter(isAdPlacement);
  const headline = adText(ad.headline, 60), advertiser = adText(ad.advertiser, 40), ctaLabel = adText(ad.ctaLabel, 20);
  if (!/^[a-f\d]{24}$/i.test(id) || !format || !mediaUrl || !headline || !advertiser || !ctaLabel || !placements.length ||
    (format === "video" ? mediaType !== "video/mp4" : !/^image\/(jpeg|png|webp|gif)$/.test(mediaType))) return null;
  return { id, format, advertiser, headline, body: adText(ad.body, 140), ctaLabel, domain: adText(ad.domain, 253), mediaUrl, mediaType, logoUrl: safeHttps(ad.logoUrl), placements: [...new Set(placements)] };
}
/** A malformed campaign is dropped; the rest of the feed still shows. */
export function adFeedFrom(value: unknown): AdFeed {
  const data = record(value);
  if (typeof data.adFree !== "boolean" || !Array.isArray(data.items)) throw new ApiError("Sponsored content could not be loaded.", 502);
  if (data.adFree) return { adFree: true, items: [] };
  const seen = new Set<string>();
  return { adFree: false, items: data.items.flatMap(item => {
    try { const ad = adFrom(item); if (!ad || seen.has(ad.id)) return []; seen.add(ad.id); return [ad]; } catch { return []; }
  }) };
}
export function adLinkFrom(value: unknown): string {
  const url = safeHttps(record(value).url);
  if (!url) throw new ApiError("This promotion did not return a secure link.", 502);
  return url;
}
