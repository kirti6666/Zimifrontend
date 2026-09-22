# Working on this app

This is a React Native app (Expo SDK 57). The Aurora interface itself is a
self-contained web bundle rendered in a `react-native-webview`, which is what
keeps it identical to the original Next.js version.

## Where things live

- `App.tsx` / `index.js` — the React Native shell. Keep it thin: WebView,
  safe-area handling, and the `data-theme` bridge to the native status bar.
- `web/` — the actual UI. `aurora-runtime.js` renders every screen by assigning
  HTML strings, styled by `aurora.css`.
- `assets/aurora.html` and `assets/aurora-bundle.js` — **generated**. Never edit
  them; edit `web/` and run `npm run build:web`.

## Rules that matter

- `web/aurora-runtime.js` must stay a top-level classic script. Its inline
  `onclick` handlers resolve globals (`S`, `r`, ...) through the global scope
  chain, so wrapping it in an IIFE or loading it as a module breaks navigation.
- Any change under `web/` needs `npm run build:web`, or the app still renders
  the old bundle.
- `npm run typecheck` covers the RN shell only; the `web/` sources are plain
  browser JS and are not typechecked.
