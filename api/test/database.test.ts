import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type pg from 'pg';
import { connect } from '../src/db.ts';
import { Repository, type Direction, type DepositInput } from '../src/repository.ts';
import { PrivateData } from '../src/private-data.ts';
import { requireDevelopment } from '../scripts/config.ts';

const settings=requireDevelopment(),pool=connect(settings.adminUrl,5);
const keys=new PrivateData(randomBytes(32),randomBytes(32));
const hash='a'.repeat(64);
before(()=>{if(settings.branchId!=='br-muddy-waterfall-aoqd8o9b')throw Error('Run live tests through the isolated test runner');});
after(()=>pool.end());
async function seed(c: pg.PoolClient, balance='1000000000') {
 await c.query('UPDATE zee.runtime_control SET reconciliation_required=false,accepting_orders=true,dispatch_enabled=false');
 await c.query(`INSERT INTO zee.scanner_checkpoints VALUES
  ('zcash-testnet',1000,$1,991,clock_timestamp(),clock_timestamp()),
  ('base-sepolia',1000,$1,990,clock_timestamp(),clock_timestamp())
  ON CONFLICT(network) DO UPDATE SET scanned_height=1000,finalized_height=990,finalized_time=clock_timestamp(),observed_at=clock_timestamp()`,[hash]);
 await c.query(`INSERT INTO zee.inventory_accounts SELECT id,p,$1,0 FROM zee.assets CROSS JOIN (VALUES('principal'),('fee')) x(p)
  ON CONFLICT(asset,purpose) DO UPDATE SET balance=$1 WHERE zee.inventory_accounts.reserved=0`,[balance]);
 await c.query('UPDATE zee.runtime_control SET reconciliation_required=false,accepting_orders=true,dispatch_enabled=false');
}
async function isolated(run:(c:pg.PoolClient,repo:Repository)=>Promise<void>) {
 const c=await pool.connect();await c.query('BEGIN');
 try {await seed(c);await run(c,new Repository(c,keys));await c.query('SET CONSTRAINTS ALL IMMEDIATE');}
 finally {await c.query('ROLLBACK');c.release();}
}
async function rejects(c:pg.PoolClient,run:()=>Promise<unknown>,pattern:RegExp) {
 await c.query('SAVEPOINT expected_failure');
 try {await assert.rejects(run,pattern);} finally {await c.query('ROLLBACK TO SAVEPOINT expected_failure');await c.query('RELEASE SAVEPOINT expected_failure');}
}
async function quote(repo:Repository,direction:Direction='ZCASH_TO_BASE',amount='1000000') {
 const receiver=`fixture-receiver:${randomUUID()}`;
 const q=await repo.issueQuote({direction,inputAmount:amount,payoutFee:'10000',refundFee:'10000',
  recipient:`fixture-destination:${randomUUID()}`,refundRecipient:`fixture-refund:${randomUUID()}`,depositReceiver:receiver});
 return {...q,receiver};
}
function deposit(q:Awaited<ReturnType<typeof quote>>,extra:Partial<DepositInput>={}):DepositInput {
 return {network:'zcash-testnet',txid:randomBytes(32).toString('hex'),index:0,pool:'ironwood',reference:q.reference,
  receiver:q.receiver,amount:'1000000',height:1001,blockHash:hash,blockTime:new Date(),shielded:true,...extra};
}
async function canonical(c:pg.PoolClient,d:DepositInput,tip=1010,finalized=1010) {
 await c.query('UPDATE zee.scanner_checkpoints SET scanned_height=$2,finalized_height=$3,observed_at=clock_timestamp() WHERE network=$1',[d.network,tip,finalized]);
 await c.query('INSERT INTO zee.chain_observations VALUES($1,$2,$3,$4) ON CONFLICT(network,height) DO NOTHING',[d.network,d.height,d.blockHash,d.blockTime]);
}
async function ready(c:pg.PoolClient,repo:Repository) {
 const q=await quote(repo);await repo.accept(q.id,q.accessToken);const d=deposit(q);const id=await repo.observe(d);
 await canonical(c,d);const op=await repo.confirm(id);return {q,d,id,op};
}

