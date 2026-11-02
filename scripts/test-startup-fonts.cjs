/* A slow optional font host must never block the app's classic scripts/ready
   message. Most UI fixtures abort HTTPS, which does not exercise this case. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {once}=require('node:events');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
  const server=http.createServer((_request,response)=>{response.setHeader('Content-Type','text/html');response.end(fs.readFileSync(path.join(root,'assets/aurora.html')))});
  server.listen(0,'127.0.0.1');await once(server,'listening');let browser;
  try{
    browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
    const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    let heldFont;await page.route('https://**/*',route=>{
      if(new URL(route.request().url()).hostname==='fonts.googleapis.com'){heldFont=route;return}
      return route.abort();
    });
    await page.addInitScript(()=>{window.fontQaMessages=[];window.ReactNativeWebView={postMessage:message=>fontQaMessages.push(JSON.parse(message))}});
    await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'commit'});
    await page.waitForFunction(()=>window.fontQaMessages.some(message=>message.type==='ready'&&message.data.demo===false)&&document.querySelector('#screen')?.childElementCount>0,{},{timeout:5000});
    assert.ok(heldFont,'The external font request is still pending during the first render');
    assert.equal(await page.evaluate(()=>typeof Native),'object');
    assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#screen')).display==='none'),false);
    await heldFont.fulfill({status:200,contentType:'text/css',body:'/* Optional font service has recovered. */'});
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('link[rel=stylesheet]')).filter(link=>link.href.includes('fonts.googleapis.com')).every(link=>link.media==='all'));
    assert.equal(await page.evaluate(()=>fontQaMessages.filter(message=>message.type==='ready').length),1,'Recovering fonts never restarts the app or session');
    assert.deepEqual(errors,[]);
    console.log('PASS startup fonts: app renders and reports ready while Google Fonts remains pending; recovery preserves the running document.');
  }finally{await browser?.close();server.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
