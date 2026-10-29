/* The shapes the app expects from the server. Field names match what the
   screens read in web/aurora-runtime.js (hostFrom, personFrom and the
   Native.on handlers), so a renamed field shows up as a type error here. */

export type Role = "sender" | "host";
/* Self-chosen; picks a matching illustration when someone has no photo. */
export type Gender = "female" | "male" | "undisclosed";
export type ServerRole = "user" | "host" | "admin";
export type Verification = "none" | "pending" | "verified" | "rejected";

export interface User {
  id: string;
  name: string;
  role: Role;
  serverRole?: ServerRole;
  city?: string;
  about?: string;
  email?: string;
  avatarUrl?: string;
  avatarKey?: string;
  coverUrl?: string;
  coverKey?: string;
  photos?: { key: string; url: string }[];
  languages?: string[];
  interests?: string[];
  category?: string;
  gender?: Gender;
  adultConfirmed?: boolean;
  onboardingPreference?: "creator" | "member";
  hostStatus?: string;
  isVerifiedHost?: boolean;
}

/* Returned by login and by GET /me. */
export interface Account {
  user: User;
  balance?: number; // Omitted until the wallet has loaded.
  earned?: number;
  verification: Verification;
  requiresOnboarding: boolean;
}

export interface Session extends Account {
  tokens: import("../session").SessionTokens;
  isNew: boolean;
}

export interface UserPost {
  id: string;
  mediaUrl: string;
  kind: "photo" | "video";
  caption: string;
  createdAt?: string;
  /** Reactions, present on profile post lists. */
  likes?: number;
  comments?: number;
  liked?: boolean;
}

export interface PostComment {
  id: string;
  text: string;
  createdAt?: string;
  user: { id: string; name: string; avatarUrl: string };
}

export interface PostComments {
  id: string;
  comments: PostComment[];
  total: number;
  page: number;
  limit: number;
}

export interface Host {
  id: string;
  name: string;
  role?: Role;
  serverRole?: ServerRole;
  city?: string;
  category?: string;
  tag?: string;
  languages?: string[];
  age?: number;
  avatarUrl?: string;
  coverUrl?: string;
  /** The host's newest video post, played muted on discovery cards; null when they have none. */
  previewVideoUrl?: string | null;
  gender?: Gender;
  ratePerMin?: number;
  entryFee?: number;
  online?: boolean;
  live?: boolean;
  followers?: number;
  top?: boolean;
  isNew?: boolean;
  following?: boolean;
  about?: string;
  verified?: boolean;
  availableForCall?: boolean;
  stream?: HomeStream | null;
}

/** Public identity and relationship data, never the target's account settings. */
export interface PublicProfile extends Host {
  followingCount: number;
  joined: string;
  interests: string[];
  level?: number;
  crown?: boolean;
  /** This person follows the viewer. */
  followsYou?: boolean;
}

export interface PublicPosts {
  posts: UserPost[];
  total: number;
  page: number;
  limit: number;
}

