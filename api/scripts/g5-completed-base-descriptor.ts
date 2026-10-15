/** Fixed G5 read-only bindings for the completed receipt verifier. No SDK,
 * signing, SQL writes, generic command execution or confirmation updates. */
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {getAddress,keccak256} from 'viem';
import {escrowTerms,escrowEvents,fundingCall} from '../src/base-escrow.ts';
import {depositIdentity,type DepositInput} from '../src/repository.ts';
import {g5PathIdentity} from '../src/g5-run.ts';
import {resolveG5ReferencedPrivatePath} from '../src/g5-private-path.ts';
import type {PrivateData} from '../src/private-data.ts';
import type {CompletedBaseOrder,CompletedBaseOriginal,CompletedBasePhase} from '../src/g5-completed-base-proof.ts';

function fail():never{throw Error('G5_COMPLETED_BASE_DESCRIPTOR_REQUIRED');}
export function bindG5CompletedBaseOriginal(keys:PrivateData,row:any,orderId:string,phase:CompletedBasePhase,context:string):CompletedBaseOriginal{
 try{
  if(!row||row.order_id!==orderId||row.phase!==phase||row.confirmed!==true||!row.receipt_payload)fail();
  const signed=keys.open(row.signed_payload,context) as any;
  if(!keys.lookup('base-tx',signed.hash).equals(row.tx_hash)||signed.maxCost!==row.max_cost||keccak256(signed.raw)!==signed.hash)fail();
  return {orderId,phase,confirmed:true,blockHeight:String(row.block_height),blockHash:row.block_hash,actualFee:row.actual_fee,signed};
 }catch{fail();}
}

export async function loadG5CompletedBaseDescriptor(c:any,slot:any,read:(path:string)=>Promise<any>,manifestPath:string):Promise<CompletedBaseOrder>{
 try{
  const order=(await c.worker.query('SELECT state,primary_deposit FROM zee.orders WHERE id=$1',[slot.orderId])).rows[0];
  if(!slot.orderId||order?.state!=='SETTLED')fail();
  if(slot.direction==='ZCASH_TO_BASE'){
   const binding=(await c.worker.query('SELECT terms_payload FROM zee.base_bindings WHERE order_id=$1',[slot.orderId])).rows[0];
   const terms=c.r.keys.open(binding.terms_payload,`base-terms:${slot.orderId}:v1`) as any;
   const rows=(await c.worker.query('SELECT * FROM zee.base_attempts WHERE order_id=$1',[slot.orderId])).rows;
   if(rows.length!==2)fail();
   return {orderId:slot.orderId,state:'SETTLED',direction:slot.direction,terms,originals:rows.map((row:any)=>bindG5CompletedBaseOriginal(c.r.keys,row,slot.orderId,row.phase,`base-signed:${slot.orderId}:${row.phase}:v1`))};
  }
  if(slot.direction!=='BASE_TO_ZCASH')fail();
  const item=c.config.reverseOrders.find((o:any)=>o.sequence===slot.sequence),config=await read(item.configFile),saved=await read(config.stateFile);
  const terms=await escrowTerms(c.worker,c.r.keys,c.base,slot.orderId);
  // Production reverse configs bind their branch through the run manifest;
  // older normal configs omit a redundant branchId. A supplied value must agree.
  if(config.sequence!==slot.sequence||config.branchId!==undefined&&config.branchId!==c.config.branchId||g5PathIdentity(config.runConfig)!==g5PathIdentity(manifestPath)
   ||saved.orderId!==slot.orderId||saved.owner!==slot.owner||getAddress(config.payer)!==getAddress(terms.payer))fail();
  const binding=(await c.worker.query('SELECT terms_payload FROM zee.escrow_bindings WHERE order_id=$1',[slot.orderId])).rows[0];
  const pinned=c.r.keys.open(binding.terms_payload,`escrow-terms:${slot.orderId}:v1`) as any;
  if(!isDeepStrictEqual(pinned.terms,terms)||!isDeepStrictEqual(saved.funding,{...pinned,to:c.base.registry.contracts.ZeeSwapSettlement.address,data:fundingCall(c.base,terms,pinned.signature),value:'0'}))fail();
  const anchor=config.baseSignerPrivateConfig.replaceAll('\\','/').replace(/^\/\/wsl\$/i,'//wsl.localhost');
  if(anchor!==`//wsl.localhost/Ubuntu/home/albary/zeeswap-g5-retry/order-${String(slot.sequence).padStart(2,'0')}/reverse-base-signer.json`)fail();
  const journal=await read(resolveG5ReferencedPrivatePath(anchor,'/home/albary/zeeswap-g5/refunds/payer-journal/'+createHash('sha256').update(terms.id).digest('hex')+'.user-funding.tx.json'));
  if(journal.hash!==config.fundingTransactionHash||keccak256(journal.raw)!==journal.hash
   ||!isDeepStrictEqual(journal.approved,{version:1,branchId:c.config.branchId,sequence:slot.sequence,orderId:slot.orderId,funding:saved.funding}))fail();
  const deposit=(await c.worker.query('SELECT * FROM zee.deposits WHERE id=$1 AND order_id=$2',[order.primary_deposit,slot.orderId])).rows[0];
  if(deposit?.network!=='base-sepolia'||deposit.classification!=='EXACT'||!deposit.confirmed_at||deposit.amount!=='100000')fail();
  const receipt=await c.base.client.getTransactionReceipt({hash:journal.hash}),events=escrowEvents(c.base,receipt,'Funded');
  if(events.length!==1||events[0].args.id!==terms.id)fail();
  const candidate={network:'base-sepolia',txid:journal.hash.slice(2),index:events[0].index,emitter:c.base.registry.contracts.ZeeSwapSettlement.address} as DepositInput;
  const identity=depositIdentity(candidate);if(!c.r.keys.lookup('deposit',identity).equals(deposit.identity_hash))fail();
  const original=c.r.keys.open(deposit.private_payload,`deposit:${identity}:v1`) as DepositInput;
  if(depositIdentity(original)!==identity||original.amount!==deposit.amount||String(original.height)!==String(deposit.block_height)||original.blockHash!==deposit.block_hash
   ||!c.r.keys.lookup('receiver',original.receiver).equals(deposit.receiver_hash)||!c.r.keys.lookup('reference',original.reference).equals(deposit.reference_hash))fail();
  const originals:CompletedBaseOriginal[]=[];
  for(const [table,phase,context] of [['escrow_commits','COMMIT','escrow-commit'],['escrow_settlements','SETTLE','escrow-settle']] as const){
   const row=(await c.worker.query(`SELECT * FROM zee.${table} WHERE order_id=$1`,[slot.orderId])).rows[0];
   originals.push(bindG5CompletedBaseOriginal(c.r.keys,row,slot.orderId,phase,`${context}:${slot.orderId}:v1`));
  }
  return {orderId:slot.orderId,state:'SETTLED',direction:slot.direction,terms,originals,sourceFund:{orderId:slot.orderId,confirmedAt:deposit.confirmed_at,blockHeight:String(deposit.block_height),blockHash:deposit.block_hash,eventIndex:original.index,
   signed:{raw:journal.raw,hash:journal.hash,nonce:journal.nonce,maxCost:journal.maxCost}}};
 }catch{fail();}
}
