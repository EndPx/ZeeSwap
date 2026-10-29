import {lstat,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import type pg from 'pg';
import type {PrivateData} from '../private-data.ts';
import {applyEvent,coverage,digest,integer,validateAnchor,type Anchor,type Books,type Funding,type Order,type VerifiedEvent} from './model.ts';
import {BridgeRepository,type BridgeStore} from './repository.ts';
import {BridgeService,type BridgeRuntime} from './service.ts';
import type {BridgeEvidenceVerifier} from './worker.ts';
import type {BridgeReconciliation} from './reconciliation.ts';
import {CanonicalBridgeBase} from './adapters/base.ts';
import {pinnedExecutable,pinnedFile,type FilePin} from './adapters/profile.ts';
import {nativeJsonProcess} from './adapters/native.ts';

export type IncomingOrder=Pick<Order,'id'|'salt'|'direction'|'amountAtomic'|'recipient'|'refundRecipient'|'commitment'|'expiresAt'>;
export function incomingOrder(o:Readonly<Order>):IncomingOrder{
 if(o.direction!=='TAZ_TO_ZEETAZ'||!o.refundRecipient)throw Error('BRIDGE_NATIVE_FORWARD_ORDER_REQUIRED');
 return {id:o.id,salt:o.salt,direction:o.direction,amountAtomic:o.amountAtomic,recipient:o.recipient,refundRecipient:o.refundRecipient,commitment:o.commitment,expiresAt:o.expiresAt};
}
type NativeNote={pool:'ironwood';txid:string;index:number;value:string;height:number;ownChange:boolean;unspent:true;role:'principal'|'fee';blockHash:string};
export type NativeReadSnapshot={version:1;status:'BRIDGE_NATIVE_READ_VERIFIED';principalAccount:string;feeAccount:string;swapAccount:string;notes:NativeNote[];deposits:Extract<VerifiedEvent,{kind:'DEPOSIT'}>[];quarantines?:Extract<VerifiedEvent,{kind:'QUARANTINE'}>[];controlledZatoshi:string;feeCapitalZatoshi:string;zcash:Anchor;verifiedCheckpoint?:Pick<Anchor,'height'|'hash'>};
export interface BridgeNativeRead {
 principalAccount:string;feeAccount:string;swapAccount:string;
 readonly openingFeeNotes?:ReadonlyArray<Pick<NativeNote,'pool'|'txid'|'index'|'value'>>;
 assertNoOutgoing():Promise<void>;
 assertOutgoingScope?(orderId:string):Promise<void>;
 assertOutgoingAllowlist?(orderIds:string[]):Promise<void>;
 observeQuarantines?(store:BridgeStore):Promise<unknown>;
 validate(address:string):Promise<void>;
 funding(order:Readonly<Order>):Promise<Funding>;
 snapshot(orders:Readonly<Order>[],checkpoint?:Anchor):Promise<NativeReadSnapshot>;
}
export type BridgeReadPins={python:FilePin;worker:FilePin;profile:FilePin};
/** Real qualified read pipe. The profile and Python module pins remain the
 * authority for receiver ownership, native scan coverage and SDK decryption. */
export class PinnedBridgeReadAdapter implements BridgeNativeRead {
 readonly principalAccount:string;readonly feeAccount:string;readonly swapAccount:string;
 private constructor(readonly pins:BridgeReadPins,private profile:any){this.principalAccount=profile.principalAccount;this.feeAccount=profile.feeAccount;this.swapAccount=profile.swapAccount;}
 get openingFeeNotes(){return structuredClone(this.profile.feeNotes) as Array<Pick<NativeNote,'pool'|'txid'|'index'|'value'>>;}
 static async create(pins:BridgeReadPins){
  if(process.platform!=='linux'||!process.getuid?.())throw Error('BRIDGE_NATIVE_DEDICATED_LINUX_REQUIRED');
  const p=JSON.parse((await pinnedFile(pins.profile,true)).toString());
  if(p.mode!=='BRIDGE_NATIVE_READ_TESTNET'||p.root!=='/opt/zeeswap-bridge-testnet'||p.serviceUid!==process.getuid()||p.modules?.bridge_native_read?.path!==pins.worker.path||p.modules?.bridge_native_read?.sha256!==pins.worker.sha256)throw Error('BRIDGE_NATIVE_READ_PROFILE_BINDING');
  await pinnedExecutable(pins.python);await pinnedFile(pins.worker);return new PinnedBridgeReadAdapter(pins,p);
 }
 private async call(payload:unknown){
  await pinnedExecutable(this.pins.python);await pinnedFile(this.pins.worker);await pinnedFile(this.pins.profile,true);
  return nativeJsonProcess(this.pins.python.path,[this.pins.worker.path,'--profile',this.pins.profile.path,'--profile-sha256',this.pins.profile.sha256],payload);
 }
 async assertNoOutgoing(){
  // This read slice cannot establish in-transit recovery. Even an otherwise
  // unknown directory may contain an original payout: fail closed for review.
  const orders=join(this.profile.root,'orders');
  try{const s=await lstat(orders);if(s.isSymbolicLink()||!s.isDirectory()||(await readdir(orders)).length)throw Error('BRIDGE_NATIVE_OUTGOING_RECONCILIATION_REQUIRED');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  // Root precreates the empty mutex because the dedicated physical root is
  // root-owned. Financial state lives in per-order journals, not this lockfile.
  for(const path of [join(this.profile.root,'bridge-wallet.lock')]){
   try{const s=await lstat(path);if(s.isSymbolicLink()||!s.isFile()||s.size!==0||(s.mode&0o077)!==0||s.uid!==process.getuid?.())throw Error('BRIDGE_NATIVE_OUTGOING_RECONCILIATION_REQUIRED');}
   catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  }
 }
 async assertOutgoingScope(orderId:string){
  await this.assertOutgoingAllowlist([orderId]);
 }
 async assertOutgoingAllowlist(orderIds:string[]){
  if(orderIds.length>2||new Set(orderIds).size!==orderIds.length||orderIds.some(id=>!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)))throw Error('BRIDGE_NATIVE_OUTGOING_SCOPE');
  const root=join(this.profile.root,'orders');let entries:string[];try{entries=await readdir(root);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT'&&!orderIds.length)return;throw e;}
  if(entries.length!==orderIds.length||entries.some(id=>!orderIds.includes(id)))throw Error('BRIDGE_NATIVE_UNKNOWN_OUTGOING_JOURNAL');
  for(const id of entries){const dir=join(root,id),s=await lstat(dir);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)!==0)throw Error('BRIDGE_NATIVE_OUTGOING_DIRECTORY');const allowed=new Set(['approved.private.json','profile.private.json','native-intent.private.json','native-intent.private.json.raw.private']);for(const entry of await readdir(dir)){const file=await lstat(join(dir,entry));if(!allowed.has(entry)||!file.isFile()||file.isSymbolicLink()||(file.mode&0o077)!==0)throw Error('BRIDGE_NATIVE_UNKNOWN_OUTGOING_JOURNAL');}}
 }
 async validate(address:string){const r=await this.call({command:'validate',address}) as any;if(r?.network!=='zcash-testnet'||r.shielded!==true||typeof r.receiver!=='string'||!r.receiver.startsWith('utest1'))throw Error('BRIDGE_CANONICAL_SHIELDED_RECIPIENT_REQUIRED');}
 async funding(order:Readonly<Order>){return await this.call({command:'funding',order:incomingOrder(order)}) as Funding;}
 async snapshot(orders:Readonly<Order>[],checkpoint?:Anchor){return await this.call({command:'snapshot',orders:orders.map(incomingOrder),...(checkpoint?{checkpoint}:{})}) as NativeReadSnapshot;}
}
function noOutgoing(b:Readonly<Books>){
 if(b.inTransit!=='0'||Object.values(b.orders).some(o=>o.attempt||o.broadcastAttempted||o.included||['PAYOUT_PENDING','IN_TRANSIT','COMPLETED','FROZEN'].includes(o.status)))throw Error('BRIDGE_NATIVE_OUTGOING_RECONCILIATION_REQUIRED');
}
function scanOrders(b:Readonly<Books>){return Object.values(b.orders).filter(o=>o.accepted&&o.direction==='TAZ_TO_ZEETAZ'&&o.funding?.kind==='shielded-deposit');}
export function validateNativeSnapshot(s:NativeReadSnapshot,native:Pick<BridgeNativeRead,'principalAccount'|'feeAccount'|'swapAccount'>,orders:Readonly<Order>[],now=Date.now(),checkpoint?:Anchor){
 if(!s||s.version!==1||s.status!=='BRIDGE_NATIVE_READ_VERIFIED'||s.principalAccount!==native.principalAccount||s.feeAccount!==native.feeAccount||s.swapAccount!==native.swapAccount||!Array.isArray(s.notes)||s.notes.length>32||!Array.isArray(s.deposits)||s.deposits.length>16)throw Error('BRIDGE_NATIVE_READ_BINDING');
 validateAnchor(s.zcash,now,true);let principal=0n,fees=0n;const seen=new Set<string>();
 if(checkpoint&&(s.verifiedCheckpoint?.height!==checkpoint.height||s.verifiedCheckpoint?.hash!==checkpoint.hash||s.zcash.height<checkpoint.height))throw Error('BRIDGE_NATIVE_PRIOR_CHECKPOINT_BINDING');
 for(const n of s.notes){const key=[n.pool,n.txid,n.index].join(':');
  if(n.pool!=='ironwood'||!/^[a-f0-9]{64}$/.test(n.txid)||!Number.isSafeInteger(n.index)||n.index<0||typeof n.ownChange!=='boolean'||n.unspent!==true||!['principal','fee'].includes(n.role)||!Number.isSafeInteger(n.height)||n.height<1||s.zcash.height-n.height+1<10||!/^[a-f0-9]{64}$/.test(n.blockHash)||seen.has(key)||integer(n.value)===0n)throw Error('BRIDGE_NATIVE_PHYSICAL_NOTE_BINDING');
  seen.add(key);if(n.role==='principal')principal+=integer(n.value);else fees+=integer(n.value);
 }
 if(s.controlledZatoshi!==principal.toString()||s.feeCapitalZatoshi!==fees.toString())throw Error('BRIDGE_NATIVE_PHYSICAL_SUM_MISMATCH');
 const ids=new Set<string>();for(const e of s.deposits){const o=orders.find(o=>o.id===e.id);
  if(e.kind!=='DEPOSIT'||!o||!o.accepted||e.amount!==o.amountAtomic||e.receipt.network!=='zcash-testnet'||!/^zcash-testnet:[a-f0-9]{64}:ironwood:[0-9]+$/.test(e.identity)||e.receipt.transactionHash!==e.identity.split(':')[1]||!Number.isSafeInteger(e.receipt.blockHeight)||e.receipt.blockHeight<1||s.zcash.height-e.receipt.blockHeight+1<10||!/^[a-f0-9]{64}$/.test(e.receipt.blockHash)||ids.has(e.id))throw Error('BRIDGE_NATIVE_DEPOSIT_BINDING');
  ids.add(e.id);
 }
 if(s.quarantines){if(!Array.isArray(s.quarantines)||s.quarantines.length>128)throw Error('BRIDGE_NATIVE_QUARANTINE_BOUND');for(const q of s.quarantines){const o=orders.find(o=>o.id===q.id);if(q.kind!=='QUARANTINE'||!o||o.status!=='EXPIRED_UNFUNDED'||!o.accepted||!o.unfundedRetirement||typeof q.controlled!=='boolean'||integer(q.amount)===0n||q.receipt.network!=='zcash-testnet'||!/^zcash-testnet:[a-f0-9]{64}:ironwood:[0-9]+$/.test(q.identity)||q.identity.split(':')[1]!==q.receipt.transactionHash||!Number.isSafeInteger(q.receipt.blockHeight)||q.receipt.blockHeight<1||s.zcash.height-q.receipt.blockHeight+1<10||!/^[a-f0-9]{64}$/.test(q.receipt.blockHash))throw Error('BRIDGE_NATIVE_QUARANTINE_BINDING');const note=s.notes.find(n=>n.pool==='ironwood'&&n.txid===q.receipt.transactionHash&&String(n.index)===q.identity.split(':')[3]&&n.value===q.amount&&n.height===q.receipt.blockHeight&&n.blockHash===q.receipt.blockHash);if(q.controlled!==!!note)throw Error('BRIDGE_NATIVE_QUARANTINE_PHYSICAL_CONTROL');}}
 return s;
}
/** Paused, read-only qualification runtime. It never supplies reverse funding,
 * signing, control activation or automatic inventory credits. */
