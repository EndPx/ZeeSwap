import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import type {BaseContract} from './base-contract.ts';
import type {PrivateData} from './private-data.ts';
import type {LocalReverseBaseSigner,PreparedBaseTransaction} from './base-signer.ts';
import type {LocalReverseWalletAdapter} from './reverse-wallet-adapter.ts';
import {escrowTerms,observeEscrowCommit,storeEscrowCommit} from './base-escrow.ts';
import {reversePayoutTerms,storeReversePayout,observeReversePayout,storeEscrowSettlement,observeEscrowSettlement,requireFreshReverseDelivery,type PreparedZcashTransaction} from './reverse-settlement.ts';
import {withLeaseHeartbeat} from './lease-heartbeat.ts';
import {withLiveOperatorLock,requireFreshLiveDispatchObservers} from './live-dispatch-scope.ts';
import {isObserverWait} from './observer-frontiers.ts';

export type LiveReverseState={version:1;orderId:string;approvedDigest?:string;dispatchEpoch?:string;operatorBackendPid?:number;currentLease?:{jobId:string;owner:string;fence:string};broadcasts?:Record<string,'UNKNOWN'|'ACKNOWLEDGED'>};
export type ReverseProgress={orderState:string;commit?:{confirmed:boolean};payout?:{confirmed:boolean};settle?:{confirmed:boolean};approved:boolean};
export type ReverseStep='COMMIT'|'APPROVE_NATIVE'|'NATIVE'|'ACK_BASE'|'COMPLETE'|'WAIT_ORDER';
export function nextLiveReverseStep(p:ReverseProgress):ReverseStep {
 if(p.orderState==='SETTLED')return 'COMPLETE';
 if(p.orderState!=='READY')return 'WAIT_ORDER';
 if(!p.commit?.confirmed)return 'COMMIT';
 if(!p.approved)return 'APPROVE_NATIVE';
 if(!p.payout?.confirmed)return 'NATIVE';
 return 'ACK_BASE';
}
export interface LiveReverseContext {
 pool:pg.Pool;keys:PrivateData;base:BaseContract;maxAmountZatoshi:string;
 load(orderId:string):Promise<LiveReverseState>;save(state:LiveReverseState):Promise<void>;
 baseSigner(state:LiveReverseState):Promise<LocalReverseBaseSigner>;
 wallet(state:LiveReverseState):Promise<LocalReverseWalletAdapter>;
 approve(state:LiveReverseState):Promise<void>;
 nativeJournal(state:LiveReverseState):Promise<{exists:boolean;broadcast:boolean}>;
}

/** One bounded transition. No quote, payer funding, policy enabling or old driver.
 * Caller owns explicit process startup; SQL retains source, reserve and lease gates. */
