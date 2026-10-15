import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {requireG5SdkFaultRecovery,validateG5SdkFaultPrepared,validateG5SdkFaultAccounts,validateG5SdkFaultPhysical,requireG5SdkFaultRetiredLease} from '../src/g5-sdk-fault.ts';
import {G5_RETRY_TARGET,type G5State} from '../src/g5-run.ts';
import {approvalDigest} from '../src/reverse-authority.ts';

test('SDK fault recovery accepts only known fourth-slot funded calculate interruption and immutable marker',()=>{
 const state:G5State={version:1,runId:'run',binding:'binding',openingEventId:'event',incident:true,policyInitialized:true,batchSize:5,barriers:[],orders:[1,2,3,4].map(sequence=>({sequence,orderId:'order'+sequence,owner:'owner'+sequence,direction:sequence%2?'ZCASH_TO_BASE':'BASE_TO_ZCASH',receiptVerified:sequence<4}))};
 const request={orderId:'order4',recipient:'shielded',amountZatoshi:'100000',maxFeeZatoshi:'10000'},digest=approvalDigest(request);
 const reverse={orderId:'order4',owner:'owner4',approvedRequest:request,approvedDigest:digest,lastFailure:{step:'prepare-zcash',message:'REVERSE_WALLET_UNAVAILABLE_RECONCILE'}};
 const marker={version:1,boundary:'SDK_DURABLE_BEFORE_ADAPTER_PREPARED',orderId:'order4',approvedDigest:digest,txid:'a'.repeat(64),rawSha256:'b'.repeat(64)};
 const config={branchId:G5_RETRY_TARGET.branchId};requireG5SdkFaultRecovery(state,config,reverse,marker);
 for(const s of [{...state,incident:false},{...state,closed:true},{...state,policyInitialized:false},{...state,orders:state.orders.slice(0,3)},{...state,barriers:[5]},
  {...state,orders:state.orders.map((o,i)=>i===2?{...o,receiptVerified:false}:o)},{...state,orders:state.orders.map((o,i)=>i===3?{...o,receiptVerified:true}:o)}])assert.throws(()=>requireG5SdkFaultRecovery(s,config,reverse,marker));
 for(const change of [{orderId:'other'},{owner:'other'},{approvedDigest:'c'.repeat(64)},{lastFailure:{step:'broadcast-zcash',message:'REVERSE_WALLET_UNAVAILABLE_RECONCILE'}},
  {lastFailure:{step:'prepare-zcash',message:'OTHER_UNKNOWN'}}])assert.throws(()=>requireG5SdkFaultRecovery(state,config,{...reverse,...change},marker));
 for(const change of [{boundary:'OTHER'},{orderId:'other'},{approvedDigest:'d'.repeat(64)},{txid:'unknown'},{rawSha256:'unknown'}])assert.throws(()=>requireG5SdkFaultRecovery(state,config,reverse,{...marker,...change}));
 assert.throws(()=>requireG5SdkFaultRecovery(state,{branchId:'primary'},reverse,marker));
});

test('recovered transaction must equal original marker and one exact isolated 110000 input',()=>{
 const note={pool:'ironwood' as const,txid:'c'.repeat(64),index:2,value:'110000'},terms={orderId:'fourth',operationId:'operation',recipient:'shielded',amountZatoshi:'100000',maxFeeZatoshi:'10000'};
 const prepared={operationId:'fourth',amount:'100000',fee:'10000',recipient:'shielded',txid:'a'.repeat(64),rawTransaction:'010203',feeZatoshi:'10000',expiryHeight:'123456',selectedNotes:[note],
  outputs:[{recipient:'shielded',amount:'100000',ownChange:false,index:0},{recipient:'own',amount:'0',ownChange:true,index:1}]};
 const marker={txid:prepared.txid,rawSha256:createHash('sha256').update(Buffer.from('010203','hex')).digest('hex')};
 validateG5SdkFaultPrepared(prepared,terms,marker,note);
 for(const changed of [{...prepared,rawTransaction:'010204'},{...prepared,txid:'b'.repeat(64)},{...prepared,feeZatoshi:'9999'},{...prepared,selectedNotes:[{...note,index:3}]},
  {...prepared,outputs:prepared.outputs.map(o=>o.ownChange?{...o,amount:'1'}:o)}])assert.throws(()=>validateG5SdkFaultPrepared(changed,terms,marker,note));
});

test('fourth-slot held books exclude included current COMMIT gas until final settlement accounting',()=>{
 const rows=[{asset:'mockUSDC',purpose:'principal',balance:'800000',reserved:'0'},{asset:'TAZ',purpose:'principal',balance:'900000',reserved:'100000'},
  {asset:'TAZ',purpose:'fee',balance:'120000',reserved:'10000'},{asset:'baseETH',purpose:'fee',balance:'290000000000000',reserved:'50000000000000'}];
 validateG5SdkFaultAccounts(rows,'10000000000000');
 for(let i=0;i<rows.length;i++)assert.throws(()=>validateG5SdkFaultAccounts(rows.map((r,n)=>i===n?{...r,balance:(BigInt(r.balance)-1n).toString()}:r),'10000000000000'));
 assert.throws(()=>validateG5SdkFaultAccounts([...rows,rows[0]],'10000000000000'));
});

test('physical exposure retains current escrow and subtracts original included COMMIT once',()=>{
 const opening={inventory:'10000000',operatorGas:'1000000000000000'},p={inventory:'9900000',available:'9900000',tokenBalance:'10000000',escrowLiability:'100000',gas:'989000000000000'};
 validateG5SdkFaultPhysical(opening,'10000000000000','1000000000000',p);
 for(const change of [{inventory:'10000000'},{available:'9800000'},{tokenBalance:'9900000'},{escrowLiability:'0'},{gas:'990000000000000'}])assert.throws(()=>validateG5SdkFaultPhysical(opening,'10000000000000','1000000000000',{...p,...change}));
});

test('fault recovery requires the single lease fence retirement already performed by reconciliation',()=>{
 const lease={jobId:'job',owner:'old-owner',fence:'8'},job={id:'job',status:'QUEUED',lease_owner:null,lease_until:null,fence:'9'};
 requireG5SdkFaultRetiredLease(job,lease);
 for(const change of [{status:'LEASED'},{lease_owner:'old-owner'},{lease_until:new Date()},{fence:'8'},{fence:'10'},{id:'other'}])assert.throws(()=>requireG5SdkFaultRetiredLease({...job,...change},lease));
});
