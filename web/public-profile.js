/* Public profiles use server identity and relationship data. Preview fixtures stay in DEMO. */
P.arrow = P.arrow || '<path d="M4 12h16m-6-6 6 6-6 6"/>';
const Zu = { id:'', profile:null, loading:false, error:'', requestId:0, sequence:0,
  tab:'posts', posts:[], total:0, page:0, limit:20, postsLoading:false, postsError:'', postsRequestId:0,
  followBusy:false, followRequestId:0, followError:'', blockBusy:false, blockRequestId:0,
  back:{view:'home'}, dialog:'', dialogFocus:null, gallery:0 };
const zuPendingFollows=new Map(),zuPendingBlocks=new Map();
const ZuRelationships={owner:'',kind:'followers',users:[],total:0,page:0,limit:20,loading:false,error:'',requestId:0,requestedPage:1};
const ZuCover={owner:'',photo:'',preparing:false,saving:false,error:'',run:0,requestId:0};
const zuActive = () => ['host','user','profile'].includes(S.v);
const zuSelfId = () => S.user?.id || (DEMO?ZProfile.data?.profile?.id:'');
const zuId = () => S.v === 'profile' ? zuSelfId() : S.v === 'user' ? S.u : S.h;
const zuKnown = id => g(id) || PEOPLE[id] || (DEMO ? sender(id) : null);
const zuCurrent = () => Zu.id === zuId();
const zuMatches = (d, posts=false) => d.id === Zu.id && d.requestId === (posts ? Zu.postsRequestId : Zu.requestId);
const zuApproved = p => p?.verified === true && p?.serverRole === 'host';
const zuGalleryAllowed = p => zuApproved(p) || p?.serverRole === 'user';
const zuMember = () => DEMO ? !isHost() : zcSelfRole() === 'user';
const zuHostViewer = () => DEMO ? isHost() : zcSelfRole() === 'host' && isApprovedHost();
const zuIsMember = p => p?.serverRole === 'user';
/* An approved host looking at a member: they may follow back and call within the member's permissions. */
const zuHostToMember = p => !!p && zuHostViewer() && zuIsMember(p) && !zuSelf();
// The Profile tab shares this layout, with owner controls instead of social actions.
const zuSelf = () => !!zuSelfId() && zuId() === zuSelfId();
const zuOffline = () => !!window.ZimiOffline?.isOffline();
function zuPaint(){
  if(!zuActive())return;
  const focused=document.activeElement?.id;
  r();
  if(focused?.startsWith('zu-'))document.getElementById(focused)?.focus({preventScroll:true});
}
function zuDate(value,yearOnly=false){
  if(!value)return '';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'':date.toLocaleDateString('en-IN',yearOnly?{year:'numeric'}:{month:'long',year:'numeric'});
}
function zuPeer(){
  if(zuCurrent()&&Zu.profile)return Zu.profile;
  if(zuSelf())return zuOwnPeer();
  const h=zuKnown(zuId());
  if(!h)return null;
  // Cached discovery/conversation identity may enable messaging while details load.
  return {id:h.id,name:h.n,avatarUrl:h.avatarUrl,coverUrl:h.coverUrl,gender:h.gender,city:h.c,
    role:h.role,serverRole:h.serverRole,verified:h.verified===true,about:h.about||'',category:h.cat,
    online:!!h.on,availableForCall:!!h.available,ratePerMin:h.rate,stream:h.stream||null};
}
function zuOwnPeer(){
  const user=S.user||{},demo=DEMO?ZProfile.data:null,profile=demo?.profile||{};
  return {id:zuSelfId(),name:user.name||profile.name||me.n,avatarUrl:S.avatarData||user.avatarUrl||(DEMO?OB_MEDIA[0]:''),coverUrl:S.coverData||user.coverUrl||'',
    gender:user.gender||me.gender,city:user.city??profile.city??me.c,country:user.country??profile.country??me.country??'',about:user.about??profile.bio??me.about,
    role:user.role||S.role,serverRole:isApprovedHost()?'host':'user',verified:isApprovedHost(),languages:user.languages||profile.languages||[],
    online:!!S.online,availableForCall:!!ZProfile.data?.privacy?.allowRequests,followers:demo?.stats?.fans,followingCount:demo?.stats?.following,joined:user.createdAt};
}
function zuRemember(profile){
  const raw=homeRemember(profile);
  raw.host=zuApproved(profile)?1:0;
  raw.lang=(profile.languages||[]).join(', ');
  raw.fol=profile.following?1:0;
  S.following[profile.id]=!!profile.following;
  if(!zuApproved(profile))PEOPLE[profile.id]={...raw,host:0};
}
function zuLoad(){
  const id=zuId();if(!id)return;
  Object.assign(Zu,{id,profile:null,loading:!DEMO,error:'',requestId:++Zu.sequence,tab:'posts',
    posts:[],total:0,page:0,limit:20,postsLoading:false,postsError:'',postsRequestId:++Zu.sequence,
    followBusy:zuPendingFollows.has(id),followRequestId:zuPendingFollows.get(id)||0,followError:'',
    blockBusy:zuPendingBlocks.has(id),blockRequestId:zuPendingBlocks.get(id)||0});
  if(DEMO){
    if(zuSelf()){
      Zu.profile=zuOwnPeer();Zu.profile.joined||='2025-04-12T00:00:00Z';
      if(zuGalleryAllowed(Zu.profile)){Zu.posts=(S.postData||[]).map((mediaUrl,index)=>({id:'preview-self-'+index,kind:'photo',mediaUrl,caption:''}));Zu.total=Zu.posts.length;Zu.page=1}
      return;
    }
    const h=zuKnown(id);if(!h){Zu.error='This profile is no longer available.';return}
    const host=!!h.verified||S.v==='host'&&h.host!==0;
    Zu.profile={id,name:h.n,role:host?'host':'sender',serverRole:host?'host':'user',verified:host,
      avatarUrl:h.avatarUrl,coverUrl:h.coverUrl,gender:h.gender,city:h.c||'Mumbai',
      about:host?'A little music, a little conversation, and a space to be yourself. Come say hello.':'Here for good conversations and discovering new favourites.',
      category:host?h.cat||'Music':'',languages:['English','Hindi'],interests:host?['Music','Travel','Good conversations']:['Music','Photography'],
      online:!!h.on,availableForCall:host&&!!h.available,ratePerMin:h.rate||0,stream:h.stream||null,
      followers:host?12800:128,followingCount:host?186:42,following:!!S.following[id],joined:'2025-04-12T00:00:00Z',level:host?18:4,crown:false};
    if(host){Zu.posts=[0,1,2].map((index)=>({id:'preview-post-'+index,kind:'photo',mediaUrl:OB_MEDIA[index+3],caption:['Good company. Better conversations.','A little glimpse of my everyday.','Looking forward to our next conversation.'][index]}));Zu.total=Zu.posts.length;Zu.page=1}
    zuRemember(Zu.profile);
  }else Native.send('profile.load',{id,requestId:Zu.requestId});
}
function zuRetry(){zuLoad();zuPaint()}
ZimiPullRefresh.register(['profile','host','user'],{refresh:()=>zuRetry(),busy:()=>Zu.loading});
function zuLoadPosts(more=false){
  if(DEMO||Zu.postsLoading||!zuGalleryAllowed(Zu.profile))return;
  Zu.postsLoading=true;Zu.postsError='';Zu.postsRequestId=++Zu.sequence;
  Native.send('profile.posts.load',{id:Zu.id,page:more?Zu.page+1:1,requestId:Zu.postsRequestId});
  zuPaint();
}
function zuBack(){if(S.v==='profile'){go('home');return}const back=Zu.back;go(back.view||'home',back.id)}
function zuEditMedia(kind){
  if(kind==='cover')return zuChooseCover();
  if(!zuSelf()||zuOffline())return;
  if(kind==='photos')return window.ZimiPostCreate.open();
  const target=kind;
  go('editprofile');
  const input=[...document.querySelectorAll('.editwrap input[type=file]')].find(el=>el.getAttribute('onchange')?.includes("'"+target+"'"));
  input?.closest(target==='posts'?'.editgroup':'.editmedia')?.scrollIntoView({block:'center',behavior:'instant'});
  input?.click();
}
function zuTab(tab){if(!['posts','about'].includes(tab))return;Zu.tab=tab;zuPaint()}
function zuTabKeys(event){
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();zuTab(event.key==='Home'?'posts':event.key==='End'?'about':Zu.tab==='posts'?'about':'posts');
  document.getElementById('zu-tab-'+Zu.tab)?.focus();
}
function zuFollow(){
  const p=Zu.profile;if(!p||!((zuApproved(p)&&zuMember())||zuHostToMember(p))||Zu.loading||Zu.followBusy||zuOffline())return;
  Zu.followBusy=true;Zu.followError='';Zu.followRequestId=++Zu.sequence;
  zuPendingFollows.set(p.id,Zu.followRequestId);
  const data={id:p.id,on:!p.following,requestId:Zu.followRequestId};
  if(DEMO){zuFollowSaved(data);return}
  Native.send('follow.set',data);zuPaint();
}
function zuFollowSaved(d){
  if(d.requestId!==undefined&&zuPendingFollows.get(d.id)!==d.requestId)return;
  zuPendingFollows.delete(d.id);
  S.following[d.id]=!!d.on;
  const known=zuKnown(d.id);if(known)known.fol=d.on?1:0;
  if(d.id!==Zu.id||d.requestId!==Zu.followRequestId)return;
  if(Zu.profile){const p=Zu.profile,changed=p.following!==!!d.on;p.following=!!d.on;if(changed)p.followers=Math.max(0,(p.followers||0)+(d.on?1:-1))}
  Zu.followBusy=false;Zu.followError='';zuPaint();
}
function zuHostCall(voice){
  const p=Zu.profile;if(!zuHostToMember(p)||Zu.loading||Zu.error||zuOffline())return;
  hostCallMember(p.id,voice,{name:p.name,avatarUrl:p.avatarUrl,city:p.city,gender:p.gender});
}
function zuMessage(){const p=zuPeer();if(p&&!Zu.error&&!zuOffline()&&zcCanChat(p.id))go('thread',p.id)}
function zuCall(){const p=Zu.profile;if(p&&!Zu.loading&&!Zu.error&&zuMember()&&zuApproved(p)&&p.availableForCall&&!zuOffline())homeCall(p.id)}
function zuGift(){const p=Zu.profile;if(p&&!Zu.loading&&zuMember()&&zuApproved(p)&&!zuOffline())homeGifts(p.id)}
function zuWatch(){const p=Zu.profile;if(window.ZIMI_LIVE_STREAMING_ENABLED&&p?.stream&&!Zu.loading&&!zuOffline())homeOpen(p.id)}

