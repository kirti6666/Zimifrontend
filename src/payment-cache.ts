import * as SecureStore from "expo-secure-store";

export interface PendingPayment { orderId: string; kind: "coins" | "premium"; packId?: string; idempotencyKey?: string; requestedRoute?: string }
const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const storageKey = (accountId: string) => /^[\w-]{1,100}$/.test(accountId) ? `zimi.payments.v1.${accountId}` : undefined;
let writing: Promise<void> = Promise.resolve();

function parse(raw: string | null): PendingPayment[] {
  try {
    const entries: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(entries) ? entries.filter((entry): entry is PendingPayment => !!entry && typeof entry === "object" &&
      typeof entry.orderId === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(entry.orderId) && (entry.kind === "coins" || entry.kind === "premium"))
      .map(entry => ({ orderId: entry.orderId, kind: entry.kind,
        ...(typeof entry.packId === "string" && /^[\w-]{1,100}$/.test(entry.packId) ? { packId: entry.packId } : {}),
        ...(typeof entry.idempotencyKey === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(entry.idempotencyKey) ? { idempotencyKey: entry.idempotencyKey } : {}),
        ...(typeof entry.requestedRoute === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(entry.requestedRoute) ? { requestedRoute: entry.requestedRoute } : {}) })) : [];
  } catch { return []; }
}

/** Only order references are cached. Prices, balances and payment status always
 * come from the authenticated API; one account cannot restore another's orders. */
export async function readPendingPayments(accountId: string): Promise<PendingPayment[]> {
  const key = storageKey(accountId);
  if (!key) return [];
  await writing;
  try { return parse(await SecureStore.getItemAsync(key, OPTIONS)); } catch { return []; }
}

function update(accountId: string, change: (entries: PendingPayment[]) => PendingPayment[]) {
  const key = storageKey(accountId);
  if (!key) return Promise.resolve();
  const task = writing.then(async () => {
    const entries = change(parse(await SecureStore.getItemAsync(key, OPTIONS)));
    if (entries.length) await SecureStore.setItemAsync(key, JSON.stringify(entries), OPTIONS);
    else await SecureStore.deleteItemAsync(key, OPTIONS);
  });
  // Unavailable device storage cannot lose a server-confirmed payment result.
  writing = task.catch(() => {});
  return writing;
}

export const rememberPendingPayment = (accountId: string, payment: PendingPayment) => update(accountId, entries =>
  [...entries.filter(entry => entry.orderId !== payment.orderId), payment]);
export const forgetPendingPayment = (accountId: string, orderId: string) => update(accountId, entries => entries.filter(entry => entry.orderId !== orderId));
