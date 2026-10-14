import { spawn } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import type { PreparedZcashTransaction,ReversePayoutTerms,ReverseZcashVerifier,VerifiedZcashReceipt } from './reverse-settlement.ts';

/** One adapter configuration binds one approved immutable operator request.
 * No caller can supply a wallet path, key, recipient, request file or shell
 * argument over stdin. All stdout (including raw bytes) remains private.
 */
export class LocalReverseWalletAdapter implements ReverseZcashVerifier {
 constructor(private readonly command:string,private readonly args:string[],private readonly approvedDigest?:string){}
 private invoke(command:'prepare'|'recover'|'broadcast'|'receipt'):Promise<any>{
  return new Promise((resolve,reject)=>{
   const child=spawn(this.command,this.args,{stdio:['pipe','pipe','pipe'],windowsHide:true});
   let output='',settled=false;
   const fail=()=>{if(!settled){settled=true;reject(Error('REVERSE_WALLET_UNAVAILABLE_RECONCILE'));}};
   // SDK calculation has a 600-second bound inside the private adapter.
   // Allow its own cleanup/journal handling to complete before the outer bound.
   const timeout=setTimeout(()=>{child.kill();fail();},720000);
   child.on('error',fail);child.stdin.on('error',fail);
   child.stdout.on('data',chunk=>{output+=chunk;if(output.length>4_000_000){child.kill();fail();}});
   child.stderr.on('data',()=>{}); // Never forward private wallet/provider errors.
   child.on('close',code=>{clearTimeout(timeout);if(settled)return;if(code!==0){fail();return;}
    try{const result=JSON.parse(output);settled=true;resolve(result);}catch{fail();}});
   child.stdin.end(JSON.stringify({command}));
  });
 }
 prepare():Promise<PreparedZcashTransaction>{return this.invoke('prepare');}
 recover():Promise<PreparedZcashTransaction>{return this.invoke('recover');}
 async verifyPrepared(prepared:PreparedZcashTransaction,terms:ReversePayoutTerms){
  const recovered=await this.recover();
  const output=recovered.outputs?.filter(o=>o.ownChange===false);
  if(!isDeepStrictEqual(recovered,prepared)||recovered.operationId!==terms.orderId||recovered.recipient!==terms.recipient||recovered.amount!==terms.amountZatoshi
   ||output?.length!==1||output[0].recipient!==terms.recipient||output[0].amount!==terms.amountZatoshi
   ||BigInt(recovered.feeZatoshi)>BigInt(terms.maxFeeZatoshi))throw Error('REVERSE_WALLET_JOURNAL_MISMATCH');
 }
 async broadcast(prepared:PreparedZcashTransaction,terms:ReversePayoutTerms){
  await this.verifyPrepared(prepared,terms);return this.invoke('broadcast');
 }
 async receipt(prepared:PreparedZcashTransaction,terms:ReversePayoutTerms):Promise<VerifiedZcashReceipt|null>{
  await this.verifyPrepared(prepared,terms);
  const proof=await this.invoke('receipt');if(!proof.confirmed)return null;
  const blockHeight=Number(proof.blockHeight),tipHeight=Number(proof.tipHeight);
  if(!this.approvedDigest||proof.approvedDigest!==this.approvedDigest||proof.orderId!==terms.orderId||proof.txid!==prepared.txid||proof.amount!==terms.amountZatoshi||proof.fee!==prepared.feeZatoshi||proof.recipient!==terms.recipient
   ||proof.shielded!==true||!Number.isSafeInteger(blockHeight)||!Number.isSafeInteger(tipHeight)||proof.confirmations!==tipHeight-blockHeight+1)throw Error('REVERSE_WALLET_RECEIPT_MISMATCH');
  return {txid:proof.txid,blockHeight,blockHash:proof.blockHash,tipHeight,tipHash:proof.tipHash,observedAt:proof.observedAt,
   amountZatoshi:proof.amount,feeZatoshi:proof.fee,recipient:proof.recipient,shielded:true,pool:'ironwood'};
 }
}
