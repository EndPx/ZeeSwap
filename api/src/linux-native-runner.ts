/** Explicit operator entry; one transition per cycle, never enables policy. */
import {setTimeout as delay} from 'node:timers/promises';
import {connect} from './db.ts';
import {PrivateData} from './private-data.ts';
import {BaseContract} from './base-contract.ts';
import {loadLinuxNativeDispatch,linuxNativeContexts,type NativePurpose} from './linux-native-dispatch.ts';
import {dispatchLiveReverseOnce,type ReverseStep} from './live-reverse-dispatch.ts';
import {dispatchLiveRefundOnce} from './live-source-refund.ts';
export function parseLinuxNativeArgs(purpose:NativePurpose,args:string[]){
 const path=args[0];if(!path||path.startsWith('--'))throw Error('LINUX_NATIVE_CONFIG_REQUIRED');
 const seen=new Set<string>();let once=false,retry=false,order:string|undefined,step:ReverseStep|undefined;
 for(let i=1;i<args.length;i++){const flag=args[i]!;if(!['--once','--order','--step','--retry-same-bytes'].includes(flag)||seen.has(flag))throw Error('LINUX_NATIVE_CLI');seen.add(flag);
  if(flag==='--once'){once=true;continue;}if(flag==='--retry-same-bytes'){retry=true;continue;}
  const value=args[++i];if(!value||value.startsWith('--'))throw Error('LINUX_NATIVE_CLI');
  if(flag==='--order'){if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value))throw Error('LINUX_NATIVE_CLI');order=value;}
  else{if(purpose!=='reverse'||!['COMMIT','APPROVE_NATIVE','NATIVE','ACK_BASE','COMPLETE','WAIT_ORDER'].includes(value))throw Error('LINUX_NATIVE_CLI');step=value as ReverseStep;}}
 if(purpose==='refund'&&!order||step&&(!once||!order)||retry&&(!once||!order||purpose==='reverse'&&(!step||!['COMMIT','NATIVE','ACK_BASE'].includes(step))))throw Error('LINUX_NATIVE_EXPLICIT_STEP_REQUIRED');
 return {path,once,retry,order,step};
}
export async function runLinuxNative(purpose:NativePurpose,args:ReturnType<typeof parseLinuxNativeArgs>){
 const loaded=await loadLinuxNativeDispatch(args.path,purpose);if(!loaded.c.enabled)return {status:'LINUX_NATIVE_DISABLED',financialAction:false};
 const {runtime,registry}=loaded.verified,pool=connect(runtime.workerUrl,4),keys=new PrivateData(Buffer.from(runtime.payloadKeyHex,'hex'),Buffer.from(runtime.lookupKeyHex,'hex')),
  base=new BaseContract(registry),contexts=linuxNativeContexts(loaded,pool,keys,base),stop=new AbortController();
 process.once('SIGINT',()=>stop.abort());process.once('SIGTERM',()=>stop.abort());
 try{for(let n=0;n<loaded.c.maxCycles&&!stop.signal.aborted;n++){
  const order=args.order??(await pool.query(`SELECT o.id FROM zee.orders o JOIN zee.quotes q USING(id) WHERE q.direction='BASE_TO_ZCASH' AND q.execution_mode='base-escrow-v1' AND o.state='READY' ORDER BY o.accepted_at,o.id LIMIT 1`)).rows[0]?.id;
  let result:Record<string,unknown>;
  if(!order)result={status:'WAIT_REVERSE_ORDER'};
  else result=purpose==='reverse'?await dispatchLiveReverseOnce(contexts.reverse,order,args.step,args.retry):await dispatchLiveRefundOnce(contexts.refund,order,args.retry);
  console.log(JSON.stringify({event:'linux-native-'+purpose,...result}));if(args.once||['COMPLETE','SETTLED','REFUNDED'].includes(String(result.status)))return result;
  await delay(loaded.c.pollSeconds*1000,undefined,{signal:stop.signal}).catch(()=>{});
 }return {status:'LINUX_NATIVE_BOUNDED_RUN_STOPPED'};}finally{await pool.end();}
}
