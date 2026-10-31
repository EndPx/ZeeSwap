import test from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {privateKeyToAccount} from 'viem/accounts';import {keccak256,encodeFunctionData} from 'viem';
import {PrivateData} from '../src/private-data.ts';
import {qualifyClosedJournalInventory,type ClosedJournalSql,type ClosedJournalFile,type ClosedJournalTree} from '../src/testnet-closed-journals.ts';
import {publicSettlementId,payoutTypedData,payoutCall,jsonSafe,BaseContract,settlementAbi,type BaseRegistry,type PayoutTerms} from '../src/base-contract.ts';
import {fundingTypedData} from '../src/base-escrow.ts';import {approvalDigest} from '../src/reverse-authority.ts';
const root='/opt/zeeswap-testnet/state/base-signer-journal',sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
async function fixture(){
 const keys=new PrivateData(Buffer.alloc(32,1),Buffer.alloc(32,2)),operator=privateKeyToAccount(('0x'+'11'.repeat(32)) as `0x${string}`),registry={chainId:84532,rpcUrl:'https://sepolia.base.org',operator:operator.address,contracts:{ZeeSwapSettlement:{address:'0x1111111111111111111111111111111111111111'},MockUSDC:{address:'0x2222222222222222222222222222222222222222'}}} as unknown as BaseRegistry;
 const sql:ClosedJournalSql={orders:[],base_bindings:[],base_attempts:[],escrow_bindings:[],escrow_commits:[],escrow_settlements:[],reverse_payouts:[],source_refunds:[]},files:ClosedJournalFile[]=[];
 for(let i=1;i<=2;i++){
  const id=`00000000-0000-0000-0000-${String(i).padStart(12,'0')}`,settlement_id='synthetic-'+i,recipient='0x3333333333333333333333333333333333333333',q={id,state:'SETTLED',direction:'ZCASH_TO_BASE',settlement_id,input_amount:'200000',output_amount:'100000',private_payload:keys.seal({inputAmount:'200000',outputAmount:'100000',recipient},`quote:${id}:v1`)},terms:PayoutTerms={id:publicSettlementId(settlement_id),token:registry.contracts.MockUSDC.address,recipient,amount:'100000',nonce:String(i),deadline:'2000000000'},signature=await operator.signTypedData(payoutTypedData(registry,terms)),prefix=sha(terms.id);
  sql.orders.push(q);sql.base_bindings.push({order_id:id,terms_payload:keys.seal(terms,`base-terms:${id}:v1`)});
  const add=(suffix:string,value:unknown)=>files.push({path:root+'/'+prefix+suffix,bytes:Buffer.from(jsonSafe(value))});add('.auth.json',{terms,signature});add('.typed.json',payoutTypedData(registry,terms));
  for(const [n,phase] of ['RESERVE','PAY'].entries()){
   const nonce=i*2+n,raw=await operator.signTransaction({chainId:84532,type:'legacy',to:registry.contracts.ZeeSwapSettlement.address,data:payoutCall(registry,terms,signature,phase as 'PAY'),nonce,gas:450000n,gasPrice:20000000n,value:0n}),p={raw,hash:keccak256(raw),nonce,maxCost:'10000000000000'},block_hash='a'.repeat(64),block_height=100+i*2+n;
   add(`.${phase}.tx.json`,{...p,terms,data:payoutCall(registry,terms,signature,phase as 'PAY'),gas:'450000',gasPrice:'20000000'});
   sql.base_attempts.push({order_id:id,phase,tx_hash:keys.lookup('base-tx',p.hash),signed_payload:keys.seal(p,`base-signed:${id}:${phase}:v1`),max_cost:p.maxCost,confirmed:true,canonical:true,block_hash,block_height,receipt_payload:keys.seal({hash:p.hash,phase,blockNumber:block_height,blockHash:'0x'+block_hash},`base-receipt:${id}:${phase}:v1`)});
  }
 }
 const policy='e'.repeat(64),processRoot='/opt/zeeswap-testnet/state/testnet-policy/'+policy+'/orders';for(const q of sql.orders){q.policy_sha256=Buffer.from(policy,'hex');q.accepted_epoch='242';}
 const q=sql.orders[1]!;files.push({path:processRoot+'/'+q.id+'/process.private.json',bytes:Buffer.from(JSON.stringify({version:1,policyContext:{orderId:q.id,policySha256:policy,activeEpoch:'242'}}))});
 const trees:ClosedJournalTree[]=[{path:root,files:files.slice(0,4).map(f=>({relativePath:f.path.slice(root.length+1),sha256:sha(f.bytes)}))},{path:processRoot,files:[]},{path:'/opt/zeeswap-testnet/state/reverse-orders',files:[]},{path:'/opt/zeeswap-testnet/state/refund-orders',files:[]}];return{keys,registry,sql,files,trees};
}
test('a second authenticated terminal order is admitted without changing immutable legacy baseline',async()=>{const f=await fixture(),before=JSON.stringify(f.trees);const r=await qualifyClosedJournalInventory(f.trees,f.files,f.sql,f.keys,f.registry);assert.equal(r.newClosedOrders,1);assert.equal(r.trees[0]!.files.length,8);assert.equal(JSON.stringify(f.trees),before);assert.match(r.digest,/^[a-f0-9]{64}$/);});

