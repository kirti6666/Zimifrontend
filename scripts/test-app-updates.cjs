/* Mandatory updater contracts against real pure modules; network/native edges stay isolated. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const installed = (versionCode = 6) => ({ supported: true, packageName: 'com.aurora.liveapp', versionName: '1.0.0', versionCode });
const release = (versionCode = 7) => ({
  _id: String(versionCode).padStart(24, '0'), version: `staff-label-${versionCode}`, versionName: `1.0.${versionCode}`,
  versionCode, packageName: 'com.aurora.liveapp', releaseNotes: 'A newer release', fileName: `BinzoLive-${versionCode}.apk`,
  sizeBytes: 1024, sha256: String(versionCode).padStart(64, 'a'), publishedAt: '2026-10-30T00:00:00Z',
  downloadPath: `/api/v1/app/releases/${String(versionCode).padStart(24, '0')}/download`,
});
const policy = (candidate = release(), local = installed()) => ({ updateRequired: local.versionCode < candidate.versionCode, minimumVersionCode: candidate.versionCode, release: candidate });
const noRelease = () => ({ updateRequired: false, minimumVersionCode: null, release: null });
const receipt = candidate => ({ receiptId: '12345678-1234-1234-1234-123456789abc', releaseId: candidate._id, versionCode: candidate.versionCode, sha256: candidate.sha256, sizeBytes: candidate.sizeBytes });

function modules(overrides = {}, globals = {}) {
  const cache = new Map(), context = vm.createContext({ console, URL, AbortController, Headers, Error, setTimeout, clearTimeout, setInterval, clearInterval, ...globals });
  const load = file => {
    const filename = path.resolve(ROOT, file);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const source = fs.readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const requireMock = name => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name.startsWith('.')) return load(path.relative(ROOT, path.resolve(path.dirname(filename), `${name}.ts`)));
      throw new Error(`Unexpected updater dependency: ${name}`);
    };
    vm.runInContext(`(function(require,module,exports){${compiled}\n})`, context, { filename })(requireMock, module, module.exports);
    return module.exports;
  };
  return { load, context };
}

function controllerHarness(overrides = {}, globals = {}) {
  const frames = [], calls = { checks: [], configured: [], saved: [], downloads: [], installs: [], cancels: [], graces: [] }, receipts = new Map();
  const controls = { policy: policy(), ...overrides };
  const { AppUpdateController } = modules({}, globals).load('src/app-update-controller.ts');
  const deps = {
    installed: () => controls.installed ? controls.installed() : Promise.resolve(installed()),
    configure: identity => calls.configured.push(plain(identity)),
    check: identity => { calls.checks.push(plain(identity)); return controls.check ? controls.check(identity) : Promise.resolve(plain(controls.policy)); },
    load: identity => controls.load ? controls.load(identity) : Promise.resolve(null),
    save: value => { calls.saved.push(plain(value)); return controls.save ? controls.save(value) : Promise.resolve(); },
    url: candidate => `https://api.binzolive.com${candidate.downloadPath}`,
    download: async request => {
      calls.downloads.push(plain(request));
      const result = controls.download ? await controls.download(request) : receipt(controls.policy.release);
      receipts.set(result.releaseId, result); return result;
    },
    receipt: id => controls.receipt ? controls.receipt(id) : Promise.resolve(receipts.get(id) ?? null),
    install: id => { calls.installs.push(id); return controls.install ? controls.install(id) : Promise.resolve({ status: 'installer_opened' }); },
    cancel: (id, discard) => { calls.cancels.push({ id, discard }); return Promise.resolve(); },
    ...(Object.hasOwn(controls, 'grace') ? { grace: (identity, candidate) => { calls.graces.push({ identity: plain(identity), release: plain(candidate) }); return controls.grace(identity, candidate); } } : {}),
  };
  const controller = new AppUpdateController(deps, state => frames.push(plain(state)));
  return { controller, controls, calls, frames, receipts };
}

function clock() {
  let now = Date.parse('2026-10-30T00:00:00Z');
  const timers = new Set();
  return {
    now: () => now,
    globals: {
      Date: { now: () => now, parse: Date.parse },
      setTimeout: (callback, ms) => { const timer = { callback, due: now + ms }; timers.add(timer); return timer; },
      clearTimeout: timer => timers.delete(timer),
    },
    advance(ms) { now += ms; for (const timer of [...timers]) if (timer.due <= now) { timers.delete(timer); timer.callback(); } },
  };
}

test('native build identity headers/auth are independent of account credentials and observers are isolated', () => {
  const events = modules().load('src/app-update-events.ts');
  assert.deepEqual(plain(events.getAppUpdateHeaders()), {});
  assert.deepEqual(plain(events.getAppUpdateAuth()), {});
  const identity = installed(); events.configureAppUpdates(identity); identity.versionCode = 900;
  assert.deepEqual(plain(events.getAppUpdateHeaders()), { 'X-App-Platform': 'android', 'X-App-Version-Code': '6', 'X-App-Update-Capable': '1' });
  assert.deepEqual(plain(events.getAppUpdateAuth()), { appPlatform: 'android', appVersionCode: 6, appUpdateCapable: 1 });
  const notifications = [];
  events.onAppUpdate(() => { throw new Error('Observer failure'); });
  const stop = events.onAppUpdate(required => notifications.push(required));
  events.notifyAppUpdate(); events.notifyAppUpdate(true); stop(); events.notifyAppUpdate(true);
  assert.deepEqual(notifications, [false, true]);
});

test('policy parsing uses the native package/build and a release-specific download path', () => {
  const { parseUpdatePolicy } = modules().load('src/app-update-policy.ts');
  const source = policy();
  assert.deepEqual(plain(parseUpdatePolicy(source, installed())), source);
  assert.equal(parseUpdatePolicy(policy(release(7), installed(7)), installed(7)).updateRequired, false);
  assert.equal(parseUpdatePolicy(policy(release(7), installed(8)), installed(8)).updateRequired, false);
  assert.deepEqual(plain(parseUpdatePolicy(noRelease(), installed())), noRelease());
  const normalized = parseUpdatePolicy(policy({ ...release(), sha256: 'A'.repeat(64), releaseNotes: 'x'.repeat(5000), fileName: 'x'.repeat(300) }), installed());
  assert.equal(normalized.release.sha256, 'a'.repeat(64));
  assert.equal(normalized.release.releaseNotes.length, 4000);
  assert.equal(normalized.release.fileName.length, 200);
});

test('untrusted release metadata and contradictory update decisions cannot open or redirect the app', () => {
  const { parseUpdatePolicy } = modules().load('src/app-update-policy.ts');
  for (const value of [null, [], {}, { ...policy(), updateRequired: 'true' }, { ...noRelease(), updateRequired: true }, { ...noRelease(), minimumVersionCode: 7 }, { ...policy(), updateRequired: false }, { ...policy(), minimumVersionCode: 8 }])
    assert.throws(() => parseUpdatePolicy(value, installed()), /verify/);
  for (const patch of [
    { _id: '../release' }, { versionCode: 0 }, { versionCode: 1.5 }, { versionCode: '7' }, { versionCode: 2147483648 },
    { packageName: 'com.example.other' }, { sha256: 'f'.repeat(63) }, { sizeBytes: 0 }, { sizeBytes: 262144001 }, { sizeBytes: '1024' },
    { versionName: '' }, { versionName: 'x'.repeat(101) }, { publishedAt: 'not-a-date' },
    { downloadPath: 'https://evil.example/app.apk' }, { downloadPath: '//evil.example/app.apk' }, { downloadPath: '/api/v1/app/download' },
    { downloadPath: `/api/v1/app/releases/${release(8)._id}/download` }, { downloadPath: `${release().downloadPath}?redirect=elsewhere` },
  ]) assert.throws(() => parseUpdatePolicy(policy({ ...release(), ...patch }), installed()), /verify/, JSON.stringify(patch));
});

test('public update checks omit account credentials, reject bad envelopes and bound a stalled response body', async () => {
  const calls = [], timers = [];
  let response = { ok: true, json: async () => ({ success: true, data: policy() }) };
  const h = modules({}, { fetch: async (...args) => { calls.push(args); return response; }, setTimeout: (callback, ms) => { const timer = { callback, ms }; timers.push(timer); return timer; }, clearTimeout: timer => { if (timer) timer.cleared = true; } });
  const { fetchUpdatePolicy } = h.load('src/app-update-policy.ts');
  assert.deepEqual(plain(await fetchUpdatePolicy('https://api.binzolive.com/api/v1', installed())), policy());
  assert.equal(calls[0][0], 'https://api.binzolive.com/api/v1/app/update-check?platform=android&versionCode=6');
  assert.deepEqual(plain(calls[0][1].headers), { Accept: 'application/json' });
  assert.equal(calls[0][1].credentials, 'omit'); assert.equal(calls[0][1].redirect, 'error'); assert.equal(calls[0][1].cache, 'no-store');
  assert.equal(timers[0].cleared, true);
  for (const address of ['http://api.binzolive.com/api/v1', 'https://user:secret@api.binzolive.com/api/v1']) await assert.rejects(fetchUpdatePolicy(address, installed()), /verify/);
  for (const body of [{ success: false, data: policy() }, { success: true, data: { ...policy(), updateRequired: false } }]) {
    response = { ok: true, json: async () => body };
    await assert.rejects(fetchUpdatePolicy('https://api.binzolive.com/api/v1', installed()), /verify/);
  }
  response = { ok: false, json: async () => ({ success: true, data: noRelease() }) };
  await assert.rejects(fetchUpdatePolicy('https://api.binzolive.com/api/v1', installed()), /check for app updates/);
  response = { ok: true, json: () => new Promise(() => {}) };
  const stalled = fetchUpdatePolicy('https://api.binzolive.com/api/v1', installed()); await settle();
  assert.equal(timers.at(-1).ms, 12000); timers.at(-1).callback();
  await assert.rejects(stalled, /took too long/);
  assert.equal(calls.at(-1)[1].signal.aborted, true);
});

test('offline startup fails closed even with a cached allowed policy; a cached mandatory policy stays locked', async () => {
  for (const cached of [null, noRelease(), policy()]) {
    const h = controllerHarness({ load: async () => cached, check: async () => { throw new Error('Offline'); } });
    await h.controller.start();
    assert.equal(h.controller.state.status, cached?.updateRequired ? 'required' : 'error');
    assert.ok(!h.frames.some(frame => frame.status === 'allowed'));
    assert.equal(h.controller.state.checking, false);
    if (cached?.updateRequired) assert.equal(h.controller.state.release._id, release()._id);
    h.controller.close();
  }
});

test('unsupported native builds fail closed without configuring spoofed version headers', async () => {
  for (const identity of [{ ...installed(), supported: false }, installed(0), installed(1.5), installed(NaN)]) {
    const h = controllerHarness({ installed: async () => identity }); await h.controller.start();
    assert.equal(h.controller.state.status, 'error'); assert.equal(h.calls.configured.length, 0); assert.equal(h.calls.checks.length, 0);
  }
});

test('a verified current build opens only after a fresh server check and persists its policy', async () => {
  const gate = deferred(), h = controllerHarness({ check: () => gate.promise });
  const start = h.controller.start(); await settle();
  assert.equal(h.controller.state.status, 'checking'); assert.equal(h.calls.configured.length, 1);
  gate.resolve(policy(release(6))); await start;
  assert.equal(h.controller.state.status, 'allowed'); assert.equal(h.calls.saved.length, 1);
  h.controller.close();
});

test('forced release invalidation locks an already-allowed build until another check succeeds', async () => {
  const h = controllerHarness({ policy: policy(release(6)) }); await h.controller.start();
  const gate = deferred(); h.controls.check = () => gate.promise;
  const check = h.controller.check(true);
  assert.equal(h.controller.state.status, 'checking');
  gate.resolve(policy(release(7))); await check;
  assert.equal(h.controller.state.status, 'required'); assert.equal(h.controller.state.release.versionCode, 7);
  h.controller.close();
});

test('an idle mandatory update has no dismiss action and opening the system installer never grants app access', async () => {
  const h = controllerHarness(); await h.controller.start();
  assert.equal(h.controller.state.status, 'required');
  for (const method of ['skip', 'defer', 'continue', 'dismiss']) assert.equal(typeof h.controller[method], 'undefined');
  await h.controller.update();
  assert.equal(h.calls.downloads.length, 1); assert.equal(h.calls.installs.length, 1);
  assert.deepEqual(h.calls.downloads[0], { url: `https://api.binzolive.com${release().downloadPath}`, releaseId: release()._id, versionCode: 7, sha256: release().sha256, sizeBytes: 1024 });
  assert.equal(h.controller.state.status, 'required'); assert.equal(h.controller.state.phase, 'installer');
  await h.controller.check();
  assert.equal(h.controller.state.status, 'required', 'Returning after cancelling the installer cannot open the old build');
  h.controller.close();
});

test('a verified running call defers mandatory checks and installation until its activity finishes', async () => {
  const h = controllerHarness({ policy: policy(release(6)) }); await h.controller.start();
  h.controller.setBusy(true); h.controls.policy = policy(release(7));
  const firstFrame = h.frames.length; await h.controller.check(true);
  assert.equal(h.controller.state.status, 'allowed'); assert.equal(h.controller.state.deferred, true);
  assert.equal(h.controller.state.release.versionCode, 7);
  assert.ok(h.frames.slice(firstFrame).every(frame => frame.status === 'allowed'), 'The WebView/media owner stays mounted through a known publication');
  await h.controller.update(); assert.equal(h.calls.downloads.length, 0); assert.equal(h.calls.installs.length, 0);
  h.controller.setBusy(false);
  assert.equal(h.controller.state.status, 'required'); assert.equal(h.controller.state.deferred, false);
  h.controller.close();
});

test('nested call and purchase leases release independently and lock only after the last one ends', async () => {
  const activity = modules().load('src/app-update-activity.ts');
  const h = controllerHarness({ policy: policy(release(6)) }); await h.controller.start();
  const changes = [], stop = activity.onUpdateActivityChanged(busy => { changes.push(busy); h.controller.setBusy(busy); });
  const endCall = activity.beginUpdateActivity('call', 'call-1');
  const endPurchase = activity.beginUpdateActivity('purchase', 'order-1');
  const endSamePurchase = activity.beginUpdateActivity('purchase', 'order-1');
  h.controls.policy = policy(); await h.controller.check(true);
  assert.equal(h.controller.state.status, 'allowed'); assert.equal(h.controller.state.deferred, true);
  endCall(); endCall(); endPurchase();
  assert.equal(activity.isUpdateActivityBusy(), true); assert.equal(h.controller.state.status, 'allowed');
  endSamePurchase();
  assert.equal(activity.isUpdateActivityBusy(), false); assert.equal(h.controller.state.status, 'required');
  assert.deepEqual(changes, [true, false], 'Repeated release cannot finish another owner’s lease');
  stop(); h.controller.close();
});

test('an invalidation with a slow policy response waits for the running payment, then blocks while checking', async () => {
  const h = controllerHarness({ policy: policy(release(6)) }); await h.controller.start();
  h.controller.setBusy(true); const gate = deferred(); h.controls.check = () => gate.promise;
  const checking = h.controller.check(true);
  assert.equal(h.controller.state.status, 'allowed'); assert.equal(h.controller.state.deferred, true);
  h.controller.setBusy(false);
  assert.equal(h.controller.state.status, 'checking');
  gate.resolve(policy()); await checking;
  assert.equal(h.controller.state.status, 'required'); h.controller.close();
});

test('offline policy errors do not interrupt a running payment but cannot keep the app open after it finishes', async () => {
  for (const knowRelease of [false, true]) {
    const h = controllerHarness({ policy: policy(release(6)) }); await h.controller.start();
    h.controller.setBusy(true);
    if (knowRelease) { h.controls.policy = policy(); await h.controller.check(true); }
    h.controls.check = async () => { throw new Error('Offline'); }; await h.controller.check(true);
    assert.equal(h.controller.state.status, 'allowed'); assert.equal(h.controller.state.deferred, true);
    h.controller.setBusy(false);
    assert.equal(h.controller.state.status, knowRelease ? 'required' : 'error');
    h.controller.close();
  }
});

test('the newest release is remembered during activity and becomes mandatory immediately after completion', async () => {
  const h = controllerHarness({ policy: policy(release(6)) }); await h.controller.start();
  h.controller.setBusy(true); h.controls.policy = policy(); await h.controller.check(true);
  h.controls.policy = policy(release(8)); await h.controller.check(true);
  assert.equal(h.controller.state.status, 'allowed'); assert.equal(h.controller.state.release.versionCode, 8);
  assert.ok(h.calls.cancels.some(call => call.id === release()._id && call.discard === true));
  h.controller.setBusy(false);
  assert.equal(h.controller.state.status, 'required'); assert.equal(h.controller.state.release.versionCode, 8);
  h.controller.close();
});

test('a local activity flag cannot reopen a cold, already locked or offline-starting build', async () => {
  for (const offline of [false, true]) {
    const h = controllerHarness(offline ? { check: async () => { throw new Error('Offline'); } } : {});
    h.controller.setBusy(true); await h.controller.start();
    assert.equal(h.controller.state.status, offline ? 'error' : 'required');
    assert.ok(!h.frames.some(frame => frame.status === 'allowed'));
    h.controller.setBusy(false); h.controller.setBusy(true);
    assert.notEqual(h.controller.state.status, 'allowed'); h.controller.close();
  }
});

test('fresh authenticated server grace can restore a cold payment and hands its lifetime to the real activity', async () => {
  const time = clock(), h = controllerHarness({ grace: async () => ({ deferUntil: new Date(time.now() + 60000).toISOString(), activities: ['purchase'] }) }, time.globals);
  await h.controller.start();
  assert.equal(h.controller.state.status, 'allowed'); assert.equal(h.controller.state.deferred, true);
  assert.equal(h.calls.graces.length, 1); assert.equal(h.calls.graces[0].identity.versionCode, 6);
  await h.controller.update(); assert.equal(h.calls.installs.length, 0); assert.equal(h.calls.downloads.length, 0);
  h.controller.setBusy(true); time.advance(60001);
  assert.equal(h.controller.state.status, 'allowed', 'The actual restored activity owns completion once it attaches');
  h.controller.setBusy(false);
  assert.equal(h.controller.state.status, 'required'); assert.equal(h.controller.state.deferred, false);
  h.controller.close();
});

test('server grace expires and locks a cold recovery even when no bridge activity ever attaches', async () => {
  const time = clock(), h = controllerHarness({ grace: async () => ({ deferUntil: new Date(time.now() + 1000).toISOString(), activities: ['call'] }) }, time.globals);
  await h.controller.start(); assert.equal(h.controller.state.status, 'allowed');
  time.advance(1001);
  assert.equal(h.controller.state.status, 'required'); assert.equal(h.controller.state.deferred, false);
  h.controller.close();
});

test('expired, malformed or missing server grace never admits a cold outdated app', async () => {
  const time = clock(), future = new Date(time.now() + 60000).toISOString();
  const invalid = [
    null, {}, { deferUntil: null, activities: [] }, { deferUntil: 'invalid', activities: ['purchase'] },
    { deferUntil: new Date(time.now() - 1).toISOString(), activities: ['call'] },
    { deferUntil: new Date(time.now() + 25 * 3600000).toISOString(), activities: ['call'] },
    { deferUntil: future, activities: [] }, { deferUntil: future, activities: 'call' }, { deferUntil: future, activities: ['other'] },
    { deferUntil: [future], activities: ['purchase'] },
  ];
  for (const grace of invalid) {
    const h = controllerHarness({ grace: async () => grace }, time.globals); await h.controller.start();
    assert.equal(h.controller.state.status, 'required', JSON.stringify(grace)); h.controller.close();
  }
});

test('cached mandatory policy and a local busy flag cannot reuse server grace during offline startup', async () => {
  const h = controllerHarness({ load: async () => policy(), check: async () => { throw new Error('Offline'); }, grace: async () => ({ deferUntil: new Date(Date.now() + 60000).toISOString(), activities: ['purchase'] }) });
  h.controller.setBusy(true); await h.controller.start();
  assert.equal(h.controller.state.status, 'required'); assert.equal(h.calls.graces.length, 0);
  assert.ok(!h.frames.some(frame => frame.status === 'allowed')); h.controller.close();
});

test('installation permission is recoverable without redownloading a verified APK', async () => {
  let installations = 0;
  const h = controllerHarness({ install: async () => ({ status: ++installations === 1 ? 'permission_required' : 'installer_opened' }) });
  await h.controller.start(); await h.controller.update();
  assert.equal(h.controller.state.phase, 'permission'); assert.equal(h.controller.state.status, 'required');
  await h.controller.update();
  assert.equal(h.calls.downloads.length, 1); assert.equal(h.calls.installs.length, 2); assert.equal(h.controller.state.phase, 'installer');
  h.controller.close();
});

test('concurrent update taps launch only one installer while verified receipt installation is pending', async () => {
  const pending = deferred(), h = controllerHarness({ install: () => pending.promise });
  h.receipts.set(release()._id, receipt(release()));
  await h.controller.start();
  const first = h.controller.update(); await settle();
  assert.equal(h.calls.installs.length, 1);
  await Promise.all(Array.from({ length: 20 }, () => h.controller.update()));
  assert.equal(h.calls.installs.length, 1, 'The install mutex also covers a reused receipt with no active download');
  pending.resolve({ status: 'installer_opened' }); await first;
  assert.equal(h.controller.state.status, 'required'); h.controller.close();
});

test('a newly mandatory release locks immediately while its policy cache write is pending', async () => {
  const cache = deferred(), h = controllerHarness({ policy: policy(release(6)) }); await h.controller.start();
  h.controls.policy = policy(release(7)); h.controls.save = () => cache.promise;
  const checking = h.controller.check(); await settle();
  assert.equal(h.controller.state.status, 'required'); assert.equal(h.controller.state.release.versionCode, 7);
  assert.equal(h.controller.state.checking, true, 'Persistence cannot keep app content mounted after the mandatory answer arrives');
  cache.resolve(); await checking; h.controller.close();
});

test('download progress is correlated, bounded and cannot complete an obsolete release', async () => {
  const pending = deferred(), h = controllerHarness({ download: () => pending.promise });
  await h.controller.start(); const updating = h.controller.update(); await settle();
  h.controller.progress({ releaseId: release(8)._id, downloadedBytes: 800, totalBytes: 1024, phase: 'downloading' });
  assert.equal(h.controller.state.progress, 0);
  h.controller.progress({ releaseId: release()._id, downloadedBytes: 2000, totalBytes: 1024, phase: 'downloading' });
  assert.equal(h.controller.state.progress, 1);
  h.controller.progress({ releaseId: release()._id, downloadedBytes: 1024, totalBytes: 1024, phase: 'verifying' });
  assert.equal(h.controller.state.phase, 'verifying');
  h.controller.progress({ releaseId: release()._id, downloadedBytes: 1024, totalBytes: 1024, phase: 'ready' });
  assert.equal(h.calls.installs.length, 0, 'Only a verified native receipt can reach the installer');
  pending.resolve(receipt(release())); await updating; h.controller.close();
});

test('a call or payment beginning during download defers installation until it finishes', async () => {
  const pending = deferred(), h = controllerHarness({ download: () => pending.promise });
  await h.controller.start(); const updating = h.controller.update(); await settle();
  assert.equal(h.calls.downloads.length, 1);
  h.controller.setBusy(true);
  pending.resolve(receipt(release())); await updating;
  assert.equal(h.calls.installs.length, 0, 'A late verified download must not open the installer over a new critical activity');
  h.controller.setBusy(false); await h.controller.update();
  assert.equal(h.calls.downloads.length, 1, 'The completed verified APK is reused after the activity finishes');
  assert.equal(h.calls.installs.length, 1); h.controller.close();
});

test('a newer published release cancels an old download and ignores its late completion', async () => {
  const pending = deferred(), h = controllerHarness({ download: () => pending.promise });
  await h.controller.start(); const updating = h.controller.update(); await settle();
  h.controls.policy = policy(release(8)); await h.controller.check(true);
  assert.equal(h.controller.state.release.versionCode, 8); assert.equal(h.controller.state.phase, 'idle');
  assert.ok(h.calls.cancels.some(call => call.id === release()._id && call.discard === true));
  pending.resolve(receipt(release())); await updating;
  assert.equal(h.calls.installs.length, 0); assert.equal(h.controller.state.release.versionCode, 8); assert.equal(h.controller.state.status, 'required');
  h.controller.close();
});

test('an update published after download is rechecked before launching the installer', async () => {
  const h = controllerHarness({ download: async () => { h.controls.policy = policy(release(8)); return receipt(release()); } });
  await h.controller.start(); await h.controller.update();
  assert.equal(h.calls.installs.length, 0); assert.equal(h.controller.state.release.versionCode, 8); assert.equal(h.controller.state.phase, 'idle');
  h.controller.close();
});

test('mismatched downloaded bytes or native receipts leave the app blocked', async () => {
  for (const patch of [{ releaseId: release(8)._id }, { versionCode: 8 }, { sha256: 'b'.repeat(64) }, { sizeBytes: 1025 }]) {
    const h = controllerHarness({ download: async () => ({ ...receipt(release()), ...patch }) });
    await h.controller.start(); await h.controller.update();
    assert.equal(h.controller.state.status, 'required'); assert.ok(h.controller.state.error); assert.equal(h.calls.installs.length, 0); h.controller.close();
  }
});

test('cached verified receipts are matched to exact metadata before reuse', async () => {
  for (const cached of [receipt(release()), { ...receipt(release()), sha256: 'b'.repeat(64) }]) {
    const h = controllerHarness(); h.receipts.set(release()._id, cached); await h.controller.start(); await h.controller.update();
    assert.equal(h.calls.downloads.length, cached.sha256 === release().sha256 ? 0 : 1);
    assert.equal(h.calls.installs.length, 1); assert.equal(h.controller.state.status, 'required'); h.controller.close();
  }
});

test('rollback or a missing mandatory policy cannot unlock a previously required build', async () => {
  for (const replacement of [policy(release(7)), noRelease(), policy(release(6))]) {
    const h = controllerHarness({ policy: policy(release(8)) }); await h.controller.start();
    h.controls.policy = replacement; await h.controller.check();
    assert.equal(h.controller.state.status, 'required'); assert.equal(h.controller.state.release.versionCode, 8); assert.ok(h.controller.state.error);
    h.controller.close();
  }
});

test('rejected policy rollbacks never overwrite the durable mandatory policy used after restart', async () => {
  for (const replacement of [policy(release(7)), noRelease(), policy(release(6))]) {
    let stored;
    const save = async value => { stored = plain(value); };
    const h = controllerHarness({ policy: policy(release(8)), save }); await h.controller.start();
    h.controls.policy = replacement; await h.controller.check();
    assert.equal(stored.minimumVersionCode, 8);
    const restarted = controllerHarness({ policy: replacement, load: async () => stored, save });
    await restarted.controller.start();
    assert.equal(restarted.controller.state.status, 'required'); assert.equal(restarted.controller.state.release.versionCode, 8);
    h.controller.close(); restarted.controller.close();
  }
});

test('closing cancels the current download and suppresses every late state/install effect', async () => {
  const pending = deferred(), h = controllerHarness({ download: () => pending.promise });
  await h.controller.start(); const updating = h.controller.update(); await settle();
  h.controller.close(); const frames = h.frames.length;
  pending.resolve(receipt(release())); await updating; await h.controller.check(true);
  assert.equal(h.frames.length, frames); assert.equal(h.calls.installs.length, 0); assert.ok(h.calls.cancels.length > 0);
});

test('HTTP requests carry native version headers and 426 update errors invalidate the gate', async () => {
  const observed = [], invalidations = [];
  let response = { status: 200, ok: true, headers: new Headers(), text: async () => JSON.stringify({ success: true, data: { value: 'ok' } }) };
  const session = { SessionStorageError: class extends Error {}, getSessionVersion: () => 1, getSessionSnapshot: async () => ({ generation: 1, session: { accessToken: 'account-access-token' } }), getToken: async () => 'account-access-token' };
  const h = modules({ '../config': { API_URL: 'https://api.binzolive.com/api/v1' }, '../session': session }, { fetch: async (...args) => { observed.push(args); return response; } });
  const events = h.load('src/app-update-events.ts'); events.configureAppUpdates(installed()); events.onAppUpdate(required => invalidations.push(required));
  const client = h.load('src/api/client.ts');
  await client.request('GET', '/home');
  assert.equal(observed[0][1].headers['X-App-Version-Code'], '6'); assert.equal(observed[0][1].headers['X-App-Update-Capable'], '1');
  assert.equal(observed[0][1].headers.Authorization, 'Bearer account-access-token');
  response = { status: 426, ok: false, headers: new Headers(), text: async () => JSON.stringify({ success: false, code: 'APP_UPDATE_REQUIRED', message: 'Install the update.' }) };
  await assert.rejects(client.request('GET', '/home'), error => error.status === 426 && error.code === 'APP_UPDATE_REQUIRED');
  assert.deepEqual(invalidations, [true]);
});

test('Socket.IO native build auth and release/version errors trigger fresh policy checks', async () => {
  const handlers = new Map(), invalidations = [], sockets = [];
  let unsubscribed = false;
  const socket = { connected: true, active: true, on(name, listener) { handlers.set(name, listener); return this; }, emit() {}, connect() {}, disconnect() { this.disconnected = true; }, removeAllListeners() { handlers.clear(); } };
  const h = modules({
    'socket.io-client': { io: (url, options) => { sockets.push({ url, options }); return socket; } },
    '../config': { SOCKET_URL: 'https://api.binzolive.com' }, '../session': { getToken: async () => 'current-access-token', onTokenChanged: () => () => { unsubscribed = true; } },
    './endpoints': { api: {} }, './adapters': {}, './client': { ApiError: class extends Error {} },
  });
  const events = h.load('src/app-update-events.ts'); events.configureAppUpdates(installed()); events.onAppUpdate(required => invalidations.push(required));
  const { connectRealtime } = h.load('src/api/realtime.ts');
  const stop = connectRealtime('stale-token', () => {}, 'member-id');
  const auth = await new Promise(resolve => sockets[0].options.auth(resolve));
  assert.deepEqual(plain(auth), { token: 'current-access-token', appPlatform: 'android', appVersionCode: 6, appUpdateCapable: 1 });
  assert.equal(sockets[0].url, 'https://api.binzolive.com');
  handlers.get('app:release-updated')({ arbitraryUntrustedPayload: true });
  handlers.get('connect_error')({ data: { code: 'APP_UPDATE_REQUIRED' } });
  handlers.get('connect_error')({ data: { code: 'APP_VERSION_REQUIRED' } });
  assert.deepEqual(invalidations, [true, true, true]); assert.equal(socket.disconnected, true);
  stop(); assert.equal(unsubscribed, true);
});

test('foreground and realtime events check policy while background polling stays quiet', async () => {
  const effects = [], frames = [], activities = [], intervals = [];
  let checks = 0, progressStopped = false, activityStopped = false;
  const h = modules({
    react: { useState: initial => [initial, state => frames.push(plain(state))], useMemo: work => work(), useEffect: work => effects.push(work) },
    'react-native': { Platform: { OS: 'android' }, AppState: { currentState: 'active', addEventListener: (_name, callback) => { activities.push(callback); return { remove() { activityStopped = true; } }; } } },
    'expo-secure-store': { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7, getItemAsync: async () => null, setItemAsync: async () => {} },
    './config': { API_URL: 'https://api.binzolive.com/api/v1' },
    './session': { getToken: async () => null },
    './api/client': { request: async () => { throw new Error('Signed-out policy checks do not need authenticated recovery'); } },
    './app-update-policy': { fetchUpdatePolicy: async () => { checks++; return noRelease(); } },
    './native-apk-updater': { getInstalledApp: async () => installed(), addDownloadProgressListener: () => () => { progressStopped = true; }, getVerifiedRelease: async () => null, cancelDownload: async () => {} },
  }, { setInterval: (callback, ms) => { const entry = { callback, ms }; intervals.push(entry); return entry; }, clearInterval: entry => { entry.stopped = true; } });
  h.load('src/app-update.ts').useAppUpdates(); const cleanup = effects[0](); await settle();
  assert.equal(checks, 1); assert.equal(frames.at(-1).status, 'allowed'); assert.equal(intervals[0].ms, 30000);
  activities[0]('background'); intervals[0].callback(); await settle(); assert.equal(checks, 1);
  activities[0]('active'); await settle(); assert.equal(checks, 2);
  intervals[0].callback(); await settle(); assert.equal(checks, 3);
  activities[0]('background'); h.load('src/app-update-events.ts').notifyAppUpdate(true); await settle(); assert.equal(checks, 4, 'A required-version event locks/checks even in background');
  cleanup(); assert.equal(progressStopped, true); assert.equal(activityStopped, true); assert.equal(intervals[0].stopped, true);
});

test('cold payment recovery requests fresh authenticated grace while the public policy check remains account-free', async () => {
  for (const token of [null, 'restored-native-account-token']) {
    const time = clock(), proof = deferred(), effects = [], frames = [], publicChecks = [], authenticatedChecks = [], saved = [];
    const h = modules({
      react: { useState: initial => [initial, state => frames.push(plain(state))], useMemo: work => work(), useEffect: work => effects.push(work) },
      'react-native': { Platform: { OS: 'android' }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
      'expo-secure-store': { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7, getItemAsync: async () => null, setItemAsync: async (_key, value) => saved.push(JSON.parse(value)) },
      './config': { API_URL: 'https://api.binzolive.com/api/v1' },
      './app-update-policy': { fetchUpdatePolicy: async (...args) => { publicChecks.push(plain(args)); return policy(); } },
      './session': { getToken: async () => token },
      './api/client': { request: (...args) => { authenticatedChecks.push(plain(args)); return proof.promise; } },
      './native-apk-updater': { getInstalledApp: async () => installed(), addDownloadProgressListener: () => () => {}, getVerifiedRelease: async () => null, cancelDownload: async () => {} },
    }, { ...time.globals, setInterval: () => 1, clearInterval: () => {} });
    h.load('src/app-update.ts').useAppUpdates(); const cleanup = effects[0]();
    try {
      await settle();
      assert.equal(publicChecks.length, 1);
      assert.deepEqual(publicChecks[0], ['https://api.binzolive.com/api/v1', installed()]);
      assert.ok(!frames.some(frame => frame.status === 'allowed'), 'A stored token or pending response alone cannot bypass the cold gate');
      if (!token) {
        assert.equal(authenticatedChecks.length, 0); assert.equal(frames.at(-1).status, 'required');
      } else {
        assert.deepEqual(authenticatedChecks, [['GET', '/app/update-session']]);
        proof.resolve({ deferUntil: new Date(time.now() + 60000).toISOString(), activities: ['purchase'] }); await settle();
        assert.equal(frames.at(-1).status, 'allowed'); assert.equal(frames.at(-1).deferred, true);
        assert.ok(saved.every(value => !Object.hasOwn(value, 'deferUntil') && !Object.hasOwn(value, 'activities')), 'Server recovery grace is never stored as an offline admission token');
        const releasePayment = h.load('src/app-update-activity.ts').beginUpdateActivity('purchase', 'restored-order');
        releasePayment();
        assert.equal(frames.at(-1).status, 'required', 'Completing the restored purchase applies the mandatory gate immediately');
      }
    } finally { cleanup(); }
  }
});
