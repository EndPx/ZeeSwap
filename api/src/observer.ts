import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type pg from 'pg';
import { transaction } from './db.ts';
import { Repository, parseMemo } from './repository.ts';
import { atomic } from './amounts.ts';
import { PrivateData } from './private-data.ts';
import { publishObserverBatch,requireObserverEpoch } from './observer-frontiers.ts';
import {retryAuthenticatedBaseHeadRead} from './base-observer-read-retry.ts';
import type { WalletAdapter } from './wallet-adapter.ts';

const HASH=/^[0-9a-f]{64}$/;
const schema=JSON.parse(readFileSync(new URL('../../workers/zcash-wallet/snapshot.schema.json',import.meta.url),'utf8'));
function shape(value:unknown,definition:any){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('INVALID_SNAPSHOT_SHAPE');
 const keys=Object.keys(value);if(definition.required.some((k:string)=>!keys.includes(k))||keys.some(k=>!(k in definition.properties)))throw new Error('INVALID_SNAPSHOT_SHAPE');
}
interface Block {height:number;hash:string;time:string}
interface Output {txid:string;index:number;pool:'orchard'|'ironwood';amount:string;receiver:string;memo:string|null;
 height:number;blockHash:string;blockTime:string;shieldedSource:boolean}
export interface Snapshot {schemaVersion:1;network:'zcash-testnet';consensusBranch:'77190ad9';observedAt:string;
 scannedHeight:number;tipHash:string;blocks:Block[];outputs:Output[]}
function integer(n:unknown):n is number{return Number.isSafeInteger(n)&&Number(n)>=0;}
function fresh(time:string){const age=Date.now()-Date.parse(time);if(!Number.isFinite(age)||age>60000||age< -5000)throw new Error('STALE_SNAPSHOT');}
export function validateSnapshot(value:unknown):Snapshot {
 shape(value,schema);
 const s=value as Snapshot;
 if(!s||s.schemaVersion!==1||s.network!=='zcash-testnet'||s.consensusBranch!=='77190ad9'||!integer(s.scannedHeight)||!HASH.test(s.tipHash)
  ||!Array.isArray(s.blocks)||!Array.isArray(s.outputs)||s.blocks.length>1000||s.outputs.length>1000)throw new Error('INVALID_SNAPSHOT');
 fresh(s.observedAt);const blocks=new Map<number,Block>();
 for(const b of s.blocks){shape(b,schema.properties.blocks.items);if(!integer(b.height)||b.height>s.scannedHeight||!HASH.test(b.hash)||!Number.isFinite(Date.parse(b.time))||blocks.has(b.height))throw new Error('INVALID_BLOCK');blocks.set(b.height,b);}
 if(blocks.get(s.scannedHeight)?.hash!==s.tipHash||!blocks.has(Math.max(0,s.scannedHeight-9)))throw new Error('MISSING_CHECKPOINT_BLOCK');
 const identities=new Set<string>();
 for(const o of s.outputs){shape(o,schema.properties.outputs.items);const b=blocks.get(o.height);const id=JSON.stringify([o.txid,o.pool,o.index]);
  if(!b||b.hash!==o.blockHash||Date.parse(b.time)!==Date.parse(o.blockTime)||!HASH.test(o.txid)||!integer(o.index)
   ||!['orchard','ironwood'].includes(o.pool)||typeof o.receiver!=='string'||o.receiver.length>512
   ||typeof o.shieldedSource!=='boolean'||!(o.memo===null||typeof o.memo==='string')||Buffer.byteLength(o.memo||'')>512||identities.has(id))throw new Error('INVALID_OUTPUT');
  atomic(o.amount);identities.add(id);
 }
 return s;
}