test('live driver uses certificate-verified TLS',async()=>{
 const c=await pool.connect();try {const s=(c as any).connection.stream;assert.equal(s.encrypted,true);assert.equal(s.authorized,true);}finally{c.release();}
});
test('encrypted quote lookup requires separate access token',()=>isolated(async(c,r)=>{
 const q=await quote(r);await assert.rejects(()=>r.privateQuote(q.id,q.reference),/unavailable/);
 assert.equal(typeof await r.privateQuote(q.id,q.accessToken),'object');
 const row=(await c.query('SELECT private_payload FROM zee.quotes WHERE id=$1',[q.id])).rows[0];
 assert.equal(row.private_payload.includes(Buffer.from(q.receiver)),false);
}));
test('quote acceptance reserves principal and both fee budgets once',()=>isolated(async(c,r)=>{
 const q=await quote(r);await r.accept(q.id,q.accessToken);await r.accept(q.id,q.accessToken);
 const rows=(await c.query('SELECT asset,purpose,amount::text FROM zee.reservations WHERE order_id=$1 ORDER BY asset',[q.id])).rows;
 assert.equal(rows.length,3);assert.equal(rows.find(x=>x.asset==='mockUSDC').amount,'1000000');
 assert.equal((await c.query('SELECT count(*) FROM zee.ledger_entries WHERE order_id=$1',[q.id])).rows[0].count,'6');
}));
test('insufficient fee capital rolls back the entire acceptance',()=>isolated(async(c,r)=>{
 const q=await quote(r);await c.query("UPDATE zee.inventory_accounts SET balance=0 WHERE asset='baseETH'");
 await rejects(c,()=>r.accept(q.id,q.accessToken),/insufficient/);
 assert.equal((await c.query('SELECT count(*) FROM zee.orders WHERE id=$1',[q.id])).rows[0].count,'0');
 assert.equal((await c.query('SELECT sum(reserved)::text AS total FROM zee.inventory_accounts')).rows[0].total,'0');
}));
test('accepted terms and quote payload cannot be overwritten',()=>isolated(async(c,r)=>{
 const q=await quote(r,'BASE_TO_ZCASH');await r.accept(q.id,q.accessToken);
 const row=(await c.query('SELECT extract(epoch FROM cancellation_available_at-funding_cutoff_time)::integer AS delay FROM zee.orders WHERE id=$1',[q.id])).rows[0];assert.equal(row.delay,7200);
 await rejects(c,()=>c.query('UPDATE zee.orders SET cancellation_available_at=cancellation_available_at+interval \'1 second\' WHERE id=$1',[q.id]),/immutable/);
 await rejects(c,()=>c.query('UPDATE zee.quotes SET output_amount=output_amount+1 WHERE id=$1',[q.id]),/immutable/);
}));
test('fractional database amounts are rejected rather than rounded',()=>isolated(async(c)=>{
 await rejects(c,()=>c.query("UPDATE zee.inventory_accounts SET balance=1.5 WHERE asset='TAZ'"),/check constraint/);
}));
test('stale observers and recovery mode prevent new acceptance',()=>isolated(async(c,r)=>{
 const q=await quote(r);await c.query("UPDATE zee.scanner_checkpoints SET observed_at=clock_timestamp()-interval '61 seconds'");
 await rejects(c,()=>r.accept(q.id,q.accessToken),/stale/);
 await c.query('SELECT zee.enter_reconciliation()');await rejects(c,()=>r.accept(q.id,q.accessToken),/paused/);
}));
test('capacity is bounded to five unresolved orders',()=>isolated(async(c,r)=>{
 for(let i=0;i<5;i++){const q=await quote(r);await r.accept(q.id,q.accessToken);}
 const q=await quote(r);await rejects(c,()=>r.accept(q.id,q.accessToken),/capacity/);
}));
test('same deposit is idempotent and conflicting values fail',()=>isolated(async(c,r)=>{
 const q=await quote(r);await r.accept(q.id,q.accessToken);const d=deposit(q),id=await r.observe(d);
 assert.equal(await r.observe(d),id);await rejects(c,()=>r.observe({...d,amount:'1000001'}),/conflicting/);
 assert.equal((await c.query('SELECT count(*) FROM zee.obligations WHERE deposit_id=$1',[id])).rows[0].count,'1');
}));
test('underpayment, overpayment and late inclusion create full-principal refund obligations',()=>isolated(async(c,r)=>{
 for(const [amount,height,classification] of [['999999',1001,'UNDER'],['1000001',1001,'OVER'],['1000000',1013,'LATE']] as const){
  const q=await quote(r);await r.accept(q.id,q.accessToken);const id=await r.observe(deposit(q,{amount,height}));
  const row=(await c.query('SELECT d.classification,o.state,o.source_amount::text FROM zee.deposits d JOIN zee.obligations o ON d.id=o.deposit_id WHERE d.id=$1',[id])).rows[0];
  assert.equal(row.classification,classification);assert.equal(row.state,'REFUND_REQUIRED');assert.equal(row.source_amount,amount);
 }
}));
test('copied memo on another receiver quarantines funds without binding order',()=>isolated(async(c,r)=>{
 const q=await quote(r);await r.accept(q.id,q.accessToken);const id=await r.observe(deposit(q,{receiver:'another-receiver'}));
 assert.deepEqual((await c.query('SELECT classification,order_id FROM zee.deposits WHERE id=$1',[id])).rows[0],{classification:'QUARANTINED',order_id:null});
 await rejects(c,()=>r.confirm(id),/manual recovery/);
}));
test('transparent Zcash funding is excluded from normal fulfillment',()=>isolated(async(c,r)=>{
 const q=await quote(r);await r.accept(q.id,q.accessToken);const id=await r.observe(deposit(q,{shielded:false}));
 assert.equal((await c.query('SELECT classification FROM zee.deposits WHERE id=$1',[id])).rows[0].classification,'PRIVACY_VIOLATION');
 await rejects(c,()=>r.confirm(id),/manual recovery/);
}));
test('Zcash requires canonical inclusion and ten confirmations; repeated confirm creates one operation',()=>isolated(async(c,r)=>{
 const q=await quote(r);await r.accept(q.id,q.accessToken);const d=deposit(q),id=await r.observe(d);
 await rejects(c,()=>r.confirm(id),/canonical inclusion/);await canonical(c,d,1009,1000);
 await rejects(c,()=>r.confirm(id),/insufficient finality/);await canonical(c,d,1010,1000);
 const op=await r.confirm(id);assert.equal(await r.confirm(id),op);
 assert.equal((await c.query('SELECT count(*) FROM zee.outbox_jobs WHERE operation_id=$1',[op])).rows[0].count,'1');
}));
test('Base finality and exact funding deadline are checked separately',()=>isolated(async(c,r)=>{
 const q=await quote(r,'BASE_TO_ZCASH');await r.accept(q.id,q.accessToken);
 const cutoff=(await c.query('SELECT funding_cutoff_time FROM zee.orders WHERE id=$1',[q.id])).rows[0].funding_cutoff_time as Date;
 const d=deposit(q,{network:'base-sepolia',emitter:'0x'+'1'.repeat(40),blockTime:new Date(cutoff.getTime()-1),shielded:false}),id=await r.observe(d);
 await canonical(c,d,1010,1000);await rejects(c,()=>r.confirm(id),/insufficient finality/);
 await canonical(c,d,1010,1001);await r.confirm(id);
 const late=await quote(r,'BASE_TO_ZCASH');await r.accept(late.id,late.accessToken);
 const time=(await c.query('SELECT funding_cutoff_time FROM zee.orders WHERE id=$1',[late.id])).rows[0].funding_cutoff_time;
 const lateId=await r.observe(deposit(late,{network:'base-sepolia',emitter:'0x'+'1'.repeat(40),blockTime:time,shielded:false}));
 assert.equal((await c.query('SELECT classification FROM zee.deposits WHERE id=$1',[lateId])).rows[0].classification,'LATE');
}));
test('extra deposit keeps the first outcome and creates a separate refund',()=>isolated(async(c,r)=>{
 const {q}=await ready(c,r);const d=deposit(q,{height:1002}),id=await r.observe(d);await canonical(c,d,1011,1011);await r.confirm(id);
 assert.equal((await c.query('SELECT kind FROM zee.operations WHERE deposit_id=$1',[id])).rows[0].kind,'REFUND');
 assert.equal((await c.query('SELECT state FROM zee.orders WHERE id=$1',[q.id])).rows[0].state,'READY');
 assert.equal((await c.query("SELECT count(*) FROM zee.operations WHERE order_id=$1 AND kind='PAYOUT'",[q.id])).rows[0].count,'1');
}));
test('database forbids payout and refund operations for the same deposit',()=>isolated(async(c,r)=>{
 const {q,id}=await ready(c,r);
 await rejects(c,()=>c.query("INSERT INTO zee.operations(order_id,deposit_id,kind) VALUES($1,$2,'REFUND')",[q.id,id]),/unique constraint/);
 await rejects(c,()=>c.query('UPDATE zee.operations SET chain_authorization_verified=true WHERE deposit_id=$1',[id]),/check constraint/);
}));
test('unbalanced ledger entries cannot commit and historical entries cannot change',()=>isolated(async(c,r)=>{
 const q=await quote(r);await r.accept(q.id,q.accessToken);
 await rejects(c,async()=>{await c.query("INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount) VALUES($1,'TAZ','bad',1)",[randomUUID()]);await c.query('SET CONSTRAINTS ALL IMMEDIATE');},/unbalanced/);
 await rejects(c,()=>c.query('UPDATE zee.ledger_entries SET amount=amount+1 WHERE order_id=$1',[q.id]),/immutable/);
}));
test('unfunded expiry waits for scan depth and releases reserves exactly once',()=>isolated(async(c,r)=>{
 const q=await quote(r);await r.accept(q.id,q.accessToken);
 await rejects(c,()=>c.query('SELECT zee.expire_unfunded($1)',[q.id]),/not reconciled/);
 await c.query('UPDATE zee.scanner_checkpoints SET scanned_height=1021,observed_at=clock_timestamp()');
 assert.equal((await c.query('SELECT zee.expire_unfunded($1) AS done',[q.id])).rows[0].done,true);
 assert.equal((await c.query('SELECT zee.expire_unfunded($1) AS done',[q.id])).rows[0].done,false);
 assert.equal((await c.query('SELECT sum(reserved)::text AS total FROM zee.inventory_accounts')).rows[0].total,'0');
 const id=await r.observe(deposit(q,{height:1013}));assert.equal((await c.query('SELECT classification FROM zee.deposits WHERE id=$1',[id])).rows[0].classification,'LATE');
}));
test('reorg observation pauses new dispatch and keeps existing liabilities',()=>isolated(async(c,r)=>{
 const {q,d,id}=await ready(c,r);await r.observe({...d,blockHash:'b'.repeat(64)});
 const row=(await c.query('SELECT reconciliation_required,dispatch_enabled FROM zee.runtime_control')).rows[0];
 assert.deepEqual(row,{reconciliation_required:true,dispatch_enabled:false});
 assert.equal((await c.query('SELECT state FROM zee.orders WHERE id=$1',[q.id])).rows[0].state,'REORGED');
 assert.equal((await c.query('SELECT count(*) FROM zee.obligations WHERE deposit_id=$1',[id])).rows[0].count,'1');
}));
test('leases are fenced; superseded owner and recovery-mode completion fail',()=>isolated(async(c,r)=>{
 await ready(c,r);const owner=randomUUID();
 assert.equal((await c.query('SELECT * FROM zee.claim_job($1)',[owner])).rowCount,0);
 await c.query('UPDATE zee.runtime_control SET dispatch_enabled=true');
 const a=(await c.query('SELECT * FROM zee.claim_job($1)',[owner])).rows[0];
 await c.query("UPDATE zee.outbox_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[a.id]);
 const b=(await c.query('SELECT * FROM zee.claim_job($1)',[randomUUID()])).rows[0];
 assert.equal(BigInt(b.fence),BigInt(a.fence)+1n);
 await rejects(c,()=>c.query('SELECT zee.complete_job($1,$2,$3)',[a.id,owner,a.fence]),/stale lease/);
 await c.query('SELECT zee.enter_reconciliation()');
 await rejects(c,()=>c.query('SELECT zee.complete_job($1,$2,$3)',[b.id,b.lease_owner,b.fence]),/paused/);
}));
test('API and worker roles have separate mutation authority',()=>isolated(async(c)=>{
 await c.query('SET LOCAL ROLE zeeswap_api');
 await rejects(c,()=>c.query('UPDATE zee.inventory_accounts SET balance=0'),/permission denied/);
 await rejects(c,()=>c.query('SELECT zee.enter_reconciliation()'),/permission denied/);
 await c.query('RESET ROLE');await c.query('SET LOCAL ROLE zeeswap_worker');
 await rejects(c,()=>c.query('DELETE FROM zee.quotes'),/permission denied/);await c.query('RESET ROLE');
}));
test('disconnect rolls back an uncommitted quote; a new connection remains usable',async()=>{
 const c=await pool.connect();await c.query('BEGIN');await seed(c);const q=await quote(new Repository(c,keys));c.release(true);
 assert.equal((await pool.query('SELECT count(*) FROM zee.quotes WHERE id=$1',[q.id])).rows[0].count,'0');
});
test('API can accept and worker can observe/confirm through their permitted functions',()=>isolated(async(c,r)=>{
 await c.query('SET LOCAL ROLE zeeswap_api');
 const q=await quote(r);await r.accept(q.id,q.accessToken);
 await c.query('RESET ROLE');await c.query('SET LOCAL ROLE zeeswap_worker');
 const d=deposit(q),id=await r.observe(d);await canonical(c,d);const operation=await r.confirm(id);
 assert.equal(typeof operation,'string');await c.query('RESET ROLE');
}));
test('quote issuance is paused without fresh inventory checks',()=>isolated(async(c,r)=>{
 await c.query('SELECT zee.enter_reconciliation()');await rejects(c,()=>quote(r),/issuance paused/);
 await seed(c);await c.query("UPDATE zee.inventory_accounts SET balance=0 WHERE asset='TAZ' AND purpose='fee'");
 await rejects(c,()=>quote(r),/insufficient inventory/);
}));
test('expired quotes cannot be accepted',()=>isolated(async(c,r)=>{
 const q=await quote(r),id=randomUUID();
 await c.query(`INSERT INTO zee.quotes(id,direction,source_asset,destination_asset,input_amount,output_amount,payout_fee_asset,payout_fee,
  refund_fee_asset,refund_fee,private_payload,deposit_reference_hash,receiver_hash,access_hash,settlement_id,created_at,expires_at)
  SELECT $2,direction,source_asset,destination_asset,input_amount,output_amount,payout_fee_asset,payout_fee,
   refund_fee_asset,refund_fee,private_payload,$3,$4,access_hash,$5,clock_timestamp()-interval '130 seconds',clock_timestamp()-interval '11 seconds'
  FROM zee.quotes WHERE id=$1`,[q.id,id,randomBytes(32),randomBytes(32),randomUUID()]);
 await rejects(c,()=>c.query('SELECT zee.accept_quote($1)',[id]),/quote expired/);
}));
test('timely deposit discovered after reservation release enters review, never fulfillment',()=>isolated(async(c,r)=>{
 const q=await quote(r);await r.accept(q.id,q.accessToken);
 await c.query("UPDATE zee.scanner_checkpoints SET scanned_height=1021,observed_at=clock_timestamp() WHERE network='zcash-testnet'");
 await c.query('SELECT zee.expire_unfunded($1)',[q.id]);const id=await r.observe(deposit(q,{height:1012}));
 assert.equal((await c.query('SELECT classification FROM zee.deposits WHERE id=$1',[id])).rows[0].classification,'QUARANTINED');
 await rejects(c,()=>r.confirm(id),/manual recovery/);
}));
test('canonical hash changes and checkpoint rewinds trigger reconciliation',()=>isolated(async(c,r)=>{
 const {d}=await ready(c,r);await c.query('UPDATE zee.chain_observations SET block_hash=$1 WHERE network=$2 AND height=$3',['c'.repeat(64),d.network,d.height]);
 assert.equal((await c.query('SELECT reconciliation_required FROM zee.runtime_control')).rows[0].reconciliation_required,true);
 await c.query('UPDATE zee.runtime_control SET reconciliation_required=false');
 await c.query("UPDATE zee.scanner_checkpoints SET scanned_height=scanned_height-1,finalized_height=0 WHERE network='zcash-testnet'");
 assert.equal((await c.query('SELECT reconciliation_required FROM zee.runtime_control')).rows[0].reconciliation_required,true);
}));
test('confirmed customer liability is balanced and never credited as spendable inventory',()=>isolated(async(c,r)=>{
 const before=(await c.query("SELECT balance::text FROM zee.inventory_accounts WHERE asset='TAZ' AND purpose='principal'")).rows[0].balance;
 const {id}=await ready(c,r);
 const rows=(await c.query('SELECT bucket,amount::text FROM zee.ledger_entries WHERE event_id=$1 ORDER BY bucket',[id])).rows;
 assert.deepEqual(rows,[{bucket:'customer:held',amount:'1000000'},{bucket:'customer:liability',amount:'-1000000'}]);
 assert.equal((await c.query("SELECT balance::text FROM zee.inventory_accounts WHERE asset='TAZ' AND purpose='principal'")).rows[0].balance,before);
}));
test('stale observers stop new job claims',()=>isolated(async(c,r)=>{
 await ready(c,r);await c.query('UPDATE zee.runtime_control SET dispatch_enabled=true');
 await c.query("UPDATE zee.scanner_checkpoints SET observed_at=clock_timestamp()-interval '61 seconds'");
 assert.equal((await c.query('SELECT * FROM zee.claim_job($1)',[randomUUID()])).rowCount,0);
}));
test('actual application and worker logins connect through the pooler with restricted permissions',async()=>{
 const runtime=JSON.parse(await readFile(process.env.ZEE_RUNTIME_CONFIG || new URL('../../.deploy-local/neon-g2-runtime.json',import.meta.url),'utf8'));
 for(const kind of ['api','worker']){
  const app=connect(runtime[`${kind}Url`],1);try{
   const c=await app.connect();try{assert.equal((c as any).connection.stream.authorized,true);
    assert.equal((await c.query('SELECT current_user AS role')).rows[0].role,`zeeswap_${kind}_dev`);
    await assert.rejects(()=>c.query('UPDATE zee.inventory_accounts SET balance=1'),/permission denied/);
    await assert.rejects(()=>c.query('UPDATE zee.runtime_control SET dispatch_enabled=true'),/permission denied/);
   }finally{c.release();}
  }finally{await app.end();}
 }
});
test('two concurrent acceptances cannot overspend the same inventory',async()=>{
 const c=await pool.connect();const qids:string[]=[];
 try {
  await c.query('BEGIN');await seed(c);await c.query("UPDATE zee.inventory_accounts SET balance=1000000 WHERE asset='mockUSDC' AND purpose='principal'");
  const r=new Repository(c,keys),a=await quote(r),b=await quote(r);qids.push(a.id,b.id);await c.query('COMMIT');
  const results=await Promise.allSettled([new Repository(pool,keys).accept(a.id,a.accessToken),new Repository(pool,keys).accept(b.id,b.accessToken)]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.filter(x=>x.status==='rejected').length,1);
  assert.equal((await c.query("SELECT reserved::text FROM zee.inventory_accounts WHERE asset='mockUSDC' AND purpose='principal'")).rows[0].reserved,'1000000');
 } finally {
  await c.query('ROLLBACK');await c.query('BEGIN');
  await c.query('UPDATE zee.scanner_checkpoints SET scanned_height=2000,finalized_height=2000,finalized_time=clock_timestamp()+interval \'3 hours\',observed_at=clock_timestamp()');
  for(const id of qids) if((await c.query('SELECT id FROM zee.orders WHERE id=$1',[id])).rowCount) await c.query('SELECT zee.expire_unfunded($1)',[id]);
  // This dedicated branch contains only synthetic test capital, never live funds.
  await c.query('UPDATE zee.inventory_accounts SET balance=0 WHERE reserved=0');
  await c.query('SELECT zee.enter_reconciliation()');await c.query('COMMIT');c.release();
 }
});
