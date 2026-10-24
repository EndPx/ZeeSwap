/** Root-operator-only opt-in fixture using the existing pg driver and a Root-issued
 * existing isolated-branch URL. No project/branch creation and no URL logging.
 * Root invocation: ENVIO_LINKED_CAMPAIGN_TEST_DATABASE_URL=<private existing URL>
 *   pnpm --dir api exec tsx --test test/integrations/envio-linked-campaign.pg.test.ts
 * Only neondb is accepted; existing application zee tables are never touched. */
import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {randomBytes} from 'node:crypto';import pg from 'pg';
import {PrivateData} from '../../src/private-data.ts';import {liveOpeningAccounts} from '../../src/live-testnet-opening.ts';
import {repairChildTables} from '../../src/app-chef-metadata-repair.ts';
import {contentDigest,digest,type Policy} from '../../src/integrations/observation/types.ts';
import {initialEnvioRecovery,appendEnvioRecovery,nextEnvioRecoveryRange,completeEnvioRecovery} from '../../src/integrations/observation/envio-recovery.ts';
import {linkedCampaignSnapshotSql,publishLinkedCampaign,classifyLinkedCommit,rawSha,type CampaignSnapshot,type LinkedCampaignApproval,type LinkedCampaignIntent} from '../../src/integrations/observation/envio-linked-campaign.ts';
const url=process.env.ENVIO_LINKED_CAMPAIGN_TEST_DATABASE_URL,H='a'.repeat(64),B='b'.repeat(64),C='c'.repeat(64);
const keys=new PrivateData(Buffer.alloc(32,11),Buffer.alloc(32,13)),keyContext='isolated-linked-cas-fixture';
function scoped(client:pg.Client,schema:string){assert.match(schema,/^envio_linked_cas_[0-9a-f]{24}$/);return async(sql:string,values:unknown[]=[])=>client.query(sql.replace(/\bzee\./g,`"${schema}".`),values);}
async function originalTriggers(){const dir=new URL('../../migrations/',import.meta.url),transitions=await readFile(new URL('0002_transitions.sql',dir),'utf8'),guards=await readFile(new URL('0004_observer_guards.sql',dir),'utf8'),cycle=await readFile(new URL('0007_observer_cycle.sql',dir),'utf8');const reconciliation=transitions.match(/CREATE FUNCTION zee\.enter_reconciliation\(\)[\s\S]*?END \$\$;/)?.[0],rewind=guards.match(/CREATE FUNCTION zee\.guard_observer_rewind\(\)[\s\S]*?CREATE TRIGGER canonical_reorg[^;]*;/)?.[0],lock=cycle.match(/CREATE FUNCTION zee\.lock_observer_cycle\(\)[\s\S]*?END \$\$;/)?.[0];assert.ok(reconciliation&&rewind&&lock,'shipped original function/trigger definitions must exist');return reconciliation+'\n'+rewind+'\n'+lock;}
async function fixture(q:ReturnType<typeof scoped>,time:string){
 await q(`CREATE TABLE zee.runtime_control(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),accepting_orders boolean NOT NULL DEFAULT false,dispatch_enabled boolean NOT NULL DEFAULT false,reconciliation_required boolean NOT NULL DEFAULT true,epoch bigint NOT NULL DEFAULT 4);
 CREATE TABLE zee.scanner_checkpoints(network text PRIMARY KEY,scanned_height bigint NOT NULL,tip_hash text NOT NULL,finalized_height bigint NOT NULL,finalized_time timestamptz NOT NULL,observed_at timestamptz NOT NULL,CHECK(finalized_height BETWEEN 0 AND scanned_height));
 CREATE TABLE zee.chain_observations(network text NOT NULL REFERENCES zee.scanner_checkpoints(network),height bigint NOT NULL,block_hash text NOT NULL,block_time timestamptz NOT NULL,PRIMARY KEY(network,height));
 CREATE TABLE zee.assets(id text PRIMARY KEY,live_enabled boolean NOT NULL,decimals integer NOT NULL,network text NOT NULL,contract_address text);
 CREATE TABLE zee.inventory_accounts(asset text,purpose text,balance numeric,reserved numeric);
 CREATE TABLE zee.ledger_entries(event_id uuid,asset text,bucket text,amount numeric);
 CREATE TABLE zee.quotes(id uuid PRIMARY KEY);
 CREATE TABLE zee.api_quote_requests(quote_id uuid NOT NULL REFERENCES zee.quotes(id));
 CREATE TABLE zee.outbox_jobs(status text,fence bigint,lease_owner uuid,lease_until timestamptz);
 INSERT INTO zee.runtime_control DEFAULT VALUES;
 INSERT INTO zee.assets VALUES('TAZ',false,8,'zcash-testnet',NULL),('mockUSDC',false,6,'base-sepolia','0xd64c116352cef2adc9484098ae332fd9ba339a63'),('baseETH',false,18,'base-sepolia',NULL);`);
 for(const table of repairChildTables)if(table!=='quotes'&&table!=='outbox_jobs')await q(`CREATE TABLE zee.${table}(id uuid)`);
 for(const account of liveOpeningAccounts){await q('INSERT INTO zee.inventory_accounts VALUES($1,$2,$3,$4)',[account.asset,account.purpose,account.balance,account.reserved]);for(const[bucket,amount]of [[account.purpose+':available',account.balance],[account.purpose+':operator-capital','-'+account.balance]])await q('INSERT INTO zee.ledger_entries VALUES($1,$2,$3,$4)',['11111111-2222-3333-4444-555555555555',account.asset,bucket,amount]);}
 const hash=(n:number)=>n.toString(16).padStart(64,'0');
 await q("INSERT INTO zee.scanner_checkpoints VALUES('base-sepolia',49676611,$1,49676511,$2::timestamptz,$2::timestamptz)",[hash(49676611),time]);
 await q("INSERT INTO zee.chain_observations VALUES('base-sepolia',49676611,$1,$2::timestamptz),('base-sepolia',49676511,$3,$2::timestamptz)",[hash(49676611),time,hash(49676511)]);
 await q(await originalTriggers());
}
function campaign(state:CampaignSnapshot,time:string){const policy:Policy={adapter:'envio-hyperindex',network:'eip155:84532',birthday:49128651,registryDigest:H,projectionDigest:B,abiDigest:C,canonicalSourceId:'base-sepolia-recovery-publicnode-v1',contract:'0x'+'11'.repeat(20),token:'0x'+'22'.repeat(20),maxBlocks:1000},identity={policy,generation:'isolated-only',profileSha256:H,handoffSha256:B},hash=(n:number)=>'0x'+n.toString(16).padStart(64,'0'),header=(height:number)=>({height,hash:hash(height),parentHash:hash(height-1),time}),target=49676835,admission={version:2 as const,hints:[],checkpoint:{height:49676611,hash:hash(49676611),generation:identity.generation,projectionDigest:B}},bytes=keys.seal(admission,keyContext),baseline={...state.checkpoint,finalizedTime:time,observedAt:time};const{xmin:_,...sql}=baseline;let journal=initialEnvioRecovery(identity,admission,rawSha(bytes),sql);const range=nextEnvioRecoveryRange(journal,target),headers=Array.from({length:256},(_,n)=>header(range.from+n)),observations:any[]=[];journal=appendEnvioRecovery(journal,{protocol:'zee-envio-selected-export-v1',isolation:'repeatable-read-read-only',snapshotToken:'isolated',expiresAt:new Date(Date.parse(time)+30000).toISOString(),producer:{generation:identity.generation,revision:'1',through:header(target),recoveryFloor:target-199,sourceSampledAt:time,sourceHead:header(target+2),projectionDigest:B,registryDigest:H,complete:true},range:{fromHeight:range.from,through:header(target),headers,observations,contentDigest:contentDigest({headers,observations}),readStartedAt:time,readCompletedAt:time},verification:{sourceId:policy.canonicalSourceId,checkedAt:time,head:header(target+5),finalized:header(target-100)}},Date.parse(time));return{journal,candidate:keys.seal(completeEnvioRecovery(journal).admission,keyContext),approval:{purpose:'POST_PUBLICATION_PREFUNDING_ENVIO_CATCHUP',parent:{coverageSha256:H,intentSha256:B,completedSha256:C,originalAdmissionSha256:H},baseline:state.checkpoint} as LinkedCampaignApproval};}

