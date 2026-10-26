/** Server-owned price snapshots. Expiry gates issuance/acceptance, never an accepted payout. */
import {createHash,randomUUID} from 'node:crypto';
import type pg from 'pg';
import {atomic} from './amounts.ts';
import type {PrivateData} from './private-data.ts';
// @ts-expect-error Maintained standalone Node ESM provider has no TypeScript runtime dependency.
import {createMarketReferenceCache} from './market-reference/cache.mjs';
export type MarketDirection='ZCASH_TO_BASE'|'BASE_TO_ZCASH';
export type MarketLeg={pair:'ZEC/USD'|'USDC/USD';providerPair:'XZECZUSD'|'USDCUSD';bid:string;ask:string;mid:string};
export type MarketSnapshot={version:1;snapshotId:string;snapshotSha256:string;source:'Kraken';pair:'ZEC/USDC';retrievedAt:string;expiresAt:string;sourcePairs:[MarketLeg,MarketLeg]};
export type MarketQuotePricing=MarketSnapshot&{side:'bid'|'inverse-ask';rateNumerator:string;rateDenominator:string;acceptedAt:string|null;locked:boolean};
export const MARKET_BOUNDS={ZCASH_TO_BASE:{inputDecimals:8,outputDecimals:6,minInput:'100000',maxInput:'10000000',minOutput:'100000',maxOutput:'10000000'},BASE_TO_ZCASH:{inputDecimals:6,outputDecimals:8,minInput:'100000',maxInput:'10000000',minOutput:'10000',maxOutput:'10000000'}} as const;
const S18=10n**18n,S12=10n**12n,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function need(value:unknown,code:string):asserts value{if(!value)throw Error('MARKET_'+code);}
const sha=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function marketDecimal(value:unknown):bigint{need(typeof value==='string'&&/^(0|[1-9][0-9]{0,17})(\.[0-9]{1,18})?$/.test(value),'PRICE_INVALID');const [w,f='']=(value as string).split('.');const n=BigInt(w)*S18+BigInt(f.padEnd(18,'0'));need(n>0n,'PRICE_ZERO');return n;}
function scaled12(value:string){need(/^(0|[1-9][0-9]*)\.[0-9]{12}$/.test(value),'RATE_INVALID');return BigInt(value.replace('.',''));}
export function marketSnapshotDigest(s:Omit<MarketSnapshot,'snapshotSha256'>|MarketSnapshot){return sha(['zeeswap-market-price-v1',s.snapshotId,'Kraken','ZEC/USDC',s.retrievedAt,s.expiresAt,'XZECZUSD',s.sourcePairs[0].bid,s.sourcePairs[0].ask,'USDCUSD',s.sourcePairs[1].bid,s.sourcePairs[1].ask]);}
export function validateMarketSnapshot(value:unknown,at:number):asserts value is MarketSnapshot{
 const s=value as MarketSnapshot;need(s?.version===1&&uuid.test(s.snapshotId)&&s.source==='Kraken'&&s.pair==='ZEC/USDC'&&/^[a-f0-9]{64}$/.test(s.snapshotSha256),'SNAPSHOT_IDENTITY');
 const start=Date.parse(s.retrievedAt),end=Date.parse(s.expiresAt);need(Number.isFinite(start)&&Number.isFinite(end)&&new Date(start).toISOString()===s.retrievedAt&&new Date(end).toISOString()===s.expiresAt&&end>start&&end-start<=30000&&start<=at&&at<end&&at-start<=30000,'SNAPSHOT_EXPIRED');
 need(Array.isArray(s.sourcePairs)&&s.sourcePairs.length===2,'SOURCE_PAIRS');
 for(const [i,pair,key]of [[0,'ZEC/USD','XZECZUSD'],[1,'USDC/USD','USDCUSD']] as const){const l=s.sourcePairs[i];need(l?.pair===pair&&l.providerPair===key,'SOURCE_IDENTITY');const bid=marketDecimal(l.bid),ask=marketDecimal(l.ask);need(bid<=ask&&scaled12(l.mid)===(bid+ask)*S12/(2n*S18),'SOURCE_SPREAD');}
 need(marketSnapshotDigest(s)===s.snapshotSha256,'SNAPSHOT_DIGEST');
}
export function marketRatio(s:MarketSnapshot,direction:MarketDirection){
 const [z,u]=s.sourcePairs,zb=marketDecimal(z.bid),za=marketDecimal(z.ask),ub=marketDecimal(u.bid),ua=marketDecimal(u.ask);
 const bid=zb*S12/ua,ask=(za*S12+ub-1n)/ub;need(bid>0n&&ask>=bid,'RATE_INVALID');
 return direction==='ZCASH_TO_BASE'?{side:'bid' as const,rateNumerator:bid.toString(),rateDenominator:S12.toString()}:{side:'inverse-ask' as const,rateNumerator:S12.toString(),rateDenominator:ask.toString()};
}
export function marketOutput(input:string,direction:MarketDirection,s:MarketSnapshot,at:number){
 need(direction==='ZCASH_TO_BASE'||direction==='BASE_TO_ZCASH','DIRECTION');validateMarketSnapshot(s,at);const b=MARKET_BOUNDS[direction],n=atomic(input);need(n>=BigInt(b.minInput)&&n<=BigInt(b.maxInput),'INPUT_BOUNDS');const r=marketRatio(s,direction),output=n*BigInt(r.rateNumerator)*10n**BigInt(b.outputDecimals)/(BigInt(r.rateDenominator)*10n**BigInt(b.inputDecimals));
 need(output>=BigInt(b.minOutput)&&output<=BigInt(b.maxOutput),'OUTPUT_BOUNDS');return {outputAmount:output.toString(),pricing:{...s,...r,acceptedAt:null,locked:false} as MarketQuotePricing};
}
export function minimumMarketOrder(direction:MarketDirection,s:MarketSnapshot,at:number){
 validateMarketSnapshot(s,at);const b=MARKET_BOUNDS[direction],r=marketRatio(s,direction),numerator=BigInt(b.minOutput)*BigInt(r.rateDenominator)*10n**BigInt(b.inputDecimals),denominator=BigInt(r.rateNumerator)*10n**BigInt(b.outputDecimals),required=(numerator+denominator-1n)/denominator,input=required>BigInt(b.minInput)?required:BigInt(b.minInput);
 need(input<=BigInt(b.maxInput),'OUTPUT_BOUNDS');return {inputAmount:input.toString(),...marketOutput(input.toString(),direction,s,at)};
}
export function snapshotFromReference(reference:any,at:number,id=randomUUID()):MarketSnapshot{
 need(reference?.schemaVersion===1&&reference.status==='available'&&reference.source==='Kraken'&&reference.pair==='ZEC/USDC'&&reference.priceMode==='reference-only'&&reference.exchangeUpdatedAt===null&&reference.maxAgeSeconds===30,'REFERENCE_UNAVAILABLE');
 const s:MarketSnapshot={version:1,snapshotId:id,snapshotSha256:'',source:'Kraken',pair:'ZEC/USDC',retrievedAt:reference.retrievedAt,expiresAt:reference.expiresAt,sourcePairs:reference.sourcePairs};s.snapshotSha256=marketSnapshotDigest(s);validateMarketSnapshot(s,at);
 const f=marketRatio(s,'ZCASH_TO_BASE'),r=marketRatio(s,'BASE_TO_ZCASH');need(scaled12(reference.rate?.bid)===BigInt(f.rateNumerator)&&scaled12(reference.rate?.ask)===BigInt(r.rateDenominator),'REFERENCE_RATE');return s;
}
type Queryable=Pick<pg.Pool,'query'>;
/** Concrete fixed-provider publisher. Only the worker role may publish SQL snapshots;
 * the ordinary API role can reference them but cannot forge a source price. */
