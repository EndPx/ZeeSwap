/** One private, bounded public-testnet forward experiment. No setup minting. */
import { randomBytes,randomUUID,createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve,relative,isAbsolute } from 'node:path';
import assert from 'node:assert/strict';
import { getAddress,parseAbi,zeroAddress } from 'viem';
import { connect,transaction } from '../src/db.ts';
import { createApi } from '../src/http-api.ts';
import { BaseContract,loadBaseRegistry } from '../src/base-contract.ts';
import { LocalBaseSigner,type PreparedBaseTransaction } from '../src/base-signer.ts';
import { dispatchBaseOnce,reconcileBaseReceipts } from '../src/base-settlement.ts';
import { baseHead,ingestSnapshot,validateSnapshot } from '../src/observer.ts';
import { runtime } from './runtime.ts';
import { requireDevelopment } from './config.ts';
import { filterHistorical,validateCapital,savePrivate,readPrivate,type HistoricalOutput } from './live-forward-state.ts';

const root=fileURLToPath(new URL('../../.deploy-local/',import.meta.url));
const configPath=resolve(process.env.ZEE_FORWARD_CONFIG||resolve(root,'live-forward-config.json'));
function privatePath(path:string){const absolute=resolve(path),rel=relative(root,absolute);if(rel.startsWith('..')||isAbsolute(rel))throw Error('PRIVATE_PATH_REQUIRED');return absolute;}
const command=process.argv[2];if(!['prepare','observe','dispatch','status','close'].includes(command))throw Error('Use prepare, observe, dispatch, status or close');
const config=await readPrivate(privatePath(configPath));
for(const field of ['adminConfigPath','runtimeConfigPath','walletConfigPath','capitalProofPath','experimentPath','baseSignerClientPath'])config[field]=privatePath(config[field]);
process.env.ZEE_DB_CONFIG=config.adminConfigPath;process.env.ZEE_RUNTIME_CONFIG=config.runtimeConfigPath;process.env.ZEE_WALLET_CONFIG=config.walletConfigPath;
const db=requireDevelopment();
if(db.branchId!=='br-crimson-river-aobpimyq'||db.branchName!=='zeeswap-g4-live-forward')throw Error('DEDICATED_LIVE_BRANCH_REQUIRED');
const r=await runtime(true),expected='ep-winter-frog-ao0z5ayy-pooler.c-2.ap-southeast-1.aws.neon.tech';
if([r.apiUrl,r.workerUrl].some(url=>new URL(url).hostname!==expected))throw Error('RUNTIME_BRANCH_MISMATCH');
const base=new BaseContract(loadBaseRegistry()),recipient=getAddress(config.recipient);
if(recipient===zeroAddress||recipient===getAddress(base.registry.operator)||recipient===getAddress(base.registry.deployer)||recipient===getAddress(base.registry.contracts.ZeeSwapSettlement.address))throw Error('SEPARATE_RECIPIENT_REQUIRED');
if(config.baseFeeBudget!=='100000000000000'||typeof config.refundRecipient!=='string'||!Array.isArray(config.historicalOutputs))throw Error('BOUNDED_CONFIGURATION_REQUIRED');
const historical=config.historicalOutputs as HistoricalOutput[];
if(historical.length!==2||historical.some(o=>!/^[0-9a-f]{64}$/.test(o.txid)||!['ironwood','orchard'].includes(o.pool)
 ||!Number.isSafeInteger(o.index)||o.index<0||!Number.isSafeInteger(o.height)||o.height<=0||!/^[1-9][0-9]*$/.test(o.amount)))throw Error('AUDITED_TWO_HISTORICAL_OUTPUTS_REQUIRED');
const binding=createHash('sha256').update(JSON.stringify({branchId:db.branchId,recipient,refundRecipient:config.refundRecipient,historical,baseFeeBudget:config.baseFeeBudget,
 token:base.registry.contracts.MockUSDC.address,settlement:base.registry.contracts.ZeeSwapSettlement.address})).digest('hex');
