import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import type pg from 'pg';
import {getAddress} from 'viem';
import {transaction} from './db.ts';
import {Repository,type QuoteInput} from './repository.ts';
import {accessHash,type PrivateData} from './private-data.ts';
import {sourcePrefundWait} from './g5-source-protocol.ts';
import {g5Binding,g5PathIdentity,G5_RETRY_TARGET,type G5State,type G5Order} from './g5-run.ts';

export const sourceAdmissionDigest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const sourceActorRoot=(sequence:number)=>'/home/albary/zeeswap-g5-retry/source-'+String(sequence).padStart(2,'0');
export const sourceActorConfigPath=(sequence:number)=>sourceActorRoot(sequence)+'/source-actor.private.json';
export const sourcePreparedPath=(stateFile:string,slot:G5Order)=>stateFile+'.source-'+slot.sequence+'-attempt-'+(slot.attempt??1)+'.prepared.private.json';
export const sourceAdmittedPath=(stateFile:string,slot:G5Order)=>stateFile+'.source-'+slot.sequence+'-attempt-'+(slot.attempt??1)+'.admitted.private.json';
export interface PreparedSourceAdmission {
 version:1;runId:string;manifestBinding:string;sequence:number;attempt:number;owner:string;receiver:string;
 actorConfigHash:string;input:QuoteInput;epoch:string;basePreflightObservedAt:string;preparedAt:string;
}
const reasons=['SOURCE_SYNC_STALE','SOURCE_CHECKPOINT_STALE','BASE_CHECKPOINT_STALE','BASE_PREFLIGHT_STALE','SOURCE_TIP_BEHIND_SCAN','INSUFFICIENT_WINDOW'];
export function sourceAdmissionWait(sequence:number,reason:string){
 if(!reasons.includes(reason))throw Error('G5_SOURCE_ADMISSION_WAIT_REASON_INVALID');
 return {version:1 as const,status:'SOURCE_ADMISSION_WAIT' as const,sequence,reason,quoteCreated:false,accepted:false};
}
export function isSourceAdmissionWait(value:unknown,sequence:number){
 const v=value as any;return !!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')==='accepted,quoteCreated,reason,sequence,status,version'
  &&v.version===1&&v.status==='SOURCE_ADMISSION_WAIT'&&v.sequence===sequence&&Number.isSafeInteger(sequence)&&sequence>=3&&sequence<=19&&sequence%2===1
  &&reasons.includes(v.reason)&&v.quoteCreated===false&&v.accepted===false;
}
function quoteInput(config:any,slot:G5Order,baseContract:string):QuoteInput{
 const refund=config.forwardOrders?.find((x:any)=>x.sequence===slot.sequence)?.refundRecipient;
 if(typeof refund!=='string'||typeof slot.receiver!=='string')throw Error('G5_SOURCE_PREPARATION_BINDING_REQUIRED');
 return {direction:'ZCASH_TO_BASE',inputAmount:'100000',recipient:getAddress(config.forward.recipient),refundRecipient:refund,
  depositReceiver:slot.receiver,payoutFee:config.baseFeeBudget,refundFee:'10000',executionMode:'base-settlement-v1',baseContract:getAddress(baseContract)};
}
function actorBinding(config:any,state:G5State,slot:G5Order,actor:any,manifestPath:string){
 const root=sourceActorRoot(slot.sequence);
 if(config.branchId!==G5_RETRY_TARGET.branchId||state.binding!==g5Binding(config)||state.incident||state.closed||slot.direction!=='ZCASH_TO_BASE'
  ||!Number.isSafeInteger(slot.sequence)||slot.sequence<3||slot.sequence>19||slot.sequence%2!==1||actor?.sequence!==slot.sequence
  ||actor.branchId!==config.branchId||actor.runId!==state.runId||g5PathIdentity(actor.runConfig)!==g5PathIdentity(manifestPath)
  ||g5PathIdentity(actor.walletPath)!==root+'/user-wallet'||g5PathIdentity(actor.preQuoteSyncFile)!==root+'/source-prequote-sync.private.json'
  ||actor.refundRecipient!==config.forwardOrders?.find((x:any)=>x.sequence===slot.sequence)?.refundRecipient
  ||typeof actor.ufvkSha256!=='string'||!/^[0-9a-f]{64}$/.test(actor.ufvkSha256)||actor.approvedNote?.pool!=='ironwood'
  ||actor.approvedNote.value!=='110000'||!Number.isSafeInteger(actor.approvedNote.index)||actor.approvedNote.index<0
  ||typeof actor.approvedNote.txid!=='string'||!/^[0-9a-f]{64}$/.test(actor.approvedNote.txid))throw Error('G5_SOURCE_PREPARATION_BINDING_REQUIRED');
}
export function prepareSourceAdmission(config:any,state:G5State,slot:G5Order,actor:any,manifestPath:string,baseContract:string,epoch:string,basePreflightObservedAt:string):PreparedSourceAdmission{
 actorBinding(config,state,slot,actor,manifestPath);
 if(slot.orderId||slot.verified||!/^\d+$/.test(epoch)||!Number.isFinite(Date.parse(basePreflightObservedAt)))throw Error('G5_SOURCE_ALREADY_ACCEPTED_RECONCILIATION_REQUIRED');
 return {version:1,runId:state.runId,manifestBinding:state.binding,sequence:slot.sequence,attempt:Number(slot.attempt??1),owner:slot.owner,receiver:slot.receiver!,
  actorConfigHash:sourceAdmissionDigest(actor),input:quoteInput(config,slot,baseContract),epoch,basePreflightObservedAt,preparedAt:new Date().toISOString()};
}
export function requirePreparedSource(config:any,state:G5State,slot:G5Order,actor:any,manifestPath:string,baseContract:string,prepared:PreparedSourceAdmission){
 actorBinding(config,state,slot,actor,manifestPath);
 if(prepared?.version!==1||prepared.runId!==state.runId||prepared.manifestBinding!==state.binding||prepared.sequence!==slot.sequence
  ||prepared.attempt!==Number(slot.attempt??1)||prepared.owner!==slot.owner||prepared.receiver!==slot.receiver
  ||prepared.actorConfigHash!==sourceAdmissionDigest(actor)||!isDeepStrictEqual(prepared.input,quoteInput(config,slot,baseContract))
  ||typeof prepared.epoch!=='string'||!/^\d+$/.test(prepared.epoch)||!Number.isFinite(Date.parse(prepared.basePreflightObservedAt))||!Number.isFinite(Date.parse(prepared.preparedAt)))throw Error('G5_SOURCE_PREPARATION_BINDING_REQUIRED');
}
function clockAge(time:unknown,now:number){if(typeof time!=='string')return Infinity;const age=now-Date.parse(time);if(!Number.isFinite(age)||age< -5000)throw Error('G5_SOURCE_ADMISSION_CLOCK_INVALID');return age;}
/** Only actual captured SYNC and persisted scanner data enter this predicate.
 * No network tip is promoted into SDK scan readiness. */
