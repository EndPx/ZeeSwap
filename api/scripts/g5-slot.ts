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
  if(resolve(config.databaseConfig)!==resolve(c.config.databaseConfig)||resolve(config.runtimeConfig)!==resolve(c.config.runtimeConfig))throw Error('G5_REVERSE_RUNTIME_CONFIG_BINDING');
  requireG5CommandConfig(config.zcashArgs,config.zcashPrivateConfig);
  const allocation=(c.state.openingCapital as any[])?.find(n=>n.sequence===config.sequence),wallet=await read(config.zcashPrivateConfig);
  const note=wallet.approvedCapitalNotes?.[0];
  if(!allocation||wallet.capitalReceiver!==allocation.receiver||wallet.capitalUfvkSha256!==allocation.ufvkSha256||wallet.approvedCapitalNotes?.length!==1||note.pool!==allocation.pool||note.txid!==allocation.txid||note.index!==allocation.index||note.value!==allocation.amount)throw Error('G5_REVERSE_CAPITAL_ALLOCATION_MISMATCH');
  const recover=(await c.admin.query('SELECT id FROM zee.quotes WHERE access_hash=$1',[accessHash(slot.owner)])).rows;
  if(recover.length>1||(slot.orderId&&recover[0]?.id!==slot.orderId))throw Error('G5_PRIVATE_QUOTE_RECOVERY_CONFLICT');
  if(!slot.orderId&&recover.length){slot.orderId=recover[0].id;await c.save();}
  const rows=(await c.admin.query('SELECT id,state FROM zee.orders')).rows;
  if(rows.some(r=>r.id!==slot.orderId&&(r.state!=='SETTLED'||!c.state.orders.some(o=>o.orderId===r.id&&o.verified))))throw Error('G5_ONE_OUTSTANDING_ORDER');
  return {owner:slot.owner,orderId:slot.orderId,async bind(orderId:string){
   if(slot.orderId&&slot.orderId!==orderId)throw Error('G5_IMMUTABLE_ORDER_BINDING');slot.orderId=orderId;await c.save();
  },close:()=>c.close()};
 }catch(e){await c.close();throw e;}
}
