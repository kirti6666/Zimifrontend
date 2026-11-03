/* Real-browser coverage for shared original-byte gift playback. All network and
   account-free presentation data are local fixtures; no gift is purchased. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const origin = 'https://gift-player.fixture.test';
const art = '<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960"><circle cx="270" cy="480" r="100" fill="#ea4baf"/></svg>';
const poster = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="320"><circle cx="90" cy="160" r="40" fill="#ea4baf"/></svg>');
function png4k() {
  const crcTable = Array.from({ length: 256 }, (_, n) => { for (let i=0;i<8;i++) n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0; });
  const chunk = (type, data) => { const name=Buffer.from(type),result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);name.copy(result,4);data.copy(result,8);let crc=0xffffffff;for(const byte of Buffer.concat([name,data]))crc=crcTable[(crc^byte)&255]^(crc>>>8);result.writeUInt32BE((crc^0xffffffff)>>>0,result.length-4);return result; };
  const width=4096,height=4096,stride=width*3+1,raw=Buffer.alloc(stride*height);
  let seed=0x57329af;
  // Original pixel detail, rather than padding an SVG/file or upscaling a tiny
  // image, makes this lossless 4K source exceed the old 16 MiB upload limit.
  for(let y=0;y<height/2;y++)for(let x=1;x<stride;x++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;raw[y*stride+x]=seed&255;}
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw,{level:1})),chunk('IEND',Buffer.alloc(0))]);
}
async function playing(page,id){
  try{await page.waitForFunction(id=>__player.active?.state==='playing'&&(!id||__player.element.dataset.transferId===id),id)}
  catch(error){console.error('Gift playback state:',await page.evaluate(()=>({state:__player.active?.state,id:__player.active?.transferId,source:__player.active?.image?.src,current:__player.active?.image?.currentSrc,complete:__player.active?.image?.complete,natural:__player.active?.image?.naturalWidth,retry:__player.active?.corsRetried,events:__events})));throw error}
}
const idle = page => page.waitForFunction(()=>!__player.active);
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
  const errors=[],counts=new Map(),held=new Map(),fetches=[];
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    page.on('pageerror',error=>errors.push(error.message));
    const high=png4k(),highHash=crypto.createHash('sha256').update(high).digest('hex');
    assert.ok(high.length>16*1024*1024&&high.length<64*1024*1024,'The high-resolution fixture contains more than 16 MiB of original pixels');
    await page.route(origin+'/**',async route=>{
      const name=new URL(route.request().url()).pathname;
      if(name==='/app')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width"><style>html,body{margin:0}.app{width:100vw;height:100dvh}</style><div class="app"><button id="control" style="position:fixed;bottom:20px;left:150px;width:80px;height:44px;z-index:1">Send</button></div>'});
      if(route.request().resourceType()==='fetch')fetches.push(route.request().url());
      counts.set(name,(counts.get(name)||0)+1);
      if(held.has(name)){held.get(name).requested();await held.get(name).promise;}
      try{await route.fulfill({headers:{'access-control-allow-origin':'*'},contentType:name==='/original-4k.png'?'image/png':'image/svg+xml',body:name==='/original-4k.png'?high:art});}catch(error){if(!/closed|handled|Invalid|intercept|aborted/i.test(String(error)))throw error;}
    });
    await page.goto(origin+'/app');
    await page.addStyleTag({content:fs.readFileSync(path.join(root,'web/gift-art.css'),'utf8')});
    await page.evaluate(()=>{window.Native={on(){}};window.__events=[];window.__available=true;window.__obstructed=false;window.__urls=0;const create=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{__urls++;return create(blob)};window.__decodes=0;HTMLImageElement.prototype.decode=function(){__decodes++;return new Promise(()=>{})};});
    await page.addScriptTag({content:fs.readFileSync(path.join(root,'web/gift-playback.js'),'utf8')});
    await page.evaluate(()=>{window.__player=ZimiGiftPlayback.create({id:'zc-gift-playback',imageClass:'zc-gift-playback-art',available:()=>__available,obstructed:()=>__obstructed,onStart:item=>__events.push({type:'start',id:item.transferId||item.requestId,provisional:!!item.provisional,at:item.at}),onConfirm:item=>__events.push({type:'confirm',state:item.state,gift:item.gift}),onFinish:item=>__events.push({type:'finish',id:item.transferId||item.requestId})});});
    function hold(name){let release,requested;const promise=new Promise(resolve=>{release=resolve}),request=new Promise(resolve=>{requested=resolve});held.set(name,{promise,requested});return {release,request};}
    const slow=hold('/slow.svg');
    await page.evaluate(({origin,poster})=>__player.enqueue({transferId:'slow',media:origin+'/slow.svg',poster,durationMs:350}),{origin,poster});
    await slow.request;
    assert.deepEqual(await page.evaluate(()=>({visible:!__player.element.hidden,state:__player.active.state,started:!!__player.active.at,feedback:!!__player.element.querySelector('[data-gift-loading]')})),{visible:true,state:'loading',started:false,feedback:true},'The cold original has immediate presentation while its first response is held');
    await page.evaluate(()=>{window.__image=__player.active.image});
    await page.waitForTimeout(450);
    assert.equal(await page.evaluate(()=>__events.filter(event=>event.type==='start').length),0,'Poster time cannot consume or announce motion playback');
    slow.release();await playing(page,'slow');
    assert.equal(await page.evaluate(()=>__player.active.image===__image),true,'The original animation replaces the poster in the same image node');
    assert.equal(await page.evaluate(()=>__decodes),0,'Playback does not wait for decoding all animation frames');
    const started=await page.evaluate(()=>__player.active.at);await idle(page);
    assert.ok(Date.now()-started>=300,'Motion retains its supplied duration after the slow download');

    await page.evaluate(origin=>ZimiGiftPlayback.preload(origin+'/original-4k.png'),origin);
    const initialCount=counts.get('/original-4k.png');
    assert.equal(initialCount,1);
    const immediate=await page.evaluate(({origin,poster})=>{const accepted=__player.enqueue({requestId:'send-4k',provisional:true,priority:true,media:origin+'/original-4k.png',poster,durationMs:1700}),box=document.getElementById('control').getBoundingClientRect();return {accepted,visible:!__player.element.hidden,provisional:__player.element.dataset.provisional,state:__player.active.state,control:document.elementFromPoint(box.left+box.width/2,box.top+box.height/2).id};},{origin,poster});
    assert.deepEqual(immediate,{accepted:true,visible:true,provisional:'true',state:'loading',control:'control'},'Immediate pending/loading feedback remains transparent to control touches');
    await playing(page,'send-4k');
    const original=await page.evaluate(async()=>{const image=__player.active.image,bytes=await(await fetch(image.src)).arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',bytes);window.__highImage=image;window.__highUrl=image.src;window.__highAt=__player.active.at;const box=image.getBoundingClientRect(),control=document.getElementById('control').getBoundingClientRect();return {width:image.naturalWidth,height:image.naturalHeight,bytes:bytes.byteLength,hash:[...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join(''),fit:getComputedStyle(image).objectFit,box:{width:box.width,height:box.height},control:document.elementFromPoint(control.left+control.width/2,control.top+control.height/2).id};});
    assert.deepEqual({width:original.width,height:original.height,bytes:original.bytes,hash:original.hash},{width:4096,height:4096,bytes:high.length,hash:highHash},'A real 4K source over 16 MiB keeps its original dimensions and exact bytes');
    assert.equal(original.fit,'contain');assert.deepEqual(original.box,{width:390,height:844});assert.equal(original.control,'control','High-resolution playback leaves controls tappable');
    assert.equal(counts.get('/original-4k.png'),1,'Selection warming and playback share one original download');
    assert.deepEqual(fetches.filter(url=>new URL(url).pathname==='/original-4k.png'),[origin+'/original-4k.png?binzoGiftCache=2'],'Unsigned original fetches use one stable CORS cache version, never a per-transfer cache miss');
    assert.equal(await page.evaluate(()=>__player.confirm('send-4k','confirmed-4k',{gift:{giftName:'Authoritative gift'}})),true);
    assert.deepEqual(await page.evaluate(()=>({sameImage:__player.active.image===__highImage,sameUrl:__player.active.image.src===__highUrl,sameStart:__player.active.at===__highAt,provisional:__player.active.provisional,starts:__events.filter(event=>event.id==='send-4k'&&event.type==='start').length,confirmed:__events.filter(event=>event.type==='confirm').at(-1)})),{sameImage:true,sameUrl:true,sameStart:true,provisional:false,starts:1,confirmed:{type:'confirm',state:'playing',gift:{giftName:'Authoritative gift'}}},'Confirmation updates metadata without restarting the pending original');
    assert.equal(await page.evaluate(({origin,poster})=>__player.enqueue({transferId:'confirmed-4k',media:origin+'/original-4k.png',poster}),{origin,poster}),false,'A confirmed alias cannot enqueue another animation');
    await idle(page);
    assert.equal(await page.evaluate(()=>__player.confirm('send-4k','confirmed-4k')),true,'A late duplicate acknowledgment recognizes an already finished preview');
    assert.equal(await page.locator('#zc-gift-playback').count(),0);

    await page.evaluate(origin=>{__events.length=0;__player.enqueue({transferId:'remote-active',media:origin+'/queue.svg',durationMs:700});},origin);await playing(page,'remote-active');
    await page.evaluate(({origin,poster})=>{__player.enqueue({transferId:'remote-queued',media:origin+'/queue.svg',durationMs:350});__player.enqueue({requestId:'own-request',provisional:true,priority:true,media:origin+'/queue.svg',poster,durationMs:350});__player.enqueue({transferId:'socket-before-ack',media:origin+'/queue.svg',durationMs:350});},{origin,poster});
    await playing(page,'own-request');
    const pendingUrl=await page.locator('#zc-gift-playback img').getAttribute('src');
    await page.evaluate(()=>{__player.confirm('own-request','socket-before-ack');__player.confirm('own-request','socket-before-ack')});
    assert.equal(await page.locator('#zc-gift-playback img').getAttribute('src'),pendingUrl);
    await playing(page,'remote-queued');
    assert.notEqual(await page.locator('#zc-gift-playback img').getAttribute('src'),pendingUrl,'Distinct transfers restart the cached original from frame one');
    await idle(page);
    assert.deepEqual(await page.evaluate(()=>__events.filter(event=>event.type==='start').map(event=>event.id)),['remote-active','own-request','remote-queued'],'Priority sender feedback keeps the received queue and coalesces an early socket receipt');
    assert.equal(counts.get('/queue.svg'),2,'Queued transfers reuse the bytes filled after the first image load');

    const stale=hold('/cancelled.svg');
    await page.evaluate(({origin,poster})=>__player.enqueue({requestId:'cancelled-request',provisional:true,media:origin+'/cancelled.svg',poster}),{origin,poster});await stale.request;
    const urls=await page.evaluate(()=>__urls);
    const cancelledRequest=page.waitForEvent('requestfailed',{predicate:request=>new URL(request.url()).pathname==='/cancelled.svg'&&request.resourceType()==='image'});
    await page.evaluate(()=>__player.cancel('cancelled-request'));await cancelledRequest;stale.release();await page.waitForTimeout(150);
    assert.deepEqual(await page.evaluate(()=>({active:!!__player.active,portal:!!__player.element,urls:__urls})),{active:false,portal:false,urls},'A cancelled slow response cannot create a Blob URL or resurrect its stage');
    assert.equal(await page.evaluate(origin=>__player.enqueue({requestId:'cancelled-request',provisional:true,media:origin+'/cancelled.svg'}),origin),false,'Retrying the same pending request never replays');
    assert.equal(await page.evaluate(()=>__player.confirm('cancelled-request','late-cancelled-transfer')),true);
    assert.equal(await page.locator('#zc-gift-playback').count(),0,'Late confirmation does not resurrect a cancelled presentation');

    const shared=hold('/shared-held.svg');
    await page.evaluate(origin=>__player.enqueue({requestId:'shared-active',media:origin+'/shared-held.svg',durationMs:350}),origin);await shared.request;
    await page.evaluate(origin=>__player.enqueue({transferId:'shared-queued',media:origin+'/shared-held.svg',durationMs:350}),origin);
    await page.evaluate(()=>__player.cancel('shared-active'));
    assert.equal(await page.evaluate(()=>__player.active.transferId),'shared-queued','Cancelling one consumer preserves the queued transfer sharing its original');
    shared.release();await playing(page,'shared-queued');await idle(page);
    assert.equal(counts.get('/shared-held.svg'),2,'The queued image shares the original HTTP resource and its completed bytes fill the cache once');

    const clearing=[hold('/clear-active.svg'),hold('/clear-queued.svg')];
    await page.evaluate(origin=>__player.enqueue({transferId:'clear-active',media:origin+'/clear-active.svg'}),origin);await clearing[0].request;
    await page.evaluate(origin=>__player.enqueue({transferId:'clear-queued',media:origin+'/clear-queued.svg'}),origin);
    assert.equal(counts.get('/clear-queued.svg'),undefined,'A cold queued original cannot start a competing full download');
    const clearFailure=page.waitForEvent('requestfailed',{predicate:request=>new URL(request.url()).pathname==='/clear-active.svg'&&request.resourceType()==='image'});
    await page.evaluate(()=>__player.clear());await clearFailure;clearing.forEach(wait=>wait.release());
    assert.equal(await page.locator('#zc-gift-playback').count(),0,'Clear aborts the active image and discards the waiting queue');

    const preempted=hold('/preempted.svg');
    await page.evaluate(origin=>__player.enqueue({transferId:'preempted',media:origin+'/preempted.svg'}),origin);await preempted.request;
    const preemptFailure=page.waitForEvent('requestfailed',{predicate:request=>new URL(request.url()).pathname==='/preempted.svg'&&request.resourceType()==='image'});
    await page.evaluate(origin=>__player.enqueue({requestId:'preempting-own-send',provisional:true,priority:true,media:origin+'/queue.svg',durationMs:350}),origin);await preemptFailure;preempted.release();await playing(page,'preempting-own-send');await idle(page);

    await page.evaluate(({origin,poster})=>__player.enqueue({requestId:'edited-catalog',provisional:true,media:origin+'/old-catalog.svg',poster,durationMs:2000}),{origin,poster});await playing(page,'edited-catalog');
    assert.equal(await page.evaluate(origin=>__player.confirm('edited-catalog','authoritative-transfer',{media:origin+'/server-original.svg'}),origin),false,'An in-flight catalog edit requires the server-authoritative original');
    assert.equal(await page.locator('#zc-gift-playback').count(),0,'The stale catalog artwork is removed instead of being marked confirmed');
    assert.equal(await page.evaluate(origin=>__player.enqueue({transferId:'authoritative-transfer',media:origin+'/server-original.svg',durationMs:350}),origin),true,'Source replacement leaves the authoritative transfer available to enqueue');
    await playing(page,'authoritative-transfer');
    assert.equal(await page.locator('#zc-gift-playback img').getAttribute('data-media-url'),origin+'/server-original.svg');
    const authoritativeUrl=await page.locator('#zc-gift-playback img').getAttribute('src');
    assert.equal(await page.evaluate(origin=>__player.confirm('edited-catalog','authoritative-transfer',{media:origin+'/server-original.svg'}),origin),true,'A repeated acknowledgment aliases the replacement original instead of cancelling it');
    assert.equal(await page.locator('#zc-gift-playback img').getAttribute('src'),authoritativeUrl);await idle(page);

    const blocked=hold('/blocked.svg');
    await page.evaluate(({origin,poster})=>__player.enqueue({transferId:'blocked',media:origin+'/blocked.svg',poster,durationMs:350}),{origin,poster});await blocked.request;
    await page.evaluate(()=>{__obstructed=true;__player.sync()});blocked.release();
    await page.waitForFunction(()=>__player.active?.ready);
    assert.deepEqual(await page.evaluate(()=>({state:__player.active.state,started:!!__player.active.at,hidden:__player.element.hidden})),{state:'loading',started:false,hidden:true},'An asset becoming ready behind a sheet retains all its playback time');
    await page.evaluate(()=>{__obstructed=false;__player.sync()});await playing(page,'blocked');await idle(page);

    await page.evaluate(()=>ZimiGiftPlayback.resetCache());
    for(const name of ['cache-a','cache-b','cache-c','cache-d'])await page.evaluate(({origin,name})=>ZimiGiftPlayback.preload(origin+'/'+name+'.svg'),{origin,name});
    await page.evaluate(origin=>ZimiGiftPlayback.preload(origin+'/cache-d.svg'),origin);
    assert.equal(counts.get('/cache-d.svg'),1,'The most recently selected original stays warm');
    await page.evaluate(origin=>ZimiGiftPlayback.preload(origin+'/cache-a.svg'),origin);
    assert.equal(counts.get('/cache-a.svg'),2,'Selected artwork retention is bounded instead of caching the whole catalog');
    const signed=origin+'/signed-original.svg?signature=fixture&expires=9999999999';
    await page.evaluate(media=>ZimiGiftPlayback.preload(media),signed);
    assert.equal(fetches.at(-1),signed,'Already-query/signed source URLs are never rewritten');
    const warming=[];await page.evaluate(()=>{window.__warming=[]});
    for(let i=0;i<4;i++){
      const name='/selected-cold-'+i+'.svg',wait=hold(name);warming.push(wait);
      await page.evaluate(({origin,name})=>{__warming.push(ZimiGiftPlayback.preload(origin+name))},{origin,name});await wait.request;
    }
    warming.forEach(wait=>wait.release());
    assert.deepEqual(await page.evaluate(()=>Promise.all(__warming)),[false,false,false,true],'Rapid new selections keep only the selected cold original downloading');
    assert.equal(counts.get('/selected-cold-0.svg'),1,'An evicted warmup cannot start an image fallback and re-download the stale selection');
    const noCors='https://gift-no-cors.fixture.test/original.svg';
    const fallbackRequests=[];
    await page.route('https://gift-no-cors.fixture.test/**',route=>{
      const type=route.request().resourceType();fallbackRequests.push({url:route.request().url(),type});
      // Fulfilled Playwright routes bypass CORS checks. Model the browser's
      // blocked fetch explicitly, while leaving the image endpoint usable.
      return type==='fetch'?route.abort('blockedbyresponse'):route.fulfill({contentType:'image/svg+xml',body:art});
    });
    assert.equal(await page.evaluate(media=>ZimiGiftPlayback.preload(media),noCors),true,'An image-only host can still warm selected artwork without fetch CORS');
    await page.evaluate(media=>ZimiGiftPlayback.preload(media),noCors);
    assert.deepEqual(fallbackRequests.map(request=>request.type),['fetch','image'],'A cached image fallback does not retry a failed fetch on every selection');
    await page.evaluate(media=>__player.enqueue({transferId:'cors-fallback',media,durationMs:350}),noCors);await playing(page,'cors-fallback');
    assert.equal(await page.locator('#zc-gift-playback img').getAttribute('data-media-url'),noCors);
    assert.match(await page.locator('#zc-gift-playback img').getAttribute('src'),/#binzoGiftPlayback=cors-fallback/,'Unsigned image-only playback gets a fresh animation fragment without a network cache miss');
    await idle(page);
    let releasePublic,requestedPublic;
    const publicReleased=new Promise(resolve=>{releasePublic=resolve}),publicRequested=new Promise(resolve=>{requestedPublic=resolve});
    await page.route('https://gift-no-cors.fixture.test/held.svg*',async route=>{
      if(route.request().resourceType()==='fetch')return route.abort('blockedbyresponse');
      requestedPublic();await publicReleased;
      try{await route.fulfill({contentType:'image/svg+xml',body:art})}catch(error){if(!/closed|handled|Invalid|intercept|aborted/i.test(String(error)))throw error;}
    });
    await page.evaluate(()=>__player.enqueue({requestId:'cancel-public-image',media:'https://gift-no-cors.fixture.test/held.svg'}));await publicRequested;
    const publicAborted=page.waitForEvent('requestfailed',{predicate:request=>request.resourceType()==='image'&&new URL(request.url()).pathname==='/held.svg'});
    await page.evaluate(()=>__player.cancel('cancel-public-image'));await publicAborted;releasePublic();
    await page.evaluate(()=>__player.clear(true));
    assert.deepEqual(errors,[]);
    console.log('PASS shared gift playback: immediate original poster, pending promotion/late acknowledgment, priority/queue/socket dedup, cancellation races, bounded warming, no all-frame decode, exact 4K >16 MiB bytes and tappable full-surface presentation');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
