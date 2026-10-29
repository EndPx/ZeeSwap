import { validateEscrowFunding, type EscrowFunding } from './escrow-funding.ts';
import { getAddress, isAddress } from 'viem';
import {decodeLockedPricing,type LockedPricing} from './pricing.ts';

export type Direction = 'ZCASH_TO_BASE' | 'BASE_TO_ZCASH';
export const assets = {
  TAZ: { symbol: 'TAZ', name: 'Zcash testnet', decimals: 8, network: 'Zcash testnet', className: 'taz' },
  // Existing deployed project token, verified against contracts/deployments/base-sepolia.json.
  mockUSDC: { symbol: 'USDC', name: 'ZeeSwap test USDC', decimals: 6, network: 'Base Sepolia', className: 'usdc',contractAddress:'0xD64C116352CEF2Adc9484098Ae332Fd9bA339A63' },
} as const;
export type Asset = keyof typeof assets;
export const pair = (direction: Direction): [Asset, Asset] => direction === 'ZCASH_TO_BASE' ? ['TAZ','mockUSDC'] : ['mockUSDC','TAZ'];
export const flip = (direction: Direction): Direction => direction === 'ZCASH_TO_BASE' ? 'BASE_TO_ZCASH' : 'ZCASH_TO_BASE';
export function parseUnits(text: string, decimals: number): string {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(text) || text.length > 80) throw Error('Enter an amount using digits and a decimal point.');
  const [whole,fraction=''] = text.split('.');
  if (fraction.length > decimals) throw Error(`Use no more than ${decimals} decimal places.`);
  const units=BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0') || '0');
  if (units <= 0n || units >= 2n**256n) throw Error('Enter an amount greater than zero.');
  return units.toString();
}
export function formatUnits(units: string, decimals: number): string {
  if (!/^(0|[1-9][0-9]*)$/.test(units)) throw Error('Invalid atomic amount.');
  const digits=units.padStart(decimals+1,'0'), whole=decimals ? digits.slice(0,-decimals) : digits;
  const fraction=decimals ? digits.slice(-decimals).replace(/0+$/,'') : '';
  return whole+(fraction?`.${fraction}`:'');
}
export function amountForApi(text: string, direction: Direction): string {
  const input=parseUnits(text, assets[pair(direction)[0]].decimals), units=BigInt(input);
  if (units<100000n || units>10000000n) throw Error(direction==='ZCASH_TO_BASE' ? 'Testnet range: 0.001–0.1 TAZ.' : 'Testnet range: 0.1–10 USDC.');
  return input;
}
export function indicativeOutput(text: string, direction: Direction): string | null {
  try { const units=BigInt(amountForApi(text,direction)); return (direction==='ZCASH_TO_BASE' ? units*100n*10n**6n/10n**8n : units*10n**8n/(100n*10n**6n)).toString(); }
  catch { return null; }
}
export function validateReceiver(text: string, zcash: boolean): string {
  if (zcash) {
    if (!/^utest1[023456789acdefghjklmnpqrstuvwxyz]{30,506}$/.test(text)) throw Error('Enter a Zcash testnet unified address starting with utest1.');
    return text; // The API's Rust SDK verifies network, checksum and Orchard receiver.
  }
  if (!isAddress(text,{strict:true}) || /^0x0{40}$/i.test(text)) throw Error('Enter a valid, nonzero Base Sepolia address.');
  return getAddress(text);
}
export interface QuoteBody { direction: Direction; inputAmount: string; recipient: string; refundRecipient: string; payer?:string; }
export function quoteBody(direction: Direction, amount: string, recipient: string, refundRecipient: string): QuoteBody {
  return {direction,inputAmount:amountForApi(amount,direction),recipient:validateReceiver(recipient.trim(),direction==='BASE_TO_ZCASH'),refundRecipient:validateReceiver(refundRecipient.trim(),direction==='ZCASH_TO_BASE')};
}
export const statuses=['QUOTED','AWAITING_FUNDS','CONFIRMING','READY','REFUND_REQUIRED','REVIEW_REQUIRED','EXPIRED_UNFUNDED','REORGED','SETTLED','REFUNDED'] as const;
export type OrderStatus=typeof statuses[number];
export interface FixedPricing {version:1;source:'configured-fixed-rate';rateNumerator:string;rateDenominator:string;inputDecimals:6|8;outputDecimals:6|8;protocolFeeBps:0;}
export function validateFixedPricing(value:unknown,direction:Direction,input:string,output:string):asserts value is FixedPricing {
  const p=value as FixedPricing,forward=direction==='ZCASH_TO_BASE';
  if(!p||typeof p!=='object'||Object.keys(p).sort().join()!==['version','source','rateNumerator','rateDenominator','inputDecimals','outputDecimals','protocolFeeBps'].sort().join()||p.version!==1||p.source!=='configured-fixed-rate'||p.rateNumerator!==(forward?'100':'1')||p.rateDenominator!==(forward?'1':'100')||p.inputDecimals!==(forward?8:6)||p.outputDecimals!==(forward?6:8)||p.protocolFeeBps!==0||input!==output||BigInt(input)<100000n||BigInt(input)>10000000n)throw Error('The service returned unsupported fixed-rate terms.');
}
export interface OrderView {
  id:string; direction:Direction; status:OrderStatus; inputAmount:string; outputAmount:string;
  executionMode:string; priceMode:'fixture'|'market-reference'|'fixed-rate';pricing?:LockedPricing|FixedPricing|null; integrationOnly:boolean; expiresAt:string;
  sourceAsset?:'TAZ'|'USDC';destinationAsset?:'TAZ'|'USDC';testnet?:true;
  source:{received:boolean;confirmed:boolean;confirmations:number;policy:'zcash-10-confirmations'|'base-finalized';requiredConfirmations:number|null;scannedHeight?:number;scannedAt?:string;checkedAt?:string};
  escrowFunding?:EscrowFunding;
  destination?:{network:'base-sepolia'|'zcash-testnet';status:'FINALIZED'|'PAYOUT_PENDING'|'RESERVING'|'NOT_SUBMITTED';transactionHash?:string;blockNumber?:number};
  funding?:{network:'zcash-testnet';receiver:string;memo:string;cutoffHeight:number|null;cutoffTime:string|null;cancellationAvailableAt:string|null};
}
/** New fixed-flow quotes cannot reinterpret a historical provider-priced order. */
export function fixedQuoteMatches(order:OrderView,body:QuoteBody):boolean {return ['fixed-rate','fixture'].includes(order.priceMode)&&order.status==='QUOTED'&&order.direction===body.direction&&order.inputAmount===body.inputAmount&&order.outputAmount===body.inputAmount;}
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('The service returned an unsupported response.');return value as Record<string,unknown>;};
const nonnegative=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const atomic=(value:unknown):value is string=>typeof value==='string'&&/^(0|[1-9][0-9]{0,77})$/.test(value);
export function decodeOrder(value:unknown):OrderView {
  const row=object(value),source=object(row.source);
  if(typeof row.id!=='string'||!uuid(row.id)||!['ZCASH_TO_BASE','BASE_TO_ZCASH'].includes(String(row.direction))||!statuses.includes(row.status as OrderStatus)
    ||!atomic(row.inputAmount)||!atomic(row.outputAmount)||typeof row.executionMode!=='string'||!['fixture','market-reference','fixed-rate'].includes(String(row.priceMode))||typeof row.integrationOnly!=='boolean'
    ||typeof row.expiresAt!=='string'||!Number.isFinite(Date.parse(row.expiresAt))||typeof source.received!=='boolean'||typeof source.confirmed!=='boolean'
    ||!nonnegative(source.confirmations)||!['zcash-10-confirmations','base-finalized'].includes(String(source.policy))||!(source.requiredConfirmations===null||nonnegative(source.requiredConfirmations)))throw Error('The service returned an unsupported order.');
  if(['scannedHeight','scannedAt','checkedAt'].some(key=>source[key]!==undefined)){
    if(!nonnegative(source.scannedHeight)||typeof source.scannedAt!=='string'||!Number.isFinite(Date.parse(source.scannedAt))||typeof source.checkedAt!=='string'||!Number.isFinite(Date.parse(source.checkedAt)))throw Error('The service returned an unsupported source-height check.');
  }
  if(row.destination!==undefined){const d=object(row.destination);if(!['base-sepolia','zcash-testnet'].includes(String(d.network))||(d.network==='base-sepolia'&&row.direction!=='ZCASH_TO_BASE')||(d.network==='zcash-testnet'&&row.direction!=='BASE_TO_ZCASH')||!['FINALIZED','PAYOUT_PENDING','RESERVING','NOT_SUBMITTED'].includes(String(d.status))
    ||(d.transactionHash!==undefined&&(typeof d.transactionHash!=='string'||!(d.network==='base-sepolia'?/^0x[0-9a-fA-F]{64}$/:/^[0-9a-f]{64}$/).test(d.transactionHash)))||(d.blockNumber!==undefined&&!nonnegative(d.blockNumber))
    ||(d.status==='FINALIZED'&&(typeof d.transactionHash!=='string'||!nonnegative(d.blockNumber))))throw Error('The service returned an unsupported destination.');}
  if(row.escrowFunding!==undefined){if(row.direction!=='BASE_TO_ZCASH'||row.status!=='AWAITING_FUNDS'||row.executionMode!=='base-escrow-v1')throw Error('Unsupported escrow order.');validateEscrowFunding(row.escrowFunding,row.inputAmount as string);}
  if(row.funding!==undefined){const f=object(row.funding);if(row.status!=='AWAITING_FUNDS'||row.direction!=='ZCASH_TO_BASE'||f.network!=='zcash-testnet'
    ||typeof f.receiver!=='string'||typeof f.memo!=='string'||f.memo.length>512||f.receiver.length>512||!(f.cutoffHeight===null||nonnegative(f.cutoffHeight))
    ||!(f.cutoffTime===null||typeof f.cutoffTime==='string')||!(f.cancellationAvailableAt===null||typeof f.cancellationAvailableAt==='string'))throw Error('The service returned unsupported funding instructions.');}
  if(row.priceMode==='market-reference'){
    if(BigInt(row.inputAmount as string)<100000n||BigInt(row.inputAmount as string)>10000000n||BigInt(row.outputAmount as string)<(row.direction==='ZCASH_TO_BASE'?100000n:10000n)||BigInt(row.outputAmount as string)>10000000n)throw Error('Market quote exceeds supported testnet principal bounds.');
    decodeLockedPricing(row.pricing,row.direction as Direction,row.inputAmount as string,row.outputAmount as string,row.status as string,row.expiresAt as string);
  }
  else if(row.priceMode==='fixed-rate'){validateFixedPricing(row.pricing,row.direction as Direction,row.inputAmount as string,row.outputAmount as string);if(row.testnet!==true||row.sourceAsset!==(row.direction==='ZCASH_TO_BASE'?'TAZ':'USDC')||row.destinationAsset!==(row.direction==='ZCASH_TO_BASE'?'USDC':'TAZ'))throw Error('The service returned a different testnet asset route.');}
  else if(row.pricing!==undefined&&row.pricing!==null)throw Error('Fixture order cannot include market pricing.');
  return row as unknown as OrderView;
}
export const uuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
export function capability():string { const bytes=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''); }
export interface PrivateOrder {id:string;token:string;}
export function decodePrivateOrders(value:unknown):PrivateOrder[]{if(!Array.isArray(value)||value.length>20)throw Error('Invalid private order file.');return value.map(item=>{const r=object(item);if(typeof r.id!=='string'||!uuid(r.id)||typeof r.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(r.token))throw Error('Invalid private order key.');return{id:r.id,token:r.token};});}
export const terminal=(status:OrderStatus)=>['SETTLED','REFUNDED','EXPIRED_UNFUNDED'].includes(status);
export function statusCopy(order:OrderView):{title:string;description:string;tone:'waiting'|'success'|'warning'} {
  switch(order.status){
    case 'QUOTED':return{title:'Your quote is ready',description:'Review the exact amounts and destinations before accepting.',tone:'waiting'};
    case 'AWAITING_FUNDS':return{title:'Waiting for your deposit',description:'Use the exact testnet funding instructions for this order.',tone:'waiting'};
    case 'CONFIRMING':return{title:'Deposit found. Confirming…',description:'Your source payment must meet the confirmation policy before delivery.',tone:'waiting'};
    case 'READY':return order.destination?.status==='FINALIZED'?{title:'Destination delivered',description:'The confirmed receipt is recorded. The service is finishing settlement bookkeeping.',tone:'waiting'}:{title:'Source confirmed',description:'The service is preparing delivery. Your destination receipt is still pending.',tone:'waiting'};
    case 'SETTLED':return{title:order.destination?.status==='FINALIZED'?'Delivery finalized':'Service reports settlement',description:order.destination?.status==='FINALIZED'?'The API has verified the destination receipt.':'A finalized destination receipt is not available in this API response.',tone:order.destination?.status==='FINALIZED'?'success':'waiting'};
    case 'REFUNDED':return{title:'Source refund confirmed',description:'The service reports your source principal returned. This is separate from a destination swap.',tone:'success'};
    case 'EXPIRED_UNFUNDED':return{title:'Order expired without funding',description:'Do not send to its old instructions. Start a new quote when you are ready.',tone:'warning'};
    case 'REFUND_REQUIRED':return{title:'Source refund required',description:'Your principal remains an obligation until its refund is verified. Do not send again.',tone:'warning'};
    case 'REVIEW_REQUIRED':return{title:'Order needs review',description:'The service is reconciling this order. Keep your private order access and do not send again.',tone:'warning'};
    case 'REORGED':return{title:'Chain reconciliation in progress',description:'A source chain change needs review. Previously signed effects must be reconciled.',tone:'warning'};
  }
}