function zuSkeleton(kind='profile'){
  const shape=(width,height)=>skeletonLine(width,height);
  if(kind==='posts')return `<div class="zu-gallery zu-skeleton-gallery" role="status" aria-label="Loading profile photos" aria-busy="true">${Array.from({length:3},()=>'<div class="zu-photo zh-skeleton-shape" aria-hidden="true"></div>').join('')}</div>`;
  return `<div class="zu-profile-skeleton" role="status" aria-label="Loading profile details" aria-busy="true"><div aria-hidden="true"><div class="zu-skeleton-name">${shape('67%',28)}${shape('38%',13)}</div><div class="zu-skeleton-stats">${[1,2,3].map(()=>`<div>${shape('44px',24)}${shape('58px',10)}</div>`).join('')}</div>${shape('94%',13)}${shape('77%',13)}<div class="zu-skeleton-tags">${shape('85px',28)}${shape('95px',28)}</div></div></div>`;
}
function zuStatus(p){
  if(Zu.loading||Zu.error)return '';
  if(window.ZIMI_LIVE_STREAMING_ENABLED&&p.stream)return `<button class="zu-presence is-live" onclick="zuWatch()"><i></i> Live now ${hi('arrow',13)}</button>`;
  const callable=zuApproved(p)&&p.availableForCall;
  return `<span class="zu-presence ${callable||p.online?'is-online':''}"><i></i>${callable?'Available for a call':p.online?'Online':'Currently offline'}</span>`;
}
function zuAvatar(p){
  const source=imageSrc(p?.avatarUrl);
  return source?`<img class="zh-photo-pending" src="${source}" alt="${esc(p.name||'Profile photo')}" data-face="${faceKind(p||{})}" decoding="async">`:face(p||{});
}
function zuIdentity(p){
  const ready=!!Zu.profile&&!Zu.loading&&!Zu.error,host=zuApproved(p),canFollow=ready&&host&&zuMember()&&!zuSelf();
  const owner=zuSelf(),followBack=ready&&zuHostToMember(p),showFollow=canFollow||followBack;
  const followLabel=Zu.followBusy?'Updating…':p.following?'Following':followBack&&p.followsYou?'Follow back':'Follow';
  return `<aside class="zu-overview"><div class="zu-identity-top">${owner?`<button type="button" class="zu-avatar zu-owner-avatar" onclick="zuEditMedia('avatar')" aria-label="Change profile photo" ${zuOffline()?'disabled':''}>${zuAvatar(p)}<span class="zu-owner-camera">${zi('camera',14)}</span></button>`:`<div class="zu-avatar">${zuAvatar(p)}${ready&&host?`<span class="zu-verified" aria-label="Verified creator">${hi('verified',19)}</span>`:''}</div>`}
    ${owner?`<button type="button" id="zu-edit-self" class="zu-owner-edit" aria-label="Edit profile" onclick="go('editprofile')">${zi('edit',18)}</button>`:showFollow?`<button id="zu-follow" class="zu-follow ${p.following?'is-following':''}" onclick="zuFollow()" aria-pressed="${!!p.following}" ${Zu.followBusy||zuOffline()?'disabled':''}>${hi(p.following?'check':'plus',16)}${followLabel}</button>`:''}</div>
    ${Zu.loading?zuSkeleton():Zu.error?`<div class="zu-error" role="alert"><h1>Profile unavailable</h1><p>${esc(Zu.error)}</p><button class="zu-secondary" onclick="zuRetry()">Try again</button></div>`:`
    <div class="zu-identity"><h1>${esc(p.name)}</h1>${ready&&!owner&&p.followsYou?'<span class="zu-follows-you">Follows you</span>':''}
    <div class="zu-meta">${p.city?`<span>${zi('location',14)}${esc(p.city)}</span>`:''}${host&&p.category?`<span class="zu-category">${ci('sparkle',13)}${esc(p.category)}</span>`:''}</div>
    ${Zu.followError?`<p class="zu-inline-error" role="alert">${esc(Zu.followError)}</p>`:''}
    <div class="zu-stats" aria-label="Profile statistics">${owner?`<div><strong>${contentBalance()}</strong><span>Coins</span></div>`:''}${['followers','following'].map(kind=>{const count=kind==='followers'?p.followers:p.followingCount,title=kind==='followers'?'Followers':'Following';return `<div>${owner?`<button type="button" class="zu-stat-button" aria-label="View your ${kind}" onclick="zuOpenRelationships('${kind}')"><strong>${n(count||0)}</strong><span>${title}</span></button>`:`<strong>${n(count||0)}</strong><span>${title}</span>`}</div>`}).join('')}${owner?'':`<div><strong>${host?(Zu.postsLoading&&!Zu.page?skeletonLine('25px',19):Zu.postsError&&!Zu.page?'—':n(Zu.total)):esc(zuDate(p.joined,true)||'—')}</strong><span>${host?'Posts':'Joined'}</span></div>`}</div>
    <p class="zu-bio">${esc(p.about||(owner?'':'A new face. A new connection. Say hello when you’re ready.'))}</p>
    ${owner?`<button type="button" class="zu-agency-link" onclick="ZimiAgency.open('profile')">${zi('people',18)} ${isApprovedHost()?'My agency':'Become a Host'} ${hi('arrow',16)}</button>`:''}
    ${!owner&&p.languages?.length?`<div class="zu-languages">${zi('language',15)}<span>${p.languages.map(esc).join(' · ')}</span></div>`:''}
    ${canFollow?`<button class="zu-gift" onclick="zuGift()" aria-label="Send a gift" ${zuOffline()?'disabled':''}><span class="zu-gift-icon">${hi('gift',22)}</span><span><b>Send a gift</b><small>Choose a gift to send</small></span>${hi('arrow',17)}</button>`:''}
    </div>`}</aside>`;
}
function zuAbout(p){
  return `<div class="zu-about"><section><h2>About ${esc(first(p.name||'this member'))}</h2><p>${esc(p.about||'They haven’t added an introduction yet.')}</p></section>
    ${p.interests?.length?`<section><h3>Into these things</h3><div class="zu-interests">${p.interests.map(value=>`<span>${esc(value)}</span>`).join('')}</div></section>`:''}
    <div class="zu-details">${p.languages?.length?`<div>${zi('language',18)}<span>Speaks<b>${p.languages.map(esc).join(', ')}</b></span></div>`:''}${p.city?`<div>${zi('location',18)}<span>Based in<b>${esc(p.city)}</b></span></div>`:''}${zuDate(p.joined)?`<div>${hi('clock',18)}<span>Part of BinzoLive since<b>${esc(zuDate(p.joined))}</b></span></div>`:''}
    <div>${hi('user',18)}<span>Account ID<b class="zu-account-id">${esc(p.id)}</b></span><button class="zu-icon-button" aria-label="Copy account ID" onclick="zuCopyId()">${hi('copy',17)}</button></div></div>
    ${zuApproved(p)?`<p class="zu-trust">${zi('shield',16)} Creator verified by BinzoLive</p>`:''}</div>`;
}
function zuMedia(post,index){
  const src=imageSrc(post.mediaUrl),video=post.kind==='video';
  return `<button class="zu-photo ${src?'':'is-unavailable'}" aria-label="Open ${video?'video':'photo'} ${index+1}${post.caption?': '+esc(post.caption):''}" onclick="zuOpenPhoto(${index})" ${src?'':'disabled'}>
    ${src?(video?`<video src="${src}" muted playsinline preload="metadata" aria-hidden="true"></video>`:`<img class="zh-photo-pending" src="${src}" alt="${esc(post.caption||'Photo shared by '+Zu.profile.name)}" loading="lazy" decoding="async" onerror="this.hidden=true;this.parentElement.classList.add('is-unavailable')">`):''}
    <span class="zu-media-unavailable">${ci('image',23)}<span>Media unavailable</span></span><span class="zu-photo-shade"></span>${video?`<span class="zu-play">${hi('play',19)}</span>`:''}<span class="zu-photo-expand">${hi('arrow',16)}</span></button>`;
}
function zuPosts(p){
  if(!zuGalleryAllowed(p))return `<div class="zu-empty">${ci('image',30)}<h2>No photos yet</h2><p>This account has no shared posts.</p></div>`;
  if(Zu.postsLoading&&!Zu.page)return zuSkeleton('posts');
  return `${Zu.posts.length?`<div class="zu-gallery">${Zu.posts.map(zuMedia).join('')}</div>`:!Zu.postsError?`<div class="zu-empty">${ci('image',30)}<h2>No photos yet</h2><p>${zuSelf()?'Your uploaded photos appear here.':'Photos and updates from '+esc(first(p.name))+' will appear here.'}</p>${zuSelf()?'<button class="zu-text-button" onclick="zuEditMedia(\'photos\')">'+zi('camera',17)+' Upload a photo</button>':''}</div>`:''}
    ${Zu.postsError?`<div class="zu-error zu-post-error" role="alert"><p>${esc(Zu.postsError)}</p><button class="zu-secondary" onclick="zuLoadPosts(${!!Zu.page})">Retry photos</button></div>`:''}
    ${Zu.postsLoading?zuSkeleton('posts'):Zu.page*Zu.limit<Zu.total?'<button class="zu-load-more" onclick="zuLoadPosts(true)">Load more posts</button>':''}`;
}
function zuContent(p){
  if(Zu.loading)return `<div class="zu-content">${zuSkeleton('posts')}</div>`;
  if(Zu.error||!p)return '';
  return `<div class="zu-content">${window.ZIMI_LIVE_STREAMING_ENABLED&&p.stream?`<section class="zu-live-card"><div class="zu-live-symbol">${hi('broadcast',24)}</div><div><span><i></i> LIVE RIGHT NOW</span><h2>${esc(p.stream.title||'Come join the conversation')}</h2><p>${n(p.stream.viewers||0)} watching · Drop in and say hello</p></div><button onclick="zuWatch()" ${zuOffline()?'disabled':''}>Join live ${hi('arrow',16)}</button></section>`:''}
    <div class="zu-content-header"><div class="zu-tabs" role="tablist" aria-label="Profile content" onkeydown="zuTabKeys(event)">${['posts','about'].map(tab=>`<button id="zu-tab-${tab}" role="tab" aria-selected="${Zu.tab===tab}" aria-controls="zu-panel" tabindex="${Zu.tab===tab?0:-1}" onclick="zuTab('${tab}')">${hi(tab==='posts'?'grid':'user',17)}${tab==='posts'?'Posts':'About'}${tab==='posts'&&zuGalleryAllowed(p)?`<span>${Zu.postsLoading&&!Zu.page?'…':Zu.total}</span>`:''}</button>`).join('')}</div>${zuSelf()?`<button type="button" id="zu-upload-self" class="zu-add-photo" aria-label="Upload photos" onclick="zuEditMedia('photos')" ${zuOffline()?'disabled':''}>${zi('camera',18)}</button>`:''}</div>
    <div id="zu-panel" class="zu-panel" role="tabpanel" aria-labelledby="zu-tab-${Zu.tab}" tabindex="0">${Zu.tab==='about'?zuAbout(p):zuPosts(p)}</div></div>`;
}
function zuActions(p){
  if(!p||Zu.error)return '';
  if(zuSelf())return '';
  const ready=!!Zu.profile&&!Zu.loading,host=zuApproved(p),canCall=ready&&host&&zuMember()&&p.availableForCall&&!zuOffline();
  const messageBlocked=zuOffline()||!zcCanChat(p.id),hostCalls=ready&&zuHostToMember(p);
  return `<div class="zu-actionbar"><div class="zu-actionbar-inner">${host&&zuMember()?`<div class="zu-call-info"><span>${ready&&p.availableForCall?'YOUR NEXT CONVERSATION':'CONNECT WHEN THEY’RE BACK'}</span><strong>${Zu.loading?'Checking availability…':p.availableForCall?(Number.isFinite(p.ratePerMin)?p.ratePerMin>0?`${hi('rings',15)} ${n(p.ratePerMin)} <small>coins / min</small>`:'Free calls':'Call rate unavailable'):'Not available for calls'}</strong></div>`:''}
    <div class="zu-action-buttons ${hostCalls?'has-host-calls':''}"><button id="zu-message" class="zu-message" aria-label="Message" onclick="zuMessage()" ${messageBlocked?'disabled':''}>${hi('chat',20)}<span>Message</span></button>${host&&zuMember()?`<button id="zu-call" class="zu-call" onclick="zuCall()" ${canCall?'':'disabled'}>${hi('vid',21)}<span>${ready&&!p.availableForCall?'Unavailable':'Start video call'}</span></button>`:''}${hostCalls?`<button id="zu-voice-call" class="zu-call zu-call-voice" aria-label="Voice call" onclick="zuHostCall(true)" ${zuOffline()?'disabled':''}>${hi('ph',20)}<span>Voice</span></button><button id="zu-video-call" class="zu-call" aria-label="Video call" onclick="zuHostCall(false)" ${zuOffline()?'disabled':''}>${hi('vid',21)}<span>Video</span></button>`:''}</div></div></div>`;
}
function zuScreen(){
  const p=zuPeer(),cover=imageSrc(p?.coverUrl),owner=zuSelf();
  return `<section class="zu-page ${S.v==='profile'?'zu-own-page':''}" aria-label="${owner?'Your profile':'User profile'}"><div class="zu-cover ${cover?'has-photo':''}">${cover?`<img class="zu-cover-photo zh-photo-pending" src="${cover}" alt="${esc(p.name)}’s cover" onerror="this.hidden=true;this.parentElement.classList.remove('has-photo')">`:'<div class="zu-cover-art" aria-hidden="true"><i></i><i></i><i></i></div>'}<div class="zu-cover-shade"></div>
    <header class="zu-toolbar">${backButton('zuBack()',{media:true})}<span>Profile</span>${owner?`<button class="zu-toolbar-more" aria-label="Open settings" onclick="go('settings')">${hi('set',21)}</button>`:`<button class="zu-toolbar-more" aria-label="More profile options" onclick="zuOpenOptions()" ${!p||Zu.error?'disabled':''}>${ci('more',21)}</button>`}</header>${owner?`<input id="zu-cover-input" type="file" accept="image/*" aria-label="Choose cover photo" onchange="zuPickCover(event)" hidden><button type="button" class="zu-cover-upload" aria-label="Change cover photo" onclick="zuEditMedia('cover')" ${zuOffline()||ZuCover.preparing||ZuCover.saving||Zu.loading||!Zu.profile?'disabled':''}>${zi('camera',16)} ${ZuCover.preparing?'Preparing…':ZuCover.saving?'Saving…':'Change cover'}</button>`:''}${p?zuStatus(p):''}</div>
    <div class="zu-layout">${zuIdentity(p||{})}${zuContent(p)}</div>${zuActions(p)}${homeGiftSheet()}</section>`;
}

