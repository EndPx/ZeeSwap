import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ChefAdapter,type ChefConfig} from '../../src/integrations/observation/chef.ts';
import {ChefWalletBridge} from '../../src/integrations/observation/chef-wallet-bridge.ts';
import {validateRange,validateChefHistoricalRange} from '../../src/integrations/observation/types.ts';
import {loadLinuxChefRuntime,parseChefRecoveryArgs} from '../../scripts/recover-linux-chef.ts';
import {appendChefRecoveryProof,chefRecoveryCoverageStatus,chefRecoverySnapshot,extendChefRecoveryTarget,nextChefRecoveryRange,
 validateChefRecoveryJournal,withChefRecoveryJournal,type ChefRecoveryIdentity,type ChefRecoveryJournal} from '../../src/integrations/observation/chef-recovery.ts';
const hash=(n:number)=>n.toString(16).padStart(64,'0'),time=new Date().toISOString();
const header=(height:number)=>({height,hash:hash(height),parentHash:hash(height-1),time});
function fixture(){
 let checkpoint=2599,undoFloor=100,generation='fixture-generation';const queried=new Set<number>();
 const identity:ChefRecoveryIdentity={project:'fixture',generation,policy:{adapter:'zeer-chef',network:'zcash-testnet',birthday:100,
  registryDigest:hash(1),projectionDigest:hash(2),canonicalSourceId:'independent',accountFingerprint:'fixture-account',maxBlocks:1000,maxObservations:1000}};
 const current=async()=>({generation,checkpoint:{height:checkpoint,hash:hash(checkpoint)}});
 const canonical={sample:async()=>({head:header(checkpoint+1),checkedAt:new Date().toISOString(),sourceId:'independent'}),header:async(h:number)=>header(h)};
 const config:ChefConfig={url:'http://localhost/',token:'fixture',project:'fixture',policy:identity.policy,canonical,
  fetch:async(_url,init)=>{
   if(init?.body){const {variables:{from,through}}=JSON.parse(String(init.body));for(let h=from;h<=through;h++)queried.add(h);
    const items=[1200,2090].filter(h=>h>=from&&h<=through).map(h=>({id:String(h),network:'zcash-testnet',txid:hash(h+5000),pool:'ironwood',outputIndex:0,
     blockHeight:h,blockHash:hash(h),valueZat:'100000',receiverBytes:'12'.repeat(43),memoHex:'00'.repeat(512),accountFingerprint:'fixture-account',scope:'external',origin:'unknown',coinbase:false}));
    return Response.json({data:{ReadableNoteList:{items,nextCursor:null}}});}
   return Response.json({project:'fixture',generation,revision:'1',checkpoint:{height:checkpoint,hash:hash(checkpoint),anchorHash:null,status:'ready',undoFloor},lastCommitAt:null,
    source:{status:'available',checkedAt:new Date().toISOString(),prepIndexedHeight:checkpoint,sourceObservedHeight:checkpoint+1,sourceObservedAt:Math.floor(Date.now()/1000)}});
  }};
 const bridge=new ChefWalletBridge(async(txid,h)=>({rawHex:'ab',blockHash:hash(h),notes:[{txid,index:0,pool:'ironwood',amount:'100000',receiver:'utest1fixture',memo:null,
  shieldedSource:true,receiverBytes:'12'.repeat(43),memoHex:'00'.repeat(512)}]}));config.classify=bridge.classify;
 const initial=():ChefRecoveryJournal=>({version:1,identity,target:header(checkpoint),proofs:[]});
 async function advance(j:ChefRecoveryJournal){const range=nextChefRecoveryRange(j)!;const result=await new ChefAdapter(config).traverse(range.fromHeight,range.throughHeight);
  assert.equal(result.status,'READY_SHADOW');if(result.status!=='READY_SHADOW')throw Error('fixturewait');
  return appendChefRecoveryProof(j,identity,header(checkpoint),result.batch,bridge.snapshot(result.batch,identity.policy,Date.now(),{witness:result.historicalWitness!,project:identity.project}),Date.now(),result.historicalWitness);}
 return {identity,config,canonical,current,queried,initial,advance,bridge,setCheckpoint:(h:number)=>{checkpoint=h;},setUndoFloor:(h:number)=>{undoFloor=h;},setGeneration:(s:string)=>{generation=s;}};
}

