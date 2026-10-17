// Screenshots and screen recordings are blocked on video calls and chats, and allowed everywhere else.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const hostId = '507f1f77bcf86cd799439011';
const host = { id: hostId, name: '[Test] Sara', category: 'Fitness', online: true, availableForCall: true, verified: true, ratePerMin: 0, entryFee: 0 };
const account = { user: { id: '507f1f77bcf86cd799439019', name: 'Member', role: 'sender', hostStatus: 'none', isVerifiedHost: false }, verification: 'none', requiresOnboarding: false };

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => { window.__sent = []; window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) }; });
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href + '?role=sender');
    const receive = (type, data) => page.evaluate(message => Native.receive(message), { type, data });
    const states = () => page.evaluate(() => __sent.filter(message => message.type === 'screen.secure').map(message => message.data.on));
    const secured = async () => (await states()).at(-1);
    await receive('session', account);
    await receive('data.home', { hosts: [host], stage: [], featured: host, total: 1, page: 1, categories: ['Fitness'], availableCount: 1 });

    assert.deepEqual(await states(), [false], 'The app learns the starting state once, even after a reload');
    await page.evaluate(() => { r(); r(); });
    assert.deepEqual(await states(), [false], 'Re-rendering the same screen sends nothing');

    await page.evaluate(() => go('chats'));
    assert.equal(await secured(), true, 'The chat list shows message previews');
    await page.evaluate(id => go('thread', id), hostId);
    assert.equal(await secured(), true, 'A conversation');
    await page.evaluate(() => go('home'));
    assert.equal(await secured(), false);

    await page.evaluate(id => go('precall', id), hostId);
    assert.equal(await secured(), false, 'Setting up a call shows nothing private yet');
    await page.getByRole('button', { name: 'Start video call', exact: true }).click();
    await page.waitForFunction(() => __sent.some(message => message.type === 'call.start'));
    await receive('call.connected', { callId: 'video', initiator: true, peerId: hostId, voice: false });
    await page.locator('.zr-call').waitFor();
    assert.equal(await secured(), true, 'A video call');
    await receive('call.ended', { callId: 'video' });
    await page.locator('.zh-summary').waitFor();
    assert.equal(await secured(), false, 'The call summary');

    await receive('verify.incoming', { callId: 'staff' });
    await page.locator('#zv-call').waitFor();
    assert.equal(await secured(), true, 'A staff verification video call');
    await receive('verify.ended', { callId: 'staff', status: 'missed' });
    await page.locator('#zv-call').waitFor({ state: 'detached' });
    assert.equal(await secured(), false);
    assert.deepEqual(errors, []);
    console.log('PASS private screens: chats, conversations, video calls and staff verification calls block screenshots; other screens allow them');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
