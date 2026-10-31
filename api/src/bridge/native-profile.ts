import {createHash} from 'node:crypto';
import {lstat,mkdir,open,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import type {BridgeStore} from './repository.ts';
import {digest} from './model.ts';
import {PausedBridgeRuntime,validateNativeSnapshot} from './runtime.ts';
import {nativeDigest,type NativeBridgeRequest} from './adapters/native-authority.ts';
import {pinnedFile,type FilePin} from './adapters/profile.ts';
import type {NativeCommandProfile} from './adapters/native.ts';
import type {PermitBinding} from './operator-qualification.ts';
import type {Books,Order} from './model.ts';
import {PublicBridgePilotRuntime} from './public-pilot.ts';

export type NativeSpendTemplate={python:FilePin;worker:FilePin;template:FilePin;ownedSupervisor:FilePin;fastBaseL2?:FilePin};
/** Explicit immutable approval from current canonical inventory. No calculation
 * or wallet send occurs. A partial/existing directory requires Root review. */
export async function approveNativeProfile(store:BridgeStore,runtime:PausedBridgeRuntime,binding:PermitBinding,config:NativeSpendTemplate,id:string):Promise<NativeCommandProfile>{return approveProfile(store,runtime,config,id,(o,b)=>{const p=binding.permit;if(b.qualification?.permitSha256!==binding.sha256||b.qualification.permitId!==p.permitId||o.recipient!==p.reverse.recipient||o.payer!==p.reverse.payer)throw Error('BRIDGE_NATIVE_APPROVAL_SCOPE');});}
export async function approvePublicNativeProfile(store:BridgeStore,runtime:PublicBridgePilotRuntime,config:NativeSpendTemplate,id:string){if(!(runtime instanceof PublicBridgePilotRuntime))throw Error('BRIDGE_CONCRETE_PUBLIC_RUNTIME_REQUIRED');return approveProfile(store,runtime,config,id,(o,b)=>runtime.assertOrder(o,b));}
async function approveProfile(store:BridgeStore,runtime:PausedBridgeRuntime,config:NativeSpendTemplate,id:string,scope:(o:Readonly<Order>,b:Readonly<Books>)=>void):Promise<NativeCommandProfile>{return store.update(async b=>{
 const o=b.orders[id];if(!o)throw Error('BRIDGE_ORDER_NOT_FOUND');scope(o,b);
 if(!b.paused||b.incident||!o.accepted||o.status!=='REDEMPTION_PENDING'||o.amountAtomic!=='100000'||o.direction!=='ZEETAZ_TO_TAZ'||!o.source||o.attempt||o.nativeProfile)throw Error('BRIDGE_NATIVE_APPROVAL_SCOPE');
 await runtime.base.assertCanonicalOrder(o,b);const {s,c}=await runtime.observe(b);b.pair={zcash:s.zcash,base:c.anchor};
 const principal=s.notes.filter(n=>n.role==='principal'),fees=s.notes.filter(n=>n.role==='fee');
 if(principal.length!==1||principal[0].value!=='100000'||fees.length<1||fees.length>10||fees.some(n=>n.value!=='10000')||s.controlledZatoshi!==b.controlled)throw Error('BRIDGE_NATIVE_EXACT_INVENTORY_REQUIRED');
 await pinnedFile(config.ownedSupervisor);const template=JSON.parse((await pinnedFile(config.template,true)).toString());
 if(template.root!=='/opt/zeeswap-bridge-testnet'||template.signingWallet!==template.root+'/signing'||template.viewingWallet!==template.root+'/viewing'||template.ufvkFile!==template.root+'/bridge.testnet.ufvk'||template.serviceUid!==process.getuid?.()||template.modules?.bridge_native_wallet?.path!==config.worker.path||template.modules?.bridge_native_wallet?.sha256!==config.worker.sha256||template.principalAccount!==b.principalAccount||template.feeAccount!==b.feeAccount||template.swapAccount!==b.swapAccount)throw Error('BRIDGE_NATIVE_TEMPLATE_BINDING');
 const parent=join(template.root,'orders'),parentStat=await lstat(parent);if(!parentStat.isDirectory()||parentStat.isSymbolicLink()||parentStat.uid!==process.getuid?.()||(parentStat.mode&0o077)!==0||await realpath(parent)!==parent)throw Error('BRIDGE_NATIVE_ORDERS_DIRECTORY');
 const dir=join(parent,id);await mkdir(dir,{mode:0o700});
 const base=runtime.base.profile,q:NativeBridgeRequest={version:1,purpose:'bridge-redemption',intentId:digest(['bridge-delivery-v1',o.id,o.commitment]),orderId:o.id,bridgeId:o.commitment,recipient:o.recipient,amountZatoshi:o.amountAtomic,maxFeeZatoshi:'10000',payoutCommitment:o.commitment,salt:o.salt,commitmentInput:{direction:o.direction,amountAtomic:o.amountAtomic,recipient:o.recipient,payer:o.payer},base:{chainId:84532,contract:base.contractAddress.toLowerCase(),runtimeCodeHash:base.runtimeCodeHash,payer:o.payer!.toLowerCase(),amountAtomic:o.amountAtomic,transactionHash:o.source.transactionHash as `0x${string}`,blockNumber:String(o.source.blockHeight),blockHash:o.source.blockHash,operator:base.operator.toLowerCase(),authorizer:base.authorizer.toLowerCase(),admin:base.admin.toLowerCase()},paired:b.pair};
 const write=async(path:string,value:unknown)=>{const bytes=Buffer.from(JSON.stringify(value)),file=await open(path,'wx',0o600);try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}return {path,sha256:createHash('sha256').update(bytes).digest('hex')};};
 const request=await write(join(dir,'approved.private.json'),q),note=(n:typeof s.notes[number],role:'principal'|'fee')=>({pool:n.pool,txid:n.txid,index:n.index,value:n.value,role});
 const profile={...template,...(config.fastBaseL2?{fastBaseL2:config.fastBaseL2}:{}),approvedRequest:request,approvedDigest:nativeDigest(q),capitalNotes:[note(principal[0],'principal'),note(fees[0],'fee')],extraFeeNotes:fees.slice(1).map(n=>note(n,'fee'))};
 const profilePin=await write(join(dir,'profile.private.json'),profile),directory=await open(dir,'r');try{await directory.sync();}finally{await directory.close();}const outer=await open(parent,'r');try{await outer.sync();}finally{await outer.close();}
 const pins={python:config.python,worker:config.worker,profile:profilePin,approvedRequest:request,approvedDigest:profile.approvedDigest,ownedSupervisor:config.ownedSupervisor};o.nativeProfile=pins;return pins;
 });}
