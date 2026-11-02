const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/call-recovery.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function fixture() {
  const timers = new Map(), requests = [], ended = [];
  let id = 0, snapshot = { key: 'account:document:generation', callId: 'call-one', available: true };
  const exports = {};
  vm.runInNewContext(source, { exports, setTimeout: (work, delay) => { timers.set(++id, { work, delay }); return id; }, clearTimeout: timer => timers.delete(timer) });
  const recovery = exports.createCallRecovery({ snapshot: () => ({ ...snapshot }), read: callId => { const request = { callId, ...deferred() }; requests.push(request); return request.promise; }, ended: state => { ended.push(state); snapshot.callId = undefined; } });
  return { timers, requests, ended, recovery, set: next => { snapshot = { ...snapshot, ...next }; }, tick: () => { const [timer, { work, delay }] = timers.entries().next().value; timers.delete(timer); assert.equal(delay, 5000); work(); } };
}

test('call recovery discovers a missed remote hangup without a reconnect and stops polling', async () => {
  const h = fixture(); h.recovery.sync(); assert.equal(h.requests.length, 0); h.tick();
  h.requests[0].resolve({ callId: 'call-one', status: 'accepted' }); await settle();
  assert.equal(h.ended.length, 0); assert.equal(h.timers.size, 1);
  h.tick(); h.requests[1].resolve({ callId: 'call-one', status: 'ended', coins: 7 }); await settle();
  assert.deepEqual(h.ended, [{ callId: 'call-one', status: 'ended', coins: 7 }]);
  assert.equal(h.timers.size, 0); h.recovery.sync(true); assert.equal(h.requests.length, 2); h.recovery.close();
});

test('call recovery coalesces reconnects and survives failed or unrelated reads', async () => {
  const h = fixture(); h.recovery.sync(); h.recovery.sync(true); h.recovery.sync(true);
  assert.equal(h.requests.length, 1); assert.equal(h.timers.size, 0);
  h.requests[0].reject(new Error('Temporarily offline')); await settle(); assert.equal(h.ended.length, 0);
  h.tick(); h.requests[1].resolve({ callId: 'some-other-call', status: 'ended' }); await settle();
  assert.equal(h.ended.length, 0); h.tick(); h.requests[2].resolve({ callId: 'call-one', status: 'missed' }); await settle();
  assert.equal(h.ended.length, 1); h.recovery.close();
});

test('late terminal reads cannot end a different call, identity or document', async () => {
  for (const change of [{ callId: 'call-two' }, { key: 'new-account' }, { key: 'new-document' }, { available: false }]) {
    const h = fixture(); h.recovery.sync(true); h.set(change); h.requests[0].resolve({ callId: 'call-one', status: 'ended' }); await settle();
    assert.equal(h.ended.length, 0); h.recovery.close(); assert.equal(h.timers.size, 0);
  }
  const h = fixture(); h.recovery.sync(true); h.set({ callId: 'call-two' }); h.recovery.sync(true);
  h.requests[0].resolve({ callId: 'call-one', status: 'ended' }); await settle(); assert.equal(h.ended.length, 0);
  h.requests[1].resolve({ callId: 'call-two', status: 'ended' }); await settle(); assert.equal(h.ended[0].callId, 'call-two'); h.recovery.close();
});

test('reset and close invalidate in-flight work and prevent late cleanup events', async () => {
  for (const action of ['reset', 'close']) {
    const h = fixture(); h.recovery.sync(true); h.recovery[action]();
    h.requests[0].resolve({ callId: 'call-one', status: 'ended' }); await settle();
    assert.equal(h.ended.length, 0); assert.equal(h.timers.size, 0); h.recovery.close();
  }
});
