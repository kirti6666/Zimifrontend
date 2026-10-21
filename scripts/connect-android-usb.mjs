import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const toolingEnv = { ...process.env };
const notice = message => console.log(`Android USB: ${message}`);
const run = (adb, args) => spawnSync(adb, args, {
  encoding: 'utf8', timeout: 8000, windowsHide: true, env: toolingEnv,
});

function localPort(address) {
  try {
    const url = new URL(address);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return;
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return;
    return url.port || (url.protocol === 'https:' ? '443' : '80');
  } catch { /* Invalid API configuration is explained by the app. */ }
}

function connect() {
  // Match Expo's development .env precedence and preserve shell overrides.
  process.env.NODE_ENV ||= 'development';
  const expoRequire = createRequire(require.resolve('expo/package.json'));
  expoRequire('@expo/env').loadProjectEnv(projectRoot, { silent: true });
  const ports = [...new Set([
    localPort(process.env.EXPO_PUBLIC_API_URL),
    localPort(process.env.EXPO_PUBLIC_SOCKET_URL),
  ].filter(Boolean))];
  if (!ports.length) return; // LAN, remote servers and emulator addresses need no USB tunnel.

  const defaultSdk = process.platform === 'win32'
    ? path.join(toolingEnv.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'), 'Android', 'Sdk')
    : process.platform === 'darwin' ? path.join(homedir(), 'Library', 'Android', 'sdk')
      : path.join(homedir(), 'Android', 'Sdk');
  const executable = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const candidates = [...new Set([
    ...[toolingEnv.ANDROID_HOME, toolingEnv.ANDROID_SDK_ROOT, defaultSdk]
      .filter(Boolean).map(sdk => path.join(sdk, 'platform-tools', executable)),
    executable,
  ])];
  const adb = candidates.find(candidate => run(candidate, ['version']).status === 0);
  if (!adb) {
    notice('ADB was not found. Install Android SDK platform-tools to connect the local backend.');
    return;
  }

  const selector = toolingEnv.ANDROID_SERIAL?.trim()
    ? ['-s', toolingEnv.ANDROID_SERIAL.trim()] : ['-d'];
  const selected = run(adb, [...selector, 'get-serialno']);
  const serial = selected.stdout?.trim();
  if (selected.status !== 0 || !serial || serial === 'unknown') {
    const error = selected.stderr || '';
    notice(/unauthorized/i.test(error)
      ? 'Unlock the phone and accept USB debugging, then run npm run android:connect.'
      : /more than one/i.test(error)
        ? 'More than one USB phone is connected. Set ANDROID_SERIAL, then run npm run android:connect.'
        : 'No selected USB phone is available. Connect it with USB debugging enabled, then run npm run android:connect.');
    return;
  }
  if (run(adb, ['-s', serial, 'get-state']).stdout?.trim() !== 'device') {
    notice('Unlock the phone and accept USB debugging, then run npm run android:connect.');
    return;
  }

  const connected = ports.filter(port =>
    run(adb, ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]).status === 0);
  if (connected.length) notice(`Local server ports connected: ${connected.join(', ')}.`);
  if (connected.length !== ports.length) {
    notice('Some ports could not connect. Reconnect the phone and run npm run android:connect.');
  }
}

try { connect(); }
catch { notice('Automatic connection could not finish. Run npm run android:connect after checking the Android SDK setup.'); }
// This optional setup must not prevent Expo from selecting a device or reporting its own errors.
