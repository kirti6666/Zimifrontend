/* The creator side of private calls: getting ready and going online, a second caller ringing
   while a call is in progress (decline or switch, never a busy signal), and the entry fee
   that unlocks once a call lasts the hold. The call screen itself is zrCall in live-room.js. */
/* preview: '' until the host asks to check their camera, then 'starting', 'ready' or 'failed'. */
const HostCalls = { status: null, loading: false, error: '', preview: '', previewError: '', previewRun: 0, visBusy: false, scene: '', sceneAt: 0, showTerms: false };

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

/* ---- Before going online ---- */
function hcRateCard() {
  const st = HostCalls.status;
  if (HostCalls.error) return `<div class="hc-card hc-status-error" role="alert"><span>${esc(HostCalls.error)}</span><button type="button" onclick="hcLoadStatus()">Retry call details</button></div>`;
  if (!st) return `<div class="hc-card" role="status" aria-label="Loading your call price" aria-busy="true">${skeletonLine('55%', 15)}${skeletonLine('85%', 11)}<div class="hc-tiers" aria-hidden="true">${skeletonLine('25%', 24)}${skeletonLine('25%', 24)}${skeletonLine('25%', 24)}</div></div>`;
  const tiers = st.tiers.length > 1 ? st.tiers : [], next = st.next, fee = st.entryFeeCoins;
  return `<div class="hc-card">
    <button type="button" class="hc-card-head" aria-label="Call price details" aria-expanded="${HostCalls.showTerms}" onclick="HostCalls.showTerms=!HostCalls.showTerms;r()"><b>${st.rate ? `${n(st.rate * 60)}/h` : 'Free calls'}</b>${next ? `<small>${n(Math.max(0, next.atCoins - st.earnedCoins))} left to upgrade</small>` : tiers.length ? '<small>Top tier unlocked</small>' : '<small>Your call rate</small>'}</button>
    ${tiers.length ? `<div class="hc-tiers" role="list" aria-label="Call price tiers">${tiers.map(t => `<span role="listitem" class="${t.tier === st.tier ? 'is-on' : t.tier < st.tier ? 'is-done' : ''}">${n(t.rate * 60)}/h</span>`).join('')}</div>` : ''}
    ${HostCalls.showTerms ? `<div class="hc-rate-details"><b>${st.rate ? `${n(st.rate)} coins / min` : 'Free calls'}</b>${tiers.length ? `<span>Tier ${st.tier} of ${tiers.length}</span>` : ''}${next ? `<span>Earn ${n(Math.max(0, next.atCoins - st.earnedCoins))} more coins to unlock ${n(next.rate)}/min</span>` : ''}${fee ? `<span>Each caller also pays a <b>${n(fee)}-coin entry fee</b>. It is yours once the call passes ${hcHold(st.entryFeeHoldSeconds)}.</span>` : ''}</div>` : ''}
  </div>`;
}
function hcVisibilityRow() {
  const on = S.callVis !== false;
  return `<button type="button" class="hc-toggle" role="switch" aria-checked="${on}" onclick="hcToggleVisible()" ${HostCalls.visBusy ? 'disabled' : ''}>
    <span><b>Online on Home during calls</b><small>${on ? 'Others can still find you and call while you’re on a call.' : 'You’re hidden from Home while you’re on a call.'}</small></span>
    <i class="hc-switch ${on ? 'is-on' : ''}" aria-hidden="true"></i></button>`;
}
function hcSetupView() {
  const cam = !!S.cam, p = HostCalls.preview;
  const status = !cam ? 'Camera is off'
    : p === 'ready' ? 'Camera ready' : p === 'starting' ? 'Starting camera…' : p === 'failed' ? HostCalls.previewError : '';
  /* The camera only starts when the host asks; opening this screen never captures anything. */
  const check = cam && (!p || p === 'failed') ? `<button type="button" class="hc-check" onclick="hcStartPreview()">${hi('vid', 15)}${p ? 'Try again' : 'Check camera'}</button>` : '';
  return `<section class="hc-setup hc-preview ${cam && p === 'ready' ? '' : 'is-off'}" aria-label="Get ready to go online">
    <div class="hc-stage" aria-hidden="true">${hcStageVideo()}</div><div class="hc-stage-shade" aria-hidden="true"></div>
    <header class="hc-setup-header">${backButton("go('home')")}<div class="hc-preview-tools">
        <button type="button" onclick="hcSetupMic()" aria-pressed="${!S.mic}" aria-label="${S.mic ? 'Mute microphone' : 'Unmute microphone'}">${hi(S.mic ? 'mic' : 'micoff', 18)}</button>
        <button type="button" onclick="hcSetupCam()" aria-pressed="${!cam}" aria-label="${cam ? 'Turn camera off' : 'Turn camera on'}">${hi(cam ? 'vid' : 'camoff', 18)}</button>
      </div></header>
    <div class="hc-setup-panels">${hcRateCard()}${hcVisibilityRow()}${hsCardButton()}</div>
    <div class="hc-camera-space"><i class="hc-guide" aria-hidden="true"></i>
      <div class="hc-camera-message" ${p === 'failed' ? 'role="alert"' : p === 'starting' ? 'role="status" aria-busy="true"' : ''}>
        ${status ? `<b>${esc(status)}</b>` : ''}
        ${!cam || p === 'starting' || p === 'failed' ? `<p>${!cam ? 'Callers will see your profile photo.' : p === 'starting' ? 'Allow camera and microphone access to see your preview.' : 'Check camera and microphone access, then try again.'}</p>` : ''}${check}
      </div></div>
    <p class="hc-camera-hint">Keep centred, head and shoulders in frame</p>
    <footer class="hc-setup-footer"><button type="button" class="hc-setup-tool" aria-label="Beauty and filters" onclick="hsOpenSheet('appearance')">${hi('star', 19)}</button>
      <button type="button" class="hc-primary" onclick="homeSetPresence(true)" aria-label="Go online for calls" aria-busy="${!!Home.presenceBusy}" ${Home.presenceBusy ? 'disabled' : ''}>${Home.presenceBusy ? 'Connecting…' : 'Go online'}</button>
      <button type="button" class="hc-setup-tool" aria-label="Mission" onclick="hsOpenSheet('mission')">${hi('cup', 19)}</button>
      <button type="button" class="hc-setup-tool" aria-label="Gift target" onclick="hsOpenSheet('gift-target')">${hi('gift', 19)}</button></footer>${typeof hsSheet === 'function' ? hsSheet() : ''}</section>`;
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
    : nth > limit ? `This would be early ending ${nth} today. Past ${n(limit)} a day, it takes ${n(penalty)} coins from your earnings.`
    : `This would be early ending ${nth} today. Past ${n(limit)} a day, each one takes ${n(penalty)} coins from your earnings.`;
  const title = `${k === 'switch' ? 'Switch calls' : 'End call'} before ${hcHold(S.feeHold)}?`;
  return `<div class="zr-sheet-backdrop" onclick="if(event.target===this){S.confirm=0;r()}"><section class="zr-sheet hc-confirm" role="dialog" aria-modal="true" aria-label="${title}" data-lenis-prevent>
    <span class="hc-confirm-icon" aria-hidden="true">${hi('clock', 22)}</span><h2>${title}</h2>
    <p class="zr-sheet-note">${esc(first(S.caller.n))}’s ${n(S.callFee)}-coin entry fee unlocks in <b id="hc-left">${clock(left)}</b>. If you ${verb} now, you won’t receive it and it stays with BinzoLive.</p>
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
  const fees = (s.fees || []).filter(f => f.fee), received = fees.filter(f => f.ok).reduce((sum, f) => sum + f.fee, 0);
  return `<section class="hc-summary" style="${hcSceneStyle('summary')}"><div class="hc-summary-content"><div class="hc-host-avatar">${hcIdentityAvatar(me, 80)}<span class="hc-summary-badge" aria-hidden="true">🏆</span></div>
    <h1>${s.earned ? 'Congratulations!' : 'A moment well shared.'}</h1>
    <p>${s.earned ? `You earned about <b>${n(s.earned)} coins</b> in this session and completed <b>${fmtDur(s.sec || 0)}</b> on calls.` : `You spent <b>${fmtDur(s.sec || 0)}</b> on calls.`}</p>
    <div class="hc-session-stats"><div><span>Earned</span><b>${coinIcon(16)} ≈ ${n(s.earned || 0)}</b></div><div><span>Gifts</span><b>${n(s.gifts || 0)}</b></div><div><span>${s.callers === 1 ? 'Caller' : 'Callers'}</span><b>${n(s.callers || 1)}</b></div></div>
    ${fees.length ? `<div class="hc-fees"><div class="hc-fees-head"><span>Entry fees</span><b>${coinIcon(14)} +${n(received)}</b></div>
      ${fees.map(f => `<div class="hc-fee-row ${f.ok ? 'is-ok' : ''}">${hi(f.ok ? 'check' : 'clock', 14)}<span>${esc(first(f.n))}</span><em>${f.ok ? `+${n(f.fee)} received` : 'Ended early · kept by BinzoLive'}</em></div>`).join('')}
      ${fees.some(f => f.early) ? `<p class="hc-warn">Early endings today: <b>${n(s.early || 0)}</b>.${s.penaltyCoins ? ` Past ${n(s.earlyLimit)} a day, each one takes ${n(s.penaltyCoins)} coins from your earnings.` : ''}</p>` : ''}</div>` : ''}
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
  HostCalls.loading = false; HostCalls.error = ''; HostCalls.status = d; S.callVis = d.visibleDuringCalls !== false;
  if (S.v !== 'hcall') { S.early = d.earlyEnds.today; S.earlyLimit = d.earlyEnds.limit; S.penaltyCoins = d.earlyEnds.penaltyCoins; }
  if (['setup', 'waiting'].includes(S.v)) r();
});
Native.on('presence.duringCalls.saved', d => {
  HostCalls.visBusy = false; S.callVis = !!d.on;
  if (HostCalls.status) HostCalls.status.visibleDuringCalls = !!d.on;
  if (['setup', 'waiting', 'hcall'].includes(S.v)) r();
});
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
['session.none', 'session.expired'].forEach(type => Native.on(type, () => Object.assign(HostCalls, { status: null, loading: false, error: '', preview: '', previewError: '', previewRun: HostCalls.previewRun + 1, visBusy: false })));

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
