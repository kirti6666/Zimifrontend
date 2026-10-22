/* Durable withdrawal recovery contracts with isolated SecureStore fixtures. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const source = fs.readFileSync(path.resolve(__dirname, '../src/payout-cache.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const plain = value => JSON.parse(JSON.stringify(value));
const attempt = (idempotencyKey = 'withdrawal-attempt-1') => ({ amountPaise: 50000, payoutAddress: 'creator@upi', idempotencyKey });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const settle = () => new Promise(resolve => setImmediate(resolve));

function harness() {
  const disk = new Map(), calls = [], hooks = {};
  const storage = { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7 };
  for (const [method, operation] of [['getItemAsync', 'get'], ['setItemAsync', 'set'], ['deleteItemAsync', 'delete']]) {
    storage[method] = async (key, value, options) => {
      if (operation !== 'set') { options = value; value = undefined; }
      calls.push({ operation, key, value, options });
      if (hooks[operation]) await hooks[operation](key, value);
      if (operation === 'get') return disk.get(key) ?? null;
      if (operation === 'set') disk.set(key, value);
      else disk.delete(key);
    };
  }
  function restart() {
    const module = { exports: {} };
    vm.runInNewContext(compiled, { module, exports: module.exports, require: name => {
      assert.equal(name, 'expo-secure-store', 'Recovery storage has no session/logout dependency'); return storage;
    } }, { filename: 'src/payout-cache.ts' });
    return module.exports;
  }
  return { disk, calls, hooks, restart, cache: restart(), key: id => `zimi.payouts.v1.${id}` };
}

test('a pending withdrawal persists across module restart with account-only access and device-only protection', async () => {
  const h = harness();
  assert.equal(await h.cache.readPendingPayout('alice'), null);
  await h.cache.rememberPendingPayout('alice', { ...attempt(), payoutAddress: '  creator@upi  ' });
  assert.deepEqual(plain(await h.restart().readPendingPayout('alice')), attempt());
  assert.equal(await h.restart().readPendingPayout('bob'), null);
  await h.cache.rememberPendingPayout('bob', { ...attempt('bob-withdrawal-1'), payoutAddress: 'bob@upi' });
  assert.deepEqual(plain(await h.cache.readPendingPayout('alice')), attempt());
  assert.equal((await h.cache.readPendingPayout('bob')).payoutAddress, 'bob@upi');
  assert.ok(h.calls.every(call => call.options?.keychainAccessible === 7), 'Every secure-storage read/write uses WHEN_UNLOCKED_THIS_DEVICE_ONLY');
  assert.equal(h.disk.size, 2, 'Signing in as another account leaves the prior recovery record intact');
});

test('same-key retries reuse one durable intent and cannot change its amount or destination', async () => {
  const h = harness(), submitted = attempt();
  const remembering = h.cache.rememberPendingPayout('alice', submitted);
  submitted.amountPaise = 90000; submitted.payoutAddress = 'other@upi';
  await remembering;
  await h.cache.rememberPendingPayout('alice', { ...attempt(), payoutAddress: ' creator@upi ' });
  assert.equal(h.calls.filter(call => call.operation === 'set').length, 1, 'A matching retry does not replace the persisted request');
  for (const next of [attempt('different-attempt-2'), { ...attempt(), amountPaise: 60000 }, { ...attempt(), payoutAddress: 'other@upi' }]) {
    await assert.rejects(h.cache.rememberPendingPayout('alice', next), /pending withdrawal/);
  }
  assert.deepEqual(plain(await h.cache.readPendingPayout('alice')), attempt(), 'Conflict rejection preserves the original recovery data');
});

test('keyed cleanup cannot erase a different or newer pending withdrawal', async () => {
  const h = harness(); await h.cache.rememberPendingPayout('alice', attempt());
  await h.cache.forgetPendingPayout('bob', attempt().idempotencyKey);
  await h.cache.forgetPendingPayout('alice', 'unrelated-attempt');
  assert.equal(h.calls.filter(call => call.operation === 'delete').length, 0);
  await h.cache.forgetPendingPayout('alice', attempt().idempotencyKey);
  assert.equal(await h.cache.readPendingPayout('alice'), null);
  await h.cache.rememberPendingPayout('alice', attempt('new-withdrawal-2'));
  await h.cache.forgetPendingPayout('alice', attempt().idempotencyKey);
  assert.equal((await h.cache.readPendingPayout('alice')).idempotencyKey, 'new-withdrawal-2');
  await h.cache.forgetPendingPayout('alice', 'new-withdrawal-2');
  assert.equal(await h.cache.readPendingPayout('alice'), null);
});

test('reads and competing writes serialize per account while another account remains usable', async () => {
  const h = harness(), writing = deferred();
  h.hooks.set = key => key === h.key('alice') ? writing.promise : undefined;
  const first = h.cache.rememberPendingPayout('alice', attempt()); await settle();
  let readFinished = false;
  const read = h.cache.readPendingPayout('alice').then(result => { readFinished = true; return result; });
  const conflict = assert.rejects(h.cache.rememberPendingPayout('alice', attempt('competing-key-2')), /pending withdrawal/);
  await h.cache.rememberPendingPayout('bob', attempt('bob-withdrawal-1'));
  assert.equal((await h.cache.readPendingPayout('bob')).idempotencyKey, 'bob-withdrawal-1');
  assert.equal(readFinished, false, 'A read cannot observe absence while its durable write is pending');
  writing.resolve(); await first; await conflict;
  assert.deepEqual(plain(await read), attempt());
  assert.equal(h.calls.filter(call => call.operation === 'set' && call.key === h.key('alice')).length, 1);
});

test('invalid attempts and account identifiers are rejected before secure storage is accessed', async () => {
  const h = harness();
  for (const value of [null, [], {}, { ...attempt(), extra: true }, ...[
    { amountPaise: 0 }, { amountPaise: 1.5 }, { amountPaise: '50000' }, { amountPaise: 100000001 },
    { payoutAddress: '  ' }, { payoutAddress: 'ab' }, { payoutAddress: 'x'.repeat(201) },
    { idempotencyKey: 'short' }, { idempotencyKey: 'bad/key-1' }, { idempotencyKey: 'x'.repeat(101) },
  ].map(patch => ({ ...attempt(), ...patch }))]) await assert.rejects(h.cache.rememberPendingPayout('alice', value), /withdrawal attempt/);
  for (const id of ['', '../alice', 'alice.bob', 'a'.repeat(101), null, undefined]) {
    await assert.rejects(h.cache.readPendingPayout(id), /signed-in account/);
    await assert.rejects(h.cache.rememberPendingPayout(id, attempt()), /signed-in account/);
    await assert.rejects(h.cache.forgetPendingPayout(id, attempt().idempotencyKey), /signed-in account/);
  }
  await assert.rejects(h.cache.forgetPendingPayout('alice', 'short'), /attempt key/);
  assert.equal(h.calls.length, 0);
});

test('malformed stored recovery never becomes an empty state or gets silently replaced', async () => {
  const h = harness();
  for (const raw of ['', '{bad-json', 'null', '[]', '{}', ...[
    { ...attempt(), amountPaise: '50000' }, { ...attempt(), amountPaise: -1 },
    { ...attempt(), idempotencyKey: 'short' }, { ...attempt(), unexpected: 'field' },
  ].map(value => JSON.stringify(value))]) {
    h.disk.set(h.key('alice'), raw);
    await assert.rejects(h.cache.readPendingPayout('alice'), /withdrawal attempt/);
    await assert.rejects(h.cache.rememberPendingPayout('alice', attempt()), /withdrawal attempt/);
    await assert.rejects(h.cache.forgetPendingPayout('alice', attempt().idempotencyKey), /withdrawal attempt/);
    assert.equal(h.disk.get(h.key('alice')), raw);
  }
  assert.equal(h.calls.filter(call => call.operation !== 'get').length, 0);
});

test('read, write and delete failures reach the caller and do not poison future recovery', async () => {
  const h = harness(), failure = new Error('SecureStore unavailable');
  h.hooks.get = () => { throw failure; };
  for (const work of [() => h.cache.readPendingPayout('alice'), () => h.cache.rememberPendingPayout('alice', attempt()), () => h.cache.forgetPendingPayout('alice', attempt().idempotencyKey)]) {
    await assert.rejects(work(), error => error === failure);
  }
  assert.equal(h.calls.filter(call => call.operation !== 'get').length, 0);
  delete h.hooks.get;
  h.hooks.set = () => { throw failure; };
  await assert.rejects(h.cache.rememberPendingPayout('alice', attempt()), error => error === failure);
  assert.equal(await h.cache.readPendingPayout('alice'), null, 'A failed durable write is never cached as successful');
  delete h.hooks.set;
  await h.cache.rememberPendingPayout('alice', attempt());
  h.hooks.delete = () => { throw failure; };
  await assert.rejects(h.cache.forgetPendingPayout('alice', attempt().idempotencyKey), error => error === failure);
  assert.deepEqual(plain(await h.cache.readPendingPayout('alice')), attempt(), 'Failed cleanup retains recovery data');
  delete h.hooks.delete;
  await h.cache.forgetPendingPayout('alice', attempt().idempotencyKey);
  assert.equal(await h.cache.readPendingPayout('alice'), null);
});
