import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {posix} from 'node:path';
import {POLICY_WORKER_EXECUTION_PATHS,workerExecutionRoot,workerExecutionPins,requireWorkerPolicyCommit} from '../src/testnet-policy-execution.ts';
const root='/opt/zeeswap-testnet/releases/swap-live-fixture-r1/app',commit='a'.repeat(40),hash='b'.repeat(64);
const fixture=():{publicCommit:string;files:{relativePath:string;path:string;sha256:string}[]}=>({publicCommit:commit,files:POLICY_WORKER_EXECUTION_PATHS.map(relativePath=>({relativePath,path:root+'/'+relativePath,sha256:hash}))});

test('fresh execution root is independent of original native profile release and policy-bound',()=>{
 assert.equal(workerExecutionRoot(root+'/api/scripts/work-linux-testnet-policy.ts',root),root);
 const pins=workerExecutionPins(fixture(),root,commit);assert.equal(pins.length,47);assert(pins.every(p=>p.path.startsWith(root+'/')));requireWorkerPolicyCommit(commit,commit);
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
