/** Read-only finality-lag discriminator for immutable completed G5 originals.
 * Unwired initially. A missing receipt never means WAIT. No SQL, signer,
 * broadcast, checkpoint renewal or historical confirmation update occurs here.
 */
import {decodeEventLog,decodeFunctionData,encodeFunctionData,getAddress,keccak256,parseTransaction,recoverTransactionAddress,recoverTypedDataAddress,type Hex,type TransactionSerialized} from 'viem';
import {settlementAbi,payoutTypedData,payoutCall,type BaseRegistry,type PayoutTerms} from './base-contract.ts';
import {fundingCall,fundingTypedData,type FundingTerms} from './base-escrow.ts';
import type {BaseContract} from './base-contract.ts';
import {ObserverWaitError} from './observer-frontiers.ts';

export type CompletedBasePhase='RESERVE'|'PAY'|'COMMIT'|'SETTLE';
export interface CompletedBaseOriginal {
 orderId:string;phase:CompletedBasePhase;confirmed:boolean;blockHeight:string;blockHash:string;actualFee:string;
 signed:{raw:Hex;hash:Hex;nonce:number;maxCost:string};
}
export interface CompletedSourceFund {
 orderId:string;confirmedAt:Date|string;blockHeight:string;blockHash:string;eventIndex:number;
 signed:{raw:Hex;hash:Hex;nonce:number;maxCost:string};
}
export type CompletedBaseOrder={orderId:string;state:'SETTLED';direction:'ZCASH_TO_BASE';terms:PayoutTerms;originals:CompletedBaseOriginal[]}
 |{orderId:string;state:'SETTLED';direction:'BASE_TO_ZCASH';terms:FundingTerms;originals:CompletedBaseOriginal[];sourceFund:CompletedSourceFund};
