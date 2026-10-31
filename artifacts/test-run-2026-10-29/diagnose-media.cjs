const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const original = path.resolve(__dirname, '../../scripts/test-home-media.cjs');
let source = fs.readFileSync(original, 'utf8');
const target = "await pages.viewer.waitForFunction(() => document.querySelector('[data-zimi-remote]').readyState >= 2, { timeout: 15000 });";
if (!source.includes(target)) throw new Error('Diagnostic insertion point was not found');
source = source.replace(target, `try {
      await pages.viewer.waitForFunction(() => document.querySelector('[data-zimi-remote]').readyState >= 2, null, { timeout: 10000 });
    } catch (error) {
      const diagnostics = { errors, messages: messages.map(m => ({...m, data: {...m.data, ...(m.data.description ? {description: {type: m.data.description.type}} : {})}})) };
      for (const [name, page] of Object.entries(pages)) diagnostics[name] = await page.evaluate(() => ({
        state: ZimiMedia.getState(), notice: window.lastNotice,
        peers: peerConnections.map(pc => ({ connection: pc.connectionState, ice: pc.iceConnectionState, gathering: pc.iceGatheringState, signaling: pc.signalingState, local: pc.localDescription?.type, remote: pc.remoteDescription?.type, receivers: pc.getReceivers().map(r => ({kind:r.track.kind,state:r.track.readyState,muted:r.track.muted})) })),
        video: [...document.querySelectorAll('video')].map(v => ({local:v.hasAttribute('data-zimi-local'), readyState:v.readyState, paused:v.paused, muted:v.muted, stream: v.srcObject ? v.srcObject.getTracks().map(t=>({kind:t.kind,state:t.readyState,enabled:t.enabled,muted:t.muted})) : null}))
      }));
      fs.writeFileSync(path.join(__dirname, '../artifacts/test-run-2026-10-29/media-diagnostics.json'), JSON.stringify(diagnostics, null, 2));
      console.error(JSON.stringify(diagnostics, null, 2));
      throw error;
    }`);
const testModule = new Module(original, module);
testModule.filename = original;
testModule.paths = Module._nodeModulePaths(path.dirname(original));
testModule._compile(source, original);