export async function ingestSnapshot(pool:pg.Pool,keys:PrivateData,value:unknown){
 const s=validateSnapshot(value);
 const finalized=s.blocks.find(b=>b.height===Math.max(0,s.scannedHeight-9))!;
 const epoch=await publishObserverBatch(pool,'source-wallet-snapshot',[{network:'zcash-testnet',height:s.scannedHeight,hash:s.tipHash,
  finalizedHeight:finalized.height,finalizedTime:new Date(finalized.time),observedAt:new Date(s.observedAt)}],
  s.blocks.map(b=>({network:'zcash-testnet' as const,height:b.height,hash:b.hash,time:new Date(b.time)})));
 return transaction(pool,async c=>{
  await requireObserverEpoch(c,epoch);
  const repository=new Repository(c,keys);let seen=0,planned=0,quarantined=0;
  for(const o of s.outputs){
   if(atomic(o.amount)===0n)continue;
   let reference:string;try{reference=parseMemo(o.memo||'');}catch{reference=`unrecognized:${createHash('sha256').update(o.memo||'').digest('hex')}`;}
   const id=await repository.observe({network:'zcash-testnet',txid:o.txid,index:o.index,pool:o.pool,reference,receiver:o.receiver,
    amount:o.amount,height:o.height,blockHash:o.blockHash,blockTime:new Date(o.blockTime),shielded:o.shieldedSource,
    memo:o.memo??undefined});seen++;
   const d=(await c.query('SELECT order_id,classification FROM zee.deposits WHERE id=$1',[id])).rows[0];
   if(!d.order_id||['QUARANTINED','PRIVACY_VIOLATION'].includes(d.classification)){quarantined++;continue;}
   const paused=(await c.query('SELECT reconciliation_required FROM zee.runtime_control')).rows[0].reconciliation_required;
   if(!paused&&s.scannedHeight-o.height+1>=10){await repository.confirm(id);planned++;}
  }
  return {scannedHeight:s.scannedHeight,observedOutputs:seen,eligibleOperations:planned,quarantinedOutputs:quarantined};
 });
}

export async function scanOnce(pool:pg.Pool,keys:PrivateData,wallet:WalletAdapter){
 const rows=(await pool.query("SELECT DISTINCT block_height::text FROM zee.deposits WHERE network='zcash-testnet' ORDER BY block_height LIMIT 501")).rows;
 if(rows.length>500)throw new Error('RECONCILIATION_WINDOW_LIMIT');
 return ingestSnapshot(pool,keys,await wallet.snapshot(await observerCheckHeights(pool,rows.map(r=>Number(r.block_height)))));
}

export async function observerCheckHeights(pool:pg.Pool,depositHeights:number[]){
 const row=(await pool.query("SELECT scanned_height,finalized_height FROM zee.scanner_checkpoints WHERE network='zcash-testnet'")).rows[0];
 const heights=[...new Set([...depositHeights,...(row?[Number(row.scanned_height),Number(row.finalized_height)]:[])])];
 if(heights.length>502)throw Error('RECONCILIATION_WINDOW_LIMIT');
 return heights;
}

export async function baseHead(pool:pg.Pool,rpc='https://sepolia.base.org'){
 if(new URL(rpc).protocol!=='https:')throw new Error('HTTPS_RPC_REQUIRED');
 async function call(method:string,params:unknown[]){const response=await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('BASE_RPC_UNAVAILABLE');const data=await response.json() as any;if(data.error||data.result==null)throw new Error('BASE_RPC_UNAVAILABLE');return data.result;}
 return retryAuthenticatedBaseHeadRead({read:async()=>{
 if(await call('eth_chainId',[])!=='0x14a34')throw new Error('WRONG_BASE_NETWORK');
 const [tip,finalized]=await Promise.all([call('eth_getBlockByNumber',['latest',false]),call('eth_getBlockByNumber',['finalized',false])]);
 const observedAt=new Date();
 const canonical=await call('eth_getBlockByNumber',[finalized.number,false]);
 if(canonical.hash!==finalized.hash)throw new Error('BASE_CANONICALITY_CONFLICT');
 const height=Number(BigInt(tip.number)),finalHeight=Number(BigInt(finalized.number));
 if(!integer(height)||!integer(finalHeight)||finalHeight>height||!HASH.test(tip.hash.slice(2))||!HASH.test(finalized.hash.slice(2)))throw new Error('INVALID_BASE_HEAD');
 const time=new Date(Number(BigInt(finalized.timestamp))*1000);
 const tipTime=Number(BigInt(tip.timestamp))*1000;
 if(!Number.isFinite(time.getTime())||!Number.isFinite(tipTime)||Date.now()-tipTime>120000||tipTime-Date.now()>30000)throw new Error('STALE_BASE_HEAD');
 return {heads:{height,finalHeight,tip,finalized,time},observedAt};
 },publish:async({heads:{height,finalHeight,tip,finalized,time},observedAt})=>{
 await publishObserverBatch(pool,'base-head',[{network:'base-sepolia',height,hash:tip.hash.slice(2),
  finalizedHeight:finalHeight,finalizedTime:time,observedAt}],
  [{network:'base-sepolia',height:finalHeight,hash:finalized.hash.slice(2),time}]);
 return {chainId:84532,latest:height,finalized:finalHeight};
 }});
}
