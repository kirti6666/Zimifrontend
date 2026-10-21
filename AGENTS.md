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

- Keep Home focused on Live hosts and Online hosts with Chat and Call actions.
  Search belongs in the Home header; do not duplicate it inside the feed. Filter
  active hosts on the server before pagination and list each host only once.
- Show the branded Home header only on Home. Explore, Chats, Profile and
  Settings use their existing page headings and actions. Keep primary tabs
  the same size across those main screens; Notifications and the Themes page
  have their own Back headers and no bottom tabs. Themes opens as a page, not
  a settings modal. Animate only page content on tab changes and
  respect reduced-motion preferences.
- Go Live and creator capabilities require current admin-approved host access.
  Use `ZimiHostAccess` in the web UI and enforce approval in the native bridge
  and backend; local role or verification presentation state grants no access.
- Always use layout-shaped skeletons for asynchronous content loading, including
  initial loads, refreshes and pagination. Tie them to actual request state;
  never use artificial loading timers. Keep empty and error states separate,
  label skeletons for accessibility, and respect reduced-motion settings.
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
