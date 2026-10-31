/* Confirmed gifts play once over the conversation. The shared player lives
   outside screen redraws and never changes chat DOM, focus or scrolling. */
window.ZimiChatGifts=(()=>{
  const seen=new Map();
  let owner='',foreground=true;
  const account=()=>String(S.user?.id||S.user?._id||(DEMO?'preview':''));
  const thread=()=>S.v==='thread'&&S.h?String(S.h):'';
  const available=peer=>!!account()&&foreground&&!document.hidden&&thread()===peer;
  const player=ZimiGiftPlayback.create({
    id:'zc-gift-playback',imageClass:'zc-gift-playback-art',
    available:item=>available(item.peer),
    obstructed:()=>!!(Home.giftTo||document.querySelector('#zc-photo-viewer,.zc-overlay,.zc-message-menu,.zh-sheet-backdrop,dialog[open]'))
  });
  function clear(reset=false){
    player.clear();
    if(reset){seen.clear();ZimiGiftPlayback.resetCache()}
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
  function sync(){
    const current=account();
    if(owner!==current){clear(true);owner=current}
    player.sync();
  }
  function accept(peer,message,receipt={}){
    sync();peer=String(peer||'');
    if(!peer||message?.kind!=='gift'||message.deleted||!message.gift)return;
    const keys=identity(peer,message,receipt);if(!keys.length||remember(keys))return;
    // History, other conversations and background arrivals never replay later.
    if(!available(peer))return;
    const gift=message.gift,media=giftMotionUrl(gift.name,gift.mediaUrl||gift.image||'');
    if(!media)return;
    const catalog=Home.gifts.find(item=>String(item.id)===String(gift.giftId));
    const catalogDuration=catalog&&giftMotionUrl(catalog.name,catalog.mediaUrl)===media?catalog.durationMs:undefined;
    player.enqueue({peer,media,durationMs:gift.durationMs??catalogDuration,
      transferId:String(gift.transferId||receipt.id||message.id||receipt.idempotencyKey)});
  }
  Native.on('chat.message',message=>{
    if(message.kind==='gift')accept(message.from,{...message,mine:false});
  });
  // Older servers may notify a recipient before the canonical chat message.
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
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();else sync()});
  document.addEventListener('aurora:navigate',sync);
  window.addEventListener('pagehide',()=>clear());
  const afterRender=window.ZimiHome.afterRender;
  window.ZimiHome.afterRender=()=>{afterRender();sync()};
  return {accept,sync,reset:()=>{clear(true);owner=account()}};
})();
