/* Icon motion contracts (web/icons.css, web/icons.js) against the demo preview build. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  const open = async (options = {}) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, ...options });
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.goto(pathToFileURL(path.join(root, 'dist/index.html')).href + '?role=sender');
    return page;
  };
  const press = locator => locator.dispatchEvent('pointerdown', { pointerType: 'touch', button: 0, bubbles: true });
  const motion = locator => locator.evaluate(icon => ({ name: getComputedStyle(icon).animationName, tap: icon.classList.contains('zi-tap'), delay: icon.style.animationDelay, transform: getComputedStyle(icon).transform }));
  try {
    const page = await open();
    for (const view of ['home', 'explore', 'board', 'chats', 'profile', 'settings', 'notifications', 'coins', 'wallet', 'host', 'precall', 'thread', 'help']) {
      await page.evaluate(value => go(value, 'aanya'), view);
      const untagged = await page.evaluate(() => [...document.querySelectorAll('svg')]
        .filter(svg => !svg.parentElement.closest('svg') && !svg.classList.contains('art') && !svg.classList.contains('zw-pack-art') && !svg.classList.contains('zi-icon'))
        .map(svg => svg.parentElement.className || svg.parentElement.tagName));
      assert.deepEqual(untagged, [], `Every icon on ${view} comes from an icon helper and carries data-icon`);
    }
    console.log('PASS icons: every icon on the main screens is tagged for motion');

    await page.evaluate(() => go('home'));
    const trophy = page.locator('.zh-trophy>.zi-icon');
    assert.equal(await trophy.getAttribute('data-icon'), 'trophy', 'The leaderboard trophy comes from the icon helper');
    await press(page.locator('.zh-trophy'));
    assert.deepEqual((({ name, tap }) => ({ name, tap }))(await motion(trophy)), { name: 'zi-press', tap: true }, 'A press uses the shared restrained acknowledgement');
    await page.waitForFunction(() => !document.querySelector('.zh-trophy>.zi-icon').classList.contains('zi-tap'));
    assert.equal((await motion(trophy)).name, 'none', 'Header icons stay still after the press');

    await page.getByRole('button', { name: 'Chat', exact: true }).click();
    const tab = await motion(page.locator('.zh-nav [data-tab=chats]>.zi-icon'));
    assert.equal(tab.name, 'zi-press');
    assert.equal(tab.tap, true, 'A press animation continues on the control after the screen redraws');
    assert.match(tab.delay, /^-\d+ms$/, 'The redrawn icon resumes from the elapsed time instead of restarting');
    assert.equal(await page.locator('#screen').evaluate(screen => screen.getAnimations().length > 0), true, 'The tab still runs its content transition');

    await page.evaluate(() => go('thread', 'aanya'));
    await page.locator('#ti').fill('Hello');
    await press(page.locator('.zc-composer-send'));
    assert.equal((await motion(page.locator('.zc-composer-send>.zi-icon'))).name, 'zi-press');
    const typed = page.locator('.zc-composer-add>.zi-icon');
    await page.locator('#ti').press(' ');
    assert.equal((await motion(typed)).tap, false, 'Typing in a field never animates nearby icons');

    await page.evaluate(() => { S.caller = nextCaller(); document.getElementById('screen').innerHTML = vRing(); });
    assert.equal((await motion(page.locator('.ringact .accept>.zi-icon'))).name, 'zi-ring-loop', 'An incoming call rings its accept icon');
    const hangUp = page.locator('.voiceend>.zi-icon');
    const resting = (await motion(hangUp)).transform;
    assert.equal(resting, 'matrix(-0.707107, 0.707107, -0.707107, -0.707107, 0, 0)', 'Hang-up icons keep their turned phone');
    await press(page.locator('.voiceend'));
    await page.waitForTimeout(150);
    const ringing = (await motion(hangUp)).transform.match(/-?[\d.]+/g).map(Number);
    assert.ok(ringing[0] < 0 && ringing[3] < 0, 'A hang-up press rings around the turned phone instead of undoing it');
    // Coins now uses the shared Back header; its former history row is gone.
    for (const [view, selector] of [['settings', '.zp-account-summary>svg']]) {
      await page.evaluate(view => go(view), view);
      const arrow = page.locator(selector), original = (await motion(arrow)).transform;
      assert.notEqual(original, 'none', `${view}: the chevron has its intended CSS orientation`);
      await arrow.evaluate(icon => ZimiIcons.play(icon));
      assert.equal((await motion(arrow)).transform, original, `${view}: press feedback preserves the CSS-rotated chevron`);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal((await motion(arrow)).transform, original, `${view}: reduced motion preserves the CSS-rotated chevron`);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    }
    await page.close();
    console.log('PASS icons: restrained press feedback, redraw continuity, incoming-call motion, typing and hang-up orientation');

    const reduced = await open({ reducedMotion: 'reduce' });
    await press(reduced.locator('.zh-trophy'));
    const still = await motion(reduced.locator('.zh-trophy>.zi-icon'));
    assert.equal(still.name, 'none');
    assert.equal(still.tap, false, 'Reduced motion turns press animations off');
    await reduced.evaluate(() => go('thread', 'aanya'));
    assert.deepEqual(await reduced.locator('.zi-icon').evaluateAll(icons => [...new Set(icons.map(icon => getComputedStyle(icon).animationName))]), ['none'], 'Reduced motion stops every looping icon');
    await reduced.close();
    assert.deepEqual(errors, []);
    console.log('PASS icons: reduced motion and no uncaught browser errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