function zuCloseDialog(force=false){
  if(Zu.dialog==='cover'&&ZuCover.saving&&!force)return;
  if(Zu.dialog==='cover'&&!ZuCover.saving){ZuCover.run++;Object.assign(ZuCover,{photo:'',error:'',preparing:false})}
  if(Zu.dialog==='relationships'){ZuRelationships.requestId=++Zu.sequence;ZuRelationships.loading=false}
  const dialog=document.getElementById('zu-dialog');
  if(dialog){dialog.querySelector('video')?.pause();dialog.close();dialog.remove()}
  Zu.dialog='';
}
function zuDialog(title,body,kind){
  const originFocus=document.getElementById('zu-dialog')?Zu.dialogFocus:document.activeElement;
  zuCloseDialog();Zu.dialogFocus=originFocus;Zu.dialog=kind;
  const dialog=document.createElement('dialog');dialog.id='zu-dialog';dialog.className='zu-dialog'+(kind==='photo'?' zu-photo-dialog':'');dialog.setAttribute('aria-labelledby','zu-dialog-title');
  dialog.innerHTML=`<header><h2 id="zu-dialog-title">${title}</h2><button class="zu-icon-button" aria-label="Close" onclick="zuCloseDialog()">${hi('close',20)}</button></header>${body}`;
  dialog.addEventListener('close',()=>{dialog.querySelector('video')?.pause();dialog.remove();if(document.getElementById('zu-dialog'))return;Zu.dialog='';if(originFocus?.isConnected)originFocus.focus({preventScroll:true})});
  dialog.addEventListener('cancel',event=>{if(kind==='cover'){event.preventDefault();if(!ZuCover.saving)zuCloseDialog()}});
  dialog.addEventListener('click',event=>{if(event.target!==dialog||kind==='cover'&&ZuCover.saving)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)zuCloseDialog()});
  document.body.append(dialog);dialog.showModal();return dialog;
}
function zuOpenOptions(){
  const p=zuPeer();if(!p||Zu.error)return;
  zuDialog('Profile options',`<p class="zu-dialog-intro">${esc(p.name||'BinzoLive member')}</p><label class="zu-id-field">Account ID<input id="zu-copy-field" readonly value="${esc(p.id)}" aria-label="Account ID"></label><button class="zu-option" onclick="zuCopyId()">${hi('copy',18)} Copy account ID</button><button class="zu-option zu-danger-text" onclick="zuConfirmBlock()">${zi('shield',18)} Block user</button><p class="zu-dialog-status" role="status"></p>`,'options');
}

