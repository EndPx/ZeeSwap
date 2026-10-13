import { createServer, type IncomingMessage } from 'node:http';
import type pg from 'pg';
import { isAddress, getAddress, zeroAddress } from 'viem';
import { transaction } from './db.ts';
import { PrivateData, accessHash } from './private-data.ts';
import { Repository } from './repository.ts';
import { fixtureOutput } from './amounts.ts';
import type { WalletAdapter } from './wallet-adapter.ts';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type Options={pool:pg.Pool;keys:PrivateData;wallet:WalletAdapter;integrationOnly?:boolean;baseFeeBudget?:string;allowedOrigin?:string};
class HttpError extends Error {constructor(readonly status:number,readonly code:string){super(code);}}
function bearer(req:IncomingMessage){const value=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];if(!value)throw new HttpError(401,'AUTH_REQUIRED');return value;}
async function body(req:IncomingMessage):Promise<Record<string,unknown>> {
 if(req.headers['content-type']?.toLowerCase().split(';')[0].trim()!=='application/json')throw new HttpError(415,'JSON_REQUIRED');
 let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>8192)throw new HttpError(413,'BODY_TOO_LARGE');}
 try {const value=JSON.parse(text);if(!value||Array.isArray(value)||typeof value!=='object')throw Error();return value;}catch{throw new HttpError(400,'INVALID_JSON');}
}
function exact(value:Record<string,unknown>,fields:string[]){if(Object.keys(value).sort().join()!==fields.sort().join())throw new HttpError(400,'INVALID_FIELDS');}
function evm(value:unknown){if(typeof value!=='string'||!isAddress(value,{strict:true})||value.toLowerCase()===zeroAddress)throw new HttpError(400,'INVALID_BASE_RECEIVER');return getAddress(value);}
function string(value:unknown){if(typeof value!=='string'||value.length>512||value.length===0)throw new HttpError(400,'INVALID_INPUT');return value;}

