/* Exercise the packaged UI with the optional built-ins missing on older
   Android WebViews. All native work is recorded locally; no real checkout. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const account = { user: { id: '507f1f77bcf86cd799439001', name: 'Compatibility tester', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false, isPhoneVerified: true }, verification: 'none', requiresOnboarding: false };
const host = { id: '507f1f77bcf86cd799439011', name: 'Fixture host', role: 'host', serverRole: 'host', verified: true, online: true, availableForCall: true, ratePerMin: 10 };
const receive = (page, type, data = {}) => page.evaluate(message => Native.receive(message), { type, data });
const last = (page, type) => page.evaluate(type => __sent.filter(message => message.type === type).at(-1)?.data, type);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  try {
    for (const missing of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text()); });
      await page.route('https://**/*', route => route.abort());
      await page.addInitScript(missing => {
        window.__sent = [];
        window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) };
        window.__builtins = [Object.hasOwn, Array.prototype.at, crypto.randomUUID];
        window.__randomCalls = 0;
        if (missing) {
          Object.hasOwn = undefined;
          Array.prototype.at = undefined;
          Object.defineProperty(crypto, 'randomUUID', { configurable: true, writable: true, value: undefined });
          const random = crypto.getRandomValues.bind(crypto);
          Object.defineProperty(crypto, 'getRandomValues', { value: bytes => { __randomCalls++; return random(bytes); } });
          // Unavailable convenience storage must not prevent login or navigation.
          Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new DOMException('Storage unavailable', 'SecurityError'); };
        }
      }, missing);
      await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href);
      await page.waitForFunction(() => __sent.some(message => message.type === 'ready' && message.data.demo === false));
      if (!missing) assert.equal(await page.evaluate(() => __builtins.every((value, index) => value === [Object.hasOwn, Array.prototype.at, crypto.randomUUID][index])), true, 'Modern native built-ins are preserved');
      const ids = await page.evaluate(() => {
        const inherited = Object.create({ hidden: 1 }); inherited.hasOwnProperty = 2;
        if (Object.hasOwn(inherited, 'hidden') || !Object.hasOwn(inherited, 'hasOwnProperty') || ['first', 'last'].at(-1) !== 'last') throw new Error('Compatibility lookup changed');
        return Array.from({ length: 40 }, () => crypto.randomUUID());
      });
      assert.ok(ids.every(value => uuid.test(value)), 'Retry IDs remain valid version 4 UUIDs');
      assert.equal(new Set(ids).size, ids.length, 'Independent attempts have independent retry IDs');
      if (missing) assert.ok(await page.evaluate(() => __randomCalls >= 40), 'Fallback IDs use platform cryptographic randomness');

      await receive(page, 'session', account);
      await receive(page, 'data.home', { hosts: [host], stage: [], total: 1, page: 1, categories: [], unreadCount: 0 });
      await receive(page, 'wallet.balance', { coins: 500, earningsPaise: 0 });
      await page.evaluate(() => go('coins'));
      await receive(page, 'data.catalog', { packs: [{ id: 'pack-1', name: 'Starter', coins: 100, pricePaise: 4900 }], gifts: [], paymentsAvailable: true });
      await page.getByRole('button', { name: 'Get 100 coins', exact: true }).click();
      await page.waitForFunction(() => __sent.some(message => message.type === 'payments.routes.load'));
      await receive(page, 'payments.routes', { ...await last(page, 'payments.routes.load'), mode: 'ROTATION', routeChoice: false, routes: [] });
      const dialog = page.getByRole('dialog', { name: 'Select payment method', exact: true });
      await dialog.getByRole('radio', { name: /^Secure checkout/ }).check();
      await dialog.getByRole('button', { name: 'Continue to payment', exact: true }).click();
      const checkout = await last(page, 'wallet.checkout');
      assert.match(checkout.idempotencyKey, uuid, 'Checkout reaches native transport with a stable valid retry ID');
      assert.equal(checkout.packId, 'pack-1');
      assert.equal(await page.evaluate(() => S.bal), 500, 'Creating a checkout never credits coins locally');

      await page.evaluate(id => zcOpen(id), host.id);
      await receive(page, 'data.thread', { with: host.id, canSend: true, messages: [] });
      await page.evaluate(() => zcThreadSend('Local compatibility fixture'));
      const sent = await last(page, 'chat.send');
      assert.match(sent.clientId, uuid, 'Chat send reaches native transport without randomUUID errors');
      assert.equal(sent.to, host.id);
      assert.deepEqual(errors, [], 'Startup, checkout and chat remain free of browser errors');
      await page.close();
    }
    console.log('PASS WebView compatibility: normal built-ins preserved; missing hasOwn/at/randomUUID and blocked storage retain startup, checkout, chat and cryptographic retry identities');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
