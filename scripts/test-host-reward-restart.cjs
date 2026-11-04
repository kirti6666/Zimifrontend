/* Isolated production WebView fixtures: no server account or money is changed. */
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const owner='507f1f77bcf86cd799439011',periodId='507f1f77bcf86cd799439081',nextPeriod='2026-11-15T18:30:00.000Z';
const host={user:{id:owner,name:'Video host',role:'host',serverRole:'host',hostStatus:'approved',isVerifiedHost:true,isPhoneVerified:true},verification:'verified',requiresOnboarding:false};
const member={user:{...host.user,id:'507f1f77bcf86cd799439001',role:'sender',serverRole:'user',hostStatus:'none',isVerifiedHost:false},verification:'none',requiresOnboarding:false};
const restart={eligible:true,periodId,behindMinutes:3900,thresholdMinutes:1200,nextPeriodStart:nextPeriod,pendingDiamonds:80};
const wallet={currency:'diamonds',coins:0,earningsPaise:269000,reservedPaise:0,minimumWithdrawalPaise:200000,withdrawalsEnabled:true,diamondUnits:13450000000,reservedDiamondUnits:0,diamondScale:1000000,
 hostEarningsPolicy:{enabled:true,version:2,callBonusAvailable:true,bonusExample:{callDiamonds:2800,bonusDiamonds:1300,giftDiamonds:4100},hostWeeklyTargetMinutes:1950,periodWeeks:4,activityBasis:'paid_video',paisePerDiamond:20,minimumWithdrawalDiamonds:10000,wholeBalanceWithdrawal:true,hostRules:''},
 hostReward:{periodStart:'2026-10-25T18:30:00.000Z',periodEnd:'2026-11-22T18:30:00.000Z',weekNumber:3,periodWeeks:4,activityBasis:'paid_video',weeklyTargetMinutes:1950,weekMinutes:[0,0,0,0],thisWeekMinutes:0,thisWeekTargetMinutes:5850,remainingThisWeekMinutes:5850,lastWeekMinutes:0,pendingDiamonds:580,pendingPaise:11600,status:'pending',restart}};
