/* Recording stays in the WebView; authenticated uploads go through the native
   bridge. Microphone access begins only after an explicit press on Record. */
window.ZimiChatVoice = (() => {
  const MAX_MS = 120000, MAX_BYTES = 5 * 1024 * 1024;
  const formats = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
  let generation = 0, timer = null, playback = null;
  const urls = new Set();
  const state = { phase: 'idle', peer: '', stream: null, recorder: null, chunks: [], bytes: 0, started: 0, durationMs: 0, data: '', url: '', clientId: '', reply: null, error: '', attempted: false };
  const active = () => state.phase !== 'idle' && state.peer === S.h && S.v === 'thread';
  const elapsed = () => Math.min(MAX_MS, Math.max(0, Date.now() - state.started));
  const time = ms => { const seconds = Math.floor(Math.max(0, Number(ms) || 0) / 1000); return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'); };
  const stopTracks = stream => stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
  const revoke = url => { if (urls.delete(url)) URL.revokeObjectURL(url); };
  function source(value) {
    if (typeof value !== 'string') return '';
    if (urls.has(value)) return value;
    return /^https:\/\/[^\s"'<>]+$/.test(value) ? value : '';
  }
  function stopPlayback() {
    const old = playback; playback = null; Chats.playing = '';
    if (old) { old.audio.pause(); old.audio.removeAttribute?.('src'); old.audio.load?.(); }
    paintPlayback();
  }
  function paintPlayback() {
    document.querySelectorAll('[data-voice]').forEach(button => {
      const playing = playback?.id === button.dataset.voice && !playback.audio.paused;
      button.setAttribute('aria-label', (playing ? 'Pause' : 'Play') + ' voice message');
      button.setAttribute('aria-pressed', String(playing));
      button.innerHTML = ci(playing ? 'pause' : 'playFill', 20);
      const card = button.closest('.zc-voice');
      card?.classList.toggle('playing', !!playing);
      const progress = card?.querySelector('.zc-voice-progress');
      if (progress) progress.style.setProperty('--voice-progress', playback?.id === button.dataset.voice ? progressPercent() + '%' : '0%');
    });
    const preview = document.querySelector('[data-voice-preview]');
    if (preview) {
      const playing = playback?.id === 'preview' && !playback.audio.paused;
      preview.setAttribute('aria-label', playing ? 'Pause recording' : 'Play recording');
      preview.innerHTML = ci(playing ? 'pause' : 'playFill', 22);
      const progress = document.querySelector('#zc-recording .zc-voice-progress');
      if (progress) progress.style.setProperty('--voice-progress', playback?.id === 'preview' ? progressPercent() + '%' : '0%');
    }
  }
  function progressPercent() {
    if (!playback) return 0;
    const duration = Number.isFinite(playback.audio.duration) && playback.audio.duration > 0 ? playback.audio.duration : playback.durationMs / 1000;
    return duration > 0 ? Math.min(100, playback.audio.currentTime / duration * 100) : 0;
  }
  async function playAudio(id, url, durationMs) {
    if (playback?.id === id) {
      const current = playback;
      if (!current.audio.paused) { current.audio.pause(); paintPlayback(); return; }
      try { await current.audio.play(); if (playback === current) paintPlayback(); else current.audio.pause(); }
      catch { if (playback === current) { stopPlayback(); appNotice('This recording could not be played. Please try again.'); } }
      return;
    }
    stopPlayback();
    const src = source(url); if (!src) return appNotice('This voice message is not available to play.');
    const audio = new Audio(src), current = { id, audio, durationMs };
    playback = current; Chats.playing = id; audio.preload = 'metadata';
    audio.ontimeupdate = () => { if (playback === current) paintPlayback(); };
    audio.onended = () => { if (playback === current) stopPlayback(); };
    audio.onerror = () => { if (playback === current) { stopPlayback(); appNotice('This recording could not be played. Please try again.'); } };
    try { await audio.play(); if (playback === current) paintPlayback(); else audio.pause(); }
    catch { if (playback === current) { stopPlayback(); appNotice('This recording could not be played. Please try again.'); } }
  }
  function play(id) { const m = zcFind(id); if (m && !m.deleted && !m.local) return playAudio(id, m.audioUrl, m.durationMs); }
  function togglePreview() { if (active() && state.phase === 'preview') return playAudio('preview', state.url, state.durationMs); }
  function messageView(m) {
    const playing = playback?.id === m.id && !playback.audio.paused, available = !m.local && !!source(m.audioUrl), options = zcActionable(m);
    return `<div class="zc-voice ${playing ? 'playing' : ''}"><div class="zc-voice-top"><span>${hi('mic',15)} Voice message</span>${options ? `<button class="zc-voice-options" aria-label="Voice message options" aria-haspopup="dialog" onclick="zcMessageMenu('${domId(m.id)}')">${ci('more',18)}</button>` : ''}</div><div class="zc-voice-body"><button class="zc-voice-play" data-voice="${domId(m.id)}" aria-label="${playing ? 'Pause' : 'Play'} voice message" aria-pressed="${playing}" ${available ? '' : 'disabled'} onclick="ZimiChatVoice.play('${domId(m.id)}')">${ci(playing ? 'pause' : 'playFill',20)}</button><span class="zc-voice-progress" aria-hidden="true"><i></i></span><time>${esc(time(m.durationMs))}</time></div></div>`;
  }
  function view() {
    if (!active()) return '';
    const recording = state.phase === 'recording', preview = state.phase === 'preview', sending = state.phase === 'sending';
    return `<section class="zc-recorder" aria-label="Voice recording"><div class="zc-recording-line"><span class="zc-recording-label" role="status">${recording ? '<i class="zc-recording-dot"></i>Recording' : preview ? 'Voice message' : sending ? 'Sending voice message…' : state.phase === 'permission' ? 'Allow microphone access…' : 'Preparing recording…'}</span><time id="zc-recording-time">${time(recording ? elapsed() : state.durationMs)}</time></div><div class="zc-recording-controls"><button class="zc-recording-cancel" aria-label="Cancel recording" onclick="ZimiChatVoice.cancel()" ${sending ? 'disabled' : ''}>${ci('trash',22)}</button>${recording ? `<div class="zc-recording-pulse" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div><button class="zc-recording-stop" aria-label="Stop recording" onclick="ZimiChatVoice.stop()">${ci('stop',22)}</button>` : preview ? `<button class="zc-recording-play" data-voice-preview aria-label="Play recording" onclick="ZimiChatVoice.togglePreview()">${ci('playFill',22)}</button><span class="zc-voice-progress" aria-hidden="true"><i></i></span><button class="zc-recording-send" aria-label="Send voice message" onclick="ZimiChatVoice.send()">${ci('send',22)}</button>` : `<div class="zc-recording-wait" role="status" aria-label="${sending ? 'Uploading voice message' : 'Preparing microphone'}">${skeletonLine('100%',18)}</div>`}</div>${state.error ? `<p class="zc-recording-error" role="alert">${esc(state.error)}</p>` : `<p class="zc-recording-hint">${recording ? 'Up to 2 minutes · Stop to review before sending' : preview ? 'Listen before sending, or delete and record again' : sending ? 'Your recording is being uploaded' : 'Your microphone is used only while recording'}</p>`}</section>`;
  }
  function render() {
    const root = document.getElementById('zc-recording'); if (root) root.innerHTML = view();
    const composer = document.querySelector('.zc-composer'); if (composer) composer.hidden = active();
    document.querySelector('.zc-thread')?.classList.toggle('zc-is-recording', active());
    paintPlayback();
  }
  function cancel() {
    ++generation; clearInterval(timer); timer = null;
    const recorder = state.recorder; state.recorder = null;
    if (recorder && recorder.state !== 'inactive') { try { recorder.stop(); } catch {} }
    stopTracks(state.stream); stopPlayback();
    const local = S.msgs?.find(m => m.local && m.clientId === state.clientId);
    if (local?.status === 'failed') S.msgs = S.msgs.filter(m => m !== local);
    if (!local || local.status !== 'sending') revoke(state.url);
    Object.assign(state, { phase: 'idle', peer: '', stream: null, chunks: [], bytes: 0, started: 0, durationMs: 0, data: '', url: '', clientId: '', reply: null, error: '', attempted: false });
    render(); if (local?.status === 'failed' && S.v === 'thread') paint();
  }
  function fail(message) { cancel(); appNotice(message); }
  function readAudio(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('The recording could not be prepared. Please record it again.')); reader.readAsDataURL(blob); }); }
  async function start() {
    if (state.phase !== 'idle' || S.v !== 'thread') return;
    const reason = zcThreadBlocked(); if (reason) return appNotice(reason);
    if (Chats.editing) return appNotice('Finish editing your message before recording.');
    if (DEMO) return appNotice('Voice recording is available in the connected app.');
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return appNotice('Voice recording is unavailable on this device. Update your app or system WebView.');
    const mimeType = formats.find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) return appNotice('This device does not support a compatible recording format.');
    stopPlayback(); zcThreadAttach(false); zcThreadEmoji(false); document.getElementById('ti')?.blur();
    const token = ++generation;
    Object.assign(state, { phase: 'permission', peer: S.h, reply: Chats.reply ? { ...Chats.reply } : null, clientId: crypto.randomUUID(), error: '' });
    render();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (token !== generation || S.v !== 'thread' || S.h !== state.peer || document.hidden) { stopTracks(stream); if (token === generation) cancel(); return; }
      state.stream = stream;
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });
      Object.assign(state, { stream, recorder, phase: 'recording', chunks: [], bytes: 0, started: Date.now(), durationMs: 0 });
      recorder.ondataavailable = event => {
        if (token !== generation || !event.data?.size) return;
        state.bytes += event.data.size;
        if (state.bytes > MAX_BYTES) { fail('This recording is too large. Please record a shorter voice message.'); return; }
        state.chunks.push(event.data);
      };
      recorder.onerror = () => { if (token === generation) fail('Recording stopped unexpectedly. Please try again.'); };
      recorder.onstop = async () => {
        if (token !== generation) return;
        clearInterval(timer); timer = null; stopTracks(stream); state.stream = null; state.recorder = null;
        state.durationMs ||= elapsed();
        if (state.durationMs < 500) { fail('Hold on a little longer—record at least half a second.'); return; }
        const blob = new Blob(state.chunks, { type: recorder.mimeType || mimeType });
        if (!blob.size || blob.size > MAX_BYTES) { fail('The recording is empty or too large. Please try again.'); return; }
        state.phase = 'preparing'; render();
        try {
          const data = await readAudio(blob); if (token !== generation) return;
          const url = URL.createObjectURL(blob); urls.add(url);
          Object.assign(state, { phase: 'preview', data, url, chunks: [] }); render();
          document.querySelector('[data-voice-preview]')?.focus({ preventScroll: true });
        } catch (error) { if (token === generation) fail(error.message); }
      };
      stream.getTracks().forEach(track => { track.onended = () => { if (token === generation && state.phase === 'recording') stop(); }; });
      recorder.start(250);
      timer = setInterval(() => { const label = document.getElementById('zc-recording-time'); if (label) label.textContent = time(elapsed()); if (elapsed() >= MAX_MS) stop(); }, 250);
      render(); obHaptic('light'); document.querySelector('.zc-recording-stop')?.focus({ preventScroll: true });
    } catch (error) {
      if (token !== generation) return;
      fail(['NotAllowedError','PermissionDeniedError'].includes(error.name) ? 'Microphone access was denied. Allow it in your device settings to record a voice message.' : error.name === 'NotFoundError' ? 'No microphone was found on this device.' : 'The microphone could not start. Close other recordings or calls and try again.');
    }
  }
  function stop() {
    if (state.phase !== 'recording') return;
    state.durationMs = elapsed(); state.phase = 'preparing'; clearInterval(timer); timer = null;
    try { if (state.recorder?.state !== 'inactive') state.recorder.stop(); stopTracks(state.stream); render(); }
    catch { fail('The recording could not be stopped. Please try again.'); }
  }
  function send() {
    if (!active() || state.phase !== 'preview' || !state.data) return;
    const reason = zcThreadBlocked(); if (reason) return appNotice(reason);
    if (!state.attempted && state.reply && !zcCanReply(zcFind(state.reply.id))) return appNotice('The message you were replying to is no longer available. Cancel the reply before sending.');
    stopPlayback(); state.phase = 'sending'; state.error = ''; state.attempted = true;
    let local = S.msgs.find(m => m.local && m.clientId === state.clientId);
    if (local) local.status = 'sending';
    else { local = { id: 'local-' + state.clientId, clientId: state.clientId, local: true, mine: true, kind: 'voice', audioUrl: state.url, durationMs: state.durationMs, text: '', at: new Date().toISOString(), status: 'sending', reply: state.reply ? { ...state.reply } : null }; S.msgs.push(local); }
    render(); zcPaintThread(true);
    Native.send('chat.voice', { to: state.peer, audio: state.data, durationMs: Math.round(state.durationMs), clientId: state.clientId, ...(state.reply ? { replyTo: state.reply.id } : {}) });
  }
  function canChangeReply() { return !active() || !state.attempted; }
  function setReply(reply) { if (active() && !state.attempted) state.reply = reply ? { ...reply } : null; }
  function remove(id) { if (playback?.id === id) stopPlayback(); }
  Native.on('chat.voiceSent', data => {
    if (!data.message?.id) return;
    if (S.v === 'thread' && S.h === String(data.to)) {
      const local = S.msgs.find(m => m.local && m.clientId === data.clientId);
      const existing = S.msgs.find(m => !m.local && m.id === data.message.id), target = existing || local;
      if (target) {
        const old = local?.audioUrl;
        Object.assign(target, data.message, { local: false, mine: true, status: 'sent', at: data.message.createdAt || target.at, audioUrl: data.message.audioUrl || '', durationMs: data.message.durationMs || 0 });
        if (local && local !== target) S.msgs = S.msgs.filter(m => m !== local);
        revoke(old);
      } else S.msgs.push({ ...data.message, mine: true, status: 'sent', at: data.message.createdAt || new Date().toISOString() });
    }
    if (data.clientId === state.clientId && String(data.to) === state.peer) {
      if (Chats.reply?.id === state.reply?.id) { Chats.reply = null; zcPaintContext(); }
      cancel();
    }
    if (S.v === 'thread' && S.h === String(data.to)) zcPaintThread(true);
  });
  Native.on('operation.error', data => {
    if (data.action !== 'chat.voice') return;
    if (S.h === String(data.to)) { const local = S.msgs.find(m => m.local && m.clientId === data.clientId); if (local) { local.status = 'failed'; if (S.v === 'thread') paint(); } }
    if (data.clientId === state.clientId && String(data.to) === state.peer) { state.phase = 'preview'; state.error = data.message || 'Voice message not sent. Tap Send to retry.'; render(); }
  });
  Native.on('chat.updated', data => { if (data.message?.deleted && playback?.id === data.message.id) stopPlayback(); });
  Native.on('chat.removed', data => { if (playback?.id === data.id) stopPlayback(); });
  const reset = () => { cancel(); urls.forEach(revoke); };
  Native.on('session.none', reset); Native.on('session.expired', reset);
  document.addEventListener('aurora:navigate', () => { if (S.v !== 'thread' || (state.peer && state.peer !== S.h)) reset(); else stopPlayback(); });
  const background = () => { if (['permission','recording','preparing'].includes(state.phase)) cancel(); stopPlayback(); };
  Native.on('app.background', background);
  document.addEventListener('visibilitychange', () => { if (document.hidden) background(); });
  window.addEventListener('pagehide', reset);
  const afterRender = window.ZimiHome.afterRender;
  window.ZimiHome.afterRender = () => { afterRender(); render(); };
  return { start, stop, cancel, send, togglePreview, play, view, messageView, active, render, setReply, canChangeReply, remove, paintPlayback };
})();
