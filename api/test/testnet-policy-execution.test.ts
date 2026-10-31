import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {posix} from 'node:path';
import {POLICY_WORKER_EXECUTION_PATHS,workerExecutionRoot,workerExecutionPins,requireWorkerPolicyCommit,requireContinuousCapitalApproval,requireContinuousCapitalSqlGrant,requireForwardFastExecution,requireForwardFastSignerConfig,readPolicyExecutionEpoch,type ForwardFastExecutionApproval,type ContinuousCapitalApproval} from '../src/testnet-policy-execution.ts';
const root='/opt/zeeswap-testnet/releases/swap-live-fixture-r1/app',commit='a'.repeat(40),hash='b'.repeat(64);
const fixture=():{publicCommit:string;files:{relativePath:string;path:string;sha256:string}[]}=>({publicCommit:commit,files:POLICY_WORKER_EXECUTION_PATHS.map(relativePath=>({relativePath,path:root+'/'+relativePath,sha256:hash}))});
test('continuous capital requires exact new capture, original delegate and actual SQL approval',async()=>{
 const policy='c'.repeat(64),profile='d'.repeat(64),a:ContinuousCapitalApproval={version:1,purpose:'ROOT_CONTINUOUS_POLICY_CAPITAL',policySha256:policy,profileSha256:profile,executionRoot:root,captureScript:{path:root+'/workers/zcash-wallet/testnet_continuous_capital.py',sha256:hash},originalCaptureScript:{path:'/opt/zeeswap-testnet/releases/original-r1/app/workers/zcash-wallet/testnet_policy_capital.py',sha256:'e'.repeat(64)}};
 assert.doesNotThrow(()=>requireContinuousCapitalApproval(a,{executionRoot:root},policy,profile));
 for(const change of [(x:any)=>x.purpose='OTHER',(x:any)=>x.policySha256=profile,(x:any)=>x.profileSha256=policy,(x:any)=>x.executionRoot=root+'/other',(x:any)=>x.captureScript.sha256='0'.repeat(64),(x:any)=>x.captureScript.path=x.originalCaptureScript.path,(x:any)=>x.originalCaptureScript.path='/tmp/testnet_policy_capital.py',(x:any)=>x.originalCaptureScript.sha256='0'.repeat(64)]){const wrong=structuredClone(a);change(wrong);assert.throws(()=>requireContinuousCapitalApproval(wrong,{executionRoot:root},policy,profile));}
 const db={query:async(sql:string,args?:any[])=>{assert.match(sql,/testnet_continuous_capital_authorized\(\$1,\$2\)/);assert.equal(args?.[0].toString('hex'),policy);assert.equal(args?.[1].toString('hex'),hash);return{rows:[{yes:true}]};}};
 await requireContinuousCapitalSqlGrant(db,policy,hash);
 for(const yes of [false,null,undefined,'true'])await assert.rejects(requireContinuousCapitalSqlGrant({query:async()=>({rows:[{yes}]})},policy,hash),/CONTINUOUS_CAPITAL_SQL_AUTHORITY/);
 await assert.rejects(requireContinuousCapitalSqlGrant(db,policy,'0'.repeat(64)),/CONTINUOUS_CAPITAL_DIGEST/);
});

test('Root forward execution amendment binds original policy and exact reviewed new execution without changing default commit gate',()=>{
 const pin=(path:string)=>({path,sha256:hash}),c={executionRoot:root,publicCommit:commit,executionManifest:pin('/opt/zeeswap-testnet/state/service-policy/new-manifest.private.json'),forwardFastExecution:pin('/opt/zeeswap-testnet/state/service-policy/forward-fast.private.json')};
 const policy={sha256:'c'.repeat(64),activeEpoch:'242',publicCommit:'d'.repeat(40)},a:ForwardFastExecutionApproval={version:1,purpose:'ROOT_BASE_L2_FAST_EXECUTION',policySha256:policy.sha256,activeEpoch:policy.activeEpoch,policyPublicCommit:policy.publicCommit,profileSha256:hash,executionRoot:root,publicCommit:commit,executionManifest:c.executionManifest,signerScript:pin(root+'/workers/base-signer/signer.py'),signerDiagnostics:pin(root+'/workers/base-signer/signer_diagnostics.py'),supervisor:pin(root+'/workers/zcash-wallet/owned_wallet_call.py'),signerConfig:pin('/opt/zeeswap-testnet/secrets/forward-fast-test.private.json'),originalSignerConfigSha256:hash};
 requireForwardFastExecution(a,c,policy,hash);
 for(const change of[{purpose:'OTHER'},{policySha256:hash},{activeEpoch:'243'},{policyPublicCommit:commit},{profileSha256:policy.sha256},{publicCommit:policy.publicCommit},{executionRoot:'/tmp/app'},{executionManifest:{...c.executionManifest,sha256:policy.sha256}},{signerScript:pin('/tmp/signer.py')},{supervisor:pin('/tmp/owned_wallet_call.py')},{signerConfig:pin('/tmp/config.private.json')}])assert.throws(()=>requireForwardFastExecution({...a,...change} as ForwardFastExecutionApproval,c,policy,hash),/EXECUTION_FORWARD_FAST/);
 assert.throws(()=>requireWorkerPolicyCommit(commit,policy.publicCommit),/EXECUTION_POLICY_COMMIT/);
 assert.throws(()=>requireForwardFastExecution(a,{...c,forwardFastExecution:undefined},policy,hash),/FORWARD_FAST_APPROVAL_PATH/);
 const original={journalRoot:'/private/original',passwordFile:'/private/password',operator:'same'};requireForwardFastSignerConfig({...original,forwardFastSettlement:true},original);
 for(const changed of[{...original,forwardFastSettlement:'true'},{...original,forwardFastSettlement:true,journalRoot:'/other'},{...original,forwardFastSettlement:true,extra:'x'}])assert.throws(()=>requireForwardFastSignerConfig(changed,original),/FORWARD_FAST_SIGNER_CONFIG/);
});

