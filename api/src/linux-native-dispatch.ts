import {validatePolicyCapitalProof,requirePolicyCapitalProvenance} from './testnet-policy-capital.ts';
import {requirePolicyWorkerOrder,validatePolicyWorkerOrderContext,type PolicyWorkerOrderContext} from './testnet-policy-refund.ts';
/** Linux physical transport for the existing native reverse/refund kernels. */
import {readFile,lstat,realpath,mkdir,open,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {posix} from 'node:path';
import {pathToFileURL} from 'node:url';
import type pg from 'pg';
import {linuxRawSha256,verifyLinuxOperatorProfile,type PinnedFile,type LinuxOperatorProfile} from './linux-testnet-profile.ts';
import {LIVE_DISPATCH_SCOPE as scope,type LiveBaseSignerConfig} from './live-dispatch-scope.ts';
import {LocalReverseBaseSigner,LocalBaseSigner,type PreparedBaseTransaction} from './base-signer.ts';
import {LocalReverseWalletAdapter} from './reverse-wallet-adapter.ts';
import {escrowTerms} from './base-escrow.ts';
import {reversePayoutTerms} from './reverse-settlement.ts';
import {approvalDigest} from './reverse-authority.ts';
import {approvedLiveReverseCapital,type CapitalSource} from './live-reverse-capital.ts';
import type {PrivateData} from './private-data.ts';
import type {BaseContract} from './base-contract.ts';
import type {LiveReverseContext,LiveReverseState} from './live-reverse-dispatch.ts';
import type {LiveRefundContext,LiveRefundState} from './live-source-refund.ts';
import {refundContext} from './source-refunds.ts';
import {workerExecutionPins,type ForwardFastExecutionApproval,type WorkerExecutionPin} from './testnet-policy-execution.ts';
import {escrowInclusionContext} from './base-escrow.ts';

export type NativePurpose='reverse'|'refund';
export type LinuxNativeConfig={version:1;mode:'LINUX_TESTNET_REVERSE'|'LINUX_TESTNET_REFUND';enabled:boolean;operatorProfile:string;
 python:string;node:PinnedFile;signerConfig:PinnedFile;handoffProof:string;protoDir:string;pollSeconds:5|10;maxCycles:number;maxAmountZatoshi:string;
 scripts:Record<'native'|'profile'|'supervisor'|'preparedKernel'|'refundKernel'|'outgoingKernel'|'preflight'|'guard'|'baseSigner',PinnedFile>};
type NativeState=(LiveReverseState|LiveRefundState)&{operatorProfileSha256?:string;nativeConfigSha256?:string;policyContext?:PolicyWorkerOrderContext};
export type LoadedLinuxNative=Awaited<ReturnType<typeof loadLinuxNativeDispatch>>;
export interface NativeFastExecutionApproval {version:1;purpose:'ROOT_BASE_L2_FAST_NATIVE_EXECUTION';originalNativeProfileSha256:string;profileSha256:string;policySha256:string;activeEpoch:string;executionRoot:string;publicCommit:string;executionManifest:WorkerExecutionPin;scripts:LinuxNativeConfig['scripts'];}
function need(value:unknown,code:string):asserts value{if(!value)throw Error(code);}
const inside=(p:string,root:string)=>posix.isAbsolute(p)&&posix.normalize(p)===p&&p.startsWith(root+'/');
async function pinned(pin:PinnedFile,secret:boolean){const s=await lstat(pin.path);need(s.isFile()&&!s.isSymbolicLink()&&await realpath(pin.path)===pin.path&&(!secret||(s.mode&0o027)===0),'LINUX_NATIVE_PROTECTED_FILE');const b=await readFile(pin.path);need(linuxRawSha256(b)===pin.sha256,'LINUX_NATIVE_PIN_CHANGED');return b;}
export function nativeOrderDirectory(profile:LinuxOperatorProfile,purpose:NativePurpose,id:string){need(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id),'LINUX_NATIVE_ORDER_REQUIRED');return profile.roots.state+`/${purpose}-orders/`+id;}
export function validateLinuxNativeScope(c:LinuxNativeConfig,p:LinuxOperatorProfile,purpose:NativePurpose,signer:LiveBaseSignerConfig){
 need(c.version===1&&c.mode===(purpose==='reverse'?'LINUX_TESTNET_REVERSE':'LINUX_TESTNET_REFUND')&&typeof c.enabled==='boolean'&&[5,10].includes(c.pollSeconds)
  &&Number.isSafeInteger(c.maxCycles)&&c.maxCycles>=1&&c.maxCycles<=1000&&/^[1-9][0-9]*$/.test(c.maxAmountZatoshi)&&BigInt(c.maxAmountZatoshi)<=200000n,'LINUX_NATIVE_RUNTIME_SCOPE');
 need(c.operatorProfile===p.roots.secrets+'/linux-operator-profile.private.json'&&c.python===p.roots.base+'/tools/python/bin/python'
  &&c.signerConfig.path===p.roots.secrets+'/'+purpose+'-signer.private.json'&&c.handoffProof===p.roots.secrets+'/relocation-applied-proof.private.json'
  &&inside(c.protoDir,p.roots.release)&&(inside(c.node.path,'/usr/bin')||inside(c.node.path,p.roots.base+'/tools')),'LINUX_NATIVE_PHYSICAL_SCOPE');
 need(signer.operator.toLowerCase()===scope.operator&&signer.rpcUrl==='https://sepolia.base.org'&&signer.account===scope.account&&signer.token.toLowerCase()===scope.token
  &&signer.settlement.toLowerCase()===scope.settlement&&signer.tokenCodeHash===scope.tokenCodeHash&&signer.settlementCodeHash===scope.settlementCodeHash
  &&signer.cast===p.artifacts.cast.path&&signer.passwordFile===p.paths.basePassword&&signer.journalRoot===p.paths.baseJournal,'LINUX_NATIVE_SIGNER_SCOPE');
 const names={native:'workers/zcash-wallet/linux_native_wallet.py',profile:'workers/zcash-wallet/linux_operator_profile.py',supervisor:'workers/zcash-wallet/owned_wallet_call.py',
  preparedKernel:'workers/zcash-wallet/prepared_raw.py',refundKernel:'workers/zcash-wallet/refund_raw.py',outgoingKernel:'workers/zcash-wallet/outgoing_recovery.py',
  preflight:`workers/zcash-wallet/${purpose==='reverse'?'reverse':'refund'}_preflight.py`,guard:`api/scripts/${purpose}-linux-broadcast-guard.ts`,
  baseSigner:`workers/base-signer/${purpose==='reverse'?'reverse_signer':'refund_signer'}.py`};
 need(Object.keys(c.scripts).sort().join(',')===Object.keys(names).sort().join(','),'LINUX_NATIVE_SCRIPT_SET');
 for(const [name,relative] of Object.entries(names))need(c.scripts[name as keyof typeof names]?.path===p.roots.release+'/app/'+relative,'LINUX_NATIVE_RELEASE_SCRIPT');
 for(const pin of [c.node,c.signerConfig,...Object.values(c.scripts)])need(/^[0-9a-f]{64}$/.test(pin.sha256),'LINUX_NATIVE_CODE_PIN_REQUIRED');
}
export async function loadLinuxNativeDispatch(path:string,purpose:NativePurpose){
 need(process.platform==='linux'&&path===`/opt/zeeswap-testnet/secrets/${purpose}-profile.private.json`,'LINUX_NATIVE_EXACT_PROFILE');
 const bytes=await readFile(path),c=JSON.parse(bytes.toString()) as LinuxNativeConfig;
 need(c.operatorProfile==='/opt/zeeswap-testnet/secrets/linux-operator-profile.private.json','LINUX_NATIVE_OPERATOR_PROFILE');
 const verified=await verifyLinuxOperatorProfile(c.operatorProfile),p=verified.profile,pin=p.configPins?.[purpose+'Profile'];
 need(pin?.path===path&&pin.sha256===linuxRawSha256(bytes),'LINUX_NATIVE_MANIFEST_BINDING');
 const signer=JSON.parse((await pinned(c.signerConfig,true)).toString()) as LiveBaseSignerConfig;
 validateLinuxNativeScope(c,p,purpose,signer);
 need(c.node.path===process.execPath,'LINUX_NATIVE_NODE_EXECUTABLE');await pinned(c.node,false);
 for(const item of Object.values(c.scripts))await pinned(item,false);
 need(verified.registry.rpcUrl===signer.rpcUrl&&verified.registry.contracts.ZeeSwapSettlement.runtimeCodeHash===scope.settlementCodeHash
  &&verified.registry.contracts.MockUSDC.runtimeCodeHash===scope.tokenCodeHash,'LINUX_NATIVE_REGISTRY_CODE');
 const proof=JSON.parse((await readFile(c.handoffProof)).toString()),s=await lstat(c.handoffProof);
 need(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&0o027)===0&&await realpath(c.handoffProof)===c.handoffProof
  &&proof.status==='PREFUNDING_RELOCATION_VERIFIED'&&proof.profileSha256===verified.profileSha256&&proof.openingProofSha256===p.immutable.openingProof.sha256
  &&proof.branchId===scope.branchId&&proof.database===scope.database,'LINUX_NATIVE_HANDOFF_PROOF');
 need(process.env.HOME===p.roots.base+'/home','LINUX_NATIVE_ISOLATED_HOME');return {c,purpose,verified,signer,path,originalProfileLoaderSha256:c.scripts.profile.sha256,nativeFastExecution:undefined as undefined|{pin:WorkerExecutionPin;rootPin:WorkerExecutionPin;approval:NativeFastExecutionApproval}};
}
/** A separately Root-approved script overlay retains the original native financial profile. */
export async function applyLinuxNativeFastExecution(loaded:LoadedLinuxNative,rootPin:WorkerExecutionPin,root:ForwardFastExecutionApproval&{nativeExecution?:WorkerExecutionPin}){
 const pin=root.nativeExecution;need(loaded.purpose==='reverse'&&pin,'LINUX_NATIVE_FAST_REVERSE_ONLY');
 async function protectedPin(p:WorkerExecutionPin){const s=await lstat(p.path);need(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&0o077)===0&&await realpath(p.path)===p.path&&s.size<=1048576,'LINUX_NATIVE_FAST_ROOT_FILE');return pinned(p,true);}
 need(JSON.stringify(JSON.parse((await protectedPin(rootPin)).toString()))===JSON.stringify(root),'LINUX_NATIVE_FAST_PARENT_CHANGED');
 const a=JSON.parse((await protectedPin(pin)).toString()) as NativeFastExecutionApproval;
 need(a.version===1&&a.purpose==='ROOT_BASE_L2_FAST_NATIVE_EXECUTION'&&a.originalNativeProfileSha256===linuxRawSha256(await readFile(loaded.path))&&a.profileSha256===loaded.verified.profileSha256&&a.profileSha256===root.profileSha256&&a.policySha256===root.policySha256&&a.activeEpoch===root.activeEpoch&&a.executionRoot===root.executionRoot&&a.publicCommit===root.publicCommit&&JSON.stringify(a.executionManifest)===JSON.stringify(root.executionManifest),'LINUX_NATIVE_FAST_BINDING');
 const pins=workerExecutionPins(JSON.parse((await protectedPin(a.executionManifest)).toString()),a.executionRoot,a.publicCommit);
 need(Object.keys(a.scripts).sort().join()===Object.keys(loaded.c.scripts).sort().join(),'LINUX_NATIVE_FAST_SCRIPT_SET');
 for(const [name,original] of Object.entries(loaded.c.scripts)){const replacement=a.scripts[name as keyof typeof a.scripts],relative=original.path.slice(loaded.verified.profile.roots.release.length+'/app/'.length);need(replacement.path===a.executionRoot+'/'+relative&&pins.some(p=>p.path===replacement.path&&p.sha256===replacement.sha256),'LINUX_NATIVE_FAST_SCRIPT_MANIFEST');const s=await lstat(replacement.path);need(s.uid===0&&(s.mode&0o022)===0,'LINUX_NATIVE_FAST_SCRIPT_OWNER');await pinned(replacement,false);}
 return {...loaded,c:{...loaded.c,scripts:a.scripts},nativeFastExecution:{pin,rootPin,approval:a}};
}

