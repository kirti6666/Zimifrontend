# Mandatory Android app updates

Install the updater bootstrap APK (version 1.0.5, Android build 2) once on
pre-updater devices. Their existing APK cannot acquire native installer code
remotely. Its signing certificate matches the current live build, so this is an
upgrade that preserves app data. Backend deployment alone does not activate an
update: the current legacy release stays non-enforcing until staff publish a
verified updater-capable APK.

For subsequent releases:

1. Run `npm run release:version -- <versionName>` before building. Keep the
   existing signing key and updater plugin enabled. See [native build details](NATIVE_UPDATES.md).
2. Run `npm run build:apk`, upload the signed APK in **Admin → App releases**, and save
   the draft. The server extracts the real package, build number and version;
   the admin label does not change the Android manifest. Start the signed APK
   on a device and verify production connectivity before publishing.
3. Review the draft and choose **Publish mandatory update**, then confirm.
   Publication requires an updater-capable APK with a strictly higher build
   number. It changes the download pointer and minimum supported build together.
   The server cryptographically verifies the APK with Android's official
   verifier and requires the existing app's signing certificate before saving
   a release. Another signing key cannot become a mandatory update.

After mandatory publication, outdated and headerless legacy clients are blocked
by HTTP 426. Legacy clients still need their one-time bootstrap installation;
they cannot show the new native update screen from their old code. Current
devices check before mounting the app, every 30 seconds while active, on resume,
on a release socket event, and after a 426. An unavailable or invalid version
check blocks entry with retry. A known mandatory release stays locked offline.

The native update screen has no skip or dismiss action. It downloads the stable
release URL, displays progress, verifies the APK, and opens Android's installer.
Android may first require “Allow from this source” for BinzoLive. Cancelling
settings or installation keeps the app locked. Only an installed current build
passes the policy check. Downloading the file or opening the installer is not
treated as a completed update. Account credentials are retained.

The coordinator lives in `src/app-update-controller.ts`; metadata and public
checks live in `src/app-update-policy.ts`. `App.tsx` mounts the WebView only when
the coordinator allows access. When it is retired, the bridge ends tracked
calls before releasing media. The backend also settles outdated participants'
active calls before disconnecting their sockets, with durable retry if cleanup
fails. Public update/download and terminal cleanup routes stay available.

Requests carry native `X-App-Platform`, `X-App-Version-Code`, and
`X-App-Update-Capable` headers. Socket authentication carries the equivalent
`appPlatform`, `appVersionCode`, and `appUpdateCapable` fields. These are client
compatibility controls; they are not account authentication or proof of a
tamper-resistant client.

Public protocol:

```text
GET /api/v1/app/update-check?platform=android&versionCode=2
GET /api/v1/app/releases/<release-id>/download
socket event: app:release-updated (policy invalidation only)
```

The first endpoint returns `{success:true,data:{updateRequired,
minimumVersionCode,release}}` without account credentials. The second redirects
to immutable release storage. Checks and redirect responses are not cached.
Metadata pins package, actual version, byte length and SHA-256; the download
path must match the release ID. Native code restricts HTTPS hosts and validates
the installed signer's certificate, package and target build before every
installer request. The system installer performs final APK installation checks.

Run `npm run test:app-updates`, `npm run test:native-updater`, the existing
API/bridge checks, TypeScript and a signed Android build when changing this flow.
Admin/backend have separate release-policy tests. Use an emulator for an
installation check; never publish a fabricated production release to test a gate.
