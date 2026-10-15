/** Twenty explicit alternating PUBLIC-TESTNET orders. Every invocation ends paused.
 * Funding is performed separately by the operator; this script cannot mint or
 * source-fund. Durable attempts and independent signer journals retain identity.
 */
import {randomBytes,randomUUID} from 'node:crypto';
import {access} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {getAddress,parseAbi} from 'viem';
import {g5Context,read,durable,privateLocalPath} from './g5-context.ts';
import {g5Direction,requireG5Next,requireG5Operational,requireG5EmptyOpeningRecovery,requireG5RoundtripCheckpoint,validateG5Accounts,validateG5OpeningLedger,validateG5PhysicalBase,validateG5WalletBalances,g5PathIdentity,requireG5CommandConfig} from '../src/g5-run.ts';
import {Repository} from '../src/repository.ts';
import {accessHash} from '../src/private-data.ts';
import {scanOnce,validateSnapshot} from '../src/observer.ts';
import {refreshReverseObservers} from '../src/reverse-observer-refresh.ts';
import {dispatchBaseOnce,reconcileBaseReceipts} from '../src/base-settlement.ts';
import {LocalBaseSigner} from '../src/base-signer.ts';
import {escrowTerms,escrowState,finalizedReceipt,escrowEvents} from '../src/base-escrow.ts';
import {LocalReverseWalletAdapter} from '../src/reverse-wallet-adapter.ts';
import {reversePayoutTerms} from '../src/reverse-settlement.ts';
import {requireG5NonceReady} from '../src/g5-nonce.ts';
import {g5Diagnostic} from '../src/g5-diagnostic.ts';
const [step,path,rawSequence]=process.argv.slice(2),sequence=Number(rawSequence);
if(!['start','observe','dispatch','verify','barrier','roundtrip-checkpoint','recover-empty-opening','status','diagnose','close'].includes(step)||!path||process.argv.length>5)throw Error('G5_EXPLICIT_STEP_CONFIG_SEQUENCE_REQUIRED');
const c=await g5Context(path),repository=new Repository(c.api,c.r.keys);
const readOnly=step==='status'||step==='diagnose';let phase='startup';
async function requireAbsent(path:string){
 try{await access(privateLocalPath(path));}catch(error){if((error as any).code==='ENOENT')return;throw error;}
 throw Error('G5_PRIOR_SIGNING_OR_FUNDING_ARTIFACT_REQUIRES_RECONCILIATION');
}
async function refresh(){
 const references=(await c.worker.query("SELECT DISTINCT block_height::text FROM zee.deposits WHERE network='zcash-testnet' UNION SELECT block_height::text FROM zee.reverse_payouts WHERE confirmed")).rows;
 const snapshot=await c.r.wallet.snapshot(references.map(r=>Number(r.block_height)));
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
async function boundary(allowEmptyOpening=false){
 phase='boundary-database';
 const orders=await assertRunDatabase();if(orders.some(o=>o.state!=='SETTLED'))throw Error('G5_SETTLEMENT_BOUNDARY_REQUIRED');
 const policy=(await c.admin.query('SELECT reconciliation_required FROM zee.runtime_control')).rows[0];
 if(policy.reconciliation_required&&!(allowEmptyOpening&&!c.state.policyInitialized&&(!c.state.incident||step==='diagnose'||step==='recover-empty-opening')&&!orders.length
  &&(await c.admin.query('SELECT count(*) AS n FROM zee.quotes')).rows[0].n==='0'))throw Error('G5_EXPLICIT_RECONCILIATION_REQUIRED');
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
 const {finalized}=await c.base.heads();const address=c.base.registry.contracts.ZeeSwapSettlement.address;
 const [available,inventory,tokenBalance,escrowLiability,gas]=await Promise.all([
  c.base.client.readContract({address,abi:parseAbi(['function availableInventory() view returns(uint256)']),functionName:'availableInventory',blockNumber:finalized.number}),
  c.base.client.readContract({address,abi:parseAbi(['function inventory() view returns(uint256)']),functionName:'inventory',blockNumber:finalized.number}),
  c.base.client.readContract({address:c.base.registry.contracts.MockUSDC.address,abi:parseAbi(['function balanceOf(address) view returns(uint256)']),functionName:'balanceOf',args:[address],blockNumber:finalized.number}),
  c.base.client.readContract({address,abi:parseAbi(['function escrowLiability() view returns(uint256)']),functionName:'escrowLiability',blockNumber:finalized.number}),
  c.base.client.getBalance({address:c.base.registry.operator,blockNumber:finalized.number})]);
 validateG5PhysicalBase(c.state.openingPhysical,forwards,reverse,fees,{inventory:inventory.toString(),available:available.toString(),tokenBalance:tokenBalance.toString(),escrowLiability:escrowLiability.toString(),gas:gas.toString()});
 if((await c.base.client.getBlock({blockNumber:BigInt(c.state.openingPhysical.blockNumber)})).hash!==c.state.openingPhysical.blockHash
  ||(await c.base.client.getBlock({blockNumber:finalized.number})).hash!==finalized.hash)throw Error('G5_PINNED_PHYSICAL_BLOCK_CHANGED');
 if(typeof c.config.balanceProofCommand!=='string'||!Array.isArray(c.config.balanceProofArgs)||!c.config.balanceProofFile)throw Error('G5_FIXED_BALANCE_CAPTURE_REQUIRED');
 phase='boundary-wallet-config-binding';
 requireG5CommandConfig(c.config.balanceProofArgs,c.config.balanceCaptureConfigFile);
 const capture=await read(c.config.balanceCaptureConfigFile);
 const capturedView=await read(capture.deposit?.config),actualView=await read(c.config.walletConfig);
 // Windows's local scanner invokes WSL and uses Windows proto/lock paths;
 // the Linux capture config has direct CLI/proto paths. They must identify the
 // same wallet and the same scanner sentinel through the mounted filesystem.
 if(capture.runId!==c.state.runId||capture.reverse?.length!==10||g5PathIdentity(capturedView.walletDir)!==g5PathIdentity(actualView.walletDir)
  ||g5PathIdentity(capturedView.lockPath)!==g5PathIdentity(actualView.lockPath)||capture.deposit?.ufvkSha256!==c.config.depositUfvkSha256)throw Error('G5_PHYSICAL_CAPTURE_CONFIG_BINDING');
 for(let i=0;i<10;i++){
  const operator=await read(c.config.reverseOrders[i].configFile);requireG5CommandConfig(operator.zcashArgs,operator.zcashPrivateConfig);
  if(capture.reverse[i].sequence!==c.config.reverseOrders[i].sequence||g5PathIdentity(capture.reverse[i].config)!==g5PathIdentity(operator.zcashPrivateConfig))throw Error('G5_PHYSICAL_CAPTURE_CONFIG_BINDING');
 }
 if(c.state.batchSize&&g5PathIdentity(capture.feeCapital?.config)!==g5PathIdentity(c.config.extraFeeWalletConfig))throw Error('G5_PHYSICAL_FEE_CAPTURE_CONFIG_BINDING');
 phase='boundary-wallet-capture';
 await new Promise<void>((resolve,reject)=>{
  const child=spawn(c.config.balanceProofCommand,c.config.balanceProofArgs,{stdio:['ignore','pipe','pipe'],windowsHide:true});let size=0;
  const timer=setTimeout(()=>{child.kill();reject(Error('G5_PHYSICAL_CAPTURE_TIMEOUT'));},300000);
  child.on('error',()=>{clearTimeout(timer);reject(Error('G5_PHYSICAL_CAPTURE_FAILED'));});child.stdout.on('data',b=>{size+=b.length;if(size>32768)child.kill();});child.stderr.on('data',()=>{});
  child.on('close',code=>{clearTimeout(timer);if(code===0&&size<=32768)resolve();else reject(Error('G5_PHYSICAL_CAPTURE_FAILED'));});
 });
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
    const binding=(await c.worker.query('SELECT terms_payload FROM zee.base_bindings WHERE order_id=$1',[slot.orderId])).rows[0];
    const terms=c.r.keys.open(binding.terms_payload,`base-terms:${slot.orderId}:v1`) as any;
    const attempts=(await c.worker.query('SELECT * FROM zee.base_attempts WHERE order_id=$1',[slot.orderId])).rows;
    if(attempts.length!==2)throw Error('G5_EXACT_FORWARD_ATTEMPTS_REQUIRED');
    for(const a of attempts){const signed=c.r.keys.open(a.signed_payload,`base-signed:${slot.orderId}:${a.phase}:v1`) as any;if(!a.confirmed||!await c.base.receipt(signed.hash,a.phase,terms))throw Error('G5_FINAL_FORWARD_RECEIPT_MISSING');}
   }else{
    const config=await read(c.config.reverseOrders.find((o:any)=>o.sequence===slot.sequence).configFile),privateState=await read(config.stateFile);
    if(privateState.orderId!==slot.orderId||privateState.owner!==slot.owner)throw Error('G5_REVERSE_STATE_BINDING');
    const terms=await escrowTerms(c.worker,c.r.keys,c.base,slot.orderId);if(await escrowState(c.base,terms,(await c.base.heads()).finalized.number)!==6)throw Error('G5_FINAL_ESCROW_REQUIRED');
    const source=await finalizedReceipt(c.base,config.fundingTransactionHash);
    if(!source||escrowEvents(c.base,source.receipt,'Funded').filter((e:any)=>e.args.id===terms.id&&e.args.amount===100000n&&getAddress(e.args.payer)===getAddress(terms.payer)).length!==1)throw Error('G5_FINAL_REVERSE_SOURCE_RECEIPT_REQUIRED');
    for(const [table,phase,context] of [['escrow_commits','COMMIT','escrow-commit'],['escrow_settlements','SETTLE','escrow-settle']] as const){
     const a=(await c.worker.query(`SELECT * FROM zee.${table} WHERE order_id=$1`,[slot.orderId])).rows[0];
     if(!a?.confirmed)throw Error('G5_FINAL_REVERSE_BASE_ATTEMPT_REQUIRED');const signed=c.r.keys.open(a.signed_payload,`${context}:${slot.orderId}:v1`) as any;
     const proof=await finalizedReceipt(c.base,signed.hash),eventName=phase==='COMMIT'?'PayoutCommitted':'EscrowSettled';
     if(!proof||escrowEvents(c.base,proof.receipt,eventName).filter((event:any)=>event.args.id===terms.id).length!==1)throw Error('G5_FINAL_REVERSE_BASE_RECEIPT_REQUIRED');
    }
    const a=(await c.worker.query('SELECT * FROM zee.reverse_payouts WHERE order_id=$1',[slot.orderId])).rows[0],prepared=c.r.keys.open(a.signed_payload,`reverse-payout:${slot.orderId}:v1`) as any;
    const wallet=new LocalReverseWalletAdapter(config.zcashCommand,config.zcashArgs,config.approvedDigest),termsZ=await reversePayoutTerms(c.worker,c.r.keys,slot.orderId);
    await wallet.verifyPrepared(prepared,termsZ);const delivery=await wallet.receipt(prepared,termsZ);
    if(!a.confirmed||!delivery||delivery.tipHeight-delivery.blockHeight+1<10||delivery.amountZatoshi!=='100000')throw Error('G5_FINAL_SHIELDED_RECEIPT_REQUIRED');
   }
}