export interface HomeStream {
  id: string;
  hostId: string;
  host?: Host;
  title: string;
  category: string;
  kind: "video" | "audio";
  viewers: number;
  createdAt: string;
  status: string;
}
export interface Mission {
  id: string;
  title: string;
  description: string;
  metric: string;
  target: number;
  progress: number;
  rewardCoins: number;
  claimed: boolean;
  endsAt: string;
}
export interface HomeQuery { category?: string; q?: string; mode?: "popular" | "instant" | "online" | "following"; page?: number; }
export interface HomeData {
  hosts: Host[];
  stage: Host[];
  featured: Host | null;
  total: number;
  page: number;
  limit: number;
  categories: string[];
  broadcasterCount: number;
  availableCount: number;
  speedMatchEnabled: boolean;
  bonus: Mission | null;
  unreadCount: number;
}
export interface AppNotification { id: string; title: string; body: string; read: boolean; createdAt: string; audience: "personal" | "announcements"; }
export interface NotificationsQuery { page?: number; limit?: number; q?: string; status?: "all" | "unread" | "read"; audience?: "all" | "personal" | "announcements"; since?: string; before?: string; sort?: "newest" | "oldest"; }
export interface NotificationsData { items: AppNotification[]; total: number; unreadCount: number; totalCount: number; page: number; limit: number; }
export interface NotificationReadPatch { ids?: string[]; all?: true; read: boolean; }
export interface NotificationReadResult { count: number; unreadCount: number; totalCount: number; }
export const OFFICIAL_CHAT_ID = "bingo-live-official";
export const OFFICIAL_CHAT_NAME = "Bingo Live Official";
export interface OfficialChatData extends NotificationsData {
  id: typeof OFFICIAL_CHAT_ID;
  name: typeof OFFICIAL_CHAT_NAME;
  official: true;
  canSend: false;
}
export type OfficialReadPatch = { ids: string[]; all?: never } | { all: true; ids?: never };
export interface OfficialChatSummary {
  id: typeof OFFICIAL_CHAT_ID;
  name: typeof OFFICIAL_CHAT_NAME;
  official: true;
  canSend: false;
  lastMessage: Pick<AppNotification, "id" | "title" | "body" | "createdAt"> | null;
  unread: number;
}
export interface StreamChat { id: string; streamId: string; userId: string; name: string; text: string; createdAt: string; }
export interface StreamCallRequest { id: string; streamId: string; userId: string; name: string; avatarUrl?: string; gender?: Gender | null; status: "pending" | "accepting" | "accepted" | "cancelled" | "declined"; createdAt: string; }
export interface StreamRequests { streamId: string; requests: StreamCallRequest[]; ownRequestId: string | null; count: number; }
export interface StreamPrivateCall { streamId: string; requestId: string; callId: string; peerId: string; initiator: boolean; voice: false; peer: { id: string; name: string; avatarUrl?: string; gender?: Gender | null }; }
export interface StreamReaction { id: string; streamId: string; userId: string; emoji: string; }
export interface Gift { id: string; name: string; emoji: string; coins: number; mediaUrl: string; }
export interface CoinPack { id: string; name: string; coins: number; pricePaise: number; }
export interface Catalog { gifts: Gift[]; packs: CoinPack[]; paymentsAvailable: boolean; }
export interface PaymentRoutes {
  mode: "SINGLE" | "ROTATION";
  routeChoice: boolean;
  routes: { route: string; pageStyle: string; upiIntent: boolean; takingPayments: boolean; currency: "INR" }[];
}
export interface AppTheme {
  id: string;
  slug: string;
  name: string;
  description: string;
  isPremium: boolean;
  active: boolean;
  isDefault: boolean;
  sortOrder: number;
  mode: "dark" | "light";
  colors: { background: string; surface: string; surfaceElevated: string; text: string; textMuted: string; primary: string; primaryContrast: string; secondary: string; border: string; success: string; danger: string };
  typography: { fontFamily: "system" | "rounded" | "serif" | "mono"; fontScale: number; fontWeight: "400" | "500" | "600"; headingWeight: "600" | "700" | "800" };
}
export interface ThemeCatalog {
  items: AppTheme[];
  selectedThemeId: string;
  premium: { active: boolean; pricePaise: number; currency: "INR"; paymentsAvailable: boolean; purchaseType: "lifetime" };
}
export type Appearance = "dark" | "light" | "system";
export interface PrivacySettings { discoverable: boolean; showActivity: boolean; allowRequests: boolean; }
export interface ProfileSettings {
  profile: { id: string; name: string; bio: string; city: string; languages: string[]; maskedPhone: string; countryCode: string; isPhoneVerified: boolean; createdAt: string };
  stats: { fans: number; following: number; giftsSent: number; giftsReceived: number; coinsSent: number; coinsReceived: number };
  /** level 0 means the server did not report one. */
  standing: { level: number; crown: boolean };
  preferences: { pushNotifications: boolean; matchCategory: string | null; appearance: Appearance };
  privacy: PrivacySettings;
  categories: string[];
  capabilities: { pushNotifications: boolean; nativePushRegistered: boolean; nativePushStatus: "registered" | "denied" | "unavailable"; liveAlerts: boolean; interfaceLanguages: string[]; currency: string };
}
export interface ProfileSettingsPatch { pushNotifications?: boolean; matchCategory?: string | null; appearance?: Appearance; languages?: string[]; city?: string; }
export interface BlockedUsers { users: Host[]; total: number; page: number; limit: number; }
export interface Purchase { purchaseId: string; merchantOrderId: string; status: string; paymentUrl?: string; kind?: "coins" | "premium"; packId?: string; idempotencyKey?: string; requestedRoute?: string; route?: string; pageStyle?: string; currency?: "INR"; coins?: number; amountPaise?: number; payableAmountPaise?: number; expiresAt?: string; }
export interface RtcPayload {
  description?: { type: "offer" | "answer"; sdp: string };
  candidate?: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null; usernameFragment?: string };
}
export interface RtcConfig { iceServers: { urls: string[]; username?: string; credential?: string }[]; }

