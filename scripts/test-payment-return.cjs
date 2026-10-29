/* Returning from an incomplete external coin payment must leave a fresh wallet
   checkout. All accounts, methods, payments and wallet responses stay local. */
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const failureNotice='Your payment failed. You can try again.';
const account={user:{id:'507f1f77bcf86cd799439001',name:'Payment return tester',role:'sender',serverRole:'user',hostStatus:'none',isVerifiedHost:false,isPhoneVerified:true},verification:'none',requiresOnboarding:false};
const packs=[{id:'pack-1',name:'Starter',coins:200,pricePaise:9899},{id:'pack-2',name:'Everyday',coins:625,pricePaise:24999},{id:'pack-3',name:'More to share',coins:1125,pricePaise:49999}];
const catalog={packs,gifts:[],paymentsAvailable:true};
const receive=(page,type,data={})=>page.evaluate(message=>Native.receive(message),{type,data});
const sent=(page,type)=>page.evaluate(type=>__sent.filter(message=>message.type===type).map(message=>message.data),type);
const last=async(page,type)=>(await sent(page,type)).at(-1);
const dialog=page=>page.getByRole('dialog',{name:'Select payment method',exact:true});
const confirm=page=>dialog(page).getByRole('button',{name:'Continue to payment',exact:true});
const failureCount=page=>page.evaluate(text=>__notices.filter(message=>message===text).length,failureNotice);
const purchase=(attempt,order,status='PENDING')=>({kind:'coins',purchaseId:'purchase-'+order,merchantOrderId:order,status,paymentUrl:'https://checkout.fixture.test/'+order,packId:attempt.packId,idempotencyKey:attempt.idempotencyKey,requestedRoute:attempt.route,coins:packs.find(pack=>pack.id===attempt.packId)?.coins,amountPaise:packs.find(pack=>pack.id===attempt.packId)?.pricePaise});
const returned=(attempt,order,status)=>({merchantOrderId:order,status,idempotencyKey:attempt.idempotencyKey,packId:attempt.packId});
async function settleMethods(page){
  if(!await dialog(page).getByRole('status',{name:'Loading payment methods',exact:true}).count())return;
  const request=await last(page,'payments.routes.load');
  assert.ok(request,'Payment methods come from a real capabilities request');
  await receive(page,'payments.routes',{...request,mode:'ROTATION',routeChoice:true,routes:[{route:'provider_one',currency:'INR',takingPayments:true,upiIntent:true},{route:'provider_two',currency:'INR',takingPayments:true,upiIntent:false}]});
}
async function openMethods(page,pack){
  await page.locator('.zw-packs>button').filter({hasText:pack.name}).click();
  await page.getByRole('button',{name:`Get ${pack.coins.toLocaleString('en-IN')} coins`,exact:true}).click();
  await dialog(page).waitFor();await settleMethods(page);
  assert.equal(await dialog(page).locator('input[type=radio]:checked').count(),0,'Every fresh checkout starts with no saved payment method selected');
  assert.equal(await confirm(page).isDisabled(),true,'A new method must be explicitly confirmed');
}
async function start(page,pack=packs[0],provider='Provider One'){
  await openMethods(page,pack);
  await dialog(page).getByRole('radio',{name:new RegExp('^'+provider)}).check();
  await confirm(page).click();
  const attempt=await last(page,'wallet.checkout');
  assert.equal(attempt.packId,pack.id);assert.ok(attempt.idempotencyKey);
  return attempt;
}
async function settleWallet(page,coins=1000){
  await receive(page,'wallet.balance',{coins,earningsPaise:0});
  await receive(page,'data.catalog',catalog);
}
async function unlocked(page,label){
  assert.equal(await page.locator('.zw-payment,.zw-recovery,.zpm-locked').count(),0,`${label}: no pending/recovery/saved-method container`);
  assert.equal(await page.locator('.zw-packs>button').count(),packs.length,`${label}: refreshed real packs are visible`);
  assert.equal(await page.locator('.zw-packs>button:disabled').count(),0,`${label}: any pack can be chosen`);
}
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
  const errors=[];
  const open=async()=>{
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});page.setDefaultTimeout(6000);
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://**/*',route=>route.abort());
    await page.addInitScript(()=>{window.__sent=[];window.ReactNativeWebView={postMessage:raw=>__sent.push(JSON.parse(raw))}});
    await page.goto(pathToFileURL(path.join(root,'assets/aurora.html')).href+'?role=sender');
    await page.evaluate(()=>{window.__notices=[];const show=appNotice;appNotice=message=>{__notices.push(message);return show(message)}});
    await receive(page,'session',account);await page.evaluate(()=>go('coins'));await settleWallet(page);
    return page;
  };
  try{
    for(const status of ['PENDING','FAILED','REVERTED','UNKNOWN']){
      const page=await open(),order='returned-'+status.toLowerCase();
      const attempt=await start(page);
      await receive(page,'wallet.checkout',purchase(attempt,order));
      const historical=status==='PENDING'?{...attempt,idempotencyKey:'restored-history-key',packId:packs[2].id}:null;
      if(historical)await receive(page,'wallet.purchase',purchase(historical,'restored-history'));
      assert.equal(await page.locator('.zw-packs>button:disabled').count(),packs.length,'An external payment is still guarded before it returns');
      const walletReads=(await sent(page,'wallet.load')).length,catalogReads=(await sent(page,'catalog.load')).length;
      await receive(page,'wallet.payment-returned',returned(attempt,order,status));
      assert.equal(await page.locator('#app-notice').innerText(),failureNotice,`${status}: one clear retry notice`);
      assert.equal(await failureCount(page),1,`${status}: notice appears once`);
      assert.ok((await sent(page,'wallet.load')).length>walletReads,`${status}: return refreshes the wallet`);
      assert.ok((await sent(page,'catalog.load')).length>catalogReads,`${status}: return refreshes the catalog`);
      assert.equal(await page.locator('.zw-payment,.zw-recovery,.zpm-locked').count(),0,`${status}: abandoned order UI disappears immediately`);
      await settleWallet(page);await unlocked(page,status);
      assert.equal(await page.locator('.zw-wallet-main h2').innerText(),'1,000','An incomplete payment never credits coins');
      await receive(page,'wallet.payment-returned',returned(attempt,order,status));
      assert.equal(await failureCount(page),1,'Repeated native return events do not repeat the failure notice');
      await receive(page,'wallet.purchase',purchase(attempt,order,'PENDING'));
      if(historical)await receive(page,'wallet.purchase',purchase(historical,'restored-history','PENDING'));
      await unlocked(page,'Late old PENDING before a new purchase');
      // Every refreshed pack must be usable, with no remembered method.
      for(const pack of packs){await openMethods(page,pack);await page.keyboard.press('Escape')}
      await openMethods(page,packs[1]);
      await dialog(page).getByRole('radio',{name:/^Provider Two/}).check();
      const delayed={packId:packs[2].id,idempotencyKey:'delayed-restored-'+status};
      await receive(page,'wallet.purchase',purchase(delayed,'delayed-restored-'+status));
      assert.equal(await dialog(page).isVisible(),true,'A delayed restored order cannot close fresh method selection');
      assert.equal(await dialog(page).getByRole('radio',{name:/^Provider Two/}).isChecked(),true,'A delayed restored order cannot replace a new method choice');
      assert.equal(await page.locator('.zw-payment,.zw-recovery,.zpm-locked').count(),0,'Delayed restored payments do not add pending locks behind the fresh dialog');
      await receive(page,'wallet.payment-returned',returned(delayed,'delayed-restored-'+status,'UNKNOWN'));
      assert.equal(await failureCount(page),1,'A first return event for an older restored order cannot report failure over fresh method selection');
      assert.equal(await dialog(page).isVisible(),true,'An older restored return leaves fresh method selection intact');
      const delayedCheckout={packId:packs[0].id,idempotencyKey:'unowned-checkout-'+status};
      await receive(page,'wallet.checkout',purchase(delayedCheckout,'unowned-checkout-'+status));
      assert.equal(await dialog(page).isVisible(),true,'An unseen old checkout response cannot interrupt fresh method selection');
      assert.equal(await dialog(page).getByRole('radio',{name:/^Provider Two/}).isChecked(),true,'An unowned checkout response cannot replace the chosen fresh method');
      assert.equal(await page.locator('.zw-payment,.zw-recovery,.zpm-locked').count(),0,'An unowned pending checkout never adds abandoned-order UI');
      assert.equal(await page.locator('.zw-packs>button:disabled').count(),0,'An unowned checkout response cannot lock the refreshed packs');
      await receive(page,'wallet.payment-returned',returned(attempt,order,'UNKNOWN'));
      assert.equal(await dialog(page).isVisible(),true,'An old return cannot close fresh method selection');
      assert.equal(await dialog(page).getByRole('radio',{name:/^Provider Two/}).isChecked(),true,'An old return cannot erase a new method choice');
      await confirm(page).click();
      const fresh=await last(page,'wallet.checkout');
      assert.equal(fresh.packId,packs[1].id);assert.equal(fresh.route,'provider_two');
      assert.notEqual(fresh.idempotencyKey,attempt.idempotencyKey,'Retry creates a new payment attempt');
      await receive(page,'wallet.purchase',purchase(attempt,order,'SUCCESS'));
      await receive(page,'wallet.balance',{coins:1200,earningsPaise:0});
      assert.equal(await page.locator('.zw-wallet-main h2').innerText(),'1,200','A late success can update the authoritative wallet separately');
      assert.equal(await page.locator('.zw-payment').count(),0,'A retired receipt cannot replace a fresh in-flight checkout');
      assert.equal(await failureCount(page),1,'A late confirmed payment does not invent another failure');
      const freshOrder=order+'-fresh';
      await receive(page,'wallet.checkout',purchase(fresh,freshOrder));
      assert.match(await page.locator('.zw-payment').innerText(),/625 coins/,'The visible pending order belongs to the fresh pack');
      await receive(page,'wallet.payment-returned',returned(attempt,order,'PENDING'));
      assert.match(await page.locator('.zw-payment').innerText(),/625 coins/,'An older return cannot clear a newer payment');
      await page.getByRole('button',{name:'Continue payment',exact:true}).click();
      assert.deepEqual(await last(page,'wallet.checkout'),fresh,'Only the fresh identity and method are resumed');
      await page.close();
    }
    const paid=await open(),paidAttempt=await start(paid),paidOrder='confirmed-return';
    await receive(paid,'wallet.checkout',purchase(paidAttempt,paidOrder));
    await receive(paid,'wallet.purchase',purchase(paidAttempt,paidOrder,'SUCCESS'));
    await receive(paid,'wallet.balance',{coins:1200,earningsPaise:0});
    await receive(paid,'wallet.payment-returned',returned(paidAttempt,paidOrder,'SUCCESS'));
    assert.equal(await failureCount(paid),0,'A successful return is never reported as failed');
    assert.equal(await paid.locator('.zw-wallet-main h2').innerText(),'1,200');
    await paid.close();

    const premium=await open();await premium.evaluate(()=>go('themes'));
    const themes=await premium.evaluate(()=>({items:[ZThemeOriginal],selectedThemeId:ZThemeOriginal.id,premium:{active:false,pricePaise:19900,currency:'INR',paymentsAvailable:true,purchaseType:'lifetime'}}));
    await receive(premium,'data.themes',themes);
    await premium.getByRole('button',{name:/^Unlock premium/}).click();
    const premiumAttempt=await last(premium,'themes.premium.checkout');
    await receive(premium,'themes.premium.checkout',{kind:'premium',merchantOrderId:'premium-order',status:'PENDING',idempotencyKey:premiumAttempt.idempotencyKey});
    await premium.evaluate(()=>go('coins'));await receive(premium,'data.catalog',catalog);
    const coinAttempt=await start(premium),coinOrder='coins-with-premium';
    await receive(premium,'wallet.checkout',purchase(coinAttempt,coinOrder));
    await receive(premium,'wallet.payment-returned',returned(coinAttempt,coinOrder,'FAILED'));await settleWallet(premium);
    await premium.evaluate(()=>go('themes'));await receive(premium,'data.themes',themes);
    await premium.getByRole('button',{name:'Continue checkout',exact:true}).click();
    assert.deepEqual(await last(premium,'themes.premium.checkout'),premiumAttempt,'Coin return cleanup leaves the premium payment identity untouched');
    await premium.close();

    const replaced=await open(),retired=await start(replaced),retiredOrder='previous-account';
    await receive(replaced,'wallet.checkout',purchase(retired,retiredOrder));
    await receive(replaced,'wallet.payment-returned',returned(retired,retiredOrder,'PENDING'));await settleWallet(replaced);
    await receive(replaced,'session.none');
    await receive(replaced,'session',{...account,user:{...account.user,id:'507f1f77bcf86cd799439002',name:'Next account'}});
    await replaced.evaluate(()=>go('coins'));await settleWallet(replaced,50);await unlocked(replaced,'Replacement account');
    const newAccount=await start(replaced,packs[2]),newAccountOrder='next-account-order';
    await receive(replaced,'wallet.checkout',purchase(newAccount,newAccountOrder));
    const beforeStale=await failureCount(replaced);
    await receive(replaced,'wallet.payment-returned',returned(retired,retiredOrder,'FAILED'));
    assert.equal(await failureCount(replaced),beforeStale,'Old account return events cannot show a failure over another payment');
    assert.match(await replaced.locator('.zw-payment').innerText(),/1,125 coins/);
    await receive(replaced,'wallet.payment-returned',returned(newAccount,newAccountOrder,'UNKNOWN'));await settleWallet(replaced,50);
    await unlocked(replaced,'Replacement account returned payment');
    assert.equal(await failureCount(replaced),beforeStale+1,'Fresh account return tracking starts cleanly');
    await replaced.close();
    assert.deepEqual(errors,[],'Payment return handling has no browser errors');
    console.log('PASS payment return: refreshed wallet/packs, one retry notice, no abandoned-order locks, explicit fresh methods/new keys, stale order isolation, authoritative late credit, successful return, premium independence and account reset');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