function zuChooseCover(){
  if(!zuSelf()||!Zu.profile||Zu.loading||Zu.error||zuOffline()||ZuCover.preparing||ZuCover.saving||S.mediaPreparing||S.profileSaving)return;
  (document.getElementById('zu-cover-dialog-input')||document.getElementById('zu-cover-input'))?.click();
}
async function zuPickCover(event){
  const file=event.target.files?.[0];event.target.value='';
  if(!file||!zuSelf()||ZuCover.preparing||ZuCover.saving||zuOffline())return;
  const owner=zuSelfId(),run=++ZuCover.run;
  Object.assign(ZuCover,{owner,preparing:true,error:''});zuPaint();zuPaintCover();
  const current=()=>run===ZuCover.run&&owner===zuSelfId()&&zuSelf()&&Zu.id===owner;
  try{
    const photo=await obReadPhoto(file);
    if(!current())return;
    if(photo.length>2*1024*1024)throw new Error('This photo is still too large. Choose a smaller image.');
    ZuCover.photo=photo;
  }catch(error){if(current())ZuCover.error=error.message||'This image could not be prepared. Choose another photo.'}
  finally{
    if(current()){
      ZuCover.preparing=false;zuPaint();
      if(Zu.dialog!=='cover')zuDialog('Change cover','<div id="zu-cover-editor"></div>','cover');
      zuPaintCover();
    }
  }
}
function zuPaintCover(){
  const target=document.getElementById('zu-cover-editor');if(!target||Zu.dialog!=='cover')return;
  const busy=ZuCover.saving||ZuCover.preparing;
  const preview=imageSrc(ZuCover.photo||Zu.profile?.coverUrl);
  target.setAttribute('aria-busy',String(busy));
  target.innerHTML=`${preview?`<img class="zu-cover-preview" src="${preview}" alt="New cover preview">`:''}<input id="zu-cover-dialog-input" type="file" accept="image/*" onchange="zuPickCover(event)" hidden><button type="button" class="zu-text-button" onclick="zuChooseCover()" ${busy||zuOffline()?'disabled':''}>Choose another photo</button>${busy?`<p class="zu-cover-progress" role="status">${ZuCover.preparing?'Preparing photo…':'Saving cover…'}</p>`:''}${ZuCover.error?`<p class="zu-dialog-status" role="alert">${esc(ZuCover.error)}</p>`:''}<div class="zu-dialog-actions"><button type="button" class="zu-secondary" onclick="zuCloseDialog()" ${ZuCover.saving?'disabled':''}>Cancel</button><button type="button" class="zu-cover-save" onclick="zuSaveCover()" ${busy||!ZuCover.photo||zuOffline()?'disabled':''}>${ZuCover.saving?'Saving…':'Save cover'}</button></div>`;
  const close=document.querySelector('#zu-dialog header button');if(close)close.disabled=ZuCover.saving;
}
function zuSaveCover(){
  if(!zuSelf()||ZuCover.owner!==zuSelfId()||!ZuCover.photo||ZuCover.preparing||ZuCover.saving||zuOffline())return;
  ZuCover.saving=true;ZuCover.error='';ZuCover.requestId=++Zu.sequence;zuPaintCover();zuPaint();
  if(DEMO){zuCoverSaved({requestId:ZuCover.requestId,account:{user:{...S.user,id:zuSelfId(),coverUrl:ZuCover.photo}}});return}
  Native.send('profile.cover.save',{photo:ZuCover.photo,requestId:ZuCover.requestId});
}
function zuCoverSaved(data){
  if(!ZuCover.saving||data.requestId!==ZuCover.requestId||ZuCover.owner!==zuSelfId()||data.account?.user?.id!==zuSelfId())return;
  const user=data.account.user;S.coverData=user.coverUrl||'';
  S.user={...S.user,coverUrl:user.coverUrl,coverKey:user.coverKey};
  if(S.mediaDirty)delete S.mediaDirty.cover;
  if(Zu.id===zuSelfId()&&Zu.profile){Zu.profile.coverUrl=S.coverData;Zu.loading=false;Zu.error='';Zu.requestId=++Zu.sequence}
  ZuCover.saving=false;
  if(Zu.dialog==='cover')zuCloseDialog();
  Object.assign(ZuCover,{photo:'',error:'',preparing:false});zuPaint();appNotice('Cover photo updated.');obHaptic('success');
}
Native.on('profile.cover.saved',zuCoverSaved);
Native.on('profile.cover.error',data=>{
  if(!ZuCover.saving||data.requestId!==ZuCover.requestId||ZuCover.owner!==zuSelfId())return;
  ZuCover.saving=false;ZuCover.error=data.message||'Could not save your cover. Please try again.';
  if(Zu.dialog==='cover')zuPaintCover();else Object.assign(ZuCover,{photo:'',error:''});zuPaint();
});
for(const type of ['session','auth.ok'])Native.on(type,data=>{
  if(!ZuCover.owner||ZuCover.owner===data.user?.id)return;
  if(Zu.dialog==='cover')zuCloseDialog(true);
  Object.assign(ZuCover,{owner:'',photo:'',preparing:false,saving:false,error:'',run:ZuCover.run+1,requestId:++Zu.sequence});
});

