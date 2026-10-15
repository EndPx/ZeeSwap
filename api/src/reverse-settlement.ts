import { publishObserverBatch,requireObserverEpoch } from './observer-frontiers.ts';
import type pg from 'pg';
import { encodeFunctionData,getAddress,keccak256,parseTransaction,recoverTransactionAddress,type TransactionSerialized } from 'viem';
import { BaseContract,settlementAbi } from './base-contract.ts';
import { escrowTerms,escrowState,escrowEvents,finalizedReceipt,canonicalCheckpoint } from './base-escrow.ts';
import type { PreparedBaseTransaction } from './base-signer.ts';
import { PrivateData } from './private-data.ts';
import { transaction } from './db.ts';

export interface PreparedZcashTransaction {
 // The private wallet protocol's operationId denotes the approved order UUID;
 // the SQL payout operation UUID remains separate in ReversePayoutTerms.
 operationId:string;amount:string;fee:string;recipient:string;
 txid:string;rawTransaction:string;feeZatoshi:string;expiryHeight:string;
 selectedNotes:{pool:'ironwood';txid:string;index:number;value:string}[];
 outputs:{recipient:string;amount:string;ownChange:boolean;index:number}[];
}
export interface ReversePayoutTerms {orderId:string;operationId:string;recipient:string;amountZatoshi:string;maxFeeZatoshi:string}
export interface VerifiedZcashReceipt {
 txid:string;blockHeight:number;blockHash:string;tipHeight:number;tipHash:string;observedAt:string;
 amountZatoshi:string;feeZatoshi:string;recipient:string;shielded:true;pool:'ironwood';
}
/** Infrastructure adapter, never a caller-supplied receipt or HTTP request.
 * verifyPrepared independently parses txid/shape and reads actual SDK outgoing
 * notes. receipt independently reads canonical raw bytes and decrypts them with
 * the recipient UFVK. Metadata supplied by a customer is not payment evidence.
 */
export interface ReverseZcashVerifier {
 verifyPrepared(prepared:PreparedZcashTransaction,terms:ReversePayoutTerms):Promise<void>;
 receipt(prepared:PreparedZcashTransaction,terms:ReversePayoutTerms):Promise<VerifiedZcashReceipt|null>;
}
const payoutContext=(id:string)=>`reverse-payout:${id}:v1`;
const receiptContext=(id:string)=>`reverse-receipt:${id}:v1`;
const settleContext=(id:string)=>`escrow-settle:${id}:v1`;

export async function reversePayoutTerms(pool:pg.Pool,keys:PrivateData,orderId:string):Promise<ReversePayoutTerms>{
 const row=(await pool.query(`SELECT q.*,op.id AS operation_id FROM zee.quotes q JOIN zee.operations op ON op.order_id=q.id
 WHERE q.id=$1 AND op.kind='PAYOUT'`,[orderId])).rows[0];
 if(!row||row.execution_mode!=='base-escrow-v1'||row.direction!=='BASE_TO_ZCASH')throw Error('REVERSE_QUOTE_MISMATCH');
 const q=keys.open(row.private_payload,`quote:${orderId}:v1`) as any;
 if(q.executionMode!=='base-escrow-v1'||q.outputAmount!==row.output_amount||q.inputAmount!==row.input_amount||!q.recipient)throw Error('REVERSE_QUOTE_MISMATCH');
 return {orderId,operationId:row.operation_id,recipient:q.recipient,amountZatoshi:row.output_amount,maxFeeZatoshi:row.payout_fee};
}

export function validatePreparedZcash(p:PreparedZcashTransaction,q:ReversePayoutTerms){
 const external=p.outputs.filter(o=>o.ownChange===false);
 if(p.operationId!==q.orderId||p.amount!==q.amountZatoshi||p.fee!==p.feeZatoshi||p.recipient!==q.recipient
 ||!/^[0-9a-f]{64}$/.test(p.txid)||!/^([0-9a-f]{2})+$/.test(p.rawTransaction)||p.rawTransaction.length>4_000_000
 ||!/^[1-9][0-9]*$/.test(p.expiryHeight)||BigInt(p.expiryHeight)>0xffffffffn||!/^[1-9][0-9]*$/.test(p.feeZatoshi)||BigInt(p.feeZatoshi)>BigInt(q.maxFeeZatoshi)
 ||external.length!==1||external[0].recipient!==q.recipient||external[0].amount!==q.amountZatoshi
 // Exact-input SDK transactions may retain an authenticated zero-valued
 // internal change output. Preserve it and its index; external outputs stay positive.
 ||p.outputs.some(o=>typeof o.ownChange!=='boolean'||typeof o.amount!=='string'||!(o.ownChange?/^(0|[1-9][0-9]*)$/:/^[1-9][0-9]*$/).test(o.amount)||!o.recipient
   ||!Number.isSafeInteger(o.index)||o.index<0||o.index>0xffffffff)
 ||new Set(p.outputs.map(o=>o.index)).size!==p.outputs.length
 ||!p.selectedNotes.length||p.selectedNotes.some(n=>n.pool!=='ironwood'||!/^[0-9a-f]{64}$/.test(n.txid)||!Number.isSafeInteger(n.index)||n.index<0||!/^[1-9][0-9]*$/.test(n.value)))throw Error('INVALID_PREPARED_ZCASH_PAYOUT');
 const notes=new Set(p.selectedNotes.map(n=>`${n.pool}:${n.txid}:${n.index}`));
 if(notes.size!==p.selectedNotes.length||p.selectedNotes.reduce((v,n)=>v+BigInt(n.value),0n)!==p.outputs.reduce((v,o)=>v+BigInt(o.amount),0n)+BigInt(p.feeZatoshi))throw Error('INVALID_PREPARED_ZCASH_NOTES');
}

