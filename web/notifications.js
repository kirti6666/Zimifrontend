/* The inbox queries the server before paging. Read state changes only after an
   acknowledgment; personal and announcement audiences come from the API. */
const ZNotices={q:'',status:'all',audience:'all',period:'all',sort:'newest',page:1,limit:20,total:0,totalCount:0,loaded:false,sequence:0,requestId:0,selected:new Set(),pending:null,lastMutation:null,mutationError:'',message:'',timer:null,focus:null,detail:null,accountId:'',changed:false,filtersOpen:false,selecting:false};
function znAccepts(data){return data.requestId==null||data.requestId===ZNotices.requestId}
function znBusy(){return !DEMO&&contentPending('notifications')}
function znFiltered(){return !!(ZNotices.q.trim()||ZNotices.status!=='all'||ZNotices.audience!=='all'||ZNotices.period!=='all')}
function znBounds(){
  if(ZNotices.period==='all')return {};
  const today=new Date();today.setHours(0,0,0,0);
  const yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);
  if(ZNotices.period==='yesterday')return {since:yesterday.toISOString(),before:today.toISOString()};
  if(ZNotices.period==='earlier')return {before:yesterday.toISOString()};
  if(ZNotices.period==='week')today.setDate(today.getDate()-6);
  if(ZNotices.period==='month')today.setDate(today.getDate()-29);
  return {since:today.toISOString()};
}
function znLoad(more=false,keepMessage=false){
  if(more&&(znBusy()||ZNotices.pending))return;
  clearTimeout(ZNotices.timer);ZNotices.timer=null;
  const page=more?ZNotices.page+1:1;
  if(!more){ZNotices.selected.clear();ZNotices.changed=false;if(!keepMessage)ZNotices.message=''}
  const query={q:ZNotices.q.trim(),status:ZNotices.status,audience:ZNotices.audience,sort:ZNotices.sort,page,limit:ZNotices.limit,requestId:++ZNotices.sequence};
  const bounds=znBounds();Object.assign(query,bounds);
  ZNotices.requestId=query.requestId;Home.notifyLoading=!DEMO;
  contentStart('notifications',{page});
  if(DEMO){
    const all=ZNotices.demo||[],items=all.filter(item=>(query.status==='all'||item.read===(query.status==='read'))&&(query.audience==='all'||item.audience===query.audience)&&(!bounds.since||Date.parse(item.createdAt)>=Date.parse(bounds.since))&&(!bounds.before||Date.parse(item.createdAt)<Date.parse(bounds.before))&&(`${item.title} ${item.body}`).toLowerCase().includes(query.q.toLowerCase())).sort((a,b)=>(Date.parse(b.createdAt)-Date.parse(a.createdAt))*(query.sort==='oldest'?-1:1));
    Object.assign(ContentLoading.notifications,{loading:false,error:''});
    znReceive({...query,items:items.slice((page-1)*query.limit,page*query.limit),total:items.length,totalCount:all.length,unreadCount:all.filter(item=>!item.read).length});return;
  }
  if(S.v==='notifications')r();Native.send('notifications.load',query);
}
function znOpen(){go('notifications');znLoad()}
function znPreferences(){if(!DEMO&&!ZProfile.data)zpLoad();zpOpen('notifications')}
function znToggleFilters(){ZNotices.filtersOpen=!ZNotices.filtersOpen;r();if(ZNotices.filtersOpen)document.getElementById('zn-search')?.focus({preventScroll:true})}
function znToggleSelecting(){if(ZNotices.pending)return;ZNotices.selecting=!ZNotices.selecting;ZNotices.selected.clear();r()}
function znRelative(item){const date=new Date(item.createdAt),age=Math.max(0,Date.now()-date.getTime());if(!Number.isFinite(age))return '';if(age<60000)return 'Now';if(age<3600000)return Math.floor(age/60000)+'m ago';if(age<86400000)return Math.floor(age/3600000)+'h ago';if(age<604800000)return Math.floor(age/86400000)+'d ago';return date.toLocaleDateString('en-IN',{day:'numeric',month:'short'})}
function znFilter(key,value){
  const values={status:['all','unread','read'],audience:['all','personal','announcements'],period:['all','today','yesterday','earlier','week','month'],sort:['newest','oldest']};
  if(!values[key]?.includes(value)||ZNotices.pending)return;
  ZNotices[key]=value;ZNotices.message='';znLoad();
}
function znSearch(value){
  ZNotices.q=value.slice(0,100);ZNotices.selected.clear();ZNotices.message='';
  clearTimeout(ZNotices.timer);
  // Retire the previous response immediately, including during the debounce.
  ZNotices.requestId=++ZNotices.sequence;
  contentStart('notifications',{page:1});
  znPaintResults();
  ZNotices.timer=setTimeout(()=>znLoad(),250);
}
function znResetFilters(){Object.assign(ZNotices,{q:'',status:'all',audience:'all',period:'all',sort:'newest',message:''});znLoad()}
function znReceive(data){
  if(!znAccepts(data))return;
  Home.notifyLoading=false;
  const items=Array.isArray(data.items)?data.items:[],page=data.page||1;
  const byId=new Map((page>1?Home.notifications:[]).map(item=>[item.id,item]));
  for(const item of items)if(item?.id)byId.set(item.id,item);
  Home.notifications=[...byId.values()];Home.unreadCount=Math.max(0,Number(data.unreadCount)||0);
  Object.assign(ZNotices,{page,total:Math.max(0,Number(data.total??items.length)||0),totalCount:Math.max(0,Number(data.totalCount??data.total??items.length)||0),loaded:true});
  Object.assign(ContentLoading.notifications,{loading:false,error:'',page});
  if(['notifications','home','explore','chats','profile','settings'].includes(S.v))r();
}
function znSelection(id,checked){
  if(ZNotices.pending)return;
  if(checked&&ZNotices.selected.size>=100){appNotice('Select up to 100 notifications at a time.');r();return}
  if(checked)ZNotices.selected.add(id);else ZNotices.selected.delete(id);
  r();
}
function znClearSelection(){ZNotices.selected.clear();r()}
function znSelectLoaded(){const items=Home.notifications.slice(0,100);const selected=items.length&&items.every(item=>ZNotices.selected.has(item.id));ZNotices.selected.clear();if(!selected)items.forEach(item=>ZNotices.selected.add(item.id));r()}
function znUpdate(read,ids,all=false){
  if(ZNotices.pending||(!all&&!ids?.length))return;
  const action=all?'notifications.readAll':read?'notifications.read':'notifications.unread';
  const request={requestId:++ZNotices.sequence,...(all?{}:{ids:[...new Set(ids)].slice(0,100)})};
  ZNotices.pending={action,request,read,all};ZNotices.lastMutation=ZNotices.pending;ZNotices.mutationError='';ZNotices.message='';
  if(DEMO){
    for(const item of ZNotices.demo)if(all||request.ids.includes(item.id))item.read=read;
    znSaved({...request,all,read,unreadCount:ZNotices.demo.filter(item=>!item.read).length,totalCount:ZNotices.demo.length});return;
  }
  r();znPaintDetailStatus();Native.send(action,request);
}
function znRetryUpdate(){const previous=ZNotices.lastMutation;if(previous)znUpdate(previous.read,previous.request.ids,previous.all)}
function znSaved(data){
  const pending=ZNotices.pending;if(!pending||pending.request.requestId!==data.requestId)return;
  Home.unreadCount=Math.max(0,Number(data.unreadCount)||0);ZNotices.totalCount=Math.max(0,Number(data.totalCount)||0);
  if(ZNotices.detail&&(pending.all||pending.request.ids?.includes(ZNotices.detail.id)))ZNotices.detail.read=pending.read;
  ZNotices.message=pending.all?'All notifications marked as read.':`Notification${pending.request.ids.length===1?'':'s'} marked as ${pending.read?'read':'unread'}.`;
  ZNotices.pending=null;ZNotices.lastMutation=null;ZNotices.mutationError='';ZNotices.selected.clear();znPaintDetailStatus();znLoad(false,true);
}
function znError(data){
  if(!ZNotices.pending||ZNotices.pending.request.requestId!==data.requestId)return;
  ZNotices.pending=null;ZNotices.mutationError=data.message||'Your update could not be saved. Please try again.';
  if(S.v==='notifications')r();znPaintDetailStatus();
}
function znAudience(item){return item.audience==='announcements'?'Announcements':'For you'}
function znDate(item){const date=new Date(item.createdAt);return Number.isNaN(date.getTime())?'Date unavailable':date.toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'})}
function znRow(item){
  const id=esc(item.id),disabled=ZNotices.pending?'disabled':'',selected=ZNotices.selected.has(item.id);
  return `<article class="zh-notification ${item.read?'':'unread'} ${selected?'zn-selected':''}" data-notification-id="${id}">
    ${ZNotices.selecting?`<label class="zn-checkbox"><input type="checkbox" aria-label="Select notification: ${esc(item.title)}" ${selected?'checked':''} ${disabled} onchange="znSelection(this.closest('[data-notification-id]').dataset.notificationId,this.checked)"></label>`:''}
    <button class="zn-notice-main" onclick="znDetails(this.closest('[data-notification-id]').dataset.notificationId)" aria-label="Open notification: ${esc(item.title)}">
      <span class="zn-notice-icon">${hi(item.audience==='announcements'?'broadcast':'bell',18)}</span>
      <span class="zn-notice-content"><span class="zn-notice-heading"><h3>${esc(item.title)}</h3><time datetime="${esc(item.createdAt||'')}" title="${esc(znDate(item))}">${esc(znRelative(item))}</time></span><p>${esc(item.body)}</p>${!item.read?'<span class="zn-unread-dot" aria-label="Unread"></span>':''}</span>
    </button></article>`;
}
function znResults(){
  const state=ContentLoading.notifications,loading=znBusy(),more=state.page>1;
  if(loading&&!more)return contentSkeleton('rows','Loading notifications',4);
  if(state.error&&!more)return `<div class="zn-empty zn-load-error" role="alert"><span class="zn-empty-icon">${hi('refresh',30)}</span><h3>Unable to load your updates</h3><p>${esc(state.error)}</p><button class="zn-primary" onclick="znLoad()">Retry</button></div>`;
  let list=Home.notifications.map(znRow).join('');
  if(!list&&!loading)list=`<div class="zn-empty"><span class="zn-empty-icon">${hi(znFiltered()?'srch':'checks',32)}</span><h3>${znFiltered()?'No matching notifications':"You're all caught up"}</h3><p>${znFiltered()?'Try another search or adjust your filters to find an update.':'New personal updates and community announcements will appear here.'}</p>${znFiltered()?'<button class="zn-primary" onclick="znResetFilters()">Reset filters</button>':''}</div>`;
  if(loading&&more)list+=contentSkeleton('rows','Loading more notifications',2);
  else if(state.error&&more)list+=`<div class="zn-inline-error" role="alert"><p>${esc(state.error)}</p><button onclick="znLoad(true)">Retry loading more</button></div>`;
  else if(Home.notifications.length<ZNotices.total)list+=`<button class="zn-load-more" onclick="znLoad(true)" ${ZNotices.pending?'disabled':''}>Load more notifications ${hi('arrow',16)}</button>`;
  return list;
}
function znPaintResults(){const results=document.getElementById('zn-results');if(results)results.innerHTML=znResults();const bulk=document.getElementById('zn-bulk');if(bulk)bulk.innerHTML=znBulk()}
function znBulk(){if(!ZNotices.selected.size)return '';const disabled=ZNotices.pending?'disabled':'';return `<div class="zn-selection" role="group" aria-label="Selected notifications"><strong>${ZNotices.selected.size} selected</strong><button onclick="znUpdate(true,[...ZNotices.selected])" ${disabled}>Mark selected read</button><button onclick="znUpdate(false,[...ZNotices.selected])" ${disabled}>Mark selected unread</button><button class="zn-selection-clear" aria-label="Clear selection" title="Clear selection" onclick="znClearSelection()" ${disabled}>${hi('close',18)}</button></div>`}
function znCaptureFocus(){const active=document.activeElement;if(!active?.closest('.zn-page'))return;ZNotices.focus={id:active.id,aria:active.getAttribute('aria-label'),start:active.selectionStart,end:active.selectionEnd}}
function znAfterRender(){
  const focus=ZNotices.focus;ZNotices.focus=null;if(S.v!=='notifications'||!focus)return;
  const node=focus.id?document.getElementById(focus.id):[...document.querySelectorAll('.zn-page [aria-label]')].find(el=>el.getAttribute('aria-label')===focus.aria);
  if(node&&!node.disabled){node.focus({preventScroll:true});if(node.setSelectionRange&&focus.start!=null)node.setSelectionRange(focus.start,focus.end)}
}
function znView(){
  znCaptureFocus();
  const disabled=ZNotices.pending?'disabled':'',busy=znBusy(),known=ZNotices.loaded;
  const activeFilters=!!(ZNotices.q.trim()||ZNotices.status!=='all'||ZNotices.audience!=='all'||ZNotices.sort!=='newest'||['week','month'].includes(ZNotices.period));
  return `<section class="zn-page" aria-label="Notification inbox">
    <div class="zn-toolbar"><div class="zn-period-tabs" role="group" aria-label="Notification dates">${[['all','All'],['today','Today'],['yesterday','Yesterday'],['earlier','Earlier']].map(([key,label])=>`<button aria-pressed="${ZNotices.period===key}" class="${ZNotices.period===key?'on':''}" onclick="znFilter('period','${key}')" ${disabled}>${label}</button>`).join('')}</div><button class="zn-filter-toggle ${activeFilters?'active':''}" aria-label="Filter notifications" aria-expanded="${ZNotices.filtersOpen}" aria-controls="zn-filters" onclick="znToggleFilters()">${ci('sliders',19)}${activeFilters?'<i></i>':''}</button></div>
    <div class="zn-controls" id="zn-filters" ${ZNotices.filtersOpen?'':'hidden'}>
      <div class="zn-search">${hi('srch',18)}<input id="zn-search" aria-label="Search notifications" maxlength="100" placeholder="Search notifications" value="${esc(ZNotices.q)}" oninput="znSearch(this.value)" ${disabled}></div>
      <div class="zn-filter-label">Read status</div><div class="zn-status" role="group" aria-label="Notification status">${[['all','All'],['unread','Unread'],['read','Read']].map(([key,label])=>`<button aria-pressed="${ZNotices.status===key}" class="${ZNotices.status===key?'on':''}" onclick="znFilter('status','${key}')" ${disabled}>${label}</button>`).join('')}</div>
      <div class="zn-filter-label">Updates</div><div class="zn-audience" role="group" aria-label="Notification audience">${[['all','All updates'],['personal','For you'],['announcements','Announcements']].map(([key,label])=>`<button aria-pressed="${ZNotices.audience===key}" class="${ZNotices.audience===key?'on':''}" onclick="znFilter('audience','${key}')" ${disabled}>${label}</button>`).join('')}</div>
      <div class="zn-filter-row"><label><span>Time period</span><select aria-label="Time period" id="zn-period" onchange="znFilter('period',this.value)" ${disabled}>${[['all','All time'],['today','Today'],['yesterday','Yesterday'],['earlier','Earlier'],['week','Last 7 days'],['month','Last 30 days']].map(([key,label])=>`<option value="${key}" ${ZNotices.period===key?'selected':''}>${label}</option>`).join('')}</select></label><label><span>Sort by</span><select aria-label="Sort notifications" id="zn-sort" onchange="znFilter('sort',this.value)" ${disabled}><option value="newest" ${ZNotices.sort==='newest'?'selected':''}>Newest first</option><option value="oldest" ${ZNotices.sort==='oldest'?'selected':''}>Oldest first</option></select></label></div>
      <div class="zn-filter-actions"><button aria-label="Clear notification filters" onclick="znResetFilters()" ${disabled}>Reset filters</button><button aria-label="Refresh notifications" onclick="znLoad()" ${busy||ZNotices.pending?'disabled':''}>${hi('refresh',16)}Refresh</button><button aria-label="Notification preferences" onclick="znPreferences()">${hi('set',16)}Preferences</button></div>
    </div>
    <div class="zn-summary"><span>${busy?'Loading&hellip;':known?(znFiltered()?`${n(ZNotices.total)} matching`:Home.unreadCount?`${n(Home.unreadCount)} unread`:'All caught up'):''}</span><div><button class="zn-mark-all" onclick="znUpdate(true,null,true)" ${!known||!Home.unreadCount||ZNotices.pending?'disabled':''}>Mark all read</button><button aria-label="${ZNotices.selecting?'Done selecting':'Select notifications'}" onclick="znToggleSelecting()" ${disabled}>${ZNotices.selecting?'Done':'Select'}</button></div></div>
    ${ZNotices.changed?'<div class="zn-live-update"><span>New updates available</span><button onclick="znLoad()">Show updates</button></div>':''}
    ${ZNotices.selecting?`<div class="zn-selection-heading"><span>Select updates to manage</span><button onclick="znSelectLoaded()" ${busy||ZNotices.pending?'disabled':''}>${Home.notifications.slice(0,100).length&&Home.notifications.slice(0,100).every(item=>ZNotices.selected.has(item.id))?'Deselect all':'Select all'}${Home.notifications.length>100?' (first 100)':''}</button></div>`:''}
    <div id="zn-bulk">${znBulk()}</div><div class="zn-feedback" role="status">${ZNotices.pending?'Saving&hellip;':esc(ZNotices.message)}</div>
    ${ZNotices.mutationError?`<div class="zn-inline-error" role="alert"><p>${esc(ZNotices.mutationError)}</p><button onclick="znRetryUpdate()">Retry update</button></div>`:''}
    <div id="zn-results">${znResults()}</div>${DEMO?'<p class="zn-preview-note">Design preview &middot; sample notifications</p>':''}
  </section>`;
}
function znDetails(id){
  const item=Home.notifications.find(entry=>entry.id===id);if(!item)return;
  znCloseDetail();ZNotices.detail={...item};
  const dialog=document.createElement('dialog');dialog.id='zn-detail';dialog.className='zn-dialog';dialog.setAttribute('aria-label','Notification details');
  dialog.innerHTML=`<div class="zn-dialog-heading"><span>Notification details</span><button aria-label="Close notification" onclick="znCloseDetail()">${hi('close',21)}</button></div><div class="zn-detail-content"><span class="zn-detail-icon">${hi(item.audience==='announcements'?'broadcast':'bell',30)}</span><span class="zn-tag">${znAudience(item)}</span><h2>${esc(item.title)}</h2><time>${esc(znDate(item))}</time><p>${esc(item.body)}</p><div id="zn-detail-status" role="status"></div></div>`;
  dialog.addEventListener('close',()=>{dialog.remove();if(document.getElementById('zn-detail'))return;ZNotices.detail=null;const row=[...document.querySelectorAll('.zh-notification[data-notification-id]')].find(node=>node.dataset.notificationId===id);row?.querySelector('.zn-notice-main')?.focus({preventScroll:true})});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)znCloseDetail()}});
  document.body.append(dialog);dialog.showModal();znPaintDetailStatus();
  if(!item.read&&!ZNotices.pending)znUpdate(true,[id]);
}
function znPaintDetailStatus(){
  const el=document.getElementById('zn-detail-status'),item=ZNotices.detail;if(!el||!item)return;
  const status=ZNotices.pending?'Saving&hellip;':ZNotices.mutationError?`${esc(ZNotices.mutationError)} <button onclick="znRetryUpdate()">Retry update</button>`:item.read?'Read':'Unread';
  el.innerHTML=`<span>${status}</span><button class="zn-detail-toggle" aria-label="Mark as ${item.read?'unread':'read'}: ${esc(item.title)}" ${ZNotices.pending?'disabled':''} onclick="znUpdate(!ZNotices.detail.read,[ZNotices.detail.id])">Mark as ${item.read?'unread':'read'}</button>`;
}
function znCloseDetail(){const dialog=document.getElementById('zn-detail');if(dialog){dialog.close();dialog.remove()}ZNotices.detail=null}
function znReset(){clearTimeout(ZNotices.timer);znCloseDetail();Object.assign(ZNotices,{q:'',status:'all',audience:'all',period:'all',sort:'newest',page:1,total:0,totalCount:0,loaded:false,requestId:++ZNotices.sequence,selected:new Set(),pending:null,lastMutation:null,mutationError:'',message:'',timer:null,focus:null,changed:false,accountId:'',filtersOpen:false,selecting:false});Home.notifications=[];Home.unreadCount=0}
window.ZimiNotifications={open:znOpen,load:znLoad,receive:znReceive,accepts:znAccepts,reset:znReset};
ZimiHome.views.notifications=znView;
const znPreviousAfterRender=ZimiHome.afterRender;
ZimiHome.afterRender=()=>{znPreviousAfterRender();znAfterRender()};
Native.on('notifications.saved',znSaved);Native.on('notifications.error',znError);
// A tapped push opens the inbox, but never pulls someone out of a call or live room.
Native.on('push.opened',()=>{if(['live','broadcast','setup','precall','call','voice','dial','dialback','waiting','ring','hcall'].includes(S.v)||(typeof ZVerify!=='undefined'&&ZVerify.state)){ZNotices.changed=true;return}znOpen()});
Native.on('notifications.changed',()=>{ZNotices.changed=true;if(S.v!=='notifications'||ZNotices.pending)return;if(ZNotices.selected.size||ZNotices.detail||document.activeElement?.id==='zn-search'||znBusy()){r();return}znLoad()});
Native.on('session.none',znReset);Native.on('session.expired',znReset);
for(const event of ['session','auth.ok'])Native.on(event,data=>{const id=data.user?.id||'';if(ZNotices.accountId&&ZNotices.accountId!==id)znReset();ZNotices.accountId=id});
document.addEventListener('aurora:navigate',()=>{if(S.v!=='notifications'){clearTimeout(ZNotices.timer);ZNotices.timer=null;znCloseDetail()}});
if(DEMO){
  const now=Date.now();ZNotices.demo=[
    {id:'demo-note-1',title:'A space that feels like you',body:'Your notification center brings personal updates and community announcements together. Use filters to find what you need, or catch up at your own pace.',audience:'personal',read:false,createdAt:new Date(now-12*60000).toISOString()},
    {id:'demo-note-2',title:'Find your next favorite conversation',body:'Discover the people, music and stories that make BinzoLive special. Explore the community and make a new connection.',audience:'announcements',read:false,createdAt:new Date(now-90*60000).toISOString()},
    {id:'demo-note-3',title:'Make your profile your own',body:'A great introduction starts with you. Visit your profile to update your photo, bio and the details you want to share.',audience:'personal',read:false,createdAt:new Date(now-26*3600000).toISOString()},
    {id:'demo-note-4',title:'Welcome to the community',body:'Good conversations start with kindness. Take a moment to get familiar with our community guidelines and help everyone feel welcome.',audience:'announcements',read:true,createdAt:new Date(now-50*3600000).toISOString()},
    {id:'demo-note-5',title:'Your BinzoLive journey starts here',body:'Welcome to BinzoLive. Your personal updates will always have a home in this inbox.',audience:'personal',read:true,createdAt:new Date(now-9*86400000).toISOString()}
  ];Home.notifications=[...ZNotices.demo];Home.unreadCount=3;ZNotices.total=ZNotices.totalCount=5;ZNotices.loaded=true;
}
