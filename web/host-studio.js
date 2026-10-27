/* Host targets are personal session preferences. Progress comes only from accepted
   gift receipts; reward amounts and eligibility come from the authenticated Home feed. */
const HostStudio = {
  sheet: '', goal: 1000000, giftId: '', giftCount: 10, previewEffect: 'original',
  receivedCoins: 0, received: Object.create(null), giftNames: Object.create(null),
  receipts: new Set(), lastView: '', accountId: '', focus: '', opener: null, mounted: null, openedAt: 0
};
const HS_GOALS = [[100000, '100K'], [500000, '500K'], [1000000, '1M'], [5000000, '5M'], [10000000, '10M']];
const HS_COUNTS = [5, 10, 20, 50];
const HS_EFFECTS = [['original', 'Original'], ['warm', 'Warm'], ['soft', 'Soft'], ['mono', 'Mono']];

function hsAllowed() { return ['setup', 'hcall'].includes(S.v) && isApprovedHost(); }
function hsCatalog() { return Array.isArray(Home.gifts) ? Home.gifts : []; }
function hsTargetGift() {
  const gifts = hsCatalog();
  return gifts.find(gift => gift.id === HostStudio.giftId) || gifts[0] || null;
}
function hsGiftArt(gift) {
  const src = gift && homeGiftUrl(gift.mediaUrl);
  return src ? `<img src="${src}" alt="">` : esc(gift?.emoji || '🎁');
}
function hsGiftProgress(gift = hsTargetGift()) {
  if (!gift) return 0;
  return (HostStudio.received[gift.id] || 0) + (HostStudio.giftNames[gift.name] || 0);
}
function hsGoalLabel() { return HS_GOALS.find(([coins]) => coins === HostStudio.goal)?.[1] || n(HostStudio.goal); }
function hsPercent(value, total) { return Math.min(100, Math.max(0, total ? value / total * 100 : 0)); }
function hsReloadCatalog() {
  if (!hsAllowed() || DEMO || contentPending('catalog')) return;
  contentStart('catalog'); Native.send('catalog.load'); r();
}
function hsOpenSheet(kind) {
  if (!['mission', 'gift-target', 'appearance'].includes(kind) || !hsAllowed()) return;
  const active = document.activeElement;
  HostStudio.opener = active?.getAttribute('aria-label') || active?.getAttribute('data-hs-focus') || null;
  HostStudio.focus = 'close'; HostStudio.sheet = kind; HostStudio.openedAt = Date.now();
  if (typeof Room !== 'undefined') Room.sheet = '';
  if (kind === 'gift-target' && !DEMO && !hsCatalog().length && !contentPending('catalog') && !ContentLoading.catalog.error) {
    contentStart('catalog'); Native.send('catalog.load');
  }
  r(); hsAfter();
}
function hsCloseSheet() {
  const opener = HostStudio.opener;
  HostStudio.sheet = ''; HostStudio.focus = ''; HostStudio.mounted = null; r();
  if (opener) [...document.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === opener || button.dataset.hsFocus === opener)?.focus({ preventScroll: true });
}
/* A choice inside an open sheet repaints only the sheet's body and the target cards, so the sheet
   does not slide in again and the camera or call behind it is left untouched. */
