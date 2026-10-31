# Working on this app

This is a React Native app (Expo SDK 57). The Aurora interface itself is a
self-contained web bundle rendered in a `react-native-webview`, which is what
keeps it identical to the original Next.js version.

## Where things live

- `App.tsx` / `index.js` — the React Native shell. Keep it thin: WebView,
  safe-area handling, the `data-theme` bridge to the native status bar, and
  passing messages to `src/bridge.ts`.
- `src/` — all server access: `api/endpoints.ts`, `api/types.ts`,
  `api/realtime.ts`, `bridge.ts`, `session.ts`, `config.ts`. See `docs/API.md`.
- Mandatory Android updates gate the WebView in `src/app-update*`. Native build
  identity, download verification and system installation stay outside the web
  bridge. Preserve the updater plugin and signing key; bump the real Android
  version code for each release. See `docs/APP_UPDATES.md` and `docs/NATIVE_UPDATES.md`.
- `web/` — the actual UI. `aurora-runtime.js` renders every screen by assigning
  HTML strings, styled by `aurora.css`.
- `web/flat.css` — the final shared design layer: a pure white canvas, no box,
  text or filter shadows, and 10px corners on every element except its round
  list: the bordered 44px Back button and the close/more buttons beside it,
  every call button, avatars and switches are always circles. Keep that list in
  step with `ROUND` in `scripts/flat-corners.cjs`. Lines never get rounded
  ends: dividers, single-side borders, tab and navigation underlines and
  edge-to-edge surfaces (the post feed, page shells) and country flags keep square
  corners via the straight list in `web/flat.css`, mirrored by `STRAIGHT` in
  `scripts/flat-corners.cjs`. Headers sit on the page without a divider line,
  and settings rows have no dividers.
  Account themes customize accents and typography while keeping the white canvas.
  The reference coin-package geometry is a scoped exception: `.zw-reference`
  keeps the three-column cards, gold coin artwork and rounded pills. It follows
  the active account theme and Dark Mode using shared color tokens, including
  the purchase button. Never force a black canvas, pink palette or glow on Coins.
  Back buttons always use the shared bordered 44px circle and the same icon;
  do not add a coin-specific size, color or border override.
- Posts: `web/post-create.js` is a separate New post page (`create-post`
  view) that keeps its draft for the session. Tapping a profile photo opens
  `web/post-view.js`, a vertical feed like other photo apps, starting at that
  post: author row, the whole photo, a heart (tap it, or double-tap the photo
  to like with a large heart), comments in a sheet (add; authors delete their
  own and the post owner deletes any), caption with "more", relative time and
  more posts as you scroll. Likes update at once and roll back if the server
  refuses; the server hides phone numbers and abuse in comments.
- Dark Mode is a Settings toggle remembered on the device (`zimi.darkMode` in
  localStorage, `ZimiThemes.dark()`/`setDark()` in `web/themes.js`). It swaps
  the palette to black and keeps the theme's accent; the native status bar
  follows `data-theme`/`data-canvas`. Style with tokens (`--canvas`,
  `--surface`, `--raised`, `--ink`, `--muted`, `--line`), never hard-coded
  white or near-black, so both modes work.
- Keep the visual hierarchy restrained: 20px mobile gutters, 24px/600 page
  titles, 18px/600 section headings, 14px body copy and 12px metadata. Use accent
  for primary actions and selection; navigation/metadata are neutral. Profiles
  share a compact neutral cover fallback and unboxed stats, with no eyebrow.
- Motion uses brief press feedback and 180ms content fades. Avoid bounce,
  floating decoration, confetti, animated navigation chrome and list reveals.
  The launch logo fades and rises gently into place, then fades out once the
  first screen is ready. Finish its introduction before exiting, without an
  artificial loading timer, rings or zoom. Respect reduced-motion settings.
- `web/profile.js` / `web/profile.css` ? Profile & Settings. Use authenticated
  account summaries for identity, counts and preferences; never copy sample
  balances, VIP levels or host ratings into production.
- `web/icons.css` / `web/icons.js` — icon motion. Icons from the `I`/`hi`/`ci`/`zi`
  helpers carry `data-icon`; a press plays that icon's animation (and continues it
  when the screen redraws). Add new icons through a helper and give them an
  animation in `icons.css`; inline SVGs get no motion. Loops are only for things
  waiting on the person (unread bell, ringing call, empty states, gifting).
- `web/admin.html` — the desktop-only admin console. Self-contained; never part
  of the phone app. `npm run build:web` also copies it to `dist/admin/` for
  previews (skip with `INCLUDE_ADMIN=0`); `npm run build:admin` builds the
  production copy into `admin-site/dist/`. See `docs/ADMIN.md`.