export class MarketPriceSource{
 private cache=createMarketReferenceCache();private previous?:MarketSnapshot;
 constructor(private publisher:Queryable){}
 start(){this.cache.start();}stop(){this.cache.stop();}
 available(){return this.cache.view().status==='available';}
 minimumOrders(at:number){const snapshot=snapshotFromReference(this.cache.view(),at),result={} as Record<MarketDirection,ReturnType<typeof minimumMarketOrder>|null>;for(const direction of ['ZCASH_TO_BASE','BASE_TO_ZCASH'] as const){try{result[direction]=minimumMarketOrder(direction,snapshot,at);}catch(e){if((e as Error).message!=='MARKET_OUTPUT_BOUNDS')throw e;result[direction]=null;}}return result;}
 async current(db:Queryable):Promise<MarketSnapshot>{
  const reference=this.cache.view(),at=new Date((await db.query('SELECT clock_timestamp() AS now')).rows[0].now).getTime();
  let s=this.previous;if(!s||sha({retrievedAt:s.retrievedAt,expiresAt:s.expiresAt,sourcePairs:s.sourcePairs})!==sha({retrievedAt:reference.retrievedAt,expiresAt:reference.expiresAt,sourcePairs:reference.sourcePairs}))s=snapshotFromReference(reference,at);
  validateMarketSnapshot(s,at);await this.publisher.query('SELECT zee.publish_market_snapshot($1,$2::jsonb,$3)',[s.snapshotId,JSON.stringify(s),Buffer.from(s.snapshotSha256,'hex')]);this.previous=s;return s;
 }
}
/** Accepted terms are validated at the recorded acceptance time, irrespective of
 * current feed availability. Caller still applies fresh chain/worker fences. */
