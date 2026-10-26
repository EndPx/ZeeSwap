import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {connect} from '../src/db.ts';
import {PrivateData} from '../src/private-data.ts';
import {BridgeRepository} from '../src/bridge/repository.ts';
import {BridgeService} from '../src/bridge/service.ts';
import {BridgeWorker,type BridgeDurableSigner} from '../src/bridge/worker.ts';
import {applyEvent,coverage,digest} from '../src/bridge/model.ts';
import {fixtureBooks,fixtureRuntime,forward,reverse,receipt,now,address,token,otherToken} from './bridge-fixture.ts';

const configPath=process.env.ZEE_BRIDGE_TEST_CONFIG;
test('isolated PostgreSQL bridge transaction/encryption/concurrency/lifecycle fixture',{skip:!configPath},async t=>{
 const c=JSON.parse(await readFile(configPath!,'utf8'));
 if(c.projectId!=='raspy-truth-63998651'||c.branchId!=='br-wispy-dawn-aorsbba5'||c.branchName!=='zeeswap-g3-settlement-tests')throw Error('BRIDGE_TEST_CONFIG_IDENTITY');
 const url=new URL(c.adminUrl);if(url.hostname!=='ep-broad-math-aoxcd482.c-2.ap-southeast-1.aws.neon.tech'||url.pathname!=='/neondb')throw Error('BRIDGE_TEST_DATABASE_IDENTITY');
 const schema='bridge_test_'+randomBytes(12).toString('hex'),pool=connect(c.adminUrl,4),keys=new PrivateData(randomBytes(32),randomBytes(32)),repo=new BridgeRepository(pool,keys,schema);
 let created=false;
 try{
  const migration=await readFile(new URL('../migrations/0022_bridge.sql',import.meta.url),'utf8');
  await pool.query(migration.replaceAll('zee_bridge',schema));created=true;await repo.initializePaused();
  await t.test('empty book starts paused, grants no API/worker access and preserves singleton constraints',async()=>{
   assert.equal((await repo.read()).paused,true);const permissions=(await pool.query('SELECT has_schema_privilege($1,$2,\'USAGE\') AS api,has_schema_privilege($3,$2,\'USAGE\') AS worker',['zeeswap_api',schema,'zeeswap_worker'])).rows[0];assert.equal(permissions.api,false);assert.equal(permissions.worker,false);
   await assert.rejects(()=>pool.query(`UPDATE ${schema}.books SET revision=-1`));await assert.rejects(()=>pool.query(`INSERT INTO ${schema}.books(singleton,payload) VALUES(false,$1)`,[Buffer.alloc(30)]));
   await repo.initializePaused();assert.equal((await pool.query(`SELECT count(*) FROM ${schema}.books`)).rows[0].count,'1');
  });
  await repo.update(b=>Object.assign(b,fixtureBooks()));
  await t.test('real rollback and concurrent connections serialize without lost updates',async()=>{
   const before=digest(await repo.read());await assert.rejects(()=>repo.update(b=>{b.controlled='99';throw Error('test rollback');}));assert.equal(digest(await repo.read()),before);
   await Promise.all(Array.from({length:12},()=>repo.update(b=>{b.controlled=(BigInt(b.controlled)+1n).toString();})));assert.equal((await repo.read()).controlled,'12');await repo.update(b=>{b.controlled='0';});
  });
  const service=new BridgeService(repo,fixtureRuntime(repo));
  let id='';
  await t.test('concurrent durable quotes deduplicate and encrypt private material',async()=>{
   const input={direction:'TAZ_TO_ZEETAZ' as const,amountAtomic:'100000',recipient:address,refundRecipient:'test:shielded-refund'};
   const quotes=await Promise.all(Array.from({length:4},()=>service.quote(input,token,'postgres-key',now)));id=quotes[0].id;assert.ok(quotes.every(q=>q.id===id));
   await assert.rejects(()=>service.order(id,otherToken),/NOT_FOUND/);const order=await service.accept(id,token,'postgres-accept',now);assert.equal(order.status,'AWAITING_DEPOSIT');
   const raw=(await pool.query(`SELECT payload FROM ${schema}.books`)).rows[0].payload as Buffer;assert.ok(!raw.includes(Buffer.from('test:shielded-refund')));assert.ok(!raw.includes(Buffer.from('opaque-fixture:')));assert.throws(()=>new PrivateData(randomBytes(32),randomBytes(32)).open(raw,'bridge:books:v1'));
  });
  await t.test('two verifier workers observe same deposit once across database transactions',async()=>{
   const verifier={verify:async()=>({kind:'DEPOSIT' as const,id,amount:'100000',identity:'pg:deposit:0',receipt:receipt()})},signer:BridgeDurableSigner={assertFreshCanonical:async()=>{},recoverOrPrepare:async()=>{throw Error();},broadcastOriginal:async()=>{}};
   const a=new BridgeWorker(repo,verifier,signer),b=new BridgeWorker(repo,verifier,signer);await Promise.all([a.observe(id,{},now),b.observe(id,{},now)]);assert.equal((await repo.read()).controlled,'100000');assert.equal(coverage(await repo.read()).acceptedUnmintedZatoshi,'100000');
  });
  let redemptionId='';
  await t.test('mint -> authenticated burn -> prepared exact payout conserves liabilities and journal after reconnect',async()=>{
   await repo.update(b=>{const o=b.orders[id];applyEvent(b,{kind:'MINT',id,amount:o.amountAtomic,recipient:o.recipient,receipt:receipt('base-sepolia')},now);const r=reverse(b);redemptionId=r.id;applyEvent(b,{kind:'BURN',id:r.id,amount:r.amountAtomic,payer:address,commitment:r.commitment,identity:'pg:burn:0',receipt:receipt('base-sepolia','cc'.repeat(32))},now);});
   const signer:BridgeDurableSigner={assertFreshCanonical:async()=>{},recoverOrPrepare:async i=>({intentId:i.intentId,txid:'dd'.repeat(32),raw:'cafe',feeAtomic:'1000',expiryHeight:180}),broadcastOriginal:async()=>{throw Error('unknown broadcast outcome');}};
   const worker=new BridgeWorker(repo,{verify:async()=>{throw Error();}},signer);const signed=await worker.prepare(redemptionId,'10000',now);await assert.rejects(()=>worker.broadcast(redemptionId,now),/unknown/);
   const second=new BridgeRepository(pool,keys,schema);assert.deepEqual((await second.read()).orders[redemptionId].attempt,signed);assert.equal((await second.read()).orders[redemptionId].broadcastAttempted,true);await assert.rejects(()=>worker.broadcast(redemptionId,now),/RECONCILIATION/);
   assert.equal((await second.read()).feeCapital,'9000');assert.equal(coverage(await second.read()).unpaidRedemptionsZatoshi,'100000');
  });
  await t.test('included principal moves C -> D, reorg and exact re-inclusion close once',async()=>{
   const included=receipt('zcash-testnet','dd'.repeat(32));await repo.update(b=>{applyEvent(b,{kind:'INCLUDE',id:redemptionId,receipt:included},now);});assert.equal((await repo.read()).inTransit,'100000');
   await repo.update(b=>{applyEvent(b,{kind:'REORG',target:'DELIVERY',id:redemptionId,receipt:included},now);});assert.equal((await repo.read()).controlled,'100000');
   await repo.update(b=>{applyEvent(b,{kind:'INCLUDE',id:redemptionId,receipt:included},now);applyEvent(b,{kind:'CONFIRM',id:redemptionId,receipt:included},now);});const final=await repo.read();assert.equal(final.inTransit,'0');assert.equal(final.controlled,'0');assert.equal(coverage(final).unpaidRedemptionsZatoshi,'0');assert.equal(coverage(final).covered,true);
  });
 }finally{
  // This exact invocation owns only the validated random schema; no CASCADE,
  // existing migration, existing branch reset, role mutation or production access.
  if(created){await pool.query(`DROP TABLE ${schema}.books`);await pool.query(`DROP SCHEMA ${schema}`);}await pool.end();
 }
});
