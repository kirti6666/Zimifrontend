/* Production WebView composer regressions. Server messages are fixtures;
   this test never records audio, sends a real message or contacts an account. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const id = suffix => `507f1f77bcf86cd7994390${suffix}`;
const mira = { id: id('11'), name: 'Mira North', role: 'host', serverRole: 'host', category: 'Music', online: true, verified: true, availableForCall: true, ratePerMin: 0 };
const asha = { ...mira, id: id('12'), name: 'Asha Sen' };
const member = { user: { id: id('01'), name: 'Member', role: 'sender', serverRole: 'user', hostStatus: 'none', isPhoneVerified: true }, balance: 1000, verification: 'none', requiresOnboarding: false };
const longText = Array.from({ length: 25 }, (_, index) => `Line ${index + 1}: a message that wraps naturally.`).join('\n');
const capture = process.env.CHAT_COMPOSER_SCREENSHOTS === '1';
const artifacts = path.join(root, 'artifacts', 'chat-composer'); // artifacts/* is ignored.
const checks = [], screenshots = [], metrics = [];
const close = (actual, expected, label, tolerance = 1) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}px, got ${actual}px`);
const receive = (page, type, data) => page.evaluate(message => Native.receive(message), { type, data });
const sent = (page, type = 'chat.send') => page.evaluate(kind => __sent.filter(message => message.type === kind).map(message => message.data), type);

async function settle(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function openPeer(page, peer, canSend = true) {
  await page.evaluate(value => zcOpen(value), peer.id);
  await receive(page, 'data.thread', { with: peer.id, canSend, messages: [] });
  await page.locator('textarea#ti').waitFor();
  await settle(page);
}
async function geometry(page) {
  return page.evaluate(() => {
    const textarea = document.getElementById('ti'), field = document.querySelector('.zc-composer-field'), composer = document.querySelector('.zc-composer');
    const add = composer.querySelector('[aria-label="Add a photo or emoji"]'), gift = composer.querySelector('[aria-label="Gift"]'), action = composer.querySelector('.zc-composer-send');
    const box = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const css = getComputedStyle(textarea);
    return {
      viewport: { width: innerWidth, height: innerHeight }, textarea: box(textarea), field: box(field), composer: box(composer), add: box(add), gift: box(gift), action: box(action),
      tag: textarea.tagName, overflowY: css.overflowY, scrollHeight: textarea.scrollHeight, clientHeight: textarea.clientHeight,
      documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      addInside: field.contains(add), giftInside: field.contains(gift), actionOutside: !field.contains(action),
      actionLabel: action.getAttribute('aria-label'), actionCount: composer.querySelectorAll('.zc-composer-send').length,
      focused: document.activeElement === textarea, color: css.color,
    };
  });
}
function targets(value, label) {
  assert.equal(value.tag, 'TEXTAREA', `${label}: actual multiline field`);
  assert.equal(value.actionCount, 1, `${label}: a single Send/Record action`);
  assert.equal(value.addInside, true, `${label}: attachment belongs to the shared field`);
  assert.equal(value.giftInside, true, `${label}: Gift belongs to the shared field`);
  assert.equal(value.actionOutside, true, `${label}: Send/Record is outside the field`);
  close(value.add.width, 44, `${label}: attachment width`); close(value.add.height, 44, `${label}: attachment height`);
  close(value.gift.width, 44, `${label}: Gift width`); close(value.gift.height, 44, `${label}: Gift height`);
  close(value.action.width, 48, `${label}: Send/Record width`); close(value.action.height, 48, `${label}: Send/Record height`);
  assert.equal(value.documentOverflow, false, `${label}: no horizontal document overflow`);
  for (const [name, rect] of Object.entries({ textarea: value.textarea, add: value.add, gift: value.gift, action: value.action })) {
    assert.ok(rect.x >= -1 && rect.right <= value.viewport.width + 1, `${label}: ${name} stays inside viewport horizontally`);
    assert.ok(rect.y >= -1 && rect.bottom <= value.viewport.height + 1, `${label}: ${name} stays above the keyboard/viewport bottom`);
  }
  assert.ok(value.add.right <= value.textarea.x + 1, `${label}: attachment does not overlap text`);
  assert.ok(value.textarea.right <= value.gift.x + 1, `${label}: Gift does not overlap text`);
  assert.ok(value.field.right <= value.action.x + 1, `${label}: separate action does not overlap the field`);
}
async function shot(page, name) {
  if (!capture) return;
  fs.mkdirSync(artifacts, { recursive: true });
  const filename = path.join(artifacts, `${name}.png`);
  await page.screenshot({ path: filename }); screenshots.push(filename);
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(7000); page.setDefaultNavigationTimeout(40000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/^https?:\/\//, route => route.abort());
    await page.addInitScript(() => {
      window.__sent = []; window.__mediaRequests = 0;
      window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) };
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { __mediaRequests++; throw new Error('Unexpected media capture in a text-composer test'); } } });
    });
    await page.goto(pathToFileURL(path.join(root, 'assets', 'aurora.html')).href + '?role=sender');
    await receive(page, 'session', member);
    await receive(page, 'data.home', { hosts: [mira, asha], stage: [], featured: null, total: 2, page: 1, categories: ['Music'], availableCount: 2 });
    await receive(page, 'data.catalog', { gifts: [], packs: [], paymentsAvailable: false });
    await openPeer(page, mira);
    const input = page.locator('textarea#ti'), action = page.locator('.zc-composer-send');
    let value = await geometry(page); targets(value, 'empty composer');
    close(value.textarea.height, 44, 'Empty textarea height');
    assert.equal(value.actionLabel, 'Record voice message');
    assert.equal(await page.getByRole('button', { name: 'Gift', exact: true }).count(), 1, 'Gift keeps its accessible name');
    checks.push('44px multiline field, in-field44px attachment/Gift and separate48px action');

    // Focus must have an actual visual effect, not only a focused DOM node.
    await input.evaluate(element => element.blur());
    const unfocused = await page.locator('.zc-composer-field').evaluate(element => { const css = getComputedStyle(element); return { border: css.borderColor, background: css.backgroundColor, outline: css.outlineColor + css.outlineWidth }; });
    await input.focus();
    await page.waitForFunction(before => { const css = getComputedStyle(document.querySelector('.zc-composer-field')); return css.borderColor !== before.border || css.backgroundColor !== before.background || css.outlineColor + css.outlineWidth !== before.outline; }, unfocused);
    assert.equal(await page.locator('.zc-composer-field').evaluate(element => element.matches(':focus-within')), true);
    checks.push('visible focus feedback');

    await input.fill('First line\nSecond line\nThird line'); await settle(page);
    value = await geometry(page);
    assert.ok(value.textarea.height > 44 && value.textarea.height <= 133, 'Newlines grow the textarea');
    assert.equal(value.actionLabel, 'Send message');
    await input.fill(longText); await settle(page); value = await geometry(page);
    close(value.textarea.height, 132, 'Normal viewport textarea cap');
    assert.ok(value.scrollHeight > value.clientHeight, 'Capped content scrolls inside the textarea');
    assert.ok(['auto', 'scroll'].includes(value.overflowY), 'The cap preserves access to long text');
    assert.ok(await input.evaluate(element => { element.scrollTop = element.scrollHeight; return element.scrollTop > 0; }), 'The last lines remain reachable');
    await shot(page, 'light-multiline');
    await input.fill(''); await settle(page); value = await geometry(page);
    close(value.textarea.height, 44, 'Clearing text restores initial height');
    assert.equal(value.actionLabel, 'Record voice message');
    await input.fill(' \n  ');
    assert.equal(await action.getAttribute('aria-label'), 'Record voice message', 'Whitespace does not turn Record into Send');
    checks.push('multiline growth, internal scrolling cap, reset and typing action switch');

    const beforeSend = (await sent(page)).length;
    await input.fill('First line'); await input.press('Shift+Enter'); await page.keyboard.insertText('Second line');
    assert.equal(await input.inputValue(), 'First line\nSecond line');
    assert.equal((await sent(page)).length, beforeSend, 'Shift+Enter inserts a newline without sending');
    await input.press('Enter');
    const messages = await sent(page), multiline = messages.at(-1);
    assert.equal(messages.length, beforeSend + 1); assert.equal(multiline.to, mira.id); assert.equal(multiline.text, 'First line\nSecond line'); assert.ok(multiline.clientId);
    assert.equal(await input.inputValue(), '');
    assert.equal(await page.evaluate(peer => Chats.drafts[peer], mira.id), '');
    await settle(page); close((await geometry(page)).textarea.height, 44, 'Sending collapses the textarea');
    assert.equal(await input.evaluate(element => element === document.activeElement), true, 'Send leaves the composer ready to type');
    checks.push('Shift+Enter newline and single Enter send with draft/height reset');

    await input.fill('नमस्ते composer');
    const imeBefore = (await sent(page)).length;
    await input.evaluate(element => {
      element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'नमस्ते' }));
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, keyCode: 13, bubbles: true, cancelable: true }));
      element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'नमस्ते' }));
      const legacy = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
      Object.defineProperty(legacy, 'keyCode', { value: 229 }); element.dispatchEvent(legacy);
    });
    assert.equal((await sent(page)).length, imeBefore, 'Composing and Android229 Enter events never send');
    assert.equal(await input.inputValue(), 'नमस्ते composer');
    await input.press('Enter');
    assert.equal((await sent(page)).length, imeBefore + 1, 'A later explicit committed Enter sends once');
    checks.push('IME composition and Android229 protection');

    const miraDraft = '\nMira <check> & "words"\nAnother line', ashaDraft = 'Asha has a separate\nmultiline draft';
    await input.fill(miraDraft); await openPeer(page, asha);
    assert.equal(await input.inputValue(), '', 'A new peer does not inherit another person’s draft');
    close((await geometry(page)).textarea.height, 44, 'A new empty peer starts at44px');
    await input.fill(ashaDraft); await openPeer(page, mira);
    assert.equal(await input.inputValue(), miraDraft, 'The original multiline draft survives peer navigation and escaping');
    assert.ok((await geometry(page)).textarea.height > 44);
    await openPeer(page, asha); assert.equal(await input.inputValue(), ashaDraft);
    await openPeer(page, mira); assert.equal(await input.inputValue(), miraDraft);
    checks.push('independent per-peer drafts, preserved leading newline/HTML characters and restored sizing');

    await input.fill('Hello \nfriend');
    await input.evaluate(element => element.setSelectionRange(6, 6));
    await page.getByRole('button', { name: 'Add a photo or emoji', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Emoji', exact: true }).click();
    const emojiButton = page.getByRole('group', { name: 'Emoji', exact: true }).getByRole('button').first();
    assert.equal(await emojiButton.evaluate(element => element === document.activeElement), true, 'Opening emoji focuses the first visible choice');
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('group', { name: 'Emoji', exact: true }).isVisible(), false, 'Escape dismisses the emoji tray');
    assert.equal(await input.evaluate(element => element === document.activeElement), true, 'Escape restores textarea focus');
    await page.getByRole('button', { name: 'Add a photo or emoji', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Emoji', exact: true }).click();
    const emoji = await emojiButton.innerText(); await emojiButton.click();
    assert.equal(await input.inputValue(), 'Hello ' + emoji + '\nfriend');
    assert.equal(await input.evaluate(element => element === document.activeElement), true, 'Emoji insertion returns focus to the textarea');
    assert.equal(await page.evaluate(peer => Chats.drafts[peer], mira.id), 'Hello ' + emoji + '\nfriend');
    await page.locator('#tf').click({ position: { x: 2, y: 2 } });
    assert.equal(await page.getByRole('group', { name: 'Emoji', exact: true }).isVisible(), false, 'An outside click dismisses emoji');
    await page.getByRole('button', { name: 'Add a photo or emoji', exact: true }).click();
    await page.locator('#tf').click({ position: { x: 2, y: 2 } });
    assert.equal(await page.getByRole('menu', { name: 'Add to your message', exact: true }).isVisible(), false, 'An outside click dismisses attachment choices');
    checks.push('emoji caret insertion, keyboard focus/Escape, saved draft and outside dismissal');

    // maxlength counts UTF-16 code units: a two-unit emoji must be accepted
    // whole or rejected whole, including when replacing an existing selection.
    const limitText = 'a'.repeat(1999);
    await input.fill(limitText); await input.evaluate(element => element.setSelectionRange(element.value.length, element.value.length));
    await page.getByRole('button', { name: 'Add a photo or emoji', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Emoji', exact: true }).click();
    const pairEmoji = await emojiButton.innerText(); assert.equal(pairEmoji.length, 2, 'Boundary fixture is a full surrogate-pair emoji');
    await emojiButton.click();
    assert.equal(await input.inputValue(), limitText, 'An emoji that would exceed maxlength is rejected whole');
    assert.equal(await page.evaluate(peer => Chats.drafts[peer], mira.id), limitText);
    await input.evaluate(element => element.setSelectionRange(1998, 1999));
    await emojiButton.click();
    const boundaryText = 'a'.repeat(1998) + pairEmoji;
    assert.equal(await input.inputValue(), boundaryText, 'Replacing enough selection admits the whole emoji at exactly2000code units');
    assert.equal(await input.evaluate(element => element.selectionStart), 2000, 'The caret follows the complete emoji');
    assert.equal(await page.evaluate(peer => Chats.drafts[peer], mira.id), boundaryText);
    await page.keyboard.press('Escape'); await page.locator('#tf').click({ position: { x: 2, y: 2 } });
    checks.push('whole-emoji maxlength rejection and exact-budget selection replacement');

    const blockedDraft = 'Keep this message\nuntil sending is available';
    await input.fill(blockedDraft);
    await receive(page, 'data.thread', { with: mira.id, messages: [], canSend: false, sendDisabledReason: 'Sending is unavailable for this conversation.' });
    assert.equal(await action.isDisabled(), true); assert.equal(await page.getByRole('button', { name: 'Gift', exact: true }).isDisabled(), true);
    const blockedBefore = (await sent(page)).length;
    await input.evaluate(element => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    await page.evaluate(() => zcThreadSend());
    assert.equal((await sent(page)).length, blockedBefore, 'Keyboard and direct handlers both enforce authoritative send restrictions');
    assert.equal(await input.inputValue(), blockedDraft, 'Blocked sends retain the multiline draft');
    await receive(page, 'data.thread', { with: mira.id, messages: [], canSend: true });
    assert.equal(await action.isDisabled(), false); await action.click();
    assert.equal((await sent(page)).at(-1).text, blockedDraft);
    checks.push('blocked controls/handlers, retained draft and explicit send after recovery');
    await page.locator('#app-notice').waitFor({ state: 'detached', timeout: 9000 });

    // Keyboard emulation resizes the same WebView viewport; production gets
    // that resize from the native KeyboardShell rather than a second inset.
    for (const dark of [false, true]) for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 320, height: 350 }]) {
      const keyboard = viewport.height === 350, label = `${dark ? 'dark' : 'light'}-${viewport.width}x${viewport.height}`;
      await page.setViewportSize(viewport); await receive(page, 'keyboard', { open: keyboard });
      // A desktop pointer parked over Send after the previous click deliberately
      // applies the hover tint; inspect the normal mobile action palette here.
      await page.mouse.move(0, 0);
      await page.evaluate(value => ZimiThemes.setDark(value), dark);
      await input.fill(longText); await input.focus(); await settle(page);
      value = await geometry(page); targets(value, label);
      const cap = Math.min(132, Math.max(66, viewport.height * .25));
      close(value.textarea.height, cap, `${label}: viewport-aware long-text cap`);
      assert.ok(value.scrollHeight > value.clientHeight, `${label}: long draft remains internally scrollable`);
      const tokens = await input.evaluate(element => {
        const probe = document.createElement('span'); probe.style.color = 'var(--ink)'; probe.style.backgroundColor = 'var(--accent)'; document.body.appendChild(probe);
        const css = getComputedStyle(probe), result = { ink: css.color, accent: css.backgroundColor, actual: getComputedStyle(element).color, action: getComputedStyle(document.querySelector('.zc-composer-send')).backgroundColor };
        probe.remove(); return result;
      });
      assert.equal(tokens.actual, tokens.ink, `${label}: textarea follows the theme ink token`);
      assert.equal(tokens.action, tokens.accent, `${label}: action follows the theme accent token`);
      metrics.push({ label, ...value }); await shot(page, label);
    }
    checks.push('light/dark theme tokens,320px narrow layout and350px keyboard viewport');

    // Resize without a new input event: the same cached draft must reflow and
    // expand after the keyboard closes, then collapse again when it reopens.
    await page.setViewportSize({ width: 390, height: 844 }); await receive(page, 'keyboard', { open: false }); await settle(page);
    close((await geometry(page)).textarea.height, 132, 'Keyboard close recalculates the existing long draft');
    await page.setViewportSize({ width: 320, height: 350 }); await receive(page, 'keyboard', { open: true }); await settle(page);
    close((await geometry(page)).textarea.height, 87.5, 'Keyboard reopen recalculates without a typing event');
    checks.push('viewport-only resize recalculates the cached draft height');

    // Exercise real history and populated gift controls together with reply
    // context and emoji, which share the remaining keyboard viewport space.
    await page.setViewportSize({ width: 390, height: 844 }); await receive(page, 'keyboard', { open: false });
    await input.fill('');
    await receive(page, 'data.catalog', { gifts: [{ id: id('61'), name: 'Rose', emoji: '\uD83C\uDF39', coins: 99 }, { id: id('62'), name: 'Crown', emoji: '\uD83D\uDC51', coins: 999 }], packs: [], paymentsAvailable: false });
    const history = Array.from({ length: 40 }, (_, index) => ({ id: `composer-history-${index}`, mine: index % 2 === 0, kind: 'text', text: `History message ${index + 1}: keep this conversation visible.`, sequence: index + 1, createdAt: new Date(Date.now() - (40 - index) * 60000).toISOString(), status: 'read' }));
    await receive(page, 'data.thread', { with: mira.id, messages: history, canSend: true }); await settle(page);
    assert.equal(await page.getByRole('group', { name: 'Quick gifts', exact: true }).isVisible(), true, 'Populated quick gifts exist before keyboard compression');
    await input.fill(longText); await page.evaluate(() => zcStartReply('composer-history-5'));
    await page.getByRole('button', { name: 'Add a photo or emoji', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Emoji', exact: true }).click();
    for (const height of [420, 300, 420, 300]) {
      await page.setViewportSize({ width: 320, height }); await receive(page, 'keyboard', { open: true }); await settle(page);
      value = await geometry(page); const label = `reply-emoji-320x${height}`; targets(value, label);
      close(value.textarea.height, Math.min(132, Math.max(66, height * .25)), `${label}: long draft cap`);
      const cancel = await page.getByRole('button', { name: 'Cancel reply', exact: true }).boundingBox();
      assert.ok(cancel && cancel.y >= 0 && cancel.y + cancel.height <= height, `${label}: reply cancellation stays reachable`);
      assert.equal(await page.getByRole('group', { name: 'Emoji', exact: true }).isVisible(), true, `${label}: emoji choices stay visible`);
      assert.equal(await page.getByRole('group', { name: 'Quick gifts', exact: true }).isVisible(), false, `${label}: quick gifts yield keyboard space while Gift remains reachable`);
      assert.equal(await input.inputValue(), longText);
      metrics.push({ label, ...value }); await shot(page, label);
      await page.setViewportSize({ width: 390, height: 844 }); await receive(page, 'keyboard', { open: false }); await settle(page);
      targets(await geometry(page), `${label}: keyboard close recovery`);
      assert.equal(await page.getByRole('group', { name: 'Quick gifts', exact: true }).isVisible(), true, 'Closing the keyboard restores populated quick gifts');
    }
    checks.push('reply plus long draft and emoji fit300/420px keyboards with populated gifts and repeated resize recovery');

    await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Cancel reply', exact: true }).click();
    await input.fill('Keep <this draft>\nwhile new messages arrive');
    await input.evaluate(element => { element.focus(); element.setSelectionRange(5, 17); });
    const anchor = await page.locator('#tf').evaluate(element => {
      element.scrollTop = element.scrollHeight * .25;
      const top = element.getBoundingClientRect().top, row = [...element.querySelectorAll('.zc-msg')].find(item => item.getBoundingClientRect().bottom > top);
      return { id: row.id, offset: row.getBoundingClientRect().top - top };
    });
    const liveDraft = await input.inputValue();
    await receive(page, 'chat.message', { from: mira.id, id: 'composer-live-message', kind: 'text', text: 'An incoming update while you type.', sequence: 1000, createdAt: new Date().toISOString() }); await settle(page);
    assert.equal(await input.inputValue(), liveDraft, 'Live incoming messages preserve the unsent draft');
    assert.deepEqual(await input.evaluate(element => [element.selectionStart, element.selectionEnd, element === document.activeElement]), [5, 17, true], 'Live incoming messages preserve focused selection');
    const retainedAnchor = await page.evaluate(id => { const history = document.getElementById('tf'), row = document.getElementById(id); return row?.getBoundingClientRect().top - history.getBoundingClientRect().top; }, anchor.id);
    close(retainedAnchor, anchor.offset, 'A live message preserves the intentionally scrolled history anchor');
    checks.push('live incoming message preserves draft, caret selection, focus and scrolled history anchor');

    // Official support shares the field's base CSS but owns its128px resizer;
    // a private-composer default must not make its long draft inaccessible.
    await page.setViewportSize({ width: 390, height: 844 }); await receive(page, 'keyboard', { open: false });
    await page.evaluate(() => ZimiOfficialChat.open('chats'));
    const officialLoad = (await sent(page, 'official.load')).at(-1);
    await receive(page, 'data.official', { id: 'bingo-live-official', name: 'BinzoLive', official: true, verified: true, canSend: true, messages: [{ id: 'support:000000000000000000000001', kind: 'support', senderType: 'official', body: 'How can we help?', createdAt: new Date().toISOString(), read: true }], total: 1, hasMore: false, before: null, unreadCount: 0, requestId: officialLoad.requestId });
    const support = page.getByRole('textbox', { name: 'Message BinzoLive', exact: true });
    for (const [width, height, dark] of [[390, 844, false], [320, 350, true]]) {
      await page.setViewportSize({ width, height }); await page.evaluate(value => ZimiThemes.setDark(value), dark);
      await support.fill(longText); await support.focus(); await settle(page);
      const field = await support.evaluate(element => { const css = getComputedStyle(element), rect = element.getBoundingClientRect(); element.scrollTop = element.scrollHeight; return { height: rect.height, maxLength: element.maxLength, overflowY: css.overflowY, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, scrollTop: element.scrollTop, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }; });
      close(field.height, 128, 'Official support keeps its own long-draft128px cap'); assert.equal(field.maxLength, 4000);
      assert.ok(['auto', 'scroll'].includes(field.overflowY) && field.scrollHeight > field.clientHeight && field.scrollTop > 0, 'Official support long text remains internally scrollable');
      assert.ok(field.left >= 0 && field.right <= width && field.top >= 0 && field.bottom <= height, 'Official support field stays inside the viewport');
      const submit = page.getByRole('button', { name: 'Send message', exact: true }), rect = await submit.boundingBox();
      assert.ok(rect && rect.x >= 0 && rect.x + rect.width <= width && rect.y >= 0 && rect.y + rect.height <= height, 'Official support Send remains reachable');
      assert.equal(await submit.isDisabled(), false); assert.equal(await support.inputValue(), longText);
      await shot(page, `official-${dark ? 'dark' : 'light'}-${width}x${height}`);
    }
    checks.push('shared field CSS preserves official support long-draft128px cap, scrolling and reachable Send');
    assert.equal(await page.evaluate(() => __mediaRequests), 0, 'Typing/action switching never opens the microphone');
    assert.deepEqual(errors, [], 'The production composer has no uncaught browser exceptions');
    if (capture) fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify({ checks, metrics, screenshots }, null, 2));
    console.log('PASS chat composer: ' + checks.join('; '));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