/** A prior durable confirmation cannot substitute for a fresh canonical receipt.
 * The callback is unreachable for pending, missing or contradictory evidence.
 */
export async function requireFreshReverseDelivery<T>(observe:()=>Promise<{status:string}>,afterFreshProof:()=>Promise<T>):Promise<T>{
 const result=await observe();
 if(result.status!=='ZCASH_DELIVERY_FINALIZED')throw Error('FRESH_ZCASH_DELIVERY_REQUIRED_RECONCILE');
 return afterFreshProof();
}

/** Signer journal and wallet save must precede this durable DB record. */
export async function storeReversePayout(pool:pg.Pool,keys:PrivateData,orderId:string,jobId:string,owner:string,fence:string,
 prepared:PreparedZcashTransaction,verifier:ReverseZcashVerifier){
 await pool.query('SELECT zee.check_reverse_signing($1,$2,$3,$4)',[orderId,jobId,owner,fence]);
 const terms=await reversePayoutTerms(pool,keys,orderId);validatePreparedZcash(prepared,terms);
 await verifier.verifyPrepared(prepared,terms);
 // Recheck the lease/source/COMMIT after the independent wallet/decoder work.
 await pool.query('SELECT zee.store_reverse_payout($1,$2,$3,$4,$5,$6,$7,$8)',[orderId,jobId,owner,fence,
 keys.lookup('zcash-tx',prepared.txid),keys.seal(prepared,payoutContext(orderId)),prepared.feeZatoshi,prepared.expiryHeight]);
}

/** Reconcile independently, including while paused. Never broadcasts or releases reserves. */
export async function observeReversePayout(pool:pg.Pool,keys:PrivateData,orderId:string,verifier:ReverseZcashVerifier){
 const row=(await pool.query('SELECT * FROM zee.reverse_payouts WHERE order_id=$1',[orderId])).rows[0];
 if(!row)throw Error('REVERSE_SIGNED_PAYOUT_MISSING');
 const prepared=keys.open(row.signed_payload,payoutContext(orderId)) as PreparedZcashTransaction;
 const terms=await reversePayoutTerms(pool,keys,orderId);validatePreparedZcash(prepared,terms);
 await verifier.verifyPrepared(prepared,terms);
 const proof=await verifier.receipt(prepared,terms);if(!proof)return {status:'AWAITING_ZCASH_FINALITY'};
 if(proof.txid!==prepared.txid||proof.recipient!==terms.recipient||proof.amountZatoshi!==terms.amountZatoshi
 ||proof.feeZatoshi!==prepared.feeZatoshi||proof.shielded!==true||proof.pool!=='ironwood'
 ||![proof.blockHeight,proof.tipHeight].every(h=>Number.isSafeInteger(h)&&h>0)||proof.tipHeight-proof.blockHeight+1<10
 ||BigInt(proof.blockHeight)>BigInt(prepared.expiryHeight)||!/^[0-9a-f]{64}$/.test(proof.blockHash)||!/^[0-9a-f]{64}$/.test(proof.tipHash)
 ||!Number.isFinite(Date.parse(proof.observedAt))||Date.now()-Date.parse(proof.observedAt)>60000||Date.parse(proof.observedAt)>Date.now()+5000)throw Error('INVALID_REVERSE_ZCASH_RECEIPT');
 const receiptEpoch=await publishObserverBatch(pool,'reverse-payout-receipt',[],[{network:'zcash-testnet',height:proof.blockHeight,hash:proof.blockHash,time:new Date(proof.observedAt)}],proof.blockHeight);
 await transaction(pool,async c=>{
  await requireObserverEpoch(c,receiptEpoch);
  await c.query('SELECT zee.confirm_reverse_payout($1,$2,$3,$4,$5,$6)',[orderId,keys.lookup('zcash-tx',prepared.txid),proof.blockHeight,proof.blockHash,proof.feeZatoshi,keys.seal(proof,receiptContext(orderId))]);
 });
 return {status:'ZCASH_DELIVERY_FINALIZED'};
}

