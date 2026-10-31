/** Explicit invocation-owned PostgreSQL fixture only; the complete transaction rolls back. */
import {readFile} from 'node:fs/promises';
import pg from 'pg';
const cfg=JSON.parse(await readFile(process.argv[2]!,'utf8'));
const url=new URL(cfg.databaseUrl);
if(url.pathname!=='/zee_closed_recovery_test_20261031'||decodeURIComponent(url.username)!=='zee_app_admin_20261023')throw Error('EXACT_DISPOSABLE_DATABASE_REQUIRED');
url.searchParams.delete('sslmode');
const pool=new pg.Pool({connectionString:url.toString(),ssl:{ca:await readFile(cfg.caPath,'utf8'),rejectUnauthorized:true},max:1});
const db=await pool.connect();let cases=0;
async function assert(value:unknown,label:string){if(!value)throw Error('FIXTURE_ASSERT_'+label);cases++;}
async function rejected(sql:string,args:any[],code:string){await db.query('SAVEPOINT negative_case');try{await db.query(sql,args);throw Error('EXPECTED_REFUSAL_'+code);}catch(e){if(!(e as Error).message.includes(code))throw e;cases++;}finally{await db.query('ROLLBACK TO negative_case');}}
const policy='1684eb5a004f4cc9bfbe332bea10970796374349ce00fddfd540fe80da5d41a8',h=(s:string)=>Buffer.from(s,'hex'),auth=h('11'.repeat(32)),worker=h('22'.repeat(32)),manifest=h('33'.repeat(32)),execution=h('44'.repeat(32)),proof=h('55'.repeat(32));
try{
 await db.query('BEGIN');
 if((await db.query('SELECT current_database() db,current_user role')).rows[0].db!=='zee_closed_recovery_test_20261031')throw Error('FIXTURE_IDENTITY');
 await db.query(await readFile(new URL('../migrations/0038_testnet_closed_recovery.sql',import.meta.url),'utf8'));
 const p=(await db.query('SELECT source_identity_digest FROM zee.root_testnet_service_policies WHERE policy_sha256=$1',[h(policy)])).rows[0];
 await db.query('INSERT INTO zee.testnet_closed_recovery_authorizations(authorization_sha256,policy_sha256,original_epoch,initial_execution_epoch,worker_config_sha256,execution_manifest_sha256,execution_approval_sha256,source_identity_digest) VALUES($1,$2,242,244,$3,$4,$5,$6)',[auth,h(policy),worker,manifest,execution,p.source_identity_digest]);
 await assert((await db.query('SELECT zee.testnet_policy_closed_books() ok')).rows[0].ok,'ACTUAL_FULL_CLOSED_BOOKS');
 const control=async()=>(await db.query('SELECT epoch::text,xmin::text,accepting_orders,dispatch_enabled,reconciliation_required FROM zee.runtime_control')).rows[0];
 const resume='SELECT zee.resume_testnet_closed_execution($1,$2,$3,$4,$5,$6,$7,$8)';
 let c=await control(),args=[auth,c.epoch,c.xmin,proof,worker,manifest,execution,p.source_identity_digest];
 await rejected(resume,args,'CLOSED_RECOVERY_SOURCE_STALE');
 await db.query("UPDATE zee.scanner_checkpoints SET observed_at=clock_timestamp()");
 await rejected(resume,[...args.slice(0,4),h('99'.repeat(32)),...args.slice(5)],'CLOSED_RECOVERY_AUTHORITY');
 await rejected(resume,[auth,c.epoch,'1',...args.slice(3)],'CLOSED_RECOVERY_PAUSED_CAS');
 await db.query('SAVEPOINT held');await db.query("UPDATE zee.obligations SET state='HELD'");
 await assert(!(await db.query('SELECT zee.testnet_policy_closed_books() ok')).rows[0].ok,'HELD_LIABILITY_REFUSED');
 await rejected(resume,args,'CLOSED_RECOVERY_NOT_CLOSED');await db.query('ROLLBACK TO held');
 await db.query('SAVEPOINT signed');await db.query('ALTER TABLE zee.base_attempts DISABLE TRIGGER immutable_signed_base');await db.query('UPDATE zee.base_attempts SET confirmed=false');
 await assert(!(await db.query('SELECT zee.testnet_policy_closed_books() ok')).rows[0].ok,'ORIGINAL_SIGNED_UNCONFIRMED_REFUSED');await db.query('ROLLBACK TO signed');
 await db.query('SAVEPOINT inventory');await db.query('UPDATE zee.inventory_accounts SET reserved=1 WHERE balance>=1');
 await assert(!(await db.query('SELECT zee.testnet_policy_closed_books() ok')).rows[0].ok,'HELD_INVENTORY_REFUSED');await db.query('ROLLBACK TO inventory');
 await db.query(resume,args);c=await control();await assert(c.epoch==='246'&&!c.accepting_orders&&c.dispatch_enabled&&!c.reconciliation_required,'WARM_ONLY_GENERATION_246');
 await assert((await db.query('SELECT zee.testnet_policy_execution_epoch($1)::text epoch',[h(policy)])).rows[0].epoch==='246','DYNAMIC_EXECUTION_EPOCH');
 await rejected('SELECT zee.enable_testnet_closed_intake($1,$2,$3)',[auth,c.epoch,c.xmin],'CLOSED_RECOVERY_ACTUAL_CAPITAL_REQUIRED');
 // Synthetic heartbeat is restricted to this disposable SQL fixture. Live flow
 // uses the unchanged worker's actual protected physical capital capture.
 await db.query('SAVEPOINT fixture_capital');await db.query('SELECT pg_advisory_xact_lock(84532,20261026)');
 await db.query('SELECT zee.record_testnet_worker_readiness($1,clock_timestamp(),$2)',[h(policy),proof]);
 await db.query('SELECT zee.enable_testnet_closed_intake($1,$2,$3)',[auth,c.epoch,c.xmin]);
 await assert((await control()).accepting_orders,'ONLY_FRESH_LEASED_FIXTURE_CAPITAL_OPENS_INTAKE');
 await db.query('ROLLBACK TO fixture_capital');
 await db.query('SELECT zee.pause_testnet_closed_execution($1,$2,$3)',[auth,c.epoch,c.xmin]);c=await control();
 await db.query(resume,[auth,c.epoch,c.xmin,proof,worker,manifest,execution,p.source_identity_digest]);c=await control();
 await assert(c.epoch==='248'&&!c.accepting_orders&&c.dispatch_enabled,'SECOND_APPEND_ONLY_GENERATION_248');
 await assert((await db.query('SELECT count(*)::int n FROM zee.testnet_closed_recovery_generations')).rows[0].n===2,'BOTH_GENERATIONS_RETAINED');
 await rejected('UPDATE zee.testnet_closed_recovery_generations SET qualification_sha256=$1',[worker],'immutable record');
 await rejected('UPDATE zee.testnet_closed_recovery_authorizations SET worker_config_sha256=$1',[manifest],'immutable record');
 await assert((await db.query('SELECT active_epoch::text epoch FROM zee.root_testnet_service_policies WHERE policy_sha256=$1',[h(policy)])).rows[0].epoch==='242','RAW_POLICY_RETAINED');
 await assert((await db.query('SELECT effective_epoch::text epoch FROM zee.testnet_policy_execution_resumptions WHERE policy_sha256=$1',[h(policy)])).rows[0].epoch==='244','OLD_RESUMPTION_RETAINED');
 await db.query('SELECT zee.pause_testnet_closed_execution($1,$2,$3)',[auth,c.epoch,c.xmin]);
 await db.query('SELECT zee.enter_reconciliation()');c=await control();await assert(c.epoch==='250','REPEATED_OBSERVER_PAUSE');
 await db.query(resume,[auth,c.epoch,c.xmin,proof,worker,manifest,execution,p.source_identity_digest]);
 await assert((await control()).epoch==='252','NEXT_EVEN_AFTER_REPEATED_PAUSE');
 console.log(JSON.stringify({status:'CLOSED_RECOVERY_SQL_FIXTURE_PASS',cases,fullHistoricalBooks:true,mainWrites:false,rollback:true}));
}finally{await db.query('ROLLBACK');db.release();await pool.end();}
