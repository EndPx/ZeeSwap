import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {connect} from '../src/db.ts';
import {PrivateData,accessHash} from '../src/private-data.ts';
import {Repository} from '../src/repository.ts';
import {marketFixture} from './market-pricing-fixture.ts';
import {marketSnapshotDigest,requireAcceptedMarketQuote} from '../src/market-pricing.ts';
import {createApi} from '../src/http-api.ts';
const configPath=process.env.ZEE_MARKET_TEST_CONFIG;
test('actual isolated PostgreSQL market snapshot/admission/accounting/permission fixture',{skip:!configPath},async t=>{
 const cfg=JSON.parse(await readFile(configPath!,'utf8'));if(cfg.projectId!=='raspy-truth-63998651'||cfg.branchId!=='br-wispy-dawn-aorsbba5'||cfg.branchName!=='zeeswap-g3-settlement-tests')throw Error('MARKET_TEST_PROJECT_SCOPE');const url=new URL(cfg.adminUrl);if(url.hostname!=='ep-broad-math-aoxcd482.c-2.ap-southeast-1.aws.neon.tech'||url.pathname!=='/neondb')throw Error('MARKET_TEST_DATABASE_SCOPE');
 const schema='market_test_'+randomBytes(12).toString('hex');assert.match(schema,/^market_test_[a-f0-9]{24}$/);const pool=connect(cfg.adminUrl,4),keys=new PrivateData(randomBytes(32),randomBytes(32)),owner='A'.repeat(43),policy=Buffer.alloc(32,0x42),contract='0x'+'1'.repeat(40),token='0x'+'2'.repeat(40);let created=false;let lease:any;
 const rewrite=(sql:string)=>sql.replace(/\bzee\b/g,schema);
 async function role<T>(name:'zeeswap_api'|'zeeswap_worker',run:(q:any)=>Promise<T>){const c=await pool.connect();try{await c.query('SET ROLE '+name);await c.query('BEGIN');const value=await run({query:(sql:string,args?:unknown[])=>c.query(rewrite(sql),args)});await c.query('COMMIT');return value;}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{await c.query('RESET ROLE');c.release();}}
 const admin={query:(sql:string,args?:unknown[])=>pool.query(rewrite(sql),args)};const dbNow=async()=>new Date((await pool.query('SELECT clock_timestamp() n')).rows[0].n).getTime();
 try{
  const migrations=['0001_core.sql','0002_transitions.sql','0003_boundary_hardening.sql','0004_observer_guards.sql','0005_source_liabilities.sql','0006_api_requests.sql','0007_observer_cycle.sql','0008_private_order_status.sql','0009_base_settlement.sql','0010_base_lease_renewal.sql','0011_reverse_escrow_preflight.sql','0012_reverse_delivery.sql','0013_source_refunds.sql','0014_targeted_g5_claims.sql','0017_native_circle_continuation.sql','0018_native_circle_replacement.sql','0019_root_native_circle_authorization.sql','0020_bounded_testnet_service_policy.sql','0021_testnet_service_refunds.sql'];
  for(const name of migrations){let sql=await readFile(new URL('../migrations/'+name,import.meta.url),'utf8');sql=sql.replace(/^CREATE ROLE .*;\r?\n/gm,'').replace(/^GRANT zeeswap_api, zeeswap_worker, zeeswap_reader TO CURRENT_USER;\r?\n/gm,'');await pool.query(rewrite(sql));created=true;}
  await admin.query("UPDATE zee.assets SET live_enabled=true,contract_address=CASE WHEN id='mockUSDC' THEN $1 ELSE contract_address END WHERE id IN('TAZ','mockUSDC')",[token]);
  await admin.query("INSERT INTO zee.inventory_accounts(asset,purpose,balance) VALUES('TAZ','principal',5000000),('mockUSDC','principal',5000000),('TAZ','fee',100000),('baseETH','fee',1000000000000000)");
  await admin.query("INSERT INTO zee.scanner_checkpoints VALUES('zcash-testnet',100,$1,91,clock_timestamp(),clock_timestamp()),('base-sepolia',200,$1,190,clock_timestamp(),clock_timestamp())",['a'.repeat(64)]);
  await admin.query("INSERT INTO zee.chain_observations VALUES('zcash-testnet',100,$1,clock_timestamp()),('base-sepolia',200,$1,clock_timestamp())",['a'.repeat(64)]);
  await admin.query('UPDATE zee.runtime_control SET accepting_orders=true,dispatch_enabled=true,reconciliation_required=false,epoch=1');
  const legacy=await role('zeeswap_api',db=>new Repository(db,keys).issueQuote({direction:'ZCASH_TO_BASE',inputAmount:'100000',payoutFee:'100000000000000',refundFee:'10000',recipient:contract,refundRecipient:'fixture:shielded',depositReceiver:'fixture:legacy'},owner));
  const before=(await admin.query('SELECT to_jsonb(q) data FROM zee.quotes q WHERE id=$1',[legacy.id])).rows[0].data;
  const marketMigration=rewrite(await readFile(new URL('../migrations/0023_market_pricing.sql',import.meta.url),'utf8'));
  await t.test('migration refuses a changed legacy equality fence and rolls back without weakening it',async()=>{
   const constraints=(await admin.query(`SELECT c.conname FROM pg_constraint c WHERE c.conrelid='zee.quotes'::regclass AND c.contype='c'
    AND cardinality(c.conkey)=2 AND (SELECT array_agg(a.attname ORDER BY a.attname) FROM pg_attribute a WHERE a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey))=ARRAY['input_amount','output_amount']::name[]`)).rows;
   assert.equal(constraints.length,1);const name=constraints[0].conname;assert.match(name,/^[a-z_][a-z_0-9]*$/);
   const c=await pool.connect();try{await c.query('BEGIN');await c.query(`ALTER TABLE ${schema}.quotes DROP CONSTRAINT "${name}"`);await c.query(`ALTER TABLE ${schema}.quotes ADD CONSTRAINT "${name}" CHECK(output_amount>=input_amount)`);
    await assert.rejects(()=>c.query(marketMigration),/MARKET_LEGACY_OUTPUT_CONSTRAINT_SHAPE/);
   }finally{await c.query('ROLLBACK');c.release();}
   assert.deepEqual((await admin.query('SELECT to_jsonb(q) data FROM zee.quotes q WHERE id=$1',[legacy.id])).rows[0].data,before);
  });
  await pool.query(marketMigration);
  await t.test('migration preserves old fixture tuple and equality, and adds no old quote columns',async()=>{assert.deepEqual((await admin.query('SELECT to_jsonb(q) data FROM zee.quotes q WHERE id=$1',[legacy.id])).rows[0].data,before);assert.equal(before.input_amount,before.output_amount);assert.equal(before.pricing_mode,'fixture');});
  const epoch=(await admin.query('SELECT epoch::text FROM zee.runtime_control')).rows[0].epoch;
  await admin.query(`INSERT INTO zee.root_market_service_policies(policy_sha256,policy_id,active_epoch,profile_sha256,source_identity_digest,canonical_audit_sha256,capital_allocation_sha256,initial_books_sha256,public_commit,settlement_contract,token_contract,native_principal_budget,base_principal_budget,native_fee_budget,base_fee_budget,expires_at) VALUES($1,$2,$3,$4,$4,$4,$4,$4,$5,$6,$7,5000000,5000000,40000,400000000000000,clock_timestamp()+interval '1 hour')`,[policy,randomUUID(),epoch,Buffer.alloc(32,0x11),'a'.repeat(40),contract,token]);
  lease=await pool.connect();await lease.query('SET ROLE zeeswap_worker');await lease.query('SELECT pg_advisory_lock(84532,20261026)');await lease.query(rewrite('SELECT zee.record_market_worker_readiness($1,clock_timestamp(),$2)'),[policy,Buffer.alloc(32,0x33)]);
  // Leave enough real time for restricted-role/network round trips before the
  // explicit expiry phase; a slow remote DB must not race fixture construction.
  const snapshot=marketFixture(await dbNow()-1000);snapshot.expiresAt=new Date(await dbNow()+15000).toISOString();snapshot.snapshotSha256=marketSnapshotDigest(snapshot);
  await t.test('API cannot publish/modify snapshots or insert market mappings; worker publisher recomputes digest',async()=>{
   const args=[snapshot.snapshotId,JSON.stringify(snapshot),Buffer.from(snapshot.snapshotSha256,'hex')];await assert.rejects(()=>role('zeeswap_api',db=>db.query('SELECT zee.publish_market_snapshot($1,$2::jsonb,$3)',args)));
   await role('zeeswap_worker',db=>db.query('SELECT zee.publish_market_snapshot($1,$2::jsonb,$3)',args));
   await assert.rejects(()=>role('zeeswap_api',db=>db.query('INSERT INTO zee.market_quote_prices VALUES($1,$2,$3,$4,clock_timestamp())',[randomUUID(),snapshot.snapshotId,policy,accessHash(owner)])));
   await assert.rejects(()=>admin.query('UPDATE zee.market_price_snapshots SET bid_scaled12=1 WHERE id=$1',[snapshot.snapshotId]));
   const forged={...snapshot,snapshotId:randomUUID(),snapshotSha256:'f'.repeat(64)};await assert.rejects(()=>role('zeeswap_worker',db=>db.query('SELECT zee.publish_market_snapshot($1,$2::jsonb,$3)',[forged.snapshotId,JSON.stringify(forged),Buffer.alloc(32,0xff)])));
  });
  const issue=(direction:'ZCASH_TO_BASE'|'BASE_TO_ZCASH',sample=snapshot)=>role('zeeswap_api',db=>new Repository(db,keys).issueQuote({direction,inputAmount:direction==='ZCASH_TO_BASE'?'100000':'1000000',payoutFee:direction==='ZCASH_TO_BASE'?'100000000000000':'10000',refundFee:direction==='ZCASH_TO_BASE'?'10000':'100000000000000',recipient:direction==='ZCASH_TO_BASE'?contract:'fixture:market-recipient',refundRecipient:direction==='ZCASH_TO_BASE'?'fixture:refund':contract,depositReceiver:randomUUID(),payer:direction==='BASE_TO_ZCASH'?contract:undefined,executionMode:direction==='ZCASH_TO_BASE'?'base-settlement-v1':'base-escrow-v1',baseContract:contract,marketPricing:{snapshot:sample,policySha256:policy.toString('hex')}},owner));
  // Actual local HTTP uses restricted API-role transactions and the same SQL
  // snapshot/policy gates. Chain/wallet surfaces here are explicit test adapters;
  // the separate Anvil fixture checks actual contract behavior.
  const apiPool:any={
   query:(sql:string,args?:unknown[])=>role('zeeswap_api',db=>db.query(sql,args)),
   connect:async()=>{const c=await pool.connect();await c.query('SET ROLE zeeswap_api');return{
    query:(sql:string,args?:unknown[])=>c.query(rewrite(sql),args),
    release:()=>{void c.query('RESET ROLE').then(()=>c.release(),()=>c.release(Error('TEST_ROLE_RESET_FAILED')));}
   };}
  };
  const service=createApi({pool:apiPool,keys,wallet:{validate:async(address:string)=>address,allocate:async()=>randomUUID(),snapshot:async()=>({})},base:{registry:{operator:contract,contracts:{ZeeSwapSettlement:{address:contract},MockUSDC:{address:token}}},preflight:async()=>({availableInventory:'5000000'}),client:{getBalance:async()=>1000000000000000n}} as any,marketPolicy:{approval:{} as any,sha256:policy.toString('hex'),source:{available:()=>true,current:async()=>snapshot} as any,recheck:async()=>{},availability:async()=>(await admin.query('SELECT zee.market_policy_availability($1) availability',[policy])).rows[0].availability}});
  await new Promise<void>(r=>service.listen(0,'127.0.0.1',r));t.after(()=>{service.closeAllConnections();service.close();});const origin=`http://127.0.0.1:${(service.address() as any).port}`;
  let forward:any;
  await t.test('actual HTTP quote exposes market snapshot and exact output without browser price authority',async()=>{
   const headers={Authorization:'Bearer '+owner,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body=JSON.stringify({direction:'ZCASH_TO_BASE',inputAmount:'100000',recipient:contract,refundRecipient:'fixture:refund'}),response=await fetch(origin+'/v1/quotes',{method:'POST',headers,body});assert.equal(response.status,201);const q=await response.json();forward={id:q.id,outputAmount:q.outputAmount};assert.equal(q.priceMode,'market-reference');assert.equal(q.outputAmount,'1200000');assert.equal(q.pricing.snapshotSha256,snapshot.snapshotSha256);assert.equal(q.pricing.locked,false);
   const repeat=await fetch(origin+'/v1/quotes',{method:'POST',headers,body});assert.equal(repeat.status,200);assert.equal((await repeat.json()).id,q.id);
   const forged=await fetch(origin+'/v1/quotes',{method:'POST',headers:{...headers,'Idempotency-Key':randomUUID()},body:JSON.stringify({direction:'ZCASH_TO_BASE',inputAmount:'100000',recipient:contract,refundRecipient:'fixture:refund',outputAmount:'9999999'})});assert.equal(forged.status,400);
  });
  const reverse=await issue('BASE_TO_ZCASH'),contender=await issue('ZCASH_TO_BASE');
  await t.test('SQL issues different exact outputs and immutable snapshot-bound quantities',async()=>{assert.equal(forward.outputAmount,'1200000');assert.equal(reverse.outputAmount,'80000');const rows=(await admin.query('SELECT input_amount::text,output_amount::text,expires_at FROM zee.quotes WHERE id=ANY($1::uuid[])',[[forward.id,reverse.id]])).rows;assert.equal(rows.length,2);assert.ok(rows.every((r:any)=>new Date(r.expires_at).getTime()<=Date.parse(snapshot.expiresAt)));await assert.rejects(()=>admin.query('UPDATE zee.quotes SET output_amount=1 WHERE id=$1',[forward.id]));});
  let accepted='';
  await t.test('concurrent API acceptance has one global winner and reserves actual destination plus both fees',async()=>{
   const results=await Promise.allSettled([forward.id,contender.id].map(id=>role('zeeswap_api',db=>db.query('SELECT zee.accept_market_quote($1,$2,$3)',[id,policy,accessHash(owner)]))));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);accepted=results[0].status==='fulfilled'?forward.id:contender.id;
   const rows=(await admin.query('SELECT asset,purpose,amount::text FROM zee.reservations WHERE order_id=$1 ORDER BY asset,purpose',[accepted])).rows;assert.equal(rows.length,3);assert.equal(rows.find((r:any)=>r.purpose==='principal').amount,'1200000');assert.equal(rows.find((r:any)=>r.asset==='TAZ'&&r.purpose==='fee').amount,'10000');assert.equal(rows.find((r:any)=>r.asset==='baseETH').amount,'100000000000000');
   const ledger=(await admin.query('SELECT asset,sum(amount)::text total FROM zee.ledger_entries WHERE order_id=$1 GROUP BY asset',[accepted])).rows;assert.ok(ledger.every((r:any)=>r.total==='0'));
  });
  await t.test('direct API market insertion cannot bypass the private snapshot/Root policy mapping',async()=>{
   await assert.rejects(()=>role('zeeswap_api',db=>db.query(`INSERT INTO zee.quotes(id,direction,source_asset,destination_asset,input_amount,output_amount,payout_fee_asset,payout_fee,refund_fee_asset,refund_fee,private_payload,key_version,deposit_reference_hash,receiver_hash,access_hash,settlement_id,finality_policy,pricing_mode,created_at,expires_at,execution_mode,base_contract) SELECT $1,direction,source_asset,destination_asset,input_amount,output_amount,payout_fee_asset,payout_fee,refund_fee_asset,refund_fee,private_payload,key_version,$2,$3,access_hash,$4,finality_policy,'market-reference',created_at,expires_at,execution_mode,base_contract FROM zee.quotes WHERE id=$5`,[randomUUID(),randomBytes(32),randomBytes(32),randomUUID(),forward.id])),(error:any)=>error.code==='P0002');
  });
  await t.test('expiry rejects an unaccepted snapshot but accepted exact terms and worker authority survive expiry',async()=>{
   await delay(Math.max(0,Date.parse(snapshot.expiresAt)-await dbNow()+100));await assert.rejects(()=>role('zeeswap_api',db=>db.query('SELECT zee.accept_market_quote($1,$2,$3)',[reverse.id,policy,accessHash(owner)])),/MARKET_SNAPSHOT_EXPIRED/);
   await role('zeeswap_api',db=>db.query('SELECT zee.accept_market_quote($1,$2,$3)',[accepted,policy,accessHash(owner)]));const bound=await requireAcceptedMarketQuote(admin as any,keys,accepted);assert.equal(bound.outputAmount,'1200000');assert.equal(bound.pricing.locked,true);assert.ok(Date.parse(bound.pricing.expiresAt)<await dbNow());
   const response=await fetch(origin+'/v1/orders/'+accepted,{headers:{Authorization:'Bearer '+owner}});assert.equal(response.status,200);const displayed=await response.json();assert.equal(displayed.outputAmount,bound.outputAmount);assert.equal(displayed.pricing.locked,true);assert.equal(displayed.pricing.acceptedAt,bound.acceptedAt);
   const result:any=await role('zeeswap_worker',db=>db.query('SELECT * FROM zee.check_market_policy_worker($1,$2)',[policy,accepted]));const check=result.rows;assert.equal(check[0].output_amount,bound.outputAmount);assert.equal((await admin.query('SELECT count(*) n FROM zee.market_policy_admissions')).rows[0].n,'1');
  });
  await t.test('accepted drain survives a heartbeat older than60s but new admission and absent leases remain fenced',async()=>{
   await admin.query('UPDATE zee.scanner_checkpoints SET observed_at=clock_timestamp()');
   await admin.query("UPDATE zee.market_service_runtime SET worker_ready_at=clock_timestamp()-interval '61 seconds',capital_observed_at=clock_timestamp()-interval '61 seconds' WHERE policy_sha256=$1",[policy]);
   const result:any=await role('zeeswap_worker',db=>db.query('SELECT * FROM zee.check_market_policy_worker($1,$2)',[policy,accepted]));assert.equal(result.rows[0].order_id,accepted);
   const fresh=marketFixture(await dbNow()-1000);fresh.snapshotId=randomUUID();fresh.snapshotSha256=marketSnapshotDigest(fresh);
   await role('zeeswap_worker',db=>db.query('SELECT zee.publish_market_snapshot($1,$2::jsonb,$3)',[fresh.snapshotId,JSON.stringify(fresh),Buffer.from(fresh.snapshotSha256,'hex')]));
   await assert.rejects(()=>issue('BASE_TO_ZCASH',fresh),/MARKET_WORKER_OR_CAPITAL_STALE/);
   await lease.query('SELECT pg_advisory_unlock(84532,20261026)');try{
    await assert.rejects(()=>role('zeeswap_worker',db=>db.query('SELECT * FROM zee.check_market_policy_worker($1,$2)',[policy,accepted])),/MARKET_ACCEPTED_WORKER_FENCED/);
   }finally{await lease.query('SELECT pg_advisory_lock(84532,20261026)');}
   await lease.query(rewrite('SELECT zee.record_market_worker_readiness($1,clock_timestamp(),$2)'),[policy,Buffer.alloc(32,0x33)]);
  });
  await t.test('post-expiry accepted underpayment refunds full actual source, not converted output, exactly once',async()=>{
   // Canonical chain observations/receipts in this DB fixture are synthetic.
   // Real contract behavior is separately verified in the Anvil fixture.
   await admin.query('UPDATE zee.scanner_checkpoints SET observed_at=clock_timestamp()');await lease.query(rewrite('SELECT zee.record_market_worker_readiness($1,clock_timestamp(),$2)'),[policy,Buffer.alloc(32,0x33)]);
   const q:any=await new Repository(admin as any,keys).privateQuote(accepted,owner);await admin.query("INSERT INTO zee.chain_observations VALUES('zcash-testnet',90,$1,clock_timestamp()),('base-sepolia',190,$1,clock_timestamp())",['a'.repeat(64)]);
   const blockTime=new Date(await dbNow()),deposit=await role('zeeswap_worker',db=>new Repository(db,keys).observe({network:'zcash-testnet',txid:'b'.repeat(64),pool:'ironwood',index:0,reference:q.reference,receiver:q.depositReceiver,amount:'80000',height:90,blockHash:'a'.repeat(64),blockTime,shielded:true}));
   await role('zeeswap_worker',db=>db.query('SELECT zee.confirm_deposit($1)',[deposit]));await role('zeeswap_worker',db=>db.query('SELECT zee.begin_market_source_refund($1,$2)',[accepted,policy]));
   await role('zeeswap_worker',db=>db.query('SELECT zee.store_market_source_refund_base($1,$2,$3,$4,$5)',[accepted,policy,Buffer.alloc(32,0x61),keys.seal({fixture:true},'test-cancel'),'10000000000000']));
   await role('zeeswap_worker',db=>db.query('SELECT zee.confirm_market_source_refund_base($1,$2,$3,$4,$5,$6,$7,$8)',[accepted,policy,'CANCEL',Buffer.alloc(32,0x61),190,'a'.repeat(64),'1000',keys.seal({fixture:true},'test-cancel-proof')]));
   await role('zeeswap_worker',db=>db.query('SELECT zee.store_market_source_refund_zcash($1,$2,$3,$4,$5,$6)',[accepted,policy,Buffer.alloc(32,0x62),keys.seal({amount:'80000'},'test-native'),'10000',200]));
   await admin.query("INSERT INTO zee.chain_observations VALUES('zcash-testnet',111,$1,clock_timestamp())",['c'.repeat(64)]);await admin.query("UPDATE zee.scanner_checkpoints SET scanned_height=120,finalized_height=111,tip_hash=$1,observed_at=clock_timestamp() WHERE network='zcash-testnet'",['c'.repeat(64)]);
   await role('zeeswap_worker',db=>db.query('SELECT zee.confirm_market_source_refund_zcash($1,$2,$3,$4,$5,$6,$7)',[accepted,policy,Buffer.alloc(32,0x62),111,'c'.repeat(64),'10000',keys.seal({amount:'80000'},'test-native-proof')]));
   const row=(await admin.query('SELECT state FROM zee.orders WHERE id=$1',[accepted])).rows[0];assert.equal(row.state,'REFUNDED');assert.equal((await admin.query("SELECT amount::text FROM zee.ledger_entries WHERE order_id=$1 AND bucket='customer:refunded'",[accepted])).rows[0].amount,'80000');assert.equal((await admin.query('SELECT count(*) n FROM zee.reservations WHERE order_id=$1 AND released_at IS NULL',[accepted])).rows[0].n,'0');
   const before=(await admin.query('SELECT count(*) n FROM zee.ledger_entries WHERE order_id=$1',[accepted])).rows[0].n;await role('zeeswap_worker',db=>db.query('SELECT zee.confirm_market_source_refund_zcash($1,$2,$3,$4,$5,$6,$7)',[accepted,policy,Buffer.alloc(32,0x62),111,'c'.repeat(64),'10000',keys.seal({amount:'80000'},'test-native-proof')]));assert.equal((await admin.query('SELECT count(*) n FROM zee.ledger_entries WHERE order_id=$1',[accepted])).rows[0].n,before);
  });
  await t.test('fresh reverse quote reserves 80000 native units after forward refund releases the global slot',async()=>{
   await admin.query('UPDATE zee.scanner_checkpoints SET observed_at=clock_timestamp()');await lease.query(rewrite('SELECT zee.record_market_worker_readiness($1,clock_timestamp(),$2)'),[policy,Buffer.alloc(32,0x33)]);
   const fresh=marketFixture(await dbNow()-1000);fresh.snapshotId=randomUUID();fresh.snapshotSha256=marketSnapshotDigest(fresh);await role('zeeswap_worker',db=>db.query('SELECT zee.publish_market_snapshot($1,$2::jsonb,$3)',[fresh.snapshotId,JSON.stringify(fresh),Buffer.from(fresh.snapshotSha256,'hex')]));const q=await issue('BASE_TO_ZCASH',fresh);await role('zeeswap_api',db=>db.query('SELECT zee.accept_market_quote($1,$2,$3)',[q.id,policy,accessHash(owner)]));
   assert.equal((await admin.query("SELECT amount::text FROM zee.reservations WHERE order_id=$1 AND asset='TAZ' AND purpose='principal'",[q.id])).rows[0].amount,'80000');const bound=await requireAcceptedMarketQuote(admin as any,keys,q.id);assert.equal(bound.inputAmount,'1000000');assert.equal(bound.outputAmount,'80000');assert.equal(bound.pricing.locked,true);
  });
 }finally{
  if(lease){await lease.query('SELECT pg_advisory_unlock(84532,20261026)').catch(()=>{});await lease.query('RESET ROLE').catch(()=>{});lease.release();}
  if(created)await pool.query('DROP SCHEMA '+schema+' CASCADE');await pool.end();
 }
});
