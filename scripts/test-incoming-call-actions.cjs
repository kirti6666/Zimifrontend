const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');
const ts=require('typescript');
const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/incoming-call-actions.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const plain=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve}};
const settle=async()=>{for(let i=0;i<4;i++)await new Promise(done=>setImmediate(done))};
const now=Date.parse('2026-11-02T10:00:00Z');
const hint=(extra={})=>({actionId:'native-action-one',action:'open',recipientId:'507f1f77bcf86cd799439001',callId:'507f1f77bcf86cd799439002',expiresAt:new Date(now+60000).toISOString(),callerName:'Asha',callKind:'video',...extra});
const response=(extra={},action='DEFAULT',identifier='expo-one')=>({actionIdentifier:action,notification:{request:{identifier,content:{title:'Incoming video call',data:{category:'calls',targetType:'call',targetId:hint().callId,recipientId:hint().recipientId,expiresAt:hint().expiresAt,...extra}}}}});
function harness(options={}){
  const timers=new Map(),acks=[],nativeListeners=[],expoListeners=[];let clock=now,timer=0,nativeQueries=0,expoQueries=0,removedNative=0,removedExpo=0;
  const pending=options.pending??Promise.resolve(null),last=options.last??Promise.resolve(null);
  const native={protocol:'binzo.push.v1',initialCallAction:options.initial,getPendingCallAction:()=>{nativeQueries++;return pending},clearPendingCallAction:async id=>acks.push(id),addListener(){},removeListeners(){}};
  const emitter=class{constructor(module){assert.equal(module,native)}addListener(name,listener){assert.equal(name,'BinzoIncomingCallAction');nativeListeners.push(listener);return {remove(){removedNative++}}}};
  const notifications={DEFAULT_ACTION_IDENTIFIER:'DEFAULT',getLastNotificationResponseAsync:()=>{expoQueries++;return last},addNotificationResponseReceivedListener:listener=>{expoListeners.push(listener);return {remove(){removedExpo++}}}};
  const exports={};
  const modules={'react-native':{Platform:{OS:options.platform??'android'},NativeModules:options.legacy?{BinzoNotifications:{protocol:'binzo.push.v1'}}:{BinzoNotifications:native},NativeEventEmitter:emitter},'expo-notifications':notifications};
  vm.runInNewContext(source,{exports,require:id=>modules[id],URL,Date:class extends Date{static now(){return clock}},setTimeout:(work,delay)=>{timers.set(++timer,{work,delay});return timer},clearTimeout:id=>timers.delete(id)});
  return {api:exports,acks,timers,native:row=>nativeListeners.forEach(listener=>listener(row)),expo:row=>expoListeners.forEach(listener=>listener(row)),tick:ms=>{clock+=ms;for(const [id,item]of [...timers])if(item.delay<=ms){timers.delete(id);item.work()}},counts:()=>({nativeQueries,expoQueries,nativeListeners:nativeListeners.length,expoListeners:expoListeners.length,removedNative,removedExpo})};
}

test('incoming native constant is available synchronously and observers receive safe copies',()=>{
  const h=harness({initial:hint({callerName:' Asha\n'+ 'x'.repeat(100),callerAvatarUrl:'https://cdn.example.test/avatar.jpg',appKey:'discarded'})});
  const first=h.api.getIncomingCallAction();assert.equal(first.actionId,'native-action-one');assert.equal(first.callerName.length,80);assert.ok(!first.callerName.includes('\n'));assert.equal(first.appKey,undefined);
  first.action='answer';assert.equal(h.api.getIncomingCallAction().action,'open','Reading a hint cannot mutate it or answer a call');
  const received=[];const off=h.api.onIncomingCallAction(value=>received.push(plain(value)));assert.equal(received.length,1);assert.equal(received[0].action,'open');off();
});

test('incoming capture shares native/Expo listeners and deduplicates query/event delivery',async()=>{
  const pending=deferred(),h=harness({pending:pending.promise}),received=[];h.api.onIncomingCallAction(value=>received.push(value));
  const stopOne=h.api.startIncomingCallActions(),stopTwo=h.api.startIncomingCallActions();
  assert.deepEqual(h.counts(),{nativeQueries:1,expoQueries:1,nativeListeners:1,expoListeners:1,removedNative:0,removedExpo:0});
  h.native(hint());pending.resolve(hint());await settle();assert.equal(received.length,2,'Only one notification follows the initial empty snapshot');
  h.native(hint());assert.equal(received.length,2);stopOne();assert.equal(h.counts().removedNative,0);stopTwo();stopTwo();assert.equal(h.counts().removedNative,1);assert.equal(h.counts().removedExpo,1);assert.equal(h.timers.size,0);
});

