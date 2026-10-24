import {readFile} from 'node:fs/promises';
import {posix,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseEnv} from 'node:util';
import {connect} from '../src/db.ts';
import {PrivateData} from '../src/private-data.ts';
import {ingestSnapshot} from '../src/observer.ts';
import {verifyLinuxOperatorProfile} from '../src/linux-testnet-profile.ts';
import {ChefAdapter,parseChefStatus,readJson,safeEndpoint} from '../src/integrations/observation/chef.ts';
import {localChefCanonical} from '../src/integrations/observation/chef-canonical-local.ts';
import {ChefWalletBridge,localChefDecoder,type OpeningCapitalExclusion} from '../src/integrations/observation/chef-wallet-bridge.ts';
import {chefFinancialCheckHeights} from '../src/integrations/observation/chef-live.ts';
import {appendChefRecoveryProof,chefRecoveryCoverageStatus,chefRecoverySnapshot,extendChefRecoveryTarget,nextChefRecoveryRange,validateChefRecoveryJournal,withChefRecoveryJournal,type ChefRecoveryIdentity,type ChefRecoveryJournal} from '../src/integrations/observation/chef-recovery.ts';
import {requireThat,stable,type Policy} from '../src/integrations/observation/types.ts';

export function parseChefRecoveryArgs(args:string[]){
 const seen=new Set<string>(),values:Record<string,string>={};
 for(let i=0;i<args.length;i++){const flag=args[i]!;requireThat(['--config','--step','--max-chunks'].includes(flag)&&!seen.has(flag),'CHEF_RECOVERY_CLI');seen.add(flag);const value=args[++i];requireThat(value&&!value.startsWith('--'),'CHEF_RECOVERY_CLI');values[flag]=value;}
 requireThat(values['--config']&&posix.isAbsolute(values['--config'])&&['recover','publish'].includes(values['--step']??''),'CHEF_RECOVERY_CLI');
 const count=values['--max-chunks']??'1';requireThat(/^(?:[1-9]|1[0-9]|20)$/.test(count),'CHEF_RECOVERY_CLI');
 requireThat(values['--step']!=='publish'||!seen.has('--max-chunks'),'CHEF_RECOVERY_CLI');
 return {path:values['--config']!,step:values['--step']!,maxChunks:Number(count)};
}
export async function loadLinuxChefRuntime(path:string){
 requireThat(process.platform==='linux'&&path==='/opt/zeeswap-testnet/secrets/chef-runtime.private.json','CHEF_LINUX_EXACT_CONFIG');
 const c=JSON.parse(await readFile(path,'utf8'));
 requireThat(c.operatorProfilePath==='/opt/zeeswap-testnet/secrets/linux-operator-profile.private.json','CHEF_LINUX_PROFILE');
 const verified=await verifyLinuxOperatorProfile(c.operatorProfilePath),{profile}=verified;
 requireThat(profile.configPins?.chefRuntime?.path===path,'CHEF_LINUX_PIN_REQUIRED');
 requireThat(c.project==='zeeswap_shadow_app_20261023'&&c.birthday===profile.identity.birthday,'CHEF_LINUX_ACCOUNT_SCOPE');
 const under=(p:unknown,root:string)=>typeof p==='string'&&posix.isAbsolute(p)&&posix.normalize(p)===p&&p.startsWith(root+'/');
 for(const p of [c.chefEnvPath,c.decoderConfigPath])requireThat(under(p,profile.roots.secrets),'CHEF_LINUX_SECRET_PATH');
 requireThat(profile.configPins?.chefEnv?.path===c.chefEnvPath&&profile.configPins?.chefDecoder?.path===c.decoderConfigPath,'CHEF_LINUX_CONFIG_PINS_REQUIRED');
 for(const p of [c.receiptScript,c.headerScript])requireThat(under(p,profile.roots.release+'/app/workers/zcash-wallet'),'CHEF_LINUX_SCRIPT_PATH');
 requireThat(c.pythonPath===profile.roots.base+'/tools/python/bin/python'&&c.recoveryDirectory===profile.roots.state+'/chef-recovery','CHEF_LINUX_RUNTIME_PATH');
 const env=parseEnv(await readFile(c.chefEnvPath,'utf8'));
 requireThat(env.CHEF_API_TOKEN&&env.ZEESWAP_CHEF_PROJECT===c.project&&env.ZEESWAP_CHEF_BIRTHDAY===String(c.birthday)&&env.ZEESWAP_CHEF_KEY_FINGERPRINT===profile.identity.sourceFingerprint,'CHEF_LINUX_ENV_IDENTITY');
 const decoder=JSON.parse(await readFile(c.decoderConfigPath,'utf8'));
 requireThat(decoder.canonicalSourceId===c.canonicalSourceId&&decoder.lightwalletd==='testnet.zec.rocks:443'&&decoder.ufvkFile===profile.paths.operatorUfvk&&under(decoder.protoDir,profile.roots.release),'CHEF_LINUX_DECODER');
 // Compare command arrays directly; no shell string or WSL transport is allowed.
 requireThat(Array.isArray(decoder.readCommand)&&stable(decoder.readCommand)===stable([profile.artifacts.reader.path]),'CHEF_LINUX_READER');
 const policy:Policy={adapter:'zeer-chef',network:'zcash-testnet',birthday:c.birthday,registryDigest:c.registryDigest,projectionDigest:c.projectionDigest,
  canonicalSourceId:c.canonicalSourceId,accountFingerprint:profile.identity.sourceFingerprint,maxBlocks:1000,maxObservations:1000};
 const capital=JSON.parse(await readFile(profile.immutable.chefOpeningProof.path,'utf8')),note=capital.capitalNotes?.[0],output=capital.snapshot?.outputs?.[0];
 requireThat(capital.version===1&&capital.capitalNotes?.length===1&&capital.snapshot?.outputs?.length===1&&note.pool==='ironwood'&&note.txid===capital.fundingTxid&&note.value==='12500000'
  &&output.txid===note.txid&&output.index===note.index&&output.pool===note.pool&&output.amount===note.value&&output.shieldedSource===true&&output.height===note.height&&output.blockHash===note.blockHash,'CHEF_LINUX_OPENING_PROOF');
 const openingCapital:OpeningCapitalExclusion={txid:note.txid,pool:note.pool,index:note.index,amount:note.value,receiver:output.receiver,height:note.height,blockHash:note.blockHash,proofDigest:profile.immutable.chefOpeningProof.sha256};
 return {...verified,c,env,policy,openingCapital};
}