- `assets/aurora.html` and `assets/aurora-bundle.js` — **generated** app build
  (demo off); `dist/index.html` is the preview build (demo on). Never edit
  them; edit `web/` and run `npm run build:web`.

## Rules that matter

- Live streaming is temporarily disabled. Keep the web release flag
  `ZIMI_LIVE_STREAMING_ENABLED` and native `LIVE_STREAMING_ENABLED` off; retain
  private video/voice calling. Hide stream discovery, broadcasts, links and
  queues, and route creator availability through the 1:1 call setup.
- The Home header follows the user's reference: Following, Explore, For You
  and New tabs in place of the app name (the selected one larger and bold),
  then Search and a gold trophy that opens the creator leaderboard (`board`,
  `web/leaderboard.js`, real `GET /leaderboard/creators` data). No wallet or
  notification bell on Home. The feeds map to the server's `mode`: Following
  = `following`, Explore = `popular` (default), For You = `foryou` (hosts not
  followed yet), New = `new` (latest hosts first). Under the header, country
  chips: Popular and India only for now (`country=India`), hidden on
  Following. Then one square-card two-column grid with "Load more"; there is
  no featured card, section title or category chips. An approved host's
  availability is a floating "Go online"/"Online" button at the bottom right of
  Home, where the reference has its LIVE button. Use the selected theme's
  colors. Filter hosts on the server before pagination.
