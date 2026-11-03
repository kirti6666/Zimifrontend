import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { api } from "./api/endpoints";
import { getSessionVersion, getToken } from "./session";
import { ApiError } from "./api/client";
import { beginUpdateActivity } from "./app-update-activity";
import { dismissIncomingCallNotification } from "./native-push-notifications";
import { releaseVerifiedIncomingRinging, startVerifiedIncomingRinging, stopIncomingRinging } from "./call-ringing";
import type { UpdateState } from "./app-update-controller";
import { clearIncomingCallAction, getIncomingCallAction, getVerifiedIncomingCall, onIncomingCallAction, requestIncomingCallAction, retryIncomingCallAction, setVerifiedIncomingCall, startIncomingCallActions, type NativeCallAction } from "./incoming-call-actions";

type Incoming = NonNullable<Awaited<ReturnType<typeof api.notificationCall>>>;
type NativeResult = { callId: string; actionId: string; action: "open" | "answer"; outcome: "handedOff" | "error" };

/** The ring surface exists above the app/update gate. Only the normal gated
 * bridge can accept a verified call; a notification never admits the app. */
export function useIncomingCall(state: UpdateState) {
  const [action, setAction] = useState<NativeCallAction | null>(getIncomingCallAction());
  const [verified, setVerified] = useState<Incoming | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const lease = useRef<{ callId: string; finish: () => void } | null>(null);
  useEffect(() => {
    if (action?.action !== "open" || !verified || verified.callId !== action.callId) return;
    startVerifiedIncomingRinging(verified);
    return releaseVerifiedIncomingRinging;
  }, [action?.actionId, action?.action, verified?.callId, verified?.expiresAt]);
  useEffect(() => {
    const stop = startIncomingCallActions();
    const unsubscribe = onIncomingCallAction(setAction);
    return () => { unsubscribe(); stop(); lease.current?.finish(); lease.current = null; };
  }, []);
  useEffect(() => {
    if (!action || lease.current?.callId !== action.callId) { lease.current?.finish(); lease.current = null; }
    setVerified(null); setError("");
    if (!action || !state.installed) return;
    const selected = action, session = getSessionVersion();
    let active = true, timer: ReturnType<typeof setTimeout> | undefined;
    const applicable = () => active && getIncomingCallAction()?.actionId === selected.actionId &&
      getIncomingCallAction()?.action === selected.action && Date.parse(selected.expiresAt) > Date.now() && getSessionVersion() === session;
    const finish = () => {
      if (!applicable()) return;
      void dismissIncomingCallNotification(selected.callId);
      clearIncomingCallAction(selected.actionId);
    };
    const check = async (fresh=false) => {
      try {
        if (!await getToken()) { finish(); return; }
        if (!applicable()) return;
        // Decline is terminal cleanup, available even to an outdated build.
        // The endpoint still verifies the signed-in participant.
        if (selected.action === "decline") { await api.declineCall(selected.callId); finish(); return; }
        const incoming = (!fresh&&getVerifiedIncomingCall(selected.actionId, session)) || await api.notificationCall(selected.callId);
        if (!applicable()) return;
        if (!incoming || incoming.recipientId !== selected.recipientId) { finish(); return; }
        setVerified(incoming); setVerifiedIncomingCall(selected.actionId, incoming, session);
        if (selected.action === "open") startVerifiedIncomingRinging(incoming);
        if (!lease.current) lease.current = { callId: selected.callId, finish: beginUpdateActivity("call", selected.callId) };
        // Recheck while the native surface covers startup, so a cancelled call
        // disappears even if its terminal push or socket event was missed.
        timer = setTimeout(() => { void check(true); }, 5000);
      } catch (problem) {
        if (!applicable()) return;
        if (problem instanceof ApiError && [401, 403, 404].includes(problem.status)) { finish(); return; }
        setError(problem instanceof ApiError && problem.status === 426 ? "Update the app to answer this call." : "Couldn't connect. Check your connection and try again.");
      }
    };
    void check();
    return () => { active = false; clearTimeout(timer); };
  }, [action, state.installed?.versionCode, retry]);
  const onEvent = useCallback((message: { type: string; data?: Record<string, unknown> }) => {
    const selected = getIncomingCallAction();
    if (!selected) return;
    if (message.type === "session" && (message.data?.user as { id?: string } | undefined)?.id !== selected.recipientId || ["session.none", "session.expired"].includes(message.type)) {
      clearIncomingCallAction(selected.actionId); return;
    }
    if (["call.connected", "call.created", "verify.connected"].includes(message.type) && message.data?.callId !== selected.callId) {
      clearIncomingCallAction(selected.actionId); return;
    }
    if (message.data?.callId !== selected.callId) return;
    if (["call.connected", "call.ended", "call.failed"].includes(message.type) || message.type === "call.nativeResult" && message.data?.actionId === selected.actionId && message.data?.action === selected.action) clearIncomingCallAction(selected.actionId);
  }, []);
  const onResult = useCallback((result: NativeResult) => onEvent({ type: "call.nativeResult", data: result }), [onEvent]);
  return { action, verified, error, onEvent, onResult,
    choose: (choice: "answer" | "decline") => { if (action) { stopIncomingRinging(action.callId);requestIncomingCallAction(action.actionId, choice); } },
    retry: () => { if(action)retryIncomingCallAction(action.actionId);setRetry(value => value + 1); },
    close: () => { if (action) clearIncomingCallAction(action.actionId); },
  };
}

