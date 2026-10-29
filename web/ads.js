/* Sponsored cards for members on the free plan; premium members never see them.
   The server decides which campaigns this member may see (data.ads). Here we
   rotate them per screen visit, report a view once a card has been at least
   half on screen for a second (two for video), and send taps through the app,
   which counts the click before it opens the link. Sample ads exist only in DEMO. */
const ZAds={items:[],adFree:false,picks:{},turn:{},retired:new Set(),counted:new Set(),visible:new Set(),timers:new Map(),videos:new Map(),paused:new Set(),opening:'',observer:null};
const zaReduced=matchMedia('(prefers-reduced-motion: reduce)');
Object.assign(homeIcons,{
  volOff:'<path d="M5 10h3l4-3.5v11L8 14H5z" stroke-linejoin="round"/><path d="m16 9.5 5 5m0-5-5 5" stroke-linecap="round"/>',
  pause:'<path d="M8 5v14M16 5v14"/>',
  playFill:'<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  crown:'<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z"/>'
});
function zaSafe(ad){return !!ad&&/^[a-f\d]{24}$/i.test(ad.id||'')&&['banner','video'].includes(ad.format)&&/^https:\/\/[^\s"'<>\\]+$/.test(ad.mediaUrl||'')&&Array.isArray(ad.placements)&&[ad.headline,ad.advertiser,ad.ctaLabel].every(value=>typeof value==='string'&&value.trim())}
/* Premium removes ads the moment it is confirmed, before the next ad list arrives. */
function zaAdFree(){return ZAds.adFree||ZThemes.catalog?.premium?.active===true}
function zaPick(placement){
  if(zaAdFree())return null;
  const fits=ad=>ad.placements.includes(placement),pinned=ZAds.picks[placement];
  // Keep the card chosen for this visit through redraws, even if it just reached its cap.
  const current=pinned&&ZAds.items.find(ad=>ad.id===pinned&&fits(ad));
  if(current)return current;
  const pool=ZAds.items.filter(ad=>fits(ad)&&!ZAds.retired.has(ad.id));
  if(!pool.length)return null;
  const turn=ZAds.turn[placement]=(ZAds.turn[placement]??-1)+1,ad=pool[turn%pool.length];
  ZAds.picks[placement]=ad.id;return ad;
}
function zaLogo(ad){const src=imageSrc(ad.logoUrl);return src?`<img class="za-logo" src="${src}" alt="" loading="lazy" decoding="async">`:`<span class="za-logo za-initial" aria-hidden="true">${esc((ad.advertiser.trim()[0]||'A').toUpperCase())}</span>`}
/* Moving video always has a visible pause control; sound starts off. */
function zaControls(ad){
  const video=ZAds.videos.get(ad.id),muted=video?video.muted:true,playing=video?!video.paused:false,id=esc(ad.id);
  return `<div class="za-controls" data-za-controls="${id}"><button type="button" class="za-control" data-za-control="play" onclick="zaPlay('${id}')" aria-label="${playing?'Pause video':'Play video'}">${hi(playing?'pause':'playFill',16)}</button><button type="button" class="za-control" data-za-control="sound" onclick="zaSound('${id}')" aria-label="${muted?'Turn sound on':'Turn sound off'}">${hi(muted?'volOff':'vol',16)}</button></div>`;
}
function zaCta(ad,placement){
  const id=esc(ad.id),busy=ZAds.opening===ad.id;
  return `<button type="button" class="za-cta" onclick="zaOpen('${id}','${placement}')" aria-label="${esc(`${ad.ctaLabel}: ${ad.advertiser}, sponsored`)}" aria-busy="${busy}" ${ZAds.opening?'disabled':''}>${busy?'Opening…':esc(ad.ctaLabel)}</button>`;
}
/* A feed card: Home, Explore and the call summary. */
function zaCard(placement){
  const ad=zaPick(placement);if(!ad)return '';
  const id=esc(ad.id),video=ad.format==='video';
  const media=video?`<span class="za-video-holder" data-za-video="${id}"></span>`:`<img class="za-image" src="${imageSrc(ad.mediaUrl)}" alt="" loading="lazy" decoding="async">`;
  return `<aside class="za-card" data-za-slot="${placement}" data-za-id="${id}" aria-label="Sponsored by ${esc(ad.advertiser)}">
    <div class="za-head">${zaLogo(ad)}<span class="za-who"><b>${esc(ad.advertiser)}</b><small>Sponsored</small></span><button type="button" class="za-info" onclick="zaAbout('${id}')" aria-label="About this ad">Ad ${hi('info',14)}</button></div>
    <div class="za-stage"><div class="za-media" onclick="zaOpen('${id}','${placement}')" aria-hidden="true">${media}</div>${video?zaControls(ad):''}</div>
    <div class="za-copy"><h3>${esc(ad.headline)}</h3>${ad.body?`<p>${esc(ad.body)}</p>`:''}</div>
    <div class="za-foot"><span>${esc(ad.domain)}</span>${zaCta(ad,placement)}</div>
  </aside>`;
}
/* A compact banner above conversations. */
function zaBanner(placement){
  const ad=zaPick(placement);if(!ad)return '';
  const id=esc(ad.id),thumb=imageSrc(ad.logoUrl)||(ad.format==='banner'?imageSrc(ad.mediaUrl):'');
  return `<aside class="za-banner" data-za-slot="${placement}" data-za-id="${id}" aria-label="Sponsored by ${esc(ad.advertiser)}">
    <span class="za-thumb" onclick="zaOpen('${id}','${placement}')" aria-hidden="true">${thumb?`<img src="${thumb}" alt="" loading="lazy" decoding="async">`:hi('playFill',18)}</span>
    <span class="za-banner-copy" onclick="zaOpen('${id}','${placement}')"><b>${esc(ad.headline)}</b><small>${esc(ad.advertiser)} · Sponsored</small></span>
    ${zaCta(ad,placement)}<button type="button" class="za-info za-info-icon" onclick="zaAbout('${id}')" aria-label="About this ad">${hi('info',16)}</button>
  </aside>`;
}

/* Screens are redrawn with innerHTML. Each video element is kept and moved into
   its new place in the same task, so playback and sound carry on uninterrupted. */
function zaVideo(ad){
  let video=ZAds.videos.get(ad.id);
  if(video&&video.dataset.src===ad.mediaUrl)return video;
  video?.pause();
  video=document.createElement('video');
  video.className='za-video';video.muted=true;video.defaultMuted=true;video.loop=true;video.playsInline=true;video.preload='metadata';video.disablePictureInPicture=true;
  for(const name of ['muted','playsinline','disableremoteplayback'])video.setAttribute(name,'');
  video.setAttribute('aria-hidden','true');video.dataset.src=ad.mediaUrl;video.src=ad.mediaUrl+'#t=0.1';
  video.addEventListener('error',()=>video.closest('.za-media')?.classList.add('za-failed'));
  for(const type of ['play','pause','volumechange'])video.addEventListener(type,()=>zaPaintControls(ad.id));
  ZAds.videos.set(ad.id,video);return video;
}
function zaAttach(){
  document.querySelectorAll('[data-za-video]').forEach(holder=>{
    const ad=ZAds.items.find(item=>item.id===holder.dataset.zaVideo);if(!ad)return;
    const video=zaVideo(ad);if(holder.firstElementChild!==video)holder.replaceChildren(video);
  });
}
/* Updated in place, so a focused control keeps focus. */
function zaPaintControls(id){
  const el=document.querySelector(`[data-za-controls="${CSS.escape(id)}"]`),video=ZAds.videos.get(id);if(!el)return;
  const playing=video?!video.paused:false,muted=video?video.muted:true,play=el.querySelector('[data-za-control="play"]'),sound=el.querySelector('[data-za-control="sound"]');
  if(play){play.setAttribute('aria-label',playing?'Pause video':'Play video');play.innerHTML=hi(playing?'pause':'playFill',16)}
  if(sound){sound.setAttribute('aria-label',muted?'Turn sound on':'Turn sound off');sound.innerHTML=hi(muted?'volOff':'vol',16)}
}
function zaPlayback(id,visible){
  const video=ZAds.videos.get(id);if(!video?.isConnected)return;
  if(visible&&!zaReduced.matches&&!ZAds.paused.has(id)&&document.visibilityState!=='hidden'){video.preload='auto';video.play().catch(()=>{})}
  else if(!visible&&!video.paused)video.pause();
}
// Media events arrive a task later; the pressed control reflects the change at once.
function zaPlay(id){const video=ZAds.videos.get(id);if(!video)return;if(video.paused){ZAds.paused.delete(id);video.play().catch(()=>{})}else{ZAds.paused.add(id);video.pause()}zaPaintControls(id)}
function zaSound(id){const video=ZAds.videos.get(id);if(!video)return;video.muted=!video.muted;if(!video.muted&&video.paused&&!ZAds.paused.has(id))video.play().catch(()=>{});zaPaintControls(id)}
function zaPauseAll(){for(const video of ZAds.videos.values())if(!video.paused)video.pause()}

/* A view counts after the card has been at least half visible for a moment. */
function zaStopTimers(){for(const timer of ZAds.timers.values())clearTimeout(timer);ZAds.timers.clear();ZAds.visible.clear()}
function zaSeen(entries){
  for(const entry of entries){
    const slot=entry.target,id=slot.dataset.zaId,placement=slot.dataset.zaSlot,key=id+'|'+placement,visible=entry.isIntersecting&&entry.intersectionRatio>=.5;
    if(visible)ZAds.visible.add(key);else ZAds.visible.delete(key);
    if(slot.classList.contains('za-card'))zaPlayback(id,visible);
    if(!visible){clearTimeout(ZAds.timers.get(key));ZAds.timers.delete(key);continue}
    if(ZAds.counted.has(key)||ZAds.timers.has(key))continue;
    const video=slot.classList.contains('za-card')&&ZAds.items.find(ad=>ad.id===id)?.format==='video';
    ZAds.timers.set(key,setTimeout(()=>{
      ZAds.timers.delete(key);
      if(!ZAds.visible.has(key)||ZAds.counted.has(key)||document.visibilityState==='hidden')return;
      ZAds.counted.add(key);
      if(!DEMO)Native.send('ads.impression',{id,placement});
    },video?2000:1000));
  }
}
function zaObserve(){
  const slots=document.querySelectorAll('[data-za-slot]');
  if(!('IntersectionObserver' in window))return;
  ZAds.observer=ZAds.observer||new IntersectionObserver(zaSeen,{threshold:[0,.5,1]});
  ZAds.observer.disconnect();
  if(!slots.length){zaStopTimers();zaPauseAll();return}
  slots.forEach(slot=>ZAds.observer.observe(slot));
}

function zaOpen(id,placement){
  const ad=ZAds.items.find(item=>item.id===id);if(!ad||ZAds.opening)return;
  if(DEMO){appNotice(`Design preview · this would open ${ad.domain||'the advertiser’s page'}.`);return}
  ZAds.opening=id;zaPauseAll();zaPaintCta();
  Native.send('ads.click',{id,placement});
}
function zaPaintCta(){
  document.querySelectorAll('[data-za-slot] .za-cta').forEach(button=>{
    const id=button.closest('[data-za-slot]').dataset.zaId,ad=ZAds.items.find(item=>item.id===id),busy=ZAds.opening===id;if(!ad)return;
    button.disabled=!!ZAds.opening;button.setAttribute('aria-busy',String(busy));button.textContent=busy?'Opening…':ad.ctaLabel;
  });
}
function zaCloseAbout(){document.getElementById('za-about')?.close()}
function zaAbout(id){
  const ad=ZAds.items.find(item=>item.id===id);if(!ad)return;
  zaCloseAbout();
  const dialog=document.createElement('dialog');dialog.id='za-about';dialog.className='zn-dialog za-about';dialog.setAttribute('aria-labelledby','za-about-title');
  dialog.innerHTML=`<div class="zn-dialog-heading"><span>Sponsored</span><button type="button" aria-label="Close" onclick="zaCloseAbout()">${hi('close',21)}</button></div>
    <div class="za-about-body"><span class="za-about-icon">${hi('info',26)}</span><h2 id="za-about-title">About this ad</h2>
    <p>This promotion is from <b>${esc(ad.advertiser)}</b>${ad.domain?` and opens <b>${esc(ad.domain)}</b>`:''}.</p>
    <p>Ads appear for members on the free plan. BinzoLive counts when an ad is shown and tapped to measure each campaign.</p>
    <button type="button" class="za-about-premium" onclick="zaGoPremium()">${hi('crown',18)} Go ad-free with Premium</button>
    <button type="button" class="za-about-close" onclick="zaCloseAbout()">Not now</button></div>`;
  dialog.addEventListener('close',()=>dialog.remove());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
  document.body.append(dialog);dialog.showModal();
}
function zaGoPremium(){zaCloseAbout();window.ZimiThemes?.open()}

/* Each screen visit shows the next campaign in rotation and counts its own view. */
function zaBeforeNavigate(){ZAds.picks={};ZAds.counted.clear();zaStopTimers();zaCloseAbout()}
function zaReset(){
  zaStopTimers();zaCloseAbout();ZAds.observer?.disconnect();
  for(const video of ZAds.videos.values()){video.pause();video.removeAttribute('src');video.load()}
  Object.assign(ZAds,{items:[],adFree:false,picks:{},turn:{},opening:''});
  ZAds.videos.clear();ZAds.retired.clear();ZAds.counted.clear();ZAds.paused.clear();
}
Native.on('data.ads',data=>{
  ZAds.adFree=data?.adFree===true;
  ZAds.items=ZAds.adFree||!Array.isArray(data?.items)?[]:data.items.filter(zaSafe);
  for(const [id,video] of ZAds.videos)if(!ZAds.items.some(ad=>ad.id===id&&ad.format==='video')){video.pause();ZAds.videos.delete(id)}
  if(['home','all-creators','chats','summary'].includes(S.v))r();
});
Native.on('ads.retired',data=>ZAds.retired.add(data.id));
Native.on('ads.opened',data=>{if(ZAds.opening===data.id){ZAds.opening='';zaPaintCta()}});
// The shared operation.error handler already shows the message.
Native.on('operation.error',data=>{if(data.action==='ads.click'&&ZAds.opening){ZAds.opening='';zaPaintCta()}});
Native.on('app.background',()=>{zaPauseAll();zaStopTimers()});
Native.on('session.none',zaReset);Native.on('session.expired',zaReset);
zaReduced.addEventListener?.('change',()=>{if(zaReduced.matches)zaPauseAll();document.querySelectorAll('[data-za-controls]').forEach(el=>zaPaintControls(el.dataset.zaControls))});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')zaPauseAll()});
window.ZimiAds={card:zaCard,banner:zaBanner,beforeNavigate:zaBeforeNavigate,reset:zaReset};
const zaPreviousAfterRender=ZimiHome.afterRender;
ZimiHome.afterRender=()=>{zaPreviousAfterRender();zaAttach();zaObserve()};

if(DEMO){
  /* A drawn sample creative, so the preview needs no network or bundled image. */
  const art=document.createElement('canvas');art.width=1200;art.height=675;const c=art.getContext('2d');
  if(c){
    const fill=c.createLinearGradient(0,0,1200,675);fill.addColorStop(0,'#c9086a');fill.addColorStop(1,'#3b1466');c.fillStyle=fill;c.fillRect(0,0,1200,675);
    c.fillStyle='rgba(255,255,255,.12)';c.beginPath();c.arc(1040,140,300,0,Math.PI*2);c.fill();
    c.fillStyle='#160d1f';c.beginPath();c.roundRect?.(840,150,250,420,36);c.fill();c.fillStyle='#ff6fb1';c.beginPath();c.roundRect?.(862,180,206,360,22);c.fill();
    c.fillStyle='#fff';c.font='700 34px Inter, sans-serif';c.fillText('NEW ON ANDROID',80,230);c.font='800 92px Inter, sans-serif';c.fillText('Binzo Studio',80,340);c.font='500 42px Inter, sans-serif';c.fillText('Edit reels in seconds',80,410);
    ZAds.items=[{id:'00000000000000000000d001',format:'banner',advertiser:'Binzo Studio',headline:'Edit reels in seconds',body:'Templates, music and auto captions. Free on Android.',ctaLabel:'Install now',domain:'play.google.com',mediaUrl:art.toDataURL('image/png'),mediaType:'image/png',logoUrl:'',placements:['home','explore','chats','call_summary']}];
  }
}
