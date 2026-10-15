/** Read-only controller admission snapshot. Holds the core lock only while
 * reading, and releases it before any child operator is invoked. */
import {g5RunDatabasePartition} from '../src/g5-quote-attempts.ts';
import {g5Context} from './g5-context.ts';
import {g5ControllerNonceReadiness,type G5ControllerRaw} from '../src/g5-controller-nonce.ts';
const [path]=process.argv.slice(2);if(!path||process.argv.length!==3)throw Error('G5_CONTROLLER_STATUS_CONFIG_REQUIRED');
const c=await g5Context(path);
try{
 const control=(await c.admin.query('SELECT accepting_orders,dispatch_enabled,reconciliation_required FROM zee.runtime_control')).rows[0];
 if(control.accepting_orders||control.dispatch_enabled)throw Error('G5_CONTROLLER_PAUSED_CORE_REQUIRED');
 const rows=(await g5RunDatabasePartition(c.admin,c.state,c.r.keys,c.config.stateFile)).orders;
 if(rows.some(r=>!c.state.orders.some(o=>o.orderId===r.id)))throw Error('G5_CONTROLLER_UNKNOWN_CORE_ORDER');
 const pending=(await c.admin.query(`SELECT order_id,phase,signed_payload,'forward' AS kind FROM zee.base_attempts WHERE NOT confirmed
  UNION ALL SELECT order_id,'COMMIT',signed_payload,'commit' FROM zee.escrow_commits WHERE NOT confirmed
  UNION ALL SELECT order_id,'SETTLE',signed_payload,'settle' FROM zee.escrow_settlements WHERE NOT confirmed`)).rows;
 const [latestNonce,pendingNonce]=await Promise.all([c.base.client.getTransactionCount({address:c.base.registry.operator,blockTag:'latest'}),c.base.client.getTransactionCount({address:c.base.registry.operator,blockTag:'pending'})]);
 const attempts:G5ControllerRaw[]=[];
 for(const row of pending){
  const slot=c.state.orders.find(o=>o.orderId===row.order_id);if(!slot)throw Error('G5_CONTROLLER_UNKNOWN_RAW_SLOT');
  const context=row.kind==='forward'?`base-signed:${row.order_id}:${row.phase}:v1`:`escrow-${row.kind}:${row.order_id}:v1`;
  const signed=c.r.keys.open(row.signed_payload,context) as any;attempts.push({sequence:slot.sequence,raw:signed.raw,hash:signed.hash,nonce:signed.nonce});
 }
 const readiness=await g5ControllerNonceReadiness({operator:c.base.registry.operator,settlement:c.base.registry.contracts.ZeeSwapSettlement.address,latestNonce,pendingNonce,attempts},{transaction:hash=>c.base.client.getTransaction({hash}).catch(e=>{if(e.name==='TransactionNotFoundError')return null;throw e;}),receipt:hash=>c.base.client.getTransactionReceipt({hash}),block:blockNumber=>c.base.client.getBlock({blockNumber})});
 const fees=(await c.admin.query("SELECT (balance-reserved)::text AS available FROM zee.inventory_accounts WHERE asset='baseETH' AND purpose='fee'")).rows;
 if(fees.length!==1)throw Error('G5_CONTROLLER_FEE_BOOK_REQUIRED');
 console.log(JSON.stringify({status:'G5_CONTROLLER_SNAPSHOT',runId:c.state.runId,incident:!!c.state.incident,reconciliationRequired:control.reconciliation_required,closed:!!c.state.closed,availableBaseFeeWei:fees[0].available,...readiness,barriers:c.state.barriers??[],orders:c.state.orders.map(o=>({sequence:o.sequence,state:rows.find(r=>r.id===o.orderId)?.state??'UNACCEPTED',receiptVerified:!!o.receiptVerified}))}));
}finally{await c.close(false);}
