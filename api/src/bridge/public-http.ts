import {createServer,type IncomingMessage} from 'node:http';
import {digest,type Books} from './model.ts';
import type {BridgeStore} from './repository.ts';
import {BridgeService,unavailableBridgeStatus} from './service.ts';
import {handleBridge} from './http.ts';
import {PublicBridgePilotRuntime} from './public-pilot.ts';

export function bridgeStatusStateKey(b:Readonly<Books>){return digest([b.paused,b.incident,b.controlled,b.inTransit,b.supply,b.feeCapital,b.qualification,b.publicPilot,Object.values(b.orders).map(o=>[o.id,o.status,o.accepted,o.pilotPermitSha256,o.source,o.destination,o.acknowledgment,o.feeReservation,o.attempt?.txid,o.nativeProfile?.profile.sha256])]);}
/** Original observation clocks stay in the cached aggregate. Financial or policy
 * state changes invalidate it; refreshing chain heads alone does not rewrite it. */
export class PublicBridgeStatusCache {
 private entry?:{key:string;at:number;value:Awaited<ReturnType<BridgeService['status']>>};
 invalidate(){this.entry=undefined;}
 recordVerified(b:Readonly<Books>,value:Awaited<ReturnType<BridgeService['status']>>){this.entry={key:bridgeStatusStateKey(b),at:Date.now(),value:structuredClone(value)};}
 async refresh(store:BridgeStore,service:BridgeService){const before=await store.read(),value=await service.status(),after=await store.read();if(bridgeStatusStateKey(before)!==bridgeStatusStateKey(after)){this.invalidate();return;}this.recordVerified(after,value);}
 get(b:Readonly<Books>,now=Date.now()){
  const e=this.entry,r=e?.value.reserveReport;if(!e||e.key!==bridgeStatusStateKey(b)||now-e.at<0||now-e.at>45000||!r||[r.zcash,r.base].some(a=>now-Date.parse(a.observedAt)< -5000||now-Date.parse(a.observedAt)>60000))return undefined;
  const value=structuredClone(e.value);if(b.publicPilot&&now>=Date.parse(b.publicPilot.expiresAt))return {...value,state:'paused' as const,reason:'BRIDGE_PUBLIC_PERMIT_EXPIRED',forwardEnabled:false,reverseEnabled:false};return value;
 }
}
/** Public HTTP has no evidence/control/signing endpoint. Normal capability
 * quote/accept/read routes retain strict Origin, body and finite rate boundaries. */
export function createPublicBridgeHttp(store:BridgeStore,pilot:PublicBridgePilotRuntime,cache:PublicBridgeStatusCache,execution:{busy:boolean},allowedOrigin='https://zeeswap.endpx.cloud'){
 if(!(pilot instanceof PublicBridgePilotRuntime)||allowedOrigin!=='https://zeeswap.endpx.cloud')throw Error('BRIDGE_CONCRETE_PUBLIC_RUNTIME_REQUIRED');const service=new BridgeService(store,pilot),windows=new Map<string,{at:number;count:number}>();
 const rate=(key:string,max:number)=>{const now=Date.now(),prior=windows.get(key),w=prior&&now-prior.at<60000?prior:{at:now,count:0};w.count++;windows.set(key,w);if(windows.size>2048)for(const [k,v] of windows)if(now-v.at>=60000)windows.delete(k);return w.count<=max;};
 const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.setHeader('Vary','Origin');if(req.headers.origin===allowedOrigin)res.setHeader('Access-Control-Allow-Origin',allowedOrigin);
  const reply=(code:number,value:unknown)=>{res.statusCode=code;res.end(JSON.stringify(value));};
  try{
   const path=req.url??'';if(!path.startsWith('/v1/bridge/')||path.includes('?')){reply(404,{error:'NOT_FOUND'});return;}
   if(!rate('global',120)){reply(429,{error:'RATE_LIMITED'});return;}
   if(req.method==='OPTIONS'){if(req.headers.origin!==allowedOrigin){reply(403,{error:'ORIGIN_FORBIDDEN'});return;}res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type,Idempotency-Key');res.statusCode=204;res.end();return;}
   if(req.method==='GET'&&path==='/v1/bridge/status'){
    const b=await store.read(),value=cache.get(b);if(value){reply(200,value);return;}
    reply(200,{...unavailableBridgeStatus(),asset:{symbol:'zeeTAZ',decimals:8,baseChainId:84532,tokenAddress:pilot.tokenAddress,bridgeContractAddress:pilot.contractAddress,runtimeCodeHash:pilot.runtimeCodeHash},state:'paused',reason:'BRIDGE_PUBLIC_FRESH_RECONCILIATION_REQUIRED'});return;
   }
   if(req.method==='POST'&&req.headers.origin!==allowedOrigin){reply(403,{error:'ORIGIN_FORBIDDEN'});return;}
   const token=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];if(!token){reply(401,{error:'AUTH_REQUIRED'});return;}
   if(!rate('cap:'+digest(token),30)){reply(429,{error:'RATE_LIMITED'});return;}
   const write=req.method==='POST';if(write&&execution.busy){reply(503,{error:'BRIDGE_RECONCILIATION_BUSY'});return;}
   if(write)execution.busy=true;
   try{await handleBridge(req,res,path,service);}finally{if(write){execution.busy=false;cache.invalidate();}}
  }catch{if(!res.writableEnded)reply(503,{error:'BRIDGE_RECONCILIATION_UNAVAILABLE'});}
 });server.requestTimeout=30000;server.headersTimeout=10000;return {server,service};
}
