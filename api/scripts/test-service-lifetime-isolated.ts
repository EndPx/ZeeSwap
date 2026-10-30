/** Run only in a disposable schema-only VPS clone. No live database or global-role changes. */
import {readFile} from 'node:fs/promises';import {randomUUID,randomBytes,createHash} from 'node:crypto';import assert from 'node:assert/strict';import pg from 'pg';
import {serviceLifetimeInsert,type ServiceLifetimeAuthorization} from '../src/testnet-service-lifetime.ts';
const cfg=JSON.parse(await readFile(process.argv[2]!,'utf8')) as {databaseUrl:string;caPath:string};
const target=new URL(cfg.databaseUrl);assert.match(target.pathname,/^\/zee_service_lifetime_test_[0-9]+$/);
const connection={host:target.hostname,port:Number(target.port||5432),database:target.pathname.slice(1),user:decodeURIComponent(target.username),password:decodeURIComponent(target.password),ssl:{rejectUnauthorized:true,servername:target.hostname,ca:await readFile(cfg.caPath,'utf8')},connectionTimeoutMillis:15000,statement_timeout:15000};
const root=new pg.Client(connection),api=new pg.Client(connection),worker=new pg.Client(connection);
const policy=randomBytes(32),owner=randomBytes(32),contract='0x'+'1'.repeat(40),token='0x'+'2'.repeat(40);let locked=false;
try{
 await Promise.all([root,api,worker].map(c=>c.connect()));assert.equal((await root.query('SELECT count(*)::int n FROM zee.orders')).rows[0].n,0,'schema-only clone required');
 await root.query("INSERT INTO zee.assets VALUES('TAZ',8,2100000000000000,'zcash-testnet',NULL,true),('mockUSDC',6,1e77,'base-sepolia',$1,true),('baseETH',18,1e77,'base-sepolia',NULL,false)",[token]);
 await root.query("INSERT INTO zee.runtime_control VALUES(true,true,true,false,100)");
 await root.query("INSERT INTO zee.inventory_accounts VALUES('TAZ','principal',200000,0),('TAZ','fee',40000,0),('mockUSDC','principal',200000,0),('baseETH','fee',400000000000000,0)");
 await root.query("INSERT INTO zee.scanner_checkpoints VALUES('zcash-testnet',1000,$1,991,clock_timestamp(),clock_timestamp()),('base-sepolia',1000,$1,990,clock_timestamp(),clock_timestamp())",['a'.repeat(64)]);
 // Genuine expired finite permit, committed before its separate service authorization.
 await root.query(`INSERT INTO zee.root_testnet_service_policies(policy_sha256,policy_id,active_epoch,profile_sha256,source_identity_digest,canonical_audit_sha256,capital_allocation_sha256,initial_books_sha256,public_commit,settlement_contract,token_contract,amount_atomic,forward_cap,reverse_cap,global_concurrency,quote_cap,forward_cutoff_blocks,min_lead_blocks,native_principal_budget,base_principal_budget,native_fee_budget,base_fee_budget,created_at,expires_at) VALUES($1,$2,100,$1,$1,$1,$1,$1,$3,$4,$5,100000,2,2,1,32,40,12,200000,200000,40000,400000000000000,clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour')`,[policy,randomUUID(),'d'.repeat(40),contract,token]);
 await root.query('SET ROLE zee_app_admin_20261023');await root.query(await readFile(new URL('../migrations/0032_testnet_service_lifetime.sql',import.meta.url),'utf8'));
 await api.query('SET ROLE zeeswap_api');await worker.query('SET ROLE zeeswap_worker');locked=(await worker.query('SELECT pg_try_advisory_lock(84532,20261026) owned')).rows[0].owned;assert.equal(locked,true);
 const availability=async()=> (await api.query('SELECT zee.testnet_policy_availability($1) a',[policy])).rows[0].a;
 assert.equal((await availability()).status,'policy_expired');
 const original=(await root.query("SELECT created_xid::text,expires_at::text,encode(profile_sha256,'hex') profile FROM zee.root_testnet_service_policies WHERE policy_sha256=$1",[policy])).rows[0],control=(await root.query('SELECT xmin::text FROM zee.runtime_control WHERE singleton')).rows[0];
 const a:ServiceLifetimeAuthorization={version:1,purpose:'ROOT_TESTNET_SERVICE_NO_EXPIRY',authorizationId:randomUUID(),policySha256:policy.toString('hex'),humanApprovalSha256:'b'.repeat(64),serviceExpiresAt:null,originalActivationXid:original.created_xid,activeEpoch:'100',controlXmin:control.xmin,profileSha256:original.profile,settlementContract:contract,tokenContract:token,originalExpiresAt:original.expires_at,approvedAt:new Date().toISOString(),publishBefore:new Date(Date.now()+600000).toISOString(),financialAction:false};
 const insert=(v:ServiceLifetimeAuthorization)=>{const i=serviceLifetimeInsert(v,Buffer.from(JSON.stringify(v)));return root.query(i.sql,i.args);};
 await assert.rejects(insert({...a,controlXmin:'1'}),/EXACT_CURRENT/);await insert(a);
 await assert.rejects(root.query('UPDATE zee.testnet_service_lifetime_authorizations SET active_epoch=active_epoch'),/permission denied|immutable/);
 await assert.rejects(api.query('SELECT * FROM zee.testnet_service_lifetime_authorizations'),/permission denied/);
 await assert.rejects(api.query('INSERT INTO zee.testnet_service_lifetime_authorizations DEFAULT VALUES'),/permission denied/);
 assert.equal((await availability()).status,'worker_unavailable');
 await worker.query('SELECT zee.record_testnet_worker_readiness($1,clock_timestamp(),$2)',[policy,randomBytes(32)]);
 let v=await availability();assert.equal(v.version,3);assert.equal(v.policy.expiresAt,null);assert.equal(v.policy.lifetime,'nonexpiring');assert.equal(v.status,'ready');assert.equal(v.policy.remainingQuotes,32);assert.equal(v.policy.lifetimeAuthorizationSha256,createHash('sha256').update(Buffer.from(JSON.stringify(a))).digest('hex'));
 await root.query('RESET ROLE');
 const quote=async(expired=false)=>{const id=randomUUID();await root.query(`INSERT INTO zee.quotes(id,direction,source_asset,destination_asset,input_amount,output_amount,payout_fee_asset,payout_fee,refund_fee_asset,refund_fee,private_payload,deposit_reference_hash,receiver_hash,access_hash,settlement_id,execution_mode,base_contract,created_at,expires_at) VALUES($1,'ZCASH_TO_BASE','TAZ','mockUSDC',100000,100000,'baseETH',100000000000000,'TAZ',10000,$2,$3,$4,$5,$6,'base-settlement-v1',$7,statement_timestamp()-interval '1 minute',statement_timestamp()+CASE WHEN $8 THEN interval '-1 second' ELSE interval '1 minute' END)`,[id,Buffer.alloc(64,1),randomBytes(32),randomBytes(32),owner,randomUUID(),contract,expired]);return id;};
 const expired=await quote(true);await assert.rejects(api.query('SELECT zee.bind_testnet_policy_quote($1,$2,$3)',[expired,policy,owner]),/quote expired/);
 const id=await quote();await api.query('SELECT zee.bind_testnet_policy_quote($1,$2,$3)',[id,policy,owner]);await api.query('SELECT zee.accept_testnet_policy_quote($1,$2,$3)',[id,policy,owner]);
 v=await availability();assert.equal(v.status,'busy');assert.equal(v.policy.activeOrders,1);assert.equal(v.policy.remainingQuotes,31);assert.equal(v.policy.remainingByDirection.ZCASH_TO_BASE,1);
 assert.equal((await root.query('SELECT funding_cutoff_height::text height FROM zee.orders WHERE id=$1',[id])).rows[0].height,'1040');
 assert.equal((await root.query('SELECT count(*)::int n FROM zee.reservations WHERE order_id=$1',[id])).rows[0].n,3);
 await root.query("UPDATE zee.scanner_checkpoints SET observed_at=clock_timestamp()-interval '61 seconds'");assert.equal((await availability()).status,'source_unavailable');
 assert.equal((await root.query('SELECT expires_at::text FROM zee.root_testnet_service_policies WHERE policy_sha256=$1',[policy])).rows[0].expires_at,a.originalExpiresAt);
 console.log(JSON.stringify({status:'ISOLATED_SERVICE_LIFETIME_SQL_PASSED',checks:['expired permit becomes explicit nonexpiring v3','exact control rejection','immutable authorization','restricted ACLs','live lease and capital required','finite quote expiry','busy/concurrency and consumed quotas preserved','finite funding cutoff','exact reservations','source freshness unchanged','original policy expiry unchanged'],liveDatabaseTouched:false}));
}finally{if(locked)await worker.query('SELECT pg_advisory_unlock(84532,20261026)').catch(()=>{});await Promise.all([root,api,worker].map(c=>c.end().catch(()=>{})));}
