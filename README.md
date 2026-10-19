# Aurora Live App

A React Native (Expo) live-streaming frontend prototype with creator discovery, live calls, gifts, coin recharge, chats, profiles, settings, and Lenis-powered smooth scrolling.

## Run on your phone

```bash
npm install
npx expo start
```

Scan the QR code with **Expo Go**. Expo Go only supports one SDK at a time, so it
must be up to date for SDK 57 — if it refuses to open the project, that is why.

To get an installable app instead of Expo Go (an `.apk` you can sideload, no
Android Studio needed):

```bash
npx eas build --platform android --profile preview
```

With Android Studio or Xcode installed locally, `npm run android` / `npm run ios`
build directly onto a connected device.

## Connect to the server

```bash
cp .env.example .env   # set EXPO_PUBLIC_API_URL
```

The native app integrates with the sibling `backend/` API under `/api/v1`.
For a phone on the same Wi-Fi as your development computer, set its current
LAN address in `.env`, for example:

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.1.6:5000/api/v1
```

Use `http://10.0.2.2:5000/api/v1` for the Android emulator or
`http://localhost:5000/api/v1` when the app and backend share a host. A physical
phone cannot reach your computer through `localhost` or `0.0.0.0`. The backend
must listen on the LAN interface, and your firewall must allow port 5000.
Restart Expo after changing the address:

```bash
npx expo start -c
```

Release builds require HTTPS, for example
`https://api.example.com/api/v1`. Local HTTP is permitted only in development
for private/loopback addresses. Socket.IO defaults to the API origin, such as
`https://api.example.com`, using the server's `/socket.io/` transport path.
Set `EXPO_PUBLIC_SOCKET_URL` only when that origin differs. Keep credentials
out of all `EXPO_PUBLIC_*` variables.

On an iPhone/iPad, allow **Local Network** access for Expo Go or Zimi Live when
prompted; if previously denied, enable it in Settings. App configuration cannot
change the installed Expo Go client's own native permissions. Apple requires
this permission for outgoing connections to a LAN address.
([Apple local network privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy))

Custom Android Debug builds already allow local HTTP through the generated
`src/debug` manifest; no release cleartext exception is added. The
`with-development-network` plugin creates a separate iOS `Info-Debug.plist`
with the local-network explanation and local ATS exceptions, including a private
HTTP API address from the build environment. Only the Xcode **Debug** configuration
uses this file. The release plist keeps arbitrary and local cleartext exceptions
disabled. This also accounts for Apple's newer ATS handling of IP addresses.
([Apple ATS local networking](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking))

After changing native configuration, regenerate and rebuild custom development
clients: `npx expo prebuild --platform android` followed by `npm run android`,
or on a Mac `npx expo prebuild --platform ios` followed by `npm run ios`.
Do not use `--clean` on a native project with manual changes. EAS **preview**
APKs and production builds use release configuration and require an HTTPS API;
an internally distributed release APK is not a Debug development build.

## Run the website

```bash
npm run build      # writes dist/index.html
npx serve dist     # or open dist/index.html directly
```

Vercel runs the same `npm run build` and serves `dist/`, per `vercel.json`.
The website is the clickable preview: it fakes the other side of every call.
The phone app is built from the same screens with that turned off.

## Coins and gifts

`web/coins.js` and `web/coins.css` provide the shared gold Zimi coin, wallet,
coin packs, payment recovery, and gift selection. Selecting a gift does not
spend coins; the separate Send action confirms it. Adding coins from a gift
sheet keeps the current conversation, live stream, or call open.

Prices and balances come from the authenticated API. Uncertain payment and gift
retries reuse their original idempotency keys. Pending payment references are
stored per account in native SecureStore and verified on restart. Successful
gift delivery remains confirmed even if the subsequent wallet refresh fails.
Transaction history reloads from the wallet ledger when opened; chat gift cards
are session receipts rather than persistent chat messages.