test('explicit answer/decline stays current when a late incidental open arrives',async()=>{
  const pending=deferred(),h=harness({initial:hint(),pending:pending.promise}),received=[];h.api.onIncomingCallAction(value=>received.push(value));const stop=h.api.startIncomingCallActions();
  h.api.requestIncomingCallAction('wrong-id','answer');assert.equal(h.api.getIncomingCallAction().action,'open');
  h.api.requestIncomingCallAction('native-action-one','answer');h.native(hint());pending.resolve(hint());await settle();assert.equal(h.api.getIncomingCallAction().action,'answer');
  h.expo(response());assert.equal(h.api.getIncomingCallAction().action,'answer','Legacy launch responses cannot replace the same call’s explicit native answer');
  h.api.requestIncomingCallAction('native-action-one','decline');assert.equal(h.api.getIncomingCallAction().action,'decline');h.native(hint());assert.equal(h.api.getIncomingCallAction().action,'decline');
  h.api.requestIncomingCallAction('native-action-one','automatic');assert.equal(h.api.getIncomingCallAction().action,'decline');assert.equal(h.acks.length,0,'Changing the requested action neither consumes it nor calls a server');stop();
});

test('incoming validation rejects malformed, expired and excessive expiry hints',()=>{
  for(const patch of [{actionId:'unsafe id'},{action:'autoanswer'},{action:['answer']},{recipientId:'other'},{callId:'bad'},{expiresAt:new Date(now).toISOString()},{expiresAt:new Date(now+180001).toISOString()},{expiresAt:'tomorrow'},{callKind:'screen'}])assert.equal(harness({initial:hint(patch)}).api.getIncomingCallAction(),null,JSON.stringify(patch));
  const h=harness({initial:hint({callerName:42,callerAvatarUrl:'javascript:alert(1)'})});assert.equal(h.api.getIncomingCallAction().callerName,'Incoming caller');assert.equal(h.api.getIncomingCallAction().callerAvatarUrl,undefined);
});

test('Expo fallback consumes only default incoming call taps and never infers answer from metadata',async()=>{
  const h=harness({legacy:true}),stop=h.api.startIncomingCallActions();await settle();
  for(const row of [response({},'ANSWER'),response({category:'messages'}),response({targetType:'thread'}),response({recipientId:'bad'}),response({expiresAt:new Date(now-1).toISOString()}),response({action:'call-ended'})])h.expo(row);
  assert.equal(h.api.getIncomingCallAction(),null);
  h.expo(response({callerName:'Mira',callKind:'audio',action:'answer'}));const accepted=h.api.getIncomingCallAction();assert.equal(accepted.action,'open');assert.equal(accepted.callKind,'audio');assert.equal(accepted.callerName,'Mira');assert.ok(accepted.actionId.startsWith('expo:'));
  h.expo(response({callerName:'Mira',callKind:'audio'}));assert.equal(h.api.getIncomingCallAction().actionId,accepted.actionId);stop();
});

test('exact acknowledgments retain newer actions and reject replayed or late query items',async()=>{
  const pending=deferred(),last=deferred(),h=harness({initial:hint(),pending:pending.promise,last:last.promise}),stop=h.api.startIncomingCallActions();
  const newer=hint({actionId:'native-newer',callId:'507f1f77bcf86cd799439003'});h.native(newer);
  h.api.clearIncomingCallAction('native-action-one');assert.equal(h.api.getIncomingCallAction().actionId,'native-newer');assert.deepEqual(h.acks,['native-action-one']);
  pending.resolve(hint());last.resolve(response());await settle();assert.equal(h.api.getIncomingCallAction().actionId,'native-newer');
  h.api.clearIncomingCallAction('native-newer');assert.equal(h.api.getIncomingCallAction(),null);h.native(newer);assert.equal(h.api.getIncomingCallAction(),null,'Acknowledged actions cannot be replayed');stop();
});

test('expiry and shutdown release listeners/timers without delivering stale pending results',async()=>{
  const h=harness({initial:hint()}),events=[];h.api.onIncomingCallAction(value=>events.push(value));const stop=h.api.startIncomingCallActions();h.tick(60000);assert.equal(h.api.getIncomingCallAction(),null);assert.equal(events.length,2);assert.equal(events[1],null);assert.deepEqual(h.acks,['native-action-one']);stop();
  const pending=deferred(),last=deferred(),retired=harness({pending:pending.promise,last:last.promise}),off=retired.api.startIncomingCallActions();off();pending.resolve(hint());last.resolve(response());await settle();assert.equal(retired.api.getIncomingCallAction(),null);assert.equal(retired.timers.size,0);
});

