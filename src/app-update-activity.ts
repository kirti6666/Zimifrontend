/** Native-owned leases keep an already running call/checkout visible until it ends. */
export type UpdateActivity = "call" | "purchase";
const leases = new Map<number, { kind: UpdateActivity; key: string }>();
const listeners = new Set<(busy: boolean) => void>();
let sequence = 0;
export const isUpdateActivityBusy = () => leases.size > 0;
function changed() { for (const listener of listeners) { try { listener(isUpdateActivityBusy()); } catch { /* Isolate observers. */ } } }
export function beginUpdateActivity(kind: UpdateActivity, key: string): () => void {
  const id = ++sequence, previouslyBusy = isUpdateActivityBusy();
  leases.set(id, { kind, key });
  if (!previouslyBusy) changed();
  return () => { if (leases.delete(id) && !isUpdateActivityBusy()) changed(); };
}
export function onUpdateActivityChanged(listener: (busy: boolean) => void): () => void {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
