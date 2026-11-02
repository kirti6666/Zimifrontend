/* The official account is a private, free conversation for every account.
   Announcements and the account's support history share one server timeline. */
window.ZimiOfficialChat=(()=>{
  const ID='bingo-live-official',NAME='BinzoLive',AVATAR='__OFFICIAL_AVATAR__';
  const state={account:'',from:'chats',messages:[],pending:new Map(),summary:null,loaded:false,loading:false,loadingMore:false,hasMore:false,before:null,error:'',readError:'',readPending:null,readAll:false,loadRequest:0,sequence:0,draft:'',foreground:true,scrollBottom:false};
  const active=()=>S.v==='official-chat';
  const visible=()=>active()&&state.foreground&&!document.hidden;
  const unread=()=>Math.max(0,Number(state.summary?.unread)||0);
  const avatar=()=>`<span class="zc-avatar zo-avatar"><img src="${AVATAR}" alt="" width="50" height="50" decoding="async"></span>`;
  const verified=()=>`<span class="zh-verified zo-verified" role="img" aria-label="Verified official account">${hi('verified',16)}</span>`;
  const validId=value=>typeof value==='string'&&/^(announcement|support):[a-f\d]{24}$/i.test(value);
  const order=(a,b)=>(Date.parse(a.createdAt)||0)-(Date.parse(b.createdAt)||0)||String(a.id).split(':').slice(1).join(':').localeCompare(String(b.id).split(':').slice(1).join(':'))||String(a.kind||'').localeCompare(String(b.kind||''));
  const key=()=>`official_${globalThis.crypto?.randomUUID?.().replaceAll('-','')||Date.now().toString(36)+'_'+Math.random().toString(36).slice(2)}`;
  function summary(value){if(value?.id!==ID)return;state.summary={...value,unread:Math.max(0,Number(value.unread)||0)}}
  function row(){
    if(!['all','unread'].includes(Chats.filter)||(Chats.filter==='unread'&&!unread()))return '';
    const last=state.summary?.lastMessage,preview=last?.body||last?.title||'App updates and private support',query=Chats.query.trim().toLowerCase();
    if(query&&![NAME,preview,'official'].some(value=>value.toLowerCase().includes(query)))return '';
    const count=unread();
    return `<button type="button" class="zc-row rowlink zo-row ${count?'zc-unread':''}" data-official-chat onclick="ZimiOfficialChat.open('chats')" aria-label="BinzoLive, verified official account${count?', '+count+' unread messages':''}">${avatar()}<span class="zc-row-body"><span class="zc-row-heading"><span class="zc-name">BinzoLive ${verified()}</span><time${last?.createdAt?` datetime="${esc(last.createdAt)}"`:''}>${last?.createdAt?esc(zcTime({lastAt:last.createdAt})):''}</time></span><span class="zc-row-preview"><span class="zc-message"><span>${esc(preview)}</span></span>${count?`<span class="zc-unread-count">${count>99?'99+':n(count)}</span>`:''}</span></span></button>`;
  }
  function open(from='chats'){
    state.from=['settings','notifications'].includes(from)?from:'chats';state.scrollBottom=true;
    if(!active())go('official-chat');else load();
  }
  function load(more=false){
    if(more&&(state.loadingMore||!state.hasMore))return;
    state.error='';state.loading=!more&&!state.loaded;state.loadingMore=more;state.loadRequest=++state.sequence;
    if(DEMO){state.loaded=true;state.loading=state.loadingMore=false;paint();return}
    Native.send('official.load',{requestId:state.loadRequest,...(more&&state.before?{before:state.before}:{})});paint();
  }
  function render(){
    return `<section class="zc-thread zo-thread" aria-label="BinzoLive conversation"><header class="zc-thread-header">${backButton('ZimiOfficialChat.back()',{label:'Back to '+state.from,slot:'zc-thread-back'})}<div class="zc-thread-person"><span class="zc-avatar-wrap">${avatar()}</span><span class="zc-thread-title"><h1>BinzoLive ${verified()}</h1><small>Official account</small></span></div><button type="button" class="zo-preferences" onclick="ZimiOfficialChat.preferences()" aria-label="Notifications and alerts">${hi('set',21)}</button></header><div class="zc-thread-scroll" id="zo-messages" role="log" aria-label="Messages with BinzoLive" aria-live="polite"></div><div class="zo-read-error" id="zo-read-error" role="status" hidden></div><form class="zc-composer zo-composer" onsubmit="event.preventDefault();ZimiOfficialChat.send()"><div class="zc-composer-field"><textarea id="zo-input" rows="1" maxlength="4000" placeholder="Message BinzoLive" aria-label="Message BinzoLive" autocomplete="off" oninput="ZimiOfficialChat.input(this)" onkeydown="if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();ZimiOfficialChat.send()}">${esc(state.draft)}</textarea><button type="submit" class="zc-composer-send" aria-label="Send message">${ci('send',22)}</button></div></form></section>`;
  }
  function bubble(message){
    const mine=message.senderType==='user',pending=message.delivery==='sending',failed=message.delivery==='failed';
    return `<div class="zc-msg ${mine?'mine':'theirs'} zo-message" data-official-message="${esc(message.id||message.clientMessageId)}">${mine?'':`<span class="zc-msg-avatar" aria-hidden="true">${avatar()}</span>`}<div class="zc-msg-stack"><div class="bub">${message.title?`<strong>${esc(message.title)}</strong>`:''}<span>${esc(message.body||'')}</span></div><span class="zc-meta">${failed?'<b>Not sent</b>':pending?'<span>Sending…</span>':`<time datetime="${esc(message.createdAt)}">${esc(zcClock({at:message.createdAt}))}</time>`}${mine&&!pending&&!failed?`<span class="zc-tick" role="img" aria-label="Sent">${ci('check',16)}</span>`:''}</span>${failed?`<div class="zo-send-error"><span role="status">${esc(message.error||'Message could not be sent.')}</span><button type="button" data-official-retry="${esc(message.clientMessageId)}" onclick="ZimiOfficialChat.retry(this.dataset.officialRetry)">Retry</button></div>`:''}</div></div>`;
  }
  function timeline(){
    if(state.loading&&!state.loaded)return contentSkeleton('thread','Loading messages');
    const messages=[...state.messages,...state.pending.values()].sort(order);
    const error=state.error?`<div class="zh-error" role="alert">${esc(state.error)}<button type="button" onclick="ZimiOfficialChat.load()">Try again</button></div>`:'';
    const older=state.hasMore?`<button type="button" class="zo-earlier" onclick="ZimiOfficialChat.load(true)" ${state.loadingMore?'disabled':''}>${state.loadingMore?'Loading earlier messages…':'Earlier messages'}</button>`:'';
    if(!messages.length)return error+`<div class="zc-thread-empty"><h2>BinzoLive</h2><p>App updates and your private conversation with our team appear here.</p></div>`;
    let day='';return older+error+messages.map(message=>{const next=zcDay(message.createdAt),divider=next&&next!==day?`<div class="zc-thread-day"><span>${esc(next)}</span></div>`:'';day=next;return divider+bubble(message)}).join('');
  }
  function input(field){state.draft=field.value;field.style.height='auto';field.style.height=Math.min(field.scrollHeight,128)+'px';controls()}
  function controls(){const field=document.getElementById('zo-input'),send=document.querySelector('.zo-composer button');if(send)send.disabled=!field?.value.trim()||!state.loaded||!!state.error}
  function capture(){if(!active())return null;const field=document.getElementById('zo-input'),list=document.getElementById('zo-messages');return {focus:document.activeElement===field,start:field?.selectionStart,end:field?.selectionEnd,top:list?.scrollTop||0,near:!list||list.scrollHeight-list.scrollTop-list.clientHeight<80}}
  function paint(saved){
    if(!active()){if(S.v==='chats')r();else if(['home','profile','settings'].includes(S.v))nav();return}
    const list=document.getElementById('zo-messages');if(!list)return;
    const near=saved?.near??list.scrollHeight-list.scrollTop-list.clientHeight<80,top=saved?.top??list.scrollTop,height=list.scrollHeight,older=state.loadingMore;
    list.innerHTML=timeline();
    if(state.scrollBottom||near)list.scrollTop=list.scrollHeight;else list.scrollTop=top+(state.appendedOlder?list.scrollHeight-height:0);
    if(!older)state.appendedOlder=false;state.scrollBottom=false;
    const readError=document.getElementById('zo-read-error');if(readError){readError.hidden=!state.readError;readError.innerHTML=state.readError?`${esc(state.readError)} <button type="button" onclick="ZimiOfficialChat.retryRead()">Retry</button>`:''}
    controls();markRead();
  }
  function after(saved){if(!active())return;paint(saved);const list=document.getElementById('zo-messages');if(list&&!list.zoReadWatched){list.zoReadWatched=true;list.addEventListener('scroll',markRead,{passive:true})}const field=document.getElementById('zo-input');if(saved?.focus&&field){field.focus({preventScroll:true});field.setSelectionRange(saved.start,saved.end)}if(field){field.style.height='auto';field.style.height=Math.min(field.scrollHeight,128)+'px'}}
  function submit(pending){pending.delivery='sending';pending.error='';pending.requestId=++state.sequence;if(DEMO){pending.delivery='failed';pending.error='Messages are available in the connected app.';paint();return}Native.send('official.send',{body:pending.body,clientMessageId:pending.clientMessageId,requestId:pending.requestId});paint()}
  function send(){const field=document.getElementById('zo-input'),body=(field?.value||state.draft).trim();if(!body||body.length>4000||!state.loaded||state.error)return;const clientMessageId=key(),pending={id:'local:'+clientMessageId,clientMessageId,body,senderType:'user',kind:'support',createdAt:new Date().toISOString()};state.pending.set(clientMessageId,pending);state.draft='';if(field){field.value='';field.style.height='auto'}state.scrollBottom=true;submit(pending)}
  function retry(id){const pending=state.pending.get(id);if(pending?.delivery==='failed')submit(pending)}
  function markRead(){
    if(DEMO||!visible()||!state.loaded||state.readPending||state.readError)return;
    const list=document.getElementById('zo-messages'),bounds=list?.getBoundingClientRect();
    if(!bounds)return;
    const ids=state.messages.filter(message=>{if(message.senderType!=='official'||message.read||!validId(message.id))return false;const node=[...list.querySelectorAll('[data-official-message]')].find(el=>el.dataset.officialMessage===message.id),box=node?.getBoundingClientRect();return box&&box.bottom>bounds.top&&box.top<bounds.bottom}).map(message=>message.id).slice(0,100);
    if(!ids.length)return;const requestId=++state.sequence;state.readPending={requestId,ids};Native.send('official.read',{ids,requestId});
  }
  function markAll(){if(DEMO){if(state.summary)state.summary.unread=0;paint();return}const requestId=++state.sequence;state.readPending={requestId,all:true};Native.send('official.read',{all:true,requestId})}
  function activity(){if(DEMO)return;Native.send('official.activity',{active:visible()});if(visible())markRead()}
  function reset(){state.sequence++;Object.assign(state,{account:'',messages:[],summary:null,loaded:false,loading:false,loadingMore:false,hasMore:false,before:null,error:'',readError:'',readPending:null,loadRequest:state.sequence,draft:'',scrollBottom:false});state.pending.clear();if(active()){const field=document.getElementById('zo-input');if(field){field.value='';field.style.height='auto'}paint()}}
  Native.on('data.chats',data=>{if(data.official)summary(data.official);if(S.v==='chats')zcPaintList();if(['home','chats','profile','settings'].includes(S.v))nav()});
  Native.on('data.official',data=>{
    if(!data.background&&data.requestId!=null&&data.requestId!==state.loadRequest)return;
    const rows=Array.isArray(data.messages)?data.messages.filter(message=>validId(message.id)):[],merged=new Map(state.messages.map(message=>[message.id,message])),overlap=rows.some(message=>merged.has(message.id));
    rows.forEach(message=>{merged.set(message.id,message);if(message.clientMessageId)state.pending.delete(message.clientMessageId)});
    state.messages=[...merged.values()].sort(order);
    if(data.append||!state.loaded||!overlap){state.hasMore=!!data.hasMore;state.before=data.before||null}
    state.appendedOlder=!!data.append;
    state.loaded=true;state.loading=state.loadingMore=false;state.error='';state.summary={...(state.summary||{}),id:ID,unread:Math.max(0,Number(data.unreadCount)||0)};
    if(state.messages.length)state.summary.lastMessage=state.messages.at(-1);paint();
  });
  Native.on('official.sent',data=>{const pending=state.pending.get(data.clientMessageId);if(!pending||data.requestId!==pending.requestId)return;if(data.message&&validId(data.message.id)){state.messages=state.messages.filter(message=>message.id!==data.message.id);state.messages.push(data.message);state.messages.sort(order);state.pending.delete(data.clientMessageId)}summary(data.official);state.scrollBottom=true;paint()});
  Native.on('official.saved',data=>{if(data.requestId!==state.readPending?.requestId)return;const ids=new Set(data.ids||state.readPending.ids||[]),all=state.readPending.all;state.messages.forEach(message=>{if(all||ids.has(message.id))message.read=true});state.readPending=null;state.readError='';summary(data.official);paint()});
  Native.on('official.error',data=>{if(data.action==='load'&&(data.background||data.requestId===state.loadRequest)){state.loading=state.loadingMore=false;state.error=data.message||'Messages could not be loaded.'}if(data.action==='send'){const pending=state.pending.get(data.clientMessageId);if(pending&&pending.requestId===data.requestId){pending.delivery='failed';pending.error=data.message||'Message could not be sent.'}}if(data.action==='read'&&state.readPending?.requestId===data.requestId){state.readPending=null;state.readError=data.message||'Read status could not be saved.'}paint()});
  Native.on('official.changed',()=>{if(visible())load()});
  Native.on('official.open',()=>znRouteTarget({targetType:'inbox'}));
  Native.on('app.background',()=>{state.foreground=false;activity()});
  Native.on('app.foreground',()=>{state.foreground=true;activity()});
  Native.on('session',data=>{const account=data.user?.id||'';if(account!==state.account){reset();state.account=account}});
  Native.on('session.none',reset);Native.on('session.expired',reset);
  document.addEventListener('aurora:navigate',()=>{activity();if(active()){state.scrollBottom=true;load()}});
  document.addEventListener('visibilitychange',activity);
  window.ZimiSupport.open=from=>open(from);window.ZimiSupport.openTicket=()=>open('chats');
  ZimiHome.views['official-chat']=render;
  ZimiPullRefresh.register('official-chat',{refresh:()=>load(),busy:()=>state.loading||state.loadingMore});
  return {open,openTicket:()=>open('chats'),row,unread,updateSummary:summary,load,send,retry,input,capture,after,markAll,back:()=>go(state.from),retryRead:()=>{state.readError='';markRead()},preferences:()=>znPreferences()};
})();
