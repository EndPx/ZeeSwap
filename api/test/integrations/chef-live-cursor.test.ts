import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chefLiveFrom,commitChefLiveCycle,type ChefLiveCursor} from '../../src/integrations/observation/chef-live-cursor.ts';
import {contentDigest,digest,type ReplaceRange,type ZcashNote} from '../../src/integrations/observation/types.ts';
import type {ChefRecoveryIdentity} from '../../src/integrations/observation/chef-recovery.ts';
import type {Snapshot} from '../../src/observer.ts';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {persistChefReceiptEvidence} from '../../src/integrations/observation/chef-receipt-evidence.ts';
const hash=(n:number)=>n.toString(16).padStart(64,'0'),time=new Date().toISOString(),header=(height:number)=>({height,hash:hash(height),parentHash:hash(height-1),time});
const identity:ChefRecoveryIdentity={project:'fixture',generation:'fixture-gen',policy:{adapter:'zeer-chef',network:'zcash-testnet',birthday:100,registryDigest:hash(1),projectionDigest:hash(2),canonicalSourceId:'fixture',accountFingerprint:'fixture'}};
const headers=Array.from({length:30},(_,i)=>header(101+i));
const observations:ZcashNote[]=[{kind:'zcash-note',network:'zcash-testnet',receiptId:'fixture',txid:hash(999),pool:'ironwood',outputIndex:0,block:header(112),amountAtomic:'100000',receiverBytes:'12'.repeat(43),memoHex:'00'.repeat(512),accountFingerprint:'fixture',scope:'external',origin:'unknown',coinbase:false,sourcePrivacy:'shielded',privacyEvidenceDigest:hash(9)}];
const batch:ReplaceRange={headers,observations,coverage:{protocol:'zee-observation-v1',adapter:'zeer-chef',network:'zcash-testnet',registryDigest:hash(1),projectionDigest:hash(2),generation:'fixture-gen',revision:'1',fromHeight:101,through:header(130),complete:true,readStartedAt:time,readCompletedAt:time,sourceSampledAt:time,sourceHead:header(131),recoveryFloor:100,canonicalCheckAt:time,canonicalSourceId:'fixture',contentDigest:contentDigest({headers,observations})}};
const snapshot:Snapshot={schemaVersion:1,network:'zcash-testnet',consensusBranch:'77190ad9',observedAt:time,scannedHeight:130,tipHash:hash(130),blocks:headers.map(({height,hash,time})=>({height,hash,time})),outputs:[{txid:hash(999),index:0,pool:'ironwood',amount:'100000',receiver:'utest1fixture',memo:null,height:112,blockHash:hash(112),blockTime:time,shieldedSource:true}]};
const cursor:ChefLiveCursor={version:1,identityDigest:digest(identity),processedThrough:110,tipHash:hash(110),snapshotDigest:hash(1)};
const canonical={sample:async()=>({head:header(131),checkedAt:time,sourceId:'fixture'}),header:async(h:number)=>header(h)};
test('SQL checkpoint advance followed by failed output ingestion cannot advance durable rolling cursor',async()=>{
 let saves=0,sqlFrontier=110;
 await assert.rejects(commitChefLiveCycle(cursor,identity,batch,snapshot,[],canonical,async incoming=>{sqlFrontier=incoming.scannedHeight;throw Error('failedaftercheckpoint');},async()=>{saves++;},AbortSignal.timeout(1000)),/failedaftercheckpoint/);
 assert.equal(sqlFrontier,130);assert.equal(saves,0);assert.equal(cursor.processedThrough,110);assert.equal(chefLiveFrom(cursor,identity,130),101);
 const replayed:number[]=[];
 const result=await commitChefLiveCycle(cursor,identity,batch,snapshot,[],canonical,async incoming=>{replayed.push(...incoming.outputs.map(o=>o.height));return {observedOutputs:1};},async next=>{saves++;assert.equal(next.processedThrough,130);},AbortSignal.timeout(1000));
 assert.deepEqual(replayed,[112]);assert.equal(saves,1);assert.equal(chefLiveFrom(result.cursor,identity,130),121);
});
test('cursor identity/generation/reorg/lag and over-1000 gap refuse before any SQL candidate',async()=>{
 let writes=0;const ingest=async()=>{writes++;},save=async()=>{writes++;};
 assert.throws(()=>chefLiveFrom({...cursor,identityDigest:hash(9)},identity,130),/CURSOR_IDENTITY/);
 assert.throws(()=>chefLiveFrom(cursor,identity,2000),/REQUIRES_BOUNDED_RECOVERY/);
 await assert.rejects(commitChefLiveCycle(cursor,identity,{...batch,coverage:{...batch.coverage,generation:'other'}},snapshot,[],canonical,ingest,save,AbortSignal.timeout(1000)),/GENERATION_CHANGED/);
 await assert.rejects(commitChefLiveCycle(cursor,identity,batch,snapshot,[],{...canonical,header:async h=>h===110?{...header(h),hash:hash(9)}:header(h)},ingest,save,AbortSignal.timeout(1000)),/CURSOR_REORG/);
 await assert.rejects(commitChefLiveCycle(cursor,identity,{...batch,coverage:{...batch.coverage,sourceHead:header(137)}},snapshot,[],canonical,ingest,save,AbortSignal.timeout(1000)),/SOURCE_LAG/);
 assert.equal(writes,0);
});
test('private native receipt artifact is one-output immutable provenance, never renewed or approved as capital',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'chef-receipt-'));
 try{
  const [first]=await persistChefReceiptEvidence(directory,identity.project,identity.policy.accountFingerprint!,batch,snapshot);
  const bytes=await readFile(first!.path,'utf8'),proof=JSON.parse(bytes);
  assert.equal(proof.snapshot.outputs.length,1);assert.deepEqual(proof.snapshot.outputs,snapshot.outputs);
  assert.deepEqual(proof.snapshot.blocks.map((b:any)=>b.height),[112,121,130]);assert.equal(proof.sourceCoverageDigest,batch.coverage.contentDigest);
  assert.equal(proof.sourceFingerprint,identity.policy.accountFingerprint);assert.equal(proof.snapshot.observedAt,snapshot.observedAt);
  const second=await persistChefReceiptEvidence(directory,identity.project,identity.policy.accountFingerprint!,batch,{...snapshot,observedAt:new Date().toISOString()});
  assert.equal(second[0]!.path,first!.path);assert.equal(await readFile(first!.path,'utf8'),bytes);
  assert.equal('capitalApproved' in proof,false);assert.equal('settled' in proof,false);
  await writeFile(first!.path,JSON.stringify({...proof,snapshot:{...proof.snapshot,outputs:[{...snapshot.outputs[0],amount:'100001'}]}}));
  await assert.rejects(persistChefReceiptEvidence(directory,identity.project,identity.policy.accountFingerprint!,batch,snapshot),/CHEF_RECEIPT_IMMUTABLE_IDENTITY_CHANGED/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
