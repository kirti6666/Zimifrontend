const fs = require('node:fs');
const path = require('node:path');
const { withAndroidManifest, withMainApplication, withDangerousMod, withAppBuildGradle } = require('expo/config-plugins');
function configureGradle(source) {
  if (source.includes('// Binzo notification delegate dependencies')) return source;
  // Match the existing, pinned Expo 57 implementation dependencies; these are
  // required on the app compile classpath when subclassing its public hooks.
  return source + '\n// Binzo notification delegate dependencies\ndependencies {\n    implementation("com.google.firebase:firebase-messaging:25.0.1")\n    implementation("io.github.lukmccall.pika:pika-api:0.3.2")\n}\n';
}
function registerPackage(source) {
  if (source.includes('add(BinzoNotificationsPackage())')) return source;
  const anchor = /PackageList\(this\)\.packages\.apply\s*\{/;
  if (!anchor.test(source)) throw new Error('Native notifications require the Kotlin MainApplication package list.');
  return source.replace(anchor, '$&\n          add(BinzoNotificationsPackage())');
}
function configureManifest(manifest) {
  manifest.$ ||= {};manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
  const app = manifest.application?.[0];if (!app) throw new Error('Native notifications require an Android application.');
  app.receiver ||= [];
  const original = 'expo.modules.notifications.service.NotificationsService';
  if (!app.receiver.some(receiver => receiver.$?.['android:name'] === original)) app.receiver.push({ $: { 'android:name': original, 'tools:node': 'remove' } });
  if (!app.receiver.some(receiver => receiver.$?.['android:name'] === '.BinzoNotificationsService')) app.receiver.push({
    $: { 'android:name': '.BinzoNotificationsService', 'android:enabled': 'true', 'android:exported': 'false' },
    'intent-filter': [{ $: { 'android:priority': '1' }, action: ['expo.modules.notifications.NOTIFICATION_EVENT','android.intent.action.BOOT_COMPLETED','android.intent.action.REBOOT','android.intent.action.QUICKBOOT_POWERON','com.htc.intent.action.QUICKBOOT_POWERON','android.intent.action.MY_PACKAGE_REPLACED'].map(name => ({ $: { 'android:name': name } })) }],
  });return manifest;
}
function writeNativeFiles(projectRoot, androidRoot, packageName) {
  if (!/^[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)+$/.test(packageName)) throw new Error('Native notifications require a valid Android package.');
  const target = path.join(androidRoot, 'app/src/main/java', ...packageName.split('.'));fs.mkdirSync(target, { recursive: true });
  for (const name of ['BinzoNotifications.kt','BinzoNotificationPolicy.kt']) fs.writeFileSync(path.join(target, name), fs.readFileSync(path.join(projectRoot, 'plugins/android', name), 'utf8').replaceAll('__PACKAGE__', packageName));
}
module.exports = config => {
  config = withAndroidManifest(config, mod => { configureManifest(mod.modResults.manifest);return mod; });
  config = withMainApplication(config, mod => { mod.modResults.contents = registerPackage(mod.modResults.contents);return mod; });
  config = withAppBuildGradle(config, mod => { mod.modResults.contents = configureGradle(mod.modResults.contents);return mod; });
  return withDangerousMod(config, ['android', async mod => { writeNativeFiles(mod.modRequest.projectRoot, mod.modRequest.platformProjectRoot, mod.android.package);return mod; }]);
};
Object.assign(module.exports, { registerPackage, configureManifest, configureGradle, writeNativeFiles });