test('explicit delivered journal qualification authenticates original inclusion without asserting finality',async t=>{
 const f=await fixture(),q=f.sql.orders[1]!,id=q.id;q.state='READY';q.delivery_included=true;
 const proofs=new Map<string,any>();
 for(const row of f.sql.base_attempts.filter(r=>r.order_id===id)){
  const signed=f.keys.open(row.signed_payload,`base-signed:${id}:${row.phase}:v1`) as any;
  const terms=f.keys.open(f.sql.base_bindings[1]!.terms_payload,`base-terms:${id}:v1`) as any;
  const proof={hash:signed.hash,phase:row.phase,blockNumber:row.block_height,blockHash:'0x'+row.block_hash,id:terms.id,recipient:terms.recipient,amount:terms.amount,fee:'123'};
  row.confirmed=false;row.canonical=false;row.delivery_included=true;row.inclusion_canonical=true;row.receipt_payload=f.keys.seal(proof,`base-inclusion:${id}:${row.phase}:v1`);proofs.set(signed.hash,proof);
 }
 t.mock.method(BaseContract.prototype,'includedReceipt',async(hash:string)=>proofs.get(hash));
 t.mock.method(BaseContract.prototype,'state',async()=>2);
 assert.equal((await qualifyClosedJournalInventory(f.trees,f.files,f.sql,f.keys,f.registry,true)).newClosedOrders,1);
 assert.equal(f.sql.base_attempts[2]!.confirmed,false);
 await assert.rejects(qualifyClosedJournalInventory(f.trees,f.files,f.sql,f.keys,f.registry),/NOT_TERMINAL/);
 f.sql.base_attempts[2]!.inclusion_canonical=false;
 await assert.rejects(qualifyClosedJournalInventory(f.trees,f.files,f.sql,f.keys,f.registry,true),/UNCONFIRMED/);
 f.sql.base_attempts[2]!.inclusion_canonical=true;
 proofs.set(proofs.keys().next().value!,{...proofs.values().next().value,blockHash:'0x'+'b'.repeat(64)});
 await assert.rejects(qualifyClosedJournalInventory(f.trees,f.files,f.sql,f.keys,f.registry,true),/INCLUSION_CHANGED/);
});
test('uncertain SQL, missing original phase, changed raw bytes, unknown files and legacy mutation refuse',async()=>{
 for(const kind of ['pending','unconfirmed','noncanonical','missing','all-missing','raw','unknown','legacy','receipt','lookup','roots']){const f=await fixture(),id=f.sql.orders[1]!.id;
  if(kind==='pending')f.sql.orders[1]!.state='READY';if(kind==='unconfirmed')f.sql.base_attempts[2]!.confirmed=false;if(kind==='noncanonical')f.sql.base_attempts[2]!.canonical=false;
  if(kind==='missing')f.files.pop();if(kind==='raw'){const file=f.files.filter(v=>v.path.endsWith('.PAY.tx.json')).at(-1)!,v=JSON.parse(file.bytes.toString());v.raw='0x1234';file.bytes=Buffer.from(JSON.stringify(v));}
  if(kind==='unknown')f.files.push({path:root+'/unexpected.tmp',bytes:Buffer.from('{}')});if(kind==='legacy')f.files[0]!.bytes=Buffer.from('{}');
  if(kind==='receipt')f.sql.base_attempts[2]!.receipt_payload=f.keys.seal({hash:'0x'+'f'.repeat(64),blockNumber:104,blockHash:'0x'+'a'.repeat(64)},`base-receipt:${id}:RESERVE:v1`);
  if(kind==='lookup')f.sql.base_attempts[2]!.tx_hash=Buffer.alloc(32);
  if(kind==='all-missing')f.files=f.files.slice(0,4);if(kind==='roots')f.trees.pop();
  await assert.rejects(qualifyClosedJournalInventory(f.trees,f.files,f.sql,f.keys,f.registry),/CLOSED_RECOVERY_JOURNAL_/ ,kind);
 }
});

