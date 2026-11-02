# Facebetter integration and verification

The mobile app uses **Facebetter Web SDK 2.2.1 inside React Native WebView**. Its camera and private-call WebRTC tracks are browser media streams. It does not instantiate the Java/Kotlin `net.pixpark:facebetter` engine.

The supplied [Android quick-start](https://docs.facebetter.net/android/quick-start) describes the native Android integration and currently names SDK 2.0.0. The checked-in vendor Android demo uses 2.2.1. The app's installed JavaScript wrapper and both mobile/backend WASM runtimes match 2.2.1; do not downgrade them to match that older documentation example.

## Current processing path

1. `web/media.js` captures the camera and microphone.
2. `web/beauty.js` requests authorization through the native bridge before creating an engine. `src/bridge.ts` requires an active session and correlates each response to its request.
3. The backend's `facebetter.service.ts` serves the full configured `FACEBETTER_LICENSE_FILE` through the existing authenticated, uncached auth route. It reads the file again for each authorization and reports unavailable if an explicitly configured file cannot be read. When that setting is empty, it signs `v2|app_id|timestamp|nonce|web` with HMAC-SHA256 and forwards the WebView user agent to online authorization. App keys stay on the backend; the returned string becomes `EngineConfig.licenseToken`.
4. The SDK loads pinned WASM/model resources and processes unmirrored `ImageData`. Compatible devices run the engine in a dedicated worker using `OffscreenCanvas`; unsupported worker startup falls back to the main-thread adapter. Processing starts at a 480-pixel long edge, adapts between 240 and 720 pixels with hysteresis, and targets at most 24 fresh frames per second. The original 1280 x 720 camera capture and full framing are retained. Actual throughput depends on device inference cost; the target is not a frame-rate guarantee.
5. Processed pixels are painted into a canvas. Its captured video track feeds both the local preview and WebRTC senders; the original microphone track is retained. Preview mirroring belongs to the display CSS.
6. Effect changes replace the outgoing video track before old resources are destroyed. Turning effects off restores the raw camera. Ending the session destroys the engine, captured output and rendering loop; media cleanup then stops the raw camera.

The frame scheduler follows fresh camera presentations, keeps only the newest frame and uses bounded timers rather than accumulating work. Canvas output is requested after an actual processed frame, with a timed-capture fallback for older browsers. Adaptive resizing keeps the same output track. `handle.getPerformance()` exposes actual processed-frame counts and processing cost for diagnostics; presentation callbacks must not be reported as SDK throughput.

`web/beauty-worker.js` uses the unmodified bundled 2.2.1 wrapper with a small canvas-only document adapter. This is private compatibility glue, not a public vendor worker API; SDK upgrades must revalidate it. The Blob worker retains the document's real origin and browser user agent. Credentials remain in memory. Graphics support is probed before model downloads, commands are acknowledged before applied-state caches advance, and only one transferable pixel buffer is processed at a time. Selection/camera changes and teardown discard obsolete results. Runtime/license errors remain visible rather than being treated as successful effects.

Private calls apply an initial 900 kbps / 24 fps / 720-pixel encoding ceiling before signaling. Subsequent 480/720/1280-pixel profiles follow sustained network/encoder evidence. Scaling uses the actual outgoing track size so an already-small effect output is not downscaled twice. Parameter changes are serialized with camera/effect track replacement, and audio settings are preserved.

The [Web quick-start](https://docs.facebetter.net/web/quick-start), [authorization guide](https://docs.facebetter.net/intro/license), and [optional resource-pack guide](https://docs.facebetter.net/intro/resource-packs) apply to this path. The bundled UI includes the vendor demo's 19 portrait filters, 11 stickers and background/body controls. Optional models and larger assets load on selection; availability still depends on the provider's authorization and plan.

## Live filter controls

Video-call and host-setup beauty controls use a compact camera-visible dock. The existing local video is enlarged with CSS while the dock is open, and the remote video/audio stay mounted. No duplicate camera, video element or preview engine is created. Call end and setup actions remain reachable below the dock; closing it restores the ordinary video layout without changing host swap preference.

Filters open as a horizontal carousel containing Original and the nineteen SDK filters. A settled touch swipe selects the nearest centered item; mouse drag, tap and keyboard arrows/Home/End use the same controller. Passing intermediate items does not authorize or process nineteen previews. Re-selecting the current filter does not submit another setting update. Original clears the portrait filter while preserving independent skin/makeup settings; Reset all clears every effect. Skin, reshape, makeup, stickers, body and background controls remain available with live preview.

Opening the dock never starts capture or requests a license by itself. Host setup retains its explicit Check camera action. Voice calls exclude camera controls. Reduced motion, small-screen themes, live preview continuity and persisted selection are covered by `scripts/test-facebetter-ui.cjs` and `scripts/test-facebetter-carousel.cjs`.

Release **1.1.10 / build 19** packages these controls. Touch swipe, mouse drag, tap, keyboard selection, native Back, swapped host preview, portrait/landscape themes and unchanged live media passed browser checks. The preview-pixel fixture is explicitly synthetic; actual SDK processing remains covered separately. The Facebetter and call-performance suites, six call/navigation suites and TypeScript checks passed. The signed, non-debuggable APK booted in Android 15 / WebView 124 with the new controls and production runtime. Evidence is under `artifacts/facebetter-carousel*` and `artifacts/filter-picker-1.1.10/`.

## Identity and resources

- The WebView document origin is `https://aurora.localhost`. Web licensing must cover that origin. Binding only Android package `com.aurora.liveapp` does not authorize this browser engine.
- Local development now explicitly uses `FACEBETTER_LICENSE_FILE=../facebetter-offline.lic`, as requested. The native bridge still authenticates and correlates authorization requests; the SDK receives the full file contents, without embedding the license or App Key in the app bundle. An unset path retains online authorization. This is a server-delivered offline SDK license, not a network-free app startup.
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

## Performance release 1.1.9, build 18

The regular Facebetter and call-performance suites and TypeScript checks passed. The separate licensed worker suite passed all ten cases, including real stock-SDK pixel changes, one frame in flight, acknowledged settings, camera/reset/stop races and fallback cleanup. Loading tests now account explicitly for the pinned official conversation.

The signed, non-debuggable 1.1.9 APK booted in Android 15 / WebView 124 with its packaged worker and production HTTPS runtime, without a runtime override. One online token was minted by the existing backend service for that exact WebView user agent. The packaged Blob worker initialized at the real origin and changed synthetic pixels with brightness enabled; no license-validation failure was observed. The temporary token and signed helper were removed. No real user call or payment was made.

Native worker compatibility and UI isolation passed, but software-emulator throughput remained low. This is not proof of smooth physical-phone video. See [the performance findings](VIDEO_PERFORMANCE.md) and sanitized `artifacts/video-performance/android-{worker,release-boot,online-worker}-results.json` for measurements and limits.

## Investigation of the current license on 2 November 2026

The actual project dashboard was read in Brave. It reports **Basic**, with Android package `com.aurora.liveapp` and Web origin `https://aurora.localhost` correctly bound. The latest supplied offline file also declares Basic in its readable metadata; the SDK remains responsible for signature and entitlement validation. The [official feature table](https://docs.facebetter.net/intro/pricing) includes skin/color beauty in Basic, LUT filters in Pro/Pro+, and stickers in Pro+. No subscription or credential binding was changed.

Real SDK tests using the latest file were separate from mocked carousel tests: Initial Heart, First Love and Natural reached the engine at full strength but were pixel-identical to neutral on both a synthetic gradient and a bundled portrait. This occurred on main-thread and worker paths, while brightness changed the same images. The generated app selected the correct filter, downloaded matching resources and attached processed video. This is consistent with the documented Basic entitlement; a successful setter/`ready` status alone is not visual proof.

Selecting `kiss2` reproduced code `-5` and raw-camera fallback; keeping it selected made subsequent filter attempts fail too, while choosing sticker None restored processing. Per [Web error handling](https://docs.facebetter.net/web/error-handling), `-5` is resource I/O, not proof of a subscription or license error. The app now preserves a safe code/stage/method diagnostic and distinguishes that case from `-3`, `LICENSE_ERROR` and actual license-validation callbacks. It does not bypass the vendor's licensing or hide a failed effect.

The Web quick-start still contains an older statement about offline licenses. The [Auth & License guide](https://docs.facebetter.net/intro/license#offline-license), dashboard and actual pinned 2.2.1 behavior support passing the entire origin-bound `.lic` as `licenseToken`. Browser builds through 2.1.1 are excluded by the dashboard's guidance. Sanitized evidence is under `backend/artifacts/facebetter-integration-*` and `mobile-app/artifacts/facebetter-carousel/licensed-*`; these reports contain no license contents or App Keys.

## What native Android integration would require

Following the Android quick-start directly would require a native Maven/AAR dependency, an Android package-bound license, native camera/GL frame processing and a bridge that hands processed frames into the call encoder. It also requires sensor rotation/mirroring, GL-context ownership and explicit native frame/engine cleanup. Adding a Gradle dependency alone would not connect it to the current browser camera and WebRTC pipeline.

That migration has not been made as part of verification. The current WebView integration was tested as it is implemented.
