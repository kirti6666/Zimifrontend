# Android notification delivery

The native implementation targets the pinned Expo Notifications 57.0.24 APIs. `plugins/with-notifications.js` registers `BinzoNotificationsPackage` and replaces Expo's notification-event **receiver**, while retaining Expo's Firebase service, notification response intents, and cold-start response queue. Expo resolves the designated receiver by intent priority rather than hard-coding its implementation class.

`pushDeliveryProtocol()` reports `binzo.push.v1` only when that native module is installed. Device registration sends the capability to the backend. Older APKs continue using notification+data delivery; a JavaScript update alone does not add the native capability.

## Ownership and preferences

Before registering a device token:

1. Sync the authenticated account using `syncPushAccount(accountId)`; this disables display until settings are loaded.
2. Sync authoritative settings using `syncPushAccount(accountId, settings.preferences)`.
3. Register the token and protocol with the backend.

Resync after preference changes. Clear ownership using `syncPushAccount(null)` on logout or session retirement. Native preferences store only the account ID, master switch and category booleans; they contain no access or refresh credentials. Recipient identity, category preferences and expiry are checked both on receipt and immediately before presentation. Admin/global `announcements` use the default channel and follow the master switch without a separate category preference. The final check/post is serialized with logout and call dismissal.

## Wire contract

Capable devices receive high-priority **data-only** FCM messages. This lets native code validate and display them while JavaScript is absent. The fields are strings:

```json
{
  "protocol": "binzo.push.v1",
  "action": "notify",
  "title": "Incoming voice call",
  "message": "A creator is calling you",
  "channelId": "incoming-calls-v2",
  "notificationId": "507f1f77bcf86cd799439010",
  "category": "calls",
  "targetType": "call",
  "targetId": "507f1f77bcf86cd799439012",
  "actorId": "507f1f77bcf86cd799439013",
  "recipientId": "507f1f77bcf86cd799439011",
  "expiresAt": "2026-11-01T12:00:30.000Z"
}
```

`title`, `message` and `channelId` use Expo's direct-FCM data keys. `body` additionally contains a JSON string of the navigation metadata, protocol and action for Expo's JavaScript `content.data` mapping; raw keys remain present for native validation. Incoming calls require an authoritative future UTC expiry, bounded to three minutes. Messages use category `messages`, channel `messages`, target type `thread`, and the peer's ID. Other categories retain their corresponding channels and navigation targets.

The terminal control has `action: "call-ended"`, category `calls`, target type `call`, call ID and recipient ID. It has no display title/message. It dismisses only that account's call notification, even when notifications have subsequently been disabled. Native dismissal records a three-minute account/call tombstone so a delayed in-flight incoming message cannot restart ringing after a terminal control. Controls can include `expiresAt`; cancelling an existing call notification does not depend on its freshness.

## Calls, messages and taps

Incoming calls use the native `incoming-calls-v2` channel with high importance, the system ringtone and ringtone audio usage. The notification uses Android 12+ `CallStyle` with Answer and Decline actions (ordinary action buttons on older Android), repeating-alert flags and the authoritative expiry timeout; Android 7 uses an exact timeout alarm. Its tap opens the private native `BinzoIncomingCallActivity`, which shows the caller and controls before React, WebView, session restoration or update checks start. Eligible lock-screen calls use a full-screen intent; Android 14+ full-screen access is checked first, with the same actionable notification retained when access is unavailable. Android still controls heads-up/lock-screen presentation, notification permission, channel settings and DND.

Native Answer/Open/Decline actions are persisted as bounded owner/call/expiry/action hints with an exact action ID; no credentials enter Android preferences. Answer starts the app with a native React call surface covering startup, so the version check and launch logo do not replace the call controls. Notification capture starts above the update gate. A single authenticated `GET /calls/:id/incoming` supplies the current caller, recipient, kind and locked prices; verification never accepts or charges. A short in-memory verified snapshot avoids repeating that request during handoff. Explicit Answer follows the existing camera/mic preparation path before acceptance; paid member calls retain their verified price/coin review. Decline uses authenticated terminal cleanup even while a mandatory update blocks ordinary app access.

