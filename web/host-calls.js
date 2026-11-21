/* The creator side of private calls: getting ready and going online, a second caller ringing
   while a call is in progress (decline or switch, never a busy signal), and the entry fee
   that unlocks once a call lasts the hold. The call screen itself is zrCall in live-room.js. */
/* preview: '' until the host asks to check their camera, then 'starting', 'ready' or 'failed'. */
const HostCalls = { status: null, loading: false, error: '', preview: '', previewError: '', previewRun: 0, visBusy: false, scene: '', sceneAt: 0, showTerms: false, rateDraft:null, rateBusy:false, rateError:'', rateRequest:0, rateSequence:0 };

/* Use an explicit route class instead of CSS :has(), which is unavailable in
   older Android System WebViews and otherwise collapses the setup to 0px. */
function hcAfterRender() {
  const screen = document.getElementById('screen');
  const active = !!screen && !!screen.querySelector('.hc-setup,.hc-waiting,.hc-summary');
  document.documentElement.classList.toggle('hc-active', active);
}

function hcIdentityAvatar(person, size = 104) {
  const name = String(person?.n || person?.name || 'Host').trim();
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => Array.from(part)[0]).join('').toUpperCase();
  const src = person ? avatarSource(person) : '';
  const hue = person === me ? 19 : (seedOf(person?.id || name) % 220) + 90;
  return `<span class="hc-identity-avatar" style="width:${size}px;height:${size}px;--hc-avatar-hue:${hue}"><b style="font-size:${Math.max(11, Math.round(size * .34))}px">${esc(initials)}</b>${src ? `<img src="${src}" alt="${esc(name)}" onerror="this.remove()">` : ''}</span>`;
}
/* One decoder per camera; landscape frames sit whole on a consistent solid stage. */
function hcStageVideo() {
  return '<video data-zimi-local autoplay muted playsinline></video>';
}

/* The same entrance timeline survives status acknowledgments and other redraws. */
function hcSceneStyle(scene) {
  if (HostCalls.scene !== scene) { HostCalls.scene = scene; HostCalls.sceneAt = Date.now(); }
  return `--hc-enter-age:-${Math.min(500, Math.max(0, Date.now() - HostCalls.sceneAt))}ms`;
}

function hcHold(seconds) {
  const s = Number(seconds) || 0;
  return s >= 60 && s % 60 === 0 ? `${s / 60} minute${s === 60 ? '' : 's'}` : `${s} seconds`;
}
/* The connected call's price, entry fee and today's early endings, as the server reports them. */
function hcCallTerms(d) {
  S.callRate = d.rate || 0; S.callFee = d.entryFee || 0; S.feeHold = d.feeHoldSeconds || 0;
  if (d.earlyEnds) { S.early = d.earlyEnds.today; S.earlyLimit = d.earlyEnds.limit; S.penaltyCoins = d.earlyEnds.penaltyCoins; }
}
function hcFeePending() { return !!S.callFee && !S.feeOk; }
/* This is the authenticated wallet balance, never a conversion of the member's
   call price or the local session timer. */
function hcEarningsValue() {
  const wallet = diamondOwnWallet();
  return !contentPending('wallet') && !ContentLoading.wallet.error && diamondReady(wallet)
    ? `${diamondIcon(14)} ${diamondFormat(Number.isSafeInteger(wallet.profileDiamondUnits) ? wallet.profileDiamondUnits : wallet.diamondUnits)}`
    : `${diamondIcon(14)} —`;
}

