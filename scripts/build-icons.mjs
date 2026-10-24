/* Derive the native launcher assets from the supplied app_icon.png using Expo's
   image tooling. Commit the generated assets so native builds need no extra step. */
import { copyFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import imageUtils from "@expo/image-utils";

const { generateImageAsync, generateImageBackgroundAsync, compositeImagesAsync } = imageUtils;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const brand = join(root, "assets/brand");
const src = join(brand, "app_icon.png");
const size = 1024;
const backgroundColor = "#210F1D";
const generate = async (width, backgroundColor) => (await generateImageAsync(
  { projectRoot: root, cacheType: "binzolive-launcher" },
  { src, width, height: width, resizeMode: "contain", backgroundColor },
)).source;

// iOS and legacy Android icons use an opaque square.
const background = await generateImageBackgroundAsync({
  width: size, height: size, resizeMode: "contain", backgroundColor,
});
const icon = await compositeImagesAsync({ foreground: await generate(size, "transparent"), background });
writeFileSync(join(brand, "icon.png"), icon);

// Keep the artwork inside Android's central 66/108 adaptive-icon safe zone.
const foregroundSize = Math.floor(size * 66 / 108);
const inset = Math.floor((size - foregroundSize) / 2);
const transparent = await generateImageBackgroundAsync({
  width: size, height: size, resizeMode: "contain", backgroundColor: "transparent",
});
const foreground = await compositeImagesAsync({
  foreground: await generate(foregroundSize, "transparent"),
  background: transparent, x: inset, y: inset,
});
writeFileSync(join(brand, "adaptive-icon.png"), foreground);
writeFileSync(join(brand, "adaptive-icon-background.png"), background);
copyFileSync(src, join(root, "web/binzolive-icon.png"));
console.log("built native launcher icons and refreshed the web app icon");