test('external original-payer reverse refund closes through authenticated original SQL bytes without an operator private journal',async()=>{
 const f=await fixture(),q=f.sql.orders[1]!,id=q.id,prefix=sha(publicSettlementId(q.settlement_id)),operator=privateKeyToAccount(('0x'+'11'.repeat(32)) as `0x${string}`),payer=privateKeyToAccount(('0x'+'22'.repeat(32)) as `0x${string}`);
 f.files=f.files.filter(v=>!v.path.startsWith(root+'/'+prefix));f.sql.base_attempts.splice(2);f.sql.base_bindings.splice(1);q.direction='BASE_TO_ZCASH';q.state='REFUNDED';q.private_payload=f.keys.seal({inputAmount:q.input_amount,outputAmount:q.output_amount,payer:payer.address},`quote:${id}:v1`);
 const terms={id:publicSettlementId(q.settlement_id),token:f.registry.contracts.MockUSDC.address,payer:payer.address,refundRecipient:payer.address,amount:q.input_amount,nonce:'2',fundingCutoff:'2000000000',cancellationAvailableAt:'2000000300'},typed=fundingTypedData(new BaseContract(f.registry),terms),signature=await operator.signTypedData(typed);
 f.sql.escrow_bindings.push({order_id:id,terms_payload:f.keys.seal({terms,signature},`escrow-terms:${id}:v1`)});
 for(const [suffix,value] of [['.reverse.auth.json',{terms,signature}],['.reverse.typed.json',typed]] as const)f.files.push({path:root+'/'+prefix+suffix,bytes:Buffer.from(jsonSafe(value))});
 const raw=await payer.signTransaction({chainId:84532,type:'legacy',to:f.registry.contracts.ZeeSwapSettlement.address,data:encodeFunctionData({abi:settlementAbi,functionName:'refund',args:[terms.id]}),nonce:1,gas:450000n,gasPrice:20000000n,value:0n}),p={raw,hash:keccak256(raw),nonce:1,maxCost:'10000000000000'},row={order_id:id,base_phase:'REFUND',base_hash:f.keys.lookup('base-tx',p.hash),base_payload:f.keys.seal(p,`source-refund:${id}:REFUND:v1`),base_max_cost:p.maxCost,base_confirmed:true,base_canonical:true,confirmed:true,canonical:true,base_height:200,base_block:'a'.repeat(64),height:200,block_hash:'a'.repeat(64),base_receipt:f.keys.seal({hash:p.hash,phase:'REFUND',blockHeight:200,blockHash:'0x'+'a'.repeat(64)},`source-refund:${id}:REFUND-proof:v1`)};
 f.sql.source_refunds.push(row);assert.equal((await qualifyClosedJournalInventory(f.trees,f.files,f.sql,f.keys,f.registry)).newClosedOrders,1);
 row.base_payload=f.keys.seal({...p,raw:'0x1234'},`source-refund:${id}:REFUND:v1`);await assert.rejects(qualifyClosedJournalInventory(f.trees,f.files,f.sql,f.keys,f.registry));
});