/* ---- Before going online ---- */
function hcShownRate(st = HostCalls.status) {
  if (!st) return 0;
  const draft = HostCalls.rateDraft;
  const raw = st.configurableRate && draft !== null && /^\d+$/.test(String(draft)) ? Number(draft) : Number(st.selectedRate ?? st.rate);
  return Number.isSafeInteger(raw) && raw >= 0 ? raw : 0;
}
function hcRateStops(st) {
  if (st.configurableRate) {
    const min = Number(st.minRate), max = Number(st.maxRate);
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max <= min) return [hcShownRate(st)];
    return [...new Set([min, Math.round(min + (max - min) / 3), Math.round(min + (max - min) * 2 / 3), max])];
  }
  const rates = (Array.isArray(st.tiers) ? st.tiers : []).map(tier => Number(tier.rate)).filter(rate => Number.isSafeInteger(rate) && rate >= 0);
  const current = hcShownRate(st);
  return [...new Set([...rates, current])].sort((a, b) => a - b);
}
function hcRatePercent(value, stops) {
  const min = stops[0] || 0, max = stops.at(-1) ?? min;
  return max > min ? Math.max(0, Math.min(100, (value - min) / (max - min) * 100)) : 0;
}
function hcPickRate(value) { hcDraftRate(String(value)); r(); }
function hcRateCard() {
  const st = HostCalls.status;
  if (HostCalls.error) return `<div class="hc-card hc-rate-card hc-status-error" role="alert"><span>${esc(HostCalls.error)}</span><button type="button" onclick="hcLoadStatus()">Retry call details</button></div>`;
  if (!st) return `<div class="hc-card hc-rate-card hc-rate-loading" role="status" aria-label="Loading your call price" aria-busy="true"><div>${skeletonLine('92px', 15)}${skeletonLine('74px', 20)}</div>${skeletonLine('100%', 6)}${skeletonLine('92%', 12)}</div>`;
  const tiers = Array.isArray(st.tiers) && st.tiers.length > 1 ? st.tiers : [], next = st.next, fee = st.entryFeeCoins;
  const rate = hcShownRate(st), stops = hcRateStops(st), percent = hcRatePercent(rate, stops);
  const selected = Number(st.selectedRate ?? st.rate) || 0;
  const dirty = st.configurableRate && Number.isSafeInteger(rate) && rate !== selected;
  const note = `Choose ${n(st.minRate)}–${n(st.maxRate)} member coins per minute. This applies to new calls. Confirmed earnings appear as Diamonds in Wallet.`;
  return `<div class="hc-card hc-rate-card">
    <div class="hc-rate-heading"><button type="button" class="hc-card-head" aria-label="Call price details" aria-expanded="${HostCalls.showTerms}" onclick="HostCalls.showTerms=!HostCalls.showTerms;r()"><span class="hc-rate-icon">${hi('rings', 14)}</span><span><b>Call rate</b><small>${st.rate ? `${n(st.rate * 60)} member coins/h` : 'Free calls'}${next ? ` ${n(Math.max(0, next.atCoins - st.earnedCoins))} member coins to next tier` : tiers.length ? ' Top tier unlocked' : ''}</small></span></button><div class="hc-rate-value"><strong>${n(rate)}</strong><span>coins/min</span>${st.configurableRate ? `<button type="button" class="hc-rate-save ${dirty || HostCalls.rateBusy ? '' : 'is-clean'}" aria-label="Save price" onclick="hcSaveRate()" ${HostCalls.rateBusy || DEMO ? 'disabled' : ''}>${HostCalls.rateBusy ? 'Saving…' : 'Save'}</button>` : ''}</div></div>
    <form class="hc-rate-picker" onsubmit="event.preventDefault();hcSaveRate()" style="--hc-rate-at:${percent}%">
      <div class="hc-rate-track" aria-hidden="true"><i></i><b></b>${stops.map(value => `<span style="--hc-stop-at:${hcRatePercent(value, stops)}%"></span>`).join('')}</div>
      ${st.configurableRate ? `<input id="hc-call-rate-slider" type="range" min="${st.minRate}" max="${st.maxRate}" step="1" value="${rate}" aria-label="Call rate, coins per minute" aria-valuetext="${n(rate)} coins per minute" oninput="hcDraftRate(this.value,this)" ${HostCalls.rateBusy ? 'disabled' : ''}><label class="hc-rate-manual" for="hc-call-rate">Member call price (coins/min)</label><input class="hc-rate-manual-input" id="hc-call-rate" type="number" inputmode="numeric" min="${st.minRate}" max="${st.maxRate}" step="1" value="${esc(HostCalls.rateDraft === null ? String(st.selectedRate) : HostCalls.rateDraft)}" tabindex="-1" oninput="hcDraftRate(this.value,this)" ${HostCalls.rateBusy ? 'disabled' : ''}>` : ''}
      <div class="hc-rate-labels" ${tiers.length ? 'role="list" aria-label="Member call price tiers"' : 'aria-label="Call rate choices"'}>${stops.map(value => st.configurableRate ? `<button type="button" class="${value === rate ? 'is-on' : ''}" style="--hc-stop-at:${hcRatePercent(value, stops)}%" aria-label="${n(value)} coins per minute" onclick="hcPickRate(${value})" ${HostCalls.rateBusy ? 'disabled' : ''}>${n(value)}</button>` : `<span role="listitem" class="${value === rate ? 'is-on' : ''}" style="--hc-stop-at:${hcRatePercent(value, stops)}%">${n(value)}</span>`).join('')}</div>
      ${st.configurableRate ? `<p class="hc-rate-note">${note}</p>` : ''}${HostCalls.rateError ? `<p class="hc-rate-error" role="alert">${esc(HostCalls.rateError)}</p>` : ''}
    </form>
    ${HostCalls.showTerms ? `<div class="hc-rate-details"><b>${st.rate ? `Member pays ${n(st.rate)} coins / min` : 'Free calls'}</b>${tiers.length ? `<span>Tier ${st.tier} of ${tiers.length}</span>` : ''}${next ? `<span>Another ${n(Math.max(0, next.atCoins - st.earnedCoins))} member coins unlocks a ${n(next.rate)}-coin/min member price.</span>` : ''}${fee ? `<span>Each caller also pays a <b>${n(fee)}-coin entry fee</b>. Your eligible share is credited in diamonds after the call passes ${hcHold(st.entryFeeHoldSeconds)}.</span>` : ''}<span>Your confirmed diamond earnings appear in Wallet.</span></div>` : ''}
  </div>`;
}
function hcVisibilityRow() {
  const on = S.callVis !== false;
  return `<button type="button" class="hc-toggle" role="switch" aria-label="Show my profile in Explore and stay available while on a call" aria-checked="${on}" onclick="hcToggleVisible()" ${HostCalls.visBusy ? 'disabled' : ''}>
    <span><b>Show in Explore</b><small>${on ? 'even while on a call' : 'hidden while on a call'}</small></span>
    <i class="hc-switch ${on ? 'is-on' : ''}" aria-hidden="true"></i></button>`;
}
function hcSetupView() {
  const cam = !!S.cam, p = HostCalls.preview;
  const status = !cam ? 'Camera is off'
    : p === 'ready' ? 'Camera ready' : p === 'starting' ? 'Starting camera…' : p === 'failed' ? HostCalls.previewError : '';
  /* The camera only starts when the host asks; opening this screen never captures anything. */
  const check = cam && (!p || p === 'failed') ? `<button type="button" class="hc-check" onclick="hcStartPreview()">${zi('camera', 17)}${p ? 'Try again' : 'Check camera'}</button>` : '';
  const rate = hcShownRate(), rateLabel = HostCalls.status ? (rate ? `${n(rate)}/min` : 'Free') : '';
  return `<section class="hc-setup hc-reference hc-preview ${cam && p === 'ready' ? '' : 'is-off'}" aria-label="Get ready to go online">
    <div class="hc-setup-scroll" data-lenis-prevent><header class="hc-setup-header">${backButton("go('home')")}<h1>Go live</h1><span aria-hidden="true"></span></header>
      ${hcRateCard()}
      <div class="hc-camera-card"><div class="hc-stage" aria-hidden="true">${hcStageVideo()}</div><i class="hc-guide" aria-hidden="true"></i>
        <button type="button" class="hc-filter-button" aria-label="Beauty and filters" onclick="hsOpenSheet('appearance')">${hi('tune', 17)}<span>Filters</span></button>
        <div class="hc-preview-tools"><button type="button" onclick="hcSetupMic()" aria-pressed="${!S.mic}" aria-label="${S.mic ? 'Mute microphone' : 'Unmute microphone'}">${hi(S.mic ? 'mic' : 'micoff', 18)}</button><button type="button" onclick="hcSetupCam()" aria-pressed="${!cam}" aria-label="${cam ? 'Turn camera off' : 'Turn camera on'}">${hi(cam ? 'vid' : 'camoff', 18)}</button></div>
        <div class="hc-camera-message" ${p === 'failed' ? 'role="alert"' : p === 'starting' ? 'role="status" aria-busy="true"' : ''}>${status && p ? `<b>${esc(status)}</b>` : ''}${!cam || p === 'starting' || p === 'failed' ? `<p>${!cam ? 'Callers will see your profile photo.' : p === 'starting' ? 'Allow camera and microphone access to see your preview.' : 'Check camera and microphone access, then try again.'}</p>` : ''}${check}</div>
      </div>
      <div class="hc-setup-cards">${hsCardButton()}${hcVisibilityRow()}</div>
    </div>
    <footer class="hc-setup-footer"><button type="button" class="hc-setup-tool hc-mission-tool" aria-label="Mission" onclick="hsOpenSheet('mission')">${hi('cup', 20)}<span>Missions</span>${DEMO ? '<b>3</b>' : ''}</button><button type="button" class="hc-setup-tool" aria-label="Gift target" onclick="hsOpenSheet('gift-target')">${hi('gift', 20)}<span>Gift target</span></button><button type="button" class="hc-primary" onclick="homeSetPresence(true)" aria-label="Go online for calls" aria-busy="${!!Home.presenceBusy}" ${Home.presenceBusy ? 'disabled' : ''}>${Home.presenceBusy ? 'Connecting…' : `Go online${rateLabel ? `<small>· ${rateLabel}</small>` : ''}`}</button></footer>${typeof hsSheet === 'function' ? hsSheet() : ''}</section>`;
}
function hcWaitingView() {
  return `<section class="hc-waiting" style="${hcSceneStyle('waiting')}" aria-label="Online and waiting for calls">
    <div class="hc-waiting-main"><div class="hc-host-avatar is-waiting">${hcIdentityAvatar(me, 104)}<i aria-hidden="true"></i><i aria-hidden="true"></i></div>
    <h1>You’re online</h1><p class="hc-waiting-status">Waiting for callers… ${S.vis ? 'you’re visible on Home.' : 'you’re hidden from Home.'}</p>
    <p class="hc-waiting-note">Members can call your profile at any time. Stay in the app to answer their calls.</p>
    <div class="hc-waiting-actions"><button type="button" class="hc-primary" onclick="go('home')">Browse the app</button>
    <button type="button" class="hc-offline" onclick="homeSetPresence(false)" ${Home.presenceBusy ? 'disabled' : ''}>${Home.presenceBusy ? 'Going offline…' : 'Go offline'}</button></div></div>
    </section>`;
}
function hcLoadStatus() {
  if (HostCalls.loading || !isApprovedHost()) return;
  HostCalls.loading = true; HostCalls.error = '';
  Native.send('host.callStatus.load', {}); r();
}
function hcDraftRate(value,source){
 if(HostCalls.rateBusy)return;HostCalls.rateDraft=String(value);HostCalls.rateError='';
 const st=HostCalls.status,number=/^\d+$/.test(HostCalls.rateDraft)?Number(HostCalls.rateDraft):NaN,dirty=Number.isSafeInteger(number)&&number!==Number(st?.selectedRate??st?.rate);
 const card=source?.closest?.('.hc-rate-card')||document.querySelector('.hc-rate-card');
 card?.querySelector('.hc-rate-save')?.classList.toggle('is-clean',!dirty);
 card?.querySelector('.hc-rate-error')?.remove();
 if(!st?.configurableRate||!Number.isSafeInteger(number)||number<st.minRate||number>st.maxRate)return;
 const stops=hcRateStops(st),picker=card?.querySelector('.hc-rate-picker'),slider=card?.querySelector('#hc-call-rate-slider'),manual=card?.querySelector('#hc-call-rate');
 picker?.style.setProperty('--hc-rate-at',`${hcRatePercent(number,stops)}%`);
 const shown=card?.querySelector('.hc-rate-value strong');if(shown)shown.textContent=n(number);
 if(slider){if(slider!==source)slider.value=String(number);slider.setAttribute('aria-valuetext',`${n(number)} coins per minute`)}
 if(manual&&manual!==source)manual.value=String(number);
 card?.querySelectorAll('.hc-rate-labels>[style]').forEach(label=>label.classList.toggle('is-on',Number(label.textContent.replaceAll(',',''))===number));
 const footerRate=document.querySelector('.hc-setup-footer .hc-primary small');if(footerRate)footerRate.textContent=`\u00b7 ${number?n(number)+'/min':'Free'}`;
}
function hcSaveRate(){
 const h=HostCalls,st=h.status;if(DEMO||S.v!=='setup'||h.rateBusy||!isApprovedHost()||!st?.configurableRate)return;
 const raw=h.rateDraft===null?String(st.selectedRate):h.rateDraft,value=/^\d+$/.test(raw)?Number(raw):NaN;
 if(!Number.isSafeInteger(value)||value<st.minRate||value>st.maxRate){h.rateError=`Choose a whole number from ${n(st.minRate)} to ${n(st.maxRate)}.`;r();return}
 h.rateBusy=true;h.rateError='';h.rateRequest=++h.rateSequence;Native.send('host.callRate.save',{rateCoinsPerMinute:value,requestId:h.rateRequest});r();
}
function hcStartPreview() {
  if (!S.cam || S.v !== 'setup' || HostCalls.preview === 'starting') return;
  const run = ++HostCalls.previewRun, current = () => S.v === 'setup' && run === HostCalls.previewRun;
  HostCalls.preview = 'starting'; r();
  Promise.resolve().then(() => window.ZimiMedia.prepare(true)).then(() => {
    if (!current()) return;
    HostCalls.preview = 'ready'; r();
  }).catch(error => {
    if (!current()) return;
    HostCalls.preview = 'failed'; HostCalls.previewError = error.message; r();
  });
}
function hcSetupMic() { S.mic = S.mic ? 0 : 1; window.ZimiMedia?.attach(); r(); }
/* Turning the camera off only pauses the preview's video track, so turning it back on resumes it. */
function hcSetupCam() { S.cam = S.cam ? 0 : 1; window.ZimiMedia?.attach(); r(); }
function hcToggleVisible() {
  if (DEMO) { S.callVis = S.callVis === false; r(); return; }
  if (HostCalls.visBusy) return;
  HostCalls.visBusy = true; Native.send('presence.duringCalls', { on: S.callVis === false }); r();
}

