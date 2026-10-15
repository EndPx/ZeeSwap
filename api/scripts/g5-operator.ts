/** Twenty explicit alternating PUBLIC-TESTNET orders. Every invocation ends paused.
 * Funding is performed separately by the operator; this script cannot mint or
 * source-fund. Durable attempts and independent signer journals retain identity.
 */
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {getAddress,parseAbi} from 'viem';
import {g5Context,read,durable} from './g5-context.ts';
import {g5Direction,requireG5Next,validateG5Accounts,validateG5OpeningLedger,validateG5PhysicalBase,validateG5WalletBalances,g5PathIdentity,requireG5CommandConfig} from '../src/g5-run.ts';
import {Repository} from '../src/repository.ts';
import {accessHash} from '../src/private-data.ts';
import {scanOnce,validateSnapshot} from '../src/observer.ts';
import {refreshReverseObservers} from '../src/reverse-observer-refresh.ts';
import {dispatchBaseOnce,reconcileBaseReceipts} from '../src/base-settlement.ts';
import {LocalBaseSigner} from '../src/base-signer.ts';
import {escrowTerms,escrowState,finalizedReceipt,escrowEvents} from '../src/base-escrow.ts';
import {LocalReverseWalletAdapter} from '../src/reverse-wallet-adapter.ts';
import {reversePayoutTerms} from '../src/reverse-settlement.ts';
const [step,path,rawSequence]=process.argv.slice(2),sequence=Number(rawSequence);
if(!['start','observe','dispatch','verify','status','close'].includes(step)||!path||process.argv.length>5)throw Error('G5_EXPLICIT_STEP_CONFIG_SEQUENCE_REQUIRED');
const c=await g5Context(path),repository=new Repository(c.api,c.r.keys);
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
 if(rows.filter(o=>o.state!=='SETTLED').length>1||rows.some(o=>!known.has(o.id)))throw Error('G5_ONE_OUTSTANDING_ORDER');
 const exceptions=(await c.admin.query("SELECT count(*) AS n FROM zee.obligations WHERE order_id IS NULL AND state<>'DISCHARGED'")).rows[0].n;
 if(exceptions!=='0')throw Error('G5_UNMATCHED_FUNDS_RECONCILE');
 const unbalanced=(await c.admin.query('SELECT event_id,asset FROM zee.ledger_entries GROUP BY event_id,asset HAVING sum(amount)<>0')).rows;
 if(unbalanced.length)throw Error('G5_UNBALANCED_LEDGER');
 const opening=(await c.admin.query('SELECT event_id,asset,bucket,amount::text FROM zee.ledger_entries WHERE event_id=$1',[c.state.openingEventId])).rows;
 validateG5OpeningLedger(opening,c.state.openingEventId);
 return rows;
}
async function boundary(allowEmptyOpening=false){
 const orders=await assertRunDatabase();if(orders.some(o=>o.state!=='SETTLED'))throw Error('G5_SETTLEMENT_BOUNDARY_REQUIRED');
 const policy=(await c.admin.query('SELECT reconciliation_required FROM zee.runtime_control')).rows[0];
 if(policy.reconciliation_required&&!(allowEmptyOpening&&!c.state.policyInitialized&&!c.state.incident&&!orders.length
  &&(await c.admin.query('SELECT count(*) AS n FROM zee.quotes')).rows[0].n==='0'))throw Error('G5_EXPLICIT_RECONCILIATION_REQUIRED');
 const forwards=c.state.orders.filter(o=>o.orderId&&orders.some(row=>row.id===o.orderId)&&o.direction==='ZCASH_TO_BASE').length;
 const reverse=orders.length-forwards;
 const fees=(await c.admin.query(`SELECT COALESCE(sum(actual_fee),0)::text AS n FROM (
 SELECT actual_fee FROM zee.base_attempts WHERE confirmed UNION ALL SELECT actual_fee FROM zee.escrow_commits WHERE confirmed UNION ALL SELECT actual_fee FROM zee.escrow_settlements WHERE confirmed) AS x`)).rows[0].n;
 const accounts=(await c.admin.query('SELECT asset,purpose,balance::text,reserved::text FROM zee.inventory_accounts')).rows;
 validateG5Accounts(accounts,forwards,reverse,fees);
 if((await c.admin.query('SELECT count(*) AS n FROM zee.reservations WHERE released_at IS NULL')).rows[0].n!=='0'
  ||(await c.admin.query("SELECT count(*) AS n FROM zee.obligations WHERE state<>'DISCHARGED'")).rows[0].n!=='0')throw Error('G5_BOUNDARY_OBLIGATIONS_REMAIN');
 const proceeds=(await c.admin.query("SELECT asset,sum(amount)::text AS n FROM zee.ledger_entries WHERE bucket='operator:unreconciled' GROUP BY asset")).rows;
 for(const [asset,count] of [['TAZ',forwards],['mockUSDC',reverse]] as const)if(BigInt(proceeds.find(r=>r.asset===asset)?.n??'0')!==BigInt(count)*100000n)throw Error('G5_SOURCE_PROCEEDS_MISMATCH');
 if(!c.state.openingPhysical)throw Error('G5_PINNED_PHYSICAL_OPENING_REQUIRED');
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
 await new Promise<void>((resolve,reject)=>{
  const child=spawn(c.config.balanceProofCommand,c.config.balanceProofArgs,{stdio:['ignore','pipe','pipe'],windowsHide:true});let size=0;
  const timer=setTimeout(()=>{child.kill();reject(Error('G5_PHYSICAL_CAPTURE_TIMEOUT'));},300000);
  child.on('error',()=>{clearTimeout(timer);reject(Error('G5_PHYSICAL_CAPTURE_FAILED'));});child.stdout.on('data',b=>{size+=b.length;if(size>32768)child.kill();});child.stderr.on('data',()=>{});
  child.on('close',code=>{clearTimeout(timer);if(code===0&&size<=32768)resolve();else reject(Error('G5_PHYSICAL_CAPTURE_FAILED'));});
 });
 const deposits=(await c.admin.query("SELECT * FROM zee.deposits WHERE network='zcash-testnet'")).rows;
 const source=validateSnapshot(await c.r.wallet.snapshot(deposits.map(d=>Number(d.block_height))));
 const forwardNotes=source.outputs.map(o=>{
  const identity=JSON.stringify(['zcash-testnet',o.txid,o.pool,o.index]),row=deposits.find(d=>d.identity_hash.equals(c.r.keys.lookup('deposit',identity)));
  if(!row||!row.confirmed_at||row.classification!=='EXACT'||row.amount!=='100000'||o.amount!=='100000'||!o.shieldedSource
   ||row.block_hash!==o.blockHash||Number(row.block_height)!==o.height||source.scannedHeight-o.height+1<10)throw Error('G5_CANONICAL_SOURCE_PROCEEDS_MISMATCH');
  return {pool:o.pool,txid:o.txid,index:o.index,value:o.amount};
 });
 if(forwardNotes.length!==forwards||deposits.length!==forwards)throw Error('G5_CANONICAL_SOURCE_COUNT_MISMATCH');
 validateG5WalletBalances(await read(c.config.balanceProofFile),c.state,forwardNotes,reverse);
 return {settled:orders.length,forward:forwards,reverse,actualBaseFeesWei:fees,ledgerBalanced:true,unexplainedDeficits:0};
}
try{
 await c.base.preflight();await c.admin.query('UPDATE zee.runtime_control SET accepting_orders=false,dispatch_enabled=false');
 let result:unknown;
 if(step==='status'){
  await assertRunDatabase();result={status:'G5_PAUSED',slots:c.state.orders.length,verified:c.state.orders.filter(o=>o.verified).length};
 }else if(step==='close'){
  const summary=await boundary();if(summary.settled!==20||c.state.orders.some(o=>!o.verified))throw Error('G5_TWENTY_VERIFIED_ORDERS_REQUIRED');
  c.state.closed=true;await c.save();result={status:'G5_CLOSED',...summary};
 }else if(step==='start'){
  const existing=requireG5Next(c.state,sequence);
  if(!existing){
   await boundary(sequence===1&&c.state.orders.length===0);c.state.orders.push({sequence,direction:g5Direction(sequence),owner:randomBytes(32).toString('base64url')});await c.save();
  }
  const slot=c.state.orders.at(-1)!;
  const policy=(await c.admin.query('SELECT reconciliation_required FROM zee.runtime_control')).rows[0];
  const initial=(await c.admin.query(`SELECT (SELECT count(*) FROM zee.quotes)+(SELECT count(*) FROM zee.orders)
   +(SELECT count(*) FROM zee.base_attempts)+(SELECT count(*) FROM zee.escrow_commits)+(SELECT count(*) FROM zee.reverse_payouts)
   +(SELECT count(*) FROM zee.escrow_settlements)+(SELECT count(*) FROM zee.operations)+(SELECT count(*) FROM zee.deposits) AS n`)).rows[0].n;
  if(policy.reconciliation_required){
   if(c.state.policyInitialized||c.state.incident||sequence!==1||c.state.orders.length!==1||slot.orderId||initial!=='0')throw Error('G5_EXPLICIT_RECONCILIATION_REQUIRED');
   // Only this empty first admission can initialize policy after the exact
   // opening allocation and full physical partition passed boundary().
   await boundary(true);c.state.policyInitialized=true;await c.save();
   await c.admin.query('UPDATE zee.runtime_control SET reconciliation_required=false');
  }
  if(slot.direction==='BASE_TO_ZCASH')result={status:'G5_REVERSE_SLOT_READY',sequence};
  else{
   await refresh();await assertRunDatabase();
   if(!slot.receiver){slot.receiver=await c.r.wallet.allocate();await c.save();}
   const quotes=(await c.api.query('SELECT id FROM zee.quotes WHERE access_hash=$1',[accessHash(slot.owner)])).rows;
   if(quotes.length>1||(slot.orderId&&quotes[0]?.id!==slot.orderId))throw Error('G5_PRIVATE_QUOTE_RECOVERY_CONFLICT');
   if(!quotes.length){
    await c.admin.query('UPDATE zee.runtime_control SET accepting_orders=true');
    const q=await repository.issueQuote({direction:slot.direction,inputAmount:'100000',recipient:getAddress(c.config.forward.recipient),refundRecipient:await c.r.wallet.validate(c.config.forward.refundRecipient),
     depositReceiver:slot.receiver,payoutFee:c.config.baseFeeBudget,refundFee:'10000',executionMode:'base-settlement-v1',baseContract:c.base.registry.contracts.ZeeSwapSettlement.address},slot.owner);
    slot.orderId=q.id;await c.save();
   }else{slot.orderId=quotes[0].id;await c.save();}
   const q=await repository.privateQuote(slot.orderId!,slot.owner) as any;
   if(q.inputAmount!=='100000'||q.outputAmount!=='100000'||q.recipient!==getAddress(c.config.forward.recipient)||q.refundRecipient!==c.config.forward.refundRecipient||q.depositReceiver!==slot.receiver||q.payoutFee!==c.config.baseFeeBudget||q.refundFee!=='10000'||q.executionMode!=='base-settlement-v1')throw Error('G5_IMMUTABLE_QUOTE_MISMATCH');
   await c.admin.query('UPDATE zee.runtime_control SET accepting_orders=true');await repository.accept(slot.orderId!,slot.owner);
   await durable(c.config.stateFile+'.funding-'+sequence+'.json',{orderId:slot.orderId,receiver:slot.receiver,memo:JSON.stringify({v:1,ref:q.reference}),amountZatoshi:'100000',maxFeeZatoshi:'10000'});
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
    const signer=await read(c.config.baseSignerClientPath);await c.admin.query('UPDATE zee.runtime_control SET dispatch_enabled=true');
    result=await dispatchBaseOnce(c.worker,c.r.keys,c.base,new LocalBaseSigner(signer.command,signer.args),refresh);
   }else result={status:(await c.admin.query('SELECT state FROM zee.orders WHERE id=$1',[slot.orderId])).rows[0].state};
  }else if(step==='verify'){
   await refresh();await reconcileBaseReceipts(c.worker,c.r.keys,c.base);
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
    const config=await read(c.config.reverseOrders.find((o:any)=>o.sequence===sequence).configFile),privateState=await read(config.stateFile);
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
   const summary=await boundary();slot.verified=true;slot.verification=summary;await c.save();result={status:'G5_ORDER_VERIFIED',sequence,...summary};
  }
 }
 console.log(JSON.stringify(result));
}catch{
 c.state.incident=true;await c.save().catch(()=>{});
 await c.admin.query('SELECT zee.enter_reconciliation()').catch(()=>{});console.error('G5_OPERATOR_STOPPED_RECONCILE_ORIGINAL_ATTEMPTS');process.exitCode=1;
}finally{await c.close();}
