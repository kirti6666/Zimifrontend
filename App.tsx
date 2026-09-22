import { useCallback, useState } from "react";
import { StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import html from "./assets/aurora-bundle";

/* Matches --canvas in web/aurora.css for each theme. */
const CANVAS = { light: "#ffffff", dark: "#000000" } as const;

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

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    const next = event.nativeEvent.data;
    if (next === "light" || next === "dark") setTheme(next);
  }, []);

  const canvas = CANVAS[theme];

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.safe, { backgroundColor: canvas }]}>
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
        <WebView
          style={[styles.web, { backgroundColor: canvas }]}
          originWhitelist={["*"]}
          source={{ html, baseUrl: "https://aurora.localhost/" }}
          injectedJavaScript={THEME_BRIDGE}
          onMessage={onMessage}
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
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  web: { flex: 1 },
});
