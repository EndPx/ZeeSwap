/** Read-only closure of original signer journals against authenticated terminal SQL.
 * This module never opens wallet storage, signs, broadcasts or changes a cursor. */
import {readFile,lstat,readdir,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {posix} from 'node:path';
import type pg from 'pg';
import {encodeFunctionData,keccak256,parseTransaction,recoverTransactionAddress,recoverTypedDataAddress,getAddress,type Hex,type TransactionSerialized} from 'viem';
import {publicSettlementId,payoutTypedData,jsonSafe,settlementAbi,BaseContract,type BaseRegistry} from './base-contract.ts';
import {fundingTypedData} from './base-escrow.ts';
import {validatePrepared,type PreparedBaseTransaction} from './base-signer.ts';
import {approvalDigest} from './reverse-authority.ts';
import {validatePreparedZcash} from './reverse-settlement.ts';
import {PrivateData} from './private-data.ts';
import {stable} from './integrations/observation/types.ts';

export type ClosedJournalTree={path:string;files:{relativePath:string;sha256:string}[]};
export type ClosedJournalFile={path:string;bytes:Buffer};
const ROOT='/opt/zeeswap-testnet/state',UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,HASH=/^[a-f0-9]{64}$/;
const sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const journalRoot=(path:string)=>path===ROOT+'/base-signer-journal'||path===ROOT+'/reverse-orders'||path===ROOT+'/refund-orders'||new RegExp('^'+ROOT+'/testnet-policy/[a-f0-9]{64}/orders$').test(path);
function need(v:unknown,c:string):asserts v{if(!v)throw Error('CLOSED_RECOVERY_JOURNAL_'+c);}
const same=(a:unknown,b:unknown)=>stable(a)===stable(b);
const json=(b:Buffer)=>JSON.parse(b.toString());
function bytes(v:unknown){need(Buffer.isBuffer(v),'SQL_BYTES');return v;}
export type ClosedJournalSql={orders:any[];base_bindings:any[];base_attempts:any[];escrow_bindings:any[];escrow_commits:any[];escrow_settlements:any[];reverse_payouts:any[];source_refunds:any[]};

/** Caller holds a repeatable-read closed-books transaction. All rows are bounded,
 * and receipt anchors are checked without filtering away historical phases. */
export async function readClosedJournalSql(db:Pick<pg.PoolClient,'query'>):Promise<ClosedJournalSql>{
 const orders=(await db.query(`SELECT q.*,o.state,d.amount::text received_amount,a.policy_sha256,a.accepted_epoch::text FROM zee.orders o JOIN zee.quotes q USING(id) LEFT JOIN zee.deposits d ON d.id=o.primary_deposit
 LEFT JOIN zee.testnet_policy_admissions a ON a.order_id=o.id ORDER BY o.id LIMIT 65`)).rows;
 need(orders.length<=64,'ORDER_BOUND');const result:any={orders};
 for(const table of ['base_bindings','base_attempts','escrow_bindings','escrow_commits','escrow_settlements','reverse_payouts','source_refunds']){
  const receipts=['base_attempts','escrow_commits','escrow_settlements','reverse_payouts'].includes(table);
  const network=table==='reverse_payouts'?'zcash-testnet':'base-sepolia';
  result[table]=(await db.query(`SELECT t.*${receipts?`,EXISTS(SELECT 1 FROM zee.chain_observations b JOIN zee.scanner_checkpoints c USING(network) WHERE b.network='${network}' AND b.height=t.block_height AND b.block_hash=t.block_hash AND c.finalized_height>=b.height) canonical`:table==='source_refunds'?`,EXISTS(SELECT 1 FROM zee.chain_observations b JOIN zee.scanner_checkpoints c USING(network) WHERE b.network='base-sepolia' AND b.height=t.base_height AND b.block_hash=t.base_block AND c.finalized_height>=b.height) base_canonical,EXISTS(SELECT 1 FROM zee.chain_observations b JOIN zee.scanner_checkpoints c USING(network) WHERE b.network=CASE WHEN t.base_phase='CANCEL' THEN 'zcash-testnet' ELSE 'base-sepolia' END AND b.height=t.height AND b.block_hash=t.block_hash AND c.finalized_height>=b.height) canonical`:''} FROM zee.${table} t ORDER BY order_id LIMIT 129`)).rows;
  need(result[table].length<=128,'SQL_BOUND');
 }
 return result;
}

/** Pure inventory seam used by fixtures. Baseline files remain byte-for-byte;
 * every additional file must be consumed by a complete authenticated closure. */
export async function qualifyClosedJournalInventory(trees:ClosedJournalTree[],files:ClosedJournalFile[],sql:ClosedJournalSql,keys:PrivateData,registry:BaseRegistry,delivered=false){
 need(Array.isArray(trees)&&trees.length>=1&&trees.length<=12&&files.length<=4096,'BOUND');
 const found=new Map<string,Buffer>(),used=new Set<string>(),baseline=new Set<string>();
 for(const f of files){need(!found.has(f.path)&&f.bytes.length<=16000000,'DUPLICATE_OR_SIZE');found.set(f.path,f.bytes);}
 const roots=new Set<string>();
 for(const t of trees){need(journalRoot(t.path)&&posix.normalize(t.path)===t.path&&!roots.has(t.path)&&t.files.length<=4096,'ROOT');roots.add(t.path);
  for(const f of t.files){need(f.relativePath!==''&&!posix.isAbsolute(f.relativePath)&&posix.normalize(f.relativePath)===f.relativePath&&!f.relativePath.split('/').includes('..')&&!f.relativePath.includes('\\')&&HASH.test(f.sha256),'BASELINE_PATH');const p=t.path+'/'+f.relativePath;need(!baseline.has(p)&&found.has(p)&&sha(found.get(p)!)===f.sha256,'BASELINE_CHANGED');baseline.add(p);used.add(p);}
 }
 need([ROOT+'/base-signer-journal',ROOT+'/reverse-orders',ROOT+'/refund-orders'].every(r=>roots.has(r))&&[...roots].filter(r=>r.includes('/testnet-policy/')).length===1,'REQUIRED_ROOTS');
 for(const p of found.keys())need([...roots].filter(r=>p.startsWith(r+'/')).length===1,'OUTSIDE_ROOT');
 const extras=[...found.keys()].filter(p=>!used.has(p));
 const orders=new Map(sql.orders.map(o=>[o.id,o]));need(orders.size===sql.orders.length&&orders.size<=64,'ORDERS');
 const one=(table:keyof ClosedJournalSql,id:string)=>{const rows=sql[table].filter(r=>r.order_id===id);need(rows.length===1,'SQL_ROW');return rows[0];};
 const open=(payload:unknown,context:string)=>keys.open(bytes(payload),context) as any;
 const load=(p:string)=>{need(found.has(p),'MISSING_FILE');used.add(p);return json(found.get(p)!);};
 const allowPin=(p:any,directory:string)=>{need(p&&typeof p.path==='string'&&p.path.startsWith(directory+'/')&&posix.normalize(p.path)===p.path&&HASH.test(p.sha256)&&found.has(p.path)&&sha(found.get(p.path)!)===p.sha256,'PIN');used.add(p.path);};
 const terminal=(id:string)=>{const q=orders.get(id);need(q&&UUID.test(id)&&(['SETTLED','REFUNDED'].includes(q.state)||delivered&&q.state==='READY'&&q.delivery_included===true&&q.direction==='ZCASH_TO_BASE')&&['ZCASH_TO_BASE','BASE_TO_ZCASH'].includes(q.direction),'NOT_TERMINAL');return q;};
 function confirmed(r:any){need((r?.confirmed===true&&r.canonical===true||delivered&&r?.delivery_included===true&&r.inclusion_canonical===true)&&HASH.test(r.block_hash)&&Number.isSafeInteger(Number(r.block_height))&&Number(r.block_height)>0&&r.receipt_payload,'UNCONFIRMED');}
 function prepared(r:any,context:string,hashDomain='base-tx'){
  const p=open(r.signed_payload,context);need(typeof p.hash==='string'||typeof p.txid==='string','PREPARED');need(bytes(r.tx_hash).equals(keys.lookup(hashDomain,p.hash??p.txid)),'TX_LOOKUP');return p;
 }
 function receipt(r:any,context:string,p:any,native=false){confirmed(r);const proof=open(r.receipt_payload,context);
  need((native?proof.txid:proof.hash??proof.transactionHash)===(p.hash??p.txid)&&Number(proof.blockHeight??proof.blockNumber)===Number(r.block_height)&&String(proof.blockHash).replace(/^0x/,'')===r.block_hash,'RECEIPT');return proof;
 }
 const baseRoot=ROOT+'/base-signer-journal',base=new BaseContract(registry),closed=new Set<string>();
 async function baseTx(id:string,phase:string,r:any,context:string,terms:any,signature?:Hex,externalPayer=false){
  const p=prepared(r,context),prefix=sha(publicSettlementId(terminal(id).settlement_id)),suffix=phase==='CANCEL'||phase==='REFUND'?`.refund.${phase}.tx.json`:`.${phase}.tx.json`,path=baseRoot+'/'+prefix+suffix;
  if(!externalPayer||found.has(path)){const entry=load(path);need(same({raw:entry.raw,hash:entry.hash,nonce:entry.nonce,maxCost:entry.maxCost},p)&&same(entry.terms,terms),'ORIGINAL_BASE_BYTES');}
  need(r.max_cost===p.maxCost,'MAX_COST');
  if(phase==='RESERVE'||phase==='PAY')await validatePrepared(registry,terms,signature!,phase,p);
  else{const tx=parseTransaction(p.raw),method=({COMMIT:'commitPayout',SETTLE:'settleEscrow',CANCEL:'cancelSettlement',REFUND:'refund'} as const)[phase as 'COMMIT'];
   need(tx.type==='legacy'&&tx.chainId===84532&&tx.nonce===p.nonce&&keccak256(p.raw)===p.hash&&getAddress(await recoverTransactionAddress({serializedTransaction:p.raw as TransactionSerialized}))===getAddress(phase==='REFUND'?terms.payer:registry.operator)&&tx.to?.toLowerCase()===registry.contracts.ZeeSwapSettlement.address.toLowerCase()&&(tx.value??0n)===0n&&tx.data===encodeFunctionData({abi:settlementAbi,functionName:method,args:[terms.id]})&&!!tx.gas&&tx.gas<=450000n&&!!tx.gasPrice&&tx.gasPrice<=20000000n&&BigInt(p.maxCost)<=10000000000000n&&tx.gas*tx.gasPrice<=BigInt(p.maxCost),'BASE_SIGNATURE');
  }
  return p;
 }
 async function closeOrder(id:string){if(closed.has(id))return;closed.add(id);const q=terminal(id),prefix=sha(publicSettlementId(q.settlement_id));
  need(Buffer.isBuffer(q.policy_sha256)&&q.policy_sha256.length===32,'POLICY_MEMBERSHIP');const policy=q.policy_sha256.toString('hex'),processRoot=ROOT+'/testnet-policy/'+policy+'/orders',process=load(processRoot+'/'+id+'/process.private.json');
  need(roots.has(processRoot)&&process.version===1&&process.policyContext?.orderId===id&&process.policyContext.policySha256===policy&&process.policyContext.activeEpoch===q.accepted_epoch,'PROCESS_BINDING');
  const quote=open(q.private_payload,`quote:${id}:v1`);need(quote.inputAmount===q.input_amount&&quote.outputAmount===q.output_amount,'QUOTE');
  const forward=q.direction==='ZCASH_TO_BASE';
  if(forward&&(q.state==='SETTLED'||delivered&&q.delivery_included===true)){
   const terms=open(one('base_bindings',id).terms_payload,`base-terms:${id}:v1`),auth=load(baseRoot+'/'+prefix+'.auth.json');need(same(auth.terms,terms)&&terms.id===publicSettlementId(q.settlement_id)&&terms.amount===q.output_amount&&terms.recipient===quote.recipient,'TERMS');
   need(same(load(baseRoot+'/'+prefix+'.typed.json'),JSON.parse(jsonSafe(payoutTypedData(registry,terms)))),'TYPED');
   for(const phase of ['RESERVE','PAY']){const rows=sql.base_attempts.filter(r=>r.order_id===id&&r.phase===phase);need(rows.length===1,'ATTEMPT');const r=rows[0],p=await baseTx(id,phase,r,`base-signed:${id}:${phase}:v1`,terms,auth.signature);const proof=receipt(r,`${r.delivery_included===true?'base-inclusion':'base-receipt'}:${id}:${phase}:v1`,p);
    if(r.delivery_included===true){const live=await base.includedReceipt(p.hash,phase as 'RESERVE'|'PAY',terms);need(live&&same(live,proof)&&BigInt(live.fee)<=BigInt(p.maxCost),'INCLUSION_CHANGED');}
   }
   if(q.delivery_included===true)need(await base.state(terms.id)===2,'DELIVERED_CONTRACT_STATE');
  }else if(!forward){
   const pinned=open(one('escrow_bindings',id).terms_payload,`escrow-terms:${id}:v1`),terms=pinned.terms,auth=load(baseRoot+'/'+prefix+'.reverse.auth.json');need(same(auth,pinned)&&terms.id===publicSettlementId(q.settlement_id)&&terms.amount===q.input_amount&&terms.payer===quote.payer,'ESCROW_TERMS');
   need(getAddress(await recoverTypedDataAddress({...fundingTypedData(base,terms),signature:pinned.signature}))===getAddress(registry.operator)&&same(load(baseRoot+'/'+prefix+'.reverse.typed.json'),JSON.parse(jsonSafe(fundingTypedData(base,terms)))),'FUNDING_SIGNATURE');
   if(q.state==='SETTLED'){
    for(const [table,phase,context,proof] of [['escrow_commits','COMMIT',`escrow-commit:${id}:v1`,`escrow-proof:${id}:v1`],['escrow_settlements','SETTLE',`escrow-settle:${id}:v1`,`escrow-settle-proof:${id}:v1`]] as const){const r=one(table,id),p=await baseTx(id,phase,r,context,terms);receipt(r,proof,p);}
    native(id,false,quote);
   }else await refund(id,false,quote);
  }else{
   // A finalized reservation may precede permanent cancellation. Retain and
   // authenticate that original phase; refund closure never permits a PAY.
   if(sql.base_bindings.some(r=>r.order_id===id)){
    const terms=open(one('base_bindings',id).terms_payload,`base-terms:${id}:v1`),auth=load(baseRoot+'/'+prefix+'.auth.json');need(same(auth.terms,terms)&&terms.id===publicSettlementId(q.settlement_id)&&terms.amount===q.output_amount&&terms.recipient===quote.recipient,'TERMS');
    need(same(load(baseRoot+'/'+prefix+'.typed.json'),JSON.parse(jsonSafe(payoutTypedData(registry,terms)))),'TYPED');
    for(const r of sql.base_attempts.filter(r=>r.order_id===id)){need(r.phase==='RESERVE','REFUND_PAY_CONFLICT');const p=await baseTx(id,'RESERVE',r,`base-signed:${id}:RESERVE:v1`,terms,auth.signature);receipt(r,`base-receipt:${id}:RESERVE:v1`,p);}
   }
   await refund(id,true,quote);
  }
 }
 async function refund(id:string,forward:boolean,quote:any){const r=one('source_refunds',id);need(r.confirmed===true&&r.base_confirmed===true&&r.base_canonical===true&&r.canonical===true,'REFUND_PENDING');
  const p=open(r.base_payload,`source-refund:${id}:${r.base_phase}:v1`),proof=open(r.base_receipt,`source-refund:${id}:${r.base_phase}-proof:v1`);need(bytes(r.base_hash).equals(keys.lookup('base-tx',p.hash))&&proof.hash===p.hash&&Number(proof.blockHeight)===Number(r.base_height)&&String(proof.blockHash).replace(/^0x/,'')===r.base_block,'REFUND_BASE_RECEIPT');
  const q=terminal(id),path=baseRoot+'/'+sha(publicSettlementId(q.settlement_id))+`.refund.${r.base_phase}.tx.json`,externalPayer=!forward&&r.base_phase==='REFUND'&&getAddress(quote.payer)!==getAddress(registry.operator),funding=!forward?open(one('escrow_bindings',id).terms_payload,`escrow-terms:${id}:v1`).terms:undefined;
  // External original-payer refunds have no operator signer journal. Authenticate
  // the SQL original raw bytes, payer and final canonical refund receipt instead.
  need(!externalPayer||funding.payer===quote.payer&&funding.amount===q.input_amount,'EXTERNAL_REFUND_TERMS');
  const terms=found.has(path)?load(path).terms:externalPayer?{...funding,orderId:id,phase:'REFUND'}:undefined;
  need(terms&&terms.id===publicSettlementId(q.settlement_id)&&terms.orderId===id&&terms.phase===r.base_phase&&(forward||getAddress(terms.payer)===getAddress(quote.payer)),'REFUND_TERMS');await baseTx(id,r.base_phase,{...r,signed_payload:r.base_payload,tx_hash:r.base_hash,max_cost:r.base_max_cost},`source-refund:${id}:${r.base_phase}:v1`,terms,undefined,externalPayer);
  if(forward)native(id,true,quote);
 }
 function native(id:string,refund:boolean,quote:any){const directory=ROOT+(refund?'/refund-orders/':'/reverse-orders/')+id,r=one(refund?'source_refunds':'reverse_payouts',id),context=refund?`source-refund:${id}:ZCASH:v1`:`reverse-payout:${id}:v1`,p=open(refund?r.zcash_payload:r.signed_payload,context);
  need(bytes(refund?r.zcash_hash:r.tx_hash).equals(keys.lookup('zcash-tx',p.txid)),'NATIVE_HASH');
  const q=terminal(id),amount=refund?q.received_amount:q.output_amount,recipient=refund?quote.refundRecipient:quote.recipient,maxFee=refund?q.refund_fee:q.payout_fee;
  validatePreparedZcash(p,{orderId:id,operationId:id,recipient,amountZatoshi:amount,maxFeeZatoshi:maxFee});
  const proof=open(r.receipt_payload,refund?`source-refund:${id}:ZCASH-proof:v1`:`reverse-receipt:${id}:v1`);confirmed({...r,block_height:refund?r.height:r.block_height});
  const intent=load(directory+(refund?'/refund-intent.private.json':'/payout-intent.private.json')),approved=load(directory+'/approved.private.json'),config=load(directory+'/prepared.private.json'),state=load(directory+'/state.private.json');
  const rawPath=directory+(refund?'/refund-intent.private.json.raw.private':'/payout-intent.private.json.raw.private');need(found.has(rawPath)&&found.get(rawPath)!.equals(Buffer.from(p.rawTransaction,'hex')),'NATIVE_RAW_FILE');used.add(rawPath);
  need(intent.state==='DELIVERY_CONFIRMED'&&same(intent.prepared,p)&&same(intent.request,approved)&&intent.approvedDigest===approvalDigest(approved)&&approved.orderId===id&&approved.recipient===recipient&&approved.amountZatoshi===amount&&state.orderId===id&&state.approvedDigest===intent.approvedDigest&&config.approvedDigest===intent.approvedDigest&&config.approvedRequestSha256===sha(found.get(directory+'/approved.private.json')!)&&state.nativeConfigSha256===sha(found.get(directory+'/prepared.private.json')!),'NATIVE_IDENTITY');
  const j=intent.receipt;need(j?.confirmed===true&&j.shielded===true&&j.approvedDigest===intent.approvedDigest&&j.orderId===id&&j.txid===p.txid&&proof.txid===p.txid&&proof.shielded===true&&proof.pool==='ironwood'&&Number(proof.tipHeight)-Number(proof.blockHeight)+1>=10&&Number(j.tipHeight)-Number(j.blockHeight)+1===j.confirmations&&j.confirmations>=10&&Number(j.blockHeight)===Number(proof.blockHeight)&&j.blockHash===proof.blockHash&&j.amount===proof.amountZatoshi&&j.fee===proof.feeZatoshi&&j.recipient===proof.recipient&&Number(proof.blockHeight)===Number(refund?r.height:r.block_height)&&proof.blockHash===r.block_hash,'NATIVE_RECEIPT');
  for(const [name,digest] of [['preflight.private.json',config.preflightConfigSha256],['guard.private.json',config.guardConfigSha256],['capital-approval.private.json',config.capitalApprovalSha256]] as const){allowPin({path:directory+'/'+name,sha256:digest},directory);}
  const capital=load(directory+'/capital-approval.private.json');for(const pin of capital.sources??[])allowPin(pin,directory);if(capital.policyCapital?.capture)allowPin(capital.policyCapital.capture,directory);
  for(const name of refund?['cancel-approved.private.json','cancel-signer.private.json']:['base-signer.private.json']){const path=directory+'/'+name;if(found.has(path))load(path);}
 }
 // A completely missing new journal must not disappear merely because there is
 // no extra file to iterate. Only frozen legacy terminal evidence exempts an order.
 for(const q of sql.orders.filter(q=>delivered&&q.state==='READY'&&q.delivery_included===true))await closeOrder(q.id);
 for(const q of sql.orders.filter(q=>['SETTLED','REFUNDED'].includes(q.state))){const prefix=sha(publicSettlementId(q.settlement_id)),terminalFile=q.state==='SETTLED'?baseRoot+'/'+prefix+(q.direction==='ZCASH_TO_BASE'?'.PAY.tx.json':'.SETTLE.tx.json'):q.direction==='ZCASH_TO_BASE'?ROOT+'/refund-orders/'+q.id+'/refund-intent.private.json':baseRoot+'/'+prefix+'.refund.REFUND.tx.json';
  if(!baseline.has(terminalFile))await closeOrder(q.id);
 }
 for(const path of extras){const root=[...roots].find(r=>path.startsWith(r+'/'))!,relative=path.slice(root.length+1);let id:string|undefined;
  if(root===baseRoot){if(relative==='signer.lock'){need(found.get(path)!.length===0,'LOCK_CONTENT');used.add(path);continue;}const m=relative.match(/^([a-f0-9]{64})\.(?:auth\.json|typed\.json|reverse\.(?:auth|typed)\.json|(?:RESERVE|PAY|COMMIT|SETTLE)\.tx\.json|refund\.(?:CANCEL|REFUND)\.tx\.json)$/);need(m,'UNKNOWN_BASE_FILE');id=sql.orders.find(q=>sha(publicSettlementId(q.settlement_id))===m[1])?.id;}
  else{const m=relative.match(/^([a-f0-9-]{36})\/(.+)$/);need(m&&UUID.test(m[1]!), 'UNKNOWN_FILE');id=m[1];
   if(root.includes('/testnet-policy/')){need(m[2]==='process.private.json','UNKNOWN_PROCESS_FILE');const q=terminal(id!),v=load(path),policy=root.split('/testnet-policy/')[1]?.split('/')[0];need(v.version===1&&v.policyContext?.orderId===id&&v.policyContext.policySha256===policy&&Buffer.isBuffer(q.policy_sha256)&&q.policy_sha256.toString('hex')===policy&&v.policyContext.activeEpoch===q.accepted_epoch,'PROCESS_BINDING');}
   else need(root===ROOT+'/reverse-orders'||root===ROOT+'/refund-orders','UNKNOWN_TREE');
  }
  need(id,'UNKNOWN_ORDER');await closeOrder(id);
 }
 need([...found.keys()].every(p=>used.has(p)),'UNCONSUMED_FILE');
 const inventory=trees.map(t=>({path:t.path,files:[...found].filter(([p])=>p.startsWith(t.path+'/')).map(([p,b])=>({relativePath:p.slice(t.path.length+1),sha256:sha(b)})).sort((a,b)=>a.relativePath.localeCompare(b.relativePath))}));
 return{trees:inventory,digest:sha(stable(inventory)),newClosedOrders:closed.size};
}

export async function verifyDynamicClosedJournalTrees(trees:ClosedJournalTree[],db:Pick<pg.PoolClient,'query'>,keys:PrivateData,registry:BaseRegistry){
 const files:ClosedJournalFile[]=[];let total=0;
 async function protectedDirectory(path:string){const s=await lstat(path),originalService=[ROOT,ROOT+'/base-signer-journal',ROOT+'/reverse-orders'].includes(path)&&s.uid===986&&s.gid===978&&(s.mode&0o777)===0o700;need(s.isDirectory()&&!s.isSymbolicLink()&&await realpath(path)===path&&(s.uid===0&&(s.mode&0o022)===0||originalService),'DIRECTORY');}
 for(const tree of trees){need(journalRoot(tree.path)&&posix.normalize(tree.path)===tree.path,'ROOT');
  for(let parent=posix.dirname(tree.path);parent.startsWith('/opt/zeeswap-testnet');parent=posix.dirname(parent))await protectedDirectory(parent);
  async function walk(path:string){const s=await lstat(path);if(s.isDirectory()){await protectedDirectory(path);const names=await readdir(path);need(names.length<=4096,'BOUND');for(const n of names)await walk(path+'/'+n);}else{need(s.uid===0&&!s.isSymbolicLink()&&(s.mode&0o077)===0&&await realpath(path)===path&&s.isFile()&&s.size<=16000000,'FILE');total+=s.size;need(total<=64000000&&files.length<4096,'BOUND');files.push({path,bytes:await readFile(path)});}}
  try{await walk(tree.path);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;need(tree.files.length===0,'MISSING');}
 }
 return qualifyClosedJournalInventory(trees,files,await readClosedJournalSql(db),keys,registry);
}
