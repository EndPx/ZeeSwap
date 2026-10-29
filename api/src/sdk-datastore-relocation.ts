/** Explicit SDK physical-store relocation. No reset, DDL, cursor alias or finance. */
import {readFile,lstat,realpath} from 'node:fs/promises';import {createHash} from 'node:crypto';
import type {EventFirstExportConfig} from './envio-event-first-profile.ts';
type Pin={path:string;sha256:string};
type Snapshot={semanticSha256:string;entitiesSha256:string;progressSha256:string;schemaSha256:string;schemaAclSha256:string;tableCount:number};
type Checkpoint={height:number;hash:string};
export type SdkDatastoreRelocationReceipt={version:1;status:'ROOT_SDK_DATASTORES_RELOCATED_EXACT';financialAction:false;publicCommit:string;operatorProfileSha256:string;
 destination:{kind:'VPS_POSTGRESQL_PRIMARY';systemIdentifier:string;serverVersionNum:180006;identityGrantSha256:string};ca:Pin;originClassifications:Pin;
 envio:{database:'zee_envio_20261023';schema:'envio_live_final';databaseOid:string;originHost:string;profileSha256:string;originalExportProfileSha256:string;originGeneration:string;originRevision:string;projectionDigest:string;registryDigest:string;policySha256:string;origin:Snapshot;restored:Snapshot;restoreProof:Pin;storeIncarnation:string;generation:string;viewsDdl:Pin;exportProfile:Pin;exportCredential:Pin;engineReaderCredential:Pin;engineEnvironment:Pin};
 chef:{database:'zee_chef_20261023';databaseOid:string;originHost:string;originDatabaseUrlSha256:string;project:string;schema:string;fingerprint:string;generation:string;revision:string;checkpoint:Checkpoint;tokenSha256:string;revisionTriggerSha256:string;origin:Snapshot;restored:Snapshot;restoreProof:Pin;storeIncarnation:string;credential:Pin};verifiedAt:string};
