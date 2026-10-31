# Native Android APK update builds

The Android updater is registered by `plugins/with-apk-updater.js`. Keep that
plugin enabled when regenerating Android with Expo prebuild. It copies the
Kotlin native module, adds the narrowly scoped FileProvider and install-request
permission, and records `com.binzolive.UPDATE_CAPABLE=1` in the APK manifest.
`src/native-apk-updater.ts` is used by native application code only; these
methods are not WebView bridge commands.

Before every release build, increment the actual Android version code:

```powershell
npm run release:version -- 1.0.8
# Or specify a larger unused code explicitly:
npm run release:version -- 1.0.8 5
npm run build:apk
```

The command updates Expo `app.json` and an existing native Gradle project
together and rejects the current or a lower code. The admin version label is
separate from the APK's real manifest version. The live pre-updater APK was
inspected as versionName `1.0.0`, versionCode `1`, regardless of its admin label
`1.0.4`. The initial updater was `1.0.5` / code `2`; the bootstrap with call and
checkout deferral is versionName `1.0.6`, versionCode `3`. The launcher artwork
correction is versionName `1.0.7`, versionCode `4`.

`build:apk` explicitly supplies the production HTTPS API/socket addresses and
forces the release JS bundle and package tasks to run. A plain Gradle build can
otherwise reuse a bundle made with a developer's local `.env`. Verify a signed
APK's startup on a device before publishing it.

EAS uses remote build numbering in `eas.json`. If using EAS after publishing a
local Gradle build, set its remote Android version to at least the published
code with `eas build:version:set` before the next production build increments
it. Use the same signing credentials; the admin rejects duplicate build codes.
See [Expo's version management documentation](https://docs.expo.dev/build-reference/app-versions/).

Preserve the existing signing key. The current published APK and the local
`androiddebugkey` certificate both have SHA-256 fingerprint:

```text
fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c
```

Before installation, native code validates the release's SHA-256 and byte size,
then the signed APK package, exact target version code and installed signer
certificate set. It validates the cached file again before each installer
request. Changing the signing key will cause existing installations to reject
the update.

Download requests start only at the API's release-specific HTTPS path. Redirects
are restricted to the API and the exact configured storage hosts. No account
token or cookies are supplied to object storage. Change `storageHosts` in the
plugin configuration only when the release-storage host changes, then rebuild
the app; wildcards and arbitrary origins are not accepted.

Partial downloads resume with validated HTTP ranges. APKs are limited to
250 MiB; partials and verified receipts are in app-private cache, excluded from
Android backup. A cancelled retry may retain its partial, while supersession
can discard it. At most one partial and two verified APK files are kept. Cache
eviction triggers a new download rather than trusting a missing receipt.

Android requires the user to allow this app to install updates and confirm the
system installer. The native module opens that settings page when needed and
returns `permission_required`; a persisted verified receipt survives the
activity roundtrip. The app must re-check its installed version on resume and
remain blocked if permission or installation is cancelled. It never silently
installs an APK or opens a browser to download one.

An update announced during a call or purchase waits for that activity to finish.
Native bridge leases cover pending call requests, ringing, accepted calls,
checkout creation, external payment and verification without a handoff gap.
Closing the correlated checkout UI releases its deferral after pending requests
settle; server-owned order tracking remains intact for late confirmation. A
trusted checkout expiry also ends that UI lifetime. These local signals do not
grant backend access or authorize new calls or purchases after an update is due.

Device validation should cover permission denied/granted, installer cancelled,
successful same-key upgrade, an interrupted download, low storage and a corrupt
or wrong-signer APK. The Android system remains the final installer authority.

Validated on an Android 35 emulator on 2026-10-30:

- Installing the bootstrap over the actual published code `1` APK preserved a
  private app-data sentinel. The running native module reports `1.0.5` / code `2`.
- A local-only, same-key code `3` fixture opened the Android install-source
  settings. Denying permission kept code `2`; its verified receipt survived
  process/activity roundtrips. Granting permission opened Android's package
  installer through the FileProvider. Cancelling kept code `2`; retrying and
  confirming installed code `3` while preserving the sentinel.
- Native verification rejected incorrect byte size, checksum, target version,
  package, APK signature and signer certificate, plus arbitrary install paths
  and untrusted HTTPS origins. The fixtures were never published.
- The final production APK passed the deployed HTTPS version check and opened
  the normal welcome/login screen when no update was required.

The installer fixture test stages a receipt inside the instrumented test
process; it does not replace an interrupted-network or low-storage device test.
