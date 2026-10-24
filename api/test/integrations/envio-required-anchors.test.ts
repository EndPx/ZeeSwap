import test from'node:test';import assert from'node:assert/strict';import{randomBytes}from'node:crypto';import{Pool}from'pg';import{envioRequiredAnchorSql}from'../../src/integrations/observation/envio-required-anchors.ts';
test('required anchor schema cannot inject SQL',()=>{assert.throws(()=>envioRequiredAnchorSql('zee;DROP'),/INVALID_SQL_IDENTIFIER/);});
test('real PG retains old financial anchors and pending hints while excluding undeleted heartbeat-only history',{skip:!process.env.ENVIO_TEST_DATABASE_URL},async()=>{
 const pool=new Pool({connectionString:process.env.ENVIO_TEST_DATABASE_URL,max:1}),schema='envio_anchor_'+randomBytes(6).toString('hex'),s=`"${schema}"`,h=(n:number)=>n.toString(16).padStart(64,'0');
 try{await pool.query(`CREATE SCHEMA ${s};CREATE TABLE ${s}.scanner_checkpoints(network text,scanned_height bigint,tip_hash text,finalized_height bigint);CREATE TABLE ${s}.chain_observations(network text,height bigint,block_hash text);CREATE TABLE ${s}.deposits(network text,block_height bigint,block_hash text);CREATE TABLE ${s}.base_attempts(block_height bigint,block_hash text);CREATE TABLE ${s}.escrow_commits(block_height bigint,block_hash text);CREATE TABLE ${s}.escrow_settlements(block_height bigint,block_hash text);CREATE TABLE ${s}.source_refunds(base_height bigint,base_block text);`);
  await pool.query(`INSERT INTO ${s}.scanner_checkpoints VALUES('base-sepolia',900,$1,800)`,[h(900)]);
  await pool.query(`INSERT INTO ${s}.chain_observations VALUES('base-sepolia',800,$1),('base-sepolia',99,$2),('base-sepolia',199,$3)`,[h(800),h(99),h(199)]);
  await pool.query(`INSERT INTO ${s}.deposits VALUES('base-sepolia',10,$1),('zcash-testnet',11,$2)`,[h(10),h(11)]);
  for(const[table,height]of[['base_attempts',20],['escrow_commits',30],['escrow_settlements',40]]as const)await pool.query(`INSERT INTO ${s}."${table}" VALUES($1,$2)`,[height,h(height)]);
  await pool.query(`INSERT INTO ${s}.source_refunds VALUES(60,$1)`,[h(60)]);
  const rows=(await pool.query(envioRequiredAnchorSql(schema),[[70],[h(70)]])).rows;
  assert.deepEqual(rows.map(row=>Number(row.height)),[10,20,30,40,60,70,800,900]);assert.equal(rows.find(row=>row.height==='900').persist,false);
  assert.equal((await pool.query(`SELECT count(*)::text count FROM ${s}.chain_observations`)).rows[0].count,'3'); // never delete history
 }finally{await pool.query(`DROP SCHEMA ${s} CASCADE`);await pool.end();}
});
