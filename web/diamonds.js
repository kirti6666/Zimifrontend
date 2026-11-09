/* Coins remain spendable. Server-confirmed host diamonds carry their original
   cash value even after staff changes the rate for future earnings. */
P.chevronRight='<path d="M9 6l6 6-6 6"/>';
P.diamond='<path d="m3 8 4-5h10l4 5-9 13L3 8Zm0 0h18M7 3l5 18 5-18M7 3l5 5 5-5"/>';
function diamondIcon(size=20){return hi('diamond',size)}
function diamondFormat(units){
 if(!Number.isSafeInteger(units)||units<0)return '—';
 const value=BigInt(units),whole=value/1000000n,fraction=String(value%1000000n).padStart(6,'0').replace(/0+$/,'');
 return whole.toLocaleString('en-IN')+(fraction?'.'+fraction:'');
}
function diamondReady(wallet){return wallet?.diamondScale===1000000&&Number.isSafeInteger(wallet.diamondUnits)&&wallet.diamondUnits>=0&&Number.isSafeInteger(wallet.reservedDiamondUnits)&&wallet.reservedDiamondUnits>=0}
function diamondOwnWallet(){return S.user?.id&&S.walletSnapshot?.owner===S.user.id?S.walletSnapshot.data:null}
function diamondProfileValue(){const wallet=diamondOwnWallet();if(window.ZimiHostAccess?.checking()||contentPending('wallet'))return '<span class="zh-skeleton" role="status" aria-label="Loading diamond balance" aria-busy="true">'+skeletonLine('60px',20)+'</span>';if(ContentLoading.wallet.error||!diamondReady(wallet))return '<span aria-label="Diamond balance unavailable">—</span>';return diamondFormat(Number.isSafeInteger(wallet.profileDiamondUnits)?wallet.profileDiamondUnits:wallet.diamondUnits)}
function diamondProfilePaise(wallet){return Number.isSafeInteger(wallet?.profileEarningsPaise)?wallet.profileEarningsPaise:wallet?.earningsPaise}
function diamondProfileReservedPaise(wallet){return Number.isSafeInteger(wallet?.profileReservedPaise)?wallet.profileReservedPaise:wallet?.hostEarningsPolicy?0:wallet?.reservedPaise}
function diamondBalanceView(wallet,withdrawal=false){const units=!withdrawal&&Number.isSafeInteger(wallet?.profileDiamondUnits)?wallet.profileDiamondUnits:wallet?.diamondUnits,reserved=withdrawal?wallet?.reservedDiamondUnits:Number.isSafeInteger(wallet?.profileReservedDiamondUnits)?wallet.profileReservedDiamondUnits:wallet?.hostEarningsPolicy?0:wallet?.reservedDiamondUnits;return diamondReady(wallet)?`<div class="zd-balance"><span>${!withdrawal&&wallet.hostEarningsPolicy?'Call & gift diamonds':'Available diamonds'}</span><strong>${diamondIcon(23)}<span>${diamondFormat(units)}</span></strong>${reserved>0?`<small>${diamondFormat(reserved)} diamonds reserved for withdrawals</small>`:''}</div>`:''}
/* A current policy must never relabel the snapshot of an already-open period. */
function diamondPeriodRules(wallet){
 const source=wallet?.hostReward||wallet?.hostEarningsPolicy||{};
 return {weeks:Number.isSafeInteger(source.periodWeeks)&&source.periodWeeks>=1&&source.periodWeeks<=12?source.periodWeeks:4,
  makeup:source.shortWeekMakeupEnabled!==false,basis:source.activityBasis==='paid_video'?'paid_video':source.activityBasis==='paid_connected'?'paid_connected':'online_available'};
}
function diamondRatePaise(wallet){const value=wallet?.hostEarningsPolicy?.enabled?wallet.hostEarningsPolicy.paisePerDiamond:wallet?.conversion?.paisePerDiamond;return typeof value==='number'&&Number.isFinite(value)&&value>0?BigInt(Math.round(value*1000000)):null}
/* Whole diamonds needed to cover a cash amount, rounded up. */
function diamondsForPaise(wallet,paise){const rate=diamondRatePaise(wallet);if(rate===null||!Number.isSafeInteger(paise)||paise<0)return null;const amount=BigInt(paise)*1000000n;return (amount+rate-1n)/rate}
function diamondMinimum(wallet){const set=wallet?.hostEarningsPolicy?.enabled?wallet.hostEarningsPolicy.minimumWithdrawalDiamonds:null;return Number.isSafeInteger(set)&&set>0?BigInt(set):diamondsForPaise(wallet,wallet?.minimumWithdrawalPaise)}
/* Withdraw balance card: total, cash value and progress to the minimum. */
function diamondWithdrawCard(wallet){
 const earned=wallet.earningsPaise,minimum=wallet.minimumWithdrawalPaise,enough=earned>=minimum,progress=minimum>0?Math.min(100,Math.floor(earned*100/minimum)):100;
 const units=diamondMinimum(wallet),missing=enough?null:diamondsForPaise(wallet,minimum-earned),diamonds=diamondReady(wallet);
 const goal=minimum>0?`Min ${payoutMoneyShort(minimum)}${units!==null?` = ${units.toLocaleString('en-IN')} diamonds`:''}`:'';
 const left=enough?'Ready':missing!==null?`${missing.toLocaleString('en-IN')} to go`:`${payoutMoneyShort(minimum-earned)} to go`;
 return `<section class="zpay-card" aria-label="Diamond balance"><div class="zpay-card-top"><div><span>${diamonds?'Total diamonds':'Available earnings'}</span><strong>${diamonds?`${diamondIcon(22)}<span>${diamondFormat(wallet.diamondUnits)}</span>`:`<span>${payoutMoney(earned)}</span>`}</strong></div>${diamonds?`<b>≈ ${payoutMoney(earned)}</b>`:''}</div><div class="zpay-card-progress"><div class="zpay-meter" role="progressbar" aria-label="Progress to minimum withdrawal" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><i style="width:${progress}%"></i></div><div class="zpay-card-goal"><span>${goal}</span><b>${left}</b></div></div></section>`;
}
/* Host rules page. Wording follows the reference; every number comes from the
   host's saved policy and open reward period, so admin edits stay accurate. */
