import { capability, decodeOrder, uuid, type OrderView, type PrivateOrder, type QuoteBody } from './protocol.ts';
import {decodeAvailability,type ServiceAvailability} from './availability.ts';
import {decodeMarketReference,type MarketReference} from './market-reference.ts';
import {decodePricingConfiguration,freshUnacceptedPricing,type PricingConfiguration} from './pricing.ts';
import type {LockedPricing} from './pricing.ts';
import {decodeBridgeStatus,decodeBridgeQuote,decodeBridgeOrder,type BridgeStatus,type BridgeQuoteBody,type BridgeQuote,type BridgeOrder} from './bridge.ts';

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
    FIXED_RATE_REQUIRED:'The service returned different pricing terms. No order was accepted. The current rate is 1 TAZ = 100 USDC.',
    MARKET_OUTPUT_BOUNDS:'This amount would produce a payout outside the supported destination limits. Start a new review with a supported amount; no payout is clipped.',
    MARKET_INPUT_BOUNDS:'This source amount is outside the saved policy limits. Review a supported testnet amount.',
    MARKET_REFERENCE_UNAVAILABLE:'The saved pricing service is unavailable. Accepted payouts remain unchanged.',
    MARKET_SNAPSHOT_EXPIRED:'These unaccepted saved terms expired. Reconcile the original order, then explicitly request a new quote.',
    BRIDGE_UNAVAILABLE:'The bridge is not activated or its reconciliation is unavailable. No new funding instructions can be trusted.',
    BRIDGE_ADMISSION_PAUSED:'Bridge admission is paused. Keep existing private order access and refresh its original status.',
    BRIDGE_QUOTE_EXPIRED:'This bridge quote expired. Do not send to expired deposit instructions or burn with expired terms.',
    BRIDGE_ORDER_NOT_FOUND:'This private bridge order is unavailable with this access key.',
    BRIDGE_IDEMPOTENCY_CONFLICT:'The saved bridge request conflicts with these terms. Reconcile the original request before proceeding.',
    BRIDGE_RECONCILIATION_UNAVAILABLE:'Bridge chain and backing reconciliation is unavailable. New deposits and burns are disabled.',
    OFFLINE:'The swap service is not connected. You can explore indicative testnet amounts; orders require a reachable service.',
    TIMEOUT:'The service did not reply in time. The result is unknown. Retry this same request to reconcile it.',
    DESTINATION_EVIDENCE_UNAVAILABLE:'The service has not confirmed the destination receipt. Keep the private order and check again; settlement is not verified.',
    BOUNDED_AMOUNT_REQUIRED:'This bounded testnet run accepts exactly 0.001 TAZ or 0.1 USDC.',
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
export function resolveApiOrigin(configured:string|undefined,production:boolean,pageOrigin:string):string {
  return apiOrigin(configured||(production?pageOrigin:'http://127.0.0.1:3031'));
}
export class ZeeApi {
  private creating:Promise<{order:OrderView;access:PrivateOrder}>|null=null;
  private request:{fingerprint:string;key:string;token:string;completed:boolean}|null=null;
  private accepts=new Map<string,Promise<OrderView>>();
  private immutableOrders=new Map<string,string>();
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
  async availability(signal?:AbortSignal):Promise<ServiceAvailability>{return decodeAvailability(await this.call('/availability',{signal}));}
  async marketReference(signal?:AbortSignal):Promise<MarketReference>{return decodeMarketReference(await this.call('/market-reference',{signal}));}
  async pricing(signal?:AbortSignal):Promise<PricingConfiguration>{return decodePricingConfiguration(await this.call('/pricing',{signal}));}
  private boundOrder(value:unknown):OrderView {
    const order=decodeOrder(value),immutable=JSON.stringify([order.direction,order.inputAmount,order.outputAmount,order.priceMode,order.priceMode==='market-reference'?(order.pricing as LockedPricing).snapshotSha256:order.pricing??null]);
    const previous=this.immutableOrders.get(order.id);if(previous&&previous!==immutable)throw new ApiError('INVALID_RESPONSE');this.immutableOrders.set(order.id,immutable);return order;
  }
  async bridgeStatus(signal?:AbortSignal):Promise<BridgeStatus>{return decodeBridgeStatus(await this.call('/v1/bridge/status',{signal}));}
  async bridgeQuote(body:BridgeQuoteBody,access:{token:string;key:string}):Promise<BridgeQuote>{return decodeBridgeQuote(await this.call('/v1/bridge/quotes',{method:'POST',body,token:access.token,key:access.key}),body);}
  async bridgeAccept(quote:BridgeQuote,body:BridgeQuoteBody,access:{token:string;key:string},token:string):Promise<BridgeOrder>{
    // Reconcile a lost acceptance response even after quote expiry or admission pause.
    const existing=await this.call(`/v1/bridge/orders/${quote.id}`,{token:access.token});
    if(record(existing)&&existing.status!=='QUOTED')return decodeBridgeOrder(existing,body,quote.id,token);
    decodeBridgeQuote(existing,body);if(Date.now()>=Date.parse(quote.expiresAt))throw new ApiError('BRIDGE_QUOTE_EXPIRED');
    return decodeBridgeOrder(await this.call('/v1/bridge/orders',{method:'POST',body:{quoteId:quote.id},token:access.token,key:access.key}),body,quote.id,token);
  }
  async bridgeOrder(id:string,body:BridgeQuoteBody,access:{token:string},token:string):Promise<BridgeOrder>{if(!uuid(id))throw new ApiError('NOT_FOUND');return decodeBridgeOrder(await this.call(`/v1/bridge/orders/${id}`,{token:access.token}),body,id,token);}
  create(body:QuoteBody):Promise<{order:OrderView;access:PrivateOrder}>{
    const fingerprint=JSON.stringify(body);
    if(this.creating){if(this.request?.fingerprint!==fingerprint)return Promise.reject(new ApiError('IDEMPOTENCY_CONFLICT'));return this.creating;}
    if(this.request&&!this.request.completed&&this.request.fingerprint!==fingerprint)return Promise.reject(new ApiError('IDEMPOTENCY_CONFLICT'));
    if(this.request?.fingerprint!==fingerprint)this.request={fingerprint,key:crypto.randomUUID(),token:capability(),completed:false};
    const request=this.request;
    this.creating=(async()=>{const order=this.boundOrder(await this.call('/v1/quotes',{method:'POST',body,token:request.token,key:request.key}));
      if(order.direction!==body.direction||order.inputAmount!==body.inputAmount||order.status!=='QUOTED')throw new ApiError('INVALID_RESPONSE',true);
      request.completed=true;if(order.priceMode==='market-reference'&&!freshUnacceptedPricing(order.pricing as LockedPricing,order.expiresAt))throw new ApiError('QUOTE_EXPIRED');
      return {order,access:{id:order.id,token:request.token}};})().catch(error=>{
        if(error instanceof ApiError&&!error.uncertain&&['INVALID_AMOUNT','INVALID_BASE_RECEIVER','INVALID_ZCASH_RECEIVER','MARKET_INPUT_BOUNDS','MARKET_OUTPUT_BOUNDS','BASE_ESCROW_NOT_READY'].includes(error.code))request.completed=true;
        throw error;
      });
    return this.creating.finally(()=>{this.creating=null;});
  }
  freshReview(){if(this.creating)throw Error('Wait for the current quote request.');if(this.request?.completed)this.request=null;}
  order(access:PrivateOrder):Promise<OrderView>{if(!uuid(access.id)||!/^[A-Za-z0-9_-]{43}$/.test(access.token))throw new ApiError('NOT_FOUND');return this.call(`/v1/orders/${access.id}`,{token:access.token}).then(value=>{const order=this.boundOrder(value);if(order.id!==access.id)throw new ApiError('INVALID_RESPONSE');return order;});}
  async funding(access:PrivateOrder,transactionHash:string):Promise<OrderView>{const order=this.boundOrder(await this.call(`/v1/orders/${access.id}/funding`,{method:'POST',token:access.token,body:{transactionHash}}));if(order.id!==access.id)throw new ApiError('INVALID_RESPONSE');return order;}
  accept(access:PrivateOrder):Promise<OrderView>{
    const active=this.accepts.get(access.id);if(active)return active;
    // Reconcile an earlier lost acceptance response before repeating its POST.
    const task=(async()=>{const existing=await this.order(access);if(existing.status!=='QUOTED')return existing;
      if(existing.priceMode==='market-reference'&&!freshUnacceptedPricing(existing.pricing as LockedPricing,existing.expiresAt))throw new ApiError('QUOTE_EXPIRED');
      const result=this.boundOrder(await this.call(`/v1/orders/${access.id}/accept`,{method:'POST',body:{},token:access.token}));if(result.id!==access.id)throw new ApiError('INVALID_RESPONSE',true);return result;})();
    this.accepts.set(access.id,task);return task.finally(()=>this.accepts.delete(access.id));
  }
}
