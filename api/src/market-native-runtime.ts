/** Concrete, separate market reverse transport. No fixture/bridge profile is repurposed. */
import {readFile,lstat,realpath,mkdir,open,rename} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {pathToFileURL} from 'node:url';
import {posix} from 'node:path';
import type pg from 'pg';
import {connect} from './db.ts';
import {PrivateData} from './private-data.ts';
import {BaseContract} from './base-contract.ts';
import {escrowTerms} from './base-escrow.ts';
import {reversePayoutTerms,type PreparedZcashTransaction} from './reverse-settlement.ts';
import {approvalDigest,assertReverseAuthority} from './reverse-authority.ts';
import {verifyLinuxOperatorProfile,linuxRawSha256,type PinnedFile} from './linux-testnet-profile.ts';
import {LocalReverseWalletAdapter} from './reverse-wallet-adapter.ts';
import {LocalReverseBaseSigner} from './base-signer.ts';
import type {CapitalSource} from './live-reverse-capital.ts';
import {approvedMarketCapital} from './market-capital-provenance.ts';
import {validatePolicyCapitalProof,requirePolicyCapitalProvenance} from './testnet-policy-capital.ts';
import {requireFreshLiveDispatchObservers,type LiveBaseSignerConfig} from './live-dispatch-scope.ts';
import type {LiveReverseContext,LiveReverseState} from './live-reverse-dispatch.ts';
import {requireAcceptedMarketQuote} from './market-pricing.ts';
import {requireMarketPolicyWorkerOrder,type MarketWorkerOrderContext} from './market-policy-worker.ts';

export const MARKET_NATIVE_PROFILE='/opt/zeeswap-testnet/secrets/market-reverse-profile.private.json';
const files={native:'workers/zcash-wallet/market_native_wallet.py',protocol:'workers/zcash-wallet/market_native_protocol.py',
 supervisor:'workers/zcash-wallet/market_owned_wallet.py',ownedKernel:'workers/zcash-wallet/owned_wallet_call.py',
 profile:'workers/zcash-wallet/linux_operator_profile.py',preparedKernel:'workers/zcash-wallet/prepared_raw.py',
 outgoingKernel:'workers/zcash-wallet/outgoing_recovery.py',basePreflightKernel:'workers/zcash-wallet/reverse_preflight.py',
 preflight:'workers/zcash-wallet/market_reverse_preflight.py',guard:'api/scripts/market-native-guard.ts',
 runtime:'api/src/market-native-runtime.ts',baseSigner:'workers/base-signer/reverse_signer.py',
 capitalCapture:'workers/zcash-wallet/testnet_policy_capital.py',marketPricing:'api/src/market-pricing.ts',
 marketPolicyWorker:'api/src/market-policy-worker.ts',marketCapital:'api/src/market-capital-provenance.ts',
 marketRefundQuery:'api/src/market-refund-query.ts'} as const;
export type MarketNativeConfig={version:1;mode:'MARKET_REFERENCE_NATIVE_TESTNET'|'MARKET_REFERENCE_REFUND_TESTNET';enabled:boolean;operatorProfile:string;
 python:string;node:PinnedFile;signerConfig:PinnedFile;protoDir:string;maxAmountZatoshi:string;marketPolicySha256:string;
 scripts:Record<string,PinnedFile>};
