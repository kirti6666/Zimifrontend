/* Bundled after the unmodified Facebetter UMD wrapper. No credentials here.
   The SDK asks the DOM for two WebGL canvases. In a dedicated worker those
   lookups resolve to OffscreenCanvas; page origin and user agent stay native. */
(function () {
  'use strict';
  let engine = null;
  const errorCodes=new Set(['TIMEOUT','NETWORK_ERROR','WASM_LOAD_ERROR','LICENSE_ERROR','ENGINE_CREATE_FAILED','UNKNOWN_ERROR','WORKER_UNSUPPORTED','WORKER_TRANSPORT','WORKER_OPERATION']);
  const allowed = new Set(['setBeautySkinOnly','setSmoothing','setSmoothingStyle','setWhitening','setWhiteningStyle','setRosiness','setBlemish','setClarity','setBrightness','setContrast','setSaturation','setColorTemperature','setColorTint','setReshape','setBodyReshape','setLipstick','setLipstickColor','setBlush','setBlushStyle','setBlushColor','setContour','setContourStyle','setEyeShadow','setEyeShadowStyle','setEyeShadowColor','setEyeLiner','setEyeLinerStyle','setEyeLinerColor','setEyebrow','setEyebrowStyle','setEyebrowColor','setEyelash','setEyelashStyle','setEyelashColor','setPupil','setPupilColor','setTeethWhiten','setFilter','clearFilter','setFilterIntensity','setSticker','clearSticker','set3DSticker','clear3DSticker','setVirtualBackground','setVirtualBackgroundBlur','clearVirtualBackground','setChromaKey','clearChromaKey','setChromaKeySimilarity','setChromaKeySmoothness','setChromaKeyDesaturation','setSubjectOutline']);
  function unsupported() { throw Object.assign(new Error('Worker graphics unavailable.'), { code: 'WORKER_UNSUPPORTED' }); }
  function prepare() {
    if (typeof OffscreenCanvas !== 'function' || typeof ImageData !== 'function') unsupported();
    const probe = new OffscreenCanvas(8, 8), gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) unsupported();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    const canvases = new Map();
    self.document = {
      getElementById: id => canvases.get(id) || null,
      querySelector: selector => canvases.get(selector.replace(/^#/, '')) || null,
      createElement(tag) {
        if (tag !== 'canvas') unsupported();
        const canvas = new OffscreenCanvas(8, 8);canvas.style = {};
        canvas.remove = () => canvases.delete(canvas.id);return canvas;
      },
      body: { appendChild(canvas) { canvases.set(canvas.id, canvas);return canvas; } },
      getElementsByTagName: () => [],addEventListener() {},removeEventListener() {}
    };
  }
  self.onmessage = async ({ data }) => {
    const { id, type } = data;
    let method;
    try {
      if (type === 'probe') { prepare();self.postMessage({ id, ok: true, origin: location.origin });return; }
      if (type === 'destroy') { engine?.destroy();engine = null;self.postMessage({ type: 'destroyed' });return; }
      if (type === 'init') {
        engine = new Facebetter.BeautyEffectEngine(new Facebetter.EngineConfig({ licenseToken: data.token }));
        await engine.setLogConfig({ consoleEnabled: false, fileEnabled: false, level: 4 });
        await engine.init({ ...data.options, onProgress: progress => self.postMessage({ type: 'progress', percent: progress.percent }) });
        engine.setCallbacks({ onEngineEvent: code => self.postMessage({ type: 'event', code }) });
        self.postMessage({ id, ok: true });return;
      }
      if (!engine?.initialized) throw Object.assign(new Error('Worker engine unavailable.'), { code: 'WORKER_TRANSPORT' });
      if (type === 'resource') { engine.addResourcePack(data.bytes);self.postMessage({ id, ok: true });return; }
      if (type === 'apply') {
        for (const [operation, args] of data.commands) {
          if (!allowed.has(operation)) throw new Error('Invalid effect command.');
          method=operation;
          engine[operation](...args);
        }
        self.postMessage({ id, ok: true });return;
      }
      if (type === 'frame') {
        const input = new ImageData(new Uint8ClampedArray(data.buffer), data.width, data.height), started = performance.now();
        const result = engine.processImage(input, data.width, data.height, data.frameType, data.mirrorMode);
        const costMs = performance.now() - started;
        if (!result) { self.postMessage({ id, ok: true, empty: true, costMs });return; }
        self.postMessage({ id, ok: true, buffer: result.data.buffer, width: result.width, height: result.height, costMs }, [result.data.buffer]);return;
      }
      throw new Error('Invalid worker request.');
    } catch (error) {
      // SDK diagnostics can contain license data. Only a code and the known
      // operation we called cross threads; never forward provider messages.
      const code=Number.isInteger(error?.code)&&error.code>=-7&&error.code<=-1 || errorCodes.has(error?.code) ? error.code : 'WORKER_OPERATION';
      self.postMessage({ id, ok: false, code, ...(method?{method}:{}) });
    }
  };
})();
