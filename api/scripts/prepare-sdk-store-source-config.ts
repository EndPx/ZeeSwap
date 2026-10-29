/** Root artifact preparation only. Does not connect, execute views or start a source. */
import {open,mkdir,lstat,realpath} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {readRootSdkPin,sdkStoreIncarnation,relocatedEnvioGeneration} from '../src/sdk-datastore-relocation.ts';
import {validateEventFirstExportConfig} from '../src/envio-event-first-profile.ts';
import {eventFirstProducerViews} from '../src/integrations/observation/envio-event-first-store.ts';
function need(v:unknown,c:string):asserts v{if(!v)throw Error('SDK_SOURCE_PREPARE_'+c);}
export async function prepareSdkSourceConfig(configPath:string,sha256:string){
 need(process.platform==='linux'&&process.getuid?.()===0&&process.execPath==='/usr/bin/node'&&process.versions.node.split('.')[0]==='24','ROOT_ONLY');const cfg=JSON.parse((await readRootSdkPin({path:configPath,sha256})).toString());
 need(cfg.version===1&&cfg.status==='ROOT_ENVIO_RESTORED_STORE_SOURCE_PREPARATION'&&/^[1-9][0-9]{16,19}$/.test(cfg.systemIdentifier)&&/^\/opt\/zeeswap-testnet\/state\/database-relocation\/sdk-source-[a-z0-9-]+$/.test(cfg.outputDirectory),'CONFIG');
 const original=validateEventFirstExportConfig(JSON.parse((await readRootSdkPin(cfg.originalExportProfile)).toString())),restore=JSON.parse((await readRootSdkPin(cfg.restoreProof)).toString());
 need(restore.version===1&&restore.status==='ROOT_SDK_RESTORE_READBACK_VERIFIED'&&restore.kind==='envio'&&restore.database==='zee_envio_20261023'&&restore.systemIdentifier===cfg.systemIdentifier&&/^[1-9][0-9]{0,9}$/.test(restore.databaseOid),'ACTUAL_RESTORE_READBACK');
 const incarnation=sdkStoreIncarnation(cfg.systemIdentifier,'zee_envio_20261023',original.schema,cfg.restoreProof.sha256,restore.databaseOid),generation=relocatedEnvioGeneration(original.policy.projectionDigest,incarnation),source={...original,generation};need(generation!==original.generation,'NEW_INCARNATION');
 await mkdir(cfg.outputDirectory,{mode:0o700});const d=await lstat(cfg.outputDirectory);need(d.uid===0&&d.isDirectory()&&!d.isSymbolicLink()&&await realpath(cfg.outputDirectory)===cfg.outputDirectory,'DIRECTORY');
 async function save(name:string,bytes:Buffer){const path=cfg.outputDirectory+'/'+name,f=await open(path,'wx',0o640);try{await f.chown(0,978);await f.chmod(0o640);await f.writeFile(bytes);await f.sync();}finally{await f.close();}return{path,sha256:createHash('sha256').update(bytes).digest('hex')};}
 const exportProfile=await save('envio-export-profile.next.private.json',Buffer.from(JSON.stringify(source,null,2)+'\n')),viewsDdl=await save('producer-views.next.sql',Buffer.from(eventFirstProducerViews(source.schema,source.policy,generation)+'\n'));
 const fd=await open(cfg.outputDirectory,'r');try{await fd.sync();}finally{await fd.close();}
 return{status:'SDK_SOURCE_ARTIFACTS_PREPARED',originGeneration:original.generation,generation,storeIncarnation:incarnation,exportProfile,viewsDdl,sqlExecuted:false,sourceStarted:false,financialAction:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){prepareSdkSourceConfig(process.argv[2]!,process.argv[3]!).then(v=>console.log(JSON.stringify(v))).catch(()=>{console.error('SDK_SOURCE_ARTIFACT_PREPARATION_REFUSED');process.exitCode=1;});}
