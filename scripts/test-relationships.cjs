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
const avatarUrl='https://media.example.test/connection-avatar.webp',brokenAvatarUrl='https://media.example.test/missing-connection-avatar.webp';
const referenceNames=['Jahrul Ansari','Manohar Lal Manohar Lal','Manisha','Karan Kumar','Nitin Patel','Karan','Ashok Ukey','Same','Ritik','Tesdghvh'];

(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
  const errors=[];
  try{
    for(const role of ['sender','host']){
      const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
      page.setDefaultTimeout(6000);page.on('pageerror',error=>errors.push(error.message));
      await page.route('https://**/*',route=>route.abort());
      await page.route(avatarUrl,route=>route.fulfill({path:path.join(root,'web/onboarding-media/india-1.webp'),contentType:'image/webp'}));
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
      assert.equal(await page.getByRole('dialog',{name:'Your connections',exact:true}).count(),1);
      assert.equal(await page.getByRole('button',{name:'Back to profile',exact:true}).count(),1,'Connections has the reference Back header');
      assert.equal(await page.getByRole('button',{name:'Close',exact:true}).count(),0,'The full-page list uses Back');
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
      await receive(page,'data.relationships',{...retried,id:id(1),users:[{...peer(2,'First creator'),avatarUrl}],page:1,total:2,limit:1});
      await page.getByRole('button',{name:'Load more',exact:true}).click();
      const more=await last(page,'relationships.load');
      assert.equal(more.page,2);
      await page.getByRole('status',{name:'Loading following',exact:true}).waitFor();
      assert.equal(await page.getByText('First creator',{exact:true}).count(),1,'Pagination preserves the already loaded rows');
      await receive(page,'data.relationships',{...more,id:id(1),users:[{...peer(2,'First creator'),avatarUrl},{...peer(3,'Private member',false),serverRole:'user',role:'sender',verified:false,city:undefined,avatarUrl:brokenAvatarUrl}],page:2,total:2,limit:1});
      assert.equal(await page.locator('.zu-relationship-list>li').count(),2,'Repeated rows are deduplicated');
      assert.equal(await page.getByRole('button',{name:"View Private member's profile",exact:true}).count(),0,'A list never grants access to a private member profile');
      assert.equal(await page.getByRole('button',{name:'Load more',exact:true}).count(),0);
      await page.waitForFunction(()=>{const img=document.querySelector('.zu-relationship-avatar img');return img?.complete&&img.naturalWidth>0});
      await page.waitForFunction(()=>!document.querySelector('.zu-relationship-list>li:last-child .zu-relationship-avatar img'));
      assert.equal(await page.locator('.zu-relationship-list>li:last-child .zu-relationship-avatar').innerText(),'PM','A failed photo reveals the member initials');
      assert.equal(await page.locator('.zu-relationship-avatar svg').count(),0,'Initial avatars replace generic silhouettes only in connections');
      assert.equal(await page.locator('.zu-relationship-list>li:last-child .zu-relationship-name small').innerText(),'Member');
      assert.equal(await page.locator('.zu-relationship-list>li:last-child .zu-relationship-row>svg').count(),0,'Private members have no navigation arrow');
      for(const width of [320,390,768]){
        await page.setViewportSize({width,height:844});
        const layout=await page.evaluate(()=>{
          const dialog=document.querySelector('.zu-relationships-dialog'),box=dialog.getBoundingClientRect(),tabs=dialog.querySelector('.zu-relationship-tabs');
          return {
            fullPage:Math.abs(box.left)<1&&Math.abs(box.top)<1&&Math.abs(box.width-innerWidth)<1&&Math.abs(box.height-innerHeight)<1,
            overflow:document.documentElement.scrollWidth>innerWidth+1||dialog.scrollWidth>dialog.clientWidth+1,
            tabs:Math.abs(tabs.getBoundingClientRect().height-48)<1&&[...tabs.querySelectorAll('button')].every(button=>Math.abs(button.getBoundingClientRect().height-40)<1),
            rows:[...dialog.querySelectorAll('.zu-relationship-row')].every(row=>{const bounds=row.getBoundingClientRect(),avatar=row.querySelector('.zu-relationship-avatar').getBoundingClientRect();return bounds.height>=72&&Math.abs(avatar.width-48)<1&&Math.abs(avatar.height-48)<1&&bounds.right<=box.right&&row.scrollWidth<=row.clientWidth+1})
          };
        });
        assert.deepEqual(layout,{fullPage:true,overflow:false,tabs:true,rows:true},'Full-page connections and row controls fit '+width);
      }
      const dir=path.join(root,'artifacts','relationships');fs.mkdirSync(dir,{recursive:true});
      await page.setViewportSize({width:390,height:844});
      await page.screenshot({path:path.join(dir,`${role}-following.png`)});
      await page.getByRole('tab',{name:'Followers',exact:true}).click();
      const fresh=await last(page,'relationships.load');
      assert.equal(await page.getByRole('tab',{name:'Followers',exact:true}).getAttribute('aria-selected'),'true');
      assert.equal(await page.getByRole('tab',{name:'Following',exact:true}).getAttribute('aria-selected'),'false');
      const referenceRows=referenceNames.map((name,index)=>({...peer(21+index,name),serverRole:[7,9].includes(index)?'host':'user',role:[7,9].includes(index)?'host':'sender',verified:[7,9].includes(index),city:index===8?'Delhi':undefined}));
      await receive(page,'data.relationships',{...fresh,id:id(1),users:referenceRows,page:1,total:referenceRows.length,limit:20});
      assert.deepEqual(await page.locator('.zu-relationship-avatar').allInnerTexts(),['JA','ML','M','KK','NP','K','AU','S','R','T'],'Names produce readable one- or two-letter initials');
      assert.equal(await page.locator('.zu-relationship-list>li').nth(7).locator('small').innerText(),'Creator');
      assert.equal(await page.locator('.zu-relationship-list>li').nth(8).locator('small').innerText(),'Delhi','Server city remains the preferred subtitle');
      assert.equal(await page.locator('.zu-relationship-avatar').evaluateAll(avatars=>new Set(avatars.slice(0,6).map(avatar=>getComputedStyle(avatar).backgroundColor)).size),6,'Initial avatars use the six reference pastel colors');
      const lightBackground=await page.locator('.zu-relationships-dialog').evaluate(dialog=>getComputedStyle(dialog).backgroundColor);
      await page.evaluate(()=>ZimiThemes.setDark(true));
      assert.notEqual(await page.locator('.zu-relationships-dialog').evaluate(dialog=>getComputedStyle(dialog).backgroundColor),lightBackground,'The full-page surface follows Dark Mode');
      const darkContrast=await page.locator('.zu-relationship-avatar').evaluateAll(avatars=>{
        const luminance=value=>{const rgb=value.match(/[\d.]+/g).slice(0,3).map(Number).map(channel=>value.startsWith('color(')?channel:channel/255);return rgb.map(channel=>channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4).reduce((sum,channel,index)=>sum+channel*[.2126,.7152,.0722][index],0)};
        return avatars.map(avatar=>{const style=getComputedStyle(avatar),light=luminance(style.color),dark=luminance(style.backgroundColor);return (Math.max(light,dark)+.05)/(Math.min(light,dark)+.05)});
      });
      assert.ok(darkContrast.every(ratio=>ratio>=4.5),'Initial avatars retain readable text contrast in Dark Mode');
      if(role==='host')await page.screenshot({path:path.join(dir,'reference-followers-dark.png')});
      await page.evaluate(()=>ZimiThemes.setDark(false));
      if(role==='host')await page.screenshot({path:path.join(dir,'reference-followers.png')});
      const attack='<img src=x onerror=window.__relationshipXss=true>';
      await receive(page,'data.relationships',{...fresh,id:id(1),users:[peer(4,attack)],page:1,total:1,limit:20});
      assert.equal(await page.getByText(attack,{exact:true}).count(),1,'Relationship names render as text');
      assert.equal(await page.evaluate(()=>window.__relationshipXss),undefined);
      await page.getByRole('button',{name:'Back to profile',exact:true}).click();
      await receive(page,'data.relationships',{...fresh,id:id(1),users:[peer(4,'Late result')],page:1,total:1,limit:20});
      assert.equal(await page.locator('#zu-dialog').count(),0,'A late response cannot reopen a closed list');
      await page.getByRole('button',{name:'View your followers',exact:true}).click();
      const empty=await last(page,'relationships.load');
      await receive(page,'data.relationships',{...empty,id:id(1),users:[],page:1,total:0,limit:20});
      await page.getByRole('heading',{name:'No followers yet',exact:true}).waitFor();
      await page.keyboard.press('Escape');
      await page.locator('#zu-dialog').waitFor({state:'detached'});
      assert.equal(await page.locator('#zu-dialog').count(),0,'Escape returns from the full-page list');
      await receive(page,'data.relationships',{...empty,id:id(1),users:[peer(4,'Late after Escape')],page:1,total:1,limit:20});
      assert.equal(await page.locator('#zu-dialog').count(),0,'Escape cannot be undone by an old response');
      await page.getByRole('button',{name:'View your followers',exact:true}).click();
      await page.evaluate(()=>ZimiNavigation.back());
      await page.locator('#zu-dialog').waitFor({state:'detached'});
      assert.equal(await page.evaluate(()=>S.v),'profile','Android Back dismisses the list before leaving the profile');
      assert.equal(await page.locator('#zu-dialog').count(),0);
      await page.getByRole('button',{name:'View your followers',exact:true}).click();
      await receive(page,'session.none',{});
      assert.equal(await page.locator('#zu-dialog').count(),0,'Signing out closes private lists');
      assert.equal(await page.evaluate(()=>ZuRelationships.users.length),0,'Signing out clears cached private rows');
      await page.close();
    }
    assert.deepEqual(errors,[]);
    console.log('PASS relationship lists: reference full-page layout, responsive segmented tabs/rows, initials and photo fallback, themes, member/host access, loading/retry/pagination, privacy, escaping, Back/Escape/native dismissal and stale/session isolation');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
