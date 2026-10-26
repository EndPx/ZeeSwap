/** Market-only full-source refund factory and late authority fence. */
import {readFile,realpath,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import type pg from 'pg';
import {connect} from './db.ts';
import {PrivateData} from './private-data.ts';
import {BaseContract} from './base-contract.ts';
import {LocalBaseSigner,type PreparedBaseTransaction} from './base-signer.ts';
import {LocalReverseWalletAdapter} from './reverse-wallet-adapter.ts';
import {loadMarketNative,marketNativeStorage,type LoadedMarketNative} from './market-native-runtime.ts';
import {linuxRawSha256} from './linux-testnet-profile.ts';
import {approvalDigest} from './reverse-authority.ts';
import {requireAcceptedMarketQuote} from './market-pricing.ts';
import {requireMarketPolicyWorkerOrder,type MarketWorkerOrderContext} from './market-policy-worker.ts';
import type {CapitalSource} from './live-reverse-capital.ts';
import {approvedMarketCapital} from './market-capital-provenance.ts';
import {validatePolicyCapitalProof,requirePolicyCapitalProvenance} from './testnet-policy-capital.ts';
import {sourceRefundTerms,refundContext,verifyBaseRefund,forwardRefundPayoutTerms} from './source-refunds.ts';
import {validatePreparedZcash,type PreparedZcashTransaction} from './reverse-settlement.ts';
import {requireFreshLiveSourceCheckpoints} from './live-dispatch-scope.ts';
import type {LiveRefundContext,LiveRefundState} from './market-refund-dispatch.ts';
const {privateFile,saveFile,pin}=marketNativeStorage;
function need(v:unknown,code:string):asserts v{if(!v)throw Error(code);}
type State=LiveRefundState&{marketContext:MarketWorkerOrderContext;operatorProfileSha256:string;nativeConfigSha256?:string};
export const loadMarketRefundNative=(path:string)=>loadMarketNative(path,'refund');
const directory=(loaded:LoadedMarketNative,id:string)=>{need(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id),'MARKET_REFUND_ID');return loaded.verified.profile.roots.state+'/market-refund-orders/'+id;};
export function marketRefundRequest(q:any,row:any,source:any,cancelHash:string,contract:string,token:string){
 return {version:1,purpose:'market-refund-v1',kind:'ZCASH_SOURCE_REFUND',orderId:q.id,depositId:source.row.deposit_id,settlementId:source.id,
  recipient:source.recipient,amountZatoshi:source.row.received_amount,maxFeeZatoshi:source.row.refund_fee,
  quote:{id:q.id,direction:q.direction,executionMode:q.executionMode,priceMode:'market-reference',inputAmount:q.inputAmount,outputAmount:q.outputAmount,recipient:q.recipient,refundRecipient:q.refundRecipient,acceptedAt:q.acceptedAt,quoteExpiresAt:q.quoteExpiresAt,pricing:q.pricing},
  source:{depositId:source.row.deposit_id,receivedAmount:source.row.received_amount,classification:source.row.classification},
  base:{chainId:84532,contract,token,cancelTxHash:cancelHash,cancelBlockNumber:String(row.base_height),cancelBlockHash:'0x'+row.base_block}};
}
class CancelSigner extends LocalBaseSigner{prepareCancellation():Promise<PreparedBaseTransaction>{return this.invoke({command:'prepare'});}}
export function marketRefundNativeContexts(loaded:LoadedMarketNative,pool:pg.Pool,keys:PrivateData,base:BaseContract,context:MarketWorkerOrderContext):LiveRefundContext{
 const {c,verified,signer}=loaded,p=verified.profile;
 need(c.enabled&&c.mode==='MARKET_REFERENCE_REFUND_TESTNET'&&c.marketPolicySha256===context.policySha256,'MARKET_REFUND_PROFILE_SCOPE');
 const file=(id:string,name:string)=>directory(loaded,id)+'/'+name;
 const check=async(id:string)=>{await requireMarketPolicyWorkerOrder(pool,context,id);return requireAcceptedMarketQuote(pool,keys,id,context);};
 async function save(s:LiveRefundState){const state=s as State;need(state.operatorProfileSha256===verified.profileSha256&&isDeepStrictEqual(state.marketContext,context),'MARKET_REFUND_STATE_SCOPE');await saveFile(file(s.orderId,'state.private.json'),s);}
 async function capital(id:string,digest:string,source:Awaited<ReturnType<typeof sourceRefundTerms>>){
  const path=file(id,'capital-approval.private.json'),raw=await privateFile(path,true),a=JSON.parse(raw.toString());
  need(a.version===1&&a.purpose==='market-refund-v1'&&a.orderId===id&&a.approvedDigest===digest&&a.marketPolicySha256===context.policySha256&&a.sourceFingerprint===p.identity.sourceFingerprint&&Array.isArray(a.sources)&&a.sources.length<=99,'MARKET_REFUND_ROOT_CAPITAL');
  const own=a.sources.filter((s:CapitalSource)=>s.kind==='refund-source');need(own.length===1&&own[0].orderId===id,'MARKET_REFUND_OWN_SOURCE_PROVENANCE');
  for(const s of a.sources)need(s.path.startsWith(directory(loaded,id)+'/proofs/')&&['refund-source','settled-source','confirmed-own-change','confirmed-refund-own-change','discharged-refund-residual'].includes(s.kind),'MARKET_REFUND_PROOF_SCOPE');
  const provenance=await approvedMarketCapital(pool,keys,[{kind:'opening',...p.immutable.chefOpeningProof},...a.sources],id,context);
  need(a.capture.path.startsWith(p.roots.state+'/testnet-policy/'+context.policySha256+'/capital-captures/'),'MARKET_REFUND_CAPTURE_PATH');
  const physical=validatePolicyCapitalProof(JSON.parse((await pin(a.capture,true)).toString()),{policySha256:context.policySha256,profileSha256:verified.profileSha256,loaderSha256:c.scripts.profile!.sha256,captureScriptSha256:c.scripts.capitalCapture!.sha256}),notes=requirePolicyCapitalProvenance(physical.notes,provenance);
  need(isDeepStrictEqual(notes,a.notes),'MARKET_REFUND_CURRENT_CAPITAL');return{path,sha256:linuxRawSha256(raw),notes};
 }
 return {pool,keys,base,load:async id=>{await check(id);await mkdir(directory(loaded,id),{recursive:true,mode:0o700});need(await realpath(directory(loaded,id))===directory(loaded,id),'MARKET_REFUND_DIRECTORY');try{const s=JSON.parse((await privateFile(file(id,'state.private.json'))).toString());need(s.orderId===id&&s.operatorProfileSha256===verified.profileSha256&&isDeepStrictEqual(s.marketContext,context),'MARKET_REFUND_STATE_BINDING');return s;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;return{version:1,orderId:id,marketContext:context,operatorProfileSha256:verified.profileSha256} as State;}},save,
  nativeJournal:async s=>{try{const j=JSON.parse((await privateFile(file(s.orderId,'refund-intent.private.json'))).toString());return{exists:true,broadcast:['BROADCAST_UNKNOWN','BROADCAST_ACKNOWLEDGED','DELIVERY_CONFIRMED'].includes(j.state)};}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;return{exists:false,broadcast:false};}},
  wallet:async s=>{await check(s.orderId);need(s.approvedDigest&&(s as State).nativeConfigSha256===linuxRawSha256(await privateFile(file(s.orderId,'prepared.private.json'))),'MARKET_REFUND_PREPARED_PIN');return new LocalReverseWalletAdapter(c.python,[c.scripts.supervisor!.path,'--config',file(s.orderId,'prepared.private.json')],s.approvedDigest,true);},
  prepareCancel:async(s,source)=>{await check(s.orderId);const id=s.orderId,approved={version:1,kind:'SOURCE_REFUND_BASE',orderId:id,id:source.id,phase:'CANCEL',token:base.registry.contracts.MockUSDC.address,payer:base.registry.operator,refundRecipient:base.registry.operator,amount:source.row.received_amount,cancellationAvailableAt:'0'},digest=approvalDigest(approved);need(!s.baseApprovedDigest||s.baseApprovedDigest===digest,'MARKET_REFUND_CANCEL_IMMUTABLE');const approvedPath=file(id,'cancel-approved.private.json');await saveFile(approvedPath,approved,true);const config=file(id,'cancel-signer.private.json');await saveFile(config,{...signer,refundApprovedRequest:approvedPath,refundApprovedDigest:digest},true);s.baseApprovedDigest=digest;await save(s);return new CancelSigner(c.python,[c.scripts.ownedKernel!.path,'--kind','base-refund','--script',c.scripts.refundBaseSigner!.path,'--config',config],120000,true).prepareCancellation();},
  approveNative:async(s,row,source)=>{const id=s.orderId,q=await check(id),cancel=keys.open(row.base_payload,refundContext(id,'CANCEL')) as PreparedBaseTransaction,approved=marketRefundRequest(q,row,source,cancel.hash,base.registry.contracts.ZeeSwapSettlement.address,base.registry.contracts.MockUSDC.address),digest=approvalDigest(approved);need(!s.approvedDigest||s.approvedDigest===digest,'MARKET_REFUND_APPROVAL_IMMUTABLE');const cap=await capital(id,digest,source),approvedRequest=file(id,'approved.private.json'),approvedRequestSha256=await saveFile(approvedRequest,approved,true),preflight=file(id,'preflight.private.json'),preflightConfigSha256=await saveFile(preflight,{readCommand:[p.artifacts.reader.path],rpcUrl:base.registry.rpcUrl,hashCommand:[p.artifacts.cast.path,'keccak']},true),guard=file(id,'guard.private.json');await saveFile(guard,{version:1,configPath:loaded.path,orderId:id,statePath:file(id,'state.private.json'),approvedRequest,approvedDigest:digest},true);
   const prefix=[c.node.path,'--import',pathToFileURL(p.roots.release+'/app/api/node_modules/tsx/dist/loader.mjs').href,c.scripts.guard!.path,guard],prepared={version:1,nativePurpose:'market-refund-v1',linuxProfilePath:c.operatorProfile,linuxProfileSha256:verified.profileSha256,rootConfigPath:loaded.path,rootConfigSha256:loaded.rootConfigSha256,walletDir:p.paths.operatorWallet,operatorUfvkFile:p.paths.operatorUfvk,lockPath:p.paths.walletLock,capitalUfvkSha256:p.identity.sourceFingerprint,recipientProofMode:'operator-outgoing-recovery',cliCommand:[p.artifacts.zingo.path],readCommand:[p.artifacts.reader.path],verifyCommand:[p.artifacts.verify.path],protoDir:c.protoDir,approvedRequest,approvedDigest:digest,approvedRequestSha256,approvedCapitalNotes:cap.notes,capitalApprovalPath:cap.path,capitalApprovalSha256:cap.sha256,marketContext:context,journalPath:file(id,'refund-intent.private.json'),preflightConfigSha256,preflightCommand:[c.python,c.scripts.preflight!.path,'--config',preflight,'--approved-request',approvedRequest,'--approved-digest',digest,'--registry',p.immutable.registry.path],authorizationCommand:[...prefix,'authority'],beforeBroadcastGuardCommand:[...prefix,'broadcast']};(s as State).nativeConfigSha256=await saveFile(file(id,'prepared.private.json'),prepared,true);s.approvedDigest=digest;await save(s);}
 };
}