export class PausedBridgeRuntime implements BridgeRuntime,BridgeEvidenceVerifier {
 readonly tokenAddress:string;readonly contractAddress:string;readonly runtimeCodeHash:string;readonly authorizerAddress:string;
 constructor(readonly base:CanonicalBridgeBase,readonly native:BridgeNativeRead){const p=base.profile;this.tokenAddress=this.contractAddress=p.contractAddress;this.runtimeCodeHash=p.runtimeCodeHash;this.authorizerAddress=p.authorizer;
  for(const k of ['principalAccount','feeAccount','swapAccount'] as const)if(p[k]!==native[k])throw Error('BRIDGE_RUNTIME_ACCOUNT_BINDING');}
 async validateShieldedRecipient(address:string){await this.native.validate(address);}
 async funding(o:Readonly<Order>){if(o.direction!=='TAZ_TO_ZEETAZ')throw Error('BRIDGE_NATIVE_AUTHORITY_NOT_QUALIFIED');return this.native.funding(o);}
 async observe(b:Readonly<Books>){noOutgoing(b);await this.native.assertNoOutgoing();const orders=scanOrders(b),s=validateNativeSnapshot(await this.native.snapshot(orders,b.pair?.zcash),this.native,orders,Date.now(),b.pair?.zcash),anchor=await this.base.finalized();if(b.pair&&anchor.height<b.pair.base.height)throw Error('BRIDGE_BASE_CHECKPOINT_REGRESSION');const c=await this.base.readAt(anchor);if(b.pair)await this.base.readAt({...b.pair.base,observedAt:new Date().toISOString()});return {s,c};}
 protected assertBooks(b:Readonly<Books>,s:NativeReadSnapshot,c:{supply:string;unpaid:string}){
  const r=coverage(b);let reserved=0n;for(const o of Object.values(b.orders))if(o.feeReservation){if(o.feeReservation.charged!==undefined)throw Error('BRIDGE_NATIVE_FEE_RECONCILIATION_REQUIRED');reserved+=integer(o.feeReservation.maximum);}
  if(s.controlledZatoshi!==b.controlled||c.supply!==b.supply||integer(c.unpaid)!==integer(r.unpaidRedemptionsZatoshi)+integer(r.pendingAcknowledgmentsZatoshi)||integer(s.feeCapitalZatoshi)<reserved||integer(s.feeCapitalZatoshi)-reserved!==integer(b.feeCapital))throw Error('BRIDGE_RUNTIME_BOOKS_MISMATCH');
  for(const o of scanOrders(b))if(o.source){const e=s.deposits.find(e=>e.id===o.id);if(!e||e.identity!==o.sourceIdentity||digest(e.receipt)!==digest(o.source))throw Error('BRIDGE_NATIVE_ACCEPTED_SOURCE_CONFLICT');}
  for(const k of ['principalAccount','feeAccount','swapAccount'] as const)if(b[k]!==this.native[k])throw Error('BRIDGE_RUNTIME_ACCOUNT_BINDING');
 }
 async recheck(b:Readonly<Books>):Promise<BridgeReconciliation>{
  if(!b.paused)throw Error('BRIDGE_RUNTIME_PAUSED_QUALIFICATION_ONLY');return this.reconcileRead(b);
 }
 protected async reconcileRead(b:Readonly<Books>):Promise<BridgeReconciliation>{
  if(!b.pair)throw Error('BRIDGE_RECONCILIATION_REQUIRED');
  validateAnchor(b.pair.base,Date.now(),true);validateAnchor(b.pair.zcash,Date.now(),true);
  const {s,c}=await this.observe(b);this.assertBooks(b,s,c);
  if(s.quarantines?.some(q=>!b.quarantines?.[q.identity]))throw Error('BRIDGE_LATE_SOURCE_QUARANTINE_REQUIRED');
  // Independently re-read the admitted pair: a fresh higher head alone cannot
  // establish that the exact stored checkpoint survived.
  await this.base.readAt(b.pair.base);
  if(s.zcash.height<b.pair.zcash.height||s.zcash.height===b.pair.zcash.height&&s.zcash.hash!==b.pair.zcash.hash)throw Error('BRIDGE_NATIVE_CHECKPOINT_REGRESSION');
  validateAnchor(b.pair.base,Date.now(),true);validateAnchor(b.pair.zcash,Date.now(),true);validateAnchor(s.zcash,Date.now(),true);
  return {pair:b.pair,network:'testnet',baseChainId:84532,tokenAddress:this.tokenAddress,contractAddress:this.contractAddress,runtimeCodeHash:this.runtimeCodeHash,decimals:8,principalAccount:b.principalAccount,feeAccount:b.feeAccount,swapAccount:b.swapAccount,controlledZatoshi:s.controlledZatoshi,inTransitZatoshi:'0',circulatingZatoshi:c.supply,unpaidRedemptionsZatoshi:coverage(b).unpaidRedemptionsZatoshi,pendingAcknowledgmentsZatoshi:coverage(b).pendingAcknowledgmentsZatoshi};
 }
 async verify(request:unknown,o:Readonly<Order>,b:Readonly<Books>):Promise<VerifiedEvent>{
  if(!request||typeof request!=='object'||Object.keys(request).join()!=='kind'||(request as any).kind!=='DEPOSIT'||!o.accepted||o.direction!=='TAZ_TO_ZEETAZ'||!o.funding||o.funding.kind!=='shielded-deposit')throw Error('BRIDGE_NATIVE_DEPOSIT_REQUEST');
  noOutgoing(b);await this.native.assertNoOutgoing();const s=validateNativeSnapshot(await this.native.snapshot([o],b.pair?.zcash),this.native,[o],Date.now(),b.pair?.zcash);const e=s.deposits.find(e=>e.id===o.id);
  if(!e||!b.pair||e.receipt.blockHeight>b.pair.zcash.height)throw Error('BRIDGE_NATIVE_DEPOSIT_NOT_FINAL');return e;
 }
 /** Future MINT authorization must call this concrete proof seam, not a ready
  * boolean or a DEPOSIT_FINALIZED database row. Cast remains disabled meanwhile. */
 async assertMintSource(o:Readonly<Order>,b:Readonly<Books>){
  if(o.status!=='DEPOSIT_FINALIZED'||!o.source||!o.sourceIdentity)throw Error('BRIDGE_MINT_SOURCE_REQUIRED');
  await this.recheck(b);
  const e=await this.verify({kind:'DEPOSIT'},o,b);
  if(e.kind!=='DEPOSIT'||digest(e.receipt)!==digest(o.source)||e.identity!==o.sourceIdentity)throw Error('BRIDGE_MINT_SOURCE_REORG');
 }
 async refreshPaused(store:BridgeStore){return store.update(async b=>{
  if(!b.paused)throw Error('BRIDGE_RUNTIME_PAUSED_QUALIFICATION_ONLY');const {s,c}=await this.observe(b);
  if(!b.principalAccount&&!b.feeAccount&&!b.swapAccount){if(Object.keys(b.orders).length||b.controlled!=='0'||b.feeCapital!=='0'||b.supply!=='0'||s.controlledZatoshi!=='0'||s.feeCapitalZatoshi!=='0'||c.supply!=='0'||c.unpaid!=='0')throw Error('BRIDGE_EMPTY_INITIALIZATION_REQUIRED');for(const k of ['principalAccount','feeAccount','swapAccount'] as const)b[k]=this.native[k];}
  b.pair={zcash:s.zcash,base:c.anchor};
  for(const q of s.quarantines??[])applyEvent(b,q,Date.now());
  for(const e of s.deposits){const o=b.orders[e.id];if(o.status==='AWAITING_DEPOSIT')applyEvent(b,e,Date.now());else if(o.sourceIdentity!==e.identity||digest(o.source)!==digest(e.receipt))throw Error('BRIDGE_NATIVE_ACCEPTED_SOURCE_CONFLICT');}
  this.assertBooks(b,s,c);validateAnchor(s.zcash,Date.now(),true);validateAnchor(c.anchor,Date.now(),true);return {paused:true,controlledZatoshi:b.controlled,circulatingZatoshi:b.supply,pair:b.pair};
 });}
 /** Explicit one-time external fee allocation. Ordinary refresh cannot credit
  * funds, and a restored/nonempty book cannot reapply this opening step. */
 async initializePausedWithVerifiedOpeningFees(store:BridgeStore,expectedAtomic:string){
  const expected=integer(expectedAtomic);if(expected===0n||expected>100000n||expected%10000n!==0n)throw Error('BRIDGE_OPENING_FEE_CAP');
  return store.update(async b=>{
   if(!b.paused||b.incident||b.controlled!=='0'||b.inTransit!=='0'||b.supply!=='0'||b.feeCapital!=='0'||b.pair||b.principalAccount||b.feeAccount||b.swapAccount||Object.keys(b.orders).length||Object.keys(b.seen).length)throw Error('BRIDGE_EMPTY_INITIALIZATION_REQUIRED');
   const {s,c}=await this.observe(b),approved=this.native.openingFeeNotes;
   if(s.controlledZatoshi!=='0'||c.supply!=='0'||c.unpaid!=='0'||s.feeCapitalZatoshi!==expectedAtomic||!approved||approved.length<1||approved.length>10||s.notes.length!==approved.length)throw Error('BRIDGE_OPENING_FEE_ONLY_REQUIRED');
   const identity=(n:Pick<NativeNote,'pool'|'txid'|'index'|'value'>)=>[n.pool,n.txid,n.index,n.value].join(':');
   const approvedIds=new Set(approved.map(identity));
   if(approvedIds.size!==approved.length||approved.some(n=>n.pool!=='ironwood'||n.value!=='10000')||s.notes.some(n=>n.role!=='fee'||!approvedIds.has(identity(n))))throw Error('BRIDGE_OPENING_FEE_PROFILE_BINDING');
   for(const k of ['principalAccount','feeAccount','swapAccount'] as const)b[k]=this.native[k];
   b.feeCapital=expectedAtomic;b.pair={zcash:s.zcash,base:c.anchor};this.assertBooks(b,s,c);validateAnchor(s.zcash,Date.now(),true);validateAnchor(c.anchor,Date.now(),true);
   return {paused:true,feeCapitalZatoshi:b.feeCapital,pair:b.pair};
  });
 }
}
/** Concrete first-circle production MINT authority. The DB status and an enable
 * flag cannot supply the missing source proof. Public admission stays paused. */
