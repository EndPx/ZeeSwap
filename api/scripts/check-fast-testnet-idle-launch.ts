/** Root-only, once-only start qualification. No Source/wallet calls or SQL writes. */
import {readFile,lstat,realpath,readdir} from 'node:fs/promises';import {createHash} from 'node:crypto';import {dirname,resolve} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import {connect} from '../src/db.ts';import {loadLinuxForward} from '../src/linux-forward-dispatch.ts';import {loadLinuxNativeDispatch,applyLinuxNativeFastExecution} from '../src/linux-native-dispatch.ts';import {loadServicePolicyApi} from '../src/testnet-service-policy.ts';
import {workerExecutionRoot,workerExecutionPins,requireForwardFastExecution,requireForwardFastSignerConfig,readPolicyExecutionEpoch,type WorkerExecutionConfig,type ForwardFastExecutionApproval,type WorkerExecutionPin} from '../src/testnet-policy-execution.ts';
import {FAST_IDLE_TABLES,requireFastIdleDirectoryOwner,fastIdleTableDigestSql,validateFastIdleLaunchProof,requireFastIdleLaunchState,consumeFastIdleLaunch,type FastIdleLaunchProof,type TableDigest} from '../src/fast-testnet-idle-launch.ts';
const ROOT='/opt/zeeswap-testnet',sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');function need(v:unknown,c:string):asserts v{if(!v)throw Error('FAST_IDLE_LAUNCH_'+c);}
async function pinned(pin:WorkerExecutionPin,privateFile=false){
 need(pin&&pin.path.startsWith(ROOT+'/')&&resolve(pin.path)===pin.path&&/^[a-f0-9]{64}$/.test(pin.sha256),'PIN_PATH');
 for(let path=dirname(pin.path);path.startsWith(ROOT);path=dirname(path)){const s=await lstat(path);need(s.isDirectory()&&!s.isSymbolicLink()&&await realpath(path)===path,'ROOT_DIRECTORY');requireFastIdleDirectoryOwner(path,s.uid,s.gid,s.mode);}
 const s=await lstat(pin.path);need(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&(privateFile?0o077:0o022))===0&&s.size<=16000000&&await realpath(pin.path)===pin.path,'ROOT_PIN');const raw=await readFile(pin.path);need(sha(raw)===pin.sha256,'PIN_CHANGED');return raw;
}
async function absent(path:string){try{await lstat(path);return false;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return true;throw e;}}
async function physical(originalPid:number){
 const matches:number[]=[];
 for(const pid of await readdir('/proc')){if(!/^[1-9][0-9]*$/.test(pid)||Number(pid)===process.pid)continue;let bytes:Buffer;try{bytes=await readFile('/proc/'+pid+'/cmdline');}catch(e){if(['ENOENT','ESRCH'].includes((e as NodeJS.ErrnoException).code??''))continue;throw e;}
  const args=bytes.toString().split('\0');if(args.some(arg=>/(?:^|\/)(?:work-linux-(?:testnet|market)-policy|(?:forward|reverse|refund)-live-testnet|dispatch-live-testnet|base-dispatch|g5-operator|g5-reverse-operator|reverse-operator|refund-operator|live-testnet-circle|serve-bridge-public-pilot)\.ts$/.test(arg)||/(?:^|\/)(?:signer|reverse_signer|refund_signer|linux_native_wallet|prepared_raw|refund_raw|bridge_native_wallet)\.py$/.test(arg)))matches.push(Number(pid));
 }
 return {originalWorkerAlive:!await absent('/proc/'+originalPid),financialProcessPids:matches};
}
export async function checkFastTestnetIdleLaunch(configPath:string,configSha256:string,proofPath:string,proofSha256:string){
 need(process.platform==='linux'&&process.getuid?.()===0&&process.env.NODE_OPTIONS===undefined&&configPath===ROOT+'/secrets/testnet-policy-worker.private.json'&&/^\/opt\/zeeswap-testnet\/state\/service-policy\/[A-Za-z0-9._-]+\.private\.json$/.test(proofPath),'ROOT_ONCE_SCOPE');
 const marker=proofPath+'.consumed';need(await absent(marker),'ALREADY_CONSUMED');need(await absent(ROOT+'/state/service-policy/preuser-source-recovery-active.private.json'),'SOURCE_RECOVERY_ACTIVE');
 const configPin={path:configPath,sha256:configSha256},proofPin={path:proofPath,sha256:proofSha256},configBytes=await pinned(configPin,true),proofBytes=await pinned(proofPin,true),c=JSON.parse(configBytes.toString()) as WorkerExecutionConfig&{version:1;mode:string;enabled:boolean;pollSeconds:number;policy:WorkerExecutionPin;captureScript:WorkerExecutionPin};
 need(c.version===1&&c.mode==='ROOT_BOUNDED_TESTNET_SERVICE_WORKER'&&c.enabled===true&&c.pollSeconds===5&&c.forwardFastExecution,'WORKER_CONFIG');
 workerExecutionRoot(c.executionRoot+'/api/scripts/work-linux-testnet-policy.ts',c.executionRoot);need(fileURLToPath(import.meta.url)===c.executionRoot+'/api/scripts/check-fast-testnet-idle-launch.ts','EXACT_CHECKER_RELEASE');
 const manifest=JSON.parse((await pinned(c.executionManifest,true)).toString()),pins=workerExecutionPins(manifest,c.executionRoot,c.publicCommit);for(const pin of pins)await pinned(pin);
 for(const relative of ['api/scripts/check-fast-testnet-idle-launch.ts','api/src/fast-testnet-idle-launch.ts'])need(pins.some(p=>p.path===c.executionRoot+'/'+relative),'CHECKER_MANIFEST');
 const forward=await loadLinuxForward(ROOT+'/secrets/forward-profile.private.json'),v=forward.verified,p=v.profile;
 need(c.captureScript.path===p.roots.release+'/app/workers/zcash-wallet/testnet_policy_capital.py','ORIGINAL_CAPTURE_SCRIPT');await pinned(c.captureScript);await pinned(c.policy);
 const fast=JSON.parse((await pinned(c.forwardFastExecution,true)).toString()) as ForwardFastExecutionApproval;
 const proof=JSON.parse(proofBytes.toString()) as FastIdleLaunchProof;validateFastIdleLaunchProof(proof,{workerConfigSha256:configSha256,fastRootSha256:c.forwardFastExecution.sha256,policySha256:c.policy.sha256,activeEpoch:fast.activeEpoch,effectiveEpoch:proof.effectiveEpoch});await pinned(proof.closedReceiptProof,true);
 const pool=connect(v.runtime.workerUrl,1),db=await pool.connect();
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");await db.query("SET LOCAL TIME ZONE 'UTC'");
  const who=(await db.query('SELECT current_database() db,current_user role,(pg_control_system()).system_identifier::text system')).rows[0];need(who?.db==='zee_app_20261023'&&who.role==='zee_app_worker_20261023'&&who.system==='7701863382450487342','ACTUAL_DATABASE');
  const policy=await loadServicePolicyApi({ZEESWAP_TESTNET_SERVICE_POLICY_PROOF:c.policy.path,ZEESWAP_TESTNET_SERVICE_POLICY_SHA256:c.policy.sha256},{profileSha256:v.profileSha256,handoffSha256:sha(await readFile(forward.c.handoffProof)),openingProofSha256:p.immutable.openingProof.sha256,settlementContract:v.registry.contracts.ZeeSwapSettlement.address,tokenContract:v.registry.contracts.MockUSDC.address},db);need(policy,'POLICY');await policy.recheck();
  requireForwardFastExecution(fast,c,{sha256:c.policy.sha256,activeEpoch:policy.approval.activeEpoch,publicCommit:policy.approval.publicCommit},v.profileSha256);
  need(fast.originalSignerConfigSha256===forward.c.signerConfig.sha256&&fast.supervisor.sha256===forward.c.supervisor.sha256,'ORIGINAL_SIGNER');
  requireForwardFastSignerConfig(JSON.parse((await pinned(fast.signerConfig,true)).toString()),JSON.parse((await pinned(forward.c.signerConfig,true)).toString()));
  for(const pin of [fast.signerScript,fast.signerDiagnostics,fast.supervisor]){need(pins.some(p=>p.path===pin.path&&p.sha256===pin.sha256),'SIGNER_MANIFEST');await pinned(pin);}
  if(fast.nativeExecution)await applyLinuxNativeFastExecution(await loadLinuxNativeDispatch(p.roots.secrets+'/reverse-profile.private.json','reverse'),c.forwardFastExecution,fast);
  const tableDigests:Record<string,TableDigest>={};for(const table of FAST_IDLE_TABLES)tableDigests[table]=(await db.query(fastIdleTableDigestSql(table))).rows[0];
  const counts=(await db.query(`SELECT
   (SELECT count(*)::int FROM zee.orders WHERE state NOT IN('SETTLED','REFUNDED','EXPIRED_UNFUNDED')) nonterminal_orders,
   (SELECT count(*)::int FROM zee.obligations WHERE state<>'DISCHARGED') held_obligations,
   (SELECT count(*)::int FROM zee.reservations WHERE released_at IS NULL) unreleased_reservations,
   (SELECT count(*)::int FROM zee.inventory_accounts WHERE reserved<>0) reserved_inventory,
   (SELECT count(*)::int FROM zee.base_attempts WHERE NOT confirmed) unconfirmed_base,
   (SELECT count(*)::int FROM zee.escrow_commits WHERE NOT confirmed) unconfirmed_commit,
   (SELECT count(*)::int FROM zee.reverse_payouts WHERE NOT confirmed) unconfirmed_native,
   (SELECT count(*)::int FROM zee.escrow_settlements WHERE NOT confirmed) unconfirmed_settle,
   (SELECT count(*)::int FROM zee.source_refunds WHERE NOT confirmed) unconfirmed_refund,
   (SELECT count(*)::int FROM zee.chain_transactions WHERE state NOT IN('CONFIRMED','REVERTED','EXPIRED')) unresolved_transactions,
   (SELECT count(*)::int FROM zee.operations WHERE state<>'CONFIRMED') unconfirmed_operations,
   (SELECT count(*)::int FROM zee.outbox_jobs WHERE status<>'DONE') pending_jobs,
   ((SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND classid=84532 AND objid IN(20261023,20261026) AND granted AND pid<>pg_backend_pid())+(SELECT count(*) FROM zee.outbox_jobs WHERE status='LEASED'))::int financial_leases`)).rows[0];
  const control=(await db.query("SELECT epoch::text,xmin::text,accepting_orders,dispatch_enabled,reconciliation_required FROM zee.runtime_control WHERE singleton")).rows[0],sources=(await db.query('SELECT network,scanned_height::text,finalized_height::text,observed_at FROM zee.scanner_checkpoints ORDER BY network')).rows,checkedAt=(await db.query('SELECT clock_timestamp() at')).rows[0].at;
  requireFastIdleLaunchState(proof,{control,tableDigests,counts,...await physical(proof.originalWorkerPid),sources,checkedAt});
  validateFastIdleLaunchProof(proof,{workerConfigSha256:configSha256,fastRootSha256:c.forwardFastExecution.sha256,policySha256:c.policy.sha256,activeEpoch:fast.activeEpoch,effectiveEpoch:await readPolicyExecutionEpoch(db,c.policy.sha256,policy.approval.activeEpoch)});await policy.recheck();
  need((await pinned(configPin,true)).equals(configBytes)&&(await pinned(proofPin,true)).equals(proofBytes),'FINAL_PINS');need(await absent(ROOT+'/state/service-policy/preuser-source-recovery-active.private.json'),'SOURCE_RECOVERY_ACTIVE');
  const finalPhysical=await physical(proof.originalWorkerPid);need(!finalPhysical.originalWorkerAlive&&finalPhysical.financialProcessPids.length===0,'FINAL_QUIESCENCE');
  await db.query('ROLLBACK');await consumeFastIdleLaunch(marker,proofSha256,configSha256);
  return {status:'ROOT_BASE_L2_IDLE_LAUNCH_ALLOWED_ONCE',financialAction:false,sqlWrites:0,proofSha256,workerConfigSha256:configSha256};
 }finally{await db.query('ROLLBACK').catch(()=>{});db.release();await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{need(process.argv.length===6,'ARGUMENTS');console.log(JSON.stringify(await checkFastTestnetIdleLaunch(...process.argv.slice(2) as [string,string,string,string])));}catch(e){console.error(JSON.stringify({status:'ROOT_BASE_L2_IDLE_LAUNCH_REFUSED',code:e instanceof Error&&/^FAST_IDLE_LAUNCH_[A-Z_]+$/.test(e.message)?e.message:'PRIVATE_GATE_FAILURE',financialAction:false}));process.exitCode=1;}}
