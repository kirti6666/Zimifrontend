const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const ownerId='507f1f77bcf86cd799439001';
const receive=(page,type,data={})=>page.evaluate(message=>Native.receive(message),{type,data});
const last=(page,type)=>page.evaluate(type=>[...__sent].reverse().find(message=>message.type===type)?.data,type);
const photo=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=','base64');
const savedCover='https://media.fixture.test/new-cover.jpg';
async function loadProfile(page,account){
  await page.evaluate(()=>go('profile'));
  const request=await last(page,'profile.load');
  await receive(page,'data.publicProfile',{...request,profile:{...account.user,verified:account.user.isVerifiedHost,followers:2,followingCount:3,following:false,languages:[],interests:[],joined:'2026-01-01T00:00:00Z'}});
  const posts=await last(page,'profile.posts.load');if(posts)await receive(page,'data.publicPosts',{...posts,posts:[],total:0,page:1,limit:12});
}
async function choose(page,button='Change cover photo',file={name:'cover.png',mimeType:'image/png',buffer:photo}){
  const pending=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:button,exact:true}).click();
  const picker=await pending;await picker.setFiles(file);
  await page.waitForFunction(()=>!ZuCover.preparing);
}
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
  const errors=[];
  try{
    for(const role of ['sender','host']){
      const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});page.setDefaultTimeout(6000);
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('https://**/*',route=>route.fulfill({status:200,contentType:'image/png',body:photo}));
      await page.addInitScript(()=>{window.__sent=[];window.ReactNativeWebView={postMessage:raw=>__sent.push(JSON.parse(raw))}});
      await page.goto(pathToFileURL(path.join(root,'assets/aurora.html')).href);
      const account={user:{id:ownerId,name:'Asha',role,serverRole:role==='host'?'host':'user',hostStatus:role==='host'?'approved':'none',isVerifiedHost:role==='host',avatarUrl:'https://media.fixture.test/avatar.jpg',coverUrl:'https://media.fixture.test/cover.jpg',...(role==='host'?{creatorCardUrl:'https://media.fixture.test/card.jpg',creatorCardKey:'creator-cards/owner/card.jpg'}:{})},verification:role==='host'?'verified':'none',requiresOnboarding:false};
      await receive(page,'session',account);await receive(page,'data.home',{hosts:[],stage:[],total:0,page:1,categories:[]});
      await loadProfile(page,account);
      await choose(page);
      assert.equal(await page.evaluate(()=>S.v),'profile','The cover button opens the picker without leaving the profile');
      await page.getByRole('heading',{name:'Change cover',exact:true}).waitFor();
      assert.match(await page.locator('.zu-cover-preview').getAttribute('src'),/^data:image\/jpeg;base64,/);
      assert.equal(await page.locator('.zu-cover-photo').getAttribute('src'),account.user.coverUrl,'A preview does not overwrite the saved cover');
      assert.equal(await last(page,'profile.cover.save'),undefined,'Choosing a photo waits for Save cover');
      await page.getByRole('button',{name:'Cancel',exact:true}).click();
      assert.equal(await page.locator('#zu-dialog').count(),0);assert.equal(await page.evaluate(()=>ZuCover.photo),'');
      await page.evaluate(()=>{window.__originalCoverReader=obReadPhoto;obReadPhoto=()=>new Promise(resolve=>window.__finishCoverPreparation=resolve)});
      const preparingPicker=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Change cover photo',exact:true}).click();
      await (await preparingPicker).setFiles({name:'cover.png',mimeType:'image/png',buffer:photo});
      await page.waitForFunction(()=>ZuCover.preparing);
      await page.evaluate(()=>{go('home');window.__finishCoverPreparation('data:image/jpeg;base64,AAAA');obReadPhoto=window.__originalCoverReader});
      await page.waitForTimeout(20);
      assert.equal(await page.evaluate(()=>ZuCover.preparing),false,'Leaving during preparation releases the picker state');
      assert.equal(await page.locator('#zu-dialog').count(),0,'A late image preparation cannot reopen its editor after navigation');
      await loadProfile(page,account);
      await choose(page,'Change cover photo',{name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('not an image')});
      await page.getByRole('alert').filter({hasText:'Choose an image file'}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Save cover',exact:true}).isDisabled(),true);
      await choose(page,'Choose another photo');
      const directory=path.join(root,'artifacts','cover-photo');fs.mkdirSync(directory,{recursive:true});
      for(const width of [320,390]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)}
      await page.screenshot({path:path.join(directory,`${role}-preview.png`)});
      await page.getByRole('button',{name:'Save cover',exact:true}).click();
      const first=await last(page,'profile.cover.save');assert.ok(first.photo.startsWith('data:image/jpeg;base64,'));
      assert.deepEqual(Object.keys(first).sort(),['photo','requestId']);assert.equal(await last(page,'profile.save'),undefined,'Cover-only saves do not overwrite profile text');
      await page.keyboard.press('Escape');assert.equal(await page.locator('#zu-dialog').count(),1,'Pending saves remain visible');
      assert.equal(await page.getByRole('button',{name:'Cancel',exact:true}).isDisabled(),true);
      await receive(page,'profile.cover.error',{requestId:first.requestId,message:'Storage unavailable. Retry.'});
      await page.getByRole('alert').filter({hasText:'Storage unavailable'}).waitFor();
      assert.ok(await page.locator('.zu-cover-preview').getAttribute('src'),'Failed uploads retain the selected image');
      await page.getByRole('button',{name:'Save cover',exact:true}).click();
      const retry=await last(page,'profile.cover.save');assert.notEqual(retry.requestId,first.requestId);
      const updated={...account,user:{...account.user,coverUrl:savedCover,coverKey:'covers/owner/new.jpg'}};
      await receive(page,'profile.cover.saved',{requestId:first.requestId,account:updated});
      assert.equal(await page.evaluate(()=>ZuCover.saving),true,'An old acknowledgement cannot complete a retry');
      await page.evaluate(()=>{S.avatarData='data:image/png;base64,AAAA';S.mediaDirty={avatar:true};S.editName='Unsaved draft name'});
      await receive(page,'profile.cover.saved',{requestId:retry.requestId,account:updated});
      assert.equal(await page.locator('#zu-dialog').count(),0);
      assert.equal(await page.evaluate(()=>S.v),'profile');assert.equal(await page.locator('.zu-cover-photo').getAttribute('src'),savedCover);
      if(role==='host'){
        assert.equal(await page.evaluate(()=>S.user.creatorCardUrl),account.user.creatorCardUrl,'Saving the cover preserves the separately saved creator card');
        assert.equal(await page.evaluate(()=>S.user.creatorCardKey),account.user.creatorCardKey);
      }
      assert.equal(await page.evaluate(()=>S.mediaDirty.avatar),true);assert.equal(await page.evaluate(()=>S.avatarData),'data:image/png;base64,AAAA');assert.equal(await page.evaluate(()=>S.editName),'Unsaved draft name');
      await choose(page);await page.getByRole('button',{name:'Save cover',exact:true}).click();
      const retired=await last(page,'profile.cover.save');
      if(role==='host')await receive(page,'session',{...account,user:{...account.user,id:'507f1f77bcf86cd799439099',name:'Next account'}});
      else await receive(page,'session.none',{});
      await receive(page,'profile.cover.saved',{requestId:retired.requestId,account:updated});
      assert.equal(await page.evaluate(()=>ZuCover.photo),'');assert.equal(await page.evaluate(()=>ZuCover.saving),false);assert.equal(await page.locator('#zu-dialog').count(),0);
      await page.close();
    }
    const discovery=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    discovery.on('pageerror',error=>errors.push(error.message));
    await discovery.route('https://**/*',route=>route.fulfill({status:200,contentType:'image/png',body:photo}));
    await discovery.addInitScript(()=>{window.__sent=[];window.ReactNativeWebView={postMessage:raw=>__sent.push(JSON.parse(raw))}});
    await discovery.goto(pathToFileURL(path.join(root,'assets/aurora.html')).href);
    await receive(discovery,'session',{user:{id:ownerId,name:'Member',role:'sender',serverRole:'user'},verification:'none',requiresOnboarding:false});
    const cardHost={id:'507f1f77bcf86cd799439011',name:'Card host',role:'host',serverRole:'host',verified:true,online:true,availableForCall:true,avatarUrl:'https://media.fixture.test/host-avatar.jpg',coverUrl:'https://media.fixture.test/profile-cover.jpg',creatorCardUrl:'https://media.fixture.test/discovery-card.jpg'};
    const avatarHost={...cardHost,id:'507f1f77bcf86cd799439012',name:'Avatar host',creatorCardUrl:null};
    await receive(discovery,'data.home',{hosts:[cardHost,avatarHost],stage:[],total:2,page:1,categories:[]});
    const cardTile=discovery.locator(`.zh-creator-card[data-host-id="${cardHost.id}"] .zh-photo`);
    assert.equal(await cardTile.getAttribute('src'),cardHost.creatorCardUrl,'Discovery renders the saved card when its profile cover differs');
    assert.equal(await discovery.locator(`.zh-creator-card[data-host-id="${avatarHost.id}"] .zh-photo`).getAttribute('src'),avatarHost.avatarUrl,'A creator without a card uses the avatar, never the profile cover');
    await discovery.evaluate(id=>go('host',id),cardHost.id);
    const profileRequest=await last(discovery,'profile.load');
    const {creatorCardUrl:omittedCard,...publicProfile}=cardHost;
    await receive(discovery,'data.publicProfile',{...profileRequest,profile:{...publicProfile,followers:0,followingCount:0,following:false,languages:[],interests:[]}});
    assert.equal(await discovery.locator('.zu-cover-photo').getAttribute('src'),cardHost.coverUrl,'The public profile renders its cover independently of discovery');
    await discovery.evaluate(()=>go('home'));
    assert.equal(await cardTile.getAttribute('src'),cardHost.creatorCardUrl,'Returning from a public profile without card metadata preserves the known creator card');
    await discovery.close();
    assert.deepEqual(errors,[]);console.log('PASS inline cover photo: direct picker, preview/cancel, confirmed cover-only save, retry, stale isolation and preserved drafts for members and hosts');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
