/* A call keeps going when its screen is left. Back on a calling or call screen minimizes the
   call (S.bgCall) instead of ending it: a bar across the top of every other screen shows it is
   still on, keeps the other person's audio playing (and shows their video small), and a tap
   returns to the call exactly as it was, with its clock, chat and camera. The red buttons still
   end it. While one call is minimized no other call can start, and an answer to a minimized
   outgoing call opens the call screen. */
const CALL_VIEWS = ['dial', 'dialback', 'call', 'voice', 'hcall'];
const Ongoing = { timer: 0, pickup: 0 };

function callMinimize() {
  if (!CALL_VIEWS.includes(S.v) || S.bgCall) return;
  if (window.Room?.transition) return appNotice('Your call is connecting. Please wait for the call controls.');
  if (S.connecting || S.inc) return appNotice('Answer or decline the incoming call first.');
  const view = S.v, host = view === 'hcall' || view === 'dialback';
  const voice = host ? !!S.caller?.voice : view === 'voice' || view === 'dial' && !!S.nextCallVoice;
  S.confirm = 0; if (window.Room) Room.sheet = '';
  S.bgCall = { view, h: S.h, caller: S.caller, voice, callId: view === 'hcall' ? S.caller?.callId : S.callId };
  // The preview has no server: the other side picks up after a moment, as it does on the call screen.
  if (DEMO && (view === 'dial' || view === 'dialback')) Ongoing.pickup = setTimeout(() => {
    if (S.bgCall?.view !== view) return;
    callRestore(false); go(view === 'dialback' ? 'hcall' : voice ? 'voice' : 'call', S.h);
  }, 2000);
  go('home');
}

/** Puts the minimized call back on screen. Without paint, only its state returns, for a caller
    that navigates next (an answer, an ending). */
function callRestore(paint = true) {
  const call = S.bgCall; if (!call) return false;
  S.bgCall = null; clearTimeout(Ongoing.pickup); ongoingPaint();
  const change = paint ? window.ZimiNavigation?.before(call.view) : null;
  S.v = call.view; S.h = call.h; S.caller = call.caller; S.tray = 0; S.more = 0; S.sh = 0;
  // The host's gift targets carry on rather than restarting as for a new call.
  if (call.view === 'hcall' && typeof HostStudio !== 'undefined') HostStudio.lastView = 'hcall';
  if (paint) {
    r(); document.getElementById('screen').scrollTop = 0;
    document.dispatchEvent(new CustomEvent('aurora:navigate')); window.ZimiNavigation?.after(change);
  }
  return true;
}

/** Whether a server event about call `id` is about the minimized call. */
function ongoingMatches(id) {
  const call = S.bgCall; if (!call) return false;
  return call.view === 'hcall' ? call.caller?.callId === id : !S.callId || S.callId === id;
}

/* The bar's red button ends the call as the call screen's would: a ringing call is cancelled
   where the person is; a connected one ends on its summary (a host may still confirm an early end). */
function ongoingHangup(event) {
  event?.stopPropagation(); const call = S.bgCall; if (!call) return;
  if (call.view === 'dial' || call.view === 'dialback') {
    S.bgCall = null; clearTimeout(Ongoing.pickup); window.ZimiMedia?.stop();
    Native.send('call.end', { reason: 'cancelled' }); S.callId = null; S.dialFrom = null;
    ongoingPaint(); window.ZimiRingback?.sync(); appNotice('Call cancelled'); r(); return;
  }
  if (call.view === 'hcall') { callRestore(); return hostEnd('end'); }
  callRestore(false); endCall();
}

function ongoingPerson(call) { return call.view === 'hcall' || call.view === 'dialback' ? call.caller : g(call.h); }
function ongoingStatus(call) {
  if (call.view === 'dial' || call.view === 'dialback') return 'Calling…';
  return `${call.voice ? 'Voice call' : 'Video call'} · ${clock(S.sec || 0)}`;
}
function ongoingPaint() {
  const call = S.bgCall, old = document.getElementById('zimi-ongoing');
  if (!call || CALL_VIEWS.includes(S.v) || !S.loggedIn) {
    if (old) old.remove();
    clearInterval(Ongoing.timer); Ongoing.timer = 0; return;
  }
  const p = ongoingPerson(call) || { n: 'Your call' }, ringing = call.view === 'dial' || call.view === 'dialback';
  // Redraw only when the call's shape changes, so the playing media keeps its decoder.
  const key = `${call.view}:${call.voice}:${p.id || p.n}`;
  if (!old || old.dataset.key !== key) {
    const media = ringing ? avc(p, 40) : call.voice ? `${avc(p, 40)}<audio data-zimi-remote autoplay hidden></audio>` : '<video data-zimi-remote autoplay playsinline></video>';
    const html = `<div id="zimi-ongoing" class="zoc ${ringing ? 'is-ringing' : ''}" data-key="${esc(key)}" role="region" aria-label="Ongoing call">
      <button type="button" class="zoc-return" onclick="callRestore()" aria-label="Return to your call with ${esc(p.n)}"><span class="zoc-media">${media}</span><span class="zoc-text"><strong>${esc(p.n)}</strong><span class="zoc-status"><i aria-hidden="true"></i><span class="zoc-time">${ongoingStatus(call)}</span></span></span><span class="zoc-cta" aria-hidden="true">Return</span></button>
      <button type="button" class="voiceend" onclick="ongoingHangup(event)" aria-label="End call">${I('ph', 20)}</button></div>`;
    if (old) old.outerHTML = html; else document.querySelector('.app')?.insertAdjacentHTML('afterbegin', html);
    window.ZimiMedia?.attach();
  }
  if (!Ongoing.timer) Ongoing.timer = setInterval(() => {
    const time = document.querySelector('#zimi-ongoing .zoc-time');
    if (time && S.bgCall) time.textContent = ongoingStatus(S.bgCall);
  }, 1000);
}

/* A host's gifts still count towards the session while its call is minimized. */
Native.on('gift.received', d => {
  const call = S.bgCall; if (call?.view !== 'hcall' || d.callId && d.callId !== call.callId) return;
  const id = d.id || d._id || d.transactionId;
  if (id && window.Room?.giftIds) { if (Room.giftIds.has(id)) return; Room.giftIds.add(id); }
  const coins = Number(d.totalCoins ?? d.coins ?? d.amount) || 0;
  S.earned = (S.earned || 0) + coins; S.recvN = (S.recvN || 0) + 1; S.gifted = (S.gifted || 0) + coins;
  S.rmsgs.push(['gift', d.senderName || d.from?.name || first(call.caller?.n || 'Your caller'), `sent ${d.emoji || '🎁'} ${d.giftName || 'a gift'}`]);
});
['session.none', 'session.expired'].forEach(type => Native.on(type, () => {
  if (!S.bgCall) return;
  S.bgCall = null; clearTimeout(Ongoing.pickup); window.ZimiMedia?.stop(); ongoingPaint(); window.ZimiRingback?.sync();
}));
document.addEventListener('aurora:navigate', ongoingPaint);
