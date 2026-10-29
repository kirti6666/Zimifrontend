/* Navigation geometry, motion, and host access contracts against the production
   WebView bundle. Native writes and camera access are captured locally. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const member = { user: { id: '507f1f77bcf86cd799439011', name: 'Asha Member', role: 'sender', hostStatus: 'none', isVerifiedHost: false }, balance: 1250, verification: 'none', requiresOnboarding: false };
const approved = { ...member, user: { ...member.user, name: 'Mira Creator', role: 'host', hostStatus: 'approved', isVerifiedHost: true }, verification: 'verified' };
const hosts = Array.from({ length: 16 }, (_, index) => ({ id: '507f1f77bcf86cd799439' + String(index + 100).padStart(3, '0'), name: `Creator ${index + 1}`, role: 'host', category: 'Music', online: true, verified: true, availableForCall: true, ratePerMin: 0 }));
const home = { hosts, stage: hosts.slice(0, 6), featured: hosts[0], total: hosts.length, page: 1, limit: 20, categories: ['Music', 'Talk'], broadcasterCount: 0, availableCount: hosts.length, speedMatchEnabled: true, bonus: null, unreadCount: 0 };
const chats = { chats: hosts.map((user, index) => ({ id: `conversation-${index}`, user, last: 'A real conversation supplied by the native bridge', time: 'Today', unread: index === 0 ? 1 : 0, lastAt: new Date(Date.now() - index * 60000).toISOString() })), page: 1, total: hosts.length, unreadCount: 1, unreadConversations: 1 };
const tabs = ['Home', 'Chat', 'Profile', 'Settings'];

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  const open = async (reducedMotion = 'reduce') => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion });
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && !/^Failed to load resource: net::ERR_FAILED/.test(message.text())) errors.push(message.text());
    });
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => {
      window.__sent = [];
      window.ReactNativeWebView = { postMessage: raw => window.__sent.push(JSON.parse(raw)) };
    });
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href + '?role=sender');
    await page.evaluate(() => {
      window.__mediaPrepared = 0;
      window.ZimiMedia.prepare = async () => { window.__mediaPrepared += 1; };
      window.ZimiMedia.attach = () => {};
    });
    return page;
  };
  const receive = (page, type, data = {}) => page.evaluate(message => Native.receive(message), { type, data });
  const navigate = (page, view) => page.evaluate(value => go(value), view);
  const clickTab = (page, name) => page.locator('.zh-nav').getByRole('button', { name, exact: true }).click();
  const current = page => page.evaluate(() => S.v);
  const seed = async (page, account) => {
    await receive(page, 'session', account);
    await receive(page, 'data.home', home);
    await receive(page, 'data.chats', chats);
    await receive(page, 'data.posts', { posts: [] });
    await receive(page, 'data.calls', { calls: [] });
    await receive(page, 'wallet.balance', { coins: 1250, earningsPaise: 0 });
    await navigate(page, 'home');
  };
  const metrics = page => page.evaluate(() => {
    const rect = element => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; };
    const button = element => ({ label: element.getAttribute('aria-label') || element.textContent.trim(), ...rect(element), icon: element.querySelector('svg') ? rect(element.querySelector('svg')) : null, fontSize: getComputedStyle(element).fontSize });
    return {
      nav: rect(document.querySelector('.zh-nav')),
      navButtons: [...document.querySelectorAll('.zh-nav button')].map(button)
    };
  });
  const sameGeometry = (actual, expected, label) => {
    for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(actual[key] - expected[key]) <= 0.75, `${label} ${key} changed: ${expected[key]} -> ${actual[key]}`);
  };
  const sameNavigation = (actual, expected, label) => {
    sameGeometry(actual.nav, expected.nav, `${label} nav`);
    for (const group of ['navButtons']) {
      assert.equal(actual[group].length, expected[group].length, `${label} ${group} count`);
      actual[group].forEach((button, index) => {
        assert.equal(button.label, expected[group][index].label);
        sameGeometry(button, expected[group][index], `${label} ${button.label}`);
        assert.equal(button.fontSize, expected[group][index].fontSize, `${label} ${button.label} font size`);
        if (button.icon) sameGeometry(button.icon, expected[group][index].icon, `${label} ${button.label} icon`);
      });
    }
  };
  const animations = page => page.locator('#screen').evaluate(element => element.getAnimations().filter(animation => animation.playState === 'running' || animation.playState === 'pending').map(animation => ({ duration: animation.effect.getTiming().duration, frames: animation.effect.getKeyframes() })));
  const settled = page => page.waitForFunction(() => document.getElementById('screen').getAnimations().every(animation => !['running', 'pending'].includes(animation.playState)));
  try {
    const layout = await open();
    for (const account of [member, approved]) {
      await seed(layout, account);
      for (const width of [320, 390, 630, 1280]) {
        await layout.setViewportSize({ width, height: 900 });
        await clickTab(layout, 'Home');
        const baseline = await metrics(layout);
        assert.equal(baseline.navButtons.length, 4, 'Members and hosts share the same four tabs');
        for (const name of tabs) {
          await clickTab(layout, name);
          assert.equal(await current(layout), name==='Chat'?'chats':name.toLowerCase());
          assert.equal(await layout.locator('.zh-nav [aria-current="page"]').innerText(), name);
          sameNavigation(await metrics(layout), baseline, `${account.user.role} ${name} at ${width}px`);
          assert.equal(await layout.locator('.zh-header').count(), name === 'Home' ? 1 : 0, `${name} only shows the discovery-tab header on Home`);
          assert.equal(await layout.locator('.zh-brand,.zh-logo').count(), 0, `${name} has no app-name header`);
          if (name === 'Home') {
            assert.deepEqual(await layout.locator('.zh-feed-tabs').getByRole('tab').allInnerTexts(), ['All', 'Explore']);
            assert.equal(await layout.locator('.zh-header-actions').getByRole('button', { name: 'Search creators', exact: true }).count(), 1);
            assert.equal(await layout.locator('.zh-header-actions').getByRole('button', { name: /^Wallet/ }).count(), 1);
            assert.equal(await layout.locator('.zh-host-status').count(), account === approved ? 1 : 0, 'Only a host account sees its availability control');
          }
          assert.equal(await layout.locator('.zh-dashboard-filters,.zh-explore .zh-filters').count(), 0, `${name} omits category filters`);
          assert.equal(await layout.locator('#top').isVisible(), name === 'Home', `${name} does not reserve an unused header strip`);
          if (name !== 'Home') {
            assert.equal(await layout.locator('#top').innerHTML(), '');
            if (name === 'Profile') {
              assert.equal(await layout.locator('.zu-page[aria-label="Your profile"]').isVisible(), true, 'Profile keeps the shared public layout while its details load');
            } else {
              const title = { Chat: 'Chats', Settings: 'Settings' }[name];
              assert.equal(await layout.locator('#screen').getByRole('heading', { name: title, exact: true }).isVisible(), true, `${name} retains its own page heading`);
            }
          }
          assert.equal(await layout.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} does not overflow at ${width}px`);
          assert.equal((await animations(layout)).length, 0, 'Reduced motion skips screen transitions');
        }
        await navigate(layout, 'settings');
        sameNavigation(await metrics(layout), baseline, `${account.user.role} Settings at ${width}px`);
        assert.equal(await layout.locator('.zh-header').count(), 0);
        assert.equal(await layout.locator('#top').isVisible(), false);
        assert.equal(await layout.locator('#top').innerHTML(), '');
        assert.equal(await layout.getByRole('heading', { name: 'Settings', exact: true }).isVisible(), true);
      }
    }
    await layout.setViewportSize({ width: 390, height: 900 });
    await clickTab(layout, 'Home');
    const approvedChrome = await metrics(layout);
    const approvedTabs = approvedChrome.navButtons.filter(button => tabs.includes(button.label));
    await receive(layout, 'host.access', { approved: false, checking: true, role: 'host', hostStatus: 'approved', verified: true });
    const checkingChrome = await metrics(layout);
    assert.equal(await layout.locator('.zh-nav button[data-tab]').count(), 4);
    checkingChrome.navButtons.forEach((button, index) => {
      assert.equal(button.label, approvedTabs[index].label);
      sameGeometry(button, approvedTabs[index], `Checking approval preserves ${button.label} at 390px`);
    });
    sameGeometry(checkingChrome.nav, approvedChrome.nav, 'Checking approval preserves navigation height');
    assert.equal(await layout.locator('.zh-nav').getByRole('button', { name: /^Go live$/i }).count(), 0, 'Pending revalidation does not expose a Go Live action');
    assert.equal(await layout.locator('.zh-nav > :not(button[data-tab])').count(), 0, 'The tab bar has no call or approval slot');
    await receive(layout, 'host.access', { approved: true, checking: false, role: 'host', hostStatus: 'approved', verified: true });
    sameNavigation(await metrics(layout), approvedChrome, 'Successful revalidation keeps the tabs in place');
    console.log('PASS navigation: Home-only All/Explore header, host-only availability, no category filters, page-specific headings and identical tab bounds at 320/390/630/1280px');

    const motion = await open('no-preference');
    await seed(motion, member);
    // Dispatch and observe in one task, before even a short transition can end.
    const firstTransition = await motion.evaluate(() => {
      [...document.querySelectorAll('.zh-nav button')].find(button => button.textContent.trim() === 'Chat').click();
      return document.getElementById('screen').getAnimations().map(animation => ({ duration: animation.effect.getTiming().duration, frames: animation.effect.getKeyframes() }));
    });
    assert.ok(firstTransition.some(animation => animation.duration > 0 && animation.duration <= 500), 'A tab press starts a brief screen transition');
    assert.ok(firstTransition.some(animation => animation.frames.some(frame => frame.opacity !== undefined) && animation.frames.some(frame => frame.transform !== undefined)), 'The tab transition combines a fade with movement');
    await settled(motion);
    assert.equal(await current(motion), 'chats');
    await receive(motion, 'data.loading', { resource: 'chats', loading: true });
    assert.equal((await animations(motion)).length, 0, 'Background loading does not replay tab motion');
    await receive(motion, 'data.chats', chats);
    assert.equal((await animations(motion)).length, 0, 'Realtime content does not replay tab motion');
    await motion.evaluate(() => {
      for (const name of ['Home', 'Settings', 'Chat', 'Profile']) [...document.querySelectorAll('.zh-nav button')].find(button => button.textContent.trim() === name).click();
    });
    await settled(motion);
    assert.equal(await current(motion), 'profile', 'Rapid taps resolve to the last selected tab');
    assert.equal(await motion.locator('.zh-nav [aria-current="page"]').innerText(), 'Profile');
    assert.equal(await motion.locator('#screen').getAttribute('aria-busy'), null);
    assert.equal(await motion.locator('[role="dialog"]').count(), 0);
    await clickTab(motion, 'Home');
    await settled(motion);
    const scrollBefore = await motion.locator('#scroll-root').evaluate(element => { element.scrollTop = 220; return element.scrollTop; });
    assert.ok(scrollBefore > 100, 'The home fixture has scrollable content');
    await clickTab(motion, 'Chat');
    await settled(motion);
    await motion.locator('#scroll-root').evaluate(element => { element.scrollTop = 410; });
    await clickTab(motion, 'Home');
    await settled(motion);
    assert.ok(Math.abs(await motion.locator('#scroll-root').evaluate(element => element.scrollTop) - scrollBefore) < 2, 'Returning to a tab restores its scroll position');
    await clickTab(motion, 'Chat');
    await settled(motion);
    await receive(motion, 'keyboard', { open: true });
    assert.equal(await motion.locator('#nav').isVisible(), false, 'The tab bar hides while the keyboard is up');
    await receive(motion, 'keyboard', { open: false });
    assert.equal(await motion.locator('#nav').isVisible(), true, 'The tab bar returns when the keyboard closes');
    console.log('PASS navigation: brief tab motion, rapid-tap cancellation, background stability, per-tab scroll restoration and a tab bar that steps aside for the keyboard');

    const access = await open();
    const denied = [
      ['member', member],
      ...['none', 'pending', 'rejected', 'suspended'].map(hostStatus => [hostStatus, { ...approved, user: { ...approved.user, hostStatus } }]),
      ['missing approval', { ...approved, user: { ...approved.user, hostStatus: undefined } }],
      ['missing verified host', { ...approved, user: { ...approved.user, isVerifiedHost: undefined } }],
      ['unverified host', { ...approved, user: { ...approved.user, isVerifiedHost: false } }],
      ['missing verification', { ...approved, verification: undefined }],
      ['sender with host flags', { ...approved, user: { ...approved.user, role: 'sender' } }]
    ];
    for (const [label, account] of denied) {
      await seed(access, account);
      assert.equal(await access.locator('.zh-nav button').count(), 4, `${label} has member navigation`);
      assert.equal(await access.getByRole('button', { name: /^Go live$/i }).count(), 0, `${label} cannot see Go Live`);
      assert.equal(await access.locator('[aria-label="Start a live broadcast"],.zh-create').count(), 0);
      await navigate(access, 'wallet');
      assert.equal(await access.locator('.earnbox').count(), 0, `${label} cannot see host earnings`);
      assert.equal(await access.getByRole('button', { name: /Withdraw/i }).count(), 0, `${label} cannot see withdrawal controls`);
      await navigate(access, 'settings');
      assert.equal(await access.getByRole('button', { name: /Payout verification|^Awards/ }).count(), 0);
      await access.getByRole('button', { name: /^Creator application/ }).click();
      assert.equal(await current(access), 'kyc');
      assert.equal(await access.evaluate(() => !!S.creatorSetup), true, 'The settings entry opens the creator application');
      assert.equal(await access.getByRole('button', { name: /Approve now/i }).count(), 0, 'An application cannot approve itself');
      await access.evaluate(() => approveKyc());
      assert.equal(await access.getByRole('button', { name: /Go live|Withdraw/i }).count(), 0, `${label} cannot unlock host controls through local KYC state`);
      assert.equal(await access.getByRole('heading', { name: /verified/i }).count(), 0, 'Local KYC state cannot display host approval success');
      await navigate(access, 'wallet');
      assert.equal(await access.locator('.earnbox').count(), 0, 'Local KYC verification does not reveal earnings');
      await access.evaluate(() => { window.__sent = []; window.__mediaPrepared = 0; S.role = 'host'; A().kyc = 'verified'; });
      for (const view of ['broadcast', 'setup', 'waiting', 'payout', 'awards']) {
        await navigate(access, view);
        assert.notEqual(await current(access), view, `${label} cannot open ${view} directly`);
      }
      await access.evaluate(async () => {
        Home.draftTitle = 'Unauthorized direct attempt'; await homeStartStream(); homeSetPresence(true); homeGoLive();
        S.caller = { id: 'caller', callId: 'existing-call', n: 'Caller' }; S.inc = { id: 'next-caller', callId: 'incoming-call', n: 'Incoming caller' };
        acceptRing(); acceptInc();
        A().earn = 50000; S.pamt = '10000'; S.kf.payout = 'fixture@example'; withdraw();
        if (S.tasks[0]) { S.tasks[0].p = S.tasks[0].goal; S.tasks[0].claimed = false; claimAward(0); }
      });
      await receive(access, 'call.incoming', { callId: `denied-${label}`, from: { id: hosts[0].id, name: 'Incoming visitor' }, voice: false });
      assert.equal(await access.evaluate(() => window.__sent.filter(message => message.type === 'call.decline').at(-1)?.data.callId), `denied-${label}`, 'Unapproved accounts decline incoming host calls');
      assert.equal(await access.evaluate(() => window.__mediaPrepared), 0, `${label} never requests camera access`);
      assert.deepEqual(await access.evaluate(() => window.__sent.filter(message => ['stream.start', 'call.accept', 'call.end', 'payout.request', 'awards.claim'].includes(message.type) || (message.type === 'presence.set' && message.data.online))), [], `${label} never sends host actions`);
    }
    await seed(access, approved);
    assert.equal(await access.locator('.zh-nav button').count(), 4, 'Hosts have the same four tabs, without a call button');
    assert.equal(await access.getByRole('button', { name: 'Get ready to go online', exact: true }).count(), 1, 'Approved hosts go online from the Home availability card');
    assert.equal(await access.getByRole('button', { name: 'Start a live broadcast', exact: true }).count(), 0, 'Home has no duplicate broadcast shortcut');
    await navigate(access, 'wallet');
    assert.equal(await access.locator('.earnbox').count(), 1, 'Approved hosts retain their earnings card');
    assert.equal(await access.getByRole('button', { name: 'Withdraw', exact: true }).count(), 1);
    await navigate(access, 'settings');
    await access.getByRole('button', { name: 'Creator tools', exact: true }).click();
    await access.getByRole('dialog', { name: 'Creator tools', exact: true }).getByRole('button', { name: /^Creator Verification/ }).click();
    assert.equal(await access.getByRole('button', { name: 'Go online for calls', exact: true }).count(), 1, 'Server approval unlocks the verified creator actions');
    await navigate(access, 'home');
    await access.getByRole('button', { name: 'Get ready to go online', exact: true }).click();
    assert.equal(await current(access), 'setup');
    assert.equal(await access.evaluate(() => window.__mediaPrepared), 0, 'Opening availability does not activate capture');
    await access.evaluate(async () => { go('broadcast'); go('live'); await homeStartStream(); homeGoLive(); });
    assert.equal(await current(access), 'setup', 'Even approved hosts cannot open paused streaming routes');
    assert.equal(await access.evaluate(() => window.__mediaPrepared), 0, 'Blocked streaming does not activate capture');
    assert.equal(await access.evaluate(() => window.__sent.filter(message => message.type === 'stream.start').length), 0);
    await receive(access, 'host.access', { approved: false, role: 'sender', hostStatus: 'suspended', verified: false });
    assert.ok(!['broadcast', 'setup', 'waiting'].includes(await current(access)), 'Admin revocation exits a host-only setup immediately');
    await navigate(access, 'home');
    assert.equal(await access.locator('.zh-nav button').count(), 4, 'Admin revocation removes the host tab');
    assert.equal(await access.locator('[aria-label="Start a live broadcast"],.zh-create').count(), 0, 'Admin revocation removes all Go Live entry points');
    await access.evaluate(() => {
      const stop = window.ZimiMedia.stop;
      window.ZimiMedia.stop = (...args) => { window.__mediaStopped = (window.__mediaStopped || 0) + 1; return stop(...args); };
    });
    const checking = () => receive(access, 'host.access', { approved: false, checking: true, role: 'host', hostStatus: 'approved', verified: true });
    const revoke = () => receive(access, 'host.access', { approved: false, checking: false, role: 'sender', hostStatus: 'suspended', verified: false });
    await seed(access, approved);
    await receive(access, 'stream.opened', {stream:{id:'hosted-stream'},hosting:true,messages:[]});
    assert.equal(await current(access), 'home', 'Late stream acknowledgement cannot restore a disabled room');
    assert.equal(await access.evaluate(() => Home.stream), null);
    assert.deepEqual(await access.evaluate(() => window.__sent.filter(message => message.type === 'stream.end').map(message => message.data.streamId)), ['hosted-stream']);

    await seed(access, approved);
    await access.evaluate(peerId => {
      S.caller = { ...g(peerId), callId: 'host-active-call', voice: false }; S.callId = 'host-active-call'; S.v = 'hcall'; S.sec = 0; S.rmsgs = []; S.cel = { ask: 0, mission: 0 };
      r(); window.__sent = []; window.__mediaStopped = 0;
    }, hosts[0].id);
    await checking();
    assert.equal(await current(access), 'hcall', 'Rechecking approval preserves an existing host call');
    assert.equal(await access.evaluate(() => S.callId), 'host-active-call');
    assert.equal(await access.evaluate(() => isApprovedHost()), false);
    assert.equal(await access.evaluate(() => window.__mediaStopped), 0);
    assert.deepEqual(await access.evaluate(() => window.__sent.filter(message => ['call.end', 'call.decline'].includes(message.type))), []);
    await receive(access, 'host.access', { approved: true, checking: false, role: 'host', hostStatus: 'approved', verified: true });
    assert.equal(await current(access), 'hcall', 'A successful recheck retains the active call');
    assert.equal(await access.evaluate(() => isApprovedHost()), true);
    assert.equal(await access.evaluate(() => window.__mediaStopped), 0);
    await checking();
    await revoke();
    assert.equal(await current(access), 'home', 'Revocation exits an active incoming host call');
    assert.ok(await access.evaluate(() => window.__mediaStopped > 0), 'Revocation stops host call media');
    assert.deepEqual(await access.evaluate(() => window.__sent.filter(message => message.type === 'call.end').map(message => message.data)), [{ callId: 'host-active-call', reason: 'approval_removed' }]);
    assert.equal(await access.evaluate(() => S.callId), null);

    await seed(access, approved);
    await receive(access, 'stream.opened', {stream:{id:'viewer-stream'},hosting:false,messages:[]});
    assert.equal(await current(access), 'home', 'An unsolicited viewer room remains disabled');
    assert.equal(await access.evaluate(() => Home.stream), null);
    assert.equal(await access.evaluate(() => window.__sent.filter(message => message.type === 'stream.leave').at(-1)?.data.streamId), 'viewer-stream');

    await seed(access, approved);
    await access.evaluate(peerId => {
      S.h = peerId; S.v = 'call'; S.callId = 'member-active-call'; S.sec = 0; S.rmsgs = []; S.cel = { ask: 0, mission: 0 };
      r(); window.__sent = []; window.__mediaStopped = 0;
    }, hosts[0].id);
    await revoke();
    assert.equal(await current(access), 'call', 'Removing host access preserves an outgoing member call');
    assert.equal(await access.evaluate(() => S.callId), 'member-active-call');
    assert.equal(await access.evaluate(() => window.__mediaStopped), 0);
    assert.deepEqual(await access.evaluate(() => window.__sent.filter(message => ['call.end', 'call.decline'].includes(message.type))), []);
    assert.deepEqual(errors, [], 'Navigation has no browser or bridge handler errors');
    console.log('PASS navigation: server-approved host access only, fail-closed metadata, direct-route guards, no unauthorized camera/actions, admin revocation');
    console.log('PASS navigation: earnings/application guards, local KYC isolation, approval rechecks preserve sessions until confirmed denial, private calls remain intact and streaming stays disabled');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
