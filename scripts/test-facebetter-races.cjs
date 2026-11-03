/* Deferred real HTTP effects with the pinned SDK API and a mock frame engine.
   Changing/resetting/stopping must not wait for obsolete optional downloads. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const wrapper = fs.readFileSync(path.join(root, 'node_modules/facebetter/dist/facebetter.js'), 'utf8');
// Exercise every effect group; test-facebetter-ui covers the shipped Basic plan.
const catalog = "window.ZIMI_FACEBETTER_PLAN='pro+';\n" + fs.readFileSync(path.join(root, 'web/beauty-catalog.js'), 'utf8');
const processor = fs.readFileSync(path.join(root, 'web/beauty.js'), 'utf8').replace(/__FB_EFFECT_[a-z0-9_]+__/g, Buffer.from('embedded-effect').toString('base64'));

(async () => {
  const gates = new Map(), errors = [];
  const server = http.createServer((req, res) => {
    const gate = gates.get(req.url);
    if (gate) { gate.responses.push(res); gate.requested(); return; }
    res.setHeader('Content-Type', req.url.startsWith('/runtime/') ? 'application/octet-stream' : 'text/html');
    res.end(req.url.startsWith('/runtime/') ? 'optional-resource' : '<body><p data-zimi-beauty-status></p></body>');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  function hold(file) {
    let requested;
    const seen = new Promise(resolve => { requested = resolve; });
    const gate = { responses: [], requested, seen, release(status = 200) { gates.delete('/runtime/' + file); for (const res of this.responses) { res.statusCode = status; res.end('delayed-resource'); } } };
    gates.set('/runtime/' + file, gate); return gate;
  }
  async function fixture() {
    const page = await browser.newPage();
    page.setDefaultTimeout(3000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.addScriptTag({ content: wrapper });
    await page.addScriptTag({ content: catalog });
    await page.addScriptTag({ content: `
      const DEMO=false,BEAUTY={Beauty:Array(6),Makeup:Array(6),Sticker:Array(6),Filters:Array(6),'Image quality':Array(6)};
      const S={bsel:{Beauty:0,Makeup:0,Sticker:0,Filters:0,'Image quality':0}};
      window.ZIMI_FACEBETTER_RUNTIME=location.origin+'/runtime/';window.engines=[];
      const Native={handlers:{},send(type,data){if(type==='beauty.auth')queueMicrotask(()=>this.handlers[type]?.forEach(fn=>fn({requestId:data.requestId,licenseToken:'race-license-fixture'})))},on(type,fn){(this.handlers[type]||=[]).push(fn)}};
      window.ZimiMedia={refreshBeauty:async()=>{}};
      const RealEngine=Facebetter.BeautyEffectEngine;
      class Engine {
        constructor(){this.calls=[];this.destroyed=false;engines.push(this)}
        async setLogConfig(){} async init(){} setCallbacks(){}
        processImage(input){return input} destroy(){this.destroyed=true}
      }
      for(let prototype=RealEngine.prototype;prototype;prototype=Object.getPrototypeOf(prototype))for(const name of Object.getOwnPropertyNames(prototype)){
        if(/^(set|clear|addResourcePack)/.test(name)&&!Object.hasOwn(Engine.prototype,name))Engine.prototype[name]=function(...args){if(this.destroyed)throw new Error('Setter after destroy');this.calls.push({name,args:args.map(x=>x instanceof Uint8Array?new TextDecoder().decode(x):x)})};
      }
      Facebetter.BeautyEffectEngine=Engine;
      window.lastCall=name=>engines.at(-1).calls.filter(call=>call.name===name).at(-1);
      window.start=async()=>{
        const canvas=document.createElement('canvas');canvas.width=160;canvas.height=120;
        const ctx=canvas.getContext('2d');window.sourceTimer=setInterval(()=>ctx.fillRect(0,0,160,120),40);
        window.audioContext=new AudioContext();const audio=audioContext.createMediaStreamDestination();
        window.raw=new MediaStream([...canvas.captureStream(24).getVideoTracks(),...audio.stream.getAudioTracks()]);
        ZimiBeauty.setParam('smoothing',.3);window.handle=await ZimiBeauty.create(raw);return !!handle;
      };
      window.beginUpdate=()=>{window.updateDone=false;window.updateResult=undefined;window.updateJob=ZimiBeauty.create(raw).then(value=>{updateResult=value===handle?'current':value===null?'off':'other';updateDone=true})};
      window.finish=async()=>{ZimiBeauty.stop();clearInterval(sourceTimer);raw.getTracks().forEach(track=>track.stop());await audioContext.close()};
    ` });
    await page.addScriptTag({ content: processor });
    assert.equal(await page.evaluate(() => start()), true);
    return page;
  }
  async function close(page) { await page.evaluate(() => finish()); await page.close(); }
  async function settled(page, label) { await page.waitForFunction(() => updateDone, { timeout: 1500 }); assert.equal(await page.evaluate(() => updateDone), true, label); }
  try {
    const resetGate = hold('effects/initial_heart.fbd'), reset = await fixture();
    await reset.evaluate(() => { ZimiBeauty.setParam('filterId', 'initial_heart'); beginUpdate(); }); await resetGate.seen;
    await reset.evaluate(() => ZimiBeauty.reset()); await settled(reset, 'Reset resolves an existing update before its old HTTP effect responds');
    assert.deepEqual(await reset.evaluate(() => ({ result: updateResult, status: ZimiBeauty.getState().status, enabled: ZimiBeauty.isEnabled(), smoothing: lastCall('setSmoothing').args[0], filter: handle.filter })), { result: 'off', status: 'off', enabled: false, smoothing: 0, filter: null });
    resetGate.release(503);
    await reset.waitForTimeout(50);
    assert.equal(await reset.evaluate(() => ZimiBeauty.getState().status), 'off', 'An obsolete rejection cannot turn reset into an error');
    await close(reset);

    const nextGate = hold('effects/initial_heart.fbd'), next = await fixture();
    await next.evaluate(() => { ZimiBeauty.setParam('filterId', 'initial_heart'); beginUpdate(); }); await nextGate.seen;
    await next.evaluate(() => ZimiBeauty.setParam('filterId', 'natural')); await settled(next, 'A cached latest filter applies before an obsolete effect finishes');
    assert.deepEqual(await next.evaluate(() => ({ result: updateResult, status: ZimiBeauty.getState().status, filter: handle.filter })), { result: 'current', status: 'ready', filter: 'natural' });
    nextGate.release(503); await next.waitForTimeout(50);
    assert.deepEqual(await next.evaluate(() => ({ status: ZimiBeauty.getState().status, failed: handle.failed, filter: handle.filter })), { status: 'ready', failed: false, filter: 'natural' }, 'A stale rejected selection cannot poison the latest valid selection');
    await close(next);

    const packGate = hold('resource_3d.fbd'), pack = await fixture();
    await pack.evaluate(() => { ZimiBeauty.setParam('stickerId', 'oculos'); beginUpdate(); }); await packGate.seen;
    await pack.evaluate(() => ZimiBeauty.setParam('stickerId', null)); await settled(pack, 'Deselecting a 3D sticker does not wait for its model pack');
    packGate.release(); await pack.waitForTimeout(50);
    assert.deepEqual(await pack.evaluate(() => ({ status: ZimiBeauty.getState().status, packs: engines[0].calls.filter(call => call.name === 'addResourcePack').length, sticker: handle.sticker })), { status: 'ready', packs: 0, sticker: null }, 'A late superseded pack never registers an unused SDK capability');
    await close(pack);

    const stopGate = hold('resource_body.fbd'), stop = await fixture();
    await stop.evaluate(() => { ZimiBeauty.setShape('bodyReshape', Object.keys(ZimiBeauty.getParams().bodyReshape)[0], .3); beginUpdate(); }); await stopGate.seen;
    await stop.evaluate(() => ZimiBeauty.stop()); await settled(stop, 'Stop wakes the pending effect update before its HTTP resource responds');
    stopGate.release(); await stop.waitForTimeout(50);
    assert.deepEqual(await stop.evaluate(() => ({ result: updateResult, status: ZimiBeauty.getState().status, destroyed: handle.destroyed, raw: raw.getTracks().every(track => track.readyState === 'live'), packs: engines[0].calls.filter(call => call.name === 'addResourcePack').length })), { result: 'off', status: 'idle', destroyed: true, raw: true, packs: 0 }, 'Stop keeps raw media live and rejects all late optional pack work');
    await close(stop);
    assert.deepEqual(errors, [], 'No browser or unhandled async errors');
    console.log('PASS Facebetter races: immediate reset/latest selection/stop during deferred downloads, stale rejection isolation, and obsolete model-pack cancellation.');
  } finally {
    for (const gate of gates.values()) gate.release();
    await browser.close(); server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
