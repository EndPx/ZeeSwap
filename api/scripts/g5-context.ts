import {open,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {config as dbConfig} from './config.ts';
import {runtime} from './runtime.ts';
import {connect} from '../src/db.ts';
import {BaseContract,loadBaseRegistry} from '../src/base-contract.ts';
import {reverseBaseRegistry} from '../src/reverse-base-rpc.ts';
import {g5Binding,requireG5Target,validateG5State,type G5State} from '../src/g5-run.ts';
import {cleanupG5StartupResources,type G5OwnedLockIdentity} from '../src/g5-reverse-startup.ts';
import {readPrivateJson} from '../src/private-json-read.ts';
export function privateLocalPath(path:string){
 if(process.platform==='win32'&&path.startsWith('/')&&!path.startsWith('//')){
  const mounted=path.match(/^\/mnt\/([a-z])\/(.*)$/);path=mounted?`${mounted[1]}:/${mounted[2]}`:`//wsl.localhost/Ubuntu-24.04${path}`;
 }
 return resolve(path);
}
export const read=(path:string)=>readPrivateJson(privateLocalPath(path));
export async function durable(path:string,value:unknown,exclusive=false){
 path=resolve(path);const tmp=exclusive?path:path+'.'+randomUUID()+'.tmp';const file=await open(tmp,'wx',0o600);
 try{await file.writeFile(JSON.stringify(value,null,2));await file.sync();}finally{await file.close();}
 if(!exclusive)await rename(tmp,path);
 if(process.platform!=='win32'){const dir=await open(dirname(path),'r');try{await dir.sync();}finally{await dir.close();}}
}
export async function g5Context(path:string,create=false){
 const config=await read(path),binding=g5Binding(config);
 process.env.ZEE_DB_CONFIG=resolve(config.databaseConfig);process.env.ZEE_RUNTIME_CONFIG=resolve(config.runtimeConfig);process.env.ZEE_WALLET_CONFIG=resolve(config.walletConfig);
 const target=requireG5Target(dbConfig()),r=await runtime(true);requireG5Target(target,[r.apiUrl,r.workerUrl]);
 if(target.branchId!==config.branchId)throw Error('G5_MANIFEST_DATABASE_TARGET_MISMATCH');
 let state:G5State;try{state=await read(config.stateFile);}catch(e){if(!create||(e as any).code!=='ENOENT')throw e;
  state={version:1,runId:config.runId,binding,openingEventId:randomUUID(),orders:[],...(config.batchSize?{batchSize:config.batchSize,barriers:[]}:{} )};await durable(config.stateFile,state,true);}
 validateG5State(state,config);
 // A stale lock requires operator reconciliation after a process interruption;
 // never silently remove it or race another signer/operator invocation.
 const lockPath=resolve(config.stateFile)+'.lock',lock=await open(lockPath,'wx',0o600);
 let lockIdentity:G5OwnedLockIdentity|undefined;
 const pools:ReturnType<typeof connect>[]=[];
 try{
  const owned=await lock.stat({bigint:true});
  // Keep the identity immediately after exclusive acquisition, before any
  // fallible write/read/constructor can leave startup without a context.
  lockIdentity={dev:owned.dev,ino:owned.ino,birthtimeNs:owned.birthtimeNs};
  await lock.writeFile(JSON.stringify({pid:process.pid,runId:state.runId}));await lock.sync();
  state=await read(config.stateFile);validateG5State(state,config);
  const admin=connect(target.adminUrl,1);pools.push(admin);
  const worker=connect(r.workerUrl);pools.push(worker);
  const api=connect(r.apiUrl);pools.push(api);
  const base=new BaseContract(reverseBaseRegistry(loadBaseRegistry(),config.baseRpcUrl));
  let closed=false;
  return {config,state,target,r,admin,worker,api,base,save:()=>durable(config.stateFile,state),async close(pause=true){if(closed)return;closed=true;
   try{if(pause)await admin.query('UPDATE zee.runtime_control SET accepting_orders=false,dispatch_enabled=false');}
   finally{await cleanupG5StartupResources(pools,{path:lockPath,handle:lock,identity:lockIdentity!});}}};
 }catch(error){
  // No financial command or SQL policy write has run in this constructor.
  // Cleanup refuses any replacement at the path. If identity acquisition
  // itself failed, closing the handle does not authorize deleting a pathname.
  try{await cleanupG5StartupResources(pools,lockIdentity?{path:lockPath,handle:lock,identity:lockIdentity}:undefined);if(!lockIdentity)await lock.close();}
  catch{await lock.close().catch(()=>{});}throw error;
 }
}
