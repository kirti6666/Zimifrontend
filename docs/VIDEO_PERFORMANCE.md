# Video-call performance

Android builds containing `BinzoMedia` use native WebRTC and the Facebetter Android SDK 2.2.1 GPU texture path, matching the camera-processing approach in `../facebetter-expo`. The WebView retains the call interface while native `RTCView` surfaces display the local/remote streams. Older binaries, iOS and browser previews keep the browser media path. The backend handles signaling; TURN relays media when ICE cannot select a direct path. More API-server CPU does not reduce camera-effect inference cost or geographic relay latency.

## Current controls

- Android native capture requests 1920 x 1440 at 30 fps with full camera framing. Device capability determines the actual capture mode. The tested phone's 4:3 mode retains the full sensor image and avoids the hardware encoder's 1080-to-1072 alignment reduction. Camera flips retain the native camera track and microphone.
- Native Facebetter processing uses an explicit GLES3 context sharing camera textures on an owned GL thread. The OES camera frame becomes an upright 2D texture, retains its 1920-pixel long edge, and is copied into a bounded retained-output pool. WebRTC source adaptation runs before the processor; already-smaller inputs stay small. Pixels never pass through the WebView or JavaScript bridge.
- Native output conversion and recycling stay on their owning GL thread. Cleanup keeps the context alive while encoder/preview consumers retain frames, and stale session callbacks cannot update a newer call. Unsupported/failed beauty sends the original camera and retains call audio.
- Camera rotation is baked into processed pixels once; SDK output is copied without an extra vertical flip. The active call uses `cover` to fill the display without padding or stretching, including with the filter dock open; this crops source edges when aspect ratios differ. Setup and PiP use `contain` for the whole image. The pinned WebRTC patch reports displayed dimensions after metadata rotation, keeping raw and processed camera shape consistent.
- Android native encoding starts at a 2.5 Mbps / 30 fps / 1920-pixel long-edge ceiling and prioritizes frame rate at every profile. WebRTC may reduce adapted resolution under device or connection pressure; fresh interval loss, pacing delay and encoder evidence also select lower 480/720/1280-pixel ceilings. Recovery requires sustained healthy samples and headroom, with a bounded probe to avoid remaining stuck at a low sender cap. Capture remains 1920 x 1440; encoder limits are ceilings, not promises of throughput.
- Android authorization uses `/facebetter/auth/android` and its separate `FACEBETTER_ANDROID_LICENSE_FILE` setting or online Android license. Web-origin credentials are not used as Android fallbacks.
- Native diagnostics distinguish unscaled camera textures, adapted incoming dimensions/timestamp FPS, output dimensions, total average/maximum frame cost and SDK cost. Camera pauses restart the measurement window instead of appearing as low processing FPS.

## Browser fallback controls

- Preserve original camera capture and full framing. Effects start with a 480-pixel long edge and adapt between 240 and 720 pixels. Camera capture is not cropped or repeatedly reopened for quality changes.
- Process fresh frames only, with one frame in flight and no backlog. Output capture follows actual successful processing. The same canvas track survives resolution changes; the microphone remains the original track.
- Run compatible Facebetter engines in a dedicated worker so synchronous inference does not block call controls. Worker support is probed before loading models; unsupported startup falls back to the bounded main-thread path. Worker inference remains a device CPU/GPU cost and does not become free by moving threads.
- Start private-call encoding at a 900 kbps / 24 fps / 720-pixel ceiling, then adapt through 480/720/1280-pixel profiles using sustained network and encoder evidence. Encoder limits are ceilings, not promises of throughput.
- Scale from actual outgoing-track dimensions. Serialize encoding changes with camera flips and effect-track replacement. End-of-call cleanup invalidates pending work.
- Repeated network reports are neutral. Recent receiver-observed packet loss survives intervening healthy local polls, clears on fresh healthy receiver feedback, and expires after eight seconds without an update. Removed RTP sources do not retain impairment state.

## Native phone verification on 3 November 2026

