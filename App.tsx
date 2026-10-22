import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, BackHandler, Image, KeyboardAvoidingView, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import * as ScreenCapture from "expo-screen-capture";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import html from "./assets/aurora-bundle";
import brandLogo from "./assets/brand/logo.png";
import { createBridge, postToWeb } from "./src/bridge";
import { readThemeCache, type ThemeCache } from "./src/theme-cache";
import { isTrustedDocument, parseWebMessage } from "./src/web-message";

/* Matches --canvas in web/aurora.css for each theme. */
const CANVAS = { light: "#ffffff", dark: "#000000" } as const;
const INK = { light: "#101012", dark: "#ffffff" } as const;
const PLACEHOLDER = { light: "#e9e1e7", dark: "#3a2637" } as const;
const PLACEHOLDER_SURFACE = { light: "#f7f1f5", dark: "#291a28" } as const;

type Theme = keyof typeof CANVAS;
/* One key for every private screen, so turning protection off undoes exactly this. */
const PRIVATE_SCREEN = "zimi-private-screen";
type NativePalette = Partial<Record<"ink" | "primary" | "contrast" | "surface" | "raised", string>>;

/* Mirrors the page's data-theme onto the native chrome so the safe-area
   padding and the status bar track the canvas the page is painting. */
const THEME_BRIDGE = `
(function () {
  var post = function () {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: "theme",
      data: {
        theme: document.documentElement.dataset.theme || "light",
        canvas: document.documentElement.dataset.canvas || "",
        ink: document.documentElement.dataset.themeInk || undefined,
        primary: document.documentElement.dataset.themePrimary || undefined,
        contrast: document.documentElement.dataset.themeContrast || undefined,
        surface: document.documentElement.dataset.themeSurface || undefined,
        raised: document.documentElement.dataset.themeRaised || undefined
      }
    }));
  };
  new MutationObserver(post).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-canvas", "data-theme-ink", "data-theme-primary", "data-theme-contrast", "data-theme-surface", "data-theme-raised"],
  });
  post();
})();
true;
`;

/* Part of the page itself: Android may run injected scripts only after the first paint. */
const withThemeCache = (page: string, cache: ThemeCache) =>
  page.replace("<head>", `<head><script>window.__zimiThemeCache=${JSON.stringify(cache).replace(/</g, "\\u003c")}</script>`);

