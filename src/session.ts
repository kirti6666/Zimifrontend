import * as SecureStore from "expo-secure-store";

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

interface StoredSession {
  version: 1;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
}

const KEY = "zimi.session.v1";
const LEGACY_KEY = "zimi.token";
const STORAGE_OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
let cached: StoredSession | null | undefined;
let loading: Promise<StoredSession | null> | undefined;
let storageQueue: Promise<void> = Promise.resolve();
let generation = 0;
const expiryListeners = new Set<() => void>();
const tokenListeners = new Set<() => void>();

export class SessionStorageError extends Error {
  constructor() {
    super("Couldn't access secure session storage. Please unlock your device and try again.");
    this.name = "SessionStorageError";
  }
}

function notify(listeners: Set<() => void>) {
  for (const listener of listeners) {
    try { listener(); } catch { /* A UI subscriber must not disrupt secure storage. */ }
  }
}

function enqueueStorage(work: () => Promise<void>): Promise<void> {
  const task = storageQueue.then(work);
  storageQueue = task.catch(() => {});
  return task;
}

function validToken(value: unknown): value is string {
  return typeof value === "string" && value.length >= 20 && value.length <= 8192 && !/\s/.test(value);
}

export function isSessionTokens(value: unknown): value is SessionTokens {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return validToken(data.accessToken) && validToken(data.refreshToken) &&
    typeof data.expiresIn === "number" && Number.isFinite(data.expiresIn) && data.expiresIn > 0 && data.expiresIn <= 2147483647 &&
    typeof data.refreshExpiresIn === "number" && Number.isFinite(data.refreshExpiresIn) && data.refreshExpiresIn > 0 && data.refreshExpiresIn <= 2147483647;
}

function parseSession(raw: string | null): StoredSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as StoredSession;
    if (value?.version !== 1 || !validToken(value.accessToken) || !validToken(value.refreshToken) ||
      !Number.isFinite(value.accessExpiresAt) || !Number.isFinite(value.refreshExpiresAt)) return null;
    return value;
  } catch { return null; }
}

async function readSession(): Promise<StoredSession | null> {
  if (cached !== undefined) return cached;
  if (loading) return loading;
  const expected = generation;
  const task = (async () => {
    try {
      const raw = await SecureStore.getItemAsync(KEY, STORAGE_OPTIONS);
      // A disk read started before logout/login must never restore an older identity.
      if (generation !== expected) return cached ?? null;
      cached = parseSession(raw);
      if (raw && !cached) await enqueueStorage(async () => {
        if (generation === expected) await SecureStore.deleteItemAsync(KEY, STORAGE_OPTIONS);
      });
      return cached;
    } catch { throw new SessionStorageError(); }
  })();
  loading = task;
  try { return await task; }
  finally { if (loading === task) loading = undefined; }
}

export async function getToken(): Promise<string | null> {
  await readSession();
  return cached?.accessToken ?? null;
}

/** Capture the active native credential synchronously before invalidating logout. */
export function getCachedToken(): string | null { return cached?.accessToken ?? null; }

/** Only the native transport reads refresh credentials. Never send this to the WebView. */
export async function getSessionSnapshot() {
  await readSession();
  return { generation, session: cached ?? null };
}

export function getSessionVersion(): number { return generation; }

async function persist(session: StoredSession, expected: number): Promise<boolean> {
  try {
    await enqueueStorage(async () => {
      if (generation !== expected) return;
      // Store the pair together so interruption cannot leave mismatched rotated tokens.
      await SecureStore.setItemAsync(KEY, JSON.stringify(session), STORAGE_OPTIONS);
      await SecureStore.deleteItemAsync(LEGACY_KEY);
    });
    if (generation !== expected) return false;
    notify(tokenListeners);
    return true;
  } catch {
    if (generation === expected) await expireSession(expected).catch(() => {});
    throw new SessionStorageError();
  }
}

function storedTokens(tokens: SessionTokens): StoredSession {
  if (!isSessionTokens(tokens)) throw new Error("The server returned an invalid sign-in session. Please try again.");
  const now = Date.now();
  return {
    version: 1,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    accessExpiresAt: now + tokens.expiresIn * 1000,
    refreshExpiresAt: now + tokens.refreshExpiresIn * 1000,
  };
}

export async function setSessionTokens(tokens: SessionTokens, expectedVersion?: number): Promise<boolean> {
  if (expectedVersion !== undefined && generation !== expectedVersion) return false;
  const session = storedTokens(tokens);
  const expected = ++generation;
  cached = session;
  loading = undefined;
  return persist(session, expected);
}

/** A refresh may update its own identity, but cannot restore a logged-out session. */
export async function rotateSessionTokens(tokens: SessionTokens, expected: number): Promise<boolean> {
  if (generation !== expected || !cached) return false;
  const session = storedTokens(tokens);
  cached = session;
  return persist(session, expected);
}

export async function clearToken(): Promise<void> {
  // These synchronous changes invalidate refreshes before SecureStore is awaited.
  ++generation;
  cached = null;
  loading = undefined;
  notify(tokenListeners);
  try {
    await enqueueStorage(async () => {
      await SecureStore.deleteItemAsync(KEY, STORAGE_OPTIONS);
      await SecureStore.deleteItemAsync(LEGACY_KEY);
    });
  } catch { throw new SessionStorageError(); }
}

export async function expireSession(expected: number): Promise<void> {
  if (generation !== expected) return;
  const cleared = clearToken();
  notify(expiryListeners);
  await cleared;
}

export function onSessionExpired(listener: () => void): () => void {
  expiryListeners.add(listener);
  return () => { expiryListeners.delete(listener); };
}

export function onTokenChanged(listener: () => void): () => void {
  tokenListeners.add(listener);
  return () => { tokenListeners.delete(listener); };
}
