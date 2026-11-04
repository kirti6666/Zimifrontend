import * as SecureStore from "expo-secure-store";

// Independent from sign-in: account switching/logout must retain installation
// evidence. Never expose this value to the WebView or attach it to general APIs.
const KEY = "zimi.installation.v1";
const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
let cached: string | undefined, loading: Promise<string | undefined> | undefined;

export async function getInstallationId(): Promise<string | undefined> {
  if (cached) return cached;
  if (loading) return loading;
  const task = (async () => {
    try {
      const saved = await SecureStore.getItemAsync(KEY, OPTIONS);
      if (saved && uuid.test(saved)) return cached = saved.toLowerCase();
      // Expo's installed native core supplies an OS UUID generator. No weak
      // Math.random identifier or web storage fallback is used.
      const generated = globalThis.expo?.uuidv4?.();
      if (!generated || !uuid.test(generated)) return undefined;
      const identifier = generated.toLowerCase();
      await SecureStore.setItemAsync(KEY, identifier, OPTIONS);
      return cached = identifier;
    } catch {
      // Older clients and temporarily locked storage remain compatible. The
      // server still checks existing phone/FCM associations independently.
      return undefined;
    }
  })();
  loading = task;
  try { return await task; } finally { if (loading === task) loading = undefined; }
}
