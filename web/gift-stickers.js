/* Animated gift stickers bundled with the app (web/stickers/, built by
   scripts/build-gift-sticker.py). A catalog gift with the same name shows the
   sticker's still cover in gift pickers and receipts, and plays the animation
   when it is sent or received. The server catalog seeds the same names. */
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
/* Still artwork: the sticker cover, else the gift's uploaded media. Empty means use the emoji. */
function giftStillUrl(name,mediaUrl){const sticker=giftSticker(name);return sticker?sticker.cover:homeGiftUrl(mediaUrl||'')}
/* Celebration artwork: the sticker animation (its cover under reduced motion), else uploaded media. */
function giftMotionUrl(name,mediaUrl){const sticker=giftSticker(name);if(!sticker)return homeGiftUrl(mediaUrl||'');return matchMedia('(prefers-reduced-motion: reduce)').matches?sticker.cover:giftStickerMotion(sticker)}
