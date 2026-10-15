import {g5RunDatabasePartition} from '../src/g5-quote-attempts.ts';
import {refreshG5ReverseArchiveAware} from '../src/g5-archive-observer.ts';
import {g5Context,read} from './g5-context.ts';
import {requireG5Next,g5Direction,requireG5CommandConfig} from '../src/g5-run.ts';
import {resolve} from 'node:path';
import {accessHash} from '../src/private-data.ts';
/** Validate the full run before entering a named private reverse step. */
export async function g5ReverseSlot(config:any){
 const c=await g5Context(config.runConfig);
 try{
  const slot=requireG5Next(c.state,config.sequence);
  if(!slot||slot.direction!=='BASE_TO_ZCASH'||g5Direction(config.sequence)!=='BASE_TO_ZCASH'
   ||c.config.reverseOrders.find((o:any)=>o.sequence===config.sequence)?.configFile!==config.selfConfigFile)throw Error('G5_REVERSE_SLOT_BINDING_MISMATCH');
  if(config.inputAmount!=='100000'||config.baseFeeBudget!==c.config.baseFeeBudget
   ||config.payer.toLowerCase()!==c.config.forward.recipient.toLowerCase()||config.refundRecipient.toLowerCase()!==config.payer.toLowerCase())throw Error('G5_REVERSE_PAYER_OR_CAP_MISMATCH');
  if(c.state.batchSize&&config.sequence===2&&config.recipient!==c.config.forwardOrders[0].refundRecipient)throw Error('G5_ROUNDTRIP_SAME_USER_RECEIVER_REQUIRED');
  if(resolve(config.databaseConfig)!==resolve(c.config.databaseConfig)||resolve(config.runtimeConfig)!==resolve(c.config.runtimeConfig))throw Error('G5_REVERSE_RUNTIME_CONFIG_BINDING');
  requireG5CommandConfig(config.zcashArgs,config.zcashPrivateConfig);
  const allocation=(c.state.openingCapital as any[])?.find(n=>n.sequence===config.sequence),wallet=await read(config.zcashPrivateConfig);
  const note=wallet.approvedCapitalNotes?.[0];
  if(!allocation||wallet.capitalReceiver!==allocation.receiver||wallet.capitalUfvkSha256!==allocation.ufvkSha256||wallet.approvedCapitalNotes?.length!==1||note.pool!==allocation.pool||note.txid!==allocation.txid||note.index!==allocation.index||note.value!==allocation.amount)throw Error('G5_REVERSE_CAPITAL_ALLOCATION_MISMATCH');
  const recover=(await c.admin.query('SELECT id FROM zee.quotes WHERE access_hash=$1',[accessHash(slot.owner)])).rows;
  if(recover.length>1||(slot.orderId&&recover[0]?.id!==slot.orderId))throw Error('G5_PRIVATE_QUOTE_RECOVERY_CONFLICT');
  if(!slot.orderId&&recover.length){slot.orderId=recover[0].id;await c.save();}
  const rows=(await g5RunDatabasePartition(c.admin,c.state,c.r.keys,c.config.stateFile)).orders;
  if(c.state.batchSize){
   if(rows.filter(r=>r.state!=='SETTLED').length>5||rows.some(r=>!c.state.orders.some(o=>o.orderId===r.id)))throw Error('G5_FIVE_ORDER_BATCH_LIMIT');
  }else if(rows.some(r=>r.id!==slot.orderId&&(r.state!=='SETTLED'||!c.state.orders.some(o=>o.orderId===r.id&&o.verified))))throw Error('G5_ONE_OUTSTANDING_ORDER');
  return {owner:slot.owner,orderId:slot.orderId,async incident(){if(!c.state.incident){c.state.incident=true;await c.save();await c.admin.query('SELECT zee.enter_reconciliation()');}},async bind(orderId:string){
   if(slot.orderId&&slot.orderId!==orderId)throw Error('G5_IMMUTABLE_ORDER_BINDING');slot.orderId=orderId;await c.save();
   },refreshObservers:(worker:typeof c.worker,base:typeof c.base,wallet:typeof c.r.wallet)=>refreshG5ReverseArchiveAware(worker,c.r.keys,base,wallet,c.state,c.config.stateFile),close:()=>c.close()};
 }catch(e){await c.close();throw e;}
}
