const fs=require('node:fs');
const path=require('node:path');

function bumpAndroidRelease(projectRoot,versionName,requestedCode){
  if(!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(versionName||''))throw new Error('Usage: npm run release:version -- 1.0.6 [versionCode]');
  const appFile=path.join(projectRoot,'app.json'),gradleFile=path.join(projectRoot,'android/app/build.gradle');
  const app=JSON.parse(fs.readFileSync(appFile,'utf8'));
  const gradle=fs.existsSync(gradleFile)?fs.readFileSync(gradleFile,'utf8'):null;
  const nativeCode=gradle?.match(/\bversionCode\s+(\d+)/)?.[1];
  const current=Math.max(Number(app.expo.android.versionCode)||1,Number(nativeCode)||1);
  const versionCode=requestedCode===undefined?current+1:Number(requestedCode);
  if(!Number.isSafeInteger(versionCode)||versionCode<=current||versionCode>2147483647)throw new Error(`versionCode must be an integer greater than ${current}.`);
  if(gradle!==null&&(!/\bversionCode\s+\d+/.test(gradle)||!/\bversionName\s+["'][^"']+["']/.test(gradle)))throw new Error('Could not locate native Android version metadata; no files changed.');
  app.expo.version=versionName;app.expo.android.versionCode=versionCode;
  fs.writeFileSync(appFile,JSON.stringify(app,null,2)+'\n');
  if(gradle!==null)fs.writeFileSync(gradleFile,gradle.replace(/\bversionCode\s+\d+/,`versionCode ${versionCode}`).replace(/\bversionName\s+["'][^"']+["']/,`versionName "${versionName}"`));
  return {versionName,versionCode};
}
module.exports={bumpAndroidRelease};
if(require.main===module){try{console.log(bumpAndroidRelease(path.resolve(__dirname,'..'),process.argv[2],process.argv[3]));}catch(error){console.error(error.message);process.exitCode=1}}
