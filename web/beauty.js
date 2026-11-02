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
  const EFFECT_MAX_EDGE = 960, EFFECT_FRAME_INTERVAL = 1000 / 24;
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
      const data=await download(pack);
      if(handle.destroyed || handle.epoch!==epoch || version!==revision) return;
      handle.engine.addResourcePack(data);handle.packs.add(pack);
    }
  }
  function resourcesReady(handle,p) {
    return (!p.filterId||!!bytes(p.filterId)) && (!p.stickerId||!!bytes(p.stickerId)) &&
      (!p.bgPreset||decoded.has('bg:'+p.bgPreset)) &&
      (catalog.STICKERS.find(x=>x.id===p.stickerId)?.kind!=='3d'||handle.packs.has('resource_3d.fbd')) &&
      (!Object.values(p.bodyReshape).some(Boolean)||handle.packs.has('resource_body.fbd'));
  }
  function apply(handle,p=params) {
    const engine=handle.engine,prev=handle.params||catalog.createDefaultParams();
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
        if(version===revision)apply(handle,snapshot);
      } while(version!==revision);
      publish('ready','Face effects are applied to the camera you share.');
      return handle;
    })().catch(error=>{
      if(!handle.destroyed && handle.epoch===epoch){handle.failed=true;unavailable(error)}
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
      let engine, video, inputCanvas, canvas, canvasStream, raf = 0, disposed = false;
      const cleanup = () => {
        if (disposed) return;
        disposed = true;
        cancelAnimationFrame(raf);
        if (video) { video.pause(); video.srcObject = null; video.remove(); }
        canvasStream?.getTracks().forEach(track => track.stop());
        if (inputCanvas) inputCanvas.width = inputCanvas.height = 0;
        if (canvas) canvas.width = canvas.height = 0;
        engine?.destroy();
      };
      const valid = () => version === epoch && source.getVideoTracks().some(track => track.readyState === 'live');
      try {
        if (!valid()) return null;
        if (typeof DEMO !== 'undefined' && DEMO) return null;
        const sdk = window.Facebetter, runtime = window.ZIMI_FACEBETTER_RUNTIME;
        if (!sdk || !runtime || !HTMLCanvasElement.prototype.captureStream) throw new Error('Unsupported effects device.');
        publish('loading', 'Preparing face effects…');
        const token = await license();
        if (!valid()) return null;
        engine = new sdk.BeautyEffectEngine(new sdk.EngineConfig({ licenseToken: token }));
        let engineFailure = false;
        await engine.setLogConfig({ consoleEnabled: false, fileEnabled: false, level: 4 });
        await engine.init({
          timeout: 60000, wasmUrl: runtime + 'facebetter-core.js', assetBaseUrl: runtime,
          onProgress: ({ percent }) => {
            if (valid() && wanted()) publish('loading', `Preparing face effects… ${Math.min(100, Math.round(percent || 0))}%`);
          }
        });
        if (!valid() || !wanted()) { cleanup(); return null; }
        // The shipped 2.2.1 wrapper requires an initialized engine here.
        engine.setCallbacks({ onEngineEvent: code => {
          if (code === sdk.EngineEventCode.LicenseValidationFailed || code === sdk.EngineEventCode.InitializationFailed) engineFailure = true;
        } });
        if (engineFailure) throw new Error('Effects authorization failed.');
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
        const resizeInput = () => {
          const scale = Math.min(1, EFFECT_MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
          const width = Math.max(1, Math.round(video.videoWidth * scale)), height = Math.max(1, Math.round(video.videoHeight * scale));
          if (inputCanvas.width !== width) inputCanvas.width = width;
          if (inputCanvas.height !== height) inputCanvas.height = height;
        };
        resizeInput();
        canvas.width = inputCanvas.width; canvas.height = inputCanvas.height;
        canvasStream = canvas.captureStream(24);
        const output = canvasStream.getVideoTracks()[0];
        const handle = {
          source, engine, stream: new MediaStream([...source.getAudioTracks(), output]),
          filter: undefined, sticker: undefined, packs: new Set(), epoch:version, destroyed: false, failed: false,
          setEnabled(enabled) {
            source.getVideoTracks().forEach(track => { track.enabled = !!enabled; });
            output.enabled = !!enabled;
            if (!enabled) context.clearRect(0, 0, canvas.width, canvas.height);
          },
          destroy() {
            handle.destroyed = true;
            if (current === handle) current = null;
            cleanup();
          }
        };
        task.cancel=()=>handle.destroy();
        if (!await update(handle) || !valid()) { handle.destroy();return null; }
        let last = -Infinity, lastFrame = -1, processingCost = 0, interval = EFFECT_FRAME_INTERVAL, missing = 0;
        const draw = now => {
          if (disposed) return;
          try {
            if (engineFailure) throw new Error('Effects stopped.');
            const frame = video.getVideoPlaybackQuality?.().totalVideoFrames ?? video.currentTime;
            if (output.enabled && video.readyState >= 2 && now - last >= interval && frame !== lastFrame) {
              last = now; lastFrame = frame;
              const started = performance.now();
              resizeInput();
              input.drawImage(video, 0, 0, inputCanvas.width, inputCanvas.height);
              // Preview mirroring belongs to the existing video CSS. Encode
              // unmirrored pixels so text and the remote view remain natural.
              // SDK 2.2.1 creates a new full-size canvas for every video input.
              // Reuse our bounded readback canvas and pass ImageData directly.
              const result = engine.processImage(input.getImageData(0, 0, inputCanvas.width, inputCanvas.height), inputCanvas.width, inputCanvas.height, sdk.FrameType.Video, sdk.MirrorMode.None);
              if (result) {
                missing = 0;
                if (canvas.width !== result.width) canvas.width = result.width;
                if (canvas.height !== result.height) canvas.height = result.height;
                context.putImageData(result, 0, 0);
              } else if (++missing >= 30) throw new Error('Effects frames unavailable.');
              // Leave at least half the time for call controls, WebRTC and gift
              // rendering on slower devices; never queue or repeat stale frames.
              const cost = performance.now() - started;
              processingCost = processingCost ? processingCost * 0.75 + cost * 0.25 : cost;
              interval = Math.max(EFFECT_FRAME_INTERVAL, processingCost * 2);
            }
            raf = requestAnimationFrame(draw);
          } catch (_) {
            handle.failed = true;
            unavailable();
            // Media replaces outgoing tracks before destroying this handle.
            void window.ZimiMedia?.refreshBeauty();
          }
        };
        current = handle;
        handle.setEnabled(source.getVideoTracks()[0].enabled);
        draw(performance.now());
        if (failed) { handle.destroy(); return null; }
        publish('ready', 'Face effects are applied to the camera you share.');
        return handle;
      } catch (error) {
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
      if(resourcesReady(current,params)) {
        try { apply(current); } catch (error) { current.failed = true; unavailable(error); }
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
