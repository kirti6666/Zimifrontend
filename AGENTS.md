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
- `web/admin.html` — the desktop-only admin console. Self-contained; never part
  of the phone app. `npm run build:web` also copies it to `dist/admin/` for
  previews (skip with `INCLUDE_ADMIN=0`); `npm run build:admin` builds the
  production copy into `admin-site/dist/`. See `docs/ADMIN.md`.
- `assets/aurora.html` and `assets/aurora-bundle.js` — **generated** app build
  (demo off); `dist/index.html` is the preview build (demo on). Never edit
  them; edit `web/` and run `npm run build:web`.

## Rules that matter

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
