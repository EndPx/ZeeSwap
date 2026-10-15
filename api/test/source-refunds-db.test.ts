import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {connect} from '../src/db.ts';
import {runtime} from '../scripts/runtime.ts';
import {Repository} from '../src/repository.ts';

const settings=JSON.parse(await readFile(process.env.ZEE_DB_CONFIG!,'utf8'));
if(settings.branchId!=='br-wispy-dawn-aorsbba5'||!/^\/zee_test_[0-9a-f]{32}$/.test(new URL(settings.adminUrl).pathname))throw Error('Disposable regression database required');
const r=await runtime(true),admin=connect(settings.adminUrl),api=connect(r.apiUrl),worker=connect(r.workerUrl);
const block='a'.repeat(64),payload=Buffer.alloc(64,1),tx=Buffer.alloc(32,2),ztx=Buffer.alloc(32,3);
const contract='0x'+'11'.repeat(20),payer='0x'+'22'.repeat(20);
async function fresh(){
 await admin.query(`INSERT INTO zee.scanner_checkpoints VALUES('zcash-testnet',110,$1,101,clock_timestamp(),clock_timestamp()),('base-sepolia',110,$1,110,clock_timestamp(),clock_timestamp())
  ON CONFLICT(network) DO UPDATE SET scanned_height=110,finalized_height=EXCLUDED.finalized_height,tip_hash=$1,observed_at=clock_timestamp()`,[block]);
 await admin.query(`INSERT INTO zee.chain_observations VALUES('zcash-testnet',100,$1,clock_timestamp()),('base-sepolia',100,$1,clock_timestamp()),('base-sepolia',105,$1,clock_timestamp()),('zcash-testnet',101,$1,clock_timestamp())
  ON CONFLICT(network,height) DO UPDATE SET block_hash=$1`,[block]);
}
async function order(direction:'ZCASH_TO_BASE'|'BASE_TO_ZCASH',amount='100000'){
 await fresh();await admin.query('UPDATE zee.runtime_control SET accepting_orders=true,dispatch_enabled=false,reconciliation_required=false');
 const repo=new Repository(api,r.keys),q=await repo.issueQuote({direction,inputAmount:'100000',payoutFee:direction==='ZCASH_TO_BASE'?'100000000000000':'10000',refundFee:direction==='ZCASH_TO_BASE'?'10000':'100000000000000',
  recipient:direction==='ZCASH_TO_BASE'?payer:'fixture:shielded-destination',refundRecipient:direction==='ZCASH_TO_BASE'?'fixture:shielded-refund':payer,
  payer:direction==='BASE_TO_ZCASH'?payer:undefined,depositReceiver:randomUUID(),executionMode:direction==='ZCASH_TO_BASE'?'base-settlement-v1':'base-escrow-v1',baseContract:contract});
 await repo.accept(q.id,q.accessToken);const privateQuote=await repo.privateQuote(q.id,q.accessToken) as any;
 const source=direction==='ZCASH_TO_BASE'?'zcash-testnet':'base-sepolia',observer=new Repository(worker,r.keys);
 const deposit=await observer.observe({network:source,txid:randomUUID().replaceAll('-','').repeat(2),index:0,pool:'ironwood',emitter:contract,reference:q.reference,
  receiver:privateQuote.depositReceiver,amount,height:100,blockHash:block,blockTime:new Date(),shielded:source==='zcash-testnet'});
 await observer.confirm(deposit);
 await admin.query('UPDATE zee.runtime_control SET accepting_orders=false,dispatch_enabled=false');
 return {id:q.id,deposit,reference:q.reference,receiver:privateQuote.depositReceiver};
}
before(async()=>{
 for(const [asset,purpose,balance] of [['TAZ','principal','10000000'],['TAZ','fee','1000000'],['mockUSDC','principal','10000000'],['baseETH','fee','10000000000000000']]){
  await admin.query('INSERT INTO zee.inventory_accounts(asset,purpose,balance) VALUES($1,$2,$3)',[asset,purpose,balance]);
 }
});
after(async()=>{await Promise.all([admin.end(),api.end(),worker.end()]);});

