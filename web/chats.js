/* Inbox presentation. Production conversations and counts come from the bridge. */
const Chats={rows:[],query:'',filter:'all',sort:'recent',onlineOnly:false,filtersOpen:false,composeOpen:false,composeQuery:'',readBusy:false,readError:'',page:1,total:0,unreadCount:0,unreadConversations:0,loadingMore:false,drafts:{},gifts:{},playing:'',threadPermission:null,revealed:{},menu:'',reply:null,editing:null};
const chatIcons={
  image:'<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5.2-5.2a1.5 1.5 0 0 0-2.1 0L5 19"/>',
  compose:'<path d="M13 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 3l5 5M10 14l3-1L22 4l-5-5-9 9-1 6z"/>',
  checks:'<path d="m2 12 5 5L18 6M10 15l2 2L23 6"/>',
  sliders:'<path d="M3 6h11m4 0h3M3 12h3m4 0h11M3 18h11m4 0h3M14 3v6M6 9v6M14 15v6"/>',
  robot:'<rect x="4" y="7" width="16" height="14" rx="3"/><path d="M12 3v4M1 12v5M23 12v5M8 17h8"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="12" cy="2" r="1"/>',
  more:'<circle cx="12" cy="5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="19" r="1.3" fill="currentColor"/>',
  add:'<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  up:'<path d="M12 19V5M6 11l6-6 6 6"/>',
  send:'<path d="m22 2-7 20-4-9-9-4zM22 2 11 13"/>',
  stop:'<rect x="5" y="5" width="14" height="14" rx="3" fill="currentColor" stroke="none"/>',
  download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  zoomIn:'<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5M7 10.5h7M10.5 7v7"/>',
  zoomOut:'<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5M7 10.5h7"/>',
  expand:'<path d="M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6"/>',
  reply:'<path d="m9 5-6 6 6 6M3 11h10a7 7 0 0 1 7 7"/>',
  edit:'<path d="m16 3 5 5M4 20l5-1L21 7a2.1 2.1 0 0 0-5-5L4 14zM4 20h16"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  sparkle:'<path d="M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6zM18 13l.9 2.1L21 16l-2.1.9L18 19l-.9-2.1L15 16l2.1-.9z"/>',
  crown:'<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z"/>',
  playFill:'<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  pause:'<path d="M8 5v14M16 5v14"/>'
};
function ci(name,size=20){return chatIcons[name]?`<svg class="zi-icon" data-icon="${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${chatIcons[name]}</svg>`:hi(name,size)}
function zcPending(){return !DEMO&&contentPending('chats')&&!Chats.loadingMore}
function zcHasCalls(c){return !!c.hasCalls||CALLS.some(x=>x[0]===c.user.id)}
function zcPerson(c){const old=g(c.user.id)||{};return {...old,...homeCreator(c.user),role:c.user.role}}
function zcSelfRole(){return S.hostAccess?.serverRole||S.user?.serverRole||(isApprovedHost()?'host':'user')}
function zcChatBlockReason(id){
  if(DEMO)return '';
  if(!id||id===S.user?.id)return 'Choose another user.';
  const self=zcSelfRole(),row=Chats.rows.find(c=>c.user.id===id),peer=row?.user||g(id),role=peer?.serverRole||(peer?.role==='host'||peer?.verified?'host':peer?.role==='sender'?'user':undefined);
  if(window.ZimiHostAccess?.checking())return 'Checking your account. Try again in a moment.';
  if(self==='host'&&!isApprovedHost())return 'Your creator profile needs admin approval before you can chat.';
  if(self==='host')return role==='host'?'Host accounts can reply to members only. Use a member account to message a host.':row&&role==='user'?'':'A member must start the conversation before a host can reply.';
  return self!=='user'||(role&&role!=='host')?'Members can message approved hosts only.':'';
}
function zcCanChat(id){return !zcChatBlockReason(id)}
function zcGuardChat(id){const reason=zcChatBlockReason(id);if(reason)appNotice(reason);return !reason}
function zcThreadBlocked(){if(DEMO)return '';return zcChatBlockReason(S.h)||(contentPending('thread')?'Loading this conversation. Please wait.':ContentLoading.thread.error)||((Chats.threadPermission?.with===S.h&&Chats.threadPermission.canSend===false)?Chats.threadPermission.reason||'Wait for this member to reply before sending a message.':'')}
function zcUnread(){return DEMO?Chats.rows.filter(c=>c.unread>0).length:Chats.unreadConversations}
window.ZimiChats={unread:zcUnread};
function zcCaptureFocus(){const el=document.activeElement;if(!el||!['cq','zc-contact-query'].includes(el.id))return null;return {id:el.id,start:el.selectionStart,end:el.selectionEnd}}
function zcRestoreFocus(saved){if(!saved)return;const el=document.getElementById(saved.id);if(el){el.focus({preventScroll:true});el.setSelectionRange(saved.start,saved.end)}}
function zcTime(c){if(c.displayTime)return c.displayTime;const at=new Date(c.lastAt);if(Number.isNaN(at.getTime()))return c.time||'';const age=Math.max(0,Date.now()-at.getTime()),minutes=Math.floor(age/60000);if(minutes<1)return 'Now';if(minutes<60)return minutes+'m ago';if(minutes<1440)return Math.floor(minutes/60)+'h ago';const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);return at.toDateString()===yesterday.toDateString()?'Yesterday':at.toLocaleDateString('en-IN',{month:'short',day:'numeric'})}
function zcPhoto(h,extra=''){return `<span class="zc-avatar ${extra}">${homeCover({...h,coverUrl:h.avatarUrl||h.coverUrl})}</span>`}
function zcRows(){const q=Chats.query.trim().toLowerCase();let rows=Chats.rows.filter(c=>{
  if(Chats.filter==='calls'&&!zcHasCalls(c))return false;
  if(Chats.filter==='unread'&&!c.unread)return false;
  if(Chats.onlineOnly&&!hostShownOnline(c.user))return false;
  return !q||[c.user.name,c.user.category,c.user.tag,c.last].some(value=>String(value||'').toLowerCase().includes(q));
});return rows.sort((a,b)=>Chats.sort==='name'?a.user.name.localeCompare(b.user.name):Chats.sort==='unread'&&(a.unread||b.unread)?b.unread-a.unread:(Date.parse(b.lastAt)||0)-(Date.parse(a.lastAt)||0))}
function zcTabs(){const tabs=[['all','All'],['unread','Unread'],['calls','Calls'],['missed','Missed calls']];return `<div class="zc-tabs" role="tablist" aria-label="Conversation categories">${tabs.map(([key,label])=>`<button role="tab" aria-selected="${Chats.filter===key}" class="${Chats.filter===key?'selected':''}" onclick="zcSetFilter('${key}')">${label}</button>`).join('')}</div>`}
function zcSetFilter(value){Chats.filter=value;r()}
function zcRow(c){const h=zcPerson(c),bot=DEMO&&c.bot;return `<button class="zc-row rowlink ${c.unread?'zc-unread':''}" onclick="${bot?'homeNotifications()':`zcOpen('${domId(h.id)}')`}" aria-label="${esc(h.n)}${c.lastAutomated===true?', automated welcome':''}${c.unread?', '+c.unread+' unread messages':''}"><span class="zc-avatar-wrap">${bot?`<span class="zc-avatar zc-bot">${ci('robot',30)}</span><span class="zc-bot-label">BOT</span>`:zcPhoto(h)+`<i class="zc-presence ${h.on?'online':''}" aria-label="${h.on?'Online':'Offline'}"></i>`}</span><span class="zc-row-body"><span class="zc-row-heading"><span class="zc-name">${esc(h.n)}${bot?' '+hi('shield',17):''}</span><time datetime="${esc(c.lastAt||'')}">${esc(zcTime(c))}</time></span><span class="zc-row-preview"><span class="zc-message ${c.lastKind==='gift'?'zc-gift-message':''}">${c.lastKind==='gift'?hi('gift',17):c.lastKind==='voice'?hi('mic',17):c.lastKind==='image'?ci('image',17):c.lastKind==='call'?hi('ph',17):c.lastMine?ci(c.lastStatus==='read'?'checks':'check',17):''}<span>${c.lastDeleted?'Message deleted':escChat(c.last||(c.lastKind==='image'?'Photo':c.lastKind==='voice'?'Voice message':'Start a conversation'))}</span></span>${c.unread?`<span class="zc-unread-count">${c.unread>99?'99+':n(c.unread)}</span>`:''}</span>${c.lastAutomated===true?'<span class="zc-automated">Automated welcome</span>':''}</span></button>`}
function zcSkeleton(){return `<div class="zc-inbox-skeleton" role="status" aria-label="Loading conversations" aria-busy="true"><div aria-hidden="true">${Array.from({length:6},()=>`<div class="zc-row zc-skeleton-row"><span class="zh-skeleton-shape zc-avatar"></span><span class="zc-row-body"><span class="zc-row-heading">${skeletonLine('60%',17)}${skeletonLine('36px',10)}</span>${skeletonLine('90%',12)}</span></div>`).join('')}</div></div>`}
function zcList(){
  if(Chats.filter==='missed')return missedList();
  if(zcPending())return zcSkeleton();
  const error=!DEMO&&ContentLoading.chats.error;
  if(error)return `<div class="zh-error" role="alert">${esc(error)}<button onclick="zcReload()">Retry</button></div>`;
  const rows=zcRows();return `${rows.length?rows.map(zcRow).join(''):`<div class="zc-empty">${Chats.query||Chats.filter!=='all'||Chats.onlineOnly?hi('chat',34):`<img class="zc-empty-photo" src="${OB_MEDIA[0]}" alt="" decoding="async">`}<h2>${Chats.query||Chats.filter!=='all'||Chats.onlineOnly?'No conversations found':'Your next connection starts here'}</h2><p>${Chats.query||Chats.filter!=='all'||Chats.onlineOnly?'Try a different search or adjust your filters.':'Meet a creator and send your first hello.'}</p><button class="zh-soft" onclick="${Chats.query||Chats.filter!=='all'||Chats.onlineOnly?'zcResetFilters()':'zcCompose()'}">${Chats.query||Chats.filter!=='all'||Chats.onlineOnly?'Clear filters':'New conversation'}</button></div>`}${Chats.loadingMore&&contentPending('chats')?zcSkeleton():Chats.total>Chats.rows.length?'<button class="zh-load-more" onclick="zcReload(true)">Load more conversations</button>':''}`;
}
function zcPaintList(){const list=document.getElementById('zc-list');if(list)list.innerHTML=zcList();contentImagesReady()}
function zcReload(more=false){if(DEMO)return;if(more&&contentPending('chats'))return;Chats.loadingMore=more;contentStart('chats',{page:more?Chats.page+1:1});Native.send('chats.reload',{page:more?Chats.page+1:1});r()}
function zcResetFilters(){Chats.query='';Chats.filter='all';Chats.onlineOnly=false;Chats.sort='recent';r()}
function zcAvailable(){const seen=new Set();return [...Home.stage,...Home.hosts].filter(h=>{if(seen.has(h.id)||(!h.available&&!h.stream))return false;seen.add(h.id);return true}).slice(0,12)}
function zcShortName(value){const names=String(value).trim().split(/\s+/);return names.length>1?names[0]+' '+names.at(-1)[0]+'.':names[0]}
function zcAvailableView(){const pending=!DEMO&&contentPending('home'),error=!DEMO&&ContentLoading.home.error,rows=zcAvailable();if(!pending&&!error&&!rows.length)return '';return `<section class="zc-available" aria-label="Available creators"><div class="zc-section-heading"><h2>Online now</h2><button onclick="zcExploreAvailable()">See all</button></div><div class="zc-people">${pending?contentSkeleton('stories','Loading available creators',5):error?`<div class="zh-error" role="alert">${esc(error)}<button onclick="homeLoad()">Retry</button></div>`:rows.map(h=>`<button class="zc-person" onclick="homeOpen('${domId(h.id)}')" aria-label="${h.stream?'Watch':'Call'} ${esc(h.n)}">${zcPhoto(h)}${h.stream?'<b>LIVE</b>':'<i aria-hidden="true"></i>'}<span>${esc(zcShortName(h.n))}</span></button>`).join('')}</div></section>`}
function zcExploreAvailable(){go('explore');homeFilter('instant')}
function zcReadAll(){if(Chats.readBusy||zcPending()||!zcUnread())return;Chats.readError='';if(DEMO){Chats.rows.forEach(c=>c.unread=0);CH.forEach(c=>c[3]=0);r();return}Chats.readBusy=true;Native.send('chats.readAll');r()}
function zcOpen(id){Chats.composeOpen=false;Chats.filtersOpen=false;Chats.revealed={};Chats.menu='';Chats.reply=null;Chats.editing=null;go('thread',id)}
function zcFilters(){if(!Chats.filtersOpen)return '';return `<div class="zc-overlay" onclick="zcCloseOverlay(event)"><section class="zc-dialog" role="dialog" aria-modal="true" aria-label="Conversation filters"><div class="zc-dialog-heading"><h2>Conversation filters</h2><button onclick="zcCloseDialogs()" aria-label="Close filters">×</button></div><label class="zc-toggle"><span>Online only</span><input type="checkbox" ${Chats.onlineOnly?'checked':''} onchange="Chats.onlineOnly=this.checked;zcPaintList()"></label><label class="zc-sort">Sort conversations<select aria-label="Sort conversations" onchange="Chats.sort=this.value;zcPaintList()">${[['recent','Most recent'],['unread','Unread first'],['name','Name']].map(([key,label])=>`<option value="${key}" ${Chats.sort===key?'selected':''}>${label}</option>`).join('')}</select></label><button class="zc-dialog-reset" onclick="zcResetFilters()">Reset filters</button><button class="zh-primary zh-full" onclick="zcCloseDialogs()">Show conversations</button></section></div>`}
function zcContacts(){const rows=[...Chats.rows.filter(c=>!c.bot).map(zcPerson),...Home.hosts,...H],seen=new Set(),q=Chats.composeQuery.trim().toLowerCase();return rows.filter(h=>{if(seen.has(h.id)||!h.id||!zcCanChat(h.id))return false;if(!DEMO&&zcSelfRole()==='host'){const row=Chats.rows.find(c=>c.user.id===h.id);if(!row||row.canSend===false||row.automatedOnly)return false}seen.add(h.id);return !q||(h.n+' '+(h.cat||'')).toLowerCase().includes(q)})}
function zcContactList(){if(!DEMO&&contentPending('chats')&&contentPending('home'))return contentSkeleton('rows','Loading contacts');const contacts=zcContacts();return contacts.length?contacts.map(h=>`<button class="zc-contact" onclick="zcOpen('${domId(h.id)}')">${zcPhoto(h)}<span><b>${esc(h.n)}</b><small>${esc(h.cat||'BinzoLive member')}</small></span>${hi('chat',20)}</button>`).join(''):'<p class="zc-empty-contact">No contacts match. Discover more creators to start a conversation.</p>'}
function zcCompose(){Chats.composeQuery='';Chats.composeOpen=true;Chats.filtersOpen=false;r()}
function zcPaintContacts(){const list=document.getElementById('zc-contacts');if(list)list.innerHTML=zcContactList();contentImagesReady()}
function zcComposeView(){if(!Chats.composeOpen)return '';return `<div class="zc-overlay" onclick="zcCloseOverlay(event)"><section class="zc-dialog zc-compose" role="dialog" aria-modal="true" aria-label="New conversation"><div class="zc-dialog-heading"><h2>New conversation</h2><button onclick="zcCloseDialogs()" aria-label="Close new conversation">×</button></div><label class="zc-compose-search">${hi('srch',19)}<input id="zc-contact-query" placeholder="Find a creator or contact" aria-label="Search contacts" value="${esc(Chats.composeQuery)}" oninput="Chats.composeQuery=this.value;zcPaintContacts()"></label><div id="zc-contacts">${zcContactList()}</div><button class="zh-soft zh-full" onclick="zcCloseDialogs();go('search')">Find more creators ${hi('explore',17)}</button></section></div>`}
function zcCloseDialogs(){Chats.composeOpen=false;Chats.filtersOpen=false;r();document.querySelector('.zc-compose-button')?.focus({preventScroll:true})}
function zcCloseOverlay(event){if(event.target===event.currentTarget)zcCloseDialogs()}
function zcScreen(){return `<div class="zc-chats"><div class="zc-heading"><h1>Chats</h1>${zcPending()?'<span class="zc-count-skeleton" aria-hidden="true">'+skeletonLine('46px',18)+'</span>':zcUnread()?`<span class="zc-new">${n(zcUnread())} new</span>`:''}<div class="zc-heading-actions"><button class="zc-mark-read" aria-label="Mark all as read" title="Mark all as read" aria-busy="${Chats.readBusy}" onclick="zcReadAll()" ${Chats.readBusy||zcPending()||!zcUnread()?'disabled':''}>${ci('checks',24)}</button><button class="zc-compose-button" aria-label="New chat" onclick="zcCompose()">${ci('compose',24)}</button></div></div><div class="zc-search">${hi('srch',21)}<input id="cq" aria-label="Search conversations" placeholder="Search chats" value="${esc(Chats.query)}" oninput="Chats.query=this.value;zcPaintList()"><button class="${Chats.onlineOnly||Chats.sort!=='recent'?'active':''}" onclick="Chats.filtersOpen=true;r()" aria-label="Conversation filters">${ci('sliders',21)}</button></div>${zcTabs()}<div class="zc-layout"><div class="zc-discovery">${zcAvailableView()}</div><section class="zc-conversations" aria-label="Conversations">${Chats.readError?`<div class="zh-error" role="alert">${esc(Chats.readError)}<button onclick="zcReadAll()">Retry</button></div>`:''}${window.ZimiAds?.banner('chats')||''}<div id="zc-list" class="zc-list">${zcList()}</div></section></div>${DEMO?'<p class="zh-preview-note">Design preview · sample conversations'+MODEL_NOTE+'</p>':''}</div>${zcFilters()}${zcComposeView()}`}
window.ZimiHome.views.chats=zcScreen;
const chatsAfterRender=window.ZimiHome.afterRender;
window.ZimiHome.afterRender=()=>{chatsAfterRender();const dialog=document.querySelector('.zc-dialog');if(dialog&&!dialog.contains(document.activeElement))(dialog.querySelector('input[type="text"],input:not([type]),button'))?.focus({preventScroll:true})};
document.addEventListener('keydown',event=>{if(!Chats.composeOpen&&!Chats.filtersOpen)return;if(event.key==='Escape'){event.preventDefault();zcCloseDialogs();return}if(event.key==='Tab'){const nodes=[...document.querySelectorAll('.zc-dialog button:not(:disabled),.zc-dialog input,.zc-dialog select')],first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}});
Native.on('data.chats',d=>{const rows=(d.chats||[]).filter(c=>c.user?.id).map(c=>({...c,user:{...c.user},unread:Math.max(0,Number(c.unread)||0)}));Chats.rows=d.page>1?[...Chats.rows,...rows.filter(c=>!Chats.rows.some(old=>old.user.id===c.user.id))]:rows;Chats.page=d.page||1;Chats.total=d.total??Chats.rows.length;Chats.unreadCount=d.unreadCount??Chats.rows.reduce((sum,c)=>sum+c.unread,0);Chats.unreadConversations=d.unreadConversations??Chats.rows.filter(c=>c.unread>0).length;Chats.loadingMore=false;const active=Chats.rows.find(c=>c.user.id===S.h);if(Chats.threadPermission?.with===S.h&&typeof active?.canSend==='boolean'){Chats.threadPermission.canSend=active.canSend;Chats.threadPermission.reason=active.sendDisabledReason;if(S.v==='thread')zcUpdateSendControls()}if(S.v==='chats')r()});
Native.on('data.loading',d=>{if(d.resource==='chats'){Chats.loadingMore=!!d.loading&&d.page>1;if(S.v==='chats')r()}});
Native.on('chats.readAll',()=>{Chats.readBusy=false;Chats.readError='';if(S.v==='chats')r()});
/* Only a server thread read confirms that an incoming visible message is read. */
Native.on('chat.message',d=>{if(!DEMO&&!d.inCall&&S.v==='thread'&&String(d.from)===S.h)Native.send('chat.open',{with:S.h})});
Native.on('operation.error',d=>{if(d.action==='chats.readAll'){Chats.readBusy=false;Chats.readError=d.message;if(S.v==='chats')r()}if(d.action==='chats.reload'){Chats.loadingMore=false;Object.assign(ContentLoading.chats,{loading:false,error:d.message});if(S.v==='chats')r()}});
function zcReset(){Object.assign(Chats,{rows:[],query:'',filter:'all',sort:'recent',onlineOnly:false,filtersOpen:false,composeOpen:false,composeQuery:'',readBusy:false,readError:'',page:1,total:0,unreadCount:0,unreadConversations:0,loadingMore:false,drafts:{},gifts:{},playing:'',threadPermission:null,reply:null,editing:null,menu:'',contextPeer:null});zcEndGesture()}
Native.on('data.thread',d=>{if(d.with===S.h){Chats.threadPermission={with:d.with,canSend:d.canSend,reason:d.sendDisabledReason};if(S.v==='thread'){zcUpdateSendControls();if(Chats.reply){const original=zcFind(Chats.reply.id);if(original)zcRefreshReplies(original);else zcClearContext()}}}});
Native.on('session.none',zcReset);Native.on('session.expired',zcReset);
document.addEventListener('aurora:navigate',()=>{if(S.v!=='chats'){Chats.composeOpen=false;Chats.filtersOpen=false}});

