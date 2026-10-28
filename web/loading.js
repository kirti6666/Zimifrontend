/* Content placeholders follow requests, never a timer or a first-visit cache. */
const resourceNames=['home','search','catalog','notifications','chats','wallet','transactions','calls','posts','thread','missed','profileSettings','blocked'];
const ContentLoading=Object.fromEntries(resourceNames.map(key=>[key,{loading:!DEMO,error:'',page:1}]));
function contentPending(key){return !!ContentLoading[key]?.loading}
function contentStart(key,extra={}){Object.assign(ContentLoading[key],{loading:true,error:'',...extra})}
function skeletonLine(width='70%',height=12){return `<span class="zh-skeleton-shape" style="width:${width};height:${height}px"></span>`}
function contentSkeleton(kind='rows',label='Loading content',count=4){
  let body='';
  if(kind==='cards')body=`<div class="zh-grid">${Array.from({length:count},()=>`<div class="zh-creator-card zh-creator-placeholder"><div class="zh-creator-top">${skeletonLine('56px',21)}${skeletonLine('40px',21)}</div><div class="zh-creator-bottom"><span class="zh-skeleton-shape zh-skeleton-round" style="width:32px;height:32px"></span><div class="zh-creator-text">${skeletonLine('80%',13)}${skeletonLine('58%',9)}</div><span class="zh-skeleton-shape zh-skeleton-round" style="width:40px;height:40px"></span></div></div>`).join('')}</div>`;
  else if(kind==='stories')body=`<div class="zh-skeleton-story-list">${Array.from({length:count},()=>`<div class="zh-story"><span class="zh-story-ring zh-skeleton-shape"></span>${skeletonLine('76%',9)}</div>`).join('')}</div>`;
  else if(kind==='featured')body=`<div class="zh-skeleton-hero"><div class="zh-skeleton-hero-top">${skeletonLine('52px',20)}${skeletonLine('46px',20)}</div><div class="zh-skeleton-hero-bottom">${skeletonLine('61%',24)}${skeletonLine('87%',12)}${skeletonLine('100%',27)}<div class="zh-skeleton-actions">${skeletonLine('64%',47)}${skeletonLine('34%',47)}</div></div></div>`;
  else if(kind==='match')body=`<div class="zh-skeleton-match-layout"><div>${skeletonLine('83%',19)}${skeletonLine('100%',12)}${skeletonLine('60%',12)}</div>${skeletonLine('88px',47)}</div>`;
  else if(kind==='packs'||kind==='gifts')body=`<div class="zh-${kind} zh-skeleton-catalog">${Array.from({length:count},()=>`<div>${skeletonLine('38px',38)}${skeletonLine('70%',18)}${skeletonLine('85%',10)}${skeletonLine('60%',12)}</div>`).join('')}</div>`;
  else if(kind==='balance')body=skeletonLine('105px',38);
  else if(kind==='wallet')body=`<div class="zh-loading-wallet">${skeletonLine('45%',12)}${skeletonLine('55%',38)}${skeletonLine('90%',12)}${skeletonLine('100%',38)}</div>${Array.from({length:3},()=>`<div class="zh-skeleton-row">${skeletonLine('100%',48)}</div>`).join('')}`;
  else if(kind==='posts')body=`<div class="hpgrid">${Array.from({length:6},()=>'<div class="zh-skeleton-shape zh-skeleton-post"></div>').join('')}</div>`;
  else if(kind==='thread')body=`<div class="zh-skeleton-thread-list">${Array.from({length:6},(_,i)=>`<div class="${i%3===1?'outgoing':''}">${skeletonLine(i%2?'62%':'79%',52)}</div>`).join('')}</div>`;
  else body=Array.from({length:count},()=>`<div class="zh-skeleton-row"><span class="zh-skeleton-shape zh-skeleton-avatar"></span><div>${skeletonLine('56%',14)}${skeletonLine('89%',11)}${skeletonLine('34%',9)}</div></div>`).join('');
  return `<div class="zh-skeleton zh-skeleton-${kind}" role="status" aria-label="${esc(label)}" aria-busy="true"><div aria-hidden="true">${body}</div></div>`;
}
function contentError(key){const message=ContentLoading[key]?.error;return message?`<div class="zh-error" role="alert">${esc(message)}<button onclick="contentRetry('${key}')">Retry</button></div>`:''}
function contentSurface(key,kind='rows',label){return contentPending(key)?contentSkeleton(kind,label):ContentLoading[key]?.error?contentError(key):null}
function contentBalance(value=S.bal){return contentPending('wallet')?'<span role="status" aria-label="Loading balance" aria-busy="true"><span aria-hidden="true">'+skeletonLine('55px',18)+'</span></span>':ContentLoading.wallet.error?'<span aria-label="Balance unavailable">—</span>':n(value)}
function contentRetry(key){
  if(key==='profileSettings')return zpLoad();
  if(key==='blocked')return zpBlockedLoad();
  if(key==='home')return homeLoad();
  if(key==='search')return homeSearchRequest();
  if(key==='notifications'&&window.ZimiNotifications)return window.ZimiNotifications.load();
  contentStart(key);contentRender(key);
  if(key==='wallet')Native.send('wallet.load');
  else if(key==='transactions')Native.send('transactions.load');
  else if(key==='catalog')Native.send('catalog.load');
  else if(key==='notifications')Native.send('notifications.load');
  else if(key==='thread')Native.send('chat.open',{with:S.h});
  else Native.send('data.reload');
}
function contentBeforeNavigate(view){
  if(DEMO)return;
  if(view==='thread')contentStart('thread');
  if(view==='coins')contentStart('catalog');
  if(view==='search')contentStart('search');
}
function contentRender(key){
  if(key==='thread'){if(S.v==='thread')paint();return}
  const views={profileSettings:['profile','settings'],blocked:[],home:['home','explore','chats'],catalog:['coins'],notifications:['notifications','home','explore','chats'],chats:['chats'],missed:['chats'],wallet:['home','explore','wallet','coins','profile','settings','chats','precall'],transactions:['transactions','wallet'],calls:['calls'],posts:['profile','editprofile'],thread:['thread']};
  if(key==='search'){if(S.v==='search')homePaintSearch();return}
  if(views[key]?.includes(S.v)||(['catalog','wallet'].includes(key)&&(Home.giftTo||['call','voice','hcall'].includes(S.v))))r();
}
Native.on('data.loading',d=>{
  if(!ContentLoading[d.resource])return;
  if(d.resource==='notifications'&&window.ZimiNotifications&&!window.ZimiNotifications.accepts(d))return;
  if(d.resource==='search'&&d.q!==(S.sq||''))return;
  Object.assign(ContentLoading[d.resource],{loading:d.loading,error:d.error||'',page:d.page||1});
  if(d.resource==='home'){Home.loading=d.loading;Home.loadingMore=d.loading&&d.page>1;if(!d.loading){Home.loaded=true;Home.error=d.error||''}}
  if(d.resource==='search'){Home.searchLoading=d.loading;Home.searchMore=d.loading&&d.page>1;Home.searchError=d.error||''}
  contentRender(d.resource);
});
/* Results also settle placeholders when received from an older native shell. */
for(const [event,key] of Object.entries({'data.home':'home','data.search':'search','data.catalog':'catalog','data.notifications':'notifications','data.chats':'chats','data.missed':'missed','data.calls':'calls','data.transactions':'transactions','data.posts':'posts','data.thread':'thread','wallet.balance':'wallet','data.profileSettings':'profileSettings','data.blocked':'blocked'}))Native.on(event,d=>{
  if(key==='notifications'&&window.ZimiNotifications&&!window.ZimiNotifications.accepts(d))return;
  if(key==='search'&&d.q!==(S.sq||''))return;
  if(key==='thread'&&d.with!==S.h)return;
  Object.assign(ContentLoading[key],{loading:false,error:''});
  if(!['home','search','catalog','notifications'].includes(key))contentRender(key);
});
Native.on('operation.error',d=>{const key={'home.reload':'home','hosts.search':'search','catalog.load':'catalog','notifications.load':'notifications','chat.open':'thread'}[d.action];if(key){Object.assign(ContentLoading[key],{loading:false,error:d.message||'Unable to load. Please try again.'});contentRender(key)}});
function contentReset(){for(const key of resourceNames)Object.assign(ContentLoading[key],{loading:!DEMO,error:'',page:1})}
Native.on('session.none',contentReset);Native.on('session.expired',contentReset);

