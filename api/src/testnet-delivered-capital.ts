import type pg from 'pg';
import type {PrivateData} from './private-data.ts';
import type {PolicyCapitalNote} from './testnet-policy-capital.ts';
import {depositIdentity,type DepositInput} from './repository.ts';

/** A delivered order's source remains held until final accounting discharges it. */
export async function excludeDeliveredHeldNotes(pool:Pick<pg.Pool,'query'>,keys:PrivateData,policy:string,notes:PolicyCapitalNote[],outputs:any[]){
 const held=new Set<string>();
 for(const output of outputs){
  const identity=depositIdentity({...output,network:'zcash-testnet'} as DepositInput);
  const rows=(await pool.query(`SELECT d.* FROM zee.testnet_policy_admissions a JOIN zee.orders o ON o.id=a.order_id
   JOIN zee.deposits d ON d.id=o.primary_deposit WHERE a.policy_sha256=$1 AND d.identity_hash=$2
   AND zee.testnet_order_delivery_included(o.id)`,[Buffer.from(policy,'hex'),keys.lookup('deposit',identity)])).rows;
  if(!rows.length)continue;
  if(rows.length!==1)throw Error('POLICY_HELD_SOURCE_IDENTITY');
  const d=rows[0],privateDeposit=keys.open(d.private_payload,`deposit:${identity}:v1`) as DepositInput;
  if(d.classification!=='EXACT'||!d.confirmed_at||d.shielded!==true||d.amount!==output.amount||Number(d.block_height)!==output.height||d.block_hash!==output.blockHash||output.pool!=='ironwood'||output.shieldedSource!==true||output.ownChange!==false||privateDeposit.receiver!==output.receiver||privateDeposit.txid!==output.txid||privateDeposit.index!==output.index||privateDeposit.amount!==output.amount)throw Error('POLICY_HELD_SOURCE_PROOF');
  held.add(`${output.pool}:${output.txid}:${output.index}`);
 }
 return notes.filter(n=>!held.has(`${n.pool}:${n.txid}:${n.index}`));
}

/** SQL balances retain pending debits; subtract only original canonical included spends. */
export async function deliveredPendingSpends(pool:Pick<pg.Pool,'query'>,policy:string){
 const r=(await pool.query(`SELECT COALESCE(sum(q.output_amount),0)::text principal,
  COALESCE(sum((SELECT sum(i.fee) FROM zee.base_inclusions i WHERE i.order_id=o.id)),0)::text fee
  FROM zee.testnet_policy_admissions a JOIN zee.orders o ON o.id=a.order_id JOIN zee.quotes q ON q.id=o.id
  WHERE a.policy_sha256=$1 AND zee.testnet_order_delivery_included(o.id)`,[Buffer.from(policy,'hex')])).rows[0];
 if(!r||!/^(0|[1-9][0-9]*)$/.test(r.principal)||!/^(0|[1-9][0-9]*)$/.test(r.fee))throw Error('POLICY_INCLUDED_SPEND_PROOF');
 return{principal:BigInt(r.principal),fee:BigInt(r.fee)};
}
