/* Link between these screens and the React Native shell (src/bridge.ts).

   DEMO is on for the website preview and off in the phone app build
   (scripts/build-web.mjs sets window.ZIMI_DEMO=false for the app bundle).
   With DEMO on, the screens fake the other side of every call: pick-ups,
   incoming callers, gifts and chat replies. With DEMO off, those arrive from
   the server through Native.on(...), and every user action is reported with
   Native.send(...). The message names are listed in src/bridge.ts.

   Must stay top-level: the runtime and its inline handlers use these names. */
const DEMO = window.ZIMI_DEMO !== false;

const Native = {
  handlers: {},
  /* Screen -> app. A no-op in the browser, where there is no shell. */
  send(type, data) {
    if (!window.ReactNativeWebView) return;
    window.ReactNativeWebView.postMessage(JSON.stringify({ type, data: data || {} }));
  },
  /* App -> screen. */
  on(type, fn) {
    (this.handlers[type] = this.handlers[type] || []).push(fn);
  },
  receive(msg) {
    (this.handlers[msg.type] || []).forEach((fn) => {
      try { fn(msg.data || {}); } catch (e) { console.error(e); }
    });
  },
};

/* The shell calls this through injectJavaScript. */
window.zimiReceive = (msg) => Native.receive(typeof msg === "string" ? JSON.parse(msg) : msg);
