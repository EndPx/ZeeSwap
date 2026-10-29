import {createHash} from 'node:crypto';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {dirname,isAbsolute,resolve} from 'node:path';
import {isAddress} from 'viem';
import {coverage,guard,type Books,type Order} from './model.ts';
import {validateAnchor} from './model.ts';
import {PausedBridgeRuntime,type BridgeNativeRead} from './runtime.ts';
import type {BridgeStore} from './repository.ts';
import type {QuoteInput} from './service.ts';
import type {CanonicalBridgeBase} from './adapters/base.ts';
import {BridgeReverseCoordinator} from './reverse.ts';

export type QualificationPermit={version:1;purpose:'ROOT_OPERATOR_FUNDED_CIRCLE';permitId:string;createdAt:string;expiresAt:string;databaseName:string;databaseRole:string;nativeReadProfileSha256:string;contractAddress:string;runtimeCodeHash:string;principalAccount:string;feeAccount:string;swapAccount:string;amountAtomic:'100000';maxAcceptedPerDirection:1;maxConcurrent:1;forward:{recipient:string;refundRecipient:string};reverse:{payer:string;recipient:string}};
export type PermitBinding={permit:QualificationPermit;sha256:string};
export type QualificationContext={databaseName:string;databaseRole:string;nativeReadProfileSha256:string};
const exact=(v:unknown,keys:string)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join()!==keys.split(' ').sort().join())throw Error('BRIDGE_OPERATOR_PERMIT_FIELDS');};
export function validateQualificationPermit(p:QualificationPermit){
 exact(p,'version purpose permitId createdAt expiresAt databaseName databaseRole nativeReadProfileSha256 contractAddress runtimeCodeHash principalAccount feeAccount swapAccount amountAtomic maxAcceptedPerDirection maxConcurrent forward reverse');
 exact(p.forward,'recipient refundRecipient');exact(p.reverse,'payer recipient');
 if(p.version!==1||p.purpose!=='ROOT_OPERATOR_FUNDED_CIRCLE'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(p.permitId)||p.amountAtomic!=='100000'||p.maxAcceptedPerDirection!==1||p.maxConcurrent!==1||!/^zee_bridge_[a-z0-9_]+$/.test(p.databaseName)||!/^zee_bridge_runtime_[a-z0-9_]+$/.test(p.databaseRole)||!/^[a-f0-9]{64}$/.test(p.nativeReadProfileSha256)||!/^0x[a-f0-9]{64}$/.test(p.runtimeCodeHash))throw Error('BRIDGE_OPERATOR_PERMIT_SCOPE');
 for(const a of [p.contractAddress,p.forward.recipient,p.reverse.payer])if(!isAddress(a)||/^0x0+$/.test(a))throw Error('BRIDGE_OPERATOR_PERMIT_ADDRESS');
 for(const a of [p.forward.refundRecipient,p.reverse.recipient])if(typeof a!=='string'||a.length<1||a.length>512)throw Error('BRIDGE_OPERATOR_PERMIT_RECIPIENT');
 for(const t of [p.createdAt,p.expiresAt])if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(t)||new Date(t).toISOString()!==t)throw Error('BRIDGE_OPERATOR_PERMIT_TIME');
 if(Date.parse(p.createdAt)>Date.now()+5000||Date.parse(p.expiresAt)<=Date.parse(p.createdAt)||Date.parse(p.expiresAt)-Date.parse(p.createdAt)>86400000||new Set([p.principalAccount,p.feeAccount,p.swapAccount]).size!==3||[p.principalAccount,p.feeAccount,p.swapAccount].some(a=>typeof a!=='string'||!a.length||a.length>128))throw Error('BRIDGE_OPERATOR_PERMIT_TIME_OR_ACCOUNTS');
 return p;
}
/** Special Root-owned, group-readable authorization. Does not weaken pinnedFile. */
export async function readRootPermit(path:string,sha256:string):Promise<unknown>{
 if(process.platform!=='linux'||!process.getuid?.()||!isAbsolute(path)||resolve(path)!==path||!path.startsWith('/opt/zeeswap-bridge-testnet/private/')||!/^[a-f0-9]{64}$/.test(sha256))throw Error('BRIDGE_ROOT_PERMIT_PATH');
 const file=await lstat(path);if(!file.isFile()||file.isSymbolicLink()||file.uid!==0||file.gid!==977||(file.mode&0o777)!==0o640||file.size>16384||await realpath(path)!==path)throw Error('BRIDGE_ROOT_PERMIT_OWNERSHIP');
 for(let parent=dirname(path);;parent=dirname(parent)){const s=await lstat(parent);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0||(s.mode&0o022)!==0)throw Error('BRIDGE_ROOT_PERMIT_PARENT');if(parent===dirname(parent))break;}
 const bytes=await readFile(path);if(createHash('sha256').update(bytes).digest('hex')!==sha256)throw Error('BRIDGE_ROOT_PERMIT_PIN');
 const after=await lstat(path);if(after.ino!==file.ino||after.mtimeMs!==file.mtimeMs||after.uid!==0||after.gid!==977||(after.mode&0o777)!==0o640)throw Error('BRIDGE_ROOT_PERMIT_CHANGED');
 return JSON.parse(bytes.toString());
}
export async function loadRootQualificationPermit(path:string,sha256:string):Promise<PermitBinding>{return {permit:validateQualificationPermit(await readRootPermit(path,sha256) as QualificationPermit),sha256};}
/** Local operator quote/accept only. No HTTP writer uses this runtime. */
export class OperatorQualificationRuntime extends PausedBridgeRuntime {
 constructor(base:CanonicalBridgeBase,native:BridgeNativeRead,readonly binding:PermitBinding,context:QualificationContext,private reverse?:BridgeReverseCoordinator){
  super(base,native);const p=validateQualificationPermit(binding.permit);
  if(!/^[a-f0-9]{64}$/.test(binding.sha256)||p.databaseName!==context.databaseName||p.databaseRole!==context.databaseRole||p.nativeReadProfileSha256!==context.nativeReadProfileSha256||p.contractAddress.toLowerCase()!==base.profile.contractAddress.toLowerCase()||p.runtimeCodeHash!==base.profile.runtimeCodeHash||(['principalAccount','feeAccount','swapAccount'] as const).some(k=>p[k]!==native[k]))throw Error('BRIDGE_OPERATOR_PERMIT_BINDING');
 }
 private assertBinding(b:Readonly<Books>){const p=this.binding.permit;if(b.qualification?.permitId!==p.permitId||b.qualification.permitSha256!==this.binding.sha256||b.qualification.createdAt!==p.createdAt||b.qualification.expiresAt!==p.expiresAt)throw Error('BRIDGE_OPERATOR_ORIGINAL_PERMIT_REQUIRED');}
 assertOriginalBinding(b:Readonly<Books>){this.assertBinding(b);}
 assertAdmission(){if(Date.now()>=Date.parse(this.binding.permit.expiresAt))throw Error('BRIDGE_OPERATOR_PERMIT_EXPIRED');}
 input(direction:'TAZ_TO_ZEETAZ'|'ZEETAZ_TO_TAZ'):QuoteInput {const p=this.binding.permit;if(direction==='TAZ_TO_ZEETAZ')return {direction,amountAtomic:'100000',...p.forward};if(direction==='ZEETAZ_TO_TAZ')return {direction,amountAtomic:'100000',...p.reverse};throw Error('BRIDGE_INVALID_DIRECTION');}
 private assertOrder(o:Readonly<Order>){const q=this.input(o.direction);if(o.amountAtomic!==q.amountAtomic||o.recipient!==q.recipient||o.refundRecipient!==q.refundRecipient||o.payer!==q.payer)throw Error('BRIDGE_OPERATOR_ORDER_SCOPE');}
 private assertLimits(b:Readonly<Books>){
  for(const o of Object.values(b.orders))this.assertOrder(o);
  for(const d of ['TAZ_TO_ZEETAZ','ZEETAZ_TO_TAZ'])if(Object.values(b.orders).filter(o=>o.accepted&&o.direction===d).length>1)throw Error('BRIDGE_OPERATOR_DIRECTION_LIMIT');
  if(Object.values(b.orders).filter(o=>o.accepted&&!['MINTED','COMPLETED'].includes(o.status)).length>1)throw Error('BRIDGE_OPERATOR_CONCURRENCY_LIMIT');
 }
 async recheck(b:Readonly<Books>){this.assertAdmission();this.assertBinding(b);if(b.paused)throw Error('BRIDGE_OPERATOR_BOOK_NOT_OPEN');this.assertLimits(b);return this.reconcileRead(b);}
 async funding(o:Readonly<Order>,b?:Readonly<Books>){this.assertAdmission();this.assertOrder(o);if(o.direction==='ZEETAZ_TO_TAZ'){if(!b||!this.reverse)throw Error('BRIDGE_NATIVE_AUTHORITY_NOT_QUALIFIED');return this.reverse.funding(o,b);}return super.funding(o);}
 assertAcceptance(o:Readonly<Order>,b:Readonly<Books>){
  this.assertAdmission();this.assertBinding(b);this.assertOrder(o);this.assertLimits(b);
  if(Object.values(b.orders).some(x=>x.id!==o.id&&x.accepted&&x.direction===o.direction))throw Error('BRIDGE_OPERATOR_DIRECTION_LIMIT');
  if(Object.values(b.orders).some(x=>x.id!==o.id&&x.accepted&&!['MINTED','COMPLETED'].includes(x.status)))throw Error('BRIDGE_OPERATOR_CONCURRENCY_LIMIT');
 }
 async openQualification(store:BridgeStore){this.assertAdmission();return store.update(async b=>{
  if(!b.paused||b.incident)throw Error('BRIDGE_OPERATOR_PAUSED_OPEN_REQUIRED');
  if(b.qualification)this.assertBinding(b);else if(Object.keys(b.orders).length)throw Error('BRIDGE_OPERATOR_EMPTY_FIRST_OPEN_REQUIRED');
  this.assertLimits(b);await this.reconcileRead(b);if(!coverage(b).covered||BigInt(b.feeCapital)<10000n)throw Error('BRIDGE_OPERATOR_FEE_AND_COVERAGE_REQUIRED');
  // Explicit durable mode transition on this isolated book, never a cloned flag.
  b.qualification={permitId:this.binding.permit.permitId,permitSha256:this.binding.sha256,createdAt:this.binding.permit.createdAt,expiresAt:this.binding.permit.expiresAt};b.paused=false;guard(b,Date.now(),true);return {paused:false,permitId:this.binding.permit.permitId};
 });}
 async closeQualification(store:BridgeStore){return store.update(b=>{this.assertBinding(b);b.paused=true;return {paused:true,permitId:this.binding.permit.permitId};});}
 async refreshOpen(store:BridgeStore){this.assertAdmission();return store.update(async b=>{
  this.assertBinding(b);if(b.paused||b.incident)throw Error('BRIDGE_OPERATOR_BOOK_NOT_OPEN');this.assertLimits(b);
  const {s,c}=await this.observe(b);this.assertBooks(b,s,c);validateAnchor(s.zcash,Date.now(),true);validateAnchor(c.anchor,Date.now(),true);b.pair={zcash:s.zcash,base:c.anchor};
 });}
}
