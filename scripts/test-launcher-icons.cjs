/* Launcher artwork contracts, separate from the web SVG motion suite. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '..');
const read = relative => PNG.sync.read(fs.readFileSync(path.join(root, relative)));
const original = fs.readFileSync(path.join(root, 'assets/brand/app_icon.png'));
assert.equal(crypto.createHash('sha256').update(original).digest('hex'), '8275ff2fe07d3c48d256f4b212fb0ecbb492d83f44e41c752ccbb48358b0d8a9', 'Keep the actual supplied artwork unchanged');
if (fs.existsSync(path.join(root, '../app_icon.png'))) assert.deepEqual(original, fs.readFileSync(path.join(root, '../app_icon.png')));
assert.deepEqual(original, fs.readFileSync(path.join(root, 'web/binzolive-icon.png')));
const source = PNG.sync.read(original);
function bounds(image, viewport = { x: 0, y: 0, size: image.width }) {
  let left = viewport.size, top = viewport.size, right = -1, bottom = -1;
  for (let y = 0; y < viewport.size; y++) for (let x = 0; x < viewport.size; x++) {
    if (image.data[((y + viewport.y) * image.width + x + viewport.x) * 4 + 3] > 200) {
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  return [left, top, right + 1, bottom + 1].map(value => value / viewport.size);
}
function matchesArtwork(image, viewport, label) {
  const expected = bounds(source), actual = bounds(image, viewport), tolerance = Math.max(.012, 2 / viewport.size);
  actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) <= tolerance, `${label}: artwork fills the visible square without extra padding/cropping (${actual} vs ${expected})`));
  let error = 0, samples = 0;
  for (const fy of [.2, .35, .5, .65, .8]) for (const fx of [.2, .35, .5, .65, .8]) {
    const from = (Math.floor(fy * source.height) * source.width + Math.floor(fx * source.width)) * 4;
    const to = ((viewport.y + Math.floor(fy * viewport.size)) * image.width + viewport.x + Math.floor(fx * viewport.size)) * 4;
    if (source.data[from + 3] < 240 || image.data[to + 3] < 240) continue;
    for (let channel = 0; channel < 3; channel++) { error += Math.abs(source.data[from + channel] - image.data[to + channel]); samples++; }
  }
  assert.ok(samples > 30 && error / samples < 22, `${label}: preserve the supplied artwork colors and placement`);
}
const legacy = read('assets/brand/icon.png'), foreground = read('assets/brand/adaptive-icon.png');
for (const image of [legacy, foreground]) { assert.equal(image.width, 1024); assert.equal(image.height, 1024); assert.equal(image.data[3], 0, 'No opaque added corner/backplate'); }
matchesArtwork(legacy, { x: 0, y: 0, size: legacy.width }, 'Legacy');
const visible = Math.round(foreground.width * 72 / 108), inset = Math.floor((foreground.width - visible) / 2);
matchesArtwork(foreground, { x: inset, y: inset, size: visible }, 'Adaptive 72dp viewport');
for (let y = 0; y < foreground.height; y++) for (let x = 0; x < foreground.width; x++) {
  if (x < inset || y < inset || x >= inset + visible || y >= inset + visible) assert.equal(foreground.data[(y * foreground.width + x) * 4 + 3], 0, 'Adaptive overscan is transparent');
}
const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
assert.equal(config.android.adaptiveIcon.backgroundColor, '#00000000');
assert.equal(config.android.adaptiveIcon.backgroundImage, undefined);
assert.equal(fs.existsSync(path.join(root, 'assets/brand/adaptive-icon-background.png')), false);
const nativeRoot = path.join(root, 'android/app/src/main/res');
if (fs.existsSync(nativeRoot)) {
  for (const name of ['ic_launcher', 'ic_launcher_round']) {
    const xml = fs.readFileSync(path.join(nativeRoot, 'mipmap-anydpi-v26', `${name}.xml`), 'utf8');
    assert.match(xml, /<background android:drawable="@color\/iconBackground"/);
    assert.doesNotMatch(xml, /@mipmap\/ic_launcher_background/);
  }
  assert.match(fs.readFileSync(path.join(nativeRoot, 'values/colors.xml'), 'utf8'), /<color name="iconBackground">#00000000<\/color>/);
  for (const [density, scale] of [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]]) {
    const folder = path.join(nativeRoot, 'mipmap-' + density);
    const icon = PNG.sync.read(fs.readFileSync(path.join(folder, 'ic_launcher.webp')));
    const layer = PNG.sync.read(fs.readFileSync(path.join(folder, 'ic_launcher_foreground.webp')));
    assert.equal(icon.width, 48 * scale); assert.equal(layer.width, 108 * scale);
    matchesArtwork(icon, { x: 0, y: 0, size: icon.width }, `Native ${density} legacy`);
    matchesArtwork(layer, { x: 18 * scale, y: 18 * scale, size: 72 * scale }, `Native ${density} adaptive`);
    assert.equal(fs.existsSync(path.join(folder, 'ic_launcher_background.webp')), false);
  }
}
console.log('PASS launcher icons: original preserved, no colored backing/visible padding, full adaptive viewport and native density geometry');
