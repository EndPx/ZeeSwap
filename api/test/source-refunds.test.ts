import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeEventTopics,encodeAbiParameters,type Hex} from 'viem';
import {settlementAbi,type BaseContract} from '../src/base-contract.ts';
import {verifyBaseRefund,sourceRefundCall,assertReverseRefundEligible} from '../src/source-refunds.ts';

const id=('0x'+'11'.repeat(32)) as Hex,hash=('0x'+'22'.repeat(32)) as Hex,blockHash=('0x'+'33'.repeat(32)) as Hex;
const operator=('0x'+'44'.repeat(20)) as Hex,payer=('0x'+'55'.repeat(20)) as Hex,contract=('0x'+'66'.repeat(20)) as Hex;
const token=('0x'+'77'.repeat(20)) as Hex,recipient=('0x'+'88'.repeat(20)) as Hex;
const terms={id,token,payer,refundRecipient:recipient,amount:'100000',nonce:'1',fundingCutoff:'100',cancellationAvailableAt:'7300'};
function fixture(phase:'CANCEL'|'REFUND'){
 let state=phase==='CANCEL'?3:7,latestState=state,time=7300n,finalHeight=20n,missing=false,ambiguous=false;
 const event=phase==='CANCEL'?'SettlementCancelled':'Refunded';
 const log={address:contract,logIndex:0,topics:encodeEventTopics({abi:settlementAbi,eventName:event,args:{id,...(phase==='REFUND'?{recipient}:{})}} as any),
  data:phase==='CANCEL'?'0x':encodeAbiParameters([{type:'uint256'}],[100000n])};
 const tx={from:phase==='CANCEL'?operator:payer,to:contract,value:0n,input:sourceRefundCall(phase,id)};
 const base={localTest:true,registry:{operator,contracts:{ZeeSwapSettlement:{address:contract}}},preflight:async()=>{},
 heads:async()=>({latest:{number:21n,timestamp:time,hash:blockHash},finalized:{number:finalHeight,timestamp:time,hash:blockHash}}),
 client:{getTransactionReceipt:async()=>{if(ambiguous)throw Object.assign(Error('offline'),{name:'TimeoutError'});if(missing)throw Object.assign(Error('missing'),{name:'TransactionReceiptNotFoundError'});
  return {status:'success',transactionHash:hash,blockNumber:10n,blockHash,gasUsed:100n,effectiveGasPrice:2n,logs:[log]};},
  getBlock:async()=>({hash:blockHash,timestamp:time}),getTransaction:async()=>tx,
  readContract:async(r:any)=>r.functionName==='states'?(r.blockNumber===21n?latestState:state):[payer,recipient,100000n,7300n]}} as unknown as BaseContract;
 return {base,tx,log,setState:(s:number)=>{state=s;latestState=s;},setLatest:(s:number)=>{latestState=s;},setTime:(s:bigint)=>{time=s;},setFinal:(s:bigint)=>{finalHeight=s;},
  missing:()=>{missing=true;},ambiguous:()=>{ambiguous=true;}};
}
test('forward refund requires finalized permanent cancellation; paid race and every nonterminal state fail closed',async()=>{
 const f=fixture('CANCEL');assert.equal((await verifyBaseRefund(f.base,id,'CANCEL',hash))?.fee,'200');
 for(const state of [0,1,2,4,5,6,7]){f.setState(state);await assert.rejects(()=>verifyBaseRefund(f.base,id,'CANCEL',hash),/CANCELLATION/);}
});
test('missing and unfinalized cancellation defer; ambiguous response cannot authorize or report failed payment',async()=>{
 const pending=fixture('CANCEL');pending.setFinal(9n);assert.equal(await verifyBaseRefund(pending.base,id,'CANCEL',hash),null);
 const missing=fixture('CANCEL');missing.missing();assert.equal(await verifyBaseRefund(missing.base,id,'CANCEL',hash),null);
 const unknown=fixture('CANCEL');unknown.ambiguous();await assert.rejects(()=>verifyBaseRefund(unknown.base,id,'CANCEL',hash),/offline/);
});
test('cancellation proof binds exact contract calldata, operator and event identity',async()=>{
 for(const change of [(f:ReturnType<typeof fixture>)=>{f.tx.input=sourceRefundCall('REFUND',id);},(f:ReturnType<typeof fixture>)=>{f.tx.from=payer;},
  (f:ReturnType<typeof fixture>)=>{f.tx.to=payer;},(f:ReturnType<typeof fixture>)=>{f.log.address=payer;}]){
  const f=fixture('CANCEL');change(f);await assert.rejects(()=>verifyBaseRefund(f.base,id,'CANCEL',hash));
 }
});
test('reverse cancellation deadline uses canonical chain time and exact immutable escrow',async()=>{
 const f=fixture('REFUND');f.setState(4);f.setTime(7299n);await assert.rejects(()=>assertReverseRefundEligible(f.base,terms));
 f.setTime(7300n);await assertReverseRefundEligible(f.base,terms);
 f.setLatest(5);await assert.rejects(()=>assertReverseRefundEligible(f.base,terms));
 for(const state of [0,1,2,3,5,6,7]){f.setState(state);await assert.rejects(()=>assertReverseRefundEligible(f.base,terms));}
});
test('reverse finalized receipt returns full 100000 principal to original immutable refund recipient',async()=>{
 const f=fixture('REFUND');assert.equal((await verifyBaseRefund(f.base,id,'REFUND',hash,terms))?.fee,'200');
 f.setTime(7299n);await assert.rejects(()=>verifyBaseRefund(f.base,id,'REFUND',hash,terms));
 f.setTime(7300n);await assert.rejects(()=>verifyBaseRefund(f.base,id,'REFUND',hash,{...terms,amount:'99999'}));
 await assert.rejects(()=>verifyBaseRefund(f.base,id,'REFUND',hash,{...terms,refundRecipient:payer}));
});
