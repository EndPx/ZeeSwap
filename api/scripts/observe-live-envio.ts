import {readFile,mkdir,open,rename} from 'node:fs/promises';
import {dirname,isAbsolute,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {connect} from '../src/db.ts';
import {PrivateData} from '../src/private-data.ts';
import {BaseContract,type BaseRegistry} from '../src/base-contract.ts';
import {observeEnvioOnce,type FundingHint,type EnvioAdmissionState} from '../src/integrations/observation/envio-live.ts';
import {canonicalRpc} from '../src/integrations/observation/canonical-rpc.ts';
import {digest,requireThat,type Policy} from '../src/integrations/observation/types.ts';

export async function runLiveEnvio(path:string,once:boolean){
 requireThat(isAbsolute(path),'EXPLICIT_PRIVATE_ENVIO_CONFIG_REQUIRED');
 const c=JSON.parse(await readFile(path,'utf8')) as {mode:string;runtimePath:string;runtimeDigest:string;exportConfigPath:string;tokenPath:string;hintPath:string;registryPath:string;sourceUrl:string;pollSeconds:number;canonicalRpcUrl?:string};
 requireThat(c.mode==='LIVE_TESTNET_ENVIO'&&c.pollSeconds===5,'WRONG_LIVE_ENVIO_SCOPE');
 for(const p of [c.runtimePath,c.exportConfigPath,c.tokenPath,c.hintPath,c.registryPath])requireThat(isAbsolute(p),'ABSOLUTE_PRIVATE_PATH_REQUIRED');
 requireThat(c.hintPath.replaceAll('\\','/').includes('/.deploy-local/envio-live-testnet/'),'PRIVATE_FUNDING_HINT_PATH_REQUIRED');
 const raw=await readFile(c.runtimePath,'utf8');requireThat(digest(raw)===c.runtimeDigest,'LIVE_RUNTIME_CHANGED');
 const runtime=JSON.parse(raw);
 requireThat(runtime.projectId==='raspy-truth-63998651'&&runtime.branchId==='br-broad-pine-ao79wemx'&&runtime.database==='zee_app_20261023','WRONG_LIVE_APPLICATION_DATABASE');
 const target=new URL(runtime.workerUrl);requireThat(target.hostname===runtime.host&&target.pathname==='/zee_app_20261023'&&decodeURIComponent(target.username)==='zee_app_worker_20261023','WRONG_LIVE_WORKER_TARGET');
 const source=JSON.parse(await readFile(c.exportConfigPath,'utf8')) as {schema:string;policy:Policy};
 requireThat(source.schema==='envio_live_final','WRONG_LIVE_ENVIO_SCHEMA');
 const token=(await readFile(c.tokenPath,'utf8')).trim();requireThat(token.length>=32,'AUTH_REQUIRED');
 const keys=new PrivateData(Buffer.from(runtime.payloadKeyHex,'hex'),Buffer.from(runtime.lookupKeyHex,'hex'));
 const context='envio-funding-hints:br-broad-pine-ao79wemx:zee_app_20261023:v1';
 const hints={async load():Promise<EnvioAdmissionState>{
  try{const value=keys.open(await readFile(c.hintPath),context) as {version:number;hints:FundingHint[];checkpoint?:EnvioAdmissionState['checkpoint']};
   requireThat([1,2].includes(value.version)&&Array.isArray(value.hints)&&value.hints.length<=500,'INVALID_HINT_JOURNAL');
   for(const hint of value.hints)requireThat(typeof hint.orderId==='string'&&/^0x[0-9a-f]{64}$/.test(hint.txHash)&&Number.isSafeInteger(hint.height),'INVALID_HINT_JOURNAL');
   if(value.checkpoint)requireThat(Number.isSafeInteger(value.checkpoint.height)&&/^0x[0-9a-f]{64}$/.test(value.checkpoint.hash)&&typeof value.checkpoint.generation==='string'&&/^[0-9a-f]{64}$/.test(value.checkpoint.projectionDigest),'INVALID_HINT_JOURNAL');
   return{version:2,hints:value.hints,...(value.checkpoint?{checkpoint:value.checkpoint}:{})};
  }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return{version:2,hints:[]};throw error;}
 },async save(state:EnvioAdmissionState){
  await mkdir(dirname(c.hintPath),{recursive:true});const tmp=`${c.hintPath}.${randomUUID()}.tmp`;
  const file=await open(tmp,'wx',0o600);try{await file.writeFile(keys.seal(state,context));await file.sync();}finally{await file.close();}
  await rename(tmp,c.hintPath);
 }};
 const registry=JSON.parse(await readFile(c.registryPath,'utf8')) as BaseRegistry;requireThat(registry.chainId===84532,'WRONG_BASE_NETWORK');
 const pool=connect(runtime.workerUrl,1),base=new BaseContract(registry),stop=new AbortController();
 process.once('SIGINT',()=>stop.abort());process.once('SIGTERM',()=>stop.abort());
 try{do{
  const identity=(await pool.query('SELECT current_database() AS database,current_user AS role')).rows[0];
  requireThat(identity.database==='zee_app_20261023'&&identity.role==='zee_app_worker_20261023','WRONG_CONNECTED_LIVE_DATABASE');
  const started=Date.now();let methods=0;const statuses:number[]=[];const meteredFetch:typeof fetch=async(url,init)=>{const body=JSON.parse(String(init?.body));methods+=Array.isArray(body)?body.length:1;const response=await fetch(url,init);statuses.push(response.status);return response;};
  try{const result=await observeEnvioOnce(pool,keys,base,{url:c.sourceUrl,token,policy:source.policy,hints,
   canonical:canonicalRpc({url:c.canonicalRpcUrl??'https://base-sepolia-rpc.publicnode.com',sourceId:source.policy.canonicalSourceId,network:'eip155:84532',headerBatchSize:10,maxMethodsPerSecond:12,fetch:meteredFetch})});console.log(JSON.stringify({event:'envio-live-observation',...result,canonicalRpcMethods:methods,cycleElapsedMs:Date.now()-started}));}
  catch(error){const code=(error as {code?:string}).code??'LIVE_ENVIO_OBSERVATION_FAILED';console.log(JSON.stringify({event:'envio-live-observation',status:'WAIT_SOURCE',code,dispatchAuthority:false,canonicalRpcMethods:methods,cycleElapsedMs:Date.now()-started,httpStatuses:statuses}));if(once||['ENVIO_ADMISSION_GAP','ENVIO_ADMISSION_JOURNAL_REQUIRED','ENVIO_ADMISSION_GENERATION_CHANGED','ENVIO_ADMISSION_REORG_BLOCK','INVALID_HINT_JOURNAL'].includes(code))throw error;}
  if(!once&&!stop.signal.aborted)await delay(c.pollSeconds*1000,undefined,{signal:stop.signal}).catch(()=>{});
 }while(!once&&!stop.signal.aborted);}finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{requireThat(process.argv[2],'EXPLICIT_PRIVATE_ENVIO_CONFIG_REQUIRED');await runLiveEnvio(process.argv[2],process.argv.includes('--once'));}
 catch(error){console.error(JSON.stringify({event:'envio-live-observation',status:'BLOCKED',code:(error as {code?:string}).code??'LIVE_ENVIO_OBSERVATION_FAILED'}));process.exitCode=1;}
}
