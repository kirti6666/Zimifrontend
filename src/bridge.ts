import type { RefObject } from "react";
import type WebView from "react-native-webview";
import { AppState, Linking, Share } from "react-native";

import { ApiError, checkConnection, errorMessage, getConnectionStatus, onConnectionChanged } from "./api/client";
import { api } from "./api/endpoints";
import { messageFrom } from "./api/adapters";
import type { LeaderboardPeriod, RelationshipKind, Relationships } from "./api/types";
import { VERIFY_PEER, connectRealtime, type RealtimeConnection } from "./api/realtime";
import type { Account, AdFeed, AdPlacement, AppTheme, BlockedUsers, Catalog, ChatsData, Gender, HomeData, HomeQuery, HomeStream, Host, Message, NotificationsQuery, NotificationReadPatch, NotificationReadResult, PaymentRoutes, Payout, Payouts, PrivacySettings, ProfileSettings, ProfileSettingsPatch, PublicProfile, PublicPosts, Purchase, Role, ServerRole, RtcConfig, RtcPayload, StreamChat, StreamCallRequest, StreamPrivateCall, StreamReaction, StreamRequests, ThemeCatalog, UserPost, Verification, Wallet, PostComment, PostComments } from "./api/types";
import { clearToken, getCachedToken, getToken, getSessionVersion, onSessionExpired, setSessionTokens } from "./session";
import { forgetAccountTheme, rememberAccountTheme, rememberDefaultTheme } from "./theme-cache";
import { forgetPendingPayment, readPendingPayments, rememberPendingPayment, type PendingPayment } from "./payment-cache";
import { forgetPendingPayout, readPendingPayout, rememberPendingPayout, type PendingPayout } from "./payout-cache";
import { parseLiveLink, parseWebMessage } from "./web-message";
import { downloadChatPhoto } from "./chat-photo-download";
import { approvedHost } from "./host-access";
import { LIVE_STREAMING_ENABLED } from "./features";
import { beginUpdateActivity } from "./app-update-activity";
import type { OfficialChatData, OfficialReadPatch } from "./api/types";
import { clearDeliveredPush, onPushTokenChange, registerPush, startPush, type PushMode, type PushStatus } from "./push";
import { notificationTargetFrom, type NotificationTarget } from "./notification-target";
import { notifyAppUpdate } from "./app-update-events";

/* The screens (web/, shown in the WebView) and the app talk in small JSON
   messages: { type, data }. The screens never call the server themselves;
   they report what the user did (WebMessage) and the app answers with what
   the server said (AppMessage). The matching code is web/bridge.js and the
   Native.send / Native.on calls in web/aurora-runtime.js. */

/* Screens -> app. */
export type WebMessage =
  | { type: "ready"; data: { demo: boolean } }
  | { type: "app.exit.request"; data: Record<string, never> }
  | { type: "app.launched"; data: Record<string, never> }
  | { type: "session.resume"; data: Record<string, never> }
  | { type: "data.reload"; data: Record<string, never> }
  | { type: "push.enable"; data: Record<string, never> }
  | { type: "connection.check"; data: Record<string, never> }
  | { type: "home.reload"; data: HomeQuery }
  | { type: "hosts.search"; data: { q: string; page?: number } }
  | { type: "catalog.load" | "rtc.config"; data: Record<string, never> }
  | { type: "notifications.load"; data: NotificationsQuery & { requestId?: number } }
  | { type: "notifications.read"; data: { ids: string[]; requestId?: number } }
  | { type: "notifications.unread"; data: { ids: string[]; requestId: number } }
  | { type: "notifications.readAll"; data: { requestId: number } }
  | { type: "notifications.open"; data: NotificationTarget }
  | { type: "official.load"; data: { page?: number; requestId: number } }
  | { type: "official.read"; data: OfficialReadPatch & { requestId: number } }
  | { type: "call.match"; data: { category?: string } }
  | { type: "rtc.signal"; data: RtcPayload & { callId: string } }
  | { type: "stream.signal"; data: RtcPayload & { streamId: string; to: string } }
  | { type: "stream.start"; data: { title: string; category: string; kind?: "video" | "audio" } }
  | { type: "stream.join" | "stream.leave" | "stream.end" | "stream.ready" | "stream.share"; data: { streamId: string } }
  | { type: "stream.message"; data: { streamId: string; text: string } }
  | { type: "stream.requests.load" | "stream.request" | "stream.react"; data: { streamId: string } }
  | { type: "stream.request.cancel" | "stream.request.decline" | "stream.request.accept"; data: { streamId: string; id: string } }
  | { type: "wallet.checkout"; data: { packId: string; idempotencyKey: string; route?: string } }
  | { type: "payments.routes.load"; data: { requestId: number } }
  | { type: "wallet.load"; data: Record<string, never> }
  | { type: "transactions.load"; data: Record<string, never> }
  | { type: "leaderboard.load"; data: { period: LeaderboardPeriod } }
  | { type: "referral.load"; data: Record<string, never> }
  | { type: "referral.apply"; data: { code: string; requestId: number } }
  | { type: "referral.share"; data: Record<string, never> }
  | { type: "wallet.verify"; data: { merchantOrderId: string } }
  | { type: "payments.checkout.closed"; data: { kind: "coins" | "premium"; merchantOrderId?: string; idempotencyKey?: string } }
  | { type: "themes.load"; data: Record<string, never> }
  | { type: "themes.select"; data: { themeId: string; requestId?: number } }
  | { type: "themes.premium.checkout"; data: { idempotencyKey: string; route?: string } }
  | { type: "themes.premium.verify"; data: { merchantOrderId: string } }
  | { type: "theme"; data: { theme: "light" | "dark"; canvas?: string; ink?: string; primary?: string; contrast?: string; surface?: string; raised?: string } }
  | { type: "ui.haptic"; data: { kind: "selection" | "success" | "error" | "light" } }
  | { type: "screen.secure"; data: { on: boolean } }
  | { type: "auth.sendOtp"; data: { phone: string; dialCode?: string; role: Role; requestId?: number } }
  | { type: "auth.verifyOtp"; data: { phone: string; dialCode?: string; code: string; role: Role; signup: boolean; requestId?: number } }
  | { type: "auth.google"; data: { role: Role; signup: boolean } }
  | { type: "auth.emailCheck"; data: { email: string; requestId: number } }
  | { type: "auth.logout"; data: Record<string, never> }
  | { type: "account.deactivate"; data: { confirmed: true; requestId: number } }
  | { type: "creator.card.save"; data: { photo: string; requestId: number } }
  | { type: "profile.cover.save"; data: { photo: string; requestId: number } }
  | { type: "profile.save"; data: Record<string, unknown> }
  | { type: "media.post.create"; data: { photo: string; caption: string; requestId?: number } }
  | { type: "media.post.delete"; data: { id: string; requestId: number } }
  | { type: "post.like"; data: { id: string; liked: boolean; requestId?: number } }
  | { type: "post.comments.load"; data: { id: string; page?: number; requestId?: number } }
  | { type: "post.comment.add"; data: { id: string; text: string; requestId: number } }
  | { type: "post.comment.delete"; data: { id: string; commentId: string; requestId: number } }
  | { type: "verification.submit"; data: Record<string, unknown> }
  | { type: "agency.load"; data: { requestId: number } }
  | { type: "agency.verify" | "agency.join"; data: { agencyCode: string; requestId: number } }
  | { type: "presence.set"; data: { online: boolean; visible: boolean } }
  | { type: "presence.duringCalls"; data: { on: boolean } }
  | { type: "host.callStatus.load"; data: Record<string, never> }
  | { type: "profile.settings.load"; data: Record<string, never> }
  | { type: "profile.load"; data: { id: string; requestId?: number } }
  | { type: "profile.posts.load"; data: { id: string; page?: number; requestId?: number } }
  | { type: "relationships.load"; data: { kind: RelationshipKind; page?: number; requestId: number } }
  | { type: "profile.settings.save" | "settings.set"; data: ProfileSettingsPatch & { requestId?: number } }
  | { type: "privacy.save"; data: Partial<Pick<PrivacySettings, "discoverable" | "showActivity">> & { requestId?: number } }
  | { type: "blocked.load"; data: { page?: number } }
  | { type: "block.set"; data: { id: string; blocked: boolean; requestId?: number } }
  | { type: "follow.set"; data: { id: string; on: boolean; requestId?: number } }
  | { type: "chat.open"; data: { with: string; background?: boolean; knownIds?: string[] } }
  | { type: "chat.activity"; data: { with: string; active: boolean } }
  | { type: "chats.reload"; data: { page?: number } }
  | { type: "chats.readAll"; data: Record<string, never> }
  | { type: "chat.send"; data: { to: string; text: string; inCall?: boolean; replyTo?: string; clientId?: string } }
  | { type: "chat.photo"; data: { to: string; photo: string; replyTo?: string; clientId?: string } }
  | { type: "chat.photoDownload"; data: { to: string; id: string; requestId: number } }
  | { type: "chat.photoViewer"; data: { open: boolean } }
  | { type: "chat.voice"; data: { to: string; audio: string; durationMs: number; clientId: string; replyTo?: string } }
  | { type: "chat.edit"; data: { to: string; id: string; text: string } }
  | { type: "chat.delete"; data: { to: string; id: string; everyone: boolean } }
  | { type: "gift.send"; data: { to: string; gift: string; coins: number; inCall: boolean; streamId?: string; idempotencyKey?: string } }
  | { type: "call.start"; data: { to: string; voice?: boolean } }
  | { type: "call.invitation.load"; data: { requestId: number; active?: boolean } }
  | { type: "call.invitation.connect"; data: { id: string; requestId: number; expectedCoinsPerMinute: number; expectedEntryFeeCoins: number } }
  | { type: "call.invitation.dismiss"; data: { id: string; requestId: number } }
  | { type: "call.topup.hold" | "call.topup.review"; data: { callId: string; requestId: number } }
  | { type: "call.accept"; data: { callId: string } }
  | { type: "call.targets.load"; data: { callId: string } }
  | { type: "call.targets.set"; data: import("./api/types").CallTargetsInput & { callId: string } }
  | { type: "call.decline"; data: { callId: string } }
  | { type: "call.end"; data: { callId?: string; reason?: string } }
  | { type: "verify.accept" | "verify.end"; data: { callId: string } }
  | { type: "payout.load"; data: { page?: number; requestId: number } }
  | { type: "payout.request"; data: { amountPaise: number; payoutAddress: string; idempotencyKey: string; requestId: number } }
  | { type: "awards.claim"; data: { task: string } }
  | { type: "ads.load"; data: Record<string, never> }
  | { type: "ads.impression" | "ads.click"; data: { id: string; placement: AdPlacement } };

/* App -> screens. The live events (call.*, gift.received, chat.message,
   wallet.balance, verification.status) come straight from the server socket. */