const admin=connect(db.adminUrl),worker=connect(r.workerUrl),api=connect(r.apiUrl);
const server=createApi({pool:api,keys:r.keys,wallet:r.wallet,integrationOnly:true,baseFeeBudget:config.baseFeeBudget,base});
let origin='',experiment:any,started=false;
async function call(endpoint:string,method='GET',body?:unknown){
 const response=await fetch(origin+endpoint,{method,headers:{authorization:`Bearer ${experiment.token}`,'content-type':'application/json','idempotency-key':experiment.key},body:body===undefined?undefined:JSON.stringify(body)});
 const result=await response.json() as any;if(!response.ok)throw Error(`FORWARD_HTTP_${response.status}_${result.error}`);return result;
}
async function refresh(){
 const rows=(await worker.query("SELECT DISTINCT block_height::text FROM zee.deposits WHERE network='zcash-testnet'")).rows;
 const snapshot=validateSnapshot(await r.wallet.snapshot([...new Set([...rows.map(row=>Number(row.block_height)),...historical.map(o=>o.height)])]));
 const zcash=await ingestSnapshot(worker,r.keys,filterHistorical(snapshot,historical));
 const heads=await baseHead(worker,base.registry.rpcUrl);
 return {zcash,base:heads};
}
async function capital(scannedHeight:number,bootstrap=false){
 const health=await base.preflight(),{finalized}=await base.heads();
 const address=base.registry.contracts.ZeeSwapSettlement.address;
 const [inventory,available,ethFinal,ethLatest]=await Promise.all([
  base.client.readContract({address,abi:parseAbi(['function inventory() view returns(uint256)']),functionName:'inventory',blockNumber:finalized.number}),
  base.client.readContract({address,abi:parseAbi(['function availableInventory() view returns(uint256)']),functionName:'availableInventory',blockNumber:finalized.number}),
  base.client.getBalance({address:base.registry.operator,blockNumber:finalized.number}),base.client.getBalance({address:base.registry.operator})]);
 if(inventory.toString()!==health.inventory||available.toString()!==health.availableInventory)throw Error('BASE_INVENTORY_NOT_FINALIZED');
 const liveHeld=BigInt((await admin.query("SELECT COALESCE(sum(source_amount),0)::text AS held FROM zee.obligations WHERE state<>'DISCHARGED'")).rows[0].held);
 const feeCapital=validateCapital(await readPrivate(config.capitalProofPath),scannedHeight,100000n+liveHeld);
 const eth=ethFinal<ethLatest?ethFinal:ethLatest;
 if(bootstrap){
  if(available<100000n||eth<BigInt(config.baseFeeBudget))throw Error('REAL_CAPITAL_UNAVAILABLE');
  const balances={'mockUSDC:principal':inventory.toString(),'baseETH:fee':eth.toString(),'TAZ:fee':feeCapital};
  if(experiment.capitalInitializationIntent&&JSON.stringify(experiment.capitalInitializationIntent.balances)!==JSON.stringify(balances))throw Error('CAPITAL_INITIALIZATION_CHANGED');
  if(!experiment.capitalInitializationIntent){
   experiment.capitalInitializationIntent={balances,eventId:randomUUID(),finalizedBaseHeight:finalized.number.toString(),finalizedBaseHash:finalized.hash,zcashHeight:scannedHeight};
   // Persist expected capital before SQL. Recovery must match this same intent.
   await savePrivate(config.experimentPath,experiment);
  }
  await transaction(admin,async c=>{
   const control=(await c.query('SELECT * FROM zee.runtime_control FOR UPDATE')).rows[0];
   if(control.accepting_orders||control.dispatch_enabled)throw Error('BOOTSTRAP_MUST_BE_PAUSED');
   const count=(await c.query('SELECT (SELECT count(*) FROM zee.quotes)+(SELECT count(*) FROM zee.deposits)+(SELECT count(*) FROM zee.reservations)+(SELECT count(*) FROM zee.ledger_entries) AS count')).rows[0].count;
   if(count!=='0')throw Error('EMPTY_LIVE_BRANCH_REQUIRED');
   const accounts=(await c.query('SELECT * FROM zee.inventory_accounts FOR UPDATE')).rows;
   if(accounts.some(a=>a.balance!=='0'||a.reserved!=='0'))throw Error('EXISTING_CAPITAL_MUST_NOT_BE_OVERWRITTEN');
   for(const [asset,purpose,balance] of [['mockUSDC','principal',inventory.toString()],['baseETH','fee',eth.toString()],['TAZ','fee',feeCapital]]){
    await c.query('INSERT INTO zee.inventory_accounts(asset,purpose,balance,reserved) VALUES($1,$2,$3,0) ON CONFLICT(asset,purpose) DO UPDATE SET balance=$3',[asset,purpose,balance]);
    await c.query(`INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount) VALUES($1,$2,$3,$4::numeric),($1,$2,'operator:capital',-$4::numeric)`,
     [experiment.capitalInitializationIntent.eventId,asset,`${purpose}:available`,balance]);
   }
  });
 }else{
  const accounts=(await admin.query('SELECT * FROM zee.inventory_accounts')).rows;
  const token=accounts.find(a=>a.asset==='mockUSDC'&&a.purpose==='principal');
  const taz=accounts.find(a=>a.asset==='TAZ'&&a.purpose==='fee');
  if(!token||!taz||BigInt(token.balance)>inventory||BigInt(token.balance)-BigInt(token.reserved)>available||BigInt(taz.balance)>BigInt(feeCapital))throw Error('CAPITAL_ACCOUNTING_DEFICIT');
  const fees=BigInt((await admin.query("SELECT COALESCE(sum(a.actual_fee),0)::text AS fees FROM zee.base_attempts a JOIN zee.orders o ON o.id=a.order_id WHERE a.confirmed AND o.state<>'SETTLED'")).rows[0].fees);
  const reserve=accounts.find(a=>a.asset==='baseETH'&&a.purpose==='fee');
  if(!reserve||eth+fees<BigInt(reserve.balance))throw Error('OPERATOR_GAS_ACCOUNTING_DEFICIT');
 }
 return {inventory:inventory.toString(),available:available.toString(),operatorETH:eth.toString(),operatorFeeCapital:feeCapital};
}
async function assertSingleOrder(){
 const rows=(await admin.query('SELECT q.id,q.input_amount,q.output_amount,q.execution_mode FROM zee.quotes q')).rows;
 if(rows.length!==1||rows[0].id!==experiment.quote?.id||rows[0].input_amount!=='100000'||rows[0].output_amount!=='100000'||rows[0].execution_mode!=='base-settlement-v1')throw Error('EXPERIMENT_ORDER_MISMATCH');
}
try{
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));started=true;origin=`http://127.0.0.1:${(server.address() as any).port}`;
 try{experiment=await readPrivate(config.experimentPath);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT'||command!=='prepare')throw error;}
 if(experiment&&(experiment.branchId!==db.branchId||experiment.binding!==binding))throw Error('PRIVATE_EXPERIMENT_BINDING_MISMATCH');
 if(command==='close'){
  experiment.closed=true;await savePrivate(config.experimentPath,experiment);console.log(JSON.stringify({phase:'closed',acceptingOrders:false,dispatchEnabled:false}));
 }else if(command==='prepare'){
  if(experiment?.closed)throw Error('EXPERIMENT_CLOSED');
  if(!experiment){
   experiment={schemaVersion:1,branchId:db.branchId,binding,token:randomBytes(32).toString('base64url'),key:randomUUID(),historicalOutputs:historical};
   await savePrivate(config.experimentPath,experiment,true);
  }
  await admin.query('UPDATE zee.runtime_control SET accepting_orders=false,dispatch_enabled=false');
  const heads=await refresh();
  if(!experiment.capitalInitialized){
   // Crash after SQL initialization is recovered only when accounts equal real
   // capital and no quote exists; never reset reservations or legacy orders.
   const accounts=(await admin.query('SELECT * FROM zee.inventory_accounts')).rows;
   const funded=accounts.filter(a=>a.balance!=='0').length;
   if(funded){
    const intent=experiment.capitalInitializationIntent?.balances;
    if(!intent||Object.entries(intent).some(([key,amount])=>!accounts.some(a=>`${a.asset}:${a.purpose}`===key&&a.balance===amount&&a.reserved==='0'))
     ||accounts.some(a=>a.reserved!=='0'||(a.balance!=='0'&&!(`${a.asset}:${a.purpose}` in intent))))throw Error('UNJOURNALED_CAPITAL_INITIALIZATION');
    const nonempty=(await admin.query('SELECT (SELECT count(*) FROM zee.quotes)+(SELECT count(*) FROM zee.deposits)+(SELECT count(*) FROM zee.reservations) AS count')).rows[0].count;
    if(nonempty!=='0')throw Error('CAPITAL_INITIALIZATION_RECOVERY_REQUIRES_EMPTY_BRANCH');
    const ledger=(await admin.query('SELECT event_id,asset,bucket,amount::text FROM zee.ledger_entries')).rows;
    if(ledger.length!==6||ledger.some(row=>row.event_id!==experiment.capitalInitializationIntent.eventId)
     ||Object.entries(intent).some(([key,amount])=>{
      const [asset,purpose]=key.split(':');
      return !ledger.some(row=>row.asset===asset&&row.bucket===`${purpose}:available`&&row.amount===amount)
       ||!ledger.some(row=>row.asset===asset&&row.bucket==='operator:capital'&&row.amount===`-${amount}`);
     }))throw Error('CAPITAL_OPENING_LEDGER_MISMATCH');
   }
   const proof=await capital(heads.zcash.scannedHeight,funded===0);
   experiment.capitalInitialized=proof;await savePrivate(config.experimentPath,experiment);
  }
  if(!experiment.quote){
   await capital(heads.zcash.scannedHeight);
   await admin.query('UPDATE zee.runtime_control SET reconciliation_required=false,accepting_orders=true');
   experiment.quote=await call('/v1/quotes','POST',{direction:'ZCASH_TO_BASE',inputAmount:'100000',recipient,refundRecipient:config.refundRecipient});
   await admin.query('UPDATE zee.runtime_control SET accepting_orders=false');
   await savePrivate(config.experimentPath,experiment);
  }
  await assertSingleOrder();
  const present=(await admin.query('SELECT state FROM zee.orders WHERE id=$1',[experiment.quote.id])).rows[0];
  if(!present){
   await refresh();await admin.query('UPDATE zee.runtime_control SET reconciliation_required=false,accepting_orders=true');
   experiment.order=await call(`/v1/orders/${experiment.quote.id}/accept`,'POST',{});
  }else{
   const recovered=await call(`/v1/orders/${experiment.quote.id}`);
   if(!experiment.order)experiment.order=recovered;
   experiment.lastStatus=recovered;
  }
  await admin.query('UPDATE zee.runtime_control SET accepting_orders=false');
  await savePrivate(config.experimentPath,experiment);
  console.log(JSON.stringify({phase:'prepared',status:experiment.order.status,inputTAZ:'0.001',outputMockUSDC:'0.1',priceMode:'fixture',cutoffHeight:experiment.order.funding?.cutoffHeight}));
 }else{
  await assertSingleOrder();
  if(command==='observe'||command==='dispatch'){
   if(experiment.closed&&command==='dispatch')throw Error('EXPERIMENT_CLOSED');
   const heads=await refresh();await base.preflight();await reconcileBaseReceipts(worker,r.keys,base);
   if(command==='dispatch'){
    const pending=(await admin.query('SELECT phase,signed_payload FROM zee.base_attempts WHERE order_id=$1 AND NOT confirmed',[experiment.quote.id])).rows;
    let chainKnown=false;
    for(const attempt of pending){
     const signed=r.keys.open(attempt.signed_payload,`base-signed:${experiment.quote.id}:${attempt.phase}:v1`) as PreparedBaseTransaction;
     const known=await base.client.getTransaction({hash:signed.hash}).catch(error=>{if(error.name==='TransactionNotFoundError')return null;throw error;});
     const receipt=await base.client.getTransactionReceipt({hash:signed.hash}).catch(error=>{if(error.name==='TransactionReceiptNotFoundError')return null;throw error;});
     if(receipt?.status==='reverted')throw Error('BASE_TRANSACTION_REVERTED');
     chainKnown ||=!!known||!!receipt;
    }
    if(chainKnown){
     // Our own unfinalized transaction is an expected waiting state. Do not
     // mistake its inventory/gas change for a capital deficit or reopen dispatch.
     // Absent recorded attempts instead use the original bytes below; the
     // durable dispatcher never calls prepare for an existing attempt.
     console.log(JSON.stringify({phase:'dispatch',status:'AWAITING_BASE_FINALITY'}));
    }else{
    const funds=await capital(heads.zcash.scannedHeight);
    const unresolved=(await admin.query("SELECT count(*) FROM zee.obligations WHERE order_id IS NULL AND state<>'DISCHARGED'")).rows[0].count;
    if(unresolved!=='0')throw Error('UNMATCHED_FUNDS_REQUIRE_RECONCILIATION');
    const state=(await admin.query('SELECT reconciliation_required FROM zee.runtime_control')).rows[0];
    if(state.reconciliation_required)throw Error('RECONCILIATION_REQUIRED');
    const signer=await readPrivate(config.baseSignerClientPath);
    await admin.query('UPDATE zee.runtime_control SET accepting_orders=false,dispatch_enabled=true');
    const result=await dispatchBaseOnce(worker,r.keys,base,new LocalBaseSigner(signer.command,signer.args),refresh);
    console.log(JSON.stringify({phase:'dispatch',...result,capital:funds}));
    }
   }
  }
  const order=await call(`/v1/orders/${experiment.quote.id}`);
  const counts=(await admin.query('SELECT (SELECT count(*) FROM zee.deposits WHERE order_id=$1) AS deposits,(SELECT count(*) FROM zee.operations WHERE order_id=$1) AS operations,(SELECT count(*) FROM zee.base_attempts WHERE order_id=$1) AS attempts',[order.id])).rows[0];
  if(order.status==='SETTLED'){
   assert.equal(order.destination.status,'FINALIZED');assert.equal(order.outputAmount,'100000');assert.equal(counts.deposits,'1');assert.equal(counts.operations,'1');assert.equal(counts.attempts,'2');
   const unauthorized=await fetch(origin+`/v1/orders/${order.id}`,{headers:{authorization:`Bearer ${randomBytes(32).toString('base64url')}`}});assert.equal(unauthorized.status,404);
  }
  // Preserve private original funding instructions for the one-time sender.
  experiment.lastStatus=order;await savePrivate(config.experimentPath,experiment);
  console.log(JSON.stringify({phase:command,status:order.status,source:order.source,destination:order.destination,counts}));
 }
}catch{
 await admin.query('SELECT zee.enter_reconciliation()').catch(()=>{});
 console.error('Forward experiment stopped; inspect private journals and reconcile the original order.');process.exitCode=1;
}finally{
 await admin.query('UPDATE zee.runtime_control SET accepting_orders=false,dispatch_enabled=false').catch(()=>{process.exitCode=1;});
 if(started)await new Promise<void>(resolve=>server.close(()=>resolve()));
 await Promise.all([api.end(),worker.end(),admin.end()]);
}
