/* Check the shipped UI acknowledges actions without bounce, particles or list
   reveals, and respects reduced motion. No real account or payment is touched. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
  const errors=[];
  const open=async reducedMotion=>{
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion});
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://**/*',route=>route.abort());
    await page.goto(pathToFileURL(path.join(root,'dist/index.html')).href+'?role=sender');
    return page;
  };
  try{
    const page=await open('no-preference');
    const before=await page.locator('.zh-person-card,.zh-tile,.zc-row').evaluateAll(nodes=>nodes.flatMap(node=>node.getAnimations().map(animation=>animation.id)));
    assert.deepEqual(before,[],'Lists do not stagger or fly in when rendered');
    const press=await page.evaluate(()=>{
      const button=document.querySelector('#nav [data-tab="chats"]');
      button.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',button:0}));
      return button.getAnimations().filter(animation=>animation.id==='zt-press').map(animation=>({duration:animation.effect.getTiming().duration,frames:animation.effect.getKeyframes()}));
    });
    assert.equal(press.length,1,'A control receives one touch acknowledgement');
    assert.ok(press[0].duration<=150,'Touch feedback starts promptly');
    assert.ok(press[0].frames.every(frame=>frame.transform===undefined&&frame.scale===undefined),'Press feedback does not move or overshoot the control');
    await page.evaluate(()=>document.querySelector('#nav [data-tab="chats"]').dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerType:'touch'})));
    assert.equal(await page.locator('#nav [data-tab="chats"]').evaluate(button=>button.getAnimations().filter(animation=>animation.id.startsWith('zt-press')).length),0,'A cancelled touch restores the control immediately');
    const transition=await page.evaluate(()=>{
      go('chats');
      return document.getElementById('screen').getAnimations().filter(animation=>animation.id==='zimi-tab-switch').map(animation=>({duration:animation.effect.getTiming().duration,frames:animation.effect.getKeyframes()}));
    });
    assert.equal(transition.length,1,'Changing tabs uses one content transition');
    assert.equal(transition[0].duration,180);
    assert.equal(transition[0].frames[0].transform,'translateY(4px)');
    assert.equal(transition[0].frames.at(-1).transform,'translateY(0px)');
    await page.waitForFunction(()=>!document.getElementById('screen').getAnimations().some(animation=>animation.id==='zimi-tab-switch'));
    await page.evaluate(()=>{Native.receive({type:'follow.saved',data:{id:'aanya',on:true}});Native.receive({type:'gift.sent',data:{}})});
    assert.equal(await page.locator('.zt-ripple,.zt-burst').count(),0,'Success feedback does not scatter particles or render ripples');
    const reduced=await open('reduce');
    await reduced.evaluate(()=>{
      const button=document.querySelector('#nav [data-tab="chats"]');
      button.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',button:0}));
      button.click();
    });
    assert.equal(await reduced.locator('#screen,#nav').evaluateAll(nodes=>nodes.flatMap(node=>node.getAnimations({subtree:true})).length),0,'Reduced motion keeps controls and tab content still');
    const native=fs.readFileSync(path.join(root,'src/launch-screen.tsx'),'utf8');
    assert.doesNotMatch(native,/Animated\.(?:loop|modulo|multiply)|logoScale|styles\.ring/,'Launch uses a simple fade without looping rings or logo zoom');
    assert.match(native,/accessibilityState=\{\{ busy: !ready \}\}/,'Launch readiness remains accessible and tied to real content');
    assert.deepEqual(errors,[],'Motion introduces no browser errors');
    console.log('PASS motion: restrained press feedback, cancelled-touch cleanup, 180ms content fade, no particles/list reveals, reduced motion and a quiet native launch');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
