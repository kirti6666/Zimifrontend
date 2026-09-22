import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import html from "./assets/aurora-bundle";

/* Matches --canvas in web/aurora.css for each theme. */
const CANVAS = { light: "#ffffff", dark: "#000000" } as const;
const INK = { light: "#101012", dark: "#ffffff" } as const;

type Theme = keyof typeof CANVAS;

/* Mirrors the page's data-theme onto the native chrome so the safe-area
   padding and the status bar track the canvas the page is painting. */
const THEME_BRIDGE = `
(function () {
  var post = function () {
    window.ReactNativeWebView.postMessage(
      document.documentElement.dataset.theme || "light"
    );
  };
  new MutationObserver(post).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  post();
})();
true;
`;

export default function App() {
  const [theme, setTheme] = useState<Theme>("light");
  const [failure, setFailure] = useState<string | null>(null);
  const webRef = useRef<WebView>(null);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    const next = event.nativeEvent.data;
    if (next === "light" || next === "dark") setTheme(next);
  }, []);

  // Without this a failed load is just a white screen with nothing in the logs.
  const onError = useCallback((event: { nativeEvent: { description?: string } }) => {
    setFailure(event.nativeEvent.description || "The Aurora bundle failed to load.");
  }, []);

  // The WebView's renderer can be killed under memory pressure; reload instead
  // of leaving a blank view behind. Returning true tells Android we handled it.
  const reload = useCallback(() => {
    setFailure(null);
    webRef.current?.reload();
    return true;
  }, []);

  const canvas = CANVAS[theme];
  const ink = INK[theme];

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.safe, { backgroundColor: canvas }]}>
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
        {failure || !html ? (
          <View style={styles.center}>
            <Text style={[styles.failTitle, { color: ink }]}>Aurora could not start</Text>
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
            originWhitelist={["*"]}
            source={{ html, baseUrl: "https://aurora.localhost/" }}
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
