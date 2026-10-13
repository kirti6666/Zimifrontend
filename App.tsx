import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import html from "./assets/aurora-bundle";
import { createBridge, postToWeb } from "./src/bridge";
import { isTrustedDocument, parseWebMessage } from "./src/web-message";

/* Matches --canvas in web/aurora.css for each theme. */
const CANVAS = { light: "#ffffff", dark: "#000000" } as const;
const INK = { light: "#101012", dark: "#ffffff" } as const;

type Theme = keyof typeof CANVAS;

/* Mirrors the page's data-theme onto the native chrome so the safe-area
   padding and the status bar track the canvas the page is painting. */
const THEME_BRIDGE = `
(function () {
  var post = function () {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: "theme",
      data: {
        theme: document.documentElement.dataset.theme || "light",
        canvas: document.documentElement.dataset.canvas || ""
      }
    }));
  };
  new MutationObserver(post).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-canvas"],
  });
  post();
})();
true;
`;

export default function App() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [canvasOverride, setCanvasOverride] = useState<string | null>("#190d19");
  const [failure, setFailure] = useState<string | null>(null);
  const webRef = useRef<WebView>(null);
  const lastHapticAt = useRef(0);

  // Everything the screens ask of the server goes through src/bridge.ts.
  const bridge = useMemo(() => createBridge((msg) => postToWeb(webRef, msg)), []);
  useEffect(() => bridge.close, [bridge]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    if (!isTrustedDocument(event.nativeEvent.url)) return;
    const msg = parseWebMessage(event.nativeEvent.data);
    if (!msg) return;
    if (msg.type === "theme") {
      if (msg.data.theme === "light" || msg.data.theme === "dark") setTheme(msg.data.theme);
      const color = msg.data.canvas;
      setCanvasOverride(typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color) ? color : null);
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
    } else bridge.handle(msg);
  }, [bridge]);

  // Without this a failed load is just a white screen with nothing in the logs.
  const onError = useCallback((event: { nativeEvent: { description?: string } }) => {
    setFailure(event.nativeEvent.description || "The Zimi Live bundle failed to load.");
  }, []);

  // The WebView's renderer can be killed under memory pressure; reload instead
  // of leaving a blank view behind. Returning true tells Android we handled it.
  const reload = useCallback(() => {
    setFailure(null);
    webRef.current?.reload();
    return true;
  }, []);

  const canvas = canvasOverride ?? CANVAS[theme];
  const ink = INK[theme];

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.safe, { backgroundColor: canvas }]}>
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
        {failure || !html ? (
          <View style={styles.center}>
            <Text style={[styles.failTitle, { color: ink }]}>Zimi Live could not start</Text>
            <Text style={[styles.failBody, { color: ink }]}>
              {failure ?? "The bundle is empty. Run `npm run build:web` and restart."}
            </Text>
            <Pressable onPress={reload} style={styles.retry}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <WebView
            ref={webRef}
            style={[styles.web, { backgroundColor: canvas }]}
            originWhitelist={["https://aurora.localhost", "about:blank"]}
            source={{ html, baseUrl: "https://aurora.localhost/" }}
            onShouldStartLoadWithRequest={request => isTrustedDocument(request.url)}
            setSupportMultipleWindows={false}
            allowFileAccess={false}
            allowFileAccessFromFileURLs={false}
            allowUniversalAccessFromFileURLs={false}
            mixedContentMode="never"
            injectedJavaScript={THEME_BRIDGE}
            onMessage={onMessage}
            onError={onError}
            onRenderProcessGone={reload}
            onContentProcessDidTerminate={reload}
            startInLoadingState
            renderLoading={() => (
              <View style={[styles.center, { backgroundColor: canvas }]}>
                <ActivityIndicator color={ink} />
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
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  web: { flex: 1 },
  center: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", padding: 24 },
  failTitle: { fontSize: 17, fontWeight: "700", marginBottom: 8 },
  failBody: { fontSize: 13, opacity: 0.7, textAlign: "center", marginBottom: 20 },
  retry: { backgroundColor: "#e8117a", borderRadius: 99, paddingHorizontal: 22, paddingVertical: 10 },
  retryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
