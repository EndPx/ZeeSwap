import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionData,encodeEventTopics,keccak256,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {createHash} from 'node:crypto';
import {loadBaseRegistry,settlementAbi} from '../src/base-contract.ts';
import {continuationDigest} from '../src/native-circle-continuation.ts';
import {assessFirstServiceOpeningBooks,assessSharedContractLiabilityExclusions,verifyCancellationOnlyIssuerHistory,validateAcceptedOpeningPrefix,requireConsumableOpeningSuffix,type CancellationIssuerEvidence} from '../src/swap-first-service-opening.ts';
const h=('0x'+'ab'.repeat(32)) as Hex,id=('0x'+'cd'.repeat(32)) as Hex;
test('accepted prefix preserves packet count384 separately from intervals3840',()=>{
 const p={count:384,intervals:3840,blocks:768000,bytes:57380684,lastRecordDigest:'958f1888ac92b873f58eb82f6501dc4cbb5436a032491cb0f816b21b33c2c8c9',lastSdkHeight:51338274,lastRevision:'1224862'};
 assert.equal(validateAcceptedOpeningPrefix(p),p);assert.throws(()=>validateAcceptedOpeningPrefix({...p,count:3840}),/ORIGINAL_ACCEPTED_PREFIX/);assert.throws(()=>validateAcceptedOpeningPrefix({...p,intervals:384}),/ORIGINAL_ACCEPTED_PREFIX/);
});
test('opening suffix remains inside actual SDK retained floor with ordinary overlap',()=>{
 requireConsumableOpeningSuffix(1000,1150,969,0);
 for(const args of[[1000,1151,969,0],[1000,1100,970,0],[1000,999,900,0],[1000,1100,969,1]])assert.throws(()=>requireConsumableOpeningSuffix(...args as [number,number,number,number]),/FRESH_CONSUMABLE/);
});
async function fixture(){
 const a=privateKeyToAccount(('0x'+'11'.repeat(32)) as Hex),registry={...loadBaseRegistry(),operator:a.address};
 const data=encodeFunctionData({abi:settlementAbi,functionName:'cancelSettlement',args:[id]});
 const raw=await a.signTransaction({chainId:84532,type:'legacy',nonce:0,to:registry.contracts.ZeeSwapSettlement.address,value:0n,data,gas:100000n,gasPrice:1n});
 const e:CancellationIssuerEvidence={operator:a.address,latestNonce:1,pendingNonce:1,directoryFiles:[{name:'signer.lock',sha256:'a'.repeat(64),bytes:0},{name:createHash('sha256').update(id).digest('hex')+'.refund.CANCEL.tx.json',sha256:'b'.repeat(64),bytes:2000}],signed:{raw,hash:keccak256(raw),nonce:0},
 transaction:{hash:keccak256(raw),from:a.address,to:registry.contracts.ZeeSwapSettlement.address,nonce:0,input:data,value:'0',blockNumber:'100',blockHash:h},
 receipt:{status:'success',transactionHash:keccak256(raw),blockNumber:'100',blockHash:h,logs:[{address:registry.contracts.ZeeSwapSettlement.address,topics:encodeEventTopics({abi:settlementAbi,eventName:'SettlementCancelled',args:{id}}) as Hex[],data:'0x'}]},anchor:{height:'101',hash:h},receiptCanonicalHash:h,currentState:3};return{registry,e};
}
test('verifies exact cancellation history without claiming full issuer inventory or authority',async()=>{
 const {registry,e}=await fixture(),r=await verifyCancellationOnlyIssuerHistory(registry,id,e);assert.equal(r.status,'CURRENT_ISSUER_CANCELLATION_ONLY_VERIFIED');assert.equal(r.fullIssuerInventoryProven,false);assert.equal(r.admissionAuthorized,false);
});
test('retains explained outside-scope liabilities while checking available capital',()=>{
 const s={inventory:'10100000',reserved:'100000',escrow:'100000',available:'10000000',tokenBalance:'10200000',known:[{id,state:1 as const,payoutAmount:'100000',escrowAmount:'0'},{id:h,state:5 as const,payoutAmount:'0',escrowAmount:'100000'}]};
 assert.equal(assessSharedContractLiabilityExclusions(s).knownActiveLiabilitiesExplainAggregates,true);
 assert.throws(()=>assessSharedContractLiabilityExclusions({...s,reserved:'200000'}),/UNEXPLAINED/);
 assert.throws(()=>assessSharedContractLiabilityExclusions({...s,known:s.known.slice(0,1)}),/LIABILITY_IDS/);
 assert.throws(()=>assessSharedContractLiabilityExclusions({...s,tokenBalance:'10100000'}),/CAPITAL_ACCOUNTING/);
});
test('rejects pending nonce, auth-file addition, wrong signer, state and absent original event',async()=>{
 const {registry,e}=await fixture();
 for(const changed of [{...e,pendingNonce:2},{...e,directoryFiles:[...e.directoryFiles,{name:'unknown.auth.json',sha256:'a'.repeat(64),bytes:100}]},{...e,operator:loadBaseRegistry().operator},{...e,currentState:1},{...e,receipt:{...e.receipt,logs:[]}}])await assert.rejects(verifyCancellationOnlyIssuerHistory(registry,id,changed));
});
test('accepts only exact closed current-main books and keeps global history unknown',()=>{
 const s={orders:[{state:'REFUNDED'},{state:'EXPIRED_UNFUNDED'}],obligations:[{state:'DISCHARGED'}],operations:[{kind:'REFUND',state:'CONFIRMED'}],reservations:[],base_bindings:[],escrow_bindings:[],base_attempts:[],escrow_commits:[]};
 assert.equal(assessFirstServiceOpeningBooks(s,continuationDigest(s),[]).mainDatabaseClosed,true);
 assert.throws(()=>assessFirstServiceOpeningBooks(s,continuationDigest(s),[{}]),/BASE_STATUS_PRESENT/);
 const changed={...s,base_bindings:[{}]};assert.throws(()=>assessFirstServiceOpeningBooks(changed,continuationDigest(changed),[]),/MAIN_BINDINGS/);
 const pending={...s,operations:[{kind:'REFUND',state:'UNKNOWN'}]};assert.throws(()=>assessFirstServiceOpeningBooks(pending,continuationDigest(pending),[]),/MAIN_OPERATION/);
});
