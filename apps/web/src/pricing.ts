import {marketDecimal,type MarketSourcePair} from './market-reference.ts';
import type {Direction} from './protocol.ts';
import {sha256,stringToHex} from 'viem';

export interface PricingRange {inputDecimals:8|6;outputDecimals:8|6;minInput:string;maxInput:string;minOutput:string;maxOutput:string;}
export interface PricingConfiguration {version:1;mode:'fixture'|'market-reference';configured:boolean;referenceStatus:'available'|'unavailable';source:'Kraken'|null;maxReferenceAgeSeconds:30;protocolFeeBps:0;directions:Record<Direction,PricingRange>;}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,expected:string[])=>Object.keys(v).sort().join()===expected.sort().join();
const atomic=(v:unknown):v is string=>typeof v==='string'&&/^[1-9][0-9]{0,77}$/.test(v);
export function decodePricingConfiguration(value:unknown):PricingConfiguration {
  if(!object(value)||!exact(value,['version','mode','configured','referenceStatus','source','maxReferenceAgeSeconds','protocolFeeBps','directions'])||value.version!==1||!['fixture','market-reference'].includes(String(value.mode))||typeof value.configured!=='boolean'||!['available','unavailable'].includes(String(value.referenceStatus))||value.source!==(value.mode==='market-reference'?'Kraken':null)||value.maxReferenceAgeSeconds!==30||value.protocolFeeBps!==0||!object(value.directions)||!exact(value.directions,['ZCASH_TO_BASE','BASE_TO_ZCASH']))throw Error('Invalid server pricing configuration.');
  for(const d of ['ZCASH_TO_BASE','BASE_TO_ZCASH'] as const){const r=value.directions[d],forward=d==='ZCASH_TO_BASE';if(!object(r)||!exact(r,['inputDecimals','outputDecimals','minInput','maxInput','minOutput','maxOutput'])||r.inputDecimals!==(forward?8:6)||r.outputDecimals!==(forward?6:8)||![r.minInput,r.maxInput,r.minOutput,r.maxOutput].every(atomic)||BigInt(String(r.minInput))>BigInt(String(r.maxInput))||BigInt(String(r.minOutput))>BigInt(String(r.maxOutput)))throw Error('Invalid server pricing range.');if(value.mode==='market-reference'&&(r.minInput!=='100000'||r.maxInput!=='10000000'||r.minOutput!==(forward?'100000':'10000')||r.maxOutput!=='10000000'))throw Error('Unsupported market settlement bounds.');}
  return value as unknown as PricingConfiguration;
}
/** Conservative displayed 12-decimal rate, preserving full raw-leg precision. */
export function sourceRatio(pairs:MarketSourcePair[],direction:Direction):{numerator:bigint;denominator:bigint} {
  if(!Array.isArray(pairs)||pairs.length!==2)throw Error('Invalid pricing source pairs.');
  pairs.forEach((p,index)=>{if(!object(p)||!exact(p,['pair','providerPair','bid','ask','mid'])||p.pair!==(index===0?'ZEC/USD':'USDC/USD')||p.providerPair!==(index===0?'XZECZUSD':'USDCUSD'))throw Error('Invalid pricing source pair.');const bid=marketDecimal(p.bid),ask=marketDecimal(p.ask);marketDecimal(p.mid);if(bid.n*ask.d>ask.n*bid.d)throw Error('Invalid pricing source spread.');});
  const scale18=(v:string)=>{const p=marketDecimal(v);return p.n*10n**18n/p.d;},zb=scale18(pairs[0]!.bid),za=scale18(pairs[0]!.ask),ub=scale18(pairs[1]!.bid),ua=scale18(pairs[1]!.ask),s=10n**12n;
  for(const [p,b,a] of [[pairs[0]!,zb,za],[pairs[1]!,ub,ua]] as const){if(!/^(0|[1-9][0-9]*)\.[0-9]{12}$/.test(p.mid)||scale18(p.mid)/10n**6n!==(b+a)/(2n*10n**6n))throw Error('Invalid pricing source midpoint.');}
  return direction==='ZCASH_TO_BASE'?{numerator:zb*s/ua,denominator:s}:{numerator:s,denominator:(za*s+ub-1n)/ub};
}

