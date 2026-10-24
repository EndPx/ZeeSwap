import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { envioProducerViews } from '../../src/integrations/observation/envio-producer.ts';
import { exportEnvioRange, type ReadOnlyClient } from '../../src/integrations/observation/envio.ts';
import type { Policy } from '../../src/integrations/observation/types.ts';
import { canonicalRpc } from '../../src/integrations/observation/canonical-rpc.ts';

const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;
const policy: Policy = { adapter: 'envio-hyperindex', network: 'eip155:84532', birthday: 100,
  registryDigest: '1'.repeat(64), projectionDigest: '2'.repeat(64), abiDigest: '3'.repeat(64),
  canonicalSourceId: 'synthetic-pg-test', contract: `0x${'11'.repeat(20)}`, token: `0x${'22'.repeat(20)}` };

test('producer rejects SQL identifiers and generation injection', () => {
  assert.throws(() => envioProducerViews('public;drop', policy, 'test'), /INVALID_PRODUCER_ID/);
  assert.throws(() => envioProducerViews('public', policy, "test'"), /INVALID_PRODUCER_ID/);
});

test('canonical EVM batches map reordered RPC ids and reject duplicate ids, wrong heights and limits', async () => {
  let mode='reordered', calls=0;
  const rpc=canonicalRpc({url:'https://example.test',network:'eip155:84532',sourceId:'test',fetch:(async(_url,init)=>{
    calls++;
    const requests=JSON.parse(String(init?.body)) as Array<{id:number;method:string;params:[string,boolean]}>;
    assert.ok(requests.every(row=>row.method==='eth_getBlockByNumber'&&row.params[1]===false));
    const rows=requests.map(row=>({id:mode==='duplicate'?1:row.id,result:{number:mode==='wrong'?'0x5':row.params[0],hash:hash(10+row.id),parentHash:hash(9+row.id),timestamp:'0x1'}})).reverse();
    return Response.json(rows);
  })as typeof fetch});
  const headers=await rpc.headers!([100,101],AbortSignal.timeout(1000));
  assert.deepEqual(headers.map(row=>row.height),[100,101]);
  mode='duplicate';await assert.rejects(rpc.headers!([100,101],AbortSignal.timeout(1000)),/CANONICAL_BATCH_RESPONSE/);
  mode='wrong';await assert.rejects(rpc.headers!([100,101],AbortSignal.timeout(1000)),/CANONICAL_RPC_HEADER_MISMATCH/);
  const before=calls;await assert.rejects(rpc.headers!(Array(51).fill(100),AbortSignal.timeout(1000)),/CANONICAL_BATCH_LIMIT/);assert.equal(calls,before);
});

test('real PG MVCC keeps checkpoint, empty headers and event deletion coherent across rollback transaction',
  { skip: !process.env.ENVIO_TEST_DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: process.env.ENVIO_TEST_DATABASE_URL, max: 3 });
  const schema = `envio_mvcc_${randomBytes(6).toString('hex')}`;
  const s = `"${schema}"`, now = Date.now(), time = new Date(now).toISOString();
  const header = (n: number, fork = 0) => ({ height: n, hash: hash(n + fork), parentHash: hash(n - 1 + fork), time });
  const writer = await pool.connect(), reader = await pool.connect();
  try {
    await writer.query(`CREATE SCHEMA ${s};
CREATE TABLE ${s}.envio_chains(id int, start_block int, progress_block int);
CREATE TABLE ${s}.envio_checkpoints(chain_id int,block_number int);
CREATE TABLE ${s}."BlockVisit"(id text PRIMARY KEY,"blockNumber" int,"coverageComplete" bool,"headerJson" text,"sourceHeadJson" text,"sourceSampledAt" text);
CREATE TABLE ${s}."SettlementEvent"(id text,contract text,"contractVersion" text,token text,"txHash" text,"transactionIndex" int,"logIndex" int,"blockNumber" int,"blockHash" text,"blockParentHash" text,"blockTimestamp" int,"eventName" text,"settlementId" text,"amountAtomic" numeric,"decodedJson" text);
INSERT INTO ${s}.envio_chains VALUES(84532,100,101);
INSERT INTO ${s}.envio_checkpoints VALUES(84532,100);`);
    for (const n of [100,101]) await writer.query(`INSERT INTO ${s}."BlockVisit" VALUES($1,$2,true,$3,$4,$5)`, [`84532:${n}`,n,JSON.stringify(header(n)),JSON.stringify(header(105)),time]);
    await writer.query(`INSERT INTO ${s}."SettlementEvent" VALUES('old',$1,'v1',$2,$3,0,0,100,$4,$5,$6,'InventoryDeposited',NULL,7,$7)`,
      [policy.contract,policy.token,hash(555),hash(100),hash(99),Math.floor(now/1000),JSON.stringify({from:`0x${'44'.repeat(20)}`,amount:'7'})]);
    // Event timestamp representation is exact to seconds, as with real EVM blocks.
    for (const n of [100,101]) {
      const h = { ...header(n), time: new Date(Math.floor(now/1000)*1000).toISOString() };
      await writer.query(`UPDATE ${s}."BlockVisit" SET "headerJson"=$1 WHERE "blockNumber"=$2`,[JSON.stringify(h),n]);
    }
    await writer.query(envioProducerViews(schema,policy,'pg-test'));
    let injected = false;
    const client = { query: async (sql: string, values?: unknown[]) => {
      const result = await reader.query(sql,values);
      if (!injected && sql.includes('SELECT payload FROM') && sql.includes('zee_checkpoint')) {
        injected = true;
        await writer.query('BEGIN');
        await writer.query(`DELETE FROM ${s}."SettlementEvent"`);
        for (const n of [100,101]) await writer.query(`UPDATE ${s}."BlockVisit" SET "headerJson"=$1,"sourceHeadJson"=$2 WHERE "blockNumber"=$3`,
          [JSON.stringify(header(n,1000)),JSON.stringify(header(105,1000)),n]);
        await writer.query('COMMIT');
      }
      return result;
    }} as ReadOnlyClient;
    const config = {schema, checkpointTable:'zee_checkpoint',headersTable:'zee_headers',eventsTable:'zee_events',streamId:'base-v1'};
    const before = await exportEnvioRange(client,config,policy,100,()=>now);
    assert.equal(before.batch.observations.length,1);
    assert.equal(before.batch.headers.length,2); // includes empty block101
    assert.equal(before.batch.headers[0]!.hash,hash(100));
    const after = await exportEnvioRange(reader,config,policy,100,()=>now);
    assert.equal(after.batch.observations.length,0);
    assert.equal(after.batch.headers[0]!.hash,hash(1100));
    assert.ok(BigInt(after.batch.coverage.revision)>BigInt(before.batch.coverage.revision));
    await writer.query(`DELETE FROM ${s}."BlockVisit" WHERE "blockNumber"=100`);
    await assert.rejects(exportEnvioRange(reader,config,policy,100,()=>now),/COHERENT_CHECKPOINT_REQUIRED/);
  } finally {
    await writer.query(`DROP SCHEMA ${s} CASCADE`);
    reader.release(); writer.release(); await pool.end();
  }
});
