/* Exercise the simplified reference-style Settings page against the generated
   production WebView bundle. Native account, wallet and payment traffic is local. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const member = {
  user: { id:'507f1f77bcf86cd799439001', name:'Asha Sharma', role:'sender', serverRole:'user', hostStatus:'none', isVerifiedHost:false, isPhoneVerified:true, city:'Pune' },
  verification:'none', requiresOnboarding:false
};
const summary = {
  profile:{ ...member.user, bio:'Here for good conversations.', languages:['Hindi','English'], maskedPhone:'+91 *******3210' },
  stats:{ fans:17, following:5, giftsSent:4, giftsReceived:9 }, standing:{},
  preferences:{ pushNotifications:false, matchCategory:null },
  privacy:{ discoverable:true, showActivity:true, allowRequests:false },
  categories:['Music','Talk'], capabilities:{ pushNotifications:false }
};
const primary = ['Account','Payments','Privacy & Terms','General'];
const receive = (page,type,data={}) => page.evaluate(message=>Native.receive(message),{type,data});
const navigate = (page,view) => page.evaluate(view=>go(view),view);
const dialog = (page,name) => page.getByRole('dialog',{name,exact:true});
const button = (page,name) => page.getByRole('button',{name,exact:true});

async function audit(page,label) {
  const state=await page.evaluate(()=>{
    const visible=[document.documentElement,...document.querySelectorAll('body,body *')].filter(el=>el.getClientRects().length);
    const wrong=visible.flatMap(el=>{
      const c=getComputedStyle(el),name=el.id||el.classList?.value||el.tagName;
      const radiusOK=el.matches('.zb-back')?['50%','22px'].includes(c.borderRadius):c.borderRadius==='10px';
      return [c.boxShadow!=='none'&&`${name}: shadow`,c.textShadow!=='none'&&`${name}: text shadow`,c.filter.includes('drop-shadow')&&`${name}: filter shadow`,!radiusOK&&`${name}: radius ${c.borderRadius}`].filter(Boolean);
    });
    return {wrong,canvas:getComputedStyle(document.querySelector('.app')).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth+1};
  });
  assert.deepEqual(state.wrong,[],`${label}: 10px UI corners, circular Back controls and no shadows`);
  assert.equal(state.canvas,'rgb(255, 255, 255)',`${label}: white canvas`);
  assert.equal(state.overflow,false,`${label}: no horizontal overflow`);
}

(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
  const errors=[];
  try {
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    page.setDefaultTimeout(6000);
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://**/*',route=>route.abort());
    await page.addInitScript(()=>{window.__sent=[];window.ReactNativeWebView={postMessage:raw=>__sent.push(JSON.parse(raw))}});
    await page.goto(pathToFileURL(path.join(root,'assets/aurora.html')).href+'?role=sender');
    await receive(page,'session',member);
    await receive(page,'data.home',{hosts:[],stage:[],total:0,page:1,categories:[],unreadCount:0});
    await navigate(page,'settings');
    assert.equal(await page.locator('.zp-wallet .zh-skeleton-shape').count()>0,true,'Unknown balance stays a loading state');
    assert.equal(await page.locator('.zp-balance strong').innerText(),'','No sample balance appears before the wallet response');
    await receive(page,'data.profileSettings',summary);
    await receive(page,'wallet.balance',{coins:3750,earningsPaise:0});

    const settings=page.locator('.zp-simple-settings');
    await settings.waitFor();
    for(const name of primary)assert.equal(await settings.getByRole('button',{name,exact:true}).count(),1,`${name} is one simple primary row`);
    assert.equal(await page.locator('#zp-search,.zp-filters,.zp-search-empty').count(),0,'Settings has no search or category controls');
    assert.equal(await page.getByRole('button',{name:'Your BinzoLive QR code',exact:true}).count(),0,'The simple header has no QR action');
    assert.equal(await page.locator('.zp-settings-page .zp-footer').count(),0,'Settings has no decorative branded footer');
    assert.equal(await settings.getByRole('button',{name:/view as others see it/i}).count(),0,'Settings does not include the public-profile preview action');
    assert.equal(await button(page,'Back to home').count(),1);
    assert.deepEqual(await page.locator('#nav [data-tab]').evaluateAll(nodes=>nodes.map(el=>el.dataset.tab)),['home','chats','profile','settings']);
    assert.equal(await page.locator('#nav [data-tab="settings"] svg[data-icon="set"]').count(),1,'Navigation uses the shared gear icon helper');
    assert.equal(await page.locator('.zp-balance strong').innerText(),'3,750');
    await receive(page,'wallet.balance',{coins:52400,earningsPaise:0});
    assert.equal(await page.locator('.zp-balance strong').innerText(),'52,400','The card follows confirmed wallet updates');

    const shots=path.join(root,'artifacts','simple-settings');
    fs.mkdirSync(shots,{recursive:true});
    for(const width of [320,390,768]) {
      await page.setViewportSize({width,height:844});
      await navigate(page,'settings');
      await audit(page,`Settings ${width}px`);
      for(const name of primary) {
        const row=settings.getByRole('button',{name,exact:true});
        const detail=await row.evaluate(el=>{
          const c=getComputedStyle(el),rect=el.getBoundingClientRect(),icon=el.querySelector('svg');
          return {height:rect.height,width:rect.width,border:c.borderWidth,icon:icon?{color:getComputedStyle(icon).color,fill:icon.getAttribute('fill')}:null};
        });
        assert.ok(detail.height>=44&&detail.width>=44,`${name} ${width}px: touch target`);
        assert.equal(detail.border,'0px',`${name} ${width}px: an unboxed row`);
        assert.equal(detail.icon?.color,'rgb(24, 24, 27)',`${name} ${width}px: simple black outline icon`);
        assert.equal(detail.icon?.fill,'none',`${name} ${width}px: no filled icon artwork`);
      }
      await page.screenshot({path:path.join(shots,`settings-${width}.png`)});
    }

    await page.setViewportSize({width:390,height:844});
    await button(page,'Account').click();
    await dialog(page,'Account').waitFor();
    await audit(page,'Account drilldown');
    await dialog(page,'Account').getByRole('button',{name:/^Edit profile/}).click();
    assert.equal(await page.evaluate(()=>S.v),'editprofile','Account keeps real profile editing reachable');
    await navigate(page,'settings');
    await button(page,'Account').click();
    await dialog(page,'Account').getByRole('button',{name:/Phone & Email Security/}).click();
    await dialog(page,'Phone & Email Security').waitFor();
    assert.match(await dialog(page,'Phone & Email Security').innerText(),/3210/);
    await button(page,'Close settings').click();

    await button(page,'Payments').click();
    await dialog(page,'Payments').waitFor();
    await dialog(page,'Payments').getByRole('button',{name:/Wallet & Activity/}).click();
    assert.equal(await page.evaluate(()=>S.v),'wallet','Payments keeps real wallet activity reachable');
    await navigate(page,'settings');
    await button(page,'Privacy & Terms').click();
    await dialog(page,'Privacy & Terms').getByRole('button',{name:/Privacy & Blocked Users/}).click();
    await dialog(page,'Privacy & Blocked Users').waitFor();
    assert.equal(await page.getByRole('checkbox',{name:'Discoverable profile',exact:true}).isChecked(),true);
    await audit(page,'Privacy drilldown');
    await button(page,'Close settings').click();

    await button(page,'General').click();
    await dialog(page,'General').waitFor();
    await dialog(page,'General').getByRole('button',{name:/Language & Region/}).click();
    await dialog(page,'Language & Region').waitFor();
    await button(page,'Close settings').click();
    await button(page,'About').click();
    assert.match(await page.getByRole('dialog').innerText(),/BinzoLive/);
    const version=await page.evaluate(()=>window.ZIMI_APP_VERSION);
    assert.ok((await page.getByRole('dialog').innerText()).includes(version),'About shows the shipped app version');
    await button(page,'Close settings').click();
    assert.equal(await page.getByRole('button',{name:/^Creator application$/i}).count(),1,'Members retain their application entry');

    await button(page,'Add coins').click();
    assert.equal(await page.evaluate(()=>S.v),'coins','Add coins opens the existing pack flow');
    assert.equal(await page.evaluate(()=>__sent.some(message=>message.type==='wallet.checkout')),false,'Opening coin packs never starts payment');
    await navigate(page,'settings');
    await button(page,'Back to home').click();
    assert.equal(await page.evaluate(()=>S.v),'home');
    await navigate(page,'settings');
    await button(page,'Open your profile').click();
    assert.equal(await page.evaluate(()=>S.v),'profile');
    assert.deepEqual(errors,[],'No browser or bridge errors');
    console.log('PASS simple Settings: reference-style unboxed rows, black outline icons, no search/filter clutter, working account/payment/privacy/general drilldowns, live balance, Add coins, version and Back/profile navigation at 320/390/768px');
  } finally { await browser.close() }
})().catch(error=>{console.error(error);process.exitCode=1});
