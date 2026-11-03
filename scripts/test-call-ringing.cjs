const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const owner = '507f1f77bcf86cd799439011', callId = '507f1f77bcf86cd799439012';
const flush = async () => { for (let index=0;index<8;index++) await Promise.resolve(); };
const snapshot = (changes={}) => ({callId,recipientId:owner,expiresAt:new Date(Date.now()+60000).toISOString(),...changes});
function fixture(nativeAvailable=false) {
  const requests=[],played=[],stopped=[],nativeCalls=[],timers=new Map();let key='session1/document1',account=owner;
  const module={exports:{}},filename=path.join(__dirname,'../src/call-ringing.ts');
  const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const native={startIncomingRinging:(...args)=>nativeCalls.push(['start',...args]),stopIncomingRinging:id=>nativeCalls.push(['stop',id])};
  vm.runInNewContext(source,{module,exports:module.exports,Date,console,setTimeout:(fn,delay)=>{const id=Symbol();timers.set(id,{fn,delay});return id},clearTimeout:id=>timers.delete(id),require:name=>{assert.equal(name,'react-native');return{Platform:{OS:'android'},NativeModules:nativeAvailable?{BinzoNotifications:native}:{}}}},{filename});
  const options={owner:()=>account,key:()=>key,verify:id=>new Promise((resolve,reject)=>requests.push({id,resolve,reject})),...(nativeAvailable?{}:{available:true,play:value=>played.push(value),stop:id=>stopped.push(id)})};
  const controller=module.exports.createCallRinging(options);
  return {api:module.exports,controller,options,requests,played,stopped,nativeCalls,timers,setKey:value=>key=value,setOwner:value=>account=value};
}
test('both host and member incoming calls ring only after current recipient verification',async()=>{
  for(const fromHost of [false,true]){
    const h=fixture();h.controller.observe({type:'call.incoming',data:{callId,fromHost}});assert.equal(h.played.length,0);
    h.requests[0].resolve(snapshot());await flush();assert.equal(h.played.length,1);
    h.controller.observe({type:'call.incoming',data:{callId,fromHost}});assert.equal(h.requests.length,1,'Socket replays do not restart or extend ringing');
    h.controller.observe({type:'call.ended',data:{callId}});assert.equal(h.stopped.at(-1),callId);h.controller.reset();
  }
});
test('wrong recipient, malformed expiry, terminal events and retired documents cannot authorize sound',async()=>{
  for(const value of [null,snapshot({recipientId:'507f1f77bcf86cd799439099'}),snapshot({expiresAt:'invalid'}),snapshot({expiresAt:new Date(Date.now()-1).toISOString()})]){
    const h=fixture();h.controller.observe({type:'call.incoming',data:{callId}});h.requests[0].resolve(value);await flush();assert.equal(h.played.length,0);h.controller.reset();
  }
  for(const retire of [h=>h.controller.reset(),h=>h.controller.observe({type:'call.ended',data:{callId}}),h=>h.setKey('session2/document2'),h=>h.setOwner('507f1f77bcf86cd799439099')]){
    const h=fixture();h.controller.observe({type:'call.incoming',data:{callId}});retire(h);h.requests[0].resolve(snapshot());await flush();assert.equal(h.played.length,0);h.controller.reset();
  }
});
test('answer silences immediately and resumes only after a failed answer is reverified as still ringing',async()=>{
  const h=fixture();h.controller.observe({type:'call.incoming',data:{callId}});h.requests[0].resolve(snapshot());await flush();
  h.controller.handle({type:'call.accept',data:{callId}});assert.equal(h.stopped.at(-1),callId);
  h.controller.observe({type:'call.incoming',data:{callId}});assert.equal(h.requests.length,1);
  h.controller.observe({type:'call.failed',data:{callId}});assert.equal(h.requests.length,2);assert.equal(h.played.length,1);
  h.requests[1].resolve(snapshot());await flush();assert.equal(h.played.length,2);
  h.controller.handle({type:'call.accept',data:{callId}});h.controller.observe({type:'call.failed',data:{callId}});h.requests[2].resolve(null);await flush();assert.equal(h.played.length,2);h.controller.reset();
});
test('answer invalidates pending Open verification and foreground resume requires a fresh response',async()=>{
  const h=fixture();h.controller.observe({type:'call.incoming',data:{callId}});h.controller.handle({type:'call.accept',data:{callId}});h.requests[0].resolve(snapshot());await flush();assert.equal(h.played.length,0);
  h.controller.reset();h.controller.observe({type:'call.incoming',data:{callId}});h.requests[1].resolve(snapshot());await flush();assert.equal(h.played.length,1);
  h.controller.foreground(false);h.controller.foreground(true);assert.equal(h.requests.length,3);assert.equal(h.played.length,1);
  h.requests[2].reject(new Error('offline'));await flush();assert.equal(h.played.length,1);h.controller.reset();
});
test('overlay to bridge handoff preserves one native owner and terminal events silence all owners',async()=>{
  const h=fixture(true),verified=snapshot();h.api.startVerifiedIncomingRinging(verified);
  h.controller.observe({type:'call.incoming',data:{callId}});h.requests[0].resolve(verified);await flush();
  h.api.releaseVerifiedIncomingRinging();assert.equal(h.nativeCalls.filter(row=>row[0]==='stop').length,0,'Overlay dismissal leaves the verified bridge owner ringing');
  h.api.startVerifiedIncomingRinging(verified);const before=h.nativeCalls.length;
  h.controller.observe({type:'call.connected',data:{callId}});
  assert.deepEqual(h.nativeCalls.slice(before),[['stop',callId]],'Connected cannot briefly restart another lease for the same call');
  h.api.releaseVerifiedIncomingRinging();assert.equal(h.nativeCalls.at(-1)[0],'stop');h.controller.reset();
});
test('expiry stops the current ring and logout invalidates pending verification',async()=>{
  const h=fixture();h.controller.observe({type:'call.incoming',data:{callId}});h.requests[0].resolve(snapshot());await flush();
  [...h.timers.values()][0].fn();assert.equal(h.stopped.at(-1),callId);
  h.controller.observe({type:'call.incoming',data:{callId}});h.controller.handle({type:'auth.logout',data:{}});h.requests[1].resolve(snapshot());await flush();assert.equal(h.played.length,1);h.controller.reset();
});
