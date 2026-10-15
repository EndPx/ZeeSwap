import type pg from 'pg';
import {encodeFunctionData,getAddress,keccak256,parseTransaction,recoverTransactionAddress,type Hex,type Address,type TransactionSerialized} from 'viem';
import {BaseContract,settlementAbi,publicSettlementId} from './base-contract.ts';
import {escrowTerms,escrowState,escrowEvents,finalizedReceipt,canonicalCheckpoint} from './base-escrow.ts';
import {PrivateData} from './private-data.ts';
import {transaction} from './db.ts';
import {validatePreparedZcash,type PreparedZcashTransaction,type ReversePayoutTerms,type ReverseZcashVerifier} from './reverse-settlement.ts';
import type {PreparedBaseTransaction} from './base-signer.ts';

export type RefundPhase='CANCEL'|'REFUND';
export const refundContext=(id:string,phase:string)=>`source-refund:${id}:${phase}:v1`;
export function sourceRefundCall(phase:RefundPhase,id:Hex){return encodeFunctionData({abi:settlementAbi,functionName:phase==='CANCEL'?'cancelSettlement':'refund',args:[id]});}
export async function sourceRefundTerms(pool:pg.Pool,keys:PrivateData,orderId:string){
 const row=(await pool.query(`SELECT q.*,d.id AS deposit_id,d.amount AS received_amount,d.confirmed_at,d.classification
  FROM zee.quotes q JOIN zee.orders o ON o.id=q.id JOIN zee.deposits d ON d.id=o.primary_deposit WHERE q.id=$1`,[orderId])).rows[0];
 if(!row||!row.confirmed_at||!['EXACT','UNDER','OVER','LATE'].includes(row.classification)
  ||!['base-settlement-v1','base-escrow-v1'].includes(row.execution_mode))throw Error('SOURCE_REFUND_CONFIRMED_PRIMARY_REQUIRED');
 const q=keys.open(row.private_payload,`quote:${orderId}:v1`) as any;
 if(!q.refundRecipient||q.inputAmount!==row.input_amount||q.outputAmount!==row.output_amount
  ||q.executionMode!==row.execution_mode||q.baseContract!==row.base_contract)throw Error('SOURCE_REFUND_IMMUTABLE_QUOTE_MISMATCH');
 return {row,recipient:q.refundRecipient as string,id:publicSettlementId(row.settlement_id)};
}
export async function validateRefundBaseTransaction(base:BaseContract,id:Hex,phase:RefundPhase,p:PreparedBaseTransaction,signer:Address){
 const tx=parseTransaction(p.raw);
 if(tx.type!=='legacy'||tx.chainId!==84532||keccak256(p.raw)!==p.hash||!Number.isSafeInteger(p.nonce)||p.nonce<0||tx.nonce!==p.nonce
  ||getAddress(await recoverTransactionAddress({serializedTransaction:p.raw as TransactionSerialized}))!==getAddress(signer)
  ||tx.to?.toLowerCase()!==base.registry.contracts.ZeeSwapSettlement.address.toLowerCase()||(tx.value??0n)!==0n
  ||tx.data!==sourceRefundCall(phase,id)||!tx.gas||tx.gas>450000n||!tx.gasPrice||tx.gasPrice>20000000n
  ||!/^[1-9][0-9]*$/.test(p.maxCost)||BigInt(p.maxCost)>10000000000000n||tx.gas*tx.gasPrice>BigInt(p.maxCost))throw Error('SOURCE_REFUND_SIGNED_BASE_MISMATCH');
}

/** Finalized terminal onchain state excludes every old authorization, including
 * a late broadcast or an RPC response lost before cancellation won the race.
 * Caller tx hash only selects independent chain reads; it is never a proof.
 */
