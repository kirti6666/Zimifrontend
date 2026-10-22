/* Public profiles use server identity and relationship data. Preview fixtures stay in DEMO. */
P.arrow = P.arrow || '<path d="M4 12h16m-6-6 6 6-6 6"/>';
const Zu = { id:'', profile:null, loading:false, error:'', requestId:0, sequence:0,
  tab:'posts', posts:[], total:0, page:0, limit:20, postsLoading:false, postsError:'', postsRequestId:0,
  followBusy:false, followRequestId:0, followError:'', blockBusy:false, blockRequestId:0,
  back:{view:'home'}, dialog:'', dialogFocus:null, gallery:0 };
const zuPendingFollows=new Map(),zuPendingBlocks=new Map();
const zuActive = () => ['host','user'].includes(S.v);
const zuId = () => S.v === 'user' ? S.u : S.h;
const zuKnown = id => g(id) || PEOPLE[id] || (DEMO ? sender(id) : null);
const zuCurrent = () => Zu.id === zuId();
const zuMatches = (d, posts=false) => d.id === Zu.id && d.requestId === (posts ? Zu.postsRequestId : Zu.requestId);
const zuApproved = p => p?.verified === true && p?.serverRole === 'host';
const zuMember = () => DEMO ? !isHost() : zcSelfRole() === 'user';
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
  const h=zuKnown(zuId());
  if(!h)return null;
  // Cached discovery/conversation identity may enable messaging while details load.
  return {id:h.id,name:h.n,avatarUrl:h.avatarUrl,coverUrl:h.coverUrl,gender:h.gender,city:h.c,
    role:h.role,serverRole:h.serverRole,verified:h.verified===true,about:h.about||'',category:h.cat,
    online:!!h.on,availableForCall:!!h.available,ratePerMin:h.rate,stream:h.stream||null};
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
    const h=zuKnown(id);if(!h){Zu.error='This profile is no longer available.';return}
    const host=!!h.verified||S.v==='host'&&h.host!==0;
    Zu.profile={id,name:h.n,role:host?'host':'sender',serverRole:host?'host':'user',verified:host,
      avatarUrl:h.avatarUrl,coverUrl:h.coverUrl,gender:h.gender,city:h.c||'Mumbai',
      about:host?'A little music, a little conversation, and a space to be yourself. Come say hello.':'Here for good conversations and discovering new favourites.',
      category:host?h.cat||'Music':'',languages:['English','Hindi'],interests:host?['Music','Travel','Good conversations']:['Music','Photography'],
      online:!!h.on,availableForCall:host&&!!h.available,ratePerMin:h.rate||0,stream:h.stream||null,
      followers:host?12800:128,followingCount:host?186:42,following:!!S.following[id],joined:'2025-04-12T00:00:00Z',level:host?18:4,crown:false};
    if(host){Zu.posts=[0,1,2].map((index)=>({id:'preview-post-'+index,kind:'photo',mediaUrl:OB_MEDIA[index],caption:['Good company. Better conversations.','A little glimpse of my everyday.','See you at the next live session.'][index]}));Zu.total=Zu.posts.length;Zu.page=1}
    zuRemember(Zu.profile);
  }else Native.send('profile.load',{id,requestId:Zu.requestId});
}
function zuRetry(){zuLoad();zuPaint()}
function zuLoadPosts(more=false){
  if(DEMO||Zu.postsLoading||!zuApproved(Zu.profile))return;
  Zu.postsLoading=true;Zu.postsError='';Zu.postsRequestId=++Zu.sequence;
  Native.send('profile.posts.load',{id:Zu.id,page:more?Zu.page+1:1,requestId:Zu.postsRequestId});
  zuPaint();
}
function zuBack(){const back=Zu.back;go(back.view||'home',back.id)}
function zuTab(tab){if(!['posts','about'].includes(tab))return;Zu.tab=tab;zuPaint()}
function zuTabKeys(event){
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();zuTab(event.key==='Home'?'posts':event.key==='End'?'about':Zu.tab==='posts'?'about':'posts');
  document.getElementById('zu-tab-'+Zu.tab)?.focus();
}
function zuFollow(){
  const p=Zu.profile;if(!p||!zuApproved(p)||!zuMember()||Zu.loading||Zu.followBusy||zuOffline())return;
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
  if(Zu.profile){const changed=Zu.profile.following!==!!d.on;Zu.profile.following=!!d.on;if(changed)Zu.profile.followers=Math.max(0,(Zu.profile.followers||0)+(d.on?1:-1))}
  Zu.followBusy=false;Zu.followError='';zuPaint();
}
function zuMessage(){const p=zuPeer();if(p&&!Zu.error&&!zuOffline()&&zcCanChat(p.id))go('thread',p.id)}
function zuCall(){const p=Zu.profile;if(p&&!Zu.loading&&!Zu.error&&zuMember()&&zuApproved(p)&&p.availableForCall&&!zuOffline())homeCall(p.id)}
function zuGift(){const p=Zu.profile;if(p&&!Zu.loading&&zuMember()&&zuApproved(p)&&!zuOffline())homeGifts(p.id)}
function zuWatch(){const p=Zu.profile;if(p?.stream&&!Zu.loading&&!zuOffline())homeOpen(p.id)}

