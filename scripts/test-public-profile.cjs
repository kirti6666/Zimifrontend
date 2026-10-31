/* Public profile contracts against the bundled WebView. A local native stub
   supplies all responses; these checks never call or modify a real account. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const id = suffix => `507f1f77bcf86cd7994390${suffix}`;
const account = { user: { id: id('01'), name: 'Profile tester', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false, isPhoneVerified: true }, verification: 'none', balance: 1250, requiresOnboarding: false };
const creatorAccount = { ...account, user: { ...account.user, id: id('02'), name: 'Approved creator', role: 'host', serverRole: 'host', hostStatus: 'approved', isVerifiedHost: true }, verification: 'verified' };
const creator = { id: id('11'), name: 'Mira North', role: 'host', serverRole: 'host', category: 'Music', city: 'Pune', languages: ['English', 'Hindi'], about: 'Acoustic evenings and thoughtful conversations.', online: true, verified: true, availableForCall: true, followers: 127, following: false, ratePerMin: 15, entryFee: 0 };
const other = { ...creator, id: id('12'), name: 'Asha Sen', city: 'Jaipur', online: false, availableForCall: false };
const member = { id: id('13'), name: 'Rohan Patel', role: 'sender', serverRole: 'user', city: 'Kochi', online: false, verified: false, availableForCall: false, followers: 3 };
const feed = { hosts: [creator, other], stage: [], featured: creator, total: 2, page: 1, limit: 20, categories: ['Music'], broadcasterCount: 0, availableCount: 1, unreadCount: 0 };
const profile = (person = creator, extra = {}) => ({ ...person, followingCount: 9, following: false, joined: '2026-02-03T12:00:00.000Z', interests: ['Music', 'Travel'], level: 4, crown: false, ...extra });
const photo = { id: id('41'), mediaUrl: 'https://media.example.test/profile-post.jpg', kind: 'photo', caption: 'An acoustic evening.' };
const receive = (page, type, data = {}) => page.evaluate(message => Native.receive(message), { type, data });
const lastSent = (page, type) => page.evaluate(value => __sent.filter(message => message.type === value).at(-1)?.data, type);
const sentCount = (page, type) => page.evaluate(value => __sent.filter(message => message.type === value).length, type);
const button = (page, name) => page.getByRole('button', { name, exact: true });
const tab = (page, name) => page.getByRole('tab', { name: new RegExp(`^${name}(?:\\s|\\(|$)`) });
const skeletons = page => page.locator('.zu-page [role="status"][aria-busy="true"]');

async function run() {
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  const open = async (demo = false) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => {
      window.__sent = []; window.__copied = [];
      window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) };
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => __copied.push(value) } });
    });
    await page.goto(pathToFileURL(path.join(root, demo ? 'dist/index.html' : 'assets/aurora.html')).href + (demo ? '?role=sender&preview=profile' : '?role=sender'));
    if (!demo) {
      await receive(page, 'session', account);
      await receive(page, 'data.home', feed);
      await receive(page, 'wallet.balance', { coins: 1250, earningsPaise: 0 });
    }
    return page;
  };
  const navigate = async (page, person = creator) => {
    await page.evaluate(value => { if (value.role !== 'host') personFrom(value); go(value.role === 'host' ? 'host' : 'user', value.id); }, person);
    await page.locator('.zu-page').waitFor();
    return lastSent(page, 'profile.load');
  };
  const acceptProfile = async (page, person = creator, extra = {}) => {
    const request = await lastSent(page, 'profile.load');
    assert.equal(request.id, person.id, 'The public profile request targets the displayed person');
    await receive(page, 'data.publicProfile', { id: person.id, profile: profile(person, extra), requestId: request.requestId });
    return request;
  };
  const acceptPosts = async (page, person = creator, posts = [], total = posts.length, pageNumber = 1, limit = 12) => {
    const request = await lastSent(page, 'profile.posts.load');
    assert.equal(request.id, person.id, 'The post request targets the displayed person');
    await receive(page, 'data.publicPosts', { id: person.id, posts, total, page: pageNumber, limit, requestId: request.requestId });
    return request;
  };
  const layout = async (page, label) => {
    const actual = await page.locator('.zu-page').evaluate(element => {
      const box = element.getBoundingClientRect();
      const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      return {
        overflow: document.documentElement.scrollWidth > innerWidth + 1 || element.scrollWidth > element.clientWidth + 1,
        clippedActions: [...element.querySelectorAll('button')].filter(visible).some(el => { const r = el.getBoundingClientRect(); return r.left < box.left - 1 || r.right > box.right + 1; }),
        animations: element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length,
      };
    });
    assert.equal(actual.overflow, false, `${label}: no horizontal overflow`);
    assert.equal(actual.clippedActions, false, `${label}: buttons remain within the profile`);
    assert.equal(actual.animations, 0, `${label}: reduced motion suppresses decorative animations`);
    assert.equal(await button(page, 'Message').isVisible(), true);
  };
  try {
    const preview = await open(true);
    await preview.locator('.zu-page').waitFor();
    assert.equal(await skeletons(preview).count(), 0, 'The design preview is immediately usable');
    for (const width of [320, 390, 768, 1280]) {
      await preview.setViewportSize({ width, height: 900 });
      await layout(preview, `Dark preview ${width}px`);
    }
    await preview.setViewportSize({ width: 390, height: 844 });
    await preview.screenshot({ path: path.join(artifacts, 'public-profile-mobile-dark.png') });
    await preview.evaluate(() => ztSelect(ZThemeRose.id));
    assert.equal(await preview.evaluate(() => document.documentElement.dataset.theme), 'light');
    for (const width of [320, 390, 768, 1280]) {
      await preview.setViewportSize({ width, height: 900 });
      await layout(preview, `Light preview ${width}px`);
    }
    await preview.screenshot({ path: path.join(artifacts, 'public-profile-desktop.png') });
    await preview.setViewportSize({ width: 390, height: 844 });
    await preview.screenshot({ path: path.join(artifacts, 'public-profile-mobile-light.png') });
    console.log('PASS public profile: premium preview, responsive dark/light layouts, reduced motion, screenshots');

    const page = await open();
    const first = await navigate(page);
    assert.ok(first.requestId != null, 'Profile loads have a correlation identifier');
    assert.ok(await skeletons(page).count() > 0, 'Profile loading uses a labelled layout skeleton');
    assert.equal(await button(page, 'Start video call').isDisabled(), true, 'Cached host identity cannot start a call before the profile read settles');
    assert.doesNotMatch(await page.locator('.zu-page').innerText(), /Lv\s+\d|66\d{6}|MVP/, 'No synthetic standing or account identifiers appear while loading');
    await receive(page, 'data.loading', { resource: 'publicProfile', id: creator.id, requestId: first.requestId, loading: false, error: 'This profile is temporarily unavailable.' });
    await page.getByRole('alert').filter({ hasText: 'This profile is temporarily unavailable.' }).waitFor();
    await page.getByRole('alert').filter({ hasText: 'This profile is temporarily unavailable.' }).getByRole('button', { name: 'Try again', exact: true }).click();
    const retry = await lastSent(page, 'profile.load');
    assert.ok(retry.requestId > first.requestId, 'Retry issues a fresh correlated request');
    await acceptProfile(page);
    await acceptPosts(page);
    await page.getByRole('heading', { name: creator.name, exact: true }).waitFor();
    assert.equal(await skeletons(page).count(), 0, 'Completed profile and post reads clear their skeletons');
    assert.match(await page.locator('.zu-page').innerText(), /127/, 'Followers come from the public profile');
    assert.equal(await page.locator('.zu-page .post,.zu-page .zu-post').count(), 0, 'An empty server gallery does not show preview posts');
    await tab(page, 'About').click();
    assert.equal(await tab(page, 'About').getAttribute('aria-selected'), 'true');
    assert.match(await page.locator('.zu-page').innerText(), /Acoustic evenings and thoughtful conversations/);
    await tab(page, 'Posts').click();
    console.log('PASS public profile: real loading, retry, empty gallery, biography and authoritative counts');

    await navigate(page);
    await acceptProfile(page);
    await page.getByRole('status', { name: 'Loading profile photos', exact: true }).waitFor();
    const failedPosts = await lastSent(page, 'profile.posts.load');
    await receive(page, 'data.loading', { resource: 'publicPosts', ...failedPosts, loading: false, error: 'Photos could not be loaded.' });
    await page.getByRole('alert').filter({ hasText: 'Photos could not be loaded.' }).waitFor();
    await button(page, 'Retry photos').click();
    const photosRetry = await lastSent(page, 'profile.posts.load');
    assert.ok(photosRetry.requestId > failedPosts.requestId);
    await receive(page, 'data.publicPosts', { ...failedPosts, posts: [{ ...photo, caption: 'Stale photo' }], total: 1, page: 1, limit: 12 });
    assert.equal(await page.getByRole('button', { name: /Stale photo/ }).count(), 0, 'A superseded gallery response cannot replace the retry');
    await acceptPosts(page, creator, [photo], 2, 1, 1);
    const gallery = page.locator('.zu-gallery');
    assert.equal(await gallery.locator('img').first().getAttribute('src'), photo.mediaUrl, 'Public posts use the production media URL');
    assert.equal(await page.locator('.zu-page .lk,.zu-page .mvp').count(), 0, 'The real gallery does not invent likes or supporter rankings');
    await button(page, 'Load more posts').click();
    const more = await lastSent(page, 'profile.posts.load');
    assert.equal(more.page, 2);
    assert.equal(await page.getByRole('button', { name: /^Open photo/ }).count(), 1, 'Pagination keeps existing posts visible');
    await page.getByRole('status', { name: 'Loading profile photos', exact: true }).waitFor();
    const secondPhoto = { ...photo, id: id('42'), mediaUrl: 'https://media.example.test/second-post.jpg', caption: 'A second moment.' };
    await acceptPosts(page, creator, [secondPhoto], 2, 2, 1);
    await acceptPosts(page, creator, [secondPhoto], 2, 2, 1);
    assert.equal(await page.getByRole('button', { name: /^Open photo/ }).count(), 2, 'Pagination deduplicates repeated server posts');
    assert.equal(await button(page, 'Load more posts').count(), 0);
    await button(page, 'Open photo 1: An acoustic evening.').click();
    // Photos open as a feed of every loaded post, starting at the tapped one.
    const postFeed = page.locator('.zu-feed-dialog');
    await postFeed.waitFor();
    assert.equal(await postFeed.locator('.zu-feed-post').count(), 2);
    assert.equal(await postFeed.locator('.zu-feed-media>img').first().getAttribute('src'), photo.mediaUrl);
    assert.match(await postFeed.locator('.zu-feed-post').nth(1).innerText(), /A second moment\./);
    assert.equal(await button(postFeed, 'Post options').count(), 0, 'Visitors cannot delete a creator\'s posts');
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    await tab(page, 'Posts').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await tab(page, 'About').getAttribute('aria-selected'), 'true', 'Profile tabs support keyboard navigation');
    await page.keyboard.press('Home');
    assert.equal(await tab(page, 'Posts').getAttribute('aria-selected'), 'true');
    console.log('PASS public profile: real photo loading/retry, pagination, stale response isolation, post feed and keyboard tabs');

    const readsBeforePresence = await sentCount(page, 'profile.load');
    const unavailable = { ...creator, online: true, availableForCall: false, ratePerMin: 20, followers: 9999, following: true };
    await receive(page, 'data.home', { ...feed, hosts: [unavailable, other], featured: unavailable });
    assert.equal(await button(page, 'Start video call').isEnabled(), true, 'A host availability toggle never prevents a member from opening a manual call');
    assert.match(await page.locator('.zu-call-info').innerText(), /20\s+coins \/ min/, 'The server call rate remains visible when the host is not taking instant calls');
    assert.equal(await page.locator('.zu-stats strong').first().innerText(), '127', 'Discovery updates do not overwrite detailed public profile counts');
    assert.equal(await button(page, 'Follow').isEnabled(), true, 'Discovery updates do not replace the profile relationship');
    assert.equal(await page.getByRole('button', { name: /^Open photo/ }).count(), 2, 'Presence changes preserve the loaded gallery');
    assert.equal(await sentCount(page, 'profile.load'), readsBeforePresence, 'A live presence update does not restart profile loading');
    await button(page, 'Start video call').click();
    assert.equal(await page.evaluate(() => S.v), 'precall', 'A host with availability off still opens member call setup');
    assert.equal(await sentCount(page, 'call.start'), 0, 'Opening setup still requires confirmation before placing a paid call');
    await page.evaluate(() => go('host', S.h));
    await acceptProfile(page); await acceptPosts(page, creator, [photo, secondPhoto]);
    await receive(page, 'data.home', feed);
    assert.equal(await button(page, 'Start video call').isEnabled(), true);
    await receive(page, 'data.home', {...feed,hosts:[{...creator,stream:{id:'paused-live',status:'live',title:'Legacy broadcast',viewers:12}}]});
    assert.equal(await page.locator('.zu-live-card,.zu-presence.is-live').count(),0,'Profile hides stream promotion from legacy discovery metadata');
    await page.evaluate(()=>zuWatch());
    assert.equal(await sentCount(page,'stream.join'),0,'Profile watch handler cannot join a disabled stream');
    assert.equal(await button(page,'Start video call').isEnabled(),true,'Private calling remains available');
    console.log('PASS public profile: availability updates preserve profile data and paused streams stay hidden');

    await button(page, 'Follow').click();
    const follow = await lastSent(page, 'follow.set');
    assert.equal(follow.id, creator.id); assert.equal(follow.on, true);
    assert.equal(await button(page, 'Following').count(), 0, 'Follow waits for the server acknowledgement');
    await receive(page, 'follow.error', { ...follow, message: 'Could not follow this creator.' });
    assert.equal(await button(page, 'Follow').isEnabled(), true, 'Follow becomes retryable after failure');
    await button(page, 'Follow').click();
    const followRetry = await lastSent(page, 'follow.set');
    await receive(page, 'follow.saved', follow);
    assert.equal(await button(page, 'Following').count(), 0, 'An older follow response cannot acknowledge the retry');
    await receive(page, 'follow.saved', followRetry);
    assert.equal(await button(page, 'Following').isEnabled(), true);
    await button(page, 'Following').click();
    const unfollow = await lastSent(page, 'follow.set');
    assert.equal(unfollow.on, false);
    await receive(page, 'follow.saved', unfollow);
    assert.equal(await button(page, 'Follow').isEnabled(), true);
    await receive(page, 'follow.saved', followRetry);
    assert.equal(await page.evaluate(value => S.following[value], creator.id), false, 'A stale follow acknowledgement cannot mutate shared discovery state');
    assert.equal(await page.evaluate(value => g(value).fol, creator.id), 0, 'The cached creator follows the latest acknowledged relationship');
    console.log('PASS public profile: acknowledged follow/unfollow, failure recovery and stale-write rejection');

    await button(page, 'Follow').click();
    const pendingFollow = await lastSent(page, 'follow.set');
    const followCount = await sentCount(page, 'follow.set');
    await navigate(page, other); await acceptProfile(page, other); await acceptPosts(page, other);
    await navigate(page); await acceptProfile(page); await acceptPosts(page);
    assert.equal(await page.locator('#zu-follow').isDisabled(), true, 'Returning to a profile preserves its pending follow request');
    await page.evaluate(() => zuFollow());
    assert.equal(await sentCount(page, 'follow.set'), followCount, 'Navigation cannot create a duplicate in-flight follow');
    await receive(page, 'follow.saved', pendingFollow);
    assert.equal(await button(page, 'Following').isEnabled(), true, 'The original follow response completes after navigating away and back');
    await button(page, 'Following').click();
    await receive(page, 'follow.saved', await lastSent(page, 'follow.set'));
    console.log('PASS public profile: pending follow survives navigation without duplicate writes or a stranded action');

    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await tab(page, 'About').click();
    assert.equal(await page.locator('#zu-follow').isDisabled(), true);
    assert.equal(await button(page, 'Message').isDisabled(), true);
    assert.equal(await button(page, 'Start video call').isDisabled(), true);
    assert.equal(await button(page, 'Send a gift').isDisabled(), true);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await receive(page, 'connection.status', { connected: true, checking: false });
    assert.equal(await button(page, 'Follow').isEnabled(), true, 'Reconnection re-enables the Follow control after an offline redraw');
    assert.equal(await button(page, 'Message').isEnabled(), true);
    assert.equal(await button(page, 'Start video call').isEnabled(), true);
    assert.equal(await button(page, 'Send a gift').isEnabled(), true);
    await tab(page, 'Posts').click();
    console.log('PASS public profile: network recovery restores actions after offline tab changes');

    await button(page, 'More profile options').click();
    await button(page, 'Copy account ID').click();
    assert.equal(await page.evaluate(() => __copied.at(-1)), creator.id, 'Copy uses the real account identifier');
    await page.keyboard.press('Escape');
    await button(page, 'Message').click();
    assert.equal((await lastSent(page, 'chat.open')).with, creator.id);
    await navigate(page);
    await acceptProfile(page); await acceptPosts(page);
    await button(page, 'Start video call').click();
    assert.equal(await page.evaluate(() => S.v), 'precall');
    assert.equal(await sentCount(page, 'call.start'), 0, 'Profile actions open call setup before starting a paid call');
    await navigate(page);
    await acceptProfile(page); await acceptPosts(page);
    await button(page, 'Send a gift').click();
    const giftDialog = page.getByRole('dialog', { name: 'Send a gift', exact: true });
    await giftDialog.waitFor();
    await receive(page, 'data.catalog', { gifts: [{ id: id('51'), name: 'Rose', emoji: '🌹', coins: 10 }], packs: [], paymentsAvailable: false });
    await giftDialog.getByRole('button', { name: /Rose/ }).click();
    await giftDialog.getByRole('button', { name: 'Send gift', exact: true }).click();
    const gift = await lastSent(page, 'gift.send');
    assert.equal(gift.to, creator.id); assert.equal(gift.gift, id('51')); assert.ok(gift.idempotencyKey);
    assert.equal(await giftDialog.isVisible(), true, 'Gift delivery waits for server confirmation');
    await receive(page, 'gift.sent', { to: creator.id, gift: id('51'), coins: 10, idempotencyKey: gift.idempotencyKey });
    assert.equal(await giftDialog.count(), 0);
    console.log('PASS public profile: account copy, correctly targeted chat, call setup and gift delivery');

    const stale = await navigate(page, creator);
    const current = await navigate(page, other);
    await receive(page, 'data.publicProfile', { id: creator.id, requestId: stale.requestId, profile: profile(creator, { name: 'Stale profile response' }) });
    assert.equal(await page.getByRole('heading', { name: 'Stale profile response', exact: true }).count(), 0);
    await receive(page, 'data.loading', { resource: 'publicProfile', id: creator.id, requestId: stale.requestId, loading: false, error: 'Stale profile error' });
    assert.equal(await page.getByText('Stale profile error', { exact: true }).count(), 0);
    await receive(page, 'data.publicProfile', { id: other.id, requestId: current.requestId, profile: profile(other) });
    await acceptPosts(page, other);
    await page.getByRole('heading', { name: other.name, exact: true }).waitFor();
    assert.equal(await button(page, 'Start video call').isEnabled(), true, 'An offline host is still shown available for a call');
    assert.doesNotMatch(await page.locator('.zu-presence').innerText(), /offline/i, 'A host profile never says offline');
    console.log('PASS public profile: stale profile data/errors cannot replace the current account; offline hosts are never shown offline');

    const blocksBefore = await sentCount(page, 'block.set');
    await button(page, 'More profile options').click();
    await button(page, 'Block user').click();
    await page.getByRole('dialog').getByRole('heading', { name: 'Block Asha?', exact: true }).waitFor();
    assert.equal(await sentCount(page, 'block.set'), blocksBefore, 'Opening the safety confirmation does not block an account');
    await button(page, 'Cancel').click();
    assert.equal(await sentCount(page, 'block.set'), blocksBefore);
    await button(page, 'More profile options').click();
    await button(page, 'Block user').click();
    await button(page, 'Block user').click();
    const block = await lastSent(page, 'block.set');
    assert.equal(block.id, other.id); assert.equal(block.blocked, true);
    assert.equal(await page.evaluate(() => S.v), 'host', 'Block waits for the server acknowledgement');
    await page.keyboard.press('Escape');
    await navigate(page); await acceptProfile(page); await acceptPosts(page);
    await navigate(page, other); await acceptProfile(page, other); await acceptPosts(page, other);
    await button(page, 'More profile options').click();
    await button(page, 'Block user').click();
    assert.equal(await page.locator('.zu-block-confirm').isDisabled(), true, 'Returning to a profile preserves its pending block');
    await page.evaluate(() => zuBlock());
    assert.equal(await sentCount(page, 'block.set'), blocksBefore + 1, 'Navigation cannot issue a duplicate in-flight block');
    await receive(page, 'block.error', { ...block, message: 'Could not block this account.' });
    await page.getByRole('dialog').getByRole('alert').filter({ hasText: 'Could not block this account.' }).waitFor();
    await button(page, 'Block user').click();
    const blockRetry = await lastSent(page, 'block.set');
    await receive(page, 'block.saved', block);
    assert.equal(await page.evaluate(() => S.v), 'host', 'A stale block acknowledgement cannot finish a retry');
    await receive(page, 'block.saved', blockRetry);
    assert.equal(await page.evaluate(() => S.v), 'home', 'Confirmed blocking returns to discovery');
    console.log('PASS public profile: deliberate blocking, cancel, error recovery and acknowledgement');

    await receive(page, 'session', creatorAccount);
    await receive(page, 'data.home', feed);
    await receive(page, 'data.chats', { chats: [{ id: id('61'), user: member, last: 'Hello', time: 'Today', unread: 0, automatedOnly: false }], total: 1, page: 1 });
    await navigate(page, creator);
    await acceptProfile(page); await acceptPosts(page);
    assert.equal(await button(page, 'Message').isEnabled(), true, 'Hosts can message other hosts');
    assert.equal(await button(page, 'Follow').count(), 0, 'Host-to-host Follow is unavailable');
    await navigate(page, member);
    await acceptProfile(page, member);
    assert.equal(await button(page, 'Message').isEnabled(), true, 'An approved host can reply to an existing member');
    assert.equal(await button(page, 'Follow').count(), 1, 'A host can follow a member');
    assert.equal(await button(page, 'Start video call').count(), 0, 'Member profiles do not advertise the member call action');
    assert.deepEqual([await button(page, 'Voice call').isDisabled(), await button(page, 'Video call').isDisabled()], [false, false],
      'Hosts can call a member at any time');
    assert.equal(await page.locator('.zu-page [aria-label="Verified creator"],.zu-page [aria-label="Verified user"]').count(), 0, 'An unverified member receives no verified badge');
    assert.doesNotMatch(await page.locator('.zu-page').innerText(), /127|Acoustic evenings/, 'A member profile never leaks the previously viewed creator content');
    await button(page, 'Message').click();
    assert.equal((await lastSent(page, 'chat.open')).with, member.id, 'Member Message uses S.u rather than a stale host target');
    console.log('PASS public profile: creator/member permissions, host Follow and calls, privacy and chat-target isolation');

    await receive(page, 'session', account);
    await receive(page, 'data.home', feed);
    const attack = '<img src=x onerror="window.__profileXss=1"> O\'Neil & friends';
    const hostile = { ...creator, id: id('99'), name: attack, about: attack, city: attack, languages: [attack], avatarUrl: 'javascript:window.__profileXss=2', coverUrl: 'https://media.example.test/x" onerror="window.__profileXss=3' };
    await navigate(page, hostile);
    await acceptProfile(page, hostile, { interests: [attack] });
    await acceptPosts(page, hostile);
    await page.getByRole('heading', { name: attack, exact: true }).waitFor();
    await tab(page, 'About').click();
    assert.match(await page.locator('.zu-page').innerText(), /O'Neil & friends/);
    assert.equal(await page.locator('.zu-page [onerror],.zu-page script,.zu-page iframe').count(), 0, 'Untrusted public content stays text');
    assert.equal(await page.evaluate(() => window.__profileXss), undefined);
    const unsafeSource = await page.locator('.zu-page img').evaluateAll(images => images.some(image => /javascript:|onerror=/.test(image.getAttribute('src') || '')));
    assert.equal(unsafeSource, false, 'Unsafe profile media uses a safe fallback');
    await page.setViewportSize({ width: 320, height: 844 });
    await layout(page, 'Long untrusted names at 320px');
    console.log('PASS public profile: escaped remote text and safe media fallbacks');

    // The Profile tab directly shares the public layout, with editing and
    // uploads in place of social actions on yourself.
    await receive(page, 'session', creatorAccount);
    await receive(page, 'data.home', feed);
    await page.evaluate(() => go('profile'));
    const self = { ...creator, id: creatorAccount.user.id, name: 'Approved creator' };
    assert.deepEqual(await page.evaluate(() => [S.v, zuId()]), ['profile', self.id], 'The Profile tab directly loads the authenticated public profile');
    await acceptProfile(page, self);
    await acceptPosts(page, self, [photo]);
    await page.getByRole('heading', { name: 'Approved creator', exact: true }).waitFor();
    assert.equal(await button(page,'Edit profile').count(),1,'The owner has one compact edit control');
    assert.equal(await button(page,'Upload photos').count(),1,'Photo upload is next to the content tabs');
    assert.equal(await page.locator('#nav [aria-current="page"]').innerText(), 'Profile', 'The shared layout retains the selected primary tab');
    assert.equal(await page.locator('#zu-follow, #zu-message, #zu-call, .zu-gift').count(), 0, 'Nothing to follow, message, call or gift on your own profile');
    assert.equal(await button(page, 'More profile options').count(), 0, 'You cannot report or block yourself');
    assert.equal(await button(page, 'Open settings').count(), 1, 'The owner has account settings in the toolbar');
    assert.equal(await button(page, 'Change profile photo').count(), 1, 'The owner can change their avatar');
    assert.equal(await button(page, 'Change cover photo').count(), 1, 'The owner can change their cover');
    assert.equal(await page.locator('.zu-gallery .zu-photo').count(), 1, 'Your posts show as they do for others');
    await page.locator('#zu-edit-self').click();
    assert.equal(await page.evaluate(() => S.v), 'editprofile');
    console.log('PASS public profile: your own profile as others see it, with Edit instead of social actions');

    assert.deepEqual(errors, [], 'Public profiles handle all native events without browser exceptions');
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