export function sourceAdmissionDecision(prepared:PreparedSourceAdmission,actor:any,sync:any,source:any,base:any,now:number){
 const sequence=prepared.sequence;
 if(sync?.state!=='SYNCED'||sourceAdmissionDigest(sync.binding)!==sourceAdmissionDigest(actor)||!Number.isSafeInteger(sync.tip)||sync.tip<0)throw Error('G5_SOURCE_SYNC_BINDING_REQUIRED');
 if(clockAge(sync.observedAt,now)>60000)return sourceAdmissionWait(sequence,'SOURCE_SYNC_STALE');
 if(clockAge(prepared.basePreflightObservedAt,now)>120000)return sourceAdmissionWait(sequence,'BASE_PREFLIGHT_STALE');
 if(!source||!base)throw Error('G5_SOURCE_ADMISSION_CHECKPOINT_REQUIRED');
 if(source.network!=='zcash-testnet'||typeof source.tip_hash!=='string'||!/^[0-9a-f]{64}$/.test(source.tip_hash)||source.canonical_hash!==source.tip_hash)throw Error('G5_SOURCE_ADMISSION_CANONICAL_CHECKPOINT_REQUIRED');
 const height=Number(source.scanned_height);if(!Number.isSafeInteger(height)||height<0||!Number.isSafeInteger(height+12))throw Error('G5_SOURCE_ADMISSION_HEIGHT_INVALID');
 if(clockAge(new Date(source.observed_at).toISOString(),now)>60000)return sourceAdmissionWait(sequence,'SOURCE_CHECKPOINT_STALE');
 if(clockAge(new Date(base.observed_at).toISOString(),now)>60000)return sourceAdmissionWait(sequence,'BASE_CHECKPOINT_STALE');
 if(sync.tip<height)return sourceAdmissionWait(sequence,'SOURCE_TIP_BEHIND_SCAN');
 if(height+12-sync.tip<10)return sourceAdmissionWait(sequence,'INSUFFICIENT_WINDOW');
 return {status:'SOURCE_ADMISSION_READY' as const,cutoffHeight:String(height+12)};
}
export async function admitPreparedSource(pool:pg.Pool,keys:PrivateData,config:any,state:G5State,slot:G5Order,actor:any,manifestPath:string,baseContract:string,prepared:PreparedSourceAdmission,sync:any){
 requirePreparedSource(config,state,slot,actor,manifestPath,baseContract,prepared);
 return transaction(pool,async db=>{
  await db.query('SELECT zee.lock_observer_cycle()');
  const control=(await db.query('SELECT epoch::text,accepting_orders,dispatch_enabled,reconciliation_required,clock_timestamp() AS checked_at FROM zee.runtime_control WHERE singleton')).rows[0];
  if(!control||control.reconciliation_required||control.accepting_orders||control.dispatch_enabled)throw Error('G5_SOURCE_ADMISSION_AUTHORITY_CHANGED');
  const existing=(await db.query('SELECT q.id,o.funding_cutoff_height FROM zee.quotes q LEFT JOIN zee.orders o USING(id) WHERE q.access_hash=$1',[accessHash(slot.owner)])).rows;
  if(existing.length>1||slot.orderId&&existing[0]?.id!==slot.orderId)throw Error('G5_PRIVATE_QUOTE_RECOVERY_CONFLICT');
  const repo=new Repository(db,keys);
  const exportFunding=async(id:string,cutoff:string)=>{
   const q=await repo.privateQuote(id,slot.owner) as any;
   if(Object.entries(prepared.input).some(([key,value])=>!isDeepStrictEqual(q[key],value))||q.outputAmount!=='100000')throw Error('G5_IMMUTABLE_QUOTE_MISMATCH');
   return {orderId:id,receiver:slot.receiver!,memo:JSON.stringify({v:1,ref:q.reference}),amountZatoshi:'100000',maxFeeZatoshi:'10000',cutoffHeight:cutoff};
  };
  if(existing.length){
   if(existing[0].funding_cutoff_height===null)throw Error('G5_SOURCE_UNACCEPTED_QUOTE_RECONCILIATION_REQUIRED');
   return {status:'SOURCE_ORIGINAL_ADMISSION_REEXPORTED' as const,sequence:slot.sequence,epoch:control.epoch,funding:await exportFunding(existing[0].id,String(existing[0].funding_cutoff_height))};
  }
  if(control.epoch!==prepared.epoch)throw Error('G5_SOURCE_ADMISSION_AUTHORITY_CHANGED');
  const checkpoints=(await db.query(`SELECT s.*,b.block_hash AS canonical_hash FROM zee.scanner_checkpoints s
   LEFT JOIN zee.chain_observations b ON b.network=s.network AND b.height=s.scanned_height WHERE s.network IN('zcash-testnet','base-sepolia')`)).rows;
  const decision=sourceAdmissionDecision(prepared,actor,sync,checkpoints.find(x=>x.network==='zcash-testnet'),checkpoints.find(x=>x.network==='base-sepolia'),new Date(control.checked_at).getTime());
  if(decision.status==='SOURCE_ADMISSION_WAIT')return decision;
  await db.query('UPDATE zee.runtime_control SET accepting_orders=true WHERE singleton');
  const q=await repo.issueQuote(prepared.input,slot.owner);await repo.accept(q.id,slot.owner);
  const order=(await db.query('SELECT funding_cutoff_height::text AS cutoff FROM zee.orders WHERE id=$1',[q.id])).rows[0];
  if(order?.cutoff!==decision.cutoffHeight)throw Error('G5_SOURCE_ADMISSION_CUTOFF_CHANGED');
  await db.query('UPDATE zee.runtime_control SET accepting_orders=false WHERE singleton');
  return {status:'SOURCE_ADMITTED' as const,sequence:slot.sequence,epoch:control.epoch,funding:await exportFunding(q.id,order.cutoff)};
 });
}

