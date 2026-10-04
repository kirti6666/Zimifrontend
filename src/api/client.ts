import { API_URL } from "../config";
import { clearToken, getToken } from "../session";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const TIMEOUT_MS = 15000;

/* One JSON request to the server. Errors carry a message that can be shown
   to the user; the server is expected to send { "message": "..." } on failure. */
export async function request<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  if (!API_URL) throw new ApiError("The server address is not set (EXPO_PUBLIC_API_URL).", 0);

  const token = await getToken();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: abort.signal,
    });
  } catch {
    throw new ApiError("Can't reach Zimi Live. Check your connection and try again.", 0);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) await clearToken();
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(err?.message || "Something went wrong. Try again.", res.status);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Try again.";
