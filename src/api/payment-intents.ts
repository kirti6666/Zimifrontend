import type { Purchase, UpiApp, UpiIntentRouting, UpiPlatform } from "./types";

const APP_TARGETS = {
  phonepe: { android: "phonepe://native", ios: "phonepe://upi/pay" },
  gpay: { android: "gpay://upi/pay", ios: "gpay://upi/pay" },
  paytm: { android: "paytmmp://cash_wallet", ios: "paytmmp://cash_wallet" },
} as const;
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

function intentQuery(value: unknown, target: string): URLSearchParams | undefined {
  if (typeof value !== "string" || value.length > 4096 || /[\s\x00-\x1f\x7f<>"'\x60#\\]/.test(value)) return;
  const queryStart = value.indexOf("?");
  const address = value.slice(0, queryStart);
  if (queryStart < 0 || (address !== target && !(address === `${target}/` && !target.endsWith("/pay")))) return;
  try {
    const query = new URLSearchParams(value.slice(queryStart + 1));
    const keys = new Set<string>();
    for (const [key] of query) {
      const normalized = key.toLowerCase();
      if (keys.has(normalized)) return;
      keys.add(normalized);
    }
    return query;
  }
  catch { return undefined; }
}

function paise(value: string | null) {
  const match = /^(0|[1-9]\d{0,13})(?:\.(\d{1,2}))?$/.exec(value ?? "");
  if (match) return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

function paymentDetails(query: URLSearchParams, amountPaise: number, allowImplicitInr = false) {
  const pa = query.get("pa"), tr = query.get("tr"), minimum = query.get("mam"), currency = query.get("cu");
  const implicitInr = allowImplicitInr && currency === null && ![...query].some(([key]) => key.toLowerCase() === "cu");
  if (!pa || !/^[\w.+-]{1,128}@[\w.-]{1,64}$/.test(pa) || !tr || !/^[\w.:/-]{1,100}$/.test(tr) ||
      paise(query.get("am")) !== amountPaise || (minimum !== null && paise(minimum) !== amountPaise) || (!implicitInr && currency !== "INR")) return;
  return { pa: pa.toLowerCase(), tr, note: query.get("tn") };
}

/** Keep only PayPlus supplied payment links for this order's exact INR quote. */
export function purchaseIntentsFrom(data: Record<string, unknown>): Pick<Purchase, "upiIntent" | "upiIntentRouting" | "isIntentSupported"> {
  if (data.isIntentSupported === false) return { isIntentSupported: false };
  if (data.status !== "created" || data.kind === "premium") return {};
  const amount = data.payableAmountPaise;
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0 || data.currency !== "INR") return {};
  const routing = object(data.upiIntentRouting), generic = data.upiIntent ?? routing.generic;
  // PayPlus's VERAPAY JSON link omits cu. The authenticated quote establishes INR.
  const allowImplicitInr = data.route === "VERAPAY" && data.pageStyle === "JSON";
  const query = intentQuery(generic, "upi://pay"), destination = query && paymentDetails(query, amount, allowImplicitInr);
  if (typeof generic !== "string" || !destination) return {};
  const apps: NonNullable<UpiIntentRouting["apps"]> = {};
  for (const app of Object.keys(APP_TARGETS) as UpiApp[]) {
    const supplied = object(object(routing.apps)[app]), links: Partial<Record<UpiPlatform, string>> = {};
    for (const platform of ["android", "ios"] as const) {
      const link = supplied[platform], params = intentQuery(link, APP_TARGETS[app][platform]);
      if (typeof link !== "string" || !params) continue;
      if (app === "phonepe" && platform === "android") {
        // PayPlus treats the encoded payload as opaque. Restrict the native
        // entry point to PhonePe's documented payment operation.
        const encoded = params.get("data");
        if (params.get("id") === "p2ppayment" && encoded && /^[A-Za-z0-9+/_-]+={0,2}$/.test(encoded)) links[platform] = link;
      } else {
        const target = paymentDetails(params, amount);
        if (target?.pa === destination.pa && target.tr === destination.tr && (target.note === null || target.note === destination.note)) links[platform] = link;
      }
    }
    if (Object.keys(links).length) apps[app] = links;
  }
  return { upiIntent: generic, upiIntentRouting: { generic, ...(Object.keys(apps).length ? { apps } : {}) }, isIntentSupported: true };
}
