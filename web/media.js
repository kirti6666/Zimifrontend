/* Real media stays in the WebView. The authenticated native bridge carries
   signaling only; camera/microphone capture begins from an explicit action. */
(function () {
  'use strict';
  let local = null, remote = null, active = null, capture = null, pendingCall = null;
  let generation = 0, configRequest = null, cameraSwitch = null, switchingStream = null;
  let facingMode = 'user', playbackMuted = false, handoffCall = null;
  const peers = new Map(), earlySignals = [];
  const mediaViews = new Set(['broadcast', 'live', 'precall', 'dial', 'dialback', 'voice', 'call', 'hcall', 'ring', 'switch']);

  function status(message, error) {
    if (typeof Home !== 'undefined') Home.mediaStatus = message;
    if (typeof S !== 'undefined') S.mediaStatus = message;
    document.querySelectorAll('.zh-media-status, [data-zimi-media-status]').forEach(el => { el.textContent = message; });
    if (error && typeof appNotice === 'function') appNotice(message);
  }
  function explain(error) {
    const name = error && error.name;
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'Camera or microphone access was denied. Allow access in your device settings, then try again.';
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'A camera or microphone could not be found on this device.';
    if (name === 'NotReadableError' || name === 'TrackStartError') return 'Your camera or microphone is in use by another app. Close it and try again.';
    if (name === 'OverconstrainedError') return 'This device cannot use the requested camera. Try another device or a voice call.';
    return error && error.message ? error.message : 'The media connection could not be started. Please try again.';
  }
  function stopTracks(stream) {
    if (stream) stream.getTracks().forEach(track => { track.onended = null; track.stop(); });
  }
  function closePeer(id) {
    const peer = peers.get(id);
    if (!peer) return;
    peers.delete(id);
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
  }
  function clearPeers() {
    [...peers.keys()].forEach(closePeer);
    stopTracks(remote);
    remote = null;
  }
  function stop() {
    generation++;
    active = null;
    handoffCall = null;
    pendingCall = null;
    capture = null;
    cameraSwitch = null;
    stopTracks(switchingStream);
    switchingStream = null;
    facingMode = 'user';
    playbackMuted = false;
    earlySignals.length = 0;
    clearPeers();
    stopTracks(local);
    local = null;
    if (configRequest) {
      const pending = configRequest;
      configRequest = null;
      clearTimeout(pending.timer);
      pending.reject(new Error('Media connection cancelled.'));
    }
    document.querySelectorAll('video[data-zimi-local], video[data-zimi-remote], audio[data-zimi-remote]').forEach(el => {
      el.pause();
      el.srcObject = null;
    });
  }
  function cameraEnabled() {
    if (active && active.kind === 'call' && active.voice) return false;
    if (typeof S === 'undefined') return true;
    const inCall = active && active.kind === 'call' || ['precall', 'dial', 'dialback', 'call', 'hcall', 'ring', 'switch'].includes(S.v);
    return inCall && typeof camOn === 'function' ? !!camOn() : S.cam !== 0;
  }
  function attach() {
    if (switchingStream) switchingStream.getVideoTracks().forEach(track => { track.enabled = cameraEnabled(); });
    if (local) {
      const muted = typeof S !== 'undefined' && S.mic === 0;
      const videoOn = cameraEnabled();
      local.getAudioTracks().forEach(track => { track.enabled = !muted; });
      local.getVideoTracks().forEach(track => { track.enabled = videoOn; });
    }
    [['local', local], ['remote', remote]].forEach(([kind, stream]) => {
      document.querySelectorAll(`video[data-zimi-${kind}], audio[data-zimi-${kind}]`).forEach(el => {
        el.muted = kind === 'local' || playbackMuted;
        if (kind === 'local') el.dataset.zimiFacing = facingMode;
        if (el.srcObject === stream) return;
        el.srcObject = stream;
        el.playsInline = true;
        el.autoplay = true;
        if (!stream) return;
        const playing = el.play();
        if (playing && playing.catch) playing.catch(() => {
          if (el.srcObject !== stream || kind === 'local') return;
          el.controls = true;
          status('Tap the video to start playback and hear audio.');
        });
      });
    });
  }
  async function prepare(video) {
    if (typeof DEMO !== 'undefined' && DEMO) throw new Error('Camera and microphone are available in the connected app.');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Camera and microphone access is unavailable. Open the app on a supported device with camera permissions enabled.');
    if (typeof RTCPeerConnection === 'undefined') throw new Error('Live video is not supported by this device. Please update your app or system WebView.');
    if (cameraSwitch) {
      const requestedAt = generation;
      try { await cameraSwitch; } catch (_) { /* A failed flip leaves the original capture usable. */ }
      if (requestedAt !== generation) throw new Error('Camera request cancelled. Start again when you are ready.');
    }
    if (capture) {
      const requestedAt = generation;
      try { await capture; } catch (error) { throw new Error(explain(error)); }
      if (requestedAt !== generation) throw new Error('Camera request cancelled. Start again when you are ready.');
    }
    if (local && local.getAudioTracks().some(track => track.readyState === 'live') && (!video || local.getVideoTracks().some(track => track.readyState === 'live'))) {
      if (!video) local.getVideoTracks().forEach(track => { track.stop(); local.removeTrack(track); });
      attach();
      return local;
    }
    stopTracks(local);
    local = null;
    const version = generation;
    const pending = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: video ? { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } } : false });
    capture = pending;
    try {
      const stream = await pending;
      if (version !== generation) {
        stopTracks(stream);
        throw new Error('Camera request cancelled. Start again when you are ready.');
      }
      local = stream;
      facingMode = local.getVideoTracks()[0]?.getSettings?.().facingMode || 'user';
      local.getTracks().forEach(track => {
        track.onended = () => { if (local === stream) status('Camera or microphone access ended. Leave and reconnect to continue.', true); };
      });
      attach();
      return stream;
    } catch (error) {
      throw new Error(explain(error));
    } finally {
      if (capture === pending) capture = null;
    }
  }
  function setPlaybackMuted(muted) {
    playbackMuted = !!muted;
    attach();
    return playbackMuted;
  }
  function getState() {
    return {
      facingMode, playbackMuted, switchingCamera: !!cameraSwitch,
      microphoneEnabled: typeof S === 'undefined' || S.mic !== 0,
      cameraEnabled: cameraEnabled()
    };
  }
  function flipCamera() {
    // Coalesce repeated presses so a slow permission dialog cannot open more
    // cameras or race a later camera selection.
    if (cameraSwitch) return cameraSwitch;
    const stream = local, oldTrack = stream && stream.getVideoTracks()[0];
    if (!oldTrack || oldTrack.readyState !== 'live' || active && active.kind === 'call' && active.voice) {
      return Promise.reject(new Error('Start a video call or broadcast before switching cameras.'));
    }
    const version = generation, settings = oldTrack.getSettings ? oldTrack.getSettings() : {};
    const nextFacing = (settings.facingMode || facingMode) === 'environment' ? 'user' : 'environment';
    let released = false;
    const current = () => version === generation && local === stream && (oldTrack.readyState === 'live' || released);
    const cancelled = () => new Error('Camera switch cancelled.');
    const pending = (async () => {
      let acquired = null, nextTrack = null, committed = false, switchFailure = null;
      const replaced = new Set();
      try {
        let devices = [];
        if (navigator.mediaDevices.enumerateDevices) {
          try { devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'videoinput'); } catch (_) { /* Facing mode still works without a device list. */ }
        }
        if (!current()) throw cancelled();
        const alternatives = settings.deviceId ? devices.filter(device => device.deviceId && device.deviceId !== settings.deviceId) : [];
        const matching = alternatives.find(device => (nextFacing === 'environment' ? /back|rear|environment/i : /front|user|facetime/i).test(device.label));
        const device = matching || alternatives[0];
        const video = { width: { ideal: 720 }, height: { ideal: 1280 }, ...(device ? { deviceId: { exact: device.deviceId } } : { facingMode: { exact: nextFacing } }) };
        try {
          acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video });
        } catch (error) {
          // Some mobile devices permit only one active camera. Keep the
          // original camera on other failures (especially denied permission).
          if (!current() || !['NotReadableError', 'AbortError'].includes(error?.name)) throw error;
          released = true;
          oldTrack.onended = null;
          oldTrack.stop();
          try {
            acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video });
          } catch (retryError) {
            if (!current()) throw cancelled();
            switchFailure = retryError;
            const previousCamera = settings.deviceId ? { deviceId: { exact: settings.deviceId } } : { facingMode: settings.facingMode || facingMode };
            try { acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: previousCamera }); }
            catch (_) {
              const message = 'The camera could not be restarted. Reconnect to continue.';
              if (active) fail(active, new Error(message));
              else { stop(); status(message, true); }
              throw new Error(message);
            }
          }
        }
        if (!current()) throw cancelled();
        switchingStream = acquired;
        nextTrack = acquired.getVideoTracks()[0];
        if (!nextTrack) throw new Error('The selected camera did not provide video. Your current camera is still selected.');
        nextTrack.enabled = cameraEnabled();
        // A live broadcast has one sender per viewer. Include any viewers who
        // join while a preceding replaceTrack promise is still resolving.
        while (true) {
          const senders = [...peers.values()].flatMap(peer => peer.pc.getSenders()).filter(sender => sender.track === oldTrack && !replaced.has(sender));
          if (!senders.length) break;
          const results = await Promise.allSettled(senders.map(async sender => { replaced.add(sender); await sender.replaceTrack(nextTrack); }));
          if (!current()) throw cancelled();
          const failure = results.find(result => result.status === 'rejected');
          if (failure) throw failure.reason;
        }
        if (!current()) throw cancelled();
        stream.removeTrack(oldTrack);
        stream.addTrack(nextTrack);
        facingMode = nextTrack.getSettings?.().facingMode || (switchFailure ? settings.facingMode || facingMode : nextFacing);
        nextTrack.onended = () => { if (local === stream) status('Camera access ended. Leave and reconnect to continue.', true); };
        oldTrack.onended = null;
        oldTrack.stop();
        acquired.getTracks().filter(track => track !== nextTrack).forEach(track => track.stop());
        if (switchingStream === acquired) switchingStream = null;
        acquired = null;
        committed = true;
        attach();
        if (switchFailure) throw new Error('The camera could not be switched. Your previous camera has been restored.');
        return facingMode;
      } catch (error) {
        if (!committed && current() && released) {
          const message = 'The camera could not be switched. Reconnect to continue.';
          if (active) fail(active, new Error(message));
          else { stop(); status(message, true); }
        } else if (!committed && current() && replaced.size) {
          const liveSenders = new Set([...peers.values()].flatMap(peer => peer.pc.getSenders()));
          const rollback = await Promise.allSettled([...replaced].filter(sender => liveSenders.has(sender)).map(sender => sender.replaceTrack(oldTrack)));
          if (current() && rollback.some(result => result.status === 'rejected') && active) fail(active, new Error('The camera could not be restored. Reconnect to continue.'));
        }
        stopTracks(acquired);
        if (switchingStream === acquired) switchingStream = null;
        if (error?.name === 'OverconstrainedError' || error?.name === 'NotFoundError') throw new Error('Another camera is not available on this device. Your current camera is still selected.');
        throw new Error(explain(error));
      }
    })();
    cameraSwitch = pending;
    pending.then(() => { if (cameraSwitch === pending) cameraSwitch = null; }, () => { if (cameraSwitch === pending) cameraSwitch = null; });
    return pending;
  }
  function iceConfig() {
    if (configRequest) return configRequest.promise;
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    const pending = { promise, resolve, reject, timer: null };
    pending.timer = setTimeout(() => {
      if (configRequest !== pending) return;
      configRequest = null;
      reject(new Error('Could not load the video connection settings. Check your connection and try again.'));
    }, 15000);
    configRequest = pending;
    Native.send('rtc.config');
    return promise;
  }
  Native.on('rtc.config', data => {
    if (!configRequest) return;
    const pending = configRequest;
    configRequest = null;
    clearTimeout(pending.timer);
    if (!Array.isArray(data.iceServers)) return pending.reject(new Error('The server returned invalid video connection settings.'));
    pending.resolve({ iceServers: data.iceServers });
  });
  function sendSignal(session, to, signal) {
    if (active !== session) return;
    Native.send(session.kind === 'stream' ? 'stream.signal' : 'rtc.signal', session.kind === 'stream'
      ? { streamId: session.id, to, ...signal }
      : { callId: session.id, ...signal });
  }
  /* Switching calls: the call being left closes its connection, but the camera and microphone stay for the next one. */
  function handoff(callId) { handoffCall = callId || null; }
  function releaseCall() { active = null; earlySignals.length = 0; clearPeers(); }
  function fail(session, error) {
    if (active !== session) return;
    if (session.kind === 'call' && handoffCall === session.id) return releaseCall();
    const message = explain(error);
    Native.send(session.kind === 'call' ? 'call.end' : session.hosting ? 'stream.end' : 'stream.leave', session.kind === 'call' ? { callId: session.id, reason: 'media_failed' } : { streamId: session.id });
    stop();
    status(message, true);
  }
  function newPeer(session, id, offerer) {
    if (peers.has(id)) return peers.get(id);
    const pc = new RTCPeerConnection(session.config);
    const peer = { pc, pending: [], candidates: [], queue: Promise.resolve(), offerer };
    peers.set(id, peer);
    if ((session.kind === 'call' || session.hosting) && local) local.getTracks().forEach(track => pc.addTrack(track, local));
    pc.onicecandidate = event => {
      if (event.candidate) {
        const candidate = event.candidate.toJSON ? event.candidate.toJSON() : event.candidate;
        if (peer.candidates.length < 100) peer.candidates.push(candidate);
        sendSignal(session, id, { candidate });
      }
    };
    pc.ontrack = event => {
      if (active !== session || (session.kind === 'stream' && session.hosting)) return;
      if (event.streams && event.streams[0]) remote = event.streams[0];
      else {
        if (!remote) remote = new MediaStream();
        if (!remote.getTracks().some(track => track.id === event.track.id)) remote.addTrack(event.track);
      }
      attach();
    };
    pc.onconnectionstatechange = () => {
      if (active !== session) return;
      if (pc.connectionState === 'connected') status(session.kind === 'stream' && session.hosting ? 'You are live.' : 'Connected');
      if (pc.connectionState === 'disconnected') status('Connection interrupted. Reconnecting…');
      if (pc.connectionState === 'failed') {
        if (session.kind === 'stream' && session.hosting) { closePeer(id); status('One viewer disconnected. Your broadcast is still live.'); }
        else fail(session, new Error('The media connection failed. Please reconnect.'));
      }
    };
    return peer;
  }
  function enqueue(session, id, work) {
    const peer = peers.get(id);
    if (!peer) return;
    peer.queue = peer.queue.then(async () => {
      if (active === session && peers.get(id) === peer) await work(peer);
    }).catch(error => {
      if (active !== session || peers.get(id) !== peer) return;
      if (session.kind === 'stream' && session.hosting) { closePeer(id); status('Could not connect one viewer. They can rejoin the live session.'); }
      else fail(session, error);
    });
  }
  function offer(session, id) {
    const existing = peers.get(id);
    if (existing) {
      // A viewer may announce readiness after our first offer was sent. Replay
      // the outstanding negotiation rather than abandoning that viewer.
      if (existing.pc.connectionState !== 'connected') enqueue(session, id, async peer => {
        const description = peer.pc.localDescription;
        if (description && description.type === 'offer') {
          sendSignal(session, id, { description: { type: description.type, sdp: description.sdp } });
          peer.candidates.forEach(candidate => sendSignal(session, id, { candidate }));
        }
      });
      return;
    }
    newPeer(session, id, true);
    enqueue(session, id, async peer => {
      const description = await peer.pc.createOffer();
      if (active !== session) return;
      await peer.pc.setLocalDescription(description);
      sendSignal(session, id, { description: { type: peer.pc.localDescription.type, sdp: peer.pc.localDescription.sdp } });
    });
  }
  function receive(kind, data) {
    const id = kind === 'stream' ? data.streamId : data.callId;
    if (!active || active.kind !== kind || active.id !== id) {
      const expectedStream = kind === 'stream' && typeof Home !== 'undefined' && Home.stream?.id === id && typeof S !== 'undefined' && S.v === 'live';
      const expectedCall = kind === 'call' && (pendingCall === id || typeof S !== 'undefined' && S.callId === id);
      if (((kind === 'call' && local) || expectedCall || expectedStream) && earlySignals.length < 100) earlySignals.push({ kind, data });
      return;
    }
    const session = active;
    if (!session.ready) { if (session.signals.length < 100) session.signals.push(data); return; }
    const from = data.from;
    if (!from || (session.kind === 'call' && session.peerId && from !== session.peerId) || (session.kind === 'stream' && !session.hosting && from !== session.hostId)) return;
    const existing = peers.get(from);
    if (!existing) {
      if (session.hosting || session.initiator) return;
      newPeer(session, from, false);
    }
    enqueue(session, from, async peer => {
      if (data.description) {
        const description = data.description;
        if (description.type !== (peer.offerer ? 'answer' : 'offer')) return;
        if (peer.offerer && peer.pc.signalingState !== 'have-local-offer') return;
        await peer.pc.setRemoteDescription(description);
        while (peer.pending.length) await peer.pc.addIceCandidate(peer.pending.shift());
        if (description.type === 'offer') {
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          sendSignal(session, from, { description: { type: peer.pc.localDescription.type, sdp: peer.pc.localDescription.sdp } });
        }
      }
      if (data.candidate) {
        if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate);
        else if (peer.pending.length < 100) peer.pending.push(data.candidate);
      }
    });
  }
  async function initialize(session) {
    session.config = await iceConfig();
    if (active !== session) return false;
    session.ready = true;
    attach();
    session.signals.splice(0).forEach(data => receive(session.kind, data));
    return true;
  }
  async function openStream(stream, hosting) {
    if (typeof DEMO !== 'undefined' && DEMO) return;
    if (active && active.kind === 'stream' && active.id === stream.id) { attach(); return; }
    clearPeers();
    if (!hosting) { stopTracks(local); local = null; }
    const session = { kind: 'stream', id: stream.id, hostId: stream.hostId || stream.host?.id, hosting: !!hosting, ready: false, signals: [], waitingPeers: new Set() };
    active = session;
    earlySignals.splice(0).forEach(signal => { if (signal.kind === 'stream' && signal.data.streamId === session.id) session.signals.push(signal.data); });
    try {
      if (typeof RTCPeerConnection === 'undefined') throw new Error('Live video is not supported by this device. Update your app or system WebView.');
      if (hosting && !local) throw new Error('Camera access is needed to broadcast. Return to Go Live and allow access.');
      if (!await initialize(session)) return;
      session.waitingPeers.forEach(id => offer(session, id));
      session.waitingPeers.clear();
      status(hosting ? 'You are live. Waiting for viewers…' : 'Connecting to the live creator…');
      Native.send('stream.ready', { streamId: session.id });
    } catch (error) { fail(session, error); }
  }
  Native.on('stream.peer', data => {
    const session = active;
    if (!session || session.kind !== 'stream' || !session.hosting || session.id !== data.streamId || !data.userId) return;
    if (!session.ready) session.waitingPeers.add(data.userId);
    else offer(session, data.userId);
  });
  Native.on('stream.peerLeft', data => {
    if (active && active.kind === 'stream' && active.id === data.streamId) {
      active.waitingPeers.delete(data.userId);
      closePeer(data.userId);
    }
  });
  Native.on('stream.signal', data => receive('stream', data));
  Native.on('rtc.signal', data => receive('call', data));
  Native.on('call.created', data => { if (!active && local) pendingCall = data.callId; });
  Native.on('call.incoming', data => { if (!active) pendingCall = data.callId; });
  async function connectCall(data) {
    if (typeof DEMO !== 'undefined' && DEMO) return;
    if (active && active.kind === 'call' && active.id === data.callId) return;
    handoffCall = null;
    clearPeers();
    const session = { kind: 'call', id: data.callId, peerId: data.peerId, initiator: !!data.initiator, voice: !!data.voice, ready: false, signals: [] };
    pendingCall = null;
    active = session;
    try {
      if (!local) throw new Error('Camera or microphone access is needed. End the call and allow access when starting again.');
      if (!await initialize(session)) return;
      if (session.initiator) {
        if (!session.peerId) throw new Error('The call participant could not be identified. Please try again.');
        offer(session, session.peerId);
      }
      earlySignals.splice(0).forEach(signal => receive(signal.kind, signal.data));
      status('Connecting your call…');
    } catch (error) { fail(session, error); }
  }
  Native.on('call.connected', connectCall);
  // Staff verification calls use the same call session, answered from verification-call.js.
  Native.on('verify.connected', connectCall);
  Native.on('verify.incoming', data => { if (!active) pendingCall = data.callId; });
  Native.on('verify.ended', data => { if ((active && active.kind === 'call' && active.id === data.callId) || (!active && pendingCall === data.callId)) stop(); });
  Native.on('call.ended', data => {
    if (handoffCall && handoffCall === data.callId) {
      handoffCall = null;
      if (active && active.kind === 'call' && active.id === data.callId) releaseCall();
      return;
    }
    if ((active && active.kind === 'call' && active.id === data.callId) || (!active && pendingCall === data.callId)) stop();
  });
  Native.on('call.failed', () => { if (!active || active.kind === 'call') stop(); });
  ['stream.closed', 'stream.ended'].forEach(type => Native.on(type, data => { if (active && active.kind === 'stream' && active.id === data.streamId) stop(); }));
  ['session.none', 'session.expired'].forEach(type => Native.on(type, stop));
  Native.on('realtime.status', data => {
    if (!active || active.kind !== 'stream') return;
    if (!data.connected) active.reconnecting = true;
    else if (active.reconnecting && active.ready) {
      active.reconnecting = false;
      // Keep any healthy media path through a short signaling outage. The
      // server restores room membership and replays outstanding peer offers.
      Native.send('stream.ready', { streamId: active.id });
    }
  });
  Native.on('operation.error', data => {
    if (data.action === 'rtc.config' && configRequest) {
      const pending = configRequest;
      configRequest = null;
      clearTimeout(pending.timer);
      pending.reject(new Error(data.message || 'Could not load video connection settings.'));
    } else if (data.action === 'stream.start') { stop(); status(data.message || 'The broadcast could not be started.', true); }
    else if (active && ['rtc.signal', 'stream.signal', 'stream.ready'].includes(data.action)) {
      if (active.kind === 'call' || data.action === 'stream.ready') fail(active, new Error(data.message || 'The media connection was interrupted.'));
      else status(data.message || 'The media connection was interrupted.', true);
    }
  });
  document.addEventListener('aurora:navigate', () => {
    const view = typeof S !== 'undefined' ? S.v : '';
    if (!mediaViews.has(view) || (active && active.kind === 'stream' && view !== 'live') || (active && active.kind === 'call' && !['call', 'hcall', 'voice', 'switch'].includes(view))) stop();
    else attach();
  });
  window.addEventListener('pagehide', stop);
  const screen = document.getElementById('screen');
  if (screen && typeof MutationObserver !== 'undefined') new MutationObserver(attach).observe(screen, { childList: true, subtree: true });
  window.ZimiMedia = { prepare, attach, openStream, stop, handoff, flipCamera, setPlaybackMuted, isPlaybackMuted: () => playbackMuted, getState };
})();