Run `npm run test:coins` for browser integration checks with a stubbed native
bridge, and `npm run test:auth` for native bridge/API checks. These tests do not
charge real money. Actual provider settlement still requires an authorized
provider test transaction.

## Architecture

The Aurora UI is a self-contained web bundle rendered inside a `react-native-webview`, so the interface is identical to the previous Next.js version.

- `App.tsx` — React Native shell: the WebView, safe-area handling, the `data-theme` bridge to the status bar, and the hook-up to `src/bridge.ts`
- `src/` — everything that talks to the server: `api/endpoints.ts` (every request), `api/types.ts` (shapes), `api/realtime.ts` (live events socket), `bridge.ts` (messages between the screens and the app), `session.ts` (login token in secure storage), `config.ts`
- `web/` — the UI sources (`aurora.css`, `aurora-runtime.js`, `bridge.js`, `app.css`, plus vendored Lenis)
- `assets/aurora-bundle.js` — generated app build of `web/` (demo off), which is what the WebView is handed
- `assets/aurora.html` — the same app build, openable directly in a browser
- `dist/index.html` — generated preview build of `web/` (demo on), served as the website

### Changing the UI

Edit the sources in `web/`, then regenerate the bundle:

```bash
npm run build:web
```

Both files under `assets/` are generated by `scripts/build-web.mjs` — do not edit them by hand.

### Public profiles

Other-user profiles are rendered by `web/public-profile.js` and
`web/public-profile.css`. Open `dist/index.html?role=sender&preview=profile`
after `npm run build:web` to view the demo. The production app loads public
identity, real relationship counts, current call availability and paginated
posts through the native bridge and the existing `/users/:id` API.

Follow and block changes wait for server acknowledgement. Messaging, call
setup, live rooms and gifts reuse the existing permission checks and flows.
Run `npm run test:public-profile` for interaction checks and mobile/desktop
screenshots in `artifacts/`. Native bridge/adapter and backend public-profile
tests cover the API contracts and access rules.

### Offline UI

The offline view lives in `web/offline.js` and `web/offline.css`. Preview it at
`dist/index.html?role=sender&preview=offline` after `npm run build:web` (the
preview switch is disabled in the production app). It follows the selected
theme and keeps the header and navigation in place. Chats, forms, and active
calls use a compact connection notice that preserves the current screen.

Browser offline events and native API transport failures show the appropriate
connection state. Retry checks server reachability; recovery refreshes reads
without replaying messages, purchases, gifts, or calls. Run `npm run test:offline`
for browser checks and light/dark screenshots in `artifacts/`.

### Onboarding

The onboarding screens and interactions live in `web/onboarding.js` and
`web/onboarding.css`; bundled portrait assets and attribution are in
`web/onboarding-media/`. After editing, run `npm run build:web` to update both
the website preview and native WebView bundle. The preview accepts any
six-digit verification code and simulates account creation.

Run the browser regression checks with:

```bash
npx playwright install chromium  # once, after npm install
npm run build:web
npm run test:onboarding
```

The tests cover the preview flow and mocked native bridge responses; they do
not validate real SMS delivery or server persistence. Native touch feedback
uses `expo-haptics`: rebuild an existing development client or installed app
with `npm run android`, `npm run ios`, or EAS to include the native dependency.
If native `android/` or `ios/` folders already exist, run `npx expo prebuild`
first to apply the camera/gallery configuration (without `--clean`).
Check haptics and the camera/gallery picker on physical iOS and Android devices.

The native integration uses `POST /auth/otp/request`, `POST /auth/otp/verify`,
`GET /auth/me`, and `PATCH /auth/profile`. Access and refresh tokens stay in
native secure storage and never enter the WebView. Expired access tokens use
one shared refresh request with token rotation; session restoration distinguishes
temporary connection failures from expired sessions. The UI shows server-provided
retry countdowns for OTP limits and keeps onboarding drafts available after a
recoverable save failure. A creator selection records setup intent; approved
creator access is granted only by the server.

