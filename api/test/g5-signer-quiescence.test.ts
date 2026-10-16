import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {g5SignerAuditConfig,requireG5SignerQuiescence,requireG5PrivateArtifactAbsent,g5SignerDirectoryWithLock,G5_EMPTY_SIGNER_LOCK_SHA256} from '../src/g5-signer-quiescence.ts';
test('forward signer audit follows the exact configured distribution and refuses guessed or substituted config routes',()=>{
 const client={command:'wsl.exe',args:['--distribution','Ubuntu','--exec','python3','/repo/signer.py','--config','/home/operator/forward.json']};assert.equal(g5SignerAuditConfig(client),'//wsl.localhost/Ubuntu/home/operator/forward.json');assert.equal(g5SignerAuditConfig({...client,args:client.args.map(a=>a==='Ubuntu'?'Ubuntu-24.04':a)}),'//wsl.localhost/Ubuntu-24.04/home/operator/forward.json');
 for(const args of [client.args.filter(a=>!['--distribution','Ubuntu'].includes(a)),[...client.args,'--config','/other'],client.args.map(a=>a==='Ubuntu'?'other':a),client.args.map(a=>a==='/home/operator/forward.json'?'/home/../other':a),client.args.map(a=>a==='/repo/signer.py'?'/repo/unrelated.py':a)])assert.throws(()=>g5SignerAuditConfig({...client,args}));
});
test('fresh exact process/flock proof binds complete auth/typed/tx/lock bytes; stale or unknown fields never authorize a clear',()=>{
 const files=[{name:'b.typed.json',sha256:'b'.repeat(64)},{name:'a.auth.json',sha256:'a'.repeat(64)},{name:'c.PAY.tx.json',sha256:'c'.repeat(64)},{name:'signer.lock',sha256:'d'.repeat(64)}],digest=createHash('sha256').update([...files].sort((a,b)=>a.name<b.name?-1:1).map(f=>f.name+'\0'+f.sha256+'\n').join('')).digest('hex'),proof={version:1,status:'G5_SIGNER_QUIESCENT_READ_ONLY',observedAt:new Date().toISOString(),configSha256:'e'.repeat(64),journalDigest:digest,scopeSha256:'f'.repeat(64),fileCount:4,scopedProcessesAbsent:true,flockAcquired:true,lockReleased:true,readOnly:true,walletAddressMatches:true};requireG5SignerQuiescence(proof,'e'.repeat(64),files);
 for(const change of [{scopedProcessesAbsent:false},{flockAcquired:false},{lockReleased:false},{walletAddressMatches:false},{fileCount:3},{observedAt:'2020-01-01'},{secret:'untrusted'},{configSha256:'0'.repeat(64)}])assert.throws(()=>requireG5SignerQuiescence({...proof,...change},'e'.repeat(64),files));assert.throws(()=>requireG5SignerQuiescence(proof,'e'.repeat(64),files.slice(1)));assert.throws(()=>requireG5SignerQuiescence(proof,'e'.repeat(64),files.map((f,i)=>i===1?{...f,sha256:'0'.repeat(64)}:f)));
});

test('absence requires ENOENT from lstat; dangling symlink/present intent/permission uncertainty refuse',async()=>{
 await requireG5PrivateArtifactAbsent('/synthetic/missing',async()=>{throw Object.assign(Error('missing'),{code:'ENOENT'});});
 await assert.rejects(requireG5PrivateArtifactAbsent('/synthetic/dangling',async()=>({isSymbolicLink:()=>true})),/NOT_ABSENT/);
 await assert.rejects(requireG5PrivateArtifactAbsent('/synthetic/regular',async()=>({isFile:()=>true})),/NOT_ABSENT/);
 await assert.rejects(requireG5PrivateArtifactAbsent('/synthetic/unknown',async()=>{throw Object.assign(Error('denied'),{code:'EACCES'});}),/denied/);
});

test('retained64/8 inventories admit exactly one real empty OS lock as65/9 while preserving every original',()=>{
 const regular={isFile:()=>true,isSymbolicLink:()=>false,size:0},empty=Buffer.alloc(0);
 for(const kind of ['operator','payer'] as const){const count=kind==='operator'?64:8,baseline=Array.from({length:count},(_,i)=>({name:String(i).padStart(3,'0')+'.auth.json',sha256:'a'.repeat(64),bytesBase64:'original'})),before=JSON.stringify(baseline),names=[...baseline.map(f=>f.name),'signer.lock'],derived=g5SignerDirectoryWithLock(kind,baseline,names,regular,empty);assert.equal(derived.length,count+1);assert.equal(derived.at(-1)!.sha256,G5_EMPTY_SIGNER_LOCK_SHA256);assert.equal(JSON.stringify(baseline),before);assert.deepEqual(derived.slice(0,count),baseline);
 for(const changedNames of [names.slice(0,-1),names.slice(1),[...names,'unknown.tmp'],[...names,'unknown.auth.json']])assert.throws(()=>g5SignerDirectoryWithLock(kind,baseline,changedNames,regular,empty));
 for(const stat of [{...regular,isSymbolicLink:()=>true},{...regular,isFile:()=>false},{...regular,size:1}])assert.throws(()=>g5SignerDirectoryWithLock(kind,baseline,names,stat,empty));
 assert.throws(()=>g5SignerDirectoryWithLock(kind,baseline,names,regular,Buffer.from('unexpected')));assert.throws(()=>g5SignerDirectoryWithLock(kind,[...baseline.slice(0,-1),{...baseline[0],name:'signer.lock'}],names,regular,empty));
 }
});
