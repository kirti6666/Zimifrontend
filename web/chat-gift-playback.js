/* Confirmed chat gifts play once over the conversation, like the supplied
   reference. The original file supplies all artwork and motion. This portal
   lives outside screen redraws and never changes chat DOM, focus or scrolling. */
window.ZimiChatGifts=(()=>{
  const seen=new Map(),queue=[],artwork=new Map();
  let owner='',active=null,timer=null,loadingTimer=null,portal=null,foreground=true;
  const account=()=>String(S.user?.id||S.user?._id||(DEMO?'preview':''));
  const thread=()=>S.v==='thread'&&S.h?String(S.h):'';
  function clear(reset=false){
    clearTimeout(timer);clearTimeout(loadingTimer);timer=loadingTimer=null;
    if(active?.image){active.image.onload=null;active.image.onerror=null}
    if(active?.objectUrl)URL.revokeObjectURL(active.objectUrl);
    active=null;queue.length=0;portal?.remove();portal=null;
    if(reset){seen.clear();artwork.clear()}
  }
  function identity(peer,message,receipt){
    const transfer=message.gift?.transferId||receipt.id||receipt.transactionId;
    return [transfer&&'transfer:'+transfer,message.id&&'message:'+message.id,receipt.idempotencyKey&&'request:'+receipt.idempotencyKey]
      .filter(Boolean).map(key=>peer+':'+key);
  }
  function remember(keys){
    const duplicate=keys.some(key=>seen.has(key));
    keys.forEach(key=>seen.set(key,true));
    while(seen.size>2000)seen.delete(seen.keys().next().value);
    return duplicate;
  }
  function available(peer){return !!account()&&foreground&&!document.hidden&&thread()===peer}
  function obstructed(){return !!(Home.giftTo||document.querySelector('#zc-photo-viewer,.zc-overlay,.zc-message-menu,.zh-sheet-backdrop'))}
  function position(){
    if(!portal)return;
    // Use the whole visible app, including the header and composer. Confining
    // artwork to the scrolling message list makes full-screen gifts look cut off.
    const box=document.querySelector('.app')?.getBoundingClientRect();
    if(!box||box.width<1||box.height<1){portal.hidden=true;return}
    const viewport=window.visualViewport;
    const left=Math.max(box.left,viewport?.offsetLeft||0),top=Math.max(box.top,viewport?.offsetTop||0);
    const right=Math.min(box.right,(viewport?.offsetLeft||0)+(viewport?.width||innerWidth));
    const bottom=Math.min(box.bottom,(viewport?.offsetTop||0)+(viewport?.height||innerHeight));
    Object.assign(portal.style,{left:left+'px',top:top+'px',width:Math.max(0,right-left)+'px',height:Math.max(0,bottom-top)+'px'});
    portal.hidden=obstructed()||right<=left||bottom<=top;
  }
  function finish(item){
    if(active!==item)return;
    clearTimeout(timer);clearTimeout(loadingTimer);timer=loadingTimer=null;
    item.image.onload=null;item.image.onerror=null;
    if(item.objectUrl)URL.revokeObjectURL(item.objectUrl);
    portal?.remove();portal=null;active=null;
    next();
  }
  function originalFile(media){
    const cached=artwork.get(media);
    if(cached){artwork.delete(media);artwork.set(media,cached);return cached.promise}
    const entry={bytes:0,promise:null};
    entry.promise=(async()=>{
      const response=await fetch(media,{cache:'force-cache',credentials:'omit'});
      if(!response.ok||Number(response.headers.get('content-length'))>64*1024*1024)throw new Error('Gift artwork is unavailable');
      const blob=await response.blob();
      if(!blob.size||blob.size>64*1024*1024)throw new Error('Gift artwork is unavailable');
      entry.bytes=blob.size;
      if(artwork.get(media)===entry){
        let bytes=[...artwork.values()].reduce((total,value)=>total+value.bytes,0);
        for(const [key,value] of artwork){
          if(artwork.size<=3&&bytes<=64*1024*1024)break;
          if(key!==media){artwork.delete(key);bytes-=value.bytes}
        }
      }
      return blob;
    })().catch(error=>{if(artwork.get(media)===entry)artwork.delete(media);throw error});
    artwork.set(media,entry);return entry.promise;
  }
  async function source(item){
    try{
      const blob=await originalFile(item.media);
      if(active!==item)return;
      // Chromium can share a WebP timeline with the picker/receipt using its
      // original URL. A fresh Blob URL starts at frame one without altering or
      // re-downloading the cached original bytes for each confirmed gift.
      item.objectUrl=URL.createObjectURL(blob);item.image.src=item.objectUrl;
    }catch{
      if(active!==item)return;
      // Public buckets without CORS still support direct image loading. Use a
      // fresh public resource URL there; never modify signed query parameters.
      let media=item.media;
      try{const url=new URL(media);if(['https:','http:'].includes(url.protocol)&&!url.search){url.searchParams.set('_binzoGiftPlayback',item.transferId);media=url.href}}catch{}
      item.image.src=media;
    }
  }
  function next(){
    if(active||!queue.length)return;
    if(!available(queue[0].peer)){clear();return}
    if(obstructed())return;
    while(queue.length&&Date.now()-queue[0].receivedAt>60000)queue.shift();
    const item=queue.shift();if(!item)return;
    active=item;
    portal=document.createElement('div');portal.id='zc-gift-playback';
    portal.setAttribute('aria-hidden','true');portal.dataset.state='loading';
    portal.dataset.transferId=item.transferId;
    const image=item.image=document.createElement('img');
    image.className='zc-gift-playback-art';image.alt='';image.draggable=false;
    image.dataset.transferId=item.transferId;image.dataset.mediaUrl=item.media;image.decoding='async';
    image.onload=()=>{
      if(active!==item)return;
      if(!available(item.peer)){clear();return}
      clearTimeout(loadingTimer);loadingTimer=null;
      portal.dataset.state='playing';portal.dataset.startedAt=String(Date.now());
      position();timer=setTimeout(()=>finish(item),item.durationMs);
    };
    image.onerror=()=>finish(item);
    portal.appendChild(image);document.body.appendChild(portal);position();
    // A broken/slow asset cannot hold up later confirmed gifts indefinitely.
    loadingTimer=setTimeout(()=>finish(item),15000);
    source(item);
  }
  function sync(){
    const current=account();
    if(owner!==current){clear(true);owner=current}
    if((active&&!available(active.peer))||(queue.length&&!available(queue[0].peer))){clear();return}
    position();next();
  }
  function accept(peer,message,receipt={}){
    sync();peer=String(peer||'');
    if(!peer||message?.kind!=='gift'||message.deleted||!message.gift)return;
    const keys=identity(peer,message,receipt);if(!keys.length||remember(keys))return;
    // History is never offered here; receipts in another chat or in background
    // stay in history and cannot replay later when the person returns.
    if(!available(peer))return;
    const gift=message.gift,media=giftMotionUrl(gift.name,gift.mediaUrl||gift.image||'');
    if(!media)return;
    const catalog=Home.gifts.find(item=>String(item.id)===String(gift.giftId));
    const catalogDuration=catalog&&giftMotionUrl(catalog.name,catalog.mediaUrl)===media?catalog.durationMs:undefined;
    const duration=Number(gift.durationMs??catalogDuration);
    const durationMs=Number.isSafeInteger(duration)&&duration>0?Math.max(100,Math.min(duration,600000)):6400;
    if(queue.length>=12)queue.shift();
    queue.push({peer,media,durationMs,receivedAt:Date.now(),transferId:String(gift.transferId||receipt.id||message.id||receipt.idempotencyKey)});
    next();
  }
  Native.on('chat.message',message=>{
    if(message.kind==='gift')accept(message.from,{...message,mine:false});
  });
  // Older servers can notify a recipient without a canonical chat message yet.
  // This event is visual only; the persisted bubble still comes from history.
  Native.on('gift.received',receipt=>{
    if(receipt.streamId)return;
    const peer=receipt.senderId||receipt.from?.id||receipt.from;
    if(!peer||typeof peer==='object')return;
    const gift=receipt.gift&&typeof receipt.gift==='object'?receipt.gift:{};
    accept(peer,{kind:'gift',gift:{...gift,transferId:receipt.id||receipt._id||gift.transferId,
      name:receipt.giftName||gift.name,mediaUrl:receipt.mediaUrl||gift.mediaUrl,
      durationMs:receipt.durationMs??gift.durationMs}},receipt);
  });
  Native.on('app.background',()=>{foreground=false;clear()});
  Native.on('app.foreground',()=>{foreground=true;sync()});
  ['session.none','session.expired'].forEach(type=>Native.on(type,()=>{clear(true);owner=''}));
  Native.on('session',sync);
  Native.on('keyboard',()=>requestAnimationFrame(position));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();else sync()});
  document.addEventListener('aurora:navigate',sync);
  window.addEventListener('pagehide',()=>clear());
  window.addEventListener('resize',position);
  window.visualViewport?.addEventListener('resize',position);
  window.visualViewport?.addEventListener('scroll',position);
  const afterRender=window.ZimiHome.afterRender;
  window.ZimiHome.afterRender=()=>{afterRender();sync()};
  return {accept,sync,reset:()=>{clear(true);owner=account()}};
})();
