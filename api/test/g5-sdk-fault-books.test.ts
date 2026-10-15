import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {disposableSettlement} from '../scripts/test-settlement-database.ts';
import {connect} from '../src/db.ts';
import {PrivateData} from '../src/private-data.ts';
import {Repository} from '../src/repository.ts';
import {captureG5SdkFaultBooks,requireG5SdkFaultMigrations} from '../src/g5-sdk-fault-books.ts';

test('production SDK recovery read set executes against exact fourteen-migration PostgreSQL and retains deposit-keyed obligations',async()=>{
 const isolated=await disposableSettlement({throughMigration:14});const pool=connect(JSON.parse(await readFile(isolated.configPath,'utf8')).adminUrl,2);
 try{
  assert.equal((await pool.query('SELECT count(*)::text AS n FROM public.zeeswap_migrations')).rows[0].n,'14');
  const pins=await requireG5SdkFaultMigrations(pool);assert.equal(pins.length,14);
  const bad={query:async()=>({rows:pins.map((p,i)=>i===13?{...p,sha256:'00'.repeat(32)}:p)})};await assert.rejects(requireG5SdkFaultMigrations(bad as any),/ORIGINAL_MIGRATION_BYTES/);
  const columns=(await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='zee' AND table_name='obligations'")).rows.map(r=>r.column_name);assert(columns.includes('deposit_id'));assert(!columns.includes('id'));
  const empty=await captureG5SdkFaultBooks(pool);assert.equal(Object.keys(empty).length,12);assert(Object.values(empty).every(rows=>rows.length===0));
  const keys=new PrivateData(randomBytes(32),randomBytes(32)),repo=new Repository(pool,keys),hash='ab'.repeat(32);
  await pool.query("INSERT INTO zee.scanner_checkpoints VALUES('zcash-testnet',1010,$1,1001,clock_timestamp(),clock_timestamp()),('base-sepolia',1010,$1,1010,clock_timestamp(),clock_timestamp())",[hash]);
  await pool.query("INSERT INTO zee.inventory_accounts SELECT id,p,1000000000000000,0 FROM zee.assets CROSS JOIN (VALUES('principal'),('fee')) x(p)");
  await pool.query('UPDATE zee.runtime_control SET accepting_orders=true,dispatch_enabled=true,reconciliation_required=false');
  const q=await repo.issueQuote({direction:'ZCASH_TO_BASE',inputAmount:'100000',payoutFee:'50000000000000',refundFee:'10000',recipient:'0x1111111111111111111111111111111111111111',refundRecipient:'fixture:refund',depositReceiver:'fixture:source',executionMode:'base-settlement-v1',baseContract:'0x2222222222222222222222222222222222222222'});await repo.accept(q.id,q.accessToken);
  const deposit=await repo.observe({network:'zcash-testnet',txid:'cd'.repeat(32),index:0,pool:'ironwood',reference:q.reference,receiver:'fixture:source',amount:'100000',height:1001,blockHash:hash,blockTime:new Date(),shielded:true});
  await pool.query("INSERT INTO zee.chain_observations VALUES('zcash-testnet',1001,$1,clock_timestamp())",[hash]);await repo.confirm(deposit);
  const books=await captureG5SdkFaultBooks(pool);assert.equal(books.obligations.length,1);assert.equal(books.obligations[0].deposit_id,deposit);assert.equal(books.obligations[0].order_id,q.id);assert.equal(books.obligations[0].source_amount,'100000');assert.equal(books.obligations[0].state,'HELD');assert.equal(books.operations.length,1);assert.equal(books.jobs.length,1);assert.equal(books.reservations.length,3);
  assert.deepEqual(await captureG5SdkFaultBooks(pool),books);
 }finally{await pool.end();await isolated.cleanup();}
});
