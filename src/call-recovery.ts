import type { api } from "./api/endpoints";

type CallState = Awaited<ReturnType<typeof api.callState>>;
type Snapshot = { key: string; callId?: string; available: boolean };

/** Socket events can be lost during reconnects. Confirm the exact active call
 * over authenticated HTTP; transport errors alone never end healthy media. */
export function createCallRecovery(options: {
  snapshot: () => Snapshot;
  read: (callId: string) => Promise<CallState>;
  ended: (state: CallState) => void;
}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flight: { snapshot: Snapshot } | undefined;
  let closed = false;
  const clear = () => { clearTimeout(timer); timer = undefined; };
  const matches = (a: Snapshot, b: Snapshot) => a.key === b.key && a.callId === b.callId && b.available;
  const sync = (immediate = false) => {
    const snapshot = options.snapshot();
    if (closed || !snapshot.available || !snapshot.callId) { clear(); return; }
    if (flight && matches(flight.snapshot, snapshot)) return;
    if (immediate) { clear(); void check(snapshot); }
    else if (!timer) timer = setTimeout(() => { timer = undefined; sync(true); }, 5000);
  };
  const check = async (snapshot: Snapshot) => {
    const request = { snapshot };
    flight = request;
    try {
      const state = await options.read(snapshot.callId!);
      if (closed || flight !== request || !matches(snapshot, options.snapshot())) return;
      if (state.callId === snapshot.callId && ["ended", "declined", "missed"].includes(state.status)) options.ended(state);
    } catch { /* A failed read means uncertain state, not a hangup. Retry later. */ }
    finally {
      if (flight === request) { flight = undefined; sync(); }
    }
  };
  return {
    sync,
    reset() { clear(); flight = undefined; },
    close() { closed = true; clear(); flight = undefined; },
  };
}
