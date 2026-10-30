/* One currency mark and one purchase/gift workflow across all app surfaces. */
const CoinUI={giftId:'',giftScroll:0,topup:false,giftError:'',paymentError:'',verifyBusy:false,focus:null,packSnapshot:null,checkoutPrompt:null,orders:new Map(),dismissedOrders:new Set(),returnedOrders:new Set(),receipts:new Map(),confirmed:new Set()};
function coinPaint(){const catalog=document.querySelector('.zg-catalog');if(catalog)CoinUI.giftScroll=catalog.scrollTop;if(Home.giftTo||S.v==='coins')r()}
function coinWalletReady(){return DEMO||(!contentPending('wallet')&&!ContentLoading.wallet.error)}
function coinHasPendingPayment(){return coinPendingPayment()||Array.from(CoinUI.orders.values()).some(p=>p.status==='PENDING'&&!CoinUI.dismissedOrders.has(p.merchantOrderId))}
function coinPendingPayment(){return !!Home.checkout&&!CoinUI.dismissedOrders.has(Home.checkout.merchantOrderId)&&!['SUCCESS','FAILED','REVERTED'].includes(Home.checkout.status)}
function coinPrice(paise){return '₹'+(Number(paise||0)/100).toLocaleString('en-IN',{maximumFractionDigits:2})}
function coinRefresh(){if(DEMO)return;contentStart('wallet');coinPaint();Native.send('wallet.load')}
ZimiPullRefresh.register('coins',{refresh:()=>{contentRetry('wallet');contentRetry('catalog')},busy:()=>contentPending('wallet')||contentPending('catalog')});
function coinSelectPack(id){if(Home.checkoutBusy||coinHasPendingPayment()||Home.checkoutAttempt||CoinUI.checkoutPrompt)return;Home.packId=id;CoinUI.paymentError='';coinPaint()}
function coinReviewPayment(order){if(Home.checkoutBusy||CoinUI.verifyBusy||CoinUI.dismissedOrders.has(order))return;const payment=CoinUI.orders.get(order);if(!payment||payment.status!=='PENDING')return;Home.checkout=payment;Home.checkoutAttempt=payment.packId&&payment.idempotencyKey?{packId:payment.packId,idempotencyKey:payment.idempotencyKey,...paymentRestoredRoute(payment,Home.checkoutAttempt)}:null;CoinUI.packSnapshot=payment.coins!=null?{id:payment.packId,coins:payment.coins,pricePaise:payment.amountPaise??payment.payableAmountPaise??0,name:'Pending coin pack'}:null;CoinUI.paymentError='';coinPaint()}
function coinOtherPayments(){const other=Array.from(CoinUI.orders.values()).filter(p=>p.status==='PENDING'&&!CoinUI.dismissedOrders.has(p.merchantOrderId)&&p.merchantOrderId!==Home.checkout?.merchantOrderId);return other.length?`<div class="zw-recovery"><p>${other.length} other payment${other.length===1?' is':'s are'} awaiting confirmation.</p>${other.map(p=>`<button class="zh-soft" onclick="coinReviewPayment('${domId(p.merchantOrderId)}')" ${Home.checkoutBusy||CoinUI.verifyBusy?'disabled':''}>Review pending payment${p.coins?' &middot; '+n(p.coins)+' coins':''}</button>`).join('')}</div>`:''}
function coinPaymentView(){
 const p=Home.checkout;if(!p)return '';
 const status=p.status,pending=coinPendingPayment(),title=status==='SUCCESS'?'Payment confirmed':status==='FAILED'?'Payment not completed':status==='REVERTED'?'Payment reversed':'Your payment is pending';
 const copy=status==='SUCCESS'?'Your balance updates from your confirmed wallet.':status==='FAILED'?'No coins were added for this payment. You can try again.':status==='REVERTED'?'This payment was reversed. Your wallet reflects the reversal.':'Continue your existing payment, then check its status here.';
 return `<section class="zw-payment ${pending?'is-pending':''}" role="status"><span class="zw-payment-icon">${hi(status==='SUCCESS'?'check':pending?'clock':'info',20)}</span><div><h3>${title}</h3><p>${copy}</p>${p.coins?`<strong>${n(p.coins)} coins${p.payableAmountPaise!=null?' · '+coinPrice(p.payableAmountPaise):''}</strong>`:''}${pending?`<div class="zw-payment-actions">${Home.checkoutAttempt?`<button class="zh-soft" onclick="homeCheckout(true)" ${Home.checkoutBusy||CoinUI.verifyBusy?'disabled':''}>${Home.checkoutBusy?'Opening payment…':'Continue payment'}</button>`:''}<button class="zh-soft" onclick="homeVerifyPayment()" ${CoinUI.verifyBusy||Home.checkoutBusy||!p.merchantOrderId?'disabled':''}>${CoinUI.verifyBusy?'Checking payment…':'Check payment status'}</button></div>`:''}</div></section>`;
}
function coinWalletView(embedded){return `<div class="zw-wallet"><div class="zw-wallet-main" aria-label="Available coin balance"><h2>${coinIcon(19)} ${contentBalance()}</h2></div><span class="zw-currency" aria-label="Currency: Indian rupees">₹ INR<span aria-hidden="true"></span></span></div>`}
function coinPackBonus(pack){return Number.isSafeInteger(pack.bonusPercent)&&pack.bonusPercent>0&&pack.bonusPercent<=1000?pack.bonusPercent:0}
function coinPackArtwork(){return `<svg class="zw-pack-art" width="76" height="66" viewBox="0 0 88 76" fill="none" aria-hidden="true">${[[25,49,21],[63,49,21],[44,28,23]].map(([x,y,r])=>`<g transform="translate(${x} ${y})"><circle cy="2" r="${r}" fill="#c48700"/><circle r="${r}" fill="#f6ae00"/><circle r="${r-3}" fill="#ffdb31" stroke="#ffe867" stroke-width="1.5"/><path d="M${-r+6} -4a${r-7} ${r-7} 0 0 1 ${r-8} ${-r+11}" stroke="#fff29b" stroke-width="2.5" stroke-linecap="round"/><path d="m0-10 3 6.5 7 .9-5.2 4.9 1.4 7L0 6l-6.2 3.3 1.4-7L-10-2.6l7-.9z" fill="#fff6ac"/></g>`).join('')}</svg>`}
function coinPackView(pack,selected,pending){const bonus=coinPackBonus(pack),badge=['hot','popular'].includes(pack.badge)?pack.badge:'',subtitle=bonus?bonus+'% More':pack.name||'Coin pack';return `<button class="${selected?.id===pack.id?'selected':''}" aria-label="${esc((pack.name||'Coin pack')+', '+n(pack.coins)+' coins, '+coinPrice(pack.pricePaise)+(bonus?', '+bonus+'% more':''))}" aria-pressed="${selected?.id===pack.id}" onclick="coinSelectPack('${domId(pack.id)}')" ${Home.checkoutBusy||pending||Home.checkoutAttempt?'disabled':''}>${badge?`<span class="zw-pack-badge">${badge==='hot'?'🔥 Hot':'★ Popular'}</span>`:''}<span class="zw-pack-amount">${coinIcon(17)}<strong>${n(pack.coins)}</strong></span><span class="zw-pack-name">${esc(subtitle)}</span>${coinPackArtwork()}<b>${coinPrice(pack.pricePaise)}</b></button>`}
function coinCheckoutOwner(){return DEMO?'preview':S.user?.id||''}
function coinCloseCheckoutPrompt(restore=true){
 const prompt=CoinUI.checkoutPrompt,dialog=document.getElementById('zw-checkout-dialog');CoinUI.checkoutPrompt=null;
 if(dialog){dialog.close();dialog.remove()}
 if(restore){const target=prompt?.focus?.isConnected?prompt.focus:document.querySelector(Home.giftTo?'.zw-sheet .zw-buy':'.zw-buy');target?.focus({preventScroll:true})}
}
function coinOpenCheckoutPrompt(){
 if(CoinUI.checkoutPrompt||Home.checkoutBusy||Home.checkoutAttempt||coinHasPendingPayment())return;
 const pack=Home.packs.find(item=>item.id===Home.packId)||Home.packs[0],owner=coinCheckoutOwner();if(!pack||!owner||!DEMO&&!S.loggedIn)return;
 CoinUI.checkoutPrompt={owner,pack:{...pack},choice:null,error:'',focus:document.activeElement};
 paymentRouteEnsure();coinPaintCheckoutPrompt();
}
function coinChoosePayment(route){
 const prompt=CoinUI.checkoutPrompt;if(!prompt||!paymentCoinOptions().some(option=>option.route===route))return;
 prompt.choice=route;prompt.error='';coinPaintCheckoutPrompt();
}
function coinPaintCheckoutPrompt(){
 const prompt=CoinUI.checkoutPrompt;if(!prompt)return;
 if(prompt.owner!==coinCheckoutOwner()||!['coins'].includes(S.v)&&!(Home.giftTo&&CoinUI.topup)||Home.checkoutAttempt||coinHasPendingPayment()){coinCloseCheckoutPrompt(false);return}
 const current=Home.packs.find(pack=>pack.id===prompt.pack.id);
 if(!current){prompt.choice=null;prompt.error='This coin pack is no longer available. Close this window and choose another pack.'}
 else if(current.coins!==prompt.pack.coins||current.pricePaise!==prompt.pack.pricePaise){prompt.pack={...current};prompt.choice=null;prompt.error='This coin pack has changed. Review the new amount before continuing.'}
 const options=paymentCoinOptions(),loading=!DEMO&&(!PaymentRoutes.loaded&&!PaymentRoutes.error||PaymentRoutes.loading),error=!DEMO&&PaymentRoutes.error;
 if(prompt.choice!==null&&!options.some(option=>option.route===prompt.choice))prompt.choice=null;
 let dialog=document.getElementById('zw-checkout-dialog');const creating=!dialog,focused=document.activeElement?.id;
 if(!dialog){
  dialog=document.createElement('dialog');dialog.id='zw-checkout-dialog';dialog.className='zpm-dialog';dialog.setAttribute('aria-labelledby','zpm-checkout-title');
  dialog.addEventListener('cancel',event=>{event.preventDefault();coinCloseCheckoutPrompt()});
  dialog.addEventListener('close',()=>{dialog.remove();if(!document.getElementById('zw-checkout-dialog'))CoinUI.checkoutPrompt=null});
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)coinCloseCheckoutPrompt()});
  document.body.append(dialog);
 }
 dialog.innerHTML=`<header class="zpm-dialog-heading"><h2 id="zpm-checkout-title">Select payment method</h2><button type="button" class="zpm-close" aria-label="Close payment methods" onclick="coinCloseCheckoutPrompt()">${hi('close',20)}</button></header><p class="zpm-order-summary">${coinIcon(20)}<strong>${n(prompt.pack.coins)} coins</strong><span>${coinPrice(prompt.pack.pricePaise)}</span></p>${loading?`<div class="zpm-loading" role="status" aria-label="Loading payment methods" aria-busy="true">${skeletonLine('90%',16)}${skeletonLine('72%',16)}</div>`:error?'<div class="zpm-method-error" role="alert"><p>Payment methods could not be loaded. Please try again.</p><button type="button" onclick="paymentRoutesLoad()">Retry payment methods</button></div>':options.length?`<fieldset class="zpm-methods"><legend>Choose a payment method</legend>${options.map((option,index)=>`<label class="zpm-method ${prompt.choice===option.route?'is-selected':''}" for="zpm-method-${index}"><input type="radio" name="coin-payment-method" id="zpm-method-${index}" value="${esc(option.route)}" onchange="coinChoosePayment('${domId(option.route)}')" ${prompt.choice===option.route?'checked':''}><span><strong>${esc(option.label)}</strong><small>${esc(option.detail)}</small></span></label>`).join('')}</fieldset>`:'<div class="zpm-method-error" role="alert"><p>No payment methods are available right now.</p><button type="button" onclick="paymentRoutesLoad()">Retry payment methods</button></div>'}${prompt.error?`<p class="zpm-method-error" role="alert">${esc(prompt.error)}</p>`:''}<button type="button" id="zpm-confirm-coins" class="zh-primary zpm-confirm" onclick="coinConfirmCheckout()" ${loading||error||!current||prompt.choice===null||!options.length?'disabled':''}>Continue to payment ${hi('arrow',17)}</button><p class="zpm-security">${hi('lock',13)} ${DEMO?'Preview only. No payment is taken.':'Coins are added only after payment is confirmed.'}</p>`;
 if(creating)dialog.showModal();else if(focused&&dialog.querySelector('#'+CSS.escape(focused)))dialog.querySelector('#'+CSS.escape(focused)).focus({preventScroll:true});
}
function coinConfirmCheckout(){
 const prompt=CoinUI.checkoutPrompt;if(!prompt||prompt.owner!==coinCheckoutOwner()||Home.checkoutBusy||CoinUI.verifyBusy||Home.checkoutAttempt||coinHasPendingPayment()||window.ZimiOffline?.isOffline())return;
 const pack=Home.packs.find(item=>item.id===prompt.pack.id),option=paymentCoinOptions().find(item=>item.route===prompt.choice);
 if(!pack||!option||pack.coins!==prompt.pack.coins||pack.pricePaise!==prompt.pack.pricePaise){coinPaintCheckoutPrompt();return}
 if(!DEMO&&(contentPending('catalog')||ContentLoading.catalog.error||!Home.paymentsAvailable))return;
 if(DEMO){coinCloseCheckoutPrompt(false);S.bal+=pack.coins;coinPaint();appNotice('Preview coins added');return}
 PaymentRoutes.choices.coins=option.route;Home.packId=pack.id;
 Home.checkoutAttempt={packId:pack.id,idempotencyKey:crypto.randomUUID(),...paymentRoutePayload('coins')};CoinUI.packSnapshot={...pack};Home.checkout=null;
 coinCloseCheckoutPrompt(false);homeCheckout();
}
function homeCoins(embedded=false){
 const selected=(Home.checkoutAttempt&&CoinUI.packSnapshot)||Home.packs.find(x=>x.id===(Home.checkoutAttempt?.packId||Home.packId))||Home.packs[0],surface=DEMO?null:contentSurface('catalog','packs','Loading coin packs'),pending=coinHasPendingPayment();
 return `<section class="zw-coins zw-compact zw-reference ${embedded?'zw-embedded':''}" aria-label="BinzoLive Coins">${coinWalletView(embedded)}${!DEMO&&ContentLoading.wallet.error?`<div class="zw-error" role="alert">Balance unavailable. Refresh to try again.</div>`:''}${coinPaymentView()}${coinOtherPayments()}<div class="zw-section-heading"><h2>${DEMO||Home.packs.some(coinPackBonus)?'Welcome Bonus for You!':'Choose your coin pack'}</h2></div>${surface??(Home.packs.length?`<div class="zh-packs zw-packs" role="group" aria-label="Coin packs">${Home.packs.map(x=>coinPackView(x,selected,pending)).join('')}</div>`:'<div class="zw-empty">Coin packs are currently unavailable. Please check again later.</div>')}${CoinUI.paymentError?`<p class="zw-error" role="alert">${esc(CoinUI.paymentError)}</p>`:''}<p class="zw-note">${DEMO?'Design preview · sample coins only':'Coins are used for calls and gifts. Select a pack, then continue securely.'}</p>${!surface&&!Home.paymentsAvailable?'<p class="zw-empty">Payments are temporarily unavailable. Your existing coins are still safe.</p>':''}${!surface&&selected&&!pending?`<footer class="zw-checkout-footer"><button class="zh-primary zw-buy" aria-label="${Home.checkoutBusy?'Opening checkout':Home.paymentsAvailable?'Get '+n(selected.coins)+' coins':'Checkout unavailable'}" onclick="homeCheckout()" ${Home.checkoutBusy||!Home.paymentsAvailable?'disabled':''}>${coinIcon(19)} ${Home.checkoutBusy?'Opening checkout…':Home.paymentsAvailable?`Get ${n(selected.coins)} coins`:'Checkout unavailable'}${Home.paymentsAvailable&&!Home.checkoutBusy?`<span>${coinPrice(selected.pricePaise)}</span>`:''}</button></footer>`:''}</section>`;
}
function homeCheckout(resume=false){
 if(Home.checkoutBusy||CoinUI.verifyBusy||window.ZimiOffline?.isOffline())return;
 if(coinHasPendingPayment()&&!resume)return;
 if(!resume&&!DEMO&&(contentPending('catalog')||ContentLoading.catalog.error||!Home.paymentsAvailable))return;
 if(!Home.checkoutAttempt){if(!resume)coinOpenCheckoutPrompt();return}
 Home.checkoutBusy=true;CoinUI.paymentError='';Native.send('wallet.checkout',{...Home.checkoutAttempt});coinPaint();
}
function homeVerifyPayment(){if(!Home.checkout?.merchantOrderId||CoinUI.verifyBusy||Home.checkoutBusy||window.ZimiOffline?.isOffline())return;CoinUI.verifyBusy=true;CoinUI.paymentError='';Native.send('wallet.verify',{merchantOrderId:Home.checkout.merchantOrderId});coinPaint()}
function coinClosePurchase(){
 if(DEMO)return;
 if(Home.checkoutAttempt?.idempotencyKey)Native.send('payments.checkout.closed',{kind:'coins',idempotencyKey:Home.checkoutAttempt.idempotencyKey});
 for(const payment of [Home.checkout,...CoinUI.orders.values()])if(payment?.status==='PENDING'&&payment.merchantOrderId)Native.send('payments.checkout.closed',{kind:'coins',merchantOrderId:payment.merchantOrderId});
}
function coinLeaveTopup(){coinClosePurchase();CoinUI.topup=false;coinPaint()}
function coinPaymentReturned(d){
 if(!S.loggedIn||!d.merchantOrderId||CoinUI.returnedOrders.has(d.merchantOrderId))return;
 const known=CoinUI.orders.get(d.merchantOrderId);
 if(!known||d.status==='SUCCESS'||known.status==='SUCCESS')return;
 // Dismiss the abandoned checkout, while the native shell continues tracking
 // its real server status. A late confirmation must still update the wallet.
 CoinUI.dismissedOrders.add(d.merchantOrderId);CoinUI.returnedOrders.add(d.merchantOrderId);
 const active=Home.checkout?Home.checkout.merchantOrderId===d.merchantOrderId:!!(d.idempotencyKey&&Home.checkoutAttempt?.idempotencyKey===d.idempotencyKey);
 if(!active&&(Home.checkout||Home.checkoutAttempt||Home.checkoutBusy||CoinUI.checkoutPrompt)){coinPaint();return}
 Home.checkout=null;Home.checkoutAttempt=null;Home.checkoutBusy=false;
 CoinUI.verifyBusy=false;CoinUI.paymentError='';CoinUI.packSnapshot=null;
 coinCloseCheckoutPrompt(false);PaymentRoutes.choices.coins='';
 if(!DEMO){contentStart('wallet');contentStart('catalog');Native.send('wallet.load');Native.send('catalog.load')}
 coinPaint();if(S.v==='coins')window.zimiScrollTo?.(0);
 appNotice('Your payment failed. You can try again.');
}
function coinAcceptPayment(d,checkout=false){
 if(d.kind&&d.kind!=='coins')return;
 const known=CoinUI.orders.get(d.merchantOrderId);
 if(known&&['SUCCESS','FAILED','REVERTED'].includes(known.status)&&d.status==='PENDING')return;
 if(known?.status==='REVERTED'&&d.status!=='REVERTED')return;
 if(known?.status==='SUCCESS'&&d.status==='FAILED')return;
 if(d.merchantOrderId)CoinUI.orders.set(d.merchantOrderId,{...known,...d});
 // A restored order is history, not the checkout the user is starting now.
 // Keep it for reconciliation without interrupting a fresh package/method.
 if(d.status==='PENDING'&&Home.checkout?.merchantOrderId!==d.merchantOrderId&&(!d.idempotencyKey||Home.checkoutAttempt?.idempotencyKey!==d.idempotencyKey))CoinUI.dismissedOrders.add(d.merchantOrderId);
 // Old provider callbacks may arrive after the user starts a different pack.
 // Retain the receipt without restoring the abandoned order or its method.
 if(CoinUI.dismissedOrders.has(d.merchantOrderId))return;
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
 if(Home.giftTo!==id){CoinUI.giftId=Home.giftAttempt?.to===id?Home.giftAttempt.gift:'';CoinUI.giftError='';CoinUI.giftScroll=0}
 Home.giftTo=id;CoinUI.topup=false;
 if(!DEMO){contentStart('catalog');Native.send('catalog.load')}
 r();
}
function homeSelectGift(id){if(Home.giftBusy)return;CoinUI.giftId=id;CoinUI.giftError='';coinPaint()}
function homeGiftUrl(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!/[<>"'`\s]/.test(raw)?esc(u.href):''}catch{return ''}}
function homeGiftTopup(){CoinUI.topup=true;CoinUI.paymentError='';coinPaint()}
function homeGiftDisplayOrder(){
 const names=['rosewaterfall','rose','kiss','berry','bear','cheers','party','tulip','bunny','blossom','bouquet','hibiscus'];
 const rank=name=>{const index=names.indexOf(String(name).toLowerCase().replace(/[^a-z0-9]/g,''));return index<0?names.length:index};
 return [...Home.gifts].sort((a,b)=>rank(a.name)-rank(b.name));
}
function homeGiftTile(gift){
 const artwork=giftMotionUrl(gift.name,gift.mediaUrl);
 return `<button type="button" data-gift-id="${domId(gift.id)}" aria-pressed="${gift.id===CoinUI.giftId}" aria-label="${esc(gift.name)}, ${giftPriceLabel(gift)}" class="zg-gift ${gift.id===CoinUI.giftId?'selected':''}" onclick="homeSelectGift('${domId(gift.id)}')" ${Home.giftBusy?'disabled':''}><span class="zg-art">${artwork?`<img src="${artwork}" alt="" loading="lazy" decoding="async">`:`<span class="zg-emoji" aria-hidden="true">${esc(gift.emoji||'🎁')}</span>`}</span><b>${esc(gift.name)}</b><small class="zg-price">${giftIsFree(gift)?'Free':coinIcon(14)+'<span>'+n(gift.coins)+'</span>'}</small></button>`;
}
function homeGiftSheet(){
 if(!Home.giftTo)return '';
 if(CoinUI.topup)return `<div class="zh-sheet-backdrop zw-backdrop" onclick="homeCloseGifts(event)"><section class="zh-sheet zw-sheet zw-topup" role="dialog" aria-modal="true" aria-label="Add coins"><div class="zw-topup-heading">${backButton('coinLeaveTopup()',{label:'Back to gifts'})}<h2>Add coins</h2><button class="zw-icon-button" aria-label="Close gifts" onclick="homeCloseGifts()">${hi('close',20)}</button></div>${homeCoins(true)}</section></div>`;
 const recover=Home.giftAttempt?.to===Home.giftTo&&Home.giftAttempt?.gift===CoinUI.giftId,gift=Home.gifts.find(x=>x.id===CoinUI.giftId)||(recover?CoinUI.receipts.get(Home.giftAttempt.idempotencyKey):null),ready=giftIsFree(gift)||coinWalletReady(),surface=DEMO?null:contentPending('catalog')?contentSkeleton('gifts','Loading gifts',12):ContentLoading.catalog.error?contentError('catalog'):null,short=gift&&ready?Math.max(0,gift.coins-S.bal):0;
 const footer=gift||Home.giftBusy||Home.giftAttempt?`<div class="zw-gift-footer"><p aria-live="polite">${Home.giftBusy?'Confirming your gift…':short?`You need ${n(short)} more coins for this gift.`:giftIsFree(gift)?'No coins needed.':gift&&ready?`${n(S.bal-gift.coins)} coins remaining after sending`:gift?'Waiting for your balance…':'Select a gift to see the total.'}</p><button type="button" class="zh-primary zw-send" aria-label="Send gift" onclick="homeSendGift()" ${Home.giftBusy||(!recover&&(!gift||!ready||surface||short||Home.giftAttempt))?'disabled':''}>${hi('gift',19)} ${Home.giftBusy?'Sending…':gift?`Send ${esc(gift.name)} · ${giftPriceLabel(gift)}`:'Choose a gift'}</button></div>`:'';
 return `<div class="zh-sheet-backdrop zw-backdrop zg-reference-backdrop" onclick="homeCloseGifts(event)"><section class="zh-sheet zw-sheet zg-reference" role="dialog" aria-modal="true" aria-label="Send a gift"><header class="zg-heading"><div class="zg-heading-copy"><h2>Send a gift</h2><p>Coins go straight to the host</p></div><button type="button" class="zg-balance" aria-label="Add coins" onclick="homeGiftTopup()">${coinIcon(17)}<span>${contentBalance()}</span>${hi('plus',13)}</button><button type="button" class="zg-close" aria-label="Close gifts" onclick="homeCloseGifts()">${hi('close',19)}</button></header><div class="zg-catalog">${surface??(Home.gifts.length?`<div class="zh-gifts zw-gifts" role="group" aria-label="Choose a gift">${homeGiftDisplayOrder().map(homeGiftTile).join('')}</div>`:'<p class="zw-empty">No gifts are available right now.</p>')}${Home.giftAttempt&&!Home.giftBusy?`<div class="zw-recovery"><p>Your previous gift is awaiting confirmation. Check its delivery before sending another.</p><button class="zh-soft" onclick="homeRetryGift()">Check previous gift</button></div>`:''}${CoinUI.giftError?`<p class="zw-error" role="alert">${esc(CoinUI.giftError)}</p>`:''}${!ready&&!contentPending('wallet')?`<p class="zw-error" role="alert">Refresh your balance before sending. <button onclick="coinRefresh()">Retry</button></p>`:''}</div>${footer}</section></div>`;
}
function homeCloseGifts(e){if(e&&e.target!==e.currentTarget)return;if(CoinUI.topup)coinClosePurchase();Home.giftTo=null;S.tray=0;if(S.sh==='gift')S.sh=0;CoinUI.topup=false;r();const saved=CoinUI.focus;if(saved){const target=saved.id?document.getElementById(saved.id):Array.from(document.querySelectorAll('button[aria-label]')).find(x=>x.getAttribute('aria-label')===saved.label);target?.focus({preventScroll:true})}}
function homeSendGift(id=CoinUI.giftId){
 if(Home.giftAttempt&&Home.giftAttempt.to===Home.giftTo&&Home.giftAttempt.gift===id)return homeRetryGift();
 const gift=Home.gifts.find(x=>x.id===id),to=Home.giftTo;
 if(!to||!gift||Home.giftBusy||(!giftIsFree(gift)&&(!coinWalletReady()||S.bal<gift.coins))||window.ZimiOffline?.isOffline()||(!DEMO&&(contentPending('catalog')||ContentLoading.catalog.error)))return;
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
 const saved=CoinUI.receipts.get(d.idempotencyKey),gift=d.giftDetails?{...saved,...d.giftDetails,_callId:saved?._callId}:saved;if(!gift?._callId)return;
 const coins=Number.isSafeInteger(d.coins)&&d.coins>=0?d.coins:gift.coins;
 if(['call','voice'].includes(S.v)&&gift._callId===(S.callId||(DEMO?'preview-call':null))&&S.h===d.to){
  S.gifted=(S.gifted||0)+coins;S.giftN=(S.giftN||0)+1;
  window.zrReceiveGift?.({id:d.id||d.idempotencyKey,senderId:'you',senderName:'You',giftName:gift.name,emoji:gift.emoji,mediaUrl:gift.mediaUrl,durationMs:gift.durationMs,coins});
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
Native.on('wallet.payment-returned',coinPaymentReturned);
Native.on('operation.error',d=>{
 if(d.action==='gift.send'&&coinGiftMatches(d)){Home.giftBusy=false;CoinUI.giftError=d.message||'Delivery could not be confirmed. Retry this gift.';if(['INSUFFICIENT_COINS','STREAM_UNAVAILABLE'].includes(d.code)||[400,403,404].includes(d.status)){Home.giftAttempt=null;if(d.code==='INSUFFICIENT_COINS')coinRefresh()}coinPaint()}
 if(d.action==='wallet.checkout'&&Home.checkoutAttempt?.idempotencyKey===d.idempotencyKey){Home.checkoutBusy=false;CoinUI.paymentError=d.message;const routeRejected=['PAYMENT_ROUTE_CHOICE_DISABLED','PAYMENT_ROUTE_UNAVAILABLE'].includes(d.code),uncertainRoute=['PAYIN_ROUTE_UNAVAILABLE','PAYMENT_ROUTE_CONFLICT'].includes(d.code);if(routeRejected||d.code==='PAYIN_PROVISIONING_FAILED'||(!uncertainRoute&&[400,404].includes(d.status)&&!coinPendingPayment())){Home.checkoutAttempt=null;Home.checkout=null;CoinUI.packSnapshot=null}coinPaint();if(routeRejected)paymentRoutesLoad()}
 if(d.action==='wallet.verify'&&Home.checkout?.merchantOrderId===d.merchantOrderId){CoinUI.verifyBusy=false;CoinUI.paymentError=d.message;coinPaint()}
});
document.addEventListener('aurora:navigate',()=>{if(S.v!=='coins'&&!(Home.giftTo&&CoinUI.topup))coinClosePurchase();if(!DEMO&&['wallet','transactions'].includes(S.v)){contentStart('transactions');Native.send('transactions.load');r()}});
document.addEventListener('keydown',e=>{if(CoinUI.checkoutPrompt){if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();coinCloseCheckoutPrompt()}return}if(!Home.giftTo)return;const sheet=document.querySelector('.zw-sheet');if(!sheet)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();homeCloseGifts();return}if(e.key==='Tab'){const items=Array.from(sheet.querySelectorAll('button:not(:disabled),select:not(:disabled),[tabindex="0"]'));if(!items.length)return;const first=items[0],last=items.at(-1);if(e.shiftKey&&(document.activeElement===first||!sheet.contains(document.activeElement))){e.preventDefault();last.focus()}else if(!e.shiftKey&&(document.activeElement===last||!sheet.contains(document.activeElement))){e.preventDefault();first.focus()}}},true);
window.ZimiCoins={giftReceipt:d=>CoinUI.receipts.get(d.idempotencyKey),reset:()=>{coinCloseCheckoutPrompt(false);Object.assign(CoinUI,{giftId:'',giftScroll:0,topup:false,giftError:'',paymentError:'',verifyBusy:false,focus:null,packSnapshot:null});CoinUI.orders.clear();CoinUI.dismissedOrders.clear();CoinUI.returnedOrders.clear();CoinUI.receipts.clear();CoinUI.confirmed.clear()},afterRender:()=>{coinPaintCheckoutPrompt();const catalog=document.querySelector('.zg-catalog');if(catalog){catalog.scrollTop=CoinUI.giftScroll;catalog.onscroll=()=>{if(catalog.isConnected)CoinUI.giftScroll=catalog.scrollTop}}const sheet=document.querySelector('.zw-sheet');if(sheet&&!CoinUI.checkoutPrompt&&!sheet.contains(document.activeElement))sheet.querySelector('[aria-pressed="true"],button:not(:disabled)')?.focus({preventScroll:true})}};
