/** Twenty explicit alternating PUBLIC-TESTNET orders. Every invocation ends paused.
 * Funding is performed separately by the operator; this script cannot mint or
 * source-fund. Durable attempts and independent signer journals retain identity.
 */
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {verifyG5CompletedBaseOrder,requireG5CompletedPhysicalFloor} from '../src/g5-completed-base-proof.ts';
import {loadG5CompletedBaseDescriptor} from './g5-completed-base-descriptor.ts';
import {access,open,unlink,readdir,readFile} from 'node:fs/promises';
import {requireG5F3ScannerRecovery,requireG5F3RecoveryBooks,captureG5F3RecoveryBooks,saveG5F3RecoveryLocals,requireG5F3Migrations,requireG5F3Nonces,requireG5F3CanonicalGlobalRaw} from '../src/g5-f3-scanner-recovery.ts';
import {g5Binding} from '../src/g5-run.ts';
import {requireG5UnfundedR4QuoteRecovery,requireG5UnfundedR4NoEffects,saveG5UnfundedR4QuoteLocal} from '../src/g5-r4-quote-recovery.ts';
import {resolveG5ReferencedPrivatePath as siblingPath} from '../src/g5-private-path.ts';
import {requireG5R4FundingWaitRecovery,requireG5R4PrecommitStartupRecovery,requireG5R4FundingWaitNonces,requireG5R4HeldReadyBooks,requireG5R4FundingWaitLedger,g5R4OriginalOperatorRows,G5_R4_ORIGINAL_FUND} from '../src/g5-r4-funding-wait-recovery.ts';
import {requireG5R4VerifyBindingRecovery,requireG5R4VerifyBindingCause,requireG5R4VerifyBindingSource,requireG5R4VerifyBindingBooks,requireG5R4VerifyBindingNonces,saveG5R4VerifyBindingMain,G5_R4_ORIGINAL_COMMIT,G5_R4_ORIGINAL_COMMIT_FEE} from '../src/g5-r4-verify-binding-recovery.ts';
import {validateG5SdkFaultAccounts,validateG5SdkFaultPhysical} from '../src/g5-sdk-fault.ts';
import {approvalDigest} from '../src/reverse-authority.ts';
import {recoverTypedDataAddress} from 'viem';
import {captureG5WalletPartition} from './g5-physical-capture.ts';
import {getAddress,parseAbi,encodeFunctionData,parseTransaction,keccak256,recoverTransactionAddress,type TransactionSerialized} from 'viem';
import {g5Context,read,durable,privateLocalPath} from './g5-context.ts';
import {g5Direction,requireG5Next,requireG5Operational,requireG5EmptyOpeningRecovery,requireG5RoundtripCheckpoint,requireG5CompletedRoundtripRecovery,validateG5Accounts,validateG5OpeningLedger,validateG5PhysicalBase,validateG5WalletBalances,g5PathIdentity,requireG5CommandConfig} from '../src/g5-run.ts';
import {Repository,parseMemo} from '../src/repository.ts';
import {accessHash} from '../src/private-data.ts';
import {scanOnce,validateSnapshot,observerCheckHeights} from '../src/observer.ts';
import {isObserverWait} from '../src/observer-frontiers.ts';
import {refreshReverseObservers} from '../src/reverse-observer-refresh.ts';
import {dispatchBaseOnce,reconcileBaseReceipts} from '../src/base-settlement.ts';
import {LocalBaseSigner} from '../src/base-signer.ts';
import {escrowTerms,escrowState,finalizedReceipt,escrowEvents,observeEscrowFunding,fundingCall,fundingTypedData} from '../src/base-escrow.ts';
import {LocalReverseWalletAdapter} from '../src/reverse-wallet-adapter.ts';
import {reversePayoutTerms} from '../src/reverse-settlement.ts';
import {requireG5NonceReady} from '../src/g5-nonce.ts';
import {g5Diagnostic} from '../src/g5-diagnostic.ts';
import {transaction} from '../src/db.ts';
const [step,path,rawSequence]=process.argv.slice(2),sequence=Number(rawSequence);
if(!['start','observe','dispatch','verify','barrier','roundtrip-checkpoint','recover-empty-opening','recover-completed-roundtrip','recover-f3-scanner','recover-unfunded-r4-quote','recover-r4-source-finality-wait','recover-r4-precommit-startup','recover-r4-verify-binding','status','diagnose','close'].includes(step)||!path||process.argv.length>5)throw Error('G5_EXPLICIT_STEP_CONFIG_SEQUENCE_REQUIRED');
const c=await g5Context(path),repository=new Repository(c.api,c.r.keys);
const r4QuoteRecovery=step==='recover-unfunded-r4-quote',r4PrecommitStartupRecovery=step==='recover-r4-precommit-startup',r4VerifyBindingRecovery=step==='recover-r4-verify-binding',r4FundingWaitRecovery=step==='recover-r4-source-finality-wait'||r4PrecommitStartupRecovery||r4VerifyBindingRecovery,readOnly=step==='status'||step==='diagnose'||r4QuoteRecovery||r4FundingWaitRecovery;let phase='startup';let controllerLock:Awaited<ReturnType<typeof open>>|undefined,controllerLockPath:string|undefined;
async function requireAbsent(path:string){
 try{await access(privateLocalPath(path));}catch(error){if((error as any).code==='ENOENT')return;throw error;}
 throw Error('G5_PRIOR_SIGNING_OR_FUNDING_ARTIFACT_REQUIRES_RECONCILIATION');
}
async function refresh(){
 const references=(await c.worker.query("SELECT DISTINCT block_height::text FROM zee.deposits WHERE network='zcash-testnet' UNION SELECT block_height::text FROM zee.reverse_payouts WHERE confirmed")).rows;
 const snapshot=await c.r.wallet.snapshot(await observerCheckHeights(c.worker,references.map(r=>Number(r.block_height))));
 await refreshReverseObservers(c.worker,c.base,snapshot);
 return scanOnce(c.worker,c.r.keys,c.r.wallet);
}
async function assertRunDatabase(){
 const known=new Set(c.state.orders.flatMap(o=>o.orderId?[o.orderId]:[]));
 const quotes=(await c.admin.query('SELECT id,access_hash,direction,input_amount,output_amount FROM zee.quotes')).rows;
 for(const q of quotes){
  const slot=c.state.orders.find(o=>o.orderId===q.id||(!o.orderId&&accessHash(o.owner).equals(q.access_hash)));
  if(!slot||q.direction!==slot.direction||q.input_amount!=='100000'||q.output_amount!=='100000')throw Error('G5_UNMANIFESTED_QUOTE');
 }
 const rows=(await c.admin.query('SELECT id,state FROM zee.orders')).rows;
 if(rows.filter(o=>o.state!=='SETTLED').length>(c.state.batchSize??1)||rows.some(o=>!known.has(o.id)))throw Error('G5_OUTSTANDING_ORDER_LIMIT');
 const exceptions=(await c.admin.query("SELECT count(*) AS n FROM zee.obligations WHERE order_id IS NULL AND state<>'DISCHARGED'")).rows[0].n;
 if(exceptions!=='0')throw Error('G5_UNMATCHED_FUNDS_RECONCILE');
 const unbalanced=(await c.admin.query('SELECT event_id,asset FROM zee.ledger_entries GROUP BY event_id,asset HAVING sum(amount)<>0')).rows;
 if(unbalanced.length)throw Error('G5_UNBALANCED_LEDGER');
 const opening=(await c.admin.query('SELECT event_id,asset,bucket,amount::text FROM zee.ledger_entries WHERE event_id=$1',[c.state.openingEventId])).rows;
 validateG5OpeningLedger(opening,c.state.openingEventId,c.config.branchId);
 return rows;
}
async function boundary(allowEmptyOpening=false,allowCompletedRecovery=false){
 phase='boundary-database';
 const orders=await assertRunDatabase();if(orders.some(o=>o.state!=='SETTLED'))throw Error('G5_SETTLEMENT_BOUNDARY_REQUIRED');
 const policy=(await c.admin.query('SELECT reconciliation_required FROM zee.runtime_control')).rows[0];
 if(policy.reconciliation_required&&!(allowEmptyOpening&&!c.state.policyInitialized&&(!c.state.incident||step==='diagnose'||step==='recover-empty-opening')&&!orders.length
  &&(await c.admin.query('SELECT count(*) AS n FROM zee.quotes')).rows[0].n==='0')
  &&!(allowCompletedRecovery&&(step==='recover-completed-roundtrip'&&orders.length===2||step==='recover-f3-scanner'&&orders.length===3)))throw Error('G5_EXPLICIT_RECONCILIATION_REQUIRED');
 const forwards=c.state.orders.filter(o=>o.orderId&&orders.some(row=>row.id===o.orderId)&&o.direction==='ZCASH_TO_BASE').length;
 const reverse=orders.length-forwards;
 const fees=(await c.admin.query(`SELECT COALESCE(sum(actual_fee),0)::text AS n FROM (
 SELECT actual_fee FROM zee.base_attempts WHERE confirmed UNION ALL SELECT actual_fee FROM zee.escrow_commits WHERE confirmed UNION ALL SELECT actual_fee FROM zee.escrow_settlements WHERE confirmed) AS x`)).rows[0].n;
 const accounts=(await c.admin.query('SELECT asset,purpose,balance::text,reserved::text FROM zee.inventory_accounts')).rows;
 validateG5Accounts(accounts,forwards,reverse,fees,c.config.branchId);
 if((await c.admin.query('SELECT count(*) AS n FROM zee.reservations WHERE released_at IS NULL')).rows[0].n!=='0'
  ||(await c.admin.query("SELECT count(*) AS n FROM zee.obligations WHERE state<>'DISCHARGED'")).rows[0].n!=='0')throw Error('G5_BOUNDARY_OBLIGATIONS_REMAIN');
 const proceeds=(await c.admin.query("SELECT asset,sum(amount)::text AS n FROM zee.ledger_entries WHERE bucket='operator:unreconciled' GROUP BY asset")).rows;
 for(const [asset,count] of [['TAZ',forwards],['mockUSDC',reverse]] as const)if(BigInt(proceeds.find(r=>r.asset===asset)?.n??'0')!==BigInt(count)*100000n)throw Error('G5_SOURCE_PROCEEDS_MISMATCH');
 if(!c.state.openingPhysical)throw Error('G5_PINNED_PHYSICAL_OPENING_REQUIRED');
 phase='boundary-base-physical';
 const completed=await Promise.all(c.state.orders.filter(slot=>orders.some(row=>row.id===slot.orderId)).map(slot=>loadG5CompletedBaseDescriptor(c,slot,read,privateLocalPath(path))));
 const {heads:{finalized}}=await requireG5CompletedPhysicalFloor(c.base,completed);const address=c.base.registry.contracts.ZeeSwapSettlement.address;
 const [available,inventory,tokenBalance,escrowLiability,gas]=await Promise.all([
  c.base.client.readContract({address,abi:parseAbi(['function availableInventory() view returns(uint256)']),functionName:'availableInventory',blockNumber:finalized.number}),
  c.base.client.readContract({address,abi:parseAbi(['function inventory() view returns(uint256)']),functionName:'inventory',blockNumber:finalized.number}),
  c.base.client.readContract({address:c.base.registry.contracts.MockUSDC.address,abi:parseAbi(['function balanceOf(address) view returns(uint256)']),functionName:'balanceOf',args:[address],blockNumber:finalized.number}),
  c.base.client.readContract({address,abi:parseAbi(['function escrowLiability() view returns(uint256)']),functionName:'escrowLiability',blockNumber:finalized.number}),
  c.base.client.getBalance({address:c.base.registry.operator,blockNumber:finalized.number})]);
 validateG5PhysicalBase(c.state.openingPhysical,forwards,reverse,fees,{inventory:inventory.toString(),available:available.toString(),tokenBalance:tokenBalance.toString(),escrowLiability:escrowLiability.toString(),gas:gas.toString()});
 if((await c.base.client.getBlock({blockNumber:BigInt(c.state.openingPhysical.blockNumber)})).hash!==c.state.openingPhysical.blockHash
  ||(await c.base.client.getBlock({blockNumber:finalized.number})).hash!==finalized.hash)throw Error('G5_PINNED_PHYSICAL_BLOCK_CHANGED');
 phase='boundary-wallet-capture';await captureG5WalletPartition(c);
 const deposits=(await c.admin.query("SELECT * FROM zee.deposits WHERE network='zcash-testnet'")).rows;
 phase='boundary-source-snapshot';
 const source=validateSnapshot(await c.r.wallet.snapshot(deposits.map(d=>Number(d.block_height))));
 const forwardNotes=source.outputs.map(o=>{
  const identity=JSON.stringify(['zcash-testnet',o.txid,o.pool,o.index]),row=deposits.find(d=>d.identity_hash.equals(c.r.keys.lookup('deposit',identity)));
  if(!row||!row.confirmed_at||row.classification!=='EXACT'||row.amount!=='100000'||o.amount!=='100000'||!o.shieldedSource
   ||row.block_hash!==o.blockHash||Number(row.block_height)!==o.height||source.scannedHeight-o.height+1<10)throw Error('G5_CANONICAL_SOURCE_PROCEEDS_MISMATCH');
  return {pool:o.pool,txid:o.txid,index:o.index,value:o.amount};
 });
 if(forwardNotes.length!==forwards||deposits.length!==forwards)throw Error('G5_CANONICAL_SOURCE_COUNT_MISMATCH');
 phase='boundary-wallet-accounting';validateG5WalletBalances(await read(c.config.balanceProofFile),c.state,forwardNotes,reverse);
 return {settled:orders.length,forward:forwards,reverse,actualBaseFeesWei:fees,ledgerBalanced:true,unexplainedDeficits:0};
}
async function verifyReceipts(slot:typeof c.state.orders[number]){
   if(!slot.orderId)throw Error('G5_ACTIVE_ORDER_REQUIRED');
   const row=(await c.admin.query('SELECT state FROM zee.orders WHERE id=$1',[slot.orderId])).rows[0];if(row?.state!=='SETTLED')throw Error('G5_FINAL_SETTLEMENT_REQUIRED');
   const counts=(await c.admin.query(`SELECT (SELECT count(*) FROM zee.deposits WHERE order_id=$1) AS deposits,
    (SELECT count(*) FROM zee.operations WHERE order_id=$1 AND state='CONFIRMED') AS operations,
    (SELECT count(*) FROM zee.outbox_jobs j JOIN zee.operations o ON o.id=j.operation_id WHERE o.order_id=$1 AND j.status='DONE') AS jobs`,[slot.orderId])).rows[0];
   if(counts.deposits!=='1'||counts.operations!=='1'||counts.jobs!=='1')throw Error('G5_DUPLICATE_OR_INCOMPLETE_ECONOMIC_OPERATION');
   if(slot.direction==='ZCASH_TO_BASE'){
    // Completed verification is read-only: a fresh SDK note proof must not
    // overwrite a frontier last written by another observer's network tip.
    const deposit=(await c.worker.query('SELECT * FROM zee.deposits WHERE order_id=$1',[slot.orderId])).rows[0];
    const source=validateSnapshot(await c.r.wallet.snapshot([Number(deposit.block_height)]));
    const outputs=source.outputs.filter(o=>c.r.keys.lookup('deposit',JSON.stringify(['zcash-testnet',o.txid,o.pool,o.index])).equals(deposit.identity_hash));
    const output=outputs[0];
    if(outputs.length!==1||output.amount!=='100000'||!output.shieldedSource||output.blockHash!==deposit.block_hash||output.height!==Number(deposit.block_height)
     ||source.scannedHeight-output.height+1<10||!c.r.keys.lookup('receiver',output.receiver).equals(deposit.receiver_hash)
     ||!c.r.keys.lookup('reference',parseMemo(output.memo??'')).equals(deposit.reference_hash))throw Error('G5_FRESH_COMPLETED_SOURCE_REQUIRED');
   }else{
    const config=await read(c.config.reverseOrders.find((o:any)=>o.sequence===slot.sequence).configFile),privateState=await read(config.stateFile);
    if(privateState.orderId!==slot.orderId||privateState.owner!==slot.owner)throw Error('G5_REVERSE_STATE_BINDING');
    const a=(await c.worker.query('SELECT * FROM zee.reverse_payouts WHERE order_id=$1',[slot.orderId])).rows[0],prepared=c.r.keys.open(a.signed_payload,`reverse-payout:${slot.orderId}:v1`) as any;
    const wallet=new LocalReverseWalletAdapter(config.zcashCommand,config.zcashArgs,config.approvedDigest),termsZ=await reversePayoutTerms(c.worker,c.r.keys,slot.orderId);
    await wallet.verifyPrepared(prepared,termsZ);const delivery=await wallet.receipt(prepared,termsZ);
    if(!a.confirmed||!c.r.keys.lookup('zcash-tx',prepared.txid).equals(a.tx_hash)||!delivery||delivery.blockHash!==a.block_hash||String(delivery.blockHeight)!==String(a.block_height)||delivery.feeZatoshi!==a.actual_fee
     ||delivery.tipHeight-delivery.blockHeight+1<10||delivery.amountZatoshi!=='100000')throw Error('G5_FINAL_SHIELDED_RECEIPT_REQUIRED');
   }
   // Check fresh source/delivery above before Base lag may pause verification.
   // Only immutable confirmed originals can yield WAIT; no SQL frontier writes.
   await verifyG5CompletedBaseOrder(c.base,await loadG5CompletedBaseDescriptor(c,slot,read,privateLocalPath(path)));
}

