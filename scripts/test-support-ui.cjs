/* Generated Team Chat/support UI with local bridge fixtures; no live accounts or messages. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),self='507f1f77bcf86cd799439001',officialId='bingo-live-official';
const member={user:{id:self,name:'Team Chat fixture',role:'sender',serverRole:'user',hostStatus:'none',isPhoneVerified:true},verification:'none',requiresOnboarding:false};
const receive=(page,type,data={})=>page.evaluate(message=>Native.receive(message),{type,data});
const sent=(page,type)=>page.evaluate(type=>__sent.filter(message=>message.type===type).map(message=>message.data),type);
const last=async(page,type)=>(await sent(page,type)).at(-1);
const button=(page,name)=>page.getByRole('button',{name,exact:true});
const holdAnimationFrame=page=>page.evaluate(()=>{window.__heldOfficialFrame={original:requestAnimationFrame,callbacks:[]};window.requestAnimationFrame=callback=>{__heldOfficialFrame.callbacks.push(callback);return __heldOfficialFrame.callbacks.length}});
const releaseAnimationFrame=page=>page.evaluate(()=>{const held=window.__heldOfficialFrame;if(!held)return 0;window.requestAnimationFrame=held.original;delete window.__heldOfficialFrame;const at=performance.now();held.callbacks.forEach(callback=>callback(at));return held.callbacks.length});
const announcement=(index,body,extra={})=>({id:'announcement:'+index.toString(16).padStart(24,'0'),kind:'announcement',senderType:'official',body,createdAt:new Date(Date.now()-60000+index*10).toISOString(),read:false,...extra});
const summary=(unread=0,lastMessage=null,canSend=false)=>({id:officialId,name:'BinzoLive',official:true,verified:true,canSend,unread,lastMessage});
const thread=(messages,extra={})=>({id:officialId,name:'BinzoLive',official:true,verified:true,canSend:false,messages,total:messages.length,hasMore:false,before:null,unreadCount:messages.filter(row=>!row.read).length,...extra});
async function audit(page,label){
 const value=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,bad:[...document.querySelectorAll('.zo-thread header button')].filter(el=>el.getClientRects().length).filter(el=>{const b=el.getBoundingClientRect();return b.left<-1||b.right>innerWidth+1||b.bottom>innerHeight+1}).map(el=>el.className),navVisible:document.getElementById('nav').getClientRects().length>0}));
 assert.equal(value.overflow,false,label+': no overflow');assert.deepEqual(value.bad,[],label+': controls fit');assert.equal(value.navVisible,false,label+': no bottom tabs');
}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});const errors=[];
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});page.setDefaultTimeout(7000);page.on('pageerror',error=>errors.push(error.message));
  const shots=path.join(root,'artifacts','official-chat');fs.mkdirSync(shots,{recursive:true});
  await page.route(/^https?:\/\//,route=>route.abort());await page.addInitScript(()=>{window.__sent=[];window.ReactNativeWebView={postMessage:raw=>__sent.push(JSON.parse(raw))}});
  await page.goto(pathToFileURL(path.join(root,'assets/aurora.html')).href);
  await receive(page,'session',member);await receive(page,'data.home',{hosts:[],total:0,page:1,categories:[]});await receive(page,'wallet.balance',{coins:0});await page.evaluate(()=>go('chats'));

  assert.equal(await page.locator('[data-official-chat]').count(),1,'Team Chat is present before ordinary chats load');
  await receive(page,'data.chats',{chats:[],total:0,page:1,unreadCount:0,unreadConversations:0,official:summary()});
  assert.equal(await page.locator('#zc-list button.zc-row').count(),1,'empty accounts retain Team Chat');
  assert.match(await page.locator('[data-official-chat]').innerText(),/Binzo Team Chat/);assert.equal(await page.getByLabel('Verified official account',{exact:true}).count(),1);
  assert.equal(await page.locator('.zc-support-entry').count(),0,'support is not inserted into the Chat list');
  await page.screenshot({path:path.join(shots,'inbox-light.png')});

  await page.getByRole('tab',{name:'Unread',exact:true}).click();assert.equal(await page.locator('[data-official-chat]').count(),0);
  const latest=announcement(102,'A sender-specific official announcement.');
  await receive(page,'data.chats',{chats:[],total:0,page:1,unreadCount:0,unreadConversations:0,official:summary(2,latest,true)});
  assert.equal(await page.locator('[data-official-chat]').count(),1);assert.equal(await page.evaluate(()=>ZimiChats.unread()),1,'Team Chat unread counts as one conversation');await page.getByRole('tab',{name:'All',exact:true}).click();
  const ordinary={user:{id:'507f1f77bcf86cd799439088',name:'Asha',role:'host',verified:true},last:'A recent conversation',lastAt:new Date().toISOString(),unread:0};
  await receive(page,'data.chats',{chats:[ordinary],total:1,page:1,unreadCount:0,unreadConversations:0,official:summary(2,latest)});assert.equal(await page.locator('#zc-list button.zc-row').first().getAttribute('data-official-chat'),'','Team Chat stays pinned first');
  await page.getByLabel('Search conversations').fill('team chat');assert.equal(await page.locator('[data-official-chat]').count(),1);await page.getByLabel('Search conversations').fill('unmatched');assert.equal(await page.locator('[data-official-chat]').count(),0);await page.getByLabel('Search conversations').fill('');

  const loadsBefore=(await sent(page,'official.load')).length;await holdAnimationFrame(page);await page.locator('[data-official-chat]').click();assert.equal(await page.evaluate(()=>S.v),'official-chat');assert.equal((await last(page,'official.activity')).active,true);
  await page.getByRole('status',{name:'Loading messages'}).waitFor();assert.equal(await page.locator('#zo-messages .zh-skeleton-thread').count(),1);assert.equal((await sent(page,'official.load')).length,loadsBefore,'skeleton paints before the history request');assert.ok(await releaseAnimationFrame(page)>0);await page.waitForFunction(before=>__sent.filter(message=>message.type==='official.load').length>before,loadsBefore);
  assert.match(await page.locator('.zc-thread-title').innerText(),/Binzo Team Chat[\s\S]*Official announcements/);

  const start=new Date();start.setDate(start.getDate()-1);start.setHours(9,0,0,0);const at=minutes=>new Date(start.getTime()+minutes*60000).toISOString();
  const first=announcement(100,'Only official owner updates belong here.',{title:'Community rules',createdAt:at(0)}),second=announcement(101,'A regulation changed today.',{createdAt:at(2)});
  const leakedSupport={id:'support:'+'f'.repeat(24),kind:'support',senderType:'official',body:'Private support must not render here.',createdAt:at(1),read:false};let request=await last(page,'official.load');
  await receive(page,'data.official',thread([first,leakedSupport,second],{requestId:request.requestId,hasMore:true,before:first.id}));
  assert.equal(await page.locator('.zo-message').count(),2,'only announcements render');assert.equal(await page.locator('.zo-composer,#zo-input').count(),0,'Team Chat has no composer');assert.equal((await sent(page,'official.send')).length,0,'Team Chat exposes no send path');
  assert.deepEqual(await page.locator('.zo-message').evaluateAll(nodes=>nodes.map(node=>node.classList.contains('theirs'))),[true,true],'all Team Chat messages are incoming official posts');
  assert.equal(await page.getByText('Private support must not render here.').count(),0);assert.equal(await page.locator('.zo-message img[src="x"]').count(),0);
  request=await last(page,'official.read');assert.deepEqual(new Set(request.ids),new Set([first.id,second.id]));await receive(page,'official.saved',{ids:request.ids,read:true,official:summary(),requestId:request.requestId});first.read=second.read=true;
  await receive(page,'data.official',thread([],{background:true}));assert.equal(await page.locator('.zo-message').count(),0,'a fresh empty audience snapshot replaces the visible rows');assert.doesNotMatch(await page.evaluate(()=>ZimiOfficialChat.row()),/A regulation changed today\./,'an empty snapshot also clears the old Team Chat preview');
  await receive(page,'data.official',thread([first,second],{background:true,hasMore:true,before:first.id}));assert.equal(await page.locator('.zo-message').count(),2);

  await button(page,'Earlier messages').click();request=await last(page,'official.load');assert.equal(request.before,first.id);const older=announcement(99,'An older official policy.',{createdAt:new Date(start.getTime()-86400000).toISOString(),read:true});await receive(page,'data.official',thread([older],{append:true,requestId:request.requestId}));assert.equal(await page.locator('.zo-message').count(),3);
  await receive(page,'app.background');const readCount=(await sent(page,'official.read')).length;const fresh=announcement(103,'A new official announcement.');await receive(page,'data.official',thread([first,second,fresh],{background:true}));assert.equal((await sent(page,'official.read')).length,readCount);await receive(page,'app.foreground');request=await last(page,'official.read');assert.ok(request.ids.includes(fresh.id));await receive(page,'official.saved',{ids:request.ids,read:true,official:summary(),requestId:request.requestId});

  for(const[width,height,dark]of[[390,844,false],[320,500,true],[768,1024,true]]){await page.setViewportSize({width,height});await page.evaluate(dark=>{ZimiThemes.setDark(dark);r()},dark);await audit(page,width+' '+dark);assert.equal(await page.locator('.zo-composer').count(),0);await page.screenshot({path:path.join(shots,`thread-${width}-${dark?'dark':'light'}.png`)});}
  await button(page,'Notifications and alerts').click();assert.equal(await page.locator('#zp-dialog[open]').count(),1);await page.evaluate(()=>zpClose());await button(page,'Back to chats').click();

  await page.evaluate(()=>go('settings'));await button(page,'Help & support').click();assert.equal(await page.evaluate(()=>S.v),'support','Help & support remains a separate screen');assert.ok((await sent(page,'support.load')).length>0);assert.equal((await sent(page,'official.load')).length>loadsBefore,true);
  const ticketId='507f1f77bcf86cd799439010';await receive(page,'push.opened',{targetType:'support',targetId:ticketId,recipientId:self});assert.equal(await page.evaluate(()=>S.v),'support-chat','support notification opens the private support screen');assert.equal((await last(page,'support.open')).ticketId,ticketId);
  await page.evaluate(()=>go('chats'));await receive(page,'push.opened',{targetType:'inbox',recipientId:self});assert.equal(await page.evaluate(()=>S.v),'notifications','personal inbox notification remains in Notifications');
  await receive(page,'push.opened',{targetType:'official',recipientId:self});assert.equal(await page.evaluate(()=>S.v),'official-chat','official announcement notification opens Team Chat');

  await page.evaluate(()=>go('chats'));await receive(page,'data.chats',{chats:[],total:0,page:1,unreadCount:0,unreadConversations:0,official:summary(3)});const ordinaryReadCount=(await sent(page,'chats.readAll')).length;await button(page,'Mark all as read').click();request=await last(page,'official.read');assert.equal(request.all,true);assert.equal((await sent(page,'chats.readAll')).length,ordinaryReadCount,'Team-only mark-all avoids approval-gated person chat');await receive(page,'official.saved',{all:true,read:true,official:summary(),requestId:request.requestId});
  const roleLoads=(await sent(page,'official.load')).length;await receive(page,'session',{...member,user:{...member.user,role:'host',serverRole:'host',hostStatus:'pending'},hostAccess:{serverRole:'host',hostStatus:'pending',approved:false}});assert.equal(await page.locator('.zo-message').count(),0,'same-account sender-to-host change retires the prior audience');await page.evaluate(()=>ZimiOfficialChat.open('chats'));await page.waitForFunction(before=>__sent.filter(message=>message.type==='official.load').length>before,roleLoads);request=await last(page,'official.load');const hostRule=announcement(201,'This rule is for host accounts.');await receive(page,'data.official',thread([hostRule],{requestId:request.requestId}));await page.locator('.zo-message').waitFor();assert.match(await page.locator('.zo-message').innerText(),/host accounts/);assert.equal(await page.locator('.zo-composer').count(),0,'pending hosts also have read-only Team Chat');
  await receive(page,'session',member);assert.equal(await page.locator('.zo-message').count(),0,'same-account host-to-sender change cannot retain host-only announcements');
  await page.evaluate(()=>logout());await receive(page,'session.none');assert.equal(await page.locator('.zo-message').count(),0,'logout retires Team Chat content');

  assert.deepEqual(errors,[]);console.log('PASS Binzo Team Chat UI: pinned verified read-only announcements, server-shaped role content, reads/pagination/account isolation, separate support, responsive themes and deep links.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
