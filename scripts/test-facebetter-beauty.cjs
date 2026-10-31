/* Real browser video/canvas/audio with the pinned SDK exports and a mocked
   engine/auth edge. No account, camera, or Facebetter service is contacted. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const wrapper = fs.readFileSync(path.join(root, 'node_modules/facebetter/dist/facebetter.js'), 'utf8');
const source = fs.readFileSync(path.join(root, 'web/beauty.js'), 'utf8')
  .replace(/__FB_EFFECT_[a-z0-9_]+__/g, Buffer.from([70, 66, 68, 1]).toString('base64'));

(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    if (req.url.startsWith('/ui')) { res.end(fs.readFileSync(path.join(root, 'dist/index.html'))); return; }
    res.end('<body><p data-zimi-beauty-status></p><button data-zimi-beauty-retry hidden>Retry effects</button></body>');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
    const context = await browser.newContext(), errors = [];
    async function fixture(saved) {
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.evaluate(saved => { localStorage.clear(); if (saved) localStorage.setItem('zimi.beauty.v1', JSON.stringify(saved)); }, saved);
      await page.addScriptTag({ content: wrapper });
      await page.addScriptTag({ content: `
        const DEMO=false;
        const BEAUTY={Beauty:Array(6),Makeup:Array(6),Sticker:Array(6),Filters:Array(6),'Image quality':Array(6)};
        const S={bsel:{Beauty:1,Makeup:0,Sticker:0,Filters:0,'Image quality':0}};
        window.sent=[];window.engines=[];window.refreshes=0;window.ZIMI_FACEBETTER_RUNTIME='https://runtime.example.test/facebetter/';
        const Native={handlers:{},send(type,data){sent.push({type,data})},on(type,fn){(this.handlers[type]||=[]).push(fn)},receive(type,data){(this.handlers[type]||[]).forEach(fn=>fn(data))}};
        window.ZimiMedia={refreshBeauty:async()=>{refreshes++}};
        class Engine{
          constructor(config){this.config=config;this.calls=[];this.destroyed=false;this.processed=0;engines.push(this)}
          setCallbacks(callbacks){if(!this.initialized)throw new Error('Real SDK requires init before setCallbacks');this.callbacks=callbacks}
          async setLogConfig(options){this.logOptions=options}
          async init(options){this.options=options;if(window.delayInit)await new Promise(resolve=>window.finishInit=resolve);this.initialized=true}
          processImage(video,width,height,frame,mirror){
            if(window.failProcess)throw new Error('Test processing failed');
            this.processed++;this.lastProcess={width,height,frame,mirror};
            const data=new ImageData(width,height);for(let i=0;i<data.data.length;i+=4){data.data[i+1]=255;data.data[i+3]=255}return data;
          }
          destroy(){this.destroyed=true}
        }
        for(const name of ['setBeautySkinOnly','setSmoothingStyle','setSmoothing','setWhitening','setClarity','setReshape','setLipstick','setLipstickColor','setFilter','clearFilter','setFilterIntensity','setSticker','clearSticker','setColorTemperature','setColorTint','setBrightness','setSaturation','setContrast'])Engine.prototype[name]=function(...args){this.calls.push([name,...args.map(value=>value instanceof Uint8Array?[...value]:value)])};
        window.Facebetter.BeautyEffectEngine=Engine;
        window.lastCall=name=>engines.at(-1).calls.filter(call=>call[0]===name).at(-1);
        window.makeSource=()=>{
          const canvas=document.createElement('canvas');canvas.width=160;canvas.height=120;
          const paint=canvas.getContext('2d');paint.fillStyle='#ff0000';paint.fillRect(0,0,160,120);
          window.sourceTimer=setInterval(()=>paint.fillRect(0,0,160,120),40);
          window.audioContext=new AudioContext();const destination=audioContext.createMediaStreamDestination();
          window.raw=new MediaStream([...canvas.captureStream(24).getVideoTracks(),...destination.stream.getAudioTracks()]);return raw;
        };
        window.begin=()=>{window.job=ZimiBeauty.create(makeSource());window.job.then(value=>window.handle=value)};
        window.authorize=()=>Native.receive('beauty.auth',{requestId:sent.at(-1).data.requestId,licenseToken:'signed-license-fixture'});
        window.pixel=async()=>{const video=document.createElement('video');video.muted=true;video.srcObject=handle.stream;await video.play();const canvas=document.createElement('canvas');canvas.width=canvas.height=1;canvas.getContext('2d').drawImage(video,0,0,1,1);const pixel=[...canvas.getContext('2d').getImageData(0,0,1,1).data];video.pause();video.srcObject=null;return pixel};
      ` });
      await page.addScriptTag({ content: source });
      return page;
    }

    const page = await fixture();
    assert.equal(await page.evaluate(() => { ZimiBeauty.sync(); return sent.length; }), 0, 'Opening/changing settings does not authorize or capture');
    await page.evaluate(() => begin());
    assert.equal(await page.evaluate(() => sent.length), 1);
    assert.equal(await page.evaluate(() => { Native.receive('beauty.auth', { requestId: 999, licenseToken: 'wrong' }); return engines.length; }), 0, 'An unrelated license reply cannot initialize the engine');
    await page.evaluate(() => authorize()); await page.waitForFunction(() => !!window.handle);
    assert.deepEqual(await page.evaluate(() => ({ token: engines[0].config.licenseToken, log: engines[0].logOptions, wasm: engines[0].options.wasmUrl, assets: engines[0].options.assetBaseUrl, mirror: engines[0].lastProcess.mirror, frame: engines[0].lastProcess.frame, audio: handle.stream.getAudioTracks()[0] === raw.getAudioTracks()[0], ready: ZimiBeauty.getState().status })), {
      token: 'signed-license-fixture', log: { consoleEnabled: false, fileEnabled: false, level: 4 }, wasm: 'https://runtime.example.test/facebetter/facebetter-core.js', assets: 'https://runtime.example.test/facebetter/', mirror: 0, frame: 1, audio: true, ready: 'ready'
    });
    assert.deepEqual(await page.evaluate(() => pixel()), [0, 255, 0, 255], 'The output stream contains processed pixels');
    assert.deepEqual(await page.evaluate(() => lastCall('setSmoothing')), ['setSmoothing', 0.6]);
    await page.evaluate(() => ZimiBeauty.setStrength('Beauty', 1, 35));
    assert.deepEqual(await page.evaluate(() => lastCall('setSmoothing')), ['setSmoothing', 0.35]);
    await page.evaluate(() => { S.bsel.Beauty=5;S.bsel.Makeup=2;S.bsel.Filters=1;S.bsel.Sticker=1;S.bsel['Image quality']=5;ZimiBeauty.sync(); });
    assert.deepEqual(await page.evaluate(() => ({ smooth:lastCall('setSmoothing'),face:lastCall('setReshape'),lip:lastCall('setLipstickColor'),expectedLip:Facebetter.LipstickColor.CoralOrange,filter:lastCall('setFilter'),sticker:lastCall('setSticker'),contrast:lastCall('setContrast') })), {
      smooth:['setSmoothing',0],face:['setReshape',0,0.3],lip:['setLipstickColor',3],expectedLip:3,filter:['setFilter',[70,66,68,1]],sticker:['setSticker',[70,66,68,1]],contrast:['setContrast',0.24]
    });
    assert.equal(await page.evaluate(async () => await ZimiBeauty.create(raw) === handle), true, 'Repeated settings refreshes reuse the engine');
    const off = await page.evaluate(async () => {
      const output=handle.stream.getVideoTracks()[0];handle.setEnabled(false);
      const muted=!raw.getVideoTracks()[0].enabled&&!output.enabled&&raw.getAudioTracks()[0].enabled;
      handle.setEnabled(true);S.bsel={Beauty:0,Makeup:0,Sticker:0,Filters:0,'Image quality':0};ZimiBeauty.reset();
      const noProcessor=await ZimiBeauty.create(raw)===null;handle.destroy();
      return {muted,noProcessor,rawLive:raw.getTracks().every(track=>track.readyState==='live'),outputStopped:output.readyState==='ended',engineDestroyed:engines[0].destroyed,filter:lastCall('clearFilter'),sticker:lastCall('clearSticker')};
    });
    assert.deepEqual(off,{muted:true,noProcessor:true,rawLive:true,outputStopped:true,engineDestroyed:true,filter:['clearFilter'],sticker:['clearSticker']});
    await page.close();

    const persisted = await fixture({selection:{Beauty:99,Makeup:-1,Sticker:2,Filters:1.5,'Image quality':3},strengths:{'Beauty:1':20,'Sticker:2':Infinity,'Image quality:3':150}});
    assert.deepEqual(await persisted.evaluate(() => ({selection:S.bsel,strength:ZimiBeauty.strength('Beauty',1),invalid:ZimiBeauty.strength('Image quality',3),requests:sent.length})), {selection:{Beauty:1,Makeup:0,Sticker:2,Filters:0,'Image quality':3},strength:20,invalid:60,requests:0});
    await persisted.close();

    const authFailure = await fixture();
    await authFailure.evaluate(() => begin());
    assert.equal(await authFailure.evaluate(async () => { Native.receive('operation.error',{action:'beauty.auth',requestId:sent[0].data.requestId,message:'Backend disabled'});return await job; }), null);
    assert.deepEqual(await authFailure.evaluate(() => ({status:ZimiBeauty.getState().status,raw:raw.getTracks().every(track=>track.readyState==='live'),retry:!document.querySelector('[data-zimi-beauty-retry]').hidden})), {status:'error',raw:true,retry:true});
    await authFailure.evaluate(() => { ZimiBeauty.sync();window.job=ZimiBeauty.create(raw);job.then(value=>window.handle=value); });
    await authFailure.evaluate(() => authorize());await authFailure.waitForFunction(() => !!window.handle);
    assert.equal(await authFailure.evaluate(() => sent.length),2,'Retry fetches a fresh license');
    await authFailure.evaluate(() => { ZimiBeauty.stop();raw.getTracks().forEach(track=>track.stop()); });await authFailure.close();

    const cancelled = await fixture();await cancelled.evaluate(() => begin());
    assert.equal(await cancelled.evaluate(async () => {ZimiBeauty.stop();return await job}),null);
    assert.equal(await cancelled.evaluate(() => {authorize();return engines.length}),0,'Cancellation rejects pending authorization and ignores a late token');
    assert.equal(await cancelled.evaluate(() => raw.getTracks().every(track=>track.readyState==='live')),true,'Processor cancellation never stops source audio/video');
    await cancelled.close();

    const immediate = await fixture();
    assert.deepEqual(await immediate.evaluate(async () => {begin();ZimiBeauty.stop();return {result:await job,requests:sent.length,status:ZimiBeauty.getState().status}}),{result:null,requests:0,status:'idle'},'A same-task stop prevents deferred initialization from requesting a token');
    await immediate.close();

    const late = await fixture();await late.evaluate(() => {window.delayInit=true;begin()});await late.evaluate(() => authorize());await late.waitForFunction(() => !!window.finishInit);
    await late.evaluate(() => {ZimiBeauty.stop();finishInit()});
    assert.deepEqual(await late.evaluate(async () => ({result:await job,destroyed:engines[0].destroyed,status:ZimiBeauty.getState().status,rawLive:raw.getTracks().every(track=>track.readyState==='live')})),{result:null,destroyed:true,status:'idle',rawLive:true});
    await late.close();

    const resetPending = await fixture();await resetPending.evaluate(() => {window.delayInit=true;begin()});await resetPending.evaluate(() => authorize());await resetPending.waitForFunction(() => !!window.finishInit);
    await resetPending.evaluate(() => {S.bsel={Beauty:0,Makeup:0,Sticker:0,Filters:0,'Image quality':0};ZimiBeauty.reset();finishInit()});
    assert.deepEqual(await resetPending.evaluate(async () => ({result:await job,destroyed:engines[0].destroyed,rawLive:raw.getTracks().every(track=>track.readyState==='live')})),{result:null,destroyed:true,rawLive:true},'Reset while initializing discards the late processor');
    await resetPending.close();

    const failure = await fixture();await failure.evaluate(() => begin());await failure.evaluate(() => authorize());await failure.waitForFunction(() => !!window.handle);
    await failure.evaluate(() => {window.failProcess=true});await failure.waitForFunction(() => ZimiBeauty.getState().status==='error');
    assert.equal(await failure.evaluate(() => refreshes>0&&raw.getTracks().every(track=>track.readyState==='live')),true,'Processing failure requests fallback and preserves the original camera and microphone');
    await failure.evaluate(() => {window.failedHandle=handle;window.failProcess=false;ZimiBeauty.sync();window.job=ZimiBeauty.create(raw);job.then(value=>window.handle=value)});
    await failure.evaluate(() => authorize());await failure.waitForFunction(() => handle&&handle!==failedHandle);
    assert.deepEqual(await failure.evaluate(() => ({engines:engines.length,ready:ZimiBeauty.getState().status,oldFailed:failedHandle.failed,fresh:handle.engine!==failedHandle.engine,rawLive:raw.getTracks().every(track=>track.readyState==='live')})),{engines:2,ready:'ready',oldFailed:true,fresh:true,rawLive:true},'Retry replaces a failed processor with a fresh initialized engine');
    await failure.evaluate(() => failedHandle.destroy());
    await failure.evaluate(() => ZimiBeauty.stop());await failure.close();
    const ui = await context.newPage();
    ui.on('pageerror',error=>errors.push(error.message));
    await ui.route('https://**/*',route=>route.abort());
    await ui.goto(`http://127.0.0.1:${server.address().port}/ui?preview=call`);
    await ui.waitForFunction(()=>!!window.ZimiBeauty);
    // Mount the shipped sheet with its real handlers; keep unrelated preview
    // navigation and call timers outside this component check.
    await ui.evaluate(()=>{window.testFx=document.createElement('div');document.body.append(testFx);window.r=()=>{testFx.innerHTML=fxSheet()};S.btab='Beauty';S.bsel.Beauty=1;S.sh='fx';r()});
    const sheet=ui.locator('#test-fx');
    await ui.evaluate(()=>testFx.id='test-fx');
    const slider=sheet.getByRole('slider',{name:'Smooth strength',exact:true});
    await slider.evaluate(el=>{el.value='27';el.dispatchEvent(new Event('input',{bubbles:true}))});
    assert.equal(await ui.evaluate(()=>ZimiBeauty.strength('Beauty',1)),27,'The live strength slider updates the processor setting');
    await ui.evaluate(()=>r());assert.equal(await slider.inputValue(),'27','Redrawing the sheet preserves the strength');
    await sheet.getByRole('button',{name:'Reset',exact:true}).click();
    assert.equal(await sheet.getByRole('slider').count(),0,'Reset clears selected effects and hides the adjustment');
    assert.equal(await ui.evaluate(()=>Object.values(S.bsel).every(value=>value===0)),true);
    await ui.evaluate(()=>ZimiBeauty.unavailable());
    assert.equal(await sheet.getByRole('button',{name:'Retry effects',exact:true}).isVisible(),true,'Asynchronous errors reveal Retry without reopening the sheet');
    await ui.close();
    assert.deepEqual(errors,[]);
    console.log('Facebetter processor: real processed stream pixels, pinned SDK enums, settings, strengths, reset, persistence, auth correlation/error/retry, cancellation, late-init cleanup and runtime fallback passed.');
  } finally { if(browser)await browser.close();server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
