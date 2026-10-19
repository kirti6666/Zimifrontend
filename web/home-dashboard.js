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
  const action=live?`homeOpen('${id}')`:available?`homeCall('${id}')`:`go('host','${id}')`;
  const label=live?'Join live':available?'Call':'View profile';
  const accessible=live?`Watch ${h.n} live`:available?`Call ${h.n}`:`View ${h.n} profile`;
  return `<article class="zh-tile zh-person-card">
    <button type="button" class="zh-person-profile" aria-label="View ${esc(h.n)} profile" onclick="go('host','${id}')">
      <div class="zh-person-photo">${homeCover(h)}<span class="zh-person-status ${live?'is-live':h.available?'is-available':''}">${live||h.available?'<i></i>':''}${status}</span></div>
      <div class="zh-person-info"><h3><span>${esc(h.n)}</span>${homeVerified(h)}</h3><p>${esc(h.cat||h.tag||'Creator')}</p></div>
    </button>
    <footer class="zh-person-footer">${live?`<span class="zh-person-cost"><small>Watching</small><b>${homeCompact(h.viewers)}</b></span>`:available?`<span class="zh-person-cost"><small>Call rate</small><b>${homeRate(h)}</b></span>`:''}<button type="button" class="zh-person-action" aria-label="${esc(accessible)}" onclick="${action}">${hi(live?'play':available?'vid':'user',16)} ${label}</button></footer>
  </article>`;
}
function homeDashboardSkeleton(){
  return `<div class="zh-skeleton" role="status" aria-label="Loading creators" aria-busy="true"><div class="zh-grid" aria-hidden="true">${Array.from({length:4},()=>`<div class="zh-person-card zh-person-placeholder"><div class="zh-person-photo zh-skeleton-shape"></div><div class="zh-person-info">${skeletonLine('70%',15)}${skeletonLine('45%',11)}</div><div class="zh-person-footer">${skeletonLine('42%',30)}${skeletonLine('46%',38)}</div></div>`).join('')}</div></div>`;
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
