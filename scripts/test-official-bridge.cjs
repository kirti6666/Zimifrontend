/* Private official-thread boundary/lifecycle checks. No network or live messages. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {test}=require('node:test');
const root=path.resolve(__dirname,'..'),id='507f1f77bcf86cd799439041',ticketId='507f1f77bcf86cd799439042',at='2026-11-02T10:00:00.000Z';
const plain=value=>JSON.parse(JSON.stringify(value));
const settle=async()=>{for(let i=0;i<7;i++)await new Promise(resolve=>setImmediate(resolve));};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
class ApiError extends Error{constructor(message,status,code){super(message);Object.assign(this,{status,code});}}
const identity={id:'bingo-live-official',name:'BinzoLive',official:true,verified:true,canSend:true};
const note={id:'announcement:'+id,kind:'announcement',senderType:'official',body:'An update',title:'BinzoLive update',createdAt:at,read:false};
const own={id:'support:'+id,kind:'support',senderType:'user',body:'Please help',createdAt:at,read:true,ticketId,sequence:1,clientMessageId:'official-fixture-01'};
const summary={...identity,unread:1,lastMessage:note};
const data={...identity,messages:[note],total:1,unreadCount:1,hasMore:false,before:null};
const receipt={message:own,official:{...summary,lastMessage:own}};
function fixture(){
 const events=[],calls=[],overrides={},timers=new Map(),modules=new Map(),state={key:'owner:session1:document1',available:true,foreground:true};let timerId=0,changes=0;
 const defaults={officialChat:()=>data,sendOfficialMessage:()=>receipt,readOfficialChat:()=>({official:{...summary,unread:0},read:true})};
 const api=new Proxy({},{get:(_,name)=>(...args)=>{calls.push({name,args});return Promise.resolve().then(()=>(overrides[name]||defaults[name])(...args));}});
 function load(relative){const file=path.resolve(root,relative);if(modules.has(file))return modules.get(file).exports;const module={exports:{}};modules.set(file,module);const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const requireMock=name=>name==='./api/client'||name==='./client'?{ApiError,errorMessage:error=>error.message||'Please try again.'}:load(path.relative(root,path.resolve(path.dirname(file),name+'.ts')));vm.runInNewContext(source,{module,exports:module.exports,require:requireMock,console,URL,Date,setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id)});return module.exports;}
 const bridge=load('src/official-bridge.ts').createOfficialBridge({api,emit:event=>events.push(plain(event)),snapshot:()=>({...state}),changed:()=>changes++});
 return{bridge,state,events,calls,overrides,timers,load,count:name=>calls.filter(call=>call.name===name).length,find:type=>events.filter(event=>event.type===type),changes:()=>changes};
}
async function activate(h){await h.bridge.handle({type:'official.activity',data:{active:true}});await settle();h.events.length=0;h.calls.length=0;}
test('official actions reject forged identity, unsafe references and person-chat routing',()=>{
 const h=fixture(),parse=h.load('src/web-message.ts').parseWebMessage;
 const send={type:'official.send',data:{body:'Please help',clientMessageId:'official-fixture-01',requestId:1}};
 assert.ok(parse(JSON.stringify(send)));
 for(const change of [{body:' '},{body:'x'.repeat(4001)},{clientMessageId:'short'},{requestId:0},{senderType:'official'},{ticketId},{recipientId:id},{verified:true}])assert.equal(parse(JSON.stringify({...send,data:{...send.data,...change}})),null);
 for(const bad of [{ids:[id]},{ids:[note.id,note.id]},{ids:[note.id],all:true},{all:false},{ids:[]}])assert.equal(parse(JSON.stringify({type:'official.read',data:{...bad,requestId:1}})),null);
 assert.ok(parse(JSON.stringify({type:'official.read',data:{ids:[note.id,own.id],requestId:1}})));
 assert.ok(parse(JSON.stringify({type:'official.read',data:{all:true,requestId:1}})));
 assert.equal(parse(JSON.stringify({type:'official.load',data:{before:'https://untrusted.test',requestId:1}})),null);
 for(const type of ['chat.open','call.start'])assert.equal(parse(JSON.stringify({type,data:{[type==='chat.open'?'with':'to']:'bingo-live-official'}})),null);
});
test('official metadata and canonical messages require server verified identity and exact kinds',()=>{
 const h=fixture(),a=h.load('src/api/official.ts');assert.deepEqual(plain(a.officialChatFrom(data)),data);
 for(const change of [{name:'Bingo Live Official'},{id},{verified:false},{official:false},{canSend:false},{unreadCount:-1},{before:id},{messages:[note,note]},{messages:[{...note,senderType:'user'}]},{messages:[{...own,ticketId:'other'}]},{messages:[{...own,clientMessageId:undefined}]}])assert.throws(()=>a.officialChatFrom({...data,...change}),/could not be verified/);
 assert.deepEqual(plain(a.officialReceiptFrom(receipt,own.clientMessageId)),{message:own,official:{...identity,unread:1,lastMessage:{id:own.id,body:own.body,createdAt:at,kind:'support',senderType:'user'}}});
 assert.throws(()=>a.officialReceiptFrom(receipt,'another-client-key'),/could not be verified/);
 assert.throws(()=>a.officialReceiptFrom({...receipt,message:{...own,senderType:'official'}},own.clientMessageId),/could not be verified/);
 assert.throws(()=>a.officialReadFrom({official:summary}),/could not be verified/);
});
test('legacy summary support capability normalizes send permission without weakening thread identity',()=>{
 const h=fixture(),a=h.load('src/api/official.ts'),canonical=plain(a.officialChatSummaryFrom(summary));
 assert.deepEqual(plain(a.officialChatSummaryFrom({...summary,canSend:false,supportEnabled:true})),canonical);
 for(const change of [{canSend:false},{canSend:false,supportEnabled:false},{canSend:false,supportEnabled:'true'},{canSend:false,supportEnabled:true,verified:false},{canSend:false,supportEnabled:true,name:'Unverified support'},{canSend:false,supportEnabled:true,id}])assert.throws(()=>a.officialChatSummaryFrom({...summary,...change}),/could not be verified/);
 assert.throws(()=>a.officialChatFrom({...data,canSend:false,supportEnabled:true}),/could not be verified/,'Thread payloads never use legacy summary compatibility');
});
test('cursor history and visible read acknowledgments retain exact request correlation',async()=>{
 const h=fixture();await activate(h);
 await h.bridge.handle({type:'official.load',data:{before:note.id,requestId:1}});
 assert.deepEqual(h.calls.find(call=>call.name==='officialChat').args,[note.id]);assert.equal(h.find('data.official')[0].data.append,true);assert.equal(h.find('data.official')[0].data.requestId,1);
 await h.bridge.handle({type:'official.read',data:{ids:[note.id,own.id],requestId:2}});await settle();
 assert.deepEqual(plain(h.calls.find(call=>call.name==='readOfficialChat').args),[{ids:[note.id,own.id]}]);assert.equal(h.find('official.saved')[0].data.requestId,2);assert.equal(h.find('official.saved')[0].data.official.unread,0);h.bridge.reset();
});
test('concurrent duplicate sends share HTTP work but acknowledge each request; retry keeps idempotency',async()=>{
 const h=fixture(),pending=deferred();h.overrides.sendOfficialMessage=()=>pending.promise;
 const request={type:'official.send',data:{body:own.body,clientMessageId:own.clientMessageId,requestId:1}};
 const first=h.bridge.handle(request),second=h.bridge.handle({...request,data:{...request.data,requestId:2}});await settle();assert.equal(h.count('sendOfficialMessage'),1);
 await h.bridge.handle({...request,data:{...request.data,body:'Changed while sending',requestId:3}});assert.equal(h.count('sendOfficialMessage'),1);assert.equal(h.find('official.error')[0].data.requestId,3);
 pending.resolve(receipt);await Promise.all([first,second]);assert.deepEqual(h.find('official.sent').map(event=>event.data.requestId),[1,2]);
 h.overrides.sendOfficialMessage=()=>{throw new ApiError('Offline',503);};await h.bridge.handle({...request,data:{...request.data,requestId:4}});
 assert.equal(h.find('official.error').at(-1).data.clientMessageId,own.clientMessageId);
 h.overrides.sendOfficialMessage=()=>receipt;await h.bridge.handle({...request,data:{...request.data,requestId:5}});assert.equal(h.find('official.sent').at(-1).data.requestId,5);assert.ok(h.calls.filter(call=>call.name==='sendOfficialMessage').every(call=>call.args[1]===own.clientMessageId));h.bridge.reset();
});
test('late reads and send receipts cannot cross account, session or document retirement',async()=>{
 for(const kind of ['load','send']){const h=fixture(),pending=deferred();h.overrides[kind==='load'?'officialChat':'sendOfficialMessage']=()=>pending.promise;const message=kind==='load'?{type:'official.load',data:{requestId:1}}:{type:'official.send',data:{body:own.body,clientMessageId:own.clientMessageId,requestId:1}};const work=h.bridge.handle(message);await settle();h.state.key='other-owner:session2:document2';h.bridge.reset();pending.resolve(kind==='load'?data:receipt);await work;assert.equal(h.events.length,0);assert.equal(h.changes(),0);h.bridge.reset();}
});
test('a history read that predates a committed send is revalidated before delivery',async()=>{
 const h=fixture(),pending=deferred();let reads=0;h.overrides.officialChat=()=>++reads===1?pending.promise:{...data,messages:[note,own],total:2};
 const loading=h.bridge.handle({type:'official.load',data:{requestId:1}});await settle();await h.bridge.handle({type:'official.send',data:{body:own.body,clientMessageId:own.clientMessageId,requestId:2}});pending.resolve(data);await loading;
 assert.equal(reads,2);assert.equal(h.find('data.official').length,1);assert.equal(h.find('data.official')[0].data.messages.length,2);h.bridge.reset();
});
test('reads wait for in-flight sends and retirement releases waiting readers without another request',async()=>{
 const h=fixture(),pending=deferred();h.overrides.sendOfficialMessage=()=>pending.promise;const writing=h.bridge.handle({type:'official.send',data:{body:own.body,clientMessageId:own.clientMessageId,requestId:1}});await settle();const loading=h.bridge.handle({type:'official.load',data:{requestId:2}});await settle();assert.equal(h.count('officialChat'),0);h.bridge.reset();h.state.key='new-owner';await loading;assert.equal(h.count('officialChat'),0);pending.resolve(receipt);await writing;assert.equal(h.events.length,0);
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
test('visible-ID reads require the foreground official view; explicit mark-all is account scoped',async()=>{
 const h=fixture();await h.bridge.handle({type:'official.read',data:{ids:[note.id],requestId:1}});assert.equal(h.count('readOfficialChat'),0);await h.bridge.handle({type:'official.read',data:{all:true,requestId:2}});assert.equal(h.count('readOfficialChat'),1);h.state.foreground=false;await h.bridge.handle({type:'official.read',data:{all:true,requestId:3}});assert.equal(h.count('readOfficialChat'),1);h.bridge.reset();
});
test('retired refresh completion cannot stop a replacement document polling lane',async()=>{
 const h=fixture(),pending=deferred();await activate(h);h.overrides.officialChat=()=>pending.promise;h.bridge.changed();await settle();h.bridge.reset();h.state.key='owner:session1:document2';h.overrides.officialChat=()=>data;await h.bridge.handle({type:'official.activity',data:{active:true}});await settle();assert.equal(h.find('data.official').length,1);pending.resolve(data);await settle();assert.equal(h.timers.size,1);assert.equal(h.find('data.official').length,1);h.bridge.reset();
});
test('background failures preserve content and do not terminate polling or emit send success',async()=>{
 const h=fixture();h.overrides.officialChat=()=>{throw new ApiError('Offline, please retry',503);};await h.bridge.handle({type:'official.activity',data:{active:true}});await settle();assert.equal(h.find('official.error')[0].data.background,true);assert.equal(h.find('official.sent').length,0);assert.equal(h.find('data.official').length,0);assert.equal(h.timers.size,1);h.bridge.reset();
});

test('duplicate active reports preserve the in-flight explicit history request',async()=>{
 const h=fixture();await activate(h);const pending=deferred();h.overrides.officialChat=()=>pending.promise;const work=h.bridge.handle({type:'official.load',data:{requestId:101}});await settle();await h.bridge.handle({type:'official.activity',data:{active:true}});await h.bridge.handle({type:'official.activity',data:{active:true}});pending.resolve(data);await work;assert.equal(h.count('officialChat'),1);assert.equal(h.find('data.official').length,1);assert.equal(h.find('data.official')[0].data.requestId,101);h.bridge.reset();
});
test('returning to the official view immediately repairs a history read canceled on leave',async()=>{
 const h=fixture();await activate(h);const pending=deferred();h.overrides.officialChat=()=>pending.promise;const work=h.bridge.handle({type:'official.load',data:{requestId:102}});await settle();await h.bridge.handle({type:'official.activity',data:{active:false}});h.overrides.officialChat=()=>data;await h.bridge.handle({type:'official.activity',data:{active:true}});await settle();assert.equal(h.count('officialChat'),2,'Recovery happens before the five-second timer');assert.equal(h.find('data.official').length,1);assert.equal(h.find('data.official')[0].data.background,true);pending.resolve(data);await work;assert.equal(h.find('data.official').length,1);h.bridge.reset();
});
test('an unavailable native session returns a correlated send error without HTTP',async()=>{
 const h=fixture();h.state.available=false;await h.bridge.handle({type:'official.send',data:{body:own.body,clientMessageId:own.clientMessageId,requestId:103}});assert.equal(h.count('sendOfficialMessage'),0);assert.deepEqual(h.find('official.error')[0].data,{action:'send',requestId:103,clientMessageId:own.clientMessageId,message:'Sign in to open the BinzoLive conversation.'});h.bridge.reset();
});
