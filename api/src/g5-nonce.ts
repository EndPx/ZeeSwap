import type pg from 'pg';
import {PrivateData} from './private-data.ts';
import {BaseContract} from './base-contract.ts';
/** Run-wide preparation serialization, in addition to the independent signer's
 * global nonce journal. A different durable but not-yet-included transaction
 * must be broadcast/reconciled before another operator nonce can be signed.
 */
export async function requireG5NonceReady(pool:Pick<pg.Pool,'query'>,keys:PrivateData,base:BaseContract,orderId:string,phase:string){
 const rows=(await pool.query(`SELECT order_id,phase,signed_payload,'base-signed' AS context FROM zee.base_attempts WHERE NOT confirmed
 UNION ALL SELECT order_id,'COMMIT',signed_payload,'escrow-commit' FROM zee.escrow_commits WHERE NOT confirmed
 UNION ALL SELECT order_id,'SETTLE',signed_payload,'escrow-settle' FROM zee.escrow_settlements WHERE NOT confirmed`)).rows;
 for(const row of rows){
  if(row.order_id===orderId&&row.phase===phase)continue;
  const context=row.context==='base-signed'?`base-signed:${row.order_id}:${row.phase}:v1`:`${row.context}:${row.order_id}:v1`;
  const signed=keys.open(row.signed_payload,context) as any;
  const known=await base.client.getTransaction({hash:signed.hash}).catch(error=>{if(error.name==='TransactionNotFoundError')return null;throw error;});
  if(!known||known.blockNumber===null||await base.client.getTransactionCount({address:base.registry.operator,blockTag:'latest'})<=signed.nonce)throw Error('G5_PREVIOUS_OPERATOR_NONCE_MUST_LAND');
 }
}
