/** Dedicated G5 opening allocation; historical branch books never enter this run. */
import {parseAbi} from 'viem';
import {isDeepStrictEqual} from 'node:util';
import {transaction} from '../src/db.ts';
import {validateSnapshot} from '../src/observer.ts';
import {g5Capital,validateG5Accounts,validateG5OpeningLedger,requireG5CommandConfig,requireG5Operational} from '../src/g5-run.ts';
import {g5Context,read} from './g5-context.ts';
const [step,path]=process.argv.slice(2);if(step!=='bootstrap'||!path||process.argv.length!==4)throw Error('G5_BOOTSTRAP_CONFIG_REQUIRED');
const c=await g5Context(path,true);
try{
 requireG5Operational(c.state);
 await c.base.preflight();const proof=await read(c.config.capitalProofFile);
 if(proof.version!==1||proof.runId!==c.state.runId||!Array.isArray(proof.reverse)||proof.reverse.length!==10)throw Error('G5_CAPITAL_PROOF_REQUIRED');
 const identities=new Set<string>();
 const allocatedNotes:unknown[]=[];
 for(let i=0;i<10;i++){
  const p=proof.reverse[i],s=validateSnapshot(p.snapshot),o=s.outputs;
  if(p.sequence!==(i+1)*2||typeof p.receiver!=='string'||o.length!==1||o[0].receiver!==p.receiver||o[0].pool!=='ironwood'||!o[0].shieldedSource||o[0].amount!=='110000'||s.scannedHeight-o[0].height+1<10)throw Error('G5_EXACT_SHIELDED_CAPITAL_NOTE_REQUIRED');
  const identity=o[0].txid+':'+o[0].pool+':'+o[0].index;if(identities.has(identity))throw Error('G5_DUPLICATE_CAPITAL_NOTE');identities.add(identity);
  const operator=await read(c.config.reverseOrders[i].configFile),wallet=await read(operator.zcashPrivateConfig),approved=wallet.approvedCapitalNotes;
  requireG5CommandConfig(operator.zcashArgs,operator.zcashPrivateConfig);
  if(p.capitalUfvkSha256!==wallet.capitalUfvkSha256||p.receiver!==wallet.capitalReceiver||!Array.isArray(approved)||approved.length!==1
   ||approved[0].txid!==o[0].txid||approved[0].pool!==o[0].pool||approved[0].index!==o[0].index||approved[0].value!==o[0].amount)throw Error('G5_OPENING_WALLET_ALLOCATION_BINDING');
  if(!/^[0-9a-f]{64}$/.test(c.config.depositUfvkSha256))throw Error('G5_DEPOSIT_VIEW_IDENTITY_REQUIRED');
  allocatedNotes.push({sequence:p.sequence,receiver:p.receiver,txid:o[0].txid,index:o[0].index,pool:o[0].pool,amount:o[0].amount,height:o[0].height,blockHash:o[0].blockHash,ufvkSha256:wallet.capitalUfvkSha256,depositUfvkSha256:c.config.depositUfvkSha256});
 }
 if(c.state.openingCapital&&!isDeepStrictEqual(c.state.openingCapital,allocatedNotes))throw Error('G5_CAPITAL_ALLOCATION_CHANGED');
 if(!c.state.openingCapital){c.state.openingCapital=allocatedNotes;await c.save();}
 if(c.state.batchSize){
  const p=proof.extraFee,wallet=await read(c.config.extraFeeWalletConfig),s=validateSnapshot(p?.snapshot),o=s.outputs;
  if(o.length!==1||o[0].amount!=='30000'||!o[0].shieldedSource||o[0].pool!=='ironwood'||s.scannedHeight-o[0].height+1<10
   ||p.receiver!==o[0].receiver||p.receiver!==wallet.capitalReceiver||p.capitalUfvkSha256!==wallet.capitalUfvkSha256
   ||wallet.approvedCapitalNotes?.length!==1||wallet.approvedCapitalNotes[0].txid!==o[0].txid||wallet.approvedCapitalNotes[0].index!==o[0].index
   ||wallet.approvedCapitalNotes[0].pool!==o[0].pool||wallet.approvedCapitalNotes[0].value!=='30000')throw Error('G5_EXTRA_OPERATOR_FEE_CAPITAL_REQUIRED');
  const extra={receiver:p.receiver,pool:o[0].pool,txid:o[0].txid,index:o[0].index,amount:'30000',ufvkSha256:p.capitalUfvkSha256};
  if(c.state.extraFeeCapital&&!isDeepStrictEqual(c.state.extraFeeCapital,extra))throw Error('G5_EXTRA_FEE_ALLOCATION_CHANGED');
  c.state.extraFeeCapital=extra;await c.save();
 }
 const {finalized}=await c.base.heads(),address=c.base.registry.contracts.ZeeSwapSettlement.address;
 const [available,inventory,tokenBalance,escrowLiability,gas]=await Promise.all([
  c.base.client.readContract({address,abi:parseAbi(['function availableInventory() view returns(uint256)']),functionName:'availableInventory',blockNumber:finalized.number}),
  c.base.client.readContract({address,abi:parseAbi(['function inventory() view returns(uint256)']),functionName:'inventory',blockNumber:finalized.number}),
  c.base.client.readContract({address:c.base.registry.contracts.MockUSDC.address,abi:parseAbi(['function balanceOf(address) view returns(uint256)']),functionName:'balanceOf',args:[address],blockNumber:finalized.number}),
  c.base.client.readContract({address,abi:parseAbi(['function escrowLiability() view returns(uint256)']),functionName:'escrowLiability',blockNumber:finalized.number}),
  c.base.client.getBalance({address:c.base.registry.operator,blockNumber:finalized.number})]);
 if(available<1000000n||available!==inventory||tokenBalance!==inventory||escrowLiability!==0n||gas<300000000000000n||(await c.base.client.getBlock({blockNumber:finalized.number})).hash!==finalized.hash)throw Error('G5_PHYSICAL_CAPITAL_DEFICIT');
 if(c.state.openingPhysical&&(c.state.openingPhysical.inventory!==inventory.toString()||c.state.openingPhysical.operatorGas!==gas.toString()))throw Error('G5_OPENING_PHYSICAL_CHANGED');
 if(!c.state.openingPhysical){c.state.openingPhysical={blockNumber:finalized.number.toString(),blockHash:finalized.hash,inventory:inventory.toString(),operatorGas:gas.toString()};await c.save();}
 await transaction(c.admin,async db=>{
  const control=(await db.query('SELECT * FROM zee.runtime_control FOR UPDATE')).rows[0];if(control.accepting_orders||control.dispatch_enabled)throw Error('G5_BOOTSTRAP_MUST_BE_PAUSED');
  const occupied=(await db.query('SELECT (SELECT count(*) FROM zee.orders)+(SELECT count(*) FROM zee.quotes)+(SELECT count(*) FROM zee.deposits) AS n')).rows[0].n;
  if(occupied!=='0'||c.state.orders.length)throw Error('G5_EMPTY_BRANCH_REQUIRED');
  const rows=(await db.query('SELECT event_id,asset,bucket,amount::text FROM zee.ledger_entries')).rows;
  const accounts=(await db.query('SELECT asset,purpose,balance::text,reserved::text FROM zee.inventory_accounts FOR UPDATE')).rows;
  if(rows.length){validateG5OpeningLedger(rows,c.state.openingEventId,c.config.branchId);validateG5Accounts(accounts,0,0,'0',c.config.branchId);}
  else{
   if(accounts.length)throw Error('G5_UNJOURNALED_CAPITAL');
   for(const [asset,purpose,amount] of g5Capital(c.config.branchId)){
    await db.query('INSERT INTO zee.inventory_accounts(asset,purpose,balance,reserved) VALUES($1,$2,$3,0)',[asset,purpose,amount]);
    await db.query('INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount) VALUES($1,$2,$3,$4),($1,$2,$5,-$4::numeric)',[c.state.openingEventId,asset,purpose+':available',amount,purpose+':operator-capital']);
   }
  }
  const existing=(await db.query("SELECT contract_address FROM zee.assets WHERE id='mockUSDC'")).rows[0].contract_address;
  if(existing&&existing.toLowerCase()!==c.base.registry.contracts.MockUSDC.address.toLowerCase())throw Error('G5_TOKEN_BINDING_MISMATCH');
  await db.query("UPDATE zee.assets SET contract_address=$1 WHERE id='mockUSDC'",[c.base.registry.contracts.MockUSDC.address]);
 });
 await c.save();console.log(JSON.stringify({status:'G5_CAPITAL_RECONCILED_PAUSED',orders:20,reverseCapitalZatoshi:'1100000',allocatedMockUSDC:'1000000',allocatedBaseGasWei:'300000000000000'}));
}catch{if(!c.state.incident)await c.admin.query('SELECT zee.enter_reconciliation()').catch(()=>{});console.error('G5_CAPITAL_FAILED_RECONCILE');process.exitCode=1;}finally{await c.close();}
