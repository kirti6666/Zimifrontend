/* Focused browser contracts for post-registration access setup. All native
 * permission responses are fixtures; no device permissions or media are used.
 * Sources are overlaid in memory so this also runs before build:web. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const artifacts = process.env.PERMISSIONS_ARTIFACTS || path.join(os.tmpdir(), 'binzolive-permission-checks');
fs.mkdirSync(artifacts, { recursive: true });
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const base = read('assets/aurora.html');
const start = base.indexOf('/* Onboarding stays a classic script:');
const end = base.indexOf('/* Animated gift stickers bundled with the app', start);
assert.ok(start >= 0 && end > start, 'Generated page must expose the classic-source boundaries');
const onboarding = read('web/onboarding.js').replace(/__(?:OB_MEDIA|MODEL_PHOTO)_\d__/g, '');
const runtime = read('web/aurora-runtime.js').replace('__BRAND_LOGO__', '');
const sourcePage = (base.slice(0, start) + onboarding + '\n' + runtime + '\n' + base.slice(end))
  .replace('</head>', `<style>${read('web/onboarding.css')}</style></head>`);
const html = process.env.PERMISSIONS_USE_GENERATED === '1' ? base : sourcePage;
const member = { user: { id: '507f1f77bcf86cd799439011', name: 'Asha', role: 'sender', serverRole: 'user', hostStatus: 'none', onboardingPreference: 'member', languages: ['English'], photos: [] }, verification: 'none', requiresOnboarding: false };
const creator = { ...member, user: { ...member.user, id: '507f1f77bcf86cd799439012', onboardingPreference: 'creator' } };
const denied = { camera: 'denied', microphone: 'denied', notifications: 'denied' };
const granted = { camera: 'granted', microphone: 'granted', notifications: 'granted' };
const messages = (page, type) => page.evaluate(type => __messages.filter(item => item.type === type), type);
const last = async (page, type) => (await messages(page, type)).at(-1)?.data;
const receive = (page, type, data) => page.evaluate(message => Native.receive(message), { type, data });
const step = page => page.locator('[data-ob-step="permissions"]');
const button = (page, name) => page.getByRole('button', { name, exact: true });
let browser; const errors = [];
async function open(demo = false) {
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' });
  await context.route('**/*', route => route.request().url().startsWith('https://permissions.test/') ? route.fulfill({ contentType: 'text/html', body: demo ? html.replace('window.ZIMI_DEMO = false;', 'window.ZIMI_DEMO = true;') : html }) : route.abort());
  if (!demo) await context.addInitScript(() => { window.__messages = []; window.ReactNativeWebView = { postMessage: value => __messages.push(JSON.parse(value)) }; });
  await context.addInitScript(() => { window.__mediaOpened = 0; navigator.mediaDevices.getUserMedia = async () => { __mediaOpened++; throw new Error('Permission setup must never capture media'); }; });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto('https://permissions.test/app'); return page;
}
async function begin(page, account = member) {
  await receive(page, 'session', { ...account, requiresOnboarding: true });
  await page.evaluate(() => { Object.assign(S.auth, { step: 'interests', busy: 'profile.save', requestId: 901, name: 'Asha', gender: 'female', cat: 'Music', langs: ['English'], interests: [], photos: ['data:image/png;base64,AA=='], featured: 0 }); r(); });
  await receive(page, 'profile.saved', { onboarding: true, account, requestId: 901 });
  await step(page).waitFor();
}
async function status(page, permissions = denied, type = 'permissions.load') {
  const request = await last(page, type); assert.ok(request, `${type} is requested`);
  await receive(page, 'permissions.status', { permissions, requestId: request.requestId }); return request;
}
async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'No horizontal overflow');
  const clipped = await step(page).locator('button').evaluateAll(elements => elements.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent));
  assert.deepEqual(clipped, [], 'Controls wrap their labels');
  await page.locator('#ob-permission-continue').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('#ob-permission-continue').isVisible(), true);
}
(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
  try {
    const page = await open(); await begin(page);
    assert.equal((await messages(page, 'permissions.request')).length, 0, 'Loading the introduction never prompts');
    assert.equal((await messages(page, 'permissions.settings')).length, 0);
    const first = await last(page, 'permissions.load');
    await receive(page, 'permissions.status', { permissions: granted, requestId: first.requestId - 1 });
    assert.equal(await page.getByRole('status', { name: 'Checking device access' }).count(), 1, 'Stale replies cannot finish loading');
    await status(page); await button(page, 'Allow access').click();
    assert.deepEqual(Object.keys(await last(page, 'permissions.request')), ['requestId']);
    await status(page, { camera: 'granted', microphone: 'denied', notifications: 'blocked' }, 'permissions.request');
    assert.equal(await page.getByText('Blocked in settings', { exact: true }).count(), 1);
    assert.equal((await messages(page, 'permissions.settings')).length, 0, 'Blocked status never opens settings automatically');
    await button(page, 'Open settings').click(); await status(page, granted, 'permissions.settings');
    await noOverflow(page); await button(page, 'Continue').click();
    await page.waitForFunction(() => S.v === 'home');
    await receive(page, 'session', member); assert.equal(await step(page).count(), 0, 'Completed returning sessions never show the introduction');
    assert.equal(await page.evaluate(() => __mediaOpened), 0);
    await page.context().close();

    const skip = await open(); await begin(skip); await status(skip); await button(skip, 'Allow access').click();
    const pending = await last(skip, 'permissions.request'); await button(skip, 'Not now').click();
    assert.equal((await last(skip, 'permissions.cancel')).requestId, pending.requestId);
    await receive(skip, 'permissions.status', { requestId: pending.requestId, permissions: granted });
    assert.equal(await step(skip).count(), 0, 'Late native replies cannot reopen a completed step'); await skip.context().close();

    const resumed = await open(); await receive(resumed, 'session', { ...creator, requiresOnboarding: true });
    await resumed.reload(); await receive(resumed, 'session', creator); await step(resumed).waitFor();
    await status(resumed, { camera: 'blocked', microphone: 'denied', notifications: 'unavailable' });
    const request = await last(resumed, 'permissions.load');
    await receive(resumed, 'permissions.error', { requestId: request.requestId - 1, message: 'Stale failure' });
    assert.equal(await resumed.getByText('Stale failure').count(), 0);
    await button(resumed, 'Not now').click();
    await resumed.waitForFunction(() => ['kyc', 'agency'].includes(S.v));
    assert.equal(await resumed.evaluate(() => S.role), 'sender', 'Permission choices cannot grant creator access');
    await resumed.context().close();

    const failed = await open(); await begin(failed); const load = await last(failed, 'permissions.load');
    await receive(failed, 'permissions.error', { requestId: load.requestId, message: 'Access check failed.' });
    assert.equal(await failed.getByRole('alert').textContent(), 'Access check failed.');
    await button(failed, 'Try again').click(); await status(failed);
    await button(failed, 'Allow access').click(); const retired = await last(failed, 'permissions.request');
    await receive(failed, 'session', creator);
    assert.equal((await last(failed, 'permissions.cancel')).requestId, retired.requestId);
    await receive(failed, 'permissions.error', { requestId: retired.requestId, message: 'Previous account error' });
    assert.equal(await failed.getByText('Previous account error').count(), 0); await failed.context().close();

    for (const theme of ['light', 'dark']) {
      const visual = await open(); await begin(visual); await status(visual, { camera: 'blocked', microphone: 'denied', notifications: 'unavailable' });
      await visual.evaluate(theme => { ZimiThemes.setDark(theme === 'dark'); }, theme);
      await noOverflow(visual); await visual.screenshot({ path: path.join(artifacts, `permissions-${theme}-320-actions.png`) });
      await visual.evaluate(() => zimiScrollTo(0)); await visual.screenshot({ path: path.join(artifacts, `permissions-${theme}-320.png`) });
      assert.equal(await visual.locator('.ob-permissions').evaluate(el => getComputedStyle(el).backgroundColor), theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)');
      await visual.evaluate(() => {
        const sizes = [...document.querySelectorAll('.ob-permissions *')].filter(el => [...el.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())).map(el => [el, parseFloat(getComputedStyle(el).fontSize) * 2]);
        for (const [el, size] of sizes) el.style.setProperty('font-size', `${size}px`, 'important');
      });
      await noOverflow(visual); await visual.screenshot({ path: path.join(artifacts, `permissions-${theme}-200text-actions.png`) });
      await visual.evaluate(() => zimiScrollTo(0)); await visual.screenshot({ path: path.join(artifacts, `permissions-${theme}-200text.png`) }); await visual.context().close();
    }
    const preview = await open(true);
    await preview.evaluate(() => { S.v = 'login'; obStartPermissionSetup(undefined, false); });
    await step(preview).waitFor(); assert.equal(await preview.getByText('Not available', { exact: true }).count(), 3);
    assert.equal(await button(preview, 'Allow access').count(), 0); await button(preview, 'Continue').click(); await preview.context().close();
    assert.deepEqual(errors, []);
    console.log(`PASS permission setup: explicit access, skip/cancel, status/error correlation, recovery, account isolation, creator routing, honest preview, themes/320px/200% text. Artifacts: ${artifacts}`);
  } finally { await browser?.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