export interface CompletedBaseReadIO {
 registry:BaseRegistry;
 heads():Promise<{latest:any;finalized:any}>;
 client:{getChainId():Promise<number>;getTransaction(args:any):Promise<any>;getTransactionReceipt(args:any):Promise<any>;getBlock(args:any):Promise<any>;readContract(args:any):Promise<any>};
}
interface VerifiedOriginal {phase:CompletedBasePhase|'FUND';hash:Hex;height:bigint;blockHash:Hex;fee:string;eventIndex:number;}
const HASH=/^[0-9a-f]{64}$/,lagWaits=new WeakSet<ObserverWaitError>(),hardErrors=new WeakSet<Error>();
function hard(code:string):never{const error=Error(code);hardErrors.add(error);throw error;}
function failure(error:unknown):never{if(error instanceof ObserverWaitError&&lagWaits.has(error)||error instanceof Error&&hardErrors.has(error))throw error;throw Error('G5_COMPLETED_BASE_ORIGINAL_PROOF_UNAVAILABLE');}
function normalized(hash:unknown){if(typeof hash!=='string'||!HASH.test(hash.replace(/^0x/,'')))hard('G5_COMPLETED_BASE_HASH_INVALID');return hash.replace(/^0x/,'');}
function integer(value:unknown){if(!Number.isSafeInteger(value)||Number(value)<0)hard('G5_COMPLETED_BASE_INTEGER_INVALID');return value as number;}
function positive(value:unknown){if(typeof value!=='string'||!/^[1-9][0-9]*$/.test(value))hard('G5_COMPLETED_BASE_AMOUNT_INVALID');return BigInt(value);}
function headShape(head:any){if(typeof head?.number!=='bigint'||head.number<0n||typeof head.timestamp!=='bigint'||head.timestamp<0n)hard('G5_COMPLETED_BASE_HEAD_INVALID');normalized(head.hash);}
async function heads(base:CompletedBaseReadIO){
 if(base.registry.chainId!==84532||await base.client.getChainId()!==84532)hard('G5_COMPLETED_BASE_CHAIN_CHANGED');
 const value=await base.heads();headShape(value.latest);headShape(value.finalized);
 if(value.finalized.number>value.latest.number||value.finalized.timestamp>value.latest.timestamp||Date.now()-Number(value.latest.timestamp)*1000>120000||Number(value.latest.timestamp)*1000-Date.now()>30000)hard('G5_COMPLETED_BASE_HEAD_STALE_OR_INCOHERENT');
 return value;
}
async function sameHeads(base:CompletedBaseReadIO,value:{latest:any;finalized:any}){
 if(Date.now()-Number(value.latest.timestamp)*1000>120000)hard('G5_COMPLETED_BASE_HEAD_STALE_OR_INCOHERENT');
 for(const h of [value.latest,value.finalized]){const block=await base.client.getBlock({blockNumber:h.number});if(block.number!==h.number||normalized(block.hash)!==normalized(h.hash))hard('G5_COMPLETED_BASE_HEAD_CANONICAL_CHANGED');}
}
function originalSet(order:CompletedBaseOrder){
 if(order.state!=='SETTLED'||!order.orderId||!['ZCASH_TO_BASE','BASE_TO_ZCASH'].includes(order.direction)||order.originals.length!==2)hard('G5_COMPLETED_BASE_SETTLED_ORIGINALS_REQUIRED');
 const phases=order.originals.map(a=>a.phase).sort().join(',');
 if(phases!==(order.direction==='ZCASH_TO_BASE'?'PAY,RESERVE':'COMMIT,SETTLE')||order.originals.some(a=>a.orderId!==order.orderId||a.confirmed!==true))hard('G5_COMPLETED_BASE_CONFIRMED_PHASES_REQUIRED');
 if(order.direction==='BASE_TO_ZCASH'&&(order.sourceFund?.orderId!==order.orderId||!(typeof order.sourceFund.confirmedAt==='string'&&order.sourceFund.confirmedAt.length>0||order.sourceFund.confirmedAt instanceof Date)||!Number.isFinite(new Date(order.sourceFund.confirmedAt).getTime())))hard('G5_COMPLETED_BASE_CONFIRMED_FUND_REQUIRED');
 const first=order.originals.find(a=>a.phase===(order.direction==='ZCASH_TO_BASE'?'RESERVE':'COMMIT'))!,last=order.originals.find(a=>a.phase===(order.direction==='ZCASH_TO_BASE'?'PAY':'SETTLE'))!;
 if(positive(last.blockHeight)<positive(first.blockHeight)||integer(last.signed.nonce)<=integer(first.signed.nonce)
  ||order.direction==='BASE_TO_ZCASH'&&positive(order.sourceFund.blockHeight)>positive(first.blockHeight))hard('G5_COMPLETED_BASE_PHASE_ORDER_CHANGED');
}
async function original(base:CompletedBaseReadIO,phase:CompletedBasePhase|'FUND',record:CompletedBaseOriginal|CompletedSourceFund,terms:PayoutTerms|FundingTerms):Promise<VerifiedOriginal>{
 const signed=record.signed,p=parseTransaction(signed.raw),contract=base.registry.contracts.ZeeSwapSettlement.address;
 if(p.type!=='legacy'||p.chainId!==84532||keccak256(signed.raw)!==signed.hash||p.nonce!==signed.nonce||!Number.isSafeInteger(p.nonce)||!p.to||getAddress(p.to)!==getAddress(contract)||(p.value??0n)!==0n
  ||!p.gas||p.gas>450000n||!p.gasPrice||p.gasPrice>20000000n||positive(signed.maxCost)>10000000000000n||p.gas*p.gasPrice>BigInt(signed.maxCost))hard('G5_COMPLETED_BASE_ORIGINAL_RAW_CHANGED');
 const signer=phase==='FUND'?(terms as FundingTerms).payer:base.registry.operator;
 if(getAddress(await recoverTransactionAddress({serializedTransaction:signed.raw as TransactionSerialized}))!==getAddress(signer))hard('G5_COMPLETED_BASE_ORIGINAL_SIGNER_CHANGED');
 let expected:Hex;
 if(phase==='RESERVE'||phase==='FUND'){
  const decoded=decodeFunctionData({abi:settlementAbi,data:p.data!});
  if(decoded.functionName!==(phase==='FUND'?'fund':'reservePayout'))hard('G5_COMPLETED_BASE_ORIGINAL_CALL_CHANGED');
  const signature=(decoded.args as any)[1] as Hex;
  const typed=phase==='FUND'?fundingTypedData(base as BaseContract,terms as FundingTerms):payoutTypedData(base.registry,terms as PayoutTerms);
  if(getAddress(await recoverTypedDataAddress({...typed,signature} as any))!==getAddress(base.registry.operator))hard('G5_COMPLETED_BASE_AUTHORIZATION_CHANGED');
  expected=phase==='FUND'?fundingCall(base as BaseContract,terms as FundingTerms,signature):payoutCall(base.registry,terms as PayoutTerms,signature,'RESERVE');
 }else expected=encodeFunctionData({abi:settlementAbi,functionName:phase==='PAY'?'executePayout':phase==='COMMIT'?'commitPayout':'settleEscrow',args:[terms.id]});
 if(p.data!==expected||getAddress(terms.token)!==getAddress(base.registry.contracts.MockUSDC.address))hard('G5_COMPLETED_BASE_ORIGINAL_CALL_CHANGED');
 let receipt:any;
 try{receipt=await base.client.getTransactionReceipt({hash:signed.hash});}catch{hard('G5_COMPLETED_BASE_ORIGINAL_RECEIPT_UNAVAILABLE');}
 if(!receipt||receipt.status!=='success'||receipt.transactionHash!==signed.hash||typeof receipt.blockNumber!=='bigint'||receipt.blockNumber.toString()!==record.blockHeight||normalized(receipt.blockHash)!==normalized(record.blockHash))hard('G5_COMPLETED_BASE_ORIGINAL_RECEIPT_CHANGED');
 const [tx,block]=await Promise.all([base.client.getTransaction({hash:signed.hash}),base.client.getBlock({blockNumber:receipt.blockNumber,includeTransactions:false})]);
 headShape(block);
 if(!tx||tx.hash!==signed.hash||tx.blockNumber!==receipt.blockNumber||normalized(tx.blockHash)!==normalized(receipt.blockHash)||tx.nonce!==p.nonce||getAddress(tx.from)!==getAddress(signer)
  ||!tx.to||getAddress(tx.to)!==getAddress(contract)||tx.input!==p.data||tx.value!==0n||tx.gas!==p.gas||tx.gasPrice!==p.gasPrice)hard('G5_COMPLETED_BASE_ORIGINAL_TRANSACTION_CHANGED');
 if(block.number!==receipt.blockNumber||normalized(block.hash)!==normalized(receipt.blockHash)||!Array.isArray(block.transactions)||block.transactions.filter((t:any)=>typeof t==='string'&&t===signed.hash).length!==1)hard('G5_COMPLETED_BASE_ORIGINAL_MEMBERSHIP_CHANGED');
 const wanted=phase==='RESERVE'?'PayoutReserved':phase==='PAY'?'Paid':phase==='FUND'?'Funded':phase==='COMMIT'?'PayoutCommitted':'EscrowSettled';
 const events=receipt.logs.filter((l:any)=>getAddress(l.address)===getAddress(contract)).flatMap((l:any)=>{try{const e=decodeEventLog({abi:settlementAbi,data:l.data,topics:l.topics});return e.eventName===wanted?[{args:e.args as any,index:l.logIndex}]:[];}catch{return [];}});
 const a=events[0]?.args;if(events.length!==1||a.id!==terms.id||phase!=='COMMIT'&&String(a.amount)!==terms.amount
  ||(phase==='RESERVE'||phase==='PAY')&&getAddress(a.recipient)!==getAddress((terms as PayoutTerms).recipient)
  ||phase==='FUND'&&(getAddress(a.payer)!==getAddress((terms as FundingTerms).payer)||String(a.cancellationAvailableAt)!==(terms as FundingTerms).cancellationAvailableAt||block.timestamp>=BigInt((terms as FundingTerms).fundingCutoff)))hard('G5_COMPLETED_BASE_ORIGINAL_EVENT_CHANGED');
 if(phase==='FUND'&&integer(events[0].index)!==integer((record as CompletedSourceFund).eventIndex))hard('G5_COMPLETED_BASE_ORIGINAL_EVENT_CHANGED');
 if(typeof receipt.gasUsed!=='bigint'||receipt.gasUsed<=0n||receipt.gasUsed>p.gas||receipt.effectiveGasPrice!==p.gasPrice||typeof receipt.l1Fee!=='bigint'||receipt.l1Fee<0n)hard('G5_COMPLETED_BASE_ORIGINAL_FEE_CHANGED');
 const fee=receipt.gasUsed*receipt.effectiveGasPrice+receipt.l1Fee;
 if(fee>BigInt(signed.maxCost)||phase!=='FUND'&&fee!==positive((record as CompletedBaseOriginal).actualFee))hard('G5_COMPLETED_BASE_ORIGINAL_FEE_CHANGED');
 return {phase,hash:signed.hash,height:receipt.blockNumber,blockHash:receipt.blockHash,fee:fee.toString(),eventIndex:integer(events[0].index)};
}
async function verified(base:CompletedBaseReadIO,orders:CompletedBaseOrder[],view:{latest:any;finalized:any}){
 const proofs:VerifiedOriginal[]=[];
 for(const order of orders){originalSet(order);
  if(order.direction==='BASE_TO_ZCASH')proofs.push(await original(base,'FUND',order.sourceFund,order.terms));
  for(const r of order.originals)proofs.push(await original(base,r.phase,r,order.terms));
  if(order.direction==='BASE_TO_ZCASH'){
   const state=await base.client.readContract({address:base.registry.contracts.ZeeSwapSettlement.address,abi:settlementAbi,functionName:'states',args:[order.terms.id],blockNumber:view.latest.number});
   if(state!==6)hard('G5_COMPLETED_BASE_LATEST_ESCROW_CHANGED');
  }
 }
 if(proofs.some(p=>p.height>view.latest.number))hard('G5_COMPLETED_BASE_HEAD_STALE_OR_INCOHERENT');
 await sameHeads(base,view);return proofs;
}
function floor(orders:CompletedBaseOrder[]){let value=0n;for(const order of orders){originalSet(order);for(const r of order.originals){const height=positive(r.blockHeight);if(height>value)value=height;}}return value;}
function wait(view:{latest:any;finalized:any},required:bigint):never{
 const error=new ObserverWaitError({event:'completed-base-finality',source:'g5-completed-base-proof',status:'WAIT',network:'base-sepolia',reason:'KNOWN_CANONICAL_RECEIPT_ABOVE_FINALIZED_HEAD',requiredHeight:required.toString(),latestHeight:view.latest.number.toString(),finalizedHeight:view.finalized.number.toString()});lagWaits.add(error);throw error;
}

