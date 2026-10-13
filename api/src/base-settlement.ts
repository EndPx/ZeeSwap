import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getAddress, type Hex } from 'viem';
import { transaction } from './db.ts';
import { PrivateData } from './private-data.ts';
import { baseHead } from './observer.ts';
import { BaseContract, publicSettlementId, authNonce, type PayoutTerms, type BasePhase, type ConfirmedBaseReceipt } from './base-contract.ts';
import { validatePrepared, type BaseSigner, type PreparedBaseTransaction } from './base-signer.ts';

const termsContext=(id:string)=>`base-terms:${id}:v1`;
const signedContext=(id:string,phase:string)=>`base-signed:${id}:${phase}:v1`;
export const receiptContext=(id:string,phase:string)=>`base-receipt:${id}:${phase}:v1`;

async function checkpoint(pool:pg.Pool,base:BaseContract){
 if(!base.localTest)return baseHead(pool,base.registry.rpcUrl);
 const {latest,finalized}=await base.heads();
 await pool.query(`INSERT INTO zee.scanner_checkpoints VALUES('base-sepolia',$1,$2,$3,$4,clock_timestamp())
 ON CONFLICT(network) DO UPDATE SET scanned_height=$1,tip_hash=$2,finalized_height=$3,finalized_time=$4,observed_at=clock_timestamp()`,
 [Number(latest.number),latest.hash!.slice(2),Number(finalized.number),new Date(Number(finalized.timestamp)*1000)]);
}
async function saveReceipt(pool:pg.Pool,keys:PrivateData,base:BaseContract,orderId:string,receipt:ConfirmedBaseReceipt){
 await checkpoint(pool,base);
 const block=await base.client.getBlock({blockNumber:BigInt(receipt.blockNumber)});
 if(block.hash!==receipt.blockHash)throw Error('BASE_REORG');
 await transaction(pool,async c=>{
  await c.query(`INSERT INTO zee.chain_observations VALUES('base-sepolia',$1,$2,$3)
   ON CONFLICT(network,height) DO UPDATE SET block_hash=EXCLUDED.block_hash,block_time=EXCLUDED.block_time`,
   [receipt.blockNumber,receipt.blockHash.slice(2),new Date(Number(block.timestamp)*1000)]);
  await c.query('SELECT zee.confirm_base_attempt($1,$2,$3,$4,$5,$6,$7)',[orderId,receipt.phase,keys.lookup('base-tx',receipt.hash),
   receipt.blockNumber,receipt.blockHash.slice(2),receipt.fee,keys.seal(receipt,receiptContext(orderId,receipt.phase))]);
 });
}

/** Reconcile recorded attempts even while dispatch is paused. Never signs or broadcasts. */
export async function reconcileBaseReceipts(pool:pg.Pool,keys:PrivateData,base:BaseContract){
 const rows=(await pool.query(`SELECT a.*,b.terms_payload FROM zee.base_attempts a JOIN zee.base_bindings b USING(order_id)
  WHERE NOT a.confirmed ORDER BY b.created_at,CASE a.phase WHEN 'RESERVE' THEN 0 ELSE 1 END LIMIT 100`)).rows;
 let finalized=0;
 for(const row of rows){
  const terms=keys.open(row.terms_payload,termsContext(row.order_id)) as PayoutTerms;
  const signed=keys.open(row.signed_payload,signedContext(row.order_id,row.phase)) as PreparedBaseTransaction;
  const receipt=await base.receipt(signed.hash,row.phase,terms);
  if(receipt){await saveReceipt(pool,keys,base,row.order_id,receipt);finalized++;}
 }
 return {checked:rows.length,finalized};
}

