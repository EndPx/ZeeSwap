import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,open,readFile,writeFile,unlink,access,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {reverseStartupDiagnostic,reportReverseStartupFailure,cleanupG5StartupResources,closeOwnedG5Lock} from '../src/g5-reverse-startup.ts';
const prefix=join(tmpdir(),'zeeswap-reverse-startup-'),root=await mkdtemp(prefix);
after(async()=>{if(!resolve(root).startsWith(resolve(prefix)))throw Error('Unexpected test cleanup path');await rm(root,{recursive:true});});

test('startup and cleanup packets retain only static phase/code/class and public source locations',()=>{
 const error=new Error('https://user:private-secret@rpc.invalid memo=private-order');
 const init=reverseStartupDiagnostic(error,'quote','CONFIG_READ');
 assert.equal(init.status,'G5_REVERSE_INITIALIZATION_FAILED');assert.equal(init.diagnostic.phase,'G5_REVERSE_INIT_CONFIG_READ');
 assert.equal(init.diagnostic.code,'PRIVATE_DIAGNOSTIC_ERROR');assert.equal(JSON.stringify(init).includes('private-secret'),false);
 const cleanup=reverseStartupDiagnostic(new Error('REVERSE_OPERATOR_PAUSE_FAILED'),'quote','PAUSE');
 assert.equal(cleanup.status,'G5_REVERSE_CLEANUP_FAILED');assert.equal(cleanup.diagnostic.phase,'G5_REVERSE_CLEANUP_PAUSE');
 const unknown=reverseStartupDiagnostic(error,'private-order','https://private-secret');
 assert.equal(unknown.diagnostic.step,'initialization');assert.equal(unknown.diagnostic.phase,'G5_REVERSE_INIT_ARGUMENTS');
});
test('parent packet is emitted before a failed private diagnostic write and preserves the original failure',async()=>{
 const events:string[]=[];
 const packet=await reportReverseStartupFailure(new Error('G5_PRIVATE_OWNER_MISMATCH'),'quote','STATE_BINDING',{
  emit:p=>{events.push('emit');assert.equal(p.diagnostic.code,'G5_PRIVATE_OWNER_MISMATCH');},
  persist:async()=>{events.push('persist');throw Error('private IO unavailable');}});
 assert.deepEqual(events,['emit','persist']);assert.equal(packet.diagnostic.code,'G5_PRIVATE_OWNER_MISMATCH');
});
test('uppercase provider secrets, hostile error codes, frame extras and injected optional diagnostics cannot enter startup packets',()=>{
 const secret='UPPERCASE_SECRET_TOKEN';const error=Object.assign(new Error(secret),{code:'ABCDE',private:'PRIVATE_PAYLOAD',
  diagnostic:{event:'observer-frontier',source:'source-wallet-snapshot',status:'CONFLICT',reason:'TIP_HASH_CHANGED',network:'zcash-testnet',previous:{height:1,hash:'a'.repeat(64)},incoming:{height:1,hash:'b'.repeat(64)}},
  scannerDiagnostic:{version:1,status:'WALLET_READ_ONLY_ERROR',command:'snapshot',phase:'SDK_NOTES',code:'SDK_PROCESS_FAILED_RECONCILE',uncertain:false,lockReleased:true,processCompleted:true}});
 error.stack=`Error: ${secret}\n at /private/${secret}.ts:2:3\n at /private/g5-context.ts:12:4\n at /private/g5-context.ts:${'9'.repeat(60)}:4`;
 const packet=reverseStartupDiagnostic(error,'quote','SLOT'),text=JSON.stringify(packet);
 assert.equal(packet.diagnostic.code,'PRIVATE_DIAGNOSTIC_ERROR');assert.equal('sqlState' in packet.diagnostic,false);
 assert.deepEqual(packet.diagnostic.frames,[{file:'g5-context.ts',line:12,column:4}]);
 for(const forbidden of [secret,'ABCDE','PRIVATE_PAYLOAD','observerFrontier','scannerDiagnostic','/private/'])assert.equal(text.includes(forbidden),false);
 const known=reverseStartupDiagnostic(Object.assign(new Error('UNKNOWN_UPPERCASE_PROVIDER_MESSAGE'),{code:'08006'}),'quote','SLOT');
 assert.equal(known.diagnostic.code,'PRIVATE_DIAGNOSTIC_ERROR');assert.equal(known.diagnostic.sqlState,'08006');
 const file=reverseStartupDiagnostic(Object.assign(new Error(secret),{code:'ENOENT'}),'quote','CONFIG_READ');
 assert.equal(file.diagnostic.code,'ENOENT');assert.equal('sqlState' in file.diagnostic,false);
});
test('actual reverse CLI captures config startup failure before runtime/DB without leaking private argv',()=>{
 const missing=join(root,'private-configuration-must-not-leak.json');
 const child=spawnSync(process.execPath,['--import',import.meta.resolve('tsx'),fileURLToPath(new URL('../scripts/g5-reverse-operator.ts',import.meta.url)),'quote',missing],{encoding:'utf8',windowsHide:true,timeout:15000});
 assert.notEqual(child.status,0);
 const packet=child.stderr.split(/\r?\n/).map(line=>{try{return JSON.parse(line);}catch{return undefined;}}).find(p=>p?.status==='G5_REVERSE_INITIALIZATION_FAILED');
 assert.equal(packet?.diagnostic.phase,'G5_REVERSE_INIT_CONFIG_READ');
 assert.equal(child.stderr.includes('private-configuration-must-not-leak'),false);
});
test('actual reverse CLI persists sanitized startup proof when a private state path is already known',async()=>{
 const path=join(root,'operator.json'),state=join(root,'state.json');await writeFile(path,JSON.stringify({stateFile:state}));
 const child=spawnSync(process.execPath,['--import',import.meta.resolve('tsx'),fileURLToPath(new URL('../scripts/g5-reverse-operator.ts',import.meta.url)),'quote',path],{encoding:'utf8',windowsHide:true,timeout:15000});
 assert.notEqual(child.status,0);
 const packet=JSON.parse(await readFile(state+'.initialization-diagnostic.private.json','utf8'));
 assert.equal(packet.status,'G5_REVERSE_INITIALIZATION_FAILED');assert.equal(packet.diagnostic.phase,'G5_REVERSE_INIT_TARGET');
 await assert.rejects(()=>access(state),/ENOENT/);
});
test('partial pool shutdown attempts every acquired pool and still releases the exact owned lock',async()=>{
 const path=join(root,'owned.lock'),handle=await open(path,'wx'),identity=await handle.stat({bigint:true});await handle.writeFile('owned');
 const calls:string[]=[];
 await assert.rejects(()=>cleanupG5StartupResources([{end:()=>{calls.push('first');throw Error('close failed');}},{end:async()=>{calls.push('second');}}],{path,handle,identity}),/close failed/);
 assert.deepEqual(calls,['first','second']);await assert.rejects(()=>access(path),/ENOENT/);
});
test('owned-handle cleanup preserves a foreign replacement sentinel at the same pathname',async()=>{
 const path=join(root,'replaced.lock'),handle=await open(path,'wx'),identity=await handle.stat({bigint:true});await handle.writeFile('original');
 await unlink(path);await writeFile(path,'foreign owner');
 await closeOwnedG5Lock(path,handle,identity);
 assert.equal(await readFile(path,'utf8'),'foreign owner');
});
test('cleanup without an acquired handle cannot remove an existing stale sentinel',async()=>{
 const path=join(root,'stale.lock');await writeFile(path,'stale existing owner');
 await cleanupG5StartupResources([]);assert.equal(await readFile(path,'utf8'),'stale existing owner');
});

test('private JSON transport diagnostics expose only exact static codes and their source basename',()=>{
 for(const code of ['PRIVATE_JSON_WSL_TIMEOUT','PRIVATE_JSON_WSL_PROTOCOL_INVALID','PRIVATE_JSON_PARSE_FAILED']){
  const error=Object.assign(new Error(code),{code:'EJSONPARSE'});
  error.stack='Error: PRIVATE_BYTES\n at /private/private-json-read.ts:17:3';
  const packet=reverseStartupDiagnostic(error,'prepare-commit','SLOT');
  assert.equal(packet.diagnostic.code,code);assert.deepEqual(packet.diagnostic.frames,[{file:'private-json-read.ts',line:17,column:3}]);
  assert.equal(JSON.stringify(packet).includes('PRIVATE_BYTES'),false);assert.equal(JSON.stringify(packet).includes('/private/'),false);
 }
 const hostile=reverseStartupDiagnostic(Object.assign(new Error('PRIVATE_JSON_PROVIDER_SECRET_TOKEN'),{code:'EWSL_PROVIDER_SECRET'}),'quote','CONFIG_READ');
 assert.equal(hostile.diagnostic.code,'PRIVATE_DIAGNOSTIC_ERROR');
});
