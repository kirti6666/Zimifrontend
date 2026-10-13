/* Local WebRTC integration: browser fake devices are enabled only in this test.
   No server account, payment, or production camera is used. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source = fs.readFileSync(path.join(__dirname, '../web/media.js'), 'utf8');
const receive = (page, type, data) => page.evaluate(({ type, data }) => { if(type==='stream.signal') window.streamSignals=(window.streamSignals||0)+1; Native.receive(type, data); }, { type, data });

(async () => {
  const server = http.createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end('<div id="screen"><video data-zimi-local autoplay muted playsinline></video><video data-zimi-remote autoplay playsinline></video><p data-zimi-media-status></p></div>');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
    const context = await browser.newContext();
    const pages = { host: await context.newPage(), viewer: await context.newPage() };
    const errors = [], messages = [];
    for (const [id, page] of Object.entries(pages)) {
      page.on('pageerror', error => errors.push(error.message));
      await page.exposeFunction('sendNative', async (type, data = {}) => {
        messages.push({ id, type, data });
        if (type === 'rtc.config') return receive(page, type, { iceServers: [] });
        if (type === 'stream.ready' && id === 'viewer') return receive(pages.host, 'stream.peer', { streamId: data.streamId, userId: id });
        if (type === 'rtc.signal' || type === 'stream.signal') {
          // Deliver ICE before its description to exercise the candidate queue.
          if (data.description) await new Promise(resolve => setTimeout(resolve, 50));
          return receive(pages[id === 'host' ? 'viewer' : 'host'], type, { ...data, from: id });
        }
      });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.addScriptTag({ content: `
        const DEMO=false, Home={}, S={v:'home',mic:1,cam:1,scam:1};
        const Native={handlers:{},send(type,data){window.sendNative(type,data)},on(type,fn){(this.handlers[type]||=[]).push(fn)},receive(type,data){(this.handlers[type]||[]).forEach(fn=>fn(data))}};
        const camOn=()=>S.cam, appNotice=message=>{window.lastNotice=message};
        window.captureCount=0; window.tracks=[];
        const acquire=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia=async constraints=>{window.captureCount++;const stream=await acquire(constraints);window.tracks.push(...stream.getTracks());return stream};
      ` });
      await page.addScriptTag({ content: source });
    }
    assert.equal(await pages.host.evaluate(() => captureCount), 0, 'Seeing Home does not acquire camera or microphone');
    await pages.host.evaluate(async () => { S.v='broadcast'; await ZimiMedia.prepare(true); S.v='live'; await ZimiMedia.openStream({id:'live-one',hostId:'host'},true); });
    await pages.viewer.evaluate(() => { S.v='live';Home.stream={id:'live-one'}; });
    await receive(pages.host, 'stream.peer', {streamId:'live-one',userId:'viewer'});
    await pages.viewer.waitForFunction(() => window.streamSignals>0);
    await pages.viewer.evaluate(async () => { S.v='live'; await ZimiMedia.openStream({id:'live-one',hostId:'host'},false); });
    await pages.viewer.waitForFunction(() => document.querySelector('[data-zimi-remote]').readyState >= 2, { timeout: 15000 });
    assert.equal(await pages.viewer.evaluate(() => captureCount), 0, 'Watching a stream never requests viewer camera or microphone');
    assert.ok(messages.some(message => message.type === 'stream.signal' && message.data.description?.type === 'offer'));
    assert.ok(messages.some(message => message.type === 'stream.signal' && message.data.description?.type === 'answer'));
    assert.equal(await pages.host.evaluate(() => captureCount), 1);
    await pages.host.evaluate(() => { document.getElementById('screen').innerHTML='<video data-zimi-local autoplay muted playsinline></video><video data-zimi-remote autoplay playsinline></video>'; });
    await pages.host.waitForFunction(() => !!document.querySelector('[data-zimi-local]').srcObject);
    assert.equal(await pages.host.evaluate(() => captureCount), 1, 'Rerenders reuse the existing media stream');
    const readyCount=messages.filter(message=>message.id==='viewer'&&message.type==='stream.ready').length;
    await receive(pages.viewer, 'realtime.status', {connected:false});
    await receive(pages.viewer, 'realtime.status', {connected:true});
    assert.equal(messages.filter(message=>message.id==='viewer'&&message.type==='stream.ready').length,readyCount+1,'Socket reconnection reannounces stream readiness');
    await Promise.all(Object.values(pages).map(page => page.evaluate(() => { S.v='home'; document.dispatchEvent(new Event('aurora:navigate')); })));
    assert.equal(await pages.host.evaluate(() => tracks.every(track => track.readyState === 'ended')), true, 'Navigation stops broadcast capture');
    assert.equal(await pages.viewer.evaluate(() => document.querySelector('[data-zimi-remote]').srcObject), null);

    await Promise.all(Object.values(pages).map(page => page.evaluate(async () => { S.v='precall'; await ZimiMedia.prepare(true); S.v='call'; })));
    await receive(pages.viewer, 'call.connected', { callId: 'call-one', initiator: false, peerId: 'host', voice: false });
    await receive(pages.host, 'call.connected', { callId: 'call-one', initiator: true, peerId: 'viewer', voice: false });
    await Promise.all(Object.values(pages).map(page => page.waitForFunction(() => document.querySelector('[data-zimi-remote]').readyState >= 2, { timeout: 15000 })));
    await pages.host.evaluate(() => { S.mic=0; S.cam=0; ZimiMedia.attach(); });
    assert.equal(await pages.host.evaluate(() => document.querySelector('[data-zimi-local]').srcObject.getTracks().every(track => !track.enabled)), true, 'Mute and camera controls affect transmitted tracks');
    await Promise.all(Object.values(pages).map(page => receive(page, 'call.ended', {callId:'call-one'})));
    assert.equal(await pages.host.evaluate(() => tracks.every(track => track.readyState === 'ended')), true);
    assert.equal(await pages.viewer.evaluate(() => tracks.every(track => track.readyState === 'ended')), true);

    await Promise.all(Object.values(pages).map(page => page.evaluate(async () => { S.v='precall'; S.mic=1;await ZimiMedia.prepare(false);S.v='voice';document.getElementById('screen').innerHTML='<audio data-zimi-remote autoplay></audio>'; })));
    await receive(pages.viewer,'call.connected',{callId:'voice-one',initiator:false,peerId:'host',voice:true});
    await receive(pages.host,'call.connected',{callId:'voice-one',initiator:true,peerId:'viewer',voice:true});
    await Promise.all(Object.values(pages).map(page=>page.waitForFunction(()=>document.querySelector('audio').readyState>=2,{timeout:15000})));
    assert.equal(await pages.host.evaluate(()=>tracks.filter(track=>track.readyState==='live'&&track.kind==='video').length),0,'Voice calls do not capture video');
    await Promise.all(Object.values(pages).map(page=>receive(page,'call.ended',{callId:'voice-one'})));
    await pages.host.evaluate(async()=>{S.v='precall';await ZimiMedia.prepare(false);S.v='dial';});
    await receive(pages.host,'call.created',{callId:'unanswered',to:'viewer',voice:true});
    await pages.host.evaluate(()=>{S.v='precall';document.dispatchEvent(new Event('aurora:navigate'));});
    await receive(pages.host,'call.ended',{callId:'unanswered'});
    assert.equal(await pages.host.evaluate(()=>tracks.every(track=>track.readyState==='ended')),true,'An unanswered call releases prepared capture before reconnecting');

    const cancelled = await pages.host.evaluate(async () => {
      S.v='broadcast';
      const original=navigator.mediaDevices.getUserMedia;
      let release;
      navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await original(constraints);await new Promise(resolve=>{release=resolve});return stream};
      const pending=ZimiMedia.prepare(true).then(()=>false,()=>true);
      while(!release) await new Promise(resolve=>setTimeout(resolve,10));
      S.v='home';document.dispatchEvent(new Event('aurora:navigate'));release();
      const rejected=await pending;
      navigator.mediaDevices.getUserMedia=original;
      return {rejected,stopped:tracks.every(track=>track.readyState==='ended')};
    });
    assert.deepEqual(cancelled, {rejected:true,stopped:true}, 'Leaving during a permission request stops late-arriving tracks');
    const denied = await pages.host.evaluate(async () => {
      navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Permission denied','NotAllowedError')};
      try {await ZimiMedia.prepare(true);return ''} catch(error){return error.message}
    });
    assert.match(denied, /Allow access in your device settings/);
    assert.deepEqual(errors, [], 'The browser has no uncaught errors');
    console.log('Home media: early stream startup, stream reconnect, video/voice calls, early ICE, mute/camera, rerender reuse, no viewer capture, unanswered call cleanup, cancellation and permission errors passed.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode=1; });
