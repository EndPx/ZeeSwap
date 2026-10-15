import {isDeepStrictEqual} from 'node:util';
import {requireG5R4FundingWaitRecovery,requireG5R4HeldReadyBooks} from './g5-r4-funding-wait-recovery.ts';
import {requireG5SdkFaultRetiredLease} from './g5-sdk-fault.ts';
import {g5PathIdentity,type G5State} from './g5-run.ts';
import type {G5LiveState} from './g5-live-controller.ts';
import {depositIdentity,type DepositInput} from './repository.ts';
import type {PrivateData} from './private-data.ts';
export const G5_R4_ORIGINAL_COMMIT='0x318dc755f8732b82f05b644f8455d8404f33d0f9936a20ba6ae40aea6b99b94e';
export const G5_R4_ORIGINAL_COMMIT_FEE='749720000158';
export function requireG5R4VerifyBindingCause(cfg:any,runId:string,path:string){
 if(cfg.branchId!==undefined||cfg.sequence!==2||(cfg.runId!==undefined&&cfg.runId!==runId)||g5PathIdentity(cfg.runConfig)!==g5PathIdentity(path))throw Error('G5_R4_VERIFY_BINDING_EXACT_OMITTED_FIELD_REQUIRED');
}
export function requireG5R4VerifyBindingSource(keys:PrivateData,deposit:any,quote:any,event:{index:number;emitter:string;height:number;blockHash:string;blockTime:Date}){
 const candidate={network:'base-sepolia',txid:'962956490a2885d42bf14c1bc95d0d3a6d86ebe81f65c9e16e3b221bcef65a01',index:event.index,emitter:event.emitter} as DepositInput,identity=depositIdentity(candidate),q=keys.open(quote.private_payload,`quote:${quote.id}:v1`) as any;
 if(!deposit.identity_hash.equals(keys.lookup('deposit',identity)))throw Error('G5_R4_VERIFY_BINDING_SOURCE_IDENTITY_REQUIRED');
 const original=keys.open(deposit.private_payload,`deposit:${identity}:v1`) as DepositInput;
 if(deposit.order_id!==quote.id||deposit.network!=='base-sepolia'||deposit.amount!=='100000'||deposit.classification!=='EXACT'||!deposit.confirmed_at||deposit.shielded||String(deposit.block_height)!==String(event.height)||deposit.block_hash!==event.blockHash||new Date(deposit.block_time).getTime()!==event.blockTime.getTime()
  ||original.network!==candidate.network||original.txid!==candidate.txid||original.index!==candidate.index||original.emitter?.toLowerCase()!==event.emitter.toLowerCase()||original.height!==event.height||original.blockHash!==event.blockHash||new Date(original.blockTime).getTime()!==event.blockTime.getTime()||original.shielded||original.amount!=='100000'||original.reference!==q.reference||original.receiver!==q.depositReceiver
  ||!quote.deposit_reference_hash.equals(deposit.reference_hash)||!quote.receiver_hash.equals(deposit.receiver_hash)||!deposit.reference_hash.equals(keys.lookup('reference',q.reference))||!deposit.receiver_hash.equals(keys.lookup('receiver',q.depositReceiver)))throw Error('G5_R4_VERIFY_BINDING_SOURCE_ANCHOR_REQUIRED');
}
export function requireG5R4VerifyBindingRecovery(main:G5State,manifest:any,controller:G5LiveState,cfg:any,path:string,d:any){
 if(!main.incident||controller.incident||controller.inflight||controller.transitionFailure||controller.preparePriority||controller.slots[3]?.stage!=='OBSERVE_COMMIT'
  ||!controller.lastOutcome||controller.lastOutcome.sequence!==4||!['BROADCAST_COMMIT','OBSERVE_COMMIT'].includes(controller.lastOutcome.stage)||controller.lastOutcome.status!=='AWAITING_BASE_FINALITY'
  ||d?.version!==1||d.exceptionClass!=='Error'||d.observedAt!=='2026-10-15T17:22:53.339Z'||d.step!=='verify'||d.phase!=='base-preflight'||d.code!=='G5_COMPLETED_BASE_DESCRIPTOR_REQUIRED'
  ||!isDeepStrictEqual(d.frames,[{file:'g5-completed-base-descriptor.ts',line:13,column:29},{file:'g5-completed-base-descriptor.ts',line:63,column:9},{file:'g5-operator.ts',line:138,column:44},{file:'g5-operator.ts',line:443,column:4}]))throw Error('G5_ONLY_LITERAL_R4_VERIFY_BINDING_RECOVERABLE');
 const normalized=structuredClone(controller);normalized.incident=true;normalized.inflight={sequence:4,stage:'OBSERVE_SOURCE'};normalized.slots[3].stage='OBSERVE_SOURCE';delete normalized.lastOutcome;
 requireG5R4FundingWaitRecovery({...main,incident:false},manifest,normalized,cfg,path);
}
export function requireG5R4VerifyBindingBooks(books:any,ids:string[],lease:any){
 const commits=books.commits.filter((r:any)=>r.order_id===ids[3]);
 if(commits.length!==1||commits[0].confirmed||commits[0].actual_fee!==null||commits[0].receipt_payload!==null||commits[0].block_height!==null||commits[0].block_hash!==null)throw Error('G5_R4_ORIGINAL_COMMIT_UNCHARGED_REQUIRED');
 const op=books.operations.find((o:any)=>o.order_id===ids[3]),job=books.jobs.find((j:any)=>j.operation_id===op?.id);requireG5SdkFaultRetiredLease(job,lease);
 const normalized={...books,commits:books.commits.filter((r:any)=>r.order_id!==ids[3]),jobs:books.jobs.map((j:any)=>j===job?{...j,fence:'0'}:j)};requireG5R4HeldReadyBooks(normalized,ids);
 return commits[0];
}
export function requireG5R4VerifyBindingNonces(n:number[]){if(!isDeepStrictEqual(n,[12,12,8,8]))throw Error('G5_R4_VERIFY_BINDING_NONCES_CHANGED');}
export async function saveG5R4VerifyBindingMain(main:G5State,io:{save(s:G5State):Promise<void>;read():Promise<G5State>;refreeze():Promise<void>}){
 const next=structuredClone(main);next.incident=false;
 try{await io.save(next);return next;}catch(error){await io.refreeze();try{const current=await io.read();if(isDeepStrictEqual(current,main)||isDeepStrictEqual(current,next))await io.save(main);}catch{}throw error;}
}