The final 1.1.12 / build 22 camera mode was checked on the OPPO CPH2689 using two local native peers, a real camera, authorized Facebetter processing, hardware H.264 encoding and a native decoded preview. Source capture was 1920 x 1440. Both the actual sender and receiver RTP reports showed 1440 x 1920, with median 30 fps in the retained measurement window, over 3,500 encoded/decoded frames after roughly two minutes, and zero output-pool drops. No backend call or media to another account was created. This proves the measured local 1080+ pipeline, not two-phone WAN or long thermal performance. Sanitized evidence is in `artifacts/native-1080-loopback-device.json`.

Earlier preview investigation:

The updated debug APK compiled and was installed on the connected OPPO CPH2689 ARM phone. Native Android authorization succeeded, GLES 3.2 initialized, and real camera textures were processed and displayed behind the existing WebView controls. With the 1280-pixel processing cap, one steady preview window reported 20.6 fresh processed fps, 8.7 ms average total frame cost, 0.7 ms SDK cost and no output-pool drops. Capture requested 1920 x 1080 at 30 fps; the measured incoming frame cadence was also 20.6 fps. This was an interactive preview observation, not a controlled comparison or a 30 fps guarantee.

The filtered preview was visually verified upright and filling the camera surface after removing the extra output flip. Responsive browser checks cover call/setup beauty previews, full-surface fit, stable portrait metadata, controls, retry and cleanup. All 20 native protocol/controller/shell/plugin tests, the native UI checks, TypeScript checks, the existing Facebetter/call-performance suites, and 19 backend authorization tests passed. A two-phone WAN call and extended thermal/audio-route measurements were not performed.

## Measurements on 2 November 2026

The licensed synthetic desktop benchmark of the original versus adaptive main-thread path, using the real 2.2.1 SDK with a software GPU, increased actual fresh processed frames from 11.97 to 21.65 fps. Median processing time fell from 32.5 to 11.2 ms; 20 ms heartbeat delay p95 fell from 33.1 to 11.4 ms. Processing changed from 960 x 540 to an adaptive output ending at 480 x 270. These are desktop synthetic results, not physical-phone measurements, and predate the additional worker path.

Android 15 / WebView 124 emulator measurements still spent approximately 120 ms per SDK call despite reduced dimensions. A refined run measured 3.38 versus 3.69 processed fps, while an earlier run reversed that small difference. These results do not establish a robust Android throughput gain. Emulator inference remained the bottleneck. Output-video callbacks and repeated canvas frames are not counted as newly processed frames.

A separate worker comparison on a read-only, software-rendered Android 15 / WebView 124 emulator used the non-debuggable 1.1.8 shell with isolated original/current controllers. The worker kept the real origin and user agent, produced changed pixels, allowed one frame in flight, preserved audio/source capture and rejected a genuine completed result held until after teardown. The original processed only 3 frames in 6.503 seconds and the worker 4 in 6.509 seconds. These tiny samples and severe emulation costs establish no robust video-throughput improvement. Worst 25 ms heartbeat delay changed from 578.2 to 27.8 ms, while p95 changed from 3.7 to 10.7 ms; this supports isolation of long processing pauses, not an across-the-board latency or FPS guarantee. The original source remained 1280 x 720.

The first worker fixture used `srcdoc`, whose Location origin was `null` despite inheriting the parent's security origin, so the application's support check correctly selected fallback. That result is preserved separately. The corrected fixture used parent-initiated `document.open/write` at the actual `https://aurora.localhost/` document URL; it did not change product origin checks or license identity. See `android-worker-results.json` and `android-frame-origin-results.json` for the corrected evidence.

The two Android WebView emulator series used different graphics configurations. Their absolute processing costs and FPS must not be compared across series. These historical WASM measurements do not measure the current native Android GPU pipeline.

The raw-camera two-peer loopback comparison maintained approximately 20 fps, with no measured loss or freezes in either version. It confirmed the new initial encoding cap and cleanup behavior, without establishing a raw-call FPS improvement.

## VPS findings

A read-only observation found 95.655% CPU idle, approximately 216 GiB RAM available, healthy API/TURN services, no API CPU throttling, and no sampled NIC drops or UDP buffer errors. These observations do not justify a CPU/RAM upgrade.

