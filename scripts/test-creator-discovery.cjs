/* Discovery opens a creator profile before chat/call. Exercise the production
   bundle with local feed, profile and media responses; no live service is used. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const id = n => '507f1f77bcf86cd799439' + String(n).padStart(3, '0');
const account = { user:{id:id(1),name:'Discovery member',role:'sender',serverRole:'user',hostStatus:'none',isVerifiedHost:false,isPhoneVerified:true},verification:'none',requiresOnboarding:false };
const host = n => ({id:id(n+100),name:`Creator ${n}`,role:'host',serverRole:'host',category:'Talk',tag:'Music and conversation',verified:true,online:n!==3,availableForCall:n!==4,ratePerMin:0,avatarUrl:`https://discovery.fixture.test/host-${n}.webp`,coverUrl:`https://discovery.fixture.test/host-${n}.webp`});
const hosts = Array.from({length:12},(_,index)=>host(index+1));
const feed = (rows,page=1,total=12) => ({hosts:rows,stage:[],featured:page===1?rows[0]||null:null,total,page,limit:8,categories:['Talk'],broadcasterCount:0,availableCount:total,speedMatchEnabled:false,bonus:null,unreadCount:0});
const receive = (page,type,data={}) => page.evaluate(message=>Native.receive(message),{type,data});
const navigate = (page,view) => page.evaluate(view=>go(view),view);
const sent = (page,type) => page.evaluate(type=>__sent.filter(message=>message.type===type).map(message=>message.data),type);
const last = async (page,type) => (await sent(page,type)).at(-1);
const button = (page,name) => page.getByRole('button',{name,exact:true});
async function acceptFeed(page,data) {
  await receive(page,'data.home',data);
  await receive(page,'data.loading',{resource:'home',loading:false,page:data.page});
}
async function acceptProfile(page,creator) {
  const request = await last(page,'profile.load');
  assert.equal(request.id,creator.id,'A card requests the chosen creator profile');
  await receive(page,'data.publicProfile',{...request,profile:{...creator,about:creator.tag,languages:['English'],followers:15,followingCount:3,joined:'2026-01-01T00:00:00Z'}});
  const posts = await last(page,'profile.posts.load');
  if(posts?.id===creator.id)await receive(page,'data.publicPosts',{...posts,posts:[],total:0,page:1,limit:20});
}
// Pulls the page down from the top the way a finger does, then releases.
const pullToRefresh=page=>page.evaluate(()=>{
  const target=document.getElementById('screen'),touch=y=>new Touch({identifier:1,target,clientX:180,clientY:y});
  const fire=(type,y)=>{const active=type==='touchend'?[]:[touch(y)];target.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:active,targetTouches:active,changedTouches:[touch(y)]}))};
  fire('touchstart',120);for(const y of [150,190,230,270,300])fire('touchmove',y);fire('touchend',300);
});
async function assertProfileCards(page,scope,expected) {
  const area = page.locator(scope);
  assert.equal(await area.locator('.zh-person-call,.zh-person-chat,.zh-person-footer').count(),0,'Discovery has no Chat controls');
  const ids = await area.locator('[data-host-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.hostId));
  assert.equal(ids.length,expected,'Every creator is represented once');
  assert.equal(new Set(ids).size,expected,'Featured creators are not duplicated in the grid');
  for(const card of await area.locator('[data-host-id]').all()){
    const labels=await card.getByRole('button').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label')||''));
    assert.equal(labels.filter(label=>/^View .+ profile$/.test(label)).length,1,'Each discovery card has one profile action');
    if(await card.evaluate(el=>el.matches('article.zh-creator-card'))){
      assert.equal(labels.filter(label=>/^Video call /.test(label)).length,1,'Each host card has a video call button');
      assert.equal(await card.locator('.zh-creator-call').isEnabled(),true,'The video call button is always active');
      assert.equal(await card.locator('.zh-creator-call').evaluate(el=>getComputedStyle(el).borderRadius),'999px','The video call button is round');
    }
  }
}

(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
  const errors=[];
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    page.setDefaultTimeout(6000);
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://**/*',route=>{
      const match=route.request().url().match(/^https:\/\/discovery\.fixture\.test\/host-(\d+)\.webp$/);
      if(!match)return route.abort();
      return route.fulfill({status:200,contentType:'image/webp',body:fs.readFileSync(path.join(root,'web','onboarding-media',`india-${(Number(match[1])-1)%6+1}.webp`))});
    });
    await page.addInitScript(()=>{window.__sent=[];window.ReactNativeWebView={postMessage:raw=>__sent.push(JSON.parse(raw))}});
    await page.goto(pathToFileURL(path.join(root,'assets','aurora.html')).href+'?role=sender');
    await receive(page,'session',account);
    await receive(page,'wallet.balance',{coins:1000,earningsPaise:0});
    await acceptFeed(page,feed(hosts.slice(0,8)));
    await navigate(page,'home');
    assert.deepEqual(await page.locator('.zh-feed-tabs').getByRole('tab').allInnerTexts(),['All','Following']);
    assert.deepEqual(await page.locator('#nav [data-tab]>span').allInnerTexts(),['Home','Chat','Profile','Settings']);
    await assertProfileCards(page,'.zh-dashboard',8);
    await page.evaluate(()=>{window.__prepared=0;window.ZimiMedia.prepare=async()=>{__prepared++};window.ZimiMedia.attach=()=>{}});
    await page.locator('.zh-featured-profile-hit').click();
    assert.equal(await page.evaluate(()=>S.v),'host','The complete featured card opens the profile');
    await acceptProfile(page,hosts[0]);
    assert.equal(await page.locator('#zu-message').isVisible(),true,'Chat is available on the creator profile');
    assert.equal(await page.locator('#zu-call').isVisible(),true,'Video call is available on the creator profile');
    assert.equal((await sent(page,'call.start')).length,0,'Browsing a profile never starts a call');
    assert.equal(await page.evaluate(()=>__prepared),0,'Browsing does not activate the camera');
    await page.locator('#zu-call').click();
    assert.equal(await page.evaluate(()=>S.v),'precall','Calling begins from the profile and still requires confirmation');
    assert.equal((await sent(page,'call.start')).length,0);
    await navigate(page,'home');
    await page.locator('.zh-creator-card .zh-creator-hit').first().click();
    await acceptProfile(page,hosts[1]);
    await page.locator('#zu-message').click();
    assert.equal(await page.evaluate(()=>S.v),'thread','Chat begins from the creator profile');
    await navigate(page,'home');

    await page.getByRole('tab',{name:'Following',exact:true}).click();
    assert.deepEqual(await last(page,'home.reload'),{page:1,mode:'following'});
    await acceptFeed(page,feed([hosts[2],hosts[5]],1,2));
    await button(page,'See all').click();
    assert.equal(await page.evaluate(()=>S.v),'all-creators');
    assert.deepEqual(await last(page,'home.reload'),{page:1,mode:'popular'},'All Creators uses the server popular feed');
    assert.equal(await page.locator('.zac-page').getByRole('status',{name:'Loading creators',exact:true}).count(),1,'Changing feed modes shows a real loading state');
    assert.equal(await page.locator('.zac-page [data-host-id]').count(),0,'Following results never masquerade as all creators');
    await acceptFeed(page,feed(hosts.slice(0,8)));
    await page.getByRole('heading',{name:'All Creators',exact:true}).waitFor();
    assert.equal(await page.locator('#nav').isVisible(),false,'All Creators is a Back page, not another primary tab');
    assert.equal(await page.locator('#top').innerHTML(),'','No duplicate Home header');
    await assertProfileCards(page,'.zac-page',8);
    assert.equal(await button(page,'View Creator 4 profile').isEnabled(),true,'Unavailable call settings do not hide or disable a profile');
    await button(page,'View Creator 4 profile').click();
    await acceptProfile(page,hosts[3]);
    assert.equal(await page.locator('#zu-call').isDisabled(),true,'The profile still enforces the creator call settings');
    await page.locator('.zu-toolbar .zb-back').click();
    assert.equal(await page.evaluate(()=>S.v),'all-creators','Profile Back returns to All Creators');
    await assertProfileCards(page,'.zac-page',8);
    await button(page,'Load more creators').click();
    assert.deepEqual(await last(page,'home.reload'),{page:2,mode:'popular'});
    assert.equal(await page.locator('.zac-page [data-host-id]').count(),8,'Pagination keeps the first page visible');
    await page.getByRole('status',{name:'Loading more creators',exact:true}).waitFor();
    await receive(page,'data.loading',{resource:'home',loading:false,page:2,error:'More creators could not be loaded'});
    await page.getByRole('alert').filter({hasText:'More creators could not be loaded'}).waitFor();
    assert.equal(await page.locator('.zac-page [data-host-id]').count(),8,'A pagination failure preserves the existing page');
    await button(page,'Retry loading more creators').click();
    assert.deepEqual(await last(page,'home.reload'),{page:2,mode:'popular'});
    await acceptFeed(page,feed([hosts[7],...hosts.slice(8)],2));
    await assertProfileCards(page,'.zac-page',12);
    assert.equal(await button(page,'Load more creators').count(),0,'Pagination ends at the server total');
    const shots=path.join(root,'artifacts','creator-discovery');fs.mkdirSync(shots,{recursive:true});
    for(const width of [320,390,768,1280]){
      await page.setViewportSize({width,height:844});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`All Creators fits ${width}px`);
      assert.equal(await page.locator('.zac-page').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,`Cards fit their page at ${width}px`);
      if(width===390){await page.evaluate(()=>window.zimiScrollTo?.(0));await page.screenshot({path:path.join(shots,'all-creators.png')})}
    }
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.locator('.zac-refresh,[aria-label="Refresh creators"]').count(),0,'All Creators has no refresh button');
    await pullToRefresh(page);
    assert.deepEqual(await last(page,'home.reload'),{page:1,mode:'popular'},'Pulling down refreshes the creator list');
    await receive(page,'data.loading',{resource:'home',loading:false,page:1,error:'Creators are temporarily unavailable'});
    await page.getByRole('alert').filter({hasText:'Creators are temporarily unavailable'}).waitFor();
    await button(page,'Retry').click();
    assert.deepEqual(await last(page,'home.reload'),{page:1,mode:'popular'});
    await acceptFeed(page,feed(hosts.slice(0,8)));
    await button(page,'Back to home').click();
    assert.equal(await page.evaluate(()=>S.v),'home');
    assert.deepEqual(await last(page,'home.reload'),{page:1,mode:'following'},'Back restores the selected Home feed on the server');
    await acceptFeed(page,feed([hosts[2],hosts[5]],1,2));
    assert.equal(await page.getByRole('tab',{name:'Following',exact:true}).getAttribute('aria-selected'),'true');
    await navigate(page,'explore');
    assert.equal(await page.evaluate(()=>S.v),'home','Legacy Explore links resolve to Home');
    assert.equal(await page.locator('.zh-explore').count(),0,'Explore has no separate page');
    await page.getByRole('tab',{name:'All',exact:true}).click();
    await acceptFeed(page,feed(hosts.slice(0,8)));
    await page.screenshot({path:path.join(shots,'home.png')});
    assert.deepEqual(errors,[],'The discovery flow has no browser errors');
    console.log('PASS creator discovery: profile-first featured/grid cards with always-active video call buttons, pull to refresh, Home all/following server feeds, separate All Creators pagination/error/retry, mode restoration, legacy Explore redirect and responsive layout');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
