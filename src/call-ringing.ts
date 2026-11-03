import { NativeModules, Platform } from "react-native";

type VerifiedRing = { callId: string; recipientId: string; expiresAt: string };
type RingMessage = { type: string; data?: Record<string, unknown> };
type RingNative = { startIncomingRinging(id: string, recipientId: string, remainingMs: number): void; stopIncomingRinging(id: string | null): void };
const native = Platform?.OS === "android" ? NativeModules?.BinzoNotifications as RingNative | undefined : undefined;
const available = typeof native?.startIncomingRinging === "function" && typeof native?.stopIncomingRinging === "function";
const validId = (value: unknown): value is string => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
const overlayOwner = Symbol("incoming-overlay");
const nativeOwners = new Map<symbol, VerifiedRing>();

function playOwned(owner: symbol, call: VerifiedRing): void {
  const remaining = Date.parse(call.expiresAt) - Date.now();
  if (!available || !validId(call.callId) || !validId(call.recipientId) || !Number.isFinite(remaining) || remaining <= 0 || remaining > 180000) return;
  nativeOwners.delete(owner); nativeOwners.set(owner, call);
  native!.startIncomingRinging(call.callId, call.recipientId, remaining);
}
function releaseOwned(owner: symbol): void {
  const previous = nativeOwners.get(owner);
  nativeOwners.delete(owner);
  if (!previous || !available) return;
  const next = [...nativeOwners.values()].reverse().find(call => Date.parse(call.expiresAt) > Date.now());
  if (next) native!.startIncomingRinging(next.callId, next.recipientId, Date.parse(next.expiresAt) - Date.now());
  else native!.stopIncomingRinging(previous.callId);
}

/** Only verified incoming-call snapshots may reach the foreground native tone. */
export function startVerifiedIncomingRinging(call: VerifiedRing): void {
  playOwned(overlayOwner, call);
}
export function releaseVerifiedIncomingRinging(): void { releaseOwned(overlayOwner); }
export function stopIncomingRinging(callId?: string): void {
  for (const [owner, call] of nativeOwners) if (callId === undefined || call.callId === callId) nativeOwners.delete(owner);
  if (available && (callId === undefined || validId(callId))) native!.stopIncomingRinging(callId ?? null);
}

/** Observe authenticated bridge events, independently of host/member UI routes.
 * Late verification, old documents and failed answer attempts cannot revive an
 * ended call. Native code owns foreground/ringer/channel and push-audio handoff. */
export function createCallRinging(options: {
  owner(): string | undefined; key(): string;
  verify(id: string): Promise<VerifiedRing | null>;
  available?: boolean; play?(call: VerifiedRing): void; stop?(id?: string): void;
}) {
  const ringOwner = Symbol("bridge-ringing");
  const enabled = options.available ?? available, play = options.play ?? ((call: VerifiedRing) => playOwned(ringOwner, call));
  const stop = options.stop ?? (() => releaseOwned(ringOwner)), pause = options.stop ?? stopIncomingRinging;
  let current: { id: string; paused: boolean; verified?: VerifiedRing } | null = null;
  let revision = 0, foreground = true, owner: string | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  function reset(terminal = false) { revision++; clearTimeout(expiry); expiry = undefined; const id = current?.id; current = null; if (id) (terminal ? pause : stop)(id); }
  async function check(id: string) {
    if (!enabled || !current || current.id !== id) return;
    const version = ++revision, key = options.key(), recipient = options.owner();
    if (!recipient) return reset();
    try {
      const verified = await options.verify(id);
      if (version !== revision || options.key() !== key || options.owner() !== recipient || current?.id !== id) return;
      const remaining = verified ? Date.parse(verified.expiresAt) - Date.now() : NaN;
      if (!verified || verified.callId !== id || verified.recipientId !== recipient || !Number.isFinite(remaining) || remaining <= 0 || remaining > 180000) return reset(true);
      current.paused = false; current.verified = verified;
      clearTimeout(expiry);
      expiry = setTimeout(() => { if (current?.id === id) reset(); }, Math.min(180000, Date.parse(verified.expiresAt) - Date.now()));
      if (foreground) play(verified);
    } catch { /* Keep a failed verification silent; a fresh incoming event can retry. */ }
  }
  function observe(message: RingMessage) {
    if (!enabled) return;
    if (["session.none", "session.expired", "session.restoring"].includes(message.type)) return reset(true);
    if (message.type === "session") {
      const next = (message.data?.user as { id?: string } | undefined)?.id;
      if (owner !== next) reset(true); owner = next; return;
    }
    const id = message.data?.callId;
    if (message.type === "call.nativeAction" && message.data?.action === "answer" && id === current?.id) {
      revision++; clearTimeout(expiry); current!.paused = true; pause(current!.id); return;
    }
    if (message.type === "call.incoming" && validId(id)) {
      if (current?.id === id && (current.paused || current.verified)) return;
      if (current?.id !== id) { if (current) stop(current.id); current = { id, paused: false }; }
      void check(id); return;
    }
    if (!current) return;
    if (message.type === "call.failed" && id === current.id && current.paused) { void check(current.id); return; }
    if (["call.connected", "call.created", "verify.connected"].includes(message.type) ||
      ["call.ended", "verify.ended"].includes(message.type) && id === current.id) return reset(true);
  }
  function handle(message: RingMessage) {
    if (!enabled) return;
    if (message.type === "auth.logout" || message.type === "account.deactivate") { pause(); return reset(); }
    if (!current) return;
    const id = message.data?.callId;
    if (id === current.id || message.type === "call.end" && id === undefined) {
      if (["call.accept", "call.decline", "call.end", "verify.accept", "verify.end"].includes(message.type)) {
        revision++; clearTimeout(expiry); current.paused = true; pause(current.id);
        if (!["call.accept", "verify.accept"].includes(message.type)) current = null;
      }
    }
  }
  return { observe, handle, reset,
    foreground(active: boolean) { foreground = active; if (!active) nativeOwners.clear(); if (active && current && !current.paused) void check(current.id); },
  };
}
