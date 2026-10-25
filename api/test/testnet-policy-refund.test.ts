import test from 'node:test';import assert from 'node:assert/strict';
import {refundQuery,validatePolicyWorkerOrderContext,type PolicyWorkerOrderContext} from '../src/testnet-policy-refund.ts';
import {validateLinuxCapitalApproval} from '../src/linux-native-dispatch.ts';
const id='12345678-1234-4234-8234-123456789abc';
const context=():PolicyWorkerOrderContext=>({version:1,orderId:id,policySha256:'a'.repeat(64),rootProofSha256:'a'.repeat(64),activeEpoch:'220',workerBackendPid:321,rootProofPath:'/opt/zeeswap-testnet/state/service-policy/fixture.private.json'});
test('legacy refund action remains the original paused kernel; explicit policy inserts immutable hash as a value',()=>{
 assert.deepEqual(refundQuery('storeZcash',id,['hash','bytes','10000','500']),{sql:'SELECT zee.store_source_refund_zcash($1,$2,$3,$4,$5)',args:[id,'hash','bytes','10000','500']});
 const p=context(),q=refundQuery('storeZcash',id,['hash','bytes','10000','500'],p);assert.equal(q.sql,'SELECT zee.store_testnet_policy_source_refund_zcash($1,$2,$3,$4,$5,$6)');assert.deepEqual(q.args,[id,Buffer.from(p.policySha256,'hex'),'hash','bytes','10000','500']);
 assert.throws(()=>refundQuery('x);SELECT dangerous' as any,id),/ACTION/);
});
test('old discharged refund capital is available only to an explicitly bound policy refund',()=>{
 const p:any={roots:{state:'/opt/zeeswap-testnet/state'},identity:{sourceFingerprint:'b'.repeat(64)},immutable:{chefOpeningProof:{sha256:'c'.repeat(64)}}},directory=p.roots.state+'/refund-orders/'+id;
 const approval={version:1,orderId:id,sourceFingerprint:p.identity.sourceFingerprint,openingProofSha256:p.immutable.chefOpeningProof.sha256,sources:[{kind:'refund-source',orderId:id,path:directory+'/proofs/own.private.json',sha256:'d'.repeat(64)},{kind:'confirmed-refund-own-change',orderId:'87654321-1234-4234-8234-123456789abc',path:directory+'/proofs/old.private.json',sha256:'e'.repeat(64)}]};
 assert.throws(()=>validateLinuxCapitalApproval(p,'refund',id,approval),/EXPLICIT_PROOF_SCOPE/);
 validateLinuxCapitalApproval(p,'refund',id,approval,context());
 assert.throws(()=>validateLinuxCapitalApproval(p,'refund',id,{...approval,sources:approval.sources.slice(1)},context()),/OWN_SOURCE_REQUIRED/);
});
test('policy refund cannot change order, raw Root proof, worker lease or escape Root policy directory',()=>{
 validatePolicyWorkerOrderContext(context(),id);
 for(const mutate of[(p:PolicyWorkerOrderContext)=>p.orderId='87654321-1234-4234-8234-123456789abc',(p:PolicyWorkerOrderContext)=>p.rootProofSha256='b'.repeat(64),(p:PolicyWorkerOrderContext)=>p.workerBackendPid=0,(p:PolicyWorkerOrderContext)=>p.workerBackendPid=1.5,(p:PolicyWorkerOrderContext)=>p.activeEpoch='0',(p:PolicyWorkerOrderContext)=>p.rootProofPath='/opt/zeeswap-testnet/state/service-policy/../legacy.private.json']){const p=context();mutate(p);assert.throws(()=>validatePolicyWorkerOrderContext(p,id),/CONTEXT/);}
});