/** Finite release metadata for Root profile construction; no caller-selected files. */
export function marketNativeScriptFiles(purpose:'reverse'|'refund'='reverse'){
 return {...files,...(purpose==='refund'?{native:'workers/zcash-wallet/market_refund_wallet.py',supervisor:'workers/zcash-wallet/market_refund_owned_wallet.py',
  preflight:'workers/zcash-wallet/market_refund_preflight.py',guard:'api/scripts/market-refund-native-guard.ts',runtime:'api/src/market-refund-native-runtime.ts',
  reverseRuntime:'api/src/market-native-runtime.ts',marketWalletKernel:'workers/zcash-wallet/market_native_wallet.py',refundKernel:'workers/zcash-wallet/refund_raw.py',refundPreflightKernel:'workers/zcash-wallet/refund_preflight.py',refundBaseSigner:'workers/base-signer/refund_signer.py'}:{})};
}
export type MarketNativeState=LiveReverseState&{operatorProfileSha256?:string;nativeConfigSha256?:string;marketContext:MarketWorkerOrderContext};
function need(v:unknown,code:string):asserts v{if(!v)throw Error(code);}
const inside=(path:string,root:string)=>posix.isAbsolute(path)&&posix.normalize(path)===path&&path.startsWith(root+'/');
async function pin(file:PinnedFile,rootOwned=false,readBytes=true){const maximum=(readBytes?16:512)*1024*1024,s=await lstat(file.path);need(s.isFile()&&!s.isSymbolicLink()&&await realpath(file.path)===file.path&&(!rootOwned||s.uid===0)&&(s.mode&0o022)===0&&s.size<=maximum,'MARKET_NATIVE_PROTECTED_PIN');
 const hash=createHash('sha256'),pieces:Buffer[]=[];let size=0;for await(const raw of createReadStream(file.path)){const chunk=Buffer.from(raw);size+=chunk.length;need(size<=maximum,'MARKET_NATIVE_ARTIFACT_GREW');hash.update(chunk);if(readBytes)pieces.push(chunk);}need(hash.digest('hex')===file.sha256,'MARKET_NATIVE_PIN_CHANGED');return Buffer.concat(pieces);}
async function privateFile(path:string,rootOwned=false){const s=await lstat(path);need(s.isFile()&&!s.isSymbolicLink()&&await realpath(path)===path&&(!rootOwned||s.uid===0)&&(s.mode&0o027)===0&&s.size<=4_000_000,'MARKET_NATIVE_PRIVATE_FILE');return readFile(path);}
export async function loadMarketNative(path:string,purpose:'reverse'|'refund'='reverse'){
 const refund=purpose==='refund',expected=refund?MARKET_NATIVE_PROFILE.replace('market-reverse','market-refund'):MARKET_NATIVE_PROFILE;
 need(process.platform==='linux'&&path===expected,'MARKET_NATIVE_PROFILE_PATH');const bytes=await privateFile(path,true),c=JSON.parse(bytes.toString()) as MarketNativeConfig;
 need(c.version===1&&c.mode===(refund?'MARKET_REFERENCE_REFUND_TESTNET':'MARKET_REFERENCE_NATIVE_TESTNET')&&typeof c.enabled==='boolean'&&c.operatorProfile==='/opt/zeeswap-testnet/secrets/linux-operator-profile.private.json','MARKET_NATIVE_PROFILE_MODE');
 const verified=await verifyLinuxOperatorProfile(c.operatorProfile),p=verified.profile;
 need(c.python===p.roots.base+'/tools/python/bin/python'&&c.node.path===process.execPath&&inside(c.protoDir,p.roots.release)&&/^[a-f0-9]{64}$/.test(c.marketPolicySha256)&&/^[1-9][0-9]*$/.test(c.maxAmountZatoshi)&&BigInt(c.maxAmountZatoshi)<=10_000_000n,'MARKET_NATIVE_SCOPE');
 const scriptFiles=marketNativeScriptFiles(purpose);
 need(Object.keys(c.scripts).sort().join()===Object.keys(scriptFiles).sort().join(),'MARKET_NATIVE_SCRIPT_SET');
 for(const [name,relative]of Object.entries(scriptFiles)){need(c.scripts[name]?.path===p.roots.release+'/app/'+relative,'MARKET_NATIVE_SCRIPT_PATH');await pin(c.scripts[name]!,false,false);}
 await pin(c.node,false,false);const signer=JSON.parse((await pin(c.signerConfig,true)).toString()) as LiveBaseSignerConfig;
 need(signer.cast===p.artifacts.cast.path&&signer.rpcUrl===verified.registry.rpcUrl&&signer.operator.toLowerCase()===p.identity.operator.toLowerCase()&&signer.token.toLowerCase()===p.identity.token.toLowerCase()&&signer.settlement.toLowerCase()===p.identity.settlement.toLowerCase()&&signer.account===p.identity.account&&signer.passwordFile===p.paths.basePassword&&signer.journalRoot===p.paths.baseJournal&&signer.tokenCodeHash===verified.registry.contracts.MockUSDC.runtimeCodeHash&&signer.settlementCodeHash===verified.registry.contracts.ZeeSwapSettlement.runtimeCodeHash,'MARKET_NATIVE_BASE_SIGNER_SCOPE');
 return {c,verified,signer,path,rootConfigSha256:linuxRawSha256(bytes)};
}
export type LoadedMarketNative=Awaited<ReturnType<typeof loadMarketNative>>;
export function marketNativeDirectory(loaded:LoadedMarketNative,id:string){need(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id),'MARKET_NATIVE_ORDER');return loaded.verified.profile.roots.state+'/market-reverse-orders/'+id;}
export const marketNativeStorage={privateFile,saveFile,pin};
async function saveFile(path:string,value:unknown,exclusive=false){const bytes=JSON.stringify(value,null,2),temporary=exclusive?path:path+'.'+randomUUID()+'.tmp';
 try{const f=await open(temporary,'wx',0o600);try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}}catch(e){if(!exclusive||(e as NodeJS.ErrnoException).code!=='EEXIST')throw e;need((await privateFile(path)).toString()===bytes,'MARKET_NATIVE_IMMUTABLE_FILE');return linuxRawSha256(bytes);}
 if(!exclusive)await rename(temporary,path);const d=await open(posix.dirname(path),'r');try{await d.sync();}finally{await d.close();}return linuxRawSha256(bytes);}