const incoming=(extra={})=>({callId:hint().callId,recipientId:hint().recipientId,expiresAt:hint().expiresAt,from:{id:'507f1f77bcf86cd799439004',name:'Verified Asha',avatarUrl:'',city:'Pune'},voice:false,fromHost:false,rate:35,entryFee:5,feeHoldSeconds:30,...extra});
test('verified incoming cache binds action, recipient, call and session while surviving an explicit action change',()=>{
  const h=harness({initial:hint()}),value=incoming();h.api.setVerifiedIncomingCall('native-action-one',value,7);value.from.name='Mutated outside';
  assert.equal(h.api.getVerifiedIncomingCall('native-action-one',7).from.name,'Verified Asha');
  assert.equal(h.api.getVerifiedIncomingCall('native-action-one',8),null);assert.equal(h.api.getVerifiedIncomingCall('different',7),null);
  h.api.requestIncomingCallAction('native-action-one','answer');assert.equal(h.api.getVerifiedIncomingCall('native-action-one',7).callId,hint().callId);
  const copy=h.api.getVerifiedIncomingCall('native-action-one',7);copy.from.name='Mutated read';assert.equal(h.api.getVerifiedIncomingCall('native-action-one',7).from.name,'Verified Asha');
  h.api.clearIncomingCallAction('some-old-action');assert.ok(h.api.getVerifiedIncomingCall('native-action-one',7),'Acknowledging an older item preserves the current verified lookup');
  h.api.clearIncomingCallAction('native-action-one');assert.equal(h.api.getVerifiedIncomingCall('native-action-one',7),null);
});

test('verified cache rejects mismatched and stale snapshots and expires after ten seconds or its server deadline',()=>{
  for(const patch of [{callId:'507f1f77bcf86cd799439005'},{recipientId:'507f1f77bcf86cd799439006'},{expiresAt:new Date(now).toISOString()},{expiresAt:new Date(now+180001).toISOString()},{expiresAt:'tomorrow'}]){
    const h=harness({initial:hint()});h.api.setVerifiedIncomingCall('native-action-one',incoming(patch),7);assert.equal(h.api.getVerifiedIncomingCall('native-action-one',7),null);
  }
  const h=harness({initial:hint()});h.api.setVerifiedIncomingCall('native-action-one',incoming(),7);h.tick(9999);assert.ok(h.api.getVerifiedIncomingCall('native-action-one',7));h.tick(1);assert.equal(h.api.getVerifiedIncomingCall('native-action-one',7),null);
  h.api.setVerifiedIncomingCall('native-action-one',incoming({expiresAt:new Date(now+11000).toISOString()}),7);assert.ok(h.api.getVerifiedIncomingCall('native-action-one',7));h.tick(1000);assert.equal(h.api.getVerifiedIncomingCall('native-action-one',7),null);
});

test('replacement incoming actions and native expiry discard previously verified snapshots',async()=>{
  const h=harness({initial:hint()}),stop=h.api.startIncomingCallActions();await settle();h.api.setVerifiedIncomingCall('native-action-one',incoming(),7);
  const newer=hint({actionId:'new-action',callId:'507f1f77bcf86cd799439003'});h.native(newer);assert.equal(h.api.getVerifiedIncomingCall('native-action-one',7),null);assert.equal(h.api.getVerifiedIncomingCall('new-action',7),null);
  h.api.setVerifiedIncomingCall('new-action',incoming({callId:newer.callId}),7);assert.ok(h.api.getVerifiedIncomingCall('new-action',7));h.tick(60000);assert.equal(h.api.getVerifiedIncomingCall('new-action',7),null);stop();
});

test('native terminal hints clear only the matching current call and recipient',async()=>{
  const pending=deferred(),h=harness({initial:hint(),pending:pending.promise}),events=[];h.api.onIncomingCallAction(value=>events.push(value));const stop=h.api.startIncomingCallActions();
  h.api.setVerifiedIncomingCall('native-action-one',incoming(),7);
  for(const terminal of [{action:'ended',callId:hint().callId,recipientId:'507f1f77bcf86cd799439099'},{action:'ended',callId:'507f1f77bcf86cd799439099',recipientId:hint().recipientId},{action:'ended',callId:hint().callId}])h.native(terminal);
  assert.equal(h.api.getIncomingCallAction().actionId,'native-action-one');assert.ok(h.api.getVerifiedIncomingCall('native-action-one',7));assert.equal(h.acks.length,0);
  h.native({action:'ended',callId:hint().callId,recipientId:hint().recipientId});assert.equal(h.api.getIncomingCallAction(),null);assert.equal(h.api.getVerifiedIncomingCall('native-action-one',7),null);assert.equal(events.at(-1),null);assert.deepEqual(h.acks,['native-action-one']);assert.equal(h.timers.size,0);
  pending.resolve(hint());await settle();assert.equal(h.api.getIncomingCallAction(),null,'A pending query cannot replay the terminal call');
  const next=hint({actionId:'next-call',callId:'507f1f77bcf86cd799439003'});h.native(next);h.native({action:'ended',callId:hint().callId,recipientId:hint().recipientId});assert.equal(h.api.getIncomingCallAction().actionId,'next-call','An older call’s terminal push does not clear the next ring');stop();
});
