/* Server addresses, read from .env at build time (see .env.example).
   Left empty, the app still opens but every request fails with a clear message. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

/* Live events (incoming calls, gifts, chat). Defaults to <API_URL>/ws over ws(s). */
export const SOCKET_URL =
  process.env.EXPO_PUBLIC_SOCKET_URL ?? (API_URL ? API_URL.replace(/^http/, "ws") + "/ws" : "");
