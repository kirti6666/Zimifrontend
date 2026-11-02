# Video-call performance

The call uses browser WebRTC inside Android WebView. The backend handles signaling; TURN relays media when ICE cannot select a direct path. More API-server CPU does not reduce camera-effect inference cost or geographic relay latency.

## Current controls

- Preserve original camera capture and full framing. Effects start with a 480-pixel long edge and adapt between 240 and 720 pixels. Camera capture is not cropped or repeatedly reopened for quality changes.
- Process fresh frames only, with one frame in flight and no backlog. Output capture follows actual successful processing. The same canvas track survives resolution changes; the microphone remains the original track.
- Run compatible Facebetter engines in a dedicated worker so synchronous inference does not block call controls. Worker support is probed before loading models; unsupported startup falls back to the bounded main-thread path. Worker inference remains a device CPU/GPU cost and does not become free by moving threads.
- Start private-call encoding at a 900 kbps / 24 fps / 720-pixel ceiling, then adapt through 480/720/1280-pixel profiles using sustained network and encoder evidence. Encoder limits are ceilings, not promises of throughput.
- Scale from actual outgoing-track dimensions. Serialize encoding changes with camera flips and effect-track replacement. End-of-call cleanup invalidates pending work.
- Repeated network reports are neutral. Recent receiver-observed packet loss survives intervening healthy local polls, clears on fresh healthy receiver feedback, and expires after eight seconds without an update. Removed RTP sources do not retain impairment state.

## Measurements on 2 November 2026

The licensed synthetic desktop benchmark of the original versus adaptive main-thread path, using the real 2.2.1 SDK with a software GPU, increased actual fresh processed frames from 11.97 to 21.65 fps. Median processing time fell from 32.5 to 11.2 ms; 20 ms heartbeat delay p95 fell from 33.1 to 11.4 ms. Processing changed from 960 x 540 to an adaptive output ending at 480 x 270. These are desktop synthetic results, not physical-phone measurements, and predate the additional worker path.

Android 15 / WebView 124 emulator measurements still spent approximately 120 ms per SDK call despite reduced dimensions. A refined run measured 3.38 versus 3.69 processed fps, while an earlier run reversed that small difference. These results do not establish a robust Android throughput gain. Emulator inference remained the bottleneck. Output-video callbacks and repeated canvas frames are not counted as newly processed frames.

A separate worker comparison on a read-only, software-rendered Android 15 / WebView 124 emulator used the non-debuggable 1.1.8 shell with isolated original/current controllers. The worker kept the real origin and user agent, produced changed pixels, allowed one frame in flight, preserved audio/source capture and rejected a genuine completed result held until after teardown. The original processed only 3 frames in 6.503 seconds and the worker 4 in 6.509 seconds. These tiny samples and severe emulation costs establish no robust video-throughput improvement. Worst 25 ms heartbeat delay changed from 578.2 to 27.8 ms, while p95 changed from 3.7 to 10.7 ms; this supports isolation of long processing pauses, not an across-the-board latency or FPS guarantee. The original source remained 1280 x 720.

The first worker fixture used `srcdoc`, whose Location origin was `null` despite inheriting the parent's security origin, so the application's support check correctly selected fallback. That result is preserved separately. The corrected fixture used parent-initiated `document.open/write` at the actual `https://aurora.localhost/` document URL; it did not change product origin checks or license identity. See `android-worker-results.json` and `android-frame-origin-results.json` for the corrected evidence.

The two native series used different emulator graphics configurations. Their absolute processing costs and FPS must not be compared across series.

The raw-camera two-peer loopback comparison maintained approximately 20 fps, with no measured loss or freezes in either version. It confirmed the new initial encoding cap and cleanup behavior, without establishing a raw-call FPS improvement.

## VPS findings

A read-only observation found 95.655% CPU idle, approximately 216 GiB RAM available, healthy API/TURN services, no API CPU throttling, and no sampled NIC drops or UDP buffer errors. These observations do not justify a CPU/RAM upgrade.

The existing relay is in Kansas City, USA. This workstation measured 276 ms average ICMP latency; two local synthetic peers forced through the remote relay measured 540-556 ms selected-pair RTT. That hairpin test is not a measurement of every user's call. If callers are in India, a nearer TURN-region pilot is a more relevant next infrastructure experiment than a larger US VPS.

The host link reports 100 Mbps full duplex. It was not saturated during observation. Historical 10-minute interface samples peaked at 12.319 Mbps TX on 1 November and 5.517 Mbps TX on 2 November through 10:40 UTC; these averages can miss brief peaks and include host traffic beyond BinzoLive. No concurrent-call capacity test was performed. Network-port capacity should be evaluated using peak relayed-call telemetry before buying infrastructure.

No production configuration, deployment, service restart or purchase was made. Physical-phone camera, thermal and two-phone WAN checks remain necessary before claiming the reported lag is fully resolved.

## Release validation

Signed Android release **1.1.9 / build 18** passed package/version and signer verification, a real non-debuggable Android WebView boot, and a minimal real online-authorization pixel check using the packaged worker and production runtime. The signing certificate matches the existing app. The single temporary provider response and instrumentation helper were removed. The Facebetter suite, call-performance suite, TypeScript checks and thirteen functional call/startup/loading suites passed; the licensed worker suite separately passed ten cases. The loading-suite correction updates its expectations for the existing pinned BinzoLive conversation rather than changing product behavior.

The APK and checksum manifest are at `artifacts/releases/BinzoLive-1.1.9.apk` and `BinzoLive-1.1.9.json`. SHA-256: `3608d97c0bb5dee29060a28561a1f14e363d5c7f29e985dd24bdc86959cd132d`.

Sanitized local evidence is under `artifacts/video-performance/`: `beauty-actual-desktop.json`, `raw-call-comparison.json`, `android-beauty-results.json`, `relay-results.json`, and `video-performance-findings-2026-11-02.md`. The raw VPS audit is under `../.codex-reference/` at workspace level. Credentials are excluded from reports.
