/* Verify the shipped bundle's navigation, live wallet data and flat design across
   screen sizes. All bridge responses and payment actions stay local. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { MULTILINE, ROUND, STRAIGHT } = require('./flat-corners.cjs');
const root = path.resolve(__dirname, '..');
const account = { user: { id:'507f1f77bcf86cd799439001', name:'Asha Sharma', role:'sender', serverRole:'user', hostStatus:'none', isVerifiedHost:false, isPhoneVerified:true, city:'Pune' }, verification:'none', requiresOnboarding:false };
const settings = { profile:{...account.user,bio:'Here for good conversations.',languages:['Hindi','English'],maskedPhone:'+91 *******3210'},stats:{fans:17,following:5,giftsSent:4,giftsReceived:9},standing:{},preferences:{pushNotifications:false,matchCategory:null},privacy:{discoverable:true,showActivity:true,allowRequests:false},categories:['Music','Talk'],capabilities:{pushNotifications:false} };
const receive = (page,type,data) => page.evaluate(message=>Native.receive(message),{type,data});
const navigate = (page,view) => page.evaluate(view=>go(view),view);
async function audit(page,label){
  const state = await page.evaluate(({multiline,round,straight})=>{
    // Coin packages keep the requested grid and pill geometry while sharing
    // the account palette and the app's standard Back button.
    const nodes=[document.documentElement,...document.querySelectorAll('body,body *')].filter(el=>el.getClientRects().length&&!el.closest('.zw-coins,.zw-page-header,.zw-checkout-footer'));
    const wrong=nodes.flatMap(el=>{
      const c=getComputedStyle(el),name=el.id||el.classList?.value||el.tagName;
      const radiusOK=el.matches(multiline)?c.borderRadius==='24px':el.matches(round)?c.borderRadius==='999px':c.borderRadius==='10px'||c.borderRadius==='0px'&&el.matches(straight);
      return [c.boxShadow!=='none'&&`${name}: shadow`,c.textShadow!=='none'&&`${name}: text shadow`,c.filter.includes('drop-shadow')&&`${name}: filter shadow`,!radiusOK&&`${name}: radius ${c.borderRadius}`].filter(Boolean);
    });
    const reference=document.querySelector('.zw-coins.zw-reference');
    return {wrong,canvas:getComputedStyle(document.querySelector('.app')).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth+1,coinMode:document.documentElement.classList.contains('zw-app'),reference:reference?{card:getComputedStyle(reference.querySelector('.zw-packs>button')).borderRadius,price:getComputedStyle(reference.querySelector('.zw-packs>button>b')).borderRadius,cta:getComputedStyle(reference.querySelector('.zw-buy')).borderRadius}:null};
  },{multiline:MULTILINE,round:ROUND,straight:STRAIGHT});
  assert.deepEqual(state.wrong,[],`${label}: rounded controls/fields, 10px cards, straight structural edges, and no shadows`);
  assert.equal(state.coinMode,!!state.reference,`${label}: coin layout class belongs only to the coin page`);
  assert.equal(state.canvas,'rgb(255, 255, 255)',`${label}: active light theme is retained on every page`);
  if(state.reference)assert.deepEqual(state.reference,{card:'15px',price:'8px',cta:'999px'},`${label}: original package card and price geometry, with a fully rounded purchase action`);
  assert.equal(state.overflow,false,`${label}: fits viewport`);
}
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
  const errors=[];
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://**/*',route=>route.abort());
    await page.addInitScript(()=>{window.__sent=[];window.ReactNativeWebView={postMessage:raw=>__sent.push(JSON.parse(raw))}});
    await page.goto(pathToFileURL(path.join(root,'assets/aurora.html')).href+'?role=sender');
    await receive(page,'session',account);
    await receive(page,'data.home',{hosts:[],stage:[],total:0,page:1,categories:[],unreadCount:0});
    await navigate(page,'settings');
    assert.equal(await page.locator('.zp-wallet .zh-skeleton-shape').count()>0,true,'Unknown balance uses a real loading state');
    await receive(page,'data.profileSettings',settings);
    await receive(page,'wallet.balance',{coins:3750,earningsPaise:0});
    assert.equal(await page.locator('.zp-balance strong').innerText(),'3,750');
    await receive(page,'wallet.balance',{coins:4250,earningsPaise:0});
    assert.equal(await page.locator('.zp-balance strong').innerText(),'4,250','Settings reflects wallet updates');
    assert.deepEqual(await page.locator('#nav button span').allInnerTexts(),['Home','Chat','Profile','Settings']);
    assert.equal(await page.locator('#nav [data-tab="explore"]').count(),0);
    await page.getByRole('button',{name:'Add coins',exact:true}).click();
    assert.equal(await page.evaluate(()=>S.v),'coins','Settings balance card opens real coin packs');
    await receive(page,'data.catalog',{packs:[{id:'pack-1',name:'Starter',coins:200,pricePaise:9899},{id:'pack-2',name:'Everyday',coins:625,pricePaise:24999},{id:'pack-3',name:'More to share',coins:1125,pricePaise:49999},{id:'pack-4',name:'Creator fan',coins:2500,pricePaise:98999},{id:'pack-5',name:'Big moments',coins:3750,pricePaise:149999},{id:'pack-6',name:'Celebration',coins:5000,pricePaise:199999}],gifts:[],paymentsAvailable:true});
    await page.locator('.zw-packs button').nth(2).click();
    assert.match(await page.locator('.zw-buy').innerText(),/1,125 coins\s*(?:·\s*)?₹499\.99/);
    assert.equal(await page.evaluate(()=>__sent.some(x=>x.type==='wallet.checkout')),false,'Selecting a pack does not start a payment');
    const coinCatalog=await page.evaluate(()=>({packs:Home.packs,gifts:[],paymentsAvailable:true}));
    const shots=path.join(root,'artifacts','flat-ui');fs.mkdirSync(shots,{recursive:true});
    for(const width of [320,390,768,1280]){
      await page.setViewportSize({width,height:844});
      for(const view of ['home','chats','profile','settings','coins','wallet','transactions','notifications','themes','search']){
        await navigate(page,view);
        if(view==='profile')await receive(page,'data.publicProfile',{...await page.evaluate(()=>__sent.filter(x=>x.type==='profile.load').at(-1).data),profile:{...account.user,about:settings.profile.bio,languages:settings.profile.languages,followers:17,followingCount:5,joined:'2026-01-01T00:00:00Z',verified:false}});
        if(view==='coins')await receive(page,'data.catalog',coinCatalog);
        await audit(page,`${view} ${width}px`);
        if(width===390&&['profile','settings','coins'].includes(view))await page.screenshot({path:path.join(shots,`${view}.png`)});
      }
    }
    await page.setViewportSize({width:390,height:844});
    await navigate(page,'settings');
    assert.deepEqual(await page.locator('.zb-back').evaluate(el=>{const c=getComputedStyle(el);return [c.borderRadius,c.borderTopWidth,c.borderTopStyle]}),['999px','1px','solid'],'Back is a circle that keeps its 1px border');
    assert.equal(await page.locator('.zp-summary-avatar').evaluate(el=>getComputedStyle(el).borderRadius),'999px','Avatars are round');
    assert.equal(await page.locator('.zp-wallet').evaluate(el=>getComputedStyle(el).borderRadius),'10px','Cards keep the shared 10px corners');
    await page.getByRole('button',{name:'Privacy & Terms',exact:true}).click();
    const privacyMenu=page.getByRole('dialog',{name:'Privacy & Terms',exact:true});
    await privacyMenu.getByRole('button',{name:/Privacy & Blocked Users/}).click();
    await audit(page,'privacy dialog');
    await page.getByRole('button',{name:'Close settings',exact:true}).click();
    await navigate(page,'safety');
    assert.deepEqual([...new Set(await page.locator('.acctrow').evaluateAll(rows=>rows.map(row=>getComputedStyle(row).borderTopWidth)))],['0px'],'No divider lines between settings rows');
    await navigate(page,'settings');
    // A previously saved dark palette must not override the flat white design.
    await receive(page,'data.themes',{items:[{...await page.evaluate(()=>ZThemeOriginal),mode:'dark',colors:{...await page.evaluate(()=>ZThemeOriginal.colors),background:'#101b2d',text:'#ffffff',primary:'#88d9ee'}}],selectedThemeId:'000000000000000000000001',premium:{active:false}});
    await audit(page,'saved dark theme');
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.canvas),'#ffffff');
    assert.deepEqual(errors,[],'No browser errors');
    console.log('PASS flat design: separate Settings tab, live balance and Add coins, fully rounded buttons, active coin theme, settings drilldowns and shared white canvas/10px card corners/no shadows across 10 screens at 320/390/768/1280px');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
