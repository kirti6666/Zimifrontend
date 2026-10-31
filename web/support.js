/* Support conversations are separate from coin-based member/creator chats.
   Only server acknowledgments create persisted tickets or messages. */
const ZSupport={from:'settings',selected:'',status:'all',tickets:[],firstPageIds:new Set(),total:0,page:1,loaded:false,loading:false,loadingMore:false,error:'',unreadCount:0,listRequest:0,sequence:0,threads:new Map(),drafts:new Map(),outbox:new Map(),subject:'',category:'general',body:'',creating:false,createError:'',createAttempt:null,statusBusy:'',statusError:'',readThrough:new Map(),scrollBottom:false,preserveScroll:null,connected:true,foreground:true,account:''};
const ZSUPPORT_CATEGORIES=[['general','General question'],['account','My account'],['coins','Coins & recharge'],['payments','Payments'],['calls','Voice & video calls'],['gifts','Gifts'],['technical','App problem'],['payouts','Host earnings & payouts']];
const zsuViews=['support','support-new','support-chat'];
const zsuId=value=>typeof value==='string'&&/^[a-f\d]{24}$/i.test(value);
const zsuCategory=value=>ZSUPPORT_CATEGORIES.find(row=>row[0]===value)?.[1]||'General question';
const zsuStatus=value=>({open:'Open',in_progress:'In progress',resolved:'Resolved'})[value]||'Open';
function zsuUnreadBadge(){const count=Math.max(0,Number(ZSupport.unreadCount)||0);return count?`<span class="zsu-entry-badge" aria-label="${count} unread support conversation${count===1?'':'s'}">${count>99?'99+':count}</span>`:''}
function zsuKey(){return 'support-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2))}
function zsuOrder(a,b){return Number.isSafeInteger(a.sequence)&&Number.isSafeInteger(b.sequence)?a.sequence-b.sequence:(Date.parse(a.createdAt)||0)-(Date.parse(b.createdAt)||0)||String(a.id||a.clientMessageId).localeCompare(String(b.id||b.clientMessageId))}
function zsuThread(id=ZSupport.selected){if(!ZSupport.threads.has(id))ZSupport.threads.set(id,{ticket:null,messages:[],loaded:false,loading:false,loadingMore:false,error:'',hasMore:false,before:null,requestId:0});return ZSupport.threads.get(id)}
function zsuNewer(previous,ticket){return previous&&(Date.parse(previous.updatedAt)||0)>(Date.parse(ticket?.updatedAt)||0)?previous:ticket}
function zsuUpsert(ticket){if(!ticket?.id)return;const index=ZSupport.tickets.findIndex(row=>row.id===ticket.id),thread=ZSupport.threads.get(ticket.id);ticket=zsuNewer(thread?.ticket||ZSupport.tickets[index],ticket);if(index<0)ZSupport.tickets.unshift(ticket);else ZSupport.tickets[index]=ticket;ZSupport.tickets.sort((a,b)=>(Date.parse(b.lastMessageAt||b.updatedAt)||0)-(Date.parse(a.lastMessageAt||a.updatedAt)||0));if(thread)thread.ticket=ticket;return ticket}
function zsuOpen(from='settings'){ZSupport.from=['settings','chats'].includes(from)?from:'settings';go('support')}
function zsuNew(){ZSupport.createError='';go('support-new')}
function zsuOpenTicket(id){if(!zsuId(id))return;ZSupport.selected=id;ZSupport.statusError='';go('support-chat')}
function zsuLoad(more=false){
  if(more&&(ZSupport.loading||ZSupport.loadingMore))return;
  ZSupport.error='';ZSupport.loading=!more;ZSupport.loadingMore=more;ZSupport.listRequest=++ZSupport.sequence;
  const query={page:more?ZSupport.page+1:1,requestId:ZSupport.listRequest,...(ZSupport.status==='all'?{}:{status:ZSupport.status})};
  if(DEMO){Object.assign(ZSupport,{loaded:true,loading:false,loadingMore:false});zsuPaint();return}
  Native.send('support.load',query);zsuPaint();
}
function zsuLoadTicket(more=false){
  const id=ZSupport.selected;if(!zsuId(id))return;
  const thread=zsuThread(id);if(more&&(thread.loadingMore||!thread.hasMore))return;
  thread.error='';thread.loading=!more;thread.loadingMore=more;thread.requestId=++ZSupport.sequence;
  if(DEMO){thread.loading=false;thread.loaded=true;zsuPaint();return}
  Native.send('support.open',{ticketId:id,requestId:thread.requestId,...(more&&thread.before?{before:thread.before}:{})});zsuPaint();
}
function zsuFilter(value){if(!['all','open','in_progress','resolved'].includes(value)||value===ZSupport.status)return;ZSupport.status=value;ZSupport.loaded=false;ZSupport.tickets=[];zsuLoad()}
function zsuTime(value,long=false){const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';return date.toLocaleString('en-IN',long?{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}:{hour:'numeric',minute:'2-digit'})}
function zsuShortDate(value){const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';return date.toDateString()===new Date().toDateString()?zsuTime(value):date.toLocaleDateString('en-IN',{day:'numeric',month:'short'})}
function zsuHeader(){
  const chat=S.v==='support-chat',creating=S.v==='support-new',ticket=chat?zsuThread().ticket:null;
  return `<header class="zsu-header">${backButton(chat||creating?"go('support')":`go('${ZSupport.from}')`,{label:chat||creating?'Back to support':`Back to ${ZSupport.from==='chats'?'chats':'settings'}`})}<div><h1>${chat?esc(ticket?.subject||'Support conversation'):creating?'New conversation':'Help &amp; support'}</h1>${chat?`<p>BinzoLive support${ticket?' · '+esc(zsuCategory(ticket.category)):''}</p>`:''}</div>${!chat&&!creating?`<button type="button" class="zsu-header-new" onclick="zsuNew()" aria-label="Start a support conversation">${hi('plus',20)}</button>`:''}</header>`;
}
function zsuError(message,action){return `<div class="zsu-error" role="alert"><p>${esc(message)}</p>${action?`<button type="button" onclick="${action}">Try again</button>`:''}</div>`}
function zsuTicketRow(ticket){return `<button type="button" class="zsu-ticket ${ticket.unreadUser?'is-unread':''}" data-support-ticket="${esc(ticket.id)}" onclick="zsuOpenTicket(this.dataset.supportTicket)"><span class="zsu-ticket-icon">${hi('chat',22)}</span><span class="zsu-ticket-copy"><span class="zsu-ticket-heading"><b>${esc(ticket.subject)}</b><time datetime="${esc(ticket.lastMessageAt||ticket.createdAt)}">${esc(zsuShortDate(ticket.lastMessageAt||ticket.createdAt))}</time></span><span class="zsu-ticket-preview">${esc(ticket.lastMessage?.body||'Your conversation with support')}</span><span class="zsu-ticket-meta"><span class="zsu-status" data-status="${esc(ticket.status)}">${zsuStatus(ticket.status)}</span><span>${esc(zsuCategory(ticket.category))}</span></span></span>${ticket.unreadUser?`<span class="zsu-unread" aria-label="${Number(ticket.unreadUser)||1} unread replies">${Math.min(99,Number(ticket.unreadUser)||1)}</span>`:''}</button>`}
function zsuList(){
  const pending=ZSupport.loading&&!ZSupport.loaded;
  const rows=ZSupport.tickets.filter(ticket=>ZSupport.status==='all'||ticket.status===ZSupport.status);
  const content=pending?contentSkeleton('rows','Loading support conversations',4):!ZSupport.loaded&&ZSupport.error?zsuError(ZSupport.error,'zsuLoad()'):rows.length?rows.map(zsuTicketRow).join(''):`<div class="zsu-empty">${hi('chat',36)}<h2>${ZSupport.status==='all'?'Your support, in one place':'No '+zsuStatus(ZSupport.status).toLowerCase()+' conversations'}</h2><p>${ZSupport.status==='all'?'Ask about your account, calls, coins or anything in the app. Your conversations and replies stay here.':'Conversations with this status will appear here.'}</p>${ZSupport.status==='all'?'<button type="button" class="zsu-primary" onclick="zsuNew()">Start a conversation</button>':''}</div>`;
  return `<section class="zsu-page" aria-label="Support center"><div class="zsu-intro"><span class="zsu-intro-icon">${zi('help',26)}</span><div><h2>How can we help?</h2><p>Talk to the BinzoLive team.</p></div>${rows.length||ZSupport.status!=='all'?'<button type="button" class="zsu-primary zsu-start" onclick="zsuNew()">New conversation</button>':''}</div><div class="zsu-filters" role="group" aria-label="Filter support conversations">${[['all','All'],['open','Open'],['in_progress','In progress'],['resolved','Resolved']].map(([key,label])=>`<button type="button" aria-pressed="${ZSupport.status===key}" onclick="zsuFilter('${key}')">${label}</button>`).join('')}</div><div class="zsu-list" aria-label="Your conversations">${ZSupport.loaded&&ZSupport.error?zsuError(ZSupport.error,'zsuLoad()'):''}${content}</div>${ZSupport.loadingMore?contentSkeleton('rows','Loading more conversations',2):ZSupport.total>ZSupport.tickets.length?'<button type="button" class="zsu-secondary zsu-load" onclick="zsuLoad(true)">Load more conversations</button>':''}${DEMO?'<p class="zsu-note">Design preview. Contact support from the app.</p>':''}</section>`;
}
function zsuFormValue(key,value){ZSupport[key]=value;ZSupport.createError='';const error=document.getElementById('zsu-create-error');if(error)error.textContent='';const count=document.getElementById('zsu-body-count');if(count)count.textContent=ZSupport.body.length+'/4000';const button=document.getElementById('zsu-create');if(button)button.disabled=ZSupport.creating||!ZSupport.subject.trim()||!ZSupport.body.trim()}
function zsuNewView(){const busy=ZSupport.creating;return `<section class="zsu-page zsu-new" aria-labelledby="zsu-new-title"><div class="zsu-form-intro"><h2 id="zsu-new-title">Tell us what happened</h2><p>Include the details that help us understand your question. The team will reply in this conversation.</p></div><form class="zsu-form" onsubmit="event.preventDefault();zsuCreate()"><label for="zsu-category">What do you need help with?</label><select id="zsu-category" ${busy?'disabled':''} onchange="zsuFormValue('category',this.value)">${ZSUPPORT_CATEGORIES.map(([key,label])=>`<option value="${key}" ${ZSupport.category===key?'selected':''}>${label}</option>`).join('')}</select><label for="zsu-subject">Subject</label><input id="zsu-subject" maxlength="120" autocomplete="off" placeholder="A short description" value="${esc(ZSupport.subject)}" ${busy?'disabled':''} oninput="zsuFormValue('subject',this.value)" required><label for="zsu-body">Your message</label><textarea id="zsu-body" maxlength="4000" rows="6" placeholder="How can we help?" aria-describedby="zsu-private-note zsu-create-error" ${busy?'disabled':''} oninput="zsuFormValue('body',this.value)" required>${esc(ZSupport.body)}</textarea><span id="zsu-body-count" class="zsu-character-count">${ZSupport.body.length}/4000</span><p id="zsu-private-note" class="zsu-note">Never share your password, one-time sign-in code or full payment details.</p><p id="zsu-create-error" class="zsu-form-error" role="alert">${esc(ZSupport.createError)}</p><button id="zsu-create" type="submit" class="zsu-primary" ${busy||!ZSupport.subject.trim()||!ZSupport.body.trim()?'disabled':''} ${busy?'aria-busy="true"':''}>${busy?'Starting conversation…':'Start conversation'}</button></form></section>`}
function zsuCreate(){
  if(ZSupport.creating)return;
  const subject=ZSupport.subject.trim(),body=ZSupport.body.trim(),category=ZSupport.category;
  if(!subject||!body){ZSupport.createError='Add a subject and a message to start.';zsuPaint();return}
  if(DEMO){appNotice('Open the app to send a message to support.');return}
  const previous=ZSupport.createAttempt,same=previous&&previous.subject===subject&&previous.body===body&&previous.category===category;
  const attempt={subject,body,category,clientMessageId:same?previous.clientMessageId:zsuKey(),requestId:++ZSupport.sequence};
  ZSupport.createAttempt=attempt;ZSupport.creating=true;ZSupport.createError='';Native.send('support.create',attempt);zsuPaint();
}
function zsuMessages(thread){
  const pending=[...ZSupport.outbox.values()].filter(row=>row.ticketId===ZSupport.selected&&!thread.messages.some(message=>message.clientMessageId===row.clientMessageId));
  const messages=[...thread.messages].sort(zsuOrder).concat(pending.sort((a,b)=>(Date.parse(a.createdAt)||0)-(Date.parse(b.createdAt)||0)));
  let day='';return messages.map(message=>{const date=new Date(message.createdAt),next=Number.isFinite(date.getTime())?date.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'',divider=next!==day?`<p class="zsu-day">${esc(next)}</p>`:'';day=next;const own=message.senderType==='user',failed=message.delivery==='failed';return `${divider}<article class="zsu-message ${own?'is-own':'is-staff'} ${failed?'is-failed':''}" data-support-message="${esc(message.id||message.clientMessageId)}"><div class="zsu-bubble"><span class="zsu-sender">${own?'You':esc(message.senderName||'Support team')}</span><p>${esc(message.body)}</p><div class="zsu-message-meta"><time datetime="${esc(message.createdAt)}">${esc(zsuTime(message.createdAt))}</time>${message.delivery==='sending'?'<span role="status">Sending…</span>':failed?'<span>Not sent</span>':''}</div></div>${failed?`<div class="zsu-message-error" role="alert"><span>${esc(message.error||'Message could not be sent.')}</span><button type="button" data-support-retry="${esc(message.clientMessageId)}" onclick="zsuRetry(this.dataset.supportRetry)">Retry</button></div>`:''}</article>`}).join('')||'<p class="zsu-note zsu-no-messages">Your messages with the support team will appear here.</p>';
}
function zsuChat(){
  const thread=zsuThread(),ticket=thread.ticket;
  if(!zsuId(ZSupport.selected))return `<section class="zsu-page">${zsuError('Choose a conversation from your support inbox.')}<button type="button" class="zsu-secondary" onclick="go('support')">Open support inbox</button></section>`;
  if(!thread.loaded)return `<section class="zsu-page">${thread.error?zsuError(thread.error,'zsuLoadTicket()'):contentSkeleton('rows','Loading support conversation',4)}</section>`;
  if(!ticket)return `<section class="zsu-page">${zsuError('This conversation is unavailable.','zsuLoadTicket()')}</section>`;
  const draft=ZSupport.drafts.get(ticket.id)||'',sending=[...ZSupport.outbox.values()].some(message=>message.ticketId===ticket.id&&message.delivery==='sending'),busy=ZSupport.statusBusy===ticket.id;
  return `<section class="zsu-chat" aria-label="Support conversation"><div class="zsu-chat-status"><span class="zsu-status" data-status="${esc(ticket.status)}">${zsuStatus(ticket.status)}</span><span>${ticket.assignee?'With '+esc(ticket.assignee.name):'BinzoLive support'}</span><button type="button" onclick="zsuSetStatus('${ticket.status==='resolved'?'open':'resolved'}')" ${busy?'disabled aria-busy="true"':''}>${busy?'Saving…':ticket.status==='resolved'?'Reopen':'Mark resolved'}</button></div>${thread.error?zsuError(thread.error,'zsuLoadTicket()'):''}${ZSupport.statusError?zsuError(ZSupport.statusError):''}<div id="zsu-messages" class="zsu-messages" tabindex="0" aria-label="Conversation messages" onscroll="zsuScrolled()">${thread.loadingMore?'<div class="zsu-loading-older" role="status">Loading earlier messages…</div>':thread.hasMore?'<button type="button" class="zsu-earlier" onclick="zsuEarlier()">Earlier messages</button>':''}${zsuMessages(thread)}<span id="zsu-message-end"></span></div><button id="zsu-new-replies" type="button" class="zsu-new-replies" onclick="zsuLatest()" hidden>New messages · View latest</button><form class="zsu-composer" onsubmit="event.preventDefault();zsuSend()"><label class="zsu-sr-only" for="zsu-reply">Message support</label><textarea id="zsu-reply" rows="1" maxlength="4000" placeholder="Message support…" oninput="zsuDraft(this)" onkeydown="zsuReplyKey(event)">${esc(draft)}</textarea><button id="zsu-send" type="submit" class="zsu-send" aria-label="Send message to support" ${sending||!draft.trim()?'disabled':''}>${sending?'<span aria-hidden="true">…</span>':hi('send',21)}</button><p class="zsu-composer-note">${ticket.status==='resolved'?'Sending a message will reopen this conversation.':'Replies from the team appear here.'}</p></form></section>`;
}
function zsuDraft(input){ZSupport.drafts.set(ZSupport.selected,input.value);input.style.height='auto';input.style.height=Math.min(input.scrollHeight,128)+'px';const busy=[...ZSupport.outbox.values()].some(row=>row.ticketId===ZSupport.selected&&row.delivery==='sending');const button=document.getElementById('zsu-send');if(button)button.disabled=busy||!input.value.trim()}
function zsuReplyKey(event){if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&matchMedia('(pointer:fine)').matches){event.preventDefault();zsuSend()}}
function zsuSend(){
  const ticketId=ZSupport.selected,body=(ZSupport.drafts.get(ticketId)||'').trim();
  if(!body||[...ZSupport.outbox.values()].some(message=>message.ticketId===ticketId&&message.delivery==='sending'))return;
  if(DEMO){appNotice('Open the app to send a message to support.');return}
  const message={ticketId,body,clientMessageId:zsuKey(),requestId:++ZSupport.sequence,createdAt:new Date().toISOString(),senderType:'user',delivery:'sending'};
  ZSupport.outbox.set(message.clientMessageId,message);ZSupport.drafts.set(ticketId,'');ZSupport.scrollBottom=true;Native.send('support.send',{ticketId,body,clientMessageId:message.clientMessageId,requestId:message.requestId});zsuPaint();document.getElementById('zsu-reply')?.focus({preventScroll:true});
}
function zsuRetry(id){const message=ZSupport.outbox.get(id);if(!message||message.delivery!=='failed')return;message.delivery='sending';message.error='';message.requestId=++ZSupport.sequence;Native.send('support.send',{ticketId:message.ticketId,body:message.body,clientMessageId:message.clientMessageId,requestId:message.requestId});ZSupport.scrollBottom=true;zsuPaint()}
function zsuSetStatus(status){const ticketId=ZSupport.selected;if(ZSupport.statusBusy||!['open','resolved'].includes(status))return;if(DEMO)return;ZSupport.statusBusy=ticketId;ZSupport.statusError='';ZSupport.statusRequest=++ZSupport.sequence;Native.send('support.status',{ticketId,status,requestId:ZSupport.statusRequest});zsuPaint()}
function zsuEarlier(){const element=document.getElementById('zsu-messages');ZSupport.preserveScroll=element?{top:element.scrollTop,height:element.scrollHeight}:null;zsuLoadTicket(true)}
function zsuLatest(){ZSupport.scrollBottom=true;zsuThread().unseen=false;const element=document.getElementById('zsu-messages');if(element)element.scrollTop=element.scrollHeight;document.getElementById('zsu-new-replies')?.setAttribute('hidden','');zsuMarkRead()}
function zsuScrolled(){const el=document.getElementById('zsu-messages');if(el&&el.scrollHeight-el.scrollTop-el.clientHeight<90){zsuThread().unseen=false;document.getElementById('zsu-new-replies')?.setAttribute('hidden','');zsuMarkRead()}}
function zsuMarkRead(){
  if(DEMO||!ZSupport.foreground||S.v!=='support-chat'||document.visibilityState==='hidden')return;
  const thread=zsuThread(),el=document.getElementById('zsu-messages');if(!thread.ticket?.unreadUser||!el||el.scrollHeight-el.scrollTop-el.clientHeight>90)return;
  const last=thread.messages.filter(message=>message.senderType==='staff').at(-1);if(!last?.id||ZSupport.readThrough.get(ZSupport.selected)===last.id)return;
  ZSupport.readThrough.set(ZSupport.selected,last.id);Native.send('support.read',{ticketId:ZSupport.selected,throughMessageId:last.id,requestId:++ZSupport.sequence});
}
function zsuCapture(){
  if(!zsuViews.includes(S.v))return null;
  const el=document.activeElement,fields=['zsu-subject','zsu-body','zsu-category','zsu-reply'],scroller=document.getElementById('zsu-messages');
  return {view:S.v,focus:fields.includes(el?.id)?{id:el.id,start:el.selectionStart,end:el.selectionEnd}:null,scroll:scroller?{top:scroller.scrollTop,height:scroller.scrollHeight,near:scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<90}:null};
}
function zsuAfter(saved){
  document.documentElement.classList.toggle('zsu-chat-active',S.v==='support-chat');
  if(!zsuViews.includes(S.v))return;
  const field=saved?.view===S.v&&saved.focus?document.getElementById(saved.focus.id):null;if(field){field.focus({preventScroll:true});if(typeof field.setSelectionRange==='function'&&field.tagName!=='SELECT')field.setSelectionRange(saved.focus.start,saved.focus.end)}
  const reply=document.getElementById('zsu-reply');if(reply){reply.style.height='auto';reply.style.height=Math.min(reply.scrollHeight,128)+'px'}
  const scroller=document.getElementById('zsu-messages');if(scroller){
    const older=ZSupport.preserveScroll;
    if(older&&!zsuThread().loadingMore){scroller.scrollTop=older.top+scroller.scrollHeight-older.height;ZSupport.preserveScroll=null}
    else if(ZSupport.scrollBottom||!saved?.scroll||saved.scroll.near){scroller.scrollTop=scroller.scrollHeight;zsuThread().unseen=false}
    else{scroller.scrollTop=saved.scroll.top;if(!zsuThread().loadingMore&&scroller.scrollHeight>saved.scroll.height)zsuThread().unseen=true}
    document.getElementById('zsu-new-replies')?.toggleAttribute('hidden',!zsuThread().unseen);
    ZSupport.scrollBottom=false;zsuMarkRead();
  }
}
function zsuPaint(){if(zsuViews.includes(S.v))r()}
Native.on('data.supportTickets',data=>{
  if(data.requestId!=null&&data.requestId!==ZSupport.listRequest)return;
  const rows=Array.isArray(data.tickets)?data.tickets:[],page=Number(data.page)||1;
  const retainPages=data.background&&ZSupport.loaded&&ZSupport.page>1;
  const merged=new Map((page>1?ZSupport.tickets:retainPages?ZSupport.tickets.filter(ticket=>!ZSupport.firstPageIds.has(ticket.id)):[]).map(ticket=>[ticket.id,ticket]));rows.forEach(ticket=>{if(ticket?.id)merged.set(ticket.id,zsuNewer(ZSupport.threads.get(ticket.id)?.ticket||ZSupport.tickets.find(row=>row.id===ticket.id),ticket))});
  if(page===1)ZSupport.firstPageIds=new Set(rows.map(ticket=>ticket.id));
  Object.assign(ZSupport,{tickets:[...merged.values()],page:retainPages?ZSupport.page:page,total:Number(data.total)||0,unreadCount:Math.max(0,Number(data.unreadCount)||0),loaded:true,loading:false,loadingMore:false,error:''});if(S.v==='support')zsuPaint();
});
Native.on('data.supportTicket',data=>{
  const ticket=data.ticket;if(!ticket?.id)return;const thread=zsuThread(ticket.id);
  if(data.requestId!=null&&data.requestId!==thread.requestId)return;
  const oldCount=thread.messages.length,oldCursor=thread.before,oldHasMore=thread.hasMore,rows=Array.isArray(data.messages)?data.messages:[],merged=new Map(thread.messages.map(message=>[message.id,message]));rows.forEach(message=>{if(message?.id)merged.set(message.id,message)});
  thread.messages=[...merged.values()].sort(zsuOrder);
  const keepOlder=!data.append&&oldCount>rows.length;
  Object.assign(thread,{ticket:zsuNewer(thread.ticket,ticket),loaded:true,loading:false,loadingMore:false,error:'',hasMore:keepOlder?oldHasMore:!!data.hasMore,before:keepOlder?oldCursor:data.before||thread.messages[0]?.id||null});zsuUpsert(ticket);
  for(const row of rows)if(row.clientMessageId)ZSupport.outbox.delete(row.clientMessageId);
  if(ticket.id===ZSupport.selected)zsuPaint();
});
Native.on('support.created',data=>{
  if(data.requestId!==ZSupport.createAttempt?.requestId||!data.ticket?.id)return;
  Object.assign(ZSupport,{creating:false,createError:'',createAttempt:null,subject:'',body:'',category:'general'});zsuUpsert(data.ticket);const thread=zsuThread(data.ticket.id);Object.assign(thread,{ticket:data.ticket,messages:data.message?[data.message]:[],loaded:true,error:'',hasMore:false});
  if(S.v==='support-new'){ZSupport.scrollBottom=true;zsuOpenTicket(data.ticket.id)}else zsuPaint();
});
Native.on('support.sent',data=>{
  const id=data.clientMessageId||data.message?.clientMessageId,pending=ZSupport.outbox.get(id);if(pending&&data.requestId!=null&&pending.requestId!==data.requestId)return;
  if(data.ticket)zsuUpsert(data.ticket);if(data.message){const thread=zsuThread(data.message.ticketId);if(!thread.messages.some(message=>message.id===data.message.id))thread.messages.push(data.message);thread.messages.sort(zsuOrder);thread.loaded=true}
  if(id)ZSupport.outbox.delete(id);zsuPaint();
});
Native.on('support.read',data=>{if(data.ticket)zsuUpsert(data.ticket);if(zsuViews.includes(S.v))zsuPaint()});
Native.on('support.unread',data=>{ZSupport.unreadCount=Math.max(0,Math.floor(Number(data.unreadCount)||0));if(S.v==='chats')r()});
Native.on('support.status',data=>{if(data.requestId!=null&&data.requestId!==ZSupport.statusRequest)return;ZSupport.statusBusy='';ZSupport.statusError='';if(data.ticket)zsuUpsert(data.ticket);zsuPaint()});
Native.on('operation.error',data=>{
  if(!String(data.action||'').startsWith('support.'))return;const message=data.message||'Unable to contact support. Please try again.';
  if(data.action==='support.load'&&(data.requestId==null||data.requestId===ZSupport.listRequest)){ZSupport.loading=false;ZSupport.loadingMore=false;ZSupport.error=message}
  if(data.action==='support.open'){const thread=ZSupport.threads.get(data.ticketId||ZSupport.selected);if(thread&&(data.requestId==null||data.requestId===thread.requestId)){thread.loading=false;thread.loadingMore=false;thread.error=message;ZSupport.preserveScroll=null}}
  if(data.action==='support.create'&&data.requestId===ZSupport.createAttempt?.requestId){ZSupport.creating=false;ZSupport.createError=message}
  if(data.action==='support.send'){const pending=ZSupport.outbox.get(data.clientMessageId);if(pending&&(data.requestId==null||data.requestId===pending.requestId)){pending.delivery='failed';pending.error=message}}
  if(data.action==='support.status'&&(data.requestId==null||data.requestId===ZSupport.statusRequest)){ZSupport.statusBusy='';ZSupport.statusError=message}
  if(data.action==='support.read'){ZSupport.readThrough.delete(data.ticketId||ZSupport.selected);return}
  zsuPaint();
});
function zsuActivity(){const active=zsuViews.includes(S.v)&&ZSupport.foreground&&document.visibilityState!=='hidden';Native.send('support.activity',{active,ticketId:active&&S.v==='support-chat'?ZSupport.selected:undefined});if(S.v==='support')zsuLoad();if(S.v==='support-chat'){ZSupport.scrollBottom=true;zsuLoadTicket()}}
document.addEventListener('aurora:navigate',zsuActivity);
document.addEventListener('visibilitychange',()=>{if(zsuViews.includes(S.v)){Native.send('support.activity',{active:document.visibilityState!=='hidden',ticketId:S.v==='support-chat'?ZSupport.selected:undefined});if(document.visibilityState!=='hidden')zsuMarkRead()}});
Native.on('app.background',()=>{ZSupport.foreground=false});
Native.on('app.foreground',()=>{ZSupport.foreground=true;zsuMarkRead()});
function zsuReset(){ZSupport.sequence++;Object.assign(ZSupport,{from:'settings',selected:'',status:'all',tickets:[],firstPageIds:new Set(),total:0,page:1,loaded:false,loading:false,loadingMore:false,error:'',unreadCount:0,listRequest:ZSupport.sequence,subject:'',category:'general',body:'',creating:false,createError:'',createAttempt:null,statusBusy:'',statusError:'',preserveScroll:null,scrollBottom:false});ZSupport.threads.clear();ZSupport.drafts.clear();ZSupport.outbox.clear();ZSupport.readThrough.clear()}
Native.on('session',data=>{const id=data.user?.id||'';if(id!==ZSupport.account){zsuReset();ZSupport.account=id}});
Native.on('session.none',()=>{zsuReset();ZSupport.account=''});Native.on('session.expired',()=>{zsuReset();ZSupport.account=''});
ZimiPullRefresh.register('support',{refresh:()=>zsuLoad(),busy:()=>ZSupport.loading||ZSupport.loadingMore});
window.ZimiSupport={open:zsuOpen,openTicket:zsuOpenTicket,header:zsuHeader,capture:zsuCapture,after:zsuAfter,reset:zsuReset,unreadBadge:zsuUnreadBadge};
Object.assign(ZimiHome.views,{support:zsuList,'support-new':zsuNewView,'support-chat':zsuChat});
