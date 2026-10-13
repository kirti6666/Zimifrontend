const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const plist = require('@expo/plist').default;
const { IOSConfig } = require('expo/config-plugins');
const { configureIosDebugNetwork } = require('../plugins/with-development-network');

(async () => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'zimi-native-network-'));
  const appRoot = path.join(fixture, 'ios', 'Zimi');
  const projectRoot = path.join(fixture, 'ios', 'Zimi.xcodeproj');
  await fs.mkdir(appRoot, { recursive: true });
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(path.join(appRoot, 'Info.plist'), plist.build({
    CFBundleIdentifier: 'com.aurora.liveapp', NSCameraUsageDescription: 'Existing camera permission',
    NSAppTransportSecurity: { NSAllowsArbitraryLoads: true, NSAllowsLocalNetworking: true },
  }));
  await fs.writeFile(path.join(projectRoot, 'project.pbxproj'), `// !$*UTF8*$!
{ archiveVersion = 1; classes = {}; objectVersion = 54; objects = {
/* Begin PBXProject section */
  PROJECT = { isa = PBXProject; targets = (APP,); };
/* End PBXProject section */
/* Begin PBXNativeTarget section */
  APP = { isa = PBXNativeTarget; name = Zimi; productType = "com.apple.product-type.application"; buildConfigurationList = CONFIGS; };
/* End PBXNativeTarget section */
/* Begin XCConfigurationList section */
  CONFIGS = { isa = XCConfigurationList; buildConfigurations = (DEBUG /* Debug */, RELEASE /* Release */,); defaultConfigurationName = Release; };
/* End XCConfigurationList section */
/* Begin XCBuildConfiguration section */
  DEBUG = { isa = XCBuildConfiguration; name = Debug; buildSettings = { INFOPLIST_FILE = "Zimi/Info.plist"; }; };
  RELEASE = { isa = XCBuildConfiguration; name = Release; buildSettings = { INFOPLIST_FILE = "Zimi/Info.plist"; }; };
/* End XCBuildConfiguration section */
}; rootObject = PROJECT; }
`);
  await configureIosDebugNetwork(fixture, 'http://192.168.1.6:5000/api/v1');
  const release = plist.parse(await fs.readFile(path.join(appRoot, 'Info.plist'), 'utf8'));
  const debug = plist.parse(await fs.readFile(path.join(appRoot, 'Info-Debug.plist'), 'utf8'));
  assert.deepEqual({ ...release.NSAppTransportSecurity }, { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: false });
  assert.equal(release.NSLocalNetworkUsageDescription, undefined);
  assert.equal(debug.NSAppTransportSecurity.NSAllowsArbitraryLoads, false);
  assert.equal(debug.NSAppTransportSecurity.NSAllowsLocalNetworking, true);
  assert.equal(debug.NSAppTransportSecurity.NSExceptionDomains['192.168.1.6'].NSExceptionAllowsInsecureHTTPLoads, true);
  assert.equal(debug.NSCameraUsageDescription, 'Existing camera permission');
  assert.ok(debug.NSLocalNetworkUsageDescription);
  const project = IOSConfig.XcodeUtils.getPbxproj(fixture);
  assert.equal(IOSConfig.Target.getXCBuildConfigurationFromPbxproj(project, { buildConfiguration: 'Debug' }).buildSettings.INFOPLIST_FILE, '"Zimi/Info-Debug.plist"');
  assert.equal(IOSConfig.Target.getXCBuildConfigurationFromPbxproj(project, { buildConfiguration: 'Release' }).buildSettings.INFOPLIST_FILE, '"Zimi/Info.plist"');
  await configureIosDebugNetwork(fixture, 'http://public.example.com/api/v1');
  const updatedDebug = plist.parse(await fs.readFile(path.join(appRoot, 'Info-Debug.plist'), 'utf8'));
  assert.equal(updatedDebug.NSAppTransportSecurity.NSExceptionDomains['public.example.com'], undefined, 'A public HTTP API never creates an insecure exception');
  assert.equal(updatedDebug.NSAppTransportSecurity.NSExceptionDomains['192.168.1.6'], undefined, 'Regeneration cannot retain a previous LAN exception');
  assert.equal(updatedDebug.NSCameraUsageDescription, 'Existing camera permission');
  console.log('PASS native networking: Debug-only iOS local access, strict Release ATS, private API exception, permission preservation, and safe regeneration.');
})().catch(error => { console.error(error); process.exitCode = 1; });
