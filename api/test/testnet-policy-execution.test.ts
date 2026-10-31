import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {posix} from 'node:path';
import {POLICY_WORKER_EXECUTION_PATHS,workerExecutionRoot,workerExecutionPins,requireWorkerPolicyCommit,requireForwardFastExecution,requireForwardFastSignerConfig,readPolicyExecutionEpoch,type ForwardFastExecutionApproval} from '../src/testnet-policy-execution.ts';
const root='/opt/zeeswap-testnet/releases/swap-live-fixture-r1/app',commit='a'.repeat(40),hash='b'.repeat(64);
const fixture=():{publicCommit:string;files:{relativePath:string;path:string;sha256:string}[]}=>({publicCommit:commit,files:POLICY_WORKER_EXECUTION_PATHS.map(relativePath=>({relativePath,path:root+'/'+relativePath,sha256:hash}))});

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
 const pins=workerExecutionPins(fixture(),root,commit);assert.equal(pins.length,48);assert(POLICY_WORKER_EXECUTION_PATHS.includes('api/src/main-database-relocation.ts'));assert(pins.every(p=>p.path.startsWith(root+'/')));requireWorkerPolicyCommit(commit,commit);
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
