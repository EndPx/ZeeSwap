/** Explicit Root service entry. No authority minting, control activation or global job claims. */
import {readFile,lstat,realpath,mkdir,open} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {loadLinuxForward,linuxForwardStep} from '../src/linux-forward-dispatch.ts';
import {loadLinuxNativeDispatch,linuxNativeContexts,applyLinuxNativeFastExecution} from '../src/linux-native-dispatch.ts';
import {loadServicePolicyApi} from '../src/testnet-service-policy.ts';
import {policyWorkerTick,readPolicyMembers,POLICY_WORKER_LEASE,assertPolicyOrderProcessBinding,policyFinancialStep,type ActualCapital} from '../src/testnet-policy-worker.ts';
import {requirePolicyWorkerOrder,type PolicyWorkerOrderContext} from '../src/testnet-policy-refund.ts';
import {buildPolicyOrderCapital,verifyPolicyIdleCapital} from '../src/testnet-policy-capital-builder.ts';
import {validatePolicyCapitalProof} from '../src/testnet-policy-capital.ts';
import type {CapitalSource} from '../src/live-reverse-capital.ts';
import {connect} from '../src/db.ts';
import {PrivateData} from '../src/private-data.ts';
import {BaseContract} from '../src/base-contract.ts';
import {LocalBaseSigner} from '../src/base-signer.ts';
import {dispatchBaseOnce} from '../src/base-settlement.ts';
import {dispatchLiveReverseOnce} from '../src/live-reverse-dispatch.ts';
import {dispatchLiveRefundOnce} from '../src/live-source-refund.ts';
import {requireFreshLiveDispatchObservers,withLiveOperatorLock} from '../src/live-dispatch-scope.ts';
import {workerExecutionRoot,workerExecutionPins,requireWorkerPolicyCommit,requireForwardFastExecution,requireForwardFastSignerConfig,readPolicyExecutionEpoch,type ForwardFastExecutionApproval,type WorkerExecutionConfig} from '../src/testnet-policy-execution.ts';
type Pin={path:string;sha256:string};
type Config=WorkerExecutionConfig&{version:1;mode:'ROOT_BOUNDED_TESTNET_SERVICE_WORKER';enabled:boolean;policy:Pin;captureScript:Pin;seedSources:CapitalSource[];pollSeconds:5};
const sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
function need(v:unknown,c:string):asserts v{if(!v)throw Error(c);}
async function protectedBytes(pin:Pin){const s=await lstat(pin.path);need(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&0o077)===0&&s.size<=1048576&&await realpath(pin.path)===pin.path,'POLICY_WORKER_ROOT_FILE');const bytes=await readFile(pin.path);need(sha(bytes)===pin.sha256,'POLICY_WORKER_PIN_CHANGED');return bytes;}
async function publicPin(pin:Pin){const s=await lstat(pin.path);need(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&0o022)===0&&s.size<=2097152&&await realpath(pin.path)===pin.path&&/^[a-f0-9]{64}$/.test(pin.sha256)&&sha(await readFile(pin.path))===pin.sha256,'POLICY_WORKER_PUBLIC_CODE_CHANGED');}
async function exclusive(path:string,value:unknown){const b=Buffer.from(JSON.stringify(value)),f=await open(path,'wx',0o600);try{await f.writeFile(b);await f.sync();}finally{await f.close();}const d=await open(path.slice(0,path.lastIndexOf('/')),'r');try{await d.sync();}finally{await d.close();}return{path,sha256:sha(b)};}
/** Python owns the bounded process group and reaps it. Node never races an outer kill. */
async function physicalRead(command:string,args:string[]){return new Promise<void>((resolve,reject)=>{const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});let bytes=0,bad=false;child.stdout.on('data',(b:Buffer)=>{bytes+=b.length;if(bytes>16384)bad=true;});child.stderr.on('data',(b:Buffer)=>{bytes+=b.length;if(bytes>16384)bad=true;});child.once('error',reject);child.once('close',(code,signal)=>{if(code===0&&!signal&&!bad)resolve();else reject(Error('POLICY_WALLET_READ_WAIT'));});});}
export async function runPolicyWorker(configPath:string,configSha256:string,once:boolean){
 need(process.platform==='linux'&&Number(process.versions.node.split('.')[0])===24&&process.getuid?.()===0&&process.env.HOME==='/opt/zeeswap-testnet/home'&&configPath==='/opt/zeeswap-testnet/secrets/testnet-policy-worker.private.json','POLICY_WORKER_ROOT_SCOPE');
 const configPin={path:configPath,sha256:configSha256},c=JSON.parse((await protectedBytes(configPin)).toString()) as Config;
 need(c.version===1&&c.mode==='ROOT_BOUNDED_TESTNET_SERVICE_WORKER'&&typeof c.enabled==='boolean'&&c.pollSeconds===5&&Array.isArray(c.seedSources)&&c.seedSources.length<=12,'POLICY_WORKER_CONFIG');
 if(!c.enabled)return{status:'POLICY_WORKER_DISABLED',financialAction:false};
 const forward=await loadLinuxForward('/opt/zeeswap-testnet/secrets/forward-profile.private.json'),v=forward.verified,p=v.profile;
 const originalReverse=await loadLinuxNativeDispatch(p.roots.secrets+'/reverse-profile.private.json','reverse'),refund=await loadLinuxNativeDispatch(p.roots.secrets+'/refund-profile.private.json','refund');let reverse=originalReverse;
 need(reverse.verified.profileSha256===v.profileSha256&&refund.verified.profileSha256===v.profileSha256&&c.captureScript.path===p.roots.release+'/app/workers/zcash-wallet/testnet_policy_capital.py','POLICY_WORKER_PROFILE');await publicPin(c.captureScript);
 const executionRoot=workerExecutionRoot(await realpath(fileURLToPath(import.meta.url)),c.executionRoot);
 async function execution(){
  const manifest=JSON.parse((await protectedBytes(c.executionManifest)).toString()),pins=workerExecutionPins(manifest,executionRoot,c.publicCommit),directories=new Set<string>();
  for(const pin of pins){let directory=pin.path.slice(0,pin.path.lastIndexOf('/'));while(directory.startsWith(executionRoot)){directories.add(directory);directory=directory.slice(0,directory.lastIndexOf('/'));}}
  directories.add('/opt/zeeswap-testnet/releases');directories.add(executionRoot.slice(0,-4));
  for(const directory of directories){const s=await lstat(directory);need(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&0o022)===0&&await realpath(directory)===directory,'POLICY_WORKER_EXECUTION_DIRECTORY');}
  for(const pin of pins)await publicPin(pin);
 }
 await execution();
 const pool=connect(v.runtime.workerUrl,4),client=await pool.connect(),keys=new PrivateData(Buffer.from(v.runtime.payloadKeyHex,'hex'),Buffer.from(v.runtime.lookupKeyHex,'hex')),base=new BaseContract(v.registry);
 let lost=false,leased=false,capital:ActualCapital|undefined,capturePin:Pin|undefined;client.on('error',()=>{lost=true;});
 const stop=new AbortController();const onStop=()=>stop.abort();process.once('SIGTERM',onStop);process.once('SIGINT',onStop);
 try{
  const who=(await client.query('SELECT current_database() db,current_user role,pg_backend_pid() pid')).rows[0];need(who?.db==='zee_app_20261023'&&who.role==='zee_app_worker_20261023','POLICY_WORKER_DB_SCOPE');
  need((await client.query('SELECT pg_try_advisory_lock($1,$2) owned',POLICY_WORKER_LEASE as unknown as number[])).rows[0]?.owned===true,'POLICY_WORKER_LEASE_BUSY');leased=true;
  const workerBackendPid=Number(who.pid),scope={profileSha256:v.profileSha256,handoffSha256:sha(await readFile(forward.c.handoffProof)),openingProofSha256:p.immutable.openingProof.sha256,settlementContract:v.registry.contracts.ZeeSwapSettlement.address,tokenContract:v.registry.contracts.MockUSDC.address};
  const policy=await loadServicePolicyApi({ZEESWAP_TESTNET_SERVICE_POLICY_PROOF:c.policy.path,ZEESWAP_TESTNET_SERVICE_POLICY_SHA256:c.policy.sha256},scope,pool);need(policy,'POLICY_WORKER_POLICY_REQUIRED');await policy.recheck();const activeEpoch=policy.approval.activeEpoch;
  const executionEpoch=()=>readPolicyExecutionEpoch(pool,c.policy.sha256,activeEpoch);
  async function forwardExecution(){
   if(!c.forwardFastExecution){requireWorkerPolicyCommit(c.publicCommit,policy!.approval.publicCommit);return undefined;}
   const a=JSON.parse((await protectedBytes(c.forwardFastExecution)).toString()) as ForwardFastExecutionApproval;
   requireForwardFastExecution(a,c,{sha256:c.policy.sha256,activeEpoch,publicCommit:policy!.approval.publicCommit},v.profileSha256);
   need(a.originalSignerConfigSha256===forward.c.signerConfig.sha256&&a.supervisor.sha256===forward.c.supervisor.sha256,'POLICY_WORKER_FAST_ORIGINAL_SIGNER');
   for(const pin of[a.signerScript,a.signerDiagnostics,a.supervisor])await publicPin(pin);
   await publicPin(forward.c.signerConfig);
   requireForwardFastSignerConfig(JSON.parse((await protectedBytes(a.signerConfig)).toString()),JSON.parse((await readFile(forward.c.signerConfig.path)).toString()));
   const manifest=JSON.parse((await protectedBytes(c.executionManifest)).toString()),pins=workerExecutionPins(manifest,executionRoot,c.publicCommit);
   for(const pin of[a.signerScript,a.signerDiagnostics,a.supervisor])need(pins.some(p=>p.path===pin.path&&p.sha256===pin.sha256),'POLICY_WORKER_FAST_ASSET_MANIFEST');
   return a;
  }
  const fastForward=await forwardExecution();
  async function nativeExecution(root:ForwardFastExecutionApproval|undefined){reverse=root?.nativeExecution?await applyLinuxNativeFastExecution(originalReverse,c.forwardFastExecution!,root):originalReverse;}
  await nativeExecution(fastForward);
  const proofScope={stateRoot:'/opt/zeeswap-testnet/state' as const,sourceFingerprint:p.identity.sourceFingerprint,openingProof:p.immutable.chefOpeningProof,profileSha256:v.profileSha256,loaderSha256:originalReverse.c.scripts.profile.sha256,captureScriptSha256:c.captureScript.sha256};
  const captureDir=p.roots.state+'/testnet-policy/'+c.policy.sha256+'/capital-captures';await mkdir(captureDir,{recursive:true,mode:0o700});const ds=await lstat(captureDir);need(ds.uid===0&&(ds.mode&0o077)===0&&await realpath(captureDir)===captureDir,'POLICY_WORKER_CAPTURE_DIRECTORY');
  const previous=(await client.query("SELECT capital_observed_at,encode(capital_proof_digest,'hex') digest FROM zee.testnet_service_runtime WHERE policy_sha256=$1",[Buffer.from(c.policy.sha256,'hex')])).rows[0];if(previous)capital={observedAt:new Date(previous.capital_observed_at).toISOString(),proofDigest:previous.digest};
  const checkLease=async()=>{need(!lost,'POLICY_WORKER_LEASE_LOST');need((await client.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND pid=pg_backend_pid() AND classid=84532::oid AND objid=20261026::oid AND objsubid=2 AND granted) owned")).rows[0]?.owned===true,'POLICY_WORKER_LEASE_LOST');};
  const heartbeat=async(actual:ActualCapital)=>{await checkLease();await client.query('SELECT zee.record_testnet_worker_readiness($1,$2,$3)',[Buffer.from(c.policy.sha256,'hex'),actual.observedAt,Buffer.from(actual.proofDigest,'hex')]);};
  const context=(id:string):PolicyWorkerOrderContext=>({version:1,policySha256:c.policy.sha256,activeEpoch:policy.approval.activeEpoch,workerBackendPid,orderId:id,rootProofPath:c.policy.path,rootProofSha256:c.policy.sha256});
  async function capture(){await checkLease();const path=captureDir+'/'+randomUUID()+'.private.json';await physicalRead(reverse.c.python,[c.captureScript.path,'--profile-sha256',v.profileSha256,'--policy-sha256',c.policy.sha256,'--output',path]);const b=await readFile(path),pin={path,sha256:sha(b)},proof=JSON.parse(b.toString());
   if((await readPolicyMembers(pool,c.policy.sha256,activeEpoch)).globalActive!==0)throw Error('POLICY_ADMISSION_BECAME_BUSY');const current=await verifyPolicyIdleCapital({pool,keys,policySha256:c.policy.sha256,scope:proofScope,capture:pin,seedSources:c.seedSources});const heads=await base.preflight(),block=await base.client.getBlock({blockNumber:BigInt(heads.latest)}),[gas,nonce,pending]=await Promise.all([base.client.getBalance({address:v.registry.operator,blockNumber:BigInt(heads.latest)}),base.client.getTransactionCount({address:v.registry.operator,blockTag:'latest'}),base.client.getTransactionCount({address:v.registry.operator,blockTag:'pending'})]);need(nonce===pending,'POLICY_WORKER_PENDING_NONCE');
   const accounts=(await pool.query('SELECT asset,purpose,balance::text FROM zee.inventory_accounts ORDER BY asset,purpose')).rows;need(accounts.length===4,'POLICY_WORKER_BOOKS');const balance=(asset:string,purpose:string)=>BigInt(accounts.find(r=>r.asset===asset&&r.purpose===purpose)?.balance??'-1');need(BigInt(proof.capitalBalanceZatoshi)>=balance('TAZ','principal')+balance('TAZ','fee')&&BigInt(heads.availableInventory)>=balance('mockUSDC','principal')&&gas>=balance('baseETH','fee'),'POLICY_WORKER_PHYSICAL_BACKING');
   need((await base.client.getBlock({blockNumber:block.number})).hash===block.hash,'POLICY_WORKER_BASE_REORG');validatePolicyCapitalProof(proof,{policySha256:c.policy.sha256,...{profileSha256:v.profileSha256,loaderSha256:proofScope.loaderSha256,captureScriptSha256:c.captureScript.sha256}});await requireFreshLiveDispatchObservers(pool,await executionEpoch());
   const baseObservedAt=new Date().toISOString(),combined=await exclusive(path+'.readiness.private.json',{version:1,policySha256:c.policy.sha256,nativeCapture:pin,nativeObservedAt:current.observedAt,baseObservedAt,base:{height:heads.latest,hash:block.hash,nonce,pending,gas:gas.toString(),availableInventory:heads.availableInventory},observedAt:current.observedAt});capturePin=pin;return{observedAt:current.observedAt,proofDigest:combined.sha256};
  }
  async function freshOrderCapital(id:string,purpose:'reverse'|'refund'){await checkLease();const path=captureDir+'/'+randomUUID()+'.private.json';await physicalRead(reverse.c.python,[c.captureScript.path,'--profile-sha256',v.profileSha256,'--policy-sha256',c.policy.sha256,'--output',path]);capturePin={path,sha256:sha(await readFile(path))};await buildPolicyOrderCapital({pool,keys,context:context(id),purpose,scope:proofScope,capture:capturePin,seedSources:c.seedSources});}
  async function processBinding(id:string){
   await checkLease();const dir=p.roots.state+'/testnet-policy/'+c.policy.sha256+'/orders/'+id,path=dir+'/process.private.json';
   try{const st=await lstat(path);need(st.isFile()&&!st.isSymbolicLink()&&st.uid===0&&(st.mode&0o077)===0&&await realpath(path)===path,'POLICY_WORKER_PROCESS_FILE');assertPolicyOrderProcessBinding(JSON.parse(await readFile(path,'utf8')),context(id));return;}
   catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
   const existing=(await pool.query(`SELECT EXISTS(SELECT 1 FROM zee.base_bindings WHERE order_id=$1) OR EXISTS(SELECT 1 FROM zee.base_attempts WHERE order_id=$1) OR EXISTS(SELECT 1 FROM zee.escrow_commits WHERE order_id=$1) OR EXISTS(SELECT 1 FROM zee.reverse_payouts WHERE order_id=$1) OR EXISTS(SELECT 1 FROM zee.source_refunds WHERE order_id=$1) signed_or_planned`,[id])).rows[0];
   need(existing?.signed_or_planned===false,'POLICY_ORIGINAL_JOURNAL_WITHOUT_PROCESS_BINDING');
   await mkdir(dir,{recursive:true,mode:0o700});const ds=await lstat(dir);need(ds.uid===0&&(ds.mode&0o077)===0&&await realpath(dir)===dir,'POLICY_WORKER_PROCESS_DIRECTORY');
   await exclusive(path,{version:1,policyContext:context(id)});await checkLease();
  }
  async function native(id:string,purpose:'reverse'|'refund'){await processBinding(id);const loaded=purpose==='reverse'?reverse:refund,ctx=linuxNativeContexts(loaded,pool,keys,base,context(id));
   if(purpose==='reverse'){const original=ctx.reverse.approve;ctx.reverse.approve=async state=>{await freshOrderCapital(id,purpose);return original(state);};return dispatchLiveReverseOnce(ctx.reverse,id,undefined,false);}
   const original=ctx.refund.approveNative;ctx.refund.approveNative=async(state,row,source)=>{await freshOrderCapital(id,purpose);return original(state,row,source);};return dispatchLiveRefundOnce(ctx.refund,id,false);
  }
  const signer=new LocalBaseSigner(forward.c.python,[(fastForward?.supervisor??forward.c.supervisor).path,'--kind','base-forward','--script',(fastForward?.signerScript??forward.c.signerScript).path,'--config',(fastForward?.signerConfig??forward.c.signerConfig).path],120000,true);
  do{
   try{const result=await policyWorkerTick({checkLease,recheckPolicy:async()=>{await protectedBytes(configPin);await execution();await nativeExecution(await forwardExecution());await policy.recheck();},members:()=>readPolicyMembers(pool,c.policy.sha256,policy.approval.activeEpoch),capture,heartbeat,membership:async id=>{await checkLease();if(!capital)throw Error('POLICY_WORKER_NO_PRIOR_CAPTURE');await heartbeat(capital);await requirePolicyWorkerOrder(pool,context(id),id,scope);for(const purpose of ['reverse','refund']){try{assertPolicyOrderProcessBinding(JSON.parse(await readFile(p.roots.state+'/'+purpose+'-orders/'+id+'/state.private.json','utf8')),context(id));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}},forward:async id=>policyFinancialStep(()=>processBinding(id),()=>linuxForwardStep(pool,async refresh=>dispatchBaseOnce(pool,keys,base,signer,async()=>{await processBinding(id);await checkLease();await requirePolicyWorkerOrder(pool,context(id),id,scope);await refresh();},id,!!fastForward))),reverse:id=>native(id,'reverse'),refund:id=>native(id,'refund'),confirm:async id=>{await requireFreshLiveDispatchObservers(pool,await executionEpoch());const row=(await pool.query(`SELECT d.id,d.network,d.block_height,s.scanned_height,s.finalized_height,EXISTS(SELECT 1 FROM zee.chain_observations b WHERE b.network=d.network AND b.height=d.block_height AND b.block_hash=d.block_hash) canonical FROM zee.orders o JOIN zee.deposits d ON d.id=o.primary_deposit JOIN zee.scanner_checkpoints s ON s.network=d.network WHERE o.id=$1`,[id])).rows[0];if(!row||!row.canonical||(row.network==='zcash-testnet'?Number(row.scanned_height)-Number(row.block_height)+1<10:Number(row.finalized_height)<Number(row.block_height)))return{status:'WAIT_SOURCE_CONFIRMATIONS'};await requirePolicyWorkerOrder(pool,context(id),id,scope);return pool.query('SELECT zee.confirm_deposit($1)',[row.id]);},expire:async id=>{const row=(await pool.query(`SELECT o.funding_cutoff_height,o.funding_cutoff_time,s.scanned_height,s.finalized_time FROM zee.orders o JOIN zee.quotes q USING(id) JOIN zee.scanner_checkpoints s ON s.network=CASE WHEN q.direction='ZCASH_TO_BASE' THEN 'zcash-testnet' ELSE 'base-sepolia' END WHERE o.id=$1`,[id])).rows[0];if(!row||row.funding_cutoff_height!==null&&Number(row.scanned_height)<Number(row.funding_cutoff_height)+9||row.funding_cutoff_time!==null&&new Date(row.finalized_time)<new Date(row.funding_cutoff_time))return{status:'WAIT_FUNDING_WINDOW'};await requirePolicyWorkerOrder(pool,context(id),id,scope);return pool.query('SELECT zee.expire_unfunded($1)',[id]);}},capital);capital=result.capital;console.log(JSON.stringify({event:'testnet-policy-worker',status:result.status}));}
   catch(e){if(['POLICY_WALLET_READ_WAIT','POLICY_ADMISSION_BECAME_BUSY'].includes((e as Error).message)){console.log(JSON.stringify({event:'testnet-policy-worker',status:'WAIT_ACTUAL_CAPITAL'}));}else{if(['POLICY_FROZEN_PROCESS_REQUIRES_ROOT_ORIGINAL_JOURNAL_REVIEW','POLICY_ORIGINAL_JOURNAL_WITHOUT_PROCESS_BINDING'].includes((e as Error).message))await withLiveOperatorLock(pool,async()=>{const control=(await pool.query('SELECT epoch::text,reconciliation_required FROM zee.runtime_control WHERE singleton')).rows[0];if(control?.epoch===await executionEpoch()&&!control.reconciliation_required)await pool.query('SELECT zee.enter_reconciliation()');});throw e;}}
   if(once)break;await delay(5000,undefined,{signal:stop.signal}).catch(()=>{});
  }while(!stop.signal.aborted);return{status:'POLICY_WORKER_STOPPED'};
 }finally{process.removeListener('SIGTERM',onStop);process.removeListener('SIGINT',onStop);if(leased&&!lost)await client.query('SELECT pg_advisory_unlock($1,$2)',POLICY_WORKER_LEASE as unknown as number[]).catch(()=>{});client.release();await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{const[path,hash,...flags]=process.argv.slice(2);need(path&&/^[a-f0-9]{64}$/.test(hash??'')&&flags.every(f=>f==='--once')&&flags.length<=1,'POLICY_WORKER_CLI');console.log(JSON.stringify(await runPolicyWorker(path,hash!,flags.length===1)));}catch{console.error(JSON.stringify({status:'POLICY_WORKER_STOPPED_ROOT_REVIEW_REQUIRED',financialActionMayBeJournaled:true}));process.exitCode=78;}}
