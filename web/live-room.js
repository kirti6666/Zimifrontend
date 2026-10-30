/* Live rooms share the authenticated native transport and WebRTC media layer.
   Only the explicitly marked DEMO fixtures below simulate other people. */
const Room = {
  key: '', sheet: '', requests: [], ownRequestId: null, queueCount: 0,
  queueLoading: false, queueError: '', busy: false, transition: null,
  likes: 0, supporters: [], received: 0, gift: null, giftIds: new Set(), reactionIds: new Set(),
  giftMotion: null, giftTimer: null,
  goal: 17000, goalTitle: 'Studio Mic Upgrade', goalEnabled: false,
  draft: '', chatOpen: false, effects: 'original', playbackMuted: false, reactionAt: 0,
  startedAt: 0, confirm: '', focus: null, link: null, linkLoading: false, shareLink: ''
};
Object.assign(homeIcons, {
  callgrid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  callmore: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1 3 4 3 4-3 4-3M8 9h.01M16 9h.01"/>',
  queue: '<path d="M3 5h12M3 10h8M3 15h6M14 14h7m-3-3 3 3-3 3M3 20h12"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>',
  diamond: '<path d="m3 8 4-5h10l4 5-9 13zM3 8h18M7 3l5 18 5-18"/>',
  sliders: '<path d="M4 5h16M4 12h16M4 19h16"/><circle cx="9" cy="5" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="19" r="2"/>'
});
function zrIsCall(){return ['call','hcall','voice'].includes(S.v)}
function zrIsHost(){return S.v==='live'?Home.hosting:S.v==='hcall'}
function zrPerson(){const p=zrIsCall()?(S.v==='hcall'?S.caller:g(S.h)):(Home.hosting?me:g(S.h));return DEMO&&Home.hosting&&S.v==='live'?{...p,avatarUrl:OB_MEDIA[2],coverUrl:OB_MEDIA[2]}:p}
function zrEnsure(){
  const key=S.v==='live'?Home.stream?.id:(S.callId||'preview-call');
  if(!key||Room.key===key)return;
  zrClearGiftMotion();
  Room.shareLink='';
  Object.assign(Room,{key,sheet:'',requests:[],ownRequestId:null,queueCount:0,queueLoading:false,queueError:'',busy:false,likes:0,supporters:[],received:0,gift:null,giftIds:new Set(),reactionIds:new Set(),draft:'',chatOpen:false,playbackMuted:false,goalEnabled:false,confirm:'',effects:'original',startedAt:Date.parse(Home.stream?.createdAt)||Date.now()});
  if(DEMO&&S.v==='live')zrDemoRoom();
}
function zrAvatar(p,size=34){return avc(p||{n:'Viewer',seed:12},size)}
function zrRound(icon,label,action,extra=''){return `<button type="button" class="zr-round ${extra}" aria-label="${esc(label)}" onclick="${action}">${hi(icon,21)}</button>`}
function zrStatus(){return `${zrIsCall()?`<div class="zr-network" data-zimi-network role="status" aria-live="polite" hidden>${hi('signal',16)}<span>Poor connection</span></div>`:''}<p class="zh-media-status zr-status" role="status">${esc(Home.mediaStatus||(DEMO?'Design preview':'Connecting…'))}</p>`}
function zrIdentity(p,host,call){
  return `<header class="zr-header"><div class="zr-identity">${zrAvatar(p)}<div class="zr-person"><strong>${esc(p?.n||'Live creator')}</strong><span><i></i>${call?'PRIVATE CALL':'LIVE'}${host&&!call?' <b data-room-clock>00:00</b>':''}</span></div>${!host&&!call?`<button class="zr-follow ${S.following[p?.id]?'is-following':''}" onclick="toggleFollow('${domId(p?.id||'')}',event)" aria-label="${S.following[p?.id]?'Unfollow':'Follow'} ${esc(p?.n||'creator')}">${S.following[p?.id]?'Following':'+ Follow'}</button>`:''}</div><div class="zr-header-right">${call?`<span class="zr-pill zr-timer">${hi('lock',12)} <span id="ck">${clock(S.sec)}</span></span>`:host?`<button class="zr-pill zr-earnings" onclick="zrOpen('supporters')" aria-label="Session gifts">${hi('coin',13)} ${homeCompact(Room.received)}</button>`:''}${!call?`<button class="zr-pill zr-viewers" onclick="zrOpen('audience')" aria-label="Live viewers">${hi('eye',14)} <span data-room-viewers>${homeCompact(Home.stream.viewers)}</span></button>`:''}${zrRound('close',call?'End call':host?'End broadcast':'Leave live',"zrExit()",'zr-close')}</div></header>`;
}
function zrBackdrop(p,local,voice=false){return `<div class="zr-video ${local?'zr-local':''} ${voice?'zr-audio':''}" data-effect="${Room.effects}">${DEMO&&p?homeCover(p,true):''}${voice?`<div class="zr-voice">${zrAvatar(p,104)}<h2>${esc(p?.n||'Your connection')}</h2><span>Just you. Just a conversation.</span></div><audio data-zimi-remote autoplay></audio>`:`<video ${local?'data-zimi-local muted':'data-zimi-remote'} autoplay playsinline></video>`}${!voice&&!DEMO&&!zrIsCall()?'<div class="zr-video-wait">'+hi('vid',30)+'<span data-zimi-media-status>'+esc(Home.mediaStatus||'Connecting video…')+'</span></div>':''}<div class="zr-shade"></div></div>`}
function zrGiftBanner(){const gift=Room.gift;if(!gift)return '';const media=giftStillUrl(gift.giftName,gift.mediaUrl);return `<aside class="zr-gift-alert" role="status"><span class="zr-gift-emoji">${media?`<img src="${media}" alt="">`:esc(gift.emoji||'💎')}</span><div>${zrIsHost()?'<small>SUPER GIFT ALERT</small>':''}<strong>${esc(gift.name)} sent ${esc(gift.giftName)}</strong><span>${gift.sent?'':'+'}${n(gift.coins)} coins ${gift.sent?'sent':'received'}</span></div>${gift.combo>1?`<b class="zr-combo">COMBO<br>×${gift.combo}</b>`:''}</aside>`}
/* Keep the event's original clock across screen redraws. Negative animation delay
   resumes the celebration instead of replaying it when chat or controls change. */
