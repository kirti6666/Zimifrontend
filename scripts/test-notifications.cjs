/* Notification inbox regression contracts. All accounts, requests and results
   are local fixtures; this suite never contacts or changes a real account. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const account = { user: { id: '507f1f77bcf86cd799439001', name: 'Mira North', role: 'sender', serverRole: 'user', hostStatus: 'none', isVerifiedHost: false, languages: ['English'] }, verification: 'none', requiresOnboarding: false };
const now = Date.now();
const notices = [
  { id: '507f1f77bcf86cd799439011', title: 'Your profile is looking good', body: 'Your latest profile changes are saved. Keep making connections that feel like you.', read: false, createdAt: new Date(now - 12 * 60000).toISOString(), audience: 'personal' },
  { id: '507f1f77bcf86cd799439012', title: 'A little more to discover', body: 'Explore live conversations, music and new creators in the community.', read: false, createdAt: new Date(now - 2 * 3600000).toISOString(), audience: 'announcements' },
  { id: '507f1f77bcf86cd799439013', title: 'Welcome to your BinzoLive community', body: 'Your account is ready. Find your people, follow your favorites and start a conversation.', read: true, createdAt: new Date(now - 26 * 3600000).toISOString(), audience: 'personal' },
];
const moreNotice = { id: '507f1f77bcf86cd799439014', title: 'Make the most of your next visit', body: 'Your updates stay together here so you can catch up at your own pace.', read: true, createdAt: new Date(now - 3 * 86400000).toISOString(), audience: 'announcements' };
const receive = (page, type, data = {}) => page.evaluate(message => Native.receive(message), { type, data });
const sent = (page, type) => page.evaluate(value => __sent.filter(message => message.type === value).map(message => message.data), type);
const last = async (page, type) => (await sent(page, type)).at(-1);
const button = (page, name) => page.getByRole('button', { name, exact: true });
// Pulls the page down from the top the way a finger does, then releases.
const pullToRefresh = page => page.evaluate(() => {
  window.zimiScrollTo(0);
  const target = document.getElementById('screen'), touch = y => new Touch({ identifier: 1, target, clientX: 180, clientY: y });
  const fire = (type, y) => { const active = type === 'touchend' ? [] : [touch(y)]; target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: active, targetTouches: active, changedTouches: [touch(y)] })); };
  fire('touchstart', 120); for (const y of [150, 190, 230, 270, 300]) fire('touchmove', y); fire('touchend', 300);
});
const search = page => page.getByLabel('Search notifications', { exact: true });
const rows = page => page.locator('article.zh-notification[data-notification-id]');
const row = (page, notice) => page.locator(`article.zh-notification[data-notification-id="${notice.id}"]`);
const status = (page, name) => page.locator('.zn-status').getByRole('button', { name: new RegExp(`^${name}(?:\\s|$)`) });
const audience = (page, name) => page.locator('.zn-audience').getByRole('button', { name, exact: true });
const selected = (page, notice) => page.getByRole('checkbox', { name: `Select notification: ${notice.title}`, exact: true });
const detail = page => page.getByRole('dialog', { name: 'Notification details', exact: true });
const isSelected = async (page, notice) => await selected(page, notice).count() > 0 && await selected(page, notice).isChecked();
async function showFilters(page) {
  if (!await search(page).isVisible()) await button(page, 'Filter notifications').click();
}
async function startSelecting(page) {
  if (await button(page, 'Select notifications').isVisible()) await button(page, 'Select notifications').click();
}
async function stopSelecting(page) {
  if (await button(page, 'Done selecting').isVisible()) await button(page, 'Done selecting').click();
}
async function selectNotice(page, notice) {
  await startSelecting(page);
  await selected(page, notice).check();
}

async function requestAfter(page, type, action) {
  const count = (await sent(page, type)).length;
  await action();
  await page.waitForFunction(({ type, count }) => __sent.filter(message => message.type === type).length > count, { type, count });
  return last(page, type);
}
const loadAfter = (page, action) => requestAfter(page, 'notifications.load', action);

async function result(page, request, items = notices, extra = {}) {
  const data = { items, total: items.length, totalCount: items.length, unreadCount: items.filter(item => !item.read).length, page: request.page || 1, limit: 20, requestId: request.requestId, ...extra };
  await receive(page, 'data.notifications', data);
  await receive(page, 'data.loading', { resource: 'notifications', loading: false, page: data.page, requestId: request.requestId });
}

async function failLoad(page, request, message) {
  await receive(page, 'notifications.error', { action: 'notifications.load', requestId: request.requestId, message });
  await receive(page, 'data.loading', { resource: 'notifications', loading: false, page: request.page, requestId: request.requestId, error: message });
}

async function save(page, request, read, ids, items, extra = {}) {
  const refresh = await loadAfter(page, () => receive(page, 'notifications.saved', { ...(ids ? { ids } : { all: true }), read, unreadCount: items.filter(item => !item.read).length, totalCount: items.length, count: ids?.length || items.length, requestId: request.requestId }));
  await result(page, refresh, items, extra);
  return refresh;
}

async function layout(page, label) {
  const actual = await page.locator('.zn-page').evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const visible = node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
    return {
      documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      pageOverflow: element.scrollWidth > element.clientWidth + 1,
      clippedControls: [...element.querySelectorAll('button,input,select')].filter(visible).filter(node => {
        const box = node.getBoundingClientRect();
        return box.left < bounds.left - 1 || box.right > bounds.right + 1;
      }).map(node => node.getAttribute('aria-label') || node.textContent.trim()),
      animations: element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length,
    };
  });
  assert.equal(actual.documentOverflow, false, `${label}: no document overflow`);
  assert.equal(actual.pageOverflow, false, `${label}: no notification page overflow`);
  assert.deepEqual(actual.clippedControls, [], `${label}: all notification controls fit the page`);
  assert.equal(actual.animations, 0, `${label}: reduced motion disables animation`);
  assert.equal(await page.locator('.zh-header').count(), 0, `${label}: the Home header stays off the notification page`);
  assert.equal(await page.locator('#top').getByRole('heading', { name: 'Notifications', exact: true }).isVisible(), true, `${label}: the notification title remains visible`);
  assert.equal(await button(page.locator('#top'), 'Back to home').isVisible(), true, `${label}: notifications retains its own Back action`);
  assert.equal(await page.locator('#nav').isVisible(), false, `${label}: notification details do not show primary footer tabs`);
  assert.equal(await page.locator('#nav').innerHTML(), '', `${label}: hidden footer has no stale tab controls`);
}

async function filters(page, initial) {
  assert.equal(initial.page, 1);
  assert.equal(initial.limit, 20);
  assert.equal(initial.status, 'all');
  assert.equal(initial.audience, 'all');
  assert.equal(initial.sort, 'newest');
  assert.ok(initial.requestId != null, 'Every inbox request is identified');
  assert.equal(await rows(page).count(), 0, 'Initial loading never displays cached or invented notifications');
  await page.getByRole('status', { name: 'Loading notifications', exact: true }).waitFor();
  await result(page, initial);
  assert.deepEqual(await rows(page).locator('h3').allTextContents(), notices.map(item => item.title));

  const query = 'profile';
  const searchRequest = await loadAfter(page, () => search(page).fill(query));
  assert.equal(searchRequest.q, query);
  assert.equal(searchRequest.page, 1);
  assert.equal(await rows(page).count(), 0, 'Changing search hides results for the old query');
  await result(page, initial, [moreNotice]);
  assert.equal(await rows(page).count(), 0, 'A late response cannot replace the active search');
  await result(page, searchRequest, [notices[0]], { totalCount: 3, unreadCount: 2 });
  assert.deepEqual(await rows(page).locator('h3').allTextContents(), [notices[0].title]);
  assert.equal(await search(page).evaluate(node => document.activeElement === node), true, 'Search retains keyboard focus after server results');

  await selectNotice(page, notices[0]);
  const unreadRequest = await loadAfter(page, () => status(page, 'Unread').click());
  assert.equal(unreadRequest.status, 'unread');
  assert.equal(unreadRequest.q, query, 'Status and text filters combine');
  await result(page, unreadRequest, [notices[0]], { totalCount: 3, unreadCount: 2 });
  assert.equal(await isSelected(page, notices[0]), false, 'Changing filters clears selection');
  const personalRequest = await loadAfter(page, () => audience(page, 'For you').click());
  assert.equal(personalRequest.audience, 'personal');
  assert.equal(personalRequest.status, 'unread');
  await result(page, personalRequest, [notices[0]], { totalCount: 3, unreadCount: 2 });

  for (const period of ['today', 'week', 'month', 'all']) {
    const timeRequest = await loadAfter(page, () => page.getByLabel('Time period', { exact: true }).selectOption(period));
    if (period === 'all') assert.ok(!timeRequest.since, 'All time omits the lower date bound');
    else {
      assert.ok(Number.isFinite(Date.parse(timeRequest.since)), `${period} sends a valid lower date bound`);
      assert.ok(Date.parse(timeRequest.since) <= Date.now(), 'A time filter never starts in the future');
    }
    assert.equal(timeRequest.audience, 'personal');
    assert.equal(timeRequest.status, 'unread');
    assert.equal(timeRequest.q, query);
    await result(page, timeRequest, [notices[0]], { totalCount: 3, unreadCount: 2 });
  }
  const oldestRequest = await loadAfter(page, () => page.getByLabel('Sort notifications', { exact: true }).selectOption('oldest'));
  assert.equal(oldestRequest.sort, 'oldest');
  await result(page, oldestRequest, [notices[0]], { totalCount: 3, unreadCount: 2 });
  const announcementRequest = await loadAfter(page, () => audience(page, 'Announcements').click());
  assert.equal(announcementRequest.audience, 'announcements');
  await result(page, announcementRequest, [], { totalCount: 3, unreadCount: 2 });
  await page.getByRole('heading', { name: 'No matching notifications', exact: true }).waitFor();
  const resetRequest = await loadAfter(page, () => button(page.locator('#zn-results'), 'Reset filters').click());
  assert.equal(resetRequest.q, '');
  assert.equal(resetRequest.status, 'all');
  assert.equal(resetRequest.audience, 'all');
  assert.equal(resetRequest.sort, 'newest');
  assert.ok(!resetRequest.since);
  await result(page, resetRequest);

  const readRequest = await loadAfter(page, () => status(page, 'Read').click());
  assert.equal(readRequest.status, 'read');
  await result(page, readRequest, [notices[2]], { totalCount: 3, unreadCount: 2 });
  const allRequest = await loadAfter(page, () => status(page, 'All').click());
  await result(page, allRequest);
  const focusedRequest = await loadAfter(page, () => search(page).fill(query));
  await search(page).evaluate(node => node.setSelectionRange(1, 4));
  await result(page, focusedRequest, [notices[0]], { totalCount: 3, unreadCount: 2 });
  assert.deepEqual(await search(page).evaluate(node => ({ focused: document.activeElement === node, start: node.selectionStart, end: node.selectionEnd })), { focused: true, start: 1, end: 4 }, 'Native refresh preserves search focus and cursor selection');
  const refresh = await loadAfter(page, () => pullToRefresh(page));
  assert.equal(refresh.q, query, 'Explicit refresh retains the query');
  assert.equal(refresh.page, 1);
  assert.equal(await rows(page).count(), 0, 'A first-page refresh hides stale results until it settles');
  await result(page, refresh, [notices[0]], { totalCount: 3, unreadCount: 2 });
  const clear = await loadAfter(page, () => search(page).fill(''));
  await result(page, clear);
  console.log('PASS notifications: server search/status/audience/date/sort filters, stale results, empty/reset, selection reset and focus preservation');
}

async function pagination(page) {
  let request = await loadAfter(page, () => pullToRefresh(page));
  await result(page, request, notices, { total: 5, totalCount: 5 });
  request = await loadAfter(page, () => button(page, 'Load more notifications').click());
  assert.equal(request.page, 2);
  assert.equal(await rows(page).count(), 3, 'Pagination keeps the existing notifications visible');
  await result(page, request, [notices[2], moreNotice], { total: 5, totalCount: 5 });
  assert.equal(await rows(page).count(), 4, 'Overlapping result pages are deduplicated by notification ID');
  request = await loadAfter(page, () => button(page, 'Load more notifications').click());
  assert.equal(request.page, 3);
  await failLoad(page, request, 'The next updates could not be loaded.');
  assert.equal(await rows(page).count(), 4, 'A pagination failure preserves the loaded inbox');
  assert.match(await page.locator('.zn-page').innerText(), /The next updates could not be loaded/);
  const retry = await loadAfter(page, () => button(page, 'Retry loading more').click());
  assert.equal(retry.page, 3, 'Retry requests the failed page, without skipping ahead');
  const finalNotice = { ...moreNotice, id: '507f1f77bcf86cd799439015', title: 'All your updates, together' };
  await result(page, retry, [finalNotice], { total: 5, totalCount: 5 });
  assert.equal(await rows(page).count(), 5);
  assert.equal(await button(page, 'Load more notifications').count(), 0, 'Pagination stops at the server total');

  request = await loadAfter(page, () => pullToRefresh(page));
  await failLoad(page, request, 'Notifications are temporarily unavailable.');
  assert.equal(await rows(page).count(), 0, 'Failed first-page requests do not show stale notifications');
  const firstRetry = await loadAfter(page, () => button(page, 'Retry').click());
  assert.equal(firstRetry.page, 1);
  await result(page, firstRetry, []);
  await page.getByRole('heading', { name: "You're all caught up", exact: true }).waitFor();
  request = await loadAfter(page, () => pullToRefresh(page));
  await result(page, request);
  console.log('PASS notifications: retained pagination, overlap deduplication, failed-page retry, initial failure/retry and true empty inbox');
}

async function dateChips(page) {
  for (const label of ['Today', 'Yesterday', 'Earlier', 'All']) {
    const request = await loadAfter(page, () => page.locator('.zn-period-tabs').getByRole('button', { name: label, exact: true }).click());
    if (label === 'Today' || label === 'Yesterday') assert.ok(Number.isFinite(Date.parse(request.since)), `${label} sends a valid lower date bound`);
    else assert.ok(!request.since, `${label} has no lower date bound`);
    if (label === 'Yesterday' || label === 'Earlier') assert.ok(Number.isFinite(Date.parse(request.before)), `${label} sends a valid exclusive upper date bound`);
    else assert.ok(!request.before, `${label} has no upper date bound`);
    if (label === 'Yesterday') assert.ok(Date.parse(request.since) < Date.parse(request.before), 'Yesterday has ordered nonempty date bounds');
    assert.equal(await page.getByLabel('Time period', { exact: true }).inputValue(), label.toLowerCase(), 'Compact date chips and advanced time filter stay in sync');
    await result(page, request);
  }
  console.log('PASS notifications: compact All/Today/Yesterday/Earlier date chips send correct exclusive date bounds');
}

async function debounceAndRealtime(page) {
  let request = await loadAfter(page, () => audience(page, 'For you').click());
  await result(page, request, [notices[0], notices[2]], { totalCount: 3, unreadCount: 2 });
  const previous = request;
  request = await loadAfter(page, async () => {
    await search(page).focus();
    await page.evaluate(oldRequest => {
      const input = document.getElementById('zn-search');
      input.value = 'profile';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      // Both late events arrive in the same turn, before the debounce can fire.
      Native.receive({ type: 'data.loading', data: { resource: 'notifications', loading: false, page: 1, requestId: oldRequest.requestId, error: 'Stale failure must stay hidden' } });
      Native.receive({ type: 'data.notifications', data: { items: [{ id: 'stale-debounce', title: 'A stale result' }], total: 1, totalCount: 1, unreadCount: 0, page: 1, requestId: oldRequest.requestId } });
    }, previous);
    assert.equal(await rows(page).count(), 0, 'Search retires old results immediately, before its debounce sends the next request');
    assert.equal(await page.getByText('Stale failure must stay hidden', { exact: true }).count(), 0, 'A stale identified loading failure is ignored during debounce');
  });
  assert.equal(request.q, 'profile');
  assert.equal(request.audience, 'personal');
  await result(page, request, [notices[0]], { totalCount: 3, unreadCount: 2 });
  await search(page).evaluate(input => input.setSelectionRange(1, 4));
  let loads = (await sent(page, 'notifications.load')).length;
  await receive(page, 'notifications.changed');
  assert.equal((await sent(page, 'notifications.load')).length, loads, 'Realtime updates do not interrupt typing with an automatic reload');
  await page.getByText('New updates available', { exact: true }).waitFor();
  assert.deepEqual(await search(page).evaluate(input => ({ focused: document.activeElement === input, start: input.selectionStart, end: input.selectionEnd })), { focused: true, start: 1, end: 4 }, 'Realtime banners preserve search focus and selection');
  request = await loadAfter(page, () => button(page, 'Show updates').click());
  assert.equal(request.q, 'profile');
  assert.equal(request.audience, 'personal', 'Show updates refreshes the current filter combination');
  await result(page, request, [notices[0]], { totalCount: 3, unreadCount: 2 });

  await selectNotice(page, notices[0]);
  loads = (await sent(page, 'notifications.load')).length;
  await receive(page, 'notifications.changed');
  assert.equal((await sent(page, 'notifications.load')).length, loads, 'Realtime updates do not reorder the inbox during bulk selection');
  assert.equal(await isSelected(page, notices[0]), true);
  await page.getByText('New updates available', { exact: true }).waitFor();
  request = await loadAfter(page, () => button(page, 'Show updates').click());
  assert.equal(request.q, 'profile');
  assert.equal(request.audience, 'personal');
  await result(page, request, [notices[0]], { totalCount: 3, unreadCount: 2 });
  assert.equal(await isSelected(page, notices[0]), false, 'An explicit realtime refresh clears the old selection');
  request = await loadAfter(page, () => button(page, 'Clear notification filters').click());
  await result(page, request);
  console.log('PASS notifications: immediate stale-event retirement during debounce and realtime banners that preserve typing, selection and filters');
}

async function mutations(page) {
  let updated = notices.map(item => ({ ...item }));
  await startSelecting(page);
  await button(page, 'Select all').click();
  assert.equal(await page.getByRole('checkbox', { checked: true }).count(), notices.length, 'Select all selects the loaded notifications');
  await button(page, 'Deselect all').click();
  assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 0, 'Deselect all clears the loaded selection');
  await stopSelecting(page);
  let mutation = await requestAfter(page, 'notifications.read', () => button(page, `Open notification: ${notices[0].title}`).click());
  await detail(page).waitFor();
  assert.deepEqual(mutation.ids, [notices[0].id]);
  assert.ok(mutation.requestId != null);
  assert.match(await row(page, notices[0]).getAttribute('class'), /\bunread\b/, 'Read state waits for the server acknowledgment');
  await receive(page, 'notifications.error', { requestId: mutation.requestId, message: 'This update was not saved.' });
  assert.match(await row(page, notices[0]).getAttribute('class'), /\bunread\b/, 'A failed write leaves the previous read state intact');
  mutation = await requestAfter(page, 'notifications.read', () => button(detail(page), 'Retry update').click());
  updated[0].read = true;
  await save(page, mutation, true, [notices[0].id], updated);
  assert.doesNotMatch(await row(page, notices[0]).getAttribute('class'), /\bunread\b/);

  mutation = await requestAfter(page, 'notifications.unread', () => button(detail(page), `Mark as unread: ${notices[0].title}`).click());
  assert.deepEqual(mutation.ids, [notices[0].id]);
  assert.doesNotMatch(await row(page, notices[0]).getAttribute('class'), /\bunread\b/, 'Unread state also waits for acknowledgment');
  updated[0].read = false;
  await save(page, mutation, false, [notices[0].id], updated);
  assert.match(await row(page, notices[0]).getAttribute('class'), /\bunread\b/);
  await button(page, 'Close notification').click();

  await selectNotice(page, notices[0]);
  await selectNotice(page, notices[1]);
  await button(page, 'Clear selection').click();
  assert.equal(await isSelected(page, notices[0]), false);
  assert.equal(await isSelected(page, notices[1]), false);
  await selectNotice(page, notices[0]);
  await selectNotice(page, notices[1]);
  mutation = await requestAfter(page, 'notifications.read', () => button(page, 'Mark selected read').click());
  assert.deepEqual([...mutation.ids].sort(), notices.slice(0, 2).map(item => item.id).sort());
  updated = updated.map(item => ({ ...item, read: true }));
  await save(page, mutation, true, notices.slice(0, 2).map(item => item.id), updated);
  assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 0, 'A completed bulk write clears selection');
  await selectNotice(page, notices[0]);
  await selectNotice(page, notices[1]);
  mutation = await requestAfter(page, 'notifications.unread', () => button(page, 'Mark selected unread').click());
  assert.deepEqual([...mutation.ids].sort(), notices.slice(0, 2).map(item => item.id).sort());
  updated = updated.map((item, index) => ({ ...item, read: index > 1 }));
  await save(page, mutation, false, notices.slice(0, 2).map(item => item.id), updated);

  const filtered = await loadAfter(page, () => audience(page, 'For you').click());
  await result(page, filtered, [updated[0], updated[2]], { totalCount: 3, unreadCount: 2 });
  mutation = await requestAfter(page, 'notifications.readAll', () => button(page, 'Mark all read').click());
  assert.ok(mutation.requestId != null, 'Mark all read is an identified server-wide operation');
  updated = updated.map(item => ({ ...item, read: true }));
  const reload = await save(page, mutation, true, null, [updated[0], updated[2]], { totalCount: 3, unreadCount: 0 });
  assert.equal(reload.audience, 'personal', 'Mutation acknowledgment reloads the currently filtered inbox');
  const all = await loadAfter(page, () => audience(page, 'All updates').click());
  await result(page, all, notices);
  await stopSelecting(page);
  console.log('PASS notifications: acknowledgment-only read/unread, retryable writes, selection controls, bulk updates and server-wide mark all read');
}

async function detailAndSafety(page) {
  const mutation = await requestAfter(page, 'notifications.read', () => button(page, `Open notification: ${notices[0].title}`).click());
  const dialog = page.getByRole('dialog', { name: 'Notification details', exact: true });
  await dialog.waitFor();
  assert.match(await dialog.innerText(), new RegExp(notices[0].title));
  assert.ok((await dialog.innerText()).includes(notices[0].body), 'Details show the complete notification body');
  assert.deepEqual(mutation.ids, [notices[0].id]);
  const updated = notices.map((item, index) => ({ ...item, read: index === 0 || item.read }));
  await save(page, mutation, true, [notices[0].id], updated);
  await receive(page, 'app.back');
  assert.equal(await page.getByRole('dialog').count(), 0, 'Android Back closes notification details');
  assert.equal(await page.evaluate(() => S.v), 'notifications', 'Closing details keeps the inbox open');
  assert.equal((await sent(page, 'app.exit.request')).length, 0, 'Back from notification details never requests an app exit');
  const readWrites = (await sent(page, 'notifications.read')).length;
  await button(page, `Open notification: ${notices[0].title}`).click();
  await dialog.waitFor();
  assert.equal((await sent(page, 'notifications.read')).length, readWrites, 'Opening an already-read notification does not write again');
  await button(page, 'Close notification').click();
  assert.equal(await page.getByRole('dialog').count(), 0);

  await button(page, 'Notification preferences').click();
  await page.getByRole('dialog', { name: 'Notification preferences', exact: true }).waitFor();
  assert.ok((await sent(page, 'profile.settings.load')).length > 0, 'Preferences load the real account settings');
  await button(page, 'Close settings').click();
  assert.equal(await page.evaluate(() => S.v), 'notifications');

  const unsafe = { ...notices[0], title: '<img src=x onerror="window.__notificationXss=1">', body: '<script>window.__notificationXss=2</script> & "quoted" content', read: true };
  let request = await loadAfter(page, () => pullToRefresh(page));
  await result(page, request, [unsafe]);
  assert.equal(await rows(page).locator('h3').textContent(), unsafe.title, 'Notification titles are rendered as text');
  await button(page, `Open notification: ${unsafe.title}`).click();
  assert.ok((await dialog.innerText()).includes(unsafe.body), 'Notification details escape server text');
  assert.equal(await page.locator('.zn-page [onerror],.zn-page script,[role="dialog"] [onerror],[role="dialog"] script').count(), 0);
  assert.equal(await page.evaluate(() => window.__notificationXss), undefined);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0, 'Details also close with Escape');
  request = await loadAfter(page, () => search(page).fill('<img src=x onerror=window.__notificationXss=3>'));
  await result(page, request, []);
  assert.equal(await page.evaluate(() => window.__notificationXss), undefined, 'Search queries never become executable markup');
  request = await loadAfter(page, () => button(page.locator('#zn-results'), 'Reset filters').click());
  await result(page, request);
  await receive(page, 'app.back');
  assert.equal(await page.evaluate(() => S.v), 'home', 'Back from the notification inbox returns Home');
  assert.equal(await page.locator('.zh-header').isVisible(), true, 'Home restores its branded header');
  assert.equal(await page.locator('#nav').isVisible(), true, 'Home restores the primary footer');
  assert.equal(await page.locator('.zh-nav button').count(), 4);
  assert.equal((await sent(page, 'app.exit.request')).length, 0, 'Back from notifications does not request an app exit');
  request = await loadAfter(page, () => page.evaluate(() => homeNotifications()));
  await result(page, request);
  await showFilters(page);
  console.log('PASS notifications: full details, native Back/Escape, account preferences and notification/search markup escaping');
}

async function accountIsolation(page) {
  const oldRequest = await loadAfter(page, () => search(page).fill('private previous account'));
  await result(page, oldRequest, [notices[0]]);
  await selectNotice(page, notices[0]);
  const pendingOld = await loadAfter(page, () => pullToRefresh(page));
  await receive(page, 'session.none');
  await receive(page, 'session', { ...account, user: { ...account.user, id: '507f1f77bcf86cd799439099', name: 'Another Member' } });
  const newRequest = await loadAfter(page, () => page.evaluate(() => homeNotifications()));
  await showFilters(page);
  assert.equal(await search(page).inputValue(), '', 'A new account starts with a clean notification query');
  assert.equal(await rows(page).count(), 0, 'Notifications from the previous account are cleared');
  await result(page, pendingOld, [notices[0]]);
  assert.equal(await rows(page).count(), 0, 'A late result from the previous account is ignored');
  await result(page, newRequest, []);
  await page.getByRole('heading', { name: "You're all caught up", exact: true }).waitFor();
  assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 0);
  console.log('PASS notifications: sign-out/account changes clear results, filters and selection and reject stale account requests');
}

async function realLogoutIsolation(page) {
  let request = await loadAfter(page, () => pullToRefresh(page));
  await result(page, request);
  request = await loadAfter(page, () => status(page, 'Unread').click());
  await result(page, request, notices.slice(0, 2), { totalCount: 3, unreadCount: 2 });
  const oldLoad = await loadAfter(page, () => search(page).fill('private old account'));
  await result(page, oldLoad, [notices[0]], { totalCount: 3, unreadCount: 2 });
  await selectNotice(page, notices[0]);
  const oldMutation = await requestAfter(page, 'notifications.read', () => button(page, 'Mark selected read').click());
  assert.equal(await search(page).isEnabled(), false, 'A pending write locks the old account controls');
  await requestAfter(page, 'auth.logout', () => page.evaluate(() => logout()));
  assert.equal(await page.evaluate(() => S.v), 'welcome');

  // Follow the real returning-account flow: logout sends no session.none event.
  await page.locator('button[onclick="obStart(\'login\')"]').click();
  await page.locator('#ph').fill('9876543210');
  const otp = await requestAfter(page, 'auth.sendOtp', () => page.locator('button[onclick*="obSendOtp("]').first().click());
  await receive(page, 'auth.otpSent', { phone: '+919876543210', requestId: otp.requestId });
  const verifying = await requestAfter(page, 'auth.verifyOtp', () => page.locator('#o0').evaluate(input => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => '123456' } });
    input.dispatchEvent(event);
  }));
  await receive(page, 'auth.ok', { ...account, user: { ...account.user, id: '507f1f77bcf86cd799439088', name: 'Returning Member' }, isNew: false, requestId: verifying.requestId });
  await page.waitForFunction(() => S.v === 'home');
  const fresh = await loadAfter(page, () => page.evaluate(() => homeNotifications()));
  await showFilters(page);
  assert.equal(fresh.q, '', 'Actual logout followed by auth.ok resets private search text');
  assert.equal(fresh.status, 'all', 'Actual logout resets the previous account filters');
  assert.equal(await search(page).isEnabled(), true, 'An old pending mutation cannot lock the new account inbox');
  assert.equal(await rows(page).count(), 0);
  await result(page, oldLoad, [notices[0]]);
  assert.equal(await rows(page).count(), 0, 'Old account load results stay retired after auth.ok');
  const loads = (await sent(page, 'notifications.load')).length;
  await receive(page, 'notifications.saved', { ids: oldMutation.ids, read: true, unreadCount: 0, totalCount: 3, count: 1, requestId: oldMutation.requestId });
  assert.equal((await sent(page, 'notifications.load')).length, loads, 'An old acknowledgment cannot trigger a new account refresh');
  const ownNotice = { ...notices[0], id: '507f1f77bcf86cd799439087', title: 'A new account update' };
  await result(page, fresh, [ownNotice]);
  assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 0);
  const ownMutation = await requestAfter(page, 'notifications.read', () => button(page, `Open notification: ${ownNotice.title}`).click());
  await save(page, ownMutation, true, [ownNotice.id], [{ ...ownNotice, read: true }]);
  assert.doesNotMatch(await row(page, ownNotice).getAttribute('class'), /\bunread\b/, 'The newly signed-in account can update its own notifications');
  await button(page, 'Close notification').click();
  console.log('PASS notifications: real logout/OTP/auth.ok clears pending writes and private filters and rejects old-account acknowledgments');
}

async function visualChecks(page) {
  const request = await loadAfter(page, () => page.locator('.zn-period-tabs').getByRole('button', { name: 'All', exact: true }).click());
  await result(page, request, [...notices, moreNotice]);
  await stopSelecting(page);
  await button(page, 'Filter notifications').click();
  fs.mkdirSync(artifacts, { recursive: true });
  for (const mode of ['dark', 'light']) {
    const themes = await page.evaluate(value => ({ items: [ZThemeOriginal, ZThemeRose], selectedThemeId: value === 'dark' ? ZThemeOriginal.id : ZThemeRose.id, premium: { active: false } }), mode);
    await receive(page, 'data.themes', themes);
    await page.evaluate(dark => window.ZimiThemes.setDark(dark), mode === 'dark');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), mode, 'Dark Mode decides the canvas');
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
      await layout(page, `${mode} notifications at ${width}px`);
      await page.locator('#scroll-root').evaluate(element => { element.scrollTop = 0; });
      if (width === 390) await page.screenshot({ path: path.join(artifacts, `notifications-mobile-${mode}.png`), fullPage: true });
      if (width === 1280 && mode === 'dark') await page.screenshot({ path: path.join(artifacts, 'notifications-desktop.png'), fullPage: true });
      await showFilters(page);
      await layout(page, `${mode} expanded notification filters at ${width}px`);
      await button(page, 'Filter notifications').click();
    }
  }
  console.log('PASS notifications: 320/390/1280px light/dark layouts, reduced motion and screenshot artifacts');
}

async function previewChecks(browser, errors) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(7000);
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https?:\/\//, route => route.abort());
  await page.addInitScript(() => {
    window.__sent = [];
    window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) };
  });
  await page.goto(pathToFileURL(path.join(root, 'dist/index.html')).href + '?role=sender');
  await page.evaluate(() => homeNotifications());
  await page.locator('.zn-page').waitFor();
  assert.equal(await rows(page).count(), 5, 'The browser preview has its own sample inbox');
  for (const mode of ['dark', 'light']) {
    const themes = await page.evaluate(value => ({ items: [ZThemeOriginal, ZThemeRose], selectedThemeId: value === 'dark' ? ZThemeOriginal.id : ZThemeRose.id, premium: { active: false } }), mode);
    await receive(page, 'data.themes', themes);
    await page.evaluate(dark => window.ZimiThemes.setDark(dark), mode === 'dark');
    await layout(page, `${mode} sample inbox at 390px`);
    await page.screenshot({ path: path.join(artifacts, `notifications-preview-mobile-${mode}.png`), fullPage: true });
  }
  await showFilters(page);
  await search(page).fill('profile');
  await page.waitForFunction(() => document.querySelectorAll('article.zh-notification').length === 1);
  assert.equal(await rows(page).locator('h3').textContent(), 'Make your profile your own');
  await audience(page, 'Announcements').click();
  await page.getByRole('heading', { name: 'No matching notifications', exact: true }).waitFor();
  await button(page.locator('#zn-results'), 'Reset filters').click();
  assert.equal(await rows(page).count(), 5);
  await button(page, 'Mark all read').click();
  assert.equal(await page.locator('article.zh-notification.unread').count(), 0, 'The preview also supports mark all read');
  assert.equal((await sent(page, 'notifications.load')).length, 0, 'Preview filters never request a real account inbox');
  console.log('PASS notifications: interactive sample inbox, preview search/audience/reset/read-all and light/dark mobile screenshots');
  await page.close();
}

async function run() {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !/^Failed to load resource: net::ERR_/.test(message.text())) errors.push(message.text()); });
    await page.route(/^https?:\/\//, route => route.abort());
    await page.addInitScript(() => {
      window.__sent = [];
      window.ReactNativeWebView = { postMessage: raw => __sent.push(JSON.parse(raw)) };
    });
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href + '?role=sender');
    await receive(page, 'session', account);
    const initial = await loadAfter(page, () => page.evaluate(() => homeNotifications()));
    await page.locator('.zn-page').waitFor();
    await page.getByRole('heading', { name: 'Notifications', exact: true }).waitFor();
    await showFilters(page);
    await filters(page, initial);
    await dateChips(page);
    await pagination(page);
    await debounceAndRealtime(page);
    await mutations(page);
    await detailAndSafety(page);
    await accountIsolation(page);
    await realLogoutIsolation(page);
    await visualChecks(page);
    await previewChecks(browser, errors);
    assert.deepEqual(errors, [], 'The notification inbox has no uncaught or caught native handler errors');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
