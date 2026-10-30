/** Protected Root metadata publication. Never acquires/restarts a financial worker. */
import {readFile,lstat,open} from 'node:fs/promises';import {createHash} from 'node:crypto';import pg from 'pg';
import {serviceLifetimeInsert,type ServiceLifetimeAuthorization} from '../src/testnet-service-lifetime.ts';
type Pin={path:string;sha256:string};
const need=(v:unknown,c:string)=>{if(!v)throw Error('SERVICE_LIFETIME_OPERATOR_'+c);};
const sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
async function protectedFile(path:string){const st=await lstat(path);need(st.isFile()&&!st.isSymbolicLink()&&st.uid===0&&(st.mode&0o077)===0&&st.size<=1048576,'ROOT_PRIVATE_FILE');return readFile(path);}
async function pin(p:Pin,privateFile=false){const b=await(privateFile?protectedFile(p.path):readFile(p.path));need(sha(b)===p.sha256,'PIN_CHANGED');return b;}
async function save(path:string,v:unknown){const f=await open(path,'wx',0o600);try{await f.writeFile(JSON.stringify(v)+'\n');await f.sync();}finally{await f.close();}const dir=await open(path.slice(0,path.lastIndexOf('/')),'r');try{await dir.sync();}finally{await dir.close();}}
const contextPath=process.argv[2]!,action=process.argv[3];need(action==='publish'||action==='reconcile','ACTION');
const cfg=JSON.parse((await protectedFile(contextPath)).toString()) as {adminUrl:string;caPath:string;systemIdentifier:string;authorization:Pin;migration:Pin;sourceRoot:string;intentPath:string;completedPath:string};
const target=new URL(cfg.adminUrl);need(target.pathname==='/zee_app_20261023'&&decodeURIComponent(target.username)==='zee_app_admin_20261023','ACTUAL_ADMIN_DATABASE');
const c=new pg.Client({host:target.hostname,port:Number(target.port||5432),database:target.pathname.slice(1),user:decodeURIComponent(target.username),password:decodeURIComponent(target.password),ssl:{rejectUnauthorized:true,servername:target.hostname,ca:await readFile(cfg.caPath,'utf8')},connectionTimeoutMillis:15000,statement_timeout:30000});
await c.connect();
try{
 need(typeof cfg.systemIdentifier==='string'&&/^[1-9][0-9]*$/.test(cfg.systemIdentifier)&&(await c.query('SELECT (pg_control_system()).system_identifier::text id')).rows[0]?.id===cfg.systemIdentifier,'DATABASE_SYSTEM_IDENTITY');
 const raw=await pin(cfg.authorization,true),a=JSON.parse(raw.toString()) as ServiceLifetimeAuthorization;
 if(action==='reconcile'){
  const i=JSON.parse((await protectedFile(cfg.intentPath)).toString());need(i.authorizationSha256===cfg.authorization.sha256&&i.policySha256===a.policySha256,'ORIGINAL_INTENT');
  const status=(await c.query('SELECT pg_xact_status($1::xid8) status',[i.transactionId])).rows[0]?.status;
  const row=(await c.query("SELECT created_xid::text,encode(authorization_sha256,'hex') authorization FROM zee.testnet_service_lifetime_authorizations WHERE policy_sha256=$1",[Buffer.from(a.policySha256,'hex')])).rows[0];
  need(status==='committed'&&row?.created_xid===i.transactionId&&row?.authorization===cfg.authorization.sha256,'ORIGINAL_XID_NOT_COMMITTED_EXACT_DO_NOT_REPLAY');
  console.log(JSON.stringify({status:'SERVICE_LIFETIME_COMMITTED_EXACT',transactionId:i.transactionId,financialAction:false,replayed:false}));
 }else{
  const insert=serviceLifetimeInsert(a,raw),migration=await pin(cfg.migration);let commitSent=false;
  await c.query('BEGIN');try{
   await c.query("SET LOCAL statement_timeout='30000ms'");await c.query("SET LOCAL lock_timeout='5000ms'");await c.query("SET LOCAL idle_in_transaction_session_timeout='30000ms'");await c.query('SELECT zee.lock_observer_cycle()');
   need((await c.query('SELECT current_user role,current_database() db')).rows[0].role==='zee_app_admin_20261023','OWNER');
   for(const[file,name]of[['0020_bounded_testnet_service_policy.sql','testnet_policy_gate'],['0030_testnet_policy_successor.sql','testnet_policy_availability']]){
    const source=(await readFile(cfg.sourceRoot+'/api/migrations/'+file,'utf8')).replace(/\r\n/g,'\n'),match=source.match(new RegExp('CREATE (?:OR REPLACE )?FUNCTION zee\\.'+name+'\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;'));
    const actual=(await c.query('SELECT prosrc,prosecdef,proconfig,pg_get_userbyid(proowner) owner FROM pg_proc WHERE oid=$1::regprocedure',['zee.'+name+'(zee.digest)'])).rows[0];
    need(match&&actual?.prosrc.replace(/\r\n/g,'\n')===match[1]&&actual.prosecdef&&actual.owner==='zee_app_admin_20261023'&&actual.proconfig?.length===1&&actual.proconfig[0].replace(/ /g,'')==='search_path=pg_catalog,zee','ORIGINAL_FUNCTION_BASELINE');
   }
   async function financial(){const tables=(await c.query("SELECT tablename FROM pg_tables WHERE schemaname='zee' AND tablename<>'testnet_service_lifetime_authorizations' ORDER BY tablename")).rows;const state=[];for(const {tablename}of tables){need(/^[a-z0-9_]+$/.test(tablename),'TABLE_NAME');state.push({table:tablename,...(await c.query(`SELECT count(*)::text rows,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),''),'UTF8')),'hex') digest FROM zee.${tablename} t`)).rows[0]});}return sha(JSON.stringify(state));}
   const before=await financial(),xid=(await c.query('SELECT pg_current_xact_id()::text xid')).rows[0].xid;
   await save(cfg.intentPath,{version:1,purpose:'ROOT_TESTNET_SERVICE_NO_EXPIRY_ORIGINAL_INTENT',transactionId:xid,authorizationSha256:cfg.authorization.sha256,migrationSha256:cfg.migration.sha256,policySha256:a.policySha256,control:{epoch:a.activeEpoch,xmin:a.controlXmin},originalExpiry:a.originalExpiresAt,originalActivationXid:a.originalActivationXid,beforeDigest:before,financialAction:false});
   await c.query(migration.toString());await c.query(insert.sql,insert.args);need(await financial()===before,'FINANCIAL_OR_RUNTIME_MUTATION');
   await pin(cfg.authorization,true);await pin(cfg.migration);serviceLifetimeInsert(a,raw);
   commitSent=true;await c.query('COMMIT');
   const result={version:1,status:'SERVICE_LIFETIME_COMMITTED_EXACT',transactionId:xid,authorizationSha256:cfg.authorization.sha256,policySha256:a.policySha256,beforeDigest:before,afterDigest:before,financialAction:false,workerRestarted:false,controlChanged:false};await save(cfg.completedPath,result);console.log(JSON.stringify(result));
  }catch(e){if(!commitSent)await c.query('ROLLBACK').catch(()=>{});else console.error('SERVICE_LIFETIME_COMMIT_SENT_RECONCILE_ORIGINAL_INTENT_DO_NOT_REPLAY');throw e;}
 }
}finally{await c.end();}