/** Root reviews this mutable per-order file. Pinned root profiles and the
 * prefunding relocation proof never need to change after a customer deposit. */
export async function linuxPerOrderCapital(loaded:LoadedLinuxNative,pool:pg.Pool,keys:PrivateData,id:string,policyContext?:PolicyWorkerOrderContext){
 const p=loaded.verified.profile,directory=nativeOrderDirectory(p,loaded.purpose,id),path=directory+'/capital-approval.private.json';
 const s=await lstat(path);need(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&await realpath(path)===path&&(s.mode&0o027)===0,'LINUX_CAPITAL_PROTECTED_APPROVAL');
 const bytes=await readFile(path),approval=JSON.parse(bytes.toString());
 validateLinuxCapitalApproval(p,loaded.purpose,id,approval,policyContext);
 const sources:CapitalSource[]=[{kind:'opening',...p.immutable.chefOpeningProof},...approval.sources];
 let notes=await approvedLiveReverseCapital(pool,keys,sources,loaded.purpose==='refund'?id:undefined,policyContext);
 if(policyContext){
  await requirePolicyWorkerOrder(pool,policyContext,id);
  const pc=approval.policyCapital;need(pc?.version===1&&pc.policySha256===policyContext.policySha256&&inside(pc.capture?.path,directory+'/proofs')&&/^[0-9a-f]{64}$/.test(pc.capture?.sha256),'POLICY_CAPITAL_ROOT_BINDING');
  const stat=await lstat(pc.capture.path);need(stat.isFile()&&!stat.isSymbolicLink()&&stat.uid===0&&(stat.mode&0o027)===0&&stat.size<=1048576&&await realpath(pc.capture.path)===pc.capture.path,'POLICY_CAPITAL_ROOT_FILE');
  const raw=await readFile(pc.capture.path);need(linuxRawSha256(raw)===pc.capture.sha256,'POLICY_CAPITAL_RAW_CHANGED');
  const current=validatePolicyCapitalProof(JSON.parse(raw.toString()),{policySha256:policyContext.policySha256,profileSha256:loaded.verified.profileSha256,loaderSha256:loaded.originalProfileLoaderSha256,captureScriptSha256:linuxRawSha256(await readFile(p.roots.release+'/app/workers/zcash-wallet/testnet_policy_capital.py'))});
  need(pc.observedAt===current.observedAt&&JSON.stringify(pc.notes)===JSON.stringify(current.notes),'POLICY_CAPITAL_ROOT_CAPTURE_CHANGED');
  notes=requirePolicyCapitalProvenance(current.notes,notes);
 }
 return {notes,path,sha256:linuxRawSha256(bytes)};
}
export function validateLinuxCapitalApproval(p:LinuxOperatorProfile,purpose:NativePurpose,id:string,approval:any,policyContext?:PolicyWorkerOrderContext){
 if(policyContext)validatePolicyWorkerOrderContext(policyContext,id);
 const directory=nativeOrderDirectory(p,purpose,id);
 need(approval.version===1&&approval.orderId===id&&approval.sourceFingerprint===p.identity.sourceFingerprint
  &&approval.openingProofSha256===p.immutable.chefOpeningProof.sha256&&Array.isArray(approval.sources)&&approval.sources.length<=99,'LINUX_CAPITAL_APPROVAL_IDENTITY');
 for(const source of approval.sources as CapitalSource[]){need(['settled-source','confirmed-own-change',...(purpose==='reverse'||policyContext?['confirmed-refund-own-change','discharged-refund-residual']:[]),...(purpose==='refund'?['refund-source']:[])].includes(source.kind)
  &&inside(source.path,directory+'/proofs')&&/^[0-9a-f]{64}$/.test(source.sha256),'LINUX_CAPITAL_EXPLICIT_PROOF_SCOPE');}
 if(purpose==='refund')need(approval.sources.some((source:CapitalSource)=>source.kind==='refund-source'&&source.orderId===id),'LINUX_REFUND_OWN_SOURCE_REQUIRED');
}
async function exclusivePrivate(path:string,value:unknown){
 const bytes=JSON.stringify(value,null,2);try{const file=await open(path,'wx',0o600);try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}}
 catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;need((await readFile(path,'utf8'))===bytes,'LINUX_NATIVE_IMMUTABLE_FILE_CHANGED');}
 return linuxRawSha256(bytes);
}
async function savedState(path:string,state:unknown){const bytes=JSON.stringify(state,null,2),temp=path+'.'+randomUUID()+'.tmp',file=await open(temp,'wx',0o600);try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}await rename(temp,path);if(process.platform==='linux'){const dir=await open(posix.dirname(path),'r');try{await dir.sync();}finally{await dir.close();}}}
class CancelSigner extends LocalBaseSigner{prepareCancellation():Promise<PreparedBaseTransaction>{return this.invoke({command:'prepare'});}}

