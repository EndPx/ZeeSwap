import pg from 'pg';
import {lstat} from 'node:fs/promises';
import {pinnedFile,type FilePin} from './adapters/profile.ts';

export type BridgeDatabaseTransport={kind:'VPS_POSTGRESQL_PRIMARY';systemIdentifier:'7701863382450487342';ca:FilePin;tlsServerName:string};
/** Dedicated bridge primary; no Neon fallback or global Main transport change. */
export async function connectBridgeDatabase(url:string,transport:BridgeDatabaseTransport,max=2):Promise<pg.Pool>{
 const parsed=new URL(url);
 if(!transport||transport.kind!=='VPS_POSTGRESQL_PRIMARY'||transport.systemIdentifier!=='7701863382450487342'||!['postgres:','postgresql:'].includes(parsed.protocol)||parsed.hostname!=='127.0.0.1'||parsed.port!=='55435'||decodeURIComponent(parsed.pathname.slice(1))!=='zee_bridge_20261029'||decodeURIComponent(parsed.username)!=='zee_bridge_runtime_20261029'||parsed.search||!transport.tlsServerName||!/^[a-zA-Z0-9.-]{1,253}$/.test(transport.tlsServerName)||transport.ca.path!=='/opt/zeeswap-bridge-testnet/private/postgres-ca.pem')throw Error('BRIDGE_LOCAL_PRIMARY_TRANSPORT_REQUIRED');
 const certStat=await lstat(transport.ca.path);if(certStat.uid!==0||certStat.gid!==977||(certStat.mode&0o777)!==0o640)throw Error('BRIDGE_PRIMARY_CA_OWNERSHIP');const ca=await pinnedFile(transport.ca);
 const pool=new pg.Pool({host:'127.0.0.1',port:55435,database:'zee_bridge_20261029',user:'zee_bridge_runtime_20261029',password:decodeURIComponent(parsed.password),max,ssl:{rejectUnauthorized:true,ca:ca.toString(),servername:transport.tlsServerName,minVersion:'TLSv1.2'},connectionTimeoutMillis:15000,idleTimeoutMillis:10000,statement_timeout:15000,application_name:'zeeswap-bridge-primary'});
 pool.on('error',()=>console.error('BRIDGE_PRIMARY_IDLE_CONNECTION_CLOSED'));
 const acquire=pool.connect.bind(pool),verified=new WeakSet<object>();
 const identity="SELECT current_database() AS database,current_user AS role,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,(SELECT system_identifier::text FROM pg_control_system()) AS system_identifier";
 pool.connect=((callback?:any)=>{
  const run=(done:any)=>acquire((error,client,release)=>{
   if(error||!client){done(error);return;}
   const proof=verified.has(client)?Promise.resolve():client.query(identity).then(result=>{const r=result.rows[0];if(r?.database!=='zee_bridge_20261029'||r.role!=='zee_bridge_runtime_20261029'||r.tls!==true||r.system_identifier!==transport.systemIdentifier)throw Error('BRIDGE_PRIMARY_IDENTITY_MISMATCH');verified.add(client);});
   proof.then(()=>done(undefined,client,release),failure=>{release(failure);done(Error('BRIDGE_PRIMARY_VERIFICATION_FAILED'));});
  });if(callback){run(callback);return;}return new Promise<pg.PoolClient>((resolve,reject)=>run((e:any,c:pg.PoolClient)=>e?reject(e):resolve(c)));
 }) as typeof pool.connect;
 try{
  await pool.query('SELECT 1');return pool;
 }catch{await pool.end();throw Error('BRIDGE_PRIMARY_VERIFICATION_FAILED');}
}
