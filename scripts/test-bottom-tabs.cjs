/* Verify the generated bundle seats shared tabs at the bottom without adding
   native safe-area padding twice. Device insets are simulated without OS APIs. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const account = { user:{id:'507f1f77bcf86cd799439001',name:'Asha Sharma',role:'sender',serverRole:'user',hostStatus:'none',isVerifiedHost:false,isPhoneVerified:true,city:'Pune'},verification:'none',requiresOnboarding:false };
const summary = { profile:{...account.user,bio:'Here for good conversations.',languages:['Hindi','English'],maskedPhone:'+91 *******3210'},stats:{fans:17,following:5,giftsSent:4,giftsReceived:9},standing:{},preferences:{pushNotifications:false,matchCategory:null},privacy:{discoverable:true,showActivity:true,allowRequests:false},categories:['Music','Talk'],capabilities:{pushNotifications:false} };
const receive = (page,type,data={}) => page.evaluate(message=>Native.receive(message),{type,data});
const navigate = (page,view) => page.evaluate(view=>go(view),view);
const near = (actual,expected,label) => assert.ok(Math.abs(actual-expected)<.6,`${label}: expected ${expected}, got ${actual}`);
async function metrics(page) {
  return page.evaluate(()=>{
    const nav=document.getElementById('nav'),app=document.querySelector('.app'),style=getComputedStyle(nav),box=nav.getBoundingClientRect(),appBox=app.getBoundingClientRect();
    return {height:box.height,bottom:box.bottom,appBottom:appBox.bottom,viewport:innerHeight,minHeight:parseFloat(style.minHeight),paddingTop:parseFloat(style.paddingTop),paddingBottom:parseFloat(style.paddingBottom),marginTop:parseFloat(style.marginTop),marginBottom:parseFloat(style.marginBottom),overflow:document.documentElement.scrollWidth>innerWidth+1,
      buttons:[...nav.querySelectorAll('button[data-tab]')].map(button=>{const r=button.getBoundingClientRect();return {height:r.height,width:r.width,bottom:r.bottom}})};
  });
}
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
  const errors=[];
  try {
    for(const native of [true,false]) {
      const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
      page.setDefaultTimeout(6000);
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('https://**/*',route=>route.abort());
      await page.addInitScript(native=>{window.__sent=[];if(native)window.ReactNativeWebView={postMessage:raw=>__sent.push(JSON.parse(raw))}},native);
      await page.goto(pathToFileURL(path.join(root,'assets/aurora.html')).href+'?role=sender');
      assert.equal(await page.evaluate(()=>document.documentElement.hasAttribute('data-native-safe-area')),native,'Only the native shell claims safe-area ownership');
      await receive(page,'session',account);
      await receive(page,'data.home',{hosts:[],stage:[],total:0,page:1,categories:[],unreadCount:0});
      await receive(page,'data.chats',{chats:[],total:0,page:1,unreadCount:0});
      await receive(page,'data.profileSettings',summary);
      await receive(page,'wallet.balance',{coins:52400,earningsPaise:0});
      for(const width of [320,390,768,1280]) {
        await page.setViewportSize({width,height:844});
        for(const inset of [0,24,34]) {
          await page.evaluate(inset=>document.documentElement.style.setProperty('--tab-device-inset',`${inset}px`),inset);
          const reserved=native?0:inset;
          for(const view of ['home','chats','profile','settings']) {
            await navigate(page,view);
            const actual=await metrics(page),label=`${native?'native':'browser'} ${view} ${width}px / ${inset}px inset`;
            near(actual.bottom,actual.appBottom,`${label}: tabs touch app bottom`);
            near(actual.appBottom,actual.viewport,`${label}: app fills WebView`);
            near(actual.height,58+reserved,`${label}: safe inset counted once`);
            near(actual.minHeight,58+reserved,`${label}: no older minimum height`);
            near(actual.paddingTop,6,`${label}: compact top padding`);
            near(actual.paddingBottom,7+reserved,`${label}: only required bottom padding`);
            near(actual.marginTop,0,`${label}: no top margin`);
            near(actual.marginBottom,0,`${label}: no bottom margin`);
            assert.equal(actual.overflow,false,`${label}: no width overflow`);
            assert.equal(actual.buttons.length,4,`${label}: shared primary tabs`);
            assert.deepEqual(await page.locator('#nav button[data-tab]>span').allInnerTexts(),['Home','Chat','Profile','Settings'],`${label}: Chat is a display label; the internal key stays chats`);
            for(const item of actual.buttons) {
              near(item.height,44,`${label}: touch target height`);
              assert.ok(item.width>=44,`${label}: touch target width`);
              near(actual.bottom-item.bottom,7+reserved,`${label}: no blank strip beneath controls`);
            }
          }
          await navigate(page,'all-creators');
          assert.equal(await page.locator('#nav').isVisible(),false,'All Creators is a Back page without primary tabs');
          const detail=await page.evaluate(()=>({bottom:document.getElementById('scroll-root').getBoundingClientRect().bottom,appBottom:document.querySelector('.app').getBoundingClientRect().bottom}));
          near(detail.bottom,detail.appBottom,'All Creators content fills the space left by hidden tabs');
          const back=page.locator('#top .zb-back,#screen .zb-back');
          assert.equal(await back.count(),1,'All Creators has one Back action');
          await back.click();
          assert.equal(await page.evaluate(()=>S.v),'home','All Creators Back returns to Home');
          assert.equal(await page.locator('#nav').isVisible(),true,'Back restores primary tabs without a blank strip');
        }
      }
      await page.evaluate(()=>document.documentElement.style.setProperty('--tab-device-inset','0px'));
      await page.setViewportSize({width:390,height:844});
      await navigate(page,'chats');
      await receive(page,'keyboard',{open:true});
      assert.equal(await page.locator('#nav').isVisible(),false,'Tabs hide while typing');
      await receive(page,'keyboard',{open:false});
      assert.equal(await page.locator('#nav').isVisible(),true,'Tabs return after typing');
      near((await metrics(page)).height,58,'Closing keyboard restores compact geometry');
      if(native) {
        await navigate(page,'settings');
        const shots=path.join(root,'artifacts','bottom-tabs');fs.mkdirSync(shots,{recursive:true});
        await page.screenshot({path:path.join(shots,'settings.png')});
      }
      await page.close();
    }
    assert.deepEqual(errors,[],'No browser errors');
    console.log('PASS bottom tabs: four primary screens/four widths, Chat display label, All Creators Back page without tab space, 58px bar with 44px targets, 0/24/34px safe insets counted once and keyboard hide/restore');
  } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