/* ---- During a call ---- */
function hcVisPill() {
  const on = S.callVis !== false;
  return `<button type="button" class="zr-pill hc-vis ${on ? 'is-on' : ''}" onclick="hcToggleVisible()" aria-pressed="${on}" aria-label="${on ? 'Available on Home during calls, tap to hide' : 'Hidden from Home during calls, tap to show'}" ${HostCalls.visBusy ? 'disabled' : ''}>${hi(on ? 'eye' : 'eyeoff', 13)}${on ? 'Visible' : 'Hidden'}</button>`;
}
function hcFeeChip() { return S.callFee && feeShown() ? `<div class="hc-fee ${S.feeOk ? 'ok' : ''}" id="fee" role="status">${feeChip()}</div>` : ''; }
function hcIncoming() {
  const c = S.inc, name = esc(c.n);
  return `<aside class="hc-incoming" role="alertdialog" aria-label="Incoming call from ${name}">${hcIdentityAvatar(c, 42)}
    <div><strong>${name}</strong><span>is calling you${c.lvl ? ` · Lv ${esc(c.lvl)}` : ''} · ${c.voice ? 'Voice' : 'Video'}</span></div>
    <button class="hc-decline" onclick="declineInc()" aria-label="Decline ${name}">${hi('ph', 19)}</button>
    <button class="hc-accept" onclick="hostEnd('switch')" aria-label="Switch to ${name}">${hi(c.voice ? 'ph' : 'vid', 19)}</button></aside>`;
}
function hcConfirm() {
  const k = S.confirm, left = Math.max(0, (S.feeHold || 0) - (S.sec - S.cstart)), nth = (S.early || 0) + 1;
  const limit = S.earlyLimit ?? EARLY_LIMIT, penalty = S.penaltyCoins || 0, verb = k === 'switch' ? 'switch' : 'end';
  const warn = !penalty ? `This would be early ending ${nth} today.`
    : `This would be early ending ${nth} today. Past ${n(limit)} a day, early endings can reduce your diamond earnings. Check Wallet for the confirmed adjustment.`;
  const title = `${k === 'switch' ? 'Switch calls' : 'End call'} before ${hcHold(S.feeHold)}?`;
  return `<div class="zr-sheet-backdrop" onclick="if(event.target===this){S.confirm=0;r()}"><section class="zr-sheet hc-confirm" role="dialog" aria-modal="true" aria-label="${title}" data-lenis-prevent>
    <span class="hc-confirm-icon" aria-hidden="true">${hi('clock', 22)}</span><h2>${title}</h2>
    <p class="zr-sheet-note">${esc(first(S.caller.n))}’s ${n(S.callFee)}-coin entry fee unlocks in <b id="hc-left">${clock(left)}</b>. If you ${verb} now, its host share will not be credited in diamonds.</p>
    <p class="hc-warn">${warn}</p>
    <button class="zr-wide hc-keep" onclick="S.confirm=0;r()">Keep talking</button>
    <button class="zr-wide zr-danger hc-anyway" onclick="S.confirm=0;${k === 'switch' ? 'acceptInc()' : 'endCall()'}">${k === 'switch' ? 'Switch anyway' : 'End call anyway'}</button></section></div>`;
}
function hcConnecting() {
  const { from, to } = S.connecting;
  return `<div class="hc-connecting" role="status" aria-live="polite"><div class="hc-orb">${zrAvatar(to, 96)}<i aria-hidden="true"></i></div>
    <small>CONNECTING</small><h2>Connecting to ${esc(to.n)}</h2>
    <p>Your call with ${esc(first(from.n))} has ended. Your camera and microphone stay on.</p><span class="hc-bar" aria-hidden="true"><i></i></span></div>`;
}
function hcCallExtras() { return `${S.inc ? hcIncoming() : ''}${S.confirm ? hcConfirm() : ''}${S.connecting ? hcConnecting() : ''}`; }
/* The second caller hung up, or the switch failed: stay with the current call when it is still there. */
function hcSwitchFailed(message) {
  const c = S.connecting; if (!c) return;
  S.connecting = null;
  if (c.log) { S.feeLog.splice(S.feeLog.indexOf(c.log), 1); if (c.log.early) S.early = Math.max(0, (S.early || 0) - 1); }
  addMissed(c.to); S.rmsgs.push(['sys', '', message]);
  if (c.fromEnded) { S.callEnd = null; endCall(true); return; }
  window.ZimiMedia?.handoff(null); r();
}

