/* Facebetter processes the camera before WebRTC encoding. Credentials stay on
   the server; the native bridge supplies a short-lived license token only. */
(function () {
  'use strict';
  const STORAGE = 'zimi.beauty.v1';
  const FILTERS = ['', 'natural', 'milk_tea', 'rose', 'japanese', 'vivid'];
  const STICKERS = ['', 'fox', 'black_glass', 'kiss2', 'mustache', 'fan_club'];
  const EFFECTS = {
    natural: '__FB_EFFECT_natural__', milk_tea: '__FB_EFFECT_milk_tea__',
    rose: '__FB_EFFECT_rose__', japanese: '__FB_EFFECT_japanese__', vivid: '__FB_EFFECT_vivid__',
    fox: '__FB_EFFECT_fox__', black_glass: '__FB_EFFECT_black_glass__',
    kiss2: '__FB_EFFECT_kiss2__', mustache: '__FB_EFFECT_mustache__', fan_club: '__FB_EFFECT_fan_club__'
  };
  const decoded = new Map();
  let strengths = {}, epoch = 0, sequence = 0, pendingAuth = null, pending = null, current = null, failed = false;
  let state = { status: 'idle', message: 'Effects apply to your camera during video calls.' };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || 'null');
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

  function publish(status, message) {
    state = { status, message };
    document.querySelectorAll('[data-zimi-beauty-status]').forEach(el => { el.textContent = message; });
    document.querySelectorAll('[data-zimi-beauty-retry]').forEach(el => { el.hidden = status !== 'error'; });
  }
  function save() {
    try { localStorage.setItem(STORAGE, JSON.stringify({ selection: S.bsel, strengths })); } catch (_) {}
  }
  function strength(tab, index) { return strengths[`${tab}:${index}`] ?? 60; }
  function selected(tab) { return typeof S === 'undefined' ? 0 : S.bsel[tab] || 0; }
  function amount(tab) { return selected(tab) ? strength(tab, selected(tab)) / 100 : 0; }
  function wanted() {
    return ['Beauty', 'Makeup', 'Filters', 'Image quality'].some(tab => amount(tab) > 0) || !!selected('Sticker');
  }
  function bytes(name) {
    if (!decoded.has(name)) decoded.set(name, Uint8Array.from(atob(EFFECTS[name]), char => char.charCodeAt(0)));
    return decoded.get(name);
  }
  function apply(handle) {
    const engine = handle.engine, sdk = window.Facebetter;
    const beauty = selected('Beauty'), b = amount('Beauty'), makeup = selected('Makeup'), m = amount('Makeup');
    // Do not invoke unused paid capabilities just to set their initial zero.
    // Clear a parameter only after this engine has actually enabled it.
    const level = (method, value, key = method, args = []) => {
      if (value !== 0 || handle.levels[key]) engine[method](...args, value);
      handle.levels[key] = value;
    };
    engine.setBeautySkinOnly(true);
    engine.setSmoothingStyle(sdk.SmoothingStyle.Natural);
    level('setSmoothing', beauty === 1 ? b : 0);
    level('setWhitening', beauty === 2 ? b : 0);
    level('setClarity', beauty === 3 ? b : 0);
    level('setReshape', beauty === 4 ? b * 0.5 : 0, 'FaceVShape', [sdk.Reshape.FaceVShape]);
    level('setReshape', beauty === 5 ? b * 0.5 : 0, 'FaceThin', [sdk.Reshape.FaceThin]);
    level('setLipstick', m);
    if (makeup && m) engine.setLipstickColor([
      0, sdk.LipstickColor.GentlePink, sdk.LipstickColor.CoralOrange,
      sdk.LipstickColor.Peach, sdk.LipstickColor.Berry, sdk.LipstickColor.RetroRed
    ][makeup]);
    const filter = amount('Filters') ? FILTERS[selected('Filters')] : '', sticker = STICKERS[selected('Sticker')];
    if (filter !== handle.filter) {
      if (filter) engine.setFilter(bytes(filter)); else if (handle.filter) engine.clearFilter();
      handle.filter = filter;
    }
    if (filter) engine.setFilterIntensity(amount('Filters'));
    if (sticker !== handle.sticker) {
      if (sticker) engine.setSticker(bytes(sticker)); else if (handle.sticker) engine.clearSticker();
      handle.sticker = sticker;
    }
    const quality = selected('Image quality'), q = amount('Image quality');
    level('setColorTemperature', quality === 1 ? q * 0.5 : 0);
    level('setColorTint', quality === 2 ? q * 0.4 : 0);
    level('setBrightness', quality === 3 ? q * 0.3 : 0);
    level('setSaturation', quality === 4 ? q * 0.5 : 0);
    level('setContrast', quality === 5 ? q * 0.4 : 0);
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
      Native.send('beauty.auth', { requestId });
    });
  }
  Native.on('beauty.auth', data => {
    if (data.requestId === pendingAuth?.requestId) pendingAuth.finish(null, data.licenseToken);
  });
  Native.on('operation.error', data => {
    if (data.action === 'beauty.auth' && data.requestId === pendingAuth?.requestId) pendingAuth.finish(new Error('Effects authorization failed.'));
  });

  function unavailable() {
    failed = true;
    publish('error', 'Effects are unavailable. Your call continues with the original camera.');
  }
  function create(source) {
    if (!wanted()) {
      publish('off', 'Effects off. Your original camera is shared.');
      return Promise.resolve(null);
    }
    if (failed) return Promise.resolve(null);
    if (current && !current.destroyed && !current.failed && current.source === source) {
      try { apply(current); return Promise.resolve(current); } catch (_) { current.failed = true; unavailable(); return Promise.resolve(null); }
    }
    if (pending?.source === source) return pending.promise;
    const version = epoch;
    const task = { source, promise: null };
    task.promise = Promise.resolve().then(async () => {
      let engine, video, canvasStream, raf = 0, disposed = false;
      const cleanup = () => {
        if (disposed) return;
        disposed = true;
        cancelAnimationFrame(raf);
        if (video) { video.pause(); video.srcObject = null; video.remove(); }
        canvasStream?.getTracks().forEach(track => track.stop());
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
        const canvas = document.createElement('canvas'), context = canvas.getContext('2d', { alpha: false });
        if (!context || !video.videoWidth || !video.videoHeight) throw new Error('Camera frames unavailable.');
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        canvasStream = canvas.captureStream(24);
        const output = canvasStream.getVideoTracks()[0];
        const handle = {
          source, engine, stream: new MediaStream([...source.getAudioTracks(), output]),
          filter: undefined, sticker: undefined, levels: {}, destroyed: false, failed: false,
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
        apply(handle);
        let last = -Infinity, missing = 0;
        const draw = now => {
          if (disposed) return;
          try {
            if (engineFailure) throw new Error('Effects stopped.');
            if (output.enabled && video.readyState >= 2 && now - last >= 1000 / 24) {
              last = now;
              // Preview mirroring belongs to the existing video CSS. Encode
              // unmirrored pixels so text and the remote view remain natural.
              const result = engine.processImage(video, video.videoWidth, video.videoHeight, sdk.FrameType.Video, sdk.MirrorMode.None);
              if (result) {
                missing = 0;
                if (canvas.width !== result.width) canvas.width = result.width;
                if (canvas.height !== result.height) canvas.height = result.height;
                context.putImageData(result, 0, 0);
              } else if (++missing >= 30) throw new Error('Effects frames unavailable.');
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
      } catch (_) {
        cleanup();
        if (version === epoch) unavailable();
        return null;
      } finally {
        if (pending === task) pending = null;
      }
    });
    pending = task;
    return task.promise;
  }
  function sync() {
    save();
    failed = false;
    if (!wanted()) {
      if (pending) {
        epoch++;
        pendingAuth?.finish(new Error('Effects cancelled.'));
        pending = null;
      }
      publish('off', 'Effects off. Your original camera is shared.');
    }
    if (current && !current.destroyed && !current.failed) {
      try { apply(current); } catch (_) { current.failed = true; unavailable(); }
    }
    if (typeof DEMO !== 'undefined' && DEMO) publish('idle', 'Preview only. Face effects run in connected video calls.');
    else void window.ZimiMedia?.refreshBeauty();
  }
  function stop() {
    epoch++;
    pendingAuth?.finish(new Error('Effects cancelled.'));
    pending = null;
    current?.destroy();
    failed = false;
    publish('idle', 'Effects apply to your camera during video calls.');
  }
  window.ZimiBeauty = {
    create, sync, stop, strength, unavailable, getState: () => ({ ...state }),
    setStrength(tab, index, value) {
      if (!Object.hasOwn(BEAUTY, tab) || !Number.isInteger(index) || index < 0 || index >= BEAUTY[tab].length) return;
      strengths[`${tab}:${index}`] = Math.max(0, Math.min(100, Number(value) || 0));
      sync();
    },
    reset() { strengths = {}; sync(); }
  };
  window.addEventListener('pagehide', stop);
})();
