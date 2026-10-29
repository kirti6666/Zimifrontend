import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet } from "react-native";
import * as SplashScreen from "expo-splash-screen";

import brandLogo from "../assets/brand/logo.png";

/* The native splash (expo-splash-screen in app.json) draws this logo, 170dp wide, on
   this color. Drawing the same here lets the native splash fade out without a jump. */
const BACKGROUND = "#ffffff";
const LOGO_WIDTH = 170;
const LOGO_HEIGHT = (LOGO_WIDTH * 356) / 900; // assets/brand/logo.png is 900x356

// Keep the native splash up until the matching logo below it has drawn.
void SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 180, fade: true });

let nativeSplashHidden = false;
function hideNativeSplash() {
  if (nativeSplashHidden) return;
  nativeSplashHidden = true;
  void SplashScreen.hideAsync().catch(() => {});
}

/** The animated logo shown while the app starts. It leaves once `ready` turns true. */
export function LaunchScreen({ ready, onHidden }: { ready: boolean; onHidden: () => void }) {
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const intro = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(on => { if (active) setReduceMotion(on); }, () => { if (active) setReduceMotion(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return;
    if (reduceMotion) { intro.setValue(1); return; }
    const animation = Animated.timing(intro, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, intro]);

  useEffect(() => {
    // A reload during the fade brings the logo back in full.
    if (!ready) { exit.setValue(0); return; }
    hideNativeSplash();
    const animation = Animated.timing(exit, { toValue: 1, duration: reduceMotion ? 0 : 180, easing: Easing.out(Easing.quad), useNativeDriver: true });
    animation.start(({ finished }) => { if (finished) onHidden(); });
    return () => animation.stop();
  }, [ready, reduceMotion, exit, onHidden]);

  return (
    <Animated.View
      style={[styles.screen, { opacity: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
      pointerEvents={ready ? "none" : "auto"}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading BinzoLive"
      accessibilityState={{ busy: !ready }}
    >
      <Animated.View style={{ opacity: intro }}>
        <Image source={brandLogo} style={styles.logo} resizeMode="contain" onLoadEnd={hideNativeSplash} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: BACKGROUND },
  logo: { width: LOGO_WIDTH, height: LOGO_HEIGHT },
});