export async function runMarketRefundNativeGuard(path:string,mode:'authority'|'broadcast',input?:any){
 const guard=JSON.parse((await privateFile(path)).toString()),loaded=await loadMarketRefundNative(guard.configPath),{c,verified}=loaded,d=directory(loaded,guard.orderId);
 need(c.enabled&&path===d+'/guard.private.json'&&guard.statePath===d+'/state.private.json'&&guard.approvedRequest===d+'/approved.private.json','MARKET_REFUND_GUARD_PATH');
 const s=JSON.parse((await privateFile(guard.statePath)).toString()) as State,approved=JSON.parse((await privateFile(guard.approvedRequest)).toString());need(s.orderId===guard.orderId&&s.approvedDigest===guard.approvedDigest&&s.operatorProfileSha256===verified.profileSha256&&s.marketContext.policySha256===c.marketPolicySha256&&approvalDigest(approved)===guard.approvedDigest&&s.nativeConfigSha256===linuxRawSha256(await privateFile(d+'/prepared.private.json'))&&s.operatorBackendPid&&s.refundEpoch,'MARKET_REFUND_GUARD_STATE');
 const {runtime,registry}=verified,pool=connect(runtime.workerUrl,1),keys=new PrivateData(Buffer.from(runtime.payloadKeyHex,'hex'),Buffer.from(runtime.lookupKeyHex,'hex')),base=new BaseContract(registry);
 try{
  const who=(await pool.query('SELECT current_database() database,current_user role')).rows[0];need(who?.database==='zee_app_20261023'&&who.role==='zee_app_worker_20261023','MARKET_REFUND_DATABASE');
  const lock=(await pool.query(`SELECT EXISTS(SELECT 1 FROM pg_locks l JOIN pg_database d ON d.oid=l.database WHERE d.datname=current_database() AND l.locktype='advisory' AND l.pid=$1 AND l.classid=84532::oid AND l.objid=20261023::oid AND l.objsubid=2 AND l.granted) owned`,[s.operatorBackendPid])).rows[0];need(lock?.owned,'MARKET_REFUND_OPERATOR_LOCK');
  await requireMarketPolicyWorkerOrder(pool,s.marketContext,s.orderId);const q=await requireAcceptedMarketQuote(pool,keys,s.orderId,s.marketContext),source=await sourceRefundTerms(pool,keys,s.orderId),row=(await pool.query('SELECT * FROM zee.source_refunds WHERE order_id=$1',[s.orderId])).rows[0];need(row?.base_confirmed&&row.base_phase==='CANCEL'&&!row.confirmed,'MARKET_REFUND_CANCEL_REQUIRED');
  const cancel=keys.open(row.base_payload,refundContext(s.orderId,'CANCEL')) as PreparedBaseTransaction,expected=marketRefundRequest(q,row,source,cancel.hash,registry.contracts.ZeeSwapSettlement.address,registry.contracts.MockUSDC.address);need(isDeepStrictEqual(approved,expected)&&await verifyBaseRefund(base,source.id,'CANCEL',cancel.hash),'MARKET_REFUND_ACCEPTED_SOURCE_OR_CANCEL');
  if(mode==='broadcast'){need(input&&Object.keys(input).sort().join()==='approvedDigest,operationId,rawSha256,txid'&&input.operationId===s.orderId&&input.approvedDigest===guard.approvedDigest&&row.zcash_payload&&!row.confirmed,'MARKET_REFUND_BROADCAST_BINDING');const signed=keys.open(row.zcash_payload,refundContext(s.orderId,'ZCASH')) as PreparedZcashTransaction,terms=await forwardRefundPayoutTerms(pool,keys,s.orderId);validatePreparedZcash(signed,terms);const cp=(await pool.query("SELECT scanned_height FROM zee.scanner_checkpoints WHERE network='zcash-testnet'")).rows[0];need(cp&&signed.txid===input.txid&&keys.lookup('zcash-tx',input.txid).equals(row.zcash_hash)&&linuxRawSha256(Buffer.from(signed.rawTransaction,'hex'))===input.rawSha256&&BigInt(signed.expiryHeight)>=BigInt(cp.scanned_height)+20n,'MARKET_REFUND_ORIGINAL_BYTES');}
  need(s.refundEpoch===s.marketContext.activeEpoch,'MARKET_REFUND_EPOCH');await requireFreshLiveSourceCheckpoints(pool);await pool.query('SELECT zee.check_market_source_refund_signing($1,$2)',[s.orderId,Buffer.from(s.marketContext.policySha256,'hex')]);
  return mode==='authority'?{authorized:true,orderId:s.orderId,approvedDigest:guard.approvedDigest}:{authorized:true,operationId:s.orderId,approvedDigest:guard.approvedDigest,txid:input.txid,rawSha256:input.rawSha256};
 }finally{await pool.end();}
}
