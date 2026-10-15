import test from 'node:test';
import assert from 'node:assert/strict';
import {privateKeyToAccount} from 'viem/accounts';
import {encodeAbiParameters,encodeEventTopics,encodeFunctionData,keccak256,parseTransaction,type Hex} from 'viem';
import {loadBaseRegistry,payoutTypedData,payoutCall,settlementAbi,type PayoutTerms} from '../src/base-contract.ts';
import {fundingTypedData,fundingCall,type FundingTerms} from '../src/base-escrow.ts';
import type {BaseContract} from '../src/base-contract.ts';
import {isObserverWait,ObserverWaitError} from '../src/observer-frontiers.ts';
import {validateG5PhysicalBase} from '../src/g5-run.ts';
import {verifyG5CompletedBaseOrder,requireG5CompletedPhysicalFloor,type CompletedBaseOrder,type CompletedBaseReadIO,type CompletedBaseOriginal,type CompletedSourceFund} from '../src/g5-completed-base-proof.ts';

// Real viem signed bytes, signer recovery, typed authorizations and ABI decoding.
// All RPC headers/transactions/receipts/state below are explicit synthetic IO.
async function fixture(reverse=false){
 const operator=privateKeyToAccount(('0x'+'11'.repeat(32)) as Hex),payer=privateKeyToAccount(('0x'+'22'.repeat(32)) as Hex),registry={...loadBaseRegistry(),operator:operator.address};
 const now=BigInt(Math.floor(Date.now()/1000)),hash=(n:number)=>('0x'+n.toString(16).padStart(64,'0')) as Hex,orderId='synthetic-completed-order',id=hash(77);
 const control={finalized:90n,latest:200n,latestTime:now,latestState:6,finalState:6,chain:84532};
 const blocks=new Map<bigint,any>(),receipts=new Map<Hex,any>(),transactions=new Map<Hex,any>(),reads:bigint[]=[];
 const block=(height:bigint)=>blocks.get(height)??{number:height,hash:hash(Number(height)+1000),timestamp:now-(200n-height),transactions:[]};
 const base:CompletedBaseReadIO={registry,async heads(){return {latest:{...block(control.latest),timestamp:control.latestTime},finalized:block(control.finalized)};},client:{
  async getChainId(){return control.chain;},async getTransactionReceipt({hash}){const r=receipts.get(hash);if(!r)throw Object.assign(Error('private RPC detail'),{name:'TransactionReceiptNotFoundError'});return r;},
  async getTransaction({hash}){return transactions.get(hash);},async getBlock({blockNumber}){return block(blockNumber);},
  async readContract({blockNumber}){reads.push(blockNumber);return blockNumber===control.latest?control.latestState:control.finalState;}
 }};
 const payout:PayoutTerms={id,token:registry.contracts.MockUSDC.address,recipient:payer.address,amount:'100000',nonce:'123',deadline:String(now+1000n)};
 const funding:FundingTerms={id,token:registry.contracts.MockUSDC.address,payer:payer.address,refundRecipient:payer.address,amount:'100000',nonce:'456',fundingCutoff:String(now+500n),cancellationAvailableAt:String(now+8000n)};
 const payoutSignature=await operator.signTypedData(payoutTypedData(registry,payout));
 const fundingSignature=await operator.signTypedData(fundingTypedData(base as BaseContract,funding));
 const originals:CompletedBaseOriginal[]=[],funds:CompletedSourceFund[]=[];
 for(const phase of reverse?['FUND','COMMIT','SETTLE'] as const:['RESERVE','PAY'] as const){
  const height=phase==='FUND'?70n:phase==='RESERVE'||phase==='COMMIT'?80n:100n;
  const data=phase==='FUND'?fundingCall(base as BaseContract,funding,fundingSignature):phase==='RESERVE'?payoutCall(registry,payout,payoutSignature,'RESERVE'):
   encodeFunctionData({abi:settlementAbi,functionName:phase==='PAY'?'executePayout':phase==='COMMIT'?'commitPayout':'settleEscrow',args:[id]});
  const signer=phase==='FUND'?payer:operator,nonce=phase==='FUND'?7:phase==='RESERVE'||phase==='COMMIT'?8:9;
  const raw=await signer.signTransaction({type:'legacy',chainId:84532,nonce,to:registry.contracts.ZeeSwapSettlement.address,value:0n,data,gas:450000n,gasPrice:20000000n}),txid=keccak256(raw),p=parseTransaction(raw);
  const b={...block(height),transactions:[txid]};blocks.set(height,b);
  transactions.set(txid,{hash:txid,nonce,from:signer.address,to:registry.contracts.ZeeSwapSettlement.address,input:data,value:0n,gas:p.gas,gasPrice:p.gasPrice,blockNumber:height,blockHash:b.hash});
  const event=phase==='FUND'?'Funded':phase==='COMMIT'?'PayoutCommitted':phase==='SETTLE'?'EscrowSettled':phase==='PAY'?'Paid':'PayoutReserved';
  const topics=encodeEventTopics({abi:settlementAbi,eventName:event,args:phase==='FUND'?{id,payer:payer.address}:phase==='COMMIT'||phase==='SETTLE'?{id}:{id,recipient:payer.address}} as any);
  const eventData=phase==='COMMIT'?'0x':phase==='FUND'?encodeAbiParameters([{type:'uint256'},{type:'uint256'}],[100000n,BigInt(funding.cancellationAvailableAt)]):encodeAbiParameters([{type:'uint256'}],[100000n]);
  const receipt={transactionHash:txid,status:'success',blockNumber:height,blockHash:b.hash,gasUsed:100000n,effectiveGasPrice:20000000n,l1Fee:10n,logs:[{address:registry.contracts.ZeeSwapSettlement.address,topics,data:eventData,logIndex:0}]};receipts.set(txid,receipt);
  const common={orderId,blockHeight:String(height),blockHash:b.hash.slice(2),signed:{raw,hash:txid,nonce,maxCost:'10000000000000'}};
  if(phase==='FUND')funds.push({...common,confirmedAt:new Date(),eventIndex:0});else originals.push({...common,phase,confirmed:true,actualFee:'2000000000010'});
 }
 const order:CompletedBaseOrder=reverse?{orderId,state:'SETTLED',direction:'BASE_TO_ZCASH',terms:funding,originals,sourceFund:funds[0]}:{orderId,state:'SETTLED',direction:'ZCASH_TO_BASE',terms:payout,originals};
 return {base,order,control,blocks,receipts,transactions,reads,block};
}

