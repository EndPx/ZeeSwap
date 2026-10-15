import test from 'node:test';
import assert from 'node:assert/strict';


import {requireG5CompletedRoundtripRecovery,G5_RETRY_TARGET,G5_TARGET,type G5State} from '../src/g5-run.ts';
test('completed-circle recovery excludes historical, broader, unsigned, changed-diagnostic and closed runs',()=>{
 const state:G5State={version:1,runId:'run',binding:'binding',openingEventId:'opening',incident:true,policyInitialized:true,batchSize:5,barriers:[],orders:[
  {sequence:1,direction:'ZCASH_TO_BASE',owner:'user1',orderId:'F1',receiptVerified:true},{sequence:2,direction:'BASE_TO_ZCASH',owner:'user2',orderId:'R2'}]};
 const config={branchId:G5_RETRY_TARGET.branchId},diagnostic={step:'verify',code:'G5_EXPLICIT_RECONCILIATION_REQUIRED'};
 requireG5CompletedRoundtripRecovery(state,config,diagnostic);assert.equal(state.incident,true);
 for(const changed of [{...state,incident:false},{...state,closed:true},{...state,policyInitialized:false},{...state,batchSize:undefined},
 {...state,orders:state.orders.slice(0,1)},{...state,barriers:[5]},{...state,orders:[{...state.orders[0],receiptVerified:false},state.orders[1]]}])assert.throws(()=>requireG5CompletedRoundtripRecovery(changed,config,diagnostic));
 assert.throws(()=>requireG5CompletedRoundtripRecovery(state,{branchId:G5_TARGET.branchId},diagnostic));
 for(const changed of [{step:'approve-wallet',code:diagnostic.code},{step:'verify',code:'BASE_REORG'}])assert.throws(()=>requireG5CompletedRoundtripRecovery(state,config,changed));
});
