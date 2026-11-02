/* Opt-in, real SDK pixel verification. Set FACEBETTER_TEST_LICENSE_FILE to an
   authorized Web license for https://aurora.localhost. The file is read only
   into memory; no credentials, screenshots, browser traces or raw SDK logs are
   written. Every network request is intercepted and only local assets exist. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const origin = 'https://aurora.localhost';
const runtime = path.join(root, 'node_modules/facebetter-core/dist');
const files = {
  '/sdk.js': [path.join(root, 'node_modules/facebetter/dist/facebetter.js'), 'application/javascript'],
  '/runtime/2.2.1/facebetter-core.js': [path.join(runtime, 'facebetter-core.js'), 'application/javascript'],
  '/runtime/2.2.1/facebetter-core.wasm': [path.join(runtime, 'facebetter-core.wasm'), 'application/wasm'],
  '/runtime/2.2.1/resource.fbd': [path.join(runtime, 'resource.fbd'), 'application/octet-stream'],
  '/natural.fbd': [path.join(root, 'web/facebetter/effects/natural.fbd'), 'application/octet-stream'],
  '/vivid.fbd': [path.join(root, 'web/facebetter/effects/vivid.fbd'), 'application/octet-stream']
};

(async () => {
  assert.ok(process.env.FACEBETTER_TEST_LICENSE_FILE, 'Set FACEBETTER_TEST_LICENSE_FILE explicitly to run the licensed visual check.');
  let licenseToken;
  try { licenseToken = fs.readFileSync(process.env.FACEBETTER_TEST_LICENSE_FILE, 'utf8'); }
  catch { assert.fail('FACEBETTER_TEST_LICENSE_FILE must identify a readable license file.'); }
  assert.ok(licenseToken.trim(), 'FACEBETTER_TEST_LICENSE_FILE must contain a license.');
  let browser;
  const requested = new Set();
  let blocked = 0, pageErrors = 0;
  try {
    browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin && url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><body><script src="/sdk.js"></script></body>' });
      const file = url.origin === origin && files[url.pathname];
      if (!file) { blocked++; return route.abort(); }
      requested.add(url.pathname);
      return route.fulfill({ contentType: file[1], body: fs.readFileSync(file[0]) });
    });
    const page = await context.newPage();
    // SDK/provider diagnostics can contain license data; never forward them.
    page.on('pageerror', () => { pageErrors++; });
    await page.goto(origin);
    const catalog = "window.ZIMI_FACEBETTER_PLAN='pro+';\n" + fs.readFileSync(path.join(root, 'web/beauty-catalog.js'), 'utf8');
    const controller = fs.readFileSync(path.join(root, 'web/beauty.js'), 'utf8').replace(/__FB_EFFECT_([a-z0-9_]+)__/g, (_, name) => fs.readFileSync(path.join(root, 'web/facebetter/effects', name + '.fbd')).toString('base64'));
    const result = await page.evaluate(async ({ licenseToken, catalog, controller, origin }) => {
      const sdk = window.Facebetter, width = 160, height = 120;
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
      const center = image => Array.from(image.data.slice((60 * width + 80) * 4, (60 * width + 80) * 4 + 3));
      const difference = (image, baseline) => {
        let changedPixels = 0, maxRgbDifference = 0;
        for (let index = 0; index < image.data.length; index += 4) {
          let significant = false;
          for (let channel = 0; channel < 3; channel++) {
            const distance = Math.abs(image.data[index + channel] - baseline.data[index + channel]);
            if (distance > 4) significant = true;
            maxRgbDifference = Math.max(maxRgbDifference, distance);
          }
          if (significant) changedPixels++;
        }
        return { changedPixels, maxRgbDifference, center: center(image) };
      };
      const makeInput = kind => {
        const image = new ImageData(width, height);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          const index = (y * width + x) * 4;
          image.data.set(kind === 'solid' ? [180, 100, 70, 255] : [Math.round(x / (width - 1) * 255), Math.round(y / (height - 1) * 255), Math.round((x + y) / (width + height - 2) * 255), 255], index);
        }
        return image;
      };
      const fail = (stage, error) => ({ failure: { stage, code: typeof error?.code === 'number' ? error.code : null } });
      const process = (engine, input) => engine.processImage(input, width, height, sdk.FrameType.Video, sdk.MirrorMode.None);
      const engine = new sdk.BeautyEffectEngine(new sdk.EngineConfig({ licenseToken }));
      const baselines = {}, samples = [];
      let stage = 'SDK initialization';
      try {
        await engine.setLogConfig({ consoleEnabled: false, fileEnabled: false, level: 4 });
        await engine.init({ timeout: 30000, wasmUrl: origin + '/runtime/2.2.1/facebetter-core.js', assetBaseUrl: origin + '/runtime/2.2.1/' });
        const natural = new Uint8Array(await (await fetch(origin + '/natural.fbd')).arrayBuffer());
        const vivid = new Uint8Array(await (await fetch(origin + '/vivid.fbd')).arrayBuffer());
        for (const kind of ['solid', 'gradient']) {
          const input = makeInput(kind);
          engine.clearFilter(); engine.setBrightness(0); engine.setBeautySkinOnly(false);
          // Capture a distinct neutral output, including any SDK watermark,
          // before changing controls. Never compare an image with itself.
          const neutral = process(engine, input);
          const baseline = new ImageData(new Uint8ClampedArray(neutral.data), width, height);
          baselines[kind] = baseline;
          const cases = [
            ['brightness', () => engine.setBrightness(.5)],
            ['natural', () => { engine.setBrightness(0); engine.setFilter(natural); engine.setFilterIntensity(.8); }],
            ['vivid', () => { engine.setFilter(vivid); engine.setFilterIntensity(1); }]
          ];
          for (const [effect, select] of cases) {
            stage = kind + ' ' + effect;
            select();
            for (let index = 0; index < 4; index++) {
              const image = process(engine, input);
              samples.push({ kind, effect, frame: index + 1, baselineCenter: center(baseline), ...difference(image, baseline) });
              await frame();
            }
          }
        }
      } catch (error) { return fail(stage, error); }
      finally { engine.destroy(); }

      // Exercise the production controller's actual canvas capture path too.
      window.DEMO = false;
      window.S = { bsel: { Beauty: 0, Makeup: 0, Sticker: 0, Filters: 0, 'Image quality': 0 } };
      window.BEAUTY = Object.fromEntries(Object.keys(S.bsel).map(key => [key, Array(6)]));
      window.Native = { handlers: {}, on(type, handler) { (this.handlers[type] ||= []).push(handler); }, send(type, data) { if (type === 'beauty.auth') for (const handler of this.handlers[type] || []) handler({ requestId: data.requestId, licenseToken }); } };
      window.ZIMI_FACEBETTER_RUNTIME = origin + '/runtime/2.2.1/';
      for (const source of [catalog, controller]) { const script = document.createElement('script'); script.textContent = source; document.head.append(script); }
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const paint = canvas.getContext('2d'), input = makeInput('gradient');
      paint.putImageData(input, 0, 0);
      const source = canvas.captureStream(24), timer = setInterval(() => paint.putImageData(input, 0, 0), 40);
      const video = document.createElement('video'); video.muted = true; video.playsInline = true;
      document.body.append(video);
      const readback = document.createElement('canvas'); readback.width = width; readback.height = height;
      const read = readback.getContext('2d', { willReadFrequently: true });
      let handle, output;
      const capture = async effect => {
        const deadline = performance.now() + 5000;
        while (performance.now() < deadline) {
          await frame();
          if (video.readyState < 2) continue;
          read.drawImage(video, 0, 0, width, height);
          const comparison = difference(read.getImageData(0, 0, width, height), baselines.gradient);
          if (comparison.changedPixels > width * height / 2 && comparison.maxRgbDifference > 10) return { effect, ...comparison };
        }
        throw new Error('No visible output frame');
      };
      const outputSamples = [];
      let cleanup;
      try {
        stage = 'controller brightness';
        ZimiBeauty.setParam('brightness', .5);
        handle = await ZimiBeauty.create(source);
        if (!handle) return fail(stage);
        output = handle.stream.getVideoTracks()[0];
        video.srcObject = handle.stream; await video.play();
        outputSamples.push(await capture('brightness'));
        for (const [id, intensity] of [['natural', .8], ['vivid', 1]]) {
          stage = 'controller ' + id;
          ZimiBeauty.setParam('brightness', 0); ZimiBeauty.setParam('filterIntensity', intensity); ZimiBeauty.setParam('filterId', id);
          const next = await ZimiBeauty.create(source);
          if (next !== handle) return fail('stable controller output');
          // Require the latest control, rather than accidentally sampling the
          // preceding effect's still-live canvas frame.
          const expected = samples.find(sample => sample.kind === 'gradient' && sample.effect === id).center;
          const deadline = performance.now() + 5000;
          let observed;
          do {
            observed = await capture(id);
            if (observed.center.every((value, channel) => Math.abs(value - expected[channel]) <= 4)) break;
            await frame();
          } while (performance.now() < deadline);
          outputSamples.push({ ...observed, expectedCenter: expected });
        }
        const outputLive = output.readyState === 'live';
        ZimiBeauty.stop();
        cleanup = { outputEnded: output.readyState === 'ended', rawSurvivesProcessorStop: source.getVideoTracks()[0].readyState === 'live', controllerIdle: ZimiBeauty.getState().status === 'idle' };
        source.getTracks().forEach(track => track.stop());
        cleanup.rawEndedAfterExplicitStop = source.getTracks().every(track => track.readyState === 'ended');
        return { origin: location.origin, samples, outputSamples, outputLive, cleanup };
      } catch (error) { return fail(stage, error); }
      finally {
        clearInterval(timer); ZimiBeauty.stop(); source.getTracks().forEach(track => track.stop());
        video.pause(); video.srcObject = null; video.remove(); canvas.width = canvas.height = readback.width = readback.height = 0;
      }
    }, { licenseToken, catalog, controller, origin });
    licenseToken = null;
    assert.ok(!result.failure, result.failure ? `Licensed visual check failed during ${result.failure.stage} (code ${result.failure.code}).` : 'Visual check completed');
    assert.equal(result.origin, origin, 'License checks use the real application origin');
    assert.equal(result.samples.length, 24);
    for (const sample of result.samples) {
      const label = `${sample.kind} ${sample.effect} frame ${sample.frame}`;
      assert.ok(sample.changedPixels > 160 * 120 / 2, `${label} changes most pixels against the neutral SDK baseline`);
      assert.ok(sample.maxRgbDifference > 10, `${label} changes colors visibly`);
      if (sample.effect === 'brightness') assert.ok(sample.center.every((value, channel) => value - sample.baselineCenter[channel] > 25), `${label} raises every center color channel`);
    }
    for (const kind of ['solid', 'gradient']) {
      const natural = result.samples.find(sample => sample.kind === kind && sample.effect === 'natural').center;
      const vivid = result.samples.find(sample => sample.kind === kind && sample.effect === 'vivid').center;
      assert.ok(natural.some((value, channel) => Math.abs(value - vivid[channel]) > 10), `${kind} Natural and Vivid produce distinct colors`);
    }
    for (const sample of result.outputSamples) {
      if (sample.expectedCenter) assert.ok(sample.center.every((value, channel) => Math.abs(value - sample.expectedCenter[channel]) <= 4), `${sample.effect} controller output matches the selected SDK filter`);
    }
    assert.equal(result.outputSamples.length, 3);
    assert.equal(result.outputLive, true);
    assert.deepEqual(result.cleanup, { outputEnded: true, rawSurvivesProcessorStop: true, controllerIdle: true, rawEndedAfterExplicitStop: true });
    for (const file of Object.keys(files)) assert.ok(requested.has(file), `${file} comes from local pinned assets`);
    assert.equal(pageErrors, 0, 'No browser script errors');
    assert.equal(blocked, 0, 'No external or unexpected requests');
    console.log('Facebetter licensed visual check passed:', JSON.stringify({ origin, visualEffectsVerified: true, directPixelFrames: result.samples.length, controllerEffects: result.outputSamples.map(({ effect, center }) => ({ effect, center })), outputLive: result.outputLive, cleanup: result.cleanup, externalRequests: blocked }));
  } finally { licenseToken = null; if (browser) await browser.close(); }
})().catch(error => {
  // Assertion messages above contain only controlled labels/pixel metadata.
  // Unexpected SDK/browser errors are deliberately not printed or serialized.
  console.error(error instanceof assert.AssertionError ? error.message : 'Facebetter visual check failed before completion; secret-bearing diagnostics suppressed.');
  process.exitCode = 1;
});
