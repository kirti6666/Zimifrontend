import { ApiError, errorMessage } from "./api/client";
import type { api } from "./api/endpoints";
import type { SupportCategory, SupportConversation, SupportReceipt, SupportStatus, SupportTicket, SupportTickets } from "./api/types";

export type SupportWebMessage =
  | { type: "support.activity"; data: { active: boolean; ticketId?: string } }
  | { type: "support.load"; data: { page?: number; status?: SupportStatus | "all"; requestId: number } }
  | { type: "support.open"; data: { ticketId: string; before?: string; requestId: number } }
  | { type: "support.create"; data: { subject: string; category: SupportCategory; body: string; clientMessageId: string; requestId: number } }
  | { type: "support.send"; data: { ticketId: string; body: string; clientMessageId: string; requestId: number } }
  | { type: "support.read"; data: { ticketId: string; throughMessageId: string; requestId: number } }
  | { type: "support.status"; data: { ticketId: string; status: "open" | "resolved"; requestId: number } };
export type SupportAppMessage =
  | { type: "data.supportTickets"; data: SupportTickets & { hasMore: boolean; requestId?: number; background?: boolean } }
  | { type: "data.supportTicket"; data: SupportConversation & { requestId?: number; append?: boolean; background?: boolean } }
  | { type: "support.created"; data: SupportReceipt & { requestId: number } }
  | { type: "support.sent"; data: SupportReceipt & { requestId: number; clientMessageId: string } }
  | { type: "support.read" | "support.status"; data: { ticket: SupportTicket; requestId: number } }
  | { type: "support.updated"; data: { ticketId: string } }
  | { type: "support.unread"; data: { unreadCount: number } }
  | { type: "operation.error"; data: { action: string; message: string; requestId: number; ticketId?: string; clientMessageId?: string; code?: string; status?: number } };
type SupportApi = Pick<typeof api, "supportTickets" | "supportTicket" | "createSupportTicket" | "sendSupportMessage" | "readSupportTicket" | "updateSupportTicket">;
interface Snapshot { key: string; available: boolean; foreground: boolean; }

/** Support owns no credentials or cached conversation content. Every request is
 * scoped to the current account, native session and WebView document. */
