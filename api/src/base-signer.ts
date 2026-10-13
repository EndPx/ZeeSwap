import { spawn } from 'node:child_process';
import { keccak256, parseTransaction, recoverTransactionAddress, recoverTypedDataAddress, getAddress, type Hex, type TransactionSerialized } from 'viem';
import { payoutCall, payoutTypedData, type BaseRegistry, type PayoutTerms, type BasePhase } from './base-contract.ts';

export interface PreparedBaseTransaction {raw:Hex;hash:Hex;nonce:number;maxCost:string}
export interface BaseSigner {
 authorize(terms:PayoutTerms):Promise<Hex>;
 prepare(terms:PayoutTerms,phase:BasePhase):Promise<PreparedBaseTransaction>;
}
export class LocalBaseSigner implements BaseSigner {
 constructor(private readonly command:string,private readonly args:string[]){}
 private invoke(request:unknown):Promise<any>{return new Promise((resolve,reject)=>{
  const child=spawn(this.command,this.args,{stdio:['pipe','pipe','pipe'],windowsHide:true});let output='',error='',done=false;
  const fail=()=>{if(!done){done=true;reject(Error('BASE_SIGNER_UNAVAILABLE'));}};
  const timer=setTimeout(()=>{child.kill();fail();},120000);
  child.on('error',fail);child.stdin.on('error',fail);
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>32768){child.kill();fail();}});
  child.stderr.on('data',chunk=>{error+=chunk;if(error.length>8192){child.kill();fail();}});
  child.on('close',code=>{clearTimeout(timer);if(done)return;if(code!==0){fail();return;}try{const result=JSON.parse(output);done=true;resolve(result);}catch{fail();}});
  child.stdin.end(JSON.stringify(request));
 });}
 async authorize(terms:PayoutTerms){return (await this.invoke({command:'authorize',terms,phase:'RESERVE'})).signature as Hex;}
 prepare(terms:PayoutTerms,phase:BasePhase){return this.invoke({command:'prepare',terms,phase});}
}
export async function validatePrepared(registry:BaseRegistry,terms:PayoutTerms,signature:Hex,phase:BasePhase,prepared:PreparedBaseTransaction){
 if(getAddress(await recoverTypedDataAddress({...payoutTypedData(registry,terms),signature}))!==getAddress(registry.operator))throw Error('INVALID_BASE_SIGNATURE');
 const tx=parseTransaction(prepared.raw);
 if(tx.type!=='legacy'||keccak256(prepared.raw)!==prepared.hash||!Number.isSafeInteger(prepared.nonce)||prepared.nonce<0||tx.nonce!==prepared.nonce||tx.chainId!==84532
  ||getAddress(await recoverTransactionAddress({serializedTransaction:prepared.raw as TransactionSerialized}))!==getAddress(registry.operator)
  ||tx.to?.toLowerCase()!==registry.contracts.ZeeSwapSettlement.address.toLowerCase()||(tx.value??0n)!==0n
  ||tx.data!==payoutCall(registry,terms,signature,phase)||!tx.gas||tx.gas>450000n)throw Error('INVALID_SIGNED_TRANSACTION');
 const gasPrice=tx.gasPrice;
 if(!gasPrice||gasPrice>20000000n||!/^[1-9][0-9]*$/.test(prepared.maxCost)||BigInt(prepared.maxCost)>10000000000000n||tx.gas*gasPrice>BigInt(prepared.maxCost))throw Error('INVALID_SIGNER_FEE_CAP');
}
