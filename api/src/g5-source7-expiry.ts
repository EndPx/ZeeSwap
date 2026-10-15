import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {g5Binding,g5PathIdentity,expectedG5Balances,g5Capital,type G5State} from './g5-run.ts';
import type {G5LiveState} from './g5-live-controller.ts';
import {requireG5ArchivedAttemptState} from './g5-quote-attempts.ts';
export function deriveG5Source7Successor(main:G5State,controller:G5LiveState,archive:any,newOwner:string){
 const old=main.orders[6],metadata=['version','attempt','fundingFile','fundingSha256','fundingBindingSha256','quotePayloadSha256','cutoffHeight','auditFile','auditSha256','archivedAt','epoch'];
 const expectedArchive:any={...old};for(const key of metadata)expectedArchive[key]=archive[key];
 if(!isDeepStrictEqual(expectedArchive,archive)||typeof newOwner!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(newOwner)||main.orders.some(o=>o.owner===newOwner))throw Error('G5_SOURCE7_EXACT_SUCCESSOR_DIFF_REQUIRED');
 const nextMain=structuredClone(main),nextController=structuredClone(controller);nextMain.archivedAttempts=[structuredClone(archive)];nextMain.orders[6]={sequence:7,direction:'ZCASH_TO_BASE',owner:newOwner,attempt:2};
 nextController.slots[6].stage='SYNC';nextController.incident=false;delete nextController.inflight;delete nextController.lastOutcome;delete nextController.transitionFailure;requireG5ArchivedAttemptState(nextMain);return {nextMain,nextController};
}
export function requireG5Source7RecoveryIntent(intent:any){
 if(intent?.version!==1||!['PROVED','DB_EXPIRED','LOCAL_SAVE_FAILED','COMPLETE'].includes(intent.phase)||intent.epoch!=='8'||intent.auditFile!==intent.nextMain?.archivedAttempts?.[0]?.auditFile)throw Error('G5_SOURCE7_EXISTING_RECOVERY_INTENT_RECONCILE');
 const derived=deriveG5Source7Successor(intent.originalMain,intent.originalController,intent.nextMain.archivedAttempts[0],intent.nextMain.orders[6].owner);
 if(!isDeepStrictEqual(derived.nextMain,intent.nextMain)||!isDeepStrictEqual(derived.nextController,intent.nextController))throw Error('G5_SOURCE7_CORRUPT_SUCCESSOR_INTENT');
}
export async function restoreG5Source7OwnedLocals(intent:any,main:G5State,controller:G5LiveState,io:{sqlState():Promise<string>;verifyArchive():Promise<void>;saveMain(s:G5State):Promise<void>;saveController(s:G5LiveState):Promise<void>}){
 requireG5Source7RecoveryIntent(intent);
 if(![intent.originalMain,intent.nextMain].some(s=>isDeepStrictEqual(s,main))||![intent.originalController,intent.nextController].some(s=>isDeepStrictEqual(s,controller)))throw Error('G5_SOURCE7_FOREIGN_LOCAL_STATE');
 const sql=await io.sqlState();if(sql==='AWAITING_FUNDS'){if(intent.phase!=='PROVED'||!isDeepStrictEqual(main,intent.originalMain)||!isDeepStrictEqual(controller,intent.originalController))throw Error('G5_SOURCE7_PRE_EXPIRY_LOCAL_CONTRADICTION');}
 else if(sql==='EXPIRED_UNFUNDED'){await io.verifyArchive();if(!isDeepStrictEqual(main,intent.originalMain))await io.saveMain(intent.originalMain);if(!isDeepStrictEqual(controller,intent.originalController))await io.saveController(intent.originalController);}
 else throw Error('G5_SOURCE7_EXISTING_INTENT_SQL_REQUIRED');
 return {main:structuredClone(intent.originalMain),controller:structuredClone(intent.originalController)};
}
export function requireG5Source7Expiry(main:G5State,manifest:any,controller:G5LiveState,cfg:any,path:string,diagnostic:any){
 if(main.runId!=='1f34e059-4de1-49f6-bbaa-323008577994'||manifest.branchId!=='br-twilight-heart-ao6cx6pg'||main.binding!==g5Binding(manifest)||main.incident||main.closed||main.batchSize!==5||main.archivedAttempts||main.orders.length!==7||main.orders.some((o,i)=>o.sequence!==i+1||!o.orderId||o.direction!==(i%2?'BASE_TO_ZCASH':'ZCASH_TO_BASE'))||main.orders.slice(0,5).some(o=>!o.verified||!o.receiptVerified)||main.orders.slice(5).some(o=>o.verified||o.receiptVerified)||!isDeepStrictEqual(main.barriers,[5])
  ||controller.runId!==main.runId||controller.version!==2||!controller.incident||controller.closed||controller.slots.length!==7||!isDeepStrictEqual(controller.barriers,[5])||controller.slots.some((o,i)=>o.sequence!==i+1||o.stage!==(i<5?'DONE':i===5?'OBSERVE_SOURCE':'SOURCE_FUND'))||!isDeepStrictEqual(controller.inflight,{sequence:7,stage:'SOURCE_FUND'})||controller.lastOutcome?.sequence!==7||controller.lastOutcome.stage!=='START'||controller.lastOutcome.status!=='AWAITING_SEPARATE_ONCE_ONLY_SOURCE_FUNDING'||controller.transitionFailure?.code!=='G5_LIVE_ACTION_OR_SAVE_FAILED'||controller.preparePriority
  ||cfg.runId!==main.runId||cfg.manifestBinding!==main.binding||g5PathIdentity(cfg.runConfig)!==g5PathIdentity(path)||controller.binding!==createHash('sha256').update(JSON.stringify(cfg)).digest('hex')
  ||!isDeepStrictEqual(diagnostic,{version:1,status:'UNKNOWN',sequence:7,stage:'SOURCE_FUND',phase:'INITIALIZATION_OR_UNHANDLED',exceptionClass:'Unknown',code:'CHILD_COMMAND_FAILED',frames:[],exitCode:1,signal:null}))throw Error('G5_ONLY_LITERAL_UNFUNDED_SOURCE7_EXPIRY');
}
export function requireG5Source7ActorAudit(a:any,runId:string,orderId:string,fundingHash:string,cutoff:string,config:any,viewHash:string){
 const age=Date.now()-Date.parse(a?.observedAt);
 if(a?.version!==1||a.status!=='G5_SOURCE_UNFUNDED_AUDIT'||a.runId!==runId||a.sequence!==7||a.attempt!==1||a.orderId!==orderId||a.fundingSha256!==fundingHash||a.oldFundingCutoffHeight!==cutoff||a.ufvkSha256!==config.ufvkSha256||a.spendableZatoshi!=='110000'||!isDeepStrictEqual(a.notes,[config.approvedNote])||!isDeepStrictEqual(a.approvedNote,config.approvedNote)||a.pendingCalculatedTransactions!==0||a.intentAbsent!==true||a.resultAbsent!==true||a.lockReleased!==true||a.processesAbsent!==true||!Number.isSafeInteger(a.scannedHeight)||BigInt(a.scannedHeight)<BigInt(cutoff)+10n||!Number.isSafeInteger(a.tipHeight)||a.tipHeight<a.scannedHeight||a.tipHeight-a.scannedHeight>2||!/^[0-9a-f]{64}$/.test(a.tipHash)||!/^[0-9a-f]{64}$/.test(a.scannedHash)||!Number.isFinite(age)||age< -5000||age>300000
  ||a.viewUfvkSha256!==viewHash||a.viewNonconfirmed!==0||!Number.isSafeInteger(a.viewAllNotes)||a.viewAllNotes!==3||!Number.isSafeInteger(a.sourceParentHeight)||a.sourceParentHeight<0||a.sourceParentHeight>a.scannedHeight-9||!/^[0-9a-f]{64}$/.test(a.sourceParentHash))throw Error('G5_SOURCE7_FRESH_ACTOR_NO_EFFECT_PROOF_REQUIRED');
}
export function requireG5Source7PartialBooks(books:any,state:G5State,expired:boolean,branchId:string){
 const ids=state.orders.map(o=>o.orderId),old=ids[6],fees='17905260001754',expected=expectedG5Balances(3,2,fees,branchId),reserved:Record<string,string>={mockUSDC:expired?'0':'100000','TAZ:principal':'100000','TAZ:fee':expired?'10000':'20000',baseETH:expired?'50000000000000':'100000000000000'};
 if(books.accounts.length!==4||expected.some(([asset,purpose,balance])=>books.accounts.filter((a:any)=>a.asset===asset&&a.purpose===purpose&&a.balance===balance&&a.reserved===reserved[asset==='TAZ'?asset+':'+purpose:asset]).length!==1))throw Error('G5_SOURCE7_EXACT_PARTIAL_ACCOUNTS_REQUIRED');
 if(books.reservations.length!==21)throw Error('G5_SOURCE7_EXACT_TWENTY_ONE_RESERVATIONS');
 for(const [i,id] of ids.entries()){
  const rows=books.reservations.filter((r:any)=>r.order_id===id),forward=i%2===0,expectedRows=forward?[['mockUSDC','principal','100000'],['TAZ','fee','10000'],['baseETH','fee','50000000000000']]:[['TAZ','principal','100000'],['TAZ','fee','10000'],['baseETH','fee','50000000000000']];
  if(rows.length!==3||expectedRows.some(([asset,purpose,amount])=>rows.filter((r:any)=>r.asset===asset&&r.purpose===purpose&&r.amount===amount&&!!r.released_at===(i<5||id===old&&expired)).length!==1))throw Error('G5_SOURCE7_EXACT_PARTIAL_RESERVATIONS_REQUIRED');
 }
 const groups=new Map<string,bigint>();for(const r of books.ledger){if(!['principal:available','principal:reserved','principal:spent','principal:operator-capital','fee:available','fee:reserved','fee:spent','fee:operator-capital','customer:held','customer:liability','operator:unreconciled','conversion:source'].includes(r.bucket)||r.order_id!==null&&!ids.includes(r.order_id))throw Error('G5_SOURCE7_UNEXPECTED_PARTIAL_LEDGER');const k=r.event_id+':'+r.asset;groups.set(k,(groups.get(k)??0n)+BigInt(r.amount));}
 if([...groups.values()].some(n=>n!==0n))throw Error('G5_SOURCE7_UNBALANCED_PARTIAL_LEDGER');
 const sum=(asset:string,bucket:string)=>books.ledger.filter((r:any)=>r.asset===asset&&r.bucket===bucket).reduce((n:bigint,r:any)=>n+BigInt(r.amount),0n);
 for(const [asset,amount] of [['TAZ',300000n],['mockUSDC',200000n]] as const)if(sum(asset,'operator:unreconciled')!==amount||sum(asset,'conversion:source')!==-amount||sum(asset,'customer:held')!==0n||sum(asset,'customer:liability')!==0n)throw Error('G5_SOURCE7_PRIOR_PROCEEDS_CHANGED');
 for(const [asset,purpose,opening] of g5Capital(branchId)){const account=books.accounts.find((a:any)=>a.asset===asset&&a.purpose===purpose);if(sum(asset,purpose+':available')!==BigInt(account.balance)-BigInt(account.reserved)||sum(asset,purpose+':reserved')!==BigInt(account.reserved)||sum(asset,purpose+':spent')!==BigInt(opening)-BigInt(account.balance)||sum(asset,purpose+':operator-capital')!==-BigInt(opening))throw Error('G5_SOURCE7_LEDGER_ACCOUNT_TOTALS_REQUIRED');}
}
/** DB expiry remains durable on a local failure. Re-freeze first; restore only
 * files equal to this recovery's original/proposed values, never foreign state. */
export async function saveG5Source7ExpiryLocals(originalMain:G5State,nextMain:G5State,originalController:G5LiveState,nextController:G5LiveState,io:{saveMain(s:G5State):Promise<void>;saveController(s:G5LiveState):Promise<void>;readMain():Promise<G5State>;readController():Promise<G5LiveState>;refreeze():Promise<void>}){
 try{await io.saveMain(nextMain);await io.saveController(nextController);}catch(error){await io.refreeze();try{const now=await io.readMain();if(isDeepStrictEqual(now,originalMain)||isDeepStrictEqual(now,nextMain))await io.saveMain(originalMain);}catch{}try{const now=await io.readController();if(isDeepStrictEqual(now,originalController)||isDeepStrictEqual(now,nextController))await io.saveController(originalController);}catch{}throw error;}
}
