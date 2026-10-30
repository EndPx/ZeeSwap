import {loadOriginalChefPersistedReader} from '../src/chef-original-persisted-reader.ts';
import {verifyChefPersistedRanges,type ChefPersistedRangeReader} from '../src/chef-persisted-range-reader.ts';
import {serviceNativeDenseCanonical} from '../src/testnet-service-source-compat.ts';
import type {CanonicalReader} from '../src/integrations/observation/chef.ts';
import type {Header} from '../src/integrations/observation/types.ts';
import {requireNoAppMetadataRepair} from '../src/app-chef-metadata-repair.ts';
import {readFile,open,rename,lstat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {loadLinuxChefRuntime} from './recover-linux-chef.ts';
import {connect} from '../src/db.ts';
import {PrivateData} from '../src/private-data.ts';
import {ingestSnapshot} from '../src/observer.ts';
import {isObserverWait} from '../src/observer-frontiers.ts';
import {ChefCanonicalHeadChanged,SourceCheckpointMismatch,ChefAdapter,parseChefStatus,readJson,safeEndpoint} from '../src/integrations/observation/chef.ts';
import {localChefCanonical} from '../src/integrations/observation/chef-canonical-local.ts';
import {ChefWalletBridge,localChefDecoder} from '../src/integrations/observation/chef-wallet-bridge.ts';
import {chefFinancialCheckHeights,readChefPersistedState,chefHeadChangeCanWait,chefSourceRecheck,chefSiblingWaitProof,chefRecentWaitProof,chefDiagnosticCode,chefFailureMetadata,chefObserverExitStatus,reconcileChefObserverFailure,diagnoseSourceCheckpointMismatch,chefCheckpointSourceUnchanged} from '../src/integrations/observation/chef-live.ts';
import {withChefRecoveryJournal,validateChefRecoveryJournal,nextChefRecoveryRange,type ChefRecoveryIdentity} from '../src/integrations/observation/chef-recovery.ts';
import {chefLiveFrom,commitChefLiveCycle,type ChefLiveCursor} from '../src/integrations/observation/chef-live-cursor.ts';
import {persistChefReceiptEvidence} from '../src/integrations/observation/chef-receipt-evidence.ts';
import {digest,requireThat,stable,parseHeader} from '../src/integrations/observation/types.ts';

export async function requireChefRecoveryMarkersClear(directory:string){await requireNoAppMetadataRepair(directory+'/app-metadata-repair-in-progress');await requireNoAppMetadataRepair(directory+'/linked-recovery-in-progress');}
/** Used only for a prepublication safe-wait diagnostic; failure never publishes. */
export function ordinaryChefCanonicalRecheck(factory:(range?:{fromHeight:number;throughHeight:number})=>CanonicalReader,sourceId:string,persisted?:ChefPersistedRangeReader){
 let cache=new Map<number,Header>();
 return{sample:(signal:AbortSignal)=>factory().sample(signal),recentPrefix:persisted?async(from:number,through:number,expectedCheckpointHash:string,signal:AbortSignal)=>{
  requireThat(Number.isSafeInteger(from)&&Number.isSafeInteger(through)&&through>=from&&through-from<1000,'CHEF_RECENT_PREFIX_BOUND');let initial=true;
  const checked:ChefPersistedRangeReader=async(start,end,s)=>{const proof=await persisted(start,end,s);
   if(initial){initial=false;requireThat(start===from&&end===through&&proof.kind==='independent-persisted-range-v1'&&proof.sourceId===sourceId&&proof.fromHeight===from&&proof.throughHeight===through&&Number.isSafeInteger(proof.latestHeight)&&proof.latestHeight>=through&&proof.latestHeight<=0xffffffff&&proof.headers.length===through-from+1,'CHEF_PERSISTED_RANGE_PROOF');let previous:Header|undefined;
    for(let i=0;i<proof.headers.length;i++){const h=parseHeader(proof.headers[i],'zcash-testnet');requireThat(h.height===from+i&&(!previous||h.parentHash===previous.hash),'CHEF_PERSISTED_RANGE_FORK');previous=h;}
    // A validated range already proves a known conflict. Never let later
    // endpoint transport failure replace it with an unverified read wait.
    requireThat(proof.headers[0]!.hash===expectedCheckpointHash,'CHEF_RECENT_CHECKPOINT_HASH_CONFLICT');
   }return proof;};
  return verifyChefPersistedRanges(Array.from({length:through-from+1},(_,i)=>from+i),checked,sourceId,signal);
 }:undefined,async header(h:number,_signal:AbortSignal){const actual=cache.get(h);requireThat(actual,'CHEF_PERSISTED_CANONICAL_CACHE_REQUIRED');return actual;},async prefetchPersisted(heights:number[],signal:AbortSignal){
  cache.clear();if(persisted){cache=await verifyChefPersistedRanges(heights,persisted,sourceId,signal);return;}requireThat(heights.length>0&&heights.length<=10004&&heights.every(h=>Number.isSafeInteger(h)&&h>=0),'CHEF_PERSISTED_STATE_BOUND');
  // Retained opening/financial anchors stay fixed while the live cursor grows.
  // Tile the diagnostic under its original deadline instead of inheriting the
  // service-launch helper's two-phase total-span limit. Every tile remains dense.
  const min=Math.min(...heights),max=Math.max(...heights),wanted=new Set(heights),complete=new Map<number,Header>(),seams:number[]=[];
  for(let from=min;;){signal.throwIfAborted();const through=Math.min(max,from+9999),part=[...wanted].filter(h=>h>=from&&h<=through),verified=await serviceNativeDenseCanonical([...new Set([from,...part,through])],factory,sourceId,signal,'persisted-range');
   for(const[h,header]of verified.headers){const previous=complete.get(h);requireThat(!previous||stable(previous)===stable(header),'CHEF_PERSISTED_PHASE_OVERLAP_FORK');complete.set(h,header);}
   seams.push(through);if(through===max)break;from=through;
  }
  for(const h of seams){signal.throwIfAborted();requireThat(stable(await factory().header(h,signal))===stable(complete.get(h)),'CHEF_PERSISTED_PHASE_CHANGED');}
  signal.throwIfAborted();requireThat(heights.every(h=>complete.has(h)),'CHEF_PERSISTED_CANONICAL_CACHE_REQUIRED');cache=complete;
 }};
}
export async function runObserveLinuxChef(path:string,once:boolean){
 const {c,runtime,env,policy,openingCapital,profile,profileSha256}=await loadLinuxChefRuntime(path);requireThat([5,10].includes(c.pollSeconds),'CHEF_LINUX_POLL_INTERVAL');
 const persistedReader=await loadOriginalChefPersistedReader({profileSha256,headerScript:c.headerScript,pythonPath:c.pythonPath,decoder:profile.configPins!.chefDecoder!});
 const configIdentity=digest({c,runtime,env,policy,profile});
 await requireChefRecoveryMarkersClear(c.recoveryDirectory);
 const pool=connect(runtime.workerUrl,1),keys=new PrivateData(Buffer.from(runtime.payloadKeyHex,'hex'),Buffer.from(runtime.lookupKeyHex,'hex')),stop=new AbortController();
 process.once('SIGINT',()=>stop.abort());process.once('SIGTERM',()=>stop.abort());
 const source=async()=>{const signal=AbortSignal.timeout(15000),r=await fetch(new URL('/status',safeEndpoint(c.sourceUrl)),{headers:{authorization:`Bearer ${env.CHEF_API_TOKEN}`},signal,redirect:'error'});requireThat(r.ok,'CHEF_HTTP_ERROR');return parseChefStatus(await readJson(r,signal),c.project,Date.now());};
 const canonical=()=>localChefCanonical(c.pythonPath,[c.headerScript,'--config',c.decoderConfigPath],c.canonicalSourceId);
 let connectedScope=false,publicationAttempted=false,phase='INITIALIZE',fatalFailure:unknown;
 async function diagnostic(error:unknown,waitVerified=false){const f=await open(c.recoveryDirectory+'/observer-diagnostic-'+Date.now()+'-'+randomUUID()+'.private.json','wx',0o600);try{await f.writeFile(JSON.stringify({event:waitVerified?'CHEF_OBSERVER_SAFE_WAIT_VERIFIED':'CHEF_OBSERVER_FAILURE',recheckProof:waitVerified?{allPersistedAnchorsCanonical:!chefSiblingWaitProof(error)&&!chefRecentWaitProof(error),recentPrefixCommitment:chefRecentWaitProof(error)??null,siblingAncestry:chefSiblingWaitProof(error)??null,persistedStateUnchanged:true,sourceIdentityUnchanged:error instanceof SourceCheckpointMismatch,publicationAttempted:false}:null,at:new Date().toISOString(),phase:publicationAttempted?'AFTER_PUBLICATION':phase,publicationAttempted,code:chefDiagnosticCode(error),checkpointMismatch:error instanceof SourceCheckpointMismatch?{expectedCore:error.expectedCore,actualHeader:error.actualHeader,origin:error.origin,freshCanonicalHeader:error.freshCanonicalHeader??null,recheckFailure:error.recheckFailure instanceof Error?{name:error.recheckFailure.name,message:error.recheckFailure.message,persistedRange:(error.recheckFailure as Error&{persistedRange?:unknown}).persistedRange??null,stack:error.recheckFailure.stack}:null,freshCanonicalFailure:error.freshCanonicalFailure instanceof Error?{name:error.freshCanonicalFailure.name,message:error.freshCanonicalFailure.message}:null}:null,headChange:error instanceof ChefCanonicalHeadChanged?{expected:error.expected,actual:error.actual,phase:error.phase,recheckFailure:error.recheckFailure instanceof Error?{name:error.recheckFailure.name,message:error.recheckFailure.message,persistedRange:(error.recheckFailure as Error&{persistedRange?:unknown}).persistedRange??null,stack:error.recheckFailure.stack}:null}:null,error:error instanceof Error?{name:error.name,message:error.message,stack:error.stack}:null}));await f.sync();}finally{await f.close();}const d=await open(c.recoveryDirectory,'r');try{await d.sync();}finally{await d.close();}}
 async function connected(){const r=(await pool.query('SELECT current_database() database,current_user role')).rows[0];requireThat(r?.database==='zee_app_20261023'&&r.role==='zee_app_worker_20261023','CHEF_LINUX_CONNECTED_DATABASE');connectedScope=true;}
 const cursorPath=c.recoveryDirectory+'/live-cursor.private.json';
 async function save(cursor:ChefLiveCursor){const temp=cursorPath+'.'+randomUUID()+'.tmp',f=await open(temp,'wx',0o600);try{await f.writeFile(JSON.stringify(cursor));await f.sync();}finally{await f.close();}await rename(temp,cursorPath);const d=await open(c.recoveryDirectory,'r');try{await d.sync();}finally{await d.close();}}
 try{await connected();return await withChefRecoveryJournal(c.recoveryDirectory,async io=>{
  const initial=await source(),identity:ChefRecoveryIdentity={project:c.project,generation:initial.generation,policy},journal=await io.read();requireThat(journal,'CHEF_LINUX_RECOVERY_REQUIRED');
  const target=await canonical().header(journal.target.height,AbortSignal.timeout(15000));validateChefRecoveryJournal(journal,identity,target);requireThat(nextChefRecoveryRange(journal)===null,'CHEF_LINUX_RECOVERY_INCOMPLETE');
  let cursor:ChefLiveCursor;
  try{const s=await lstat(cursorPath);requireThat(s.isFile()&&!s.isSymbolicLink()&&(s.mode&0o077)===0,'CHEF_LINUX_PRIVATE_CURSOR');cursor=JSON.parse(await readFile(cursorPath,'utf8'));}
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
   const r=(await pool.query(`SELECT accepting_orders,dispatch_enabled,reconciliation_required,epoch::text,(SELECT count(*) FROM zee.quotes)::text quotes,(SELECT count(*) FROM zee.orders)::text orders,(SELECT count(*) FROM zee.deposits)::text deposits,(SELECT count(*) FROM zee.operations)::text operations FROM zee.runtime_control WHERE singleton`)).rows[0];
   requireThat(r&&r.accepting_orders===false&&r.dispatch_enabled===false&&r.reconciliation_required===true&&r.epoch==='0'&&['quotes','orders','deposits','operations'].every(k=>r[k]==='0'),'CHEF_LINUX_CURSOR_SEED_REQUIRES_PAUSED_PREFUNDING');
   const checkpoint=(await pool.query("SELECT scanned_height,tip_hash FROM zee.scanner_checkpoints WHERE network='zcash-testnet'")).rows[0];
   requireThat(checkpoint&&Number(checkpoint.scanned_height)===journal.target.height&&checkpoint.tip_hash===journal.target.hash,'CHEF_LINUX_RECOVERY_PUBLICATION_REQUIRED');
   cursor={version:1,identityDigest:digest(identity),processedThrough:journal.target.height,tipHash:journal.target.hash,snapshotDigest:digest(journal)};await save(cursor);
  }
  requireThat(cursor.processedThrough>=journal.target.height,'CHEF_LINUX_CURSOR_BEFORE_RECOVERY');
  do{publicationAttempted=false;phase='READ_PERSISTED';const before=await readChefPersistedState(pool),beforeCursorBytes=await readFile(cursorPath),beforeCursorDigest=digest(cursor);try{
   await connected();phase='READ_SOURCE';const status=await source();requireThat(status.generation===identity.generation,'CHEF_LIVE_GENERATION_CHANGED');
   requireThat(status.checkpoint.height>=cursor.processedThrough,'CHEF_LIVE_SOURCE_REGRESSION');requireThat(status.checkpoint.height-2>=cursor.processedThrough,'WAIT_SOURCE_UNAVAILABLE');const fromHeight=chefLiveFrom(cursor,identity,status.checkpoint.height-2),checks=await chefFinancialCheckHeights(pool),started=Date.now();
   const bridge=new ChefWalletBridge(localChefDecoder(c.pythonPath,[c.receiptScript,'--config',c.decoderConfigPath]),openingCapital),headers=localChefCanonical(c.pythonPath,[c.headerScript,'--config',c.decoderConfigPath],c.canonicalSourceId,{fromHeight,throughHeight:status.checkpoint.height});
   phase='TRAVERSE';const result=await new ChefAdapter({url:c.sourceUrl,token:env.CHEF_API_TOKEN!,project:c.project,policy,canonical:headers,classify:bridge.classify,matureTailBlocks:2}).traverse(fromHeight);
   if(result.status!=='READY_SHADOW'){console.log(JSON.stringify({event:'linux-chef-observation',status:result.status,dispatchAuthority:false}));}
   else{const remaining=30000-(Date.now()-started);requireThat(remaining>0,'READ_BUDGET');
    const full=bridge.snapshot(result.batch,policy);
    phase='VERIFY_ANCHORS';const published=await commitChefLiveCycle(cursor,identity,result.batch,full,checks,headers,async s=>{
     await persistChefReceiptEvidence(profile.roots.state+'/chef-receipts',c.project,policy.accountFingerprint!,result.batch,full);
     publicationAttempted=true;phase='AFTER_PUBLICATION';return ingestSnapshot(pool,keys,s);
    },save,AbortSignal.timeout(remaining));cursor=published.cursor;
    console.log(JSON.stringify({event:'linux-chef-observation',status:'CHEF_TESTNET_OBSERVED',...published.result as object,verifiedRangeHeaders:published.verifiedRangeHeaders,publishedHeaders:published.publishedHeaders,excludedOpeningCapital:bridge.excludedOpeningCapitalCount,dispatchAuthority:false}));}
  }catch(error){if(error instanceof SourceCheckpointMismatch&&!persistedReader)await diagnoseSourceCheckpointMismatch(error,(h,signal)=>canonical().header(h,signal),AbortSignal.timeout(15000));try{await diagnostic(error);}catch{throw error;}try{Object.defineProperty(error,'chefPhase',{value:publicationAttempted?'AFTER_PUBLICATION':phase,configurable:true});}catch{}
   const safe=await chefHeadChangeCanWait(error,publicationAttempted||error instanceof SourceCheckpointMismatch&&phase!=='TRAVERSE',before,cursor,ordinaryChefCanonicalRecheck(range=>localChefCanonical(c.pythonPath,[c.headerScript,'--config',c.decoderConfigPath],c.canonicalSourceId,range),c.canonicalSourceId,persistedReader),()=>chefSourceRecheck(async()=>{
    await connected();const loaded=await loadLinuxChefRuntime(path);
    if(persistedReader)await loadOriginalChefPersistedReader({profileSha256:loaded.profileSha256,headerScript:loaded.c.headerScript,pythonPath:loaded.c.pythonPath,decoder:loaded.profile.configPins!.chefDecoder!});
    return digest({c:loaded.c,runtime:loaded.runtime,env:loaded.env,policy:loaded.policy,profile:loaded.profile})===configIdentity&&digest(await readChefPersistedState(pool))===digest(before)&&digest(cursor)===beforeCursorDigest&&(await readFile(cursorPath)).equals(beforeCursorBytes);
   },source,latest=>{
    const currentIdentity={project:latest.project,generation:latest.generation,configIdentity},expectedIdentity={project:c.project,generation:identity.generation,configIdentity};
    return stable(currentIdentity)===stable(expectedIdentity)&&(!(error instanceof SourceCheckpointMismatch)||chefCheckpointSourceUnchanged(error,expectedIdentity,currentIdentity));
   }),AbortSignal.timeout(180000),phase,()=>diagnostic(error,true));
   const code=String((error as {code?:unknown}).code);if(safe==='DEFERRED_UNVERIFIED_READ'){console.log(JSON.stringify({event:'linux-chef-observation',status:'WAIT_UNVERIFIED_CANONICAL_READ',phase:'BEFORE_PUBLICATION',prefixVerified:false,freshnessVerified:false,publicationAttempted:false,dispatchAuthority:false}));}else if(safe==='DEFERRED_SOURCE_UNREADY'){console.log(JSON.stringify({event:'linux-chef-observation',status:'WAIT_RECHECK_SOURCE_UNREADY',phase:'BEFORE_PUBLICATION',freshnessVerified:false,publicationAttempted:false,dispatchAuthority:false}));}else if(safe===true){console.log(JSON.stringify({event:'linux-chef-observation',status:error instanceof SourceCheckpointMismatch?'WAIT_SOURCE_CHECKPOINT_ABOVE_PERSISTED':'WAIT_CANONICAL_HEAD_ABOVE_PERSISTED',phase:'BEFORE_PUBLICATION',code:chefDiagnosticCode(error),dispatchAuthority:false}));}else if(!publicationAttempted&&(isObserverWait(error)||['WAIT_SOURCE_UNAVAILABLE','WAIT_SOURCE_UNREADY','STALE_SOURCE','CHEF_LIVE_SOURCE_LAG'].includes(code)))console.log(JSON.stringify({event:'linux-chef-observation',status:'WAIT_SOURCE',dispatchAuthority:false}));else throw error;}
   if(!once&&!stop.signal.aborted)await delay(c.pollSeconds*1000,undefined,{signal:stop.signal}).catch(()=>{});
  }while(!once&&!stop.signal.aborted);
  return {status:'CHEF_LINUX_OBSERVER_STOPPED',dispatchAuthority:false};
 });}catch(error){
  if(chefObserverExitStatus(error)===78)fatalFailure=error;
  try{Object.defineProperty(error,'chefPhase',{value:publicationAttempted?'AFTER_PUBLICATION':phase,configurable:true});}catch{}
  try{await diagnostic(error);}catch{/* Diagnostic failure must not replace the original reconciliation error. */}
  const outcome=await reconcileChefObserverFailure(error,connectedScope,()=>pool.query('SELECT zee.enter_reconciliation()'));
  try{Object.defineProperty(error,'chefReconciliationOutcome',{value:outcome,configurable:true});}catch{}
  throw error;
 }finally{try{await pool.end();}catch(error){throw fatalFailure??error;}}
}
export async function chefObserverCli(args:string[],run:(path:string,once:boolean)=>Promise<unknown>=runObserveLinuxChef){
 try{const [path,...flags]=args;requireThat(path&&flags.every(f=>f==='--once')&&flags.length<=1,'CHEF_LINUX_CLI');return{exitCode:0,value:await run(path!,flags.includes('--once'))};}
 catch(error){const phase=(error as {chefPhase?:unknown})?.chefPhase,rawOutcome=(error as {chefReconciliationOutcome?:unknown})?.chefReconciliationOutcome,exitCode=chefObserverExitStatus(error);return{exitCode,value:{event:'linux-chef-observation',status:'BLOCKED_RECONCILE_PRIVATE_CURSOR',...chefFailureMetadata(error,phase==='AFTER_PUBLICATION',String(phase)),dispatchAuthority:false,exitCode,operatorReviewRequired:exitCode===78,reconciliationOutcome:['NOT_REQUESTED','ACKNOWLEDGED','UNKNOWN'].includes(String(rawOutcome))?rawOutcome:'UNRECORDED'}};}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const result=await chefObserverCli(process.argv.slice(2));(result.exitCode===0?console.log:console.error)(JSON.stringify(result.value));process.exitCode=result.exitCode;
}
