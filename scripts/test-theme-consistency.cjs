/* Selected server palettes must reach every authenticated screen, including
   mounted media. Native messages are intercepted; fake devices use no camera. */
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const member = { user: { id: '507f1f77bcf86cd799439001', name: 'Theme Member', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false, isPhoneVerified: true }, balance: 1250, verification: 'none', requiresOnboarding: false };
const creator = { id: '507f1f77bcf86cd799439011', name: 'Theme Creator', role: 'host', serverRole: 'host', category: 'Music', tag: 'Music and conversation', online: true, verified: true, availableForCall: true, ratePerMin: 0, entryFee: 0 };
const hostAccount = { ...member, user: { ...member.user, id: creator.id, name: creator.name, role: 'host', serverRole: 'host', hostStatus: 'approved', isVerifiedHost: true }, verification: 'verified' };
const stream = { id: '507f1f77bcf86cd799439021', hostId: creator.id, title: 'Palette regression live', category: 'Music', kind: 'video', viewers: 7, status: 'live' };
const host = { ...creator, stream };
const home = { hosts: [host], stage: [host], featured: host, total: 1, page: 1, limit: 20, categories: ['Music'], broadcasterCount: 1, availableCount: 1, speedMatchEnabled: true, bonus: null, unreadCount: 0 };
const catalog = { gifts: [{ id: '507f1f77bcf86cd799439031', name: 'Rose', emoji: '🌹', coins: 10 }], packs: [{ id: '507f1f77bcf86cd799439032', name: 'Starter', coins: 200, pricePaise: 9900 }], paymentsAvailable: true };
const receive = (page, type, data) => page.evaluate(message => Native.receive(message), { type, data });
const rgb = hex => 'rgb(' + hex.slice(1).match(/../g).map(part => parseInt(part, 16)).join(', ') + ')';
const failures = [];
const screenshots = [];
const check = (actual, expected, message) => { try { assert.equal(actual, expected, message); } catch (error) { const failure = `${message}: expected ${expected}, got ${actual}`; failures.push(failure); console.error(failure); } };
const colors = (background, surface, surfaceElevated, text, textMuted, primary, primaryContrast, secondary, border, success, danger) => ({ background, surface, surfaceElevated, text, textMuted, primary, primaryContrast, secondary, border, success, danger });
const themes = [
  { id: 'theme-original', name: 'Original', mode: 'dark', colors: colors('#210f1d', '#321e2c', '#3c2635', '#fce8f2', '#c5a9bc', '#c9086a', '#ffffff', '#ff9ccc', '#654356', '#45d5a0', '#ffb2b9'), typography: { fontFamily: 'system', fontScale: 1, fontWeight: '400', headingWeight: '700' } },
  { id: 'theme-rose', name: 'Rose', mode: 'light', colors: colors('#fff5fa', '#ffffff', '#f4dfeb', '#321525', '#79556a', '#b50a65', '#ffffff', '#a63f75', '#d6b5c9', '#147a53', '#b52b46'), typography: { fontFamily: 'system', fontScale: 1, fontWeight: '400', headingWeight: '700' } },
  { id: 'theme-ocean', name: 'Ocean', mode: 'dark', colors: colors('#101b2d', '#192a42', '#223951', '#edf6ff', '#b5cada', '#88d9ee', '#102030', '#88d9ee', '#466078', '#69d5aa', '#ffacb8'), typography: { fontFamily: 'rounded', fontScale: 1.1, fontWeight: '500', headingWeight: '800' } },
  { id: 'theme-amber', name: 'Amber', mode: 'light', colors: colors('#fff9ef', '#ffffff', '#f3e7d1', '#3b2a1e', '#79644e', '#815016', '#ffffff', '#815016', '#ccbba3', '#237d51', '#b63146'), typography: { fontFamily: 'serif', fontScale: 1.05, fontWeight: '400', headingWeight: '700' } },
].map(theme => ({ ...theme, active: true, isPremium: false }));
const bg = (selector, token) => [selector, 'backgroundColor', token];
const ink = (selector, token = 'text') => [selector, 'color', token];
const cta = selector => [bg(selector, 'primary'), ink(selector, 'primaryContrast')];

