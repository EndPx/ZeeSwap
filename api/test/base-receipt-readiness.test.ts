import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type pg from 'pg';
import {disposableSettlement} from '../scripts/test-settlement-database.ts';
import {connect,transaction} from '../src/db.ts';
import {PrivateData} from '../src/private-data.ts';
import {Repository} from '../src/repository.ts';
import {reconcileBaseReceipts} from '../src/base-settlement.ts';
import {requireBaseReceiptReadiness,baseConfirmationSqlDiagnostic,type BaseReceiptConfirmation} from '../src/base-receipt-readiness.ts';
import {isObserverWait} from '../src/observer-frontiers.ts';
import {g5Diagnostic} from '../src/g5-diagnostic.ts';
import type {BaseContract,ConfirmedBaseReceipt} from '../src/base-contract.ts';

// Injected chain views, actual schema-14 SQL and actual worker permissions.
// The invocation owns its UUID DB; no retained branch or wallet is reset.
let isolated:Awaited<ReturnType<typeof disposableSettlement>>,admin:pg.Pool,worker:pg.Pool;
const keys=new PrivateData(randomBytes(32),randomBytes(32)),hash='ab'.repeat(32);
before(async()=>{
 isolated=await disposableSettlement({throughMigration:14});const cfg=JSON.parse(await readFile(isolated.configPath,'utf8')),runtime=JSON.parse(await readFile(isolated.runtimePath,'utf8'));
 admin=connect(cfg.adminUrl,3);worker=connect(runtime.workerUrl,3);
 await admin.query("INSERT INTO zee.scanner_checkpoints VALUES('zcash-testnet',1000,$1,991,clock_timestamp(),clock_timestamp()),('base-sepolia',600,$1,480,clock_timestamp(),clock_timestamp())",[hash]);
 await admin.query("INSERT INTO zee.chain_observations VALUES('zcash-testnet',991,$1,clock_timestamp())",[hash]);
 await admin.query("INSERT INTO zee.inventory_accounts SELECT id,p,1000000000000000,0 FROM zee.assets CROSS JOIN (VALUES('principal'),('fee')) x(p)");
 await admin.query('UPDATE zee.runtime_control SET accepting_orders=true,dispatch_enabled=true,reconciliation_required=false');
});
after(async()=>{await worker?.end();await admin?.end();await isolated?.cleanup();});
async function fixture(height:number){
 await admin.query("UPDATE zee.scanner_checkpoints SET observed_at=clock_timestamp()");
 const receiver='fixture:source:'+randomUUID(),repo=new Repository(admin,keys),q=await repo.issueQuote({direction:'ZCASH_TO_BASE',inputAmount:'100000',payoutFee:'50000000000000',refundFee:'10000',recipient:'0x1111111111111111111111111111111111111111',refundRecipient:'fixture:refund',depositReceiver:receiver,executionMode:'base-settlement-v1',baseContract:'0x2222222222222222222222222222222222222222'});
 await repo.accept(q.id,q.accessToken);const dep=await repo.observe({network:'zcash-testnet',txid:randomBytes(32).toString('hex'),index:0,pool:'ironwood',reference:q.reference,receiver,amount:'100000',height:991,blockHash:hash,blockTime:new Date(),shielded:true});await repo.confirm(dep);
 const owner=randomUUID(),job=(await worker.query('SELECT * FROM zee.claim_base_job_for_order($1,$2)',[owner,q.id])).rows[0];assert(job);
 const tx='0x'+randomBytes(32).toString('hex'),signed={raw:'0x010203',hash:tx,nonce:17,maxCost:'1000'};
 const terms={id:'0x'+hash,recipient:'0x1111111111111111111111111111111111111111',amount:'100000'};
 await worker.query('SELECT zee.pin_base_terms($1,$2,$3,$4,$5)',[q.id,job.id,owner,job.fence,keys.seal(terms,`base-terms:${q.id}:v1`)]);
 await worker.query('SELECT zee.store_base_attempt($1,$2,$3,$4,$5,$6,$7,$8)',[q.id,job.id,owner,job.fence,'RESERVE',keys.lookup('base-tx',tx),keys.seal(signed,`base-signed:${q.id}:RESERVE:v1`),'1000']);
 const receipt={hash:tx,blockNumber:height,blockHash:'0x'+hash,fee:'500',phase:'RESERVE',id:'0x'+hash,recipient:terms.recipient,amount:'100000'} as ConfirmedBaseReceipt;
 const p:BaseReceiptConfirmation={orderId:q.id,phase:'RESERVE',txHash:keys.lookup('base-tx',tx),height,blockHash:hash,fee:'500'};
 return {q,receipt,p,signed};
}
async function economic(orderId:string){return {
 attempt:(await admin.query('SELECT * FROM zee.base_attempts WHERE order_id=$1',[orderId])).rows,
 entries:(await admin.query('SELECT * FROM zee.ledger_entries WHERE order_id=$1 ORDER BY id',[orderId])).rows,
 reservations:(await admin.query('SELECT * FROM zee.reservations WHERE order_id=$1 ORDER BY asset,purpose',[orderId])).rows,
 events:(await admin.query('SELECT * FROM zee.order_events WHERE order_id=$1 ORDER BY id',[orderId])).rows};}

