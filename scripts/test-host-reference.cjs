// Reference flow uses real bridge acknowledgments; only this test supplies fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const host = { id: '507f1f77bcf86cd799439017', name: 'Host', role: 'host', hostStatus: 'approved', isVerifiedHost: true };
const status = { rate: 50, tier: 2, earnedCoins: 180000, next: { tier: 3, rate: 85, atCoins: 500000 }, tiers: [{ tier: 1, rate: 17 }, { tier: 2, rate: 50 }, { tier: 3, rate: 85 }], entryFeeCoins: 60, entryFeeHoldSeconds: 60, earlyEnds: { today: 0, limit: 2, penaltyCoins: 60 }, visibleDuringCalls: true };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  fs.mkdirSync(artifacts, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => { window.__sent = []; window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) }; });
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href);
    const receive = (type, data) => page.evaluate(message => Native.receive(message), { type, data });
    const button = name => page.getByRole('button', { name, exact: true });
    const session = user => receive('session', { user, verification: user.isVerifiedHost ? 'verified' : 'none', requiresOnboarding: false });
    await session(host);
    await receive('data.home', { hosts: [], stage: [], total: 0, page: 1, categories: ['Music'] });
    await page.evaluate(() => { window.__captures = 0; ZimiMedia.prepare = () => { __captures++; return new Promise(resolve => window.__resolveCapture = resolve); }; });
    assert.match(await page.locator('.zh-host-entry').innerText(), /You’re offline/);
    await button('Get ready to go online').click();
    assert.equal(await page.evaluate(() => S.v), 'setup');
    assert.equal(await page.evaluate(() => __captures), 0, 'Opening setup never captures media');
    await receive('operation.error', { action: 'host.callStatus.load', message: 'Call details unavailable' });
    assert.equal(await page.getByRole('status', { name: 'Loading your call price' }).count(), 0, 'Failed terms stop loading');
    await button('Retry call details').click();
    assert.equal(await page.getByRole('status', { name: 'Loading your call price' }).count(), 1, 'Retry starts real loading again');
    await receive('host.callStatus', status);
    await page.evaluate(() => document.getElementById('app-notice')?.remove());

    // Capture both themes and ensure bottom actions remain reachable on small phones.
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => { const value = theme === 'dark' ? ZThemeOriginal : ZThemeRose; Native.receive({ type: 'data.themes', data: { items: [value], selectedThemeId: value.id } }); }, theme);
      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
        await button('Go online for calls').scrollIntoViewIfNeeded();
        const layout = await page.evaluate(() => {
          const btn = document.querySelector('.hc-setup-footer button').getBoundingClientRect();
          return { overflow: document.documentElement.scrollWidth > innerWidth + 1, bottom: btn.bottom, top: btn.top, height: innerHeight };
        });
        assert.equal(layout.overflow, false, `${theme}/${width}: no horizontal overflow`);
        assert.ok(layout.top >= 0 && layout.bottom <= layout.height + 1, `${theme}/${width}: Go online is reachable`);
        if (width === 390) await page.screenshot({ path: path.join(artifacts, `host-setup-${theme}.png`) });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });

    // Choosing a mission target updates the open sheet in place instead of redrawing the screen.
    await button('Mission').click();
    await page.locator('.hs-sheet').waitFor();
    await page.evaluate(() => { window.__missionSheet = document.querySelector('.hs-sheet'); window.__setupVideo = document.querySelector('.hc-stage video'); });
    await button('500K').click();
    assert.equal(await page.evaluate(() => document.querySelector('.hs-sheet') === __missionSheet && document.querySelector('.hc-stage video') === __setupVideo), true, 'A mission choice keeps the sheet and camera mounted');
    assert.equal(await button('500K').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.hsFocus), 'goal-500000', 'Focus stays on the chosen target');
    await page.evaluate(() => r());
    assert.match(await page.evaluate(() => document.querySelector('.hs-sheet').style.getPropertyValue('--hs-enter-age')), /^-\d+ms$/, 'A redraw resumes the sheet entrance instead of replaying it');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.hs-sheet').count(), 0, 'Escape closes the mission sheet');
    await button('Go online for calls').click();
    assert.equal(await page.evaluate(() => S.v), 'setup', 'Wait for presence acknowledgment');
    assert.equal(await button('Go online for calls').isDisabled(), true);
    await receive('presence.saved', { online: true, visible: true });
    await receive('host.callStatus', status);
    assert.equal(await page.evaluate(() => S.v), 'waiting');
    await page.screenshot({ path: path.join(artifacts, 'host-online-light.png') });
    await button('Browse the app').click();
    assert.match(await page.locator('.zh-host-entry').innerText(), /You’re online/);
    await receive('presence.saved', { online: false, visible: false });
    assert.match(await page.locator('.zh-host-entry').innerText(), /You’re offline/, 'Recovered presence refreshes Home');
    await receive('presence.saved', { online: true, visible: true });
    await button('Manage your call availability').click();
    await receive('call.incoming', { callId: 'incoming-reference', from: { id: 'member', name: 'Imran Q.', city: 'Bhopal', level: 20 }, voice: true, rate: 50, entryFee: 60, feeHoldSeconds: 60 });
    assert.equal(await page.locator('.accept [data-icon="ph"]').count(), 1, 'Voice calls show a phone accept action');
    await page.screenshot({ path: path.join(artifacts, 'host-incoming-light.png') });
    await button('Accept').click();
    assert.equal(await button('Accept').isDisabled(), true, 'Accept stays pending while media prepares');
    assert.equal(await page.getByRole('status', { name: '' }).filter({ hasText: 'Preparing your private call' }).count(), 1);
    await page.evaluate(() => __resolveCapture());
    await page.waitForFunction(() => __sent.some(m => m.type === 'call.accept' && m.data.callId === 'incoming-reference'));
    await receive('call.failed', { message: 'Please retry this call' });
    assert.equal(await button('Accept').isDisabled(), false, 'Failed acceptance can be retried');
    await button('Decline').click();
    await button('Go offline').click();
    assert.equal(await page.evaluate(() => S.v), 'waiting', 'Going offline also waits for acknowledgment');
    await receive('presence.saved', { online: false, visible: false });
    assert.equal(await page.evaluate(() => S.v), 'home');
    for (const user of [{ ...host, hostStatus: 'pending', isVerifiedHost: false }, { ...host, role: 'sender', hostStatus: 'none', isVerifiedHost: false }]) {
      await session(user);
      assert.equal(await page.locator('.zh-host-entry').count(), 0, 'Only approved hosts get the availability band');
    }
    const preview = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    preview.on('pageerror', error => errors.push(error.message));
    await preview.route('https://**/*', route => route.abort());
    await preview.goto(pathToFileURL(path.join(root, 'dist/index.html')).href + '?role=host&approvedHost=1');
    await preview.evaluate(() => { S.loggedIn = 1; go('home'); });
    await preview.screenshot({ path: path.join(artifacts, 'host-home-reference.png') });
    await preview.getByRole('button', { name: 'Get ready to go online', exact: true }).click();
    assert.equal(await preview.locator('.hc-setup').count(), 1, 'Preview shares the production setup');
    assert.equal(await preview.getByRole('status', { name: 'Loading your call price' }).count(), 0, 'Preview terms are explicitly demo data');
    await preview.getByRole('button', { name: 'Go online for calls', exact: true }).click();
    assert.equal(await preview.locator('.hc-waiting').count(), 1, 'Preview shares the production waiting screen');
    await preview.getByRole('button', { name: 'Go offline', exact: true }).click();
    assert.equal(await preview.evaluate(() => S.online), 0);
    await preview.evaluate(() => { S.caller = nextCaller(); go('hcall'); S.sec = 8; hostTick(); });
    assert.equal(await preview.locator('.zr-gift-celebration').count(), 1, 'Demo gifts use the same celebration as production receipts');
    assert.deepEqual(errors, [], 'No browser errors');
    console.log('PASS host reference: approved Home entry, terms retry, responsive themes, acknowledged presence, incoming acceptance/retry, and shared demo flow');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