export async function storeEscrowSettlement(pool:pg.Pool,keys:PrivateData,base:BaseContract,orderId:string,jobId:string,owner:string,fence:string,signed:PreparedBaseTransaction){
 const terms=await escrowTerms(pool,keys,base,orderId),tx=parseTransaction(signed.raw);
 if(tx.type!=='legacy'||tx.chainId!==84532||keccak256(signed.raw)!==signed.hash||!Number.isSafeInteger(signed.nonce)||signed.nonce<0||tx.nonce!==signed.nonce
 ||getAddress(await recoverTransactionAddress({serializedTransaction:signed.raw as TransactionSerialized}))!==getAddress(base.registry.operator)
 ||tx.to?.toLowerCase()!==base.registry.contracts.ZeeSwapSettlement.address.toLowerCase()||(tx.value??0n)!==0n
 ||tx.data!==encodeFunctionData({abi:settlementAbi,functionName:'settleEscrow',args:[terms.id]})||!tx.gas||tx.gas>450000n
 ||!tx.gasPrice||tx.gasPrice>20000000n||!/^[1-9][0-9]*$/.test(signed.maxCost)||BigInt(signed.maxCost)>10000000000000n
 ||tx.gas*tx.gasPrice>BigInt(signed.maxCost))throw Error('BASE_ESCROW_SIGNED_SETTLE_MISMATCH');
 await pool.query('SELECT zee.store_escrow_settlement($1,$2,$3,$4,$5,$6,$7)',[orderId,jobId,owner,fence,keys.lookup('base-tx',signed.hash),keys.seal(signed,settleContext(orderId)),signed.maxCost]);
}

export async function observeEscrowSettlement(pool:pg.Pool,keys:PrivateData,base:BaseContract,orderId:string){
 const row=(await pool.query('SELECT * FROM zee.escrow_settlements WHERE order_id=$1',[orderId])).rows[0];if(!row)throw Error('BASE_ESCROW_SETTLE_MISSING');
 const signed=keys.open(row.signed_payload,settleContext(orderId)) as PreparedBaseTransaction;
 const terms=await escrowTerms(pool,keys,base,orderId),p=await finalizedReceipt(base,signed.hash);if(!p)return {status:'AWAITING_BASE_FINALITY'};
 const tx=await base.client.getTransaction({hash:signed.hash}),matches=escrowEvents(base,p.receipt,'EscrowSettled');
 const state=await escrowState(base,terms,p.heads.finalized.number);
 if((await base.client.getBlock({blockNumber:p.heads.finalized.number})).hash!==p.heads.finalized.hash)throw Error('BASE_REORG');
 if(matches.length!==1||matches[0].args.id!==terms.id||matches[0].args.amount!==BigInt(terms.amount)||state!==6
 ||tx.from.toLowerCase()!==base.registry.operator.toLowerCase()||tx.to?.toLowerCase()!==base.registry.contracts.ZeeSwapSettlement.address.toLowerCase()
 ||tx.value!==0n||tx.input!==encodeFunctionData({abi:settlementAbi,functionName:'settleEscrow',args:[terms.id]}))throw Error('BASE_ESCROW_SETTLE_MISMATCH');
 const l1=(p.receipt as any).l1Fee;if(!base.localTest&&typeof l1!=='bigint')throw Error('BASE_FEE_UNAVAILABLE');
 const fee=(p.receipt.gasUsed*p.receipt.effectiveGasPrice+BigInt(l1??0)).toString();
 const proof={transactionHash:signed.hash,blockHeight:Number(p.receipt.blockNumber),blockHash:p.receipt.blockHash,fee,state:'SETTLED',finalizedHeight:Number(p.heads.finalized.number),finalizedHash:p.heads.finalized.hash};
 const epoch=await canonicalCheckpoint(pool,p);
 await transaction(pool,async c=>{await requireObserverEpoch(c,epoch);await c.query('SELECT zee.confirm_escrow_settlement($1,$2,$3,$4,$5,$6)',[orderId,keys.lookup('base-tx',signed.hash),proof.blockHeight,proof.blockHash.slice(2),fee,keys.seal(proof,`escrow-settle-proof:${orderId}:v1`)]);});
 return {status:'SETTLED'};
}
