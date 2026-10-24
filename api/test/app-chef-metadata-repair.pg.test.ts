import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
import {applyAppMetadataUpdates,type AppMetadataRepairApproval} from '../src/app-chef-metadata-repair.ts';

const url=process.env.APP_METADATA_REPAIR_TEST_DATABASE_URL;
const wrong='a'.repeat(64),canonical='b'.repeat(64),common='c'.repeat(64),oldFinalizedHash='d'.repeat(64),targetFinalizedHash='e'.repeat(64);
const oldFinalizedTime='2026-10-24T14:52:00Z',targetFinalizedTime='2026-10-24T14:51:00Z';

/** Extract the shipped definitions rather than maintaining a trigger lookalike. */
async function observerTriggers(){
 const transitions=await readFile(new URL('../migrations/0002_transitions.sql',import.meta.url),'utf8');
 const guards=await readFile(new URL('../migrations/0004_observer_guards.sql',import.meta.url),'utf8');
 const reconciliation=transitions.match(/CREATE FUNCTION zee\.enter_reconciliation\(\)[\s\S]*?END \$\$;/)?.[0];
 const rewind=guards.match(/CREATE FUNCTION zee\.guard_observer_rewind\(\)[\s\S]*?CREATE TRIGGER canonical_reorg[^;]*;/)?.[0];
 assert.ok(reconciliation,'original reconciliation definition must be found');
 assert.ok(rewind,'original rewind definition and both trigger bindings must be found');
 return reconciliation+'\n'+rewind;
}

/** Every qualification points to this invocation's schema. Never use a live zee table. */
function scopedQuery(client:pg.Client,schema:string){
 assert.match(schema,/^app_chef_repair_[0-9a-f]{24}$/);
 return async(sql:string,values:unknown[]=[])=>client.query(sql.replace(/\bzee\./g,`"${schema}".`),values);
}

async function fixture(client:pg.Client,schema:string){
 const query=scopedQuery(client,schema);
 await query(`CREATE TABLE zee.runtime_control (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 accepting_orders boolean NOT NULL DEFAULT false,dispatch_enabled boolean NOT NULL DEFAULT false,
 reconciliation_required boolean NOT NULL DEFAULT true,epoch bigint NOT NULL CHECK(epoch>=0));
 CREATE TABLE zee.scanner_checkpoints (
 network text PRIMARY KEY CHECK(network IN ('zcash-testnet','base-sepolia')),
 scanned_height bigint NOT NULL CHECK(scanned_height>=0),tip_hash text NOT NULL CHECK(tip_hash ~ '^[0-9a-f]{64}$'),
 finalized_height bigint NOT NULL CHECK(finalized_height BETWEEN 0 AND scanned_height),
 finalized_time timestamptz NOT NULL,observed_at timestamptz NOT NULL);
 CREATE TABLE zee.chain_observations (
 network text NOT NULL REFERENCES zee.scanner_checkpoints(network),height bigint NOT NULL CHECK(height>=0),
 block_hash text NOT NULL CHECK(block_hash ~ '^[0-9a-f]{64}$'),block_time timestamptz NOT NULL,PRIMARY KEY(network,height));
 CREATE TABLE zee.outbox_jobs (status text NOT NULL,fence bigint NOT NULL,lease_owner uuid,lease_until timestamptz);
 INSERT INTO zee.runtime_control(epoch) VALUES(1);`);
 await query(await observerTriggers());
 await query(`INSERT INTO zee.scanner_checkpoints VALUES('zcash-testnet',4536137,$1,4536128,'2026-10-24T14:52:00Z','2026-10-24T15:01:00Z');
 `,[wrong]);
 await query(`INSERT INTO zee.chain_observations VALUES('zcash-testnet',4536137,$1,'2026-10-24T15:01:00Z'),('zcash-testnet',4536136,$2,'2026-10-24T15:00:00Z'),('zcash-testnet',4536128,$3,$4::timestamptz),('zcash-testnet',4536127,$5,$6::timestamptz)`,[wrong,common,oldFinalizedHash,oldFinalizedTime,targetFinalizedHash,targetFinalizedTime]);
 return query;
}

