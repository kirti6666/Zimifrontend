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
// Like the reference: the country chips, then one square-card grid. Hosts keep loading with "Load more".
function homeDashboard(){
  if(isApprovedHost())return hostUsersScreen();
  const pending=homeContentPending(),more=!DEMO&&Home.loadingMore&&(Home.loading||contentPending('home'));
  const failure=!pending&&!more&&homeContentError(),moreError=ContentLoading.home.page>1?failure:'',error=moreError?'':failure;
  const hosts=homeDashboardHosts(),all=hosts.all,feed=HOME_FEEDS.find(([key])=>key===Home.dashboardFilter)||HOME_FEEDS[1];
  const grid=pending?homeDashboardSkeleton('Loading creators',6):error?'':all.length?`<div id="home-host-grid" class="zh-grid">${homeGridWithAd(all.map(homeTile),'home')}</div>`:homeDashboardEmpty()+(window.ZimiAds?.campaigns('home')||'')+(window.ZimiAds?.card('home')||'');
  return `<div id="home-feed-panel" class="zh-home zh-dashboard" role="tabpanel" aria-labelledby="home-tab-${feed[0]}"><h1 class="zh-home-title">${feed[1]}</h1>${homeRegionChips()}${homeDashboardStories(hosts,pending,error,more)}${error?`<div class="zh-error" role="alert">${esc(error)}<button type="button" onclick="homeLoad()">Retry</button></div>`:''}<section class="zh-discover" aria-label="${feed[1]} creators">${grid}</section>${homeRefreshNotice()}${more?homeDashboardSkeleton('Loading more hosts',2):moreError?`<div class="zh-error" role="alert">${esc(moreError)}<button onclick="homeLoad(true)">Retry loading more hosts</button></div>`:!pending&&!error&&Home.hosts.length<Home.total?'<button class="zh-load-more" onclick="homeLoad(true)">Load more hosts</button>':''}${DEMO?'<p class="zh-preview-note">Design preview &middot; sample hosts'+MODEL_NOTE+'</p>':''}${homeDashboardHostEntry()}</div>${homeGiftSheet()}`;
}

/* Approved hosts browse members separately from the creator feeds. Requests are
   paginated and searched on the server; only public identity is held here. */
