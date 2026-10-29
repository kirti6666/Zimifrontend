import { requireOptionalNativeModule } from "expo";

/** Android only (modules/call-screen); null on iOS, in Expo Go and in tests. */
export const CallScreen = requireOptionalNativeModule<{
  canUseFullScreenIntent(): boolean;
  openFullScreenIntentSettings(): void;
  showOverLockScreen(on: boolean): void;
}>("CallScreen");
