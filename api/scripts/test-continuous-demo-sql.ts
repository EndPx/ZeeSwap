/** Explicit disposable, copied CLOSED database only. All fixture mutations roll back. */
import {readFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';
import {acquireContinuousPublicationMutex} from './administer-continuous-demo.ts';
import {validateServiceAvailability} from '../src/testnet-service-policy.ts';
const cfg=JSON.parse(await readFile(process.argv[2]!,'utf8')),url=new URL(cfg.databaseUrl);
assert.equal(url.pathname,'/zee_continuous_demo_test_20261031');assert.equal(decodeURIComponent(url.username),'zee_app_admin_20261023');url.searchParams.delete('sslmode');
const connection={connectionString:url.toString(),ssl:{ca:await readFile(cfg.caPath,'utf8'),rejectUnauthorized:true},statement_timeout:20000};const db=new pg.Client(connection),consumer=new pg.Client(connection);
const policy=Buffer.from('1684eb5a004f4cc9bfbe332bea10970796374349ce00fddfd540fe80da5d41a8','hex'),proof=randomBytes(32),owner=randomBytes(32);let cases=0;
const check=(value:unknown,label:string)=>{assert.ok(value,label);cases++;};
async function rejected(sql:string,args:any[],code:RegExp){await db.query('SAVEPOINT negative_case');try{await assert.rejects(db.query(sql,args),code);cases++;}finally{await db.query('ROLLBACK TO negative_case');}}
try{
 await db.connect();await consumer.connect();await consumer.query('SELECT pg_advisory_lock(84532,20261024)');await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='2000ms'");
 await acquireContinuousPublicationMutex(db);check((await db.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=84532 AND objid=20261024 AND pid<>pg_backend_pid() AND granted) held")).rows[0].held,'ordinary separate consumer lifetime lease24 remains held while row mutex qualifies');
 check((await db.query('SELECT zee.testnet_policy_closed_books() yes')).rows[0].yes,'copied full books must actually be closed');
 const original=(await db.query('SELECT to_jsonb(p) row FROM zee.root_testnet_service_policies p WHERE policy_sha256=$1',[policy])).rows[0].row;
 const history=(await db.query('SELECT count(*)::int quotes FROM zee.testnet_policy_quotes')).rows[0].quotes;
 await db.query(await readFile(new URL('../migrations/0039_testnet_continuous_demo.sql',import.meta.url),'utf8'));
 check(!(await db.query('SELECT zee.testnet_continuous_demo_enabled($1) yes',[policy])).rows[0].yes,'no implicit mode grant');
 await db.query('UPDATE zee.runtime_control SET epoch=zee.testnet_policy_execution_epoch($1),accepting_orders=true,dispatch_enabled=true,reconciliation_required=false',[policy]);
 const control=(await db.query('SELECT epoch::text,xmin::text FROM zee.runtime_control')).rows[0];
 const baseFee=(await db.query("SELECT balance::text amount FROM zee.inventory_accounts WHERE asset='baseETH' AND purpose='fee'")).rows[0].amount;
 const publish='SELECT zee.publish_testnet_continuous_demo($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)';
 const args=[policy,randomBytes(32),randomBytes(32),proof,randomBytes(32),control.epoch,control.xmin,new Date(Date.now()+120000),baseFee,randomBytes(32),randomBytes(32),randomBytes(32),randomBytes(32)];
 await db.query("UPDATE zee.scanner_checkpoints SET observed_at=clock_timestamp()-interval '2 minutes'");
 await rejected(publish,args,/SOURCE_STALE/);await db.query('UPDATE zee.scanner_checkpoints SET observed_at=clock_timestamp()');
 await rejected(publish,[...args.slice(0,6),'1',...args.slice(7)],/CURRENT_CLOSED_AUTHORITY/);
 await rejected(publish,[...args.slice(0,8),'1',...args.slice(9)],/BASE_FEE_UNCHANGED/);
 await rejected(publish,[...args.slice(0,7),new Date(Date.now()-1000),baseFee,...args.slice(9)],/CURRENT_CLOSED_AUTHORITY/);
 await db.query(publish,args);check((await db.query('SELECT zee.testnet_continuous_demo_enabled($1) yes',[policy])).rows[0].yes,'actual immutable grant enables mode');
 await rejected(publish,args,/ALREADY_PUBLISHED/);
 assert.deepEqual((await db.query('SELECT to_jsonb(p) row FROM zee.root_testnet_service_policies p WHERE policy_sha256=$1',[policy])).rows[0].row,original);cases++;
 check((await db.query('SELECT count(*)::int n FROM zee.testnet_policy_quotes')).rows[0].n===history,'publication retains historical quotes');
 await db.query('SELECT pg_advisory_xact_lock(84532,20261026)');
 await db.query('SELECT zee.record_testnet_worker_readiness($1,clock_timestamp(),$2)',[policy,proof]);
 const available=async()=>{const a=(await db.query('SELECT zee.testnet_policy_availability($1) a',[policy])).rows[0].a;validateServiceAvailability(a);assert.ok(a.policy);assert.ok(a.policy.quoteRateLimit);return {...a,policy:{...a.policy,quoteRateLimit:a.policy.quoteRateLimit}};};
 let a=await available();check(a.version===5&&a.status==='ready'&&a.policy.remainingQuotes===null&&a.policy.maxAcceptedByDirection===null,'explicit continuous schema');
 check(a.policy.remainingByDirection.ZCASH_TO_BASE>=3&&a.policy.remainingByDirection.BASE_TO_ZCASH>=3,'current inventory permits more than old cap');
 const quote=async()=>{const id=randomUUID();await db.query(`INSERT INTO zee.quotes(id,direction,source_asset,destination_asset,input_amount,output_amount,payout_fee_asset,payout_fee,refund_fee_asset,refund_fee,private_payload,deposit_reference_hash,receiver_hash,access_hash,settlement_id,execution_mode,base_contract,created_at,expires_at) VALUES($1,'ZCASH_TO_BASE','TAZ','mockUSDC',100000,100000,'baseETH',100000000000000,'TAZ',10000,$2,$3,$4,$5,$6,'base-settlement-v1',$7,statement_timestamp(),statement_timestamp()+interval '120 seconds')`,[id,Buffer.alloc(64,1),randomBytes(32),randomBytes(32),owner,randomUUID(),original.settlement_contract]);return id;};
 const bind='SELECT zee.bind_testnet_policy_quote($1,$2,$3)',accept='SELECT zee.accept_testnet_policy_quote($1,$2,$3)';
 // Three deliberately chargeable, closed fixture admissions exceed the old cap.
 for(let i=0;i<3;i++){
  const id=await quote();await db.query(bind,[id,policy,owner]);await db.query(accept,[id,policy,owner]);
  check((await db.query('SELECT * FROM zee.check_testnet_policy_worker($1,$2)',[policy,id])).rows[0].order_id===id,'worker admits exact current reservation beyond cumulative cap');
  const other=await quote();await db.query(bind,[other,policy,owner]);await rejected(accept,[other,policy,owner],/SERVICE_GLOBAL_SLOT_BUSY/);
  await db.query("UPDATE zee.scanner_checkpoints SET scanned_height=scanned_height+100,finalized_height=finalized_height+100,observed_at=clock_timestamp(),finalized_time=clock_timestamp()+interval '3 hours'");
  await db.query('SELECT zee.expire_unfunded($1)',[id]);
  await db.query("INSERT INTO zee.order_events(order_id,event_type) VALUES($1,'FIXTURE_CHARGEABLE_CLOSED')",[id]);
  await db.query('SELECT zee.record_testnet_worker_readiness($1,clock_timestamp(),$2)',[policy,proof]);
 }
 check(Number((await db.query('SELECT count(*) n FROM zee.testnet_policy_chargeable_admissions($1)',[policy])).rows[0].n)>=3,'lifetime chargeable history retained above old cap');
 a=await available();for(let i=0;i<a.policy.quoteRateLimit.remaining;i++){const id=await quote();await db.query(bind,[id,policy,owner]);}
 a=await available();check(a.status==='rate_limited'&&a.policy.quoteRateLimit.remaining===0&&a.policy.remainingQuotes===null,'bounded sliding quote rate');
 await rejected(bind,[await quote(),policy,owner],/SERVICE_QUOTE_RATE_LIMIT/);
 check((await db.query('SELECT count(*)::int n FROM zee.testnet_policy_quotes')).rows[0].n>32,'historical quote issuance exceeds old lifetime32 without reset');
 await db.query('SAVEPOINT low_liquidity');await db.query("UPDATE zee.inventory_accounts SET balance=99999 WHERE asset='mockUSDC' AND purpose='principal'");
 check((await available()).policy.remainingByDirection.ZCASH_TO_BASE===0,'insufficient principal disables direction');await db.query('ROLLBACK TO low_liquidity');
 const settled=(await db.query("SELECT id FROM zee.orders WHERE state='SETTLED' AND primary_deposit IS NOT NULL AND id IN(SELECT order_id FROM zee.testnet_policy_admissions WHERE policy_sha256 IN(SELECT zee.testnet_policy_lineage($1))) LIMIT 1",[policy])).rows[0];
 check(settled,'actual copied finalized settlement required');
 const reconcile='SELECT zee.reconcile_testnet_continuous_proceeds($1,$2,$3,$4) credited',rargs=[policy,settled.id,proof,new Date()];
 await rejected(reconcile,[...rargs.slice(0,3),new Date(Date.now()-60000)],/CLOSED_QUALIFICATION/);
 check((await db.query(reconcile,rargs)).rows[0].credited,'finalized exact source credited');
 check((await db.query(reconcile,rargs)).rows[0].credited===false,'original deposit replay credits nothing');
 check((await db.query('SELECT zee.testnet_policy_closed_books() yes')).rows[0].yes,'balanced books remain closed after exact credit');
 await rejected('UPDATE zee.testnet_continuous_demo_authorizations SET publication_epoch=publication_epoch',[],/immutable/);
 await rejected('UPDATE zee.testnet_continuous_proceeds SET amount=amount',[],/immutable/);
 check(!(await db.query("SELECT has_function_privilege('zeeswap_worker','zee.reconcile_testnet_continuous_proceeds(zee.digest,uuid,zee.digest,timestamp with time zone)','EXECUTE') yes")).rows[0].yes,'worker cannot reconcile proceeds');
 console.log(JSON.stringify({status:'CONTINUOUS_DEMO_SQL_FIXTURE_PASS',cases,rollback:true,mainWrites:false}));
}finally{await db.query('ROLLBACK').catch(()=>{});await db.end();await consumer.end();}
