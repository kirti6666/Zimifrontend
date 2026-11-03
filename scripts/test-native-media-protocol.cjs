const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../src/native-media/protocol.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleObject = { exports: {} };
vm.runInNewContext('(function(exports,module){' + compiled + '\n})', {})(moduleObject.exports, moduleObject);
const { validNativeMediaRequest: valid, validNativeMediaLayout: validLayout } = moduleObject.exports;
const request = (action, data = {}, requestId = 1) => ({ requestId, action, data });
const slot = (kind = 'local') => ({ kind, x: 20, y: 40, width: 120, height: 160, radius: 10, fit: 'contain' });

test('native capture and controls accept only explicit, bounded requests', () => {
  for (const item of [request('prepare', { video: true }), request('prepare', { video: false }), request('controls', { camera: false, microphone: true }), request('stop'), request('flipCamera'), request('handoff', { callId: 'call_123' }), request('setPlaybackMuted', { muted: true })]) assert.equal(valid(item), true);
  for (const item of [request('prepare'), request('prepare', { video: 'yes' }), request('controls', { camera: true }), request('stop', { arbitrary: true }), request('stop', {}, 0), request('prepare', { video: true }, Infinity), request('connect', { callId: 'untrusted_call' }), request('signal'), request('config')]) assert.equal(valid(item), false, JSON.stringify(item));
});

test('native beauty permits only licensed setter names and validated argument ranges', () => {
  assert.equal(valid(request('beauty', { enabled: true, settings: [['setSmoothing', [0.6]], ['setBrightness', [-0.25]], ['setBeautySkinOnly', [true]], ['setSmoothingStyle', [0]]] })), true);
  for (const commands of [[['setSmoothing', [2]]], [['setBrightness', [-2]]], [['setSmoothing', [NaN]]], [['setFilter', [1]]], [['setBeautySkinOnly', [1]]], [['setClarity', [0.5, 0.6]]], [['setSmoothingStyle', [0.5]]], Array(21).fill(['setClarity', [0.2]])]) assert.equal(valid(request('beauty', { enabled: true, settings: commands })), false);
});

test('native video surfaces reject malformed, repeated and unbounded geometry', () => {
  assert.equal(validLayout({ width: 390, height: 844, slots: [slot(), slot('remote')] }), true);
  assert.equal(validLayout({ width: 390, height: 844, slots: [] }), true);
  assert.equal(validLayout({ width: 390, height: 844, slots: [], fullScreen: true }), true);
  assert.equal(validLayout({ width: 390, height: 844, slots: [], fullScreen: false }), true);
  assert.equal(validLayout({ width: 390, height: 844, slots: [], fullScreen: 'true' }), false);
  for (const item of [{ width: 0, height: 844, slots: [] }, { width: 390, height: Infinity, slots: [] }, { width: 390, height: 844, slots: [slot(), slot()] }, { width: 390, height: 844, slots: [{ ...slot(), x: NaN }] }, { width: 390, height: 844, slots: [{ ...slot(), width: -1 }] }, { width: 390, height: 844, slots: [{ ...slot(), kind: 'camera' }] }, { width: 390, height: 844, slots: [{ ...slot(), fit: 'fill' }] }, { width: 390, height: 844, slots: [{ ...slot(), radius: 100000 }] }]) assert.equal(validLayout(item), false);
});
