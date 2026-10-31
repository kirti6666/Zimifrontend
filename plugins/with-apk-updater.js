const fs = require('node:fs');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod, withMainApplication } = require('expo/config-plugins');

const DEFAULT_STORAGE_HOST = '5919c75fa33b26baaeb71b893051cac1.r2.cloudflarestorage.com';
const pathsXml = '<?xml version="1.0" encoding="utf-8"?>\n<paths xmlns:android="http://schemas.android.com/apk/res/android">\n  <cache-path name="verified_apk_updates" path="apk-updates/verified/" />\n</paths>\n';

function trustedHosts(options = {}) {
  const supplied = options.storageHosts || [DEFAULT_STORAGE_HOST];
  if (!Array.isArray(supplied) || supplied.some(host => typeof host !== 'string' || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) || host.includes('..')))
    throw new Error('APK updater storageHosts must contain exact HTTPS hostnames.');
  return [...new Set(['api.binzolive.com', ...supplied])];
}
function registerPackage(contents) {
  if (contents.includes('add(BinzoApkUpdaterPackage())')) return contents;
  const anchor = /PackageList\(this\)\.packages\.apply\s*\{/;
  if (!anchor.test(contents)) throw new Error('Could not register the APK updater in MainApplication.kt.');
  return contents.replace(anchor, '$&\n          add(BinzoApkUpdaterPackage())');
}
function writeNativeFiles(projectRoot, androidRoot, packageName, hosts) {
  if (!/^[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)+$/.test(packageName)) throw new Error('APK updater needs a valid Android package.');
  const target = path.join(androidRoot, 'app/src/main/java', ...packageName.split('.'));
  const resources = path.join(androidRoot, 'app/src/main/res');
  fs.mkdirSync(target, { recursive: true });
  fs.mkdirSync(path.join(resources, 'xml'), { recursive: true });
  fs.mkdirSync(path.join(resources, 'values'), { recursive: true });
  const template = fs.readFileSync(path.join(projectRoot, 'plugins/android/BinzoApkUpdaterModule.kt'), 'utf8');
  fs.writeFileSync(path.join(target, 'BinzoApkUpdaterModule.kt'), template.replaceAll('__PACKAGE__', packageName));
  fs.writeFileSync(path.join(resources, 'xml/binzolive_apk_paths.xml'), pathsXml);
  fs.writeFileSync(path.join(resources, 'values/binzolive_apk_updater.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <string-array name="binzolive_update_hosts">\n' + hosts.map(host => `    <item>${host}</item>\n`).join('') + '  </string-array>\n</resources>\n');
}
function configureManifest(manifest) {
  const permission = 'android.permission.REQUEST_INSTALL_PACKAGES';
  manifest['uses-permission'] ||= [];
  if (!manifest['uses-permission'].some(item => item.$?.['android:name'] === permission)) manifest['uses-permission'].push({ $: { 'android:name': permission } });
  const application = manifest.application?.[0];
  if (!application) throw new Error('APK updater could not find the Android application.');
  application['meta-data'] ||= [];
  const capability = application['meta-data'].find(item => item.$?.['android:name'] === 'com.binzolive.UPDATE_CAPABLE');
  if (capability) capability.$['android:value'] = '1';
  else application['meta-data'].push({ $: { 'android:name': 'com.binzolive.UPDATE_CAPABLE', 'android:value': '1' } });
  application.provider ||= [];
  const authority = '${applicationId}.apk-updates';
  if (!application.provider.some(item => item.$?.['android:authorities'] === authority)) application.provider.push({
    $: { 'android:name': '.BinzoUpdateFileProvider', 'android:authorities': authority, 'android:exported': 'false', 'android:grantUriPermissions': 'true' },
    'meta-data': [{ $: { 'android:name': 'android.support.FILE_PROVIDER_PATHS', 'android:resource': '@xml/binzolive_apk_paths' } }],
  });
  return manifest;
}
module.exports = function withApkUpdater(config, options = {}) {
  const hosts = trustedHosts(options);
  config = withAndroidManifest(config, mod => { configureManifest(mod.modResults.manifest); return mod; });
  config = withMainApplication(config, mod => {
    if (mod.modResults.language !== 'kt') throw new Error('APK updater registration requires a Kotlin Android application.');
    mod.modResults.contents = registerPackage(mod.modResults.contents); return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    writeNativeFiles(mod.modRequest.projectRoot, mod.modRequest.platformProjectRoot, mod.android.package, hosts);
    return mod;
  }]);
};
module.exports.trustedHosts = trustedHosts;
module.exports.registerPackage = registerPackage;
module.exports.configureManifest = configureManifest;
module.exports.writeNativeFiles = writeNativeFiles;
