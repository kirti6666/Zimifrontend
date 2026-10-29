/* Local browser checks. Reads web sources; no account or cloud storage is touched. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const account = (role = 'host') => ({ user: { id: '507f1f77bcf86cd799439011', name: 'Asha', city: 'Pune', about: 'Hello', role, hostStatus: role === 'host' ? 'approved' : 'none', avatarUrl: '', coverUrl: '' }, verification: role === 'host' ? 'verified' : 'none', requiresOnboarding: false });
const receive = (page, type, data) => page.evaluate(({ type, data }) => window.zimiReceive({ type, data }), { type, data });
const lastRequest = (page, type) => page.evaluate(type => window.__messages.filter(message => message.type === type).at(-1), type);

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.abort());
    await page.setContent('<main><div id="top"></div><div id="screen"></div><div id="nav"></div></main>');
    await page.addScriptTag({ content: 'window.ZIMI_DEMO=false;window.__messages=[];window.ReactNativeWebView={postMessage(json){window.__messages.push(JSON.parse(json))}};' });
    for (const file of ['bridge.js', 'onboarding.js', 'aurora-runtime.js', 'loading.js', 'post-create.js']) await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'web', file), 'utf8') });
    const rendering = await page.evaluate(() => {
      const avatar = 'https://media.example.test/creator.jpg?v=1&size=small', cover = 'https://media.example.test/cover.jpg';
      const h = hostFrom({ id: '507f1f77bcf86cd799439012', name: 'Riya <3 & friends', avatarUrl: avatar, coverUrl: cover });
      const section = document.createElement('section');
      section.innerHTML = card(h) + av(h, 40, 'none') + avc(h, 40) + profilePage(asProfile(h, true), h, false);
      const imageUrls = [...section.querySelectorAll('img')].map(image => image.getAttribute('src'));
      const person = personFrom({ id: '507f1f77bcf86cd799439013', name: 'Member', avatarUrl: avatar, coverUrl: cover });
      section.innerHTML = profilePage(asProfile(person, false), person, false);
      const memberImages = [...section.querySelectorAll('img')].map(image => image.getAttribute('src'));
      const unsafe = { ...h, avatarUrl: 'https://media.example.test/x" onerror="window.__xss=1', coverUrl: 'javascript:alert(1)' };
      section.innerHTML = card(unsafe) + av(unsafe, 40, 'none') + avc(unsafe, 40) + profilePage(asProfile(unsafe, true), unsafe, false);
      return { imageUrls, memberImages, unsafeImages: section.querySelectorAll('img').length, handlers: section.querySelectorAll('[onerror],script').length, fallback: !!section.querySelector('svg.art'), avatar, cover };
    });
    assert.deepEqual(rendering.imageUrls, [rendering.avatar, rendering.avatar, rendering.avatar, rendering.cover, rendering.avatar], 'Creator cards, list avatars and profiles render the real R2 images');
    assert.deepEqual(rendering.memberImages, [rendering.cover, rendering.avatar], 'Member profiles preserve media through the profile adapter');
    assert.equal(rendering.unsafeImages, 0); assert.equal(rendering.handlers, 0); assert.equal(rendering.fallback, true, 'Invalid media URLs use safe placeholder artwork');
    const photo = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 1800; canvas.height = 1400;
      const context = canvas.getContext('2d'); context.fillStyle = '#e30e88'; context.fillRect(0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png').split(',')[1];
    }), 'base64');
    await page.evaluate(account => { obApplyAccount(account); S.loggedIn = 1; go('editprofile'); }, account());
    await page.locator('#editname').fill('Asha New');
    await page.locator('input[onchange*="avatar"]').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: photo });
    await page.waitForFunction(() => !S.mediaPreparing && S.mediaDirty?.avatar);
    const compressed = await page.evaluate(() => S.avatarData);
    assert.ok(compressed.startsWith('data:image/jpeg;base64,'), 'Media selection compresses and normalizes photos before the native bridge');
    const size = await page.evaluate(source => new Promise(resolve => { const image = new Image(); image.onload = () => resolve([image.width,image.height]); image.src = source; }), compressed);
    assert.ok(Math.max(...size) <= 1200, 'Oversized image dimensions are resized for mobile uploads');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    const first = await lastRequest(page, 'profile.save');
    assert.equal(first.data.avatar, compressed); assert.equal(first.data.name, 'Asha New');
    assert.equal(await page.evaluate(() => S.v), 'editprofile', 'The editor waits for server confirmation');
    await receive(page, 'profile.error', { onboarding: false, requestId: first.data.requestId, message: 'Storage is unavailable. Try again.' });
    assert.equal(await page.evaluate(() => S.avatarData), compressed, 'A failed upload preserves the selected photo');
    assert.equal(await page.locator('#editname').inputValue(), 'Asha New');
    assert.equal(await page.getByRole('alert').textContent(), 'Storage is unavailable. Try again.');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    const retry = await lastRequest(page, 'profile.save');
    await receive(page, 'profile.saved', { onboarding: false, requestId: first.data.requestId, account: account() });
    assert.equal(await page.evaluate(() => S.profileSaving), true, 'A stale acknowledgement cannot complete a newer save');
    const saved = account(); saved.user.name = 'Asha New'; saved.user.avatarUrl = 'https://media.example.test/avatar.jpg'; saved.user.coverUrl = 'https://media.example.test/cover.jpg';
    await receive(page, 'profile.saved', { onboarding: false, requestId: retry.data.requestId, account: saved });
    assert.equal(await page.evaluate(() => S.avatarData), saved.user.avatarUrl);
    assert.equal(await page.evaluate(() => S.coverData), saved.user.coverUrl);
    assert.deepEqual(await page.evaluate(() => S.mediaDirty), {}, 'After save, previews use authenticated R2 URLs');

    await page.evaluate(() => ZimiPostCreate.open());
    await page.locator('input[onchange*="posts"]').setInputFiles({ name: 'post.png', mimeType: 'image/png', buffer: photo });
    await page.waitForFunction(() => !!S.postDraftData && !S.mediaPreparing);
    await page.locator('#postcaption').fill('A new moment');
    await page.getByRole('button', { name: 'Publish post', exact: true }).click();
    const publication = await lastRequest(page, 'media.post.create');
    assert.ok(publication.data.photo.startsWith('data:image/jpeg;base64,')); assert.equal(publication.data.caption, 'A new moment');
    assert.equal(await page.evaluate(() => S.postData.length), 0, 'An unconfirmed upload is not shown as a published post');
    await receive(page, 'post.error', { requestId: publication.data.requestId, message: 'Upload failed. Try again.' });
    assert.ok(await page.evaluate(() => S.postDraftData)); assert.equal(await page.locator('#postcaption').inputValue(), 'A new moment');
    await page.getByRole('button', { name: 'Publish post', exact: true }).click();
    const secondPublication = await lastRequest(page, 'media.post.create');
    const post = { id: 'post-id', mediaUrl: 'https://media.example.test/post.jpg', kind: 'photo', caption: 'A new moment' };
    await receive(page, 'post.saved', { requestId: publication.data.requestId, post });
    assert.equal(await page.evaluate(() => S.postPublishing), true);
    await receive(page, 'post.saved', { requestId: secondPublication.data.requestId, post });
    assert.deepEqual(await page.evaluate(() => S.postData), [post.mediaUrl]);
    assert.equal(await page.evaluate(() => S.postDraftData), '');

    await page.evaluate(account => { obApplyAccount(account); go('editprofile'); }, account('sender'));
    assert.equal(await page.locator('input[onchange*="posts"]').count(), 0, 'Post creation is separate from profile editing');
    await page.locator('input[onchange*="avatar"]').setInputFiles({ name: 'not-an-image.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
    await page.waitForFunction(() => !S.mediaPreparing && !!S.mediaError);
    assert.match(await page.getByRole('alert').textContent(), /image file/);
    await page.evaluate(() => { S.postDraftData = 'private draft'; S.mediaDirty = { avatar: true }; obResetSession(); });
    assert.equal(await page.evaluate(() => S.postDraftData), '');
    assert.deepEqual(await page.evaluate(() => S.mediaDirty), {});
    assert.deepEqual(errors, []);
    console.log('PASS: R2 images in creator/member cards and profiles, safe URL fallbacks, compression, saved acknowledgements, upload recovery, stale responses, creator publishing and logout cleanup.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
