/* Expo substitutes these public configuration values at build time. They are
   addresses only: credentials must never be put in EXPO_PUBLIC_* variables. */
const DEVELOPMENT = typeof __DEV__ !== "undefined" && __DEV__;

function localHost(host: string): boolean {
  if (["localhost", "127.0.0.1", "[::1]"].includes(host) || host.endsWith(".local")) return true;
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 169 && parts[1] === 254);
}

function configurationError(address: string): string | null {
  if (!address) return "The server address is not set. Please configure EXPO_PUBLIC_API_URL and restart the app.";
  try {
    const url = new URL(address);
    if (url.username || url.password || url.search || url.hash) return "The server address is invalid.";
    if (url.protocol === "https:") return null;
    if (DEVELOPMENT && localHost(url.hostname) && url.protocol === "http:") return null;
    return "A secure HTTPS server is required. Local HTTP is available only in development builds.";
  } catch { return "The server address is invalid. Please check the app configuration."; }
}

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").trim().replace(/\/+$/, "");
export const API_CONFIGURATION_ERROR = configurationError(API_URL);

let defaultSocketOrigin = "";
try { defaultSocketOrigin = new URL(API_URL).origin; } catch { /* Report API configuration on request. */ }
const socketAddress = (process.env.EXPO_PUBLIC_SOCKET_URL ?? defaultSocketOrigin).trim().replace(/\/+$/, "");
// Socket.IO uses an HTTP origin. Never downgrade its credential-bearing connection.
export const SOCKET_URL = configurationError(socketAddress) ? "" : socketAddress;
