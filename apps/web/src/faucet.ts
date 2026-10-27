import {decodeEventLog,decodeFunctionResult,encodeFunctionData,getAddress,isAddress,parseAbi,type Hex} from 'viem';
import {bech32,bech32m} from 'bech32';
import type {EthereumProvider} from './wallet.ts';
import {assets} from './protocol.ts';
export const TAZ_FAUCET='https://fauzec.com/',ETH_FAUCET='https://ethfaucet.com/networks/base';
export const faucetAbi=parseAbi(['function claim()','function TOKEN() view returns(address)','function CLAIM_AMOUNT() view returns(uint256)','function COOLDOWN() view returns(uint256)','function nextClaimAt(address) view returns(uint256)','event Claimed(address indexed account,uint256 amount,uint256 nextClaimAt)']);
const tokenAbi=parseAbi(['function balanceOf(address) view returns(uint256)','event Transfer(address indexed from,address indexed to,uint256 value)']);
export const CLAIM_UNITS=10000000n,COOLDOWN_SECONDS=86400n;
export class FaucetSendError extends Error {constructor(message:string,readonly uncertain=false){super(message);}}
export function faucetAddress(value:string|undefined):Hex|null {return value&&isAddress(value,{strict:true})&&!/^0x0{40}$/i.test(value)?getAddress(value):null;}
export function testnetFaucetReceiver(value:string):boolean {try{const v=value.trim();if(v.startsWith('utest1'))return bech32m.decode(v,512).prefix==='utest';if(v.startsWith('ztestsapling1'))return bech32.decode(v,512).prefix==='ztestsapling';return false;}catch{return false;}}
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
async function network(p:EthereumProvider){if(await p.request({method:'eth_chainId'})!=='0x14a34')throw Error('Switch your wallet to Base Sepolia before using the USDC faucet.');}
async function call(p:EthereumProvider,to:Hex,abi:typeof faucetAbi|typeof tokenAbi,name:string,args:unknown[]=[]):Promise<any>{const data=encodeFunctionData({abi,functionName:name,args} as any),raw=await p.request({method:'eth_call',params:[{to,data},'latest']});if(typeof raw!=='string'||!/^0x[a-fA-F0-9]+$/.test(raw))throw Error('The faucet response could not be verified.');return decodeFunctionResult({abi,functionName:name,data:raw as Hex} as any);}
export interface FaucetState {reserve:bigint;nextAt:bigint;gas:bigint;chainTime:bigint;eligible:boolean;}
export async function readFaucet(p:EthereumProvider,address:Hex,account:Hex):Promise<FaucetState>{
 await network(p);const code=await p.request({method:'eth_getCode',params:[address,'latest']});if(typeof code!=='string'||!/^0x(?:[a-fA-F0-9]{2})+$/.test(code))throw Error('The USDC faucet is not deployed on Base Sepolia.');
 const [token,amount,cooldown,next,reserve,gas,block]=await Promise.all([call(p,address,faucetAbi,'TOKEN'),call(p,address,faucetAbi,'CLAIM_AMOUNT'),call(p,address,faucetAbi,'COOLDOWN'),call(p,address,faucetAbi,'nextClaimAt',[account]),call(p,assets.mockUSDC.contractAddress as Hex,tokenAbi,'balanceOf',[address]),p.request({method:'eth_getBalance',params:[account,'latest']}),p.request({method:'eth_getBlockByNumber',params:['latest',false]})]);
 if(!same(token,assets.mockUSDC.contractAddress)||amount!==CLAIM_UNITS||cooldown!==COOLDOWN_SECONDS||typeof next!=='bigint'||typeof reserve!=='bigint'||typeof gas!=='string'||!/^0x[0-9a-f]+$/i.test(gas)||!block||typeof block!=='object'||!('timestamp'in block)||typeof block.timestamp!=='string'||!/^0x[0-9a-f]+$/i.test(block.timestamp))throw Error('This faucet does not match the configured USDC testnet contract.');
 const chainTime=BigInt(block.timestamp);return{reserve,nextAt:next,gas:BigInt(gas),chainTime,eligible:reserve>=CLAIM_UNITS&&next<=chainTime&&BigInt(gas)>0n};
}
export async function sendFaucetClaim(p:EthereumProvider,address:Hex,account:Hex):Promise<Hex>{
 const state=await readFaucet(p,address,account);if(state.reserve<CLAIM_UNITS)throw Error('The USDC faucet pool is empty.');if(state.nextAt>state.chainTime)throw Error('This wallet is still in its 24-hour USDC cooldown.');if(state.gas===0n)throw Error('Get Base Sepolia ETH for network gas before claiming USDC.');
 await network(p);const accounts=await p.request({method:'eth_accounts'});if(!Array.isArray(accounts)||typeof accounts[0]!=='string'||!same(accounts[0],account))throw Error('Reconnect the wallet that will receive this claim.');
 let hash;try{hash=await p.request({method:'eth_sendTransaction',params:[{from:account,to:address,value:'0x0',data:encodeFunctionData({abi:faucetAbi,functionName:'claim'})}]});}catch(e){if(e&&typeof e==='object'&&'code'in e&&e.code===4001)throw new FaucetSendError('Claim declined in your wallet.');throw new FaucetSendError('Claim result unknown. Check this wallet’s transaction history before another claim.',true);}
 if(typeof hash!=='string'||!/^0x[a-f0-9]{64}$/i.test(hash))throw new FaucetSendError('Claim result unknown. Check this wallet’s history before another claim.',true);return hash as Hex;
}
export async function faucetReceipt(p:EthereumProvider,address:Hex,account:Hex,hash:Hex):Promise<{hash:Hex;nextAt:bigint}|null>{
 await network(p);const r=await p.request({method:'eth_getTransactionReceipt',params:[hash]}) as any;if(r===null)return null;
 if(r?.status==='0x0')throw Error('The faucet transaction reverted. No successful claim is confirmed.');
 if(r?.status!=='0x1'||r.transactionHash?.toLowerCase()!==hash.toLowerCase()||!same(r.to??'',address)||!same(r.from??'',account)||!/^0x[a-f0-9]{64}$/i.test(r.blockHash)||!/^0x[0-9a-f]+$/i.test(r.blockNumber)||!Array.isArray(r.logs))throw Error('The faucet receipt could not be verified.');
 const [tx,block]=await Promise.all([p.request({method:'eth_getTransactionByHash',params:[hash]}),p.request({method:'eth_getBlockByNumber',params:[r.blockNumber,false]})]) as any[];
 if(!tx||!same(tx.from??'',account)||!same(tx.to??'',address)||tx.input!==encodeFunctionData({abi:faucetAbi,functionName:'claim'})||BigInt(tx.value??'-1')!==0n||!block||block.hash!==r.blockHash)throw Error('The claim transaction or canonical block does not match.');
 const events=r.logs.filter((l:any)=>same(l.address??'',address)&&l.removed!==true).flatMap((l:any)=>{try{return[decodeEventLog({abi:faucetAbi,data:l.data,topics:l.topics})];}catch{return[];}}).filter((e:any)=>e.eventName==='Claimed') as any[];
 const transfers=r.logs.filter((l:any)=>same(l.address??'',assets.mockUSDC.contractAddress)&&l.removed!==true).flatMap((l:any)=>{try{return[decodeEventLog({abi:tokenAbi,data:l.data,topics:l.topics})];}catch{return[];}}).filter((e:any)=>e.eventName==='Transfer'&&same(e.args.from,address)&&same(e.args.to,account)&&e.args.value===CLAIM_UNITS);
 if(events.length!==1||transfers.length!==1||!same(events[0].args.account,account)||events[0].args.amount!==CLAIM_UNITS||typeof events[0].args.nextClaimAt!=='bigint'||events[0].args.nextClaimAt!==BigInt(block.timestamp)+COOLDOWN_SECONDS)throw Error('The receipt does not prove the exact 10 USDC claim to this wallet.');
 return {hash,nextAt:events[0].args.nextClaimAt};
}