/** Request normalized from decrypted accepted DB terms, never price-provider input at payout time. */
export function marketNativeRequest(quote:any,funding:any,payout:any,proof:any,contract:string){
 return {version:1,purpose:'market-reverse-v1',orderId:quote.id,settlementId:funding.id,recipient:payout.recipient,amountZatoshi:payout.amountZatoshi,maxFeeZatoshi:payout.maxFeeZatoshi,
  quote:{id:quote.id,direction:quote.direction,executionMode:quote.executionMode,priceMode:'market-reference',inputAmount:quote.inputAmount,outputAmount:quote.outputAmount,recipient:quote.recipient,refundRecipient:quote.refundRecipient,acceptedAt:quote.acceptedAt,quoteExpiresAt:quote.quoteExpiresAt,pricing:quote.pricing},
  base:{chainId:84532,contract,token:funding.token,payer:funding.payer,refundRecipient:funding.refundRecipient,amountAtomic:funding.amount,cancellationAvailableAt:funding.cancellationAvailableAt,commitTxHash:proof.transactionHash,commitBlockNumber:String(proof.blockHeight),commitBlockHash:proof.blockHash}};
}
export function assertMarketNativeAcceptedRequest(approved:unknown,expected:unknown){need(isDeepStrictEqual(expected,approved),'MARKET_NATIVE_ACCEPTED_TERMS_CHANGED');}
export function marketNativeContexts(loaded:LoadedMarketNative,pool:pg.Pool,keys:PrivateData,base:BaseContract,marketContext:MarketWorkerOrderContext):LiveReverseContext{
 const {c,verified,signer}=loaded,p=verified.profile;
 need(c.enabled&&c.mode==='MARKET_REFERENCE_NATIVE_TESTNET'&&marketContext.policySha256===c.marketPolicySha256,'MARKET_NATIVE_POLICY_BINDING');
 const file=(id:string,name:string)=>marketNativeDirectory(loaded,id)+'/'+name;
 async function check(id:string){await requireMarketPolicyWorkerOrder(pool,marketContext,id);return requireAcceptedMarketQuote(pool,keys,id,marketContext);}
 async function save(state:LiveReverseState){const s=state as MarketNativeState;need(s.marketContext.policySha256===c.marketPolicySha256&&s.operatorProfileSha256===verified.profileSha256,'MARKET_NATIVE_STATE_SCOPE');await saveFile(file(state.orderId,'state.private.json'),state);}
 async function load(id:string):Promise<MarketNativeState>{await check(id);const directory=marketNativeDirectory(loaded,id);await mkdir(directory,{recursive:true,mode:0o700});need(await realpath(directory)===directory,'MARKET_NATIVE_STATE_PATH');
  try{const s=JSON.parse((await privateFile(file(id,'state.private.json'))).toString());need(s.orderId===id&&s.operatorProfileSha256===verified.profileSha256&&isDeepStrictEqual(s.marketContext,marketContext),'MARKET_NATIVE_STATE_BINDING');return s;}
  catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;return{version:1,orderId:id,operatorProfileSha256:verified.profileSha256,marketContext};}}
 async function capital(id:string,approvedDigest:string){
  const path=file(id,'capital-approval.private.json'),bytes=await privateFile(path,true),approval=JSON.parse(bytes.toString());
  need(approval.version===1&&approval.purpose==='market-reverse-v1'&&approval.orderId===id&&approval.approvedDigest===approvedDigest&&approval.marketPolicySha256===marketContext.policySha256&&approval.sourceFingerprint===p.identity.sourceFingerprint&&Array.isArray(approval.sources)&&approval.sources.length<=99,'MARKET_NATIVE_ROOT_CAPITAL_APPROVAL');
  for(const source of approval.sources as CapitalSource[])need(['settled-source','confirmed-own-change','confirmed-refund-own-change','discharged-refund-residual'].includes(source.kind)&&inside(source.path,marketNativeDirectory(loaded,id)+'/proofs')&&/^[a-f0-9]{64}$/.test(source.sha256),'MARKET_NATIVE_CAPITAL_PROVENANCE');
  const provenance=await approvedMarketCapital(pool,keys,[{kind:'opening',...p.immutable.chefOpeningProof},...approval.sources],undefined,marketContext);
  need(inside(approval.capture.path,p.roots.state+'/testnet-policy/'+marketContext.policySha256+'/capital-captures'),'MARKET_NATIVE_PHYSICAL_CAPTURE_PATH');
  const physical=JSON.parse((await pin(approval.capture,true)).toString()),capture=validatePolicyCapitalProof(physical,{policySha256:marketContext.policySha256,profileSha256:verified.profileSha256,loaderSha256:c.scripts.profile.sha256,captureScriptSha256:c.scripts.capitalCapture.sha256});
  const notes=requirePolicyCapitalProvenance(capture.notes,provenance);need(isDeepStrictEqual(notes,approval.notes),'MARKET_NATIVE_APPROVED_CURRENT_NOTES');return {notes,path,sha256:linuxRawSha256(bytes)};
 }
 return {pool,keys,base,maxAmountZatoshi:c.maxAmountZatoshi,load,save,
  async nativeJournal(state){try{const j=JSON.parse((await privateFile(file(state.orderId,'payout-intent.private.json'))).toString());return {exists:true,broadcast:['BROADCAST_UNKNOWN','BROADCAST_ACKNOWLEDGED','DELIVERY_CONFIRMED'].includes(j.state)};}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;return {exists:false,broadcast:false};}},
  async wallet(state){await check(state.orderId);need(state.approvedDigest&&(state as MarketNativeState).nativeConfigSha256===linuxRawSha256(await privateFile(file(state.orderId,'prepared.private.json'))),'MARKET_NATIVE_PREPARED_PIN');return new LocalReverseWalletAdapter(c.python,[c.scripts.supervisor.path,'--config',file(state.orderId,'prepared.private.json')],state.approvedDigest,true);},
  async baseSigner(state){const path=file(state.orderId,'base-signer.private.json');await saveFile(path,{...signer,reverseApprovedRequest:file(state.orderId,'approved.private.json'),reverseApprovedDigest:state.approvedDigest??'0'.repeat(64),reverseReceiptCommand:[c.python,c.scripts.native.path,'--config',file(state.orderId,'prepared.private.json')]});
   // The existing supervisor owns reverse_signer; receipt stays in its group.
   return new LocalReverseBaseSigner(c.python,[p.roots.release+'/app/workers/zcash-wallet/owned_wallet_call.py','--kind','base-reverse','--script',c.scripts.baseSigner.path,'--config',path],true);},
  async approve(state){const id=state.orderId,q=await check(id),funding=await escrowTerms(pool,keys,base,id),payout=await reversePayoutTerms(pool,keys,id),row=(await pool.query('SELECT * FROM zee.escrow_commits WHERE order_id=$1 AND confirmed',[id])).rows[0];need(row,'MARKET_NATIVE_COMMIT_REQUIRED');
   const proof=keys.open(row.receipt_payload,`escrow-proof:${id}:v1`),approved=marketNativeRequest(q,funding,payout,proof,base.registry.contracts.ZeeSwapSettlement.address),digest=approvalDigest(approved);
   need(!state.approvedDigest||state.approvedDigest===digest,'MARKET_NATIVE_APPROVAL_CHANGED');const cap=await capital(id,digest),approvedRequest=file(id,'approved.private.json'),approvedRequestSha256=await saveFile(approvedRequest,approved,true);
   const preflight=file(id,'preflight.private.json'),preflightConfigSha256=await saveFile(preflight,{readCommand:[p.artifacts.reader.path],rpcUrl:base.registry.rpcUrl,hashCommand:[p.artifacts.cast.path,'keccak']},true);
   const guard=file(id,'guard.private.json');await saveFile(guard,{version:1,configPath:loaded.path,orderId:id,statePath:file(id,'state.private.json'),approvedRequest,approvedDigest:digest},true);
   const prefix=[c.node.path,'--import',pathToFileURL(p.roots.release+'/app/api/node_modules/tsx/dist/loader.mjs').href,c.scripts.guard.path,guard];
   const prepared={version:1,nativePurpose:'market-reverse-v1',linuxProfilePath:c.operatorProfile,linuxProfileSha256:verified.profileSha256,rootConfigPath:loaded.path,rootConfigSha256:loaded.rootConfigSha256,
    walletDir:p.paths.operatorWallet,operatorUfvkFile:p.paths.operatorUfvk,lockPath:p.paths.walletLock,capitalUfvkSha256:p.identity.sourceFingerprint,recipientProofMode:'operator-outgoing-recovery',cliCommand:[p.artifacts.zingo.path],readCommand:[p.artifacts.reader.path],verifyCommand:[p.artifacts.verify.path],protoDir:c.protoDir,
    approvedRequest,approvedDigest:digest,approvedRequestSha256,approvedCapitalNotes:cap.notes,capitalApprovalPath:cap.path,capitalApprovalSha256:cap.sha256,marketContext,journalPath:file(id,'payout-intent.private.json'),preflightConfigSha256,
    preflightCommand:[c.python,c.scripts.preflight.path,'--config',preflight,'--approved-request',approvedRequest,'--approved-digest',digest,'--registry',p.immutable.registry.path],authorizationCommand:[...prefix,'authority'],beforeBroadcastGuardCommand:[...prefix,'broadcast']};
   (state as MarketNativeState).nativeConfigSha256=await saveFile(file(id,'prepared.private.json'),prepared,true);state.approvedDigest=digest;await save(state);
  }};
}