export async function dispatchLiveReverseOnce(c:LiveReverseContext,orderId:string,requested?:ReverseStep,allowSameBytesRetry=false) {
 if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(orderId))throw Error('LIVE_REVERSE_ORDER_REQUIRED');
 return withLiveOperatorLock(c.pool,async lock=>{
  const identity=(await c.pool.query('SELECT current_database() AS database,current_user AS role')).rows[0];
  if(identity.database!=='zee_app_20261023'||identity.role!=='zee_app_worker_20261023')throw Error('WRONG_LIVE_REVERSE_DATABASE');
  try{
  const order=(await c.pool.query(`SELECT o.state,q.direction,q.execution_mode,q.output_amount::text FROM zee.orders o JOIN zee.quotes q USING(id) WHERE o.id=$1`,[orderId])).rows[0];
  if(!order||order.direction!=='BASE_TO_ZCASH'||order.execution_mode!=='base-escrow-v1'||BigInt(order.output_amount)>BigInt(c.maxAmountZatoshi))throw Error('LIVE_REVERSE_ORDER_SCOPE');
  const state=await c.load(orderId);if(state.orderId!==orderId)throw Error('LIVE_REVERSE_STATE_BINDING');
  const [commit,payout,settle]=await Promise.all(['escrow_commits','reverse_payouts','escrow_settlements'].map(table=>c.pool.query(`SELECT * FROM zee.${table} WHERE order_id=$1`,[orderId]).then(r=>r.rows[0])));
  const step=nextLiveReverseStep({orderState:order.state,commit,payout,settle,approved:!!state.approvedDigest});
  if(requested&&requested!==step)throw Error('LIVE_REVERSE_STEP_MISMATCH');
  if(allowSameBytesRetry&&!(step==='COMMIT'?commit:step==='NATIVE'?payout:step==='ACK_BASE'?settle:false))throw Error('LIVE_REVERSE_RETRY_REQUIRES_ORIGINAL_ATTEMPT');
  if(step==='COMPLETE'||step==='WAIT_ORDER')return {status:step};
  await c.base.preflight();
  const controls=(await c.pool.query('SELECT dispatch_enabled,reconciliation_required FROM zee.runtime_control WHERE singleton')).rows[0];
  const dispatch=controls?.dispatch_enabled===true&&controls?.reconciliation_required===false;
  const epoch=dispatch?await requireFreshLiveDispatchObservers(c.pool):undefined;
  async function leased<T>(run:(job:any,owner:string,check:()=>Promise<void>)=>Promise<T>):Promise<T|{status:string}>{
   if(!dispatch)return {status:'WAIT_DISPATCH_PAUSED'};
   let owner=state.currentLease?.owner,job:any;
   if(owner)job=(await c.pool.query(`SELECT * FROM zee.outbox_jobs WHERE id=$1 AND lease_owner=$2 AND fence=$3 AND status='LEASED' AND lease_until>clock_timestamp()`,[state.currentLease!.jobId,owner,state.currentLease!.fence])).rows[0];
   if(!job){owner=randomUUID();job=(await c.pool.query('SELECT * FROM zee.claim_escrow_job_for_order($1,$2)',[owner,orderId])).rows[0];}
   if(!job)return {status:'WAIT_REVERSE_JOB'};
   const operation=(await c.pool.query('SELECT order_id FROM zee.operations WHERE id=$1',[job.operation_id])).rows[0];
   if(operation?.order_id!==orderId)throw Error('LIVE_REVERSE_LEASE_ORDER_MISMATCH');
   if(!Number.isSafeInteger(lock.backendPid)||lock.backendPid!<=0)throw Error('LIVE_OPERATOR_BACKEND_IDENTITY_REQUIRED');
   state.currentLease={jobId:job.id,owner:owner!,fence:String(job.fence)};state.dispatchEpoch=epoch;state.operatorBackendPid=lock.backendPid;await c.save(state);
   return withLeaseHeartbeat(()=>c.pool.query('SELECT zee.renew_base_lease($1,$2,$3)',[job.id,owner,job.fence]),async heartbeat=>{
    const check=async()=>{await heartbeat();await lock.check();await requireFreshLiveDispatchObservers(c.pool,epoch);};await check();return run(job,owner!,check);
   });
  }
  async function broadcastBase(phase:'COMMIT'|'SETTLE',row:any){
   const context=phase==='COMMIT'?`escrow-commit:${orderId}:v1`:`escrow-settle:${orderId}:v1`;
   const signed=c.keys.open(row.signed_payload,context) as PreparedBaseTransaction;
   const known=await c.base.client.getTransaction({hash:signed.hash}).catch(error=>{if(error.name==='TransactionNotFoundError')return null;throw error;});
   if(known)return {status:'AWAITING_BASE_FINALITY'};
   if(state.broadcasts?.[phase]&&!allowSameBytesRetry)throw Error('LIVE_REVERSE_BASE_BROADCAST_UNCERTAIN_SAME_BYTES_ONLY');
   return await leased(async(job,owner,check)=>{
    const gate=phase==='COMMIT'?'check_escrow_dispatch':'check_reverse_signing';
    if(phase==='SETTLE')await requireFreshReverseDelivery(()=>observeReversePayout(c.pool,c.keys,orderId,awaitWallet!),()=>c.pool.query('SELECT zee.check_reverse_delivery($1)',[orderId]));
    if(await c.base.client.getTransactionCount({address:c.base.registry.operator,blockTag:'latest'})>signed.nonce)throw Error('LIVE_REVERSE_NONCE_CONFLICT');
    await check();await c.pool.query(`SELECT zee.${gate}($1,$2,$3,$4)`,[orderId,job.id,owner,job.fence]);
    state.broadcasts={...state.broadcasts,[phase]:'UNKNOWN'};await c.save(state);await check();
    const hash=await c.base.client.sendRawTransaction({serializedTransaction:signed.raw});if(hash!==signed.hash)throw Error('LIVE_REVERSE_BASE_BROADCAST_UNCERTAIN_SAME_BYTES_ONLY');
    state.broadcasts[phase]='ACKNOWLEDGED';await c.save(state);return {status:'AWAITING_BASE_FINALITY'};
   });
  }
  let awaitWallet:LocalReverseWalletAdapter|undefined;
  if(step==='COMMIT'){
   if(commit){const observed=await observeEscrowCommit(c.pool,c.keys,c.base,orderId);if(observed.status==='COMMIT_FINALIZED')return observed;return await broadcastBase('COMMIT',commit);}
   return await leased(async(job,owner,check)=>{
    await c.pool.query('SELECT zee.check_escrow_dispatch($1,$2,$3,$4)',[orderId,job.id,owner,job.fence]);
    const terms=await escrowTerms(c.pool,c.keys,c.base,orderId),signed=await(await c.baseSigner(state)).prepareEscrow(terms,'COMMIT');await check();
    await storeEscrowCommit(c.pool,c.keys,c.base,orderId,job.id,owner,String(job.fence),signed);return {status:'COMMIT_SIGNED_DURABLY'};
   });
  }
  if(step==='APPROVE_NATIVE'){
   if((await observeEscrowCommit(c.pool,c.keys,c.base,orderId)).status!=='COMMIT_FINALIZED')return {status:'AWAITING_BASE_FINALITY'};
   await c.approve(state);return {status:'NATIVE_IMMUTABLE_APPROVAL_SAVED'};
  }
  awaitWallet=await c.wallet(state);
  if(step==='NATIVE'){
   if(payout){
    const observed=await observeReversePayout(c.pool,c.keys,orderId,awaitWallet);if(observed.status==='ZCASH_DELIVERY_FINALIZED')return observed;
    const journal=await c.nativeJournal(state);if(journal.broadcast&&!allowSameBytesRetry)return {status:'AWAITING_ZCASH_FINALITY'};
    return await leased(async(job,owner,check)=>{
     const prepared=c.keys.open(payout.signed_payload,`reverse-payout:${orderId}:v1`) as PreparedZcashTransaction;
     const terms=await reversePayoutTerms(c.pool,c.keys,orderId);await awaitWallet!.verifyPrepared(prepared,terms);await check();
     await c.pool.query('SELECT zee.check_reverse_signing($1,$2,$3,$4)',[orderId,job.id,owner,job.fence]);
     await awaitWallet!.broadcast(prepared,terms);return {status:'AWAITING_ZCASH_FINALITY'};
    });
   }
   return await leased(async(job,owner,check)=>{
    await c.pool.query('SELECT zee.check_reverse_signing($1,$2,$3,$4)',[orderId,job.id,owner,job.fence]);
    const journal=await c.nativeJournal(state),prepared=journal.exists?await awaitWallet!.recover():await awaitWallet!.prepare();await check();
    await storeReversePayout(c.pool,c.keys,orderId,job.id,owner,String(job.fence),prepared,awaitWallet!);return {status:'ZCASH_SIGNED_DURABLY'};
   });
  }
  if(settle){const observed=await observeEscrowSettlement(c.pool,c.keys,c.base,orderId);if(observed.status==='SETTLED')return observed;return await broadcastBase('SETTLE',settle);}
  return await leased(async(job,owner,check)=>{
   await requireFreshReverseDelivery(()=>observeReversePayout(c.pool,c.keys,orderId,awaitWallet!),()=>c.pool.query('SELECT zee.check_reverse_delivery($1)',[orderId]));
   await c.pool.query('SELECT zee.check_reverse_signing($1,$2,$3,$4)',[orderId,job.id,owner,job.fence]);
   const terms=await escrowTerms(c.pool,c.keys,c.base,orderId),signed=await(await c.baseSigner(state)).prepareEscrow(terms,'SETTLE');await check();
   await storeEscrowSettlement(c.pool,c.keys,c.base,orderId,job.id,owner,String(job.fence),signed);return {status:'SETTLE_SIGNED_DURABLY'};
  });
  }catch(error){
   if(isObserverWait(error)||['LIVE_DISPATCH_PAUSED','LIVE_OBSERVER_REQUIRED','LIVE_OBSERVER_STALE'].includes((error as Error).message))return {status:'WAIT_OBSERVERS_OR_POLICY'};
   // Still inside the retained shared operator lock, and only after the exact
   // connected database identity was verified. Unknown outcomes never auto-retry.
   await c.pool.query('SELECT zee.enter_reconciliation()').catch(()=>{});
   throw error;
  }
 });
}
