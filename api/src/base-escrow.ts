import { publishObserverBatch,requireObserverEpoch } from './observer-frontiers.ts';
import { encodeFunctionData, decodeEventLog, getAddress, recoverTypedDataAddress, parseTransaction,
 recoverTransactionAddress, keccak256, type Address, type Hex, type TransactionSerialized } from 'viem';
import type pg from 'pg';
import { BaseContract, settlementAbi, domain, authNonce, publicSettlementId } from './base-contract.ts';
import { PrivateData } from './private-data.ts';
import { Repository } from './repository.ts';
import { transaction } from './db.ts';
import type { PreparedBaseTransaction } from './base-signer.ts';

export interface FundingTerms {id:Hex;token:Address;payer:Address;refundRecipient:Address;amount:string;
 nonce:string;fundingCutoff:string;cancellationAvailableAt:string}
const types={Funding:[{name:'id',type:'bytes32'},{name:'token',type:'address'},{name:'payer',type:'address'},
 {name:'refundRecipient',type:'address'},{name:'amount',type:'uint256'},{name:'nonce',type:'uint256'},
 {name:'fundingCutoff',type:'uint256'},{name:'cancellationAvailableAt',type:'uint256'}]} as const;
export function fundingTypedData(base:BaseContract,q:FundingTerms){return {domain:domain(base.registry),types,primaryType:'Funding' as const,
 message:{...q,amount:BigInt(q.amount),nonce:BigInt(q.nonce),fundingCutoff:BigInt(q.fundingCutoff),cancellationAvailableAt:BigInt(q.cancellationAvailableAt)}};}
export function fundingCall(base:BaseContract,q:FundingTerms,signature:Hex){return encodeFunctionData({abi:settlementAbi,functionName:'fund',args:[fundingTypedData(base,q).message,signature]});}
const context=(id:string)=>`escrow-terms:${id}:v1`;
const attemptContext=(id:string)=>`escrow-commit:${id}:v1`;
const proofContext=(id:string)=>`escrow-proof:${id}:v1`;

/** Accepted timestamps and private quote, never caller payment claims, govern authorization. */
export async function escrowTerms(pool:pg.Pool,keys:PrivateData,base:BaseContract,orderId:string):Promise<FundingTerms>{
 const row=(await pool.query('SELECT q.*,o.funding_cutoff_time,o.cancellation_available_at FROM zee.quotes q JOIN zee.orders o USING(id) WHERE q.id=$1',[orderId])).rows[0];
 if(!row||row.direction!=='BASE_TO_ZCASH'||row.execution_mode!=='base-escrow-v1'||row.base_contract?.toLowerCase()!==base.registry.contracts.ZeeSwapSettlement.address.toLowerCase())throw Error('BASE_ESCROW_QUOTE_MISMATCH');
 const q=keys.open(row.private_payload,`quote:${orderId}:v1`) as any;
 if(q.executionMode!=='base-escrow-v1'||q.baseContract?.toLowerCase()!==row.base_contract.toLowerCase()
  ||q.inputAmount!==row.input_amount||q.outputAmount!==row.output_amount||!q.payer
  ||q.depositReceiver!==`escrow:${publicSettlementId(row.settlement_id)}`)throw Error('BASE_ESCROW_QUOTE_MISMATCH');
 return {id:publicSettlementId(row.settlement_id),token:base.registry.contracts.MockUSDC.address,payer:getAddress(q.payer),
  refundRecipient:getAddress(q.refundRecipient),amount:row.input_amount,nonce:authNonce(publicSettlementId(row.settlement_id),'Funding'),
  fundingCutoff:String(Math.floor(new Date(row.funding_cutoff_time).getTime()/1000)),
  cancellationAvailableAt:String(Math.floor(new Date(row.cancellation_available_at).getTime()/1000))};
}

/** Operator-only preparatory boundary; the HTTP reverse route deliberately remains disabled. */
export async function authorizeEscrow(pool:pg.Pool,keys:PrivateData,base:BaseContract,orderId:string,
 authorize:(q:FundingTerms)=>Promise<Hex>){
 await base.preflight();const terms=await escrowTerms(pool,keys,base,orderId);
 const signature=await authorize(terms);
 if(getAddress(await recoverTypedDataAddress({...fundingTypedData(base,terms),signature}))!==getAddress(base.registry.operator))throw Error('BASE_ESCROW_SIGNATURE_MISMATCH');
 const payload=(await pool.query('SELECT zee.pin_escrow_terms($1,$2) AS payload',[orderId,keys.seal({terms,signature},context(orderId))])).rows[0].payload;
 const pinned=keys.open(payload,context(orderId)) as {terms:FundingTerms;signature:Hex};
 if(JSON.stringify(pinned.terms)!==JSON.stringify(terms))throw Error('BASE_ESCROW_TERMS_MISMATCH');
 return pinned;
}

