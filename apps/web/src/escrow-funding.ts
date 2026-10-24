import { encodeFunctionData, getAddress, isAddress, parseAbi, type Hex } from 'viem';
import type { EthereumProvider } from './wallet.ts';
const abi=parseAbi(['function fund((bytes32 id,address token,address payer,address refundRecipient,uint256 amount,uint256 nonce,uint256 fundingCutoff,uint256 cancellationAvailableAt) q,bytes signature)','function approve(address spender,uint256 amount) returns (bool)','function allowance(address owner,address spender) view returns (uint256)','function states(bytes32) view returns (uint8)']);
export interface EscrowFunding {network:'base-sepolia';chainId:84532;contract:Hex;token:Hex;signature:Hex;calldata:Hex;terms:{id:Hex;token:Hex;payer:Hex;refundRecipient:Hex;amount:string;nonce:string;fundingCutoff:string;cancellationAvailableAt:string};}
export function validateEscrowFunding(value:unknown,amount:string):asserts value is EscrowFunding {
 const f=value as EscrowFunding,t=f?.terms;
 if(!f||f.network!=='base-sepolia'||f.chainId!==84532||!t||![f.contract,f.token,t.token,t.payer,t.refundRecipient].every(a=>typeof a==='string'&&isAddress(a,{strict:true})&&!/^0x0{40}$/i.test(a))||f.token.toLowerCase()!==t.token.toLowerCase()||t.amount!==amount||!/^0x[0-9a-fA-F]{64}$/.test(t.id)||!/^0x[0-9a-fA-F]{130}$/.test(f.signature)||![t.amount,t.nonce,t.fundingCutoff,t.cancellationAvailableAt].every(n=>typeof n==='string'&&/^(0|[1-9][0-9]{0,77})$/.test(n)))throw Error('Invalid escrow funding instructions.');
 if(BigInt(t.amount)<=0n||BigInt(t.cancellationAvailableAt)<=BigInt(t.fundingCutoff)||f.calldata!==encodeFunctionData({abi,functionName:'fund',args:[{...t,amount:BigInt(t.amount),nonce:BigInt(t.nonce),fundingCutoff:BigInt(t.fundingCutoff),cancellationAvailableAt:BigInt(t.cancellationAvailableAt)},f.signature]}))throw Error('Escrow calldata does not match the accepted terms.');
}
/** Every transaction opens the user's wallet; an unknown send result must be reconciled before another call. */
export async function fundEscrow(provider:EthereumProvider,f:EscrowFunding,amount:string,onSubmitted:(hash:string)=>void){
 validateEscrowFunding(f,amount);
 const guard=async()=>{const [chain,accounts]=await Promise.all([provider.request({method:'eth_chainId'}),provider.request({method:'eth_accounts'})]);if(chain!=='0x14a34'||!Array.isArray(accounts)||typeof accounts[0]!=='string'||getAddress(accounts[0])!==getAddress(f.terms.payer))throw Error('Connect the quoted payer on Base Sepolia before funding.');if(BigInt(f.terms.fundingCutoff)<=BigInt(Math.floor(Date.now()/1000)+30))throw Error('The funding window has closed or is too short.');};
 const send=async(params:unknown[])=>{try{return await provider.request({method:'eth_sendTransaction',params});}catch(e){if(e&&typeof e==='object'&&'code'in e&&e.code===4001)throw Error('Wallet transaction declined.');throw Error('Transaction result unknown. Reconcile your wallet history before retrying.');}};
 await guard();
 const state=await provider.request({method:'eth_call',params:[{to:f.contract,data:encodeFunctionData({abi,functionName:'states',args:[f.terms.id]})},'latest']});
 if(typeof state!=='string'||!/^0x[0-9a-f]+$/i.test(state)||BigInt(state)!==0n)throw Error('This settlement is already funded or cancelled. Refresh its status.');
 const allowance=await provider.request({method:'eth_call',params:[{to:f.token,data:encodeFunctionData({abi,functionName:'allowance',args:[f.terms.payer,f.contract]})},'latest']});
 if(typeof allowance!=='string'||!/^0x[0-9a-f]+$/i.test(allowance))throw Error('Could not verify token allowance.');
 if(BigInt(allowance)<BigInt(amount)){
  await guard();const approved=await send([{from:f.terms.payer,to:f.token,value:'0x0',data:encodeFunctionData({abi,functionName:'approve',args:[f.contract,BigInt(amount)]})}]);
  if(typeof approved!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(approved))throw Error('Approval result unknown. Check your wallet before retrying.');
  // Do not hold a second wallet prompt open while approval is pending.
  throw Error('Approval submitted. Wait for its confirmation, then fund this same order.');
 }
 await guard();const hash=await send([{from:f.terms.payer,to:f.contract,value:'0x0',data:f.calldata}]);
 if(typeof hash!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(hash))throw Error('Funding result unknown. Check the wallet transaction history before any retry.');
 onSubmitted(hash);return hash;
}