/* Conversation thread. History arrives through data.thread and chat.message. Thread
   history holds text only, so gifts confirmed during this session are merged in as cards. */
function zcClock(m){const at=new Date(m.at||'');return Number.isNaN(at.getTime())?m.time||'':at.toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'})}
function zcDay(value){const at=new Date(value||'');if(!value||Number.isNaN(at.getTime()))return '';const today=new Date(),yesterday=new Date();yesterday.setDate(today.getDate()-1);if(at.toDateString()===today.toDateString())return 'Today';if(at.toDateString()===yesterday.toDateString())return 'Yesterday';return at.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short',...(at.getFullYear()===today.getFullYear()?{}:{year:'numeric'})})}
function zcThreadMessages(d){const rows=(d.messages||[]).map(m=>({id:m.id,mine:!!m.mine,text:String(m.text??''),time:m.time||'',at:m.createdAt||'',status:m.status,automated:m.automated===true,edited:m.edited===true,deleted:m.deleted===true,reply:m.reply||null,...(m.kind==='image'&&m.imageUrl?{kind:'image',imageUrl:String(m.imageUrl)}:{}),...(m.kind==='voice'&&m.audioUrl?{kind:'voice',audioUrl:String(m.audioUrl),durationMs:m.durationMs}:{})})),gifts=Chats.gifts[String(d.with)]||[];return gifts.length?[...rows,...gifts].sort((a,b)=>(Date.parse(a.at)||0)-(Date.parse(b.at)||0)):rows}
/* Inbox rows carry identity and presence; a known creator record adds rate and live status. */
function zcThreadPerson(){const base=g(S.h)||{id:S.h||'',n:'BinzoLive member',seed:0},row=Chats.rows.find(c=>c.user.id===S.h);if(!row)return base;const p=zcPerson(row);return {...p,rate:base.rate||p.rate,stream:base.stream||null,viewers:base.viewers||0}}
function zcThreadStatus(h){return [h.stream?'In live room':h.on?'Online':'Offline',h.rate>0?n(h.rate)+' coins/min':''].filter(Boolean).join(' · ')}
function zcThreadHeader(h){const id=domId(h.id),member=!isHost();return `<header class="zc-thread-header">${backButton("go('chats')",{slot:"zc-thread-back"})}<button class="zc-thread-person" onclick="go('host','${id}')" aria-label="Open ${esc(h.n)} profile"><span class="zc-avatar-wrap">${zcPhoto(h)}<i class="zc-thread-presence ${h.on?'online':''}"></i></span><span class="zc-thread-title"><b><span>${esc(h.n)}</span>${homeVerified(h)}</b><small>${esc(zcThreadStatus(h))}</small></span></button><div class="zc-thread-actions">${member?`<button aria-label="Voice call" onclick="homeCall('${id}')">${hi('ph',22)}</button><button class="zc-thread-video" aria-label="Video call" onclick="homeCall('${id}')">${hi('vid',22)}</button>`:''}<div class="zc-thread-more"><button aria-label="More options" aria-haspopup="menu" aria-expanded="false" onclick="zcThreadMenu()">${ci('more',22)}</button><div class="zc-thread-menu" role="menu" hidden><button role="menuitem" onclick="go('host','${id}')">${hi('user',18)} View profile</button>${member?`<button role="menuitem" onclick="zcThreadMenu(false);homeGifts('${id}')">${hi('gift',18)} Send a gift</button>`:''}${h.stream?`<button role="menuitem" onclick="homeOpen('${id}')">${hi('broadcast',18)} Join live stream</button>`:''}</div></div></div></header>`}
function zcThreadLive(h){if(!h.stream)return '';const id=domId(h.id),name=first(h.n),viewers=h.stream.viewers||h.viewers;return `<section class="zc-thread-live" aria-label="${esc(name)} is live now"><span class="zc-thread-live-cover">${homeCover(h)}<b><i></i>LIVE</b></span><div class="zc-thread-live-text"><h2><span>${esc(name)} is Live Now</span><i></i></h2><p>${esc(h.stream.title||h.tag||'Streaming now')}${viewers?' · '+homeCompact(viewers)+' watching':''}</p></div><div class="zc-thread-live-actions"><button class="zc-thread-join" onclick="homeOpen('${id}')">Join Stream</button>${!isHost()&&(h.available||DEMO)?`<button class="zc-thread-call" onclick="homeCall('${id}')">${hi('vid',18)} 1:1 Call${h.rate>0?` (${n(h.rate)}c/m)`:''}</button>`:''}</div></section>`}
function zcThreadNote(h){return `<p class="zc-thread-note">${hi('lock',13)} Never share sign-in codes or payment details${h.verified?' · Creator ID verified':''}</p>`}
function zcGiftCard(m,h){const x=m.gift||{},mark=x.image?`<img src="${x.image}" alt="">`:`<span>${x.html?giftGlyph(x.html):esc(x.emoji||'🎁')}</span>`;return `<div class="zc-gift-card"><div class="zc-gift-top"><span>${ci('sparkle',18)} ${m.mine?'Gift sent':'Gift received'}</span><b>${m.mine?'−':'+'}${n(x.coins)} Coins</b></div><div class="zc-gift-body"><span class="zc-gift-icon">${mark}<i>${ci('crown',13)}</i></span><div><h3>${esc(x.name||'Gift')}</h3><p>${m.mine?'Delivered to':'From'} ${esc(first(h.n))}</p></div></div></div>`}
function zcVoiceMemo(m){return window.ZimiChatVoice?.messageView(m)||''}
function zcVoiceToggle(button,id){window.ZimiChatVoice?.play(id)}
function zcBubble(m,h){
 const tick=m.mine&&m.status!=='failed'?`<span class="zc-tick ${m.status==='read'?'read':''}" role="img" aria-label="${m.status==='read'?'Read':'Sent'}">${ci(m.status==='read'?'checks':'check',16)}</span>`:'',actionable=zcActionable(m);
 const open=actionable?` role="button" tabindex="0" aria-haspopup="dialog" aria-description="Swipe ${m.mine?'left':'right'} to reply, or hold for message options" onclick="if(event.detail===0)zcMessageMenu('${domId(m.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();zcMessageMenu('${domId(m.id)}')}"`:'';
 const meta=`<span class="zc-meta">${m.automated===true?'<span class="zc-automated">Automated welcome</span>':''}${m.edited&&!m.deleted?'<span class="zc-edited">Edited</span>':''}${m.status==='failed'?'<b>Not sent</b>':`<time${m.at?` datetime="${esc(m.at)}"`:''}>${esc(zcClock(m))}</time>`}${tick}</span>`;
 const body=m.deleted?`<div class="bub zc-deleted">${m.mine?'You deleted this message':'This message was deleted'}</div>`:m.kind==='gift'?zcGiftCard(m,h):m.kind==='voice'?zcVoiceMemo(m):m.kind==='image'?zcPhotoBubble(m,open):`<div class="bub"${open}>${escChat(m.text)}</div>`;
 return `<div class="zc-msg ${m.mine?'mine':'theirs'} zc-msg-${m.kind||'text'}" id="zc-m-${domId(m.id)}">${m.mine?'':`<span class="zc-msg-avatar" aria-hidden="true">${zcPhoto(h)}</span>`}<div class="zc-msg-stack"${actionable?` data-message-id="${domId(m.id)}"`:''}>${actionable?`<span class="zc-swipe-cue" aria-hidden="true">${ci('reply',18)}</span>`:''}${!m.deleted?zcQuote(m.reply,h,m.mine):''}${body}${meta}</div></div>`
}
function zcThreadList(h){const pending=contentSurface('thread','thread','Loading messages');if(pending)return pending;if(!S.msgs.length)return zcThreadNote(h)+`<div class="zc-thread-empty">${hi('chat',32)}<h2>Say hello to ${esc(first(h.n))}</h2><p>Your messages will appear here.</p></div>`;let day='';return S.msgs.map((m,i)=>{const label=zcDay(m.at),divider=label&&label!==day?`<div class="zc-thread-day"><span>${esc(label)}</span></div>`:'';if(label)day=label;return divider+(i?'':zcThreadNote(h))+zcBubble(m,h)}).join('')}
function zcThreadChips(){const chips=[['🔥','Love it',"zcThreadSend('Love it 🔥')"],['💖','Thank you',"zcThreadSend('Thank you! 💖')"]];return `<div class="zc-chips" role="group" aria-label="Quick replies">${chips.map(([emoji,label,action])=>`<button ${action.startsWith("zcThreadSend")?"data-chat-send":""} ${action.startsWith("zcThreadSend")&&zcThreadBlocked()?"disabled":""} onclick="${action}"><span aria-hidden="true">${emoji}</span>${label}</button>`).join('')}</div>`}
/* The gift catalog, one tap from the composer. A tap opens the gift sheet with that gift chosen,
   so coins are only spent from its Send button. Members only, as with the composer's gift button. */
function zcThreadGifts(h){
 if(isHost()||!Home.gifts.length||Chats.rows.find(c=>c.user.id===h.id)?.bot)return '';
 const blocked=!!zcThreadBlocked();
 return `<div class="zc-gift-strip" role="group" aria-label="Send a gift">${Home.gifts.map(x=>`<button type="button" onclick="zcQuickGift('${domId(x.id)}')" aria-label="${esc(x.name)}, ${n(x.coins)} coins" ${blocked?'disabled':''}>${homeGiftUrl(x.mediaUrl)?`<img src="${homeGiftUrl(x.mediaUrl)}" alt="" loading="lazy" decoding="async">`:`<span aria-hidden="true">${esc(x.emoji||'🎁')}</span>`}<b>${n(x.coins)}</b></button>`).join('')}</div>`;
}
function zcQuickGift(id){if(isHost()||!S.h||zcThreadBlocked())return;homeGifts(S.h);homeSelectGift(id)}
const zcEmoji=['😊','😂','😍','🥰','🔥','💖','👏','🙌','🎶','🎧','✨','🙏'];
function zcThreadComposer(h){
 const text=Chats.drafts[S.h]||'',send=!!text.trim()||!!Chats.editing,recording=window.ZimiChatVoice?.active();
 return `<p id="zc-send-status" class="zc-thread-note" role="status" ${!zcThreadBlocked()?"hidden":""}>${esc(zcThreadBlocked())}</p><div id="zc-context">${zcContextView(h)}</div><div id="zc-attach" class="zc-attach" role="menu" aria-label="Add to your message" hidden onkeydown="if(event.key==='Escape'){zcThreadAttach(false);document.querySelector('.zc-composer-add')?.focus()}"><button role="menuitem" data-chat-send ${zcThreadBlocked()?"disabled":""} onclick="zcPickPhoto()">${ci('image',20)}<span>Photo</span></button><button role="menuitem" onclick="zcThreadAttach(false);zcThreadEmoji(true)"><span aria-hidden="true">&#128522;</span><span>Emoji</span></button></div><div id="zc-emoji" class="zc-emoji" role="group" aria-label="Emoji" hidden>${zcEmoji.map(e=>`<button onclick="zcThreadInsert('${e}')" aria-label="Insert ${e}">${e}</button>`).join('')}</div><div id="zc-recording">${window.ZimiChatVoice?.view()||''}</div><div class="zc-composer" ${recording?'hidden':''}><div class="zc-composer-field"><button class="zc-composer-icon zc-composer-add" aria-label="Add a photo or emoji" aria-haspopup="menu" aria-expanded="false" aria-controls="zc-attach" onclick="zcThreadAttach()">${ci('add',24)}</button><input id="ti" placeholder="Message&#8230;" aria-label="Message ${esc(h.n)}" maxlength="2000" autocomplete="off" value="${esc(text)}" oninput="zcComposerInput()" onkeydown="if(event.key==='Enter'&&!event.isComposing){event.preventDefault();zcThreadSend()}"><input id="zc-photo-input" type="file" accept="image/jpeg,image/png,image/webp" hidden onchange="zcSendPhoto(this)">${isHost()?'':`<button class="zc-composer-icon zc-composer-gift" aria-label="Send a gift" onclick="homeGifts('${domId(h.id)}')">${hi('gift',22)}</button>`}<button class="zc-composer-send ${send?'':'is-mic'}" data-chat-send ${zcThreadBlocked()?"disabled":""} aria-label="${send?'Send message':'Record voice message'}" onclick="zcComposerAction()">${ci(send?'send':'mic',22)}</button></div></div>`
}
function zcComposerInput(){const input=document.getElementById('ti');if(input)Chats.drafts[S.h]=input.value;zcUpdateComposer()}
function zcUpdateComposer(){const button=document.querySelector('.zc-composer-send');if(!button)return;const send=!!document.getElementById('ti')?.value.trim()||!!Chats.editing,label=send?'Send message':'Record voice message';if(button.getAttribute('aria-label')!==label){button.setAttribute('aria-label',label);button.innerHTML=ci(send?'send':'mic',22)}button.classList.toggle('is-mic',!send);button.disabled=!!zcThreadBlocked()}
function zcComposerAction(){if(document.getElementById('ti')?.value.trim()||Chats.editing)zcThreadSend();else window.ZimiChatVoice?.start()}
function zcThread(){if(Chats.contextPeer!==S.h){Chats.reply=null;Chats.editing=null;Chats.menu='';Chats.contextPeer=S.h}const h=zcThreadPerson();return `<div class="zc-thread">${zcThreadHeader(h)}${zcThreadLive(h)}<div class="zc-thread-scroll" id="tf"></div><div class="fx" id="fl"></div>${zcThreadChips()}${zcThreadGifts(h)}${zcThreadComposer(h)}<div id="zc-menu-root"></div></div>${homeGiftSheet()}`}
function zcUpdateSendControls(){const reason=zcThreadBlocked();document.querySelectorAll("[data-chat-send]").forEach(button=>{button.disabled=!!reason;button.title=reason});zcUpdateComposer();const status=document.getElementById("zc-send-status");if(status){status.hidden=!reason;status.textContent=reason}}
function zcPaintThread(scrollToEnd=false){zcUpdateSendControls();const f=document.getElementById('tf');if(!f)return;const nearBottom=f.scrollHeight-f.scrollTop-f.clientHeight<80,scroll=f.scrollTop;f.innerHTML=zcThreadList(zcThreadPerson());f.scrollTop=scrollToEnd||nearBottom?f.scrollHeight:scroll;contentImagesReady();window.ZimiChatVoice?.paintPlayback();window.ZimiChatPhoto?.sync()}
/* Quick replies pass their text; the composer sends and clears its draft. */
function zcThreadSend(text){const input=document.getElementById('ti'),value=String(text??input?.value??'').trim().slice(0,2000);if(!value||!S.h)return;const reason=zcThreadBlocked();if(reason){appNotice(reason);return}
 if(Chats.reply&&!zcCanReply(zcFind(Chats.reply.id))){zcClearContext();appNotice('That message is no longer available to reply to.');return}
 const editing=text===undefined&&Chats.editing;
 if(editing){const m=zcFind(editing.id);if(!zcCanEdit(m)){zcClearContext();appNotice('That message is no longer available to edit.');return}Native.send('chat.edit',{to:S.h,id:editing.id,text:value});Object.assign(m,{text:value,edited:true});zcRefreshReplies(m);Chats.editing=null}
 else{const reply=Chats.reply;Native.send('chat.send',{to:S.h,text:value,...(reply?{replyTo:reply.id}:{})});S.msgs.push({id:'local-'+crypto.randomUUID(),local:true,mine:true,text:value,at:new Date().toISOString(),status:'sent',...(reply?{reply:{...reply,deleted:false}}:{})});Chats.reply=null}
 if(text===undefined&&input){input.value='';Chats.drafts[S.h]='';input.focus()}zcThreadEmoji(false);zcPaintContext();zcPaintThread(true)}
function zcThreadGift(to,gift,receipt={}){
  if(!to||!gift)return;
  const target=String(to),identity=receipt.idempotencyKey||receipt.id||receipt.transactionId,rows=Chats.gifts[target]||=[];
  if(identity&&rows.some(message=>message.giftReceipt===String(identity)))return;
  const m={id:'gift-'+(identity||crypto.randomUUID()),giftReceipt:identity?String(identity):'',kind:'gift',mine:true,at:receipt.createdAt||new Date().toISOString(),status:'sent',gift:{name:gift.name,emoji:gift.emoji||'',image:gift.mediaUrl?homeGiftUrl(gift.mediaUrl):'',coins:Number.isSafeInteger(receipt.coins)?receipt.coins:gift.coins}};
  rows.push(m);
  if(S.v==='thread'&&S.h===target){S.msgs.push(m);paint();playGift(gift.name,gift.emoji||'🎁',gift.coins,'')}
}
function zcThreadMenu(open){const menu=document.querySelector('.zc-thread-menu'),button=document.querySelector('.zc-thread-more>button');if(!menu||!button)return;const show=open??menu.hidden;menu.hidden=!show;button.setAttribute('aria-expanded',String(show));if(show)menu.querySelector('button')?.focus()}
function zcThreadEmoji(open){const tray=document.getElementById('zc-emoji');if(!tray)return;tray.hidden=!(open??tray.hidden)}
function zcThreadInsert(emoji){const input=document.getElementById('ti');if(!input)return;const end=input.selectionEnd??input.value.length;input.setRangeText(emoji,input.selectionStart??end,end,'end');Chats.drafts[S.h]=input.value;zcUpdateComposer();input.focus()}
/* Preview-only conversation matching the design reference. */
function zcDemoThread(h){const name=first(h?.n||'there'),at=minutes=>new Date(Date.now()-minutes*60000).toISOString();return [
  {id:'demo-m1',mine:true,status:'read',at:at(4),text:`Hey ${name}! Loved your acoustic guitar intro earlier today 🔥`},
  {id:'demo-m2',mine:false,at:at(3),text:'Thank you so much! 😊 Getting ready for the evening live set. Are you joining?'},
  {id:'demo-m3',kind:'gift',mine:true,status:'read',at:at(2),gift:{name:'Super Diamond Crown',emoji:'💎',coins:250}},
  {id:'demo-m4',mine:false,at:at(1),text:'Omg thank you for the crown!! You’re incredible! 💖 Let’s do a quick video call if you’re free!'},
  {id:'demo-m5',kind:'voice',mine:false,at:at(1),durationMs:42000},
  {id:'demo-m6',mine:true,status:'read',at:at(0),text:'Yes! Jumping on in 2 minutes, let me grab my headphones 🎧'}]}
window.ZimiHome.views.thread=zcThread;
Native.on('gift.sent',d=>zcThreadGift(d.to,d.giftDetails||window.ZimiCoins?.giftReceipt(d)||Home.gifts.find(x=>x.id===d.gift),d));
/* A failed send cannot be matched to a request, so it marks the latest unconfirmed message. */
/* Photos from members reach creators blurred; the creator chooses which ones to view, again on every visit. */
function zcPhotoBubble(m){const src=imageSrc(m.imageUrl),img=src?`<img src="${src}" alt="" loading="lazy">`:'',blurred=isHost()&&!m.mine&&!Chats.revealed[m.id],id=domId(m.id);return `<div class="zc-photo-wrap"><button type="button" class="zc-photo ${blurred?'is-blurred':''}" aria-haspopup="dialog" aria-label="${blurred?'Photo hidden. Tap to view':'Open photo'}" aria-description="Swipe ${m.mine?'left':'right'} to reply, or hold for message options" onclick="${blurred?`zcRevealPhoto('${id}')`:`ZimiChatPhoto.open('${id}')`}" ${src?'':'disabled'}>${img}${blurred?`<span>${hi('eye',18)} Tap to view</span>`:m.status==='sending'?'<span>Sending…</span>':`<span class="zc-photo-view-hint" aria-hidden="true">${ci('expand',17)}</span>`}</button>${zcActionable(m)?`<button class="zc-photo-options" aria-label="Photo message options" aria-haspopup="dialog" onclick="zcMessageMenu('${id}')">${ci('more',18)}</button>`:''}</div>`}
function zcRevealPhoto(id){Chats.revealed[id]=true;paint()}
/* Sent messages (with a server ID) can be replied to, edited and deleted; gifts and pending messages cannot. */
function zcActionable(m){return !!m?.id&&!m.local&&!m.deleted&&m.kind!=='gift'&&m.status!=='sending'&&m.status!=='failed'}
function zcCanReply(m){return zcActionable(m)&&!zcThreadBlocked()}
function zcCanEdit(m){return zcCanReply(m)&&m.mine&&!m.automated&&m.kind!=='image'&&m.kind!=='voice'}
function zcQuote(r,h,mine){if(!r)return '';const author=r.mine?'You':first(h.n),what=r.deleted?'Deleted message':r.text?escChat(r.text):r.image?'Photo':r.voice?'Voice message':'Message';return `<div class="zc-reply"><span class="zc-reply-label">${ci('reply',13)}${mine?'You replied':esc(first(h.n))+' replied'}</span><button type="button" class="zc-quote" aria-label="View original message from ${esc(author)}" onclick="event.stopPropagation();zcJump('${domId(r.id)}')"><b>${esc(author)}</b><span>${what}</span></button></div>`}
function zcJump(id){const el=document.getElementById('zc-m-'+id);if(!el){appNotice('The original message is not in the loaded conversation.');return}el.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});el.classList.add('zc-flash');el.querySelector('.bub[tabindex],.zc-photo')?.focus({preventScroll:true});setTimeout(()=>el.classList.remove('zc-flash'),1400)}
const zcFind=id=>S.msgs.find(x=>String(x.id)===String(id));
function zcMessageMenu(id){if(!zcActionable(zcFind(id))||(Chats.menu===id&&document.querySelector('.zc-message-menu')))return;Chats.menu=id;zcPaintMenu();document.querySelector('.zc-message-menu button')?.focus({preventScroll:true})}
function zcCloseMenu(){const id=Chats.menu;Chats.menu='';zcPaintMenu();if(id)document.querySelector(`#zc-m-${CSS.escape(String(id))} :is(.bub[tabindex],.zc-photo,.zc-voice-options)`)?.focus({preventScroll:true})}
function zcPaintMenu(){const root=document.getElementById('zc-menu-root');if(root)root.innerHTML=zcMessageMenuView()}
function zcMessageMenuView(){
 const m=Chats.menu&&zcFind(Chats.menu);if(!zcActionable(m))return '';
 const id=domId(m.id),items=[zcCanReply(m)&&['Reply',`zcStartReply('${id}')`,'reply'],zcCanEdit(m)&&['Edit',`zcStartEdit('${id}')`,'edit'],m.mine&&['Delete for everyone',`zcDeleteMessage('${id}',true)`,'trash','danger'],['Delete for me',`zcDeleteMessage('${id}',false)`,'trash','danger']].filter(Boolean);
 return `<div class="zc-overlay" onclick="if(event.target===this)zcCloseMenu()"><section class="zc-dialog zc-message-menu" role="dialog" aria-modal="true" aria-label="Message options" onkeydown="zcMenuKeys(event)"><span class="zc-menu-handle" aria-hidden="true"></span><p class="zc-menu-preview">${m.kind==='voice'?'Voice message':m.kind==='image'&&!m.text?'Photo':escChat(m.text)}</p>${items.map(([label,action,icon,tone])=>`<button class="${tone||''}" onclick="${action}">${ci(icon,21)}<span>${label}</span></button>`).join('')}<button class="zc-menu-cancel" onclick="zcCloseMenu()">Cancel</button></section></div>`
}
function zcMenuKeys(event){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();zcCloseMenu();return}if(event.key!=='Tab')return;const buttons=[...event.currentTarget.querySelectorAll('button')],first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}
function zcStartReply(id){const m=zcFind(id);Chats.menu='';zcPaintMenu();if(!zcCanReply(m))return;if(window.ZimiChatVoice&&!ZimiChatVoice.canChangeReply())return appNotice('Retry or cancel your voice message before changing the reply.');Chats.contextPeer=S.h;Chats.editing=null;Chats.reply={id:m.id,mine:!!m.mine,text:m.text||'',image:m.kind==='image',voice:m.kind==='voice'};zcThreadAttach(false);zcThreadEmoji(false);zcPaintContext();document.getElementById('ti')?.focus({preventScroll:true})}
function zcStartEdit(id){const m=zcFind(id);Chats.menu='';zcPaintMenu();if(!zcCanEdit(m))return;if(window.ZimiChatVoice?.active())return appNotice('Finish or cancel your voice recording before editing a message.');Chats.reply=null;Chats.editing={id:m.id,text:m.text};zcPaintContext();const input=document.getElementById('ti');if(input){input.value=m.text;input.focus();input.setSelectionRange(input.value.length,input.value.length)}zcUpdateComposer()}
function zcCancelContext(){if(window.ZimiChatVoice&&!ZimiChatVoice.canChangeReply())return appNotice('Retry or cancel your voice message before changing the reply.');const editing=Chats.editing;Chats.reply=null;Chats.editing=null;zcPaintContext();const input=document.getElementById('ti');if(editing&&input){input.value='';Chats.drafts[S.h]=''}zcUpdateComposer();input?.focus()}
function zcPaintContext(){window.ZimiChatVoice?.setReply(Chats.reply);const root=document.getElementById('zc-context');if(root)root.innerHTML=zcContextView(zcThreadPerson())}
function zcClearContext(){Chats.reply=null;Chats.editing=null;zcPaintContext()}
function zcContextView(h){const r=Chats.reply,e=Chats.editing;if(!r&&!e)return '';return `<div class="zc-context" role="status" aria-live="polite"><span class="zc-context-icon" aria-hidden="true">${ci(e?'edit':'reply',20)}</span><div><b>${e?'Edit message':r.mine?'Replying to yourself':'Replying to '+esc(first(h.n))}</b><span>${e?escChat(e.text):r.text?escChat(r.text):r.image?'Photo':r.voice?'Voice message':''}</span></div><button aria-label="${e?'Cancel editing':'Cancel reply'}" onclick="zcCancelContext()">×</button></div>`}
function zcRefreshReplies(original){
 for(const message of S.msgs)if(message.reply&&String(message.reply.id)===String(original.id))message.reply={...message.reply,text:original.deleted?'':original.text||'',image:!original.deleted&&original.kind==='image',voice:!original.deleted&&original.kind==='voice',deleted:!!original.deleted};
 if(String(Chats.reply?.id)===String(original.id)){if(original.deleted)Chats.reply=null;else Object.assign(Chats.reply,{text:original.text||'',image:original.kind==='image',voice:original.kind==='voice'})}
 if(original.deleted&&String(Chats.editing?.id)===String(original.id))Chats.editing=null;
 zcPaintContext()
}
function zcDeleteMessage(id,everyone){const m=zcFind(id);Chats.menu='';zcPaintMenu();if(!zcActionable(m)||!S.h||(everyone&&!m.mine))return;window.ZimiChatVoice?.remove(m.id);Native.send('chat.delete',{to:S.h,id:m.id,everyone});if(everyone){Object.assign(m,{deleted:true,text:'',imageUrl:'',audioUrl:'',durationMs:0,kind:'text',edited:false});zcRefreshReplies(m)}else{S.msgs=S.msgs.filter(x=>x!==m);if(String(Chats.reply?.id)===String(id)||String(Chats.editing?.id)===String(id))zcClearContext()}paint()}
/* "+" holds the extras: a photo or an emoji. */
function zcThreadAttach(open){const menu=document.getElementById('zc-attach'),button=document.querySelector('.zc-composer-add');if(!menu||!button)return;const show=open??menu.hidden;menu.hidden=!show;button.setAttribute('aria-expanded',String(show));if(show){zcThreadEmoji(false);menu.querySelector('button:not(:disabled)')?.focus()}}
function zcPickPhoto(){
 zcThreadAttach(false);const input=document.getElementById('zc-photo-input');if(!input)return;
 delete input.zcPhotoIntent;if(S.v!=='thread'||!S.h)return;
 const reason=zcThreadBlocked();if(reason)return appNotice(reason);
 if(Chats.reply&&!zcCanReply(zcFind(Chats.reply.id)))return appNotice('That message is no longer available to reply to.');
 // A native chooser can outlive navigation, a deleted original, or an account
 // change. Bind its intent to this exact input before handing over to the OS.
 const intent=input.zcPhotoIntent={to:S.h,owner:S.user,reply:Chats.reply?{...Chats.reply}:null,replyContext:Chats.reply};
 input.oncancel=()=>{if(input.zcPhotoIntent===intent)delete input.zcPhotoIntent};
 input.value='';input.click()
}
async function zcSendPhoto(input){
 const intent=input.zcPhotoIntent,file=input.files&&input.files[0];delete input.zcPhotoIntent;input.value='';
 if(!file||!intent)return;
 const {to,owner,reply,replyContext}=intent,current=()=>S.v==='thread'&&S.h===to&&S.user===owner;
 const validate=()=>{const reason=zcThreadBlocked();if(reason)throw new Error(reason);if(reply&&!zcCanReply(zcFind(reply.id)))throw new Error('That message is no longer available to reply to.')};
 try{
  if(!current())return;validate();const photo=await obReadPhoto(file);if(!current())return;validate();
  const original=reply&&zcFind(reply.id),quote=original?{...reply,text:original.text||'',image:original.kind==='image',voice:original.kind==='voice',deleted:false}:null;
  Native.send('chat.photo',{to,photo,...(reply?{replyTo:reply.id}:{})});
  if(current()){S.msgs.push({id:'local-'+crypto.randomUUID(),local:true,mine:true,kind:'image',imageUrl:photo,text:'',at:new Date().toISOString(),status:'sending',...(quote?{reply:quote}:{})});if(Chats.reply===replyContext)Chats.reply=null;zcPaintContext();paint()}
 }catch(error){if(current())appNotice(error.message)}
}
Native.on('chat.photoSent',d=>{const m=S.msgs.find(x=>x.local&&x.kind==='image'&&x.status==='sending');if(m&&S.h===String(d.to)){m.status='sent';if(d.id){m.id=d.id;m.local=false}if(d.reply!==undefined)m.reply=d.reply;paint()}});
/* An edit or a delete for everyone, from either person or another device. */
Native.on('chat.updated',d=>{const u=d.message;if(!u||S.v!=='thread'||S.h!==String(d.with))return;const m=zcFind(u.id);if(m){Object.assign(m,{text:u.text,edited:!!u.edited,deleted:!!u.deleted,kind:u.kind,imageUrl:u.imageUrl,audioUrl:u.audioUrl,durationMs:u.durationMs});if(u.reply!==undefined)m.reply=u.reply}zcRefreshReplies(u);if(u.deleted&&String(Chats.menu)===String(u.id)){Chats.menu='';zcPaintMenu()}paint()});
Native.on('chat.removed',d=>{const before=S.msgs.length;S.msgs=S.msgs.filter(x=>String(x.id)!==String(d.id));if(String(Chats.reply?.id)===String(d.id)||String(Chats.editing?.id)===String(d.id))zcClearContext();if(String(Chats.menu)===String(d.id)){Chats.menu='';zcPaintMenu()}if(S.msgs.length!==before)paint()});
/* The server hid a phone number or abusive word: show the sender exactly what was delivered. */
Native.on('chat.sent',d=>{const changed=d.text!==d.sent;if(d.inCall){const m=changed&&[...S.rmsgs].reverse().find(x=>x[0]==='me'&&x[2]===d.sent);if(m){m[2]=d.text;paintFeed()}}else{const m=S.msgs.find(x=>x.local&&x.mine&&x.kind!=='image'&&x.text===d.sent&&x.status!=='failed');if(m&&S.h===String(d.to)){m.text=d.text;if(d.id){m.id=d.id;m.local=false}if(d.reply!==undefined)m.reply=d.reply;paint()}}if(changed)appNotice('Phone numbers and abusive words are hidden in chat.')});
Native.on('operation.error',d=>{if(d.action==='chat.photo'&&S.v==='thread'){const m=S.msgs.find(x=>x.local&&x.kind==='image'&&x.status==='sending');if(m){m.status='failed';paint()}return}if(d.action!=='chat.send'||S.v!=='thread')return;const m=[...S.msgs].reverse().find(x=>x.local&&x.status==='sent');if(m){m.status='failed';paint()}});
/* Swipe own messages left and incoming messages right; vertical intent remains native scrolling.
   Event delegation survives history redraws without attaching one listener per message. */
