import type { IncomingMessage, ServerResponse } from 'node:http';
import { BridgeService, unavailableBridgeStatus, type QuoteInput } from './service.ts';

/** This handler exposes no evidence, control, signing or accounting mutation API. */
export async function handleBridge(req:IncomingMessage,res:ServerResponse,path:string,service?:BridgeService):Promise<boolean>{
 if(!path.startsWith('/v1/bridge/'))return false;
 const reply=(status:number,value:unknown)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(value));};
 try{
  if(req.method==='GET'&&path==='/v1/bridge/status'){reply(200,service?await service.status():unavailableBridgeStatus());return true;}
  const token=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];if(!token){reply(401,{error:'AUTH_REQUIRED'});return true;}
  if(!service){reply(503,{error:'BRIDGE_UNAVAILABLE'});return true;}
  if(req.method==='GET'&&/^\/v1\/bridge\/orders\/[0-9a-f-]{36}$/.test(path)){reply(200,await service.order(path.split('/').at(-1)!,token));return true;}
  if(req.method!=='POST'||!['/v1/bridge/quotes','/v1/bridge/orders'].includes(path)){reply(404,{error:'NOT_FOUND'});return true;}
  const key=req.headers['idempotency-key'];if(typeof key!=='string'){reply(400,{error:'IDEMPOTENCY_KEY_REQUIRED'});return true;}
  if(req.headers['content-type']?.split(';')[0].trim()!=='application/json'){reply(415,{error:'JSON_REQUIRED'});return true;}
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>8192){reply(413,{error:'BODY_TOO_LARGE'});return true;}}
  let input:Record<string,unknown>;try{input=JSON.parse(raw);if(!input||typeof input!=='object'||Array.isArray(input))throw Error();}catch{reply(400,{error:'INVALID_JSON'});return true;}
  if(path==='/v1/bridge/quotes'){
   const fields=input.direction==='TAZ_TO_ZEETAZ'?['direction','amountAtomic','recipient','refundRecipient']:['direction','amountAtomic','recipient','payer'];
   if(Object.keys(input).sort().join()!==fields.sort().join())throw Error('BRIDGE_INVALID_FIELDS');
   reply(201,await service.quote(input as QuoteInput,token,key));
  }else{if(Object.keys(input).join()!=='quoteId'||typeof input.quoteId!=='string')throw Error('BRIDGE_INVALID_FIELDS');reply(201,await service.accept(input.quoteId,token,key));}
 }catch(e){
  const code=e instanceof Error?e.message:'';
  // Never serialize adapter/SQL/RPC error text: it may contain private legs/keys.
  const safe=/^BRIDGE_[A-Z_]+$/.test(code)?code:'BRIDGE_UNAVAILABLE';
  const status=safe==='BRIDGE_ORDER_NOT_FOUND'?404:safe.includes('CONFLICT')?409:/INVALID|BOUNDS|REQUIRED|EXPIRED|BINDING/.test(safe)?400:503;
  reply(status,{error:safe});
 }
 return true;
}
