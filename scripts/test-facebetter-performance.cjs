/* Adaptive scheduling invariants and a controlled area-cost browser benchmark.
   The mocked engine is intentionally CPU-bound. These timings are not licensed
   SDK throughput measurements; native/real-SDK benchmarks are separate. */
const assert = require('node:assert/strict'),fs = require('node:fs'),path = require('node:path'),vm = require('node:vm'),http = require('node:http');
const {test} = require('node:test'),{once} = require('node:events');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname,'..');
const controller = fs.readFileSync(path.join(root,'web/beauty.js'),'utf8').replace(/__FB_EFFECT_[a-z0-9_]+__/g,Buffer.from('test-effect').toString('base64'));
const begin = controller.indexOf('  function createFrameBudget()'),end = controller.indexOf('  // End of the pure frame-budget');
assert.ok(begin > 0 && end > begin);
const budget = vm.runInNewContext('const EFFECT_FRAME_INTERVAL=1000/24;'+controller.slice(begin,end)+';createFrameBudget');
const plain = value => JSON.parse(JSON.stringify(value));
test('mobile pixel budget preserves full landscape/portrait geometry and never upscales',()=>{
 const b=budget();assert.deepEqual(plain(b.dimensions(1280,720)),{width:480,height:270});assert.deepEqual(plain(b.dimensions(720,1280)),{width:270,height:480});assert.deepEqual(plain(b.dimensions(160,120)),{width:160,height:120});
 assert.equal(480*270/(960*540),.25,'Startup readback uses one quarter of the former pixels');
});
test('slow frames shrink within bounded levels and enforce dwell time rather than resizing every frame',()=>{
 const b=budget();b.observe(90,0);assert.equal(b.snapshot().maxEdge,400);
 for(let now=100;now<1200;now+=100)b.observe(90,now);assert.equal(b.snapshot().maxEdge,400);
 b.observe(90,1200);assert.equal(b.snapshot().maxEdge,320);b.observe(90,2400);assert.equal(b.snapshot().maxEdge,240);
 for(let now=2500;now<8000;now+=100)b.observe(90,now);assert.equal(b.snapshot().maxEdge,240);assert.equal(b.snapshot().adjustments,3);assert.ok(b.snapshot().intervalMs>=189);
});
test('quality recovery requires sustained cheap frames and five seconds between upward changes',()=>{
 const b=budget();b.observe(90,0);
 for(let now=100;now<5000;now+=100)b.observe(4,now);assert.equal(b.snapshot().maxEdge,400);
 b.observe(4,5000);assert.equal(b.snapshot().maxEdge,480);
 for(let now=5100;now<10000;now+=100)b.observe(4,now);assert.equal(b.snapshot().maxEdge,480);
 b.observe(4,10000);assert.equal(b.snapshot().maxEdge,600);
 for(let now=10100;now<=20000;now+=100)b.observe(4,now);assert.equal(b.snapshot().maxEdge,720);assert.equal(b.snapshot().adjustments,4);
});
test('steady midrange work does not oscillate, and malformed samples cannot poison cadence',()=>{
 const b=budget();for(let index=0;index<300;index++)b.observe(index%2?20:28,index*50);assert.equal(b.snapshot().maxEdge,480);assert.equal(b.snapshot().adjustments,0);
 const before=plain(b.snapshot());for(const value of [NaN,Infinity,-1])b.observe(value,20000);b.observe(10,NaN);assert.deepEqual(plain(b.snapshot()),before);
 const fast=budget();for(let index=0;index<25;index++)fast.observe(1,index*40);assert.equal(fast.snapshot().maxEdge,480,'A few startup frames never trigger premature quality growth');
});

