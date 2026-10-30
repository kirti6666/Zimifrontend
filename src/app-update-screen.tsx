import { ActivityIndicator, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useEffect } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import type { UpdateState } from "./app-update-controller";

function onUpdateLayout() {
  // AppContent and its launch logo are not mounted while the update gate owns the screen.
  void SplashScreen.hideAsync().catch(() => {});
}

export function AppUpdateScreen({ state, update, check }: { state: UpdateState; update(): void; check(): void }) {
  useEffect(() => {
    const back = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => back.remove();
  }, []);
  const busy = state.phase === "downloading" || state.phase === "verifying";
  const required = state.status === "required";
  const progress = Math.round(state.progress * 100);
  const label = state.phase === "permission" ? "Continue update" : state.phase === "installer" || state.phase === "ready" ? "Install update" : state.error && required ? "Retry update" : "Update now";
  return <SafeAreaProvider><SafeAreaView style={styles.safe} onLayout={onUpdateLayout}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.card} accessibilityViewIsModal>
        <View style={styles.mark}><Text style={styles.markText}>B</Text></View>
        <Text style={styles.title}>{required ? "Update required" : state.status === "error" ? "Connect to check for updates" : "Checking for updates"}</Text>
        <Text style={styles.body}>{required ? "A new version of BinzoLive is available. Update to continue using the app." : state.status === "error" ? "BinzoLive needs to verify that your app is up to date before you continue." : "Please wait while we check your app version."}</Text>
        {state.release && <>
          <Text style={styles.version}>Version {state.release.versionName} · {(state.release.sizeBytes / 1024 / 1024).toFixed(1)} MB</Text>
          {state.release.releaseNotes ? <Text style={styles.notes}>{state.release.releaseNotes}</Text> : null}
        </>}
        {busy && <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progress }}>
          <View style={styles.track}><View style={[styles.fill, { width: `${progress}%` }]} /></View>
          <Text style={styles.detail} accessibilityLiveRegion="polite">{state.phase === "verifying" ? "Verifying update…" : `Downloading update… ${progress}%`}</Text>
        </View>}
        {state.phase === "permission" && <Text style={styles.notes}>On the Android settings screen, turn on “Allow from this source” for BinzoLive. Return here and tap Install update.</Text>}
        {state.phase === "installer" && <Text style={styles.notes}>Confirm Update on the Android installation screen. If you closed it, tap Install update to open it again.</Text>}
        {state.error && <Text style={styles.error} accessibilityLiveRegion="polite">{state.error}</Text>}
        {(state.status === "checking" || state.checking) && !busy && <ActivityIndicator style={styles.spinner} color="#c71862" />}
        {required && !busy && <Pressable accessibilityRole="button" disabled={state.checking} onPress={update} style={[styles.button, state.checking && styles.disabled]}>
          <Text style={styles.buttonText}>{label}</Text>
        </Pressable>}
        {state.status === "error" && <Pressable accessibilityRole="button" disabled={state.checking} onPress={check} style={[styles.button, state.checking && styles.disabled]}><Text style={styles.buttonText}>Try again</Text></Pressable>}
        {required && state.error && !busy && <Pressable accessibilityRole="button" onPress={check} disabled={state.checking} style={styles.secondary}><Text style={styles.secondaryText}>Check again</Text></Pressable>}
        {required && <Text style={styles.footer}>Your account and data stay on your device during the update.</Text>}
      </View>
    </ScrollView>
  </SafeAreaView></SafeAreaProvider>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8f8fa" },
  page: { flexGrow: 1, justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 480, alignSelf: "center", padding: 24, backgroundColor: "#ffffff", borderRadius: 10 },
  mark: { width: 52, height: 52, borderRadius: 10, backgroundColor: "#c71862", alignItems: "center", justifyContent: "center", marginBottom: 24 },
  markText: { color: "#ffffff", fontWeight: "700", fontSize: 30 },
  title: { fontSize: 24, fontWeight: "600", color: "#18181b", marginBottom: 12 },
  body: { fontSize: 14, lineHeight: 21, color: "#52525b" },
  version: { color: "#52525b", fontSize: 12, marginTop: 16 },
  notes: { color: "#52525b", fontSize: 14, lineHeight: 21, marginTop: 16 },
  track: { height: 6, backgroundColor: "#f0e9ed", borderRadius: 3, marginTop: 24, overflow: "hidden" },
  fill: { height: 6, backgroundColor: "#c71862" },
  detail: { fontSize: 12, color: "#52525b", marginTop: 10 },
  error: { fontSize: 14, color: "#b42318", lineHeight: 21, marginTop: 16 },
  spinner: { marginTop: 24 },
  button: { minHeight: 48, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#c71862", padding: 14, marginTop: 24 },
  buttonText: { fontSize: 14, fontWeight: "600", color: "#ffffff" },
  disabled: { opacity: 0.5 },
  secondary: { minHeight: 44, justifyContent: "center", alignItems: "center", marginTop: 6 },
  secondaryText: { color: "#c71862", fontSize: 14, fontWeight: "600" },
  footer: { color: "#71717a", fontSize: 12, lineHeight: 18, marginTop: 20 },
});
