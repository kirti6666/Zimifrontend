/* Discovery cards play a host's newest video, muted, over their photo. To stay light on data and
   battery: nothing downloads until a card is mostly on screen, only the card most in view plays,
   only the first seconds loop, and a redraw moves the same <video> into the new card so nothing
   restarts or downloads twice. Data Saver, slow networks, reduced motion and a hidden app keep
   the photo still. */
window.ZimiCardVideo = (() => {
  const CLIP_SECONDS = 8, KEEP_LOADED = 3, MIN_VISIBLE = .6;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const videos = new Map(), ratios = new Map(), loaded = [];
  let current = null;
  const observer = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(entries => { entries.forEach(entry => ratios.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0)); choose(); }, { threshold: [0, .35, MIN_VISIBLE, .85, 1] })
    : null;

  function allowed() {
    const net = navigator.connection;
    return !reduced.matches && !document.hidden && !net?.saveData && !/2g|3g/.test(net?.effectiveType || '');
  }
  function videoFor(url) {
    let video = videos.get(url);
    if (video) return video;
    video = document.createElement('video');
    video.muted = video.defaultMuted = video.playsInline = video.loop = true;
    video.preload = 'none';
    video.disablePictureInPicture = true;
    video.setAttribute('playsinline', '');
    video.addEventListener('timeupdate', () => { if (video.currentTime >= CLIP_SECONDS) video.currentTime = 0; });
    video.addEventListener('playing', () => video.parentElement?.classList.add('is-playing'));
    video.addEventListener('pause', () => video.parentElement?.classList.remove('is-playing'));
    // A broken or blocked video leaves the photo showing and is never tried again.
    video.addEventListener('error', () => { video.dataset.failed = '1'; video.parentElement?.classList.remove('is-playing'); if (current === video) current = null; });
    videos.set(url, video);
    return video;
  }
  function load(video, url) {
    if (video.getAttribute('src')) return;
    video.src = url;
    loaded.push(video);
    // Hand back the buffers of videos played longest ago, unless they are playing now.
    while (loaded.length > KEEP_LOADED) {
      const old = loaded.shift();
      if (old === video || old === current) { loaded.push(old); break; }
      old.pause(); old.removeAttribute('src'); old.load();
    }
  }
  function choose() {
    // Several compact cards can be fully in view at once; the one nearest the middle of the screen wins.
    let best = null, bestRatio = 0, bestOffset = Infinity;
    const middle = innerHeight / 2;
    for (const [slot, ratio] of ratios) {
      if (!slot.isConnected || ratio < MIN_VISIBLE || ratio < bestRatio - .01 || slot.firstElementChild?.dataset.failed) continue;
      const box = slot.getBoundingClientRect(), offset = Math.abs(box.top + box.height / 2 - middle);
      if (ratio <= bestRatio + .01 && offset >= bestOffset) continue;
      best = slot; bestRatio = ratio; bestOffset = offset;
    }
    const video = best && allowed() ? best.firstElementChild : null;
    if (current && current !== video) current.pause();
    current = video;
    if (!video) return;
    load(video, best.dataset.video);
    video.play().catch(() => {});
  }
  /* Called right after each render, in the same task, so a playing video moves without pausing. */
  function attach() {
    if (!observer) return;
    observer.disconnect();
    ratios.clear();
    document.querySelectorAll('#screen .zh-card-video[data-video]').forEach(slot => {
      const video = videoFor(slot.dataset.video);
      if (video.parentElement !== slot) slot.replaceChildren(video);
      slot.classList.toggle('is-playing', !video.paused && video.readyState > 2);
      observer.observe(slot);
    });
    if (current && !current.isConnected) { current.pause(); current = null; }
  }
  // Screens drawn without r() still get their videos.
  const screen = document.getElementById('screen');
  if (screen && typeof MutationObserver !== 'undefined')
    new MutationObserver(() => { if (screen.querySelector('.zh-card-video[data-video]:empty')) attach(); }).observe(screen, { childList: true, subtree: true });
  document.addEventListener('visibilitychange', choose);
  navigator.connection?.addEventListener?.('change', choose);
  reduced.addEventListener?.('change', choose);
  ['session.none', 'session.expired'].forEach(type => Native.on(type, () => {
    videos.forEach(video => { video.pause(); video.removeAttribute('src'); video.load(); });
    videos.clear(); ratios.clear(); loaded.length = 0; current = null;
  }));
  return { attach };
})();
