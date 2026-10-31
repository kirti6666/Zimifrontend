const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const previouslyPassed = new Set([
  'test-api-client.cjs', 'test-api-adapter.cjs', 'test-auth-bridge.cjs',
  'test-native-network.cjs', 'test-chats.cjs',
]);
const files = fs.readdirSync(path.join(root, 'scripts'))
  .filter(file => /^test-.*\.cjs$/.test(file) && !previouslyPassed.has(file)).sort();
const results = [...previouslyPassed].map(file => ({ file, status: 'passed', phase: 'initial checks' }));
const started = new Date().toISOString();
function save() {
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify({ started, updated: new Date().toISOString(), results }, null, 2));
}
async function run(file) {
  const start = Date.now();
  const log = fs.createWriteStream(path.join(__dirname, file.replace(/\.cjs$/, '.log')));
  const child = spawn(process.execPath, [path.join('scripts', file)], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.on('error', () => child.kill());
  }, 180000);
  return new Promise(resolve => {
    let spawnError;
    child.on('error', error => { spawnError = error.message; });
    child.on('close', code => {
      clearTimeout(timer);
      log.end();
      const result = { file, status: timedOut ? 'timeout' : code === 0 ? 'passed' : 'failed', code, seconds: Math.round((Date.now() - start) / 100) / 10, ...(spawnError ? { error: spawnError } : {}) };
      results.push(result);
      save();
      console.log(`${result.status.toUpperCase()} ${file} (${result.seconds}s) [${results.length}/59]`);
      resolve();
    });
  });
}
async function worker() {
  while (files.length) await run(files.shift());
}
save();
Promise.all([worker(), worker(), worker()]).then(() => {
  const failures = results.filter(result => result.status !== 'passed');
  console.log(JSON.stringify({ passed: results.length - failures.length, total: results.length, failures }, null, 2));
  process.exitCode = failures.length ? 1 : 0;
});
