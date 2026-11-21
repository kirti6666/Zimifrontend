/* Exercise the packaged UI with the optional built-ins missing on older
   Android WebViews. All native work is recorded locally; no real checkout. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const account = { user: { id: '507f1f77bcf86cd799439001', name: 'Compatibility tester', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false, isPhoneVerified: true }, verification: 'none', requiresOnboarding: false };
const host = { id: '507f1f77bcf86cd799439011', name: 'Fixture host', role: 'host', serverRole: 'host', verified: true, online: true, availableForCall: true, ratePerMin: 10 };
const approvedHost = { user: { id: '507f1f77bcf86cd799439012', name: 'Legacy WebView host', role: 'host', serverRole: 'host', hostStatus: 'approved', isVerifiedHost: true, isPhoneVerified: true }, verification: 'verified', requiresOnboarding: false };
const hostCallStatus = { rate: 50, tier: 2, earnedCoins: 180000, next: { tier: 3, rate: 85, atCoins: 500000 }, tiers: [{ tier: 1, rate: 17 }, { tier: 2, rate: 50 }, { tier: 3, rate: 85 }], entryFeeCoins: 60, entryFeeHoldSeconds: 60, earlyEnds: { today: 0, limit: 2, penaltyCoins: 60 }, visibleDuringCalls: true };
const receive = (page, type, data = {}) => page.evaluate(message => Native.receive(message), { type, data });
const last = (page, type) => page.evaluate(type => __sent.filter(message => message.type === type).at(-1)?.data, type);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function assertLegacyViewportFallbacks() {
  let checked = 0;
  for (const name of fs.readdirSync(path.join(root, 'web')).filter(name => name.endsWith('.css'))) {
    const source = fs.readFileSync(path.join(root, 'web', name), 'utf8');
    const dynamic = /([\w-]+)\s*:\s*([^;{}]*dvh\b[^;{}]*)(?=;|})/g;
    for (const match of source.matchAll(dynamic)) {
      const lineStart = source.lastIndexOf('\n', match.index) + 1;
      const lineEnd = source.indexOf('\n', match.index);
      const line = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd);
      if (line.includes('@supports') && line.includes('1dvh')) continue;
      const ruleStart = source.lastIndexOf('{', match.index);
      const prior = source.slice(ruleStart + 1, match.index);
      const property = match[1];
      const expected = match[2].replaceAll('dvh', 'vh').replace(/\s+/g, '');
      const fallbacks = [...prior.matchAll(/([\w-]+)\s*:\s*([^;{}]+)/g)]
        .filter(candidate => candidate[1] === property)
        .map(candidate => candidate[2].replace(/\s+/g, ''));
      assert.ok(fallbacks.includes(expected), `${name}: ${property}:${match[2]} needs an earlier ${property}:${match[2].replaceAll('dvh', 'vh')} fallback`);
      checked++;
    }
  }
  assert.ok(checked > 0, 'Viewport compatibility contract must inspect dynamic viewport declarations');
  return checked;
}

(async () => {
  const viewportFallbacks = assertLegacyViewportFallbacks();
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

    // Chromium supports :has() and color-mix(), so emulate WebView 94 by
    // dropping those declarations. Go Live and its Filters sheet must retain
    // definite geometry and opaque surfaces through legacy fallbacks.
    const legacyLayout = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const legacyErrors = [];
    legacyLayout.on('pageerror', error => legacyErrors.push(error.message));
    legacyLayout.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) legacyErrors.push(message.text()); });
    await legacyLayout.route('https://**/*', route => route.abort());
    await legacyLayout.addInitScript(() => {
      window.__sent = [];
      window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) };
    });
    await legacyLayout.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href);
    const removedLegacyRules = await legacyLayout.evaluate(() => {
      let colorMix = 0;
      for (const style of document.querySelectorAll('style')) {
        const next = style.textContent.replace(/([;{])\s*([\w-]+\s*:[^;{}]*color-mix\([^;{}]*\)[^;{}]*)(?=;|})/g, (_, boundary) => {
          colorMix++;
          return boundary;
        });
        if (next !== style.textContent) style.textContent = next;
      }
      let has = 0;
      const strip = container => {
        const rules = container.cssRules;
        for (let index = rules.length - 1; index >= 0; index--) {
          const rule = rules[index];
          if (rule.selectorText?.includes(':has(')) {
            container.deleteRule(index);
            has++;
          } else if (rule.cssRules) {
            strip(rule);
          }
        }
      };
      for (const sheet of document.styleSheets) {
        try { strip(sheet); } catch (error) {
          if (error.name !== 'SecurityError') throw error;
        }
      }
      return { has, colorMix };
    });
    assert.ok(removedLegacyRules.has > 0, 'Legacy layout emulation must remove at least one :has() rule');
    assert.ok(removedLegacyRules.colorMix > 0, 'Legacy layout emulation must remove at least one color-mix() declaration');
    await receive(legacyLayout, 'session', approvedHost);
    await receive(legacyLayout, 'data.home', { hosts: [], stage: [], total: 0, page: 1, categories: [], unreadCount: 0 });
    await legacyLayout.evaluate(() => go('setup'));
    await receive(legacyLayout, 'host.callStatus', hostCallStatus);
    const goLiveLayout = await legacyLayout.evaluate(() => {
      const setup = document.querySelector('.hc-setup')?.getBoundingClientRect();
      const footer = document.querySelector('.hc-setup-footer')?.getBoundingClientRect();
      return {
        setupHeight: setup?.height || 0,
        footerTop: footer?.top ?? -1,
        footerBottom: footer?.bottom ?? -1,
        viewportHeight: innerHeight
      };
    });
    assert.ok(goLiveLayout.setupHeight > 0, 'Go Live setup keeps a non-zero height without CSS :has() support');
    assert.ok(goLiveLayout.footerBottom > 0 && goLiveLayout.footerTop < goLiveLayout.viewportHeight, 'Go Live footer stays inside the visible viewport without CSS :has() support');

    await legacyLayout.evaluate(() => {
      hsOpenSheet('appearance');
      document.querySelector('.hc-reference')?.classList.add('is-off');
    });
    await legacyLayout.locator('.hc-setup.zb-previewing [data-zimi-beauty-panel]').waitFor();
    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await legacyLayout.setViewportSize(viewport);
      const filters = await legacyLayout.evaluate(() => {
        const panel = document.querySelector('.zb-reference-panel');
        const box = element => {
          const rect = element?.getBoundingClientRect();
          return rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
        };
        const pseudo = getComputedStyle(document.querySelector('.hc-stage'), '::before');
        return {
          viewport: { width: innerWidth, height: innerHeight },
          previewing: document.querySelector('.hc-setup')?.classList.contains('zb-previewing'),
          panel: box(panel),
          title: box(panel?.querySelector('h2')),
          done: box(panel?.querySelector('.zb-done')),
          tabs: box(panel?.querySelector('.zb-tabs')),
          content: box(panel?.querySelector('.zb-content')),
          compare: box(document.querySelector('.zb-compare')),
          background: getComputedStyle(panel).backgroundColor,
          footerDisplay: getComputedStyle(panel.querySelector('.zb-footer')).display,
          silhouette: { content: pseudo.content, transform: pseudo.transform, background: pseudo.backgroundColor },
          overflow: document.documentElement.scrollWidth > innerWidth + 1
        };
      });
      const withinPanel = rect => rect && rect.left >= filters.panel.left - 1 && rect.right <= filters.panel.right + 1 && rect.top >= filters.panel.top - 1 && rect.bottom <= filters.panel.bottom + 1;
      assert.equal(filters.previewing, true, `${viewport.width}x${viewport.height}: Filters keeps preview mode active`);
      assert.ok(filters.panel?.width > 0 && filters.panel.height > 0, `${viewport.width}x${viewport.height}: Filters panel keeps non-zero geometry`);
      assert.ok(filters.panel.left >= -1 && filters.panel.right <= filters.viewport.width + 1 && filters.panel.top >= -1 && filters.panel.bottom <= filters.viewport.height + 1, `${viewport.width}x${viewport.height}: Filters panel stays in the viewport`);
      assert.notEqual(filters.background, 'rgba(0, 0, 0, 0)', `${viewport.width}x${viewport.height}: Filters panel keeps an opaque legacy background`);
      assert.ok(withinPanel(filters.title) && withinPanel(filters.done) && withinPanel(filters.tabs), `${viewport.width}x${viewport.height}: Filters title, Done and tabs stay reachable: ${JSON.stringify(filters)}`);
      assert.ok(withinPanel(filters.content) && filters.content.height > 0, `${viewport.width}x${viewport.height}: Filters controls stay inside a scrollable visible area`);
      assert.ok(filters.compare?.top >= -1 && filters.compare.bottom <= filters.panel.top + 1, `${viewport.width}x${viewport.height}: Compare control stays visible above the panel`);
      assert.equal(filters.footerDisplay, 'none', `${viewport.width}x${viewport.height}: Routine SDK status does not crowd the reference sheet`);
      assert.notEqual(filters.silhouette.content, 'none', `${viewport.width}x${viewport.height}: Camera-off silhouette remains visible`);
      assert.notEqual(filters.silhouette.transform, 'none', `${viewport.width}x${viewport.height}: Camera-off silhouette keeps its legacy transform`);
      assert.notEqual(filters.silhouette.background, 'rgba(0, 0, 0, 0)', `${viewport.width}x${viewport.height}: Camera-off silhouette keeps a solid fallback`);
      assert.equal(filters.overflow, false, `${viewport.width}x${viewport.height}: Filters does not create horizontal overflow`);
    }
    assert.deepEqual(legacyErrors, [], 'Legacy Go Live layout remains free of browser errors');
    await legacyLayout.close();

    console.log(`PASS WebView compatibility: ${viewportFallbacks} dynamic viewport declarations have legacy fallbacks; normal built-ins preserved; missing hasOwn/at/randomUUID and blocked storage retain startup, checkout, chat and cryptographic retry identities; Go Live and Filters retain visible geometry without :has() or color-mix()`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
