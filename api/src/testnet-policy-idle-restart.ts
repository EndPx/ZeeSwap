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
/** Original pinned Linux runtime owns its two private state directories. */
export function requireIdleBaseJournalDirectoryOwner(path:string,uid:number,gid:number,mode:number){
 const privateState=path==='/opt/zeeswap-testnet/state'||path==='/opt/zeeswap-testnet/state/base-signer-journal';
 need(uid===0?(mode&0o022)===0:privateState&&uid===986&&gid===978&&(mode&0o777)===0o700,'BASE_JOURNAL_DIRECTORY_OWNER');
}
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
function requireIdleBaseline(p:ServicePolicyApproval,sha256:string,s:IdleRestartState,now:number,verifiedNonexpiring=false){
 validateServicePolicy(p);need(p.publicCommit==='6ebb11da0fdaa70ccdd35d0c04e5abfe0b256ecc'&&Date.parse(p.verifiedAt)<=now+5000&&(verifiedNonexpiring||Date.parse(p.expiresAt)>now),'UNEXPIRED_FINANCIAL_POLICY');
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

export function requirePreUserIdleRestart(p:ServicePolicyApproval,sha256:string,s:IdleRestartState,now=Date.now()){requireIdleBaseline(p,sha256,s,now);}
export type ReuseIdleAuthority={nonexpiring:boolean;reuseEnabled:boolean;members:{orderId:string;reusable:boolean}[]};
/** Read-only reconstruction; accepted/funded/signed history can never inherit idle permission. */
export function requireReuseQualifiedIdleRestart(p:ServicePolicyApproval,sha256:string,s:IdleRestartState,authority:ReuseIdleAuthority,now=Date.now()){
 need(authority.nonexpiring===true&&authority.reuseEnabled===true,'SQL_REUSE_LIFETIME_AUTHORITY');
 const admissions=s.snapshot.testnet_policy_admissions!.filter(r=>policySha(r)===sha256),quotes=s.snapshot.testnet_policy_quotes!.filter(r=>policySha(r)===sha256),ids=new Set(admissions.map(r=>r.order_id));
 need(ids.size===admissions.length&&ids.size<=32&&quotes.length===ids.size&&quotes.every(r=>ids.has(r.quote_id))&&new Set(quotes.map(r=>r.quote_id)).size===ids.size,'EXACT_CURRENT_QUOTE_ADMISSION_SET');
 need(authority.members.length===ids.size&&new Set(authority.members.map(r=>r.orderId)).size===ids.size&&authority.members.every(r=>ids.has(r.orderId)&&r.reusable===true),'CURRENT_ATTEMPTS_SQL_REUSABLE');
 for(const id of ids){const order=s.snapshot.orders!.filter(r=>r.id===id),quote=s.snapshot.quotes!.filter(r=>r.id===id);need(order.length===1&&order[0].state==='EXPIRED_UNFUNDED'&&order[0].primary_deposit===null&&quote.length===1&&!s.snapshot.deposits!.some(r=>r.order_id===id||r.reference_hash===quote[0].deposit_reference_hash),'CURRENT_ATTEMPTS_UNFUNDED');}
 const snapshot=Object.fromEntries(Object.entries(s.snapshot).map(([table,rows])=>[table,['quotes','orders'].includes(table)?rows.filter(r=>!ids.has(r.id)):['reservations','ledger_entries','order_events'].includes(table)?rows.filter(r=>!ids.has(r.order_id)):table==='testnet_policy_quotes'?rows.filter(r=>!ids.has(r.quote_id)):table==='testnet_policy_admissions'?rows.filter(r=>!ids.has(r.order_id)):rows]));
 requireIdleBaseline(p,sha256,{...s,snapshot},now,true);
}

/** Additional unsigned waiting/quote-only cohorts. Projection never mutates SQL. */
export function requireReuseQualifiedUnsignedRestart(p:ServicePolicyApproval,sha256:string,s:IdleRestartState,authority:ReuseIdleAuthority,now=Date.now()){
 need(authority.nonexpiring===true&&authority.reuseEnabled===true,'SQL_REUSE_LIFETIME_AUTHORITY');
 const atomic=(v:unknown,signed=false):bigint=>{need(typeof v==='string'?(signed?/^-?(0|[1-9][0-9]*)$/:/^(0|[1-9][0-9]*)$/).test(v):typeof v==='number'&&Number.isSafeInteger(v)&&(signed||v>=0),'UNSIGNED_EXACT_INTEGER');return BigInt(v as string|number);};
 const bindings=s.snapshot.testnet_policy_quotes!.filter(r=>policySha(r)===sha256),admissions=s.snapshot.testnet_policy_admissions!.filter(r=>policySha(r)===sha256),remove=new Set<string>(),held=new Map<string,bigint>();let waiting=0;
 need(bindings.length<=32&&new Set(bindings.map(r=>r.quote_id)).size===bindings.length&&admissions.every(a=>bindings.some(b=>b.quote_id===a.order_id)),'UNSIGNED_BOUND_COHORT');
 need(authority.members.length===admissions.length&&new Set(authority.members.map(m=>m.orderId)).size===admissions.length&&authority.members.every(m=>admissions.some(a=>a.order_id===m.orderId)),'UNSIGNED_SQL_MEMBER_SET');
 for(const binding of bindings){const id=binding.quote_id,as=admissions.filter(a=>a.order_id===id),orders=s.snapshot.orders!.filter(o=>o.id===id);need(as.length<=1&&orders.length<=1,'UNSIGNED_UNIQUE_ORDER');
  if(as.length&&orders[0]?.state!=='AWAITING_FUNDS')continue;
  const qs=s.snapshot.quotes!.filter(q=>q.id===id);need(qs.length===1&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id),'UNSIGNED_QUOTE');const q=qs[0],forward=q.direction==='ZCASH_TO_BASE';
  need(forward||q.direction==='BASE_TO_ZCASH','UNSIGNED_DIRECTION');
  need(q.source_asset===(forward?'TAZ':'mockUSDC')&&q.destination_asset===(forward?'mockUSDC':'TAZ')&&q.payout_fee_asset===(forward?'baseETH':'TAZ')&&q.refund_fee_asset===(forward?'TAZ':'baseETH')&&atomic(q.input_amount)===100000n&&atomic(q.output_amount)===100000n&&atomic(q.payout_fee)===(forward?100000000000000n:10000n)&&atomic(q.refund_fee)===(forward?10000n:100000000000000n)&&q.execution_mode===(forward?'base-settlement-v1':'base-escrow-v1')&&typeof q.base_contract==='string'&&/^0x[0-9a-fA-F]{40}$/.test(q.base_contract)&&q.base_contract.toLowerCase()===p.settlementContract,'UNSIGNED_FIXED_TERMS');
  const start=Date.parse(q.created_at),end=Date.parse(q.expires_at);need(Number.isFinite(start)&&Number.isFinite(end)&&start>=Date.parse(p.verifiedAt)&&start<=now+5000&&end>start&&end-start<=120000&&q.access_hash===binding.owner_hash&&q.deposit_reference_hash,'UNSIGNED_QUOTE_BINDING');
  need(!s.snapshot.deposits!.some(d=>d.order_id===id||d.reference_hash===q.deposit_reference_hash),'UNSIGNED_NO_DEPOSIT');
  for(const table of['obligations','operations','base_bindings','base_attempts','escrow_bindings','escrow_commits','reverse_payouts','escrow_settlements','source_refunds'])need(!s.snapshot[table]!.some(r=>r.order_id===id),'UNSIGNED_NO_FINANCIAL_PIPELINE');
  const rs=s.snapshot.reservations!.filter(r=>r.order_id===id),ls=s.snapshot.ledger_entries!.filter(r=>r.order_id===id),events=s.snapshot.order_events!.filter(r=>r.order_id===id);
  if(!as.length){need(orders.length===0&&rs.length===0&&ls.length===0&&events.length===0,'UNSIGNED_QUOTE_ONLY');remove.add(id);continue;}
  waiting++;need(waiting<=1&&orders[0]?.primary_deposit===null&&as[0].direction===q.direction&&String(as[0].accepted_epoch)===p.activeEpoch&&atomic(as[0].amount_atomic)===100000n&&atomic(as[0].native_fee_ceiling)===10000n&&atomic(as[0].base_fee_ceiling)===100000000000000n,'UNSIGNED_SINGLE_AWAITING');const o=orders[0];
  need(forward?atomic(o.funding_cutoff_height)>0n&&o.funding_cutoff_time===null&&o.cancellation_available_at===null:o.funding_cutoff_height===null&&Number.isFinite(Date.parse(o.funding_cutoff_time))&&Date.parse(o.cancellation_available_at)-Date.parse(o.funding_cutoff_time)===7200000,'UNSIGNED_FINITE_FUNDING');
  const expected=[{asset:q.destination_asset,purpose:'principal',amount:100000n},{asset:'TAZ',purpose:'fee',amount:10000n},{asset:'baseETH',purpose:'fee',amount:100000000000000n}];
  need(rs.length===3&&ls.length===6&&events.length===1&&events[0].event_type==='ACCEPTED','UNSIGNED_RESERVE_FOOTPRINT');
  for(const e of expected){const match=rs.filter(r=>r.asset===e.asset&&r.purpose===e.purpose);need(match.length===1&&match[0].released_at===null&&atomic(match[0].amount)===e.amount,'UNSIGNED_HELD_RESERVATION');
   for(const bucket of['available','reserved']){const entries=ls.filter(l=>l.asset===e.asset&&l.bucket===e.purpose+':'+bucket);need(entries.length===1&&entries[0].event_id===id&&atomic(entries[0].amount,true)===(bucket==='available'?-e.amount:e.amount),'UNSIGNED_RESERVE_LEDGER');}
   const key=e.asset+'\0'+e.purpose;held.set(key,(held.get(key)??0n)+e.amount);
  }remove.add(id);
 }
 need(waiting===0||s.globalBusy===true,'UNSIGNED_EXPECTED_BUSY');
 const snapshot=Object.fromEntries(Object.entries(s.snapshot).map(([table,rows])=>[table,['quotes','orders'].includes(table)?rows.filter(r=>!remove.has(r.id)):['reservations','ledger_entries','order_events'].includes(table)?rows.filter(r=>!remove.has(r.order_id)):table==='testnet_policy_quotes'?rows.filter(r=>!remove.has(r.quote_id)):table==='testnet_policy_admissions'?rows.filter(r=>!remove.has(r.order_id)):rows]));
 snapshot.inventory_accounts=snapshot.inventory_accounts!.map(r=>{const value=held.get(r.asset+'\0'+r.purpose);if(value===undefined)return r;const restored=atomic(r.reserved)-value;need(restored>=0n,'UNSIGNED_RESERVATION_TOTAL');held.delete(r.asset+'\0'+r.purpose);return{...r,reserved:typeof r.reserved==='string'?restored.toString():Number(restored)};});need(held.size===0,'UNSIGNED_INVENTORY_ACCOUNTS');
 requireReuseQualifiedIdleRestart(p,sha256,{...s,snapshot,globalBusy:waiting?false:s.globalBusy},{...authority,members:authority.members.filter(m=>!remove.has(m.orderId))},now);
}
