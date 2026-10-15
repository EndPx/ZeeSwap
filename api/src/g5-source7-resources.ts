import {open} from 'node:fs/promises';
import {closeOwnedG5Lock,type G5OwnedLockIdentity} from './g5-reverse-startup.ts';
/** The core is already exclusively held. Own every subsequent fallible
 * startup step and never remove a replacement controller sentinel. */
export async function withG5Source7ControllerLock<T>(core:{close(pause:boolean):Promise<void>},load:()=>Promise<{stateFile:string}>,action:(config:any,path:string)=>Promise<T>,resolve:(path:string)=>string){
 let handle:Awaited<ReturnType<typeof open>>|undefined,identity:G5OwnedLockIdentity|undefined,path:string|undefined,failed=false;
 try{const config=await load();path=resolve(config.stateFile);handle=await open(path+'.lock','wx',0o600);const stat=await handle.stat({bigint:true});identity={dev:stat.dev,ino:stat.ino,birthtimeNs:stat.birthtimeNs};await handle.writeFile(JSON.stringify({pid:process.pid,recovery:'SOURCE7_EXPIRED_NO_EFFECT'}));await handle.sync();return await action(config,path);}
 catch(error){failed=true;throw error;}
 finally{let error:unknown;try{if(handle){if(identity&&path)await closeOwnedG5Lock(path+'.lock',handle,identity);else await handle.close();}}catch(e){error=e;}try{await core.close(false);}catch(e){error??=e;}if(error&&!failed)throw error;}
}
