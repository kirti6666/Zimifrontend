/* Reference coin packages and explicit payment-method confirmation against the
   shipped production page. Routes and all checkout responses stay local. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const account={user:{id:'507f1f77bcf86cd799439001',name:'Wallet tester',role:'sender',serverRole:'user',hostStatus:'none',isVerifiedHost:false,isPhoneVerified:true},verification:'none',requiresOnboarding:false};
const packs=[{id:'pack-1',name:'Starter',coins:200,pricePaise:9899},{id:'pack-2',name:'Everyday',coins:625,pricePaise:24999},{id:'pack-3',name:'More to share',coins:1125,pricePaise:49999},{id:'pack-4',name:'Creator fan',coins:2500,pricePaise:98999},{id:'pack-5',name:'Big moments',coins:3750,pricePaise:149999},{id:'pack-6',name:'Celebration',coins:5000,pricePaise:199999}];
const catalog={packs,gifts:[],paymentsAvailable:true};
const receive=(page,type,data={})=>page.evaluate(message=>Native.receive(message),{type,data});
const sent=(page,type)=>page.evaluate(type=>__sent.filter(message=>message.type===type).map(message=>message.data),type);
const last=async(page,type)=>(await sent(page,type)).at(-1);
const dialog=page=>page.getByRole('dialog',{name:'Select payment method',exact:true});
const getCoins=page=>page.getByRole('button',{name:'Get 200 coins',exact:true});
const confirm=page=>dialog(page).getByRole('button',{name:'Continue to payment',exact:true});
const routes=async(page,extra={})=>receive(page,'payments.routes',{...await last(page,'payments.routes.load'),mode:'ROTATION',routeChoice:false,routes:[],...extra});
const backStyle=page=>page.locator('.zb-back').first().evaluate(button=>{const style=getComputedStyle(button),icon=button.querySelector('svg');return {width:style.width,height:style.height,radius:style.borderRadius,border:style.borderTopWidth,borderStyle:style.borderTopStyle,background:style.backgroundColor,color:style.color,iconWidth:getComputedStyle(icon).width,iconHeight:getComputedStyle(icon).height,glyph:icon.innerHTML}});
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
 const errors=[];
 const open=async()=>{
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});page.setDefaultTimeout(6000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://**/*',route=>route.abort());
  await page.addInitScript(()=>{window.__sent=[];window.ReactNativeWebView={postMessage:raw=>__sent.push(JSON.parse(raw))}});
  await page.goto(pathToFileURL(path.join(root,'assets/aurora.html')).href+'?role=sender');
  await receive(page,'session',account);await receive(page,'wallet.balance',{coins:52400,earningsPaise:0});
  await page.evaluate(()=>go('coins'));await receive(page,'data.catalog',catalog);return page;
 };
 try{
  const page=await open();
  assert.equal(await page.getByRole('heading',{name:'Choose your coin pack',exact:true}).count(),1,'A live catalog without promotion metadata makes no bonus claim');
  assert.doesNotMatch(await page.locator('.zw-packs').innerText(),/\d+%\s+More|\bHot\b|\bPopular\b/,'Package names remain the live fallback instead of invented discounts or badges');
  const promotional={...catalog,packs:packs.map((pack,index)=>({...pack,bonusPercent:[100,150,125,150,150,150][index],...(index===3?{badge:'hot'}:index===5?{badge:'popular'}:{})}))};
  await receive(page,'data.catalog',promotional);
  assert.equal(await page.getByRole('heading',{name:'Welcome Bonus for You!',exact:true}).count(),1);
  for(const [index,percent] of [100,150,125,150,150,150].entries())assert.match(await page.locator('.zw-packs>button').nth(index).innerText(),new RegExp(`${percent}%\\s+More`),'Only server-supplied bonuses are displayed');
  assert.match(await page.locator('.zw-packs>button').nth(3).innerText(),/Hot/);
  assert.match(await page.locator('.zw-packs>button').nth(5).innerText(),/Popular/);
  assert.equal((await sent(page,'wallet.checkout')).length,0,'Displaying campaign metadata never starts checkout');
  const shots=path.join(root,'artifacts','compact-coins');fs.mkdirSync(shots,{recursive:true});
  for(const [width,height] of [[320,568],[320,640],[390,844],[768,900]]){
   await page.setViewportSize({width,height});
   const layout=await page.evaluate(()=>{
    const footer=document.querySelector('.zw-checkout-footer'),buy=document.querySelector('.zw-buy'),bounds=el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom}};
    return {overflow:document.documentElement.scrollWidth>innerWidth+1,cards:[...document.querySelectorAll('.zw-packs>button')].map(bounds),footer:bounds(footer),buy:bounds(buy),position:getComputedStyle(footer).position,canvas:getComputedStyle(document.querySelector('.app')).backgroundColor,cardColor:getComputedStyle(document.querySelector('.zw-packs>button:not(.selected)')).backgroundColor,balanceColor:getComputedStyle(document.querySelector('.zw-wallet-main')).backgroundColor,purchaseGradient:getComputedStyle(buy).backgroundImage,purchaseText:getComputedStyle(buy).color};
   });
   assert.equal(await page.getByRole('heading',{name:'Add coins',exact:true}).count(),1);
   assert.equal(await page.locator('.zw-wallet-main h2').innerText(),'52,400');
   assert.match(await page.locator('.zw-reference').innerText(),/INR/,'The current INR currency is visible');
   assert.equal(layout.cards.length,6);
   assert.equal(layout.canvas,'rgb(255, 255, 255)','Coins retains the active light canvas');
   assert.equal(layout.cardColor,'rgb(255, 255, 255)','Coin packages use the active surface color');
   assert.equal(layout.balanceColor,'rgb(248, 248, 250)','Balance pill uses the active raised surface');
   assert.equal(layout.purchaseGradient,'none','The purchase button uses the active accent without a forced pink gradient');
   assert.equal(layout.purchaseText,'rgb(255, 255, 255)','The original accent retains its accessible contrast color');
   assert.equal(layout.position,'fixed','The purchase action stays fixed at the bottom');
   assert.ok(layout.footer.top>=0&&layout.footer.bottom<=height+1,`${width}x${height}: checkout footer stays on screen`);
   assert.ok(layout.buy.left>=0&&layout.buy.right<=width+1&&layout.buy.top>=layout.footer.top&&layout.buy.bottom<=layout.footer.bottom,`${width}x${height}: purchase button stays inside its footer`);
   assert.equal(layout.overflow,false);
   for(let index=0;index<3;index++){
    assert.ok(Math.abs(layout.cards[index].top-layout.cards[0].top)<1,`${width}x${height}: first row has three packages`);
    assert.ok(Math.abs(layout.cards[index+3].top-layout.cards[3].top)<1,`${width}x${height}: second row has three packages`);
    assert.ok(Math.abs(layout.cards[index].left-layout.cards[index+3].left)<1,`${width}x${height}: package columns remain aligned`);
   }
   assert.ok(layout.cards[1].left>layout.cards[0].right&&layout.cards[2].left>layout.cards[1].right&&layout.cards[3].top>layout.cards[0].bottom,`${width}x${height}: package cards never overlap`);
   await page.locator('#scroll-root').evaluate(el=>{el.scrollTop=el.scrollHeight});
   const end=await page.evaluate(()=>({note:document.querySelector('.zw-note').getBoundingClientRect().bottom,lastCard:[...document.querySelectorAll('.zw-packs>button')].at(-1).getBoundingClientRect().bottom,footer:document.querySelector('.zw-checkout-footer').getBoundingClientRect().top}));
   assert.ok(end.note<=end.footer+1&&end.lastCard<=end.footer+1,`${width}x${height}: scrolling exposes the note and last packages above the fixed footer`);
   await page.locator('#scroll-root').evaluate(el=>{el.scrollTop=0});
   if(width===320||width===390)await page.screenshot({path:path.join(shots,`coins-${width}x${height}.png`)});
  }
  // Changing account theme or Dark Mode on the coin page must update every
  // surface and native chrome without replacing the saved account preferences.
  for(const dark of [false,true]){
   await page.evaluate(dark=>{ZimiThemes.setDark(dark);const theme={...ZThemeRose,id:'coin-custom-theme',colors:{...ZThemeRose.colors,primary:'#6543b8'},typography:{...ZThemeRose.typography,fontFamily:'serif'}};Native.receive({type:'data.themes',data:{items:[theme],selectedThemeId:theme.id,premium:{active:false}}})},dark);
   const colors=await page.evaluate(()=>({mode:document.documentElement.dataset.theme,canvas:document.documentElement.dataset.canvas,selected:ztCurrent().id,dark:ZimiThemes.dark(),savedDark:localStorage.getItem('zimi.darkMode'),page:getComputedStyle(document.querySelector('.zw-reference')).backgroundColor,card:getComputedStyle(document.querySelector('.zw-packs>button:not(.selected)')).backgroundColor,pill:getComputedStyle(document.querySelector('.zw-wallet-main')).backgroundColor,footer:getComputedStyle(document.querySelector('.zw-checkout-footer')).backgroundColor,buy:getComputedStyle(document.querySelector('.zw-buy')).backgroundColor,buyText:getComputedStyle(document.querySelector('.zw-buy')).color,glow:getComputedStyle(document.querySelector('.zw-buy')).boxShadow,font:getComputedStyle(document.querySelector('.zw-buy')).fontFamily}));
   assert.equal(colors.mode,dark?'dark':'light');assert.equal(colors.canvas,dark?'#000000':'#ffffff');
   assert.equal(colors.page,dark?'rgb(0, 0, 0)':'rgb(255, 255, 255)');
   assert.equal(colors.card,dark?'rgb(23, 23, 26)':'rgb(255, 255, 255)');
   assert.equal(colors.pill,dark?'rgb(33, 33, 38)':'rgb(248, 248, 250)');
   assert.equal(colors.footer,colors.page,'Footer retains the active canvas');
   assert.equal(colors.buy,'rgb(101, 67, 184)','The selected account accent reaches checkout');assert.equal(colors.buyText,'rgb(255, 255, 255)');assert.equal(colors.glow,'none');
   assert.equal(colors.selected,'coin-custom-theme');assert.equal(colors.dark,dark);assert.equal(colors.savedDark,dark?'1':'0');assert.ok(colors.font.includes('Georgia'));
   const coinBack=await backStyle(page);
   assert.deepEqual([coinBack.width,coinBack.height,coinBack.radius,coinBack.border,coinBack.borderStyle],['44px','44px','999px','1px','solid'],'Add coins uses the shared 44px circular Back button');
   await page.evaluate(()=>go('notifications'));
   assert.deepEqual(await backStyle(page),coinBack,'Coins and Notifications keep identical Back button geometry, icon and theme colors');
   assert.deepEqual(await page.evaluate(()=>({id:ztCurrent().id,dark:ZimiThemes.dark(),mode:document.documentElement.dataset.theme})),{id:'coin-custom-theme',dark,mode:dark?'dark':'light'},'Leaving Coins preserves account theme and Dark Mode');
   await page.evaluate(()=>go('coins'));await receive(page,'data.catalog',promotional);
  }
  await page.evaluate(()=>{ZimiThemes.setDark(false);Native.receive({type:'data.themes',data:{items:[ZThemeOriginal],selectedThemeId:ZThemeOriginal.id,premium:{active:false}}})});
  await page.evaluate(()=>go('home'));
  assert.deepEqual(await page.evaluate(()=>({coinMode:document.documentElement.classList.contains('zw-app'),canvas:getComputedStyle(document.querySelector('.app')).backgroundColor,theme:document.documentElement.dataset.theme})),{coinMode:false,canvas:'rgb(255, 255, 255)',theme:'light'},'Leaving coins retains the account canvas and native chrome');
  await page.evaluate(()=>go('coins'));await receive(page,'data.catalog',catalog);
  await page.setViewportSize({width:390,height:844});
  await getCoins(page).click();await dialog(page).waitFor();
  assert.equal((await sent(page,'wallet.checkout')).length,0,'Get coins opens selection without creating a payment');
  assert.equal(await confirm(page).isDisabled(),true);
  await page.getByRole('status',{name:'Loading payment methods',exact:true}).waitFor();
  const failed=await last(page,'payments.routes.load');
  await receive(page,'operation.error',{action:'payments.routes.load',requestId:failed.requestId,message:'Methods unavailable'});
  assert.match(await dialog(page).getByRole('alert').innerText(),/could not be loaded/);
  assert.equal(await confirm(page).isDisabled(),true,'Route errors cannot silently fall back to an unconfirmed order');
  await dialog(page).getByRole('button',{name:'Retry payment methods',exact:true}).click();
  await routes(page);
  assert.equal(await confirm(page).isDisabled(),true,'Even Automatic requires an explicit choice');
  assert.equal(await dialog(page).getByRole('radio').count(),1,'Disabled route choice presents only real secure checkout');
  await dialog(page).getByRole('radio',{name:/^Secure checkout/}).check();
  assert.equal(await confirm(page).isEnabled(),true);
  await page.screenshot({path:path.join(shots,'payment-methods.png')});
  await page.keyboard.press('Escape');
  assert.equal(await dialog(page).count(),0);assert.equal((await sent(page,'wallet.checkout')).length,0,'Cancelling never creates an order');
  await getCoins(page).click();await receive(page,'app.back');
  assert.equal(await dialog(page).count(),0,'Android Back dismisses method selection first');
  assert.equal(await page.evaluate(()=>S.v),'coins');
  await getCoins(page).click();
  await dialog(page).getByRole('radio',{name:/^Secure checkout/}).check();await confirm(page).click();
  const automatic=await last(page,'wallet.checkout');
  assert.ok(automatic.idempotencyKey);assert.equal(automatic.packId,packs[0].id);assert.equal(Object.hasOwn(automatic,'route'),false,'Secure checkout preserves server-selected routing');
  assert.equal(await page.evaluate(()=>S.bal),52400,'Order creation does not credit coins');
  await receive(page,'operation.error',{action:'wallet.checkout',idempotencyKey:automatic.idempotencyKey,status:502,message:'Response interrupted'});
  await getCoins(page).click();assert.equal(await dialog(page).count(),0,'An uncertain retry keeps the confirmed payment method');
  assert.deepEqual(await last(page,'wallet.checkout'),automatic,'Retry preserves pack, route and idempotency identity');
  await page.close();

  const selected=await open();await getCoins(selected).click();
  await routes(selected,{routeChoice:true,routes:[{route:'provider_one',currency:'INR',takingPayments:true,upiIntent:true,pageStyle:'redirect'},{route:'provider_two',currency:'INR',takingPayments:true,upiIntent:false,pageStyle:'redirect'},{route:'not_available',currency:'INR',takingPayments:false},{route:'foreign',currency:'USD',takingPayments:true}]});
  assert.equal(await dialog(selected).getByRole('radio').count(),3,'Only available INR routes plus secure Automatic are presented');
  assert.equal(await dialog(selected).getByRole('radio',{name:/not.available|foreign/i}).count(),0);
  await dialog(selected).getByRole('radio',{name:/^Provider Two/}).check();
  assert.equal((await sent(selected,'wallet.checkout')).length,0,'Selecting a provider alone creates no order');
  await selected.screenshot({path:path.join(shots,'payment-methods-routes.png')});
  await confirm(selected).click();const chosen=await last(selected,'wallet.checkout');
  assert.equal(chosen.route,'provider_two');
  await receive(selected,'wallet.checkout',{kind:'coins',merchantOrderId:'selected-order',status:'PENDING',packId:chosen.packId,idempotencyKey:chosen.idempotencyKey,requestedRoute:chosen.route,coins:200,amountPaise:9899});
  await selected.getByRole('button',{name:'Continue payment',exact:true}).click();
  assert.deepEqual(await last(selected,'wallet.checkout'),chosen,'Pending continuation keeps its requested route and original order identity');
  await selected.close();
  const gifting=await open(),creator={id:'507f1f77bcf86cd799439011',name:'Gift recipient',role:'host',serverRole:'host',verified:true,online:true,availableForCall:true,ratePerMin:0};
  await receive(gifting,'data.home',{hosts:[creator],stage:[],featured:creator,total:1,page:1,categories:[],unreadCount:0});
  await gifting.evaluate(()=>go('home'));
  await gifting.evaluate(id=>homeGifts(id),creator.id);
  await receive(gifting,'data.catalog',{...catalog,gifts:[{id:'gift-1',name:'Rose',emoji:'*',coins:25}]});
  await gifting.getByRole('dialog',{name:'Send a gift',exact:true}).getByRole('button',{name:/Rose/}).click();
  await gifting.getByRole('dialog',{name:'Send a gift',exact:true}).getByRole('button',{name:'Add coins',exact:true}).click();
  for(const dark of [false,true]){
   await gifting.evaluate(dark=>ZimiThemes.setDark(dark),dark);
   assert.deepEqual(await gifting.locator('.zw-embedded').evaluate(el=>({canvas:getComputedStyle(el).backgroundColor,text:getComputedStyle(el).color,footer:getComputedStyle(el.querySelector('.zw-checkout-footer')).position})),{canvas:dark?'rgb(0, 0, 0)':'rgb(255, 255, 255)',text:dark?'rgb(244, 244, 245)':'rgb(24, 24, 27)',footer:'static'},'Embedded coin top-up follows active mode and keeps its footer inside the sheet');
  }
  await gifting.evaluate(()=>ZimiThemes.setDark(false));
  await gifting.getByRole('dialog',{name:'Add coins',exact:true}).getByRole('button',{name:'Get 200 coins',exact:true}).click();
  await routes(gifting);await dialog(gifting).getByRole('radio',{name:/^Secure checkout/}).check();
  await gifting.keyboard.press('Tab');
  assert.equal(await dialog(gifting).evaluate(el=>el.contains(document.activeElement)),true,'Tab remains in payment selection above the gift sheet');
  await gifting.keyboard.press('Escape');
  assert.equal(await dialog(gifting).count(),0);
  assert.deepEqual(await gifting.evaluate(()=>[Home.giftTo,CoinUI.topup,CoinUI.giftId]),[creator.id,true,'gift-1'],'Escape closes only payment selection and preserves gift top-up and draft');
  assert.equal(await gifting.getByRole('dialog',{name:'Add coins',exact:true}).isVisible(),true);
  assert.equal((await sent(gifting,'wallet.checkout')).length,0,'Dismissed gift top-up selection creates no purchase');
  await gifting.close();
  assert.deepEqual(errors,[],'No browser errors');
  console.log('PASS Coins: active account theme and Dark Mode, shared Back button, themed embedded top-up, server-owned promotions, balance/INR pills, 3x2 packs, reachable fixed CTA at 320/390/768px, method selection, retry/Back, routing and idempotent continuation');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
