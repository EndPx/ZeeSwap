/** Membership-scoped scheduling; acceptance expiry closes admission, never abandons a liability. */
import type pg from 'pg';
import {isObserverWait} from './observer-frontiers.ts';
import {transientBaseReadWaitCode,type BaseReadWaitCode} from './linux-forward-dispatch.ts';
const baseWaitCodes=['BASE_RPC_READ_HTTP_429','BASE_RPC_READ_HTTP_502','BASE_RPC_READ_HTTP_503','BASE_RPC_READ_HTTP_504','BASE_RPC_READ_TIMEOUT','BASE_RPC_READ_NETWORK'] as const;
const idleWaitCodes=['POLICY_IDLE_NATIVE_READ_WAIT','POLICY_IDLE_ADMISSION_BECAME_BUSY','POLICY_IDLE_CAPITAL_STALE','POLICY_IDLE_SOURCE_STALE','POLICY_IDLE_OBSERVER_WAIT',...baseWaitCodes] as const;
export type IdleCaptureWaitCode=typeof idleWaitCodes[number];
/** This classification is consumed ONLY inside the no-members capture boundary. */
export function idleCaptureWaitCode(error:unknown):IdleCaptureWaitCode|undefined{
 const e=error as any;if(e&&typeof e.code==='string'&&/^(?:[0-9]{2}|P0|XX|F0|HV)[A-Z0-9]{3}$/.test(e.code))return;
 const read=transientBaseReadWaitCode(error);if(read)return read;
 if(isObserverWait(error)&&error.diagnostic.status==='WAIT'&&(error.diagnostic.event==='wallet-read-only'||['observer-frontier','base-receipt-readiness'].includes(String(error.diagnostic.event))&&['HEAD_BEHIND','FINALITY_BEHIND','OLDER_OBSERVATION','SCANNER_FINALITY_PENDING','SOURCE_CAPTURE_EXPIRED','CHECKPOINT_STALE','FINALITY_PENDING'].includes(String(error.diagnostic.reason))))return 'POLICY_IDLE_OBSERVER_WAIT';
 switch(e?.message){
  case 'POLICY_WALLET_READ_WAIT':return 'POLICY_IDLE_NATIVE_READ_WAIT';
  case 'POLICY_ADMISSION_BECAME_BUSY':return 'POLICY_IDLE_ADMISSION_BECAME_BUSY';
  case 'POLICY_CAPITAL_STALE':case 'POLICY_WORKER_CAPITAL_STALE':return 'POLICY_IDLE_CAPITAL_STALE';
  case 'LIVE_OBSERVER_REQUIRED':case 'LIVE_OBSERVER_STALE':case 'STALE_BASE_HEAD':return 'POLICY_IDLE_SOURCE_STALE';
 }
}
/** Bound diagnostic vocabulary: error messages, URLs, request bodies and SQL text never escape. */
export function policyWorkerFailureDiagnostic(error:unknown){
 const knownCodes=new Set(['POLICY_WORKER_LEASE_LOST','POLICY_WORKER_NO_PRIOR_CAPTURE','POLICY_WORKER_CAPITAL_STALE','POLICY_WORKER_CAPITAL_IDENTITY_INVALID','POLICY_WORKER_CAPITAL_PROOF_INVALID','POLICY_CAPITAL_STALE','POLICY_WORKER_PENDING_NONCE','POLICY_WORKER_BASE_REORG','POLICY_WORKER_PHYSICAL_BACKING','POLICY_WORKER_BOOKS','POLICY_CAPITAL_PIN','POLICY_CAPITAL_UNEXPLAINED_NOTE','POLICY_CAPITAL_OBJECT','POLICY_CAPITAL_TIME','POLICY_CAPITAL_VERSION','POLICY_CAPITAL_PROCESS','POLICY_CAPITAL_SOURCE','POLICY_CAPITAL_BOUND','POLICY_CAPITAL_HEADER','POLICY_CAPITAL_CHECKPOINT','POLICY_CAPITAL_NOTE','POLICY_CAPITAL_DUPLICATE','POLICY_CAPITAL_RECEIPT','POLICY_CAPITAL_BALANCE','POLICY_CAPITAL_PROVENANCE_CONFLICT','POLICY_WORKER_CAPTURE_DIRECTORY','POLICY_WORKER_PROCESS_FILE','POLICY_WORKER_PROCESS_DIRECTORY','POLICY_CAPITAL_PRIVATE_PROOF','POLICY_CAPITAL_PROOF_CHANGED','POLICY_WORKER_CONFIG','POLICY_WORKER_PIN_CHANGED','POLICY_WORKER_PUBLIC_CODE_CHANGED','POLICY_FROZEN_PROCESS_REQUIRES_ROOT_ORIGINAL_JOURNAL_REVIEW','POLICY_ORIGINAL_JOURNAL_WITHOUT_PROCESS_BINDING','BASE_REORG','BASE_NONCE_CONFLICT_RECONCILE','BASE_BROADCAST_UNCERTAIN_RECONCILE_OR_REBROADCAST_SAME_BYTES','BASE_SIGNER_UNAVAILABLE','BROADCAST_UNKNOWN','LIVE_DISPATCH_EPOCH_CHANGED','LIVE_DISPATCH_PAUSED','POLICY_WORKER_MEMBERSHIP_EPOCH','POLICY_WORKER_CONCURRENCY_SCOPE','POLICY_WORKER_ORDER_STATE_REVIEW']);
 const names=new Set(['Error','TypeError','SyntaxError','BaseError','CallExecutionError','ObserverWaitError','HttpRequestError','TimeoutError','ContractFunctionExecutionError','ContractFunctionRevertedError','ExecutionRevertedError','TransactionExecutionError']);
 const chain:any[]=[];const seen=new Set<unknown>();let current:any=error;while(current&&typeof current==='object'&&!seen.has(current)&&chain.length<12){chain.push(current);seen.add(current);current=current.cause;}
 const e=chain[0],matched=chain.find(v=>knownCodes.has(v.message)),http=chain.find(v=>[400,401,403,404,408,429,500,502,503,504].includes(v.status)),sql=chain.find(v=>typeof v.code==='string'&&/^(?:[0-9]{2}|P0|XX|F0|HV)[A-Z0-9]{3}$/.test(v.code));
 const code=matched?.message??(sql?'SQL_FAILURE':isObserverWait(error)?'OBSERVER_WAIT':'UNCLASSIFIED_ERROR');
 return {code:code as string,errorName:names.has(e?.name)?e.name as string:'UnknownError',...(http?{httpStatus:`HTTP_${http.status}`}:{}) ,...(sql?{sqlClass:sql.code.startsWith('08')?'CONNECTION':sql.code.startsWith('23')?'CONSTRAINT':sql.code.startsWith('28')?'AUTHORIZATION':sql.code.startsWith('40')?'TRANSACTION':sql.code==='P0001'?'APPLICATION':'OTHER'}:{})};
}
export function policyWorkerWaitLog(result:unknown){
 const r=result as any,out:{sourceCode?:IdleCaptureWaitCode;waitCode?:BaseReadWaitCode}={};
 if(r?.status==='WAIT_ACTUAL_CAPITAL'&&idleWaitCodes.includes(r.sourceCode))out.sourceCode=r.sourceCode;
 if(r?.status==='POLICY_MEMBER_STEP'&&baseWaitCodes.includes(r.result?.code))out.waitCode=r.result.code;
 return out;
}

