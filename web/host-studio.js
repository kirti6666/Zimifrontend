/* Host targets track member gift spending from accepted receipts. They are not
   host earnings; confirmed Diamond rewards and eligibility belong to Wallet. */
const HostStudio = {
  sheet: '', goal: 1000000, goalDraft: null, giftId: '', giftCount: 10, giftScroll: 0,
  receivedCoins: 0, received: Object.create(null), giftNames: Object.create(null),
  receipts: new Set(), lastView: '', accountId: '', focus: '', opener: null, mounted: null, openedAt: 0
};
/* Mission presets and limits follow the Mission sheet reference (the server accepts up to 1,000,000,000). */
const HS_GOALS = [5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000];
const HS_GOAL_MIN = 1000, HS_GOAL_MAX = 99999999, HS_GOAL_STEP = 10000;
const HS_COUNTS = [5, 10, 20, 50], HS_COUNT_MAX = 999;
/* The tinted circles behind gifts in the Gift target reference. A gift keeps its tint by name. */
const HS_TINTS = ['#3A1018', '#33290A', '#33220F', '#3A1A2E', '#3A1029', '#16273A', '#2C2A12', '#2A1A3A', '#1A2E33', '#33280A', '#24173A', '#12283A'];

function hsAllowed() { return ['setup', 'hcall'].includes(S.v) && isApprovedHost(); }
function hsCatalog() { return Array.isArray(Home.gifts) ? Home.gifts : []; }
function hsTargetGift() {
  const gifts = hsCatalog();
  return gifts.find(gift => gift.id === HostStudio.giftId) || gifts[0] || null;
}
function hsGiftArt(gift) {
  const src = gift && giftStillUrl(gift.name, gift.mediaUrl, gift.coverUrl);
  return src ? `<img src="${src}" alt="">` : esc(gift?.emoji || '🎁');
}
function hsGiftProgress(gift = hsTargetGift()) {
  if (!gift) return 0;
  return (HostStudio.received[gift.id] || 0) + (HostStudio.giftNames[gift.name] || 0);
}
/* Short coin amounts such as 5K, 500K and 1.25M, as on the reference goal chips. */
function hsCompact(value) {
  value = Math.max(0, Math.floor(Number(value) || 0));
  if (value >= 999995) return +(value / 1e6).toFixed(2) + 'M';
  if (value >= 1000) return +(value / 1e3).toFixed(2) + 'K';
  return String(value);
}
function hsGoalLabel() { return hsCompact(HostStudio.goal); }
function hsGoalValid(value) { return Number.isInteger(value) && value >= HS_GOAL_MIN && value <= HS_GOAL_MAX; }
function hsDigits(text) { const digits = String(text ?? '').replace(/\D/g, '').slice(0, 10); return digits ? Number(digits) : 0; }
function hsTint(gift) {
  let hash = 0;
  for (const char of String(gift?.name || gift?.id || '')) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return HS_TINTS[hash % HS_TINTS.length];
}
function hsPercent(value, total) { return Math.min(100, Math.max(0, total ? value / total * 100 : 0)); }
function hsReloadCatalog() {
  if (!hsAllowed() || DEMO || contentPending('catalog')) return;
  contentStart('catalog'); Native.send('catalog.load'); r();
}
function hsOpenSheet(kind) {
  if (!['mission', 'gift-target', 'appearance', 'card-image'].includes(kind) || !hsAllowed()) return;
  if (kind === 'appearance' && S.v === 'hcall' && S.caller?.voice) return;
  if (kind === 'appearance') {
    window.ZimiBeauty?.openPicker();
    if (typeof Room !== 'undefined') Room.chatOpen = false;
  }
  const active = document.activeElement;
  HostStudio.opener = active?.getAttribute('aria-label') || active?.getAttribute('data-hs-focus') || null;
  HostStudio.focus = 'close'; HostStudio.sheet = kind; HostStudio.openedAt = Date.now(); HostStudio.giftScroll = 0;
  if (typeof Room !== 'undefined') Room.sheet = '';
  if (kind === 'gift-target' && !DEMO && !hsCatalog().length && !contentPending('catalog') && !ContentLoading.catalog.error) {
    contentStart('catalog'); Native.send('catalog.load');
  }
  r(); hsAfter();
}
function hsCloseSheet() {
  const opener = HostStudio.opener, closing = HostStudio.sheet;
  window.ZimiBeauty?.compare?.(false);
  if (closing === 'card-image' && !HostStudio.cardSaving) {
    HostStudio.cardPrepareId = ++mediaSequence;
    HostStudio.cardDraft = ''; HostStudio.cardPreparing = false; HostStudio.cardError = '';
  }
  /* A goal typed below the minimum is dropped; the last valid goal stays. */
  HostStudio.sheet = ''; HostStudio.focus = ''; HostStudio.mounted = null; HostStudio.goalDraft = null; r();
  if (opener) ([...document.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === opener || button.dataset.hsFocus === opener) || document.querySelector('button[aria-label="Call options"]'))?.focus({ preventScroll: true });
}
/* A choice inside an open sheet repaints only the sheet's body and the target cards, so the sheet
   does not slide in again and the camera or call behind it is left untouched. */