function zuSkeleton(kind='profile'){
  const shape=(width,height)=>skeletonLine(width,height);
  if(kind==='posts')return `<div class="zu-gallery zu-skeleton-gallery" role="status" aria-label="Loading profile photos" aria-busy="true">${Array.from({length:3},()=>'<div class="zu-photo zh-skeleton-shape" aria-hidden="true"></div>').join('')}</div>`;
  return `<div class="zu-profile-skeleton" role="status" aria-label="Loading profile details" aria-busy="true"><div aria-hidden="true"><div class="zu-skeleton-name">${shape('67%',28)}${shape('38%',13)}</div><div class="zu-skeleton-stats">${[1,2,3].map(()=>`<div>${shape('44px',24)}${shape('58px',10)}</div>`).join('')}</div>${shape('94%',13)}${shape('77%',13)}<div class="zu-skeleton-tags">${shape('85px',28)}${shape('95px',28)}</div></div></div>`;
}
function zuStatus(p){
  if(Zu.loading||Zu.error)return '';
  if(p.stream)return `<button class="zu-presence is-live" onclick="zuWatch()"><i></i> Live now ${hi('arrow',13)}</button>`;
  return `<span class="zu-presence ${p.availableForCall?'is-online':''}"><i></i>${p.availableForCall?'Available for a call':p.online?'Online':'Currently offline'}</span>`;
}
function zuAvatar(p){
  const source=imageSrc(p?.avatarUrl);
  return source?`<img class="zh-photo-pending" src="${source}" alt="${esc(p.name||'Profile photo')}" data-face="${faceKind(p||{})}" decoding="async">`:face(p||{});
}
function zuIdentity(p){
  const ready=!!Zu.profile&&!Zu.loading&&!Zu.error,host=zuApproved(p),canFollow=ready&&host&&zuMember();
  return `<aside class="zu-overview"><div class="zu-identity-top"><div class="zu-avatar">${zuAvatar(p)}${ready&&host?`<span class="zu-verified" aria-label="Verified creator">${hi('verified',19)}</span>`:''}</div>
    ${canFollow?`<button id="zu-follow" class="zu-follow ${p.following?'is-following':''}" onclick="zuFollow()" aria-pressed="${!!p.following}" ${Zu.followBusy||zuOffline()?'disabled':''}>${hi(p.following?'check':'plus',16)}${Zu.followBusy?'Updating…':p.following?'Following':'Follow'}</button>`:''}</div>
    ${Zu.loading?zuSkeleton():Zu.error?`<div class="zu-error" role="alert"><h1>Profile unavailable</h1><p>${esc(Zu.error)}</p><button class="zu-secondary" onclick="zuRetry()">${hi('refresh',17)} Try again</button></div>`:`
    <div class="zu-identity"><span class="zu-eyebrow">${host?'CREATOR PROFILE':'MEMBER PROFILE'}</span><h1>${esc(p.name)}</h1>
    <div class="zu-meta">${p.city?`<span>${zi('location',14)}${esc(p.city)}</span>`:''}${host&&p.category?`<span class="zu-category">${ci('sparkle',13)}${esc(p.category)}</span>`:''}</div>
    ${Zu.followError?`<p class="zu-inline-error" role="alert">${esc(Zu.followError)}</p>`:''}
    <div class="zu-stats" aria-label="Profile statistics"><div><strong>${n(p.followers||0)}</strong><span>Followers</span></div><div><strong>${n(p.followingCount||0)}</strong><span>Following</span></div><div><strong>${host?(Zu.postsLoading&&!Zu.page?skeletonLine('25px',19):Zu.postsError&&!Zu.page?'—':n(Zu.total)):esc(zuDate(p.joined,true)||'—')}</strong><span>${host?'Posts':'Joined'}</span></div></div>
    <p class="zu-bio">${esc(p.about||'A new face. A new connection. Say hello when you’re ready.')}</p>
    ${p.languages?.length?`<div class="zu-languages">${zi('language',15)}<span>${p.languages.map(esc).join(' · ')}</span></div>`:''}
    ${canFollow?`<button class="zu-gift" onclick="zuGift()" aria-label="Send a gift" ${zuOffline()?'disabled':''}><span class="zu-gift-icon">${hi('gift',22)}</span><span><b>Make their day</b><small>Send a little appreciation</small></span>${hi('arrow',17)}</button>`:''}
    </div>`}</aside>`;
}
function zuAbout(p){
  return `<div class="zu-about"><section><h2>A little about ${esc(first(p.name||'this member'))}</h2><p>${esc(p.about||'They haven’t added an introduction yet.')}</p></section>
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
  if(!zuApproved(p))return `<div class="zu-empty">${ci('image',30)}<h2>A little more to discover</h2><p>This member hasn’t shared any public posts.</p><button class="zu-text-button" onclick="zuTab('about')">Get to know ${esc(first(p.name))} ${hi('arrow',15)}</button></div>`;
  if(Zu.postsLoading&&!Zu.page)return zuSkeleton('posts');
  return `${Zu.posts.length?`<div class="zu-gallery">${Zu.posts.map(zuMedia).join('')}</div>`:!Zu.postsError?`<div class="zu-empty">${ci('image',30)}<h2>The first moment is on its way</h2><p>Photos and updates from ${esc(first(p.name))} will appear here.</p></div>`:''}
    ${Zu.postsError?`<div class="zu-error zu-post-error" role="alert"><p>${esc(Zu.postsError)}</p><button class="zu-secondary" onclick="zuLoadPosts(${!!Zu.page})">${hi('refresh',17)} Retry photos</button></div>`:''}
    ${Zu.postsLoading?zuSkeleton('posts'):Zu.page*Zu.limit<Zu.total?'<button class="zu-load-more" onclick="zuLoadPosts(true)">Load more posts</button>':''}`;
}
function zuContent(p){
  if(Zu.loading)return `<div class="zu-content">${zuSkeleton('posts')}</div>`;
  if(Zu.error||!p)return '';
  return `<div class="zu-content">${p.stream?`<section class="zu-live-card"><div class="zu-live-symbol">${hi('broadcast',24)}</div><div><span><i></i> LIVE RIGHT NOW</span><h2>${esc(p.stream.title||'Come join the conversation')}</h2><p>${n(p.stream.viewers||0)} watching · Drop in and say hello</p></div><button onclick="zuWatch()" ${zuOffline()?'disabled':''}>Join live ${hi('arrow',16)}</button></section>`:''}
    <div class="zu-tabs" role="tablist" aria-label="Profile content" onkeydown="zuTabKeys(event)">${['posts','about'].map(tab=>`<button id="zu-tab-${tab}" role="tab" aria-selected="${Zu.tab===tab}" aria-controls="zu-panel" tabindex="${Zu.tab===tab?0:-1}" onclick="zuTab('${tab}')">${hi(tab==='posts'?'grid':'user',17)}${tab==='posts'?'Posts':'About'}${tab==='posts'&&zuApproved(p)?`<span>${Zu.postsLoading&&!Zu.page?'…':Zu.total}</span>`:''}</button>`).join('')}</div>
    <div id="zu-panel" class="zu-panel" role="tabpanel" aria-labelledby="zu-tab-${Zu.tab}" tabindex="0">${Zu.tab==='about'?zuAbout(p):zuPosts(p)}</div></div>`;
}
function zuActions(p){
  if(!p||Zu.error)return '';
  const ready=!!Zu.profile&&!Zu.loading,host=zuApproved(p),canCall=ready&&host&&zuMember()&&p.availableForCall&&!zuOffline();
  const messageBlocked=zuOffline()||!zcCanChat(p.id);
  return `<div class="zu-actionbar"><div class="zu-actionbar-inner">${host&&zuMember()?`<div class="zu-call-info"><span>${ready&&p.availableForCall?'YOUR NEXT CONVERSATION':'CONNECT WHEN THEY’RE BACK'}</span><strong>${Zu.loading?'Checking availability…':p.availableForCall?(Number.isFinite(p.ratePerMin)?p.ratePerMin>0?`${hi('rings',15)} ${n(p.ratePerMin)} <small>coins / min</small>`:'Free calls':'Call rate unavailable'):'Not available for calls'}</strong></div>`:''}
    <div class="zu-action-buttons"><button id="zu-message" class="zu-message" aria-label="Message" onclick="zuMessage()" ${messageBlocked?'disabled':''}>${hi('chat',20)}<span>Message</span></button>${host&&zuMember()?`<button id="zu-call" class="zu-call" onclick="zuCall()" ${canCall?'':'disabled'}>${hi('vid',21)}<span>${ready&&!p.availableForCall?'Unavailable':'Start video call'}</span></button>`:''}</div>
    ${!zuMember()&&!zcCanChat(p.id)?'<p class="zu-action-note">Creators can reply to existing member conversations.</p>':''}</div></div>`;
}
function zuScreen(){
  const p=zuPeer(),cover=imageSrc(p?.coverUrl);
  return `<section class="zu-page" aria-label="User profile"><div class="zu-cover ${cover?'has-photo':''}">${cover?`<img class="zu-cover-photo zh-photo-pending" src="${cover}" alt="${esc(p.name)}’s cover" onerror="this.hidden=true;this.parentElement.classList.remove('has-photo')">`:'<div class="zu-cover-art" aria-hidden="true"><i></i><i></i><i></i></div>'}<div class="zu-cover-shade"></div>
    <header class="zu-toolbar">${backButton('zuBack()',{media:true})}<span>Profile</span><button class="zu-toolbar-more" aria-label="More profile options" onclick="zuOpenOptions()" ${!p||Zu.error?'disabled':''}>${ci('more',21)}</button></header>${p?zuStatus(p):''}</div>
    <div class="zu-layout">${zuIdentity(p||{})}${zuContent(p)}</div>${zuActions(p)}${homeGiftSheet()}</section>`;
}

function zuCloseDialog(){
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
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close()});
  document.body.append(dialog);dialog.showModal();return dialog;
}
function zuOpenOptions(){
  const p=zuPeer();if(!p||Zu.error)return;
  zuDialog('Profile options',`<p class="zu-dialog-intro">${esc(p.name||'BinzoLive member')}</p><label class="zu-id-field">Account ID<input id="zu-copy-field" readonly value="${esc(p.id)}" aria-label="Account ID"></label><button class="zu-option" onclick="zuCopyId()">${hi('copy',18)} Copy account ID</button><button class="zu-option zu-danger-text" onclick="zuConfirmBlock()">${zi('shield',18)} Block user</button><p class="zu-dialog-status" role="status"></p>`,'options');
}
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
function zuOpenPhoto(index){
  const post=Zu.posts[index];if(!post||!imageSrc(post.mediaUrl))return;
  Zu.gallery=index;
  const src=imageSrc(post.mediaUrl),video=post.kind==='video';
  const dialog=zuDialog(`${video?'Video':'Photo'} ${index+1} of ${Zu.posts.length}`,`<div class="zu-viewer">${video?`<video src="${src}" controls playsinline preload="metadata"></video>`:`<img src="${src}" alt="${esc(post.caption||'Photo by '+Zu.profile.name)}">`}</div>${post.caption?`<p class="zu-caption">${esc(post.caption)}</p>`:''}<div class="zu-viewer-actions"><button class="zu-secondary" aria-label="Previous post" onclick="zuOpenPhoto(${index-1})" ${index===0?'disabled':''}>${hi('back',17)} Previous</button><button class="zu-secondary" aria-label="Next post" onclick="zuOpenPhoto(${index+1})" ${index===Zu.posts.length-1?'disabled':''}>Next ${hi('arrow',17)}</button></div>`,'photo');
  dialog.addEventListener('keydown',event=>{if(event.target.tagName==='VIDEO')return;const next=event.key==='ArrowRight'?index+1:event.key==='ArrowLeft'?index-1:-1;if(next>=0&&next<Zu.posts.length){event.preventDefault();zuOpenPhoto(next)}});
}

Native.on('data.publicProfile',d=>{
  if(!zuMatches(d))return;
  Zu.profile=d.profile;Zu.loading=false;Zu.error='';zuRemember(d.profile);
  if(zuApproved(d.profile)&&!Zu.page&&!Zu.postsLoading)zuLoadPosts();
  zuPaint();
});
Native.on('data.publicPosts',d=>{
  if(!zuMatches(d,true))return;
  const rows=(d.posts||[]).filter(post=>imageSrc(post.mediaUrl));
  Zu.posts=d.page>1?[...Zu.posts,...rows.filter(post=>!Zu.posts.some(old=>old.id===post.id))]:rows;
  Zu.total=d.total||0;Zu.page=d.page||1;Zu.limit=d.limit||20;Zu.postsLoading=false;Zu.postsError='';zuPaint();
});
Native.on('data.loading',d=>{
  if(d.resource==='publicProfile'&&zuMatches(d)){Zu.loading=!!d.loading;Zu.error=d.error||'';zuPaint()}
  if(d.resource==='publicPosts'&&zuMatches(d,true)){Zu.postsLoading=!!d.loading;Zu.postsError=d.error||'';zuPaint()}
});
Native.on('data.home',d=>{
  if(!zuActive()||!Zu.profile||Zu.loading)return;
  const peer=[...(d.hosts||[]),...(d.stage||[]),d.featured].find(p=>p?.id===Zu.id);
  if(!peer)return;
  // Live discovery events may update availability without replacing profile
  // counts, a pending relationship write, or the current gallery selection.
  for(const key of ['online','availableForCall','verified','ratePerMin','stream'])if(Object.hasOwn(peer,key))Zu.profile[key]=peer[key];
  zuPaint();
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
for(const type of ['session.none','session.expired'])Native.on(type,()=>{zuCloseDialog();zuPendingFollows.clear();zuPendingBlocks.clear();Zu.id='';Zu.profile=null;Zu.posts=[];Zu.requestId=++Zu.sequence;Zu.postsRequestId=++Zu.sequence});
window.ZimiPublicProfile={
  render:zuScreen,
  beforeNavigate(view,id){
    zuCloseDialog();
    if(['host','user'].includes(view)&&!(zuActive()&&id===zuId()))Zu.back={view:S.v,id:S.v==='user'?S.u:S.h};
  },
  afterNavigate(view){if(['host','user'].includes(view))zuLoad()},
};
if(DEMO&&previewMode==='profile'){S.v='host';S.h='aanya';S.loggedIn=1;zuLoad()}
