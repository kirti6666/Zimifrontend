/* Local production-bundle checks; media and native acknowledgements are fixtures. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),artifacts=path.join(root,'artifacts','posts');
const account={user:{id:'507f1f77bcf86cd799439001',name:'Asha Sharma',role:'sender',serverRole:'user',hostStatus:'none',isVerifiedHost:false,isPhoneVerified:true,avatarUrl:'https://media.fixture.test/avatar.jpg'},verification:'none',requiresOnboarding:false};
const profile={...account.user,verified:false,followers:17,followingCount:5,about:'Little moments, good memories.'};
const posts=[1,2,3].map(i=>({id:`507f1f77bcf86cd79943903${i}`,kind:'photo',mediaUrl:`https://media.fixture.test/post-${i}.jpg`,caption:i===1?'An afternoon to remember.':i===2?'Coffee, good company, and a slower day.':'<img src=x onerror=alert(1)>',createdAt:'2026-10-29T09:00:00.000Z',likes:i===2?7:0,comments:i===2?3:0,liked:false}));
const receive=(page,type,data)=>page.evaluate(message=>Native.receive(message),{type,data});
const button=(page,name)=>page.getByRole('button',{name,exact:true});
const last=(page,type)=>page.evaluate(type=>__sent.filter(message=>message.type===type).at(-1)?.data,type);
async function settleProfile(page){
  await receive(page,'data.publicProfile',{...await last(page,'profile.load'),profile});
  await receive(page,'data.publicPosts',{...await last(page,'profile.posts.load'),posts,total:posts.length,page:1,limit:20});
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];
  page.setDefaultTimeout(7000);page.on('pageerror',error=>errors.push(error.message));
  let photoBytes,failPhoto=false;
  await page.route('https://**/*',route=>route.request().url().startsWith('https://media.fixture.test/')&&photoBytes&&!failPhoto?route.fulfill({status:200,contentType:'image/png',body:photoBytes}):route.abort());
  await page.addInitScript(()=>{window.__sent=[];window.ReactNativeWebView={postMessage:raw=>__sent.push(JSON.parse(raw))}});
  await page.goto(pathToFileURL(path.join(root,'assets/aurora.html')).href);
  photoBytes=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=900;c.height=1100;const ctx=c.getContext('2d'),g=ctx.createLinearGradient(0,0,900,1100);g.addColorStop(0,'#d2e9e6');g.addColorStop(1,'#547b72');ctx.fillStyle=g;ctx.fillRect(0,0,900,1100);ctx.fillStyle='#d7c3a7';ctx.fillRect(80,690,740,410);ctx.fillStyle='#8a6252';ctx.fillRect(190,500,520,220);ctx.fillStyle='#eee4d6';ctx.beginPath();ctx.ellipse(450,500,170,42,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#795344';ctx.beginPath();ctx.ellipse(450,500,145,29,0,0,Math.PI*2);ctx.fill();return c.toDataURL('image/png').split(',')[1]}),'base64');
  await receive(page,'session',account);await receive(page,'wallet.balance',{coins:1250,earned:0});
  await page.evaluate(()=>go('profile'));await settleProfile(page);
  await button(page,'Upload photos').click();
  assert.equal(await page.evaluate(()=>S.v),'create-post');
  assert.equal(await page.locator('.editwrap').count(),0,'Post creation is independent of profile editing');
  assert.equal(await button(page,'Publish post').isDisabled(),true);
  assert.equal(await page.locator('#nav').isVisible(),false,'The composer owns its navigation');
  await page.getByLabel('Caption',{exact:true}).fill('An afternoon to remember.');
  await page.getByLabel('Choose post photo',{exact:true}).setInputFiles({name:'moment.png',mimeType:'image/png',buffer:photoBytes});
  await page.waitForFunction(()=>!S.mediaPreparing&&!!S.postDraftData);
  assert.equal(await page.locator('.zpost-preview>img').evaluate(el=>getComputedStyle(el).objectFit),'contain');
  await page.getByLabel('Caption',{exact:true}).focus();
  await page.getByLabel('Caption',{exact:true}).evaluate(el=>el.setSelectionRange(3,3));
  await receive(page,'wallet.balance',{coins:1300});
  assert.deepEqual(await page.getByLabel('Caption',{exact:true}).evaluate(el=>[el===document.activeElement,el.selectionStart]),[true,3],'Background redraws preserve caption focus and caret');
  await page.evaluate(()=>ZimiNavigation.back());await settleProfile(page);await button(page,'Upload photos').click();
  assert.ok(await page.evaluate(()=>S.postDraftData));assert.equal(await page.getByLabel('Caption',{exact:true}).inputValue(),'An afternoon to remember.','Back retains this session’s draft');
  fs.mkdirSync(artifacts,{recursive:true});
  for(const dark of [false,true]){
   await page.evaluate(dark=>ZimiThemes.setDark(dark),dark);
   for(const width of [320,390,1024]){
    await page.setViewportSize({width,height:844});
    const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,edge:getComputedStyle(document.querySelector('.zpost-visibility')).borderRadius,publish:document.querySelector('.zpost-publish').getBoundingClientRect().right<=innerWidth}));
    assert.deepEqual(layout,{overflow:false,edge:'0px',publish:true});
    await page.screenshot({path:path.join(artifacts,`create-${dark?'dark':'light'}-${width}.png`),fullPage:true});
   }
  }
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>ZimiThemes.setDark(false));
  await button(page,'Publish post').click();const first=await last(page,'media.post.create');
  assert.equal(await button(page,'Back to profile').isDisabled(),true,'Publishing cannot be interrupted by Back');
  await receive(page,'post.error',{requestId:first.requestId,message:'Upload failed. Try again.'});
  assert.equal(await page.getByLabel('Caption',{exact:true}).inputValue(),'An afternoon to remember.');
  await button(page,'Publish post').click();const retry=await last(page,'media.post.create');
  await receive(page,'post.saved',{requestId:first.requestId,post:posts[0]});assert.equal(await page.evaluate(()=>S.v),'create-post');
  await receive(page,'post.saved',{requestId:retry.requestId,post:posts[0]});assert.equal(await page.evaluate(()=>S.v),'profile');await settleProfile(page);
  // Posts open as a feed at the tapped post: author, photo, likes, caption, comments and time.
  await page.locator('.zu-gallery .zu-photo').nth(1).click();
  const feed=page.locator('.zu-feed-dialog');await feed.waitFor();
  await page.waitForFunction(()=>!document.querySelector('.zu-feed-post .zu-post-loading'));
  assert.equal(await page.locator('.zu-feed-post').count(),posts.length,'Every loaded post is in the feed');
  assert.equal(await page.evaluate(()=>Zu.gallery),1,'The feed starts at the tapped post');
  assert.equal(await page.locator('.zu-feed-header h2').innerText(),'Posts');
  assert.equal(await page.locator('.zu-feed-media>img').first().evaluate(el=>getComputedStyle(el).objectFit),'contain','Photos are never cropped');
  const second=page.locator('.zu-feed-post').nth(1);
  assert.match(await second.innerText(),/Asha Sharma[\s\S]*7 likes[\s\S]*Coffee, good company, and a slower day\.[\s\S]*View all 3 comments/);
  assert.equal(await page.locator('.zu-feed-post').nth(2).locator('.zu-feed-caption').innerText(),'Asha Sharma '+posts[2].caption,'Captions remain plain text');
  assert.equal(await page.locator('.zu-feed-caption img').count(),0);

  // The heart answers at once; the server confirms, and a failure puts the old state back.
  const like=second.getByRole('button',{name:'Like',exact:true});
  await like.click();
  assert.deepEqual([await like.getAttribute('aria-pressed'),await second.locator('.zu-feed-likes').innerText()],['true','8 likes']);
  const liked=await last(page,'post.like');assert.deepEqual([liked.id,liked.liked],[posts[1].id,true]);
  await like.click();assert.equal((await page.evaluate(()=>__sent.filter(m=>m.type==='post.like').length)),1,'One like request at a time per post');
  await receive(page,'post.like.error',{...liked,message:'Your like could not be confirmed. Try again.'});
  assert.deepEqual([await like.getAttribute('aria-pressed'),await second.locator('.zu-feed-likes').innerText()],['false','7 likes'],'A failed like restores the count');
  await like.click();const retryLike=await last(page,'post.like');
  await receive(page,'post.liked',{id:posts[1].id,liked:true,likes:9,requestId:retryLike.requestId});
  assert.equal(await second.locator('.zu-feed-likes').innerText(),'9 likes','The server count wins');

  // A double tap likes the photo and shows a large heart; it never unlikes.
  const firstPost=page.locator('.zu-feed-post').first(),media=firstPost.locator('.zu-feed-media');
  await firstPost.scrollIntoViewIfNeeded();
  const box=await media.boundingBox(),tap=()=>media.evaluate((el,{x,y})=>el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch',clientX:x,clientY:y})),{x:box.x+box.width/2,y:box.y+box.height/2});
  await tap();await tap();
  assert.equal(await firstPost.locator('.zu-like-burst').evaluate(el=>el.classList.contains('is-bursting')),true);
  const doubleTap=await last(page,'post.like');assert.deepEqual([doubleTap.id,doubleTap.liked],[posts[0].id,true]);
  await receive(page,'post.liked',{id:posts[0].id,liked:true,likes:1,requestId:doubleTap.requestId});
  await tap();await tap();
  assert.equal((await page.evaluate(()=>__sent.filter(m=>m.type==='post.like').length)),3,'Double tapping a liked photo does not unlike it');

  // Comments open in a sheet: load, add and delete.
  await second.getByRole('button',{name:'View all 3 comments',exact:true}).click();
  const sheet=page.getByRole('dialog',{name:'Comments',exact:true});await sheet.waitFor();
  assert.equal(await sheet.getByRole('status',{name:'Loading comments'}).count(),1);
  const load=await last(page,'post.comments.load');assert.deepEqual([load.id,load.page],[posts[1].id,1]);
  const comment=(id,text,user)=>({id,text,createdAt:new Date(Date.now()-3600e3).toISOString(),user});
  await receive(page,'data.postComments',{...load,comments:[comment('6a0000000000000000000a01','Lovely place',{id:'6a0000000000000000000b01',name:'Meher Kaur',avatarUrl:''}),comment('6a0000000000000000000a02','<b>bold</b>',{id:'6a0000000000000000000b02',name:'Tara',avatarUrl:''})],total:3,page:1,limit:20});
  assert.match(await sheet.innerText(),/Meher Kaur Lovely place[\s\S]*Tara <b>bold<\/b>[\s\S]*Load more comments/);
  assert.equal(await sheet.locator('.zu-comment-meta button').count(),2,'The post owner can remove any comment');
  const postButton=sheet.getByRole('button',{name:'Post',exact:true});assert.equal(await postButton.isDisabled(),true);
  await sheet.getByLabel('Add a comment').fill('Thank you!');await postButton.click();
  const added=await last(page,'post.comment.add');assert.deepEqual([added.id,added.text],[posts[1].id,'Thank you!']);
  await receive(page,'post.comment.saved',{id:posts[1].id,requestId:added.requestId,comment:comment('6a0000000000000000000a03','Thank you!',{id:account.user.id,name:'Asha Sharma',avatarUrl:''})});
  assert.equal(await sheet.locator('.zu-comment').first().innerText().then(text=>text.startsWith('Asha Sharma Thank you!')),true);
  assert.equal(await sheet.getByLabel('Add a comment').inputValue(),'','The composer clears after posting');
  await sheet.locator('.zu-comment').nth(1).getByRole('button',{name:'Delete',exact:true}).click();
  const removed=await last(page,'post.comment.delete');assert.equal(removed.commentId,'6a0000000000000000000a01');
  await receive(page,'post.comment.deleted',removed);
  assert.doesNotMatch(await sheet.innerText(),/Lovely place/);
  await page.keyboard.press('Escape');await sheet.waitFor({state:'detached'});
  assert.equal(await feed.isVisible(),true,'Back closes the comments before the feed');
  assert.equal(await second.locator('.zu-feed-comments').innerText(),'View all 3 comments','Counts follow added and removed comments');

  for(const dark of [false,true]){
   await page.evaluate(dark=>ZimiThemes.setDark(dark),dark);
   for(const width of [320,390,1024]){
    await page.setViewportSize({width,height:844});
    const layout=await feed.evaluate(el=>({overflow:el.scrollWidth>el.clientWidth+1||document.documentElement.scrollWidth>innerWidth+1,inside:el.getBoundingClientRect().left>=-1&&el.getBoundingClientRect().right<=innerWidth+1,edge:getComputedStyle(el.querySelector('.zu-feed-media')).borderRadius}));
    assert.deepEqual(layout,{overflow:false,inside:true,edge:'0px'});
    await page.screenshot({path:path.join(artifacts,`viewer-${dark?'dark':'light'}-${width}.png`)});
   }
  }
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>ZimiThemes.setDark(false));
  await page.keyboard.press('Escape');await page.locator('.zu-feed-dialog').waitFor({state:'detached'});

  // A photo that fails to load can be tried again from the feed.
  failPhoto=true;await page.evaluate(()=>{Zu.posts=Zu.posts.map(post=>({...post,mediaUrl:post.mediaUrl.replace('.jpg','-fresh.jpg')}))});
  await page.evaluate(()=>zuOpenPhoto(0));
  await page.locator('.zu-feed-post').first().getByRole('alert').filter({hasText:'Photo unavailable'}).waitFor();
  failPhoto=false;await page.locator('.zu-feed-post').first().getByRole('button',{name:'Try again',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.zu-feed-post .zu-post-loading')&&document.querySelector('.zu-feed-post .zu-post-unavailable').hidden);
  assert.equal(await page.locator('.zu-feed-post').first().locator('.zu-post-unavailable').isVisible(),false,'Media failures can recover');
  await page.keyboard.press('Escape');await button(page,'Upload photos').click();
  await page.getByLabel('Choose post photo',{exact:true}).setInputFiles({name:'not-an-image.txt',mimeType:'text/plain',buffer:Buffer.from('invalid')});
  await page.waitForFunction(()=>!S.mediaPreparing&&!!S.mediaError);
  assert.equal(await button(page,'Publish post').isDisabled(),true);
  assert.deepEqual(errors,[],'No browser exceptions');
  console.log('PASS post UI: independent composer, responsive themes, retained drafts/caret, confirmed publication, feed opening at the tapped post, likes with rollback, double-tap like, comments sheet (load/add/delete), straight edges and media retry');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
