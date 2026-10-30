/* Derive the native launcher assets from the supplied app_icon.png using Expo's
   image tooling. Commit the generated assets so native builds need no extra step. */
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import imageUtils from "@expo/image-utils";

const { generateImageAsync, generateImageBackgroundAsync, compositeImagesAsync } = imageUtils;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const brand = join(root, "assets/brand");
const src = join(brand, "app_icon.png");
const size = 1024;
const generate = async width => (await generateImageAsync(
  { projectRoot: root, cacheType: "binzolive-launcher" },
  { src, width, height: width, resizeMode: "cover", backgroundColor: "transparent" },
)).source;

// Keep the supplied artwork's transparency and contours. No colored backplate,
// extra border, shadow or inset is drawn around the legacy icon.
writeFileSync(join(brand, "icon.png"), await generate(size));

// Android displays the central 72dp of its 108dp adaptive layer. Fill that
// complete viewport; the transparent 18dp overscan stays outside it. The former
// 66dp safe-zone inset left an unwanted visible border. Filling all 108dp would
// instead crop the supplied lettering before the launcher applies its mask.
const foregroundSize = Math.round(size * 72 / 108);
const inset = Math.floor((size - foregroundSize) / 2);
const transparent = await generateImageBackgroundAsync({
  width: size, height: size, resizeMode: "contain", backgroundColor: "transparent",
});
const foreground = await compositeImagesAsync({
  foreground: await generate(foregroundSize),
  background: transparent, x: inset, y: inset,
});
writeFileSync(join(brand, "adaptive-icon.png"), foreground);
rmSync(join(brand, "adaptive-icon-background.png"), { force: true });
copyFileSync(src, join(root, "web/binzolive-icon.png"));

// Refresh only launcher resources when a native project already exists. Avoid
// prebuild --clean: it would replace the app's updater and other native setup.
if (existsSync(join(root, "android/app/src/main/AndroidManifest.xml"))) {
  const require = createRequire(import.meta.url);
  const { setIconAsync } = require("@expo/prebuild-config/build/plugins/icons/withAndroidIcons");
  const { AndroidConfig, XML } = require("expo/config-plugins");
  const { expo: config } = JSON.parse(readFileSync(join(root, "app.json"), "utf8"));
  await setIconAsync(root, { icon: config.icon, ...config.android.adaptiveIcon, isAdaptive: true });
  const colorsPath = await AndroidConfig.Colors.getProjectColorsXMLPathAsync(root);
  const colors = await AndroidConfig.Resources.readResourcesXMLAsync({ path: colorsPath });
  await XML.writeXMLAsync({ path: colorsPath, xml: AndroidConfig.Colors.assignColorValue(colors, { name: "iconBackground", value: "#00000000" }) });
}
console.log("built launcher icons from the original artwork without added visible padding or background");
