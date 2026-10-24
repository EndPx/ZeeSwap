/** Root-operator opt-in only: existing isolated neondb URL, no URL output or branch creation. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {randomBytes,randomUUID,createHash} from 'node:crypto';import pg from 'pg';
const url=process.env.NATIVE_CIRCLE_REPLACEMENT_TEST_DATABASE_URL;
const owner=Buffer.alloc(32,1),wrongOwner=Buffer.alloc(32,2),H='a'.repeat(64),B='b'.repeat(64),C='c'.repeat(64);
function scoped(c:pg.Client,schema:string){assert.match(schema,/^native_circle_replacement_[a-f0-9]{24}$/);return(sql:string,values:unknown[]=[])=>c.query(sql.replace(/\bzee\./g,`"${schema}".`),values);}
async function bodies(){const root=new URL('../../migrations/',import.meta.url),old=await readFile(new URL('0003_boundary_hardening.sql',root),'utf8'),lock=await readFile(new URL('0007_observer_cycle.sql',root),'utf8'),newDDL=await readFile(new URL('0017_native_circle_continuation.sql',root),'utf8');const accept=old.match(/CREATE OR REPLACE FUNCTION zee\.accept_quote\(p_id uuid\)[\s\S]*?END \$\$;/)?.[0],observer=lock.match(/CREATE FUNCTION zee\.lock_observer_cycle\(\)[\s\S]*?END \$\$;/)?.[0],continuation=newDDL.match(/CREATE FUNCTION zee\.accept_post_refund_circle\([\s\S]*?END \$\$;/)?.[0];assert.ok(accept&&observer&&continuation,'extract actual shipped function bodies, excluding production role grants');const replacement=(await readFile(new URL('0018_native_circle_replacement.sql',root),'utf8')).match(/CREATE FUNCTION zee\.accept_post_refund_replacement\([\s\S]*?END \$\$;/)?.[0];assert.ok(replacement);return observer+'\n'+accept+'\n'+continuation+'\n'+replacement;}
async function assertInstalledReplacementBody(c:pg.Client,schema:string){
 const raw=await readFile(new URL('../../migrations/0018_native_circle_replacement.sql',import.meta.url));assert.equal(raw.includes(13),false,'new0018 shipped bytes must be LF');
 const body=raw.toString('utf8').split('AS $$')[1]!.split('$$;')[0]!,expected='c169fd8d03b22960abff4a826fdc93d96f07f4764ac2d6a2d4323797759b3c85';
 assert.equal(createHash('sha256').update(body).digest('hex'),expected,'raw shipped SQL body must match reviewed pin');
 const rows=(await c.query('SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.proname=$2',[schema,'accept_post_refund_replacement'])).rows;assert.equal(rows.length,1);
 const restored=(rows[0].prosrc as string).replaceAll('"'+schema+'".','zee.');assert.equal(restored,body,'actual installed prosrc must equal raw shipped body after exact fixture qualifier restoration');assert.equal(createHash('sha256').update(restored).digest('hex'),expected);
}
async function fixture(q:ReturnType<typeof scoped>){
 await q(`CREATE DOMAIN zee.digest AS bytea CHECK(octet_length(VALUE)=32);
 CREATE TABLE zee.runtime_control(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),epoch bigint NOT NULL,accepting_orders boolean NOT NULL,dispatch_enabled boolean NOT NULL,reconciliation_required boolean NOT NULL);
 CREATE TABLE zee.assets(id text PRIMARY KEY,live_enabled boolean NOT NULL);
 CREATE TABLE zee.scanner_checkpoints(network text PRIMARY KEY,scanned_height bigint NOT NULL,finalized_height bigint NOT NULL,observed_at timestamptz NOT NULL);
 CREATE TABLE zee.chain_observations(network text,height bigint,block_hash text,PRIMARY KEY(network,height));
 CREATE TABLE zee.quotes(id uuid PRIMARY KEY,direction text NOT NULL,input_amount numeric NOT NULL,output_amount numeric NOT NULL,payout_fee numeric NOT NULL,refund_fee numeric NOT NULL,execution_mode text NOT NULL,access_hash zee.digest NOT NULL,expires_at timestamptz NOT NULL,destination_asset text NOT NULL,payout_fee_asset text NOT NULL,refund_fee_asset text NOT NULL,source_asset text NOT NULL);
 CREATE TABLE zee.orders(id uuid PRIMARY KEY REFERENCES zee.quotes(id),state text NOT NULL DEFAULT 'AWAITING_FUNDS',primary_deposit uuid,accepted_at timestamptz,funding_cutoff_height bigint,funding_cutoff_time timestamptz,cancellation_available_at timestamptz);
 CREATE TABLE zee.deposits(id uuid PRIMARY KEY,order_id uuid,amount numeric NOT NULL,classification text NOT NULL,confirmed_at timestamptz,block_height bigint NOT NULL,block_hash text NOT NULL);
 CREATE TABLE zee.source_refunds(order_id uuid PRIMARY KEY,deposit_id uuid,base_phase text,base_confirmed boolean,confirmed boolean,zcash_fee numeric,height bigint,block_hash text,base_height bigint,base_block text);
 CREATE TABLE zee.obligations(deposit_id uuid PRIMARY KEY,order_id uuid,state text NOT NULL);
 CREATE TABLE zee.operations(id uuid PRIMARY KEY,order_id uuid,deposit_id uuid,kind text,state text,chain_authorization_verified boolean NOT NULL DEFAULT false);
 CREATE TABLE zee.outbox_jobs(id uuid PRIMARY KEY,operation_id uuid,status text,lease_until timestamptz,lease_owner uuid,fence bigint NOT NULL DEFAULT 0);
 CREATE TABLE zee.chain_transactions(operation_id uuid);CREATE TABLE zee.base_bindings(order_id uuid);CREATE TABLE zee.escrow_bindings(order_id uuid);CREATE TABLE zee.escrow_settlements(order_id uuid);CREATE TABLE zee.base_attempts(order_id uuid);CREATE TABLE zee.reverse_payouts(order_id uuid);CREATE TABLE zee.escrow_commits(order_id uuid);
 CREATE TABLE zee.inventory_accounts(asset text,purpose text,balance numeric NOT NULL,reserved numeric NOT NULL DEFAULT 0,CHECK(reserved>=0 AND balance>=reserved),PRIMARY KEY(asset,purpose));
 CREATE TABLE zee.reservations(order_id uuid,asset text,purpose text,amount numeric,released_at timestamptz,PRIMARY KEY(order_id,asset,purpose));
 CREATE TABLE zee.ledger_entries(event_id uuid,asset text,bucket text,amount numeric,order_id uuid);
 CREATE TABLE zee.order_events(order_id uuid,event_type text);
 INSERT INTO zee.runtime_control VALUES(true,7,true,true,false);
 INSERT INTO zee.assets VALUES('TAZ',true),('mockUSDC',true),('baseETH',false);
 INSERT INTO zee.scanner_checkpoints VALUES('zcash-testnet',4537300,4537291,clock_timestamp()),('base-sepolia',49700000,49699900,clock_timestamp());
 INSERT INTO zee.inventory_accounts VALUES('mockUSDC','principal',200000,0),('TAZ','principal',200000,0),('TAZ','fee',10000,0),('baseETH','fee',499000000000000,0);`);
 await q(await bodies());
 const ids={old:randomUUID(),deposit:randomUUID(),refundOp:randomUUID(),refundJob:randomUUID(),forward:randomUUID(),thirdForward:randomUUID(),reverse:randomUUID(),secondReverse:randomUUID(),legacy:randomUUID(),opening:randomUUID()};
 async function quote(id:string,direction:string){const forward=direction==='ZCASH_TO_BASE';await q(`INSERT INTO zee.quotes VALUES($1,$2,100000,100000,$3,$4,$5,$6,clock_timestamp()+interval '30 minutes',$7,$8,$9,$10)`,[id,direction,forward?'100000000000000':'10000',forward?'10000':'100000000000000',forward?'base-settlement-v1':'base-escrow-v1',owner,forward?'mockUSDC':'TAZ',forward?'baseETH':'TAZ',forward?'TAZ':'baseETH',forward?'TAZ':'mockUSDC']);}
 for(const id of [ids.old,ids.forward,ids.thirdForward,ids.legacy])await quote(id,'ZCASH_TO_BASE');for(const id of [ids.reverse,ids.secondReverse])await quote(id,'BASE_TO_ZCASH');
 await q(`INSERT INTO zee.orders VALUES($1,'REFUNDED',$2,clock_timestamp()-interval '1 hour',4536773,NULL,NULL)`,[ids.old,ids.deposit]);
 await q(`INSERT INTO zee.deposits(id,amount,classification,confirmed_at,block_height,block_hash) VALUES($1,100000,'LATE',clock_timestamp()-interval '1 hour',4536778,$2)`,[ids.deposit,H]);
 await q(`INSERT INTO zee.source_refunds VALUES($1,$2,'CANCEL',true,true,10000,4536800,$3,49699800,$4)`,[ids.old,ids.deposit,B,C]);
 await q("INSERT INTO zee.obligations(deposit_id,state) VALUES($1,'DISCHARGED')",[ids.deposit]);await q("INSERT INTO zee.operations(id,order_id,deposit_id,kind,state) VALUES($1,$2,$3,'REFUND','CONFIRMED')",[ids.refundOp,ids.old,ids.deposit]);await q("INSERT INTO zee.outbox_jobs(id,operation_id,status,fence) VALUES($1,$2,'DONE',1)",[ids.refundJob,ids.refundOp]);
 await q(`INSERT INTO zee.chain_observations VALUES('zcash-testnet',4536778,$1),('zcash-testnet',4536800,$2),('base-sepolia',49699800,$3)`,[H,B,C]);
 for(const[asset,purpose,balance]of [['mockUSDC','principal','200000'],['TAZ','principal','200000'],['TAZ','fee','20000'],['baseETH','fee','500000000000000']])for(const[bucket,amount]of [[purpose+':available',balance],[purpose+':operator-capital','-'+balance]])await q('INSERT INTO zee.ledger_entries VALUES($1,$2,$3,$4,NULL)',[ids.opening,asset,bucket,amount]);
 await q(`INSERT INTO zee.reservations VALUES($1,'TAZ','fee',10000,clock_timestamp()-interval '1 hour')`,[ids.old]);
 await q("INSERT INTO zee.orders VALUES($1,'EXPIRED_UNFUNDED',NULL,clock_timestamp()-interval '1 hour',4537231,NULL,NULL)",[ids.forward]);const release=randomUUID();
 for(const[asset,purpose,amount]of [['mockUSDC','principal','100000'],['TAZ','fee','10000'],['baseETH','fee','100000000000000']]){
  await q('INSERT INTO zee.reservations VALUES($1,$2,$3,$4,clock_timestamp())',[ids.forward,asset,purpose,amount]);
  for(const[event,bucket,n]of [[ids.forward,purpose+':available','-'+amount],[ids.forward,purpose+':reserved',amount],[release,purpose+':reserved','-'+amount],[release,purpose+':available',amount]])await q('INSERT INTO zee.ledger_entries VALUES($1,$2,$3,$4,$5)',[event,asset,bucket,n,ids.forward]);
 }
 await q("INSERT INTO zee.order_events VALUES($1,'ACCEPTED'),($1,'EXPIRED_UNFUNDED')",[ids.forward]);return ids;
}


async function preserved(q:ReturnType<typeof scoped>,ids:any){return{orders:(await q('SELECT row_to_json(o) row FROM zee.orders o WHERE id=ANY($1::uuid[]) ORDER BY id',[[ids.old,ids.forward]])).rows,reservations:(await q('SELECT row_to_json(r) row FROM zee.reservations r WHERE order_id=ANY($1::uuid[]) ORDER BY order_id,asset,purpose',[[ids.old,ids.forward]])).rows,ledger:(await q('SELECT row_to_json(l) row FROM zee.ledger_entries l WHERE order_id=ANY($1::uuid[]) ORDER BY order_id,asset,bucket,amount',[[ids.old,ids.forward]])).rows};}

test('opt-in production0018 replacement serial scope preserves both originals and admits only total F3R1',
 {skip:!url?'NATIVE_CIRCLE_REPLACEMENT_TEST_DATABASE_URL not provided':false},async()=>{
 const schema='native_circle_replacement_'+randomBytes(12).toString('hex'),c=new pg.Client({connectionString:url});await c.connect();let created=false;
 try{assert.equal((await c.query('SELECT current_database() db')).rows[0].db,'neondb');await c.query(`CREATE SCHEMA "${schema}"`);created=true;const q=scoped(c,schema),id=await fixture(q);await assertInstalledReplacementBody(c,schema);const before=await preserved(q,id),fresh=()=>q('UPDATE zee.scanner_checkpoints SET observed_at=clock_timestamp()');
  const call=(order=id.thirdForward,who:Buffer|null=owner,epoch:number|null=7)=>q('SELECT zee.accept_post_refund_replacement($1,$2,$3,$4,$5) id',[order,id.old,id.forward,epoch,who]);
  await assert.rejects(call(id.thirdForward,wrongOwner));await assert.rejects(call(id.thirdForward,null));await assert.rejects(call(id.thirdForward,owner,6));await assert.rejects(call(id.thirdForward,owner,null));
  async function refuses(sql:string,v:unknown[]=[]){await fresh();await q('BEGIN');try{await q(sql,v);await assert.rejects(call());}finally{await q('ROLLBACK');}}
  for(const[sql,v]of [["UPDATE zee.runtime_control SET reconciliation_required=true",[]],["UPDATE zee.scanner_checkpoints SET observed_at=clock_timestamp()-interval '61 seconds'",[]],["UPDATE zee.orders SET state='AWAITING_FUNDS' WHERE id=$1",[id.forward]],["UPDATE zee.orders SET primary_deposit=$2 WHERE id=$1",[id.forward,randomUUID()]],["UPDATE zee.orders SET funding_cutoff_height=4537232 WHERE id=$1",[id.forward]],["UPDATE zee.scanner_checkpoints SET scanned_height=4537239 WHERE network='zcash-testnet'",[]],["INSERT INTO zee.deposits(id,order_id,amount,classification,block_height,block_hash) VALUES($1,$2,100000,'EXTRA',4537200,$3)",[randomUUID(),id.forward,H]],["INSERT INTO zee.operations(id,order_id,deposit_id,kind,state) VALUES($1,$2,NULL,'PAYOUT','PLANNED')",[randomUUID(),id.forward]],["UPDATE zee.reservations SET released_at=NULL WHERE order_id=$1",[id.forward]],["UPDATE zee.reservations SET amount=amount+1 WHERE order_id=$1 AND asset='TAZ'",[id.forward]],["DELETE FROM zee.reservations WHERE order_id=$1 AND asset='TAZ'",[id.forward]],["UPDATE zee.ledger_entries SET amount=amount+1 WHERE order_id=$1 AND asset='TAZ'",[id.forward]],["INSERT INTO zee.order_events VALUES($1,'PAYMENT_FOUND')",[id.forward]],["UPDATE zee.source_refunds SET confirmed=false WHERE order_id=$1",[id.old]]] as [string,unknown[]][])await refuses(sql,v);
  for(const table of ['base_bindings','base_attempts','escrow_bindings','escrow_commits','reverse_payouts','escrow_settlements','source_refunds']){const columns=table==='source_refunds'?'(order_id)':'';await refuses(`INSERT INTO zee.${table}${columns} VALUES($1)`,[id.forward]);}
  await fresh();assert.equal((await call()).rows[0].id,id.thirdForward);assert.equal((await call()).rows[0].id,id.thirdForward);assert.equal((await q('SELECT funding_cutoff_height::text h FROM zee.orders WHERE id=$1',[id.thirdForward])).rows[0].h,'4537340');
  await assert.rejects(call(id.legacy));await assert.rejects(call(id.reverse));await q("UPDATE zee.orders SET state='SETTLED' WHERE id=$1",[id.thirdForward]);await assert.rejects(call(id.reverse));
  await q('UPDATE zee.inventory_accounts a SET reserved=a.reserved-r.amount FROM zee.reservations r WHERE r.order_id=$1 AND r.released_at IS NULL AND a.asset=r.asset AND a.purpose=r.purpose',[id.thirdForward]);await q('UPDATE zee.reservations SET released_at=clock_timestamp() WHERE order_id=$1',[id.thirdForward]);
  await fresh();assert.equal((await call(id.reverse)).rows[0].id,id.reverse);await assert.rejects(call(id.secondReverse));await assert.rejects(call(id.legacy));assert.equal((await q('SELECT count(*)::text n FROM zee.orders')).rows[0].n,'4');assert.deepEqual(await preserved(q,id),before);
 }finally{await c.query('ROLLBACK').catch(()=>{});if(created)await c.query(`DROP SCHEMA "${schema}" CASCADE`);await c.end();}
});

test('opt-in concurrent production0018 replacement forward has one winner under runtime row lock',
 {skip:!url?'NATIVE_CIRCLE_REPLACEMENT_TEST_DATABASE_URL not provided':false},async()=>{
 const schema='native_circle_replacement_'+randomBytes(12).toString('hex'),a=new pg.Client({connectionString:url,statement_timeout:15000}),b=new pg.Client({connectionString:url,statement_timeout:15000});await a.connect();let created=false,connected=false,loser:Promise<boolean>|undefined;
 try{assert.equal((await a.query('SELECT current_database() db')).rows[0].db,'neondb');await a.query(`CREATE SCHEMA "${schema}"`);created=true;const q=scoped(a,schema),id=await fixture(q);await assertInstalledReplacementBody(a,schema);const before=await preserved(q,id);await b.connect();connected=true;const r=scoped(b,schema);await q('BEGIN');await r('BEGIN');const ap=(await a.query('SELECT pg_backend_pid() pid')).rows[0].pid,bp=(await b.query('SELECT pg_backend_pid() pid')).rows[0].pid;
  await q('SELECT zee.accept_post_refund_replacement($1,$2,$3,7,$4)',[id.thirdForward,id.old,id.forward,owner]);loser=r('SELECT zee.accept_post_refund_replacement($1,$2,$3,7,$4)',[id.legacy,id.old,id.forward,owner]).then(()=>true,()=>false);
  let blocked=false;for(let n=0;n<20&&!blocked;n++)blocked=((await a.query('SELECT pg_blocking_pids($1) p',[bp])).rows[0].p as number[]).includes(ap);assert.equal(blocked,true);await q('COMMIT');assert.equal(await loser,false);
  assert.equal((await q('SELECT count(*)::text n FROM zee.orders')).rows[0].n,'3');assert.equal((await q('SELECT count(*)::text n FROM zee.reservations WHERE order_id=$1',[id.thirdForward])).rows[0].n,'3');assert.equal((await q('SELECT count(*)::text n FROM zee.ledger_entries WHERE order_id=$1',[id.legacy])).rows[0].n,'0');assert.deepEqual(await preserved(q,id),before);
 }finally{await a.query('ROLLBACK').catch(()=>{});if(loser)await loser;if(connected){await b.query('ROLLBACK').catch(()=>{});await b.end();}if(created)await a.query(`DROP SCHEMA "${schema}" CASCADE`);await a.end();}
});
