/* Optional emulator-only native smoke. Requires :app:assembleDebug and a local
   Android SDK. It blocks MainActivity, restores notification preferences, and
   never uses an account token or sends an accept/decline request. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const serial = process.argv[2];
assert.match(serial || '', /^emulator-\d+$/, 'Pass an explicit emulator serial; physical devices are refused');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(os.homedir(), 'AppData/Local/Android/Sdk');
const build = path.join(sdk, 'build-tools/36.0.0'), androidJar = path.join(sdk, 'platforms/android-36/android.jar');
const javaBin = path.join(process.env.JAVA_HOME || 'C:/Program Files/Microsoft/jdk-17.0.20.101-hotspot', 'bin');
const adb = path.join(sdk, 'platform-tools/adb.exe'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'binzo-ring-smoke-'));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, ...options });
  assert.equal(result.status, 0, `${path.basename(command)} failed: ${result.stdout || ''}${result.stderr || ''}`); return result.stdout;
}
const source = `package com.binzolive.ringsmoke;
import android.app.*;import android.content.*;import android.graphics.*;import android.os.*;import android.view.*;import org.json.*;import java.io.*;import java.lang.reflect.*;import java.util.*;
public class Smoke extends Instrumentation {
 static final String OWNER="507f1f77bcf86cd799439011",CALL="507f1f77bcf86cd799439012";
 Context context;Class<?> callsClass,notificationsClass;Object calls,notifications;Activity activity;
 @Override public void onCreate(Bundle arguments){super.onCreate(arguments);start();}
 void check(boolean okay,String message){if(!okay)throw new AssertionError(message);}
 Object call(String name,Object...args)throws Exception {for(Method method:callsClass.getMethods())if(method.getName().equals(name)&&method.getParameterCount()==args.length)return method.invoke(calls,args);throw new NoSuchMethodException(name);}
 Object notifyCall(String name,Object...args)throws Exception {for(Method method:notificationsClass.getMethods())if(method.getName().equals(name)&&method.getParameterCount()==args.length)return method.invoke(notifications,args);throw new NoSuchMethodException(name);}
 Map<?,?> pending()throws Exception{return (Map<?,?>)call("pending",context);}
 String expiry(){return new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",java.util.Locale.US){{setTimeZone(java.util.TimeZone.getTimeZone("UTC"));}}.format(new Date(System.currentTimeMillis()+90_000));}
 Object incoming()throws Exception {
  ClassLoader loader=context.getClassLoader();Class<?> builder=loader.loadClass("com.google.firebase.messaging.RemoteMessage$Builder");Object value=builder.getConstructor(String.class).newInstance("native-smoke");
  Map<String,String> data=new HashMap<>();data.put("protocol","binzo.push.v1");data.put("action","notify");data.put("recipientId",OWNER);data.put("targetType","call");data.put("targetId",CALL);data.put("category","calls");data.put("expiresAt",expiry());data.put("callerName","Native Call Test");data.put("callKind","video");
  for(Map.Entry<String,String> entry:data.entrySet())builder.getMethod("addData",String.class,String.class).invoke(value,entry.getKey(),entry.getValue());Object message=builder.getMethod("build").invoke(value);
  Class<?> triggerClass=loader.loadClass("expo.modules.notifications.notifications.model.triggers.FirebaseNotificationTrigger");Object trigger=triggerClass.getConstructor(loader.loadClass("com.google.firebase.messaging.RemoteMessage")).newInstance(message);
  Class<?> requestClass=loader.loadClass("expo.modules.notifications.notifications.model.NotificationRequest");Object request=requestClass.getConstructors()[0].newInstance("native-smoke",null,trigger);
  Class<?> notification=loader.loadClass("expo.modules.notifications.notifications.model.Notification");return notification.getConstructor(requestClass).newInstance(request);
 }
 View find(View view,String description){if(description.equals(String.valueOf(view.getContentDescription())))return view;if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){View match=find(((ViewGroup)view).getChildAt(i),description);if(match!=null)return match;}return null;}
 void capture()throws Exception {
  final Throwable[] error={null};runOnMainSync(()->{try{View view=activity.getWindow().getDecorView();Bitmap bitmap=Bitmap.createBitmap(view.getWidth(),view.getHeight(),Bitmap.Config.ARGB_8888);view.draw(new Canvas(bitmap));try(FileOutputStream out=new FileOutputStream(new File(context.getCacheDir(),"binzo-native-ring-smoke.png"))){bitmap.compress(Bitmap.CompressFormat.PNG,100,out);}bitmap.recycle();}catch(Throwable value){error[0]=value;}});if(error[0]!=null)throw new RuntimeException(error[0]);
 }
 Activity launch()throws Exception {Intent intent=new Intent().setClassName(context.getPackageName(),context.getPackageName()+".BinzoIncomingCallActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra("binzo.callId",CALL).putExtra("binzo.recipientId",OWNER);Activity result=startActivitySync(intent);waitForIdleSync();return result;}
 void restore(SharedPreferences prefs,Map<String,?> backup){SharedPreferences.Editor edit=prefs.edit().clear();for(Map.Entry<String,?> row:backup.entrySet()){Object v=row.getValue();if(v instanceof String)edit.putString(row.getKey(),(String)v);else if(v instanceof Boolean)edit.putBoolean(row.getKey(),(Boolean)v);else if(v instanceof Long)edit.putLong(row.getKey(),(Long)v);else if(v instanceof Integer)edit.putInt(row.getKey(),(Integer)v);}edit.commit();}
 @Override public void onStart(){Bundle result=new Bundle();int outcome=Activity.RESULT_OK;Map<SharedPreferences,Map<String,?>> backups=new HashMap<>();try{
  context=getTargetContext();ClassLoader loader=context.getClassLoader();callsClass=loader.loadClass(context.getPackageName()+".BinzoIncomingCalls");calls=callsClass.getField("INSTANCE").get(null);notificationsClass=loader.loadClass(context.getPackageName()+".BinzoNotifications");notifications=notificationsClass.getField("INSTANCE").get(null);
  for(String name:new String[]{"binzo-notifications-v1","binzo-incoming-calls-v1","binzo-ended-calls-v1"}){SharedPreferences prefs=context.getSharedPreferences(name,0);backups.put(prefs,new HashMap<>(prefs.getAll()));prefs.edit().clear().commit();}
  context.getSharedPreferences("binzo-notifications-v1",0).edit().putString("owner",OWNER).putBoolean("enabled",true).putBoolean("calls",true).commit();
  addMonitor(context.getPackageName()+".MainActivity",new ActivityResult(Activity.RESULT_CANCELED,null),true);
  Notification notice=(Notification)call("notification",context,incoming());check(notice!=null,"valid incoming call builds");check(notice.category.equals(Notification.CATEGORY_CALL),"call category");check(notice.actions.length==2,"native Answer/Decline actions");check(notice.extras.getString(Notification.EXTRA_TEMPLATE).contains("CallStyle"),"Android31+ CallStyle");
  activity=launch();check(!activity.isFinishing(),"ring appears without MainActivity");capture();Map<?,?> opened=pending();check(opened!=null&&opened.get("action").equals("open"),"open action queued");String old=(String)opened.get("actionId");
  check((Boolean)call("queue",context,CALL,OWNER,"answer"),"answer queued");String next=(String)pending().get("actionId");check(!old.equals(next),"explicit action has new id");call("clear",context,old);check(pending().get("actionId").equals(next),"old ack preserves newer answer");call("clear",context,next);check(pending()==null,"matching ack clears");
  runOnMainSync(()->{View answer=find(activity.getWindow().getDecorView(),"Answer call");check(answer!=null,"answer button visible");answer.performClick();});waitForIdleSync();check(pending().get("action").equals("answer"),"native answer routes explicit choice");
  activity=launch();runOnMainSync(()->find(activity.getWindow().getDecorView(),"Decline call").performClick());waitForIdleSync();check(pending().get("action").equals("decline"),"native decline routes explicit choice");
  notifyCall("dismiss",context,CALL);waitForIdleSync();check(pending()==null,"terminal notification clears queued choice");check(call("notification",context,incoming())==null,"ended tombstone suppresses replay");
  result.putString("stream","PASS native incoming UI: CallStyle actions, immediate private ring screen, caller metadata, exact acknowledgment, Answer/Decline routing with MainActivity blocked, and terminal replay protection.\\n");
 }catch(Throwable failure){StringWriter out=new StringWriter();failure.printStackTrace(new PrintWriter(out));result.putString("stream",out.toString());outcome=Activity.RESULT_CANCELED;}finally{if(activity!=null)runOnMainSync(()->activity.finish());for(Map.Entry<SharedPreferences,Map<String,?>> row:backups.entrySet())restore(row.getKey(),row.getValue());}finish(outcome,result);}
}`;
try {
  const connected = run(adb, ['devices']);assert.ok(connected.includes(serial + '\tdevice'), 'Requested emulator must be connected');
  const manifest = path.join(temp, 'AndroidManifest.xml'), java = path.join(temp, 'Smoke.java'), classes = path.join(temp, 'classes'), dex = path.join(temp, 'dex');fs.mkdirSync(classes);fs.mkdirSync(dex);
  fs.writeFileSync(java, source);
  fs.writeFileSync(manifest, '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.binzolive.ringsmoke"><uses-sdk android:minSdkVersion="31" android:targetSdkVersion="36"/><application android:debuggable="true" android:label="Native ring smoke"/><instrumentation android:name="com.binzolive.ringsmoke.Smoke" android:targetPackage="com.aurora.liveapp"/></manifest>');
  run(path.join(javaBin, 'javac.exe'), ['-source', '8', '-target', '8', '-classpath', androidJar, '-d', classes, java]);
  const jar = path.join(temp, 'classes.jar');run(path.join(javaBin, 'jar.exe'), ['cf', jar, '-C', classes, '.']);
  run(path.join(javaBin, 'java.exe'), ['-cp', path.join(build, 'lib/d8.jar'), 'com.android.tools.r8.D8', '--lib', androidJar, '--min-api', '31', '--output', dex, jar]);
  const unsigned = path.join(temp, 'unsigned.apk'), apk = path.join(temp, 'smoke.apk');
  run(path.join(build, 'aapt.exe'), ['package', '-f', '-M', manifest, '-I', androidJar, '-F', unsigned]);
  run(path.join(build, 'aapt.exe'), ['add', unsigned, 'classes.dex'], { cwd: dex });
  run(path.join(javaBin, 'java.exe'), ['-jar', path.join(build, 'lib/apksigner.jar'), 'sign', '--ks', path.join(root, 'android/app/debug.keystore'), '--ks-key-alias', 'androiddebugkey', '--ks-pass', 'pass:android', '--key-pass', 'pass:android', '--out', apk, unsigned]);
  run(adb, ['-s', serial, 'install', '-r', path.join(root, 'android/app/build/outputs/apk/debug/app-debug.apk')]);
  run(adb, ['-s', serial, 'install', '-r', apk]);
  const output = run(adb, ['-s', serial, 'shell', 'am', 'instrument', '-w', '-r', 'com.binzolive.ringsmoke/com.binzolive.ringsmoke.Smoke']);process.stdout.write(output);
  assert.match(output, /PASS native incoming UI/);assert.match(output, /INSTRUMENTATION_CODE: -1/);
  const screenshot = run(adb, ['-s', serial, 'exec-out', 'run-as', 'com.aurora.liveapp', 'cat', 'cache/binzo-native-ring-smoke.png'], { encoding: null });
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });fs.writeFileSync(path.join(root, 'artifacts/native-incoming-call.png'), screenshot);
} finally {
  spawnSync(adb, ['-s', serial, 'uninstall', 'com.binzolive.ringsmoke'], { encoding: 'utf8', windowsHide: true });
  assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep));fs.rmSync(temp, { recursive: true, force: true });
}
