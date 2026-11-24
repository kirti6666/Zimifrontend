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
function payoutKycBack(){
 const p=PayoutVerification;if(p.submitting)return;
 if(p.editing){if(p.uncertain){p.error='Retry the same verification before leaving this form.';payoutKycPaint();return}payoutKycClearForm();p.error='';payoutKycPaint();return}
 payoutKycClose();
}
function payoutKycWithdraw(){payoutKycClearForm();go('payout')}
function payoutKycEdit(){
 const p=PayoutVerification;if(!payoutKycOwn()||p.submitting)return;
 p.editing=true;p.error='';p.uncertain=false;p.attemptKey='';p.form={legalName:p.data?.kyc?.legalName||'',panNumber:'',payoutType:p.data?.kyc?.payoutType||'upi',upiId:'',bankAccountNumber:'',ifsc:''};payoutKycPaint();
}
function payoutKycFormState(){
 const f=PayoutVerification.form,legal=String(f.legalName||'').trim(),pan=String(f.panNumber||'').trim().toUpperCase(),type=f.payoutType;
 const checks=[legal.length>=2&&legal.length<=100,/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)];
 if(type==='bank')checks.push(/^\d{6,24}$/.test(String(f.bankAccountNumber||'').trim()),/^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(f.ifsc||'').trim().toUpperCase()));
 else checks.push(type==='upi'&&/^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/.test(String(f.upiId||'').trim()));
 return {remaining:checks.filter(value=>!value).length,valid:checks.every(Boolean)};
}
function payoutKycSyncFormState(){
 const state=payoutKycFormState(),button=document.getElementById('zpay-kyc-submit'),remaining=document.getElementById('zpay-kyc-fields-left'),error=document.querySelector('.zpay-details-form>.zpay-error');
 if(button)button.disabled=PayoutVerification.submitting||!state.valid;
 if(remaining)remaining.textContent=state.remaining?`${state.remaining} field${state.remaining===1?'':'s'} left`:'Ready to submit';
 if(error)error.remove();
}
function payoutKycDraft(key,value){
 const p=PayoutVerification;if(S.v!=='payout-kyc'||!p.editing||p.submitting||p.uncertain||!['legalName','panNumber','payoutType','upiId','bankAccountNumber','ifsc'].includes(key))return;
 p.form[key]=['panNumber','ifsc'].includes(key)?String(value).toUpperCase():String(value);p.attemptKey='';p.error='';
 if(key==='payoutType'){p.form.upiId='';p.form.bankAccountNumber='';p.form.ifsc='';payoutKycPaint()}else payoutKycSyncFormState();
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
function payoutKycDate(value){return typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}):''}
function payoutKycMethod(kyc){return kyc?.payoutType==='bank'?'Bank account':'UPI'}
function payoutKycAddress(kyc){return String(kyc?.payoutAddress||'').replace(/^UPI\s+/i,'')}
function payoutKycTone(status){return ['pending','verified','rejected'].includes(status)?status:'missing'}
function payoutKycSummary(){
 if(!payoutKycOwn())return '';
 const p=PayoutVerification,k=p.data?.kyc,status=k?.status||'missing',verified=status==='verified',pending=status==='pending',rejected=status==='rejected';
 if(p.loading&&!p.data)return `<section class="zpay-payout-card is-loading" aria-label="Payout verification" role="status" aria-busy="true"><div>${skeletonLine('112px',13)}${skeletonLine('84px',10)}</div></section>`;
 const title=verified?`Payout to ${payoutKycMethod(k)}`:'Payout verification',detail=verified?`${hi('check',12)}<span>Verified${k.payoutAddress?` · ${esc(payoutKycAddress(k))}`:''}</span>`:`<span>${payoutKycStatus(status)}</span>`;
 const visible=verified?'Manage':pending?'View':rejected?'Fix':'Verify',label=verified?'Manage payout details':pending?'View payout verification':rejected?'Fix payout details':'Verify payout details';
 return `<section class="zpay-payout-card is-${payoutKycTone(status)}" aria-label="Payout verification"><div><strong>${esc(title)}</strong><small>${detail}</small></div><button type="button" aria-label="${label}" onclick="payoutKycOpen()">${visible}</button>${p.error?`<p class="zpay-inline-error" role="alert">${esc(p.error)}</p>`:''}</section>`;
}
function payoutKycHero(kyc){
 const status=kyc?.status||'missing',verified=status==='verified',pending=status==='pending',rejected=status==='rejected';
 const copy=verified?`You can withdraw anytime. Payouts are sent to the ${payoutKycMethod(kyc)} below.`:pending?'Your payout details are under review. Pull down or refresh to check for an update.':rejected?'Update your payout details and submit them again.':'Add your payout details once to start withdrawing your diamonds.';
 return `<section class="zpay-kyc-hero is-${payoutKycTone(status)}"><span class="zpay-kyc-shield">${hi(rejected?'info':'shield',18)}</span><div><h2>${payoutKycStatus(status)}${verified?'<small>Active</small>':''}</h2><p>${copy}</p>${kyc?.reason?`<p class="zpay-kyc-reason">${esc(kyc.reason)}</p>`:''}</div></section>`;
}
function payoutKycHow(){return `<section class="zpay-kyc-section"><h2>How it works</h2><ol class="zpay-kyc-steps"><li class="is-current"><i>1</i><span><strong>Add your details</strong><small>Legal name, PAN and UPI ID</small></span></li><li><i>2</i><span><strong>Verification review</strong><small>Track progress anytime with Refresh status</small></span></li><li><i>3</i><span><strong>Withdraw anytime</strong><small>Once verified, payouts go to your saved account</small></span></li></ol></section>`}
function payoutKycReady(){return `<section class="zpay-kyc-section"><h2>Keep these ready</h2><ul class="zpay-kyc-ready"><li>${hi('user',14)}<strong>Legal name, as on your PAN</strong></li><li>${hi('doc',14)}<strong>PAN number</strong></li><li>${hi('wal',14)}<strong>UPI ID or bank account</strong></li></ul></section>`}
function payoutKycDetails(kyc){
 const verifiedAt=payoutKycDate(kyc?.reviewedAt),address=payoutKycAddress(kyc),method=payoutKycMethod(kyc);
 return `<section class="zpay-kyc-section zpay-kyc-verified"><h2>Payout details</h2><dl><div><dt>Legal name</dt><dd>${esc(kyc?.legalName||'—')}</dd></div><div><dt>PAN</dt><dd>${esc(kyc?.panMasked||'—')}</dd></div><div><dt>Method</dt><dd>${esc(method)}</dd></div><div><dt>${kyc?.payoutType==='bank'?'Bank details':'UPI ID'}</dt><dd>${esc(address||'—')}</dd></div></dl><p>Details are partly hidden for your security. Changing them needs a new verification.</p>${verifiedAt?`<h2>Verified on</h2><dl><div><dt>Date</dt><dd>${esc(verifiedAt)}</dd></div></dl>`:''}</section>`;
}
function payoutKycForm(){
 const p=PayoutVerification,f=p.form,locked=p.submitting||p.uncertain,state=payoutKycFormState(),bank=f.payoutType==='bank';
 return `<form class="zpay-form zpay-details-form" autocomplete="off" onsubmit="event.preventDefault();payoutKycSubmit()"><section><h2>Identity</h2><div class="zpay-field-card"><div class="zpay-field-row"><label for="zpay-legal-name">Legal name</label><input id="zpay-legal-name" autocomplete="off" maxlength="100" placeholder="As on your PAN" value="${esc(f.legalName||'')}" oninput="payoutKycDraft('legalName',this.value)" ${locked?'disabled':''}></div><div class="zpay-field-row"><label for="zpay-pan">PAN</label><input id="zpay-pan" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="10" placeholder="ABCDE1234F" value="${esc(f.panNumber||'')}" oninput="payoutKycDraft('panNumber',this.value)" ${locked?'disabled':''}></div></div><p class="zpay-field-help">Use the exact name printed on your PAN card.</p></section><section><h2>Payout</h2><div class="zpay-field-card"><div class="zpay-field-row"><label for="zpay-method">Method</label><select id="zpay-method" onchange="payoutKycDraft('payoutType',this.value)" ${locked?'disabled':''}><option value="upi" ${bank?'':'selected'}>UPI</option><option value="bank" ${bank?'selected':''}>Bank account</option></select></div>${bank?`<div class="zpay-field-row"><label for="zpay-bank-account">Account number</label><input id="zpay-bank-account" inputmode="numeric" autocomplete="off" maxlength="24" placeholder="Account number" value="${esc(f.bankAccountNumber||'')}" oninput="payoutKycDraft('bankAccountNumber',this.value)" ${locked?'disabled':''}></div><div class="zpay-field-row"><label for="zpay-ifsc">IFSC</label><input id="zpay-ifsc" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="11" placeholder="SBIN0001234" value="${esc(f.ifsc||'')}" oninput="payoutKycDraft('ifsc',this.value)" ${locked?'disabled':''}></div>`:`<div class="zpay-field-row"><label for="zpay-kyc-upi">UPI ID</label><input id="zpay-kyc-upi" autocomplete="off" inputmode="email" maxlength="150" placeholder="name@okaxis" value="${esc(f.upiId||'')}" oninput="payoutKycDraft('upiId',this.value)" ${locked?'disabled':''}></div>`}</div><p class="zpay-kyc-security">${hi('lock',12)}<span>Your name must match your PAN, and payouts go only to this ${bank?'account':'UPI ID'}. Your details are used only for payouts.</span></p></section>${p.error?`<p class="zpay-error" role="alert">${esc(p.error)}</p>`:''}<footer class="zpay-kyc-footer"><button id="zpay-kyc-submit" class="zpay-primary" type="submit" ${p.submitting||!state.valid?'disabled':''}>${p.submitting?'Submitting for verification…':p.uncertain?'Retry same verification':'Submit for verification'}</button><span id="zpay-kyc-fields-left">${state.remaining?`${state.remaining} field${state.remaining===1?'':'s'} left`:'Ready to submit'}</span></footer></form>`;
}
function payoutKycScreen(){
 if(!payoutKycOwn())return '<section class="zpay-page"><p>Payout verification is available to host accounts.</p></section>';
 const p=PayoutVerification,k=p.data?.kyc||{status:'missing'},status=k.status||'missing';
 if(p.editing)return `<section class="zpay-page zpay-kyc-page is-editing" aria-label="Payout details">${payoutKycForm()}</section>`;
 if(p.loading&&!p.data)return `<section class="zpay-page zpay-kyc-page" aria-label="Payout identity verification">${contentSkeleton('rows','Loading payout verification',3)}</section>`;
 const actions=status==='verified'?`<button type="button" class="zpay-primary" onclick="payoutKycWithdraw()">Withdraw now</button><button type="button" class="zpay-kyc-link" onclick="payoutKycEdit()">Update payout details</button>`:`<button type="button" class="zpay-primary" onclick="payoutKycEdit()" ${p.submitting?'disabled':''}>${status==='missing'?'Add payout details':status==='rejected'?'Fix payout details':'Update payout details'}</button><button type="button" class="zpay-kyc-link" onclick="payoutKycLoad()" ${p.loading||p.submitting?'disabled':''}>${p.loading?'Refreshing status…':'Refresh status'}</button>`;
 return `<section class="zpay-page zpay-kyc-page" aria-label="Payout identity verification">${payoutKycHero(k)}${p.error?`<p class="zpay-error" role="alert">${esc(p.error)}</p>`:''}${status==='verified'?payoutKycDetails(k):`${payoutKycHow()}${payoutKycReady()}`}<footer class="zpay-kyc-footer">${actions}</footer></section>`;
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
ZimiPullRefresh.register('payout-kyc',{refresh:payoutKycLoad,busy:()=>PayoutVerification.loading||PayoutVerification.submitting});
const payoutVerificationPreviousAfter=ZimiHome.afterRender,payoutVerificationPreviousHeader=ZimiHome.header,payoutVerificationPreviousNav=ZimiHome.nav;
ZimiHome.afterRender=()=>{payoutVerificationPreviousAfter();if((payoutActive()||S.v==='payout-kyc')&&payoutKycOwn()&&!PayoutVerification.requested&&!DEMO){PayoutVerification.requested=true;queueMicrotask(()=>{if(payoutActive()||S.v==='payout-kyc')payoutKycLoad()})}};
ZimiHome.header=()=>{
 if(S.v!=='payout-kyc')return payoutVerificationPreviousHeader();
 const editing=PayoutVerification.editing,status=PayoutVerification.data?.kyc?.status||'missing';
 return `<header class="zh-subheader zpay-kyc-header">${backButton('payoutKycBack()',{label:editing?'Back to payout verification':'Back to payments'})}<h1>${editing?'Payout details':'Payout verification'}</h1>${editing?`<span class="zpay-header-status is-${payoutKycTone(status)}">${payoutKycStatus(status)}</span>`:''}</header>`;
};
ZimiHome.nav=()=>{if(S.v==='payout-kyc'){document.getElementById('nav').style.display='none';return true}return payoutVerificationPreviousNav()};
ZimiHome.views['payout-kyc']=payoutKycScreen;
window.ZimiPayoutVerification={needed:payoutNeedsQuote,verified:payoutKycVerified,summary:payoutKycSummary,review:payoutQuoteStart,reviewDetails:payoutQuoteReview,clearQuote:payoutQuoteClear,busy:()=>PayoutVerification.quoteLoading,reset:payoutVerificationReset};
