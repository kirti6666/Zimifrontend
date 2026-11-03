import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Keep the WebView's HTML small. Large authored animations are original public
// files; they must never be replaced with a smaller export during packaging.
export const INLINE_STICKER_LIMIT = 3 * 1024 * 1024;
export const INLINE_HTML_LIMIT = 10 * 1024 * 1024;

export function inspectGiftWebp(bytes) {
  if (bytes.length < 30 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP' || bytes.readUInt32LE(4) + 8 !== bytes.length)
    throw new Error('Gift original must be a complete RIFF WebP file');
  let width, height, frameCount = 0;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const kind = bytes.toString('ascii', offset, offset + 4), size = bytes.readUInt32LE(offset + 4), start = offset + 8;
    if (start + size > bytes.length) throw new Error('Gift original contains a truncated WebP chunk');
    if (kind === 'VP8X' && size >= 10) { width = bytes.readUIntLE(start + 4, 3) + 1; height = bytes.readUIntLE(start + 7, 3) + 1; }
    if (kind === 'ANMF') frameCount++;
    offset = start + size + (size % 2);
  }
  if (!width || !height || !frameCount) throw new Error('Gift original must retain its animated WebP canvas and frames');
  return { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, width, height, frameCount };
}

export function originalGiftUrl(entry, bytes, name) {
  if (!entry || typeof entry !== 'object') throw new Error(`Missing public original for oversized gift ${name}`);
  const actual = inspectGiftWebp(bytes);
  for (const field of ['sha256', 'bytes', 'width', 'height', 'frameCount'])
    if (entry[field] !== actual[field]) throw new Error(`Public original ${name} ${field} does not match the authored file`);
  let url;
  try { url = new URL(entry.url); } catch { throw new Error(`Public original ${name} requires an HTTPS URL`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !url.pathname.endsWith(`/gift-originals/bundled/${actual.sha256}.webp`))
    throw new Error(`Public original ${name} must use its immutable SHA256-owned HTTPS key`);
  return url.href;
}

export function giftStickerResource(root, manifest, name) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Invalid bundled gift resource name');
  const bytes = readFileSync(join(root, 'web', 'stickers', `${name}.webp`));
  if (bytes.length <= INLINE_STICKER_LIMIT) return `data:image/webp;base64,${bytes.toString('base64')}`;
  if (name.endsWith('-cover')) throw new Error(`Gift cover ${name} exceeds the 3 MiB inline limit`);
  if (manifest?.schemaVersion !== 1) throw new Error('Public gift originals manifest schemaVersion must be 1');
  return originalGiftUrl(manifest.originals?.[name], bytes, name);
}

export function assertInlineHtmlSize(html, label) {
  const bytes = Buffer.byteLength(html, 'utf8');
  if (bytes > INLINE_HTML_LIMIT) throw new Error(`${label} HTML is ${(bytes / 1048576).toFixed(1)} MiB; keep the WebView page at most 10 MiB to avoid a blank startup`);
  return bytes;
}