test('historical selected range keeps actual newer rollback floor with explicit canonical checkpoint witness only',async()=>{
 const f=fixture();f.setUndoFloor(2400);
 const result=await new ChefAdapter(f.config).traverse(100,1099);assert.equal(result.status,'READY_SHADOW');if(result.status!=='READY_SHADOW')throw Error('wait');
 const {batch,historicalWitness:w}=result;assert.ok(w);assert.equal(batch.coverage.recoveryFloor,2400);assert.equal(w.actualUndoFloor,2400);assert.deepEqual(w.actualCheckpoint,header(2599));
 assert.throws(()=>validateRange(batch,f.identity.policy,Date.now()),/INVALID_RANGE/);
 assert.throws(()=>f.bridge.snapshot(batch,f.identity.policy),/INVALID_RANGE/);
 const snapshot=f.bridge.snapshot(batch,f.identity.policy,Date.now(),{witness:w,project:'fixture'});
 assert.equal(snapshot.scannedHeight,1099);assert.equal(snapshot.blocks.some(b=>b.height===2599),false);
 let j=appendChefRecoveryProof(f.initial(),f.identity,header(2599),batch,snapshot,Date.now(),w);
 assert.equal(chefRecoveryCoverageStatus(j).admissionReady,false);
 await assert.rejects(chefRecoverySnapshot(j,f.identity,f.canonical,[],f.current,AbortSignal.timeout(1000)),/INCOMPLETE/);
 while(nextChefRecoveryRange(j))j=await f.advance(j);
 assert.equal(j.proofs.length,3);assert.equal((await chefRecoverySnapshot(j,f.identity,f.canonical,[],f.current,AbortSignal.timeout(1000))).scannedHeight,2599);
});

test('historical witness refuses wrong identities, false floors, omitted history and forged checkpoint',async()=>{
 const f=fixture();f.setUndoFloor(2400);const r=await new ChefAdapter(f.config).traverse(100,1099);if(r.status!=='READY_SHADOW')throw Error('wait');
 const w=r.historicalWitness!,validate=(batch=r.batch,witness=w)=>validateChefHistoricalRange(batch,f.identity.policy,Date.now(),witness,'fixture');
 for(const witness of [{...w,project:'other'},{...w,generation:'other'},{...w,revision:'2'},{...w,actualUndoFloor:100},
  {...w,selectedContentDigest:hash(99)},{...w,actualCheckpoint:header(2000)}])assert.throws(()=>validate(r.batch,witness),/CHEF_HISTORY/);
 assert.throws(()=>validate({...r.batch,coverage:{...r.batch.coverage,sourceHead:header(2599)}},{...w,actualCheckpoint:{...header(2599),hash:hash(9999)}}),/CHECKPOINT_MISMATCH/);
 assert.throws(()=>validate({...r.batch,headers:r.batch.headers.slice(1)}),/COVERAGE_GAP/);
 const snapshot=f.bridge.snapshot(r.batch,f.identity.policy,Date.now(),{witness:w,project:'fixture'});
 assert.throws(()=>appendChefRecoveryProof(f.initial(),f.identity,header(2599),r.batch,snapshot),/INVALID_RANGE/);
 assert.throws(()=>appendChefRecoveryProof(f.initial(),f.identity,header(2599),r.batch,snapshot,Date.now(),{...w,actualCheckpoint:{...w.actualCheckpoint,hash:hash(9999)}}),/WITNESS_TARGET_MISMATCH/);
 const j=appendChefRecoveryProof(f.initial(),f.identity,header(2599),r.batch,snapshot,Date.now(),w),changed=structuredClone(j);
 changed.proofs[0]!.historicalWitness!.actualUndoFloor=100;
 assert.throws(()=>validateChefRecoveryJournal(changed,f.identity,header(2599)),/PROOF_CHANGED/);
 const fabricated=structuredClone(r.batch);fabricated.coverage.recoveryFloor=100;
 assert.throws(()=>validate(fabricated),/CHECKPOINT_MISMATCH/);
});

