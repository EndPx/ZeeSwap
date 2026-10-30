/** Restart permission only before the first current-policy interaction. No financial retry. */
import{serviceFinancialDigest}from'./testnet-service-launch.ts';
import{validateServicePolicy,type ServicePolicyApproval}from'./testnet-service-policy.ts';
import{decodePgJsonbBytea}from'./pg-jsonb-bytea.ts';
import{requireThat}from'./integrations/observation/types.ts';
import type{ServiceLaunchState}from'./testnet-service-launch.ts';
const need=(v:unknown,c:string)=>requireThat(v,'POLICY_IDLE_RESTART_'+c);
const policySha=(r:any)=>decodePgJsonbBytea(r.policy_sha256,32).toString('hex');
export const PREUSER_SOURCE_RECOVERY_MARKER='/opt/zeeswap-testnet/state/service-policy/preuser-source-recovery-active.private.json';
export const PREUSER_SOURCE_RECOVERY_PURPOSE='ROOT_PREUSER_SOURCE_RECOVERY_ACTIVE';
export type IdleRestartState=ServiceLaunchState&{lineage:string[];workerLease:boolean};
export function requireIdleRestartPinPermissions(uid:number,mode:number,secret:boolean){need(uid===0&&(mode&(secret?0o077:0o022))===0,'PIN_FILE');}
export function idleRestartLineage(current:string,links:Array<{policy:string;predecessor:string}>){
 const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);need(hash(current)&&links.length<=16&&links.every(r=>hash(r.policy)&&hash(r.predecessor)),'LINEAGE_ROWS');
 const lineage:string[]=[],seen=new Set<string>();let next:string|undefined=current;
 while(next){need(!seen.has(next)&&lineage.length<4,'LINEAGE_CYCLE_OR_BOUND');seen.add(next);lineage.push(next);const parents=links.filter(r=>r.policy===next);need(parents.length<=1,'LINEAGE_AMBIGUOUS_PARENT');next=parents[0]?.predecessor;}
 return lineage;
}
export function requireIdleRestartFreshSources(checkpoints:Array<{network:string;scanned_height:string;finalized_height:string;observed_at:string|Date}>,checkedAt:string|Date){
 const now=new Date(checkedAt).getTime();need(Number.isFinite(now)&&checkpoints.length===2&&new Set(checkpoints.map(r=>r.network)).size===2&&['zcash-testnet','base-sepolia'].every(n=>checkpoints.some(r=>r.network===n)),'SOURCE_CHECKPOINTS');
 for(const row of checkpoints){const observed=new Date(row.observed_at).getTime(),age=now-observed;need(/^(0|[1-9][0-9]*)$/.test(row.scanned_height)&&/^(0|[1-9][0-9]*)$/.test(row.finalized_height)&&BigInt(row.scanned_height)>=BigInt(row.finalized_height)&&Number.isFinite(age)&&age>=-5000&&age<=60000,'SOURCE_STALE');}
}
export function requirePreUserIdleRestart(p:ServicePolicyApproval,sha256:string,s:IdleRestartState,now=Date.now()){
 validateServicePolicy(p);need(p.publicCommit==='6ebb11da0fdaa70ccdd35d0c04e5abfe0b256ecc'&&Date.parse(p.verifiedAt)<=now+5000&&Date.parse(p.expiresAt)>now,'UNEXPIRED_FINANCIAL_POLICY');
 need(s.control.epoch===p.activeEpoch&&s.control.accepting_orders===true&&s.control.dispatch_enabled===true&&s.control.reconciliation_required===false&&!s.workerLease&&!s.globalBusy&&s.authorizationRows===0,'ACTIVE_IDLE_CONTROL');
 need(serviceFinancialDigest(s.snapshot)===p.initialBooksSha256,'ORIGINAL_FINANCIAL_BOOKS');
 const lineage=new Set(s.lineage);need(lineage.size===s.lineage.length&&lineage.has(sha256)&&lineage.has('10f877f468032e3c54b748748825dab5e7fe17e5a50d2ec78710392222417dae')&&lineage.size<=4,'CURRENT_LINEAGE');
 const quotes=s.snapshot.testnet_policy_quotes!,admissions=s.snapshot.testnet_policy_admissions!,members=admissions.filter(r=>lineage.has(policySha(r))),boundQuotes=quotes.filter(r=>lineage.has(policySha(r)));
 need(!admissions.some(r=>policySha(r)===sha256)&&!quotes.some(r=>policySha(r)===sha256),'NO_CURRENT_INTERACTION');
 need(members.length===1&&boundQuotes.length===1&&policySha(members[0])===policySha(boundQuotes[0])&&policySha(members[0])==='10f877f468032e3c54b748748825dab5e7fe17e5a50d2ec78710392222417dae','ONLY_ORIGINAL_CARRIED_ATTEMPT');
 const m=members[0],order=s.snapshot.orders!.find(r=>r.id===m.order_id),quote=s.snapshot.quotes!.find(r=>r.id===m.order_id);
 need(m.direction==='ZCASH_TO_BASE'&&order?.state==='EXPIRED_UNFUNDED'&&order.primary_deposit===null&&quote&&boundQuotes[0].quote_id===order.id&&quote.deposit_reference_hash&&!s.snapshot.deposits!.some(r=>r.order_id===order.id||r.reference_hash===quote.deposit_reference_hash),'ANCESTOR_UNFUNDED');
 need(s.snapshot.orders!.every(r=>['SETTLED','REFUNDED','EXPIRED_UNFUNDED'].includes(r.state))&&s.snapshot.obligations!.every(r=>r.state==='DISCHARGED')&&s.snapshot.operations!.every(r=>r.state==='CONFIRMED')&&s.snapshot.chain_transactions!.every(r=>['CONFIRMED','REVERTED','EXPIRED'].includes(r.state))&&s.snapshot.outbox_jobs!.every(r=>r.status==='DONE'),'NO_GLOBAL_UNRESOLVED_FINANCE');
}
