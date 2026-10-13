import type { Account } from "./api/types";

/** Creator preferences and local verification labels never grant host capability. */
export function approvedHost(account: Account | undefined): boolean {
  return account?.user.role === "host" && account.user.hostStatus === "approved" && account.user.isVerifiedHost === true && account.verification === "verified";
}
