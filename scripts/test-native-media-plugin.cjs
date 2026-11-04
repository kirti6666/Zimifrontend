const assert = require('node:assert/strict');
const test = require('node:test');
const withNativeMedia = require('../plugins/with-native-media');
const fs = require('node:fs');
const path = require('node:path');

async function transform(name, modResults) {
  const config = withNativeMedia({ name: 'Native media test', slug: 'native-media-test' });
  const result = await config.mods.android[name]({ ...config, modResults, modRequest: {} });
  return result.modResults;
}

test('private-call foreground capture declares the required types and permissions without exporting control', () => {
  const manifest = fs.readFileSync(path.join(__dirname, '../modules/binzo-media/android/src/main/AndroidManifest.xml'), 'utf8');
  for (const permission of ['FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_CAMERA', 'FOREGROUND_SERVICE_MICROPHONE']) {
    assert.match(manifest, new RegExp(`android.permission.${permission}"`));
  }
  assert.match(manifest, /<service[^>]+android:name="\.CallForegroundService"[^>]+android:exported="false"[^>]+android:foregroundServiceType="camera\|microphone"/);
});

test('native release packaging preserves emulator debug builds and is idempotent', async () => {
  const original = {
    language: 'groovy',
    contents: 'android {\n    defaultConfig {\n        minSdkVersion 24\n    }\n    buildTypes {\n        debug {\n            debuggable true\n        }\n        release {\n            minifyEnabled false\n        }\n    }\n}',
  };
  const first = await transform('appBuildGradle', original);
  assert.match(first.contents, /release\s*\{\s*ndk\s*\{\s*abiFilters "armeabi-v7a", "arm64-v8a"/);
  assert.doesNotMatch(first.contents.match(/debug\s*\{[^}]+\}/)[0], /abiFilters/);
  assert.match(first.contents, /CMAKE_OBJECT_PATH_MAX=250/);
  const second = await transform('appBuildGradle', { ...first });
  assert.equal(second.contents, first.contents);
});

test('native C++ packaging merges with existing picks without duplicates', async () => {
  const first = await transform('gradleProperties', [
    { type: 'property', key: 'android.packagingOptions.pickFirsts', value: '**/existing.so' },
  ]);
  const second = await transform('gradleProperties', first);
  assert.equal(second.length, 1);
  assert.equal(second[0].value, '**/existing.so,**/libc++_shared.so');
});

test('unused screen-sharing service is removed even if already declared', async () => {
  for (const existing of [false, true]) {
    const serviceName = 'com.oney.WebRTCModule.MediaProjectionService';
    const manifest = { manifest: { $: {}, application: [{ service: existing ? [{ $: { 'android:name': serviceName } }] : [] }] } };
    await transform('manifest', manifest);
    await transform('manifest', manifest);
    const services = manifest.manifest.application[0].service;
    assert.equal(services.length, 1);
    assert.equal(services[0].$['android:name'], serviceName);
    assert.equal(services[0].$['tools:node'], 'remove');
    assert.equal(manifest.manifest.$['xmlns:tools'], 'http://schemas.android.com/tools');
  }
});