const HostUsers={owner:'',rows:[],query:'',resultQuery:'',page:0,requestedPage:1,total:0,loaded:false,loading:false,more:false,error:'',timer:null,remembered:new Set()};
function hostUsersHeader(){return `<header class="zh-header zh-users-header"><h1>Users</h1><div class="zh-header-actions"><button type="button" class="zh-icon" onclick="document.getElementById('host-user-search')?.focus()" aria-label="Search users">${hi('srch',25)}</button><button type="button" class="zh-icon zh-trophy" onclick="go('board')" aria-label="Leaderboard">${hi('trophy',27)}</button></div></header>`}
function hostUsersPaint(){if(!isApprovedHost())return;const results=document.getElementById(S.v==='search'?'home-search-results':'host-user-results');if(results)results.innerHTML=hostUsersResults();contentImagesReady();window.ZimiLaunch?.check()}
function hostUsersLoad(more=false){
  if(!isApprovedHost())return;
  if(more&&(HostUsers.loading||HostUsers.rows.length>=HostUsers.total))return;
  clearTimeout(HostUsers.timer);HostUsers.timer=null;
  const q=HostUsers.query.trim(),page=more?HostUsers.page+1:1;
  Object.assign(HostUsers,{loading:true,more,error:'',requestedPage:page});hostUsersPaint();
  if(DEMO){Object.assign(HostUsers,{rows:[],loaded:true,loading:false,more:false,page:1,total:0,resultQuery:q});hostUsersPaint();return}
  Native.send('users.load',{q,page});
}
function hostUsersSearch(value){
  HostUsers.query=String(value).slice(0,100);S.sq=HostUsers.query;
  clearTimeout(HostUsers.timer);Object.assign(HostUsers,{loading:true,more:false,error:'',requestedPage:1});hostUsersPaint();
  HostUsers.timer=setTimeout(()=>hostUsersLoad(),280);
}
function hostUsersPeer(id){
  if(!isApprovedHost()){window.ZimiHostAccess?.guard();return null}
  const user=HostUsers.rows.find(row=>row.id===id);if(!user)return null;
  // Chat/profile helpers share identity through g(), without turning this member
  // into a verified creator or inventing online presence.
  const known=g(id);if(known)Object.assign(known,user);else EXTRA.push({...user});
  HostUsers.remembered.add(id);
  return user;
}
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
function hostUsersResults(){
  const pending=HostUsers.loading||!HostUsers.loaded,rows=HostUsers.resultQuery===HostUsers.query.trim()?HostUsers.rows:[],more=pending&&HostUsers.more;
  if(pending&&!more)return contentSkeleton('rows','Loading users',6);
  const error=HostUsers.error,moreError=error&&HostUsers.requestedPage>1;
  if(error&&!moreError)return `<div class="zh-error" role="alert">${esc(error)}<button type="button" onclick="hostUsersLoad()">Retry</button></div>`;
  return `${rows.length?`<div class="zh-user-list" aria-label="Users">${rows.map(hostUsersRow).join('')}</div>`:`<div class="zh-empty"><h3>${HostUsers.query.trim()?'No users found':'No users to show yet'}</h3><p>${HostUsers.query.trim()?'Try another name or user ID.':'Members will appear here when they join.'}</p></div>`}${more?contentSkeleton('rows','Loading more users',3):moreError?`<div class="zh-error" role="alert">${esc(error)}<button type="button" onclick="hostUsersLoad(true)">Retry loading more users</button></div>`:rows.length<HostUsers.total?'<button type="button" class="zh-load-more" onclick="hostUsersLoad(true)">Load more users</button>':''}`;
}
function hostUsersScreen(){return `<section class="zh-home zh-host-users"><label class="zh-user-search">${hi('srch',20)}<input type="search" id="host-user-search" aria-label="Search users by name or ID" placeholder="Search users by name or ID" maxlength="100" value="${esc(HostUsers.query)}" oninput="hostUsersSearch(this.value)"></label><div id="host-user-results">${hostUsersResults()}</div>${homeDashboardHostEntry()}</section>`}
function hostUsersForget(id){for(const list of [H,EXTRA]){const at=list.findIndex(user=>user.id===id);if(at>=0)list.splice(at,1)}delete PEOPLE[id];HostUsers.remembered.delete(id)}
function hostUsersReset(){clearTimeout(HostUsers.timer);for(const id of HostUsers.remembered)hostUsersForget(id);S.sq='';Object.assign(HostUsers,{owner:'',rows:[],query:'',resultQuery:'',page:0,requestedPage:1,total:0,loaded:false,loading:false,more:false,error:'',timer:null})}
function hostUsersEnsureAccount(){const owner=S.user?.id||'';if(HostUsers.owner!==owner){hostUsersReset();HostUsers.owner=owner}}
Native.on('data.users',data=>{
  if(!isApprovedHost()||data.q!==HostUsers.query.trim()||data.page!==HostUsers.requestedPage)return;
  const rows=(data.users||[]).filter(user=>user.serverRole==='user'&&user.id!==S.user?.id).map(homeCreator);
  HostUsers.rows=data.page>1?[...HostUsers.rows,...rows.filter(user=>!HostUsers.rows.some(old=>old.id===user.id))]:rows;
  Object.assign(HostUsers,{loaded:true,loading:false,more:false,error:'',page:data.page,total:data.total,resultQuery:data.q});hostUsersPaint();
});
Native.on('data.loading',data=>{
  if(data.resource!=='users'||!isApprovedHost()||(data.q||'')!==HostUsers.query.trim()||data.page!==HostUsers.requestedPage)return;
  Object.assign(HostUsers,{loading:!!data.loading,more:!!data.loading&&data.page>1,error:data.error||''});
  if(data.error)HostUsers.loaded=true;hostUsersPaint();
});
Native.on('session',()=>{hostUsersEnsureAccount();if(isApprovedHost()&&S.v==='home'&&!HostUsers.loaded&&!HostUsers.loading)hostUsersLoad()});
Native.on('session.none',hostUsersReset);Native.on('session.expired',hostUsersReset);
window.addEventListener('zimi:host-access',event=>{if(event.detail.checking)return;if(!event.detail.approved){hostUsersReset();if(S.v==='search')r()}else if(S.v==='home'){hostUsersEnsureAccount();if(!HostUsers.loaded&&!HostUsers.loading)hostUsersLoad()}});
document.addEventListener('aurora:navigate',()=>{if(isApprovedHost()&&S.v==='home'){hostUsersEnsureAccount();if(!HostUsers.loaded&&!HostUsers.loading)hostUsersLoad()}});
Native.on('block.saved',data=>{if(!isApprovedHost())return;if(data.blocked){HostUsers.rows=HostUsers.rows.filter(user=>user.id!==data.id);hostUsersForget(data.id);hostUsersPaint()}if(['home','search'].includes(S.v))hostUsersLoad();else HostUsers.loaded=false});
Native.on('app.foreground',()=>{if(isApprovedHost()&&['home','search'].includes(S.v)&&!HostUsers.loading)hostUsersLoad()});
ZimiPullRefresh.register('home',{refresh:()=>isApprovedHost()?hostUsersLoad():homeLoad(),busy:()=>isApprovedHost()?HostUsers.loading:Home.loading||contentPending('home')});
