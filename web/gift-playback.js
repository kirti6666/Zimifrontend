/* Keep original gift bytes cached and each playback image alive outside screen
   redraws. Calls and conversations use the same loading, sizing and queue. */
window.ZimiGiftPlayback=(()=>{
  const artwork=new Map();
  const maxBytes=64*1024*1024;
  function originalFile(media){
    const cached=artwork.get(media);
    if(cached){artwork.delete(media);artwork.set(media,cached);return cached.promise}
    const entry={bytes:0,promise:null};
    entry.promise=(async()=>{
      const response=await fetch(media,{cache:'force-cache',credentials:'omit'});
      if(!response.ok||Number(response.headers.get('content-length'))>maxBytes)throw new Error('Gift artwork is unavailable');
      const blob=await response.blob();
      if(!blob.size||blob.size>maxBytes)throw new Error('Gift artwork is unavailable');
      entry.bytes=blob.size;
      if(artwork.get(media)===entry){
        let bytes=[...artwork.values()].reduce((total,value)=>total+value.bytes,0);
        for(const [key,value] of artwork){
          if(artwork.size<=3&&bytes<=maxBytes)break;
          if(key!==media){artwork.delete(key);bytes-=value.bytes}
        }
      }
      return blob;
    })().catch(error=>{if(artwork.get(media)===entry)artwork.delete(media);throw error});
    artwork.set(media,entry);return entry.promise;
  }
  function duration(value,fallback=6400){
    const time=Number(value);
    return Number.isSafeInteger(time)&&time>0?Math.max(100,Math.min(time,600000)):fallback;
  }
  function create(options){
    const queue=[];
    let active=null,portal=null,timer=null,loadingTimer=null;
    function release(item){
      if(item?.image){item.image.onload=null;item.image.onerror=null}
      if(item?.objectUrl)URL.revokeObjectURL(item.objectUrl);
    }
    function clear(){
      clearTimeout(timer);clearTimeout(loadingTimer);timer=loadingTimer=null;
      release(active);active=null;queue.length=0;portal?.remove();portal=null;
      options.onClear?.();
    }
    function position(){
      if(!portal)return;
      const bounds=options.bounds?.()||document.querySelector('.app')?.getBoundingClientRect();
      if(!bounds||bounds.width<1||bounds.height<1){portal.hidden=true;return}
      const viewport=window.visualViewport;
      const left=Math.max(bounds.left,viewport?.offsetLeft||0),top=Math.max(bounds.top,viewport?.offsetTop||0);
      const right=Math.min(bounds.right,(viewport?.offsetLeft||0)+(viewport?.width||innerWidth));
      const bottom=Math.min(bounds.bottom,(viewport?.offsetTop||0)+(viewport?.height||innerHeight));
      Object.assign(portal.style,{left:left+'px',top:top+'px',width:Math.max(0,right-left)+'px',height:Math.max(0,bottom-top)+'px'});
      portal.hidden=portal.dataset.state!=='playing'||!!options.obstructed?.()||right<=left||bottom<=top;
    }
    function finish(item){
      if(active!==item)return;
      clearTimeout(timer);clearTimeout(loadingTimer);timer=loadingTimer=null;
      release(item);portal?.remove();portal=null;active=null;
      options.onFinish?.(item);next();
    }
    async function source(item){
      try{
        const blob=await originalFile(item.media);
        if(active!==item)return;
        // A unique URL starts an animated WebP/GIF at frame one even when its
        // original URL is also displayed in a picker or persisted receipt.
        item.objectUrl=URL.createObjectURL(blob);item.image.src=item.objectUrl;
      }catch{
        if(active!==item)return;
        // Image loading works on public servers without fetch CORS. Preserve
        // signed URLs; unsigned public resources get a fresh playback identity.
        let media=item.media;
        try{const url=new URL(media);if(['https:','http:'].includes(url.protocol)&&!url.search){url.searchParams.set('_binzoGiftPlayback',item.transferId);media=url.href}}catch{}
        item.image.src=media;
      }
    }
    async function play(item){
      if(active!==item||item.at||item.decoding)return;
      if(!item.ready){
        item.decoding=true;
        if(item.image){try{await item.image.decode?.()}catch{}}
        item.decoding=false;item.ready=true;
      }
      if(active!==item)return;
      if(!options.available(item)){clear();return}
      clearTimeout(loadingTimer);loadingTimer=null;
      if(options.obstructed?.())return;
      item.at=Date.now();item.durationMs=duration(item.durationMs,item.media?6400:2400);
      portal.dataset.state='playing';portal.dataset.startedAt=String(item.at);position();
      // Start the lifetime only after the artwork is ready, so slow downloads
      // cannot consume the animation's visible playback time.
      item.timer=timer=setTimeout(()=>finish(item),item.durationMs);
      options.onStart?.(item);
    }
    function next(){
      if(active||!queue.length)return;
      if(!options.available(queue[0])){clear();return}
      if(options.obstructed?.())return;
      const item=queue.shift();active=item;
      portal=document.createElement('div');portal.id=options.id;portal.className=options.className||'';
      portal.setAttribute('aria-hidden','true');portal.dataset.state='loading';portal.dataset.transferId=item.transferId;portal.hidden=true;
      const art=options.artClass?document.createElement('div'):portal;
      if(art!==portal){art.className=options.artClass;portal.appendChild(art)}
      if(item.media){
        const image=item.image=document.createElement('img');
        image.className=options.imageClass||'';image.alt='';image.draggable=false;image.decoding='async';
        image.dataset.transferId=item.transferId;image.dataset.mediaUrl=item.media;
        image.onload=()=>play(item);image.onerror=()=>finish(item);art.appendChild(image);
      }else{
        const emoji=document.createElement('span');emoji.textContent=item.emoji||'🎁';art.appendChild(emoji);
      }
      document.body.appendChild(portal);position();
      loadingTimer=setTimeout(()=>finish(item),15000);
      if(item.media)source(item);else play(item);
      if(queue[0]?.media)originalFile(queue[0].media).catch(()=>{});
    }
    function sync(){
      if((active&&!options.available(active))||(queue.length&&!options.available(queue[0]))){clear();return}
      if(active?.ready&&!active.at)play(active);
      position();next();
    }
    function enqueue(data){
      if(!options.available(data))return;
      queue.push({...data,receivedAt:Date.now()});
      // Warm only the next gift, without competing decoders or a burst of
      // downloads while a video call is using the network.
      if(queue.length===1&&data.media)originalFile(data.media).catch(()=>{});
      next();
    }
    window.addEventListener('resize',position);
    window.visualViewport?.addEventListener('resize',position);
    window.visualViewport?.addEventListener('scroll',position);
    Native.on('keyboard',()=>requestAnimationFrame(position));
    // Some sheets/dialogs close by removing their own DOM, without r(). Resume
    // waiting gifts then as well; ignore our own portal's visibility updates.
    new MutationObserver(changes=>{
      if(!active&&!queue.length)return;
      if(changes.some(change=>!portal||!portal.contains(change.target)))sync();
    }).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open','hidden']});
    return {enqueue,sync,clear,get active(){return active},get element(){return portal}};
  }
  return {create,duration,resetCache:()=>artwork.clear()};
})();