const receive=(page,type,data)=>page.evaluate(message=>Native.receive(message),{type,data});
const sent=page=>page.evaluate(()=>__sent.filter(message=>message.type==='host.reward.restart').map(message=>message.data));
const go=(page,view)=>page.evaluate(view=>go(view),view);
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];
  page.setDefaultTimeout(6000);page.on('pageerror',error=>errors.push(error.message));await page.route('https://**/*',route=>route.abort());
  await page.addInitScript(()=>{window.__sent=[];window.ReactNativeWebView={postMessage:raw=>__sent.push(JSON.parse(raw))}});
  await page.goto(pathToFileURL(path.join(root,'assets/aurora.html')).href+'?role=host');
  await receive(page,'session',host);await receive(page,'wallet.balance',wallet);await go(page,'payout');
  assert.equal(await page.locator('.zpay-rules>section').count(),7);const rules=await page.locator('.zpay-rules').innerText();
  assert.match(rules,/Only time on a paid video call counts/);assert.match(rules,/Over 20 hours behind/);assert.match(rules,/Offline:[\s\S]*won't appear on Explore[\s\S]*Calls from chat still come through/);
  assert.doesNotMatch(rules,/28%|13%|41%|per 100 coins|agency share|platform share/);
  await page.getByRole('button',{name:'Restart reward period',exact:true}).click();
  assert.match(await page.getByRole('region',{name:'Confirm reward restart',exact:true}).innerText(),/cancels 80 pending bonus diamonds/);assert.equal((await sent(page)).length,0,'Opening review never cancels a reward');
  await page.getByRole('button',{name:'Keep current period',exact:true}).click();assert.equal((await sent(page)).length,0);
  await page.getByRole('button',{name:'Restart reward period',exact:true}).click();
  await receive(page,'wallet.balance',{...wallet,hostReward:{...wallet.hostReward,restart:{...restart,pendingDiamonds:81}}});
  await page.getByRole('button',{name:'Confirm reward restart',exact:true}).click();assert.equal((await sent(page)).length,0,'Changed bonus needs a fresh review');
  await receive(page,'wallet.balance',wallet);await page.getByRole('button',{name:'Restart reward period',exact:true}).click();
  await page.getByRole('button',{name:'Confirm reward restart',exact:true}).click();await page.evaluate(()=>hrRestartConfirm());
  const first=(await sent(page)).at(-1);assert.equal((await sent(page)).length,1);assert.equal(first.expectedPendingDiamonds,80);assert.equal(first.confirmed,true);
  const stored=await page.evaluate(owner=>JSON.parse(localStorage.getItem(`binzo.host.reward-restart.${owner}`)),owner);
  assert.deepEqual(Object.keys(stored).sort(),['owner','periodId','idempotencyKey','expectedPendingDiamonds'].sort());
  await receive(page,'host.reward.restarted',{requestId:first.requestId,receipt:{periodId:'507f1f77bcf86cd799439099',idempotencyKey:first.idempotencyKey,cancelledPendingDiamonds:80,nextPeriodStart:nextPeriod}});
  assert.equal(await page.evaluate(()=>HostRewardRestart.busy),true,'Unrelated reply cannot clear the durable reference');
  await receive(page,'host.reward.error',{...first,status:503,message:'Response unavailable'});assert.equal(await page.getByRole('button',{name:'Retry same restart',exact:true}).count(),1);
  await page.reload();await receive(page,'session',host);
  const refreshed={...wallet,hostReward:{...wallet.hostReward,pendingDiamonds:500,restart:{...restart,eligible:false,periodId:'507f1f77bcf86cd799439082',pendingDiamonds:0}}};
  await receive(page,'wallet.balance',refreshed);await go(page,'payout');
  await page.getByRole('button',{name:'Retry same restart',exact:true}).click();const retry=(await sent(page)).at(-1);
  assert.equal(retry.idempotencyKey,first.idempotencyKey);assert.equal(retry.periodId,first.periodId);assert.equal(retry.expectedPendingDiamonds,80);
  await receive(page,'host.reward.restarted',{requestId:retry.requestId,receipt:{periodId:first.periodId,idempotencyKey:first.idempotencyKey,restartId:'507f1f77bcf86cd799439088',cancelledPendingDiamonds:80,nextPeriodStart:nextPeriod}});
  assert.equal(await page.evaluate(owner=>localStorage.getItem(`binzo.host.reward-restart.${owner}`),owner),null);
  assert.equal(await page.evaluate(()=>diamondOwnWallet().diamondUnits),wallet.diamondUnits,'Restart never mutates available Diamonds locally');
  assert.match(await page.getByRole('region',{name:'Reward restart',exact:true}).innerText(),/Week 1 starts/);
  for(const width of [320,390]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)}
  await page.screenshot({path:path.resolve(root,'..','.codex-reference','host-withdraw-rules-390.png'),fullPage:true});
  const zeroPeriod='507f1f77bcf86cd799439083';
  await receive(page,'wallet.balance',{...wallet,hostReward:{...wallet.hostReward,pendingDiamonds:500,restart:{...restart,periodId:zeroPeriod,pendingDiamonds:0}}});
  await page.getByRole('button',{name:'Restart reward period',exact:true}).click();
  assert.match(await page.getByRole('region',{name:'Confirm reward restart',exact:true}).innerText(),/cancels 0 pending bonus diamonds/,'Zero-activity periods still allow an explicit reviewed restart');
  await page.getByRole('button',{name:'Confirm reward restart',exact:true}).click();
  const zero=(await sent(page)).at(-1);assert.equal(zero.periodId,zeroPeriod);assert.equal(zero.expectedPendingDiamonds,0,'Legacy pending rewards are excluded from the zero-activity cancellation');
  await receive(page,'host.reward.restarted',{requestId:zero.requestId,receipt:{periodId:zeroPeriod,idempotencyKey:zero.idempotencyKey,restartId:'507f1f77bcf86cd799439089',cancelledPendingDiamonds:0,nextPeriodStart:nextPeriod}});
  assert.equal(await page.evaluate(owner=>localStorage.getItem(`binzo.host.reward-restart.${owner}`),owner),null);
  assert.equal(await page.evaluate(()=>diamondOwnWallet().diamondUnits),wallet.diamondUnits);
  await receive(page,'session',member);await receive(page,'wallet.balance',{currency:'coins',coins:200,earningsPaise:0});await go(page,'payout-rules');assert.equal(await page.locator('.zpay-rules').count(),0,'Members cannot open host rules');assert.equal(await page.locator('.zpay-restart').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS host reward rules/restart: seven text sections, host-only, video hours, offline copy, exact confirmed bonus, same-key recovery, owner guard, no split data,320/390px layouts');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