The normal mandatory update policy remains authoritative. Notifications cannot admit the WebView or bypass server minimum versions; pre-publication calls retain their existing server-owned continuation grace. Call acceptance and terminal socket events invoke `dismissIncomingCallNotification(callId)`, which also closes the native activity and publishes a matching terminal event to the startup surface. Owner changes, expiry and tombstones invalidate both screens and pending actions. Native acknowledgments do not cancel newer choices; late Open results cannot consume an explicit Answer. The React content stays mounted when the call overlay disappears.

Expo 57 skips its JavaScript presentation handler for foreground data-only notifications, so the custom receiver directly presents validated v1 envelopes and retains Expo listener dispatch. Legacy Expo call taps are captured early as navigation-only hints. No notification behavior triggers UI click vibration.

The new native activity was compiled and checked on the Android 35 emulator with local notification fixtures and MainActivity intentionally blocked. The checks verified immediate activity rendering, CallStyle/actions, Answer/Decline queueing, exact acknowledgments and terminal replay suppression without server requests or account-token access. This is separate from the earlier physical FCM delivery checks below. Run `node scripts/test-native-incoming-call.cjs emulator-5554` for the optional emulator-only check; physical serials are refused.

## Verification

`npm run test:push` checks foreground message/call presentation, stale/invalid/control suppression, API contracts and notification bridge routing. `npm run test:native-push` separately checks wrapper/plugin contracts and compiles/runs the actual pure Kotlin envelope policy using the cached Android Kotlin compiler. `:app:compileDebugKotlin` checks the complete native integration. The native policy test requires dependencies cached by an Android Gradle build; the ordinary push suite does not require that cache. `npm run test:dummy-calls` builds and checks the dummy-call UI behavior with fixtures.

Physical verification in this session used an OPPO CPH2689 running Android 16/API 36 and the locally installed debug build 1.1.1, version code 10. Real FCM message and incoming-call notification delivery passed in all three tested states:

| App state | Message | Incoming call |
| --- | --- | --- |
| Foreground | Passed | Passed |
| Background | Passed | Passed |
| Normal process killed | Passed | Passed |

The incoming-call tests observed the `incoming-calls-v2` channel, system ringtone, repeating `INSISTENT` flag and notification banner. A `call-ended` control dismissed the notification; a later incoming notification for that call remained suppressed after process restart, confirming the persisted cancellation tombstone. A separate final-build call expired automatically without a terminal control. The master-switch-governed announcement correction was rebuilt, installed and verified through real FCM on the default channel. These results cover delivery on this Android device; they do not claim physical iOS verification.

Here, closed means a normally killed process. Android Settings **Force stop** requires a manual app reopen before FCM delivery can resume. Device notification permissions, channel settings, DND and manufacturer power management remain effective. The device checks used a local debug build; no app release was published.

## Production APK candidate

Backend revision `7e0fed4` was deployed through [CI run 41202923606](https://github.com/neerajdev1/binzolive-backend/actions/runs/41202923606). Tests, image smoke checks and deployment passed. Post-deployment checks confirmed healthy API/database/cache, enabled push, successful compiled Firebase/OAuth/FCM validation, and zero observed push-processing or uncaught errors.

`npm run build:apk` produced `android/app/build/outputs/apk/release/app-release.apk`, version **1.1.2 / code 11**, with production HTTPS API/socket origins. Android's APK verifier passed, and its signing certificate matches the existing published certificate. SHA-256: `83b7f04c81ac5515578bd21b12d8a036b00327551ab0e46c175d6a6bad1d2f99`.

The signed candidate was installed in a read-only QA emulator and passed startup against production, reaching the welcome/login screen after the version check. The physical phone's existing debug session was preserved. The candidate has not been published through Admin → App releases. Existing APKs continue using the compatible legacy transport; the native repeating-ring behavior requires installing this updated APK.

This candidate was built during FCM verification, before subsequent support-chat changes. Rebuild the app for those later changes before distributing an APK.

References: [Expo app states and force-stop behavior](https://docs.expo.dev/push-notifications/what-you-need-to-know/), [Firebase Android receiving states](https://firebase.google.com/docs/cloud-messaging/android/receive-messages), [Android notification flags](https://developer.android.com/reference/android/app/Notification).
