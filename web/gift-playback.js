/* Keep original gift bytes cached and each playback image alive outside screen
   redraws. Calls and conversations share presentation, never financial state. */
window.ZimiGiftPlayback=(()=>{
  const artwork=new Map(),warmImages=new Map(),maxBytes=64*1024*1024,maxEntries=3;
  function fetchSource(media){
    // Older immutable CDN responses were cached before gift CORS was enabled.
    // One stable version refreshes those headers without a per-play download.
    // Existing queries may be signed and must remain byte-for-byte unchanged.
    try{const url=new URL(media);if(['https:','http:'].includes(url.protocol)&&!url.search){url.searchParams.set('binzoGiftCache','2');return url.href}}catch{}
    return media;
  }
  function networkSource(media,identity){
    const url=new URL(fetchSource(media));
    url.hash='binzoGiftPlayback='+encodeURIComponent(identity||crypto.randomUUID());return url.href;
  }
  function isNetwork(media){try{return ['http:','https:'].includes(new URL(media).protocol)}catch{return false}}
  function motionImage(item){
    const current=item.image?.currentSrc;
    if(!current||!item.motionSource)return false;
    // Chromium may retain the first subscriber's fragment when two transfer
    // images share one in-flight HTTP resource. Fragments never identify bytes.
    return item.progressive?current.split('#')[0]===item.motionSource.split('#')[0]:current===item.motionSource;
  }
  function stopUnusedWarm(media){
    const entry=artwork.get(media);
    if(entry&&!entry.ready&&!entry.users){entry.warm=false;artwork.delete(media);entry.controller.abort()}
    const image=warmImages.get(media);if(image?.image){warmImages.delete(media);image.finish(false)}
  }
  function trim(){
    let bytes=[...artwork.values()].reduce((total,value)=>total+value.bytes,0);
    for(const [key,entry] of artwork){
      if(artwork.size<=maxEntries&&bytes<=maxBytes)break;
      if(entry.users)continue;
      artwork.delete(key);bytes-=entry.bytes;
      if(!entry.ready)entry.controller.abort();
    }
  }
  function originalFile(media,retain=false,completedImage=false){
    let entry=artwork.get(media);
    if(entry){artwork.delete(media);artwork.set(media,entry)}
    else{
      entry={bytes:0,users:0,warm:false,ready:false,controller:new AbortController(),promise:null};
      entry.promise=(async()=>{
        const response=await fetch(fetchSource(media),{cache:'force-cache',credentials:'omit',signal:entry.controller.signal,priority:retain?'auto':'low'});
        if(!response.ok||Number(response.headers.get('content-length'))>maxBytes)throw new Error('Gift artwork is unavailable');
        const blob=await response.blob();
        if(!blob.size||blob.size>maxBytes)throw new Error('Gift artwork is unavailable');
        entry.bytes=blob.size;entry.ready=true;trim();return blob;
      })().catch(error=>{if(artwork.get(media)===entry)artwork.delete(media);throw error});
      artwork.set(media,entry);
    }
    if(completedImage)entry.completedImage=true;
    if(retain){entry.users++;entry.warm=false}else entry.warm=true;
    trim();
    if(!retain)return entry.promise;
    let released=false;
    return {promise:entry.promise,release:()=>{
      if(released)return;released=true;entry.users--;
      if(!entry.ready&&!entry.users&&!entry.warm){
        if(artwork.get(media)===entry)artwork.delete(media);
        entry.controller.abort();
      }
      trim();
    }};
  }
  function warmImage(media){
    let entry=warmImages.get(media);
    if(entry){warmImages.delete(media);warmImages.set(media,entry);return entry.promise}
    entry={image:new Image(),promise:null,finish:null};
    entry.promise=new Promise(resolve=>{
      entry.finish=ready=>{
        if(!entry.image)return;
        entry.image.onload=entry.image.onerror=null;entry.image.removeAttribute('src');entry.image=null;resolve(ready);
        if(!ready&&warmImages.get(media)===entry)warmImages.delete(media);
      };
      entry.image.decoding='async';entry.image.onload=()=>entry.finish(true);entry.image.onerror=()=>entry.finish(false);entry.image.src=media;
    });
    warmImages.set(media,entry);
    while(warmImages.size>maxEntries){const [key,old]=warmImages.entries().next().value;warmImages.delete(key);old.finish(false)}
    return entry.promise;
  }
  function preload(media){
    if(!media)return Promise.resolve(false);
    // Selecting another gift must not leave several large originals downloading
    // on the call's connection. Active/queued consumers hold explicit leases.
    for(const [key,entry] of artwork)if(key!==media&&!entry.ready&&entry.warm){
      entry.warm=false;
      if(!entry.users){artwork.delete(key);entry.controller.abort()}
    }
    for(const [key,entry] of warmImages)if(key!==media&&entry.image){warmImages.delete(key);entry.finish(false)}
    return warmImages.has(media)?warmImage(media):originalFile(media).then(()=>true,error=>error?.name==='AbortError'?false:warmImage(media));
  }
  function duration(value,fallback=6400){
    const time=Number(value);
    return Number.isSafeInteger(time)&&time>0?Math.max(100,Math.min(time,600000)):fallback;
  }
  function create(options){
    const queue=[],identities=new Map(),history=[];
    let active=null,portal=null,timer=null,loadingTimer=null;
    const keys=data=>[data.requestId&&'request:'+data.requestId,data.transferId&&'transfer:'+data.transferId].filter(Boolean);
    function remember(item,aliases=keys(item)){
      for(const key of aliases){identities.set(key,item);item.aliases.add(key)}
      if(!history.includes(item))history.push(item);
      // Keep completed aliases for late confirmations and same-request retries.
      while(history.length>500){
        const index=history.findIndex(value=>value!==active&&!queue.includes(value));
        if(index<0)break;
        const [old]=history.splice(index,1);
        for(const key of old.aliases)if(identities.get(key)===old)identities.delete(key);
      }
    }
    function release(item){
      if(item?.frameRequest)cancelAnimationFrame(item.frameRequest);
      item?.releaseFile?.();item?.releaseWarm?.();
      if(item){item.releaseFile=null;item.releaseWarm=null}
      if(item?.image){item.image.onload=null;item.image.onerror=null;item.image.removeAttribute('src');item.image=null}
      if(item?.objectUrl){URL.revokeObjectURL(item.objectUrl);item.objectUrl=null}
      if(item){clearFeedback(item);item.art=null;item.loading=null}
    }
    function clearFeedback(item){
      for(const property of ['background-image','background-size','background-position','background-repeat'])item.art?.style.removeProperty(property);
      item.loading?.remove();item.loading=null;
    }
    function clear(reset=false){
      clearTimeout(timer);clearTimeout(loadingTimer);timer=loadingTimer=null;
      if(active){active.state='cancelled';release(active)}
      queue.forEach(item=>{item.state='cancelled';release(item)});active=null;queue.length=0;portal?.remove();portal=null;
      if(reset){identities.clear();history.length=0}
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
      portal.hidden=!!options.obstructed?.()||right<=left||bottom<=top;
    }
    function finish(item,advance=true){
      if(active!==item)return;
      clearTimeout(timer);clearTimeout(loadingTimer);timer=loadingTimer=null;
      item.state='done';release(item);portal?.remove();portal=null;active=null;
      options.onFinish?.(item);if(advance)next();
    }
    async function source(item){
      let lease;
      try{
        const cached=artwork.get(item.media);
        if(isNetwork(item.media)&&!cached?.ready&&!cached?.completedImage){
          item.releaseWarm?.();item.releaseWarm=null;
          // A cold animation can paint authored frames as they arrive. Waiting
          // for a complete Blob would delay a large original by many seconds.
          // Stop unused selection fetches before the image owns this download.
          stopUnusedWarm(item.media);
          item.progressive=true;item.motionSource=networkSource(item.media,item.transferId||item.requestId);
          item.image.crossOrigin='anonymous';item.image.fetchPriority='high';item.image.src=item.motionSource;
          const incoming=()=>{
            if(active!==item||!item.image)return;
            if(motionImage(item)&&item.image.naturalWidth){clearFeedback(item);item.frameRequest=null}
            else item.frameRequest=requestAnimationFrame(incoming);
          };
          item.frameRequest=requestAnimationFrame(incoming);return;
        }
        lease=originalFile(item.media,true);item.releaseFile=lease.release;
        // Acquire the active lease before releasing the queued one. A pending
        // fill from a fully loaded original must survive this handoff.
        item.releaseWarm?.();item.releaseWarm=null;
        const blob=await lease.promise;
        if(active!==item)return;
        // A unique original-byte URL restarts animation from frame one. Never
        // resize/re-encode uploads or wait for decoding every animation frame.
        item.objectUrl=URL.createObjectURL(blob);item.motionSource=item.objectUrl;item.image.src=item.objectUrl;
      }catch(error){
        if(active!==item)return;
        if(error?.name==='AbortError'){finish(item);return}
        // Public hosts may allow image loading without fetch CORS. Preserve
        // signed URLs and give unsigned playback a fresh resource identity.
        const media=isNetwork(item.media)?networkSource(item.media,item.transferId||item.requestId):item.media;
        item.motionSource=media;item.image.src=media;
      }finally{lease?.release();if(item.releaseFile===lease?.release)item.releaseFile=null}
    }
    async function cacheCompleted(item){
      if(item.cacheFillStarted||item.corsRetried)return;
      item.cacheFillStarted=true;
      // Anonymous image loading and this fetch share the same stable HTTP cache
      // entry. Keep the displayed network image alive; only later gifts use a
      // fresh Blob URL, so filling the byte cache never restarts this animation.
      const lease=originalFile(item.media,true,true);item.releaseFile=lease.release;
      try{await lease.promise}catch{}
      finally{lease.release();if(item.releaseFile===lease.release)item.releaseFile=null}
    }
    function play(item){
      if(active!==item||item.at)return;
      item.ready=true;
      if(!options.available(item)){clear();return}
      clearTimeout(loadingTimer);loadingTimer=null;
      if(options.obstructed?.())return;
      item.at=Date.now();item.durationMs=duration(item.durationMs,item.media?6400:2400);item.state='playing';
      clearFeedback(item);
      portal.dataset.state='playing';portal.dataset.startedAt=String(item.at);position();
      // Downloads and poster visibility do not consume motion playback time.
      item.timer=timer=setTimeout(()=>finish(item),item.durationMs);
      options.onStart?.(item);
    }
    function next(){
      if(active||!queue.length)return;
      if(!options.available(queue[0])){clear();return}
      if(options.obstructed?.())return;
      const item=queue.shift();active=item;item.state='loading';
      portal=document.createElement('div');portal.id=options.id;portal.className=options.className||'';
      portal.setAttribute('aria-hidden','true');portal.dataset.state='loading';portal.dataset.transferId=item.transferId||item.requestId||'';
      portal.dataset.provisional=String(!!item.provisional);
      const art=options.artClass?document.createElement('div'):portal;
      item.art=art;
      if(art!==portal){art.className=options.artClass;portal.appendChild(art)}
      if(item.media){
        const image=item.image=document.createElement('img');
        image.className=options.imageClass||'';image.alt='';image.draggable=false;image.decoding='async';
        image.dataset.transferId=item.transferId||item.requestId||'';image.dataset.mediaUrl=item.media;
        image.onload=()=>{
          if(active!==item)return;
          if(motionImage(item)&&image.complete&&image.naturalWidth){play(item);if(item.progressive&&active===item)cacheCompleted(item)}
          else{item.loading?.remove();item.loading=null}
        };
        image.onerror=()=>{
          if(active!==item||!item.motionSource||image.getAttribute('src')!==item.motionSource)return;
          if(item.progressive&&!item.corsRetried){item.corsRetried=true;image.removeAttribute('crossorigin');image.src=item.motionSource;return}
          finish(item);
        };
        art.appendChild(image);
        // A separate static still survives while the network image has no
        // frames. Never load an animation URL again as its own background.
        if(item.poster&&item.poster!==item.media){
          art.style.setProperty('background-image','url('+JSON.stringify(item.poster)+')','important');
          art.style.setProperty('background-size','contain','important');
          art.style.setProperty('background-position','center','important');
          art.style.setProperty('background-repeat','no-repeat','important');
        }
        const loading=item.loading=document.createElement('span');
        loading.textContent='Loading gift…';loading.dataset.giftLoading='';
        Object.assign(loading.style,{position:'absolute',fontSize:'14px',lineHeight:'1.4'});art.appendChild(loading);
      }else{
        const emoji=document.createElement('span');emoji.textContent=item.emoji||'🎁';art.appendChild(emoji);
      }
      document.body.appendChild(portal);position();options.onLoading?.(item);
      loadingTimer=setTimeout(()=>finish(item),60000);
      if(item.media)source(item);else play(item);
      warmNext();
    }
    function warmNext(){
      const item=queue[0];if(!item?.media||item.releaseWarm)return;
      // Do not fetch a second cold copy while the active image is streaming.
      // Completed originals remain pinned for the next queued transfer.
      const cached=artwork.get(item.media);
      if(isNetwork(item.media)&&!cached?.ready&&!cached?.completedImage)return;
      const lease=originalFile(item.media,true);item.releaseWarm=lease.release;
      lease.promise.catch(()=>{});
    }
    function sync(){
      if((active&&!options.available(active))||(queue.length&&!options.available(queue[0]))){clear();return}
      if(active?.ready&&!active.at)play(active);
      position();next();
    }
    function enqueue(data){
      if(!options.available(data)||keys(data).some(key=>identities.has(key)))return false;
      const item={...data,aliases:new Set(),receivedAt:Date.now(),state:'queued'};
      remember(item);
      // Priority insertion can finish the current image before next() runs.
      // Reserve its existing byte fill first, without starting a cold fetch.
      const cached=artwork.get(item.media);
      if(cached?.completedImage&&!cached.ready){
        const lease=originalFile(item.media,true);item.releaseWarm=lease.release;
        lease.promise.catch(()=>{});
      }
      if(data.priority){if(active)finish(active,false);queue.unshift(item)}else queue.push(item);
      next();warmNext();return true;
    }
    function confirm(requestId,transferId,updates){
      const knownTransfer=transferId&&identities.get('transfer:'+transferId);
      let item=identities.get('request:'+requestId)||knownTransfer;
      if(!item)return false;
      if(item.state==='cancelled'&&knownTransfer&&updates&&typeof updates==='object'&&'media' in updates&&updates.media===knownTransfer.media)item=knownTransfer;
      if(updates&&typeof updates==='object'&&'media' in updates&&updates.media!==item.media){
        // A catalog edit while sending cannot authorize showing the old gift
        // in place of the server's receipt. Let the wrapper enqueue its source.
        if(active===item)finish(item,false);
        const index=queue.indexOf(item);if(index>=0)queue.splice(index,1);
        item.state='cancelled';release(item);options.onCancel?.(item);return false;
      }
      const duplicate=transferId&&identities.get('transfer:'+transferId);
      if(duplicate&&duplicate!==item){
        // A socket receipt may beat the HTTP acknowledgment. Merge its aliases
        // and remove its queued presentation instead of playing the gift twice.
        if(active===duplicate)finish(duplicate,false);
        const index=queue.indexOf(duplicate);if(index>=0)queue.splice(index,1);
        duplicate.state='done';release(duplicate);remember(item,[...duplicate.aliases]);
      }
      remember(item,['request:'+requestId,...(transferId?['transfer:'+transferId]:[])]);
      if(updates&&typeof updates==='object'){
        if('gift' in updates)item.gift=updates.gift;
        if('durationMs' in updates&&!item.at)item.durationMs=updates.durationMs;
      }
      const provisional=!!item.provisional;item.provisional=false;
      if(transferId)item.transferId=String(transferId);
      if(active===item&&portal){
        portal.dataset.provisional='false';portal.dataset.transferId=item.transferId||item.requestId||'';
        if(item.image)item.image.dataset.transferId=portal.dataset.transferId;
      }
      if(provisional)options.onConfirm?.(item);
      next();warmNext();
      return true;
    }
    function cancel(requestId){
      const item=identities.get('request:'+requestId);if(!item)return false;
      if(active===item){finish(item);item.state='cancelled'}
      else{const index=queue.indexOf(item);if(index>=0)queue.splice(index,1);item.state='cancelled';release(item)}
      warmNext();
      options.onCancel?.(item);return true;
    }
    window.addEventListener('resize',position);
    window.visualViewport?.addEventListener('resize',position);
    window.visualViewport?.addEventListener('scroll',position);
    Native.on('keyboard',()=>requestAnimationFrame(position));
    // Only structural overlays or replaced surfaces need a bounds read.
    // Clock, balance and chat text never force video-call layout.
    const layoutSelector='dialog,[role="dialog"],[role="menu"],#zc-photo-viewer,.zc-overlay,.zc-message-menu,.zr-room,.app';
    const changesLayout=node=>node.nodeType===1&&(node.matches(layoutSelector)||!!node.querySelector(layoutSelector));
    new MutationObserver(changes=>{
      if(!active&&!queue.length)return;
      if(changes.some(change=>!portal?.contains(change.target)&&(change.type==='attributes'
        ?changesLayout(change.target)
        :[...change.addedNodes,...change.removedNodes].some(changesLayout))))sync();
    }).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open','hidden']});
    return {enqueue,confirm,cancel,sync,clear,get active(){return active},get element(){return portal}};
  }
  function resetCache(){
    for(const entry of artwork.values())if(!entry.ready&&!entry.users)entry.controller.abort();artwork.clear();
    for(const entry of warmImages.values())entry.finish(false);warmImages.clear();
  }
  return {create,duration,preload,resetCache};
})();
