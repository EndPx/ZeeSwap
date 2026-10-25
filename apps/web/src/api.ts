import { capability, decodeOrder, uuid, type OrderView, type PrivateOrder, type QuoteBody } from './protocol.ts';

export type QuoteBounds={inputAmountAtomic:'100000';maxAcceptedPerDirection:1}|{
  inputAmountAtomic:'100000';maxAcceptedByDirection:{ZCASH_TO_BASE:2|3;BASE_TO_ZCASH:1};newForwardCutoffBlocks:40;continuationSha256:string;
};
export interface ApiHealth {status:'ok';integrationOnly:boolean;quoteBounds?:QuoteBounds;}
const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const exactKeys=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).sort().join(',')===[...keys].sort().join(',');
/** Connectivity and declared limits only; this response does not establish admission readiness. */
export function decodeHealth(value:unknown):ApiHealth {
  if(!record(value)||!exactKeys(value,['status','integrationOnly',...(Object.hasOwn(value,'quoteBounds')?['quoteBounds']:[])])||value.status!=='ok'||typeof value.integrationOnly!=='boolean')throw new ApiError('INVALID_RESPONSE');
  if(Object.hasOwn(value,'quoteBounds')){
    const b=value.quoteBounds;
    if(!record(b)||b.inputAmountAtomic!=='100000')throw new ApiError('INVALID_RESPONSE');
    if(Object.hasOwn(b,'maxAcceptedPerDirection')){
      if(!exactKeys(b,['inputAmountAtomic','maxAcceptedPerDirection'])||b.maxAcceptedPerDirection!==1)throw new ApiError('INVALID_RESPONSE');
    }else{
      const limits=b.maxAcceptedByDirection;
      if(!exactKeys(b,['inputAmountAtomic','maxAcceptedByDirection','newForwardCutoffBlocks','continuationSha256'])||!record(limits)
        ||!exactKeys(limits,['ZCASH_TO_BASE','BASE_TO_ZCASH'])||![2,3].includes(limits.ZCASH_TO_BASE as number)||limits.BASE_TO_ZCASH!==1
        ||b.newForwardCutoffBlocks!==40||typeof b.continuationSha256!=='string'||!/^[a-f0-9]{64}$/.test(b.continuationSha256)||b.continuationSha256==='0'.repeat(64))throw new ApiError('INVALID_RESPONSE');
    }
  }
  return value as unknown as ApiHealth;
}

