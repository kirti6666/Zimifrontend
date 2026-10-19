import { API_CONFIGURATION_ERROR, API_URL } from "../config";
import {
  expireSession, getSessionVersion, getSessionSnapshot, getToken,
  isSessionTokens, rotateSessionTokens, SessionStorageError,
} from "../session";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export interface RequestOptions {
  auth?: boolean;
  refresh?: boolean;
  /** Captured credentials are accepted only for revoking a session after local logout. */
  bearerToken?: string;
}

const TIMEOUT_MS = 15000;
const CONNECTION_TIMEOUT_MS = 8000;
const NETWORK_MESSAGE = "Can't reach Zimi Live. Check your connection and try again.";
const SESSION_MESSAGE = "Your session has expired. Please sign in again.";
const PUBLIC_AUTH_PATHS = new Set(["/auth/otp/request", "/auth/otp/verify", "/auth/refresh"]);
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
let refreshing: { generation: number; promise: Promise<string> } | undefined;

export interface ConnectionStatus { connected: boolean; checking: boolean }
const connectionListeners = new Set<(status: ConnectionStatus) => void>();
let connectionStatus: ConnectionStatus | undefined;
let connectionAttempt = 0, observedAttempt = 0;
let connectionCheck: Promise<boolean> | undefined;
let checkingConnection = false;

/** Reachability of our server, independent of Socket.IO or device Wi-Fi state. */
export const getConnectionStatus = (): ConnectionStatus | undefined => connectionStatus && { ...connectionStatus };
export function onConnectionChanged(listener: (status: ConnectionStatus) => void): () => void {
  connectionListeners.add(listener);
  return () => { connectionListeners.delete(listener); };
}
function publishConnection(connected: boolean, attempt: number) {
  // A request started before a successful retry must not put the recovered UI offline.
  if (attempt < observedAttempt) return;
  observedAttempt = attempt;
  const status = { connected, checking: checkingConnection };
  if (connectionStatus?.connected === status.connected && connectionStatus.checking === status.checking) return;
  connectionStatus = status;
  for (const listener of connectionListeners) {
    try { listener({ ...status }); } catch { /* UI observers must not break requests. */ }
  }
}

/** A public, bounded probe. Never read, refresh, or transmit account credentials. */
export function checkConnection(): Promise<boolean> {
  if (connectionCheck) return connectionCheck;
  if (API_CONFIGURATION_ERROR) return Promise.reject(new ApiError(API_CONFIGURATION_ERROR, 0, "API_CONFIGURATION"));
  const attempt = ++connectionAttempt, abort = new AbortController();
  checkingConnection = true;
  publishConnection(connectionStatus?.connected ?? true, attempt);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abort.abort();
      reject(new ApiError("The connection check took too long.", 0, "REQUEST_TIMEOUT"));
    }, CONNECTION_TIMEOUT_MS);
  });
  connectionCheck = (async () => {
    try {
      await Promise.race([
        fetch(new URL("/health", API_URL).href, {
          method: "GET", headers: { Accept: "application/json" }, signal: abort.signal,
          credentials: "omit", redirect: "error", cache: "no-store",
        }),
        timeout,
      ]);
      // Any HTTP status proves the server is reachable. Service errors remain in their own UI.
      publishConnection(true, attempt);
      return true;
    } catch {
      publishConnection(false, attempt);
      return false;
    } finally {
      clearTimeout(timer);
      checkingConnection = false;
      publishConnection(connectionStatus?.connected ?? false, observedAttempt);
      connectionCheck = undefined;
    }
  })();
  return connectionCheck;
}

function retryDelay(response: Response, body: unknown): number | undefined {
  const header = response.headers.get("Retry-After");
  let seconds: number | undefined;
  if (header) {
    const numeric = Number(header);
    seconds = Number.isFinite(numeric) ? numeric : (Date.parse(header) - Date.now()) / 1000;
  }
  const fromBody = object(body) ? Number(body.retryAfterSeconds ?? (object(body.data) ? body.data.retryAfterSeconds : undefined)) : NaN;
  const candidates = [seconds, fromBody].filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0);
  return candidates.length ? Math.ceil(Math.max(...candidates)) : undefined;
}

function responseError(response: Response, body: unknown): ApiError {
  const code = object(body) && typeof body.code === "string" && /^[A-Z0-9_]{1,80}$/.test(body.code) ? body.code : undefined;
  const mediaMessage = code === "STORAGE_NOT_CONFIGURED" ? "Photo uploads are not available yet. Please try again later." :
    code === "UPLOAD_UNAVAILABLE" ? "Couldn't confirm your upload. Please try again." : undefined;
  const fallback = response.status === 429 ? "Too many attempts. Please wait before trying again." :
    response.status >= 500 ? "Zimi Live is temporarily unavailable. Please try again shortly." : "Couldn't complete that request. Please try again.";
  const raw = object(body) && typeof body.message === "string" ? body.message : "";
  // User-facing failures never contain HTML, stack traces, or oversized server responses.
  const message = response.status >= 500 && mediaMessage ? mediaMessage :
    response.status < 500 && raw.length > 0 && raw.length <= 500 && !/[<>\x00-\x08]/.test(raw) ? raw : fallback;
  return new ApiError(message, response.status, code, retryDelay(response, body));
}

