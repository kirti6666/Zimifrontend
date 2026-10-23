/* Browser contracts for app.launched: the page tells the native shell when its first
   screen has real content, so the launch logo never gives way to a skeleton. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');

const hostId = '507f1f77bcf86cd799439011';
const account = {
  user: { id: '507f1f77bcf86cd799439031', name: 'Mira North', role: 'sender', hostStatus: 'none', isVerifiedHost: false, languages: ['English'] },
  verification: 'none', requiresOnboarding: false,
};
const host = { id: hostId, name: 'Asha Sen', role: 'host', serverRole: 'host', category: 'Music', online: true, verified: true, availableForCall: true, ratePerMin: 0, stream: null };
const feed = { hosts: [host], stage: [host], featured: host, total: 1, page: 1, limit: 20, categories: ['Music'], broadcasterCount: 0, availableCount: 1, speedMatchEnabled: true, bonus: null, unreadCount: 0 };

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  async function open() {
    const page = await browser.newPage({ viewport: { width: 360, height: 707 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => {
      window.__sent = [];
      window.ReactNativeWebView = { postMessage: raw => window.__sent.push(JSON.parse(raw)) };
    });
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href);
    return page;
  }
  const receive = (page, type, data = {}) => page.evaluate(message => Native.receive(message), { type, data });
  // Let the microtask that follows each message run before counting.
  const launched = page => page.evaluate(() => new Promise(done => setTimeout(() => done(window.__sent.filter(m => m.type === 'app.launched').length))));
  const skeletons = page => page.locator('.zh-skeleton:visible, .ob-session-skeleton:visible').count();

  try {
    const signedOut = await open();
    assert.equal(await launched(signedOut), 0, 'The first paint comes before the saved session is known');
    await receive(signedOut, 'session.restoring');
    assert.ok(await skeletons(signedOut) > 0, 'Restoring draws its skeleton, which the logo must keep covered');
    assert.equal(await launched(signedOut), 0);
    await receive(signedOut, 'session.none');
    assert.equal(await launched(signedOut), 1, 'No saved session: the welcome screen is ready at once');
    assert.equal(await skeletons(signedOut), 0);
    await receive(signedOut, 'session.none');
    assert.equal(await launched(signedOut), 1, 'Sent once per page load');
    console.log('PASS signed out: the logo leaves for the welcome screen');

    const signedIn = await open();
    await receive(signedIn, 'session.restoring');
    await receive(signedIn, 'session', account);
    assert.ok(await skeletons(signedIn) > 0, 'Home is still loading its creators');
    assert.equal(await launched(signedIn), 0, 'Home skeletons stay behind the logo');
    await receive(signedIn, 'data.home', feed);
    await receive(signedIn, 'data.loading', { resource: 'home', loading: false, page: 1 });
    assert.equal(await launched(signedIn), 0, 'The header balance is still loading');
    await receive(signedIn, 'wallet.balance', { coins: 1234, earningsPaise: 0 });
    await receive(signedIn, 'data.loading', { resource: 'wallet', loading: false });
    assert.equal(await launched(signedIn), 1, 'Home with its creators and balance is ready');
    assert.equal(await skeletons(signedIn), 0);
    assert.equal(await signedIn.locator('.zh-balance').innerText(), '1,234');
    console.log('PASS signed in: the logo stays until Home has content');

    const failed = await open();
    await receive(failed, 'session.restoring');
    await receive(failed, 'data.loading', { resource: 'home', loading: true });
    await receive(failed, 'session.error', { message: 'BinzoLive is temporarily unavailable.' });
    assert.equal(await launched(failed), 1, 'A failed restore shows its retry screen');
    console.log('PASS a failed restore leaves for the retry screen');

    const offline = await open();
    await receive(offline, 'session.restoring');
    await receive(offline, 'connection.status', { connected: false });
    assert.equal(await launched(offline), 1, 'Offline at launch: the offline screen is not hidden behind the logo');
    console.log('PASS offline at launch shows the offline screen');

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
