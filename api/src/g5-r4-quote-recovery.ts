import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {g5Binding,g5PathIdentity,G5_RETRY_TARGET,type G5State} from './g5-run.ts';
import type {G5LiveState} from './g5-live-controller.ts';
export function requireG5UnfundedR4QuoteRecovery(main:G5State,manifest:any,controller:G5LiveState,cfg:any,manifestPath:string){
 if(manifest.branchId!==G5_RETRY_TARGET.branchId||manifest.runId!=='1f34e059-4de1-49f6-bbaa-323008577994'||main.runId!==manifest.runId||main.binding!==g5Binding(manifest)||!main.policyInitialized||main.incident||main.closed||main.orders.length!==4||main.batchSize!==5||(main.barriers?.length??0)!==0
  ||main.orders.some((o,i)=>o.sequence!==i+1||o.direction!==(i%2?'BASE_TO_ZCASH':'ZCASH_TO_BASE')||o.verified)||main.orders.slice(0,3).some(o=>!o.orderId||!o.receiptVerified)||main.orders[3].orderId||main.orders[3].receiptVerified
  ||controller.version!==2||controller.runId!==main.runId||!controller.incident||controller.closed||controller.barriers.length!==0||controller.slots.length!==4||controller.slots.some((o,i)=>o.sequence!==i+1||o.stage!==(i<3?'DONE':'REVERSE_QUOTE'))||controller.inflight?.sequence!==4||controller.inflight.stage!=='REVERSE_QUOTE'
  ||cfg.runId!==main.runId||cfg.manifestBinding!==g5Binding(manifest)||g5PathIdentity(cfg.runConfig)!==g5PathIdentity(manifestPath)||controller.binding!==createHash('sha256').update(JSON.stringify(cfg)).digest('hex'))throw Error('G5_ONLY_EMPTY_R4_QUOTE_UNKNOWN_RECOVERABLE');
}
export function requireG5UnfundedR4NoEffects(facts:{ownerQuotes:number;quotes:number;orders:number;digests:string[];fundingHash?:string}){
 if(facts.ownerQuotes!==0||facts.quotes!==3||facts.orders!==3||facts.fundingHash||facts.digests.some(d=>d!=='0'.repeat(64)))throw Error('G5_R4_QUOTE_OR_FUNDING_EFFECT_EXISTS');
}
export async function saveG5UnfundedR4QuoteLocal(original:G5LiveState,io:{save(s:G5LiveState):Promise<void>;read():Promise<G5LiveState>}){
 const next=structuredClone(original);next.incident=false;delete next.inflight;
 try{await io.save(next);return next;}catch(error){try{const current=await io.read();if(isDeepStrictEqual(current,original)||isDeepStrictEqual(current,next))await io.save(original);}catch{}throw error;}
}