export async function runMarketNativeGuard(path:string,mode:'authority'|'broadcast',input?:any){
 const guard=JSON.parse((await privateFile(path)).toString()),loaded=await loadMarketNative(guard.configPath),{c,verified}=loaded;
 need(c.enabled,'MARKET_NATIVE_DISABLED');const directory=marketNativeDirectory(loaded,guard.orderId);need(path===directory+'/guard.private.json'&&guard.statePath===directory+'/state.private.json'&&guard.approvedRequest===directory+'/approved.private.json','MARKET_NATIVE_GUARD_PATH');
 const state=JSON.parse((await privateFile(guard.statePath)).toString()) as MarketNativeState,approved=JSON.parse((await privateFile(guard.approvedRequest)).toString());
 need(state.orderId===guard.orderId&&state.approvedDigest===guard.approvedDigest&&state.operatorProfileSha256===verified.profileSha256&&state.marketContext.policySha256===c.marketPolicySha256&&approvalDigest(approved)===guard.approvedDigest,'MARKET_NATIVE_GUARD_REQUEST');
 need(state.nativeConfigSha256===linuxRawSha256(await privateFile(directory+'/prepared.private.json'))&&state.currentLease&&state.operatorBackendPid&&state.dispatchEpoch,'MARKET_NATIVE_GUARD_STATE');
 const {runtime,registry}=verified,pool=connect(runtime.workerUrl,1),keys=new PrivateData(Buffer.from(runtime.payloadKeyHex,'hex'),Buffer.from(runtime.lookupKeyHex,'hex')),base=new BaseContract(registry);
 try{
  const identity=(await pool.query('SELECT current_database() database,current_user role')).rows[0];need(identity?.database==='zee_app_20261023'&&identity.role==='zee_app_worker_20261023','MARKET_NATIVE_DATABASE_SCOPE');
  const lock=(await pool.query(`SELECT EXISTS(SELECT 1 FROM pg_locks l JOIN pg_database d ON d.oid=l.database WHERE d.datname=current_database() AND l.locktype='advisory' AND l.pid=$1 AND l.classid=84532::oid AND l.objid=20261023::oid AND l.objsubid=2 AND l.granted) owned`,[state.operatorBackendPid])).rows[0];need(lock?.owned===true,'MARKET_NATIVE_OPERATOR_LOCK');
  await requireMarketPolicyWorkerOrder(pool,state.marketContext,state.orderId);const q=await requireAcceptedMarketQuote(pool,keys,state.orderId,state.marketContext),funding=await escrowTerms(pool,keys,base,state.orderId),terms=await reversePayoutTerms(pool,keys,state.orderId),commit=(await pool.query('SELECT * FROM zee.escrow_commits WHERE order_id=$1 AND confirmed',[state.orderId])).rows[0];need(commit,'MARKET_NATIVE_COMMIT_REQUIRED');
  const expected=marketNativeRequest(q,funding,terms,keys.open(commit.receipt_payload,`escrow-proof:${state.orderId}:v1`),registry.contracts.ZeeSwapSettlement.address);assertMarketNativeAcceptedRequest(approved,expected);
  if(mode==='broadcast'){
   const row=(await pool.query('SELECT * FROM zee.reverse_payouts WHERE order_id=$1',[state.orderId])).rows[0];need(row&&!row.confirmed,'MARKET_NATIVE_ORIGINAL_SIGNED_PAYOUT');
   const signed=keys.open(row.signed_payload,`reverse-payout:${state.orderId}:v1`) as PreparedZcashTransaction,checkpoint=(await pool.query("SELECT scanned_height FROM zee.scanner_checkpoints WHERE network='zcash-testnet'")).rows[0];need(checkpoint&&keys.lookup('zcash-tx',input?.txid).equals(row.tx_hash),'MARKET_NATIVE_ORIGINAL_TX');
   assertReverseAuthority(input,approved,guard.approvedDigest,state.orderId,signed,terms,funding,registry.contracts.ZeeSwapSettlement.address,String(checkpoint.scanned_height));
  }
  await requireFreshLiveDispatchObservers(pool,state.dispatchEpoch);const lease=state.currentLease!;
  await pool.query('SELECT zee.check_reverse_signing($1,$2,$3,$4)',[state.orderId,lease.jobId,lease.owner,lease.fence]);
  return mode==='authority'?{authorized:true,orderId:state.orderId,approvedDigest:guard.approvedDigest}:{authorized:true,operationId:state.orderId,approvedDigest:guard.approvedDigest,txid:input.txid,rawSha256:input.rawSha256};
 }finally{await pool.end();}
}