export async function verifyBaseRefund(base:BaseContract,id:Hex,phase:RefundPhase,hash:Hex,terms?:Awaited<ReturnType<typeof escrowTerms>>){
 await base.preflight();
 const p=await finalizedReceipt(base,hash);if(!p)return null;
 const tx=await base.client.getTransaction({hash}),address=base.registry.contracts.ZeeSwapSettlement.address;
 const matches=escrowEvents(base,p.receipt,phase==='CANCEL'?'SettlementCancelled':'Refunded');
 if(tx.to?.toLowerCase()!==address.toLowerCase()||tx.value!==0n||tx.input!==sourceRefundCall(phase,id)
  ||matches.length!==1||matches[0].args.id!==id)throw Error('SOURCE_REFUND_BASE_RECEIPT_MISMATCH');
 if(phase==='CANCEL'){
  if(tx.from.toLowerCase()!==base.registry.operator.toLowerCase()
   ||await base.client.readContract({address,abi:settlementAbi,functionName:'states',args:[id],blockNumber:p.heads.finalized.number})!==3)
   throw Error('PERMANENT_FINALIZED_CANCELLATION_REQUIRED');
 }else{
  if(!terms||terms.id!==id||await escrowState(base,terms,p.heads.finalized.number)!==7
   ||tx.from.toLowerCase()!==terms.payer.toLowerCase()||getAddress(matches[0].args.recipient)!==terms.refundRecipient
   ||matches[0].args.amount!==BigInt(terms.amount)||p.block.timestamp<BigInt(terms.cancellationAvailableAt))throw Error('SOURCE_REFUND_ESCROW_RECEIPT_MISMATCH');
 }
 if((await base.client.getBlock({blockNumber:p.heads.finalized.number})).hash!==p.heads.finalized.hash)throw Error('BASE_REORG');
 const l1=(p.receipt as any).l1Fee;if(!base.localTest&&typeof l1!=='bigint')throw Error('BASE_FEE_UNAVAILABLE');
 return {...p,fee:(p.receipt.gasUsed*p.receipt.effectiveGasPrice+BigInt(l1??0)).toString()};
}

/** No committed-abort implementation exists in the deployed contract. Expiry
 * alone and NOT_FOUND both remain insufficient and cannot reach any refund.
 */
