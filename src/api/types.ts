/* The shapes the app expects from the server. Field names match what the
   screens read in web/aurora-runtime.js (hostFrom, personFrom and the
   Native.on handlers), so a renamed field shows up as a type error here. */

export type Role = "sender" | "host";
export type Verification = "none" | "pending" | "verified" | "rejected";

export interface User {
  id: string;
  name: string;
  role: Role;
  city?: string;
  about?: string;
}

/* Returned by login and by GET /me. */
export interface Account {
  user: User;
  balance: number; // coins available to spend
  earned: number; // coins earned from calls and gifts
  verification: Verification;
}

export interface Session extends Account {
  token: string;
  isNew: boolean;
}

export interface Host {
  id: string;
  name: string;
  city?: string;
  category?: string;
  tag?: string;
  languages?: string[];
  age?: number;
  ratePerMin: number;
  entryFee: number;
  online: boolean;
  live: boolean;
  followers: number;
  top?: boolean;
  isNew?: boolean;
  following?: boolean;
}

/* Anyone on the other end of a call, chat or missed call. */
export interface Person {
  id: string;
  name: string;
  city?: string;
  level?: number;
  followers?: number;
  coinsSent?: number;
  coinsReceived?: number;
  joined?: string;
}

export interface ChatSummary {
  user: Host;
  last: string;
  time: string;
  unread: number;
}

export interface Message {
  mine: boolean;
  text: string;
  time: string;
}

export interface MissedCall {
  user: Person & Partial<Host>;
  when: string;
  kind: "video" | "voice";
}

export interface CallRecord {
  user: Host;
  time: string;
  duration: string;
  coins: number;
}

export interface Transaction {
  title: string;
  time: string;
  coins: number; // positive for coins in, negative for coins out
  kind: "call" | "gift" | "topup";
}

export interface Wallet {
  coins: number;
  earned: number;
}