export type DataResource = "home" | "search" | "catalog" | "notifications" | "chats" | "wallet" | "transactions" | "calls" | "posts" | "thread" | "missed" | "profileSettings" | "publicProfile" | "publicPosts" | "relationships" | "blocked" | "themes" | "ads" | "leaderboard" | "referral";
export type AppMessage =
  | { type: "app.background"; data: Record<string, never> }
  | { type: "app.foreground"; data: Record<string, never> }
  | { type: "app.back"; data: Record<string, never> }
  | { type: "session"; data: Account }
  | { type: "session.restoring" | "session.none"; data: Record<string, never> }
  | { type: "session.error" | "session.expired"; data: { message: string } }
  | { type: "auth.ok"; data: Account & { isNew: boolean; requestId?: number } }
  | { type: "auth.otpSent"; data: { phone: string; resendAfter: number; expiresIn: number; otpLength: number; requestId?: number } }
  | { type: "auth.error"; data: { message: string; code?: string; retryAfterSeconds?: number; action?: string; requestId?: number } }
  | { type: "profile.saved"; data: { onboarding: boolean; account?: Account; requestId?: number } }
  | { type: "profile.account"; data: Account }
  | { type: "profile.progress"; data: { done: number; total: number; requestId?: number } }
  | { type: "profile.error"; data: { onboarding: boolean; message: string; code?: string; requestId?: number } }
  /* Without `available`, the check failed; `status` 400 means the address itself is invalid. */
  | { type: "auth.emailChecked"; data: { email: string; requestId: number; available?: boolean; message?: string; code?: string; status?: number } }
  | { type: "post.saved"; data: { post: UserPost; requestId?: number } }
  | { type: "post.error"; data: { message: string; requestId?: number } }
  | { type: "post.deleted"; data: { id: string; requestId: number } }
  | { type: "post.delete.error"; data: { id: string; requestId: number; message: string } }
  | { type: "creator.card.saved"; data: { account: Account; requestId: number } }
  | { type: "creator.card.error"; data: { message: string; requestId: number } }
  | { type: "profile.cover.saved"; data: { account: Account; requestId: number } }
  | { type: "profile.cover.error"; data: { message: string; requestId: number } }
  | { type: "account.deactivated"; data: { requestId: number } }
  | { type: "account.deactivate.error"; data: { message: string; requestId: number } }
  | { type: "data.posts"; data: { posts: UserPost[] } }
  | { type: "data.error" | "operation.error"; data: { message: string; action?: string; code?: string; status?: number; to?: string; id?: string; requestId?: number; clientId?: string; gift?: string; idempotencyKey?: string; packId?: string; merchantOrderId?: string } }
  | { type: "data.loaded"; data: Record<string, never> }
  | { type: "data.loading"; data: { resource: DataResource; loading: boolean; page?: number; q?: string; id?: string; requestId?: number; error?: string; background?: boolean } }
  | { type: "realtime.status"; data: { connected: boolean; message?: string } }
  | { type: "connection.status"; data: { connected: boolean; checking?: boolean } }
  | { type: "keyboard"; data: { open: boolean } }
  | { type: "data.hosts"; data: { hosts: Host[] } }
  | { type: "data.home"; data: HomeData & { background?: boolean } }
  | { type: "data.search"; data: { q: string; hosts: Host[]; total: number; page: number } }
  | { type: "home.updated"; data: Record<string, never> }
  | { type: "data.notifications"; data: Awaited<ReturnType<typeof api.notifications>> & { requestId?: number } }
  | { type: "notifications.saved"; data: NotificationReadPatch & NotificationReadResult & { requestId: number } }
  | { type: "notifications.error"; data: { requestId: number; message: string } }
  | { type: "notifications.changed"; data: Record<string, never> }
  | { type: "data.official"; data: OfficialChatData & { requestId: number } }
  | { type: "official.saved"; data: OfficialReadPatch & NotificationReadResult & { read: true; requestId: number } }
  | { type: "official.error"; data: { requestId: number; message: string; action: "load" | "read" } }
  | { type: "official.changed"; data: Record<string, never> }
  | { type: "push.opened"; data: NotificationTarget & { ownerId?: string; post?: UserPost; profile?: PublicProfile } }
  | { type: "data.catalog"; data: Catalog }
  | { type: "payments.routes"; data: PaymentRoutes & { requestId: number } }
  | { type: "data.themes"; data: ThemeCatalog }
  | { type: "theme.default"; data: AppTheme }
  | { type: "themes.selected"; data: { catalog: ThemeCatalog; requestId?: number } }
  | { type: "themes.error"; data: { action: string; message: string; code?: string; requestId?: number } }
  | { type: "themes.premium.checkout" | "themes.premium.purchase"; data: Purchase }
  | { type: "data.profileSettings"; data: ProfileSettings }
  | { type: "data.publicProfile"; data: { id: string; profile: PublicProfile; requestId?: number } }
  | { type: "data.publicPosts"; data: PublicPosts & { id: string; requestId?: number } }
  | { type: "data.relationships"; data: Relationships & { id: string; kind: RelationshipKind; requestId: number } }
  | { type: "profile.settings.saved"; data: { settings: ProfileSettings; requestId?: number } }
  | { type: "profile.settings.error" | "privacy.error"; data: { message: string; requestId?: number } }
  | { type: "privacy.saved"; data: { privacy: PrivacySettings; requestId?: number } }
  | { type: "data.blocked"; data: BlockedUsers }
  | { type: "block.saved"; data: { id: string; blocked: boolean; requestId?: number } }
  | { type: "block.error"; data: { id: string; blocked: boolean; message: string; requestId?: number } }
  | { type: "follow.saved"; data: { id: string; on: boolean; requestId?: number } }
  | { type: "post.liked"; data: { id: string; liked: boolean; likes: number; requestId?: number } }
  | { type: "post.like.error"; data: { id: string; liked: boolean; message: string; requestId?: number } }
  | { type: "data.postComments"; data: PostComments & { requestId?: number } }
  | { type: "post.comments.error"; data: { id: string; page: number; message: string; requestId?: number } }
  | { type: "post.comment.saved"; data: { id: string; comment: PostComment; requestId: number } }
  | { type: "post.comment.error"; data: { id: string; message: string; requestId: number } }
  | { type: "post.comment.deleted"; data: { id: string; commentId: string; requestId: number } }
  | { type: "post.comment.delete.error"; data: { id: string; commentId: string; message: string; requestId: number } }
  | { type: "follow.error"; data: { id: string; on: boolean; message: string; requestId?: number } }
  | { type: "presence.saved"; data: { online: boolean; visible: boolean } }
  | { type: "presence.duringCalls.saved"; data: { on: boolean } }
  | { type: "host.callStatus"; data: Awaited<ReturnType<typeof api.hostCallStatus>> }
  | { type: "host.access"; data: { approved: boolean; role: Role; serverRole?: ServerRole; hostStatus: string; verified: boolean; checking?: boolean } }
  | { type: "awards.claimed"; data: { task: string } }
  | { type: "data.ads"; data: AdFeed }
  | { type: "ads.opened" | "ads.retired"; data: { id: string } }
  | { type: "gift.sent"; data: { gift: string; to: string; idempotencyKey?: string; id?: string; coins?: number; message?: Message | null; giftDetails?: import("./api/types").Gift & { transferId: string; quantity: number } } }
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
  | { type: "call.created"; data: { callId: string; to: string; voice: boolean; invitationId?: string; requestId?: number } }
  | { type: "call.invitation.loaded" | "call.invitation.dismissed"; data: { invitation: import("./api/types").AutomaticCallInvitation | null; requestId: number } }
  | { type: "call.invitation.error"; data: { message: string; requestId: number; code?: string } }
  | { type: "call.topup.held"; data: { callId: string; until: string; requestId: number } }
  | { type: "call.topup.reviewed"; data: { callId: string; ringing: boolean; until?: string; rate?: number; requestId: number } }
  | { type: "call.topup.error"; data: { callId: string; message: string; requestId: number } }
  | { type: "call.topup.waiting"; data: { callId: string; until: string } }
  | { type: "call.targets"; data: import("./api/types").CallTargets }
  | { type: "wallet.checkout" | "wallet.purchase"; data: Purchase }
  | { type: "wallet.payment-returned"; data: { merchantOrderId: string; status: "PENDING" | "FAILED" | "REVERTED" | "SUCCESS" | "UNKNOWN"; idempotencyKey?: string; packId?: string } }
  | { type: "data.chats"; data: Awaited<ReturnType<typeof api.chats>> }
  | { type: "chats.readAll"; data: { updated: number; readAt: string } }
  | { type: "data.thread"; data: { with: string; messages: Message[]; readAt?: string; canSend?: boolean; sendDisabledReason?: string; hiddenIds?: string[] } }
  | { type: "data.missed"; data: Awaited<ReturnType<typeof api.missedCalls>> }
  | { type: "data.calls"; data: Awaited<ReturnType<typeof api.callHistory>> }
  | { type: "data.transactions"; data: Awaited<ReturnType<typeof api.transactions>> }
  | { type: "data.leaderboard"; data: Awaited<ReturnType<typeof api.leaderboard>> }
  | { type: "data.referral"; data: Awaited<ReturnType<typeof api.referral>> }
  | { type: "referral.applied"; data: Awaited<ReturnType<typeof api.referral>> & { requestId: number } }
  | { type: "referral.error"; data: { message: string; requestId?: number; code?: string; status?: number } }
  | { type: "wallet.balance"; data: Partial<Wallet> }
  | { type: "payout.loaded"; data: Payouts & { requestId: number; pending?: PendingPayout | null; recovered?: Payout | null } }
  | { type: "payout.requested"; data: { payout: Payout; requestId: number } }
  | { type: "payout.error"; data: { action: "payout.load" | "payout.request"; requestId: number; idempotencyKey?: string; message: string; code?: string; status?: number } }
  | { type: "chat.sent"; data: { to: string; sent: string; text: string; id: string; inCall: boolean; reply: NonNullable<Message["reply"]> | null; clientId?: string; createdAt?: string; sequence?: number } }
  | { type: "chat.photoSent"; data: { to: string; id: string; reply: NonNullable<Message["reply"]> | null; clientId?: string; createdAt?: string; sequence?: number } }
  | { type: "chat.photoDownloaded"; data: { to: string; id: string; requestId: number } }
  | { type: "chat.voiceSent"; data: { to: string; clientId: string; message: Message } }
  | { type: "chat.updated"; data: { with: string; message: Message } }
  | { type: "chat.removed"; data: { id: string } }
  | { type: "verification.status"; data: { status: Verification; hostStatus?: string; message?: string } }
  | { type: "agency.loaded" | "agency.verified" | "agency.joined"; data: import("./api/types").HostAgencyStatus & { requestId: number } }
  | { type: "agency.error"; data: { action: "agency.load" | "agency.verify" | "agency.join"; message: string; requestId: number } }
  | { type: "call.connected"; data: { callId: string; initiator?: boolean; peerId?: string; voice?: boolean; rate?: number; entryFee?: number; feeHoldSeconds?: number; earlyEnds?: { today: number; limit: number; penaltyCoins: number } } }
  | { type: "call.failed"; data: { message: string; callId?: string; code?: string; requiredCoins?: number; invitationId?: string; requestId?: number } }
  | { type: "call.incoming"; data: { callId: string; from: Record<string, unknown>; voice?: boolean; fromHost?: boolean; rate?: number; entryFee?: number; feeHoldSeconds?: number } }
  | { type: "call.ended"; data: { callId: string; coins?: number; reason?: "out_of_coins" | "switch" } }
  | { type: "verify.incoming"; data: { callId: string } }
  | { type: "verify.connected"; data: { callId: string; peerId: string; initiator: false; voice: false } }
  | { type: "verify.ended"; data: { callId: string; status: string } }
  | { type: "gift.received"; data: { gift: string; coins: number; from: string; id?: string; streamId?: string; giftId?: string; giftName?: string; senderName?: string; emoji?: string; mediaUrl?: string; durationMs?: number; senderAvatarUrl?: string; senderGender?: Gender } }
  | { type: "chat.message"; data: { from: string; name: string; text: string; id?: string; createdAt?: string; sequence?: number; orderAfterSequence?: number; clientId?: string; kind?: "text" | "image" | "voice" | "gift"; gift?: Message["gift"]; imageUrl?: string; audioUrl?: string; durationMs?: number; reply?: Message["reply"]; inCall?: boolean; callId?: string; automated?: boolean } };

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
  let pendingOutgoing: { generation: number; callId?: string; activity: UpdateLease } | undefined;
  let pendingStreamAccept: { generation: number; streamId: string; id: string } | undefined;
  const cancelledCalls = new Set<string>();
  let epoch = 0;
  let closed = false;
  let restoring = false;
  let webReady = false, sessionAvailable = false, runtimeLinkReceived = false;
  let documentRevision = 0;
  let payoutReadRevision = 0;
  let paymentRoutesRevision = 0;
  let officialLoadRevision = 0;
  const photoDownloads = new Map<string, Promise<void>>();
  let linkRevision = 0;
  let pendingStreamLink: { streamId: string; revision: number } | undefined;
  let loadingStreamLink: { revision: number; epoch: number } | undefined;
  let accountId: string | undefined;
  let hostStatus: string | undefined;
  let hostAccount: Account | undefined;
  let accountRole: ServerRole | undefined;
  const chatPeers = new Map<string, Host>();
  const publicFollows = new Map<string, { on: boolean; revision: number; sessionVersion: number }>();
  const threadPermissions = new Map<string, { canSend: boolean; reason?: string }>();
  let hostRevision = 0;
  let hostChecking = false;
  let activeHostCall = false;
  /** A host's call this member picked up; the member is its callee. */
  let answeredHostCall: string | undefined;
  let publishingAt: number | undefined;
  // Home lists every host, online or offline, each with their status.
  let homeQuery: HomeQuery = { mode: "popular" };
  let homeFlight: { key: string; epoch: number; session: number; document: number; background: boolean; work: Promise<void> } | undefined;
  let homeInvalidated = false;
  let homeRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  let lastHomeRefresh = 0;
  const resetHomeReads = () => { homeFlight = undefined; homeInvalidated = false; clearTimeout(homeRefreshTimer); homeRefreshTimer = undefined; lastHomeRefresh = 0; };
  let notificationQueryOwner: { query: NotificationsQuery; requestId?: number; epoch: number; sessionVersion: number; document: number } | undefined;
  const readRequests = new Map<DataResource, number>();
  let profileRevision = 0, profileReadSequence = 0, profileWrites = 0;
  let pendingProfileRefresh: { epoch: number; sessionVersion: number; document: number } | undefined;
  const beginProfileWrite = () => {
    profileRevision++; profileWrites++;
    return () => {
      profileRevision++; profileWrites--;
      if (!profileWrites && pendingProfileRefresh) {
        const pending = pendingProfileRefresh; pendingProfileRefresh = undefined;
        if (current(pending.epoch) && pending.sessionVersion === getSessionVersion() && pending.document === documentRevision) quietly(refreshProfileAccount(), "profile.refresh");
      }
    };
  };
  let activeStream: { id: string; hosting: boolean } | undefined;
  let streamRequestsRevision = 0;
  type PurchaseKind = "coins" | "premium";
  const pendingPurchases = new Map<string, PendingPayment & { epoch: number; sessionVersion: number }>();
  const verifyingPurchases = new Map<string, Promise<Purchase | undefined>>();
  type CoinReturn = { payment: PendingPayment; owner?: string; epoch: number; sessionVersion: number; document: number; departed: boolean; settling: boolean; terminal?: Purchase; activity?: PurchaseActivity; generation?: number };
  const externalCoinCheckouts = new Map<string, CoinReturn>();
  const operations = new Set<string>();
  const authWork = new Set<string>();
  type UpdateLease = { finished: boolean; finish: () => void };
  type PurchaseActivity = { lease: UpdateLease; kind: PurchaseKind; attempt?: string; orderId?: string; epoch: number; session: number; owner?: string; generation: number; inFlight: number; dismissed: boolean; uiClosed: boolean; expiresAt?: number; timer?: ReturnType<typeof setTimeout> };
  let activitySerial = 0;
  const updateActivities = new Set<UpdateLease>();
  const callActivities = new Map<string, UpdateLease>();
  const purchaseActivities = new Set<PurchaseActivity>();
  const holdUpdateActivity = (kind: "call" | "purchase", key: string): UpdateLease => {
    const release = beginUpdateActivity(kind, `${epoch}:${getSessionVersion()}:${++activitySerial}:${key}`);
    const lease: UpdateLease = { finished: false, finish: () => {
      if (lease.finished) return;
      lease.finished = true; updateActivities.delete(lease);
      for (const [callId, held] of callActivities) if (held === lease) callActivities.delete(callId);
      release();
    } };
    updateActivities.add(lease); return lease;
  };
  const holdCallActivity = (callId: string, candidate?: UpdateLease) => {
    const existing = callActivities.get(callId);
    if (existing) { if (candidate && candidate !== existing) candidate.finish(); return existing; }
    const lease = candidate ?? holdUpdateActivity("call", callId);
    if (!lease.finished) callActivities.set(callId, lease);
    return lease;
  };
  const finishCallActivity = (callId: string) => callActivities.get(callId)?.finish();
  const purchaseActivityCurrent = (entry: PurchaseActivity) => !closed && entry.epoch === epoch && entry.session === getSessionVersion() && entry.owner === accountId;
  const purchaseActivity = (kind: PurchaseKind, attempt?: string, orderId?: string) => {
    const existing = [...purchaseActivities].find(entry => purchaseActivityCurrent(entry) && entry.kind === kind &&
      (orderId ? entry.orderId === orderId : attempt && entry.attempt === attempt));
    if (existing && !existing.lease.finished) return existing;
    const entry: PurchaseActivity = { lease: holdUpdateActivity("purchase", `${kind}:${attempt ?? orderId}`), kind, attempt, orderId, epoch, session: getSessionVersion(), owner: accountId, generation: 0, inFlight: 0, dismissed: false, uiClosed: false };
    purchaseActivities.add(entry); return entry;
  };
  const finishPurchaseActivity = (entry: PurchaseActivity) => {
    entry.dismissed = true;
    clearTimeout(entry.timer); entry.timer = undefined;
    if (!entry.inFlight) { entry.lease.finish(); purchaseActivities.delete(entry); }
  };
  const expirePurchaseActivity = (entry: PurchaseActivity, expiresAt?: string) => {
    const deadline = expiresAt ? Date.parse(expiresAt) : NaN;
    if (!Number.isFinite(deadline) || entry.expiresAt !== undefined && entry.expiresAt <= deadline) return;
    entry.expiresAt = deadline; clearTimeout(entry.timer);
    const settleExpiry = () => {
      const remaining = deadline - Date.now();
      if (remaining > 2147483647) entry.timer = setTimeout(settleExpiry, 2147483647);
      else entry.timer = setTimeout(() => finishPurchaseActivity(entry), Math.max(0, remaining));
    };
    settleExpiry();
  };
  const resetUpdateActivities = () => {
    for (const entry of purchaseActivities) { entry.dismissed = true; clearTimeout(entry.timer); }
    purchaseActivities.clear();
    for (const lease of updateActivities) lease.finish();
    callActivities.clear();
  };
  const current = (version: number) => !closed && version === epoch;
  const emit = (message: AppMessage) => { if (!closed) post(message); };
  const stopConnection = onConnectionChanged(data => {
    if (webReady) emit({ type: "connection.status", data });
  });
  const metadata = (error: unknown) => ({
    message: errorMessage(error),
    ...(error instanceof ApiError ? { code: error.code, retryAfterSeconds: error.retryAfterSeconds } : {}),
  });
  const operationError = (error: unknown, action?: string, context: { to?: string; id?: string; requestId?: number; clientId?: string; gift?: string; idempotencyKey?: string; packId?: string; merchantOrderId?: string } = {}) => {
    if (action?.startsWith("themes.")) emit({ type: "themes.error", data: { message: errorMessage(error), action, ...(error instanceof ApiError ? { code: error.code } : {}) } });
    // A refused friend code is explained beside the code field, not in a toast.
    else if (action === "referral.apply") emit({ type: "referral.error", data: { message: errorMessage(error), requestId: context.requestId, ...(error instanceof ApiError ? { code: error.code, status: error.status } : {}) } });
    else emit({ type: "operation.error", data: { message: errorMessage(error), action, ...context, ...(error instanceof ApiError ? { code: error.code, status: error.status } : {}) } });
  };
  const quietly = (work: Promise<unknown>, action?: string) => {
    const version = epoch;
    void work.catch(error => { if (current(version)) operationError(error, action); });
  };
  const flushStreamLink = async () => {
    if (!LIVE_STREAMING_ENABLED) return;
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
    if (!LIVE_STREAMING_ENABLED) return false;
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
        void api.endCall(callId, "host approval changed").catch(() => {}).finally(() => finishCallActivity(callId));
      }
    }
  };
  const applyHostAccount = (account: Account, publish = true) => {
    const nextRole = account.user.serverRole ?? (account.user.role === "host" ? "host" : "user");
    if (accountId !== account.user.id) { if (accountId) resetUpdateActivities(); chatPeers.clear(); threadPermissions.clear(); publicFollows.clear(); homeQuery = { mode: "popular" }; }
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
    const profileVersion = profileRevision;
    const account = await api.me(true);
    if (!current(version) || sessionVersion !== getSessionVersion() || revision !== hostRevision) return;
    applyHostAccount(account);
    if (profileVersion === profileRevision && !profileWrites) emit({ type: "profile.account", data: account });
  };
  const refreshProfileAccount = async () => {
    if (profileWrites) { pendingProfileRefresh = { epoch, sessionVersion: getSessionVersion(), document: documentRevision }; return; }
    const version = epoch, sessionVersion = getSessionVersion(), revision = profileRevision;
    const requestId = ++profileReadSequence, authority = hostRevision, document = documentRevision;
    const account = await api.me(true);
    if (!current(version) || sessionVersion !== getSessionVersion() || revision !== profileRevision || requestId !== profileReadSequence || authority !== hostRevision || document !== documentRevision || account.user.id !== accountId) return;
    const authorityChanged = hostChecking || hasHostAccess() !== approvedHost(account) || hostStatus !== account.user.hostStatus ||
      accountRole !== (account.user.serverRole ?? (account.user.role === "host" ? "host" : "user"));
    applyHostAccount(account, false);
    if (authorityChanged) publishHostAccess();
    emit({ type: "profile.account", data: account });
  };
  const requireApprovedHost = async (allowMemberPhotos = false) => {
    const version = epoch, sessionVersion = getSessionVersion(), revision = hostRevision;
    const account = await api.me(true);
    if (!current(version) || sessionVersion !== getSessionVersion()) throw new ApiError("Your sign-in changed. Please try again.", 409);
    if (revision !== hostRevision) throw new ApiError("Your creator approval changed. Please try again.", 403);
    applyHostAccount(account);
    if (!approvedHost(account) && !(allowMemberPhotos && account.user.serverRole === "user")) throw new ApiError("Your creator profile needs admin approval before you can host.", 403);
    return revision;
  };
  const acceptHostCall = async (callId: string, version: number) => {
    const wasRinging = callActivities.has(callId);
    holdCallActivity(callId);
    const generation = ++callGeneration, sessionVersion = getSessionVersion();
    activeCall = callId; activeHostCall = false; answeredHostCall = callId;
    try {
      const details = await api.acceptCall(callId);
      if (!current(version) || sessionVersion !== getSessionVersion() || generation !== callGeneration || cancelledCalls.has(callId)) {
        try { await endCancelledCall(callId, sessionVersion); } finally { finishCallActivity(callId); }
        return;
      }
      emit({ type: "call.connected", data: { callId, initiator: false, ...details } });
    } catch (error) {
      if (current(version) && generation === callGeneration) {
        activeCall = undefined; answeredHostCall = undefined;
        if (!wasRinging) finishCallActivity(callId);
        emit({ type: "call.failed", data: { message: errorMessage(error), callId, ...(error instanceof ApiError && error.code ? { code: error.code } : {}) } });
      }
    }
  };
  const requireChatPair = async (peerId: string) => {
    if (!hostAccount || hostChecking) await refreshHostAccount();
    if (!hostAccount || hostChecking) throw new ApiError("Your account is being checked. Try again in a moment.", 403);
    if (peerId === accountId) throw new ApiError("Choose another user.", 400);
    if (accountRole === "admin" || (accountRole === "host" && !hasHostAccess())) throw new ApiError("Your creator profile needs admin approval before you can chat.", 403);
    const peer = chatPeers.get(peerId);
    const peerRole = peer?.serverRole ?? (peer?.role === "host" || peer?.verified === true ? "host" : peer?.role === "sender" ? "user" : undefined);
    if (accountRole === "user" && peerRole && peerRole !== "host") throw new ApiError("Members can message approved hosts only.", 403);
  };
  /** The checks the server makes before a direct message: an allowed pair and an open conversation. False when the session changed. */
  const requireThreadSend = async (to: string, version: number) => {
    await requireChatPair(to);
    if (!current(version)) return false;
    if (!threadPermissions.has(to)) {
      const revision = hostRevision;
      const data = await api.thread(to);
      if (!current(version)) return false;
      if (revision !== hostRevision) throw new ApiError("Your account permissions changed. Open the conversation again.", 403);
      rememberThreadPermission(to, data);
    }
    const permission = threadPermissions.get(to);
    if (!permission?.canSend) throw new ApiError(permission?.reason || "You can't send messages in this conversation right now.", 403);
    return true;
  };
  const rememberHomePeers = (data: HomeData) => {
    for (const peer of [...data.hosts, ...(data.stage ?? []), ...(data.featured ? [data.featured] : [])]) chatPeers.set(peer.id, { ...peer, serverRole: "host" });
  };
  const rememberThreadPermission = (peerId: string, data: { canSend?: boolean; sendDisabledReason?: string }) => {
    // Older servers may omit this flag; they still enforce every send.
    threadPermissions.set(peerId, { canSend: data.canSend ?? true, reason: data.sendDisabledReason });
  };
  const readResource = async <T>(resource: DataResource, read: () => Promise<T>, deliver: (data: T) => void, context: { page?: number; q?: string; id?: string; requestId?: number; background?: boolean } = {}) => {
    const version = epoch, sessionVersion = getSessionVersion(), document = documentRevision, requestId = (readRequests.get(resource) ?? 0) + 1;
    readRequests.set(resource, requestId);
    const latest = () => current(version) && getSessionVersion() === sessionVersion && documentRevision === document && readRequests.get(resource) === requestId;
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
  // One serialized lease per authenticated device session. Coalesce renewals and
  // close the previous peer before opening another; delayed closes never race a
  // newer open. A network failure is best-effort and the server lease expires.
  type ChatLease = { epoch: number; session: number; wanted?: string; applied?: string; revision: number; delivered: number; work?: Promise<void> };
  let chatLease: ChatLease | undefined;
  const flushChatActivity = () => {
    const state = chatLease;
    if (!state || state.work) return;
    const applicable = () => !closed && chatLease === state && current(state.epoch) && state.session === getSessionVersion();
    state.work = (async () => {
      while (applicable() && state.delivered !== state.revision) {
        const revision = state.revision, target = appActive ? state.wanted : undefined;
        if (state.applied && state.applied !== target) {
          const previous = state.applied; state.applied = undefined;
          try { await api.setChatActivity(previous, false); } catch { /* TTL handles an unreachable close. */ }
        }
        if (!applicable()) return;
        if (target && target === (appActive ? state.wanted : undefined)) {
          state.applied = target;
          try { await api.setChatActivity(target, true); } catch { /* Next heartbeat renews after recovery. */ }
        }
        state.delivered = revision;
      }
    })().finally(() => { state.work = undefined; if (applicable() && state.delivered !== state.revision) flushChatActivity(); });
  };
  const setChatActivity = (peer?: string, active = false) => {
    if (!chatLease || chatLease.epoch !== epoch || chatLease.session !== getSessionVersion()) chatLease = { epoch, session: getSessionVersion(), revision: 0, delivered: 0 };
    if (active && peer) chatLease.wanted = peer;
    else if (!peer || chatLease.wanted === peer) chatLease.wanted = undefined;
    chatLease.revision++; flushChatActivity();
  };
  // A call that ends, is declined or goes unanswered belongs in Chats' Calls and Missed calls
  // tabs. A background read keeps the shown list until the new one arrives.
  const refreshCalls = () => Promise.allSettled([
    readResource("calls", () => api.callHistory(), data => emit({ type: "data.calls", data }), { background: true }),
    readResource("missed", () => api.missedCalls(), data => emit({ type: "data.missed", data }), { background: true }),
  ]);
  const homeFlightCurrent = () => homeFlight && current(homeFlight.epoch) && homeFlight.session === getSessionVersion() && homeFlight.document === documentRevision;
  const loadHome = (query = homeQuery, background = false): Promise<void> => {
    query = { ...query };
    const key = JSON.stringify([query.mode, query.category, query.country, query.q, query.page ?? 1]);
    if (homeFlightCurrent() && homeFlight!.key === key && (background || !homeFlight!.background)) {
      if (background) homeInvalidated = true;
      return homeFlight!.work;
    }
    clearTimeout(homeRefreshTimer); homeRefreshTimer = undefined;
    homeQuery = query;
    homeInvalidated = false;
    const flight = { key, epoch, session: getSessionVersion(), document: documentRevision, background, work: Promise.resolve() };
    homeFlight = flight;
    flight.work = readResource("home", () => api.home(query), data => { rememberHomePeers(data); emit({ type: "data.home", data: { ...data, ...(background ? { background: true } : {}) } }); }, { page: query.page ?? 1, ...(query.q !== undefined ? { q: query.q } : {}), ...(background ? { background: true } : {}) }).finally(() => {
      if (homeFlight !== flight) return;
      homeFlight = undefined;
      if (homeInvalidated && current(flight.epoch) && flight.session === getSessionVersion() && flight.document === documentRevision) invalidateHome();
    });
    return flight.work;
  };
  // A burst of presence/call events needs at most one in-flight read and one
  // trailing read. A hidden app waits until foreground instead of redrawing.
  const invalidateHome = () => {
    homeInvalidated = true;
    if (!appActive || homeFlightCurrent()) return;
    const delay = 750 - (Date.now() - lastHomeRefresh);
    if (delay > 0) {
      if (!homeRefreshTimer) homeRefreshTimer = setTimeout(() => { homeRefreshTimer = undefined; invalidateHome(); }, delay);
      return;
    }
    homeInvalidated = false;
    lastHomeRefresh = Date.now();
    void loadHome({ ...homeQuery, page: 1 }, true).catch(() => {});
  };
  const loadNotifications = (query?: NotificationsQuery, requestId?: number, ownQuery = false) => {
    if (notificationQueryOwner && (!current(notificationQueryOwner.epoch) || notificationQueryOwner.sessionVersion !== getSessionVersion() || notificationQueryOwner.document !== documentRevision)) notificationQueryOwner = undefined;
    if (ownQuery) notificationQueryOwner = { query: { ...query }, requestId, epoch, sessionVersion: getSessionVersion(), document: documentRevision };
    else if (notificationQueryOwner && query === undefined && requestId === undefined) {
      // Global retries must refresh the visible filter, not replace it with an
      // uncorrelated all-inbox response that also retires its in-flight read.
      query = { ...notificationQueryOwner.query, page: 1 };
      requestId = notificationQueryOwner.requestId;
    }
    return readResource("notifications", () => api.notifications(query), data => emit({ type: "data.notifications", data: { ...data, ...(requestId !== undefined ? { requestId } : {}) } }), { page: query?.page ?? 1, ...(requestId !== undefined ? { requestId } : {}) });
  };
  const updateNotifications = async (input: NotificationReadPatch, requestId: number) => {
    const version = epoch, sessionVersion = getSessionVersion(), document = documentRevision;
    const applicable = () => current(version) && sessionVersion === getSessionVersion() && document === documentRevision;
    try {
      const result = await api.updateNotificationRead(input);
      if (!applicable()) return;
      emit({ type: "notifications.saved", data: { ...input, ...result, requestId } });
      quietly(loadHome({ ...homeQuery, page: 1 }, true), "home.reload");
    } catch (error) {
      if (applicable()) emit({ type: "notifications.error", data: { requestId, message: errorMessage(error) } });
    }
  };
  const loadOfficial = async (page: number, requestId: number) => {
    const version = epoch, sessionVersion = getSessionVersion(), document = documentRevision, revision = ++officialLoadRevision;
    const applicable = () => current(version) && sessionVersion === getSessionVersion() && document === documentRevision && revision === officialLoadRevision;
    try {
      const data = await api.officialChat(page);
      if (applicable()) emit({ type: "data.official", data: { ...data, requestId } });
    } catch (error) {
      if (applicable()) emit({ type: "official.error", data: { requestId, action: "load", message: errorMessage(error) } });
    }
  };
  const readOfficial = async (input: OfficialReadPatch, requestId: number) => {
    const version = epoch, sessionVersion = getSessionVersion(), document = documentRevision;
    const applicable = () => current(version) && sessionVersion === getSessionVersion() && document === documentRevision;
    try {
      const result = await api.readOfficialChat(input);
      if (!applicable()) return;
      // A pending history read may predate this committed receipt.
      officialLoadRevision++;
      emit({ type: "official.saved", data: { ...input, ...result, read: true, requestId } });
      quietly(loadChats(), "chats.reload");
      quietly(loadHome({ ...homeQuery, page: 1 }, true), "home.reload");
    } catch (error) {
      if (applicable()) emit({ type: "official.error", data: { requestId, action: "read", message: errorMessage(error) } });
    }
  };
  const loadCatalog = () => readResource("catalog", () => api.catalog(), data => emit({ type: "data.catalog", data }));
  // The next launch paints this account's theme before the catalog arrives.
  const rememberTheme = (catalog: ThemeCatalog) => {
    const theme = catalog.items.find(item => item.id === catalog.selectedThemeId);
    if (accountId && theme) void rememberAccountTheme(accountId, theme);
  };
  const loadThemes = () => readResource("themes", () => api.themes(), data => { emit({ type: "data.themes", data }); rememberTheme(data); });
  // Ads are optional: a failed read leaves the screens as they are, without an error message.
  const loadAds = () => readResource("ads", () => api.ads(), data => emit({ type: "data.ads", data })).catch(() => {});
  const loadDefaultTheme = async () => {
    const theme = await api.defaultTheme();
    if (closed || !theme) return;
    emit({ type: "theme.default", data: theme });
    void rememberDefaultTheme(theme);
  };
  // This device's FCM registration. The server decides whether push is on;
  // the device decides whether it can receive it.
  let pushStatus: PushStatus = "unavailable";
  let pushSession: number | undefined;
  let pushPrompted = false;
  let pushOpenPending: NotificationTarget | undefined;
  let pushOpenRevision = 0;
  const syncPush = async (mode: PushMode) => {
    const version = epoch, sessionVersion = getSessionVersion();
    const status = await registerPush(token => api.registerPushDevice(token), mode);
    if (!current(version) || sessionVersion !== getSessionVersion() || status === pushStatus) return;
    pushStatus = status;
    quietly(loadProfileSettings(), "profile.settings.load");
  };
  const withPushStatus = (settings: ProfileSettings): ProfileSettings =>
    ({ ...settings, capabilities: { ...settings.capabilities, nativePushRegistered: pushStatus === "registered", nativePushStatus: pushStatus } });
  const emitProfileSettings = (settings: ProfileSettings) => {
    // Register once per signed-in session, and never spend Android's one-time
    // permission prompt while the server cannot send.
    if (settings.capabilities.pushNotifications && pushSession !== getSessionVersion() && !liveOnboarding) {
      pushSession = getSessionVersion();
      void syncPush(pushPrompted ? "silent" : "prompt");
      pushPrompted = true;
    }
    emit({ type: "data.profileSettings", data: withPushStatus(settings) });
  };
  /** A tap is only navigation; authoritative endpoints recheck sensitive targets. */
  const flushPushOpen = async () => {
    if (!pushOpenPending || !webReady || !sessionAvailable || restoring || liveOnboarding || hostAccount?.requiresOnboarding) return;
    const target = pushOpenPending, version = epoch, sessionVersion = getSessionVersion(), revision = pushOpenRevision;
    pushOpenPending = undefined;
    if (target.recipientId && target.recipientId !== accountId) return;
    const applicable = () => current(version) && sessionVersion === getSessionVersion() && revision === pushOpenRevision && sessionAvailable;
    if (target.expiresAt && Date.parse(target.expiresAt) <= Date.now() && activeCall !== target.targetId) {
      emit({ type: "push.opened", data: { targetType: "inbox", notificationId: target.notificationId } });return;
    }
    try {
      if (target.targetType === "appUpdate") {
        notifyAppUpdate(false);
      } else if (target.targetType === "thread" && target.targetId) {
        const profile = await api.publicProfile(target.targetId);
        if (applicable()) emit({ type: "push.opened", data: { ...target, profile } });
        return;
      } else if (target.targetType === "post" && target.targetId) {
        const post = await api.notificationPost(target.targetId);
        if (applicable()) emit({ type: "push.opened", data: { ...target, ...post } });
        return;
      } else if (target.targetType === "call" && target.targetId && !activeCall && !pendingOutgoing && !verifyCall) {
        const incoming = await api.notificationCall(target.targetId);
        if (!applicable()) return;
        if (incoming && (hasHostAccess() || accountRole === "user" && incoming.fromHost)) {
          holdCallActivity(incoming.callId);
          emit({ type: "call.incoming", data: incoming });return;
        }
        if (target.actorId) {
          const profile = await api.publicProfile(target.actorId);
          if (applicable()) emit({ type: "push.opened", data: { ...target, targetType: "creator", targetId: target.actorId, profile } });
          return;
        }
      }
      if (applicable()) emit({ type: "push.opened", data: target });
    } catch {
      if (applicable()) emit({ type: "push.opened", data: { targetType: "inbox", notificationId: target.notificationId } });
    }
  };
  const loadProfileSettings = () => readResource("profileSettings", () => api.profileSettings(), emitProfileSettings);
  const loadPublicProfile = (id: string, requestId?: number) => {
    const followRevision = publicFollows.get(id)?.revision ?? 0;
    return readResource("publicProfile", () => api.publicProfile(id), profile => {
      const acknowledged = publicFollows.get(id);
      // A read already in flight may predate a follow committed while it loads.
      // Preserve the acknowledged relationship without starting another load.
      if (acknowledged && acknowledged.sessionVersion === getSessionVersion() && acknowledged.revision !== followRevision && profile.following !== acknowledged.on) {
        profile = { ...profile, following: acknowledged.on, ...(typeof profile.followers === "number" ? { followers: Math.max(0, profile.followers + (acknowledged.on ? 1 : -1)) } : {}) };
      }
      chatPeers.set(id, profile);
      emit({ type: "data.publicProfile", data: { id, profile, requestId } });
    }, { id, requestId });
  };
  const loadPublicPosts = (id: string, page = 1, requestId?: number) => readResource("publicPosts", () => api.publicPosts(id, page), data => emit({ type: "data.publicPosts", data: { ...data, id, requestId } }), { id, page, requestId });
  const loadRelationships = (kind: RelationshipKind, page: number, requestId: number) => {
    const id = accountId;
    if (!id) return Promise.reject(new ApiError("Sign in to view your connections.", 401));
    return readResource("relationships", () => api.relationships(kind, page), data => emit({ type: "data.relationships", data: { ...data, id, kind, requestId } }), { id, page, requestId });
  };
  const loadBlocked = (page = 1) => readResource("blocked", () => api.blockedUsers(page), data => emit({ type: "data.blocked", data }), { page });
  const deliverProfileSettings = (settings: ProfileSettings) => {
    // A GET started before this committed write cannot restore old preferences.
    readRequests.set("profileSettings", (readRequests.get("profileSettings") ?? 0) + 1);
    emitProfileSettings(settings);
    emit({ type: "data.loading", data: { resource: "profileSettings", loading: false } });
  };
  const loadChats = (page = 1, background = false) => readResource<ChatsData>("chats", () => accountRole === "host" && !hasHostAccess() && !hostChecking
    ? Promise.resolve({ chats: [], total: 0, page, limit: 20, unreadCount: 0, unreadConversations: 0 }) : api.chats(page), data => {
      for (const chat of data.chats) if (chat.user?.id) {
        chatPeers.set(chat.user.id, chat.user);
        if (threadPermissions.has(chat.user.id) && typeof chat.canSend === "boolean") rememberThreadPermission(chat.user.id, chat);
      }
      emit({ type: "data.chats", data });
    }, { page, ...(background ? { background: true } : {}) });
  const verifyPurchase = (orderId: string, kind: PurchaseKind = "coins", protect = true): Promise<Purchase | undefined> => {
    const version = epoch, sessionVersion = getSessionVersion(), owner = accountId, key = `${version}:${sessionVersion}:${kind}:${orderId}`;
    const existing = verifyingPurchases.get(key);
    const held = [...purchaseActivities].find(entry => purchaseActivityCurrent(entry) && entry.kind === kind && entry.orderId === orderId);
    if (existing) {
      if (!protect || held) return existing;
      const activity = purchaseActivity(kind, undefined, orderId); activity.inFlight++;
      return existing.finally(() => { activity.inFlight--; finishPurchaseActivity(activity); });
    }
    const activity = held ?? (protect ? purchaseActivity(kind, undefined, orderId) : undefined);
    const transient = !held && !!activity;
    if (activity) activity.inFlight++;
    const work = (async () => { try {
      const purchase = await (kind === "premium" ? api.verifyPremium(orderId) : api.verifyPurchase(orderId));
      if (current(version) && getSessionVersion() === sessionVersion && owner === accountId) {
        const resolvedKind = purchase.kind ?? kind;
        const pending = pendingPurchases.get(orderId);
        const external = externalCoinCheckouts.get(orderId);
        if (resolvedKind === "coins" && external && purchase.status !== "PENDING") external.terminal = purchase;
        emit({ type: resolvedKind === "premium" ? "themes.premium.purchase" : "wallet.purchase", data: { ...(pending?.packId ? { packId: pending.packId } : {}), ...(pending?.idempotencyKey ? { idempotencyKey: pending.idempotencyKey } : {}), ...(pending?.requestedRoute ? { requestedRoute: pending.requestedRoute } : {}), ...purchase, merchantOrderId: orderId } });
        if (purchase.status !== "PENDING") {
          pendingPurchases.delete(orderId);
          if (owner) void forgetPendingPayment(owner, orderId);
          if (activity) finishPurchaseActivity(activity);
        }
        if (activity && purchase.status === "PENDING") expirePurchaseActivity(activity, purchase.expiresAt);
        // Only a fresh authenticated catalog can grant or revoke theme access.
        if (resolvedKind === "premium") { quietly(loadThemes(), "themes.load"); void loadAds(); } else quietly(refreshWallet(), "wallet.load");
        return purchase;
      }
    } catch (error) {
      if (current(version) && getSessionVersion() === sessionVersion && owner === accountId) operationError(error, kind === "premium" ? "themes.premium.verify" : "wallet.verify", { merchantOrderId: orderId });
    } })().finally(() => {
      verifyingPurchases.delete(key);
      if (activity) {
        activity.inFlight--;
        if (transient || activity.dismissed || !purchaseActivityCurrent(activity)) finishPurchaseActivity(activity);
      }
    });
    verifyingPurchases.set(key, work);
    return work;
  };
  // Returning without completing a coin checkout releases its UI attempt. The
  // order remains pending on the server and in secure storage until confirmed.
  const coinPaymentReturned = async (entry: CoinReturn) => {
    if (entry.settling) return;
    entry.settling = true;
    const applicable = () => current(entry.epoch) && entry.sessionVersion === getSessionVersion() && entry.owner === accountId && entry.document === documentRevision &&
      (!entry.activity || entry.activity.generation === entry.generation && !entry.activity.uiClosed);
    try {
      if (!applicable()) return;
      const purchase = entry.terminal ?? await verifyPurchase(entry.payment.orderId);
      if (!applicable()) return;
      const status = entry.terminal?.status ?? purchase?.status;
      emit({ type: "wallet.payment-returned", data: {
        merchantOrderId: entry.payment.orderId,
        status: status === "SUCCESS" || status === "FAILED" || status === "REVERTED" || status === "PENDING" ? status : "UNKNOWN",
        ...(entry.payment.idempotencyKey ? { idempotencyKey: entry.payment.idempotencyKey } : {}),
        ...(entry.payment.packId ? { packId: entry.payment.packId } : {}),
      } });
    } finally {
      if (externalCoinCheckouts.get(entry.payment.orderId) === entry) externalCoinCheckouts.delete(entry.payment.orderId);
      if (entry.activity && entry.activity.generation === entry.generation) finishPurchaseActivity(entry.activity);
    }
  };
  const restorePendingPurchases = async () => {
    const owner = accountId, version = epoch, sessionVersion = getSessionVersion();
    if (!owner) return;
    const payments = await readPendingPayments(owner);
    if (!current(version) || accountId !== owner || sessionVersion !== getSessionVersion()) return;
    for (const payment of payments) {
      pendingPurchases.set(payment.orderId, { ...payment, epoch: version, sessionVersion });
      // These restored controls are visible again; abandon/terminal signals,
      // not a durable local order ID, determine the protected UI lifetime.
      const activity = purchaseActivity(payment.kind, payment.idempotencyKey, payment.orderId);
      // Restore order correlation before verification. Coin orders can release
      // their abandoned UI while native tracking still reconciles late credit.
      emit({ type: payment.kind === "premium" ? "themes.premium.purchase" : "wallet.purchase", data: {
        purchaseId: "", merchantOrderId: payment.orderId, kind: payment.kind, status: "PENDING",
        ...(payment.packId ? { packId: payment.packId } : {}), ...(payment.idempotencyKey ? { idempotencyKey: payment.idempotencyKey } : {}),
        ...(payment.requestedRoute ? { requestedRoute: payment.requestedRoute } : {}),
      } });
      if (payment.kind === "coins") void coinPaymentReturned({ payment, owner, epoch: version, sessionVersion, document: documentRevision, departed: false, settling: false, activity, generation: activity.generation });
      else void verifyPurchase(payment.orderId, payment.kind);
    }
  };
  const activity = AppState?.addEventListener("change", state => {
    if (closed) return;
    appActive = state === "active";
    stopLive.setActive?.(appActive && !liveOnboarding);
    if (chatLease) { chatLease.revision++; flushChatActivity(); }
    if (!appActive) {
      clearTimeout(homeRefreshTimer); homeRefreshTimer = undefined;
      for (const external of externalCoinCheckouts.values()) if (!external.settling) external.departed = true;
      return;
    }
    if (homeInvalidated && accountId && getCachedToken()) { lastHomeRefresh = 0; invalidateHome(); }
    for (const external of externalCoinCheckouts.values()) if (external.departed) void coinPaymentReturned(external);
    for (const pending of pendingPurchases.values()) {
      if (pending.epoch === epoch && pending.sessionVersion === getSessionVersion()) {
        quietly(verifyPurchase(pending.orderId, pending.kind, false), pending.kind === "premium" ? "themes.premium.verify" : "wallet.verify");
      }
    }
    if (accountId && getCachedToken() && !hostAccount?.requiresOnboarding) quietly(loadThemes(), "themes.load");
    if (pushSession === getSessionVersion() && sessionAvailable && pushStatus !== "registered") void syncPush("silent");
  });
  const loadLists = async () => {
    const version = epoch;
    void loadAds();
    const deliver = (message: AppMessage) => { if (current(version)) emit(message); };
    const results = await Promise.allSettled([
      loadHome(), loadNotifications(), loadCatalog(), loadProfileSettings(), loadThemes(),
      // This is saved status for display, not permission to perform a host action.
      api.presence().then(data => deliver({ type: "presence.saved", data: { ...data, online: approvedHost(hostAccount) && data.online } })),
      loadChats(),
      readResource("missed", () => api.missedCalls(), data => deliver({ type: "data.missed", data })),
      readResource("calls", () => api.callHistory(), data => deliver({ type: "data.calls", data })),
      readResource("transactions", () => api.transactions(), data => deliver({ type: "data.transactions", data })),
      readResource("posts", () => accountRole === "user" || hasHostAccess() ? api.myPosts() : Promise.resolve({ posts: [] }), data => deliver({ type: "data.posts", data })),
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
    let connectedBefore = false;
    stopLive = connectRealtime(token, event => {
      if (!current(version)) return;
      if (!LIVE_STREAMING_ENABLED && event.type.startsWith("stream.") && event.type !== "stream.ended") {
        // A delayed room transition must not open media or leave a billable
        // private call behind after broadcasting has been switched off.
        if (event.type === "stream.privateCall" && typeof event.data?.callId === "string") {
          quietly(endCancelledCall(event.data.callId, getSessionVersion()), "call.end");
        }
        return;
      }
      if (!LIVE_STREAMING_ENABLED && event.type === "gift.received" && event.data?.streamId) return;
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
      if (event.type === "chats.updated") { if (!liveOnboarding) quietly(loadChats(1, true), "chats.reload"); return; }
      if (event.type === "account.updated" || event.type === "profile.updated") {
        profileRevision++;
        if (!liveOnboarding) { quietly(refreshProfileAccount(), "profile.refresh"); quietly(loadProfileSettings(), "profile.settings.load"); if (event.type === "account.updated") quietly(loadThemes(), "themes.load"); }
        return;
      }
      if (event.type === "themes.updated") { if (!liveOnboarding) quietly(loadThemes(), "themes.load"); return; }
      if (event.type === "ads.updated") { if (!liveOnboarding) void loadAds(); return; }
      const callId = event.data?.callId;
      if (event.type === "verify.updated" && typeof callId === "string") {
        const status = String(event.data?.status);
        if (status === "ringing") {
          holdCallActivity(callId);
          if (verifyCall?.callId !== callId) verifyCall = { callId, accepted: false };
          emit({ type: "verify.incoming", data: { callId } });
        } else if (status !== "accepted" || (verifyCall?.callId === callId && !verifyCall.accepted)) {
          // Ended, or answered on another of this person's devices.
          if (verifyCall?.callId === callId) verifyCall = undefined;
          finishCallActivity(callId);
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
        holdCallActivity(callId);
        if (event.data?.streamId === activeStream?.id) activeStream = undefined;
      }
      if (event.type === "call.incoming" && typeof callId === "string" && !hasHostAccess() &&
        !(accountRole === "user" && event.data?.fromHost === true)) {
        if (hostChecking && approvedHost(hostAccount)) {
          // A replayed ring can beat the reconnect approval read. Revalidate it
          // before showing it, without treating temporary uncertainty as a decline.
          const version = epoch;
          void requireApprovedHost().then(() => {
            if (current(version) && hasHostAccess() && !cancelledCalls.has(callId)) { holdCallActivity(callId); emit(event as AppMessage); }
          }).catch(() => {
            if (current(version) && !hostChecking && !approvedHost(hostAccount)) void api.declineCall(callId).catch(() => {});
          });
          return;
        }
        void api.declineCall(callId).catch(() => {}); return;
      }
      // A host's targets belong to the call on screen; a late update from an earlier call is dropped.
      if (event.type === "call.targets" && callId !== activeCall) return;
      if (event.type === "call.ended" && typeof callId === "string") {
        rememberCancelledCall(callId);
        if (callId === activeCall) { activeCall = undefined; activeHostCall = false; callGeneration++; }
        finishCallActivity(callId);
        void refreshCalls();
      }
      if (event.type === "call.connected" && typeof callId === "string") {
        if (event.data?.initiator === false && !hasHostAccess() && !(hostChecking && activeHostCall && activeCall === callId) &&
          !(accountRole === "user" && answeredHostCall === callId)) {
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
        holdCallActivity(callId, event.data?.initiator === true ? pendingOutgoing?.activity : undefined);
      }
      if (event.type === "call.incoming" && typeof callId === "string") holdCallActivity(callId);
      if (event.type === "stream.ended" && event.data?.streamId === activeStream?.id) activeStream = undefined;
      if (event.type === "home.updated") invalidateHome();
      if (event.type === "realtime.status" && event.data?.connected === true && !liveOnboarding) {
        const reconnecting = connectedBefore;
        connectedBefore = true;
        if (activeStream) quietly(loadStreamRequests(activeStream.id), "stream.requests.load");
        // loadLists already owns the initial snapshot. Reconnects revalidate it.
        if (reconnecting) invalidateHome();
        quietly(loadChats(), "chats.reload");
        quietly(loadProfileSettings(), "profile.settings.load");
        quietly(loadThemes(), "themes.load");
        void loadAds();
      }
      emit(event as AppMessage);
    }, accountId, appActive && !liveOnboarding);
    if (!onboarding) { void loadLists(); void restorePendingPurchases(); }
    void flushStreamLink(); flushPushOpen();
  };
  const unsubscribe = onSessionExpired(() => {
    resetUpdateActivities();
    sessionAvailable = false;
    accountRole = undefined; chatPeers.clear(); threadPermissions.clear();
    epoch++; callGeneration++; pendingOutgoing = undefined; verifyCall = undefined; stopLive(); activeCall = undefined; activeStream = undefined; homeQuery = { mode: "popular" }; resetHomeReads(); notificationQueryOwner = undefined; pendingPurchases.clear(); externalCoinCheckouts.clear();
    hostRevision++; hostChecking = false; hostAccount = undefined; hostStatus = undefined; activeHostCall = false;
    void forgetAccountTheme();
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
      if (!token) { void forgetAccountTheme(); emit({ type: "session.none", data: {} }); return; }
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
    } finally { restoring = false; void flushStreamLink(); flushPushOpen(); }
  };

  async function handle(msg: WebMessage) {
    const version = epoch;
    // Keep end/leave available to clean up a room from an older app session.
    // All other streaming actions are denied here even if stale web UI sends one.
    if (!LIVE_STREAMING_ENABLED && ((msg.type.startsWith("stream.") && msg.type !== "stream.end" && msg.type !== "stream.leave") ||
      (msg.type === "gift.send" && msg.data.streamId))) {
      throw new ApiError("Live streaming is unavailable for now. You can still connect in a 1:1 call.", 403, "LIVE_STREAMING_DISABLED");
    }
    switch (msg.type) {
      case "ready":
        webReady = !msg.data.demo;
        if (webReady) {
          const connection = getConnectionStatus();
          if (connection) emit({ type: "connection.status", data: connection });
          void loadDefaultTheme().catch(() => {}); await restoreSession();
        }
        return;
      case "connection.check": await checkConnection(); return;
      case "wallet.load": return refreshWallet();
      case "transactions.load": return readResource("transactions", () => api.transactions(), data => emit({ type: "data.transactions", data }));
      case "referral.load": return readResource("referral", () => api.referral(), data => emit({ type: "data.referral", data }));
      case "referral.apply": {
        const { code, requestId } = msg.data;
        const data = await api.applyReferral(code);
        if (!current(version)) return;
        emit({ type: "referral.applied", data: { ...data, requestId } });
        // The friend bonus is already in the wallet.
        quietly(refreshWallet(), "wallet.load");
        return;
      }
      // Opened from Settings, the Home pop-up or the in-call card: the call keeps running under the share sheet.
      case "referral.share": {
        const data = await api.referral();
        if (!current(version)) return;
        emit({ type: "data.referral", data });
        const bonus = data.friendBonusCoins.toLocaleString("en-IN");
        await Share.share({ title: "BinzoLive", message: `Join me on BinzoLive! Use my code ${data.code} when you sign up and get ${bonus} free coins.${data.shareUrl ? ` ${data.shareUrl}` : ""}` });
        return;
      }
      case "leaderboard.load": {
        const period = (["daily", "weekly", "all"] as const).find(value => value === msg.data?.period) ?? "daily";
        return readResource("leaderboard", () => api.leaderboard(period), data => emit({ type: "data.leaderboard", data }));
      }
      case "session.resume": return restoreSession();
      case "data.reload": if (await getToken()) await loadLists(); return;
      case "push.enable": if (sessionAvailable && pushSession === getSessionVersion()) await syncPush("settings"); return;
      case "notifications.open": {
        const target = notificationTargetFrom({ ...msg.data, recipientId: accountId });
        if (target && sessionAvailable && !liveOnboarding) { pushOpenPending = target;pushOpenRevision++;await flushPushOpen(); }
        return;
      }
      case "home.reload": return loadHome(msg.data);
      case "hosts.search": {
        const q = msg.data.q, page = msg.data.page ?? 1;
        return readResource("search", () => api.home({ q, mode: "popular", page }), data => { rememberHomePeers(data); emit({ type: "data.search", data: { q, hosts: data.hosts, total: data.total, page: data.page } }); }, { q, page });
      }
      case "notifications.load": {
        const { requestId, ...query } = msg.data;
        return loadNotifications(Object.keys(query).length ? query : undefined, requestId, requestId !== undefined || Object.keys(query).length > 0);
      }
      case "notifications.read": return msg.data.requestId === undefined
        ? readResource("notifications", () => api.readNotifications(msg.data.ids), data => emit({ type: "data.notifications", data }))
        : updateNotifications({ ids: msg.data.ids, read: true }, msg.data.requestId);
      case "notifications.unread": return updateNotifications({ ids: msg.data.ids, read: false }, msg.data.requestId);
      case "notifications.readAll": return updateNotifications({ all: true, read: true }, msg.data.requestId);
      case "official.load": return loadOfficial(msg.data.page ?? 1, msg.data.requestId);
      case "official.read": {
        const { requestId, ...input } = msg.data;
        return readOfficial(input, requestId);
      }
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
            rememberTheme(catalog);
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
      case "profile.load": return loadPublicProfile(msg.data.id, msg.data.requestId);
      case "profile.posts.load": return loadPublicPosts(msg.data.id, msg.data.page, msg.data.requestId);
      case "relationships.load": return loadRelationships(msg.data.kind, msg.data.page ?? 1, msg.data.requestId);
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
        const activity = holdUpdateActivity("call", "match"), sessionVersion = getSessionVersion();
        try { const data = await api.matchHost(msg.data.category); if (current(version) && sessionVersion === getSessionVersion()) emit({ type: "call.matched", data }); }
        catch (error) { if (current(version)) operationError(error, msg.type); }
        finally { activity.finish(); }
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
        quietly(loadHome({ ...homeQuery, page: 1 }, true), "home.reload");
        return;
      }
      case "stream.share": {
        if (!sessionAvailable || !getCachedToken() || activeStream?.id !== msg.data.streamId) throw new ApiError("Open this live room before sharing it.", 409);
        const url = `binzolive://live/${msg.data.streamId}`;
        emit({ type: "stream.shareLink", data: { streamId: msg.data.streamId, url } });
        await Share.share({ title: "BinzoLive", message: `Join this live on BinzoLive: ${url}` });
        return;
      }
      case "stream.leave": case "stream.end": {
        if (pendingStreamAccept?.streamId === msg.data.streamId) callGeneration++;
        if (msg.type === "stream.end") await api.endStream(msg.data.streamId); else await api.leaveStream(msg.data.streamId);
        if (current(version)) {
          if (activeStream?.id === msg.data.streamId) activeStream = undefined;
          emit({ type: "stream.closed", data: { streamId: msg.data.streamId } });
          quietly(loadHome({ ...homeQuery, page: 1 }, true), "home.reload");
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
      case "payments.routes.load": {
        const sessionVersion = getSessionVersion(), document = documentRevision, revision = ++paymentRoutesRevision, owner = accountId;
        const applicable = () => current(version) && sessionVersion === getSessionVersion() && document === documentRevision && revision === paymentRoutesRevision && owner === accountId;
        try {
          const routes = await api.paymentRoutes();
          if (applicable()) emit({ type: "payments.routes", data: { ...routes, requestId: msg.data.requestId } });
        } catch (error) { if (applicable()) operationError(error, msg.type, { requestId: msg.data.requestId }); }
        return;
      }
      case "wallet.checkout": case "themes.premium.checkout": {
        const kind: PurchaseKind = msg.type === "themes.premium.checkout" ? "premium" : "coins", sessionVersion = getSessionVersion(), owner = accountId;
        const activity = purchaseActivity(kind, msg.data.idempotencyKey);
        const checkoutGeneration = ++activity.generation;
        activity.inFlight++;
        let retained = !!activity.orderId;
        try {
        const result = await (msg.type === "wallet.checkout" ? api.checkout(msg.data.packId, msg.data.idempotencyKey, msg.data.route) : api.checkoutPremium(msg.data.idempotencyKey, msg.data.route));
        const purchase = { ...result, idempotencyKey: msg.data.idempotencyKey, ...(msg.data.route ? { requestedRoute: msg.data.route } : {}), ...(msg.type === "wallet.checkout" ? { packId: msg.data.packId } : {}) };
        if (!current(version) || sessionVersion !== getSessionVersion()) return;
        if (purchase.status === "PENDING" && purchase.merchantOrderId) {
          activity.orderId = purchase.merchantOrderId; retained = true;
          expirePurchaseActivity(activity, purchase.expiresAt);
          const pending = { orderId: purchase.merchantOrderId, kind, idempotencyKey: purchase.idempotencyKey, ...(purchase.requestedRoute ? { requestedRoute: purchase.requestedRoute } : {}), ...(msg.type === "wallet.checkout" ? { packId: msg.data.packId } : {}) };
          pendingPurchases.set(purchase.merchantOrderId, { ...pending, epoch: version, sessionVersion });
          if (owner) await rememberPendingPayment(owner, pending);
        } else if (purchase.merchantOrderId) {
          pendingPurchases.delete(purchase.merchantOrderId);
          if (owner) void forgetPendingPayment(owner, purchase.merchantOrderId);
        }
        if (!current(version) || sessionVersion !== getSessionVersion() || activity.dismissed) return;
        // Deliver the owned order before opening a provider app. A failed launch
        // or app restart can then resume exactly this checkout without paying twice.
        emit({ type: kind === "premium" ? "themes.premium.checkout" : "wallet.checkout", data: purchase });
        if (purchase.status !== "PENDING") {
          retained = false;
          if (kind === "premium") quietly(loadThemes(), "themes.load"); else quietly(refreshWallet(), "wallet.load");
        }
        // Payment pages stay outside the privileged application WebView.
        if (purchase.status === "PENDING" && purchase.paymentUrl) {
          const external: CoinReturn | undefined = kind === "coins" ? { payment: { orderId: purchase.merchantOrderId, kind, packId: purchase.packId, idempotencyKey: purchase.idempotencyKey }, owner, epoch: version, sessionVersion, document: documentRevision, departed: !appActive, settling: false, activity, generation: checkoutGeneration } : undefined;
          if (external) externalCoinCheckouts.set(purchase.merchantOrderId, external);
          try { await Linking.openURL(purchase.paymentUrl); }
          catch {
            if (external) await coinPaymentReturned(external);
            else throw new ApiError("Couldn't open the payment app. Continue this checkout or check its status.", 0, "PAYMENT_OPEN_FAILED");
          }
        }
        return;
        } finally {
          activity.inFlight--;
          if (!retained || activity.dismissed || !purchaseActivityCurrent(activity)) finishPurchaseActivity(activity);
        }
      }
      case "wallet.verify": return verifyPurchase(msg.data.merchantOrderId);
      case "themes.premium.verify": return verifyPurchase(msg.data.merchantOrderId, "premium");
      case "payments.checkout.closed": {
        for (const activity of purchaseActivities) if (purchaseActivityCurrent(activity) && activity.kind === msg.data.kind &&
          (!msg.data.merchantOrderId || activity.orderId === msg.data.merchantOrderId) &&
          (!msg.data.idempotencyKey || activity.attempt === msg.data.idempotencyKey)) { activity.uiClosed = true; finishPurchaseActivity(activity); }
        return;
      }
      case "auth.sendOtp": {
        if (authWork.has("send")) return;
        authWork.add("send");
        try {
          const result = await api.sendOtp(msg.data.phone, msg.data.role, msg.data.dialCode);
          if (current(version)) emit({ type: "auth.otpSent", data: { phone: msg.data.phone, resendAfter: result.resendAfter, expiresIn: result.expiresIn, otpLength: result.otpLength, requestId: msg.data.requestId } });
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
          const session = await api.verifyOtp(msg.data.phone, msg.data.code, msg.data.role, msg.data.signup, msg.data.dialCode);
          if (!current(version) || getSessionVersion() !== sessionVersion) return;
          if (!await setSessionTokens(session.tokens, sessionVersion)) return;
          if (!current(version)) return;
          resetUpdateActivities(); epoch++; callGeneration++; pendingOutgoing = undefined; verifyCall = undefined; activeCall = undefined; notificationQueryOwner = undefined; pendingPurchases.clear(); externalCoinCheckouts.clear(); chatPeers.clear(); threadPermissions.clear(); // Retire work and socket callbacks owned by the previous identity.
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
      case "auth.emailCheck": {
        const { email, requestId } = msg.data, sessionVersion = getSessionVersion();
        try {
          const available = await api.emailAvailable(email);
          if (current(version) && sessionVersion === getSessionVersion()) emit({ type: "auth.emailChecked", data: { email, requestId, available } });
        } catch (error) {
          if (current(version) && sessionVersion === getSessionVersion()) {
            emit({ type: "auth.emailChecked", data: { email, requestId, message: errorMessage(error), ...(error instanceof ApiError ? { code: error.code, status: error.status } : {}) } });
          }
        }
        return;
      }
      case "auth.logout": {
        pushOpenPending = undefined;pushOpenRevision++;
        resetUpdateActivities();
        sessionAvailable = false; pendingStreamLink = undefined; linkRevision++;
        accountRole = undefined; chatPeers.clear(); threadPermissions.clear();
        const logoutEpoch = ++epoch;
        callGeneration++; pendingOutgoing = undefined; verifyCall = undefined; stopLive(); activeCall = undefined; activeStream = undefined; homeQuery = { mode: "popular" }; resetHomeReads(); notificationQueryOwner = undefined; pendingPurchases.clear(); externalCoinCheckouts.clear();
        const token = getCachedToken();
        const clearing = clearToken();
        const clearedVersion = getSessionVersion();
        accountId = undefined; hostStatus = undefined;
        hostRevision++; hostChecking = false; hostAccount = undefined; activeHostCall = false;
        void forgetAccountTheme();
        clearDeliveredPush();
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
      case "account.deactivate": {
        const sessionVersion = getSessionVersion();
        try {
          await api.deactivateAccount();
          if (current(version) && sessionVersion === getSessionVersion()) {
            emit({ type: "account.deactivated", data: { requestId: msg.data.requestId } });
            await handle({ type: "auth.logout", data: {} });
          }
        } catch (error) {
          if (current(version) && sessionVersion === getSessionVersion()) emit({ type: "account.deactivate.error", data: { message: errorMessage(error), requestId: msg.data.requestId } });
        }
        return;
      }
      case "profile.cover.save": {
        const sessionVersion = getSessionVersion(), document = documentRevision, owner = accountId;
        const applicable = () => current(version) && sessionVersion === getSessionVersion() && document === documentRevision && owner === accountId;
        if (!owner) { emit({ type: "profile.cover.error", data: { message: "Sign in before changing your cover photo.", requestId: msg.data.requestId } }); return; }
        const retireProfileReads = () => {
          readRequests.set("profileSettings", (readRequests.get("profileSettings") ?? 0) + 1);
        };
        const recoverProfileReads = () => {
          quietly(loadProfileSettings(), "profile.settings.load");
        };
        let revision = hostRevision;
        const finishProfileWrite = beginProfileWrite();
        retireProfileReads();
        try {
          let account = await api.saveCoverPhoto(msg.data.photo);
          while (applicable() && revision !== hostRevision) {
            revision = hostRevision; account = await api.me(true);
          }
          if (!applicable()) return;
          if (account.user.id !== owner) throw new ApiError("Your sign-in changed. Please try again.", 409);
          retireProfileReads();
          const authorityChanged = hostChecking || hasHostAccess() !== approvedHost(account) ||
            hostStatus !== account.user.hostStatus || accountRole !== (account.user.serverRole ?? (account.user.role === "host" ? "host" : "user"));
          applyHostAccount(account, false);
          if (authorityChanged) publishHostAccess();
          emit({ type: "profile.cover.saved", data: { account, requestId: msg.data.requestId } });
          recoverProfileReads();
          if (account.user.serverRole === "host" || account.user.role === "host")
            quietly(loadHome({ ...homeQuery, page: 1 }, true), "home.reload");
        } catch (error) {
          if (!applicable()) return;
          retireProfileReads();
          emit({ type: "profile.cover.error", data: { message: errorMessage(error), requestId: msg.data.requestId } });
          recoverProfileReads();
        } finally {
          finishProfileWrite();
        }
        return;
      }
      case "creator.card.save": {
        const sessionVersion = getSessionVersion(), document = documentRevision, owner = accountId;
        const applicable = () => current(version) && sessionVersion === getSessionVersion() && document === documentRevision && owner === accountId;
        const finishProfileWrite = beginProfileWrite();
        try {
          const approval = await requireApprovedHost();
          if (!applicable()) return;
          const account = await api.saveCreatorCard(msg.data.photo);
          if (applicable() && approval === hostRevision && hasHostAccess()) {
            if (account.user.id !== owner) throw new ApiError("Your sign-in changed. Please try again.", 409);
            applyHostAccount(account, false);
            emit({ type: "creator.card.saved", data: { account, requestId: msg.data.requestId } });
            quietly(loadHome({ ...homeQuery, page: 1 }, true), "home.reload");
          }
        } catch (error) {
          if (applicable()) emit({ type: "creator.card.error", data: { message: errorMessage(error), requestId: msg.data.requestId } });
        } finally {
          finishProfileWrite();
        }
        return;
      }
      case "profile.save": {
        const { onboarding, requestId, ...profile } = msg.data;
        const id = typeof requestId === "number" ? requestId : undefined;
        const sessionVersion = getSessionVersion();
        const document = documentRevision;
        const applicable = () => current(version) && sessionVersion === getSessionVersion() && document === documentRevision;
        let revision = hostRevision;
        const finishProfileWrite = beginProfileWrite();
        // A summary fetched before this edit must not repaint old profile fields.
        readRequests.set("profileSettings", (readRequests.get("profileSettings") ?? 0) + 1);
        try {
          let account = await api.saveProfile(profile, (done, total) => {
            if (applicable()) emit({ type: "profile.progress", data: { done, total, requestId: id } });
          });
          while (applicable() && revision !== hostRevision) {
            revision = hostRevision; account = await api.me(true);
          }
          if (applicable()) {
            // Also retire summary reads started while the profile write was pending.
            readRequests.set("profileSettings", (readRequests.get("profileSettings") ?? 0) + 1);
            applyHostAccount(account, false);
            emit({ type: "profile.saved", data: { onboarding: onboarding === true, account, requestId: id } });
            if (onboarding) {
              liveOnboarding = account.requiresOnboarding === true;
              stopLive.setActive?.(appActive && !liveOnboarding);
              void loadLists();
              void flushStreamLink(); flushPushOpen();
            }
            else quietly(loadProfileSettings(), "profile.settings.load");
          }
        } catch (error) {
          if (applicable()) {
            emit({ type: "profile.error", data: { onboarding: onboarding === true, message: errorMessage(error), requestId: id, ...(error instanceof ApiError && error.code ? { code: error.code } : {}) } });
            // The retired read cannot settle its skeleton; recover current data.
            quietly(loadProfileSettings(), "profile.settings.load");
          }
        } finally {
          finishProfileWrite();
        }
        return;
      }
      case "media.post.create": {
        if (publishingAt === version) return;
        publishingAt = version;
        try {
          const approval = await requireApprovedHost(true), member = accountRole === "user";
          const post = await api.createPost(msg.data.photo, msg.data.caption);
          if (current(version) && approval === hostRevision && (member || hasHostAccess())) emit({ type: "post.saved", data: { post, requestId: msg.data.requestId } });
        } catch (error) {
          if (current(version)) emit({ type: "post.error", data: { message: errorMessage(error), requestId: msg.data.requestId } });
        } finally { if (publishingAt === version) publishingAt = undefined; }
        return;
      }
      case "post.like": {
        const { id, liked, requestId } = msg.data;
        try {
          const result = await api.likePost(id, liked);
          if (current(version)) emit({ type: "post.liked", data: { id, ...result, requestId } });
        } catch (error) {
          if (current(version)) emit({ type: "post.like.error", data: { id, liked, message: errorMessage(error), requestId } });
        }
        return;
      }
      case "post.comments.load": {
        const { id, page = 1, requestId } = msg.data;
        try {
          const data = await api.postComments(id, page);
          if (current(version)) emit({ type: "data.postComments", data: { ...data, requestId } });
        } catch (error) {
          if (current(version)) emit({ type: "post.comments.error", data: { id, page, message: errorMessage(error), requestId } });
        }
        return;
      }
      case "post.comment.add": {
        const { id, text, requestId } = msg.data;
        try {
          const comment = await api.addPostComment(id, text);
          if (current(version)) emit({ type: "post.comment.saved", data: { id, comment, requestId } });
        } catch (error) {
          if (current(version)) emit({ type: "post.comment.error", data: { id, message: errorMessage(error), requestId } });
        }
        return;
      }
      case "post.comment.delete": {
        const { id, commentId, requestId } = msg.data;
        try {
          await api.deletePostComment(id, commentId);
          if (current(version)) emit({ type: "post.comment.deleted", data: { id, commentId, requestId } });
        } catch (error) {
          if (current(version)) emit({ type: "post.comment.delete.error", data: { id, commentId, message: errorMessage(error), requestId } });
        }
        return;
      }
      case "media.post.delete": {
        try {
          await api.deletePost(msg.data.id);
          if (current(version)) emit({ type: "post.deleted", data: msg.data });
        } catch (error) {
          if (current(version)) emit({ type: "post.delete.error", data: { ...msg.data, message: errorMessage(error) } });
        }
        return;
      }
      case "agency.load": case "agency.verify": case "agency.join": {
        const requestId = msg.data.requestId;
        const document = documentRevision, sessionVersion = getSessionVersion();
        const relevant = () => current(version) && document === documentRevision && sessionVersion === getSessionVersion();
        try {
          const data = msg.type === "agency.load" ? await api.hostAgency() : msg.type === "agency.verify" ? await api.verifyAgencyCode(msg.data.agencyCode) : await api.joinAgency(msg.data.agencyCode);
          if (relevant()) emit({ type: msg.type === "agency.load" ? "agency.loaded" : msg.type === "agency.verify" ? "agency.verified" : "agency.joined", data: { ...data, requestId } });
          if (msg.type === "agency.join" && relevant()) void refreshHostAccount().catch(() => {});
        } catch (error) {
          if (relevant()) emit({ type: "agency.error", data: { action: msg.type, message: errorMessage(error), requestId } });
        }
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
        if (current(version) && (!msg.data.online || (approval === hostRevision && hasHostAccess()))) { emit({ type: "presence.saved", data }); quietly(loadHome({ ...homeQuery, page: 1 }, true), "home.reload"); }
        return;
      }
      case "presence.duringCalls": {
        const data = await api.setVisibleDuringCalls(msg.data.on);
        if (current(version)) emit({ type: "presence.duringCalls.saved", data });
        return;
      }
      case "host.callStatus.load": {
        const data = await api.hostCallStatus();
        if (current(version)) emit({ type: "host.callStatus", data });
        return;
      }
      case "profile.settings.save": case "settings.set": {
        const { requestId, ...patch } = msg.data;
        const sessionVersion = getSessionVersion();
        const document = documentRevision;
        const finishProfileWrite = beginProfileWrite();
        try {
          const settings = await api.saveProfileSettings(patch);
          if (current(version) && sessionVersion === getSessionVersion() && document === documentRevision) {
            deliverProfileSettings(settings);
            emit({ type: "profile.settings.saved", data: { settings: withPushStatus(settings), requestId } });
          }
        } catch (error) {
          if (current(version) && sessionVersion === getSessionVersion() && document === documentRevision) emit({ type: "profile.settings.error", data: { message: errorMessage(error), requestId } });
        } finally {
          finishProfileWrite();
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
            quietly(loadHome({ ...homeQuery, page: 1 }, true), "home.reload");
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
            quietly(loadHome({ ...homeQuery, page: 1 }, true), "home.reload");
          }
        } catch (error) {
          if (current(version) && sessionVersion === getSessionVersion()) emit({ type: "block.error", data: { id, blocked, message: errorMessage(error), requestId } });
        }
        return;
      }
      case "follow.set": {
        const { id, on, requestId } = msg.data, sessionVersion = getSessionVersion();
        try {
          const result = await api.follow(id, on);
          if (current(version) && sessionVersion === getSessionVersion()) {
            publicFollows.set(id, { on: result.following, revision: (publicFollows.get(id)?.revision ?? 0) + 1, sessionVersion });
            emit({ type: "follow.saved", data: { id, on: result.following, requestId } });
            quietly(loadProfileSettings(), "profile.settings.load");
            quietly(loadHome({ ...homeQuery, page: 1 }, true), "home.reload");
          }
        } catch (error) {
          if (current(version) && sessionVersion === getSessionVersion()) emit({ type: "follow.error", data: { id, on, message: errorMessage(error), requestId } });
        }
        return;
      }
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
        setChatActivity(withId, true);
        threadPermissions.delete(withId);
        const read = readResource("thread", async () => {
          await requireChatPair(withId);
          if (!current(version)) throw new ApiError("Your sign-in changed. Please try again.", 409);
          const revision = hostRevision, data = msg.data.knownIds?.length ? await api.thread(withId, msg.data.knownIds) : await api.thread(withId);
          if (revision !== hostRevision) throw new ApiError("Your account permissions changed. Open the conversation again.", 403);
          return data;
        }, data => {
          rememberThreadPermission(withId, data);
          emit({ type: "data.thread", data: { with: withId, ...data } });
          // Only the messages returned by this page are marked read by the server.
          // Reload its counts instead of incorrectly clearing the entire conversation.
          quietly(loadChats(), "chats.reload");
        }, msg.data.background ? { background: true } : {});
        return msg.data.background ? read.catch(() => {}) : read;
      }
      case "chat.activity": setChatActivity(msg.data.with, msg.data.active); return;
      case "chat.send": {
        const callId = msg.data.inCall ? activeCall : undefined;
        if (msg.data.inCall && !callId) throw new ApiError("Your call has ended. Open the conversation to send a message.", 409);
        if (callId) {
          await requireChatPair(msg.data.to);
          if (!current(version)) return;
          if (activeCall !== callId) throw new ApiError("Your call has ended. Open the conversation to send a message.", 409);
        } else if (!(await requireThreadSend(msg.data.to, version))) return;
        // The server verifies that this accepted call belongs to both users;
        // an in-call reply need not wait for a preexisting text conversation.
        // The screen learns the message's server ID (for reply, edit and delete) and the text as delivered.
        const delivered = msg.data.clientId ? await api.sendMessage(msg.data.to, msg.data.text, callId, msg.data.replyTo, msg.data.clientId) : await api.sendMessage(msg.data.to, msg.data.text, callId, msg.data.replyTo);
        if (current(version) && typeof delivered?.text === "string")
          emit({ type: "chat.sent", data: { to: msg.data.to, sent: msg.data.text, text: delivered.text, id: delivered.id, inCall: !!msg.data.inCall, reply: delivered.reply ?? null, ...(msg.data.clientId ? { clientId: msg.data.clientId } : {}), ...(delivered.createdAt ? { createdAt: delivered.createdAt } : {}), ...(delivered.sequence !== undefined ? { sequence: delivered.sequence } : {}) } });
        if (current(version)) quietly(loadChats(), "chats.reload");
        return;
      }
      case "chat.photo": {
        if (!(await requireThreadSend(msg.data.to, version))) return;
        const sent = msg.data.clientId ? await api.sendPhotoMessage(msg.data.to, msg.data.photo, msg.data.replyTo, msg.data.clientId) : await api.sendPhotoMessage(msg.data.to, msg.data.photo, msg.data.replyTo);
        if (current(version)) { emit({ type: "chat.photoSent", data: { to: msg.data.to, id: sent?.id ?? "", reply: sent?.reply ?? null, ...(msg.data.clientId ? { clientId: msg.data.clientId } : {}), ...(sent?.createdAt ? { createdAt: sent.createdAt } : {}), ...(sent?.sequence !== undefined ? { sequence: sent.sequence } : {}) } }); quietly(loadChats(), "chats.reload"); }
        return;
      }
      case "app.exit.request": return; // The native shell owns exit confirmation.
      case "app.launched": return; // The native shell owns the launch screen.
      case "chat.photoViewer": return; // Accepted for compatibility; the page owns Back navigation.
      case "chat.photoDownload": {
        const { to, id, requestId } = msg.data;
        const sessionVersion = getSessionVersion(), revision = documentRevision;
        const applicable = () => current(version) && sessionVersion === getSessionVersion() && revision === documentRevision;
        const key = `${version}:${sessionVersion}:${revision}:${to}:${id}`;
        let work = photoDownloads.get(key);
        if (!work) {
          work = downloadChatPhoto(to, id, applicable);
          photoDownloads.set(key, work);
        }
        try {
          await work;
          if (applicable()) emit({ type: "chat.photoDownloaded", data: { to, id, requestId } });
        } catch (error) {
          if (applicable()) operationError(error, msg.type, { to, id, requestId });
        } finally {
          if (photoDownloads.get(key) === work) photoDownloads.delete(key);
        }
        return;
      }
      case "chat.voice": {
        if (!(await requireThreadSend(msg.data.to, version))) return;
        const message = await api.sendVoiceMessage(msg.data.to, msg.data.audio, msg.data.durationMs, msg.data.clientId, msg.data.replyTo);
        if (current(version)) { emit({ type: "chat.voiceSent", data: { to: msg.data.to, clientId: msg.data.clientId, message } }); quietly(loadChats(), "chats.reload"); }
        return;
      }
      case "chat.edit": {
        await requireChatPair(msg.data.to);
        if (!current(version)) return;
        const updated = await api.editMessage(msg.data.to, msg.data.id, msg.data.text);
        if (current(version)) { emit({ type: "chat.updated", data: { with: msg.data.to, message: messageFrom(updated, accountId ?? "") } }); quietly(loadChats(), "chats.reload"); }
        return;
      }
      case "chat.delete": {
        // Deleting your own words never waits on chat permission: it works even after a block.
        const result = await api.deleteMessage(msg.data.to, msg.data.id, msg.data.everyone);
        if (!current(version)) return;
        emit(msg.data.everyone ? { type: "chat.updated", data: { with: msg.data.to, message: messageFrom(result, accountId ?? "") } } : { type: "chat.removed", data: { id: msg.data.id } });
        quietly(loadChats(), "chats.reload");
        return;
      }
      case "gift.send": {
        const sessionVersion = getSessionVersion();
        const receipt = await api.sendGift(msg.data.to, msg.data.gift, msg.data.coins, msg.data.inCall ? activeCall : undefined, msg.data.streamId, msg.data.idempotencyKey);
        if (current(version) && sessionVersion === getSessionVersion()) {
          emit({ type: "gift.sent", data: { to: msg.data.to, gift: msg.data.gift, idempotencyKey: msg.data.idempotencyKey, id: receipt.id, coins: receipt.coins, ...(receipt.message !== undefined ? { message: receipt.message } : {}), ...(receipt.giftDetails ? { giftDetails: receipt.giftDetails } : {}) } });
          if (receipt.message) quietly(loadChats(1, true), "chats.reload");
          if (receipt.coins > 0) quietly(refreshWallet(), "wallet.load");
        }
        return;
      }
      case "call.invitation.load": case "call.invitation.dismiss": {
        const document = documentRevision, sessionVersion = getSessionVersion();
        const relevant = () => current(version) && document === documentRevision && sessionVersion === getSessionVersion();
        try {
          const invitation = msg.type === "call.invitation.load" ?
            (!appActive || liveOnboarding || accountRole !== "user" ? null : await api.automaticCallInvitation(!!msg.data.active)) : await api.dismissAutomaticInvitation(msg.data.id);
          if (msg.type === "call.invitation.load" && msg.data.active && relevant()) await refreshWallet();
          if (relevant()) emit({ type: msg.type === "call.invitation.load" ? "call.invitation.loaded" : "call.invitation.dismissed", data: { invitation, requestId: msg.data.requestId } });
        } catch (error) { if (relevant()) emit({ type: "call.invitation.error", data: { requestId: msg.data.requestId, message: errorMessage(error), ...(error instanceof ApiError && error.code ? { code: error.code } : {}) } }); }
        return;
      }
      case "call.targets.load": case "call.targets.set": {
        const { callId, ...targets } = msg.data;
        if (callId !== activeCall) return;
        try {
          const result = msg.type === "call.targets.load" ? await api.callTargets(callId) : await api.setCallTargets(callId, targets as import("./api/types").CallTargetsInput);
          if (msg.type === "call.targets.load" && result && current(version) && callId === activeCall) emit({ type: "call.targets", data: result });
        } catch { /* Targets only encourage gifts; the call carries on without them. */ }
        return;
      }
      case "call.topup.hold": case "call.topup.review": {
        const document = documentRevision, sessionVersion = getSessionVersion();
        const relevant = () => current(version) && document === documentRevision && sessionVersion === getSessionVersion();
        try {
          if (accountRole !== "user" || !appActive) throw new ApiError("Return to the incoming call to continue.", 409);
          if (msg.type === "call.topup.hold") {
            const held = await api.holdIncomingForTopup(msg.data.callId);
            if (relevant()) emit({ type: "call.topup.held", data: { ...held, requestId: msg.data.requestId } });
          } else {
            const review = await api.reviewIncomingTopup(msg.data.callId);
            if (relevant()) { await refreshWallet(); if (relevant()) emit({ type: "call.topup.reviewed", data: { ...review, requestId: msg.data.requestId } }); }
          }
        } catch (error) {
          if (relevant() && error instanceof ApiError && error.code === "TOPUP_NOT_REQUIRED") {
            // A stale low balance must recover to explicit Accept without opening checkout.
            try { await refreshWallet(); } catch { /* The original refusal remains useful if the wallet is temporarily unavailable. */ }
          }
          if (relevant()) emit({ type: "call.topup.error", data: { callId: msg.data.callId, requestId: msg.data.requestId, message: errorMessage(error) } });
        }
        return;
      }
      case "call.start": case "call.invitation.connect": {
        const automatic = msg.type === "call.invitation.connect";
        if (automatic && (!appActive || accountRole !== "user" || liveOnboarding || activeCall || pendingOutgoing || verifyCall || callActivities.size)) {
          emit({ type: "call.failed", data: { message: "Finish your current activity before connecting this invitation.", invitationId: msg.data.id, requestId: msg.data.requestId } }); return;
        }
        const intent = { generation: ++callGeneration, callId: undefined as string | undefined, activity: holdUpdateActivity("call", "outgoing") }, sessionVersion = getSessionVersion();
        pendingOutgoing = intent;
        try {
          let result: { callId: string; to: string; voice: boolean; connected: boolean; rate?: number; entryFee?: number };
          if (msg.type === "call.start") {
            const { to, voice } = msg.data;
            result = { ...await api.startCall(to, !!voice), to, voice: !!voice, connected: false };
          } else result = await api.connectAutomaticInvitation(msg.data.id, msg.data.expectedCoinsPerMinute, msg.data.expectedEntryFeeCoins);
          if (!current(version) || sessionVersion !== getSessionVersion() || intent.generation !== callGeneration || cancelledCalls.has(result.callId)) {
            try { await endCancelledCall(result.callId, sessionVersion); } finally { intent.activity.finish(); }
            return;
          }
          activeCall = result.callId;
          holdCallActivity(result.callId, intent.activity);
          emit({ type: "call.created", data: { callId: activeCall, to: result.to, voice: result.voice, ...(msg.type === "call.invitation.connect" ? { invitationId: msg.data.id, requestId: msg.data.requestId } : {}) } });
          if (result.connected && intent.callId !== result.callId) emit({ type: "call.connected", data: { ...result, initiator: true, peerId: result.to } });
        } catch (error) {
          if (current(version) && intent.generation === callGeneration) {
            emit({ type: "call.failed", data: { message: errorMessage(error), ...(error instanceof ApiError && error.code ? { code: error.code } : {}), ...(error instanceof ApiError && error.requiredCoins ? { requiredCoins: error.requiredCoins } : {}), ...(msg.type === "call.invitation.connect" ? { invitationId: msg.data.id, requestId: msg.data.requestId } : {}) } });
            if (error instanceof ApiError && error.code === "INSUFFICIENT_COINS") quietly(refreshWallet(), "wallet.load");
          }
        }
        finally { if (![...callActivities.values()].includes(intent.activity)) intent.activity.finish(); if (pendingOutgoing === intent) pendingOutgoing = undefined; verifyCall = undefined; }
        return;
      }
      case "call.accept": {
        if (cancelledCalls.has(msg.data.callId)) return;
        if (accountRole === "user") return acceptHostCall(msg.data.callId, version);
        holdCallActivity(msg.data.callId);
        const generation = ++callGeneration, sessionVersion = getSessionVersion();
        activeCall = msg.data.callId; activeHostCall = true;
        try {
          const approval = await requireApprovedHost();
          if (generation !== callGeneration || cancelledCalls.has(msg.data.callId)) { finishCallActivity(msg.data.callId); return; }
          const details = await api.acceptCall(msg.data.callId);
          if (!current(version) || sessionVersion !== getSessionVersion() || generation !== callGeneration || cancelledCalls.has(msg.data.callId) || approval !== hostRevision || !hasHostAccess()) {
            try { await endCancelledCall(msg.data.callId, sessionVersion); } finally { finishCallActivity(msg.data.callId); }
            return;
          }
          emit({ type: "call.connected", data: { callId: msg.data.callId, initiator: false, ...details } });
        } catch {
          if (current(version) && generation === callGeneration) {
            activeCall = undefined; activeHostCall = false; rememberCancelledCall(msg.data.callId);
            finishCallActivity(msg.data.callId);
            emit({ type: "call.ended", data: { callId: msg.data.callId } });
          }
        }
        return;
      }
      case "call.decline": {
        rememberCancelledCall(msg.data.callId);
        if (activeCall === msg.data.callId) { activeCall = undefined; activeHostCall = false; callGeneration++; }
        return quietly(api.declineCall(msg.data.callId).finally(() => finishCallActivity(msg.data.callId)), msg.type);
      }
      case "verify.accept": {
        const callId = msg.data.callId, sessionVersion = getSessionVersion(), activity = holdCallActivity(callId);
        verifyCall = { callId, accepted: true };
        try {
          await api.acceptVerificationCall(callId);
          if (current(version) && sessionVersion === getSessionVersion() && verifyCall?.callId === callId) emit({ type: "verify.connected", data: { callId, peerId: VERIFY_PEER, initiator: false, voice: false } });
          else activity.finish();
        } catch (error) {
          if (verifyCall?.callId === callId) verifyCall = undefined;
          finishCallActivity(callId);
          if (current(version)) emit({ type: "verify.ended", data: { callId, status: "unavailable" } });
          throw error;
        }
        return;
      }
      case "verify.end": {
        if (verifyCall?.callId === msg.data.callId) verifyCall = undefined;
        return quietly(api.endVerificationCall(msg.data.callId).finally(() => finishCallActivity(msg.data.callId)), msg.type);
      }
      case "call.end": {
        if (msg.data.callId && msg.data.callId === verifyCall?.callId) {
          const verificationId = msg.data.callId;
          // The call media failed on this device.
          verifyCall = undefined;
          emit({ type: "verify.ended", data: { callId: msg.data.callId, status: "failed" } });
          return quietly(api.endVerificationCall(verificationId).finally(() => finishCallActivity(verificationId)), msg.type);
        }
        const callId = msg.data.callId ?? activeCall;
        if (!msg.data.callId || callId === activeCall || callId === pendingOutgoing?.callId) callGeneration++;
        if (callId) rememberCancelledCall(callId);
        if (callId === activeCall) { activeCall = undefined; activeHostCall = false; }
        if (callId) quietly(api.endCall(callId, msg.data.reason).finally(() => finishCallActivity(callId)), msg.type);
        return;
      }
      case "payout.load": {
        const sessionVersion = getSessionVersion(), document = documentRevision, revision = ++payoutReadRevision;
        const applicable = () => current(version) && sessionVersion === getSessionVersion() && document === documentRevision && revision === payoutReadRevision;
        try {
          // Historical funds and durable recovery remain owned by the account,
          // even when it no longer qualifies to create a new withdrawal.
          const approval = hostRevision, account = await api.me(true);
          if (!applicable()) return;
          const owner = account.user.id;
          if (!owner || (accountId && owner !== accountId)) throw new ApiError("Your sign-in changed. Please try again.", 409);
          if (approval === hostRevision) applyHostAccount(account);
          const pending = await readPendingPayout(owner);
          if (!applicable()) return;
          const result = await api.payouts(msg.data.page);
          if (!applicable()) return;
          const recovered = pending ? result.items.find(item => item.idempotencyKey === pending.idempotencyKey && item.amountPaise === pending.amountPaise && item.payoutAddress.trim() === pending.payoutAddress) : undefined;
          if (recovered && pending) await forgetPendingPayout(owner, pending.idempotencyKey).catch(() => {});
          if (applicable()) emit({ type: "payout.loaded", data: { ...result, requestId: msg.data.requestId, pending: recovered ? null : pending, recovered: recovered ?? null } });
        } catch (error) {
          if (applicable()) emit({ type: "payout.error", data: { action: msg.type, requestId: msg.data.requestId, message: errorMessage(error), ...(error instanceof ApiError ? { code: error.code, status: error.status } : {}) } });
        }
        return;
      }
      case "payout.request": {
        const sessionVersion = getSessionVersion(), document = documentRevision;
        const applicable = () => current(version) && sessionVersion === getSessionVersion() && document === documentRevision;
        let owner: string | undefined;
        let previous: PendingPayout | null = null, saved = false;
        try {
          const approval = hostRevision, account = await api.me(true);
          if (!applicable()) return;
          owner = account.user.id;
          if (!owner || (accountId && owner !== accountId)) throw new ApiError("Your sign-in changed. Please try again.", 409);
          if (approval === hostRevision) applyHostAccount(account);
          previous = await readPendingPayout(owner);
          const attempt = { amountPaise: msg.data.amountPaise, payoutAddress: msg.data.payoutAddress.trim(), idempotencyKey: msg.data.idempotencyKey };
          if (previous && (previous.idempotencyKey !== attempt.idempotencyKey || previous.amountPaise !== attempt.amountPaise || previous.payoutAddress !== attempt.payoutAddress)) {
            throw new ApiError("An earlier withdrawal still needs confirmation. Refresh withdrawal history to recover it before making another request.", 409, "PAYOUT_PENDING_RECOVERY");
          }
          if (!applicable()) return;
          if (!previous && (approval !== hostRevision || !hasHostAccess())) throw new ApiError("Your creator profile needs admin approval before you can withdraw.", 403);
          // Persist the approved intent before any reservation can leave this device.
          await rememberPendingPayout(owner, attempt);
          saved = true;
          // Keep the durable intent if this document retires: another document
          // may already be recovering the same key, and only the server can
          // establish whether it committed. Replaying it is idempotent.
          if (!applicable()) return;
          if (!previous && (approval !== hostRevision || !hasHostAccess())) throw new ApiError("Your creator approval changed. Please try again.", 403);
          const payout = await api.requestPayout(msg.data.amountPaise, msg.data.payoutAddress, msg.data.idempotencyKey);
          // Cleanup remains scoped to its original account/key even after sign-out.
          await forgetPendingPayout(owner, attempt.idempotencyKey).catch(() => {});
          if (!applicable()) return;
          // Confirmation belongs to the completed reservation. A failed independent
          // wallet read must not encourage a second withdrawal with a new key.
          payoutReadRevision++;
          emit({ type: "payout.requested", data: { payout, requestId: msg.data.requestId } });
          quietly(refreshWallet(), "wallet.load");
        } catch (error) {
          // A preexisting attempt may already have committed on another run.
          // Only a first, definitively rejected submission can be discarded.
          if (owner && saved && !previous && error instanceof ApiError && [400, 401, 403, 404, 409, 422].includes(error.status)) {
            await forgetPendingPayout(owner, msg.data.idempotencyKey).catch(() => {});
          }
          if (applicable()) emit({ type: "payout.error", data: { action: msg.type, requestId: msg.data.requestId, idempotencyKey: msg.data.idempotencyKey, message: errorMessage(error), ...(error instanceof ApiError ? { code: error.code, status: error.status } : {}) } });
        }
        return;
      }
      case "awards.claim": {
        const approval = await requireApprovedHost();
        const wallet = await api.claimAward(msg.data.task);
        if (current(version) && approval === hostRevision && hasHostAccess()) { emit({ type: "wallet.balance", data: wallet }); emit({ type: "awards.claimed", data: { task: msg.data.task } }); quietly(loadHome({ ...homeQuery, page: 1 }, true), "home.reload"); }
        return;
      }
      case "ads.load": return loadAds();
      case "ads.impression": {
        // Measurement never interrupts the person. A view the server declines to
        // count (premium, a reached cap, an ended campaign) leaves rotation.
        try {
          const result = await api.adImpression(msg.data.id, msg.data.placement);
          if (current(version) && !result.servable) emit({ type: "ads.retired", data: { id: msg.data.id } });
        } catch { /* A missed view is not worth an error message. */ }
        return;
      }
      case "ads.click": {
        const { id, placement } = msg.data, sessionVersion = getSessionVersion();
        let url: string;
        try {
          url = await api.adClick(id, placement);
        } catch (error) {
          if (current(version) && error instanceof ApiError && error.status === 410) emit({ type: "ads.retired", data: { id } });
          throw error;
        }
        if (!current(version) || sessionVersion !== getSessionVersion()) return;
        emit({ type: "ads.opened", data: { id } });
        await Linking.openURL(url);
        return;
      }
      case "theme": case "ui.haptic": case "screen.secure": return;
    }
  }

  const linkSubscription = Linking.addEventListener("url", event => {
    if (openStreamLink(event.url)) runtimeLinkReceived = true;
  });
  void Linking.getInitialURL().then(url => { if (!runtimeLinkReceived && !closed) openStreamLink(url); }).catch(() => {});
  const stopPush = startPush(data => {
    const target = notificationTargetFrom(data);
    if (!target) return;
    pushOpenPending = target;pushOpenRevision++;void flushPushOpen();
  }, recipientId => sessionAvailable && !!accountId && (!recipientId || recipientId === accountId));
  const stopPushToken = onPushTokenChange(token => {
    if (pushSession === getSessionVersion() && sessionAvailable) void api.registerPushDevice(token).catch(() => {});
  });

  return {
    documentLoading: () => { setChatActivity(); webReady = false; documentRevision++; homeQuery = { mode: "popular" }; resetHomeReads(); notificationQueryOwner = undefined; },
    handle: (msg: WebMessage) => {
      if (closed || !parseWebMessage(JSON.stringify(msg))) return;
      const version = epoch;
      const notificationWrite = (msg.type === "notifications.read" || msg.type === "notifications.unread" || msg.type === "notifications.readAll") && msg.data.requestId !== undefined;
      const serialized = notificationWrite || ((msg.type === "chat.send" || msg.type === "chat.photo") && !!msg.data.clientId) || ["account.deactivate", "creator.card.save", "profile.cover.save", "media.post.delete", "call.start", "call.invitation.connect", "call.invitation.dismiss", "call.topup.hold", "call.accept", "verify.accept", "call.match", "stream.start", "stream.join", "stream.share", "stream.request", "stream.request.cancel", "stream.request.decline", "stream.request.accept", "stream.react", "wallet.checkout", "themes.premium.checkout", "themes.select", "gift.send", "awards.claim", "chats.readAll", "chat.voice", "chat.photoDownload", "profile.settings.save", "settings.set", "privacy.save", "block.set", "follow.set", "payout.request", "ads.click"].includes(msg.type);
      const key = `${version}:${msg.type === "settings.set" ? "profile.settings.save" : msg.type}${notificationWrite ? `:${documentRevision}:${msg.data.requestId}` : msg.type === "block.set" || msg.type === "follow.set" || msg.type === "ads.click" ? `:${msg.data.id}` : msg.type === "gift.send" ? `:${msg.data.idempotencyKey ?? "legacy"}` : msg.type === "chat.voice" || ((msg.type === "chat.send" || msg.type === "chat.photo") && msg.data.clientId) ? `:${msg.data.clientId}` : msg.type === "chat.photoDownload" ? `:${documentRevision}:${msg.data.to}:${msg.data.id}:${msg.data.requestId}` : msg.type === "payout.request" || msg.type === "profile.cover.save" || msg.type === "creator.card.save" ? `:${documentRevision}` : ""}`;
      if (serialized && operations.has(key)) return;
      if (serialized) operations.add(key);
      void handle(msg).catch(error => {
        if (!current(version)) return;
        // Its correlated data.loading failure already reached the current
        // query. An unkeyed error could finish a newer debounced search.
        if (msg.type === "notifications.load" && msg.data.requestId !== undefined) return;
        const context = msg.type === "gift.send" ? { to: msg.data.to, gift: msg.data.gift, idempotencyKey: msg.data.idempotencyKey }
          : msg.type === "chat.voice" || ((msg.type === "chat.send" || msg.type === "chat.photo") && msg.data.clientId) ? { to: msg.data.to, clientId: msg.data.clientId }
          : msg.type === "wallet.checkout" ? { packId: msg.data.packId, idempotencyKey: msg.data.idempotencyKey }
          : msg.type === "wallet.verify" ? { merchantOrderId: msg.data.merchantOrderId }
          : msg.type === "ads.click" ? { id: msg.data.id }
          : msg.type === "referral.apply" ? { requestId: msg.data.requestId } : {};
        operationError(error, msg.type, context);
      }).finally(() => operations.delete(key));
    },
    prepareForUpdate: () => {
      if (updateActivities.size) return;
      // End server-owned billing before retiring media. Cleanup endpoints remain
      // available to outdated clients; queued call creation also detects epoch changes.
      const callId = activeCall, verification = verifyCall, stream = activeStream;
      activeCall = undefined; verifyCall = undefined; activeStream = undefined; callGeneration++;
      if (callId) void api.endCall(callId).catch(() => {});
      if (verification) void api.endVerificationCall(verification.callId).catch(() => {});
      if (stream) void (stream.hosting ? api.endStream(stream.id) : api.leaveStream(stream.id)).catch(() => {});
    },
    close: () => { closed = true; resetUpdateActivities(); epoch++; callGeneration++; resetHomeReads(); unsubscribe(); stopConnection(); activity?.remove(); linkSubscription.remove(); stopPush(); stopPushToken(); stopLive(); },
  };
}
