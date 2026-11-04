/* The production WebView receives only local fixtures; no real account or wallet is queried. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const host={user:{id:'507f1f77bcf86cd799439011',name:'Statistics host',role:'host',serverRole:'host',hostStatus:'approved',isVerifiedHost:true,isPhoneVerified:true},verification:'verified',requiresOnboarding:false};
const otherHost={...host,user:{...host.user,id:'507f1f77bcf86cd799439021',name:'Another host'}};
const receive=(page,type,data)=>page.evaluate(message=>Native.receive(message),{type,data});
const latest=page=>page.evaluate(()=>__sent.filter(message=>message.type==='diamonds.statistics.load').at(-1)?.data);
function fixture(period='daily',amount=1000000){
 const startAt=period==='daily'?'2026-11-03T18:30:00.000Z':period==='weekly'?'2026-11-01T18:30:00.000Z':'2026-10-31T18:30:00.000Z',count=period==='daily'?24:period==='weekly'?7:30,step=period==='daily'?3600000:86400000,start=Date.parse(startAt);
 const buckets=Array.from({length:count},(_,index)=>({startAt:new Date(start+index*step).toISOString(),endAt:new Date(start+(index+1)*step).toISOString(),label:period==='daily'?String(index).padStart(2,'0'):period==='weekly'?['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][index]:String(index+1),diamondUnits:amount*(index+1)}));
 return {period,timeZone:'Asia/Kolkata',anchorDate:'2026-11-04',startAt,endAt:buckets.at(-1).endAt,totalDiamondUnits:buckets.reduce((sum,row)=>sum+row.diamondUnits,0),diamondScale:1000000,buckets};
}
async function settle(page,data){const request=await latest(page);await receive(page,'diamonds.statistics.loaded',{...data,requestId:request.requestId})}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})}),errors=[];
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});page.setDefaultTimeout(7000);page.on('pageerror',error=>errors.push(error.message));
  await page.route(/^https?:\/\//,route=>route.abort());await page.addInitScript(()=>{window.__sent=[];window.ReactNativeWebView={postMessage:raw=>__sent.push(JSON.parse(raw))}});
  await page.goto(pathToFileURL(path.join(root,'assets/aurora.html')).href+'?role=sender');await receive(page,'session',host);await page.evaluate(()=>go('settings'));
  await page.getByRole('button',{name:'Account',exact:true}).click();
  await page.getByRole('dialog',{name:'Account',exact:true}).getByRole('button',{name:'Statistics',exact:true}).click();
  await page.getByRole('status',{name:'Loading diamond statistics',exact:true}).waitFor();assert.equal((await latest(page)).period,'daily');
  assert.equal(await page.locator('.zhs-total').count(),0,'Loading never invents an earned balance');await settle(page,fixture());
  assert.equal(await page.getByRole('tab').count(),3);assert.equal(await page.locator('.zhs-bar').count(),24);assert.match(await page.locator('.zhs-total').innerText(),/300/);
  await page.getByRole('button',{name:'05:00, 6 diamonds earned',exact:true}).click();assert.match(await page.locator('.zhs-selection').innerText(),/05:00[\s\S]*6 diamonds/);
  await page.keyboard.press('ArrowRight');assert.match(await page.locator('.zhs-selection').innerText(),/06:00[\s\S]*7 diamonds/);
  assert.equal(await page.locator('#nav').isVisible(),false,'A detail page has no bottom navigation');
  await receive(page,'app.back',{});await page.getByRole('dialog',{name:'Account',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>S.v),'settings','Android Back returns to the Account menu');
  await page.getByRole('dialog',{name:'Account',exact:true}).getByRole('button',{name:'Statistics',exact:true}).click();await settle(page,fixture());
  const daily=await latest(page);await page.getByRole('tab',{name:'Weekly',exact:true}).click();const weekly=await latest(page);assert.notEqual(weekly.requestId,daily.requestId);
  await page.getByRole('tab',{name:'Monthly',exact:true}).click();const monthly=await latest(page);await receive(page,'diamonds.statistics.loaded',{...fixture('weekly'),requestId:weekly.requestId});
  assert.equal(await page.getByRole('status',{name:'Loading diamond statistics',exact:true}).count(),1,'An older tab response cannot replace the new request');
  await receive(page,'diamonds.statistics.loaded',{...fixture('monthly',0),requestId:monthly.requestId});assert.equal(await page.locator('.zhs-bar').count(),30);await page.getByRole('heading',{name:'No diamonds earned in this period',exact:true}).waitFor();
  await page.getByRole('button',{name:'Previous month',exact:true}).click();const prior=await latest(page);assert.equal(prior.date,'2026-10-01');
  await receive(page,'diamonds.statistics.error',{period:'monthly',requestId:prior.requestId,message:'Statistics are temporarily unavailable.'});assert.match(await page.getByRole('alert').innerText(),/temporarily unavailable/);assert.equal(await page.locator('.zhs-bar').count(),0);
  await page.getByRole('button',{name:'Try again',exact:true}).click();assert.equal((await latest(page)).date,prior.date);await settle(page,{...fixture('monthly'),historicalTiming:true});assert.match(await page.locator('.zhs-page').innerText(),/Older call earnings use their recorded receipt date/);
  await page.getByRole('tab',{name:'Weekly',exact:true}).click();await settle(page,fixture('weekly'));assert.equal(await page.locator('.zhs-bar').count(),7);assert.match(await page.locator('.zhs-range').innerText(),/2 Nov.*8 Nov 2026/);
  const shots=path.join(root,'artifacts','host-statistics');fs.mkdirSync(shots,{recursive:true});
  for(const period of ['weekly','daily','monthly']){
   if(period!=='weekly'){await page.getByRole('tab',{name:period==='daily'?'Daily':'Monthly',exact:true}).click();await settle(page,fixture(period))}
   for(const dark of [false,true])for(const width of [320,390]){await page.setViewportSize({width,height:844});await page.evaluate(value=>ZimiThemes.setDark(value),dark);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1||document.querySelector('.zhs-page').scrollWidth>document.querySelector('.zhs-page').clientWidth+1),false,`${period} ${width}px graph fits its canvas`);await page.screenshot({path:path.join(shots,`${period}-${dark?'dark':'light'}-${width}.png`)})}
  }
  await page.getByRole('tab',{name:'Daily',exact:true}).click();const oldOwner=await latest(page);await receive(page,'session',otherHost);await receive(page,'diamonds.statistics.loaded',{...fixture(),requestId:oldOwner.requestId});assert.equal(await page.locator('.zhs-total').count(),0,'An account switch cannot display the previous host history');
  await page.evaluate(()=>go('host-statistics'));await page.getByRole('status',{name:'Loading diamond statistics',exact:true}).waitFor();await settle(page,fixture('daily',1));assert.match(await page.locator('.zhs-total').innerText(),/0\.0003/,'Historical fractional diamonds retain their fixed precision');
  await receive(page,'host.access',{approved:false,checking:false,role:'host',hostStatus:'suspended',verified:false});assert.equal(await page.locator('.zhs-chart').count(),0,'Host revocation removes private statistics');
  await receive(page,'session',{...otherHost,user:{...otherHost.user,role:'sender',serverRole:'user',hostStatus:'none',isVerifiedHost:false},verification:'none'});await page.evaluate(()=>go('settings'));
  await page.getByRole('button',{name:'Account',exact:true}).click();assert.equal(await page.getByRole('dialog',{name:'Account',exact:true}).getByRole('button',{name:'Statistics',exact:true}).count(),0,'Statistics is a host-only account option');
  await page.getByRole('button',{name:'Close settings',exact:true}).click();await page.getByRole('button',{name:'Payments',exact:true}).click();assert.equal(await page.getByRole('dialog',{name:'Payments',exact:true}).getByRole('button',{name:'Withdraw',exact:true}).count(),0,'Members do not receive a host withdrawal action');
  await receive(page,'session.none',{});assert.equal(await page.evaluate(()=>HostStatistics.data),null);assert.deepEqual(errors,[]);
  console.log('PASS host statistics: three real-data bar charts, exact diamond precision, navigation, request/owner isolation, error/empty states, historical timing note, keyboard access and 320/390px light/dark layouts');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