const digest=(v:unknown)=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(sort(v))).digest('hex');
export const sdkCanonicalDigest=(v:unknown)=>digest(v);
function sort(v:any):any{return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;}
const same=(a:unknown,b:unknown)=>JSON.stringify(sort(a))===JSON.stringify(sort(b));
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)&&v!=='0'.repeat(64);
function need(v:unknown,c:string):asserts v{if(!v)throw Error('SDK_DATASTORE_RELOCATION_'+c);}
function pinShape(p:Pin){need(p?.path?.startsWith('/opt/zeeswap-testnet/')&&!p.path.includes('..')&&!p.path.includes('\\')&&hash(p.sha256),'PIN');}
export function sdkStoreIncarnation(systemIdentifier:string,database:string,schema:string,restoreProofSha256:string,databaseOid:string){return digest({recipe:'postgres-sdk-physical-store-v1',systemIdentifier,database,databaseOid,schema,restoreProofSha256});}
export function relocatedEnvioGeneration(projectionDigest:string,storeIncarnation:string){return 'envio314-event-first-'+projectionDigest.slice(0,24)+'-store-'+storeIncarnation.slice(0,24);}
export function validateSdkDatastoreRelocation(r:SdkDatastoreRelocationReceipt){
 need(r?.version===1&&r.status==='ROOT_SDK_DATASTORES_RELOCATED_EXACT'&&r.financialAction===false&&/^[a-f0-9]{40}$/.test(r.publicCommit)&&r.operatorProfileSha256==='76711023c2313cf7e1e30382ea1591f5ff7721b56f68b3094ad7dd0f92ff8251','ROOT_SCOPE');
 need(r.destination?.kind==='VPS_POSTGRESQL_PRIMARY'&&r.destination.serverVersionNum===180006&&hash(r.destination.identityGrantSha256)&&/^[1-9][0-9]{16,19}$/.test(r.destination.systemIdentifier)&&BigInt(r.destination.systemIdentifier)<=18446744073709551615n,'DESTINATION');
 pinShape(r.ca);need(r.ca.path==='/opt/zeeswap-testnet/secrets/app-postgres-ca.pem','CA_PATH');pinShape(r.originClassifications);
 const e=r.envio,c=r.chef;
 need(e?.database==='zee_envio_20261023'&&/^[1-9][0-9]{0,9}$/.test(e.databaseOid)&&e.schema==='envio_live_final'&&typeof e.originHost==='string'&&e.originHost.endsWith('.neon.tech')&&[e.profileSha256,e.originalExportProfileSha256,e.projectionDigest,e.registryDigest,e.policySha256].every(hash)&&/^[A-Za-z0-9_-]{1,100}$/.test(e.originGeneration)&&/^[1-9][0-9]*$/.test(e.originRevision),'ENVIO_ORIGIN');
 for(const p of[e.restoreProof,e.viewsDdl,e.exportProfile,e.exportCredential,e.engineReaderCredential,e.engineEnvironment])pinShape(p);
 need(e.storeIncarnation===sdkStoreIncarnation(r.destination.systemIdentifier,e.database,e.schema,e.restoreProof.sha256,e.databaseOid)&&e.generation===relocatedEnvioGeneration(e.projectionDigest,e.storeIncarnation)&&e.generation!==e.originGeneration,'ENVIO_NEW_INCARNATION_REQUIRED');
 need(c?.database==='zee_chef_20261023'&&/^[1-9][0-9]{0,9}$/.test(c.databaseOid)&&typeof c.originHost==='string'&&c.originHost.endsWith('.neon.tech')&&hash(c.originDatabaseUrlSha256)&&/^[a-z][a-z0-9_]{0,31}$/.test(c.project)&&c.schema==='chef_'+c.project&&hash(c.fingerprint)&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(c.generation)&&/^(0|[1-9][0-9]*)$/.test(c.revision)&&Number.isSafeInteger(c.checkpoint?.height)&&c.checkpoint.height>=0&&hash(c.checkpoint.hash)&&hash(c.tokenSha256)&&hash(c.revisionTriggerSha256),'CHEF_LOGICAL_COUNTER_IDENTITY');
 pinShape(c.restoreProof);pinShape(c.credential);need(c.storeIncarnation===sdkStoreIncarnation(r.destination.systemIdentifier,c.database,c.schema,c.restoreProof.sha256,c.databaseOid),'CHEF_PHYSICAL_STORE');
 for(const s of[e,c]){need(s.origin&&s.restored&&same(s.origin,s.restored)&&Number.isSafeInteger(s.origin.tableCount)&&s.origin.tableCount>0&&['semanticSha256','entitiesSha256','progressSha256','schemaSha256','schemaAclSha256'].every(k=>hash(s.origin[k as keyof Snapshot])),'RESTORED_SDK_STATE');}
 need(Number.isFinite(Date.parse(r.verifiedAt))&&Date.parse(r.verifiedAt)<=Date.now(),'ISSUANCE');return r;
}
export async function readRootSdkPin(p:Pin){pinShape(p);const s=await lstat(p.path);need(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&s.gid===978&&(s.mode&0o027)===0&&s.size<=16000000&&await realpath(p.path)===p.path,'ROOT_FILE');const b=await readFile(p.path);need(createHash('sha256').update(b).digest('hex')===p.sha256,'RAW_PIN');return b;}
export async function loadSdkDatastoreReceipt(){
 const path=process.env.ZEESWAP_SDK_DATASTORE_RELOCATION_PROOF,sha256=process.env.ZEESWAP_SDK_DATASTORE_RELOCATION_SHA256;
 need(process.env.ZEESWAP_SDK_DATASTORE_MODE===undefined||process.env.ZEESWAP_SDK_DATASTORE_MODE==='VPS_PRIMARY_REQUIRED','MODE');
 need(Boolean(path)===Boolean(sha256),'SELECTOR_PAIR');if(!path){need(process.env.ZEESWAP_SDK_DATASTORE_MODE!=='VPS_PRIMARY_REQUIRED'&&process.env.ZEESWAP_DATABASE_RUNTIME_MODE!=='VPS_PRIMARY_REQUIRED','PRIMARY_PROOF_REQUIRED');return undefined;}
 need(path==='/opt/zeeswap-testnet/state/database-relocation/sdk-stores.private.json'&&hash(sha256),'SELECTOR');const proof={path,sha256:sha256!},receipt=validateSdkDatastoreRelocation(JSON.parse((await readRootSdkPin(proof)).toString()));
 const caPem=(await readRootSdkPin(receipt.ca)).toString();need(caPem.includes('-----BEGIN CERTIFICATE-----')&&!caPem.includes('PRIVATE KEY'),'CA_ONLY');
 const classifications=JSON.parse((await readRootSdkPin(receipt.originClassifications)).toString());validateSdkOriginClassifications(classifications,receipt);
 for(const kind of['envio','chef']as const){const body=JSON.parse((await readRootSdkPin(receipt[kind].restoreProof)).toString());validateSdkRestoreReadback(body,receipt,kind);}
 return{receipt,proof,caPem};
}
export function validateSdkRestoreReadback(body:any,r:SdkDatastoreRelocationReceipt,kind:'envio'|'chef'){
 need(body?.version===1&&body.status==='ROOT_SDK_RESTORE_READBACK_VERIFIED'&&body.kind===kind&&body.database===r[kind].database&&body.systemIdentifier===r.destination.systemIdentifier&&body.databaseOid===r[kind].databaseOid&&same(body.snapshot,r[kind].restored),'RESTORE_READBACK_PIN');
 if(kind==='chef')need(same(body.logical,{generation:r.chef.generation,revision:r.chef.revision,checkpoint:r.chef.checkpoint,fingerprint:r.chef.fingerprint,tokenSha256:r.chef.tokenSha256,revisionTriggerSha256:r.chef.revisionTriggerSha256}),'CHEF_RESTORE_LOGICAL_BASELINE');return body;
}
export function validateSdkOriginClassifications(body:any,r:SdkDatastoreRelocationReceipt){
 need(body?.version===1&&body.status==='ROOT_SDK_ORIGIN_TRANSACTIONS_ARCHIVED'&&body.destinationSystemIdentifier===r.destination.systemIdentifier&&Array.isArray(body.records)&&body.records.length<=128,'ORIGIN_CLASSIFICATIONS');
 const keys=new Set<string>();for(const row of body.records){need(['envio','chef'].includes(row.kind)&&row.database===r[row.kind as 'envio'|'chef'].database&&row.host===r[row.kind as 'envio'|'chef'].originHost&&/^[1-9][0-9]*$/.test(row.transactionId)&&['committed','aborted'].includes(row.status)&&hash(row.intentSha256)&&(row.completedSha256===null||hash(row.completedSha256))&&!keys.has(row.database+':'+row.transactionId),'ORIGIN_CLASSIFICATION_ROW');keys.add(row.database+':'+row.transactionId);}return body;
}
export function archivedSdkOriginTransaction(body:any,r:SdkDatastoreRelocationReceipt,q:{kind:'envio'|'chef';transactionId:string;intentSha256:string;completedSha256:string|null}){
 validateSdkOriginClassifications(body,r);const row=body.records.find((x:any)=>x.kind===q.kind&&x.transactionId===q.transactionId);need(row&&row.intentSha256===q.intentSha256&&row.completedSha256===q.completedSha256,'ARCHIVED_XID_BINDING');return{scope:'ARCHIVED_ORIGIN_SDK_CLUSTER' as const,originHost:row.host,originDatabase:row.database,transactionId:row.transactionId,status:row.status,destinationSystemIdentifier:r.destination.systemIdentifier};
}
export function sdkDestinationUrl(value:string,r:SdkDatastoreRelocationReceipt,kind:'envio-export'|'envio-export-docker'|'envio-engine'|'chef'){
 const u=new URL(value),role=kind.startsWith('envio-export')?'zee_envio_export_20261023':kind==='envio-engine'?'zee_envio_owner_20261023':'zee_chef_owner_20261023',database=kind==='chef'?r.chef.database:r.envio.database;
 need([...u.searchParams.keys()].every(k=>['sslmode','sslrootcert'].includes(k)&&u.searchParams.getAll(k).length===1),'TARGET_URL_OPTIONS');
 const endpoint=kind==='envio-export'?u.hostname==='127.0.0.1'&&u.port==='55435':['postgres','zeeswap-app-postgres-v1'].includes(u.hostname)&&u.port==='5432';
 need(u.protocol==='postgresql:'&&endpoint&&u.pathname==='/'+database&&decodeURIComponent(u.username)===role&&u.password.length>0&&u.searchParams.get('sslmode')==='verify-full'&&(!u.searchParams.has('sslrootcert')||u.searchParams.get('sslrootcert')===r.ca.path)&&(kind!=='chef'||u.searchParams.get('sslrootcert')===r.ca.path),'EXACT_EFFECTIVE_ENDPOINT');return u;
}
export function sdkPoolOptions(value:string,r:SdkDatastoreRelocationReceipt,kind:Parameters<typeof sdkDestinationUrl>[2],caPem:string){const u=sdkDestinationUrl(value,r,kind);return{host:u.hostname,port:Number(u.port),database:decodeURIComponent(u.pathname.slice(1)),user:decodeURIComponent(u.username),password:decodeURIComponent(u.password),ssl:{rejectUnauthorized:true,servername:u.hostname,ca:caPem},max:1,connectionTimeoutMillis:5000};}
export function bindEnvioDatastoreRelocation(original:EventFirstExportConfig,r:SdkDatastoreRelocationReceipt,expected:{operatorProfileSha256:string;profileSha256:string;registryDigest:string;originalExportProfileSha256:string;originCredential?:{databaseUrl:string};mainDestinationSystemIdentifier?:string}){
 validateSdkDatastoreRelocation(r);const e=r.envio;need(r.operatorProfileSha256===expected.operatorProfileSha256&&e.profileSha256===expected.profileSha256&&e.originalExportProfileSha256===expected.originalExportProfileSha256&&e.originGeneration===original.generation&&e.projectionDigest===original.policy.projectionDigest&&e.registryDigest===original.policy.registryDigest&&e.registryDigest===expected.registryDigest&&digest(original.policy)===e.policySha256&&original.schema===e.schema,'ORIGIN_SELECTED_SOURCE');
 if(expected.mainDestinationSystemIdentifier)need(r.destination.systemIdentifier===expected.mainDestinationSystemIdentifier,'SAME_PRIMARY_CLUSTER');
 if(expected.originCredential){const u=new URL(expected.originCredential.databaseUrl);need(u.hostname===e.originHost&&u.pathname==='/'+e.database&&decodeURIComponent(u.username)==='zee_envio_export_20261023','ORIGIN_EXPORT_CREDENTIAL');}
 return{...structuredClone(original),generation:e.generation};
}
export async function loadEnvioDatastoreRelocation(original:EventFirstExportConfig,expected:Parameters<typeof bindEnvioDatastoreRelocation>[2]){
 const loaded=await loadSdkDatastoreReceipt();if(!loaded)return undefined;const source=bindEnvioDatastoreRelocation(original,loaded.receipt,expected),r=loaded.receipt;
 const staged=JSON.parse((await readRootSdkPin(r.envio.exportProfile)).toString());need(same(staged,source),'EFFECTIVE_EXPORT_CONFIG');
 const credential=JSON.parse((await readRootSdkPin(r.envio.exportCredential)).toString());need(Object.keys(credential).join(',')==='databaseUrl'&&typeof credential.databaseUrl==='string','EXPORT_CREDENTIAL_SHAPE');sdkDestinationUrl(credential.databaseUrl,r,'envio-export');
 return{source,credential,caPem:loaded.caPem,relocation:{receipt:r,proof:loaded.proof,storeIncarnation:r.envio.storeIncarnation,originGeneration:r.envio.originGeneration}};
}
export async function loadEnvioProducerDatastoreRelocation(source:EventFirstExportConfig,profileSha256:string){
 const loaded=await loadSdkDatastoreReceipt();if(!loaded)return undefined;const r=loaded.receipt;need(r.envio.exportProfile.sha256===profileSha256&&source.generation===r.envio.generation&&source.schema===r.envio.schema&&source.policy.projectionDigest===r.envio.projectionDigest&&source.policy.registryDigest===r.envio.registryDigest&&digest(source.policy)===r.envio.policySha256,'PRODUCER_CONFIG');need(same(JSON.parse((await readRootSdkPin(r.envio.exportProfile)).toString()),source),'PRODUCER_CONFIG_BYTES');
 const credential=JSON.parse((await readRootSdkPin(r.envio.exportCredential)).toString());need(Object.keys(credential).join(',')==='databaseUrl'&&typeof credential.databaseUrl==='string','EXPORT_CREDENTIAL_SHAPE');sdkDestinationUrl(credential.databaseUrl,r,'envio-export');return{...loaded,credential};
}
export async function verifySdkDatastoreClient(client:{query:(sql:string,args?:unknown[])=>Promise<{rows:any[]}>},r:SdkDatastoreRelocationReceipt,kind:'envio'|'chef',role:string){
 const allowed=kind==='envio'?['zee_envio_export_20261023','zee_envio_owner_20261023']:['zee_chef_owner_20261023'];need(allowed.includes(role),'ROLE');
 const row=(await client.query(`SELECT current_database() database,(SELECT oid::text FROM pg_database WHERE datname=current_database()) "databaseOid",current_user role,current_setting('server_version_num')::integer "serverVersionNum",(SELECT system_identifier::text FROM pg_control_system()) "systemIdentifier",COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),false) ssl,(SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname=current_user) elevated`)).rows[0];
 need(row?.database===r[kind].database&&row.databaseOid===r[kind].databaseOid&&row.role===role&&row.serverVersionNum===180006&&row.systemIdentifier===r.destination.systemIdentifier&&row.ssl===true&&row.elevated===false,'ACTUAL_PHYSICAL_STORE');return row;
}
export function fenceSdkDatastorePool(pool:any,r:SdkDatastoreRelocationReceipt,kind:'envio'|'chef',role:string){
 const original=pool.connect.bind(pool),verified=new WeakSet<object>();
 pool.connect=(callback?:any)=>{const run=(done:any)=>original((error:any,client:any,release:any)=>{if(error||!client){done(error);return;}const check=verified.has(client)?Promise.resolve():verifySdkDatastoreClient(client,r,kind,role).then(()=>{verified.add(client);});check.then(()=>done(undefined,client,release),failure=>{release(failure);done(failure);});});if(callback){run(callback);return;}return new Promise((resolve,reject)=>run((error:any,client:any)=>error?reject(error):resolve(client)));};return pool;
}
export function bindChefDatastoreRelocation(r:SdkDatastoreRelocationReceipt,expected:{project:string;fingerprint:string;databaseUrl:string}){
 validateSdkDatastoreRelocation(r);need(r.chef.project===expected.project&&r.chef.fingerprint===expected.fingerprint,'CHEF_PROJECT_PRESERVED');sdkDestinationUrl(expected.databaseUrl,r,'chef');return r.chef;
}
export async function loadChefDatastoreRelocation(expected:Parameters<typeof bindChefDatastoreRelocation>[1]){
 const loaded=await loadSdkDatastoreReceipt();need(loaded,'CHEF_PROOF_REQUIRED');bindChefDatastoreRelocation(loaded.receipt,expected);const credential=JSON.parse((await readRootSdkPin(loaded.receipt.chef.credential)).toString());need(Object.keys(credential).join(',')==='databaseUrl'&&credential.databaseUrl===expected.databaseUrl,'CHEF_CREDENTIAL_PIN');return loaded;
}
export async function verifyChefLogicalStore(client:{query:(sql:string,args?:unknown[])=>Promise<{rows:any[]}>},r:SdkDatastoreRelocationReceipt){
 const c=r.chef;const row=(await client.query(`SELECT generation,data_revision::text revision,fingerprint FROM "${c.schema}".state WHERE singleton=true`)).rows[0];need(row?.generation===c.generation&&row.fingerprint===c.fingerprint&&/^(0|[1-9][0-9]*)$/.test(row.revision)&&BigInt(row.revision)>=BigInt(c.revision),'CHEF_LOGICAL_REVISION_PRESERVED');
 const fn=(await client.query('SELECT pg_get_functiondef($1::regprocedure) definition',[c.schema+'.advance_revision()'])).rows[0];need(typeof fn?.definition==='string'&&digest(fn.definition)===c.revisionTriggerSha256,'CHEF_REVISION_TRIGGER');
 const trigger=(await client.query(`SELECT tgenabled,tgfoid=$1::regprocedure correct FROM pg_trigger WHERE tgrelid=$2::regclass AND tgname='chef_revision' AND NOT tgisinternal`,[c.schema+'.advance_revision()',c.schema+'.state'])).rows;need(trigger.length===1&&trigger[0].tgenabled==='O'&&trigger[0].correct===true,'CHEF_REVISION_TRIGGER');return row;
}
