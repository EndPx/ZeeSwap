/** Read-only final proof. No signing, observation writes or runtime changes. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {getAddress,parseAbi,keccak256,parseTransaction,recoverTransactionAddress,encodeFunctionData,type TransactionSerialized} from 'viem';
import {connect} from '../src/db.ts';
import {PrivateData,accessHash} from '../src/private-data.ts';
import {BaseContract,loadBaseRegistry,settlementAbi,publicSettlementId,authNonce} from '../src/base-contract.ts';
import {fundingCall,fundingTypedData,escrowState,escrowEvents,finalizedReceipt,type FundingTerms} from '../src/base-escrow.ts';
import {recoverTypedDataAddress} from 'viem';
import {requireDevelopment} from './config.ts';
import {approvalDigest} from '../src/reverse-authority.ts';
import {recipientShieldedBalance} from '../src/reverse-recipient-balance.ts';
import type {PreparedBaseTransaction} from '../src/base-signer.ts';
import type {PreparedZcashTransaction} from '../src/reverse-settlement.ts';
import {reverseBaseRegistry} from '../src/reverse-base-rpc.ts';
const read=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
function check(value:unknown,code:string):asserts value{if(!value)throw Error(code);}
function linuxSibling(configPath:string,path:string){
 const m=/^\\+wsl\.localhost\\+(Ubuntu(?:-24\.04)?)\\+/.exec(configPath);check(m&&path.startsWith('/home/albary/'),'PRIVATE_WSL_PATH_REQUIRED');
 return `\\\\wsl.localhost\\${m[1]}${path.replaceAll('/','\\')}`;
}
async function main(){
 const config=await read(resolve(process.argv[2]??'../.deploy-local/reverse-operator.json'));
 process.env.ZEE_DB_CONFIG=resolve(config.databaseConfig);const target=requireDevelopment();
 check(target.branchId==='br-small-sound-aozx7xa6','DEDICATED_REVERSE_BRANCH_REQUIRED');
 const state=await read(resolve(config.stateFile)),data=await read(resolve(config.runtimeConfig));
 check([data.apiUrl,data.workerUrl].every(url=>new URL(url).hostname.replace('-pooler.','.')===new URL(target.adminUrl).hostname),'RUNTIME_BRANCH_MISMATCH');
 const keys=new PrivateData(Buffer.from(data.payloadKeyHex,'hex'),Buffer.from(data.lookupKeyHex,'hex'));
 const base=new BaseContract(reverseBaseRegistry(loadBaseRegistry(),config.baseRpcUrl)),token=base.registry.contracts.MockUSDC.address,contract=base.registry.contracts.ZeeSwapSettlement.address;
 const before=await read(resolve(config.verificationBaselineFile)),after=await read(resolve(config.recipientAfterFile));
 check(before.version===1&&before.chainId===84532&&before.baseBlockNumber==='48101970'&&before.payerMockUnits==='100000'
  &&before.contractInventoryMockUnits==='9900000'&&before.operatorETHWei==='994736099999518'&&before.recipientBalanceZatoshi==='500000'
  &&before.recipientNetwork==='zcash-testnet'&&before.recipientReceiver===config.recipient,'BASELINE_MISMATCH');
 const pool=connect(target.adminUrl,1),c=await pool.connect();let open=false;
 try{
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');open=true;
  const quotes=(await c.query('SELECT * FROM zee.quotes')).rows;check(quotes.length===1,'ONE_QUOTE_REQUIRED');
  const q=quotes[0],id=q.id;check(id===state.orderId&&q.direction==='BASE_TO_ZCASH'&&q.execution_mode==='base-escrow-v1'
   &&q.input_amount==='100000'&&q.output_amount==='100000'&&q.payout_fee==='10000'&&q.refund_fee===config.baseFeeBudget
   &&q.access_hash.equals(accessHash(state.owner)),'QUOTE_MISMATCH');
  const privateQuote=keys.open(q.private_payload,`quote:${id}:v1`) as any;
  check(privateQuote.recipient===config.recipient&&getAddress(privateQuote.payer)===getAddress(config.payer)
   &&getAddress(privateQuote.refundRecipient)===getAddress(config.refundRecipient)&&getAddress(q.base_contract)===getAddress(contract),'QUOTE_RECIPIENT_MISMATCH');
  const orders=(await c.query('SELECT * FROM zee.orders')).rows,control=(await c.query('SELECT * FROM zee.runtime_control')).rows[0];
  check(orders.length===1&&orders[0].id===id&&orders[0].state==='SETTLED','ORDER_NOT_SETTLED');
  check(!control.accepting_orders&&!control.dispatch_enabled,'RUNTIME_NOT_PAUSED');
  const deposits=(await c.query('SELECT * FROM zee.deposits')).rows,operations=(await c.query('SELECT * FROM zee.operations')).rows;
  check(deposits.length===1&&deposits[0].id===orders[0].primary_deposit&&deposits[0].order_id===id&&deposits[0].classification==='EXACT'
   &&deposits[0].amount==='100000'&&deposits[0].network==='base-sepolia'&&!deposits[0].shielded&&deposits[0].confirmed_at,'SOURCE_DEPOSIT_MISMATCH');
  check(operations.length===1&&operations[0].order_id===id&&operations[0].deposit_id===deposits[0].id&&operations[0].kind==='PAYOUT'
   &&operations[0].state==='CONFIRMED'&&operations[0].chain_authorization_verified,'OPERATION_MISMATCH');
  const obligations=(await c.query('SELECT * FROM zee.obligations')).rows,reservations=(await c.query('SELECT * FROM zee.reservations')).rows,jobs=(await c.query('SELECT * FROM zee.outbox_jobs')).rows;
  check(obligations.length===1&&obligations[0].deposit_id===deposits[0].id&&obligations[0].state==='DISCHARGED'&&obligations[0].source_amount==='100000','LIABILITY_NOT_DISCHARGED');
  check(reservations.length===3&&reservations.every(r=>r.order_id===id&&r.released_at)
   &&[['TAZ','principal','100000'],['TAZ','fee','10000'],['baseETH','fee',config.baseFeeBudget]].every(([asset,purpose,amount])=>reservations.some(r=>r.asset===asset&&r.purpose===purpose&&r.amount===amount)),'RESERVATIONS_NOT_RELEASED');
  check(jobs.length===1&&jobs[0].operation_id===operations[0].id&&jobs[0].status==='DONE','JOB_NOT_DONE');
  const commits=(await c.query('SELECT * FROM zee.escrow_commits')).rows,settles=(await c.query('SELECT * FROM zee.escrow_settlements')).rows,payouts=(await c.query('SELECT * FROM zee.reverse_payouts')).rows;
  check(commits.length===1&&settles.length===1&&payouts.length===1&&[...commits,...settles,...payouts].every(a=>a.order_id===id&&a.confirmed),'FINAL_ATTEMPTS_MISSING');
  const bindings=(await c.query('SELECT * FROM zee.escrow_bindings')).rows;check(bindings.length===1&&bindings[0].order_id===id,'FUNDING_BINDING_MISMATCH');
  const pinned=keys.open(bindings[0].terms_payload,`escrow-terms:${id}:v1`) as {terms:FundingTerms;signature:`0x${string}`};
  const terms:FundingTerms={id:publicSettlementId(q.settlement_id),token,payer:getAddress(privateQuote.payer),refundRecipient:getAddress(privateQuote.refundRecipient),amount:q.input_amount,
   nonce:authNonce(publicSettlementId(q.settlement_id),'Funding'),fundingCutoff:String(Math.floor(new Date(orders[0].funding_cutoff_time).getTime()/1000)),
   cancellationAvailableAt:String(Math.floor(new Date(orders[0].cancellation_available_at).getTime()/1000))};
  check(isDeepStrictEqual(pinned.terms,terms)&&terms.id===publicSettlementId(q.settlement_id)&&terms.nonce===authNonce(terms.id,'Funding'),'FUNDING_TERMS_MISMATCH');
  const accounts=(await c.query('SELECT asset,purpose,balance::text,reserved::text FROM zee.inventory_accounts')).rows;
  const sums=(await c.query('SELECT asset,sum(amount)::text AS amount FROM zee.ledger_entries GROUP BY asset')).rows;
  const unbalanced=(await c.query('SELECT event_id,asset FROM zee.ledger_entries GROUP BY event_id,asset HAVING sum(amount)<>0')).rows;
  const buckets=(await c.query("SELECT bucket,sum(amount)::text AS amount FROM zee.ledger_entries WHERE asset='mockUSDC' GROUP BY bucket")).rows;
  const opening=await read(resolve(config.openingStateFile??config.stateFile+'.opening.json'));
  const openingLedger=(await c.query('SELECT asset,bucket,amount::text FROM zee.ledger_entries WHERE event_id=$1',[opening.eventId])).rows;
  const canonicalSource=(await c.query(`SELECT d.id FROM zee.deposits d JOIN zee.scanner_checkpoints s ON s.network=d.network
   JOIN zee.chain_observations b ON b.network=d.network AND b.height=d.block_height AND b.block_hash=d.block_hash WHERE d.id=$1 AND s.finalized_height>=d.block_height`,[deposits[0].id])).rows;
  const canonicalDelivery=(await c.query(`SELECT a.order_id FROM zee.reverse_payouts a JOIN zee.scanner_checkpoints s ON s.network='zcash-testnet'
   JOIN zee.chain_observations b ON b.network=s.network AND b.height=a.block_height AND b.block_hash=a.block_hash WHERE a.order_id=$1 AND s.scanned_height-a.block_height+1>=10`,[id])).rows;
  check(canonicalSource.length===1&&canonicalDelivery.length===1,'DATABASE_CANONICALITY_MISSING');
  await c.query('COMMIT');open=false;
  await base.preflight();
  check(getAddress(await recoverTypedDataAddress({...fundingTypedData(base,terms),signature:pinned.signature}))===getAddress(base.registry.operator),'FUNDING_SIGNATURE_MISMATCH');
  const source=await finalizedReceipt(base,config.fundingTransactionHash);check(source,'SOURCE_NOT_FINALIZED');
  const sourceTx=await base.client.getTransaction({hash:config.fundingTransactionHash}),fundEvents=escrowEvents(base,source.receipt,'Funded');
  check(source.receipt.blockNumber===48101971n&&Number(source.receipt.blockNumber)===Number(deposits[0].block_height)
   &&source.receipt.blockHash.slice(2)===deposits[0].block_hash&&sourceTx.input===fundingCall(base,terms,pinned.signature)
   &&sourceTx.value===0n&&getAddress(sourceTx.from)===getAddress(terms.payer)&&sourceTx.to?.toLowerCase()===contract.toLowerCase()
   &&fundEvents.length===1&&fundEvents[0].args.id===terms.id&&fundEvents[0].args.amount===100000n
   &&getAddress(fundEvents[0].args.payer)===getAddress(terms.payer)&&fundEvents[0].args.cancellationAvailableAt===BigInt(terms.cancellationAvailableAt)
   &&source.block.timestamp<BigInt(terms.fundingCutoff),'SOURCE_FUNDING_RECEIPT_MISMATCH');
  const sourceIdentity=JSON.stringify(['base-sepolia',84532,config.fundingTransactionHash.slice(2),fundEvents[0].index,contract.toLowerCase()]);
  const storedSource=keys.open(deposits[0].private_payload,`deposit:${sourceIdentity}`) as any;
  check(deposits[0].identity_hash.equals(keys.lookup('deposit',sourceIdentity))&&storedSource.txid===config.fundingTransactionHash.slice(2)
   &&storedSource.index===fundEvents[0].index&&storedSource.amount==='100000'&&storedSource.reference===privateQuote.reference
   &&storedSource.receiver===privateQuote.depositReceiver&&storedSource.emitter.toLowerCase()===contract.toLowerCase(),'SOURCE_IDENTITY_BINDING_MISMATCH');
  const privateBase=await read(config.baseSignerPrivateConfig),journalPrefix=createHash('sha256').update(terms.id).digest('hex');
  const receipts=[];
  for(const [phase,row] of [['COMMIT',commits[0]],['SETTLE',settles[0]]] as const){
   const signed=keys.open(row.signed_payload,phase==='COMMIT'?`escrow-commit:${id}:v1`:`escrow-settle:${id}:v1`) as PreparedBaseTransaction;
   const journal=await read(linuxSibling(config.baseSignerPrivateConfig,`${privateBase.journalRoot}/${journalPrefix}.${phase}.tx.json`));
   check(journal.raw===signed.raw&&journal.hash===signed.hash&&journal.nonce===signed.nonce&&isDeepStrictEqual(journal.terms,terms),'BASE_SIGNER_JOURNAL_MISMATCH');
   const tx=parseTransaction(signed.raw),method=phase==='COMMIT'?'commitPayout':'settleEscrow';
   check(tx.chainId===84532&&keccak256(signed.raw)===signed.hash&&row.tx_hash.equals(keys.lookup('base-tx',signed.hash))
    &&getAddress(await recoverTransactionAddress({serializedTransaction:signed.raw as TransactionSerialized}))===getAddress(base.registry.operator)
    &&tx.to?.toLowerCase()===contract.toLowerCase()&&(tx.value??0n)===0n&&tx.data===encodeFunctionData({abi:settlementAbi,functionName:method,args:[terms.id]}),'SIGNED_BASE_IDENTITY_MISMATCH');
   const actual=await finalizedReceipt(base,signed.hash);check(actual,'BASE_ATTEMPT_NOT_FINALIZED');
   const events=escrowEvents(base,actual.receipt,phase==='COMMIT'?'PayoutCommitted':'EscrowSettled');
   const stored=keys.open(row.receipt_payload,phase==='COMMIT'?`escrow-proof:${id}:v1`:`escrow-settle-proof:${id}:v1`) as any;
   const l1=(actual.receipt as any).l1Fee;check(typeof l1==='bigint','BASE_L1_FEE_MISSING');
   const fee=actual.receipt.gasUsed*actual.receipt.effectiveGasPrice+l1;
   check(events.length===1&&events[0].args.id===terms.id&&(phase==='COMMIT'||events[0].args.amount===100000n)
    &&actual.receipt.blockHash.slice(2)===row.block_hash&&Number(actual.receipt.blockNumber)===Number(row.block_height)
    &&fee===BigInt(row.actual_fee)&&stored.transactionHash===signed.hash&&stored.blockHash===actual.receipt.blockHash
    &&stored.blockHeight===Number(actual.receipt.blockNumber)&&stored.fee===fee.toString(),'FINAL_BASE_RECEIPT_MISMATCH');
   receipts.push({phase,transactionHash:signed.hash,blockNumber:Number(actual.receipt.blockNumber),blockHash:actual.receipt.blockHash,feeWei:fee.toString()});
  }
  check(receipts[0].blockNumber>Number(source.receipt.blockNumber)&&receipts[1].blockNumber>receipts[0].blockNumber,'BASE_PHASE_ORDER_MISMATCH');
  const payout=keys.open(payouts[0].signed_payload,`reverse-payout:${id}:v1`) as PreparedZcashTransaction;
  check(payout.operationId===id&&payout.amount==='100000'&&payout.recipient===config.recipient&&payout.feeZatoshi==='10000'
   &&payouts[0].fee==='10000'&&payouts[0].actual_fee==='10000'&&payouts[0].max_cost==='10000'
   &&String(payouts[0].expiry_height)===payout.expiryHeight,'ZCASH_ATTEMPT_ACCOUNTING_MISMATCH');
  const rawSha=createHash('sha256').update(Buffer.from(payout.rawTransaction,'hex')).digest('hex'),walletConfig=await read(config.zcashPrivateConfig);
  const walletJournal=await read(linuxSibling(config.zcashPrivateConfig,walletConfig.journalPath));
  const approved=await read(config.approvedRequest);
  check(approvalDigest(approved)===config.approvedDigest&&approved.orderId===id&&walletJournal.approvedDigest===config.approvedDigest
   &&isDeepStrictEqual(walletJournal.prepared,payout)&&walletJournal.state==='DELIVERY_CONFIRMED'&&payouts[0].tx_hash.equals(keys.lookup('zcash-tx',payout.txid)),'ZCASH_SIGNER_JOURNAL_MISMATCH');
  check(Number.isSafeInteger(after.scannedHeight)&&/^[0-9a-f]{64}$/.test(after.tipHash),'INVALID_RECIPIENT_CHECKPOINT');
  const args=[...config.zcashArgs],index=args.findIndex(a=>typeof a==='string'&&a.endsWith('/workers/zcash-wallet/prepared_raw.py'));
  check(index>=0,'READ_ONLY_RECEIPT_COMMAND_REQUIRED');args[index]=args[index].replace('/workers/zcash-wallet/prepared_raw.py','/api/scripts/verify-live-reverse-zcash.py');
  const zproof:any=await new Promise((resolve,reject)=>{const child=spawn(config.zcashCommand,args,{stdio:['pipe','pipe','pipe'],windowsHide:true});let output='';
   const timer=setTimeout(()=>{child.kill();reject(Error('ZCASH_READ_ONLY_PROOF_TIMEOUT'));},360000);
   child.on('error',()=>{clearTimeout(timer);reject(Error('ZCASH_READ_ONLY_PROOF_FAILED'));});child.stderr.on('data',()=>{});
   child.stdout.on('data',b=>{output+=b;if(output.length>32768)child.kill();});
   child.on('close',code=>{clearTimeout(timer);try{check(code===0&&output.length<=32768,'ZCASH_READ_ONLY_PROOF_FAILED');resolve(JSON.parse(output));}catch(e){reject(e);}});
   child.stdin.end(JSON.stringify({orderId:id,approvedDigest:config.approvedDigest,txid:payout.txid,rawSha256:rawSha,recipient:config.recipient,amountZatoshi:'100000',maxFeeZatoshi:'10000',
    recipientSnapshotHeight:after.scannedHeight,recipientSnapshotHash:after.tipHash}));});
  const storedDelivery=keys.open(payouts[0].receipt_payload,`reverse-receipt:${id}:v1`) as any;
  check(zproof.readOnly&&zproof.recipientSnapshotCanonical&&zproof.confirmed&&zproof.shielded&&zproof.confirmations>=10&&zproof.orderId===id&&zproof.txid===payout.txid
   &&zproof.rawSha256===rawSha&&zproof.amount==='100000'&&zproof.fee==='10000'&&zproof.recipient===config.recipient
   &&zproof.blockHeight===String(payouts[0].block_height)&&zproof.blockHash===payouts[0].block_hash
   &&storedDelivery.txid===zproof.txid&&storedDelivery.blockHash===zproof.blockHash&&storedDelivery.blockHeight===Number(zproof.blockHeight),'ZCASH_FINAL_RECEIPT_MISMATCH');
  const beforeBalance=recipientShieldedBalance(before.recipientBeforeNotes),afterBalance=recipientShieldedBalance(after.notes,after.scannedHeight);
  check(beforeBalance===500000n&&after.version===1&&after.network==='zcash-testnet'&&after.recipientReceiver===config.recipient
   &&Number.isSafeInteger(after.scannedHeight)&&after.scannedHeight>=Number(zproof.blockHeight)+9&&Date.now()-Date.parse(after.observedAt)<=300000
   &&Date.parse(after.observedAt)<=Date.now()+5000&&afterBalance===600000n&&afterBalance-beforeBalance===100000n,'RECIPIENT_BALANCE_DELTA_MISMATCH');
  const delivered=after.notes.ironwood_notes.note_summaries.filter((n:any)=>n.txid===payout.txid&&n.output_index===zproof.index&&n.spend_status==='unspent');
  check(delivered.length===1&&delivered[0].value===100000,'DELIVERED_NOTE_NOT_IN_RECIPIENT_BALANCE');
  check(['ironwood','orchard','sapling'].every(pool=>before.recipientBeforeNotes[pool+'_notes'].note_summaries.every((n:any)=>n.txid!==payout.txid)),'RECIPIENT_BASELINE_ALREADY_CONTAINS_PAYOUT');
  const heads=await base.heads(),baselineBlock=await base.client.getBlock({blockNumber:BigInt(before.baseBlockNumber)});
  check(baselineBlock.hash===before.baseBlockHash,'BASELINE_BLOCK_CHANGED');
  const abi=parseAbi(['function balanceOf(address) view returns(uint256)']);
  const [payerBefore,payerAfter,inventoryBefore,inventoryAfter,operatorBefore,operatorAfter,stateNow,escrowLiability]=await Promise.all([
   base.client.readContract({address:token,abi,functionName:'balanceOf',args:[getAddress(config.payer)],blockNumber:BigInt(before.baseBlockNumber)}),
   base.client.readContract({address:token,abi,functionName:'balanceOf',args:[getAddress(config.payer)],blockNumber:heads.finalized.number}),
   base.client.readContract({address:contract,abi:settlementAbi,functionName:'inventory',blockNumber:BigInt(before.baseBlockNumber)}),
   base.client.readContract({address:contract,abi:settlementAbi,functionName:'inventory',blockNumber:heads.finalized.number}),
   base.client.getBalance({address:base.registry.operator,blockNumber:BigInt(before.baseBlockNumber)}),
   base.client.getBalance({address:base.registry.operator,blockNumber:heads.finalized.number}),
   escrowState(base,terms,heads.finalized.number),base.client.readContract({address:contract,abi:settlementAbi,functionName:'escrowLiability',blockNumber:heads.finalized.number})]);
  check(payerBefore===100000n&&payerAfter===0n&&inventoryBefore===9900000n&&inventoryAfter===10000000n&&stateNow===6&&escrowLiability===0n,'BASE_SOURCE_CAPITAL_DELTA_MISMATCH');
  const baseFees=receipts.reduce((sum,r)=>sum+BigInt(r.feeWei),0n);
  check(operatorBefore===994736099999518n&&operatorAfter===operatorBefore-baseFees&&opening.baseFee===operatorBefore.toString(),'OPERATOR_ETH_FEE_MISMATCH');
  check(accounts.length===3&&accounts.every(a=>a.reserved==='0')&&accounts.some(a=>a.asset==='TAZ'&&a.purpose==='principal'&&a.balance==='90000')
   &&accounts.some(a=>a.asset==='TAZ'&&a.purpose==='fee'&&a.balance==='0')&&accounts.some(a=>a.asset==='baseETH'&&a.purpose==='fee'&&a.balance===operatorAfter.toString()),'INVENTORY_ACCOUNTING_MISMATCH');
  const openingAmounts=[['TAZ','principal','190000'],['TAZ','fee','10000'],['baseETH','fee',opening.baseFee]];
  check(openingLedger.length===6&&openingAmounts.every(([asset,purpose,amount])=>openingLedger.some(e=>e.asset===asset&&e.bucket===purpose+':available'&&e.amount===amount)
   &&openingLedger.some(e=>e.asset===asset&&e.bucket===purpose+':operator-capital'&&e.amount==='-'+amount)),'OPENING_LEDGER_MISMATCH');
  const bucket=(name:string)=>BigInt(buckets.find(b=>b.bucket===name)?.amount??'0');
  check(bucket('operator:unreconciled')===100000n&&bucket('customer:held')===0n&&bucket('customer:liability')===0n
   &&sums.length===3&&sums.every(s=>s.amount==='0')&&!unbalanced.length,'LEDGER_ACCOUNTING_MISMATCH');
  check((await base.client.getBlock({blockNumber:heads.finalized.number})).hash===heads.finalized.hash,'FINALIZED_SNAPSHOT_CHANGED');
  console.log(JSON.stringify({verified:true,readOnly:true,status:'SETTLED',network:'zcash-testnet/base-sepolia',recipientDeltaZatoshi:'100000',recipientBalanceZatoshi:afterBalance.toString(),
   payerMockDeltaUnits:'-100000',contractInventoryDeltaMockUnits:'100000',remainingTAZPrincipalZatoshi:'90000',actualZcashFeeZatoshi:'10000',actualBaseFeesWei:baseFees.toString(),
   operatorETHWei:operatorAfter.toString(),sourceMockProceedsUnreconciled:'100000',deposits:1,operations:1,openReservations:0,ledgerBalanced:true,sourceObligation:'DISCHARGED',runtimePaused:true,
   zcashConfirmations:zproof.confirmations,baseReceipts:receipts,checkedFinalizedBlock:heads.finalized.number.toString()}));
 }catch(e){if(open)await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();await pool.end();}
}
try{await main();}catch(error){const code=error instanceof Error&&/^[A-Z_]{1,64}$/.test(error.message)?error.message:'PRIVATE_VERIFICATION_ERROR';console.error(JSON.stringify({verified:false,readOnly:true,error:code}));process.exitCode=1;}
