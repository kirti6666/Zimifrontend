const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Gradle can reuse a Metro bundle built with a developer's local .env. Force
// only the release JS/package tasks and supply the production public origins.
const tasks = [':app:createBundleReleaseJsAndAssets', '--rerun', ':app:packageRelease', '--rerun', ':app:assembleRelease', '--console=plain'];
const windows = process.platform === 'win32';
const result = spawnSync(windows ? 'cmd.exe' : './gradlew', windows ? ['/d', '/s', '/c', `gradlew.bat ${tasks.join(' ')}`] : tasks, {
  cwd: path.resolve(__dirname, '../android'),
  env: { ...process.env, NODE_ENV: 'production', EXPO_PUBLIC_API_URL: 'https://api.binzolive.com/api/v1', EXPO_PUBLIC_SOCKET_URL: 'https://api.binzolive.com' },
  stdio: 'inherit', windowsHide: true,
});
if (result.error) { console.error(result.error.message); process.exitCode = 1; }
else process.exitCode = result.status ?? 1;
