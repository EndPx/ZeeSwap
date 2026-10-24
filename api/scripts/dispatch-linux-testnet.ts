/** Explicit Linux-only forward entry; no worker starts during profile packaging. */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {loadLinuxForward,linuxForwardAdapters} from '../src/linux-forward-dispatch.ts';
import {connect} from '../src/db.ts';
import {PrivateData} from '../src/private-data.ts';
import {BaseContract} from '../src/base-contract.ts';
import {LocalBaseSigner} from '../src/base-signer.ts';
export async function runLinuxForward(path:string,once:boolean,reconcileOnly=false){
 const {c,verified:{runtime,registry}}=await loadLinuxForward(path);
 if(!c.enabled)return{status:'LINUX_FORWARD_DISABLED',financialAction:false};
 const pool=connect(runtime.workerUrl,3),keys=new PrivateData(Buffer.from(runtime.payloadKeyHex,'hex'),Buffer.from(runtime.lookupKeyHex,'hex'));
 const base=new BaseContract(registry),signer=new LocalBaseSigner(c.python,[c.supervisor.path,'--kind','base-forward','--script',c.signerScript.path,'--config',c.signerConfig.path],120000,true);
 const stop=new AbortController();process.once('SIGINT',()=>stop.abort());process.once('SIGTERM',()=>stop.abort());
 try{do{const result=await linuxForwardAdapters(pool,keys,base,signer,reconcileOnly);console.log(JSON.stringify({event:'linux-forward-dispatch',...result as object}));if(once)break;await delay(5000,undefined,{signal:stop.signal}).catch(()=>{});}while(!stop.signal.aborted);return{status:'LINUX_FORWARD_STOPPED'};}finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{const [path,...flags]=process.argv.slice(2);if(!path||flags.some(f=>!['--once','--reconcile-only'].includes(f))||new Set(flags).size!==flags.length)throw Error('LINUX_FORWARD_EXPLICIT_COMMAND');console.log(JSON.stringify(await runLinuxForward(path,flags.includes('--once'),flags.includes('--reconcile-only'))));}
 catch{console.error(JSON.stringify({event:'linux-forward-dispatch',status:'BLOCKED_RECONCILE_BEFORE_RESTART'}));process.exitCode=1;}
}