export const POLICY_WORKER_LEASE=[84532,20261026] as const;
export function assertPolicyOrderProcessBinding(state:unknown,expected:{policySha256:string;activeEpoch:string;workerBackendPid:number;orderId:string;rootProofPath?:string;rootProofSha256?:string}){const p=(state as any)?.policyContext;if(!p||p.version!==1||p.policySha256!==expected.policySha256||p.activeEpoch!==expected.activeEpoch||p.workerBackendPid!==expected.workerBackendPid||p.orderId!==expected.orderId||expected.rootProofPath!==undefined&&p.rootProofPath!==expected.rootProofPath||expected.rootProofSha256!==undefined&&p.rootProofSha256!==expected.rootProofSha256)throw Error('POLICY_FROZEN_PROCESS_REQUIRES_ROOT_ORIGINAL_JOURNAL_REVIEW');}
export async function policyFinancialStep<T>(ensureFrozenProcess:()=>Promise<void>,run:()=>Promise<T>){await ensureFrozenProcess();return run();}
export type PolicyMember={orderId:string;direction:'ZCASH_TO_BASE'|'BASE_TO_ZCASH';state:string;acceptedEpoch:string;sourceConfirmed?:boolean};
export type ActualCapital={observedAt:string;proofDigest:string};
export type PolicyWorkerEffects={
 checkLease():Promise<void>;recheckPolicy():Promise<void>;
 members():Promise<{members:PolicyMember[];globalActive:number}>;
 capture():Promise<ActualCapital>;
 heartbeat(capital:ActualCapital):Promise<void>;
 membership(orderId:string):Promise<void>;
 forward(orderId:string):Promise<unknown>;reverse(orderId:string):Promise<unknown>;refund(orderId:string):Promise<unknown>;
 expire(orderId:string):Promise<unknown>;
 confirm(orderId:string):Promise<unknown>;
};
export async function policyWorkerTick(e:PolicyWorkerEffects,previous?:ActualCapital,now?:number){
 await e.checkLease();await e.recheckPolicy();const {members,globalActive}=await e.members();
 if(members.length>4||globalActive>1||members.length>1||globalActive!==members.length)throw Error('POLICY_WORKER_CONCURRENCY_SCOPE');
 if(!members.length){let capital:ActualCapital;
  try{
   capital=await e.capture();const age=(now??Date.now())-Date.parse(capital.observedAt);
   if(!Number.isFinite(age))throw Error('POLICY_WORKER_CAPITAL_IDENTITY_INVALID');
   if(!/^[a-f0-9]{64}$/.test(capital.proofDigest))throw Error('POLICY_WORKER_CAPITAL_PROOF_INVALID');
   if(age< -5000||age>60000)throw Error('POLICY_WORKER_CAPITAL_STALE');
  }catch(error){
   const sourceCode=idleCaptureWaitCode(error);if(!sourceCode)throw error;
   await e.checkLease();await e.recheckPolicy();return{status:'WAIT_ACTUAL_CAPITAL',capital:previous,sourceCode};
  }
  await e.checkLease();await e.recheckPolicy();await e.heartbeat(capital);return{status:'POLICY_IDLE_CAPITAL_VERIFIED',capital};}
 // A long-running accepted payout can outlive the capital admission proof. Keep the
 // original capture timestamp/digest; SQL's live-lease membership gate governs draining.
 if(previous)await e.heartbeat(previous);
 const m=members[0]!;if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(m.orderId))throw Error('POLICY_WORKER_ORDER_ID');
 await e.checkLease();await e.membership(m.orderId);
 let result:unknown;
 if(m.state==='CONFIRMING'||m.state==='REFUND_REQUIRED'&&m.sourceConfirmed===false)result=await e.confirm(m.orderId);
 else if(m.state==='AWAITING_FUNDS')result=await e.expire(m.orderId);
 else if(m.state==='REFUND_REQUIRED'&&m.direction==='ZCASH_TO_BASE')result=await e.refund(m.orderId);
 else if(m.state==='READY')result=m.direction==='ZCASH_TO_BASE'?await e.forward(m.orderId):await e.reverse(m.orderId);
 else throw Error('POLICY_WORKER_ORDER_STATE_REVIEW');
 await e.checkLease();return{status:'POLICY_MEMBER_STEP',capital:previous,result};
}
export async function readPolicyMembers(pool:Pick<pg.Pool,'query'>,policySha256:string,activeEpoch:string){
 const r=(await pool.query(`SELECT a.order_id,q.direction,o.state,a.accepted_epoch::text,d.confirmed_at IS NOT NULL source_confirmed FROM zee.testnet_policy_admissions a JOIN zee.orders o ON o.id=a.order_id JOIN zee.quotes q ON q.id=o.id LEFT JOIN zee.deposits d ON d.id=o.primary_deposit WHERE a.policy_sha256=$1 AND o.state NOT IN('SETTLED','REFUNDED','EXPIRED_UNFUNDED') ORDER BY a.accepted_at,a.order_id LIMIT 5`,[Buffer.from(policySha256,'hex')])).rows;
 const global=(await pool.query("SELECT count(*)::int n FROM zee.orders WHERE state NOT IN('SETTLED','REFUNDED','EXPIRED_UNFUNDED')")).rows[0]?.n;
 if(!Number.isSafeInteger(global)||r.some(v=>String(v.accepted_epoch)!==activeEpoch||!['ZCASH_TO_BASE','BASE_TO_ZCASH'].includes(v.direction)))throw Error('POLICY_WORKER_MEMBERSHIP_EPOCH');
 return{globalActive:global,members:r.map(v=>({orderId:v.order_id,direction:v.direction,state:v.state,acceptedEpoch:v.accepted_epoch,sourceConfirmed:v.source_confirmed})) as PolicyMember[]};
}
