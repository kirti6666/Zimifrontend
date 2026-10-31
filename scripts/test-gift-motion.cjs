// Production gift receipts drive a finite visual effect without replaying on redraw.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const host = { id: '507f1f77bcf86cd799439017', name: 'Host', role: 'host', hostStatus: 'approved', isVerifiedHost: true };

// Uploaded expensive gifts used a more specific rule with negative margins.
// Exercise both call layouts and every artwork shape at actual screen bounds.
async function checkFullscreenGift(page, label) {
  await page.locator('.zr-gift-stage-art>img').evaluate(image => image.decode());
  const geometry = await page.locator('.zr-gift-stage-art').evaluate(art => {
    const room = art.closest('.zr-room'), overlay = art.parentElement, image = art.querySelector('img');
    const box = element => { const r=element.getBoundingClientRect(); return {left:r.left,top:r.top,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; };
    const style = getComputedStyle(image), a = getComputedStyle(art);
    const r = box(room), i = box(image), scale = Math.min(i.width/image.naturalWidth,i.height/image.naturalHeight);
    const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
    const painted={left:i.left+(i.width-width)/2,top:i.top+(i.height-height)/2,right:i.left+(i.width+width)/2,bottom:i.top+(i.height+height)/2};
    const control=room.querySelector('.zr-hangup'),c=control.getBoundingClientRect();
    return {room:r,art:box(art),overlay:box(overlay),image:i,painted,fit:style.objectFit,position:style.objectPosition,margin:a.margin,transform:a.transform,pointer:getComputedStyle(overlay).pointerEvents,control:document.elementFromPoint(c.left+c.width/2,c.top+c.height/2)?.closest('button')===control,overflow:document.documentElement.scrollWidth>innerWidth+1};
  });
  for (const layer of ['overlay','art','image']) for (const edge of ['left','top','right','bottom'])
    assert.ok(Math.abs(geometry[layer][edge]-geometry.room[edge])<1, `${label}: ${layer} fills the call ${edge}`);
  assert.equal(geometry.fit,'contain',`${label}: the complete animation fits without crop`);
  assert.equal(geometry.position,'50% 50%');
  assert.equal(geometry.margin,'0px',`${label}: expensive gifts have no leftover negative margins`);
  assert.equal(geometry.transform,'none');
  assert.equal(geometry.pointer,'none');
  assert.equal(geometry.control,true,`${label}: hang-up stays tappable under the animation`);
  assert.equal(geometry.overflow,false);
  assert.ok(geometry.painted.left>=geometry.room.left-1 && geometry.painted.right<=geometry.room.right+1 && geometry.painted.top>=geometry.room.top-1 && geometry.painted.bottom<=geometry.room.bottom+1,`${label}: all artwork edges stay visible`);
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => { window.ReactNativeWebView = { postMessage() {} }; });
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href + '?role=host');
    const receive = (type, data) => page.evaluate(message => Native.receive(message), { type, data });
    await receive('session', { user: host, verification: 'verified', requiresOnboarding: false });
    await page.evaluate(() => {
      S.callId = 'gift-motion-call'; S.callRate = 0;
      S.caller = { id: 'caller', n: 'Imran', callId: S.callId, voice: false };
      go('hcall'); Home.mediaStatus = 'Connected'; r();
    });
    const gift = { id: 'receipt-1', callId: 'gift-motion-call', senderId: 'caller', senderName: 'Imran', giftName: 'Berry', emoji: '🍓', coins: 299 };
    assert.equal(await page.locator('.zr-gift-celebration').count(), 0, 'No celebration before a real receipt');
    await receive('gift.received', gift);
    await page.locator('.zr-gift-celebration').waitFor();
    const start = await page.evaluate(() => Room.giftMotion.at);
    assert.match(await page.locator('.zr-gift-alert').innerText(), /Imran[\s\S]*Berry[\s\S]*299/);
    assert.equal(await page.locator('.zr-gift-celebration').locator('.zr-gift-halo,.zr-gift-wave,.zr-gift-sparks,.zr-gift-caption').count(),0,'The supplied animation has no added layers');
    assert.deepEqual(await page.locator('.zr-gift-stage-art').evaluate(el=>{const s=getComputedStyle(el);return [s.backgroundColor,s.backgroundImage,s.boxShadow,s.filter,s.animationName]}),['rgba(0, 0, 0, 0)','none','none','none','none'],'The file owns the animation and transparency');
    assert.equal(await page.evaluate(() => S.recvN), 1);
    await receive('gift.received', gift);
    assert.equal(await page.evaluate(() => S.recvN), 1, 'Duplicate receipts neither count nor replay');
    assert.equal(await page.evaluate(() => Room.giftMotion.at), start);
    await page.getByRole('button', { name: 'Open call chat', exact: true }).click();
    assert.equal(await page.evaluate(() => Room.giftMotion.at), start, 'Opening chat preserves the animation start');
    assert.ok(await page.locator('.zr-gift-celebration').evaluate(el => parseFloat(el.style.getPropertyValue('--gift-age')) < 0), 'Redraw resumes the elapsed timeline');
    assert.equal(await page.locator('.zr-gift-celebration').evaluate(el => getComputedStyle(el).pointerEvents), 'none', 'Celebrations never block controls');
    await page.waitForTimeout(300);
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'artifacts', 'host-gift-motion.png') });
    await page.waitForFunction(() => !Room.giftMotion, { timeout: 5000 });
    assert.equal(await page.locator('.zr-gift-celebration,.zr-gift-alert').count(), 0, 'Effect and banner expire together');
    await page.evaluate(() => r());
    assert.equal(await page.locator('.zr-gift-celebration').count(), 0, 'An expired gift does not return after redraw');
    await receive('gift.received', { ...gift, id: 'wrong-call', callId: 'old-call' });
    assert.equal(await page.locator('.zr-gift-celebration').count(), 0, 'A receipt from another call cannot animate here');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await receive('gift.received', { ...gift, id: 'receipt-2', giftName: '<img src=x onerror=alert(1)>', mediaUrl: 'javascript:alert(1)' });
    assert.equal(await page.locator('.zr-gift-stage-art img').count(), 0, 'Unsafe media falls back to the gift emoji');
    assert.equal(await page.locator('.zr-gift-alert strong img').count(), 0, 'Gift names are escaped');
    const animations = await page.locator('.zr-gift-celebration').evaluate(el => [el, ...el.querySelectorAll('*')].map(node => getComputedStyle(node).animationName));
    assert.ok(animations.every(name => name === 'none'), 'Gift artwork has no additional CSS movement');
    await page.evaluate(() => go('home'));
    assert.deepEqual(await page.evaluate(() => [Room.giftMotion, Room.giftTimer, Room.gift]), [null, null, null], 'Leaving the call clears visual state and its timer');
    await page.evaluate(() => { S.callId = 'next-call'; go('hcall'); });
    assert.equal(await page.locator('.zr-gift-celebration').count(), 0, 'A subsequent call starts without the previous gift');
    await receive('gift.received', { ...gift, id: 'receipt-3', callId: 'next-call' });
    await receive('session.expired', {});
    assert.deepEqual(await page.evaluate(() => [Room.giftMotion, Room.giftTimer]), [null, null], 'Session expiry cancels a running celebration');

    await page.route('https://gift-layout.fixture.test/**', route => {
      const shape=new URL(route.request().url()).pathname.slice(1),[width,height]=({portrait:[540,960],landscape:[960,540],square:[640,640]})[shape];
      const body=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#8752df" fill-opacity=".35"/><path d="M8 8H${width-8}V${height-8}H8Z" fill="none" stroke="#ffd900" stroke-width="16"/><text x="50%" y="50%" text-anchor="middle" fill="white" font-size="48">Complete ${shape} gift</text></svg>`;
      return route.fulfill({contentType:'image/svg+xml',body});
    });
    let receipt=20;
    for(const view of ['hcall','call','voice']) {
      const user=view==='hcall'?host:{id:'gift-layout-member',name:'Member',role:'sender',serverRole:'user',hostStatus:'none',isVerifiedHost:false};
      await receive('session',{user,verification:view==='hcall'?'verified':'none',requiresOnboarding:false});
      await receive('data.home',{hosts:[{id:host.id,name:host.name,role:'host',verified:true,ratePerMin:0,entryFee:0}],total:1,page:1});
      await page.evaluate(({view,hostId})=>{S.callId='fullscreen-gift-'+view;S.caller={id:'caller',n:'Imran',callId:S.callId,voice:false};go(view,view==='hcall'?undefined:hostId)}, {view,hostId:host.id});
      for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:768,height:1024}]) {
        await page.setViewportSize(viewport);
        for(const shape of ['portrait','landscape','square']) {
          await receive('gift.received',{...gift,id:'fullscreen-'+receipt++,callId:'fullscreen-gift-'+view,giftName:'Uploaded '+shape,coins:25000,mediaUrl:'https://gift-layout.fixture.test/'+shape});
          await checkFullscreenGift(page,`${view} ${viewport.width}x${viewport.height} ${shape}`);
          if(view==='hcall'&&viewport.width===320&&shape==='landscape')await page.screenshot({path:path.join(root,'artifacts','host-gift-fullscreen-landscape.png')});
          if(view==='call'&&viewport.width===390&&shape==='portrait')await page.screenshot({path:path.join(root,'artifacts','member-gift-fullscreen-portrait.png')});
        }
      }
    }
    assert.deepEqual(errors, [], 'No browser errors');
    console.log('PASS gift motion: receipts, deduplication, expiry, cleanup; fullscreen uncropped portrait/landscape/square artwork for host, member and voice calls at 320px, 390px, landscape and tablet sizes');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
