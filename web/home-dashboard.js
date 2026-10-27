/* Photo-led Home discovery; colors follow the selected theme. */
function homeDashboardIsLive(h){return window.ZIMI_LIVE_STREAMING_ENABLED&&!!h.stream&&(!h.stream.status||h.stream.status==='live')}
function homeDashboardCanCall(h){return !!h.available&&(h.on||homeDashboardIsLive(h))}
function homeDashboardHosts(){
  const hosts=new Map(Home.hosts.map(h=>[h.id,h]));
  Home.stage.filter(homeDashboardIsLive).forEach(h=>{if(!hosts.has(h.id))hosts.set(h.id,h)});
  const filter=Home.dashboardFilter;
  // Every host is listed, online or offline; the server sorts who can take a call first.
  const shown=[...hosts.values()].filter(h=>(filter!=='instant'||h.ready&&homeDashboardCanCall(h))&&(!Home.categories.includes(filter)||h.cat===filter));
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
function homeDashboardHostEntry(){
  if(!isApprovedHost())return '';
  const online=!!S.online;
  return `<section class="zh-host-entry ${online?'is-online':''}" aria-label="Your host availability">
    <span class="zh-host-entry-icon" aria-hidden="true">${hi(online?'ph':'vid',23)}${online?'<i></i>':''}</span>
    <div class="zh-host-entry-copy"><h2>${online?'You’re online':'You’re offline'}</h2><p>${online?'Ready to receive 1:1 calls.':'Go online to start receiving calls.'}</p></div>
    <button type="button" onclick="homeDashboardHostOpen()" aria-label="${online?'Manage your call availability':'Get ready to go online'}">${online?'Manage':'Go online'}${hi('arrow',15)}</button>
  </section>`;
}
function homeDashboardFilters(){
  const filters=[['popular','Popular','star'],['instant','Instant call','bolt'],...Home.categories.map(c=>[c,c,c==='Music'?'music':c==='Talk'?'chat':'star'])];
  return '<div class="zh-dashboard-filters" role="group" aria-label="Filter hosts">'+filters.map(([key,label,icon])=>`<button type="button" data-dashboard-filter="${esc(key)}" aria-pressed="${Home.dashboardFilter===key}" onclick="homeDashboardFilter(this.dataset.dashboardFilter)">${hi(icon,16)}<span>${esc(label)}</span></button>`).join('')+'</div>';
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
  const id=domId(h.id),live=homeDashboardIsLive(h),available=homeDashboardCanCall(h)&&!isHost(),chatReason=zcChatBlockReason(h.id);
  const status=live?'is-live':h.on?'is-online':'is-offline';
  const unavailable=isHost()?'Video calls are available from a member account':!h.on&&!live?`${h.n} is offline right now`:!h.available?'This host is not taking calls right now':'';
  const mediaAction=live?`<button type="button" class="zh-person-watch" aria-label="Watch ${esc(h.n)} live" onclick="homeOpen('${id}')"><span class="zh-watch-control">${hi('play',18)}${featured?'<span>Watch live</span>':''}</span></button>`:`<button type="button" class="zh-person-photo-link" aria-label="Open ${esc(h.n)} profile" onclick="go('host','${id}')"></button>`;
  const profile=`<button type="button" class="zh-person-profile" aria-label="View ${esc(h.n)} profile" onclick="go('host','${id}')"><h3><span>${esc(h.n)}</span>${homeVerified(h)}</h3><p>${esc(h.stream?.title||h.tag||h.cat||'Host')}</p></button>`;
  return `<article class="zh-tile zh-person-card ${featured?'zh-featured-host':'zh-grid-host'} ${status}" data-host-id="${esc(h.id)}">
    <div class="zh-person-media">${homeCover(h,featured)}${homeCardVideo(h)}<div class="zh-photo-shade"></div>${mediaAction}<span class="zh-person-status ${status}"><i></i>${live?`LIVE <b>&middot;</b> ${homeCompact(h.viewers)}${featured?' watching':''}`:h.on?'Online':'Offline'}</span>${featured&&!live?'<span class="zh-featured-label">Featured creator</span>':!featured&&h.cat?`<span class="zh-person-topic">${esc(h.cat)}</span>`:''}${featured?'':profile}</div>
    <div class="zh-person-content">${featured?profile:''}
    <footer class="zh-person-footer"><button type="button" class="zh-person-action zh-person-chat" aria-label="Chat with ${esc(h.n)}" title="${esc(chatReason||'Open conversation')}" onclick="homeDashboardChat('${id}')" ${chatReason?'disabled':''}>${hi('chat',16)}<span>Chat</span></button><button type="button" class="zh-person-action zh-person-call" aria-label="Video call ${esc(h.n)}" title="${esc(unavailable||'Review your video call')}" onclick="homeDashboardCall('${id}')" ${available?'':'disabled'}>${hi('vid',16)} ${featured?'Instant call':'Call'}</button></footer></div>
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
function homeDashboardSkeleton(label='Loading creators',count=4){
  return `<div class="zh-skeleton" role="status" aria-label="${esc(label)}" aria-busy="true"><div class="zh-grid" aria-hidden="true">${Array.from({length:count},()=>`<div class="zh-person-card zh-grid-host zh-person-placeholder"><div class="zh-person-media zh-skeleton-shape"><div class="zh-placeholder-name">${skeletonLine('75%',15)}${skeletonLine('90%',10)}</div></div><div class="zh-person-content"><div class="zh-person-footer">${skeletonLine('46%',44)}${skeletonLine('46%',44)}</div></div></div>`).join('')}</div></div>`;
}
function homeDashboardHeroSkeleton(){return `<div class="zh-skeleton" role="status" aria-label="Loading featured creator" aria-busy="true"><div class="zh-person-card zh-featured-host zh-hero-placeholder zh-skeleton-shape" aria-hidden="true"><div class="zh-person-content">${skeletonLine('55%',25)}${skeletonLine('80%',12)}<div class="zh-person-footer">${skeletonLine('35%',46)}${skeletonLine('60%',46)}</div></div></div></div>`}
function homeDashboardEmpty(){
  const filtered=Home.dashboardFilter!=='popular';
  const title=Home.dashboardFilter==='instant'?'No one available to call':filtered?'No hosts in this category':'No hosts to show right now';
  const description=filtered?'Try all hosts, or explore creators to find your kind of conversation.':'Explore creators or catch up in chats while someone becomes available.';
  const primary=filtered?`<button type="button" class="zh-empty-primary" onclick="homeDashboardFilter('popular')">${hi('people',18)} Show all hosts</button>`:`<button type="button" class="zh-empty-primary" onclick="go('explore')">${hi('explore',18)} Explore creators</button>`;
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
  // The large card goes to someone reachable now; an offline featured host stays in the grid.
  const reachable=h=>h.on||homeDashboardIsLive(h);
  const featured=all.find(h=>h.id===Home.featured?.id&&reachable(h))||hosts.live[0]||all.find(reachable)||all[0],remaining=featured?all.filter(h=>h.id!==featured.id):[];
  const hero=pending?homeDashboardHeroSkeleton():!error&&featured?homeDashboardCard(featured,true):'';
  const grid=pending?homeDashboardSkeleton():error?'':remaining.length?`<div class="zh-grid">${remaining.map(h=>homeDashboardCard(h)).join('')}</div>`:!featured?homeDashboardEmpty():'';
  return `<div class="zh-home zh-dashboard"><h1 class="zh-home-title">Meet your next conversation</h1>${homeDashboardHostEntry()}${homeDashboardStories(hosts,pending,error,more)}${homeDashboardFilters()}${error?`<div class="zh-error" role="alert">${esc(error)}<button type="button" onclick="homeLoad()">Retry</button></div>`:''}${hero}${!pending&&!error?window.ZimiAds?.card('home')||'':''}<section class="zh-discover" aria-label="Meet your next conversation"><div class="zh-section-title"><h2>Connect 1:1</h2><div class="zh-live-tools"><button type="button" class="zh-home-refresh" aria-label="Refresh home" title="Refresh home" aria-busy="${!!(pending||more)}" onclick="homeLoad()" ${pending||more?'disabled':''}>${hi('refresh',17)}</button><button type="button" class="zh-see-all" onclick="go('explore')">See all ${hi('arrow',15)}</button></div></div>${grid}</section>${more?homeDashboardSkeleton('Loading more hosts',2):moreError?`<div class="zh-error" role="alert">${esc(moreError)}<button onclick="homeLoad(true)">Retry loading more hosts</button></div>`:!pending&&!error&&Home.hosts.length<Home.total?'<button class="zh-load-more" onclick="homeLoad(true)">Load more hosts</button>':''}${DEMO?'<p class="zh-preview-note">Design preview &middot; sample hosts'+MODEL_NOTE+'</p>':''}</div>${homeGiftSheet()}`;
}
