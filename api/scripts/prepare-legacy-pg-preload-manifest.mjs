/** Root-only manifest creation. No database connection, role change or process start. */
import {readFile,lstat,realpath,mkdir,open,chown} from 'node:fs/promises';
import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';import {dirname} from 'node:path';
import {LEGACY_APP,LEGACY_GUARDS,ORIGIN_PROFILE_SHA,validateLegacyPreloadManifest} from '../src/legacy-pg-transport-manifest.mjs';
const need=(v,c)=>{if(!v)throw Error('LEGACY_PRELOAD_PREPARE_'+c);};
const sha=b=>createHash('sha256').update(b).digest('hex');
async function pin(path,shared=false){const s=await lstat(path);need(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&(shared?0o027:0o022))===0&&s.size<=16000000&&await realpath(path)===path,'ROOT_FILE');return{path,sha256:sha(await readFile(path))};}
try{
 need(process.platform==='linux'&&process.getuid?.()===0&&process.versions.node.split('.')[0]==='24','ROOT_NODE24');
 need(!process.env.ZEESWAP_LEGACY_PG_PRELOAD_MANIFEST,'OUTSIDE_WORKER_ENV_ONLY');
 const [commit]=process.argv.slice(2);need(process.argv.length===3&&/^[a-f0-9]{40}$/.test(commit),'EXACT_PUBLIC_COMMIT');
 const script=await realpath(fileURLToPath(import.meta.url)),suffix='/api/scripts/prepare-legacy-pg-preload-manifest.mjs',app=script.slice(0,-suffix.length);need(script.endsWith(suffix),'SCRIPT_PATH');
 const self=app+'/api/src/legacy-pg-transport-preload.mjs',operatorProfile=await pin('/opt/zeeswap-testnet/secrets/linux-operator-profile.private.json',true);need(operatorProfile.sha256===ORIGIN_PROFILE_SHA,'ORIGINAL_PROFILE');
 const profile=JSON.parse(await readFile(operatorProfile.path,'utf8')),originRuntime=await pin(profile.immutable.runtime.path,true);need(originRuntime.sha256===profile.immutable.runtime.sha256,'ORIGINAL_RUNTIME');
 const require=createRequire(LEGACY_APP+'/api/package.json'),packageJson=await realpath(require.resolve('pg/package.json')),cjs=await realpath(require.resolve('pg')),client=await realpath(dirname(cjs)+'/client.js'),pool=await realpath(createRequire(cjs).resolve('pg-pool'));
 need(JSON.parse(await readFile(packageJson,'utf8')).version==='8.23.1','PG_VERSION');
 const legacyPg={packageJson,cjs,client,pool},entries=[{kind:'passthrough',...await pin(app+'/api/scripts/work-linux-testnet-policy.ts')},...await Promise.all(LEGACY_GUARDS.map(async path=>({kind:'legacy',...await pin(path),roles:['zee_app_worker_20261023']})))];
 const paths=[self,app+'/api/src/legacy-pg-transport-adapter.mjs',app+'/api/src/legacy-pg-transport-manifest.mjs',app+'/api/src/main-database-relocation.ts',...entries.map(e=>e.path),...Object.values(legacyPg)];
 const files=await Promise.all([...new Set(paths)].map(path=>pin(path))),manifest={version:1,status:'ROOT_PINNED_LEGACY_MAIN_PG_PRELOAD',publicCommit:commit,operatorProfile,originRuntime,files,entries,legacyPg};validateLegacyPreloadManifest(manifest,self);
 const directory='/opt/zeeswap-testnet/state/database-relocation',path=directory+'/legacy-pg-preload.private.json';let created=false;try{await mkdir(directory,{mode:0o750});created=true;}catch(e){if(e.code!=='EEXIST')throw e;}if(created)await chown(directory,0,978);const d=await lstat(directory);need(d.isDirectory()&&!d.isSymbolicLink()&&d.uid===0&&d.gid===978&&(d.mode&0o777)===0o750&&await realpath(directory)===directory,'DIRECTORY');
 const bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n'),f=await open(path,'wx',0o640);try{await f.chown(0,978);await f.chmod(0o640);await f.writeFile(bytes);await f.sync();}finally{await f.close();}const fd=await open(directory,'r');try{await fd.sync();}finally{await fd.close();}
 console.log(JSON.stringify({status:'ROOT_LEGACY_PRELOAD_MANIFEST_PREPARED',path,sha256:sha(bytes),publicCommit:commit,files:files.length,entries:entries.length,financialAction:false}));
}catch(error){console.error(JSON.stringify({status:'LEGACY_PRELOAD_PREPARATION_STOPPED',code:/^[A-Z0-9_]+$/.test(error?.message)?error.message:'PREPARATION_REFUSED'}));process.exitCode=1;}