function zuOpenRelationships(kind){
  if(!zuSelf()||!Zu.profile||Zu.loading||!['followers','following'].includes(kind))return;
  if(Zu.dialog!=='relationships')zuDialog('Your connections','<div id="zu-relationships"></div>','relationships');
  Object.assign(ZuRelationships,{owner:zuSelfId(),kind,users:[],total:0,page:0,error:'',loading:false});
  zuLoadRelationships();
}
function zuLoadRelationships(more=false){
  const state=ZuRelationships;
  if(Zu.dialog!=='relationships'||state.owner!==zuSelfId()||state.loading)return;
  state.loading=true;state.error='';state.requestedPage=more?state.page+1:1;state.requestId=++Zu.sequence;
  if(!more){state.users=[];state.page=0}
  zuPaintRelationships();
  if(DEMO){state.loading=false;state.total=0;state.page=1;zuPaintRelationships();return}
  Native.send('relationships.load',{kind:state.kind,page:state.requestedPage,requestId:state.requestId});
}
function zuRelationshipKeys(event){
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const kind=event.key==='Home'?'followers':event.key==='End'?'following':ZuRelationships.kind==='followers'?'following':'followers';
  zuOpenRelationships(kind);document.getElementById('zu-relationships-'+kind)?.focus();
}
function zuRelationshipOpen(id){
  const peer=ZuRelationships.users.find(person=>person.id===id);
  if(!peer?.canViewProfile)return;
  if(peer.serverRole==='host')knowHost(peer);else personFrom(peer);
  zuCloseDialog();go(peer.id===zuSelfId()?'profile':peer.serverRole==='host'?'host':'user',peer.id);
}
function zuPaintRelationships(){
  const target=document.getElementById('zu-relationships'),state=ZuRelationships;
  if(!target||Zu.dialog!=='relationships')return;
  const focusId=target.contains(document.activeElement)?document.activeElement?.id:'';
  const title=state.kind==='followers'?'followers':'following';
  const rows=state.users.map(peer=>{
    const body=`${avc({id:peer.id,n:peer.name,avatarUrl:peer.avatarUrl,gender:peer.gender,seed:seedOf(peer.id)},44)}<span class="zu-relationship-name"><strong>${esc(peer.name)}</strong><small>${esc(peer.city||(peer.serverRole==='host'?'Creator':'Member'))}</small></span>${peer.canViewProfile?hi('arrow',18):''}`;
    return `<li>${peer.canViewProfile?`<button type="button" class="zu-relationship-row" aria-label="View ${esc(peer.name)}'s profile" onclick="zuRelationshipOpen('${domId(peer.id)}')">${body}</button>`:`<div class="zu-relationship-row">${body}</div>`}</li>`;
  }).join('');
  target.innerHTML=`<div class="zu-relationship-tabs" role="tablist" aria-label="Your connections" onkeydown="zuRelationshipKeys(event)">${['followers','following'].map(kind=>`<button type="button" role="tab" id="zu-relationships-${kind}" aria-selected="${state.kind===kind}" aria-controls="zu-relationship-panel" tabindex="${state.kind===kind?0:-1}" onclick="zuOpenRelationships('${kind}')">${kind==='followers'?'Followers':'Following'}</button>`).join('')}</div><div id="zu-relationship-panel" role="tabpanel" aria-labelledby="zu-relationships-${state.kind}">${rows?`<ul class="zu-relationship-list" aria-label="Your ${title}">${rows}</ul>`:''}${state.loading?contentSkeleton('rows','Loading '+title,state.page?2:5):state.error?`<div class="zu-error" role="alert"><p>${esc(state.error)}</p><button type="button" class="zu-secondary" onclick="zuLoadRelationships(${state.requestedPage>1})">Try again</button></div>`:!state.users.length?`<div class="zu-empty"><h2>${state.kind==='followers'?'No followers yet':'You’re not following anyone yet'}</h2><p>${state.kind==='followers'?'People who follow you will appear here.':'Creators you follow will appear here.'}</p></div>`:state.page*state.limit<state.total?'<button type="button" class="zu-secondary zu-relationship-more" onclick="zuLoadRelationships(true)">Load more</button>':''}</div>`;
  if(focusId)document.getElementById(focusId)?.focus({preventScroll:true});
}
function zuRelationshipsMatch(d){return Zu.dialog==='relationships'&&ZuRelationships.owner===zuSelfId()&&d.id===ZuRelationships.owner&&d.requestId===ZuRelationships.requestId}
Native.on('data.relationships',d=>{
  if(!zuRelationshipsMatch(d)||d.kind!==ZuRelationships.kind)return;
  const state=ZuRelationships,rows=d.users||[];
  state.users=d.page>1?[...state.users,...rows.filter(peer=>!state.users.some(old=>old.id===peer.id))]:rows;
  Object.assign(state,{page:d.page,total:d.total,limit:d.limit,loading:false,error:''});
  if(Zu.id===state.owner&&Zu.profile)Zu.profile[state.kind==='followers'?'followers':'followingCount']=state.total;
  zuPaint();zuPaintRelationships();
});
Native.on('data.loading',d=>{
  if(d.resource!=='relationships'||!zuRelationshipsMatch(d))return;
  ZuRelationships.loading=!!d.loading;ZuRelationships.error=d.error||'';zuPaintRelationships();
});
async function zuCopyId(){
  const id=zuPeer()?.id;if(!id)return;
  try{
    if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(id);
    else{const input=document.createElement('textarea');input.value=id;input.className='zu-copy-helper';(document.getElementById('zu-dialog')||document.body).append(input);input.select();const copied=document.execCommand('copy');input.remove();if(!copied)throw new Error('unavailable')}
    appNotice('Account ID copied.');
  }catch{if(!document.getElementById('zu-copy-field'))zuOpenOptions();const field=document.getElementById('zu-copy-field');field?.focus();field?.select();const status=document.querySelector('.zu-dialog-status');if(status)status.textContent='Select and copy the account ID above.'}
}
function zuConfirmBlock(){
  const p=zuPeer();if(!p)return;
  zuDialog('Block '+esc(first(p.name))+'?',`<div class="zu-block-symbol">${zi('shield',26)}</div><p class="zu-dialog-intro">You won’t see each other in discovery or be able to start new chats or calls. You can unblock them in Profile & Settings.</p><p class="zu-dialog-status" role="alert"></p><div class="zu-dialog-actions"><button class="zu-secondary" onclick="zuCloseDialog()">Cancel</button><button class="zu-block-confirm" onclick="zuBlock()" ${Zu.blockBusy?'disabled':''}>${Zu.blockBusy?'Blocking…':'Block user'}</button></div>`,'block');
}
function zuBlock(){
  const p=zuPeer();if(!p||Zu.blockBusy||zuOffline())return;
  Zu.blockBusy=true;Zu.blockRequestId=++Zu.sequence;
  zuPendingBlocks.set(p.id,Zu.blockRequestId);
  const button=document.querySelector('.zu-block-confirm');if(button){button.disabled=true;button.textContent='Blocking…'}
  const status=document.querySelector('.zu-dialog-status');if(status)status.textContent='';
  const data={id:p.id,blocked:true,requestId:Zu.blockRequestId};
  if(DEMO){zuBlocked(data);return}Native.send('block.set',data);
}
function zuBlocked(d){
  if(zuPendingBlocks.get(d.id)!==d.requestId)return;
  zuPendingBlocks.delete(d.id);
  if(d.id!==Zu.id||d.requestId!==Zu.blockRequestId||!d.blocked)return;
  Zu.blockBusy=false;zuCloseDialog();if(zuActive()&&zuCurrent())go('home');appNotice('User blocked. You can manage blocked accounts in Settings.');
}
function zuConfirmDelete(){
  const post=Zu.posts[Zu.gallery];if(!zuSelf()||!post||Zu.deleting)return;
  Zu.deleteCandidate={...post,owner:Zu.id};
  zuDialog('Delete this post?',`<p class="zu-dialog-intro">This photo will be removed from your profile. This cannot be undone.</p><p class="zu-dialog-status" role="alert"></p><div class="zu-dialog-actions"><button class="zu-secondary" onclick="zuCloseDialog()">Cancel</button><button class="zu-block-confirm" onclick="zuDeletePost()">Delete post</button></div>`,'delete-post');
}
function zuDeletePost(){
  const post=Zu.deleteCandidate;if(!zuSelf()||post?.owner!==Zu.id||Zu.deleting||zuOffline())return;
  Zu.deleting={...post,requestId:++Zu.sequence};
  const button=document.querySelector('.zu-block-confirm');if(button){button.disabled=true;button.textContent='Deleting…'}
  const data={id:post.id,requestId:Zu.deleting.requestId};
  if(DEMO){zuPostDeleted(data);return}Native.send('media.post.delete',data);
}
function zuPostDeleted(d){
  const pending=Zu.deleting;if(!pending||pending.id!==d.id||pending.requestId!==d.requestId)return;
  Zu.deleting=null;Zu.deleteCandidate=null;
  S.postData=S.postData.filter(url=>url!==pending.mediaUrl);
  if(Zu.id===pending.owner){
    Zu.posts=Zu.posts.filter(post=>post.id!==d.id);Zu.total=Math.max(0,Zu.total-1);
    Zu.postsLoading=false;Zu.postsRequestId=++Zu.sequence;
    if(Zu.dialog==='delete-post')zuCloseDialog();
    if(zuActive()&&zuSelf()){zuLoadPosts();zuPaint()}
  }
  appNotice('Post deleted.');
}
Native.on('post.deleted',zuPostDeleted);
Native.on('post.delete.error',d=>{
  if(Zu.deleting?.id!==d.id||Zu.deleting.requestId!==d.requestId)return;
  Zu.deleting=null;
  if(Zu.dialog!=='delete-post')return;
  const status=document.querySelector('.zu-dialog-status');if(status)status.textContent=d.message||'Could not delete this post. Try again.';
  const button=document.querySelector('.zu-block-confirm');if(button){button.disabled=false;button.textContent='Delete post'}
});
Native.on('post.saved',()=>{if(zuActive()&&zuSelf()&&Zu.profile)zuLoadPosts()});

