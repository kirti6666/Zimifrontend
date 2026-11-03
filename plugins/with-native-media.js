const { withAndroidManifest, withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

// Native calls: react-native-webrtc + Facebetter 2.2.1 (modules/binzo-media), set up
// like facebetter-expo/plugins/withFacebetterAndroid.js. Facebetter ships arm ABIs
// only, so release APKs are ARM-only (also keeps WebRTC's 12 MB per-ABI library
// out of x86 slices). Debug keeps x86 so the emulator still runs the app; there
// beauty reports unsupported and calls send the plain camera.
const ARM_ABIS = '"armeabi-v7a", "arm64-v8a"';
const PROJECTION_SERVICE = 'com.oney.WebRTCModule.MediaProjectionService';

function withBuildGradle(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') return mod;
    let contents = mod.modResults.contents;
    // Hash long generated C++ object paths on Windows checkouts.
    if (!contents.includes('CMAKE_OBJECT_PATH_MAX')) {
      contents = contents.replace(/defaultConfig\s*\{/, `defaultConfig {
        externalNativeBuild {
            cmake {
                arguments "-DCMAKE_OBJECT_PATH_MAX=240"
            }
        }`);
    }
    if (!contents.includes('abiFilters')) {
      const buildTypes = contents.search(/buildTypes\s*\{/);
      const release = buildTypes < 0 ? -1 : contents.slice(buildTypes).search(/release\s*\{/);
      if (release < 0) throw new Error('Native media could not find the release build type.');
      const at = buildTypes + release;
      const opening = contents.indexOf('{', at) + 1;
      contents = `${contents.slice(0, opening)}
            ndk {
                abiFilters ${ARM_ABIS}
            }${contents.slice(opening)}`;
    }
    mod.modResults.contents = contents;
    return mod;
  });
}

function withPackaging(config) {
  return withGradleProperties(config, (mod) => {
    const key = 'android.packagingOptions.pickFirsts';
    const entry = mod.modResults.find((item) => item.type === 'property' && item.key === key);
    const values = new Set((entry?.value || '').split(',').map((value) => value.trim()).filter(Boolean));
    values.add('**/libc++_shared.so');
    if (entry) entry.value = [...values].join(',');
    else mod.modResults.push({ type: 'property', key, value: [...values].join(',') });
    return mod;
  });
}

// Screen sharing is unused; do not ship a mediaProjection foreground service.
function withoutProjectionService(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest.$['xmlns:tools'] ||= 'http://schemas.android.com/tools';
    const application = manifest.application?.[0];
    if (!application) throw new Error('Native media could not find the Android application.');
    application.service ||= [];
    const service = application.service.find((item) => item.$?.['android:name'] === PROJECTION_SERVICE);
    if (service) service.$['tools:node'] = 'remove';
    else application.service.push({ $: { 'android:name': PROJECTION_SERVICE, 'tools:node': 'remove' } });
    return mod;
  });
}

module.exports = function withNativeMedia(config) {
  return withoutProjectionService(withPackaging(withBuildGradle(config)));
};
