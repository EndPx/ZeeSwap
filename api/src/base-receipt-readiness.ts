import type pg from 'pg';
import {atomic} from './amounts.ts';
import {ObserverWaitError} from './observer-frontiers.ts';
export interface BaseReceiptConfirmation {orderId:string;phase:'RESERVE'|'PAY';txHash:Buffer;height:number;blockHash:string;fee:string;}
/** Caller owns a transaction. The definer lock preserves the worker's read-only
 * table privileges and serializes these reads with every confirmation writer. */
export async function requireBaseReceiptReadiness(db:pg.PoolClient,p:BaseReceiptConfirmation){
 await db.query('SELECT zee.lock_observer_cycle()');
 if(!['RESERVE','PAY'].includes(p.phase)||!Buffer.isBuffer(p.txHash)||p.txHash.length!==32||!Number.isSafeInteger(p.height)||p.height<0||!/^[0-9a-f]{64}$/.test(p.blockHash))throw Error('BASE_RECEIPT_IDENTITY_INVALID');
 const fee=atomic(p.fee),a=(await db.query('SELECT * FROM zee.base_attempts WHERE order_id=$1 AND phase=$2',[p.orderId,p.phase])).rows[0];
 if(!a||!Buffer.isBuffer(a.tx_hash)||!a.tx_hash.equals(p.txHash))throw Error('BASE_RECEIPT_IDENTITY_MISMATCH');
 if(fee>atomic(a.max_cost))throw Error('BASE_RECEIPT_FEE_CAP_EXCEEDED');
 if(a.confirmed&&(String(a.block_height)!==String(p.height)||a.block_hash!==p.blockHash||a.actual_fee!==p.fee))throw Error('BASE_RECEIPT_CONFIRMED_ANCHOR_CHANGED');
 const anchor=(await db.query("SELECT block_hash FROM zee.chain_observations WHERE network='base-sepolia' AND height=$1",[p.height])).rows[0];
 if(!anchor||anchor.block_hash!==p.blockHash)throw Error('BASE_RECEIPT_CANONICAL_ANCHOR_REQUIRED');
 // An already confirmed identical original follows SQL's idempotent return.
 if(a.confirmed)return;
 const q=(await db.query('SELECT q.*,o.primary_deposit FROM zee.quotes q JOIN zee.orders o USING(id) WHERE q.id=$1',[p.orderId])).rows[0];
 if(!q||q.direction!=='ZCASH_TO_BASE'||q.execution_mode!=='base-settlement-v1')throw Error('BASE_RECEIPT_ORDER_BINDING_REQUIRED');
 const attempts=(await db.query('SELECT phase,confirmed,actual_fee FROM zee.base_attempts WHERE order_id=$1',[p.orderId])).rows;
 const reserve=attempts.find(r=>r.phase==='RESERVE');
 if(p.phase==='PAY'&&(!reserve?.confirmed||reserve.actual_fee===null))throw Error('BASE_RECEIPT_RESERVATION_CONFIRMATION_REQUIRED');
 const totalFee=fee+(p.phase==='PAY'?atomic(reserve.actual_fee):0n);
 const rows=(await db.query(`SELECT r.*,a.balance::text,a.reserved::text FROM zee.reservations r
  JOIN zee.inventory_accounts a USING(asset,purpose) WHERE r.order_id=$1 ORDER BY asset,purpose`,[p.orderId])).rows;
 const expected=[{asset:q.destination_asset,purpose:'principal',amount:q.output_amount},{asset:q.payout_fee_asset,purpose:'fee',amount:q.payout_fee},{asset:q.refund_fee_asset,purpose:'fee',amount:q.refund_fee}];
 if(rows.length!==3||expected.some(e=>!rows.some(r=>r.asset===e.asset&&r.purpose===e.purpose&&r.amount===e.amount&&r.released_at===null)))throw Error('BASE_RECEIPT_RESERVATIONS_CHANGED');
 for(const r of rows){
  const spent=r.asset===q.destination_asset&&r.purpose==='principal'?atomic(q.output_amount):r.asset===q.payout_fee_asset&&r.purpose==='fee'?totalFee:0n;
  if(atomic(r.reserved)<atomic(r.amount)||spent>atomic(r.amount)||p.phase==='PAY'&&atomic(r.balance)<spent)throw Error('BASE_RECEIPT_RESERVATION_INSUFFICIENT');
 }
 const s=(await db.query(`SELECT *,observed_at BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds' AS fresh,
  observed_at<clock_timestamp()-interval '60 seconds' AS stale FROM zee.scanner_checkpoints WHERE network='base-sepolia'`)).rows[0];
 if(!s)throw Error('BASE_RECEIPT_CHECKPOINT_MISSING');
 if(!s.fresh&&!s.stale)throw Error('BASE_RECEIPT_CHECKPOINT_TIME_INVALID');
 if(!s.fresh||BigInt(s.finalized_height)<BigInt(p.height))throw new ObserverWaitError({event:'base-receipt-readiness',source:'base-forward-receipt',status:'WAIT',network:'base-sepolia',reason:!s.fresh?'CHECKPOINT_STALE':'FINALITY_PENDING',receiptHeight:p.height,receiptBlockHash:p.blockHash,scannedHeight:String(s.scanned_height),finalizedHeight:String(s.finalized_height),observedAt:new Date(s.observed_at).toISOString()});
}