test('final publication independently rechecks historical full checkpoint witness without publishing it as a selected header',async()=>{
 const f=fixture();f.setCheckpoint(2502);f.setUndoFloor(2400);const r=await new ChefAdapter(f.config).traverse(100,1099);if(r.status!=='READY_SHADOW')throw Error('wait');
 // Chef can move ahead of a fixed recovery target. The independent current
 // checkpoint remains a separate witness, never fake selected-range coverage.
 const target=header(2500),w=r.historicalWitness!,snapshot=f.bridge.snapshot(r.batch,f.identity.policy,Date.now(),{witness:w,project:'fixture'});
 let j:ChefRecoveryJournal={version:1,identity:f.identity,target,proofs:[]};
 j=appendChefRecoveryProof(j,f.identity,target,r.batch,snapshot,Date.now(),w);
 while(nextChefRecoveryRange(j)){
  const range=nextChefRecoveryRange(j)!,part=await new ChefAdapter(f.config).traverse(range.fromHeight,range.throughHeight);if(part.status!=='READY_SHADOW')throw Error('wait');
  j=appendChefRecoveryProof(j,f.identity,target,part.batch,f.bridge.snapshot(part.batch,f.identity.policy,Date.now(),{witness:part.historicalWitness!,project:'fixture'}),Date.now(),part.historicalWitness);
 }
 const canonical={...f.canonical,sample:async()=>({head:header(2503),checkedAt:new Date().toISOString(),sourceId:'independent'}),header:async(h:number)=>h===2502?{...header(h),hash:hash(9999)}:header(h)};
 await assert.rejects(chefRecoverySnapshot(j,f.identity,canonical,[],async()=>({generation:f.identity.generation,checkpoint:{height:2500,hash:hash(2500)}}),AbortSignal.timeout(1000)),/WITNESS_REORG/);
});