test('production receipt first head covers original then published lower-final head WAITs; later same original confirms normally',async()=>{
 const f=await fixture(500),before=await economic(f.q.id);let reads=0,lag=true;
 const heads=async()=>{reads++;return {latest:{number:600n,hash:'0x'+hash},finalized:{number:lag&&reads===2?490n:500n,hash:'0x'+hash,timestamp:BigInt(Math.floor(Date.now()/1000))}};};
 const base={localTest:true,heads,client:{getBlock:async()=>({hash:'0x'+hash,timestamp:BigInt(Math.floor(Date.now()/1000))})},receipt:async()=>{assert((await heads()).finalized.number>=500n);return f.receipt;}} as unknown as BaseContract;
 await assert.rejects(()=>reconcileBaseReceipts(worker,keys,base),e=>isObserverWait(e)&&e.diagnostic.reason==='FINALITY_PENDING');
 assert.equal(reads,2);assert.deepEqual(await economic(f.q.id),before);
 assert.equal((await admin.query("SELECT finalized_height::text AS n FROM zee.scanner_checkpoints WHERE network='base-sepolia'")).rows[0].n,'490');
 lag=false;assert.deepEqual(await reconcileBaseReceipts(worker,keys,base),{checked:1,finalized:1});
 const saved=(await economic(f.q.id)).attempt[0];assert.equal(saved.confirmed,true);assert.equal(saved.block_height,'500');assert.equal(saved.actual_fee,'500');
 assert(saved.tx_hash.equals(f.p.txHash));assert(saved.signed_payload.equals(before.attempt[0].signed_payload));
 assert.equal((await admin.query("SELECT count(*)::text AS n FROM zee.order_events WHERE order_id=$1 AND event_type='BASE_RESERVE_FINALIZED'",[f.q.id])).rows[0].n,'1');
 assert.deepEqual(await reconcileBaseReceipts(worker,keys,base),{checked:0,finalized:0});
});