function zrGiftCelebration(){
  const motion=Room.giftMotion,gift=Room.gift;
  if(!motion||!gift||motion.key!==Room.key)return '';
  const elapsed=Math.max(0,Date.now()-motion.at);
  if(elapsed>=motion.life)return '';
  const sticker=!!giftSticker(gift.giftName),media=giftMotionUrl(gift.giftName,gift.mediaUrl),large=!sticker&&gift.coins>=19999;
  return `<div class="zr-gift-celebration ${large?'is-large':''} ${sticker?'is-sticker':''}" aria-hidden="true" style="--gift-age:-${elapsed}ms;--gift-life:${motion.life}ms">
    <div class="zr-gift-halo"></div><div class="zr-gift-wave"></div>
    <div class="zr-gift-sparks">${Array.from({length:large?14:8},(_,i)=>`<i style="--spark-angle:${i*(large?360/14:45)}deg;--spark-distance:${large?115:86}px"></i>`).join('')}</div>
    <div class="zr-gift-stage-art">${media?`<img src="${media}" alt="">`:`<span>${esc(gift.emoji||'🎁')}</span>`}</div>
    <div class="zr-gift-caption"><strong>${esc(gift.giftName)}</strong><span>${esc(gift.name)} <b>+${n(gift.coins)}</b></span></div>
  </div>`;
}
function zrClearGiftMotion(){
  clearTimeout(Room.giftTimer);Room.giftTimer=null;Room.giftMotion=null;Room.gift=null;
  document.querySelectorAll('.zr-gift-celebration,.zr-gift-alert').forEach(el=>el.remove());
}
function zrStartGiftMotion(){
  clearTimeout(Room.giftTimer);
  const motion={key:Room.key,at:Date.now(),life:giftSticker(Room.gift.giftName)?4800:Room.gift.coins>=19999?3200:2400};
  Room.giftMotion=motion;
  Room.giftTimer=setTimeout(()=>{if(Room.giftMotion===motion)zrClearGiftMotion()},motion.life);
}
function zrSupporterStrip(){return `<div class="zr-supporters">${Room.supporters.slice(0,2).map((p,i)=>`<button onclick="zrOpen('supporters')">${zrAvatar({n:p.name,seed:i+18,avatarUrl:p.avatarUrl,gender:p.gender},23)}<b class="zr-rank">${i+1}</b><strong>${esc(p.name)}</strong><span>${homeCompact(p.coins)}</span></button>`).join('')}<button class="zr-explore" onclick="zrOpen('supporters')">${hi('cup',14)} Supporters ${hi('chev',12)}</button></div>`}
function zrGoal(){if(!Room.goalEnabled)return '';const percent=Math.min(100,Math.round(Room.received/Room.goal*100));return `<button class="zr-goal" onclick="zrOpen('goal')" aria-label="Edit session gift goal"><span>${hi('mic',15)}<strong>Goal: ${esc(Room.goalTitle)}</strong><small>${homeCompact(Room.received)} / ${homeCompact(Room.goal)} coins (${percent}%)</small></span><span class="zr-progress" role="progressbar" aria-label="Session gift goal" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><i style="width:${percent}%"></i></span></button>`}
function zrTool(icon,label,action,badge='',active=false){return `<button type="button" class="zr-tool ${active?'is-active':''}" onclick="${action}" aria-label="${esc(label)}" ${['Mute','Unmute','Camera off','Camera on'].includes(label)?`aria-pressed="${active}"`:''}><span>${hi(icon,21)}${badge?`<b>${esc(badge)}</b>`:''}</span><small>${esc(label)}</small></button>`}
function zrTools(){return `<aside class="zr-tools" aria-label="Broadcast controls">${zrTool('flip','Flip',"zrFlip()")}${zrTool(S.mic?'mic':'micoff',S.mic?'Mute':'Unmute',"zrMic()",'',!S.mic)}${zrTool(S.cam?'vid':'camoff',S.cam?'Camera off':'Camera on',"zrCamera()",'',!S.cam)}${zrTool('queue','Queue',"zrOpen('queue')",Room.queueCount||'')}${zrTool('sliders','Settings',"zrOpen('settings')")}</aside>`}
function zrPrivateCallPrice(){const rate=Number(g(S.h)?.rate);return !zrIsHost()&&Number.isFinite(rate)&&rate>=0?(rate?`${n(rate)} coins/min`:'Free'):'Current call rate'}
function zrRequestBar(){return `<div class="zr-request-bar"><span class="zr-request-icon">${hi('bolt',20)}</span><div><strong>1-on-1 Call Ready <b>${zrPrivateCallPrice()}</b></strong><span>${Room.ownRequestId?'Your request is in the queue':Room.queueLoading?'Loading queue…':`Queue is open · ${Room.queueCount} waiting`}</span></div><button class="zr-pink" onclick="${Room.ownRequestId?"zrOpen('queue')":"zrRequest()"}" ${Room.busy?'disabled':''}>${hi(Room.ownRequestId?'queue':'vid',16)} ${Room.busy?'Sending…':Room.ownRequestId?'Requested':'Request'}</button></div>`}
function zrMessageHTML(){return Home.messages.slice(-40).map(m=>`<p class="zr-message ${(!!m.userId&&m.userId===Home.stream?.hostId)||m.host?'zr-host-message':''}">${m.host||(!!m.userId&&m.userId===Home.stream?.hostId)?'<span class="zr-tag">HOST</span>':m.vip&&DEMO?'<span class="zr-tag">VIP</span>':''}<b>${esc(m.name||'Viewer')}</b><span>${escChat(m.text)}</span></p>`).join('')}
function zrPaintMessages(){const feed=document.getElementById('home-room-messages');if(feed){feed.innerHTML=zrMessageHTML();feed.scrollTop=feed.scrollHeight}}
function zrChat(call,host){return `<form class="zr-chat" onsubmit="event.preventDefault();zrSendMessage()"><div class="zr-compose">${hi('chat',15)}<input id="${call?'rmsg':'home-stream-message'}" maxlength="500" autocomplete="off" value="${esc(Room.draft)}" oninput="Room.draft=this.value;zrDraftChanged()" placeholder="${host?'Say something to chat':'Send a friendly chat…'}" aria-label="${call?'Call message':'Live chat message'}"><button type="button" onclick="zrOpen('emoji')" aria-label="Add emoji">${hi('smile',19)}</button><button class="zr-send ${Room.draft.trim()?'has-draft':''}" aria-label="Send message">${hi('send',18)}</button></div>${!call&&host?zrRound('queue','Manage call requests',"zrOpen('queue')",'zr-queue-button') : !call?zrRound('vid','Request private video call',"zrRequest()") : ''}${!host?`<button type="button" class="zr-round zr-gift-button" onclick="homeGifts('${domId(zrPerson()?.id||'')}')" aria-label="Send a gift"><span>Gifts</span>${hi('gift',22)}</button>`:''}${!call&&!host?zrRound('heart','Send heart',"zrReact()",'zr-heart-button'):''}${!call?zrRound('share','Share live',"zrOpen('share')"):''}</form>`}
function zrHostQueue(){const request=Room.requests[0];return `${request?`<aside class="zr-incoming">${hi('vid',22)}<div><strong>${esc(request.name)}</strong><span>Requested a 1-on-1 private video call</span></div><button class="zr-pink" onclick="zrAccept('${domId(request.id)}')" ${Room.busy?'disabled':''}>${Room.busy?'Connecting…':'Accept'}</button></aside>`:''}<button class="zr-manage" onclick="zrOpen('queue')"><strong>1-on-1 Video Calls</strong><span>Private video calls</span><b>Manage ${hi('chev',12)}</b></button>`}
function zrLive(){
  if(!Home.stream)return '<div class="zh-empty"><h3>This live has ended.</h3><button onclick="go(\'home\')">Back to Home</button></div>';
  zrEnsure();const host=Home.hosting,p=zrPerson();
  return `<section class="zh-room zr-room ${host?'zr-host':'zr-viewer'}" aria-label="${host?'Your live broadcast':'Live broadcast'}">${zrBackdrop(p,host)}<div class="zr-top">${host?'<div class="zr-diagnostics"><span><i></i><i></i><i></i><i></i> LIVE STUDIO</span><b data-room-quality>Camera ready</b></div>':''}${zrIdentity(p,host,false)}${host?zrSupporterStrip()+zrGoal():zrRequestBar()}${zrGiftBanner()}${host?zrStatus():''}</div>${host?zrTools():''}<div class="zr-floating-hearts" aria-hidden="true"></div><div class="zr-bottom">${!host?zrStatus():''}<div class="zr-messages" id="home-room-messages" role="log" aria-label="Live chat" aria-live="polite">${zrMessageHTML()}</div>${host?zrHostQueue():''}${zrChat(false,host)}${DEMO?'<span class="zr-demo-note">Interactive preview · sample activity</span>':''}</div>${zrGiftCelebration()}${zrSheet()}${homeGiftSheet()}</section>`;
}
/* The open call's price and cost so far, billed like the server: whole seconds at the price locked when it was placed. */
function zrCallCost(host){const rate=S.callRate||0;if(!rate)return 'Free call';const coins=Math.ceil(S.sec*rate/60);return `${n(rate)}/min · ${n(coins)} coins${host?' earned':S.bal<rate?' · under a minute left':''}`}
function zrCallStats(){return `<div class="zr-call-stats"><div class="zr-call-stat"><span class="zr-stat-icon">${hi('ph',19)}</span><div><span class="zr-stat-label">CALL RATE</span><strong>${S.callRate?`${coinIcon(14)} ${n(S.callRate)} <small>/ min</small>`:'Free call'}</strong><span class="zr-stat-track" aria-hidden="true"><i></i></span></div></div></div>`}
function zrCallTopup(){if(!zrIsCall()||zrIsHost())return;homeGifts(zrPerson()?.id);homeGiftTopup()}
function zrCallChat(){Room.chatOpen=!Room.chatOpen;r();if(Room.chatOpen)document.getElementById('rmsg')?.focus();else document.querySelector('.zr-call-chat-toggle')?.focus({preventScroll:true})}
function zrCallComposer(){return `<form class="zr-chat zr-call-composer" id="zr-call-composer" onsubmit="event.preventDefault();zrSendMessage()"><div class="zr-compose"><input id="rmsg" maxlength="500" autocomplete="off" value="${esc(Room.draft)}" oninput="Room.draft=this.value;zrDraftChanged()" placeholder="Say something…" aria-label="Call message"><button type="button" onclick="zrOpen('emoji')" aria-label="Add emoji">${hi('smile',19)}</button><button class="zr-send ${Room.draft.trim()?'has-draft':''}" aria-label="Send message">${hi('send',18)}</button></div>${zrRound('close','Close call chat','zrCallChat()')}</form>`}
/* A host starts with their own camera on the main stage, as in the setup preview.
   Swapping changes only the two media elements' placement, never their tracks. */