export default function App() {
  const cache = useMemo(() => readThemeCache(), []);
  const cached = cache.account?.theme ?? cache.default;
  const page = useMemo(() => html && withThemeCache(html, cache), [cache]);
  const [theme, setTheme] = useState<Theme>(cached?.mode ?? "dark");
  const [canvasOverride, setCanvasOverride] = useState<string | null>(cached?.colors.background ?? "#210f1d");
  const [palette, setPalette] = useState<NativePalette>(cached ? { ink: cached.colors.text, primary: cached.colors.primary, contrast: cached.colors.primaryContrast, surface: cached.colors.surface, raised: cached.colors.surfaceElevated } : {});
  const [failure, setFailure] = useState<string | null>(null);
  const webRef = useRef<WebView>(null);
  const lastHapticAt = useRef(0);
  const webReady = useRef(false);
  const exitConfirmation = useRef<object | null>(null);

  // Everything the screens ask of the server goes through src/bridge.ts.
  const bridge = useMemo(() => createBridge((msg) => postToWeb(webRef, msg)), []);
  const documentLoading = useCallback(() => {
    webReady.current = false;
    exitConfirmation.current = null;
    bridge.documentLoading();
  }, [bridge]);
  useEffect(() => bridge.close, [bridge]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!webReady.current) return false;
      // The page owns its screens and overlays; WebView history cannot see them.
      postToWeb(webRef, { type: "app.back", data: {} });
      return true;
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    // Native app switching can precede WebView visibility changes. Give voice
    // capture/playback an explicit cleanup signal when the app loses focus.
    const subscription = AppState.addEventListener("change", state => {
      if (state !== "active") postToWeb(webRef, { type: "app.background", data: {} });
    });
    return () => subscription.remove();
  }, []);

  const requestExit = useCallback(() => {
    if (!webReady.current || exitConfirmation.current) return;
    const confirmation = {};
    exitConfirmation.current = confirmation;
    const dismiss = () => {
      if (exitConfirmation.current !== confirmation) return false;
      exitConfirmation.current = null;
      return webReady.current;
    };
    Alert.alert("Close BinzoLive?", "Are you sure you want to close the app?", [
      { text: "Cancel", style: "cancel", onPress: dismiss },
      { text: "Close app", onPress: () => { if (dismiss()) BackHandler.exitApp(); } },
    ], { cancelable: true, onDismiss: dismiss });
  }, []);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    if (!isTrustedDocument(event.nativeEvent.url)) return;
    const msg = parseWebMessage(event.nativeEvent.data);
    if (!msg) return;
    if (msg.type === "ready") {
      webReady.current = true;
      bridge.handle(msg);
    } else if (msg.type === "app.exit.request") {
      requestExit();
    } else if (msg.type === "theme") {
      if (msg.data.theme === "light" || msg.data.theme === "dark") setTheme(msg.data.theme);
      const color = msg.data.canvas;
      setCanvasOverride(typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color) ? color : null);
      // Replace the palette, rather than merging it, so returning to login clears
      // the previous account's colors when the web theme attributes are removed.
      setPalette({ ink: msg.data.ink, primary: msg.data.primary, contrast: msg.data.contrast, surface: msg.data.surface, raised: msg.data.raised });
    } else if (msg.type === "ui.haptic") {
      // Guard against bursts of pointer events; OS settings still decide if
      // tactile feedback is available on this device.
      const now = Date.now();
      if ((msg.data.kind === "selection" || msg.data.kind === "light") && now - lastHapticAt.current < 45) return;
      lastHapticAt.current = now;
      let feedback: Promise<void>;
      switch (msg.data.kind) {
        case "selection": feedback = Haptics.selectionAsync(); break;
        case "success": feedback = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); break;
        case "error": feedback = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); break;
        case "light": feedback = Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); break;
        default: return;
      }
      // Unavailable haptics must never interrupt the UI or network actions.
      void feedback.catch(() => {});
    } else if (msg.type === "screen.secure") {
      // Video calls and chats: screenshots and screen recordings show nothing while they are open.
      void (msg.data.on ? ScreenCapture.preventScreenCaptureAsync(PRIVATE_SCREEN) : ScreenCapture.allowScreenCaptureAsync(PRIVATE_SCREEN)).catch(() => {});
    } else bridge.handle(msg);
  }, [bridge, requestExit]);

  // Without this a failed load is just a white screen with nothing in the logs.
  const onError = useCallback((event: { nativeEvent: { description?: string } }) => {
    documentLoading();
    setFailure(event.nativeEvent.description || "The BinzoLive bundle failed to load.");
  }, [documentLoading]);

  // The WebView's renderer can be killed under memory pressure; reload instead
  // of leaving a blank view behind. Returning true tells Android we handled it.
  const reload = useCallback(() => {
    documentLoading();
    setFailure(null);
    webRef.current?.reload();
    return true;
  }, [documentLoading]);

  const canvas = canvasOverride ?? CANVAS[theme];
  const ink = palette.ink ?? INK[theme];
  const primary = palette.primary ?? "#ec0785";
  const contrast = palette.contrast ?? "#ffffff";
  const placeholder = palette.raised ?? PLACEHOLDER[theme];
  const placeholderSurface = palette.surface ?? PLACEHOLDER_SURFACE[theme];

  return (
    <SafeAreaProvider>
      {/* Edge-to-edge Android (including Expo Go) can overlay the keyboard without
          resizing the WebView or its visual viewport. Resize its native container
          by the actual keyboard overlap, so every web composer stays visible. */}
      <KeyboardAvoidingView behavior="padding" style={[styles.safe, { backgroundColor: canvas }]}>
        <SafeAreaView style={[styles.safe, { backgroundColor: canvas }]}>
          <StatusBar style={theme === "dark" ? "light" : "dark"} />
          {failure || !page ? (
            <View style={styles.center}>
              <Text style={[styles.failTitle, { color: ink }]}>BinzoLive could not start</Text>
              <Text style={[styles.failBody, { color: ink }]}>
                {failure ?? "The bundle is empty. Run `npm run build:web` and restart."}
              </Text>
              <Pressable onPress={reload} style={[styles.retry, { backgroundColor: primary }]}>
                <Text style={[styles.retryText, { color: contrast }]}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <WebView
              ref={webRef}
              style={[styles.web, { backgroundColor: canvas }]}
              originWhitelist={["https://aurora.localhost", "about:blank"]}
              source={{ html: page, baseUrl: "https://aurora.localhost/" }}
              onShouldStartLoadWithRequest={request => isTrustedDocument(request.url)}
              setSupportMultipleWindows={false}
              allowFileAccess={false}
              allowFileAccessFromFileURLs={false}
              allowUniversalAccessFromFileURLs={false}
              mixedContentMode="never"
              injectedJavaScript={THEME_BRIDGE}
              onLoadStart={documentLoading}
              onMessage={onMessage}
              onError={onError}
              onRenderProcessGone={reload}
              onContentProcessDidTerminate={reload}
              startInLoadingState
              renderLoading={() => (
                <View style={[styles.loading, { backgroundColor: canvas }]} accessible accessibilityRole="progressbar" accessibilityLabel="Loading BinzoLive" accessibilityState={{ busy: true }}>
                  <View style={styles.loadingContent} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <View style={styles.loadingHeader}>
                      <View style={styles.loadingBrand}><Image source={brandLogo} style={styles.loadingLogo} resizeMode="contain" /></View>
                      <View style={[styles.loadingPill, { backgroundColor: placeholder }]} />
                    </View>
                    <View style={[styles.loadingHeading, { backgroundColor: placeholder }]} />
                    <View style={styles.loadingStories}>
                      {[0, 1, 2, 3, 4].map(index => (
                        <View key={index} style={styles.loadingStory}>
                          <View style={[styles.loadingAvatar, { backgroundColor: placeholder }]} />
                          <View style={[styles.loadingStoryLabel, { backgroundColor: placeholder }]} />
                        </View>
                      ))}
                    </View>
                    <View style={styles.loadingFilters}>
                      {[0, 1, 2].map(index => <View key={index} style={[styles.loadingFilter, { backgroundColor: placeholder }]} />)}
                    </View>
                    <View style={[styles.loadingHero, { backgroundColor: placeholderSurface }]}>
                      <View style={[styles.loadingHeroTitle, { backgroundColor: placeholder }]} />
                      <View style={[styles.loadingHeroLine, { backgroundColor: placeholder }]} />
                      <View style={[styles.loadingHeroAction, { backgroundColor: placeholder }]} />
                    </View>
                    <View style={styles.loadingCards}>
                      {[0, 1].map(index => <View key={index} style={[styles.loadingCard, { backgroundColor: placeholderSurface }]} />)}
                    </View>
                  </View>
                </View>
              )}
              // The page is a single 100dvh screen that scrolls its own inner
              // containers, so the WebView's outer scroll view is left alone:
              // disabling it is an iOS-only no-op here that can block inner scroll.
              javaScriptEnabled
              webviewDebuggingEnabled={typeof __DEV__ !== "undefined" && __DEV__}
              domStorageEnabled
              bounces={false}
              overScrollMode="never"
              setBuiltInZoomControls={false}
              textZoom={100}
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              keyboardDisplayRequiresUserAction={false}
              automaticallyAdjustContentInsets={false}
              contentInsetAdjustmentBehavior="never"
            />
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  web: { flex: 1 },
  center: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", padding: 24 },
  loading: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, alignItems: "center", overflow: "hidden" },
  loadingContent: { width: "100%", maxWidth: 540 },
  loadingHeader: { flexDirection: "row", alignItems: "center", gap: 12, height: 48, marginBottom: 20 },
  loadingBrand: { flex: 1 },
  // Matches the Home header wordmark, so nothing jumps when the screens appear.
  loadingLogo: { width: 76, height: 30 },
  loadingPill: { width: 65, height: 30, borderRadius: 20 },
  loadingHeading: { width: "52%", height: 16, borderRadius: 6, marginBottom: 18 },
  loadingStories: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginBottom: 26 },
  loadingStory: { flex: 1, alignItems: "center", gap: 9 },
  loadingAvatar: { width: "100%", maxWidth: 58, aspectRatio: 1, borderRadius: 32 },
  loadingStoryLabel: { width: "72%", height: 9, borderRadius: 5 },
  loadingFilters: { flexDirection: "row", gap: 8, marginBottom: 24 },
  loadingFilter: { flex: 1, height: 34, borderRadius: 20 },
  loadingHero: { height: 320, borderRadius: 20, padding: 16, justifyContent: "flex-end", gap: 12 },
  loadingHeroTitle: { width: "52%", height: 21, borderRadius: 6 },
  loadingHeroLine: { width: "82%", height: 11, borderRadius: 6 },
  loadingHeroAction: { height: 46, borderRadius: 14, marginTop: 4 },
  loadingCards: { flexDirection: "row", gap: 10, marginTop: 24 },
  loadingCard: { flex: 1, height: 180, borderRadius: 15 },
  failTitle: { fontSize: 17, fontWeight: "700", marginBottom: 8 },
  failBody: { fontSize: 13, opacity: 0.7, textAlign: "center", marginBottom: 20 },
  retry: { borderRadius: 99, paddingHorizontal: 22, paddingVertical: 10 },
  retryText: { fontWeight: "700", fontSize: 14 },
});