/** Diagnostic mapping only. This never classifies an SQL exception as WAIT. */
export function isBaseConfirmationSqlContext(error:unknown){
 const e=error as any;
 return e?.code==='P0001'&&typeof e.where==='string'&&e.where.split('\n').some((line:string)=>/^PL\/pgSQL function (?:zee\.)?confirm_base_attempt\(uuid,text,(?:zee\.)?digest,bigint,text,(?:zee\.)?atomic,bytea\) line [1-9][0-9]* at RAISE$/.test(line));
}
export function baseConfirmationSqlDiagnostic(error:unknown){
 if(!isBaseConfirmationSqlContext(error))return undefined;
 const messages:Record<string,string>={
  'receipt identity mismatch':'BASE_CONFIRM_RECEIPT_IDENTITY_MISMATCH',
  'receipt changed; reconciliation required':'BASE_CONFIRM_RECEIPT_CHANGED',
  'receipt is not finalized canonical':'BASE_CONFIRM_FINALITY_PREDICATE_FAILED',
  'fee cap exceeded; reconcile':'BASE_CONFIRM_FEE_CAP_EXCEEDED',
  'reservation missing':'BASE_CONFIRM_RESERVE_MISSING',
  'reservation insufficient':'BASE_CONFIRM_RESERVE_INSUFFICIENT'};
 const e=error as any,code=typeof e.message==='string'&&Object.hasOwn(messages,e.message)?messages[e.message]:undefined;
 if(!code)return undefined;
 return {code,sqlState:'P0001' as const,function:'zee.confirm_base_attempt' as const};
}
export function baseReceiptReadinessDiagnostic(value:unknown){
 const v=value as any;
 if(!v||v.event!=='base-receipt-readiness'||v.source!=='base-forward-receipt'||v.status!=='WAIT'||v.network!=='base-sepolia'||!['FINALITY_PENDING','CHECKPOINT_STALE'].includes(v.reason)
  ||!Number.isSafeInteger(v.receiptHeight)||v.receiptHeight<0||typeof v.receiptBlockHash!=='string'||!/^[0-9a-f]{64}$/.test(v.receiptBlockHash)
  ||typeof v.scannedHeight!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(v.scannedHeight)||typeof v.finalizedHeight!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(v.finalizedHeight)
  ||typeof v.observedAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v.observedAt)||!Number.isFinite(Date.parse(v.observedAt)))return undefined;
 return {event:'base-receipt-readiness',source:'base-forward-receipt',status:'WAIT',network:'base-sepolia',reason:v.reason,receiptHeight:v.receiptHeight,receiptBlockHash:v.receiptBlockHash,scannedHeight:v.scannedHeight,finalizedHeight:v.finalizedHeight,observedAt:new Date(v.observedAt).toISOString()};
}