function zrHostStage(p,voice){
  if(voice)return zrBackdrop(p,false,true);
  const localMain=!S.swap,localPip=!!S.swap;
  return `<div class="zr-video zr-reference-stage ${localMain?'zr-local':''} ${localMain&&!S.cam?'camera-off':''}">${localMain?hcStageVideo():'<video data-zimi-remote autoplay playsinline></video>'}${localMain&&!S.cam?`<div class="zr-camera-off">${hcIdentityAvatar(me,104)}<span>Camera off</span></div>`:''}<div class="zr-shade"></div></div>
    <button type="button" class="zr-pip ${localPip&&!S.cam?'camera-off':''}" aria-label="Swap videos" onclick="S.swap=!S.swap;r()"><video ${localPip?'data-zimi-local muted':'data-zimi-remote'} autoplay playsinline></video>${localPip&&!S.cam?hi('camoff',21):''}<span>${localPip?'You':esc(first(p.n))}${localPip&&!S.mic?hi('micoff',12):''}</span></button>`;
}
function zrHostReferenceCall(p,voice){
  return `<section class="zh-room zr-room zr-call zr-call-reference ${voice?'zr-voice-call':''}" aria-label="Private ${voice?'voice':'video'} call">${zrHostStage(p,voice)}
    <div class="zr-top"><header class="zr-call-toolbar">
      ${backButton('zrExit()',{label:'Leave call',slot:'zr-call-back'})}
      <div class="zr-host-clock"><span class="zr-timer"><i aria-hidden="true"></i><span id="ck">${clock(S.sec)}</span></span><span class="zr-clock-divider" aria-hidden="true"></span>${hcVisPill()}</div>
      <span class="zr-session-earned" title="${n(Math.round(S.earned||0))} coins this session"><small>This session</small><b id="earn">${coinIcon(14)}+${kfmt(Math.round(S.earned||0))}</b></span>
      ${zrRound('callmore','Call options',"zrOpen('host-options')",'zr-host-more')}
    </header><div class="zr-call-stats">${typeof hsTargets==='function'?hsTargets():''}</div>${hcFeeChip()}${zrGiftBanner()}</div>
    <div class="zr-bottom">${zrStatus()}<div id="rfeed" class="zr-call-feed" role="log" aria-label="Call chat" aria-live="polite"></div>
      ${typeof hsGiftRail==='function'?hsGiftRail():''}${Room.chatOpen?zrCallComposer():''}
      <div class="zr-call-dock"><button type="button" class="zr-round zr-call-chat-toggle ${Room.chatOpen?'is-active':''}" onclick="zrCallChat()" aria-label="${Room.chatOpen?'Hide':'Open'} call chat" aria-expanded="${Room.chatOpen}" aria-controls="zr-call-composer">${hi('chat',21)}</button>
        <div class="zr-call-person">${hcIdentityAvatar(p,38)}<div><strong>${esc(p.n)}</strong></div></div>
        <button type="button" class="zr-call-target" onclick="hsOpenSheet('gift-target')" aria-label="Choose gift target">${hi('plus',15)}</button>
        <button type="button" class="zr-hangup" onclick="hostEnd('end')" aria-label="End call">${hi('ph',23)}</button>
        ${zrRound('gift','Gift target',"hsOpenSheet('gift-target')",'zr-dock-controls')}
      </div>${DEMO?'<span class="zr-demo-note">Design preview · sample call</span>':''}
    </div>${zrGiftCelebration()}${zrSheet()}${typeof hsSheet==='function'?hsSheet():''}${hcCallExtras()}</section>`;
}
function zrHostOptions(){
  const voice=!!zrPerson()?.voice,effect=typeof HostStudio!=='undefined'?HostStudio.previewEffect:'original';
  return `<div class="zr-options-backdrop" onclick="if(event.target===this)zrClose()"><section class="zr-host-options" role="dialog" aria-modal="true" aria-label="Call options">
    ${!voice?`<button type="button" onclick="Room.sheet='';hsOpenSheet('appearance')" aria-label="Beauty and filters">${hi('star',17)}<span>Beauty &amp; filters</span><em>${effect==='original'?'Off':effect[0].toUpperCase()+effect.slice(1)}</em></button>`:''}
    <button type="button" onclick="zrMic()" aria-label="${S.mic?'Mute microphone':'Unmute microphone'}" aria-pressed="${!S.mic}">${hi(S.mic?'mic':'micoff',17)}<span>${S.mic?'Mute':'Unmute'}</span><em class="${S.mic?'is-on':'is-off'}">${S.mic?'Mic on':'Muted'}</em></button>
    ${!voice?`<button type="button" onclick="zrCamera()" aria-label="${S.cam?'Turn camera off':'Turn camera on'}" aria-pressed="${!S.cam}">${hi(S.cam?'vid':'camoff',17)}<span>${S.cam?'Turn camera off':'Turn camera on'}</span><em class="${S.cam?'is-on':'is-off'}">${S.cam?'On':'Off'}</em></button>`:''}
    ${voice?`<button type="button" onclick="zrSound()" aria-label="${Room.playbackMuted?'Unmute caller':'Mute caller'}">${hi(Room.playbackMuted?'micoff':'mic',17)}<span>${Room.playbackMuted?'Unmute caller':'Mute caller'}</span><em class="${Room.playbackMuted?'is-off':'is-on'}">${Room.playbackMuted?'Muted':'On'}</em></button>`:''}
  </section></div>`;
}
function zrCall(host){
  zrEnsure();const p=zrPerson(),voice=S.v==='voice'||!!p?.voice;
  if(!p)return '<div class="zh-empty">This call has ended.<button onclick="go(\'home\')">Back to Home</button></div>';
  if(host)return zrHostReferenceCall(p,voice);
  return `<section class="zh-room zr-room zr-call zr-sender-call ${voice?'zr-voice-call':''}" aria-label="Private ${voice?'voice':'video'} call">${zrBackdrop(p,false,voice)}
    <div class="zr-top"><header class="zr-call-toolbar">${backButton('zrExit()',{label:'Leave call',slot:'zr-call-back'})}<span class="zr-pill zr-timer"><i aria-hidden="true"></i><span id="ck">${clock(S.sec)}</span></span><span class="zr-call-private">${hi('shield',12)} Private</span>${zrRound('callmore','Call options',"zrOpen('call-controls')")}</header>${window.zrfCallCard?.()||''}${zrCallStats()}${zrGiftBanner()}</div>
    ${!voice?`<div class="zr-pip ${camOn()?'':'camera-off'}"><video data-zimi-local autoplay muted playsinline></video>${!camOn()?hi('camoff',21):''}<span>You ${!S.mic?hi('micoff',12):''}</span></div>`:''}
    <div class="zr-bottom">${zrStatus()}<div class="zr-call-cost" id="zr-call-cost">${zrCallCost(false)}</div><div id="rfeed" class="zr-call-feed" role="log" aria-label="Call chat" aria-live="polite"></div>${Room.chatOpen?zrCallComposer():''}
      <div class="zr-call-dock"><button type="button" class="zr-round zr-call-chat-toggle ${Room.chatOpen?'is-active':''}" onclick="zrCallChat()" aria-label="${Room.chatOpen?'Hide':'Open'} call chat" aria-expanded="${Room.chatOpen}" aria-controls="zr-call-composer">${hi('chat',21)}</button>
        <div class="zr-call-person">${zrAvatar(p,36)}<div><strong>${esc(p.n)}</strong><span>${coinIcon(14)} <span data-call-balance>${contentBalance()}</span> <small>Your coins</small></span></div></div>
        <button type="button" class="zr-call-topup" onclick="zrCallTopup()" aria-label="Add coins">${hi('plus',16)}</button>
        <button type="button" class="zr-hangup" onclick="endCall()" aria-label="End call">${hi('ph',23)}</button>
        ${zrRound('gift','Send a gift',`homeGifts('${domId(p.id)}')`,'zr-call-gift')}
      </div>${DEMO?'<span class="zr-demo-note">Design preview · sample call</span>':''}
    </div>${zrGiftCelebration()}${zrSheet()}${homeGiftSheet()}</section>`;
}
function zrOpen(sheet){Room.sheet=sheet;if(sheet==='queue')zrLoadQueue();r()}
function zrClose(){Room.sheet='';Room.confirm='';S.confirm=0;r()}
function zrSheet(){
  const sheet=Room.sheet;if(!sheet)return '';const host=zrIsHost();let title='',content='';
  if(sheet==='host-options')return zrHostOptions();
  if(sheet==='call-controls'){
    const voice=S.v==='voice'||!!zrPerson()?.voice;
    title='Call controls';content=`<p class="zr-sheet-note">Just the two of you. Manage your microphone${voice?'':' and camera'} during this call.</p><div class="zr-call-controls">${zrTool(S.mic?'mic':'micoff',S.mic?'Mute':'Unmute',"zrMic()",'',!S.mic)}${!voice?zrTool(camOn()?'vid':'camoff',camOn()?'Camera off':'Camera on',"zrCamera()",'',!camOn())+zrTool('flip','Flip camera',"zrFlip()"):''}${zrTool(Room.playbackMuted?'micoff':'vol',Room.playbackMuted?'Sound on':'Sound off',"zrSound()",'',Room.playbackMuted)}</div><button class="zr-wide zr-danger" onclick="zrExit()">End call</button>`;
  }else if(sheet==='queue'){
    title=host?'1-on-1 call requests':'Your private call';
    content=`<p class="zr-sheet-note">${host?'Accepting a request ends your public live and starts a private video call.':'Your host will accept when they’re ready. The public live ends when the private call starts.'} ${host?'The current coin rate applies.':zrPrivateCallPrice()==='Free'?'This call is free.':zrPrivateCallPrice()+', with a one-minute minimum.'}</p>`;
    if(Room.queueLoading)content+=contentSkeleton('rows','Loading call requests',2);
    else if(Room.queueError)content+=`<div class="zh-error" role="alert">${esc(Room.queueError)}<button onclick="zrLoadQueue();r()">Retry</button></div>`;
    else if(host)content+=Room.requests.length?Room.requests.map((q,i)=>`<div class="zr-queue-row">${zrAvatar({n:q.name,seed:i+18,avatarUrl:q.avatarUrl,gender:q.gender},40)}<div><strong>${esc(q.name)}</strong><small>#${i+1} in queue · Video call</small></div><button class="zr-decline" onclick="zrDecline('${domId(q.id)}')" aria-label="Decline ${esc(q.name)}" ${Room.busy?'disabled':''}>${hi('close',18)}</button><button class="zr-pink" onclick="zrAccept('${domId(q.id)}')" ${Room.busy?'disabled':''}>Accept</button></div>`).join(''):'<div class="zr-empty">'+hi('queue',32)+'<strong>You’re all caught up</strong><p>Private call requests will appear here.</p></div>';
    else content+=Room.ownRequestId?`<div class="zr-empty">${hi('vid',34)}<strong>Request sent</strong><p>You can keep enjoying the live while you wait.</p></div><button class="zr-wide zr-secondary" onclick="zrCancel()" ${Room.busy?'disabled':''}>Cancel request</button>`:`<button class="zr-wide zr-pink" onclick="zrRequest()" ${Room.busy?'disabled':''}>${hi('vid',18)} Request a private video call</button>`;
  }else if(sheet==='settings'){
    title='Live studio';content=`<div class="zr-setting-row"><div><strong>Microphone</strong><small>${S.mic?'Your audience can hear you':'Your microphone is muted'}</small></div><button class="zr-secondary" onclick="zrMic()">${S.mic?'Mute':'Unmute'}</button></div><div class="zr-setting-row"><div><strong>Camera</strong><small>${S.cam?'Your camera is on':'Your camera is off'}</small></div><button class="zr-secondary" onclick="zrCamera()">${S.cam?'Turn off':'Turn on'}</button></div><button class="zr-wide zr-secondary" onclick="zrOpen('goal')">${hi('gift',18)} Set a session gift goal</button><button class="zr-wide zr-secondary" onclick="zrOpen('appearance')">${hi('sliders',18)} Camera preview appearance</button><button class="zr-wide zr-danger" onclick="zrExit()">End broadcast</button>`;
  }else if(sheet==='appearance'){
    title='Your camera preview';content=`<p class="zr-sheet-note">Choose a look for your own preview. Your audience sees your original camera video.</p><div class="zr-effects">${['original','warm','soft','mono'].map(e=>`<button class="${Room.effects===e?'selected':''}" onclick="Room.effects='${e}';r()">${hi('sparkle',22)}<span>${e[0].toUpperCase()+e.slice(1)}</span></button>`).join('')}</div>`;
  }else if(sheet==='goal'){
    title='Your session goal';content=`<p class="zr-sheet-note">Track gifts received during this live on your studio screen.</p><form onsubmit="event.preventDefault();zrSaveGoal()"><label>What are you working toward?<input id="zr-goal-title" maxlength="48" value="${esc(Room.goalTitle)}" required></label><label>Goal in coins<input id="zr-goal-amount" type="number" min="1" max="100000000" value="${Room.goal}" required></label><button class="zr-wide zr-pink">Save goal</button>${Room.goalEnabled?'<button type="button" class="zr-wide zr-secondary" onclick="Room.goalEnabled=false;zrClose()">Hide goal</button>':''}</form>`;
  }else if(sheet==='supporters'){
    title='Session supporters';content=`<p class="zr-sheet-note">A little appreciation goes a long way. Gifts received since you joined this room.</p>${Room.supporters.length?Room.supporters.map((p,i)=>`<div class="zr-supporter-row"><b>${i+1}</b>${zrAvatar({n:p.name,seed:i+18,avatarUrl:p.avatarUrl,gender:p.gender},38)}<strong>${esc(p.name)}</strong><span>${hi('coin',15)} ${n(p.coins)}</span></div>`).join(''):'<div class="zr-empty">'+hi('gift',34)+'<strong>Make the first moment</strong><p>Supporters appear here when a gift arrives.</p></div>'}`;
  }else if(sheet==='audience'){
    title='Together, live';content=`<div class="zr-empty">${hi('people',36)}<strong>${n(Home.stream?.viewers||0)} watching now</strong><p>${n(Room.likes)} hearts received since you joined.</p></div>${!host?`<button class="zr-wide zr-pink" onclick="zrReact()">${hi('heart',18)} Send some love</button>`:''}`;
  }else if(sheet==='emoji'){
    title='A little expression';content=`<div class="zr-emoji-grid">${['💗','✨','🔥','🌹','👏','😍','🎶','😂','🙌','💎','🥰','🎉'].map(e=>`<button onclick="zrEmoji('${e}')" aria-label="Add ${e}">${e}</button>`).join('')}</div>`;
  }else if(sheet==='share'){
    title='Good moments are shared';content=`<p class="zr-sheet-note">Invite someone to join ${esc(zrPerson()?.n||'your creator')} live.</p><button class="zr-wide zr-pink" onclick="zrShare()">${hi('share',18)} Share this live</button>${DEMO?`<button class="zr-wide zr-secondary" onclick="zrShare(true)">${hi('copy',18)} Copy link</button>`:''}${Room.shareLink?`<input aria-label="Live invite link" readonly value="${esc(Room.shareLink)}" onclick="this.select()">`:''}<p id="zr-share-status" class="zr-sheet-note" role="status"></p>`;
  }else if(sheet==='exit'){
    title=zrIsCall()?'End this call?':host?'End your live?':'Leave this live?';content=`<p class="zr-sheet-note">${zrIsCall()?'Your private conversation will end for both of you.':host?'Your viewers will be disconnected and pending call requests will close.':'You can rejoin while the creator is still live.'}</p><button class="zr-wide zr-danger" onclick="zrExitNow()">${zrIsCall()?'End call':host?'End broadcast':'Leave live'}</button><button class="zr-wide zr-secondary" onclick="zrClose()">Stay here</button>`;
  }
  return `<div class="zr-sheet-backdrop" onclick="if(event.target===this)zrClose()"><section class="zr-sheet" role="dialog" aria-modal="true" aria-label="${title}" data-lenis-prevent><div class="zr-sheet-handle"></div><header><h2>${title}</h2>${zrRound('close','Close panel',"zrClose()")}</header>${content}</section></div>`;
}
function zrSaveGoal(){const title=document.getElementById('zr-goal-title').value.trim(),amount=Number(document.getElementById('zr-goal-amount').value);if(!title||!Number.isInteger(amount)||amount<1||amount>100000000)return;Room.goalTitle=title;Room.goal=amount;Room.goalEnabled=true;zrClose()}
function zrExit(){if(S.v==='hcall'&&hcFeePending()){Room.sheet='';return hostEnd('end')}Room.sheet='exit';r()}
function zrExitNow(){Room.sheet='';Room.transition=null;zrIsCall()?endCall():homeLeaveStream()}
function zrMic(){S.mic=S.mic?0:1;window.ZimiMedia?.attach();r()}
function zrCamera(){if(S.v==='live')S.cam=S.cam?0:1;else if(isHost())S.cam=S.cam?0:1;else S.scam=S.scam?0:1;window.ZimiMedia?.attach();r()}
async function zrFlip(){if(DEMO){Room.demoFacing=Room.demoFacing==='environment'?'user':'environment';appNotice('Camera flipped in preview');return}try{await window.ZimiMedia.flipCamera();r()}catch(error){appNotice(error.message)}}
function zrSound(){Room.playbackMuted=!Room.playbackMuted;window.ZimiMedia?.setPlaybackMuted(Room.playbackMuted);r()}
function zrDraftChanged(){document.querySelector('.zr-send')?.classList.toggle('has-draft',!!Room.draft.trim())}
function zrSendMessage(){
  const input=document.getElementById(zrIsCall()?'rmsg':'home-stream-message');if(!input?.value.trim())return;
  if(zrIsCall())rsay();else homeSendStreamMessage();Room.draft='';const next=document.getElementById(zrIsCall()?'rmsg':'home-stream-message');if(next){next.value='';next.focus()}zrDraftChanged();
}
function zrEmoji(emoji){Room.draft=(Room.draft+emoji).slice(0,500);Room.sheet='';r();document.getElementById(zrIsCall()?'rmsg':'home-stream-message')?.focus()}
function zrLoadQueue(){if(!Home.stream)return;if(DEMO)return;Room.queueLoading=true;Room.queueError='';Native.send('stream.requests.load',{streamId:Home.stream.id})}
function zrRequest(){if(!Home.stream||Home.hosting||Room.busy)return;if(Room.ownRequestId)return zrOpen('queue');Room.busy=true;if(DEMO){Room.ownRequestId='preview-own';Room.requests=[{id:'preview-own',name:'You',userId:'preview-you',status:'pending'}];Room.queueCount++;Room.busy=false;Room.sheet='queue';r();return}Native.send('stream.request',{streamId:Home.stream.id});r()}
function zrCancel(){if(!Home.stream||!Room.ownRequestId||Room.busy)return;Room.busy=true;if(DEMO){Room.ownRequestId=null;Room.requests=[];Room.queueCount=Math.max(0,Room.queueCount-1);Room.busy=false;r();return}Native.send('stream.request.cancel',{streamId:Home.stream.id,id:Room.ownRequestId});r()}
function zrDecline(id){if(!Home.stream||!Home.hosting||Room.busy)return;if(DEMO){Room.requests=Room.requests.filter(x=>x.id!==id);Room.queueCount=Room.requests.length;r();return}Room.busy=true;Native.send('stream.request.decline',{streamId:Home.stream.id,id});r()}
function zrAccept(id){if(!Home.stream||!Home.hosting||Room.busy||!isApprovedHost())return;Room.busy=true;if(DEMO){const q=Room.requests.find(x=>x.id===id);if(!q)return;Home.stream=null;Home.messages=[];Home.hosting=false;Room.sheet='';Room.busy=false;S.caller={id:q.userId,n:q.name,seed:17,callId:'preview-private-call',avatarUrl:OB_MEDIA[1]};S.callId='preview-private-call';S.cam=1;S.mic=1;go('hcall');return}Native.send('stream.request.accept',{streamId:Home.stream.id,id});r()}
function zrHeart(){const box=document.querySelector('.zr-floating-hearts');if(!box)return;const el=document.createElement('span');el.textContent=['💗','💖','💕'][Room.likes%3];el.style.setProperty('--heart-x',`${(Room.likes*13)%30-15}px`);box.appendChild(el);setTimeout(()=>el.remove(),2300)}
function zrReact(){if(!Home.stream||Home.hosting||Date.now()-Room.reactionAt<450)return;Room.reactionAt=Date.now();if(DEMO){Room.likes++;zrHeart()}else Native.send('stream.react',{streamId:Home.stream.id})}
function zrShareUrl(){const url=new URL(location.href);url.search='';url.hash='';if(DEMO)url.searchParams.set('preview','live');else if(Home.stream)url.searchParams.set('stream',Home.stream.id);return url.href}
async function zrShare(copy=false){if(!DEMO){if(Home.stream)Native.send('stream.share',{streamId:Home.stream.id});return}const status=document.getElementById('zr-share-status'),url=zrShareUrl();try{if(!copy&&navigator.share)await navigator.share({title:Home.stream?.title||'BinzoLive',text:`Join ${zrPerson()?.n||'me'} live on BinzoLive`,url});else{if(!navigator.clipboard?.writeText)throw new Error('Copy is unavailable here. Open this live in your browser to share its address.');await navigator.clipboard.writeText(url);if(status)status.textContent='Link copied. Invite someone to join you.'}}catch(error){if(error.name!=='AbortError'&&status)status.textContent=error.message||'Sharing is unavailable on this device.'}}
function zrCapture(){const input=document.activeElement;if(input&&['rmsg','home-stream-message'].includes(input.id)){Room.draft=input.value;return {id:input.id,start:input.selectionStart,end:input.selectionEnd}}return null}
function zrAfter(focus){
  zrLinkSheet();
  const room=document.querySelector('.zr-room');document.documentElement.classList.toggle('zr-active',!!room);if(!room)return;
  if(focus&&!Room.sheet&&!Home.giftTo){const input=document.getElementById(focus.id);if(input){input.value=Room.draft;input.focus({preventScroll:true});input.setSelectionRange(focus.start,focus.end)}}
  const sheet=document.querySelector('.zr-sheet,.zr-host-options');if(sheet&&!sheet.contains(document.activeElement))sheet.querySelector('button,input')?.focus({preventScroll:true});
  const feed=document.getElementById('home-room-messages');if(feed)feed.scrollTop=feed.scrollHeight;
  zrUpdateDiagnostics();
}
function zrUpdateDiagnostics(){
  const clockEl=document.querySelector('[data-room-clock]');if(clockEl)clockEl.textContent=clock(Math.max(0,Math.floor((Date.now()-Room.startedAt)/1000)));
  const video=document.querySelector('.zr-video>video'),quality=document.querySelector('[data-room-quality]');
  if(quality)quality.textContent=video?.videoHeight?`${video.videoWidth} × ${video.videoHeight}`:DEMO?'PREVIEW':S.cam?'Connecting camera':'Camera off';
  document.querySelector('.zr-video-wait')?.classList.toggle('is-ready',!!video?.srcObject&&video.readyState>=2);
}
setInterval(()=>{if(S.v==='live'||zrIsCall())zrUpdateDiagnostics()},1000);
Native.on('stream.opened',()=>{zrEnsure();zrLoadQueue()});
Native.on('stream.requests',d=>{if(Home.stream?.id!==d.streamId)return;Room.requests=d.requests||[];Room.ownRequestId=d.ownRequestId||null;Room.queueCount=d.count||0;Room.queueLoading=false;Room.queueError='';Room.busy=false;if(S.v==='live')r()});
Native.on('stream.request.updated',d=>{if(Home.stream?.id!==d.streamId)return;Room.busy=false;if(d.request?.status==='declined'&&d.request.id===Room.ownRequestId)appNotice('The host couldn’t take your call this time.');zrLoadQueue()});
Native.on('stream.reaction',d=>{if(Home.stream?.id!==d.streamId||d.id&&Room.reactionIds.has(d.id))return;if(d.id){Room.reactionIds.add(d.id);if(Room.reactionIds.size>500)Room.reactionIds.delete(Room.reactionIds.values().next().value)}Room.likes++;zrHeart()});
Native.on('stream.gift',d=>{if(Home.stream?.id!==d.streamId)return;zrReceiveGift(d)});
function zrReceiveGift(d){
  if(!zrIsCall()&&S.v!=='live')return;
  if(zrIsCall()&&d.callId&&d.callId!==S.callId)return;
  zrEnsure();
  const id=d.id||d._id||d.transactionId;if(id&&Room.giftIds.has(id))return;if(id){Room.giftIds.add(id);if(Room.giftIds.size>500)Room.giftIds.delete(Room.giftIds.values().next().value)}
  const coins=Number(d.totalCoins??d.coins??d.amount)||0,gift=typeof d.gift==='object'?d.gift:null;
  const name=d.senderName||d.from?.name||d.sender?.name||d.name||'A supporter',userId=d.senderId||d.from?.id||d.from||d.sender?.id||name;
  const previous=Room.gift;Room.gift={name,sent:userId==='you',giftName:d.giftName||gift?.name||(typeof d.gift==='string'?d.gift:'a gift'),emoji:d.emoji||gift?.emoji||'🎁',mediaUrl:d.mediaUrl||gift?.mediaUrl,coins,combo:previous?.name===name?previous.combo+1:1};
  Room.received+=coins;let p=Room.supporters.find(x=>x.id===userId);if(p)p.coins+=coins;else Room.supporters.push({id:userId,name,coins,avatarUrl:d.senderAvatarUrl||d.sender?.avatarUrl,gender:d.senderGender||d.sender?.gender});Room.supporters.sort((a,b)=>b.coins-a.coins);
  if(zrIsCall()){S.rmsgs.push(['gift',name,`sent ${Room.gift.emoji} ${Room.gift.giftName}`]);if(S.v==='hcall'){S.earned=(S.earned||0)+coins;S.recvN=(S.recvN||0)+1;S.gifted=(S.gifted||0)+coins}}
  if(S.v==='hcall'&&userId!=='you'&&typeof hsReceiveGift==='function')hsReceiveGift(d);
  zrStartGiftMotion();
  if(S.v==='live'||zrIsCall())r();
}
Native.on('gift.received',d=>{if(zrIsCall())zrReceiveGift(d)});
Native.on('data.catalog',()=>{if(zrIsCall())r()});
Native.on('stream.shareLink',d=>{if(Home.stream?.id!==d.streamId)return;Room.shareLink=d.url;if(Room.sheet==='share')r()});
Native.on('stream.link.loading',d=>{Room.linkLoading=!!d.loading;zrLinkSheet()});
Native.on('stream.link',d=>{Room.linkLoading=false;Room.link=d.stream;zrLinkSheet()});
Native.on('operation.error',d=>{if(d.action==='stream.link'){Room.linkLoading=false;zrLinkSheet()}if(d.action==='stream.share'){const el=document.getElementById('zr-share-status');if(el)el.textContent=d.message||'Could not share this live.'}});
function zrLinkDismiss(){Room.link=null;Room.linkLoading=false;document.getElementById('zr-link-overlay')?.remove()}
function zrLinkSheet(){
  document.getElementById('zr-link-overlay')?.remove();if(!window.ZIMI_LIVE_STREAMING_ENABLED||!Room.link&&!Room.linkLoading)return;
  const stream=Room.link,busy=zrIsCall()||S.v==='live',ended=stream&&stream.status!=='live';
  const el=document.createElement('div');el.id='zr-link-overlay';el.className='zr-sheet-backdrop zr-link-overlay';el.innerHTML=`<section class="zr-sheet" role="dialog" aria-modal="true" aria-label="Live invitation"><div class="zr-sheet-handle"></div><header><h2>You're invited</h2>${zrRound('close','Dismiss invitation','zrLinkDismiss()')}</header>${Room.linkLoading?contentSkeleton('rows','Loading live invitation',2):`<p class="zr-sheet-note">${esc(stream.host?.name||'A creator')} invited you to a live.</p><h3>${esc(stream.title)}</h3><p class="zr-sheet-note">${ended?'This live session has ended.':busy?'Finish your current session to join this live.':`${n(stream.viewers)} watching · Join the conversation.`}</p><button class="zr-wide zr-pink" onclick="zrJoinLink()" ${ended||busy?'disabled':''}>${hi('play',18)} Join live</button>`}</section>`;document.body.appendChild(el);el.querySelector('button')?.focus({preventScroll:true});
}
function zrJoinLink(){const stream=Room.link;if(!stream||stream.status!=='live'||zrIsCall()||S.v==='live')return;const host=homeRemember({...stream.host,id:stream.hostId,name:stream.host?.name||'Live creator',stream});zrLinkDismiss();homeOpen(host.id)}
Native.on('operation.error',d=>{if(d.action?.startsWith('stream.request')){Room.busy=false;Room.queueLoading=false;Room.queueError=d.message||'Could not update the call queue.';if(S.v==='live')r()}});
Native.on('stream.privateCall',async d=>{
  if(!window.ZIMI_LIVE_STREAMING_ENABLED)return;
  if(Room.transition===d.callId||S.callId===d.callId)return;
  if(Home.stream?.id!==d.streamId){Native.send('call.end',{callId:d.callId,reason:'left_room'});return}
  const host=Home.hosting;Room.transition=d.callId;Home.stream=null;Home.hosting=false;Home.pendingClose=null;Home.messages=[];Room.sheet='';Room.busy=false;window.ZimiMedia.stop();S.callId=d.callId;S.mic=1;S.cam=1;S.scam=1;Home.mediaStatus='Preparing your private call…';
  S.callRate=d.rate||0;
  if(host)S.caller={id:d.peerId,n:d.peer?.name||'Viewer',avatarUrl:d.peer?.avatarUrl,gender:d.peer?.gender,seed:seedOf(d.peerId),callId:d.callId,voice:false};
  else{homeRemember({id:d.peerId,name:d.peer?.name||'Creator',avatarUrl:d.peer?.avatarUrl,gender:d.peer?.gender});S.h=d.peerId}
  go(host?'hcall':'call',host?undefined:d.peerId);
  try{await window.ZimiMedia.prepare(true);if(Room.transition!==d.callId||!zrIsCall()||S.callId!==d.callId)return;Native.receive({type:'call.connected',data:d});r()}
  catch(error){if(Room.transition===d.callId){Native.send('call.end',{callId:d.callId,reason:'media_failed'});if(zrIsCall())endCall(true);appNotice(error.message)}}
});
['session.none','session.expired'].forEach(type=>Native.on(type,()=>{zrClearGiftMotion();Room.key='';Room.transition=null;Room.sheet='';Room.draft='';Room.shareLink='';zrLinkDismiss()}));
document.addEventListener('aurora:navigate',()=>{if(S.v==='live'){zrEnsure();if(!DEMO&&!Home.streamBusy)zrLoadQueue()}else if(!zrIsCall()){zrClearGiftMotion();Room.sheet='';Room.key='';Room.transition=null;Room.draft=''}});
document.addEventListener('keydown',event=>{
  const dialog=document.querySelector('.zr-link-overlay .zr-sheet')||document.querySelector('.zr-sheet,.zr-host-options');if(!dialog)return;
  if(event.key==='Escape'){event.preventDefault();dialog.closest('.zr-link-overlay')?zrLinkDismiss():zrClose()}
  if(event.key==='Tab'){const elements=[...dialog.querySelectorAll('button:not(:disabled),input,select,a[href]')];if(!elements.length)return;const first=elements[0],last=elements.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
});
function zrDemoRoom(){
  if(!DEMO)return;
  Room.likes=150;Room.received=14300;Room.goalEnabled=Home.hosting;Room.startedAt=Date.now()-2555000;
  Room.supporters=[{id:'rohan',name:'Rohan_VIP',coins:4200,avatarUrl:''},{id:'aaru',name:'Aaru77',coins:2800,avatarUrl:OB_MEDIA[3]}];
  Room.gift={name:Home.hosting?'Rohan_VIP':'Ishaan',giftName:Home.hosting?'Galaxy Rocket':'Super Diamond',coins:Home.hosting?1000:500,emoji:Home.hosting?'🚀':'💎',combo:Home.hosting?1:5};
  Room.queueCount=2;if(Home.hosting)Room.requests=[{id:'preview-arjun',userId:'arjun',name:'Arjun',status:'pending'},{id:'preview-sana',userId:'sana',name:'Sana',status:'pending'}];
  if(!Home.messages.length)Home.messages=[{id:'d1',name:'Pooja',text:'Can you sing the chorus one more time?'},{id:'d2',name:'Kabir_99',text:'Just sent 100 roses!',vip:true},{id:'d3',name:Home.hosting?me.n:'Ananya',text:'Thank you so much Kabir! Loving this vibe tonight.',host:true},{id:'d4',name:'Sana',text:'Requesting a 1-on-1 video call!'}];
}
if(DEMO&&window.ZIMI_LIVE_STREAMING_ENABLED&&['live','host-live'].includes(previewMode)){
  if(previewMode==='host-live'&&isApprovedHost()){Home.hosting=true;Home.stream={id:'preview-host-live',title:'Acoustic sessions & late night conversations',viewers:4800,createdAt:new Date().toISOString()};S.h='aanya';S.v='live'}
  else{Home.hosting=false;S.h='aanya';Home.stream=g('aanya').stream;S.v='live'}
  Home.mediaStatus='Design preview';S.loggedIn=1;
}
if(DEMO&&callPreview){S.scam=1;S.mic=1;Home.mediaStatus='Design preview'}
