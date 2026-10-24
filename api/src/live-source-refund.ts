import type pg from 'pg';
import type{Hex}from'viem';
import type{PrivateData}from'./private-data.ts';
import type{BaseContract}from'./base-contract.ts';
import type{PreparedBaseTransaction}from'./base-signer.ts';
import type{LocalReverseWalletAdapter}from'./reverse-wallet-adapter.ts';
import type{PreparedZcashTransaction}from'./reverse-settlement.ts';
import {withLiveOperatorLock,requireFreshLiveSourceCheckpoints}from'./live-dispatch-scope.ts';
import {sourceRefundTerms,refundContext,validateRefundBaseTransaction,observeSourceRefundBase,verifyBaseRefund,storeForwardRefund,forwardRefundPayoutTerms,observeForwardRefund}from'./source-refunds.ts';
export type LiveRefundState={version:1;orderId:string;operatorBackendPid?:number;refundEpoch?:string;basePreparedHash?:Hex;baseBroadcast?:'UNKNOWN'|'ACKNOWLEDGED';baseApprovedDigest?:string;approvedDigest?:string};
export type LiveRefundProgress={orderState:string;direction:string;payoutOrCommit:boolean;planned:boolean;baseSigned:boolean;baseConfirmed:boolean;approved:boolean;nativeSigned:boolean};
export function nextLiveRefundStep(p:LiveRefundProgress){
 if(p.orderState==='REFUNDED')return'COMPLETE';
 if(p.direction!=='ZCASH_TO_BASE'||p.payoutOrCommit||!['READY','REFUND_REQUIRED'].includes(p.orderState))throw Error('LIVE_REFUND_PAYOUT_OR_SCOPE_FORBIDDEN');
 if(!p.planned)return'PLAN';if(!p.baseSigned)return'PREPARE_CANCEL';if(!p.baseConfirmed)return'RECONCILE_CANCEL';if(!p.approved)return'APPROVE_NATIVE';if(!p.nativeSigned)return'PREPARE_NATIVE';return'RECONCILE_NATIVE';
}
export interface LiveRefundContext{pool:pg.Pool;keys:PrivateData;base:BaseContract;load(id:string):Promise<LiveRefundState>;save(state:LiveRefundState):Promise<void>;
 prepareCancel(state:LiveRefundState,source:Awaited<ReturnType<typeof sourceRefundTerms>>):Promise<PreparedBaseTransaction>;
 approveNative(state:LiveRefundState,row:any,source:Awaited<ReturnType<typeof sourceRefundTerms>>):Promise<void>;
 wallet(state:LiveRefundState):Promise<LocalReverseWalletAdapter>;nativeJournal(state:LiveRefundState):Promise<{exists:boolean;broadcast:boolean}>}
export async function requireLiveRefundEpoch(pool:pg.Pool,orderId:string,expected?:string){
 const row=(await pool.query('SELECT epoch::text,accepting_orders,dispatch_enabled,reconciliation_required FROM zee.runtime_control WHERE singleton')).rows[0];
 if(!row||row.accepting_orders||row.dispatch_enabled||row.reconciliation_required||expected!==undefined&&row.epoch!==expected)throw Error('LIVE_REFUND_REQUIRES_PAUSED_RECONCILED_EPOCH');
 await requireFreshLiveSourceCheckpoints(pool);await pool.query('SELECT zee.check_source_refund_operator($1)',[orderId]);return row.epoch as string;
}
/** Explicit recovery of one new application's forward source. No policy change,
 * payer funding, quote, generic wallet scan or reverse committed abort exists. */
