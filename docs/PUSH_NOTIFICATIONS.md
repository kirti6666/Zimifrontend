# Push notifications (Firebase Cloud Messaging)

> The same file lives in both repositories (`zimibackend/docs/` and
> `Zimifrontend/docs/`). Change both together.

Status: **in review, not on `main`**. Android only.

- Backend PR: [kirti6666/zimibackend#23](https://github.com/kirti6666/zimibackend/pull/23) (branch `claude/fcm-push`), CI green.
- App PR: [kirti6666/Zimifrontend#17](https://github.com/kirti6666/Zimifrontend/pull/17) (branch `claude/nice-ptolemy-c8o5g2`, up to date with `main`), local tests green; the repo has no CI.

## Done and left

**Done**

- [x] Firebase project `binzolive-e48d2`: Android app `com.aurora.liveapp` registered, Cloud Messaging API (V1) enabled.
- [x] Backend service-account key saved as the GitHub secret `FIREBASE_SERVICE_ACCOUNT_JSON` (`zimibackend`).
- [x] Backend code on `claude/fcm-push`: FCM sender, call/gift/coin/follower pushes, ringing call re-sent on socket connect with the caller's name, ring 30s, ring kept alive when the host's socket drops, deploy installs the key and turns push on, tests written. CI green (229 tests, audit, lint, image smoke test).
- [x] App code on `claude/nice-ptolemy-c8o5g2`: FCM token, full-screen ring with Answer/Decline, Missed call, general notifications, call foreground service, Android 14 full-screen check, tests.
- [x] Both PRs open; this document in both repos.

**Left (in order)**

- [ ] Review both branches.
- [ ] Put `google-services.json` (project `binzolive-e48d2`) next to `app.json` locally, and/or upload it to EAS as `GOOGLE_SERVICES_JSON` for each profile. Never commit it.
- [ ] On the VPS run `uname -r`: if the kernel is 6.19 or newer, MongoDB 8.0 will not start (see Known limits) — plan the MongoDB 8.2 upgrade first.
- [ ] Merge backend PR #23 (the deploy installs the key and turns push on).
- [ ] Build a test app (`eas build --profile preview --platform android`, a standalone APK) and install it on two phones.
- [ ] Test with `scripts/send-test-push.mjs`, then real calls (checklist under Testing).
- [ ] Merge app PR #17.
- [ ] Release build, internal-testing upload, Play Console declarations (Full-screen intent; Foreground service: phone call, camera, microphone).

## What it does

- A member calls a host → the host's phone rings even if the app is closed or
  the screen is locked: full-screen call notification with **Answer** /
  **Decline**.
- Nobody answers in 30s, or the caller hangs up → the ring stops and the host
  gets **Missed call**.
- Gift received, coins credited, new follower → normal notifications.
- Admin announcements with "Also send a push" → delivered through FCM.

Billing never depends on a push: it still starts only when both peers connect.

## How it fits together

```
App ──(1) FCM token──▶ POST /notifications/devices ──▶ PushToken (MongoDB)
Backend event ──(2) firebase-admin + service-account key──▶ FCM ──(3)──▶ phone
Phone ──(4) data message wakes index.js (even when closed) ──▶ notification
```

| Piece | Where | Secret? |
| --- | --- | --- |
| Firebase project `binzolive-e48d2` (BinzoLive) | Firebase console, account binzolive@gmail.com | — |
| `google-services.json` (Android app `com.aurora.liveapp`) | App folder next to `app.json`, or EAS file variable `GOOGLE_SERVICES_JSON` | No, but **not committed** (public repo) |
| Service-account key (Firebase Admin SDK) | GitHub Actions secret `FIREBASE_SERVICE_ACCOUNT_JSON` on `zimibackend` | **Yes.** Never commit or paste it |
| FCM token | Phone → backend `PushToken` collection | No |

## Firebase (done)

- Project `binzolive-e48d2`, Spark plan (FCM is free).
- Android app registered with package `com.aurora.liveapp`.
- Firebase Cloud Messaging API (V1) is enabled. The legacy API is not used.
- Service-account key generated and stored as the `FIREBASE_SERVICE_ACCOUNT_JSON`
  GitHub secret.
- Ignore project `binzolive-f5d0a`: an older file came from it; it is not on
  the BinzoLive account and must not be mixed with `binzolive-e48d2`.

To get `google-services.json`: Firebase console → Project settings → Your
apps → BinzoLive (Android) → download.

## Message contract

All messages are **data-only** (no `notification` block, except
announcements); every value is a string.

| `type` | Fields | Priority | Phone behaviour |
| --- | --- | --- | --- |
| `incoming_call` | `callId, callerId, callerName, callerAvatar, kind, sentAt` (epoch ms) | high, TTL 30s | Rings on channel `incoming_calls` with Answer/Decline and a full-screen intent. Ignored if `sentAt` is over 30s old. In the foreground the in-app ring screen is used instead |
| `call_cancelled` | `callId, callerId, callerName, callerAvatar, reason` = `missed` / `declined` / `answered` | high, TTL 30s | Stops the ring. `missed` also shows "Missed call" |
| `gift_received`, `coins_credited`, `new_follower` | `title, body` | normal | Shown on channel `general` while the app is in the background |
| announcement | FCM `notification {title, body}`, `data.notificationId` | normal | Shown by Android on `general` |

Answer opens the app; the backend re-sends the ringing call over the socket
when the host's app connects, and the app accepts it through the normal
`POST /calls/:id/accept`. Decline calls `POST /calls/:id/end` straight from the
notification.

## Backend changes (`zimibackend`, branch `claude/fcm-push`)

| File | Change |
| --- | --- |
| `src/modules/notifications/notification.service.ts` | Expo push replaced by `firebase-admin` (`fcm.send`, `sendEach`). New `pushToUser(userId, data, urgent)`: data-only push to every phone of a user; `urgent` = calls (high priority, 30s TTL, ignores the push preference). Never throws. Tokens FCM reports as unregistered/invalid are deleted. The announcement worker keeps its queue; FCM has no receipts, so acceptance is stored as `delivered` |
| `src/modules/notifications/notification.controller.ts` | `POST/DELETE /notifications/devices` accept FCM tokens (was Expo tokens only, which the app never sent) |
| `src/modules/calls/call.service.ts` | `pushRing()`; `finishCall` sends `call_cancelled` when a ring ends (`declined` by the host, otherwise `missed`) |
| `src/modules/calls/call.controller.ts` | `incoming_call` on create, `call_cancelled answered` on accept; **ring timeout 60s → 30s** |
| `src/modules/calls/signaling.ts` | On socket connect, re-sends a still-ringing call to the callee (needed for Answer); a callee losing the socket keeps their incoming ring (they can answer from the push) |
| `src/modules/calls/call.service.ts` (`withCaller`) | The ringing `call:updated` event carries `caller {name, avatarUrl, city, gender}`; the ring screen showed no caller name before |
| `src/modules/commerce/commerce.controller.ts` / `commerce.service.ts` | `gift_received` push; `coins_credited` when a coin purchase is paid |
| `src/modules/users/user.controller.ts` | `new_follower` push on a new follow |
| `src/config/env.ts` | `EXPO_ACCESS_TOKEN` removed; `GOOGLE_APPLICATION_CREDENTIALS` added; `PUSH_ENABLED=true` requires it |
| `.github/workflows/backend.yml` | Deploy writes the secret to `/opt/binzolive/backend/secrets/firebase-service-account.json` (dir 700, file 644 so the container's `node` user can read it) and checks it is a service-account key |
| `deploy/vps/compose.yml` | Mounts that file read-only at `/run/secrets/firebase-service-account.json`; sets `GOOGLE_APPLICATION_CREDENTIALS` and `PUSH_ENABLED=true` |
| `package-lock.json` | `undici` and `zod` updated past new high-severity advisories (CI audit; `main` fails the same check) |
| `ci/smoke.sh` | Smoke test uses `mongo:8.2.6` (8.0 refuses to start on the runners' Linux 6.19 kernel) and prints dependency logs on failure |
| `.gitignore`, `.env.example`, `deploy/vps/production.env.example`, READMEs | `/secrets/` ignored; env docs updated |
| `package.json` | `firebase-admin` added |
| `tests/call-billing.test.ts`, `tests/commerce.test.ts`, `tests/account-settings.test.ts` | Call ring pushes (incoming/declined/missed/answered, none after a connected call); ring survives a callee disconnect; caller name on the ringing event; announcement worker over FCM incl. token deletion; push opt-out |

## App changes (`Zimifrontend`, branch `claude/nice-ptolemy-c8o5g2`)

| File | Change |
| --- | --- |
| `package.json` | `@react-native-firebase/app` + `messaging` 27.1.0 (FCM), `react-native-notify-kit` 10.9.1 (Notifee fork: channels, full-screen call notification, foreground service). `expo-notifications` stays only for the tray icon/colour plugin and permission checks |
| `src/push.ts` | Rewritten: FCM token, channels `incoming_calls` / `general` / `ongoing_call`, `handlePush` (message → notification), `handlePushEvent` (Answer/Decline/taps), `trackCall` (stops the ring when the in-app screen shows it; ongoing-call foreground service `phoneCall|microphone|camera`; lock-screen flag), Android 14 full-screen permission prompt, token deleted on logout |
| `index.js` | Registers the background handlers before the app starts (works while killed) |
| `src/bridge.ts`, `web/aurora-runtime.js` | New `call.answer` message: Answer on the notification accepts the call once its ring screen is up |
| `modules/call-screen/` | Small local Expo module (Kotlin): `canUseFullScreenIntent`, open its settings page, show over the lock screen only while a call rings or is live |
| `app.json` | Permissions `USE_FULL_SCREEN_INTENT`, `MANAGE_OWN_CALLS`; notify-kit plugin with foreground-service types; FCM default channel `general` |
| `firebase.json` | Keeps React Native Firebase's default channel/colour equal to the `expo-notifications` plugin (avoids a manifest merge conflict) |
| `react-native.config.js` | Keeps Firebase out of iOS builds (iOS needs APNs and CallKit first) |
| `docs/API.md`, `README.md` | Contract and setup |
| `scripts/test-push.cjs`, `scripts/test-auth-bridge.cjs` | Tests (`npm run test:push`) |
| `scripts/send-test-push.mjs` | Sends a test call/missed/gift push to a phone without the backend |

## Rollout (after review)

1. **Backend PR #23** → `main` (CI is green). The deploy installs the key
   from the `FIREBASE_SERVICE_ACCOUNT_JSON` secret and turns push on; no server
   login needed. If the secret is missing the deploy stops.
2. **App PR** `claude/nice-ptolemy-c8o5g2` → `main`. Put `google-services.json`
   in the app folder (local) or upload it once for EAS:
   `eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret --environment <development|preview|production>`.
3. **New native build**; an OTA update cannot ship this.
   `--profile preview` = standalone APK for testing; `--profile development` =
   needs `npx expo start --dev-client`; `--profile production` = AAB for Play.
4. **Play Console** (after an internal-testing upload):
   App content → **Full-screen intent** → "Calling"; App content →
   **Foreground service permissions** → Phone call, Camera, Microphone, with a
   short demo video.

## Testing

- Dev build logs `FCM token (for scripts/send-test-push.mjs): …`.
- Without the backend:
  `GOOGLE_APPLICATION_CREDENTIALS=key.json node scripts/send-test-push.mjs <token> call c1`,
  then `… missed c1` within 30s, and `… gift`. (On the VPS: copy the script into
  the API container and run it there; the key is already set.)
- Real calls with two phones. For each of: app open, in background, swiped
  away, screen locked → Answer connects, Decline ends it for the caller, no
  answer in 30s → Missed call, caller hangs up → Missed call.
- Android 14+: turn full-screen notifications off → prompt; locked phone shows
  a banner instead.
- Xiaomi / Oppo / Vivo: enable autostart and unrestricted battery for the app;
  swiping it away can force-stop it, which blocks FCM until it is reopened.

## Against the original brief

| Brief | Result |
| --- | --- |
| Ring when killed/locked, Answer opens the existing call screen | Done in code (full-screen notification, Answer → existing ring screen → `call.accept`). Not yet tried on a device |
| `call_cancelled` + Missed call after hang-up / 30s | Done; server ring shortened from 60s to 30s to match |
| Gift, coins, follower pushes | Done. No separate "earnings" push: a host's earnings come from gifts (pushed) and calls (shown in the call summary) |
| RNFB app + messaging with their Expo plugins; `googleServicesFile` in app.json | RNFB installed, **without** its config plugins: Expo's built-in `googleServicesFile` handling covers Android and the RNFB app plugin breaks iOS prebuild. The file path is set in `app.config.js` (only when the file exists) |
| notify-kit vs expo-callkit-telecom | notify-kit chosen. expo-callkit-telecom needs `@livekit/react-native-webrtc`, but calls run as WebRTC inside the WebView (there is no react-native-webrtc). notify-kit has no true CallStyle: category CALL + full-screen intent + Answer/Decline + looping ringtone |
| Data-only messages in `setBackgroundMessageHandler` in index.js | Done |
| Channels `incoming_calls`, `general` | Done, plus a silent `ongoing_call` channel for the during-call foreground service |
| POST_NOTIFICATIONS, USE_FULL_SCREEN_INTENT + `canUseFullScreenIntent`, FGS phoneCall/camera/microphone | Done (local module `modules/call-screen` for the Android 14 check) |
| Upload token after login and on refresh; remove on logout | Upload and refresh done. Logout deletes the token on the phone (`deleteToken`), so FCM reports it unregistered and the backend deletes it on the next send; the app does not call `DELETE /notifications/devices` |
| Skip call pushes with `sentAt` older than 30s | Done |
| firebase-admin from `GOOGLE_APPLICATION_CREDENTIALS` | Done. Same variable; on the VPS compose sets it to the mounted path `/run/secrets/firebase-service-account.json` |
| Key mounted read-only into the container; never committed | Done. The key comes from a GitHub secret at deploy instead of a hand-placed file |
| `.env.example` has the variable; `.env` ignored | Done (`.env` and `.env.*` are in `.gitignore`) |
| Multiple tokens per user; register/remove endpoints | Already existed (`PushToken`, `POST/DELETE /notifications/devices`); now accept FCM tokens |
| Delete tokens on `registration-token-not-registered` | Done (also `invalid-registration-token`) |
| Billing untouched | Yes. Pushes are fire-and-forget; only the ring timeout changed |
| Firebase project `binzolive-f5d0a` | Replaced by `binzolive-e48d2`, the project on the BinzoLive account |
| Twilio | Used only for SMS login codes (`SMS_PROVIDER=twilio`). Calls use your own TURN server (`WEBRTC_TURN_URLS`, `WEBRTC_TURN_SECRET`) |

## Known limits

- Not yet run end to end on a device or against real FCM.
- Production runs `mongo:8.0` (`deploy/vps/compose.yml`). MongoDB 8.0 refuses
  to start on Linux 6.19+ (SERVER-121912). Fine while the VPS kernel is older;
  a kernel upgrade there would take the backend down. Upgrading to 8.2 is a
  separate, planned database change (backup first).
- "Missed call" can arrive up to 10s after the ring stops (the server sweeps
  expired rings every 10s).
- A phone whose clock is more than 30s ahead of the server drops rings
  (`sentAt` check).
- While a call rings or is live over the lock screen, the rest of the app is
  reachable without unlocking until the call ends.
- In the foreground the app shows no tray notifications (the socket updates
  the screens).
- iOS: not supported yet (needs `GoogleService-Info.plist`, an APNs key and
  CallKit/PushKit for calls).
