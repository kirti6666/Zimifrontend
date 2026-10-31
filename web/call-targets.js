/* The member's call screen shows the host's gift and mission targets in place of the call
   rate, so gifts visibly help the host. Hosts share their targets whenever they change.
   Staff set when the low-balance Recharge pop-up appears; the server sends the threshold. */
const CallTargets = { data: null, loading: '', sent: '', shareTimer: 0, recharge: null, shownAt: 0 };
const CT_PREVIEW_RECHARGE = { enabled: true, thresholdCoins: 500, lastRechargeCoins: 0, delaySeconds: 10, repeatSeconds: 180 };

function ctMemberCall() { return ['call', 'voice'].includes(S.v) && (!!S.callId || DEMO); }

/* Host: called while the targets render, so every change reaches the member once. */
function ctShareTargets() {
  if (DEMO || S.v !== 'hcall' || !S.callId) return;
  clearTimeout(CallTargets.shareTimer);
  CallTargets.shareTimer = setTimeout(() => {
    if (S.v !== 'hcall' || !S.callId || S.connecting) return;
    const gift = hsTargetGift();
    const targets = {
      callId: S.callId, giftId: /^[a-f\d]{24}$/i.test(gift?.id || '') ? gift.id : null, giftCount: HostStudio.giftCount,
      giftProgress: Math.min(1000000, hsGiftProgress(gift)), goalCoins: HostStudio.goal, earnedCoins: Math.max(0, Math.floor(HostStudio.receivedCoins)),
    };
    const key = JSON.stringify(targets);
    if (key === CallTargets.sent) return;
    CallTargets.sent = key; Native.send('call.targets.set', targets);
  }, 500);
}

/* Member */
function ctTargets() {
  const data = CallTargets.data?.callId === S.callId ? CallTargets.data : null;
  if (data || !DEMO) return data;
  const gift = (Array.isArray(Home.gifts) && Home.gifts[0]) || { id: 'preview-rose', name: 'Rose', emoji: '🌹', coins: 99 };
  return { callId: S.callId, gift, giftCount: 10, giftProgress: 3, goalCoins: 1000000, earnedCoins: 420000 };
}
function ctSenderTargets() {
  const data = ctTargets(), host = zrPerson();
  if (!data || !host) return '<div class="zr-call-stats ct-call-targets"></div>';
  const gift = data.gift, name = esc(first(host.n)), mission = hsPercent(data.earnedCoins, data.goalCoins);
  const giftCard = gift ? `<button type="button" class="hs-target-card" onclick="ctGive()" aria-label="Send ${esc(gift.name)} to help ${name} reach the gift target, ${n(data.giftProgress)} of ${n(data.giftCount)}"><span class="hs-target-art">${hsGiftArt(gift)}</span><span class="hs-target-copy"><span class="hs-target-label">GIFT TARGET <b>${n(data.giftProgress)}/${n(data.giftCount)}</b></span><strong>${giftPriceMarkup(gift, 10)}</strong><i class="hs-target-track"><em style="width:${hsPercent(data.giftProgress, data.giftCount)}%"></em></i></span></button>` : '';
  return `<div class="zr-call-stats ct-call-targets"><div class="hs-targets ${gift ? '' : 'ct-mission-only'}">${giftCard}<button type="button" class="hs-target-card" onclick="ctGive(true)" aria-label="Send a gift to help ${name} reach the mission, ${Math.floor(mission)}% done"><span class="hs-target-copy"><span class="hs-target-label">MISSION <b>${Math.floor(mission)}%</b></span><strong>${coinIcon(10)} ${kfmt(data.earnedCoins)}<small> / ${kfmt(data.goalCoins)}</small></strong><i class="hs-target-track"><em style="width:${mission}%"></em></i></span></button></div></div>`;
}
/* Opens the gift panel, with the target gift chosen when the member tapped that card. */
function ctGive(mission = false) {
  const host = zrPerson(), gift = ctTargets()?.gift;
  if (!host) return;
  homeGifts(host.id);
  if (!mission && gift?.id && !Home.giftBusy) homeSelectGift(gift.id);
}
function ctPaintTargets() {
  const node = document.querySelector('.ct-call-targets');
  if (node) node.outerHTML = ctSenderTargets(); else r();
}