test('fresh execution root is independent of original native profile release and policy-bound',()=>{
 assert.equal(workerExecutionRoot(root+'/api/scripts/work-linux-testnet-policy.ts',root),root);
 const pins=workerExecutionPins(fixture(),root,commit);assert.equal(pins.length,49);assert(POLICY_WORKER_EXECUTION_PATHS.includes('api/src/main-database-relocation.ts'));assert(pins.every(p=>p.path.startsWith(root+'/')));requireWorkerPolicyCommit(commit,commit);
 for(const bad of['/tmp/app','/opt/zeeswap-testnet/releases/../app','/opt/zeeswap-testnet/releases/x/extra/app',root+'/'])assert.throws(()=>workerExecutionRoot(bad+'/api/scripts/work-linux-testnet-policy.ts',bad),/EXECUTION_ROOT/);
 assert.throws(()=>workerExecutionRoot(root+'/api/scripts/work-linux-testnet-policy.ts','/opt/zeeswap-testnet/releases/linux-live-20261024/app'),/EXECUTION_ROOT/);
 assert.throws(()=>workerExecutionRoot(root+'/api/scripts/other.ts',root),/EXECUTION_ENTRY/);
 assert.throws(()=>requireWorkerPolicyCommit(commit,'c'.repeat(40)),/EXECUTION_POLICY_COMMIT/);
 assert.throws(()=>workerExecutionPins({...fixture(),publicCommit:'c'.repeat(40)},root,commit),/EXECUTION_MANIFEST/);
});

test('every audited dependency is mandatory; old seven-file pins cannot authorize fresh execution',()=>{
 for(const missing of POLICY_WORKER_EXECUTION_PATHS){const m=fixture();m.files=m.files.filter(f=>f.relativePath!==missing);assert.throws(()=>workerExecutionPins(m,root,commit),/EXECUTION_IMPORT_CLOSURE/);}
 const m=fixture();m.files=m.files.filter(f=>['api/scripts/work-linux-testnet-policy.ts','api/src/testnet-policy-worker.ts','api/src/testnet-policy-capital.ts','api/src/testnet-policy-capital-builder.ts','api/src/base-settlement.ts','api/src/testnet-policy-refund.ts','api/src/testnet-service-policy.ts'].includes(f.relativePath));assert.throws(()=>workerExecutionPins(m,root,commit),/EXECUTION_IMPORT_CLOSURE/);
});

test('manifest refuses duplicate, escaped, relocated or malformed code pins and oversized sets',()=>{
 for(const changed of[{relativePath:'../secrets/private.json'},{relativePath:'/api/src/db.ts'},{relativePath:'api/src/../db.ts'},{relativePath:'api//src/db.ts'},{relativePath:'api\\src\\db.ts'},{path:'/opt/zeeswap-testnet/releases/linux-live-20261024/app/api/src/db.ts'},{sha256:'0'.repeat(64)},{sha256:'gg'}]){const m=fixture();m.files[0]={...m.files[0]!,...changed};assert.throws(()=>workerExecutionPins(m,root,commit),/EXECUTION_(PATH|PATH_BINDING|DIGEST)/);}
 const duplicate=fixture();duplicate.files.push({...duplicate.files[0]!});assert.throws(()=>workerExecutionPins(duplicate,root,commit),/EXECUTION_PATH/);
 const large=fixture();while(large.files.length<=300)large.files.push({relativePath:`api/src/extra-${large.files.length}.ts`,path:root+`/api/src/extra-${large.files.length}.ts`,sha256:hash});assert.throws(()=>workerExecutionPins(large,root,commit),/EXECUTION_MANIFEST/);
});

