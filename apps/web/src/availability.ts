import type {Direction} from './protocol.ts';
export type AvailabilityStatus='ready'|'paused'|'reconciling'|'source_unavailable'|'worker_unavailable'|'capital_unavailable'|'policy_expired'|'policy_exhausted'|'busy'|'disabled';
export type ServiceAvailability={version:1;status:AvailabilityStatus;checkedAt:string;policy:null|{id:string;sha256:string;expiresAt:string;inputAmountAtomic:'100000';maxAcceptedByDirection:Record<Direction,2>;remainingByDirection:Record<Direction,number>;maxConcurrent:1;activeOrders:number;remainingQuotes:number;availableByDirection:Record<Direction,boolean>}};
const statuses:AvailabilityStatus[]=['ready','paused','reconciling','source_unavailable','worker_unavailable','capital_unavailable','policy_expired','policy_exhausted','busy','disabled'];
function object(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
const exact=(v:Record<string,unknown>,k:string[])=>Object.keys(v).sort().join(',')===k.sort().join(',');
const directions=['ZCASH_TO_BASE','BASE_TO_ZCASH'] as const;
function need(v:unknown):asserts v{if(!v)throw Error('Invalid service availability response.');}
export function decodeAvailability(v:unknown,now=Date.now()):ServiceAvailability{
 need(object(v)&&exact(v,['version','status','checkedAt','policy'])&&v.version===1&&statuses.includes(v.status as AvailabilityStatus)&&typeof v.checkedAt==='string');
 const at=Date.parse(v.checkedAt);need(Number.isFinite(at)&&now-at>=-5000&&now-at<=60000);
 if(v.policy===null){need(v.status==='disabled');return v as ServiceAvailability;}
 const p=v.policy;need(object(p)&&exact(p,['id','sha256','expiresAt','inputAmountAtomic','maxAcceptedByDirection','remainingByDirection','maxConcurrent','activeOrders','remainingQuotes','availableByDirection']));
 need(typeof p.id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(p.id)&&typeof p.sha256==='string'&&/^[a-f0-9]{64}$/.test(p.sha256)&&p.sha256!=='0'.repeat(64)&&typeof p.expiresAt==='string'&&Number.isFinite(Date.parse(p.expiresAt))&&p.inputAmountAtomic==='100000'&&p.maxConcurrent===1&&Number.isSafeInteger(p.activeOrders)&&Number(p.activeOrders)>=0&&Number.isInteger(p.remainingQuotes)&&Number(p.remainingQuotes)>=0&&Number(p.remainingQuotes)<=32);
 for(const name of ['maxAcceptedByDirection','remainingByDirection','availableByDirection'] as const){const map=p[name];need(object(map)&&exact(map,[...directions]));for(const d of directions)need(name==='maxAcceptedByDirection'?map[d]===2:name==='remainingByDirection'?Number.isInteger(map[d])&&Number(map[d])>=0&&Number(map[d])<=2:typeof map[d]==='boolean');}
 const a=v as ServiceAvailability;
 if(a.status==='ready'){need(Date.parse(a.policy!.expiresAt)>now&&a.policy!.activeOrders===0&&a.policy!.remainingQuotes>0&&directions.some(d=>a.policy!.availableByDirection[d]));}
 for(const d of directions)if(a.policy!.availableByDirection[d])need(a.status==='ready'&&a.policy!.remainingByDirection[d]>0);
 return a;
}
export function serviceCanQuote(a:ServiceAvailability|undefined,direction:Direction,now=Date.now()){return !!a&&a.status==='ready'&&now-Date.parse(a.checkedAt)<=60000&&Date.parse(a.checkedAt)-now<=5000&&!!a.policy&&Date.parse(a.policy.expiresAt)>now&&a.policy.availableByDirection[direction];}
export function availabilityCopy(a:ServiceAvailability|undefined):string{
 if(!a)return 'API connected · service readiness unavailable';
 return ({ready:'Ready for a bounded testnet quote',paused:'New swaps are paused',reconciling:'Chain reconciliation in progress',source_unavailable:'Waiting for fresh chain observations',worker_unavailable:'Settlement worker unavailable',capital_unavailable:'Waiting for verified spendable capital',policy_expired:'Testnet admission period ended',policy_exhausted:'Testnet capacity exhausted',busy:'A swap is in progress · new swaps wait',disabled:'Testnet admission is disabled'})[a.status];
}