async function exchange<T>(method: Method, path: string, body?: unknown, token?: string | null): Promise<T> {
  if (API_CONFIGURATION_ERROR) throw new ApiError(API_CONFIGURATION_ERROR, 0, "API_CONFIGURATION");
  if (!path.startsWith("/") || path.startsWith("//") || /[\r\n]/.test(path)) {
    throw new ApiError("The request address is invalid.", 0, "INVALID_REQUEST");
  }
  const abort = new AbortController();
  const attempt = ++connectionAttempt;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abort.abort();
      reject(new ApiError("The request took too long. Check your connection and try again.", 0, "REQUEST_TIMEOUT"));
    }, TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(API_URL + path, {
          method,
          headers: {
            Accept: "application/json",
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: abort.signal,
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
        });
        if (!abort.signal.aborted) publishConnection(true, attempt);
        if (response.status === 204) return undefined as T;
        // The deadline covers the response body too, including a stalled JSON download.
        const raw = await response.text();
        let parsed: unknown;
        try { parsed = raw ? JSON.parse(raw) : null; }
        catch {
          if (!response.ok) throw responseError(response, null);
          throw new ApiError("The server returned an unexpected response. Please try again.", response.status, "INVALID_RESPONSE");
        }
        if (!response.ok) throw responseError(response, parsed);
        if (!object(parsed) || parsed.success !== true) {
          throw new ApiError("The server returned an unexpected response. Please try again.", response.status, "INVALID_RESPONSE");
        }
        return parsed.data as T;
      })(),
      timeout,
    ]);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.code === "NETWORK_ERROR" || error.code === "REQUEST_TIMEOUT") publishConnection(false, attempt);
      throw error;
    }
    publishConnection(false, attempt);
    throw new ApiError(NETWORK_MESSAGE, 0, "NETWORK_ERROR");
  } finally { clearTimeout(timer); }
}

const changedSession = () => new ApiError("Your session changed. Please try again.", 401, "SESSION_CHANGED");

async function refreshAccess(expected: number): Promise<string> {
  if (refreshing?.generation === expected) return refreshing.promise;
  const task = {
    generation: expected,
    promise: (async () => {
      const snapshot = await getSessionSnapshot();
      if (snapshot.generation !== expected) throw changedSession();
      if (!snapshot.session || snapshot.session.refreshExpiresAt <= Date.now()) {
        await expireSession(expected);
        throw new ApiError(SESSION_MESSAGE, 401, "SESSION_EXPIRED");
      }
      try {
        const data = await exchange<unknown>("POST", "/auth/refresh", { refreshToken: snapshot.session.refreshToken });
        if (getSessionVersion() !== expected) throw changedSession();
        if (!object(data) || !isSessionTokens(data.tokens)) {
          await expireSession(expected);
          throw new ApiError(SESSION_MESSAGE, 401, "INVALID_SESSION");
        }
        if (!(await rotateSessionTokens(data.tokens, expected))) throw changedSession();
        return data.tokens.accessToken;
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) await expireSession(expected);
        // Connectivity, rate limits and server outages preserve the stored session.
        throw error;
      }
    })(),
  };
  refreshing = task;
  try { return await task.promise; }
  finally { if (refreshing === task) refreshing = undefined; }
}

/** Authenticated calls retry once, only after a 401 and a successful token refresh. */
export async function request<T>(method: Method, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  const authenticated = options.auth !== false && !PUBLIC_AUTH_PATHS.has(path);
  if (options.bearerToken && (path !== "/auth/logout" || options.auth !== false)) {
    throw new ApiError("The request credentials are invalid.", 0, "INVALID_REQUEST");
  }
  if (!authenticated) return exchange<T>(method, path, body, options.bearerToken);
  try {
    const { generation: expected, session } = await getSessionSnapshot();
    if (!session) throw new ApiError(SESSION_MESSAGE, 401, "SESSION_EXPIRED");
    let token = session.accessToken;
    try {
      const data = await exchange<T>(method, path, body, token);
      if (getSessionVersion() !== expected) throw changedSession();
      return data;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401 || options.refresh === false) throw error;
      if (getSessionVersion() !== expected) throw changedSession();
      const current = await getToken();
      // Another request might have finished refreshing while this 401 was in transit.
      token = current && current !== token ? current : await refreshAccess(expected);
    }
    try {
      if (getSessionVersion() !== expected) throw changedSession();
      const data = await exchange<T>(method, path, body, token);
      if (getSessionVersion() !== expected) throw changedSession();
      return data;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && getSessionVersion() === expected && await getToken() === token) await expireSession(expected);
      throw error;
    }
  } catch (error) {
    if (error instanceof SessionStorageError) throw new ApiError(error.message, 0, "SECURE_STORAGE_ERROR");
    throw error;
  }
}

export const errorMessage = (error: unknown): string =>
  error instanceof ApiError || error instanceof SessionStorageError ? error.message : "Something went wrong. Please try again.";
