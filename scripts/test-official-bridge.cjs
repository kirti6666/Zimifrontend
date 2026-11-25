/* Read-only Binzo Team Chat boundary/lifecycle checks. No network or live messages. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {test}=require('node:test');
const root=path.resolve(__dirname,'..'),id='507f1f77bcf86cd799439041',at='2026-11-02T10:00:00.000Z';
const plain=value=>JSON.parse(JSON.stringify(value));
const settle=async()=>{for(let i=0;i<7;i++)await new Promise(resolve=>setImmediate(resolve));};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
class ApiError extends Error{constructor(message,status,code){super(message);Object.assign(this,{status,code});}}
const identity={id:'bingo-live-official',name:'BinzoLive',official:true,verified:true,canSend:false};
const note={id:'announcement:'+id,kind:'announcement',senderType:'official',body:'An official rule update',title:'Binzo Team update',createdAt:at,read:false};
const summary={...identity,unread:1,lastMessage:note};
const data={...identity,messages:[note],total:1,unreadCount:1,hasMore:false,before:null};
const wireData={...data,canSend:true,readOnly:true};
function fixture(){
 const events=[],calls=[],overrides={},timers=new Map(),modules=new Map(),state={key:'owner:session1:document1',available:true,foreground:true};let timerId=0,changes=0;
 const defaults={officialChat:()=>data,readOfficialChat:()=>({official:{...summary,unread:0},read:true})};
 const api=new Proxy({},{get:(_,name)=>(...args)=>{calls.push({name,args});return Promise.resolve().then(()=>(overrides[name]||defaults[name])(...args));}});
 function load(relative){const file=path.resolve(root,relative);if(modules.has(file))return modules.get(file).exports;const module={exports:{}};modules.set(file,module);const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const requireMock=name=>name==='./api/client'||name==='./client'?{ApiError,errorMessage:error=>error.message||'Please try again.'}:load(path.relative(root,path.resolve(path.dirname(file),name+'.ts')));vm.runInNewContext(source,{module,exports:module.exports,require:requireMock,console,URL,Date,setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id)});return module.exports;}
 const bridge=load('src/official-bridge.ts').createOfficialBridge({api,emit:event=>events.push(plain(event)),snapshot:()=>({...state}),changed:()=>changes++});
 return{bridge,state,events,calls,overrides,timers,load,count:name=>calls.filter(call=>call.name===name).length,find:type=>events.filter(event=>event.type===type),changes:()=>changes};
}
async function activate(h){await h.bridge.handle({type:'official.activity',data:{active:true}});await settle();h.events.length=0;h.calls.length=0;}

test('official messages are read-only and reject support writes or non-announcement IDs',()=>{
 const h=fixture(),parse=h.load('src/web-message.ts').parseWebMessage;
 assert.equal(parse(JSON.stringify({type:'official.send',data:{body:'Please help',clientMessageId:'official-fixture-01',requestId:1}})),null);
 for(const bad of [{ids:[id]},{ids:['support:'+id]},{ids:[note.id,note.id]},{ids:[note.id],all:true},{all:false},{ids:[]}])assert.equal(parse(JSON.stringify({type:'official.read',data:{...bad,requestId:1}})),null);
 assert.ok(parse(JSON.stringify({type:'official.read',data:{ids:[note.id],requestId:1}})));
 assert.ok(parse(JSON.stringify({type:'official.read',data:{all:true,requestId:1}})));
 assert.equal(parse(JSON.stringify({type:'official.load',data:{before:'support:'+id,requestId:1}})),null);
 for(const type of ['chat.open','call.start'])assert.equal(parse(JSON.stringify({type,data:{[type==='chat.open'?'with':'to']:'bingo-live-official'}})),null);
});

test('verified legacy identities normalize to read-only while messages stay announcement-only',()=>{
 const h=fixture(),a=h.load('src/api/official.ts');
 assert.deepEqual(plain(a.officialChatFrom(wireData)),data);
 assert.deepEqual(plain(a.officialChatFrom({...data,canSend:true})),data,'a deployed sendable identity is consumed as read-only');
 assert.deepEqual(plain(a.officialChatSummaryFrom({...summary,canSend:false,supportEnabled:true})),{...summary,lastMessage:{id:note.id,kind:note.kind,senderType:note.senderType,body:note.body,createdAt:note.createdAt,title:note.title}},'legacy chat-list identity remains compatible');
 assert.throws(()=>a.officialChatFrom(data),/could not be verified/,'unmarked canSend:false identities remain invalid');
 for(const change of [{name:'Bingo Live Official'},{id},{verified:false},{official:false},{canSend:false,supportEnabled:false,readOnly:undefined},{unreadCount:-1},{before:id},{messages:[note,note]},{messages:[{...note,senderType:'user'}]},{messages:[{...note,kind:'support',id:'support:'+id}]},{messages:[{...note,senderType:'official',kind:'support',id:'support:'+id}]}])assert.throws(()=>a.officialChatFrom({...wireData,...change}),/could not be verified/);
 assert.throws(()=>a.officialChatSummaryFrom({...summary,lastMessage:{...note,kind:'support',id:'support:'+id}}),/could not be verified/);
 assert.throws(()=>a.officialReadFrom({official:summary}),/could not be verified/);
});

test('cursor history and visible read acknowledgments retain exact request correlation',async()=>{
 const h=fixture();await activate(h);
 await h.bridge.handle({type:'official.load',data:{before:note.id,requestId:1}});
 assert.deepEqual(h.calls.find(call=>call.name==='officialChat').args,[note.id]);assert.equal(h.find('data.official')[0].data.append,true);assert.equal(h.find('data.official')[0].data.requestId,1);
 await h.bridge.handle({type:'official.read',data:{ids:[note.id],requestId:2}});await settle();
 assert.deepEqual(plain(h.calls.find(call=>call.name==='readOfficialChat').args),[{ids:[note.id]}]);assert.equal(h.find('official.saved')[0].data.requestId,2);assert.equal(h.find('official.saved')[0].data.official.unread,0);h.bridge.reset();
});

test('late history cannot cross account, session or document retirement',async()=>{
 const h=fixture(),pending=deferred();h.overrides.officialChat=()=>pending.promise;const work=h.bridge.handle({type:'official.load',data:{requestId:1}});await settle();h.state.key='other-owner:session2:document2';h.bridge.reset();pending.resolve(data);await work;assert.equal(h.events.length,0);assert.equal(h.changes(),0);h.bridge.reset();
});

test('latest history wins and closing the official view retires pending reads',async()=>{
 const h=fixture(),pending=deferred();await activate(h);h.overrides.officialChat=before=>before?pending.promise:data;
 const first=h.bridge.handle({type:'official.load',data:{before:note.id,requestId:1}});await settle();await h.bridge.handle({type:'official.load',data:{requestId:2}});pending.resolve(data);await first;assert.deepEqual(h.find('data.official').map(event=>event.data.requestId),[2]);
 const other=deferred();h.overrides.officialChat=()=>other.promise;const loading=h.bridge.handle({type:'official.load',data:{requestId:3}});await settle();await h.bridge.handle({type:'official.activity',data:{active:false}});other.resolve(data);await loading;assert.equal(h.find('data.official').length,1);h.bridge.reset();
});

test('live updates coalesce, reconnect refreshes, and fallback polling stops in background',async()=>{
 const h=fixture();await activate(h);assert.equal(h.timers.size,1);assert.equal([...h.timers.values()][0].ms,5000);
 const pending=deferred();h.overrides.officialChat=()=>pending.promise;h.bridge.changed();h.bridge.changed();await settle();assert.equal(h.count('officialChat'),1);h.overrides.officialChat=()=>data;pending.resolve(data);await settle();assert.equal(h.count('officialChat'),2);assert.equal(h.find('data.official').length,1);assert.equal(h.timers.size,1);
 h.state.foreground=false;h.bridge.foreground();h.bridge.changed();await settle();const count=h.count('officialChat');assert.equal(h.timers.size,0);h.state.foreground=true;h.bridge.foreground();await settle();assert.equal(h.count('officialChat'),count+1);assert.equal(h.timers.size,1);const timer=[...h.timers.values()][0];h.timers.clear();timer.fn();await settle();assert.equal(h.count('officialChat'),count+2);h.bridge.reset();assert.equal(h.timers.size,0);
});

test('visible-ID reads require the foreground Team Chat; explicit mark-all stays account scoped',async()=>{
 const h=fixture();await h.bridge.handle({type:'official.read',data:{ids:[note.id],requestId:1}});assert.equal(h.count('readOfficialChat'),0);await h.bridge.handle({type:'official.read',data:{all:true,requestId:2}});assert.equal(h.count('readOfficialChat'),1);h.state.foreground=false;await h.bridge.handle({type:'official.read',data:{all:true,requestId:3}});assert.equal(h.count('readOfficialChat'),1);h.bridge.reset();
});

test('background failures preserve content and polling without any write surface',async()=>{
 const h=fixture();h.overrides.officialChat=()=>{throw new ApiError('Offline, please retry',503);};await h.bridge.handle({type:'official.activity',data:{active:true}});await settle();assert.equal(h.find('official.error')[0].data.background,true);assert.equal(h.find('data.official').length,0);assert.equal(h.timers.size,1);assert.equal(h.count('sendOfficialMessage'),0);h.bridge.reset();
});

test('an unavailable native session returns a correlated read error without HTTP',async()=>{
 const h=fixture();h.state.available=false;await h.bridge.handle({type:'official.read',data:{all:true,requestId:103}});assert.equal(h.count('readOfficialChat'),0);assert.deepEqual(h.find('official.error')[0].data,{action:'read',requestId:103,message:'Sign in to open Binzo Team Chat.'});h.bridge.reset();
});
