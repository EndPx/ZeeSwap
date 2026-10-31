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
 if(process.argv.includes('--delivered-background')){
  await db.query(await readFile(new URL('../migrations/0040_testnet_delivered_background.sql',import.meta.url),'utf8'));
  await db.query(await readFile(new URL('../migrations/0041_testnet_continuous_successor.sql',import.meta.url),'utf8'));
  await db.query('SAVEPOINT delivered_background');
  const id=await quote();await db.query(bind,[id,policy,owner]);await db.query(accept,[id,policy,owner]);
  const deposit=randomUUID(),source=(await db.query("SELECT height::text,block_hash FROM zee.chain_observations b JOIN zee.scanner_checkpoints s USING(network) WHERE b.network='zcash-testnet' AND b.height<=s.scanned_height-9 ORDER BY b.height DESC LIMIT 1")).rows[0];
  check(source,'fixture has canonical confirmed Zcash anchor');
  await db.query(`INSERT INTO zee.deposits(id,identity_hash,network,order_id,amount,block_height,block_hash,block_time,reference_hash,receiver_hash,shielded,private_payload,classification)
   SELECT $2,$3,'zcash-testnet',id,input_amount,$4,$5,clock_timestamp(),deposit_reference_hash,receiver_hash,true,$6,'EXACT' FROM zee.quotes WHERE id=$1`,[id,deposit,randomBytes(32),source.height,source.block_hash,Buffer.alloc(64,1)]);
  await db.query('UPDATE zee.orders SET primary_deposit=$2 WHERE id=$1',[id,deposit]);
  await db.query("INSERT INTO zee.obligations VALUES($1,$2,100000,'HELD')",[deposit,id]);
  await db.query('SELECT zee.confirm_deposit($1)',[deposit]);
  await db.query('INSERT INTO zee.base_bindings(order_id,terms_payload) VALUES($1,$2)',[id,Buffer.alloc(64,1)]);
  const base={height:(BigInt((await db.query("SELECT scanned_height::text h FROM zee.scanner_checkpoints WHERE network='base-sepolia'")).rows[0].h)+1n).toString(),block_hash:randomBytes(32).toString('hex')};
  await db.query("INSERT INTO zee.chain_observations VALUES('base-sepolia',$1,$2,clock_timestamp())",[base.height,base.block_hash]);
  await db.query("UPDATE zee.scanner_checkpoints SET scanned_height=$1,tip_hash=$2,observed_at=clock_timestamp() WHERE network='base-sepolia'",[base.height,base.block_hash]);
  check((await db.query("SELECT finalized_height<$1 yes FROM zee.scanner_checkpoints WHERE network='base-sepolia'",[base.height])).rows[0].yes,'delivery fixture is above actual SQL finalized height');
  for(const phase of ['RESERVE','PAY']){
   const hash=randomBytes(32);await db.query('INSERT INTO zee.base_attempts(order_id,phase,tx_hash,signed_payload,max_cost) VALUES($1,$2,$3,$4,50000000000000)',[id,phase,hash,Buffer.alloc(64,1)]);
   await db.query('SELECT zee.observe_base_inclusion($1,$2,$3,$4,$5,1000,$6)',[id,phase,hash,base.height,base.block_hash,Buffer.alloc(64,1)]);
   if(phase==='RESERVE')check((await db.query('SELECT zee.testnet_global_slot_busy() yes')).rows[0].yes,'RESERVE alone never releases foreground');
  }
  await db.query("UPDATE zee.operations SET state='SIGNED' WHERE order_id=$1",[id]);
  await db.query("UPDATE zee.outbox_jobs SET status='LEASED',lease_owner=$2,lease_until=clock_timestamp()+interval '60 seconds',fence=1 WHERE operation_id IN(SELECT id FROM zee.operations WHERE order_id=$1)",[id,randomUUID()]);
  const deliveryReady=(await db.query('SELECT zee.testnet_order_delivery_included($1) yes',[id])).rows[0].yes;
  if(!deliveryReady)console.log(JSON.stringify({fixtureDeliveryPredicates:(await db.query(`SELECT
   o.state,q.direction,q.execution_mode,a.accepted_epoch::text,zee.testnet_policy_execution_epoch(a.policy_sha256)::text execution_epoch,
   zee.testnet_continuous_demo_enabled(a.policy_sha256) continuous,d.classification,d.confirmed_at IS NOT NULL source_confirmed,
   d.amount=q.input_amount source_amount,s.scanned_height-d.block_height+1>=10 source_depth,
   (SELECT count(*)::int FROM zee.scanner_checkpoints WHERE observed_at BETWEEN clock_timestamp()-interval '60 seconds' AND clock_timestamp()+interval '5 seconds') fresh_sources,
   (SELECT jsonb_agg(jsonb_build_object('phase',t.phase,'valid',i.valid,'identity',i.tx_hash=t.tx_hash,'fee',i.fee<=t.max_cost,'canonical',EXISTS(SELECT 1 FROM zee.chain_observations b WHERE b.network='base-sepolia' AND b.height=i.block_height AND b.block_hash=i.block_hash))) FROM zee.base_attempts t JOIN zee.base_inclusions i USING(order_id,phase) WHERE t.order_id=o.id) inclusions,
   (SELECT jsonb_agg(jsonb_build_object('kind',op.kind,'state',op.state,'deposit_matches',op.deposit_id=d.id,'has_job',EXISTS(SELECT 1 FROM zee.outbox_jobs j WHERE j.operation_id=op.id))) FROM zee.operations op WHERE op.order_id=o.id) operations,
   (SELECT jsonb_agg(jsonb_build_object('state',ob.state,'deposit_matches',ob.deposit_id=d.id,'amount_matches',ob.source_amount=d.amount)) FROM zee.obligations ob WHERE ob.order_id=o.id) obligations,
   (SELECT jsonb_agg(jsonb_build_object('asset',r.asset,'purpose',r.purpose,'amount',r.amount::text,'held',r.released_at IS NULL)) FROM zee.reservations r WHERE r.order_id=o.id) reservations
   FROM zee.orders o JOIN zee.quotes q ON q.id=o.id JOIN zee.testnet_policy_admissions a ON a.order_id=o.id JOIN zee.deposits d ON d.id=o.primary_deposit JOIN zee.scanner_checkpoints s ON s.network=d.network WHERE o.id=$1`,[id])).rows[0]}));
  check(deliveryReady,'canonical RESERVE and PAY classify delivered without final confirmation');
  check(!(await db.query('SELECT zee.testnet_global_slot_busy() yes')).rows[0].yes,'delivered financial rows release only foreground slot');
  const before=(await db.query('SELECT asset,purpose,balance::text,reserved::text FROM zee.inventory_accounts ORDER BY asset,purpose')).rows;
  check((await available()).policy.activeOrders===0,'availability foreground count excludes delivered order');
  check((await db.query('SELECT state FROM zee.orders WHERE id=$1',[id])).rows[0].state==='READY','original order stays READY');
  check((await db.query('SELECT state FROM zee.obligations WHERE deposit_id=$1',[deposit])).rows[0].state==='HELD','original liability stays HELD');
  check((await db.query('SELECT count(*)::int n FROM zee.base_attempts WHERE order_id=$1 AND NOT confirmed',[id])).rows[0].n===2,'original attempts remain unconfirmed');
  check((await db.query('SELECT count(*)::int n FROM zee.reservations WHERE order_id=$1 AND released_at IS NULL',[id])).rows[0].n===3,'all original reserves remain held');
  await rejected('SELECT zee.reconcile_testnet_continuous_proceeds($1,$2,$3,clock_timestamp())',[policy,id,proof],/CLOSED_QUALIFICATION/);
  for(const phase of ['RESERVE','PAY']){
   await db.query('SAVEPOINT bad_inclusion');await db.query('UPDATE zee.base_inclusions SET valid=false WHERE order_id=$1 AND phase=$2',[id,phase]);
   check((await db.query('SELECT zee.testnet_global_slot_busy() yes')).rows[0].yes,'invalid '+phase+' blocks new admission');await db.query('ROLLBACK TO bad_inclusion');
  }
  await db.query('SAVEPOINT wrong_identity');await db.query("UPDATE zee.base_inclusions SET tx_hash=$2 WHERE order_id=$1 AND phase='PAY'",[id,randomBytes(32)]);
  check((await db.query('SELECT zee.testnet_global_slot_busy() yes')).rows[0].yes,'changed PAY transaction identity blocks admission');await db.query('ROLLBACK TO wrong_identity');
  await db.query('SAVEPOINT stale_source');await db.query("UPDATE zee.scanner_checkpoints SET observed_at=clock_timestamp()-interval '61 seconds'");
  check((await db.query('SELECT zee.testnet_global_slot_busy() yes')).rows[0].yes,'stale sources fence foreground release');await db.query('ROLLBACK TO stale_source');
  await db.query('SAVEPOINT bad_anchor');await db.query("UPDATE zee.chain_observations SET block_hash=$2 WHERE network='base-sepolia' AND height=$1",[base.height,'f'.repeat(64)]);
  check((await db.query('SELECT zee.testnet_global_slot_busy() yes')).rows[0].yes,'changed canonical PAY anchor blocks admission');await db.query('ROLLBACK TO bad_anchor');
  await db.query('SAVEPOINT orphan_liability');const orphan=randomUUID();
  await db.query(`INSERT INTO zee.deposits(id,identity_hash,network,order_id,amount,block_height,block_hash,block_time,reference_hash,receiver_hash,shielded,private_payload,classification)
   SELECT $2,$3,network,NULL,amount,block_height,block_hash,block_time,reference_hash,receiver_hash,shielded,private_payload,'EXTRA' FROM zee.deposits WHERE id=$1`,[deposit,orphan,randomBytes(32)]);
  await db.query("INSERT INTO zee.obligations VALUES($1,NULL,100000,'UNALLOCATED')",[orphan]);
  check((await db.query('SELECT zee.testnet_global_slot_busy() yes')).rows[0].yes,'unlinked liability remains globally blocking');
  await db.query('ROLLBACK TO orphan_liability');
  assert.deepEqual((await db.query('SELECT asset,purpose,balance::text,reserved::text FROM zee.inventory_accounts ORDER BY asset,purpose')).rows,before);cases++;
  await db.query('SAVEPOINT next_foreground');const next=await quote();await db.query(bind,[next,policy,owner]);await db.query(accept,[next,policy,owner]);
  check((await available()).policy.activeOrders===1,'next order admitted while first keeps financial reserves');
  const third=await quote();await db.query(bind,[third,policy,owner]);await rejected(accept,[third,policy,owner],/SERVICE_GLOBAL_SLOT_BUSY/);
  check((await db.query('SELECT state FROM zee.orders WHERE id=$1',[id])).rows[0].state==='READY','second admission does not settle original');
  await db.query('ROLLBACK TO next_foreground');
  check((await db.query('SELECT zee.testnet_continuous_execution_authorized($1,$2,$3,$4,$5) yes',[policy,...args.slice(9)])).rows[0].yes,'original execution tuple remains current before successor');
  await db.query('UPDATE zee.runtime_control SET accepting_orders=false');
  const successorControl=(await db.query('SELECT epoch::text,xmin::text FROM zee.runtime_control')).rows[0],successor=randomBytes(32),tuple=[randomBytes(32),randomBytes(32),randomBytes(32),randomBytes(32)];
  const publishSuccessor='SELECT zee.publish_testnet_continuous_successor($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',successorArgs=[policy,args[1],successor,randomBytes(32),randomBytes(32),successorControl.epoch,successorControl.xmin,new Date(Date.now()+120000),...tuple];
  await rejected(publishSuccessor,[policy,randomBytes(32),...successorArgs.slice(2)],/SUCCESSOR_BOUNDARY/);
  await db.query('SAVEPOINT successor_publication');
  try{await db.query(publishSuccessor,successorArgs);}catch(error){
   await db.query('ROLLBACK TO successor_publication');
   console.log(JSON.stringify({fixtureSuccessorPredicates:(await db.query(`SELECT
    c.epoch::text epoch,zee.testnet_policy_execution_epoch($1)::text effective_epoch,c.xmin::text actual_xmin,$2::text expected_xmin,
    c.dispatch_enabled,c.accepting_orders,c.reconciliation_required,zee.testnet_global_slot_busy() foreground_busy,
    zee.testnet_continuous_late_exposure($1) late_exposure,
    EXISTS(SELECT 1 FROM zee.testnet_continuous_current_execution($1) WHERE authorization_sha256=$3) predecessor_matches,
    EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=84532 AND objid=20261026 AND granted AND pid<>pg_backend_pid()) foreign_worker_lease,
    (SELECT count(*)::int FROM zee.scanner_checkpoints WHERE network IN('base-sepolia','zcash-testnet') AND observed_at BETWEEN clock_timestamp()-interval '30 seconds' AND clock_timestamp()+interval '5 seconds') fresh_sources
    FROM zee.runtime_control c WHERE singleton`,[policy,successorControl.xmin,args[1]])).rows[0]}));throw error;
  }
  check((await db.query('SELECT zee.testnet_continuous_execution_authorized($1,$2,$3,$4,$5) yes',[policy,...tuple])).rows[0].yes,'immutable successor tuple authorizes new worker');
  check(!(await db.query('SELECT zee.testnet_continuous_execution_authorized($1,$2,$3,$4,$5) yes',[policy,...args.slice(9)])).rows[0].yes,'superseded tuple cannot authorize worker');
  check(!(await db.query('SELECT zee.testnet_continuous_capital_authorized($1,$2) yes',[policy,args[12]])).rows[0].yes,'superseded capital approval is rejected');
  await rejected('UPDATE zee.testnet_continuous_execution_generations SET qualification_sha256=qualification_sha256',[],/immutable/);
  check((await db.query('SELECT state FROM zee.orders WHERE id=$1',[id])).rows[0].state==='READY','successor publication preserves original funded order');
  await db.query('ROLLBACK TO delivered_background');
 }
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