function diamondHostRules(wallet){
 const policy=wallet?.hostEarningsPolicy;if(!policy?.enabled)return '';
 const period=diamondPeriodRules(wallet),weeks=period.weeks,weekText=weeks===1?'1 week':`${weeks} weeks`,fmt=value=>value.toLocaleString('en-IN');
 const example=policy.bonusExample,bonus=policy.callBonusAvailable===true,hasExample=example&&['callDiamonds','bonusDiamonds','giftDiamonds'].every(key=>Number.isSafeInteger(example[key])&&example[key]>=0)&&example.callDiamonds>0;
 const minutes=wallet.hostReward?.weeklyTargetMinutes??policy.hostWeeklyTargetMinutes,hours=Number.isFinite(minutes)&&minutes>0?minutes/60:null;
 const hourText=hours===null?'':new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(hours),daily=hours===null?0:hours/7,dailyText=Number.isInteger(daily)?`${daily} hours a day`:`under ${Math.ceil(daily)} hours a day`;
 const video=period.basis==='paid_video',paid=video||period.basis==='paid_connected',minimum=wallet.minimumWithdrawalPaise,minimumUnits=diamondMinimum(wallet);
 const restartHours=Number.isFinite(wallet.hostReward?.restart?.thresholdMinutes)?wallet.hostReward.restart.thresholdMinutes/60:20;
 const sections=[
  ['Earn on every call',[
   'Every minute on a call earns you diamonds. The longer the call, the more you earn.',
   'Your diamonds land on your profile instantly. Watch them grow as you talk.',
   ...(policy.version===2?['Set your own call rate. A higher rate means more diamonds every minute.']:[]),
   'No limit on your earnings. The more you perform, the more diamonds you earn.',
  ]],
  ['Call bonus',bonus?[
   ...(hasExample?[`Earn ${fmt(example.bonusDiamonds)} extra diamonds for every ${fmt(example.callDiamonds)} you make on calls.`]:['Complete your weekly targets to unlock your call bonus.']),
   `Unlock it by completing your weekly targets by the end of week ${weeks}.${period.makeup?' Catch-up hours count.':''}`,
   `It waits in your withdraw section and is added at the end of week ${weeks}. Don't leave it behind!`,
  ]:['Your current earnings policy has no separate call bonus. Your available call diamonds stay yours.']],
  ['Gifts pay instantly',[
   ...(bonus&&hasExample&&example.callDiamonds+example.bonusDiamonds===example.giftDiamonds?[`On gifts, you get your bonus straight away: ${fmt(example.callDiamonds)} + ${fmt(example.bonusDiamonds)} bonus = ${fmt(example.giftDiamonds)}.`]:['Gift diamonds are added straight away.']),
   'No target, no waiting. Every gift is extra on top of your call earnings.',
  ]],
  [`Weekly target${hours!==null?`: ${hourText} hours`:''}`,[
   ...(hours!==null?[`${video?'Be on video calls':paid?'Be on paid calls':'Stay online and available for calls'} ${hourText} hours a week, for ${weekText}: ${dailyText}, no daily minimum.`]:[]),
   'Each week runs Monday 12:00 AM to Sunday 11:59 PM (Indian time).',
   video?'Only time on a paid video call counts, to the minute. Being online without a call does not count.':paid?'Only paid call time counts, to the minute. Being online without a call does not count.':'Your current reward period counts time online and available for calls.',
   ...(weeks>1?[period.makeup?'Short week? Missing hours move to next week. Ahead? Next week gets easier.':"Each week has its own target. Missed hours don't move to the next week."]:['Each week starts fresh.']),
   ...(wallet.hostReward?.restart?[`Over ${restartHours} hours behind? Tap Restart when eligible and week 1 begins again next Monday. The call bonus from the unfinished weeks is not added either way, so start fresh and unlock your next bonus.`]:[]),
   `After week ${weeks}, a fresh ${weekText} begins. Hours don't carry over into the new ${weekText}.`,
  ]],
  ['Online status',[
   'Online: you appear on the Explore page, where users can find you and start a video call.',
   "Offline: switch it off any time you don't want to be disturbed. You won't appear on Explore.",
   "Calls from chat still come through. Even when you're offline, users you chat with can video-call you.",
  ]],
  ['Missed the target?',[
   bonus?`Only the call bonus for those ${weekText} is missed.`:'Your available call diamonds stay yours.',
   'Every diamond on your profile stays yours, including all gift diamonds and gift bonus.',
  ]],
  ['Cash out',[
   ...(minimum>0?[`Withdraw as soon as you reach ${minimumUnits!==null?`${fmt(minimumUnits)} diamonds (${payoutMoneyShort(minimum)})`:payoutMoneyShort(minimum)}.`]:[]),
   policy.wholeBalanceWithdrawal?'Take out your whole balance at once, any time.':'Withdraw any amount from the minimum up to your balance, any time.',
   `Call and gift diamonds are ready straight away${bonus?`; your call bonus after week ${weeks}`:''}.`,
   'Withdrawing never reduces your pending bonus.',
  ]],
 ];
 const list=items=>`<ul>${items.map(item=>`<li><span aria-hidden="true"></span><span>${esc(item)}</span></li>`).join('')}</ul>`;
 return `<section class="zpay-rules-hero"><h2>Earn more on Binzo</h2><p>${bonus?'Every call pays. Hit your weekly target and unlock your bonus.':'Every call pays. Gifts pay instantly.'}</p></section><div class="zpay-rules" role="region" aria-label="Host earning rules">${sections.map(([title,items])=>`<section><h3>${esc(title)}</h3>${list(items)}</section>`).join('<hr>')}</div>`;
}
function diamondRewardView(wallet){
 const reward=wallet?.hostReward;if(!wallet?.hostEarningsPolicy?.enabled||!reward)return '';
 const hours=value=>new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(value/60),diamonds=new Intl.NumberFormat('en-IN',{maximumFractionDigits:0}).format(reward.pendingDiamonds),period=diamondPeriodRules(wallet);
 const ends=new Date(new Date(reward.periodEnd).getTime()-1).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'});
 const progress=typeof reward.progressMessage==='string'&&reward.progressMessage.trim()?esc(reward.progressMessage):reward.remainingThisWeekMinutes>0?`${hours(reward.remainingThisWeekMinutes)} more hours to stay on track this week.`:'This week’s target is complete.';
 return `<section class="zpay-reward" aria-label="Weekly call reward"><h2>Weekly reward progress</h2><p>Week ${reward.weekNumber} of ${period.weeks} · ${hours(reward.thisWeekMinutes)} of ${hours(reward.thisWeekTargetMinutes)} hours this week</p><progress max="${Math.max(1,reward.thisWeekTargetMinutes)}" value="${Math.min(reward.thisWeekMinutes,Math.max(1,reward.thisWeekTargetMinutes))}" aria-label="${period.basis==='paid_video'?"This week's paid video-call hours":period.basis==='paid_connected'?"This week's billed call hours":"This week's available hours"}"></progress>${reward.weekNumber>1?`<p>Last week: ${hours(reward.lastWeekMinutes)} hours.</p>`:''}<p>${progress}</p><dl><div><dt>Pending call reward</dt><dd>${diamonds} diamonds · ${payoutMoney(reward.pendingPaise)}</dd></div></dl><p>${reward.status==='missed'?'The previous period’s target was missed. Its reward is not withdrawable.':reward.status==='paid'?'Reward credited to your withdrawal balance.':`Reward is checked after the ${period.weeks}-week period ends, ${esc(ends)} (IST). Pending rewards cannot be withdrawn yet.`}</p>${hostRewardRestartView(wallet)}</section>`;
}
function diamondAlreadyPaidView(wallet){
 const units=Number.isSafeInteger(wallet?.alreadyPaidDiamondUnits)&&wallet.alreadyPaidDiamondUnits>=0?wallet.alreadyPaidDiamondUnits:null,cash=Number.isSafeInteger(wallet?.alreadyPaidPaise)&&wallet.alreadyPaidPaise>=0?wallet.alreadyPaidPaise:null;
 if(units===null&&cash===null)return '';
 return `<section class="zpay-balance" aria-label="Already paid withdrawals"><span>Already paid</span><strong>${units!==null?`${diamondFormat(units)} diamonds`:payoutMoney(cash)}</strong>${units!==null&&cash!==null?`<p>${payoutMoney(cash)}</p>`:''}</section>`;
}
function diamondPayoutEstimate(wallet,amountPaise){
 if(!diamondReady(wallet)||!Number.isSafeInteger(amountPaise)||amountPaise<=0||!Number.isSafeInteger(wallet.earningsPaise)||wallet.earningsPaise<=0||amountPaise>wallet.earningsPaise)return null;
 if(Number.isSafeInteger(wallet.profileDiamondUnits)&&Number.isSafeInteger(wallet.profileEarningsPaise)){
  const regularCash=wallet.profileEarningsPaise,regularUnits=wallet.profileDiamondUnits,rewardCash=wallet.earningsPaise-regularCash,rewardUnits=wallet.diamondUnits-regularUnits,regularTaken=Math.min(amountPaise,regularCash),rewardTaken=amountPaise-regularTaken;
  return Number((regularTaken===regularCash?BigInt(regularUnits):BigInt(regularUnits)*BigInt(regularTaken)/BigInt(regularCash))+(rewardTaken===rewardCash?BigInt(rewardUnits):BigInt(rewardUnits)*BigInt(rewardTaken)/BigInt(rewardCash)));
 }
 return Number(BigInt(wallet.diamondUnits)*BigInt(amountPaise)/BigInt(wallet.earningsPaise));
}
function diamondPayoutReceipt(payout){return payout?.diamondScale===1000000&&Number.isSafeInteger(payout.diamondUnits)&&payout.diamondUnits>=0?`<p class="zd-payout-diamonds">${diamondFormat(payout.diamondUnits)} diamonds</p>`:''}
window.ZimiDiamonds={format:diamondFormat,ready:diamondReady,ownWallet:diamondOwnWallet};
