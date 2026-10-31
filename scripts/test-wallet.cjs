/* The actual wallet route uses confirmed coins and separate INR earnings.
   Native requests and all financial responses are intercepted locally. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const member={user:{id:'507f1f77bcf86cd799439001',name:'Wallet member',role:'sender',serverRole:'user',hostStatus:'none',isVerifiedHost:false,isPhoneVerified:true},verification:'none',requiresOnboarding:false};
const host={...member,user:{...member.user,id:'507f1f77bcf86cd799439011',name:'Wallet creator',role:'host',serverRole:'host',hostStatus:'approved',isVerifiedHost:true},verification:'verified'};
const wallet={coins:52400,earningsPaise:123456,reservedPaise:5000,minimumWithdrawalPaise:50000,withdrawalsEnabled:true};
const ledger={items:[{title:'Confirmed coin purchase',time:'Today',coins:200,kind:'topup'},{title:'Call with a creator',time:'Yesterday',coins:-25,kind:'call'}]};
const receive=(page,type,data={})=>page.evaluate(message=>Native.receive(message),{type,data});
const go=(page,view)=>page.evaluate(view=>go(view),view);
const button=(page,name)=>page.getByRole('button',{name,exact:true});
const requests=(page,type)=>page.evaluate(type=>__sent.filter(message=>message.type===type),type);
async function audit(page,label){
 const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,pageOverflow:document.querySelector('.zwallet-page').scrollWidth>document.querySelector('.zwallet-page').clientWidth+1,canvas:getComputedStyle(document.querySelector('.app')).backgroundColor,shadows:[...document.querySelectorAll('.zwallet-page,.zwallet-page *')].filter(el=>el.getClientRects().length).filter(el=>{const c=getComputedStyle(el);return c.boxShadow!=='none'||c.textShadow!=='none'||c.filter.includes('drop-shadow')||c.borderRadius!=='10px'}).map(el=>el.className||el.tagName)}));
 assert.equal(state.overflow,false,`${label}: no document overflow`);assert.equal(state.pageOverflow,false,`${label}: no wallet overflow`);assert.equal(state.canvas,'rgb(255, 255, 255)',`${label}: white background`);assert.deepEqual(state.shadows,[],`${label}: flat 10px controls`);
}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
 const errors=[];
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});page.setDefaultTimeout(7000);page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://**/*',route=>route.abort());await page.addInitScript(()=>{window.__sent=[];window.ReactNativeWebView={postMessage:raw=>__sent.push(JSON.parse(raw))}});
  await page.goto(pathToFileURL(path.join(root,'assets/aurora.html')).href+'?role=sender');
  await receive(page,'session',member);await go(page,'wallet');
  await page.getByRole('status',{name:'Loading wallet',exact:true}).waitFor();
  assert.equal(await page.locator('.zwallet-balance .big').count(),0,'An unknown wallet does not show a sample balance');
  await receive(page,'data.loading',{resource:'wallet',loading:false,error:'Wallet unavailable. Please retry.'});
  await page.getByRole('alert').filter({hasText:'Wallet unavailable'}).waitFor();
  await button(page,'Retry').click();assert.equal((await requests(page,'wallet.load')).length,1,'Retry requests the confirmed wallet');
  await receive(page,'wallet.balance',wallet);await receive(page,'data.transactions',{items:[]});
  assert.match(await page.locator('.zwallet-balance .big').innerText(),/52,400/);
  assert.equal(await page.locator('.earnbox').count(),0,'Members never see creator earnings even if a payload includes them');
  assert.equal(await button(page,'Withdraw').count(),0);assert.equal(await button(page,'Add coins').count(),1,'Wallet has one clear recharge action');
  await page.getByRole('heading',{name:'No activity yet',exact:true}).waitFor();
  const shots=path.join(root,'artifacts','wallet');fs.mkdirSync(shots,{recursive:true});
  for(const width of [320,390]){await page.setViewportSize({width,height:844});await audit(page,`Member wallet ${width}px`);await page.screenshot({path:path.join(shots,`member-${width}.png`)})}
  await receive(page,'wallet.balance',{coins:60000});assert.match(await page.locator('.zwallet-balance .big').innerText(),/60,000/,'Late balances repaint immediately');
  await receive(page,'data.loading',{resource:'transactions',loading:true});await page.getByRole('status',{name:'Loading recent transactions',exact:true}).waitFor();
  await receive(page,'data.loading',{resource:'transactions',loading:false,error:'History unavailable'});await page.getByRole('alert').filter({hasText:'History unavailable'}).waitFor();
  await button(page,'Retry').click();assert.ok((await requests(page,'transactions.load')).length>=2,'History retry uses its own read');
  await receive(page,'data.transactions',ledger);assert.match(await page.locator('.zwallet-activity').innerText(),/Confirmed coin purchase[\s\S]*\+200[\s\S]*Call with a creator[\s\S]*25/);
  assert.equal(await page.evaluate(()=>S.bal),60000,'Reading ledger rows never changes the coin balance');
  await button(page,'View all').click();assert.equal(await page.evaluate(()=>S.v),'transactions');
  await go(page,'wallet');await button(page,'Add coins').click();assert.equal(await page.evaluate(()=>S.v),'coins');assert.equal((await requests(page,'wallet.checkout')).length,0,'Opening packs does not start a payment');

  await receive(page,'session',host);await receive(page,'data.loading',{resource:'wallet',loading:true});await go(page,'wallet');
  await page.getByRole('status',{name:'Loading wallet',exact:true}).waitFor();await receive(page,'wallet.balance',wallet);await receive(page,'data.transactions',ledger);
  assert.match(await page.locator('.earnbox').innerText(),/1,234\.56/);assert.match(await page.locator('.earnbox').innerText(),/50\.00 reserved/);assert.match(await page.locator('.earnbox').innerText(),/500\.00/);
  assert.doesNotMatch(await page.locator('.earnbox').innerText(),/earned coins|coins\s*=|instant|≈/i,'Earnings never invent a coin conversion or payout timing');
  assert.equal(await button(page,'Withdraw').isEnabled(),true);
  await receive(page,'wallet.balance',{earningsPaise:236700});assert.match(await page.locator('.earnbox').innerText(),/2,367\.00/,'The same wallet event updates earnings without a one-response delay');
  await receive(page,'wallet.balance',{coins:60001});assert.match(await page.locator('.earnbox').innerText(),/2,367\.00/,'A same-account coin-only update retains confirmed earnings');
  await receive(page,'wallet.balance',{withdrawalsEnabled:false});assert.equal(await button(page,'Withdraw').isDisabled(),true);assert.match(await page.locator('.earnbox').innerText(),/currently paused/);
  await receive(page,'wallet.balance',{withdrawalsEnabled:true,earningsPaise:49999});assert.equal(await button(page,'Withdraw').isDisabled(),true,'The server minimum governs withdrawal availability');
  await receive(page,'wallet.balance',{earningsPaise:236700});
  for(const width of [320,390]){await page.setViewportSize({width,height:844});await audit(page,`Creator wallet ${width}px`);await page.screenshot({path:path.join(shots,`creator-${width}.png`)})}
  await button(page,'Withdraw').click();assert.equal(await page.evaluate(()=>S.v),'payout');assert.equal((await requests(page,'payout.request')).length,0,'Withdraw opens review; it does not transfer money');
  await go(page,'wallet');await receive(page,'host.access',{approved:false,checking:true,role:'host',hostStatus:'approved',verified:true});await go(page,'wallet');assert.equal(await page.locator('.earnbox').count(),0,'Checking host approval hides earnings');
  await receive(page,'host.access',{approved:false,checking:false,role:'sender',hostStatus:'suspended',verified:false});await go(page,'wallet');assert.equal(await page.locator('.earnbox').count(),0,'Revocation hides earnings and withdrawal actions');
  await receive(page,'session',member);await receive(page,'wallet.balance',{coins:9});await go(page,'wallet');assert.match(await page.locator('.zwallet-balance .big').innerText(),/^9$/);assert.equal(await page.locator('.earnbox').count(),0,'An account switch cannot inherit creator funds');
  assert.equal(await page.evaluate(()=>S.walletSnapshot.owner),member.user.id);assert.equal(await page.evaluate(()=>Object.hasOwn(S.walletSnapshot.data,'earningsPaise')),false,'The event snapshot is cleared across owners');
  await receive(page,'session.none');assert.equal(await page.evaluate(()=>S.walletSnapshot),null,'Signing out clears wallet snapshots');
  assert.deepEqual(errors,[],'Wallet has no browser or bridge errors');
  console.log('PASS wallet: real coins, separate current INR earnings, host checking/revocation/owner isolation, loading/error/retry/empty activity, no conversion promises, responsive 320/390px layout and explicit financial actions');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
