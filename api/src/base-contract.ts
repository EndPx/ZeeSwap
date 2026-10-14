import { readFileSync } from 'node:fs';
import { createPublicClient, http, parseAbi, encodeFunctionData, decodeEventLog, keccak256, toHex,
  getAddress, recoverTypedDataAddress, type Address, type Hex } from 'viem';
import { baseSepolia } from 'viem/chains';

export const settlementAbi = parseAbi([
 'function token() view returns (address)', 'function inventory() view returns (uint256)',
 'function availableInventory() view returns (uint256)', 'function escrowLiability() view returns (uint256)',
 'function states(bytes32) view returns (uint8)', 'function hasRole(bytes32,address) view returns (bool)',
 'function payouts(bytes32) view returns (address recipient,uint256 amount,uint256 deadline)',
 'function escrows(bytes32) view returns (address payer,address refundRecipient,uint256 amount,uint256 cancellationAvailableAt)',
 'function reservePayout((bytes32 id,address token,address recipient,uint256 amount,uint256 nonce,uint256 deadline) q,bytes signature)',
 'function executePayout(bytes32 id)', 'function cancelSettlement(bytes32 id)',
 'function fund((bytes32 id,address token,address payer,address refundRecipient,uint256 amount,uint256 nonce,uint256 fundingCutoff,uint256 cancellationAvailableAt) q,bytes signature)',
 'function commitPayout(bytes32 id)', 'function settleEscrow(bytes32 id)', 'function refund(bytes32 id)',
 'event PayoutReserved(bytes32 indexed id,address indexed recipient,uint256 amount)',
 'event Paid(bytes32 indexed id,address indexed recipient,uint256 amount)',
 'event SettlementCancelled(bytes32 indexed id)',
 'event Funded(bytes32 indexed id,address indexed payer,uint256 amount,uint256 cancellationAvailableAt)',
 'event PayoutCommitted(bytes32 indexed id)', 'event EscrowSettled(bytes32 indexed id,uint256 amount)',
 'event Refunded(bytes32 indexed id,address indexed recipient,uint256 amount)',
]);
const tokenAbi = parseAbi(['function decimals() view returns (uint8)', 'function hasRole(bytes32,address) view returns (bool)']);
export const payoutTypes = {Payout:[{name:'id',type:'bytes32'},{name:'token',type:'address'},
 {name:'recipient',type:'address'},{name:'amount',type:'uint256'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}]} as const;
export interface Deployment { address:Address; transactionHash:Hex; blockNumber:number; blockHash:Hex; runtimeCodeHash:Hex }
export interface BaseRegistry { chainId:84532; rpcUrl:string; deployer:Address; operator:Address;
 contracts:{MockUSDC:Deployment;ZeeSwapSettlement:Deployment} }
export const loadBaseRegistry=():BaseRegistry=>JSON.parse(readFileSync(new URL('../../contracts/deployments/base-sepolia.json',import.meta.url),'utf8'));
export const publicSettlementId=(id:string):Hex=>keccak256(toHex(id));
export const authNonce=(id:Hex,kind:'Payout'|'Funding')=>BigInt(keccak256(toHex(`${kind}:${id}`))).toString();
export interface PayoutTerms {id:Hex;token:Address;recipient:Address;amount:string;nonce:string;deadline:string}
export const jsonSafe=(value:unknown)=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v);
export const domain=(registry:BaseRegistry)=>({name:'ZeeSwapSettlement',version:'1',chainId:84532,verifyingContract:registry.contracts.ZeeSwapSettlement.address});
export function payoutTypedData(registry:BaseRegistry,q:PayoutTerms){return {domain:domain(registry),types:payoutTypes,primaryType:'Payout' as const,
 message:{...q,amount:BigInt(q.amount),nonce:BigInt(q.nonce),deadline:BigInt(q.deadline)}};}
export type BasePhase='RESERVE'|'PAY';
export function payoutCall(registry:BaseRegistry,terms:PayoutTerms,signature:Hex,phase:BasePhase){
 return phase==='RESERVE'?encodeFunctionData({abi:settlementAbi,functionName:'reservePayout',args:[payoutTypedData(registry,terms).message,signature]}):
  encodeFunctionData({abi:settlementAbi,functionName:'executePayout',args:[terms.id]});
}
export interface ConfirmedBaseReceipt {hash:Hex;blockNumber:number;blockHash:Hex;fee:string;phase:BasePhase;id:Hex;recipient:Address;amount:string}