function hsPaintSheet() {
  const body = document.querySelector('.hs-sheet-body'), next = document.createElement('div');
  next.innerHTML = hsSheet();
  const fresh = next.querySelector('.hs-sheet-body');
  const save = document.querySelector('.hs-card-save'), freshSave = next.querySelector('.hs-card-save');
  if (body && fresh) {
    HostStudio.giftScroll = body.querySelector('.hs-gift-scroll')?.scrollTop ?? HostStudio.giftScroll;
    body.replaceChildren(...fresh.childNodes);
    if (save && freshSave) save.replaceWith(freshSave);
    hsPaintTargets();
  }
  else r();
  hsAfter();
}
function hsSetGoal(value, focus = `goal-${value}`) {
  value = Number(value);
  if (!hsAllowed() || !hsGoalValid(value)) return;
  HostStudio.goal = value; HostStudio.goalDraft = null; HostStudio.focus = focus; hsPaintSheet();
}
/* − and + move the goal by 10,000 within its limits, starting from what the host typed. */
function hsStepGoal(direction) {
  if (!hsAllowed()) return;
  const draft = HostStudio.goalDraft, base = draft === null ? HostStudio.goal : hsDigits(draft) || HostStudio.goal;
  const next = Math.min(HS_GOAL_MAX, Math.max(HS_GOAL_MIN, base + (direction < 0 ? -HS_GOAL_STEP : HS_GOAL_STEP)));
  hsSetGoal(next, direction < 0 ? 'goal-dec' : 'goal-inc');
}
/* Typing keeps the field and its caret: only the chips, hint and progress card repaint. */
function hsGoalInput(input) {
  if (!hsAllowed() || HostStudio.sheet !== 'mission') return;
  const typed = hsDigits(input.value), valid = hsGoalValid(typed);
  HostStudio.goalDraft = input.value;
  if (valid) HostStudio.goal = typed;
  const sheet = input.closest('.hs-sheet'), next = document.createElement('div');
  next.innerHTML = hsMissionBody();
  for (const selector of ['.hs-goals', '.hs-mission-card']) {
    const current = sheet?.querySelector(selector), fresh = next.querySelector(selector);
    if (current && fresh) current.replaceWith(fresh);
  }
  const hint = sheet?.querySelector('.hs-goal-hint'), freshHint = next.querySelector('.hs-goal-hint');
  if (hint && freshHint) { hint.className = freshHint.className; hint.textContent = freshHint.textContent; }
  input.closest('.hs-goal-field')?.classList.toggle('is-invalid', !valid);
  if (valid) input.removeAttribute('aria-invalid'); else input.setAttribute('aria-invalid', 'true');
  hsPaintTargets();
}
/* Enter or leaving the field shows a valid goal in full (10,00,000); a short one keeps its warning. */
function hsGoalCommit(input) {
  if (!hsAllowed() || HostStudio.sheet !== 'mission') return;
  const typed = hsDigits(input.value);
  if (!hsGoalValid(typed)) return;
  HostStudio.goal = typed; HostStudio.goalDraft = null; input.value = n(typed);
}
function hsChooseGift(id, open = false) {
  if (!hsAllowed() || !hsCatalog().some(gift => gift.id === id)) return;
  HostStudio.giftId = id;
  if (open) { hsOpenSheet('gift-target'); HostStudio.focus = `gift-${id}`; hsAfter(); }
  else { HostStudio.focus = `gift-${id}`; hsPaintSheet(); }
}
function hsSetGiftCount(value, focus = `count-${value}`) {
  value = Number(value);
  if (!hsAllowed() || !Number.isInteger(value) || value < 1 || value > HS_COUNT_MAX) return;
  HostStudio.giftCount = value; HostStudio.focus = focus; hsPaintSheet();
}
/* At a limit the pressed button disables, so focus moves to the other one. */
function hsStepGiftCount(direction) {
  const next = Math.min(HS_COUNT_MAX, Math.max(1, HostStudio.giftCount + (direction < 0 ? -1 : 1)));
  hsSetGiftCount(next, next <= 1 ? 'count-inc' : next >= HS_COUNT_MAX ? 'count-dec' : direction < 0 ? 'count-dec' : 'count-inc');
}
function hsCatalogPlaceholder(rail = false) {
  if (!DEMO && contentPending('catalog')) {
    if (!rail) return contentSkeleton('gifts', 'Loading gift targets', 12);
    return `<div class="hs-gift-loading hs-rail-loading" role="status" aria-label="Loading gift targets" aria-busy="true">${Array.from({ length: 7 }, () => `<span aria-hidden="true">${skeletonLine('30px', 30)}${skeletonLine('36px', 8)}</span>`).join('')}</div>`;
  }
  const error = !DEMO && ContentLoading.catalog.error;
  return `<div class="hs-empty" ${error ? 'role="alert"' : ''}><span>${esc(error || 'Gift targets will appear when gifts are available.')}</span>${!DEMO ? `<button type="button" onclick="hsReloadCatalog()" data-hs-focus="retry-catalog">${error ? 'Retry gift targets' : 'Load gift targets'}</button>` : ''}</div>`;
}
function hsGiftIcon(gift) { return `<span class="hs-gift-icon" style="--hs-tint:${hsTint(gift)}">${hsGiftArt(gift)}</span>`; }
function hsGiftTile(gift, selected) {
  const id = domId(gift.id);
  return `<button type="button" class="hs-gift-tile${selected ? ' is-on' : ''}" data-gift-id="${id}" aria-pressed="${selected}" aria-label="${esc(gift.name + ', ' + giftPriceLabel(gift))}" data-hs-focus="${esc('gift-' + gift.id)}" onclick="hsChooseGift('${id}')">${hsGiftIcon(gift)}<b>${esc(gift.name)}</b><span class="hs-gift-price">${giftIsFree(gift) ? 'Free' : coinIcon(13) + n(gift.coins)}</span>${selected ? `<i class="hs-gift-check" aria-hidden="true">${hi('check', 13)}</i>` : ''}</button>`;
}
function hsGiftTargetBody() {
  const gifts = hsCatalog(), label = '<p class="hs-section-title" id="hs-gift-label">CHOOSE A GIFT</p>';
  if (!gifts.length || !DEMO && (contentPending('catalog') || ContentLoading.catalog.error))
    return `${label}<div class="hs-gift-scroll">${hsCatalogPlaceholder()}</div>`;
  const gift = hsTargetGift(), count = HostStudio.giftCount, free = giftIsFree(gift);
  const tiles = homeGiftDisplayOrder(gifts).map(item => hsGiftTile(item, gift.id === item.id)).join('');
  return `${label}<div class="hs-gift-scroll"><div class="hs-gift-grid" role="group" aria-labelledby="hs-gift-label">${tiles}</div></div>
    <div class="hs-gift-footer">
      <p class="hs-section-title" id="hs-count-label">HOW MANY</p>
      <div class="hs-count-row" role="group" aria-labelledby="hs-count-label">
        <div class="hs-stepper"><button type="button" aria-label="Fewer gifts" data-hs-focus="count-dec" onclick="hsStepGiftCount(-1)" ${count <= 1 ? 'disabled' : ''}>${hi('minus', 18)}</button><output aria-live="polite">${n(count)}</output><button type="button" aria-label="More gifts" data-hs-focus="count-inc" onclick="hsStepGiftCount(1)" ${count >= HS_COUNT_MAX ? 'disabled' : ''}>${hi('plus', 18)}</button></div>
        <div class="hs-quick">${HS_COUNTS.map(value => `<button type="button" class="${count === value ? 'is-on' : ''}" aria-pressed="${count === value}" data-hs-focus="count-${value}" onclick="hsSetGiftCount(${value})">${value}×</button>`).join('')}</div>
      </div>
      <div class="hs-gift-summary">${hsGiftIcon(gift)}<span class="hs-summary-copy"><b>${esc(gift.name)} × ${n(count)}</b><small>${n(hsGiftProgress(gift))} of ${n(count)} received</small></span><span class="hs-summary-total"><b>${free ? 'Free' : n((gift.coins || 0) * count)}</b><small>${free ? 'no coins' : 'coins total'}</small></span></div>
      <button type="button" class="hs-done" data-hs-focus="done" onclick="hsCloseSheet()">Done</button>
    </div>`;
}
function hsMissionBody() {
  const draft = HostStudio.goalDraft, typed = draft === null ? HostStudio.goal : hsDigits(draft);
  const valid = hsGoalValid(typed), goal = valid ? typed : 0, earned = Math.max(0, Math.floor(HostStudio.receivedCoins));
  const fraction = goal ? Math.min(1, earned / goal) : 0, goalText = goal ? n(goal) : '—';
  const status = !goal ? 'Set a goal to start' : fraction >= 1 ? 'Goal reached' : `${n(goal - earned)} to go`;
  const hint = valid ? 'Any amount from 1,000 · − / + changes it by 10,000' : typed > HS_GOAL_MAX ? `Enter up to ${n(HS_GOAL_MAX)} coins` : 'Enter at least 1,000 coins';
  return `<p class="hs-section-title" id="hs-goal-label">CHOOSE YOUR GOAL</p>
    <div class="hs-goals" role="group" aria-labelledby="hs-goal-label">${HS_GOALS.map(value => { const on = valid && typed === value; return `<button type="button" class="${on ? 'is-on' : ''}" aria-pressed="${on}" aria-label="Goal ${n(value)} coins" data-hs-focus="goal-${value}" onclick="hsSetGoal(${value})">${hsCompact(value)}</button>`; }).join('')}</div>
    <div class="hs-goal-row">
      <button type="button" class="hs-goal-step" aria-label="Decrease by 10,000" data-hs-focus="goal-dec" onclick="hsStepGoal(-1)">${hi('minus', 18)}</button>
      <label class="hs-goal-field${valid ? '' : ' is-invalid'}"><input type="text" inputmode="numeric" autocomplete="off" maxlength="13" aria-label="Goal in coins" aria-describedby="hs-goal-hint" ${valid ? '' : 'aria-invalid="true"'} placeholder="Enter amount" value="${esc(draft === null ? n(HostStudio.goal) : draft)}" data-hs-focus="goal-input" oninput="hsGoalInput(this)" onchange="hsGoalCommit(this)" onkeydown="if(event.key==='Enter'){event.preventDefault();hsGoalCommit(this)}"><span>coins</span></label>
      <button type="button" class="hs-goal-step" aria-label="Increase by 10,000" data-hs-focus="goal-inc" onclick="hsStepGoal(1)">${hi('plus', 18)}</button>
    </div>
    <p class="hs-goal-hint${valid ? '' : ' is-invalid'}" id="hs-goal-hint" aria-live="polite">${hint}</p>
    <div class="hs-mission-card">
      <div class="hs-mission-head"><div><p>Coins gifted by users</p><div class="hs-mission-total"><strong>${earned >= 1000 ? hsCompact(earned) : n(earned)}</strong><span>of ${goalText}</span></div></div><span class="hs-mission-pct">${(fraction * 100).toFixed(1)}%</span></div>
      <div class="hs-progress" role="progressbar" aria-label="User gift support progress" aria-valuenow="${Math.round(fraction * 100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${fraction * 100}%"></i></div>
      <div class="hs-mission-foot"><span>${status}</span><span>Goal ${goalText}</span></div>
    </div>`;
}
function hsSheet() {
  const kind = HostStudio.sheet;
  if (!kind || !hsAllowed()) return '';
  if (kind === 'appearance' && S.v === 'hcall' && S.caller?.voice) return '';
  /* Mission and Gift target follow the go-live sheet reference. */
  const reference = kind === 'mission' || kind === 'gift-target';
  let title = '', subtitle = '', body = '';
  if (kind === 'mission') {
    title = 'Mission'; subtitle = 'Track user gift spending in coins. You earn diamonds.';
    body = hsMissionBody();
  } else if (kind === 'gift-target') {
    title = 'Gift target'; subtitle = 'Pick a gift and how many you’d like';
    body = hsGiftTargetBody();
  } else if (kind === 'card-image') {
    title = 'Creator card';
    const src=imageSrc(HostStudio.cardDraft||S.user?.creatorCardUrl),busy=HostStudio.cardSaving||HostStudio.cardPreparing;
    const status=HostCalls.status,rate=Number(status?.selectedRate??status?.rate??S.callRate)||0,name=S.user?.name||me.n||'Your name';
    body=`<div class="hs-card-preview">${src?`<img src="${src}" alt="Creator card preview">`:`<span class="hs-card-placeholder">${zi('camera',36)}<span>Add a photo</span></span>`}<span class="hs-card-identity"><b><i aria-hidden="true"></i>${esc(name)}</b><small>${rate?`${n(rate)} coins/min`:'Free calls'} &middot; Online</small></span></div>
      <p class="hs-card-helper">This is how users see you on Home</p>
      <div class="hs-card-actions"><label class="hs-card-choose hs-card-photos">${ci('image',18)} Choose from Photos<input type="file" accept="image/*" aria-label="Choose creator card image" onchange="hsPickCard(event)" ${busy?'disabled':''}></label><label class="hs-card-choose hs-card-camera">${zi('camera',18)} Take a photo<input type="file" accept="image/*" capture="user" aria-label="Take creator card photo" onchange="hsPickCard(event)" ${busy?'disabled':''}></label></div>
      ${HostStudio.cardPreparing?'<p class="hs-card-state" role="status" aria-label="Preparing creator card image">Preparing image…</p>':''}${HostStudio.cardError?`<p class="hs-card-error" role="alert">${esc(HostStudio.cardError)}</p>`:''}
      <div class="hs-card-tips"><p>${hi('check',16)}<span>Face clearly visible, in good light</span></p><p>${hi('check',16)}<span>Portrait (3:4) photos fit best</span></p></div>`;
  } else {
    /* The supplied full-camera treatment belongs to setup only. Active calls
       keep the compact dock so the existing caller/video controls stay usable. */
    return window.ZimiBeauty?.panel('hsCloseSheet()', 'Close Beauty & filters', S.v === 'setup' ? 'reference' : '') || '';
  }
  /* Redraws while the sheet is open resume its entrance instead of replaying it. */
  const age = Math.min(250, Math.max(0, Date.now() - HostStudio.openedAt));
  const header=kind==='card-image'?`<span class="hs-sheet-grip" aria-hidden="true"></span><header class="hs-card-header"><button type="button" class="hs-card-cancel" aria-label="Close Creator card image" data-hs-focus="close" onclick="hsCloseSheet()">Cancel</button><h2 id="hs-title">Creator card</h2><button type="button" class="hs-card-save" aria-label="Save card image" onclick="hsSaveCard()" ${!HostStudio.cardDraft||HostStudio.cardSaving||HostStudio.cardPreparing?'disabled':''}>${HostStudio.cardSaving?'Saving…':'Save'}</button></header>`:`<span class="hs-grip" aria-hidden="true"></span><header class="hs-ref-head"><div><h2 id="hs-title">${title}</h2><p>${subtitle}</p></div><button type="button" class="hs-sheet-close" aria-label="Close ${title}" data-hs-focus="close" onclick="hsCloseSheet()">${hi('close', 15)}</button></header>`;
  return `<div class="hs-sheet-backdrop${reference?' hs-ref-backdrop':''}" onclick="if(event.target===this)hsCloseSheet()"><section class="hs-sheet hs-sheet-${kind}${reference?' hs-ref':''}" style="--hs-enter-age:-${age}ms" role="dialog" aria-modal="true" aria-labelledby="hs-title" data-lenis-prevent>${header}<div class="hs-sheet-body">${body}</div></section></div>`;
}
function hsCardButton(){
  const src=imageSrc(S.user?.creatorCardUrl);
  return `<button type="button" class="hc-card-image" aria-label="Set creator card image" onclick="hsOpenSheet('card-image')"><span class="hc-card-thumb">${src?`<img src="${src}" alt="">`:ci('image',13)}</span><span>Creator card</span><small>Edit</small></button>`;
}
async function hsPickCard(event){
  const file=event.target.files?.[0];event.target.value='';if(!file||!hsAllowed()||HostStudio.cardSaving||HostStudio.cardPreparing)return;
  const owner=S.user?.id,run=++mediaSequence;HostStudio.cardPrepareId=run;HostStudio.cardPreparing=true;HostStudio.cardError='';hsPaintSheet();
  const current=()=>owner===S.user?.id&&run===HostStudio.cardPrepareId;
  try{const photo=await obReadPhoto(file);if(current()){if(photo.length>2*1024*1024)throw new Error('Choose a smaller image.');HostStudio.cardDraft=photo}}
  catch(error){if(current())HostStudio.cardError=error.message||'Could not prepare this image.'}
  finally{if(current()){HostStudio.cardPreparing=false;if(hsAllowed())hsPaintSheet()}}
}
function hsSaveCard(){
  if(!hsAllowed()||!HostStudio.cardDraft||HostStudio.cardSaving||HostStudio.cardPreparing)return;
  HostStudio.cardSaving=true;HostStudio.cardError='';HostStudio.cardRequestId=++mediaSequence;
  if(DEMO){S.user={...S.user,creatorCardUrl:HostStudio.cardDraft};HostStudio.cardDraft='';HostStudio.cardSaving=false;hsCloseSheet();return}
  Native.send('creator.card.save',{photo:HostStudio.cardDraft,requestId:HostStudio.cardRequestId});hsPaintSheet();
}
Native.on('creator.card.saved',d=>{
  if(d.requestId!==HostStudio.cardRequestId||!d.account?.user||d.account.user.id!==S.user?.id)return;
  const user=d.account.user;
  S.user={...S.user,creatorCardUrl:obPhotoUrl(user.creatorCardUrl||''),creatorCardKey:user.creatorCardKey};
  window.ZimiHostAccess?.apply(d.account);
  HostStudio.cardDraft='';HostStudio.cardSaving=false;
  if(HostStudio.sheet==='card-image')hsCloseSheet();else if(hsAllowed())r();
  appNotice('Creator card image saved.');
});
Native.on('creator.card.error',d=>{if(d.requestId!==HostStudio.cardRequestId)return;HostStudio.cardSaving=false;HostStudio.cardError=d.message||'Could not save the image. Try again.';if(HostStudio.sheet==='card-image'&&hsAllowed())hsPaintSheet()});
function hsTargets() {
  if (typeof ctShareTargets === 'function') ctShareTargets();
  const gift = hsTargetGift(), got = hsGiftProgress(gift), percent = hsPercent(HostStudio.receivedCoins, HostStudio.goal);
  return `<div class="hs-targets"><button type="button" class="hs-target-card" aria-label="Edit gift target" onclick="hsOpenSheet('gift-target')"><span class="hs-target-art">${hsGiftArt(gift)}</span><span class="hs-target-copy"><span class="hs-target-label">GIFT TARGET <b>${n(got)}/${HostStudio.giftCount}</b></span><strong title="User price in Coins">${gift ? `${giftPriceMarkup(gift,10)}` : 'Choose gift'}</strong><i class="hs-target-track"><em style="width:${hsPercent(got, HostStudio.giftCount)}%"></em></i></span></button><button type="button" class="hs-target-card" aria-label="Edit mission target" onclick="hsOpenSheet('mission')"><span class="hs-target-copy"><span class="hs-target-label">USER SUPPORT <b>${Math.floor(percent)}%</b></span><strong title="User gift spending in Coins">${coinIcon(10)} <span data-hs-earned>${n(HostStudio.receivedCoins)}</span><small> / ${hsGoalLabel()}</small></strong><i class="hs-target-track"><em style="width:${percent}%"></em></i></span></button></div>`;
}
function hsGiftRail() {
  if (!hsCatalog().length || !DEMO && contentPending('catalog')) return hsCatalogPlaceholder(true);
  return `<div class="hs-gift-rail" role="group" aria-label="Gift targets" data-lenis-prevent>${hsCatalog().map(gift => `<button type="button" aria-label="Choose ${esc(gift.name)} as gift target" onclick="hsChooseGift('${domId(gift.id)}',true)"><span class="hs-gift-art">${hsGiftArt(gift)}</span><small>${giftPriceMarkup(gift,9)}</small></button>`).join('')}</div>`;
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
  window.ZimiBeauty?.compare?.(false);
  hsResetProgress(); Object.assign(HostStudio, { sheet: '', goal: 1000000, goalDraft: null, giftId: '', giftCount: 10, focus: '', opener: null, mounted: null, lastView: '', cardDraft:'',cardSaving:false,cardPreparing:false,cardPrepareId:null,cardError:'',cardRequestId:null });
}
function hsAfter() {
  const panel = HostStudio.sheet === 'appearance' ? document.querySelector('[data-zimi-beauty-panel]') : null;
  if (panel) {
    HostStudio.mounted = panel;
    if (HostStudio.focus === 'close') {
      panel.querySelector('[data-zimi-beauty-close]')?.focus({ preventScroll: true });
      HostStudio.focus = '';
    }
    return;
  }
  const sheet = document.querySelector('.hs-sheet');
  if (!sheet) { HostStudio.mounted = null; return; }
  const catalog = sheet.querySelector('.hs-gift-scroll');
  if (catalog && !catalog.onscroll) {
    catalog.scrollTop = HostStudio.giftScroll;
    catalog.onscroll = () => { if (catalog.isConnected) HostStudio.giftScroll = catalog.scrollTop; };
  }
  if (sheet === HostStudio.mounted && sheet.contains(document.activeElement)) return;
  HostStudio.mounted = sheet;
  const focus = [...sheet.querySelectorAll('[data-hs-focus]')].find(node => node.dataset.hsFocus === HostStudio.focus && !node.disabled);
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
  window.ZimiBeauty?.compare?.(false);
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