/* ---- After the session ---- */
function hcSummaryView(s) {
  const fees = (s.fees || []).filter(f => f.fee);
  return `<section class="hc-summary" style="${hcSceneStyle('summary')}"><div class="hc-summary-content"><div class="hc-host-avatar">${hcIdentityAvatar(me, 80)}<span class="hc-summary-badge" aria-hidden="true">🏆</span></div>
    <h1>A moment well shared.</h1>
    <p>You spent <b>${fmtDur(s.sec || 0)}</b> on calls. Confirmed earnings appear in your diamond wallet.</p>
    <div class="hc-session-stats"><div><span>Diamond balance</span><b>${hcEarningsValue()}</b></div><div><span>Gifts</span><b>${n(s.gifts || 0)}</b></div><div><span>${s.callers === 1 ? 'Caller' : 'Callers'}</span><b>${n(s.callers || 1)}</b></div></div>
    ${fees.length ? `<div class="hc-fees"><div class="hc-fees-head"><span>Member entry fees</span></div>
      ${fees.map(f => `<div class="hc-fee-row ${f.ok ? 'is-ok' : ''}">${hi(f.ok ? 'check' : 'clock', 14)}<span>${esc(first(f.n))}</span><em>${f.ok ? `${n(f.fee)} member coins · hold completed` : 'Ended early · no host share'}</em></div>`).join('')}
      ${fees.some(f => f.early) ? `<p class="hc-warn">Early endings today: <b>${n(s.early || 0)}</b>.${s.penaltyCoins ? ` Past ${n(s.earlyLimit)} a day, early endings can reduce diamond earnings. Check Wallet for confirmed adjustments.` : ''}</p>` : ''}</div>` : ''}
    <button type="button" class="hc-primary" onclick="S.callId=null;go('setup')">${hi('vid', 18)} Set targets &amp; continue</button>
    <div class="hc-summary-actions"><button type="button" onclick="S.callId=null;go('wallet')">${hi('wal', 17)} Wallet</button><button type="button" onclick="S.callId=null;go('home');homeLoad()">${hi('house', 17)} Home</button></div>
    ${window.ZimiAds?.card('call_summary') || ''}</div></section>`;
}

