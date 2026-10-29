import {getAbiItem,type Hex} from 'viem';
import {applyEvent,digest,type Books,type Order} from './model.ts';
import type {BridgeStore} from './repository.ts';
import {PublicBridgePilotRuntime,publicOrders,PublicBridgeReverseCoordinator} from './public-pilot.ts';
import {CastBridgeBaseSigner,type SignedBridgeBase} from './adapters/cast.ts';
import {bridgeAbi} from './adapters/base.ts';
import {pinnedFile} from './adapters/profile.ts';
import {approvePublicNativeProfile,type NativeSpendTemplate} from './native-profile.ts';
import {BridgeWorker} from './worker.ts';
import {BridgeJournal} from './journal.ts';
import type {PrivateData} from '../private-data.ts';
import {reconciledBridgeStatus} from './service.ts';

/** One finite pilot liability at a time. Existing journals decide whether an
 * original may be submitted; a loop never clears uncertainty or signs a replacement. */
export class PublicBridgeWorker {
 constructor(readonly store:BridgeStore,readonly pilot:PublicBridgePilotRuntime,readonly reverse:PublicBridgeReverseCoordinator,readonly signer:CastBridgeBaseSigner,readonly keys:PrivateData,readonly nativeSpend:NativeSpendTemplate,readonly journalRoot:string){}
 private async bindNative(o:Readonly<Order>){if(!o.nativeProfile)throw Error('BRIDGE_PUBLIC_NATIVE_PROFILE_REQUIRED');this.reverse.bindNative(o.nativeProfile,JSON.parse((await pinnedFile(o.nativeProfile.profile,true)).toString()));}
 private async pause(id:string){await this.store.update(b=>{const o=b.orders[id];this.pilot.assertOrder(o,b);b.paused=true;});}
 /** Scan at most 1000 blocks per tick in literal <=200-block independent reads.
  * Cursor publication is not readiness; facts still require full receipt proof. */
 async scanBurn(id:string){
  for(let i=0;i<5;i++){
   const done=await this.store.update(async b=>{
    const o=b.orders[id];this.pilot.assertOrder(o,b);if(o.status!=='AWAITING_BURN')return true;
    const start=o.baseScanCursor??o.acceptedPair?.base;if(!start)throw Error('BRIDGE_PUBLIC_ACCEPTED_ANCHOR_REQUIRED');const base=this.pilot.base,final=await base.finalized();await base.readAt(final);
    if(start.height>final.height)throw Error('BRIDGE_PUBLIC_SCAN_REGRESSION');
    for(const c of base.clients)if((await c.getBlock({blockNumber:BigInt(start.height)})).hash!==start.hash)throw Error('BRIDGE_PUBLIC_SCAN_CURSOR_REORG');
    if(start.height===final.height)return true;const end=Math.min(start.height+199,final.height),height=BigInt(end),event=getAbiItem({abi:bridgeAbi,name:'RedemptionRequested'});
    const rows=await Promise.all(base.clients.map(async c=>({logs:await c.getLogs({address:base.profile.contractAddress,event,args:{id:o.commitment as Hex},fromBlock:BigInt(start.height),toBlock:height,strict:true}),block:await c.getBlock({blockNumber:height})})));
    const serial=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x),canonical=(r:typeof rows[number])=>({block:{height:r.block.number,hash:r.block.hash,parentHash:r.block.parentHash},logs:r.logs.map(l=>({address:l.address,topics:l.topics,data:l.data,blockHash:l.blockHash,blockNumber:l.blockNumber,transactionHash:l.transactionHash,transactionIndex:l.transactionIndex,logIndex:l.logIndex,removed:l.removed}))});
    if(serial(canonical(rows[0]))!==serial(canonical(rows[1]))||rows[0].logs.length>1)throw Error('BRIDGE_PUBLIC_BURN_SCAN_DISAGREEMENT');
    for(const c of base.clients)if((await c.getBlock({blockNumber:height})).hash!==rows[0].block.hash)throw Error('BRIDGE_PUBLIC_SCAN_CURSOR_REORG');
    if(rows[0].logs.length){const hash=rows[0].logs[0].transactionHash;if(!hash)throw Error('BRIDGE_PUBLIC_BURN_HASH_REQUIRED');const {s,c}=await this.pilot.observe(b);b.pair={zcash:s.zcash,base:c.anchor};applyEvent(b,await base.verify({kind:'BURN',transactionHash:hash},o,b),Date.now());await this.pilot.recheck(b);return true;}
    // The next invocation deliberately overlaps this canonical seam block.
    o.baseScanCursor={height:end,hash:rows[0].block.hash!,observedAt:new Date().toISOString()};return end===final.height;
   });if(done)return;
  }
 }
 private async baseEffect(id:string,phase:'MINT'|'ACK'){
  let o=(await this.store.read()).orders[id];if(!o.baseEffects?.[phase]){
   if(phase==='ACK'){await this.bindNative(o);await this.reverse.reconcileNative(this.store,id);}
   else await this.pilot.refresh(this.store);
   await this.store.update(async b=>{const current=b.orders[id];this.pilot.assertOrder(current,b);const signed=await this.signer.prepare(phase,current,b);(current.baseEffects??={})[phase]=signed;});return;
  }
  if(!o.baseBroadcastAttempted?.[phase]){
   await this.store.update(b=>{this.pilot.assertOrder(b.orders[id],b);(b.orders[id].baseBroadcastAttempted??={})[phase]=true;});
   // A failed callback leaves both book and external journal fenced.
   await this.store.update(async b=>{const current=b.orders[id];if(phase==='ACK')await this.bindNative(current);await this.signer.broadcast(current.baseEffects![phase]!,b);});return;
  }
  if(phase==='ACK'){
   await this.bindNative(o);await this.reverse.observeAck(this.store,id,o.baseEffects[phase]!.hash);await this.signer.reconcile(o.baseEffects[phase]!, (await this.store.read()).pair);return;
  }
  return this.store.update(async b=>{const current=b.orders[id];this.pilot.assertOrder(current,b);const {s,c}=await this.pilot.observe(b);b.pair={zcash:s.zcash,base:c.anchor};applyEvent(b,await this.pilot.base.verify({kind:'MINT',transactionHash:current.baseEffects![phase]!.hash},current,b),Date.now());const proof=await this.pilot.recheck(b);await this.signer.reconcile(current.baseEffects![phase]!,b.pair);b.paused=Date.now()>=Date.parse(this.pilot.binding.permit.expiresAt);return reconciledBridgeStatus(b,this.pilot,proof);});
 }
 async recoverNative(id:string){const o=(await this.store.read()).orders[id];this.pilot.assertOrder(o,await this.store.read());await this.pause(id);await this.bindNative(o);await this.reverse.refreshPayout(this.store,id);const signer=this.reverse.signerAdapter(new BridgeJournal(this.journalRoot,this.keys),'recover');return new BridgeWorker(this.store,this.pilot,signer).prepare(id,'10000');}
 async tick(){
  const b=await this.store.read();this.pilot.assertBinding(b);const o=publicOrders(b,this.pilot.binding).find(o=>o.accepted&&!['MINTED','COMPLETED'].includes(o.status));
  if(!o)return this.pilot.refresh(this.store,true);
  await this.pause(o.id);
  if(o.status==='AWAITING_DEPOSIT')return this.pilot.refresh(this.store);
  if(o.status==='DEPOSIT_FINALIZED')return this.baseEffect(o.id,'MINT');
  if(o.status==='AWAITING_BURN'){await this.scanBurn(o.id);return;}
  if(o.status==='REDEMPTION_PENDING'&&!o.nativeProfile){await approvePublicNativeProfile(this.store,this.pilot,this.nativeSpend,o.id);return;}
  if(['REDEMPTION_PENDING','PAYOUT_PENDING','IN_TRANSIT','NATIVE_DELIVERED_AWAITING_ACK'].includes(o.status)){
   await this.bindNative(o);
   if(o.status==='NATIVE_DELIVERED_AWAITING_ACK')return this.baseEffect(o.id,'ACK');
   if(o.status==='IN_TRANSIT'||o.broadcastAttempted){await this.reverse.reconcileNative(this.store,o.id);return;}
   await this.reverse.refreshPayout(this.store,o.id);const signer=this.reverse.signerAdapter(new BridgeJournal(this.journalRoot,this.keys)),worker=new BridgeWorker(this.store,this.pilot,signer);
   if(!o.attempt?.raw)await worker.prepare(o.id,'10000');else await worker.broadcast(o.id);return;
  }
  throw Error('BRIDGE_PUBLIC_ORDER_RECONCILIATION_REQUIRED');
 }
}
