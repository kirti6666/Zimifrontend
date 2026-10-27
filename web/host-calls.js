/* The creator side of private calls: getting ready and going online, a second caller ringing
   while a call is in progress (decline or switch, never a busy signal), and the entry fee
   that unlocks once a call lasts the hold. The call screen itself is zrCall in live-room.js. */
/* preview: '' until the host asks to check their camera, then 'starting', 'ready' or 'failed'. */
const HostCalls = { status: null, loading: false, preview: '', previewError: '', previewRun: 0, visBusy: false };

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
  if (!st) return `<div class="hc-card" role="status" aria-label="Loading your call price" aria-busy="true">${skeletonLine('55%', 15)}${skeletonLine('85%', 11)}</div>`;
  const tiers = st.tiers.length > 1 ? st.tiers : [], next = st.next, fee = st.entryFeeCoins;
  return `<div class="hc-card">
    <div class="hc-card-head"><span>${coinIcon(16)} <b>${st.rate ? `${n(st.rate)} coins / min` : 'Free calls'}</b></span>${tiers.length ? `<small>Tier ${st.tier} of ${tiers.length}</small>` : ''}</div>
    ${tiers.length ? `<div class="hc-tiers" role="list" aria-label="Call price tiers">${tiers.map(t => `<span role="listitem" class="${t.tier === st.tier ? 'is-on' : t.tier < st.tier ? 'is-done' : ''}">${n(t.rate)}/min</span>`).join('')}</div>` : ''}
    ${next ? `<small class="hc-next">Earn ${n(Math.max(0, next.atCoins - st.earnedCoins))} more coins to unlock ${n(next.rate)}/min</small>` : tiers.length ? '<small class="hc-next">You have reached the top call price</small>' : ''}
    ${fee ? `<div class="hc-fee-line">${hi('clock', 15)}<span>Each caller also pays a <b>${n(fee)}-coin entry fee</b>. It is yours once the call passes ${hcHold(st.entryFeeHoldSeconds)}.</span></div>` : ''}
  </div>`;
}
function hcVisibilityRow() {
  const on = S.callVis !== false;
  return `<button type="button" class="hc-toggle" role="switch" aria-checked="${on}" onclick="hcToggleVisible()" ${HostCalls.visBusy ? 'disabled' : ''}>
    <span><b>Available on Home during calls</b><small>${on ? 'Members can still find you and call while you’re talking. New calls ring as a banner on your call.' : 'While you’re on a call, members see you as unavailable.'}</small></span>
    <i class="hc-switch ${on ? 'is-on' : ''}" aria-hidden="true"></i></button>`;
}
function hcSetupView() {
  const cam = !!S.cam, p = HostCalls.preview;
  const status = !cam ? 'Camera is off · callers see your profile photo'
    : p === 'ready' ? 'Camera ready' : p === 'starting' ? 'Starting camera…' : p === 'failed' ? HostCalls.previewError : 'See how you look before callers do';
  /* The camera only starts when the host asks; opening this screen never captures anything. */
  const check = cam && (!p || p === 'failed') ? `<button type="button" class="hc-check" onclick="hcStartPreview()">${hi('vid', 15)}${p ? 'Try again' : 'Check camera'}</button>` : '';
  return `<section class="zh-broadcast hc-setup"><span class="zh-eyebrow">LET’S TALK</span><h1>Be someone’s favourite conversation.</h1>
    <p>Check your camera, then go online. Members call you for private one-to-one video and voice calls.</p>
    <div class="zh-camera-preview hc-preview ${cam && p === 'ready' ? '' : 'is-off'}"><video data-zimi-local autoplay muted playsinline></video>
      <span>${hi(cam ? 'vid' : 'camoff', 38)}<b>${esc(status)}</b>${check}</span><i class="hc-guide" aria-hidden="true"></i>
      <div class="hc-preview-tools">
        <button type="button" onclick="hcSetupMic()" aria-pressed="${!S.mic}" aria-label="${S.mic ? 'Mute microphone' : 'Unmute microphone'}">${hi(S.mic ? 'mic' : 'micoff', 18)}</button>
        <button type="button" onclick="hcSetupCam()" aria-pressed="${!cam}" aria-label="${cam ? 'Turn camera off' : 'Turn camera on'}">${hi(cam ? 'flip' : 'camoff', 18)}</button>
      </div></div>
    ${hcRateCard()}${hcVisibilityRow()}
    <button class="zh-primary zh-full" onclick="homeSetPresence(true)" ${Home.presenceBusy ? 'disabled' : ''}>${Home.presenceBusy ? 'Connecting…' : 'Go online for calls'}</button>
    <p class="hc-note">A call that comes in while you are talking rings as a banner, and you choose whether to switch. Nobody is told you are busy.</p></section>`;
}
function hcWaitingView() {
  return `<section class="zh-broadcast hc-waiting"><span class="zh-eyebrow">OPEN TO CONNECTIONS</span><h1>You’re online.</h1>
    <p>Members can discover you and start a call while you’re available. Incoming calls ring wherever you are in the app.</p>
    <div class="zh-ready-illustration">${hi('ph', 52)}</div>${hcRateCard()}${hcVisibilityRow()}
    <button class="zh-primary zh-full" onclick="go('home')">Explore BinzoLive</button>
    <button class="zh-soft zh-full" onclick="homeSetPresence(false)" ${Home.presenceBusy ? 'disabled' : ''}>Go offline</button>
    <p class="zh-coins-note">Keep the app connected to receive incoming calls.</p></section>`;
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
  return `<aside class="hc-incoming" role="alertdialog" aria-label="Incoming call from ${name}">${zrAvatar(c, 42)}
    <div><strong>${name}</strong><span>is calling you${c.lvl ? ` · Lv ${esc(c.lvl)}` : ''} · ${c.voice ? 'Voice' : 'Video'}</span></div>
    <button class="hc-decline" onclick="declineInc()" aria-label="Decline ${name}">${hi('close', 19)}</button>
    <button class="hc-accept" onclick="hostEnd('switch')" aria-label="Switch to ${name}">${hi(c.voice ? 'ph' : 'vid', 18)}<span>Switch</span></button></aside>`;
}
function hcConfirm() {
  const k = S.confirm, left = Math.max(0, (S.feeHold || 0) - (S.sec - S.cstart)), nth = (S.early || 0) + 1;
  const limit = S.earlyLimit ?? EARLY_LIMIT, penalty = S.penaltyCoins || 0, verb = k === 'switch' ? 'switch' : 'end';
  const warn = !penalty ? `This would be early ending ${nth} today.`
    : nth > limit ? `This would be early ending ${nth} today. Past ${n(limit)} a day, it takes ${n(penalty)} coins from your earnings.`
    : `This would be early ending ${nth} today. Past ${n(limit)} a day, each one takes ${n(penalty)} coins from your earnings.`;
  return `<div class="zr-sheet-backdrop" onclick="if(event.target===this){S.confirm=0;r()}"><section class="zr-sheet hc-confirm" role="dialog" aria-modal="true" aria-label="${k === 'switch' ? 'Switch calls early?' : 'End call early?'}" data-lenis-prevent>
    <div class="zr-sheet-handle"></div><header><h2>${k === 'switch' ? 'Switch before the entry fee unlocks?' : 'End before the entry fee unlocks?'}</h2>${zrRound('close', 'Keep talking', 'S.confirm=0;r()')}</header>
    <p class="zr-sheet-note">${esc(first(S.caller.n))}’s ${n(S.callFee)}-coin entry fee unlocks in <b id="hc-left">${clock(left)}</b>. If you ${verb} now, you won’t receive it and it stays with BinzoLive.</p>
    <p class="hc-warn">${warn}</p>
    <button class="zr-wide zr-secondary" onclick="S.confirm=0;r()">Keep talking</button>
    <button class="zr-wide zr-danger" onclick="S.confirm=0;${k === 'switch' ? 'acceptInc()' : 'endCall()'}">${k === 'switch' ? 'Switch anyway' : 'End call anyway'}</button></section></div>`;
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
  return `<section class="zh-broadcast zh-summary hc-summary"><div class="zh-ready-illustration">${hi('cup', 42)}</div>
    <h1>${s.earned ? 'Congratulations!' : 'A moment well shared.'}</h1>
    <p>${s.earned ? `You earned about <b>${n(s.earned)} coins</b> in ${fmtDur(s.sec || 0)} on calls.` : `You spent ${fmtDur(s.sec || 0)} on calls.`}</p>
    <div class="zh-precall-details"><span>Duration <b>${clock(s.sec || 0)}</b></span><span>${s.callers === 1 ? 'Caller' : 'Callers'} <b>${n(s.callers || 1)}</b></span><span>Gifts <b>${n(s.gifts || 0)}</b></span><span>Coins earned <b>≈ ${n(s.earned || 0)}</b></span></div>
    ${fees.length ? `<div class="hc-fees"><div class="hc-fees-head"><span>Entry fees</span><b>${coinIcon(14)} +${n(received)}</b></div>
      ${fees.map(f => `<div class="hc-fee-row ${f.ok ? 'is-ok' : ''}">${hi(f.ok ? 'check' : 'clock', 14)}<span>${esc(first(f.n))}</span><em>${f.ok ? `+${n(f.fee)} received` : 'Ended early · kept by BinzoLive'}</em></div>`).join('')}
      ${fees.some(f => f.early) ? `<p class="hc-warn">Early endings today: <b>${n(s.early || 0)}</b>.${s.penaltyCoins ? ` Past ${n(s.earlyLimit)} a day, each one takes ${n(s.penaltyCoins)} coins from your earnings.` : ''}</p>` : ''}</div>` : ''}
    <button class="zh-primary zh-full" onclick="S.callId=null;go(S.online?'waiting':'setup')">${S.online ? 'Back to taking calls' : 'Go online again'}</button>
    <button class="zh-soft zh-full" onclick="S.callId=null;go('home');homeLoad()">Back to Home</button>
    <button class="zh-soft zh-full" onclick="go('calls')">Call history</button>${window.ZimiAds?.card('call_summary') || ''}</section>`;
}

