/** Root-operator opt-in only: existing isolated neondb URL, no URL output or branch creation. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {randomBytes,randomUUID} from 'node:crypto';import pg from 'pg';
const url=process.env.NATIVE_CIRCLE_ADMISSION_TEST_DATABASE_URL;
const owner=Buffer.alloc(32,1),wrongOwner=Buffer.alloc(32,2),H='a'.repeat(64),B='b'.repeat(64),C='c'.repeat(64);
function scoped(c:pg.Client,schema:string){assert.match(schema,/^native_circle_admission_[a-f0-9]{24}$/);return(sql:string,values:unknown[]=[])=>c.query(sql.replace(/\bzee\./g,`"${schema}".`),values);}
async function bodies(){const root=new URL('../../migrations/',import.meta.url),old=await readFile(new URL('0003_boundary_hardening.sql',root),'utf8'),lock=await readFile(new URL('0007_observer_cycle.sql',root),'utf8'),newDDL=await readFile(new URL('0017_native_circle_continuation.sql',root),'utf8');const accept=old.match(/CREATE OR REPLACE FUNCTION zee\.accept_quote\(p_id uuid\)[\s\S]*?END \$\$;/)?.[0],observer=lock.match(/CREATE FUNCTION zee\.lock_observer_cycle\(\)[\s\S]*?END \$\$;/)?.[0],continuation=newDDL.match(/CREATE FUNCTION zee\.accept_post_refund_circle\([\s\S]*?END \$\$;/)?.[0];assert.ok(accept&&observer&&continuation,'extract actual shipped function bodies, excluding production role grants');return observer+'\n'+accept+'\n'+continuation;}
async function fixture(q:ReturnType<typeof scoped>){
 await q(`CREATE DOMAIN zee.digest AS bytea CHECK(octet_length(VALUE)=32);
 CREATE TABLE zee.runtime_control(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),epoch bigint NOT NULL,accepting_orders boolean NOT NULL,dispatch_enabled boolean NOT NULL,reconciliation_required boolean NOT NULL);
 CREATE TABLE zee.assets(id text PRIMARY KEY,live_enabled boolean NOT NULL);
 CREATE TABLE zee.scanner_checkpoints(network text PRIMARY KEY,scanned_height bigint NOT NULL,finalized_height bigint NOT NULL,observed_at timestamptz NOT NULL);
 CREATE TABLE zee.chain_observations(network text,height bigint,block_hash text,PRIMARY KEY(network,height));
 CREATE TABLE zee.quotes(id uuid PRIMARY KEY,direction text NOT NULL,input_amount numeric NOT NULL,output_amount numeric NOT NULL,payout_fee numeric NOT NULL,refund_fee numeric NOT NULL,execution_mode text NOT NULL,access_hash zee.digest NOT NULL,expires_at timestamptz NOT NULL,destination_asset text NOT NULL,payout_fee_asset text NOT NULL,refund_fee_asset text NOT NULL);
 CREATE TABLE zee.orders(id uuid PRIMARY KEY REFERENCES zee.quotes(id),state text NOT NULL DEFAULT 'AWAITING_FUNDS',primary_deposit uuid,accepted_at timestamptz,funding_cutoff_height bigint,funding_cutoff_time timestamptz,cancellation_available_at timestamptz);
 CREATE TABLE zee.deposits(id uuid PRIMARY KEY,amount numeric NOT NULL,classification text NOT NULL,confirmed_at timestamptz,block_height bigint NOT NULL,block_hash text NOT NULL);
 CREATE TABLE zee.source_refunds(order_id uuid PRIMARY KEY,deposit_id uuid,base_phase text,base_confirmed boolean,confirmed boolean,zcash_fee numeric,height bigint,block_hash text,base_height bigint,base_block text);
 CREATE TABLE zee.obligations(deposit_id uuid PRIMARY KEY,state text NOT NULL);
 CREATE TABLE zee.operations(id uuid PRIMARY KEY,order_id uuid,deposit_id uuid,kind text,state text,chain_authorization_verified boolean NOT NULL DEFAULT false);
 CREATE TABLE zee.outbox_jobs(id uuid PRIMARY KEY,operation_id uuid,status text,lease_until timestamptz,lease_owner uuid,fence bigint NOT NULL DEFAULT 0);
 CREATE TABLE zee.base_attempts(order_id uuid);CREATE TABLE zee.reverse_payouts(order_id uuid);CREATE TABLE zee.escrow_commits(order_id uuid);
 CREATE TABLE zee.inventory_accounts(asset text,purpose text,balance numeric NOT NULL,reserved numeric NOT NULL DEFAULT 0,CHECK(reserved>=0 AND balance>=reserved),PRIMARY KEY(asset,purpose));
 CREATE TABLE zee.reservations(order_id uuid,asset text,purpose text,amount numeric,released_at timestamptz,PRIMARY KEY(order_id,asset,purpose));
 CREATE TABLE zee.ledger_entries(event_id uuid,asset text,bucket text,amount numeric,order_id uuid);
 CREATE TABLE zee.order_events(order_id uuid,event_type text);
 INSERT INTO zee.runtime_control VALUES(true,6,true,true,false);
 INSERT INTO zee.assets VALUES('TAZ',true),('mockUSDC',true),('baseETH',false);
 INSERT INTO zee.scanner_checkpoints VALUES('zcash-testnet',4536900,4536891,clock_timestamp()),('base-sepolia',49700000,49699900,clock_timestamp());
 INSERT INTO zee.inventory_accounts VALUES('mockUSDC','principal',200000,0),('TAZ','principal',200000,0),('TAZ','fee',10000,0),('baseETH','fee',499000000000000,0);`);
 await q(await bodies());
 const ids={old:randomUUID(),deposit:randomUUID(),refundOp:randomUUID(),refundJob:randomUUID(),forward:randomUUID(),thirdForward:randomUUID(),reverse:randomUUID(),secondReverse:randomUUID(),legacy:randomUUID(),opening:randomUUID()};
 async function quote(id:string,direction:string){const forward=direction==='ZCASH_TO_BASE';await q(`INSERT INTO zee.quotes VALUES($1,$2,100000,100000,$3,$4,$5,$6,clock_timestamp()+interval '30 minutes',$7,$8,$9)`,[id,direction,forward?'100000000000000':'10000',forward?'10000':'100000000000000',forward?'base-settlement-v1':'base-escrow-v1',owner,forward?'mockUSDC':'TAZ',forward?'baseETH':'TAZ',forward?'TAZ':'baseETH']);}
 for(const id of [ids.old,ids.forward,ids.thirdForward,ids.legacy])await quote(id,'ZCASH_TO_BASE');for(const id of [ids.reverse,ids.secondReverse])await quote(id,'BASE_TO_ZCASH');
 await q(`INSERT INTO zee.orders VALUES($1,'REFUNDED',$2,clock_timestamp()-interval '1 hour',4536773,NULL,NULL)`,[ids.old,ids.deposit]);
 await q(`INSERT INTO zee.deposits VALUES($1,100000,'LATE',clock_timestamp()-interval '1 hour',4536778,$2)`,[ids.deposit,H]);
 await q(`INSERT INTO zee.source_refunds VALUES($1,$2,'CANCEL',true,true,10000,4536800,$3,49699800,$4)`,[ids.old,ids.deposit,B,C]);
 await q("INSERT INTO zee.obligations VALUES($1,'DISCHARGED')",[ids.deposit]);await q("INSERT INTO zee.operations(id,order_id,deposit_id,kind,state) VALUES($1,$2,$3,'REFUND','CONFIRMED')",[ids.refundOp,ids.old,ids.deposit]);await q("INSERT INTO zee.outbox_jobs(id,operation_id,status,fence) VALUES($1,$2,'DONE',1)",[ids.refundJob,ids.refundOp]);
 await q(`INSERT INTO zee.chain_observations VALUES('zcash-testnet',4536778,$1),('zcash-testnet',4536800,$2),('base-sepolia',49699800,$3)`,[H,B,C]);
 for(const[asset,purpose,balance]of [['mockUSDC','principal','200000'],['TAZ','principal','200000'],['TAZ','fee','20000'],['baseETH','fee','500000000000000']])for(const[bucket,amount]of [[purpose+':available',balance],[purpose+':operator-capital','-'+balance]])await q('INSERT INTO zee.ledger_entries VALUES($1,$2,$3,$4,NULL)',[ids.opening,asset,bucket,amount]);
 await q(`INSERT INTO zee.reservations VALUES($1,'TAZ','fee',10000,clock_timestamp()-interval '1 hour')`,[ids.old]);return ids;
}

test('opt-in production0017 enforces post-refund global2F/1R admission, exact ownership/epoch,40block future cutoff and untouched legacy12block terms',
 {skip:!url?'NATIVE_CIRCLE_ADMISSION_TEST_DATABASE_URL not provided':false},async()=>{
 const schema='native_circle_admission_'+randomBytes(12).toString('hex'),client=new pg.Client({connectionString:url});await client.connect();let created=false;
 try{
  assert.equal((await client.query('SELECT current_database() db')).rows[0]?.db,'neondb','Root must use existing isolated neondb branch; no live app database');await client.query(`CREATE SCHEMA "${schema}"`);created=true;const q=scoped(client,schema),id=await fixture(q);
  const call=(order=id.forward,who:Buffer|null=owner,epoch:number|null=6)=>q('SELECT zee.accept_post_refund_circle($1,$2,$3,$4) id',[order,id.old,epoch,who]);
  const oldSnapshot=async()=>({operations:(await q('SELECT row_to_json(o) row FROM zee.operations o WHERE order_id=$1',[id.old])).rows,outbox:(await q('SELECT row_to_json(j) row FROM zee.outbox_jobs j JOIN zee.operations o ON o.id=j.operation_id WHERE o.order_id=$1',[id.old])).rows,order:(await q('SELECT row_to_json(o) row FROM zee.orders o WHERE id=$1',[id.old])).rows,quote:(await q('SELECT row_to_json(z) row FROM zee.quotes z WHERE id=$1',[id.old])).rows,deposit:(await q('SELECT row_to_json(d) row FROM zee.deposits d WHERE id=$1',[id.deposit])).rows,refund:(await q('SELECT row_to_json(f) row FROM zee.source_refunds f WHERE order_id=$1',[id.old])).rows,opening:(await q('SELECT asset,bucket,amount::text FROM zee.ledger_entries WHERE event_id=$1 ORDER BY asset,bucket',[id.opening])).rows,reservations:(await q('SELECT row_to_json(r) row FROM zee.reservations r WHERE order_id=$1',[id.old])).rows});
  assert.equal((await q('SELECT count(*)::text n FROM zee.operations')).rows[0].n,'1');assert.equal((await q('SELECT count(*)::text n FROM zee.outbox_jobs')).rows[0].n,'1');
  const preserved=await oldSnapshot(),fresh=()=>q('UPDATE zee.scanner_checkpoints SET observed_at=clock_timestamp()');
  async function refuses(change:string,values:unknown[]=[],order=id.forward){await fresh();await q('BEGIN');try{if(change)await q(change,values);await assert.rejects(call(order));}finally{await q('ROLLBACK');}}
  await assert.rejects(call(id.forward,wrongOwner));await assert.rejects(call(id.forward,null));await assert.rejects(call(id.forward,owner,null));await assert.rejects(call(id.forward,owner,7));
  for(const[sql,values]of [
   ['UPDATE zee.runtime_control SET epoch=7',[]],['UPDATE zee.runtime_control SET reconciliation_required=true',[]],['UPDATE zee.runtime_control SET accepting_orders=false',[]],['UPDATE zee.runtime_control SET dispatch_enabled=false',[]],
   ["UPDATE zee.scanner_checkpoints SET observed_at=clock_timestamp()-interval '61 seconds' WHERE network='zcash-testnet'",[]],
   ["UPDATE zee.orders SET state='REFUND_REQUIRED' WHERE id=$1",[id.old]],["UPDATE zee.operations SET state='SIGNED' WHERE id=$1",[id.refundOp]],["UPDATE zee.operations SET deposit_id=$2 WHERE id=$1",[id.refundOp,randomUUID()]],["INSERT INTO zee.operations(id,order_id,deposit_id,kind,state) VALUES($1,$2,$3,'REFUND','CONFIRMED')",[randomUUID(),id.old,id.deposit]],
   ['UPDATE zee.source_refunds SET confirmed=false WHERE order_id=$1',[id.old]],['UPDATE zee.source_refunds SET base_confirmed=false WHERE order_id=$1',[id.old]],
   ["UPDATE zee.deposits SET classification='EXACT' WHERE id=$1",[id.deposit]],['UPDATE zee.deposits SET confirmed_at=NULL WHERE id=$1',[id.deposit]],
   ["UPDATE zee.obligations SET state='HELD' WHERE deposit_id=$1",[id.deposit]],['DELETE FROM zee.chain_observations WHERE network=$1 AND height=$2',['zcash-testnet',4536800]],
   ["INSERT INTO zee.obligations VALUES($1,'UNALLOCATED')",[randomUUID()]],
   ['UPDATE zee.reservations SET released_at=NULL WHERE order_id=$1',[id.old]],["UPDATE zee.outbox_jobs SET status='QUEUED' WHERE id=$1",[id.refundJob]],["DELETE FROM zee.operations WHERE id=$1",[id.refundOp]],["DELETE FROM zee.outbox_jobs WHERE id=$1",[id.refundJob]],
   ['INSERT INTO zee.base_attempts VALUES($1)',[id.old]],['INSERT INTO zee.reverse_payouts VALUES($1)',[id.old]],['INSERT INTO zee.escrow_commits VALUES($1)',[id.old]],
   ["UPDATE zee.quotes SET input_amount=100001 WHERE id=$1",[id.forward]],['UPDATE zee.assets SET live_enabled=true WHERE id=$1',['baseETH']],
   ["INSERT INTO zee.outbox_jobs(id,operation_id,status,lease_until) VALUES($1,NULL,'LEASED',clock_timestamp()+interval '1 hour')",[randomUUID()]],
  ] as [string,unknown[]][])await refuses(sql,values);
  await fresh();await q('BEGIN');try{await q('SELECT zee.accept_quote($1)',[id.legacy]);assert.equal((await q('SELECT funding_cutoff_height::text h FROM zee.orders WHERE id=$1',[id.legacy])).rows[0].h,'4536912');}finally{await q('ROLLBACK');}
  await fresh();assert.equal((await call()).rows[0].id,id.forward);assert.equal((await q('SELECT funding_cutoff_height::text h FROM zee.orders WHERE id=$1',[id.forward])).rows[0].h,'4536940');assert.equal((await call()).rows[0].id,id.forward);
  await assert.rejects(call(id.thirdForward));await assert.rejects(call(id.reverse));assert.equal((await q("SELECT reserved::text FROM zee.inventory_accounts WHERE asset='TAZ' AND purpose='fee'")).rows[0].reserved,'10000');
  await q("UPDATE zee.orders SET state='SETTLED' WHERE id=$1",[id.forward]);await assert.rejects(call(id.reverse),'settled label alone cannot release the last fee hold');
  await q('UPDATE zee.inventory_accounts a SET reserved=a.reserved-r.amount FROM zee.reservations r WHERE r.order_id=$1 AND r.released_at IS NULL AND a.asset=r.asset AND a.purpose=r.purpose',[id.forward]);await q('UPDATE zee.reservations SET released_at=clock_timestamp() WHERE order_id=$1 AND released_at IS NULL',[id.forward]);
  await fresh();assert.equal((await call(id.reverse)).rows[0].id,id.reverse);assert.equal((await call(id.reverse)).rows[0].id,id.reverse);await assert.rejects(call(id.secondReverse));await assert.rejects(call(id.thirdForward));
  assert.equal((await q('SELECT count(*)::text n FROM zee.orders')).rows[0].n,'3');assert.deepEqual(await oldSnapshot(),preserved);
 }finally{await client.query('ROLLBACK').catch(()=>{});if(created)await client.query(`DROP SCHEMA "${schema}" CASCADE`);await client.end();}
});


test('opt-in concurrent production0017 forward admission serializes two clients with exactly one winner and no duplicate books',
 {skip:!url?'NATIVE_CIRCLE_ADMISSION_TEST_DATABASE_URL not provided':false},async()=>{
 const schema='native_circle_admission_'+randomBytes(12).toString('hex'),first=new pg.Client({connectionString:url,statement_timeout:15000}),second=new pg.Client({connectionString:url,statement_timeout:15000});let created=false,secondConnected=false,loser:Promise<{accepted:boolean;id?:string;error?:unknown}>|undefined;
 await first.connect();try{
  assert.equal((await first.query('SELECT current_database() db')).rows[0]?.db,'neondb','Root must use existing isolated neondb branch');await first.query(`CREATE SCHEMA "${schema}"`);created=true;const q=scoped(first,schema),id=await fixture(q);
  await second.connect();secondConnected=true;const other=scoped(second,schema);await q('BEGIN');await other('BEGIN');const firstPid=(await first.query('SELECT pg_backend_pid() pid')).rows[0].pid,secondPid=(await second.query('SELECT pg_backend_pid() pid')).rows[0].pid;
  const beforeOld=(await q('SELECT row_to_json(o) row FROM zee.orders o WHERE id=$1',[id.old])).rows;
  const winner=(await q('SELECT zee.accept_post_refund_circle($1,$2,6,$3) id',[id.forward,id.old,owner])).rows[0].id;
  // Hold the real runtime row lock after the first function returns but before
  // COMMIT. The independent second client must block there, then see the winner.
  loser=other('SELECT zee.accept_post_refund_circle($1,$2,6,$3) id',[id.thirdForward,id.old,owner]).then(r=>({accepted:true,id:r.rows[0].id}),error=>({accepted:false,error}));
  let blocked=false;for(let n=0;n<20&&!blocked;n++)blocked=((await first.query('SELECT pg_blocking_pids($1) blockers',[secondPid])).rows[0].blockers as number[]).includes(firstPid);
  assert.equal(blocked,true,'second client must wait on first transaction runtime lock');await q('COMMIT');const lost=await loser;
  assert.equal(winner,id.forward);assert.equal(lost.accepted,false,'all-history cap must reject losing forward after runtime lock is released');
  assert.equal((await q('SELECT count(*)::text n FROM zee.orders')).rows[0].n,'2');
  assert.equal((await q('SELECT count(*)::text n FROM zee.reservations WHERE order_id=$1 AND released_at IS NULL',[id.forward])).rows[0].n,'3');
  assert.equal((await q('SELECT count(*)::text n FROM zee.reservations WHERE order_id=$1',[id.thirdForward])).rows[0].n,'0');
  assert.equal((await q('SELECT count(*)::text n FROM zee.ledger_entries WHERE order_id=$1',[id.forward])).rows[0].n,'6');
  assert.equal((await q('SELECT count(*)::text n FROM zee.ledger_entries WHERE order_id=$1',[id.thirdForward])).rows[0].n,'0');
  assert.equal((await q("SELECT reserved::text FROM zee.inventory_accounts WHERE asset='TAZ' AND purpose='fee'")).rows[0].reserved,'10000');
  assert.equal((await q("SELECT count(*)::text n FROM zee.order_events WHERE event_type='ACCEPTED'")).rows[0].n,'1');
  assert.deepEqual((await q('SELECT row_to_json(o) row FROM zee.orders o WHERE id=$1',[id.old])).rows,beforeOld);
 }finally{
  await first.query('ROLLBACK').catch(()=>{});if(loser)await loser;if(secondConnected){await second.query('ROLLBACK').catch(()=>{});await second.end();}if(created)await first.query(`DROP SCHEMA "${schema}" CASCADE`);await first.end();
 }
});
