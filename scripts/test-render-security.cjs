/* Run with node scripts/test-render-security.cjs. Reads web sources directly. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.abort());
    await page.setContent('<main><div id="top"></div><div id="screen"></div><div id="nav"></div></main>');
    await page.addScriptTag({ content: 'window.ZIMI_DEMO=false; window.ReactNativeWebView={postMessage(){}}; window.__xss=0;' });
    for (const file of ['bridge.js', 'onboarding.js', 'aurora-runtime.js']) {
      await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'web', file), 'utf8') });
    }
    const result = await page.evaluate(() => {
      const attack = 'A " autofocus onfocus="window.__xss++" ><img src=x onerror="window.__xss++"> & O\'Neil';
      const normal = 'O\'Neil & "friends" <3';
      const host = { id: '507f1f77bcf86cd799439011', n: attack, c: attack, tag: attack, seed: 4, live: 1, on: 1, rate: 0, fee: 0, v: '10', host: 1, lvl: 1, recv: 0, sent: 0, fol: 0, following: 0 };
      H.splice(0, H.length, host);
      S.h = host.id;
      const testRoot = document.createElement('section'); document.body.appendChild(testRoot);
      function safeMarkup(markup) {
        testRoot.innerHTML = markup;
        return !testRoot.querySelector('[onerror],script,iframe,object,embed') &&
          [...testRoot.querySelectorAll('*')].every(element => [...element.attributes].every(attribute =>
            !(/^on/i.test(attribute.name) && attribute.value.includes('__xss'))));
      }
      const profile = profilePage(host, host, false);
      const rendererResults = [
        ['creator card', card(host)],
        ['conversation preview', row([host.id, attack, attack, 2])],
        ['profile', profile],
        ['call identity', idPill(host, false)],
        ['transactions', txRow([attack, attack, 10, 'gift'])],
        ['MVP profile', mvpBlock(host, host, false, [host])],
      ].map(([label, markup]) => ({ label, safe: safeMarkup(markup), textPreserved: testRoot.textContent.includes(attack) }));
      const maliciousId = { ...host, id: "');window.__xss++;//" };
      const safeId = safeMarkup(card(maliciousId)) && [...testRoot.querySelectorAll('[onclick],[onkeydown]')].every(element =>
        ![element.getAttribute('onclick'), element.getAttribute('onkeydown')].some(value => value && value.includes('__xss')));
      testRoot.innerHTML = '<div id="rfeed"></div>';
      S.rmsgs = [['host', attack, attack], ['sys', '', normal], ['evil" onerror="window.__xss++', attack, attack]];
      paintFeed();
      const feedSafe = !testRoot.querySelector('[onerror],script,img') && document.getElementById('rfeed').textContent.includes(attack);
      const originalAvatar = 'https://media.example.test/photo.png';
      const badImage = 'https://media.example.test/x" onerror="window.__xss++';
      const imageSafe = imageSrc(badImage) === '' && imageSrc('javascript:window.__xss++') === '' && imageSrc('data:image/svg+xml,<svg onload="window.__xss++"/>') === '' && imageSrc(originalAvatar) === originalAvatar;
      S.editName = normal; S.editCity = attack; S.editAbout = attack; S.avatarData = badImage; S.coverData = badImage; S.postData = [badImage];
      const editSafe = safeMarkup(vEditProfile()) && testRoot.querySelector('#editname').value === normal && testRoot.querySelector('#editabout').value === attack;
      const gallerySafe = safeMarkup(photoGrid([badImage, 'javascript:window.__xss++'], 'kycPhotos', 'dropPhoto'));
      S.q = attack; S.sq = attack; S.cache.chats = 1; S.v = 'search';
      const searchSafe = safeMarkup(topFor()) && testRoot.querySelector('#sq').value === attack && safeMarkup(searchRows());
      testRoot.innerHTML = '<div id="fl"></div>';
      playGift('Gift', '&#127873;', 1, '', attack);
      const caption = testRoot.querySelector('.fxtag');
      const captionSafe = caption?.textContent === attack && !caption.querySelector('img,script');
      S.v = 'hcall'; S.caller = { ...host, n: '<img/src=x/onerror=window.__xss++>' }; S.tray = 1; S.cache.gifts = 1;
      const traySafe = safeMarkup(giftTray()) && testRoot.textContent.includes(S.caller.n);
      return { rendererResults, safeId, feedSafe, imageSafe, editSafe, gallerySafe, searchSafe, captionSafe, traySafe, executions: window.__xss };
    });
    // The conversation thread is rendered by the chats layer, which builds on the home layer.
    for (const file of ['host-access.js', 'loading.js', 'home.js', 'chats.js']) {
      await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'web', file), 'utf8') });
    }
    Object.assign(result, await page.evaluate(() => {
      const attack = 'A " autofocus onfocus="window.__xss++" ><img src=x onerror="window.__xss++"> & O\'Neil';
      const normal = 'O\'Neil & "friends" <3';
      const testRoot = document.createElement('section'); document.body.appendChild(testRoot);
      const host = H[0];
      host.stream = { id: 'stream-1', title: attack, viewers: 12 };
      S.v = 'thread'; S.h = host.id; ContentLoading.thread.loading = false;
      S.msgs = [{ mine: false, text: attack, time: attack }, { mine: true, text: normal, time: '10:00', status: 'read' }, { kind: 'gift', mine: true, gift: { name: attack, emoji: attack, coins: 5 } }, { kind: 'gift', mine: false, gift: { name: attack, html: attack, coins: 5 } }];
      testRoot.innerHTML = zcThread();
      paint();
      const chatText = document.getElementById('tf').textContent;
      const chatSafe = !testRoot.querySelector('[onerror],script,img') && chatText.includes(attack) && chatText.includes(normal) &&
        [...testRoot.querySelectorAll('*')].every(element => [...element.attributes].every(attribute => !(/^on/i.test(attribute.name) && attribute.value.includes('__xss')))) &&
        testRoot.querySelector('.zc-thread-live').textContent.includes(attack) && testRoot.querySelector('#ti').getAttribute('aria-label') === 'Message ' + attack;
      return { chatSafe, executions: window.__xss }; // cumulative across both passes
    }));
    for (const item of result.rendererResults) {
      assert.equal(item.safe, true, `${item.label} must escape markup and attributes`);
      assert.equal(item.textPreserved, true, `${item.label} must preserve readable text`);
    }
    for (const key of ['safeId', 'chatSafe', 'feedSafe', 'imageSafe', 'editSafe', 'gallerySafe', 'searchSafe', 'captionSafe', 'traySafe']) assert.equal(result[key], true, key);
    assert.equal(result.executions, 0, 'rendered values must never execute JavaScript');
    assert.deepEqual(errors, [], 'renderers must not throw browser errors');
    console.log('PASS: 15 rendering surfaces escape untrusted text, identifiers and photo URLs; normal text remains unchanged.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
