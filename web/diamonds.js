/* Coins remain spendable. Server-confirmed host diamonds carry their original
   cash value even after staff changes the rate for future earnings. */
P.diamond='<path d="m3 8 4-5h10l4 5-9 13L3 8Zm0 0h18M7 3l5 18 5-18M7 3l5 5 5-5"/>';
function diamondIcon(size=20){return hi('diamond',size)}
function diamondFormat(units){
 if(!Number.isSafeInteger(units)||units<0)return '—';
 const value=BigInt(units),whole=value/1000000n,fraction=String(value%1000000n).padStart(6,'0').replace(/0+$/,'');
 return whole.toLocaleString('en-IN')+(fraction?'.'+fraction:'');
}
function diamondReady(wallet){return wallet?.diamondScale===1000000&&Number.isSafeInteger(wallet.diamondUnits)&&wallet.diamondUnits>=0&&Number.isSafeInteger(wallet.reservedDiamondUnits)&&wallet.reservedDiamondUnits>=0}
function diamondOwnWallet(){return S.walletSnapshot?.owner===S.user?.id?S.walletSnapshot.data:null}
function diamondProfilePaise(wallet){return Number.isSafeInteger(wallet?.profileEarningsPaise)?wallet.profileEarningsPaise:wallet?.earningsPaise}
function diamondProfileReservedPaise(wallet){return Number.isSafeInteger(wallet?.profileReservedPaise)?wallet.profileReservedPaise:wallet?.hostEarningsPolicy?0:wallet?.reservedPaise}
function diamondBalanceView(wallet,withdrawal=false){const units=!withdrawal&&Number.isSafeInteger(wallet?.profileDiamondUnits)?wallet.profileDiamondUnits:wallet?.diamondUnits,reserved=withdrawal?wallet?.reservedDiamondUnits:Number.isSafeInteger(wallet?.profileReservedDiamondUnits)?wallet.profileReservedDiamondUnits:wallet?.hostEarningsPolicy?0:wallet?.reservedDiamondUnits;return diamondReady(wallet)?`<div class="zd-balance"><span>${!withdrawal&&wallet.hostEarningsPolicy?'Call & gift diamonds':'Available diamonds'}</span><strong>${diamondIcon(23)}<span>${diamondFormat(units)}</span></strong>${reserved>0?`<small>${diamondFormat(reserved)} diamonds reserved for withdrawals</small>`:''}</div>`:''}
function diamondConversionText(wallet){
 const policy=wallet?.hostEarningsPolicy;if(policy?.enabled){const cash=new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:2,maximumFractionDigits:8}).format(policy.paisePerDiamond/100);return `Calls: ${policy.hostCallSharePercent} diamonds per 100 coins. Gifts: ${policy.hostGiftSharePercent} diamonds per 100 coins, rounded down per gift. 1 diamond = ${cash}.`}
 const quote=wallet?.conversion;if(!quote||!Number.isFinite(quote.diamondsPerCoin)||!Number.isFinite(quote.paisePerDiamond))return '';
 const cash=new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:2,maximumFractionDigits:8}).format(quote.paisePerDiamond/100);
 return `New earnings: 1 coin = ${new Intl.NumberFormat('en-IN',{maximumFractionDigits:6}).format(quote.diamondsPerCoin)} diamonds · 1 diamond = ${cash}.`;
}
function diamondWithdrawalMessage(wallet){
 if(!diamondReady(wallet)||!wallet.hostEarningsPolicy?.enabled||!Number.isSafeInteger(wallet.minimumWithdrawalPaise)||wallet.minimumWithdrawalPaise<=0)return '';
 const current=wallet.earningsPaise,minimum=wallet.minimumWithdrawalPaise,quote=wallet.hostEarningsPolicy.paisePerDiamond;
 if(current>=minimum)return `You can withdraw with ${diamondFormat(wallet.diamondUnits)} diamonds and redeem ${payoutMoney(current)}. Your whole available balance is withdrawn at once.`;
 const denominator=BigInt(Math.round(quote*1000000)),numerator=BigInt(minimum-current)*1000000n,missing=(numerator+denominator-1n)/denominator;
 return `Collect ${missing.toLocaleString('en-IN')} more diamonds to reach the ${payoutMoney(minimum)} minimum. Withdrawing does not reduce your call reward.`;
}
function diamondHostRules(wallet){
 const policy=wallet?.hostEarningsPolicy;if(!policy?.enabled)return '';
 const hours=new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format((wallet.hostReward?.weeklyTargetMinutes??policy.hostWeeklyTargetMinutes)/60);
 return `<section class="zpay-rules" aria-label="Host earning rules"><h2>Host rules</h2><p>${esc(diamondConversionText(wallet))}</p><p>Weekly target: ${hours} hours online and available for calls. Weeks run Monday to Sunday in IST. Short or extra hours adjust the next week's target within the same four-week reward period.</p><p>Call reward: ${policy.hostCallRewardPercent}% after week 4 if you complete your targets. Rewards appear here in Withdrawals. Gifts have no target.</p>${policy.hostRules?`<p class="zpay-rules-text">${esc(policy.hostRules)}</p>`:''}</section>`;
}
function diamondRewardView(wallet){
 const reward=wallet?.hostReward;if(!wallet?.hostEarningsPolicy?.enabled||!reward)return '';
 const hours=value=>new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(value/60),diamonds=new Intl.NumberFormat('en-IN',{maximumFractionDigits:0}).format(reward.pendingDiamonds);
 const ends=new Date(new Date(reward.periodEnd).getTime()-1).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'});
 return `<section class="zpay-reward" aria-label="Weekly call reward"><h2>Weekly reward progress</h2><p>Week ${reward.weekNumber} of 4 · ${hours(reward.thisWeekMinutes)} of ${hours(reward.thisWeekTargetMinutes)} hours this week</p><progress max="${Math.max(1,reward.thisWeekTargetMinutes)}" value="${Math.min(reward.thisWeekMinutes,Math.max(1,reward.thisWeekTargetMinutes))}" aria-label="This week's available hours"></progress>${reward.weekNumber>1?`<p>Last week: ${hours(reward.lastWeekMinutes)} hours.</p>`:''}<p>${reward.remainingThisWeekMinutes>0?`${hours(reward.remainingThisWeekMinutes)} more hours to stay on track this week.`:'This week’s target is complete.'}</p><dl><div><dt>Pending call reward</dt><dd>${diamonds} diamonds · ${payoutMoney(reward.pendingPaise)}</dd></div></dl><p>${reward.status==='missed'?'The previous period’s target was missed. Its reward is not withdrawable.':reward.status==='paid'?'Reward credited to your withdrawal balance.':`Reward is checked after all four weeks end, ${esc(ends)} (IST). Pending rewards cannot be withdrawn yet.`}</p></section>`;
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