async function mountedThemes(page, name, rules = [], shot = false) {
  await page.evaluate(() => {
    window.__themeMounted = { screen: document.getElementById('screen').firstElementChild, media: [...document.querySelectorAll('video,audio')].map(node => ({ node, stream: node.srcObject })), captures: __captureCount, view: S.v };
  });
  for (const theme of themes) {
    await receive(page, 'data.themes', { selectedThemeId: theme.id, items: themes, premium: { active: true } });
    const common = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme, canvas: document.documentElement.dataset.canvas,
      scheme: getComputedStyle(document.documentElement).colorScheme,
      app: getComputedStyle(document.querySelector('.app')).backgroundColor,
      font: getComputedStyle(document.body).fontFamily,
      sameScreen: __themeMounted.screen === document.getElementById('screen').firstElementChild,
      sameMedia: __themeMounted.media.every(({ node, stream }) => node.isConnected && node.srcObject === stream) && __themeMounted.media.length === document.querySelectorAll('video,audio').length,
      captures: __captureCount - __themeMounted.captures, sameView: S.v === __themeMounted.view,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    }));
    const label = `${name} / ${theme.name}`;
    check(common.theme, theme.mode, `${label}: native theme mode`);
    check(common.canvas, theme.colors.background, `${label}: native safe-area canvas`);
    check(common.scheme, theme.mode, `${label}: color scheme`);
    check(common.app, rgb(theme.colors.background), `${label}: app canvas`);
    check(common.sameScreen, true, `${label}: changing theme preserves screen DOM`);
    check(common.sameMedia, true, `${label}: changing theme preserves media DOM and streams`);
    check(common.captures, 0, `${label}: theme change does not capture camera or microphone`);
    check(common.sameView, true, `${label}: theme change preserves navigation`);
    check(common.overflow, false, `${label}: no document width overflow`);
    check(common.font.includes({ system: 'Inter', rounded: 'Poppins', serif: 'Georgia' }[theme.typography.fontFamily]), true, `${label}: selected body font`);
    for (const [selector, property, token] of rules) {
      const actual = await page.locator(selector).first().evaluateAll((nodes, property) => nodes.length ? getComputedStyle(nodes[0])[property] : '<missing>', property);
      check(actual, rgb(theme.colors[token]), `${label}: ${selector} ${property}`);
    }
    const wrongFonts = await page.locator('#screen button, #screen input, #screen h1, #screen h2').evaluateAll(nodes => nodes.filter(node => node.getBoundingClientRect().width && getComputedStyle(node).fontFamily !== getComputedStyle(document.body).fontFamily).map(node => node.className || node.tagName));
    check(wrongFonts.length, 0, `${label}: controls/headings inherit typeface (${wrongFonts.join(', ')})`);
    if (shot && ['Rose', 'Ocean'].includes(theme.name)) {
      const filename = path.join(os.tmpdir(), `zimi-theme-${theme.name.toLowerCase()}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`);
      await page.screenshot({ path: filename }); screenshots.push(filename);
    }
  }
  console.log(`Checked ${name}: four palettes, stable mounted content/media`);
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  async function open(account) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => {
      window.__sent = []; window.__captureCount = 0;
      window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) };
      const acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = constraints => { __captureCount++; return acquire(constraints); };
    });
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href + '?role=sender');
    await receive(page, 'session', account);
    await receive(page, 'data.home', home);
    await receive(page, 'wallet.balance', { coins: 1250, earned: 0 });
    await receive(page, 'data.catalog', catalog);
    await receive(page, 'data.chats', { chats: [{ user: creator, last: 'Hello from your creator', time: 'Now', unread: 1, canSend: true }], total: 1, page: 1 });
    return page;
  }
  const nav = (page, view) => page.evaluate(({ view, id }) => { Home.giftTo = null; Room.sheet = ''; go(view, id); }, { view, id: creator.id });
  async function disabledStreams(page) {
    for (const view of ['broadcast', 'live']) {
      await nav(page, view);
      check(await page.evaluate(() => ['broadcast', 'live'].includes(S.v)), false, `${view}: paused streaming cannot be opened directly`);
      check(await page.locator('.zr-viewer,.zr-host,#live-title').count(), 0, `${view}: no streaming controls are rendered`);
    }
  }
  try {
    const page = await open(member);
    for (const view of ['home', 'explore', 'chats', 'profile']) {
      await nav(page, view);
      if (view === 'explore') await receive(page, 'data.home', home);
      const rules = view === 'home' ? [bg('.zh-person-card', 'surface'), ink('.zh-section-title h2'), ...cta('.zh-person-call'), ink('.zh-feed-tabs [aria-selected="true"]'), ink('.zh-feed-tabs [aria-selected="false"]', 'textMuted')] : view === 'explore' ? [bg('.zh-tile-caption', 'surface')] : view === 'chats' ? [bg('.zc-search', 'surfaceElevated'), ink('.zc-name')] : [bg('.zp-identity', 'surface'), ...cta('.zp-topup')];
      await mountedThemes(page, view, rules);
    }
    for (const view of ['themes', 'wallet', 'transactions', 'calls', 'blocked', 'safety', 'help', 'editprofile', 'notifications', 'board', 'host', 'post']) {
      await nav(page, view); await mountedThemes(page, view, view === 'wallet' ? [bg('.accthero', 'surface'), ink('.accthero'), ink('.accthero .eyebrow', 'textMuted'), ...cta('.accthero .cta')] : view === 'editprofile' ? cta('.editsave') : []);
    }
    await nav(page, 'search');
    await receive(page, 'data.search', { q: '', hosts: [creator], page: 1, total: 1 });
    await mountedThemes(page, 'search', [bg('.zh-search-header>div', 'surfaceElevated'), ink('#sq')]);
    await nav(page, 'coins'); await receive(page, 'data.catalog', catalog);
    await mountedThemes(page, 'coins', [bg('.zw-wallet', 'surface'), ink('.zw-wallet-main>div>span', 'textMuted'), ink('.zw-wallet p', 'textMuted'), ...cta('.zw-coins>.zh-primary')], true);
    await nav(page, 'thread');
    await receive(page, 'data.thread', { with: creator.id, canSend: true, messages: [{ id: 'thread-theme', from: creator.id, text: 'Hello from the server fixture', createdAt: new Date().toISOString() }] });
    await page.getByRole('textbox', { name: /^Message / }).fill('A themed message draft');
    await mountedThemes(page, 'thread', [bg('.zc-thread', 'background'), ink('.zc-thread'), bg('.zc-composer-field', 'surface'), ...cta('.zc-composer-send')], true);
    await page.evaluate(id => homeGifts(id), creator.id); await receive(page, 'data.catalog', catalog);
    await mountedThemes(page, 'thread gifts', [bg('.zh-sheet', 'surface'), ink('.zh-sheet'), bg('.zh-gifts>button', 'surfaceElevated'), ink('.zh-sheet-heading p', 'textMuted')]);
    await nav(page, 'precall');
    await mountedThemes(page, 'call setup', [bg('.zpc-setup', 'background'), ink('.zpc-setup h1'), ...cta('.zpc-primary')]);
    await page.evaluate(() => homeStartCall(false)); await page.locator('.ringscr').waitFor();
    await mountedThemes(page, 'outgoing dial', [bg('.ringscr', 'background'), ink('.ringscr h2'), ink('.ringscr p', 'textMuted')]);
    await page.evaluate(() => cancelDial());
    await disabledStreams(page);
    await page.evaluate(id => { Home.giftTo = null; Home.stream = null; Home.hosting = false; S.callId = 'theme-private-call'; go('call', id); zrCallChat(); }, creator.id);
    await mountedThemes(page, 'private video', [bg('.zr-room', 'background'), bg('.zr-compose', 'surface'), ink('.zr-compose input'), bg('.zr-pip', 'surface'), ink('.zr-call-feed .lvmsg.sys .txt', 'textMuted')], true);
    await page.evaluate(id => homeGifts(id), creator.id); await receive(page, 'data.catalog', catalog);
    await mountedThemes(page, 'call gifts', [bg('.zr-room .zh-sheet', 'surface'), ink('.zr-room .zh-sheet'), bg('.zh-gifts>button', 'surfaceElevated')]);
    await page.evaluate(() => { homeCloseGifts(); zrOpen('call-controls'); });
    await mountedThemes(page, 'call controls', [bg('.zr-sheet', 'surface'), ink('.zr-sheet'), bg('.zr-tool>span', 'surfaceElevated')]);
    await page.evaluate(() => zrClose());
    await page.evaluate(() => { S.callId = 'theme-private-voice'; go('voice'); });
    await mountedThemes(page, 'private voice', [bg('.zr-audio', 'background'), ink('.zr-voice h2'), ink('.zr-voice>span:last-child', 'textMuted')]);
    await page.evaluate(() => { S.sum = { sec: 65 }; go('summary'); });
    await mountedThemes(page, 'call summary', [bg('.zh-precall-details', 'surface'), ink('.zh-precall-details b'), ...cta('.zh-summary>.zh-primary')]);

    const hostPage = await open(hostAccount);
    for (const view of ['setup', 'waiting']) {
      await nav(hostPage, view);
      await mountedThemes(hostPage, `host ${view}`, [...cta('.hc-primary'), ink(view === 'setup' ? '.hc-camera-hint' : '.hc-waiting-status', 'textMuted')]);
    }
    await disabledStreams(hostPage);
    await hostPage.evaluate(member => { S.caller = { id: member.id, n: member.name, callId: 'theme-host-call', voice: false }; S.callId = S.caller.callId; go('hcall'); }, member.user);
    await mountedThemes(hostPage, 'host private call', [bg('.zr-room', 'background'), bg('.zr-pip', 'surface')]);
    for (const panel of ['call-controls', 'exit']) {
      await hostPage.evaluate(panel => zrOpen(panel), panel);
      await mountedThemes(hostPage, `host ${panel} dialog`, [bg('.zr-sheet', 'surface'), ink('.zr-sheet')]);
    }
    check(errors.length, 0, `No browser exceptions (${errors.join('; ')})`);
    for (const filename of screenshots) console.log(`Screenshot: ${filename}`);
    if (failures.length) { console.error(failures.join('\n')); throw new Error(`${failures.length} theme consistency assertion(s) failed`); }
    console.log('PASS selected colors/typefaces across member/host views and overlays; mounted media remains uninterrupted');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
