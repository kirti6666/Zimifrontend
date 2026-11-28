import { requireOptionalNativeModule } from "expo";
import { Linking } from "react-native";
import type { UpiApp, UpiAppsInstalled, UpiPlatform } from "./api/types";

const UPI_APPS = {
  phonepe: { packageName: "com.phonepe.app", appStoreId: "1170055821", iosSchemes: ["phonepe"] },
  gpay: { packageName: "com.google.android.apps.nbu.paisa.user", appStoreId: "1193357041", iosSchemes: ["gpay", "tez"] },
  paytm: { packageName: "net.one97.paytm", appStoreId: "473941634", iosSchemes: ["paytmmp"] },
} satisfies Record<UpiApp, { packageName: string; appStoreId: string; iosSchemes: string[] }>;

export async function installedUpiApps(platform: UpiPlatform): Promise<UpiAppsInstalled> {
  const apps: UpiAppsInstalled = {};
  const names = Object.keys(UPI_APPS) as UpiApp[];
  if (platform === "android") {
    try {
      const native = requireOptionalNativeModule<{ installedApps(): Promise<UpiAppsInstalled> }>("BinzoUpi");
      const result = await native?.installedApps();
      for (const name of names) if (typeof result?.[name] === "boolean") apps[name] = result[name];
    } catch { /* An older binary or unavailable package query leaves the state unknown. */ }
    return apps;
  }
  await Promise.all(names.map(async name => {
    const checks = await Promise.allSettled(UPI_APPS[name].iosSchemes.map(async scheme => Linking.canOpenURL(`${scheme}://`)));
    if (checks.some(check => check.status === "fulfilled" && check.value)) apps[name] = true;
    else if (checks.every(check => check.status === "fulfilled" && check.value === false)) apps[name] = false;
  }));
  return apps;
}

export async function openUpiAppStore(platform: UpiPlatform, app: UpiApp): Promise<void> {
  const { packageName, appStoreId } = UPI_APPS[app];
  const listing = platform === "android" ? `play.google.com/store/apps/details?id=${packageName}` : `apps.apple.com/in/app/id${appStoreId}`;
  const nativeUrl = platform === "android" ? `market://details?id=${packageName}` : `itms-apps://${listing}`;
  try { await Linking.openURL(nativeUrl); }
  catch { await Linking.openURL(`https://${listing}`); }
}