document.addEventListener('aurora:navigate', () => {
  if (S.v !== HostCalls.scene) HostCalls.scene = '';
  /* media.js releases the camera on every navigation outside a call, so the preview starts over. */
  if (HostCalls.preview) { HostCalls.previewRun++; HostCalls.preview = ''; if (S.v === 'setup') r(); }
  if (!['setup', 'waiting'].includes(S.v) || DEMO || !isApprovedHost()) return;
  hcLoadStatus();
});
Native.on('host.callStatus', d => {
  if(HostCalls.rateBusy)return;
  HostCalls.loading = false; HostCalls.error = ''; HostCalls.status = d; S.callVis = d.visibleDuringCalls !== false;
  if (S.v !== 'hcall') { S.early = d.earlyEnds.today; S.earlyLimit = d.earlyEnds.limit; S.penaltyCoins = d.earlyEnds.penaltyCoins; }
  if (['setup', 'waiting'].includes(S.v)) r();
});
Native.on('host.access',d=>{if(!d.checking&&!d.approved){const h=HostCalls;h.loading=false;h.rateBusy=false;h.rateDraft=null;h.rateError='';h.rateRequest=++h.rateSequence}});
Native.on('host.callRate.saved',d=>{const h=HostCalls;if(!h.rateBusy||d.requestId!==h.rateRequest||!isApprovedHost())return;h.rateBusy=false;h.rateDraft=null;h.rateError='';h.status=d.status;if(S.v==='setup')r()});
Native.on('host.callRate.error',d=>{const h=HostCalls;if(!h.rateBusy||d.requestId!==h.rateRequest)return;h.rateBusy=false;h.rateError=d.message||'Your call price could not be saved. Refresh and try again.';if(S.v==='setup')r()});
Native.on('presence.duringCalls.saved', d => {
  HostCalls.visBusy = false; S.callVis = !!d.on;
  if (HostCalls.status) HostCalls.status.visibleDuringCalls = !!d.on;
  if (['setup', 'waiting', 'hcall'].includes(S.v)) r();
});
Native.on('wallet.balance', () => { if (S.v === 'summary' && S.sum?.k === 'host') r(); });
Native.on('data.loading', d => { if (d.resource === 'wallet' && S.v === 'summary' && S.sum?.k === 'host') r(); });
Native.on('operation.error', d => {
  if (d.action === 'host.callStatus.load') {
    HostCalls.loading = false; HostCalls.error = d.message || 'Your call details could not be loaded.';
    if (['setup', 'waiting'].includes(S.v)) r();
  }
  if (d.action === 'presence.duringCalls') {
    HostCalls.visBusy = false; appNotice(d.message || 'Your call visibility could not be saved. Try again.');
    if (['setup', 'waiting', 'hcall'].includes(S.v)) r();
  }
});
['session.none', 'session.expired'].forEach(type => Native.on(type, () => Object.assign(HostCalls, { status: null, loading: false, error: '', preview: '', previewError: '', previewRun: HostCalls.previewRun + 1, visBusy: false, rateDraft:null,rateBusy:false,rateError:'',rateRequest:++HostCalls.rateSequence })));

if (DEMO) HostCalls.status = { rate: MY_RATE, tier: 1, earnedCoins: 0, next: null, tiers: [], entryFeeCoins: MY_FEE, entryFeeHoldSeconds: FEE_HOLD, earlyEnds: { today: 0, limit: EARLY_LIMIT, penaltyCoins: MY_FEE }, visibleDuringCalls: true };

/* Preview fixture only (?role=host&approvedHost=1&preview=host-call): a creator mid-call,
   and a second caller rings a few seconds later. */
if (DEMO && previewMode === 'host-call' && isApprovedHost()) {
  S.loggedIn = 1; Home.mediaStatus = 'Design preview';
  setTimeout(() => {
    S.caller = { ...nextCaller(), callId: 'preview-host-call' }; S.callId = S.caller.callId; go('hcall');
    setTimeout(() => { if (S.v === 'hcall' && !S.inc && !S.connecting) ringIncoming({ ...nextCaller(), callId: 'preview-waiting-call' }); }, 6000);
  });
}
