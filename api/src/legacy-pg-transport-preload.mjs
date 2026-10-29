/** NODE_OPTIONS preload for the explicitly inventoried policy-worker process tree.
 * No connection is opened here. Fresh worker is proof-bound passthrough;
 * only the two pinned original native guards receive pg adaptation. */
import {readFile,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname} from 'node:path';
import {isMainThread} from 'node:worker_threads';
import {createLegacyPgAdapters,installLegacyPgAdapters,legacyConnectionMapper} from './legacy-pg-transport-adapter.mjs';
import {validateLegacyPreloadManifest,ORIGIN_PROFILE_SHA,requireLegacyFileEntryArguments} from './legacy-pg-transport-manifest.mjs';
const need=(v,c)=>{if(!v)throw Error('LEGACY_MAIN_PG_PRELOAD_'+c);};
const sha=b=>createHash('sha256').update(b).digest('hex');
async function pinned(p,secret=false){
  need(p?.path?.startsWith('/opt/zeeswap-testnet/')&&!p.path.includes('..')&&/^[a-f0-9]{64}$/.test(p.sha256),'PIN');
  const mask=secret===true?0o077:secret==='shared'?0o027:0o022;
  const s=await lstat(p.path);need(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&mask)===0&&s.size<=16000000&&await realpath(p.path)===p.path,'FILE');
  for(let directory=dirname(p.path);directory.startsWith('/opt/zeeswap-testnet');directory=dirname(directory)){
    const d=await lstat(directory);need(d.isDirectory()&&!d.isSymbolicLink()&&d.uid===0&&(d.mode&0o022)===0&&await realpath(directory)===directory,'DIRECTORY');
    if(directory==='/opt/zeeswap-testnet')break;
  }
  const bytes=await readFile(p.path);need(sha(bytes)===p.sha256,'PIN_CHANGED');return bytes;
}
try {
  need(process.platform==='linux'&&process.getuid?.()===0&&process.versions.node.split('.')[0]==='24','ROOT_NODE24_ONLY');
  need(process.env.ZEESWAP_DATABASE_RUNTIME_MODE==='VPS_PRIMARY_REQUIRED','PRIMARY_MODE_REQUIRED');
  need(!process.env.NODE_PG_FORCE_NATIVE,'NATIVE_DRIVER_ENV_REFUSED');
  const selector={path:process.env.ZEESWAP_LEGACY_PG_PRELOAD_MANIFEST,sha256:process.env.ZEESWAP_LEGACY_PG_PRELOAD_SHA256};
  need(selector.path==='/opt/zeeswap-testnet/state/database-relocation/legacy-pg-preload.private.json','EXPLICIT_MANIFEST');
  const m=JSON.parse((await pinned(selector,'shared')).toString()),self=await realpath(fileURLToPath(import.meta.url)),checked=validateLegacyPreloadManifest(m,self);
  for(const pin of checked.files.values())await pinned(pin);
  const profile=JSON.parse((await pinned(m.operatorProfile,'shared')).toString());
  need(profile.immutable?.runtime?.path===m.originRuntime.path&&profile.immutable.runtime.sha256===m.originRuntime.sha256,'IMMUTABLE_RUNTIME');
  const origin=JSON.parse((await pinned(m.originRuntime,'shared')).toString());
  const kernel=await import(pathToFileURL(checked.app+'/api/src/main-database-relocation.ts').href);
  const loaded=await kernel.loadMainDatabaseTransport(origin,{operatorProfileSha256:ORIGIN_PROFILE_SHA,runtimeSha256:m.originRuntime.sha256}),context=loaded.transport;
  need(context&&context.receipt.executionOverlay.path===selector.path&&context.receipt.executionOverlay.sha256===selector.sha256,'OVERLAY_RECEIPT_PIN');
  let entry;
  if(isMainThread){requireLegacyFileEntryArguments(process.execArgv);need(process.argv[1],'EXPLICIT_ENTRY');const actual=await realpath(process.argv[1]);entry=checked.entries.find(e=>e.path===actual);need(entry,'ENTRY_NOT_ALLOWED');await pinned(entry);}
  const require=createRequire(m.legacyPg.packageJson),pgJson=JSON.parse((await pinned(checked.files.get(m.legacyPg.packageJson))).toString());
  need(pgJson.name==='pg'&&pgJson.version==='8.23.1','PG_8_23_1_REQUIRED');
  need(await realpath(require.resolve('pg'))===m.legacyPg.cjs&&await realpath(dirname(m.legacyPg.cjs)+'/client.js')===m.legacyPg.client&&await realpath(createRequire(m.legacyPg.cjs).resolve('pg-pool'))===m.legacyPg.pool,'ACTUAL_PG_MODULE_BINDING');
  if(!isMainThread){
    // tsx's internal loader worker inherits NODE_OPTIONS. It may parse source,
    // but it must never gain a database connection or a blanket transport bypass.
    const pg=require('pg');class DeniedClient{constructor(){throw Error('LEGACY_MAIN_PG_LOADER_THREAD_DATABASE_REFUSED');}}
    installLegacyPgAdapters(pg,{Client:DeniedClient,Pool:DeniedClient});
  }else if(entry.kind==='legacy'){
    const pg=require('pg'),mapping=legacyConnectionMapper(context,entry.roles);
    const recheck=async()=>{await pinned(selector,'shared');await pinned(entry);await pinned(m.originRuntime,'shared');
      const current=(await kernel.loadMainDatabaseTransport(origin,{operatorProfileSha256:ORIGIN_PROFILE_SHA,runtimeSha256:m.originRuntime.sha256})).transport;
      need(current?.proof.sha256===context.proof.sha256&&current.caPem===context.caPem,'TRANSPORT_CHANGED');};
    const adapters=createLegacyPgAdapters(pg,{...mapping,recheck,verify:async(client,role,raw)=>{
      need(client.connection?.stream?.encrypted===true&&client.connection.stream.authorized===true,'ACTUAL_VERIFIED_TLS_SOCKET');
      await kernel.verifyMainDatabaseClient({query:(...args)=>raw(...args)},context,role);
    }});
    installLegacyPgAdapters(pg,adapters);
  }
} catch(error) {
  const code=/^[A-Z0-9_]+$/.test(error?.message)?error.message:'LEGACY_MAIN_PG_PRELOAD_REFUSED';
  console.error(JSON.stringify({status:'LEGACY_MAIN_PG_PRELOAD_STOPPED',code}));
  process.exit(78);
}
