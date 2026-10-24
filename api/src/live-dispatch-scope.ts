import type pg from 'pg';
import type {BaseRegistry} from './base-contract.ts';

export const LIVE_DISPATCH_SCOPE={projectId:'raspy-truth-63998651',branchId:'br-broad-pine-ao79wemx',host:'ep-red-thunder-aosp0w70.c-2.ap-southeast-1.aws.neon.tech',database:'zee_app_20261023',worker:'zee_app_worker_20261023',
 operator:'0x24faff408e7bb3c0ab076aecc8fd3c00bd8b3087',settlement:'0xe99ac648f85450b8ddeaea088aa99749c5e16da3',token:'0xd64c116352cef2adc9484098ae332fd9ba339a63',
 settlementCodeHash:'0xd6f7a1d239b6e0022ef3a6ae3b6b867f29e994d160e25f10532d24524eec90f6',tokenCodeHash:'0x46c011d67236b418b5af0e8ebb45036224c42d331f7414cc0fff2ed7ffe967bd',
 journalRoot:'/home/albary/zeeswap-testnet-20261023/base-signer-journal',account:'zeeswap-live-20261023-operator',passwordFile:'/home/albary/zeeswap-testnet-20261023/operator-password'} as const;
export type LiveRuntime={projectId:string;branchId:string;host:string;database:string;workerUrl:string;payloadKeyHex:string;lookupKeyHex:string};
export type LiveBaseSignerConfig={cast:string;rpcUrl:string;account:string;operator:string;passwordFile:string;journalRoot:string;token:string;settlement:string;tokenCodeHash:string;settlementCodeHash:string};
function requireScope(value:unknown,code:string):asserts value{if(!value)throw Error(code);}
export function validateLiveDispatchScope(runtime:LiveRuntime,registry:BaseRegistry,signer:LiveBaseSignerConfig){
 const s=LIVE_DISPATCH_SCOPE;
 requireScope(runtime.projectId===s.projectId&&runtime.branchId===s.branchId&&runtime.host===s.host&&runtime.database===s.database,'WRONG_LIVE_DISPATCH_DATABASE');
 const url=new URL(runtime.workerUrl);
 requireScope(['postgres:','postgresql:'].includes(url.protocol)&&url.hostname===s.host&&url.pathname==='/'+s.database&&decodeURIComponent(url.username)===s.worker,'WRONG_LIVE_DISPATCH_WORKER');
 requireScope(/^[0-9a-f]{64}$/.test(runtime.payloadKeyHex)&&/^[0-9a-f]{64}$/.test(runtime.lookupKeyHex)&&runtime.payloadKeyHex!==runtime.lookupKeyHex,'INVALID_LIVE_PRIVATE_KEYS');
 requireScope(registry.chainId===84532&&registry.operator.toLowerCase()===s.operator&&registry.rpcUrl==='https://sepolia.base.org'
  &&registry.contracts.ZeeSwapSettlement.address.toLowerCase()===s.settlement&&registry.contracts.MockUSDC.address.toLowerCase()===s.token
  &&registry.contracts.ZeeSwapSettlement.runtimeCodeHash===s.settlementCodeHash&&registry.contracts.MockUSDC.runtimeCodeHash===s.tokenCodeHash,'WRONG_LIVE_DISPATCH_REGISTRY');
 requireScope(signer.operator.toLowerCase()===s.operator&&signer.rpcUrl===registry.rpcUrl&&signer.token.toLowerCase()===s.token&&signer.settlement.toLowerCase()===s.settlement
  &&signer.tokenCodeHash===s.tokenCodeHash&&signer.settlementCodeHash===s.settlementCodeHash&&signer.cast==='/home/albary/.foundry/bin/cast'
  &&signer.account===s.account&&signer.passwordFile===s.passwordFile&&signer.journalRoot===s.journalRoot,'WRONG_LIVE_DISPATCH_SIGNER');
}

