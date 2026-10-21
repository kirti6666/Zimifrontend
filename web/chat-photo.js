/* Full-size chat photos stay in the protected chat screen. Saving uses a server
   message ID through the native bridge, never a URL supplied by this viewer. */
window.ZimiChatPhoto = (() => {
  let current = null, sequence = 0;
  chatIcons.photoClose = '<path d="m5 5 14 14M19 5 5 19"/>';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const photo = id => { const m = zcFind(id); return m && !m.deleted && m.kind === 'image' && imageSrc(m.imageUrl) ? m : null; };
  function sentAt(m) {
    const date = new Date(m.at || m.createdAt), now = new Date();
    if (!Number.isFinite(date.getTime())) return m.local ? 'Sending photo' : 'Photo';
    const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(date.getFullYear(), date.getMonth(), date.getDate())) / 86400000);
    if (days === 0) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (days === 1) return 'Yesterday';
    if (days > 1 && days < 7) return `${days} days ago`;
    return date.toLocaleDateString([], { day: 'numeric', month: 'short', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
  }
  function close(restore = true) {
    const old = current; if (!old) return;
    current = null; old.resize.disconnect(); old.root.remove();
    old.main.inert = old.wasInert;
    Native.send('chat.photoViewer', { open: false });
    if (restore && S.v === 'thread' && S.h === old.peer) {
      const target = old.focus?.isConnected ? old.focus : document.querySelector(`#zc-m-${CSS.escape(old.id)} .zc-photo`);
      target?.focus({ preventScroll: true });
    }
  }
  function sync() {
    if (!current) return;
    // The photo-send acknowledgement replaces a local ID on the same message.
    // Keep its open preview and enable Download once the server ID is known.
    const m = photo(current.id) || (S.msgs.includes(current.message) && photo(current.message.id));
    if (S.v !== 'thread' || S.h !== current.peer || !m || m.imageUrl !== current.src) close(false);
    else { current.id = m.id; current.message = m; controls(); }
  }
  function bounds() {
    const c = current; if (!c) return;
    c.x = clamp(c.x, -Math.max(0, (c.width * c.scale - c.stage.clientWidth) / 2), Math.max(0, (c.width * c.scale - c.stage.clientWidth) / 2));
    c.y = clamp(c.y, -Math.max(0, (c.height * c.scale - c.stage.clientHeight) / 2), Math.max(0, (c.height * c.scale - c.stage.clientHeight) / 2));
  }
  function controls() {
    const c = current; if (!c) return;
    const ready = !c.loading && !c.error;
    const disable = (button, disabled) => {
      if (disabled && document.activeElement === button) c.stage.focus({ preventScroll: true });
      button.disabled = disabled;
    };
    disable(c.root.querySelector('[data-photo-zoom-in]'), !ready || c.scale >= 4);
    disable(c.root.querySelector('[data-photo-zoom-out]'), !ready || c.scale <= 1);
    const reset = c.root.querySelector('[data-photo-reset]'); disable(reset, !ready); reset.textContent = Math.round(c.scale * 100) + '%';
    const m = photo(c.id), save = c.root.querySelector('[data-photo-save]');
    disable(save, !ready || !m || !!m.local || m.status === 'failed' || m.status === 'sending' || c.busy);
    save.setAttribute('aria-busy', String(c.busy));
    save.classList.toggle('is-saving', c.busy);
    save.title = c.busy ? 'Saving photo' : 'Download photo';
    const canReply = !!m && S.v === 'thread' && S.h === c.peer && zcCanReply(m);
    disable(c.input, !canReply);
    disable(c.root.querySelector('[data-photo-camera]'), !canReply);
    const send = c.root.querySelector('[data-photo-send]');
    send.hidden = !c.input.value.trim(); disable(send, !canReply);
    c.input.placeholder = canReply ? 'Reply…' : 'Reply unavailable';
    const status = c.root.querySelector('.zc-photo-viewer-status'), statusText = c.loading ? 'Loading photo…' : c.error || c.saveError || (c.busy ? 'Saving photo to your gallery…' : c.saved ? 'Photo saved to gallery' : m?.local ? 'Available to download after sending' : 'Pinch or double-tap to zoom');
    if (status.textContent !== statusText) status.textContent = statusText;
    c.stage.setAttribute('aria-busy', String(c.loading));
    c.root.querySelector('.zc-photo-loading').hidden = !c.loading;
    c.root.querySelector('[data-photo-retry]').hidden = !c.error;
  }
  function paint() {
    const c = current; if (!c) return;
    bounds();
    c.image.style.width = c.width + 'px'; c.image.style.height = c.height + 'px';
    c.image.style.transform = `translate(calc(-50% + ${c.x}px),calc(-50% + ${c.y}px)) scale(${c.scale})`;
    c.stage.classList.toggle('is-zoomed', c.scale > 1); controls();
  }
  function fit() {
    const c = current; if (!c || !c.image.naturalWidth || !c.image.naturalHeight) return;
    const ratio = Math.min(c.media.clientWidth / c.image.naturalWidth, c.media.clientHeight / c.image.naturalHeight);
    c.width = c.image.naturalWidth * ratio; c.height = c.image.naturalHeight * ratio;
    c.stage.style.width = c.width + 'px'; c.stage.style.height = c.height + 'px'; paint();
  }
  function point(clientX, clientY) {
    const box = current.stage.getBoundingClientRect();
    return { x: clientX - box.left - box.width / 2, y: clientY - box.top - box.height / 2 };
  }
  function zoom(value, anchor = { x: 0, y: 0 }) {
    const c = current; if (!c || c.loading || c.error) return;
    const next = clamp(value, 1, 4), ratio = next / c.scale;
    c.x = anchor.x - (anchor.x - c.x) * ratio; c.y = anchor.y - (anchor.y - c.y) * ratio;
    c.scale = next; paint();
  }
  function reset() { if (current) { current.x = 0; current.y = 0; zoom(1); } }
  function beginGesture(c) {
    const points = [...c.pointers.values()];
    if (points.length >= 2) {
      const [a, b] = points; c.multi = true; c.lastTap = null;
      c.gesture = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, midpoint: point((a.x + b.x) / 2, (a.y + b.y) / 2), scale: c.scale, x: c.x, y: c.y };
    } else if (points.length) c.gesture = { point: points[0], x: c.x, y: c.y };
    else c.gesture = null;
  }
  function bindGestures(c) {
    c.stage.addEventListener('pointerdown', event => {
      if (current !== c || c.loading || c.error || event.button !== 0) return;
      event.preventDefault();
      if (!c.pointers.size) { c.multi = false; c.moved = false; c.started = Date.now(); }
      c.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      c.stage.setPointerCapture(event.pointerId); beginGesture(c);
    });
    c.stage.addEventListener('pointermove', event => {
      if (current !== c || !c.pointers.has(event.pointerId)) return;
      event.preventDefault(); c.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const g = c.gesture;
      if (c.pointers.size >= 2 && g.distance) {
        const [a, b] = [...c.pointers.values()], midpoint = point((a.x + b.x) / 2, (a.y + b.y) / 2);
        c.scale = clamp(g.scale * Math.hypot(a.x - b.x, a.y - b.y) / g.distance, 1, 4);
        const ratio = c.scale / g.scale;
        c.x = midpoint.x - (g.midpoint.x - g.x) * ratio; c.y = midpoint.y - (g.midpoint.y - g.y) * ratio;
        c.moved = true; paint();
      } else if (g.point) {
        const dx = event.clientX - g.point.x, dy = event.clientY - g.point.y;
        if (Math.hypot(dx, dy) > 6) c.moved = true;
        if (c.scale > 1) { c.x = g.x + dx; c.y = g.y + dy; paint(); }
      }
    });
    const end = event => {
      if (current !== c || !c.pointers.has(event.pointerId)) return;
      c.pointers.delete(event.pointerId);
      if (event.type === 'pointerup' && !c.pointers.size && !c.multi && !c.moved && Date.now() - c.started < 350) {
        const last = c.lastTap;
        if (last && Date.now() - last.at < 350 && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 30) {
          zoom(c.scale > 1 ? 1 : 2.5, point(event.clientX, event.clientY)); c.lastTap = null;
        } else c.lastTap = { at: Date.now(), x: event.clientX, y: event.clientY };
      }
      if (c.stage.hasPointerCapture(event.pointerId)) c.stage.releasePointerCapture(event.pointerId);
      beginGesture(c);
    };
    c.stage.addEventListener('pointerup', end); c.stage.addEventListener('pointercancel', end);
    c.stage.addEventListener('lostpointercapture', end);
    c.stage.addEventListener('dblclick', event => event.preventDefault());
    c.stage.addEventListener('contextmenu', event => event.preventDefault());
    c.stage.addEventListener('wheel', event => { event.preventDefault(); zoom(c.scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15), point(event.clientX, event.clientY)); }, { passive: false });
  }
  function load(c) {
    c.loading = true; c.error = ''; c.image.hidden = true; controls();
    c.image.onload = () => { if (current !== c) return; c.loading = false; c.image.hidden = false; fit(); };
    c.image.onerror = () => { if (current !== c) return; c.loading = false; c.error = 'Photo could not load. Check your connection and retry.'; controls(); };
    c.image.src = c.src;
  }
  function open(id) {
    const m = photo(id); if (!m || S.v !== 'thread') return;
    if (window.ZimiChatVoice?.active()) return appNotice('Finish or cancel your voice recording before opening a photo.');
    if (isHost() && !m.mine && !Chats.revealed[id]) { zcRevealPhoto(id); return; }
    close(false); zcEndGesture(); Chats.menu = ''; zcPaintMenu();
    const focus = document.activeElement; focus?.blur();
    const root = document.createElement('div'); root.id = 'zc-photo-viewer';
    const sender = m.mine ? me : zcThreadPerson();
    root.innerHTML = `<section class="zc-photo-viewer" role="dialog" aria-modal="true" aria-label="Photo viewer" tabindex="-1">
      <div class="zc-photo-backdrop" aria-hidden="true"></div>
      <header><button aria-label="Close photo" onclick="ZimiChatPhoto.close()">${ci('photoClose',27)}</button>
        <span class="zc-photo-avatar" aria-hidden="true">${portrait(sender)}</span><div class="zc-photo-sender"><b>${m.mine ? 'You' : esc(sender.n)}</b><span>${esc(sentAt(m))}</span></div>
        <button aria-label="Photo zoom controls" aria-expanded="false" aria-controls="zc-photo-zoom" onclick="ZimiChatPhoto.toggleZoom()">${ci('zoomIn',25)}</button>
        <button class="zc-photo-save" data-photo-save aria-label="Download photo" onclick="ZimiChatPhoto.download()" disabled>${ci('download',25)}</button>
      </header>
      <div class="zc-photo-media"><div class="zc-photo-stage" tabindex="0" role="group" aria-label="Photo zoom area">
        <div class="zc-photo-loading" role="status" aria-label="Loading photo"><div class="zh-skeleton-shape"></div></div><img class="zc-photo-full" alt="Chat photo" draggable="false" hidden>
        <button class="zc-photo-retry" data-photo-retry onclick="ZimiChatPhoto.retry()" hidden>Retry loading photo</button>
      </div><div id="zc-photo-zoom" class="zc-photo-zoom-controls" role="group" aria-label="Photo zoom" hidden>
        <button data-photo-zoom-out aria-label="Zoom out" onclick="ZimiChatPhoto.zoomBy(-.5)">${ci('zoomOut',22)}</button><button data-photo-reset aria-label="Reset zoom" onclick="ZimiChatPhoto.reset()">100%</button><button data-photo-zoom-in aria-label="Zoom in" onclick="ZimiChatPhoto.zoomBy(.5)">${ci('zoomIn',22)}</button>
      </div></div>
      <footer><p class="zc-photo-viewer-status" role="status" aria-live="polite"></p><form class="zc-photo-reply-bar" onsubmit="event.preventDefault();ZimiChatPhoto.sendReply()">
        <button type="button" data-photo-camera aria-label="Reply with photo" onclick="ZimiChatPhoto.photoReply()">${zi('camera',25)}</button>
        <input id="zc-photo-reply" aria-label="Reply to photo" placeholder="Reply…" maxlength="2000" enterkeyhint="send" autocomplete="off" oninput="ZimiChatPhoto.updateReply()">
        <button type="submit" data-photo-send aria-label="Send reply" hidden>${ci('up',23)}</button>
      </form></footer></section>`;
    const main = document.querySelector('main.app');
    const c = current = { root, main, wasInert: main.inert, focus, message: m, peer: S.h, id, src: m.imageUrl, scale: 1, x: 0, y: 0, width: 0, height: 0, loading: true, error: '', saveError: '', busy: false, saved: false, requestId: 0, pointers: new Map(), lastTap: null };
    main.inert = true; document.body.appendChild(root);
    c.stage = root.querySelector('.zc-photo-stage'); c.image = root.querySelector('.zc-photo-full');
    c.media = root.querySelector('.zc-photo-media'); c.input = root.querySelector('#zc-photo-reply');
    c.resize = new ResizeObserver(fit); c.resize.observe(c.media); bindGestures(c);
    root.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key === 'Tab') {
        const buttons = [...root.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')].filter(el => el.getClientRects().length && !el.closest('[hidden]')), first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      if (event.target.matches('input,textarea,[contenteditable]')) {
        if (event.key === 'Enter') { event.preventDefault(); if (!event.isComposing) sendReply(); }
        return;
      }
      if (['+', '=', '-', '0', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        if (event.key === '+' || event.key === '=') zoom(c.scale + .5);
        else if (event.key === '-') zoom(c.scale - .5);
        else if (event.key === '0') reset();
        else { c.x += event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0; c.y += event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0; paint(); }
      }
    });
    Native.send('chat.photoViewer', { open: true }); load(c); root.querySelector('[aria-label="Close photo"]').focus({ preventScroll: true });
  }
  function toggleZoom() {
    if (!current) return;
    const panel = current.root.querySelector('#zc-photo-zoom'); panel.hidden = !panel.hidden;
    current.root.querySelector('[aria-controls="zc-photo-zoom"]').setAttribute('aria-expanded', String(!panel.hidden));
  }
  function replyTarget() {
    const c = current, m = c && photo(c.id);
    return c && S.v === 'thread' && S.h === c.peer && zcCanReply(m) ? { c, m } : null;
  }
  function chatContext() {
    return { reply: Chats.reply, editing: Chats.editing, contextPeer: Chats.contextPeer, text: document.getElementById('ti')?.value };
  }
  function restoreContext(previous) {
    Chats.reply = previous.reply && zcCanReply(zcFind(previous.reply.id)) ? previous.reply : null;
    Chats.editing = previous.editing && zcCanEdit(zcFind(previous.editing.id)) ? previous.editing : null;
    Chats.contextPeer = previous.contextPeer;
    if (previous.text !== undefined) Chats.drafts[S.h] = previous.text;
    zcPaintContext(); zcUpdateComposer();
  }
  function sendReply() {
    const target = replyTarget(); if (!target) return;
    const { c, m } = target, text = c.input.value.trim(); if (!text) return;
    // The viewer's composer is independent: keep any existing chat draft/edit.
    const previous = chatContext();
    close(false); zcStartReply(m.id);
    if (Chats.reply?.id !== m.id) return;
    zcThreadSend(text);
    restoreContext(previous);
  }
  function photoReply() {
    const target = replyTarget(); if (!target) return;
    const previous = chatContext();
    close(false); zcStartReply(target.m.id);
    // The picker captures its own reply intent synchronously. Restore the chat
    // context before selection/cancellation so an unfinished edit stays an edit.
    try { if (Chats.reply?.id === target.m.id) zcPickPhoto(); }
    finally { restoreContext(previous); }
  }
  function download() {
    const c = current; if (!c || c.busy || c.loading || c.error) return;
    const m = photo(c.id); if (!m || m.local || m.status === 'sending' || m.status === 'failed' || S.h !== c.peer) return;
    if (DEMO || !window.ReactNativeWebView) return appNotice('Open this photo in the connected app to download it.');
    c.requestId = ++sequence; c.busy = true; c.saved = false; c.saveError = ''; controls();
    Native.send('chat.photoDownload', { to: c.peer, id: c.id, requestId: c.requestId });
  }
  const matches = data => current && data.to === current.peer && data.id === current.id && data.requestId === current.requestId && current.busy;
  Native.on('chat.photoDownloaded', data => { if (matches(data)) { current.busy = false; current.saved = true; controls(); obHaptic('success'); } });
  Native.on('operation.error', data => { if (data.action === 'chat.photoDownload' && matches(data)) { current.busy = false; current.saveError = data.message || 'Photo could not be saved. Please try again.'; controls(); } });
  // Android Back is dispatched once by ZimiNavigation, which closes this
  // viewer before considering navigation in the underlying conversation.
  ['chat.updated', 'chat.removed', 'chat.photoSent', 'data.thread', 'data.chats'].forEach(type => Native.on(type, sync));
  ['session.none', 'session.expired', 'session'].forEach(type => Native.on(type, () => close(false)));
  document.addEventListener('aurora:navigate', () => close(false));
  window.addEventListener('pagehide', () => close(false));
  const afterRender = window.ZimiHome.afterRender;
  window.ZimiHome.afterRender = () => { afterRender(); sync(); };
  return { open, close, sync, download, reset, toggleZoom, sendReply, photoReply, updateReply: controls, zoomBy: delta => { if (current) zoom(current.scale + delta); }, retry: () => { if (current) load(current); } };
})();
