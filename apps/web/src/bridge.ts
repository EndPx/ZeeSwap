import {parseUnits,uuid,validateReceiver} from './protocol.ts';
import {decodeFunctionResult,encodeFunctionData,getAddress,keccak256,parseAbi,type Hex} from 'viem';
import type {EthereumProvider} from './wallet.ts';

export type BridgeDirection='TAZ_TO_ZEETAZ'|'ZEETAZ_TO_TAZ';
export interface BridgeCheckpoint {height:number;hash:string;observedAt:string;}
export interface BridgeReserveReport {
  operatorAttested:true;controlledZatoshi:string;inTransitZatoshi:string;
  circulatingZatoshi:string;unpaidRedemptionsZatoshi:string;pendingAcknowledgmentsZatoshi:string;acceptedUnmintedZatoshi:string;otherRefundsZatoshi:string;
  covered:boolean;zcash:BridgeCheckpoint;base:BridgeCheckpoint;
}
export interface BridgeStatus {
  pilot?:{amountAtomic:'100000';maxAcceptedPerDirection:1;maxConcurrent:1};
  schemaVersion:1;network:'testnet';asset:{symbol:'zeeTAZ';decimals:8;baseChainId:84532;tokenAddress:string|null;bridgeContractAddress:string|null;runtimeCodeHash:string|null};
  state:'unavailable'|'paused'|'available';reason:string;forwardEnabled:boolean;reverseEnabled:boolean;reserveReport:BridgeReserveReport|null;maxObservationAgeSeconds:60;
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const atomic=(v:unknown):v is string=>typeof v==='string'&&/^(0|[1-9][0-9]{0,77})$/.test(v);
const checkpoint=(v:unknown)=>object(v)&&Number.isSafeInteger(v.height)&&Number(v.height)>0&&typeof v.hash==='string'&&/^(0x)?[a-fA-F0-9]{64}$/.test(v.hash)&&! /^(0x)?0{64}$/.test(v.hash)&&typeof v.observedAt==='string'&&Number.isFinite(Date.parse(v.observedAt));
export function decodeBridgeStatus(value:unknown):BridgeStatus {
  if(object(value)&&value.pilot!==undefined&&(!object(value.pilot)||value.pilot.amountAtomic!=='100000'||value.pilot.maxAcceptedPerDirection!==1||value.pilot.maxConcurrent!==1))throw Error('Unsupported bridge pilot limits.');
  if(!object(value)||value.schemaVersion!==1||value.maxObservationAgeSeconds!==60||value.network!=='testnet'||!object(value.asset)||value.asset.symbol!=='zeeTAZ'||value.asset.decimals!==8||value.asset.baseChainId!==84532
    ||!(value.asset.tokenAddress===null||(typeof value.asset.tokenAddress==='string'&&/^0x[a-fA-F0-9]{40}$/.test(value.asset.tokenAddress)&&!/^0x0{40}$/i.test(value.asset.tokenAddress)))
    ||!(value.asset.bridgeContractAddress===null||(typeof value.asset.bridgeContractAddress==='string'&&/^0x[a-fA-F0-9]{40}$/.test(value.asset.bridgeContractAddress)&&!/^0x0{40}$/i.test(value.asset.bridgeContractAddress)))
    ||!(value.asset.runtimeCodeHash===null||(typeof value.asset.runtimeCodeHash==='string'&&/^0x[a-fA-F0-9]{64}$/.test(value.asset.runtimeCodeHash)))
    ||!['unavailable','paused','available'].includes(String(value.state))||typeof value.reason!=='string'||typeof value.forwardEnabled!=='boolean'||typeof value.reverseEnabled!=='boolean')throw Error('Unsupported bridge status.');
  const r=value.reserveReport;
  if(r!==null){if(!object(r)||r.operatorAttested!==true||typeof r.covered!=='boolean'||!checkpoint(r.zcash)||!checkpoint(r.base)
    ||!['controlledZatoshi','inTransitZatoshi','circulatingZatoshi','unpaidRedemptionsZatoshi','pendingAcknowledgmentsZatoshi','acceptedUnmintedZatoshi','otherRefundsZatoshi'].every(k=>atomic(r[k])))throw Error('Unsupported bridge reserve report.');}
  return value as unknown as BridgeStatus;
}
export function bridgeAmount(text:string):string {const amount=parseUnits(text,8);if(BigInt(amount)<10000n||BigInt(amount)>100000000n)throw Error('Testnet bridge range: 0.0001–1 TAZ or zeeTAZ.');return amount;}
export function bridgeLiabilities(r:BridgeReserveReport):bigint {return BigInt(r.circulatingZatoshi)+BigInt(r.unpaidRedemptionsZatoshi)+BigInt(r.acceptedUnmintedZatoshi)+BigInt(r.otherRefundsZatoshi);}
export function bridgeCoverage(r:BridgeReserveReport):boolean {return r.covered&&BigInt(r.controlledZatoshi)+BigInt(r.inTransitZatoshi)>=bridgeLiabilities(r);}
export function freshBridgeReport(status:BridgeStatus|undefined,now=Date.now()):BridgeReserveReport|null {
  const r=status?.reserveReport;if(!r)return null;
  return [r.zcash,r.base].every(c=>now-Date.parse(c.observedAt)>=0&&now-Date.parse(c.observedAt)<=60000)?r:null;
}
export function bridgeCanQuote(status:BridgeStatus|undefined,direction:BridgeDirection,now=Date.now()):boolean {
  const r=freshBridgeReport(status,now);return status?.state==='available'&&!!status.asset.tokenAddress&&status.asset.bridgeContractAddress?.toLowerCase()===status.asset.tokenAddress.toLowerCase()&&!!status.asset.runtimeCodeHash&&!!r&&bridgeCoverage(r)&&(direction==='TAZ_TO_ZEETAZ'?status.forwardEnabled:status.reverseEnabled);
}
export function bridgeStatusCopy(status:BridgeStatus|undefined,now=Date.now()):string {
  if(!status)return 'Bridge status unavailable. New bridge deposits and burns are disabled.';
  if(status.reason==='BRIDGE_PUBLIC_ORDER_ACTIVE')return 'A bridge transfer is settling. Follow the original order while new transfers are paused.';
  if(status.reason==='BRIDGE_PUBLIC_BUDGET_EXHAUSTED')return 'This testnet pilot has reached its transfer limit. Original orders and receipts remain available.';
  if(status.reason==='BRIDGE_PUBLIC_PERMIT_EXPIRED')return 'This pilot admission window has ended. Existing transfers remain subject to their original settlement and recovery checks.';
  if(status.state==='paused'&&status.asset.tokenAddress)return 'New bridge transfers are paused while the operator reconciles current observations. Follow your original order.';
  if(status.state!=='available')return 'Bridge not activated. Deployment, dedicated backing and settlement acceptance remain open.';
  const r=freshBridgeReport(status,now);if(!r)return 'Waiting for fresh paired chain observations. New deposits and burns are disabled.';
  if(!bridgeCoverage(r))return 'Backing coverage is insufficient. New deposits and burns are disabled while the operator reconciles.';
  if(!status.asset.tokenAddress)return 'Bridge token deployment is not configured.';
  return status.pilot?'Testnet pilot: exactly 0.001 TAZ or zeeTAZ per transfer, one accepted transfer per direction. Each transfer still requires an accepted quote.':'Operator reports fresh bridge coverage. Each direction still requires an accepted server quote.';
}

export interface BridgeQuoteBody {direction:BridgeDirection;amountAtomic:string;recipient:string;refundRecipient?:string;payer?:string;}
export interface BridgeQuote {id:string;direction:BridgeDirection;amountAtomic:string;outputAmountAtomic:string;expiresAt:string;status:'QUOTED';}
export interface BridgeBurn {kind:'authenticated-burn';network:'base-sepolia';chainId:84532;contract:Hex;token:Hex;calldata:Hex;signature:Hex;terms:{id:Hex;payer:Hex;amount:string;payoutCommitment:Hex;nonce:string;deadline:string};}
export interface BridgeDeposit {kind:'shielded-deposit';network:'zcash-testnet';address:string;memo:string;cutoffHeight:number;cutoffTime:string;}
export interface BridgeReceipt {network:'base-sepolia'|'zcash-testnet';transactionHash:string;blockHeight:number;blockHash:string;}
export interface BridgeOrder {lateFundsQuarantined?:true;id:string;direction:BridgeDirection;amountAtomic:string;outputAmountAtomic:string;status:'AWAITING_DEPOSIT'|'AWAITING_BURN'|'EXPIRED_UNFUNDED'|'DEPOSIT_FINALIZED'|'MINTED'|'CANCELLED'|'REFUND_PENDING'|'REDEMPTION_PENDING'|'PAYOUT_PENDING'|'IN_TRANSIT'|'NATIVE_DELIVERED_AWAITING_ACK'|'COMPLETED'|'FROZEN';createdAt:string;recipient:string;refundRecipient?:string;payer?:string;funding:BridgeBurn|BridgeDeposit|null;source:BridgeReceipt|null;destination:BridgeReceipt|null;acknowledgment?:BridgeReceipt|null;}
const bridgeReceipt=(r:unknown):r is BridgeReceipt=>object(r)&&['zcash-testnet','base-sepolia'].includes(String(r.network))&&Number.isSafeInteger(r.blockHeight)&&Number(r.blockHeight)>0&&typeof r.blockHash==='string'&&/^(0x)?[a-fA-F0-9]{64}$/.test(r.blockHash)&&typeof r.transactionHash==='string'&&(r.network==='base-sepolia'?/^0x[a-fA-F0-9]{64}$/:/^[a-fA-F0-9]{64}$/).test(r.transactionHash);
export function bridgeOutcome(order:BridgeOrder):{title:string;tone:'info'|'success'|'warning'} {
  if(order.status==='EXPIRED_UNFUNDED')return {title:order.lateFundsQuarantined?'Late funds quarantined for reconciliation':'Original funding window expired unfunded',tone:'warning'};
  if(order.status==='MINTED'&&order.direction==='TAZ_TO_ZEETAZ'&&order.source?.network==='zcash-testnet'&&order.destination?.network==='base-sepolia')return {title:'zeeTAZ mint confirmed on Base',tone:'success'};
  if(order.status==='NATIVE_DELIVERED_AWAITING_ACK'&&order.direction==='ZEETAZ_TO_TAZ')return {title:'Shielded TAZ delivered · Base acknowledgment pending',tone:'info'};
  if(order.status==='COMPLETED'&&order.destination?.network==='zcash-testnet'&&order.source){
    if(order.direction==='TAZ_TO_ZEETAZ')return {title:'Shielded source-principal refund confirmed',tone:'success'};
    if(order.source.network==='base-sepolia'&&bridgeReceipt(order.acknowledgment)&&order.acknowledgment.network==='base-sepolia')return {title:'Shielded TAZ redemption confirmed',tone:'success'};
  }
  if(order.status==='FROZEN')return {title:'Bridge order frozen for reconciliation',tone:'warning'};
  if(order.status==='CANCELLED'||order.status==='REFUND_PENDING')return {title:'Mint cancelled · source-principal refund pending',tone:'warning'};
  if(order.status==='IN_TRANSIT')return {title:order.direction==='TAZ_TO_ZEETAZ'?'Shielded refund in transit':'Shielded redemption in transit',tone:'info'};
  return {title:'Follow the original bridge order',tone:'info'};
}
export function bridgeQuoteBody(direction:BridgeDirection,text:string,recipient:string,refundRecipient:string,payer?:string|null):BridgeQuoteBody {
  const forward=direction==='TAZ_TO_ZEETAZ';return {direction,amountAtomic:bridgeAmount(text),recipient:validateReceiver(recipient.trim(),!forward),...(forward?{refundRecipient:validateReceiver(refundRecipient.trim(),true)}:{payer:validateReceiver(payer??'',false)})};
}
export function decodeBridgeQuote(value:unknown,body:BridgeQuoteBody):BridgeQuote {
  if(!object(value)||!uuid(String(value.id))||value.direction!==body.direction||value.amountAtomic!==body.amountAtomic||value.outputAmountAtomic!==body.amountAtomic||value.recipient!==body.recipient||value.refundRecipient!==body.refundRecipient||value.payer!==body.payer||value.status!=='QUOTED'||typeof value.expiresAt!=='string'||!Number.isFinite(Date.parse(value.expiresAt)))throw Error('Invalid bridge quote.');return value as unknown as BridgeQuote;
}
export const bridgeBurnAbi=parseAbi(['function requestRedemption((bytes32 id,address payer,uint256 amount,bytes32 payoutCommitment,uint256 nonce,uint256 deadline) terms,bytes signature)','function redemptions(bytes32) view returns (address payer,uint256 amount,bytes32 payoutCommitment,bool delivered)']);
export function validateBridgeBurn(value:unknown,amount:string,payer:string,token:string):asserts value is BridgeBurn {
  const f=value as BridgeBurn,t=f?.terms;
  if(!f||f.kind!=='authenticated-burn'||f.network!=='base-sepolia'||f.chainId!==84532||!t||![f.contract,f.token,t.payer].every(a=>typeof a==='string'&&/^0x[a-fA-F0-9]{40}$/.test(a)&&!/^0x0{40}$/i.test(a))||f.contract.toLowerCase()!==token.toLowerCase()||f.token.toLowerCase()!==token.toLowerCase()||t.payer.toLowerCase()!==payer.toLowerCase()||t.amount!==amount||![t.id,t.payoutCommitment].every(s=>typeof s==='string'&&/^0x[a-fA-F0-9]{64}$/.test(s))||!/^0x[a-fA-F0-9]{130}$/.test(f.signature)||![t.amount,t.nonce,t.deadline].every(atomic))throw Error('Invalid authenticated bridge burn.');
  if(f.calldata!==encodeFunctionData({abi:bridgeBurnAbi,functionName:'requestRedemption',args:[{...t,amount:BigInt(t.amount),nonce:BigInt(t.nonce),deadline:BigInt(t.deadline)},f.signature]}))throw Error('Bridge burn calldata does not match accepted terms.');
}
export function decodeBridgeOrder(value:unknown,body:BridgeQuoteBody,id:string,token:string):BridgeOrder {
  if(!object(value)||value.id!==id||value.direction!==body.direction||value.amountAtomic!==body.amountAtomic||value.outputAmountAtomic!==body.amountAtomic||value.recipient!==body.recipient||value.refundRecipient!==body.refundRecipient||value.payer!==body.payer||!['AWAITING_DEPOSIT','AWAITING_BURN','EXPIRED_UNFUNDED','DEPOSIT_FINALIZED','MINTED','CANCELLED','REFUND_PENDING','REDEMPTION_PENDING','PAYOUT_PENDING','IN_TRANSIT','NATIVE_DELIVERED_AWAITING_ACK','COMPLETED','FROZEN'].includes(String(value.status))||typeof value.createdAt!=='string'||!Number.isFinite(Date.parse(value.createdAt)))throw Error('Invalid private bridge order.');
  for(const key of ['source','destination','acknowledgment']){const r=value[key];if(key==='acknowledgment'&&r===undefined)continue;if(r!==null&&!bridgeReceipt(r))throw Error('Invalid bridge receipt.');}
  if(object(value.acknowledgment)&&value.acknowledgment.network!=='base-sepolia')throw Error('Wrong bridge acknowledgment network.');
  if(value.status==='NATIVE_DELIVERED_AWAITING_ACK'&&(body.direction!=='ZEETAZ_TO_TAZ'||!bridgeReceipt(value.source)||value.source.network!=='base-sepolia'||!bridgeReceipt(value.destination)||value.destination.network!=='zcash-testnet'||value.acknowledgment!=null))throw Error('Pending bridge acknowledgment lacks canonical native delivery.');
  if(value.status==='COMPLETED'&&body.direction==='ZEETAZ_TO_TAZ'&&(!bridgeReceipt(value.acknowledgment)||value.acknowledgment.network!=='base-sepolia'))throw Error('Completed bridge redemption lacks a Base acknowledgment receipt.');
  if(object(value.source)&&value.source.network!==(body.direction==='TAZ_TO_ZEETAZ'?'zcash-testnet':'base-sepolia'))throw Error('Wrong bridge source network.');
  if(object(value.destination)&&body.direction==='ZEETAZ_TO_TAZ'&&value.destination.network!=='zcash-testnet')throw Error('Wrong shielded redemption network.');
  if(value.status==='EXPIRED_UNFUNDED'&&(body.direction!=='TAZ_TO_ZEETAZ'||value.source!==null||value.destination!==null||value.acknowledgment))throw Error('Expired unfunded bridge has financial receipts.');
  if(value.lateFundsQuarantined!==undefined&&value.lateFundsQuarantined!==true)throw Error('Invalid bridge quarantine marker.');
  if(value.status==='MINTED'&&(!object(value.source)||!object(value.destination)||value.destination.network!=='base-sepolia'))throw Error('Minted bridge lacks canonical receipts.');
  if(value.status==='COMPLETED'&&(!value.source||!value.destination))throw Error('Completed bridge lacks receipts.');
  if(value.status==='COMPLETED'&&object(value.destination)&&value.destination.network!=='zcash-testnet')throw Error('Completed bridge refund or redemption lacks a shielded delivery receipt.');
  if(value.funding!==null){if(body.direction==='ZEETAZ_TO_TAZ'){validateBridgeBurn(value.funding,body.amountAtomic,body.payer!,token);}else{const f=value.funding;if(!object(f)||f.kind!=='shielded-deposit'||f.network!=='zcash-testnet'||typeof f.address!=='string'||typeof f.memo!=='string'||!Number.isSafeInteger(f.cutoffHeight)||Number(f.cutoffHeight)<=0||typeof f.cutoffTime!=='string'||!Number.isFinite(Date.parse(f.cutoffTime)))throw Error('Invalid shielded bridge funding.');validateReceiver(f.address,true);}}
  return value as unknown as BridgeOrder;
}
/** Called only from explicit user confirmation; caller freezes retries before this send. */
export async function sendBridgeBurn(provider:EthereumProvider,f:BridgeBurn,amount:string,payer:string,token:string,runtimeCodeHash:string):Promise<string> {
  validateBridgeBurn(f,amount,payer,token);
  const [chain,accounts]=await Promise.all([provider.request({method:'eth_chainId'}),provider.request({method:'eth_accounts'})]);
  if(chain!=='0x14a34'||!Array.isArray(accounts)||typeof accounts[0]!=='string'||getAddress(accounts[0])!==getAddress(payer))throw Error('Connect the quoted payer on Base Sepolia.');
  if(BigInt(f.terms.deadline)<=BigInt(Math.floor(Date.now()/1000)+30))throw Error('The burn authorization window has closed or is too short.');
  if(!/^0x[a-fA-F0-9]{64}$/.test(runtimeCodeHash))throw Error('Verified bridge runtime identity is unavailable.');
  const code=await provider.request({method:'eth_getCode',params:[f.contract,'latest']});
  if(typeof code!=='string'||!/^0x(?:[a-fA-F0-9]{2})+$/.test(code)||keccak256(code as Hex).toLowerCase()!==runtimeCodeHash.toLowerCase())throw Error('The bridge contract runtime does not match the accepted deployment.');
  const state=await provider.request({method:'eth_call',params:[{to:f.contract,data:encodeFunctionData({abi:bridgeBurnAbi,functionName:'redemptions',args:[f.terms.id]})},'latest']});
  if(typeof state!=='string'||!/^0x[a-fA-F0-9]+$/.test(state))throw Error('The original redemption state could not be verified.');
  let redemption;try{redemption=decodeFunctionResult({abi:bridgeBurnAbi,functionName:'redemptions',data:state as Hex});}catch{throw Error('The original redemption state could not be verified.');}
  if(redemption[0]!=='0x0000000000000000000000000000000000000000'||redemption[1]!==0n||redemption[2]!==`0x${'0'.repeat(64)}`||redemption[3])throw Error('This bridge redemption already exists. Refresh the original order; do not burn again.');
  const [sendChain,sendAccounts]=await Promise.all([provider.request({method:'eth_chainId'}),provider.request({method:'eth_accounts'})]);
  if(sendChain!=='0x14a34'||!Array.isArray(sendAccounts)||typeof sendAccounts[0]!=='string'||getAddress(sendAccounts[0])!==getAddress(payer))throw Error('Connect the quoted payer on Base Sepolia.');
  if(BigInt(f.terms.deadline)<=BigInt(Math.floor(Date.now()/1000)+30))throw Error('The burn authorization window has closed or is too short.');
  let hash:unknown;try{hash=await provider.request({method:'eth_sendTransaction',params:[{from:payer,to:f.contract,value:'0x0',data:f.calldata}]});}catch(e){if(e&&typeof e==='object'&&'code'in e&&e.code===4001)throw Error('Wallet transaction declined.');throw Error('Burn result unknown. Reconcile this original order and wallet history before another send.');}
  if(typeof hash!=='string'||!/^0x[a-fA-F0-9]{64}$/.test(hash))throw Error('Burn result unknown. Reconcile this original order before another send.');return hash;
}
