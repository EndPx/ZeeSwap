import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeOrder,digest} from '../src/bridge/model.ts';
import {nativeDigest,nativeAuthorityOrder,verifyNativeAuthority,verifyNativeBroadcastGuard,type NativeBridgeRequest} from '../src/bridge/adapters/native-authority.ts';
import {NativeBridgeCommand} from '../src/bridge/adapters/native.ts';
import type {CanonicalBridgeBase} from '../src/bridge/adapters/base.ts';

const hex=(n:string)=>'0x'+n.repeat(64),address=(n:string)=>'0x'+n.repeat(40);
function fixture(){
 const o=makeOrder({direction:'ZEETAZ_TO_TAZ',amountAtomic:'100000',recipient:'utest1synthetic',payer:address('a')},'','key',Date.now());
 const anchor={height:100,hash:hex('1'),observedAt:new Date().toISOString()};
 const q:NativeBridgeRequest={version:1,purpose:'bridge-redemption',intentId:digest(['bridge-delivery-v1',o.id,o.commitment]),orderId:o.id,bridgeId:o.commitment,recipient:o.recipient,amountZatoshi:o.amountAtomic,maxFeeZatoshi:'10000',payoutCommitment:o.commitment,salt:o.salt,commitmentInput:{direction:o.direction,amountAtomic:o.amountAtomic,recipient:o.recipient,payer:o.payer},base:{chainId:84532,contract:address('b'),runtimeCodeHash:hex('2'),payer:o.payer!,amountAtomic:o.amountAtomic,transactionHash:hex('3') as `0x${string}`,blockNumber:'90',blockHash:hex('4'),operator:address('c'),authorizer:address('d'),admin:address('e')},paired:{base:anchor,zcash:anchor}};
 return {q,o};
}
test('native digest has independently calculated Python sorted-key SHA256 vector',()=>{
 assert.equal(nativeDigest({z:1,a:{y:2,b:[3,1]}}),'0097ec22617d548ea533a8d385c76a41b3211e73197762b226676c2a28317f91');
});
test('broadcast guard refuses UNKNOWN, wrong original bytes and rolled-back approval',()=>{
 const {q}=fixture(),approvedDigest=nativeDigest(q),prepared={txid:'f'.repeat(64),rawTransaction:'010203'};
 const journal={request:q,approvedDigest,state:'PREPARED',prepared},guard={operationId:q.orderId,approvedDigest,txid:prepared.txid,rawSha256:createHash('sha256').update(Buffer.from(prepared.rawTransaction,'hex')).digest('hex')};
 assert.equal(verifyNativeBroadcastGuard(q,approvedDigest,journal,guard).authorized,true);
 for(const state of ['SIGNING_INTENT','BROADCAST_UNKNOWN','BROADCAST_ACKNOWLEDGED','DELIVERY_CONFIRMED'])assert.throws(()=>verifyNativeBroadcastGuard(q,approvedDigest,{...journal,state},guard),/ORIGINAL_REQUIRED/);
 assert.throws(()=>verifyNativeBroadcastGuard(q,approvedDigest,{...journal,prepared:{...prepared,rawTransaction:'010204'}},guard),/ORIGINAL_REQUIRED/);
 assert.throws(()=>verifyNativeBroadcastGuard(q,approvedDigest,{...journal,approvedDigest:'0'.repeat(64)},guard),/ORIGINAL_REQUIRED/);
});
test('native process adapter cannot execute on an unqualified Windows host',{skip:process.platform!=='win32'},async()=>{
 const {o}=fixture(),pin={path:'unused',sha256:'0'.repeat(64)};
 const adapter=new NativeBridgeCommand({python:pin,worker:pin,profile:pin,approvedRequest:pin,approvedDigest:pin.sha256});
 await assert.rejects(()=>adapter.run('prepare',o),/DEDICATED_LINUX_REQUIRED/);
});
test('approval and salted private terms cannot be changed even with renewed digest',()=>{
 const {q}=fixture();assert.equal(nativeAuthorityOrder(q,nativeDigest(q)).id,q.orderId);
 const changed=structuredClone(q);changed.recipient='utest1other';assert.throws(()=>nativeAuthorityOrder(changed,nativeDigest(changed)),/TERMS/);
 const payer=structuredClone(q);payer.commitmentInput.payer=address('f');payer.base.payer=address('f');assert.throws(()=>nativeAuthorityOrder(payer,nativeDigest(payer)),/COMMITMENT/);
 assert.throws(()=>nativeAuthorityOrder(q,'0'.repeat(64)),/BINDING/);
});
test('authority verifies original checkpoint and exact receipt then invokes fresh ACK exclusion',async()=>{
 const {q}=fixture();let canonicalChecks=0,reads=0;
 const base={profile:{contractAddress:q.base.contract,runtimeCodeHash:q.base.runtimeCodeHash,admin:q.base.admin,operator:q.base.operator,authorizer:q.base.authorizer,principalAccount:'bridge:p',feeAccount:'bridge:f'},settlementAnchor:async()=>q.paired.base,clients:[0,1].map(()=>({getBlock:async()=>({hash:q.paired.base.hash}),getTransaction:async()=>({input:'0x1234'})})),verify:async()=>({receipt:{blockHeight:90,blockHash:q.base.blockHash}}),assertCanonicalOrder:async()=>{canonicalChecks++;},readAt:async()=>{reads++;}} as unknown as CanonicalBridgeBase;
 const proof=await verifyNativeAuthority(base,q,nativeDigest(q));assert.equal(proof.zcashRequiresNativeRecheck,true);assert.equal(canonicalChecks,1);assert.equal(reads,1);
 base.assertCanonicalOrder=async()=>{throw Error('BRIDGE_REDEMPTION_ALREADY_ACKNOWLEDGED');};await assert.rejects(()=>verifyNativeAuthority(base,q,nativeDigest(q)),/ACKNOWLEDGED/);
 base.clients[1].getBlock=async()=>({hash:hex('f')}) as any;await assert.rejects(()=>verifyNativeAuthority(base,q,nativeDigest(q)),/CHECKPOINT_REORG/);
});
