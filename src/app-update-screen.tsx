import { ActivityIndicator, BackHandler, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import type { UpdateState } from "./app-update-controller";
import brandLogo from "../assets/brand/logo.png";

function onUpdateLayout() {
  // AppContent and its launch logo are not mounted while the update gate owns the screen.
  void SplashScreen.hideAsync().catch(() => {});
}

export function AppUpdateScreen({ state, update, check }: { state: UpdateState; update(): void; check(): void }) {
  const [showDetails, setShowDetails] = useState(false);
  useEffect(() => {
    const back = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => back.remove();
  }, []);
  useEffect(() => { setShowDetails(false); }, [state.error]);
  const busy = state.phase === "downloading" || state.phase === "verifying";
  const required = state.status === "required";
  const checking = state.status === "checking" || state.checking;
  const progress = Math.max(0, Math.min(100, Math.round(state.progress * 100)));
  const label = state.phase === "permission" ? "Continue update" : state.phase === "installer" || state.phase === "ready" ? "Install update" : state.error && required ? "Retry update" : "Update now";
  const title = busy ? state.phase === "verifying" ? "Verifying your update" : "Downloading your update" : required ? "A new version is ready" : state.status === "error" ? "Unable to check for updates" : "Getting things ready";
  return <SafeAreaProvider><SafeAreaView style={styles.safe} onLayout={onUpdateLayout}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={styles.page} alwaysBounceVertical={false}>
      <View style={styles.card} accessibilityViewIsModal>
        <Image source={brandLogo} style={styles.logo} resizeMode="contain" accessibilityLabel="BinzoLive" />
        <Text style={styles.title} accessibilityRole="header" accessibilityLiveRegion="polite">{title}</Text>
        <Text style={styles.body}>{required ? "A new version of BinzoLive is available. Update to continue using the app." : state.status === "error" ? "We couldn’t check your app version. Please try again in a moment to continue to BinzoLive." : "We’re checking your app version before you continue to BinzoLive."}</Text>
        {state.release && <View style={styles.release}>
          <View style={styles.versionRow}><Text style={styles.version}>Version {state.release.versionName}</Text><Text style={styles.version}>{(state.release.sizeBytes / 1024 / 1024).toFixed(1)} MB</Text></View>
          {state.release.releaseNotes ? <View style={styles.releaseNotes}><Text style={styles.notesTitle}>What’s new</Text><Text style={styles.notes}>{state.release.releaseNotes}</Text></View> : null}
        </View>}
        {busy && <View style={styles.progress} accessibilityRole="progressbar" accessibilityLabel={state.phase === "verifying" ? "Verifying update" : "Downloading update"} accessibilityValue={state.phase === "verifying" ? { text: "Verifying update" } : { min: 0, max: 100, now: progress }} accessibilityState={{ busy: true }}>
          <View style={styles.track}><View style={[styles.fill, { width: `${progress}%` }]} /></View>
          <View style={styles.progressLabel}><Text style={styles.detail}>{state.phase === "verifying" ? "Checking your download…" : "Downloading update…"}</Text>{state.phase === "verifying" ? <ActivityIndicator size="small" color="#c71862" /> : <Text style={styles.progressValue}>{progress}%</Text>}</View>
        </View>}
        {state.phase === "permission" && <View style={styles.notice}><Text style={styles.noticeText}>On the Android settings screen, turn on “Allow from this source” for BinzoLive. Return here and tap Continue update.</Text></View>}
        {state.phase === "installer" && <View style={styles.notice}><Text style={styles.noticeText}>Confirm Update on the Android installation screen. If you closed it, tap Install update to open it again.</Text></View>}
        {state.error && required && <View style={styles.notice}><Text style={styles.noticeText} accessibilityLiveRegion="polite">The update couldn’t finish. Please try again.</Text></View>}
        {state.status === "checking" && !busy && <View style={styles.checking} accessibilityRole="progressbar" accessibilityLabel="Checking for updates" accessibilityState={{ busy: true }}><ActivityIndicator color="#c71862" /><Text style={styles.detail}>Checking for updates…</Text></View>}
        {required && !busy && <Pressable accessibilityRole="button" accessibilityState={{ disabled: state.checking, busy: state.checking }} disabled={state.checking} onPress={update} style={({ pressed }) => [styles.button, pressed && styles.pressed, state.checking && styles.disabled]}>
          {state.checking && <ActivityIndicator size="small" color="#ffffff" />}<Text style={styles.buttonText}>{state.checking ? "Checking…" : label}</Text>
        </Pressable>}
        {state.status === "error" && <Pressable accessibilityRole="button" accessibilityState={{ disabled: state.checking, busy: state.checking }} disabled={state.checking} onPress={check} style={({ pressed }) => [styles.button, pressed && styles.pressed, state.checking && styles.disabled]}>{checking && <ActivityIndicator size="small" color="#ffffff" />}<Text style={styles.buttonText}>{checking ? "Checking…" : "Try again"}</Text></Pressable>}
        {required && state.error && !busy && <Pressable accessibilityRole="button" accessibilityState={{ disabled: state.checking }} onPress={check} disabled={state.checking} style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}><Text style={styles.secondaryText}>Check again</Text></Pressable>}
        {state.error && <>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showDetails }} onPress={() => setShowDetails(value => !value)} style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}><Text style={styles.detailsLink}>{showDetails ? "Hide details" : "Show details"}</Text></Pressable>
          {showDetails && <View style={styles.notice}><Text style={styles.noticeText} selectable>{state.error}</Text></View>}
        </>}
        {required && <Text style={styles.footer}>Your account and data stay on your device during the update.</Text>}
        {state.installed && <Text style={styles.installed}>Current version {state.installed.versionName}</Text>}
      </View>
    </ScrollView>
  </SafeAreaView></SafeAreaProvider>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#ffffff" },
  page: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 40 },
  card: { width: "100%", maxWidth: 400, alignSelf: "center" },
  logo: { width: 184, height: 184 * 356 / 900, alignSelf: "center", marginBottom: 36 },
  title: { fontSize: 24, lineHeight: 31, fontWeight: "600", color: "#18181b", textAlign: "center", marginBottom: 12 },
  body: { fontSize: 14, lineHeight: 22, color: "#62626c", textAlign: "center" },
  release: { marginTop: 20 },
  versionRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  version: { color: "#52525b", backgroundColor: "#f5f5f7", fontSize: 12, lineHeight: 18, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  releaseNotes: { backgroundColor: "#f8f8fa", padding: 16, borderRadius: 10, marginTop: 20 },
  notesTitle: { fontSize: 14, fontWeight: "600", color: "#27272a", marginBottom: 6 },
  notes: { color: "#62626c", fontSize: 14, lineHeight: 22 },
  progress: { marginTop: 28 },
  track: { height: 6, backgroundColor: "#f5e7ed", borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: "#c71862" },
  progressLabel: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12 },
  detail: { fontSize: 12, lineHeight: 18, color: "#62626c", flexShrink: 1 },
  progressValue: { color: "#c71862", fontSize: 12, fontWeight: "600", fontVariant: ["tabular-nums"] },
  checking: { alignItems: "center", gap: 12, marginTop: 28 },
  notice: { padding: 14, borderRadius: 10, backgroundColor: "#f8f8fa", marginTop: 16 },
  noticeText: { color: "#62626c", fontSize: 12, lineHeight: 19 },
  button: { minHeight: 50, flexDirection: "row", gap: 10, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: "#c71862", padding: 15, marginTop: 28 },
  pressed: { backgroundColor: "#a91250" },
  buttonText: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: "#ffffff" },
  disabled: { opacity: 0.5 },
  secondary: { minHeight: 44, justifyContent: "center", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, marginTop: 6, borderRadius: 999 },
  secondaryPressed: { backgroundColor: "#f8f8fa" },
  secondaryText: { color: "#c71862", fontSize: 14, fontWeight: "600" },
  detailsLink: { color: "#62626c", fontSize: 12, lineHeight: 18, textDecorationLine: "underline" },
  footer: { color: "#71717a", fontSize: 12, lineHeight: 18, marginTop: 20, textAlign: "center" },
  installed: { color: "#71717a", fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 24 },
});