test('same immutable forward originals above a fresh regressed finalized head produce only typed WAIT',async()=>{
 const f=await fixture();await assert.rejects(()=>verifyG5CompletedBaseOrder(f.base,f.order),error=>{assert.equal(isObserverWait(error),true);assert.equal((error as ObserverWaitError).diagnostic.requiredHeight,'100');return true;});
 f.control.finalized=120n;const result=await verifyG5CompletedBaseOrder(f.base,f.order);assert.deepEqual(result.proofs.map(p=>p.phase),['RESERVE','PAY']);assert.equal(result.heads.finalized.number,120n);
});

test('missing/reverted/changed receipts, raw bytes, events, fees or membership stay HARD despite finalized lag',async()=>{
 for(const mutate of [
  (f:any)=>f.receipts.delete(f.order.originals[1].signed.hash),
  (f:any)=>{f.receipts.get(f.order.originals[1].signed.hash).status='reverted';},
  (f:any)=>{f.receipts.get(f.order.originals[1].signed.hash).blockHash='0x'+'ff'.repeat(32);},
  (f:any)=>{f.order.originals[1].signed.raw='0x010203';},
  (f:any)=>{f.receipts.get(f.order.originals[1].signed.hash).logs[0].data=encodeAbiParameters([{type:'uint256'}],[99999n]);},
  (f:any)=>{f.receipts.get(f.order.originals[1].signed.hash).l1Fee=11n;},
  (f:any)=>{f.blocks.get(100n).transactions=[];},
  (f:any)=>{f.control.latestTime-=121n;},
  (f:any)=>{f.control.latest=99n;},
  (f:any)=>{f.control.finalized=201n;},
  (f:any)=>{f.order.originals[1].confirmed=false;},
  (f:any)=>{f.order.state='READY';},
 ]){const f=await fixture();mutate(f);await assert.rejects(()=>verifyG5CompletedBaseOrder(f.base,f.order),error=>{assert.equal(isObserverWait(error),false);return true;});}
});

test('reverse old finalized escrow state cannot create a false incident; changed latest state remains HARD',async()=>{
 const f=await fixture(true);f.control.finalState=0;
 await assert.rejects(()=>verifyG5CompletedBaseOrder(f.base,f.order),isObserverWait);assert.deepEqual(f.reads,[200n]);
 f.control.latestState=5;await assert.rejects(()=>verifyG5CompletedBaseOrder(f.base,f.order),error=>{assert.equal(isObserverWait(error),false);assert.equal((error as Error).message,'G5_COMPLETED_BASE_LATEST_ESCROW_CHANGED');return true;});
});

test('reverse exact operator fees remain mandatory; source payer fee is bounded by original cap without invented historical fee',async()=>{
 const f=await fixture(true);f.control.finalized=120n;const result=await verifyG5CompletedBaseOrder(f.base,f.order);assert.equal(result.proofs.length,3);assert.equal(result.proofs.find(p=>p.phase==='FUND')?.fee,'2000000000010');
 if(f.order.direction!=='BASE_TO_ZCASH')throw Error('fixture');
 f.receipts.get(f.order.sourceFund.signed.hash).l1Fee=10000000000000n;
 await assert.rejects(()=>verifyG5CompletedBaseOrder(f.base,f.order),error=>{assert.equal(isObserverWait(error),false);return true;});
});

