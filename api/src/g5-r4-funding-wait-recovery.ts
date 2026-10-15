import {createHash} from 'node:crypto';
import {g5Binding,g5PathIdentity,G5_RETRY_TARGET,validateG5OpeningLedger,type G5State} from './g5-run.ts';
import type {G5LiveState} from './g5-live-controller.ts';
import {isDeepStrictEqual} from 'node:util';
export const G5_R4_ORIGINAL_FUND='0x962956490a2885d42bf14c1bc95d0d3a6d86ebe81f65c9e16e3b221bcef65a01';
function requireFundedR4Scope(main:G5State,manifest:any,controller:G5LiveState,cfg:any,manifestPath:string){
 if(manifest.branchId!==G5_RETRY_TARGET.branchId||manifest.runId!=='1f34e059-4de1-49f6-bbaa-323008577994'||main.runId!==manifest.runId||main.binding!==g5Binding(manifest)||!main.policyInitialized||main.incident||main.closed||main.batchSize!==5||main.orders.length!==4||(main.barriers?.length??0)!==0
  ||main.orders.some((o,i)=>o.sequence!==i+1||!o.orderId||o.direction!==(i%2?'BASE_TO_ZCASH':'ZCASH_TO_BASE')||o.verified)||main.orders.slice(0,3).some(o=>!o.receiptVerified)||main.orders[3].receiptVerified
  ||controller.version!==2||controller.runId!==main.runId||!controller.incident||controller.closed||controller.barriers.length!==0||controller.slots.length!==4||controller.slots.some((o,i)=>o.sequence!==i+1||i<3&&o.stage!=='DONE')
  ||cfg.runId!==main.runId||cfg.manifestBinding!==g5Binding(manifest)||g5PathIdentity(cfg.runConfig)!==g5PathIdentity(manifestPath)||controller.binding!==createHash('sha256').update(JSON.stringify(cfg)).digest('hex'))throw Error('G5_ONLY_LITERAL_R4_SOURCE_FINALITY_WAIT_RECOVERABLE');
}
export function requireG5R4FundingWaitRecovery(main:G5State,manifest:any,controller:G5LiveState,cfg:any,manifestPath:string){
 requireFundedR4Scope(main,manifest,controller,cfg,manifestPath);
 if(controller.slots[3].stage!=='OBSERVE_SOURCE'||controller.inflight?.sequence!==4||controller.inflight.stage!=='OBSERVE_SOURCE'||controller.lastOutcome&&(controller.lastOutcome.sequence!==4||controller.lastOutcome.stage!=='OBSERVE_SOURCE'||controller.lastOutcome.status!=='AWAITING_BASE_FINALITY')||controller.transitionFailure&&controller.transitionFailure.code!=='G5_LIVE_UNEXPECTED_STAGE_STATUS')throw Error('G5_ONLY_LITERAL_R4_SOURCE_FINALITY_WAIT_RECOVERABLE');
}
export function requireG5R4PrecommitStartupRecovery(main:G5State,manifest:any,controller:G5LiveState,cfg:any,manifestPath:string,packet:any){
 requireFundedR4Scope(main,manifest,controller,cfg,manifestPath);const d=packet?.diagnostic;
 if(controller.slots[3].stage!=='PREPARE_COMMIT'||controller.inflight?.sequence!==4||controller.inflight.stage!=='PREPARE_COMMIT'||controller.lastOutcome?.sequence!==4||controller.lastOutcome.stage!=='OBSERVE_SOURCE'||controller.lastOutcome.status!=='READY'||controller.transitionFailure?.code!=='G5_LIVE_ACTION_OR_SAVE_FAILED'
  ||packet.version!==1||packet.status!=='G5_REVERSE_INITIALIZATION_FAILED'||d?.observedAt!=='2026-10-15T16:56:30.903Z'||d.step!=='prepare-commit'||d.phase!=='G5_REVERSE_INIT_SLOT'||d.code!=='ETIMEDOUT'||d.exceptionClass!=='Error'
  ||!isDeepStrictEqual(d.frames,[{file:'g5-context.ts',line:17,column:50},{file:'g5-slot.ts',line:17,column:100},{file:'g5-reverse-operator.ts',line:43,column:21},{file:'g5-reverse-operator.ts',line:33,column:19}]))throw Error('G5_ONLY_LITERAL_R4_PRECOMMIT_READ_TIMEOUT_RECOVERABLE');
}
export function g5R4OriginalOperatorRows(books:any){
 const rows=[...books.forwards.map((a:any)=>({...a,kind:'forward'})),...books.commits.map((a:any)=>({...a,kind:'commit',phase:'COMMIT'})),...books.settles.map((a:any)=>({...a,kind:'settle',phase:'SETTLE'}))];
 if(rows.length!==6||rows.some(r=>r.kind==='forward'?!['RESERVE','PAY'].includes(r.phase):!['COMMIT','SETTLE'].includes(r.phase)))throw Error('G5_R4_ORIGINAL_SIX_PHASES_REQUIRED');return rows;
}
export function requireG5R4FundingWaitLedger(rows:any[],openingEvent:string,r4:string){
 validateG5OpeningLedger(rows.filter(r=>r.event_id===openingEvent),openingEvent,G5_RETRY_TARGET.branchId);
 const groups=new Map<string,bigint>();for(const r of rows){const key=r.event_id+':'+r.asset;groups.set(key,(groups.get(key)??0n)+BigInt(r.amount));}if([...groups.values()].some(n=>n!==0n))throw Error('G5_R4_WAIT_UNBALANCED_LEDGER');
 const sum=(asset:string,bucket:string,order?:string)=>rows.filter(r=>r.asset===asset&&r.bucket===bucket&&(!order||r.order_id===order)).reduce((n,r)=>n+BigInt(r.amount),0n);
 if(sum('TAZ','operator:unreconciled')!==200000n||sum('mockUSDC','operator:unreconciled')!==100000n||sum('mockUSDC','customer:held',r4)!==100000n||sum('mockUSDC','customer:liability',r4)!==-100000n||sum('mockUSDC','operator:unreconciled',r4)!==0n
  ||rows.some(r=>r.order_id===r4&&['principal:spent','fee:spent','operator:source-reorg-quarantined','operator:source-reorg-loss'].includes(r.bucket)))throw Error('G5_R4_WAIT_EXACT_SOURCE_LEDGER_REQUIRED');
}
export function requireG5R4FundingWaitNonces(nonces:number[]){if(JSON.stringify(nonces)!==JSON.stringify([11,11,8,8]))throw Error('G5_R4_FUNDING_WAIT_NONCE_CHANGED');}
export function requireG5R4HeldReadyBooks(books:any,ids:string[]){
 const r4=ids[3],op=books.operations.find((o:any)=>o.order_id===r4),job=books.jobs.find((j:any)=>j.operation_id===op?.id);
 if(books.migrations.length!==14||books.quotes.length!==4||books.quotes.some((q:any)=>!ids.includes(q.id)||q.input_amount!=='100000'||q.output_amount!=='100000')||books.orders.length!==4||books.orders.some((o:any)=>!ids.includes(o.id)||o.state!==(o.id===r4?'READY':'SETTLED'))
  ||books.deposits.length!==4||books.deposits.some((d:any)=>!ids.includes(d.order_id)||d.amount!=='100000'||d.classification!=='EXACT'||!d.confirmed_at)||books.obligations.length!==4||books.obligations.some((o:any)=>o.source_amount!=='100000'||o.state!==(o.order_id===r4?'HELD':'DISCHARGED'))
  ||books.operations.length!==4||books.operations.some((o:any)=>o.kind!=='PAYOUT'||o.state!==(o.order_id===r4?'PLANNED':'CONFIRMED'))||op?.chain_authorization_verified!==false||books.jobs.length!==4||job?.status!=='QUEUED'||job.lease_owner!==null||job.lease_until!==null||String(job.fence)!=='0'
  ||books.jobs.some((j:any)=>j.id!==job.id&&j.status!=='DONE')||books.reservations.length!==12||books.reservations.filter((r:any)=>r.order_id===r4).length!==3||books.reservations.some((r:any)=>r.order_id===r4?!!r.released_at:!r.released_at)
  ||books.forwards.length!==4||books.forwards.some((a:any)=>!a.confirmed)||books.commits.length!==1||!books.commits[0].confirmed||books.commits[0].order_id!==ids[1]||books.settles.length!==1||!books.settles[0].confirmed||books.shielded.length!==1||!books.shielded[0].confirmed||books.refunds.length)throw Error('G5_R4_EXACT_FUNDED_HELD_READY_BOOKS_REQUIRED');
 for(const [asset,purpose,amount] of [['TAZ','principal','100000'],['TAZ','fee','10000'],['baseETH','fee','50000000000000']])if(books.reservations.filter((r:any)=>r.order_id===r4&&r.asset===asset&&r.purpose===purpose&&r.amount===amount&&!r.released_at).length!==1)throw Error('G5_R4_EXACT_HELD_RESERVATIONS_REQUIRED');
 for(const id of ids){const d=books.deposits.filter((d:any)=>d.order_id===id),o=books.obligations.filter((o:any)=>o.order_id===id),operation=books.operations.filter((o:any)=>o.order_id===id);if(d.length!==1||o.length!==1||operation.length!==1||o[0].deposit_id!==d[0].id||operation[0].deposit_id!==d[0].id||books.orders.find((r:any)=>r.id===id)?.primary_deposit!==d[0].id)throw Error('G5_R4_ORIGINAL_SOURCE_OPERATION_BINDING_REQUIRED');}
}
