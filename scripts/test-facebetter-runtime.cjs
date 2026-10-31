/* Load the exact shipped browser SDK and pinned runtime without credentials.
   Every external network request is blocked; an invalid test token exercises
   runtime startup and the vendor's normal license rejection. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const runtime = path.join(root, 'node_modules/facebetter-core/dist');
const files = {
  '/sdk.js': [path.join(root, 'node_modules/facebetter/dist/facebetter.js'), 'application/javascript'],
  '/runtime/2.2.1/facebetter-core.js': [path.join(runtime, 'facebetter-core.js'), 'application/javascript'],
  '/runtime/2.2.1/facebetter-core.wasm': [path.join(runtime, 'facebetter-core.wasm'), 'application/wasm'],
  '/runtime/2.2.1/resource.fbd': [path.join(runtime, 'resource.fbd'), 'application/octet-stream']
};

(async () => {
  const requested = [], blocked = [], errors = [], logs = [];
  const server = http.createServer((req, res) => {
    const file = files[req.url];
    if (!file) { res.setHeader('Content-Type', 'text/html');res.end('<!doctype html><body><script src="/sdk.js"></script></body>');return; }
    requested.push(req.url);
    res.setHeader('Content-Type', file[1]);
    res.setHeader('Content-Length', fs.statSync(file[0]).size);
    fs.createReadStream(file[0]).pipe(res);
  });
  server.listen(0, '127.0.0.1');await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
    const context = await browser.newContext();
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      blocked.push(route.request().url());return route.abort();
    });
    const page = await context.newPage();page.on('pageerror', error => errors.push(error.message));page.on('console',message=>logs.push(message.text()));
    await page.goto(origin);
    const result = await page.evaluate(async runtime => {
      const sdk = window.Facebetter, engine = new sdk.BeautyEffectEngine(new sdk.EngineConfig({ licenseToken: 'invalid-facebetter-runtime-smoke-token' }));
      const canvas=document.createElement('canvas');
      const webgl=!!(canvas.getContext('webgl2')||canvas.getContext('webgl'));
      const progress=[],events=[];
      let error=null, processed=null;
      try {
        await engine.setLogConfig({ consoleEnabled:false,fileEnabled:false,level:4 });
        await engine.init({ timeout:30000,wasmUrl:runtime+'facebetter-core.js',assetBaseUrl:runtime,onProgress:({percent})=>progress.push(percent) });
        engine.setCallbacks({ onEngineEvent(code,message) { events.push({code,message}); } });
        const output=engine.processImage(new ImageData(160,120),160,120,sdk.FrameType.Video,sdk.MirrorMode.None);
        processed=output?{width:output.width,height:output.height}:null;
      } catch (problem) { error={name:problem.name,code:problem.code,message:problem.message}; }
      const initialized=engine.initialized;
      engine.destroy();
      return {webgl,initialized,processed,error,events,progressReached100:progress.some(value=>value>=100)};
    }, origin+'/runtime/2.2.1/');
    for (const asset of Object.keys(files)) assert.ok(requested.includes(asset), `${asset} was loaded from the pinned local runtime`);
    assert.equal(result.webgl,true,'Browser WebGL is available');
    assert.equal(result.progressReached100,true,'WASM and resource downloads finished');
    assert.ok(result.initialized || result.error && /license|auth|engine/i.test(result.error.message), JSON.stringify(result));
    if (result.initialized) {
      await page.addScriptTag({ content: `const DEMO=false, S={bsel:{Beauty:1,Makeup:0,Sticker:0,Filters:0,'Image quality':0}}, BEAUTY={Beauty:Array(6),Makeup:Array(6),Sticker:Array(6),Filters:Array(6),'Image quality':Array(6)};
        const Native={handlers:{},on(type,handler){(this.handlers[type]||=[]).push(handler)},send(type,data){if(type==='beauty.auth')this.handlers[type].forEach(handler=>handler({requestId:data.requestId,licenseToken:'invalid-facebetter-runtime-smoke-token'}))}};
        window.ZIMI_FACEBETTER_RUNTIME=${JSON.stringify(origin+'/runtime/2.2.1/')};` });
      let controller = fs.readFileSync(path.join(root, 'web/beauty.js'), 'utf8');
      controller = controller.replace(/__FB_EFFECT_([a-z0-9_]+)__/g, (_, name) => fs.readFileSync(path.join(root, 'web/facebetter/effects', name+'.fbd')).toString('base64'));
      await page.addScriptTag({ content: controller });
      const integration = await page.evaluate(async () => {
        const sdkErrors=[];
        for(const name of ['setSticker','setFilter','setLipstick','setReshape','setBeautySkinOnly','setSmoothing','setWhitening','setClarity']){
          const original=Facebetter.BeautyEffectEngine.prototype[name];
          Facebetter.BeautyEffectEngine.prototype[name]=function(...args){try{return original.apply(this,args)}catch(error){sdkErrors.push({method:name,code:error.code,message:error.message});throw error}};
        }
        const canvas=document.createElement('canvas');canvas.width=160;canvas.height=120;
        const paint=canvas.getContext('2d');let frame=0;
        const draw=()=>{paint.fillStyle=frame++%2?'#888888':'#999999';paint.fillRect(0,0,160,120)};draw();
        const source=canvas.captureStream(12),timer=setInterval(draw,80);
        try {
          let handle=await ZimiBeauty.create(source);
          await handle?.engine.setLogConfig({consoleEnabled:true,fileEnabled:false,level:0});
          const result={handle:!!handle,state:ZimiBeauty.getState(),outputLive:!!handle&&handle.stream.getVideoTracks()[0].readyState==='live',presets:[],failures:[]};
          for(const tab of Object.keys(BEAUTY))for(let index=0;index<6;index++){
            S.bsel={Beauty:0,Makeup:0,Sticker:0,Filters:0,'Image quality':0};S.bsel[tab]=index;
            // Keep smoothing on for zero-index cases so every clearing setter
            // is exercised on a live engine rather than the all-off fast path.
            if(index===0)S.bsel.Beauty=1;
            ZimiBeauty.sync();
            const next=await ZimiBeauty.create(source);
            if(!next)result.failures.push({tab,index,state:ZimiBeauty.getState(),sdkError:sdkErrors.at(-1)});
            else {
              if(handle!==next)handle?.destroy();handle=next;
              const output=handle.engine.processImage(new ImageData(160,120),160,120,Facebetter.FrameType.Video,Facebetter.MirrorMode.None);
              if(!output||output.width!==160||output.height!==120)result.failures.push({tab,index,error:'No processed ImageData'});
              result.presets.push(tab+':'+index);
            }
          }
          handle?.destroy();result.rawSurvivesDestroy=source.getVideoTracks()[0].readyState==='live';
          return result;
        } finally {clearInterval(timer);source.getTracks().forEach(track=>track.stop());ZimiBeauty.stop()}
      });
      assert.equal(integration.handle,true,JSON.stringify(integration));
      assert.equal(integration.state.status,'ready');
      assert.equal(integration.outputLive,true);
      assert.equal(integration.rawSurvivesDestroy,true);
      const restricted=integration.failures.filter(failure=>failure.tab==='Sticker'&&failure.index>0&&failure.sdkError?.method==='setSticker'&&failure.sdkError.code===-5);
      assert.equal(restricted.length,5,'The intentionally invalid token receives Free-plan sticker restrictions');
      assert.ok(logs.some(message=>/Sticker requires Pro\+ \(plan=free\)/.test(message)),'Real SDK logging identifies the sticker refusal as a subscription gate');
      assert.deepEqual(integration.failures.filter(failure=>!restricted.includes(failure)),[],'Every other controller setter, enum preset and filter .fbd processes successfully');
      assert.equal(integration.presets.length,25);
      result.controller={status:integration.state.status,outputLive:integration.outputLive,rawSurvivesDestroy:integration.rawSurvivesDestroy,processedPresets:integration.presets.length,freePlanRestrictedStickers:restricted.length};
    }
    assert.deepEqual(errors,[]);
    assert.deepEqual(blocked,[],'Runtime startup needs no external requests or credential service');
    console.log('Facebetter actual runtime smoke:',JSON.stringify(result));
  } finally { if(browser)await browser.close();server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