document.addEventListener('aurora:navigate', () => {
  /* media.js releases the camera on every navigation outside a call, so the preview starts over. */
  if (HostCalls.preview) { HostCalls.previewRun++; HostCalls.preview = ''; if (S.v === 'setup') r(); }
  if (!['setup', 'waiting'].includes(S.v) || DEMO || !isApprovedHost()) return;
  if (!HostCalls.loading) { HostCalls.loading = true; Native.send('host.callStatus.load', {}); }
});
Native.on('host.callStatus', d => {
  HostCalls.loading = false; HostCalls.status = d; S.callVis = d.visibleDuringCalls !== false;
  if (S.v !== 'hcall') { S.early = d.earlyEnds.today; S.earlyLimit = d.earlyEnds.limit; S.penaltyCoins = d.earlyEnds.penaltyCoins; }
  if (['setup', 'waiting'].includes(S.v)) r();
});
Native.on('presence.duringCalls.saved', d => {
  HostCalls.visBusy = false; S.callVis = !!d.on;
  if (HostCalls.status) HostCalls.status.visibleDuringCalls = !!d.on;
  if (['setup', 'waiting', 'hcall'].includes(S.v)) r();
});
Native.on('operation.error', d => {
  if (d.action === 'host.callStatus.load') HostCalls.loading = false;
  if (d.action === 'presence.duringCalls') {
    HostCalls.visBusy = false; appNotice(d.message || 'Your call visibility could not be saved. Try again.');
    if (['setup', 'waiting', 'hcall'].includes(S.v)) r();
  }
});
['session.none', 'session.expired'].forEach(type => Native.on(type, () => Object.assign(HostCalls, { status: null, loading: false, preview: '', previewError: '', previewRun: HostCalls.previewRun + 1, visBusy: false })));

/* Preview fixture only (?role=host&approvedHost=1&preview=host-call): a creator mid-call,
   and a second caller rings a few seconds later. */
if (DEMO && previewMode === 'host-call' && isApprovedHost()) {
  S.loggedIn = 1; Home.mediaStatus = 'Design preview';
  setTimeout(() => {
    S.caller = { ...nextCaller(), callId: 'preview-host-call' }; S.callId = S.caller.callId; go('hcall');
    setTimeout(() => { if (S.v === 'hcall' && !S.inc && !S.connecting) ringIncoming({ ...nextCaller(), callId: 'preview-waiting-call' }); }, 6000);
  });
}