- Every host list (Home grid, All Creators, Search) uses the square photo card
  `homeTile` in `web/home.js`, matching the user's reference: an Online tag in
  the photo's top-left corner, then the name with the country flag (India as a
  rectangular CSS flag, other countries as the system flag emoji, never a
  circle; a name the country list doesn't know stays text). The server sends
  the country a host chose, else their phone number's (`countryOf` in the
  backend), so flags and the India chip work for hosts who left it blank. Then
  a round video call button that is always active
  (never disabled, whatever the host's status; `homeCall` explains when a call
  can't start). No price, tagline or avatar on the card, and no Chat buttons.
  Ads sit inside the host grids (Home and All Creators), never above the hosts.
  Campaign banners (ad format `campaign`, from the user's reference) rotate
  after the first two rows (`HOME_CAMPAIGN_AFTER` = 4 hosts): a full-width 11:3
  picture with its text drawn in, position dots, a small "Ad" label that opens
  About this ad, native swipe, auto-advance every 4.5s (held while touched,
  focused, hovered, off screen or hidden; never with reduced motion), a counted
  view per slide and a counted tap (`zaCampaigns` in `web/ads.js`). Sponsored
  cards (banner/video) follow ten hosts (`HOME_AD_AFTER`). A shorter grid keeps
  both below its hosts.
- Never show a host as offline. `hostFrom` in `web/aurora-runtime.js` marks
  every host online and lets members call an offline host (the server rings
  until the call is missed); only an online host's own call settings make
  calls unavailable. New screens must read `h.on`/`h.available`, never the
  raw `online` field.
- The bottom tabs are Home, Chat, Profile and Settings (the chat route remains
  `chats`). Explore is removed; old Explore routes resolve to Home. `all-creators`
  (from the Home empty state) and the `board` leaderboard are detail pages
  with Back and no bottom tabs.
  Profile and Settings are separate screens;
  Settings owns the total coin balance card and Add coins action.
- Shared tab geometry lives in `web/navigation.css`: 58px content bar, 44px
  button targets and zero outer margins. Native `SafeAreaView` owns system
  insets; `data-native-safe-area` prevents a second web bottom inset. Standalone
  browsers add their bottom inset once. Do not add extra height in `flat.css`.
- Safe-area insets everywhere: use `var(--safe-top)`, `var(--safe-right)`,
  `var(--safe-bottom)` and `var(--safe-left)` (defined in `web/aurora.css`), never
  `env(safe-area-inset-*)`. They are 0 inside the app, where the native
  `SafeAreaView` already pads and newer Android WebViews still report the insets
  (that doubled the space under bottom bars and above top bars); standalone
  browsers get the device insets once. `scripts/test-safe-area.cjs` checks this.
- The Profile tab uses the same `web/public-profile.js` layout and authenticated
  public-profile reads as other users' profiles, with Edit profile, avatar/cover
  upload and own-photo actions. Keep its bottom tabs and owner-only controls;
  public gallery publishing still requires current approved creator access.
- Settings follows the simple reference layout: Back header, compact profile,
  balance card and one compact list of plain icon/title rows, led by "Refer a
  Friend & Earn 1,000 Coins", with the Dark Mode switch after General. Account, Payments, Privacy & Terms and General open their
  detailed options; Appearance & Theme lives under General. Call availability,
  Match & Speed Pulse and Notifications & Alerts are not settings items (hosts
  go online from Home; notification preferences open from the inbox). Anywhere
  in Settings, including the detail rows, keep only titles, icons and status
  controls: no search box, category chips, theme banners, section headings,
  helper subtitles, divider lines or decorative footer.
- Refer a Friend & Earn (`web/referral.js`, view `refer`, server-owned rewards):
  the Settings row opens a detail page (Back, no bottom tabs) with the member's
  code, Copy, Share invite (native share sheet), how it works, counts and, while
  the account may still use one, a friend's-code form whose refusals show beside
  the field (`referral.error`). A friend gets 100 coins for using a code; the
  inviter gets 1,000 when that friend's first coin purchase is confirmed. Two
  promotions, both only after `data.referral` arrives from the server: a Home
  pop-up for members (not approved hosts) at most once a day per account, and a
  card under the call toolbar one minute into a member's video call, for eight
  seconds, once per call, never over the camera preview or the call controls;
  its Invite opens the share sheet over the running call. The design preview
  shows the pop-up and card only with `?promo=refer`.
- There are no refresh buttons or refresh icons. Screens reload with pull to
  refresh (`web/pull-refresh.js`): register a screen with
  `ZimiPullRefresh.register(view,{refresh,busy})`. The indicator is the
  platform-default round spinner: it follows the finger, spins while `busy()`
  is true (at least briefly, at most 15s) and then shrinks away. Error states
  keep a text Retry/Try again button.
- Automated welcome messages show in chats without an automation label.
- Chats has no "Online now" strip. Its tabs: All and Unread list conversations;
  Calls lists call history (`data.calls`: voice/video, direction, status) and
  Missed calls lists missed calls with Call back. Call rows use the full-width
  conversation row and open the other person's profile. When a call ends, is
  declined or is missed, the bridge re-reads both lists in the background.
  A conversation also shows the account's calls with that person at their time
  (`zcCallBubble` in `web/chats.js`, from `data.calls`): outgoing on the right,
  incoming on the left, with the duration or how it ended (missed in red). They
  are not messages: no menu, reply or read ticks.
- Approved hosts may message any member or another approved host at any time;
  members message approved hosts. Approved hosts may also call any member by
  voice or video at any time (there is no member permission switch), and can
  Follow members back. The member pays the host's rate after answering, with
  no entry fee, on the `incoming` ring screen; blocks still stop calls. See
  `docs/POLICIES.md`.
- Outgoing calls (`dial` and `dialback`, both drawn by `vDial`) play a ringback
  tone drawn with Web Audio (`web/call-ringback.js`, no sound file) only while
  that screen shows and the app is in the foreground; any other view silences
  it. The avatar rings and "Calling" dots in `web/call-dial.css` follow the
  tone's 3s cycle through `--dial-phase`, so redraws do not restart them.
  A video call rings over the caller's own camera, full screen (portrait frames
  cover, landscape frames stay whole, the front camera is mirrored), with Flip,
  Camera and Mute beside Cancel. The same `video[data-zimi-local]` moves into
  the call when it is answered; with the camera off the plain calling screen shows.
- Calls keep going behind other screens (`web/ongoing-call.js`). Back on the
  calling and call screens (their Back button and Android back) minimizes the
  call into `S.bgCall` instead of ending it; the red buttons end it. A
  theme-accent bar above every other screen shows the person and "Calling…" or
  the call time, keeps the other person's audio playing (a small live video for
  video calls) and returns to the call as it was on tap; its red button ends the
  call. While a call is minimized its clock, camera, microphone and ringback keep
  running, no other call can start, an answer opens the call screen, a host's
  next caller reopens the call with its banner, Back on Home returns to the call
  instead of leaving the app, and screens stay secure.
- Animated gift stickers live in `web/stickers/` (built with
  `scripts/build-gift-sticker.py`) and are matched to catalog gifts by name in
  `web/gift-stickers.js`; the backend catalog seed uses the same names. Gift
  pickers and receipts show the still cover; the animation plays only when a
  gift is sent or received (the cover under reduced motion). Read gift artwork
  through `giftStillUrl`/`giftMotionUrl`, not the raw `mediaUrl`.