/* Anyone on the other end of a call, chat or missed call. */
export interface Person {
  id: string;
  name: string;
  avatarUrl?: string;
  coverUrl?: string;
  city?: string;
  level?: number;
  followers?: number;
  coinsSent?: number;
  coinsReceived?: number;
  joined?: string;
}

export interface ChatSummary {
  canSend?: boolean;
  automatedOnly?: boolean;
  sendDisabledReason?: string;
  id: string;
  user: Host;
  last: string;
  time: string;
  unread: number;
  lastKind: "text" | "image" | "voice";
  lastDeleted?: boolean;
  lastMine: boolean;
  lastAutomated: boolean;
  lastAt: string;
  lastStatus: "sent" | "read";
  hasCalls: boolean;
}

export interface ChatsData {
  chats: ChatSummary[];
  official?: OfficialChatSummary;
  total: number;
  page: number;
  limit: number;
  unreadCount: number;
  unreadConversations: number;
}

export interface Message {
  id?: string;
  mine: boolean;
  text: string;
  time: string;
  createdAt?: string;
  kind?: "text" | "image" | "voice";
  imageUrl?: string;
  audioUrl?: string;
  durationMs?: number;
  edited?: boolean;
  deleted?: boolean; // deleted for everyone; only a placeholder remains
  reply?: { id: string; mine: boolean; text: string; image: boolean; voice?: boolean; deleted: boolean };
  automated?: boolean;
  status?: "sent" | "read"; // own messages only: whether the other person has read it
}

export interface MissedCall {
  user: Person & Partial<Host>;
  when: string;
  at?: string; // ISO time the call was placed
  kind: "video" | "voice";
}

export interface CallRecord {
  user: Host;
  time: string;
  at?: string; // ISO time the call was placed
  duration: string;
  coins?: number;
  kind?: "video" | "voice";
  direction?: "incoming" | "outgoing"; // from this account's side
  status?: "ringing" | "accepted" | "ended" | "declined" | "missed";
}

export interface Transaction {
  title: string;
  time: string;
  coins: number; // positive for coins in, negative for coins out
  kind: "call" | "gift" | "topup" | "withdrawal" | "reward";
  amountPaise?: number;
  displayAmountPaise?: number; // Zero-coin purchases: negative paid, positive refunded (INR).
}

export interface Wallet {
  coins: number;
  earningsPaise: number;
  reservedPaise?: number;
  minimumWithdrawalPaise?: number;
  withdrawalsEnabled?: boolean;
  earned?: number;
}

export interface Payout {
  id: string;
  amountPaise: number;
  payoutAddress: string;
  status: "pending" | "approved" | "paid" | "rejected";
  createdAt: string;
  reason?: string;
  payoutReference?: string;
  idempotencyKey?: string;
}

export interface Payouts {
  items: Payout[];
  total: number;
  page: number;
  limit: number;
}

export type AdPlacement = "home" | "explore" | "chats" | "call_summary";

/** A sponsored card for a member on the free plan. The destination stays on the server until a counted tap. */
export interface AdCreative {
  id: string;
  format: "banner" | "video";
  advertiser: string;
  headline: string;
  body: string;
  ctaLabel: string;
  domain: string;
  mediaUrl: string;
  mediaType: string;
  logoUrl: string;
  placements: AdPlacement[];
}

export interface AdFeed {
  adFree: boolean;
  items: AdCreative[];
}
