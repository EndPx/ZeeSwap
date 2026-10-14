import { randomUUID,createHash } from 'node:crypto';
import { readFile,readdir,mkdir,writeFile,unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {execFileSync} from 'node:child_process';
import { connect,transaction } from '../src/db.ts';
import { requireDevelopment } from './config.ts';

/** One run owns one empty database; historical fixture neondb is never reset. */
export async function disposableSettlement(){
 const sourcePath=fileURLToPath(new URL('../../.deploy-local/neon-settlement-tests.json',import.meta.url));
 const source=JSON.parse(await readFile(sourcePath,'utf8'));
 const previous=process.env.ZEE_DB_CONFIG;process.env.ZEE_DB_CONFIG=sourcePath;
 try{requireDevelopment();}finally{if(previous===undefined)delete process.env.ZEE_DB_CONFIG;else process.env.ZEE_DB_CONFIG=previous;}
 if(source.branchId!=='br-wispy-dawn-aorsbba5'||new URL(source.adminUrl).pathname!=='/neondb')throw Error('Dedicated settlement source required');
 const name=`zee_test_${randomUUID().replaceAll('-','')}`;
 const directory=new URL(`../../.deploy-local/settlement-runs/${name}/`,import.meta.url);
 await mkdir(directory,{recursive:true,mode:0o700});
 if(process.platform==='win32'){
  const sid=execFileSync('whoami.exe',['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true}).match(/S-1-5-[0-9-]+/)?.[0];
  if(!sid)throw Error('Current user SID unavailable');
  // Secure the exact new directory before any credential copy is written.
  execFileSync('icacls.exe',[fileURLToPath(directory),'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F'],{stdio:'pipe',windowsHide:true});
 }
 const rewrite=(url:string)=>{const u=new URL(url);u.pathname='/'+name;return u.toString();};
 const manifest=new URL('manifest.json',directory);
 const admin=connect(source.adminUrl,1);
 let created=false,adminClosed=false;
 const closeAdmin=async()=>{if(!adminClosed){adminClosed=true;await admin.end();}};
 const cleanup=async()=>{
  try{
  if(!created)return;
  // Only the exact UUID database created by this invocation is eligible.
  if(!/^zee_test_[0-9a-f]{32}$/.test(name))throw Error('Invalid run database');
  // Pooled endpoints may retain idle server connections after client pools end.
  // FORCE affects this invocation-owned disposable database only.
  await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`).catch(async(error:any)=>{
   await writeFile(manifest,JSON.stringify({database:name,branchId:source.branchId,status:'cleanup_failed',errorCode:error.code??'unknown'},null,2),{mode:0o600});
   console.error(`Disposable cleanup error code: ${error.code??'unknown'}`);throw error;
  });
  created=false;await writeFile(manifest,JSON.stringify({database:name,branchId:source.branchId,status:'removed'},null,2));
  for(const file of ['database.json','runtime.json'])await unlink(new URL(file,directory)).catch(error=>{if(error.code!=='ENOENT')throw error;});
  }finally{await closeAdmin();}
 };
 try{
  const capability=(await admin.query('SELECT rolcreatedb FROM pg_roles WHERE rolname=current_user')).rows[0];
  if(!capability?.rolcreatedb)throw Error('Settlement role cannot create an isolated test database');
  const roles=(await admin.query("SELECT rolname,rolcanlogin FROM pg_roles WHERE rolname IN ('zeeswap_api','zeeswap_worker','zeeswap_reader')")).rows;
  if(roles.length!==3||roles.some((r:any)=>r.rolcanlogin))throw Error('Expected existing NOLOGIN group roles required');
  await writeFile(manifest,JSON.stringify({database:name,branchId:source.branchId,status:'creating'},null,2));
  await admin.query(`CREATE DATABASE "${name}"`);created=true;
  await writeFile(manifest,JSON.stringify({database:name,branchId:source.branchId,status:'created'},null,2));
  const db=connect(rewrite(source.adminUrl),1);
  try{await transaction(db,async c=>{
   await c.query('CREATE TABLE public.zeeswap_migrations (name text PRIMARY KEY,sha256 text NOT NULL,executed_sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())');
   const migrations=new URL('../migrations/',import.meta.url);
   for(const file of (await readdir(migrations)).filter(n=>n.endsWith('.sql')).sort()){
    const sql=await readFile(new URL(file,migrations),'utf8');
    // PostgreSQL roles are cluster-wide and already exist on the dedicated
    // branch. Keep immutable migration files and their hashes unchanged.
    const executable=sql.replace(/^CREATE ROLE (zeeswap_(?:api|worker|reader)) NOLOGIN;\r?$/gm,'');
    const skipped=sql.match(/^CREATE ROLE (zeeswap_(?:api|worker|reader)) NOLOGIN;\r?$/gm)??[];
    if(skipped.length!==(file==='0001_core.sql'?3:0))throw Error('Unexpected migration role rendering');
    await c.query(executable);
    await c.query('INSERT INTO public.zeeswap_migrations(name,sha256,executed_sha256) VALUES($1,$2,$3)',[file,createHash('sha256').update(sql).digest('hex'),createHash('sha256').update(executable).digest('hex')]);
   }
  });}finally{await db.end();}
  const runtime=JSON.parse(await readFile(new URL('../../.deploy-local/neon-settlement-tests-runtime.json',import.meta.url),'utf8'));
  for(const [kind,url] of [['api',runtime.apiUrl],['worker',runtime.workerUrl]] as const){
   const parsed=new URL(url);
   if(parsed.hostname.replace('-pooler.','.')!==new URL(source.adminUrl).hostname||parsed.pathname!=='/neondb')throw Error('Mixed runtime settlement target');
   const membership=(await admin.query('SELECT pg_has_role($1,$2,\'MEMBER\') AS valid',[decodeURIComponent(parsed.username),`zeeswap_${kind}`])).rows[0];
   if(!membership?.valid)throw Error('Runtime role membership missing');
  }
  const configPath=fileURLToPath(new URL('database.json',directory)),runtimePath=fileURLToPath(new URL('runtime.json',directory));
  await writeFile(configPath,JSON.stringify({...source,adminUrl:rewrite(source.adminUrl),testDatabase:name},null,2),{mode:0o600});
  await writeFile(runtimePath,JSON.stringify({...runtime,apiUrl:rewrite(runtime.apiUrl),workerUrl:rewrite(runtime.workerUrl)},null,2),{mode:0o600});
  console.log('Settlement regression uses a new disposable database; retained fixtures are untouched');
  return {configPath,runtimePath,cleanup};
 }catch(error){await cleanup();throw error;}
}