let zcGesture=null,zcSuppressedClick=null;
function zcEndGesture(event,commit=false){
 const gesture=zcGesture;if(!gesture||(event&&event.pointerId!==gesture.pointerId))return;
 zcGesture=null;clearTimeout(gesture.timer);
 const {stack}=gesture;
 stack.classList.remove('zc-swiping','zc-swipe-ready');stack.style.removeProperty('--reply-shift');stack.style.removeProperty('--reply-progress');
 if(stack.hasPointerCapture?.(gesture.pointerId))stack.releasePointerCapture(gesture.pointerId);
 if(gesture.moved||gesture.held)zcSuppressedClick={stack,held:gesture.held,until:Date.now()+800};
 if(commit&&gesture.moved&&gesture.armed&&!gesture.held&&stack.isConnected&&S.v==='thread'&&S.h===gesture.peer)zcStartReply(gesture.id)
}
document.addEventListener('pointerdown',event=>{
 // A new press is deliberate; suppression belongs only to the previous release.
 zcSuppressedClick=null;
 if(zcGesture){zcEndGesture();return}
 if(S.v!=='thread'||event.button!==0||event.isPrimary===false||event.target.closest?.('a,input,textarea,.zc-meta'))return;
 const stack=event.target.closest?.('.zc-msg-stack[data-message-id]');if(!stack)return;
 const id=stack.dataset.messageId,message=zcFind(id);if(!zcActionable(message))return;
 const direction=message.mine?-1:1;
 // Measure travel toward the reply direction so touches near either edge stay reachable.
 const room=direction<0?event.clientX-8:document.documentElement.clientWidth-event.clientX-8;
 const distance=Math.min(64,Math.max(16,room*.65));
 const gesture={stack,id,peer:S.h,pointerId:event.pointerId,x:event.clientX,y:event.clientY,direction,distance,moved:false,held:false,armed:false,feedback:false,timer:null};
 zcGesture=gesture;
 gesture.timer=setTimeout(()=>{if(zcGesture!==gesture||!stack.isConnected||gesture.peer!==S.h)return;gesture.held=true;zcMessageMenu(id);obHaptic('light')},450)
},{passive:true});
document.addEventListener('pointermove',event=>{
 const gesture=zcGesture;if(!gesture||gesture.pointerId!==event.pointerId||gesture.held)return;
 const dx=(event.clientX-gesture.x)*gesture.direction,dy=Math.abs(event.clientY-gesture.y);
 if(!gesture.moved){
  if((dy>10&&dy>=Math.abs(dx))||dx< -10){gesture.moved=true;zcEndGesture(event);return}
  if(dx<=10||dx<dy*1.35)return;
  clearTimeout(gesture.timer);
  gesture.moved=true;
  if(!zcCanReply(zcFind(gesture.id))){zcEndGesture(event);return}
  gesture.stack.classList.add('zc-swiping');gesture.stack.setPointerCapture?.(event.pointerId)
 }
 if(dy>48&&dy>dx){zcEndGesture(event);return}
 gesture.armed=dx>=gesture.distance;gesture.stack.classList.toggle('zc-swipe-ready',gesture.armed);
 if(gesture.armed&&!gesture.feedback){gesture.feedback=true;obHaptic('light')}
 gesture.stack.style.setProperty('--reply-shift',gesture.direction*Math.max(0,Math.min(72,dx*.75))+'px');
 gesture.stack.style.setProperty('--reply-progress',Math.max(0,Math.min(1,dx/gesture.distance)));
 if(event.cancelable)event.preventDefault()
},{passive:false});
document.addEventListener('pointerup',event=>zcEndGesture(event,true));
document.addEventListener('pointercancel',event=>zcEndGesture(event));
// Touch begins with implicit capture on the bubble. Moving capture to its stack
// emits a loss event for that child; only a loss from our own capture cancels.
document.addEventListener('lostpointercapture',event=>{if(event.target===zcGesture?.stack)zcEndGesture(event)});
document.addEventListener('click',event=>{
 // Opening the hold menu can retarget Android's release click to the overlay.
 // Consume that click too, otherwise the menu immediately closes or selects an item.
 if(zcSuppressedClick&&Date.now()<zcSuppressedClick.until&&event.detail>0&&(zcSuppressedClick.held||zcSuppressedClick.stack.contains(event.target))){event.preventDefault();event.stopImmediatePropagation();zcSuppressedClick=null}
},true);
document.addEventListener('contextmenu',event=>{const stack=event.target.closest?.('.zc-msg-stack[data-message-id]');if(S.v==='thread'&&stack){event.preventDefault();if(zcGesture?.stack===stack)zcGesture.held=true;zcMessageMenu(stack.dataset.messageId)}});
document.addEventListener('aurora:navigate',()=>{Chats.playing='';zcEndGesture();if(S.v!=='thread'){zcClearContext();Chats.menu='';Chats.contextPeer=null}});
document.addEventListener('click',event=>{if(S.v==='thread'&&!event.target.closest?.('.zc-thread-more'))zcThreadMenu(false)});
document.addEventListener('keydown',event=>{if(event.key!=='Escape'||S.v!=='thread')return;const menu=document.querySelector('.zc-thread-menu');if(menu&&!menu.hidden){zcThreadMenu(false);document.querySelector('.zc-thread-more>button')?.focus()}else zcThreadEmoji(false)});
if(DEMO){
  const people=[{id:'ishaan',name:'Ishita Rao',photo:2,verified:true,online:true},{id:'aanya',name:'Ananya Iyer',photo:0,verified:true,online:true},{id:'meher',name:'Meher Kaur',photo:1,verified:true,online:false},{id:'demo-rewards',name:'BinzoLive Rewards & Bot',bot:true},{id:'kabir',name:'Kavya Malhotra',photo:4,online:true},{id:'demo-tara',name:'Tara Bhatt',photo:5,verified:true,online:false}];
  const previews=["Just finished my ghazal set. Chai and one more song soon?",'Sent you a gift: 💎 Super Diamond Crown','Thanks for the awesome session tonight! Loved it.','Bonus claimed: +200 free coins credited to your wallet','Free for a quick call this evening?','Audio message (0:42)'];
  const times=['2m ago','14m ago','1h ago','3h ago','Yesterday','Jul 24'];
  Chats.rows=people.map((p,i)=>{const user={...p,role:p.bot?'sender':'host',category:i===0?'Music':i===4?'Gaming':'Talk',avatarUrl:p.bot?'':PREVIEW_HOSTS[p.photo],availableForCall:!!p.online};knowHost(user);return {id:'demo-chat-'+i,user,bot:p.bot,last:previews[i],lastKind:['call','gift','text','system','text','voice'][i],lastMine:i===2||i===4,lastStatus:i===2?'read':'sent',lastAt:new Date(Date.now()-[2,14,60,180,1440,10080][i]*60000).toISOString(),displayTime:times[i],unread:[2,1,0,1,0,0][i],hasCalls:i===0||i===2}});
  Chats.total=Chats.rows.length;Chats.unreadConversations=3;CH.splice(0,CH.length,...Chats.rows.map(c=>[c.user.id,c.last,c.displayTime,c.unread]));
}
