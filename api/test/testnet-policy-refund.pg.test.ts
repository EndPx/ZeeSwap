/** Opt-in isolated Neon schema, shipped functions, real restricted worker. */
import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes,randomUUID} from 'node:crypto';import pg from 'pg';
import {serviceApproval,POLICY_CONTRACT,POLICY_TOKEN} from './fixtures/service-policy-fixture.ts';
import {installServicePolicyPgSchema,scopeServicePolicySql} from './fixtures/service-policy-pg.ts';
const url=process.env.TESTNET_SERVICE_POLICY_TEST_DATABASE_URL;
test('restricted policy refund preserves legacy pause, accepts expired membership, fences conflicts and discharges exact principal once',{skip:!url?'isolated test URL required':false},async()=>{
 const target=new URL(url!);assert.equal(target.hostname,'ep-polished-hill-ao5ulo5g.c-2.ap-southeast-1.aws.neon.tech');assert.equal(target.pathname,'/neondb');assert.equal(decodeURIComponent(target.username),'neondb_owner');
 const schema='service_refund_'+randomBytes(12).toString('hex'),root=new pg.Client({connectionString:url}),worker=new pg.Client({connectionString:url}),a=new pg.Client({connectionString:url}),clients=[root,worker,a];let created=false,locked=false;
 const q=(c:pg.Client,sql:string,args:unknown[]=[])=>c.query(scopeServicePolicySql(sql,schema),args),owner=randomBytes(32);let policy:Buffer=Buffer.alloc(32,11);const block='a'.repeat(64),payload=Buffer.alloc(64,1),tx=Buffer.alloc(32,2),ztx=Buffer.alloc(32,3);
 async function refresh(){await q(root,"UPDATE zee.scanner_checkpoints SET observed_at=clock_timestamp()");await q(worker,'SELECT zee.record_testnet_worker_readiness($1,clock_timestamp(),$2)',[policy,Buffer.alloc(32,21)]);}
 async function mint(sha:Buffer,epoch:number,ttl=3600){const p=serviceApproval();p.policyId=randomUUID();await q(root,"UPDATE zee.runtime_control SET epoch=$1,accepting_orders=true,dispatch_enabled=true,reconciliation_required=false",[epoch]);await q(root,`INSERT INTO zee.root_testnet_service_policies(policy_sha256,policy_id,active_epoch,profile_sha256,source_identity_digest,canonical_audit_sha256,capital_allocation_sha256,initial_books_sha256,public_commit,settlement_contract,token_contract,amount_atomic,forward_cap,reverse_cap,global_concurrency,quote_cap,forward_cutoff_blocks,min_lead_blocks,native_principal_budget,base_principal_budget,native_fee_budget,base_fee_budget,expires_at)
 VALUES($1,$2,$3,$4,$4,$4,$4,$4,$5,$6,$7,100000,2,2,1,32,40,12,200000,200000,40000,400000000000000,clock_timestamp()+$8*interval '1 second')`,[sha,p.policyId,epoch,Buffer.alloc(32,1),p.publicCommit,POLICY_CONTRACT,POLICY_TOKEN,ttl]);policy=sha;await refresh();}
 async function quote(direction='ZCASH_TO_BASE',token=owner,bind=true){const id=randomUUID(),forward=direction==='ZCASH_TO_BASE';await q(root,`INSERT INTO zee.quotes(id,direction,source_asset,destination_asset,input_amount,output_amount,payout_fee_asset,payout_fee,refund_fee_asset,refund_fee,private_payload,deposit_reference_hash,receiver_hash,access_hash,settlement_id,execution_mode,base_contract,created_at,expires_at)
 VALUES($1,$2,$3,$4,100000,100000,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,statement_timestamp(),statement_timestamp()+interval '120 seconds')`,[id,direction,forward?'TAZ':'mockUSDC',forward?'mockUSDC':'TAZ',forward?'baseETH':'TAZ',forward?'100000000000000':'10000',forward?'TAZ':'baseETH',forward?'10000':'100000000000000',Buffer.alloc(64,1),randomBytes(32),randomBytes(32),token,randomUUID(),forward?'base-settlement-v1':'base-escrow-v1',POLICY_CONTRACT]);if(bind)await q(a,'SELECT zee.bind_testnet_policy_quote($1,$2,$3)',[id,policy,token]);return id;}

 try{
  await Promise.all(clients.map(c=>c.connect()));await installServicePolicyPgSchema(root,schema,true);created=true;
  await a.query('SET ROLE zeeswap_api');await worker.query('SET ROLE zeeswap_worker');locked=(await worker.query('SELECT pg_try_advisory_lock(84532,20261026) locked')).rows[0].locked;assert.equal(locked,true);
  await q(root,"UPDATE zee.assets SET contract_address='0xd64c116352cef2adc9484098ae332fd9ba339a63' WHERE id='mockUSDC'; UPDATE zee.assets SET live_enabled=(id IN('TAZ','mockUSDC')); UPDATE zee.runtime_control SET epoch=100,accepting_orders=true,dispatch_enabled=true,reconciliation_required=false");
  await q(root,"INSERT INTO zee.inventory_accounts VALUES('TAZ','principal',200000,0),('TAZ','fee',40000,0),('mockUSDC','principal',200000,0),('baseETH','fee',400000000000000,0)");
  await q(root,"INSERT INTO zee.scanner_checkpoints VALUES('zcash-testnet',1000,$1,991,clock_timestamp(),clock_timestamp()),('base-sepolia',1000,$1,990,clock_timestamp(),clock_timestamp())",[block]);
  await q(root,"INSERT INTO zee.chain_observations VALUES('zcash-testnet',980,$1,clock_timestamp()),('zcash-testnet',981,$1,clock_timestamp()),('base-sepolia',985,$1,clock_timestamp())",[block]);
  await mint(policy,100,12);const id=await quote();await q(a,'SELECT zee.accept_testnet_policy_quote($1,$2,$3)',[id,policy,owner]);const deposit=randomUUID();
  await q(root,`INSERT INTO zee.deposits VALUES($1,$2,'zcash-testnet',$3,100000,980,$4,clock_timestamp(),$2,$2,true,$5,'EXACT',clock_timestamp(),clock_timestamp());`,[deposit,randomBytes(32),id,block,payload]);
  await q(root,"INSERT INTO zee.obligations VALUES($1,$2,100000,'HELD')",[deposit,id]);await q(root,"UPDATE zee.orders SET primary_deposit=$1,state='READY' WHERE id=$2",[deposit,id]);
  await q(root,"INSERT INTO zee.operations(order_id,deposit_id,kind) VALUES($1,$2,'PAYOUT')",[id,deposit]);
  await assert.rejects(q(worker,'SELECT zee.begin_source_refund($1)',[id]),/paused/);
  const begin=()=>q(worker,'SELECT zee.begin_testnet_policy_source_refund($1,$2)',[id,policy]);
  async function refused(change:string,args:unknown[],pattern:RegExp){await q(root,'BEGIN');try{await q(root,change,args);await root.query('SET LOCAL ROLE zeeswap_worker');await assert.rejects(q(root,'SELECT zee.begin_testnet_policy_source_refund($1,$2)',[id,policy]),pattern);}finally{await root.query('ROLLBACK');}}
  await refused('UPDATE zee.runtime_control SET epoch=101',[],/FENCED/);await refused('UPDATE zee.runtime_control SET reconciliation_required=true',[],/FENCED/);
  await refused("UPDATE zee.scanner_checkpoints SET observed_at=clock_timestamp()-interval '61 seconds'",[],/SOURCE_STALE/);
  await refused('UPDATE zee.chain_observations SET block_hash=$1 WHERE height=980',['b'.repeat(64)],/canonical|FENCED/i);
  await refused("UPDATE zee.operations SET state='CONFIRMED' WHERE order_id=$1",[id],/paid committed/);
  await refused("INSERT INTO zee.deposits SELECT gen_random_uuid(),$2,network,order_id,amount,block_height,block_hash,block_time,reference_hash,receiver_hash,shielded,private_payload,'EXTRA',confirmed_at,created_at FROM zee.deposits WHERE id=$1",[deposit,randomBytes(32)],/sole allocated/);
  await refused("WITH binding AS(INSERT INTO zee.escrow_bindings(order_id,terms_payload) VALUES($1,$2) RETURNING order_id) INSERT INTO zee.escrow_commits(order_id,tx_hash,signed_payload,max_cost) VALUES($1,$3,$2,1000)",[id,payload,randomBytes(32)],/paid committed/);
  // Unknown original attempt cannot be bypassed by planning cancellation.
  await refused("WITH binding AS(INSERT INTO zee.base_bindings(order_id,terms_payload) VALUES($1,$2) RETURNING order_id) INSERT INTO zee.base_attempts(order_id,phase,tx_hash,signed_payload,max_cost) VALUES($1,'RESERVE',$3,$2,1000)",[id,payload,randomBytes(32)],/unresolved/);
  await refused("WITH binding AS(INSERT INTO zee.base_bindings(order_id,terms_payload) VALUES($1,$2) RETURNING order_id) INSERT INTO zee.base_attempts(order_id,phase,tx_hash,signed_payload,max_cost) VALUES($1,'PAY',$3,$2,1000)",[id,payload,randomBytes(32)],/paid committed/);
  const end=(await q(root,'SELECT expires_at FROM zee.root_testnet_service_policies WHERE policy_sha256=$1',[policy])).rows[0].expires_at;await new Promise(r=>setTimeout(r,Math.max(0,new Date(end).getTime()-Date.now()+20)));await refresh();await begin();await begin();
  assert.equal(Number((await q(root,"SELECT count(*) n FROM zee.order_events WHERE order_id=$1 AND event_type='SOURCE_REFUND_PLANNED'",[id])).rows[0].n),1);
  await assert.rejects(q(worker,'SELECT zee.check_testnet_policy_source_refund_signing($1,$2)',[id,policy]),/cancellation/);
  await assert.rejects(q(worker,'SELECT zee.store_testnet_policy_source_refund_base($1,$2,$3,$4,10000000000001)',[id,policy,tx,payload]),/fee cap/);
  await q(worker,'SELECT zee.store_testnet_policy_source_refund_base($1,$2,$3,$4,1000)',[id,policy,tx,payload]);
  await assert.rejects(q(worker,"SELECT zee.confirm_testnet_policy_source_refund_base($1,$2,'CANCEL',$3,985,$4,200,$5)",[id,policy,tx,'b'.repeat(64),payload]),/canonical/);
  await q(worker,"SELECT zee.confirm_testnet_policy_source_refund_base($1,$2,'CANCEL',$3,985,$4,200,$5)",[id,policy,tx,block,payload]);
  await assert.rejects(q(worker,'SELECT zee.store_testnet_policy_source_refund_zcash($1,$2,$3,$4,10001,1050)',[id,policy,ztx,payload]),/fee/);
  await q(worker,'SELECT zee.store_testnet_policy_source_refund_zcash($1,$2,$3,$4,10000,1050)',[id,policy,ztx,payload]);
  for(const expected of[true,false])assert.equal((await q(worker,'SELECT zee.confirm_testnet_policy_source_refund_zcash($1,$2,$3,981,$4,10000,$5) changed',[id,policy,ztx,block,payload])).rows[0].changed,expected);
  assert.equal((await q(root,'SELECT state FROM zee.orders WHERE id=$1',[id])).rows[0].state,'REFUNDED');assert.equal((await q(root,'SELECT sum(amount)::text n FROM zee.ledger_entries WHERE order_id=$1',[id])).rows[0].n,'0');assert.equal((await q(root,"SELECT amount::text FROM zee.ledger_entries WHERE order_id=$1 AND bucket='customer:refunded'",[id])).rows[0].amount,'100000');
  assert.equal((await q(worker,"SELECT has_function_privilege(current_user,'zee.discharge_source_refund(uuid,bigint,text,bytea)','EXECUTE') ok")).rows[0].ok,false);
 }finally{if(locked)await worker.query('SELECT pg_advisory_unlock(84532,20261026)').catch(()=>{});await Promise.all([worker,a].map(c=>c.end().catch(()=>{})));await root.query('ROLLBACK').catch(()=>{});if(created)await root.query(`DROP SCHEMA "${schema}" CASCADE`);await root.end();}
});
