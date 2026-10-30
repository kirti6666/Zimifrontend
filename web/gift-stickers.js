/* Animated gift stickers bundled with the app (web/stickers/, built by
   scripts/build-gift-sticker.py). Uploaded media takes precedence; bundled
   animations are a fallback for catalog gifts without their own artwork. */
const GIFT_STICKERS=[
 {name:'Heart',cover:'__GIFT_STICKER_heart-cover__',motion:'__GIFT_STICKER_heart__'},
 {name:'Golden Rose',cover:'__GIFT_STICKER_golden-rose-cover__',motion:'__GIFT_STICKER_golden-rose__'},
 {name:'Rose Waterfall',cover:'__GIFT_STICKER_rose-waterfall-cover__',motion:'__GIFT_STICKER_rose-waterfall__'}
];
function giftSticker(name){const key=String(name||'').trim().toLowerCase();return GIFT_STICKERS.find(s=>s.name.toLowerCase()===key)||null}
/* Animations are megabytes of base64; a blob URL keeps them out of every redraw's HTML. */
function giftStickerMotion(sticker){
 if(!sticker.motionUrl){try{const data=atob(sticker.motion.slice(sticker.motion.indexOf(',')+1)),bytes=new Uint8Array(data.length);for(let i=0;i<data.length;i++)bytes[i]=data.charCodeAt(i);sticker.motionUrl=URL.createObjectURL(new Blob([bytes],{type:'image/webp'}))}catch{sticker.motionUrl=sticker.motion}}
 return sticker.motionUrl;
}
/* Uploaded artwork is authoritative, including transparent animated WebP from
   frame ZIPs. Keep the historical helper name for existing callers, but display
   the actual animation everywhere instead of substituting a still or artwork
   chosen merely because its name matches a bundled gift. */
function giftStillUrl(name,mediaUrl){const uploaded=homeGiftUrl(mediaUrl||'');if(uploaded)return uploaded;const sticker=giftSticker(name);return sticker?giftStickerMotion(sticker):''}
function giftMotionUrl(name,mediaUrl){return giftStillUrl(name,mediaUrl)}
function giftIsFree(gift){return gift?.coins===0}
function giftPriceLabel(gift){return giftIsFree(gift)?'Free':n(gift?.coins)+' coins'}
function giftPriceMarkup(gift,size=13){return giftIsFree(gift)?'Free':coinIcon(size)+' '+n(gift?.coins)}
