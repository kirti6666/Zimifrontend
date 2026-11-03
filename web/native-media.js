/* Android calls keep capture, beauty textures, encoding and playback native.
   Only commands and video rectangles cross the WebView bridge, never pixels. */
(function () {
  'use strict';
  if (!window.ZIMI_NATIVE_MEDIA || DEMO) return;
  let sequence = 0, generation = 0, scheduled = false, lastLayout = '', lastControls = '', lastBeauty = '';
  let state = { hasVideo: false, hasRemoteVideo: false, facing: 'user', playbackMuted: false, quality: 'good' };
  const pending = new Map(), shapes = {}, ancestors = new Set();
  const selector = 'video[data-zimi-local], video[data-zimi-remote]';
  const mediaViews = new Set(['precall', 'dial', 'dialback', 'voice', 'call', 'hcall', 'ring', 'switch']);
  function request(action, data = {}) {
    const requestId = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('The camera did not respond. Please try again.')); }, 30000);
      pending.set(requestId, { resolve, reject, timer });
      Native.send('native.media', { requestId, action, data });
    });
  }
  Native.on('native.media.result', data => {
    const task = pending.get(data.requestId);
    if (!task) return;
    pending.delete(data.requestId); clearTimeout(task.timer);
    if (data.error) task.reject(new Error(data.error)); else task.resolve(data.result);
  });
  function status(message) {
    if (typeof S !== 'undefined') S.mediaStatus = message || '';
    if (typeof Home !== 'undefined') Home.mediaStatus = message || '';
    document.querySelectorAll('.zh-media-status, [data-zimi-media-status]').forEach(el => { el.textContent = message || ''; });
  }
  function paintQuality() {
    document.querySelectorAll('[data-zimi-network]').forEach(el => {
      el.hidden = state.quality === 'good'; el.dataset.quality = state.quality;
      const text = el.querySelector('span');
      if (text) text.textContent = state.quality === 'reconnecting' ? 'Reconnecting' : 'Poor connection';
    });
  }
  function cameraEnabled() { return typeof camOn === 'function' ? !!camOn() : typeof S === 'undefined' || S.cam !== 0; }
  function layout() {
    scheduled = false;
    const nextAncestors = new Set(), slots = [];
    ['local', 'remote'].forEach(kind => {
      const available = kind === 'local' ? state.hasVideo && cameraEnabled() : state.hasRemoteVideo;
      const candidates = [...document.querySelectorAll(`video[data-zimi-${kind}]`)];
      candidates.forEach(video => {
        video.dataset.zimiFacing = state.facing;
        if (shapes[kind]) video.dataset.zimiShape = shapes[kind];
        video.toggleAttribute('data-zimi-native-video', !!available);
      });
      if (!available || document.hidden) return;
      const visible = candidates.map(video => {
        const rect = video.getBoundingClientRect(), css = getComputedStyle(video);
        let parent = video, hidden = false;
        while (parent) {
          const style = getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) { hidden = true; break; }
          parent = parent.parentElement;
        }
        return { video, rect, css, hidden };
      }).filter(({ rect, hidden }) => !hidden && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth)
        .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height);
      const chosen = visible[0];
      if (!chosen) return;
      const { video, rect, css } = chosen;
      let parent = video.parentElement;
      while (parent) { nextAncestors.add(parent); parent = parent.parentElement; }
      const radius = parseFloat(getComputedStyle(video.parentElement).borderTopLeftRadius) || parseFloat(css.borderTopLeftRadius) || 0;
      slots.push({ kind, x: rect.x, y: rect.y, width: rect.width, height: rect.height, radius, fit: css.objectFit === 'contain' ? 'contain' : 'cover' });
    });
    ancestors.forEach(el => { if (!nextAncestors.has(el)) { el.removeAttribute('data-zimi-native-underlay'); ancestors.delete(el); } });
    nextAncestors.forEach(el => { el.setAttribute('data-zimi-native-underlay', ''); ancestors.add(el); });
    const data = { width: innerWidth, height: innerHeight, slots }, serialized = JSON.stringify(data);
    if (serialized !== lastLayout) { lastLayout = serialized; Native.send('native.media.layout', data); }
  }
  function scheduleLayout() { if (!scheduled) { scheduled = true; requestAnimationFrame(layout); } }
  function attach() {
    paintQuality();
    const data = { camera: cameraEnabled(), microphone: typeof S === 'undefined' || S.mic !== 0 }, serialized = JSON.stringify(data);
    if (serialized !== lastControls) { lastControls = serialized; void request('controls', data).catch(() => {}); }
    scheduleLayout();
  }
  Native.on('native.media.state', data => {
    state = { ...state, ...data };
    if (data.remoteVideo !== undefined) state.hasRemoteVideo = data.remoteVideo;
    if (data.status !== undefined) status(data.status);
    if (data.beautyStatus) {
      if (['authFailed', 'initFailed', 'glUnsupported', 'error'].includes(data.beautyStatus)) lastBeauty = '';
      window.ZimiBeauty?.nativeState(data.beautyStatus);
    }
    attach();
  });
  Native.on('native.media.dimensions', data => {
    if (!['local', 'remote'].includes(data.kind) || !(data.width > 0 && data.height > 0)) return;
    shapes[data.kind] = data.width > data.height ? 'landscape' : 'portrait';
    scheduleLayout();
  });
  async function refreshBeauty() {
    if (!state.hasVideo) return;
    const p = window.ZimiBeauty.getParams();
    const methods = { smoothing: 'setSmoothing', whitening: 'setWhitening', rosiness: 'setRosiness', blemish: 'setBlemish', clarity: 'setClarity', brightness: 'setBrightness', contrast: 'setContrast', saturation: 'setSaturation', colorTemperature: 'setColorTemperature', colorTint: 'setColorTint', skinOnly: 'setBeautySkinOnly', smoothingStyle: 'setSmoothingStyle', whiteningStyle: 'setWhiteningStyle' };
    const data = { enabled: window.ZimiBeauty.isEnabled(), settings: Object.entries(methods).map(([key, method]) => [method, [p[key]]]) };
    const serialized = JSON.stringify(data);
    if (serialized === lastBeauty) return;
    // Cache only acknowledged settings so failed or cancelled changes can retry.
    const version = generation;
    try { await request('beauty', data); if (version === generation) lastBeauty = serialized; }
    catch (_) { if (version === generation) window.ZimiBeauty.nativeState('error'); }
  }
  async function prepare(video) {
    const version = generation;
    const result = await request('prepare', { video: !!video });
    if (version !== generation) throw new Error('Camera request cancelled.');
    state.hasVideo = !!video;
    lastControls = ''; lastBeauty = '';
    attach(); void refreshBeauty();
    return result;
  }
  function stop() {
    generation++; state.hasVideo = state.hasRemoteVideo = false; state.playbackMuted = false;
    lastControls = lastBeauty = ''; window.ZimiBeauty?.stop();
    void request('stop').catch(() => {}); scheduleLayout();
  }
  function render(container, html) {
    const template = document.createElement('template'); template.innerHTML = html;
    const available = [...container.querySelectorAll(selector)], old = [...container.childNodes], keep = new Set();
    container.append(template.content);
    [...container.querySelectorAll(selector)].filter(el => !available.includes(el)).forEach(slot => {
      const index = available.findIndex(el => el.hasAttribute('data-zimi-local') === slot.hasAttribute('data-zimi-local'));
      if (index < 0) return;
      const video = available.splice(index, 1)[0]; keep.add(video); slot.replaceWith(video);
    });
    old.forEach(node => { if (!keep.has(node)) node.remove(); });
    attach();
  }
  const screen = document.getElementById('screen');
  if (screen) new MutationObserver(scheduleLayout).observe(screen, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleLayout) : null;
  if (resize && screen) resize.observe(screen);
  document.addEventListener('scroll', scheduleLayout, true);
  window.addEventListener('resize', scheduleLayout);
  document.addEventListener('transitionend', scheduleLayout);
  document.addEventListener('visibilitychange', scheduleLayout);
  document.addEventListener('aurora:navigate', () => {
    if (typeof S !== 'undefined' && !S.bgCall && !mediaViews.has(S.v)) stop(); else attach();
  });
  window.addEventListener('pagehide', stop);
  Native.on('app.foreground', attach);
  ['session.none', 'session.expired'].forEach(type => Native.on(type, stop));
  window.ZimiMedia = {
    native: true, prepare, attach, render, stop, refreshBeauty,
    hasVideo: () => state.hasVideo,
    getState: () => ({ facingMode: state.facing, playbackMuted: state.playbackMuted, connectionQuality: state.quality, cameraEnabled: cameraEnabled(), microphoneEnabled: typeof S === 'undefined' || S.mic !== 0 }),
    handoff: callId => { void request('handoff', { callId }).catch(() => {}); },
    flipCamera: async () => { const result = await request('flipCamera'); scheduleLayout(); return result.facing; },
    setPlaybackMuted: muted => { state.playbackMuted = !!muted; void request('setPlaybackMuted', { muted: !!muted }).catch(() => {}); return state.playbackMuted; },
    isPlaybackMuted: () => state.playbackMuted,
    openStream: () => Promise.reject(new Error('Live streaming is unavailable.'))
  };
})();