export function createApi(options:Options){
 const {pool,keys,wallet}=options;const repo=new Repository(pool,keys);
 if(options.integrationOnly && !['ep-small-resonance-aom8dm9z-pooler.','ep-polished-hill-ao5ulo5g-pooler.'].some(prefix=>pool.options.host?.startsWith(prefix)))throw new Error('Integration mode requires a dedicated development database');
 async function enabled(){
  if(!options.integrationOnly){
   const ready=(await pool.query("SELECT count(*) FROM zee.assets WHERE id IN ('TAZ','mockUSDC') AND live_enabled")).rows[0].count;
   if(ready!=='2')throw new HttpError(503,'ROUTE_NOT_READY');
  }
 }
 async function view(id:string,token:string,funding=false){
  const privateQuote=await repo.privateQuote(id,token) as any;
  const row=(await pool.query('SELECT * FROM zee.order_status WHERE id=$1',[id])).rows[0];
  return {id,direction:row.direction,status:row.state||'QUOTED',inputAmount:row.input_amount,outputAmount:row.output_amount,
   priceMode:'fixture',integrationOnly:!!options.integrationOnly,expiresAt:row.expires_at,
   source:{received:!!row.deposit_id,confirmed:!!row.confirmed_at,confirmations:row.confirmations||0,
    policy:row.direction==='ZCASH_TO_BASE'?'zcash-10-confirmations':'base-finalized',requiredConfirmations:row.direction==='ZCASH_TO_BASE'?10:null},
   funding:funding&&row.state==='AWAITING_FUNDS'?{network:'zcash-testnet',receiver:privateQuote.depositReceiver,
    memo:JSON.stringify({v:1,ref:privateQuote.reference}),cutoffHeight:row.funding_cutoff_height,
    cutoffTime:row.funding_cutoff_time,cancellationAvailableAt:row.cancellation_available_at}:undefined};
 }
 const rate=new Map<string,{count:number;until:number}>();
 const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  const reply=(status:number,data:unknown)=>{res.statusCode=status;res.end(JSON.stringify(data));};
  try{
   if(req.headers.origin && req.headers.origin!==options.allowedOrigin)throw new HttpError(403,'ORIGIN_DENIED');
   if(req.headers.origin){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');}
   if(req.method==='OPTIONS'){
    if(!req.headers.origin||!options.allowedOrigin)throw new HttpError(403,'ORIGIN_DENIED');
    res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, Idempotency-Key');
    res.statusCode=204;res.end();return;
   }
   const url=new URL(req.url||'/','http://localhost');if(url.search)throw new HttpError(400,'QUERY_NOT_ALLOWED');
   if(req.method==='GET'&&url.pathname==='/health'){await pool.query('SELECT 1');reply(200,{status:'ok',integrationOnly:!!options.integrationOnly});return;}
   const token=bearer(req);const ip=req.socket.remoteAddress||'unknown';const now=Date.now();
   if(rate.size>1000)for(const [k,v] of rate)if(v.until<now)rate.delete(k);
   const current=rate.get(ip);if(current&&current.until>now){if(++current.count>60)throw new HttpError(429,'RATE_LIMITED');}else {if(rate.size>=1000&&!current)throw new HttpError(429,'RATE_LIMITED');rate.set(ip,{count:1,until:now+60000});}
   if(req.method==='POST'&&url.pathname==='/v1/quotes'){
    const input=await body(req);exact(input,['direction','inputAmount','recipient','refundRecipient']);
    if(!['ZCASH_TO_BASE','BASE_TO_ZCASH'].includes(String(input.direction)))throw new HttpError(400,'INVALID_DIRECTION');
    const direction=input.direction as 'ZCASH_TO_BASE'|'BASE_TO_ZCASH';
    const amount=string(input.inputAmount);try{fixtureOutput(amount,direction);}catch{throw new HttpError(400,'INVALID_AMOUNT');}
    const key=req.headers['idempotency-key'];if(typeof key!=='string'||!UUID.test(key))throw new HttpError(400,'IDEMPOTENCY_KEY_REQUIRED');
    await enabled();
    const recipient=direction==='ZCASH_TO_BASE'?evm(input.recipient):await wallet.validate(string(input.recipient));
    const refundRecipient=direction==='ZCASH_TO_BASE'?await wallet.validate(string(input.refundRecipient)):evm(input.refundRecipient);
    const normalized={direction,inputAmount:amount,recipient,refundRecipient};
    const requestHash=keys.lookup('http-request',`${token}:${key}`),bodyHash=keys.lookup('http-body',JSON.stringify(normalized));
    const existing=await pool.query('SELECT quote_id,body_hash FROM zee.api_quote_requests WHERE request_hash=$1 AND owner_hash=$2',[requestHash,accessHash(token)]);
    if(existing.rowCount){if(!existing.rows[0].body_hash.equals(bodyHash))throw new HttpError(409,'IDEMPOTENCY_CONFLICT');reply(200,await view(existing.rows[0].quote_id,token));return;}
    // Base-source funding must be a signed contract escrow request, never an EOA substitute.
    if(direction==='BASE_TO_ZCASH')throw new HttpError(503,'BASE_ESCROW_NOT_READY');
    const depositReceiver=await wallet.allocate();
    const id=await transaction(pool,async c=>{
     await c.query('SELECT pg_advisory_xact_lock($1::bigint)',[requestHash.readBigInt64BE().toString()]);
     const old=await c.query('SELECT quote_id,body_hash FROM zee.api_quote_requests WHERE request_hash=$1 AND owner_hash=$2',[requestHash,accessHash(token)]);
     if(old.rowCount){if(!old.rows[0].body_hash.equals(bodyHash))throw new HttpError(409,'IDEMPOTENCY_CONFLICT');return old.rows[0].quote_id;}
     const q=await new Repository(c,keys).issueQuote({...normalized,depositReceiver,payoutFee:options.baseFeeBudget||'100000000000000',refundFee:'10000'},token);
     await c.query('INSERT INTO zee.api_quote_requests(request_hash,owner_hash,body_hash,quote_id) VALUES($1,$2,$3,$4)',[requestHash,accessHash(token),bodyHash,q.id]);return q.id;
    });reply(201,await view(id,token));return;
   }
   const match=url.pathname.match(/^\/v1\/(quotes|orders)\/([0-9a-f-]+)(\/accept)?$/);
   if(!match||!UUID.test(match[2]))throw new HttpError(404,'NOT_FOUND');
   const id=match[2];
   if(req.method==='GET'&&!match[3]){reply(200,await view(id,token,match[1]==='orders'));return;}
   if(req.method==='POST'&&match[1]==='orders'&&match[3]){
    exact(await body(req),[]);await enabled();await repo.accept(id,token);reply(200,await view(id,token,true));return;
   }
   throw new HttpError(404,'NOT_FOUND');
  }catch(error){
   if(error instanceof HttpError){reply(error.status,{error:error.code});return;}
   const message=error instanceof Error?error.message:'';
   if(message==='Order unavailable'){reply(404,{error:'NOT_FOUND'});return;}
   if(message==='INVALID_ZCASH_RECEIVER'){reply(400,{error:'INVALID_ZCASH_RECEIVER'});return;}
   if(/paused|stale|reconciliation|insufficient|capacity|WALLET_UNAVAILABLE/.test(message)){reply(503,{error:'TEMPORARILY_UNAVAILABLE'});return;}
   if(/quote expired/.test(message)){reply(409,{error:'QUOTE_EXPIRED'});return;}
   reply(500,{error:'INTERNAL_ERROR'});
  }
 });server.requestTimeout=15000;server.headersTimeout=10000;return server;
}
