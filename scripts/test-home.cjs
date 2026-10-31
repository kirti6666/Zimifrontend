const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');

// Pulls the page down from the top the way a finger does, then releases.
const pullToRefresh=page=>page.evaluate(()=>{
  const target=document.getElementById('screen'),touch=y=>new Touch({identifier:1,target,clientX:180,clientY:y});
  const fire=(type,y)=>{const active=type==='touchend'?[]:[touch(y)];target.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:active,targetTouches:active,changedTouches:[touch(y)]}))};
  fire('touchstart',120);for(const y of [150,190,230,270,300])fire('touchmove',y);fire('touchend',300);
});
async function assertPhotoCardLayout(page, label) {
  const boxes=await page.locator('.zh-discover .zh-creator-card').evaluateAll(nodes=>nodes.map(node=>{const box=node.getBoundingClientRect();return {left:box.left,right:box.right,top:box.top,bottom:box.bottom};}));
  assert.ok(boxes.length>1,`${label} has multiple discovery cards to check`);
  assert.ok(Math.abs(boxes[0].top-boxes[1].top)<2&&boxes[1].left>boxes[0].right,`${label} uses two columns of photo cards`);
  boxes.slice(2).forEach((box,index)=>{
    assert.ok(Math.abs(box.left-boxes[index%2].left)<2,`${label} keeps the photo grid aligned`);
    assert.ok(box.top>=boxes[index].bottom,`${label} keeps successive grid rows separate`);
  });
  assert.ok(boxes.every(box=>Math.abs((box.right-box.left)-(box.bottom-box.top))<2),`${label} uses square photo cards like the reference`);
  assert.ok(boxes.every(box=>box.left>=0&&box.right<=page.viewportSize().width+1),`${label} keeps every card inside the viewport`);
  assert.equal(await page.locator('.zh-featured-host,.zh-featured-carousel').count(),0,`${label} has no featured card`);
  const calls=await page.locator('.zh-discover article.zh-creator-card').evaluateAll(cards=>cards.map(card=>{const button=card.querySelector('button.zh-creator-call');return !!button&&!button.disabled&&/^Video call /.test(button.getAttribute('aria-label')||'')}));
  assert.ok(calls.every(Boolean),`${label}: every host card has an always-active video call button`);
  assert.equal(await page.locator('.zh-person-footer,.zh-person-chat').count(),0,`${label}: host cards carry no Chat controls`);
}

async function acceptCreatorProfile(page, creator) {
  const request=await page.evaluate(()=>__sent.filter(message=>message.type==='profile.load').at(-1)?.data);
  assert.equal(request?.id,creator.id,'The selected card requests its real creator profile');
  await page.evaluate(({creator,requestId})=>Native.receive({type:'data.publicProfile',data:{id:creator.id,profile:{...creator,followers:12,followingCount:2,following:false,interests:['Music'],languages:['Hindi']},requestId}}),{creator,requestId:request.requestId});
  const posts=await page.evaluate(()=>__sent.filter(message=>message.type==='profile.posts.load').at(-1)?.data);
  if(posts?.id===creator.id)await page.evaluate(({id,requestId})=>Native.receive({type:'data.publicPosts',data:{id,posts:[],total:0,page:1,limit:20,requestId}}),posts);
}

