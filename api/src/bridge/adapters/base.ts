import {createPublicClient,http,parseAbi,decodeEventLog,decodeFunctionData,encodeFunctionData,keccak256,toHex,type Hex,type Address} from 'viem';
import {baseSepolia} from 'viem/chains';
import {digest,integer,validateAnchor,type Anchor,type Books,type Order,type VerifiedEvent} from '../model.ts';
import {validateBridgeBaseProfile,type BridgeBaseProfile} from './profile.ts';

export const bridgeAbi=parseAbi([
 'function decimals() view returns(uint8)','function totalSupply() view returns(uint256)','function unpaidRedemptionPrincipal() view returns(uint256)',
 'function admin() view returns(address)','function operator() view returns(address)','function authorizer() view returns(address)','function paused() view returns(bool)',
 'function mintStates(bytes32) view returns(uint8)','function redemptions(bytes32) view returns(address payer,uint256 amount,bytes32 payoutCommitment,bool delivered)',
 'function usedNonces(uint256) view returns(bool)',
 'function balanceOf(address) view returns(uint256)',
 'function mint((bytes32 id,address recipient,uint256 amount,uint256 nonce,uint256 deadline) terms,bytes signature)',
 'function cancelMint(bytes32 id)',
 'function requestRedemption((bytes32 id,address payer,uint256 amount,bytes32 payoutCommitment,uint256 nonce,uint256 deadline) terms,bytes signature)',
 'function acknowledgeRedemption(bytes32 id,bytes32 evidenceCommitment)',
 'event BridgeMinted(bytes32 indexed id,address indexed recipient,uint256 amount)','event MintCancelled(bytes32 indexed id)',
 'event RedemptionRequested(bytes32 indexed id,address indexed payer,uint256 amount,bytes32 payoutCommitment)',
 'event RedemptionAcknowledged(bytes32 indexed id,uint256 amount,bytes32 evidenceCommitment)',
]);
export const mintTypes={Mint:[{name:'id',type:'bytes32'},{name:'recipient',type:'address'},{name:'amount',type:'uint256'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}]} as const;
export const redemptionTypes={Redemption:[{name:'id',type:'bytes32'},{name:'payer',type:'address'},{name:'amount',type:'uint256'},{name:'payoutCommitment',type:'bytes32'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}]} as const;
export const bridgeDomain=(p:BridgeBaseProfile)=>({name:'ZeeSwapBridge',version:'1',chainId:84532,verifyingContract:p.contractAddress});
const json=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x);
export type BaseCounters={anchor:Anchor;supply:string;unpaid:string;gasBalanceWei:string;paused:boolean};
export class CanonicalBridgeBase {
 readonly clients;
 constructor(readonly profile:BridgeBaseProfile,readonly localTest=false){validateBridgeBaseProfile(profile,localTest);this.clients=profile.rpcUrls.map(url=>createPublicClient({chain:baseSepolia,transport:http(url,{timeout:15000,retryCount:0})}));}
 async finalized():Promise<Anchor>{
  const heads=await Promise.all(this.clients.map(c=>c.getBlock({blockTag:'finalized'})));const height=heads.reduce((v,h)=>h.number!<v?h.number!:v,heads[0].number!);
  const anchors=await Promise.all(this.clients.map(c=>c.getBlock({blockNumber:height})));if(!anchors[0].hash||anchors.some(h=>h.hash!==anchors[0].hash)||height>BigInt(Number.MAX_SAFE_INTEGER))throw Error('BRIDGE_BASE_FINALIZED_DISAGREEMENT');
  return {height:Number(height),hash:anchors[0].hash,observedAt:new Date().toISOString()};
 }
 async readAt(anchor:Anchor):Promise<BaseCounters>{
  validateAnchor(anchor,Date.now(),true);const p=this.profile,height=BigInt(anchor.height);
  const observations=await Promise.all(this.clients.map(async c=>{
   const [chain,latest,finalized,block,code,receipt]=await Promise.all([c.getChainId(),c.getBlock(),c.getBlock({blockTag:'finalized'}),c.getBlock({blockNumber:height}),c.getCode({address:p.contractAddress,blockNumber:height}),c.getTransactionReceipt({hash:p.deployment.transactionHash})]);
   if(chain!==84532||block.hash!==anchor.hash||finalized.number!<height||latest.number!<finalized.number!||(!this.localTest&&(Date.now()-Number(latest.timestamp)*1000>60000||Date.now()-Number(latest.timestamp)*1000< -5000))||!code||keccak256(code)!==p.runtimeCodeHash||receipt.status!=='success'||receipt.contractAddress?.toLowerCase()!==p.contractAddress.toLowerCase()||Number(receipt.blockNumber)!==p.deployment.blockHeight||receipt.blockHash!==p.deployment.blockHash||height<receipt.blockNumber)throw Error('BRIDGE_BASE_CANONICAL_IDENTITY');
   const deploymentBlock=await c.getBlock({blockNumber:receipt.blockNumber});if(deploymentBlock.hash!==p.deployment.blockHash)throw Error('BRIDGE_BASE_DEPLOYMENT_REORG');
   const read=(functionName:'decimals'|'admin'|'operator'|'authorizer'|'totalSupply'|'unpaidRedemptionPrincipal'|'paused')=>c.readContract({address:p.contractAddress,abi:bridgeAbi,functionName,blockNumber:height});
   const [decimals,admin,operator,authorizer,supply,unpaid,paused,gas]=await Promise.all([read('decimals'),read('admin'),read('operator'),read('authorizer'),read('totalSupply'),read('unpaidRedemptionPrincipal'),read('paused'),c.getBalance({address:p.operator,blockNumber:height})]);
   if(decimals!==8||String(admin).toLowerCase()!==p.admin.toLowerCase()||String(operator).toLowerCase()!==p.operator.toLowerCase()||String(authorizer).toLowerCase()!==p.authorizer.toLowerCase()||typeof supply!=='bigint'||typeof unpaid!=='bigint'||typeof paused!=='boolean'||gas<integer(p.minimumGasBalanceWei))throw Error('BRIDGE_BASE_ROLE_OR_GAS_MISMATCH');
   if((await c.getBlock({blockNumber:height})).hash!==anchor.hash)throw Error('BRIDGE_BASE_REORG');
   return {anchor,supply:supply.toString(),unpaid:unpaid.toString(),gasBalanceWei:gas.toString(),paused};
  }));if(json(observations[0])!==json(observations[1]))throw Error('BRIDGE_BASE_COUNTER_DISAGREEMENT');validateAnchor(anchor,Date.now(),true);return observations[0];
 }
 async verify(request:unknown,o:Readonly<Order>,b:Readonly<Books>):Promise<VerifiedEvent>{
 const r=request as {kind:'MINT'|'CANCEL'|'BURN'|'ACK';transactionHash:Hex};
  if(!r||Object.keys(r).sort().join()!=='kind,transactionHash'||!['MINT','CANCEL','BURN','ACK'].includes(r.kind)||!/^0x[a-f0-9]{64}$/.test(r.transactionHash)||!b.pair)throw Error('BRIDGE_BASE_FACT_REQUEST');
  const anchor=b.pair.base;await this.readAt(anchor);const p=this.profile;
  const receipts=await Promise.all(this.clients.map(async c=>{
   const receipt=await c.getTransactionReceipt({hash:r.transactionHash}),tx=await c.getTransaction({hash:r.transactionHash});
   if(receipt.status!=='success'||receipt.blockNumber>BigInt(anchor.height)||(await c.getBlock({blockNumber:receipt.blockNumber})).hash!==receipt.blockHash||tx.to?.toLowerCase()!==p.contractAddress.toLowerCase()||tx.value!==0n||(!('chainId' in tx)||Number(tx.chainId)!==84532))throw Error('BRIDGE_BASE_FACT_CANONICAL');
   const decoded=decodeFunctionData({abi:bridgeAbi,data:tx.input}),wanted=r.kind==='MINT'?'BridgeMinted':r.kind==='CANCEL'?'MintCancelled':r.kind==='ACK'?'RedemptionAcknowledged':'RedemptionRequested';
   const events=receipt.logs.filter(l=>l.address.toLowerCase()===p.contractAddress.toLowerCase()).flatMap(l=>{try{return [decodeEventLog({abi:bridgeAbi,data:l.data,topics:l.topics})];}catch{return [];}}).filter(e=>e.eventName===wanted);
   if(events.length!==1)throw Error('BRIDGE_BASE_EVENT_COUNT');const args=events[0].args as any;
   if(args.id!==o.commitment)throw Error('BRIDGE_BASE_EVENT_ORDER');
   if(r.kind==='BURN'){
    const funding=o.funding;if(decoded.functionName!=='requestRedemption'||funding?.kind!=='authenticated-burn'||tx.input.toLowerCase()!==funding.calldata.toLowerCase()||tx.from.toLowerCase()!==o.payer?.toLowerCase()||args.payer.toLowerCase()!==o.payer?.toLowerCase()||args.amount!==integer(o.amountAtomic)||args.payoutCommitment!==o.commitment)throw Error('BRIDGE_BASE_BURN_BINDING');
    const record=await c.readContract({address:p.contractAddress,abi:bridgeAbi,functionName:'redemptions',args:[o.commitment as Hex],blockNumber:BigInt(anchor.height)});
    if(record[0].toLowerCase()!==o.payer!.toLowerCase()||record[1]!==integer(o.amountAtomic)||record[2]!==o.commitment)throw Error('BRIDGE_BASE_REDEMPTION_RECORD');
   }else if(r.kind==='ACK'){
    const expected=('0x'+digest([o.salt,o.destination])) as Hex;
    if(o.direction!=='ZEETAZ_TO_TAZ'||!o.destination||tx.from.toLowerCase()!==p.operator.toLowerCase()||decoded.functionName!=='acknowledgeRedemption'||decoded.args[0]!==o.commitment||decoded.args[1]!==expected||args.amount!==integer(o.amountAtomic)||args.evidenceCommitment!==expected)throw Error('BRIDGE_BASE_ACK_BINDING');
    const record=await c.readContract({address:p.contractAddress,abi:bridgeAbi,functionName:'redemptions',args:[o.commitment as Hex],blockNumber:BigInt(anchor.height)});
    if(!record[3]||record[0].toLowerCase()!==o.payer!.toLowerCase()||record[1]!==integer(o.amountAtomic)||record[2]!==o.commitment)throw Error('BRIDGE_BASE_ACK_RECORD');
   }else{
    if(tx.from.toLowerCase()!==p.operator.toLowerCase()||decoded.functionName!==(r.kind==='MINT'?'mint':'cancelMint'))throw Error('BRIDGE_BASE_OPERATOR_BINDING');
    const state=await c.readContract({address:p.contractAddress,abi:bridgeAbi,functionName:'mintStates',args:[o.commitment as Hex],blockNumber:BigInt(anchor.height)});if(state!==(r.kind==='MINT'?1:2))throw Error('BRIDGE_BASE_MINT_STATE');
    if(r.kind==='MINT'&&(args.recipient.toLowerCase()!==o.recipient.toLowerCase()||args.amount!==integer(o.amountAtomic)))throw Error('BRIDGE_BASE_MINT_BINDING');
   }
   if((await c.getBlock({blockNumber:BigInt(anchor.height)})).hash!==anchor.hash)throw Error('BRIDGE_BASE_REORG');return {receipt:{network:'base-sepolia' as const,transactionHash:r.transactionHash,blockHeight:Number(receipt.blockNumber),blockHash:receipt.blockHash},args};
  }));if(json(receipts[0])!==json(receipts[1]))throw Error('BRIDGE_BASE_RECEIPT_DISAGREEMENT');const {receipt,args}=receipts[0];
  return r.kind==='MINT'?{kind:'MINT',id:o.id,amount:args.amount.toString(),recipient:args.recipient,receipt}:r.kind==='CANCEL'?{kind:'CANCEL',id:o.id,receipt}:r.kind==='ACK'?{kind:'ACK',id:o.id,amount:args.amount.toString(),evidenceCommitment:args.evidenceCommitment,receipt}:{kind:'BURN',id:o.id,amount:args.amount.toString(),payer:args.payer,commitment:args.payoutCommitment,identity:`base:84532:${p.contractAddress.toLowerCase()}:${o.commitment}`,receipt};
 }
 async assertCanonicalOrder(o:Readonly<Order>,b:Readonly<Books>){
  if(!o.source||!b.pair)throw Error('BRIDGE_BASE_SOURCE_REQUIRED');
  // Economic authority must reflect today's independently agreed finalized
  // state; a recently observed historical checkpoint cannot hide a newer ACK.
  const current=await this.finalized();b={...b,pair:{...b.pair,base:current}};await this.readAt(current);
  if(o.direction==='ZEETAZ_TO_TAZ'){
   await this.verify({kind:'BURN',transactionHash:o.source.transactionHash},o,b);
   const records=await Promise.all(this.clients.map(c=>c.readContract({address:this.profile.contractAddress,abi:bridgeAbi,functionName:'redemptions',args:[o.commitment as Hex],blockNumber:BigInt(b.pair!.base.height)})));
   if(records.some(record=>record[3]))throw Error('BRIDGE_REDEMPTION_ALREADY_ACKNOWLEDGED');
   for(const c of this.clients){const latest=await c.getBlock();const record=await c.readContract({address:this.profile.contractAddress,abi:bridgeAbi,functionName:'redemptions',args:[o.commitment as Hex],blockNumber:latest.number!});if(record[3])throw Error('BRIDGE_REDEMPTION_ACKNOWLEDGMENT_IN_FLIGHT');if((await c.getBlock({blockNumber:latest.number!})).hash!==latest.hash)throw Error('BRIDGE_BASE_REORG');}
   for(const c of this.clients)if((await c.getBlock({blockNumber:BigInt(b.pair!.base.height)})).hash!==b.pair!.base.hash)throw Error('BRIDGE_BASE_REORG');
  }
  else if(o.deliveryKind==='REFUND'&&o.destination)await this.verify({kind:'CANCEL',transactionHash:o.destination.transactionHash},o,b);
  else throw Error('BRIDGE_BASE_FINALIZED_AUTHORITY_REQUIRED');
 }
}
export function redemptionNonce(commitment:Hex){return BigInt(keccak256(toHex('bridge-redemption-v1:'+commitment)));}
export function mintNonce(commitment:Hex){return BigInt(keccak256(toHex('bridge-mint-v1:'+commitment)));}
