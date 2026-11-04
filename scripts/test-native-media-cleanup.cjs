/* Execute the actual Kotlin cleanup methods against fault-injected resources.
 * This JVM probe needs the Kotlin compiler populated by an Android Gradle build.
 * It does not simulate a GPU or replace physical-device suspend/call testing. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const relative = 'modules/binzo-media/android/src/main/java/expo/modules/binzomedia/BeautySession.kt';
const source = fs.readFileSync(path.join(root, relative), 'utf8');
const cache = path.join(process.env.GRADLE_USER_HOME || path.join(os.homedir(), '.gradle'), 'caches/modules-2/files-2.1');
function jar(group, name, version) {
  const directory = path.join(cache, group, name, version);
  for (const hash of fs.readdirSync(directory)) {
    const found = fs.readdirSync(path.join(directory, hash)).find(file => file === `${name}-${version}.jar`);
    if (found) return path.join(directory, hash, found);
  }
  throw new Error(`Build Android first; cached ${name} ${version} is required.`);
}
const version = '2.3.20';
const stdlib = jar('org.jetbrains.kotlin', 'kotlin-stdlib', version);
const annotations = jar('org.jetbrains', 'annotations', '13.0');
const compiler = [
  jar('org.jetbrains.kotlin', 'kotlin-compiler-embeddable', version), stdlib,
  jar('org.jetbrains.kotlin', 'kotlin-script-runtime', version),
  jar('org.jetbrains.kotlin', 'kotlin-reflect', '1.6.10'),
  jar('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm', '1.8.0'), annotations,
].join(path.delimiter);
function method(text, name) {
  const match = new RegExp(`(?:private )?fun ${name}\\(`).exec(text);
  if (!match) return '';
  const open = text.indexOf('{', match.index);
  let depth = 1, end = open + 1;
  for (; depth && end < text.length; end++) {
    if (text[end] === '{') depth++;
    if (text[end] === '}') depth--;
  }
  assert.equal(depth, 0, `Complete Kotlin body for ${name}`);
  return text.slice(match.index, end);
}
function fixture(text) {
  return `
object EGL14 { const val EGL_NO_CONTEXT = 0 }
object Looper { fun myLooper() = 1 }
object Log { fun w(tag: String, message: String) {} }
object EngineEventCode {
  const val LICENSE_VALIDATION_SUCCESS = 1; const val INITIALIZATION_COMPLETE = 2
  const val LICENSE_VALIDATION_FAILED = 3; const val INITIALIZATION_FAILED = 4
}
class Probe {
  companion object { const val TAG = "probe" }
  val releasedResources = ArrayList<String>()
  val status = ArrayList<String>()
  var lost = false
  var released = false
  var glContext = 1
  var quit = false
  var destroyed = false
  var refusedToken: String? = null
  var engineToken: String? = "token"
  class Handler { val looper = 1 }
  val handler = Handler()
  inner class Thread { fun quitSafely() { quit = true } }
  val glThread = Thread()
  inner class Resource(val name: String, var fail: Boolean = false) {
    fun release() { releasedResources.add(name); check(!fail) { "injected cleanup failure" } }
  }
  inner class Output(val buffer: Resource, var inUse: Boolean = false, var retired: Boolean = false)
  var engine: Resource? = Resource("engine")
  var input: Resource? = Resource("input")
  var drawer: Resource? = Resource("drawer")
  var frameDrawer: Resource? = Resource("frameDrawer")
  var yuvConverter: Resource? = Resource("yuvConverter")
  val outputs = arrayListOf(Output(Resource("output")))
  private fun makeCurrent() { check(!lost) { "injected EGL context loss" } }
  private fun destroyGl() { destroyed = true; glContext = EGL14.EGL_NO_CONTEXT }
  private fun publish(value: String) { status.add(value) }
  fun returnOutput() { recycle(outputs.first()) }
  fun rejectLicense() { onEngineEvent(EngineEventCode.LICENSE_VALIDATION_FAILED, "token") }
  ${['release', 'finishRelease', 'releaseGlResource', 'recycle', 'onEngineEvent'].map(name => method(text, name)).join('\n')}
}
fun main() {
  val lost = Probe().apply { this.lost = true }
  lost.release()
  check(lost.released && lost.destroyed && lost.quit)
  check(lost.input == null && lost.outputs.isEmpty())
  val broken = Probe().apply { input!!.fail = true; drawer!!.fail = true }
  broken.release()
  check(broken.destroyed && broken.quit)
  check(broken.releasedResources.containsAll(listOf("input", "output", "drawer", "frameDrawer", "yuvConverter")))
  val retained = Probe().apply { outputs.first().inUse = true }
  retained.release()
  check(!retained.quit && retained.outputs.size == 1)
  retained.returnOutput()
  check(retained.quit && retained.destroyed && retained.outputs.isEmpty())
  val before = retained.releasedResources.size
  retained.release()
  check(retained.releasedResources.size == before)
  val rejected = Probe().apply { engine!!.fail = true }
  rejected.rejectLicense()
  check(rejected.engine == null && rejected.engineToken == null)
  check(rejected.status == listOf("authFailed"))
  println("PASS: lost EGL, independent cleanup faults, retained outputs, repeated release, SDK rejection")
}
`;
}
const temporaryRoot = fs.realpathSync(os.tmpdir());
const temporary = fs.mkdtempSync(path.join(temporaryRoot, 'binzo-native-cleanup-'));
function run(text, label) {
  const sourceFile = path.join(temporary, `${label}.kt`), output = path.join(temporary, label);
  fs.writeFileSync(sourceFile, fixture(text));
  const compiled = spawnSync('java', ['-cp', compiler, 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-no-stdlib', '-no-reflect', '-classpath', [stdlib, annotations].join(path.delimiter), sourceFile, '-d', output], { encoding: 'utf8', timeout: 60000 });
  assert.equal(compiled.status, 0, compiled.stderr || compiled.error?.message);
  return spawnSync('java', ['-cp', [output, stdlib].join(path.delimiter), `${label}Kt`], { encoding: 'utf8', timeout: 10000 });
}
try {
  if (process.argv.includes('--compare-head')) {
    const before = spawnSync('git', ['show', `HEAD:${relative}`], { cwd: root, encoding: 'utf8' });
    assert.equal(before.status, 0, before.stderr);
    const previous = run(before.stdout, 'Before');
    assert.notEqual(previous.status, 0, 'Regression must fail against the original cleanup');
    assert.match(previous.stderr, /injected EGL context loss/);
    console.log('Confirmed original code throws on EGL context loss.');
  }
  const result = run(source, 'Current');
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  process.stdout.write(result.stdout);
} finally {
  const resolved = fs.realpathSync(temporary);
  assert.equal(path.dirname(resolved), temporaryRoot);
  assert.ok(path.basename(resolved).startsWith('binzo-native-cleanup-'));
  fs.rmSync(resolved, { recursive: true, force: true });
}