export async function finalizedReceipt(base:BaseContract,hash:Hex){
 const receipt=await base.client.getTransactionReceipt({hash}).catch(error=>{if(error.name==='TransactionReceiptNotFoundError')return null;throw error;});
 if(!receipt)return null;
 if(receipt.status!=='success')throw Error('BASE_ESCROW_TRANSACTION_REVERTED');
 const heads=await base.heads(),block=await base.client.getBlock({blockNumber:receipt.blockNumber});
 if(block.hash!==receipt.blockHash)throw Error('BASE_REORG');
 if(heads.finalized.number<receipt.blockNumber)return null;
 return {receipt,block,heads};
}
export function escrowEvents(base:BaseContract,receipt:any,name:string){return receipt.logs.filter((l:any)=>l.address.toLowerCase()===base.registry.contracts.ZeeSwapSettlement.address.toLowerCase()).flatMap((l:any)=>{
 try{const e=decodeEventLog({abi:settlementAbi,data:l.data,topics:l.topics});return e.eventName===name?[{args:e.args as any,index:l.logIndex}]:[];}catch{return [];}
});}
export async function canonicalCheckpoint(pool:pg.Pool,p:NonNullable<Awaited<ReturnType<typeof finalizedReceipt>>>){
 return publishObserverBatch(pool,'base-escrow-receipt',[
  {network:'base-sepolia',height:Number(p.heads.latest.number),hash:p.heads.latest.hash!.slice(2),finalizedHeight:Number(p.heads.finalized.number),finalizedTime:new Date(Number(p.heads.finalized.timestamp)*1000),observedAt:new Date()}
 ],[
  {network:'base-sepolia',height:Number(p.receipt.blockNumber),hash:p.receipt.blockHash.slice(2),time:new Date(Number(p.block.timestamp)*1000)},
  {network:'base-sepolia',height:Number(p.heads.finalized.number),hash:p.heads.finalized.hash!.slice(2),time:new Date(Number(p.heads.finalized.timestamp)*1000)}
 ]);
}
export async function escrowState(base:BaseContract,terms:FundingTerms,blockNumber:bigint){
 const address=base.registry.contracts.ZeeSwapSettlement.address;
 const [state,record]=await Promise.all([
  base.client.readContract({address,abi:settlementAbi,functionName:'states',args:[terms.id],blockNumber}),
  base.client.readContract({address,abi:settlementAbi,functionName:'escrows',args:[terms.id],blockNumber})]);
 if(getAddress(record[0])!==terms.payer||getAddress(record[1])!==terms.refundRecipient||record[2]!==BigInt(terms.amount)
  ||record[3]!==BigInt(terms.cancellationAvailableAt))throw Error('BASE_ESCROW_RECORD_MISMATCH');
 return state;
}

/** Caller tx hash is only a lookup hint. Canonical calldata, signer and event establish funding. */
export async function observeEscrowFunding(pool:pg.Pool,keys:PrivateData,base:BaseContract,orderId:string,hash:Hex){
 const terms=await escrowTerms(pool,keys,base,orderId);
 const row=(await pool.query('SELECT terms_payload FROM zee.escrow_bindings WHERE order_id=$1',[orderId])).rows[0];
 if(!row)throw Error('BASE_ESCROW_AUTHORIZATION_MISSING');
 const pinned=keys.open(row.terms_payload,context(orderId)) as {terms:FundingTerms;signature:Hex};
 if(JSON.stringify(pinned.terms)!==JSON.stringify(terms))throw Error('BASE_ESCROW_TERMS_MISMATCH');
 const proof=await finalizedReceipt(base,hash);if(!proof)return {status:'AWAITING_BASE_FINALITY'};
 const state=await escrowState(base,terms,proof.heads.finalized.number);
 if((await base.client.getBlock({blockNumber:proof.heads.finalized.number})).hash!==proof.heads.finalized.hash)throw Error('BASE_REORG');
 if(state!==4&&state!==5)throw Error('BASE_ESCROW_NOT_FUNDED');
 const tx=await base.client.getTransaction({hash}),matches=escrowEvents(base,proof.receipt,'Funded'),args=matches[0]?.args;
 if(tx.from.toLowerCase()!==terms.payer.toLowerCase()||tx.to?.toLowerCase()!==base.registry.contracts.ZeeSwapSettlement.address.toLowerCase()
  ||tx.value!==0n||tx.input!==fundingCall(base,terms,pinned.signature)||matches.length!==1||args.id!==terms.id
  ||getAddress(args.payer)!==terms.payer||args.amount!==BigInt(terms.amount)||args.cancellationAvailableAt!==BigInt(terms.cancellationAvailableAt)
  ||proof.block.timestamp>=BigInt(terms.fundingCutoff))throw Error('BASE_ESCROW_FUNDING_MISMATCH');
 const qrow=(await pool.query('SELECT private_payload FROM zee.quotes WHERE id=$1',[orderId])).rows[0];
 const q=keys.open(qrow.private_payload,`quote:${orderId}:v1`) as any;
 const epoch=await canonicalCheckpoint(pool,proof);
 return transaction(pool,async c=>{
  await requireObserverEpoch(c,epoch);const repo=new Repository(c,keys);
  const id=await repo.observe({network:'base-sepolia',txid:hash.slice(2),index:matches[0].index,emitter:base.registry.contracts.ZeeSwapSettlement.address,
   reference:q.reference,receiver:q.depositReceiver,amount:terms.amount,height:Number(proof.receipt.blockNumber),blockHash:proof.receipt.blockHash.slice(2),
   blockTime:new Date(Number(proof.block.timestamp)*1000),shielded:false});
  await repo.confirm(id);return {status:'READY',depositId:id};
 });
}