function contentImageReady(img){if(!img?.classList?.contains('zh-photo-pending'))return;img.classList.remove('zh-photo-pending');img.classList.toggle('zh-photo-failed',!img.naturalWidth)}
document.addEventListener('load',event=>contentImageReady(event.target),true);
document.addEventListener('error',event=>contentImageReady(event.target),true);
function contentImagesReady(){document.querySelectorAll('img.zh-photo-pending').forEach(img=>{if(img.complete)contentImageReady(img)})}
/* The app shows its animated logo until the first screen has real content, so a
   launch never flashes the session or content skeletons. The logo leaves once the
   saved session is settled and nothing on screen is still loading, or right away
   when offline, so the offline screen is not hidden behind it. */
const Launch={session:false,done:false};
function launchCheck(){
  if(DEMO||Launch.done)return;
  const offline=!!window.ZimiOffline?.isOffline();
  if(!offline&&(!Launch.session||[...document.querySelectorAll('.zh-skeleton,.ob-session-skeleton,[role=status][aria-busy=true]')].some(el=>el.getClientRects().length)))return;
  Launch.done=true;Native.send('app.launched');
}
/* After every handler for the same message, so the check sees the screen it drew. */
const launchLater=()=>queueMicrotask(launchCheck);
for(const type of ['session','session.none','session.error','session.expired'])Native.on(type,()=>{Launch.session=true;launchLater()});
Native.on('connection.status',launchLater);
window.ZimiLaunch={check:launchCheck};
