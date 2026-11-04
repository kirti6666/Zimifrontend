/* PAN and full bank details live only in the open form. They never join account
   state, storage, receipts or recovery intents. Only masked server summaries do. */
const PayoutVerification={owner:'',sequence:0,loadRequest:0,submitRequest:0,quoteRequest:0,loading:false,submitting:false,requested:false,error:'',data:null,editing:false,form:{},attemptKey:'',uncertain:false,quoteLoading:false,quoteAmount:0,quoteError:'',quote:null,back:'settings'};
function payoutKycOwn(){return !!S.user?.id&&PayoutVerification.owner===S.user.id&&isHostWallet()}
function payoutNeedsQuote(){return payoutOwnAccount()&&(PayoutUI.wallet?.hostEarningsPolicy?.version===2||PayoutVerification.data?.required===true)}
function payoutKycVerified(){return payoutKycOwn()&&PayoutVerification.data?.kyc?.status==='verified'}
function payoutKycClearForm(){for(const id of ['zpay-legal-name','zpay-pan','zpay-bank-account','zpay-ifsc','zpay-kyc-upi']){const input=document.getElementById(id);if(input)input.value=''}PayoutVerification.form={};PayoutVerification.attemptKey='';PayoutVerification.uncertain=false;PayoutVerification.editing=false}
function payoutQuoteClear(){PayoutVerification.quoteRequest=++PayoutVerification.sequence;PayoutVerification.quoteLoading=false;PayoutVerification.quoteAmount=0;PayoutVerification.quote=null;PayoutVerification.quoteError=''}
function payoutKycPaint(){if(S.v==='payout-kyc'||payoutActive())r()}
function payoutKycLoad(){
 if(DEMO||!payoutKycOwn()||PayoutVerification.loading||PayoutVerification.submitting)return;
 const p=PayoutVerification;p.requested=true;p.loading=true;p.error='';p.loadRequest=++p.sequence;Native.send('payout.kyc.load',{requestId:p.loadRequest});payoutKycPaint();
}
function payoutKycOpen(from){
 if(!isHostWallet())return;
 const p=PayoutVerification;p.back=['payout','payout-history','wallet','settings'].includes(from)?from:['payout','payout-history','wallet','settings'].includes(S.v)?S.v:'settings';
 payoutKycClearForm();go('payout-kyc');if(!p.loading&&!p.submitting)payoutKycLoad();
}
function payoutKycClose(){const back=PayoutVerification.back;payoutKycClearForm();go(back||'settings')}
function payoutKycEdit(){
 const p=PayoutVerification;if(!payoutKycOwn()||p.submitting)return;
 p.editing=true;p.error='';p.uncertain=false;p.attemptKey='';p.form={legalName:p.data?.kyc?.legalName||'',panNumber:'',payoutType:p.data?.kyc?.payoutType||'upi',upiId:'',bankAccountNumber:'',ifsc:''};payoutKycPaint();
}
function payoutKycDraft(key,value){
 const p=PayoutVerification;if(S.v!=='payout-kyc'||!p.editing||p.submitting||p.uncertain||!['legalName','panNumber','payoutType','upiId','bankAccountNumber','ifsc'].includes(key))return;
 p.form[key]=['panNumber','ifsc'].includes(key)?String(value).toUpperCase():String(value);p.attemptKey='';p.error='';
 if(key==='payoutType'){p.form.upiId='';p.form.bankAccountNumber='';p.form.ifsc='';payoutKycPaint()}
}
function payoutKycSubmit(){
 const p=PayoutVerification;if(DEMO||!payoutKycOwn()||S.v!=='payout-kyc'||!p.editing||p.submitting)return;
 const f=p.form,legalName=String(f.legalName||'').trim(),panNumber=String(f.panNumber||'').trim().toUpperCase(),payoutType=f.payoutType;
 let message='';if(legalName.length<2||legalName.length>100)message='Enter your legal name.';
 else if(!/^[A-Z]{5}\d{4}[A-Z]$/.test(panNumber))message='Enter a valid PAN number.';
 else if(payoutType==='upi'&&!/^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/.test(String(f.upiId||'').trim()))message='Enter a valid UPI ID.';
 else if(payoutType==='bank'&&(!/^\d{6,24}$/.test(String(f.bankAccountNumber||'').trim())||!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(f.ifsc||'').trim().toUpperCase())))message='Check the bank account number and IFSC.';
 else if(!['upi','bank'].includes(payoutType))message='Choose a payout method.';
 if(message){p.error=message;payoutKycPaint();return}
 if(!p.attemptKey)p.attemptKey=crypto.randomUUID();p.submitting=true;p.error='';p.submitRequest=++p.sequence;
 Native.send('payout.kyc.submit',{requestId:p.submitRequest,idempotencyKey:p.attemptKey,legalName,panNumber,payoutType,
  ...(payoutType==='upi'?{upiId:String(f.upiId).trim()}:{bankAccountNumber:String(f.bankAccountNumber).trim(),ifsc:String(f.ifsc).trim().toUpperCase()})});payoutKycPaint();
}
function payoutKycStatus(status){return {missing:'Not submitted',pending:'Pending verification',verified:'Verified',rejected:'Needs correction'}[status]||'Not submitted'}
function payoutKycSummary(){
 if(!payoutKycOwn())return '';
 const p=PayoutVerification,k=p.data?.kyc,needed=payoutNeedsQuote();
 return `<section class="zpay-verification" aria-label="Payout verification"><h2>Payout verification</h2>${k?`<p>${payoutKycStatus(k.status)}${k.payoutAddress?` · ${esc(k.payoutAddress)}`:''}</p>`:p.loading?'<p role="status">Loading payout verification…</p>':`<p>${needed?'Verify PAN and payout details before withdrawing.':'You can prepare your PAN and payout details for verification.'}</p>`}${p.error?`<p class="zpay-error" role="alert">${esc(p.error)}</p>`:''}<button type="button" class="zpay-secondary" onclick="payoutKycOpen()">${k?.status==='verified'?'View verified payout details':'Verify payout details'}</button></section>`;
}
function payoutKycScreen(){
 if(!payoutKycOwn())return '<section class="zpay-page"><p>Payout verification is available to host accounts.</p></section>';
 const p=PayoutVerification,k=p.data?.kyc,f=p.form,locked=p.submitting||p.uncertain;
 const summary=k?`<section class="zpay-verification"><h2>${payoutKycStatus(k.status)}</h2>${k.legalName?`<p>${esc(k.legalName)}</p>`:''}${k.panMasked?`<p>PAN: ${esc(k.panMasked)}</p>`:''}${k.payoutAddress?`<p>${esc(k.payoutAddress)}</p>`:''}${k.reason?`<p>${esc(k.reason)}</p>`:''}</section>`:'';
 const form=p.editing?`<form class="zpay-form" autocomplete="off" onsubmit="event.preventDefault();payoutKycSubmit()"><label for="zpay-legal-name">Legal name</label><input id="zpay-legal-name" autocomplete="off" maxlength="100" value="${esc(f.legalName||'')}" oninput="payoutKycDraft('legalName',this.value)" ${locked?'disabled':''}><label for="zpay-pan">PAN number</label><input id="zpay-pan" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="10" value="${esc(f.panNumber||'')}" oninput="payoutKycDraft('panNumber',this.value)" ${locked?'disabled':''}><label for="zpay-method">Payout method</label><select id="zpay-method" onchange="payoutKycDraft('payoutType',this.value)" ${locked?'disabled':''}><option value="upi" ${f.payoutType==='upi'?'selected':''}>UPI</option><option value="bank" ${f.payoutType==='bank'?'selected':''}>Bank account</option></select>${f.payoutType==='bank'?`<label for="zpay-bank-account">Bank account number</label><input id="zpay-bank-account" inputmode="numeric" autocomplete="off" maxlength="24" value="${esc(f.bankAccountNumber||'')}" oninput="payoutKycDraft('bankAccountNumber',this.value)" ${locked?'disabled':''}><label for="zpay-ifsc">IFSC</label><input id="zpay-ifsc" autocomplete="off" autocapitalize="characters" maxlength="11" value="${esc(f.ifsc||'')}" oninput="payoutKycDraft('ifsc',this.value)" ${locked?'disabled':''}>`:`<label for="zpay-kyc-upi">UPI ID</label><input id="zpay-kyc-upi" autocomplete="off" maxlength="150" value="${esc(f.upiId||'')}" oninput="payoutKycDraft('upiId',this.value)" ${locked?'disabled':''}>`}<button class="zpay-primary" type="submit" ${p.submitting?'disabled':''}>${p.submitting?'Submitting for verification…':p.uncertain?'Retry same verification':'Submit for verification'}</button></form>`:`<button type="button" class="zpay-primary" onclick="payoutKycEdit()" ${p.submitting?'disabled':''}>${k&&k.status!=='missing'?'Update payout details':'Add payout details'}</button>`;
 return `<section class="zpay-page" aria-label="Payout identity verification">${p.loading?contentSkeleton('rows','Loading payout verification',2):summary}${p.error?`<p class="zpay-error" role="alert">${esc(p.error)}</p>`:''}${form}<button type="button" class="zpay-secondary" onclick="payoutKycLoad()" ${p.loading||p.submitting?'disabled':''}>Refresh verification status</button></section>`;
}
function payoutQuoteStart(){
 const p=PayoutVerification,w=PayoutUI.wallet;if(p.quoteLoading||PayoutUI.busy||PayoutUI.attempt?.uncertain)return;
 if(!payoutKycVerified()){PayoutUI.error='Verified payout details are required before withdrawal.';payoutKycPaint();return}
 const amountPaise=w?.hostEarningsPolicy?.wholeBalanceWithdrawal?w.earningsPaise:payoutPaise(PayoutUI.amount),address=p.data.kyc.payoutAddress||'';
 PayoutUI.error=payoutValidation(amountPaise,address);if(PayoutUI.error){payoutKycPaint();return}
 p.quote=null;p.quoteError='';p.quoteLoading=true;p.quoteAmount=amountPaise;p.quoteRequest=++p.sequence;PayoutUI.review=null;Native.send('payout.quote.load',{amountPaise,requestId:p.quoteRequest});payoutKycPaint();
}
function payoutQuoteReview(review){
 const full=review?.quoteDetails,proof=review?.quote;
 if(full)return `<div><dt>Gross amount</dt><dd>${payoutMoney(full.grossAmountPaise)}</dd></div><div><dt>TDS (${full.tdsPercent}%)</dt><dd>${payoutMoney(full.tdsPaise)}</dd></div><div><dt>Net payout</dt><dd>${payoutMoney(full.netAmountPaise)}</dd></div>`;
 return proof?`<div><dt>Previously reviewed net payout</dt><dd>${payoutMoney(proof.netAmountPaise)}</dd></div>`:'';
}
function payoutVerificationReset(){const sequence=PayoutVerification.sequence+1;Object.assign(PayoutVerification,{owner:'',sequence,loadRequest:0,submitRequest:0,quoteRequest:0,loading:false,submitting:false,requested:false,error:'',data:null,editing:false,form:{},attemptKey:'',uncertain:false,quoteLoading:false,quoteAmount:0,quoteError:'',quote:null,back:'settings'})}
for(const [event,action] of [['payout.kyc.loaded','load'],['payout.kyc.submitted','submit']])Native.on(event,data=>{
 const p=PayoutVerification;if(!payoutKycOwn()||data.requestId!==(action==='load'?p.loadRequest:p.submitRequest)||data.kyc?.ownerId&&data.kyc.ownerId!==p.owner)return;
 if(action==='load')p.loading=false;else{p.submitting=false;p.loading=false;payoutKycClearForm()}
 p.requested=true;p.error='';p.data={required:data.required===true,kyc:data.kyc};payoutQuoteClear();if(PayoutUI.review?.quote&&!PayoutUI.busy&&!PayoutUI.attempt?.uncertain){PayoutUI.review=null;PayoutUI.attempt=null}payoutKycPaint();
});
Native.on('payout.kyc.error',data=>{const p=PayoutVerification;if(!payoutKycOwn()||data.requestId!==(data.action==='payout.kyc.load'?p.loadRequest:p.submitRequest))return;if(data.action==='payout.kyc.load')p.loading=false;else{p.submitting=false;p.uncertain=![400,401,403,404,409,422].includes(data.status)}p.error=data.message||'Payout verification is unavailable. Try again.';payoutKycPaint()});
Native.on('payout.quote.loaded',data=>{
 const p=PayoutVerification;if(!payoutKycOwn()||!p.quoteLoading||data.requestId!==p.quoteRequest)return;p.quoteLoading=false;
 if(!payoutActive()||!payoutKycVerified()||data.grossAmountPaise!==p.quoteAmount||data.policyVersion!==2||data.kycId!==p.data.kyc.id){p.quoteError='Your payout details changed. Refresh and review again.';payoutKycPaint();return}
 p.quote=data;PayoutUI.error='';PayoutUI.review={amountPaise:data.grossAmountPaise,payoutAddress:data.payoutAddress,quote:{settingsVersionId:data.settingsVersionId,kycId:data.kycId,netAmountPaise:data.netAmountPaise,diamondUnits:data.diamondUnits},quoteDetails:data};payoutKycPaint();
});
Native.on('payout.quote.error',data=>{const p=PayoutVerification;if(!payoutKycOwn()||!p.quoteLoading||data.requestId!==p.quoteRequest)return;p.quoteLoading=false;p.quoteError=data.message||'Your withdrawal quote could not be loaded.';PayoutUI.error=p.quoteError;payoutKycPaint()});
for(const event of ['session.none','session.expired'])Native.on(event,payoutVerificationReset);
for(const event of ['session','auth.ok'])Native.on(event,data=>{const owner=data.user?.id||'';if(owner!==PayoutVerification.owner){payoutVerificationReset();PayoutVerification.owner=owner}});
document.addEventListener('aurora:navigate',()=>{if(S.v!=='payout-kyc')payoutKycClearForm();if(!payoutActive())payoutQuoteClear()});
Native.on('app.background',()=>{payoutKycClearForm();if(S.v==='payout-kyc')payoutKycPaint()});
window.addEventListener('pagehide',payoutKycClearForm);
const payoutVerificationPreviousAfter=ZimiHome.afterRender,payoutVerificationPreviousHeader=ZimiHome.header,payoutVerificationPreviousNav=ZimiHome.nav;
ZimiHome.afterRender=()=>{payoutVerificationPreviousAfter();if((payoutActive()||S.v==='payout-kyc')&&payoutKycOwn()&&!PayoutVerification.requested&&!DEMO){PayoutVerification.requested=true;queueMicrotask(()=>{if(payoutActive()||S.v==='payout-kyc')payoutKycLoad()})}};
ZimiHome.header=()=>S.v==='payout-kyc'?`<header class="zh-subheader">${backButton('payoutKycClose()',{label:'Back to payments'})}<h1>Payout verification</h1></header>`:payoutVerificationPreviousHeader();
ZimiHome.nav=()=>{if(S.v==='payout-kyc'){document.getElementById('nav').style.display='none';return true}return payoutVerificationPreviousNav()};
ZimiHome.views['payout-kyc']=payoutKycScreen;
window.ZimiPayoutVerification={needed:payoutNeedsQuote,verified:payoutKycVerified,summary:payoutKycSummary,review:payoutQuoteStart,reviewDetails:payoutQuoteReview,clearQuote:payoutQuoteClear,busy:()=>PayoutVerification.quoteLoading,reset:payoutVerificationReset};
