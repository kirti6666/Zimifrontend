import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const WEB_ICON_HEAD = `<link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="shortcut icon" href="/favicon.ico" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<meta name="apple-mobile-web-app-title" content="BinzoLive" />
<link rel="manifest" href="/site.webmanifest" />`;

const faviconFiles = [
  "favicon-96x96.png",
  "favicon.svg",
  "favicon.ico",
  "apple-touch-icon.png",
  "site.webmanifest",
  "web-app-manifest-192x192.png",
  "web-app-manifest-512x512.png",
];

export function copyWebBranding(root, out) {
  mkdirSync(out, { recursive: true });
  for (const file of faviconFiles) {
    copyFileSync(join(root, "web/favicon", file), join(out, file));
  }
  copyFileSync(join(root, "web/binzolive-icon.png"), join(out, "app_icon.png"));
}
