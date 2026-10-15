/** Explicit recovery of the sole known approve-wallet fresh-finality wait.
 * No signing, submission, quote/funding replacement or lease restoration.
 */
import {access} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {getAddress,parseAbi,encodeFunctionData,parseTransaction,keccak256,recoverTransactionAddress,type TransactionSerialized} from 'viem';
import {g5Context,read,durable,privateLocalPath} from './g5-context.ts';
import {captureG5WalletPartition} from './g5-physical-capture.ts';
import {requireG5R2PreSigningRecovery,validateG5R2HeldAccounts,validateG5R2Physical} from '../src/g5-presigning.ts';
import {validateG5OpeningLedger,validateG5WalletBalances,requireG5CommandConfig,g5PathIdentity} from '../src/g5-run.ts';
import {validateSnapshot} from '../src/observer.ts';
import {escrowTerms,finalizedReceipt,escrowState,escrowEvents,fundingCall} from '../src/base-escrow.ts';
import {settlementAbi} from '../src/base-contract.ts';
import {transaction} from '../src/db.ts';
import {g5Diagnostic} from '../src/g5-diagnostic.ts';
const [manifestPath]=process.argv.slice(2);if(!manifestPath||process.argv.length!==3)throw Error('G5_R2_RECOVERY_MANIFEST_REQUIRED');
const c=await g5Context(manifestPath);let phase='r2-pre-signing-guard';
async function absent(path:string){try{await access(privateLocalPath(path));}catch(e){if((e as any).code==='ENOENT')return;throw e;}throw Error('G5_R2_SIGNING_ARTIFACT_EXISTS');}
function sibling(reference:string,path:string){const prefix=reference.replaceAll('\\','/').match(/^(\/\/(?:wsl\.localhost|wsl\$)\/[^/]+)/)?.[1];return path.startsWith('/')&&prefix?prefix+path:path;}
try{
 const config=await read(c.config.reverseOrders[0].configFile),state=await read(config.stateFile);
 requireG5R2PreSigningRecovery(c.state,c.config,state);
 if(config.sequence!==2||g5PathIdentity(config.runConfig)!==g5PathIdentity(privateLocalPath(manifestPath))||config.baseFeeBudget!==c.config.baseFeeBudget
  ||config.recipient!==c.config.forwardOrders[0].refundRecipient)throw Error('G5_R2_RECOVERY_CONFIG_BINDING');
 requireG5CommandConfig(config.zcashArgs,config.zcashPrivateConfig);
 const raw=await read(config.zcashPrivateConfig),baseSigner=await read(config.baseSignerPrivateConfig);
 if(raw.approvedDigest!=='0'.repeat(64)||(config.approvedDigest&&config.approvedDigest!=='0'.repeat(64))
  ||(baseSigner.reverseApprovedDigest&&baseSigner.reverseApprovedDigest!=='0'.repeat(64)))throw Error('G5_R2_ALREADY_APPROVED');
 for(const path of [raw.journalPath,raw.journalPath+'.result.json',raw.approvedRequest,config.approvedRequest,config.baseSignerApprovedRequestFile].filter(Boolean))await absent(path);
 const control=(await c.admin.query('SELECT * FROM zee.runtime_control')).rows[0];
 if(control.accepting_orders||control.dispatch_enabled||!control.reconciliation_required)throw Error('G5_R2_RECOVERY_REQUIRES_PAUSED_INCIDENT');
 const f1=c.state.orders[0],r2=c.state.orders[1],ids=[f1.orderId,r2.orderId];
 const orders=(await c.admin.query('SELECT id,state,primary_deposit FROM zee.orders')).rows;
 const quotes=(await c.admin.query('SELECT id,direction,input_amount,output_amount,payout_fee,refund_fee FROM zee.quotes')).rows;
 if(orders.length!==2||orders.find(o=>o.id===f1.orderId)?.state!=='SETTLED'||orders.find(o=>o.id===r2.orderId)?.state!=='READY'
  ||quotes.length!==2||quotes.some(q=>!ids.includes(q.id)||q.input_amount!=='100000'||q.output_amount!=='100000')
  ||quotes.find(q=>q.id===r2.orderId)?.payout_fee!=='10000'||quotes.find(q=>q.id===r2.orderId)?.refund_fee!==c.config.baseFeeBudget)throw Error('G5_R2_EXACT_ACCEPTED_ORDERS_REQUIRED');
 const forbidden=(await c.admin.query(`SELECT (SELECT count(*) FROM zee.reverse_payouts)+(SELECT count(*) FROM zee.escrow_settlements)+(SELECT count(*) FROM zee.source_refunds) AS n`)).rows[0].n;
 if(forbidden!=='0')throw Error('G5_R2_RECOVERY_AFTER_SIGNING_FORBIDDEN');
 const deposits=(await c.admin.query('SELECT * FROM zee.deposits')).rows,obligations=(await c.admin.query('SELECT * FROM zee.obligations')).rows;
 if(deposits.length!==2||deposits.some(d=>!ids.includes(d.order_id)||d.amount!=='100000'||d.classification!=='EXACT'||!d.confirmed_at)
  ||obligations.length!==2||obligations.find(o=>o.order_id===f1.orderId)?.state!=='DISCHARGED'||obligations.find(o=>o.order_id===r2.orderId)?.state!=='HELD')throw Error('G5_R2_EXACT_HELD_SOURCE_REQUIRED');
 for(const id of ids){const deposit=deposits.filter(d=>d.order_id===id),obligation=obligations.filter(o=>o.order_id===id);
  if(deposit.length!==1||obligation.length!==1||obligation[0].deposit_id!==deposit[0].id||obligation[0].source_amount!=='100000'
   ||orders.find(o=>o.id===id)?.primary_deposit!==deposit[0].id)throw Error('G5_R2_EXACT_HELD_SOURCE_REQUIRED');}
 const reservations=(await c.admin.query('SELECT * FROM zee.reservations')).rows;
 if(reservations.length!==6||reservations.filter(r=>r.order_id===f1.orderId).length!==3||reservations.some(r=>r.order_id===f1.orderId&&!r.released_at)
  ||[['TAZ','principal','100000'],['TAZ','fee','10000'],['baseETH','fee',c.config.baseFeeBudget]].some(([asset,purpose,amount])=>reservations.filter(r=>r.order_id===r2.orderId&&r.asset===asset&&r.purpose===purpose&&r.amount===amount&&!r.released_at).length!==1))throw Error('G5_R2_RESERVATIONS_MISMATCH');
 const operations=(await c.admin.query('SELECT * FROM zee.operations')).rows,jobs=(await c.admin.query('SELECT * FROM zee.outbox_jobs')).rows;
 const first=operations.find(o=>o.order_id===f1.orderId),second=operations.find(o=>o.order_id===r2.orderId);
 if(operations.length!==2||operations.some(o=>o.kind!=='PAYOUT')||first?.state!=='CONFIRMED'||second?.state!=='PLANNED'||!second.chain_authorization_verified
  ||jobs.length!==2||jobs.find(j=>j.operation_id===first.id)?.status!=='DONE'||jobs.find(j=>j.operation_id===second.id)?.status!=='QUEUED'
  ||jobs.find(j=>j.operation_id===second.id)?.lease_owner!==null||jobs.find(j=>j.operation_id===second.id)?.lease_until!==null)throw Error('G5_R2_RECONCILED_JOB_FENCE_REQUIRED');
 if((await c.admin.query('SELECT event_id,asset FROM zee.ledger_entries GROUP BY event_id,asset HAVING sum(amount)<>0')).rowCount)throw Error('G5_R2_UNBALANCED_LEDGER');
 validateG5OpeningLedger((await c.admin.query('SELECT event_id,asset,bucket,amount::text FROM zee.ledger_entries WHERE event_id=$1',[c.state.openingEventId])).rows,c.state.openingEventId,c.config.branchId);
 phase='fresh-original-chain-and-journals';await c.base.preflight();
 const binding=(await c.worker.query('SELECT terms_payload FROM zee.base_bindings WHERE order_id=$1',[f1.orderId])).rows[0],termsF=c.r.keys.open(binding.terms_payload,`base-terms:${f1.orderId}:v1`) as any;
 const attempts=(await c.worker.query('SELECT * FROM zee.base_attempts')).rows;if(attempts.length!==2||attempts.some(a=>a.order_id!==f1.orderId||!a.confirmed))throw Error('G5_R2_EXACT_F1_ATTEMPTS_REQUIRED');
 let forwardFees=0n;
 async function journalMatches(id:string,phase:string,signed:any){
  const name=createHash('sha256').update(id).digest('hex')+'.'+phase+'.tx.json';
  const journal=await read(sibling(config.baseSignerPrivateConfig,baseSigner.journalRoot+'/'+name));
  if(journal.raw!==signed.raw||journal.hash!==signed.hash||journal.nonce!==signed.nonce||keccak256(signed.raw)!==signed.hash
   ||getAddress(await recoverTransactionAddress({serializedTransaction:signed.raw as TransactionSerialized}))!==getAddress(c.base.registry.operator))throw Error('G5_R2_GLOBAL_SIGNER_JOURNAL_MISMATCH');
  const chain=await c.base.client.getTransaction({hash:signed.hash}),parsed=parseTransaction(signed.raw);
  if(parsed.chainId!==84532||chain.nonce!==signed.nonce||chain.input!==parsed.data||chain.to?.toLowerCase()!==parsed.to?.toLowerCase()||getAddress(chain.from)!==getAddress(c.base.registry.operator))throw Error('G5_R2_ORIGINAL_RAW_CHAIN_MISMATCH');
 }
 for(const a of attempts){const signed=c.r.keys.open(a.signed_payload,`base-signed:${f1.orderId}:${a.phase}:v1`) as any;
  await journalMatches(termsF.id,a.phase,signed);const receipt=await c.base.receipt(signed.hash,a.phase,termsF);
  if(!receipt||receipt.fee!==a.actual_fee||receipt.blockHash.slice(2)!==a.block_hash||String(receipt.blockNumber)!==String(a.block_height))throw Error('G5_R2_FRESH_F1_RECEIPT_REQUIRED');forwardFees+=BigInt(receipt.fee);
 }
 const terms=await escrowTerms(c.worker,c.r.keys,c.base,r2.orderId!),fund=await finalizedReceipt(c.base,config.fundingTransactionHash);
 const pinned=(await c.worker.query('SELECT terms_payload FROM zee.escrow_bindings WHERE order_id=$1',[r2.orderId])).rows[0];
 const auth=c.r.keys.open(pinned.terms_payload,`escrow-terms:${r2.orderId}:v1`) as any;
 if(!isDeepStrictEqual(auth.terms,terms)||!fund)throw Error('G5_R2_FRESH_FUNDING_REQUIRED');
 const funded=await c.base.client.getTransaction({hash:config.fundingTransactionHash}),d2=deposits.find(d=>d.order_id===r2.orderId);
 if(funded.input!==fundingCall(c.base,terms,auth.signature)||funded.value!==0n||getAddress(funded.from)!==getAddress(terms.payer)
  ||fund.receipt.blockHash.slice(2)!==d2.block_hash||String(fund.receipt.blockNumber)!==String(d2.block_height)
  ||escrowEvents(c.base,fund.receipt,'Funded').filter((e:any)=>e.args.id===terms.id&&e.args.amount===100000n).length!==1)throw Error('G5_R2_FRESH_FUNDING_MISMATCH');
 const payerJournalName=createHash('sha256').update(terms.id).digest('hex')+'.user-funding.tx.json';
 const payerJournal=await read(sibling(config.baseSignerPrivateConfig,'/home/albary/zeeswap-g5/refunds/payer-journal/'+payerJournalName));
 const payerRaw=parseTransaction(payerJournal.raw);
 if(payerJournal.hash!==config.fundingTransactionHash||keccak256(payerJournal.raw)!==payerJournal.hash||payerRaw.chainId!==84532
  ||payerJournal.nonce!==funded.nonce||payerRaw.nonce!==funded.nonce||payerRaw.data!==funded.input||(payerRaw.value??0n)!==0n
  ||!isDeepStrictEqual(payerJournal.approved,{version:1,branchId:c.config.branchId,sequence:2,orderId:r2.orderId,funding:state.funding})
  ||getAddress(await recoverTransactionAddress({serializedTransaction:payerJournal.raw as TransactionSerialized}))!==getAddress(terms.payer))throw Error('G5_R2_ORIGINAL_PAYER_JOURNAL_MISMATCH');
 const commits=(await c.worker.query('SELECT * FROM zee.escrow_commits')).rows;if(commits.length!==1||commits[0].order_id!==r2.orderId||!commits[0].confirmed)throw Error('G5_R2_ORIGINAL_COMMIT_REQUIRED');
 const commit=commits[0],signed=c.r.keys.open(commit.signed_payload,`escrow-commit:${r2.orderId}:v1`) as any;await journalMatches(terms.id,'COMMIT',signed);
 const [operatorNonce,operatorPending]=await Promise.all([c.base.client.getTransactionCount({address:c.base.registry.operator,blockTag:'latest'}),c.base.client.getTransactionCount({address:c.base.registry.operator,blockTag:'pending'})]);
 if(operatorNonce!==signed.nonce+1||operatorPending!==operatorNonce)throw Error('G5_R2_UNEXPECTED_OPERATOR_NONCE');
 const receipt=await finalizedReceipt(c.base,signed.hash),tx=await c.base.client.getTransaction({hash:signed.hash});
 if(!receipt||await escrowState(c.base,terms,receipt.heads.finalized.number)!==5||tx.input!==encodeFunctionData({abi:settlementAbi,functionName:'commitPayout',args:[terms.id]})
  ||escrowEvents(c.base,receipt.receipt,'PayoutCommitted').filter((e:any)=>e.args.id===terms.id).length!==1||receipt.receipt.blockHash.slice(2)!==commit.block_hash)throw Error('G5_R2_FRESH_COMMIT_REQUIRED');
 if(typeof (receipt.receipt as any).l1Fee!=='bigint')throw Error('BASE_FEE_UNAVAILABLE');
 const commitFee=receipt.receipt.gasUsed*receipt.receipt.effectiveGasPrice+(receipt.receipt as any).l1Fee;if(commitFee.toString()!==commit.actual_fee)throw Error('G5_R2_COMMIT_FEE_MISMATCH');
 validateG5R2HeldAccounts((await c.admin.query('SELECT asset,purpose,balance::text,reserved::text FROM zee.inventory_accounts')).rows,forwardFees.toString());
 phase='fresh-reserved-physical-partition';await captureG5WalletPartition(c);
 const source=validateSnapshot(await c.r.wallet.snapshot(deposits.filter(d=>d.network==='zcash-testnet').map(d=>Number(d.block_height))));
 if(source.outputs.length!==1)throw Error('G5_R2_EXACT_F1_SOURCE_NOTE_REQUIRED');const o=source.outputs[0],d1=deposits.find(d=>d.order_id===f1.orderId);
 if(!d1.identity_hash.equals(c.r.keys.lookup('deposit',JSON.stringify(['zcash-testnet',o.txid,o.pool,o.index])))||o.amount!=='100000'||!o.shieldedSource||o.blockHash!==d1.block_hash||source.scannedHeight-o.height+1<10)throw Error('G5_R2_FRESH_F1_SOURCE_MISMATCH');
 const wallets=await read(c.config.balanceProofFile);validateG5WalletBalances(wallets,c.state,[{pool:o.pool,txid:o.txid,index:o.index,value:o.amount}],0);
 if(wallets.reverse.some((w:any)=>w.pendingCalculatedTransactions!==0))throw Error('G5_R2_UNKNOWN_SDK_CALCULATION');
 const h=await c.base.heads(),address=c.base.registry.contracts.ZeeSwapSettlement.address,token=c.base.registry.contracts.MockUSDC.address;
 const values=await Promise.all([c.base.client.readContract({address,abi:settlementAbi,functionName:'inventory',blockNumber:h.finalized.number}),c.base.client.readContract({address,abi:settlementAbi,functionName:'availableInventory',blockNumber:h.finalized.number}),
 c.base.client.readContract({address:token,abi:parseAbi(['function balanceOf(address) view returns(uint256)']),functionName:'balanceOf',args:[address],blockNumber:h.finalized.number}),c.base.client.readContract({address,abi:settlementAbi,functionName:'escrowLiability',blockNumber:h.finalized.number}),c.base.client.getBalance({address:c.base.registry.operator,blockNumber:h.finalized.number})]);
 validateG5R2Physical(c.state.openingPhysical!,forwardFees.toString(),commitFee.toString(),Object.fromEntries(['inventory','available','tokenBalance','escrowLiability','gas'].map((name,i)=>[name,values[i].toString()])));
 if((await c.base.client.getBlock({blockNumber:h.finalized.number})).hash!==h.finalized.hash)throw Error('BASE_REORG');
 phase='recover-preserving-current-epoch';
 const proof={version:1,runId:c.state.runId,reason:'R2_APPROVAL_FRESH_COMMIT_WAIT_PRE_SIGNING',oldIncident:true,epoch:String(control.epoch),forwardFees:forwardFees.toString(),commitFee:commitFee.toString(),observedAt:new Date().toISOString(),originalFailure:state.lastFailure};
 await durable(c.config.stateFile+'.r2-presigning-recovery-'+randomUUID()+'.private.json',proof,true);
 await transaction(c.admin,async db=>{const current=(await db.query('SELECT * FROM zee.runtime_control FOR UPDATE')).rows[0];
  if(String(current.epoch)!==String(control.epoch)||current.accepting_orders||current.dispatch_enabled||!current.reconciliation_required
   ||(await db.query('SELECT (SELECT count(*) FROM zee.reverse_payouts)+(SELECT count(*) FROM zee.escrow_settlements)+(SELECT count(*) FROM zee.source_refunds) AS n')).rows[0].n!=='0')throw Error('G5_R2_RECOVERY_STATE_CHANGED');
  const currentOrders=(await db.query('SELECT id,state FROM zee.orders ORDER BY id')).rows;
  if(currentOrders.length!==2||currentOrders.find(o=>o.id===f1.orderId)?.state!=='SETTLED'||currentOrders.find(o=>o.id===r2.orderId)?.state!=='READY')throw Error('G5_R2_RECOVERY_STATE_CHANGED');
  await db.query('UPDATE zee.runtime_control SET reconciliation_required=false');});
 try{c.state.incident=false;await c.save();}catch(error){
  // No dispatch is enabled here. Restore reconciliation under the same epoch
  // if local durable state cannot be cleared; never revive an old lease.
  c.state.incident=true;
  await transaction(c.admin,async db=>{const current=(await db.query('SELECT * FROM zee.runtime_control FOR UPDATE')).rows[0];
   if(String(current.epoch)!==String(control.epoch)||current.accepting_orders||current.dispatch_enabled)throw Error('G5_R2_LOCAL_SAVE_RECOVERY_STATE_CHANGED');
   await db.query('UPDATE zee.runtime_control SET reconciliation_required=true');});
  await c.save().catch(()=>{});throw error;
 }
 console.log(JSON.stringify({status:'G5_R2_PRE_SIGNING_RECOVERED_PAUSED',epoch:String(control.epoch),originalTransactionsPreserved:true,approved:false}));
}catch(error){await durable(c.config.stateFile+'.r2-recovery-diagnostic.private.json',g5Diagnostic(error,'recover-r2-presigning',phase)).catch(()=>{});console.error('G5_R2_PRE_SIGNING_RECOVERY_REFUSED');process.exitCode=1;}
finally{await c.close();}