export function linuxNativeContexts(loaded:LoadedLinuxNative,pool:pg.Pool,keys:PrivateData,base:BaseContract,policyContext?:PolicyWorkerOrderContext){
 const {c,purpose,verified,signer}=loaded,p=verified.profile;

 const directory=(id:string)=>nativeOrderDirectory(p,purpose,id),file=(id:string,name:string)=>directory(id)+'/'+name;
 async function save(state:NativeState){need(state.operatorProfileSha256===verified.profileSha256,'LINUX_NATIVE_STATE_PROFILE');await savedState(file(state.orderId,'state.private.json'),state);}
 async function load(id:string):Promise<NativeState>{const dir=directory(id);if(policyContext)await requirePolicyWorkerOrder(pool,policyContext,id);await mkdir(dir,{recursive:true,mode:0o700});need(await realpath(dir)===dir,'LINUX_NATIVE_ORDER_SYMLINK');
  try{const state=JSON.parse(await readFile(file(id,'state.private.json'),'utf8'));need(state.orderId===id&&state.operatorProfileSha256===verified.profileSha256&&JSON.stringify(state.policyContext)===JSON.stringify(policyContext),'LINUX_NATIVE_STATE_BINDING');return state;}
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;return {version:1,orderId:id,operatorProfileSha256:verified.profileSha256,...(policyContext?{policyContext}:{})};}}
 const nativeCommand=(id:string)=>[c.scripts.native.path,'--config',file(id,'prepared.private.json')];
 async function wallet(state:NativeState){need(state.approvedDigest&&state.nativeConfigSha256&&linuxRawSha256(await readFile(file(state.orderId,'prepared.private.json')))===state.nativeConfigSha256,'LINUX_NATIVE_PREPARED_STATE_CHANGED');
  return new LocalReverseWalletAdapter(c.python,[c.scripts.supervisor.path,'--kind','native','--script',...nativeCommand(state.orderId)],state.approvedDigest,true);}
 async function nativeJournal(state:NativeState){try{const j=JSON.parse(await readFile(file(state.orderId,purpose==='reverse'?'payout-intent.private.json':'refund-intent.private.json'),'utf8'));return {exists:true,broadcast:['BROADCAST_UNKNOWN','BROADCAST_ACKNOWLEDGED','DELIVERY_CONFIRMED'].includes(j.state)};}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;return {exists:false,broadcast:false};}}
 async function approveNative(state:NativeState,approved:unknown){
  const id=state.orderId,digest=approvalDigest(approved);
  if(policyContext)await requirePolicyWorkerOrder(pool,policyContext,id,{profileSha256:verified.profileSha256,handoffSha256:linuxRawSha256(await readFile(c.handoffProof)),openingProofSha256:p.immutable.openingProof.sha256,settlementContract:base.registry.contracts.ZeeSwapSettlement.address,tokenContract:base.registry.contracts.MockUSDC.address});need(!state.approvedDigest||state.approvedDigest===digest,'LINUX_NATIVE_APPROVAL_CHANGED');
  const approvedPath=file(id,'approved.private.json'),approvedRequestSha256=await exclusivePrivate(approvedPath,approved),capital=await linuxPerOrderCapital(loaded,pool,keys,id,policyContext);
  const nativeFast=purpose==='reverse'?loaded.nativeFastExecution:undefined;
  const fastFields=nativeFast?{fastBaseInclusion:true,nativeFastExecution:nativeFast.pin,baseFastRoot:nativeFast.rootPin,policyContext,linuxProfilePath:c.operatorProfile,linuxProfileSha256:verified.profileSha256,rootConfigPath:loaded.path}:{};
  const preflightPath=file(id,'preflight.private.json'),preflightConfigSha256=await exclusivePrivate(preflightPath,{readCommand:[p.artifacts.reader.path],rpcUrl:base.registry.rpcUrl,hashCommand:[p.artifacts.cast.path,'keccak'],...fastFields});
  const guardPath=file(id,'guard.private.json'),guardConfigSha256=await exclusivePrivate(guardPath,{configPath:loaded.path,orderId:id,statePath:file(id,'state.private.json'),approvedRequest:approvedPath,approvedDigest:digest});
  const prepared={...fastFields,liveProfile:p.profile,nativePurpose:purpose,linuxProfilePath:c.operatorProfile,linuxProfileSha256:verified.profileSha256,rootConfigPath:loaded.path,
   walletDir:p.paths.operatorWallet,operatorUfvkFile:p.paths.operatorUfvk,lockPath:p.paths.walletLock,capitalUfvkSha256:p.identity.sourceFingerprint,recipientProofMode:'operator-outgoing-recovery',
   cliCommand:[p.artifacts.zingo.path],readCommand:[p.artifacts.reader.path],verifyCommand:[p.artifacts.verify.path],protoDir:c.protoDir,
   approvedRequest:approvedPath,approvedDigest:digest,approvedRequestSha256,approvedCapitalNotes:capital.notes,capitalApprovalPath:capital.path,capitalApprovalSha256:capital.sha256,
   ...(policyContext?{policyContext}:{}),journalPath:file(id,purpose==='reverse'?'payout-intent.private.json':'refund-intent.private.json'),preflightConfigSha256,guardConfigSha256,
   preflightCommand:[c.python,c.scripts.preflight.path,'--config',preflightPath,'--approved-request',approvedPath,'--approved-digest',digest,'--registry',p.immutable.registry.path],
   beforeBroadcastGuardCommand:[c.node.path,'--import',pathToFileURL(p.roots.release+'/app/api/node_modules/tsx/dist/loader.mjs').href,c.scripts.guard.path,guardPath]};
  state.nativeConfigSha256=await exclusivePrivate(file(id,'prepared.private.json'),prepared);state.approvedDigest=digest;await save(state);
 }
 const shared={pool,keys,base,load,save,wallet,nativeJournal};
 const reverse:LiveReverseContext={...shared,fastBaseInclusion:!!loaded.nativeFastExecution,maxAmountZatoshi:c.maxAmountZatoshi,
  async baseSigner(state:LiveReverseState){const path=file(state.orderId,'base-signer.private.json');
   // Receipt inherits the OUTER base supervisor's process group. A nested
   // supervisor would create a second session outside that cleanup boundary.
   await savedState(path,{...signer,...(loaded.nativeFastExecution?{fastBaseInclusion:true}:{}),reverseApprovedRequest:file(state.orderId,'approved.private.json'),reverseApprovedDigest:state.approvedDigest??'0'.repeat(64),reverseReceiptCommand:[c.python,...nativeCommand(state.orderId)]});
   return new LocalReverseBaseSigner(c.python,[c.scripts.supervisor.path,'--kind','base-reverse','--script',c.scripts.baseSigner.path,'--config',path],true);},
  async approve(state:LiveReverseState){const id=state.orderId,terms=await escrowTerms(pool,keys,base,id),q=await reversePayoutTerms(pool,keys,id),row=(await pool.query('SELECT * FROM zee.escrow_commits WHERE order_id=$1 AND confirmed',[id])).rows[0];let included:any;if(!row&&loaded.nativeFastExecution){need((await pool.query("SELECT zee.escrow_inclusion_ready($1,'COMMIT') ready",[id])).rows[0]?.ready,'LINUX_NATIVE_FRESH_COMMIT_REQUIRED');included=(await pool.query("SELECT receipt_payload FROM zee.escrow_inclusions WHERE order_id=$1 AND phase='COMMIT' AND valid",[id])).rows[0];}need(row||included,'LINUX_NATIVE_FINALIZED_COMMIT_REQUIRED');
   const proof=row?keys.open(row.receipt_payload,`escrow-proof:${id}:v1`) as any:keys.open(included.receipt_payload,escrowInclusionContext(id,'COMMIT')) as any;
   await approveNative(state,{version:1,orderId:id,settlementId:terms.id,recipient:q.recipient,amountZatoshi:q.amountZatoshi,maxFeeZatoshi:q.maxFeeZatoshi,
    base:{chainId:84532,contract:base.registry.contracts.ZeeSwapSettlement.address,token:terms.token,payer:terms.payer,refundRecipient:terms.refundRecipient,amountAtomic:terms.amount,cancellationAvailableAt:terms.cancellationAvailableAt,commitTxHash:proof.transactionHash,commitBlockNumber:String(proof.blockHeight),commitBlockHash:proof.blockHash}});}
 };
 const refund:LiveRefundContext={...shared,policyContext,
  async prepareCancel(state,source){const id=state.orderId,approved={version:1,kind:'SOURCE_REFUND_BASE',orderId:id,id:source.id,phase:'CANCEL',token:base.registry.contracts.MockUSDC.address,payer:base.registry.operator,refundRecipient:base.registry.operator,amount:source.row.received_amount,cancellationAvailableAt:'0'},digest=approvalDigest(approved);
   need(!state.baseApprovedDigest||state.baseApprovedDigest===digest,'LINUX_REFUND_CANCEL_APPROVAL_CHANGED');const approvedPath=file(id,'cancel-approved.private.json');await exclusivePrivate(approvedPath,approved);
   const path=file(id,'cancel-signer.private.json');await exclusivePrivate(path,{...signer,refundApprovedRequest:approvedPath,refundApprovedDigest:digest});state.baseApprovedDigest=digest;await save(state);
   return new CancelSigner(c.python,[c.scripts.supervisor.path,'--kind','base-refund','--script',c.scripts.baseSigner.path,'--config',path],120000,true).prepareCancellation();},
  async approveNative(state,row,source){const id=state.orderId;await approveNative(state,{version:1,kind:'ZCASH_SOURCE_REFUND',orderId:id,depositId:source.row.deposit_id,settlementId:source.id,recipient:source.recipient,amountZatoshi:source.row.received_amount,maxFeeZatoshi:source.row.refund_fee,
   base:{chainId:84532,contract:base.registry.contracts.ZeeSwapSettlement.address,token:base.registry.contracts.MockUSDC.address,cancelTxHash:state.basePreparedHash??(keys.open(row.base_payload,refundContext(id,'CANCEL')) as PreparedBaseTransaction).hash,cancelBlockNumber:String(row.base_height),cancelBlockHash:'0x'+row.base_block}});}
 };
 return {reverse,refund};
}
