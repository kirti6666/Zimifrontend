/* Host Home shares discovery; Search is one mixed User/Host directory for every account. */
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const hostId='507f1f77bcf86cd799439017',userId='507f1f77bcf86cd799439011',otherId='507f1f77bcf86cd799439012';
const host={user:{id:hostId,name:'Host',role:'host',serverRole:'host',hostStatus:'approved',isVerifiedHost:true,isPhoneVerified:true},verification:'verified',requiresOnboarding:false};
const member={user:{id:otherId,name:'Member',role:'sender',serverRole:'user',hostStatus:'none',isPhoneVerified:true},verification:'none',requiresOnboarding:false};
const person=(id,name,online=false)=>({id,name,role:'sender',serverRole:'user',verified:false,online,availableForCall:true,city:'Pune'});
const creator=(id,name,online=true)=>({id,name,role:'host',serverRole:'host',verified:true,online,availableForCall:true,city:'Delhi',country:'India'});
const creators=Array.from({length:22},(_,index)=>creator((1000+index).toString(16).padStart(24,'0'),'Creator '+(index+1)));
const feed=(hosts=creators.slice(0,5),page=1,total=hosts.length,limit=20)=>({hosts,total,page,limit,stage:[],categories:[],unreadCount:0});
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
  await page.addInitScript(()=>{window.__sent=[];window.ReactNativeWebView={postMessage:raw=>__sent.push(JSON.parse(raw))}});
  await page.goto(pathToFileURL(path.join(root,'assets/aurora.html')).href);
  const receive=(type,data={})=>page.evaluate(msg=>Native.receive(msg),{type,data});
  const sent=type=>page.evaluate(type=>__sent.filter(x=>x.type===type).map(x=>x.data),type);
  const profiles=async(rows,total=rows.length,pageNumber=1,q='',filter='all')=>receive('data.search',{hosts:rows,total,page:pageNumber,filter,q});
  const homeRequests=async()=> (await sent('home.reload')).at(-1);
  await receive('session',host);
  assert.deepEqual(await sent('users.load'),[],'Opening host Home does not load a member directory');
  assert.deepEqual(await sent('hosts.active.load'),[],'Opening host Home does not load a separate active-host directory');
  assert.deepEqual(await sent('profiles.search'),[],'Opening Home does not load profile Search');
  assert.deepEqual(await page.getByRole('tablist',{name:'Home feed'}).getByRole('tab').allInnerTexts(),['Following','Explore','For You','New']);
  assert.equal(await page.locator('.zh-host-tabs,#host-user-search,.zh-host-users').count(),0,'Home matches the feed reference without directory controls');
  assert.equal(await page.getByRole('status',{name:'Loading creators',exact:true}).count(),1);
  await receive('data.home',feed());
  assert.equal(await page.locator('#home-host-grid .zh-creator-card').count(),5,'Server Home data paints for approved hosts');
  assert.equal(await page.getByRole('button',{name:'Get ready to go online',exact:true}).count(),1);
  assert.deepEqual(await page.locator('.zh-region-chips button').allInnerTexts(),['Popular','India']);
  for(const width of [320,390,600,1024]){
   await page.setViewportSize({width,height:844});
   const layout=await page.locator('#home-host-grid').evaluate(grid=>{
    const cards=[...grid.querySelectorAll('.zh-creator-card')],boxes=cards.map(el=>el.getBoundingClientRect());
    const status=document.querySelector('.zh-host-status').getBoundingClientRect(),nav=document.getElementById('nav').getBoundingClientRect();
    return {
     columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,
     square:boxes.every(box=>Math.abs(box.width-box.height)<=1),
     sideBySide:Math.abs(boxes[0].top-boxes[1].top)<=1&&boxes[1].left>boxes[0].right,
     fits:cards.every(el=>{const box=el.getBoundingClientRect();return box.left>=0&&box.right<=innerWidth&&el.scrollWidth<=el.clientWidth+1}),
     actions:cards.every(card=>{const buttons=[...card.querySelectorAll('button')],call=card.querySelector('.zh-creator-call');return buttons.length===2&&!!call&&!call.disabled&&getComputedStyle(call).borderRadius==='999px'}),
     availabilityGap:Math.round((nav.top-status.bottom)*100)/100,
     overflow:document.documentElement.scrollWidth>innerWidth+1
    };
   });
   assert.deepEqual(layout,{columns:2,square:true,sideBySide:true,fits:true,actions:true,availabilityGap:14,overflow:false},'Host Home shares square photo cards and keeps availability above navigation at '+width);
   await page.evaluate(()=>{const root=document.getElementById('scroll-root');root.scrollTop=root.scrollHeight;root.dispatchEvent(new Event('scroll'))});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const reachable=await page.locator('#home-host-grid .zh-creator-card').evaluateAll(cards=>{
    const top=document.getElementById('scroll-root').getBoundingClientRect().top,bottom=document.getElementById('nav').getBoundingClientRect().top;
    return cards.slice(-2).every(card=>{const call=card.querySelector('.zh-creator-call'),box=call.getBoundingClientRect();return box.top>=top&&box.bottom<=bottom&&call.contains(document.elementFromPoint(box.left+box.width/2,box.top+box.height/2))});
   });
   assert.equal(reachable,true,'The last card actions remain visible and tappable above the floating availability button at '+width);
   await page.evaluate(()=>{document.getElementById('scroll-root').scrollTop=0});
  }
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.getByRole('button',{name:/^Chat with |^Voice call /}).count(),0,'Only the reference video action appears on each Home card');
  await page.getByRole('button',{name:'Video call Creator 1',exact:true}).click();
  assert.deepEqual(await sent('call.start'),[],'Reference card appearance does not grant host-to-host calls');
  assert.equal(await page.evaluate(()=>S.v),'home');
  await page.evaluate(()=>document.getElementById('app-notice')?.remove());
  await receive('data.home',feed([{...creators[0],name:'Updated creator'},...creators.slice(1,5)]));
  assert.equal(await page.locator('#home-host-grid .zh-creator-name').first().innerText(),'Updated creator');
  await page.getByRole('tab',{name:'Following',exact:true}).click();
  assert.deepEqual(await homeRequests(),{page:1,mode:'following'});
  assert.equal(await page.locator('.zh-region-chips').count(),0,'Following hides country chips');
  await receive('data.home',feed());
  await page.getByRole('tab',{name:'Explore',exact:true}).click();await receive('data.home',feed());
  await page.locator('.zh-region-chips button').filter({hasText:'India'}).click();
  assert.deepEqual(await homeRequests(),{page:1,mode:'popular',country:'India'});await receive('data.home',feed());
  await page.getByRole('tab',{name:'For You',exact:true}).click();
  assert.deepEqual(await homeRequests(),{page:1,mode:'foryou',country:'India'});await receive('data.home',feed());
  await page.getByRole('tab',{name:'New',exact:true}).click();
  assert.deepEqual(await homeRequests(),{page:1,mode:'new',country:'India'});await receive('data.home',feed());
  await page.locator('.zh-region-chips button').filter({hasText:'Popular'}).click();await receive('data.home',feed());
  await page.getByRole('tab',{name:'Explore',exact:true}).click();await receive('data.home',feed());
  await receive('data.loading',{resource:'home',page:1,loading:false,error:'Home is temporarily unavailable.'});
  assert.match(await page.getByRole('alert').innerText(),/Home is temporarily unavailable/);
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  assert.deepEqual(await homeRequests(),{page:1,mode:'popular'});await receive('data.home',feed());
  await profiles([person(userId,'Late directory response')]);
  assert.equal(await page.locator('#home-host-grid .zh-creator-card').count(),5,'Directory responses never replace host Home');
  assert.equal(await page.locator('.zh-user-row,.zh-directory-card').count(),0);
  await page.getByRole('button',{name:'Get ready to go online',exact:true}).click();
  assert.equal(await page.evaluate(()=>S.v),'setup');await page.evaluate(()=>go('home'));
  await receive('data.home',feed(creators.slice(0,20),1,22));
  await page.evaluate(()=>{window.__firstCard=document.querySelector('#home-host-grid .zh-creator-card');const root=document.getElementById('scroll-root');root.scrollTop=root.scrollHeight;root.dispatchEvent(new Event('scroll'))});
  await page.waitForFunction(()=>__sent.some(x=>x.type==='home.reload'&&x.data.page===2));
  assert.deepEqual(await homeRequests(),{page:2,mode:'popular'},'Approved-host Home automatically requests its next page');
  assert.equal(await page.getByRole('button',{name:/^Load more/}).count(),0);
  assert.equal(await page.locator('#home-host-grid .zh-creator-card').count(),20,'Existing Home cards remain during pagination');
  await receive('data.home',feed(creators.slice(20),2,22));
  assert.equal(await page.locator('#home-host-grid .zh-creator-card').count(),22);
  assert.equal(await page.evaluate(()=>__firstCard===document.querySelector('#home-host-grid .zh-creator-card')),true);
  assert.deepEqual(await sent('users.load'),[],'Feed tabs and pagination never request legacy directories');
  assert.deepEqual(await sent('hosts.active.load'),[]);
  assert.deepEqual(await sent('profiles.search'),[],'Feed tabs and pagination never request profile Search');

  // Search is one mixed User/Host directory for every signed-in account.
  const mixed=[person(userId,'Riya <img src=x onerror=alert(1)>'),creator('507f1f77bcf86cd799439021','Asha',true)];
  await page.evaluate(()=>go('search'));
  assert.deepEqual((await sent('profiles.search')).at(-1),{q:'',page:1,filter:'all'});
  assert.equal(await page.getByRole('status',{name:'Finding profiles',exact:true}).count(),1,'Search exposes its initial loading state');
  assert.equal(await page.getByRole('heading',{name:'Users',exact:true}).count(),1);
  assert.equal(await page.getByPlaceholder('Search by name or ID').getAttribute('maxlength'),'100');
  assert.deepEqual(await page.getByRole('group',{name:'Availability'}).getByRole('button').allInnerTexts(),['All','Online']);
  assert.equal(await page.getByRole('button',{name:'All',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.zh-host-tabs,[role="tablist"][aria-label="Host directory"]').count(),0,'There is no Member or Host category tab');
  assert.equal(await page.getByText(/^(?:Members?|Active Hosts)$/).count(),0,'Search has no Member or Active Hosts category');
  await receive('data.loading',{resource:'search',q:'',page:1,loading:false,error:'Try again shortly.'});
  assert.match(await page.getByRole('alert').innerText(),/Try again shortly/);
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  assert.deepEqual((await sent('profiles.search')).at(-1),{q:'',page:1,filter:'all'});
  await profiles(mixed,3);
  assert.equal(await page.locator('.zh-user-row').count(),2);
  assert.deepEqual(await page.locator('.zh-user-row').evaluateAll(rows=>rows.map(row=>row.dataset.profileRole)),['user','host'],'One list keeps both profile roles');
  assert.equal(await page.locator('.zh-user-identity strong').first().innerText(),'Riya <img src=x onerror=alert(1)>');
  assert.equal(await page.locator('.zh-user-identity img').count(),0,'Names remain escaped text');
  assert.deepEqual(await page.locator('.zh-user-identity small').allInnerTexts(),['Offline','Online']);
  assert.equal(await page.locator('.zh-user-actions,[aria-label^="Chat with"],[aria-label^="Voice call"],[aria-label^="Video call"]').count(),0,'Rows contain profile navigation only');
  for(const width of [320,390,600]){
   await page.setViewportSize({width,height:844});
   const layout=await page.locator('.zh-user-row').evaluateAll(rows=>rows.map(row=>{const box=row.getBoundingClientRect(),avatar=row.querySelector('.zh-user-avatar').getBoundingClientRect();return {fits:box.left>=0&&box.right<=innerWidth&&row.scrollWidth<=row.clientWidth+1,height:Math.round(box.height),avatar:Math.round(avatar.width),round:getComputedStyle(row.querySelector('.zh-user-avatar')).borderRadius,buttons:row.querySelectorAll('button').length}}));
   assert.equal(layout.every(row=>row.fits&&row.height<=60&&row.avatar===36&&row.round==='999px'&&row.buttons===1),true,'Compact Search rows fit '+width+'px');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Search never overflows at '+width+'px');
  }
  await page.setViewportSize({width:390,height:844});

  // Pagination is shared across roles and deduplicates stable IDs.
  await page.getByRole('button',{name:'Load more users',exact:true}).click();
  assert.deepEqual((await sent('profiles.search')).at(-1),{q:'',page:2,filter:'all'});
  const third=person('507f1f77bcf86cd799439013','Third user',true);
  await profiles([mixed[1],third],3,2);
  assert.equal(await page.locator('.zh-user-row').count(),3,'Mixed pagination deduplicates IDs');

  // Role-correct row taps open the matching public-profile route.
  await page.getByRole('button',{name:'View Asha profile',exact:true}).click();
  assert.equal(await page.evaluate(()=>S.v),'host');
  assert.equal((await sent('profile.load')).at(-1).id,mixed[1].id);
  await page.evaluate(()=>go('search'));await profiles(mixed,2);
  await page.getByRole('button',{name:/^View Riya .* profile$/}).click();
  assert.equal(await page.evaluate(()=>S.v),'user');
  assert.equal((await sent('profile.load')).at(-1).id,userId);
  await page.evaluate(()=>go('search'));await profiles(mixed,2);

  // Typing is debounced; unrelated and stale results cannot replace the query.
  const beforeTyping=(await sent('profiles.search')).length;
  await page.locator('#sq').fill('As');await page.locator('#sq').fill('Asha');
  const focused=await page.locator('#sq').elementHandle();
  await receive('data.home',{...feed(),background:true});
  assert.equal(await focused.evaluate(el=>el.isConnected&&document.activeElement===el&&el.value==='Asha'&&el.selectionStart===4),true,'Background Home data preserves Search focus and caret');
  await page.waitForFunction(()=>__sent.some(x=>x.type==='profiles.search'&&x.data.q==='Asha'));
  const typed=(await sent('profiles.search')).slice(beforeTyping);
  assert.equal(typed.some(request=>request.q==='As'),false,'Intermediate text is not requested');
  await profiles([person(otherId,'Stale')],1,1,'As','all');
  assert.equal(await page.locator('.zh-user-row').count(),0,'A stale query is ignored while the latest query loads');
  await profiles([mixed[1]],1,1,'Asha','all');
  assert.equal(await page.locator('.zh-user-identity strong').innerText(),'Asha');

  // Online is a server filter, not a Host category, and stale All data is ignored.
  await page.getByRole('button',{name:'Online',exact:true}).click();
  assert.deepEqual((await sent('profiles.search')).at(-1),{q:'Asha',page:1,filter:'online'});
  assert.equal(await page.getByRole('button',{name:'Online',exact:true}).getAttribute('aria-pressed'),'true');
  await profiles([person(otherId,'Wrong filter')],1,1,'Asha','all');
  assert.equal(await page.locator('.zh-user-row').count(),0);
  await profiles([mixed[1]],1,1,'Asha','online');
  assert.equal(await page.locator('.zh-user-row').count(),1);
  await profiles([],0,1,'Asha','online');
  assert.match(await page.locator('#home-search-results').innerText(),/No users online/);
  await page.getByRole('button',{name:'All',exact:true}).click();
  assert.deepEqual((await sent('profiles.search')).at(-1),{q:'Asha',page:1,filter:'all'});
  await profiles([],0,1,'Asha','all');
  assert.match(await page.locator('#home-search-results').innerText(),/No users found/);
  assert.doesNotMatch(await page.locator('#screen').innerText(),/\bMembers?\b/,'Search exposes no Member category or copy');
  assert.deepEqual(await sent('users.load'),[],'Unified Search never calls the legacy User-only directory');
  assert.deepEqual(await sent('hosts.active.load'),[],'Unified Search never calls the legacy Active Hosts directory');

  // An ordinary user gets the same mixed Search surface.
  await receive('session',member);
  await page.evaluate(()=>{S.sq='';Home.searchFilter='all';go('home')});
  await receive('data.home',feed([creator(hostId,'A creator',false)]));
  await page.evaluate(()=>go('search'));
  assert.deepEqual((await sent('profiles.search')).at(-1),{q:'',page:1,filter:'all'});
  await profiles([person(userId,'Riya'),creator(hostId,'A creator',false)],2);
  assert.equal(await page.getByRole('heading',{name:'Users',exact:true}).count(),1);
  assert.deepEqual(await page.locator('.zh-user-row').evaluateAll(rows=>rows.map(row=>row.dataset.profileRole)),['user','host']);
  assert.equal(await page.locator('.zh-host-tabs').count(),0);
  assert.deepEqual(errors,[]);await page.close();
  console.log('PASS Home stays shared for hosts; unified Search shows User and Host profiles to both roles with All/Online server filters, compact safe rows, stable pagination, debounce, stale-response isolation, retry and role-correct profile navigation');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
