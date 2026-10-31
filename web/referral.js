/* Refer a Friend & Earn: the Settings page, a Home pop-up at most once a day and a small
   card one minute into a video call. The server owns the code and the rewards: a friend
   who joins with the code gets the friend bonus, and the inviter is paid when that friend's
   first coin purchase is confirmed. The pop-up and the call card appear only once the
   server's summary has arrived, so the app never advertises a program the server lacks. */
const ZRefer={data:null,demo:null,from:'settings',applying:0,request:0,applyError:'',focusCode:false,promoTimer:null,callShown:new Set(),card:null,cardTimer:null,checkTimer:null,requested:false};
Object.assign(homeIcons,{share:'<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>'});
// The design preview shows the pop-up only when asked (?promo=refer), so automated screen checks stay undisturbed.
const ZREFER_PREVIEW=DEMO&&new URLSearchParams(location.search).get('promo')==='refer';
const ZREFER_DEMO={code:'BZ7K4Q',shareUrl:'https://binzolive.com/?ref=BZ7K4Q',rewardCoins:1000,friendBonusCoins:100,applyDays:7,friendsJoined:3,friendsRewarded:1,coinsEarned:1000,appliedCode:null,canApplyCode:true};
// The preview keeps its sample apart from server data, so trying the code form never turns the pop-ups on.
function zrfData(){return ZRefer.data||(DEMO?ZRefer.demo||ZREFER_DEMO:null)}
function zrfCoins(value){return Number(value||0).toLocaleString('en-IN')}
function zrfLoad(){if(DEMO){r();return}contentStart('referral');Native.send('referral.load');if(S.v==='refer')r()}
function zrfOpen(from){ZRefer.from=['home','settings'].includes(from)?from:'settings';go('refer')}
function zrfHeader(){const home=ZRefer.from==='home';return `<header class="zh-subheader zrf-header">${backButton(`go('${home?'home':'settings'}')`,{label:home?'Back to home':'Back to settings'})}<h1>Refer &amp; Earn</h1></header>`}

function zrfView(){
  const data=zrfData(),pending=!DEMO&&contentPending('referral')&&!data,error=!DEMO&&!data&&ContentLoading.referral.error;
  if(pending)return `<section class="zrf-page">${contentSkeleton('rows','Loading your invite code',3)}</section>`;
  if(error)return `<section class="zrf-page">${contentError('referral')}</section>`;
  if(!data)return '<section class="zrf-page"></section>';
  const reward=zrfCoins(data.rewardCoins),bonus=zrfCoins(data.friendBonusCoins),busy=!!ZRefer.applying;
  const apply=data.canApplyCode?`<form class="zrf-apply" onsubmit="event.preventDefault();zrfApply()" novalidate><label for="zrf-code">Have a friend's code? Get ${bonus} coins</label><div class="zrf-apply-row"><input id="zrf-code" maxlength="10" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Enter code" aria-describedby="zrf-apply-note" ${busy?'disabled':''}><button type="submit" ${busy?'disabled aria-busy="true"':''}>${busy?'Applying…':'Apply'}</button></div>${ZRefer.applyError?`<p class="zrf-apply-error" role="alert">${esc(ZRefer.applyError)}</p>`:''}<p id="zrf-apply-note" class="zrf-note">Works within ${zrfCoins(data.applyDays)} days of joining, before your first coin purchase.</p></form>`:'';
  return `<section class="zrf-page" aria-labelledby="zrf-title">
    <div class="zrf-hero"><span class="zrf-hero-icon" aria-hidden="true">${hi('gift',34)}</span><h2 id="zrf-title">Refer a Friend &amp; Earn ${reward} Coins</h2><p>Share your code. Your friend gets ${bonus} coins when they join with it, and you get ${reward} coins when they make their first coin purchase.</p></div>
    <div class="zrf-code-card"><div><span>Your invite code</span><strong class="zrf-code" aria-label="Your invite code ${esc(data.code.split('').join(' '))}">${esc(data.code)}</strong></div><button type="button" class="zrf-copy" onclick="zrfCopy()" aria-label="Copy your invite code">${hi('copy',18)}<span>Copy</span></button></div>
    <button type="button" class="zrf-share" onclick="zrfShare()">${hi('share',19)} Share invite</button>
    <ol class="zrf-steps"><li><b>Share your code</b><span>Send your invite to friends on WhatsApp or anywhere else.</span></li><li><b>They join and get ${bonus} coins</b><span>Your friend enters your code after signing up.</span></li><li><b>You get ${reward} coins</b><span>When your friend buys coins for the first time.</span></li></ol>
    <div class="zrf-stats" aria-label="Your invitations"><div><b>${zrfCoins(data.friendsJoined)}</b><span>Friends joined</span></div><div><b>${zrfCoins(data.friendsRewarded)}</b><span>First purchases</span></div><div><b>${coinIcon(16)}${zrfCoins(data.coinsEarned)}</b><span>Coins earned</span></div></div>
    ${apply}${data.appliedCode?`<p class="zrf-joined">${hi('check',16)} You joined with code ${esc(data.appliedCode)}.</p>`:''}
    <p class="zrf-terms">Rewards are added once your friend's first coin purchase is confirmed, and are taken back if that purchase is refunded. Each new account can use one friend's code.</p>
  </section>`;
}
async function zrfCopy(){
  const code=zrfData()?.code;if(!code)return;
  try{
    if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(code);
    else{const field=document.createElement('textarea');field.value=code;field.className='zrf-copy-helper';document.body.append(field);field.select();const copied=document.execCommand('copy');field.remove();if(!copied)throw new Error('Copy unavailable')}
    appNotice('Invite code copied.');
  }catch{appNotice('Copy is unavailable. You can share the invite instead.')}
}
function zrfShare(){if(DEMO){appNotice('Design preview · this opens your phone’s share sheet.');return}Native.send('referral.share')}
function zrfApply(){
  const input=document.getElementById('zrf-code'),code=(input?.value||'').replace(/[\s-]/g,'').toUpperCase();
  if(ZRefer.applying)return;
  if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code)){ZRefer.applyError='Enter the 6-character code your friend shared.';r();document.getElementById('zrf-code')?.focus();return}
  ZRefer.applyError='';
  if(DEMO){ZRefer.demo={...ZREFER_DEMO,appliedCode:code,canApplyCode:false};appNotice(`Design preview · ${zrfCoins(ZREFER_DEMO.friendBonusCoins)} coins added.`);r();return}
  ZRefer.applying=++ZRefer.request;Native.send('referral.apply',{code,requestId:ZRefer.applying});r();
}