- The gift picker follows the supplied dark reference in `web/gift-picker.css`:
  a rounded bottom sheet, purple/pink header glow, live pink balance/top-up pill,
  and four open columns of still artwork, names and gold prices. `.zg-reference`
  is a scoped exception to the flat palette/corner rules; keep other account
  themes and embedded coin checkout unchanged. Reference gift names appear first
  when present, with all remaining real catalog gifts below. Selection reveals
  the explicit Send action; never invent gifts, prices or wallet balances.
- Show the Following/Explore/For You/New Home header only on Home. Chat, Profile and
  Settings use their existing page headings and actions. Keep primary tabs
  the same size across those main screens; All Creators, Leaderboard, Notifications and Themes
  have their own Back headers and no bottom tabs. Themes opens as a page, not
  a settings modal. Animate only page content on tab changes and
  respect reduced-motion preferences.
- Add coins follows the supplied coin-package geometry: a compact balance pill
  and static INR pill, a 3-by-2 pack grid with gold coin stacks, and a fixed
  `.zw-checkout-footer`. All colors and native chrome follow the active account
  theme and Dark Mode; entering or leaving Coins must not change those choices.
  Its Back button is the same shared 44px bordered circle used elsewhere.
  Embedded gift top-ups also follow the active theme and keep their footer
  in normal flow so they do not cover an active call or the enclosing sheet.
  Keep content, errors and recovery controls reachable above the fixed footer.
  Display only server-supplied coin quantities and prices. Optional purchase
  `bonusPercent` metadata must be an integer from 1 through 1000; `badge` accepts
  only `hot` or `popular`. Without valid bonus metadata, use "Choose your coin
  pack" and the server's pack names, with no invented promotion. "Welcome Bonus
  for You!" belongs to actual purchase-bonus metadata or the demo catalog; do
  not derive a purchase bonus from creator mission rewards or catalog pricing.
  Demo-only fixtures contain the six reference packs and promotion labels.
  Preserve the purchase action's `Get N coins` accessible name while its visible
  label includes the selected quantity and price. Get Coins opens payment-method
  selection before creating a new checkout. Use only server-supported routes,
  retain uncertain-request route/idempotency recovery, and leave premium checkout
  separate. On return from an incomplete external coin payment, refresh the
  balance/catalog, dismiss its pending and saved-method cards, show
  "Your payment failed. You can try again." and allow any package with a fresh
  method/checkout. Native order tracking continues for late server confirmation;
  old callbacks must not restore a dismissed checkout or replace a newer attempt.
  Errors and recovery controls must remain scrollable and visible.
- Wallet uses a compact balance card and recent activity. Approved creators see
  authenticated INR earnings and withdrawal links; never convert coin balances
  into assumed earnings or promise instant payouts. Keep loading, error/retry
  and empty activity states visible.
- The host go-live flow (`web/host-calls.js`, `web/host-studio.js`, the host
  call in `web/live-room.js`) follows the host reference layout but always
  uses the selected theme's colors, never a fixed palette. The host's camera
  fills the screen: capture at 1280x720 with `resizeMode: 'none'` (portrait
  sizes made the browser crop and zoom), and let `data-zimi-shape` show a
  landscape camera whole instead of cropping it.
- Creator capabilities require current admin-approved host access.
  Use `ZimiHostAccess` in the web UI and enforce approval in the native bridge
  and backend; local role or verification presentation state grants no access.
- Always use layout-shaped skeletons for asynchronous content loading, including
  initial loads, refreshes and pagination. Tie them to actual request state;
  never use artificial loading timers. Keep empty and error states separate,
  label skeletons for accessibility, and respect reduced-motion settings.
- At launch, the native animated logo (`src/launch-screen.tsx`) covers the page
  instead of a skeleton. `web/loading.js` sends `app.launched` once the saved
  session is settled and no skeleton is visible (`.zh-skeleton`,
  `.ob-session-skeleton` or `role="status"` with `aria-busy="true"`), or at once
  when offline. Give any new first-screen loading state that markup, or the
  logo leaves too early. Run `npm run test:launch`.
- `web/aurora-runtime.js` must stay a top-level classic script. Its inline
  `onclick` handlers resolve globals (`S`, `r`, ...) through the global scope
  chain, so wrapping it in an IIFE or loading it as a module breaks navigation.
- Any change under `web/` needs `npm run build:web`, or the app still renders
  the old bundle.
- `npm run typecheck` covers the RN shell and `src/`; the `web/` sources are
  plain browser JS and are not typechecked.
- Anything that fakes the other side (auto pick-up, fake callers, fake gifts or
  replies, sample data) must be behind `DEMO` in `web/`. Every real user action
  calls `Native.send(...)`; every server event is a `Native.on(...)` handler.
  Add new message types to `WebMessage` / `AppMessage` in `src/bridge.ts` too.
