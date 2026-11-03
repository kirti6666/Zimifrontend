/* Shared CI release checks. Credentials are decoded to ignored files and are
   never printed. APK publication remains separate from mandatory app updates. */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const PACKAGE = 'com.aurora.liveapp';
const SIGNER = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c';
const BUILD_TOOLS = '36.0.0';
const ABIS = ['arm64-v8a', 'armeabi-v7a'];

function metadata(root, env = process.env) {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
  const versionName = app.version, versionCode = app.android?.versionCode;
  if (app.android?.package !== PACKAGE || typeof versionName !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(versionName) ||
      !Number.isSafeInteger(versionCode) || versionCode <= 0 || versionCode > 2100000000) throw new Error('app.json must define a valid Android release identity.');
  if (env.GITHUB_REF_TYPE === 'tag' && env.GITHUB_REF_NAME !== `v${versionName}`) throw new Error('The release tag must exactly match v<app.json version>.');
  return { packageName: PACKAGE, versionName, versionCode, artifactName: `BinzoLive-${versionName}-${versionCode}` };
}
function secretBytes(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Set the ${name} Actions secret.`);
  const encoded = value.replace(/\s/g, '');
  if (encoded.length > 2 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error(`${name} must contain valid base64.`);
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length || bytes.toString('base64') !== encoded) throw new Error(`${name} must contain valid base64.`);
  return bytes;
}
function prepareFirebase(root, encoded) {
  const bytes = secretBytes(encoded, 'GOOGLE_SERVICES_JSON_BASE64');
  let firebase;
  try { firebase = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('GOOGLE_SERVICES_JSON_BASE64 must decode to Firebase JSON.'); }
  if (!firebase.project_info?.project_id || !Array.isArray(firebase.client) || !firebase.client.some(client => client.client_info?.android_client_info?.package_name === PACKAGE)) throw new Error('Firebase JSON must include the com.aurora.liveapp Android client.');
  fs.writeFileSync(path.join(root, 'google-services.json'), bytes, { mode: 0o600 });
}
function run(executable, args) {
  const result = spawnSync(executable, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${path.basename(executable)} verification failed.`);
  return result.stdout;
}
function javaTool(name, env = process.env) {
  const file = name + (process.platform === 'win32' ? '.exe' : '');
  return env.JAVA_HOME ? path.join(env.JAVA_HOME, 'bin', file) : file;
}
function restoreKeystore(root, encoded, execute = run, env = process.env) {
  const bytes = secretBytes(encoded, 'ANDROID_KEYSTORE_BASE64');
  if (bytes.length < 200) throw new Error('ANDROID_KEYSTORE_BASE64 does not contain a keystore.');
  const file = path.join(root, 'android/app/debug.keystore');
  if (!fs.existsSync(path.dirname(file))) throw new Error('Run Android prebuild before restoring the signing key.');
  fs.writeFileSync(file, bytes, { mode: 0o600 });
  const output = execute(javaTool('keytool', env), ['-J-Duser.language=en', '-J-Duser.country=US', '-list', '-v', '-keystore', file, '-alias', 'androiddebugkey', '-storepass', 'android']);
  const fingerprint = output.match(/SHA256:\s*([A-Fa-f0-9:]{64,95})/)?.[1]?.replace(/:/g, '').toLowerCase();
  if (fingerprint !== SIGNER) throw new Error('The restored keystore does not match the published BinzoLive signing certificate.');
}
function configureGradle(root) {
  const file = path.join(root, 'android/gradle.properties');
  let source = fs.readFileSync(file, 'utf8');
  // Bound native compiler/JVM concurrency on the GitHub-hosted Ubuntu runner.
  for (const [key, value] of [['org.gradle.workers.max', '2'], ['org.gradle.parallel', 'false'], ['org.gradle.jvmargs', '-Xmx3072m -XX:MaxMetaspaceSize=768m']]) {
    const pattern = new RegExp('^' + key.replaceAll('.', '\\.') + '=.*$', 'm');
    source = pattern.test(source) ? source.replace(pattern, `${key}=${value}`) : source.trimEnd() + `\n${key}=${value}\n`;
  }
  fs.writeFileSync(file, source);
}
function parseBadging(output, expected) {
  const match = output.match(/^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/m);
  if (!match || match[1] !== expected.packageName || Number(match[2]) !== expected.versionCode || match[3] !== expected.versionName) throw new Error('The APK package/version does not match app.json.');
  if (/^application-debuggable(?:\s|$)/m.test(output)) throw new Error('A debuggable APK cannot be released.');
}
function parseSigner(output) {
  const signers = [...output.matchAll(/^Signer #\d+ certificate SHA-256 digest:\s*([a-fA-F0-9]{64})\s*$/gm)].map(match => match[1].toLowerCase());
  if (signers.length !== 1 || signers[0] !== SIGNER) throw new Error('The signed APK must use the existing BinzoLive certificate.');
  return signers[0];
}
function updaterCapable(xmltree) {
  const lines = xmltree.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    if (!/^\s*E: meta-data(?:\s|$)/.test(lines[index])) continue;
    const indent = lines[index].search(/\S/), attributes = [];
    for (let next = index + 1; next < lines.length; next++) {
      if (/^\s*E:/.test(lines[next]) && lines[next].search(/\S/) <= indent) break;
      attributes.push(lines[next]);
    }
    if (attributes.some(line => /:name\([^)]*\)="com\.binzolive\.UPDATE_CAPABLE"/.test(line)) &&
        attributes.some(line => /:value\([^)]*\)=(?:1(?:\s|$)|0x0*1(?:\s|$)|\(type 0x10\)0x0*1(?:\s|$)|"1")/.test(line))) return true;
  }
  return false;
}
// Read the ZIP central directory only. No archive contents are extracted or
// executed; oversized/ZIP64/multidisk files are not valid app update artifacts.
function zipEntries(bytes) {
  if (bytes.length < 22 || bytes.length > 250 * 1024 * 1024) throw new Error('APK size is outside the supported update limit.');
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
    if (bytes.readUInt32LE(at) === 0x06054b50 && at + 22 + bytes.readUInt16LE(at + 20) === bytes.length) { end = at; break; }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) throw new Error('Invalid APK ZIP directory.');
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12), start = bytes.readUInt32LE(end + 16);
  if (count === 65535 || count !== bytes.readUInt16LE(end + 8) || start + size !== end) throw new Error('Invalid APK ZIP directory.');
  const entries = []; let at = start;
  while (at < end) {
    if (at + 46 > end || bytes.readUInt32LE(at) !== 0x02014b50) throw new Error('Invalid APK ZIP entry.');
    const length = bytes.readUInt16LE(at + 28), extra = bytes.readUInt16LE(at + 30), comment = bytes.readUInt16LE(at + 32);
    if (at + 46 + length + extra + comment > end) throw new Error('Invalid APK ZIP entry.');
    entries.push(bytes.toString('utf8', at + 46, at + 46 + length));
    at += 46 + length + extra + comment;
  }
  if (entries.length !== count || new Set(entries).size !== count) throw new Error('Invalid or duplicate APK ZIP entries.');
  return entries;
}
function checkNativeLibraries(entries) {
  const libraries = entries.filter(entry => /^lib\/[^/]+\/[^/]+\.so$/.test(entry));
  if (!libraries.length || libraries.some(entry => !ABIS.includes(entry.split('/')[1]))) throw new Error('Release APKs must contain ARM ABIs only.');
  for (const abi of ABIS) for (const library of ['libfacebetter.so', 'libjingle_peerconnection_so.so']) {
    if (!entries.includes(`lib/${abi}/${library}`)) throw new Error(`Release APK is missing ${abi}/${library}.`);
  }
}
function validateApk(root, file, execute = run, env = process.env) {
  const expected = metadata(root, env), sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
  if (!sdk) throw new Error('ANDROID_HOME is required to validate the APK.');
  const tools = path.join(sdk, 'build-tools', BUILD_TOOLS), aapt = path.join(tools, 'aapt2' + (process.platform === 'win32' ? '.exe' : ''));
  parseBadging(execute(aapt, ['dump', 'badging', file]), expected);
  const signerSha256 = parseSigner(execute(javaTool('java', env), ['-jar', path.join(tools, 'lib/apksigner.jar'), 'verify', '--verbose', '--print-certs', file]));
  if (!updaterCapable(execute(aapt, ['dump', 'xmltree', file, '--file', 'AndroidManifest.xml']))) throw new Error('The APK is missing the native update capability.');
  const bytes = fs.readFileSync(file), entries = zipEntries(bytes); checkNativeLibraries(entries);
  if (!entries.includes('assets/index.android.bundle')) throw new Error('The release APK must include its production JavaScript bundle.');
  const output = path.join(root, 'release'); fs.mkdirSync(output, { recursive: true });
  const fileName = `BinzoLive-${expected.versionName}.apk`, sha256 = createHash('sha256').update(bytes).digest('hex');
  const sourceCommit = /^[a-f0-9]{40}$/i.test(env.GITHUB_SHA || '') ? env.GITHUB_SHA.toLowerCase() : null;
  const manifest = { packageName: expected.packageName, versionName: expected.versionName, versionCode: expected.versionCode, fileName, sizeBytes: bytes.length, sha256, signerSha256, updateCapable: true, debuggable: false, abis: ABIS, sourceCommit };
  fs.copyFileSync(file, path.join(output, fileName));
  fs.writeFileSync(path.join(output, `BinzoLive-${expected.versionName}.json`), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'SHA256SUMS'), `${sha256}  ${fileName}\n`);
  return manifest;
}
function cleanup(root) {
  for (const relative of ['google-services.json', 'android/app/debug.keystore']) {
    try { fs.unlinkSync(path.join(root, relative)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
module.exports = { PACKAGE, SIGNER, metadata, secretBytes, prepareFirebase, restoreKeystore, configureGradle, parseBadging, parseSigner, updaterCapable, zipEntries, checkNativeLibraries, validateApk, cleanup };

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  try {
    switch (process.argv[2]) {
      case 'metadata': {
        const value = metadata(root);
        if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${value.versionName}\nversion_code=${value.versionCode}\nartifact_name=${value.artifactName}\n`);
        console.log(JSON.stringify(value)); break;
      }
      case 'firebase': prepareFirebase(root, process.env.GOOGLE_SERVICES_JSON_BASE64); break;
      case 'keystore': restoreKeystore(root, process.env.ANDROID_KEYSTORE_BASE64); break;
      case 'gradle': configureGradle(root); break;
      case 'validate': console.log(JSON.stringify(validateApk(root, path.resolve(process.argv[3] || path.join(root, 'android/app/build/outputs/apk/release/app-release.apk'))), null, 2)); break;
      case 'cleanup': cleanup(root); break;
      default: throw new Error('Use metadata, firebase, keystore, gradle, validate or cleanup.');
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