Photos are prepared in the UI, then uploaded as image bytes to short-lived
server-issued PUT URLs. The profile request contains storage keys and onboarding
metadata, not base64 images. The backend confirms ownership and uploaded objects
before saving the gallery. Configure its SMS provider, MongoDB, Redis, and S3/R2
storage before testing real delivery and profile persistence. The development
console SMS driver is for local testing; production requires a real provider.

Profile avatar/cover changes and creator photo posts also use Cloudflare R2.
Images are compressed to at most 1200 pixels before upload; saves and publishing
finish only after the server confirms the uploaded object. Failed requests keep
the draft available for retry. Posts require an approved creator account.
Configure `S3_REGION=auto`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, and `S3_PUBLIC_BASE_URL` in the sibling
backend's `.env`; see its [R2 setup](../backend/README.md#user-media-in-cloudflare-r2).
Credentials stay on the backend. Existing external media is not automatically
migrated. Run `npm run test:media` for upload contracts and media UI checks;
these tests use simulated storage and do not verify a live R2 bucket.

Run the native transport and API contract checks independently of the browser:

```bash
npm run typecheck
node scripts/test-api-client.cjs
npm run test:api-adapter
node scripts/test-auth-bridge.cjs
node scripts/test-native-network.cjs
```

These checks use isolated mocks and do not send real SMS, create real accounts,
or charge payments. Browser tests also exercise native bridge acknowledgements,
rate limits, session recovery, and creator setup using mocked server responses.

## Home screen and admin controls

The compact Home layout lives in `web/home-dashboard.js` and
`web/home-dashboard.css`. It includes search, call/chat shortcuts, live rooms,
category filters, creator cards and matching. The configured featured creator
leads the For you cards. Profiles, calls and live rooms have separate actions;
approved hosts get a Go live shortcut and their eligible reward banner.
Home discovery shows one creator per row at every screen size, with no pricing
on cards. Live now uses side-by-side cards in one horizontally scrollable row.
Video call opens a confirmation screen with the current rate and wallet balance.
Paid calls require a loaded balance and at least one minute of coins; members
can retry a failed balance load or buy coins when needed. Confirming a live
host joins their room and sends one private-call request after membership is
confirmed. Unavailable calls stay disabled; tapping a creator photo opens their
profile. Leaving confirmation starts no call and sends no request.
Shared discovery, gifts and checkout flows remain in `web/home.js` / `web/home.css`.
`web/media.js` handles camera/microphone capture and WebRTC media; authenticated
HTTP and Socket.IO still run through `src/`.

In the sibling **admin-dashboard**, open **Settings → Home screen** to choose
the featured creator and reward mission or enable/disable matching. Creator
approval, account status, gifts, coin packs, announcements, and stream moderation
use the existing dashboard tools. Changes refresh the connected home feed.
Mission eligibility and wallet credits are checked by the server.

Run `npm run build:web` after changing web sources. Run `npm run test:home`
for responsive interaction checks and real browser WebRTC tests using test
devices. It also writes `artifacts/home-simple-mobile-dark.png`,
`artifacts/home-simple-mobile-light.png` and `artifacts/home-simple-desktop.png`
for review. Preview portraits/activity are demo
fixtures only; the phone build starts empty and displays server data.

Rebuild/install the native app (`npm run android` or `npm run ios`) to include
the new microphone permissions. Test calls and broadcasts on two physical
devices with the deployed API and configured TURN service. Broadcasting uses
one WebRTC connection per viewer and is intended for small rooms; large
broadcasts need a dedicated media relay/SFU. Calls currently show **Free**,
matching the backend; paid minute metering is not implemented.

PayPlus checkout opens the provider's HTTPS payment page and checks the payment
when the app becomes active again. The backend's signed webhook and payment
verification remain authoritative. Configure the provider and confirm a real
device checkout before using payments live.

## Live studio and private calls