test('advanced reverse head still requires finalized SETTLED state and exact original source FUND',async()=>{
 const f=await fixture(true);f.control.finalized=120n;f.control.finalState=5;await assert.rejects(()=>verifyG5CompletedBaseOrder(f.base,f.order),/FINAL_ESCROW_CHANGED/);
 const g=await fixture(true);if(g.order.direction!=='BASE_TO_ZCASH')throw Error('fixture');g.receipts.delete(g.order.sourceFund.signed.hash);await assert.rejects(()=>verifyG5CompletedBaseOrder(g.base,g.order),error=>{assert.equal(isObserverWait(error),false);return true;});
 const h=await fixture(true);if(h.order.direction!=='BASE_TO_ZCASH')throw Error('fixture');(h.order.sourceFund as any).confirmedAt=null;await assert.rejects(()=>verifyG5CompletedBaseOrder(h.base,h.order),/CONFIRMED_FUND_REQUIRED/);
});

test('physical floor blocks older-head balance reads; an advanced-head real deficit remains HARD',async()=>{
 const f=await fixture();let balanceReads=0;
 const balance=()=>{balanceReads++;validateG5PhysicalBase({inventory:'10000000',operatorGas:'1000000000000000'},1,0,'4000000000020',{inventory:'9900000',available:'9900001',tokenBalance:'9900000',escrowLiability:'0',gas:'995999999999980'});};
 await assert.rejects(async()=>{await requireG5CompletedPhysicalFloor(f.base,[f.order]);balance();},isObserverWait);assert.equal(balanceReads,0);
 f.control.finalized=120n;await verifyG5CompletedBaseOrder(f.base,f.order);
 await assert.rejects(async()=>{await requireG5CompletedPhysicalFloor(f.base,[f.order]);balance();},error=>{assert.equal(isObserverWait(error),false);assert.match((error as Error).message,/UNEXPLAINED_PHYSICAL_BASE_DELTA/);return true;});assert.equal(balanceReads,1);
 const missing=await fixture();missing.receipts.delete(missing.order.originals[1].signed.hash);await assert.rejects(()=>requireG5CompletedPhysicalFloor(missing.base,[missing.order]),error=>{assert.equal(isObserverWait(error),false);return true;});
});

test('an IO exception that resembles a typed WAIT cannot bypass original receipt validation',async()=>{
 const f=await fixture();f.base.client.getTransactionReceipt=async()=>{throw new ObserverWaitError({reason:'synthetic-untrusted-IO'});};
 await assert.rejects(()=>verifyG5CompletedBaseOrder(f.base,f.order),error=>{assert.equal(isObserverWait(error),false);return true;});
});

test('completion lag requires ordered original economic phases rather than a source-only anchor',async()=>{
 for(const mutate of [
  (f:any)=>{f.order.originals[1].signed.nonce=f.order.originals[0].signed.nonce;},
  (f:any)=>{f.order.originals[1].blockHeight='79';},
  (f:any)=>{f.order.sourceFund.blockHeight='81';},
  (f:any)=>{f.order.sourceFund.eventIndex=1;},
  (f:any)=>{f.order.originals=f.order.originals.filter((r:any)=>r.phase!=='SETTLE');},
 ]){const f=await fixture(true);mutate(f);await assert.rejects(()=>verifyG5CompletedBaseOrder(f.base,f.order),error=>{assert.equal(isObserverWait(error),false);return true;});}
});

test('missing or invalid canonical FUND timestamp stays HARD before any timely-source WAIT',async()=>{
 for(const timestamp of [undefined,null,'123',-1n]){const f=await fixture(true);f.blocks.get(70n).timestamp=timestamp;
  await assert.rejects(()=>verifyG5CompletedBaseOrder(f.base,f.order),error=>{assert.equal(isObserverWait(error),false);assert.equal((error as Error).message,'G5_COMPLETED_BASE_HEAD_INVALID');return true;});}
});

test('provider errors with a matching internal code prefix cannot leak arbitrary codes',async()=>{
 for(const call of ['getChainId','getTransaction','getBlock','readContract'] as const){const f=await fixture(true);
  (f.base.client as any)[call]=async()=>{throw Error('G5_COMPLETED_BASE_SECRET_TOKEN');};
  await assert.rejects(()=>verifyG5CompletedBaseOrder(f.base,f.order),error=>{assert.equal(isObserverWait(error),false);assert.equal((error as Error).message,'G5_COMPLETED_BASE_ORIGINAL_PROOF_UNAVAILABLE');return true;});}
});