export function createSupportBridge(deps: { api: SupportApi; emit: (message: SupportAppMessage) => void; snapshot: () => Snapshot }) {
  let revision = 0, viewRevision = 0, dataRevision = 0, visible = false, ticketId: string | undefined;
  let query: { status?: SupportStatus | "all" } = {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  let refreshing = false, dirty = false, writes = 0, listRead = 0, detailRead = 0;
  let summaryFlight: Promise<void> | undefined, summaryKey: string | undefined, summaryInvalidated = false, lastSummary = 0;
  const pending = new Map<string, Promise<void>>();
  const writeWaiters = new Set<() => void>();
  const stopTimer = () => { clearTimeout(timer); timer = undefined; };
  const enabled = () => { const state = deps.snapshot(); return visible && state.available && state.foreground; };
  const stamp = () => ({ key: deps.snapshot().key, revision, view: viewRevision });
  const owned = (saved: ReturnType<typeof stamp>) => deps.snapshot().available && saved.key === deps.snapshot().key && saved.revision === revision;
  const current = (saved: ReturnType<typeof stamp>) => owned(saved) && saved.view === viewRevision;
  const releaseReaders = () => { for (const release of writeWaiters) release();writeWaiters.clear(); };
  async function consistentRead<T>(read: () => Promise<T>, applicable: () => boolean): Promise<T | undefined> {
    for (let attempt = 0; attempt < 5 && applicable(); attempt++) {
      if (writes) await new Promise<void>(resolve => writeWaiters.add(resolve));
      if (!applicable()) return;
      const dataAtStart = dataRevision, data = await read();
      if (!applicable()) return;
      if (dataAtStart === dataRevision && !writes) return data;
    }
    if (applicable()) throw new ApiError("This conversation changed while loading. Please try again.", 409);
  }
  const schedule = () => { stopTimer(); if (enabled()) timer = setTimeout(() => { timer = undefined; void refresh(); }, 4000); };
  const emitList = (data: SupportTickets, requestId?: number, background = false) => deps.emit({ type: "data.supportTickets", data: { ...data, hasMore: data.page * data.limit < data.total, ...(requestId === undefined ? {} : { requestId }), ...(background ? { background: true } : {}) } });
  function unread(force = false): Promise<void> {
    const state = deps.snapshot(), savedRevision = revision, dataAtStart = dataRevision;
    if (!state.available || !state.foreground) return Promise.resolve();
    if (writes) return Promise.resolve();
    if (summaryFlight && summaryKey === state.key) { summaryInvalidated ||= force;return summaryFlight; }
    if (!force && state.key === summaryKey && Date.now() - lastSummary < 30_000) return Promise.resolve();
    summaryKey = state.key;lastSummary = Date.now();summaryInvalidated = false;
    const work = deps.api.supportTickets({ page: 1 }).then(data => {
      if (dataAtStart !== dataRevision && savedRevision === revision) { summaryInvalidated = true;return; }
      if (deps.snapshot().available && deps.snapshot().foreground && deps.snapshot().key === state.key && savedRevision === revision) deps.emit({ type: "support.unread", data: { unreadCount: data.unreadCount } });
    }).catch(() => {}).finally(() => {
      if (summaryFlight !== work) return;
      summaryFlight = undefined;
      if (summaryInvalidated) { summaryInvalidated = false;void unread(true); }
    });
    summaryFlight = work;return work;
  }
  async function refresh(changedTicket?: string) {
    if (!enabled()) return;
    if (refreshing || writes) { dirty = true; return; }
    refreshing = true;dirty = false;stopTimer();
    const saved = stamp(), dataAtStart = dataRevision, listRevision = listRead, detailRevision = detailRead, active = ticketId;
    const applicable = () => current(saved) && enabled() && dataAtStart === dataRevision;
    try {
      const reads: Promise<unknown>[] = [deps.api.supportTickets({ ...query, page: 1 }).then(data => { if (applicable() && listRevision === listRead) emitList(data, undefined, true); })];
      if (active && (!changedTicket || changedTicket === active)) reads.push(deps.api.supportTicket(active).then(data => {
        if (applicable() && detailRevision === detailRead && ticketId === active) deps.emit({ type: "data.supportTicket", data: { ...data, background: true } });
      }));
      await Promise.allSettled(reads);
    } finally {
      if (saved.revision !== revision) return;
      refreshing = false;
      if (enabled()) { if (dirty && !writes) { dirty = false;void refresh(); } else schedule(); }
    }
  }
  async function perform(message: Exclude<SupportWebMessage, { type: "support.activity" }>) {
    const saved = stamp(), { requestId } = message.data;
    if (!deps.snapshot().available) {
      deps.emit({ type: "operation.error", data: { action: message.type, requestId, message: "Sign in to contact support." } });return;
    }
    const fail = (error: unknown) => {
      const applicable = message.type === "support.load" || message.type === "support.open" ? current(saved) : owned(saved);
      if (applicable) deps.emit({ type: "operation.error", data: { action: message.type, requestId, message: errorMessage(error),
        ...("ticketId" in message.data ? { ticketId: message.data.ticketId } : {}), ...("clientMessageId" in message.data ? { clientMessageId: message.data.clientMessageId } : {}),
        ...(error instanceof ApiError ? { code: error.code, status: error.status } : {}) } });
    };
    if (message.type === "support.read" && (!enabled() || ticketId !== message.data.ticketId)) {
      fail(new ApiError("Open this support conversation to update its read status.", 409));return;
    }
    if (message.type === "support.load") {
      query = { status: message.data.status };const read = ++listRead;
      const params = { page: message.data.page ?? 1, ...query };
      try { const data = await consistentRead(() => deps.api.supportTickets(params), () => current(saved) && read === listRead);if (data) emitList(data, requestId); }
      catch (error) { if (read === listRead) fail(error); }
      return;
    }
    if (message.type === "support.open") {
      const read = ++detailRead;
      try {
        const data = await consistentRead(() => deps.api.supportTicket(message.data.ticketId, message.data.before), () => current(saved) && read === detailRead);
        if (data) deps.emit({ type: "data.supportTicket", data: { ...data, requestId, append: !!message.data.before } });
      } catch (error) { if (read === detailRead) fail(error); }
      return;
    }
    writes++;dataRevision++;
    try {
      switch (message.type) {
        case "support.create": {
          const { requestId: _, ...input } = message.data;
          const data = await deps.api.createSupportTicket(input);
          if (owned(saved)) deps.emit({ type: "support.created", data: { ...data, requestId } });break;
        }
        case "support.send": {
          const data = await deps.api.sendSupportMessage(message.data.ticketId, message.data.body, message.data.clientMessageId);
          if (owned(saved)) deps.emit({ type: "support.sent", data: { ...data, requestId, clientMessageId: message.data.clientMessageId } });break;
        }
        case "support.read": {
          const data = await deps.api.readSupportTicket(message.data.ticketId, message.data.throughMessageId);
          if (owned(saved)) deps.emit({ type: "support.read", data: { ...data, requestId } });break;
        }
        case "support.status": {
          const data = await deps.api.updateSupportTicket(message.data.ticketId, message.data.status);
          if (owned(saved)) deps.emit({ type: "support.status", data: { ...data, requestId } });break;
        }
      }
    } catch (error) { fail(error); }
    finally {
      if (saved.revision === revision) {
        writes--;dataRevision++;
        if (!writes) releaseReaders();
        if (owned(saved)) void unread(true);
        if (enabled()) { dirty = false;void refresh(); }
      }
    }
  }
  return {
    handle(message: SupportWebMessage): Promise<void> {
      if (message.type === "support.activity") {
        visible = message.data.active;ticketId = visible ? message.data.ticketId : undefined;
        viewRevision++;listRead++;detailRead++;schedule();return Promise.resolve();
      }
      const key = `${deps.snapshot().key}:${message.type}:${"ticketId" in message.data ? message.data.ticketId : ""}:${"clientMessageId" in message.data ? message.data.clientMessageId : message.data.requestId}`;
      const existing = pending.get(key);if (existing) return existing;
      const work = perform(message).finally(() => pending.delete(key));pending.set(key, work);return work;
    },
    changed(id?: string) { if (id) deps.emit({ type: "support.updated", data: { ticketId: id } });void unread(true);void refresh(id); },
    unread,
    foreground() { stopTimer();void unread();if (enabled()) void refresh(); },
    reset() { revision++;viewRevision++;dataRevision++;visible = false;ticketId = undefined;query = {};stopTimer();listRead++;detailRead++;dirty = false;refreshing = false;writes = 0;releaseReaders();summaryFlight = undefined;summaryKey = undefined;summaryInvalidated = false;lastSummary = 0; },
  };
}
