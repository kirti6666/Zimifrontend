/* Two foreground call surfaces consume committed server fixtures. No real users,
   calls, gifts or money are touched. Actual socket commit timing is also tested
   in backend/tests/gift-realtime.test.ts. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),id=n=>n.toString(16).padStart(24,'0');
const member={id:id(1),name:'Gift sync member',role:'sender',serverRole:'user',isPhoneVerified:true},host={id:id(2),name:'Gift sync host',role:'host',serverRole:'host',hostStatus:'approved',isVerifiedHost:true,isPhoneVerified:true};
const callId=id(50),otherCall=id(51),media='https://gift-sync.fixture.test/original.webp';
const bytes=Buffer.from('UklGRrQAAABXRUJQVlA4WAoAAAACAAAAPwAAfwAAQU5JTQYAAAAAAAAAAABBTk1GKAAAAAAAAAAAAD8AAH8AAPQBAAJWUDhMDwAAAC8/wB8ABxD9j/4HIqL/AQBBTk1GKAAAAAAAAAAAAD8AAH8AAPQBAABWUDhMDwAAAC8/wB8ABxDR//4HIqL/AQBBTk1GKAAAAAAAAAAAAD8AAH8AAPQBAABWUDhMDwAAAC8/wB8AB9D/iP4HIqL/AQA=','base64');
const gift={id:id(100),name:'Synchronized rose',emoji:'🌹',coins:25,mediaUrl:media,durationMs:550};
const receive=(page,type,data={})=>page.evaluate(message=>Native.receive(message),{type,data});
const stage=page=>page.locator('#zr-gift-playback');
async function playing(page,transfer){await page.waitForFunction(id=>document.getElementById('zr-gift-playback')?.dataset.state==='playing'&&document.getElementById('zr-gift-playback')?.dataset.transferId===id,transfer)}
async function open(browser,role){const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'no-preference'});page.setDefaultTimeout(7000);await page.route('https://**/*',route=>route.request().url().startsWith('https://gift-sync.fixture.test/')?route.fulfill({headers:{'access-control-allow-origin':'*'},contentType:'image/webp',body:bytes}):route.abort());await page.addInitScript(()=>{window.__sent=[];window.ReactNativeWebView={postMessage:raw=>__sent.push(JSON.parse(raw))}});await page.goto(pathToFileURL(path.join(root,'assets/aurora.html')).href);await receive(page,'session',{user:role==='host'?host:member,verification:role==='host'?'verified':'none',requiresOnboarding:false});await receive(page,'data.home',{hosts:[{...host,verified:true,online:true,availableForCall:true,ratePerMin:0}],total:1,page:1});await receive(page,'wallet.balance',{coins:role==='host'?0:5000,earningsPaise:0,diamondUnits:0,reservedDiamondUnits:0,diamondScale:1000000});await receive(page,'data.catalog',{gifts:[gift],packs:[],paymentsAvailable:false});await page.evaluate(({role,member,host,callId})=>{S.callId=callId;S.callRate=0;if(role==='host'){S.caller={id:member.id,n:member.name,callId,voice:false};go('hcall')}else go('call',host.id);Home.mediaStatus='Connected';r()},{role,member,host,callId});return page}
async function rapidCommittedGifts(browser){
 const sender=await open(browser,'sender'),receiver=await open(browser,'host'),pages=[sender,receiver];
 try{
  await Promise.all(pages.map(page=>page.evaluate(media=>ZimiGiftPlayback.preload(media),media)));
  async function send(selected){
   await sender.evaluate(host=>homeGifts(host),host.id);await receive(sender,'data.catalog',{gifts:[selected],packs:[],paymentsAvailable:false});
   await sender.evaluate(id=>{homeSelectGift(id);homeSendGift()},selected.id);
   return sender.evaluate(()=>__sent.filter(message=>message.type==='gift.send').at(-1)?.data);
  }
  function receipts(attempt,selected,transfer){
   const now=new Date().toISOString(),shared={id:transfer,callId,scope:'call',createdAt:now,emittedAt:now,coins:selected.coins};
   return [{...attempt,...shared,giftDetails:{...selected,transferId:transfer,quantity:1}},
    {...shared,giftId:selected.id,giftName:selected.name,emoji:selected.emoji,mediaUrl:selected.mediaUrl,durationMs:selected.durationMs,from:member.id,senderName:member.name,diamondUnits:75000000,diamondScale:1000000}];
  }
  const first=id(401),second=id(402),longGift={...gift,durationMs:6400},nextGift={...gift,durationMs:900};
  const firstAttempt=await send(longGift),firstReceipts=receipts(firstAttempt,longGift,first);
  await Promise.all([receive(sender,'gift.sent',firstReceipts[0]),receive(receiver,'gift.received',firstReceipts[1])]);
  await Promise.all(pages.map(page=>playing(page,first)));
  for(const page of pages)await stage(page).locator('img').evaluate(image=>{window.__rapidFirst=image});
  const secondAttempt=await send(nextGift);assert.notEqual(secondAttempt.idempotencyKey,firstAttempt.idempotencyKey,'A committed first send releases its own request before the second send');
  for(const page of pages)assert.equal(await stage(page).locator('img').evaluate(image=>image===__rapidFirst),true,'Sending feedback cannot interrupt only the sender before commit');
  assert.deepEqual(await sender.evaluate(()=>[S.giftN,S.gifted]),[1,25]);assert.equal(await receiver.evaluate(()=>S.recvN),1);
  const secondReceipts=receipts(secondAttempt,nextGift,second),began=Date.now();
  await Promise.all([receive(sender,'gift.sent',secondReceipts[0]),receive(receiver,'gift.received',secondReceipts[1])]);
  const started=await Promise.all(pages.map(async page=>{await playing(page,second);return Number(await stage(page).getAttribute('data-started-at'))}));
  const delays=started.map(at=>at-began),skew=Math.abs(started[0]-started[1]);
  console.log('Rapid committed gift timing: '+JSON.stringify({senderDelayMs:delays[0],hostDelayMs:delays[1],skewMs:skew}));
  assert.ok(Math.max(...delays)<=350,'Both participants replace a 6.4-second old call animation as soon as the next committed gift arrives');
  assert.ok(skew<=180,'Both participants apply the same committed call preemption policy');
  for(const page of pages){assert.equal(await page.evaluate(()=>__rapidFirst.isConnected),false);await stage(page).locator('img').evaluate(image=>{window.__rapidCurrent={image,src:image.src,at:document.getElementById('zr-gift-playback').dataset.startedAt}})}
  await Promise.all([receive(sender,'gift.sent',firstReceipts[0]),receive(receiver,'gift.received',firstReceipts[1]),receive(sender,'gift.sent',secondReceipts[0]),receive(receiver,'gift.received',secondReceipts[1])]);
  for(const page of pages)assert.equal(await stage(page).locator('img').evaluate(image=>image===__rapidCurrent.image&&image.src===__rapidCurrent.src&&document.getElementById('zr-gift-playback').dataset.startedAt===__rapidCurrent.at),true,'Duplicates neither resume the replaced transfer nor restart the current one');
  assert.deepEqual(await sender.evaluate(()=>[S.giftN,S.gifted,S.bal]),[2,50,5000]);assert.equal(await receiver.evaluate(()=>S.recvN),2,'Both committed transfers count once even though the first visual was replaced');
  await Promise.all(pages.map(page=>stage(page).waitFor({state:'hidden'})));await sender.waitForTimeout(100);
  for(const page of pages)assert.equal(await stage(page).count(),0,'Replaced call animations never resume from the ordinary queue');
  return {delays,skew};
 }finally{await Promise.all(pages.map(page=>page.close()))}
}
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});try{
 const rapid=await rapidCommittedGifts(browser);
 const sender=await open(browser,'sender'),receiver=await open(browser,'host');const errors=[];for(const page of [sender,receiver])page.on('pageerror',error=>errors.push(error.message));
 await Promise.all([sender,receiver].map(page=>page.evaluate(media=>ZimiGiftPlayback.preload(media),media)));
 await sender.evaluate(host=>homeGifts(host),host.id);await receive(sender,'data.catalog',{gifts:[gift],packs:[],paymentsAvailable:false});await sender.evaluate(gift=>{homeSelectGift(gift);homeSendGift()},gift.id);
 const attempt=await sender.evaluate(()=>__sent.filter(message=>message.type==='gift.send').at(-1)?.data);assert.equal(attempt.callId,callId,'The immutable retry payload binds the original call');assert.equal(attempt.to,host.id);
 assert.equal(await stage(sender).count(),0,'A local call click cannot run the sender animation before the shared commit');assert.equal(await stage(receiver).count(),0);assert.match(await sender.locator('#app-notice').innerText(),/Sending gift/);assert.deepEqual(await sender.evaluate(()=>[S.giftN,S.gifted,S.bal]),[0,0,5000]);
 const transfer=id(201),now=new Date().toISOString(),committed={id:transfer,callId,scope:'call',createdAt:now,emittedAt:now,coins:25,giftId:gift.id,giftName:gift.name,emoji:gift.emoji,mediaUrl:media,durationMs:550,from:member.id,senderName:member.name,diamondUnits:75000000,diamondScale:1000000};
 const senderReceipt={...attempt,id:transfer,callId,scope:'call',createdAt:now,emittedAt:now,coins:25,giftDetails:{...gift,transferId:transfer,quantity:1}};
 // Native fixtures model the two committed socket deliveries while HTTP remains
 // unreturned. Warm render skew is measured, not asserted as a WAN guarantee.
 await Promise.all([receive(sender,'gift.sent',senderReceipt),receive(receiver,'gift.received',committed)]);await Promise.all([playing(sender,transfer),playing(receiver,transfer)]);
 const times=await Promise.all([sender,receiver].map(page=>stage(page).getAttribute('data-started-at').then(Number))),skew=Math.abs(times[0]-times[1]);assert.ok(skew<=180,'Local warm playback skew must stay bounded, without adding an artificial server delay');
 for(const page of [sender,receiver])assert.deepEqual(await stage(page).locator('img').evaluate(image=>{const canvas=document.createElement('canvas');canvas.width=64;canvas.height=128;const context=canvas.getContext('2d');context.drawImage(image,0,0);return {size:[image.naturalWidth,image.naturalHeight],pixel:[...context.getImageData(32,64,1,1).data]}}),{size:[64,128],pixel:[255,0,0,255]},'Both clients paint the first authored original frame at its natural resolution');
 assert.equal(await receiver.locator('.zr-gift-alert').innerText().then(text=>/75 diamonds received/.test(text)),true,'Host receipt shows only its authoritative diamond amount');assert.equal(await receiver.evaluate(()=>S.recvN),1);assert.deepEqual(await sender.evaluate(()=>[S.giftN,S.gifted]),[1,25]);
 for(const page of [sender,receiver])await stage(page).locator('img').evaluate(image=>{window.__syncImage=image;window.__syncAt=document.getElementById('zr-gift-playback').dataset.startedAt});
 await Promise.all([receive(sender,'gift.sent',senderReceipt),receive(receiver,'gift.received',committed),receive(receiver,'realtime.status',{connected:true})]);
 for(const page of [sender,receiver])assert.equal(await stage(page).locator('img').evaluate(image=>image===__syncImage&&document.getElementById('zr-gift-playback').dataset.startedAt===__syncAt),true,'Duplicate socket/HTTP/reconnect events do not replay the committed transfer');
 await Promise.all([stage(sender).waitFor({state:'hidden'}),stage(receiver).waitFor({state:'hidden'})]);await Promise.all([receive(sender,'gift.sent',senderReceipt),receive(receiver,'gift.received',committed)]);assert.equal(await stage(sender).count(),0);assert.equal(await stage(receiver).count(),0,'Late duplicates cannot replay after expiration');
 // An unrelated chat, wrong peer, wrong call and a delayed prior-call receipt
 // must never land on the current full-screen call surface or its counters.
 const count=await receiver.evaluate(()=>S.recvN);
 for(const patch of [{id:id(210),callId:otherCall},{id:id(211),from:id(999)},{id:id(212),callId:undefined,scope:'chat'}])await receive(receiver,'gift.received',{...committed,...patch});
 assert.equal(await receiver.evaluate(()=>S.recvN),count);assert.equal(await stage(receiver).count(),0);
 await receiver.evaluate(({otherCall,member})=>{S.callId=otherCall;S.caller={id:member.id,n:member.name,callId:otherCall,voice:false};go('hcall')},{otherCall,member});await receive(receiver,'gift.received',{...committed,id:id(220)});assert.equal(await receiver.evaluate(()=>S.recvN),0);assert.equal(await stage(receiver).count(),0,'A delayed old-call transfer cannot animate in the next call');
 // Socket and HTTP can be delayed asymmetrically. The receiver starts at receipt
 // immediately; a late sender confirmation cannot be made simultaneous by lying.
 await sender.evaluate(({otherCall,host})=>{S.callId=otherCall;go('call',host.id)},{otherCall,host});
 const late={...committed,id:id(230),callId:otherCall};await receive(receiver,'gift.received',late);await playing(receiver,late.id);const hostAt=Number(await stage(receiver).getAttribute('data-started-at'));await sender.waitForTimeout(160);
 await receive(sender,'gift.sent',{...senderReceipt,id:late.id,callId:otherCall,idempotencyKey:'another-device-request'});await playing(sender,late.id);const senderAt=Number(await stage(sender).getAttribute('data-started-at'));assert.ok(senderAt-hostAt>=140,'Late delivery remains measurable; recipient is never held back to disguise skew');
 await Promise.all([receive(sender,'app.background'),receive(receiver,'app.background')]);assert.equal(await stage(sender).count(),0);assert.equal(await stage(receiver).count(),0);
 assert.deepEqual(errors,[]);console.log('PASS call gift synchronization: committed-only two-client playback, local warm render skew '+skew+'ms; rapid committed replacement '+Math.max(...rapid.delays)+'ms, exact call/peer routing, sender socket before HTTP, diamond receipt, duplicate/reconnect/late isolation, and honest delayed delivery');
 }finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