/** Root-only prefunding recovery. This never starts a service or changes controls.
 * Historical private chunks never publish timestamps to application SQL. */
export async function runLinuxChefRecovery(options:ReturnType<typeof parseChefRecoveryArgs>){
 const {c,env,policy,openingCapital,runtime}=await loadLinuxChefRuntime(options.path),pool=connect(runtime.workerUrl,1);
 const readCurrent=async()=>{const signal=AbortSignal.timeout(15000),url=safeEndpoint(c.sourceUrl),response=await fetch(new URL('/status',url),{headers:{authorization:`Bearer ${env.CHEF_API_TOKEN}`},signal,redirect:'error'});
  requireThat(response.ok,'CHEF_HTTP_ERROR');return parseChefStatus(await readJson(response,signal),c.project,Date.now());};
 async function paused(){
  const row=(await pool.query(`SELECT current_database() AS database,current_user AS role,accepting_orders,dispatch_enabled,reconciliation_required,epoch::text FROM zee.runtime_control WHERE singleton`)).rows[0];
  requireThat(row?.database==='zee_app_20261023'&&row.role==='zee_app_worker_20261023'&&row.accepting_orders===false&&row.dispatch_enabled===false&&row.reconciliation_required===true&&row.epoch==='0','CHEF_RECOVERY_REQUIRES_PAUSED_PREFUNDING');
  const counts=(await pool.query(`SELECT (SELECT count(*) FROM zee.quotes)::text quotes,(SELECT count(*) FROM zee.orders)::text orders,(SELECT count(*) FROM zee.deposits)::text deposits,(SELECT count(*) FROM zee.operations)::text operations`)).rows[0];
  requireThat(Object.values(counts).every(value=>value==='0'),'CHEF_RECOVERY_REQUIRES_EMPTY_CUSTOMER_BOOKS');
 }
 try{await paused();return await withChefRecoveryJournal(c.recoveryDirectory,async io=>{
  const source=await readCurrent(),identity:ChefRecoveryIdentity={project:c.project,generation:source.generation,policy};
  const plain=localChefCanonical(c.pythonPath,[c.headerScript,'--config',c.decoderConfigPath],c.canonicalSourceId);
  const target=await plain.header(source.checkpoint.height,AbortSignal.timeout(15000));requireThat(target.hash===source.checkpoint.hash,'CANONICAL_CHECKPOINT_MISMATCH');
  let journal:ChefRecoveryJournal=(await io.read())??{version:1,identity,target,proofs:[]};
  requireThat(target.height>=journal.target.height,'CHEF_RECOVERY_SOURCE_REGRESSION');
  const oldTarget=await plain.header(journal.target.height,AbortSignal.timeout(15000));validateChefRecoveryJournal(journal,identity,oldTarget);
  if(!nextChefRecoveryRange(journal)&&target.height>journal.target.height){journal=extendChefRecoveryTarget(journal,identity,oldTarget,target);await io.write(journal);}
  if(options.step==='recover'){
   for(let n=0;n<options.maxChunks;n++){
    const range=nextChefRecoveryRange(journal);if(!range)break;await paused();
    const bridge=new ChefWalletBridge(localChefDecoder(c.pythonPath,[c.receiptScript,'--config',c.decoderConfigPath]),openingCapital);
    const canonical=localChefCanonical(c.pythonPath,[c.headerScript,'--config',c.decoderConfigPath],c.canonicalSourceId,range);
    const result=await new ChefAdapter({url:c.sourceUrl,token:env.CHEF_API_TOKEN!,project:c.project,policy,canonical,classify:bridge.classify}).traverse(range.fromHeight,range.throughHeight);
    if(result.status!=='READY_SHADOW')return {status:result.status,admissionReady:false};
    const checkedTarget=await plain.header(journal.target.height,AbortSignal.timeout(15000));
    journal=appendChefRecoveryProof(journal,identity,checkedTarget,result.batch,bridge.snapshot(result.batch,policy));await io.write(journal);
   }
   return chefRecoveryCoverageStatus(journal);
  }
  const checks=await chefFinancialCheckHeights(pool);
  const snapshot=await chefRecoverySnapshot(journal,identity,plain,checks,async()=>{const status=await readCurrent();return {generation:status.generation,checkpoint:{height:status.checkpoint.height,hash:status.checkpoint.hash}};},AbortSignal.timeout(30000));
  requireThat(snapshot.outputs.length===0,'CHEF_RECOVERY_UNEXPECTED_CUSTOMER_OUTPUT_REVIEW');await paused();
  const keys=new PrivateData(Buffer.from(runtime.payloadKeyHex,'hex'),Buffer.from(runtime.lookupKeyHex,'hex'));
  const result=await ingestSnapshot(pool,keys,snapshot);
  return {status:'CHEF_RECOVERY_CHECKPOINT_PUBLISHED_AWAITING_LIVE_WINDOW',...result,publishedHeaders:snapshot.blocks.length,coveredThrough:snapshot.scannedHeight,admissionReady:false};
 });}finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log(JSON.stringify({event:'chef-prefunding-recovery',...await runLinuxChefRecovery(parseChefRecoveryArgs(process.argv.slice(2)))}));}
 catch(error){const code=(error as {code?:unknown}).code;console.error(JSON.stringify({event:'chef-prefunding-recovery',status:'BLOCKED',code:typeof code==='string'?code:'CHEF_RECOVERY_FAILED',admissionReady:false}));process.exitCode=1;}
}