async function testHomeVideoCalls(browser, errors, host, home) {
  const member={user:{id:'507f1f77bcf86cd799439001',name:'Member',role:'sender',serverRole:'user',hostStatus:'none',isVerifiedHost:false,isPhoneVerified:true},verification:'none',requiresOnboarding:false};
  async function scenario(run, account=member, creator=host) {
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{window.__sent=[];window.ReactNativeWebView={postMessage:raw=>window.__sent.push(JSON.parse(raw))};});
    try {
      await page.goto(pathToFileURL(path.join(root,'assets/aurora.html')).href+'?role=sender');
      const receive=(type,data)=>page.evaluate(({type,data})=>Native.receive({type,data}),{type,data});
      const sent=type=>page.evaluate(type=>__sent.filter(message=>message.type===type).map(message=>message.data),type);
      await receive('session',account);
      await receive('data.home',{...home,hosts:[creator],stage:[creator],featured:creator});
      await receive('wallet.balance',{coins:1000});
      await page.evaluate(()=>{window.__prepared=0;window.ZimiMedia.prepare=async()=>{window.__prepared++};window.ZimiMedia.openStream=()=>{};window.ZimiMedia.attach=()=>{};});
      // The card offers its always-active video call; chat stays on the profile.
      assert.equal(await page.locator('.zh-dashboard').getByRole('button',{name:/^Chat with /}).count(),0,'Chat belongs on the profile');
      assert.equal(await page.locator('.zh-discover .zh-creator-call').isEnabled(),true,'The card has the always-active video call button');
      assert.equal(await page.locator('.zh-person-cost').count(),0,'Home does not disclose call rates before the call action');
      assert.doesNotMatch(await page.locator('.zh-dashboard').innerText(),/\bpremium\b|call rate|coins\s*\/\s*min/i,'Home discovery has no detailed pricing');
      await page.getByRole('button',{name:'View '+creator.name+' profile',exact:true}).click();
      assert.equal(await page.evaluate(()=>S.v),'host','The card opens the selected creator profile');
      assert.equal((await sent('call.start')).length,0,'Opening the profile never places a call');
      assert.equal(await page.evaluate(()=>__prepared),0,'Opening the profile never activates capture');
      await acceptCreatorProfile(page,creator);
      const call=page.locator('#zu-call');
      await run({page,receive,sent,call});
    } finally {await page.close();}
  }
  for (const creator of [{...host,stream:null},host]) {
    await scenario(async({page,sent,call})=>{
      await call.click();
      assert.equal(await page.evaluate(()=>S.v),'precall','Available creators open private-call confirmation');
      assert.equal((await sent('call.start')).length,0,'Opening confirmation does not place a call');
      assert.equal(await page.evaluate(()=>__prepared),0,'Opening confirmation does not activate capture');
      assert.equal(await page.getByRole('button',{name:'Request video call',exact:true}).count(),0,'Private calls never use a live queue');
      assert.equal(await page.getByRole('button',{name:'Voice call',exact:true}).count(),1,'Voice calling stays available');
      await page.getByRole('button',{name:'Start video call',exact:true}).click();
      assert.deepEqual(await sent('call.start'),[{to:host.id,voice:false}]);
      assert.equal((await sent('stream.join')).length+(await sent('stream.request')).length,0,'Streaming metadata never sends members into a broadcast');
    },member,creator);
  }
  await scenario(async({page,receive,sent,call})=>{
    await call.click();
    await receive('data.home',{...home,hosts:[host],stage:[host],featured:host});
    await page.getByRole('button',{name:'Voice call',exact:true}).click();
    await page.getByRole('button',{name:'Start voice call',exact:true}).click();
    assert.deepEqual(await sent('call.start'),[{to:host.id,voice:true}],'A live feed update does not replace a private voice call with a queue');
    assert.equal((await sent('stream.join')).length,0);
  },member,{...host,stream:null});
  await scenario(async({page,receive,sent,call})=>{
    await call.click();
    await page.getByRole('button',{name:'Back',exact:true}).click();
    await page.evaluate(()=>homeDashboardConfirmCall());
    await receive('stream.opened',{stream:host.stream,hosting:false,messages:[]});
    assert.equal(await page.evaluate(()=>S.v),'home','Unsolicited stream responses cannot open a room');
    assert.equal((await sent('call.start')).length+(await sent('stream.join')).length+(await sent('stream.request')).length,0);
    assert.equal(await page.evaluate(()=>__prepared),0);
  });
  await scenario(async({page,receive,sent,call})=>{
    await receive('wallet.balance',{coins:24});await call.click();
    assert.match(await page.locator('.zpc-details').innerText(),/25\s+coins\/min/);
    const buy=page.getByRole('button',{name:'Buy coins to call',exact:true});
    assert.equal(await buy.count(),1);
    await page.evaluate(()=>homeStartCall(false));
    assert.equal((await sent('call.start')).length,0,'The call handler enforces the current wallet balance');
    await buy.click();assert.equal(await page.evaluate(()=>S.v),'coins');
  },member,{...host,ratePerMin:25});
  await scenario(async({page,receive,sent,call})=>{
    await receive('data.loading',{resource:'wallet',loading:true});await call.click();
    const confirm=page.getByRole('button',{name:'Start video call',exact:true});
    assert.equal(await confirm.isDisabled(),true);
    await page.evaluate(()=>homeStartCall(false));
    assert.equal((await sent('call.start')).length,0,'An unresolved wallet blocks capture and calling');
    await receive('data.loading',{resource:'wallet',loading:false,error:'Balance could not be loaded.'});
    await page.getByRole('button',{name:'Retry balance',exact:true}).click();
    assert.equal((await sent('wallet.load')).length,1);
    await receive('wallet.balance',{coins:25});await confirm.click();
    assert.equal((await sent('call.start')).length,1,'Recovered wallet allows exactly one confirmed call');
  },member,{...host,ratePerMin:25});
  await scenario(async({page,receive,sent,call})=>{
    await receive('wallet.balance',{coins:0});await call.click();
    assert.match(await page.locator('.zpc-details').innerText(),/\bFree\b/);
    await page.getByRole('button',{name:'Start video call',exact:true}).click();
    assert.equal((await sent('call.start')).length,1,'Free private calls work with a zero balance');
  });
  await scenario(async({page,sent,call})=>{
    assert.equal(await call.isDisabled(),true);await page.evaluate(id=>homeDashboardCall(id),host.id);
    assert.equal((await sent('call.start')).length,0,'Unavailable creators cannot be called directly');
  },member,{...host,availableForCall:false});
  await scenario(async({page,sent,call})=>{
    assert.equal(await call.count(),0,'Creator accounts have no member-only call action');await page.evaluate(id=>homeDashboardCall(id),host.id);
    assert.equal((await sent('call.start')).length,0,'Creator accounts cannot initiate host-to-host calls');
  },{...member,user:{...member.user,id:'507f1f77bcf86cd799439017',role:'host',serverRole:'host',hostStatus:'approved',isVerifiedHost:true},verification:'verified'});

}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH} : {}) });
  try {
    fs.mkdirSync(artifacts, { recursive: true });
    const page = await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://fonts.**/*',r=>r.abort());
    await page.goto(pathToFileURL(path.join(root,'dist/index.html')).href+'?role=sender');
    await page.waitForSelector('.zh-dashboard');
    await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('article[data-host-id]').count(),5);
    assert.equal(await page.locator('.zh-discover .zh-creator-name>span:first-child').first().innerText(),'Meher Kaur','Home lists creators in the server order');
    assert.equal(await page.locator('.zh-nav button').count(),4);
    assert.equal(await page.locator('.zh-featured-host,.zh-featured-carousel').count(),0,'Home has no featured card, like the reference');
    assert.equal(await page.locator('.zh-live-section').getByRole('button',{name:/^Join .* live$/}).count(),0,'The live strip is disabled');
    assert.equal(await page.locator('.zh-discover article.zh-creator-card').count(),5,'Every creator is in the one grid');
    assert.equal(await page.getByRole('button',{name:'Search creators',exact:true}).count(),1,'Search appears only in the Home header');
    assert.equal(await page.locator('.zh-dashboard .zh-home-search,.zh-dashboard .zh-welcome,.zh-dashboard .zh-shortcuts,.zh-dashboard .zh-home-match,.zh-dashboard .zh-bonus').count(),0,'Home content focuses on discovering live and online hosts');
    assert.equal(await page.locator('.zh-dashboard-filters [data-dashboard-filter],.zh-dashboard .zh-filters').count(),0,'Home omits category and popularity filters');
    assert.deepEqual(await page.locator('.zh-feed-tabs').getByRole('tab').allInnerTexts(),['Following','Explore','For You','New'],'The Home header has the reference feed tabs');
    assert.equal(await page.getByRole('tab',{name:'Explore',exact:true}).getAttribute('aria-selected'),'true','Explore is the default feed');
    assert.equal(await page.locator('.zh-brand,.zh-logo').count(),0,'The discovery tabs replace the app-name header');
    assert.deepEqual(await page.locator('.zh-header-actions button').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label'))),['Search creators','Leaderboard'],'Like the reference, the header has only Search and the trophy');
    assert.deepEqual(await page.locator('.zh-region-chips button').allInnerTexts(),['Popular','India'],'Country chips offer Popular and India only');
    assert.equal(await page.locator('.zh-region-chips button[aria-pressed="true"]').innerText(),'Popular');
    assert.equal(await page.locator('.zh-host-status').count(),0,'Sender accounts do not show host availability');
    assert.equal(await page.getByRole('heading',{name:/^Live now/}).count(),0);
    assert.equal(await page.getByRole('heading',{name:'Instant Connect',exact:true}).count(),0,'The grid has no section title');
    assert.equal(await page.locator('.zh-dashboard').getByRole('button',{name:/^Chat with /}).count(),0,'Discovery cards have no Chat buttons');
    const gridCard=page.locator('.zh-discover article.zh-creator-card').first();
    assert.equal(await gridCard.locator('.zh-creator-avatar').count(),0,'Like the reference, cards show no avatar');
    assert.equal(await gridCard.locator('[data-creator-country] [role="img"][aria-label="India"]').count(),1,'An Indian creator shows the India flag beside the name');
    assert.deepEqual(await gridCard.getByRole('button').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label').split(' ').slice(0,2).join(' '))),['View '+(await gridCard.locator('h3').innerText()).split(' ')[0],'Video call'],'A grid card opens the profile and starts a video call');
    assert.equal(await gridCard.locator('.zh-creator-price').count(),0,'Like the reference, cards show no price');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    for(const theme of ['dark','light']){
      await page.evaluate(mode=>ztSelect(mode==='dark'?ZThemeOriginal.id:ZThemeRose.id),theme);
      for(const width of [320,360,390,768,1280]){
        await page.setViewportSize({width,height:900});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${theme} Home fits ${width}px`);
        assert.equal(await page.locator('article[data-host-id]').evaluateAll(nodes=>nodes.some(node=>node.scrollWidth>node.clientWidth+1)),false,`${theme} creator cards do not overflow at ${width}px`);
        await assertPhotoCardLayout(page,`${theme} Home at ${width}px`);
      }
      if(theme==='light')await page.screenshot({path:path.join(artifacts,'home-simple-desktop.png')});
      await page.setViewportSize({width:390,height:844});
      await page.screenshot({path:path.join(artifacts,`home-simple-mobile-${theme}.png`)});
      const fullFeedHeight=await page.locator('.zh-dashboard').evaluate(node=>Math.ceil(node.getBoundingClientRect().height)+160);
      await page.setViewportSize({width:390,height:fullFeedHeight});
      await page.screenshot({path:path.join(artifacts,`home-reference-mobile-${theme}.png`)});
      await page.setViewportSize({width:390,height:844});
    }

    await page.evaluate(()=>go('all-creators'));
    assert.equal(await page.evaluate(()=>S.v),'all-creators','All Creators opens the full creator profile directory');
    assert.equal(await page.locator('.zac-page article[data-host-id]').count(),5,'All Creators includes every loaded creator once');
    assert.equal(await page.locator('#nav').isVisible(),false,'All Creators uses a Back header without bottom tabs');
    assert.equal(await page.locator('.zac-page').getByRole('button',{name:/^Chat with /}).count(),0,'The full directory has no Chat buttons');
    assert.equal(await page.locator('.zac-page').getByRole('button',{name:/^Video call /}).count(),5,'Every creator in the full directory has a video call button');
    await page.getByRole('button',{name:'Back to home',exact:true}).click();
    await page.evaluate(()=>go('explore'));
    assert.equal(await page.evaluate(()=>S.v),'home','Old Explore routes safely resolve to Home');

    const real=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    real.on('pageerror',e=>errors.push(e.message));
    await real.addInitScript(()=>{window.__sent=[];window.ReactNativeWebView={postMessage:raw=>window.__sent.push(JSON.parse(raw))};});
    await real.goto(pathToFileURL(path.join(root,'assets/aurora.html')).href+'?role=sender');
    assert.equal(await real.locator('article[data-host-id]').count(),0,'production never renders sample creators');
    assert.equal(await real.locator('.zh-preview-note').count(),0);
    const hostId='507f1f77bcf86cd799439011',streamId='507f1f77bcf86cd799439012',giftId='507f1f77bcf86cd799439013',missionId='507f1f77bcf86cd799439014',packId='507f1f77bcf86cd799439015';
    const host={id:hostId,name:'Mila <img src=x onerror=alert(1)>',role:'host',serverRole:'host',category:'Music',tag:'Live & acoustic',online:true,verified:true,availableForCall:true,ratePerMin:0,entryFee:0,stream:{id:streamId,hostId,title:'Evening <script>bad()</script>',category:'Music',kind:'video',viewers:12,createdAt:new Date().toISOString(),status:'live'}};
    const home={hosts:[host],stage:[host],featured:host,total:1,page:1,limit:20,categories:['Music','Talk'],broadcasterCount:1,availableCount:1,speedMatchEnabled:true,bonus:{id:missionId,title:'First broadcast',description:'Stream for one minute',target:1,progress:0,rewardCoins:200,claimed:false},unreadCount:1};
    const receive=(type,data)=>real.evaluate(({type,data})=>Native.receive({type,data}),{type,data});
    const lastSent=type=>real.evaluate(type=>window.__sent.filter(message=>message.type===type).at(-1)?.data,type);
    const acceptProfile=(creator=host)=>acceptCreatorProfile(real,creator);
    const openProfile=async(creator=host)=>{
      await real.getByRole('button',{name:'View '+creator.name+' profile',exact:true}).first().click();
      assert.equal(await real.evaluate(()=>S.v),'host','Discovery opens the selected profile before any action');
      await acceptProfile(creator);
    };
    await receive('session',{user:{id:'507f1f77bcf86cd799439001',name:'Member',role:'sender',serverRole:'user',hostStatus:'none',isVerifiedHost:false},verification:'none',requiresOnboarding:false});
    await receive('data.home',home);await receive('wallet.balance',{coins:1000});
    const catalog={gifts:[{id:giftId,name:'Rose',emoji:'🌹',coins:99,mediaUrl:''}],packs:[{id:packId,name:'Starter',coins:200,pricePaise:9900}],paymentsAvailable:true};await receive('data.catalog',catalog);
    assert.equal(await real.locator('.zh-discover .zh-creator-name>span:first-child').innerText(),host.name);
    assert.equal(await real.locator('.zh-dashboard script,.zh-dashboard img[onerror]').count(),0);
    assert.equal(await real.locator('.zh-person-cost').count(),0,'Home live cards do not expose call pricing');
    // Like the reference, cards carry no price; the rate appears in the call confirmation.
    assert.equal(await real.locator('.zh-creator-price,.zh-featured-price').count(),0,'Cards show no price pill');
    assert.doesNotMatch(await real.locator('.zh-dashboard').innerText(),/\bpremium\b|call rate|coins\s*\/\s*min/i,'Detailed call pricing appears only after opening call confirmation');
    const online={...host,id:'507f1f77bcf86cd799439031',name:'Online host',category:'Talk',stream:null};
    const busy={...online,id:'507f1f77bcf86cd799439032',name:'Online with calls off',availableForCall:false};
    const offline={...online,id:'507f1f77bcf86cd799439033',name:'Offline host',online:false,availableForCall:false};
    const ended={...offline,id:'507f1f77bcf86cd799439034',name:'Ended broadcast',stream:{...host.stream,id:'507f1f77bcf86cd799439035',status:'ended'}};
    await receive('data.home',{...home,hosts:[host,online,busy,offline,ended],stage:[host,ended],total:5});
    assert.equal(await real.locator('.zh-live-section').getByRole('button',{name:/^Join .* live$/}).count(),0,'Streaming discovery stays disabled even with live server metadata');
    assert.equal(await real.locator('.zh-discover article[data-host-id]').count(),5,'Discovery lists every host, online or offline');
    assert.deepEqual(await real.locator('article[data-host-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.hostId)),[host.id,online.id,busy.id,offline.id,ended.id],'Offline hosts are listed and live hosts are not duplicated');
    assert.deepEqual(await real.locator('article[data-host-id] :is(.zh-person-status,.zh-creator-status)').allInnerTexts(),['Online','Online','Online','Online','Online'],'Members never see a host as offline');
    assert.deepEqual(await real.locator('.zh-discover article.zh-creator-card .zh-creator-call').evaluateAll(nodes=>nodes.map(node=>node.disabled)),[false,false,false,false,false],'The video call button stays active for busy and offline hosts');
    assert.equal(await real.getByRole('button',{name:'View '+busy.name+' profile',exact:true}).isEnabled(),true,'Unavailable hosts still open their profile, where chat is offered');
    assert.equal(await real.getByRole('button',{name:'View '+offline.name+' profile',exact:true}).isEnabled(),true,'Offline hosts still open their profile for messaging');
    await openProfile(busy);
    assert.equal(await real.locator('#zu-call').isDisabled(),true,'An online host who turned calls off stays unavailable in the profile');
    await real.getByRole('button',{name:'Back',exact:true}).click();
    await openProfile(offline);
    assert.equal(await real.locator('#zu-call').isEnabled(),true,'An offline host can still be called from their profile; the server rings until missed');
    assert.doesNotMatch(await real.locator('.zu-presence').innerText(),/offline/i,'The profile never presents a host as offline');
    await real.getByRole('button',{name:'Back',exact:true}).click();
    await real.getByRole('tab',{name:'Following',exact:true}).click();
    assert.deepEqual(await lastSent('home.reload'),{page:1,mode:'following'},'Following requests the authenticated followed-user feed');
    assert.equal(await real.getByRole('status',{name:'Loading creators',exact:true}).count(),1,'Filter changes wait for the server feed');
    assert.equal(await real.locator('.zh-region-chips').count(),0,'Following has no country chips');
    await receive('data.home',{...home,hosts:[host,online],stage:[],total:2});
    assert.deepEqual(await real.locator('article[data-host-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.hostId)),[host.id,online.id],'Following displays only the server-provided followed users');
    assert.equal(await real.getByRole('tab',{name:'Following',exact:true}).getAttribute('aria-selected'),'true');
    for(const [tab,mode] of [['For You','foryou'],['New','new']]){
      await real.getByRole('tab',{name:tab,exact:true}).click();
      assert.deepEqual(await lastSent('home.reload'),{page:1,mode},`${tab} requests its own server feed`);
      await receive('data.home',{...home,hosts:[online],stage:[],total:1});
    }
    await real.locator('.zh-region-chips').getByRole('button',{name:'India',exact:true}).click();
    assert.deepEqual(await lastSent('home.reload'),{page:1,mode:'new',country:'India'},'The India chip filters creators on the server');
    assert.equal(await real.locator('.zh-region-chips button[aria-pressed="true"]').innerText(),'India');
    await receive('data.home',{...home,hosts:[],stage:[],featured:null,total:0});
    assert.equal(await real.getByRole('heading',{name:'No creators from India right now',exact:true}).count(),1,'An empty India feed says so');
    await real.locator('.zh-empty-actions').getByRole('button',{name:/Show Popular/}).click();
    assert.deepEqual(await lastSent('home.reload'),{page:1,mode:'new'},'Popular shows creators from every country again');
    await real.getByRole('tab',{name:'Explore',exact:true}).click();
    assert.deepEqual(await lastSent('home.reload'),{page:1,mode:'popular'},'Explore restores the full host feed');
    await receive('data.home',{...home,hosts:[host,online,busy,offline,ended],stage:[host,ended],total:5});
    assert.deepEqual(await real.locator('article[data-host-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.hostId)),[host.id,online.id,busy.id,offline.id,ended.id],'All restores every host without duplicates');
    await openProfile();
    await real.getByRole('button',{name:'Message',exact:true}).click();
    assert.equal(await real.evaluate(()=>S.v),'thread','Chat opens the selected conversation');
    assert.deepEqual(await lastSent('chat.open'),{with:host.id});
    assert.equal(await real.evaluate(()=>window.__sent.filter(m=>m.type==='stream.join'||m.type==='call.start').length),0,'Chat does not start a broadcast or call');
    await real.evaluate(()=>go('home'));
    await receive('data.home',{...home,hosts:[host,online],stage:[host],total:3});
    await real.getByRole('button',{name:'Load more hosts',exact:true}).click();
    assert.deepEqual(await lastSent('home.reload'),{page:2,mode:'popular'},'Home pagination preserves the feed');
    assert.equal(await real.locator('article[data-host-id]').count(),2,'Paging keeps loaded host cards visible');
    assert.equal(await real.getByRole('status',{name:'Loading more hosts',exact:true}).count(),1);
    await receive('data.loading',{resource:'home',loading:false,page:2,error:'More hosts are unavailable'});
    assert.match(await real.getByRole('alert').innerText(),/More hosts are unavailable/);
    assert.equal(await real.locator('article[data-host-id]').count(),2,'A pagination failure retains the loaded hosts');
    await real.getByRole('button',{name:'Retry loading more hosts',exact:true}).click();
    assert.deepEqual(await lastSent('home.reload'),{page:2,mode:'popular'},'Retry requests the failed page');
    await receive('data.home',{...home,hosts:[online,busy],stage:[host],total:3,page:2});
    assert.deepEqual(await real.locator('article[data-host-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.hostId)),[host.id,online.id,busy.id],'Paging deduplicates repeated hosts across featured and discovery cards');
    assert.equal(await real.getByRole('status',{name:'Loading more hosts',exact:true}).count(),0);
    assert.equal(await real.locator('.zh-home-refresh,[aria-label="Refresh home"]').count(),0,'Home has no refresh button');
    const reloads=await real.evaluate(()=>window.__sent.filter(message=>message.type==='home.reload').length);
    await pullToRefresh(real);
    assert.deepEqual(await lastSent('home.reload'),{page:1,mode:'popular'},'Pulling down refreshes every host from the server');
    await pullToRefresh(real);
    assert.equal(await real.evaluate(()=>window.__sent.filter(message=>message.type==='home.reload').length),reloads+1,'A pull cannot start a second refresh while one is pending');
    assert.equal(await real.getByRole('status',{name:'Loading creators',exact:true}).count(),1,'Refresh uses real request skeletons');
    assert.equal(await real.getByRole('status',{name:'Loading live creators',exact:true}).count(),0);
    assert.equal(await real.getByRole('status',{name:'Loading featured creator',exact:true}).count(),0,'There is no featured card to load');
    for(const width of [320,390,768,1280]){
      await real.setViewportSize({width,height:900});
      await assertPhotoCardLayout(real,`Loading Home at ${width}px`);
      assert.equal(await real.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`Loading Home fits ${width}px`);
    }
    await real.setViewportSize({width:390,height:844});
    await receive('data.home',home);
    await real.getByRole('button',{name:'Chat',exact:true}).click();
    assert.equal(await real.evaluate(()=>S.v),'chats');
    await real.getByRole('button',{name:'Home',exact:true}).click();
    await real.getByRole('button',{name:'View '+host.name+' profile',exact:true}).first().click();
    assert.equal(await real.evaluate(()=>S.v),'host','Creator identity always opens the profile even when live');
    assert.equal(await real.evaluate(()=>window.__sent.filter(m=>m.type==='stream.join'||m.type==='call.start').length),0,'Opening a profile never starts a live session or call');
    await acceptProfile();
    await real.getByRole('button',{name:'Back',exact:true}).click();
    const paidHost={...host,stream:null,ratePerMin:25};
    await receive('data.home',{...home,hosts:[paidHost],featured:paidHost,stage:[]});
    assert.equal(await real.locator('.zh-live-section').count(),0,'Online hosts without active broadcasts do not show Live now');
    assert.equal(await real.locator('.zh-person-cost').count(),0,'Paid creator cards keep the price inside call confirmation');
    await openProfile(paidHost);
    await real.locator('#zu-call').click();
    assert.equal(await real.evaluate(()=>S.v),'precall','The profile call action opens confirmation');
    assert.equal(await real.evaluate(()=>window.__sent.filter(m=>m.type==='call.start').length),0,'Opening call setup never starts billing');
    assert.match(await real.locator('.zpc-details').innerText(),/25\s+coins\/min/,'The clicked paid creator shows their server rate before a call can start');
    await real.getByRole('button',{name:'Back',exact:true}).click();
    const freeHost={...host,stream:null};
    await receive('data.home',{...home,hosts:[freeHost],featured:freeHost,stage:[]});
    assert.equal(await real.locator('.zh-person-cost').count(),0,'Free creator cards also hide the pricing label until clicked');
    await openProfile(freeHost);
    await real.locator('#zu-call').click();
    assert.match(await real.locator('.zpc-details').innerText(),/\bFree\b/,'A selected zero-rate creator accurately shows Free in confirmation');
    await real.getByRole('button',{name:'Back',exact:true}).click();
    await receive('data.home',{...home,speedMatchEnabled:false});
    assert.equal(await real.locator('.zh-home-match').count(),0,'The server can disable matching');
    await receive('data.home',home);
    await real.evaluate(()=>homeMatchNow());
    assert.equal(await real.evaluate(()=>window.__sent.filter(m=>m.type==='call.match').length),1);
    assert.equal(await real.evaluate(()=>window.__sent.filter(m=>m.type==='call.start').length),0,'match must not place a call before confirmation');
    await receive('call.matched',{host});
    await real.evaluate(()=>{window.ZimiMedia.prepare=async()=>{};window.ZimiMedia.attach=()=>{};});
    await real.getByRole('button',{name:'Start video call',exact:true}).click();
    assert.deepEqual(await real.evaluate(()=>window.__sent.filter(m=>m.type==='call.start').at(-1)?.data),{to:hostId,voice:false},'Starting the confirmed call targets the selected host with video enabled');
    await real.getByRole('button',{name:'Cancel call',exact:true}).click();
    await real.getByRole('button',{name:'Back',exact:true}).click();
    await real.getByRole('button',{name:'View '+host.name+' profile',exact:true}).first().click();
    await acceptProfile();
    await real.getByRole('button',{name:'Send a gift',exact:true}).click();
    await receive('data.catalog',catalog);
    await real.getByRole('button',{name:/Rose/}).click();
    await real.getByRole('button',{name:'Send gift',exact:true}).click();
    const sentGift=await real.evaluate(()=>window.__sent.filter(m=>m.type==='gift.send').at(-1)?.data);
    assert.equal(sentGift.gift,giftId);assert.match(sentGift.idempotencyKey,/^[a-zA-Z0-9_-]{8,100}$/);
    assert.equal(await real.evaluate(()=>S.bal),1000,'gifts wait for server wallet balance');
    await receive('gift.sent',{gift:giftId,to:hostId,idempotencyKey:sentGift.idempotencyKey});
    await receive('wallet.balance',{coins:901});
    await real.getByRole('button',{name:'Back',exact:true}).click();
    await real.getByRole('button',{name:'Search creators',exact:true}).click();
    await real.getByRole('textbox',{name:'Search creators',exact:true}).fill('new creator');
    await real.waitForFunction(()=>window.__sent.some(m=>m.type==='hosts.search'&&m.data.q==='new creator'));
    await receive('data.search',{q:'new creator',hosts:[{...host,name:'New creator'}],total:1,page:1});
    assert.equal(await real.locator('#home-search-results article.zh-creator-card h3').innerText(),'New creator');
    await receive('data.search',{q:'stale query',hosts:[],total:0,page:1});
    assert.equal(await real.locator('#home-search-results article.zh-creator-card').count(),1,'outdated search responses cannot replace current results');
    await real.getByRole('button',{name:'Back to home',exact:true}).click();
    await receive('session',{user:{id:'507f1f77bcf86cd799439017',name:'Host',role:'host',hostStatus:'approved',isVerifiedHost:true},verification:'verified',requiresOnboarding:false});
    assert.equal(await real.getByRole('button',{name:'Find a match',exact:true}).count(),0,'Creator accounts do not see member matching');
    assert.equal(await real.getByRole('button',{name:'Start a live broadcast',exact:true}).count(),0,'Home remains focused on live and online hosts for creator accounts');
    assert.equal(await real.locator('.zh-dashboard').getByRole('button',{name:/^Chat with /}).count(),0,'Creator accounts see no Chat buttons on cards');
    assert.equal(await real.locator('.zh-dashboard .zh-creator-call').evaluateAll(nodes=>nodes.every(node=>!node.disabled)),true,'Any video call button stays active for creator accounts too');
    await real.evaluate(id=>homeDashboardCall(id),hostId);
    assert.equal(await real.evaluate(()=>S.v),'home','Host accounts cannot initiate member-only calls through the underlying guard');
    await real.evaluate(()=>homeClaim());
    assert.equal(await real.evaluate(()=>window.__sent.filter(m=>m.type==='awards.claim').length),0);
    home.bonus.progress=1;await receive('data.home',home);
    await real.evaluate(()=>homeClaim());
    assert.equal(await real.evaluate(()=>window.__sent.filter(m=>m.type==='awards.claim').at(-1)?.data.task),missionId);
    assert.equal(await real.evaluate(()=>S.bal),901,'rewards wait for authoritative wallet credit');
    assert.equal(await real.locator('.zh-bell,.zh-wallet-icon').count(),0,'Home has no bell or wallet in its header');
    await real.evaluate(()=>homeNotifications());
    await receive('data.notifications',{items:[{id:'507f1f77bcf86cd799439016',title:'A real update',body:'Welcome back',createdAt:new Date().toISOString(),read:false}],unreadCount:1});
    await real.getByRole('button',{name:'Mark all read',exact:true}).click();
    assert.equal(typeof await real.evaluate(()=>window.__sent.filter(m=>m.type==='notifications.readAll').at(-1)?.data.requestId),'number');
    await real.getByRole('button',{name:'Back to home',exact:true}).click();
    await real.evaluate(()=>go('coins'));
    await receive('data.catalog',catalog);
    await real.getByRole('button',{name:'Get 200 coins',exact:true}).click();
    const paymentMethods=real.getByRole('dialog',{name:'Select payment method',exact:true});
    await paymentMethods.waitFor();
    assert.equal(await real.evaluate(()=>window.__sent.filter(m=>m.type==='wallet.checkout').length),0,'Get coins waits for an explicit payment-method confirmation');
    const routeRequest=await lastSent('payments.routes.load');
    assert.equal(typeof routeRequest?.requestId,'number','Payment methods load from the authenticated bridge');
    await receive('payments.routes',{requestId:routeRequest.requestId,mode:'ROTATION',routeChoice:false,routes:[]});
    const secureCheckout=paymentMethods.getByRole('radio',{name:/^Secure checkout/});
    assert.equal(await secureCheckout.isChecked(),false,'A payment method is never selected silently');
    await secureCheckout.check();
    await paymentMethods.getByRole('button',{name:'Continue to payment',exact:true}).click();
    assert.equal(await real.evaluate(()=>window.__sent.filter(m=>m.type==='wallet.checkout').at(-1)?.data.packId),packId);
    assert.equal(await real.evaluate(()=>S.bal),901,'checkout must not credit before provider confirmation');
    await receive('wallet.checkout',{merchantOrderId:'test_order_123',purchaseId:'order',status:'PENDING',idempotencyKey:(await lastSent('wallet.checkout')).idempotencyKey});
    await real.getByRole('button',{name:'Check payment status',exact:true}).click();
    assert.equal(await real.evaluate(()=>window.__sent.filter(m=>m.type==='wallet.verify').at(-1)?.data.merchantOrderId),'test_order_123');
    await real.getByRole('button',{name:'Back to home',exact:true}).click();
    await real.evaluate(()=>{go('live');go('broadcast');homeGoLive();homeStartStream()});
    assert.equal(await real.evaluate(()=>S.v),'home','Direct stream entry points stay closed');
    assert.equal(await real.evaluate(()=>window.__sent.filter(m=>['stream.start','stream.join','stream.request'].includes(m.type)).length),0,'Disabled entry points send no streaming commands');
    await receive('data.home',home);
    await receive('operation.error',{action:'home.reload',message:'Temporarily offline'});
    assert.equal(await real.locator('.zh-error').innerText(),'Temporarily offlineRetry');
    assert.equal(await real.locator('.zh-live-section').count(),0,'A failed feed does not show stale Live now content');
    await real.getByRole('button',{name:'Retry',exact:true}).click();
    assert.equal(await real.getByRole('status',{name:'Loading creators',exact:true}).count(),1);
    await receive('session',{user:{id:'507f1f77bcf86cd799439001',name:'Member',role:'sender',serverRole:'user',hostStatus:'none',isVerifiedHost:false},verification:'none',requiresOnboarding:false});
    const emptyHome={...home,hosts:[],stage:[],featured:null,total:0,broadcasterCount:0,availableCount:0};
    await receive('data.home',emptyHome);
    assert.equal(await real.locator('.zh-live-section').count(),0,'The entire Live now section is absent when nobody is live');
    assert.equal(await real.getByRole('heading',{name:'No hosts to show right now',exact:true}).count(),1,'An empty feed has a distinct useful state');
    assert.equal(await real.locator('article[data-host-id]').count(),0,'An empty feed never substitutes sample hosts');
    assert.equal(await real.locator('.zh-home-empty-scene').getAttribute('aria-hidden'),'true','Empty-state illustration stays decorative');
    assert.equal(await real.getByRole('button',{name:'Start your live',exact:true}).count(),0,'Members cannot start a broadcast from the empty feed');
    await real.emulateMedia({reducedMotion:'reduce'});
    await real.locator('#app-notice').waitFor({state:'hidden'});
    for(const theme of ['dark','light']){
      await real.evaluate(mode=>Native.receive({type:'data.themes',data:{selectedThemeId:mode==='dark'?ZThemeOriginal.id:ZThemeRose.id,items:[ZThemeOriginal,ZThemeRose],premium:{active:false}}}),theme);
      for(const width of [320,390,768]){
        await real.setViewportSize({width,height:900});
        assert.equal(await real.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${theme} empty Home fits ${width}px`);
        const controls=await real.locator('.zh-empty-actions button,.zh-empty-links button').evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,height:b.height,overflow:node.scrollWidth>node.clientWidth+1};}));
        assert.ok(controls.length>=3&&controls.every(b=>b.height>=44&&!b.overflow&&b.left>=0&&b.right<=width+1),`${theme} empty actions fit and remain tappable at ${width}px`);
        assert.equal(controls.some((a,i)=>controls.slice(i+1).some(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)),false,`${theme} empty actions do not overlap at ${width}px`);
      }
      await real.setViewportSize({width:390,height:844});
      await real.screenshot({path:path.join(artifacts,`home-empty-mobile-${theme}.png`)});
    }
    assert.equal(await real.locator('.zh-empty-actions').getByRole('button',{name:/^Check again/}).count(),0,'The empty state relies on pull to refresh');
    await pullToRefresh(real);
    assert.deepEqual(await lastSent('home.reload'),{page:1,mode:'popular'},'Pulling the empty state refreshes the real feed');
    assert.equal(await real.getByRole('status',{name:'Loading creators',exact:true}).count(),1,'Empty-state refresh waits on the request skeleton');
    assert.equal(await real.locator('.zh-live-section').count(),0,'Refreshing an empty feed does not invent a Live now section');
    assert.equal(await real.locator('.zh-home-empty-scene').count(),0,'Loading does not leave a stale empty state visible');
    await receive('data.home',emptyHome);
    await real.getByRole('tab',{name:'Following',exact:true}).click();
    await receive('data.home',emptyHome);
    assert.match(await real.locator('.zh-host-empty h3').innerText(),/follow/i,'Following explains its own empty result');
    await real.getByRole('tab',{name:'Explore',exact:true}).click();
    assert.deepEqual(await lastSent('home.reload'),{page:1,mode:'popular'},'Leaving empty Following requests all hosts');
    assert.equal(await real.getByRole('tab',{name:'Explore',exact:true}).getAttribute('aria-selected'),'true');
    await receive('data.home',emptyHome);
    await real.locator('.zh-empty-actions').getByRole('button',{name:/^All creators/}).click();
    assert.equal(await real.evaluate(()=>S.v),'all-creators','Empty-state discovery opens All Creators');
    assert.equal(await real.getByRole('heading',{name:'All Creators',exact:true}).count(),1);
    assert.equal(await real.locator('#nav').isVisible(),false,'All Creators has Back navigation instead of primary tabs');
    assert.deepEqual(await lastSent('home.reload'),{page:1,mode:'popular'},'All Creators uses the authenticated full creator feed');
    await real.getByRole('button',{name:'Back to home',exact:true}).click();
    await receive('data.home',emptyHome);
    await real.locator('.zh-empty-links').getByRole('button',{name:/^Your chats/}).click();
    assert.equal(await real.evaluate(()=>S.v),'chats','The empty feed links to existing conversations');
    await real.getByRole('button',{name:'Home',exact:true}).click();
    await receive('data.home',emptyHome);
    await real.getByRole('button',{name:'Find a creator',exact:true}).click();
    assert.equal(await real.evaluate(()=>S.v),'search','The empty feed links to real creator search');
    await real.getByRole('button',{name:'Back to home',exact:true}).click();
    await receive('data.home',home);
    await receive('session',{user:{id:'507f1f77bcf86cd799439017',name:'Host',role:'host',hostStatus:'approved',isVerifiedHost:true},verification:'verified',requiresOnboarding:false});
    assert.equal(await real.locator('.zh-nav .zh-create').count(),0,'The tab bar has no call button');
    await real.getByRole('button',{name:'Get ready to go online',exact:true}).click();
    assert.equal(await real.evaluate(()=>S.v),'setup','The Home availability card opens private call availability');
    assert.equal(await real.getByRole('button',{name:'Start a public live instead',exact:true}).count(),0);
    await real.getByRole('button',{name:'Go online for calls',exact:true}).click();
    assert.equal((await lastSent('presence.set')).online,true,'Creator availability still uses the real bridge');
    await real.evaluate(()=>go('home'));
    await testHomeVideoCalls(browser,errors,host,home);
    await real.evaluate(()=>logout());
    assert.equal(await real.evaluate(()=>Home.hosts.length),0,'logout clears home and payment state');
    assert.deepEqual(errors,[]);
    console.log('PASS: profile-first discovery, reference header (Following/Explore/For You/New, Search, trophy), Popular/India chips, square two-column photo grid, All Creators, profile Message/Call routing, pagination/deduplication/retry, responsive skeletons, coin confirmation, wallet recovery, disabled stream entry points, server-only content, XSS escaping, gifts, rewards, checkout and logout.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
