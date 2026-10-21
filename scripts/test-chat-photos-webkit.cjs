// Actual Playwright WebKit, using iPhone/iPad device profiles and local fixtures.
// Taps/double taps use browser touchscreen input; drags use browser mouse input.
// Multi-pointer pinch alone is synthetic DOM input (WebKit has no CDP touch
// stream here). Its capture shim is confined to the fixture stage and restored.
// This suite does not validate a physical iPhone or native Photos permissions.
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { webkit, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const id = suffix => `507f1f77bcf86cd7994390${suffix}`;
const mira = { id: id('11'), name: 'Mira North', role: 'host', category: 'Music', online: true, verified: true };
const member = { user: { id: id('01'), name: 'Member', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false, isPhoneVerified: true }, balance: 0, verification: 'none', requiresOnboarding: false };
const imageUrl = 'https://photos.fixture.test/portrait.png';
const photoId = id('51'), ownId = id('52');

(async () => {
  const browser = await webkit.launch({ headless: true, ...(process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE_PATH } : {}) });
  const screenshots = [];
  try {
    for (const [profile, label] of [['iPhone 13', 'iphone'], ['iPad Pro 11', 'ipad']]) {
      const context = await browser.newContext({ ...devices[profile], reducedMotion: 'reduce' });
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(7000);
      page.on('pageerror', error => errors.push(error.message));
      try {
        const png = Buffer.from(await page.evaluate(() => {
          const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 1200;
          const c = canvas.getContext('2d'), sky = c.createLinearGradient(0, 0, 0, 1200);
          sky.addColorStop(0, '#5275aa'); sky.addColorStop(1, '#f2bb9d'); c.fillStyle = sky; c.fillRect(0, 0, 900, 1200);
          c.fillStyle = '#ffe5a5'; c.beginPath(); c.arc(650, 330, 110, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#376d78'; c.beginPath(); c.moveTo(0, 850); c.quadraticCurveTo(300, 400, 600, 900); c.quadraticCurveTo(750, 600, 900, 820); c.lineTo(900, 1200); c.lineTo(0, 1200); c.fill();
          c.fillStyle = '#214c60'; c.beginPath(); c.moveTo(0, 1020); c.quadraticCurveTo(450, 800, 900, 1050); c.lineTo(900, 1200); c.lineTo(0, 1200); c.fill();
          return canvas.toDataURL('image/png').split(',')[1];
        }), 'base64');
        await page.route(/^https?:\/\//, route => route.request().url() === imageUrl ? route.fulfill({ contentType: 'image/png', body: png }) : route.abort());
        await page.addInitScript(() => { window.__sent = []; window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) }; });
        await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href + '?role=sender');
        const receive = (type, data) => page.evaluate(message => Native.receive(message), { type, data });
        const button = name => page.getByRole('button', { name, exact: true });
        const viewer = page.getByRole('dialog', { name: 'Photo viewer', exact: true });
        const photo = messageId => page.locator(`#zc-m-${messageId} .zc-photo`);
        const full = viewer.locator('.zc-photo-full'), stage = viewer.locator('.zc-photo-stage');
        const input = viewer.getByRole('textbox', { name: 'Reply to photo', exact: true });
        const last = type => page.evaluate(value => __sent.filter(message => message.type === value).at(-1)?.data, type);
        const tap = async locator => {
          await locator.scrollIntoViewIfNeeded();
          const box = await locator.boundingBox(); assert.ok(box, 'Touch target has geometry');
          await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        };
        const ready = async () => {
          await viewer.waitFor(); await full.waitFor();
          await page.waitForFunction(() => document.querySelector('.zc-photo-full')?.naturalWidth === 900);
        };
        const open = async (messageId = photoId) => { await tap(photo(messageId)); await ready(); };
        const close = async () => { await tap(button('Close photo')); await viewer.waitFor({ state: 'detached' }); };
        const zoom = () => full.evaluate(element => new DOMMatrix(getComputedStyle(element).transform).a);
        const fit = async (locator, description) => {
          const box = await locator.boundingBox(), viewport = page.viewportSize();
          assert.ok(box && box.width > 0 && box.height > 0 && box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `${profile}: ${description} fits ${viewport.width}x${viewport.height}`);
        };
        const screenshot = async name => { const file = path.join(os.tmpdir(), `zimi-chat-photo-webkit-${label}-${name}.png`); await page.screenshot({ path: file, scale: 'css' }); screenshots.push(file); };
        await receive('session', member);
        await receive('data.home', { hosts: [mira], stage: [], featured: mira, total: 1, page: 1, categories: ['Music'], availableCount: 1 });
        await page.evaluate(peer => zcOpen(peer), mira.id);
        await receive('data.thread', { with: mira.id, canSend: true, messages: [
          { id: photoId, mine: false, kind: 'image', imageUrl, text: '', createdAt: new Date().toISOString() },
          { id: ownId, mine: true, kind: 'image', imageUrl, text: '', status: 'read', createdAt: new Date().toISOString() },
        ] });

        for (const messageId of [photoId, ownId]) {
          await open(messageId); await fit(full, 'Photo'); await fit(input, 'Reply field');
          assert.equal(await page.getByRole('dialog', { name: 'Message options', exact: true }).count(), 0, 'A native touch tap opens only the viewer');
          await close();
        }
        await photo(photoId).focus(); await page.keyboard.press('Enter'); await ready();
        await page.keyboard.press('Escape'); await viewer.waitFor({ state: 'detached' });
        assert.ok(await photo(photoId).evaluate(element => element === document.activeElement), 'Keyboard close restores the original photo focus');

        await open();
        await tap(button('Photo zoom controls'));
        for (let step = 0; step < 6; step++) await tap(button('Zoom in'));
        assert.equal(await zoom(), 4, 'WebKit zoom controls clamp at 4x');
        assert.equal(await button('Zoom in').isEnabled(), false);
        await tap(button('Reset zoom')); assert.equal(await zoom(), 1);
        assert.equal(await button('Zoom out').isEnabled(), false);
        await tap(button('Photo zoom controls'));
        await tap(full); await page.waitForTimeout(70); await tap(full);
        assert.ok(await zoom() > 1, 'Actual WebKit touchscreen double tap zooms the photo');
        const beforePan = await full.boundingBox(), area = await stage.boundingBox();
        await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
        await page.mouse.down(); await page.mouse.move(area.x + area.width / 2 + 55, area.y + area.height / 2 + 35, { steps: 8 }); await page.mouse.up();
        const afterPan = await full.boundingBox();
        assert.ok(Math.abs(beforePan.x - afterPan.x) > 10 || Math.abs(beforePan.y - afterPan.y) > 10, 'Actual WebKit pointer drag pans the zoomed photo');
        await stage.focus(); await page.keyboard.press('0'); assert.equal(await zoom(), 1);

        // Explicitly synthetic pinch. Synthetic pointer IDs have no browser
        // capture registry; shim only the test stage while dispatching events.
        await stage.evaluate(element => {
          const names = ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture'], descriptors = names.map(name => Object.getOwnPropertyDescriptor(element, name)), captured = new Set();
          Object.defineProperties(element, { setPointerCapture: { configurable: true, value: id => captured.add(id) }, releasePointerCapture: { configurable: true, value: id => captured.delete(id) }, hasPointerCapture: { configurable: true, value: id => captured.has(id) } });
          try {
            const box = element.getBoundingClientRect(), x = box.x + box.width / 2, y = box.y + box.height / 2;
            const send = (type, pointerId, dx) => element.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId, pointerType: 'touch', isPrimary: pointerId === 91, clientX: x + dx, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
            send('pointerdown', 91, -35); send('pointerdown', 92, 35);
            for (let step = 1; step <= 8; step++) { send('pointermove', 91, -35 - step * 6); send('pointermove', 92, 35 + step * 6); }
            send('pointerup', 91, -83); send('pointerup', 92, 83);
          } finally { names.forEach((name, index) => descriptors[index] ? Object.defineProperty(element, name, descriptors[index]) : delete element[name]); }
        });
        assert.ok(await zoom() > 1.5 && await zoom() <= 4, 'Synthetic two-pointer events exercise WebKit pinch calculations');
        await stage.focus(); await page.keyboard.press('0');

        // Theme updates must keep the same image node, transform and input.
        await input.fill('A WebKit photo reply');
        await page.evaluate(() => { window.__photoNode = document.querySelector('.zc-photo-full'); });
        const themes = await page.evaluate(() => structuredClone([ZThemeOriginal, ZThemeRose]));
        for (const theme of themes) {
          await receive('data.themes', { items: themes, selectedThemeId: theme.id, premium: { active: false } });
          assert.ok(await full.evaluate(element => element === __photoNode));
          assert.equal(await input.inputValue(), 'A WebKit photo reply');
          assert.equal(await zoom(), 1);
          const colors = await viewer.evaluate(element => ({ actual: getComputedStyle(element.parentElement).backgroundColor, expected: getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim() }));
          assert.equal(colors.actual, colors.expected);
          await fit(button('Download photo'), 'Download'); await fit(button('Reply with photo'), 'Photo reply'); await fit(button('Send reply'), 'Send reply');
          await screenshot(theme.mode);
        }
        await input.focus(); await page.keyboard.press('End'); await page.keyboard.type(' +10-0'); await page.keyboard.press('ArrowLeft');
        assert.equal(await input.inputValue(), 'A WebKit photo reply +10-0', 'Input characters and caret arrows bypass viewer shortcuts');
        assert.equal(await zoom(), 1);
        const viewport = page.viewportSize();
        await page.setViewportSize({ width: viewport.width, height: label === 'iphone' ? 420 : 600 });
        await fit(input, 'Keyboard-height reply input'); await fit(button('Send reply'), 'Keyboard-height send'); await screenshot('keyboard');
        await page.setViewportSize(viewport);
        await page.keyboard.press('Enter'); await viewer.waitFor({ state: 'detached' });
        assert.deepEqual(await last('chat.send'), { to: mira.id, text: 'A WebKit photo reply +10-0', replyTo: photoId });

        // Exercise the actual WebKit file chooser and image encoder.
        await page.locator('#ti').fill('Keep this chat draft');
        await open();
        const pendingChooser = page.waitForEvent('filechooser');
        await tap(button('Reply with photo'));
        await (await pendingChooser).setFiles({ name: 'webkit-photo.png', mimeType: 'image/png', buffer: png });
        await page.waitForFunction(() => __sent.some(message => message.type === 'chat.photo'));
        const uploaded = await last('chat.photo');
        assert.equal(uploaded.to, mira.id); assert.equal(uploaded.replyTo, photoId); assert.match(uploaded.photo, /^data:image\/jpeg;base64,/);
        assert.equal(await page.locator('#ti').inputValue(), 'Keep this chat draft');

        await open(); await tap(button('Download photo'));
        const first = await last('chat.photoDownload');
        assert.equal(first.id, photoId); assert.equal(first.to, mira.id);
        assert.equal(await button('Download photo').isEnabled(), false);
        await receive('operation.error', { action: 'chat.photoDownload', ...first, code: 'PERMISSION_DENIED', message: 'Allow photo library access.' });
        assert.ok(await button('Download photo').isEnabled());
        await tap(button('Download photo')); const retry = await last('chat.photoDownload');
        assert.notEqual(retry.requestId, first.requestId);
        await receive('chat.photoDownloaded', first); assert.equal(await button('Download photo').isEnabled(), false);
        await receive('chat.photoDownloaded', retry); assert.ok(await button('Download photo').isEnabled());
        await page.evaluate(() => document.querySelector('[aria-label="Close photo"]').focus());
        await page.keyboard.press('Shift+Tab');
        assert.ok(await viewer.evaluate(element => element.contains(document.activeElement)), 'WebKit focus trap keeps reverse tab inside the dialog');
        await page.keyboard.press('Tab');
        assert.ok(await button('Close photo').evaluate(element => element === document.activeElement));
        await close();
        await open(); await receive('app.back', {}); await viewer.waitFor({ state: 'detached' });
        assert.deepEqual(errors, [], `${profile}: no browser errors`);
        console.log(`PASS WebKit ${browser.version()} ${profile}: actual touch tap/double tap, mouse pan, synthetic pinch, image/zoom/keyboard/theme/reply/picker/download/focus.`);
      } catch (error) {
        await page.screenshot({ path: path.join(os.tmpdir(), `zimi-chat-photo-webkit-${label}-failure.png`), scale: 'css' }).catch(() => {});
        throw error;
      } finally { await context.close(); }
    }
    console.log(screenshots.join('\n'));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
