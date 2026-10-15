import test from 'node:test';
import assert from 'node:assert/strict';
import {requireG5R2PreSigningRecovery,validateG5R2HeldAccounts,validateG5R2Physical} from '../src/g5-presigning.ts';
import {G5_RETRY_TARGET,G5_TARGET,type G5State} from '../src/g5-run.ts';
test('R2 recovery permits only the known fresh-finality wait before any SDK approval on this retry run',()=>{
 const state:G5State={version:1,runId:'run',binding:'binding',openingEventId:'event',incident:true,policyInitialized:true,batchSize:5,barriers:[],orders:[
  {sequence:1,direction:'ZCASH_TO_BASE',owner:'first',orderId:'F1',receiptVerified:true},
  {sequence:2,direction:'BASE_TO_ZCASH',owner:'second',orderId:'R2'}]};
 const config={branchId:G5_RETRY_TARGET.branchId},reverse={orderId:'R2',owner:'second',lastFailure:{step:'approve-wallet',message:'FINALIZED_COMMIT_REQUIRED'}};
 requireG5R2PreSigningRecovery(state,config,reverse);
 for(const changed of [{...state,incident:false},{...state,closed:true},{...state,policyInitialized:false},{...state,orders:state.orders.slice(1)},{...state,barriers:[5]},
 {...state,orders:[{...state.orders[0],receiptVerified:false},state.orders[1]]}])assert.throws(()=>requireG5R2PreSigningRecovery(changed,config,reverse));
 assert.throws(()=>requireG5R2PreSigningRecovery(state,{branchId:G5_TARGET.branchId},reverse));
 for(const changed of [{...reverse,owner:'other'},{...reverse,orderId:'other'},{...reverse,approvedRequest:{}},{...reverse,approvedDigest:'a'.repeat(64)},
 {...reverse,lastFailure:{step:'prepare-zcash',message:'FINALIZED_COMMIT_REQUIRED'}},{...reverse,lastFailure:{step:'approve-wallet',message:'BASE_ESCROW_COMMIT_MISMATCH'}}])assert.throws(()=>requireG5R2PreSigningRecovery(state,config,changed));
});
test('R2 held books retain principal and fee reservations and exclude uncharged COMMIT gas until settlement',()=>{
 const rows=[{asset:'mockUSDC',purpose:'principal',balance:'900000',reserved:'0'},
 {asset:'TAZ',purpose:'principal',balance:'1000000',reserved:'100000'},{asset:'TAZ',purpose:'fee',balance:'130000',reserved:'10000'},
 {asset:'baseETH',purpose:'fee',balance:'294000000000000',reserved:'50000000000000'}];
 validateG5R2HeldAccounts(rows,'6000000000000');
 for(let i=0;i<4;i++)assert.throws(()=>validateG5R2HeldAccounts(rows.map((r,n)=>n===i?{...r,reserved:'0',balance:(BigInt(r.balance)-1n).toString()}:r),'6000000000000'));
 assert.throws(()=>validateG5R2HeldAccounts([...rows,rows[0]],'6000000000000'));
});
test('R2 physical proof keeps escrow outside inventory and charges actual included COMMIT gas',()=>{
 const opening={inventory:'10000000',operatorGas:'990000000000000'},physical={inventory:'9900000',available:'9900000',tokenBalance:'10000000',escrowLiability:'100000',gas:'982000000000000'};
 validateG5R2Physical(opening,'6000000000000','2000000000000',physical);
 for(const change of [{inventory:'10000000'},{tokenBalance:'9900000'},{escrowLiability:'0'},{gas:'984000000000000'},{available:'9800000'}])assert.throws(()=>validateG5R2Physical(opening,'6000000000000','2000000000000',{...physical,...change}));
});
