/** Linux forward transport scope. No rewriting of the historical WSL validator. */
import {readFile,lstat,realpath} from 'node:fs/promises';
import type pg from 'pg';
import type {BaseRegistry} from './base-contract.ts';
import type {BaseContract} from './base-contract.ts';
import type {BaseSigner} from './base-signer.ts';
import type {PrivateData} from './private-data.ts';
import {dispatchBaseOnce,reconcileBaseReceipts} from './base-settlement.ts';
import {LIVE_DISPATCH_SCOPE as scope,withLiveOperatorLock,requireFreshLiveDispatchObservers,pauseLiveFailureBeforeUnlock,type LiveRuntime,type LiveBaseSignerConfig} from './live-dispatch-scope.ts';
import {isObserverWait} from './observer-frontiers.ts';
import {linuxRawSha256,verifyLinuxOperatorProfile,type LinuxOperatorProfile,type PinnedFile} from './linux-testnet-profile.ts';
import {mainDatabaseTransportFor} from './main-database-relocation.ts';
import {HttpRequestError,TimeoutError} from 'viem';
export type LinuxForwardConfig={version:1;mode:'LINUX_TESTNET_FORWARD';enabled:boolean;operatorProfile:string;signerConfig:PinnedFile;supervisor:PinnedFile;signerScript:PinnedFile;handoffProof:string;python:string;pollSeconds:5};
function need(value:unknown,code:string):asserts value{if(!value)throw Error(code);}
export function validateLinuxForwardScope(c:LinuxForwardConfig,p:LinuxOperatorProfile,r:LiveRuntime,b:BaseRegistry,s:LiveBaseSignerConfig){
 need(c.version===1&&c.mode==='LINUX_TESTNET_FORWARD'&&typeof c.enabled==='boolean'&&c.pollSeconds===5,'LINUX_FORWARD_CONFIG_REQUIRED');
 const root=p.roots.base;
 need(root==='/opt/zeeswap-testnet'&&c.operatorProfile===root+'/secrets/linux-operator-profile.private.json'&&c.python===root+'/tools/python/bin/python'&&c.signerConfig.path===root+'/secrets/forward-signer.private.json'&&c.handoffProof===root+'/secrets/relocation-applied-proof.private.json','LINUX_FORWARD_PHYSICAL_SCOPE');
 need(c.supervisor.path===p.roots.release+'/app/workers/zcash-wallet/owned_wallet_call.py'&&c.signerScript.path===p.roots.release+'/app/workers/base-signer/signer.py','LINUX_FORWARD_RELEASE_BOUNDARY');
 for(const pin of [c.signerConfig,c.supervisor,c.signerScript])need(/^[0-9a-f]{64}$/.test(pin.sha256),'LINUX_FORWARD_PIN_REQUIRED');
 const transport=mainDatabaseTransportFor(r.workerUrl),host=transport?.context.receipt.destination.host??scope.host;
 need(r.projectId===scope.projectId&&r.branchId===scope.branchId&&r.host===host&&r.database===scope.database,'LINUX_FORWARD_DATABASE_SCOPE');
 const url=new URL(r.workerUrl);need(['postgres:','postgresql:'].includes(url.protocol)&&url.hostname===host&&(!transport||url.port===String(transport.context.receipt.destination.port))&&url.pathname==='/'+scope.database&&decodeURIComponent(url.username)===scope.worker,'LINUX_FORWARD_WORKER_SCOPE');
 need(/^[0-9a-f]{64}$/.test(r.payloadKeyHex)&&/^[0-9a-f]{64}$/.test(r.lookupKeyHex)&&r.payloadKeyHex!==r.lookupKeyHex,'LINUX_FORWARD_PRIVATE_KEYS');
 need(b.chainId===84532&&b.operator.toLowerCase()===scope.operator&&b.rpcUrl==='https://sepolia.base.org'&&b.contracts.ZeeSwapSettlement.address.toLowerCase()===scope.settlement&&b.contracts.MockUSDC.address.toLowerCase()===scope.token&&b.contracts.ZeeSwapSettlement.runtimeCodeHash===scope.settlementCodeHash&&b.contracts.MockUSDC.runtimeCodeHash===scope.tokenCodeHash,'LINUX_FORWARD_REGISTRY_SCOPE');
 need(s.operator.toLowerCase()===scope.operator&&s.rpcUrl===b.rpcUrl&&s.account===scope.account&&s.token.toLowerCase()===scope.token&&s.settlement.toLowerCase()===scope.settlement&&s.tokenCodeHash===scope.tokenCodeHash&&s.settlementCodeHash===scope.settlementCodeHash&&s.cast===p.artifacts.cast.path&&s.passwordFile===p.paths.basePassword&&s.journalRoot===p.paths.baseJournal&&s.journalRoot===root+'/state/base-signer-journal'&&s.passwordFile===root+'/secrets/operator-password','LINUX_FORWARD_SIGNER_SCOPE');
}
async function pinned(item:PinnedFile,secret:boolean){const stat=await lstat(item.path);need(stat.isFile()&&!stat.isSymbolicLink()&&await realpath(item.path)===item.path&&(!secret||(stat.mode&0o027)===0),'LINUX_FORWARD_PROTECTED_FILE');const bytes=await readFile(item.path);need(linuxRawSha256(bytes)===item.sha256,'LINUX_FORWARD_PIN_CHANGED');return bytes;}
export async function loadLinuxForward(path:string){
 need(process.platform==='linux'&&path==='/opt/zeeswap-testnet/secrets/forward-profile.private.json','LINUX_FORWARD_NATIVE_PROFILE');
 const bytes=await readFile(path),c=JSON.parse(bytes.toString()) as LinuxForwardConfig;
 need(c.operatorProfile==='/opt/zeeswap-testnet/secrets/linux-operator-profile.private.json','LINUX_FORWARD_OPERATOR_PROFILE');
 const verified=await verifyLinuxOperatorProfile(c.operatorProfile),{profile:p,runtime,registry}=verified;
 need(p.configPins?.forwardProfile?.path===path&&p.configPins.forwardProfile.sha256===linuxRawSha256(bytes),'LINUX_FORWARD_MANIFEST_BINDING');
 const signer=JSON.parse((await pinned(c.signerConfig,true)).toString()) as LiveBaseSignerConfig;
 validateLinuxForwardScope(c,p,runtime,registry,signer);
 await pinned(c.supervisor,false);await pinned(c.signerScript,false);
 // Proof contains the operator-profile digest. Pinning its bytes back through
 // configPins.forwardProfile would create an impossible hash dependency cycle.
 const proofStat=await lstat(c.handoffProof);
 need(proofStat.isFile()&&!proofStat.isSymbolicLink()&&(proofStat.mode&0o027)===0&&await realpath(c.handoffProof)===c.handoffProof,'LINUX_FORWARD_PROTECTED_HANDOFF');
 const proof=JSON.parse(await readFile(c.handoffProof,'utf8'));
 need(proofStat.uid===0&&proof.status==='PREFUNDING_RELOCATION_VERIFIED'&&proof.profileSha256===verified.profileSha256&&proof.openingProofSha256===p.immutable.openingProof.sha256&&proof.branchId===scope.branchId&&proof.database===scope.database,'LINUX_FORWARD_HANDOFF_PROOF');
 need(process.env.HOME===p.roots.base+'/home','LINUX_FORWARD_KEYSTORE_HOME');
 return{c,verified};
}
const baseReadMethods=new Set(['eth_chainId','eth_getBlockByNumber','eth_getBlockByHash','eth_getCode','eth_call','eth_getTransactionReceipt','eth_getTransactionByHash','eth_getTransactionCount','eth_getBalance']);
const networkReadCodes=new Set(['ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH','EAI_AGAIN','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_SOCKET']);
export type BaseReadWaitCode='BASE_RPC_READ_HTTP_429'|'BASE_RPC_READ_HTTP_502'|'BASE_RPC_READ_HTTP_503'|'BASE_RPC_READ_HTTP_504'|'BASE_RPC_READ_TIMEOUT'|'BASE_RPC_READ_NETWORK';
/** Classify only a proven idempotent request to the pinned Base endpoint.
 * No message/body/URL is returned or logged. Broadcast errors stay fenced by
 * their existing fixed reconciliation code, regardless of nested causes. */
