/* Actual streaming image regression: real HTTP responses remain incomplete
   while screenshots prove authored animation frames are already painting. */
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {PNG}=require('pngjs');
const root=path.resolve(__dirname,'..');
// Three authored solid-color frames (red, blue, green), 500 ms each, 64x128.
// Embedded once so fresh Linux CI needs no image-generation executable.
const fixtures={
 gif:{ends:[212,392,572],bytes:Buffer.from('R0lGODlhQACAAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQIMgAAACwAAAAAQACAAAAIkwABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFixgzatzIsaPHjyBDihxJsqTJkyhTqlzJsqXLlzBjypxJs6bNmzhz6tzJs6fPn0CDCh1KtKjRo0iTKl3KtKnTp1CjSp1KtarVq1izat3KtavXr2DDih1LtqzZs2jTql3Ltq3bt3Djyp1Lt67du3jz6t3Lt6/fv0ADAgAh+QQIMgAAACwAAAAAQACAAIEAAP8AAAAAAAAAAAAIkwABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFixgzatzIsaPHjyBDihxJsqTJkyhTqlzJsqXLlzBjypxJs6bNmzhz6tzJs6fPn0CDCh1KtKjRo0iTKl3KtKnTp1CjSp1KtarVq1izat3KtavXr2DDih1LtqzZs2jTql3Ltq3bt3Djyp1Lt67du3jz6t3Lt6/fv0ADAgAh+QQIMgAAACwAAAAAQACAAIEA/wAAAAAAAAAAAAAIkwABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFixgzatzIsaPHjyBDihxJsqTJkyhTqlzJsqXLlzBjypxJs6bNmzhz6tzJs6fPn0CDCh1KtKjRo0iTKl3KtKnTp1CjSp1KtarVq1izat3KtavXr2DDih1LtqzZs2jTql3Ltq3bt3Djyp1Lt67du3jz6t3Lt6/fv0ADAgA7','base64')},
 webp:{ends:[92,140,188],bytes:Buffer.from('UklGRrQAAABXRUJQVlA4WAoAAAACAAAAPwAAfwAAQU5JTQYAAAAAAAAAAABBTk1GKAAAAAAAAAAAAD8AAH8AAPQBAAJWUDhMDwAAAC8/wB8ABxD9j/4HIqL/AQBBTk1GKAAAAAAAAAAAAD8AAH8AAPQBAABWUDhMDwAAAC8/wB8ABxDR//4HIqL/AQBBTk1GKAAAAAAAAAAAAD8AAH8AAPQBAABWUDhMDwAAAC8/wB8AB9D/iP4HIqL/AQA=','base64')}
};
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port)));
async function until(test,label,timeout=4000){const deadline=Date.now()+timeout;while(Date.now()<deadline){const result=await test();if(result)return result;await new Promise(resolve=>setTimeout(resolve,20))}throw Error(label)}
async function pixel(page){const image=PNG.sync.read(await page.screenshot({clip:{x:50,y:90,width:1,height:1}}));return [...image.data.subarray(0,4)]}
(async()=>{
 const servers=[],open=new Set(),resources=new Map(),errors=[];
 let browser;
 try{
  const app=http.createServer((request,response)=>{response.writeHead(200,{'content-type':'text/html'});response.end('<!doctype html><style>html,body{margin:0;background:white}.app{height:200px;width:100px}</style><div class="app"></div>')});servers.push(app);const appOrigin=await listen(app);
  const media=http.createServer(async(request,response)=>{
   const url=new URL(request.url,'http://fixture');
   if(url.pathname==='/poster.svg'){response.writeHead(200,{'content-type':'image/svg+xml','cache-control':'public,max-age=3600'});return response.end('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="128"><rect width="64" height="128" fill="#ea4baf"/></svg>')}
   const resource=resources.get(url.pathname);if(!resource){response.writeHead(404);return response.end()}
   const record={url:request.url,dest:request.headers['sec-fetch-dest'],mode:request.headers['sec-fetch-mode'],bytes:0,complete:false,aborted:false};resource.requests.push(record);open.add(response);
   response.on('close',()=>{open.delete(response);if(!response.writableEnded)record.aborted=true});
   const headers={'content-type':'image/'+resource.format,'content-length':resource.fixture.bytes.length,'cache-control':'public,max-age=3600','vary':'Origin'};
   if(resource.cors)headers['access-control-allow-origin']=appOrigin;
   response.writeHead(200,headers);await resource.head;
   if(response.destroyed)return;
   response.write(resource.fixture.bytes.subarray(0,resource.fixture.ends[1]));record.bytes=resource.fixture.ends[1];
   await resource.tail;
   if(!response.destroyed){response.end(resource.fixture.bytes.subarray(resource.fixture.ends[1]));record.bytes=resource.fixture.bytes.length;record.complete=true}
  });servers.push(media);const mediaOrigin=await listen(media);
  function resource(name,format='webp',cors=true,holdHeaders=false){let release,releaseHeader;const head=new Promise(resolve=>{releaseHeader=resolve});if(!holdHeaders)releaseHeader();const data={format,cors,fixture:fixtures[format],requests:[],head,releaseHeader,tail:new Promise(resolve=>{release=resolve}),release:()=>{releaseHeader();release()}};resources.set(name,data);return data}
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
  const page=await browser.newPage({viewport:{width:100,height:200}});page.on('pageerror',error=>errors.push(error.message));await page.goto(appOrigin);
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'web/gift-art.css'),'utf8')});
  await page.evaluate(()=>{window.Native={on(){}};window.__starts=[]});
  await page.addScriptTag({content:fs.readFileSync(path.join(root,'web/gift-playback.js'),'utf8')});
  await page.evaluate(()=>{window.player=ZimiGiftPlayback.create({id:'zc-gift-playback',imageClass:'zc-gift-playback-art',available:()=>true,onStart:item=>__starts.push(item.transferId||item.requestId)})});
  for(const [index,format,signed] of [[0,'gif',false],[1,'webp',false],[2,'webp',true]]){
   const name='/cold-'+index+'.'+format,data=resource(name,format,true,index===0),canonical=mediaOrigin+name+(signed?'?token=fixture&expires=9999999999':'');
   await page.evaluate(({canonical,index,poster})=>player.enqueue({requestId:'cold-'+index,provisional:true,media:canonical,poster,durationMs:450}),{canonical,index,poster:index===0?mediaOrigin+'/poster.svg':undefined});
   await until(()=>data.requests.length===1,'The cold image did not request its original');
   if(index===0){
    await until(async()=>{const p=await pixel(page);return p[0]===234&&p[1]===75&&p[2]===175},'The actual static poster did not paint while original headers were held');
    assert.match(await page.evaluate(()=>getComputedStyle(player.element).backgroundImage),/poster\.svg/);assert.equal(data.requests[0].bytes,0);
    data.releaseHeader();
   }
   await until(async()=>{const p=await pixel(page);return p[0]===255&&p[1]===0&&p[2]===0},format+' did not paint its first authored frame before the tail');
   assert.equal(await page.evaluate(()=>getComputedStyle(player.element).backgroundImage),'none','The poster clears as the first original frames arrive, before the tail/onload');
   const first=await page.evaluate(()=>({complete:player.active.image.complete,natural:[player.active.image.naturalWidth,player.active.image.naturalHeight],state:player.active.state,started:!!player.active.at,source:player.active.image.src,media:player.active.media}));
   assert.deepEqual({complete:first.complete,natural:first.natural,state:first.state,started:first.started},{complete:false,natural:[64,128],state:'loading',started:false},format+' paints the unchanged original before full download/onload');
   await until(async()=>{const p=await pixel(page);return p[0]===0&&p[1]===0&&p[2]===255},format+' did not animate to its second authored frame while the tail was held');
   assert.equal(await page.evaluate(()=>player.active.image.complete),false,'Two authored colors prove motion, not a static poster');
   assert.equal(data.requests.length,1,'Cold playback has one image request and no concurrent original-byte fetch');
   assert.equal(data.requests[0].dest,'image');assert.equal(data.requests[0].mode,'cors');
   assert.equal(data.requests[0].url,name+(signed?'?token=fixture&expires=9999999999':'?binzoGiftCache=2'),'Transfer identity remains a fragment and never changes the network query');
   assert.match(first.source,/#binzoGiftPlayback=cold-/);assert.equal(first.media,canonical);
   await page.evaluate(index=>player.confirm('cold-'+index,'confirmed-'+index),index);
   assert.equal(await page.evaluate(()=>player.active.image.src),first.source,'Confirmation does not reload the progressive image');
   data.release();await page.waitForFunction(()=>player.active?.state==='playing');
   const start=await page.evaluate(()=>player.active.at);await page.evaluate(media=>ZimiGiftPlayback.preload(media),canonical);
   assert.equal(data.requests.length,1,'Post-load byte-cache filling reuses the completed anonymous image HTTP cache');
   await page.waitForFunction(()=>!player.active);assert.ok(Date.now()-start>=400,'The full lifetime starts only after onload');
   await page.evaluate(({canonical,index})=>player.enqueue({transferId:'cached-'+index,media:canonical,durationMs:250}),{canonical,index});await page.waitForFunction(()=>player.active?.state==='playing');
   const proof=await page.evaluate(async()=>{const image=player.active.image,bytes=await(await fetch(image.src)).arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);return {url:image.src,natural:[image.naturalWidth,image.naturalHeight],bytes:bytes.byteLength,hash:[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')}});
   assert.match(proof.url,/^blob:/);assert.deepEqual(proof.natural,[64,128]);assert.equal(proof.bytes,data.fixture.bytes.length);assert.equal(proof.hash,crypto.createHash('sha256').update(data.fixture.bytes).digest('hex'));
   assert.equal(data.requests.length,1,'The next gift replays exact cached bytes without another body transfer');assert.equal(data.requests[0].bytes,data.fixture.bytes.length);
   await page.waitForFunction(()=>!player.active);
  }
  const shared=resource('/shared.webp');await page.evaluate(media=>player.enqueue({requestId:'shared-active',media,durationMs:350}),mediaOrigin+'/shared.webp');await until(()=>shared.requests.length===1,'Shared stream did not start');
  await page.evaluate(media=>player.enqueue({transferId:'shared-queued',media,durationMs:350}),mediaOrigin+'/shared.webp');await page.evaluate(()=>player.cancel('shared-active'));
  await until(async()=>{const p=await pixel(page);return p[0]===255&&p[1]===0&&p[2]===0},'A queued transfer could not paint the shared cold response');
  shared.release();await page.waitForFunction(()=>player.active?.state==='playing');assert.equal(await page.evaluate(()=>player.active.transferId),'shared-queued');await page.evaluate(media=>ZimiGiftPlayback.preload(media),mediaOrigin+'/shared.webp');assert.equal(shared.requests.length,1,'The queued transfer handoff keeps one HTTP writer despite a different transfer fragment');await page.waitForFunction(()=>!player.active);
  const cancel=resource('/cancel.webp');await page.evaluate(media=>player.enqueue({requestId:'cancel-stream',media}),mediaOrigin+'/cancel.webp');await until(()=>cancel.requests.length===1,'Cancellation stream did not start');
  await page.evaluate(()=>player.cancel('cancel-stream'));await until(()=>cancel.requests[0].aborted,'Cancelling a cold stream did not abort its HTTP response');cancel.release();assert.equal(await page.locator('#zc-gift-playback').count(),0);
  const selected=resource('/selected.webp'),selectedUrl=mediaOrigin+'/selected.webp';
  await page.evaluate(media=>{window.__selected=ZimiGiftPlayback.preload(media)},selectedUrl);await until(()=>selected.requests.length===1,'Selected warmup did not start');
  await page.evaluate(media=>player.enqueue({requestId:'selected-send',provisional:true,media,durationMs:250}),selectedUrl);
  assert.equal(await page.evaluate(()=>__selected),false,'A cold Send releases its unused selected Blob-fetch consumer');
  await until(async()=>{const p=await pixel(page);return p[0]===255&&p[1]===0&&p[2]===0},'Selected Send did not progressively paint');
  assert.ok(selected.requests.length<=2,'A selected Send cannot create parallel full-body downloads');
  assert.equal(selected.requests[0].dest,'empty');
  // Chromium can hand the existing HTTP response to the new image consumer;
  // otherwise the abandoned partial fetch closes and one image request starts.
  if(selected.requests.length===2){await until(()=>selected.requests[0].aborted,'The unused partial fetch stayed alive');assert.equal(selected.requests[1].dest,'image')}
  const selectedRequests=selected.requests.length;selected.release();await page.waitForFunction(()=>player.active?.state==='playing');await page.evaluate(media=>ZimiGiftPlayback.preload(media),selectedUrl);assert.equal(selected.requests.length,selectedRequests,'Post-load caching never adds a full network body transfer');assert.equal(selected.requests.filter(request=>request.complete).length,1,'Exactly one complete original body reaches the selected Send');await page.waitForFunction(()=>!player.active);
  const opaque=resource('/opaque.webp','webp',false);await page.evaluate(media=>player.enqueue({transferId:'opaque',media,durationMs:250}),mediaOrigin+'/opaque.webp');
  await until(()=>opaque.requests.length===2,'An image-only host did not get its one non-CORS retry');assert.deepEqual(opaque.requests.map(request=>request.mode),['cors','no-cors']);
  await until(async()=>{const p=await pixel(page);return p[0]===255&&p[1]===0&&p[2]===0},'The image-only retry did not progressively paint');opaque.release();await page.waitForFunction(()=>player.active?.state==='playing');await page.waitForFunction(()=>!player.active);assert.equal(opaque.requests.length,2,'Image-only fallback never loops or adds a full fetch download');
  assert.deepEqual(errors,[]);console.log('PASS progressive gifts: real GIF/WebP red→blue motion before HTTP tail/onload, original resolution/bytes, exact signed query + transfer fragment, one complete body then cached Blob replay, anonymous/image-only fallback, selected-warm interruption and stream cancellation');
 }finally{for(const data of resources.values())data.release();for(const response of open)response.destroy();if(browser)await browser.close();await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))))}
})().catch(error=>{console.error(error);process.exitCode=1});