/** Immediate read-only authority recheck after the exclusive ADMITTED journal.
 * No RPC, SDK, observer publication, signing or transaction dispatch. */
export async function requireSourceFundingAuthority(pool:pg.Pool,keys:PrivateData,slot:G5Order,epoch:string,funding:any){
 return transaction(pool,async db=>{
  await db.query('SELECT zee.lock_observer_cycle()');
  const control=(await db.query('SELECT epoch::text,accepting_orders,dispatch_enabled,reconciliation_required FROM zee.runtime_control WHERE singleton')).rows[0];
  if(!control||control.epoch!==epoch||control.accepting_orders||control.dispatch_enabled||control.reconciliation_required)throw Error('G5_SOURCE_ADMISSION_AUTHORITY_CHANGED');
  const row=(await db.query('SELECT q.*,o.funding_cutoff_height,o.state,o.primary_deposit FROM zee.quotes q JOIN zee.orders o USING(id) WHERE q.id=$1',[slot.orderId])).rows[0];
  const q=row?keys.open(row.private_payload,`quote:${slot.orderId}:v1`) as any:undefined;
  if(!row||!q||row.state!=='AWAITING_FUNDS'||row.primary_deposit!==null||!row.access_hash.equals(accessHash(slot.owner))
   ||funding.orderId!==slot.orderId||funding.receiver!==slot.receiver||q.depositReceiver!==slot.receiver||q.direction!=='ZCASH_TO_BASE'
   ||funding.memo!==JSON.stringify({v:1,ref:q.reference})||funding.amountZatoshi!=='100000'||funding.maxFeeZatoshi!=='10000'
   ||funding.cutoffHeight!==String(row.funding_cutoff_height))throw Error('G5_SOURCE_ACCEPTED_FUNDING_BINDING_CHANGED');
  return {status:'SOURCE_FUNDING_AUTHORIZED',sequence:slot.sequence,epoch};
 });
}