export interface LockedPricing {version:1;snapshotId:string;snapshotSha256:string;source:'Kraken';pair:'ZEC/USDC';side:'bid'|'inverse-ask';retrievedAt:string;expiresAt:string;acceptedAt:string|null;locked:boolean;rateNumerator:string;rateDenominator:string;sourcePairs:[MarketSourcePair,MarketSourcePair];}
const time=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().replace('.000Z','Z')===v.replace('.000Z','Z');
export function pricingDigest(p:Pick<LockedPricing,'snapshotId'|'retrievedAt'|'expiresAt'|'sourcePairs'>):string {
  const [z,u]=p.sourcePairs;return sha256(stringToHex(JSON.stringify(['zeeswap-market-price-v1',p.snapshotId,'Kraken','ZEC/USDC',p.retrievedAt,p.expiresAt,'XZECZUSD',z.bid,z.ask,'USDCUSD',u.bid,u.ask]))).slice(2);
}
/** Historical accepted snapshots are checked at their recorded acceptance time. */
export function decodeLockedPricing(value:unknown,direction:Direction,inputAmount:string,outputAmount:string,status:string,quoteExpiresAt:string):LockedPricing {
  if(!object(value)||!exact(value,['version','snapshotId','snapshotSha256','source','pair','side','retrievedAt','expiresAt','acceptedAt','locked','rateNumerator','rateDenominator','sourcePairs'])||value.version!==1||typeof value.snapshotId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.snapshotId)||typeof value.snapshotSha256!=='string'||!/^[0-9a-f]{64}$/.test(value.snapshotSha256)||value.source!=='Kraken'||value.pair!=='ZEC/USDC'||value.side!==(direction==='ZCASH_TO_BASE'?'bid':'inverse-ask')||!time(value.retrievedAt)||!time(value.expiresAt)||!atomic(value.rateNumerator)||!atomic(value.rateDenominator)||typeof value.locked!=='boolean'||!(value.acceptedAt===null||time(value.acceptedAt)))throw Error('Invalid locked market pricing.');
  const p=value as unknown as LockedPricing,ratio=sourceRatio(p.sourcePairs,direction),retrieved=Date.parse(p.retrievedAt),expiry=Date.parse(p.expiresAt),quoteExpiry=Date.parse(quoteExpiresAt);
  if(expiry<=retrieved||expiry-retrieved>30000||quoteExpiry>expiry||quoteExpiry<=retrieved||BigInt(p.rateNumerator)!==ratio.numerator||BigInt(p.rateDenominator)!==ratio.denominator||pricingDigest(p)!==p.snapshotSha256||pricedOutput(inputAmount,direction,p.rateNumerator,p.rateDenominator)!==outputAmount)throw Error('Market pricing does not match exact quote terms.');
  if(status==='QUOTED'){if(p.locked||p.acceptedAt!==null)throw Error('Unaccepted market quote cannot be locked.');}
  else if(!p.locked||p.acceptedAt===null||Date.parse(p.acceptedAt)<retrieved||Date.parse(p.acceptedAt)>expiry||Date.parse(p.acceptedAt)>quoteExpiry)throw Error('Market quote was not accepted while its snapshot was valid.');
  return p;
}
export function freshUnacceptedPricing(p:LockedPricing,expiresAt:string,now=Date.now()):boolean {return !p.locked&&p.acceptedAt===null&&Date.parse(p.retrievedAt)<=now&&now<Date.parse(p.expiresAt)&&now<Date.parse(expiresAt)&&now-Date.parse(p.retrievedAt)<=30000;}
export function pricedOutput(input:string,direction:Direction,numerator:string|bigint,denominator:string|bigint):string {
  if(!atomic(input)||!atomic(String(numerator))||!atomic(String(denominator)))throw Error('Invalid locked price.');
  return (BigInt(input)*BigInt(numerator)*10n**BigInt(direction==='ZCASH_TO_BASE'?6:8)/(BigInt(denominator)*10n**BigInt(direction==='ZCASH_TO_BASE'?8:6))).toString();
}
