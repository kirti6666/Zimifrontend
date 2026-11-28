/* One currency mark and one purchase/gift workflow across all app surfaces. */
const CoinUI={giftId:'',giftScroll:0,topup:false,giftError:'',paymentError:'',verifyBusy:false,focus:null,packSnapshot:null,checkoutPrompt:null,rechargePrompt:null,orders:new Map(),dismissedOrders:new Set(),returnedOrders:new Set(),receipts:new Map(),confirmed:new Set()};
/* One refusal prompt for paid actions, including an authoritative server refusal
   after a locally sufficient balance. Opening it never spends or retries coins. */
function coinRequireRecharge(proceed=null){
 if(isHostWallet()){appNotice('Coins are for user accounts. Your host earnings are diamonds.');return}
 if(CoinUI.rechargePrompt)return;
 if(typeof ctRechargeClose==='function')ctRechargeClose();
 const focus=document.activeElement;
 CoinUI.rechargePrompt={proceed,focus,id:focus?.id,label:focus?.getAttribute('aria-label')};
 const dialog=document.createElement('dialog');dialog.id='zw-recharge-dialog';dialog.className='zw-recharge-dialog';
 dialog.setAttribute('aria-labelledby','zw-recharge-title');dialog.setAttribute('aria-describedby','zw-recharge-text');
 dialog.innerHTML=`<h2 id="zw-recharge-title">Recharge to continue</h2><p id="zw-recharge-text">Add coins to use this feature.</p><button type="button" class="zh-primary zw-recharge-primary" onclick="coinRechargeContinue()">Recharge</button><button type="button" class="zw-recharge-cancel" onclick="coinCloseRecharge()">Not now</button>`;
 dialog.addEventListener('cancel',event=>{event.preventDefault();coinCloseRecharge()});
 dialog.addEventListener('close',()=>{if(document.getElementById(dialog.id)===dialog)coinCloseRecharge()});
 document.body.append(dialog);dialog.showModal();dialog.querySelector('.zw-recharge-primary').focus();
}
function coinCloseRecharge(restore=true){
 const prompt=CoinUI.rechargePrompt;CoinUI.rechargePrompt=null;
 const dialog=document.getElementById('zw-recharge-dialog');if(dialog){dialog.close();dialog.remove()}
 if(!restore||!prompt)return;
 const target=prompt.focus?.isConnected?prompt.focus:prompt.id?document.getElementById(prompt.id):Array.from(document.querySelectorAll('button[aria-label]')).find(button=>button.getAttribute('aria-label')===prompt.label);
 target?.focus({preventScroll:true});
}
function coinRechargeContinue(){
 if(isHostWallet()){coinCloseRecharge(false);return}
 const prompt=CoinUI.rechargePrompt;if(!prompt)return;coinCloseRecharge(false);
 if(prompt.proceed)return prompt.proceed();
 if(S.v==='incoming'&&S.memberRing)return memberRingAddCoins();
 if(['call','voice','hcall','dial','dialback'].includes(S.v)){
  callMinimize();if(['call','voice','hcall','dial','dialback'].includes(S.v))return;
 }
 Home.giftTo=null;CoinUI.topup=false;S.tray=0;S.sh=0;go('coins');
}
function coinPaint(){const catalog=document.querySelector('.zw-sheet .zg-catalog');if(catalog)CoinUI.giftScroll=catalog.scrollTop;if(Home.giftTo||S.v==='coins')r()}
function coinWalletReady(){return !isHostWallet()&&(DEMO||(!contentPending('wallet')&&!ContentLoading.wallet.error))}
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
 return `<section class="zw-payment ${pending?'is-pending':''}" role="status"><span class="zw-payment-icon">${hi(status==='SUCCESS'?'check':pending?'clock':'info',20)}</span><div><h3>${title}</h3><p>${copy}</p>${p.coins?`<strong>${n(p.coins)} coins${p.payableAmountPaise!=null?' · '+coinPrice(p.payableAmountPaise):''}</strong>`:''}${pending?`<div class="zw-payment-actions">${Home.checkoutAttempt?`<button class="zh-soft" onclick="homeCheckout(true)" ${Home.checkoutBusy||CoinUI.verifyBusy?'disabled':''}>${Home.checkoutBusy?'Preparing payment…':'Continue payment'}</button>`:''}<button class="zh-soft" onclick="homeVerifyPayment()" ${CoinUI.verifyBusy||Home.checkoutBusy||!p.merchantOrderId?'disabled':''}>${CoinUI.verifyBusy?'Checking payment…':'Check payment status'}</button></div>`:''}</div></section>`;
}
function coinWalletView(embedded){return `<div class="zw-wallet"><div class="zw-wallet-main" aria-label="Available coin balance"><h2>${coinIcon(19)} ${contentBalance()}</h2></div><span class="zw-currency" aria-label="Currency: Indian rupees">₹ INR<span aria-hidden="true"></span></span></div>`}
function coinWalletError(){return !DEMO&&ContentLoading.wallet.error?'<div class="zw-error" data-coin-wallet-error role="alert">Balance unavailable. Refresh to try again.</div>':''}
function coinPackBonus(pack){return Number.isSafeInteger(pack.bonusPercent)&&pack.bonusPercent>0&&pack.bonusPercent<=1000?pack.bonusPercent:0}
function coinPackArtwork(){return `<svg class="zw-pack-art" width="76" height="66" viewBox="0 0 88 76" fill="none" aria-hidden="true">${[[25,49,21],[63,49,21],[44,28,23]].map(([x,y,r])=>`<g transform="translate(${x} ${y})"><circle cy="2" r="${r}" fill="#c48700"/><circle r="${r}" fill="#f6ae00"/><circle r="${r-3}" fill="#ffdb31" stroke="#ffe867" stroke-width="1.5"/><path d="M${-r+6} -4a${r-7} ${r-7} 0 0 1 ${r-8} ${-r+11}" stroke="#fff29b" stroke-width="2.5" stroke-linecap="round"/><path d="m0-10 3 6.5 7 .9-5.2 4.9 1.4 7L0 6l-6.2 3.3 1.4-7L-10-2.6l7-.9z" fill="#fff6ac"/></g>`).join('')}</svg>`}
function coinPackView(pack,selected,pending){const bonus=coinPackBonus(pack),badge=['hot','popular'].includes(pack.badge)?pack.badge:'',subtitle=bonus?bonus+'% More':pack.name||'Coin pack';return `<button class="${selected?.id===pack.id?'selected':''}" aria-label="${esc((pack.name||'Coin pack')+', '+n(pack.coins)+' coins, '+coinPrice(pack.pricePaise)+(bonus?', '+bonus+'% more':''))}" aria-pressed="${selected?.id===pack.id}" onclick="coinSelectPack('${domId(pack.id)}')" ${Home.checkoutBusy||pending||Home.checkoutAttempt?'disabled':''}>${badge?`<span class="zw-pack-badge">${badge==='hot'?'🔥 Hot':'★ Popular'}</span>`:''}<span class="zw-pack-amount">${coinIcon(17)}<strong>${n(pack.coins)}</strong></span><span class="zw-pack-name">${esc(subtitle)}</span>${coinPackArtwork()}<b>${coinPrice(pack.pricePaise)}</b></button>`}
function coinCheckoutOwner(){return DEMO?'preview':S.user?.id||''}
const coinUPIApps=[
 {method:'phonepe',label:'PhonePe'},
 {method:'gpay',label:'Google Pay'},
 {method:'paytm',label:'Paytm'},
 {method:'other',label:'Other UPI'}
];
const coinHostedPayment={method:'hosted',label:'PayPlus checkout'};
const coinPaymentIcons=__PAYMENT_ICONS__;
function coinPaymentIcon(method){
 const source=coinPaymentIcons[method];
 const mark=source?`<img src="${source}" alt="" width="36" height="36">`:method==='manual'?'@':hi(method==='other'?'plus':'lock',16);
 return `<span class="zpm-app-icon zpm-icon-${method}" aria-hidden="true">${mark}</span>`;
}
function coinLastUPIApp(owner,method){
 if(DEMO||!owner)return '';
 try{
  const key=`binzo.coins.last-upi.${owner}`;
  if(method&&coinUPIApps.some(app=>app.method===method))localStorage.setItem(key,method);
  return localStorage.getItem(key)||'';
 }catch{return ''}
}
function coinPaymentUpiId(payment){
 if(payment?.status!=='PENDING'||!payment.upiIntent||coinPaymentExpired(payment)||payment.isIntentSupported===false)return '';
 try{
  const intent=new URL(payment.upiIntent),id=intent.searchParams.get('pa');
  if(intent.protocol==='upi:'&&intent.hostname==='pay'&&/^[\w.+-]{1,128}@[\w.-]{1,64}$/.test(id||''))return id;
 }catch{}
 return '';
}
function coinToggleUpiId(){
 const prompt=CoinUI.checkoutPrompt;
 if(!prompt?.ready||!coinPaymentUpiId(Home.checkout))return;
 prompt.manual=!prompt.manual;prompt.copyStatus='';coinPaintCheckoutPrompt();
 if(prompt.manual)document.getElementById('zpm-manual-panel')?.scrollIntoView({block:'nearest'});
}
async function coinCopyUpiId(){
 const prompt=CoinUI.checkoutPrompt,id=coinPaymentUpiId(Home.checkout);
 if(!prompt?.manual||!id)return;
 let copied=false;
 try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(id);copied=true}}catch{}
 if(!copied&&prompt===CoinUI.checkoutPrompt){
  const field=document.getElementById('zpm-upi-id');
  if(field){field.select();try{copied=document.execCommand('copy')}catch{}}
 }
 if(prompt!==CoinUI.checkoutPrompt)return;
 prompt.copyStatus=copied?'UPI ID copied.':'Select and copy the UPI ID above.';
 const status=document.getElementById('zpm-copy-status');if(status)status.textContent=prompt.copyStatus;
}
function coinPaymentExpired(payment){return Date.parse(payment?.expiresAt||'')<=Date.now()}
function coinPaymentMethods(payment){
 if(DEMO)return coinUPIApps.map(app=>({...app,action:'pay'}));
 if(!payment||payment.status!=='PENDING'||coinPaymentExpired(payment))return [];
 const routing=payment.upiIntentRouting,platform=payment.upiPlatform,hosted=!!payment.paymentUrl;
 const native=['android','ios'].includes(platform),intents=native&&payment.isIntentSupported!==false;
 const generic=intents&&!!(routing?.generic||payment.upiIntent);
 const apps=coinUPIApps.filter(app=>app.method!=='other'||generic).map(app=>{
  let action=null;
  if(app.method==='other')action='pay';
  else if(native&&payment.upiAppsInstalled?.[app.method]===false)action='install';
  else if(intents&&routing?.apps?.[app.method]?.[platform])action='pay';
  else if(generic)action='upi';
  else if(hosted)action='checkout';
  return {...app,action};
 });
 return hosted?[...apps,{...coinHostedPayment,action:'pay'}]:apps;
}
function coinPaymentAppRows(apps,owner,disabled,hasBranded,preferCheckout){
 const last=coinLastUPIApp(owner),payable=apps.filter(app=>app.action==='pay'),
  preferred=payable.some(app=>app.method===last)?last:payable[0]?.method;
 return `<section class="zpm-methods" aria-labelledby="zpm-upi-heading">
  <header class="zpm-methods-heading"><h3 id="zpm-upi-heading">Pay using UPI app</h3><span aria-hidden="true">UPI</span></header>
  <div class="zpm-app-list">${apps.map(({method,label,action})=>{
   const name=method==='other'&&!hasBranded?'Pay with UPI app':label;
   const cta={pay:'Pay',upi:'Use UPI',checkout:'Use checkout',install:'Install'}[action]||'Unavailable';
   const accessible=method==='other'?(hasBranded?'Pay with another UPI app':name):{
    pay:'Pay with '+label,upi:'Use UPI for '+label,checkout:'Use PayPlus checkout for '+label,install:'Install '+label
   }[action]||label+' unavailable';
   return `<button id="zpm-pay-${method}" class="zpm-method zpm-upi${action==='install'?' is-install':''}${!preferCheckout&&method===preferred?' is-preferred':''}" type="button" onclick="coinOpenPayment('${method}')" aria-label="${accessible}" ${disabled||!action?'disabled':''}>
    ${coinPaymentIcon(method)}<span class="zpm-method-name"><strong>${name}</strong>${action==='pay'&&method===last?'<small>Last used</small>':''}</span><span class="zpm-pay-label">${cta}</span>
   </button>`;
  }).join('')}</div>
  ${apps.some(app=>app.action==='upi')?'<p class="zpm-app-note">Use UPI opens a compatible app on your phone.</p>':''}
 </section>`;
}
function coinPaymentUpiIdRow(prompt,id,amount,hosted,disabled){
 return `<section class="zpm-manual">
  <button id="zpm-pay-manual" class="zpm-method" type="button" aria-label="Pay with UPI ID" aria-controls="zpm-manual-panel" aria-expanded="${!!prompt.manual}" onclick="coinToggleUpiId()" ${disabled?'disabled':''}>
   ${coinPaymentIcon('manual')}<span class="zpm-method-name"><strong>Pay with UPI ID</strong></span><span class="zpm-pay-label">${prompt.manual?'Hide':'Enter'}</span>
  </button>
  ${prompt.manual?`<div id="zpm-manual-panel" class="zpm-manual-panel">
   <p>In your UPI app, enter this UPI ID and pay exactly <strong>${coinCheckoutPrice(amount)}</strong>.</p>
   <label for="zpm-upi-id">PayPlus receiving UPI ID</label>
   <div class="zpm-upi-id"><input id="zpm-upi-id" readonly value="${esc(id)}"><button type="button" onclick="coinCopyUpiId()" aria-label="Copy PayPlus receiving UPI ID">${hi('copy',16)} Copy</button></div>
   <p id="zpm-copy-status" role="status">${esc(prompt.copyStatus||'')}</p>
   <div class="zpm-manual-actions"><button type="button" class="zpm-recheck" onclick="homeVerifyPayment()" ${disabled?'disabled':''}>${CoinUI.verifyBusy?'Checking payment…':'Check payment status'}</button>${hosted?`<button type="button" class="zpm-recheck" onclick="coinOpenPayment('hosted')" ${disabled?'disabled':''}>Open PayPlus checkout</button>`:''}</div>
   ${prompt.manualStatus?`<p role="status">${esc(prompt.manualStatus)}</p>`:''}
  </div>`:''}
 </section>`;
}
function coinHostedRow(label,disabled,preferred){
 return `<button id="zpm-pay-hosted" class="zpm-method zpm-hosted${preferred?' is-preferred':''}" type="button" aria-label="${label}" onclick="coinOpenPayment('hosted')" ${disabled?'disabled':''}>
  ${coinPaymentIcon('hosted')}<span class="zpm-method-name"><strong>${label}</strong></span><span class="zpm-pay-label">Open</span>
 </button>`;
}
function coinCheckoutPrice(paise){return '₹'+(Number(paise||0)/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}
function coinCloseCheckoutPrompt(restore=true){
 const prompt=CoinUI.checkoutPrompt,dialog=document.getElementById('zw-checkout-dialog');CoinUI.checkoutPrompt=null;
 clearTimeout(prompt?.expiryTimer);
 if(dialog){dialog.close();dialog.remove()}
 if(restore&&prompt){
  coinPaint();
  const target=prompt.focus?.isConnected&&!prompt.focus.disabled?prompt.focus:document.querySelector('.zw-payment-actions>button:not(:disabled),.zw-buy:not(:disabled)');
  target?.focus({preventScroll:true});
 }
}
function coinChangeCheckoutPack(){
 const prompt=CoinUI.checkoutPrompt;if(!prompt||Home.checkoutBusy||CoinUI.verifyBusy||prompt.action)return;
 // A provisioned but unopened order stays tracked for late confirmation. An
 // uncertain prepare has no order ID yet and must keep its original attempt.
 if(Home.checkoutAttempt&&!Home.checkout?.merchantOrderId){coinCloseCheckoutPrompt();return}
 if(coinPendingPayment())CoinUI.dismissedOrders.add(Home.checkout.merchantOrderId);
 if(Home.checkoutAttempt)Native.send('payments.checkout.closed',{kind:'coins',idempotencyKey:Home.checkoutAttempt.idempotencyKey});
 Home.checkout=null;Home.checkoutAttempt=null;CoinUI.packSnapshot=null;CoinUI.paymentError='';
 coinCloseCheckoutPrompt(false);coinPaint();
 document.querySelector('.zw-packs>button[aria-pressed="true"]')?.focus({preventScroll:true});
}
function coinOpenCheckoutPrompt(pack){
 const owner=coinCheckoutOwner();if(isHostWallet()||CoinUI.checkoutPrompt||!pack||!owner||!DEMO&&!S.loggedIn)return;
 CoinUI.checkoutPrompt={owner,pack:{...pack},focus:document.activeElement,method:null,checking:false,ready:DEMO};
 coinPaint();
}
function coinPaintCheckoutPrompt(){
 const prompt=CoinUI.checkoutPrompt;if(!prompt)return;
 if(isHostWallet()||prompt.owner!==coinCheckoutOwner()||S.v!=='coins'&&!(Home.giftTo&&CoinUI.topup)){coinCloseCheckoutPrompt(false);return}
 const pack=prompt.pack,payment=coinPendingPayment()?Home.checkout:null;
 const coins=payment?.coins??pack.coins,amount=payment?.payableAmountPaise??payment?.amountPaise??pack.pricePaise;
 const quoted=Number.isSafeInteger(payment?.payableAmountPaise)&&payment.payableAmountPaise>0;
 clearTimeout(prompt.expiryTimer);
 const expiresIn=Date.parse(payment?.expiresAt||'')-Date.now();
 if(expiresIn>0&&expiresIn<2147483647)prompt.expiryTimer=setTimeout(coinPaintCheckoutPrompt,expiresIn+1);
 const methods=prompt.ready&&!Home.checkoutBusy?coinPaymentMethods(payment):[],upi=methods.filter(option=>option.method!=='hosted'),hosted=methods.some(option=>option.method==='hosted');
 const manualId=prompt.ready&&quoted?coinPaymentUpiId(payment):'';
 const hasBranded=upi.some(app=>app.method!=='other'&&app.action==='pay');
 const preferCheckout=hosted&&!!prompt.upiLaunchFailed;
 const showHosted=hosted&&(!manualId||!hasBranded||preferCheckout);
 let dialog=document.getElementById('zw-checkout-dialog');const creating=!dialog,focused=document.activeElement?.id;
 if(!dialog){
  dialog=document.createElement('dialog');dialog.id='zw-checkout-dialog';dialog.className='zpm-dialog';dialog.setAttribute('aria-labelledby','zpm-checkout-title');
  dialog.addEventListener('cancel',event=>{event.preventDefault();coinCloseCheckoutPrompt()});
  dialog.addEventListener('close',()=>{dialog.remove();if(!document.getElementById('zw-checkout-dialog'))CoinUI.checkoutPrompt=null});
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)coinCloseCheckoutPrompt()});
  document.body.append(dialog);
 }
 dialog.classList.toggle('is-opening',!!prompt.method);
 dialog.classList.toggle('has-upi-apps',!prompt.method&&upi.length>0);
 if(prompt.method){
  const app=[...coinUPIApps,coinHostedPayment].find(option=>option.method===prompt.method);
  const detail=prompt.checking?'Waiting for confirmation from PayPlus.':quoted?`Approve ${coinCheckoutPrice(amount)} for ${n(coins)} coins.`:`Complete your payment for ${n(coins)} coins.`;
  dialog.innerHTML=`<div class="zpm-opening" role="status"><span class="zpm-opening-icon">${coinPaymentIcon(app.method)}</span><h2 id="zpm-checkout-title">${prompt.checking?'Checking your payment…':`Opening ${app.method==='other'?'your UPI app':app.label}…`}</h2><p>${detail}</p></div><button class="zpm-change" type="button" onclick="coinCloseCheckoutPrompt()">Cancel</button>`;
 }else{
  const disabled=Home.checkoutBusy||CoinUI.verifyBusy||!!prompt.action||window.ZimiOffline?.isOffline(),error=CoinUI.paymentError;
  dialog.innerHTML=`<span class="zpm-grabber" aria-hidden="true"></span><header class="zpm-dialog-heading"><h2 id="zpm-checkout-title">Payment summary</h2><button type="button" id="zpm-close-checkout" class="zpm-close" aria-label="Close payment summary" onclick="coinCloseCheckoutPrompt()"><span>${hi('close',16)}</span></button></header><div class="zpm-body">
  <section class="zpm-order-summary" aria-label="Selected coin pack"><div class="zpm-summary-pack"><span class="zpm-pack-art">${coinPackArtwork()}</span><div class="zpm-pack-info"><strong>${n(coins)} coins</strong><small>${esc(pack.name||'Coin pack')}</small></div><button class="zpm-change" type="button" onclick="coinChangeCheckoutPack()" aria-label="Change coin pack" ${Home.checkoutBusy||CoinUI.verifyBusy||prompt.action||Home.checkoutAttempt&&!payment?'disabled':''}><span>Change</span></button></div>
  <div class="zpm-summary-row"><span>Coins credited</span><strong>${coinIcon(19)} ${n(coins)}</strong></div><div class="zpm-summary-row zpm-total"><span>${quoted||DEMO?'Total payable':'Pack price'}</span><strong>${coinCheckoutPrice(amount)}</strong></div></section>
  ${error?`<p class="zpm-method-error" role="alert">${esc(error)}</p>`:''}
  ${Home.checkoutBusy?`<div class="zpm-loading" role="status" aria-label="Preparing payment" aria-busy="true">${skeletonLine('92%',38)}${skeletonLine('92%',38)}</div>`:!prompt.ready&&!DEMO?`<button type="button" class="zh-primary zpm-confirm" onclick="coinPrepareCheckout()" ${disabled?'disabled':''}>Retry payment setup</button>`:''}
  ${upi.length?coinPaymentAppRows(upi,prompt.owner,disabled,hasBranded,preferCheckout):''}
  ${showHosted?coinHostedRow(upi.some(app=>app.action==='pay'||app.action==='upi')?'Open PayPlus checkout':'Continue on secure checkout',disabled,preferCheckout):''}
  ${manualId?coinPaymentUpiIdRow(prompt,manualId,amount,hosted&&!showHosted,disabled):''}
  ${payment&&prompt.ready&&!Home.checkoutBusy&&!methods.some(option=>option.action&&option.action!=='install')?`<p class="zpm-method-error" role="status">${coinPaymentExpired(payment)?'This payment link expired. Check its status or change your pack.':'Payment options are unavailable for this order.'}</p><button type="button" class="zpm-recheck" onclick="homeVerifyPayment()" ${disabled?'disabled':''}>${CoinUI.verifyBusy?'Checking payment…':'Check payment status'}</button>`:''}
  <p class="zpm-security">${hi('lock',12)} ${DEMO?'Preview only. No payment is taken.':'Secure UPI payment'}</p></div>`;
 }
 if(creating)dialog.showModal();else if(focused&&dialog.querySelector('#'+CSS.escape(focused)))dialog.querySelector('#'+CSS.escape(focused)).focus({preventScroll:true});
}
function coinPrepareCheckout(){
 const prompt=CoinUI.checkoutPrompt;if(isHostWallet()||!prompt||prompt.owner!==coinCheckoutOwner()||Home.checkoutBusy||CoinUI.verifyBusy||window.ZimiOffline?.isOffline()||DEMO)return;
 if(!Home.checkoutAttempt&&(contentPending('catalog')||ContentLoading.catalog.error||!Home.paymentsAvailable))return;
 const pack=prompt.pack,resumeOrderId=coinPendingPayment()?Home.checkout.merchantOrderId:null;Home.packId=pack.id;
 if(!Home.checkoutAttempt){Home.checkoutAttempt={packId:pack.id,idempotencyKey:crypto.randomUUID()};CoinUI.packSnapshot={...pack};Home.checkout=null}
 const {packId,idempotencyKey}=Home.checkoutAttempt;
 prompt.ready=false;Home.checkoutBusy=true;CoinUI.paymentError='';
 Native.send('wallet.checkout',{packId,idempotencyKey,prepareOnly:true,...(resumeOrderId?{resumeOrderId}:{})});coinPaint();
}
function coinOpenPayment(method){
 const prompt=CoinUI.checkoutPrompt,payment=Home.checkout;
 if(isHostWallet()||!prompt||prompt.owner!==coinCheckoutOwner()||!prompt.ready||prompt.action||Home.checkoutBusy||CoinUI.verifyBusy||window.ZimiOffline?.isOffline())return;
 const option=coinPaymentMethods(payment).find(item=>item.method===method);
 if(!option?.action)return;
 if(DEMO){const coins=prompt.pack.coins;coinCloseCheckoutPrompt(false);S.bal+=coins;coinPaint();appNotice('Preview coins added');return}
 if(!payment?.merchantOrderId)return;
 prompt.action=option;CoinUI.paymentError='';coinPaintCheckoutPrompt();
 Native.send('wallet.payment.open',{merchantOrderId:payment.merchantOrderId,method});
}
function homeCoins(embedded=false){
 if(isHostWallet())return '<section class="zw-coins"><p>Your host account earns diamonds. View your balance in Wallet &amp; Activity.</p><button type="button" class="zh-primary" onclick="go(\'wallet\')">Open diamond wallet</button></section>';
 const selected=(Home.checkoutAttempt&&CoinUI.packSnapshot)||Home.packs.find(x=>x.id===(Home.checkoutAttempt?.packId||Home.packId))||Home.packs[0],surface=DEMO?null:contentSurface('catalog','packs','Loading coin packs'),pending=coinHasPendingPayment();
 return `<section class="zw-coins zw-compact zw-reference ${embedded?'zw-embedded':''}" aria-label="BinzoLive Coins">${!embedded?window.ZimiCallInvitations?.coinsContext()||'':''}${coinWalletView(embedded)}${coinWalletError()}${CoinUI.checkoutPrompt?'':coinPaymentView()+coinOtherPayments()}<div class="zw-section-heading"><h2>${DEMO||Home.packs.some(coinPackBonus)?'Welcome Bonus for You!':'Choose your coin pack'}</h2></div>${surface??(Home.packs.length?`<div class="zh-packs zw-packs" role="group" aria-label="Coin packs">${Home.packs.map(x=>coinPackView(x,selected,pending)).join('')}</div>`:'<div class="zw-empty">Coin packs are currently unavailable. Please check again later.</div>')}${CoinUI.paymentError&&!CoinUI.checkoutPrompt?`<p class="zw-error" role="alert">${esc(CoinUI.paymentError)}</p>`:''}<p class="zw-note">${DEMO?'Design preview · sample coins only':'Coins are used for calls and gifts. Select a pack, then continue securely.'}</p>${!surface&&!Home.paymentsAvailable?'<p class="zw-empty">Payments are temporarily unavailable. Your existing coins are still safe.</p>':''}${!surface&&selected&&(!pending||CoinUI.checkoutPrompt)?`<footer class="zw-checkout-footer"><button class="zh-primary zw-buy" aria-label="${Home.checkoutBusy?'Opening checkout':Home.paymentsAvailable?'Get '+n(selected.coins)+' coins':'Checkout unavailable'}" onclick="homeCheckout()" ${Home.checkoutBusy||!Home.paymentsAvailable||CoinUI.checkoutPrompt?'disabled':''}>${coinIcon(19)} ${Home.checkoutBusy?'Opening checkout…':Home.paymentsAvailable?`Get ${n(selected.coins)} coins`:'Checkout unavailable'}${Home.paymentsAvailable&&!Home.checkoutBusy?`<span>${coinPrice(selected.pricePaise)}</span>`:''}</button></footer>`:''}</section>`;
}
function homeCheckout(resume=false){
 if(isHostWallet())return;
 if(Home.checkoutBusy||CoinUI.verifyBusy||window.ZimiOffline?.isOffline())return;
 if(coinHasPendingPayment()&&!resume)return;
 if(!resume&&!DEMO&&(contentPending('catalog')||ContentLoading.catalog.error||!Home.paymentsAvailable))return;
 if(resume&&!Home.checkoutAttempt)return;
 const pack=(Home.checkoutAttempt&&CoinUI.packSnapshot)||Home.packs.find(item=>item.id===(Home.checkoutAttempt?.packId||Home.packId))||Home.packs[0];
 coinOpenCheckoutPrompt(pack);coinPrepareCheckout();
}
function homeVerifyPayment(){
 if(!Home.checkout?.merchantOrderId||CoinUI.verifyBusy||Home.checkoutBusy||window.ZimiOffline?.isOffline())return;
 if(CoinUI.checkoutPrompt)CoinUI.checkoutPrompt.manualStatus='';
 CoinUI.verifyBusy=true;CoinUI.paymentError='';Native.send('wallet.verify',{merchantOrderId:Home.checkout.merchantOrderId});coinPaint();
}
function coinClosePurchase(){
 if(DEMO)return;
 if(Home.checkoutAttempt?.idempotencyKey)Native.send('payments.checkout.closed',{kind:'coins',idempotencyKey:Home.checkoutAttempt.idempotencyKey});
 for(const payment of [Home.checkout,...CoinUI.orders.values()])if(payment?.status==='PENDING'&&payment.merchantOrderId)Native.send('payments.checkout.closed',{kind:'coins',merchantOrderId:payment.merchantOrderId});
 Home.checkoutBusy=false;
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
 coinCloseCheckoutPrompt(false);
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
 const snapshot={...known,...d};
 // A status response may withdraw expired or unavailable payment directions.
 // Keep the order and the device platform, but never reuse omitted links.
 if(!checkout)for(const key of ['upiIntent','upiIntentRouting','isIntentSupported','paymentUrl'])if(!Object.hasOwn(d,key))delete snapshot[key];
 if(d.merchantOrderId)CoinUI.orders.set(d.merchantOrderId,snapshot);
 // A restored order is history, not the checkout the user is starting now.
 // Keep it for reconciliation without interrupting a fresh package/method.
 if(d.status==='PENDING'&&Home.checkout?.merchantOrderId!==d.merchantOrderId&&(!d.idempotencyKey||Home.checkoutAttempt?.idempotencyKey!==d.idempotencyKey))CoinUI.dismissedOrders.add(d.merchantOrderId);
 // Old provider callbacks may arrive after the user starts a different pack.
 // Retain the receipt without restoring the abandoned order or its method.
 if(CoinUI.dismissedOrders.has(d.merchantOrderId))return;
 if(checkout&&Home.checkoutAttempt&&d.idempotencyKey!==Home.checkoutAttempt.idempotencyKey)return;
 if(!checkout&&Home.checkout?.merchantOrderId&&d.merchantOrderId!==Home.checkout.merchantOrderId){if(coinPendingPayment()||Home.checkoutAttempt||d.status!=='PENDING'){coinPaint();return}}
 if(!checkout&&!Home.checkout&&Home.checkoutAttempt&&d.idempotencyKey!==Home.checkoutAttempt.idempotencyKey)return;
 if(d.status==='SUCCESS'&&d.merchantOrderId===Home.checkout?.merchantOrderId&&CoinUI.checkoutPrompt?.method){
  const {owner,method}=CoinUI.checkoutPrompt;coinLastUPIApp(owner,method);
 }
 if(!checkout&&CoinUI.verifyBusy&&CoinUI.checkoutPrompt?.manual&&d.status==='PENDING'){
  CoinUI.checkoutPrompt.manualStatus=d.paymentUrl?'Payment is awaiting confirmation. Open PayPlus checkout if asked for a UTR.':'Payment is awaiting confirmation. Check again shortly.';
 }
 if(checkout||d.status!=='PENDING'||!CoinUI.checkoutPrompt)Home.checkoutBusy=false;
 CoinUI.verifyBusy=false;CoinUI.paymentError='';Home.checkout=snapshot;
 if(['SUCCESS','FAILED','REVERTED'].includes(d.status)){Home.checkoutAttempt=null;coinCloseCheckoutPrompt(false)}
 else if(d.idempotencyKey&&d.packId){
  Home.checkoutAttempt={packId:d.packId,idempotencyKey:d.idempotencyKey,...paymentRestoredRoute(d,Home.checkoutAttempt)};
  if(checkout&&CoinUI.checkoutPrompt?.pack.id===d.packId)CoinUI.checkoutPrompt.ready=true;
  if(d.coins!=null){
   const pack=CoinUI.packSnapshot?.id===d.packId?CoinUI.packSnapshot:Home.packs.find(item=>item.id===d.packId);
   CoinUI.packSnapshot={id:d.packId,coins:d.coins,pricePaise:d.amountPaise??d.payableAmountPaise??pack?.pricePaise??0,name:pack?.name||'Pending coin pack'};
  }
 }
 coinPaint();
}
function homeGifts(id,selectedGiftId=''){
 if(isHostWallet()){appNotice('Gifts are sent from user accounts. Hosts receive diamonds.');return}
 if(!id)return;CoinUI.focus={label:document.activeElement?.getAttribute('aria-label'),id:document.activeElement?.id};
 if(Home.giftTo!==id){CoinUI.giftId=Home.giftAttempt?.to===id?Home.giftAttempt.gift:'';CoinUI.giftError='';CoinUI.giftScroll=0}
 if(selectedGiftId&&!Home.giftBusy&&Home.gifts.some(gift=>gift.id===selectedGiftId))CoinUI.giftId=selectedGiftId;
 Home.giftTo=id;CoinUI.topup=false;
 if(!DEMO){contentStart('catalog');Native.send('catalog.load')}
 r();
 coinWarmGift(CoinUI.giftId);
}
function coinWarmGift(id){const gift=Home.gifts.find(item=>item.id===id);if(gift)window.ZimiGiftPlayback?.preload(giftMotionUrl(gift.name,gift.mediaUrl))}
function homeSelectGift(id){if(Home.giftBusy)return;CoinUI.giftId=id;CoinUI.giftError='';coinWarmGift(id);coinPaint()}
function homeGiftUrl(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!/[<>"'`\s]/.test(raw)?esc(u.href):''}catch{return ''}}
function homeGiftTopup(){if(isHostWallet())return;CoinUI.topup=true;CoinUI.paymentError='';coinPaint()}
function homeGiftDisplayOrder(gifts=Home.gifts){
 const names=['rosewaterfall','rose','kiss','berry','bear','cheers','party','tulip','bunny','blossom','bouquet','hibiscus'];
 const rank=name=>{const index=names.indexOf(String(name).toLowerCase().replace(/[^a-z0-9]/g,''));return index<0?names.length:index};
 return [...gifts].sort((a,b)=>rank(a.name)-rank(b.name));
}
function giftPickerTile(gift,{selected,action,label,focusKey,disabled=false}){
 const id=domId(gift.id);
 const artwork=giftStillUrl(gift.name,gift.mediaUrl,gift.coverUrl);
 return `<button type="button" data-gift-id="${id}" aria-pressed="${selected}" aria-label="${esc(label||gift.name+', '+giftPriceLabel(gift))}" class="zg-gift ${selected?'selected':''}" onclick="${action}('${id}')" ${focusKey?`data-hs-focus="${esc(focusKey)}"`:''} ${disabled?'disabled':''}><span class="zg-art">${artwork?`<img src="${artwork}" alt="" loading="lazy" decoding="async">`:`<span class="zg-emoji" aria-hidden="true">${esc(gift.emoji||'🎁')}</span>`}</span><b>${esc(gift.name)}</b><small class="zg-price">${giftIsFree(gift)?'Free':coinIcon(14)+'<span>'+n(gift.coins)+'</span>'}</small></button>`;
}
function homeGiftTile(gift){
 return giftPickerTile(gift,{selected:gift.id===CoinUI.giftId,action:'homeSelectGift',disabled:Home.giftBusy});
}
function coinGiftWalletState(){
 const recover=Home.giftAttempt?.to===Home.giftTo&&Home.giftAttempt?.gift===CoinUI.giftId,gift=Home.gifts.find(x=>x.id===CoinUI.giftId)||(recover?CoinUI.receipts.get(Home.giftAttempt.idempotencyKey):null),ready=giftIsFree(gift)||coinWalletReady();
 return {recover,gift,ready,short:gift&&ready?Math.max(0,gift.coins-S.bal):0,catalogUnavailable:!DEMO&&(contentPending('catalog')||!!ContentLoading.catalog.error)};
}
function coinGiftFooter({recover,gift,ready,short,catalogUnavailable}=coinGiftWalletState()){
 return gift||Home.giftBusy||Home.giftAttempt?`<div class="zw-gift-footer"><p aria-live="polite">${Home.giftBusy?'Confirming your gift…':short?`You need ${n(short)} more coins for this gift.`:giftIsFree(gift)?'No coins needed.':gift&&ready?`${n(S.bal-gift.coins)} coins remaining after sending`:gift?'Waiting for your balance…':'Select a gift to see the total.'}</p><button type="button" class="zh-primary zw-send" aria-label="Send gift" onclick="homeSendGift()" ${Home.giftBusy||(!recover&&(!gift||!ready||catalogUnavailable||Home.giftAttempt))?'disabled':''}>${hi('gift',19)} ${Home.giftBusy?'Sending…':gift?`Send ${esc(gift.name)} · ${giftPriceLabel(gift)}`:'Choose a gift'}</button></div>`:'';
}
function coinGiftWalletError(ready=coinGiftWalletState().ready){return !ready&&!contentPending('wallet')?'<p class="zw-error" data-coin-wallet-error role="alert">Refresh your balance before sending. <button onclick="coinRefresh()">Retry</button></p>':''}
function homeGiftSheet(){
 if(isHostWallet())return '';
 if(!Home.giftTo)return '';
 if(CoinUI.topup)return `<div class="zh-sheet-backdrop zw-backdrop" onclick="homeCloseGifts(event)"><section class="zh-sheet zw-sheet zw-topup" role="dialog" aria-modal="true" aria-label="Add coins"><div class="zw-topup-heading">${backButton('coinLeaveTopup()',{label:'Back to gifts'})}<h2>Add coins</h2><button class="zw-icon-button" aria-label="Close gifts" onclick="homeCloseGifts()">${hi('close',20)}</button></div>${homeCoins(true)}</section></div>`;
 const state=coinGiftWalletState(),{ready}=state,surface=DEMO?null:contentPending('catalog')?contentSkeleton('gifts','Loading gifts',12):ContentLoading.catalog.error?contentError('catalog'):null,footer=coinGiftFooter(state);
 return `<div class="zh-sheet-backdrop zw-backdrop zg-reference-backdrop" onclick="homeCloseGifts(event)"><section class="zh-sheet zw-sheet zg-reference" role="dialog" aria-modal="true" aria-label="Send a gift"><header class="zg-heading"><div class="zg-heading-copy"><h2>Send a gift</h2><p>Hosts earn diamonds from gifts</p></div><button type="button" class="zg-balance" aria-label="Add coins" onclick="homeGiftTopup()">${coinIcon(17)}<span>${contentBalance()}</span>${hi('plus',13)}</button><button type="button" class="zg-close" aria-label="Close gifts" onclick="homeCloseGifts()">${hi('close',19)}</button></header><div class="zg-catalog">${surface??(Home.gifts.length?`<div class="zh-gifts zw-gifts" role="group" aria-label="Choose a gift">${homeGiftDisplayOrder().map(homeGiftTile).join('')}</div>`:'<p class="zw-empty">No gifts are available right now.</p>')}${Home.giftAttempt&&!Home.giftBusy?`<div class="zw-recovery"><p>Your previous gift is awaiting confirmation. Check its delivery before sending another.</p><button class="zh-soft" onclick="homeRetryGift()">Check previous gift</button></div>`:''}${CoinUI.giftError?`<p class="zw-error" role="alert">${esc(CoinUI.giftError)}</p>`:''}${coinGiftWalletError(ready)}</div>${footer}</section></div>`;
}
function homeCloseGifts(e){if(e&&e.target!==e.currentTarget)return;if(CoinUI.topup)coinClosePurchase();Home.giftTo=null;S.tray=0;if(S.sh==='gift')S.sh=0;CoinUI.topup=false;r();const saved=CoinUI.focus;if(saved){const target=saved.id?document.getElementById(saved.id):Array.from(document.querySelectorAll('button[aria-label]')).find(x=>x.getAttribute('aria-label')===saved.label);target?.focus({preventScroll:true})}}
function homeSendGift(id=CoinUI.giftId){
 if(isHostWallet())return;
 if(Home.giftAttempt&&Home.giftAttempt.to===Home.giftTo&&Home.giftAttempt.gift===id)return homeRetryGift();
 const gift=Home.gifts.find(x=>x.id===id),to=Home.giftTo;
 if(!to||!gift||Home.giftBusy||(!giftIsFree(gift)&&!coinWalletReady())||window.ZimiOffline?.isOffline()||(!DEMO&&(contentPending('catalog')||ContentLoading.catalog.error)))return;
 const previous=Home.giftAttempt;
 // An uncertain delivery must be retried with its original payload, even after leaving a room.
 if(previous&&(previous.to!==to||previous.gift!==id)){CoinUI.giftError='Your previous gift is still unconfirmed. Open that gift and retry to check its delivery.';coinPaint();return}
 if(!giftIsFree(gift)&&S.bal<gift.coins)return coinRequireRecharge();
 if(!previous)Home.giftAttempt={to,gift:id,idempotencyKey:crypto.randomUUID(),coins:gift.coins,inCall:['call','voice','hcall'].includes(S.v),...(['call','voice','hcall'].includes(S.v)&&S.callId?{callId:S.callId}:{}),...(Home.stream?.id&&S.v==='live'?{streamId:Home.stream.id}:{})};
 const attempt=Home.giftAttempt;CoinUI.receipts.set(attempt.idempotencyKey,{...gift,_view:S.v,_callId:attempt.inCall?(S.callId||(DEMO?'preview-call':null)):null});Home.giftBusy=true;CoinUI.giftError='';coinPaint();
 if(DEMO){S.bal-=gift.coins;Home.giftBusy=false;Home.giftAttempt=null;Home.giftTo=null;S.tray=0;S.sh=0;r();window.zcThreadGift?.(to,gift,attempt);coinCallGiftFeedback({...attempt,coins:gift.coins});if(S.v==='live')window.zrReceiveGift?.({senderId:'you',senderName:'You',giftName:gift.name,emoji:gift.emoji,coins:gift.coins});appNotice('Preview gift sent');return}
 // This is the sender's pending visual, not a delivered receipt or a debit.
 // The selected original is already warming while the user chooses the gift.
 coinWarmGift(gift.id);homeCloseGifts();
 if(attempt.inCall||attempt.streamId)window.zrPreviewGift?.(attempt,gift);
 else window.ZimiChatGifts?.preview(to,gift,attempt);
 Native.send('gift.send',{...attempt});
}
function homeRetryGift(){if(isHostWallet()||!Home.giftAttempt||Home.giftBusy||window.ZimiOffline?.isOffline())return;Home.giftBusy=true;CoinUI.giftError='';Native.send('gift.send',{...Home.giftAttempt});coinPaint()}
function coinGiftMatches(d){const a=Home.giftAttempt;return !!a&&d.idempotencyKey===a.idempotencyKey&&(!d.to||d.to===a.to)&&(!d.gift||d.gift===a.gift)}
function coinCallGiftFeedback(d){
 const saved=CoinUI.receipts.get(d.idempotencyKey),gift=d.giftDetails?{...saved,...d.giftDetails,_callId:d.callId||saved?._callId}:saved;if(!gift?._callId)return;
 if(d.callId&&saved?._callId&&d.callId!==saved._callId)return;
 const coins=Number.isSafeInteger(d.coins)&&d.coins>=0?d.coins:gift.coins;
 if(['call','voice'].includes(S.v)&&gift._callId===(S.callId||(DEMO?'preview-call':null))&&S.h===d.to){
  S.gifted=(S.gifted||0)+coins;S.giftN=(S.giftN||0)+1;
  window.zrReceiveGift?.({id:d.id||d.idempotencyKey,idempotencyKey:d.idempotencyKey,callId:gift._callId,scope:'call',createdAt:d.createdAt,emittedAt:d.emittedAt,senderId:'you',senderName:'You',giftName:gift.name,emoji:gift.emoji,mediaUrl:gift.mediaUrl,coverUrl:gift.coverUrl,durationMs:gift.durationMs,coins});
 }else if(S.v==='summary'&&S.sum?.k==='sender'&&S.sum.callId===gift._callId){S.sum.giftV=(S.sum.giftV||0)+coins;S.sum.gifts=(S.sum.gifts||0)+1;S.sum.spent=(S.sum.spent||0)+coins;r()}
}
Native.on('gift.sent',d=>{
 const own=coinGiftMatches(d),transfer=d.id?'transfer:'+d.id:'';
 if((!own&&(!d.callId||!d.giftDetails))||CoinUI.confirmed.has(d.idempotencyKey)||transfer&&CoinUI.confirmed.has(transfer))return;
 if(d.idempotencyKey)CoinUI.confirmed.add(d.idempotencyKey);if(transfer)CoinUI.confirmed.add(transfer);
 if(!own){coinCallGiftFeedback(d);return}
 Home.giftBusy=false;Home.giftAttempt=null;CoinUI.giftError='';
 if(Home.giftTo===d.to){Home.giftTo=null;CoinUI.topup=false;S.tray=0;if(S.sh==='gift')S.sh=0;r()}
 else coinPaint();coinCallGiftFeedback(d);appNotice('Gift sent!');
});
Native.on('wallet.checkout',d=>coinAcceptPayment(d,true));
Native.on('wallet.purchase',d=>coinAcceptPayment(d));
Native.on('wallet.payment-returned',coinPaymentReturned);
Native.on('wallet.payment.opening',d=>{
 const prompt=CoinUI.checkoutPrompt;
 if(prompt?.action?.method!==d.method||d.merchantOrderId!==Home.checkout?.merchantOrderId)return;
 prompt.method=d.launchMethod||d.method;prompt.checking=false;coinPaintCheckoutPrompt();
 document.querySelector('#zw-checkout-dialog.is-opening>button')?.focus({preventScroll:true});
});
Native.on('wallet.payment.store',d=>{
 const prompt=CoinUI.checkoutPrompt;
 if(prompt?.action?.method!==d.method||d.merchantOrderId!==Home.checkout?.merchantOrderId)return;
 prompt.action=null;prompt.method=null;prompt.checking=false;coinPaintCheckoutPrompt();
 document.getElementById('zpm-pay-'+d.method)?.focus({preventScroll:true});
});
Native.on('wallet.payment.apps',d=>{
 const payment=Home.checkout;
 if(d.merchantOrderId!==payment?.merchantOrderId||!coinPendingPayment())return;
 const updated={...payment,upiAppsInstalled:{...payment.upiAppsInstalled,...d.upiAppsInstalled}};
 Home.checkout=updated;CoinUI.orders.set(d.merchantOrderId,updated);
 coinPaintCheckoutPrompt();
});
Native.on('app.foreground',()=>{
 const prompt=CoinUI.checkoutPrompt;if(prompt?.method){prompt.checking=true;coinPaintCheckoutPrompt()}
});
Native.on('operation.error',d=>{
 if(d.action==='gift.send'&&coinGiftMatches(d)){
  const attempt=Home.giftAttempt,saved=CoinUI.receipts.get(attempt.idempotencyKey);
  const relevant=attempt.inCall?saved?._callId===S.callId&&['call','voice','hcall'].includes(S.v):attempt.streamId?S.v==='live'&&Home.stream?.id===attempt.streamId:S.v==='thread'&&S.h===attempt.to;
  Home.giftBusy=false;if(relevant)Home.giftTo=attempt.to;CoinUI.giftId=attempt.gift;CoinUI.topup=false;
  CoinUI.giftError=d.code==='INSUFFICIENT_COINS'?'':d.message||'Delivery could not be confirmed. Retry this gift.';
  if(['INSUFFICIENT_COINS','STREAM_UNAVAILABLE','GIFT_CALL_UNAVAILABLE'].includes(d.code)||[400,403,404].includes(d.status)){
   window.zrCancelGiftPreview?.(attempt.idempotencyKey);window.ZimiChatGifts?.cancel(attempt.idempotencyKey);
   Home.giftAttempt=null;if(d.code==='INSUFFICIENT_COINS')coinRefresh();
  }
  r();
 }
 if(d.action==='wallet.checkout'&&Home.checkoutAttempt?.idempotencyKey===d.idempotencyKey){
  Home.checkoutBusy=false;CoinUI.paymentError=d.message;
  const routeRejected=['PAYMENT_ROUTE_CHOICE_DISABLED','PAYMENT_ROUTE_UNAVAILABLE'].includes(d.code),uncertainRoute=['PAYIN_ROUTE_UNAVAILABLE','PAYMENT_ROUTE_CONFLICT'].includes(d.code);
  if(routeRejected||d.code==='PAYIN_PROVISIONING_FAILED'||(!uncertainRoute&&[400,404].includes(d.status)&&!coinPendingPayment())){
   Home.checkoutAttempt=null;Home.checkout=null;CoinUI.packSnapshot=null;coinCloseCheckoutPrompt(false)
  }
  coinPaint();
 }
 if(d.action==='wallet.payment.open'&&d.merchantOrderId===Home.checkout?.merchantOrderId){
  const prompt=CoinUI.checkoutPrompt;
  const genericFailed=(prompt?.method==='other'||prompt?.action?.method==='other'||prompt?.action?.action==='upi')&&d.code==='PAYMENT_OPEN_FAILED';
  if(prompt){prompt.action=null;prompt.method=null;prompt.checking=false;if(genericFailed)prompt.upiLaunchFailed=true}
  const canOpenCheckout=genericFailed&&coinPaymentMethods(Home.checkout).some(option=>option.method==='hosted');
  CoinUI.paymentError=canOpenCheckout?"Your phone couldn't open a UPI app for this order. Continue with PayPlus checkout.":d.message||'Could not open this payment app. Try another option.';
  coinPaint();if(canOpenCheckout)document.getElementById('zpm-pay-hosted')?.focus({preventScroll:true});
 }
 if(d.action==='wallet.verify'&&Home.checkout?.merchantOrderId===d.merchantOrderId){CoinUI.verifyBusy=false;CoinUI.paymentError=d.message;coinPaint()}
});
Native.on('call.failed',d=>{if(d.code==='INSUFFICIENT_COINS'&&!isHost())coinRequireRecharge()});
window.addEventListener('zimi:host-access',()=>{if(isHostWallet()){coinCloseRecharge(false);coinCloseCheckoutPrompt(false);Home.giftTo=null;CoinUI.topup=false;if(S.loggedIn&&['coins','refer'].includes(S.v))go('wallet')}});
document.addEventListener('aurora:navigate',()=>{coinCloseRecharge(false);if(S.v!=='coins'&&!(Home.giftTo&&CoinUI.topup))coinClosePurchase();if(!DEMO&&['wallet','transactions'].includes(S.v)){contentStart('transactions');Native.send('transactions.load');r()}});
document.addEventListener('keydown',e=>{if(CoinUI.rechargePrompt){if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();coinCloseRecharge()}return}if(CoinUI.checkoutPrompt){if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();coinCloseCheckoutPrompt()}return}if(!Home.giftTo)return;const sheet=document.querySelector('.zw-sheet');if(!sheet)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();homeCloseGifts();return}if(e.key==='Tab'){const items=Array.from(sheet.querySelectorAll('button:not(:disabled),select:not(:disabled),[tabindex="0"]'));if(!items.length)return;const first=items[0],last=items.at(-1);if(e.shiftKey&&(document.activeElement===first||!sheet.contains(document.activeElement))){e.preventDefault();last.focus()}else if(!e.shiftKey&&(document.activeElement===last||!sheet.contains(document.activeElement))){e.preventDefault();first.focus()}}},true);
window.ZimiCoins={requireRecharge:coinRequireRecharge,giftReceipt:d=>CoinUI.receipts.get(d.idempotencyKey),reset:()=>{coinCloseRecharge(false);coinCloseCheckoutPrompt(false);Object.assign(CoinUI,{giftId:'',giftScroll:0,topup:false,giftError:'',paymentError:'',verifyBusy:false,focus:null,packSnapshot:null});CoinUI.orders.clear();CoinUI.dismissedOrders.clear();CoinUI.returnedOrders.clear();CoinUI.receipts.clear();CoinUI.confirmed.clear()},afterRender:()=>{coinPaintCheckoutPrompt();const catalog=document.querySelector('.zw-sheet .zg-catalog');if(catalog){catalog.scrollTop=CoinUI.giftScroll;catalog.onscroll=()=>{if(catalog.isConnected)CoinUI.giftScroll=catalog.scrollTop}}const sheet=document.querySelector('.zw-sheet');if(sheet&&!CoinUI.checkoutPrompt&&!CoinUI.rechargePrompt&&!sheet.contains(document.activeElement))sheet.querySelector('[aria-pressed="true"],button:not(:disabled)')?.focus({preventScroll:true})}};
