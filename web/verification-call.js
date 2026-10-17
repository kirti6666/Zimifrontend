/* Staff video calls for host applicants. The ZimiLive team calls before deciding an
   application; the applicant answers here. Media runs through ZimiMedia's call session
   (verify.connected), so this file only owns the overlay and its controls. */
const ZVerify={callId:'',state:'',error:'',startedAt:0,timer:null};
const ZV_ENDED={declined:'You declined the verification call.',missed:'You missed the verification call. The team can call you again.',unavailable:'This verification call is no longer available.',failed:'The video connection failed. The team can call you again.'};
function zvTime(){const s=Math.max(0,Math.floor((Date.now()-ZVerify.startedAt)/1000));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}
function zvRender(){
  let el=document.getElementById('zv-call');
  if(!ZVerify.state){el?.remove();clearInterval(ZVerify.timer);ZVerify.timer=null;return}
  if(!el){el=document.createElement('section');el.id='zv-call';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-labelledby','zv-title');document.body.append(el)}
  const ringing=ZVerify.state==='ringing'||ZVerify.state==='preparing',live=ZVerify.state==='connected',micOn=S.mic!==0,camOnNow=S.cam!==0;
  el.className='zv-call zv-'+ZVerify.state;
  el.innerHTML=ringing?`<div class="zv-ring">
    <span class="zv-badge" aria-hidden="true">${I('shield',34)}</span>
    <p class="zv-eyebrow">Creator verification</p>
    <h2 id="zv-title">ZimiLive team is calling</h2>
    <p class="zv-note">A short video call to confirm it’s really you. Find good light, keep your face visible and say hello.</p>
    ${ZVerify.error?`<p class="zv-error" role="alert">${esc(ZVerify.error)}</p>`:''}
    <div class="zv-actions">
      <button class="zv-decline" onclick="zvDecline()" aria-label="Decline verification call">${I('ph',24)}</button>
      <button class="zv-accept" onclick="zvAccept()" aria-label="Accept verification video call" ${ZVerify.state==='preparing'?'disabled aria-busy="true"':''}>${I('vid',24)}</button>
    </div>
    <p class="zv-hint">${ZVerify.state==='preparing'?'Starting your camera…':'Accept to turn on your camera and microphone.'}</p>
  </div>`:`<div class="zv-stage">
    <video class="zv-remote" data-zimi-remote autoplay playsinline aria-label="ZimiLive team video"></video>
    <video class="zv-local" data-zimi-local autoplay playsinline muted aria-label="Your camera"></video>
    <div class="zv-top"><span class="zv-dot" aria-hidden="true"></span><b id="zv-title">ZimiLive verification</b><span class="zv-timer" id="zv-timer" aria-live="off">${live?zvTime():'Connecting…'}</span></div>
    <div class="zv-controls">
      <button class="${micOn?'':'off'}" onclick="zvMic()" aria-pressed="${!micOn}" aria-label="${micOn?'Mute microphone':'Unmute microphone'}">${I(micOn?'mic':'micoff',22)}</button>
      <button class="zv-end" onclick="zvEnd()" aria-label="End verification call">${I('ph',26)}</button>
      <button class="${camOnNow?'':'off'}" onclick="zvCam()" aria-pressed="${!camOnNow}" aria-label="${camOnNow?'Turn camera off':'Turn camera on'}">${I(camOnNow?'vid':'camoff',22)}</button>
    </div>
  </div>`;
  window.ZimiMedia?.attach();
  if(ringing)el.querySelector('.zv-accept:not([disabled])')?.focus();
}
function zvClose(message){
  ZVerify.callId='';ZVerify.state='';ZVerify.error='';zvRender();
  window.ZimiMedia?.stop();
  if(message)appNotice(message);
}
async function zvAccept(){
  if(ZVerify.state!=='ringing')return;
  const callId=ZVerify.callId;ZVerify.state='preparing';ZVerify.error='';zvRender();
  try{S.mic=1;S.cam=1;S.scam=1;await window.ZimiMedia.prepare(true)}
  catch(e){if(ZVerify.callId!==callId)return;ZVerify.state='ringing';ZVerify.error=e.message||'Allow camera and microphone access to answer.';zvRender();return}
  if(ZVerify.callId!==callId){window.ZimiMedia.stop();return}
  ZVerify.state='connecting';zvRender();
  Native.send('verify.accept',{callId});
}
function zvDecline(){if(ZVerify.callId)Native.send('verify.end',{callId:ZVerify.callId});zvClose()}
function zvEnd(){if(ZVerify.callId)Native.send('verify.end',{callId:ZVerify.callId});zvClose('Thanks for joining. The team will update your application soon.')}
function zvMic(){S.mic=S.mic===0?1:0;window.ZimiMedia?.attach();zvRender()}
function zvCam(){const next=S.cam===0?1:0;S.cam=next;S.scam=next;window.ZimiMedia?.attach();zvRender()}
Native.on('verify.incoming',d=>{
  if(ZVerify.callId===d.callId&&ZVerify.state)return;
  ZVerify.callId=d.callId;ZVerify.state='ringing';ZVerify.error='';zvRender();
});
Native.on('verify.connected',d=>{
  if(d.callId!==ZVerify.callId)return;
  ZVerify.state='connected';ZVerify.startedAt=Date.now();zvRender();
  clearInterval(ZVerify.timer);
  ZVerify.timer=setInterval(()=>{const t=document.getElementById('zv-timer');if(t)t.textContent=zvTime()},1000);
});
Native.on('verify.ended',d=>{
  if(d.callId!==ZVerify.callId)return;
  zvClose(ZVerify.state==='connected'?'The verification call has ended. The team will update your application soon.':ZV_ENDED[d.status]||'The verification call has ended.');
});
['session.none','session.expired'].forEach(type=>Native.on(type,()=>{if(ZVerify.state)zvClose()}));
