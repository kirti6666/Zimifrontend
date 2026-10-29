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
- `web/` — the actual UI. `aurora-runtime.js` renders every screen by assigning
  HTML strings, styled by `aurora.css`.
- `web/flat.css` — the final shared design layer: a pure white canvas, no box,
  text or filter shadows, and 10px corners on every element except its round
  list: the bordered 44px Back button and the close/more buttons beside it,
  every call button, avatars and switches are always circles. Keep that list in
  step with `ROUND` in `scripts/flat-corners.cjs`. Lines never get rounded
  ends: dividers, single-side borders, tab and navigation underlines and
  edge-to-edge surfaces (the post feed, page shells) keep square corners via the
  straight list in `web/flat.css`, mirrored by `STRAIGHT` in
  `scripts/flat-corners.cjs`. Headers sit on the page without a divider line,
  and settings rows have no dividers.
  Account themes customize accents and typography while keeping the white canvas.
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
  The launch logo fades without rings or zoom. Respect reduced-motion settings.
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
- The Home header has All/Following tabs in place of the app name, then
  (approved hosts only) the host's own Online/Offline status, the coin
  balance, Search and Notifications. All lists every host; Following uses
  the server's `mode: "following"` feed. No category chips on Home or All Creators
  for now. Home shows a featured photo card and a two-column host grid titled
  "Instant Connect" ("Following" on that tab). Cards
  open the creator profile; Chat belongs on that profile. Use
  the selected theme's colors. Filter hosts on the
  server before pagination; feature a host once across hero/grid.
- Every host list (Home grid, All Creators, Search) uses the photo card `homeTile`
  in `web/home.js`, matching the user's reference: Online and price pills over
  the photo, then avatar, name, tagline and a round video call button that is always
  active (never disabled, whatever the host's status; `homeCall` explains when a
  call can't start). Do not add Chat buttons to discovery cards.
  Sponsored cards go inside the grid after six hosts (`HOME_AD_AFTER`), or
  below a shorter grid; never above the hosts.
- The featured card (`HomeFeatured` in `web/home-dashboard.js`) spotlights
  the server's featured creator and the next four, rotating every 6s. It has
  no control row under it (no position text, progress bar, Pause or Next):
  dots inside the card show the position and jump to a creator, a sideways
  swipe moves it, a tap opens the profile, and the card carries the Online and
  price pills plus a round, always-active video call button like the grid
  cards. It holds while touched, hovered, focused or scrolled away, while the
  app is backgrounded or Home is loading, and never rotates by itself for
  reduced motion.
- Never show a host as offline. `hostFrom` in `web/aurora-runtime.js` marks
  every host online and lets members call an offline host (the server rings
  until the call is missed); only an online host's own call settings make
  calls unavailable. New screens must read `h.on`/`h.available`, never the
  raw `online` field.
- The bottom tabs are Home, Chat, Profile and Settings (the chat route remains
  `chats`). Explore is removed; old Explore routes resolve to Home. "See All"
  opens `all-creators`, a paginated detail page with Back and no bottom tabs.
  Profile and Settings are separate screens;
  Settings owns the total coin balance card and Add coins action.
- Shared tab geometry lives in `web/navigation.css`: 58px content bar, 44px
  button targets and zero outer margins. Native `SafeAreaView` owns system
  insets; `data-native-safe-area` prevents a second web bottom inset. Standalone
  browsers add their bottom inset once. Do not add extra height in `flat.css`.
- The Profile tab uses the same `web/public-profile.js` layout and authenticated
  public-profile reads as other users' profiles, with Edit profile, avatar/cover
  upload and own-photo actions. Keep its bottom tabs and owner-only controls;
  public gallery publishing still requires current approved creator access.
- Settings follows the simple reference layout: Back header, compact profile,
  balance card and one compact list of plain icon/title rows, with the Dark Mode
  switch after General. Account, Payments, Privacy & Terms and General open their
  detailed options; Appearance & Theme lives under General. Call availability,
  Match & Speed Pulse and Notifications & Alerts are not settings items (hosts
  go online from Home; notification preferences open from the inbox). Anywhere
  in Settings, including the detail rows, keep only titles, icons and status
  controls: no search box, category chips, theme banners, section headings,
  helper subtitles, divider lines or decorative footer.
- There are no refresh buttons or refresh icons. Screens reload with pull to
  refresh (`web/pull-refresh.js`): register a screen with
  `ZimiPullRefresh.register(view,{refresh,busy})`. The indicator is the
  platform-default round spinner: it follows the finger, spins while `busy()`
  is true (at least briefly, at most 15s) and then shrinks away. Error states
  keep a text Retry/Try again button.
- Automated welcome messages show in chats without an automation label.
- Approved hosts may message any member or another approved host at any time;
  members message approved hosts. Approved hosts may also call any member by
  voice or video at any time (there is no member permission switch), and can
  Follow members back. The member pays the host's rate after answering, with
  no entry fee, on the `incoming` ring screen; blocks still stop calls. See
  `docs/POLICIES.md`.
- Animated gift stickers live in `web/stickers/` (built with
  `scripts/build-gift-sticker.py`) and are matched to catalog gifts by name in
  `web/gift-stickers.js`; the backend catalog seed uses the same names. Gift
  pickers and receipts show the still cover; the animation plays only when a
  gift is sent or received (the cover under reduced motion). Read gift artwork
  through `giftStillUrl`/`giftMotionUrl`, not the raw `mediaUrl`.
- Show the All/Following Home header only on Home. Chat, Profile and
  Settings use their existing page headings and actions. Keep primary tabs
  the same size across those main screens; All Creators, Notifications and Themes
  have their own Back headers and no bottom tabs. Themes opens as a page, not
  a settings modal. Animate only page content on tab changes and
  respect reduced-motion preferences.
- Your Coins uses a compact Wallet summary and a 3-by-2 pack grid so the balance
  and six packages fit a normal phone viewport. Get Coins opens payment-method
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
