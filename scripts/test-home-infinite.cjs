/* Member Home scroll pagination against the packaged production WebView UI. */
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const member={user:{id:'507f1f77bcf86cd799439099',name:'Member',role:'sender',serverRole:'user',hostStatus:'none',isPhoneVerified:true},requiresOnboarding:false};
const hostSession={user:{id:'507f1f77bcf86cd799439098',name:'Host',role:'host',serverRole:'host',hostStatus:'approved',isPhoneVerified:true,isVerifiedHost:true},verification:'verified',requiresOnboarding:false};
const hosts=Array.from({length:80},(_,index)=>({id:(1000+index).toString(16).padStart(24,'0'),name:`Creator ${index+1}`,role:'host',serverRole:'host',verified:true,online:true,availableForCall:true,country:'India',category:'Talk',ratePerMin:0,entryFee:0}));
const feed=(rows,page=1,total=60,limit=20)=>({hosts:rows,stage:[],featured:null,total,page,limit,categories:['Talk'],unreadCount:0});
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const scrollBottom=page=>page.evaluate(()=>{const root=document.getElementById('scroll-root');root.scrollTop=root.scrollHeight;root.dispatchEvent(new Event('scroll'))});
const requests=page=>page.evaluate(()=>__sent.filter(message=>message.type==='home.reload').map(message=>message.data));
const requestsFor=(page,number,mode='popular')=>page.evaluate(({number,mode})=>__sent.filter(message=>message.type==='home.reload'&&message.data.page===number&&message.data.mode===mode).length,{number,mode});
const waitRequest=(page,number,count=1,mode='popular')=>page.waitForFunction(({number,count,mode})=>__sent.filter(message=>message.type==='home.reload'&&message.data.page===number&&message.data.mode===mode).length===count,{number,count,mode},{timeout:5000});
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
 const errors=[];
 const open=async(fallback=false)=>{
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  page.on('pageerror',error=>errors.push(error.stack||error.message));
  await page.route('https://**/*',route=>route.abort());
  await page.addInitScript(noObserver=>{window.__sent=[];window.ReactNativeWebView={postMessage:raw=>__sent.push(JSON.parse(raw))};if(noObserver)delete window.IntersectionObserver},fallback);
  await page.goto(pathToFileURL(path.join(root,'assets/aurora.html')).href);
  const receive=(type,data={})=>page.evaluate(message=>Native.receive(message),{type,data});
  await receive('session',member);
  await receive('data.home',feed(hosts.slice(0,20)));
  await settle(page);
  return {page,receive};
 };
 try{
  // Actual scrolling triggers one owned request and keeps every existing card.
  {
   const {page,receive}=await open();
   await receive('data.home',feed(hosts.slice(0,20),1,50));
   assert.equal(await page.getByRole('button',{name:/^Load more/}).count(),0,'Member Home has no manual pagination button');
   assert.equal(await requestsFor(page,2),0,'A long first page waits until the bottom approaches');
   await page.evaluate(()=>{window.__firstCard=document.querySelector('article[data-host-id]');window.__firstPhoto=__firstCard.querySelector('img')});
   await scrollBottom(page);await waitRequest(page,2);
   const top=await page.evaluate(()=>document.getElementById('scroll-root').scrollTop);
   assert.ok(top>0,'The test reaches the real scroll container bottom');
   assert.equal(await page.getByRole('status',{name:'Loading more hosts',exact:true}).count(),1);
   for(let i=0;i<5;i++)await page.evaluate(()=>{r();document.getElementById('scroll-root').dispatchEvent(new Event('scroll'))});
   await settle(page);
   assert.equal(await requestsFor(page,2),1,'Repeated callbacks and unrelated redraws share one in-flight page');
   assert.equal(await page.locator('article[data-host-id]').count(),20,'Pagination keeps loaded cards visible');
   assert.equal(await page.evaluate(()=>__firstCard===document.querySelector('article[data-host-id]')&&__firstCard.isConnected),true,'Appending skeletons does not detach existing cards');
   assert.ok(Math.abs(await page.evaluate(()=>document.getElementById('scroll-root').scrollTop)-top)<2,'Loading preserves scroll position');
   await receive('data.home',feed([hosts[19],...hosts.slice(20,39)],2,50));
   assert.equal(await page.locator('article[data-host-id]').count(),39,'Repeated creator IDs across pages are deduplicated');
   assert.equal(await page.evaluate(()=>__firstCard===document.querySelector('article[data-host-id]')),true);
   await settle(page);assert.equal(await requestsFor(page,3),0,'New content below the viewport does not eagerly fetch every page');
   await scrollBottom(page);await waitRequest(page,3);
   await receive('data.loading',{resource:'home',page:3,loading:false,error:'Next page is temporarily unavailable'});
   assert.equal(await page.locator('article[data-host-id]').count(),39,'A failed next page retains loaded cards');
   for(let i=0;i<5;i++)await page.evaluate(()=>{r();document.getElementById('scroll-root').dispatchEvent(new Event('scroll'))});
   await page.waitForTimeout(180);
   assert.equal(await requestsFor(page,3),1,'A failed visible sentinel does not create a retry loop');
   await page.getByRole('button',{name:'Retry loading more hosts',exact:true}).click();await waitRequest(page,3,2);
   await receive('data.home',feed(hosts.slice(39,50),3,50));
   assert.equal(await page.locator('article[data-host-id]').count(),50);
   await scrollBottom(page);await settle(page);
   assert.equal(await requestsFor(page,4),0,'The server total stops pagination');
   assert.equal(await page.getByRole('status',{name:'Loading more hosts',exact:true}).count(),0);
   await page.close();
  }
  // A server page that is empty despite a stale total must stop safely.
  {
   const {page,receive}=await open();
   await scrollBottom(page);await waitRequest(page,2);
   await receive('data.home',feed([],2,100));
   for(let i=0;i<4;i++){await scrollBottom(page);await page.evaluate(()=>r())}
   await page.waitForTimeout(180);
   assert.equal(await page.locator('article[data-host-id]').count(),20);
   assert.equal(await requestsFor(page,3),0,'An empty page cannot loop through a stale total');
   await page.close();
  }
  // Fill a short viewport without requiring an impossible first scroll gesture.
  {
   const {page,receive}=await open();
   await receive('data.home',feed(hosts.slice(0,2),1,3,2));
   await waitRequest(page,2);
   assert.equal(await requestsFor(page,2),1,'A short first page automatically fills the viewport');
   await receive('data.home',feed([hosts[2]],2,3,2));
   await settle(page);
   assert.equal(await page.locator('article[data-host-id]').count(),3);
   assert.equal(await requestsFor(page,3),0,'A short final page stops automatic loading');
   await page.close();
  }
  // A background increase can extend an exhausted feed, but cannot hot-loop a
  // previously empty page; an intentional refresh is what clears that stop.
  {
   const {page,receive}=await open();
   await scrollBottom(page);await waitRequest(page,2);
   await receive('data.home',feed(hosts.slice(20,40),2,40));
   await receive('data.loading',{resource:'home',page:1,loading:true,background:true});
   await receive('data.home',{...feed(hosts.slice(0,20),1,60),background:true});
   await receive('data.loading',{resource:'home',page:1,loading:false,background:true});
   assert.equal(await page.locator('article[data-host-id]').count(),40,'Background updates retain loaded later pages');
   await scrollBottom(page);await waitRequest(page,3);
   await receive('data.home',feed([],3,100));
   await receive('data.home',{...feed(hosts.slice(0,20),1,200),background:true});
   await scrollBottom(page);await settle(page);
   assert.equal(await requestsFor(page,4),0,'Background totals cannot restart an empty-page loop');
   await page.evaluate(()=>homeLoad());
   await receive('data.home',feed(hosts.slice(0,20),1,60));
   await scrollBottom(page);await waitRequest(page,2,2);
   await page.close();
  }
  // Queued scroll work must respect the active route, feed, visibility and role.
  {
   const {page,receive}=await open();
   await page.evaluate(()=>go('chats'));const before=await requests(page);
   await scrollBottom(page);await page.evaluate(()=>r());await settle(page);
   assert.deepEqual(await requests(page),before,'A hidden Home cannot paginate behind Chat');
   await page.evaluate(()=>go('home'));
   await page.evaluate(()=>{const root=document.getElementById('scroll-root');root.scrollTop=root.scrollHeight;root.dispatchEvent(new Event('scroll'));homeDashboardFilter('following')});
   await settle(page);
   assert.equal(await requestsFor(page,2),0,'A queued old-feed observation cannot paginate after switching feeds');
   assert.deepEqual((await requests(page)).at(-1),{page:1,mode:'following'});
   await receive('data.home',feed(hosts.slice(0,20),1,40));
   await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,value:true}));
   await scrollBottom(page);await settle(page);
   assert.equal(await requestsFor(page,2,'following'),0,'Hidden documents do not prefetch');
   await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))});
   await waitRequest(page,2,1,'following');
   await receive('data.home',feed(hosts.slice(20,40),2,40));
   await receive('session',hostSession);const hostBefore=await requests(page);
   await receive('data.users',{users:hosts.slice(0,2).map((row,index)=>({...row,role:'sender',serverRole:'user',verified:false,name:`Member ${index+1}`})),total:3,page:1,limit:2,q:''});
   await scrollBottom(page);await settle(page);
   assert.deepEqual(await requests(page),hostBefore,'Approved-host Home never enters member auto-pagination');
   assert.equal(await page.getByRole('button',{name:'Load more users',exact:true}).count(),1,'Host Members pagination stays independent');
   await receive('session.expired',{});const expiredBefore=await requests(page);
   await scrollBottom(page);await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await settle(page);
   assert.deepEqual(await requests(page),expiredBefore,'Expired sessions cannot resume a detached feed observer');
   await page.close();
  }
  // Older WebViews can paginate with passive scroll events without IO support.
  {
   const {page,receive}=await open(true);
   await receive('data.home',feed(hosts.slice(0,20),1,40));
   await scrollBottom(page);await waitRequest(page,2);
   assert.equal(await requestsFor(page,2),1);
   await receive('data.home',feed(hosts.slice(20,40),2,40));
   await scrollBottom(page);await settle(page);
   assert.equal(await requestsFor(page,3),0);
   assert.equal(await page.getByRole('button',{name:/^Load more/}).count(),0);
   await page.close();
  }
  assert.deepEqual(errors,[],'Infinite scrolling introduces no browser errors');
  console.log('PASS member Home auto-pagination: near-bottom loading, single in-flight page, stable cards/scroll, dedup, explicit retry, exhaustion/empty-page stop, feed/route/visibility/session/role isolation and scroll fallback without IntersectionObserver');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
