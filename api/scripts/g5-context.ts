import {readFile,open,rename,unlink} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {config as dbConfig} from './config.ts';
import {runtime} from './runtime.ts';
import {connect} from '../src/db.ts';
import {BaseContract,loadBaseRegistry} from '../src/base-contract.ts';
import {reverseBaseRegistry} from '../src/reverse-base-rpc.ts';
import {g5Binding,requireG5Target,validateG5State,type G5State} from '../src/g5-run.ts';
export const read=async(path:string)=>{
 if(process.platform==='win32'&&path.startsWith('/')&&!path.startsWith('//')){
  const mounted=path.match(/^\/mnt\/([a-z])\/(.*)$/);path=mounted?`${mounted[1]}:/${mounted[2]}`:`//wsl.localhost/Ubuntu-24.04${path}`;
 }
 return JSON.parse(await readFile(resolve(path),'utf8'));
};
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
 let state:G5State;try{state=await read(config.stateFile);}catch(e){if(!create||(e as any).code!=='ENOENT')throw e;
  state={version:1,runId:config.runId,binding,openingEventId:randomUUID(),orders:[]};await durable(config.stateFile,state,true);}
 validateG5State(state,config);
 // A stale lock requires operator reconciliation after a process interruption;
 // never silently remove it or race another signer/operator invocation.
 const lockPath=resolve(config.stateFile)+'.lock',lock=await open(lockPath,'wx',0o600);
 await lock.writeFile(JSON.stringify({pid:process.pid,runId:state.runId}));await lock.sync();
 state=await read(config.stateFile);validateG5State(state,config);
 const admin=connect(target.adminUrl,1),worker=connect(r.workerUrl),api=connect(r.apiUrl),base=new BaseContract(reverseBaseRegistry(loadBaseRegistry(),config.baseRpcUrl));
 return {config,state,target,r,admin,worker,api,base,save:()=>durable(config.stateFile,state),async close(){try{await admin.query('UPDATE zee.runtime_control SET accepting_orders=false,dispatch_enabled=false');}finally{await Promise.all([admin.end(),worker.end(),api.end()]);await lock.close();await unlink(lockPath);}}};
}
