/* A quiet, readable preflight for real private calls. Capture starts only from
   the primary action; home.js owns permission requests and their cancellation. */
const CallSetup = { mode: 'video', peerId: '', wasOpen: false };
Object.assign(homeIcons,{arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>'});
function zpcMode(mode){if(Home.preparingCall||(window.ZIMI_LIVE_STREAMING_ENABLED&&Home.dashboardSetup?.streamId)||!['video','voice'].includes(mode))return;CallSetup.mode=mode;S.pcerr='';r();document.querySelector(`[data-call-mode="${mode}"]`)?.focus({preventScroll:true})}
function zpcPortrait(h){const src=imageSrc(h.avatarUrl||h.coverUrl);return src?`<img src="${src}" alt="${esc(h.n)}" data-face="${faceKind(h)}">`:face(h)}
function zpcScreen(){
  const h=g(S.h);if(!h)return `<section class="zpc-setup"><div class="zpc-missing">${hi('user',40)}<h1>Creator unavailable</h1><p>This profile could not be loaded.</p><button class="zpc-primary" onclick="go('home')">Back to Home</button></div></section>`;
  if(CallSetup.peerId!==h.id){CallSetup.peerId=h.id;CallSetup.mode='video'}
  const live=window.ZIMI_LIVE_STREAMING_ENABLED&&!!Home.dashboardSetup?.streamId&&Home.dashboardSetup.hostId===h.id;
  if(live)CallSetup.mode='video';
  const busy=!!Home.preparingCall,voice=!live&&(busy?!!Home.preparingVoice:CallSetup.mode==='voice');
  const available=!!h.available&&(!live||h.stream?.id===Home.dashboardSetup.streamId);
  const need=(h.rate||0)+(h.fee||0),walletPending=need>0&&!coinWalletReady(),walletError=walletPending&&!!ContentLoading.wallet.error;
  // A paid call needs the entry fee and one minute of coins to start; the server enforces the same rule.
  const short=available&&!busy&&!walletPending&&need>0&&S.bal<need;
  const modes=live?[['video','vid','Video call','Request a private call']]:[['video','vid','Video call','Face to face'],['voice','ph','Voice call','Just your voices']];
  const permission=voice?'microphone':'camera & microphone';
  return `<section class="zpc-setup ${busy?'is-preparing':''} ${!available?'is-unavailable':''}" aria-label="Set up your private call">
    <div class="zpc-ambient" aria-hidden="true"></div>
    <header class="zpc-header">${backButton("go('home')",{slot:"zpc-back"})}<span>1-on-1 call</span><span class="zpc-private">${hi('lock',12)} Private</span></header>
    <div class="zpc-profile">
      <div class="zpc-avatar-wrap"><div class="zpc-orbit" aria-hidden="true"></div><div class="zpc-avatar has-photo">${zpcPortrait(h)}</div><span class="zpc-avatar-badge" aria-hidden="true">${hi(voice?'ph':'vid',17)}</span></div>
      <span class="zpc-eyebrow">A LITTLE MORE PERSONAL</span>
      <h1>${esc(h.n)} ${homeVerified(h)}</h1>
      <p class="zpc-category">${esc(h.cat||h.tag||'Creator')}${h.c?`<span>·</span>${esc(h.c)}`:''}</p>
      <span class="zpc-presence ${busy?'is-busy':available?'is-online':'is-offline'}"><i></i>${busy?'Getting your call ready':available?'Online · Ready to connect':'Currently unavailable'}</span>
    </div>
    <div class="zpc-content">
      <div class="zpc-section-title"><h2>${live?'Review your video call':'How would you like to connect?'}</h2><span>JUST THE TWO OF YOU</span></div>
      <div class="zpc-modes ${live?'zpc-video-only':''}" role="group" aria-label="Choose your call type">${modes.map(([mode,icon,title,detail])=>`<button type="button" class="zpc-mode ${CallSetup.mode===mode?'selected':''}" data-call-mode="${mode}" aria-label="${title}" aria-pressed="${CallSetup.mode===mode}" onclick="zpcMode('${mode}')" ${busy?'disabled':''}><span class="zpc-mode-icon">${hi(icon,23)}</span><span class="zpc-mode-copy"><strong>${title}</strong><small>${detail}</small></span><i class="zpc-mode-check" aria-hidden="true">${CallSetup.mode===mode?hi('check',11):''}</i></button>`).join('')}</div>
      <div class="zpc-details" aria-label="Call pricing and wallet"><div><span>${hi('rings',14)} Call rate</span><strong class="${h.rate?'':'zpc-free'}">${h.rate?`${n(h.rate)} <small>coins/min</small>`:'Free'}${h.fee?`<small>+ ${n(h.fee)} coin entry fee</small>`:''}</strong></div><i></i><div><span>Your balance</span><strong>${contentBalance()} <small>coins</small></strong></div></div>
      ${need>0&&!short?`<p class="zpc-cost-note">At least ${n(need)} coins to start${h.rate?' &middot; billed by the second':''}${h.fee?` &middot; the entry fee is charged when ${esc(first(h.n))} picks up and isn’t refunded`:''}</p>`:''}
      ${busy?`<div class="zpc-preparing" role="status" aria-live="polite" aria-label="Preparing ${voice?'voice':'video'} call" aria-busy="true"><div class="zpc-preparing-icon" aria-hidden="true">${hi(voice?'mic':'vid',22)}</div><div><strong>Allow ${permission}</strong><p>Check your device's permission prompt to continue.</p><span class="zpc-progress-skeleton" aria-hidden="true"><i class="zh-skeleton-shape"></i></span></div></div>`:S.pcerr?`<div class="zpc-error" role="alert">${hi('info',19)}<div><strong>Let's try that again</strong><p>${esc(S.pcerr)}</p></div></div>`:!available?`<div class="zpc-unavailable-note">${hi('clock',19)}<p>This creator isn't taking calls right now.<br><span>Explore creators who are ready to connect.</span></p></div>`:walletPending?`<div class="zpc-unavailable-note" role="status">${hi(walletError?'info':'coins',19)}<p>${walletError?'Your balance could not be loaded.':'Checking your coin balance...'}<br><span>${walletError?'Retry to confirm you have enough coins.':'Your call will be ready to confirm once it loads.'}</span></p></div>`:short?`<div class="zpc-unavailable-note" role="status">${hi('info',19)}<p>You need at least ${n(need)} coins ${h.fee?`for the ${n(h.fee)}-coin entry fee and one minute`:'for a one-minute call'}.<br><span>${h.rate?'Calls are billed by the second while you talk.':'The entry fee is charged when the creator picks up.'}</span></p></div>`:live?`<div class="zpc-permission-note">${hi('shield',20)}<p>Send a private video call request. <span>Your camera and microphone activate when the host accepts.</span></p></div>`:`<div class="zpc-permission-note">${hi('shield',20)}<p>${voice?'Your microphone activates':'Your camera and microphone activate'} when you start. <span>You can turn ${voice?'it':'them'} off at any time.</span></p></div>`}
    </div>
    <footer class="zpc-actions">${short?`<button class="zpc-primary" onclick="go('coins')">${hi('coins',21)} <span>Buy coins to call</span>${hi('arrow',18)}</button>`:`<button class="zpc-primary" onclick="${live?'homeDashboardConfirmCall()':`homeStartCall(${voice})`}" ${busy||!available||walletPending?'disabled':''}>${hi(voice?'ph':'vid',21)} <span>${busy?voice?'Preparing microphone...':'Preparing camera...':!available?'Currently unavailable':live?'Request video call':voice?'Start voice call':'Start video call'}</span>${!busy&&available&&!walletPending?hi('arrow',18):''}</button>`}${walletError&&available?`<button class="zpc-secondary" onclick="contentRetry('wallet')">${hi('refresh',16)} Retry balance</button>`:''}${busy?'<button class="zpc-cancel" onclick="homeCancelPrepare()">Cancel preparation</button>':!available?'<button class="zpc-secondary" onclick="go(\'explore\')">Explore creators '+hi('arrow',16)+'</button>':`<p class="zpc-footer-note">${hi('lock',11)} ${live?'The host accepts before your call starts.':'Your time. Your conversation.'}</p>`}${DEMO?'<span class="zpc-demo">Interactive preview &middot; no real call is placed</span>':''}</footer>
  </section>`;
}
function zpcAfter(){const open=S.v==='precall';document.documentElement.classList.toggle('zpc-active',open);if(open&&!CallSetup.wasOpen)document.getElementById('scroll-root').scrollTop=0;CallSetup.wasOpen=open}
document.addEventListener('aurora:navigate',()=>{if(S.v==='precall'&&!Home.preparingCall){CallSetup.mode='video';CallSetup.peerId=S.h;r()}});
if(DEMO&&['precall','precall-offline'].includes(previewMode)){
  const offline=previewMode==='precall-offline';
  const h=homeRemember({id:'preview-sara',name:offline?'[Test] Sara':'Sara Khan',category:'Fitness',city:'Mumbai',avatarUrl:offline?'':PREVIEW_HOSTS[5],coverUrl:'',online:!offline,verified:true,availableForCall:!offline,ratePerMin:0,entryFee:0});
  S.v='precall';S.h=h.id;S.loggedIn=1;S.bal=offline?0:1250;
}