export interface LiveOperatorLock{readonly backendPid?:number;check():Promise<void>}
/** Invoke only after connected scope verification and from inside the held
 * operator callback. A financial hard failure pauses before lock release. */
export async function pauseLiveFailureBeforeUnlock<T>(run:()=>Promise<T>,pause:()=>Promise<unknown>,safeWait:(error:unknown)=>boolean):Promise<T>{
 try{return await run();}catch(error){if(!safeWait(error))await pause();throw error;}
}
/** Shared by forward/reverse runners. Keep this session checked out throughout
 * signing, durable storage and broadcast. Never release on a Promise.race timer:
 * the existing signer owns child cleanup and has its own bounded timeout. */
export async function withLiveOperatorLock<T>(pool:pg.Pool,run:(lock:LiveOperatorLock)=>Promise<T>):Promise<T|{status:'WAIT_OPERATOR_LOCK'}>{
 const client=await pool.connect();let acquired=false,lost=false,pid:unknown;
 const onError=()=>{lost=true;};client.on('error',onError);
 try{
  const row=(await client.query('SELECT pg_try_advisory_lock($1,$2) AS locked,pg_backend_pid() AS pid',[84532,20261023])).rows[0];
  if(!row?.locked)return {status:'WAIT_OPERATOR_LOCK'};
  acquired=true;pid=row.pid;
  return await run({backendPid:Number(pid),async check(){requireScope(!lost,'LIVE_OPERATOR_LOCK_LOST');const row=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0];requireScope(!lost&&row?.pid===pid,'LIVE_OPERATOR_LOCK_LOST');}});
 }finally{
  try{if(acquired&&!lost){const row=(await client.query('SELECT pg_advisory_unlock($1,$2) AS unlocked',[84532,20261023])).rows[0];requireScope(row?.unlocked===true,'LIVE_OPERATOR_LOCK_LOST');}}
  finally{client.removeListener('error',onError);client.release(lost?Error('LIVE_OPERATOR_LOCK_LOST'):undefined);}
 }
}

/** Freshness is read from SQL's clock. No wallet/SDK scan and no observer
 * timestamps are renewed by the dispatcher. Normal observer updates keep epoch;
 * any source conflict or control change invalidates this entire dispatch step. */
export async function requireFreshLiveDispatchObservers(pool:pg.Pool,expectedEpoch?:string){
 const runtime=(await pool.query('SELECT epoch::text,dispatch_enabled,reconciliation_required FROM zee.runtime_control WHERE singleton')).rows[0];
 requireScope(runtime&&typeof runtime.epoch==='string','LIVE_RUNTIME_MISSING');
 requireScope(runtime.dispatch_enabled===true&&runtime.reconciliation_required===false,'LIVE_DISPATCH_PAUSED');
 requireScope(expectedEpoch===undefined||runtime.epoch===expectedEpoch,'LIVE_DISPATCH_EPOCH_CHANGED');
 await requireFreshLiveSourceCheckpoints(pool);return runtime.epoch as string;
}
export async function requireFreshLiveSourceCheckpoints(pool:pg.Pool){
 const rows=(await pool.query("SELECT network,scanned_height,finalized_height,observed_at,clock_timestamp() AS checked_at FROM zee.scanner_checkpoints WHERE network IN ('zcash-testnet','base-sepolia') ORDER BY network")).rows;
 requireScope(rows.length===2&&new Set(rows.map(row=>row.network)).size===2&&rows.every(row=>['zcash-testnet','base-sepolia'].includes(row.network)),'LIVE_OBSERVER_REQUIRED');
 for(const row of rows){const age=new Date(row.checked_at).getTime()-new Date(row.observed_at).getTime();
  requireScope(Number.isFinite(age)&&age>=-5000&&age<=60000&&BigInt(row.scanned_height)>=BigInt(row.finalized_height),'LIVE_OBSERVER_STALE');}
}
