// Native edges are fixtures: no network, photo permission, cache or gallery is touched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = ts.transpileModule(fs.readFileSync(path.join(root, 'src/chat-photo-download.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const settle = async () => { for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve)); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const url = 'https://cdn.example.test/private-fixture.png';
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7WQAAAAASUVORK5CYII=', 'base64'));
const jpeg = Uint8Array.from([255, 216, 255, 224, 0, 2, 255, 217]);
const webp = Uint8Array.from([82, 73, 70, 70, 12, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 76, 0, 0, 0, 0]);

function harness(platform = { OS: 'ios', Version: '18.0' }) {
  let sessionVersion = 1, current = true, offset = 0;
  const events = [], files = [], timers = new Map(), overrides = {};
  class ApiError extends Error { constructor(message, status, code) { super(message); Object.assign(this, { status, code }); } }
  const reader = {
    read: async () => overrides.read ? overrides.read() : offset++ === 0 ? { done: false, value: png } : { done: true },
    cancel: async () => { events.push(['cancel']); },
  };
  const response = { ok: true, url, redirected: false, headers: new Headers({ 'content-type': 'image/png' }), body: { getReader: () => reader } };
  class File {
    constructor(_dir, name) { this.uri = `file:///cache/${name}`; this.exists = false; files.push(this); }
    create() { events.push(['create', this.uri]); this.exists = true; }
    write(bytes) { events.push(['write', this.uri, bytes.length]); this.bytes = bytes; if (overrides.write) overrides.write(); }
    delete() { events.push(['delete', this.uri]); this.exists = false; }
  }
  const modules = {
    expo: { requireOptionalNativeModule: name => { events.push(['native', name]); return overrides.noMediaLibrary ? null : {}; } },
    'expo/fetch': { fetch: async (address, options) => { events.push(['fetch', address, options]); return overrides.fetch ? overrides.fetch(address, options) : response; } },
    'expo-file-system': { File, Paths: { cache: 'file:///cache/' } },
    'expo-media-library': {
      getPermissionsAsync: async (...args) => { events.push(['permission.get', ...args]); return overrides.getPermission ? overrides.getPermission() : { granted: true, canAskAgain: true }; },
      requestPermissionsAsync: async (...args) => { events.push(['permission.request', ...args]); return overrides.requestPermission ? overrides.requestPermission() : { granted: true, canAskAgain: true }; },
      Asset: { create: async uri => { events.push(['save', uri]); assert.equal(files.find(file => file.uri === uri)?.exists, true); return overrides.save ? overrides.save(uri) : { id: 'saved-fixture' }; } },
    },
    'react-native': { Platform: platform, Image: { getSize: async uri => { events.push(['decode', uri]); return overrides.decode ? overrides.decode(uri) : { width: 1, height: 1 }; } } },
    './api/endpoints': { api: { chatPhotoUrl: async (to, id) => { events.push(['resolve', to, id]); return overrides.resolve ? overrides.resolve(to, id) : url; } } },
    './api/client': { ApiError }, './session': { getSessionVersion: () => sessionVersion },
  };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require: name => { assert.ok(modules[name], `Unexpected module ${name}`); return modules[name]; }, URL, Uint8Array, AbortController, console,
    setTimeout: (fn, ms) => { const timer = { fn, ms }; timers.set(timer, timer); return timer; }, clearTimeout: timer => timers.delete(timer),
  });
  return { ApiError, events, files, timers, overrides, response, reader, run: () => module.exports.downloadChatPhoto('peer-1', 'photo-1', () => current), retire: () => { sessionVersion++; }, close: () => { current = false; } };
}
const count = (h, name) => h.events.filter(event => event[0] === name).length;
const clean = h => { assert.ok(h.files.every(file => !file.exists), 'Only temporary cache files are removed'); assert.equal(h.timers.size, 0, 'Download timers are removed'); };

test('downloads only the resolved photo, saves after native verification, and cleans cache after durable success', async () => {
  const h = harness(), saved = deferred();
  let finished = false;
  h.overrides.save = () => saved.promise;
  const work = h.run().then(() => { finished = true; });
  await settle();
  assert.equal(count(h, 'save'), 1); assert.equal(finished, false, 'Download completion is not a save confirmation');
  assert.equal(h.files[0].exists, true, 'The file remains until the native save completes');
  const request = h.events.find(event => event[0] === 'fetch');
  assert.equal(request[1], url); assert.equal(request[2].credentials, 'omit'); assert.equal(request[2].redirect, 'error');
  assert.equal(request[2].headers.Authorization, undefined); assert.equal(request[2].headers.Cookie, undefined);
  assert.deepEqual(h.events.filter(event => event[0] === 'resolve'), [['resolve', 'peer-1', 'photo-1'], ['resolve', 'peer-1', 'photo-1']], 'Revalidate visibility after the permission dialog and transfer');
  assert.equal(count(h, 'permission.request'), 0);
  assert.equal(h.events.find(event => event[0] === 'permission.get')[1], true);
  assert.equal(h.events.find(event => event[0] === 'permission.get')[2].length, 0);
  assert.match(h.files[0].uri, /\.png$/); assert.deepEqual(Array.from(h.files[0].bytes), Array.from(png));
  saved.resolve({ id: 'saved-fixture' }); await work; clean(h);
  assert.equal(request[2].signal.aborted, true);
});

