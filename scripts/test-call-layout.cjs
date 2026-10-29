/* Reference call layout with mocked native events and browser fake media only.
   Checks responsive controls, unchanged themes, and real confirmation flows. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const creator = { id: '507f1f77bcf86cd799439011', name: 'Aanya Kapoor', role: 'host', serverRole: 'host', category: 'Music', availableForCall: true, online: true, verified: true, ratePerMin: 60, entryFee: 0 };
const member = { id: '507f1f77bcf86cd799439012', name: 'Call tester', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false, isPhoneVerified: true };
const catalog = { gifts: [
  { id: '507f1f77bcf86cd799439031', name: 'Rose', emoji: '🌹', coins: 99 },
  { id: '507f1f77bcf86cd799439032', name: 'Love', emoji: '💋', coins: 199 },
  { id: '507f1f77bcf86cd799439033', name: 'Strawberry', emoji: '🍓', coins: 299 },
  { id: '507f1f77bcf86cd799439034', name: 'Bear', emoji: '🐻', coins: 399 },
  { id: '507f1f77bcf86cd799439035', name: 'Cheers', emoji: '🥂', coins: 499 },
  { id: '507f1f77bcf86cd799439036', name: 'Party', emoji: '🎉', coins: 699 },
  { id: '507f1f77bcf86cd799439037', name: 'Crown', emoji: '👑', coins: 999 },
  { id: '507f1f77bcf86cd799439038', name: 'Diamond', emoji: '💎', coins: 1999 },
], packs: [{ id: '507f1f77bcf86cd799439039', name: 'Starter', coins: 200, pricePaise: 9900 }], paymentsAvailable: true };
const receive = (page, type, data) => page.evaluate(message => Native.receive(message), { type, data });
const sent = (page, type) => page.evaluate(type => __sent.filter(message => message.type === type), type);
const button = (page, name) => page.getByRole('button', { name, exact: true });

async function checkLayout(page, label, voice = false) {
  const result = await page.locator('.zr-call').evaluate(room => {
    const box = room.getBoundingClientRect(), dock = room.querySelector('.zr-call-dock').getBoundingClientRect();
    const top = room.querySelector('.zr-call-stats').getBoundingClientRect(), pip = room.querySelector('.zr-pip')?.getBoundingClientRect();
    const stage = room.querySelector('.zr-video').getBoundingClientRect();
    const theme = ztCurrent(), color = value => { const swatch = document.createElement('span'); swatch.style.color = value; room.append(swatch); const result = getComputedStyle(swatch).color; swatch.remove(); return result; };
    const controls = [...room.querySelectorAll('.zr-call-toolbar button,.zr-call-dock>button')].map(el => ({ label: el.getAttribute('aria-label'), rect: el.getBoundingClientRect() }));
    return {
      overflow: document.documentElement.scrollWidth > innerWidth + 1 || room.scrollWidth > room.clientWidth + 1,
      bottomVisible: dock.bottom <= innerHeight + 1 && dock.top >= top.bottom,
      pip: pip ? { inside: pip.left >= box.left && pip.right <= box.right + 1, belowTop: pip.top >= top.bottom - 1, aboveDock: pip.bottom < dock.top } : null,
      outside: controls.filter(({ rect }) => rect.left < box.left - 1 || rect.right > box.right + 1 || rect.bottom > innerHeight + 1).map(x => x.label),
      crowded: controls.filter(({ rect }) => rect.width < 32 || rect.height < 32).map(x => x.label),
      roomBackground: getComputedStyle(room).backgroundColor, expectedBackground: color(ztDisplayColors(theme).background),
      roomColor: getComputedStyle(room).color, expectedColor: color(ztDisplayColors(theme).text),
      theme: document.documentElement.dataset.theme, expectedTheme: window.ZimiThemes.dark() ? 'dark' : 'light',
      fonts: [...room.querySelectorAll('button,input')].filter(el => el.getBoundingClientRect().width && getComputedStyle(el).fontFamily !== getComputedStyle(document.body).fontFamily).map(el => el.className),
      primaryTabs: document.getElementById('nav').getBoundingClientRect().height,
      fullStage: Math.abs(stage.left-box.left)<1 && Math.abs(stage.top-box.top)<1 && Math.abs(stage.width-box.width)<1 && Math.abs(stage.height-box.height)<1 && Math.abs(box.width-innerWidth)<1,
      opaqueChrome: [...room.querySelectorAll('.zr-top,.zr-bottom,.zr-call-stat,.hs-target-card')].filter(el=>getComputedStyle(el).backgroundColor!=='rgba(0, 0, 0, 0)').map(el=>el.className),
      croppedVideos: [...room.querySelectorAll('video')].filter(el=>getComputedStyle(el).objectFit!=='contain'||getComputedStyle(el).objectPosition!=='50% 50%').map(el=>el.outerHTML),
      blurred: [room,...room.querySelectorAll('*')].filter(el=>{const style=getComputedStyle(el);return style.backdropFilter!=='none'||/blur\(/.test(style.filter)}).map(el=>el.className),
      overlayColor: getComputedStyle(room.querySelector('.zr-top')).color,
    };
  });
  assert.equal(result.overflow, false, `${label}: no horizontal overflow`);
  assert.equal(result.bottomVisible, true, `${label}: bottom controls remain on screen`);
  assert.deepEqual(result.outside, [], `${label}: every control stays inside the call`);
  assert.deepEqual(result.crowded, [], `${label}: controls have usable touch targets`);
  assert.equal(result.roomBackground, result.expectedBackground, `${label}: the app canvas (white, or black in Dark Mode) is used`);
  assert.equal(result.roomColor, result.expectedColor, `${label}: the app text color is used`);
  assert.equal(result.theme, result.expectedTheme, `${label}: native chrome follows Dark Mode`);
  assert.deepEqual(result.fonts, [], `${label}: controls inherit the selected font`);
  assert.equal(result.primaryTabs, 0, `${label}: main tabs are absent in calls`);
  assert.equal(result.fullStage, true, `${label}: the camera stage reaches every screen edge behind the controls`);
  assert.deepEqual(result.opaqueChrome, [], `${label}: header, footer and stats remain transparent`);
  assert.deepEqual(result.croppedVideos, [], `${label}: main video and self preview preserve their full framing`);
  assert.deepEqual(result.blurred, [], `${label}: camera, overlays and dialogs never blur the screen`);
  assert.equal(result.overlayColor, voice ? result.expectedColor : 'rgb(255, 255, 255)', `${label}: video controls remain readable in every theme`);
  if (voice) assert.equal(result.pip, null, `${label}: voice calls have no camera preview`);
  else assert.deepEqual(result.pip, { inside: true, belowTop: true, aboveDock: true }, `${label}: self preview sits between stats and controls`);
}

async function setTheme(page, mode) {
  await page.evaluate(mode => {
    const base = mode === 'dark' ? ZThemeOriginal : ZThemeRose;
    const theme = mode === 'custom' ? { ...base, id: 'call-custom-theme', colors: { ...base.colors, background: '#f3f2fc', surface: '#fffcff', surfaceElevated: '#e5def3', text: '#12132c', textMuted: '#615879', primary: '#6543b8', primaryContrast: '#f4ecff', secondary: '#4e2f94', border: '#c6b8de' }, typography: { fontFamily: 'mono', fontScale: 1.1, fontWeight: '500', headingWeight: '800' } } : base;
    Native.receive({ type: 'data.themes', data: { items: [theme], selectedThemeId: theme.id } });
    window.ZimiThemes.setDark(mode === 'dark');
  }, mode);
}

// A test-only portrait frame makes the video visible underneath both overlays.
// The original camera streams are restored after each screenshot.
async function screenshotCall(page, name) {
  await page.evaluate(async () => {
    window.__layoutFrames=[];
    for(const video of document.querySelectorAll('.zr-call video')) {
      const canvas=document.createElement('canvas');canvas.width=720;canvas.height=1560;
      const context=canvas.getContext('2d'),gradient=context.createLinearGradient(0,0,720,1560);
      gradient.addColorStop(0,'#31596e');gradient.addColorStop(.5,'#162e37');gradient.addColorStop(1,'#5b6873');
      context.fillStyle=gradient;context.fillRect(0,0,720,1560);
      context.strokeStyle='#9bbabf';context.lineWidth=3;
      context.strokeRect(18,18,684,1524);
      for(let y=180;y<1560;y+=180){context.beginPath();context.moveTo(18,y);context.lineTo(702,y);context.stroke()}
      context.fillStyle='#c1d2d6';context.font='24px sans-serif';context.fillText('Full camera frame',235,790);
      const stream=canvas.captureStream(0);
      __layoutFrames.push({video,stream,previous:video.srcObject});
      video.srcObject=stream;stream.getVideoTracks()[0].requestFrame();await video.play();
    }
  });
  try { await page.screenshot({path:path.join(artifacts,name)}); }
  finally { await page.evaluate(()=>{for(const {video,stream,previous}of __layoutFrames){video.srcObject=previous;stream.getTracks().forEach(track=>track.stop())}delete window.__layoutFrames;ZimiMedia.attach()}); }
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  fs.mkdirSync(artifacts, { recursive: true });
  async function open(hosting = false) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => { window.__sent = []; window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) }; });
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href + '?role=sender');
    await receive(page, 'session', { user: hosting ? { ...creator, hostStatus: 'approved', isVerifiedHost: true, isPhoneVerified: true } : member, verification: hosting ? 'verified' : 'none', requiresOnboarding: false });
    await receive(page, 'data.home', { hosts: [creator], stage: [], featured: creator, total: 1, page: 1, categories: ['Music'], availableCount: 1 });
    await receive(page, 'wallet.balance', { coins: 1250, earned: 0 });
    await receive(page, 'data.catalog', catalog);
    await page.evaluate(async ({ hosting, creator, member }) => {
      await ZimiMedia.prepare(true);
      S.callId = hosting ? 'layout-host-call' : 'layout-member-call';
      S.callRate = 60; S.mic = 1; S.cam = 1; S.scam = 1;
      if (hosting) S.caller = { id: member.id, n: member.name, callId: S.callId, voice: false };
      go(hosting ? 'hcall' : 'call', hosting ? undefined : creator.id);
      Home.mediaStatus = 'Connected'; r();
    }, { hosting, creator, member });
    await page.locator('.zr-call').waitFor();
    await page.waitForFunction(() => {
      const video = document.querySelector('video[data-zimi-local]');
      return video?.readyState >= 2 && !video.paused && video.videoWidth > 0;
    });
    return page;
  }
  try {
    const page = await open();
    assert.equal(await page.evaluate(() => DEMO), false, 'Checks use the production UI with mocked account data');
    assert.equal(await page.evaluate(() => {
      const video=document.querySelector('video[data-zimi-local]');
      for(let i=0;i<10;i++)r();
      return video===document.querySelector('video[data-zimi-local]')&&video.srcObject?.active;
    }),true,'Production screen redraws preserve the playing camera element');
    await page.evaluate(() => { window.__lastCameraTime=document.querySelector('video[data-zimi-local]').currentTime; });
    await page.waitForFunction(() => document.querySelector('video[data-zimi-local]').currentTime > __lastCameraTime, { timeout: 5000 });
    await receive(page, 'data.loading', { resource: 'catalog', loading: true });
    await page.getByRole('status', { name: 'Loading call gifts', exact: true }).waitFor();
    await receive(page, 'data.loading', { resource: 'catalog', loading: false, error: 'Gifts unavailable' });
    await button(page, 'Retry loading gifts').waitFor();
    await receive(page, 'data.catalog', catalog);
    assert.equal(await page.locator('.zr-gift-rail button').count(), catalog.gifts.length, 'A completed catalog request restores the call gift rail');
    for (const mode of ['dark', 'light', 'custom']) {
      await setTheme(page, mode);
      for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 1280, height: 900 }]) {
        await page.setViewportSize(viewport);
        await checkLayout(page, `${mode} ${viewport.width}`);
        if (viewport.width === 390 && mode !== 'custom') await screenshotCall(page, `call-transparent-${mode}.png`);
      }
    }
    await page.setViewportSize({ width: 320, height: 640 });
    await page.evaluate(() => { g(S.h).n = 'Aanya Alexandra AVeryLongUnbrokenCreatorNameThatMustNotOverflow'; r(); });
    await checkLayout(page, 'long participant name');
    await page.evaluate(name => { g(S.h).n = name; r(); }, creator.name);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.match(await page.locator('.zr-call-person').innerText(), /Aanya Kapoor/);
    await page.evaluate(() => { S.sec = 30; tick(); });
    assert.equal(await page.locator('#ck').innerText(), '00:30');
    assert.match(await page.locator('#zr-call-cost').innerText(), /60\/min · 30 coins/);

    await button(page, 'Call controls').click();
    await page.locator('.zr-sheet').waitFor();
    await checkLayout(page, 'call controls panel without blur');
    await button(page, 'Mute').click();
    assert.equal(await page.evaluate(() => S.mic), 0, 'Mute still updates the call microphone');
    await button(page, 'Camera off').click();
    assert.equal(await page.evaluate(() => camOn()), 0, 'Camera toggle still updates the call camera');
    await button(page, 'Camera on').click();
    await button(page, 'Unmute').click();
    await button(page, 'Close panel').click();
    await button(page, 'Call options').click();
    assert.equal(await page.evaluate(() => Room.sheet), 'call-controls', 'Header options opens the same call controls');
    await page.keyboard.press('Escape');

    await button(page, 'Open call chat').click();
    await page.setViewportSize({ width: 390, height: 500 });
    await checkLayout(page, 'chat with reduced keyboard viewport');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('textbox', { name: 'Call message', exact: true }).fill('Hello from the private call');
    await button(page, 'Send message').click();
    const chat = (await sent(page, 'chat.send')).at(-1);
    assert.deepEqual(chat.data, { to: creator.id, text: 'Hello from the private call', inCall: true });
    await receive(page, 'chat.message', { id: 'private-reply', from: creator.id, name: creator.name, text: 'Glad you made it' });
    assert.match(await page.locator('#rfeed').innerText(), /Glad you made it/);

    const before = (await sent(page, 'gift.send')).length;
    await page.locator('.zr-gift-rail button').first().click();
    await receive(page, 'data.catalog', catalog);
    assert.equal((await sent(page, 'gift.send')).length, before, 'Selecting a rail gift does not spend coins');
    assert.equal(await page.evaluate(() => CoinUI.giftId), catalog.gifts[0].id, 'Rail selection is retained in the confirmation sheet');
    await button(page, 'Send gift').click();
    const gift = (await sent(page, 'gift.send')).at(-1);
    assert.equal(gift.data.gift, catalog.gifts[0].id);
    assert.equal(gift.data.to, creator.id);
    assert.equal(gift.data.inCall, true);
    await receive(page, 'gift.sent', { ...gift.data, id: 'confirmed-call-gift', coins: 99 });
    await receive(page, 'wallet.balance', { coins: 1151 });
    assert.equal(await page.evaluate(() => S.v), 'call', 'Gift confirmation keeps the call open');
    assert.match(await page.locator('.zr-call-stats').innerText(), /99/, 'Gift totals reflect confirmed activity');
    await page.evaluate(() => zrCallTopup());
    await receive(page, 'data.catalog', catalog);
    await page.getByRole('dialog', { name: 'Add coins', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => S.callId), 'layout-member-call', 'Adding coins preserves the active call');
    await button(page, 'Close gifts').click();
    await page.locator('.zr-hangup').click();
    assert.equal(await page.evaluate(() => S.v), 'summary');
    assert.equal((await sent(page, 'call.end')).at(-1).data.callId, 'layout-member-call');

    const hostPage = await open(true);
    await checkLayout(hostPage, 'host video');
    await receive(hostPage, 'gift.received', { id: 'received-call-gift', senderId: member.id, senderName: member.name, giftName: 'Rose', emoji: '🌹', coins: 99 });
    assert.match(await hostPage.locator('.zr-call-stats').innerText(), /99/, 'Host gift total uses received events');
    for(const mode of ['dark','light','custom']) {
      await setTheme(hostPage,mode);
      for(const viewport of [{width:320,height:640},{width:390,height:844},{width:1280,height:900}]) {
        await hostPage.setViewportSize(viewport);
        await checkLayout(hostPage,`host ${mode} ${viewport.width}`);
        if(viewport.width===390&&mode!=='custom')await screenshotCall(hostPage,`call-transparent-host-${mode}.png`);
      }
    }
    await hostPage.setViewportSize({width:390,height:844});
    await hostPage.evaluate(() => { S.caller.voice = true; r(); });
    await checkLayout(hostPage, 'host voice', true);
    await button(hostPage, 'Call options').click();
    await hostPage.locator('.zr-host-options').waitFor();
    assert.equal(await button(hostPage, 'Turn camera off').count(), 0, 'Voice calls hide video controls');
    await hostPage.keyboard.press('Escape');
    assert.equal(await hostPage.locator('.zr-host-options').count(), 0, 'Escape closes the call options');
    await hostPage.screenshot({ path: path.join(artifacts, 'call-transparent-voice.png') });
    await hostPage.locator('.zr-hangup').click();
    assert.equal((await sent(hostPage, 'call.end')).at(-1).data.callId, 'layout-host-call');
    assert.deepEqual(errors, [], 'No browser exceptions');
    console.log('PASS reference call layout: responsive themes, caller/host video/voice, media controls, chat, confirmed gifts, top-up and hang-up');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
