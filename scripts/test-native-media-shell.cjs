/* Real App.tsx + bridge-envelope parser with a connected native media boundary.
   Native frame transport and the server are isolated fixtures; no devices used. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
function shell() {
  const hooks = [], pendingEffects = [], posts = [], serverWrites = [], calls = [], activities = [], incoming = [];
  let cursor = 0, receiveServer, nativeSend, nativeState;
  const hooksEqual = (a, b) => !!a && !!b && a.length === b.length && a.every((value, index) => value === b[index]);
  const react = {
    useState(initial) { const index = cursor++; if (!hooks[index]) hooks[index] = { value: typeof initial === 'function' ? initial() : initial }; return [hooks[index].value, value => { hooks[index].value = typeof value === 'function' ? value(hooks[index].value) : value; }]; },
    useRef(current) { const index = cursor++; return hooks[index] ||= { current }; },
    useMemo(work, dependencies) { const index = cursor++; if (!hooks[index] || !hooksEqual(hooks[index].dependencies, dependencies)) hooks[index] = { value: work(), dependencies }; return hooks[index].value; },
    useCallback(work, dependencies) { return react.useMemo(() => work, dependencies); },
    useEffect(work, dependencies) { const index = cursor++; if (!hooks[index] || !hooksEqual(hooks[index].dependencies, dependencies)) { const before = hooks[index]; hooks[index] = { dependencies }; pendingEffects.push(() => { before?.cleanup?.(); hooks[index].cleanup = work(); }); } },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const bridge = {
    handle: message => serverWrites.push(plain(message)), documentLoading: () => calls.push('documentLoading'),
    prepareForUpdate: () => calls.push('prepareForUpdate'), close: () => calls.push('bridge.close'),
  };
  const media = {
    requests: [], events: [], handle(request) { this.requests.push(plain(request)); }, event(message) { this.events.push(plain(message)); },
    stop: () => calls.push('media.stop'), close: () => calls.push('media.close'),
  };
  const cache = new Map(), timers = new Map();
  const load = relative => {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const requireMock = name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'react-native') return {
        Alert: { alert: () => {} }, AppState: { addEventListener: (_event, listener) => { activities.push(listener); return { remove: () => activities.splice(activities.indexOf(listener), 1) }; } },
        BackHandler: { addEventListener: () => ({ remove() {} }), exitApp() {} }, Keyboard: { addListener: () => ({ remove() {} }) },
        KeyboardAvoidingView: 'KeyboardAvoidingView', Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: styles => styles, absoluteFill: { position: 'absolute' } },
      };
      if (name === 'react-native-webview') return { WebView: 'WebView' };
      if (name === 'react-native-safe-area-context') return { SafeAreaProvider: 'SafeAreaProvider', SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
      if (name === 'expo-status-bar') return { StatusBar: 'StatusBar' };
      if (name === 'expo-screen-capture') return { preventScreenCaptureAsync: async () => {}, allowScreenCaptureAsync: async () => {} };
      if (name === './assets/aurora-bundle') return { __esModule: true, default: '<html><head></head><body>Fixture</body></html>' };
      if (name === './src/bridge') return { createBridge: emit => { receiveServer = emit; return bridge; }, postToWeb: (_reference, message) => posts.push(plain(message)) };
      if (name === './src/native-media/controller') return { createNativeMedia: (send, onState) => { nativeSend = send; nativeState = onState; return media; } };
      if (name === './src/native-media/view') return { NATIVE_MEDIA_ENABLED: true, NativeMediaLayer: 'NativeMediaLayer' };
      if (name === './src/native-media/camera-test') return { NATIVE_CAMERA_TEST: false, NativeCameraTest: 'NativeCameraTest' };
      if (name === './src/launch-screen') return { LaunchScreen: 'LaunchScreen' };
      if (name === './src/theme-cache') return { readThemeCache: () => ({ default: { colors: { primary: '#123456' } } }) };
      if (name === './src/config') return { API_URL: 'https://api.example.test/api/v1' };
      if (name === './src/app-update') return { useAppUpdates: () => ({ state: { status: 'allowed' } }) };
      if (name === './src/app-update-screen') return { AppUpdateScreen: 'AppUpdateScreen' };
      if (name === './src/incoming-call-screen') return { IncomingCallScreen: 'IncomingCallScreen', useIncomingCall: () => ({}) };
      if (name === './api/support') return { SUPPORT_CATEGORIES: [], SUPPORT_STATUSES: [] };
      if (name === './api/official') return { officialCursor: () => false, officialMessageId: () => false };
      if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`)));
      throw new Error(`Unexpected dependency ${name}`);
    };
    vm.runInNewContext(code, { module, exports: module.exports, require: requireMock, console, setTimeout: (work, delay) => { const id = Symbol(); timers.set(id, { work, delay }); return id; }, clearTimeout: id => timers.delete(id) }, { filename });
    return module.exports;
  };
  const app = load('App.tsx');
  const all = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(all)];
  function render() { cursor = 0; const tree = app.AppContent({ onIncomingEvent: message => incoming.push(plain(message)) }); pendingEffects.splice(0).forEach(work => work()); return tree; }
  const find = (tree, type) => all(tree).find(node => node.type === type || typeof node.type === 'function' && node.type.name === type);
  const send = (type, data = {}, url = 'https://aurora.localhost/') => find(render(), 'WebView').props.onMessage({ nativeEvent: { url, data: JSON.stringify({ type, data }) } });
  function unmount() { hooks.forEach(hook => hook?.cleanup?.()); }
  return { render, find, send, unmount, posts, calls, media, serverWrites, activities, incoming, server: message => receiveServer(message), nativeSend: message => nativeSend(message), state: value => nativeState(value), timers };
}

test('renderer death replaces the native WebView, retires media and bounds repeated recovery', () => {
  const h = shell();
  let web = h.find(h.render(), 'WebView');
  const firstKey = web.key;
  assert.equal(web.props.onRenderProcessGone(), true);
  web = h.find(h.render(), 'WebView');
  assert.notEqual(web.key, firstKey, 'A dead renderer must get a different native WebView instance');
  assert.deepEqual(h.calls.slice(-2), ['documentLoading', 'media.stop']);
  web.props.onRenderProcessGone();
  web = h.find(h.render(), 'WebView');
  web.props.onRenderProcessGone();
  let tree = h.render();
  assert.equal(h.find(tree, 'WebView'), undefined, 'Repeated renderer failures show recovery instead of an OOM restart loop');
  h.find(tree, 'Pressable').props.onPress();
  web = h.find(h.render(), 'WebView');
  assert.ok(web, 'Manual retry mounts a new WebView and resets the automatic retry allowance');
  web.props.onContentProcessDidTerminate();
  assert.ok(h.find(h.render(), 'WebView'));
  h.unmount();
});

test('a document that never starts reaches a retry screen; an offline ready document stays mounted', () => {
  for (const ready of [false, true]) {
    const h = shell(); h.render();
    if (ready) h.send('ready', { demo: false });
    [...h.timers.values()].find(timer => timer.delay === 20000).work();
    assert.equal(!!h.find(h.render(), 'WebView'), ready);
    if (!ready) assert.ok(h.find(h.render(), 'Pressable'), 'Script startup failure has a usable Retry action');
    h.unmount();
    assert.equal(h.timers.size, 0);
  }
});

test('enabled Android shell declares native media before the document loads and keeps controls above native video', () => {
  const h = shell(), tree = h.render(), web = h.find(tree, 'WebView'), renderer = h.find(tree, 'NativeMediaLayer');
  assert.ok(renderer, 'Enabled shell mounts the native RTC renderer');
  assert.match(web.props.source.html, /window\.ZIMI_NATIVE_MEDIA=true/);
  assert.equal(web.props.style.at(-1).backgroundColor, 'transparent');
  assert.equal(renderer.props.layout, null);
  assert.equal(renderer.props.state, null);
  assert.equal(h.media.requests.length, 0, 'Mounting the shell does not acquire a camera');
  renderer.props.onDimensions('local', 1080, 1920);
  assert.deepEqual(h.posts.at(-1), { type: 'native.media.dimensions', data: { kind: 'local', width: 1080, height: 1920 } });
  h.unmount();
});

test('native RPC and layout honor the real trusted-origin parser and reject web-side signal injection', () => {
  const h = shell(); h.render();
  const prepare = { requestId: 1, action: 'prepare', data: { video: true } };
  h.send('native.media', prepare, 'https://attacker.example/');
  h.send('native.media', prepare, 'https://aurora.localhost/other-path');
  assert.equal(h.media.requests.length, 0);
  h.send('native.media', prepare);
  assert.deepEqual(h.media.requests, [prepare]);
  h.send('native.media', { requestId: 2, action: 'signal', data: { callId: 'forged-call' } });
  h.send('native.media', { requestId: 3, action: 'connect', data: { callId: 'forged-call' } });
  h.send('native.media', { requestId: 4, action: 'beauty', data: { enabled: true, settings: [['executeArbitraryCode', [1]]] } });
  assert.equal(h.media.requests.length, 1, 'The page cannot inject connected-call authority or unsupported native commands');
  const layout = { width: 390, height: 800, slots: [{ kind: 'local', x: 1, y: 2, width: 100, height: 160, radius: 10, fit: 'contain' }] };
  h.send('native.media.layout', layout);
  assert.deepEqual(plain(h.find(h.render(), 'NativeMediaLayer').props.layout), layout);
  h.send('native.media.layout', { ...layout, slots: [{ ...layout.slots[0], width: Infinity }] });
  assert.deepEqual(plain(h.find(h.render(), 'NativeMediaLayer').props.layout), layout);
  assert.equal(h.serverWrites.length, 0, 'Media RPC never reaches the API bridge as an arbitrary web action');
  h.unmount();
});

test('fullscreen video consumes native insets only in overlaid controls and restores navigation padding', () => {
  const h = shell(); let tree = h.render();
  assert.deepEqual(plain(h.find(tree, 'SafeAreaView').props.edges), ['top', 'right', 'bottom', 'left']);
  h.find(tree, 'SafeAreaReporter').props.onChange({ top: 32, right: 0, bottom: 24, left: 0 });
  h.send('ready', { demo: false });
  assert.ok(h.posts.some(message => message.type === 'app.insets' && message.data.top === 32 && message.data.bottom === 24));
  const layout = { width: 390, height: 844, slots: [], fullScreen: true };
  h.send('native.media.layout', layout); tree = h.render();
  assert.deepEqual(plain(h.find(tree, 'SafeAreaView').props.edges), [], 'The native video/WebView viewport reaches all physical display edges');
  assert.equal(h.find(tree, 'StatusBar').props.style, 'light');
  assert.equal(h.find(tree, 'KeyboardShell').props.fullScreen, true);
  h.send('native.media.layout', { ...layout, fullScreen: 'yes' });
  assert.equal(h.find(h.render(), 'KeyboardShell').props.fullScreen, true, 'Invalid fullscreen input cannot alter geometry');
  h.send('native.media.layout', { ...layout, fullScreen: false }); tree = h.render();
  assert.deepEqual(plain(h.find(tree, 'SafeAreaView').props.edges), ['top', 'right', 'bottom', 'left'], 'Minimized/voice/ordinary pages regain normal safe-area padding');
  h.send('native.media.layout', layout);
  h.find(h.render(), 'WebView').props.onLoadStart();
  assert.deepEqual(plain(h.find(h.render(), 'SafeAreaView').props.edges), ['top', 'right', 'bottom', 'left'], 'Document replacement retires fullscreen geometry');
  h.unmount();
});

test('server call events reach native media and page; native signaling retains the authenticated bridge route', () => {
  const h = shell(); h.render();
  const connected = { type: 'call.connected', data: { callId: 'call-one', peerId: 'peer-one', initiator: true } };
  h.server(connected);
  assert.deepEqual(h.media.events, [connected]); assert.deepEqual(h.posts.at(-1), connected); assert.deepEqual(h.incoming.at(-1), connected);
  const signal = { type: 'rtc.signal', data: { callId: 'call-one', description: { type: 'offer', sdp: 'native-sdp' } } };
  h.nativeSend(signal);
  assert.deepEqual(h.serverWrites, [signal]);
  assert.equal(h.posts.filter(event => event.type === 'rtc.signal').length, 0, 'Outgoing native offers are sent to the server instead of reflected into the page');
  const result = { type: 'native.media.result', data: { requestId: 1, result: { hasVideo: true } } };
  h.nativeSend(result); assert.deepEqual(h.posts.at(-1), result); assert.equal(h.serverWrites.length, 1);
  const ended = { type: 'call.ended', data: { callId: 'call-one' } };
  h.server(ended); assert.deepEqual(h.media.events.at(-1), ended); assert.deepEqual(h.posts.at(-1), ended);
  h.activities.forEach(listener => listener('active'));
  assert.deepEqual(h.media.events.at(-1), { type: 'app.foreground', data: {} });
  h.unmount();
});

test('renderer observes a video track added to an existing stream and retires layout on document replacement', () => {
  const h = shell(); h.render();
  const local = { id: 'local-stream' }, remote = { id: 'remote-stream' };
  const state = { local, remote, hasVideo: true, remoteVideo: false, camera: true, microphone: true, facing: 'user', playbackMuted: false, status: 'Connected', quality: 'good', beautyStatus: 'idle' };
  h.state(state);
  assert.equal(h.find(h.render(), 'NativeMediaLayer').props.state.remoteVideo, false);
  h.state({ ...state, remoteVideo: true });
  assert.equal(h.find(h.render(), 'NativeMediaLayer').props.state.remoteVideo, true, 'Audio-first remote stream must render when video arrives later');
  const layout = { width: 390, height: 800, slots: [] }; h.send('native.media.layout', layout);
  const web = h.find(h.render(), 'WebView'); web.props.onLoadStart();
  assert.deepEqual(h.calls.slice(-2), ['documentLoading', 'media.stop']);
  assert.equal(h.find(h.render(), 'NativeMediaLayer').props.layout, null);
  h.unmount();
  assert.ok(h.calls.includes('media.close')); assert.ok(h.calls.includes('bridge.close')); assert.ok(h.calls.includes('prepareForUpdate'));
  assert.equal(h.timers.size, 0);
});