export async function dispatchLiveRefundOnce(c:LiveRefundContext,orderId:string,retrySameBytes=false){
 if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(orderId))throw Error('LIVE_REFUND_ORDER_REQUIRED');
 return withLiveOperatorLock(c.pool,async lock=>{
  const who=(await c.pool.query('SELECT current_database() AS database,current_user AS role')).rows[0];if(who?.database!=='zee_app_20261023'||who?.role!=='zee_app_worker_20261023')throw Error('WRONG_LIVE_REFUND_DATABASE');
  const order=(await c.pool.query(`SELECT o.state,q.direction,EXISTS(SELECT 1 FROM zee.base_attempts WHERE order_id=o.id AND phase='PAY') OR EXISTS(SELECT 1 FROM zee.escrow_commits WHERE order_id=o.id) OR EXISTS(SELECT 1 FROM zee.reverse_payouts WHERE order_id=o.id) OR EXISTS(SELECT 1 FROM zee.operations WHERE order_id=o.id AND state='CONFIRMED') AS excluded FROM zee.orders o JOIN zee.quotes q USING(id) WHERE o.id=$1`,[orderId])).rows[0];
  if(!order)throw Error('LIVE_REFUND_ORDER_MISSING');
  const row=(await c.pool.query('SELECT * FROM zee.source_refunds WHERE order_id=$1',[orderId])).rows[0],state=await c.load(orderId);
  if(state.orderId!==orderId)throw Error('LIVE_REFUND_STATE_BINDING');
  const step=nextLiveRefundStep({orderState:order.state,direction:order.direction,payoutOrCommit:order.excluded,planned:!!row,baseSigned:!!row?.base_payload,baseConfirmed:!!row?.base_confirmed,approved:!!state.approvedDigest,nativeSigned:!!row?.zcash_payload});
  if(step==='COMPLETE')return{status:'REFUNDED'};
  await lock.check();await c.base.preflight();
  if(step==='PLAN'){
   // This SQL function independently requires paused, reconciled state and
   // rejects paid/committed attempts before it retires ordinary payout jobs.
   await c.pool.query('SELECT zee.begin_source_refund($1)',[orderId]);return{status:'SOURCE_REFUND_PLANNED'};
  }
  const epoch=await requireLiveRefundEpoch(c.pool,orderId,state.refundEpoch);state.refundEpoch=epoch;state.operatorBackendPid=lock.backendPid;await c.save(state);
  const check=async()=>{await lock.check();await requireLiveRefundEpoch(c.pool,orderId,epoch);};
  const source=await sourceRefundTerms(c.pool,c.keys,orderId);
  if(source.row.direction!=='ZCASH_TO_BASE'||source.row.base_contract.toLowerCase()!==c.base.registry.contracts.ZeeSwapSettlement.address.toLowerCase()||BigInt(source.row.received_amount)>200000n)throw Error('LIVE_REFUND_PRINCIPAL_SCOPE');
  if(step==='PREPARE_CANCEL'){
   const signed=await c.prepareCancel(state,source);await check();await validateRefundBaseTransaction(c.base,source.id,'CANCEL',signed,c.base.registry.operator);
   await c.pool.query('SELECT zee.store_source_refund_base($1,$2,$3,$4)',[orderId,c.keys.lookup('base-tx',signed.hash),c.keys.seal(signed,refundContext(orderId,'CANCEL')),signed.maxCost]);
   state.basePreparedHash=signed.hash;await c.save(state);return{status:'CANCEL_SIGNED_DURABLY'};
  }
  const cancel=c.keys.open(row.base_payload,refundContext(orderId,'CANCEL')) as PreparedBaseTransaction;
  if(step==='RECONCILE_CANCEL'){
   const observed=await observeSourceRefundBase(c.pool,c.keys,c.base,orderId,'CANCEL',cancel.hash);if(observed.status==='CANCELLATION_FINALIZED')return observed;
   const known=await c.base.client.getTransaction({hash:cancel.hash}).catch(error=>{if(error.name==='TransactionNotFoundError')return null;throw error;});if(known)return{status:'AWAITING_CANCEL_FINALITY'};
   if((state.baseBroadcast||state.basePreparedHash!==cancel.hash)&&!retrySameBytes)return{status:'WAIT_CANCEL_ORIGINAL_HASH_RECONCILIATION'};
   await validateRefundBaseTransaction(c.base,source.id,'CANCEL',cancel,c.base.registry.operator);await check();
   if(await c.base.client.getTransactionCount({address:c.base.registry.operator,blockTag:'latest'})>cancel.nonce)throw Error('LIVE_REFUND_CANCEL_NONCE_CONFLICT');
   state.baseBroadcast='UNKNOWN';await c.save(state);await check();
   const hash=await c.base.client.sendRawTransaction({serializedTransaction:cancel.raw});if(hash!==cancel.hash)throw Error('LIVE_REFUND_CANCEL_BROADCAST_UNKNOWN');
   state.baseBroadcast='ACKNOWLEDGED';await c.save(state);return{status:'AWAITING_CANCEL_FINALITY'};
  }
  if(!row.base_confirmed||!await verifyBaseRefund(c.base,source.id,'CANCEL',cancel.hash))return{status:'AWAITING_CANCEL_FINALITY'};
  await c.pool.query('SELECT zee.check_source_refund_signing($1)',[orderId]);
  if(step==='APPROVE_NATIVE'){await c.approveNative(state,row,source);return{status:'NATIVE_REFUND_APPROVED'};}
  const wallet=await c.wallet(state);
  if(step==='PREPARE_NATIVE'){
   const journal=await c.nativeJournal(state),prepared=journal.exists?await wallet.recover():await wallet.prepare();await check();
   await storeForwardRefund(c.pool,c.keys,orderId,prepared,wallet);return{status:'NATIVE_REFUND_SIGNED_DURABLY'};
  }
  const observed=await observeForwardRefund(c.pool,c.keys,orderId,wallet);if(observed.status==='REFUNDED')return observed;
  const journal=await c.nativeJournal(state);if(journal.broadcast&&!retrySameBytes)return{status:'WAIT_NATIVE_REFUND_ORIGINAL_HASH_RECONCILIATION'};
  const prepared=c.keys.open(row.zcash_payload,refundContext(orderId,'ZCASH')) as PreparedZcashTransaction,terms=await forwardRefundPayoutTerms(c.pool,c.keys,orderId);
  await wallet.verifyPrepared(prepared,terms);await check();await c.pool.query('SELECT zee.check_source_refund_signing($1)',[orderId]);await wallet.broadcast(prepared,terms);return{status:'AWAITING_NATIVE_REFUND_FINALITY'};
 });
}
