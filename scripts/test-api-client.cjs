/* Native auth transport tests, with isolated SecureStore and network boundaries. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const KEY = 'zimi.session.v1';
const tokens = (name = 'first') => ({
  accessToken: `${name}.access.${'a'.repeat(28)}`,
  refreshToken: `${name}.refresh.${'r'.repeat(28)}`,
  expiresIn: 900,
  refreshExpiresIn: 86400,
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const json = (status, data, headers) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', ...headers },
});
const ok = (data) => json(200, { success: true, data });
const unauthorized = () => json(401, { success: false, message: 'Session expired' });
const flush = () => new Promise((resolve) => setImmediate(resolve));

function harness(options = {}) {
  const disk = options.disk ?? new Map();
  const calls = [];
  const logs = [];
  const storage = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7,
    getItemAsync: options.read ?? (async (key) => disk.get(key) ?? null),
    setItemAsync: async (key, value, opts) => {
      assert.equal(opts.keychainAccessible, 7);
      if (options.write) await options.write(key, value);
      disk.set(key, value);
    },
    deleteItemAsync: async (key) => { disk.delete(key); },
  };
  let network = options.fetch ?? (() => { throw new Error('Unexpected network request'); });
  const context = vm.createContext({
    console: { log: (...x) => logs.push(x), warn: (...x) => logs.push(x), error: (...x) => logs.push(x) },
    URL, AbortController, Date, setTimeout: (fn, ms) => setTimeout(fn, options.timeoutMs ?? ms), clearTimeout,
    __DEV__: options.dev ?? true,
    process: { env: { EXPO_PUBLIC_API_URL: options.apiUrl ?? 'http://192.168.1.6:5000/api/v1', ...options.env } },
    fetch: async (url, init) => { calls.push({ url, init }); return network(url, init); },
  });
  const modules = new Map();
  function load(relative) {
    const filename = path.resolve(ROOT, relative);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const requireMock = (id) => {
      if (id === 'expo-secure-store') return storage;
      if (id.startsWith('.')) return load(path.relative(ROOT, path.resolve(path.dirname(filename), `${id}.ts`)));
      throw new Error(`Unexpected import: ${id}`);
    };
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename })(requireMock, module, module.exports);
    return module.exports;
  }
  return {
    session: load('src/session.ts'), client: load('src/api/client.ts'), config: load('src/config.ts'),
    disk, calls, logs, setFetch: (fetch) => { network = fetch; },
  };
}

test('concurrent 401s share one refresh, atomically store rotation, and retry once', async () => {
  const h = harness();
  const first = tokens();
  const rotated = tokens('rotated');
  await h.session.setSessionTokens(first);
  const refreshGate = deferred();
  let refreshed = 0;
  h.setFetch((url, init) => {
    if (url.endsWith('/auth/refresh')) {
      refreshed++;
      assert.deepEqual(JSON.parse(init.body), { refreshToken: first.refreshToken });
      assert.equal(init.headers.Authorization, undefined);
      assert.equal(init.credentials, 'omit');
      return refreshGate.promise;
    }
    return init.headers.Authorization === `Bearer ${first.accessToken}` ? unauthorized() : ok({ value: 1 });
  });
  const requests = Array.from({ length: 12 }, () => h.client.request('GET', '/auth/me'));
  await flush();
  assert.equal(refreshed, 1);
  refreshGate.resolve(ok({ tokens: rotated }));
  const results = await Promise.all(requests);
  assert.equal(results.length, 12);
  assert.equal(h.calls.length, 25);
  const stored = JSON.parse(h.disk.get(KEY));
  assert.equal(stored.accessToken, rotated.accessToken);
  assert.equal(stored.refreshToken, rotated.refreshToken);
  assert.equal(await h.session.getToken(), rotated.accessToken);
  assert.equal(h.logs.length, 0);
});

test('a late 401 uses the already refreshed token without replaying the old refresh', async () => {
  const h = harness();
  const first = tokens();
  const rotated = tokens('rotated');
  await h.session.setSessionTokens(first);
  const late = deferred();
  let refreshed = 0;
  h.setFetch((url, init) => {
    if (url.endsWith('/auth/refresh')) { refreshed++; return ok({ tokens: rotated }); }
    if (init.headers.Authorization === `Bearer ${rotated.accessToken}`) return ok({});
    return url.endsWith('/slow') ? late.promise : unauthorized();
  });
  const slow = h.client.request('GET', '/slow');
  await h.client.request('GET', '/fast');
  late.resolve(unauthorized());
  await slow;
  assert.equal(refreshed, 1);
});

test('logout while refresh is pending cannot resurrect the session', async () => {
  const h = harness();
  await h.session.setSessionTokens(tokens());
  const gate = deferred();
  h.setFetch((url) => url.endsWith('/auth/refresh') ? gate.promise : unauthorized());
  const pending = h.client.request('GET', '/auth/me');
  const rejected = assert.rejects(pending, (e) => e.code === 'SESSION_CHANGED');
  await flush();
  await h.session.clearToken();
  gate.resolve(ok({ tokens: tokens('late') }));
  await rejected;
  assert.equal(await h.session.getToken(), null);
  assert.equal(h.disk.has(KEY), false);
  assert.equal(h.calls.length, 2);
});

test('a pending refresh cannot overwrite a new login', async () => {
  const h = harness();
  await h.session.setSessionTokens(tokens());
  const gate = deferred();
  h.setFetch((url) => url.endsWith('/auth/refresh') ? gate.promise : unauthorized());
  const rejected = assert.rejects(h.client.request('GET', '/auth/me'), (e) => e.code === 'SESSION_CHANGED');
  await flush();
  await h.session.setSessionTokens(tokens('next-account'));
  gate.resolve(ok({ tokens: tokens('old-rotation') }));
  await rejected;
  assert.equal(await h.session.getToken(), tokens('next-account').accessToken);
  assert.equal(JSON.parse(h.disk.get(KEY)).refreshToken, tokens('next-account').refreshToken);
});

test('stale OTP completion and stale disk reads cannot restore a logged-out identity', async () => {
  const gate = deferred();
  const h = harness({ read: () => gate.promise });
  const oldVersion = h.session.getSessionVersion();
  const read = h.session.getToken();
  await h.session.clearToken();
  assert.equal(await h.session.setSessionTokens(tokens(), oldVersion), false);
  gate.resolve(JSON.stringify({ version: 1, ...tokens(), accessExpiresAt: Date.now() + 900000, refreshExpiresAt: Date.now() + 900000 }));
  assert.equal(await read, null);
  assert.equal(h.disk.has(KEY), false);
});

test('revoked refresh expires once; network failure preserves the secure session', async () => {
  const h = harness();
  await h.session.setSessionTokens(tokens());
  let expired = 0;
  h.session.onSessionExpired(() => expired++);
  h.setFetch((url) => {
    if (url.endsWith('/auth/refresh')) throw new Error('sensitive internal network details');
    return unauthorized();
  });
  await assert.rejects(h.client.request('GET', '/auth/me'), (e) => e.code === 'NETWORK_ERROR' && !e.message.includes('sensitive'));
  assert.equal(await h.session.getToken(), tokens().accessToken);
  assert.equal(expired, 0);
  h.setFetch(() => unauthorized());
  await assert.rejects(h.client.request('GET', '/auth/me'), (e) => e.status === 401);
  assert.equal(expired, 1);
  assert.equal(await h.session.getToken(), null);
  assert.equal(h.disk.has(KEY), false);
});

test('an expired refresh token never goes onto the network', async () => {
  const disk = new Map([[KEY, JSON.stringify({
    version: 1, ...tokens(), accessExpiresAt: Date.now() - 2000, refreshExpiresAt: Date.now() - 1000,
  })]]);
  const h = harness({ disk });
  h.setFetch(() => unauthorized());
  await assert.rejects(h.client.request('GET', '/auth/me'), (e) => e.code === 'SESSION_EXPIRED');
  assert.equal(h.calls.length, 1);
  assert.equal(h.disk.has(KEY), false);
});

test('a repeated 401 after rotation expires the session without a retry loop', async () => {
  const h = harness();
  await h.session.setSessionTokens(tokens());
  h.setFetch((url) => url.endsWith('/auth/refresh') ? ok({ tokens: tokens('rotated') }) : unauthorized());
  await assert.rejects(h.client.request('PATCH', '/auth/profile', { name: 'Person' }), (e) => e.status === 401);
  assert.equal(h.calls.length, 3);
  assert.equal(await h.session.getToken(), null);
});

test('temporary server failures hide internal details and retain login for reconnect', async () => {
  const h = harness();
  await h.session.setSessionTokens(tokens());
  h.setFetch(() => json(503, { success: false, message: 'password=secret connection-string stack trace', retryAfterSeconds: 20 }));
  await assert.rejects(h.client.request('GET', '/auth/me'), (e) => e.status === 503 && !e.message.includes('secret') && e.retryAfterSeconds === 20);
  assert.equal(h.calls.length, 1);
  assert.equal(await h.session.getToken(), tokens().accessToken);
  assert.equal(h.logs.length, 0);
});

test('secure-storage failure rejects login without falling back to plain storage', async () => {
  const h = harness({ write: async () => { throw new Error('private key failure'); } });
  await assert.rejects(h.session.setSessionTokens(tokens()), (e) => e.name === 'SessionStorageError' && !e.message.includes('private key'));
  assert.equal(await h.session.getToken(), null);
  assert.equal(h.disk.has(KEY), false);
  assert.equal(h.logs.length, 0);
});

test('storage configuration and verification failures show actionable safe upload errors', async () => {
  const h = harness();
  await h.session.setSessionTokens(tokens());
  for (const [code, message] of [
    ['STORAGE_NOT_CONFIGURED', 'Photo uploads are not available yet. Please try again later.'],
    ['UPLOAD_UNAVAILABLE', "Couldn't confirm your upload. Please try again."],
  ]) {
    h.setFetch(() => json(503, { success: false, code, message: 'secret storage credentials' }));
    await assert.rejects(h.client.request('POST', '/media/upload-url', {}), error => {
      assert.equal(error.code, code);
      assert.equal(error.message, message);
      return true;
    });
  }
  assert.equal(h.calls.length, 2);
  assert.equal(await h.session.getToken(), tokens().accessToken);
  assert.equal(h.logs.length, 0);
});

test('timeouts cover body downloads and do not retry mutating calls', async () => {
  const h = harness({ timeoutMs: 15 });
  h.setFetch(() => ({ status: 200, ok: true, text: () => new Promise(() => {}) }));
  await assert.rejects(h.client.request('POST', '/auth/otp/request', {}, { auth: false }), (e) => e.code === 'REQUEST_TIMEOUT');
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].init.signal.aborted, true);
});

test('rate errors preserve code and the longest Retry-After without automatic retries', async () => {
  const h = harness();
  await h.session.setSessionTokens(tokens());
  h.setFetch(() => json(429, { success: false, message: 'Wait before another code', code: 'OTP_RATE_LIMITED', retryAfterSeconds: 65 }, { 'Retry-After': '60' }));
  await assert.rejects(h.client.request('POST', '/auth/otp/request', {}, { auth: false }), (e) => {
    assert.equal(e.status, 429);
    assert.equal(e.code, 'OTP_RATE_LIMITED');
    assert.equal(e.retryAfterSeconds, 65);
    return true;
  });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].init.headers.Authorization, undefined);
  assert.equal(await h.session.getToken(), tokens().accessToken);
});

test('public OTP errors do not refresh or clear an unrelated signed-in session', async () => {
  const h = harness();
  await h.session.setSessionTokens(tokens());
  h.setFetch(() => unauthorized());
  await assert.rejects(h.client.request('POST', '/auth/otp/verify', {}), (e) => e.status === 401);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].init.headers.Authorization, undefined);
  assert.equal(await h.session.getToken(), tokens().accessToken);
});

test('logout can revoke captured credentials without touching a newer login', async () => {
  const h = harness();
  await h.session.setSessionTokens(tokens());
  const old = await h.session.getToken();
  await h.session.clearToken();
  await h.session.setSessionTokens(tokens('next'));
  h.setFetch(() => ok(undefined));
  await h.client.request('POST', '/auth/logout', undefined, { auth: false, bearerToken: old, refresh: false });
  assert.equal(h.calls[0].init.headers.Authorization, `Bearer ${old}`);
  assert.equal(await h.session.getToken(), tokens('next').accessToken);
  await assert.rejects(h.client.request('GET', '/auth/me', undefined, { auth: false, bearerToken: old }), (e) => e.code === 'INVALID_REQUEST');
});

test('malformed success and token responses are rejected without accepting bad credentials', async () => {
  const h = harness();
  h.setFetch(() => json(200, { tokens: tokens() }));
  await assert.rejects(h.client.request('POST', '/auth/otp/verify', {}), (e) => e.code === 'INVALID_RESPONSE');
  await h.session.setSessionTokens(tokens());
  h.setFetch((url) => url.endsWith('/auth/refresh') ? ok({ tokens: { accessToken: 'bad' } }) : unauthorized());
  await assert.rejects(h.client.request('GET', '/auth/me'), (e) => e.code === 'INVALID_SESSION');
  assert.equal(await h.session.getToken(), null);
});

test('persistent writes are ordered so a delayed write cannot undo logout', async () => {
  const gate = deferred();
  const h = harness({ write: () => gate.promise });
  const write = h.session.setSessionTokens(tokens());
  await flush();
  const logout = h.session.clearToken();
  gate.resolve();
  assert.equal(await write, false);
  await logout;
  assert.equal(h.disk.has(KEY), false);
});

test('release builds reject HTTP; development permits LAN/emulator addresses only', async () => {
  for (const apiUrl of ['http://192.168.1.6:5000/api/v1', 'http://example.com/api/v1']) {
    const h = harness({ dev: false, apiUrl });
    await assert.rejects(h.client.request('POST', '/auth/otp/request', {}), (e) => e.code === 'API_CONFIGURATION');
    assert.equal(h.calls.length, 0);
    assert.equal(h.config.SOCKET_URL, '');
  }
  assert.ok(harness({ dev: true, apiUrl: 'http://example.com/api/v1' }).config.API_CONFIGURATION_ERROR);
  assert.ok(harness({ dev: true, apiUrl: 'http://0.0.0.0:5000/api/v1' }).config.API_CONFIGURATION_ERROR);
  assert.equal(harness({ dev: true, apiUrl: 'http://10.0.2.2:5000/api/v1' }).config.API_CONFIGURATION_ERROR, null);
  assert.equal(harness({ dev: false, apiUrl: 'https://api.example.com/api/v1' }).config.SOCKET_URL, 'https://api.example.com');
});
