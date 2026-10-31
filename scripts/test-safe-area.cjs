/* Device safe-area insets are counted once. Inside the app the native SafeAreaView
   already pads for the status bar, navigation bar and cutouts, but newer Android
   WebViews still report those insets to the page; screens must not add them again.
   A standalone browser applies them. Insets are simulated through DevTools. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const INSETS = { top:32, left:0, bottom:48, right:0 };
const views = ['home','chats','profile','settings','coins','notifications','host:aanya','call:aanya','voice:aanya','login','welcome'];

// Screens use the shared --safe-* variables from web/aurora.css, never the device insets directly.
const direct = fs.readdirSync(path.join(root,'web')).filter(file=>/\.(css|js)$/.test(file)).flatMap(file=>
  fs.readFileSync(path.join(root,'web',file),'utf8').split('\n').map((text,index)=>({where:`web/${file}:${index+1}`,text})))
  .filter(({text})=>/env\(\s*safe-area-inset-/.test(text)&&!text.includes('--safe-top:env('))
  .map(({where})=>where);
assert.deepEqual(direct,[],'Use var(--safe-top|right|bottom|left) instead of env(safe-area-inset-*)');

// Every visible element's spacing, so a change anywhere on the screen is caught.
const spacing = () => [...document.querySelectorAll('body *')].filter(el=>el.getClientRects().length).map(el=>{
  const c=getComputedStyle(el);
  return `${el.tagName.toLowerCase()}.${el.className&&el.className.baseVal===undefined?String(el.className).trim().split(/\s+/).slice(0,2).join('.'):''} ${[c.paddingTop,c.paddingRight,c.paddingBottom,c.paddingLeft,c.marginTop,c.marginBottom,c.top,c.bottom,c.height].join(' ')}`;
});

(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
  const errors=[];
  try {
    for(const native of [true,false]) {
      const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
      page.setDefaultTimeout(6000);
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('https://**/*',route=>route.abort());
      if(native) await page.addInitScript(()=>{window.__sent=[];window.ReactNativeWebView={postMessage:raw=>__sent.push(JSON.parse(raw))}});
      const cdp=await page.context().newCDPSession(page);
      const insets=on=>cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:on?INSETS:{top:0,left:0,bottom:0,right:0}});
      await page.goto(pathToFileURL(path.join(root,'dist/index.html')).href+'?role=sender');
      assert.equal(await page.evaluate(()=>document.documentElement.hasAttribute('data-native-safe-area')),native,'Only the app shell owns the safe area');
      const states=[...views.map(spec=>[spec,()=>page.evaluate(([view,id])=>go(view,id),spec.split(':'))]),
        ['gift sheet',async()=>{await page.evaluate(()=>go('host','aanya'));await page.evaluate(()=>homeGifts('aanya'))}]];
      for(const [label,open] of states) {
        await insets(false);await open();await page.waitForTimeout(150);
        const plain=await page.evaluate(spacing);
        await insets(true);await page.waitForTimeout(100);
        const inset=await page.evaluate(spacing);
        const changed=inset.filter((line,index)=>line!==plain[index]);
        if(native) assert.deepEqual(changed,[],`App ${label}: reported insets do not add space the native frame already reserves`);
        else if(label==='host:aanya') {
          const bar=await page.locator('.zu-actionbar').evaluate(el=>parseFloat(getComputedStyle(el).paddingBottom));
          assert.equal(bar,INSETS.bottom,'Browser profile actions sit above the home indicator, once');
        } else if(label==='call:aanya') {
          const controls=await page.locator('.zr-bottom').first().evaluate(el=>parseFloat(getComputedStyle(el).paddingBottom));
          assert.equal(controls,INSETS.bottom,'Browser call controls sit above the home indicator, once');
        }
        await page.keyboard.press('Escape');
      }
      await page.close();
    }
    assert.deepEqual(errors,[],'Safe-area checks must not cause browser errors');
    console.log('PASS safe area: no direct device insets, app screens/sheets ignore insets the native frame reserves, browsers apply them once');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