The existing relay is in Kansas City, USA. This workstation measured 276 ms average ICMP latency; two local synthetic peers forced through the remote relay measured 540-556 ms selected-pair RTT. That hairpin test is not a measurement of every user's call. If callers are in India, a nearer TURN-region pilot is a more relevant next infrastructure experiment than a larger US VPS.

The host link reports 100 Mbps full duplex. It was not saturated during observation. Historical 10-minute interface samples peaked at 12.319 Mbps TX on 1 November and 5.517 Mbps TX on 2 November through 10:40 UTC; these averages can miss brief peaks and include host traffic beyond BinzoLive. No concurrent-call capacity test was performed. Network-port capacity should be evaluated using peak relayed-call telemetry before buying infrastructure.

No production configuration, deployment, service restart or purchase was made. Physical-phone camera, thermal and two-phone WAN checks remain necessary before claiming the reported lag is fully resolved.

### Current VPS and call policy verification, 3 November 2026

A fresh read-only sample found 95% idle CPU, approximately 215 GiB RAM available, healthy API/TURN services, and no new interface drops, errors or UDP buffer errors. The interface now reports **1 Gbps full duplex**, with roughly 0.2 Mbps inbound and 1.0 Mbps outbound during the sample. The running TURN secret matches the API, all three transports authenticate, and the TLS certificate expires on 27 January 2027. No server restart or configuration change was needed for these checks.

A bounded synthetic browser call through two forced-relay peers measured 533 ms RTT over UDP, 593 ms over TCP and 556 ms over TLS. UDP lost 3 of roughly 3,014 packets with 3 ms jitter; TCP/TLS reported no lost packets. Browser congestion control decoded 960x720 at around 20 fps (16 fps in the final TLS sample), despite requesting a 1920x1440 camera and a 2.5 Mbps sender cap. This is a relay-path check, separate from the physical native 1440x1920/30 fps camera benchmark, and does not establish two-phone call quality.

The call policy no longer treats stable propagation delay alone as bandwidth congestion. Native quality sampling uses actual receiver feedback counters and packet intervals, expires stale feedback, and separates incoming impairment from outgoing sender adaptation. Sustained loss, send buffering or encoder pressure can reduce sender work; recovery increases one step after fresh healthy evidence and a dwell period. Sustained RTT at or above 1.2 seconds can still display a warning without reducing resolution by itself. Native capture remains 1920x1440 at 30 fps. Both native and browser peers bundle audio/video on one ICE transport.

The active video call fills the display, including while its filter dock is open. Controls use system insets independently of the video background. Standalone setup and picture-in-picture previews retain their whole-image framing. Foreground incoming ringing uses verified server state for both account roles and hands audio to the existing Android call notification when present.

The relay's IP geolocation remains Kansas City, US. The user confirmed no nearby India/Singapore endpoint is available. The current measurements do not show a CPU, memory or bandwidth bottleneck; geographic propagation delay remains on relayed calls. Credentials and real account calls are excluded from the diagnostics.

## Historical release validation

The release evidence below predates the native Android migration. Native build/controller checks and physical-device camera/two-phone call checks must be assessed separately; historical browser FPS results are not proof of native throughput.

Signed Android release **1.1.9 / build 18** passed package/version and signer verification, a real non-debuggable Android WebView boot, and a minimal real online-authorization pixel check using the packaged worker and production runtime. The signing certificate matches the existing app. The single temporary provider response and instrumentation helper were removed. The Facebetter suite, call-performance suite, TypeScript checks and thirteen functional call/startup/loading suites passed; the licensed worker suite separately passed ten cases. The loading-suite correction updates its expectations for the existing pinned BinzoLive conversation rather than changing product behavior.

The APK and checksum manifest are at `artifacts/releases/BinzoLive-1.1.9.apk` and `BinzoLive-1.1.9.json`. SHA-256: `3608d97c0bb5dee29060a28561a1f14e363d5c7f29e985dd24bdc86959cd132d`.

Sanitized local evidence is under `artifacts/video-performance/`: `beauty-actual-desktop.json`, `raw-call-comparison.json`, `android-beauty-results.json`, `relay-results.json`, and `video-performance-findings-2026-11-02.md`. The raw VPS audit is under `../.codex-reference/` at workspace level. Credentials are excluded from reports.
