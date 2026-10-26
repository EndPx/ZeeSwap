import {parseUnits,type Direction} from './protocol.ts';

export interface MarketSourcePair {pair:'ZEC/USD'|'USDC/USD';providerPair:'XZECZUSD'|'USDCUSD';bid:string;ask:string;mid:string;}
export interface MarketReference {
  schemaVersion:1;status:'available';source:'Kraken';pair:'ZEC/USDC';priceMode:'reference-only';
  marketAssets:{base:'ZEC';quote:'USDC';via:'USD'};rate:{mid:string;bid:string;ask:string;decimals:12};
  sourcePairs:[MarketSourcePair,MarketSourcePair];retrievedAt:string;expiresAt:string;exchangeUpdatedAt:null;maxAgeSeconds:30;pollIntervalSeconds:15;
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,expected:string[])=>Object.keys(v).sort().join()===expected.sort().join();
/** Canonical positive decimal; bounded size prevents untrusted large bigint work. */
export function marketDecimal(value:unknown):{n:bigint;d:bigint} {
  if(typeof value!=='string'||value.length>50||!/^(0|[1-9][0-9]{0,23})(\.[0-9]{1,18})?$/.test(value))throw Error('Invalid market decimal.');
  const [whole,fraction='']=value.split('.'),d=10n**BigInt(fraction.length),n=BigInt(whole!)*d+BigInt(fraction||'0');if(n<=0n)throw Error('Invalid market decimal.');return {n,d};
}
const le=(a:string,b:string)=>{const x=marketDecimal(a),y=marketDecimal(b);return x.n*y.d<=y.n*x.d;};
const timestamp=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().replace('.000Z','Z')===v.replace('.000Z','Z');
const fixed12=(v:unknown):v is string=>typeof v==='string'&&/^(0|[1-9][0-9]{0,23})\.[0-9]{12}$/.test(v)&&marketDecimal(v).n>0n;
export function marketReferenceFresh(value:MarketReference|undefined,now=Date.now()):value is MarketReference {
  if(!value||!Number.isSafeInteger(now))return false;const retrieved=Date.parse(value.retrievedAt),expires=Date.parse(value.expiresAt);
  return retrieved<=now&&expires>now&&now-retrieved<=30000&&expires>retrieved&&expires-retrieved<=30000;
}
export function decodeMarketReference(value:unknown,now=Date.now()):MarketReference {
  if(!object(value)||!keys(value,['schemaVersion','status','source','pair','priceMode','marketAssets','rate','sourcePairs','retrievedAt','expiresAt','exchangeUpdatedAt','maxAgeSeconds','pollIntervalSeconds'])
    ||value.schemaVersion!==1||value.status!=='available'||value.source!=='Kraken'||value.pair!=='ZEC/USDC'||value.priceMode!=='reference-only'||value.exchangeUpdatedAt!==null||value.maxAgeSeconds!==30||value.pollIntervalSeconds!==15
    ||!object(value.marketAssets)||!keys(value.marketAssets,['base','quote','via'])||value.marketAssets.base!=='ZEC'||value.marketAssets.quote!=='USDC'||value.marketAssets.via!=='USD'
    ||!object(value.rate)||!keys(value.rate,['mid','bid','ask','decimals'])||value.rate.decimals!==12||![value.rate.mid,value.rate.bid,value.rate.ask].every(fixed12)
    ||!timestamp(value.retrievedAt)||!timestamp(value.expiresAt)||!Array.isArray(value.sourcePairs)||value.sourcePairs.length!==2)throw Error('Market reference unavailable.');
  const rate=value.rate as unknown as MarketReference['rate'];if(!le(rate.bid,rate.mid)||!le(rate.mid,rate.ask))throw Error('Invalid market spread.');
  value.sourcePairs.forEach((p,index)=>{if(!object(p)||!keys(p,['pair','providerPair','bid','ask','mid'])||p.pair!==(index===0?'ZEC/USD':'USDC/USD')||p.providerPair!==(index===0?'XZECZUSD':'USDCUSD')||!fixed12(p.mid))throw Error('Invalid market source pair.');marketDecimal(p.bid);marketDecimal(p.ask);if(!le(String(p.bid),p.mid)||!le(p.mid,String(p.ask)))throw Error('Invalid market source spread.');});
  const scaled=(v:unknown)=>{const p=marketDecimal(v);return p.n*10n**18n/p.d;},zec=value.sourcePairs[0] as unknown as MarketSourcePair,usdc=value.sourcePairs[1] as unknown as MarketSourcePair;
  const zb=scaled(zec.bid),za=scaled(zec.ask),ub=scaled(usdc.bid),ua=scaled(usdc.ask),scale=10n**12n;
  const units=(v:string)=>{const p=marketDecimal(v);return p.n*scale/p.d;};
  if(units(zec.mid)!==(zb+za)/(2n*10n**6n)||units(usdc.mid)!==(ub+ua)/(2n*10n**6n)
    ||units(rate.bid)!==zb*scale/ua||units(rate.ask)!==(za*scale+ub-1n)/ub||units(rate.mid)!==(zb+za)*scale/(ub+ua))throw Error('Market cross-rate does not match its source pairs.');
  const result=value as unknown as MarketReference;if(!marketReferenceFresh(result,now))throw Error('Market reference expired.');return result;
}
/** Illustrative mainnet-unit comparison only; never used by fixture quote/payout code. */
export function marketEstimate(amount:string,direction:Direction,reference:MarketReference):string|null {
  try {const input=BigInt(parseUnits(amount,direction==='ZCASH_TO_BASE'?8:6)),price=marketDecimal(direction==='ZCASH_TO_BASE'?reference.rate.bid:reference.rate.ask);
    return (direction==='ZCASH_TO_BASE'?input*price.n*10n**6n/(10n**8n*price.d):input*price.d*10n**8n/(10n**6n*price.n)).toString();
  }catch{return null;}
}
