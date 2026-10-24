const fs = require('node:fs/promises');
const path = require('node:path');
const plist = require('@expo/plist').default;
const { IOSConfig, withFinalizedMod } = require('expo/config-plugins');

function isPrivateHost(host) {
  if (['localhost', '[::1]'].includes(host) || host.endsWith('.local')) return true;
  const octets = host.split('.').map(Number);
  if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  return octets[0] === 127 || octets[0] === 10 || (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 169 && octets[1] === 254);
}

async function configureIosDebugNetwork(projectRoot, apiAddress = process.env.EXPO_PUBLIC_API_URL) {
  const project = IOSConfig.XcodeUtils.getPbxproj(projectRoot);
  const debug = IOSConfig.Target.getXCBuildConfigurationFromPbxproj(project, { buildConfiguration: 'Debug' });
  const release = IOSConfig.Target.getXCBuildConfigurationFromPbxproj(project, { buildConfiguration: 'Release' });
  if (!debug || !release) throw new Error('BinzoLive local networking requires separate Debug and Release iOS configurations.');
  const iosRoot = path.resolve(projectRoot, 'ios');
  const releaseRelative = String(release.buildSettings.INFOPLIST_FILE || '').replace(/"/g, '').replace(/^\$\(SRCROOT\)\//, '');
  const releasePath = path.resolve(iosRoot, releaseRelative);
  if (!releaseRelative || !releasePath.startsWith(iosRoot + path.sep) || !releasePath.endsWith('.plist')) throw new Error('The iOS Release Info.plist must be inside the generated iOS project.');
  const base = plist.parse(await fs.readFile(releasePath, 'utf8'));
  // These values are also in app.json; keep the generated Release configuration
  // strict even if an older prebuilt template had broader transport exceptions.
  base.NSAppTransportSecurity = { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: false };
  delete base.NSLocalNetworkUsageDescription;
  await fs.writeFile(releasePath, plist.build(base));

  const hosts = new Set(['localhost', '127.0.0.1', '10.0.2.2']);
  try {
    const api = new URL(apiAddress || '');
    if (api.protocol === 'http:' && !api.username && !api.password && isPrivateHost(api.hostname)) hosts.add(api.hostname.replace(/^\[|\]$/g, ''));
  } catch { /* API configuration errors are explained by the native request layer. */ }
  const debugInfo = {
    ...base,
    NSLocalNetworkUsageDescription: 'BinzoLive development connects to the backend and development server on your local Wi-Fi network.',
    NSAppTransportSecurity: {
      NSAllowsArbitraryLoads: false,
      NSAllowsLocalNetworking: true,
      NSExceptionDomains: Object.fromEntries([...hosts].map(host => [host, { NSExceptionAllowsInsecureHTTPLoads: true, NSIncludesSubdomains: false }])),
    },
  };
  const debugRelative = path.posix.join(path.posix.dirname(releaseRelative.replace(/\\/g, '/')), 'Info-Debug.plist');
  await fs.writeFile(path.resolve(iosRoot, debugRelative), plist.build(debugInfo));
  debug.buildSettings.INFOPLIST_FILE = `"${debugRelative}"`;
  await fs.writeFile(IOSConfig.Paths.getPBXProjectPath(projectRoot), project.writeSync());
}

module.exports = function withDevelopmentNetwork(config) {
  // Finalized mods run after Info.plist and Xcode mods, so the debug copy contains
  // all permission strings and values produced by the other Expo plugins.
  return withFinalizedMod(config, ['ios', async mod => {
    if (!mod.modRequest.introspect) await configureIosDebugNetwork(mod.modRequest.projectRoot);
    return mod;
  }]);
};
module.exports.configureIosDebugNetwork = configureIosDebugNetwork;
