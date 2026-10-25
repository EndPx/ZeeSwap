/** Membership-scoped scheduling; acceptance expiry closes admission, never abandons a liability. */
import type pg from 'pg';
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
 if(!members.length){const capital=await e.capture();const age=(now??Date.now())-Date.parse(capital.observedAt);
  if(!Number.isFinite(age)||age< -5000||age>60000||!/^[a-f0-9]{64}$/.test(capital.proofDigest))throw Error('POLICY_WORKER_CAPITAL_STALE');
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
