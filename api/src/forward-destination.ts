import type { BaseContract, IncludedBaseReceipt } from './base-contract.ts';

/** Recheck a durable, authenticated PAY observation without granting the API signer data. */
export async function canonicalIncludedPayout(base:Pick<BaseContract,'client'>,proof:IncludedBaseReceipt,expected:{recipient:string;amount:string;blockHeight:unknown}):Promise<boolean>{
 if(proof.phase!=='PAY'||!/^0x[0-9a-fA-F]{64}$/.test(proof.hash)||!/^0x[0-9a-fA-F]{64}$/.test(proof.blockHash)
  ||!Number.isSafeInteger(proof.blockNumber)||proof.blockNumber<1||String(proof.blockNumber)!==String(expected.blockHeight)
  ||typeof proof.recipient!=='string'||proof.recipient.toLowerCase()!==expected.recipient.toLowerCase()||proof.amount!==expected.amount)throw Error('DESTINATION_EVIDENCE_UNAVAILABLE');
 try{
  const [chain,block,receipt]=await Promise.all([base.client.getChainId(),base.client.getBlock({blockNumber:BigInt(proof.blockNumber)}),base.client.getTransactionReceipt({hash:proof.hash})]);
  return chain===84532&&block.hash===proof.blockHash&&receipt.status==='success'&&receipt.transactionHash===proof.hash
   &&receipt.blockHash===proof.blockHash&&receipt.blockNumber===BigInt(proof.blockNumber);
 }catch{return false;}
}
