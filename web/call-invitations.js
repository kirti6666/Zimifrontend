/* Suggestions are disclosed as automatic. No ring, media capture, call record or
   charge exists until the member explicitly chooses Connect. */
const CallInvitations={owner:'',invitation:null,requested:false,request:0,pending:0,busy:'',error:'',foreground:true,realtimeReady:false,readyAt:0,nullRetried:false,retryTimer:null,topup:null,ended:new Set(),timer:null};
function zciOwner(){return S.loggedIn?S.user?.id||'':''}
function zciMuted(){try{return localStorage.getItem('binzo.automaticCalls.muted.'+zciOwner())==='1'}catch{return false}}
function zciIdle(ownDialog=false){return !!zciOwner()&&!isHost()&&S.v==='home'&&!S.bgCall&&CallInvitations.foreground&&!document.hidden&&!homeContentPending()&&!Home.preparingCall&&!Home.matching&&!Home.checkoutBusy&&!Home.checkoutAttempt&&!CoinUI.checkoutPrompt&&!coinHasPendingPayment()&&!Home.giftTo&&!S.memberRing&&!S.inc&&!S.queuedInc&&!S.connecting&&!S.acceptingCall&&!ZVerify.state&&!window.ZimiChatVoice?.active()&&!document.querySelector(ownDialog?'dialog[open]:not(#zci-invitation)':'dialog[open]')&&!document.activeElement?.matches('input,textarea,[contenteditable=true]')}
function zciValid(invitation=CallInvitations.invitation){return !!invitation&&invitation.source==='automatic'&&invitation.label==='Automatic call invitation'&&invitation.status==='pending'&&Date.parse(invitation.expiresAt)>Date.now()}
function zciClose(){const dialog=document.getElementById('zci-invitation');if(dialog){dialog.close();dialog.remove()}}
function zciWatchDeadline(){
  clearTimeout(CallInvitations.timer);CallInvitations.timer=null;
  const value=CallInvitations.topup?.until||CallInvitations.invitation?.expiresAt,until=Date.parse(value),owner=zciOwner();
  if(!Number.isFinite(until)||!CallInvitations.foreground)return;
  CallInvitations.timer=setTimeout(()=>{
    CallInvitations.timer=null;if(owner!==zciOwner())return;
    if(CallInvitations.topup){CallInvitations.topup.ended=true;if(S.v==='coins')r()}
    if(CallInvitations.invitation&&Date.parse(CallInvitations.invitation.expiresAt)<=Date.now()){CallInvitations.invitation=null;zciClose();if(S.v==='home')appNotice('This automatic call invitation has expired. You can explore available hosts.')}
  },Math.min(2147483647,Math.max(0,until-Date.now())));
}
function zciReset(){zciClose();clearTimeout(CallInvitations.timer);clearTimeout(CallInvitations.retryTimer);Object.assign(CallInvitations,{owner:zciOwner(),invitation:null,requested:false,pending:++CallInvitations.request,busy:'',error:'',topup:null,timer:null,retryTimer:null,realtimeReady:false,nullRetried:false,readyAt:0});CallInvitations.ended.clear();S.callInvitationIntent=null;S.automaticCall=null;S.hostTopupWaiting=null}
function zciRequest(active=false){
  if(CallInvitations.owner!==zciOwner())zciReset();
  if(!zciOwner()||isHost()||!CallInvitations.realtimeReady||CallInvitations.busy||(!active&&(!zciIdle(true)||CallInvitations.requested||zciMuted())))return;
  if(active&&(!CallInvitations.foreground||document.hidden))return;
  CallInvitations.requested=true;CallInvitations.busy=active?'review':'load';CallInvitations.error='';CallInvitations.pending=++CallInvitations.request;
  Native.send('call.invitation.load',{requestId:CallInvitations.pending,...(active?{active:true}:{})});zciPaint();
}
function zciPaint(){
  if(!zciIdle(true)||!zciValid()||CallInvitations.topup?.kind==='incoming'){zciClose();return}
  const invitation=CallInvitations.invitation,host=invitation.host,ready=coinWalletReady(),short=ready&&S.bal<invitation.requiredCoins;
  let dialog=document.getElementById('zci-invitation');const creating=!dialog;
  if(!dialog){dialog=document.createElement('dialog');dialog.id='zci-invitation';dialog.className='zci-dialog';dialog.setAttribute('aria-labelledby','zci-title');dialog.addEventListener('cancel',event=>{event.preventDefault();if(!CallInvitations.busy)zciDismiss()});document.body.append(dialog)}
  dialog.innerHTML=`<header><span class="zci-label">Automatic call invitation</span><button type="button" aria-label="Close automatic invitation" onclick="zciDismiss()" ${CallInvitations.busy?'disabled':''}>${hi('close',20)}</button></header><div class="zci-person">${hcIdentityAvatar({id:host.id,n:host.name,avatarUrl:host.avatarUrl},76)}<div><span>Suggested host</span><h2 id="zci-title">${esc(host.name)}</h2>${host.city?`<p>${esc(host.city)}</p>`:''}</div></div><p>BinzoLive suggested this available host. This is an automatic invitation, not an incoming call from the host.</p><div class="zci-terms"><span>Video call <strong>${n(invitation.coinsPerMinute)} coins/min</strong></span>${invitation.entryFeeCoins?`<span>Entry fee <strong>${n(invitation.entryFeeCoins)} coins</strong></span>`:''}<span>Your balance <strong>${contentBalance()} coins</strong></span></div><p class="zci-note">${ready?short?`You need at least ${n(invitation.requiredCoins)} coins. Buying coins does not start a call.`:'Connect rings the real host. Charges begin only if the host answers.':'Checking your verified coin balance before connecting.'}</p>${CallInvitations.error?`<p class="zci-error" role="alert">${esc(CallInvitations.error)}</p>`:''}<button type="button" class="zci-primary" onclick="${short?'coinRequireRecharge(zciTopup)':'zciConnect()'}" ${CallInvitations.busy||!ready?'disabled':''}>${CallInvitations.busy==='connect'?'Preparing connection…':short?'Add coins':'Connect'}</button><button type="button" class="zci-secondary" onclick="zciDismiss()" ${CallInvitations.busy?'disabled':''}>Not now</button><button type="button" class="zci-mute" onclick="zciDismiss(true)" ${CallInvitations.busy?'disabled':''}>Don't show automatic invitations</button>`;
  if(creating)dialog.showModal();
}
function zciDismiss(mute=false){
  if(CallInvitations.busy==='connect')return;
  const invitation=CallInvitations.invitation;
  if(mute)try{localStorage.setItem('binzo.automaticCalls.muted.'+zciOwner(),'1')}catch{}
  zciClose();clearTimeout(CallInvitations.timer);CallInvitations.timer=null;CallInvitations.invitation=null;CallInvitations.topup=null;CallInvitations.busy='';CallInvitations.error='';CallInvitations.pending=++CallInvitations.request;
  if(invitation)Native.send('call.invitation.dismiss',{id:invitation.id,requestId:CallInvitations.pending});
}
async function zciConnect(){
  const invitation=CallInvitations.invitation,owner=zciOwner();if(!zciIdle(true)||!zciValid(invitation)||CallInvitations.busy||!coinWalletReady())return;
  if(S.bal<invitation.requiredCoins)return coinRequireRecharge(zciTopup);
  window.ZimiRingback?.prime();
  CallInvitations.busy='connect';CallInvitations.error='';const requestId=CallInvitations.pending=++CallInvitations.request;zciPaint();
  try{
    await window.ZimiMedia.prepare(true);
    if(owner!==zciOwner()||CallInvitations.pending!==requestId)return;
    if(!zciIdle(true)||!zciValid(invitation)){window.ZimiMedia.stop();CallInvitations.busy='';return zciPaint()}
    const host=knowHost({id:invitation.host.id,name:invitation.host.name,avatarUrl:invitation.host.avatarUrl,city:invitation.host.city,ratePerMin:invitation.coinsPerMinute,entryFee:invitation.entryFeeCoins,online:true,availableForCall:true,verified:true,role:'host'});
    S.automaticCall={invitationId:invitation.id,hostId:host.id};S.callInvitationIntent={id:invitation.id,hostId:host.id,requestId,expectedCoinsPerMinute:invitation.coinsPerMinute,expectedEntryFeeCoins:invitation.entryFeeCoins};S.nextCallVoice=false;S.callId=null;
    zciClose();S.allowPreparedCall=true;try{go('dial',host.id)}finally{S.allowPreparedCall=false}
  }catch(error){if(owner!==zciOwner()||CallInvitations.pending!==requestId)return;CallInvitations.busy='';window.ZimiRingback?.release();CallInvitations.error=error?.message||'Camera and microphone access could not be prepared.';zciPaint()}
}
function zciTopup(){if(CallInvitations.busy)return;if(!zciValid()){zciClose();go('coins');return}const invitation=CallInvitations.invitation;CallInvitations.topup={kind:'automatic',id:invitation.id,owner:zciOwner(),until:invitation.expiresAt};zciClose();go('coins')}
function zciReturnFromCoins(){const context=CallInvitations.topup;if(!context||context.owner!==zciOwner()||CallInvitations.busy)return;if(context.kind==='incoming')return zciReturnToIncoming();CallInvitations.topup=null;go('home');zciRequest(true)}
function zciReview(){if(CallInvitations.busy)return;go('home');zciRequest(true)}
function zciTopupIncoming(){
  const member=S.memberRing;if(!member||S.acceptingCall||CallInvitations.busy||CallInvitations.ended.has(member.callId))return;
  CallInvitations.busy='hold';CallInvitations.pending=++CallInvitations.request;member.error='';r();Native.send('call.topup.hold',{callId:member.callId,requestId:CallInvitations.pending});
}
function zciReturnToIncoming(){
  const context=CallInvitations.topup;if(!context||context.kind!=='incoming'||context.owner!==zciOwner()||CallInvitations.busy)return;
  if(context.ended||Date.parse(context.until)<=Date.now()||CallInvitations.ended.has(context.callId)){S.memberRing=null;CallInvitations.topup=null;go('home');return}
  CallInvitations.busy='incoming-review';CallInvitations.pending=++CallInvitations.request;Native.send('call.topup.review',{callId:context.callId,requestId:CallInvitations.pending});r();
}
function zciCoinsContext(){
  const context=CallInvitations.topup;if(!context||context.owner!==zciOwner())return '';
  const incoming=context.kind==='incoming',ended=context.ended||Date.parse(context.until)<=Date.now();
  return `<aside class="zci-checkout-context" role="region" aria-label="${incoming?'Incoming call coin purchase':'Automatic call invitation coin purchase'}"><strong>${incoming?'Your incoming call':'Automatic call invitation'}</strong><p>${ended?incoming?'The caller ended the call or the waiting period expired. A purchase will not reconnect it.':'This invitation has expired. A purchase will not start a call.':incoming?`The real caller is waiting until ${esc(new Date(context.until).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))}. Return and choose Accept yourself after adding coins.`:'Your invitation is saved. After adding coins, review the host and choose Connect yourself.'}</p>${CallInvitations.error?`<p role="alert">${esc(CallInvitations.error)}</p>`:''}<button type="button" onclick="zciReturnFromCoins()" ${CallInvitations.busy?'disabled':''}>${CallInvitations.busy?'Checking call…':ended?'Back to Home':incoming?'Return to incoming call':'Review invitation'}</button></aside>`;
}
function zciSourceBadge(){return S.automaticCall?'<p class="zci-source">Automatic call invitation</p>':''}
function zciAfter(){
  if(CallInvitations.owner!==zciOwner())zciReset();
  if(S.v!=='home')zciClose();
  if(S.v==='home'){if(!CallInvitations.requested)zciRequest();else zciPaint()}
  const waiting=S.hostTopupWaiting;
  if(waiting&&['dial','dialback'].includes(S.v)&&waiting.callId===S.callId&&Date.parse(waiting.until)>Date.now()){
    const root=document.querySelector('.dialscr,.dial,.ringscr');if(root&&!root.querySelector('.zci-host-waiting'))root.insertAdjacentHTML('beforeend',`<p class="zci-host-waiting" role="status">The member is adding coins. Waiting until ${esc(new Date(waiting.until).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))}. You can end the call at any time.</p>`);
  }
  if(S.automaticCall&&['dial','dialback','ring','call','voice','hcall'].includes(S.v)&&!document.querySelector('.zci-source')){
    const root=document.querySelector('.ringscr,.dialscr,.dial,.zr-room,.zh-call-room');if(root)root.insertAdjacentHTML('afterbegin',zciSourceBadge());
  }
}
Native.on('call.invitation.loaded',data=>{if(data.requestId!==CallInvitations.pending||CallInvitations.owner!==zciOwner())return;const reviewing=CallInvitations.busy==='review';CallInvitations.busy='';CallInvitations.error='';CallInvitations.invitation=data.invitation;if(!zciValid()){CallInvitations.invitation=null;if(!CallInvitations.nullRetried&&Date.now()-CallInvitations.readyAt<2500){CallInvitations.nullRetried=true;const owner=zciOwner();CallInvitations.retryTimer=setTimeout(()=>{CallInvitations.retryTimer=null;if(owner===zciOwner()&&zciIdle(true)){CallInvitations.requested=false;zciRequest(reviewing)}},1500);return}if(reviewing&&S.v==='home')appNotice('This invitation is no longer available. You can explore other hosts.');return}zciWatchDeadline();zciPaint()});
Native.on('call.invitation.error',data=>{if(data.requestId!==CallInvitations.pending)return;CallInvitations.busy='';CallInvitations.error=data.message||'This invitation could not be checked.';if(S.v==='home')zciPaint();else if(S.v==='coins')r()});
Native.on('call.incoming',data=>{
  // Optional discovery can never occupy the real call's controls. Do not retire
  // an actual hold/review when its ringing update is replayed during checkout.
  clearTimeout(CallInvitations.retryTimer);CallInvitations.retryTimer=null;
  if(['load','review'].includes(CallInvitations.busy)||CallInvitations.busy==='connect'&&S.v==='incoming'){CallInvitations.pending=++CallInvitations.request;CallInvitations.busy='';CallInvitations.error='';CallInvitations.requested=true}
  if(CallInvitations.topup?.kind!=='incoming'){CallInvitations.invitation=null;CallInvitations.topup=null;clearTimeout(CallInvitations.timer);CallInvitations.timer=null}
  zciClose();
  if(data.source==='automatic'&&data.automaticInvitationId){S.automaticCall={invitationId:data.automaticInvitationId,hostId:data.from?.id,callId:data.callId};r()}
});
Native.on('call.created',data=>{if(data.invitationId&&data.requestId===CallInvitations.pending){CallInvitations.busy='';CallInvitations.topup=null;CallInvitations.invitation=null;clearTimeout(CallInvitations.timer);CallInvitations.timer=null;S.automaticCall={invitationId:data.invitationId,hostId:data.to,callId:data.callId}}zciAfter()});
Native.on('call.connected',data=>{if(data.source==='automatic'&&data.automaticInvitationId)S.automaticCall={invitationId:data.automaticInvitationId,hostId:data.peerId,callId:data.callId};else if(S.automaticCall?.callId&&S.automaticCall.callId!==data.callId)S.automaticCall=null;zciAfter()});
Native.on('call.failed',data=>{
  if(data.invitationId&&data.requestId===CallInvitations.pending){CallInvitations.busy='';CallInvitations.error=data.message||'The host could not be connected.';if(data.code==='CALL_PRICE_CHANGED')zciRequest(true);else if(data.code==='INVITATION_CALL_ENDED')CallInvitations.invitation=null;}
  if(data.callId&&S.memberRing?.callId===data.callId&&data.code==='INSUFFICIENT_COINS'){S.memberRing.topupRequired=true;r()}
});
Native.on('call.topup.held',data=>{
  if(data.requestId!==CallInvitations.pending||CallInvitations.busy!=='hold'||S.memberRing?.callId!==data.callId||CallInvitations.ended.has(data.callId))return;
  CallInvitations.busy='';S.memberRing.topupUntil=data.until;CallInvitations.topup={kind:'incoming',callId:data.callId,owner:zciOwner(),until:data.until};zciWatchDeadline();window.ZimiMedia?.stop();go('coins');
});
Native.on('call.topup.error',data=>{if(data.requestId!==CallInvitations.pending)return;CallInvitations.busy='';CallInvitations.error=data.message||'The call could not be checked.';if(S.memberRing?.callId===data.callId)S.memberRing.error=CallInvitations.error;if(['incoming','coins'].includes(S.v))r()});
Native.on('call.topup.reviewed',data=>{
  const context=CallInvitations.topup;if(data.requestId!==CallInvitations.pending||context?.kind!=='incoming'||context.callId!==data.callId)return;CallInvitations.busy='';
  if(!data.ringing||CallInvitations.ended.has(data.callId)||!S.memberRing){context.ended=true;S.memberRing=null;r();return}
  if(data.rate!==undefined)S.memberRing.rate=data.rate;S.memberRing.topupRequired=S.bal<S.memberRing.rate;S.memberRing.error='';CallInvitations.topup=null;go('incoming');
});
Native.on('call.topup.waiting',data=>{if(CallInvitations.ended.has(data.callId))return;if(S.memberRing?.callId===data.callId)S.memberRing.topupUntil=data.until;S.hostTopupWaiting={callId:data.callId,until:data.until};if(['incoming','dial','dialback'].includes(S.v))r()});
Native.on('call.ended',data=>{CallInvitations.ended.add(data.callId);if(CallInvitations.ended.size>100)CallInvitations.ended.delete(CallInvitations.ended.values().next().value);if(CallInvitations.topup?.kind==='incoming'&&CallInvitations.topup.callId===data.callId){CallInvitations.topup.ended=true;CallInvitations.busy='';CallInvitations.pending=++CallInvitations.request;if(S.memberRing?.callId===data.callId)S.memberRing=null;if(S.v==='coins')r()}if(S.automaticCall&&data.callId===S.callId)S.automaticCall=null;});
Native.on('realtime.status',data=>{CallInvitations.realtimeReady=data.connected===true;if(data.connected){CallInvitations.readyAt=Date.now();CallInvitations.nullRetried=false;zciAfter()}else zciClose()});
Native.on('app.background',()=>{CallInvitations.foreground=false;clearTimeout(CallInvitations.timer);clearTimeout(CallInvitations.retryTimer);CallInvitations.timer=null;CallInvitations.retryTimer=null;zciClose()});
Native.on('app.foreground',()=>{CallInvitations.foreground=true;CallInvitations.readyAt=Date.now();CallInvitations.nullRetried=false;if(!CallInvitations.topup&&!CallInvitations.invitation){CallInvitations.requested=false}zciWatchDeadline();zciAfter();if(S.v==='coins'&&CallInvitations.topup)r()});
Native.on('wallet.balance',data=>{if(S.memberRing&&typeof data.coins==='number'&&data.coins>=S.memberRing.rate)S.memberRing.topupRequired=false;zciPaint();if(S.v==='incoming'||S.v==='coins'&&CallInvitations.topup)r()});
['session.none','session.expired'].forEach(type=>Native.on(type,zciReset));
document.addEventListener('aurora:navigate',()=>{if(S.v!=='home')zciClose();queueMicrotask(zciAfter)});
const zciPreviousAfter=ZimiHome.afterRender;ZimiHome.afterRender=()=>{zciPreviousAfter();zciAfter()};
window.ZimiCallInvitations={request:zciRequest,connect:zciConnect,dismiss:zciDismiss,topup:zciTopup,review:zciReview,returnFromCoins:zciReturnFromCoins,topupIncoming:zciTopupIncoming,returnToIncoming:zciReturnToIncoming,coinsContext:zciCoinsContext,sourceBadge:zciSourceBadge,reset:zciReset,
  receiveIncoming(data){if(CallInvitations.topup?.kind==='incoming'&&CallInvitations.topup.callId===data.callId&&S.memberRing?.callId===data.callId){if(data.rate!==undefined)S.memberRing.rate=data.rate;return true}return false}};
