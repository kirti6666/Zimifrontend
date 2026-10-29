const { chromium } = require('playwright');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => { window.__sent=[]; window.ReactNativeWebView={postMessage: raw => __sent.push(JSON.parse(raw))}; });
    await page.goto(pathToFileURL(path.join(root, 'assets/aurora.html')).href);
    await page.evaluate(() => {
      Native.receive({type:'session',data:{user:{id:'507f1f77bcf86cd799439001',name:'Preview',role:'sender',serverRole:'user',hostStatus:'none',isPhoneVerified:true},requiresOnboarding:false}});
      Native.receive({type:'wallet.balance',data:{coins:52400,earningsPaise:0}});
      go('coins');
      Native.receive({type:'data.catalog',data:{paymentsAvailable:true,gifts:[],packs:[
        {id:'pack-1',name:'Starter',coins:200,pricePaise:9799,bonusPercent:100},
        {id:'pack-2',name:'Everyday',coins:625,pricePaise:24999,bonusPercent:150},
        {id:'pack-3',name:'More to share',coins:1125,pricePaise:49999,bonusPercent:125},
        {id:'pack-4',name:'Creator fan',coins:2500,pricePaise:98999,bonusPercent:150,badge:'hot'},
        {id:'pack-5',name:'Big moments',coins:3750,pricePaise:149999,bonusPercent:150},
        {id:'pack-6',name:'Celebration',coins:5000,pricePaise:199999,bonusPercent:150,badge:'popular'}
      ]}});
      coinSelectPack('pack-3');
    });
    for (const [width,height] of [[390,844],[320,568],[590,1080]]) {
      await page.setViewportSize({width,height});
      await page.screenshot({path:path.join(__dirname,`coins-${width}x${height}.png`)});
    }
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
