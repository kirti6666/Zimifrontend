# Facebetter integration and verification

The mobile app uses **Facebetter Web SDK 2.2.1 inside React Native WebView**. Its camera and private-call WebRTC tracks are browser media streams. It does not instantiate the Java/Kotlin `net.pixpark:facebetter` engine.

The supplied [Android quick-start](https://docs.facebetter.net/android/quick-start) describes the native Android integration and currently names SDK 2.0.0. The checked-in vendor Android demo uses 2.2.1. The app's installed JavaScript wrapper and both mobile/backend WASM runtimes match 2.2.1; do not downgrade them to match that older documentation example.

## Current processing path

1. `web/media.js` captures the camera and microphone.
2. `web/beauty.js` requests authorization through the native bridge before creating an engine. `src/bridge.ts` requires an active session and correlates each response to its request.
3. The backend's `facebetter.service.ts` signs `v2|app_id|timestamp|nonce|web` with HMAC-SHA256 and sends the WebView user agent to the provider. App credentials stay on the backend. The raw provider JSON becomes `EngineConfig.licenseToken`.
4. The SDK loads pinned WASM/model resources and processes unmirrored `ImageData`. The adapter caps processing at a 960-pixel long edge and 24 frames per second, reducing frequency when processing is slow. This cap is not a guarantee of device frame rate.
5. Processed pixels are painted into a canvas. Its captured video track feeds both the local preview and WebRTC senders; the original microphone track is retained. Preview mirroring belongs to the display CSS.
6. Effect changes replace the outgoing video track before old resources are destroyed. Turning effects off restores the raw camera. Ending the session destroys the engine, captured output and rendering loop; media cleanup then stops the raw camera.

The [Web quick-start](https://docs.facebetter.net/web/quick-start), [authorization guide](https://docs.facebetter.net/intro/license), and [optional resource-pack guide](https://docs.facebetter.net/intro/resource-packs) apply to this path. The bundled UI includes the vendor demo's 19 portrait filters, 11 stickers and background/body controls. Optional models and larger assets load on selection; availability still depends on the provider's authorization and plan.

## Identity and resources

- The WebView document origin is `https://aurora.localhost`. Web licensing must cover that origin. Binding only Android package `com.aurora.liveapp` does not authorize this browser engine.
- The app uses online authorization. The separately supplied offline license was used only for verification; it was not embedded in the app or substituted for its online flow.
- Runtime/model/effect URLs live below `/api/v1/facebetter/runtime/2.2.1/`. They are public, credential-free resources and must have WebView-compatible CORS, MIME types and cross-origin resource policy. License issuance remains authenticated and uncached.
- Three-dimensional stickers require `resource_3d.fbd`; pose-based body controls require `resource_body.fbd`. Load optional packs before their matching setters.
- Use Web 2.2.1 enums and error codes. The Android 2.0 documentation's native numeric error codes and `ImageFrame` signatures do not apply to this adapter.

## Tests

Run the regular SDK, catalog, race, controls, media, runtime and bridge checks:

```powershell
npm run test:facebetter
```

The credential-free runtime smoke deliberately supplies an invalid token. It tests runtime loading, API compatibility and frame transport. **Successful `init()` and a non-null output do not prove authorization or a visible effect.** The tested vendor runtime can return unchanged pixels after rejecting that token, and its Web callback registration occurs after initialization.

Use the separate visual test with an explicitly supplied origin-bound license:

```powershell
$env:FACEBETTER_TEST_LICENSE_FILE = 'C:\path\to\origin-bound-license.lic'
try {
  npm run test:facebetter:visual
} finally {
  Remove-Item Env:FACEBETTER_TEST_LICENSE_FILE
}
```

This test keeps credentials in memory, intercepts resources locally at the licensed origin, and checks actual pixel changes. Keep licenses and provider responses out of source control and test logs. Native Android validation still requires a device or emulator; browser tests alone do not establish Android performance.

## Verification on 2 November 2026

- Seven existing mobile Facebetter suites and thirteen backend auth/resource regressions passed.
- HEAD checks of all forty deployed runtime/model/filter/sticker/background routes returned HTTP 200 with compatible WebView CORS. All thirty-seven local custom resource manifest hashes matched, and mobile/backend core binaries matched.
- The actual signed release 1.1.7, code 16, loaded SDK/WASM in Android 15 WebView 124 at the real document origin. Using an online token minted through the existing backend service with that WebView's exact user agent, a synthetic RGB `(180,100,70)` changed to `(208,134,111)` with Natural at 0.8 and `(225,145,115)` with brightness +0.5. Output video-track liveness and engine cleanup passed. The provided offline license independently produced the same results.
- The one temporary online-token response and signed instrumentation helper were removed after the check. No OTP, real call, payment, subscription change or production application write was made.
- An earlier QA proxy was found cached by Android despite its settings being deleted. It was cleared explicitly; native `ConnectivityManager.getDefaultProxy()` returned null during the successful checks. The optional font-proxy harness now checks effective proxy restoration as well as settings.

Sanitized logs and results are under `artifacts/facebetter-doc-verification/`, including `android-webview-result.json`, `android-webview-offline-result.json`, resource checks and visual probes. These are synthetic-frame checks on one emulator, not a physical-device camera, thermal/background benchmark, or a live two-phone call. Visible face reshaping and sticker placement require a real face and remain separate checks. The local offline license metadata indicates the Free plan; paid-plan entitlement was not established by these tests.

## What native Android integration would require

Following the Android quick-start directly would require a native Maven/AAR dependency, an Android package-bound license, native camera/GL frame processing and a bridge that hands processed frames into the call encoder. It also requires sensor rotation/mirroring, GL-context ownership and explicit native frame/engine cleanup. Adding a Gradle dependency alone would not connect it to the current browser camera and WebRTC pipeline.

That migration has not been made as part of verification. The current WebView integration was tested as it is implemented.