export async function requireAcceptedMarketQuote(db:Queryable,keys:PrivateData,id:string,context?:{policySha256:string;workerBackendPid:number;activeEpoch:string;orderId:string}){
 if(context){need(context.orderId===id,'WORKER_ORDER');const rows=(await db.query('SELECT * FROM zee.check_market_policy_worker($1,$2)',[Buffer.from(context.policySha256,'hex'),id])).rows;need(rows.length===1&&rows[0].worker_backend_pid===context.workerBackendPid&&String(rows[0].accepted_epoch)===context.activeEpoch,'WORKER_BINDING');}
 const row=(await db.query(`SELECT q.*,o.accepted_at,encode(s.snapshot_sha256,'hex') snapshot_sha256,s.snapshot FROM zee.quotes q JOIN zee.orders o USING(id) JOIN zee.market_quote_prices m ON m.quote_id=q.id JOIN zee.market_price_snapshots s ON s.id=m.snapshot_id WHERE q.id=$1 AND q.pricing_mode='market-reference'`,[id])).rows[0];need(row,'ACCEPTED_QUOTE_REQUIRED');
 const acceptedAt=row.accepted_at instanceof Date?row.accepted_at.toISOString():new Date(row.accepted_at).toISOString(),quoteExpiresAt=row.expires_at instanceof Date?row.expires_at.toISOString():new Date(row.expires_at).toISOString(),at=Date.parse(acceptedAt),s=row.snapshot as MarketSnapshot;validateMarketSnapshot(s,at);need(at<Date.parse(quoteExpiresAt)&&row.snapshot_sha256===s.snapshotSha256,'ACCEPTED_PRICE_LOCK');
 const p=keys.open(row.private_payload,`quote:${id}:v1`) as any,calculated=marketOutput(row.input_amount,row.direction,s,at);need(p.inputAmount===row.input_amount&&p.outputAmount===row.output_amount&&p.direction===row.direction&&calculated.outputAmount===row.output_amount&&p.pricing?.snapshotSha256===s.snapshotSha256,'ACCEPTED_QUOTE_BINDING');
 return {id,quoteId:id,direction:row.direction as MarketDirection,executionMode:row.execution_mode,priceMode:'market-reference' as const,inputAmount:row.input_amount,outputAmount:row.output_amount,recipient:p.recipient,refundRecipient:p.refundRecipient,payer:p.payer,baseContract:p.baseContract,settlementId:p.settlementId,acceptedAt,quoteExpiresAt,pricing:{...calculated.pricing,acceptedAt,locked:true} as MarketQuotePricing};
}
