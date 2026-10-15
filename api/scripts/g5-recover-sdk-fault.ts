/** One explicit R4 durable SDK fault recovery. No prepare, funding, signing,
 * broadcast, replacement bytes, general incident reset or prior lease restore.
 * The only wallet mutation exports the original calculation into PREPARED.
 */
import {readdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {spawn} from 'node:child_process';
import {getAddress,parseAbi,encodeFunctionData,parseTransaction,keccak256,recoverTransactionAddress,type TransactionSerialized} from 'viem';
import {g5Context,read,durable,privateLocalPath} from './g5-context.ts';
import {captureG5SdkFaultBooks,requireG5SdkFaultMigrations} from '../src/g5-sdk-fault-books.ts';
import {captureG5WalletPartition} from './g5-physical-capture.ts';
import {requireG5SdkFaultRecovery,validateG5SdkFaultPrepared,validateG5SdkFaultWalletBalances,validateG5SdkFaultAccounts,validateG5SdkFaultPhysical,requireG5SdkFaultRetiredLease} from '../src/g5-sdk-fault.ts';
import {validateG5OpeningLedger,requireG5CommandConfig,g5PathIdentity} from '../src/g5-run.ts';
import {validateSnapshot} from '../src/observer.ts';
import {escrowTerms,finalizedReceipt,escrowState,escrowEvents,fundingCall} from '../src/base-escrow.ts';
import {settlementAbi} from '../src/base-contract.ts';
import {LocalReverseWalletAdapter} from '../src/reverse-wallet-adapter.ts';
import {reversePayoutTerms} from '../src/reverse-settlement.ts';
import {transaction} from '../src/db.ts';
import {g5Diagnostic} from '../src/g5-diagnostic.ts';
import {resolveG5ReferencedPrivatePath as sibling} from '../src/g5-private-path.ts';

const [manifestPath]=process.argv.slice(2);if(!manifestPath||process.argv.length!==3)throw Error('G5_SDK_FAULT_MANIFEST_REQUIRED');
const c=await g5Context(manifestPath);let phase='r4-sdk-fault-guard';
const stable=(value:any)=>JSON.stringify(value,(_k,v)=>Buffer.isBuffer(v)?v.toString('hex'):v);
try{
 const config=await read(c.config.reverseOrders[1].configFile),reverse=await read(config.stateFile);
 const raw=await read(config.zcashPrivateConfig),baseSigner=await read(config.baseSignerPrivateConfig);
 const markerPath=sibling(config.zcashPrivateConfig,raw.journalPath+'.g5-sdk-crash.private.json'),marker=await read(markerPath);
 requireG5SdkFaultRecovery(c.state,c.config,reverse,marker);
 if(config.sequence!==4||g5PathIdentity(config.runConfig)!==g5PathIdentity(privateLocalPath(manifestPath))||config.baseFeeBudget!==c.config.baseFeeBudget
  ||config.inputAmount!=='100000'||config.approvedDigest!==reverse.approvedDigest||raw.approvedDigest!==reverse.approvedDigest
  ||baseSigner.reverseApprovedDigest!==reverse.approvedDigest)throw Error('G5_SDK_FAULT_PRIVATE_CONFIG_BINDING');
 requireG5CommandConfig(config.zcashArgs,config.zcashPrivateConfig);
 const wrappers=config.zcashArgs.filter((a:string)=>a.replaceAll('\\','/').endsWith('/api/scripts/g5-sdk-crash.py'));
 if(wrappers.length!==1)throw Error('G5_SDK_FAULT_FIXED_WRAPPER_REQUIRED');
 const request=await read(sibling(config.zcashPrivateConfig,raw.approvedRequest));
 for(const path of [config.approvedRequest,config.baseSignerApprovedRequestFile,sibling(config.baseSignerPrivateConfig,baseSigner.reverseApprovedRequest)])
  if(!isDeepStrictEqual(await read(path),request))throw Error('G5_SDK_FAULT_APPROVAL_FILES_CHANGED');
 if(!isDeepStrictEqual(request,reverse.approvedRequest)||request.orderId!==reverse.orderId||request.amountZatoshi!=='100000'||request.maxFeeZatoshi!=='10000')throw Error('G5_SDK_FAULT_REQUEST_CHANGED');
 const allocation=(c.state.openingCapital as any[]).find(n=>n.sequence===4),note=raw.approvedCapitalNotes?.[0];
 if(!allocation||raw.capitalReceiver!==allocation.receiver||raw.capitalUfvkSha256!==allocation.ufvkSha256||raw.approvedCapitalNotes?.length!==1
  ||!isDeepStrictEqual(note,{pool:allocation.pool,txid:allocation.txid,index:allocation.index,value:allocation.amount}))throw Error('G5_SDK_FAULT_CAPITAL_BINDING');
 const control=(await c.admin.query('SELECT * FROM zee.runtime_control')).rows[0];
 if(control.accepting_orders||control.dispatch_enabled||!control.reconciliation_required)throw Error('G5_SDK_FAULT_PAUSED_INCIDENT_REQUIRED');
 const migrationPins=await requireG5SdkFaultMigrations(c.admin);
 const ids=c.state.orders.map(o=>o.orderId!),r4=ids[3];
 async function databaseProof(db:Pick<typeof c.admin,'query'>=c.admin){
  const {orders,quotes,deposits,obligations,reservations,operations,jobs,payouts,settlements,commits,attempts,accounts}=await captureG5SdkFaultBooks(db);
  if(orders.length!==4||quotes.length!==4||orders.some(o=>!ids.includes(o.id)||o.state!==(o.id===r4?'READY':'SETTLED'))
   ||quotes.some(q=>!ids.includes(q.id)||q.direction!==c.state.orders.find(o=>o.orderId===q.id)?.direction||q.input_amount!=='100000'||q.output_amount!=='100000'
    ||q.payout_fee!==(q.direction==='ZCASH_TO_BASE'?c.config.baseFeeBudget:'10000')||q.refund_fee!==(q.direction==='ZCASH_TO_BASE'?'10000':c.config.baseFeeBudget)))throw Error('G5_SDK_FAULT_EXACT_FOUR_ORDERS_REQUIRED');
  if(deposits.length!==4||obligations.length!==4||deposits.some(d=>!ids.includes(d.order_id)||d.amount!=='100000'||d.classification!=='EXACT'||!d.confirmed_at))throw Error('G5_SDK_FAULT_EXACT_SOURCE_REQUIRED');
  for(const id of ids){const d=deposits.filter(d=>d.order_id===id),o=obligations.filter(o=>o.order_id===id);
   if(d.length!==1||o.length!==1||o[0].deposit_id!==d[0].id||o[0].source_amount!=='100000'||o[0].state!==(id===r4?'HELD':'DISCHARGED')
    ||orders.find(o=>o.id===id)?.primary_deposit!==d[0].id)throw Error('G5_SDK_FAULT_OBLIGATION_BINDING');}
  if(reservations.length!==12||ids.some(id=>reservations.filter(r=>r.order_id===id).length!==3)||reservations.some(r=>!ids.includes(r.order_id)||(r.order_id===r4?!!r.released_at:!r.released_at))
   ||[['TAZ','principal','100000'],['TAZ','fee','10000'],['baseETH','fee',c.config.baseFeeBudget]].some(([a,p,n])=>reservations.filter(r=>r.order_id===r4&&r.asset===a&&r.purpose===p&&r.amount===n&&!r.released_at).length!==1))throw Error('G5_SDK_FAULT_RESERVATIONS_MISMATCH');
  if(operations.length!==4||jobs.length!==4||operations.some(o=>!ids.includes(o.order_id)||o.kind!=='PAYOUT'||o.state!==(o.order_id===r4?'PLANNED':'CONFIRMED')||!o.chain_authorization_verified)
   ||ids.some(id=>operations.filter(o=>o.order_id===id).length!==1))throw Error('G5_SDK_FAULT_OPERATIONS_MISMATCH');
  const operation=operations.find(o=>o.order_id===r4),job=jobs.find(j=>j.operation_id===operation.id),lease=reverse.currentLease;
  requireG5SdkFaultRetiredLease(job,lease);
  if(jobs.some(j=>j.id!==job.id&&(j.status!=='DONE'||!operations.some(o=>o.id===j.operation_id&&o.order_id!==r4))))throw Error('G5_SDK_FAULT_EXPECTED_JOBS_REQUIRED');
  if(payouts.length!==1||payouts[0].order_id!==ids[1]||!payouts[0].confirmed||settlements.length!==1||settlements[0].order_id!==ids[1]||!settlements[0].confirmed
   ||commits.length!==2||commits.some(a=>![ids[1],r4].includes(a.order_id)||!a.confirmed)||attempts.length!==4||attempts.some(a=>![ids[0],ids[2]].includes(a.order_id)||!a.confirmed)
   ||(await db.query('SELECT count(*) AS n FROM zee.source_refunds')).rows[0].n!=='0')throw Error('G5_SDK_FAULT_ORIGINAL_ATTEMPTS_REQUIRED');
  if((await db.query('SELECT event_id,asset FROM zee.ledger_entries GROUP BY event_id,asset HAVING sum(amount)<>0')).rowCount)throw Error('G5_SDK_FAULT_UNBALANCED_LEDGER');
  validateG5OpeningLedger((await db.query('SELECT event_id,asset,bucket,amount::text FROM zee.ledger_entries WHERE event_id=$1',[c.state.openingEventId])).rows,c.state.openingEventId,c.config.branchId);
  const proceeds=(await db.query("SELECT asset,sum(amount)::text AS amount FROM zee.ledger_entries WHERE bucket='operator:unreconciled' GROUP BY asset")).rows;
  if(proceeds.length!==2||proceeds.find(r=>r.asset==='TAZ')?.amount!=='200000'||proceeds.find(r=>r.asset==='mockUSDC')?.amount!=='100000')throw Error('G5_SDK_FAULT_PROCEEDS_MISMATCH');
  return {orders,quotes,deposits,obligations,reservations,operations,jobs,payouts,settlements,commits,attempts,accounts};
 }
 const books=await databaseProof(),booksIdentity=stable(books);
 phase='fresh-original-base-journals';await c.base.preflight();
 async function journalMatches(id:string,p:string,signed:any){
  const name=createHash('sha256').update(id).digest('hex')+'.'+p+'.tx.json',journal=await read(sibling(config.baseSignerPrivateConfig,baseSigner.journalRoot+'/'+name));
  if(journal.raw!==signed.raw||journal.hash!==signed.hash||journal.nonce!==signed.nonce)throw Error('G5_SDK_FAULT_ORIGINAL_JOURNAL_MISMATCH');
  return validateGlobalRaw(journal,c.base.registry.operator);
 }
 async function validateGlobalRaw(journal:any,signer:string){
  if(typeof journal.raw!=='string'||keccak256(journal.raw)!==journal.hash)throw Error('G5_SDK_FAULT_GLOBAL_RAW_MISMATCH');
  const parsed=parseTransaction(journal.raw),tx=await c.base.client.getTransaction({hash:journal.hash}),receipt=await finalizedReceipt(c.base,journal.hash);
  if(!receipt||parsed.chainId!==84532||parsed.nonce!==journal.nonce||tx.nonce!==journal.nonce||tx.input!==parsed.data||(tx.value??0n)!==(parsed.value??0n)
   ||tx.to?.toLowerCase()!==parsed.to?.toLowerCase()||getAddress(tx.from)!==getAddress(signer)
   ||getAddress(await recoverTransactionAddress({serializedTransaction:journal.raw as TransactionSerialized}))!==getAddress(signer))throw Error('G5_SDK_FAULT_GLOBAL_RAW_CHAIN_MISMATCH');
  return tx;
 }
 let chargedFees=0n;
 for(const a of books.attempts){const row=(await c.worker.query('SELECT terms_payload FROM zee.base_bindings WHERE order_id=$1',[a.order_id])).rows[0];
  const terms=c.r.keys.open(row.terms_payload,`base-terms:${a.order_id}:v1`) as any,signed=c.r.keys.open(a.signed_payload,`base-signed:${a.order_id}:${a.phase}:v1`) as any;
  await journalMatches(terms.id,a.phase,signed);const receipt=await c.base.receipt(signed.hash,a.phase,terms);
  if(!receipt||receipt.fee!==a.actual_fee||receipt.blockHash.slice(2)!==a.block_hash||String(receipt.blockNumber)!==String(a.block_height))throw Error('G5_SDK_FAULT_PRIOR_FORWARD_RECEIPT_REQUIRED');chargedFees+=BigInt(receipt.fee);
 }
 let r4CommitFee=0n,latestOperatorNonce=-1,latestPayerNonce=-1;
 for(const sequence of [2,4]){
  const id=ids[sequence-1],cfg=await read(c.config.reverseOrders[sequence/2-1].configFile),saved=await read(cfg.stateFile),terms=await escrowTerms(c.worker,c.r.keys,c.base,id);
  const pinned=(await c.worker.query('SELECT terms_payload FROM zee.escrow_bindings WHERE order_id=$1',[id])).rows[0],auth=c.r.keys.open(pinned.terms_payload,`escrow-terms:${id}:v1`) as any;
  const fund=await finalizedReceipt(c.base,cfg.fundingTransactionHash),funded=await c.base.client.getTransaction({hash:cfg.fundingTransactionHash}),d=books.deposits.find(d=>d.order_id===id);
  if(!isDeepStrictEqual(auth.terms,terms)||!fund||funded.input!==fundingCall(c.base,terms,auth.signature)||funded.value!==0n||getAddress(funded.from)!==getAddress(terms.payer)
   ||funded.to?.toLowerCase()!==c.base.registry.contracts.ZeeSwapSettlement.address.toLowerCase()||fund.receipt.blockHash.slice(2)!==d.block_hash||String(fund.receipt.blockNumber)!==String(d.block_height)
   ||escrowEvents(c.base,fund.receipt,'Funded').filter((e:any)=>e.args.id===terms.id&&e.args.amount===100000n&&getAddress(e.args.payer)===getAddress(terms.payer)).length!==1)throw Error('G5_SDK_FAULT_FRESH_FUNDING_REQUIRED');
  const payerName=createHash('sha256').update(terms.id).digest('hex')+'.user-funding.tx.json',payer=await read(sibling(config.baseSignerPrivateConfig,'/home/albary/zeeswap-g5/refunds/payer-journal/'+payerName));
  await validateGlobalRaw(payer,terms.payer);
  if(payer.hash!==cfg.fundingTransactionHash||!isDeepStrictEqual(payer.approved,{version:1,branchId:c.config.branchId,sequence,orderId:id,funding:saved.funding}))throw Error('G5_SDK_FAULT_ORIGINAL_PAYER_APPROVAL_REQUIRED');
  if(sequence===4)latestPayerNonce=funded.nonce;
  for(const [table,p,context] of [['commits','COMMIT','escrow-commit'],...(sequence===2?[['settlements','SETTLE','escrow-settle']]:[])] as const){
   const a=(books as any)[table].find((a:any)=>a.order_id===id),signed=c.r.keys.open(a.signed_payload,`${context}:${id}:v1`) as any;
   const tx=await journalMatches(terms.id,p,signed),receipt=await finalizedReceipt(c.base,signed.hash);
   if(!receipt||tx.input!==encodeFunctionData({abi:settlementAbi,functionName:p==='COMMIT'?'commitPayout':'settleEscrow',args:[terms.id]})
    ||receipt.receipt.blockHash.slice(2)!==a.block_hash||String(receipt.receipt.blockNumber)!==String(a.block_height)
    ||escrowEvents(c.base,receipt.receipt,p==='COMMIT'?'PayoutCommitted':'EscrowSettled').filter((e:any)=>e.args.id===terms.id).length!==1)throw Error('G5_SDK_FAULT_FRESH_ESCROW_RECEIPT_REQUIRED');
   const l1=(receipt.receipt as any).l1Fee;if(typeof l1!=='bigint')throw Error('BASE_FEE_UNAVAILABLE');
   const fee=receipt.receipt.gasUsed*receipt.receipt.effectiveGasPrice+l1;if(fee.toString()!==a.actual_fee)throw Error('G5_SDK_FAULT_ESCROW_FEE_MISMATCH');
   if(sequence===4){r4CommitFee=fee;latestOperatorNonce=signed.nonce;
    if(request.base.commitTxHash!==signed.hash||request.base.commitBlockNumber!==String(a.block_height)||request.base.commitBlockHash!==receipt.receipt.blockHash
     ||request.settlementId!==terms.id||request.recipient!==config.recipient||request.base.amountAtomic!==terms.amount||request.base.chainId!==84532
     ||getAddress(request.base.contract)!==getAddress(c.base.registry.contracts.ZeeSwapSettlement.address)||getAddress(request.base.token)!==getAddress(terms.token)
     ||getAddress(request.base.payer)!==getAddress(terms.payer)||getAddress(request.base.refundRecipient)!==getAddress(terms.refundRecipient)
     ||request.base.cancellationAvailableAt!==terms.cancellationAvailableAt)throw Error('G5_SDK_FAULT_APPROVED_COMMIT_BINDING');
   }else chargedFees+=fee;
  }
  const heads=await c.base.heads();if(await escrowState(c.base,terms,heads.finalized.number)!==(sequence===2?6:5)||await escrowState(c.base,terms,heads.latest.number)!==(sequence===2?6:5))throw Error('G5_SDK_FAULT_EXACT_ESCROW_STATE_REQUIRED');
  if(sequence===2){const p=books.payouts[0],prepared=c.r.keys.open(p.signed_payload,`reverse-payout:${id}:v1`) as any;
   const wallet=new LocalReverseWalletAdapter(cfg.zcashCommand,cfg.zcashArgs,cfg.approvedDigest),q=await reversePayoutTerms(c.worker,c.r.keys,id),receipt=await wallet.receipt(prepared,q);
   if(!receipt||receipt.blockHash!==p.block_hash||String(receipt.blockHeight)!==String(p.block_height)||receipt.feeZatoshi!==p.actual_fee)throw Error('G5_SDK_FAULT_FRESH_R2_DELIVERY_REQUIRED');}
 }
 // Audit every retained global raw, including historical demonstrations, rather
 // than inferring no unknown nonce from only this run's application tables.
 for(const [root,signer] of [[baseSigner.journalRoot,c.base.registry.operator],['/home/albary/zeeswap-g5/refunds/payer-journal',config.payer]]){
  const local=sibling(config.baseSignerPrivateConfig,root),files=(await readdir(privateLocalPath(local))).filter(n=>n.endsWith('.tx.json'));
  if(!files.length||files.length>100)throw Error('G5_SDK_FAULT_GLOBAL_JOURNAL_WINDOW');
  for(const file of files)await validateGlobalRaw(await read(local+'/'+file),signer);
 }
 const nonces=await Promise.all([c.base.client.getTransactionCount({address:c.base.registry.operator,blockTag:'latest'}),c.base.client.getTransactionCount({address:c.base.registry.operator,blockTag:'pending'}),
  c.base.client.getTransactionCount({address:getAddress(config.payer),blockTag:'latest'}),c.base.client.getTransactionCount({address:getAddress(config.payer),blockTag:'pending'})]);
 if(nonces[0]!==latestOperatorNonce+1||nonces[1]!==nonces[0]||nonces[2]!==latestPayerNonce+1||nonces[2]!==nonces[3])throw Error('G5_SDK_FAULT_NONCE_GAP');
 validateG5SdkFaultAccounts(books.accounts,chargedFees.toString());
 phase='recover-original-sdk-private-journal';
 const proofArgs=config.zcashArgs.map((a:string)=>a===wrappers[0]?a.replace(/g5-sdk-crash\.py$/,'g5-sdk-fault-proof.py'):a);
 const proveOriginal=()=>new Promise<any>((resolve,reject)=>{
  const child=spawn(config.zcashCommand,proofArgs,{stdio:['ignore','pipe','pipe'],windowsHide:true});let output='',done=false;
  const fail=()=>{if(!done){done=true;reject(Error('G5_SDK_FAULT_PRIVATE_PROOF_REFUSED'));}};
  const timer=setTimeout(()=>{child.kill();fail();},120000);child.on('error',fail);
  child.stdout.on('data',b=>{output+=b;if(output.length>4_000_000){child.kill();fail();}});child.stderr.on('data',()=>{});
  child.on('close',code=>{clearTimeout(timer);if(done)return;if(code!==0){fail();return;}try{const value=JSON.parse(output);done=true;resolve(value);}catch{fail();}});
 });
 const faultProof=await proveOriginal();
 const terms=await reversePayoutTerms(c.worker,c.r.keys,r4);
 if(faultProof.version!==1||faultProof.status!=='G5_ORIGINAL_SDK_FAULT_RECOVERED_NOT_BROADCAST'||faultProof.notFound!==true||!isDeepStrictEqual(faultProof.marker,marker))throw Error('G5_SDK_FAULT_PRIVATE_PROOF_MISMATCH');
 validateG5SdkFaultPrepared(faultProof.prepared,terms,marker,note);
 phase='fresh-held-physical-partition';await captureG5WalletPartition(c);
 const source=validateSnapshot(await c.r.wallet.snapshot(books.deposits.filter(d=>d.network==='zcash-testnet').map(d=>Number(d.block_height))));
 const forwardNotes=source.outputs.map(o=>{const d=books.deposits.find(d=>d.network==='zcash-testnet'&&d.identity_hash.equals(c.r.keys.lookup('deposit',JSON.stringify(['zcash-testnet',o.txid,o.pool,o.index]))));
  if(!d||o.amount!=='100000'||!o.shieldedSource||o.blockHash!==d.block_hash||String(o.height)!==String(d.block_height)||source.scannedHeight-o.height+1<10
   ||!d.receiver_hash.equals(c.r.keys.lookup('receiver',o.receiver)))throw Error('G5_SDK_FAULT_FRESH_SOURCE_PROCEEDS_REQUIRED');
  return {pool:o.pool,txid:o.txid,index:o.index,value:o.amount};});
 if(forwardNotes.length!==2)throw Error('G5_SDK_FAULT_TWO_FORWARD_SOURCES_REQUIRED');
 const wallets=await read(c.config.balanceProofFile);validateG5SdkFaultWalletBalances(wallets,c.state,forwardNotes,c.config,reverse,marker,faultProof,terms,note,c.r.keys.open(books.payouts[0].signed_payload,`reverse-payout:${ids[1]}:v1`) as any);
 if(wallets.reverse.some((w:any)=>![2,4].includes(w.sequence)&&w.pendingCalculatedTransactions!==0))throw Error('G5_SDK_FAULT_UNKNOWN_OTHER_CALCULATION');
 const heads=await c.base.heads(),address=c.base.registry.contracts.ZeeSwapSettlement.address,token=c.base.registry.contracts.MockUSDC.address;
 const values=await Promise.all([c.base.client.readContract({address,abi:settlementAbi,functionName:'inventory',blockNumber:heads.finalized.number}),c.base.client.readContract({address,abi:settlementAbi,functionName:'availableInventory',blockNumber:heads.finalized.number}),
  c.base.client.readContract({address:token,abi:parseAbi(['function balanceOf(address) view returns(uint256)']),functionName:'balanceOf',args:[address],blockNumber:heads.finalized.number}),c.base.client.readContract({address,abi:settlementAbi,functionName:'escrowLiability',blockNumber:heads.finalized.number}),c.base.client.getBalance({address:c.base.registry.operator,blockNumber:heads.finalized.number})]);
 validateG5SdkFaultPhysical(c.state.openingPhysical!,chargedFees.toString(),r4CommitFee.toString(),Object.fromEntries(['inventory','available','tokenBalance','escrowLiability','gas'].map((n,i)=>[n,values[i].toString()])));
 if((await c.base.client.getBlock({blockNumber:heads.finalized.number})).hash!==heads.finalized.hash)throw Error('BASE_REORG');
 if(!isDeepStrictEqual(await read(markerPath),marker)||stable(await databaseProof())!==booksIdentity)throw Error('G5_SDK_FAULT_PROOF_STATE_CHANGED');
 const finalWalletProof=await proveOriginal();
 if(finalWalletProof.version!==1||finalWalletProof.status!==faultProof.status||finalWalletProof.notFound!==true||!isDeepStrictEqual(finalWalletProof.pins,faultProof.pins)||!isDeepStrictEqual(finalWalletProof.marker,marker)||!isDeepStrictEqual(finalWalletProof.prepared,faultProof.prepared))throw Error('G5_SDK_FAULT_ORIGINAL_WALLET_CHANGED');
 const finalNonces=await Promise.all([c.base.client.getTransactionCount({address:c.base.registry.operator,blockTag:'latest'}),c.base.client.getTransactionCount({address:c.base.registry.operator,blockTag:'pending'}),
  c.base.client.getTransactionCount({address:getAddress(config.payer),blockTag:'latest'}),c.base.client.getTransactionCount({address:getAddress(config.payer),blockTag:'pending'})]);
 if(!isDeepStrictEqual(finalNonces,nonces))throw Error('G5_SDK_FAULT_NONCE_CHANGED_DURING_PROOF');
 const proof={version:1,runId:c.state.runId,reason:'R4_SDK_DURABLE_CALCULATE_ADAPTER_SIGKILL',epoch:String(control.epoch),originalFailure:reverse.lastFailure,
  marker,rawSha256:marker.rawSha256,txid:marker.txid,chargedFeesWei:chargedFees.toString(),r4CommitFeeWei:r4CommitFee.toString(),operatorNextNonce:nonces[0],payerNextNonce:nonces[2],
  observedAt:new Date().toISOString(),pins:faultProof.pins,originalBytesRecovered:true,broadcast:false,imported:false};
 phase='bounded-epoch-cas-and-verify-retired-fault-lease';
 const auditPath=c.config.stateFile+'.sdk-fault-recovery-'+randomUUID()+'.private.json';await durable(auditPath,proof,true);
 await transaction(c.admin,async db=>{
  const now=(await db.query('SELECT * FROM zee.runtime_control FOR UPDATE')).rows[0];
  if(String(now.epoch)!==String(control.epoch)||now.accepting_orders||now.dispatch_enabled||!now.reconciliation_required)throw Error('G5_SDK_FAULT_EPOCH_CHANGED');
  if(!isDeepStrictEqual(await requireG5SdkFaultMigrations(db),migrationPins))throw Error('G5_SDK_FAULT_MIGRATION_BYTES_CHANGED');
  if(stable(await databaseProof(db))!==booksIdentity)throw Error('G5_SDK_FAULT_BOOKS_CHANGED_AT_CAS');
  const orders=(await db.query('SELECT id,state,primary_deposit FROM zee.orders ORDER BY id')).rows;
  if(!isDeepStrictEqual(orders,books.orders)||(await db.query('SELECT count(*) AS n FROM zee.reverse_payouts WHERE order_id=$1',[r4])).rows[0].n!=='0'
   ||(await db.query('SELECT count(*) AS n FROM zee.escrow_settlements WHERE order_id=$1',[r4])).rows[0].n!=='0')throw Error('G5_SDK_FAULT_CORE_CHANGED');
  const job=books.jobs.find(j=>j.operation_id===books.operations.find(o=>o.order_id===r4).id)!;
  const retired=(await db.query('SELECT * FROM zee.outbox_jobs WHERE id=$1 FOR UPDATE',[job.id])).rows[0];
  requireG5SdkFaultRetiredLease(retired,reverse.currentLease);
  if(!isDeepStrictEqual(retired,job))throw Error('G5_SDK_FAULT_LEASE_CHANGED');
  await db.query('UPDATE zee.runtime_control SET reconciliation_required=false');
 });
 try{c.state.incident=false;await c.save();}catch(error){
  c.state.incident=true;await transaction(c.admin,async db=>{const now=(await db.query('SELECT * FROM zee.runtime_control FOR UPDATE')).rows[0];
   if(String(now.epoch)!==String(control.epoch)||now.accepting_orders||now.dispatch_enabled)throw Error('G5_SDK_FAULT_LOCAL_SAVE_CHANGED');
   await db.query('UPDATE zee.runtime_control SET reconciliation_required=true');});await c.save().catch(()=>{});throw error;
 }
 console.log(JSON.stringify({status:'G5_R4_ORIGINAL_SDK_FAULT_RECOVERED_PAUSED',epoch:String(control.epoch),originalTransactionsPreserved:true,originalBytesRecovered:true,broadcast:false,imported:false}));
}catch(error){await durable(c.config.stateFile+'.sdk-fault-recovery-diagnostic.private.json',g5Diagnostic(error,'recover-sdk-fault',phase)).catch(()=>{});console.error('G5_R4_SDK_FAULT_RECOVERY_REFUSED');process.exitCode=1;}
finally{await c.close();}
