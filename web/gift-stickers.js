/* Authored gift stickers (web/stickers/, built by scripts/build-gift-sticker.py).
   Large originals use immutable CDN files to keep WebView HTML small. Uploaded
   media takes precedence; these are a fallback for gifts without their own art. */
const GIFT_STICKERS=[
 {name:'Heart',cover:'__GIFT_STICKER_heart-cover__',motion:'__GIFT_STICKER_heart__'},
 {name:'Golden Rose',cover:'__GIFT_STICKER_golden-rose-cover__',motion:'__GIFT_STICKER_golden-rose__'},
 {name:'Rose Waterfall',cover:'__GIFT_STICKER_rose-waterfall-cover__',motion:'__GIFT_STICKER_rose-waterfall__'}
];
function giftSticker(name){const key=String(name||'').trim().toLowerCase();return GIFT_STICKERS.find(s=>s.name.toLowerCase()===key)||null}
/* Animations are megabytes of base64; a blob URL keeps them out of every redraw's HTML. */
function giftStickerMotion(sticker){
 if(/^https:\/\//.test(sticker.motion))return sticker.motion;
 if(!sticker.motionUrl){try{const base64=sticker.motion.slice(sticker.motion.indexOf(',')+1);let bytes;if(typeof Uint8Array.fromBase64==='function')bytes=Uint8Array.fromBase64(base64);else{const data=atob(base64);bytes=new Uint8Array(data.length);for(let i=0;i<data.length;i++)bytes[i]=data.charCodeAt(i)}sticker.motionUrl=URL.createObjectURL(new Blob([bytes],{type:'image/webp'}))}catch{sticker.motionUrl=sticker.motion}}
 return sticker.motionUrl;
}
/* Keep bundled thumbnails and receipt banners static so a video call only
   decodes the active celebration. Uploaded artwork remains authoritative: the
   catalog has no separate cover URL, so never substitute a same-named sticker. */
function giftSourceUrl(raw){if(!homeGiftUrl(raw||''))return '';try{return new URL(raw).href}catch{return ''}}
function giftStillResource(name,mediaUrl,coverUrl){
 const uploaded=giftSourceUrl(mediaUrl);
 if(uploaded){
  const catalog=typeof Home!=='undefined'?Home.gifts?.find(gift=>giftSourceUrl(gift.mediaUrl)===uploaded):null;
  return giftSourceUrl(coverUrl||catalog?.coverUrl)||uploaded;
 }
 return giftSticker(name)?.cover||'';
}
function giftStillUrl(name,mediaUrl,coverUrl){return esc(giftStillResource(name,mediaUrl,coverUrl))}
function giftMotionUrl(name,mediaUrl){const uploaded=giftSourceUrl(mediaUrl);if(uploaded)return uploaded;const sticker=giftSticker(name);return sticker?(window.matchMedia('(prefers-reduced-motion: reduce)').matches?sticker.cover:giftStickerMotion(sticker)):''}
function giftIsFree(gift){return gift?.coins===0}
function giftPriceLabel(gift){return giftIsFree(gift)?'Free':n(gift?.coins)+' coins'}
function giftPriceMarkup(gift,size=13){return giftIsFree(gift)?'Free':coinIcon(size)+' '+n(gift?.coins)}