for (const [mime, bytes, extension] of [['image/jpeg', jpeg, 'jpg'], ['image/webp', webp, 'webp']]) test(`uses a verified ${extension} extension instead of a remote filename`, async () => {
  const h = harness(); let offset = 0;
  h.response.headers.set('content-type', `${mime}; charset=binary`);
  h.overrides.read = async () => offset++ === 0 ? { done: false, value: bytes } : { done: true };
  await h.run(); assert.match(h.files[0].uri, new RegExp(`\\.${extension}$`)); assert.equal(count(h, 'save'), 1); clean(h);
});

test('an app without the gallery module explains the update instead of failing to start', async () => {
  const h = harness();
  h.overrides.noMediaLibrary = true;
  await assert.rejects(h.run(), error => error.status === 501 && error.code === 'PHOTO_SAVE_UNAVAILABLE' && /latest version of the BinzoLive app/.test(error.message));
  assert.deepEqual(h.events, [['native', 'ExpoMediaLibraryNext']], 'Nothing is resolved, fetched or saved');
  clean(h);
});

test('asks only for add permission on an explicit authorized download and handles permanent denial', async () => {
  const h = harness();
  assert.equal(h.events.length, 0, 'Importing the module does not prompt or save');
  h.overrides.getPermission = () => ({ granted: false, canAskAgain: true });
  await h.run();
  assert.deepEqual(h.events.map(event => event[0]).slice(0, 4), ['native', 'resolve', 'permission.get', 'permission.request']);
  const permission = h.events.find(event => event[0] === 'permission.request');
  assert.equal(permission[1], true); assert.equal(permission[2].length, 0);
  const denied = harness();
  denied.overrides.getPermission = () => ({ granted: false, canAskAgain: false });
  await assert.rejects(denied.run(), error => error.code === 'PHOTO_PERMISSION_DENIED');
  assert.equal(count(denied, 'permission.request'), 0); assert.equal(count(denied, 'fetch'), 0); assert.equal(count(denied, 'save'), 0);
  const refused = harness();
  refused.overrides.getPermission = () => ({ granted: false, canAskAgain: true });
  refused.overrides.requestPermission = () => ({ granted: false, canAskAgain: false });
  await assert.rejects(refused.run(), /device settings/); assert.equal(count(refused, 'fetch'), 0);
});

test('server authorization failures never prompt for permission or fetch media', async () => {
  const h = harness(); h.overrides.resolve = () => { throw new h.ApiError('This photo is no longer available', 404); };
  await assert.rejects(h.run(), /no longer available/); assert.equal(count(h, 'permission.get'), 0); assert.equal(count(h, 'fetch'), 0);
});

test('Android scoped saves need no library, location or deprecated storage grant', async () => {
  for (const Version of [30, 32, 33, 35, 36]) {
    const h = harness({ OS: 'android', Version });
    h.overrides.getPermission = () => { throw new Error('Modern Android must not ask for a storage permission'); };
    await h.run(); assert.equal(count(h, 'save'), 1); assert.equal(count(h, 'permission.get'), 0); assert.equal(count(h, 'permission.request'), 0); clean(h);
  }
  for (const Version of [28, 29]) {
    const h = harness({ OS: 'android', Version });
    h.overrides.getPermission = () => ({ granted: false, canAskAgain: true });
    await h.run(); assert.equal(count(h, 'permission.request'), 1, 'The SDK57 legacy file writer still needs write permission'); clean(h);
  }
});

for (const address of ['http://cdn.example.test/a.png', 'file:///private/a.png', 'data:image/png;base64,aaaa', 'https://user:password@cdn.example.test/a.png', 'https://cdn.example.test/a.png#fragment', 'https://cdn.example.test\\@evil.test/a.png']) test(`rejects unsafe resolved address ${address.split(':')[0]}`, async () => {
  const h = harness(); h.overrides.resolve = () => address;
  await assert.rejects(h.run(), /secure download/); assert.equal(count(h, 'permission.get'), 0); assert.equal(count(h, 'fetch'), 0);
});