function hsPaintSheet() {
  const body = document.querySelector('.hs-sheet-body'), next = document.createElement('div');
  next.innerHTML = hsSheet();
  const fresh = next.querySelector('.hs-sheet-body');
  if (body && fresh) { body.replaceChildren(...fresh.childNodes); hsPaintTargets(); }
  else r();
  hsAfter();
}
function hsSetGoal(value) {
  value = Number(value);
  if (!hsAllowed() || !HS_GOALS.some(([coins]) => coins === value)) return;
  HostStudio.goal = value; HostStudio.focus = `goal-${value}`; hsPaintSheet();
}
function hsChooseGift(id, open = false) {
  if (!hsAllowed() || !hsCatalog().some(gift => gift.id === id)) return;
  HostStudio.giftId = id;
  if (open) { hsOpenSheet('gift-target'); HostStudio.focus = `gift-${id}`; hsAfter(); }
  else { HostStudio.focus = `gift-${id}`; hsPaintSheet(); }
}
function hsSetGiftCount(value) {
  value = Number(value);
  if (!hsAllowed() || !HS_COUNTS.includes(value)) return;
  HostStudio.giftCount = value; HostStudio.focus = `count-${value}`; hsPaintSheet();
}
function hsSetEffect(value) {
  if (!hsAllowed() || !HS_EFFECTS.some(([key]) => key === value)) return;
  HostStudio.previewEffect = value; HostStudio.focus = `effect-${value}`;
  document.documentElement.dataset.hostPreviewEffect = value; hsPaintSheet();
}
function hsCatalogPlaceholder(rail = false) {
  if (!DEMO && contentPending('catalog')) return `<div class="hs-gift-loading ${rail ? 'hs-rail-loading' : ''}" role="status" aria-label="Loading gift targets" aria-busy="true">${Array.from({ length: rail ? 7 : 6 }, () => `<span aria-hidden="true">${skeletonLine('30px', 30)}${skeletonLine('36px', 8)}</span>`).join('')}</div>`;
  const error = !DEMO && ContentLoading.catalog.error;
  return `<div class="hs-empty" ${error ? 'role="alert"' : ''}><span>${esc(error || 'Gift targets will appear when gifts are available.')}</span>${!DEMO ? `<button type="button" onclick="hsReloadCatalog()" data-hs-focus="retry-catalog">${hi('refresh', 14)} ${error ? 'Retry gift targets' : 'Load gift targets'}</button>` : ''}</div>`;
}
function hsTaskRows() {
  if (DEMO) return S.tasks.slice(0, 3).map(task => `<div class="hs-task"><span class="hs-task-icon">${hi(task.ico || 'cup', 18)}</span><span class="hs-task-copy"><b>${esc(task.d || task.t)}</b><small>${n(Math.min(task.p, task.goal))} / ${n(task.goal)} ${esc(task.u || '')}</small><i><em style="width:${hsPercent(task.p, task.goal)}%"></em></i></span><strong>${coinIcon(14)} ${n(task.rw)}</strong></div>`).join('');
  const bonus = Home.bonus;
  if (!bonus) return '<p class="hs-tasks-empty">No active rewards right now. Your gift targets still track this session.</p>';
  const progress = Math.max(0, Number(bonus.progress) || 0), target = Math.max(1, Number(bonus.target) || 1);
  return `<div class="hs-task"><span class="hs-task-icon">${hi('cup', 18)}</span><span class="hs-task-copy"><b>${esc(bonus.title)}</b><small>${esc(bonus.description || '')}</small><small>${n(Math.min(progress, target))} / ${n(target)} completed</small><i><em style="width:${hsPercent(progress, target)}%"></em></i></span><strong>${coinIcon(14)} ${n(bonus.rewardCoins || 0)}</strong></div>${bonus.claimed ? '<p class="hs-tasks-empty">Reward claimed</p>' : progress >= target ? `<button class="hs-claim" type="button" onclick="homeClaim()" ${Home.claiming ? 'disabled' : ''}>${Home.claiming ? 'Claiming…' : 'Claim reward'}</button>` : ''}`;
}
function hsSheet() {
  const kind = HostStudio.sheet;
  if (!kind || !hsAllowed()) return '';
  let title = '', subtitle = '', body = '';
  if (kind === 'mission') {
    title = 'Mission'; subtitle = 'Your target rises as coins come in';
    const progress = HostStudio.receivedCoins, percent = hsPercent(progress, HostStudio.goal);
    body = `<div class="hs-options" role="group" aria-label="Mission target">${HS_GOALS.map(([value, label]) => `<button type="button" class="${HostStudio.goal === value ? 'is-on' : ''}" aria-pressed="${HostStudio.goal === value}" data-hs-focus="goal-${value}" onclick="hsSetGoal(${value})">${label}</button>`).join('')}</div><div class="hs-mission-total"><strong>${n(progress)}</strong><span>of ${hsGoalLabel()} · ${percent.toFixed(1)}%</span></div><div class="hs-progress" role="progressbar" aria-label="Mission progress" aria-valuenow="${Math.round(percent)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${percent}%"></i></div><div class="hs-section-label"><b>Tasks</b><span>${DEMO ? 'Design preview' : 'Your available rewards'}</span></div>${hsTaskRows()}`;
  } else if (kind === 'gift-target') {
    title = 'Gift target'; subtitle = 'Pick the gift you’d love to receive';
    const gift = hsTargetGift();
    body = !hsCatalog().length || !DEMO && contentPending('catalog') ? hsCatalogPlaceholder() : `<div class="hs-gift-options" role="group" aria-label="Choose a gift target">${hsCatalog().map(item => `<button type="button" class="${gift?.id === item.id ? 'is-on' : ''}" aria-label="Target ${esc(item.name)}" aria-pressed="${gift?.id === item.id}" data-hs-focus="gift-${esc(item.id)}" onclick="hsChooseGift('${domId(item.id)}')"><span class="hs-gift-art">${hsGiftArt(item)}</span><small>${coinIcon(10)} ${n(item.coins)}</small></button>`).join('')}</div><div class="hs-options" role="group" aria-label="Number of gifts">${HS_COUNTS.map(count => `<button type="button" class="${HostStudio.giftCount === count ? 'is-on' : ''}" aria-pressed="${HostStudio.giftCount === count}" data-hs-focus="count-${count}" onclick="hsSetGiftCount(${count})">${count} ×</button>`).join('')}</div><div class="hs-target-detail"><span>${hsGiftArt(gift)} <b>${esc(gift?.name || '')}</b></span><span>${n(hsGiftProgress(gift))} / ${HostStudio.giftCount} · ${n((gift?.coins || 0) * HostStudio.giftCount)} coins</span></div><p class="hs-sheet-note">A personal target for gifts you receive during this session.</p>`;
  } else {
    title = 'Beauty & filters'; subtitle = 'Choose the look of your camera preview';
    body = `<div class="hs-effects" role="group" aria-label="Camera preview filter">${HS_EFFECTS.map(([key, label]) => `<button type="button" class="${HostStudio.previewEffect === key ? 'is-on' : ''}" aria-pressed="${HostStudio.previewEffect === key}" data-hs-focus="effect-${key}" onclick="hsSetEffect('${key}')"><span class="hs-effect-swatch hs-effect-${key}">${hi('star', 22)}</span><span>${label}</span></button>`).join('')}</div><p class="hs-preview-only">${hi('eye', 14)} Preview only</p><p class="hs-sheet-note">These filters change your own preview. Your caller sees the original camera video.</p>`;
  }
  /* Redraws while the sheet is open resume its entrance instead of replaying it. */
  const age = Math.min(250, Math.max(0, Date.now() - HostStudio.openedAt));
  return `<div class="hs-sheet-backdrop" onclick="if(event.target===this)hsCloseSheet()"><section class="hs-sheet hs-sheet-${kind}" style="--hs-enter-age:-${age}ms" role="dialog" aria-modal="true" aria-labelledby="hs-title" data-lenis-prevent><header><div><h2 id="hs-title">${title}</h2><p>${subtitle}</p></div><button type="button" class="hs-sheet-close" aria-label="Close ${title}" data-hs-focus="close" onclick="hsCloseSheet()">${hi('close', 18)}</button></header><div class="hs-sheet-body">${body}</div></section></div>`;
}
function hsTargets() {
  const gift = hsTargetGift(), got = hsGiftProgress(gift), percent = hsPercent(HostStudio.receivedCoins, HostStudio.goal);
  return `<div class="hs-targets"><button type="button" class="hs-target-card" aria-label="Edit gift target" onclick="hsOpenSheet('gift-target')"><span class="hs-target-art">${hsGiftArt(gift)}</span><span class="hs-target-copy"><span class="hs-target-label">GIFT TARGET <b>${n(got)}/${HostStudio.giftCount}</b></span><strong>${gift ? `${coinIcon(10)} ${n(gift.coins)}` : 'Choose gift'}</strong><i class="hs-target-track"><em style="width:${hsPercent(got, HostStudio.giftCount)}%"></em></i></span></button><button type="button" class="hs-target-card" aria-label="Edit mission target" onclick="hsOpenSheet('mission')"><span class="hs-target-copy"><span class="hs-target-label">MISSION <b>${Math.floor(percent)}%</b></span><strong>${coinIcon(10)} <span data-hs-earned>${n(HostStudio.receivedCoins)}</span><small> / ${hsGoalLabel()}</small></strong><i class="hs-target-track"><em style="width:${percent}%"></em></i></span></button></div>`;
}
function hsGiftRail() {
  if (!hsCatalog().length || !DEMO && contentPending('catalog')) return hsCatalogPlaceholder(true);
  return `<div class="hs-gift-rail" role="group" aria-label="Gift targets" data-lenis-prevent>${hsCatalog().map(gift => `<button type="button" aria-label="Choose ${esc(gift.name)} as gift target" onclick="hsChooseGift('${domId(gift.id)}',true)"><span class="hs-gift-art">${hsGiftArt(gift)}</span><small>${coinIcon(9)} ${n(gift.coins)}</small></button>`).join('')}</div>`;
}
function hsPaintTargets() {
  document.querySelectorAll('.hs-targets').forEach(node => { node.outerHTML = hsTargets(); });
}
/* Called only after the room has accepted and deduplicated the receipt. The small
   second guard keeps session progress stable if a caller switches and room state resets. */
