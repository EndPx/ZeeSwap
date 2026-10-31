/** Continuous Source metadata proof; signed execution remains in the closed-journal verifier. */
import {createHash} from 'node:crypto';
import type pg from 'pg';
import {keccak256,type Hex} from 'viem';
import {publicSettlementId} from './base-contract.ts';
import {depositIdentity,type DepositInput} from './repository.ts';
import {PrivateData} from './private-data.ts';
import {stable,type BaseEvent} from './integrations/observation/types.ts';
import {closedSnapshotSql} from './integrations/observation/envio-closed-recovery.ts';
const need=(v:unknown,c:string)=>{if(!v)throw Error('CONTINUOUS_SOURCE_'+c);};
type Db=Pick<pg.PoolClient,'query'>;
export function continuousSourceSnapshotSql(){return closedSnapshotSql.replace(/\n jsonb_build_object\([\s\S]+?\) books,/,"\n '{}'::jsonb books,").replace("WHERE network='base-sepolia' ORDER BY height LIMIT 20001","WHERE network='base-sepolia' AND height IN(SELECT scanned_height FROM zee.scanner_checkpoints WHERE network='base-sepolia' UNION SELECT finalized_height FROM zee.scanner_checkpoints WHERE network='base-sepolia' UNION SELECT unnest($1::bigint[])) ORDER BY height");}
/** Keyset pages hash every actual row; memory is bounded independently of age. */
export async function continuousSourceFingerprint(db:Db,tables:readonly string[]){
 const result:Record<string,{count:string;sha256:string}>={};
 for(const table of tables){need(/^[a-z_]+$/.test(table),'TABLE');const hash=createHash('sha256');let last:string|null=null,count=0n;
  for(;;){const rows:any[]=(await db.query(`SELECT to_jsonb(t)::text row FROM zee.${table} t WHERE ($1::text IS NULL OR (to_jsonb(t)::text COLLATE "C")>$1::text COLLATE "C") ORDER BY to_jsonb(t)::text COLLATE "C" LIMIT 128`,[last])).rows;
   need(rows.length<=128,'PAGE');for(const r of rows){need(typeof r.row==='string'&&(last===null||Buffer.compare(Buffer.from(r.row),Buffer.from(last))>0),'ORDER');hash.update(r.row+'\n');last=r.row;count++;}if(rows.length<128)break;
  }result[table]={count:count.toString(),sha256:hash.digest('hex')};
 }return result;
}
/** Requires an independently qualified complete terminal journal inventory. */
export async function requireContinuousSourceEvent(db:Db,keys:PrivateData,e:BaseEvent,journalQualificationSha256:string){
 need(/^[a-f0-9]{64}$/.test(journalQualificationSha256)&&e.settlementId!==null,'QUALIFIED_EVENT');
 const tx=keys.lookup('base-tx',e.txHash);
 let row:any,phase:string,signedContext:string,receiptContext:string;
 if(['PayoutReserved','Paid'].includes(e.event)){
  phase=e.event==='Paid'?'PAY':'RESERVE';const rows=(await db.query('SELECT a.*,q.settlement_id,q.private_payload quote_payload,q.input_amount::text,q.output_amount::text,o.state FROM zee.base_attempts a JOIN zee.orders o ON o.id=a.order_id JOIN zee.quotes q ON q.id=o.id WHERE a.tx_hash=$1 AND a.phase=$2',[tx,phase])).rows;need(rows.length===1,'KNOWN_BASE_ATTEMPT');row=rows[0];signedContext=`base-signed:${row.order_id}:${phase}:v1`;receiptContext=`base-receipt:${row.order_id}:${phase}:v1`;
 }else if(['PayoutCommitted','EscrowSettled'].includes(e.event)){
  phase=e.event==='PayoutCommitted'?'COMMIT':'SETTLE';const table=phase==='COMMIT'?'escrow_commits':'escrow_settlements';const rows=(await db.query(`SELECT a.*,q.settlement_id,q.private_payload quote_payload,q.input_amount::text,q.output_amount::text,o.state FROM zee.${table} a JOIN zee.orders o ON o.id=a.order_id JOIN zee.quotes q ON q.id=o.id WHERE a.tx_hash=$1`,[tx])).rows;need(rows.length===1,'KNOWN_ESCROW_ATTEMPT');row=rows[0];signedContext=phase==='COMMIT'?`escrow-commit:${row.order_id}:v1`:`escrow-settle:${row.order_id}:v1`;receiptContext=phase==='COMMIT'?`escrow-proof:${row.order_id}:v1`:`escrow-settle-proof:${row.order_id}:v1`;
 }else if(['SettlementCancelled','Refunded'].includes(e.event)){
  phase=e.event==='SettlementCancelled'?'CANCEL':'REFUND';const rows=(await db.query('SELECT a.*,q.settlement_id,q.private_payload quote_payload,q.input_amount::text,q.output_amount::text,o.state FROM zee.source_refunds a JOIN zee.orders o ON o.id=a.order_id JOIN zee.quotes q ON q.id=o.id WHERE a.base_hash=$1 AND a.base_phase=$2',[tx,phase])).rows;need(rows.length===1,'KNOWN_REFUND_ATTEMPT');row=rows[0];row={...row,signed_payload:row.base_payload,receipt_payload:row.base_receipt,block_height:row.base_height,block_hash:row.base_block,confirmed:row.base_confirmed};signedContext=`source-refund:${row.order_id}:${phase}:v1`;receiptContext=`source-refund:${row.order_id}:${phase}-proof:v1`;
 }else if(e.event==='Funded'){
  const identity=depositIdentity({network:'base-sepolia',txid:e.txHash.slice(2),index:e.logIndex,emitter:e.contract} as DepositInput);
  const rows=(await db.query("SELECT d.*,q.settlement_id,q.private_payload quote_payload,q.input_amount::text,q.output_amount::text,o.state FROM zee.deposits d JOIN zee.orders o ON o.id=d.order_id JOIN zee.quotes q ON q.id=o.id WHERE d.identity_hash=$1 AND d.network='base-sepolia'",[keys.lookup('deposit',identity)])).rows;
  need(rows.length===1,'KNOWN_FUNDING');row=rows[0];const original=keys.open(row.private_payload,`deposit:${identity}:v1`) as any,quote=keys.open(row.quote_payload,`quote:${row.order_id}:v1`) as any;
  need(row.confirmed_at!=null&&original.txid===e.txHash.slice(2)&&original.index===e.logIndex&&original.emitter.toLowerCase()===e.contract.toLowerCase()&&Number(original.height)===e.block.height&&original.blockHash===e.block.hash.slice(2)&&String(original.amount)===row.input_amount&&String(row.amount)===row.input_amount&&e.decoded.amount===row.input_amount&&e.decoded.payer.toLowerCase()===quote.payer.toLowerCase(),'FUNDING_RECEIPT');
  const bindings=(await db.query('SELECT terms_payload FROM zee.escrow_bindings WHERE order_id=$1',[row.order_id])).rows;need(bindings.length===1,'FUNDING_TERMS');const pinned=keys.open(bindings[0].terms_payload,`escrow-terms:${row.order_id}:v1`) as any;need(pinned.terms.id===e.settlementId&&pinned.terms.amount===row.input_amount&&pinned.terms.payer.toLowerCase()===e.decoded.payer.toLowerCase()&&pinned.terms.cancellationAvailableAt===e.decoded.cancellationAvailableAt,'FUNDING_CANCELLATION');
  phase='FUND';signedContext='';receiptContext='';
 }else throw Error('CONTINUOUS_SOURCE_UNKNOWN_EVENT_REQUIRES_ROOT_REVIEW');
 need(['SETTLED','REFUNDED'].includes(row.state)&&publicSettlementId(row.settlement_id)===e.settlementId&&e.decoded.id===e.settlementId&&Number(row.block_height)===e.block.height&&row.block_hash===e.block.hash.slice(2),'TERMINAL_EVENT_IDENTITY');
 if(phase!=='FUND'){
  need(row.confirmed===true&&Buffer.isBuffer(row.signed_payload)&&Buffer.isBuffer(row.receipt_payload),'FINAL_RECEIPT');const signed=keys.open(row.signed_payload,signedContext) as any,receipt=keys.open(row.receipt_payload,receiptContext) as any;
  need(signed.hash===e.txHash&&typeof signed.raw==='string'&&keccak256(signed.raw as Hex)===e.txHash&&(receipt.hash??receipt.transactionHash)===e.txHash&&Number(receipt.blockHeight??receipt.blockNumber)===e.block.height&&String(receipt.blockHash).replace(/^0x/,'')===row.block_hash,'ORIGINAL_SIGNED_RECEIPT');
  const quote=keys.open(row.quote_payload,`quote:${row.order_id}:v1`) as any;
  if(phase==='RESERVE'||phase==='PAY')need(e.decoded.recipient.toLowerCase()===quote.recipient.toLowerCase()&&e.decoded.amount===row.output_amount&&receipt.id===e.settlementId&&receipt.amount===row.output_amount,'PAYOUT_TERMS');
  if(phase==='SETTLE')need(e.decoded.amount===row.input_amount,'SETTLEMENT_AMOUNT');
  if(phase==='REFUND')need(e.decoded.amount===row.input_amount&&e.decoded.recipient.toLowerCase()===quote.refundRecipient.toLowerCase(),'REFUND_TERMS');
 }
 const canonical=(await db.query("SELECT EXISTS(SELECT 1 FROM zee.chain_observations b JOIN zee.scanner_checkpoints c USING(network) WHERE b.network='base-sepolia' AND b.height=$1 AND b.block_hash=$2 AND c.finalized_height>=b.height) yes",[e.block.height,e.block.hash.slice(2)])).rows[0]?.yes;
 need(canonical===true,'CANONICAL_FINALIZED_RECEIPT');return createHash('sha256').update(stable({journalQualificationSha256,orderId:row.order_id,phase,event:e})).digest('hex');
}
