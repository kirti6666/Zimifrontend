/* Production packaging and real-browser playback of the exact authored gift
   files. Network routes are local fixtures at the public manifest URLs. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const { inspectGiftWebp, originalGiftUrl, giftStickerResource, assertInlineHtmlSize, INLINE_HTML_LIMIT } = await import('./gift-original-assets.mjs');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'web/gift-originals.json')));
  const files = new Map(Object.entries(manifest.originals).map(([name, entry]) => [name, { entry, bytes: fs.readFileSync(path.join(root, 'web/stickers', name + '.webp')) }]));
  assert.deepEqual([...files.keys()].sort(), ['golden-rose', 'heart']);
  for (const [name, { entry, bytes }] of files) {
    assert.deepEqual(inspectGiftWebp(bytes), { sha256: entry.sha256, bytes: entry.bytes, width: entry.width, height: entry.height, frameCount: entry.frameCount });
    assert.equal(entry.frameCount, 192, 'Keep every authored frame');
    assert.equal(giftStickerResource(root, manifest, name), entry.url, 'Oversized originals are URLs, never the smaller inline export');
    for (const patch of [{ sha256: '0'.repeat(64) }, { width: 216 }, { frameCount: 96 }, { bytes: entry.bytes - 1 },
      { url: entry.url.replace('https:', 'http:') }, { url: entry.url + '?fallback=small' }, { url: entry.url + '#frame' },
      { url: entry.url.replace(entry.sha256, '0'.repeat(64)) }, { url: entry.url.replace('https://', 'https://user:secret@') }])
      assert.throws(() => originalGiftUrl({ ...entry, ...patch }, bytes, name));
    assert.throws(() => giftStickerResource(root, { schemaVersion: 1, originals: {} }, name), /Missing public original/);
    assert.throws(() => giftStickerResource(root, { ...manifest, schemaVersion: 2 }, name), /schemaVersion/);
    const altered = Buffer.from(bytes); altered[altered.length - 1] ^= 1;
    assert.throws(() => originalGiftUrl(entry, altered, name), /sha256/);
  }
  for (const name of ['heart-cover', 'golden-rose-cover', 'rose-waterfall-cover', 'rose-waterfall']) {
    const resource = giftStickerResource(root, manifest, name);
    assert.match(resource, /^data:image\/webp;base64,/);
    assert.deepEqual(Buffer.from(resource.split(',')[1], 'base64'), fs.readFileSync(path.join(root, 'web/stickers', name + '.webp')));
  }
  assert.throws(() => giftStickerResource(root, manifest, '../heart'), /Invalid/);
  assert.throws(() => inspectGiftWebp(Buffer.from('not webp')));
  assert.throws(() => assertInlineHtmlSize('a'.repeat(INLINE_HTML_LIMIT + 1), 'Fixture'), /blank startup/);
  const html = fs.readFileSync(path.join(root, 'assets/aurora.html'), 'utf8');
  const htmlBytes = assertInlineHtmlSize(html, 'Generated app');
  for (const { entry, bytes } of files.values()) {
    assert.ok(html.includes(entry.url), 'The shipped app resolves the verified original URL');
    assert.ok(!html.includes(bytes.subarray(0, 4096).toString('base64')), 'Large original payload is absent from WebView HTML');
  }
  for (const name of files.keys()) {
    const small = path.join(root, 'web/stickers/inline', name + '.webp');
    if (fs.existsSync(small)) assert.ok(!html.includes(fs.readFileSync(small).subarray(0, 4096).toString('base64')), 'The small startup export remains on disk but does not downgrade playback');
  }
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => {
      const url = new URL(route.request().url());
      const fixture = [...files.values()].find(({ entry }) => { const expected = new URL(entry.url); return expected.origin === url.origin && expected.pathname === url.pathname; });
      if (!fixture) return route.abort();
      requests.push(url.href);
      return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, contentType: 'image/webp', body: fixture.bytes });
    });
    await page.addInitScript(() => { window.ReactNativeWebView = { postMessage() {} }; });
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href);
    assert.equal(requests.length, 0, 'Opening the app or viewing still covers downloads no huge animation');
    await page.evaluate(() => { window.__originalPlayer = ZimiGiftPlayback.create({ id: 'original-gift-proof', available: () => true }); });
    for (const [name, { entry }] of files) {
      const title = name === 'heart' ? 'Heart' : 'Golden Rose';
      assert.equal(await page.evaluate(title => giftMotionUrl(title), title), entry.url);
      await page.evaluate(async ({ title, name }) => {
        const media = giftMotionUrl(title); await ZimiGiftPlayback.preload(media);
        __originalPlayer.enqueue({ transferId: name, media, poster: giftStillResource(title), durationMs: 60000 });
      }, { title, name });
      await page.waitForFunction(name => __originalPlayer.active?.state === 'playing' && __originalPlayer.active.transferId === name, name);
      const proof = await page.evaluate(async () => {
        const image = __originalPlayer.active.image, bytes = await (await fetch(image.src)).arrayBuffer();
        const hash = await crypto.subtle.digest('SHA-256', bytes);
        return { url: image.src, width: image.naturalWidth, height: image.naturalHeight, bytes: bytes.byteLength,
          sha256: [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('') };
      });
      assert.match(proof.url, /^blob:/, 'Warmed playback reuses original bytes through the existing player');
      assert.deepEqual({ width: proof.width, height: proof.height, bytes: proof.bytes, sha256: proof.sha256 }, { width: entry.width, height: entry.height, bytes: entry.bytes, sha256: entry.sha256 });
      await page.evaluate(() => __originalPlayer.clear());
    }
    const signed = 'https://catalog.fixture.test/custom.webp?signature=a%2Fb&expires=123';
    assert.equal(await page.evaluate(url => giftMotionUrl('Heart', url), signed), signed, 'Uploaded catalog artwork remains authoritative with its query intact');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.evaluate(() => giftMotionUrl('Heart') === giftSticker('Heart').cover), true);
    assert.deepEqual(errors, []);
    console.log(`PASS gift originals: ${htmlBytes} byte HTML, no HQ/low-res animation base64, immutable SHA256 manifest, exact 720x1280/360x640 original 192-frame playback, catalog priority and reduced motion`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
