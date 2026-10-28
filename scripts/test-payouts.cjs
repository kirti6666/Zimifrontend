/* Withdrawal UI contracts against the built WebView. The bridge is a local
   recording stub: no bank, user account, payout or backend is contacted. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const host={user:{id:'507f1f77bcf86cd799439011',name:'Payout tester',role:'host',serverRole:'host',hostStatus:'approved',isVerifiedHost:true,isPhoneVerified:true},verification:'verified',requiresOnboarding:false};
const wallet={coins:999999,earningsPaise:123456,reservedPaise:0,minimumWithdrawalPaise:50000,withdrawalsEnabled:true};
const record={id:'507f1f77bcf86cd799439021',amountPaise:50010,payoutAddress:'creator@upi',status:'pending',createdAt:'2026-01-01T10:00:00.000Z'};
const receive=(page,type,data={})=>page.evaluate(message=>Native.receive(message),{type,data});
const sent=(page,type)=>page.evaluate(type=>__sent.filter(message=>message.type===type).map(message=>message.data),type);
const last=async(page,type)=>(await sent(page,type)).at(-1);
const button=(page,name)=>page.getByRole('button',{name,exact:true});
// Pulls the page down from the top the way a finger does, then releases.
const pullToRefresh=page=>page.evaluate(()=>{
  window.zimiScrollTo(0);
  const target=document.getElementById('screen'),touch=y=>new Touch({identifier:1,target,clientX:180,clientY:y});
  const fire=(type,y)=>{const active=type==='touchend'?[]:[touch(y)];target.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:active,targetTouches:active,changedTouches:[touch(y)]}))};
  fire('touchstart',120);for(const y of [150,190,230,270,300])fire('touchmove',y);fire('touchend',300);
});
const go=(page,view)=>page.evaluate(view=>go(view),view);
const settleHistory=async(page,items=[],extra={})=>receive(page,'payout.loaded',{items,total:items.length,page:1,limit:20,requestId:(await last(page,'payout.load')).requestId,...extra});
const fill=async(page,amount='500.10',address='creator@upi')=>{await page.locator('#zpay-amount').fill(amount);await page.locator('#zpay-address').fill(address)};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
 const errors=[];
 const open=async(demo=false)=>{
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  page.setDefaultTimeout(7000);page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!message.text().startsWith('Failed to load resource'))errors.push(message.text())});
  await page.route('https://**/*',route=>route.abort());
  await page.addInitScript(()=>{window.__sent=[];window.ReactNativeWebView={postMessage:raw=>__sent.push(JSON.parse(raw))}});
  await page.goto(pathToFileURL(path.join(root,demo?'dist/index.html':'assets/aurora.html')).href+(demo?'?role=host&approvedHost=1':'?role=sender'));
  if(!demo)await receive(page,'session',host);
  await go(page,'payout');return page;
 };
 try{
  const page=await open();
  assert.equal(await page.getByRole('status',{name:'Loading available earnings',exact:true}).count(),1);
  assert.equal(await page.getByRole('status',{name:'Loading withdrawal history',exact:true}).count(),1);
  assert.equal(await button(page,'Review withdrawal').isDisabled(),true);
  assert.equal((await sent(page,'payout.request')).length,0,'Opening payouts only reads data');
  await settleHistory(page);
  await receive(page,'wallet.balance',{...wallet,withdrawalsEnabled:false});
  assert.equal(await button(page,'Review withdrawal').isDisabled(),true);
  assert.match(await page.locator('.zpay-page').innerText(),/Withdrawals are currently paused/);
  await receive(page,'wallet.balance',wallet);
  assert.equal(await button(page,'Review withdrawal').isEnabled(),true);
  assert.match(await page.locator('.zpay-balance').innerText(),/1,234\.56/);
  assert.doesNotMatch(await page.locator('.zpay-page').innerText(),/coins|instant|on its way/i);
  for(const [amount,message] of [['500.001',/two decimal places/],['5e2',/two decimal places/],['499.99',/minimum withdrawal/],['2000',/more than your available earnings/]]){
   await fill(page,amount);await button(page,'Review withdrawal').click();assert.match(await page.locator('.zpay-error').innerText(),message);
  }
  await fill(page,'500.10','x');await button(page,'Review withdrawal').click();assert.match(await page.locator('.zpay-error').innerText(),/payout address/);
  await fill(page);await button(page,'Review withdrawal').click();
  assert.match(await page.getByRole('region',{name:'Review withdrawal'}).innerText(),/₹500\.10[\s\S]*creator@upi/);
  assert.equal((await sent(page,'payout.request')).length,0,'Review alone never submits');
  await button(page,'Edit details').click();assert.equal(await page.locator('#zpay-amount').inputValue(),'500.10');
  await button(page,'Review withdrawal').click();await button(page,'Confirm withdrawal request').click();await page.evaluate(()=>payoutConfirm());
  const request=await last(page,'payout.request');assert.equal(request.amountPaise,50010);assert.equal(request.payoutAddress,'creator@upi');assert.ok(request.idempotencyKey);
  assert.equal((await sent(page,'payout.request')).length,1,'Repeated confirm is single-flight');
  assert.equal(await button(page,'Requesting withdrawal…').isDisabled(),true);
  assert.equal(await page.evaluate(()=>PayoutUI.wallet.earningsPaise),wallet.earningsPaise,'UI never subtracts a speculative balance');
  console.log('PASS payouts: loaded-wallet/enablement guards, exact INR validation, explicit review and duplicate-click protection');

  await receive(page,'payout.error',{action:'payout.request',requestId:request.requestId+999,idempotencyKey:request.idempotencyKey,message:'Unrelated error'});
  assert.equal(await button(page,'Requesting withdrawal…').count(),1,'Unrelated response cannot unlock request');
  await receive(page,'payout.error',{action:'payout.request',requestId:request.requestId,idempotencyKey:request.idempotencyKey,message:'Connection interrupted'});
  assert.equal(await button(page,'Edit details').isDisabled(),true);
  await page.evaluate(()=>payoutDraft('address','another@upi'));
  assert.equal(await page.evaluate(()=>PayoutUI.address),'creator@upi','Uncertain request address stays locked');
  await receive(page,'wallet.balance',{...wallet,earningsPaise:0,reservedPaise:wallet.earningsPaise});
  await button(page,'Retry same withdrawal').click();const retry=await last(page,'payout.request');
  assert.equal(retry.idempotencyKey,request.idempotencyKey);assert.equal(retry.amountPaise,50010);assert.notEqual(retry.requestId,request.requestId);
  await receive(page,'payout.error',{action:'payout.request',requestId:retry.requestId,idempotencyKey:retry.idempotencyKey,status:409,message:'Temporarily paused'});
  assert.equal(await button(page,'Edit details').isDisabled(),true,'A later rejection does not discard a prior uncertain attempt');
  await button(page,'Retry same withdrawal').click();const recovery=await last(page,'payout.request');assert.equal(recovery.idempotencyKey,request.idempotencyKey);
  await receive(page,'payout.requested',{requestId:recovery.requestId,payout:record});
  assert.equal(await page.getByRole('heading',{name:'Withdrawal requested',exact:true}).count(),1);
  await receive(page,'data.loading',{resource:'wallet',loading:false,error:'Wallet refresh failed'});
  assert.equal(await page.getByRole('heading',{name:'Withdrawal requested',exact:true}).count(),1,'Wallet refresh failure cannot undo saved request');
  assert.match(await page.locator('.zpay-success').innerText(),/Pending review/);
  await settleHistory(page,[record]);
  assert.match(await page.locator('.zpay-history').innerText(),/500\.10[\s\S]*Pending review[\s\S]*creator@upi/);
  await receive(page,'wallet.balance',wallet);await button(page,'Make another request').click();await fill(page);await button(page,'Review withdrawal').click();await button(page,'Confirm withdrawal request').click();
  const next=await last(page,'payout.request');assert.notEqual(next.idempotencyKey,request.idempotencyKey,'Confirmed request permits a fresh request identity');
  await receive(page,'payout.error',{action:'payout.request',requestId:next.requestId,idempotencyKey:next.idempotencyKey,status:400,message:'Minimum changed'});
  await fill(page,'600.00');await button(page,'Review withdrawal').click();await button(page,'Confirm withdrawal request').click();
  const changed=await last(page,'payout.request');assert.notEqual(changed.idempotencyKey,next.idempotencyKey,'Changed details after a definite failure get a new identity');
  console.log('PASS payouts: uncertain retry identity, locked details, late response isolation and success independent of wallet refresh');

  const history=await open();await receive(history,'wallet.balance',wallet);await settleHistory(history,[record],{total:2,limit:1});
  await button(history,'Next').click();const pageTwo=await last(history,'payout.load');assert.equal(pageTwo.page,2);
  assert.equal(await history.getByRole('status',{name:'Loading withdrawal history',exact:true}).count(),1);
  await receive(history,'payout.error',{action:'payout.load',requestId:pageTwo.requestId,message:'History unavailable'});
  assert.match(await history.locator('.zpay-history-section').innerText(),/History unavailable/);
  assert.equal(await history.getByText('No withdrawal requests yet',{exact:true}).count(),0);
  await button(history,'Retry history').click();const retryHistory=await last(history,'payout.load');assert.equal(retryHistory.page,2);
  await settleHistory(history,[{...record,id:'old-payout',status:'paid',payoutAddress:'<img src=x onerror=alert(1)>',payoutReference:'TEST-ONLY'}],{total:2,page:2,limit:1});
  assert.equal(await history.locator('.zpay-history img').count(),0);assert.match(await history.locator('.zpay-history').innerText(),/Paid[\s\S]*Payment reference: TEST-ONLY/);
  await button(history,'Previous').click();assert.equal((await last(history,'payout.load')).page,1);await settleHistory(history,[record],{total:2,limit:1});
  for(const mode of ['dark','light']){
   await history.evaluate(mode=>Native.receive({type:'data.themes',data:{items:[ZThemeOriginal,ZThemeRose],selectedThemeId:mode==='dark'?ZThemeOriginal.id:ZThemeRose.id,premium:{active:false}}}),mode);
   for(const width of [320,390,768]){await history.setViewportSize({width,height:844});const boxes=await history.locator('.zpay-page,.zpay-form input,.zpay-form button,.zpay-history li').evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect();return{left:b.left,right:b.right,overflow:node.scrollWidth>node.clientWidth+1}}));assert.ok(boxes.every(box=>box.left>=0&&box.right<=width+1&&!box.overflow),`${mode} payouts fit ${width}px`)}
   await history.setViewportSize({width:390,height:844});fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});await history.screenshot({path:path.join(root,'artifacts',`payouts-mobile-${mode}.png`)});
  }
  console.log('PASS payouts: own history, pagination/error recovery, escaped addresses and responsive selected themes');

  const checking=await open();await receive(checking,'wallet.balance',wallet);await settleHistory(checking);await fill(checking);await button(checking,'Review withdrawal').click();await button(checking,'Confirm withdrawal request').click();
  const reconnectRequest=await last(checking,'payout.request');
  await receive(checking,'host.access',{checking:true,approved:false,role:'host',hostStatus:'approved',verified:false});
  await receive(checking,'payout.error',{action:'payout.request',requestId:reconnectRequest.requestId,idempotencyKey:reconnectRequest.idempotencyKey,message:'Connection interrupted'});
  assert.equal(await checking.evaluate(()=>PayoutUI.attempt?.idempotencyKey),reconnectRequest.idempotencyKey,'Transient host checks preserve uncertain ownership');
  await receive(checking,'host.access',{approved:true,role:'host',hostStatus:'approved',verified:true});await go(checking,'payout');await button(checking,'Retry same withdrawal').click();
  const reconnectRetry=await last(checking,'payout.request');assert.equal(reconnectRetry.idempotencyKey,reconnectRequest.idempotencyKey);
  await receive(checking,'host.access',{checking:true,approved:false,role:'host',hostStatus:'approved',verified:false});
  await receive(checking,'payout.requested',{requestId:reconnectRetry.requestId,payout:record});
  await receive(checking,'host.access',{approved:true,role:'host',hostStatus:'approved',verified:true});await go(checking,'payout');
  assert.equal(await checking.getByRole('heading',{name:'Withdrawal requested',exact:true}).count(),1,'Success received during permission checking is retained');
  console.log('PASS payouts: reconnect permission checks retain request identity and settle matching responses');

  const restored=await open(),pending={amountPaise:50010,payoutAddress:'saved@upi',idempotencyKey:'saved-attempt-key'};
  await receive(restored,'wallet.balance',{...wallet,earningsPaise:0});await settleHistory(restored,[],{pending});
  assert.match(await restored.getByRole('region',{name:'Review withdrawal'}).innerText(),/500\.10[\s\S]*saved@upi/);
  assert.equal(await button(restored,'Edit details').isDisabled(),true);assert.equal((await sent(restored,'payout.request')).length,0,'Recovery is never submitted automatically');
  await button(restored,'Retry same withdrawal').click();const restoredRequest=await last(restored,'payout.request');assert.equal(restoredRequest.idempotencyKey,pending.idempotencyKey);
  await receive(restored,'payout.error',{action:'payout.request',requestId:restoredRequest.requestId,idempotencyKey:pending.idempotencyKey,message:'Connection interrupted'});
  assert.equal(await restored.locator('[aria-label="Refresh withdrawal history"]').count(),0,'Withdrawal history has no refresh button');await pullToRefresh(restored);await settleHistory(restored,[{...record,idempotencyKey:pending.idempotencyKey}],{recovered:{...record,idempotencyKey:pending.idempotencyKey},pending:null});
  assert.equal(await restored.getByRole('heading',{name:'Withdrawal requested',exact:true}).count(),1);assert.equal(await restored.evaluate(()=>PayoutUI.attempt),null);
  const conflict=await open();await receive(conflict,'wallet.balance',wallet);await settleHistory(conflict);await fill(conflict);await button(conflict,'Review withdrawal').click();await button(conflict,'Confirm withdrawal request').click();
  const conflicting=await last(conflict,'payout.request');await receive(conflict,'payout.error',{action:'payout.request',requestId:conflicting.requestId,idempotencyKey:conflicting.idempotencyKey,status:409,code:'PAYOUT_PENDING_RECOVERY',message:'Recover the earlier request first'});
  assert.equal(await button(conflict,'Review withdrawal').isDisabled(),true);await settleHistory(conflict,[],{pending});assert.equal(await conflict.evaluate(()=>PayoutUI.attempt.idempotencyKey),pending.idempotencyKey);
  console.log('PASS payouts: persisted pending recovery, explicit same-key retry and history reconciliation');

  await receive(conflict,'host.access',{approved:false,role:'sender',hostStatus:'suspended',verified:false});await go(conflict,'payout-history');
  assert.equal(await conflict.locator('.zpay-form').count(),0,'Revoked hosts cannot create withdrawals');assert.equal(await conflict.locator('#nav').isVisible(),false);
  await button(conflict,'Retry same withdrawal').click();const revokedRetry=await last(conflict,'payout.request');assert.equal(revokedRetry.idempotencyKey,pending.idempotencyKey,'Revoked hosts can reconcile only the original saved request');
  await receive(conflict,'payout.requested',{requestId:revokedRetry.requestId,payout:{...record,idempotencyKey:pending.idempotencyKey}});
  assert.equal(await conflict.getByRole('heading',{name:'Withdrawal requested',exact:true}).count(),1);assert.equal(await button(conflict,'Make another request').count(),0);
  await button(conflict,'Back to profile').click();assert.equal(await conflict.evaluate(()=>S.v),'profile');await button(conflict,'Open settings').click();await button(conflict,'Payments').click();await conflict.getByRole('dialog',{name:'Payments',exact:true}).getByRole('button',{name:/^Withdrawal history/}).click();assert.equal(await conflict.evaluate(()=>S.v),'payout-history');
  console.log('PASS payouts: revoked-host read-only history and exact persisted request reconciliation');

  await receive(page,'session.none');
  await receive(page,'payout.requested',{requestId:changed.requestId,payout:{...record,payoutAddress:'old-account@upi'}});
  assert.equal(await page.evaluate(()=>PayoutUI.address),'');assert.equal(await page.evaluate(()=>PayoutUI.success),null);
  const newHost={...host,user:{...host.user,id:'507f1f77bcf86cd799439099'}};
  await receive(page,'session',newHost);await go(page,'payout');const freshLoad=await last(page,'payout.load');
  assert.ok(freshLoad.requestId>changed.requestId,'Request IDs remain monotonic across sessions');
  await receive(page,'payout.loaded',{requestId:changed.requestId,items:[record],total:1,page:1,limit:20});
  assert.equal(await page.locator('.zpay-history').count(),0,'Old-session history cannot appear in a fresh account');
  const member={...host,user:{...host.user,role:'sender',serverRole:'user',hostStatus:'none',isVerifiedHost:false},verification:'none'};
  await receive(history,'session',member);await go(history,'payout');assert.notEqual(await history.evaluate(()=>S.v),'payout');
  const preview=await open(true);assert.equal(await button(preview,'Review withdrawal').isDisabled(),true);await preview.evaluate(()=>{payoutReview();payoutConfirm()});assert.equal((await sent(preview,'payout.request')).length,0);
  assert.deepEqual(errors,[]);console.log('PASS payouts: session cleanup, late-event rejection, approved-host gating and safe demo mode');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
