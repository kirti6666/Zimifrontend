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
function diamondBalanceView(wallet){return diamondReady(wallet)?`<div class="zd-balance"><span>Available diamonds</span><strong>${diamondIcon(23)}<span>${diamondFormat(wallet.diamondUnits)}</span></strong>${wallet.reservedDiamondUnits>0?`<small>${diamondFormat(wallet.reservedDiamondUnits)} diamonds reserved for withdrawals</small>`:''}</div>`:''}
function diamondConversionText(wallet){
 const quote=wallet?.conversion;if(!quote||!Number.isFinite(quote.diamondsPerCoin)||!Number.isFinite(quote.paisePerDiamond))return '';
 const cash=new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:2,maximumFractionDigits:8}).format(quote.paisePerDiamond/100);
 return `New earnings: 1 coin = ${new Intl.NumberFormat('en-IN',{maximumFractionDigits:6}).format(quote.diamondsPerCoin)} diamonds · 1 diamond = ${cash}.`;
}
function diamondPayoutEstimate(wallet,amountPaise){
 if(!diamondReady(wallet)||!Number.isSafeInteger(amountPaise)||amountPaise<=0||!Number.isSafeInteger(wallet.earningsPaise)||wallet.earningsPaise<=0||amountPaise>wallet.earningsPaise)return null;
 return Number(BigInt(wallet.diamondUnits)*BigInt(amountPaise)/BigInt(wallet.earningsPaise));
}
function diamondPayoutReceipt(payout){return payout?.diamondScale===1000000&&Number.isSafeInteger(payout.diamondUnits)&&payout.diamondUnits>=0?`<p class="zd-payout-diamonds">${diamondFormat(payout.diamondUnits)} diamonds</p>`:''}
window.ZimiDiamonds={format:diamondFormat,ready:diamondReady,ownWallet:diamondOwnWallet};