export class ApiError extends Error { constructor(readonly code:string,readonly uncertain=false){super(errorCopy(code));} }
export function errorCopy(code:string):string {
  const copy:Record<string,string>={
    OFFLINE:'The swap service is not connected. You can explore indicative testnet amounts; orders require a reachable service.',
    TIMEOUT:'The service did not reply in time. The result is unknown. Retry this same request to reconcile it.',
    DESTINATION_EVIDENCE_UNAVAILABLE:'The service has not confirmed the destination receipt. Keep the private order and check again; settlement is not verified.',
    BOUNDED_AMOUNT_REQUIRED:'This bounded testnet run accepts exactly 0.001 TAZ or 0.1 mockUSDC.',
    BOUNDED_ACCEPTANCE_LIMIT:'This direction has already accepted its one order in the bounded testnet run. Wait for operator reconciliation.',
    BASE_ESCROW_NOT_READY:'Base-to-Zcash escrow funding is not available through this API yet. No order or deposit instructions were created.',
    ROUTE_NOT_READY:'This testnet route is paused. No funding instructions are available.',
    TEMPORARILY_UNAVAILABLE:'The service is paused or reconciling. Keep any existing order and try its status again.',
    BASE_INVENTORY_UNAVAILABLE:'The operator does not have enough verified testnet inventory for this amount.',
    BASE_GAS_UNAVAILABLE:'The route is waiting for operator gas capacity.',
    INVALID_ZCASH_RECEIVER:'The server could not verify an Orchard receiver in this Zcash testnet address.',
    INVALID_BASE_RECEIVER:'Enter a valid Base Sepolia recipient address.',
    INVALID_AMOUNT:'The amount is outside the supported testnet range.',
    QUOTE_EXPIRED:'This quote expired before acceptance. Request a new quote; do not use old funding details.',
    IDEMPOTENCY_CONFLICT:'The saved request does not match these terms. Start a new review without reusing the old request.',
    NOT_FOUND:'This private order is unavailable with this access key.',
    RATE_LIMITED:'Too many requests. Wait a minute before checking again.',
    ORIGIN_DENIED:'This web address is not allowed by the API. Configure ZEE_ALLOWED_ORIGIN for this frontend.',
    INVALID_RESPONSE:'The service returned an unsupported response. No new funding instruction can be trusted.',
  }; return copy[code]??'The service could not complete this request. Keep your order access and retry its status.';
}
export function apiOrigin(value:string):string {
  const url=new URL(value);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('VITE_API_BASE_URL must be an HTTP(S) origin without credentials or a path.');
  if(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Use HTTPS for a remote API.');
  return url.origin;
}
export class ZeeApi {
  private creating:Promise<{order:OrderView;access:PrivateOrder}>|null=null;
  private request:{fingerprint:string;key:string;token:string;completed:boolean}|null=null;
  private accepts=new Map<string,Promise<OrderView>>();
  constructor(readonly origin:string,private readonly fetcher:typeof fetch=fetch) {apiOrigin(origin);}
  private async call(path:string,options:{method?:string;body?:unknown;token?:string;key?:string;signal?:AbortSignal}={}):Promise<unknown>{
    let response:Response;
    try{response=await this.fetcher.call(globalThis,`${this.origin}${path}`,{method:options.method??'GET',headers:{'Content-Type':'application/json',...(options.token?{Authorization:`Bearer ${options.token}`}:{}) ,...(options.key?{'Idempotency-Key':options.key}:{})},
      ...(options.body!==undefined?{body:JSON.stringify(options.body)}:{}),cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:options.signal??AbortSignal.timeout(12000)});}
    catch(error){if((error as Error).name==='TimeoutError'||(error as Error).name==='AbortError')throw new ApiError('TIMEOUT',options.method==='POST');throw new ApiError('OFFLINE',options.method==='POST');}
    let value:unknown;try{value=await response.json();}catch{throw new ApiError('INVALID_RESPONSE',options.method==='POST');}
    if(!response.ok)throw new ApiError(typeof value==='object'&&value&&'error'in value&&typeof value.error==='string'?value.error:'UNKNOWN_ERROR');
    return value;
  }
  async health(signal?:AbortSignal):Promise<ApiHealth>{return decodeHealth(await this.call('/health',{signal}));}
  create(body:QuoteBody):Promise<{order:OrderView;access:PrivateOrder}>{
    const fingerprint=JSON.stringify(body);
    if(this.creating){if(this.request?.fingerprint!==fingerprint)return Promise.reject(new ApiError('IDEMPOTENCY_CONFLICT'));return this.creating;}
    if(this.request?.fingerprint!==fingerprint)this.request={fingerprint,key:crypto.randomUUID(),token:capability(),completed:false};
    const request=this.request;
    this.creating=(async()=>{const order=decodeOrder(await this.call('/v1/quotes',{method:'POST',body,token:request.token,key:request.key}));
      if(order.direction!==body.direction||order.inputAmount!==body.inputAmount||order.status!=='QUOTED')throw new ApiError('INVALID_RESPONSE',true);
      request.completed=true;return {order,access:{id:order.id,token:request.token}};})();
    return this.creating.finally(()=>{this.creating=null;});
  }
  freshReview(){if(this.creating)throw Error('Wait for the current quote request.');if(this.request?.completed)this.request=null;}
  order(access:PrivateOrder):Promise<OrderView>{if(!uuid(access.id)||!/^[A-Za-z0-9_-]{43}$/.test(access.token))throw new ApiError('NOT_FOUND');return this.call(`/v1/orders/${access.id}`,{token:access.token}).then(value=>{const order=decodeOrder(value);if(order.id!==access.id)throw new ApiError('INVALID_RESPONSE');return order;});}
  async funding(access:PrivateOrder,transactionHash:string):Promise<OrderView>{return decodeOrder(await this.call(`/v1/orders/${access.id}/funding`,{method:'POST',token:access.token,body:{transactionHash}}));}
  accept(access:PrivateOrder):Promise<OrderView>{
    const active=this.accepts.get(access.id);if(active)return active;
    // Reconcile an earlier lost acceptance response before repeating its POST.
    const task=(async()=>{const existing=await this.order(access);if(existing.status!=='QUOTED')return existing;
      const result=decodeOrder(await this.call(`/v1/orders/${access.id}/accept`,{method:'POST',body:{},token:access.token}));if(result.id!==access.id)throw new ApiError('INVALID_RESPONSE',true);return result;})();
    this.accepts.set(access.id,task);return task.finally(()=>this.accepts.delete(access.id));
  }
}
