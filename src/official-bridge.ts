import { ApiError, errorMessage } from "./api/client";
import type { api } from "./api/endpoints";
import type { OfficialChatData, OfficialReadPatch, OfficialReadResult, OfficialReceipt } from "./api/types";

export type OfficialWebMessage =
  | { type: "official.activity"; data: { active: boolean } }
  | { type: "official.load"; data: { before?: string; requestId: number } }
  | { type: "official.send"; data: { body: string; clientMessageId: string; requestId: number } }
  | { type: "official.read"; data: OfficialReadPatch & { requestId: number } };
export type OfficialAppMessage =
  | { type: "data.official"; data: OfficialChatData & { requestId?: number; append?: boolean; background?: boolean } }
  | { type: "official.sent"; data: OfficialReceipt & { requestId: number; clientMessageId: string } }
  | { type: "official.saved"; data: OfficialReadPatch & OfficialReadResult & { requestId: number } }
  | { type: "official.error"; data: { action: "load" | "read" | "send"; requestId?: number; clientMessageId?: string; message: string; background?: boolean } }
  | { type: "official.changed" | "official.open"; data: Record<string, never> };
type OfficialApi = Pick<typeof api, "officialChat" | "sendOfficialMessage" | "readOfficialChat">;
interface Snapshot { key: string; available: boolean; foreground: boolean; }

/** A separate private support/update conversation. Never a person-chat peer. */
export function createOfficialBridge(deps: { api: OfficialApi; emit: (message: OfficialAppMessage) => void; snapshot: () => Snapshot; changed: () => void }) {
  let revision = 0, view = 0, dataRevision = 0, readRevision = 0, visible = false, writes = 0, loads = 0;
  let timer: ReturnType<typeof setTimeout> | undefined, refreshing: object | undefined, dirty = false;
  const waiters = new Set<() => void>();
  const pending = new Map<string, { body: string; promise: Promise<OfficialReceipt> }>();
  const stamp = () => ({ key: deps.snapshot().key, revision, view });
  const owned = (saved: ReturnType<typeof stamp>) => saved.revision === revision && saved.key === deps.snapshot().key && deps.snapshot().available;
  const current = (saved: ReturnType<typeof stamp>) => owned(saved) && saved.view === view;
  const enabled = () => visible && deps.snapshot().available && deps.snapshot().foreground;
  const stop = () => { clearTimeout(timer);timer = undefined; };
  const release = () => { for (const resolve of waiters) resolve();waiters.clear(); };
  const schedule = () => { stop();if (enabled()) timer = setTimeout(() => { timer = undefined;void refresh(); }, 5000); };
  async function consistentRead(before: string | undefined, applicable: () => boolean) {
    for (let attempt = 0; attempt < 5 && applicable(); attempt++) {
      while (writes && applicable()) await new Promise<void>(resolve => waiters.add(resolve));
      if (!applicable()) return;
      const started = dataRevision, data = await deps.api.officialChat(before);
      if (!applicable()) return;
      if (started === dataRevision && !writes) return data;
    }
    if (applicable()) throw new ApiError("This conversation changed while loading. Please try again.", 409);
  }
  async function refresh() {
    if (!enabled()) return;
    if (refreshing || writes || loads) { dirty = true;return; }
    const flight = {}, saved = stamp(), started = dataRevision, read = readRevision;
    refreshing = flight;dirty = false;stop();
    try {
      const data = await deps.api.officialChat();
      if (current(saved) && enabled() && started === dataRevision && read === readRevision) deps.emit({ type: "data.official", data: { ...data, background: true } });
    } catch (error) {
      if (current(saved) && enabled() && started === dataRevision && read === readRevision) deps.emit({ type: "official.error", data: { action: "load", background: true, message: errorMessage(error) } });
    } finally {
      if (refreshing !== flight) return;
      refreshing = undefined;
      if (enabled()) { if (dirty && !writes && !loads) void refresh();else schedule(); }
    }
  }
  function settled(saved: ReturnType<typeof stamp>) {
    if (saved.revision !== revision) return;
    writes--;dataRevision++;if (!writes) release();
    if (owned(saved)) deps.changed();
    if (enabled() && !writes) void refresh();
  }
  async function handle(message: OfficialWebMessage): Promise<void> {
    if (message.type === "official.activity") {
      // Native foreground and document visibility can report the same state.
      // Repeating it must not retire the explicit history request it opened.
      if (visible === message.data.active) return;
      visible = message.data.active;view++;readRevision++;loads = 0;refreshing = undefined;dirty = false;stop();
      if (enabled()) void refresh();return;
    }
    const saved = stamp(), { requestId } = message.data;
    const action = message.type === "official.load" ? "load" : message.type === "official.send" ? "send" : "read";
    const fail = (error: unknown) => {
      if ((action === "load" ? current(saved) : owned(saved))) deps.emit({ type: "official.error", data: { action, requestId, message: errorMessage(error), ...("clientMessageId" in message.data ? { clientMessageId: message.data.clientMessageId } : {}) } });
    };
    if (!deps.snapshot().available) { deps.emit({ type: "official.error", data: { action, requestId, message: "Sign in to open the BinzoLive conversation.", ...("clientMessageId" in message.data ? { clientMessageId: message.data.clientMessageId } : {}) } });return; }
    if (message.type === "official.load") {
      const read = ++readRevision;loads++;
      try { const data = await consistentRead(message.data.before, () => current(saved) && read === readRevision);if (data) deps.emit({ type: "data.official", data: { ...data, requestId, append: !!message.data.before } }); }
      catch (error) { if (read === readRevision) fail(error); }
      finally { if (current(saved)) { loads--;if (enabled()) { if (dirty && !loads && !writes) void refresh();else schedule(); } } }
      return;
    }
    if (message.type === "official.send") {
      const { body, clientMessageId } = message.data, key = `${saved.key}:${clientMessageId}`;
      let entry = pending.get(key);
      if (entry && entry.body !== body) { fail(new ApiError("Retry the original message or send a new message.", 409));return; }
      if (!entry) {
        writes++;dataRevision++;
        const promise = Promise.resolve().then(() => deps.api.sendOfficialMessage(body, clientMessageId)).finally(() => { if (pending.get(key)?.promise === promise) pending.delete(key);settled(saved); });
        entry = { body, promise };pending.set(key, entry);
      }
      try { const data = await entry.promise;if (owned(saved)) deps.emit({ type: "official.sent", data: { ...data, requestId, clientMessageId } }); }
      catch (error) { fail(error); }
      return;
    }
    // IDs can only be marked read from the visible foreground conversation.
    // The explicit Chat-list mark-all action is separately permitted.
    if (!deps.snapshot().foreground || (message.data.all !== true && !enabled())) { fail(new ApiError("Open the BinzoLive conversation to mark messages read.", 409));return; }
    writes++;dataRevision++;
    try {
      const { requestId: _, ...input } = message.data, data = await deps.api.readOfficialChat(input);
      if (owned(saved)) deps.emit({ type: "official.saved", data: { ...input, ...data, requestId } });
    } catch (error) { fail(error); }
    finally { settled(saved); }
  }
  return {
    handle,
    changed() { dataRevision++;deps.emit({ type: "official.changed", data: {} });void refresh(); },
    foreground() { stop();if (enabled()) void refresh(); },
    reset() { revision++;view++;dataRevision++;readRevision++;visible = false;writes = 0;loads = 0;dirty = false;refreshing = undefined;stop();pending.clear();release(); },
  };
}
