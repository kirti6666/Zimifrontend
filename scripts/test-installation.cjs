/* Installation evidence stays in native SecureStore across account switches. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');
const ts=require('typescript');
const root=path.resolve(__dirname,'..'),key='zimi.installation.v1',first='5ee7ef02-1d49-4bd9-a280-f25996f77111',second='5ee7ef02-1d49-4bd9-a280-f25996f77222';
function harness(){
 const disk=new Map(),calls=[],hooks={},native={uuidv4:()=>{calls.push({op:'uuid'});return first}};
 const storage={WHEN_UNLOCKED_THIS_DEVICE_ONLY:7,getItemAsync:async(key,options)=>{calls.push({op:'get',key,options});if(hooks.read)await hooks.read();return disk.get(key)??null},setItemAsync:async(key,value,options)=>{calls.push({op:'set',key,value,options});if(hooks.write)await hooks.write();disk.set(key,value)},deleteItemAsync:async key=>disk.delete(key)};
 function restart(){const modules=new Map(),context=vm.createContext({console,expo:native});function load(relative){const filename=path.join(root,relative);if(modules.has(filename))return modules.get(filename).exports;const module={exports:{}};modules.set(filename,module);const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInContext(`(function(require,module,exports){${code}\n})`,context,{filename})(name=>{assert.equal(name,'expo-secure-store');return storage},module,module.exports);return module.exports}return{installation:load('src/installation.ts'),session:()=>load('src/session.ts')}}
 return{disk,calls,hooks,native,restart,...restart()};
}
test('concurrent installation reads generate one protected UUID and restart reuses its canonical value',async()=>{
 const h=harness();const ids=await Promise.all(Array.from({length:8},()=>h.installation.getInstallationId()));assert.deepEqual(ids,Array(8).fill(first));assert.equal(h.calls.filter(call=>call.op==='uuid').length,1);assert.equal(h.calls.filter(call=>call.op==='set').length,1);assert.equal(h.disk.get(key),first);h.native.uuidv4=()=>second;assert.equal(await h.restart().installation.getInstallationId(),first);assert.ok(h.calls.filter(call=>call.op!=='uuid').every(call=>call.options.keychainAccessible===7));
});
test('logout and a different account session never erase or replace installation evidence',async()=>{
 const h=harness();await h.installation.getInstallationId();const session=h.session(),tokens=name=>({accessToken:name+'.access.'+'a'.repeat(30),refreshToken:name+'.refresh.'+'r'.repeat(30),expiresIn:900,refreshExpiresIn:86400});await session.setSessionTokens(tokens('alice'));await session.clearToken();await session.setSessionTokens(tokens('bob'));assert.equal(h.disk.get(key),first);assert.equal(await h.restart().installation.getInstallationId(),first);
});
test('locked storage and failed writes omit optional evidence without weak or transient fallback IDs',async()=>{
 for(const failure of ['read','write']){const h=harness();h.hooks[failure]=async()=>{throw Error('Locked')};assert.equal(await h.installation.getInstallationId(),undefined);assert.equal(h.disk.has(key),false);delete h.hooks[failure];assert.equal(await h.installation.getInstallationId(),first);assert.equal(h.disk.get(key),first)}
 const unsupported=harness();unsupported.native.uuidv4=undefined;assert.equal(await unsupported.installation.getInstallationId(),undefined);assert.equal(unsupported.disk.size,0);
});
test('legacy malformed stored evidence is repaired using the native generator and uppercase UUIDs normalize',async()=>{
 const h=harness();h.disk.set(key,'corrupt');assert.equal(await h.installation.getInstallationId(),first);const known=harness();known.disk.set(key,second.toUpperCase());assert.equal(await known.installation.getInstallationId(),second);assert.equal(known.calls.some(call=>call.op==='uuid'),false);
});
