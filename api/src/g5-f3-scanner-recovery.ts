import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import type pg from 'pg';
import {G5_RETRY_TARGET,g5Binding,g5PathIdentity,type G5State} from './g5-run.ts';
import type {G5LiveState} from './g5-live-controller.ts';
/** Literal known first-refresh scanner failure after F3 PAY was retained.
 * A generic read failure is not reclassified as a known provider cause. */
export function requireG5F3ScannerRecovery(state:G5State,config:any,controller:G5LiveState,controllerConfig:any,diagnostic:any,manifestPath:string){
 if(config.branchId!==G5_RETRY_TARGET.branchId||config.runId!=='1f34e059-4de1-49f6-bbaa-323008577994'||!state.incident||state.closed||!state.policyInitialized||state.batchSize!==5||state.orders.length!==3||(state.barriers?.length??0)!==0
  ||state.orders.some((o,i)=>o.sequence!==i+1||!o.orderId||o.direction!==(i%2?'BASE_TO_ZCASH':'ZCASH_TO_BASE')||o.verified)
  ||state.orders.slice(0,2).some(o=>!o.receiptVerified)||!!state.orders[2].receiptVerified
  ||diagnostic?.step!=='dispatch'||diagnostic?.code!=='WALLET_UNAVAILABLE'||diagnostic.phase!=='base-preflight'||diagnostic.observedAt!=='2026-10-15T15:29:53.608Z'
  ||!Array.isArray(diagnostic.frames)||diagnostic.frames.length!==2||diagnostic.frames.some((f:any)=>f.file!=='wallet-adapter.ts')
  ||controller.version!==2||controller.runId!==state.runId||controller.closed||!controller.incident||controller.barriers.length!==0||controller.slots.length!==3
  ||controller.slots.some((o,i)=>o.sequence!==i+1||o.stage!==(i===2?'DISPATCH':'DONE'))||controller.inflight?.sequence!==3||controller.inflight.stage!=='DISPATCH'
  ||controllerConfig.runId!==state.runId||controllerConfig.manifestBinding!==g5Binding(config)||g5PathIdentity(controllerConfig.runConfig)!==g5PathIdentity(manifestPath)
  ||controller.binding!==createHash('sha256').update(JSON.stringify(controllerConfig)).digest('hex'))throw Error('G5_ONLY_LITERAL_F3_SCANNER_FAILURE_RECOVERABLE');
}
export function requireG5F3Nonces(nonces:number[]){if(!isDeepStrictEqual(nonces,[11,11,7,7]))throw Error('G5_F3_GLOBAL_NONCES_CHANGED');}
export function requireG5F3Migrations(rows:{name:string;sha256:string}[],expected:{name:string;sha256:string}[]){
 if(rows.length!==14||expected.length!==14||expected.some((r,i)=>!r.name.startsWith(String(i+1).padStart(4,'0')+'_')||rows[i]?.name!==r.name||rows[i]?.sha256!==r.sha256))throw Error('G5_F3_ORIGINAL_MIGRATION_BYTES_REQUIRED');
}
export function requireG5F3CanonicalGlobalRaw(value:{original:any;parsed:any;chain:any;receipt:any;canonical:any;finalized:any;signer:string}){
 const {original:o,parsed:p,chain:t,receipt:r,canonical:b,finalized:f,signer}=value;
 if(p.chainId!==84532||p.nonce!==o.nonce||t.hash!==o.hash||t.blockNumber===null||t.nonce!==o.nonce||t.input!==p.data||t.to?.toLowerCase()!==p.to?.toLowerCase()||t.from.toLowerCase()!==signer.toLowerCase()||t.value!==(p.value??0n)
  ||r.transactionHash!==o.hash||!['success','reverted'].includes(r.status)||r.blockNumber!==t.blockNumber||r.blockHash!==t.blockHash||b.hash!==r.blockHash||r.blockNumber>f.number)throw Error('G5_F3_GLOBAL_RAW_CANONICAL_FINALITY_REQUIRED');
}
export function requireG5F3RecoveryBooks(books:any){
 const ids=books.orders.map((o:any)=>o.id);
 if(books.migrations.length!==14||books.quotes.length!==3||books.orders.length!==3||books.orders.some((o:any)=>o.state!=='SETTLED')||books.deposits.length!==3||books.deposits.some((d:any)=>!ids.includes(d.order_id)||d.amount!=='100000'||d.classification!=='EXACT'||!d.confirmed_at)
  ||books.obligations.length!==3||books.obligations.some((o:any)=>o.state!=='DISCHARGED'||o.source_amount!=='100000')||books.operations.length!==3||books.operations.some((o:any)=>o.kind!=='PAYOUT'||o.state!=='CONFIRMED')
  ||books.jobs.length!==3||books.jobs.some((j:any)=>j.status!=='DONE')||books.reservations.length!==9||books.reservations.some((r:any)=>!r.released_at)
  ||books.forwards.length!==4||books.forwards.some((a:any)=>!a.confirmed)||books.commits.length!==1||!books.commits[0].confirmed||books.settles.length!==1||!books.settles[0].confirmed||books.shielded.length!==1||!books.shielded[0].confirmed||books.refunds.length!==0)throw Error('G5_F3_EXACT_SETTLED_BOOKS_REQUIRED');
}
/** After the DB epoch CAS, both local files must agree before the controller
 * resumes. A failed/uncertain write re-freezes DB first; restore only the exact
 * original or proposed files owned by this recovery, never unrelated contents.
 */