test('forward cancel -> exact principal refund discharges once, balances fees separately and keeps journal immutable',async()=>{
 const q=await order('ZCASH_TO_BASE');await worker.query('SELECT zee.begin_source_refund($1)',[q.id]);
 await assert.rejects(()=>worker.query('SELECT zee.check_source_refund_signing($1)',[q.id]),/cancellation/);
 await worker.query('SELECT zee.store_source_refund_base($1,$2,$3,$4)',[q.id,tx,payload,'1000']);
 await worker.query('SELECT zee.confirm_source_refund_base($1,\'CANCEL\',$2,105,$3,200,$4)',[q.id,tx,block,payload]);
 await worker.query('SELECT zee.check_source_refund_signing($1)',[q.id]);
 await assert.rejects(()=>worker.query('SELECT zee.store_source_refund_zcash($1,$2,$3,10000,129)',[q.id,ztx,payload]),/expiry/);
 await worker.query('SELECT zee.store_source_refund_zcash($1,$2,$3,10000,150)',[q.id,ztx,payload]);
 await assert.rejects(()=>worker.query('SELECT zee.store_source_refund_zcash($1,$2,$3,10000,150)',[q.id,Buffer.alloc(32,8),payload]),/conflicting/);
 await worker.query('SELECT zee.confirm_source_refund_zcash($1,$2,101,$3,10000,$4)',[q.id,ztx,block,payload]);
 const again=(await worker.query('SELECT zee.confirm_source_refund_zcash($1,$2,101,$3,10000,$4) AS changed',[q.id,ztx,block,payload])).rows[0];assert.equal(again.changed,false);
 const result=(await worker.query('SELECT o.state,a.confirmed FROM zee.orders o JOIN zee.source_refunds a ON a.order_id=o.id WHERE o.id=$1',[q.id])).rows[0];assert.deepEqual(result,{state:'REFUNDED',confirmed:true});
 assert.equal((await worker.query('SELECT amount::text FROM zee.ledger_entries WHERE order_id=$1 AND bucket=\'customer:refunded\'',[q.id])).rows[0].amount,'100000');
 assert.equal((await worker.query('SELECT sum(amount)::text AS n FROM zee.ledger_entries WHERE order_id=$1',[q.id])).rows[0].n,'0');
 assert.equal((await worker.query('SELECT count(*) AS n FROM zee.reservations WHERE order_id=$1 AND released_at IS NULL',[q.id])).rows[0].n,'0');
});
test('reverse refund returns full principal and records caller gas without debiting operator ETH',async()=>{
 const q=await order('BASE_TO_ZCASH'),before=(await worker.query("SELECT balance::text FROM zee.inventory_accounts WHERE asset='baseETH' AND purpose='fee'")).rows[0].balance;
 await worker.query('SELECT zee.begin_source_refund($1)',[q.id]);
 const hash=Buffer.alloc(32,4);await worker.query('SELECT zee.store_source_refund_base($1,$2,$3,1000)',[q.id,hash,payload]);
 await worker.query("SELECT zee.confirm_source_refund_base($1,'REFUND',$2,105,$3,200,$4)",[q.id,hash,block,payload]);
 assert.equal((await worker.query("SELECT balance::text FROM zee.inventory_accounts WHERE asset='baseETH' AND purpose='fee'")).rows[0].balance,before);
 assert.equal((await worker.query('SELECT base_fee::text FROM zee.source_refunds WHERE order_id=$1',[q.id])).rows[0].base_fee,'200');
 assert.equal((await worker.query("SELECT amount::text FROM zee.ledger_entries WHERE order_id=$1 AND bucket='customer:refunded'",[q.id])).rows[0].amount,'100000');
 await assert.rejects(()=>worker.query('SELECT zee.check_source_refund_signing($1)',[q.id]));
});
test('signed reverse commitment forbids refund even with expiry or missing delivery metadata',async()=>{
 const q=await order('BASE_TO_ZCASH');
 await admin.query('INSERT INTO zee.escrow_bindings(order_id,terms_payload) VALUES($1,$2)',[q.id,payload]);
 await admin.query('INSERT INTO zee.escrow_commits(order_id,tx_hash,signed_payload,max_cost) VALUES($1,$2,$3,1000)',[q.id,Buffer.alloc(32,5),payload]);
 await assert.rejects(()=>worker.query('SELECT zee.begin_source_refund($1)',[q.id]),/committed/);
});
test('unbudgeted extra deposits retain liabilities and cannot cause a second automatic refund',async()=>{
 const q=await order('ZCASH_TO_BASE');
 await new Repository(worker,r.keys).observe({network:'zcash-testnet',txid:'f'.repeat(64),index:0,pool:'ironwood',reference:q.reference,receiver:q.receiver,amount:'100000',height:100,blockHash:block,blockTime:new Date(),shielded:true});
 await assert.rejects(()=>worker.query('SELECT zee.begin_source_refund($1)',[q.id]),/separately budgeted/);
});
test('worker cannot invoke the internal accounting discharge without verified receipt boundary',async()=>{
 const result=(await worker.query("SELECT has_function_privilege(current_user,'zee.discharge_source_refund(uuid,bigint,text,bytea)','EXECUTE') AS permitted")).rows[0];assert.equal(result.permitted,false);
});
test('underpayment and overpayment refund the entire received principal without aggregation or repricing',async()=>{
 for(const amount of ['90000','110000']){
  const q=await order('ZCASH_TO_BASE',amount),baseHash=Buffer.from(randomUUID().replaceAll('-','').repeat(2),'hex'),zcashHash=Buffer.from(randomUUID().replaceAll('-','').repeat(2),'hex');
  await worker.query('SELECT zee.begin_source_refund($1)',[q.id]);
  await worker.query('SELECT zee.store_source_refund_base($1,$2,$3,1000)',[q.id,baseHash,payload]);
  await worker.query("SELECT zee.confirm_source_refund_base($1,'CANCEL',$2,105,$3,200,$4)",[q.id,baseHash,block,payload]);
  await worker.query('SELECT zee.store_source_refund_zcash($1,$2,$3,10000,150)',[q.id,zcashHash,payload]);
  await worker.query('SELECT zee.confirm_source_refund_zcash($1,$2,101,$3,10000,$4)',[q.id,zcashHash,block,payload]);
  assert.equal((await worker.query("SELECT amount::text FROM zee.ledger_entries WHERE order_id=$1 AND bucket='customer:refunded'",[q.id])).rows[0].amount,amount);
 }
});
