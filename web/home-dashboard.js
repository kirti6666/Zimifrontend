/* Home shows active hosts only. Chat and Call reuse the authenticated flows. */
function homeDashboardIsLive(h){return !!h.stream&&(!h.stream.status||h.stream.status==='live')}
function homeDashboardHosts(){
  // The paged records are newer than the stage snapshot when both contain a host.
  const hosts=new Map(Home.stage.filter(homeDashboardIsLive).map(h=>[h.id,h]));
  Home.hosts.forEach(h=>hosts.set(h.id,h));
  const active=[...hosts.values()].filter(h=>homeDashboardIsLive(h)||h.on);
  return {live:active.filter(homeDashboardIsLive),online:active.filter(h=>!homeDashboardIsLive(h))};
}
function homeDashboardChat(id){
  const h=g(id);if(!h||(!h.on&&!homeDashboardIsLive(h)))return;
  zcOpen(id);
}
function homeDashboardCard(h){
  const id=domId(h.id),live=homeDashboardIsLive(h),available=!!h.available&&!isHost();
  const chatReason=zcChatBlockReason(h.id);
  const unavailable=isHost()?'Video calls are available from a member account':!h.available?'This host is not taking calls right now':'';
  return `<article class="zh-tile zh-person-card ${live?'is-live':''}" data-host-id="${esc(h.id)}">
    <button type="button" class="zh-person-profile" aria-label="View ${esc(h.n)} profile" onclick="go('host','${id}')">
      <span class="zh-person-photo">${homeCover(h)}<span class="zh-person-status ${live?'is-live':'is-online'}"><i></i>${live?'Live':'Online'}</span></span>
      <span class="zh-person-info"><h3><span>${esc(h.n)}</span>${homeVerified(h)}</h3><p>${esc(h.cat||h.tag||'Host')}</p><span class="zh-person-availability">${live?`${homeCompact(h.viewers)} watching`:h.available?'Available for a call':'Not taking calls'}</span></span>
    </button>
    ${live?`<button type="button" class="zh-person-watch" aria-label="Watch ${esc(h.n)} live" onclick="homeOpen('${id}')">${hi('play',12)} Watch live</button>`:''}
    <footer class="zh-person-footer"><button type="button" class="zh-person-action zh-person-chat" aria-label="Chat with ${esc(h.n)}" title="${esc(chatReason||'Open conversation')}" onclick="homeDashboardChat('${id}')" ${chatReason?'disabled':''}>${hi('chat',16)} Chat</button><button type="button" class="zh-person-action zh-person-call" aria-label="Video call ${esc(h.n)}" title="${esc(unavailable||'Review your video call')}" onclick="homeDashboardCall('${id}')" ${available?'':'disabled'}>${hi('vid',16)} Call</button></footer>
  </article>`;
}
function homeDashboardCall(id){
  const h=g(id);
  if(!h||(!h.on&&!homeDashboardIsLive(h))||!h.available||isHost()||Home.dashboardCall||Home.streamBusy||Home.preparingCall)return;
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
function homeDashboardSkeleton(label='Loading creators',count=3){
  return `<div class="zh-skeleton" role="status" aria-label="${esc(label)}" aria-busy="true"><div class="zh-grid" aria-hidden="true">${Array.from({length:count},()=>`<div class="zh-person-card zh-person-placeholder"><div class="zh-person-photo zh-skeleton-shape"></div><div class="zh-person-info">${skeletonLine('70%',15)}${skeletonLine('45%',11)}${skeletonLine('60%',10)}</div><div class="zh-person-footer">${skeletonLine('46%',42)}${skeletonLine('46%',42)}</div></div>`).join('')}</div></div>`;
}
function homeDashboardEmpty(live){return `<div class="zh-host-empty"><span>${hi(live?'broadcast':'user',23)}</span><div><h3>${live?'No live hosts right now':'No hosts online right now'}</h3><p>${live?'New live rooms will appear here.':'Check back soon to start a conversation.'}</p></div></div>`}
function homeDashboard(){
  const pending=homeContentPending(),more=!DEMO&&Home.loadingMore&&(Home.loading||contentPending('home'));
  const failure=!pending&&!more&&homeContentError(),moreError=ContentLoading.home.page>1?failure:'',error=moreError?'':failure;
  const hosts=homeDashboardHosts();
  const section=(live)=>{
    const list=live?hosts.live:hosts.online,title=live?'Live hosts':'Online hosts';
    return `<section class="${live?'zh-live-section':'zh-online-section zh-discover'}" aria-label="${title}"><div class="zh-section-title"><h2>${title}${!pending&&!error&&list.length?`<span class="zh-host-count">${n(list.length)}</span>`:''}</h2>${live?`<button type="button" class="zh-home-refresh" aria-label="Refresh home" title="Refresh home" onclick="homeLoad()" ${pending||more?'disabled':''}>${hi('refresh',18)}</button>`:''}</div>${pending?homeDashboardSkeleton(live?'Loading live creators':'Loading creators',live?2:3):error?'':list.length?`<div class="zh-grid">${list.map(homeDashboardCard).join('')}</div>`:homeDashboardEmpty(live)}</section>`;
  };
  return `<div class="zh-home zh-dashboard"><h1 class="zh-home-title">Live and online hosts</h1>${error?`<div class="zh-error" role="alert">${esc(error)}<button type="button" onclick="homeLoad()">Retry</button></div>`:''}${section(true)}${section(false)}${more?homeDashboardSkeleton('Loading more hosts',2):moreError?`<div class="zh-error" role="alert">${esc(moreError)}<button onclick="homeLoad(true)">Retry loading more hosts</button></div>`:!pending&&!error&&Home.hosts.length<Home.total?'<button class="zh-load-more" onclick="homeLoad(true)">Load more hosts</button>':''}${DEMO?'<p class="zh-preview-note">Design preview &middot; sample hosts</p>':''}</div>${homeGiftSheet()}`;
}
