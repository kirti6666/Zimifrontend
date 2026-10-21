// Photo-viewer browser fixtures. Images, accounts and download replies stay local.
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const id = suffix => `507f1f77bcf86cd7994390${suffix}`;
const photoIds = { own: id('51'), incoming: id('52'), pending: 'local-photo-pending', invalid: id('54'), deleted: id('55') };
const imageUrl = 'https://photos.fixture.test/landscape.png';
const portraitImageUrl = 'https://photos.fixture.test/portrait.png';
const retryImageUrl = 'https://photos.fixture.test/retry.png';
const mira = { id: id('11'), name: 'Mira North', role: 'host', category: 'Music', online: true, verified: true, availableForCall: true, ratePerMin: 0 };
const asha = { ...mira, id: id('12'), name: 'Asha Sen' };
const rohan = { id: id('13'), name: 'Rohan Patel', role: 'sender', online: true, verified: false };
const member = { user: { id: id('01'), name: 'Member', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false, isPhoneVerified: true }, balance: 0, verification: 'none', requiresOnboarding: false };
const host = { ...member, user: { ...member.user, id: id('02'), name: 'Test Creator', role: 'host', serverRole: 'host', hostStatus: 'approved', isVerifiedHost: true }, verification: 'verified' };
const photos = () => [
  { id: photoIds.incoming, mine: false, kind: 'image', imageUrl, text: '', createdAt: new Date().toISOString() },
  { id: photoIds.own, mine: true, kind: 'image', imageUrl, text: '', createdAt: new Date().toISOString(), status: 'read' },
];

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [], screenshots = [];
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: true, isMobile: true });
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    const fixtureImage = async (width, height) => Buffer.from(await page.evaluate(size => {
      const canvas = document.createElement('canvas'); canvas.width = size.width; canvas.height = size.height;
      const context = canvas.getContext('2d');
      context.scale(size.width / 1200, size.height / 900);
      const sky = context.createLinearGradient(0, 0, 0, 900); sky.addColorStop(0, '#476aa8'); sky.addColorStop(0.6, '#efb69b'); sky.addColorStop(1, '#4d8291');
      context.fillStyle = sky; context.fillRect(0, 0, 1200, 900);
      context.fillStyle = '#ffe4a5'; context.beginPath(); context.arc(850, 290, 100, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#356b75'; context.beginPath(); context.moveTo(0, 650); context.quadraticCurveTo(350, 280, 650, 650); context.quadraticCurveTo(950, 430, 1200, 690); context.lineTo(1200, 900); context.lineTo(0, 900); context.fill();
      context.fillStyle = '#214c60'; context.beginPath(); context.moveTo(0, 790); context.quadraticCurveTo(500, 600, 1200, 800); context.lineTo(1200, 900); context.lineTo(0, 900); context.fill();
      context.fillStyle = '#fff'; context.font = '24px sans-serif'; context.fillText('LOCAL PHOTO FIXTURE', 36, 855);
      return canvas.toDataURL('image/png').split(',')[1];
    }, { width, height }), 'base64');
    const png = await fixtureImage(1200, 900), portraitPng = await fixtureImage(900, 1200);
    let failRetryImage = true;
    await page.route(/^https?:\/\//, route => {
      const url = route.request().url();
      if (url === portraitImageUrl) return route.fulfill({ contentType: 'image/png', body: portraitPng });
      return url === imageUrl || (url === retryImageUrl && !failRetryImage) ? route.fulfill({ contentType: 'image/png', body: png }) : route.abort();
    });
    await page.addInitScript(() => { window.__sent = []; window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) }; });
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href + '?role=sender');
    const receive = (type, data) => page.evaluate(message => Native.receive(message), { type, data });
    const button = name => page.getByRole('button', { name, exact: true });
    const viewer = page.getByRole('dialog', { name: 'Photo viewer', exact: true });
    const displayedImage = viewer.locator('.zc-photo-full');
    const replyInput = viewer.getByRole('textbox', { name: 'Reply to photo', exact: true });
    const photo = messageId => page.locator(`#zc-m-${messageId} .zc-photo`);
    const options = page.getByRole('dialog', { name: 'Message options', exact: true });
    const requests = () => page.evaluate(() => __sent.filter(message => message.type === 'chat.photoDownload').map(message => message.data));
    const lastRequest = type => page.evaluate(value => __sent.filter(message => message.type === value).at(-1)?.data, type);
    const authenticate = async (account = member) => {
      await receive('session', account);
      await receive('data.home', { hosts: [mira, asha], stage: [], featured: mira, total: 2, page: 1, categories: ['Music'], availableCount: 2 });
    };
    const openThread = async (peer = mira, messages = photos()) => {
      await page.evaluate(peerId => zcOpen(peerId), peer.id);
      await receive('data.thread', { with: peer.id, canSend: true, messages });
      await page.locator('#ti').waitFor();
      await page.evaluate(() => document.getElementById('app-notice')?.remove());
    };
    const imageReady = async () => {
      await viewer.waitFor();
      await displayedImage.waitFor();
      await page.waitForFunction(() => {
        const image = document.querySelector('#zc-photo-viewer .zc-photo-full');
        return image?.complete && image.naturalWidth > 0;
      });
    };
    const openPhoto = async messageId => { await photo(messageId).click(); await imageReady(); };
    const showZoom = async () => {
      if (!await button('Zoom in').isVisible()) await button('Photo zoom controls').click();
      assert.ok(await button('Zoom in').isVisible(), 'The zoom affordance exposes its controls');
    };
    const close = async () => { await viewer.getByRole('button', { name: 'Close photo', exact: true }).click(); await viewer.waitFor({ state: 'detached' }); };
    const imageBox = () => displayedImage.boundingBox();
    let baseWidth = 1;
    const scale = async () => (await imageBox()).width / baseWidth;
    const assertScale = async (expected, label) => assert.ok(Math.abs(await scale() - expected) < 0.03, `${label}: expected zoom ${expected}, got ${await scale()}`);
    const screenshot = async name => { const file = path.join(os.tmpdir(), name); await page.screenshot({ path: file }); screenshots.push(file); };
    const touch = await page.context().newCDPSession(page);
    const touchStart = points => touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
    const touchMove = points => touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points });
    const touchEnd = () => touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const center = async target => {
      await target.scrollIntoViewIfNeeded();
      const box = await target.boundingBox();
      assert.ok(box, 'Touch target is visible');
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const touchTap = async target => { await touchStart([await center(target)]); await touchEnd(); };
    const touchDrag = async (point, dx, dy = 0) => {
      await touchStart([point]);
      for (let step = 1; step <= 8; step++) await touchMove([{ x: point.x + dx * step / 8, y: point.y + dy * step / 8 }]);
      await touchEnd();
    };

    await authenticate();
    const photoReplyId = id('58');
    await openThread(mira, [...photos(), { id: photoReplyId, mine: true, text: 'A lovely view', reply: { id: photoIds.incoming, mine: false, text: '', image: true, deleted: false } }]);
    await page.locator(`#zc-m-${photoReplyId} .zc-quote`).focus();
    await page.keyboard.press('Enter');
    assert.ok(await photo(photoIds.incoming).evaluate(element => element === document.activeElement), 'Opening a photo quote focuses its original photo button');
    assert.ok(await page.locator(`#zc-m-${photoIds.incoming}`).evaluate(element => element.classList.contains('zc-flash')), 'The quoted original photo is highlighted');
    assert.equal(await viewer.count(), 0, 'Jumping to a photo quote does not also open its viewer');
    assert.equal(await options.count(), 0, 'Jumping to a photo quote does not open message options');
    await openThread();
    for (const messageId of [photoIds.own, photoIds.incoming]) {
      await openPhoto(messageId);
      assert.ok(await page.locator('#zc-photo-viewer').isVisible());
      assert.equal(await options.count(), 0, 'Opening a photo does not open message options');
      for (const label of ['Close photo', 'Photo zoom controls', 'Download photo', 'Reply with photo']) assert.ok(await viewer.getByRole('button', { name: label, exact: true }).isVisible(), `${label} is available in the viewer`);
      assert.ok(await replyInput.isVisible(), 'A photo can be replied to directly in the viewer');
      assert.ok(await button('Download photo').isEnabled(), 'A stored visible photo can be downloaded');
      await close();
      assert.ok(await photo(messageId).evaluate(element => element === document.activeElement || element.contains(document.activeElement)), 'Closing restores focus to the original photo');
      await photo(messageId).focus();
      await page.keyboard.press('Enter');
      await imageReady();
      await page.keyboard.press('Escape');
      await viewer.waitFor({ state: 'detached' });
    }

    await openPhoto(photoIds.own);
    baseWidth = (await imageBox()).width;
    await assertScale(1, 'A photo opens fitted to the viewport');
    await showZoom();
    await button('Zoom in').click();
    assert.ok(await scale() > 1, 'Zoom in enlarges the image');
    for (let index = 0; index < 16 && await scale() < 3.99; index++) await button('Zoom in').click();
    await assertScale(4, 'Button zoom clamps at 4x');
    assert.ok(await viewer.locator('.zc-photo-stage').evaluate(element => element === document.activeElement), 'Reaching maximum zoom preserves keyboard focus in the viewer');
    await button('Zoom in').evaluate(element => element.click());
    await assertScale(4, 'Zoom cannot exceed its maximum');
    for (let index = 0; index < 16 && await scale() > 1.01; index++) await button('Zoom out').click();
    await assertScale(1, 'Zoom out clamps at 1x');
    await button('Zoom out').evaluate(element => element.click());
    await assertScale(1, 'Zoom cannot shrink below fit');
    assert.ok(await viewer.locator('.zc-photo-stage').evaluate(element => element === document.activeElement), 'Reaching minimum zoom preserves keyboard focus in the viewer');
    await page.keyboard.press('+');
    assert.ok(await scale() > 1, 'Keyboard plus zooms the photo');
    const beforeArrow = await imageBox();
    await page.keyboard.press('ArrowRight');
    assert.notEqual((await imageBox()).x, beforeArrow.x, 'Arrow keys pan a zoomed photo');
    await page.keyboard.press('0');
    await assertScale(1, 'Keyboard zero resets zoom');

    // Two real touch points exercise browser gesture arbitration, not synthetic
    // DOM pointer events. The page itself must not pinch-zoom behind the dialog.
    const pinchCenter = await center(displayedImage);
    await touchStart([{ id: 1, x: pinchCenter.x - 40, y: pinchCenter.y }, { id: 2, x: pinchCenter.x + 40, y: pinchCenter.y }]);
    for (let step = 1; step <= 8; step++) await touchMove([{ id: 1, x: pinchCenter.x - 40 - step * 6, y: pinchCenter.y }, { id: 2, x: pinchCenter.x + 40 + step * 6, y: pinchCenter.y }]);
    await touchEnd();
    assert.ok(await scale() > 1.4 && await scale() <= 4.01, 'A two-finger pinch enlarges the photo within its bounds');
    assert.ok(Math.abs(await page.evaluate(() => visualViewport.scale) - 1) < 0.03, 'Pinching the photo does not zoom the underlying page');
    const beforePan = await imageBox();
    await touchDrag({ x: page.viewportSize().width / 2, y: pinchCenter.y }, 55, 30);
    const afterPan = await imageBox();
    assert.ok(Math.abs(afterPan.x - beforePan.x) > 10 || Math.abs(afterPan.y - beforePan.y) > 10, 'Dragging pans a zoomed photo');
    await button('Reset zoom').click();
    await assertScale(1, 'Reset returns the photo to fit');
    for (let tap = 0; tap < 2; tap++) { await touchTap(displayedImage); await page.waitForTimeout(60); }
    assert.ok(await scale() > 1, 'Double tapping zooms the photo');
    await page.waitForTimeout(350);
    for (let tap = 0; tap < 2; tap++) { await touchTap(displayedImage); await page.waitForTimeout(60); }
    await assertScale(1, 'Double tapping again resets the photo');

    await viewer.evaluate(element => element.querySelector('button:not(:disabled)').focus());
    await page.keyboard.press('Shift+Tab');
    assert.ok(await viewer.evaluate(element => element.contains(document.activeElement)), 'Shift+Tab stays inside the viewer');
    await page.keyboard.press('Tab');
    assert.ok(await viewer.evaluate(element => element.querySelector('button:not(:disabled)') === document.activeElement), 'Tab wraps back to the first viewer control');
    await close();

    // Ownership determines reply direction; a swipe or hold never opens a photo.
    for (const [messageId, direction, expectedOptions] of [
      [photoIds.own, -1, ['Reply', 'Delete for everyone', 'Delete for me', 'Cancel']],
      [photoIds.incoming, 1, ['Reply', 'Delete for me', 'Cancel']],
    ]) {
      await touchDrag(await center(photo(messageId)), direction * 84);
      assert.equal(await page.evaluate(() => Chats.reply?.id), messageId);
      assert.equal(await viewer.count(), 0, 'Photo reply swipe does not also open the viewer');
      assert.equal(await options.count(), 0);
      await button('Cancel reply').click();
      await touchDrag(await center(photo(messageId)), -direction * 84);
      assert.equal(await page.evaluate(() => Chats.reply), null, 'Opposite photo swipe cannot reply');
      assert.equal(await viewer.count(), 0, 'Opposite swipe cannot become a photo tap');
      assert.equal(await options.count(), 0);
      await touchStart([await center(photo(messageId))]);
      try { await options.waitFor(); } finally { await touchEnd(); }
      assert.deepEqual(await options.getByRole('button').allInnerTexts(), expectedOptions);
      assert.equal(await viewer.count(), 0, 'Holding a photo opens only message options');
      await touchTap(options.getByRole('button', { name: 'Cancel', exact: true }));
    }

    // Replies use the existing authenticated text/photo paths and retain the
    // original message ID. No fixture message leaves the intercepted bridge.
    await page.locator('#ti').fill('Unsent chat draft');
    await openPhoto(photoIds.incoming);
    await replyInput.fill('Unsent viewer reply');
    await close();
    assert.equal(await page.locator('#ti').inputValue(), 'Unsent chat draft', 'Opening and closing the viewer preserves the thread draft');
    await page.locator('#ti').fill('');
    for (const [messageId, submitWithKeyboard] of [[photoIds.incoming, false], [photoIds.own, true]]) {
      await openPhoto(messageId);
      baseWidth = (await imageBox()).width;
      assert.equal(await button('Send reply').isVisible(), false, 'The viewer has no empty send action');
      await replyInput.fill('A lovely view ');
      await page.keyboard.type('+ 10-0');
      await page.keyboard.press('ArrowLeft');
      assert.equal(await replyInput.inputValue(), 'A lovely view + 10-0', 'Photo keyboard shortcuts do not consume reply characters');
      await assertScale(1, 'Typing and moving the caret cannot zoom the photo');
      if (submitWithKeyboard) await page.keyboard.press('Enter');
      else await button('Send reply').click();
      await viewer.waitFor({ state: 'detached' });
      assert.deepEqual(await lastRequest('chat.send'), { to: mira.id, text: 'A lovely view + 10-0', replyTo: messageId }, 'The inline reply targets the displayed photo');
      const sentReply = await page.evaluate(() => S.msgs.at(-1));
      assert.equal(sentReply.reply?.id, messageId, 'The optimistic text reply keeps its photo quote');
      assert.equal(sentReply.reply?.image, true);
      assert.equal(await page.evaluate(() => Chats.reply), null, 'Sending consumes the selected photo reply context');
    }
    const editableId = id('59');
    await openThread(mira, [...photos(), { id: editableId, mine: true, text: 'An editable message', status: 'read', createdAt: new Date().toISOString() }]);
    for (const context of ['reply', 'edit']) {
      await page.evaluate(({ context, ownPhoto, editableId }) => context === 'reply' ? zcStartReply(ownPhoto) : zcStartEdit(editableId), { context, ownPhoto: photoIds.own, editableId });
      const draft = `Keep my existing ${context} draft`;
      await page.locator('#ti').fill(draft);
      await openPhoto(photoIds.incoming);
      await replyInput.fill('A separate photo reply');
      await button('Send reply').click();
      await viewer.waitFor({ state: 'detached' });
      assert.deepEqual(await lastRequest('chat.send'), { to: mira.id, text: 'A separate photo reply', replyTo: photoIds.incoming });
      assert.equal(await page.locator('#ti').inputValue(), draft, `Inline sending preserves the existing ${context} draft`);
      assert.equal(await page.evaluate(value => value === 'reply' ? Chats.reply?.id : Chats.editing?.id, context), context === 'reply' ? photoIds.own : editableId, `Inline sending restores the previous ${context} target`);
      await page.evaluate(() => zcClearContext());
    }
    for (const context of ['normal', 'reply', 'edit', 'same-photo reply']) for (const outcome of ['cancel', 'select']) {
      await openThread(mira, [...photos(), { id: editableId, mine: true, text: 'An editable message', status: 'read', createdAt: new Date().toISOString() }]);
      const priorReplyId = context === 'reply' ? photoIds.own : context === 'same-photo reply' ? photoIds.incoming : null;
      await page.evaluate(({ context, priorReplyId, editableId }) => {
        if (priorReplyId) zcStartReply(priorReplyId);
        else if (context === 'edit') zcStartEdit(editableId);
      }, { context, priorReplyId, editableId });
      const draft = `Keep my ${context} draft after picker ${outcome}`;
      await page.locator('#ti').fill(draft);
      const photoCount = await page.evaluate(() => __sent.filter(message => message.type === 'chat.photo').length);
      await openPhoto(photoIds.incoming);
      const picker = page.waitForEvent('filechooser');
      await button('Reply with photo').click();
      const chooser = await picker;
      await viewer.waitFor({ state: 'detached' });
      const assertPriorContext = async phase => {
        assert.equal(await page.locator('#ti').inputValue(), draft, `${context}: ${phase} preserves the unfinished draft`);
        assert.equal(await page.evaluate(() => Chats.reply?.id ?? null), priorReplyId, `${context}: ${phase} preserves the original reply target`);
        assert.equal(await page.evaluate(() => Chats.editing?.id ?? null), context === 'edit' ? editableId : null, `${context}: ${phase} preserves editing state`);
      };
      await assertPriorContext('opening the picker');
      if (outcome === 'select') {
        await chooser.setFiles({ name: 'viewer-photo-reply.png', mimeType: 'image/png', buffer: portraitPng });
        await page.waitForFunction(count => __sent.filter(message => message.type === 'chat.photo').length === count + 1, photoCount);
        const photoReply = await lastRequest('chat.photo');
        assert.equal(photoReply.to, mira.id);
        assert.equal(photoReply.replyTo, photoIds.incoming, 'The viewer photo picker targets the displayed original');
        assert.match(photoReply.photo, /^data:image\/jpeg;base64,/);
        assert.equal(await page.evaluate(() => S.msgs.at(-1).reply?.id), photoIds.incoming, 'The optimistic photo reply keeps its quote');
      } else {
        await chooser.setFiles([]);
        await page.locator('#zc-photo-input').dispatchEvent('cancel');
        assert.equal(await page.evaluate(() => __sent.filter(message => message.type === 'chat.photo').length), photoCount, 'Cancelling the picker sends no photo');
      }
      await assertPriorContext(`picker ${outcome}`);
      const sendCount = await page.evaluate(() => __sent.filter(message => message.type === 'chat.send').length);
      await page.locator('#ti').press('Enter');
      if (context === 'edit') {
        assert.deepEqual(await lastRequest('chat.edit'), { to: mira.id, id: editableId, text: draft }, 'An unfinished edit still submits as an edit after the photo picker');
        assert.equal(await page.evaluate(() => __sent.filter(message => message.type === 'chat.send').length), sendCount, 'Submitting the preserved edit does not send a new text message');
      } else assert.deepEqual(await lastRequest('chat.send'), { to: mira.id, text: draft, ...(priorReplyId ? { replyTo: priorReplyId } : {}) }, 'The preserved chat draft retains its original send context');
    }
    await openThread();

    await openPhoto(photoIds.incoming);
    await replyInput.fill('Keep this reply while permissions change');
    const sendCountBeforePermission = await page.evaluate(() => __sent.filter(message => message.type === 'chat.send').length);
    const updatePermission = canSend => receive('data.chats', { chats: [{ id: id('31'), user: mira, last: 'Photo', lastKind: 'image', unread: 0, canSend, sendDisabledReason: canSend ? undefined : 'This conversation is temporarily read only.' }], page: 1, total: 1 });
    await updatePermission(false);
    assert.equal(await replyInput.isEnabled(), false, 'A live chat-permission revocation disables the open viewer input');
    assert.equal(await button('Reply with photo').isEnabled(), false, 'A live chat-permission revocation disables photo replies');
    assert.equal(await button('Send reply').isEnabled(), false, 'A live chat-permission revocation disables sending the typed reply');
    await page.evaluate(() => ZimiChatPhoto.sendReply());
    assert.equal(await page.evaluate(() => __sent.filter(message => message.type === 'chat.send').length), sendCountBeforePermission, 'Permission revocation also guards the direct send action');
    await updatePermission(true);
    assert.ok(await replyInput.isEnabled(), 'Restored chat permission re-enables the viewer input');
    assert.ok(await button('Reply with photo').isEnabled());
    assert.ok(await button('Send reply').isEnabled());
    assert.equal(await replyInput.inputValue(), 'Keep this reply while permissions change', 'Permission updates preserve the inline draft');
    await close();

    // Downloads are native requests for an authenticated message, never raw URLs.
    await openPhoto(photoIds.own);
    await button('Download photo').click();
    const firstRequest = (await requests()).at(-1);
    assert.equal(firstRequest.to, mira.id);
    assert.equal(firstRequest.id, photoIds.own);
    assert.ok(Number.isSafeInteger(firstRequest.requestId) && firstRequest.requestId > 0, 'Downloads carry a positive response correlation ID');
    assert.deepEqual(Object.keys(firstRequest).sort(), ['id', 'requestId', 'to']);
    assert.equal(await button('Download photo').isEnabled(), false, 'Pending downloads cannot be submitted twice');
    assert.ok(await viewer.locator('.zc-photo-stage').evaluate(element => element === document.activeElement), 'Saving preserves keyboard focus when its button is disabled');
    await receive('app.background', {});
    assert.ok(await viewer.isVisible(), 'A native photo-library permission prompt may background the app without closing the viewer');
    assert.equal(await button('Download photo').isEnabled(), false);
    await receive('operation.error', { action: 'chat.photoDownload', ...firstRequest, requestId: 'unrelated-request', message: 'Unrelated failure' });
    assert.equal(await button('Download photo').isEnabled(), false, 'Unrelated errors cannot clear the pending download');
    await receive('operation.error', { action: 'chat.photoDownload', ...firstRequest, code: 'PERMISSION_DENIED', message: 'Allow photo library access to save this photo.' });
    assert.ok(await button('Download photo').isEnabled(), 'A denied save can be retried');
    assert.match(await viewer.innerText() + ' ' + await page.locator('#app-notice').allTextContents(), /allow|permission|photo library/i);
    await button('Download photo').click();
    const retry = (await requests()).at(-1);
    assert.notEqual(retry.requestId, firstRequest.requestId, 'A retry gets a distinct response correlation ID');
    await receive('chat.photoDownloaded', firstRequest);
    assert.equal(await button('Download photo').isEnabled(), false, 'A late acknowledgement from the first attempt cannot finish its retry');
    await receive('operation.error', { action: 'chat.photoDownload', ...firstRequest, message: 'Late failure from the first attempt' });
    assert.equal(await button('Download photo').isEnabled(), false, 'A late error cannot cancel a newer save');
    await receive('chat.photoDownloaded', retry);
    assert.ok(await button('Download photo').isEnabled(), 'The matching acknowledgement finishes the download');
    await close();

    await openPhoto(photoIds.incoming);
    await button('Download photo').click();
    const oldViewerRequest = (await requests()).at(-1);
    await close();
    await openPhoto(photoIds.own);
    await button('Download photo').click();
    const newViewerRequest = (await requests()).at(-1);
    await receive('chat.photoDownloaded', oldViewerRequest);
    assert.equal(await button('Download photo').isEnabled(), false, 'Closing and reopening another photo makes previous acknowledgements stale');
    await receive('chat.photoDownloaded', newViewerRequest);
    await close();

    // Optimistic local media is viewable before a server identity exists.
    await page.evaluate(({ photoIds, imageUrl }) => {
      S.msgs.push({ id: photoIds.pending, mine: true, kind: 'image', imageUrl, text: '', local: true, status: 'sending' });
      paint();
    }, { photoIds, imageUrl });
    let requestsBeforeUnavailable = (await requests()).length;
    await openPhoto(photoIds.pending);
    assert.equal(await button('Download photo').isEnabled(), false, 'A local pending photo cannot be downloaded by message ID');
    assert.equal(await replyInput.isEnabled(), false, 'A photo without a server identity cannot receive a reply');
    assert.equal(await button('Reply with photo').isEnabled(), false);
    await button('Download photo').evaluate(element => element.click());
    assert.equal((await requests()).length, requestsBeforeUnavailable);
    const canonicalPhotoId = id('56');
    await receive('chat.photoSent', { to: mira.id, id: canonicalPhotoId });
    assert.ok(await viewer.isVisible(), 'The optimistic photo viewer survives acknowledgement with a canonical message ID');
    assert.ok(await button('Download photo').isEnabled(), 'Acknowledgement enables saving the now-persisted photo');
    assert.ok(await replyInput.isEnabled(), 'Acknowledgement enables replying to the persisted photo');
    await button('Download photo').click();
    const acknowledgedPhotoRequest = (await requests()).at(-1);
    assert.equal(acknowledgedPhotoRequest.id, canonicalPhotoId, 'Saving an acknowledged local photo uses its canonical server ID');
    await receive('chat.photoDownloaded', acknowledgedPhotoRequest);
    requestsBeforeUnavailable = (await requests()).length;
    await close();
    await openThread(mira, [
      { id: photoIds.invalid, mine: false, kind: 'image', imageUrl: 'javascript:alert(1)', text: '' },
      { id: photoIds.deleted, mine: true, kind: 'image', imageUrl, text: '', deleted: true },
    ]);
    assert.equal(await page.locator(`#zc-m-${photoIds.deleted} .zc-photo`).count(), 0, 'Deleted messages expose no photo viewer trigger');
    if (await photo(photoIds.invalid).count()) {
      assert.equal(await photo(photoIds.invalid).isEnabled(), false, 'An invalid image source exposes no enabled viewer trigger');
      await photo(photoIds.invalid).evaluate(element => element.click());
      assert.equal(await viewer.count(), 0, 'Clicking an invalid image cannot open the viewer');
    }
    assert.equal((await requests()).length, requestsBeforeUnavailable, 'Invalid or deleted media never requests a download');

    const retryPhotoId = id('57');
    await openThread(mira, [{ id: retryPhotoId, mine: false, kind: 'image', imageUrl: retryImageUrl, text: '' }]);
    await photo(retryPhotoId).click();
    await button('Retry loading photo').waitFor();
    assert.equal(await button('Download photo').isEnabled(), false, 'An image that failed to load cannot be downloaded');
    await page.evaluate(() => ZimiChatPhoto.download());
    assert.equal((await requests()).length, requestsBeforeUnavailable);
    failRetryImage = false;
    await button('Retry loading photo').click();
    await imageReady();
    assert.ok(await button('Download photo').isEnabled(), 'Retrying a failed image load restores the viewer controls');
    await close();

    // Creators reveal incoming photos first; a second intentional tap opens them.
    await authenticate(host);
    await receive('data.chats', { chats: [{ id: id('31'), user: rohan, last: 'Photo', lastKind: 'image', unread: 1, canSend: true, automatedOnly: false }], page: 1, total: 1 });
    await openThread(rohan);
    assert.ok(await photo(photoIds.incoming).evaluate(element => element.classList.contains('is-blurred')));
    await touchTap(photo(photoIds.incoming));
    assert.equal(await viewer.count(), 0, 'The first tap reveals a protected incoming photo without opening it');
    assert.equal(await photo(photoIds.incoming).evaluate(element => element.classList.contains('is-blurred')), false);
    await touchTap(photo(photoIds.incoming));
    await imageReady();
    await close();

    await authenticate();
    for (const reason of ['chat.updated', 'chat.removed', 'app.back', 'navigation', 'session.none', 'session.expired']) {
      await authenticate();
      await openThread();
      await openPhoto(photoIds.own);
      if (reason === 'chat.updated') await receive(reason, { with: mira.id, message: { id: photoIds.own, mine: true, kind: 'text', text: '', deleted: true } });
      else if (reason === 'chat.removed') await receive(reason, { with: mira.id, id: photoIds.own });
      else if (reason === 'navigation') await page.evaluate(() => go('chats'));
      else await receive(reason, {});
      assert.equal(await viewer.count(), 0, `${reason} dismisses the private photo viewer`);
    }

    await authenticate();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      const insideViewport = async (target, label, height = 844) => {
        const bounds = await target.boundingBox();
        assert.ok(bounds && bounds.width > 0 && bounds.height > 0 && bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1, `${label} fits the ${width}x${height} viewport`);
      };
      for (const [orientation, source] of [['landscape', imageUrl], ['portrait', portraitImageUrl]]) {
        await openThread(mira, photos().map(message => ({ ...message, imageUrl: source, createdAt: new Date(Date.now() - 120000).toISOString() })));
        await openPhoto(photoIds.incoming);
        await insideViewport(viewer, 'Photo viewer');
        await insideViewport(displayedImage, `${orientation} image`);
        await insideViewport(replyInput, 'Reply field');
        for (const label of ['Close photo', 'Photo zoom controls', 'Download photo', 'Reply with photo']) await insideViewport(button(label), label);
        assert.ok((await imageBox()).width >= width * 0.6, 'The fitted photo remains large enough to view');
        await screenshot(`zimi-chat-photo-viewer-${orientation}-${width}.png`);
        await showZoom();
        for (const label of ['Zoom in', 'Zoom out', 'Reset zoom']) await insideViewport(button(label), label);
        await button('Zoom in').click();
        await screenshot(`zimi-chat-photo-viewer-${orientation}-zoom-${width}.png`);
        await close();
      }

      await openPhoto(photoIds.incoming);
      await replyInput.fill('A photo reply with the keyboard open');
      for (let cycle = 0; cycle < 2; cycle++) {
        await page.setViewportSize({ width, height: 420 });
        await insideViewport(viewer, 'Photo viewer with keyboard', 420);
        await insideViewport(replyInput, 'Focused reply field', 420);
        await insideViewport(button('Send reply'), 'Send reply', 420);
        assert.equal(await replyInput.inputValue(), 'A photo reply with the keyboard open', 'Keyboard resizing retains the reply draft');
        if (!cycle) await screenshot(`zimi-chat-photo-viewer-keyboard-${width}.png`);
        await page.setViewportSize({ width, height: 844 });
        await insideViewport(replyInput, 'Reply field after keyboard closes');
      }
      await close();
    }
    await touch.detach();
    assert.deepEqual(errors, [], 'Photo viewing must not cause browser errors');
    console.log('PASS chat photos: viewer/keyboard and quote focus, bounded zoom, touch pinch/pan/double tap, swipe/hold conflicts, inline text/photo replies, reveal consent, download correlation/retry, local acknowledgement, image-load retry, lifecycle cleanup and portrait/landscape/keyboard layouts at 390/320px.');
    console.log(screenshots.join('\n'));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(os.tmpdir(), 'zimi-chat-photos-failure.png') }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
