/* Photo-led Home discovery; colors follow the selected theme. */
const HomeFeatured = { id:'', start:'', paused:matchMedia('(prefers-reduced-motion: reduce)').matches, timer:null, due:0, backgrounded:false, offscreen:false };
const HOME_FEATURE_INTERVAL = 6000;
function homeFeaturedStop(){clearTimeout(HomeFeatured.timer);HomeFeatured.timer=null;homeFeaturedProgress()}
function homeFeaturedReset(){homeFeaturedStop();HomeFeatured.id=HomeFeatured.start=''}
function homeFeaturedPick(all){
  if(!all.some(h=>h.id===HomeFeatured.id))HomeFeatured.id=HomeFeatured.start=(all.find(h=>h.id===Home.featured?.id)||all[0])?.id||'';
  return all.find(h=>h.id===HomeFeatured.id)||null;
}
// Counted from the first creator shown, so a fresh Home reads 1 / n.
function homeFeaturedPosition(all){const at=id=>Math.max(0,all.findIndex(h=>h.id===id));return `${(at(HomeFeatured.id)-at(HomeFeatured.start)+all.length)%all.length+1} / ${all.length}`}
// The bar mirrors the real timer, resuming mid-way after a redraw.
function homeFeaturedProgress(){
  const bar=document.querySelector('.zh-featured-progress');if(!bar)return;
  const fill=document.createElement('i');
  if(HomeFeatured.timer)Object.assign(fill.style,{animationDuration:`${HOME_FEATURE_INTERVAL}ms`,animationDelay:`${HomeFeatured.due-HOME_FEATURE_INTERVAL-Date.now()}ms`});
  bar.dataset.running=String(!!HomeFeatured.timer);bar.replaceChildren(fill);
}
function homeFeaturedHeld(){
  const carousel=document.querySelector('.zh-featured-carousel'),grid=document.getElementById('home-host-grid');
  if([carousel,grid].some(el=>el?.contains(document.activeElement)))return true;
  return matchMedia('(hover: hover)').matches&&[carousel,grid].some(el=>el?.matches(':hover'));
}
function homeFeaturedReady(){return S.v==='home'&&!document.hidden&&!HomeFeatured.backgrounded&&!HomeFeatured.offscreen&&!homeContentPending()&&!Home.loadingMore&&!homeContentError()&&!Home.giftTo&&!!document.getElementById('home-featured-card')&&homeDashboardHosts().all.length>1}
function homeFeaturedSchedule(){
  homeFeaturedStop();
  if(!homeFeaturedReady()||HomeFeatured.paused||homeFeaturedHeld())return;
  HomeFeatured.due=Date.now()+HOME_FEATURE_INTERVAL;
  HomeFeatured.timer=setTimeout(()=>{HomeFeatured.timer=null;if(homeFeaturedReady()&&!homeFeaturedHeld())homeFeaturedNext(false);else homeFeaturedSchedule()},HOME_FEATURE_INTERVAL);
  homeFeaturedProgress();
}
function homeFeaturedControls(all){return all.length>1?`<div class="zh-featured-controls"><span class="zh-featured-position" data-featured-position aria-label="Featured profile position">${homeFeaturedPosition(all)}</span><span class="zh-featured-progress" aria-hidden="true"><i></i></span><button type="button" data-featured-pause aria-label="${HomeFeatured.paused?'Resume':'Pause'} profile rotation" onclick="homeFeaturedToggle()">${hi(HomeFeatured.paused?'play':'pause',16)}</button><button type="button" aria-label="Next featured creator" onclick="homeFeaturedNext()">${hi('arrow',18)}</button></div>`:''}
function homeFeaturedToggle(){
  HomeFeatured.paused=!HomeFeatured.paused;
  const button=document.querySelector('[data-featured-pause]');
  if(button){button.setAttribute('aria-label',`${HomeFeatured.paused?'Resume':'Pause'} profile rotation`);button.innerHTML=hi(HomeFeatured.paused?'play':'pause',16)}
  homeFeaturedSchedule();
}
function homeFeaturedNext(manual=true){
  const all=homeDashboardHosts().all;
  if(all.length<2||!homeFeaturedReady()||!manual&&(HomeFeatured.paused||homeFeaturedHeld()))return;
  const next=all[(Math.max(0,all.findIndex(h=>h.id===HomeFeatured.id))+1)%all.length];
  HomeFeatured.id=next.id;
  const hero=document.getElementById('home-featured-card'),grid=document.getElementById('home-host-grid');
  if(hero){hero.innerHTML=homeDashboardCard(next,true);hero.firstElementChild?.classList.add('zh-featured-enter')}
  if(grid){
    // The sponsored card keeps its element, so rotation never reloads it or counts a second view.
    const ad=grid.querySelector(':scope>[data-za-slot]');
    grid.innerHTML=all.filter(h=>h.id!==next.id).map(h=>homeDashboardCard(h)).join('');
    if(ad)grid.insertBefore(ad,grid.children[HOME_AD_AFTER]||null);
  }
  const position=document.querySelector('[data-featured-position]');if(position)position.textContent=homeFeaturedPosition(all);
  contentImagesReady();window.ZimiCardVideo?.attach();homeFeaturedSchedule();
}
// Rotation waits while the card is scrolled away, so the grid never changes under the reader.
const homeFeaturedObserver=window.IntersectionObserver?new IntersectionObserver(entries=>{
  const offscreen=!entries[entries.length-1].isIntersecting;
  if(offscreen===HomeFeatured.offscreen)return;
  HomeFeatured.offscreen=offscreen;homeFeaturedSchedule();
},{threshold:.35}):null;
function homeFeaturedAfterRender(){
  homeFeaturedObserver?.disconnect();
  const carousel=document.querySelector('.zh-featured-carousel');
  if(carousel)homeFeaturedObserver?.observe(carousel);else HomeFeatured.offscreen=false;
  // Redraws keep a running timer, so frequent updates cannot starve the rotation.
  if(HomeFeatured.timer&&homeFeaturedReady()&&!HomeFeatured.paused&&!homeFeaturedHeld())homeFeaturedProgress();else homeFeaturedSchedule();
}
const homeFeaturedInteraction='onpointerenter="if(event.pointerType===\'mouse\')homeFeaturedStop()" onpointerleave="homeFeaturedSchedule()" onfocusin="homeFeaturedStop()" onfocusout="setTimeout(homeFeaturedSchedule,0)"';
document.addEventListener('visibilitychange',homeFeaturedSchedule);
window.addEventListener('pagehide',homeFeaturedStop);
document.addEventListener('aurora:navigate',()=>{if(S.v!=='home')homeFeaturedStop()});
Native.on('app.background',()=>{HomeFeatured.backgrounded=true;homeFeaturedStop()});
Native.on('app.foreground',()=>{HomeFeatured.backgrounded=false;homeFeaturedSchedule()});
['session.none','session.expired'].forEach(type=>Native.on(type,()=>{homeFeaturedReset();HomeFeatured.paused=matchMedia('(prefers-reduced-motion: reduce)').matches}));
matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change',event=>{if(event.matches&&!HomeFeatured.paused)homeFeaturedToggle()});
function homeDashboardIsLive(h){return window.ZIMI_LIVE_STREAMING_ENABLED&&!!h.stream&&(!h.stream.status||h.stream.status==='live')}
function homeDashboardCanCall(h){return !!h.available&&(h.on||homeDashboardIsLive(h))}
function homeDashboardHosts(){
  const hosts=new Map(Home.hosts.map(h=>[h.id,h]));
  Home.stage.filter(homeDashboardIsLive).forEach(h=>{if(!hosts.has(h.id))hosts.set(h.id,h)});
  // Production Following is filtered on the server before pagination. Only the
  // design preview uses its local follow fixtures.
  const shown=[...hosts.values()].filter(h=>!DEMO||Home.dashboardFilter!=='following'||S.following[h.id]||h.fol);
  return {all:shown,live:shown.filter(homeDashboardIsLive),online:shown.filter(h=>!homeDashboardIsLive(h))};
}
function homeDashboardChat(id){
  // Messages wait for offline hosts, so chat never depends on being online.
  if(!g(id))return;
  zcOpen(id);
}
function homeDashboardHostOpen(){
  if(!window.ZimiHostAccess.guard())return;
  go(S.online?'waiting':'setup');
}
// Only an approved host account sees its own availability, in the Home header.
function homeDashboardHostEntry(){
  if(!isApprovedHost()&&!(window.ZimiHostAccess?.checking()&&S.role==='host'))return '';
  const online=!!S.online;
  return `<button type="button" class="zh-host-status ${online?'is-online':''}" onclick="homeDashboardHostOpen()" aria-label="${online?'Manage your call availability':'Get ready to go online'}" title="${online?'You are online for calls':'You are offline'}"><i aria-hidden="true"></i><span>${online?'Online':'Offline'}</span></button>`;
}
function homeDashboardStories(hosts,pending,error,more){
  if(!window.ZIMI_LIVE_STREAMING_ENABLED)return '';
  const rows=[...hosts.live].sort((a,b)=>Number(b.id===Home.featured?.id)-Number(a.id===Home.featured?.id)).slice(0,12);
  if(!rows.length||error)return '';
  const create=isApprovedHost()?`<button type="button" class="zh-live-shortcut zh-live-create" aria-label="Start your live" onclick="homeGoLive()"><span class="zh-live-ring">${hi('plus',25)}</span><span>You</span></button>`:'';
  const loading=`<div class="zh-skeleton zh-story-loading" role="status" aria-label="Loading live creators" aria-busy="true"><div class="zh-live-rail" aria-hidden="true">${Array.from({length:4},()=>`<span class="zh-live-shortcut"><span class="zh-live-ring zh-skeleton-shape"></span>${skeletonLine('38px',10)}</span>`).join('')}</div></div>`;
  const rail=rows.map(h=>`<button type="button" class="zh-live-shortcut" aria-label="Join ${esc(h.n)} live" onclick="homeOpen('${domId(h.id)}')"><span class="zh-live-ring">${homeCover(h)}</span><span>${esc(first(h.n))}</span></button>`).join('');
  return `<section class="zh-live-section" aria-label="Live hosts"><div class="zh-section-title"><h2><i class="zh-heading-dot"></i>Live now</h2><div class="zh-live-tools">${!pending?`<span>${n(rows.length)} live</span>`:''}<button type="button" class="zh-home-refresh" aria-label="Refresh home" title="Refresh home" aria-busy="${!!(pending||more)}" onclick="homeLoad()" ${pending||more?'disabled':''}>${hi('refresh',17)}</button></div></div>${pending?loading:`<div class="zh-live-rail">${create}${rail}</div>`}</section>`;
}
function homeDashboardCard(h,featured=false){
  // Grid cards share the Explore photo card; only the featured creator keeps Chat beside the call.
  if(!featured)return homeTile(h,{call:'homeDashboardCall'});
  const id=domId(h.id),live=homeDashboardIsLive(h),available=homeDashboardCanCall(h)&&!isHost(),chatReason=zcChatBlockReason(h.id);
  const status=live?'is-live':h.on?'is-online':'is-offline';
  const unavailable=isHost()?'Video calls are available from a member account':!h.on&&!live?`${h.n} is offline right now`:!h.available?'This host is not taking calls right now':'';
  const mediaAction=live?`<button type="button" class="zh-person-watch" aria-label="Watch ${esc(h.n)} live" onclick="homeOpen('${id}')"><span class="zh-watch-control">${hi('play',18)}<span>Watch live</span></span></button>`:`<button type="button" class="zh-person-photo-link" aria-label="Open ${esc(h.n)} profile" onclick="go('host','${id}')"></button>`;
  const profile=`<button type="button" class="zh-person-profile" aria-label="View ${esc(h.n)} profile" onclick="go('host','${id}')"><h3><span>${esc(h.n)}</span>${homeVerified(h)}</h3><p>${esc(h.stream?.title||h.tag||h.cat||'Host')}</p></button>`;
  return `<article class="zh-tile zh-person-card zh-featured-host ${status}" data-host-id="${esc(h.id)}">
    <div class="zh-person-media">${homeCover(h,true)}${homeCardVideo(h)}<div class="zh-photo-shade"></div>${mediaAction}<span class="zh-person-status ${status}"><i></i>${live?`LIVE <b>&middot;</b> ${homeCompact(h.viewers)} watching`:h.on?'Online':'Offline'}</span>${live?'':'<span class="zh-featured-label">Featured creator</span>'}</div>
    <div class="zh-person-content">${profile}
    <footer class="zh-person-footer"><button type="button" class="zh-person-action zh-person-chat" aria-label="Chat with ${esc(h.n)}" title="${esc(chatReason||'Open conversation')}" onclick="homeDashboardChat('${id}')" ${chatReason?'disabled':''}>${hi('chat',16)}<span>Chat</span></button><button type="button" class="zh-person-action zh-person-call" aria-label="Video call ${esc(h.n)}" title="${esc(unavailable||'Review your video call')}" onclick="homeDashboardCall('${id}')" ${available?'':'disabled'}>${hi('vid',16)} Instant call</button></footer></div>
  </article>`;
}
function homeDashboardCall(id){
  const h=g(id);
  if(!h||!homeDashboardCanCall(h)||isHost()||Home.dashboardCall||Home.streamBusy||Home.preparingCall)return;
  if(Home.pendingClose)return appNotice(Home.closeError||'Finishing the previous live session…');
  // Review cost and balance before joining a room, requesting a call or capture.
  Home.dashboardSetup={hostId:id,streamId:window.ZIMI_LIVE_STREAMING_ENABLED?h.stream?.id||null:null};
  S.pcerr='';
  homeCall(id);
}
function homeDashboardConfirmCall(){
  if(!window.ZIMI_LIVE_STREAMING_ENABLED)return;
  const setup=Home.dashboardSetup,h=g(S.h);
  if(S.v!=='precall'||!setup||setup.hostId!==S.h||Home.dashboardCall||Home.streamBusy||Home.preparingCall||isHost())return;
  if(!h?.available||h.stream?.id!==setup.streamId){S.pcerr='This live session is no longer available. Please choose a creator from Home.';r();return}
  if(Home.pendingClose)return appNotice(Home.closeError||'Finishing the previous live session…');
  if(!homeCallFundsReady(h))return;
  // A broadcaster accepts through the room queue, only after explicit approval
  // of the price and a matching membership acknowledgement from the server.
  Home.dashboardCall={hostId:setup.hostId,streamId:setup.streamId};
  homeOpen(setup.hostId);
  if(DEMO)homeDashboardRequestCall(Home.stream);
}
function homeDashboardRequestCall(stream){
  if(!window.ZIMI_LIVE_STREAMING_ENABLED)return;
  const pending=Home.dashboardCall;
  if(!pending||stream?.id!==pending.streamId||S.v!=='live'||S.h!==pending.hostId||Home.hosting)return;
  Home.dashboardCall=null;
  if(isHost())return;
  zrRequest();zrOpen('queue');
}
Native.on('stream.opened',d=>{if(!d.hosting)homeDashboardRequestCall(d.stream)});
Native.on('operation.error',d=>{if(d.action==='stream.join')Home.dashboardCall=null});
document.addEventListener('aurora:navigate',()=>{
  const setup=Home.dashboardSetup;
  if(setup&&(S.v!=='precall'||S.h!==setup.hostId))Home.dashboardSetup=null;
  const pending=Home.dashboardCall;
  if(pending&&(S.v!=='live'||Home.stream?.id!==pending.streamId||S.h!==pending.hostId))Home.dashboardCall=null;
});
function homeDashboardSkeleton(label='Loading creators',count=4){return contentSkeleton('cards',label,count)}
function homeDashboardHeroSkeleton(){return `<div class="zh-skeleton" role="status" aria-label="Loading featured creator" aria-busy="true"><div class="zh-person-card zh-featured-host zh-hero-placeholder zh-skeleton-shape" aria-hidden="true"><div class="zh-person-content">${skeletonLine('55%',25)}${skeletonLine('80%',12)}<div class="zh-person-footer">${skeletonLine('35%',46)}${skeletonLine('60%',46)}</div></div></div></div>`}
function homeDashboardEmpty(){
  const following=Home.dashboardFilter==='following';
  const title=following?'No followed creators yet':'No hosts to show right now';
  const description=following?'Follow a creator from Explore to see them here.':'Explore creators or catch up in chats while someone becomes available.';
  const primary=following?`<button type="button" class="zh-empty-primary" onclick="homeDashboardFilter('popular')">${hi('explore',18)} Explore creators</button>`:`<button type="button" class="zh-empty-primary" onclick="go('explore')">${hi('explore',18)} Explore creators</button>`;
  return `<div class="zh-host-empty">
    <div class="zh-home-empty-scene" aria-hidden="true"><span class="zh-empty-orbit"></span><span class="zh-empty-stage zh-empty-photo"><img src="${OB_MEDIA[1]}" alt="" decoding="async"></span><span class="zh-empty-satellite zh-empty-chat">${hi('chat',21)}</span><span class="zh-empty-satellite zh-empty-music">${hi('music',20)}</span><span class="zh-empty-satellite zh-empty-spark">${hi('star',15)}</span><i class="zh-empty-dot"></i><i class="zh-empty-dot"></i></div>
    <span class="zh-empty-eyebrow">Good company is worth the wait</span><h3>${title}</h3><p>${description}</p>
    <div class="zh-empty-actions">${primary}<button type="button" class="zh-empty-secondary" onclick="homeLoad()">${hi('refresh',17)} Check again</button></div>
    ${isApprovedHost()?`<button type="button" class="zh-empty-host" onclick="homeDashboardHostOpen()">${hi('ph',16)} ${S.online?'Manage your call availability':'Go online for 1:1 calls'} ${hi('arrow',15)}</button>`:''}
  </div><div class="zh-empty-links" aria-label="More ways to connect"><button type="button" onclick="go('chats')"><span class="zh-empty-link-icon">${hi('chat',22)}</span><strong>Your chats</strong><span>Keep the conversation going</span>${hi('arrow',16)}</button><button type="button" aria-label="Find a creator" onclick="go('search')"><span class="zh-empty-link-icon">${hi('srch',22)}</span><strong>Find your people</strong><span>Search for a creator you love</span>${hi('arrow',16)}</button></div>`;
}
function homeDashboard(){
  const pending=homeContentPending(),more=!DEMO&&Home.loadingMore&&(Home.loading||contentPending('home'));
  const failure=!pending&&!more&&homeContentError(),moreError=ContentLoading.home.page>1?failure:'',error=moreError?'':failure;
  const hosts=homeDashboardHosts(),all=hosts.all;
  const featured=homeFeaturedPick(all),remaining=featured?all.filter(h=>h.id!==featured.id):[];
  const hero=pending?homeDashboardHeroSkeleton():!error&&featured?`<section class="zh-featured-carousel" aria-roledescription="carousel" aria-label="Featured creators" ${homeFeaturedInteraction}><div id="home-featured-card">${homeDashboardCard(featured,true)}</div>${homeFeaturedControls(all)}</section>`:'';
  const grid=pending?homeDashboardSkeleton():error?'':remaining.length?`<div id="home-host-grid" class="zh-grid" ${homeFeaturedInteraction}>${homeGridWithAd(remaining.map(h=>homeDashboardCard(h)),'home')}</div>`:(!featured?homeDashboardEmpty():'')+(window.ZimiAds?.card('home')||'');
  return `<div id="home-feed-panel" class="zh-home zh-dashboard" role="tabpanel" aria-labelledby="home-tab-${Home.dashboardFilter==='following'?'following':'explore'}"><h1 class="zh-home-title">Meet your next conversation</h1>${homeDashboardStories(hosts,pending,error,more)}${error?`<div class="zh-error" role="alert">${esc(error)}<button type="button" onclick="homeLoad()">Retry</button></div>`:''}${hero}<section class="zh-discover" aria-label="Meet your next conversation"><div class="zh-section-title"><h2>${Home.dashboardFilter==='following'?'Following':'Connect 1:1'}</h2><div class="zh-live-tools"><button type="button" class="zh-home-refresh" aria-label="Refresh home" title="Refresh home" aria-busy="${!!(pending||more)}" onclick="homeLoad()" ${pending||more?'disabled':''}>${hi('refresh',17)}</button><button type="button" class="zh-see-all" onclick="go('explore')">See all ${hi('arrow',15)}</button></div></div>${grid}</section>${more?homeDashboardSkeleton('Loading more hosts',2):moreError?`<div class="zh-error" role="alert">${esc(moreError)}<button onclick="homeLoad(true)">Retry loading more hosts</button></div>`:!pending&&!error&&Home.hosts.length<Home.total?'<button class="zh-load-more" onclick="homeLoad(true)">Load more hosts</button>':''}${DEMO?'<p class="zh-preview-note">Design preview &middot; sample hosts'+MODEL_NOTE+'</p>':''}</div>${homeGiftSheet()}`;
}