test('opt-in real PostgreSQL production CAS with original runtime lock/triggers resolves lost COMMIT and rejects later xmin intervention',
 {skip:!url?'ENVIO_LINKED_CAMPAIGN_TEST_DATABASE_URL not provided':false},async()=>{
 const schema='envio_linked_cas_'+randomBytes(12).toString('hex'),client=new pg.Client({connectionString:url});await client.connect();let created=false;
 try{
  assert.equal((await client.query('SELECT current_database() name')).rows[0]?.name,'neondb','Root must select the existing isolated neondb test branch; no live app database');
  await client.query(`CREATE SCHEMA "${schema}"`);created=true;const q=scoped(client,schema),time=new Date().toISOString();await fixture(q,time);
  const settings=(await client.query(`SELECT tgname,tgenabled FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ($1::regclass,$2::regclass) ORDER BY tgname`,[schema+'.scanner_checkpoints',schema+'.chain_observations'])).rows;assert.deepEqual(settings,[{tgname:'canonical_reorg',tgenabled:'O'},{tgname:'observer_rewind',tgenabled:'O'}]);
  // The isolated DB and role names intentionally differ from production. This
  // guard reads the real fixture snapshot; production scope validation is covered
  // independently by the linked unit suite and is not weakened in runtime code.
  const guard=async()=>{const s=(await q(linkedCampaignSnapshotSql)).rows[0] as CampaignSnapshot;assert.equal(s.apiRequestForeignKey,true);assert.ok(Object.values(s.children).every(n=>n==='0'));assert.equal(s.prefunding.control.epoch,'4');return s;};
  const before=await guard(),f=campaign(before,time),controlBefore=structuredClone(before.prefunding.control);let durable:LinkedCampaignIntent|undefined,commits=0;
  const c={query:async(sql:string,values:unknown[]=[])=>{const result=await q(sql,values);if(sql==='COMMIT'){commits++;throw Error('SIMULATED_COMMIT_ACK_LOST');}return result;}} as unknown as Pick<pg.PoolClient,'query'>;
  await assert.rejects(publishLinkedCampaign(c,guard,f.journal,H,f.approval,f.candidate,b=>keys.open(b,keyContext),async intent=>{durable=structuredClone(intent);assert.ok(!Object.hasOwn(intent,'retry'));assert.deepEqual((await q(linkedCampaignSnapshotSql)).rows[0].checkpoint,before.checkpoint,'durable intent precedes checkpoint mutation');}),/SIMULATED_COMMIT_ACK_LOST/);assert.equal(commits,1);assert.ok(durable);
  const reader=new pg.Client({connectionString:url});await reader.connect();try{const read=scoped(reader,schema),after=(await read(linkedCampaignSnapshotSql)).rows[0] as CampaignSnapshot,status=(await read('SELECT pg_xact_status($1::xid8) status',[durable!.transactionId])).rows[0].status;assert.equal(status,'committed');assert.equal(classifyLinkedCommit(status,after,durable!),'COMMITTED_EXACT');assert.deepEqual(after.prefunding.control,controlBefore);assert.equal(after.checkpoint.xmin,durable!.expectedXmin);assert.equal(after.checkpoint.height,49676835);assert.equal(after.checkpoint.observedAt,durable!.after.observedAt);assert.equal(digest(after.prefunding.ledger),digest(before.prefunding.ledger));
   await read("UPDATE zee.scanner_checkpoints SET observed_at=observed_at WHERE network='base-sepolia'");const later=(await read(linkedCampaignSnapshotSql)).rows[0] as CampaignSnapshot;assert.notEqual(later.checkpoint.xmin,durable!.expectedXmin);assert.equal(classifyLinkedCommit('committed',later,durable!),'UNKNOWN_OR_INTERVENED_STOP_NO_REPLAY');assert.deepEqual(later.prefunding.control,controlBefore);
   await read('UPDATE zee.runtime_control SET accepting_orders=false WHERE singleton');const controlIntervention=(await read(linkedCampaignSnapshotSql)).rows[0] as CampaignSnapshot;assert.throws(()=>classifyLinkedCommit('committed',controlIntervention,durable!),/CONTROL_OR_FINANCIAL_INTERVENTION/);
  }finally{await reader.end();}
 }finally{await client.query('ROLLBACK').catch(()=>{});if(created)await client.query(`DROP SCHEMA "${schema}" CASCADE`);await client.end();}
});