test('2500-block native bridge recovery persists and restarts without skipped chunks or partial publication',async()=>{
 const f=fixture(),dir=await mkdtemp(join(tmpdir(),'chef-recovery-'));let j=f.initial();
 try{
  j=await f.advance(j);assert.equal(chefRecoveryCoverageStatus(j).admissionReady,false);
  assert.equal(chefRecoveryCoverageStatus(j).status,'RECOVERING_PRIVATE_COVERAGE');
  await assert.rejects(chefRecoverySnapshot(j,f.identity,f.canonical,[],f.current,AbortSignal.timeout(1000)),/CHEF_RECOVERY_INCOMPLETE/);
  await withChefRecoveryJournal(dir,async io=>{assert.equal(await io.read(),null);await io.write(j);});
  await withChefRecoveryJournal(dir,async io=>{j=validateChefRecoveryJournal((await io.read())!,f.identity,header(2599));while(nextChefRecoveryRange(j)){j=await f.advance(j);await io.write(j);}});
  assert.equal(j.proofs.length,3);assert.deepEqual(j.proofs.map(p=>[p.batch.coverage.fromHeight,p.batch.coverage.through.height]),[[100,1099],[1091,2090],[2082,2599]]);
  assert.equal(f.queried.size,2500);for(let h=100;h<=2599;h++)assert.equal(f.queried.has(h),true);
  assert.equal(chefRecoveryCoverageStatus(j).status,'COVERAGE_COMPLETE_AWAITING_LIVE_WINDOW');
  const snapshot=await chefRecoverySnapshot(j,f.identity,f.canonical,[89,101,1200],f.current,AbortSignal.timeout(1000));
  assert.deepEqual(snapshot.blocks.map(b=>b.height),[89,101,1200,2090,2590,2599]);assert.equal(snapshot.outputs.length,2);
  assert.deepEqual(snapshot.outputs.map(o=>o.height),[1200,2090]);
  assert.equal(chefRecoveryCoverageStatus(j).admissionReady,false);
  assert.equal(JSON.parse(await readFile(join(dir,'journal.private.json'),'utf8')).proofs.length,3);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('restart refuses identity, generation, proof mutation, omitted chunks and canonical reorg',async()=>{
 const f=fixture();let j=await f.advance(f.initial());j=await f.advance(j);
 assert.throws(()=>validateChefRecoveryJournal(j,{...f.identity,project:'other'},header(2599)),/IDENTITY_CHANGED/);
 assert.throws(()=>validateChefRecoveryJournal(j,{...f.identity,generation:'new'},header(2599)),/IDENTITY_CHANGED/);
 assert.throws(()=>validateChefRecoveryJournal(j,f.identity,{...header(2599),hash:hash(9999)}),/TARGET_REORG/);
 const changed=structuredClone(j);changed.proofs[0]!.snapshot.outputs.push({} as never);
 assert.throws(()=>validateChefRecoveryJournal(changed,f.identity,header(2599)),/PROOF_CHANGED/);
 assert.throws(()=>validateChefRecoveryJournal({...j,proofs:[j.proofs[1]!]},f.identity,header(2599)),/PROOF_CHANGED/);
 f.setGeneration('new');await assert.rejects(f.advance(j),/GENERATION_CHANGED/);
});

test('new tail must be processed before aggregate snapshot; extension retains exact proven prefix',async()=>{
 const f=fixture();let j=f.initial();while(nextChefRecoveryRange(j))j=await f.advance(j);
 f.setCheckpoint(2601);
 await assert.rejects(chefRecoverySnapshot(j,f.identity,f.canonical,[],f.current,AbortSignal.timeout(1000)),/CURRENT_TAIL_REQUIRED/);
 j=extendChefRecoveryTarget(j,f.identity,header(2599),header(2601));assert.equal(chefRecoveryCoverageStatus(j).status,'RECOVERING_PRIVATE_COVERAGE');
 assert.deepEqual(nextChefRecoveryRange(j),{fromHeight:2591,throughHeight:2601});j=await f.advance(j);
 assert.equal(j.proofs.length,4);assert.equal((await chefRecoverySnapshot(j,f.identity,f.canonical,[],f.current,AbortSignal.timeout(1000))).scannedHeight,2601);
});

test('finite traversal retains independent full Chef checkpoint verification and rejects future bounds',async()=>{
 const f=fixture();await assert.rejects(new ChefAdapter(f.config).traverse(100,2600),/CHEF_FINITE_RANGE_AHEAD/);
 await assert.rejects(new ChefAdapter({...f.config,canonical:{...f.canonical,header:async h=>h===2599?{...header(h),hash:hash(9)}:header(h)}}).traverse(100,1099),/CANONICAL_CHECKPOINT_MISMATCH/);
});

test('fresh Chef timestamps cannot renew SQL when its complete checkpoint lags canonical head',async()=>{
 const f=fixture();let j=f.initial();while(nextChefRecoveryRange(j))j=await f.advance(j);
 const lagging={...f.canonical,sample:async()=>({head:header(3599),checkedAt:new Date().toISOString(),sourceId:'independent'})};
 await assert.rejects(chefRecoverySnapshot(j,f.identity,lagging,[],f.current,AbortSignal.timeout(1000)),/CHEF_RECOVERY_SOURCE_LAG/);
 const boundary={...f.canonical,sample:async()=>({head:header(2605),checkedAt:new Date().toISOString(),sourceId:'independent'})};
 assert.equal((await chefRecoverySnapshot(j,f.identity,boundary,[],f.current,AbortSignal.timeout(1000))).scannedHeight,2599);
});

test('recovery CLI requires explicit unique bounded steps and rejects transport outside Linux before DB',async()=>{
 assert.deepEqual(parseChefRecoveryArgs(['--config','/opt/zeeswap-testnet/secrets/chef-runtime.private.json','--step','recover','--max-chunks','3']),
  {path:'/opt/zeeswap-testnet/secrets/chef-runtime.private.json',step:'recover',maxChunks:3});
 for(const args of [[],['--oncefoo'],['--config','relative','--step','recover'],['--config','/x','--step','recover','--step','recover'],
  ['--config','/x','--step','publish','--max-chunks','1'],['--config','/x','--step','recover','--max-chunks','100'],['--config','/x','--step','daemon']])assert.throws(()=>parseChefRecoveryArgs(args),/CHEF_RECOVERY_CLI/);
 await assert.rejects(loadLinuxChefRuntime('/wrong'),/CHEF_LINUX_EXACT_CONFIG/);
});

test('journal single-writer lock cannot be stolen and releases after ordinary failure',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'chef-recovery-lock-'));
 try{
  await assert.rejects(withChefRecoveryJournal(dir,async()=>{await assert.rejects(withChefRecoveryJournal(dir,async()=>null),/EEXIST/);throw Error('ordinaryfailure');}),/ordinaryfailure/);
  await withChefRecoveryJournal(dir,async io=>assert.equal(await io.read(),null));
 }finally{await rm(dir,{recursive:true,force:true});}
});
