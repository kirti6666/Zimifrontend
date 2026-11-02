/* Frequent billing updates must leave the running call and its decoders in place. */
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const creator={id:'507f1f77bcf86cd799439011',name:'Call host',role:'host',serverRole:'host',hostStatus:'approved',isVerifiedHost:true,verified:true,ratePerMin:60,entryFee:0};
const member={id:'507f1f77bcf86cd799439012',name:'Call member',role:'sender',serverRole:'user',hostStatus:'none',isVerifiedHost:false};
const catalog={gifts:Array.from({length:24},(_,i)=>({id:'gift-'+i,name:i?'Gift '+i:'Golden Rose',emoji:'🎁',coins:i?100+i:99})),packs:[{id:'pack',name:'Starter',coins:200,pricePaise:9900}],paymentsAvailable:true};
const receive=(page,type,data)=>page.evaluate(message=>Native.receive(message),{type,data});

async function track(page){
  await page.evaluate(()=>{
    window.__renderCalls=0;
    if(!window.__originalRender){window.__originalRender=r;r=function(){__renderCalls++;return __originalRender.apply(this,arguments)}}
    window.__callStage=document.querySelector('.zr-call');
    window.__callVideos=[...__callStage.querySelectorAll('video')];
    window.__callStreams=__callVideos.map(video=>video.srcObject);
    window.__cameraMoves=0;
    window.__callObserver?.disconnect();
    window.__callObserver=new MutationObserver(changes=>{for(const change of changes)for(const node of change.removedNodes)if(__callVideos.some(video=>node===video||node.contains?.(video)))__cameraMoves++});
    __callObserver.observe(document.getElementById('screen'),{subtree:true,childList:true});
  });
}
async function stable(page,label){
  assert.deepEqual(await page.evaluate(()=>({renders:__renderCalls,stage:__callStage===document.querySelector('.zr-call'),videos:__callVideos.every((video,i)=>video.isConnected&&video===document.querySelectorAll('.zr-call video')[i]&&video.srcObject===__callStreams[i]),moves:__cameraMoves})),{renders:0,stage:true,videos:true,moves:0},label);
}

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required'],...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
  const errors=[];
  try{
    for(const view of ['call','hcall','voice']){
      const host=view==='hcall',page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('https://**/*',route=>route.abort());
      await page.addInitScript(()=>{window.ReactNativeWebView={postMessage(){}}});
      await page.goto(pathToFileURL(path.join(root,'assets/aurora.html')).href);
      await receive(page,'session',{user:host?creator:member,verification:host?'verified':'none',requiresOnboarding:false});
      await receive(page,'data.home',{hosts:[creator],total:1,page:1});
      await receive(page,'data.catalog',catalog);
      await receive(page,'wallet.balance',{coins:5000});
      await page.evaluate(async({view,creator,member})=>{
        if(view!=='voice')await ZimiMedia.prepare(true);
        S.callId='stable-'+view;S.callRate=60;S.mic=1;S.cam=1;S.scam=1;
        if(view==='hcall')S.caller={id:member.id,n:member.name,callId:S.callId,voice:false};
        go(view,view==='hcall'?undefined:creator.id);Home.mediaStatus='Connected';r();
      },{view,creator,member});
      if(view!=='voice')await page.waitForFunction(()=>document.querySelector('video[data-zimi-local]')?.readyState>=2);
      await track(page);
      await receive(page,'data.loading',{resource:'wallet',loading:true});
      if(!host)assert.equal(await page.locator('[data-call-balance] [aria-label="Loading balance"]').count(),1,'Initial wallet request shows a local balance skeleton');
      await receive(page,'wallet.balance',{coins:4999});
      await receive(page,'data.loading',{resource:'wallet',loading:false});
      if(!host)assert.equal(await page.locator('[data-call-balance]').innerText(),'4,999','Authoritative wallet state is painted after loading settles');
      await stable(page,view+': billing leaves the screen and video streams connected');
      await receive(page,'data.loading',{resource:'wallet',loading:false,error:'Wallet unavailable'});
      if(!host)assert.equal(await page.locator('[data-call-balance] [aria-label="Balance unavailable"]').count(),1,'Wallet errors stay visible beside the balance');
      await receive(page,'wallet.balance',{coins:30});
      if(!host)assert.match(await page.locator('#zr-call-cost').innerText(),/under a minute left/,'Wallet changes update the call cost warning');
      await page.evaluate(()=>{for(let i=0;i<20;i++){Native.receive({type:'data.loading',data:{resource:'wallet',loading:true}});Native.receive({type:'wallet.balance',data:{coins:3000-i}});Native.receive({type:'data.loading',data:{resource:'wallet',loading:false}})}});
      await stable(page,view+': repeated billing/loading/error events do not rebuild the screen');

      if(!host){
        await page.evaluate(id=>homeGifts(id,'gift-0'),creator.id);
        await page.evaluate(()=>{window.__renderCalls=0});
        await receive(page,'data.catalog',catalog);
        assert.equal(await page.evaluate(()=>__renderCalls),1,'One catalog result causes at most one call render with the gift picker open');
        await page.locator('.zw-gifts button').first().focus();
        await page.evaluate(()=>{
          window.__giftSheet=document.querySelector('.zw-sheet');window.__giftCatalog=document.querySelector('.zg-catalog');window.__giftImage=document.querySelector('.zw-gifts img');window.__giftSend=document.querySelector('.zw-send');window.__giftFocus=document.activeElement;
          __giftCatalog.scrollTop=80;window.__giftScroll=__giftCatalog.scrollTop;
          // Wallet updates must not generate or decode catalog tiles again.
          window.__giftTiles=0;window.__tile=homeGiftTile;homeGiftTile=function(){__giftTiles++;return __tile.apply(this,arguments)};
        });
        await track(page);
        await receive(page,'data.loading',{resource:'wallet',loading:true});
        assert.equal(await page.locator('.zw-send').isDisabled(),true,'A paid gift waits while its balance is refreshing');
        await receive(page,'wallet.balance',{coins:50});
        await receive(page,'data.loading',{resource:'wallet',loading:false});
        assert.match(await page.locator('.zw-gift-footer').innerText(),/49 more coins/,'Gift affordability follows the current server balance');
        await receive(page,'data.loading',{resource:'wallet',loading:false,error:'Wallet unavailable'});
        assert.equal(await page.locator('.zw-send').isDisabled(),true,'Unavailable balances cannot send paid gifts');
        assert.match(await page.locator('[data-coin-wallet-error]').innerText(),/Refresh your balance/);
        await receive(page,'wallet.balance',{coins:500});
        assert.equal(await page.locator('.zw-send').isDisabled(),false,'A recovered wallet enables the selected gift');
        assert.match(await page.locator('.zw-gift-footer').innerText(),/401 coins remaining/);
        assert.equal(await page.locator('[data-coin-wallet-error]').count(),0,'Recovery removes only the wallet error');
        assert.deepEqual(await page.evaluate(()=>({sheet:__giftSheet===document.querySelector('.zw-sheet'),catalog:__giftCatalog===document.querySelector('.zg-catalog'),image:__giftImage===document.querySelector('.zw-gifts img'),send:__giftSend===document.querySelector('.zw-send'),focus:document.activeElement===__giftFocus,scroll:__giftCatalog.scrollTop===__giftScroll,tiles:__giftTiles})),{sheet:true,catalog:true,image:true,send:true,focus:true,scroll:true,tiles:0},'Billing preserves picker DOM, focus and scroll without regenerating artwork');
        await stable(page,view+': gifting remains over the same running call throughout wallet updates');
        await page.evaluate(()=>{homeGiftTile=__tile;homeGiftTopup()});
        await track(page);
        await receive(page,'data.loading',{resource:'wallet',loading:true});
        await receive(page,'data.loading',{resource:'wallet',loading:false,error:'Wallet unavailable'});
        assert.match(await page.locator('[data-coin-wallet-error]').innerText(),/Balance unavailable/,'Embedded top-up shows wallet failures');
        await receive(page,'wallet.balance',{coins:700});
        assert.match(await page.locator('.zw-wallet-main').innerText(),/700/,'Embedded top-up balance refreshes in place');
        assert.equal(await page.locator('[data-coin-wallet-error]').count(),0);
        await stable(page,view+': embedded top-up wallet refresh never remounts the call');
        await page.evaluate(()=>homeCloseGifts());
      }
      await track(page);
      assert.deepEqual(await page.evaluate(()=>{S.rmsgs=Array.from({length:300},(_,i)=>['host','Peer','Message '+i]);paintFeed();return{stored:S.rmsgs.length,painted:document.querySelectorAll('#rfeed>.lvmsg').length,latest:document.querySelector('#rfeed>.lvmsg:last-child .txt').textContent}}),{stored:100,painted:100,latest:'Message 299'},'Long calls retain only the newest100 feed rows');
      await stable(page,view+': chat-feed maintenance leaves call media connected');
      await page.close();
    }
    assert.deepEqual(errors,[],'No browser exceptions');
    console.log('PASS call render stability: wallet billing, loading/errors, picker affordability/focus/artwork, embedded top-up, single catalog render and bounded chat feed');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
