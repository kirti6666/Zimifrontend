/* Reference gift sheet against the production WebView bundle. Catalog, wallet
   and delivery responses are isolated fixtures; no coins or accounts are used. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const id=n=>Number(n).toString(16).padStart(24,'0');
const member={user:{id:id(1),name:'Gift modal member',role:'sender',serverRole:'user',hostStatus:'none',isVerifiedHost:false,isPhoneVerified:true},verification:'none',requiresOnboarding:false};
const creator={id:id(2),name:'Gift modal host',role:'host',serverRole:'host',verified:true,online:true,availableForCall:true,ratePerMin:0};
const entries=[['Rose Waterfall','🌹',9999],['Rose','🌹',123],['Kiss','💋',199],['Berry','🍓',299],['Bear','🐻',399],['Cheers','🥂',499],['Party','🎉',699],['Tulip','🌷',899],['Bunny','🐰',999],['Blossom','🌸',1299],['Bouquet','💐',1599],['Hibiscus','🌺',1999]];
const gifts=entries.map(([name,emoji,coins],i)=>({id:id(100+i),name,emoji,coins,mediaUrl:''}));
const catalog={gifts:[...gifts].reverse(),packs:[{id:id(500),name:'Starter',coins:200,pricePaise:9900}],paymentsAvailable:true};
const receive=(page,type,data={})=>page.evaluate(message=>Native.receive(message),{type,data});
const last=(page,type)=>page.evaluate(type=>__sent.filter(message=>message.type===type).at(-1)?.data,type);
const dialog=page=>page.getByRole('dialog',{name:'Send a gift',exact:true});
const giftButton=(page,name)=>dialog(page).locator('.zw-gifts>button').filter({has:page.locator('b').filter({hasText:new RegExp('^'+name+'$')})});
const themeState=page=>page.evaluate(()=>({view:S.v,theme:document.documentElement.dataset.theme,themeId:document.documentElement.dataset.themeId,dark:localStorage.getItem('zimi.darkMode')}));

async function openGifts(page){
  await page.setViewportSize({width:320,height:740});
  await page.evaluate(target=>homeGifts(target),creator.id);
  const loading=page.getByRole('status',{name:'Loading gifts',exact:true});
  await loading.waitFor();
  assert.equal(await loading.locator('.zh-skeleton-catalog>div').count(),12,'Catalog loading keeps the same twelve-cell gift geometry');
  assert.equal(await loading.locator('.zh-skeleton-catalog').evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(' ').length),4,'Gift skeletons keep four columns');
  await receive(page,'data.catalog',catalog);
  await dialog(page).waitFor();
}
async function checkLayout(page,label){
  const sheet=dialog(page);
  assert.equal(await sheet.locator('.zg-reference').count(),0,'The dialog itself owns the scoped reference class');
  assert.equal(await sheet.evaluate(node=>node.classList.contains('zg-reference')),true);
  await sheet.getByRole('heading',{name:'Send a gift',exact:true}).waitFor();
  assert.equal(await sheet.getByText('Coins go straight to the host',{exact:true}).count(),1);
  assert.match(await sheet.locator('.zg-balance').innerText(),/12,345/);
  assert.equal(await sheet.getByRole('button',{name:'Add coins',exact:true}).count(),1);
  assert.equal(await sheet.getByRole('button',{name:'Close gifts',exact:true}).count(),1);
  const metrics=await sheet.evaluate(node=>{
    const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,bottom:r.bottom,width:r.width,height:r.height}};
    const grid=node.querySelector('.zw-gifts'),cells=[...grid.children],style=getComputedStyle(node),first=getComputedStyle(cells[0]),price=getComputedStyle(cells[0].querySelector('small'));
    return {columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,rows:[...new Set(cells.map(cell=>Math.round(cell.getBoundingClientRect().top)))].length,count:cells.length,
      sheet:box(node),title:box(node.querySelector('h2')),balance:box(node.querySelector('.zg-balance')),close:box(node.querySelector('[aria-label="Close gifts"]')),last:box(cells.at(-1)),
      background:style.backgroundImage+' '+style.backgroundColor,radius:style.borderTopLeftRadius,cellBackground:first.backgroundColor,cellBorder:first.borderTopWidth,cellBorderColor:first.borderTopColor,cellShadow:first.boxShadow,price:price.color,
      overflow:document.documentElement.scrollWidth>innerWidth+1,viewport:innerHeight};
  });
  assert.equal(metrics.columns,4,`${label}: four gift columns`);
  assert.equal(metrics.rows,3,`${label}: twelve catalog gifts form three rows`);
  assert.equal(metrics.count,12);
  assert.equal(metrics.overflow,false,`${label}: no document overflow`);
  assert.ok(metrics.sheet.y>=0&&metrics.sheet.bottom<=metrics.viewport+1,`${label}: sheet stays within viewport`);
  assert.ok(metrics.last.bottom<=metrics.viewport+1,`${label}: third gift row remains visible: ${JSON.stringify(metrics)}`);
  assert.ok(parseFloat(metrics.radius)>=20,`${label}: reference sheet has rounded upper corners`);
  assert.ok(metrics.balance.x>metrics.title.x&&metrics.close.x>metrics.balance.x,`${label}: balance and close stay beside the heading`);
  assert.equal(metrics.cellBackground,'rgba(0, 0, 0, 0)',`${label}: gifts use an open grid`);
  assert.ok(metrics.cellBorder==='0px'||metrics.cellBorderColor==='rgba(0, 0, 0, 0)',`${label}: unselected gifts have no visible card border`);assert.equal(metrics.cellShadow,'none');
  const gold=metrics.price.match(/[\d.]+/g).map(Number);assert.ok(gold[0]>170&&gold[1]>100&&gold[2]<150,`${label}: prices use gold`);
  assert.ok(metrics.background.includes('gradient'),`${label}: dark sheet keeps the subtle reference glow`);
  assert.deepEqual(await sheet.locator('.zw-gifts>button>b').allInnerTexts(),entries.map(row=>row[0]),'Only real catalog records are ordered into the reference grid');
  assert.match(await giftButton(page,'Rose').locator('small').innerText(),/123/,'The displayed price comes from the catalog, not the visual reference');
  assert.equal(await sheet.locator('.zg-tier').count(),0,'No extra badge or layer is added to gift artwork');
  const still=await giftButton(page,'Rose Waterfall').locator('.zg-art img').getAttribute('src');
  assert.equal(still,await page.evaluate(()=>giftMotionUrl('Rose Waterfall')),'Picker artwork stays animated');
  assert.equal(await giftButton(page,'Rose Waterfall').locator('.zg-art').evaluate(node=>getComputedStyle(node,'::before').content),'none','No glow behind transparent artwork');
  assert.equal(await sheet.locator('.zw-gift-footer').count(),0,'An unselected gift sheet has no extra footer');
}

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'],...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
  const errors=[];
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    page.setDefaultTimeout(7000);page.on('pageerror',error=>errors.push(error.message));
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=','base64');
    await page.route('https://**/*',route=>route.request().url().startsWith('https://media.fixture.test/')?route.fulfill({status:200,contentType:'image/png',body:png}):route.abort());
    await page.addInitScript(()=>{window.__sent=[];window.ReactNativeWebView={postMessage:raw=>__sent.push(JSON.parse(raw))}});
    await page.goto(pathToFileURL(path.join(root,'assets/aurora.html')).href);
    await receive(page,'session',member);await receive(page,'wallet.balance',{coins:12345});
    await receive(page,'data.home',{hosts:[creator],stage:[],featured:creator,total:1,page:1,categories:[],availableCount:1});
    const directory=path.join(root,'artifacts','gift-modal');fs.mkdirSync(directory,{recursive:true});
    for(const view of ['host','thread','call','voice']){
      await page.evaluate(({view,target})=>{S.callId=['call','voice'].includes(view)?'gift-modal-call':null;go(view,target)}, {view,target:creator.id});
      if(view==='host'){const request=await last(page,'profile.load');await receive(page,'data.publicProfile',{...request,profile:{...creator,followers:0,followingCount:0,following:false,interests:[],joined:'2026-01-01T00:00:00Z'}})}
      if(view==='thread')await receive(page,'data.thread',{with:creator.id,canSend:true,messages:[]});
      const before=await themeState(page);await openGifts(page);
      for(const viewport of [{width:320,height:740},{width:390,height:844},{width:768,height:844}]){
        await page.setViewportSize(viewport);await checkLayout(page,`${view} ${viewport.width}px`);
      }
      assert.deepEqual(await themeState(page),before,'Opening a reference gift sheet never changes account theme or route');
      if(view==='thread'||view==='call'){await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.activeElement?.blur());await page.screenshot({path:path.join(directory,`${view}-390.png`)})}
      await page.keyboard.press('Escape');assert.equal(await dialog(page).count(),0,'Escape dismisses every shared surface');
    }
    await page.evaluate(target=>go('thread',target),creator.id);await receive(page,'data.thread',{with:creator.id,canSend:true,messages:[]});
    await page.locator('#ti').fill('Keep my draft');await openGifts(page);
    await giftButton(page,'Rose').click();assert.equal(await giftButton(page,'Rose').getAttribute('aria-pressed'),'true');
    const send=dialog(page).getByRole('button',{name:'Send gift',exact:true});assert.equal(await send.isEnabled(),true);
    await send.click();const attempt=await last(page,'gift.send');assert.equal(attempt.gift,gifts[1].id);assert.equal(attempt.coins,123);
    await receive(page,'operation.error',{action:'gift.send',to:creator.id,gift:attempt.gift,idempotencyKey:attempt.idempotencyKey,message:'Confirm delivery before retrying'});
    await dialog(page).getByRole('button',{name:'Send gift',exact:true}).click();
    assert.equal((await last(page,'gift.send')).idempotencyKey,attempt.idempotencyKey,'Uncertain delivery retries retain identity');
    await receive(page,'gift.sent',{to:creator.id,gift:attempt.gift,idempotencyKey:attempt.idempotencyKey,id:'fixture-delivery',coins:123});
    assert.equal(await dialog(page).count(),0);assert.equal(await page.evaluate(()=>S.bal),12345,'Only authoritative wallet updates change balance');
    assert.equal(await page.locator('#ti').inputValue(),'Keep my draft');
    await openGifts(page);await dialog(page).getByRole('button',{name:'Add coins',exact:true}).click();
    const topup=page.getByRole('dialog',{name:'Add coins',exact:true});await topup.waitFor();
    assert.equal(await topup.evaluate(node=>node.classList.contains('zg-reference')),false,'Embedded top-up retains its own theme-aware layout');
    await topup.getByRole('button',{name:'Back to gifts',exact:true}).click();await dialog(page).waitFor();
    const extra=Array.from({length:12},(_,i)=>({id:id(800+i),name:'Custom gift '+i,emoji:'🎁',coins:50+i}));
    await receive(page,'data.catalog',{...catalog,gifts:[...catalog.gifts,...extra]});
    await giftButton(page,'Custom gift 11').click();
    assert.ok(await dialog(page).locator('.zg-catalog').evaluate(node=>node.scrollTop)>0,'Selecting an additional catalog gift preserves the scrolled grid position');
    await receive(page,'data.catalog',{...catalog,gifts:[gifts[1]]});
    assert.equal(await dialog(page).locator('.zw-gifts>button').count(),1,'Absent reference gifts are never invented');
    assert.equal(await giftButton(page,'Rose').count(),1);
    await dialog(page).getByRole('button',{name:'Close gifts',exact:true}).click();
    assert.deepEqual(errors,[]);console.log('PASS reference gift modal: shared profile/thread/video/voice sheet, responsive four-column catalog, artwork/rarity, real prices, send recovery, top-up and theme/draft preservation');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
