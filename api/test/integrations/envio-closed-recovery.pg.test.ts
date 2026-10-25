/** Root opt-in only, existing isolated neondb; random schema, no application-table writes.
 * ENVIO_CLOSED_TEST_DATABASE_URL=<private isolated URL> pnpm --dir api exec tsx --test test/integrations/envio-closed-recovery.pg.test.ts
 * Scope labels are explicitly substituted for this synthetic schema. Live role grants are a separate Root check. */
import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';import {readFile} from 'node:fs/promises';import pg from 'pg';
import {fixture,H,opened} from './envio-closed-fixture.ts';
import {continuationTables,continuationDigest} from '../../src/native-circle-continuation.ts';
import {closedSnapshotSql,readClosedSnapshot,publishClosedRecovery,classifyClosedCommit,type ClosedIntent} from '../../src/integrations/observation/envio-closed-recovery.ts';
const url=process.env.ENVIO_CLOSED_TEST_DATABASE_URL;
test('opt-in PostgreSQL closed-book CAS preserves real control/triggers and resolves one lost COMMIT without replay',{skip:!url?'ENVIO_CLOSED_TEST_DATABASE_URL not provided':false},async()=>{
 const target=new URL(url!);assert.equal(target.hostname,'ep-polished-hill-ao5ulo5g.c-2.ap-southeast-1.aws.neon.tech');assert.equal(target.pathname,'/neondb');assert.equal(decodeURIComponent(target.username),'neondb_owner');
 const schema='envio_closed_cas_'+randomBytes(12).toString('hex'),c=new pg.Client({connectionString:url}),reader=new pg.Client({connectionString:url});await c.connect();let created=false,readerOpen=false;
 const scoped=(client:pg.Client)=>({query:async(sql:string,values?:unknown[])=>client.query(sql.replace(/\bzee\./g,`"${schema}".`).replace(/search_path = pg_catalog, zee/g,`search_path = pg_catalog, "${schema}"`),values)});
 const q=scoped(c);try{assert.equal((await c.query('SELECT current_database() name')).rows[0].name,'neondb');await c.query(`CREATE SCHEMA "${schema}"`);created=true;let f=fixture();
 await q.query(`CREATE TABLE zee.runtime_control(singleton boolean PRIMARY KEY DEFAULT true,accepting_orders boolean NOT NULL DEFAULT false,dispatch_enabled boolean NOT NULL DEFAULT false,reconciliation_required boolean NOT NULL DEFAULT true,epoch bigint NOT NULL DEFAULT 217);
 CREATE TABLE zee.scanner_checkpoints(network text PRIMARY KEY,scanned_height bigint NOT NULL,tip_hash text NOT NULL,finalized_height bigint NOT NULL,finalized_time timestamptz NOT NULL,observed_at timestamptz NOT NULL);
 CREATE TABLE zee.chain_observations(network text NOT NULL,height bigint NOT NULL,block_hash text NOT NULL,block_time timestamptz NOT NULL,PRIMARY KEY(network,height));
 CREATE TABLE zee.root_native_circle_authorizations(id integer);INSERT INTO zee.runtime_control DEFAULT VALUES;`);
 for(const table of continuationTables)await q.query(`CREATE TABLE zee.${table}(id text,state text)`);
 for(const table of['orders','quotes'])for(const id of['closed-one','closed-two'])await q.query(`INSERT INTO zee.${table} VALUES($1,'CLOSED')`,[id]);
 await q.query("INSERT INTO zee.scanner_checkpoints VALUES('base-sepolia',$1,$2,$3,$4,$4)",[f.a.baseline.height,f.a.baseline.hash,f.a.baseline.finalizedHeight,f.time]);for(const r of f.s.rows)await q.query("INSERT INTO zee.chain_observations VALUES('base-sepolia',$1,$2,$3)",[r.height,r.blockHash,f.time]);
 const dir=new URL('../../migrations/',import.meta.url),transitions=await readFile(new URL('0002_transitions.sql',dir),'utf8'),guards=await readFile(new URL('0004_observer_guards.sql',dir),'utf8'),cycle=await readFile(new URL('0007_observer_cycle.sql',dir),'utf8');
 for(const source of[transitions.match(/CREATE FUNCTION zee\.enter_reconciliation\(\)[\s\S]*?END \$\$;/)?.[0],guards.match(/CREATE FUNCTION zee\.guard_observer_rewind\(\)[\s\S]*?CREATE TRIGGER canonical_reorg[^;]*;/)?.[0],cycle.match(/CREATE FUNCTION zee\.lock_observer_cycle\(\)[\s\S]*?END \$\$;/)?.[0]]){assert.ok(source);await q.query(source);}
 const read=async(client:ReturnType<typeof scoped>)=>{const s=await readClosedSnapshot(client as unknown as Pick<pg.PoolClient,'query'>);return{...s,database:'zee_app_20261023',role:'zee_app_worker_20261023'};};
 const before=await read(q);f.a.control=before.control;f.a.baseline=before.checkpoint;f.a.financialDigest=continuationDigest(before.books);f.a.financialTableCounts=Object.fromEntries(continuationTables.map(t=>[t,before.books[t]!.length]));const expectedBefore=structuredClone(before);let durable:ClosedIntent|undefined,commits=0;
 const client={query:async(sql:string,values?:unknown[])=>{const result=await q.query(sql,values);if(sql==='COMMIT'){commits++;throw Error('ACK_LOST_ONCE');}return result;}} as unknown as Pick<pg.PoolClient,'query'>;
 await assert.rejects(publishClosedRecovery(client,()=>read(q),f.a,H,f.journal,f.candidate,opened,async i=>{durable=structuredClone(i);assert.deepEqual((await read(q)).checkpoint,before.checkpoint);},AbortSignal.timeout(30000)),/ACK_LOST_ONCE/);assert.equal(commits,1);assert.ok(durable);
 await reader.connect();readerOpen=true;const rq=scoped(reader),after=await read(rq),status=(await rq.query('SELECT pg_xact_status($1::xid8) status',[durable!.transactionId])).rows[0].status;assert.equal(status,'committed');assert.equal(classifyClosedCommit(status,after,durable!),'COMMITTED_EXACT');assert.deepEqual(after.control,expectedBefore.control);assert.deepEqual(after.books,expectedBefore.books);assert.equal(after.checkpoint.xmin,durable!.expectedXmin);
 await rq.query("UPDATE zee.scanner_checkpoints SET observed_at=observed_at WHERE network='base-sepolia'");assert.equal(classifyClosedCommit('committed',await read(rq),durable!),'UNKNOWN_OR_INTERVENED_NO_REPLAY');
 await rq.query("UPDATE zee.orders SET state='INTERVENED' WHERE id='closed-one'");assert.equal(classifyClosedCommit('committed',await read(rq),durable!),'UNKNOWN_OR_INTERVENED_NO_REPLAY');
 assert.ok(closedSnapshotSql.includes('LIMIT 129'));
 }finally{await c.query('ROLLBACK').catch(()=>{});if(readerOpen)await reader.end();if(created)await c.query(`DROP SCHEMA "${schema}" CASCADE`);await c.end();}
});
