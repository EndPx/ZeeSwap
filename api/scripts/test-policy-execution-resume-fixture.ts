/** Run only against a restored, dedicated schema; every mutation rolls back. */
import type pg from 'pg';
export async function testPolicyExecutionResumeFixture(c:Pick<pg.PoolClient,'query'>,schema:string,migration:string){
 if(schema!=='zee'&&schema!=='zee_execution_resume_test_20261031')throw Error('RESUME_FIXTURE_SCOPE');
 if((await c.query('SELECT current_database() db')).rows[0]?.db!=='zee_execution_resume_test_20261031')throw Error('RESUME_FIXTURE_DATABASE');
 const checks:string[]=[],q=(s:string,args?:unknown[])=>c.query(s.replace(/\bzee\b/g,schema),args),assert=(v:unknown,name:string)=>{if(!v)throw Error('RESUME_FIXTURE_'+name);checks.push(name);};
 const expect=async(name:string,run:()=>Promise<unknown>,message:RegExp)=>{await q('SAVEPOINT refusal');let refused=false;try{await run();}catch(e){refused=message.test((e as Error).message);}await q('ROLLBACK TO SAVEPOINT refusal');assert(refused,name);};
 const policy=Buffer.from('1684eb5a004f4cc9bfbe332bea10970796374349ce00fddfd540fe80da5d41a8','hex'),hash=Buffer.alloc(32,7);
 await q('BEGIN');let leased=false;
 try{
  await q(migration);assert((await q('SELECT zee.testnet_policy_execution_epoch($1)::text epoch',[policy])).rows[0]?.epoch==='242','default_raw_epoch');
  await q("UPDATE zee.scanner_checkpoints SET observed_at=clock_timestamp()");
  const baseline=(await q("SELECT jsonb_build_object('policies',(SELECT jsonb_agg(to_jsonb(t)) FROM zee.root_testnet_service_policies t),'admissions',(SELECT jsonb_agg(to_jsonb(t)) FROM zee.testnet_policy_admissions t),'quotes',(SELECT jsonb_agg(to_jsonb(t)) FROM zee.testnet_policy_quotes t),'inventory',(SELECT jsonb_agg(to_jsonb(t)) FROM zee.inventory_accounts t),'ledger',(SELECT jsonb_agg(to_jsonb(t)) FROM zee.ledger_entries t))::text books")).rows[0].books;
  const xmin=(await q('SELECT xmin::text x FROM zee.runtime_control WHERE singleton')).rows[0].x;
  const resume=(x=xmin)=>q("SELECT zee.resume_testnet_policy_execution($1,$2,$3,$4,clock_timestamp()+interval '2 minutes')",[hash,x,hash,hash]);
  await expect('paused_CAS_refuses',()=>resume('1'),/PAUSED_CAS/);
  await expect('finite_publication_refuses',()=>q("SELECT zee.resume_testnet_policy_execution($1,$2,$3,$4,clock_timestamp()-interval '1 second')",[hash,xmin,hash,hash]),/PUBLICATION_EXPIRED/);
  await q('SAVEPOINT pending_order');await q("UPDATE zee.orders SET state='READY' WHERE id=(SELECT id FROM zee.orders WHERE state='SETTLED' LIMIT 1)");
  await expect('pending_order_refuses',()=>resume(),/NOT_CLOSED/);await q('ROLLBACK TO SAVEPOINT pending_order');
  await q('SAVEPOINT worker_role');await q('SET LOCAL ROLE zeeswap_worker');await expect('worker_cannot_resume',()=>resume(),/permission denied/);await q('ROLLBACK TO SAVEPOINT worker_role');
  await resume();assert((await q('SELECT zee.testnet_policy_execution_epoch($1)::text epoch',[policy])).rows[0]?.epoch==='244','effective_epoch_244');
  const ctrl=(await q('SELECT epoch::text,accepting_orders,dispatch_enabled,reconciliation_required FROM zee.runtime_control WHERE singleton')).rows[0];assert(ctrl.epoch==='244'&&ctrl.accepting_orders&&ctrl.dispatch_enabled&&!ctrl.reconciliation_required,'monotonic_control_resumed');
  const after=(await q("SELECT jsonb_build_object('policies',(SELECT jsonb_agg(to_jsonb(t)) FROM zee.root_testnet_service_policies t),'admissions',(SELECT jsonb_agg(to_jsonb(t)) FROM zee.testnet_policy_admissions t),'quotes',(SELECT jsonb_agg(to_jsonb(t)) FROM zee.testnet_policy_quotes t),'inventory',(SELECT jsonb_agg(to_jsonb(t)) FROM zee.inventory_accounts t),'ledger',(SELECT jsonb_agg(to_jsonb(t)) FROM zee.ledger_entries t))::text books")).rows[0].books;assert(after===baseline,'policy_admissions_budgets_ledger_exactly_unchanged');
  await expect('grant_immutable',()=>q('UPDATE zee.testnet_policy_execution_resumptions SET effective_epoch=246'),/immutable/);
  await q('SELECT pg_advisory_lock(84532,20261026)');leased=true;
  await q('SELECT zee.record_testnet_worker_readiness($1,clock_timestamp(),$2)',[policy,hash]);
  const runtime=(await q('SELECT control_epoch::text epoch FROM zee.testnet_service_runtime WHERE policy_sha256=$1',[policy])).rows[0];assert(runtime?.epoch==='244','readiness_effective_epoch');
  const member=(await q('SELECT * FROM zee.check_testnet_policy_worker($1::zee.digest,(SELECT order_id FROM zee.testnet_policy_admissions WHERE policy_sha256=$1::zee.digest ORDER BY accepted_at DESC LIMIT 1))',[policy])).rows[0];assert(String(member?.accepted_epoch)==='242','membership_keeps_raw_accepted_epoch');
  const life=(await q('SELECT zee.testnet_policy_nonexpiring($1) lifetime,zee.testnet_unfunded_reuse_enabled($1) reuse',[policy])).rows[0];assert(life?.lifetime&&life.reuse,'original_lifetime_and_reuse_grants_survive');
  await q('SELECT zee.testnet_policy_gate($1)',[policy]);checks.push('admission_gate_accepts_effective_epoch');
  return {checks:checks.length,passed:checks,publicTestnetSettlement:false,rolledBack:true};
 }finally{await q('ROLLBACK');if(leased)await q('SELECT pg_advisory_unlock(84532,20261026)');}
}
