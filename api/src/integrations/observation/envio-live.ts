import type pg from 'pg';
import type {PrivateData} from '../../private-data.ts';
import {BaseContract,publicSettlementId} from '../../base-contract.ts';
import {observeEscrowFunding} from '../../base-escrow.ts';
import {publishObserverBatch,type CanonicalBlock} from '../../observer-frontiers.ts';
import {fetchEnvioExport} from './envio.ts';
import {readJson,safeEndpoint,type CanonicalReader} from './chef.ts';
import {fresh,requireThat,stable,type Policy,type ReplaceRange} from './types.ts';
import{requiredEnvioAnchors}from'./envio-required-anchors.ts';
import {validateEventFirstState,sampleCanonicalFinalityAtLeast,type EventFirstReader} from './envio-event-first.ts';
import {fetchEventFirstReplacement} from './envio-event-first-consumer.ts';
import {validateEventAuditAdmission,type EventAuditAdmission} from './envio-closed-event-publication.ts';
import {validateOperatorOpeningAdmission,type OperatorOpeningAdmission} from '../../swap-operator-opening-publication.ts';

/** New testnet app observer only. Source events are hints for the original
 * finalized receipt verifier; this module cannot sign or dispatch payments. */
export type FundingHint={orderId:string;txHash:`0x${string}`;height:number;blockHash?:string};
export type EnvioAdmissionState={version:2;hints:FundingHint[];checkpoint?:{height:number;hash:string;generation:string;projectionDigest:string}}|EventAuditAdmission|OperatorOpeningAdmission;
export function validateLiveEnvioAdmission(state:EnvioAdmissionState,generation:string,projectionDigest:string){
 requireThat(state&&[2,3,4].includes(state.version)&&Array.isArray(state.hints)&&state.hints.length<=500,'INVALID_HINT_JOURNAL');
 if(state.version===3)validateEventAuditAdmission(state,generation,projectionDigest);
 if(state.version===4)validateOperatorOpeningAdmission(state,generation,projectionDigest);
 return state;
}
export interface FundingHintJournal{load():Promise<EnvioAdmissionState>;save(state:EnvioAdmissionState):Promise<void>}
export function envioAdmissionFrom(policy:Policy,through:number,previousSqlHeight:number|undefined,state:EnvioAdmissionState,acceptedOrders:number){
 requireThat(Number.isSafeInteger(through)&&through>=policy.birthday,'INVALID_ENVIO_FRONTIER');
 if(!state.checkpoint){requireThat(acceptedOrders===0&&state.hints.length===0,'ENVIO_ADMISSION_JOURNAL_REQUIRED');return Math.max(policy.birthday,through-31);}
 requireThat(state.checkpoint.projectionDigest===policy.projectionDigest,'ENVIO_ADMISSION_GENERATION_CHANGED');
 const previous=Math.min(state.checkpoint.height,previousSqlHeight??state.checkpoint.height);
 const from=Math.max(policy.birthday,previous+1-32);
 requireThat(through>=from&&through-from+1<=(policy.maxBlocks??1000),'ENVIO_ADMISSION_GAP');return from;
}
/** Replace hints only inside a fully validated canonical replacement range. */
export function replaceEnvioFundingHints(previous:FundingHint[],batch:ReplaceRange,known:ReadonlyMap<string,string>){
 const pending=new Map(previous.filter(hint=>hint.height<batch.coverage.fromHeight||hint.height>batch.coverage.through.height).map(hint=>[`${hint.orderId}:${hint.txHash}`,hint]));let unknownEvents=0;
 for(const event of batch.observations){if(event.kind!=='base-contract-event'||event.event!=='Funded'||event.settlementId===null)continue;
  const orderId=known.get(event.settlementId);if(!orderId){unknownEvents++;continue;}
  pending.set(`${orderId}:${event.txHash}`,{orderId,txHash:event.txHash as `0x${string}`,height:event.block.height,blockHash:event.block.hash});}
 requireThat(pending.size<=500,'FUNDING_HINT_LIMIT');return{pending,unknownEvents};
}
export async function observeEnvioOnce(pool:pg.Pool,keys:PrivateData,base:BaseContract,config:{url:string;token:string;policy:Policy;canonical:CanonicalReader;hints:FundingHintJournal;verificationSourceId?:string;eventFirst?:{generation:string;reader:EventFirstReader}}) {
 requireThat(base.registry.chainId===84532&&config.policy.network==='eip155:84532'
  &&config.policy.contract===base.registry.contracts.ZeeSwapSettlement.address.toLowerCase()
  &&config.policy.token===base.registry.contracts.MockUSDC.address.toLowerCase(),'LIVE_BASE_PROFILE_MISMATCH');
 const signal=AbortSignal.timeout(30000),endpoint=safeEndpoint(config.url);
 const response=await fetch(new URL(config.eventFirst?'/zee-observation/event-first/status':'/zee-observation/status',endpoint),{headers:{authorization:`Bearer ${config.token}`},signal,redirect:'error'});
 requireThat(response.ok,'WAIT_ENVIO_EXPORT');
 const status=await readJson(response,signal) as {protocol?:unknown;state?:unknown;checkpoint?:{through?:{height?:unknown};complete?:unknown;sourceSampledAt?:unknown}};
 let producerThrough:number;
 if(config.eventFirst){requireThat(status.protocol==='zee-envio-event-first-status-v1','EVENT_FIRST_STATUS_PROTOCOL');producerThrough=validateEventFirstState(status.state,config.policy,config.eventFirst.generation).progress.height;}
 else{requireThat(status.protocol==='zee-envio-status-v1'&&status.checkpoint?.complete===true&&Number.isSafeInteger(status.checkpoint.through?.height),'COHERENT_CHECKPOINT_REQUIRED');producerThrough=Number(status.checkpoint.through!.height);}
 const admission=await config.hints.load();
 validateLiveEnvioAdmission(admission,config.eventFirst?.generation??admission.checkpoint?.generation??'',config.policy.projectionDigest);
 requireThat(admission.version!==3||config.eventFirst,'EVENT_AUDIT_REQUIRES_EVENT_FIRST_SOURCE');
 requireThat(admission.version!==4||config.eventFirst,'OPERATOR_OPENING_REQUIRES_EVENT_FIRST_SOURCE');
 const previous=(await pool.query("SELECT scanned_height::text,finalized_height::text FROM zee.scanner_checkpoints WHERE network='base-sepolia'")).rows[0];
 const accepted=Number((await pool.query('SELECT count(*)::text AS count FROM zee.orders')).rows[0]?.count);
 const from=envioAdmissionFrom(config.policy,producerThrough,previous?Number(previous.scanned_height):undefined,admission,accepted);
 const batch=config.eventFirst?await fetchEventFirstReplacement(config.url,config.token,from,producerThrough,config.policy,config.eventFirst.generation,config.eventFirst.reader,signal,fetch,{boundedFinalTail:true,preReadFreshness:true,fixedReadStartTarget:true}):await fetchEnvioExport(config.url,config.token,from,config.policy,config.canonical,Date.now(),fetch,config.verificationSourceId);
 fresh(batch.coverage.sourceSampledAt,Date.now());
 requireThat(batch.coverage.sourceHead.height-batch.coverage.through.height<=40,'WAIT_ENVIO_BEHIND_HEAD');
 const sample=await sampleCanonicalFinalityAtLeast(config.canonical,config.verificationSourceId??config.policy.canonicalSourceId,Number(previous?.finalized_height??0),signal);
 requireThat(sample.sourceId===(config.verificationSourceId??config.policy.canonicalSourceId),'WRONG_CANONICAL_SOURCE');fresh(sample.checkedAt,Date.now());
 if(config.eventFirst)requireThat(sample.head.height>=batch.coverage.through.height,'WAIT_ENVIO_BEHIND_HEAD');
 requireThat(sample.finalized&&sample.finalized.height<=batch.coverage.through.height,'WAIT_ENVIO_FINALITY');
 const finalized=sample.finalized;
 requireThat(stable(await config.canonical.header(finalized.height,signal))===stable(finalized),'FINALIZED_HEADER_CONFLICT');
 const anchors=await requiredEnvioAnchors(pool,admission.hints);
 const blocks:CanonicalBlock[]=[];
 const anchorPageSize=config.canonical.headerBatchSize??50;
 for(let index=0;index<anchors.length;index+=anchorPageSize){
  const page=anchors.slice(index,index+anchorPageSize),heights=page.map(row=>Number(row.height));
  const checked=config.canonical.headers?await config.canonical.headers(heights,signal):await Promise.all(heights.map(h=>config.canonical.header(h,signal)));
  for(let i=0;i<checked.length;i++){const header=checked[i]!,expected=page[i]!;
   if(expected.expected_hash!==null&&expected.expected_hash!==header.hash.slice(2)){await pool.query('SELECT zee.enter_reconciliation()');throw Object.assign(Error('ENVIO_FINANCIAL_ANCHOR_CONFLICT'),{code:'ENVIO_FINANCIAL_ANCHOR_CONFLICT'});}
   if(expected.persist)blocks.push({network:'base-sepolia' as const,height:header.height,hash:header.hash.slice(2),time:new Date(header.time)});}
 }
 blocks.push({network:'base-sepolia',height:finalized.height,hash:finalized.hash.slice(2),time:new Date(finalized.time)});
 if(admission.checkpoint)requireThat(admission.checkpoint.generation===batch.coverage.generation,'ENVIO_ADMISSION_GENERATION_CHANGED');
 const bindings=(await pool.query('SELECT o.id,q.settlement_id FROM zee.orders o JOIN zee.quotes q USING(id) JOIN zee.escrow_bindings e ON e.order_id=o.id ORDER BY o.accepted_at LIMIT 501')).rows;
 requireThat(bindings.length<=500,'RECONCILIATION_WINDOW_LIMIT');
 const known=new Map(bindings.map(row=>[publicSettlementId(row.settlement_id),row.id as string]));
 let fundingHints=0;const{pending,unknownEvents}=replaceEnvioFundingHints(admission.hints,batch,known);
 // Hint bytes reach durable storage before SQL can advance. A crash after SQL
 // publication therefore cannot lose a discovered funding transaction.
 await config.hints.save({...admission,hints:[...pending.values()]});
 if(admission.checkpoint){const old=await config.canonical.header(admission.checkpoint.height,signal);
  if(old.hash!==admission.checkpoint.hash){await pool.query('SELECT zee.enter_reconciliation()');throw Object.assign(Error('ENVIO_ADMISSION_REORG_BLOCK'),{code:'ENVIO_ADMISSION_REORG_BLOCK'});}}
 const uniqueBlocks=[...new Map(blocks.map(block=>[block.height,block])).values()];
 signal.throwIfAborted();
 await publishObserverBatch(pool,'envio-coherent-live',[{network:'base-sepolia',height:batch.coverage.through.height,hash:batch.coverage.through.hash.slice(2),
  finalizedHeight:finalized.height,finalizedTime:new Date(finalized.time),observedAt:new Date(batch.coverage.sourceSampledAt)}],uniqueBlocks);
 const next:EnvioAdmissionState={...admission,hints:[...pending.values()],checkpoint:{height:batch.coverage.through.height,hash:batch.coverage.through.hash,generation:batch.coverage.generation,projectionDigest:config.policy.projectionDigest}};
 await config.hints.save(next);
 for(const [id,hint] of pending){
  requireThat(bindings.some(row=>row.id===hint.orderId),'UNKNOWN_STORED_FUNDING_ORDER');
  if(hint.height<=finalized.height){const result=await observeEscrowFunding(pool,keys,base,hint.orderId,hint.txHash);if(result.status==='READY'){pending.delete(id);fundingHints++;}}
 }
 await config.hints.save({...next,hints:[...pending.values()]});
 return {status:'ENVIO_TESTNET_OBSERVED',producerCanonicalSourceId:config.policy.canonicalSourceId,verificationCanonicalSourceId:sample.sourceId,fromHeight:batch.coverage.fromHeight,through:batch.coverage.through.height,sourceHead:batch.coverage.sourceHead.height,sourceSampledAt:batch.coverage.sourceSampledAt,sourceAgeMs:Date.now()-Date.parse(batch.coverage.sourceSampledAt),requiredAnchors:anchors.length,persistedAnchorUpdates:uniqueBlocks.length,finalized:finalized.height,events:batch.observations.length,fundingHints,pendingFundingHints:pending.size,unknownEvents,dispatchAuthority:false};
}