try{
 if(!readOnly&&step!=='recover-empty-opening')requireG5Operational(c.state);
 phase='base-preflight';await c.base.preflight();if(!readOnly&&step!=='recover-empty-opening')await c.admin.query('UPDATE zee.runtime_control SET accepting_orders=false,dispatch_enabled=false');
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
 }else if(step==='close'){
  const summary=await boundary();if(summary.settled!==20||c.state.orders.some(o=>!o.verified))throw Error('G5_TWENTY_VERIFIED_ORDERS_REQUIRED');
  c.state.closed=true;await c.save();result={status:'G5_CLOSED',...summary};
 }else if(step==='barrier'){
  if(!c.state.batchSize||sequence!==(c.state.barriers?.length??0)*5+5||c.state.orders.length!==sequence)throw Error('G5_NEXT_FIVE_ORDER_BARRIER_REQUIRED');
  const batch=c.state.orders.slice(sequence-5,sequence);
  if(batch.some(o=>!o.orderId||!o.receiptVerified))throw Error('G5_EACH_RECEIPT_VERIFICATION_REQUIRED');
  await refresh();await reconcileBaseReceipts(c.worker,c.r.keys,c.base);for(const slot of batch)await verifyReceipts(slot);
  const summary=await boundary();for(const slot of batch){slot.verified=true;slot.verification=summary;}
  (c.state.barriers??=[]).push(sequence);await c.save();result={status:'G5_BATCH_VERIFIED',throughSequence:sequence,...summary};
 }else if(step==='roundtrip-checkpoint'){
  if(sequence!==2)throw Error('G5_FIRST_ROUNDTRIP_ONLY');requireG5RoundtripCheckpoint(c.state);
  await refresh();await reconcileBaseReceipts(c.worker,c.r.keys,c.base);for(const slot of c.state.orders)await verifyReceipts(slot);
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
   await refresh();await reconcileBaseReceipts(c.worker,c.r.keys,c.base);
   await verifyReceipts(slot);
   if(c.state.batchSize){
    await assertRunDatabase();if((await c.admin.query('SELECT reconciliation_required FROM zee.runtime_control')).rows[0].reconciliation_required)throw Error('G5_EXPLICIT_RECONCILIATION_REQUIRED');
    slot.receiptVerified=true;await c.save();result={status:'G5_ORDER_RECEIPTS_VERIFIED',sequence,barrierRequired:true};
   }else{const summary=await boundary();slot.verified=true;slot.verification=summary;await c.save();result={status:'G5_ORDER_VERIFIED',sequence,...summary};}
  }
 }
 console.log(JSON.stringify(result));
}catch(error){
 await durable(c.config.stateFile+'.diagnostic.private.json',g5Diagnostic(error,step,phase)).catch(()=>{});
 if(!readOnly&&!c.state.incident){c.state.incident=true;await c.save().catch(()=>{});await c.admin.query('SELECT zee.enter_reconciliation()').catch(()=>{});}
 console.error('G5_OPERATOR_STOPPED_RECONCILE_ORIGINAL_ATTEMPTS');process.exitCode=1;
}finally{await c.close(!readOnly);}