export function transientBaseReadWaitCode(error:unknown):BaseReadWaitCode|undefined{
 const chain:Record<string,any>[]=[],seen=new Set<unknown>();let current=error;
 while(current&&typeof current==='object'&&!seen.has(current)&&chain.length<12){seen.add(current);const item=current as Record<string,any>;chain.push(item);current=item.cause;}
 if(current&&typeof current==='object')return;
 if(chain.some(e=>/^(BASE_|LINUX_|LIVE_|POLICY_)/.test(String(e.message))||e instanceof SyntaxError||['ContractFunctionRevertedError','ExecutionRevertedError','InvalidInputRpcError','InvalidParamsRpcError','ParseRpcError','InvalidRequestRpcError','InvalidResponseError','AbiDecodingDataSizeTooSmallError','AbiDecodingZeroDataError','ContractFunctionZeroDataError','ResponseBodyTooLargeError'].includes(e.name)||typeof e.code==='string'&&/^[0-9A-Z]{5}$/.test(e.code)||typeof e.status==='number'&&![429,502,503,504].includes(e.status)))return;
 const request=chain.find(e=>e instanceof HttpRequestError||e instanceof TimeoutError);
 if(!request||!['https://sepolia.base.org','https://sepolia.base.org/'].includes(request.url))return;
 let body:unknown=request instanceof HttpRequestError?request.body:undefined;
 // viem TimeoutError retains its exact request only in structured metadata.
 if(request instanceof TimeoutError){const raw=request.metaMessages?.find((m:unknown)=>typeof m==='string'&&m.startsWith('Request body: '));if(typeof raw!=='string'||raw.length>32768)return;try{body=JSON.parse(raw.slice('Request body: '.length));}catch{return;}}
 if(!body||typeof body!=='object'||Array.isArray(body)||!baseReadMethods.has(String((body as Record<string,unknown>).method)))return;
 if(request instanceof TimeoutError)return 'BASE_RPC_READ_TIMEOUT';
 if(typeof request.status==='number'&&[429,502,503,504].includes(request.status))return `BASE_RPC_READ_HTTP_${request.status}` as BaseReadWaitCode;
 if(request.status===undefined&&chain.some(e=>networkReadCodes.has(e.code)))return 'BASE_RPC_READ_NETWORK';
}
const safeWait=(e:unknown)=>isObserverWait(e)||!!transientBaseReadWaitCode(e)||['LIVE_DISPATCH_PAUSED','LIVE_OBSERVER_REQUIRED','LIVE_OBSERVER_STALE'].includes((e as Error).message);
/** Paused controls return before constructing or calling any financial adapter. */
export async function linuxForwardStep(pool:pg.Pool,run:(refresh:()=>Promise<void>)=>Promise<unknown>,reconcileOnly=false,preflight?:()=>Promise<unknown>){
 try{return await withLiveOperatorLock(pool,async lock=>{
  const identity=(await pool.query('SELECT current_database() AS database,current_user AS role')).rows[0];
  need(identity?.database===scope.database&&identity.role===scope.worker,'LINUX_FORWARD_CONNECTED_SCOPE');
  return pauseLiveFailureBeforeUnlock(async()=>{
   await lock.check();let epoch:string|undefined;
   const refresh=async()=>{await lock.check();epoch=await requireFreshLiveDispatchObservers(pool,epoch);};
   // Reconciliation also requires explicit dispatch authority for this new entry;
   // a paused recovery remains an operator task through the existing tools.
   await refresh();if(reconcileOnly)await preflight?.();return run(refresh);
  },()=>pool.query('SELECT zee.enter_reconciliation()'),safeWait);
 });}catch(e){const code=transientBaseReadWaitCode(e);if(code)return{status:'WAIT_BASE_RPC_READ',code,financialAction:false};if(safeWait(e))return{status:'WAIT_OBSERVERS_OR_POLICY',financialAction:false};throw e;}
}
export function linuxForwardAdapters(pool:pg.Pool,keys:PrivateData,base:BaseContract,signer:BaseSigner,reconcileOnly:boolean){
 return linuxForwardStep(pool,refresh=>reconcileOnly?reconcileBaseReceipts(pool,keys,base):dispatchBaseOnce(pool,keys,base,signer,refresh),reconcileOnly,()=>base.preflight());
}