async function nativeFixture(refund=false){
 const f=await fixture(),q=f.sql.orders[1]!,id=q.id,prefix=sha(publicSettlementId(q.settlement_id)),operator=privateKeyToAccount(('0x'+'11'.repeat(32)) as `0x${string}`);
 f.files=f.files.filter(v=>!v.path.startsWith(root+'/'+prefix));f.sql.base_attempts.splice(2);f.sql.base_bindings.splice(1);q.state=refund?'REFUNDED':'SETTLED';q.direction=refund?'ZCASH_TO_BASE':'BASE_TO_ZCASH';q.payout_fee='10000';q.refund_fee='10000';q.received_amount='200000';const recipient='utest1synthetic',amount=refund?q.received_amount:q.output_amount;
 q.private_payload=f.keys.seal({inputAmount:q.input_amount,outputAmount:q.output_amount,recipient,refundRecipient:recipient,payer:operator.address},`quote:${id}:v1`);
 const add=(path:string,v:unknown)=>{const b=Buffer.from(jsonSafe(v));f.files.push({path,bytes:b});return sha(b);};
 const terms={id:publicSettlementId(q.settlement_id),token:f.registry.contracts.MockUSDC.address,payer:operator.address,refundRecipient:operator.address,amount:q.input_amount,nonce:'2',fundingCutoff:'2000000000',cancellationAvailableAt:'2000000300'};
 const base= new BaseContract(f.registry),signature=await operator.signTypedData(fundingTypedData(base,terms));
 if(!refund){f.sql.escrow_bindings.push({order_id:id,terms_payload:f.keys.seal({terms,signature},`escrow-terms:${id}:v1`)});add(root+'/'+prefix+'.reverse.auth.json',{terms,signature});add(root+'/'+prefix+'.reverse.typed.json',fundingTypedData(base,terms));}
 const preparedBase=async(phase:'COMMIT'|'SETTLE'|'CANCEL',nonce:number)=>{const data=encodeFunctionData({abi:settlementAbi,functionName:phase==='COMMIT'?'commitPayout':phase==='SETTLE'?'settleEscrow':'cancelSettlement',args:[terms.id]}),raw=await operator.signTransaction({chainId:84532,type:'legacy',to:f.registry.contracts.ZeeSwapSettlement.address,data,nonce,gas:450000n,gasPrice:20000000n,value:0n}),p={raw,hash:keccak256(raw),nonce,maxCost:'10000000000000'},t=phase==='CANCEL'?{id:terms.id,orderId:id,phase:'CANCEL',payer:operator.address}:terms;
  add(root+'/'+prefix+(phase==='CANCEL'?'.refund.CANCEL':'.'+phase)+'.tx.json',{...p,terms:t,data,gas:'450000',gasPrice:'20000000'});return p;};
 const block_hash='b'.repeat(64),block_height=200,p= {operationId:id,recipient,amount,fee:'10000',feeZatoshi:'10000',txid:'c'.repeat(64),rawTransaction:'abcd',expiryHeight:'1000',selectedNotes:[{pool:'ironwood',txid:'d'.repeat(64),index:0,value:(BigInt(amount)+10000n).toString()}],outputs:[{recipient,amount,ownChange:false,index:0}]},proof={txid:p.txid,blockHeight:block_height,blockHash:block_hash,tipHeight:209,shielded:true,pool:'ironwood',amountZatoshi:amount,feeZatoshi:'10000',recipient};
 if(refund){const cancel=await preparedBase('CANCEL',8);f.sql.source_refunds.push({order_id:id,base_phase:'CANCEL',base_hash:f.keys.lookup('base-tx',cancel.hash),base_payload:f.keys.seal(cancel,`source-refund:${id}:CANCEL:v1`),base_max_cost:cancel.maxCost,base_confirmed:true,base_canonical:true,base_height:190,base_block:'a'.repeat(64),base_receipt:f.keys.seal({hash:cancel.hash,blockHeight:190,blockHash:'0x'+'a'.repeat(64)},`source-refund:${id}:CANCEL-proof:v1`),zcash_hash:f.keys.lookup('zcash-tx',p.txid),zcash_payload:f.keys.seal(p,`source-refund:${id}:ZCASH:v1`),confirmed:true,canonical:true,height:block_height,block_hash,receipt_payload:f.keys.seal(proof,`source-refund:${id}:ZCASH-proof:v1`)});}
 else{for(const [table,phase,ctx,receiptCtx,nonce] of [['escrow_commits','COMMIT',`escrow-commit:${id}:v1`,`escrow-proof:${id}:v1`,8],['escrow_settlements','SETTLE',`escrow-settle:${id}:v1`,`escrow-settle-proof:${id}:v1`,9]] as const){const signed=await preparedBase(phase,nonce);f.sql[table].push({order_id:id,signed_payload:f.keys.seal(signed,ctx),tx_hash:f.keys.lookup('base-tx',signed.hash),max_cost:signed.maxCost,confirmed:true,canonical:true,block_height:190,block_hash:'a'.repeat(64),receipt_payload:f.keys.seal({transactionHash:signed.hash,blockHeight:190,blockHash:'0x'+'a'.repeat(64)},receiptCtx)});}
  f.sql.reverse_payouts.push({order_id:id,tx_hash:f.keys.lookup('zcash-tx',p.txid),signed_payload:f.keys.seal(p,`reverse-payout:${id}:v1`),confirmed:true,canonical:true,block_height,block_hash,receipt_payload:f.keys.seal(proof,`reverse-receipt:${id}:v1`)});
 }
 const dir='/opt/zeeswap-testnet/state/'+(refund?'refund':'reverse')+'-orders/'+id,approved={version:1,orderId:id,recipient,amountZatoshi:amount},digest=approvalDigest(approved),approvedHash=add(dir+'/approved.private.json',approved),preflightHash=add(dir+'/preflight.private.json',{}),guardHash=add(dir+'/guard.private.json',{}),capitalHash=add(dir+'/capital-approval.private.json',{sources:[]}),config={approvedDigest:digest,approvedRequestSha256:approvedHash,preflightConfigSha256:preflightHash,guardConfigSha256:guardHash,capitalApprovalSha256:capitalHash},configHash=add(dir+'/prepared.private.json',config);
 add(dir+'/state.private.json',{orderId:id,approvedDigest:digest,nativeConfigSha256:configHash});add(dir+(refund?'/refund':'/payout')+'-intent.private.json',{state:'DELIVERY_CONFIRMED',request:approved,approvedDigest:digest,prepared:p,receipt:{confirmed:true,shielded:true,approvedDigest:digest,orderId:id,txid:p.txid,blockHeight:block_height,blockHash:block_hash,tipHeight:209,confirmations:10,amount,fee:'10000',recipient}});f.files.push({path:dir+(refund?'/refund':'/payout')+'-intent.private.json.raw.private',bytes:Buffer.from(p.rawTransaction,'hex')});
 return f;
}
test('new reverse settlement and forward refund require exact confirmed native original bytes and SQL receipts',async()=>{
 for(const refund of [false,true]){const f=await nativeFixture(refund);assert.equal((await qualifyClosedJournalInventory(f.trees,f.files,f.sql,f.keys,f.registry)).newClosedOrders,1);
  const native=f.files.find(v=>v.path.endsWith('-intent.private.json'))!,original=native.bytes;for(const mode of ['pending','tamper']){const j=JSON.parse(original.toString());if(mode==='pending')j.state='BROADCAST_UNKNOWN';else j.prepared.rawTransaction='ffff';native.bytes=Buffer.from(JSON.stringify(j));await assert.rejects(qualifyClosedJournalInventory(f.trees,f.files,f.sql,f.keys,f.registry),/CLOSED_RECOVERY_JOURNAL_/);} }
});