The call setup screen (`web/call-setup.js` / `web/call-setup.css`) fills the
viewport using the selected account theme, including its colors and typography.
Choose Video or Voice before starting. Camera/microphone access can be
cancelled, times out after 30 seconds, and never resumes an abandoned call.
Preview it at `/?preview=precall&role=sender` or
`/?preview=precall-offline&role=sender`. Run `npm run test:call-setup` for layout,
availability, permissions, retry, and navigation regression checks.

The immersive room interface lives in `web/live-room.js` and `web/live-room.css`.
It includes viewer/host layouts, live chat, follows, server-priced gifts, gift
alerts and session supporters, hearts, a private-call request queue, camera/mic
controls, camera switching, and a private video/voice call screen. Studio goals
and appearance filters apply to the host's own session display; filters do not
change the camera video sent to other people.

View the interactive demo after `npm run build:web` and `npx serve dist`:

- `/?preview=live` — viewer
- `/?preview=host-live&role=host&approvedHost=1` — host studio
- `/?preview=call` — private video call

Only the preview build contains sample people/activity. The native build waits
for authenticated server responses. Queue acceptance ends the public stream and
opens a private call for the host and selected viewer; camera permission failures
end the call and release media. Call-scoped chat verifies the active participants.
Calls are free; paid-minute metering and PK battles are not implemented.

Native invitations use `zimilive://live/<streamId>` and the device share sheet.
Rebuild the native app to register this scheme. Invitations wait for sign-in and
show a join confirmation; they do not interrupt an existing live or private call.

Run `npm run test:live` for responsive UI, native message contracts, queue/error
handling, and browser WebRTC media tests. These tests use fixtures and virtual
cameras. Validate two physical devices against your configured backend and TURN
service before release; the existing broadcaster sends one peer connection per
viewer and is intended for small rooms.

## Themes and premium appearance

Open **Profile & Settings → Appearance & Theme** to browse the theme gallery.
Zimi Original and Soft Rose are free; premium includes Midnight Ocean and Amber
Silk. The sibling admin dashboard's **Themes & text styles** section controls
colors, fonts, text sizing/weight, ordering, availability, premium flags, and
the one-time premium price (initially ₹199). Built-in free themes remain available.
Admins can choose **Set as default** on any active free theme. Users without a
saved theme, or whose selected theme becomes unavailable, receive that default.
Saved eligible selections stay unchanged. The gallery labels the app default;
tapping any card, including the active default, saves that theme as a personal
choice. Choose a different default before hiding it or making it premium.

Selections are saved to the account through `/themes/preference`. Premium access
comes from a verified paid purchase on the backend; opening checkout or returning
to the app does not unlock it. All premium themes share one lifetime unlock.
The app opens the existing PayPlus hosted checkout, supports continuing an
unfinished checkout and checking payment status, and refreshes eligibility on
return/reconnect. Reversed purchases and unavailable themes fall back to a free
theme. Configure and verify the backend's PayPlus integration before live sales.

`web/themes.js` applies validated color and typography tokens across authenticated
screens, live/private calls, sheets, dialogs, and native loading/error chrome without
replacing screen content or interrupting media. Colors transition for 260 ms; reduced-motion
users get an immediate change. Admin updates and account changes refresh the
catalog, and signing out clears the previous account's theme and payment state.
The website preview uses demo themes and a clearly labeled, no-charge preview
unlock. Rebuild the WebView bundle with `npm run build:web` after edits.

Run `npm run test:themes` for responsive gallery, transition, selection, payment,
revocation, and account-isolation browser checks. These use mocked native events
and do not make real purchases. Run `npm run test:theme-consistency` to verify
selected palettes across screens and call overlays. Verify hosted checkout and native safe-area
appearance on physical Android/iOS devices before release.

## Notes

Authentication, onboarding, discovery, chat, follows, gifts, mission claims,
wallet reads, calls, and live stream rooms use the native API layer. Withdrawals,
some legacy account settings, and incoming-call push delivery while the app is
closed still need their respective integrations. The browser preview remains
a demo. `docs/API.md` describes the older screen-facing contract; the implemented
native adapters and sibling backend routes are authoritative.
