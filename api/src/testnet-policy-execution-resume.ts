/** Finite Root publication for one closed-policy resumption; no signer or budget mutation. */
import type pg from 'pg';
import {createHash} from 'node:crypto';
import {readServiceLaunchState,serviceFinancialDigest,type ServiceLaunchState} from './testnet-service-launch.ts';
import {continuationDigest} from './native-circle-continuation.ts';
import {stable} from './integrations/observation/types.ts';
export const RESUME_POLICY='1684eb5a004f4cc9bfbe332bea10970796374349ce00fddfd540fe80da5d41a8';
export type ExecutionResumeApproval={version:1;purpose:'ROOT_CLOSED_TESTNET_POLICY_EXECUTION_RESUME';policySha256:typeof RESUME_POLICY;originalEpoch:'242';pausedEpoch:'243';effectiveEpoch:'244';pausedXmin:string;financialSha256:string;snapshotSha256:string;executionApprovalSha256:string;migrationSha256:string;functionBaselineSha256:string;verifiedAt:string;expiresAt:string};
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const need=(v:unknown,c:string)=>{if(!v)throw Error('POLICY_EXECUTION_RESUME_'+c);};
export function validateExecutionResume(a:ExecutionResumeApproval,s:ServiceLaunchState,now=Date.now()){
 need(a?.version===1&&a.purpose==='ROOT_CLOSED_TESTNET_POLICY_EXECUTION_RESUME'&&a.policySha256===RESUME_POLICY&&a.originalEpoch==='242'&&a.pausedEpoch==='243'&&a.effectiveEpoch==='244','SCOPE');
 need([a.financialSha256,a.snapshotSha256,a.executionApprovalSha256,a.migrationSha256,a.functionBaselineSha256].every(x=>/^[a-f0-9]{64}$/.test(x)&&x!=='0'.repeat(64)),'PINS');
 need(/^[1-9][0-9]*$/.test(a.pausedXmin)&&s.control.epoch===a.pausedEpoch&&s.control.xmin===a.pausedXmin&&!s.control.accepting_orders&&!s.control.dispatch_enabled&&s.control.reconciliation_required&&!s.globalBusy,'PAUSED_CLOSED');
 need(Date.parse(a.verifiedAt)<=now+5000&&Date.parse(a.verifiedAt)>=now-300000&&Date.parse(a.expiresAt)>now&&Date.parse(a.expiresAt)>Date.parse(a.verifiedAt)&&Date.parse(a.expiresAt)-Date.parse(a.verifiedAt)<=300000,'FINITE_PUBLICATION');
 need(serviceFinancialDigest(s.snapshot)===a.financialSha256&&continuationDigest(s.snapshot)===a.snapshotSha256,'EXACT_CLOSED_BOOKS');
 need(s.snapshot.orders!.every(o=>['SETTLED','REFUNDED','EXPIRED_UNFUNDED'].includes(o.state))&&s.snapshot.base_attempts!.every(x=>x.confirmed)&&s.snapshot.reservations!.every(x=>x.released_at!==null)&&s.snapshot.inventory_accounts!.every(x=>BigInt(x.reserved)===0n),'NO_PENDING_FINANCIAL_WORK');
}
export const resumeFunctionSignatures=['zee.record_testnet_worker_readiness(zee.digest,timestamp with time zone,zee.digest)','zee.testnet_policy_gate(zee.digest)','zee.testnet_policy_availability(zee.digest)','zee.check_testnet_policy_worker(zee.digest,uuid)'] as const;
export async function executionResumeFunctionBaseline(c:Pick<pg.PoolClient,'query'>){const bodies=[];for(const signature of resumeFunctionSignatures){const r=(await c.query('SELECT pg_get_functiondef($1::regprocedure) body',[signature])).rows[0];need(r?.body,'FUNCTION_BASELINE');bodies.push({signature,body:r.body});}return sha(stable(bodies));}
export type ExecutionResumeIntent={version:1;purpose:'ROOT_CLOSED_TESTNET_POLICY_EXECUTION_RESUME';transactionId:string;approvalSha256:string;approval:ExecutionResumeApproval;before:ServiceLaunchState};
export async function publishExecutionResume(c:Pick<pg.PoolClient,'query'>,o:{approval:ExecutionResumeApproval;approvalSha256:string;approvalRaw:Buffer;migrationSql:string;executionApprovalRaw:Buffer;actualSourceAndCapitalGuard:()=>Promise<void>;persist:(intent:ExecutionResumeIntent)=>Promise<void>}){
 need(sha(o.approvalRaw)===o.approvalSha256&&stable(JSON.parse(o.approvalRaw.toString()))===stable(o.approval),'EXACT_APPROVAL_BYTES');
 need(sha(o.migrationSql)===o.approval.migrationSha256&&sha(o.executionApprovalRaw)===o.approval.executionApprovalSha256&&/^[a-f0-9]{64}$/.test(o.approvalSha256),'PUBLICATION_BYTES');
 const execution=JSON.parse(o.executionApprovalRaw.toString());need(execution.purpose==='ROOT_BASE_L2_FAST_EXECUTION'&&execution.policySha256===RESUME_POLICY&&execution.activeEpoch==='242','EXECUTION_BINDING');
 let sent=false;await c.query('BEGIN');try{
  await c.query("SET LOCAL statement_timeout='30000ms'");await c.query("SET LOCAL idle_in_transaction_session_timeout='30000ms'");
  const who=(await c.query('SELECT current_database() db,current_user role,(pg_control_system()).system_identifier::text system')).rows[0];need(who?.db==='zee_app_20261023'&&who.role==='zee_app_admin_20261023'&&who.system==='7701863382450487342','ACTUAL_PRIMARY_ADMIN');
  for(const key of[20261023,20261026])need((await c.query('SELECT pg_try_advisory_xact_lock(84532,$1) owned',[key])).rows[0]?.owned,'ACTOR_RUNNING');await c.query('SELECT zee.lock_observer_cycle()');
  need((await c.query("SELECT to_regclass('zee.testnet_policy_execution_resumptions') present")).rows[0]?.present===null,'EXISTING_PUBLICATION_RECONCILE_ONLY');
  const before=await readServiceLaunchState(c);validateExecutionResume(o.approval,before);need(await executionResumeFunctionBaseline(c)===o.approval.functionBaselineSha256,'EXACT_FUNCTION_BASELINE');await o.actualSourceAndCapitalGuard();
  const xid=String((await c.query('SELECT pg_current_xact_id()::text id')).rows[0]?.id),intent:ExecutionResumeIntent={version:1,purpose:o.approval.purpose,transactionId:xid,approvalSha256:o.approvalSha256,approval:o.approval,before};need(/^[1-9][0-9]*$/.test(xid),'ORIGINAL_XID');await o.persist(intent);
  validateExecutionResume(o.approval,await readServiceLaunchState(c));await o.actualSourceAndCapitalGuard();await c.query(o.migrationSql);
  const a=o.approval;await c.query('SELECT zee.resume_testnet_policy_execution($1,$2,$3,$4,$5)',[Buffer.from(o.approvalSha256,'hex'),a.pausedXmin,Buffer.from(a.financialSha256,'hex'),Buffer.from(a.executionApprovalSha256,'hex'),a.expiresAt]);
  const after=await readServiceLaunchState(c);need(stable(after.snapshot)===stable(before.snapshot)&&after.feeXmin===before.feeXmin&&after.authorizationRows===before.authorizationRows&&!after.globalBusy,'FINANCIAL_ROWS_UNCHANGED');
  need(after.control.epoch==='244'&&after.control.xmin===(BigInt(xid)%4294967296n).toString()&&after.control.accepting_orders&&after.control.dispatch_enabled&&!after.control.reconciliation_required,'EXACT_CONTROL_DELTA');
  need(Date.now()<Date.parse(a.expiresAt),'PUBLICATION_EXPIRED');sent=true;await c.query('COMMIT');return intent;
 }catch(error){if(!sent)await c.query('ROLLBACK').catch(()=>{});throw error;}
}