export async function assertReverseRefundEligible(base:BaseContract,terms:Awaited<ReturnType<typeof escrowTerms>>){
 await base.preflight();const heads=await base.heads();
 if(await escrowState(base,terms,heads.finalized.number)!==4||heads.finalized.timestamp<BigInt(terms.cancellationAvailableAt)
  ||await escrowState(base,terms,heads.latest.number)!==4)throw Error('UNCOMMITTED_ESCROW_AFTER_CANONICAL_DEADLINE_REQUIRED');
 if((await base.client.getBlock({blockNumber:heads.finalized.number})).hash!==heads.finalized.hash)throw Error('BASE_REORG');
 return heads;
}
export async function observeSourceRefundBase(pool:pg.Pool,keys:PrivateData,base:BaseContract,orderId:string,phase:RefundPhase,hash:Hex){
 const q=await sourceRefundTerms(pool,keys,orderId);
 if((phase==='CANCEL')!==(q.row.direction==='ZCASH_TO_BASE'))throw Error('SOURCE_REFUND_DIRECTION_MISMATCH');
 const proof=await verifyBaseRefund(base,q.id,phase,hash,phase==='REFUND'?await escrowTerms(pool,keys,base,orderId):undefined);
 if(!proof)return {status:'AWAITING_BASE_FINALITY'};
 await transaction(pool,async c=>{await canonicalCheckpoint(c,proof);await c.query('SELECT zee.confirm_source_refund_base($1,$2,$3,$4,$5,$6,$7)',
  [orderId,phase,keys.lookup('base-tx',hash),Number(proof.receipt.blockNumber),proof.receipt.blockHash.slice(2),proof.fee,
   keys.seal({hash,phase,fee:proof.fee,blockHeight:Number(proof.receipt.blockNumber),blockHash:proof.receipt.blockHash},refundContext(orderId,phase+'-proof'))]);});
 return {status:phase==='CANCEL'?'CANCELLATION_FINALIZED':'REFUNDED'};
}
export async function forwardRefundPayoutTerms(pool:pg.Pool,keys:PrivateData,orderId:string):Promise<ReversePayoutTerms>{
 const q=await sourceRefundTerms(pool,keys,orderId);
 if(q.row.direction!=='ZCASH_TO_BASE')throw Error('FORWARD_SOURCE_REFUND_REQUIRED');
 return {orderId,operationId:orderId,recipient:q.recipient,amountZatoshi:q.row.received_amount,maxFeeZatoshi:q.row.refund_fee};
}
export async function storeForwardRefund(pool:pg.Pool,keys:PrivateData,orderId:string,p:PreparedZcashTransaction,verifier:ReverseZcashVerifier){
 await pool.query('SELECT zee.check_source_refund_signing($1)',[orderId]);
 const q=await forwardRefundPayoutTerms(pool,keys,orderId);validatePreparedZcash(p,q);await verifier.verifyPrepared(p,q);
 await pool.query('SELECT zee.store_source_refund_zcash($1,$2,$3,$4,$5)',[orderId,keys.lookup('zcash-tx',p.txid),keys.seal(p,refundContext(orderId,'ZCASH')),p.feeZatoshi,p.expiryHeight]);
}
export async function observeForwardRefund(pool:pg.Pool,keys:PrivateData,orderId:string,verifier:ReverseZcashVerifier){
 const row=(await pool.query('SELECT * FROM zee.source_refunds WHERE order_id=$1',[orderId])).rows[0];
 if(!row?.zcash_payload)throw Error('DURABLE_SOURCE_REFUND_MISSING');
 const p=keys.open(row.zcash_payload,refundContext(orderId,'ZCASH')) as PreparedZcashTransaction,q=await forwardRefundPayoutTerms(pool,keys,orderId);
 validatePreparedZcash(p,q);await verifier.verifyPrepared(p,q);const proof=await verifier.receipt(p,q);
 if(!proof)return {status:'AWAITING_ZCASH_FINALITY'};
 const age=Date.now()-Date.parse(proof.observedAt);
 if(proof.txid!==p.txid||proof.recipient!==q.recipient||proof.amountZatoshi!==q.amountZatoshi||proof.feeZatoshi!==p.feeZatoshi
  ||proof.shielded!==true||proof.pool!=='ironwood'||![proof.blockHeight,proof.tipHeight].every(n=>Number.isSafeInteger(n)&&n>0)
  ||proof.tipHeight-proof.blockHeight+1<10||BigInt(proof.blockHeight)>BigInt(p.expiryHeight)
  ||!/^[0-9a-f]{64}$/.test(proof.blockHash)||!/^[0-9a-f]{64}$/.test(proof.tipHash)||!Number.isFinite(age)||age< -5000||age>60000)
  throw Error('SOURCE_REFUND_ZCASH_RECEIPT_MISMATCH');
 await transaction(pool,async c=>{
  await c.query(`INSERT INTO zee.scanner_checkpoints VALUES('zcash-testnet',$1,$2,$1::bigint-9,$3,$3)
   ON CONFLICT(network) DO UPDATE SET scanned_height=$1,tip_hash=$2,finalized_height=$1::bigint-9,finalized_time=$3,observed_at=$3`,[proof.tipHeight,proof.tipHash,new Date(proof.observedAt)]);
  await c.query(`INSERT INTO zee.chain_observations VALUES('zcash-testnet',$1,$2,$3)
   ON CONFLICT(network,height) DO UPDATE SET block_hash=$2,block_time=$3`,[proof.blockHeight,proof.blockHash,new Date(proof.observedAt)]);
  await c.query('SELECT zee.confirm_source_refund_zcash($1,$2,$3,$4,$5,$6)',[orderId,keys.lookup('zcash-tx',p.txid),proof.blockHeight,proof.blockHash,p.feeZatoshi,keys.seal(proof,refundContext(orderId,'ZCASH-proof'))]);
 });return {status:'REFUNDED'};
}
