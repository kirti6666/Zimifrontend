/* Restart is a confirmed cancellation of this period's pending bonus only.
   Durable intent stores only the owner, period, key and reviewed pending amount;
   it contains no identity documents or payout destination. */
const HostRewardRestart={owner:'',attempt:null,review:null,busy:false,uncertain:false,error:'',success:'',request:0,sequence:0,storageError:false};
function hrRestartKey(owner){return `binzo.host.reward-restart.${owner}`}
function hrRestartOwner(){return isHostWallet()&&S.loggedIn?String(S.user?.id||''):''}
function hrRestartSync(){
 const owner=hrRestartOwner(),state=HostRewardRestart;if(state.owner===owner)return;
 Object.assign(state,{owner,attempt:null,review:null,busy:false,uncertain:false,error:'',success:'',storageError:false,request:0});
 if(!owner)return;
 try{
  const raw=localStorage.getItem(hrRestartKey(owner));if(!raw)return;const saved=JSON.parse(raw);
  if(saved.owner!==owner||!/^[a-f\d]{24}$/i.test(saved.periodId)||!/^[a-zA-Z0-9_-]{8,100}$/.test(saved.idempotencyKey)||!Number.isSafeInteger(saved.expectedPendingDiamonds)||saved.expectedPendingDiamonds<0)throw Error('Invalid restart intent');
  state.attempt={owner,periodId:saved.periodId,idempotencyKey:saved.idempotencyKey,expectedPendingDiamonds:saved.expectedPendingDiamonds};state.uncertain=true;
 }catch{state.storageError=true;state.error='Your previous restart could not be checked. Refresh your reward progress before trying again.'}
}
function hrRestartForget(){
 const state=HostRewardRestart;if(!state.owner)return;
 localStorage.removeItem(hrRestartKey(state.owner));state.attempt=null;state.review=null;state.uncertain=false;
}
function hrRestartDate(value){return new Date(value).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'})}
function hrRestartReview(){
 hrRestartSync();const state=HostRewardRestart,info=diamondOwnWallet()?.hostReward?.restart;
 if(DEMO||!state.owner||!isApprovedHost()||state.busy||state.attempt||state.storageError||!info?.eligible||!info.periodId)return;
 state.review={periodId:info.periodId,expectedPendingDiamonds:info.pendingDiamonds,nextPeriodStart:info.nextPeriodStart};state.error='';state.success='';payoutPaint();
}
function hrRestartCancel(){if(HostRewardRestart.busy||HostRewardRestart.attempt)return;HostRewardRestart.review=null;payoutPaint()}
function hrRestartConfirm(){
 hrRestartSync();const state=HostRewardRestart;if(DEMO||!state.owner||!isApprovedHost()||state.busy||state.storageError||!state.attempt&&!state.review)return;
 if(!state.attempt){
  const current=diamondOwnWallet()?.hostReward?.restart,review=state.review;
  if(!current?.eligible||current.periodId!==review.periodId||current.pendingDiamonds!==review.expectedPendingDiamonds){state.review=null;state.error='Your pending bonus changed. Review your latest progress before restarting.';payoutPaint();return}
  const attempt={owner:state.owner,periodId:review.periodId,expectedPendingDiamonds:review.expectedPendingDiamonds,idempotencyKey:crypto.randomUUID()};
  try{localStorage.setItem(hrRestartKey(state.owner),JSON.stringify(attempt))}catch{state.error='Your restart reference could not be saved. Try again before restarting.';payoutPaint();return}
  state.attempt=attempt;
 }
 state.busy=true;state.error='';state.request=++state.sequence;payoutPaint();
 Native.send('host.reward.restart',{periodId:state.attempt.periodId,idempotencyKey:state.attempt.idempotencyKey,expectedPendingDiamonds:state.attempt.expectedPendingDiamonds,confirmed:true,requestId:state.request});
}
function hostRewardRestartView(wallet){
 hrRestartSync();const state=HostRewardRestart,info=wallet?.hostReward?.restart;if(!state.owner||!isApprovedHost()||!info&&!state.attempt)return '';
 if(!info?.eligible&&!state.attempt&&!state.review&&!state.error&&!state.success)return '';
 const hours=value=>new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(value/60),review=state.review;
 const explanation=info?.eligible?`You are ${hours(info.behindMinutes)} hours behind the targets for completed weeks. You can restart week 1 next Monday.`:'';
 const confirmation=review?`<div class="zpay-review" role="region" aria-label="Confirm reward restart"><h3>Restart your reward period?</h3><p>This cancels ${esc(review.expectedPendingDiamonds.toLocaleString('en-IN'))} pending bonus diamonds from this unfinished period. Week 1 starts ${esc(hrRestartDate(review.nextPeriodStart))} (IST).</p><p>Your available diamonds, gifts and existing withdrawals stay yours.</p><button type="button" class="zpay-secondary" onclick="hrRestartCancel()" ${state.busy||state.attempt?'disabled':''}>Keep current period</button><button type="button" class="zpay-primary" onclick="hrRestartConfirm()" ${state.busy?'disabled':''}>${state.busy?'Restarting…':'Confirm reward restart'}</button></div>`:'';
 const retry=state.attempt&&!state.busy?`<p>Check or complete your earlier restart using the same reference. It will not cancel another period.</p><button type="button" class="zpay-secondary" onclick="hrRestartConfirm()">Retry same restart</button>`:'';
 return `<section class="zpay-restart" aria-label="Reward restart">${explanation?`<p>${esc(explanation)}</p>`:''}${info?.eligible&&!review&&!state.attempt&&!state.storageError?'<button type="button" class="zpay-secondary" onclick="hrRestartReview()">Restart reward period</button>':''}${confirmation}${retry}${state.error?`<p class="zpay-error" role="alert">${esc(state.error)}</p>`:''}${state.success?`<p role="status">${esc(state.success)}</p>`:''}</section>`;
}
Native.on('host.reward.restarted',data=>{
 hrRestartSync();const state=HostRewardRestart,receipt=data.receipt,attempt=state.attempt;
 if(!attempt||!state.busy||data.requestId!==state.request||attempt.owner!==hrRestartOwner()||receipt?.periodId!==attempt.periodId||receipt?.idempotencyKey!==attempt.idempotencyKey||receipt?.cancelledPendingDiamonds!==attempt.expectedPendingDiamonds)return;
 state.busy=false;state.error='';state.success=`Reward period restarted. Week 1 starts ${hrRestartDate(receipt.nextPeriodStart)} (IST).`;
 try{hrRestartForget()}catch{state.attempt=null;state.review=null;state.uncertain=false}
 Native.send('wallet.load',{});payoutPaint();
});
Native.on('host.reward.error',data=>{
 hrRestartSync();const state=HostRewardRestart,attempt=state.attempt;
 if(!attempt||!state.busy||data.requestId!==state.request||data.periodId!==attempt.periodId||data.idempotencyKey!==attempt.idempotencyKey)return;
 state.busy=false;state.error=data.message||'Your restart could not be confirmed.';
 const definite=!state.uncertain&&[400,401,403,404,409,422].includes(data.status);
 if(definite){try{hrRestartForget()}catch{state.storageError=true}}else state.uncertain=true;
 Native.send('wallet.load',{});payoutPaint();
});
Native.on('session',()=>{hrRestartSync();if(!isApprovedHost()){HostRewardRestart.review=null;HostRewardRestart.busy=false}});