function hsReceiveGift(data) {
  if (S.v !== 'hcall' || !isApprovedHost()) return;
  const receipt = data.id || data._id || data.transactionId;
  if (receipt && HostStudio.receipts.has(receipt)) return;
  if (receipt) HostStudio.receipts.add(receipt);
  const coins = Number(data.totalCoins ?? data.coins ?? data.amount);
  if (Number.isFinite(coins) && coins > 0) HostStudio.receivedCoins += coins;
  const gift = typeof data.gift === 'object' && data.gift ? data.gift : null;
  const id = data.giftId || gift?.id || gift?._id;
  const name = data.giftName || gift?.name || (typeof data.gift === 'string' ? data.gift : '');
  const quantity = Math.max(1, Math.min(100, Math.floor(Number(data.quantity) || 1)));
  if (id) HostStudio.received[id] = (HostStudio.received[id] || 0) + quantity;
  else if (name) HostStudio.giftNames[name] = (HostStudio.giftNames[name] || 0) + quantity;
  hsPaintTargets();
}
function hsResetProgress() {
  HostStudio.receivedCoins = 0; HostStudio.received = Object.create(null); HostStudio.giftNames = Object.create(null); HostStudio.receipts = new Set();
}
function hsReset() {
  hsResetProgress(); Object.assign(HostStudio, { sheet: '', goal: 1000000, giftId: '', giftCount: 10, previewEffect: 'original', focus: '', opener: null, mounted: null, lastView: '' });
  delete document.documentElement.dataset.hostPreviewEffect;
}
function hsAfter() {
  const sheet = document.querySelector('.hs-sheet');
  if (!sheet) { HostStudio.mounted = null; return; }
  if (sheet === HostStudio.mounted && sheet.contains(document.activeElement)) return;
  HostStudio.mounted = sheet;
  const focus = [...sheet.querySelectorAll('[data-hs-focus]')].find(node => node.dataset.hsFocus === HostStudio.focus);
  (focus || sheet.querySelector('button'))?.focus({ preventScroll: true });
}
document.addEventListener('focusin', event => {
  if (event.target.closest?.('.hs-sheet') && event.target.dataset.hsFocus) HostStudio.focus = event.target.dataset.hsFocus;
});
document.addEventListener('keydown', event => {
  const sheet = document.querySelector('.hs-sheet'); if (!sheet) return;
  if (event.key === 'Escape') { event.preventDefault(); hsCloseSheet(); }
  else if (event.key === 'Tab') {
    const buttons = [...sheet.querySelectorAll('button:not(:disabled),input,select,a[href]')];
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});
document.addEventListener('aurora:navigate', () => {
  if (S.v === 'hcall' && HostStudio.lastView !== 'hcall') { hsResetProgress(); hsPaintTargets(); }
  HostStudio.lastView = S.v; HostStudio.sheet = ''; HostStudio.focus = ''; HostStudio.mounted = null;
  if (S.v === 'hcall' && !DEMO && !hsCatalog().length && !contentPending('catalog')) { contentStart('catalog'); Native.send('catalog.load'); }
});
Native.on('data.catalog', () => { if (HostStudio.sheet === 'gift-target' && S.v === 'setup') r(); });
Native.on('operation.error', data => { if (data.action === 'catalog.load' && HostStudio.sheet === 'gift-target' && S.v === 'setup') r(); });
Native.on('session', data => { if (HostStudio.accountId !== data.user?.id) { hsReset(); HostStudio.accountId = data.user?.id || ''; } });
['session.none', 'session.expired'].forEach(type => Native.on(type, () => { hsReset(); HostStudio.accountId = ''; }));
const hsScreen = document.getElementById('screen');
if (hsScreen) new MutationObserver(hsAfter).observe(hsScreen, { childList: true });