/* Recharge pop-up: at or under the staff threshold, after the call's first seconds, and again
   only once the repeat time has passed since it was last shown or dismissed. */
function ctRechargeRule() { return CallTargets.recharge || (DEMO ? CT_PREVIEW_RECHARGE : null); }
function ctRechargeCheck() {
  if (CoinUI.rechargePrompt) { ctRechargeClose(); return; }
  const rule = ctRechargeRule(), dialog = document.getElementById('ct-recharge');
  if (!ctMemberCall() || !rule?.enabled || !coinWalletReady()) { ctRechargeClose(); return; }
  if (dialog) { if (S.bal > rule.thresholdCoins) ctRechargeClose(); else ctRechargePaint(dialog); return; }
  if (S.bal > rule.thresholdCoins || S.sec < rule.delaySeconds || Date.now() - CallTargets.shownAt < rule.repeatSeconds * 1000) return;
  // Someone already adding coins or answering another prompt is not interrupted.
  if (Home.giftTo || document.querySelector('dialog[open]')) return;
  const next = document.createElement('dialog');
  next.id = 'ct-recharge'; next.className = 'ct-recharge';
  next.setAttribute('aria-labelledby', 'ct-recharge-title'); next.setAttribute('aria-describedby', 'ct-recharge-text');
  next.addEventListener('cancel', event => { event.preventDefault(); ctRechargeLater(); });
  ctRechargePaint(next); document.body.append(next);
  CallTargets.shownAt = Date.now();
  next.showModal(); next.querySelector('.ct-recharge-primary')?.focus();
}
function ctRechargePaint(dialog) {
  const host = zrPerson(), rate = S.callRate || 0, key = `${S.bal}:${rate}:${host?.id || ''}`;
  if (dialog.dataset.key === key) return;
  const minutes = rate ? Math.floor(S.bal / rate) : 0, focused = dialog.contains(document.activeElement) ? document.activeElement.className : '';
  const left = rate ? (minutes < 1 ? 'Less than a minute of calling left.' : `About ${n(minutes)} min of calling left.`) : '';
  dialog.dataset.key = key;
  dialog.innerHTML = `<span class="ct-recharge-coin" aria-hidden="true">${coinIcon(40)}</span><h2 id="ct-recharge-title">Recharge to keep talking</h2><p id="ct-recharge-text">Only <b>${n(S.bal)} coins</b> left. ${left} Add coins so your call with ${esc(first(host?.n || 'your host'))} doesn't end.</p><button type="button" class="ct-recharge-primary" onclick="ctRecharge()">Recharge</button><button type="button" class="ct-recharge-later" onclick="ctRechargeLater()">Not now</button>`;
  if (focused) dialog.querySelector(`.${focused.split(' ')[0]}`)?.focus();
}
function ctRechargeClose() {
  const dialog = document.getElementById('ct-recharge');
  if (!dialog) return;
  if (dialog.open) dialog.close();
  dialog.remove();
}
function ctRechargeLater() { CallTargets.shownAt = Date.now(); ctRechargeClose(); }
function ctRecharge() { CallTargets.shownAt = Date.now(); ctRechargeClose(); zrCallTopup(); }

Native.on('call.connected', d => {
  if (!ctMemberCall() || d.callId !== S.callId || DEMO || CallTargets.loading === d.callId) return;
  CallTargets.loading = d.callId; Native.send('call.targets.load', { callId: d.callId });
});
Native.on('call.targets', d => {
  if (!d || d.callId !== S.callId) return;
  CallTargets.data = d;
  if (ctMemberCall()) ctPaintTargets();
});
Native.on('wallet.balance', d => { if (d.rechargePrompt) CallTargets.recharge = d.rechargePrompt; ctRechargeCheck(); });
Native.on('session', d => { if (CallTargets.owner !== d.user?.id) Object.assign(CallTargets, { owner: d.user?.id, data: null, loading: '', sent: '', recharge: null, shownAt: 0 }); });
['session.none', 'session.expired'].forEach(type => Native.on(type, () => { ctRechargeClose(); Object.assign(CallTargets, { owner: '', data: null, loading: '', sent: '', recharge: null, shownAt: 0 }); }));
setInterval(ctRechargeCheck, 1000);