/* The Home pop-up: members only, at most once a day per account, never over another dialog. */
function zrfPromoKey(){return 'zimi.referPromo.'+(S.user?.id||'me')}
function zrfToday(){const d=new Date();return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`}
function zrfPromoDue(){
  if(!(ZRefer.data||ZREFER_PREVIEW)||S.v!=='home'||!S.loggedIn||isHost()||document.querySelector('dialog[open]')||Home.giftTo)return false;
  try{return localStorage.getItem(zrfPromoKey())!==zrfToday()}catch{return true}
}
// Home redraws often; a pending pop-up keeps its timer instead of starting over on every redraw.
function zrfSchedulePromo(){
  if(ZRefer.promoTimer||!zrfPromoDue()||homeContentPending())return;
  ZRefer.promoTimer=setTimeout(()=>{ZRefer.promoTimer=null;if(zrfPromoDue()&&!homeContentPending())zrfShowPromo()},1500);
}
function zrfCancelPromo(){clearTimeout(ZRefer.promoTimer);ZRefer.promoTimer=null}
function zrfClosePromo(){document.getElementById('zrf-promo')?.close()}
function zrfShowPromo(){
  const data=zrfData();if(!data)return;
  try{localStorage.setItem(zrfPromoKey(),zrfToday())}catch{}
  const reward=zrfCoins(data.rewardCoins),bonus=zrfCoins(data.friendBonusCoins);
  const dialog=document.createElement('dialog');dialog.id='zrf-promo';dialog.className='zn-dialog zrf-promo';dialog.setAttribute('aria-labelledby','zrf-promo-title');
  dialog.innerHTML=`<button type="button" class="zrf-promo-close" aria-label="Close" onclick="zrfClosePromo()">${hi('close',20)}</button>
    <div class="zrf-promo-body"><span class="zrf-hero-icon" aria-hidden="true">${hi('gift',32)}</span><h2 id="zrf-promo-title">Refer a Friend &amp; Earn ${reward} Coins</h2>
    <p>Invite friends with your code. They get ${bonus} coins for joining, and you get ${reward} coins when they make their first coin purchase.</p>
    <button type="button" class="zrf-share" onclick="zrfClosePromo();zrfOpen('home')">${hi('share',19)} Invite friends</button>
    ${data.canApplyCode?`<button type="button" class="zrf-promo-link" onclick="ZRefer.focusCode=true;zrfClosePromo();zrfOpen('home')">Have a friend's code? Get ${bonus} coins</button>`:''}
    <button type="button" class="zrf-promo-later" onclick="zrfClosePromo()">Not now</button></div>`;
  dialog.addEventListener('close',()=>dialog.remove());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
  document.body.append(dialog);dialog.showModal();
}

/* The call card: one minute into a member's video call, once per call, for eight seconds,
   at the top of the call so it never covers the call controls. Invite opens the share
   sheet over the running call. */
function zrfCallCard(){
  const card=ZRefer.card;if(!card||card.callId!==zrfCallKey())return '';
  return `<aside class="zrf-call-card" role="status"><span class="zrf-call-icon" aria-hidden="true">${hi('gift',18)}</span><span class="zrf-call-copy"><b>Refer a friend, earn ${zrfCoins(card.reward)} coins</b><small>When they make their first coin purchase</small></span><button type="button" class="zrf-call-invite" onclick="zrfCallInvite()">Invite</button><button type="button" class="zrf-call-close" aria-label="Close" onclick="zrfHideCallCard()">${hi('close',16)}</button></aside>`;
}
function zrfCallKey(){return String(S.callId||S.h||'call')}
function zrfHideCallCard(){clearTimeout(ZRefer.cardTimer);if(!ZRefer.card)return;ZRefer.card=null;if(S.v==='call')r()}
function zrfCallInvite(){zrfHideCallCard();zrfShare()}
function zrfCallCheck(){
  const data=ZRefer.data||(ZREFER_PREVIEW?ZREFER_DEMO:null),key=zrfCallKey();
  if(S.v!=='call'||isHost()||!data||S.sec<60||ZRefer.callShown.has(key))return;
  ZRefer.callShown.add(key);ZRefer.card={callId:key,reward:data.rewardCoins};r();
  ZRefer.cardTimer=setTimeout(zrfHideCallCard,8000);
}
function zrfWatchCall(){
  clearInterval(ZRefer.checkTimer);ZRefer.checkTimer=null;
  if(S.v==='call'&&!isHost())ZRefer.checkTimer=setInterval(zrfCallCheck,1000);
  else if(ZRefer.card){clearTimeout(ZRefer.cardTimer);ZRefer.card=null}
}

Native.on('data.referral',data=>{ZRefer.data=data;if(S.v==='refer')r();zrfSchedulePromo()});
Native.on('referral.applied',data=>{
  if(data.requestId!==ZRefer.applying)return;
  const {requestId,...summary}=data;ZRefer.applying=0;ZRefer.applyError='';ZRefer.data=summary;
  appNotice(`You got ${zrfCoins(summary.friendBonusCoins)} coins for joining with a friend's code.`);
  if(S.v==='refer')r();
});
Native.on('referral.error',data=>{if(data.requestId!==ZRefer.applying)return;ZRefer.applying=0;ZRefer.applyError=data.message;if(S.v==='refer'){r();document.getElementById('zrf-code')?.focus()}});
// The Home pop-up needs the server's summary; ask for it once per session on the first visit to Home.
document.addEventListener('aurora:navigate',()=>{
  zrfWatchCall();
  if(S.v!=='home')zrfCancelPromo();
  if(S.v==='refer'){ZRefer.requested=true;zrfLoad();if(ZRefer.focusCode){ZRefer.focusCode=false;setTimeout(()=>document.getElementById('zrf-code')?.focus(),0)}}
  else if(S.v==='home'&&S.loggedIn&&!DEMO&&!ZRefer.requested){ZRefer.requested=true;Native.send('referral.load')}
});
// Once Home has its hosts on screen, a due pop-up follows.
const zrfPreviousAfterRender=ZimiHome.afterRender;
ZimiHome.afterRender=()=>{zrfPreviousAfterRender();if(S.v==='home')zrfSchedulePromo()};
ZimiPullRefresh.register('refer',{refresh:()=>zrfLoad(),busy:()=>contentPending('referral')});
['session.none','session.expired'].forEach(type=>Native.on(type,()=>{zrfCancelPromo();clearTimeout(ZRefer.cardTimer);clearInterval(ZRefer.checkTimer);zrfClosePromo();Object.assign(ZRefer,{data:null,demo:null,applying:0,applyError:'',card:null,checkTimer:null,requested:false});ZRefer.callShown.clear()}));
window.ZimiReferral={open:zrfOpen,load:zrfLoad,header:zrfHeader,render:zrfView,schedulePromo:zrfSchedulePromo};
window.zrfCallCard=zrfCallCard;
ZimiHome.views.refer=zrfView;
