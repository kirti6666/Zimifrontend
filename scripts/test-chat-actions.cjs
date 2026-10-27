// Reply, edit and delete on chat messages, and the "+" menu for photos and emoji.
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const id = suffix => `507f1f77bcf86cd7994390${suffix}`;
const mira = { id: id('11'), name: 'Mira North', role: 'host', category: 'Music', online: true, verified: true, availableForCall: true, ratePerMin: 0 };
const member = { user: { id: id('01'), name: 'Member', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false, isPhoneVerified: true }, balance: 0, verification: 'none', requiresOnboarding: false };
const at = minutes => new Date(Date.now() - minutes * 60000).toISOString();

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => { window.__sent = []; window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) }; });
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href + '?role=sender');
    const receive = (type, data) => page.evaluate(message => Native.receive(message), { type, data });
    const last = type => page.evaluate(value => __sent.filter(message => message.type === value).at(-1)?.data, type);
    const bubble = messageId => page.locator(`#zc-m-${messageId}`);
    const menu = page.getByRole('dialog', { name: 'Message options' });
    const options = async () => menu.getByRole('button').allInnerTexts();
    await receive('session', member);
    await receive('data.home', { hosts: [mira], stage: [], featured: mira, total: 1, page: 1, categories: ['Music'], availableCount: 1 });
    await page.evaluate(person => zcOpen(person), mira.id);
    await receive('data.thread', { with: mira.id, canSend: true, messages: [
      { id: 'm1', mine: false, text: 'Are you live tonight?', createdAt: at(30) },
      { id: 'm2', mine: true, text: 'See you soon', createdAt: at(20), status: 'read' },
      { id: 'm3', mine: false, text: 'Bring your requests', createdAt: at(10) },
      { id: 'm5', mine: true, text: 'Remove this only from my view', createdAt: at(5), status: 'sent' },
    ] });

    // Handlers enforce the same ownership rules as the visible menu.
    await page.evaluate(() => { zcStartEdit('m1'); zcDeleteMessage('m1', true); });
    assert.equal(await page.evaluate(() => Chats.editing), null, 'An incoming message cannot be edited directly');
    assert.equal(await last('chat.delete'), undefined, 'An incoming message cannot be deleted for everyone directly');
    assert.equal(await bubble('m1').locator('.zc-deleted').count(), 0, 'A forbidden delete does not change the visible message');

    await bubble('m1').locator('[aria-haspopup="dialog"]').press('Enter');
    assert.deepEqual(await options(), ['Reply', 'Delete for me', 'Cancel'], "Someone else's message: reply or remove it from your view");
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'detached' });
    await bubble('m2').locator('[aria-haspopup="dialog"]').press('Enter');
    assert.deepEqual(await options(), ['Reply', 'Edit', 'Delete for everyone', 'Delete for me', 'Cancel'], 'Your own message can also be edited or deleted for both');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await menu.getByRole('button', { name: 'Cancel', exact: true }).evaluate(button => button === document.activeElement), true, 'Focus stays inside the action menu');
    await page.keyboard.press('Tab');
    assert.equal(await menu.getByRole('button', { name: 'Reply', exact: true }).evaluate(button => button === document.activeElement), true);
    await page.evaluate(() => r());
    await menu.waitFor({ state: 'detached' });
    await bubble('m2').locator('[aria-haspopup="dialog"]').press('Enter');
    await menu.waitFor({ state: 'visible' });
    await menu.getByRole('button', { name: 'Cancel' }).click();

    // Reply
    await bubble('m1').locator('[aria-haspopup="dialog"]').press('Enter');
    await menu.getByRole('button', { name: 'Reply' }).click();
    await page.getByText('Replying to Mira').waitFor();
    await page.screenshot({ path: path.join(os.tmpdir(), 'zimi-chat-reply.png') });
    await page.locator('#ti').fill('Yes, at 9!');
    await page.locator('#ti').press('Enter');
    assert.deepEqual(await last('chat.send'), { to: mira.id, text: 'Yes, at 9!', replyTo: 'm1' });
    assert.equal(await page.locator('.zc-context').count(), 0, 'The reply bar closes after sending');
    const reply = page.locator('.zc-msg.mine').last();
    assert.match(await reply.locator('.zc-quote').innerText(), /Mira\s*Are you live tonight\?/);
    assert.equal(await reply.locator('[aria-haspopup="dialog"]').count(), 0, 'A message waits for its server ID before it has options');
    await receive('chat.sent', { to: mira.id, sent: 'Yes, at 9!', text: 'Yes, at 9!', id: 'm4', inCall: false });
    await bubble('m4').locator('[aria-haspopup="dialog"]').waitFor();

    // Edit
    await bubble('m2').locator('[aria-haspopup="dialog"]').press('Enter');
    await menu.getByRole('button', { name: 'Edit' }).click();
    await page.getByText('Edit message').waitFor();
    assert.equal(await page.locator('#ti').inputValue(), 'See you soon');
    await page.locator('#ti').fill('See you at 9');
    await page.locator('#ti').press('Enter');
    assert.deepEqual(await last('chat.edit'), { to: mira.id, id: 'm2', text: 'See you at 9' });
    assert.equal((await last('chat.send')).text, 'Yes, at 9!', 'Saving an edit sends no new message');
    assert.match(await bubble('m2').innerText(), /See you at 9[\s\S]*Edited/);

    // Delete for everyone, delete for me, and a delete by the other person
    await bubble('m2').locator('[aria-haspopup="dialog"]').press('Enter');
    await menu.getByRole('button', { name: 'Delete for everyone' }).click();
    assert.deepEqual(await last('chat.delete'), { to: mira.id, id: 'm2', everyone: true });
    await bubble('m2').getByText('You deleted this message').waitFor();
    assert.equal(await bubble('m2').getByRole('button').count(), 0, 'Deleted messages have no options');
    await bubble('m5').locator('[aria-haspopup="dialog"]').press('Enter');
    await menu.getByRole('button', { name: 'Delete for me', exact: true }).click();
    assert.deepEqual(await last('chat.delete'), { to: mira.id, id: 'm5', everyone: false }, 'Your own message can be removed only from your view');
    await bubble('m5').waitFor({ state: 'detached' });
    await bubble('m1').locator('[aria-haspopup="dialog"]').press('Enter');
    await menu.getByRole('button', { name: 'Delete for me' }).click();
    assert.deepEqual(await last('chat.delete'), { to: mira.id, id: 'm1', everyone: false });
    await bubble('m1').waitFor({ state: 'detached' });
    assert.match(await bubble('m4').locator('.zc-quote').innerText(), /Are you live tonight\?/, 'A quote keeps its text when the original is only removed from your view');
    await receive('chat.updated', { with: mira.id, message: { id: 'm3', mine: false, text: '', deleted: true, kind: 'text' } });
    await bubble('m3').getByText('This message was deleted').waitFor();

    // "+" holds Photo and Emoji
    const add = page.getByRole('button', { name: 'Add a photo or emoji' });
    await add.click();
    assert.equal(await add.getAttribute('aria-expanded'), 'true');
    assert.deepEqual([await page.getByRole('menuitem').count(), await page.getByRole('menuitem', { name: 'Photo' }).count(), await page.getByRole('menuitem', { name: 'Emoji' }).count()], [2, 1, 1], '"+" holds exactly Photo and Emoji');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: 'Photo' }).click();
    assert.equal((await chooser).isMultiple(), false, 'Photo opens the photo picker');
    assert.equal(await page.locator('#zc-attach').isHidden(), true);
    await add.click();
    await page.getByRole('menuitem', { name: 'Emoji' }).click();
    await page.getByRole('group', { name: 'Emoji' }).waitFor();
    const composer = page.locator('.zc-composer-field');
    assert.equal(await composer.getByRole('button', { name: 'Add a photo or emoji', exact: true }).count(), 1, 'The attachment control sits inside the shared composer');
    assert.equal(await composer.getByRole('button', { name: 'Send a gift', exact: true }).count(), 1);
    assert.equal(await composer.getByRole('button', { name: 'Record voice message', exact: true }).count(), 1, 'An empty composer has one recording action');
    assert.equal(await composer.getByRole('button', { name: 'Send message', exact: true }).count(), 0);

    // Gifts sit above the composer; a tap picks the gift in the sheet and never spends coins by itself.
    const catalog = { gifts: [{ id: id('61'), name: 'Rose', emoji: '🌹', coins: 99 }, { id: id('62'), name: 'Crown', coins: 999, mediaUrl: 'https://media.example.test/crown.png' }], packs: [], paymentsAvailable: false };
    await receive('data.catalog', catalog);
    const strip = page.getByRole('group', { name: 'Send a gift' });
    assert.deepEqual(await strip.getByRole('button').allInnerTexts(), ['🌹\n99', '999'], 'Each gift shows its emoji or artwork and price');
    assert.equal(await strip.locator('img').getAttribute('src'), 'https://media.example.test/crown.png');
    await strip.getByRole('button', { name: 'Crown, 999 coins', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Send a gift', exact: true });
    await sheet.waitFor();
    assert.equal((await last('catalog.load')) !== undefined, true, 'Opening the sheet refreshes the catalog');
    await receive('data.catalog', catalog);
    assert.equal(await sheet.locator('[aria-pressed="true"]').innerText(), 'Crown\n999', 'The tapped gift is chosen in the sheet');
    assert.equal(await page.evaluate(() => Home.giftTo), mira.id);
    assert.equal(await page.evaluate(() => __sent.filter(message => message.type === 'gift.send').length), 0, 'Only the sheet sends gifts');
    assert.deepEqual(errors, []);
    console.log('PASS chat actions: options per message, reply with quote, edit with Edited label, delete for everyone and for me, live deletes, Photo/Emoji under +, and gifts above the composer');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
