/* Connectivity is separate from host availability and the live-update socket.
   Keep the current screen mounted so losing the network never erases a draft. */
window.ZimiOffline = (() => {
  P.wifi = '<path d="M3 8.5a14 14 0 0 1 18 0M6.5 12a9 9 0 0 1 11 0M10 15.5a3.5 3.5 0 0 1 4 0" stroke-linecap="round"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>';
  P.wifiOff = '<path d="m3 3 18 18M2.5 8.5a15 15 0 0 1 3.1-1.9M9.5 5.5a15 15 0 0 1 12 3M6 12a9.5 9.5 0 0 1 3-1.8M13.5 10a9.5 9.5 0 0 1 4.5 2M9.5 15.5a4 4 0 0 1 5 0" stroke-linecap="round"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>';
  const fullViews = new Set(['home', 'all-creators', 'search', 'notifications', 'welcome']);
  let browserOffline = navigator.onLine === false;
  let serverOffline = false;
  let preview = DEMO && previewMode === 'offline';
  let checking = false;
  let attempted = false;
  let poll;
  let previousFocus;
  let savedScroll = 0;
  let covered = false;
  let renderedKey = '';
  if (preview && S.v === 'welcome') { S.v = 'home'; S.loggedIn = 1; }

  const disconnected = () => browserOffline || serverOffline || preview;
  const nativeAvailable = () => !!window.ReactNativeWebView;
  const icon = (name, size = 20) => hi(name, size);

  function illustration() {
    return `<div class="zo-illustration" aria-hidden="true">
      <span class="zo-orbit zo-orbit-outer"></span><span class="zo-orbit zo-orbit-inner"></span>
      <span class="zo-satellite zo-satellite-chat">${icon('chat', 23)}</span>
      <span class="zo-satellite zo-satellite-heart">${icon('heart', 20)}</span>
      <span class="zo-spark zo-spark-one"></span><span class="zo-spark zo-spark-two"></span>
      <div class="zo-signal">${icon('wifiOff', 76)}<span class="zo-pause"><i></i><i></i></span></div>
    </div>`;
  }

  function schedule() {
    clearTimeout(poll);
    // A real reachability request, only while the visible app is disconnected.
    if (disconnected() && !preview && !DEMO && nativeAvailable() && !checking && !document.hidden) {
      poll = setTimeout(check, 15000);
    }
  }

  function render() {
    const root = document.getElementById('scroll-root');
    const screen = document.getElementById('screen');
    if (!root || !screen) return;
    let panel = document.getElementById('zimi-offline-screen');
    let banner = document.getElementById('zimi-offline-banner');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'zimi-offline-screen';
      panel.className = 'zo-offline';
      panel.hidden = true;
      panel.setAttribute('aria-labelledby', 'zo-title');
      root.prepend(panel);
      banner = document.createElement('aside');
      banner.id = 'zimi-offline-banner';
      banner.className = 'zo-banner';
      banner.hidden = true;
      // As an app flex child this reserves space without moving a thread's
      // composer or a call's controls below the viewport.
      root.before(banner);
    }
    const offline = disconnected();
    const full = offline && fullViews.has(S.v);
    const noInternet = browserOffline || preview;
    const title = noInternet ? "You're offline" : 'Connection lost';
    const key = [offline, full, noInternet, checking, attempted].join(':');
    const focusInPanel = panel.contains(document.activeElement);
    const focusInBanner = banner.contains(document.activeElement);
    const rebuilding = offline && key !== renderedKey;
    if (full && !covered) {
      // Capture before display/inert changes can blur the input or clamp scroll.
      savedScroll = root.scrollTop;
      previousFocus = screen.contains(document.activeElement) ? document.activeElement : null;
    }
    if (offline && key !== renderedKey) {
      const label = checking ? 'Checking connection…' : 'Try again';
      const retry = `<button class="zo-retry" onclick="ZimiOffline.retry()" ${checking ? 'disabled' : ''}>${icon('refresh', 19)}<span>${label}</span></button>`;
      panel.innerHTML = `<div class="zo-content">
        <span class="zo-eyebrow"><i></i>${noInternet ? 'OFFLINE MODE' : 'CONNECTION PAUSED'}</span>
        ${illustration()}
        <h1 id="zo-title" tabindex="-1">${title}</h1>
        <p class="zo-description">${noInternet ? 'A little pause in the connection.<br>Your people will be here when you’re back.' : 'We can’t reach BinzoLive right now.<br>Let’s get you back to your people.'}</p>
        ${retry}
        <p class="zo-status" role="status" aria-live="polite">${checking ? 'Finding our way back to you…' : attempted ? 'Still no connection. Give it another try.' : 'Live moments are one connection away.'}</p>
        <div class="zo-tip">${icon('wifi', 23)}<div><h2>Let’s reconnect</h2><p>Check your Wi-Fi or mobile data.<br>Make sure airplane mode is off.</p></div></div>
        <div class="zo-footnote">${icon('heart', 14)}<span>A little patience. More good moments.</span></div>
      </div>`;
      banner.innerHTML = `<span class="zo-banner-icon">${icon('wifiOff', 22)}</span><div><strong>${title}</strong><p role="status" tabindex="-1">${checking ? 'Checking your connection…' : 'Reconnect to get the latest updates.'}</p></div>${retry}`;
    }
    renderedKey = key;
    panel.hidden = !full;
    banner.hidden = !offline || full;
    root.classList.toggle('zo-full', full);
    document.documentElement.classList.toggle('zo-disconnected', offline);
    screen.classList.toggle('zo-covered', full);
    screen.inert = full;
    if (full && !covered) {
      root.scrollTop = 0;
      if (previousFocus) panel.querySelector('h1')?.focus({ preventScroll: true });
    } else if (!full && covered) {
      root.scrollTop = savedScroll;
    }
    if (!offline && (focusInPanel || focusInBanner)) {
      if (previousFocus?.isConnected && !previousFocus.closest('[hidden]')) previousFocus.focus({ preventScroll: true });
      else { screen.tabIndex = -1; screen.focus({ preventScroll: true }); }
    } else if (offline && rebuilding && (focusInPanel || focusInBanner)) {
      const surface = full ? panel : banner;
      (surface.querySelector('.zo-retry:not(:disabled)') || surface.querySelector('h1,[role=status]'))?.focus({ preventScroll: true });
    }
    if (!full) previousFocus = null;
    covered = full;
    schedule();
  }

  function recovered(wasOffline) {
    render();
    if (!wasOffline || disconnected()) return;
    attempted = false;
    // Refresh reads only. Never replay a message, purchase, gift, or call action.
    if (!DEMO && nativeAvailable()) {
      if (S.loggedIn) {
        Native.send('data.reload');
        // These contextual reads are not part of the shared lists reload.
        if (S.v === 'search') homeSearchRequest();
        if (S.v === 'thread' && S.h) Native.send('chat.open', { with: S.h });
      }
      else if (S.sessionState === 'error' || S.sessionState === 'restoring') Native.send('session.resume');
    }
    appNotice('You’re back online. Welcome back!');
  }

  function check() {
    if (checking || !disconnected()) return;
    clearTimeout(poll);
    if (nativeAvailable() && !DEMO) {
      checking = true;
      render();
      Native.send('connection.check');
    } else {
      const wasOffline = disconnected();
      browserOffline = navigator.onLine === false;
      if (!browserOffline) { preview = false; serverOffline = false; }
      recovered(wasOffline);
    }
  }

  function retry() { attempted = true; check(); }

  Native.on('connection.status', data => {
    const wasOffline = disconnected();
    checking = data.checking === true;
    if (!checking) {
      serverOffline = data.connected === false;
      // A completed native HTTP response is stronger evidence than a stale
      // WebView navigator flag. A later offline event can still override it.
      if (data.connected === true) browserOffline = false;
    }
    recovered(wasOffline);
  });
  Native.on('operation.error', data => {
    if (data.action === 'connection.check') { checking = false; attempted = true; render(); }
  });
  window.addEventListener('offline', () => { browserOffline = true; checking = false; render(); });
  window.addEventListener('online', () => {
    const wasOffline = disconnected();
    browserOffline = false;
    if (wasOffline && nativeAvailable() && !DEMO) {
      serverOffline = true;
      check();
    } else recovered(wasOffline);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && disconnected()) check();
    else schedule();
  });
  window.addEventListener('pagehide', () => clearTimeout(poll));
  return {
    render, retry, isOffline: disconnected,
    scrollPosition: () => covered ? savedScroll : null,
    restoreScroll(top) {
      if (!covered) return false;
      savedScroll = top;
      document.getElementById('scroll-root').scrollTop = 0;
      return true;
    },
  };
})();