test('locked actual stale checkpoint waits; lag cannot hide identity canonical fee confirmed-anchor or reservation contradictions',async()=>{
 const f=await fixture(501);await admin.query("INSERT INTO zee.chain_observations VALUES('base-sepolia',$1,$2,clock_timestamp())",[f.p.height,hash]);
 await admin.query("UPDATE zee.scanner_checkpoints SET observed_at=clock_timestamp()-interval '61 seconds' WHERE network='base-sepolia'");
 const before=await economic(f.q.id);
 await assert.rejects(()=>transaction(worker,c=>requireBaseReceiptReadiness(c,f.p)),e=>isObserverWait(e)&&e.diagnostic.reason==='CHECKPOINT_STALE');assert.deepEqual(await economic(f.q.id),before);
 for(const [delta,code] of [[{fee:'1001'},'FEE_CAP_EXCEEDED'],[{txHash:randomBytes(32)},'IDENTITY_MISMATCH'],[{blockHash:'cd'.repeat(32)},'CANONICAL_ANCHOR_REQUIRED'],[{height:599},'CANONICAL_ANCHOR_REQUIRED']] as const){
  await assert.rejects(()=>transaction(worker,c=>requireBaseReceiptReadiness(c,{...f.p,...delta})),new RegExp(code));
 }
 const rollback=Error('SYNTHETIC_ROLLBACK');
 await assert.rejects(()=>transaction(admin,async c=>{await c.query("UPDATE zee.reservations SET released_at=clock_timestamp() WHERE order_id=$1 AND purpose='principal'",[f.q.id]);await assert.rejects(()=>requireBaseReceiptReadiness(c,f.p),/RESERVATIONS_CHANGED/);throw rollback;}),e=>e===rollback);
 await assert.rejects(()=>transaction(admin,async c=>{await c.query("UPDATE zee.base_attempts SET confirmed=true,block_height=$2,block_hash=$3,actual_fee=500,receipt_payload=$4 WHERE order_id=$1 AND phase='RESERVE'",[f.q.id,f.p.height,hash,keys.seal({},'fixture:receipt')]);await assert.rejects(()=>requireBaseReceiptReadiness(c,{...f.p,fee:'501'}),/CONFIRMED_ANCHOR_CHANGED/);throw rollback;}),e=>e===rollback);
 assert.deepEqual(await economic(f.q.id),before);
});

test('actual PostgreSQL P0001 function context maps only six exact literals to static diagnostics and never WAIT',async()=>{
 const f=await fixture(502);let caught:any;
 try{await transaction(worker,c=>c.query('SELECT zee.confirm_base_attempt($1,$2,$3,$4,$5,$6,$7)',[f.q.id,'RESERVE',f.p.txHash,f.p.height,hash,'500',keys.seal({},'fixture:receipt')]));}catch(error){caught=error;}
 assert.equal(caught?.code,'P0001');assert.equal(isObserverWait(caught),false);
 assert.equal(baseConfirmationSqlDiagnostic(caught)?.code,'BASE_CONFIRM_FINALITY_PREDICATE_FAILED');
 const expected=['BASE_CONFIRM_RECEIPT_IDENTITY_MISMATCH','BASE_CONFIRM_RECEIPT_CHANGED','BASE_CONFIRM_FINALITY_PREDICATE_FAILED','BASE_CONFIRM_FEE_CAP_EXCEEDED','BASE_CONFIRM_RESERVE_MISSING','BASE_CONFIRM_RESERVE_INSUFFICIENT'];
 const literals=['receipt identity mismatch','receipt changed; reconciliation required','receipt is not finalized canonical','fee cap exceeded; reconcile','reservation missing','reservation insufficient'];
 for(const [i,message] of literals.entries())assert.equal(baseConfirmationSqlDiagnostic({...caught,message})?.code,expected[i]);
 for(const e of [{...caught,message:'UNKNOWN_SQL_SECRET_TOKEN'},{...caught,code:'23514'},{...caught,where:'PL/pgSQL function unrelated() line 1 at RAISE'}])assert.equal(baseConfirmationSqlDiagnostic(e),undefined);
 const safe=g5Diagnostic({...caught,message:'UNKNOWN_SQL_SECRET_TOKEN'},'dispatch','base-preflight');assert.equal(safe.code,'PRIVATE_DIAGNOSTIC_ERROR');assert.equal(JSON.stringify(safe).includes('UNKNOWN_SQL_SECRET_TOKEN'),false);
});
