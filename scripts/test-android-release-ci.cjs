const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const vm = require('node:vm');
const ci = require('../ci/android-release.cjs');

const identity = { packageName: ci.PACKAGE, versionName: '1.1.12', versionCode: 22 };
const badging = (extra = '') => `package: name='${identity.packageName}' versionCode='22' versionName='1.1.12'\n${extra}`;
const signature = `Verified\nSigner #1 certificate SHA-256 digest: ${ci.SIGNER}\n`;
const updater = [
  'E: manifest', '  E: application', '    E: meta-data',
  '      A: http://schemas.android.com/apk/res/android:name(0x01010003)="com.binzolive.UPDATE_CAPABLE"',
  '      A: http://schemas.android.com/apk/res/android:value(0x01010024)=1',
].join('\n');
const libraries = ['arm64-v8a', 'armeabi-v7a'].flatMap(abi => ['libfacebetter.so', 'libjingle_peerconnection_so.so'].map(name => `lib/${abi}/${name}`));
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'binzo-android-ci-'));
  assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'binzo-android-ci-'));
  fs.writeFileSync(path.join(root, 'app.json'), JSON.stringify({ expo: { version: identity.versionName, android: { package: ci.PACKAGE, versionCode: identity.versionCode } } }));
  fs.mkdirSync(path.join(root, 'android/app'), { recursive: true });
  t.after(() => {
    // Delete only this test's resolved, uniquely-created temporary directory.
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'binzo-android-ci-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}
function zip(entries) {
  const locals = [], directory = []; let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry), local = Buffer.alloc(30 + name.length), central = Buffer.alloc(46 + name.length);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(name.length, 26); name.copy(local, 30);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42); name.copy(central, 46);
    locals.push(local); directory.push(central); offset += local.length;
  }
  const table = Buffer.concat(directory), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(table.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, table, end]);
}