try{
 if(!readOnly&&!['recover-empty-opening','recover-completed-roundtrip','recover-f3-scanner'].includes(step))requireG5Operational(c.state);
 phase='base-preflight';await c.base.preflight();if(!readOnly&&!['recover-empty-opening','recover-completed-roundtrip','recover-f3-scanner'].includes(step))await c.admin.query('UPDATE zee.runtime_control SET accepting_orders=false,dispatch_enabled=false');
 let result:unknown;
 if(step==='status'){
  const rows=await assertRunDatabase();result={status:'G5_PAUSED',incident:!!c.state.incident,slots:c.state.orders.length,verified:c.state.orders.filter(o=>o.verified).length,
   barriers:c.state.barriers??[],orders:c.state.orders.map(o=>({sequence:o.sequence,direction:o.direction,state:rows.find(r=>r.id===o.orderId)?.state??'UNACCEPTED',receiptVerified:!!o.receiptVerified,verified:!!o.verified}))};
 }else if(step==='diagnose'){
  const summary=await boundary(c.state.orders.length===0);result={status:'G5_READ_ONLY_BOUNDARY_OK',readOnly:true,incident:!!c.state.incident,...summary};
 }else if(step==='recover-empty-opening'){
  phase='empty-opening-audit';if(!rawSequence)throw Error('G5_PRIVATE_EMPTY_OPENING_AUDIT_FILE_REQUIRED');
  const audit=await read(rawSequence);requireG5EmptyOpeningRecovery(c.state,c.config,audit);
  const control=(await c.admin.query('SELECT accepting_orders,dispatch_enabled,reconciliation_required FROM zee.runtime_control')).rows[0];
  if(control.accepting_orders||control.dispatch_enabled||!control.reconciliation_required)throw Error('G5_EMPTY_RECOVERY_REQUIRES_PAUSED_RECONCILIATION');
  const occupied=(await c.admin.query(`SELECT (SELECT count(*) FROM zee.quotes)+(SELECT count(*) FROM zee.orders)+(SELECT count(*) FROM zee.deposits)
   +(SELECT count(*) FROM zee.operations)+(SELECT count(*) FROM zee.obligations)+(SELECT count(*) FROM zee.reservations)+(SELECT count(*) FROM zee.outbox_jobs)
   +(SELECT count(*) FROM zee.base_bindings)+(SELECT count(*) FROM zee.base_attempts)+(SELECT count(*) FROM zee.escrow_bindings)+(SELECT count(*) FROM zee.escrow_commits)
   +(SELECT count(*) FROM zee.reverse_payouts)+(SELECT count(*) FROM zee.escrow_settlements)+(SELECT count(*) FROM zee.source_refunds)+(SELECT count(*) FROM zee.order_events) AS n`)).rows[0].n;
  if(occupied!=='0')throw Error('G5_EMPTY_RECOVERY_REJECTS_ANY_BUSINESS_HISTORY');
  const ledgerCount=(await c.admin.query('SELECT count(*) AS n FROM zee.ledger_entries')).rows[0].n;if(ledgerCount!=='8')throw Error('G5_EMPTY_RECOVERY_REQUIRES_EXACT_OPENING_LEDGER');
  for(const item of audit.sourceActorConfigs){
   const actor=await read(item.configFile),expected=c.config.forwardOrders.find((o:any)=>o.sequence===item.sequence),root=`/home/albary/zeeswap-g5-retry/source-${String(item.sequence).padStart(2,'0')}`;
   if(actor.branchId!==c.config.branchId||actor.runId!==c.state.runId||actor.sequence!==item.sequence||actor.refundRecipient!==expected.refundRecipient
    ||g5PathIdentity(actor.runConfig)!==g5PathIdentity(privateLocalPath(path))||g5PathIdentity(actor.walletPath)!==root+'/user-wallet')throw Error('G5_EMPTY_RECOVERY_SOURCE_ACTOR_BINDING');
   for(const suffix of ['/source-funding-intent.private.json','/source-funding-intent.private.json.result.json','/source-actor.lock'])await requireAbsent(root+suffix);
   await requireAbsent(c.config.stateFile+'.funding-'+item.sequence+'.json');
  }
  for(const item of c.config.reverseOrders){
   const operator=await read(item.configFile),raw=await read(operator.zcashPrivateConfig);
   if(g5PathIdentity(operator.runConfig)!==g5PathIdentity(privateLocalPath(path))||operator.sequence!==item.sequence||raw.approvedDigest!=='0'.repeat(64))throw Error('G5_EMPTY_RECOVERY_REVERSE_ACTOR_BINDING');
   for(const artifact of [operator.stateFile,raw.journalPath,raw.approvedRequest])await requireAbsent(artifact);
  }
  const summary=await boundary(true);
  const proofFile=c.config.stateFile+'.empty-recovery-'+randomUUID()+'.private.json';
  await durable(proofFile,{version:1,runId:c.state.runId,observedAt:new Date().toISOString(),reason:'EMPTY_OPENING_CONFIGURATION_REPAIRED',audit,...summary,reconciliationRequired:true},true);
  c.state.incident=false;await c.save();result={status:'G5_EMPTY_OPENING_RECOVERED_PAUSED',...summary,reconciliationRequired:true,acceptingOrders:false,dispatchEnabled:false};
 }else if(r4FundingWaitRecovery){
  phase='r4-original-funding-wait-guard';if(!rawSequence)throw Error('G5_R4_WAIT_CONTROLLER_CONFIG_REQUIRED');
  const controllerConfig=await read(rawSequence);controllerLockPath=privateLocalPath(controllerConfig.stateFile)+'.lock';controllerLock=await open(controllerLockPath,'wx',0o600);await controllerLock.writeFile(JSON.stringify({pid:process.pid,runId:c.state.runId,recovery:'R4_ORIGINAL_FUNDING_WAIT'}));await controllerLock.sync();
  const controller=await read(controllerConfig.stateFile),mainOriginal=structuredClone(c.state);let startupDiagnosticPath:string|undefined;
  if(r4VerifyBindingRecovery){startupDiagnosticPath=c.config.stateFile+'.diagnostic.private.json';requireG5R4VerifyBindingRecovery(c.state,c.config,controller,controllerConfig,privateLocalPath(path),await read(startupDiagnosticPath));}
  else if(r4PrecommitStartupRecovery){const rc=await read(c.config.reverseOrders[1].configFile);startupDiagnosticPath=rc.stateFile+'.initialization-diagnostic.private.json';requireG5R4PrecommitStartupRecovery(c.state,c.config,controller,controllerConfig,privateLocalPath(path),await read(startupDiagnosticPath));}
  else requireG5R4FundingWaitRecovery(c.state,c.config,controller,controllerConfig,privateLocalPath(path));
  const control=(await c.admin.query('SELECT * FROM zee.runtime_control')).rows[0];if(control.accepting_orders||control.dispatch_enabled||control.reconciliation_required!==r4VerifyBindingRecovery||String(control.epoch)!==(r4VerifyBindingRecovery?'7':'6'))throw Error('G5_R4_WAIT_HEALTHY_PAUSED_EPOCH_REQUIRED');
  const privatePins=new Map<string,string>(),journalLists=new Map<string,string>(),absentArtifacts:string[]=[];
  const pin=async(file:string)=>{privatePins.set(file,createHash('sha256').update(JSON.stringify(await read(file))).digest('hex'));};
  if(startupDiagnosticPath)await pin(startupDiagnosticPath);
  for(const file of [path,rawSequence,c.config.databaseConfig,c.config.runtimeConfig,c.config.walletConfig,c.config.baseSignerClientPath,c.config.balanceCaptureConfigFile])await pin(file);
  for(const item of c.config.reverseOrders){await pin(item.configFile);const cfg=await read(item.configFile);await pin(cfg.zcashPrivateConfig);await pin(cfg.baseSignerPrivateConfig);}
  if(r4VerifyBindingRecovery){const causeConfig=await read(c.config.reverseOrders.find((o:any)=>o.sequence===2)!.configFile);requireG5R4VerifyBindingCause(causeConfig,c.state.runId,privateLocalPath(path));}
  const migrations:{name:string;sha256:string}[]=[];for(const name of (await readdir(new URL('../migrations/',import.meta.url))).filter(n=>/^(?:000[1-9]|001[0-4])_.*\.sql$/.test(n)).sort())migrations.push({name,sha256:createHash('sha256').update(await readFile(new URL('../migrations/'+name,import.meta.url))).digest('hex')});
  requireG5F3Migrations((await c.admin.query('SELECT name,sha256 FROM public.zeeswap_migrations ORDER BY name')).rows,migrations);
  const r4=c.state.orders[3],cfg=await read(c.config.reverseOrders[1].configFile),reverse=await read(cfg.stateFile),wallet=await read(cfg.zcashPrivateConfig),signerConfig=await read(cfg.baseSignerPrivateConfig);
  if(reverse.orderId!==r4.orderId||reverse.owner!==r4.owner||reverse.lastFailure||(r4VerifyBindingRecovery?!reverse.currentLease:!!reverse.currentLease)||reverse.approvedRequest||reverse.approvedDigest||cfg.fundingTransactionHash!==G5_R4_ORIGINAL_FUND||cfg.approvedDigest&&cfg.approvedDigest!=='0'.repeat(64)||wallet.approvedDigest!=='0'.repeat(64)||signerConfig.reverseApprovedDigest&&signerConfig.reverseApprovedDigest!=='0'.repeat(64))throw Error('G5_R4_WAIT_NO_COMMIT_OR_SDK_APPROVAL_REQUIRED');
  await pin(cfg.stateFile);for(const artifact of [cfg.approvedRequest,cfg.baseSignerApprovedRequestFile,wallet.approvedRequest,wallet.journalPath,wallet.journalPath+'.result.json',wallet.journalPath+'.g5-sdk-crash.private.json'].filter(Boolean)){await requireAbsent(artifact);absentArtifacts.push(artifact);}
  const payerItem=controllerConfig.payerOrders.find((o:any)=>o.sequence===4),payer=await read(payerItem.configFile),approvedPath=siblingPath(payerItem.configFile,payer.approvedFile),approved=await read(approvedPath),prepared=await read(payerItem.preparedFile);
  if(payer.branchId!==c.config.branchId||payer.runId!==c.state.runId||g5PathIdentity(payer.runConfig)!==g5PathIdentity(privateLocalPath(path))||payer.journalRoot!=='/home/albary/zeeswap-g5/refunds/payer-journal'||getAddress(payer.payer)!==getAddress(cfg.payer)||getAddress(payer.token)!==getAddress(c.base.registry.contracts.MockUSDC.address)||getAddress(payer.settlement)!==getAddress(c.base.registry.contracts.ZeeSwapSettlement.address))throw Error('G5_R4_WAIT_PAYER_SCOPE_CHANGED');
  for(const file of [payerItem.configFile,approvedPath,payerItem.preparedFile])await pin(file);
  const expectedApproval={version:1,branchId:c.config.branchId,sequence:4,orderId:r4.orderId,funding:reverse.funding};
  if(!isDeepStrictEqual(approved,expectedApproval)||payer.approvedDigest!==approvalDigest(expectedApproval)||prepared.hash!==G5_R4_ORIGINAL_FUND||prepared.nonce!==7||prepared.maxCost!=='10000000000000'||keccak256(prepared.raw)!==prepared.hash||getAddress(await recoverTransactionAddress({serializedTransaction:prepared.raw as TransactionSerialized}))!==getAddress(cfg.payer))throw Error('G5_R4_WAIT_ORIGINAL_PAYER_APPROVAL_RAW_REQUIRED');
  const terms=await escrowTerms(c.worker,c.r.keys,c.base,r4.orderId!),binding=(await c.worker.query('SELECT terms_payload FROM zee.escrow_bindings WHERE order_id=$1',[r4.orderId])).rows[0],auth=c.r.keys.open(binding.terms_payload,`escrow-terms:${r4.orderId}:v1`) as any;
  if(!isDeepStrictEqual(reverse.funding,{terms:auth.terms,signature:auth.signature,to:c.base.registry.contracts.ZeeSwapSettlement.address,data:fundingCall(c.base,auth.terms,auth.signature),value:'0'})||!isDeepStrictEqual(terms,auth.terms)||getAddress(await recoverTypedDataAddress({...fundingTypedData(c.base,terms),signature:auth.signature}))!==getAddress(c.base.registry.operator))throw Error('G5_R4_WAIT_IMMUTABLE_FUNDING_AUTHORIZATION_REQUIRED');
  const raw=parseTransaction(prepared.raw),chain=await c.base.client.getTransaction({hash:prepared.hash});
  if(raw.chainId!==84532||raw.nonce!==7||raw.gas!==450000n||raw.gasPrice!==20000000n||raw.to?.toLowerCase()!==reverse.funding.to.toLowerCase()||raw.data!==reverse.funding.data||(raw.value??0n)!==0n||chain.nonce!==7||chain.hash!==prepared.hash||chain.input!==raw.data||chain.to?.toLowerCase()!==raw.to?.toLowerCase()||chain.value!==0n||getAddress(chain.from)!==getAddress(cfg.payer))throw Error('G5_R4_WAIT_ORIGINAL_PAYER_CALL_REQUIRED');
  const originalCommitProof=r4VerifyBindingRecovery?await finalizedReceipt(c.base,G5_R4_ORIGINAL_COMMIT):undefined;if(r4VerifyBindingRecovery&&!originalCommitProof)throw Error('G5_R4_ORIGINAL_COMMIT_FINALITY_PENDING');
  const fund=await finalizedReceipt(c.base,prepared.hash);if(!fund)throw Error('G5_R4_ORIGINAL_FUND_FINALITY_PENDING');
  if(fund.receipt.blockNumber!==48156445n||fund.receipt.blockHash!=='0xd0870d713d2b3d91b6c677e6608b39e006cbd30d51a9b0fc61177f43b54d4e12'||typeof(fund.receipt as any).l1Fee!=='bigint'||String(fund.receipt.gasUsed*fund.receipt.effectiveGasPrice+(fund.receipt as any).l1Fee)!=='4453900000248'||typeof fund.block.timestamp!=='bigint'||fund.block.timestamp<0n||fund.block.timestamp>=BigInt(terms.fundingCutoff)||escrowEvents(c.base,fund.receipt,'Funded').filter((e:any)=>e.args.id===terms.id&&e.args.amount===100000n&&getAddress(e.args.payer)===getAddress(cfg.payer)).length!==1||await escrowState(c.base,terms,(originalCommitProof??fund).heads.finalized.number)!==(r4VerifyBindingRecovery?5:4)||await escrowState(c.base,terms,(originalCommitProof??fund).heads.latest.number)!==(r4VerifyBindingRecovery?5:4))throw Error('G5_R4_WAIT_CANONICAL_FUNDED_SOURCE_REQUIRED');
  if(!r4VerifyBindingRecovery){phase='r4-final-source-normal-observation';await refresh();const observed=await observeEscrowFunding(c.worker,c.r.keys,c.base,r4.orderId!,prepared.hash);if(observed.status!=='READY')throw Error('G5_R4_ORIGINAL_FUND_FINALITY_PENDING');}
  const books=await captureG5F3RecoveryBooks(c.admin),ids=c.state.orders.map(o=>o.orderId!);if(r4VerifyBindingRecovery)requireG5R4VerifyBindingBooks(books,ids,reverse.currentLease);else requireG5R4HeldReadyBooks(books,ids);const booksIdentity=JSON.stringify(books);
  if(r4VerifyBindingRecovery)requireG5R4VerifyBindingSource(c.r.keys,books.deposits.find((d:any)=>d.order_id===r4.orderId),books.quotes.find((q:any)=>q.id===r4.orderId),{index:escrowEvents(c.base,fund.receipt,'Funded')[0].index,emitter:c.base.registry.contracts.ZeeSwapSettlement.address,height:Number(fund.receipt.blockNumber),blockHash:fund.receipt.blockHash.slice(2),blockTime:new Date(Number(fund.block.timestamp)*1000)});
  requireG5R4FundingWaitLedger(books.ledger,c.state.openingEventId,r4.orderId!);
  const charged=books.forwards.reduce((n:bigint,a:any)=>n+BigInt(a.actual_fee),0n)+books.commits.filter((a:any)=>a.confirmed).reduce((n:bigint,a:any)=>n+BigInt(a.actual_fee),0n)+BigInt(books.settles[0].actual_fee);
  if(String(charged)!=='11413220001117')throw Error('G5_R4_WAIT_EXACT_ORIGINAL_OPERATOR_FEES_REQUIRED');validateG5SdkFaultAccounts(books.accounts.map((a:any)=>({...a,balance:String(a.balance),reserved:String(a.reserved)})),String(charged));
  for(const slot of c.state.orders.slice(0,3))await verifyReceipts(slot);
  if(r4VerifyBindingRecovery){
   const row=books.commits.find((a:any)=>a.order_id===r4.orderId),signed=c.r.keys.open(row.signed_payload,`escrow-commit:${r4.orderId}:v1`) as any,raw=parseTransaction(signed.raw);
   const proof=await finalizedReceipt(c.base,G5_R4_ORIGINAL_COMMIT);if(!proof)throw Error('G5_R4_ORIGINAL_COMMIT_FINALITY_PENDING');
   if(signed.hash!==G5_R4_ORIGINAL_COMMIT||signed.nonce!==11||keccak256(signed.raw)!==signed.hash||!row.tx_hash.equals(c.r.keys.lookup('base-tx',signed.hash))||getAddress(await recoverTransactionAddress({serializedTransaction:signed.raw as TransactionSerialized}))!==getAddress(c.base.registry.operator)
    ||raw.chainId!==84532||raw.nonce!==11||raw.to?.toLowerCase()!==c.base.registry.contracts.ZeeSwapSettlement.address.toLowerCase()||(raw.value??0n)!==0n||raw.data!==encodeFunctionData({abi:parseAbi(['function commitPayout(bytes32 id)']),functionName:'commitPayout',args:[terms.id]})||!raw.gas||raw.gas>450000n||!raw.gasPrice||raw.gasPrice>20000000n||signed.maxCost!==row.max_cost||BigInt(signed.maxCost)<=0n||BigInt(signed.maxCost)>10000000000000n||raw.gas*raw.gasPrice>BigInt(signed.maxCost)
    ||proof.receipt.blockNumber!==48158125n||proof.receipt.blockHash!=='0xede02aa2abf559b61a1e0f512210c511f2cee28f35f39e673230bc34af6c9541'||typeof(proof.receipt as any).l1Fee!=='bigint'||String(proof.receipt.gasUsed*proof.receipt.effectiveGasPrice+(proof.receipt as any).l1Fee)!==G5_R4_ORIGINAL_COMMIT_FEE||BigInt(G5_R4_ORIGINAL_COMMIT_FEE)>BigInt(signed.maxCost)||escrowEvents(c.base,proof.receipt,'PayoutCommitted').filter((e:any)=>e.args.id===terms.id).length!==1)throw Error('G5_R4_EXACT_ORIGINAL_COMMIT_REQUIRED');
  }
  phase='r4-original-global-raw-journals';const heads=await c.base.heads();
  for(const [root,signer,next,reference] of [[signerConfig.journalRoot,c.base.registry.operator,r4VerifyBindingRecovery?12:11,cfg.baseSignerPrivateConfig],[payer.journalRoot,cfg.payer,8,payerItem.configFile]] as const){
   const directory=siblingPath(reference,root),names=(await readdir(privateLocalPath(directory))).filter(n=>n.endsWith('.tx.json')).sort();journalLists.set(directory,JSON.stringify(names));const seen=new Map<number,string>();
   for(const name of names){const file=directory+'/'+name,a=await read(file);await pin(file);
    if(!Number.isSafeInteger(a.nonce)||a.nonce>=next||keccak256(a.raw)!==a.hash||getAddress(await recoverTransactionAddress({serializedTransaction:a.raw as TransactionSerialized}))!==getAddress(signer)||seen.has(a.nonce)&&seen.get(a.nonce)!==a.hash)throw Error('G5_R4_WAIT_UNKNOWN_GLOBAL_RAW');seen.set(a.nonce,a.hash);
    const tx=await c.base.client.getTransaction({hash:a.hash}),receipt=await c.base.client.getTransactionReceipt({hash:a.hash}),canonical=await c.base.client.getBlock({blockNumber:receipt.blockNumber});requireG5F3CanonicalGlobalRaw({original:a,parsed:parseTransaction(a.raw),chain:tx,receipt,canonical,finalized:heads.finalized,signer});
   }
  }
  for(const a of [...g5R4OriginalOperatorRows({...books,commits:books.commits.filter((a:any)=>a.order_id!==r4.orderId)}),...(r4VerifyBindingRecovery?[{...books.commits.find((a:any)=>a.order_id===r4.orderId),kind:'commit',phase:'COMMIT'}]:[])]){
   const context=a.kind==='forward'?`base-signed:${a.order_id}:${a.phase}:v1`:`escrow-${a.kind}:${a.order_id}:v1`,signed=c.r.keys.open(a.signed_payload,context) as any;
   const bound=a.kind==='forward'?c.r.keys.open(books.bindings.find((b:any)=>b.order_id===a.order_id).terms_payload,`base-terms:${a.order_id}:v1`) as any:await escrowTerms(c.worker,c.r.keys,c.base,a.order_id);
   const journal=await read(siblingPath(cfg.baseSignerPrivateConfig,signerConfig.journalRoot+'/'+createHash('sha256').update(bound.id).digest('hex')+'.'+a.phase+'.tx.json'));if(journal.raw!==signed.raw||journal.hash!==signed.hash||journal.nonce!==signed.nonce)throw Error('G5_R4_WAIT_CURRENT_RAW_JOURNAL_CHANGED');
  }
  const payerJournal=await read(siblingPath(payerItem.configFile,payer.journalRoot+'/'+createHash('sha256').update(terms.id).digest('hex')+'.user-funding.tx.json'));
  if(!isDeepStrictEqual(payerJournal.approved,expectedApproval)||payerJournal.raw!==prepared.raw||payerJournal.hash!==prepared.hash||payerJournal.nonce!==7)throw Error('G5_R4_WAIT_ORIGINAL_PAYER_JOURNAL_CHANGED');
  const nonces=()=>Promise.all([c.base.client.getTransactionCount({address:c.base.registry.operator,blockTag:'latest'}),c.base.client.getTransactionCount({address:c.base.registry.operator,blockTag:'pending'}),c.base.client.getTransactionCount({address:terms.payer,blockTag:'latest'}),c.base.client.getTransactionCount({address:terms.payer,blockTag:'pending'})]);(r4VerifyBindingRecovery?requireG5R4VerifyBindingNonces:requireG5R4FundingWaitNonces)(await nonces());
  phase='r4-held-physical-and-source-proof';await captureG5WalletPartition(c);
  const source=validateSnapshot(await c.r.wallet.snapshot(books.deposits.filter((d:any)=>d.network==='zcash-testnet').map((d:any)=>Number(d.block_height))));
  const notes=source.outputs.map(o=>{const d=books.deposits.find((d:any)=>d.network==='zcash-testnet'&&d.identity_hash.equals(c.r.keys.lookup('deposit',JSON.stringify(['zcash-testnet',o.txid,o.pool,o.index]))));if(!d||o.amount!=='100000'||!o.shieldedSource||o.blockHash!==d.block_hash||String(o.height)!==String(d.block_height)||source.scannedHeight-o.height+1<10||!d.receiver_hash.equals(c.r.keys.lookup('receiver',o.receiver))||!d.reference_hash.equals(c.r.keys.lookup('reference',parseMemo(o.memo??''))))throw Error('G5_R4_WAIT_FRESH_ORIGINAL_SOURCE_REQUIRED');return {pool:o.pool,txid:o.txid,index:o.index,value:o.amount};});
  if(notes.length!==2)throw Error('G5_R4_WAIT_TWO_FORWARD_SOURCES_REQUIRED');const wallets=await read(c.config.balanceProofFile);validateG5WalletBalances(wallets,c.state,notes,1);if(wallets.reverse.slice(1).some((w:any)=>w.pendingCalculatedTransactions!==0))throw Error('G5_R4_WAIT_UNKNOWN_SDK_CALCULATION');
  const physicalHead=await c.base.heads(),address=c.base.registry.contracts.ZeeSwapSettlement.address,token=c.base.registry.contracts.MockUSDC.address;
  const values=await Promise.all([c.base.client.readContract({address,abi:parseAbi(['function inventory() view returns(uint256)']),functionName:'inventory',blockNumber:physicalHead.finalized.number}),c.base.client.readContract({address,abi:parseAbi(['function availableInventory() view returns(uint256)']),functionName:'availableInventory',blockNumber:physicalHead.finalized.number}),c.base.client.readContract({address:token,abi:parseAbi(['function balanceOf(address) view returns(uint256)']),functionName:'balanceOf',args:[address],blockNumber:physicalHead.finalized.number}),c.base.client.readContract({address,abi:parseAbi(['function escrowLiability() view returns(uint256)']),functionName:'escrowLiability',blockNumber:physicalHead.finalized.number}),c.base.client.getBalance({address:c.base.registry.operator,blockNumber:physicalHead.finalized.number})]);
  validateG5SdkFaultPhysical(c.state.openingPhysical!,String(charged),r4VerifyBindingRecovery?G5_R4_ORIGINAL_COMMIT_FEE:'0',Object.fromEntries(['inventory','available','tokenBalance','escrowLiability','gas'].map((k,i)=>[k,values[i].toString()])));
  if(await escrowState(c.base,terms,physicalHead.finalized.number)!==(r4VerifyBindingRecovery?5:4)||await escrowState(c.base,terms,physicalHead.latest.number)!==(r4VerifyBindingRecovery?5:4)||(await c.base.client.getBlock({blockNumber:physicalHead.finalized.number})).hash!==physicalHead.finalized.hash)throw Error('G5_R4_WAIT_FUNDED_STATE_CHANGED');(r4VerifyBindingRecovery?requireG5R4VerifyBindingNonces:requireG5R4FundingWaitNonces)(await nonces());
  await durable(c.config.stateFile+(r4VerifyBindingRecovery?'.r4-verify-binding-recovery-':r4PrecommitStartupRecovery?'.r4-precommit-startup-recovery-':'.r4-funding-wait-recovery-')+randomUUID()+'.private.json',{version:1,runId:c.state.runId,epoch:String(control.epoch),reason:r4VerifyBindingRecovery?'R4_COMPLETED_DESCRIPTOR_OPTIONAL_FIELD_FAILURE':r4PrecommitStartupRecovery?'R4_PRECOMMIT_INITIALIZATION_READ_TIMEOUT_NO_EFFECT':'R4_ORIGINAL_FUNDING_FINALITY_STATUS_CONTRACT_REPAIR',controllerOriginal:controller,fundingHash:prepared.hash,sourceFinalized:true,observedStatus:'READY',chargedOperatorFeesWei:String(charged),operatorNextNonce:r4VerifyBindingRecovery?12:11,payerNextNonce:8,booksIdentity,settled:3,r4HeldReady:true,newPayment:false},true);
  phase='r4-known-source-wait-controller-cas';await transaction(c.admin,async db=>{
   const now=(await db.query('SELECT * FROM zee.runtime_control FOR UPDATE')).rows[0];if(String(now.epoch)!==(r4VerifyBindingRecovery?'7':'6')||now.accepting_orders||now.dispatch_enabled||now.reconciliation_required!==r4VerifyBindingRecovery||JSON.stringify(await captureG5F3RecoveryBooks(db))!==booksIdentity||!isDeepStrictEqual(await read(c.config.stateFile),mainOriginal)||!isDeepStrictEqual(await read(controllerConfig.stateFile),controller))throw Error('G5_R4_WAIT_PROOF_CHANGED_AT_CAS');
   for(const [file,digest] of privatePins)if(createHash('sha256').update(JSON.stringify(await read(file))).digest('hex')!==digest)throw Error('G5_R4_WAIT_PRIVATE_PIN_CHANGED');for(const [dir,names] of journalLists)if(JSON.stringify((await readdir(privateLocalPath(dir))).filter(n=>n.endsWith('.tx.json')).sort())!==names)throw Error('G5_R4_WAIT_GLOBAL_JOURNAL_CHANGED');for(const file of absentArtifacts)await requireAbsent(file);
   const fresh=[];for(const m of migrations)fresh.push({name:m.name,sha256:createHash('sha256').update(await readFile(new URL('../migrations/'+m.name,import.meta.url))).digest('hex')});requireG5F3Migrations(books.migrations,fresh);
   if(r4VerifyBindingRecovery)await db.query('UPDATE zee.runtime_control SET reconciliation_required=false');
  });
  if(r4VerifyBindingRecovery){const saved=await saveG5R4VerifyBindingMain(mainOriginal,{save:s=>durable(privateLocalPath(c.config.stateFile),s),read:()=>read(c.config.stateFile),refreeze:()=>transaction(c.admin,async db=>{const now=(await db.query('SELECT * FROM zee.runtime_control FOR UPDATE')).rows[0];if(String(now.epoch)!=='7'||now.accepting_orders||now.dispatch_enabled)throw Error('G5_R4_VERIFY_BINDING_REFREEZE_CHANGED');await db.query('UPDATE zee.runtime_control SET reconciliation_required=true');})});c.state.incident=saved.incident;}
  else await saveG5UnfundedR4QuoteLocal(controller,{save:s=>durable(privateLocalPath(controllerConfig.stateFile),s),read:()=>read(controllerConfig.stateFile)});
  result={status:r4VerifyBindingRecovery?'G5_R4_VERIFY_BINDING_RECOVERED_PAUSED':r4PrecommitStartupRecovery?'G5_R4_PRECOMMIT_READ_TIMEOUT_CONTROLLER_RECOVERED_PAUSED':'G5_R4_ORIGINAL_FUNDED_WAIT_CONTROLLER_RECOVERED_PAUSED',epoch:r4VerifyBindingRecovery?'7':'6',settled:3,r4HeldReady:true,controllerStage:r4VerifyBindingRecovery?'OBSERVE_COMMIT':r4PrecommitStartupRecovery?'PREPARE_COMMIT':'OBSERVE_SOURCE',mainChanged:r4VerifyBindingRecovery,newPayment:false,sourceFinalized:true,batchBarrierAdvanced:false};
 }else if(step==='recover-completed-roundtrip'||step==='recover-f3-scanner'||r4QuoteRecovery){
  const threeOrderRecovery=step==='recover-f3-scanner'||r4QuoteRecovery;let controllerConfig:any,controller:any,controllerOriginal:any,books:any,booksIdentity:string|undefined;const privatePins=new Map<string,string>(),migrationPins:{name:string;sha256:string}[]=[],journalListings=new Map<string,string>(),absentArtifacts:string[]=[];
  phase=r4QuoteRecovery?'r4-empty-quote-no-effect-guard':threeOrderRecovery?'f3-scanner-guard':'completed-first-roundtrip-guard';
  const diagnostic=r4QuoteRecovery?undefined:await read(c.config.stateFile+'.diagnostic.private.json');
  if(threeOrderRecovery){
   if(!rawSequence)throw Error('G5_F3_PRIVATE_CONTROLLER_CONFIG_REQUIRED');controllerConfig=await read(rawSequence);controllerLockPath=privateLocalPath(controllerConfig.stateFile)+'.lock';
   controllerLock=await open(controllerLockPath,'wx',0o600);await controllerLock.writeFile(JSON.stringify({pid:process.pid,runId:c.state.runId,recovery:r4QuoteRecovery?'R4_EMPTY_QUOTE':'F3_SCANNER'}));await controllerLock.sync();
   controller=await read(controllerConfig.stateFile);controllerOriginal=structuredClone(controller);
   if(r4QuoteRecovery)requireG5UnfundedR4QuoteRecovery(c.state,c.config,controller,controllerConfig,privateLocalPath(path));else requireG5F3ScannerRecovery(c.state,c.config,controller,controllerConfig,diagnostic,privateLocalPath(path));
   const paths=[path,rawSequence,c.config.databaseConfig,c.config.runtimeConfig,c.config.walletConfig,c.config.baseSignerClientPath,c.config.balanceCaptureConfigFile];
   for(const item of c.config.reverseOrders){paths.push(item.configFile);const cfg=await read(item.configFile);paths.push(cfg.zcashPrivateConfig,cfg.baseSignerPrivateConfig);}
   for(const file of paths.filter(Boolean))privatePins.set(file,createHash('sha256').update(JSON.stringify(await read(file))).digest('hex'));
  }else requireG5CompletedRoundtripRecovery(c.state,c.config,diagnostic);
  const control=(await c.admin.query('SELECT * FROM zee.runtime_control')).rows[0];
  if(control.accepting_orders||control.dispatch_enabled||control.reconciliation_required!==!r4QuoteRecovery||String(control.epoch)!==(threeOrderRecovery?'6':'5'))throw Error('G5_COMPLETED_RECOVERY_REQUIRES_PAUSED_INCIDENT');
  if(threeOrderRecovery){
   phase='f3-original-pay-only-finality';
   await assertRunDatabase();
   if((await c.admin.query('SELECT count(*) AS n FROM public.zeeswap_migrations')).rows[0].n!=='14')throw Error('G5_F3_FOURTEEN_MIGRATIONS_REQUIRED');
   const directory=new URL('../migrations/',import.meta.url);
   for(const name of (await readdir(directory)).filter(name=>/^(?:000[1-9]|001[0-4])_.*\.sql$/.test(name)).sort())migrationPins.push({name,sha256:createHash('sha256').update(await readFile(new URL(name,directory))).digest('hex')});
   requireG5F3Migrations((await c.admin.query('SELECT name,sha256 FROM public.zeeswap_migrations ORDER BY name')).rows,migrationPins);
   if(r4QuoteRecovery){
    phase='r4-exact-empty-quote-and-artifacts';
    const r4=c.state.orders[3],existing=(await c.admin.query('SELECT count(*) AS n FROM zee.quotes WHERE access_hash=$1',[accessHash(r4.owner)])).rows[0].n;
    if(existing!=='0'||(await c.admin.query('SELECT count(*) AS n FROM zee.orders')).rows[0].n!=='3')throw Error('G5_R4_QUOTE_OR_ORDER_EXISTS');
    const cfg=await read(c.config.reverseOrders[1].configFile),wallet=await read(cfg.zcashPrivateConfig),signer=await read(cfg.baseSignerPrivateConfig),payerItem=controllerConfig.payerOrders.find((o:any)=>o.sequence===4),payer=await read(payerItem.configFile);
    privatePins.set(payerItem.configFile,createHash('sha256').update(JSON.stringify(payer)).digest('hex'));
    if(cfg.fundingTransactionHash||cfg.approvedDigest&&cfg.approvedDigest!=='0'.repeat(64)||wallet.approvedDigest!=='0'.repeat(64)||signer.reverseApprovedDigest&&signer.reverseApprovedDigest!=='0'.repeat(64)||payer.approvedDigest!=='0'.repeat(64))throw Error('G5_R4_FUNDING_OR_APPROVAL_EXISTS');
    const totals=(await c.admin.query('SELECT (SELECT count(*) FROM zee.quotes) AS quotes,(SELECT count(*) FROM zee.orders) AS orders')).rows[0];
    requireG5UnfundedR4NoEffects({ownerQuotes:Number(existing),quotes:Number(totals.quotes),orders:Number(totals.orders),digests:[cfg.approvedDigest,wallet.approvedDigest,signer.reverseApprovedDigest,payer.approvedDigest].filter(d=>d!==undefined),fundingHash:cfg.fundingTransactionHash});
    const payerApproval=siblingPath(payerItem.configFile,payer.approvedFile);
    for(const artifact of [cfg.stateFile,cfg.approvedRequest,cfg.baseSignerApprovedRequestFile,wallet.journalPath,wallet.journalPath+'.result.json',wallet.journalPath+'.g5-sdk-crash.private.json',wallet.approvedRequest,payerApproval,payerItem.preparedFile].filter(Boolean)){await requireAbsent(artifact);absentArtifacts.push(artifact);}
   }else{
   const rows=(await c.worker.query('SELECT * FROM zee.base_attempts')).rows,f3=c.state.orders[2];
   if(rows.length!==4||rows.some(a=>!a.confirmed&&(a.order_id!==f3.orderId||a.phase!=='PAY')))throw Error('G5_F3_ONLY_ORIGINAL_PAY_MAY_RECONCILE');
   const pay=rows.find(a=>a.order_id===f3.orderId&&a.phase==='PAY'),binding=(await c.worker.query('SELECT terms_payload FROM zee.base_bindings WHERE order_id=$1',[f3.orderId])).rows[0];
   if(!pay||!binding)throw Error('G5_F3_ORIGINAL_PAY_REQUIRED');
   const signed=c.r.keys.open(pay.signed_payload,`base-signed:${f3.orderId}:PAY:v1`) as any,terms=c.r.keys.open(binding.terms_payload,`base-terms:${f3.orderId}:v1`) as any;
   if(!await c.base.receipt(signed.hash,'PAY',terms))throw Error('G5_F3_ORIGINAL_PAY_FINALITY_PENDING');
   await reconcileBaseReceipts(c.worker,c.r.keys,c.base);
   }
   books=await captureG5F3RecoveryBooks(c.admin);requireG5F3RecoveryBooks(books);booksIdentity=JSON.stringify(books);
   const op=books.operations.find((o:any)=>o.order_id===c.state.orders[2].orderId),job=books.jobs.find((j:any)=>j.operation_id===op.id);
   if(job.lease_owner!==null||job.lease_until!==null)throw Error('G5_F3_RETIRED_LEASE_REQUIRED');
  }
  const counts=(await c.admin.query(`SELECT (SELECT count(*) FROM zee.quotes) AS quotes,(SELECT count(*) FROM zee.orders WHERE state='SETTLED') AS settled,
   (SELECT count(*) FROM zee.deposits WHERE classification='EXACT' AND amount=100000 AND confirmed_at IS NOT NULL) AS deposits,
   (SELECT count(*) FROM zee.operations WHERE kind='PAYOUT' AND state='CONFIRMED') AS operations,(SELECT count(*) FROM zee.outbox_jobs WHERE status='DONE') AS jobs,
   (SELECT count(*) FROM zee.base_attempts WHERE confirmed) AS forwards,(SELECT count(*) FROM zee.escrow_commits WHERE confirmed) AS commits,
   (SELECT count(*) FROM zee.escrow_settlements WHERE confirmed) AS settles,(SELECT count(*) FROM zee.reverse_payouts WHERE confirmed) AS shielded,
   (SELECT count(*) FROM zee.source_refunds) AS refunds,(SELECT count(*) FROM public.zeeswap_migrations) AS migrations`)).rows[0];
  for(const [key,value] of Object.entries({quotes:threeOrderRecovery?'3':'2',settled:threeOrderRecovery?'3':'2',deposits:threeOrderRecovery?'3':'2',operations:threeOrderRecovery?'3':'2',jobs:threeOrderRecovery?'3':'2',forwards:threeOrderRecovery?'4':'2',commits:'1',settles:'1',shielded:'1',refunds:'0',migrations:'14'}))if(counts[key]!==value)throw Error('G5_COMPLETED_RECOVERY_EXACT_HISTORY_REQUIRED');
  phase='completed-fresh-read-only-receipts';for(const slot of c.state.orders.filter(o=>o.orderId))await verifyReceipts(slot);
  const reverse=await read(c.config.reverseOrders[0].configFile),signerConfig=await read(reverse.baseSignerPrivateConfig),privateState=await read(reverse.stateFile);
  const sibling=(linux:string)=>{const prefix=reverse.baseSignerPrivateConfig.replaceAll('\\','/').match(/^(\/\/(?:wsl\.localhost|wsl\$)\/[^/]+)/)?.[1];return linux.startsWith('/')&&prefix?prefix+linux:linux;};
  const f1=c.state.orders[0],r2=c.state.orders[1],forwardBinding=(await c.worker.query('SELECT terms_payload FROM zee.base_bindings WHERE order_id=$1',[f1.orderId])).rows[0];
  const forwardTerms=c.r.keys.open(forwardBinding.terms_payload,`base-terms:${f1.orderId}:v1`) as any,reverseTerms=await escrowTerms(c.worker,c.r.keys,c.base,r2.orderId!);
  const sourceQuote=await repository.privateQuote(f1.orderId!,f1.owner) as any,payoutTerms=await reversePayoutTerms(c.worker,c.r.keys,r2.orderId!);
  if(reverse.recipient!==c.config.forwardOrders[0].refundRecipient||payoutTerms.recipient!==reverse.recipient||sourceQuote.refundRecipient!==reverse.recipient)throw Error('G5_ROUNDTRIP_SAME_USER_RECEIVER_REQUIRED');
  const journals=(await c.worker.query(`SELECT order_id,phase,signed_payload,'forward' AS kind FROM zee.base_attempts
   UNION ALL SELECT order_id,'COMMIT',signed_payload,'commit' FROM zee.escrow_commits
   UNION ALL SELECT order_id,'SETTLE',signed_payload,'settle' FROM zee.escrow_settlements`)).rows;
  if(journals.length!==(threeOrderRecovery?6:4))throw Error('G5_COMPLETED_RECOVERY_EXACT_RAW_JOURNALS_REQUIRED');
  for(const row of journals){
   const context=row.kind==='forward'?`base-signed:${row.order_id}:${row.phase}:v1`:`escrow-${row.kind}:${row.order_id}:v1`,signed=c.r.keys.open(row.signed_payload,context) as any;
   const ownBinding=threeOrderRecovery&&row.kind==='forward'?(await c.worker.query('SELECT terms_payload FROM zee.base_bindings WHERE order_id=$1',[row.order_id])).rows[0]:undefined;
   const id=row.kind==='forward'?(ownBinding?(c.r.keys.open(ownBinding.terms_payload,`base-terms:${row.order_id}:v1`) as any).id:forwardTerms.id):reverseTerms.id,journal=await read(sibling(signerConfig.journalRoot+'/'+createHash('sha256').update(id).digest('hex')+'.'+row.phase+'.tx.json'));
   if(journal.hash!==signed.hash||journal.raw!==signed.raw||journal.nonce!==signed.nonce||keccak256(signed.raw)!==signed.hash
    ||getAddress(await recoverTransactionAddress({serializedTransaction:signed.raw as TransactionSerialized}))!==getAddress(c.base.registry.operator))throw Error('G5_COMPLETED_RECOVERY_ORIGINAL_RAW_JOURNAL_MISMATCH');
  }
  const fundingJournal=await read(sibling('/home/albary/zeeswap-g5/refunds/payer-journal/'+createHash('sha256').update(reverseTerms.id).digest('hex')+'.user-funding.tx.json'));
  if(fundingJournal.hash!==reverse.fundingTransactionHash||keccak256(fundingJournal.raw)!==fundingJournal.hash
   ||!isDeepStrictEqual(fundingJournal.approved,{version:1,branchId:c.config.branchId,sequence:2,orderId:r2.orderId,funding:privateState.funding})
   ||getAddress(await recoverTransactionAddress({serializedTransaction:fundingJournal.raw as TransactionSerialized}))!==getAddress(reverseTerms.payer))throw Error('G5_COMPLETED_RECOVERY_PAYER_JOURNAL_MISMATCH');
  const nonces=await Promise.all([c.base.client.getTransactionCount({address:c.base.registry.operator,blockTag:'latest'}),c.base.client.getTransactionCount({address:c.base.registry.operator,blockTag:'pending'}),
   c.base.client.getTransactionCount({address:reverseTerms.payer,blockTag:'latest'}),c.base.client.getTransactionCount({address:reverseTerms.payer,blockTag:'pending'})]);
  if(threeOrderRecovery)requireG5F3Nonces(nonces);else if(JSON.stringify(nonces)!==JSON.stringify([9,9,7,7]))throw Error('G5_COMPLETED_RECOVERY_NONCE_MISMATCH');
  if(threeOrderRecovery){
   phase='f3-global-journals-and-unused-actors';
   const heads=await c.base.heads();
   for(const [root,signer,nextNonce] of [[signerConfig.journalRoot,c.base.registry.operator,11],['/home/albary/zeeswap-g5/refunds/payer-journal',reverseTerms.payer,7]] as const){
    const names=(await readdir(privateLocalPath(sibling(root)))).filter(n=>n.endsWith('.tx.json')).sort();journalListings.set(sibling(root),JSON.stringify(names));
    const seen=new Map<number,string>();for(const name of names){
     const original=await read(sibling(root+'/'+name));
     if(!Number.isSafeInteger(original.nonce)||original.nonce>=nextNonce||typeof original.raw!=='string'||keccak256(original.raw)!==original.hash||getAddress(await recoverTransactionAddress({serializedTransaction:original.raw as TransactionSerialized}))!==getAddress(signer)||seen.has(original.nonce)&&seen.get(original.nonce)!==original.hash)throw Error('G5_F3_UNKNOWN_GLOBAL_SIGNING_EFFECT');
     seen.set(original.nonce,original.hash);const chain=await c.base.client.getTransaction({hash:original.hash}),receipt=await c.base.client.getTransactionReceipt({hash:original.hash}),canonical=await c.base.client.getBlock({blockNumber:receipt.blockNumber});
     requireG5F3CanonicalGlobalRaw({original,parsed:parseTransaction(original.raw),chain,receipt,canonical,finalized:heads.finalized,signer});
     privatePins.set(sibling(root+'/'+name),createHash('sha256').update(JSON.stringify(original)).digest('hex'));
    }
   }
   if((await c.base.client.getBlock({blockNumber:heads.finalized.number})).hash!==heads.finalized.hash)throw Error('G5_F3_GLOBAL_FINALIZED_HEAD_CHANGED');
   for(const item of c.config.reverseOrders.slice(1)){
    const unused=await read(item.configFile),wallet=await read(unused.zcashPrivateConfig);
    if(unused.approvedDigest&&unused.approvedDigest!=='0'.repeat(64)||wallet.approvedDigest!=='0'.repeat(64))throw Error('G5_F3_UNUSED_REVERSE_ALREADY_APPROVED');
    for(const artifact of [unused.stateFile,wallet.journalPath,wallet.approvedRequest].filter(Boolean))await requireAbsent(artifact);
   }
  }
  const summary=await boundary(false,true);if(summary.settled!==(threeOrderRecovery?3:2)||summary.forward!==(threeOrderRecovery?2:1)||summary.reverse!==1||!threeOrderRecovery&&summary.actualBaseFeesWei!=='6491560000802')throw Error('G5_COMPLETED_RECOVERY_EXACT_FINAL_ACCOUNTING_REQUIRED');
  const physical=await read(c.config.balanceProofFile);if(physical.reverse.slice(1).some((w:any)=>w.pendingCalculatedTransactions!==0))throw Error('G5_COMPLETED_RECOVERY_UNKNOWN_SDK_CALCULATION');
  if(threeOrderRecovery)requireG5F3Nonces(await Promise.all([c.base.client.getTransactionCount({address:c.base.registry.operator,blockTag:'latest'}),c.base.client.getTransactionCount({address:c.base.registry.operator,blockTag:'pending'}),c.base.client.getTransactionCount({address:reverseTerms.payer,blockTag:'latest'}),c.base.client.getTransactionCount({address:reverseTerms.payer,blockTag:'pending'})]));
  await durable(c.config.stateFile+(r4QuoteRecovery?'.r4-empty-quote-recovery-':threeOrderRecovery?'.f3-scanner-recovery-':'.completed-recovery-')+randomUUID()+'.private.json',{version:1,runId:c.state.runId,observedAt:new Date().toISOString(),epoch:String(control.epoch),reason:r4QuoteRecovery?'R4_QUOTE_UNKNOWN_PROVEN_NO_EFFECT':threeOrderRecovery?'F3_SCANNER_READ_FAILURE_AFTER_ORIGINAL_PAY':'COMPLETED_FIRST_ROUNDTRIP_VERIFICATION_FRONTIER_RECONCILIATION',...(r4QuoteRecovery?{}:{diagnostic}),...summary,...(threeOrderRecovery?{controllerOriginal,booksIdentity}:{} )},true);
  await transaction(c.admin,async db=>{const current=(await db.query('SELECT * FROM zee.runtime_control FOR UPDATE')).rows[0];
   if(String(current.epoch)!==String(control.epoch)||current.accepting_orders||current.dispatch_enabled||current.reconciliation_required!==!r4QuoteRecovery
    ||(await db.query("SELECT count(*) AS n FROM zee.orders WHERE state='SETTLED'")).rows[0].n!==(threeOrderRecovery?'3':'2')
    ||(await db.query("SELECT count(*) AS n FROM zee.obligations WHERE state<>'DISCHARGED'")).rows[0].n!=='0'
    ||(await db.query('SELECT count(*) AS n FROM zee.reservations WHERE released_at IS NULL')).rows[0].n!=='0')throw Error('G5_COMPLETED_RECOVERY_STATE_CHANGED');
   if(threeOrderRecovery){
    if(JSON.stringify(await captureG5F3RecoveryBooks(db))!==booksIdentity||!isDeepStrictEqual(await read(controllerConfig.stateFile),controllerOriginal)||!isDeepStrictEqual(await read(rawSequence),controllerConfig)||g5Binding(await read(path))!==c.state.binding||!isDeepStrictEqual(await read(c.config.stateFile),c.state)||!r4QuoteRecovery&&!isDeepStrictEqual(await read(c.config.stateFile+'.diagnostic.private.json'),diagnostic))throw Error('G5_F3_RECOVERY_PROOF_CHANGED_AT_CAS');
    for(const [file,pin] of privatePins)if(createHash('sha256').update(JSON.stringify(await read(file))).digest('hex')!==pin)throw Error('G5_F3_PRIVATE_CONFIG_CHANGED_DURING_PROOF');
    for(const [root,names] of journalListings)if(JSON.stringify((await readdir(privateLocalPath(root))).filter(n=>n.endsWith('.tx.json')).sort())!==names)throw Error('G5_F3_GLOBAL_JOURNAL_LIST_CHANGED');
    for(const artifact of absentArtifacts)await requireAbsent(artifact);
    const currentPins=[];for(const pin of migrationPins)currentPins.push({name:pin.name,sha256:createHash('sha256').update(await readFile(new URL('../migrations/'+pin.name,import.meta.url))).digest('hex')});requireG5F3Migrations(books.migrations,currentPins);
   }
   if(!r4QuoteRecovery)await db.query('UPDATE zee.runtime_control SET reconciliation_required=false');});
  if(r4QuoteRecovery){await saveG5UnfundedR4QuoteLocal(controllerOriginal,{save:state=>durable(privateLocalPath(controllerConfig.stateFile),state),read:()=>read(controllerConfig.stateFile)});}
  else if(threeOrderRecovery){
   const saved=await saveG5F3RecoveryLocals(c.state,controllerOriginal,{saveMain:state=>durable(privateLocalPath(c.config.stateFile),state),saveController:state=>durable(privateLocalPath(controllerConfig.stateFile),state),readMain:()=>read(c.config.stateFile),readController:()=>read(controllerConfig.stateFile),refreeze:()=>transaction(c.admin,async db=>{
    const current=(await db.query('SELECT * FROM zee.runtime_control FOR UPDATE')).rows[0];if(String(current.epoch)!==String(control.epoch)||current.accepting_orders||current.dispatch_enabled)throw Error('G5_F3_LOCAL_SAVE_STATE_CHANGED');await db.query('UPDATE zee.runtime_control SET reconciliation_required=true');
   })});c.state.incident=saved.main.incident;c.state.orders[2].receiptVerified=false;
  }else try{c.state.incident=false;c.state.orders.forEach(o=>o.receiptVerified=true);await c.save();
  }catch(error){
   c.state.incident=true;await transaction(c.admin,async db=>{const current=(await db.query('SELECT * FROM zee.runtime_control FOR UPDATE')).rows[0];
    if(String(current.epoch)!==String(control.epoch)||current.accepting_orders||current.dispatch_enabled)throw Error('G5_COMPLETED_LOCAL_SAVE_STATE_CHANGED');
    await db.query('UPDATE zee.runtime_control SET reconciliation_required=true');});await c.save().catch(()=>{});
   throw error;
  }
  result={status:r4QuoteRecovery?'G5_R4_EMPTY_QUOTE_CONTROLLER_RECOVERED_PAUSED':threeOrderRecovery?'G5_F3_ORIGINAL_PAY_SCANNER_RECOVERED_PAUSED':'G5_COMPLETED_FIRST_ROUNDTRIP_RECOVERED_PAUSED',epoch:String(control.epoch),...summary,originalTransactionsPreserved:true,g5Complete:false,batchBarrierAdvanced:false,...(r4QuoteRecovery?{controllerStage:'REVERSE_QUOTE',databaseChanged:false,quoteCreated:false}:threeOrderRecovery?{controllerStage:'VERIFY',f3ReceiptVerified:false}:{} )};
 }else if(step==='close'){
  const summary=await boundary();if(summary.settled!==20||c.state.orders.some(o=>!o.verified))throw Error('G5_TWENTY_VERIFIED_ORDERS_REQUIRED');
  c.state.closed=true;await c.save();result={status:'G5_CLOSED',...summary};
 }else if(step==='barrier'){
  if(!c.state.batchSize||sequence!==(c.state.barriers?.length??0)*5+5||c.state.orders.length!==sequence)throw Error('G5_NEXT_FIVE_ORDER_BARRIER_REQUIRED');
  const batch=c.state.orders.slice(sequence-5,sequence);
  if(batch.some(o=>!o.orderId||!o.receiptVerified))throw Error('G5_EACH_RECEIPT_VERIFICATION_REQUIRED');
  for(const slot of batch)await verifyReceipts(slot);
  const summary=await boundary();for(const slot of batch){slot.verified=true;slot.verification=summary;}
  (c.state.barriers??=[]).push(sequence);await c.save();result={status:'G5_BATCH_VERIFIED',throughSequence:sequence,...summary};
 }else if(step==='roundtrip-checkpoint'){
  if(sequence!==2)throw Error('G5_FIRST_ROUNDTRIP_ONLY');requireG5RoundtripCheckpoint(c.state);
  for(const slot of c.state.orders)await verifyReceipts(slot);
  const reverse=await read(c.config.reverseOrders[0].configFile),payout=await reversePayoutTerms(c.worker,c.r.keys,c.state.orders[1].orderId!);
  const source=await repository.privateQuote(c.state.orders[0].orderId!,c.state.orders[0].owner) as any;
  if(reverse.recipient!==c.config.forwardOrders[0].refundRecipient||payout.recipient!==reverse.recipient||source.refundRecipient!==reverse.recipient)throw Error('G5_ROUNDTRIP_SAME_USER_RECEIVER_REQUIRED');
  const summary=await boundary();if(summary.settled!==2||summary.forward!==1||summary.reverse!==1)throw Error('G5_EXACT_ROUNDTRIP_SETTLEMENT_REQUIRED');
  // Deliberately leaves all five-order admission barriers and verified flags
  // unchanged. This is one two-direction milestone within the twenty-order run.
  await durable(c.config.stateFile+'.roundtrip-checkpoint.json',{version:1,runId:c.state.runId,throughSequence:2,...summary,g5Complete:false,batchBarrierAdvanced:false});
  result={status:'G5_ROUNDTRIP_CHECKPOINT',...summary,g5Complete:false,batchBarrierAdvanced:false};
 }else if(step==='start'){
  const existing=requireG5Next(c.state,sequence);
  let openingBoundary=false;
  if(!existing){
   if(!c.state.batchSize||sequence===1){await boundary(sequence===1&&c.state.orders.length===0);openingBoundary=true;}else await assertRunDatabase();
   c.state.orders.push({sequence,direction:g5Direction(sequence),owner:randomBytes(32).toString('base64url')});await c.save();
  }
  const slot=c.state.orders.find(o=>o.sequence===sequence)!;
  const policy=(await c.admin.query('SELECT reconciliation_required FROM zee.runtime_control')).rows[0];
  const initial=(await c.admin.query(`SELECT (SELECT count(*) FROM zee.quotes)+(SELECT count(*) FROM zee.orders)
   +(SELECT count(*) FROM zee.base_attempts)+(SELECT count(*) FROM zee.escrow_commits)+(SELECT count(*) FROM zee.reverse_payouts)
   +(SELECT count(*) FROM zee.escrow_settlements)+(SELECT count(*) FROM zee.operations)+(SELECT count(*) FROM zee.deposits) AS n`)).rows[0].n;
  if(policy.reconciliation_required){
   if(c.state.policyInitialized||c.state.incident||sequence!==1||c.state.orders.length!==1||slot.orderId||initial!=='0')throw Error('G5_EXPLICIT_RECONCILIATION_REQUIRED');
   // Only this empty first admission can initialize policy after the exact
   // opening allocation and full physical partition passed boundary().
   if(!openingBoundary)await boundary(true);c.state.policyInitialized=true;await c.save();
   await c.admin.query('UPDATE zee.runtime_control SET reconciliation_required=false');
  }
  if(slot.direction==='BASE_TO_ZCASH')result={status:'G5_REVERSE_SLOT_READY',sequence};
  else{
   await refresh();await assertRunDatabase();
   const refundRecipient=c.state.batchSize?c.config.forwardOrders.find((o:any)=>o.sequence===sequence).refundRecipient:c.config.forward.refundRecipient;
   if(!slot.receiver){slot.receiver=await c.r.wallet.allocate();await c.save();}
   const quotes=(await c.api.query('SELECT id FROM zee.quotes WHERE access_hash=$1',[accessHash(slot.owner)])).rows;
   if(quotes.length>1||(slot.orderId&&quotes[0]?.id!==slot.orderId))throw Error('G5_PRIVATE_QUOTE_RECOVERY_CONFLICT');
   if(!quotes.length){
    await c.admin.query('UPDATE zee.runtime_control SET accepting_orders=true');
    const q=await repository.issueQuote({direction:slot.direction,inputAmount:'100000',recipient:getAddress(c.config.forward.recipient),refundRecipient:await c.r.wallet.validate(refundRecipient),
     depositReceiver:slot.receiver,payoutFee:c.config.baseFeeBudget,refundFee:'10000',executionMode:'base-settlement-v1',baseContract:c.base.registry.contracts.ZeeSwapSettlement.address},slot.owner);
    slot.orderId=q.id;await c.save();
   }else{slot.orderId=quotes[0].id;await c.save();}
   const q=await repository.privateQuote(slot.orderId!,slot.owner) as any;
   if(q.inputAmount!=='100000'||q.outputAmount!=='100000'||q.recipient!==getAddress(c.config.forward.recipient)||q.refundRecipient!==refundRecipient||q.depositReceiver!==slot.receiver||q.payoutFee!==c.config.baseFeeBudget||q.refundFee!=='10000'||q.executionMode!=='base-settlement-v1')throw Error('G5_IMMUTABLE_QUOTE_MISMATCH');
   await c.admin.query('UPDATE zee.runtime_control SET accepting_orders=true');await repository.accept(slot.orderId!,slot.owner);
   const cutoff=(await c.admin.query('SELECT funding_cutoff_height FROM zee.orders WHERE id=$1',[slot.orderId])).rows[0].funding_cutoff_height;
   await durable(c.config.stateFile+'.funding-'+sequence+'.json',{orderId:slot.orderId,receiver:slot.receiver,memo:JSON.stringify({v:1,ref:q.reference}),amountZatoshi:'100000',maxFeeZatoshi:'10000',cutoffHeight:String(cutoff)});
   result={status:'AWAITING_SEPARATE_ONCE_ONLY_SOURCE_FUNDING',sequence};
  }
 }else{
  const already=step==='verify'?c.state.orders.find(o=>o.sequence===sequence&&o.verified):undefined;
  const slot=already??requireG5Next(c.state,sequence);if(!slot?.orderId)throw Error('G5_ACTIVE_ORDER_REQUIRED');
  if(step==='observe'||step==='dispatch'){
   if(slot.direction!=='ZCASH_TO_BASE')throw Error('G5_NAMED_REVERSE_OPERATOR_STEP_REQUIRED');
   await refresh();await assertRunDatabase();await reconcileBaseReceipts(c.worker,c.r.keys,c.base);
   const control=(await c.admin.query('SELECT reconciliation_required FROM zee.runtime_control')).rows[0];if(control.reconciliation_required)throw Error('G5_EXPLICIT_RECONCILIATION_REQUIRED');
   if(step==='dispatch'){
    const signer=await read(c.config.baseSignerClientPath),local=new LocalBaseSigner(signer.command,signer.args);await c.admin.query('UPDATE zee.runtime_control SET dispatch_enabled=true');
    result=await dispatchBaseOnce(c.worker,c.r.keys,c.base,{authorize:q=>local.authorize(q),prepare:async(q,phase)=>{await requireG5NonceReady(c.worker,c.r.keys,c.base,slot.orderId!,phase);return local.prepare(q,phase);}},refresh,slot.orderId);
   }else result={status:(await c.admin.query('SELECT state FROM zee.orders WHERE id=$1',[slot.orderId])).rows[0].state};
  }else if(step==='verify'){
   await verifyReceipts(slot);
   if(c.state.batchSize){
    await assertRunDatabase();if((await c.admin.query('SELECT reconciliation_required FROM zee.runtime_control')).rows[0].reconciliation_required)throw Error('G5_EXPLICIT_RECONCILIATION_REQUIRED');
    slot.receiptVerified=true;await c.save();result={status:'G5_ORDER_RECEIPTS_VERIFIED',sequence,barrierRequired:true};
   }else{const summary=await boundary();slot.verified=true;slot.verification=summary;await c.save();result={status:'G5_ORDER_VERIFIED',sequence,...summary};}
  }
 }
 console.log(JSON.stringify(result));
}catch(error){
 await durable(c.config.stateFile+(r4VerifyBindingRecovery?'.r4-verify-binding-recovery-diagnostic.private.json':r4PrecommitStartupRecovery?'.r4-precommit-startup-recovery-diagnostic.private.json':r4FundingWaitRecovery?'.r4-funding-wait-recovery-diagnostic.private.json':r4QuoteRecovery?'.r4-empty-quote-recovery-diagnostic.private.json':step==='recover-completed-roundtrip'?'.completed-recovery-diagnostic.private.json':step==='recover-f3-scanner'?'.f3-scanner-recovery-diagnostic.private.json':'.diagnostic.private.json'),g5Diagnostic(error,step,phase)).catch(()=>{});
 if(isObserverWait(error)||step==='recover-f3-scanner'&&(error as any)?.message==='G5_F3_ORIGINAL_PAY_FINALITY_PENDING'||r4FundingWaitRecovery&&['G5_R4_ORIGINAL_FUND_FINALITY_PENDING','G5_R4_ORIGINAL_COMMIT_FINALITY_PENDING'].includes((error as any)?.message)){console.log(JSON.stringify({status:isObserverWait(error)?'OBSERVER_WAIT':r4VerifyBindingRecovery?'AWAITING_ORIGINAL_COMMIT_FINALITY':r4FundingWaitRecovery?'AWAITING_ORIGINAL_FUND_FINALITY':'AWAITING_ORIGINAL_PAY_FINALITY'}));}
 else{
 if(!readOnly&&!c.state.incident){c.state.incident=true;await c.save().catch(()=>{});await c.admin.query('SELECT zee.enter_reconciliation()').catch(()=>{});}
 console.error('G5_OPERATOR_STOPPED_RECONCILE_ORIGINAL_ATTEMPTS');process.exitCode=1;}
}finally{try{await c.close(!readOnly);}finally{if(controllerLock){await controllerLock.close();await unlink(controllerLockPath!);}}}
