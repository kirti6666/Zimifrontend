/* Facebetter processes the camera before WebRTC encoding. Credentials stay on
   the server; the native bridge supplies a short-lived license token only. */
(function () {
  'use strict';
  const STORAGE = 'zimi.beauty.v2', catalog = window.ZimiBeautyCatalog;
  const FILTERS = ['', 'natural', 'milk_tea', 'rose', 'japanese', 'vivid'];
  const STICKERS = ['', 'fox', 'black_glass', 'kiss2', 'mustache', 'fan_club'];
  const EFFECTS = {
    natural: '__FB_EFFECT_natural__', milk_tea: '__FB_EFFECT_milk_tea__',
    rose: '__FB_EFFECT_rose__', japanese: '__FB_EFFECT_japanese__', vivid: '__FB_EFFECT_vivid__',
    fox: '__FB_EFFECT_fox__', black_glass: '__FB_EFFECT_black_glass__',
    kiss2: '__FB_EFFECT_kiss2__', mustache: '__FB_EFFECT_mustache__', fan_club: '__FB_EFFECT_fan_club__'
  };
  const decoded = new Map(), downloads = new Map();
  // Keep optional effects within a mobile call's pixel and main-thread budget.
  // The camera itself retains its original capture size and framing.
  const EFFECT_FRAME_INTERVAL = 1000 / 24;
  function createFrameBudget() {
    const edges = [240, 320, 400, 480, 600, 720];
    let level = 3, costMs = 0, samples = 0, slow = 0, fast = 0, startedAt = null, changedAt = null, adjustments = 0;
    return {
      dimensions(width, height) {
        const scale = Math.min(1, edges[level] / Math.max(width, height));
        return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
      },
      observe(cost, now) {
        if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(now)) return;
        startedAt ??= now;
        costMs = samples++ ? costMs * .75 + cost * .25 : cost;
        slow = cost > 32 ? slow + 1 : 0;
        fast = cost < 14 && costMs < 18 ? fast + 1 : 0;
        // Drop promptly under sustained pressure, with a minimum dwell time.
        // Recover one step only after several seconds of consistently cheap work.
        if (level > 0 && (changedAt === null || now - changedAt >= 1200) && (cost > 70 || slow >= 3)) {
          level--;changedAt = now;adjustments++;slow = fast = 0;
        } else if (level < edges.length - 1 && fast >= 24 && now - (changedAt ?? startedAt) >= 5000) {
          level++;changedAt = now;adjustments++;slow = fast = 0;
        }
      },
      snapshot() { return { maxEdge: edges[level], costMs, intervalMs: Math.max(EFFECT_FRAME_INTERVAL, costMs * 2.1), samples, adjustments }; }
    };
  }
  // End of the pure frame-budget controller (also exercised with a virtual clock).
  let strengths = {}, epoch = 0, revision = 0, sequence = 0, pendingAuth = null, pending = null, current = null, failed = false;
  let params = catalog.createDefaultParams(), legacySelection = '';
  let changed, changedSignal=new Promise(resolve=>{changed=resolve});
  function revise() {
    revision++;
    changed();
    changedSignal=new Promise(resolve=>{changed=resolve});
  }
  const levels = {
    smoothing:'setSmoothing', whitening:'setWhitening', rosiness:'setRosiness', blemish:'setBlemish', clarity:'setClarity',
    brightness:'setBrightness', contrast:'setContrast', saturation:'setSaturation', colorTemperature:'setColorTemperature', colorTint:'setColorTint',
    lipstick:'setLipstick', blush:'setBlush', contour:'setContour', eyeshadow:'setEyeShadow', eyeliner:'setEyeLiner',
    eyebrow:'setEyebrow', eyelash:'setEyelash', pupil:'setPupil', teethWhiten:'setTeethWhiten'
  };
  const options = {
    smoothingStyle:catalog.SKIN_PRESETS.map(x=>({id:x.smoothingStyle})), whiteningStyle:catalog.WHITENING_STYLES,
    lipstickColor:catalog.LIPSTICK_COLORS, blushStyle:catalog.BLUSH_STYLES, blushColor:catalog.BLUSH_COLORS,
    contourStyle:catalog.CONTOUR_STYLES, eyeshadowStyle:catalog.EYESHADOW_STYLES, eyeshadowColor:catalog.EYESHADOW_COLORS,
    eyelinerStyle:catalog.EYELINER_STYLES, eyelinerColor:catalog.EYELINER_COLORS, eyebrowStyle:catalog.EYEBROW_STYLES,
    eyebrowColor:catalog.EYEBROW_COLORS, eyelashStyle:catalog.EYELASH_STYLES, eyelashColor:catalog.EYELASH_COLORS,
    pupilColor:catalog.PUPIL_COLORS
  };
  const bipolar = new Set(['brightness','contrast','saturation','colorTemperature','colorTint']);
  const validParam = (key, value) => {
    if (Object.hasOwn(options,key)) return options[key].some(x=>x.id===value);
    if (key==='filterId') return value===null || catalog.FILTER_IDS.includes(value);
    if (key==='stickerId') return value===null || catalog.STICKERS.some(x=>x.id===value);
    if (key==='bgPreset') return value===null || catalog.BG_PRESETS.some(x=>x.id===value);
    if (key==='chroma') return value===null || catalog.CHROMA_OPTIONS.some(x=>x.id===value);
    if (key==='skinOnly' || key==='subjectOutline') return typeof value==='boolean';
    return Object.hasOwn(params,key) && key!=='reshape' && key!=='bodyReshape' && typeof params[key]==='number' &&
      Number.isFinite(value) && value>=(bipolar.has(key)?-1:0) && value<=1;
  };
  function restore(saved) {
    if (!saved || typeof saved!=='object') return;
    for (const [key,value] of Object.entries(saved)) {
      if (key==='reshape' || key==='bodyReshape') {
        if (value && typeof value==='object') for (const [id,amount] of Object.entries(value)) {
          if (Object.hasOwn(params[key],id) && Number.isFinite(amount) && amount>=(key==='reshape'?-1:0) && amount<=1) params[key][id]=amount;
        }
      } else if (validParam(key,value)) params[key]=value;
    }
  }
  let state = { status: 'idle', message: 'Effects apply to your camera during video calls.' };
  try {
    const saved = JSON.parse(localStorage.getItem('zimi.beauty.v1') || 'null');
    if (saved && saved.selection && typeof S !== 'undefined') {
      Object.keys(BEAUTY).forEach(tab => {
        const value = saved.selection[tab];
        if (Number.isInteger(value) && value >= 0 && value < BEAUTY[tab].length) S.bsel[tab] = value;
      });
      if (saved.strengths && typeof saved.strengths === 'object') {
        Object.entries(saved.strengths).forEach(([key, value]) => {
          if (Number.isFinite(value) && value >= 0 && value <= 100) strengths[key] = value;
        });
      }
    }
  } catch (_) { /* Storage is optional on restricted devices. */ }
  importLegacy();
  try { restore(JSON.parse(localStorage.getItem(STORAGE)||'null')); } catch (_) {}

  function publish(status, message) {
    state = { status, message };
    document.querySelectorAll('[data-zimi-beauty-status]').forEach(el => { el.textContent = message; });
    document.querySelectorAll('[data-zimi-beauty-retry]').forEach(el => { el.hidden = status !== 'error'; });
    document.dispatchEvent(new CustomEvent('zimi:beauty-state', {detail:{...state}}));
  }
  function save() {
    try { localStorage.setItem(STORAGE, JSON.stringify(params)); } catch (_) {}
  }
  function strength(tab, index) { return strengths[`${tab}:${index}`] ?? 60; }
  function selected(tab) { return typeof S === 'undefined' ? 0 : S.bsel[tab] || 0; }
  function amount(tab) { return selected(tab) ? strength(tab, selected(tab)) / 100 : 0; }
  function importLegacy() {
    if (typeof S==='undefined' || !S.bsel) return;
    const selection=JSON.stringify({selection:S.bsel,strengths});
    if (selection===legacySelection) return;
    legacySelection=selection;
    const sdk=window.Facebetter,b=amount('Beauty'),beauty=selected('Beauty'),makeup=selected('Makeup'),q=amount('Image quality');
    Object.assign(params,{smoothing:beauty===1?b:0,whitening:beauty===2?b:0,clarity:beauty===3?b:0,
      lipstick:amount('Makeup'),filterId:amount('Filters')?FILTERS[selected('Filters')]:null,
      filterIntensity:amount('Filters')||.8,stickerId:STICKERS[selected('Sticker')]||null,
      colorTemperature:selected('Image quality')===1?q*.5:0,colorTint:selected('Image quality')===2?q*.4:0,
      brightness:selected('Image quality')===3?q*.3:0,saturation:selected('Image quality')===4?q*.5:0,contrast:selected('Image quality')===5?q*.4:0});
    params.reshape[sdk.Reshape.FaceVShape]=beauty===4?b*.5:0;
    params.reshape[sdk.Reshape.FaceThin]=beauty===5?b*.5:0;
    if (beauty) { params.skinOnly=true;params.smoothingStyle=sdk.SmoothingStyle.Natural; }
    if (makeup) params.lipstickColor=[0,sdk.LipstickColor.GentlePink,sdk.LipstickColor.CoralOrange,sdk.LipstickColor.Peach,sdk.LipstickColor.Berry,sdk.LipstickColor.RetroRed][makeup];
  }
  function wanted(p=params) {
    return Object.keys(levels).some(key=>p[key]!==0) || Object.values(p.reshape).some(Boolean) ||
      Object.values(p.bodyReshape).some(Boolean) || !!(p.filterId&&p.filterIntensity) || !!p.stickerId ||
      p.bgBlur>0 || !!p.bgPreset || p.chroma!==null || p.subjectOutline;
  }
  function bytes(name) {
    if (!decoded.has(name) && EFFECTS[name]) decoded.set(name, Uint8Array.from(atob(EFFECTS[name]), char => char.charCodeAt(0)));
    return decoded.get(name);
  }
  async function download(file) {
    if (!downloads.has(file)) downloads.set(file,(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
      try {
        const response=await fetch(window.ZIMI_FACEBETTER_RUNTIME+file,{signal:controller.signal,credentials:'omit'});
        if (!response.ok) throw new Error('Effect resources unavailable.');
        const data=new Uint8Array(await response.arrayBuffer());
        if (!data.length || data.length>20*1024*1024) throw new Error('Invalid effect resource.');
        return data;
      } finally { clearTimeout(timer); }
    })().catch(error=>{downloads.delete(file);throw error}));
    return downloads.get(file);
  }
  async function prepareEffects(handle,p,version) {
    const ids=[p.filterId,p.stickerId].filter(Boolean);
    await Promise.all(ids.map(async id=>{if(!bytes(id))decoded.set(id,await download('effects/'+id+'.fbd'))}));
    if (p.bgPreset && !decoded.has('bg:'+p.bgPreset)) decoded.set('bg:'+p.bgPreset,await download('backgrounds/'+p.bgPreset+'.jpg'));
    const packs=[];
    if (catalog.STICKERS.find(x=>x.id===p.stickerId)?.kind==='3d') packs.push('resource_3d.fbd');
    if (Object.values(p.bodyReshape).some(Boolean)) packs.push('resource_body.fbd');
    for (const pack of packs) if (!handle.packs.has(pack)) {
      let work = handle.packPromises.get(pack);
      if (!work) {
        const data=await download(pack);
        if(handle.destroyed || handle.epoch!==epoch || version!==revision) return;
        work = Promise.resolve(handle.engine.addResourcePack(data));handle.packPromises.set(pack, work);
      }
      try { await work;if (!handle.destroyed && handle.epoch === epoch) handle.packs.add(pack); }
      finally { if (handle.packPromises.get(pack) === work) handle.packPromises.delete(pack); }
    }
  }
  function resourcesReady(handle,p) {
    return (!p.filterId||!!bytes(p.filterId)) && (!p.stickerId||!!bytes(p.stickerId)) &&
      (!p.bgPreset||decoded.has('bg:'+p.bgPreset)) &&
      (catalog.STICKERS.find(x=>x.id===p.stickerId)?.kind!=='3d'||handle.packs.has('resource_3d.fbd')) &&
      (!Object.values(p.bodyReshape).some(Boolean)||handle.packs.has('resource_body.fbd'));
  }
  function apply(owner,p=params) {
    const handle = owner.engine.isWorker === true ? { ...owner } : owner;
    const engine=handle.engine,prev=handle.params||catalog.createDefaultParams();
    if (engine.isWorker === true) engine.beginBatch();
    // Avoid invoking unused licensed features even to set an initial zero.
    for (const [key,method] of Object.entries(levels)) if (p[key]!==0 || prev[key]!==0) engine[method](p[key]);
    for (const key of Object.keys(options)) {
      const group=key.replace(/Style$|Color$/,'');
      if (key==='smoothingStyle' ? p.smoothing>0 : key==='whiteningStyle' ? p.whitening>0 : p[group]>0) {
        const method='set'+({eyeshadow:'EyeShadow',eyeliner:'EyeLiner'}[group]||group[0].toUpperCase()+group.slice(1))+key.slice(group.length);
        if (!handle.params || prev[key]!==p[key] || prev[group]===0) engine[method](p[key]);
      }
    }
    engine.setBeautySkinOnly(p.skinOnly);
    for (const kind of ['reshape','bodyReshape']) for (const [id,value] of Object.entries(p[kind])) {
      if (value!==0 || prev[kind][id]!==0) engine[kind==='reshape'?'setReshape':'setBodyReshape'](Number(id),value);
    }
    const filter=p.filterId,sticker=p.stickerId;
    if (filter !== handle.filter) {
      if (filter) engine.setFilter(bytes(filter)); else if (handle.filter) engine.clearFilter();
      handle.filter = filter;
    }
    if (filter) engine.setFilterIntensity(p.filterIntensity);
    if (sticker !== handle.sticker) {
      const was3d=catalog.STICKERS.find(x=>x.id===handle.sticker)?.kind==='3d';
      if (handle.sticker) engine[was3d?'clear3DSticker':'clearSticker']();
      if (sticker) engine[catalog.STICKERS.find(x=>x.id===sticker)?.kind==='3d'?'set3DSticker':'setSticker'](bytes(sticker));
      handle.sticker = sticker;
    }
    if (p.chroma!==prev.chroma) { if(p.chroma===null)engine.clearChromaKey();else engine.setChromaKey(p.chroma); }
    if (p.chroma!==null) { engine.setChromaKeySimilarity(p.chromaSimilarity);engine.setChromaKeySmoothness(p.chromaSmoothness);engine.setChromaKeyDesaturation(p.chromaDesaturation); }
    if (p.bgBlur>0) engine.setVirtualBackgroundBlur(p.bgBlur);
    else if(p.bgPreset && (p.bgPreset!==prev.bgPreset || prev.bgBlur>0 || !handle.params)) engine.setVirtualBackground(decoded.get('bg:'+p.bgPreset));
    else if(!p.bgPreset && (prev.bgPreset || prev.bgBlur>0)) engine.clearVirtualBackground();
    if(p.subjectOutline || prev.subjectOutline) engine.setSubjectOutline(p.subjectOutline);
    handle.params=JSON.parse(JSON.stringify(p));
    if (engine.isWorker === true) return engine.commitBatch().then(() => {
      owner.params = handle.params;owner.filter = handle.filter;owner.sticker = handle.sticker;
    });
  }
  async function update(handle) {
    if (handle.updating) return handle.updating;
    handle.updating=(async()=>{
      let version;
      do {
        version=revision;
        const snapshot=JSON.parse(JSON.stringify(params));
        // A new choice wakes this update immediately; a slow obsolete download
        // must never delay Reset or overwrite the latest choice with an error.
        let prepared;
        try {
          prepared=await Promise.race([
            prepareEffects(handle,snapshot,version).then(()=>true),
            changedSignal.then(()=>false)
          ]);
        } catch(error) {
          if(version!==revision)continue;
          throw error;
        }
        if(handle.destroyed || handle.failed || handle.epoch!==epoch || !wanted())return null;
        if(!prepared)continue;
        if(version===revision) {
          await apply(handle,snapshot);
          handle.appliedRevision=version;
        }
      } while(version!==revision);
      publish('ready','Face effects are applied to the camera you share.');
      handle.wake?.();
      return handle;
    })().catch(error=>{
      if(!handle.destroyed && handle.epoch===epoch){handle.failed=true;handle.firstSettled?.(false);if(wanted())unavailable(error)}
      return null;
    }).finally(()=>{handle.updating=null});
    return handle.updating;
  }
  function license() {
    return new Promise((resolve, reject) => {
      const requestId = ++sequence;
      const timer = setTimeout(() => finish(new Error('Effects authorization timed out.')), 15000);
      const finish = (error, token) => {
        if (pendingAuth?.requestId !== requestId) return;
        pendingAuth = null;
        clearTimeout(timer);
        if (error) reject(error); else resolve(token);
      };
      pendingAuth = { requestId, finish };
      Native.send('beauty.auth', { requestId, userAgent: navigator.userAgent.slice(0,1024) });
    });
  }
  Native.on('beauty.auth', data => {
    if (data.requestId === pendingAuth?.requestId) pendingAuth.finish(null, data.licenseToken);
  });
  Native.on('operation.error', data => {
    if (data.action === 'beauty.auth' && data.requestId === pendingAuth?.requestId) pendingAuth.finish(new Error('Effects authorization failed.'));
  });

  function workerError(code) { return Object.assign(new Error(code === -5 ? 'Effects authorization failed.' : 'Effects worker unavailable.'), { code }); }
  function createWorkerEngine(token) {
    const url = URL.createObjectURL(new Blob([window.ZIMI_FACEBETTER_WORKER_SOURCE], { type: 'application/javascript' }));
    let worker;
    try { worker = new Worker(url); } catch (_) { URL.revokeObjectURL(url);throw workerError('WORKER_TRANSPORT'); }
    let next = 0, stopped = false, terminated = false, grace = 0, callbacks, progress;
    const requests = new Map(), events = [];
    const engine = { isWorker: true, initialized: false, processing: false, lastProcessMs: 0, commands: [] };
    const terminate = () => {
      if (terminated) return;terminated = true;clearTimeout(grace);
      worker.onmessage = worker.onerror = worker.onmessageerror = null;worker.terminate();URL.revokeObjectURL(url);
    };
    const rejectAll = code => { for (const request of requests.values()) { clearTimeout(request.timer);request.reject(workerError(code)); }requests.clear(); };
    const fail = code => { stopped = true;engine.initialized = false;rejectAll(code);terminate(); };
    const rpc = (type, data = {}, transfer = [], timeout = 30000) => new Promise((resolve, reject) => {
      if (stopped) { reject(workerError('WORKER_CANCELLED'));return; }
      const id = ++next, timer = setTimeout(() => fail('WORKER_TRANSPORT'), timeout);
      requests.set(id, { resolve, reject, timer });
      try { worker.postMessage({ ...data, id, type }, transfer); } catch (_) { fail('WORKER_TRANSPORT'); }
    });
    worker.onmessage = ({ data }) => {
      if (data?.type === 'destroyed') { terminate();return; }
      if (stopped) return;
      if (data?.type === 'progress') { progress?.({ percent: data.percent });return; }
      if (data?.type === 'event') {
        if (callbacks) callbacks.onEngineEvent?.(data.code);else events.push(data.code);return;
      }
      const request = requests.get(data?.id);if (!request) return;
      requests.delete(data.id);clearTimeout(request.timer);
      if (data.ok === true) request.resolve(data);else request.reject(workerError(data.code));
    };
    worker.onerror = worker.onmessageerror = event => { event.preventDefault?.();fail('WORKER_TRANSPORT'); };
    engine.setLogConfig = async () => {};
    engine.init = async options => {
      const probe = await rpc('probe', {}, [], 3000);
      if (probe.origin !== location.origin) throw workerError('WORKER_UNSUPPORTED');
      const { onProgress, ...settings } = options;progress = onProgress;
      await rpc('init', { token, options: settings }, [], (options.timeout || 60000) + 1000);
      engine.initialized = true;
    };
    engine.setCallbacks = value => { callbacks = value;events.splice(0).forEach(code => callbacks.onEngineEvent?.(code)); };
    engine.addResourcePack = bytes => rpc('resource', { bytes });
    engine.beginBatch = () => { engine.commands = []; };
    engine.commitBatch = () => { const commands = engine.commands;engine.commands = [];return rpc('apply', { commands }); };
    const methods = new Set([...Object.values(levels), 'setBeautySkinOnly','setReshape','setBodyReshape','setFilter','clearFilter','setFilterIntensity','setSticker','clearSticker','set3DSticker','clear3DSticker','setChromaKey','clearChromaKey','setChromaKeySimilarity','setChromaKeySmoothness','setChromaKeyDesaturation','setVirtualBackground','setVirtualBackgroundBlur','clearVirtualBackground','setSubjectOutline']);
    for (const key of Object.keys(options)) {
      const group = key.replace(/Style$|Color$/, '');
      methods.add('set' + ({ eyeshadow: 'EyeShadow', eyeliner: 'EyeLiner' }[group] || group[0].toUpperCase() + group.slice(1)) + key.slice(group.length));
    }
    methods.forEach(method => { engine[method] = (...args) => { engine.commands.push([method, args]); }; });
    engine.processImage = async (input, width, height, frameType, mirrorMode) => {
      if (engine.processing) throw workerError('WORKER_BUSY');
      engine.processing = true;
      try {
        const result = await rpc('frame', { buffer: input.data.buffer, width, height, frameType, mirrorMode }, [input.data.buffer], 15000);
        engine.lastProcessMs = result.costMs;
        if (result.empty) return null;
        if (!(result.buffer instanceof ArrayBuffer) || result.width !== width || result.height !== height || result.buffer.byteLength !== width * height * 4) throw workerError('WORKER_TRANSPORT');
        return new ImageData(new Uint8ClampedArray(result.buffer), width, height);
      } finally { engine.processing = false; }
    };
    engine.destroy = () => {
      if (stopped) return;
      const busy = requests.size > 0;stopped = true;engine.initialized = false;rejectAll('WORKER_CANCELLED');
      if (busy) { terminate();return; }
      try { worker.postMessage({ type: 'destroy' });grace = setTimeout(terminate, 100); } catch (_) { terminate(); }
    };
    return engine;
  }

  function unavailable(error) {
    failed = true;
    publish('error', error?.code===-5
      ? 'This effect needs an enabled Facebetter license. Choose another effect or retry.'
      : 'Effects are unavailable. Your call continues with the original camera.');
  }
  function create(source) {
    if (!wanted()) {
      publish('off', 'Effects off. Your original camera is shared.');
      return Promise.resolve(null);
    }
    if (failed) return Promise.resolve(null);
    if (current && !current.destroyed && !current.failed && current.source === source) {
      return update(current);
    }
    if (pending?.source === source) return pending.promise;
    const version = epoch;
    const task = { source, promise: null };
    task.promise = Promise.resolve().then(async () => {
      let engine, video, inputCanvas, canvas, canvasStream, raf = 0, timer = 0, videoFrame = 0, disposed = false, settleFirst;
      const firstPublished = new Promise(resolve => { settleFirst = resolve; });
      const cleanup = () => {
        if (disposed) return;
        disposed = true;
        settleFirst(false);
        cancelAnimationFrame(raf);
        clearTimeout(timer);
        if (videoFrame && video?.cancelVideoFrameCallback) video.cancelVideoFrameCallback(videoFrame);
        if (video) { video.pause(); video.srcObject = null; video.remove(); }
        canvasStream?.getTracks().forEach(track => track.stop());
        if (inputCanvas) inputCanvas.width = inputCanvas.height = 0;
        if (canvas) canvas.width = canvas.height = 0;
        engine?.destroy();
      };
      task.cancel = cleanup;
      const valid = () => version === epoch && source.getVideoTracks().some(track => track.readyState === 'live');
      try {
        if (!valid()) return null;
        if (typeof DEMO !== 'undefined' && DEMO) return null;
        const sdk = window.Facebetter, runtime = window.ZIMI_FACEBETTER_RUNTIME;
        if (!sdk || !runtime || !HTMLCanvasElement.prototype.captureStream) throw new Error('Unsupported effects device.');
        publish('loading', 'Preparing face effects…');
        const token = await license();
        if (!valid()) return null;
        let engineFailure = null;
        const initOptions = {
          timeout: 60000, wasmUrl: runtime + 'facebetter-core.js', assetBaseUrl: runtime,
          onProgress: ({ percent }) => {
            if (valid() && wanted()) publish('loading', `Preparing face effects… ${Math.min(100, Math.round(percent || 0))}%`);
          }
        };
        if (typeof Worker === 'function' && typeof OffscreenCanvas === 'function' && typeof window.ZIMI_FACEBETTER_WORKER_SOURCE === 'string') {
          try { engine = createWorkerEngine(token);await engine.init(initOptions); }
          catch (error) {
            engine?.destroy();engine = null;
            if (!valid() || disposed) return null;
            if (!['WORKER_UNSUPPORTED','WORKER_TRANSPORT','ENGINE_CREATE_FAILED'].includes(error.code)) throw error;
          }
        }
        if (!engine) {
          engine = new sdk.BeautyEffectEngine(new sdk.EngineConfig({ licenseToken: token }));
          await engine.setLogConfig({ consoleEnabled: false, fileEnabled: false, level: 4 });await engine.init(initOptions);
        }
        if (disposed || !valid() || !wanted()) { engine.destroy();cleanup(); return null; }
        // The shipped 2.2.1 wrapper requires an initialized engine here.
        engine.setCallbacks({ onEngineEvent: code => {
          if (code === sdk.EngineEventCode.LicenseValidationFailed || code === sdk.EngineEventCode.InitializationFailed) {
            engineFailure = new Error('Effects authorization failed.');
            if (code === sdk.EngineEventCode.LicenseValidationFailed) engineFailure.code = -5;
          }
        } });
        if (engineFailure) throw engineFailure;
        video = document.createElement('video');
        video.muted = true; video.autoplay = true; video.playsInline = true;
        video.setAttribute('aria-hidden', 'true');
        video.style.cssText = 'position:fixed;left:-10000px;width:1px;height:1px;pointer-events:none';
        video.srcObject = source;
        document.body.append(video);
        await video.play();
        if (!valid() || !wanted()) { cleanup(); return null; }
        inputCanvas = document.createElement('canvas');
        const input = inputCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
        canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { alpha: false });
        if (!input || !context || !video.videoWidth || !video.videoHeight) throw new Error('Camera frames unavailable.');
        const budget = createFrameBudget();
        const resizeInput = () => {
          const { width, height } = budget.dimensions(video.videoWidth, video.videoHeight);
          if (inputCanvas.width !== width) inputCanvas.width = width;
          if (inputCanvas.height !== height) inputCanvas.height = height;
        };
        resizeInput();
        canvas.width = inputCanvas.width; canvas.height = inputCanvas.height;
        canvasStream = canvas.captureStream(0);
        let output = canvasStream.getVideoTracks()[0];
        if (typeof output.requestFrame !== 'function') {
          canvasStream.getTracks().forEach(track => track.stop());
          canvasStream = canvas.captureStream(24);output = canvasStream.getVideoTracks()[0];
        }
        const frameCallbacks = typeof video.requestVideoFrameCallback === 'function';
        let frames = 0, newestFrame = video.getVideoPlaybackQuality?.().totalVideoFrames ?? (frameCallbacks ? -1 : video.currentTime), lastFrame = -1, nextAt = 0, missing = 0, drawing = false, started = false, cameraGeneration = 0, mainThreadMs = 0, droppedFrames = 0, targetIntervalMs = EFFECT_FRAME_INTERVAL;
        const queueDraw = () => {
          if (!started || disposed || handle.failed || !output.enabled || drawing || raf || timer) return;
          if (engine.isWorker === true && handle.appliedRevision !== revision) return;
          const delay = Math.max(0, nextAt - performance.now());
          // A video callback already runs on the presentation clock. Adding
          // another RAF quantizes a 24fps source onto a second 60Hz boundary.
          if (frameCallbacks) {
            if (delay > 2) timer = setTimeout(() => { timer = 0;draw(); }, delay);
            else draw();
          } else if (delay > 8) timer = setTimeout(() => { timer = 0;if (!disposed) raf = requestAnimationFrame(draw); }, delay);
          else raf = requestAnimationFrame(draw);
        };
        const handle = {
          source, engine, stream: new MediaStream([...source.getAudioTracks(), output]),
          filter: undefined, sticker: undefined, packs: new Set(), packPromises: new Map(), epoch:version, destroyed: false, failed: false, firstSettled: settleFirst,
          setEnabled(enabled) {
            if (output.enabled !== !!enabled) cameraGeneration++;
            source.getVideoTracks().forEach(track => { track.enabled = !!enabled; });
            output.enabled = !!enabled;
            if (!enabled) context.clearRect(0, 0, canvas.width, canvas.height);
            else queueDraw();
          },
          getPerformance() { return { ...budget.snapshot(), ...(engine.isWorker === true ? { intervalMs: targetIntervalMs } : {}), frames, width: canvas.width, height: canvas.height, sourceWidth: video.videoWidth, sourceHeight: video.videoHeight, frameCallbacks, worker: engine.isWorker === true, workerCostMs: engine.isWorker === true ? engine.lastProcessMs : 0, mainThreadMs, inFlight: drawing, droppedFrames }; },
          destroy() {
            handle.destroyed = true;
            if (current === handle) current = null;
            cleanup();
          }
        };
        task.cancel=()=>handle.destroy();
        if (!await update(handle) || !valid()) { handle.destroy();return null; }
        const draw = async () => {
          raf = 0;
          if (disposed || drawing || handle.failed) return;
          drawing = true;
          try {
            if (engineFailure) throw engineFailure;
            const frame = frameCallbacks ? newestFrame : video.getVideoPlaybackQuality?.().totalVideoFrames ?? video.currentTime;
            if (output.enabled && video.readyState >= 2 && performance.now() + (frameCallbacks ? 2 : 0) >= nextAt && frame !== lastFrame) {
              lastFrame = frame;
              const started = performance.now(), frameRevision = revision, camera = cameraGeneration, sourceTrack = source.getVideoTracks()[0], sourceWidth = video.videoWidth, sourceHeight = video.videoHeight;
              resizeInput();
              input.drawImage(video, 0, 0, inputCanvas.width, inputCanvas.height);
              // Preview mirroring belongs to the existing video CSS. Encode
              // unmirrored pixels so text and the remote view remain natural.
              // SDK 2.2.1 creates a new full-size canvas for every video input.
              // Reuse our bounded readback canvas and pass ImageData directly.
              let result = engine.processImage(input.getImageData(0, 0, inputCanvas.width, inputCanvas.height), inputCanvas.width, inputCanvas.height, sdk.FrameType.Video, sdk.MirrorMode.None);
              const readbackDone = performance.now();
              if (engine.isWorker === true) result = await result;
              const responseAt = performance.now();
              if (engineFailure) throw engineFailure;
              if (!source.getVideoTracks()[0]?.enabled) { handle.setEnabled(false);settleFirst(true);droppedFrames++;return; }
              if (disposed || handle.destroyed || !valid() || !wanted() || !output.enabled || sourceTrack !== source.getVideoTracks()[0] || camera !== cameraGeneration || frameRevision !== revision || sourceWidth !== video.videoWidth || sourceHeight !== video.videoHeight) { if(!valid())settleFirst(false);droppedFrames++;return; }
              if (result) {
                missing = 0;
                if (canvas.width !== result.width) canvas.width = result.width;
                if (canvas.height !== result.height) canvas.height = result.height;
                context.putImageData(result, 0, 0);
                output.requestFrame?.();frames++;
                settleFirst(true);
              } else if (++missing >= 30) throw new Error('Effects frames unavailable.');
              // Leave at least half the time for call controls, WebRTC and gift
              // rendering on slower devices; never queue or repeat stale frames.
              const finished = performance.now();
              const cost = engine.isWorker === true ? engine.lastProcessMs : finished - started;
              mainThreadMs = engine.isWorker === true ? readbackDone - started + finished - responseAt : cost;
              // Worker latency does not occupy the UI thread. Keep one frame in
              // flight without imposing the main-thread half-idle duty cycle.
              budget.observe(cost, finished);
              // Carry the deadline instead of resetting it after small callback
              // jitter. A costly frame still gets more idle time than work time.
              nextAt = engine.isWorker === true ? Math.max(started + EFFECT_FRAME_INTERVAL, finished + 1) : Math.max((nextAt || started) + budget.snapshot().intervalMs, finished + (finished - started) * 1.1);
              targetIntervalMs = nextAt - started;
            }
          } catch (error) {
            if (disposed || handle.destroyed || version !== epoch) return;
            handle.failed = true;
            settleFirst(false);
            clearTimeout(timer);timer = 0;
            if (videoFrame && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(videoFrame);
            videoFrame = 0;
            if (wanted() && output.enabled && source.getVideoTracks()[0]?.enabled) unavailable(error);
            // Media replaces outgoing tracks before destroying this handle.
            void window.ZimiMedia?.refreshBeauty();
          } finally { drawing = false;if (engine.isWorker === true && !disposed && !handle.failed && newestFrame !== lastFrame) queueDraw(); }
          if (!frameCallbacks) queueDraw();
        };
        current = handle;
        handle.wake = queueDraw;
        if (frameCallbacks) {
          const presented = (_now, metadata) => {
            if (disposed || handle.failed) return;
            // Keep the startup and callback counters in the same namespace.
            // decoded/presented counters can differ when the browser drops frames.
            newestFrame = video.getVideoPlaybackQuality?.().totalVideoFrames ?? metadata.presentedFrames ?? newestFrame + 1;
            queueDraw();if (!disposed && !handle.failed) videoFrame = video.requestVideoFrameCallback(presented);
          };
          videoFrame = video.requestVideoFrameCallback(presented);
        }
        handle.setEnabled(source.getVideoTracks()[0].enabled);
        started = true;
        void draw();
        if (engine.isWorker === true && output.enabled) await firstPublished;
        if (failed || disposed || !valid() || !wanted() || handle.failed) { handle.destroy(); return null; }
        publish('ready', 'Face effects are applied to the camera you share.');
        return handle;
      } catch (error) {
        engine?.destroy();
        cleanup();
        if (version === epoch) unavailable(error);
        return null;
      } finally {
        if (pending === task) pending = null;
      }
    });
    pending = task;
    return task.promise;
  }
  function sync() {
    importLegacy();
    revise();
    save();
    failed = false;
    if (!wanted()) {
      if (pending) {
        epoch++;
        pendingAuth?.finish(new Error('Effects cancelled.'));
        pending.cancel?.();
        pending = null;
      }
      publish('off', 'Effects off. Your original camera is shared.');
    }
    if (current && !current.destroyed && !current.failed) {
      if(current.engine.isWorker === true) { if(wanted())void update(current); }
      else if(resourcesReady(current,params)) {
        try { apply(current);current.appliedRevision=revision; } catch (error) { current.failed = true; unavailable(error); }
      } else if(wanted())publish('loading','Preparing selected effects…');
    }
    if (typeof DEMO !== 'undefined' && DEMO) publish('idle', 'Preview only. Face effects run in connected video calls.');
    else void window.ZimiMedia?.refreshBeauty();
  }
  function stop() {
    epoch++;
    revise();
    pendingAuth?.finish(new Error('Effects cancelled.'));
    pending?.cancel?.();
    pending = null;
    current?.destroy();
    failed = false;
    publish('idle', 'Effects apply to your camera during video calls.');
  }
  window.ZimiBeauty = {
    create, sync, stop, strength, unavailable, getState: () => ({ ...state }), isEnabled:()=>wanted(),
    getParams:()=>JSON.parse(JSON.stringify(params)),
    setParam(key,value) {
      if(!validParam(key,value))return;
      if(typeof S!=='undefined')legacySelection=JSON.stringify({selection:S.bsel,strengths});
      params[key]=value;
      if(key==='bgPreset'&&value)params.bgBlur=0;
      if(key==='bgBlur'&&value>0)params.bgPreset=null;
      sync();
    },
    setShape(kind,key,value) {
      if(!['reshape','bodyReshape'].includes(kind) || !Object.hasOwn(params[kind],key) ||
        !Number.isFinite(value) || value<(kind==='reshape'?-1:0) || value>1)return;
      if(typeof S!=='undefined')legacySelection=JSON.stringify({selection:S.bsel,strengths});
      params[kind][key]=value;sync();
    },
    setStrength(tab, index, value) {
      if (!Object.hasOwn(BEAUTY, tab) || !Number.isInteger(index) || index < 0 || index >= BEAUTY[tab].length) return;
      strengths[`${tab}:${index}`] = Math.max(0, Math.min(100, Number(value) || 0));
      sync();
    },
    reset() {
      params=catalog.createDefaultParams();strengths={};
      if(typeof S!=='undefined')S.bsel={Beauty:0,Makeup:0,Sticker:0,Filters:0,'Image quality':0};
      legacySelection=JSON.stringify({selection:typeof S==='undefined'?{}:S.bsel,strengths});
      sync();
    }
  };
  window.addEventListener('pagehide', stop);
})();
