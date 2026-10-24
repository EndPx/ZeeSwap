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
import {ChefAdapter,parseChefStatus,readJson,safeEndpoint} from '../src/integrations/observation/chef.ts';
import {localChefCanonical} from '../src/integrations/observation/chef-canonical-local.ts';
import {ChefWalletBridge,localChefDecoder} from '../src/integrations/observation/chef-wallet-bridge.ts';
import {chefFinancialCheckHeights} from '../src/integrations/observation/chef-live.ts';
import {withChefRecoveryJournal,validateChefRecoveryJournal,nextChefRecoveryRange,type ChefRecoveryIdentity} from '../src/integrations/observation/chef-recovery.ts';
import {chefLiveFrom,commitChefLiveCycle,type ChefLiveCursor} from '../src/integrations/observation/chef-live-cursor.ts';
import {persistChefReceiptEvidence} from '../src/integrations/observation/chef-receipt-evidence.ts';
import {digest,requireThat} from '../src/integrations/observation/types.ts';

export async function runObserveLinuxChef(path:string,once:boolean){
 const {c,runtime,env,policy,openingCapital,profile}=await loadLinuxChefRuntime(path);requireThat([5,10].includes(c.pollSeconds),'CHEF_LINUX_POLL_INTERVAL');
 const pool=connect(runtime.workerUrl,1),keys=new PrivateData(Buffer.from(runtime.payloadKeyHex,'hex'),Buffer.from(runtime.lookupKeyHex,'hex')),stop=new AbortController();
 process.once('SIGINT',()=>stop.abort());process.once('SIGTERM',()=>stop.abort());
 const source=async()=>{const signal=AbortSignal.timeout(15000),r=await fetch(new URL('/status',safeEndpoint(c.sourceUrl)),{headers:{authorization:`Bearer ${env.CHEF_API_TOKEN}`},signal,redirect:'error'});requireThat(r.ok,'CHEF_HTTP_ERROR');return parseChefStatus(await readJson(r,signal),c.project,Date.now());};
 const canonical=()=>localChefCanonical(c.pythonPath,[c.headerScript,'--config',c.decoderConfigPath],c.canonicalSourceId);
 let connectedScope=false;
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
  do{try{
   await connected();const status=await source();requireThat(status.generation===identity.generation,'CHEF_LIVE_GENERATION_CHANGED');
   const fromHeight=chefLiveFrom(cursor,identity,status.checkpoint.height),checks=await chefFinancialCheckHeights(pool),started=Date.now();
   const bridge=new ChefWalletBridge(localChefDecoder(c.pythonPath,[c.receiptScript,'--config',c.decoderConfigPath]),openingCapital),headers=localChefCanonical(c.pythonPath,[c.headerScript,'--config',c.decoderConfigPath],c.canonicalSourceId,{fromHeight,throughHeight:status.checkpoint.height});
   const result=await new ChefAdapter({url:c.sourceUrl,token:env.CHEF_API_TOKEN!,project:c.project,policy,canonical:headers,classify:bridge.classify}).traverse(fromHeight);
   if(result.status!=='READY_SHADOW'){console.log(JSON.stringify({event:'linux-chef-observation',status:result.status,dispatchAuthority:false}));}
   else{const remaining=30000-(Date.now()-started);requireThat(remaining>0,'READ_BUDGET');
    const full=bridge.snapshot(result.batch,policy);
    const published=await commitChefLiveCycle(cursor,identity,result.batch,full,checks,headers,async s=>{
     await persistChefReceiptEvidence(profile.roots.state+'/chef-receipts',c.project,policy.accountFingerprint!,result.batch,full);
     return ingestSnapshot(pool,keys,s);
    },save,AbortSignal.timeout(remaining));cursor=published.cursor;
    console.log(JSON.stringify({event:'linux-chef-observation',status:'CHEF_TESTNET_OBSERVED',...published.result as object,verifiedRangeHeaders:published.verifiedRangeHeaders,publishedHeaders:published.publishedHeaders,excludedOpeningCapital:bridge.excludedOpeningCapitalCount,dispatchAuthority:false}));}
  }catch(error){const code=String((error as {code?:unknown}).code);if(isObserverWait(error)||['WAIT_SOURCE_UNAVAILABLE','WAIT_SOURCE_UNREADY','STALE_SOURCE','CHEF_LIVE_SOURCE_LAG'].includes(code))console.log(JSON.stringify({event:'linux-chef-observation',status:'WAIT_SOURCE',dispatchAuthority:false}));else throw error;}
   if(!once&&!stop.signal.aborted)await delay(c.pollSeconds*1000,undefined,{signal:stop.signal}).catch(()=>{});
  }while(!once&&!stop.signal.aborted);
  return {status:'CHEF_LINUX_OBSERVER_STOPPED',dispatchAuthority:false};
 });}catch(error){
  const code=String((error as {code?:unknown}).code);
  if(connectedScope&&['CHEF_LIVE_CURSOR_REORG','CHEF_LIVE_GENERATION_CHANGED','CHEF_RECOVERY_TARGET_REORG','CHEF_RECOVERY_OVERLAP_REORG','CHEF_LIVE_CURSOR_IDENTITY',
   'CHEF_LIVE_SOURCE_REGRESSION','CHEF_RECOVERY_IDENTITY_CHANGED','CANONICAL_CHECKPOINT_MISMATCH','HEADER_GAP_OR_FORK','CANONICAL_NOTE_MISMATCH','CANONICAL_HEAD_CHANGED'].includes(code))await pool.query('SELECT zee.enter_reconciliation()');
  throw error;
 }finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{const [path,...flags]=process.argv.slice(2);requireThat(path&&flags.every(f=>f==='--once')&&flags.length<=1,'CHEF_LINUX_CLI');console.log(JSON.stringify(await runObserveLinuxChef(path,flags.includes('--once'))));}
 catch{console.error(JSON.stringify({event:'linux-chef-observation',status:'BLOCKED_RECONCILE_PRIVATE_CURSOR',dispatchAuthority:false}));process.exitCode=1;}
}