test('release identity is committed and a tag must match it exactly', t => {
  const root = fixture(t);
  assert.equal(ci.metadata(root, { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v1.1.12' }).versionCode, 22);
  assert.throws(() => ci.metadata(root, { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v1.1.13' }), /exactly match/);
  fs.writeFileSync(path.join(root, 'app.json'), JSON.stringify({ expo: { version: '1.1.12\ncommand', android: { package: ci.PACKAGE, versionCode: 22 } } }));
  assert.throws(() => ci.metadata(root, {}), /valid Android release identity/);
});

test('Firebase provisioning decodes only a matching Android client', t => {
  const root = fixture(t), file = path.join(root, 'google-services.json');
  const firebase = { project_info: { project_id: 'fixture-only' }, client: [{ client_info: { android_client_info: { package_name: ci.PACKAGE } } }] };
  const bytes = Buffer.from(JSON.stringify(firebase));
  ci.prepareFirebase(root, bytes.toString('base64'));
  assert.deepEqual(fs.readFileSync(file), bytes);
  assert.throws(() => ci.prepareFirebase(root, Buffer.from(JSON.stringify({ ...firebase, client: [] })).toString('base64')), /must include/);
  for (const encoded of ['', 'invalid!', 'YR==']) assert.throws(() => ci.secretBytes(encoded, 'FIXTURE_SECRET'));
  assert.equal(ci.secretBytes(' YQ==\n', 'FIXTURE_SECRET').toString(), 'a');
});

test('keystore restoration verifies the original certificate before allowing a build', t => {
  const root = fixture(t), bytes = Buffer.alloc(512, 7), calls = [];
  ci.restoreKeystore(root, bytes.toString('base64'), (tool, args) => { calls.push({ tool, args }); return `SHA256: ${ci.SIGNER.toUpperCase().match(/../g).join(':')}\n`; }, {});
  assert.deepEqual(fs.readFileSync(path.join(root, 'android/app/debug.keystore')), bytes);
  assert.ok(calls[0].args.includes('androiddebugkey'));
  assert.throws(() => ci.restoreKeystore(root, bytes.toString('base64'), () => `SHA256: ${'ab'.repeat(32)}\n`, {}), /does not match/);
  ci.cleanup(root);
  assert.equal(fs.existsSync(path.join(root, 'android/app/debug.keystore')), false);
});

test('CI Gradle tuning is bounded and idempotent without changing other properties', t => {
  const root = fixture(t), file = path.join(root, 'android/gradle.properties');
  fs.writeFileSync(file, 'org.gradle.parallel=true\norg.gradle.jvmargs=-Xmx2048m\nhermesEnabled=true\n');
  ci.configureGradle(root); const once = fs.readFileSync(file, 'utf8'); ci.configureGradle(root);
  assert.equal(fs.readFileSync(file, 'utf8'), once);
  assert.match(once, /^org\.gradle\.workers\.max=2$/m);
  assert.match(once, /^org\.gradle\.parallel=false$/m);
  assert.match(once, /^hermesEnabled=true$/m);
});

test('APK policy rejects debug, wrong-version, wrong-signer and missing updater artifacts', () => {
  ci.parseBadging(badging(), identity); assert.equal(ci.parseSigner(signature), ci.SIGNER); assert.equal(ci.updaterCapable(updater), true);
  assert.throws(() => ci.parseBadging(badging('application-debuggable\n'), identity), /debuggable/);
  assert.throws(() => ci.parseBadging(badging().replace("versionCode='22'", "versionCode='21'"), identity), /does not match/);
  assert.throws(() => ci.parseSigner(signature.replace(ci.SIGNER, 'ab'.repeat(32))), /existing BinzoLive certificate/);
  assert.throws(() => ci.parseSigner(signature + `Signer #2 certificate SHA-256 digest: ${ci.SIGNER}\n`), /existing BinzoLive certificate/);
  assert.equal(ci.updaterCapable(updater.replace('CAPABLE', 'UNRELATED')), false);
  assert.equal(ci.updaterCapable(updater.replace(')=1', ')=0') + '\n    E: meta-data\n      A: android:value(0x01010024)=1'), false, 'An unrelated metadata value cannot enable the updater');
});

test('APK directory checks require both ARM native pipelines and reject x86 slices', () => {
  const entries = [...libraries, 'assets/index.android.bundle'];
  assert.deepEqual(ci.zipEntries(zip(entries)), entries); ci.checkNativeLibraries(entries);
  assert.throws(() => ci.checkNativeLibraries(entries.filter(name => !name.includes('arm64-v8a/libfacebetter'))), /missing/);
  assert.throws(() => ci.checkNativeLibraries([...entries, 'lib/x86_64/libjingle_peerconnection_so.so']), /ARM ABIs only/);
  assert.throws(() => ci.zipEntries(zip(['duplicate', 'duplicate'])), /duplicate/);
  const corrupt = zip(entries); corrupt.writeUInt32LE(0, corrupt.length - 22); assert.throws(() => ci.zipEntries(corrupt), /Invalid APK ZIP/);
});

test('the complete verifier stages only the verified APK with matching checksums and manifest', t => {
  const root = fixture(t), file = path.join(root, 'candidate.apk'), bytes = zip([...libraries, 'assets/index.android.bundle']);
  fs.writeFileSync(file, bytes);
  const calls = [], execute = (tool, args) => {
    calls.push({ tool, args });
    if (args.includes('badging')) return badging();
    if (args.includes('xmltree')) return updater;
    if (args.includes('verify')) return signature;
    throw new Error('Unexpected verifier command');
  };
  const result = ci.validateApk(root, file, execute, { ANDROID_HOME: '/fixture-sdk', GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v1.1.12', GITHUB_SHA: 'a'.repeat(40) });
  const digest = createHash('sha256').update(bytes).digest('hex');
  assert.equal(result.sha256, digest); assert.equal(result.versionCode, 22); assert.equal(result.debuggable, false);
  assert.deepEqual(fs.readFileSync(path.join(root, 'release/BinzoLive-1.1.12.apk')), bytes);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'release/BinzoLive-1.1.12.json'), 'utf8')), result);
  assert.equal(fs.readFileSync(path.join(root, 'release/SHA256SUMS'), 'utf8'), `${digest}  BinzoLive-1.1.12.apk\n`);
  assert.equal(calls.filter(call => call.args.includes('verify')).length, 1);
  fs.rmSync(path.join(root, 'release'), { recursive: true });
  assert.throws(() => ci.validateApk(root, file, (_tool, args) => args.includes('badging') ? badging('application-debuggable\n') : signature, { ANDROID_HOME: '/fixture-sdk' }), /debuggable/);
  assert.equal(fs.existsSync(path.join(root, 'release')), false, 'A failed APK check cannot produce a release artifact');
});

for (const platform of ['linux', 'win32']) test(`the ${platform} release command overrides local architectures and endpoints`, () => {
  const file = path.resolve(__dirname, 'build-release-apk.cjs'), calls = [];
  const processFixture = { platform, env: {
    NODE_ENV: 'development', EXPO_PUBLIC_API_URL: 'http://localhost:5000/api/v1',
    EXPO_PUBLIC_SOCKET_URL: 'http://localhost:5000', ORG_GRADLE_PROJECT_reactNativeArchitectures: 'x86_64',
  } };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    __dirname: path.dirname(file), process: processFixture,
    console: { error: value => { throw new Error(String(value)); } },
    require(id) {
      if (id === 'node:path') return path;
      if (id === 'node:child_process') return { spawnSync: (command, args, options) => { calls.push({ command, args, options }); return { status: 0 }; } };
      throw new Error(`Unexpected release-build dependency: ${id}`);
    },
  }, { filename: file });
  assert.equal(calls.length, 1);
  const call = calls[0], gradleArgs = platform === 'win32' ? call.args.at(-1).split(/\s+/) : Array.from(call.args);
  assert.equal(call.command, platform === 'win32' ? 'cmd.exe' : './gradlew');
  if (platform === 'win32') assert.equal(gradleArgs[0], '.\\gradlew.bat', 'The local wrapper must run even when Windows disables implicit current-directory executable lookup');
  assert.deepEqual(gradleArgs.filter(arg => arg.startsWith('-PreactNativeArchitectures=')), ['-PreactNativeArchitectures=armeabi-v7a,arm64-v8a'], 'The release CLI property must outrank a local x86 Gradle environment property');
  assert.ok(gradleArgs.includes(':app:createBundleReleaseJsAndAssets'));
  assert.ok(gradleArgs.includes(':app:assembleRelease'));
  assert.equal(call.options.cwd, path.resolve(__dirname, '../android'));
  assert.equal(call.options.env.NODE_ENV, 'production');
  assert.equal(call.options.env.EXPO_PUBLIC_API_URL, 'https://api.binzolive.com/api/v1');
  assert.equal(call.options.env.EXPO_PUBLIC_SOCKET_URL, 'https://api.binzolive.com');
  assert.equal(call.options.env.ORG_GRADLE_PROJECT_reactNativeArchitectures, 'x86_64', 'The generic local environment can remain while the release command explicitly chooses ARM');
  assert.equal(processFixture.exitCode, 0);
});
