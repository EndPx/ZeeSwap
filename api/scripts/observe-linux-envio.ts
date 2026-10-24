/** Native Linux consumer only. Contains no signer or dispatch adapter. */
import {readFile,open,rename,lstat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {loadLinuxEnvioProfile,readLinuxEnvioPin,requireLinuxEnvioBootstrap} from '../src/linux-envio-profile.ts';
import {connect} from '../src/db.ts';
import {PrivateData} from '../src/private-data.ts';
import {BaseContract} from '../src/base-contract.ts';
import {observeEnvioOnce,type EnvioAdmissionState} from '../src/integrations/observation/envio-live.ts';
import {canonicalRpc} from '../src/integrations/observation/canonical-rpc.ts';
import {requireThat} from '../src/integrations/observation/types.ts';
const [path,flag]=process.argv.slice(2);
requireThat(path&&process.argv.length<=4&&(!flag||['--once','--initialize-empty-consumer'].includes(flag)),'LINUX_ENVIO_EXPLICIT_COMMAND');
const {profile:p,runtime,registry,source,token}=await loadLinuxEnvioProfile(path);
const keys=new PrivateData(Buffer.from(runtime.payloadKeyHex,'hex'),Buffer.from(runtime.lookupKeyHex,'hex'));
const context='envio-funding-hints:br-broad-pine-ao79wemx:zee_app_20261023:v1';
const pool=connect(runtime.workerUrl,2),lease=await pool.connect();
try{
 const identity=(await lease.query('SELECT current_database() AS db,current_user AS role,pg_try_advisory_lock(84532,20261024) AS locked')).rows[0];
 requireThat(identity.db==='zee_app_20261023'&&identity.role==='zee_app_worker_20261023'&&identity.locked===true,'LINUX_ENVIO_SINGLE_CONSUMER_REQUIRED');
 if(flag==='--initialize-empty-consumer'){
  const proofStat=await lstat(p.relocationProof.path);requireThat(proofStat.uid===0,'LINUX_ENVIO_ROOT_HANDOFF_PROOF_REQUIRED');
  const proof=JSON.parse((await readLinuxEnvioPin(p.relocationProof)).toString());
  await lease.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try{
   const control=(await lease.query('SELECT accepting_orders,dispatch_enabled,reconciliation_required,epoch::text FROM zee.runtime_control WHERE singleton')).rows[0];
   const counts=(await lease.query(`SELECT (SELECT count(*)::text FROM zee.quotes) quotes,(SELECT count(*)::text FROM zee.orders) orders,(SELECT count(*)::text FROM zee.deposits) deposits,(SELECT count(*)::text FROM zee.obligations) obligations,(SELECT count(*)::text FROM zee.operations) operations`)).rows[0];
   requireLinuxEnvioBootstrap(proof,p.operatorProfile.sha256,control,counts);
   // Both files are exclusive. Any partial initialization requires operator review;
   // ordinary restart never repairs, deletes or replaces either one.
   const receipt=await open(p.bootstrapReceiptPath,'wx',0o600);
   try{await receipt.writeFile(JSON.stringify({version:1,purpose:'explicit-empty-prefunding-linux-consumer',at:new Date().toISOString(),handoffSha256:p.relocationProof.sha256,oldAdmissionArchives:p.oldAdmissionArchives,producerBirthday:source.policy.birthday,producerGeneration:source.generation,projectionDigest:source.policy.projectionDigest,sqlMutation:false})+'\n');await receipt.sync();}finally{await receipt.close();}
   const journal=await open(p.admissionPath,'wx',0o600);
   try{await journal.writeFile(keys.seal({version:2,hints:[]},context));await journal.sync();}finally{await journal.close();}
   await lease.query('COMMIT');console.log(JSON.stringify({status:'LINUX_ENVIO_EMPTY_CONSUMER_INITIALIZED',sqlMutation:false,financialAction:false}));
  }catch(e){await lease.query('ROLLBACK');throw e;}
 }else{
  const receipt=JSON.parse(await readFile(p.bootstrapReceiptPath,'utf8'));
  requireThat(receipt.purpose==='explicit-empty-prefunding-linux-consumer'&&receipt.handoffSha256===p.relocationProof.sha256&&receipt.projectionDigest===source.policy.projectionDigest&&receipt.producerGeneration===source.generation,'LINUX_ENVIO_BOOTSTRAP_RECEIPT_REQUIRED');
  const hints={async load():Promise<EnvioAdmissionState>{
   const s=await lstat(p.admissionPath);requireThat(s.isFile()&&!s.isSymbolicLink()&&(s.mode&0o077)===0,'LINUX_ENVIO_JOURNAL_PRIVATE_REQUIRED');
   const state=keys.open(await readFile(p.admissionPath),context) as EnvioAdmissionState;
   requireThat(state.version===2&&Array.isArray(state.hints)&&state.hints.length<=500,'INVALID_HINT_JOURNAL');
   for(const h of state.hints)requireThat(typeof h.orderId==='string'&&/^0x[0-9a-f]{64}$/.test(h.txHash)&&Number.isSafeInteger(h.height),'INVALID_HINT_JOURNAL');
   if(state.checkpoint)requireThat(Number.isSafeInteger(state.checkpoint.height)&&/^0x[0-9a-f]{64}$/.test(state.checkpoint.hash)&&state.checkpoint.generation===source.generation&&state.checkpoint.projectionDigest===source.policy.projectionDigest,'INVALID_HINT_JOURNAL');return state;
  },async save(state:EnvioAdmissionState){const tmp=p.admissionPath+'.'+randomUUID()+'.tmp',fd=await open(tmp,'wx',0o600);try{await fd.writeFile(keys.seal(state,context));await fd.sync();}finally{await fd.close();}await rename(tmp,p.admissionPath);}};
  await hints.load();const base=new BaseContract(registry),stop=new AbortController();
  lease.on('error',()=>stop.abort());process.once('SIGTERM',()=>stop.abort());process.once('SIGINT',()=>stop.abort());
  do{
   requireThat(!stop.signal.aborted,'LINUX_ENVIO_LEASE_LOST');await lease.query('SELECT 1');
   try{
    const status=await fetch(p.sourceUrl+'/zee-observation/status',{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000),redirect:'error'});
    requireThat(status.ok,'WAIT_ENVIO_EXPORT');const body=await status.json() as {protocol?:string;checkpoint?:{generation?:string}};
    requireThat(body.protocol==='zee-envio-status-v1'&&body.checkpoint?.generation===source.generation,'ENVIO_ADMISSION_GENERATION_CHANGED');
    const result=await observeEnvioOnce(pool,keys,base,{url:p.sourceUrl,token,policy:source.policy,hints,canonical:canonicalRpc({url:p.canonicalRpcUrl,sourceId:source.policy.canonicalSourceId,network:'eip155:84532',headerBatchSize:10,maxMethodsPerSecond:12})});console.log(JSON.stringify({event:'linux-envio-observation',...result}));}
   catch(e){const code=(e as {code?:string}).code??'LINUX_ENVIO_OBSERVATION_FAILED';console.log(JSON.stringify({event:'linux-envio-observation',status:'WAIT_SOURCE',code,financialAction:false}));if(flag==='--once'||['ENVIO_ADMISSION_GAP','ENVIO_ADMISSION_JOURNAL_REQUIRED','ENVIO_ADMISSION_GENERATION_CHANGED','ENVIO_ADMISSION_REORG_BLOCK','INVALID_HINT_JOURNAL'].includes(code))throw e;}
   if(flag!=='--once')await delay(5000,undefined,{signal:stop.signal}).catch(()=>{});
  }while(flag!=='--once'&&!stop.signal.aborted);
 }
}finally{await lease.query('SELECT pg_advisory_unlock(84532,20261024)').catch(()=>{});lease.release();await pool.end();}