/* Profiles follow the same rule as cards: a host is never shown offline (see hostFrom). */
function zuShownPresence(p){if(p&&isHostPayload(p))Object.assign(p,{online:hostShownOnline(p),availableForCall:hostCallable(p)});return p}
Native.on('data.publicProfile',d=>{
  if(!zuMatches(d))return;
  Zu.profile=zuShownPresence(d.profile);Zu.loading=false;Zu.error='';zuRemember(d.profile);
  if(zuGalleryAllowed(d.profile)&&!Zu.page&&!Zu.postsLoading)zuLoadPosts();
  zuPaint();
});
Native.on('profile.account',d=>{
  if(d.user?.id!==zuSelfId()||Zu.id!==zuSelfId()||!Zu.profile)return;
  const u=d.user;
  Object.assign(Zu.profile,{name:u.name,avatarUrl:u.avatarUrl,coverUrl:u.coverUrl,city:u.city,country:u.country||'',about:u.about,gender:u.gender,languages:u.languages||[]});
  Zu.requestId=++Zu.sequence;Zu.loading=false;Zu.error='';
  zuPaint();
});
Native.on('data.publicPosts',d=>{
  if(!zuMatches(d,true))return;
  const rows=(d.posts||[]).filter(post=>imageSrc(post.mediaUrl));
  Zu.posts=d.page>1?[...Zu.posts,...rows.filter(post=>!Zu.posts.some(old=>old.id===post.id))]:rows;
  Zu.total=d.total||0;Zu.page=d.page||1;Zu.limit=d.limit||20;Zu.postsLoading=false;Zu.postsError='';zuPaint();
  if(typeof zuFeedSync==='function')zuFeedSync();
});
Native.on('data.loading',d=>{
  if(d.resource==='publicProfile'&&zuMatches(d)){Zu.loading=!!d.loading;Zu.error=d.error||'';zuPaint()}
  if(d.resource==='publicPosts'&&zuMatches(d,true)){Zu.postsLoading=!!d.loading;Zu.postsError=d.error||'';zuPaint();if(typeof zuFeedSync==='function')zuFeedSync()}
});
Native.on('data.home',d=>{
  if(!zuActive()||!Zu.profile||Zu.loading)return;
  const peer=[...(d.hosts||[]),...(d.stage||[]),d.featured].find(p=>p?.id===Zu.id);
  if(!peer)return;
  // Live discovery events may update availability without replacing profile
  // counts, a pending relationship write, or the current gallery selection.
  for(const key of ['online','availableForCall','verified','ratePerMin','stream'])if(Object.hasOwn(peer,key))Zu.profile[key]=peer[key];
  zuShownPresence(Zu.profile);zuPaint();
});
Native.on('follow.saved',zuFollowSaved);
Native.on('follow.error',d=>{
  if(zuPendingFollows.get(d.id)!==d.requestId)return;
  zuPendingFollows.delete(d.id);
  if(d.id!==Zu.id||d.requestId!==Zu.followRequestId)return;
  Zu.followBusy=false;Zu.followError=d.message||'Could not update your follow. Please try again.';zuPaint();
});
Native.on('block.saved',zuBlocked);
Native.on('block.error',d=>{
  if(zuPendingBlocks.get(d.id)!==d.requestId)return;
  zuPendingBlocks.delete(d.id);
  if(d.id!==Zu.id||d.requestId!==Zu.blockRequestId)return;
  Zu.blockBusy=false;const status=document.querySelector('.zu-dialog-status');if(status)status.textContent=d.message||'Could not block this user. Try again.';
  const button=document.querySelector('.zu-block-confirm');if(button){button.disabled=false;button.textContent='Block user'}
});
// Catalog and gift outcomes otherwise repaint only the discovery screens.
for(const type of ['data.catalog','gift.sent','wallet.balance'])Native.on(type,()=>{if(zuActive()&&Home.giftTo)zuPaint()});
Native.on('gift.sent',()=>{if(zuActive())zuPaint()});
Native.on('operation.error',d=>{if(zuActive()&&d.action==='gift.send')zuPaint()});
Native.on('connection.status',d=>{if(!zuActive())return;if(d.connected&&!d.checking&&(Zu.error||Zu.postsError))zuRetry();else zuPaint()});
for(const type of ['offline','online'])window.addEventListener(type,()=>{if(zuActive())zuPaint()});
for(const type of ['session.none','session.expired'])Native.on(type,()=>{zuCloseDialog(true);Object.assign(ZuCover,{owner:'',photo:'',preparing:false,saving:false,error:'',run:ZuCover.run+1,requestId:++Zu.sequence});Object.assign(ZuRelationships,{owner:'',users:[],total:0,page:0,loading:false,error:'',requestId:++Zu.sequence});zuPendingFollows.clear();zuPendingBlocks.clear();Zu.deleting=null;Zu.deleteCandidate=null;Zu.id='';Zu.profile=null;Zu.posts=[];Zu.requestId=++Zu.sequence;Zu.postsRequestId=++Zu.sequence});
window.ZimiPublicProfile={
  render:zuScreen,
  beforeNavigate(view,id){
    if(ZuCover.preparing){ZuCover.run++;Object.assign(ZuCover,{photo:'',error:'',preparing:false})}
    zuCloseDialog(true);
    if(['host','user'].includes(view)&&!(zuActive()&&id===zuId()))Zu.back={view:S.v,id:S.v==='user'?S.u:S.v==='host'?S.h:undefined};
  },
  afterNavigate(view){if(['host','user','profile'].includes(view))zuLoad()},
};
ZimiHome.views.profile=zuScreen;
if(DEMO&&previewMode==='profile'){S.v='host';S.h='aanya';S.loggedIn=1;zuLoad()}