export class BaseContract {
 readonly client;
 constructor(readonly registry:BaseRegistry,readonly localTest=false){
  const url=new URL(registry.rpcUrl);
  if(registry.chainId!==84532||!(url.protocol==='https:'||(localTest&&url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname))))throw Error('INVALID_BASE_CONFIG');
  this.client=createPublicClient({chain:baseSepolia,transport:http(registry.rpcUrl,{timeout:15000,retryCount:1})});
 }
 async heads(){
  if(await this.client.getChainId()!==84532)throw Error('WRONG_BASE_NETWORK');
  const [latest,finalized]=await Promise.all([this.client.getBlock(),this.client.getBlock({blockTag:'finalized'})]);
  if(latest.number===null||finalized.number===null||finalized.number>latest.number||!latest.hash||!finalized.hash)throw Error('INVALID_BASE_HEAD');
  if(!this.localTest&&(Math.abs(Date.now()-Number(latest.timestamp)*1000)>120000))throw Error('STALE_BASE_HEAD');
  if((await this.client.getBlock({blockNumber:finalized.number})).hash!==finalized.hash)throw Error('BASE_REORG');
  return {latest,finalized};
 }
 async preflight(){
  const heads=await this.heads();
  for(const deployment of Object.values(this.registry.contracts)){
   const receipt=await this.client.getTransactionReceipt({hash:deployment.transactionHash});
   const block=await this.client.getBlock({blockNumber:BigInt(deployment.blockNumber)});
   const code=await this.client.getCode({address:deployment.address});
   if(receipt.status!=='success'||receipt.contractAddress?.toLowerCase()!==deployment.address.toLowerCase()
    ||receipt.blockHash!==deployment.blockHash||block.hash!==deployment.blockHash||receipt.blockNumber!==BigInt(deployment.blockNumber)
    ||heads.finalized.number<receipt.blockNumber||!code||keccak256(code)!==deployment.runtimeCodeHash)throw Error('BASE_DEPLOYMENT_NOT_READY');
  }
  const address=this.registry.contracts.ZeeSwapSettlement.address,token=this.registry.contracts.MockUSDC.address;
  const [asset,decimals,operator,signer,minter,tokenAdmin,available,inventory]=await Promise.all([
   this.client.readContract({address,abi:settlementAbi,functionName:'token'}),
   this.client.readContract({address:token,abi:tokenAbi,functionName:'decimals'}),
   ...['OPERATOR_ROLE','QUOTE_SIGNER_ROLE'].map(role=>this.client.readContract({address,abi:settlementAbi,functionName:'hasRole',args:[keccak256(toHex(role)),this.registry.operator]})),
   this.client.readContract({address:token,abi:tokenAbi,functionName:'hasRole',args:[keccak256(toHex('MINTER_ROLE')),this.registry.operator]}),
   this.client.readContract({address:token,abi:tokenAbi,functionName:'hasRole',args:[`0x${'00'.repeat(32)}`,this.registry.operator]}),
   this.client.readContract({address,abi:settlementAbi,functionName:'availableInventory'}),
   this.client.readContract({address,abi:settlementAbi,functionName:'inventory'}),
  ]);
  if(getAddress(asset as string)!==getAddress(token)||decimals!==6||!operator||!signer||minter||tokenAdmin)throw Error('BASE_AUTHORITY_MISMATCH');
  return {chainId:84532,latest:Number(heads.latest.number),finalized:Number(heads.finalized.number),
   availableInventory:String(available),inventory:String(inventory),operator:this.registry.operator,settlement:address,token};
 }
 async assertSignature(terms:PayoutTerms,signature:Hex){
  if(getAddress(await recoverTypedDataAddress({...payoutTypedData(this.registry,terms),signature}))!==getAddress(this.registry.operator))throw Error('INVALID_BASE_SIGNATURE');
 }
 state(id:Hex){return this.client.readContract({address:this.registry.contracts.ZeeSwapSettlement.address,abi:settlementAbi,functionName:'states',args:[id]});}
 async receipt(hash:Hex,phase:BasePhase,terms:PayoutTerms):Promise<ConfirmedBaseReceipt|null>{
  const receipt=await this.client.getTransactionReceipt({hash}).catch(error=>{
   if(error.name==='TransactionReceiptNotFoundError')return null;throw error;
  });
  if(!receipt)return null;
  if(receipt.status!=='success')throw Error('BASE_TRANSACTION_REVERTED');
  const {finalized}=await this.heads();
  if((await this.client.getBlock({blockNumber:receipt.blockNumber})).hash!==receipt.blockHash)throw Error('BASE_REORG');
  if(receipt.blockNumber>finalized.number)return null;
  const transaction=await this.client.getTransaction({hash});
  if(transaction.from.toLowerCase()!==this.registry.operator.toLowerCase()||transaction.to?.toLowerCase()!==this.registry.contracts.ZeeSwapSettlement.address.toLowerCase()||transaction.value!==0n)throw Error('BASE_RECEIPT_MISMATCH');
  const events=receipt.logs.filter(log=>log.address.toLowerCase()===this.registry.contracts.ZeeSwapSettlement.address.toLowerCase()).flatMap(log=>{
   try{return [decodeEventLog({abi:settlementAbi,data:log.data,topics:log.topics})];}catch{return [];}
  });
  const wanted=phase==='RESERVE'?'PayoutReserved':'Paid';
  const matches=events.filter(e=>e.eventName===wanted);const args=matches[0]?.args as any;
  if(matches.length!==1||args.id!==terms.id||getAddress(args.recipient)!==getAddress(terms.recipient)||args.amount!==BigInt(terms.amount))throw Error('BASE_RECEIPT_MISMATCH');
  const l1=(receipt as any).l1Fee;
  if(!this.localTest&&typeof l1!=='bigint')throw Error('BASE_FEE_UNAVAILABLE');
  return {hash,blockNumber:Number(receipt.blockNumber),blockHash:receipt.blockHash,phase,id:terms.id,recipient:terms.recipient,amount:terms.amount,
   fee:(receipt.gasUsed*receipt.effectiveGasPrice+BigInt(l1??0)).toString()};
 }
}