/** All original proofs are checked before a lag can become WAIT. Reverse FUND
 * has no persisted historical payer fee: its actual fee must respect the saved
 * payer cap; the WAIT anchor is the later confirmed operator SETTLE exact fee.
 */
export async function verifyG5CompletedBaseOrder(base:CompletedBaseReadIO,order:CompletedBaseOrder){
 try{const view=await heads(base),required=floor([order]),proofs=await verified(base,[order],view);
  if(view.finalized.number<required)wait(view,required);
  if(order.direction==='BASE_TO_ZCASH'){
   const state=await base.client.readContract({address:base.registry.contracts.ZeeSwapSettlement.address,abi:settlementAbi,functionName:'states',args:[order.terms.id],blockNumber:view.finalized.number});
   if(state!==6)hard('G5_COMPLETED_BASE_FINAL_ESCROW_CHANGED');
  }
  await sameHeads(base,view);return {heads:view,proofs};
 }catch(error){failure(error);}
}

/** A physical balance check must use a head covering every completed operator
 * receipt. At a regressed head, verify every original fully before WAIT. Once
 * covered, return that exact head; real balance mismatches remain caller HARD.
 * This floor never substitutes for the completed receipt verifier above.
 */
export async function requireG5CompletedPhysicalFloor(base:CompletedBaseReadIO,orders:CompletedBaseOrder[]){
 try{const view=await heads(base),required=floor(orders);
  if(view.finalized.number<required){await verified(base,orders,view);wait(view,required);}
  await sameHeads(base,view);return {heads:view,requiredHeight:required};
 }catch(error){failure(error);}
}
