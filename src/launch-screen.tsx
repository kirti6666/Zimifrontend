import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet } from "react-native";
import * as SplashScreen from "expo-splash-screen";

import brandLogo from "../assets/brand/logo.png";

/* The native splash (expo-splash-screen in app.json) draws this logo, 170dp wide, on
   this color. Drawing the same here lets the native splash fade out without a jump. */
const BACKGROUND = "#210f1d";
const LOGO_WIDTH = 170;
const LOGO_HEIGHT = (LOGO_WIDTH * 356) / 900; // assets/brand/logo.png is 900x356
const RINGS = 3;
const RING_CYCLE_MS = 2400;
const BREATH_MS = 1200;

// Keep the native splash up until the matching logo below it has drawn.
void SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 250, fade: true });

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
  const rings = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(on => { if (active) setReduceMotion(on); }, () => { if (active) setReduceMotion(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (reduceMotion !== false) return;
    const animation = Animated.parallel([
      Animated.timing(intro, { toValue: 1, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.loop(Animated.timing(rings, { toValue: 1, duration: RING_CYCLE_MS, easing: Easing.linear, useNativeDriver: true })),
      Animated.loop(Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: BREATH_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: BREATH_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])),
    ]);
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, intro, rings, breath]);

  useEffect(() => {
    // A reload during the fade brings the logo back in full.
    if (!ready) { exit.setValue(0); return; }
    hideNativeSplash();
    const animation = Animated.timing(exit, { toValue: 1, duration: reduceMotion ? 200 : 380, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start(({ finished }) => { if (finished) onHidden(); });
    return () => animation.stop();
  }, [ready, reduceMotion, exit, onHidden]);

  const logoScale = Animated.multiply(
    breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] }),
    exit.interpolate({ inputRange: [0, 1], outputRange: [1, reduceMotion ? 1 : 1.12] }),
  );

  return (
    <Animated.View
      style={[styles.screen, { opacity: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
      pointerEvents={ready ? "none" : "auto"}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading BinzoLive"
      accessibilityState={{ busy: !ready }}
    >
      {reduceMotion === false && Array.from({ length: RINGS }, (_, index) => {
        // Each ring starts a third of a cycle after the previous one.
        const progress = Animated.modulo(Animated.add(rings, index / RINGS), 1);
        return (
          <Animated.View
            key={index}
            style={[styles.ring, {
              opacity: Animated.multiply(intro, progress.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.5, 0] })),
              transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.9] }) }],
            }]}
          />
        );
      })}
      <Animated.View style={{ transform: [{ scale: logoScale }] }}>
        <Image source={brandLogo} style={styles.logo} resizeMode="contain" onLoadEnd={hideNativeSplash} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: BACKGROUND },
  logo: { width: LOGO_WIDTH, height: LOGO_HEIGHT },
  ring: { position: "absolute", width: 180, height: 180, borderRadius: 90, borderWidth: 1.5, borderColor: "#ff5fae", backgroundColor: "rgba(255, 64, 160, 0.06)" },
});
