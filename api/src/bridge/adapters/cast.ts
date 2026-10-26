import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile,unlink,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {encodeFunctionData,decodeFunctionData,keccak256,parseTransaction,recoverTransactionAddress,verifyTypedData,type Hex} from 'viem';
import {PrivateData} from '../../private-data.ts';
import {digest,integer,type Books,type Order} from '../model.ts';
import {bridgeAbi,bridgeDomain,mintTypes,redemptionTypes,mintNonce,redemptionNonce,CanonicalBridgeBase} from './base.ts';
import {pinnedFile,pinnedExecutable,validateBridgeCastProfile,type BridgeCastProfile} from './profile.ts';
import {BaseOperationJournal} from './operation-journal.ts';

export type SignedBridgeBase={operationId:string;phase:'MINT'|'CANCEL'|'ACK';orderId:string;raw:Hex;hash:Hex;nonce:number;maxCostWei:string;calldata:Hex};
const execute=promisify(execFile),safeJSON=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x);
export class CastBridgeBaseSigner {
 readonly journal:BaseOperationJournal;
 constructor(readonly base:CanonicalBridgeBase,readonly profile:BridgeCastProfile,keys:PrivateData){validateBridgeCastProfile(profile);this.journal=new BaseOperationJournal(profile.journalRoot,keys);}
 private requireQualified(){
  // Concrete source/deployment reads and local signing are implemented, but a
  // production native source/delivery proof coordinator is not yet qualified.
  // Persisted DEPOSIT_FINALIZED/COMPLETED rows alone cannot authorize an effect.
  if(!this.base.localTest)throw Error('BRIDGE_NATIVE_AUTHORITY_NOT_QUALIFIED');if(!this.profile.enabled)throw Error('BRIDGE_CAST_DISABLED');
 }
 private async cast(args:string[],role:'operator'|'authorizer'){
  const p=this.profile;if(!p.enabled)throw Error('BRIDGE_CAST_DISABLED');await pinnedExecutable(p.cast);await Promise.all([pinnedFile(p[`${role}Password`],true),pinnedFile(p[`${role}Keystore`],true)]);
  const env=Object.fromEntries(['PATH','SystemRoot','TEMP','TMP','HOME','USERPROFILE'].flatMap(k=>process.env[k]===undefined?[]:[[k,process.env[k]!]]));
  try{const result=await execute(p.cast.path,[...args,'--keystore',p[`${role}Keystore`].path,'--password-file',p[`${role}Password`].path],{windowsHide:true,timeout:120000,maxBuffer:1000000,env});return result.stdout.trim();}catch{throw Error('BRIDGE_CAST_UNAVAILABLE_RECONCILE');}
 }
 private async identity(role:'operator'|'authorizer'){if((await this.cast(['wallet','address'],role)).toLowerCase()!==this.base.profile[role].toLowerCase())throw Error('BRIDGE_CAST_ACCOUNT_IDENTITY');}
 async authorize(kind:'Mint'|'Redemption',o:Readonly<Order>,b:Readonly<Books>){
  this.requireQualified();
  if(!b.pair)throw Error('BRIDGE_RECONCILIATION_REQUIRED');const counters=await this.base.readAt(b.pair.base);if(counters.paused)throw Error('BRIDGE_CONTRACT_PAUSED');
  if(kind==='Mint'&&(o.status!=='DEPOSIT_FINALIZED'||o.direction!=='TAZ_TO_ZEETAZ'||!o.source))throw Error('BRIDGE_MINT_SOURCE_REQUIRED');
  if(kind==='Redemption'&&(o.status!=='QUOTED'||o.direction!=='ZEETAZ_TO_TAZ'||!o.payer))throw Error('BRIDGE_REDEMPTION_QUOTE_REQUIRED');
  const binding=digest([kind,o.id,o.commitment,o.recipient,o.payer,o.amountAtomic]),key='auth:'+kind+':'+o.commitment;
  return this.journal.run(async(book,save)=>{
   let record=book.records[key];if(record){if(record.binding!==binding||!record.signature)throw Error('BRIDGE_AUTHORIZATION_RECONCILIATION_REQUIRED');return {terms:record.terms,signature:record.signature as Hex};}
   const deadline=kind==='Mint'?Math.floor(Date.now()/1000)+3600:Math.floor(Date.parse(o.expiresAt)/1000);if(deadline<=Date.now()/1000)throw Error('BRIDGE_AUTHORIZATION_EXPIRED');
   const common={id:o.commitment,amount:o.amountAtomic,nonce:(kind==='Mint'?mintNonce(o.commitment as Hex):redemptionNonce(o.commitment as Hex)).toString(),deadline:String(deadline)},terms=kind==='Mint'?{...common,recipient:o.recipient}:{...common,payer:o.payer,payoutCommitment:o.commitment},types=kind==='Mint'?mintTypes:redemptionTypes;
   record=book.records[key]={binding,terms,signingStarted:true};await save();await this.identity('authorizer');await mkdir(this.profile.root,{recursive:true,mode:0o700});const path=join(this.profile.root,randomUUID()+'.typed.private.json');
   try{await writeFile(path,safeJSON({domain:bridgeDomain(this.base.profile),types,primaryType:kind,message:terms}),{flag:'wx',mode:0o600});const signature=await this.cast(['wallet','sign','--data','--from-file',path],'authorizer');
    if(!/^0x[a-f0-9]{130}$/i.test(signature)||!await verifyTypedData({address:this.base.profile.authorizer,domain:bridgeDomain(this.base.profile),types:types as any,primaryType:kind,message:terms as any,signature:signature as Hex}))throw Error('BRIDGE_CAST_AUTHORIZATION_SIGNATURE');if(deadline<=Date.now()/1000)throw Error('BRIDGE_AUTHORIZATION_EXPIRED');await this.base.readAt(b.pair!.base);record.signature=signature;await save();return {terms,signature:signature as Hex};
   }finally{await unlink(path).catch(()=>{});}
  });
 }
 async prepare(phase:SignedBridgeBase['phase'],o:Readonly<Order>,b:Readonly<Books>):Promise<SignedBridgeBase>{
  this.requireQualified();
  if(!b.pair)throw Error('BRIDGE_RECONCILIATION_REQUIRED');await this.base.readAt(b.pair.base);let calldata:Hex;
  if(phase==='MINT'){const a=await this.authorize('Mint',o,b),q=a.terms;calldata=encodeFunctionData({abi:bridgeAbi,functionName:'mint',args:[{id:q.id,recipient:q.recipient,amount:BigInt(q.amount),nonce:BigInt(q.nonce),deadline:BigInt(q.deadline)},a.signature]});}
  else if(phase==='CANCEL'){if(o.status!=='DEPOSIT_FINALIZED'||!o.source||o.direction!=='TAZ_TO_ZEETAZ')throw Error('BRIDGE_CANCEL_SOURCE_REQUIRED');calldata=encodeFunctionData({abi:bridgeAbi,functionName:'cancelMint',args:[o.commitment as Hex]});}
  else {if(o.status!=='COMPLETED'||o.direction!=='ZEETAZ_TO_TAZ'||!o.destination||o.destination.network!=='zcash-testnet')throw Error('BRIDGE_ACK_DELIVERY_REQUIRED');calldata=encodeFunctionData({abi:bridgeAbi,functionName:'acknowledgeRedemption',args:[o.commitment as Hex,('0x'+digest([o.salt,o.destination])) as Hex]});}
  const operationId=digest(['bridge-base-v1',phase,o.commitment]),binding=digest([phase,o.id,calldata]);
  return this.journal.run(async(book,save)=>{
   const old=book.records[operationId];if(old){if(old.binding!==binding||!old.prepared)throw Error('BRIDGE_BASE_SIGNING_RECONCILIATION_REQUIRED');return old.prepared as SignedBridgeBase;}
   if(book.activeTransaction)throw Error('BRIDGE_BASE_PRIOR_TRANSACTION_UNRESOLVED');await this.identity('operator');const p=this.base.profile;
   const views=await Promise.all(this.base.clients.map(async c=>({latest:await c.getTransactionCount({address:p.operator,blockTag:'latest'}),pending:await c.getTransactionCount({address:p.operator,blockTag:'pending'})})));if(views.some(v=>v.latest!==views[0].latest||v.pending!==v.latest))throw Error('BRIDGE_BASE_NONCE_DISAGREEMENT');const counts=views.map(v=>v.latest);
   const record:Record<string,any>=book.records[operationId]={binding,signingStarted:true};book.activeTransaction=operationId;await save();
   await this.base.readAt(b.pair!.base);const raw=await this.cast(['mktx',p.contractAddress,calldata,'--legacy','--gas-limit',p.maximumGas,'--gas-price',p.gasPriceWei,'--nonce',String(counts[0]),'--chain','84532','--value','0','--rpc-url',p.rpcUrls[0]],'operator') as Hex;await this.base.readAt(b.pair!.base);
   const tx=parseTransaction(raw);if(tx.type!=='legacy'||tx.chainId!==84532||tx.nonce!==counts[0]||tx.to?.toLowerCase()!==p.contractAddress.toLowerCase()||(tx.value??0n)!==0n||tx.data!==calldata||tx.gas!==integer(p.maximumGas)||tx.gasPrice!==integer(p.gasPriceWei)||tx.gas!*tx.gasPrice!>integer(p.maximumTransactionCostWei)||(await recoverTransactionAddress({serializedTransaction:raw as any})).toLowerCase()!==p.operator.toLowerCase())throw Error('BRIDGE_BASE_SIGNED_BINDING');
   const prepared:SignedBridgeBase={operationId,phase,orderId:o.id,raw,hash:keccak256(raw),nonce:counts[0],maxCostWei:p.maximumTransactionCostWei,calldata};record.prepared=prepared;await save();return prepared;
  });
 }
 async broadcast(prepared:SignedBridgeBase,b:Readonly<Books>){
  this.requireQualified();
  if(!this.profile.enabled||!b.pair)throw Error('BRIDGE_CAST_DISABLED');await this.base.readAt(b.pair.base);
  return this.journal.run(async(book,save)=>{const record=book.records[prepared.operationId];if(!record?.prepared||digest(record.prepared)!==digest(prepared)||book.activeTransaction!==prepared.operationId)throw Error('BRIDGE_BASE_ORIGINAL_REQUIRED');if(record.broadcastAttempted)throw Error('BRIDGE_BASE_BROADCAST_RECONCILIATION_REQUIRED');
   record.broadcastAttempted=true;await save();
   const views=await Promise.all(this.base.clients.map(async c=>({latest:await c.getTransactionCount({address:this.base.profile.operator,blockTag:'latest'}),pending:await c.getTransactionCount({address:this.base.profile.operator,blockTag:'pending'})})));if(views.some(v=>v.latest!==prepared.nonce||v.pending!==prepared.nonce))throw Error('BRIDGE_BASE_ORIGINAL_NONCE_RECONCILIATION_REQUIRED');
   await this.base.readAt(b.pair!.base);if(prepared.phase==='MINT'){const decoded=decodeFunctionData({abi:bridgeAbi,data:prepared.calldata});if(decoded.functionName!=='mint'||decoded.args[0].deadline<=BigInt(Math.floor(Date.now()/1000)))throw Error('BRIDGE_AUTHORIZATION_EXPIRED');}
   return this.base.clients[0].sendRawTransaction({serializedTransaction:prepared.raw});
  });
 }
 async reconcile(prepared:SignedBridgeBase,anchor:Books['pair']){
  if(!anchor)throw Error('BRIDGE_RECONCILIATION_REQUIRED');await this.base.readAt(anchor.base);
  const receipts=await Promise.all(this.base.clients.map(async c=>{const receipt=await c.getTransactionReceipt({hash:prepared.hash});if(receipt.status!=='success'||receipt.blockNumber>BigInt(anchor.base.height)||(await c.getBlock({blockNumber:receipt.blockNumber})).hash!==receipt.blockHash)throw Error('BRIDGE_BASE_ORIGINAL_NOT_FINAL');const l1=(receipt as any).l1Fee;if(!this.base.localTest&&typeof l1!=='bigint')throw Error('BRIDGE_BASE_L1_FEE_UNAVAILABLE');const fee=receipt.gasUsed*receipt.effectiveGasPrice+BigInt(l1??0);if(fee>integer(prepared.maxCostWei))throw Error('BRIDGE_BASE_ACTUAL_FEE_CAP');return {hash:receipt.transactionHash,block:receipt.blockHash,height:receipt.blockNumber.toString(),feeWei:fee.toString()};}));
  if(safeJSON(receipts[0])!==safeJSON(receipts[1]))throw Error('BRIDGE_BASE_RECEIPT_DISAGREEMENT');
  await this.journal.run(async(book,save)=>{const record=book.records[prepared.operationId];if(!record?.prepared||digest(record.prepared)!==digest(prepared))throw Error('BRIDGE_BASE_ORIGINAL_REQUIRED');record.finalized=receipts[0];if(book.activeTransaction===prepared.operationId)delete book.activeTransaction;await save();});return receipts[0];
 }
}