/** One fenced forward-settlement step. Its durable transaction is never replaced on retry. */
export async function dispatchBaseOnce(pool:pg.Pool,keys:PrivateData,base:BaseContract,signer:BaseSigner){
 await base.preflight();
 await reconcileBaseReceipts(pool,keys,base);
 const owner=randomUUID();
 const job=(await pool.query('SELECT * FROM zee.claim_base_job($1)',[owner])).rows[0];
 if(!job)return {status:'NO_ELIGIBLE_JOB'};
 const row=(await pool.query(`SELECT q.*,o.state,op.id AS operation_id FROM zee.operations op JOIN zee.quotes q ON q.id=op.order_id
  JOIN zee.orders o ON o.id=q.id WHERE op.id=$1`,[job.operation_id])).rows[0];
 if(!row||row.execution_mode!=='base-settlement-v1'||row.base_contract.toLowerCase()!==base.registry.contracts.ZeeSwapSettlement.address.toLowerCase())throw Error('BASE_QUOTE_BINDING_MISMATCH');
 const quote=keys.open(row.private_payload,`quote:${row.id}:v1`) as any;
 if(quote.executionMode!=='base-settlement-v1'||quote.baseContract?.toLowerCase()!==row.base_contract.toLowerCase()
  ||quote.outputAmount!==row.output_amount)throw Error('BASE_QUOTE_BINDING_MISMATCH');
 const id=publicSettlementId(row.settlement_id);
 const proposal:PayoutTerms={id,token:base.registry.contracts.MockUSDC.address,recipient:getAddress(quote.recipient),
  amount:row.output_amount,nonce:authNonce(id,'Payout'),deadline:(BigInt(Math.floor(Date.now()/1000))+86400n).toString()};
 const payload=(await pool.query('SELECT zee.pin_base_terms($1,$2,$3,$4,$5) AS payload',
  [row.id,job.id,owner,job.fence,keys.seal(proposal,termsContext(row.id))])).rows[0].payload;
 const terms=keys.open(payload,termsContext(row.id)) as PayoutTerms;
 if(terms.id!==id||getAddress(terms.recipient)!==getAddress(quote.recipient)||terms.amount!==row.output_amount
  ||getAddress(terms.token)!==getAddress(base.registry.contracts.MockUSDC.address)||terms.nonce!==authNonce(id,'Payout'))throw Error('BASE_IMMUTABLE_TERMS_MISMATCH');
 const attempts=(await pool.query('SELECT * FROM zee.base_attempts WHERE order_id=$1',[row.id])).rows;
 const reserve=attempts.find(a=>a.phase==='RESERVE');
 const phase:BasePhase=reserve?.confirmed?'PAY':'RESERVE';
 const existing=attempts.find(a=>a.phase===phase);
 let signed:PreparedBaseTransaction;
 if(existing){signed=keys.open(existing.signed_payload,signedContext(row.id,phase)) as PreparedBaseTransaction;}
 else{
  if(BigInt(terms.deadline)<=BigInt(Math.floor(Date.now()/1000)))throw Error('BASE_AUTHORIZATION_EXPIRED_RECONCILE');
  const signature=await signer.authorize(terms);await base.assertSignature(terms,signature);
  if(phase==='PAY'){
   if(await base.state(id)!==1)throw Error('BASE_RESERVATION_CHANGED');
  }
  signed=await signer.prepare(terms,phase);
  await validatePrepared(base.registry,terms,signature,phase,signed);
  await pool.query('SELECT zee.store_base_attempt($1,$2,$3,$4,$5,$6,$7,$8)',[row.id,job.id,owner,job.fence,phase,
   keys.lookup('base-tx',signed.hash),keys.seal(signed,signedContext(row.id,phase)),signed.maxCost]);
 }
 const receipt=await base.receipt(signed.hash,phase,terms);
 if(receipt){await saveReceipt(pool,keys,base,row.id,receipt);return {status:phase==='PAY'?'SETTLED':'RESERVATION_FINALIZED'};}
 const known=await base.client.getTransaction({hash:signed.hash}).catch(error=>{
  if(error.name==='TransactionNotFoundError')return null;throw error;
 });
 if(!known){
  if(BigInt(terms.deadline)<=BigInt(Math.floor(Date.now()/1000)))throw Error('BASE_AUTHORIZATION_EXPIRED_RECONCILE');
  await pool.query('SELECT zee.check_base_dispatch($1,$2,$3,$4)',[row.id,job.id,owner,job.fence]);
  if(await base.client.getTransactionCount({address:base.registry.operator,blockTag:'latest'})>signed.nonce)throw Error('BASE_NONCE_CONFLICT_RECONCILE');
  try{
   const hash=await base.client.sendRawTransaction({serializedTransaction:signed.raw});
   if(hash!==signed.hash)throw Error('BASE_BROADCAST_IDENTITY_MISMATCH');
  }catch{throw Error('BASE_BROADCAST_UNCERTAIN_RECONCILE_OR_REBROADCAST_SAME_BYTES');}
 }
 // Inclusion alone never closes an order. A later observer cycle checks finalized.
 return {status:'AWAITING_BASE_FINALITY',phase};
}
