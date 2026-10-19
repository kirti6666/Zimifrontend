import * as SecureStore from "expo-secure-store";
import { themeFrom } from "./api/adapters";
import type { AppTheme } from "./api/types";

/* The admin default and the signed-in member's theme from the last launch,
   so the next launch paints the right colors from its very first frame. */
const KEY = "zimi.theme.v1";
export interface ThemeCache { default?: AppTheme; account?: { id: string; theme: AppTheme } }

// Only what painting needs; keeps the entry well under SecureStore's 2 KB guidance.
const compact = ({ id, name, mode, colors, typography }: AppTheme) => ({ id, name, mode, colors, typography });

function parse(raw: string | null): ThemeCache {
  const cache: ThemeCache = {};
  try {
    const data = JSON.parse(raw ?? "{}");
    if (data.default) cache.default = themeFrom(data.default);
    if (data.account && /^[\w-]{1,64}$/.test(data.account.id)) cache.account = { id: data.account.id, theme: themeFrom(data.account.theme) };
  } catch { /* A corrupt entry reads as empty; the server answer replaces it. */ }
  return cache;
}

/** Synchronous, so the first render can embed it in the page. */
export function readThemeCache(): ThemeCache {
  try { return parse(SecureStore.getItem(KEY)); } catch { return {}; }
}

let writing: Promise<void> = Promise.resolve();
function update(change: (cache: ThemeCache) => ThemeCache) {
  // Serialized read-modify-write; a failed write only costs the next launch a fallback frame.
  writing = writing.then(async () => {
    const next = change(parse(await SecureStore.getItemAsync(KEY)));
    await SecureStore.setItemAsync(KEY, JSON.stringify({
      ...(next.default ? { default: compact(next.default) } : {}),
      ...(next.account ? { account: { id: next.account.id, theme: compact(next.account.theme) } } : {}),
    }));
  }).catch(() => {});
  return writing;
}
export const rememberDefaultTheme = (theme: AppTheme) => update(cache => ({ ...cache, default: theme }));
export const rememberAccountTheme = (id: string, theme: AppTheme) => update(cache => ({ ...cache, account: { id, theme } }));
export const forgetAccountTheme = () => update(cache => ({ default: cache.default }));