for (const [label, change] of [
  ['failed HTTP response', h => { h.response.ok = false; }],
  ['redirected response', h => { h.response.redirected = true; }],
  ['changed response address', h => { h.response.url = 'https://other.example.test/photo.png'; }],
  ['HTML MIME', h => h.response.headers.set('content-type', 'text/html')],
  ['missing MIME', h => h.response.headers.delete('content-type')],
  ['oversized advertised body', h => h.response.headers.set('content-length', String(5 * 1024 * 1024 + 1))],
  ['malformed length', h => h.response.headers.set('content-length', 'unknown')],
  ['absent stream', h => { h.response.body = null; }],
  ['empty body', h => { h.overrides.read = () => ({ done: true }); }],
  ['forged photo header', h => { let offset = 0; h.overrides.read = () => offset++ ? { done: true } : { done: false, value: new Uint8Array(60) }; }],
  ['mismatched JPEG MIME for PNG bytes', h => h.response.headers.set('content-type', 'image/jpeg')],
]) test(`${label} cannot create a gallery item`, async () => {
  const h = harness(); change(h);
  await assert.rejects(h.run()); assert.equal(count(h, 'save'), 0); assert.equal(h.files.length, 0); clean(h);
  assert.equal(h.events.find(event => event[0] === 'fetch')[2].signal.aborted, true);
});

test('actual streamed size is bounded without trusting missing or misleading Content-Length', async () => {
  for (const declared of [null, '12']) {
    const h = harness(); if (declared) h.response.headers.set('content-length', declared);
    let reads = 0;
    h.overrides.read = () => ({ done: false, value: new Uint8Array(++reads === 1 ? 5 * 1024 * 1024 : 1) });
    await assert.rejects(h.run(), error => error.status === 413);
    assert.equal(reads, 2); assert.equal(count(h, 'save'), 0); assert.equal(count(h, 'cancel'), 1); clean(h);
  }
});

test('a stalled response or body times out and aborts instead of leaving Download pending', async () => {
  for (const stage of ['fetch', 'read']) {
    const h = harness(), blocked = deferred(); h.overrides[stage] = () => blocked.promise;
    const work = h.run(); await settle();
    const timer = [...h.timers.values()][0]; assert.equal(timer.ms, 20000); timer.fn();
    await assert.rejects(work, /timed out/); assert.equal(count(h, 'save'), 0); clean(h);
    assert.equal(h.events.find(event => event[0] === 'fetch')[2].signal.aborted, true);
  }
});

test('retiring the account or WebView during permission, transfer, decoding or revalidation prevents save', async () => {
  for (const stage of ['resolve', 'requestPermission', 'read', 'decode', 'revalidate']) {
    const h = harness();
    if (stage === 'resolve') h.overrides.resolve = () => { h.retire(); return url; };
    if (stage === 'requestPermission') { h.overrides.getPermission = () => ({ granted: false, canAskAgain: true }); h.overrides.requestPermission = () => { h.retire(); return { granted: true }; }; }
    if (stage === 'read') h.overrides.read = () => { h.retire(); return { done: false, value: png }; };
    if (stage === 'decode') h.overrides.decode = () => { h.close(); return { width: 1, height: 1 }; };
    if (stage === 'revalidate') { let resolves = 0; h.overrides.resolve = () => { if (++resolves === 2) h.retire(); return url; }; }
    await assert.rejects(h.run(), /sign-in changed/, stage); assert.equal(count(h, 'save'), 0, stage); clean(h);
  }
});

test('a deleted/hidden photo or blocked peer during transfer is rechecked before save', async () => {
  const h = harness(); let resolves = 0;
  h.overrides.resolve = () => { if (++resolves === 2) throw new h.ApiError('Photo no longer available', 404); return url; };
  await assert.rejects(h.run(), /no longer available/); assert.equal(count(h, 'save'), 0); clean(h);
});

test('corrupt native image decoding, cache write and native gallery errors all remove temporary files', async () => {
  for (const stage of ['write', 'decode', 'save']) {
    const h = harness(); h.overrides[stage] = () => { throw new Error(`Fixture ${stage} failure`); };
    await assert.rejects(h.run(), /could not be saved/); assert.equal(h.files.length, 1); clean(h);
    if (stage !== 'save') assert.equal(count(h, 'save'), 0);
  }
});

test('native configuration enables add-only iOS saves without modern Android library read access', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
  assert.match(config.ios.infoPlist.NSPhotoLibraryAddUsageDescription, /Download/);
  assert.match(config.ios.infoPlist.NSPhotoLibraryUsageDescription, /chats/);
  assert.match(config.ios.infoPlist.NSCameraUsageDescription, /chat.*photo/);
  assert.match(config.ios.infoPlist.NSMicrophoneUsageDescription, /voice message/);
  const media = config.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-media-library');
  assert.equal(media[1].photosPermission, config.ios.infoPlist.NSPhotoLibraryUsageDescription, 'The config plugin must preserve the chat photo purpose in the generated iOS plist');
  assert.equal(media[1].savePhotosPermission, config.ios.infoPlist.NSPhotoLibraryAddUsageDescription);
  assert.deepEqual(media[1].granularPermissions, []);
  assert.ok(config.android.blockedPermissions.includes('android.permission.READ_MEDIA_VISUAL_USER_SELECTED'));
  const deps = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies;
  assert.match(deps['expo-file-system'], /57\./); assert.match(deps['expo-media-library'], /57\./);
});
