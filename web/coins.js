/* One currency mark and one purchase/gift workflow across all app surfaces. */
const CoinUI={giftId:'',topup:false,giftError:'',paymentError:'',verifyBusy:false,focus:null,packSnapshot:null,orders:new Map(),receipts:new Map(),confirmed:new Set()};
function coinPaint(){if(Home.giftTo||S.v==='coins')r()}
function coinWalletReady(){return DEMO||(!contentPending('wallet')&&!ContentLoading.wallet.error)}
function coinHasPendingPayment(){return coinPendingPayment()||Array.from(CoinUI.orders.values()).some(p=>p.status==='PENDING')}
function coinPendingPayment(){return !!Home.checkout&&!['SUCCESS','FAILED','REVERTED'].includes(Home.checkout.status)}
function coinPrice(paise){return '₹'+(Number(paise||0)/100).toLocaleString('en-IN',{maximumFractionDigits:2})}
function coinRefresh(){if(DEMO)return;contentStart('wallet');coinPaint();Native.send('wallet.load')}
function coinSelectPack(id){if(Home.checkoutBusy||coinHasPendingPayment()||Home.checkoutAttempt)return;Home.packId=id;CoinUI.paymentError='';coinPaint()}
function coinReviewPayment(order){if(Home.checkoutBusy||CoinUI.verifyBusy)return;const payment=CoinUI.orders.get(order);if(!payment||payment.status!=='PENDING')return;Home.checkout=payment;Home.checkoutAttempt=payment.packId&&payment.idempotencyKey?{packId:payment.packId,idempotencyKey:payment.idempotencyKey,...paymentRestoredRoute(payment,Home.checkoutAttempt)}:null;CoinUI.packSnapshot=payment.coins!=null?{id:payment.packId,coins:payment.coins,pricePaise:payment.amountPaise??payment.payableAmountPaise??0,name:'Pending coin pack'}:null;CoinUI.paymentError='';coinPaint()}
function coinOtherPayments(){const other=Array.from(CoinUI.orders.values()).filter(p=>p.status==='PENDING'&&p.merchantOrderId!==Home.checkout?.merchantOrderId);return other.length?`<div class="zw-recovery"><p>${other.length} other payment${other.length===1?' is':'s are'} awaiting confirmation.</p>${other.map(p=>`<button class="zh-soft" onclick="coinReviewPayment('${domId(p.merchantOrderId)}')" ${Home.checkoutBusy||CoinUI.verifyBusy?'disabled':''}>Review pending payment${p.coins?' &middot; '+n(p.coins)+' coins':''}</button>`).join('')}</div>`:''}
function coinPaymentView(){
 const p=Home.checkout;if(!p)return '';
 const status=p.status,pending=coinPendingPayment(),title=status==='SUCCESS'?'Payment confirmed':status==='FAILED'?'Payment not completed':status==='REVERTED'?'Payment reversed':'Your payment is pending';
 const copy=status==='SUCCESS'?'Your balance updates from your confirmed wallet.':status==='FAILED'?'No coins were added for this payment. You can try again.':status==='REVERTED'?'This payment was reversed. Your wallet reflects the reversal.':'Continue your existing payment, then check its status here.';
 return `<section class="zw-payment ${pending?'is-pending':''}" role="status"><span class="zw-payment-icon">${hi(status==='SUCCESS'?'check':pending?'clock':'info',20)}</span><div><h3>${title}</h3><p>${copy}</p>${p.coins?`<strong>${n(p.coins)} coins${p.payableAmountPaise!=null?' · '+coinPrice(p.payableAmountPaise):''}</strong>`:''}${pending?`<div class="zw-payment-actions">${Home.checkoutAttempt?`<button class="zh-soft" onclick="homeCheckout(true)" ${Home.checkoutBusy||CoinUI.verifyBusy?'disabled':''}>${Home.checkoutBusy?'Opening payment…':'Continue payment'}</button>`:''}<button class="zh-soft" onclick="homeVerifyPayment()" ${CoinUI.verifyBusy||Home.checkoutBusy||!p.merchantOrderId?'disabled':''}>${CoinUI.verifyBusy?'Checking payment…':'Check payment status'}</button></div>`:''}</div></section>`;
}
function homeCoins(embedded=false){
 const selected=(Home.checkoutAttempt&&CoinUI.packSnapshot)||Home.packs.find(x=>x.id===(Home.checkoutAttempt?.packId||Home.packId))||Home.packs[0],surface=DEMO?null:contentSurface('catalog','packs','Loading coin packs'),pending=coinHasPendingPayment();
 return `<section class="zw-coins ${embedded?'zw-embedded':''}" aria-label="Zimi Coins"><div class="zw-wallet"><div class="zw-wallet-top"><span>ZIMI COINS</span><button class="zw-icon-button" aria-label="Refresh balance" onclick="coinRefresh()" ${!DEMO&&contentPending('wallet')?'disabled':''}>${hi('refresh',18)}</button></div><div class="zw-wallet-main"><div><span>Available balance</span><h2>${contentBalance()}</h2><p>For gifts and one-on-one calls</p></div>${coinIcon(76)}</div>${!embedded?`<button class="zw-history" onclick="go('transactions')">${hi('clock',15)} Transaction history ${hi('chev',16)}</button>`:''}</div>${!DEMO&&ContentLoading.wallet.error?`<div class="zw-error" role="alert">Balance unavailable. Refresh to try again.</div>`:''}${coinPaymentView()}${coinOtherPayments()}<div class="zw-section-heading"><h2>Add coins</h2><p>Choose the amount that feels right.</p></div>${surface??(Home.packs.length?`<div class="zh-packs zw-packs" role="group" aria-label="Coin packs">${Home.packs.map(x=>`<button class="${selected?.id===x.id?'selected':''}" aria-pressed="${selected?.id===x.id}" onclick="coinSelectPack('${domId(x.id)}')" ${Home.checkoutBusy||pending||Home.checkoutAttempt?'disabled':''}>${coinIcon(34)}<strong>${n(x.coins)} <small>coins</small></strong><span>${esc(x.name||'Coin pack')}</span><b>${coinPrice(x.pricePaise)}</b><i aria-hidden="true">${selected?.id===x.id?'✓':''}</i></button>`).join('')}</div>`:'<div class="zw-empty">Coin packs are currently unavailable. Please check again later.</div>')}${!surface&&selected?paymentRouteView('coins'):''}${CoinUI.paymentError?`<p class="zw-error" role="alert">${esc(CoinUI.paymentError)}</p>`:''}${!surface&&selected&&!pending?`<button class="zh-primary zw-buy" aria-label="${Home.checkoutBusy?'Opening checkout':Home.paymentsAvailable?'Get '+n(selected.coins)+' coins':'Checkout unavailable'}" onclick="homeCheckout()" ${Home.checkoutBusy||!Home.paymentsAvailable?'disabled':''}>${hi('lock',17)} ${Home.checkoutBusy?'Opening checkout…':Home.paymentsAvailable?`Get ${n(selected.coins)} coins`:'Checkout unavailable'}${Home.paymentsAvailable&&!Home.checkoutBusy?`<span>${coinPrice(selected.pricePaise)}</span>`:''}</button>`:''}<p class="zw-note">${hi('lock',14)} ${DEMO?'Design preview · sample coins only':'Coins are added only after payment is confirmed.'}</p>${!surface&&!Home.paymentsAvailable?'<p class="zw-empty">Payments are temporarily unavailable. Your existing coins are still safe.</p>':''}</section>`;
}
function homeCheckout(resume=false){
 if(Home.checkoutBusy||CoinUI.verifyBusy||window.ZimiOffline?.isOffline())return;
 if(coinHasPendingPayment()&&!resume)return;
 if(!resume&&!DEMO&&(contentPending('catalog')||ContentLoading.catalog.error||!Home.paymentsAvailable))return;
 const pack=Home.packs.find(x=>x.id===(Home.checkoutAttempt?.packId||Home.packId))||Home.packs[0];
 if(!Home.checkoutAttempt&&!pack)return;
 if(DEMO){S.bal+=pack.coins;coinPaint();appNotice('Preview coins added');return}
 if(!Home.checkoutAttempt){Home.checkoutAttempt={packId:pack.id,idempotencyKey:crypto.randomUUID(),...paymentRoutePayload('coins')};CoinUI.packSnapshot={...pack};Home.checkout=null}
 Home.checkoutBusy=true;CoinUI.paymentError='';Native.send('wallet.checkout',{...Home.checkoutAttempt});coinPaint();
}
function homeVerifyPayment(){if(!Home.checkout?.merchantOrderId||CoinUI.verifyBusy||Home.checkoutBusy||window.ZimiOffline?.isOffline())return;CoinUI.verifyBusy=true;CoinUI.paymentError='';Native.send('wallet.verify',{merchantOrderId:Home.checkout.merchantOrderId});coinPaint()}
function coinAcceptPayment(d,checkout=false){
 if(d.kind&&d.kind!=='coins')return;
 const known=CoinUI.orders.get(d.merchantOrderId);
 if(known&&['SUCCESS','FAILED','REVERTED'].includes(known.status)&&d.status==='PENDING')return;
 if(known?.status==='REVERTED'&&d.status!=='REVERTED')return;
 if(known?.status==='SUCCESS'&&d.status==='FAILED')return;
 if(d.merchantOrderId)CoinUI.orders.set(d.merchantOrderId,{...known,...d});
 if(checkout&&Home.checkoutAttempt&&d.idempotencyKey!==Home.checkoutAttempt.idempotencyKey)return;
 if(!checkout&&Home.checkout?.merchantOrderId&&d.merchantOrderId!==Home.checkout.merchantOrderId){if(coinPendingPayment()||Home.checkoutAttempt||d.status!=='PENDING'){coinPaint();return}}
 if(!checkout&&!Home.checkout&&Home.checkoutAttempt&&d.idempotencyKey!==Home.checkoutAttempt.idempotencyKey)return;
 Home.checkoutBusy=false;CoinUI.verifyBusy=false;CoinUI.paymentError='';Home.checkout={...Home.checkout,...d};
 if(['SUCCESS','FAILED','REVERTED'].includes(d.status))Home.checkoutAttempt=null;
 else if(d.idempotencyKey&&d.packId){Home.checkoutAttempt={packId:d.packId,idempotencyKey:d.idempotencyKey,...paymentRestoredRoute(d,Home.checkoutAttempt)};if(d.coins!=null)CoinUI.packSnapshot={id:d.packId,coins:d.coins,pricePaise:d.amountPaise??d.payableAmountPaise??0,name:'Pending coin pack'}}
 coinPaint();
}
function homeGifts(id){
 if(!id)return;CoinUI.focus={label:document.activeElement?.getAttribute('aria-label'),id:document.activeElement?.id};
 if(Home.giftTo!==id){CoinUI.giftId=Home.giftAttempt?.to===id?Home.giftAttempt.gift:'';CoinUI.giftError=''}
 Home.giftTo=id;CoinUI.topup=false;
 if(!DEMO){contentStart('catalog');Native.send('catalog.load')}
 r();
}
function homeSelectGift(id){if(Home.giftBusy)return;CoinUI.giftId=id;CoinUI.giftError='';coinPaint()}
function homeGiftUrl(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!/[<>"'`\s]/.test(raw)?esc(u.href):''}catch{return ''}}
function homeGiftTopup(){CoinUI.topup=true;CoinUI.paymentError='';coinPaint()}
function homeGiftSheet(){
 if(!Home.giftTo)return '';
 if(CoinUI.topup)return `<div class="zh-sheet-backdrop zw-backdrop" onclick="homeCloseGifts(event)"><section class="zh-sheet zw-sheet zw-topup" role="dialog" aria-modal="true" aria-label="Add coins"><div class="zw-topup-heading">${backButton('CoinUI.topup=false;coinPaint()',{label:'Back to gifts'})}<h2>Add coins</h2><button class="zw-icon-button" aria-label="Close gifts" onclick="homeCloseGifts()">${hi('close',20)}</button></div>${homeCoins(true)}</section></div>`;
 const h=g(Home.giftTo),recover=Home.giftAttempt?.to===Home.giftTo&&Home.giftAttempt?.gift===CoinUI.giftId,gift=Home.gifts.find(x=>x.id===CoinUI.giftId)||(recover?CoinUI.receipts.get(Home.giftAttempt.idempotencyKey):null),ready=coinWalletReady(),surface=DEMO?null:contentSurface('catalog','gifts','Loading gifts'),short=gift&&ready?Math.max(0,gift.coins-S.bal):0;
 return `<div class="zh-sheet-backdrop zw-backdrop" onclick="homeCloseGifts(event)"><section class="zh-sheet zw-sheet" role="dialog" aria-modal="true" aria-label="Send a gift"><div class="zh-sheet-heading"><div><span class="zw-eyebrow">MAKE THEIR DAY</span><h2>A gift for ${esc(h?first(h.n):'your creator')}</h2><p>Choose a gift, then send a little appreciation.</p></div><button aria-label="Close gifts" onclick="homeCloseGifts()">${hi('close',20)}</button></div><div class="zw-gift-balance"><span>${coinIcon(22)} ${contentBalance()} <small>coins available</small></span><button onclick="homeGiftTopup()" aria-label="Add coins">${hi('plus',15)} Add coins</button></div>${surface??(Home.gifts.length?`<div class="zh-gifts zw-gifts" role="group" aria-label="Choose a gift">${Home.gifts.map(x=>`<button aria-pressed="${x.id===CoinUI.giftId}" class="${x.id===CoinUI.giftId?'selected':''}" onclick="homeSelectGift('${domId(x.id)}')" ${Home.giftBusy?'disabled':''}>${homeGiftUrl(x.mediaUrl)?`<img src="${homeGiftUrl(x.mediaUrl)}" alt="">`:`<span>${esc(x.emoji||'🎁')}</span>`}<b>${esc(x.name)}</b><small>${coinIcon(14)} ${n(x.coins)}</small></button>`).join('')}</div>`:'<p class="zw-empty">No gifts are available right now.</p>')}${Home.giftAttempt&&!Home.giftBusy?`<div class="zw-recovery"><p>Your previous gift is awaiting confirmation. Check its delivery before sending another.</p><button class="zh-soft" onclick="homeRetryGift()">Check previous gift</button></div>`:''}${CoinUI.giftError?`<p class="zw-error" role="alert">${esc(CoinUI.giftError)}</p>`:''}${!ready&&!contentPending('wallet')?`<p class="zw-error" role="alert">Refresh your balance before sending. <button onclick="coinRefresh()">Retry</button></p>`:''}<div class="zw-gift-footer"><p aria-live="polite">${Home.giftBusy?'Confirming your gift…':short?`You need ${n(short)} more coins for this gift.`:gift&&ready?`${n(S.bal-gift.coins)} coins remaining after sending`:gift?'Waiting for your balance…':'Select a gift to see the total.'}</p><button class="zh-primary zw-send" aria-label="Send gift" onclick="homeSendGift()" ${Home.giftBusy||(!recover&&(!gift||!ready||surface||short||Home.giftAttempt))?'disabled':''}>${hi('gift',19)} ${Home.giftBusy?'Sending…':gift?`Send ${esc(gift.name)} · ${n(gift.coins)} coins`:'Choose a gift'}</button></div></section></div>`;
}
function homeCloseGifts(e){if(e&&e.target!==e.currentTarget)return;Home.giftTo=null;S.tray=0;if(S.sh==='gift')S.sh=0;CoinUI.topup=false;r();const saved=CoinUI.focus;if(saved){const target=saved.id?document.getElementById(saved.id):Array.from(document.querySelectorAll('button[aria-label]')).find(x=>x.getAttribute('aria-label')===saved.label);target?.focus({preventScroll:true})}}
function homeSendGift(id=CoinUI.giftId){
 if(Home.giftAttempt&&Home.giftAttempt.to===Home.giftTo&&Home.giftAttempt.gift===id)return homeRetryGift();
 if(!Home.giftTo||Home.giftBusy||!coinWalletReady()||window.ZimiOffline?.isOffline()||(!DEMO&&(contentPending('catalog')||ContentLoading.catalog.error)))return;
 const gift=Home.gifts.find(x=>x.id===id),to=Home.giftTo;if(!gift||S.bal<gift.coins)return;
 const previous=Home.giftAttempt;
 // An uncertain delivery must be retried with its original payload, even after leaving a room.
 if(previous&&(previous.to!==to||previous.gift!==id)){CoinUI.giftError='Your previous gift is still unconfirmed. Open that gift and retry to check its delivery.';coinPaint();return}
 if(!previous)Home.giftAttempt={to,gift:id,idempotencyKey:crypto.randomUUID(),coins:gift.coins,inCall:['call','voice','hcall'].includes(S.v),...(Home.stream?.id&&S.v==='live'?{streamId:Home.stream.id}:{})};
 const attempt=Home.giftAttempt;CoinUI.receipts.set(attempt.idempotencyKey,{...gift,_callId:attempt.inCall?(S.callId||(DEMO?'preview-call':null)):null});Home.giftBusy=true;CoinUI.giftError='';coinPaint();
 if(DEMO){S.bal-=gift.coins;Home.giftBusy=false;Home.giftAttempt=null;Home.giftTo=null;S.tray=0;S.sh=0;r();window.zcThreadGift?.(to,gift,attempt);coinCallGiftFeedback({...attempt,coins:gift.coins});if(S.v==='live')window.zrReceiveGift?.({senderId:'you',senderName:'You',giftName:gift.name,emoji:gift.emoji,coins:gift.coins});appNotice('Preview gift sent');return}
 Native.send('gift.send',{...attempt});
}
function homeRetryGift(){if(!Home.giftAttempt||Home.giftBusy||window.ZimiOffline?.isOffline())return;Home.giftBusy=true;CoinUI.giftError='';Native.send('gift.send',{...Home.giftAttempt});coinPaint()}
function coinGiftMatches(d){const a=Home.giftAttempt;return !!a&&d.idempotencyKey===a.idempotencyKey&&(!d.to||d.to===a.to)&&(!d.gift||d.gift===a.gift)}
function coinCallGiftFeedback(d){
 const gift=CoinUI.receipts.get(d.idempotencyKey);if(!gift?._callId)return;
 const coins=Number.isSafeInteger(d.coins)&&d.coins>0?d.coins:gift.coins;
 if(['call','voice'].includes(S.v)&&gift._callId===(S.callId||(DEMO?'preview-call':null))&&S.h===d.to){
  S.gifted=(S.gifted||0)+coins;S.giftN=(S.giftN||0)+1;
  window.zrReceiveGift?.({id:d.id||d.idempotencyKey,senderId:'you',senderName:'You',giftName:gift.name,emoji:gift.emoji,mediaUrl:gift.mediaUrl,coins});
 }else if(S.v==='summary'&&S.sum?.k==='sender'&&S.sum.callId===gift._callId){S.sum.giftV=(S.sum.giftV||0)+coins;S.sum.gifts=(S.sum.gifts||0)+1;S.sum.spent=(S.sum.spent||0)+coins;r()}
}
Native.on('gift.sent',d=>{
 if(!coinGiftMatches(d)||CoinUI.confirmed.has(d.idempotencyKey))return;
 CoinUI.confirmed.add(d.idempotencyKey);Home.giftBusy=false;Home.giftAttempt=null;CoinUI.giftError='';
 if(Home.giftTo===d.to){Home.giftTo=null;CoinUI.topup=false;S.tray=0;if(S.sh==='gift')S.sh=0;r()}
 else coinPaint();coinCallGiftFeedback(d);appNotice('Gift sent!');
});
Native.on('wallet.checkout',d=>coinAcceptPayment(d,true));
Native.on('wallet.purchase',d=>coinAcceptPayment(d));
Native.on('operation.error',d=>{
 if(d.action==='gift.send'&&coinGiftMatches(d)){Home.giftBusy=false;CoinUI.giftError=d.message||'Delivery could not be confirmed. Retry this gift.';if(['INSUFFICIENT_COINS','STREAM_UNAVAILABLE'].includes(d.code)||[400,403,404].includes(d.status)){Home.giftAttempt=null;if(d.code==='INSUFFICIENT_COINS')coinRefresh()}coinPaint()}
 if(d.action==='wallet.checkout'&&Home.checkoutAttempt?.idempotencyKey===d.idempotencyKey){Home.checkoutBusy=false;CoinUI.paymentError=d.message;const routeRejected=['PAYMENT_ROUTE_CHOICE_DISABLED','PAYMENT_ROUTE_UNAVAILABLE'].includes(d.code),uncertainRoute=['PAYIN_ROUTE_UNAVAILABLE','PAYMENT_ROUTE_CONFLICT'].includes(d.code);if(routeRejected||d.code==='PAYIN_PROVISIONING_FAILED'||(!uncertainRoute&&[400,404].includes(d.status)&&!coinPendingPayment())){Home.checkoutAttempt=null;Home.checkout=null;CoinUI.packSnapshot=null}coinPaint();if(routeRejected)paymentRoutesLoad()}
 if(d.action==='wallet.verify'&&Home.checkout?.merchantOrderId===d.merchantOrderId){CoinUI.verifyBusy=false;CoinUI.paymentError=d.message;coinPaint()}
});
document.addEventListener('aurora:navigate',()=>{if(!DEMO&&['wallet','transactions'].includes(S.v)){contentStart('transactions');Native.send('transactions.load');r()}});
document.addEventListener('keydown',e=>{if(!Home.giftTo)return;const sheet=document.querySelector('.zw-sheet');if(!sheet)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();homeCloseGifts();return}if(e.key==='Tab'){const items=Array.from(sheet.querySelectorAll('button:not(:disabled),select:not(:disabled),[tabindex="0"]'));if(!items.length)return;const first=items[0],last=items.at(-1);if(e.shiftKey&&(document.activeElement===first||!sheet.contains(document.activeElement))){e.preventDefault();last.focus()}else if(!e.shiftKey&&(document.activeElement===last||!sheet.contains(document.activeElement))){e.preventDefault();first.focus()}}},true);
window.ZimiCoins={giftReceipt:d=>CoinUI.receipts.get(d.idempotencyKey),reset:()=>{Object.assign(CoinUI,{giftId:'',topup:false,giftError:'',paymentError:'',verifyBusy:false,focus:null,packSnapshot:null});CoinUI.orders.clear();CoinUI.receipts.clear();CoinUI.confirmed.clear()},afterRender:()=>{const sheet=document.querySelector('.zw-sheet');if(sheet&&!sheet.contains(document.activeElement))sheet.querySelector('[aria-pressed="true"],button:not(:disabled)')?.focus({preventScroll:true})}};
