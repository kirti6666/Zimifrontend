import * as SecureStore from "expo-secure-store";

export interface PendingPayout { amountPaise: number; payoutAddress: string; idempotencyKey: string }

const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const queues = new Map<string, Promise<void>>();
const validKey = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(value);

function storageKey(accountId: string): string {
  if (typeof accountId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(accountId)) throw new Error("A signed-in account is required to recover withdrawals.");
  return `zimi.payouts.v1.${accountId}`;
}

function validated(value: unknown): PendingPayout {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The saved withdrawal attempt could not be verified.");
  const item = value as Record<string, unknown>;
  if (Object.keys(item).length !== 3 || !Object.keys(item).every(key => ["amountPaise", "payoutAddress", "idempotencyKey"].includes(key)) ||
    !Number.isSafeInteger(item.amountPaise) || Number(item.amountPaise) <= 0 || Number(item.amountPaise) > 100000000 ||
    typeof item.payoutAddress !== "string" || item.payoutAddress.trim().length < 3 || item.payoutAddress.trim().length > 200 || !validKey(item.idempotencyKey)) {
    throw new Error("The saved withdrawal attempt could not be verified.");
  }
  return { amountPaise: Number(item.amountPaise), payoutAddress: item.payoutAddress.trim(), idempotencyKey: item.idempotencyKey };
}

function parse(raw: string | null): PendingPayout | null {
  if (raw === null) return null;
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new Error("The saved withdrawal attempt could not be verified."); }
  return validated(value);
}

function serialized<T>(key: string, work: () => Promise<T>): Promise<T> {
  const task = (queues.get(key) ?? Promise.resolve()).then(work);
  // Keep later recovery attempts usable after a failure; the caller still
  // receives the original rejecting task and must not submit a new mutation.
  const settled = task.then(() => {}, () => {});
  queues.set(key, settled);
  void settled.then(() => { if (queues.get(key) === settled) queues.delete(key); });
  return task;
}

/** Retained across sign-out and process restarts. Only the authenticated
 * account's ID may be supplied by the bridge; recovery never grants authority. */
export async function readPendingPayout(accountId: string): Promise<PendingPayout | null> {
  const key = storageKey(accountId);
  return serialized(key, async () => parse(await SecureStore.getItemAsync(key, OPTIONS)));
}

/** This durable write must finish before POST /wallet/withdraw is allowed. */
export async function rememberPendingPayout(accountId: string, attempt: PendingPayout): Promise<void> {
  const key = storageKey(accountId), next = validated(attempt);
  return serialized(key, async () => {
    const pending = parse(await SecureStore.getItemAsync(key, OPTIONS));
    if (pending) {
      if (pending.idempotencyKey !== next.idempotencyKey || pending.amountPaise !== next.amountPaise || pending.payoutAddress !== next.payoutAddress) {
        throw new Error("Resolve the pending withdrawal before starting a different request.");
      }
      return;
    }
    await SecureStore.setItemAsync(key, JSON.stringify(next), OPTIONS);
  });
}

/** A late receipt cannot erase a more recent recovery attempt. */
export async function forgetPendingPayout(accountId: string, idempotencyKey: string): Promise<void> {
  const key = storageKey(accountId);
  if (!validKey(idempotencyKey)) throw new Error("The withdrawal attempt key is invalid.");
  return serialized(key, async () => {
    const pending = parse(await SecureStore.getItemAsync(key, OPTIONS));
    if (pending?.idempotencyKey === idempotencyKey) await SecureStore.deleteItemAsync(key, OPTIONS);
  });
}
