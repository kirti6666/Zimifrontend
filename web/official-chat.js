/* Binzo Team Chat is a read-only, server-owned announcement channel.
   Audience selection and account-role filtering stay on the server. */
window.ZimiOfficialChat=(()=>{
  const ID='bingo-live-official',NAME='Binzo Team Chat',AVATAR='__OFFICIAL_AVATAR__';
  const state={account:'',from:'chats',messages:[],summary:null,loaded:false,loading:false,loadingMore:false,hasMore:false,before:null,error:'',readError:'',readPending:null,readAll:false,loadRequest:0,sequence:0,foreground:true,scrollBottom:false};
  const active=()=>S.v==='official-chat';
  const visible=()=>active()&&state.foreground&&!document.hidden;
  const unread=()=>Math.max(0,Number(state.summary?.unread)||0);
  const avatar=()=>`<span class="zc-avatar zo-avatar"><img src="${AVATAR}" alt="" width="50" height="50" decoding="async"></span>`;
  const verified=()=>`<span class="zh-verified zo-verified" role="img" aria-label="Verified official account">${hi('verified',16)}</span>`;
  const validId=value=>typeof value==='string'&&/^announcement:[a-f\d]{24}$/i.test(value);
  const order=(a,b)=>(Date.parse(a.createdAt)||0)-(Date.parse(b.createdAt)||0)||String(a.id).localeCompare(String(b.id));
  function summary(value){if(value?.id!==ID)return;state.summary={...value,unread:Math.max(0,Number(value.unread)||0)}}
  function row(){
    if(!['all','unread'].includes(Chats.filter)||(Chats.filter==='unread'&&!unread()))return '';
    const last=state.summary?.lastMessage,preview=last?.body||last?.title||'Official updates, rules, regulations and announcements',query=Chats.query.trim().toLowerCase();
    if(query&&![NAME,'BinzoLive',preview,'official','updates','announcements'].some(value=>value.toLowerCase().includes(query)))return '';
    const count=unread();
    return `<button type="button" class="zc-row rowlink zo-row ${count?'zc-unread':''}" data-official-chat onclick="ZimiOfficialChat.open('chats')" aria-label="${NAME}, verified official account${count?', '+count+' unread messages':''}">${avatar()}<span class="zc-row-body"><span class="zc-row-heading"><span class="zc-name">${NAME} ${verified()}</span><time${last?.createdAt?` datetime="${esc(last.createdAt)}"`:''}>${last?.createdAt?esc(zcTime({lastAt:last.createdAt})):''}</time></span><span class="zc-row-preview"><span class="zc-message"><span>${esc(preview)}</span></span>${count?`<span class="zc-unread-count">${count>99?'99+':n(count)}</span>`:''}</span></span></button>`;
  }
  function open(from='chats'){
    state.from=['settings','notifications'].includes(from)?from:'chats';state.scrollBottom=true;
    if(!active())go('official-chat');else load();
  }
  function load(more=false){
    if(more&&(state.loadingMore||!state.hasMore))return;
    state.error='';state.loading=!more&&!state.loaded;state.loadingMore=more;state.loadRequest=++state.sequence;
    if(DEMO){state.loaded=true;state.loading=state.loadingMore=false;paint();return}
    const requestId=state.loadRequest,payload={requestId,...(more&&state.before?{before:state.before}:{})};
    paint();
    if(state.loading&&!state.loaded)contentAfterLoadingPaint(()=>{if(active()&&state.loadRequest===requestId)Native.send('official.load',payload)});
    else Native.send('official.load',payload);
  }
  function render(){
    return `<section class="zc-thread zo-thread" aria-label="Binzo Team Chat"><header class="zc-thread-header">${backButton('ZimiOfficialChat.back()',{label:'Back to '+state.from,slot:'zc-thread-back'})}<div class="zc-thread-person"><span class="zc-avatar-wrap">${avatar()}</span><span class="zc-thread-title"><h1>${NAME} ${verified()}</h1><small>Official announcements</small></span></div><button type="button" class="zo-preferences" onclick="ZimiOfficialChat.preferences()" aria-label="Notifications and alerts">${hi('set',21)}</button></header><div class="zc-thread-scroll" id="zo-messages" role="log" aria-label="Official Binzo Team messages" aria-live="polite"></div><div class="zo-read-error" id="zo-read-error" role="status" hidden></div></section>`;
  }
  function bubble(message,{groupStart=true,groupEnd=true}={}){
    const sender=groupEnd?`<span class="zc-msg-avatar" aria-hidden="true">${avatar()}</span>`:'<span class="zc-msg-avatar-spacer" aria-hidden="true"></span>';
    return `<div class="zc-msg theirs zo-message ${zcGroupClasses(groupStart,groupEnd)}" data-official-message="${esc(message.id)}">${sender}<div class="zc-msg-stack"><div class="bub">${message.title?`<strong>${esc(message.title)}</strong>`:''}<span>${esc(message.body||'')}</span></div></div></div>`;
  }
  function timeline(){
    if(state.loading&&!state.loaded)return contentSkeleton('thread','Loading messages');
    const messages=[...state.messages].sort(order);
    const error=state.error?`<div class="zh-error" role="alert">${esc(state.error)}<button type="button" onclick="ZimiOfficialChat.load()">Try again</button></div>`:'';
    const older=state.hasMore?`<button type="button" class="zo-earlier" onclick="ZimiOfficialChat.load(true)" ${state.loadingMore?'disabled':''}>${state.loadingMore?'Loading earlier messages…':'Earlier messages'}</button>`:'';
    if(!messages.length)return error+`<div class="zc-thread-empty"><h2>${NAME}</h2><p>Official updates, rules, regulations and announcements from Binzo will appear here.</p></div>`;
    let day='';return older+error+messages.map((message,index)=>{const previous=messages[index-1],following=messages[index+1],next=zcDay(message.createdAt),dayChanged=!!next&&next!==day,stamp=zcTimelineStamp(message,previous,dayChanged);if(next)day=next;return stamp+bubble(message,{groupStart:!zcSameMessageGroup(previous,message),groupEnd:!zcSameMessageGroup(message,following)})}).join('');
  }
  function capture(){if(!active())return null;const list=document.getElementById('zo-messages');return {top:list?.scrollTop||0,near:!list||list.scrollHeight-list.scrollTop-list.clientHeight<80}}
  function paint(saved){
    if(!active()){if(S.v==='chats')r();else if(['home','profile','settings'].includes(S.v))nav();return}
    const list=document.getElementById('zo-messages');if(!list)return;
    const near=saved?.near??list.scrollHeight-list.scrollTop-list.clientHeight<80,top=saved?.top??list.scrollTop,height=list.scrollHeight,older=state.loadingMore;
    list.innerHTML=timeline();
    if(state.scrollBottom||near)list.scrollTop=list.scrollHeight;else list.scrollTop=top+(state.appendedOlder?list.scrollHeight-height:0);
    if(!older)state.appendedOlder=false;state.scrollBottom=false;
    const readError=document.getElementById('zo-read-error');if(readError){readError.hidden=!state.readError;readError.innerHTML=state.readError?`${esc(state.readError)} <button type="button" onclick="ZimiOfficialChat.retryRead()">Retry</button>`:''}
    markRead();
  }
  function after(saved){if(!active())return;paint(saved);const list=document.getElementById('zo-messages');if(list&&!list.zoReadWatched){list.zoReadWatched=true;list.addEventListener('scroll',markRead,{passive:true})}}
  function markRead(){
    if(DEMO||!visible()||!state.loaded||state.readPending||state.readError)return;
    const list=document.getElementById('zo-messages'),bounds=list?.getBoundingClientRect();
    if(!bounds)return;
    const ids=state.messages.filter(message=>{if(message.senderType!=='official'||message.read||!validId(message.id))return false;const node=[...list.querySelectorAll('[data-official-message]')].find(el=>el.dataset.officialMessage===message.id),box=node?.getBoundingClientRect();return box&&box.bottom>bounds.top&&box.top<bounds.bottom}).map(message=>message.id).slice(0,100);
    if(!ids.length)return;const requestId=++state.sequence;state.readPending={requestId,ids};Native.send('official.read',{ids,requestId});
  }
  function markAll(){if(DEMO){if(state.summary)state.summary.unread=0;paint();return}const requestId=++state.sequence;state.readPending={requestId,all:true};Native.send('official.read',{all:true,requestId})}
  function activity(){if(DEMO)return;Native.send('official.activity',{active:visible()});if(visible())markRead()}
  function reset(){state.sequence++;Object.assign(state,{account:'',messages:[],summary:null,loaded:false,loading:false,loadingMore:false,hasMore:false,before:null,error:'',readError:'',readPending:null,loadRequest:state.sequence,scrollBottom:false});if(active())paint()}
  Native.on('data.chats',data=>{if(data.official)summary(data.official);if(S.v==='chats')zcPaintList();if(['home','chats','profile','settings'].includes(S.v))nav()});
  Native.on('data.official',data=>{
    if(!data.background&&data.requestId!=null&&data.requestId!==state.loadRequest)return;
    const rows=Array.isArray(data.messages)?data.messages.filter(message=>validId(message.id)&&message.kind==='announcement'&&message.senderType==='official'):[],merged=new Map(data.append?state.messages.map(message=>[message.id,message]):[]);
    rows.forEach(message=>merged.set(message.id,message));
    state.messages=[...merged.values()].sort(order);
    state.hasMore=!!data.hasMore;state.before=data.before||null;
    state.appendedOlder=!!data.append;
    state.loaded=true;state.loading=state.loadingMore=false;state.error='';state.summary={...(state.summary||{}),id:ID,unread:Math.max(0,Number(data.unreadCount)||0),lastMessage:state.messages.at(-1)||null};
    paint();
  });
  Native.on('official.saved',data=>{if(data.requestId!==state.readPending?.requestId)return;const ids=new Set(data.ids||state.readPending.ids||[]),all=state.readPending.all;state.messages.forEach(message=>{if(all||ids.has(message.id))message.read=true});state.readPending=null;state.readError='';summary(data.official);paint()});
  Native.on('official.error',data=>{if(data.action==='load'&&(data.background||data.requestId===state.loadRequest)){state.loading=state.loadingMore=false;state.error=data.message||'Messages could not be loaded.'}if(data.action==='read'&&state.readPending?.requestId===data.requestId){state.readPending=null;state.readError=data.message||'Read status could not be saved.'}paint()});
  Native.on('official.changed',()=>{if(visible())load()});
  Native.on('official.open',()=>znRouteTarget({targetType:'official'}));
  Native.on('app.background',()=>{state.foreground=false;activity()});
  Native.on('app.foreground',()=>{state.foreground=true;activity()});
  const account=data=>{const id=data.user?.id||'',role=data.user?.serverRole||(data.user?.role==='host'?'host':'user'),key=id?`${id}:${role}`:'';if(key!==state.account){reset();state.account=key;if(active()){state.scrollBottom=true;load();activity()}}};
  Native.on('session',account);Native.on('profile.account',account);Native.on('auth.ok',account);
  Native.on('session.none',reset);Native.on('session.expired',reset);
  document.addEventListener('aurora:navigate',()=>{activity();if(active()){state.scrollBottom=true;load()}});
  document.addEventListener('visibilitychange',activity);
  ZimiHome.views['official-chat']=render;
  ZimiPullRefresh.register('official-chat',{refresh:()=>load(),busy:()=>state.loading||state.loadingMore});
  return {open,row,unread,updateSummary:summary,load,capture,after,markAll,back:()=>go(state.from),retryRead:()=>{state.readError='';markRead()},preferences:()=>znPreferences()};
})();