/** The preparation capability deliberately has no quote, accept or fund callback. */
export async function runSourcePreparation(io:{validateRefund():Promise<void>;allocateReceiver():Promise<string>;basePreflight():Promise<string>;refresh():Promise<unknown>}){
 await io.validateRefund();const receiver=await io.allocateReceiver(),basePreflightObservedAt=await io.basePreflight();await io.refresh();return {receiver,basePreflightObservedAt};
}

/** A single durable action owns sync -> SQL admission -> admitted intent -> fund.
 * There is no observer snapshot or SDK resync after acceptance. */
export async function admitAndFundSource(sequence:number,io:{sync():Promise<any>;admit():Promise<any>;recordAdmitted(result:any):Promise<void>;authorize(result:any):Promise<any>;fund():Promise<any>}){
 const synced=await io.sync();
 if(synced.status==='SOURCE_PREFUND_WAIT'&&sourcePrefundWait(synced,sequence))return synced;
 if(synced.status!=='SYNCED')throw Error('G5_LIVE_FRESH_SOURCE_SYNC_REQUIRED');
 const admitted=await io.admit();if(isSourceAdmissionWait(admitted,sequence))return admitted;
 if(admitted.status!=='SOURCE_ADMITTED'||admitted.sequence!==sequence||typeof admitted.epoch!=='string'||!/^\d+$/.test(admitted.epoch)||typeof admitted.fundingSha256!=='string'||!/^[0-9a-f]{64}$/.test(admitted.fundingSha256))throw Error('G5_SOURCE_ORIGINAL_ADMISSION_RECONCILIATION_REQUIRED');
 await io.recordAdmitted(admitted);
 const authority=await io.authorize(admitted);if(authority?.status!=='SOURCE_FUNDING_AUTHORIZED'||authority.sequence!==sequence||authority.epoch!==admitted.epoch)throw Error('G5_SOURCE_ADMISSION_AUTHORITY_CHANGED');
 const funded=await io.fund();if(['SOURCE_PREFUND_WAIT','SOURCE_ADMISSION_WAIT','OBSERVER_WAIT'].includes(funded.status))throw Error('G5_LIVE_FUND_CANNOT_WAIT');return funded;
}
