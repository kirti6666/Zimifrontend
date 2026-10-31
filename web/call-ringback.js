/* Outgoing calls ring audibly. While the dial screen (or its minimized call) waits for an answer, the
   classic double ringback plays (400 + 450 Hz: 0.4s on, 0.2s off, 0.4s on, 2s
   off); it stops as soon as the call is answered, cancelled, declined, missed or
   fails, or the app leaves the foreground. Web Audio draws the tone, so no sound
   file ships. The dial screen's rings keep the same 3s cycle through phase(). */
window.ZimiRingback=(()=>{
  const CYCLE=3,BURSTS=[[0,.4],[.6,.4]],LEVEL=.2;
  let context=null,tone=null,timer=0,next=0,began=0,foreground=true,releaseRequested=false,releaseTimer=0,audioVersion=0;
  // A minimized ringing call (web/ongoing-call.js) keeps ringing behind other screens.
  const wanted=()=>(['dial','dialback'].includes(S.v)||['dial','dialback'].includes(S.bgCall?.view))&&foreground&&!document.hidden;
  function audio(){
    if(context&&context.state!=='closed')return context;
    const Context=window.AudioContext||window.webkitAudioContext;
    try{context=Context?new Context():null}catch{context=null}
    // A browser that held the tone until a tap starts it in step with the rings.
    // A context that simply took a moment to start is already on time.
    if(context)context.onstatechange=()=>{
      if(!tone||context.state!=='running')return;
      const late=(performance.now()-began)/1000-(context.currentTime-tone.start);
      if(late<.3)return;
      tone.level.gain.cancelScheduledValues(0);tone.level.gain.value=0;next=context.currentTime+(CYCLE-phase())%CYCLE;queue();
    };
    return context;
  }
  // Claim audio output from the explicit Start/Connect tap, before microphone
  // permission awaits lose that gesture. Preparing remains completely silent.
  function prime(){
    audioVersion++;
    releaseRequested=false;clearTimeout(releaseTimer);
    const c=audio();if(!c)return;
    if(c.state==='suspended')c.resume().then(()=>{if(releaseRequested)release()}).catch(()=>{});
  }
  function release(){
    if(tone||wanted())return;
    releaseRequested=true;clearTimeout(releaseTimer);
    const c=context;if(!c)return;
    // Let a previous ring's short fade finish before releasing the device.
    releaseTimer=setTimeout(()=>{if(releaseRequested&&!tone&&!wanted()&&c.state==='running')c.suspend().catch(()=>{})},150);
  }
  // Bursts are queued a cycle ahead, so a busy screen cannot open gaps in the tone.
  function queue(){
    const level=tone.level.gain;
    while(next<context.currentTime+CYCLE){
      for(const [at,length] of BURSTS){
        const t=next+at;
        level.setValueAtTime(0,t);level.linearRampToValueAtTime(LEVEL,t+.02);
        level.setValueAtTime(LEVEL,t+length-.02);level.linearRampToValueAtTime(0,t+length);
      }
      next+=CYCLE;
    }
  }
  function play(){
    releaseRequested=false;clearTimeout(releaseTimer);
    const c=audio();if(!c)return;
    if(c.state==='suspended')c.resume().catch(()=>{});
    const level=c.createGain();level.gain.value=0;level.connect(c.destination);
    const voices=[400,450].map(frequency=>{const o=c.createOscillator();o.frequency.value=frequency;o.connect(level);o.start();return o});
    tone={level,voices,start:c.currentTime};next=c.currentTime+.01;queue();timer=setInterval(queue,500);
  }
  function silence(){
    clearInterval(timer);timer=0;if(!tone)return;
    const {level,voices}=tone,c=context,t=c.currentTime,version=audioVersion;tone=null;
    level.gain.cancelScheduledValues(t);level.gain.setValueAtTime(level.gain.value,t);level.gain.linearRampToValueAtTime(0,t+.04);
    voices.forEach(o=>o.stop(t+.05));
    // Release the audio output once nothing rings.
    setTimeout(()=>{level.disconnect();if(!tone&&audioVersion===version&&c.state==='running')c.suspend().catch(()=>{})},150);
  }
  function sync(){
    if(wanted()){if(!began)began=performance.now();if(!tone)play()}
    else{began=0;silence()}
  }
  /** Seconds into the current ring cycle; 0 before ringing starts. */
  function phase(){return began?((performance.now()-began)/1000)%CYCLE:0}
  function unlock(){if(tone&&context.state==='suspended')prime();else if(wanted())sync()}
  document.addEventListener('pointerup',unlock,{capture:true,passive:true});
  document.addEventListener('keydown',unlock,{capture:true,passive:true});
  document.addEventListener('aurora:navigate',sync);
  document.addEventListener('visibilitychange',sync);
  // Leaving the screen without navigation (a redraw that changes the view) also stops it.
  const screen=document.getElementById('screen');
  if(screen&&typeof MutationObserver!=='undefined')new MutationObserver(sync).observe(screen,{childList:true});
  Native.on('app.background',()=>{foreground=false;sync()});
  Native.on('app.foreground',()=>{foreground=true;sync()});
  return {prime,release,sync,phase,playing:()=>!!tone};
})();
