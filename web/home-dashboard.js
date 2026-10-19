/* Home keeps discovery compact; every action reuses the authenticated app flow. */
function homeDashboardSearch(){go('search');document.getElementById('sq')?.focus()}
function homeAvailableCreators(){
  homeFilter('instant');
  document.querySelector('.zh-discover')?.scrollIntoView({block:'start',behavior:'instant'});
}
function homeDashboardFilters(){
  const filters=[['popular','For you'],...(!isHost()?[['instant','Available now']]:[]),...Home.categories.map(category=>[category,category])];
  return `<div class="zh-filters" role="group" aria-label="Browse categories">${filters.map(([key,label])=>`<button type="button" class="${Home.filter===key?'selected':''}" data-home-filter="${esc(key)}" aria-pressed="${Home.filter===key}" onclick="homeFilter(this.dataset.homeFilter)">${key==='instant'?hi('bolt',14):''}<span>${esc(label)}</span></button>`).join('')}</div>`;
}
function homeDashboardShortcuts(){
  const pending=homeContentPending(),error=homeContentError(),host=isApprovedHost();
  const availability=pending?`<span role="status" aria-label="Loading call availability" aria-busy="true">${skeletonLine('78px',11)}</span>`:error?'Browse creators':Home.availableCount?`${homeCompact(Home.availableCount)} available now`:'Check availability';
  const create=host?`<button type="button" class="zh-shortcut" aria-label="Start a live broadcast" onclick="homeGoLive()"><span class="zh-shortcut-icon">${hi('broadcast',21)}</span><span class="zh-shortcut-copy"><b>Go live</b><small>Start your own room</small></span></button>`:
    `<button type="button" class="zh-shortcut" aria-label="Browse available creators" onclick="homeAvailableCreators()"><span class="zh-shortcut-icon">${hi('vid',21)}</span><span class="zh-shortcut-copy"><b>1-on-1 calls</b><small>${availability}</small></span></button>`;
  return `<div class="zh-shortcuts" aria-label="Quick actions">${create}<button type="button" class="zh-shortcut" aria-label="Open your chats" onclick="go('chats')"><span class="zh-shortcut-icon">${hi('chat',21)}</span><span class="zh-shortcut-copy"><b>Your chats</b><small>Keep in touch</small></span></button></div>`;
}
function homeDashboardLive(){
  const pending=homeContentPending(),error=homeContentError(),rows=Home.stage.filter(person=>person.stream).slice(0,8);
  if(error||(!pending&&!rows.length))return '';
  const body=pending?`<div class="zh-live-list" role="status" aria-label="Loading live creators" aria-busy="true">${Array.from({length:3},()=>`<div class="zh-live-card zh-live-placeholder" aria-hidden="true"><span class="zh-live-avatar zh-skeleton-shape"></span><span class="zh-live-copy">${skeletonLine('70px',13)}${skeletonLine('45px',10)}</span></div>`).join('')}</div>`:
    `<div class="zh-live-list">${rows.map(h=>`<button type="button" class="zh-live-card" aria-label="Watch ${esc(h.n)} live" onclick="homeOpen('${domId(h.id)}')"><span class="zh-live-avatar">${homeCover(h)}</span><span class="zh-live-copy"><b>${esc(first(h.n))}</b><small>${esc(h.cat||'Live room')}</small></span><span class="zh-live-dot" aria-hidden="true"></span></button>`).join('')}</div>`;
  return `<section class="zh-stage zh-live-section" aria-label="Live creators"><div class="zh-section-title"><h2>Live now</h2></div>${body}</section>`;
}
function homeDashboardCard(h){
  const id=domId(h.id),live=!!h.stream,available=!!h.available&&!isHost();
  const status=live?'Live':h.available?'Available':h.on?'Online':'Offline';
  const unavailable=isHost()?'Video calls are available from a member account':!h.available?'This creator is not taking calls right now':'';
  return `<article class="zh-tile zh-person-card">
    <button type="button" class="zh-person-profile" aria-label="View ${esc(h.n)} profile" onclick="go('host','${id}')">
      <div class="zh-person-photo">${homeCover(h)}<span class="zh-person-status ${live?'is-live':h.available?'is-available':''}">${live||h.available?'<i></i>':''}${status}</span></div>
      <div class="zh-person-info"><h3><span>${esc(h.n)}</span>${homeVerified(h)}</h3><p>${esc(h.cat||h.tag||'Creator')}</p>${live?`<span class="zh-person-watching">${hi('eye',12)} ${homeCompact(h.viewers)} watching</span>`:''}</div>
    </button>
    <footer class="zh-person-footer"><button type="button" class="zh-person-action" aria-label="Video call ${esc(h.n)}" title="${esc(unavailable||'Review your video call')}" onclick="homeDashboardCall('${id}')" ${available?'':'disabled'}>${hi('vid',17)} Video call</button></footer>
  </article>`;
}
function homeDashboardCall(id){
  const h=g(id);
  if(!h||!h.available||isHost()||Home.dashboardCall||Home.streamBusy||Home.preparingCall)return;
  if(Home.pendingClose)return appNotice(Home.closeError||'Finishing the previous live session…');
  // Review cost and balance before joining a room, requesting a call or capture.
  Home.dashboardSetup={hostId:id,streamId:h.stream?.id||null};
  S.pcerr='';
  homeCall(id);
}
function homeDashboardConfirmCall(){
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
function homeDashboardSkeleton(){
  return `<div class="zh-skeleton" role="status" aria-label="Loading creators" aria-busy="true"><div class="zh-grid" aria-hidden="true">${Array.from({length:4},()=>`<div class="zh-person-card zh-person-placeholder"><div class="zh-person-photo zh-skeleton-shape"></div><div class="zh-person-info">${skeletonLine('70%',15)}${skeletonLine('45%',11)}</div><div class="zh-person-footer">${skeletonLine('100%',44)}</div></div>`).join('')}</div></div>`;
}
function homeDashboardMatch(){
  if(isHost()||!Home.speedMatchEnabled||homeContentError())return '';
  if(homeContentPending())return `<section class="zh-match zh-home-match">${contentSkeleton('match','Loading video matches')}</section>`;
  return `<section class="zh-match zh-home-match"><div><h2>Not sure who to meet?</h2><p>${Home.availableCount?'Review your match before you call.':'No creators are available right now.'}</p></div><button type="button" class="zh-primary" onclick="homeMatchNow()" ${Home.matching||!Home.availableCount?'disabled':''}>${hi('bolt',17)} ${Home.matching?'Finding a match…':'Find a match'}</button></section>`;
}
function homeDashboard(){
  const pending=homeContentPending(),error=!pending&&homeContentError(),rows=homeList();
  const featured=Home.featured&&(rows.find(person=>person.id===Home.featured.id)||Home.featured);
  const list=Home.filter==='popular'&&featured?[featured,...rows.filter(person=>person.id!==featured.id)]:rows;
  const name=first(me.n||'');
  return `<div class="zh-home zh-dashboard">
    <header class="zh-welcome"><div><p class="zh-welcome-label">${name&&name!=='You'?`Hi, ${esc(name)}`:'Welcome to Zimi'}</p><h1>Find your people.</h1><p>Discover live rooms and one-on-one calls.</p></div><button type="button" class="zh-home-refresh" aria-label="Refresh home" onclick="homeLoad()" ${pending?'disabled':''}>${hi('refresh',19)}</button></header>
    <button type="button" class="zh-home-search" aria-label="Find a creator" onclick="homeDashboardSearch()">${hi('srch',19)}<span>Search creators or categories</span>${hi('arrow',17)}</button>
    ${homeDashboardShortcuts()}${homeDashboardLive()}
    <section class="zh-trending zh-discover" aria-label="Discover creators"><div class="zh-section-title"><h2>Meet the community</h2><button type="button" onclick="go('explore')">View all ${hi('arrow',14)}</button></div>${homeDashboardFilters()}
      ${pending?homeDashboardSkeleton():error?`<div class="zh-error" role="alert">${esc(error)}<button type="button" onclick="homeLoad()">Retry</button></div>`:list.length?`<div class="zh-grid">${list.slice(0,4).map(homeDashboardCard).join('')}</div>`:homeEmpty()}
    </section>
    ${homeDashboardMatch()}${homeBonus()}${DEMO?'<p class="zh-preview-note">Design preview &middot; sample creators and activity</p>':''}
  </div>${homeGiftSheet()}`;
}
