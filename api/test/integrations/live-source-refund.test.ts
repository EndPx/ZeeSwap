import test from'node:test';import assert from'node:assert/strict';import type{Pool}from'pg';import type{BaseContract}from'../../src/base-contract.ts';
import{PrivateData}from'../../src/private-data.ts';import{nextLiveRefundStep,dispatchLiveRefundOnce,type LiveRefundContext,type LiveRefundProgress}from'../../src/live-source-refund.ts';
import{publicSettlementId,settlementAbi}from'../../src/base-contract.ts';import{sourceRefundCall}from'../../src/source-refunds.ts';import{encodeEventTopics}from'viem';
const progress:LiveRefundProgress={orderState:'REFUND_REQUIRED',direction:'ZCASH_TO_BASE',payoutOrCommit:false,planned:true,baseSigned:true,baseConfirmed:false,approved:false,nativeSigned:false};
test('native principal refund cannot be selected until permanent cancellation is confirmed',()=>{
 assert.equal(nextLiveRefundStep(progress),'RECONCILE_CANCEL');assert.equal(nextLiveRefundStep({...progress,baseConfirmed:true}),'APPROVE_NATIVE');
 assert.equal(nextLiveRefundStep({...progress,baseConfirmed:true,approved:true}),'PREPARE_NATIVE');assert.equal(nextLiveRefundStep({...progress,baseConfirmed:true,approved:true,nativeSigned:true}),'RECONCILE_NATIVE');
});
test('paid, prepared PAY, committed/delivered reverse and wrong direction cannot enter source refund path',()=>{
 for(const orderState of['READY','REFUND_REQUIRED','SETTLED'])assert.throws(()=>nextLiveRefundStep({...progress,orderState,payoutOrCommit:true}),/LIVE_REFUND_PAYOUT_OR_SCOPE_FORBIDDEN/);
 assert.throws(()=>nextLiveRefundStep({...progress,direction:'BASE_TO_ZCASH'}),/LIVE_REFUND_PAYOUT_OR_SCOPE_FORBIDDEN/);
});
async function context(baseConfirmed:boolean,known:boolean){
 const id='11111111-1111-4111-8111-111111111111',keys=new PrivateData(Buffer.alloc(32,1),Buffer.alloc(32,2)),hash=`0x${'ab'.repeat(32)}` as const,contract=`0x${'11'.repeat(20)}`;
 const calls={prepare:0,wallet:0,broadcast:0,hashes:[]as string[]};const now=new Date();
 const signed={hash,raw:'0xaabb',nonce:0,maxCost:'10000000000000'};
 const quote={inputAmount:'100000',outputAmount:'100000',executionMode:'base-settlement-v1',baseContract:contract,refundRecipient:'synthetic-shielded-refund'};
 const source={confirmed_at:now,classification:'EXACT',direction:'ZCASH_TO_BASE',input_amount:'100000',output_amount:'100000',received_amount:'100000',refund_fee:'10000',execution_mode:'base-settlement-v1',base_contract:contract,settlement_id:'22222222-2222-4222-8222-222222222222',private_payload:keys.seal(quote,`quote:${id}:v1`)};
 const row={base_confirmed:baseConfirmed,base_payload:keys.seal(signed,`source-refund:${id}:CANCEL:v1`)};
 const client={async query(sql:string){if(sql.includes('pg_try_advisory_lock'))return{rows:[{locked:true,pid:12}]};if(sql.includes('pg_advisory_unlock'))return{rows:[{unlocked:true}]};if(sql.includes('pg_backend_pid'))return{rows:[{pid:12}]};return{rows:[]};},on(){},removeListener(){},release(){}};
 const pool={async connect(){return client;},async query(sql:string){
  if(sql.includes('current_database'))return{rows:[{database:'zee_app_20261023',role:'zee_app_worker_20261023'}]};
  if(sql.includes('AS excluded'))return{rows:[{state:'REFUND_REQUIRED',direction:'ZCASH_TO_BASE',excluded:false}]};
  if(sql.includes('FROM zee.source_refunds'))return{rows:[row]};
  if(sql.includes('runtime_control'))return{rows:[{epoch:'7',accepting_orders:false,dispatch_enabled:false,reconciliation_required:false}]};
  if(sql.includes('scanner_checkpoints'))return{rows:['base-sepolia','zcash-testnet'].map(network=>({network,scanned_height:'100',finalized_height:'90',observed_at:now,checked_at:now}))};
  if(sql.includes('FROM zee.quotes q JOIN zee.orders'))return{rows:[source]};return{rows:[]};}}as unknown as Pool;
 const base={registry:{operator:`0x${'22'.repeat(20)}`,contracts:{ZeeSwapSettlement:{address:contract}}},async preflight(){},client:{async getTransactionReceipt({hash}:any){calls.hashes.push(hash);throw Object.assign(Error(),{name:'TransactionReceiptNotFoundError'});},async getTransaction({hash}:any){calls.hashes.push(hash);if(known)return{hash};throw Object.assign(Error(),{name:'TransactionNotFoundError'});},async sendRawTransaction(){calls.broadcast++;throw Error('NO_BROADCAST');}}}as unknown as BaseContract;
 const c:LiveRefundContext={pool,keys,base,async load(){return{version:1,orderId:id,refundEpoch:'7',basePreparedHash:hash,baseBroadcast:'UNKNOWN'};},async save(){},async prepareCancel(){calls.prepare++;throw Error('NO_NEW_NONCE');},async approveNative(){calls.wallet++;throw Error('NO_NATIVE_BEFORE_FINALITY');},async wallet(){calls.wallet++;throw Error('NO_NATIVE_BEFORE_FINALITY');},async nativeJournal(){return{exists:false,broadcast:false};}};
 return{c,id,calls,hash};
}
test('unknown cancellation response reconciles the stored original hash without fresh signing or automatic rebroadcast',async()=>{
 const{c,id,calls,hash}=await context(false,false);assert.equal((await dispatchLiveRefundOnce(c,id)).status,'WAIT_CANCEL_ORIGINAL_HASH_RECONCILIATION');
 assert.deepEqual(calls.hashes,[hash,hash]);assert.equal(calls.prepare,0);assert.equal(calls.wallet,0);assert.equal(calls.broadcast,0);
});
test('known but unfinalized cancellation and stale SQL confirmation cannot reach native signing',async()=>{
 const a=await context(false,true);assert.equal((await dispatchLiveRefundOnce(a.c,a.id)).status,'AWAITING_CANCEL_FINALITY');assert.equal(a.calls.wallet,0);
 const b=await context(true,false);assert.equal((await dispatchLiveRefundOnce(b.c,b.id)).status,'AWAITING_CANCEL_FINALITY');assert.equal(b.calls.wallet,0);assert.equal(b.calls.prepare,0);assert.equal(b.calls.broadcast,0);
});
test('canonical finalized CANCELLED receipt admits full-principal native approval with separate fee',async()=>{
 const{c,id,hash}=await context(true,false),base=c.base as any,address=base.registry.contracts.ZeeSwapSettlement.address,settlement=publicSettlementId('22222222-2222-4222-8222-222222222222'),blockHash=`0x${'55'.repeat(32)}`,finalHash=`0x${'66'.repeat(32)}`;
 base.heads=async()=>({latest:{number:1001n,hash:`0x${'77'.repeat(32)}`},finalized:{number:1000n,hash:finalHash}});
 base.client.getTransactionReceipt=async()=>({status:'success',blockNumber:100n,blockHash,gasUsed:1n,effectiveGasPrice:1n,l1Fee:1n,logs:[{address,data:'0x',topics:encodeEventTopics({abi:settlementAbi,eventName:'SettlementCancelled',args:{id:settlement}}),logIndex:0}]});
 base.client.getBlock=async({blockNumber}:any)=>({hash:blockNumber===100n?blockHash:finalHash,timestamp:1n});
 base.client.getTransaction=async()=>({from:base.registry.operator,to:address,value:0n,input:sourceRefundCall('CANCEL',settlement)});base.client.readContract=async()=>3;
 let approved=false;c.approveNative=async(_state,_row,source)=>{assert.equal(source.row.received_amount,'100000');assert.equal(source.row.refund_fee,'10000');approved=true;};
 assert.equal((await dispatchLiveRefundOnce(c,id)).status,'NATIVE_REFUND_APPROVED');assert.equal(approved,true);
});
