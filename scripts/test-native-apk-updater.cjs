/* Native boundary/configuration contracts. No APK is downloaded or installed. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const plugin=require('../plugins/with-apk-updater');
const {bumpAndroidRelease}=require('./bump-android-release.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));

function wrapper(platform='android',available=true){
  const calls=[],events=new Map();let removed=false;
  const receipt={receiptId:'12345678-1234-1234-1234-123456789abc',releaseId:'release-1',versionCode:3,sizeBytes:1234,sha256:'a'.repeat(64)};
  const native={
    getInstalledApp:async()=>({supported:true,packageName:'com.aurora.liveapp',versionName:'1.0.5',versionCode:2}),
    downloadRelease:async release=>{calls.push(['download',plain(release)]);return receipt},
    getVerifiedRelease:async id=>{calls.push(['verified',id]);return receipt},
    installRelease:async id=>{calls.push(['install',id]);return {status:'permission_required'}},
    cancelDownload:async(...args)=>{calls.push(['cancel',...args])},addListener(){},removeListeners(){},
  };
  class NativeEventEmitter{addListener(name,listener){events.set(name,listener);return {remove(){removed=true;events.delete(name)}}}}
  const module={exports:{}};
  const source=ts.transpileModule(fs.readFileSync(path.join(root,'src/native-apk-updater.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source,{module,exports:module.exports,URL,require:name=>{assert.equal(name,'react-native');return {Platform:{OS:platform},NativeModules:available?{BinzoApkUpdater:native}:{},NativeEventEmitter}}});
  return {api:module.exports,calls,events,receipt,removed:()=>removed};
}

(async()=>{
  const unsupported=wrapper('ios');assert.equal((await unsupported.api.getInstalledApp()).supported,false);assert.equal(unsupported.calls.length,0);
  const missing=wrapper('android',false);assert.equal((await missing.api.getInstalledApp()).supported,false);
  const h=wrapper();assert.equal((await h.api.getInstalledApp()).versionCode,2);
  const release={url:'https://api.binzolive.com/api/v1/app/releases/release-1/download',releaseId:'release-1',sha256:'a'.repeat(64),sizeBytes:1234,versionCode:3};
  for(const invalid of [{...release,url:'http://api.binzolive.com/update'},{...release,url:'https://person:secret@api.binzolive.com/update'},{...release,sha256:'invalid'},{...release,sizeBytes:250*1024*1024+1},{...release,sizeBytes:1.5},{...release,versionCode:0},{...release,releaseId:'../other'}])await assert.rejects(h.api.downloadRelease(invalid));
  assert.equal(h.calls.length,0,'Invalid release details never reach native download');
  assert.deepEqual(plain(await h.api.downloadRelease(release)),h.receipt);
  assert.deepEqual(h.calls[0],['download',release]);
  await assert.rejects(h.api.installRelease('/sdcard/another.apk'));assert.equal(h.calls.filter(call=>call[0]==='install').length,0);
  assert.equal((await h.api.installRelease(h.receipt.receiptId)).status,'permission_required');
  assert.deepEqual(plain(await h.api.getVerifiedRelease('release-1')),h.receipt);
  await h.api.cancelDownload('release-1');await h.api.cancelDownload('release-1',true);
  assert.deepEqual(h.calls.slice(-2),[['cancel','release-1',false],['cancel','release-1',true]]);
  const progress=[],stop=h.api.addDownloadProgressListener(value=>progress.push(value));
  h.events.get('BinzoApkUpdaterProgress')({releaseId:'release-1',downloadedBytes:12,totalBytes:1234,phase:'downloading'});
  h.events.get('BinzoApkUpdaterProgress')({releaseId:'release-1',downloadedBytes:Infinity,totalBytes:1234,phase:'downloading'});
  h.events.get('BinzoApkUpdaterProgress')({releaseId:'release-1',downloadedBytes:12,totalBytes:1234,phase:'other'});
  assert.equal(progress.length,1);stop();assert.equal(h.removed(),true);

  const manifest={application:[{$:{}}]};plugin.configureManifest(manifest);plugin.configureManifest(manifest);
  assert.equal(manifest['uses-permission'].length,1);assert.equal(manifest.application[0].provider.length,1);assert.equal(manifest.application[0]['meta-data'].length,1);
  const provider=manifest.application[0].provider[0];assert.equal(provider.$['android:exported'],'false');assert.equal(provider.$['android:grantUriPermissions'],'true');
  assert.equal(provider.$['android:authorities'],'${applicationId}.apk-updates');
  assert.equal(provider['meta-data'][0].$['android:resource'],'@xml/binzolive_apk_paths');
  assert.equal(manifest.application[0]['meta-data'][0].$['android:value'],'1');
  assert.deepEqual(plugin.trustedHosts(),['api.binzolive.com','5919c75fa33b26baaeb71b893051cac1.r2.cloudflarestorage.com']);
  for(const host of ['*.r2.dev','https://evil.test','good..evil','host/path'])assert.throws(()=>plugin.trustedHosts({storageHosts:[host]}));
  const registered=plugin.registerPackage('PackageList(this).packages.apply {\n}');assert.equal(plugin.registerPackage(registered),registered);assert.throws(()=>plugin.registerPackage('unsupported native template'));

  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'binzolive-updater-tests-'));
  try{
    fs.mkdirSync(path.join(temp,'plugins/android'),{recursive:true});
    fs.copyFileSync(path.join(root,'plugins/android/BinzoApkUpdaterModule.kt'),path.join(temp,'plugins/android/BinzoApkUpdaterModule.kt'));
    plugin.writeNativeFiles(temp,path.join(temp,'android'),'com.example.updater',plugin.trustedHosts());
    const paths=fs.readFileSync(path.join(temp,'android/app/src/main/res/xml/binzolive_apk_paths.xml'),'utf8');
    assert.match(paths,/<cache-path[^>]+path="apk-updates\/verified\/"/);assert.doesNotMatch(paths,/<(?:root|external)-path/);
    assert.match(fs.readFileSync(path.join(temp,'android/app/src/main/java/com/example/updater/BinzoApkUpdaterModule.kt'),'utf8'),/^package com\.example\.updater/);
    fs.writeFileSync(path.join(temp,'app.json'),JSON.stringify({expo:{version:'1.0.5',android:{versionCode:2}}}));
    const gradle=path.join(temp,'android/app/build.gradle');fs.writeFileSync(gradle,'versionCode 2\nversionName "1.0.5"\n');
    assert.deepEqual(bumpAndroidRelease(temp,'1.0.6'),{versionName:'1.0.6',versionCode:3});
    assert.match(fs.readFileSync(gradle,'utf8'),/versionCode 3/);assert.match(fs.readFileSync(gradle,'utf8'),/versionName "1.0.6"/);
    const snapshot=fs.readFileSync(path.join(temp,'app.json'),'utf8');assert.throws(()=>bumpAndroidRelease(temp,'1.0.7','3'),/greater than 3/);
    assert.equal(fs.readFileSync(path.join(temp,'app.json'),'utf8'),snapshot,'Rejected version codes never change either version file');
    assert.deepEqual(bumpAndroidRelease(temp,'1.0.7','5'),{versionName:'1.0.7',versionCode:5});
  }finally{
    const resolved=path.resolve(temp),allowed=path.join(path.resolve(os.tmpdir()),'binzolive-updater-tests-');
    assert.ok(resolved.startsWith(allowed)&&path.dirname(resolved)===path.resolve(os.tmpdir()));fs.rmSync(resolved,{recursive:true,force:true});
  }
  console.log('PASS native APK updater boundary/config: metadata, validated download inputs, opaque receipts, permission flow, progress cleanup, exact host pins, narrow FileProvider, idempotent registration and monotonic release versions');
})().catch(error=>{console.error(error);process.exitCode=1});
