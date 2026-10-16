import {createHash} from 'node:crypto';
import {read} from './g5-context.ts';
import {LocalReverseWalletAdapter} from '../src/reverse-wallet-adapter.ts';
import {reversePayoutTerms,validatePreparedZcash} from '../src/reverse-settlement.ts';
/** Actual original recipient proof only. No signer/prepare/broadcast/SQL write. */
export async function captureG5R12Source15Delivery(c:any){
 if(c.state.runId!=='1f34e059-4de1-49f6-bbaa-323008577994'||c.config.branchId!=='br-twilight-heart-ao6cx6pg'||c.state.orders.length!==15||c.state.archivedAttempts?.length!==2)throw Error('G5_SOURCE15_LITERAL_R12_PROOF_REQUIRED');
 const slot=c.state.orders[11],rc=await read(c.config.reverseOrders.find((r:any)=>r.sequence===12).configFile),rows=(await c.admin.query('SELECT * FROM zee.reverse_payouts WHERE order_id=$1',[slot.orderId])).rows;
 if(rows.length!==1||rows[0].confirmed||rows[0].actual_fee!==null)throw Error('G5_SOURCE15_R12_ORIGINAL_SQL_BOUNDARY_CHANGED');
 const row=rows[0],prepared=c.r.keys.open(row.signed_payload,`reverse-payout:${slot.orderId}:v1`) as any,terms=await reversePayoutTerms(c.worker,c.r.keys,slot.orderId),adapter=new LocalReverseWalletAdapter(rc.zcashCommand,rc.zcashArgs,rc.approvedDigest);
 if(!row.tx_hash.equals(c.r.keys.lookup('zcash-tx',prepared.txid))||prepared.amount!=='100000'||prepared.feeZatoshi!=='10000'||terms.amountZatoshi!=='100000')throw Error('G5_SOURCE15_R12_PROTECTED_ORIGINAL_CHANGED');
 validatePreparedZcash(prepared,terms);const observedAt=new Date().toISOString(),receipt=await adapter.receipt(prepared,terms);
 if(receipt&&(receipt.txid!==prepared.txid||receipt.amountZatoshi!=='100000'||receipt.feeZatoshi!=='10000'||receipt.tipHeight-receipt.blockHeight+1<10))throw Error('G5_SOURCE15_R12_ORIGINAL_DELIVERY_CHANGED');
 return {version:1,runId:c.state.runId,sequence:12,observedAt,status:receipt?'ORIGINAL_R12_DELIVERY_CONFIRMED_READ_ONLY':'AWAITING_ORIGINAL_R12_ZCASH_FINALITY',sqlConfirmed:false,noAck:true,noNewPayment:true,orderId:slot.orderId,txid:prepared.txid,rawSha256:createHash('sha256').update(Buffer.from(prepared.rawTransaction,'hex')).digest('hex'),signedPayloadSha256:createHash('sha256').update(row.signed_payload).digest('hex'),receipt};
}
