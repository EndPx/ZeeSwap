import { createServer, type IncomingMessage } from 'node:http';
import type pg from 'pg';
import { isAddress, getAddress, zeroAddress, type Hex } from 'viem';
import { transaction } from './db.ts';
import { PrivateData, accessHash } from './private-data.ts';
import { Repository } from './repository.ts';
import { fixtureOutput } from './amounts.ts';
import type { WalletAdapter } from './wallet-adapter.ts';
import type { BaseContract } from './base-contract.ts';
import { authorizeEscrow, observeEscrowFunding, fundingCall, type FundingTerms } from './base-escrow.ts';
import { receiptContext } from './base-settlement.ts';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type Options={pool:pg.Pool;keys:PrivateData;wallet:WalletAdapter;integrationOnly?:boolean;baseFeeBudget?:string;allowedOrigin?:string;base?:BaseContract;quoteBounds?:{inputAmountAtomic:'100000';maxAcceptedPerDirection:1};escrow?:{pool:pg.Pool;authorize:(terms:FundingTerms)=>Promise<Hex>}};
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
 if(options.integrationOnly && !['ep-small-resonance-aom8dm9z-pooler.','ep-polished-hill-ao5ulo5g-pooler.','ep-broad-math-aoxcd482-pooler.','ep-winter-frog-ao0z5ayy-pooler.'].some(prefix=>pool.options.host?.startsWith(prefix)))throw new Error('Integration mode requires a dedicated development database');
 async function enabled(){
  if(!options.integrationOnly){
   const ready=(await pool.query("SELECT count(*) FROM zee.assets WHERE id IN ('TAZ','mockUSDC') AND live_enabled")).rows[0].count;
   if(ready!=='2')throw new HttpError(503,'ROUTE_NOT_READY');
  }
 }
 async function view(id:string,token:string,funding=false){
  const privateQuote=await repo.privateQuote(id,token) as any;
  const row=(await pool.query('SELECT * FROM zee.order_status WHERE id=$1',[id])).rows[0];
  const attempts=options.base?(await pool.query('SELECT * FROM zee.base_order_status WHERE order_id=$1',[id])).rows:[];
  const paid=attempts.find(a=>a.phase==='PAY');
  const receipt=paid?.confirmed?keys.open(paid.receipt_payload,receiptContext(id,'PAY')) as any:undefined;
  let reverseDestination;
  if(row.direction==='BASE_TO_ZCASH'&&options.escrow){
   const payout=(await options.escrow.pool.query('SELECT confirmed,receipt_payload FROM zee.reverse_payouts WHERE order_id=$1',[id])).rows[0];
   const proof=payout?.confirmed?keys.open(payout.receipt_payload,`reverse-receipt:${id}:v1`) as any:undefined;
   if(proof&&(!/^[0-9a-f]{64}$/.test(proof.txid)||!Number.isSafeInteger(proof.blockHeight)||proof.blockHeight<=0||proof.recipient!==privateQuote.recipient||proof.amountZatoshi!==row.output_amount))throw new HttpError(503,'DESTINATION_EVIDENCE_UNAVAILABLE');
   if(row.state==='SETTLED'&&!proof)throw new HttpError(503,'DESTINATION_EVIDENCE_UNAVAILABLE');
   reverseDestination={network:'zcash-testnet',status:proof?'FINALIZED':payout?'PAYOUT_PENDING':'NOT_SUBMITTED',transactionHash:proof?.txid,blockNumber:proof?.blockHeight};
  }
  let escrowFunding;
  if(funding&&row.state==='AWAITING_FUNDS'&&new Date(row.funding_cutoff_time).getTime()>Date.now()&&row.direction==='BASE_TO_ZCASH'&&options.base&&options.escrow){
   const pinned=await authorizeEscrow(options.escrow.pool,keys,options.base,id,options.escrow.authorize);
   escrowFunding={network:'base-sepolia',chainId:84532,contract:options.base.registry.contracts.ZeeSwapSettlement.address,
    token:options.base.registry.contracts.MockUSDC.address,terms:pinned.terms,signature:pinned.signature,calldata:fundingCall(options.base,pinned.terms,pinned.signature)};
  }
  return {id,direction:row.direction,status:row.state||'QUOTED',inputAmount:row.input_amount,outputAmount:row.output_amount,
   executionMode:privateQuote.executionMode||'observe-only',
   escrowFunding,
   destination:options.base&&row.direction==='ZCASH_TO_BASE'?{network:'base-sepolia',status:receipt?'FINALIZED':paid?'PAYOUT_PENDING':attempts.length?'RESERVING':'NOT_SUBMITTED',
    transactionHash:receipt?.hash,blockNumber:receipt?.blockNumber}:reverseDestination,
   priceMode:'fixture',integrationOnly:!!options.integrationOnly,expiresAt:row.expires_at,
   source:{received:!!row.deposit_id,confirmed:!!row.confirmed_at,confirmations:row.confirmations||0,
    policy:row.direction==='ZCASH_TO_BASE'?'zcash-10-confirmations':'base-finalized',requiredConfirmations:row.direction==='ZCASH_TO_BASE'?10:null},
   funding:funding&&row.state==='AWAITING_FUNDS'&&(!options.base||privateQuote.executionMode==='base-settlement-v1')?{network:'zcash-testnet',receiver:privateQuote.depositReceiver,
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
   if(req.method==='GET'&&url.pathname==='/health'){await pool.query('SELECT 1');reply(200,{status:'ok',integrationOnly:!!options.integrationOnly,...(options.quoteBounds?{quoteBounds:options.quoteBounds}:{})});return;}
   const token=bearer(req);const ip=req.socket.remoteAddress||'unknown';const now=Date.now();
   if(rate.size>1000)for(const [k,v] of rate)if(v.until<now)rate.delete(k);
   const current=rate.get(ip);if(current&&current.until>now){if(++current.count>60)throw new HttpError(429,'RATE_LIMITED');}else {if(rate.size>=1000&&!current)throw new HttpError(429,'RATE_LIMITED');rate.set(ip,{count:1,until:now+60000});}
   if(req.method==='POST'&&url.pathname==='/v1/quotes'){
    const input=await body(req);exact(input,input.direction==='BASE_TO_ZCASH'?['direction','inputAmount','recipient','refundRecipient','payer']:['direction','inputAmount','recipient','refundRecipient']);
    if(!['ZCASH_TO_BASE','BASE_TO_ZCASH'].includes(String(input.direction)))throw new HttpError(400,'INVALID_DIRECTION');
    const direction=input.direction as 'ZCASH_TO_BASE'|'BASE_TO_ZCASH';
    const amount=string(input.inputAmount);try{fixtureOutput(amount,direction);}catch{throw new HttpError(400,'INVALID_AMOUNT');}
    if(options.quoteBounds&&amount!==options.quoteBounds.inputAmountAtomic)throw new HttpError(400,'BOUNDED_AMOUNT_REQUIRED');
    const key=req.headers['idempotency-key'];if(typeof key!=='string'||!UUID.test(key))throw new HttpError(400,'IDEMPOTENCY_KEY_REQUIRED');
    await enabled();
    const recipient=direction==='ZCASH_TO_BASE'?evm(input.recipient):await wallet.validate(string(input.recipient));
    const refundRecipient=direction==='ZCASH_TO_BASE'?await wallet.validate(string(input.refundRecipient)):evm(input.refundRecipient);
    const normalized={direction,inputAmount:amount,recipient,refundRecipient,...(direction==='BASE_TO_ZCASH'?{payer:evm(input.payer)}:{})};
    const executionMode=direction==='BASE_TO_ZCASH'?'base-escrow-v1':'base-settlement-v1';
    const requestHash=keys.lookup('http-request',`${token}:${key}`),bodyHash=keys.lookup('http-body',JSON.stringify(normalized));
    const existing=await pool.query('SELECT quote_id,body_hash FROM zee.api_quote_requests WHERE request_hash=$1 AND owner_hash=$2',[requestHash,accessHash(token)]);
    if(existing.rowCount){if(!existing.rows[0].body_hash.equals(bodyHash))throw new HttpError(409,'IDEMPOTENCY_CONFLICT');
     const previous=await view(existing.rows[0].quote_id,token);if(options.base&&previous.executionMode!==executionMode)throw new HttpError(409,'QUOTE_MODE_MISMATCH');reply(200,previous);return;}
    // Base-source funding must be a signed contract escrow request, never an EOA substitute.
    if(direction==='BASE_TO_ZCASH'&&(!options.base||!options.escrow))throw new HttpError(503,'BASE_ESCROW_NOT_READY');
    if(options.base){
     const health=await options.base.preflight();
     if(direction==='ZCASH_TO_BASE'&&BigInt(health.availableInventory)<BigInt(fixtureOutput(amount,direction)))throw new HttpError(503,'BASE_INVENTORY_UNAVAILABLE');
     if(await options.base.client.getBalance({address:options.base.registry.operator})<BigInt(options.baseFeeBudget||'100000000000000'))throw new HttpError(503,'BASE_GAS_UNAVAILABLE');
    }
    const depositReceiver=direction==='ZCASH_TO_BASE'?await wallet.allocate():'contract-escrow';
    const id=await transaction(pool,async c=>{
     await c.query('SELECT pg_advisory_xact_lock($1::bigint)',[requestHash.readBigInt64BE().toString()]);
     const old=await c.query('SELECT quote_id,body_hash FROM zee.api_quote_requests WHERE request_hash=$1 AND owner_hash=$2',[requestHash,accessHash(token)]);
     if(old.rowCount){if(!old.rows[0].body_hash.equals(bodyHash))throw new HttpError(409,'IDEMPOTENCY_CONFLICT');return old.rows[0].quote_id;}
     const q=await new Repository(c,keys).issueQuote({...normalized,depositReceiver,payoutFee:direction==='BASE_TO_ZCASH'?'10000':options.baseFeeBudget||'100000000000000',refundFee:direction==='BASE_TO_ZCASH'?options.baseFeeBudget||'100000000000000':'10000',
      ...(options.base?{executionMode,baseContract:options.base.registry.contracts.ZeeSwapSettlement.address}:{})},token);
     await c.query('INSERT INTO zee.api_quote_requests(request_hash,owner_hash,body_hash,quote_id) VALUES($1,$2,$3,$4)',[requestHash,accessHash(token),bodyHash,q.id]);return q.id;
    });reply(201,await view(id,token));return;
   }
   const funded=url.pathname.match(/^\/v1\/orders\/([0-9a-f-]+)\/funding$/);
   if(req.method==='POST'&&funded&&UUID.test(funded[1])){
    if(!options.base||!options.escrow)throw new HttpError(503,'BASE_ESCROW_NOT_READY');
    await repo.privateQuote(funded[1],token);
    const input=await body(req);exact(input,['transactionHash']);
    if(typeof input.transactionHash!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(input.transactionHash))throw new HttpError(400,'INVALID_INPUT');
    await observeEscrowFunding(options.escrow.pool,keys,options.base,funded[1],input.transactionHash as Hex);
    reply(200,await view(funded[1],token,true));return;
   }
   const match=url.pathname.match(/^\/v1\/(quotes|orders)\/([0-9a-f-]+)(\/accept)?$/);
   if(!match||!UUID.test(match[2]))throw new HttpError(404,'NOT_FOUND');
   const id=match[2];
   if(req.method==='GET'&&!match[3]){reply(200,await view(id,token,match[1]==='orders'));return;}
   if(req.method==='POST'&&match[1]==='orders'&&match[3]){
    exact(await body(req),[]);await enabled();
    if(options.base){const q=await repo.privateQuote(id,token) as any;if(q.executionMode!==(q.direction==='BASE_TO_ZCASH'?'base-escrow-v1':'base-settlement-v1')||q.baseContract?.toLowerCase()!==options.base.registry.contracts.ZeeSwapSettlement.address.toLowerCase())throw new HttpError(409,'QUOTE_MODE_MISMATCH');}
    if(options.quoteBounds){await transaction(pool,async c=>{await c.query('SELECT pg_advisory_xact_lock(2026102301)');const r=new Repository(c,keys),q=await r.privateQuote(id,token) as any;if(q.inputAmount!==options.quoteBounds!.inputAmountAtomic)throw new HttpError(400,'BOUNDED_AMOUNT_REQUIRED');const exists=(await c.query('SELECT 1 FROM zee.orders WHERE id=$1',[id])).rowCount;if(!exists){const n=(await c.query('SELECT count(*) FROM zee.orders o JOIN zee.quotes q USING(id) WHERE q.direction=$1',[q.direction])).rows[0].count;if(BigInt(n)>=BigInt(options.quoteBounds!.maxAcceptedPerDirection))throw new HttpError(409,'BOUNDED_ACCEPTANCE_LIMIT');await r.accept(id,token);}});}else await repo.accept(id,token);reply(200,await view(id,token,true));return;
   }
   throw new HttpError(404,'NOT_FOUND');
  }catch(error){
   if(error instanceof HttpError){reply(error.status,{error:error.code});return;}
   const message=error instanceof Error?error.message:'';
   if(message==='Order unavailable'){reply(404,{error:'NOT_FOUND'});return;}
   if(message==='INVALID_ZCASH_RECEIVER'){reply(400,{error:'INVALID_ZCASH_RECEIVER'});return;}
   if(/^(BASE_|WRONG_BASE_|INVALID_BASE_)/.test(message)){reply(503,{error:'BASE_UNAVAILABLE'});return;}
   if(/paused|stale|reconciliation|insufficient|capacity|WALLET_UNAVAILABLE/.test(message)){reply(503,{error:'TEMPORARILY_UNAVAILABLE'});return;}
   if(/quote expired/.test(message)){reply(409,{error:'QUOTE_EXPIRED'});return;}
   reply(500,{error:'INTERNAL_ERROR'});
  }
 });server.requestTimeout=15000;server.headersTimeout=10000;return server;
}
