const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const id=n=>String(n).padStart(24,'0');
const receive=(page,type,data)=>page.evaluate(message=>Native.receive(message),{type,data});
const last=(page,type)=>page.evaluate(type=>[...__sent].reverse().find(message=>message.type===type)?.data,type);
const peer=(number,name,canViewProfile=true)=>({id:id(number),name,serverRole:'host',role:'host',verified:true,city:'Pune',canViewProfile});

(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
  const errors=[];
  try{
    for(const role of ['sender','host']){
      const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
      page.setDefaultTimeout(6000);page.on('pageerror',error=>errors.push(error.message));
      await page.route('https://**/*',route=>route.abort());
      await page.addInitScript(()=>{window.__sent=[];window.ReactNativeWebView={postMessage:raw=>__sent.push(JSON.parse(raw))}});
      await page.goto(pathToFileURL(path.join(root,'assets/aurora.html')).href);
      const account={user:{id:id(1),name:'Your account',role,serverRole:role==='host'?'host':'user',hostStatus:role==='host'?'approved':'none',isVerifiedHost:role==='host'},verification:role==='host'?'verified':'none',requiresOnboarding:false};
      await receive(page,'session',account);
      await receive(page,'wallet.balance',{coins:100,earned:0});
      await receive(page,'data.home',{hosts:[],stage:[],total:0,page:1,categories:[],unreadCount:0});
      await page.locator('#nav').getByRole('button',{name:'Profile',exact:true}).click();
      const profileRequest=await last(page,'profile.load');
      await receive(page,'data.publicProfile',{...profileRequest,profile:{...account.user,verified:role==='host',followers:3,followingCount:2,following:false,languages:[],interests:[],joined:'2026-01-01T00:00:00Z'}});
      const posts=await last(page,'profile.posts.load');
      if(posts)await receive(page,'data.publicPosts',{...posts,posts:[],page:1,total:0,limit:12});
      await page.getByRole('button',{name:'View your followers',exact:true}).click();
      await page.getByRole('status',{name:'Loading followers',exact:true}).waitFor();
      const followers=await last(page,'relationships.load');
      assert.deepEqual({kind:followers.kind,page:followers.page},{kind:'followers',page:1});
      assert.equal('id' in followers,false,'The screen cannot choose a different list owner');
      await page.getByRole('tab',{name:'Followers',exact:true}).focus();
      await page.keyboard.press('ArrowRight');
      const following=await last(page,'relationships.load');
      await receive(page,'data.loading',{resource:'relationships',id:id(1),requestId:following.requestId,loading:true});
      assert.equal(await page.evaluate(()=>document.activeElement.id),'zu-relationships-following','Loading retains keyboard tab focus');
      await receive(page,'data.relationships',{...followers,id:id(1),users:[peer(2,'Stale follower')],page:1,total:1,limit:20});
      assert.equal(await page.getByText('Stale follower',{exact:true}).count(),0,'A retired tab request cannot replace the selected list');
      await receive(page,'data.loading',{resource:'relationships',id:id(1),requestId:following.requestId,loading:false,error:'Connections unavailable'});
      await page.getByRole('alert').filter({hasText:'Connections unavailable'}).waitFor();
      assert.equal(await page.getByText('You’re not following anyone yet',{exact:true}).count(),0,'An error does not become an empty list');
      await page.getByRole('button',{name:'Try again',exact:true}).click();
      const retried=await last(page,'relationships.load');
      assert.notEqual(retried.requestId,following.requestId);
      await receive(page,'data.relationships',{...retried,id:id(1),users:[peer(2,'First creator')],page:1,total:2,limit:1});
      await page.getByRole('button',{name:'Load more',exact:true}).click();
      const more=await last(page,'relationships.load');
      assert.equal(more.page,2);
      await page.getByRole('status',{name:'Loading following',exact:true}).waitFor();
      assert.equal(await page.getByText('First creator',{exact:true}).count(),1,'Pagination preserves the already loaded rows');
      await receive(page,'data.relationships',{...more,id:id(1),users:[peer(2,'First creator'),{...peer(3,'Private member',false),serverRole:'user',role:'sender',verified:false,city:undefined}],page:2,total:2,limit:1});
      assert.equal(await page.locator('.zu-relationship-list>li').count(),2,'Repeated rows are deduplicated');
      assert.equal(await page.getByRole('button',{name:"View Private member's profile",exact:true}).count(),0,'A list never grants access to a private member profile');
      assert.equal(await page.getByRole('button',{name:'Load more',exact:true}).count(),0);
      for(const width of [320,390,768]){
        await page.setViewportSize({width,height:844});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Connection list fits the viewport');
      }
      const dir=path.join(root,'artifacts','relationships');fs.mkdirSync(dir,{recursive:true});
      await page.setViewportSize({width:390,height:844});
      await page.screenshot({path:path.join(dir,`${role}-following.png`)});
      await page.getByRole('tab',{name:'Followers',exact:true}).click();
      const fresh=await last(page,'relationships.load');
      const attack='<img src=x onerror=window.__relationshipXss=true>';
      await receive(page,'data.relationships',{...fresh,id:id(1),users:[peer(4,attack)],page:1,total:1,limit:20});
      assert.equal(await page.getByText(attack,{exact:true}).count(),1,'Relationship names render as text');
      assert.equal(await page.evaluate(()=>window.__relationshipXss),undefined);
      await page.getByRole('button',{name:'Close',exact:true}).click();
      await receive(page,'data.relationships',{...fresh,id:id(1),users:[peer(4,'Late result')],page:1,total:1,limit:20});
      assert.equal(await page.locator('#zu-dialog').count(),0,'A late response cannot reopen a closed list');
      await page.getByRole('button',{name:'View your followers',exact:true}).click();
      const empty=await last(page,'relationships.load');
      await receive(page,'data.relationships',{...empty,id:id(1),users:[],page:1,total:0,limit:20});
      await page.getByRole('heading',{name:'No followers yet',exact:true}).waitFor();
      await receive(page,'session.none',{});
      assert.equal(await page.locator('#zu-dialog').count(),0,'Signing out closes private lists');
      assert.equal(await page.evaluate(()=>ZuRelationships.users.length),0,'Signing out clears cached private rows');
      await page.close();
    }
    assert.deepEqual(errors,[]);
    console.log('PASS relationship lists: member/host access, tabs, loading, retry, pagination, privacy, escaping and stale/session isolation');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
