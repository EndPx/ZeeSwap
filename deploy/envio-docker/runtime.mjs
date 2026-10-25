import {spawn} from 'node:child_process';
import {readFile,lstat,rename,open} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {loadConfig,exportInputs,engineEnvironment,durable,need,ROOT,APP,API,PROJECT} from './config.mjs';
import {processIdentity} from './healthcheck.mjs';
export function commandFor(component){
 if(component==='engine')return{command:'/bin/bash',args:[APP+'/deploy/linux/envio/run-engine.sh'],cwd:PROJECT};
 need(component==='export','COMMAND_COMPONENT');return{command:'/usr/bin/node',args:['--import','tsx','scripts/envio-export-server.ts','/run/zeeswap-envio/export-profile.private.json'],cwd:API};
}
export async function groupExists(pid){try{process.kill(-pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}}
/** Do not acknowledge cleanup until the entire original group is absent. Docker init reaps orphans. */
export async function drainGroup(pid,{exists=groupExists,kill=(p,s)=>process.kill(-p,s),pause=delay,now=()=>performance.now(),termMs=60000}={}){
 if(!await exists(pid))return;try{kill(pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')throw e;}
 const began=now();let killed=false;while(await exists(pid)){if(!killed&&now()-began>=termMs){try{kill(pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')throw e;}killed=true;}await pause(100);}
}
/** Caller records a durable fatal latch before unexpected-exit cleanup; no automatic child restart. */
export async function superviseChild(spec,{spawnChild=spawn,onSpawn=async()=>{},onFatal=async()=>{},drain=drainGroup,signals=process,signalGroup=(p,s)=>process.kill(-p,s)}={}){
 let stopping=false,child,pid,exitResolve;const exited=new Promise(resolve=>{exitResolve=resolve;});
 const stop=()=>{stopping=true;if(pid)try{signalGroup(pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')exitResolve({error:true});}};
 signals.on('SIGTERM',stop);signals.on('SIGINT',stop);
 try{
  if(stopping)return{stopped:true};
  try{child=spawnChild(spec.command,spec.args,{cwd:spec.cwd,env:spec.env,detached:true,stdio:['ignore','inherit','inherit']});pid=child.pid;child.once('exit',(code,signal)=>exitResolve({code,signal}));child.once('error',()=>exitResolve({error:true}));}
  catch{await onFatal('CHILD_CREATION_UNKNOWN');return{fatal:true,cleanupUnknown:true};}
  // SIGTERM can arrive while creating the child; never let that child run unowned.
  if(stopping&&pid)stop();
  try{if(pid)await onSpawn(pid);}catch{if(!stopping)await onFatal('CHILD_IDENTITY_UNKNOWN');return{get stopped(){return stopping;},fatal:!stopping};}
  const result=await exited;
  if(!stopping)await onFatal(result.error?'CHILD_START_FAILED':'CHILD_EXIT_UNEXPECTED');
  return{get stopped(){return stopping;},fatal:!stopping};
 }finally{try{if(pid)await drain(pid);}finally{signals.off('SIGTERM',stop);signals.off('SIGINT',stop);}}
}
async function exists(path){try{await lstat(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function health(value){const tmp='/runstate/health.'+randomUUID()+'.tmp',fd=await open(tmp,'wx',0o600);try{await fd.writeFile(JSON.stringify(value)+'\n');await fd.sync();}finally{await fd.close();}await rename(tmp,'/runstate/health.private.json');const d=await open('/runstate','r');try{await d.sync();}finally{await d.close();}}
async function hold(){await new Promise(resolve=>{process.once('SIGTERM',resolve);process.once('SIGINT',resolve);});}
export async function main(component){
 const stat=await lstat('/runstate');need(stat.isDirectory()&&!stat.isSymbolicLink()&&stat.uid===986&&stat.gid===978&&(stat.mode&0o777)===0o700,'SUPERVISION_STATE_MODE');
 const cfg=await loadConfig(component),identity={version:1,component,database:cfg.database,schema:cfg.schema,generation:cfg.generation,projectionDigest:cfg.projectionDigest,configSha256:process.env.ENVIO_DOCKER_CONFIG_SHA256};
 if(await exists('/runstate/identity.private.json'))need(JSON.stringify(JSON.parse(await readFile('/runstate/identity.private.json','utf8')))===JSON.stringify(identity),'SUPERVISION_IDENTITY_CHANGED');else await durable('/runstate/identity.private.json',identity);
 if(await exists('/runstate/fatal.private.json')){await health({...identity,status:'FATAL_LATCHED',at:Date.now()});console.error('ENVIO_SOURCE_FATAL_LATCH_REQUIRES_ROOT_REVIEW');await hold();return;}
 const input=await exportInputs(cfg),env={HOME:'/tmp',PATH:'/usr/bin:/bin',NODE_ENV:'production'};
 if(component==='engine')Object.assign(env,engineEnvironment(await readFile(cfg.engineEnvironment.path,'utf8')));
 else Object.assign(env,{NODE_OPTIONS:'--max-old-space-size=192',[input.profile.databaseUrlEnv]:input.credential.databaseUrl,[input.profile.tokenEnv]:input.token});
 if(component==='engine'){
  // The exact existing systemd ExecStartPre, followed by the exact existing engine launcher.
  await new Promise((resolve,reject)=>{const c=spawn('/usr/bin/sha256sum',['--check','--status',ROOT+'/secrets/envio-sdk-runtime.sha256'],{env,stdio:'ignore'});c.once('error',reject);c.once('exit',code=>code===0?resolve():reject(Error('SDK_CHECKSUM_FAILED')));});
 }
 let timer,fatalRaised=false;
 const fatal=async code=>{fatalRaised=true;clearInterval(timer);if(!await exists('/runstate/fatal.private.json'))await durable('/runstate/fatal.private.json',{...identity,status:'FATAL_SOURCE_RUNTIME_REVIEW',code,at:new Date().toISOString(),automaticRetry:false,financialAction:false});await health({...identity,status:'FATAL_LATCHED',at:Date.now()});};
 const result=await superviseChild({...commandFor(component),env},{onSpawn:async pid=>{const proc=await processIdentity(pid);need(proc.group===pid,'CHILD_GROUP');const write=()=>health({...identity,status:'CHILD_RUNNING',pid,start:proc.start,at:Date.now()});await write();let writing=false;timer=setInterval(()=>{if(writing)return;writing=true;write().catch(async()=>{try{await fatal('HEALTH_STATE_FAILED');}finally{process.kill(process.pid,'SIGTERM');}}).catch(()=>{}).finally(()=>{writing=false;});},5000);},onFatal:fatal});
 clearInterval(timer);
 if(result.stopped&&(!fatalRaised||await exists('/runstate/fatal.private.json'))){await health({...identity,status:'STOPPED',at:Date.now()});return;}
 // Remain unhealthy rather than allowing restart-unless-stopped to make an epoch/error storm.
 await hold();
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main(process.argv[2]).catch(async()=>{console.error('ENVIO_SOURCE_STARTUP_REFUSED_ROOT_REVIEW');try{if(!await exists('/runstate/fatal.private.json'))await durable('/runstate/fatal.private.json',{status:'STARTUP_REFUSED',financialAction:false,automaticRetry:false,at:new Date().toISOString()});}catch{}await hold();});
