import type {Direction} from './protocol.ts';
export type AvailabilityStatus='ready'|'paused'|'reconciling'|'source_unavailable'|'worker_unavailable'|'capital_unavailable'|'policy_expired'|'policy_exhausted'|'busy'|'disabled'|'rate_limited';
interface CommonPolicy {id:string;sha256:string;maxAcceptedByDirection:Record<Direction,2>;remainingByDirection:Record<Direction,number>;maxConcurrent:1;activeOrders:number;remainingQuotes:number;availableByDirection:Record<Direction,boolean>;}
export interface MarketBounds {min:string;max:string;decimals:6|8;default?:string;}
export type ServiceAvailability={version:1;status:AvailabilityStatus;checkedAt:string;policy:null|(CommonPolicy&{expiresAt:string;inputAmountAtomic:'100000'})}|{version:2;status:AvailabilityStatus;checkedAt:string;pricingMode:'market-reference';policy:null|(CommonPolicy&{expiresAt:string;pricingMode:'market-reference';inputBoundsByDirection:Record<Direction,MarketBounds&{default:string}>;outputBoundsByDirection:Record<Direction,MarketBounds>})}|{version:3;status:AvailabilityStatus;checkedAt:string;policy:null|(CommonPolicy&{expiresAt:null;inputAmountAtomic:'100000';lifetime:'nonexpiring';lifetimeAuthorizationSha256:string})}|{version:4;status:AvailabilityStatus;checkedAt:string;policy:null|(CommonPolicy&{expiresAt:null;inputAmountAtomic:'100000';lifetime:'nonexpiring';lifetimeAuthorizationSha256:string;capacityBasis:'funded-or-active';capacityAuthorizationSha256:string})}|ContinuousAvailability;
type ContinuousPolicy=Omit<CommonPolicy,'maxAcceptedByDirection'|'remainingQuotes'>&{expiresAt:null;inputAmountAtomic:'100000';lifetime:'nonexpiring';lifetimeAuthorizationSha256:string;capacityBasis:'current-liquidity';capacityAuthorizationSha256:string;maxAcceptedByDirection:null;remainingQuotes:null;quoteRateLimit:{max:32;windowSeconds:120;remaining:number}};
export type ContinuousAvailability={version:5;status:AvailabilityStatus;checkedAt:string;policy:ContinuousPolicy|null};
const statuses:AvailabilityStatus[]=['ready','paused','reconciling','source_unavailable','worker_unavailable','capital_unavailable','policy_expired','policy_exhausted','busy','disabled'];
function object(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
const exact=(v:Record<string,unknown>,k:string[])=>Object.keys(v).sort().join(',')===k.sort().join(',');
const directions=['ZCASH_TO_BASE','BASE_TO_ZCASH'] as const;
function need(v:unknown):asserts v{if(!v)throw Error('Invalid service availability response.');}
export function decodeAvailability(v:unknown,now=Date.now()):ServiceAvailability{
 if(object(v)&&v.version===5)return decodeContinuousAvailability(v,now);
 if(object(v)&&(v.version===3||v.version===4))return decodeNonexpiringAvailability(v,now);
 if(object(v)&&v.version===2)return decodeMarketAvailability(v,now);
 need(object(v)&&exact(v,['version','status','checkedAt','policy'])&&v.version===1&&statuses.includes(v.status as AvailabilityStatus)&&typeof v.checkedAt==='string');
 const at=Date.parse(v.checkedAt);need(Number.isFinite(at)&&now-at>=-5000&&now-at<=60000);
 if(v.policy===null){need(v.status==='disabled');return v as ServiceAvailability;}
 const p=v.policy;need(object(p)&&exact(p,['id','sha256','expiresAt','inputAmountAtomic','maxAcceptedByDirection','remainingByDirection','maxConcurrent','activeOrders','remainingQuotes','availableByDirection']));
 need(typeof p.expiresAt==='string'&&Number.isFinite(Date.parse(p.expiresAt)));
 validateFixedPolicy(p,v.status as AvailabilityStatus);
 if(v.status==='ready')need(Date.parse(p.expiresAt)>now);
 return v as ServiceAvailability;
}
function validateFixedPolicy(p:Record<string,unknown>,status:AvailabilityStatus):void {
 need(typeof p.id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(p.id)&&typeof p.sha256==='string'&&/^[a-f0-9]{64}$/.test(p.sha256)&&p.sha256!=='0'.repeat(64)&&p.inputAmountAtomic==='100000'&&p.maxConcurrent===1&&Number.isSafeInteger(p.activeOrders)&&Number(p.activeOrders)>=0&&Number.isInteger(p.remainingQuotes)&&Number(p.remainingQuotes)>=0&&Number(p.remainingQuotes)<=32);
 for(const name of ['maxAcceptedByDirection','remainingByDirection','availableByDirection'] as const){const map=p[name];need(object(map)&&exact(map,[...directions]));for(const d of directions)need(name==='maxAcceptedByDirection'?map[d]===2:name==='remainingByDirection'?Number.isInteger(map[d])&&Number(map[d])>=0&&Number(map[d])<=2:typeof map[d]==='boolean');}
 if(status==='ready')need(p.activeOrders===0&&Number(p.remainingQuotes)>0&&directions.some(d=>(p.availableByDirection as Record<Direction,boolean>)[d]));
 for(const d of directions)if((p.availableByDirection as Record<Direction,boolean>)[d])need(status==='ready'&&Number((p.remainingByDirection as Record<Direction,number>)[d])>0);
}
function decodeNonexpiringAvailability(v:Record<string,unknown>,now:number):ServiceAvailability {
 need(exact(v,['version','status','checkedAt','policy'])&&statuses.includes(v.status as AvailabilityStatus)&&typeof v.checkedAt==='string');
 const at=Date.parse(v.checkedAt);need(Number.isFinite(at)&&now-at>=-5000&&now-at<=60000);
 if(v.policy===null){need(v.status==='disabled');return v as unknown as ServiceAvailability;}
 const p=v.policy;
 need(object(p)&&exact(p,['id','sha256','expiresAt','inputAmountAtomic','maxAcceptedByDirection','remainingByDirection','maxConcurrent','activeOrders','remainingQuotes','availableByDirection','lifetime','lifetimeAuthorizationSha256',...(v.version===4?['capacityBasis','capacityAuthorizationSha256']:[])])&&p.expiresAt===null&&p.lifetime==='nonexpiring'&&typeof p.lifetimeAuthorizationSha256==='string'&&/^[a-f0-9]{64}$/.test(p.lifetimeAuthorizationSha256)&&p.lifetimeAuthorizationSha256!=='0'.repeat(64));
 if(v.version===4)need(p.capacityBasis==='funded-or-active'&&typeof p.capacityAuthorizationSha256==='string'&&/^[a-f0-9]{64}$/.test(p.capacityAuthorizationSha256)&&p.capacityAuthorizationSha256!=='0'.repeat(64));
 validateFixedPolicy(p,v.status as AvailabilityStatus);
 return v as unknown as ServiceAvailability;
}
function decodeContinuousAvailability(v:Record<string,unknown>,now:number):ContinuousAvailability {
 need(exact(v,['version','status','checkedAt','policy'])&&[...statuses,'rate_limited'].includes(v.status as AvailabilityStatus)&&typeof v.checkedAt==='string');
 const at=Date.parse(v.checkedAt);need(Number.isFinite(at)&&now-at>=-5000&&now-at<=60000);
 if(v.policy===null){need(v.status==='disabled');return v as ContinuousAvailability;}
 const p=v.policy;need(object(p)&&exact(p,['id','sha256','expiresAt','inputAmountAtomic','maxAcceptedByDirection','remainingByDirection','maxConcurrent','activeOrders','remainingQuotes','availableByDirection','lifetime','lifetimeAuthorizationSha256','capacityBasis','capacityAuthorizationSha256','quoteRateLimit']));
 need(p.expiresAt===null&&p.lifetime==='nonexpiring'&&p.capacityBasis==='current-liquidity'&&p.maxAcceptedByDirection===null&&p.remainingQuotes===null);
 for(const hash of [p.lifetimeAuthorizationSha256,p.capacityAuthorizationSha256])need(typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash)&&hash!=='0'.repeat(64));
 const rate=p.quoteRateLimit;need(object(rate)&&exact(rate,['max','windowSeconds','remaining'])&&rate.max===32&&rate.windowSeconds===120&&Number.isSafeInteger(rate.remaining)&&Number(rate.remaining)>=0&&Number(rate.remaining)<=32);
 const remaining=p.remainingByDirection;need(object(remaining)&&exact(remaining,[...directions]));
 for(const d of directions)need(Number.isSafeInteger(remaining[d])&&Number(remaining[d])>=0);
 // Reuse fixed-amount and readiness checks without imposing historical quotas.
 validateFixedPolicy({...p,maxAcceptedByDirection:{ZCASH_TO_BASE:2,BASE_TO_ZCASH:2},remainingQuotes:rate.remaining,remainingByDirection:{ZCASH_TO_BASE:Math.min(Number(remaining.ZCASH_TO_BASE),2),BASE_TO_ZCASH:Math.min(Number(remaining.BASE_TO_ZCASH),2)}},v.status as AvailabilityStatus);
 if(v.status==='rate_limited')need(rate.remaining===0);
 return v as ContinuousAvailability;
}
export function servicePolicyIsCurrent(a:ServiceAvailability,now=Date.now()):boolean {
 const p=a.policy;if(!p)return false;
 if((a.version===4||a.version===5)&&(!('capacityBasis'in p)||p.capacityBasis!==(a.version===5?'current-liquidity':'funded-or-active')||!('capacityAuthorizationSha256'in p)||!/^[a-f0-9]{64}$/.test(p.capacityAuthorizationSha256)||p.capacityAuthorizationSha256==='0'.repeat(64)))return false;
 if(a.version===3||a.version===4||a.version===5)return p.expiresAt===null&&'lifetime'in p&&p.lifetime==='nonexpiring'&&'lifetimeAuthorizationSha256'in p&&/^[a-f0-9]{64}$/.test(p.lifetimeAuthorizationSha256)&&p.lifetimeAuthorizationSha256!=='0'.repeat(64);
 return typeof p.expiresAt==='string'&&Date.parse(p.expiresAt)>now;
}
function decodeMarketAvailability(v:Record<string,unknown>,now:number):ServiceAvailability {
 need(exact(v,['version','status','checkedAt','pricingMode','policy'])&&v.pricingMode==='market-reference'&&statuses.includes(v.status as AvailabilityStatus)&&typeof v.checkedAt==='string');
 const at=Date.parse(v.checkedAt);need(Number.isFinite(at)&&now-at>=-5000&&now-at<=60000);
 if(v.policy===null){need(v.status==='disabled');return v as unknown as ServiceAvailability;}
 const p=v.policy;need(object(p)&&exact(p,['id','sha256','expiresAt','pricingMode','maxAcceptedByDirection','remainingByDirection','maxConcurrent','activeOrders','remainingQuotes','availableByDirection','inputBoundsByDirection','outputBoundsByDirection'])&&p.pricingMode==='market-reference');
 // Reuse the existing bounded policy/capacity proof without changing legacy bytes.
 const legacy={version:1,status:v.status,checkedAt:v.checkedAt,policy:{...p,inputAmountAtomic:'100000'}};delete (legacy.policy as Record<string,unknown>).pricingMode;delete (legacy.policy as Record<string,unknown>).inputBoundsByDirection;delete (legacy.policy as Record<string,unknown>).outputBoundsByDirection;decodeAvailability(legacy,now);
 for(const kind of ['inputBoundsByDirection','outputBoundsByDirection'] as const){const bounds=p[kind];need(object(bounds)&&exact(bounds,[...directions]));for(const d of directions){const r=bounds[d],input=kind==='inputBoundsByDirection',forward=d==='ZCASH_TO_BASE';need(object(r)&&exact(r,input?['min','max','decimals','default']:['min','max','decimals'])&&r.decimals===(input?(forward?8:6):(forward?6:8))&&r.min===(input||forward?'100000':'10000')&&r.max==='10000000');if(input)need(r.default===(forward?'100000':'1000000'));}}
 return v as unknown as ServiceAvailability;
}
export function serviceCanQuote(a:ServiceAvailability|undefined,direction:Direction,now=Date.now()){return !!a&&a.status==='ready'&&now-Date.parse(a.checkedAt)<=60000&&Date.parse(a.checkedAt)-now<=5000&&!!a.policy&&servicePolicyIsCurrent(a,now)&&a.policy.availableByDirection[direction];}
export function availabilityCopy(a:ServiceAvailability|undefined):string{
 if(!a)return 'API connected · service readiness unavailable';
 return ({ready:a.version===5?'Ready for a testnet quote':'Ready for a bounded testnet quote',paused:'New swaps are paused',reconciling:'Chain reconciliation in progress',source_unavailable:'Waiting for fresh chain observations',worker_unavailable:'Settlement worker unavailable',capital_unavailable:'Waiting for verified spendable capital',policy_expired:'Testnet admission period ended',policy_exhausted:'Testnet capacity exhausted',busy:'A swap is in progress · new swaps wait',disabled:'Testnet admission is disabled',rate_limited:'Quote requests are cooling down · try again shortly'})[a.status];
}
