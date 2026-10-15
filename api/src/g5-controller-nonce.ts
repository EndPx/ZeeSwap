import {keccak256,getAddress,recoverTransactionAddress,parseTransaction,type TransactionSerialized,type Hex} from 'viem';
export interface G5ControllerRaw {sequence:number;raw:TransactionSerialized;hash:Hex;nonce:number;}
/** Inclusion readiness is independent of each order's finalized receipt gate. */
export async function g5ControllerNonceReadiness(input:{operator:string;settlement:string;latestNonce:number;pendingNonce:number;attempts:G5ControllerRaw[]},io:{transaction(hash:Hex):Promise<any>;receipt(hash:Hex):Promise<any>;block(number:bigint):Promise<any>}){
 const unmined:number[]=[],seen=new Set<number>();
 for(const signed of input.attempts){
  const parsed=parseTransaction(signed.raw);
  if(keccak256(signed.raw)!==signed.hash||parsed.chainId!==84532||parsed.nonce!==signed.nonce||seen.has(signed.nonce)||getAddress(await recoverTransactionAddress({serializedTransaction:signed.raw}))!==getAddress(input.operator)||getAddress(parsed.to!)!==getAddress(input.settlement))throw Error('G5_CONTROLLER_ORIGINAL_RAW_CONTRADICTION');
  seen.add(signed.nonce);const tx=await io.transaction(signed.hash);
  if(!tx||tx.blockHash===null){if(signed.nonce<input.latestNonce)throw Error('G5_CONTROLLER_ORIGINAL_RAW_NONCE_CONFLICT');unmined.push(signed.sequence);continue;}
  const receipt=await io.receipt(signed.hash),block=await io.block(receipt.blockNumber);
  if(receipt.status!=='success'||receipt.transactionHash!==signed.hash||receipt.blockHash!==tx.blockHash||block.hash!==receipt.blockHash||tx.nonce!==signed.nonce||tx.input!==parsed.data||getAddress(tx.from)!==getAddress(input.operator)||getAddress(tx.to!)!==getAddress(parsed.to!)||tx.value!==(parsed.value??0n)||input.latestNonce<=signed.nonce)throw Error('G5_CONTROLLER_MINED_RAW_CONTRADICTION');
 }
 if(unmined.length>1)throw Error('G5_CONTROLLER_MULTIPLE_UNMINED_OPERATOR_RAWS');
 return {operatorRawPending:unmined.length>0||input.pendingNonce!==input.latestNonce,operatorRawSequence:unmined[0]};
}