test('real canvas scheduling adapts, recovers and cleans up without repeating stalled camera frames',async()=>{
 const server=http.createServer((_request,response)=>response.end('<!doctype html><body></body>'));server.listen(0,'127.0.0.1');await once(server,'listening');let browser;
 const errors=[];
 try{
  browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required'],...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
  async function open(source=controller,fallback=false,manual=false){
   const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));await page.route('https://**/*',route=>route.abort());await page.goto(`http://127.0.0.1:${server.address().port}`);
   await page.addScriptTag({content:fs.readFileSync(path.join(root,'node_modules/facebetter/dist/facebetter.js'),'utf8')});await page.addScriptTag({content:fs.readFileSync(path.join(root,'web/beauty-catalog.js'),'utf8')});
   await page.evaluate(({fallback,manual})=>{
    if(fallback){HTMLVideoElement.prototype.requestVideoFrameCallback=undefined;CanvasCaptureMediaStreamTrack.prototype.requestFrame=undefined;}
    if(manual){window.presentedCallbacks=new Map();window.callbackSequence=0;window.decodedFrame=1;HTMLVideoElement.prototype.getVideoPlaybackQuality=()=>({totalVideoFrames:decodedFrame});HTMLVideoElement.prototype.requestVideoFrameCallback=function(callback){presentedCallbacks.set(++callbackSequence,callback);return callbackSequence};HTMLVideoElement.prototype.cancelVideoFrameCallback=id=>presentedCallbacks.delete(id);window.deliverFrame=fresh=>{if(fresh)decodedFrame++;const callbacks=[...presentedCallbacks.values()];presentedCallbacks.clear();for(const callback of callbacks)callback(performance.now(),{presentedFrames:decodedFrame+1000})};}
    window.S={bsel:{Beauty:1,Makeup:0,Sticker:0,Filters:0,'Image quality':0}};window.BEAUTY=Object.fromEntries(Object.keys(S.bsel).map(key=>[key,Array(6)]));window.DEMO=false;
    window.ZIMI_FACEBETTER_RUNTIME='https://runtime.example.test/';window.ZimiMedia={refreshBeauty:async()=>{}};
    window.Native={handlers:{},on(type,handler){(this.handlers[type]||=[]).push(handler)},send(type,data){if(type==='beauty.auth')queueMicrotask(()=>this.handlers[type].forEach(handler=>handler({requestId:data.requestId,licenseToken:'synthetic-performance-fixture'})))}};
    window.engines=[];window.delayOverride=null;window.requestedFrames=0;
    const request=CanvasCaptureMediaStreamTrack.prototype.requestFrame;
    if(request)CanvasCaptureMediaStreamTrack.prototype.requestFrame=function(){requestedFrames++;return request.call(this)};
    class Engine{
     constructor(){this.destroyed=false;this.attempts=0;this.samples=[];this.calls=[];engines.push(this);return new Proxy(this,{get:(target,key)=>key in target?target[key]:(...args)=>target.calls.push({name:key,args})})}
     async setLogConfig(){}async init(){this.initialized=true}setCallbacks(callbacks){this.callbacks=callbacks}
     processImage(input,width,height){this.attempts++;if(window.processingError)throw Object.assign(new Error('Synthetic invalid license'),{code:-3});if(this.destroyed)throw Error('Destroyed engine processed');const started=performance.now(),delay=window.delayOverride??4+width*height/7000;while(performance.now()-started<delay){}const result=new ImageData(new Uint8ClampedArray(input.data),width,height);this.samples.push({width,height,cost:performance.now()-started});return result}
     destroy(){this.destroyed=true;this.initialized=false}
    }
    Facebetter.BeautyEffectEngine=Engine;
    window.rawStreams=[];window.sourceTick=0;window.sourceCanvas=document.createElement('canvas');sourceCanvas.width=1280;sourceCanvas.height=720;
    window.paintSource=()=>{const p=sourceCanvas.getContext('2d');p.fillStyle='#773366';p.fillRect(0,0,sourceCanvas.width,sourceCanvas.height);p.fillStyle='#ff0000';p.fillRect(0,0,sourceCanvas.width/4,sourceCanvas.height);p.fillStyle='#0000ff';p.fillRect(sourceCanvas.width*3/4,0,sourceCanvas.width/4,sourceCanvas.height);p.fillStyle=sourceTick++%2?'#00ff00':'#ffff00';p.fillRect(sourceCanvas.width/2,0,4,sourceCanvas.height)};paintSource();
    window.sourceTimer=setInterval(paintSource,40);window.audioContext=new AudioContext();const destination=audioContext.createMediaStreamDestination();window.raw=new MediaStream([...sourceCanvas.captureStream(30).getVideoTracks(),...destination.stream.getAudioTracks()]);rawStreams.push(raw);
    window.finish=async()=>{clearInterval(sourceTimer);ZimiBeauty.stop();rawStreams.forEach(stream=>stream.getTracks().forEach(track=>track.stop()));await audioContext.close()};
    window.readColors=async()=>{const video=document.createElement('video');video.muted=true;video.srcObject=handle.stream;await video.play();const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;const paint=canvas.getContext('2d');paint.drawImage(video,0,0);const left=[...paint.getImageData(0,Math.floor(canvas.height/2),1,1).data],right=[...paint.getImageData(canvas.width-1,Math.floor(canvas.height/2),1,1).data];video.pause();video.srcObject=null;return{left:left.slice(0,3),right:right.slice(0,3)}};
   },{fallback,manual});
   await page.addScriptTag({content:source});await page.evaluate(async()=>{window.handle=await ZimiBeauty.create(raw);if(!handle)throw Error('Synthetic processor could not start: '+ZimiBeauty.getState().status);window.outputId=handle.stream.getVideoTracks()[0].id});return page;
  }
  const legacy=`  function createFrameBudget(){let costMs=0,samples=0;return{dimensions(width,height){const scale=Math.min(1,960/Math.max(width,height));return{width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))}},observe(cost){costMs=samples++?costMs*.75+cost*.25:cost},snapshot(){return{maxEdge:960,costMs,intervalMs:Math.max(1000/24,costMs*2),samples,adjustments:0}}};}\n`;
  const baseline=controller.slice(0,begin)+legacy+controller.slice(end),benchmark=[];
  for(const [name,source]of [['legacy960Policy',baseline],['adaptivePolicy',controller]]){
   const page=await open(source);await page.evaluate(()=>{window.startFrames=engines[0].samples.length;window.startTime=performance.now()});await page.waitForTimeout(1800);
   benchmark.push(await page.evaluate(name=>{const stats=handle.getPerformance(),samples=engines[0].samples.slice(startFrames),costs=samples.map(sample=>sample.cost).sort((a,b)=>a-b);return{name,elapsedMs:performance.now()-startTime,newProcessedFrames:samples.length,medianCostMs:costs[Math.floor(costs.length/2)],width:stats.width,height:stats.height,measuredFps:samples.length*1000/(performance.now()-startTime)}},name));await page.evaluate(()=>finish());await page.close();
  }
  const [before,after]=benchmark;assert.ok(after.newProcessedFrames>before.newProcessedFrames*1.4,'A mobile pixel budget produces more actual new frames under area-dependent CPU pressure');assert.ok(after.medianCostMs<before.medianCostMs*.65);assert.ok(after.width*after.height<=480*270);
  const page=await open();await page.evaluate(()=>{window.delayOverride=55;window.initialOutput=handle.stream.getVideoTracks()[0];window.initialAudio=raw.getAudioTracks()[0];ZimiBeauty.setParam('smoothing',.27);ZimiBeauty.setParam('filterId','natural')});
  await page.waitForFunction(()=>handle.getPerformance().maxEdge<=320);const slow=await page.evaluate(()=>({stats:handle.getPerformance(),output:handle.stream.getVideoTracks()[0]===initialOutput,audio:handle.stream.getAudioTracks()[0]===initialAudio,rawWidth:raw.getVideoTracks()[0].getSettings().width}));assert.equal(slow.output,true);assert.equal(slow.audio,true);assert.equal(slow.rawWidth,1280);
  await page.evaluate(()=>{window.lowEdge=handle.getPerformance().maxEdge;window.delayOverride=2});await page.waitForFunction(()=>handle.getPerformance().maxEdge>lowEdge,{},{timeout:9000});
  const recovered=await page.evaluate(()=>({stats:handle.getPerformance(),params:ZimiBeauty.getParams(),output:handle.stream.getVideoTracks()[0]===initialOutput,engine:engines.length,manual:requestedFrames}));assert.equal(recovered.output,true);assert.equal(recovered.engine,1);assert.equal(recovered.params.smoothing,.27);assert.equal(recovered.params.filterId,'natural');assert.equal(recovered.manual,recovered.stats.frames,'One explicit output frame corresponds to one successful fresh processed frame');
  const colors=await page.evaluate(()=>readColors());assert.ok(colors.left[0]>240&&colors.left[2]<15&&colors.right[2]>240&&colors.right[0]<15,'Both original outer edges remain visible after adaptive resizing');
  await page.evaluate(()=>{clearInterval(sourceTimer);sourceCanvas.width=720;sourceCanvas.height=1280;sourceTimer=setInterval(paintSource,40)});await page.waitForFunction(()=>engines[0].samples.at(-1).height>engines[0].samples.at(-1).width);assert.equal(await page.evaluate(()=>handle.stream.getVideoTracks()[0].id),await page.evaluate(()=>outputId));
  await page.evaluate(()=>clearInterval(sourceTimer));await page.waitForTimeout(150);const paused=await page.evaluate(()=>handle.getPerformance().frames);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>handle.getPerformance().frames),paused,'A stalled source adds no duplicate processed frames while audio stays live');
  await page.evaluate(()=>{sourceTimer=setInterval(paintSource,40);window.processingError=true});await page.waitForFunction(()=>ZimiBeauty.getState().status==='error');assert.match(await page.evaluate(()=>ZimiBeauty.getState().message),/license/i,'Adaptive scheduling never disguises license failure as disabled effects');const failedAttempts=await page.evaluate(()=>engines[0].attempts);await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>engines[0].attempts),failedAttempts,'A failed processor stops scheduling while media prepares its fallback');
  await page.evaluate(()=>{ZimiBeauty.stop();window.stoppedFrames=engines[0].samples.length});await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>engines[0].samples.length),await page.evaluate(()=>stoppedFrames));assert.equal(await page.evaluate(()=>raw.getTracks().every(track=>track.readyState==='live')),true);assert.equal(await page.evaluate(()=>engines[0].destroyed),true);await page.evaluate(()=>finish());await page.close();
  const manual=await open(controller,false,true);assert.equal(await manual.evaluate(()=>handle.getPerformance().frames),1,'Startup publishes one first frame');await manual.evaluate(()=>{window.delayOverride=1;deliverFrame(false)});await manual.waitForTimeout(80);assert.equal(await manual.evaluate(()=>handle.getPerformance().frames),1,'An initial callback for the same decoded frame is not processed twice');await manual.evaluate(()=>deliverFrame(true));await manual.waitForTimeout(80);assert.equal(await manual.evaluate(()=>handle.getPerformance().frames),2);await manual.evaluate(()=>{window.delayOverride=20;deliverFrame(true);window.burstFrames=handle.getPerformance().frames;deliverFrame(true);deliverFrame(true)});await manual.waitForTimeout(90);assert.equal(await manual.evaluate(()=>handle.getPerformance().frames),await manual.evaluate(()=>burstFrames+1),'A bounded timer processes only the latest fresh frame rather than a queued backlog');await manual.evaluate(()=>{window.lateCallback=[...presentedCallbacks.values()][0];ZimiBeauty.stop();lateCallback(performance.now(),{presentedFrames:9999})});await manual.waitForTimeout(70);assert.equal(await manual.evaluate(()=>engines[0].samples.length),await manual.evaluate(()=>burstFrames+1));assert.equal(await manual.evaluate(()=>presentedCallbacks.size),0,'Stop cancels source callbacks and ignores stale delivery');await manual.evaluate(()=>finish());await manual.close();
  const fallback=await open(controller,true);await fallback.waitForFunction(()=>engines[0].samples.length>=3);assert.equal(await fallback.evaluate(()=>handle.getPerformance().frameCallbacks),false);assert.equal(await fallback.evaluate(()=>handle.stream.getVideoTracks()[0].readyState),'live');await fallback.evaluate(()=>finish());await fallback.close();
  assert.deepEqual(errors,[]);
  const dir=path.join(root,'artifacts/facebetter-performance');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'controlled-policy-benchmark.json'),JSON.stringify({kind:'Controlled area-cost mock engine, not licensed SDK throughput',benchmark},null,2));console.log('Controlled policy benchmark:',JSON.stringify(benchmark));
 }finally{await browser?.close();server.close();}
});
