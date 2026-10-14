/** Read-only final proof for the single dedicated public-testnet forward order.
 * No observer, signer, runtime flags, minting or transaction submission here.
 */
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve,relative,isAbsolute } from 'node:path';
import { getAddress,parseAbi,keccak256 } from 'viem';
import { connect } from '../src/db.ts';
import { PrivateData,accessHash } from '../src/private-data.ts';
import { BaseContract,loadBaseRegistry,publicSettlementId,authNonce,type PayoutTerms,type ConfirmedBaseReceipt } from '../src/base-contract.ts';
import { receiptContext } from '../src/base-settlement.ts';
import type { PreparedBaseTransaction } from '../src/base-signer.ts';
import { atomic } from '../src/amounts.ts';
import { readPrivate } from './live-forward-state.ts';
import { requireDevelopment } from './config.ts';

const root=fileURLToPath(new URL('../../.deploy-local/',import.meta.url));
function privatePath(path:string){
 const absolute=resolve(path),rel=relative(root,absolute);
 if(rel.startsWith('..')||isAbsolute(rel))throw Error('PRIVATE_PATH_REQUIRED');return absolute;
}
function check(condition:unknown,code:string):asserts condition {if(!condition)throw Error(code);}

async function main(){
 const config=await readPrivate(privatePath(process.env.ZEE_FORWARD_CONFIG||resolve(root,'live-forward-config.json')));
 process.env.ZEE_DB_CONFIG=privatePath(config.adminConfigPath);
 const db=requireDevelopment();
 check(db.branchId==='br-crimson-river-aobpimyq'&&db.branchName==='zeeswap-g4-live-forward','DEDICATED_LIVE_BRANCH_REQUIRED');
 const runtime=await readPrivate(privatePath(config.runtimeConfigPath));
 check([runtime.apiUrl,runtime.workerUrl].every(url=>new URL(url).hostname==='ep-winter-frog-ao0z5ayy-pooler.c-2.ap-southeast-1.aws.neon.tech'),'RUNTIME_BRANCH_MISMATCH');
 const keys=new PrivateData(Buffer.from(runtime.payloadKeyHex,'hex'),Buffer.from(runtime.lookupKeyHex,'hex'));
 const base=new BaseContract(loadBaseRegistry()),recipient=getAddress(config.recipient),token=base.registry.contracts.MockUSDC.address;
 const settlement=base.registry.contracts.ZeeSwapSettlement.address;
 const experiment=await readPrivate(privatePath(config.experimentPath));
 const binding=createHash('sha256').update(JSON.stringify({branchId:db.branchId,recipient,refundRecipient:config.refundRecipient,
  historical:config.historicalOutputs,baseFeeBudget:config.baseFeeBudget,token,settlement})).digest('hex');
 check(experiment.schemaVersion===1&&experiment.branchId===db.branchId&&experiment.binding===binding,'EXPERIMENT_BINDING_MISMATCH');
 const before=await readPrivate(privatePath(process.env.ZEE_RECIPIENT_BEFORE||resolve(root,'g4-recipient-before.json')));
 check(before.schemaVersion===1&&before.chainId===84532&&getAddress(before.token)===getAddress(token)
  &&getAddress(before.recipient)===recipient&&typeof before.blockNumber==='string'&&/^(0|[1-9][0-9]*)$/.test(before.blockNumber)
  &&/^0x[0-9a-f]{64}$/.test(before.blockHash),'INVALID_RECIPIENT_BASELINE');
 const beforeBalance=atomic(before.balance);
 const pool=connect(db.adminUrl,1),client=await pool.connect();
 let transactionOpen=false;
 try{
  // A stable DB snapshot and PostgreSQL enforcement prevent accidental writes.
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  transactionOpen=true;
  const quotes=(await client.query('SELECT * FROM zee.quotes')).rows;
  check(quotes.length===1&&quotes[0].id===experiment.quote?.id&&quotes[0].direction==='ZCASH_TO_BASE'
   &&quotes[0].input_amount==='100000'&&quotes[0].output_amount==='100000'&&quotes[0].execution_mode==='base-settlement-v1'
   &&quotes[0].access_hash.equals(accessHash(experiment.token)),'EXPERIMENT_QUOTE_MISMATCH');
  const quote=quotes[0],id=quote.id;
  const privateQuote=keys.open(quote.private_payload,`quote:${id}:v1`) as any;
  check(getAddress(privateQuote.recipient)===recipient&&getAddress(privateQuote.baseContract)===getAddress(settlement)
   &&getAddress(quote.base_contract)===getAddress(settlement),'QUOTE_DESTINATION_MISMATCH');
  const orders=(await client.query('SELECT * FROM zee.orders')).rows;
  check(orders.length===1&&orders[0].id===id&&orders[0].state==='SETTLED','ORDER_NOT_SETTLED');
  const control=(await client.query('SELECT accepting_orders,dispatch_enabled FROM zee.runtime_control')).rows[0];
  check(!control.accepting_orders&&!control.dispatch_enabled,'RUNTIME_NOT_PAUSED');
  const deposits=(await client.query('SELECT * FROM zee.deposits')).rows;
  check(deposits.length===1&&deposits[0].order_id===id&&deposits[0].id===orders[0].primary_deposit
   &&deposits[0].classification==='EXACT'&&deposits[0].amount==='100000'&&deposits[0].network==='zcash-testnet'
   &&deposits[0].shielded&&deposits[0].confirmed_at,'SOURCE_DEPOSIT_MISMATCH');
  const operations=(await client.query('SELECT * FROM zee.operations')).rows;
  check(operations.length===1&&operations[0].order_id===id&&operations[0].deposit_id===deposits[0].id
   &&operations[0].kind==='PAYOUT'&&operations[0].state==='CONFIRMED'&&operations[0].chain_authorization_verified,'OPERATION_MISMATCH');
  const obligations=(await client.query('SELECT * FROM zee.obligations')).rows;
  check(obligations.length===1&&obligations[0].deposit_id===deposits[0].id&&obligations[0].source_amount==='100000'
   &&obligations[0].state==='DISCHARGED','SOURCE_OBLIGATION_NOT_DISCHARGED');
  const reservations=(await client.query('SELECT * FROM zee.reservations')).rows;
  check(reservations.length===3&&reservations.every(row=>row.order_id===id&&row.released_at),'RESERVATIONS_NOT_RELEASED');
  const jobs=(await client.query('SELECT * FROM zee.outbox_jobs')).rows;
  check(jobs.length===1&&jobs[0].operation_id===operations[0].id&&jobs[0].status==='DONE','JOB_NOT_DONE');
  const attempts=(await client.query('SELECT * FROM zee.base_attempts ORDER BY phase')).rows;
  check(attempts.length===2&&attempts.every(row=>row.order_id===id&&row.confirmed),'ATTEMPTS_NOT_FINALIZED');
  const bindings=(await client.query('SELECT * FROM zee.base_bindings')).rows;
  check(bindings.length===1&&bindings[0].order_id===id,'BASE_BINDING_MISMATCH');
  const terms=keys.open(bindings[0].terms_payload,`base-terms:${id}:v1`) as PayoutTerms;
  check(terms.amount==='100000'&&getAddress(terms.recipient)===recipient&&getAddress(terms.token)===getAddress(token)
   &&terms.id===publicSettlementId(quote.settlement_id)&&terms.nonce===authNonce(terms.id,'Payout'),'BASE_TERMS_MISMATCH');
  const accounts=(await client.query('SELECT * FROM zee.inventory_accounts')).rows;
  const buckets=(await client.query("SELECT bucket,sum(amount)::text AS amount FROM zee.ledger_entries WHERE asset='TAZ' GROUP BY bucket")).rows;
  const orderSums=(await client.query('SELECT asset,sum(amount)::text AS amount FROM zee.ledger_entries WHERE order_id=$1 GROUP BY asset',[id])).rows;
  const allSums=(await client.query('SELECT asset,sum(amount)::text AS amount FROM zee.ledger_entries GROUP BY asset')).rows;
  const eventSums=(await client.query('SELECT event_id,asset FROM zee.ledger_entries GROUP BY event_id,asset HAVING sum(amount)<>0')).rows;
  const opening=experiment.capitalInitializationIntent;
  const openingLedger=(await client.query('SELECT asset,bucket,amount::text FROM zee.ledger_entries WHERE event_id=$1',[opening?.eventId])).rows;
  const sourceCanonical=(await client.query(`SELECT d.id FROM zee.deposits d JOIN zee.scanner_checkpoints s ON s.network=d.network
   JOIN zee.chain_observations b ON b.network=d.network AND b.height=d.block_height AND b.block_hash=d.block_hash
   WHERE d.id=$1 AND s.scanned_height-d.block_height+1>=10`,[deposits[0].id])).rows;
  check(sourceCanonical.length===1,'SOURCE_CANONICALITY_MISSING');
  // Release the snapshot before any network I/O. Terminal receipts/ledger are
  // immutable; the one-order runtime was paused in this same snapshot.
  await client.query('COMMIT');transactionOpen=false;
  await base.preflight();
  const receipts:ConfirmedBaseReceipt[]=[];
  for(const phase of ['RESERVE','PAY'] as const){
   const attempt=attempts.find(row=>row.phase===phase);check(attempt,'MISSING_BASE_PHASE');
   const signed=keys.open(attempt.signed_payload,`base-signed:${id}:${phase}:v1`) as PreparedBaseTransaction;
   check(keccak256(signed.raw)===signed.hash&&attempt.tx_hash.equals(keys.lookup('base-tx',signed.hash)),'SIGNED_IDENTITY_MISMATCH');
   const stored=keys.open(attempt.receipt_payload,receiptContext(id,phase)) as ConfirmedBaseReceipt;
   const actual=await base.receipt(signed.hash,phase,terms);
   check(actual&&actual.hash===stored.hash&&actual.blockHash===stored.blockHash&&actual.blockNumber===stored.blockNumber
    &&actual.fee===stored.fee&&actual.phase===stored.phase&&actual.id===stored.id&&actual.amount===stored.amount
    &&getAddress(actual.recipient)===getAddress(stored.recipient)&&actual.fee===attempt.actual_fee
    &&actual.blockNumber===Number(attempt.block_height)&&actual.blockHash.slice(2)===attempt.block_hash,'FINAL_RECEIPT_MISMATCH');
   receipts.push(actual);
  }
  const paid=receipts.find(receipt=>receipt.phase==='PAY')!;
  check(BigInt(before.blockNumber)<BigInt(paid.blockNumber),'BASELINE_NOT_BEFORE_PAYMENT');
  const {finalized}=await base.heads();
  const baselineBlock=await base.client.getBlock({blockNumber:BigInt(before.blockNumber)});
  check(baselineBlock.hash===before.blockHash,'BASELINE_BLOCK_CHANGED');
  const tokenAbi=parseAbi(['function balanceOf(address) view returns(uint256)']);
  const settlementAbi=parseAbi(['function inventory() view returns(uint256)','function availableInventory() view returns(uint256)','function states(bytes32) view returns(uint8)']);
  const [originalBalance,finalBalance,inventory,available,operatorETH,settlementState]=await Promise.all([
   base.client.readContract({address:token,abi:tokenAbi,functionName:'balanceOf',args:[recipient],blockNumber:BigInt(before.blockNumber)}),
   base.client.readContract({address:token,abi:tokenAbi,functionName:'balanceOf',args:[recipient],blockNumber:finalized.number}),
   base.client.readContract({address:settlement,abi:settlementAbi,functionName:'inventory',blockNumber:finalized.number}),
   base.client.readContract({address:settlement,abi:settlementAbi,functionName:'availableInventory',blockNumber:finalized.number}),
   base.client.getBalance({address:base.registry.operator,blockNumber:finalized.number}),
   base.client.readContract({address:settlement,abi:settlementAbi,functionName:'states',args:[terms.id],blockNumber:finalized.number}),
  ]);
  check(originalBalance===beforeBalance&&finalBalance-beforeBalance===100000n,'RECIPIENT_DELTA_MISMATCH');
  check(settlementState===2,'SETTLEMENT_NOT_PAID');
  const mock=accounts.find(row=>row.asset==='mockUSDC'&&row.purpose==='principal');
  const gas=accounts.find(row=>row.asset==='baseETH'&&row.purpose==='fee');
  const taz=accounts.find(row=>row.asset==='TAZ'&&row.purpose==='fee');
  check(mock&&gas&&taz&&accounts.every(row=>row.reserved==='0'),'INVENTORY_RESERVATIONS_MISMATCH');
  check(inventory===BigInt(mock.balance)&&available===inventory-BigInt(mock.reserved),'TOKEN_INVENTORY_MISMATCH');
  check(operatorETH===BigInt(gas.balance),'OPERATOR_ETH_MISMATCH');
  const actualFees=receipts.reduce((sum,receipt)=>sum+BigInt(receipt.fee),0n);
  check(opening&&BigInt(opening.balances['baseETH:fee'])-actualFees===operatorETH
   &&BigInt(opening.balances['mockUSDC:principal'])-100000n===inventory,'OPENING_CAPITAL_RECONCILIATION_FAILED');
  check(openingLedger.length===6&&Object.entries(opening.balances).every(([key,amount])=>{
   const [asset,purpose]=key.split(':');return openingLedger.some(row=>row.asset===asset&&row.bucket===`${purpose}:available`&&row.amount===amount)
    &&openingLedger.some(row=>row.asset===asset&&row.bucket==='operator:capital'&&row.amount===`-${amount}`);
  }),'OPENING_LEDGER_MISMATCH');
  const openingBlock=await base.client.getBlock({blockNumber:BigInt(opening.finalizedBaseHeight)});
  check(openingBlock.hash===opening.finalizedBaseHash,'OPENING_BLOCK_CHANGED');
  check(taz.balance==='490000'&&opening.balances['TAZ:fee']==='490000'
   &&accounts.filter(row=>row.asset==='TAZ'&&row.purpose==='principal').every(row=>row.balance==='0'),'TAZ_PROCEEDS_BECAME_SPENDABLE');
  const bucket=(name:string)=>BigInt(buckets.find(row=>row.bucket===name)?.amount||'0');
  check(bucket('operator:unreconciled')===100000n&&bucket('customer:held')===0n&&bucket('customer:liability')===0n,'SOURCE_BUCKET_MISMATCH');
  check(orderSums.length===3&&allSums.length===3&&[...orderSums,...allSums].every(row=>row.amount==='0')&&eventSums.length===0,'LEDGER_NOT_BALANCED');
  console.log(JSON.stringify({verified:true,network:'base-sepolia',chainId:84532,status:'SETTLED',
   recipientDeltaMockUnits:'100000',inventoryMockUnits:inventory.toString(),availableMockUnits:available.toString(),
   operatorETHWei:operatorETH.toString(),actualBaseFeesWei:actualFees.toString(),operatorTAZFeeCapitalZatoshis:taz.balance,
   sourceProceedsUnreconciledZatoshis:'100000',deposits:1,operations:1,attempts:2,openReservations:0,
   ledgerBalanced:true,sourceObligation:'DISCHARGED',runtimePaused:true,
   receipts:receipts.map(receipt=>({phase:receipt.phase,transactionHash:receipt.hash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,feeWei:receipt.fee})),
   checkedFinalizedBlock:finalized.number.toString(),checkedFinalizedHash:finalized.hash}));
 }catch(error){if(transactionOpen)await client.query('ROLLBACK').catch(()=>{});throw error;}
 finally{client.release();await pool.end();}
}

try{await main();}
catch(error){
 // Never echo assertions, SQL payloads, private identifiers or decrypted values.
 const code=error instanceof Error&&/^[A-Z_]{1,64}$/.test(error.message)?error.message:'PRIVATE_VERIFICATION_ERROR';
 console.error(JSON.stringify({verified:false,error:code,readOnly:true}));
 process.exitCode=1;
}