export async function storeEscrowCommit(pool:pg.Pool,keys:PrivateData,base:BaseContract,orderId:string,jobId:string,owner:string,fence:string,signed:PreparedBaseTransaction){
 const terms=await escrowTerms(pool,keys,base,orderId),tx=parseTransaction(signed.raw);
 if(tx.type!=='legacy'||tx.chainId!==84532||keccak256(signed.raw)!==signed.hash||tx.nonce!==signed.nonce
  ||getAddress(await recoverTransactionAddress({serializedTransaction:signed.raw as TransactionSerialized}))!==getAddress(base.registry.operator)
  ||tx.to?.toLowerCase()!==base.registry.contracts.ZeeSwapSettlement.address.toLowerCase()||(tx.value??0n)!==0n
  ||tx.data!==encodeFunctionData({abi:settlementAbi,functionName:'commitPayout',args:[terms.id]})||!tx.gas||tx.gas>450000n
  ||!tx.gasPrice||tx.gasPrice>20000000n||!/^[1-9][0-9]*$/.test(signed.maxCost)||BigInt(signed.maxCost)>10000000000000n
  ||tx.gas*tx.gasPrice>BigInt(signed.maxCost))throw Error('BASE_ESCROW_SIGNED_COMMIT_MISMATCH');
 await pool.query('SELECT zee.store_escrow_commit($1,$2,$3,$4,$5,$6,$7)',[orderId,jobId,owner,fence,keys.lookup('base-tx',signed.hash),keys.seal(signed,attemptContext(orderId)),signed.maxCost]);
}

/** Reconciles existing bytes while paused; never signs, broadcasts or frees customer funds. */
export async function observeEscrowCommit(pool:pg.Pool,keys:PrivateData,base:BaseContract,orderId:string){
 const row=(await pool.query('SELECT * FROM zee.escrow_commits WHERE order_id=$1',[orderId])).rows[0];if(!row)throw Error('BASE_ESCROW_COMMIT_MISSING');
 const signed=keys.open(row.signed_payload,attemptContext(orderId)) as PreparedBaseTransaction;
 const terms=await escrowTerms(pool,keys,base,orderId),p=await finalizedReceipt(base,signed.hash);if(!p)return {status:'AWAITING_BASE_FINALITY'};
 const tx=await base.client.getTransaction({hash:signed.hash}),matches=escrowEvents(base,p.receipt,'PayoutCommitted');
 const state=await escrowState(base,terms,p.heads.finalized.number);
 if((await base.client.getBlock({blockNumber:p.heads.finalized.number})).hash!==p.heads.finalized.hash)throw Error('BASE_REORG');
 if(matches.length!==1||matches[0].args.id!==terms.id||state!==5||tx.from.toLowerCase()!==base.registry.operator.toLowerCase()
  ||tx.to?.toLowerCase()!==base.registry.contracts.ZeeSwapSettlement.address.toLowerCase()||tx.value!==0n
  ||tx.input!==encodeFunctionData({abi:settlementAbi,functionName:'commitPayout',args:[terms.id]}))throw Error('BASE_ESCROW_COMMIT_MISMATCH');
 const l1=(p.receipt as any).l1Fee;if(!base.localTest&&typeof l1!=='bigint')throw Error('BASE_FEE_UNAVAILABLE');
 const fee=(p.receipt.gasUsed*p.receipt.effectiveGasPrice+BigInt(l1??0)).toString();
 const proof={transactionHash:signed.hash,blockHeight:Number(p.receipt.blockNumber),blockHash:p.receipt.blockHash,fee,state:'PAYOUT_COMMITTED',
 finalizedHeight:Number(p.heads.finalized.number),finalizedHash:p.heads.finalized.hash};
 const epoch=await canonicalCheckpoint(pool,p);
 await transaction(pool,async c=>{await requireObserverEpoch(c,epoch);await c.query('SELECT zee.confirm_escrow_commit($1,$2,$3,$4,$5,$6)',
  [orderId,keys.lookup('base-tx',signed.hash),proof.blockHeight,proof.blockHash.slice(2),fee,keys.seal(proof,proofContext(orderId))]);});
 return {status:'COMMIT_FINALIZED'};
}
