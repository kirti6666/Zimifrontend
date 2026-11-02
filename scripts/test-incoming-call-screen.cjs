const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {test}=require('node:test');
const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/incoming-call-screen.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}};
const callId='507f1f77bcf86cd799439011',recipientId='507f1f77bcf86cd799439012';
const hint=(action='open')=>({actionId:'native-action-1',action,callId,recipientId,expiresAt:new Date(Date.now()+60000).toISOString(),callerName:'Caller',callKind:'video'});
const incoming=()=>({callId,recipientId,expiresAt:new Date(Date.now()+60000).toISOString(),from:{id:'507f1f77bcf86cd799439013',name:'Verified caller'},voice:false,fromHost:false,rate:0,entryFee:0,feeHoldSeconds:0});
function harness(initial=hint(),status='checking'){
  const values=[],effects=[],timers=new Map(),reads=[],declines=[],dismissed=[];
  let cursor=0,dirty=false,latest=initial,listener,cache,version=1,busy=0,output,sequence=0;
  const update={status,installed:{versionCode:15},checking:status==='checking'};
  const react={useState(initial){const i=cursor++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return[values[i],next=>{const value=typeof next==='function'?next(values[i]):next;if(value!==values[i]){values[i]=value;dirty=true}}]},useRef(initial){const i=cursor++;return values[i]??(values[i]={current:initial})},useCallback(fn){cursor++;return fn},useEffect(fn,deps){const i=cursor++,old=values[i];if(!old||deps.some((value,index)=>value!==old.deps[index])){values[i]={deps,cleanup:old?.cleanup};effects.push(()=>{old?.cleanup?.();values[i].cleanup=fn()})}}};
  class ApiError extends Error{constructor(message,status){super(message);this.status=status}}
  const actions={getIncomingCallAction:()=>latest,startIncomingCallActions:()=>()=>{},onIncomingCallAction:fn=>{listener=fn;fn(latest);return()=>{listener=null}},clearIncomingCallAction:id=>{if(latest?.actionId===id){latest=null;cache=null;listener?.(null)}},requestIncomingCallAction:(id,action)=>{if(latest?.actionId===id){latest={...latest,action};listener?.(latest)}},retryIncomingCallAction:id=>{if(latest?.actionId===id)listener?.({...latest})},getVerifiedIncomingCall:(id,session)=>cache?.id===id&&cache.session===session?cache.value:null,setVerifiedIncomingCall:(id,value,session)=>{cache={id,value,session}}};
  const module={exports:{}};
  const mocks={'react':react,'react-native':{StyleSheet:{create:x=>x},BackHandler:{addEventListener:()=>({remove(){}})}},'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},'react-native-safe-area-context':{},'expo-status-bar':{},'expo-splash-screen':{hideAsync:async()=>{}},'./api/endpoints':{api:{notificationCall:id=>{const pending={id,...deferred()};reads.push(pending);return pending.promise},declineCall:async id=>{declines.push(id)}}},'./api/client':{ApiError},'./session':{getSessionVersion:()=>version,getToken:async()=> 'account-token'},'./app-update-activity':{beginUpdateActivity:()=>{busy++;let ended=false;return()=>{if(!ended){ended=true;busy--}}}},'./native-push-notifications':{dismissIncomingCallNotification:async id=>dismissed.push(id)},'./incoming-call-actions':actions};
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{setTimeout:(fn,delay)=>{timers.set(++sequence,{fn,delay});return sequence},clearTimeout:id=>timers.delete(id),Date,console})(id=>{if(!(id in mocks))throw new Error(id);return mocks[id]},module,module.exports);
  function render(){cursor=0;dirty=false;output=module.exports.useIncomingCall(update);while(effects.length)effects.shift()();return output}
  async function flush(){for(let i=0;i<8;i++){await new Promise(resolve=>setImmediate(resolve));if(dirty)render()}return output}
  render();
  return{reads,declines,dismissed,timers,ApiError,actions,flush,get output(){return output},get latest(){return latest},get busy(){return busy},setVersion:next=>{version=next},close(){for(const value of values)value?.cleanup?.();timers.clear()}};
}

test('incoming surface exists during update check and verification never accepts or captures',async()=>{
  const h=harness();assert.equal(h.output.action.callId,callId);assert.equal(h.output.verified,null);await h.flush();assert.equal(h.reads.length,1);
  h.reads[0].resolve(incoming());await h.flush();assert.equal(h.output.verified.from.name,'Verified caller');assert.equal(h.busy,1);assert.deepEqual(h.declines,[]);
  h.output.choose('answer');await h.flush();assert.equal(h.output.action.action,'answer');assert.equal(h.reads.length,1,'Verified server snapshot is reused while startup continues');h.close();assert.equal(h.busy,0);
});

test('decline is terminal cleanup even while a mandatory update blocks the app',async()=>{
  const h=harness(hint('decline'),'required');await h.flush();assert.deepEqual(h.declines,[callId]);assert.equal(h.reads.length,0);assert.equal(h.output.action,null);assert.equal(h.busy,0);h.close();
});

test('stale handoff replies cannot consume a newer explicit answer and terminal events release ring lease',async()=>{
  const h=harness();await h.flush();h.reads[0].resolve(incoming());await h.flush();h.output.choose('answer');await h.flush();
  h.output.onResult({callId,actionId:'native-action-1',action:'open',outcome:'handedOff'});await h.flush();assert.equal(h.latest.action,'answer');
  h.output.onEvent({type:'call.ended',data:{callId:'507f1f77bcf86cd799439099'}});await h.flush();assert.equal(h.busy,1);
  h.output.onEvent({type:'call.ended',data:{callId}});await h.flush();assert.equal(h.output.action,null);assert.equal(h.busy,0);h.close();
});

test('wrong account, completed and late-session verification cannot authorize an incoming call',async()=>{
  for(const result of [null,{...incoming(),recipientId:'507f1f77bcf86cd799439099'}]){
    const h=harness();await h.flush();h.reads[0].resolve(result);await h.flush();assert.equal(h.output.action,null);assert.equal(h.busy,0);h.close();
  }
  const h=harness();await h.flush();h.setVersion(2);h.reads[0].resolve(incoming());await h.flush();assert.equal(h.output.verified,null);assert.equal(h.busy,0);h.close();
});

test('network retry preserves Open intent and never turns a navigation tap into acceptance',async()=>{
  const h=harness();await h.flush();h.reads[0].reject(new h.ApiError('Offline',0));await h.flush();assert.match(h.output.error,/Couldn't connect/);assert.equal(h.latest.action,'open');
  h.output.retry();await h.flush();assert.equal(h.latest.action,'open');assert.equal(h.reads.length,2);h.reads[1].resolve(incoming());await h.flush();assert.equal(h.output.error,'');assert.equal(h.output.verified.callId,callId);h.close();
});
test('another connected call removes the incoming overlay and its temporary update lease',async()=>{
  const h=harness();await h.flush();h.reads[0].resolve(incoming());await h.flush();assert.equal(h.busy,1);
  h.output.onEvent({type:'call.connected',data:{callId:'507f1f77bcf86cd799439099'}});await h.flush();assert.equal(h.output.action,null);assert.equal(h.busy,0);h.close();
});
