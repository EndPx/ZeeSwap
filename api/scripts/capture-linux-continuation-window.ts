import {validateContinuationApproval,readRootReplacementClosure,readRootContinuationAuthority,requireContinuationPaused,readContinuationSnapshot,validateContinuationSnapshot,continuationDigest,validateContinuationWindow,type ContinuationWindow} from '../src/native-circle-continuation.ts';
/** Root-only observation window. No SQL writes, control changes or SDK wallet calls. */
import {readFile,open} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {loadLinuxChefRuntime} from './recover-linux-chef.ts';
import {loadLinuxEnvioProfile} from '../src/linux-envio-profile.ts';
import {linuxRawSha256} from '../src/linux-testnet-profile.ts';
import {parseChefStatus,readJson,safeEndpoint} from '../src/integrations/observation/chef.ts';
import {localChefCanonical} from '../src/integrations/observation/chef-canonical-local.ts';
import {canonicalRpc} from '../src/integrations/observation/canonical-rpc.ts';
import {fetchEnvioExport} from '../src/integrations/observation/envio.ts';
import {validateSourceWindow,type WindowSample} from '../src/linux-control.ts';
import {connect} from '../src/db.ts';
const root='/opt/zeeswap-testnet';
function need(v:unknown,c:string):asserts v{if(!v)throw Error('LINUX_WINDOW_'+c);}
async function main(){
const [approvalPath,output,expiryReceiptPath]=process.argv.slice(2);need(process.platform==='linux'&&process.getuid?.()===0&&output&&[4,5].includes(process.argv.length)&&output.startsWith(root+'/state/continuation-preflight/')&&!output.slice((root+'/state/continuation-preflight/').length).includes('/'),'ROOT_EXPLICIT_NEW_WINDOW');
const chef=await loadLinuxChefRuntime(root+'/secrets/chef-runtime.private.json'),envio=await loadLinuxEnvioProfile(root+'/secrets/linux-envio-profile.private.json');
const handoffBytes=await readFile(root+'/secrets/relocation-applied-proof.private.json'),handoff=JSON.parse(handoffBytes.toString());need(handoff.profileSha256===chef.profileSha256,'CURRENT_PROFILE_HANDOFF');
const authorityBytes=await readRootContinuationAuthority(approvalPath!),authority=JSON.parse(authorityBytes.toString());validateContinuationApproval(authority);need(authority.version===2?!!expiryReceiptPath:!expiryReceiptPath,'EXACT_CLOSURE_SELECTOR');if(authority.version===2)await readRootReplacementClosure(expiryReceiptPath!,authority);const authoritySha256=linuxRawSha256(authorityBytes);
const pool=connect(chef.runtime.workerUrl,1),attempt=await open(output+'.attempt.private.jsonl','wx',0o600),samples:ContinuationWindow['samples']=[],started=Date.now();
const record=async(value:unknown)=>{await attempt.writeFile(JSON.stringify(value)+'\n');await attempt.sync();};
try{
 await record({event:'WINDOW_STARTED',at:new Date(started).toISOString(),profileSha256:chef.profileSha256,handoffSha256:linuxRawSha256(handoffBytes),sqlMutation:false});
 let binding:Parameters<typeof validateSourceWindow>[1]|undefined;
 do{
  const cycleStarted=Date.now(),signal=AbortSignal.timeout(30000),response=await fetch(new URL('/status',safeEndpoint(chef.c.sourceUrl)),{headers:{authorization:`Bearer ${chef.env.CHEF_API_TOKEN}`},signal,redirect:'error'});need(response.ok,'CHEF_SOURCE_UNAVAILABLE');const cs=parseChefStatus(await readJson(response,signal),chef.c.project,Date.now());
  const ec=canonicalRpc({url:envio.profile.canonicalRpcUrl,sourceId:envio.source.policy.canonicalSourceId,network:'eip155:84532',headerBatchSize:10,maxMethodsPerSecond:12});
  const er=await fetch(envio.profile.sourceUrl+'/zee-observation/status',{headers:{authorization:'Bearer '+envio.token},signal,redirect:'error'});need(er.ok,'ENVIO_SOURCE_UNAVAILABLE');const es=await readJson(er,signal) as any;need(es.protocol==='zee-envio-status-v1'&&es.checkpoint?.complete===true&&Number.isSafeInteger(es.checkpoint.through?.height),'ENVIO_COHERENT_CHECKPOINT');
  // Reuse the production coherent export validator, including every returned
  // range header, sampled-head and finalized-header independent comparisons.
  const batch=await fetchEnvioExport(envio.profile.sourceUrl,envio.token,es.checkpoint.through.height,envio.source.policy,ec);
  const zc=localChefCanonical(chef.c.pythonPath,[chef.c.headerScript,'--config',chef.c.decoderConfigPath],chef.c.canonicalSourceId),zh=await zc.header(cs.checkpoint.height,signal);
  need(zh.hash===cs.checkpoint.hash,'CHEF_CANONICAL_SOURCE_CONFLICT');
  const c=await pool.connect();let control:any,rows:any[],counts:any,snapshotSha256:string;
  try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const identity=(await c.query('SELECT current_database() AS database,current_user AS role')).rows[0];need(identity.database==='zee_app_20261023'&&identity.role==='zee_app_worker_20261023','CONNECTED_READ_SCOPE');control=(await c.query('SELECT accepting_orders,dispatch_enabled,reconciliation_required,epoch::text,xmin::text FROM zee.runtime_control WHERE singleton')).rows[0];requireContinuationPaused(control,authority);const snapshot=await readContinuationSnapshot(c);validateContinuationSnapshot(snapshot,authority);snapshotSha256=continuationDigest(snapshot);counts=(await c.query(`SELECT (SELECT count(*) FROM zee.quotes)::text quotes,(SELECT count(*) FROM zee.orders)::text orders,(SELECT count(*) FROM zee.deposits)::text deposits,(SELECT count(*) FROM zee.obligations)::text obligations,(SELECT count(*) FROM zee.operations)::text operations`)).rows[0];rows=(await c.query('SELECT network,scanned_height::text,finalized_height::text,tip_hash,observed_at FROM zee.scanner_checkpoints ORDER BY network')).rows;await c.query('COMMIT');}finally{await c.query('ROLLBACK').catch(()=>{});c.release();}
  const sql:WindowSample['sql']=[];for(const row of rows){const reader=row.network==='zcash-testnet'?zc:ec,h=await reader.header(Number(row.scanned_height),signal);sql.push({network:row.network,scannedHeight:row.scanned_height,finalizedHeight:row.finalized_height,tipHash:row.tip_hash,observedAt:new Date(row.observed_at).toISOString(),canonical:{sourceId:row.network==='zcash-testnet'?chef.c.canonicalSourceId:envio.source.policy.canonicalSourceId,height:h.height,hash:h.hash,checkedAt:new Date().toISOString()}});}
  const at=new Date().toISOString(),sourceIdentity={chefCanonicalSourceId:chef.c.canonicalSourceId,chefGeneration:cs.generation,chefProject:chef.c.project,chefFingerprint:chef.profile.identity.sourceFingerprint,envioCanonicalSourceId:envio.source.policy.canonicalSourceId,envioGeneration:batch.coverage.generation,envioProjectionDigest:batch.coverage.projectionDigest};
  need(continuationDigest(sourceIdentity)===continuationDigest(authority.sourceIdentity),'AUTHORIZED_SOURCE_IDENTITY');
  binding??={profileSha256:chef.profileSha256,handoffSha256:linuxRawSha256(handoffBytes),sourceIdentity};
  samples.push({at,control,counts,postRefundSnapshotSha256:snapshotSha256!,sql,chef:{generation:cs.generation,project:cs.project,fingerprint:chef.profile.identity.sourceFingerprint,sampledAt:new Date(cs.source.sourceObservedAt*1000).toISOString(),through:cs.checkpoint.height,sourceHead:cs.source.sourceObservedHeight,throughHash:cs.checkpoint.hash,canonical:{sourceId:chef.c.canonicalSourceId,height:zh.height,hash:zh.hash,checkedAt:at}},envio:{generation:batch.coverage.generation,projectionDigest:batch.coverage.projectionDigest,sampledAt:batch.coverage.sourceSampledAt,through:batch.coverage.through.height,sourceHead:batch.coverage.sourceHead.height,throughHash:batch.coverage.through.hash,canonical:{sourceId:envio.source.policy.canonicalSourceId,height:batch.coverage.through.height,hash:batch.coverage.through.hash,checkedAt:batch.coverage.canonicalCheckAt}}});
  await record({event:'SOURCE_SAMPLE',...samples.at(-1)});
  if(Date.parse(samples.at(-1)!.at)-Date.parse(samples[0]!.at)>=300000)break;
  await delay(Math.max(0,10000-(Date.now()-cycleStarted)));
 }while(samples.length<100);
 need(binding,'SOURCE_BINDING');const window:ContinuationWindow={version:authority.version,status:authority.version===2?'ROOT_UNFUNDED_REPLACEMENT_SOURCE_WINDOW_VERIFIED':'ROOT_POST_REFUND_SOURCE_WINDOW_VERIFIED',approvalSha256:authoritySha256,profileSha256:binding.profileSha256,handoffSha256:binding.handoffSha256,startedAt:new Date(started).toISOString(),completedAt:new Date().toISOString(),samplingIntervalMs:10000,maxGapMs:20000,sourceReset:false,samples};validateContinuationWindow(window,authority,authoritySha256);
 const fd=await open(output,'wx',0o600);try{await fd.writeFile(JSON.stringify(window,null,2)+'\n');await fd.sync();}finally{await fd.close();}await record({event:'WINDOW_PASSED',samples:samples.length});console.log(JSON.stringify({status:window.status,samples:samples.length,elapsedMs:Date.parse(samples.at(-1)!.at)-Date.parse(samples[0]!.at),sqlMutation:false,transactionsCreated:0}));
}catch{await record({event:'WINDOW_REFUSED',samples:samples.length});console.error(JSON.stringify({status:'LINUX_SOURCE_WINDOW_REFUSED',samples:samples.length,partialAttemptRetained:true}));process.exitCode=1;}finally{await attempt.close();await pool.end();}

}
await main().catch(error=>{console.error(JSON.stringify({status:"LINUX_SOURCE_WINDOW_REFUSED",reason:error instanceof Error&&error.message.startsWith("LINUX_WINDOW_")?error.message:"VERIFY_PRIVATE_INPUT_OR_JOURNAL"}));process.exitCode=1;});