export function IncomingCallScreen({ action, verified, error, allowed, choose, retry, close }: {
  action: NativeCallAction; verified: Incoming | null; error: string; allowed: boolean;
  choose(action: "answer" | "decline"): void; retry(): void; close(): void;
}) {
  useEffect(() => { const back = BackHandler.addEventListener("hardwareBackPress", () => true); return () => back.remove(); }, []);
  const name = verified?.from.name || action.callerName;
  const voice = verified?.voice ?? action.callKind === "audio";
  const connecting = action.action === "answer", declining = action.action === "decline";
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  return <SafeAreaProvider><SafeAreaView style={styles.surface} accessibilityViewIsModal onLayout={() => { void SplashScreen.hideAsync().catch(() => {}); }}>
    <StatusBar style="light" />
    <Text style={styles.brand}>BinzoLive</Text>
    <Text style={styles.kind}>{declining ? "Declining call…" : connecting ? "Connecting your call…" : `Incoming ${voice ? "voice" : "video"} call`}</Text>
    <View style={styles.identity}><View style={styles.avatar}><Text style={styles.initials}>{initials || "B"}</Text></View><Text style={styles.name}>{name}</Text>
      {verified && <Text style={styles.price}>{verified.fromHost ? verified.rate ? `${verified.rate} coins/min · charged after answering` : "Free call" : "Private call"}</Text>}
      <Text style={styles.status} accessibilityLiveRegion="polite">{error || (connecting ? allowed ? "Preparing camera and microphone…" : "Getting your call ready…" : "Private and secure")}</Text>
      {(connecting || declining) && !error && <ActivityIndicator color="#ffffff" accessibilityLabel={declining ? "Declining call" : "Connecting call"} />}
      {error && <Pressable accessibilityRole="button" onPress={retry} style={styles.retry}><Text style={styles.white}>Try again</Text></Pressable>}
    </View>
    <View style={styles.actions}>
      <View style={styles.action}><Pressable accessibilityRole="button" accessibilityLabel="Decline call" onPress={() => choose("decline")} disabled={declining&&!error} style={[styles.circle, styles.decline]}><Text style={styles.symbol}>✕</Text></Pressable><Text style={styles.caption}>Decline</Text></View>
      {!declining && <View style={styles.action}><Pressable accessibilityRole="button" accessibilityLabel="Answer call" accessibilityState={{busy:connecting}} onPress={() => connecting && error ? retry() : choose("answer")} disabled={connecting&&!error} style={[styles.circle, styles.answer]}><Text style={styles.symbol}>{voice ? "☎" : "▣"}</Text></Pressable><Text style={styles.caption}>{connecting ? "Connecting…" : "Answer"}</Text></View>}
    </View>
    {error && <Pressable accessibilityRole="button" onPress={close}><Text style={styles.status}>Back to app</Text></Pressable>}
  </SafeAreaView></SafeAreaProvider>;
}
const styles = StyleSheet.create({
  surface:{position:"absolute",top:0,left:0,right:0,bottom:0,backgroundColor:"#111b21",paddingHorizontal:28,paddingVertical:28,alignItems:"center"},
  brand:{color:"#b9c6cc",fontSize:14,fontWeight:"600",marginTop:18},kind:{color:"#b9c6cc",fontSize:16,marginTop:28},
  identity:{flex:1,alignItems:"center",justifyContent:"center",gap:16,width:"100%"},avatar:{width:112,height:112,borderRadius:56,backgroundColor:"#26373f",alignItems:"center",justifyContent:"center"},
  initials:{fontSize:36,fontWeight:"600",color:"#ffffff"},name:{fontSize:28,fontWeight:"600",color:"#ffffff",textAlign:"center"},price:{fontSize:14,color:"#d1e0e5",textAlign:"center"},
  status:{fontSize:14,lineHeight:21,color:"#b9c6cc",textAlign:"center",marginVertical:8},actions:{flexDirection:"row",justifyContent:"space-around",width:"100%",maxWidth:360,marginBottom:38,gap:40},
  action:{alignItems:"center",gap:12},circle:{width:72,height:72,borderRadius:36,alignItems:"center",justifyContent:"center"},decline:{backgroundColor:"#e54b4b"},answer:{backgroundColor:"#1fbd75"},
  symbol:{fontSize:32,fontWeight:"600",color:"#ffffff"},caption:{fontSize:14,color:"#ffffff"},retry:{padding:14,borderRadius:10,backgroundColor:"#26373f"},white:{color:"#ffffff",fontSize:14},
});
