import {setTimeout as delay} from 'node:timers/promises';
import {parseChefStatus,readJson} from './integrations/observation/chef.ts';
/** Only transient ready-gate responses may retry. Every read and delay shares
 * the caller's original deadline; returned source clocks are never rewritten. */
export async function readReadyOpeningChefStatus(request:()=>Promise<Response>,project:string,signal:AbortSignal,deadline:number,
 clock:()=>number=Date.now,pause:(ms:number,signal:AbortSignal)=>Promise<void>=(ms,s)=>delay(ms,undefined,{signal:s})){
 let generation:string|undefined,last:unknown=Error('OPENING_NATIVE_READINESS_EXHAUSTED');
 for(let attempt=0;attempt<6;attempt++){
  signal.throwIfAborted();if(clock()>=deadline)throw last;const response=await request();signal.throwIfAborted();let wait=1000;
  if(response.status===429||response.status===503){
   await response.body?.cancel();last=Error('OPENING_NATIVE_HTTP_READINESS');const after=response.headers.get('retry-after');
   if(after!==null){const ms=/^[0-9]+$/.test(after)?Number(after)*1000:Date.parse(after)-clock();if(!Number.isFinite(ms)||ms>5000)throw Error('OPENING_NATIVE_RETRY_AFTER_BOUND');wait=Math.max(250,ms);}
  }else{
   if(!response.ok)throw Error('OPENING_NATIVE_SOURCE_HTTP');const raw=await readJson(response,signal);
   const observed=raw as {project?:unknown;generation?:unknown};if(observed.project===project&&typeof observed.generation==='string'){if(generation!==undefined&&generation!==observed.generation)throw Error('OPENING_NATIVE_GENERATION_CHANGED');generation=observed.generation;}
   try{return parseChefStatus(raw,project,clock());}catch(error){if((error as {code?:unknown})?.code!=='WAIT_SOURCE_UNREADY')throw error;last=error;}
  }
  if(attempt===5||clock()+wait>=deadline)throw last;await pause(wait,signal);
 }
 throw last;
}
