import { open,rename,readFile } from 'node:fs/promises';
import { atomic } from '../src/amounts.ts';
import type { Snapshot } from '../src/observer.ts';

export interface HistoricalOutput {txid:string;pool:string;index:number;amount:string;height:number}
export function filterHistorical(snapshot:Snapshot,historical:HistoricalOutput[]){
 const key=(o:HistoricalOutput)=>`${o.txid}:${o.pool}:${o.index}`;
 const excluded=new Map(historical.map(o=>[key(o),o]));
 if(excluded.size!==historical.length)throw Error('DUPLICATE_HISTORICAL_IDENTITY');
 return {...snapshot,outputs:snapshot.outputs.filter(o=>{
  const old=excluded.get(key(o));if(!old)return true;
  if(old.amount!==o.amount||old.height!==o.height)throw Error('HISTORICAL_OUTPUT_CHANGED');
  return false;
 })};
}
export function validateCapital(proof:any,scannedHeight:number,heldMinimum:bigint){
 const age=Date.now()-Date.parse(proof.observedAt);
 if(proof.schemaVersion!==1||proof.network!=='zcash-testnet'||!Number.isSafeInteger(proof.scannedHeight)
  ||!Number.isFinite(age)||age< -5000||age>300000||Math.abs(scannedHeight-proof.scannedHeight)>6)throw Error('STALE_CAPITAL_PROOF');
 const total=atomic(proof.totalSpendableZatoshis),held=atomic(proof.excludedHeldZatoshis),capital=atomic(proof.operatorFeeCapitalZatoshis);
 if(held<heldMinimum||total<held||capital!==total-held||capital<10000n)throw Error('INVALID_CAPITAL_PROOF');
 return capital.toString();
}
/** Exclusive creation before external effects; atomic replacement on recovery. */
export async function savePrivate(path:string,value:unknown,exclusive=false){
 const target=exclusive?path:`${path}.tmp`;
 const file=await open(target,'wx',0o600);
 try{await file.writeFile(JSON.stringify(value));await file.sync();}finally{await file.close();}
 if(!exclusive)await rename(target,path);
}
export async function readPrivate(path:string){return JSON.parse(await readFile(path,'utf8'));}
