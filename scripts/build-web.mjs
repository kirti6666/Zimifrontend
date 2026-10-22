/* Bundles the web sources in web/ into a single self-contained page, written to
   three places:
     assets/aurora-bundle.js  the app build as a JS module, handed to the WebView
     assets/aurora.html       the same app build, openable directly in a browser
     dist/index.html          the preview build that Vercel serves
   Both builds are the same page; they differ in one flag. The preview fakes the
   other side of every call (pick-ups, incoming callers, gifts, chat replies) so
   the flows can be clicked through. The app build turns that off and waits for
   the server through the React Native shell (see web/bridge.js, src/bridge.ts).
   ZIMI_DEMO=1 keeps the demo in the app build too, for testing on a phone
   before the server exists. Run after editing anything in web/.
   Plain Node so it runs on Windows as well as macOS/Linux. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const brandLogo = "data:image/webp;base64," + readFileSync(join(root, "web/binzolive-logo.webp")).toString("base64");
const brandIcon = "data:image/png;base64," + readFileSync(join(root, "web/binzolive-icon.png")).toString("base64");
const waterSticker =
  "data:image/webp;base64," + readFileSync(join(root, "web/water-flowing.webp")).toString("base64");

const HEAD = `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
<meta name="description" content="A two-sided live streaming experience for hosts and supporters." />
<title>BinzoLive</title>
<link rel="icon" type="image/png" href="${brandIcon}" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<style>
`;

const BODY = `</style>
</head>
<body>
<main class="app">
<div id="top"></div>
<div id="scroll-root" class="lenis-viewport">
<div class="body" id="screen"></div>
</div>
<div class="nav" id="nav"></div>
</main>
<script>
`;

const INIT = `</script>
<script>
/* Smooth scrolling for #scroll-root, matching the previous Lenis setup. */
(function () {
  var wrapper = document.getElementById("scroll-root");
  var content = document.getElementById("screen");
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var lenis = new Lenis({
    wrapper: wrapper,
    content: content,
    eventsTarget: wrapper,
    autoRaf: true,
    duration: reducedMotion ? 0 : 0.9,
    smoothWheel: !reducedMotion,
    syncTouch: false,
    wheelMultiplier: 0.9,
  });
  window.zimiScrollTo = function (top) { lenis.resize(); lenis.scrollTo(top, { immediate: true }); };
  new MutationObserver(function () { lenis.resize(); })
    .observe(content, { childList: true, subtree: true });
  document.addEventListener("aurora:navigate", function () {
    lenis.scrollTo(0, { immediate: true });
  });
})();
</script>
<!-- Loaded as a classic script so its inline onclick handlers keep resolving globals. -->
<script>
`;

const TAIL = `</script>
</body>
</html>
`;

const page = (demo) =>
  HEAD +
  read("web/vendor/lenis.css") +
  read("web/aurora.css") +
  read("web/app.css") +
  read("web/onboarding.css") +
  read("web/home.css") +
  read("web/chats.css") +
  read("web/chat-voice.css") +
  read("web/chat-photo.css") +
  read("web/navigation.css") +
  read("web/profile.css") +
  read("web/themes.css") +
  read("web/icons.css") +
  read("web/live-room.css") +
  read("web/call-setup.css") +
  read("web/verification-call.css") +
  read("web/offline.css") +
  read("web/public-profile.css") +
  read("web/home-dashboard.css") +
  read("web/coins.css") +
  read("web/notifications.css") +
  read("web/payouts.css") +
  read("web/payment-routes.css") +
  read("web/ads.css") +
  BODY +
  read("web/vendor/lenis.min.js") +
  INIT +
  `window.ZIMI_DEMO = ${demo};\n` +
  `window.ZIMI_APP_VERSION = ${JSON.stringify(JSON.parse(read('app.json')).expo.version)};\n` +
  read("node_modules/qrcode-generator/dist/qrcode.js") +
  read("web/bridge.js") +
  read("web/phone-countries.js") +
  read("web/onboarding.js").replace(/__OB_PORTRAIT_([123])__/g, (_, i) =>
    "data:image/jpeg;base64," + readFileSync(join(root, `web/onboarding-media/portrait-${i}.jpg`)).toString("base64")) +
  read("web/aurora-runtime.js").replace("__WATER_FLOWING_STICKER__", waterSticker).replace("__BRAND_LOGO__", brandLogo) +
  "\n" + read("web/host-access.js") +
  "\n" + read("web/loading.js") +
  "\n" + read("web/home.js") +
  "\n" + read("web/home-dashboard.js") +
  "\n" + read("web/coins.js") +
  "\n" + read("web/media.js") +
  "\n" + read("web/live-room.js") +
  "\n" + read("web/call-setup.js") +
  "\n" + read("web/verification-call.js") +
  "\n" + read("web/chats.js") +
  "\n" + read("web/chat-voice.js") +
  "\n" + read("web/chat-photo.js") +
  "\n" + read("web/profile.js") +
  "\n" + read("web/themes.js") +
  "\n" + read("web/notifications.js") +
  "\n" + read("web/navigation.js") +
  "\n" + read("web/icons.js") +
  "\n" + read("web/offline.js") +
  "\n" + read("web/public-profile.js") +
  "\n" + read("web/payouts.js") +
  "\n" + read("web/payment-routes.js") +
  "\n" + read("web/ads.js") +
  "\nr();\nNative.send('ready',{demo:DEMO});\n" +
  TAIL;

const appDemo = process.env.ZIMI_DEMO === "1";
const app = page(appDemo);
const preview = page(true);

mkdirSync(join(root, "assets"), { recursive: true });
writeFileSync(join(root, "assets/aurora.html"), app);
writeFileSync(
  join(root, "assets/aurora-bundle.js"),
  "/* Generated by scripts/build-web.mjs from web/ - do not edit by hand. */\n" +
    "export default " + JSON.stringify(app) + ";\n"
);

/* The deployed site is the preview build, under the name a host serves by default. */
mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist/index.html"), preview);

/* The admin console is a separate, desktop-only page. It is never part of the
   phone app bundle. For previews it is also served at /admin on this site;
   production builds of the public site set INCLUDE_ADMIN=0 and deploy the
   console on its own domain with scripts/build-admin.mjs (see docs/ADMIN.md). */
const withAdmin = process.env.INCLUDE_ADMIN !== "0";
if (withAdmin) {
  mkdirSync(join(root, "dist/admin"), { recursive: true });
  writeFileSync(join(root, "dist/admin/index.html"), read("web/admin.html"));
}

console.log(
  `built the app bundle (demo ${appDemo ? "on" : "off"}) and the dist/ preview${withAdmin ? " (+ dist/admin)" : ""}`
);