export async function saveG5F3RecoveryLocals(main:G5State,controller:G5LiveState,io:{saveMain(s:G5State):Promise<void>;saveController(s:G5LiveState):Promise<void>;readMain():Promise<G5State>;readController():Promise<G5LiveState>;refreeze():Promise<void>}){
 const nextMain=structuredClone(main),nextController=structuredClone(controller);nextMain.incident=false;nextMain.orders[2].receiptVerified=false;
 nextController.incident=false;delete nextController.inflight;nextController.slots[2].stage='VERIFY';
 try{await io.saveMain(nextMain);await io.saveController(nextController);return {main:nextMain,controller:nextController};}
 catch(error){
  await io.refreeze();
  try{const current=await io.readMain();if(isDeepStrictEqual(current,main)||isDeepStrictEqual(current,nextMain))await io.saveMain(main);}catch{}
  try{const current=await io.readController();if(isDeepStrictEqual(current,controller)||isDeepStrictEqual(current,nextController))await io.saveController(controller);}catch{}
  throw error;
 }
}
/** Static table list, exact row snapshots for final paused-epoch CAS. */
export async function captureG5F3RecoveryBooks(pool:Pick<pg.Pool,'query'>){
 const tables={migrations:['public.zeeswap_migrations','name'],quotes:['zee.quotes','id'],orders:['zee.orders','id'],deposits:['zee.deposits','id'],obligations:['zee.obligations','deposit_id'],operations:['zee.operations','id'],jobs:['zee.outbox_jobs','id'],reservations:['zee.reservations','order_id,asset,purpose'],forwards:['zee.base_attempts','order_id,phase'],commits:['zee.escrow_commits','order_id'],settles:['zee.escrow_settlements','order_id'],shielded:['zee.reverse_payouts','order_id'],refunds:['zee.source_refunds','order_id'],accounts:['zee.inventory_accounts','asset,purpose'],ledger:['zee.ledger_entries','id'],events:['zee.order_events','id'],bindings:['zee.base_bindings','order_id'],escrowBindings:['zee.escrow_bindings','order_id'],checkpoints:['zee.scanner_checkpoints','network'],observations:['zee.chain_observations','network,height']} as const;
 const result:{[key:string]:any[]}={};for(const [name,[table,order]] of Object.entries(tables))result[name]=(await pool.query(`SELECT * FROM ${table} ORDER BY ${order}`)).rows;return result;
}
