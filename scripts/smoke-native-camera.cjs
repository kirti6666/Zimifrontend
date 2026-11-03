/* Optional physical-device check. Forward its debug WebView socket to 9223,
   keep the app foreground, then run this script. Never starts a real call. */
const { chromium } = require('playwright');
const { spawnSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const path = require('node:path');

(async () => {
  if (!process.env.NATIVE_MEDIA_CDP) {
    const serial = spawnSync('adb', ['shell', 'pidof', 'com.aurora.liveapp'], { encoding: 'utf8', windowsHide: true }).stdout?.trim();
    if (!/^\d+$/.test(serial || '')) throw new Error('Launch the debug app before running this check.');
    const forward = spawnSync('adb', ['forward', 'tcp:9223', `localabstract:webview_devtools_remote_${serial}`], { windowsHide: true });
    if (forward.status !== 0) throw new Error('Could not connect to the debug app WebView.');
  }
  const browser = await chromium.connectOverCDP(process.env.NATIVE_MEDIA_CDP || 'http://127.0.0.1:9223');
  const page = browser.contexts().flatMap(context => context.pages()).find(Boolean);
  if (!page) throw new Error('No debug app WebView was found.');
  let saved;
  const marker = `native-camera-smoke-${Date.now()}`;
  spawnSync('adb', ['shell', 'log', '-t', 'BinzoNativeSmoke', marker], { windowsHide: true });
  try {
    saved = await page.evaluate(() => {
      if (!window.ZimiMedia?.native) throw new Error('This app is not using native media.');
      if (S.bgCall || ['call', 'hcall', 'voice', 'dial', 'dialback', 'ring', 'switch'].includes(S.v)) throw new Error('End the active call before running the camera check.');
      if (ZimiMedia.hasVideo()) throw new Error('Close the current camera preview before running this isolated check.');
      const params = ZimiBeauty.getParams();
      const panel = document.createElement('div'); panel.id = 'native-camera-smoke';
      panel.style.cssText = 'position:fixed;inset:12px;z-index:2147483640;background:var(--canvas);display:grid;grid-template-rows:1fr auto;gap:10px;padding:12px';
      panel.innerHTML = '<video data-zimi-local autoplay muted playsinline style="width:100%;height:100%;min-height:0;object-fit:contain;background:transparent"></video><p style="color:var(--ink);background:var(--canvas);padding:12px">Checking native camera and beauty…</p>';
      document.getElementById('screen').append(panel);
      return params;
    });
    const capture = await page.evaluate(async () => {
      const result = await ZimiMedia.prepare(true);
      ZimiBeauty.setParam('smoothing', .6);
      return result;
    });
    await page.waitForFunction(() => ['ready', 'error'].includes(ZimiBeauty.getState().status), undefined, { timeout: 30000 });
    const beauty = await page.evaluate(() => ({ status: ZimiBeauty.getState().status }));
    // Allow several independent processed-frame measurement windows.
    await new Promise(resolve => setTimeout(resolve, 6500));
    if (process.argv.includes('--screenshot')) {
      const screenshot = spawnSync('adb', ['exec-out', 'screencap', '-p'], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
      if (screenshot.status === 0) writeFileSync(path.join(__dirname, '../artifacts/native-camera-device.png'), screenshot.stdout);
    }
    const logs = spawnSync('adb', ['logcat', '-d', '-s', 'BinzoBeauty:I', 'BinzoNativeSmoke:I', '*:S'], { encoding: 'utf8', windowsHide: true });
    const lines = (logs.stdout || '').split(/\r?\n/), start = lines.findIndex(line => line.includes(marker));
    const measurements = lines.slice(start + 1).filter(line => /capture GL:|camera \d+x\d+ rot/.test(line)).slice(-5);
    console.log(JSON.stringify({ capture, beauty, measurements }, null, 2));
    if (beauty.status !== 'ready' || !measurements.some(line => /camera \d+x\d+ rot/.test(line))) process.exitCode = 1;
  } finally {
    if (saved) await page.evaluate(params => {
      // Navigation may have handed capture to the person using the phone.
      // Never stop a call or a preview started after this check's panel left.
      if (!document.getElementById('native-camera-smoke') || S.bgCall || ['call', 'hcall', 'voice', 'dial', 'dialback', 'ring', 'switch'].includes(S.v)) return;
      ZimiMedia.stop();
      document.getElementById('native-camera-smoke')?.remove();
      // Restore only the one setting changed by this check.
      ZimiBeauty.setParam('smoothing', params.smoothing);
      ZimiMedia.attach();
    }, saved).catch(() => {});
    await browser.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
