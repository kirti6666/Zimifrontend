// Real picker functions with isolated chooser/compression fixtures; no photos are sent.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../web/chats.js'), 'utf8');
const start = source.indexOf('function zcPickPhoto('), end = source.indexOf("Native.on('chat.photoSent'", start);
assert.ok(start >= 0 && end > start, 'Load the actual picker implementation');
const code = source.slice(start, end);
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function harness() {
  const state = { v: 'thread', h: 'peer-1', user: { id: 'account-1' }, msgs: [{ id: 'original-1', kind: 'image', text: '', mine: false }] };
  const chats = { reply: { id: 'original-1', mine: false, text: '', image: true }, drafts: { 'peer-1': 'Unrelated text draft' } };
  const input = { value: '', files: [], clicks: 0, click() { this.clicks++; } };
  const sent = [], notices = [], prepared = [];
  const options = { blocked: '', compress: async () => 'data:image/jpeg;base64,fixture' };
  const context = vm.createContext({ S: state, Chats: chats, document: { getElementById: () => input }, crypto: { randomUUID: () => 'local-fixture' },
    zcThreadAttach() {}, zcThreadBlocked: () => options.blocked,
    zcFind: id => state.msgs.find(message => message.id === id),
    zcCanReply: message => !!message?.id && !message.local && !message.deleted && !['sending', 'failed'].includes(message.status) && !options.blocked,
    appNotice: message => notices.push(message), obReadPhoto: async file => { prepared.push(file); return options.compress(file); },
    Native: { send: (type, data) => sent.push({ type, data: plain(data) }) }, zcPaintContext() {}, paint() {},
  });
  vm.runInContext(code, context);
  const pick = () => context.zcPickPhoto();
  const select = (target = input) => { target.files = [{ name: 'fixture.png', type: 'image/png' }]; return context.zcSendPhoto(target); };
  return { state, chats, input, sent, notices, options, prepared, pick, select, context };
}

test('launch binds original peer/account/reply and selection preserves an unrelated composer draft', async () => {
  const h = harness(); h.pick();
  assert.equal(h.input.clicks, 1); assert.equal(h.input.zcPhotoIntent.to, 'peer-1'); assert.equal(h.input.zcPhotoIntent.owner, h.state.user);
  h.chats.reply = null; // A context redraw must not turn this intended reply into an ordinary photo.
  h.state.msgs[0].text = 'Updated original';
  await h.select();
  assert.deepEqual(h.sent, [{ type: 'chat.photo', data: { to: 'peer-1', photo: 'data:image/jpeg;base64,fixture', replyTo: 'original-1' } }]);
  assert.equal(h.state.msgs.at(-1).reply.text, 'Updated original', 'The optimistic quote reflects the current original');
  assert.equal(h.chats.drafts['peer-1'], 'Unrelated text draft'); assert.equal(h.input.zcPhotoIntent, undefined);
  await h.select(); assert.equal(h.sent.length, 1, 'One chooser intent is consumed once');
});

test('choosing without a launch intent or on another input cannot send', async () => {
  const h = harness(); await h.select(); assert.equal(h.sent.length, 0); assert.equal(h.prepared.length, 0);
  h.pick(); await h.select({ value: '', files: [] }); assert.equal(h.sent.length, 0);
  await h.select(); assert.equal(h.sent.length, 1, 'The captured original input owns the selection');
});

test('cancelling leaves text and selected reply intact, and a later launch captures fresh intent', async () => {
  const h = harness(); h.pick(); h.input.oncancel();
  assert.equal(h.input.zcPhotoIntent, undefined); assert.equal(h.chats.reply.id, 'original-1');
  assert.equal(h.chats.drafts['peer-1'], 'Unrelated text draft'); assert.equal(h.sent.length, 0);
  h.pick(); h.input.files = []; await h.context.zcSendPhoto(h.input);
  assert.equal(h.input.zcPhotoIntent, undefined); assert.equal(h.chats.reply.id, 'original-1');
  h.chats.reply = null; h.pick(); await h.select(); assert.equal(h.sent[0].data.replyTo, undefined);
});

test('new reply choices during compression cannot change the chosen photo reply or get cleared', async () => {
  const h = harness(), compression = deferred(); h.options.compress = () => compression.promise;
  h.pick(); const work = h.select(); h.chats.reply = { id: 'other-original', text: 'A different reply' };
  compression.resolve('data:image/jpeg;base64,fixture'); await work;
  assert.equal(h.sent[0].data.replyTo, 'original-1'); assert.equal(h.chats.reply.id, 'other-original');
});

for (const stage of ['selection', 'compression']) {
  for (const change of ['peer', 'view', 'account', 'same-account-new-session']) test(`${change} change during ${stage} cancels the pending photo`, async () => {
    const h = harness(), compression = deferred();
    h.options.compress = () => compression.promise; h.pick();
    const work = stage === 'compression' ? h.select() : null;
    if (change === 'peer') h.state.h = 'peer-2';
    if (change === 'view') h.state.v = 'chats';
    if (change === 'account') h.state.user = { id: 'account-2' };
    if (change === 'same-account-new-session') h.state.user = { id: 'account-1' };
    if (work) { compression.resolve('data:image/jpeg;base64,fixture'); await work; }
    else await h.select();
    assert.equal(h.sent.length, 0); assert.equal(h.state.msgs.length, 1); assert.equal(h.notices.length, 0, 'No stale notice leaks into another screen/account');
    assert.equal(h.prepared.length, stage === 'selection' ? 0 : 1);
  });
  for (const change of ['deleted', 'removed', 'blocked', 'failed', 'local']) test(`${change} original during ${stage} cannot send an unquoted or unauthorized photo`, async () => {
    const h = harness(), compression = deferred(); h.options.compress = () => compression.promise; h.pick();
    const work = stage === 'compression' ? h.select() : null;
    if (change === 'deleted') { h.state.msgs[0].deleted = true; h.chats.reply = null; }
    if (change === 'removed') { h.state.msgs.length = 0; h.chats.reply = null; }
    if (change === 'blocked') h.options.blocked = 'This conversation is read-only.';
    if (change === 'failed') h.state.msgs[0].status = 'failed';
    if (change === 'local') h.state.msgs[0].local = true;
    if (work) { compression.resolve('data:image/jpeg;base64,fixture'); await work; }
    else await h.select();
    assert.equal(h.sent.length, 0); assert.match(h.notices.at(-1), /read-only|no longer available/);
    assert.equal(h.prepared.length, stage === 'selection' ? 0 : 1);
  });
}

test('blocked threads and unavailable reply originals cannot launch the native chooser', () => {
  const h = harness(); h.options.blocked = 'Wait for a reply.'; h.pick(); assert.equal(h.input.clicks, 0);
  h.options.blocked = ''; h.state.msgs[0].deleted = true; h.pick(); assert.equal(h.input.clicks, 0); assert.equal(h.input.zcPhotoIntent, undefined);
});

test('image preparation failure preserves reply and draft and sends no photo', async () => {
  const h = harness(); h.options.compress = async () => { throw new Error('Fixture image could not be read'); };
  h.pick(); await h.select(); assert.equal(h.sent.length, 0); assert.equal(h.chats.reply.id, 'original-1');
  assert.equal(h.chats.drafts['peer-1'], 'Unrelated text draft'); assert.match(h.notices[0], /could not be read/);
});
