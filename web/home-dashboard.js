/* Photo-led Home discovery; colors follow the selected theme. */
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
// Only an approved host account sees its own availability: a floating button over Home,
// where the reference places its LIVE button. It opens the 1:1 call setup.
function homeDashboardHostEntry(){
  if(!isApprovedHost()&&!(window.ZimiHostAccess?.checking()&&S.role==='host'))return '';
  const online=!!S.online;
  return `<button type="button" class="zh-host-status ${online?'is-online':''}" onclick="homeDashboardHostOpen()" aria-label="${online?'Manage your call availability':'Get ready to go online'}">${hi('vid',20)}<span>${online?'Online':'Go online'}</span>${online?'<i aria-hidden="true"></i>':''}</button>`;
}
function homeDashboardStories(hosts,pending,error,more){
  if(!window.ZIMI_LIVE_STREAMING_ENABLED)return '';
  const rows=[...hosts.live].sort((a,b)=>Number(b.id===Home.featured?.id)-Number(a.id===Home.featured?.id)).slice(0,12);
  if(!rows.length||error)return '';
  const create=isApprovedHost()?`<button type="button" class="zh-live-shortcut zh-live-create" aria-label="Start your live" onclick="homeGoLive()"><span class="zh-live-ring">${hi('plus',25)}</span><span>You</span></button>`:'';
  const loading=`<div class="zh-skeleton zh-story-loading" role="status" aria-label="Loading live creators" aria-busy="true"><div class="zh-live-rail" aria-hidden="true">${Array.from({length:4},()=>`<span class="zh-live-shortcut"><span class="zh-live-ring zh-skeleton-shape"></span>${skeletonLine('38px',10)}</span>`).join('')}</div></div>`;
  const rail=rows.map(h=>`<button type="button" class="zh-live-shortcut" aria-label="Join ${esc(h.n)} live" onclick="homeOpen('${domId(h.id)}')"><span class="zh-live-ring">${homeCover(h)}</span><span>${esc(first(h.n))}</span></button>`).join('');
  return `<section class="zh-live-section" aria-label="Live hosts"><div class="zh-section-title"><h2><i class="zh-heading-dot"></i>Live now</h2><div class="zh-live-tools">${!pending?`<span>${n(rows.length)} live</span>`:''}</div></div>${pending?loading:`<div class="zh-live-rail">${create}${rail}</div>`}</section>`;
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
function homeDashboardEmpty(){
  const following=Home.dashboardFilter==='following',region=homeRegionShown()&&Home.region;
  const title=following?'No followed creators yet':region?`No creators from ${esc(region)} right now`:'No hosts to show right now';
  const description=following?'Follow a creator from Explore to see them here.':region?'Pull down to refresh, or see creators from every country.':'Pull down to refresh or browse all creator profiles.';
  const primary=following?`<button type="button" class="zh-empty-primary" onclick="homeDashboardFilter('popular')">${hi('explore',18)} Explore creators</button>`:region?`<button type="button" class="zh-empty-primary" onclick="homeRegion('')">${hi('explore',18)} Show Popular</button>`:`<button type="button" class="zh-empty-primary" onclick="go('all-creators')">${hi('explore',18)} All creators</button>`;
  return `<div class="zh-host-empty">
    <div class="zh-home-empty-scene" aria-hidden="true"><span class="zh-empty-orbit"></span><span class="zh-empty-stage zh-empty-photo"><img src="${OB_MEDIA[1]}" alt="" decoding="async"></span><span class="zh-empty-satellite zh-empty-chat">${hi('chat',21)}</span><span class="zh-empty-satellite zh-empty-music">${hi('music',20)}</span><span class="zh-empty-satellite zh-empty-spark">${hi('star',15)}</span><i class="zh-empty-dot"></i><i class="zh-empty-dot"></i></div>
    <span class="zh-empty-eyebrow">Good company is worth the wait</span><h3>${title}</h3><p>${description}</p>
    <div class="zh-empty-actions">${primary}</div>
  </div><div class="zh-empty-links" aria-label="More ways to connect"><button type="button" onclick="go('chats')"><span class="zh-empty-link-icon">${hi('chat',22)}</span><strong>Your chats</strong><span>Keep the conversation going</span>${hi('arrow',16)}</button><button type="button" aria-label="Find a creator" onclick="go('search')"><span class="zh-empty-link-icon">${hi('srch',22)}</span><strong>Find your people</strong><span>Search for a creator you love</span>${hi('arrow',16)}</button></div>`;
}
// Hosts and members share the same discovery feed; approved hosts also go online.
function homeDashboard(){
  const pending=homeContentPending(),more=!DEMO&&Home.loadingMore&&(Home.loading||contentPending('home'));
  const failure=!pending&&!more&&homeContentError(),moreError=ContentLoading.home.page>1?failure:'',error=moreError?'':failure;
  const hosts=homeDashboardHosts(),all=hosts.all,feed=HOME_FEEDS.find(([key])=>key===Home.dashboardFilter)||HOME_FEEDS[1];
  const grid=pending?homeDashboardSkeleton('Loading creators',6):error?'':all.length?`<div id="home-host-grid" class="zh-grid">${homeGridWithAd(all.map(homeTile),'home')}</div>`:homeDashboardEmpty()+(window.ZimiAds?.campaigns('home')||'')+(window.ZimiAds?.card('home')||'');
  return `<div id="home-feed-panel" class="zh-home zh-dashboard" role="tabpanel" aria-labelledby="home-tab-${feed[0]}"><h1 class="zh-home-title">${feed[1]}</h1>${homeRegionChips()}${homeDashboardStories(hosts,pending,error,more)}${error?`<div class="zh-error" role="alert">${esc(error)}<button type="button" onclick="homeLoad()">Retry</button></div>`:''}<section class="zh-discover" aria-label="${feed[1]} creators">${grid}</section>${homeRefreshNotice()}${more?homeDashboardSkeleton('Loading more hosts',2):moreError?`<div class="zh-error" role="alert">${esc(moreError)}<button onclick="homeLoad(true)">Retry loading more hosts</button></div>`:!DEMO&&!pending&&!error&&Home.hasMore?'<div id="home-feed-next" class="zh-feed-next" aria-hidden="true"></div>':''}${DEMO?'<p class="zh-preview-note">Design preview &middot; sample hosts'+MODEL_NOTE+'</p>':''}${homeDashboardHostEntry()}</div>${homeGiftSheet()}`;
}

/* Observe the actual app scroller. Keep one listener/observer, even when live
   wallet or presence messages patch Home repeatedly. Older WebViews use the
   same bounded check from a passive scroll listener. */
const HomeInfinite=(()=>{
  const margin=240;
  let root=null,target=null,observer=null,frame=0,generation=0,query='',foreground=true;
  const scope=()=>!DEMO&&S.loggedIn&&S.v==='home';
  function ready(){return scope()&&foreground&&!document.hidden&&!window.ZimiOffline?.isOffline()&&Home.loaded&&Home.hasMore&&Home.page<1000&&Home.hosts.length<Home.total&&Home.queryKey===homeFeedKey()&&!Home.loading&&!contentPending('home')&&!Home.error&&!ContentLoading.home.error}
  function check(){
    frame=0;
    if(!ready()||!root?.isConnected||!target?.isConnected||query!==Home.queryKey||target!==document.getElementById('home-feed-next'))return;
    const viewport=root.getBoundingClientRect(),footer=target.getBoundingClientRect();
    if(root.clientHeight>0&&footer.top<=viewport.bottom+margin&&footer.bottom>=viewport.top)homeLoad(true);
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(check)}
  function reset(){
    generation++;observer?.disconnect();observer=null;
    root?.removeEventListener('scroll',schedule);
    if(frame)cancelAnimationFrame(frame);
    frame=0;root=null;target=null;query='';
  }
  function attach(){
    const nextRoot=document.getElementById('scroll-root'),next=scope()&&foreground&&!document.hidden&&document.getElementById('home-feed-next');
    if(!next||!nextRoot){reset();return}
    if(root!==nextRoot||target!==next||query!==Home.queryKey){
      reset();root=nextRoot;target=next;query=Home.queryKey;
      const own=generation;
      root.addEventListener('scroll',schedule,{passive:true});
      if(typeof IntersectionObserver==='function'){
        observer=new IntersectionObserver(entries=>{if(own===generation&&entries.some(entry=>entry.target===target&&entry.isIntersecting))schedule()},{root,rootMargin:`0px 0px ${margin}px 0px`});
        observer.observe(target);
      }
    }
    schedule();
  }
  const previous=ZimiHome.afterRender;
  ZimiHome.afterRender=()=>{previous();attach()};
  window.addEventListener('resize',schedule,{passive:true});
  document.addEventListener('visibilitychange',attach);
  document.addEventListener('aurora:navigate',attach);
  window.addEventListener('pagehide',reset);
  window.addEventListener('pageshow',attach);
  Native.on('app.background',()=>{foreground=false;reset()});
  Native.on('app.foreground',()=>{foreground=true;attach()});
  Native.on('connection.status',schedule);
  Native.on('session.none',reset);Native.on('session.expired',reset);
  return {reset};
})();

/* Each approved-host directory keeps its own query and pages. Only the selected
   tab paints, so an in-flight read cannot replace the other tab's input/caret. */
function hostDirectoryStateNew(){return {owner:'',rows:[],query:'',resultQuery:'',page:0,requestedPage:1,total:0,loaded:false,loadedAt:0,loading:false,more:false,error:'',timer:null,remembered:new Set()}}
const HostUsers=hostDirectoryStateNew(),HostActiveHosts=hostDirectoryStateNew(),HostBrowse={tab:'members'};
const HOST_DIRECTORY_TABS=[['members','Members'],['active','Active Hosts']];
function hostDirectoryState(tab=HostBrowse.tab){return tab==='active'?HostActiveHosts:HostUsers}
function hostDirectoryNeedsLoad(tab=HostBrowse.tab){const state=hostDirectoryState(tab);return !state.loading&&(!state.loaded||tab==='active'&&Date.now()-state.loadedAt>30000)}
function hostDirectorySearchLabel(){return HostBrowse.tab==='active'?'Search active hosts':'Search users by name or ID'}
function hostUsersHeader(){return `<header class="zh-header zh-home-header zh-users-header"><div class="zh-host-tabs" role="tablist" aria-label="Host directory" onkeydown="hostDirectoryTabKey(event)">${HOST_DIRECTORY_TABS.map(([tab,label])=>`<button type="button" id="host-directory-tab-${tab}" role="tab" aria-selected="${HostBrowse.tab===tab}" aria-controls="host-directory-panel" tabindex="${HostBrowse.tab===tab?'0':'-1'}" onclick="hostDirectoryTab('${tab}')">${label}</button>`).join('')}</div><div class="zh-header-actions"><button type="button" class="zh-icon" onclick="document.getElementById('host-user-search')?.focus()" aria-label="${HostBrowse.tab==='active'?'Search active hosts':'Search users'}">${hi('srch',25)}</button><button type="button" class="zh-icon zh-trophy" onclick="go('board')" aria-label="Leaderboard">${hi('trophy',27)}</button></div></header>`}
function hostDirectoryTab(tab){
  if(!isApprovedHost()||S.v!=='search'||!HOST_DIRECTORY_TABS.some(([key])=>key===tab)||HostBrowse.tab===tab)return;
  HostBrowse.tab=tab;S.sq=hostDirectoryState().query;r();document.getElementById('sq')?.focus();
  if(hostDirectoryNeedsLoad())hostDirectoryLoad();
}
function hostDirectoryTabKey(event){
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();
  const tabs=HOST_DIRECTORY_TABS.map(([key])=>key),at=tabs.indexOf(HostBrowse.tab);
  const next=event.key==='Home'?tabs[0]:event.key==='End'?tabs.at(-1):tabs[(at+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];
  hostDirectoryTab(next);document.getElementById('host-directory-tab-'+next)?.focus();
}
function hostDirectoryPaint(tab){
  if(!isApprovedHost()||HostBrowse.tab!==tab||S.v!=='search')return;
  const results=document.getElementById('home-search-results');
  if(results){results.innerHTML=hostDirectoryResults(tab);results.setAttribute('aria-busy',String(hostDirectoryState().loading))}
  contentImagesReady();window.ZimiLaunch?.check();
}
function hostUsersPaint(){hostDirectoryPaint('members')}
function hostDirectoryLoad(more=false,tab=HostBrowse.tab){
  if(!isApprovedHost())return;
  const state=hostDirectoryState(tab),maxPage=tab==='active'?1000:10000;
  if(more&&(state.loading||state.rows.length>=state.total||state.page>=maxPage))return;
  clearTimeout(state.timer);state.timer=null;
  const q=state.query.trim(),page=more?state.page+1:1;
  Object.assign(state,{loading:true,more,error:'',requestedPage:page});hostDirectoryPaint(tab);
  if(DEMO){Object.assign(state,{rows:[],loaded:true,loading:false,more:false,page:1,total:0,resultQuery:q});hostDirectoryPaint(tab);return}
  Native.send(tab==='active'?'hosts.active.load':'users.load',{q,page});
}
function hostUsersLoad(more=false){hostDirectoryLoad(more,'members')}
function hostDirectorySearch(value,tab=HostBrowse.tab){
  const state=hostDirectoryState(tab);state.query=String(value).slice(0,tab==='active'?80:100);S.sq=state.query;
  clearTimeout(state.timer);Object.assign(state,{loading:true,more:false,error:'',requestedPage:1});hostDirectoryPaint(tab);
  state.timer=setTimeout(()=>hostDirectoryLoad(false,tab),280);
}
function hostUsersSearch(value){hostDirectorySearch(value,'members')}
function hostDirectoryPeer(id,tab){
  if(!isApprovedHost()){window.ZimiHostAccess?.guard();return null}
  const state=hostDirectoryState(tab),user=state.rows.find(row=>row.id===id);if(!user)return null;
  // Chat/profile helpers share identity through g(), without turning this member
  // into a verified creator or inventing online presence.
  const known=g(id);if(known)Object.assign(known,user);else EXTRA.push({...user});
  state.remembered.add(id);
  return user;
}
function hostUsersPeer(id){return hostDirectoryPeer(id,'members')}
function hostUsersOpen(id,action){
  const user=hostUsersPeer(id);if(!user)return;
  if(action==='chat')return zcOpen(id);
  if(action==='voice'||action==='video')return hostCallMember(id,action==='voice',{name:user.n,avatarUrl:user.avatarUrl,city:user.c,gender:user.gender});
  go('user',id);
}
function hostUsersRow(user){
  const id=domId(user.id),name=esc(user.n);
  return `<article class="zh-user-row" data-user-id="${esc(user.id)}"><button type="button" class="zh-user-person" onclick="hostUsersOpen('${id}','profile')" aria-label="View ${name} profile"><span class="zh-user-avatar">${homeCover(user)}<i class="${user.on?'is-online':''}" aria-hidden="true"></i></span><span class="zh-user-identity"><strong>${name}</strong><small>${user.on?'Online':'Offline'}${user.c?' · '+esc(user.c):''}</small></span></button><div class="zh-user-actions"><button type="button" onclick="hostUsersOpen('${id}','chat')" aria-label="Chat with ${name}">${hi('chat',20)}</button><button type="button" onclick="hostUsersOpen('${id}','voice')" aria-label="Voice call ${name}">${hi('ph',20)}</button><button type="button" class="zh-user-video" onclick="hostUsersOpen('${id}','video')" aria-label="Video call ${name}">${hi('vid',20)}</button></div></article>`;
}
function hostActiveHostsOpen(id,action){
  const host=hostDirectoryPeer(id,'active');if(!host)return;
  if(action==='chat')return zcOpen(id);
  if(action==='profile')go('host',id);
}
function hostActiveHostsRow(host){
  const id=domId(host.id),name=esc(host.n);
  return `<article class="zh-user-row zh-active-host-row" data-user-id="${esc(host.id)}"><button type="button" class="zh-user-person" onclick="hostActiveHostsOpen('${id}','profile')" aria-label="View ${name} profile"><span class="zh-user-avatar">${homeCover(host)}<i class="${host.on?'is-online':''}" aria-hidden="true"></i></span><span class="zh-user-identity"><strong>${name}</strong><small>${host.on?'Online':'Offline'}${host.c?' · '+esc(host.c):''}</small></span></button><div class="zh-user-actions"><button type="button" onclick="hostActiveHostsOpen('${id}','chat')" aria-label="Chat with ${name}">${hi('chat',20)}</button></div></article>`;
}
function hostDirectoryResults(tab=HostBrowse.tab){
  const active=tab==='active',state=hostDirectoryState(tab),noun=active?'active hosts':'users',pending=state.loading||!state.loaded,rows=state.resultQuery===state.query.trim()?state.rows:[],more=pending&&state.more;
  if(pending&&!more)return contentSkeleton('rows','Loading '+noun,6);
  const error=state.error,moreError=error&&state.requestedPage>1,load=`hostDirectoryLoad(false,'${tab}')`,loadMore=`hostDirectoryLoad(true,'${tab}')`;
  if(error&&!moreError)return `<div class="zh-error" role="alert">${esc(error)}<button type="button" onclick="${load}">Retry</button></div>`;
  return `${rows.length?`<div class="zh-user-list" aria-label="${active?'Active hosts':'Members'}">${rows.map(active?hostActiveHostsRow:hostUsersRow).join('')}</div>`:`<div class="zh-empty"><h3>${active?'No active hosts found':state.query.trim()?'No users found':'No users to show yet'}</h3><p>${active?(state.query.trim()?'Try another host name.':'Hosts will appear here when they are online.'):state.query.trim()?'Try another name or user ID.':'Members will appear here when they join.'}</p></div>`}${more?contentSkeleton('rows','Loading more '+noun,3):moreError?`<div class="zh-error" role="alert">${esc(error)}<button type="button" onclick="${loadMore}">Retry loading more ${noun}</button></div>`:rows.length<state.total&&state.page<(active?1000:10000)?`<button type="button" class="zh-load-more" onclick="${loadMore}">Load more ${noun}</button>`:''}`;
}
function hostUsersResults(){return hostDirectoryResults('members')}
function hostUsersForget(id){for(const list of [H,EXTRA]){const at=list.findIndex(user=>user.id===id);if(at>=0)list.splice(at,1)}delete PEOPLE[id];HostUsers.remembered.delete(id);HostActiveHosts.remembered.delete(id)}
function hostUsersReset(){for(const state of [HostUsers,HostActiveHosts]){clearTimeout(state.timer);for(const id of state.remembered)hostUsersForget(id);Object.assign(state,hostDirectoryStateNew())}HostBrowse.tab='members';S.sq=''}
function hostUsersEnsureAccount(){const owner=S.user?.id||'';if(HostUsers.owner!==owner){hostUsersReset();HostUsers.owner=owner;HostActiveHosts.owner=owner}}
Native.on('data.users',data=>{
  if(!isApprovedHost()||data.q!==HostUsers.query.trim()||data.page!==HostUsers.requestedPage)return;
  const rows=(data.users||[]).filter(user=>user.serverRole==='user'&&user.id!==S.user?.id).map(homeCreator);
  HostUsers.rows=data.page>1?[...HostUsers.rows,...rows.filter(user=>!HostUsers.rows.some(old=>old.id===user.id))]:rows;
  Object.assign(HostUsers,{loaded:true,loading:false,more:false,error:'',page:data.page,total:data.total,resultQuery:data.q});hostUsersPaint();
});
Native.on('data.activeHosts',data=>{
  if(!isApprovedHost()||data.q!==HostActiveHosts.query.trim()||data.page!==HostActiveHosts.requestedPage)return;
  // The dedicated server read applies online/approval/privacy filters before
  // pagination. Keep its real presence instead of hostFrom's callable-host tag.
  const rows=(data.hosts||[]).filter(host=>(host.serverRole==='host'||host.role==='host')&&host.verified===true&&host.online===true&&host.id!==S.user?.id).map(host=>({...homeCreator(host),on:host.online?1:0}));
  HostActiveHosts.rows=data.page>1?[...HostActiveHosts.rows,...rows.filter(host=>!HostActiveHosts.rows.some(old=>old.id===host.id))]:rows;
  Object.assign(HostActiveHosts,{loaded:true,loadedAt:Date.now(),loading:false,more:false,error:'',page:data.page,total:data.total,resultQuery:data.q});hostDirectoryPaint('active');
});
Native.on('data.loading',data=>{
  const tab=data.resource==='users'?'members':data.resource==='activeHosts'?'active':null;if(!tab||!isApprovedHost())return;
  const state=hostDirectoryState(tab);if((data.q||'')!==state.query.trim()||data.page!==state.requestedPage)return;
  Object.assign(state,{loading:!!data.loading,more:!!data.loading&&data.page>1,error:data.error||''});
  if(data.error)state.loaded=true;hostDirectoryPaint(tab);
});
function hostDirectoryEnsureLoaded(){hostUsersEnsureAccount();if(hostDirectoryNeedsLoad())hostDirectoryLoad()}
Native.on('session',()=>{hostUsersEnsureAccount();if(isApprovedHost()&&S.v==='search')hostDirectoryEnsureLoaded()});
Native.on('session.none',hostUsersReset);Native.on('session.expired',hostUsersReset);
window.addEventListener('zimi:host-access',event=>{if(event.detail.checking)return;if(!event.detail.approved){hostUsersReset();if(['home','search'].includes(S.v))r()}else if(S.v==='search')hostDirectoryEnsureLoaded()});
document.addEventListener('aurora:navigate',()=>{if(isApprovedHost()&&S.v==='search')hostDirectoryEnsureLoaded()});
Native.on('block.saved',data=>{if(!isApprovedHost())return;for(const state of [HostUsers,HostActiveHosts]){if(data.blocked)state.rows=state.rows.filter(user=>user.id!==data.id);state.loaded=false}if(data.blocked){hostUsersForget(data.id);hostDirectoryPaint(HostBrowse.tab)}if(S.v==='search')hostDirectoryLoad()});
Native.on('app.foreground',()=>{if(isApprovedHost()&&S.v==='search'&&!hostDirectoryState().loading)hostDirectoryLoad()});
