/* Actual source bundle in memory: no generated assets or live APIs are changed. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fileURLToPath, pathToFileURL } = require('node:url');
const ts = require('typescript');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const modules = new Map();
function load(relative) {
  const file = path.resolve(root, relative);
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} }; modules.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const requireLocal = id => id === './client' ? { ApiError: class extends Error {} } : load(path.relative(root, path.resolve(path.dirname(file), id + '.ts')));
  vm.runInNewContext(code, { module, exports: module.exports, require: requireLocal, console, URL }, { filename: file });
  return module.exports;
}
function productionPage() {
  const buildFile = path.join(root, 'scripts/build-web.mjs'), output = new Map();
  const code = fs.readFileSync(buildFile, 'utf8').replace(/^import .*;\r?\n/gm, '').replaceAll('import.meta.url', '__buildUrl');
  vm.runInNewContext(code, {
    existsSync: fs.existsSync, readFileSync: fs.readFileSync,
    writeFileSync: (file, value) => output.set(file, value), mkdirSync() {},
    dirname: path.dirname, join: path.join, fileURLToPath,
    __buildUrl: pathToFileURL(buildFile).href, copyWebBranding() {}, WEB_ICON_HEAD: '',
    process: { env: { ZIMI_DEMO: '0', INCLUDE_ADMIN: '0' } }, console: { log() {} },
  }, { filename: buildFile });
  return output.get(path.join(root, 'assets/aurora.html')).replace('<head>', '<head><script>window.__sent=[];window.ReactNativeWebView={postMessage:raw=>__sent.push(JSON.parse(raw))};</script>');
}
const id = n => '507f1f77bcf86cd799439' + String(n).padStart(3, '0');
const creator = (n, country) => ({ id: id(n), name: ['Ananya', 'Mira', 'Ama', 'No country', 'Unset country', 'Invalid country'][n-1], role: 'host', serverRole: 'host', category: 'Talk', about: 'Music and conversation', verified: true, online: false, availableForCall: true, ratePerMin: 60, avatarUrl: `https://country.fixture.test/${n}.webp`, coverUrl: `https://country.fixture.test/${n}.webp`, ...(country === undefined ? { city: 'Delhi', countryCode: '+91' } : { country }) });
const creators = [creator(1, 'India'), creator(2, 'United Arab Emirates'), creator(3, 'Côte d’Ivoire'), creator(4), creator(5, ''), creator(6, ['India'])];
const feed = { hosts: creators, featured: creators[0], stage: [], total: creators.length, page: 1, limit: 20, categories: [], availableCount: creators.length, broadcasterCount: 0, unreadCount: 0, speedMatchEnabled: false, bonus: null };
const receive = (page, type, data = {}) => page.evaluate(message => Native.receive(message), { type, data });
const acceptFeed = async page => { await receive(page, 'data.home', feed); await receive(page, 'data.loading', { resource: 'home', loading: false, page: 1 }); };
const card = (page, n) => page.locator(`article[data-host-id="${id(n)}"]`);
async function assertCountries(page) {
  for (const [n, country] of [[1, 'India'], [2, 'United Arab Emirates'], [3, 'Côte d’Ivoire']]) assert.equal(await card(page, n).locator('[data-creator-country]').innerText(), country);
  for (const n of [4, 5, 6]) assert.equal(await card(page, n).locator('[data-creator-country]').count(), 0, 'Missing/empty/malformed country has no city or phone-prefix fallback');
  for (const n of [1, 2, 3, 4, 5, 6]) {
    assert.equal(await card(page, n).getByRole('button', { name: 'Video call ' + creators[n-1].name, exact: true }).isEnabled(), true);
    assert.match(await card(page, n).innerText(), /Online/);
    assert.match(await card(page, n).locator('.zh-creator-price').innerText(), /60\/min/);
  }
}
(async () => {
  const adapters = load('src/api/adapters.ts');
  for (const country of [' India ', 'United Arab Emirates', 'Côte d’Ivoire']) {
    assert.equal(adapters.hostFrom({ _id: 'host', country }).country, country.trim());
    assert.equal(adapters.accountFrom({ user: { _id: 'owner', country } }).user.country, country.trim());
    assert.equal(adapters.publicProfileFrom({ _id: 'host', name: 'Host', followers: 0, following: 0, isFollowing: false, country }).country, country.trim());
  }
  assert.equal(Object.hasOwn(adapters.hostFrom({ _id: 'host', city: 'Delhi', countryCode: '+91' }), 'country'), false);
  assert.equal(adapters.hostFrom({ _id: 'host', country: '' }).country, '');
  for (const country of [null, ['India'], {}, 'x'.repeat(101), 'India\u0000']) assert.equal(adapters.hostFrom({ _id: 'host', country }).country, '');
  const settings = { profile: { id: 'owner', country: ' Côte d’Ivoire ', countryCode: '+91' }, stats: { fans: 0, following: 0, giftsSent: 0, giftsReceived: 0, coinsSent: 0, coinsReceived: 0 }, preferences: { pushNotifications: false, matchCategory: null, appearance: 'light' }, privacy: { discoverable: true, showActivity: true, allowRequests: false }, capabilities: {} };
  assert.equal(adapters.profileSettingsFrom(settings).profile.country, 'Côte d’Ivoire');
  delete settings.profile.country;
  assert.equal(Object.hasOwn(adapters.profileSettingsFrom(settings).profile, 'country'), false);
  console.log('PASS creator country adapters: explicit normalized field, Unicode names, absence retained and no dialing/city inference');
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(7000); page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => {
      const match = route.request().url().match(/^https:\/\/country\.fixture\.test\/(\d+)\.webp$/);
      return match ? route.fulfill({ status: 200, contentType: 'image/webp', body: fs.readFileSync(path.join(root, 'web/onboarding-media', `india-${match[1]}.webp`)) }) : route.abort();
    });
    await page.setContent(productionPage(), { waitUntil: 'domcontentloaded' });
    await receive(page, 'session', { user: { id: id(99), name: 'Country tester', role: 'sender', serverRole: 'user', hostStatus: 'none' }, verification: 'none', requiresOnboarding: false });
    await receive(page, 'wallet.balance', { coins: 1000 });
    await page.evaluate(() => go('home')); await acceptFeed(page); await assertCountries(page);
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    for (const dark of [false, true]) {
      await page.evaluate(value => ZimiThemes.setDark(value), dark);
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        const countriesContained = await page.locator('.zh-creator-country').evaluateAll(nodes => nodes.every(node => { const own = node.getBoundingClientRect(), card = node.closest('article').getBoundingClientRect(); return own.left >= card.left && own.right <= card.right + 1; }));
        assert.equal(countriesContained, true, 'Country metadata fits inside its card');
        await assertCountries(page);
        if (width === 390) await page.screenshot({ path: path.join(root, 'artifacts', `creator-country-${dark?'dark':'light'}-mobile.png`) });
      }
    }
    await page.getByRole('tab', { name: 'Explore', exact: true }).click(); await acceptFeed(page); await assertCountries(page);
    assert.equal(await page.evaluate(() => __sent.filter(message => message.type === 'home.reload').at(-1).data.mode), 'following');
    await page.evaluate(() => go('all-creators')); await acceptFeed(page); await assertCountries(page);
    await page.evaluate(() => { go('search'); S.sq = 'country'; });
    await receive(page, 'data.search', { q: 'country', hosts: creators, total: creators.length, page: 1 }); await assertCountries(page);
    await card(page, 2).getByRole('button', { name: 'Video call Mira', exact: true }).click();
    assert.equal(await page.evaluate(() => S.v), 'precall');
    assert.equal(await page.evaluate(() => __sent.filter(message => message.type === 'call.start').length), 0, 'Country never changes the existing call preparation flow');
    const partial = await page.evaluate(hostId => {
      homeRemember({ id: hostId, name: 'Updated host' });
      const retained = g(hostId).country;
      homeRemember({ id: hostId, name: 'Updated host', country: '' });
      return { retained, cleared: homeCountryLabel(g(hostId)) };
    }, id(1));
    assert.deepEqual(partial, { retained: 'India', cleared: '' }, 'Partial updates retain country while explicit clearing hides it');
    const escaped = await page.evaluate(() => { const node = document.createElement('div'); node.innerHTML = homeCountryLabel({ country: '<img src=x onerror=alert(1)>' }); return { text: node.innerText, images: node.querySelectorAll('img').length }; });
    assert.equal(escaped.images, 0); assert.equal(escaped.text, '<img src=x onerror=alert(1)>');
    assert.deepEqual(errors, []);
    console.log('PASS creator country UI: featured/Home/Following/All Creators/Search, light/dark at320/390px, hidden missing data, escaping and unchanged call/status/price');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
