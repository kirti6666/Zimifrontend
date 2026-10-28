/* Own Profile uses the public profile layout while keeping account editing and
   uploads behind the existing confirmed-save bridge. All traffic stays local. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const ownerId = '507f1f77bcf86cd799439001';
const peerId = '507f1f77bcf86cd799439011';
const media = suffix => `https://media.fixture.test/${suffix}.jpg`;
const member = {
  user: { id:ownerId, name:'Asha Sharma', city:'Pune', about:'Here for good conversations.', languages:['Hindi','English'], role:'sender', serverRole:'user', hostStatus:'none', isVerifiedHost:false, isPhoneVerified:true, avatarUrl:media('avatar'), coverUrl:media('cover') },
  verification:'none', requiresOnboarding:false
};
const publicProfile = (account=member) => ({
  ...account.user, verified:account.user.isVerifiedHost, followers:17, followingCount:5,
  online:account.user.isVerifiedHost, availableForCall:account.user.isVerifiedHost,
  ratePerMin:0, joined:'2025-04-12T00:00:00.000Z', interests:['Music','Travel']
});
const receive = (page,type,data={}) => page.evaluate(message=>Native.receive(message),{type,data});
const navigate = (page,view,id) => page.evaluate(({view,id})=>go(view,id),{view,id});
const lastSent = (page,type) => page.evaluate(type=>__sent.filter(message=>message.type===type).at(-1)?.data,type);
const sentCount = (page,type) => page.evaluate(type=>__sent.filter(message=>message.type===type).length,type);
const button = (page,name) => page.getByRole('button',{name,exact:true});
async function settleProfile(page,profile) {
  const request = await lastSent(page,'profile.load');
  assert.equal(request.id,profile.id,'Profile reads the intended account');
  await receive(page,'data.publicProfile',{...request,profile});
  return request;
}
async function settlePosts(page,posts=[]) {
  const request = await lastSent(page,'profile.posts.load');
  assert.ok(request,'Approved gallery requests its public posts');
  await receive(page,'data.publicPosts',{...request,posts,total:posts.length,page:1,limit:12});
}
async function audit(page,label) {
  const result=await page.evaluate(()=>({
    overflow:document.documentElement.scrollWidth>innerWidth+1,
    canvas:getComputedStyle(document.querySelector('.app')).backgroundColor,
    wrong:[...document.querySelectorAll('body *')].filter(el=>el.getClientRects().length).flatMap(el=>{
      const style=getComputedStyle(el),name=el.id||el.className||el.tagName;
      const radiusOK=el.matches('.zb-back')?['50%','22px'].includes(style.borderRadius):style.borderRadius==='10px';
      return [!radiusOK&&`${name}: radius ${style.borderRadius}`,style.boxShadow!=='none'&&`${name}: shadow`,style.textShadow!=='none'&&`${name}: text shadow`,style.filter.includes('drop-shadow')&&`${name}: filter shadow`].filter(Boolean);
    })
  }));
  assert.equal(result.overflow,false,`${label}: no width overflow`);
  assert.equal(result.canvas,'rgb(255, 255, 255)',`${label}: white app canvas`);
  assert.deepEqual(result.wrong,[],`${label}: 10px UI corners, circular Back controls and no shadows`);
}
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
  const errors=[];
  try {
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    page.setDefaultTimeout(7000);
    page.on('pageerror',error=>errors.push(error.message));
    const fixturePng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=','base64');
    await page.route('https://**/*',route=>route.request().url().startsWith('https://media.fixture.test/')?route.fulfill({status:200,contentType:'image/png',body:fixturePng}):route.abort());
    await page.addInitScript(()=>{window.__sent=[];window.ReactNativeWebView={postMessage:raw=>__sent.push(JSON.parse(raw))}});
    await page.goto(pathToFileURL(path.join(root,'assets/aurora.html')).href+'?role=sender');
    await receive(page,'session',member);
    await receive(page,'data.home',{hosts:[],stage:[],total:0,page:1,categories:[],unreadCount:0});
    await page.locator('#nav').getByRole('button',{name:'Profile',exact:true}).click();
    assert.equal(await page.evaluate(()=>S.v),'profile','The tab keeps its own primary route');
    assert.equal(await page.locator('#nav [aria-current="page"]').innerText(),'Profile');
    const initial=await lastSent(page,'profile.load');
    assert.equal(initial.id,ownerId,'The own tab loads the authenticated account');
    await page.getByRole('status',{name:'Loading profile details',exact:true}).waitFor();
    await receive(page,'data.loading',{resource:'publicProfile',loading:false,id:initial.id,requestId:initial.requestId,error:'Your profile is temporarily unavailable'});
    await page.getByRole('alert').filter({hasText:'Your profile is temporarily unavailable'}).waitFor();
    await button(page,'Try again').click();
    const retry=await lastSent(page,'profile.load');
    assert.notEqual(retry.requestId,initial.requestId,'Retry owns a new profile request');
    await receive(page,'data.publicProfile',{...initial,profile:{...publicProfile(),name:'Stale profile'}});
    assert.equal(await page.getByRole('heading',{name:'Stale profile',exact:true}).count(),0,'A retired read cannot replace the current profile');
    await settleProfile(page,publicProfile());
    await page.getByRole('heading',{name:member.user.name,exact:true}).waitFor();
    assert.deepEqual(await page.locator('.zu-tabs [role="tab"]').allInnerTexts(),['Posts','About']);
    for(const selector of ['.zu-cover','.zu-overview','.zu-identity','.zu-stats','.zu-tabs','.zu-panel'])assert.equal(await page.locator(selector).count(),1,`${selector} reuses the public profile structure`);
    for(const selector of ['#zu-follow','#zu-message','#zu-call','.zu-gift'])assert.equal(await page.locator(selector).count(),0,'Own profiles never offer social actions on yourself');
    assert.equal(await button(page,'Open settings').count(),1);
    assert.equal(await button(page,'Change profile photo').count(),1);
    assert.equal(await button(page,'Change cover photo').count(),1);
    assert.equal(await page.locator('#zu-edit-self').count(),1);
    assert.equal(await page.locator('#zu-upload-self').count(),1);
    const shots=path.join(root,'artifacts','own-profile');fs.mkdirSync(shots,{recursive:true});
    for(const width of [320,390,768]) {
      await page.setViewportSize({width,height:844});
      await audit(page,`Own profile ${width}px`);
      assert.equal(await page.locator('#nav [aria-current="page"]').innerText(),'Profile');
      await page.screenshot({path:path.join(shots,`profile-${width}.png`)});
    }
    await page.setViewportSize({width:390,height:844});

    await page.locator('#zu-edit-self').click();
    assert.equal(await page.evaluate(()=>S.v),'editprofile');
    assert.equal(await page.getByLabel('Display name',{exact:true}).inputValue(),member.user.name);
    assert.equal(await page.locator('input[onchange*="posts"]').count(),0,'Members edit avatar and cover without creator publishing access');
    const photo=Buffer.from(await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=1200;const context=canvas.getContext('2d');context.fillStyle='#e5007e';context.fillRect(0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png').split(',')[1]}),'base64');
    await page.getByLabel('Display name',{exact:true}).fill('Asha Updated');
    await page.locator('input[onchange*="avatar"]').setInputFiles({name:'avatar.png',mimeType:'image/png',buffer:photo});
    await page.waitForFunction(()=>!S.mediaPreparing&&S.mediaDirty?.avatar);
    await page.locator('input[onchange*="cover"]').setInputFiles({name:'cover.png',mimeType:'image/png',buffer:photo});
    await page.waitForFunction(()=>!S.mediaPreparing&&S.mediaDirty?.cover);
    assert.equal(await sentCount(page,'profile.save'),0,'Choosing photos does not save before confirmation');
    await button(page,'Save profile').click();
    const save=await lastSent(page,'profile.save');
    assert.equal(save.name,'Asha Updated');assert.ok(save.avatar.startsWith('data:image/jpeg;base64,'));assert.ok(save.cover.startsWith('data:image/jpeg;base64,'));
    assert.equal(await page.evaluate(()=>S.v),'editprofile','Uploading waits for a confirmed save');
    await receive(page,'profile.error',{onboarding:false,requestId:save.requestId,message:'Upload unavailable. Please try again.'});
    assert.match(await page.getByRole('alert').innerText(),/Upload unavailable/);
    assert.ok(await page.evaluate(()=>S.mediaDirty.avatar&&S.mediaDirty.cover),'Failed saves preserve both photo drafts');
    await button(page,'Save profile').click();
    const savedRequest=await lastSent(page,'profile.save');
    await receive(page,'profile.saved',{onboarding:false,requestId:save.requestId,account:member});
    assert.equal(await page.evaluate(()=>S.profileSaving),true,'A stale save cannot finish the retry');
    const updated={...member,user:{...member.user,name:'Asha Updated',avatarUrl:media('saved-avatar'),coverUrl:media('saved-cover')}};
    await receive(page,'profile.saved',{onboarding:false,requestId:savedRequest.requestId,account:updated});
    assert.equal(await page.evaluate(()=>S.v),'profile','A confirmed edit returns to the same Profile tab');
    await settleProfile(page,publicProfile(updated));
    assert.equal(await page.locator('.zu-identity h1').innerText(),'Asha Updated');
    assert.equal(await page.locator('.zu-avatar img').getAttribute('src'),updated.user.avatarUrl);
    assert.equal(await page.locator('.zu-cover-photo').getAttribute('src'),updated.user.coverUrl);
    for(const name of ['Change profile photo','Change cover photo']) {
      await button(page,name).click();
      assert.equal(await page.evaluate(()=>S.v),'editprofile',`${name} opens the real media editor`);
      await navigate(page,'profile');await settleProfile(page,publicProfile(updated));
    }
    await button(page,'Open settings').click();
    assert.equal(await page.evaluate(()=>S.v),'settings');
    await button(page,'Open your profile').click();
    assert.equal(await page.evaluate(()=>S.v),'profile');
    await settleProfile(page,publicProfile(updated));

    // The owner and a peer share the same public presentation without exposing
    // editing on another account or borrowing the previously viewed identity.
    await navigate(page,'host',peerId);
    const peer={...publicProfile(),id:peerId,name:'Mira Creator',role:'host',serverRole:'host',verified:true,online:true,availableForCall:true};
    await settleProfile(page,peer);await settlePosts(page);
    for(const selector of ['.zu-cover','.zu-overview','.zu-identity','.zu-stats','.zu-tabs','.zu-panel'])assert.equal(await page.locator(selector).count(),1,`${selector} also appears on another user's profile`);
    assert.equal(await page.locator('#zu-edit-self,#zu-upload-self').count(),0,'Another account never exposes own editing');
    await navigate(page,'profile');await settleProfile(page,publicProfile(updated));
    assert.equal(await page.locator('.zu-identity h1').innerText(),'Asha Updated');
    assert.equal(await page.locator('#nav [aria-current="page"]').innerText(),'Profile');

    const creator={...updated,user:{...updated.user,role:'host',serverRole:'host',hostStatus:'approved',isVerifiedHost:true},verification:'verified'};
    await receive(page,'session',creator);await navigate(page,'profile');await settleProfile(page,publicProfile(creator));await settlePosts(page);
    await page.locator('#zu-upload-self').click();
    assert.equal(await page.evaluate(()=>S.v),'editprofile');
    await page.locator('input[onchange*="posts"]').setInputFiles({name:'moment.png',mimeType:'image/png',buffer:photo});
    await page.waitForFunction(()=>!S.mediaPreparing&&!!S.postDraftData);
    await page.getByLabel('Caption',{exact:true}).fill('A confirmed moment');
    await button(page,'Publish photo').click();
    const publication=await lastSent(page,'media.post.create');
    assert.equal(publication.caption,'A confirmed moment');
    assert.equal(await page.evaluate(()=>S.postData.includes('https://media.fixture.test/moment.jpg')),false,'A draft is never presented as a published photo');
    await receive(page,'post.error',{requestId:publication.requestId,message:'Photo could not be published'});
    assert.ok(await page.evaluate(()=>!!S.postDraftData),'Publication failures retain the selected photo');
    await button(page,'Publish photo').click();
    const postRetry=await lastSent(page,'media.post.create');
    const post={id:'507f1f77bcf86cd799439031',kind:'photo',mediaUrl:media('moment'),caption:'A confirmed moment'};
    await receive(page,'post.saved',{requestId:postRetry.requestId,post});
    await navigate(page,'profile');await settleProfile(page,publicProfile(creator));await settlePosts(page,[post]);
    assert.equal(await page.locator('.zu-gallery .zu-photo').count(),1,'Confirmed uploaded posts appear in the shared public gallery');
    assert.equal(await page.locator('.zu-gallery img').getAttribute('src'),post.mediaUrl);
    await audit(page,'Creator own profile');
    assert.deepEqual(errors,[],'No browser or bridge handler errors');
    console.log('PASS own Profile: shared public layout and owner controls, real profile loading/retry, selected tab, 320/390/768px layout, avatar/cover confirmed saves and stale isolation, Settings return, approved gallery uploads and member publishing restrictions');
  } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