// Explicit opt-in only. A missing URL is a skipped real-Postgres gate, never local proof.
test('real PostgreSQL original observer triggers preserve observed_at, rebind finalized_time, advance epoch twice and fence unknown COMMIT readback',
 {skip:!url?'APP_METADATA_REPAIR_TEST_DATABASE_URL not provided':false},async()=>{
 const schema='app_chef_repair_'+randomBytes(12).toString('hex');
 const client=new pg.Client({connectionString:url});
 await client.connect();
 let created=false;
 try{
  const query=scopedQuery(client,schema);
  await client.query(`CREATE SCHEMA "${schema}"`);created=true;
  await fixture(client,schema);
  const triggers=(await client.query(`SELECT tgname,tgenabled FROM pg_trigger WHERE tgrelid IN ($1::regclass,$2::regclass) AND NOT tgisinternal ORDER BY tgname`,[`${schema}.scanner_checkpoints`,`${schema}.chain_observations`])).rows;
  assert.deepEqual(triggers,[{tgname:'canonical_reorg',tgenabled:'O'},{tgname:'observer_rewind',tgenabled:'O'}]);
  const before=(await query(`SELECT observed_at::text,finalized_time::text FROM zee.scanner_checkpoints WHERE network='zcash-testnet'`)).rows[0];
  await query('BEGIN');
  const xid=(await query('SELECT pg_current_xact_id()::text id')).rows[0].id;
  const expectedXmin=(BigInt(xid)%4294967296n).toString();
  const approval={
   oldCheckpoint:{height:4536137,hash:wrong,finalizedHeight:4536128,finalizedTime:oldFinalizedTime,observedAt:'2026-10-24T15:01:00Z'},
   oldTipRow:{height:4536137,hash:wrong,time:'2026-10-24T15:01:00Z'},
   common:{height:4536136,hash:common,parentHash:'f'.repeat(64),time:'2026-10-24T15:00:00Z'},
   replacement:{height:4536137,hash:canonical,parentHash:common,time:'2026-10-24T15:01:01Z'},
   oldFinalized:{height:4536128,hash:oldFinalizedHash,parentHash:targetFinalizedHash,time:oldFinalizedTime},
   targetFinalized:{height:4536127,hash:targetFinalizedHash,parentHash:'f'.repeat(64),time:targetFinalizedTime},
  } as AppMetadataRepairApproval;
  let updateCount=0;
  const repairClient={query:async(sql:string,values:unknown[])=>{
   const result=await query(sql,values);updateCount++;
   if(sql.startsWith('UPDATE zee.chain_observations'))assert.equal((await query('SELECT epoch::text FROM zee.runtime_control')).rows[0].epoch,'2');
   return result;
  }} as unknown as Pick<pg.PoolClient,'query'>;
  await applyAppMetadataUpdates(repairClient,approval);
  assert.equal(updateCount,2,'production repair issues exactly two metadata CAS updates');
  const intended=(await query(`SELECT accepting_orders,dispatch_enabled,reconciliation_required,epoch::text,xmin::text FROM zee.runtime_control`)).rows[0];
  assert.deepEqual(intended,{accepting_orders:false,dispatch_enabled:false,reconciliation_required:true,epoch:'3',xmin:expectedXmin});
  // Simulate an acknowledgment lost after the server actually commits. Readback must
  // inspect transaction status and exact metadata on a fresh independent connection.
  await assert.rejects(async()=>{await query('COMMIT');throw Error('SIMULATED_COMMIT_ACK_LOSS');},/SIMULATED_COMMIT_ACK_LOSS/);
  const reader=new pg.Client({connectionString:url});await reader.connect();
  try{
   const read=scopedQuery(reader,schema);
   assert.equal((await read('SELECT pg_xact_status($1::xid8) status',[xid])).rows[0].status,'committed');
   const after=(await read(`SELECT accepting_orders,dispatch_enabled,reconciliation_required,epoch::text,xmin::text FROM zee.runtime_control`)).rows[0];
   assert.deepEqual(after,intended);
   const scanner=(await read(`SELECT scanned_height::text,tip_hash,finalized_height::text,observed_at::text,finalized_time::text FROM zee.scanner_checkpoints`)).rows[0];
   const targetTime=(await read('SELECT $1::timestamptz::text value',[targetFinalizedTime])).rows[0].value;
   assert.deepEqual(scanner,{scanned_height:'4536136',tip_hash:common,finalized_height:'4536127',observed_at:before.observed_at,finalized_time:targetTime});
   assert.notEqual(scanner.finalized_time,before.finalized_time);
   assert.equal((await read(`SELECT block_hash FROM zee.chain_observations WHERE height=4536128`)).rows[0].block_hash,oldFinalizedHash);
   const tip=(await read(`SELECT block_hash,block_time=$1::timestamptz time_matches FROM zee.chain_observations WHERE height=4536137`,[approval.replacement.time])).rows[0];
   assert.deepEqual(tip,{block_hash:canonical,time_matches:true});
   // Even an equal-value later administrative write has a different xmin. It must
   // never impersonate this repair's committed runtime row.
   await read(`UPDATE zee.runtime_control SET accepting_orders=false WHERE singleton`);
   const intervened=(await read(`SELECT accepting_orders,dispatch_enabled,reconciliation_required,epoch::text,xmin::text FROM zee.runtime_control`)).rows[0];
   assert.equal(intervened.epoch,'3');assert.notEqual(intervened.xmin,expectedXmin);assert.notDeepEqual(intervened,intended);
  }finally{await reader.end();}
 }finally{
  await client.query('ROLLBACK').catch(()=>{});
  // Cleanup is bounded to a literal invocation-owned random name checked above.
  if(created)await client.query(`DROP SCHEMA "${schema}" CASCADE`);
  await client.end();
 }
});
