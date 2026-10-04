import { request } from "./client";
import type {
  Account, CallRecord, ChatSummary, Host, Message, MissedCall, Role, Session, Transaction, Verification, Wallet,
} from "./types";

/* Every server call the app makes, in one place. Paths are relative to API_URL. */
export const api = {
  /* Sign-in: a one-time code to an Indian mobile number (+91...). */
  sendOtp: (phone: string, role: Role) => request<void>("POST", "/auth/otp", { phone, role }),
  verifyOtp: (phone: string, code: string, role: Role, signup: boolean) =>
    request<Session>("POST", "/auth/verify", { phone, code, role, signup }),
  logout: () => request<void>("POST", "/auth/logout"),

  /* The signed-in account. */
  me: () => request<Account>("GET", "/me"),
  saveProfile: (profile: Record<string, unknown>) => request<void>("PUT", "/me/profile", profile),
  submitVerification: (details: Record<string, unknown>) =>
    request<{ status: Verification }>("POST", "/me/verification", details),
  setPresence: (online: boolean, visible: boolean) => request<void>("PUT", "/me/presence", { online, visible }),
  saveSettings: (settings: Record<string, unknown>) => request<void>("PUT", "/me/settings", settings),

  /* Lists shown on Home, Chats, Calls and Wallet. */
  hosts: () => request<{ hosts: Host[] }>("GET", "/hosts"),
  chats: () => request<{ chats: ChatSummary[] }>("GET", "/chats"),
  thread: (withId: string) =>
    request<{ messages: Message[] }>("GET", `/chats/${encodeURIComponent(withId)}/messages`),
  missedCalls: () => request<{ calls: MissedCall[] }>("GET", "/calls/missed"),
  callHistory: () => request<{ calls: CallRecord[] }>("GET", "/calls"),
  transactions: () => request<{ items: Transaction[] }>("GET", "/wallet/transactions"),
  wallet: () => request<Wallet>("GET", "/wallet"),

  /* Calls. The other side's answer arrives as a live event (call.connected). */
  startCall: (to: string, voice: boolean) => request<{ callId: string }>("POST", "/calls", { to, voice }),
  acceptCall: (callId: string) => request<void>("POST", `/calls/${encodeURIComponent(callId)}/accept`),
  declineCall: (callId: string) => request<void>("POST", `/calls/${encodeURIComponent(callId)}/decline`),
  endCall: (callId: string, reason?: string) =>
    request<void>("POST", `/calls/${encodeURIComponent(callId)}/end`, { reason }),

  /* Gifts, chat and follows. */
  sendGift: (to: string, gift: string, coins: number, callId?: string) =>
    request<Wallet>("POST", "/gifts", { to, gift, coins, callId }),
  sendMessage: (to: string, text: string, callId?: string) =>
    request<void>("POST", `/chats/${encodeURIComponent(to)}/messages`, { text, callId }),
  follow: (id: string, on: boolean) => request<void>("PUT", `/follows/${encodeURIComponent(id)}`, { on }),

  /* Money. Coin purchases on Android have to go through Google Play Billing;
     this records the purchase once the store has confirmed it. */
  recharge: (purchase: { pack: number; coins: number; price: number; method: string }) =>
    request<Wallet>("POST", "/wallet/recharge", purchase),
  requestPayout: (coins: number, upi: string) => request<Wallet>("POST", "/payouts", { coins, upi }),
  claimAward: (task: string) => request<Wallet>("POST", `/awards/${encodeURIComponent(task)}/claim`),
};
