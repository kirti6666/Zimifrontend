/* Actual WebRTC transport with fake camera devices and a deterministic beauty
   processor. No Facebetter credentials or external services are used. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source = fs.readFileSync(path.join(__dirname, '../web/media.js'), 'utf8');
const receive = (page, type, data) => page.evaluate(({ type, data }) => Native.receive(type, data), { type, data });

(async () => {
  const server = http.createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end('<div id="screen"><video data-zimi-local autoplay muted playsinline></video><video data-zimi-remote autoplay playsinline></video></div>');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
    const context = await browser.newContext();
    const pages = { host: await context.newPage(), viewer: await context.newPage() }, errors = [];
    for (const [id, page] of Object.entries(pages)) {
      page.on('pageerror', error => errors.push(error.message));
      await page.exposeFunction('sendNative', async (type, data = {}) => {
        if (type === 'rtc.config') return receive(page, type, { iceServers: [] });
        if (type === 'rtc.signal') return receive(pages[id === 'host' ? 'viewer' : 'host'], type, { ...data, from: id });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.addScriptTag({ content: `
        const DEMO=false,Home={},S={v:'precall',mic:1,cam:1};
        const Native={handlers:{},send(type,data){window.sendNative(type,data)},on(type,fn){(this.handlers[type]||=[]).push(fn)},receive(type,data){(this.handlers[type]||[]).forEach(fn=>fn(data))}};
        const camOn=()=>S.cam, appNotice=message=>{window.lastNotice=message};
        const PeerConnection=window.RTCPeerConnection;window.peerConnections=[];
        window.RTCPeerConnection=class extends PeerConnection{constructor(...args){super(...args);peerConnections.push(this)}};
        const acquire=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);window.tracks=[];
        navigator.mediaDevices.getUserMedia=async constraints=>{
          const stream=await acquire(window.simulateCamera&&constraints.audio===false?{audio:false,video:true}:constraints);
          if(window.simulateCamera&&constraints.audio===false){const track=stream.getVideoTracks()[0],settings=track.getSettings.bind(track),mode=window.simulateCamera;track.getSettings=()=>({...settings(),facingMode:mode})}
          tracks.push(...stream.getTracks());return stream;
        };
        window.beautyEnabled=false;window.beautyHandles=[];window.rawSource=null;
        window.ZimiBeauty={
          async create(raw){
            window.rawSource=raw;
            if(window.deferBeauty){window.deferBeauty=false;await new Promise(resolve=>window.finishBeauty=resolve)}
            if(window.failBeauty)throw new Error('Test SDK initialization failed');
            if(!window.beautyEnabled)return null;
            const existing=beautyHandles.find(handle=>handle.raw===raw&&!handle.destroyed);
            if(existing)return existing;
            const canvas=document.createElement('canvas');canvas.width=160;canvas.height=120;
            const paint=canvas.getContext('2d'),output=canvas.captureStream(12);
            const stream=new MediaStream([...output.getVideoTracks(),...raw.getAudioTracks()]);
            const handle={raw,stream,destroyed:false,setEnabled(enabled){raw.getVideoTracks().forEach(track=>track.enabled=enabled);output.getVideoTracks().forEach(track=>track.enabled=enabled)},destroy(){if(this.destroyed)return;this.destroyed=true;clearInterval(this.timer);output.getTracks().forEach(track=>track.stop())}};
            const draw=()=>{paint.fillStyle=raw.getVideoTracks()[0]?.getSettings().facingMode==='environment'?'#0000ff':'#00ff00';paint.fillRect(0,0,160,120)};
            draw();handle.timer=setInterval(draw,80);beautyHandles.push(handle);return handle;
          },stop(){},sync(){}
        };
        window.sender=()=>peerConnections.at(-1).getSenders().find(sender=>sender.track?.kind==='video');
        window.currentBeauty=()=>beautyHandles.find(handle=>!handle.destroyed);
        window.remotePixel=()=>{const video=document.querySelector('[data-zimi-remote]');if(video.readyState<2)return [];const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const paint=canvas.getContext('2d');paint.drawImage(video,0,0,1,1);return [...paint.getImageData(0,0,1,1).data]};
      ` });
      await page.addScriptTag({ content: source });
      await page.evaluate(async () => { await ZimiMedia.prepare(true); S.v='call'; });
    }
    await receive(pages.viewer, 'call.connected', { callId: 'beauty-call', initiator: false, peerId: 'host' });
    await receive(pages.host, 'call.connected', { callId: 'beauty-call', initiator: true, peerId: 'viewer' });
    await pages.viewer.waitForFunction(() => document.querySelector('[data-zimi-remote]').readyState >= 2);
    const enabled = await pages.host.evaluate(async () => {
      const audio=rawSource.getAudioTracks()[0],raw=rawSource.getVideoTracks()[0];
      window.beautyEnabled=true;await ZimiMedia.refreshBeauty();
      return {processed:sender().track===currentBeauty().stream.getVideoTracks()[0],preview:document.querySelector('[data-zimi-local]').srcObject===currentBeauty().stream,audio:peerConnections.at(-1).getSenders().some(sender=>sender.track===audio),rawStillLive:raw.readyState==='live'};
    });
    assert.deepEqual(enabled, { processed: true, preview: true, audio: true, rawStillLive: true });
    await pages.viewer.waitForFunction(() => { const color=remotePixel();return color[1]>220&&color[0]<30&&color[2]<30; });
    assert.equal(await pages.host.evaluate(() => { S.cam=0;S.mic=0;ZimiMedia.attach();return [...rawSource.getTracks(),...currentBeauty().stream.getTracks()].every(track=>!track.enabled); }), true, 'Camera and microphone controls disable both raw and processed transmission');
    await pages.host.evaluate(() => { S.cam=1;S.mic=1;ZimiMedia.attach(); });
    const flipped = await pages.host.evaluate(async () => {
      const output=sender().track,audio=rawSource.getAudioTracks()[0],before=rawSource.getVideoTracks()[0];
      window.simulateCamera='environment';const mode=await ZimiMedia.flipCamera();window.simulateCamera=null;await ZimiMedia.refreshBeauty();
      return {mode,stableOutput:sender().track===output,sourceChanged:rawSource.getVideoTracks()[0]!==before&&before.readyState==='ended',audioPreserved:rawSource.getAudioTracks()[0]===audio};
    });
    assert.deepEqual(flipped, { mode: 'environment', stableOutput: true, sourceChanged: true, audioPreserved: true }, 'Camera switching updates the raw source while keeping the beauty track published');
    await pages.viewer.waitForFunction(() => { const color=remotePixel();return color[2]>220&&color[0]<30&&color[1]<30; });
    const disabled = await pages.host.evaluate(async () => {
      const output=sender().track;window.beautyEnabled=false;await ZimiMedia.refreshBeauty();
      return {rawPublished:sender().track===rawSource.getVideoTracks()[0],preview:document.querySelector('[data-zimi-local]').srcObject===rawSource,outputStopped:output.readyState==='ended',rawLive:rawSource.getTracks().every(track=>track.readyState==='live')};
    });
    assert.deepEqual(disabled, { rawPublished: true, preview: true, outputStopped: true, rawLive: true }, 'Reset returns both preview and peer to raw camera without losing microphone');
    const sdkFailure = await pages.host.evaluate(async () => {
      window.beautyEnabled=true;window.failBeauty=true;const before=sender().track;await ZimiMedia.refreshBeauty();window.failBeauty=false;
      return sender().track===before&&before.readyState==='live';
    });
    assert.equal(sdkFailure, true, 'SDK initialization errors preserve call media');
    const replacementFailure = await pages.host.evaluate(async () => {
      const current=sender(),before=current.track,replace=current.replaceTrack.bind(current);
      current.replaceTrack=track=>track===before?replace(track):Promise.reject(new Error('Test replacement refused'));
      await ZimiMedia.refreshBeauty();current.replaceTrack=replace;
      return {preserved:current.track===before&&before.readyState==='live',unusedStopped:beautyHandles.every(handle=>handle.destroyed)};
    });
    assert.deepEqual(replacementFailure, { preserved: true, unusedStopped: true }, 'A refused processed track rolls back without ending the call');
    const pendingStop = await pages.host.evaluate(async () => {
      window.deferBeauty=true;const pending=ZimiMedia.refreshBeauty();
      while(!window.finishBeauty)await new Promise(resolve=>setTimeout(resolve,0));
      ZimiMedia.stop();window.finishBeauty();await pending;
      return {rawStopped:tracks.every(track=>track.readyState==='ended'),outputsStopped:beautyHandles.every(handle=>handle.destroyed&&handle.stream.getVideoTracks()[0].readyState==='ended'),previewCleared:document.querySelector('[data-zimi-local]').srcObject===null};
    });
    assert.deepEqual(pendingStop, { rawStopped: true, outputsStopped: true, previewCleared: true }, 'Hanging up during initialization releases even a late processor result');
    const voice = await pages.host.evaluate(async () => { S.v='precall';await ZimiMedia.prepare(false);await ZimiMedia.refreshBeauty();const stream=document.querySelector('[data-zimi-local]').srcObject;return {audio:stream.getAudioTracks().length,video:stream.getVideoTracks().length,processors:beautyHandles.filter(handle=>!handle.destroyed).length}; });
    assert.deepEqual(voice, { audio: 1, video: 0, processors: 0 }, 'Voice calls never create or publish a beauty video track');
    assert.deepEqual(errors, []);
    console.log('Facebetter media: processed pixels reach remote peer; audio, mute, camera flip, reset, SDK failure, replacement rollback, late initialization cleanup and voice calls passed.');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error);process.exitCode=1; });