export class BridgeMintCoordinator {
 constructor(private runtime:PausedBridgeRuntime,private qualification?:{permitId:string;permitSha256:string;forwardRecipient:string;forwardRefundRecipient:string}){if(!(runtime instanceof PausedBridgeRuntime))throw Error('BRIDGE_CONCRETE_MINT_COORDINATOR_REQUIRED');}
 async assert(base:CanonicalBridgeBase,o:Readonly<Order>,b:Readonly<Books>){
  if(base!==this.runtime.base||o.direction!=='TAZ_TO_ZEETAZ'||o.amountAtomic!=='100000'||!o.accepted||o.status!=='DEPOSIT_FINALIZED'||!b.paused||b.incident)throw Error('BRIDGE_FIRST_CIRCLE_MINT_SCOPE');
  if(!base.localTest&&(!b.qualification||b.qualification.permitId!==this.qualification?.permitId||b.qualification.permitSha256!==this.qualification?.permitSha256))throw Error('BRIDGE_MINT_ORIGINAL_PERMIT_REQUIRED');
  if(!base.localTest&&(o.recipient!==this.qualification?.forwardRecipient||o.refundRecipient!==this.qualification?.forwardRefundRecipient))throw Error('BRIDGE_MINT_ROOT_RECIPIENT_BINDING');
  for(const direction of ['TAZ_TO_ZEETAZ','ZEETAZ_TO_TAZ'])if(Object.values(b.orders).filter(x=>x.accepted&&x.direction===direction).length>1)throw Error('BRIDGE_FIRST_CIRCLE_ORDER_LIMIT');
  if(digest(b.orders[o.id])!==digest(o))throw Error('BRIDGE_MINT_ORDER_BOOK_BINDING');
  await this.runtime.assertMintSource(o,b);
  const current=await base.readAt(await base.finalized());if(current.paused)throw Error('BRIDGE_CONTRACT_PAUSED');
 }
}
export function createPausedBridge(pool:pg.Pool,keys:PrivateData,base:CanonicalBridgeBase,native:BridgeNativeRead){const store=new BridgeRepository(pool,keys),runtime=new PausedBridgeRuntime(base,native);return {store,runtime,service:new BridgeService(store,runtime)};}
