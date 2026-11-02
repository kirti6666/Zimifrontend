/* Full SDK catalog contract in Chromium, with real canvas/audio tracks and
   deterministic auth/engine/resource edges. No account or provider is used. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const runtime = '/api/v1/facebetter/runtime/2.2.1/';
const wrapper = fs.readFileSync(path.join(root, 'node_modules/facebetter/dist/facebetter.js'), 'utf8');
// Exercise every effect group; test-facebetter-ui covers the shipped Basic plan.
const catalog = "window.ZIMI_FACEBETTER_PLAN='pro+';\n" + fs.readFileSync(path.join(root, 'web/beauty-catalog.js'), 'utf8');
const controls = fs.readFileSync(path.join(root, 'web/beauty-controls.js'), 'utf8');
const processor = fs.readFileSync(path.join(root, 'web/beauty.js'), 'utf8')
  .replace(/__FB_EFFECT_([a-z0-9_]+)__/g, (_, id) => Buffer.from(`asset:effects/${id}.fbd`).toString('base64'));

(async () => {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith(runtime)) {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.end(Buffer.from(`asset:${req.url.slice(runtime.length)}`));
      return;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end('<body><p data-zimi-beauty-status></p><button data-zimi-beauty-retry hidden>Retry effects</button></body>');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let browser;
  const pageErrors = [];
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--autoplay-policy=no-user-gesture-required'],
      ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
    });
    const context = await browser.newContext();
    async function fixture(saved, brokenAsset) {
      const page = await context.newPage();
      page.on('pageerror', error => pageErrors.push(error.message));
      if (brokenAsset) await page.route(`**/${brokenAsset}`, route => route.fulfill({ status: 503, body: 'Unavailable fixture' }));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.evaluate(saved => { localStorage.clear(); if (saved) localStorage.setItem('zimi.beauty.v2', saved); }, saved);
      await page.addScriptTag({ content: wrapper });
      await page.addScriptTag({ content: catalog });
      await page.addScriptTag({ content: `
        const DEMO=false;
        const BEAUTY={Beauty:Array(6),Makeup:Array(6),Sticker:Array(6),Filters:Array(6),'Image quality':Array(6)};
        const S={bsel:{Beauty:0,Makeup:0,Sticker:0,Filters:0,'Image quality':0}};
        window.sent=[];window.engines=[];window.downloads=[];window.refreshes=0;
        window.ZIMI_FACEBETTER_RUNTIME=location.origin+'${runtime}';
        const originalFetch=window.fetch.bind(window);
        window.fetch=(url,options)=>{downloads.push({url:String(url),credentials:options?.credentials});return originalFetch(url,options)};
        const Native={handlers:{},send(type,data){sent.push({type,data});if(type==='beauty.auth')queueMicrotask(()=>Native.receive(type,{requestId:data.requestId,licenseToken:'catalog-license-fixture'}))},on(type,fn){(this.handlers[type]||=[]).push(fn)},receive(type,data){(this.handlers[type]||[]).forEach(fn=>fn(data))}};
        window.ZimiMedia={refreshBeauty:async()=>{refreshes++}};
        const RealEngine=Facebetter.BeautyEffectEngine;
        class Engine {
          constructor(config){this.config=config;this.calls=[];this.destroyed=false;this.source=window.raw;engines.push(this)}
          async setLogConfig(){}
          async init(){this.initialized=true}
          setCallbacks(callbacks){if(!this.initialized)throw new Error('Callbacks registered before init');this.callbacks=callbacks}
          processImage(input){return input}
          destroy(){this.destroyed=true}
        }
        const methods=new Set();
        for(let prototype=RealEngine.prototype;prototype;prototype=Object.getPrototypeOf(prototype))for(const method of Object.getOwnPropertyNames(prototype))if(/^(set|clear|addResourcePack)/.test(method))methods.add(method);
        for(const name of methods)if(!Object.hasOwn(Engine.prototype,name))Engine.prototype[name]=function(...args){
          this.calls.push({name,args:args.map(value=>value instanceof Uint8Array?new TextDecoder().decode(value):value)});
          if(window.failMethod===name){const error=new Error('Private provider diagnostic');error.code=window.failCode??-3;throw error}
        };
        window.Facebetter.BeautyEffectEngine=Engine;
        window.lastCall=name=>engines.at(-1).calls.filter(call=>call.name===name).at(-1);
        window.apply=async()=>{const next=await ZimiBeauty.create(raw);if(next)window.handle=next;return next!==null};
        window.start=async()=>{
          const canvas=document.createElement('canvas');canvas.width=160;canvas.height=120;
          const paint=canvas.getContext('2d');paint.fillStyle='#dd3344';paint.fillRect(0,0,160,120);
          window.sourceTimer=setInterval(()=>paint.fillRect(0,0,160,120),50);
          window.audioContext=new AudioContext();const audio=audioContext.createMediaStreamDestination();
          window.raw=new MediaStream([...canvas.captureStream(20).getVideoTracks(),...audio.stream.getAudioTracks()]);
          return apply();
        };
        window.finish=async()=>{ZimiBeauty.stop();clearInterval(window.sourceTimer);window.raw?.getTracks().forEach(track=>track.stop());await window.audioContext?.close()};
      ` });
      await page.addScriptTag({ content: processor });
      return page;
    }
    async function close(page) { await page.evaluate(() => finish()); await page.close(); }

    const page = await fixture();
    assert.deepEqual(await page.evaluate(() => {
      const owners = Object.keys(ZimiBeautyCatalog.createDefaultParams()).map(key => Object.entries(ZimiBeautyCatalog.TAB_PARAMS).filter(([, keys]) => keys.includes(key)).map(([tab]) => tab));
      return { unmapped: owners.filter(tabs => tabs.length !== 1).length, tabs: Object.keys(ZimiBeautyCatalog.TAB_PARAMS).join(), catalogTabs: ZimiBeautyCatalog.TABS.map(tab => tab.id).join() };
    }), { unmapped: 0, tabs: 'skin,color,reshape,makeup,filter,sticker,body,background', catalogTabs: 'skin,color,reshape,makeup,filter,sticker,body,background' }, 'Every SDK setting belongs to exactly one plan-gated tab');
    assert.equal(await page.evaluate(() => ZimiBeauty.isEnabled()), false, 'Original camera is the SDK default');
    assert.equal(await page.evaluate(() => { ZimiBeauty.setParam('smoothing', .35); return sent.length; }), 0, 'Choosing settings does not request a license before camera capture');
    assert.equal(await page.evaluate(() => start()), true);
    assert.deepEqual(await page.evaluate(() => ({ smoothing:lastCall('setSmoothing').args[0], agent:sent[0].data.userAgent, ready:ZimiBeauty.getState().status, audio:handle.stream.getAudioTracks()[0]===raw.getAudioTracks()[0] })), {
      smoothing:.35, agent:await page.evaluate(() => navigator.userAgent.slice(0,1024)), ready:'ready', audio:true,
    });

    const filtered = await page.evaluate(async () => {
      const results=[];
      for(const id of ZimiBeautyCatalog.FILTER_IDS){ZimiBeauty.setParam('filterId',id);await apply();results.push({id,bytes:lastCall('setFilter').args[0]})}
      const requests=downloads.length;
      await apply();await apply();
      return {results,requests,after:downloads.length,engines:engines.length,credentials:downloads.map(row=>row.credentials)};
    });
    assert.equal(filtered.results.length, 19);
    for (const row of filtered.results) assert.equal(row.bytes, `asset:effects/${row.id}.fbd`, `Correct SDK binary selected for ${row.id}`);
    assert.equal(filtered.after, filtered.requests, 'Unchanged settings reuse downloaded assets');
    assert.equal(filtered.engines, 1, 'Catalog changes reuse the initialized processor');
    assert.ok(filtered.credentials.every(value => value === 'omit'), 'Public effect assets never carry account cookies');

    const stickers = await page.evaluate(async () => {
      const results=[];
      for(const item of ZimiBeautyCatalog.STICKERS){const start=engines[0].calls.length;ZimiBeauty.setParam('stickerId',item.id);await apply();results.push({id:item.id,kind:item.kind,calls:engines[0].calls.slice(start)})}
      const start=engines[0].calls.length;ZimiBeauty.setParam('stickerId','fox');await apply();
      return {results,back:engines[0].calls.slice(start),packs:downloads.filter(row=>row.url.endsWith('resource_3d.fbd')).length};
    });
    assert.equal(stickers.results.length, 11);
    for (const row of stickers.results) assert.ok(row.calls.some(call => call.name === (row.kind === '3d' ? 'set3DSticker' : 'setSticker') && call.args[0] === `asset:effects/${row.id}.fbd`), `Correct sticker method and binary for ${row.id}`);
    const first3d = stickers.results.find(row => row.kind === '3d').calls;
    const pack3dIndex = first3d.findIndex(call => call.name === 'addResourcePack' && call.args[0] === 'asset:resource_3d.fbd');
    const clear2dIndex = first3d.findIndex(call => call.name === 'clearSticker');
    const clear3dIndex = stickers.back.findIndex(call => call.name === 'clear3DSticker');
    assert.ok(pack3dIndex >= 0 && pack3dIndex < first3d.findIndex(call => call.name === 'set3DSticker'), '3D pack is registered before applying a 3D sticker');
    assert.ok(clear2dIndex >= 0 && clear2dIndex < first3d.findIndex(call => call.name === 'set3DSticker'), 'Switching to 3D clears the 2D sticker');
    assert.ok(clear3dIndex >= 0 && clear3dIndex < stickers.back.findIndex(call => call.name === 'setSticker'), 'Switching to 2D clears the 3D sticker');
    assert.equal(stickers.packs, 1, 'The 3D model pack is downloaded once');

    const shape = await page.evaluate(async () => {
      for(const group of ZimiBeautyCatalog.RESHAPE_GROUPS)for(const item of group.items)ZimiBeauty.setShape('reshape',item.key,-.2);
      const start=engines[0].calls.length;
      for(const item of ZimiBeautyCatalog.BODY_ITEMS)ZimiBeauty.setShape('bodyReshape',item.key,.25);
      ZimiBeauty.setParam('whitening',.45);await apply();
      return {params:ZimiBeauty.getParams(),calls:engines[0].calls.slice(start),bodyPack:downloads.filter(row=>row.url.endsWith('resource_body.fbd')).length};
    });
    assert.equal(shape.params.smoothing, .35);
    assert.equal(shape.params.whitening, .45, 'Smoothing and whitening remain independently enabled');
    assert.equal(Object.values(shape.params.reshape).filter(value => value === -.2).length, 26, 'All face controls support negative adjustment');
    assert.equal(Object.values(shape.params.bodyReshape).filter(value => value === .25).length, 9);
    const bodyPackIndex = shape.calls.findIndex(call => call.name === 'addResourcePack' && call.args[0] === 'asset:resource_body.fbd');
    assert.ok(bodyPackIndex >= 0 && bodyPackIndex < shape.calls.findIndex(call => call.name === 'setBodyReshape'), 'Body pack is registered before body effects');
    assert.equal(shape.bodyPack, 1);

    const makeup = await page.evaluate(async () => {
      const specs=[['lipstick','LIPSTICK_COLORS','lipstickColor','setLipstickColor'],['blush','BLUSH_STYLES','blushStyle','setBlushStyle'],['blush','BLUSH_COLORS','blushColor','setBlushColor'],['contour','CONTOUR_STYLES','contourStyle','setContourStyle'],['eyeshadow','EYESHADOW_STYLES','eyeshadowStyle','setEyeShadowStyle'],['eyeshadow','EYESHADOW_COLORS','eyeshadowColor','setEyeShadowColor'],['eyeliner','EYELINER_STYLES','eyelinerStyle','setEyeLinerStyle'],['eyeliner','EYELINER_COLORS','eyelinerColor','setEyeLinerColor'],['eyebrow','EYEBROW_STYLES','eyebrowStyle','setEyebrowStyle'],['eyebrow','EYEBROW_COLORS','eyebrowColor','setEyebrowColor'],['eyelash','EYELASH_STYLES','eyelashStyle','setEyelashStyle'],['eyelash','EYELASH_COLORS','eyelashColor','setEyelashColor'],['pupil','PUPIL_COLORS','pupilColor','setPupilColor'],['whitening','WHITENING_STYLES','whiteningStyle','setWhiteningStyle']];
      const mismatches=[];
      for(const [intensity,group,key,method] of specs){ZimiBeauty.setParam(intensity,.31);for(const option of ZimiBeautyCatalog[group]){ZimiBeauty.setParam(key,option.id);await apply();if(lastCall(method)?.args[0]!==option.id)mismatches.push([key,option.id,lastCall(method)])}}
      for(const option of ZimiBeautyCatalog.SKIN_PRESETS){ZimiBeauty.setParam('smoothingStyle',option.smoothingStyle);await apply();if(lastCall('setSmoothingStyle')?.args[0]!==option.smoothingStyle)mismatches.push(['smoothingStyle',option.smoothingStyle])}
      for(const key of ['brightness','contrast','saturation','colorTemperature','colorTint'])ZimiBeauty.setParam(key,-.6);
      ZimiBeauty.setParam('teethWhiten',.27);await apply();
      return {mismatches,grading:['setBrightness','setContrast','setSaturation','setColorTemperature','setColorTint'].map(name=>lastCall(name).args[0]),teeth:lastCall('setTeethWhiten').args[0]};
    });
    assert.deepEqual(makeup.mismatches, [], 'Every makeup/skin style and color uses the actual pinned SDK enum');
    assert.deepEqual(makeup.grading, [-.6,-.6,-.6,-.6,-.6]);
    assert.equal(makeup.teeth, .27);

    const backgrounds = await page.evaluate(async () => {
      const results=[];
      for(const item of ZimiBeautyCatalog.BG_PRESETS){ZimiBeauty.setParam('bgPreset',item.id);await apply();results.push([item.id,lastCall('setVirtualBackground').args[0]])}
      ZimiBeauty.setParam('bgBlur',.55);await apply();const blur={preset:ZimiBeauty.getParams().bgPreset,amount:lastCall('setVirtualBackgroundBlur').args[0]};
      ZimiBeauty.setParam('bgPreset','office');await apply();const image={blur:ZimiBeauty.getParams().bgBlur,bytes:lastCall('setVirtualBackground').args[0]};
      const chroma=[];
      for(const item of ZimiBeautyCatalog.CHROMA_OPTIONS){ZimiBeauty.setParam('chroma',item.id);await apply();chroma.push([item.id,lastCall('setChromaKey').args[0]])}
      ZimiBeauty.setParam('chromaSimilarity',.62);ZimiBeauty.setParam('chromaSmoothness',.18);ZimiBeauty.setParam('chromaDesaturation',.21);ZimiBeauty.setParam('subjectOutline',true);await apply();
      const detail={similarity:lastCall('setChromaKeySimilarity').args[0],smoothness:lastCall('setChromaKeySmoothness').args[0],desaturation:lastCall('setChromaKeyDesaturation').args[0],outline:lastCall('setSubjectOutline').args[0]};
      ZimiBeauty.setParam('chroma',null);ZimiBeauty.setParam('bgPreset',null);ZimiBeauty.setParam('subjectOutline',false);await apply();
      return {results,blur,image,chroma,detail,cleared:[!!lastCall('clearChromaKey'),!!lastCall('clearVirtualBackground'),lastCall('setSubjectOutline').args[0]===false]};
    });
    assert.equal(backgrounds.results.length, 5);
    for (const [id, bytes] of backgrounds.results) assert.equal(bytes, `asset:backgrounds/${id}.jpg`);
    assert.deepEqual(backgrounds.blur, {preset:null,amount:.55});
    assert.deepEqual(backgrounds.image, {blur:0,bytes:'asset:backgrounds/office.jpg'});
    for (const [expected, actual] of backgrounds.chroma) assert.equal(actual, expected);
    assert.deepEqual(backgrounds.detail, {similarity:.62,smoothness:.18,desaturation:.21,outline:true});
    assert.deepEqual(backgrounds.cleared, [true,true,true]);
    assert.equal(await page.evaluate(() => downloads.length === new Set(downloads.map(row => row.url)).size), true, 'Reselecting effects, backgrounds and model packs reuses each downloaded resource');

    const validation = await page.evaluate(() => {
      const before=JSON.stringify(ZimiBeauty.getParams());
      for(const [key,value] of [['smoothing',-1],['whitening',2],['brightness',-2],['contrast',Infinity],['filterId','../../private'],['stickerId','forged'],['bgPreset','unknown'],['lipstickColor',999],['skinOnly','yes'],['chroma',999],['appKey','forged']])ZimiBeauty.setParam(key,value);
      ZimiBeauty.setShape('reshape',999,.5);ZimiBeauty.setShape('reshape',Facebetter.Reshape.FaceThin,-2);ZimiBeauty.setShape('bodyReshape',Facebetter.BodyReshape.BodySlim,-.1);
      const copy=ZimiBeauty.getParams();copy.smoothing=.99;copy.reshape[Facebetter.Reshape.FaceThin]=.99;
      return {unchanged:before===JSON.stringify(ZimiBeauty.getParams()),saved:localStorage.getItem('zimi.beauty.v2'),params:ZimiBeauty.getParams()};
    });
    assert.equal(validation.unchanged, true, 'Invalid parameters and caller mutation cannot alter saved settings');
    const persisted = await fixture(validation.saved);
    assert.deepEqual(await persisted.evaluate(() => ZimiBeauty.getParams()), validation.params, 'All valid simultaneous settings survive reopening');
    assert.equal(await persisted.evaluate(() => sent.length), 0, 'Restoring preferences does not authorize or open a camera');
    await close(persisted);
    const forged = await page.evaluate(() => JSON.stringify({smoothing:.42,whitening:2,filterId:'../../private',stickerId:'unknown',skinOnly:'true',lipstickColor:999,appKey:'forged',reshape:{[Facebetter.Reshape.FaceThin]:-.5,999:.2},bodyReshape:{[Facebetter.BodyReshape.BodySlim]:.3,999:1}}));
    const restored = await fixture(forged);
    assert.deepEqual(await restored.evaluate(() => {const p=ZimiBeauty.getParams();return {smoothing:p.smoothing,whitening:p.whitening,filter:p.filterId,sticker:p.stickerId,skinOnly:p.skinOnly,lipstickColor:p.lipstickColor,defaultColor:Facebetter.LipstickColor.Rouge,shape:p.reshape[Facebetter.Reshape.FaceThin],body:p.bodyReshape[Facebetter.BodyReshape.BodySlim],forged:Object.hasOwn(p,'appKey')||Object.hasOwn(p.reshape,'999')||Object.hasOwn(p.bodyReshape,'999')}}), {smoothing:.42,whitening:0,filter:null,sticker:null,skinOnly:false,lipstickColor:0,defaultColor:0,shape:-.5,body:.3,forged:false});
    await close(restored);
    await close(page);

    const failure = await fixture(undefined, 'effects/initial_heart.fbd');
    assert.deepEqual(await failure.evaluate(async () => {ZimiBeauty.setParam('smoothing',.2);ZimiBeauty.setParam('filterId','initial_heart');const ready=await start();return {ready,status:ZimiBeauty.getState().status,warning:ZimiBeauty.getState().warning,filter:ZimiBeauty.getParams().filterId,smoothing:ZimiBeauty.getParams().smoothing,raw:raw.getTracks().every(track=>track.readyState==='live'),destroyed:engines[0].destroyed,engines:engines.length,sameRaw:engines.every(engine=>engine.source===raw),retry:!document.querySelector('[data-zimi-beauty-retry]').hidden}}), {ready:true,status:'ready',warning:{effect:'filter',code:'RESOURCE_LOAD_FAILED',stage:'resource',method:'setFilter'},filter:null,smoothing:.2,raw:true,destroyed:true,engines:2,sameRaw:true,retry:false}, 'A failed optional download visibly isolates only that filter and automatically reapplies smoothing on a fresh engine with the same camera/audio');
    await close(failure);
    const licensed = await fixture();
    assert.deepEqual(await licensed.evaluate(async () => {window.failMethod='setWhitening';ZimiBeauty.setParam('whitening',.2);const ready=await start();return {ready,message:ZimiBeauty.getState().message,error:ZimiBeauty.getState().error,raw:raw.getTracks().every(track=>track.readyState==='live')}}), {ready:false,message:'Facebetter license validation failed. Retry effects. Your original camera is shared.',error:{code:-3,stage:'apply',method:'setWhitening'},raw:true}, 'SDK license-invalid -3 retains the operation and preserves source media');
    assert.deepEqual(await licensed.evaluate(()=>({effect:ZimiBeauty.getFailedEffect(),removed:ZimiBeauty.removeFailedEffect(),whitening:ZimiBeauty.getParams().whitening})),{effect:null,removed:false,whitening:.2},'Global license failures never offer selected-effect removal');
    await close(licensed);
    const resource = await fixture();
    await resource.addScriptTag({content:controls});await resource.evaluate(()=>{const picker=document.createElement('div');picker.innerHTML=ZimiBeauty.picker();document.body.append(picker);ZimiBeauty.afterRender()});
    assert.deepEqual(await resource.evaluate(async () => {window.failMethod='setFilter';window.failCode=-5;ZimiBeauty.setParam('smoothing',.35);ZimiBeauty.setParam('lipstick',.2);ZimiBeauty.setParam('stickerId','black_glass');ZimiBeauty.setParam('filterId','natural');const ready=await start();return {ready,status:ZimiBeauty.getState().status,warning:ZimiBeauty.getState().warning,raw:raw.getTracks().every(track=>track.readyState==='live'),filter:ZimiBeauty.getParams().filterId,smoothing:ZimiBeauty.getParams().smoothing,lipstick:ZimiBeauty.getParams().lipstick,sticker:ZimiBeauty.getParams().stickerId,engines:engines.length,oldDestroyed:engines[0].destroyed,sameRaw:engines.every(engine=>engine.source===raw),sameAudio:handle.stream.getAudioTracks()[0]===engines[0].source.getAudioTracks()[0]}}), {ready:true,status:'ready',warning:{effect:'filter',code:-5,stage:'apply',method:'setFilter'},raw:true,filter:null,smoothing:.35,lipstick:.2,sticker:'black_glass',engines:2,oldDestroyed:true,sameRaw:true,sameAudio:true}, 'SDK filter I/O failure retires its partial engine, retains independent skin/makeup/sticker settings and shares the same source camera/audio');
    assert.match(await resource.locator('[data-zimi-beauty-picker] [data-zimi-beauty-status]').innerText(),/selected filter could not load and was turned off.*remaining effects are applied/i);
    assert.equal(await resource.locator('[data-zimi-beauty-picker] [data-zimi-beauty-warning]').count(),1,'A live recovery warning is marked for visible wrapping without a modal');
    assert.deepEqual(await resource.evaluate(()=>({effect:ZimiBeauty.getFailedEffect(),removed:ZimiBeauty.removeFailedEffect()})),{effect:null,removed:false},'Automatic isolation leaves no stale destructive recovery action');
    assert.equal(await resource.locator('[data-zimi-filter-id=""]').getAttribute('aria-pressed'),'true','Async filter isolation immediately selects Original in the mounted rail');
    await close(resource);
    const sticker = await fixture();await sticker.addScriptTag({content:controls});
    await sticker.evaluate(()=>{ZimiBeauty.setParam('smoothing',.2);ZimiBeauty.setParam('stickerId','kiss2');ZimiBeauty.chooseTab('sticker');const picker=document.createElement('div');picker.innerHTML=ZimiBeauty.picker();document.body.append(picker);window.stickerChoice=document.querySelector('[data-zimi-beauty-option="stickerId:kiss2"]');window.noneChoice=document.querySelector('[data-zimi-beauty-option="stickerId:null"]');window.failMethod='setSticker';window.failCode=-5});
    assert.equal(await sticker.locator('[data-zimi-beauty-option="stickerId:kiss2"]').getAttribute('aria-pressed'),'true');
    assert.equal(await sticker.evaluate(()=>start()),true);
    assert.deepEqual(await sticker.evaluate(()=>({selected:ZimiBeauty.getParams().stickerId,failedPressed:stickerChoice.getAttribute('aria-pressed'),nonePressed:noneChoice.getAttribute('aria-pressed'),sameFailedNode:stickerChoice===document.querySelector('[data-zimi-beauty-option="stickerId:kiss2"]'),sameNoneNode:noneChoice===document.querySelector('[data-zimi-beauty-option="stickerId:null"]'),warning:ZimiBeauty.getState().warning.effect})),{selected:null,failedPressed:'false',nonePressed:'true',sameFailedNode:true,sameNoneNode:true,warning:'sticker'},'Async sticker isolation updates None and failed-choice pressed state in place without replacing controls');
    await close(sticker);
    const stale = await fixture();
    let releaseAsset,assetRequested;const heldAsset=new Promise(resolve=>{releaseAsset=resolve}),assetSeen=new Promise(resolve=>{assetRequested=resolve});
    await stale.route('**/effects/initial_heart.fbd',async route=>{assetRequested();await heldAsset;await route.fulfill({status:503,body:'Old resource failure'})});
    await stale.evaluate(()=>{ZimiBeauty.setParam('smoothing',.2);ZimiBeauty.setParam('filterId','initial_heart');window.pendingStart=start()});await assetSeen;
    await stale.evaluate(()=>ZimiBeauty.setParam('filterId','vivid'));assert.equal(await stale.evaluate(()=>pendingStart),true);releaseAsset();await stale.waitForTimeout(30);
    assert.deepEqual(await stale.evaluate(()=>({effect:ZimiBeauty.getFailedEffect(),removed:ZimiBeauty.removeFailedEffect(),filter:ZimiBeauty.getParams().filterId,status:ZimiBeauty.getState().status,warning:!!ZimiBeauty.getState().warning,engines:engines.length,sourceLive:raw.getTracks().every(track=>track.readyState==='live')})),{effect:null,removed:false,filter:'vivid',status:'ready',warning:false,engines:1,sourceLive:true},'A late obsolete download failure cannot isolate the newer filter or replace its healthy engine');
    await close(stale);
    const activation = await fixture();await activation.addScriptTag({content:controls});
    await activation.evaluate(()=>{ZimiBeauty.setParam('filterIntensity',0);const picker=document.createElement('div');picker.innerHTML=ZimiBeauty.picker();document.body.append(picker);ZimiBeauty.afterRender();window.beforeLens=refreshes});
    await activation.locator('[data-zimi-filter-id="natural"]').click();
    assert.deepEqual(await activation.evaluate(()=>({filter:ZimiBeauty.getParams().filterId,intensity:ZimiBeauty.getParams().filterIntensity,refreshes:refreshes-beforeLens,requests:sent.length})),{filter:'natural',intensity:.8,refreshes:1,requests:0},'Explicit lens selection atomically activates a saved0% strength without capturing or authorizing');
    assert.equal(await activation.locator('[data-zimi-beauty-param="filterIntensity"]').inputValue(),'80');
    assert.equal(await activation.locator('[data-zimi-beauty-value="filterIntensity"]').textContent(),'80%');
    await activation.evaluate(()=>{ZimiBeauty.setParam('filterIntensity',0);window.beforeLens=refreshes});await activation.locator('[data-zimi-filter-id="natural"]').click();
    assert.deepEqual(await activation.evaluate(()=>({intensity:ZimiBeauty.getParams().filterIntensity,refreshes:refreshes-beforeLens})),{intensity:.8,refreshes:1},'Re-selecting the same lens at0% also activates exactly once');
    await activation.locator('[data-zimi-beauty-tab="skin"]').click();
    await activation.evaluate(()=>{window.smoothingInput=document.querySelector('[data-zimi-beauty-param="smoothing"]');window.beforeStyle=refreshes});
    await activation.locator('[data-zimi-beauty-option^="smoothingStyle:"]').first().click();
    assert.deepEqual(await activation.evaluate(()=>({amount:ZimiBeauty.getParams().smoothing,refreshes:refreshes-beforeStyle,sameInput:smoothingInput===document.querySelector('[data-zimi-beauty-param="smoothing"]'),value:smoothingInput.value,output:document.querySelector('[data-zimi-beauty-value="smoothing"]').value,pressed:document.querySelector('[data-zimi-beauty-option^="smoothingStyle:"]').getAttribute('aria-pressed'),requests:sent.length})),{amount:.6,refreshes:1,sameInput:true,value:'60',output:'60%',pressed:'true',requests:0},'Choosing a Skin smoothing style at0% atomically activates it and updates the existing slider without capture');
    await activation.locator('[data-zimi-beauty-param="smoothing"]').evaluate(input=>{input.value='27';input.dispatchEvent(new Event('input',{bubbles:true}))});
    await activation.locator('[data-zimi-beauty-option^="smoothingStyle:"]').nth(1).click();
    assert.deepEqual(await activation.evaluate(()=>({amount:ZimiBeauty.getParams().smoothing,sameInput:smoothingInput===document.querySelector('[data-zimi-beauty-param="smoothing"]'),value:smoothingInput.value,output:document.querySelector('[data-zimi-beauty-value="smoothing"]').value})),{amount:.27,sameInput:true,value:'27',output:'27%'},'Changing Skin style preserves an existing nonzero strength and mounted dragging node');
    await activation.evaluate(()=>{window.featureRow=document.querySelector('.zb-features')});
    await activation.locator('[data-zimi-beauty-feature="whitening"]').click();
    assert.deepEqual(await activation.evaluate(()=>{
      const feature=key=>document.querySelector(`[data-zimi-beauty-feature="${key}"]`);
      window.whiteningInput=document.querySelector('[data-zimi-beauty-param="whitening"]');
      return {sameRow:featureRow===document.querySelector('.zb-features'),pressed:feature('whitening').getAttribute('aria-pressed'),sliders:[...document.querySelectorAll('[data-zimi-beauty-param]')].map(input=>input.dataset.zimiBeautyParam),smoothingDot:feature('smoothing').hasAttribute('data-active'),whiteningDot:feature('whitening').hasAttribute('data-active')};
    }),{sameRow:true,pressed:'true',sliders:['whitening'],smoothingDot:true,whiteningDot:false},'An icon swaps in its own slider without redrawing the row, and dots mark applied adjustments');
    await activation.locator('[data-zimi-beauty-option^="whiteningStyle:"]').first().click();
    assert.deepEqual(await activation.evaluate(()=>({amount:ZimiBeauty.getParams().whitening,sameInput:whiteningInput===document.querySelector('[data-zimi-beauty-param="whitening"]'),value:whiteningInput.value,output:document.querySelector('[data-zimi-beauty-value="whitening"]').value,dot:document.querySelector('[data-zimi-beauty-feature="whitening"]').hasAttribute('data-active')})),{amount:.6,sameInput:true,value:'60',output:'60%',dot:true},'Choosing a Skin whitening style at0% activates and updates the existing slider');
    await activation.evaluate(()=>{ZimiBeauty.setParam('whitening',.41);document.dispatchEvent(new CustomEvent('zimi:beauty-state'))});
    assert.deepEqual(await activation.evaluate(()=>({sameInput:whiteningInput===document.querySelector('[data-zimi-beauty-param="whitening"]'),value:whiteningInput.value,output:document.querySelector('[data-zimi-beauty-value="whitening"]').value,fill:[whiteningInput.style.getPropertyValue('--zb-from'),whiteningInput.style.getPropertyValue('--zb-to')]})),{sameInput:true,value:'41',output:'41%',fill:['0','0.41']},'Beauty state updates synchronize visible strengths and the slider fill in place');
    await close(activation);
    assert.deepEqual(pageErrors, []);
    console.log('Facebetter full catalog: 19 filters, 11 stickers, 26 face/9 body controls, makeup enums, backgrounds/chroma, resource ordering/cache, independent settings, persistence, validation and fallback passed.');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
