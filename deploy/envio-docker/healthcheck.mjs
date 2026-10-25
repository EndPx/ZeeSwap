import {readFile,lstat} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {loadConfig,exportInputs,validateSourceCheckpoint,need,API} from './config.mjs';
export async function processIdentity(pid){const raw=await readFile('/proc/'+pid+'/stat','utf8'),fields=raw.slice(raw.lastIndexOf(')')+2).split(' ');need(fields[0]!=='Z'&&fields[0]!=='X','CHILD_NOT_LIVE');return{start:fields[19],group:Number(fields[2])};}
export async function boundedJson(response){need(response.body,'EXPORT_EMPTY_BODY');const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';try{for(;;){const r=await reader.read();if(r.done)break;bytes+=r.value.byteLength;need(bytes<=65536,'EXPORT_BODY_BOUND');text+=decoder.decode(r.value,{stream:true});}text+=decoder.decode();return JSON.parse(text);}catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}}
export async function readCheckpoint(pool,cfg,profile){
 const c=await pool.connect();try{
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query("SET LOCAL statement_timeout='3000ms'");await c.query("SET LOCAL idle_in_transaction_session_timeout='5000ms'");
  const r=(await c.query("SELECT current_database() db,current_user role,rolsuper,rolcreatedb,rolcreaterole,rolreplication,has_schema_privilege(current_user,'envio_live_final','CREATE') writable FROM pg_roles WHERE rolname=current_user")).rows;
  need(r.length===1&&r[0].db==='zee_envio_20261023'&&r[0].role==='zee_envio_export_20261023'&&['rolsuper','rolcreatedb','rolcreaterole','rolreplication','writable'].every(k=>r[0][k]===false),'READONLY_HEALTH_ROLE');
  const rights=(await c.query("SELECT bool_or(has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')) writable FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='envio_live_final' AND c.relkind IN ('r','v','m','p')")).rows;
  need(rights.length===1&&rights[0].writable===false,'READONLY_HEALTH_TABLE_RIGHTS');
  const rows=(await c.query("SELECT payload FROM envio_live_final.zee_checkpoint WHERE stream_id='base-v1'")).rows;need(rows.length===1&&rows[0].payload.registryDigest===profile.policy.registryDigest,'SOURCE_REGISTRY');const result=validateSourceCheckpoint(rows[0].payload);await c.query('COMMIT');return result;
 }finally{await c.query('ROLLBACK').catch(()=>{});c.release();}
}
export async function main(component){
 try{await lstat('/runstate/fatal.private.json');throw Error('FATAL_LATCH');}catch(e){if(e.code!=='ENOENT')throw e;}
 const cfg=await loadConfig(component,process.env,false),s=await lstat('/runstate/health.private.json');need(s.isFile()&&!s.isSymbolicLink()&&s.uid===986&&(s.mode&0o777)===0o600&&s.size<=16384,'HEALTH_STATE');
 const state=JSON.parse(await readFile('/runstate/health.private.json','utf8'));need(state.component===component&&state.configSha256===process.env.ENVIO_DOCKER_CONFIG_SHA256&&state.status==='CHILD_RUNNING'&&Date.now()-state.at>=0&&Date.now()-state.at<=20000&&Number.isSafeInteger(state.pid)&&state.pid>1,'CHILD_HEARTBEAT');
 const actual=await processIdentity(state.pid);need(actual.start===state.start&&actual.group===state.pid,'CHILD_IDENTITY');
 const input=await exportInputs(cfg),{Pool}=createRequire(API+'/package.json')('pg'),pool=new Pool({connectionString:input.credential.databaseUrl,max:1,connectionTimeoutMillis:3000});
 try{const facts=await readCheckpoint(pool,cfg,input.profile);if(component==='export'){
   const response=await fetch('http://127.0.0.1:8099/zee-observation/status',{headers:{authorization:'Bearer '+input.token},redirect:'error',signal:AbortSignal.timeout(3000)});need(response.ok,'EXPORT_HTTP_UNREADY');const body=await boundedJson(response);need(body.protocol==='zee-envio-status-v1','EXPORT_HTTP_PROTOCOL');validateSourceCheckpoint(body.checkpoint);
  }return facts;}finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main(process.argv[2]).then(()=>console.log('ENVIO_SOURCE_HEALTHY')).catch(()=>{console.error('ENVIO_SOURCE_UNHEALTHY');process.exitCode=1;});
