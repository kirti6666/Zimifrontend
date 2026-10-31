/* Native boundary and real Kotlin envelope-policy checks. No FCM/device/network use. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');
const plugin = require('../plugins/with-notifications');
const root = path.resolve(__dirname, '..'), owner = '507f1f77bcf86cd799439011', call = '507f1f77bcf86cd799439012';
const plain = value => JSON.parse(JSON.stringify(value));
function wrapper(osName = 'android', available = true) {
  const calls = [], native = { protocol: 'binzo.push.v1', setAccount: async (...args) => calls.push(['account', ...plain(args)]), dismissCall: async id => calls.push(['dismiss', id]) };
  const cache = new Map();
  const load = relative => {
    const filename = path.resolve(root, relative);if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };cache.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const requireMock = name => name === 'react-native' ? { Platform: { OS: osName }, NativeModules: available ? { BinzoNotifications: native } : {} } : load(path.relative(root, path.resolve(path.dirname(filename), name + '.ts')));
    vm.runInNewContext(code, { module, exports: module.exports, require: requireMock, console });return module.exports;
  };
  return { api: load('src/native-push-notifications.ts'), calls };
}
function jar(group, artifact, version) {
  const folder = path.join(process.env.GRADLE_USER_HOME || path.join(os.homedir(), '.gradle'), 'caches/modules-2/files-2.1', group, artifact, version);
  assert.ok(fs.existsSync(folder), `Run the Android Gradle build first to cache ${artifact}:${version}`);
  for (const hash of fs.readdirSync(folder)) for (const file of fs.readdirSync(path.join(folder, hash))) if (file.endsWith('.jar')) return path.join(folder, hash, file);
  throw new Error(`Missing cached ${artifact}:${version}`);
}
(async () => {
  const h = wrapper();assert.equal(h.api.pushDeliveryProtocol(), 'binzo.push.v1');
  await h.api.syncPushAccount(owner);assert.equal(h.calls[0][2], false, 'An account-only sync cannot enable unverified category settings');
  await h.api.syncPushAccount(owner, { pushNotifications: true, notificationPreferences: { calls: true, messages: false, earningsAlerts: false } });
  assert.equal(h.calls[1][1], owner);assert.equal(h.calls[1][2], true);assert.equal(h.calls[1][3].messages, false);assert.equal('quietHours' in h.calls[1][3], false);
  await h.api.syncPushAccount(null);assert.equal(h.calls[2][1], null);assert.equal(h.calls[2][2], false);
  await h.api.dismissIncomingCallNotification(call);await h.api.dismissIncomingCallNotification('invalid');assert.deepEqual(h.calls.at(-1), ['dismiss', call]);
  for (const fixture of [wrapper('ios'), wrapper('android', false)]) { assert.equal(fixture.api.pushDeliveryProtocol(), undefined);await fixture.api.syncPushAccount(owner);assert.deepEqual(fixture.calls, []); }
  const manifest = { application: [{ $: {} }] };plugin.configureManifest(manifest);plugin.configureManifest(manifest);
  assert.equal(manifest.application[0].receiver.length, 2);assert.equal(manifest.application[0].receiver[0].$['tools:node'], 'remove');
  const receiver = manifest.application[0].receiver[1];assert.equal(receiver.$['android:exported'], 'false');assert.ok(receiver['intent-filter'][0].action.some(action => action.$['android:name'] === 'expo.modules.notifications.NOTIFICATION_EVENT'));
  assert.equal(manifest['uses-permission'], undefined, 'No fullscreen/foreground service or DND-bypass permission is added');
  const application = plugin.registerPackage('PackageList(this).packages.apply {\n}');assert.equal(plugin.registerPackage(application), application);
  const gradle = plugin.configureGradle('dependencies {}');assert.equal(plugin.configureGradle(gradle), gradle);
  // The direct native foreground path relies on Expo not also presenting these
  // envelopes. An Expo upgrade changing that contract needs deliberate review.
  const expoHandler = fs.readFileSync(path.join(root, 'node_modules/expo-notifications/android/src/main/java/expo/modules/notifications/notifications/handling/NotificationsHandler.kt'), 'utf8');
  assert.match(expoHandler, /if \(content is RemoteNotificationContent && content\.isDataOnly\)\s*\{[^}]*return/s, 'Pinned Expo skips its JS presentation handler for foreground data-only notifications');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'binzo-native-push-'));
  try {
    plugin.writeNativeFiles(root, temp, 'com.example.push');
    const policy = path.join(temp, 'app/src/main/java/com/example/push/BinzoNotificationPolicy.kt');
    const main = path.join(temp, 'PolicyChecks.kt'), classes = path.join(temp, 'classes');
    fs.writeFileSync(main, `package com.example.push
fun main() {
 val now = 1_800_000_000_000L
 val owner = "${owner}"
 val call = "${call}"
 val expires = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }.format(java.util.Date(now + 30_000))
 val data = mapOf("protocol" to "binzo.push.v1", "action" to "notify", "recipientId" to owner, "category" to "calls", "targetType" to "call", "targetId" to call, "expiresAt" to expires)
 fun valid(change: Map<String,String> = emptyMap(), account: String? = owner, enabled: Boolean = true, allowed: Set<String> = setOf("calls", "messages")) = BinzoNotificationPolicy.validate(data + change, account, enabled, allowed, now)
 check(valid()?.incoming == true)
 check(valid(account = null) == null)
 check(valid(account = call) == null)
 check(valid(enabled = false) == null)
 check(valid(allowed = emptySet()) == null)
 for (change in listOf(mapOf("protocol" to "bad"), mapOf("targetId" to "invalid"), mapOf("category" to "admin"), mapOf("expiresAt" to "bad"), mapOf("expiresAt" to "1970-01-01T00:00:00.000Z"), mapOf("expiresAt" to "2099-01-01T00:00:00.000Z"))) check(valid(change) == null)
 check(BinzoNotificationPolicy.validate(data - "expiresAt", owner, true, setOf("calls"), now) == null)
 val message = data + mapOf("category" to "messages", "targetType" to "thread")
 check(BinzoNotificationPolicy.validate(message, owner, true, setOf("messages"), now)?.incoming == false)
 check(BinzoNotificationPolicy.validate(message, owner, true, setOf("calls"), now) == null)
 val announcement = data + mapOf("category" to "announcements", "targetType" to "inbox")
 check(BinzoNotificationPolicy.validate(announcement, owner, true, emptySet(), now) != null)
 check(BinzoNotificationPolicy.validate(announcement, owner, false, setOf("announcements"), now) == null)
 check(BinzoNotificationPolicy.validate(announcement, call, true, emptySet(), now) == null)
 val ended = data + mapOf("action" to "call-ended", "expiresAt" to "1970-01-01T00:00:00.000Z")
 check(BinzoNotificationPolicy.validate(ended, owner, false, emptySet(), now)?.ended == true)
 check(BinzoNotificationPolicy.validate(ended, call, true, setOf("calls"), now) == null)
 check(BinzoNotificationPolicy.expiry("2026-02-30T12:00:00.000Z") == null)
 println("PASS actual Kotlin policy: recipient, category/master prefs, mandatory call expiry, malformed/stale targets, messages, announcements and terminal controls")
}`);
    const stdlib = jar('org.jetbrains.kotlin', 'kotlin-stdlib', '2.1.20');
    const compiler = [jar('org.jetbrains.kotlin', 'kotlin-compiler-embeddable', '2.1.20'), stdlib, jar('org.jetbrains.kotlin', 'kotlin-script-runtime', '2.1.20'), jar('org.jetbrains.kotlin', 'kotlin-reflect', '1.6.10'), jar('org.jetbrains.kotlin', 'kotlin-daemon-embeddable', '2.1.20'), jar('org.jetbrains.intellij.deps', 'trove4j', '1.0.20200330'), jar('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm', '1.8.0'), jar('org.jetbrains', 'annotations', '13.0')];
    const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
    const compile = spawnSync(java, ['-cp', compiler.join(path.delimiter), 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-no-stdlib', '-no-reflect', '-classpath', stdlib, '-d', classes, policy, main], { encoding: 'utf8' });
    assert.equal(compile.status, 0, compile.stdout + compile.stderr);
    const run = spawnSync(java, ['-cp', [classes, stdlib].join(path.delimiter), 'com.example.push.PolicyChecksKt'], { encoding: 'utf8' });assert.equal(run.status, 0, run.stdout + run.stderr);process.stdout.write(run.stdout);
    console.log('PASS native push wrapper/plugin: capability negotiation, disabled-until-settings ownership, category sync, safe dismissal, idempotent receiver/package wiring and no new intrusive permissions');
  } finally { assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep));fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error);process.exitCode = 1; });
