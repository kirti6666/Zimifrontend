import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, BackHandler, Keyboard, KeyboardAvoidingView, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import * as ScreenCapture from "expo-screen-capture";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import html from "./assets/aurora-bundle";
import { createBridge, postToWeb } from "./src/bridge";
import { LaunchScreen } from "./src/launch-screen";
import { readThemeCache, type ThemeCache } from "./src/theme-cache";
import { isTrustedDocument, parseWebMessage } from "./src/web-message";
import { useAppUpdates } from "./src/app-update";
import { AppUpdateScreen } from "./src/app-update-screen";

/* Matches --canvas in web/aurora.css for each theme. */
const CANVAS = { light: "#ffffff", dark: "#000000" } as const;
const INK = { light: "#101012", dark: "#ffffff" } as const;
/* The page says when its first screen has content (app.launched). This only caps
   how long a slow network keeps the logo up before the page shows its own loading. */
const LAUNCH_LIMIT_MS = 8000;

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
  const updates = useAppUpdates();
  return updates.state.status === "allowed" ? <AppContent /> : <AppUpdateScreen {...updates} />;
}

export function AppContent() {
  const cache = useMemo(() => readThemeCache(), []);
  const cached = cache.account?.theme ?? cache.default;
  const page = useMemo(() => html && withThemeCache(html, cache), [cache]);
  const webSource = useMemo(() => ({ html: page, baseUrl: "https://aurora.localhost/" }), [page]);
  const [theme, setTheme] = useState<Theme>("light");
  const [canvasOverride, setCanvasOverride] = useState<string | null>("#ffffff");
  const [palette, setPalette] = useState<NativePalette>({ ink: "#18181b", primary: cached?.colors.primary ?? "#c71862", contrast: "#ffffff", surface: "#ffffff", raised: "#f8f8fa" });
  const [failure, setFailure] = useState<string | null>(null);
  const [launched, setLaunched] = useState(false);
  const [launchVisible, setLaunchVisible] = useState(true);
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
  useEffect(() => () => { bridge.prepareForUpdate(); bridge.close(); }, [bridge]);
  useEffect(() => {
    if (launched) return;
    const timer = setTimeout(() => setLaunched(true), LAUNCH_LIMIT_MS);
    return () => clearTimeout(timer);
  }, [launched]);
  const hideLaunch = useCallback(() => setLaunchVisible(false), []);
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
    // The page can't tell the keyboard from a smaller window, so say when it is up;
    // the tab bar then steps aside instead of riding on top of the keyboard.
    const send = (open: boolean) => () => postToWeb(webRef, { type: "keyboard", data: { open } });
    const shown = Keyboard.addListener("keyboardDidShow", send(true));
    const hidden = Keyboard.addListener("keyboardDidHide", send(false));
    return () => { shown.remove(); hidden.remove(); };
  }, []);
  useEffect(() => {
    // Native app switching can precede WebView visibility changes. Give voice
    // capture/playback an explicit cleanup signal when the app loses focus.
    const subscription = AppState.addEventListener("change", state => {
      if (state !== "active") postToWeb(webRef, { type: "app.background", data: {} });
      else postToWeb(webRef, { type: "app.foreground", data: {} });
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
    } else if (msg.type === "app.launched") {
      setLaunched(true);
    } else if (msg.type === "app.exit.request") {
      requestExit();
    } else if (msg.type === "theme") {
      if (msg.data.theme === "light" || msg.data.theme === "dark") setTheme(msg.data.theme);
      const color = msg.data.canvas;
      setCanvasOverride(typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color) ? color : null);
      // Replace the palette, rather than merging it, so returning to login clears
      // the previous account's colors when the web theme attributes are removed.
      const next: NativePalette = { ink: msg.data.ink, primary: msg.data.primary, contrast: msg.data.contrast, surface: msg.data.surface, raised: msg.data.raised };
      setPalette(previous => Object.keys(next).every(key => previous[key as keyof NativePalette] === next[key as keyof NativePalette]) ? previous : next);
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
    // The page starts over, so the logo covers it until its first screen is ready again.
    setLaunched(false);
    setLaunchVisible(true);
    webRef.current?.reload();
    return true;
  }, [documentLoading]);

  const canvas = canvasOverride ?? CANVAS[theme];
  const ink = palette.ink ?? INK[theme];
  const primary = palette.primary ?? "#c71862";
  const contrast = palette.contrast ?? "#ffffff";

  return (
    <SafeAreaProvider>
      {/* Edge-to-edge Android (including Expo Go) can overlay the keyboard without
          resizing the WebView or its visual viewport. Resize its native container
          by the actual keyboard overlap, so every web composer stays visible. */}
      <KeyboardShell style={[styles.safe, { backgroundColor: canvas }]} accessibilityElementsHidden={launchVisible} importantForAccessibility={launchVisible ? "no-hide-descendants" : "auto"}>
        <SafeAreaView edges={["top", "right", "bottom", "left"]} style={[styles.safe, { backgroundColor: canvas }]}>
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
              source={webSource}
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
      </KeyboardShell>
      {launchVisible && <LaunchScreen ready={launched || !!failure || !page} onHidden={hideLaunch} />}
    </SafeAreaProvider>
  );
}

/* The keyboard's padding is measured from the screen's bottom edge, so it already covers the
   navigation bar or home indicator; the SafeAreaView inside still pads for that inset too.
   Taking the inset out of the keyboard padding seats every composer right on the keyboard
   instead of above an empty strip. */
function KeyboardShell(props: ComponentProps<typeof KeyboardAvoidingView>) {
  const { bottom } = useSafeAreaInsets();
  return <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={-bottom} {...props} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  web: { flex: 1 },
  center: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", padding: 24 },
  failTitle: { fontSize: 17, fontWeight: "700", marginBottom: 8 },
  failBody: { fontSize: 13, opacity: 0.7, textAlign: "center", marginBottom: 20 },
  retry: { borderRadius: 999, paddingHorizontal: 22, paddingVertical: 10 },
  retryText: { fontWeight: "700", fontSize: 14 },
});
