import {readFile} from 'node:fs/promises';
import {isAbsolute,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {connect} from '../src/db.ts';
import {PrivateData} from '../src/private-data.ts';
import {BaseContract,type BaseRegistry} from '../src/base-contract.ts';
import {LocalBaseSigner} from '../src/base-signer.ts';
import {dispatchBaseOnce,reconcileBaseReceipts} from '../src/base-settlement.ts';
import {LIVE_DISPATCH_SCOPE,validateLiveDispatchScope,withLiveOperatorLock,requireFreshLiveDispatchObservers,pauseLiveFailureBeforeUnlock,type LiveRuntime,type LiveBaseSignerConfig} from '../src/live-dispatch-scope.ts';
import {isObserverWait} from '../src/observer-frontiers.ts';

type Config={mode:'LIVE_TESTNET_FORWARD';enabled:boolean;runtimePath:string;registryPath:string;signerConfigPath:string;signerCommand:'wsl.exe';signerArgs:string[];signerTimeoutMs:number;pollSeconds:number};
const privatePath=(path:string)=>isAbsolute(path)&&path.replaceAll('\\','/').includes('/.deploy-local/live-testnet-20261023/');
const wslPath=(path:string)=>path.replaceAll('\\','/').replace(/^([A-Za-z]):/,(_all,drive:string)=>`/mnt/${drive.toLowerCase()}`);
export async function loadLiveForwardConfig(path:string){
 if(!path||!privatePath(path))throw Error('EXPLICIT_NEW_LIVE_DISPATCH_CONFIG_REQUIRED');
 const c=JSON.parse(await readFile(path,'utf8')) as Config;
 if(c.mode!=='LIVE_TESTNET_FORWARD'||typeof c.enabled!=='boolean'||c.pollSeconds!==5||c.signerTimeoutMs!==120000)throw Error('INVALID_LIVE_DISPATCH_CONFIG');
 for(const p of [c.runtimePath,c.registryPath,c.signerConfigPath])if(!privatePath(p))throw Error('WRONG_LIVE_DISPATCH_PRIVATE_PATH');
 if(c.signerCommand!=='wsl.exe'||!Array.isArray(c.signerArgs)||c.signerArgs.length!==11||c.signerArgs[0]!=='-d'||c.signerArgs[1]!=='Ubuntu'||c.signerArgs[2]!=='--'||c.signerArgs[3]!=='python3'
  ||c.signerArgs[4]!==wslPath(fileURLToPath(new URL('../../workers/zcash-wallet/owned_wallet_call.py',import.meta.url)))||c.signerArgs[5]!=='--kind'||c.signerArgs[6]!=='base-forward'
  ||c.signerArgs[7]!=='--script'||c.signerArgs[8]!==wslPath(fileURLToPath(new URL('../../workers/base-signer/signer.py',import.meta.url)))||c.signerArgs[9]!=='--config'||c.signerArgs[10]!==wslPath(c.signerConfigPath))throw Error('RESTRICTED_FORWARD_SIGNER_REQUIRED');
 const runtime=JSON.parse(await readFile(c.runtimePath,'utf8')) as LiveRuntime,registry=JSON.parse(await readFile(c.registryPath,'utf8')) as BaseRegistry,signer=JSON.parse(await readFile(c.signerConfigPath,'utf8')) as LiveBaseSignerConfig;
 validateLiveDispatchScope(runtime,registry,signer);
 return {c,runtime,registry};
}

/** Exposed scheduling seam: once completes exactly one awaited step; no unsafe
 * outer timeout can leave work running after its operator lock is released. */
export async function liveForwardLoop(step:()=>Promise<unknown>,once:boolean,signal:AbortSignal,sleep:(ms:number)=>Promise<unknown>=ms=>delay(ms,undefined,{signal}).catch(()=>{})){
 do{const result=await step();console.log(JSON.stringify({event:'live-forward-dispatch',...result as object}));if(once)break;if(!signal.aborted)await sleep(5000);}while(!signal.aborted);
}
export async function runLiveForward(path:string,once:boolean,reconcileOnly=false){
 const {c,runtime,registry}=await loadLiveForwardConfig(path);
 if(!c.enabled)return {status:'DISPATCH_DISABLED',broadcastAuthority:false};
 const pool=connect(runtime.workerUrl,3),keys=new PrivateData(Buffer.from(runtime.payloadKeyHex,'hex'),Buffer.from(runtime.lookupKeyHex,'hex'));
 const base=new BaseContract(registry),signer=new LocalBaseSigner(c.signerCommand,c.signerArgs,c.signerTimeoutMs,true),stop=new AbortController();
 const safeWait=(error:unknown)=>isObserverWait(error)||['LIVE_DISPATCH_PAUSED','LIVE_OBSERVER_REQUIRED','LIVE_OBSERVER_STALE'].includes((error as Error).message);
 process.once('SIGINT',()=>stop.abort());process.once('SIGTERM',()=>stop.abort());
 try{await liveForwardLoop(async()=>{
  try{return await withLiveOperatorLock(pool,async lock=>{
   const identity=(await pool.query('SELECT current_database() AS database,current_user AS role')).rows[0];
   if(identity.database!==LIVE_DISPATCH_SCOPE.database||identity.role!==LIVE_DISPATCH_SCOPE.worker)throw Error('WRONG_CONNECTED_LIVE_DISPATCH_DATABASE');
   return pauseLiveFailureBeforeUnlock(async()=>{
   await lock.check();
   if(reconcileOnly){await base.preflight();return {status:'RECONCILED_RECORDED_RECEIPTS',...await reconcileBaseReceipts(pool,keys,base)};}
   let epoch:string|undefined;
   const refresh=async()=>{await lock.check();epoch=await requireFreshLiveDispatchObservers(pool,epoch);};
   await refresh();
   return dispatchBaseOnce(pool,keys,base,signer,refresh);
   },()=>pool.query('SELECT zee.enter_reconciliation()'),safeWait);
  });}catch(error){
   if(safeWait(error))return {status:'WAIT_OBSERVERS_OR_POLICY'};
   throw error;
  }
 },once,stop.signal);return {status:'WORKER_STOPPED'};
 }finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{const path=process.argv[2];if(!path)throw Error('EXPLICIT_NEW_LIVE_DISPATCH_CONFIG_REQUIRED');const flags=process.argv.slice(3);if(flags.some(flag=>!['--once','--reconcile-only'].includes(flag)))throw Error('INVALID_LIVE_DISPATCH_ARGUMENTS');console.log(JSON.stringify(await runLiveForward(path,flags.includes('--once'),flags.includes('--reconcile-only'))));}
 catch{console.error(JSON.stringify({event:'live-forward-dispatch',status:'BLOCKED_RECONCILE_BEFORE_RESTART'}));process.exitCode=1;}
}
