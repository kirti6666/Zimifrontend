/* Support boundary/lifecycle checks with API and clock edges isolated. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {test}=require('node:test');
const root=path.resolve(__dirname,'..'),ticketId='507f1f77bcf86cd799439041',otherId='507f1f77bcf86cd799439043',messageId='507f1f77bcf86cd799439042';
const plain=value=>JSON.parse(JSON.stringify(value));
const settle=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
class ApiError extends Error{constructor(message,status,code){super(message);Object.assign(this,{status,code});}}
const now='2026-10-31T10:00:00.000Z';
const ticket={id:ticketId,subject:'Call issue',category:'calls',status:'open',priority:'normal',requester:{id:otherId,name:'Fixture',role:'host',avatar:null},assignee:null,lastMessage:{body:'Help',senderType:'user',createdAt:now},unreadUser:1,unreadStaff:0,createdAt:now,updatedAt:now,lastMessageAt:now};
const message={id:messageId,ticketId,body:'A reply',senderType:'staff',senderName:'Support fixture',clientMessageId:'support-fixture-01',createdAt:now};
function fixture(){
  const timers=new Map(),events=[],calls=[],overrides={},modules=new Map();let timerId=0;
  const state={key:'owner:session1:document1',available:true,foreground:true};
  const defaults={supportTickets:()=>({tickets:[ticket],total:1,limit:20,page:1,unreadCount:1}),supportTicket:()=>({ticket,messages:[message],total:1,hasMore:false,before:messageId}),createSupportTicket:()=>({ticket,message}),sendSupportMessage:()=>({ticket,message}),readSupportTicket:()=>({ticket:{...ticket,unreadUser:0}}),updateSupportTicket:()=>({ticket:{...ticket,status:'resolved'}})};
  const api=new Proxy({},{get:(_,name)=>(...args)=>{calls.push({name,args});return Promise.resolve().then(()=>(overrides[name]||defaults[name])(...args));}});
  function load(relative){
    const file=path.resolve(root,relative);if(modules.has(file))return modules.get(file).exports;const module={exports:{}};modules.set(file,module);
    const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const requireMock=name=>name==='./api/client'||name==='./client'?{ApiError,errorMessage:error=>error.message||'Please try again.'}:load(path.relative(root,path.resolve(path.dirname(file),name+'.ts')));
    vm.runInNewContext(source,{module,exports:module.exports,require:requireMock,console,URL,Date,setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id)});return module.exports;
  }
  const bridge=load('src/support-bridge.ts').createSupportBridge({api,emit:event=>events.push(plain(event)),snapshot:()=>({...state})});
  return{bridge,state,timers,events,calls,overrides,load,count:name=>calls.filter(call=>call.name===name).length,find:type=>events.filter(event=>event.type===type)};
}
test('support messages reject forged staff/owner fields, empty or oversized text and invalid references',()=>{
  const h=fixture(),parse=h.load('src/web-message.ts').parseWebMessage;
  const valid={type:'support.create',data:{subject:'A question',category:'payouts',body:'Please help',clientMessageId:'support-fixture-01',requestId:1}};
  assert.ok(parse(JSON.stringify(valid)));
  for(const change of [{body:' '},{body:'x'.repeat(4001)},{subject:'x'.repeat(121)},{category:'admin'},{clientMessageId:'short'},{requestId:0},{senderType:'staff'},{userId:otherId}])assert.equal(parse(JSON.stringify({...valid,data:{...valid.data,...change}})),null);
  assert.equal(parse(JSON.stringify({type:'support.status',data:{ticketId,status:'in_progress',requestId:1}})),null);
  assert.ok(parse(JSON.stringify({type:'support.send',data:{ticketId,body:'<img onerror=alert(1)>',clientMessageId:'support-fixture-01',requestId:2}})),'Plain text is preserved; the UI escapes it');
});
test('support load and cursor history use server data and exact read-through boundary',async()=>{
  const h=fixture();await h.bridge.handle({type:'support.activity',data:{active:true,ticketId}});
  await h.bridge.handle({type:'support.open',data:{ticketId,before:messageId,requestId:1}});
  assert.equal(h.find('data.supportTicket')[0].data.append,true);
  assert.deepEqual(h.calls.find(call=>call.name==='supportTicket').args,[ticketId,messageId]);
  await h.bridge.handle({type:'support.read',data:{ticketId,throughMessageId:messageId,requestId:2}});await settle();
  assert.deepEqual(h.calls.find(call=>call.name==='readSupportTicket').args,[ticketId,messageId]);h.bridge.reset();
});
test('duplicate sends share one in-flight operation and retry preserves the idempotency reference',async()=>{
  const h=fixture(),pending=deferred();h.overrides.sendSupportMessage=()=>pending.promise;
  const request={type:'support.send',data:{ticketId,body:'Help',clientMessageId:'support-fixture-01',requestId:1}};
  const one=h.bridge.handle(request),two=h.bridge.handle(request);await settle();assert.equal(h.count('sendSupportMessage'),1);
  pending.reject(new ApiError('Temporary failure',503));await Promise.all([one,two]);
  assert.equal(h.find('operation.error').length,1);assert.equal(h.find('operation.error')[0].data.clientMessageId,request.data.clientMessageId);
  h.overrides.sendSupportMessage=()=>({ticket,message});await h.bridge.handle({...request,data:{...request.data,requestId:2}});
  assert.equal(h.find('support.sent').length,1);assert.equal(h.calls.filter(call=>call.name==='sendSupportMessage').at(-1).args[2],request.data.clientMessageId);h.bridge.reset();
});
test('late content and send acknowledgments cannot cross account, session or document retirement',async()=>{
  for(const kind of ['support.open','support.send']){
    const h=fixture(),pending=deferred();h.overrides[kind==='support.open'?'supportTicket':'sendSupportMessage']=()=>pending.promise;
    const data=kind==='support.open'?{ticketId,requestId:1}:{ticketId,body:'Help',clientMessageId:'support-fixture-01',requestId:1};
    const work=h.bridge.handle({type:kind,data});await settle();h.state.key='replacement:session2:document2';h.bridge.reset();pending.resolve(kind==='support.open'?{ticket,messages:[message],total:1,hasMore:false,before:messageId}:{ticket,message});await work;
    assert.equal(h.events.length,0);h.bridge.reset();
  }
});
test('latest query wins and leaving a conversation retires earlier reads',async()=>{
  const h=fixture(),old=deferred();h.overrides.supportTickets=query=>query.status==='open'?old.promise:{tickets:[],page:1,limit:20,total:0,unreadCount:0};
  const first=h.bridge.handle({type:'support.load',data:{status:'open',requestId:1}});await settle();await h.bridge.handle({type:'support.load',data:{status:'resolved',requestId:2}});
  old.resolve({tickets:[ticket],page:1,limit:20,total:1,unreadCount:1});await first;
  assert.equal(h.find('data.supportTickets').length,1);assert.equal(h.find('data.supportTickets')[0].data.requestId,2);
  const detail=deferred();h.overrides.supportTicket=()=>detail.promise;
  const work=h.bridge.handle({type:'support.open',data:{ticketId,requestId:3}});await settle();await h.bridge.handle({type:'support.activity',data:{active:false}});
  detail.resolve({ticket,messages:[message],total:1,hasMore:false,before:messageId});await work;assert.equal(h.find('data.supportTicket').length,0);h.bridge.reset();
});
test('live invalidations and fallback polling only run while the support screen is foreground',async()=>{
  const h=fixture();await h.bridge.handle({type:'support.activity',data:{active:true,ticketId}});assert.equal(h.timers.size,1);
  h.bridge.changed(ticketId);await settle();assert.equal(h.find('data.supportTicket').length,1);assert.equal(h.find('data.supportTicket')[0].data.background,true);
  const before=h.calls.length;h.state.foreground=false;h.bridge.foreground();h.bridge.changed(ticketId);await settle();assert.equal(h.calls.length,before);assert.equal(h.timers.size,0);
  h.state.foreground=true;h.bridge.foreground();await settle();assert.ok(h.count('supportTicket')>=2);assert.equal(h.timers.size,1);h.bridge.reset();assert.equal(h.timers.size,0);
});
test('background or another conversation cannot mark replies read',async()=>{
  const h=fixture();await h.bridge.handle({type:'support.activity',data:{active:true,ticketId:otherId}});
  await h.bridge.handle({type:'support.read',data:{ticketId,throughMessageId:messageId,requestId:1}});
  h.state.foreground=false;await h.bridge.handle({type:'support.activity',data:{active:true,ticketId}});
  await h.bridge.handle({type:'support.read',data:{ticketId,throughMessageId:messageId,requestId:2}});
  assert.equal(h.count('readSupportTicket'),0);assert.equal(h.find('operation.error').length,2);h.bridge.reset();
});
test('summary unread updates coalesce and cannot leak across account retirement',async()=>{
  const h=fixture(),pending=deferred();h.overrides.supportTickets=()=>pending.promise;
  h.bridge.changed(ticketId);h.bridge.changed(ticketId);await settle();assert.equal(h.count('supportTickets'),1);
  h.state.key='another-account';h.bridge.reset();pending.resolve({tickets:[ticket],page:1,limit:20,total:1,unreadCount:1});await settle();
  assert.equal(h.find('support.unread').length,0);h.bridge.reset();
});
test('retired account reads and writes cannot stop the next account polling',async()=>{
  for(const kind of ['read','write']){
    const h=fixture(),pending=deferred();
    if(kind==='read'){
      h.overrides.supportTicket=()=>pending.promise;await h.bridge.handle({type:'support.activity',data:{active:true,ticketId}});h.bridge.changed(ticketId);await settle();
    }else{
      h.overrides.sendSupportMessage=()=>pending.promise;void h.bridge.handle({type:'support.send',data:{ticketId,body:'Help',clientMessageId:'support-fixture-01',requestId:1}});await settle();
    }
    h.state.key='new-account:session2';h.bridge.reset();delete h.overrides.supportTicket;delete h.overrides.sendSupportMessage;
    await h.bridge.handle({type:'support.activity',data:{active:true,ticketId}});h.bridge.changed(ticketId);await settle();
    assert.equal(h.find('data.supportTicket').length,1,'New account starts immediately despite a retired flight');
    pending.resolve(kind==='read'?{ticket,messages:[message],total:1,hasMore:false,before:messageId}:{ticket,message});await settle();
    assert.equal(h.timers.size,1,'Retired finally cannot clear the new polling lane');
    const count=h.count('supportTicket');const tick=[...h.timers.values()][0];h.timers.clear();tick.fn();await settle();assert.equal(h.count('supportTicket'),count+1);h.bridge.reset();
  }
});
test('the same client reference on two different tickets is not a dedupe collision',async()=>{
  const h=fixture(),pending=deferred();h.overrides.sendSupportMessage=()=>pending.promise;
  const data={body:'Help',clientMessageId:'support-fixture-01',requestId:1};
  const first=h.bridge.handle({type:'support.send',data:{...data,ticketId}}),second=h.bridge.handle({type:'support.send',data:{...data,ticketId:otherId}});await settle();
  assert.equal(h.count('sendSupportMessage'),2);pending.resolve({ticket,message});await Promise.all([first,second]);h.bridge.reset();
});
test('an explicit read started before a write is refreshed before it can restore stale status',async()=>{
  const h=fixture(),old=deferred();let reads=0;
  h.overrides.supportTicket=()=>++reads===1?old.promise:{ticket:{...ticket,status:'resolved'},messages:[message],total:1,hasMore:false,before:messageId};
  const loading=h.bridge.handle({type:'support.open',data:{ticketId,requestId:1}});await settle();
  await h.bridge.handle({type:'support.status',data:{ticketId,status:'resolved',requestId:2}});
  old.resolve({ticket,messages:[message],total:1,hasMore:false,before:messageId});await loading;
  assert.equal(h.find('data.supportTicket').length,1);assert.equal(h.find('data.supportTicket')[0].data.ticket.status,'resolved');assert.equal(reads,2);h.bridge.reset();
});
test('explicit reads wait for current writes and retirement releases those readers without sending',async()=>{
  const h=fixture(),sending=deferred();h.overrides.sendSupportMessage=()=>sending.promise;
  const write=h.bridge.handle({type:'support.send',data:{ticketId,body:'Help',clientMessageId:'support-fixture-01',requestId:1}});await settle();
  const read=h.bridge.handle({type:'support.open',data:{ticketId,requestId:2}});await settle();assert.equal(h.count('supportTicket'),0);
  h.bridge.reset();h.state.key='new-account';await read;assert.equal(h.count('supportTicket'),0);
  sending.resolve({ticket,message});await write;h.bridge.reset();
});
test('slow reads and writes from an earlier support view cannot consume the new view polling timer',async()=>{
  for(const kind of ['read','write']){
    const h=fixture(),pending=deferred();await h.bridge.handle({type:'support.activity',data:{active:true,ticketId}});
    if(kind==='read'){h.overrides.supportTicket=id=>id===ticketId?pending.promise:{ticket:{...ticket,id},messages:[],total:0,hasMore:false,before:null};h.bridge.changed(ticketId);await settle();}
    else{h.overrides.sendSupportMessage=()=>pending.promise;void h.bridge.handle({type:'support.send',data:{ticketId,body:'Help',clientMessageId:'support-fixture-01',requestId:1}});await settle();}
    await h.bridge.handle({type:'support.activity',data:{active:true,ticketId:otherId}});const tick=[...h.timers.values()][0];h.timers.clear();tick.fn();await settle();
    pending.resolve(kind==='read'?{ticket,messages:[message],total:1,hasMore:false,before:messageId}:{ticket,message});await settle();
    assert.ok(h.calls.some(call=>call.name==='supportTicket'&&call.args[0]===otherId),'The current conversation is refreshed when the earlier view settles');
    assert.equal(h.timers.size,1,'The current polling timer remains armed');h.bridge.reset();
  }
});
test('write receipts and retry errors settle their original outbox even after leaving the view',async()=>{
  for(const kind of ['support.create','support.send']){
    const h=fixture(),pending=deferred();h.overrides[kind==='support.create'?'createSupportTicket':'sendSupportMessage']=()=>pending.promise;
    const data={body:'Help',clientMessageId:'support-fixture-01',requestId:1,...(kind==='support.create'?{subject:'A question',category:'general'}:{ticketId})};
    const work=h.bridge.handle({type:kind,data});await settle();await h.bridge.handle({type:'support.activity',data:{active:false}});
    pending.reject(new ApiError('Please retry',503));await work;
    assert.equal(h.find('operation.error').length,1);assert.equal(h.find('operation.error')[0].data.requestId,1,'The original create/send controls can leave their busy state');h.bridge.reset();
  }
});
