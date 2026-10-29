/* Local WebRTC integration: browser fake devices are enabled only in this test.
   No server account, payment, or production camera is used. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source = fs.readFileSync(path.join(__dirname, '../web/media.js'), 'utf8');
const receive = (page, type, data) => page.evaluate(({ type, data }) => { if(type==='stream.signal') window.streamSignals=(window.streamSignals||0)+1; if(type==='rtc.signal'&&data.description?.type==='offer')window.lastCallOffer=data.callId; Native.receive(type, data); }, { type, data });

(async () => {
  const server = http.createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end('<div id="screen"><video data-zimi-local autoplay muted playsinline></video><video data-zimi-remote autoplay playsinline></video><div data-zimi-network hidden><span>Poor connection</span></div><p data-zimi-media-status></p></div>');
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
          const destination = pages[type === 'stream.signal' && data.to ? data.to : id === 'host' ? 'viewer' : 'host'];
          if (destination) return receive(destination, type, { ...data, from: id });
        }
      });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.addScriptTag({ content: `
        const DEMO=false, Home={}, S={v:'home',mic:1,cam:1,scam:1};
        const Native={handlers:{},send(type,data){window.sendNative(type,data)},on(type,fn){(this.handlers[type]||=[]).push(fn)},receive(type,data){(this.handlers[type]||[]).forEach(fn=>fn(data))}};
        const camOn=()=>S.cam, appNotice=message=>{window.lastNotice=message};
        window.captureCount=0; window.tracks=[];
        window.mediaTimers=[];
        const scheduleInterval=window.setInterval.bind(window);
        window.setInterval=(...args)=>{const timer=scheduleInterval(...args);mediaTimers.push(timer);return timer};
        const PeerConnection=window.RTCPeerConnection;
        window.peerConnections=[];
        window.RTCPeerConnection=class extends PeerConnection {constructor(...args){super(...args);window.peerConnections.push(this)}};
        const acquire=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia=async constraints=>{
          window.captureCount++;
          // Chromium exposes one fake camera. Only camera-switch tests emulate
          // a second facing mode; capture and WebRTC remain real browser APIs.
          const simulatedFacing=constraints.audio===false&&window.simulateCamera;
          const stream=await acquire(simulatedFacing?{audio:false,video:true}:constraints);
          if(simulatedFacing){const track=stream.getVideoTracks()[0],settings=track.getSettings.bind(track);track.getSettings=()=>({...settings(),facingMode:simulatedFacing})}
          window.tracks.push(...stream.getTracks());return stream;
        };
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
    await pages.host.evaluate(() => { S.cam=0; S.mic=0; ZimiMedia.attach(); });
    assert.equal(await pages.host.evaluate(() => document.querySelector('[data-zimi-local]').srcObject.getTracks().every(track => !track.enabled)), true, 'Broadcast camera and microphone controls affect transmitted tracks');
    await receive(pages.host, 'stream.peer', {streamId:'live-one',userId:'spectator'});
    const flipped = await pages.host.evaluate(async () => {
      const stream=document.querySelector('[data-zimi-local]').srcObject, oldVideo=stream.getVideoTracks()[0], audio=stream.getAudioTracks()[0];
      window.simulateCamera='environment';
      const first=ZimiMedia.flipCamera(), second=ZimiMedia.flipCamera(), coalesced=first===second;
      const mode=await first;
      window.simulateCamera=null;
      const video=stream.getVideoTracks()[0], senders=peerConnections.flatMap(pc=>pc.getSenders()).filter(sender=>sender.track?.kind==='video');
      return {coalesced,mode,oldStopped:oldVideo.readyState==='ended',audioPreserved:audio===stream.getAudioTracks()[0]&&audio.readyState==='live',muted:!audio.enabled&&!video.enabled,replaced:senders.length===2&&senders.every(sender=>sender.track===video),facing:document.querySelector('[data-zimi-local]').dataset.zimiFacing};
    });
    assert.deepEqual(flipped, {coalesced:true,mode:'environment',oldStopped:true,audioPreserved:true,muted:true,replaced:true,facing:'environment'}, 'Camera flip replaces every viewer sender, preserves the microphone and camera-off state, and coalesces repeated presses');
    const rollback = await pages.host.evaluate(async () => {
      const stream=document.querySelector('[data-zimi-local]').srcObject, original=stream.getVideoTracks()[0];
      const sender=peerConnections[1].getSenders().find(sender=>sender.track?.kind==='video'), replace=sender.replaceTrack.bind(sender);
      sender.replaceTrack=track=>track===original?replace(track):Promise.reject(new Error('Test sender cannot replace camera'));
      window.simulateCamera='user';
      let message='';try{await ZimiMedia.flipCamera()}catch(error){message=error.message}
      sender.replaceTrack=replace;window.simulateCamera=null;
      return {message,preserved:stream.getVideoTracks()[0]===original&&original.readyState==='live',rolledBack:peerConnections.flatMap(pc=>pc.getSenders()).filter(sender=>sender.track?.kind==='video').every(sender=>sender.track===original),unusedStopped:tracks.filter(track=>track.kind==='video'&&track!==original).every(track=>track.readyState==='ended')};
    });
    assert.deepEqual(rollback,{message:'Test sender cannot replace camera',preserved:true,rolledBack:true,unusedStopped:true},'A failed sender replacement restores every viewer to the original camera and releases the rejected camera');
    const exclusiveCamera = await pages.host.evaluate(async () => {
      const stream=document.querySelector('[data-zimi-local]').srcObject, oldVideo=stream.getVideoTracks()[0], audio=stream.getAudioTracks()[0], original=navigator.mediaDevices.getUserMedia;
      let attempts=0,releasedBeforeRetry=false;
      window.simulateCamera='user';
      navigator.mediaDevices.getUserMedia=async constraints=>{if(++attempts===1)throw new DOMException('One camera at a time','NotReadableError');releasedBeforeRetry=oldVideo.readyState==='ended';return original(constraints)};
      const mode=await ZimiMedia.flipCamera();navigator.mediaDevices.getUserMedia=original;window.simulateCamera=null;
      const video=stream.getVideoTracks()[0];
      return {mode,attempts,releasedBeforeRetry,audioPreserved:audio===stream.getAudioTracks()[0]&&audio.readyState==='live',replaced:peerConnections.flatMap(pc=>pc.getSenders()).filter(sender=>sender.track?.kind==='video').every(sender=>sender.track===video)};
    });
    assert.deepEqual(exclusiveCamera,{mode:'user',attempts:2,releasedBeforeRetry:true,audioPreserved:true,replaced:true},'Devices that allow only one camera retry after releasing the old video while preserving audio');
    const restoredCamera = await pages.host.evaluate(async () => {
      const stream=document.querySelector('[data-zimi-local]').srcObject, oldVideo=stream.getVideoTracks()[0], original=navigator.mediaDevices.getUserMedia;
      let attempts=0,message='';window.simulateCamera='user';
      navigator.mediaDevices.getUserMedia=async constraints=>{if(++attempts<3)throw new DOMException('Camera busy','NotReadableError');return original(constraints)};
      try{await ZimiMedia.flipCamera()}catch(error){message=error.message}
      navigator.mediaDevices.getUserMedia=original;window.simulateCamera=null;
      const video=stream.getVideoTracks()[0];
      return {message,attempts,oldReleased:oldVideo.readyState==='ended',restored:video.readyState==='live'&&ZimiMedia.getState().facingMode==='user',replaced:peerConnections.flatMap(pc=>pc.getSenders()).filter(sender=>sender.track?.kind==='video').every(sender=>sender.track===video)};
    });
    assert.deepEqual(restoredCamera,{message:'The camera could not be switched. Your previous camera has been restored.',attempts:3,oldReleased:true,restored:true,replaced:true},'If a single-camera-device retry fails, the original camera is recaptured and restored to every viewer');
    await receive(pages.host, 'stream.peerLeft', {streamId:'live-one',userId:'spectator'});
    await pages.viewer.evaluate(() => { ZimiMedia.setPlaybackMuted(true); document.getElementById('screen').innerHTML='<video data-zimi-remote autoplay playsinline></video>'; });
    await pages.viewer.waitForFunction(() => !!document.querySelector('[data-zimi-remote]').srcObject);
    assert.equal(await pages.viewer.evaluate(() => document.querySelector('[data-zimi-remote]').muted && ZimiMedia.isPlaybackMuted()), true, 'Remote playback mute survives a rerender');
    assert.equal(await pages.viewer.evaluate(() => { ZimiMedia.setPlaybackMuted(false); return document.querySelector('[data-zimi-remote]').muted; }), false, 'Remote playback can be unmuted without changing its stream');
    const captureBeforeRerender = await pages.host.evaluate(() => captureCount);
    await pages.host.evaluate(() => { document.getElementById('screen').innerHTML='<video data-zimi-local autoplay muted playsinline></video><video data-zimi-remote autoplay playsinline></video>'; });
    await pages.host.waitForFunction(() => !!document.querySelector('[data-zimi-local]').srcObject);
    assert.equal(await pages.host.evaluate(() => captureCount), captureBeforeRerender, 'Rerenders reuse the existing media stream');
    const readyCount=messages.filter(message=>message.id==='viewer'&&message.type==='stream.ready').length;
    await receive(pages.viewer, 'realtime.status', {connected:false});
    await receive(pages.viewer, 'realtime.status', {connected:true});
    assert.equal(messages.filter(message=>message.id==='viewer'&&message.type==='stream.ready').length,readyCount+1,'Socket reconnection reannounces stream readiness');
    await Promise.all(Object.values(pages).map(page => page.evaluate(() => { S.v='home'; document.dispatchEvent(new Event('aurora:navigate')); })));
    assert.equal(await pages.host.evaluate(() => tracks.every(track => track.readyState === 'ended')), true, 'Navigation stops broadcast capture');
    assert.equal(await pages.viewer.evaluate(() => document.querySelector('[data-zimi-remote]').srcObject), null);

    await Promise.all(Object.values(pages).map(page => page.evaluate(async () => { S.v='precall'; S.cam=1; S.mic=1; await ZimiMedia.prepare(true); S.v='call'; })));
    await receive(pages.viewer, 'call.connected', { callId: 'call-one', initiator: false, peerId: 'host', voice: false });
    await receive(pages.host, 'call.connected', { callId: 'call-one', initiator: true, peerId: 'viewer', voice: false });
    await Promise.all(Object.values(pages).map(page => page.waitForFunction(() => document.querySelector('[data-zimi-remote]').readyState >= 2, { timeout: 15000 })));
    const reused = await pages.host.evaluate(() => {
      const container=document.getElementById('screen'),video=container.querySelector('[data-zimi-remote]'),stream=video.srcObject,captures=captureCount;
      for(let i=0;i<25;i++){ZimiMedia.render(container,'<video data-zimi-local autoplay muted playsinline></video><video data-zimi-remote autoplay playsinline></video><div data-zimi-network hidden><span>Poor connection</span></div>');ZimiMedia.attach()}
      return {sameVideo:video===container.querySelector('[data-zimi-remote]'),sameStream:video.srcObject===stream,captureUnchanged:captures===captureCount};
    });
    assert.deepEqual(reused,{sameVideo:true,sameStream:true,captureUnchanged:true},'Repeated call redraws preserve the actual playing video and capture');
    await pages.host.evaluate(() => {
      const move=Element.prototype.moveBefore;Element.prototype.moveBefore=undefined;
      try {
        const container=document.getElementById('screen');
        ZimiMedia.render(container,'<video data-zimi-local autoplay muted playsinline></video><video data-zimi-remote autoplay playsinline></video><div data-zimi-network hidden><span>Poor connection</span></div>');
        ZimiMedia.attach();window.lastRemoteTime=container.querySelector('[data-zimi-remote]').currentTime;
      } finally { Element.prototype.moveBefore=move; }
    });
    await pages.host.waitForFunction(() => document.querySelector('[data-zimi-remote]').currentTime>lastRemoteTime);
    await pages.host.evaluate(() => { document.querySelector('[data-zimi-remote]').pause(); Native.receive('app.foreground',{}); });
    await pages.host.waitForFunction(() => !document.querySelector('[data-zimi-remote]').paused);
    const healthyCallEnds=messages.filter(message=>message.type==='call.end').length;
    await receive(pages.host,'operation.error',{action:'rtc.signal',message:'Temporary signaling outage'});
    assert.equal(messages.filter(message=>message.type==='call.end').length,healthyCallEnds,'A signaling acknowledgment failure does not terminate healthy call media');
    await pages.host.waitForFunction(() => peerConnections.at(-1).getSenders().find(sender=>sender.track?.kind==='video').getParameters().encodings[0].maxBitrate===1800000);
    await pages.host.evaluate(() => {
      // Drive quality samples explicitly so a timer cannot race a one-sample spike.
      mediaTimers.forEach(clearInterval);
      const pc=peerConnections.at(-1);window.realStats=pc.getStats.bind(pc);
      window.statsFixture=[
        {id:'transport',type:'transport',selectedCandidatePairId:'path'},
        {id:'inbound',type:'inbound-rtp',packetsReceived:100,packetsLost:0,jitter:0},
        {id:'remote',type:'remote-inbound-rtp',localId:'outbound',packetsLost:100,fractionLost:0,jitter:0},
        {id:'outbound',type:'outbound-rtp',kind:'video',qualityLimitationReason:'bandwidth'},
        {id:'path',type:'candidate-pair',state:'succeeded',nominated:true,currentRoundTripTime:.03,availableOutgoingBitrate:2000000},
        {id:'old-path',type:'candidate-pair',state:'succeeded',nominated:true,currentRoundTripTime:1.5}
      ];
      pc.getStats=async()=>new Map(statsFixture.map(stat=>[stat.id,{...stat}]));
    });
    const sample = async (count=1) => {for(let i=0;i<count;i++)await pages.host.evaluate(async()=>{Native.receive('app.foreground',{});await new Promise(resolve=>setTimeout(resolve,70))})};
    const encoding = () => pages.host.evaluate(()=>{const {maxBitrate,maxFramerate,scaleResolutionDownBy}=peerConnections.at(-1).getSenders().find(sender=>sender.track?.kind==='video').getParameters().encodings[0];return {maxBitrate,maxFramerate,scaleResolutionDownBy}});
    const high={maxBitrate:1800000,maxFramerate:24,scaleResolutionDownBy:1};
    const balanced={maxBitrate:900000,maxFramerate:24,scaleResolutionDownBy:1.5};
    const low={maxBitrate:450000,maxFramerate:18,scaleResolutionDownBy:2};
    await sample(3);
    assert.equal(await pages.host.evaluate(()=>ZimiMedia.getState().connectionQuality),'good','Normal bandwidth adaptation, old cumulative loss and an unused slow candidate do not report poor connection');
    assert.deepEqual(await encoding(),high);
    await pages.host.evaluate(()=>{statsFixture.find(s=>s.id==='remote').packetsLost=200});
    await sample(2);
    assert.equal(await pages.host.evaluate(()=>ZimiMedia.getState().connectionQuality),'good','Missing remote packet totals cannot turn cumulative loss into a false 100 percent loss rate');
    await pages.host.evaluate(()=>{statsFixture.find(s=>s.id==='path').currentRoundTripTime=.9});
    await sample();
    assert.equal(await pages.host.evaluate(()=>ZimiMedia.getState().connectionQuality),'good','One network spike does not flash the poor-connection warning');
    assert.deepEqual(await encoding(),high,'One spike does not blur the outgoing video');
    await pages.host.evaluate(()=>{statsFixture.find(s=>s.id==='path').currentRoundTripTime=.03;statsFixture.find(s=>s.id==='inbound').jitter=.12});
    await sample(2);
    assert.equal(await pages.host.locator('[data-zimi-network]').isVisible(),true,'Sustained bad incoming media displays the warning');
    assert.deepEqual(await encoding(),high,'Bad incoming media does not reduce our outgoing video');
    await pages.host.evaluate(()=>{statsFixture.find(s=>s.id==='inbound').jitter=0;statsFixture.find(s=>s.id==='path').currentRoundTripTime=.9});
    await sample(2);
    assert.deepEqual(await encoding(),balanced,'Sustained outgoing congestion first preserves 24 fps at a moderate resolution');
    await pages.host.evaluate(()=>{statsFixture.find(s=>s.id==='path').currentRoundTripTime=.03;statsFixture.find(s=>s.id==='remote').fractionLost=.3});
    await sample(2);
    assert.deepEqual(await encoding(),low,'Severe receiver-reported loss reduces video even when packetsReceived is unavailable');
    await pages.host.evaluate(()=>{statsFixture.find(s=>s.id==='remote').fractionLost=0});
    await sample(3);
    assert.deepEqual(await encoding(),balanced,'Recovery restores one video quality step at a time');
    assert.equal(await pages.host.locator('[data-zimi-network]').isVisible(),false,'Sustained recovery hides the signal warning');
    await sample(3);
    assert.deepEqual(await encoding(),high,'Stable recovery restores full camera resolution');
    await pages.host.evaluate(()=>{statsFixture.find(s=>s.id==='outbound').qualityLimitationReason='cpu'});
    await sample(2);
    assert.deepEqual(await encoding(),balanced,'CPU pressure reduces encoder work');
    assert.equal(await pages.host.evaluate(()=>ZimiMedia.getState().connectionQuality),'good','CPU pressure is not reported as a poor network');
    await pages.host.evaluate(()=>{statsFixture.find(s=>s.id==='outbound').qualityLimitationReason='bandwidth';statsFixture.find(s=>s.id==='path').availableOutgoingBitrate=400000});
    await sample(3);
    assert.deepEqual(await encoding(),high,'A low bandwidth estimate alone does not lock the encoder into a low quality ceiling');
    assert.equal(await pages.host.evaluate(()=>ZimiMedia.getState().connectionQuality),'good');
    await pages.host.evaluate(()=>{statsFixture.find(s=>s.id==='remote').fractionLost=.12});
    await sample(2);
    assert.deepEqual(await encoding(),low,'Low available bandwidth with confirmed outgoing loss has a smooth low-bandwidth profile');
    await pages.host.evaluate(()=>{statsFixture.find(s=>s.id==='path').availableOutgoingBitrate=2000000;statsFixture.find(s=>s.id==='remote').fractionLost=0});
    await sample(6);
    const offersBeforeRecovery=messages.filter(message=>message.id==='host'&&message.type==='rtc.signal'&&message.data.description?.type==='offer').length;
    await pages.host.evaluate(() => {
      const pc=peerConnections.at(-1);pc.getStats=realStats;
      Object.defineProperty(pc,'connectionState',{configurable:true,get:()=> 'failed'});pc.onconnectionstatechange();
    });
    assert.equal(await pages.host.evaluate(() => ZimiMedia.getState().connectionQuality),'reconnecting');
    await new Promise((resolve,reject)=>{const deadline=Date.now()+8000;const timer=setInterval(()=>{if(messages.filter(message=>message.id==='host'&&message.type==='rtc.signal'&&message.data.description?.type==='offer').length>offersBeforeRecovery){clearInterval(timer);resolve()}else if(Date.now()>deadline){clearInterval(timer);reject(new Error('ICE recovery did not offer again'))}},50)});
    await pages.host.evaluate(() => { const pc=peerConnections.at(-1);delete pc.connectionState;pc.onconnectionstatechange(); });
    await pages.host.waitForFunction(() => peerConnections.at(-1).connectionState==='connected'&&peerConnections.at(-1).signalingState==='stable');
    assert.equal(messages.filter(message=>message.type==='call.end').length,healthyCallEnds,'ICE recovery keeps the same call alive');
    await pages.host.evaluate(() => { S.mic=0; S.cam=0; ZimiMedia.attach(); });
    assert.equal(await pages.host.evaluate(() => document.querySelector('[data-zimi-local]').srcObject.getTracks().every(track => !track.enabled)), true, 'Mute and camera controls affect transmitted tracks');
    await Promise.all(Object.values(pages).map(page => receive(page, 'call.ended', {callId:'call-one'})));
    assert.equal(await pages.host.evaluate(() => tracks.every(track => track.readyState === 'ended')), true);
    assert.equal(await pages.viewer.evaluate(() => tracks.every(track => track.readyState === 'ended')), true);

    // The queue handoff can reach one user before the other grants camera
    // access. Their expected call offer must survive that capture delay.
    await pages.viewer.evaluate(() => { S.v='call'; S.callId='queued-private-call'; document.getElementById('screen').innerHTML='<video data-zimi-local autoplay muted playsinline></video><video data-zimi-remote autoplay playsinline></video>'; });
    await pages.host.evaluate(async () => { S.v='call'; S.callId='queued-private-call'; S.cam=1; S.mic=1; await ZimiMedia.prepare(true); });
    await receive(pages.host, 'call.connected', {callId:'queued-private-call',initiator:true,peerId:'viewer',voice:false});
    await pages.viewer.waitForFunction(() => window.lastCallOffer==='queued-private-call');
    assert.equal(await pages.viewer.evaluate(() => tracks.every(track=>track.readyState==='ended')),true,'The slower participant has no capture when the private-call offer arrives');
    await pages.viewer.evaluate(async () => { await ZimiMedia.prepare(true); });
    await receive(pages.viewer,'call.connected',{callId:'queued-private-call',initiator:false,peerId:'host',voice:false});
    await Promise.all(Object.values(pages).map(page=>page.waitForFunction(()=>document.querySelector('[data-zimi-remote]').readyState>=2,{timeout:15000})));
    await Promise.all(Object.values(pages).map(page=>receive(page,'call.ended',{callId:'queued-private-call'})));

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
    const flipCancelled = await pages.host.evaluate(async () => {
      S.v='broadcast';S.cam=1;S.mic=1;await ZimiMedia.prepare(true);
      const original=navigator.mediaDevices.getUserMedia;
      let release;
      window.simulateCamera='environment';
      navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await original(constraints);await new Promise(resolve=>{release=resolve});return stream};
      const pending=ZimiMedia.flipCamera().then(()=>false,()=>true);
      while(!release)await new Promise(resolve=>setTimeout(resolve,10));
      ZimiMedia.stop();release();
      const rejected=await pending;
      navigator.mediaDevices.getUserMedia=original;window.simulateCamera=null;
      return {rejected,stopped:tracks.every(track=>track.readyState==='ended'),switching:ZimiMedia.getState().switchingCamera};
    });
    assert.deepEqual(flipCancelled,{rejected:true,stopped:true,switching:false},'Leaving during a camera switch stops both old and late-arriving cameras');
    const replaceCancelled = await pages.host.evaluate(async () => {
      S.v='broadcast';await ZimiMedia.prepare(true);S.v='live';await ZimiMedia.openStream({id:'cancel-switch',hostId:'host'},true);
      Native.receive('stream.peer',{streamId:'cancel-switch',userId:'spectator'});
      const sender=peerConnections.at(-1).getSenders().find(sender=>sender.track?.kind==='video'), replace=sender.replaceTrack.bind(sender);
      let release;window.simulateCamera='environment';
      sender.replaceTrack=async track=>{await replace(track);await new Promise(resolve=>{release=resolve})};
      const pending=ZimiMedia.flipCamera().then(()=>false,()=>true);
      while(!release)await new Promise(resolve=>setTimeout(resolve,10));
      ZimiMedia.stop();const stoppedImmediately=tracks.every(track=>track.readyState==='ended');release();
      const rejected=await pending;window.simulateCamera=null;
      return {stoppedImmediately,rejected};
    });
    assert.deepEqual(replaceCancelled,{stoppedImmediately:true,rejected:true},'Leaving during sender replacement releases the new capture immediately, before its pending promise resolves');
    const flipDenied = await pages.host.evaluate(async () => {
      S.v='broadcast';await ZimiMedia.prepare(true);
      const original=tracks.findLast(track=>track.kind==='video');
      navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Permission denied','NotAllowedError')};
      let message='';try{await ZimiMedia.flipCamera()}catch(error){message=error.message}
      const preserved=original.readyState==='live';ZimiMedia.stop();return {message,preserved};
    });
    assert.equal(flipDenied.preserved,true,'Denied camera switching leaves the existing capture running');
    assert.match(flipDenied.message,/Allow access in your device settings/);
    const denied = await pages.host.evaluate(async () => {
      navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Permission denied','NotAllowedError')};
      try {await ZimiMedia.prepare(true);return ''} catch(error){return error.message}
    });
    assert.match(denied, /Allow access in your device settings/);
    assert.deepEqual(errors, [], 'The browser has no uncaught errors');
    console.log('Home media: stream startup/reconnect, video/voice/private-call handoff, early ICE, broadcast/call controls, multi-viewer camera flip and rollback, playback mute, rerender reuse, no viewer capture, unanswered call cleanup, capture/flip cancellation and permission errors passed.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode=1; });