test('audited execution list covers the current worker relative import and literal URL dependency graph',async()=>{
 const seen=new Set<string>(),pending=['api/scripts/work-linux-testnet-policy.ts'];
 while(pending.length){const file=pending.pop()!;if(seen.has(file))continue;seen.add(file);if(!/\.(ts|mjs)$/.test(file))continue;
  const source=await readFile(new URL('../../'+file,import.meta.url),'utf8');
  const imports=[...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(['"])(\.[^'"]+)\1/g)].map(m=>m[2]!);
  const assets=[...source.matchAll(/new URL\((['"])(\.[^'"]+)\1\s*,\s*import\.meta\.url\)/g)].map(m=>m[2]!);
  for(const spec of [...imports,...assets])pending.push(posix.normalize(posix.join(posix.dirname(file),spec)));
 }
 assert.deepEqual([...seen].sort(),[...POLICY_WORKER_EXECUTION_PATHS].sort());
});


test('Root execution epoch is separate from immutable admission context and fails closed on malformed or regressed SQL mapping',async()=>{
 const policy='a'.repeat(64),original='242';let calls=0;
 const unmigrated={query:async()=>({rows:[{installed:false}]})};assert.equal(await readPolicyExecutionEpoch(unmigrated,policy,original),'242');
 const resumed={query:async(sql:string,args?:any[])=>{calls++;if(sql.includes('to_regprocedure'))return {rows:[{installed:true}]};assert(Buffer.isBuffer(args?.[0])&&args![0].toString('hex')===policy);return {rows:[{epoch:'244'}]};}};
 assert.equal(await readPolicyExecutionEpoch(resumed,policy,original),'244');assert.equal(original,'242');assert.equal(calls,2);
 for(const epoch of ['241','0','bad',null])await assert.rejects(readPolicyExecutionEpoch({query:async(sql:string)=>({rows:[sql.includes('to_regprocedure')?{installed:true}:{epoch}]})},policy,original),/EXECUTION_EPOCH/);
});

test('original signer metadata permits reviewed Root 0640 while new private fast authority remains 0600',async()=>{
 const worker=await readFile(new URL('../scripts/work-linux-testnet-policy.ts',import.meta.url),'utf8'),checker=await readFile(new URL('../scripts/check-fast-testnet-idle-launch.ts',import.meta.url),'utf8');
 assert.match(worker,/await publicPin\(forward\.c\.signerConfig\);/);assert.match(worker,/readFile\(forward\.c\.signerConfig\.path\)/);assert.doesNotMatch(worker,/protectedBytes\(forward\.c\.signerConfig\)/);
 assert.match(checker,/pinned\(forward\.c\.signerConfig\)/);assert.doesNotMatch(checker,/pinned\(forward\.c\.signerConfig,true\)/);
 assert.match(worker,/protectedBytes\(a\.signerConfig\)/);assert.match(worker,/protectedBytes\(c\.forwardFastExecution\)/);assert.match(checker,/pinned\(fast\.signerConfig,true\)/);
 // Exercise the actual worker permission gates with injected filesystem metadata;
 // no Linux files, keys, service, profile or financial process is accessed.
 let mode=0o100640,uid=0;
 const lstat=async()=>({uid,mode,size:2,isFile:()=>true,isSymbolicLink:()=>false}),realpath=async(path:string)=>path,read=async()=>Buffer.from('{}'),need=(v:unknown,c:string)=>{if(!v)throw Error(c);},sha=()=>hash;
 const load=(name:string)=>{const source=worker.split('\n').find(line=>line.startsWith('async function '+name+'('));assert(source);return new Function('lstat','realpath','readFile','need','sha','return ('+source.replace('(pin:Pin)','(pin)')+')')(lstat,realpath,read,need,sha) as (pin:{path:string;sha256:string})=>Promise<unknown>;};
 const metadata=load('publicPin'),privateAuthority=load('protectedBytes'),pin={path:'/opt/zeeswap-testnet/secrets/original-metadata.private.json',sha256:hash};
 await metadata(pin);await assert.rejects(privateAuthority(pin),/POLICY_WORKER_ROOT_FILE/);
 mode=0o100600;await metadata(pin);await privateAuthority(pin);
 mode=0o100660;await assert.rejects(metadata(pin),/POLICY_WORKER_PUBLIC_CODE_CHANGED/);
 mode=0o100640;uid=986;await assert.rejects(metadata(pin),/POLICY_WORKER_PUBLIC_CODE_CHANGED/);
});
