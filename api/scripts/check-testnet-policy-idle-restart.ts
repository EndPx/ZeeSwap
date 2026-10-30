/** systemd ExecCondition only: zero Source/wallet calls and zero database writes. */
import{readFile,lstat,realpath,readdir}from'node:fs/promises';
import{createHash}from'node:crypto';
import{dirname,resolve}from'node:path';
import{pathToFileURL}from'node:url';
import{loadLinuxForward}from'../src/linux-forward-dispatch.ts';
import{connect}from'../src/db.ts';
import{publicSettlementId}from'../src/base-contract.ts';
import{decodePgJsonbBytea}from'../src/pg-jsonb-bytea.ts';
import{workerExecutionPins}from'../src/testnet-policy-execution.ts';
import{loadServicePolicyApi}from'../src/testnet-service-policy.ts';
import{readServiceLaunchState}from'../src/testnet-service-launch.ts';
import{requirePreUserIdleRestart,requireReuseQualifiedUnsignedRestart,requireIdleRestartPinPermissions,idleRestartLineage,requireIdleRestartFreshSources,PREUSER_SOURCE_RECOVERY_MARKER}from'../src/testnet-policy-idle-restart.ts';
import{requireThat}from'../src/integrations/observation/types.ts';
const ROOT='/opt/zeeswap-testnet',COMMIT='6ebb11da0fdaa70ccdd35d0c04e5abfe0b256ecc',A70='a70f41da956f0551caf62c0e922d57d99ab7a3d8b3a3dc337021f16855fe6cd6',F0='f0bff786787f692707f02e842562ada922ef9035380f09fbf796bf5502873c53';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),need=(v:unknown,c:string)=>requireThat(v,'POLICY_IDLE_RESTART_'+c);
export async function requireNoSourceRecoveryMarker(path=PREUSER_SOURCE_RECOVERY_MARKER){try{await lstat(path);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}need(false,'SOURCE_RECOVERY_ACTIVE');}
async function pinned(pin:{path:string;sha256:string},secret=false){need(pin.path.startsWith(ROOT+'/')&&resolve(pin.path)===pin.path,'PIN_PATH');for(let p=dirname(pin.path);p.startsWith(ROOT);p=dirname(p)){const s=await lstat(p);need(s.isDirectory()&&!s.isSymbolicLink()&&(s.mode&0o022)===0,'PIN_DIRECTORY');}const s=await lstat(pin.path);need(s.isFile()&&!s.isSymbolicLink()&&s.size<=16000000&&await realpath(pin.path)===pin.path,'PIN_FILE');requireIdleRestartPinPermissions(s.uid,s.mode,secret);const b=await readFile(pin.path);need(sha(b)===pin.sha256,'PIN_BYTES');return b;}
export async function requireNoCurrentPolicyProcesses(directory:string){
 for(let p=directory;p.startsWith(ROOT);p=dirname(p)){try{const s=await lstat(p);need(s.isDirectory()&&!s.isSymbolicLink()&&(s.mode&0o022)===0&&await realpath(p)===p,'PROCESS_DIRECTORY');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
 try{need((await readdir(directory)).length===0,'CURRENT_PROCESS_JOURNAL_EXISTS');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
}
export async function requireNoBaseOrderJournal(directory:string,settlementId:string){
 need(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(settlementId),'SETTLEMENT_ID');
 for(let path=directory;path.startsWith(ROOT);path=dirname(path)){const s=await lstat(path);need(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&0o022)===0&&await realpath(path)===path,'BASE_JOURNAL_DIRECTORY');}
 const identifier=sha(Buffer.from(publicSettlementId(settlementId))),names=await readdir(directory);need(names.length<=512&&!names.some(name=>name.startsWith(identifier+'.')),'CURRENT_BASE_SIGNER_JOURNAL');
}
export async function checkPolicyIdleRestart(configPath:string,configSha256:string){
 need(process.platform==='linux'&&process.getuid?.()===0&&process.env.NODE_OPTIONS===undefined&&configPath===ROOT+'/secrets/testnet-policy-worker.private.json'&&/^[a-f0-9]{64}$/.test(configSha256),'ROOT_EXEC_CONDITION');
 await requireNoSourceRecoveryMarker();
 const raw=await pinned({path:configPath,sha256:configSha256},true),c=JSON.parse(raw.toString());
 need(c.version===1&&c.mode==='ROOT_BOUNDED_TESTNET_SERVICE_WORKER'&&c.enabled===true&&c.pollSeconds===5&&c.publicCommit===COMMIT&&c.executionRoot===ROOT+'/releases/vps-primary-6ebb11d-r1/app'&&c.executionManifest.path===ROOT+'/state/service-policy/execution-manifest-6ebb-primary.private.json'&&c.executionManifest.sha256===A70,'ORIGINAL_EXECUTION');
 const manifest=JSON.parse((await pinned(c.executionManifest,true)).toString());for(const pin of workerExecutionPins(manifest,c.executionRoot,COMMIT))await pinned(pin);
 await pinned({path:ROOT+'/state/database-relocation/legacy-pg-preload.private.json',sha256:F0});
 const forward=await loadLinuxForward(ROOT+'/secrets/forward-profile.private.json'),v=forward.verified,p=v.profile,processRoot=p.roots.state+'/testnet-policy/'+c.policy.sha256+'/orders';
 need(/^[a-f0-9]{64}$/.test(c.policy.sha256),'POLICY_PIN');await pinned(c.policy);await requireNoCurrentPolicyProcesses(processRoot);
 const pool=connect(v.runtime.workerUrl,1),client=await pool.connect();
 try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET LOCAL statement_timeout='10s'");const identity=(await client.query('SELECT current_database() db,current_user role,(pg_control_system()).system_identifier::text system')).rows[0];need(identity?.db==='zee_app_20261023'&&identity.role==='zee_app_worker_20261023'&&identity.system==='7701863382450487342','DATABASE_IDENTITY');
 const policy=await loadServicePolicyApi({ZEESWAP_TESTNET_SERVICE_POLICY_PROOF:c.policy.path,ZEESWAP_TESTNET_SERVICE_POLICY_SHA256:c.policy.sha256},{profileSha256:v.profileSha256,handoffSha256:sha(await readFile(forward.c.handoffProof)),openingProofSha256:p.immutable.openingProof.sha256,settlementContract:v.registry.contracts.ZeeSwapSettlement.address,tokenContract:v.registry.contracts.MockUSDC.address},client);need(policy,'POLICY_REQUIRED');if(!policy)throw Error('POLICY_IDLE_RESTART_POLICY_REQUIRED');await policy.recheck();
 const s=await readServiceLaunchState(client),links=(await client.query("SELECT encode(policy_sha256,'hex') policy,encode(predecessor_sha256,'hex') predecessor FROM zee.testnet_policy_predecessors ORDER BY policy_sha256 LIMIT 17")).rows,lineage=idleRestartLineage(c.policy.sha256,links),workerLease=(await client.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=84532 AND objid=20261026 AND granted) busy")).rows[0]?.busy;
 const installed=(await client.query("SELECT to_regprocedure('zee.testnet_unfunded_reuse_enabled(zee.digest)') IS NOT NULL installed")).rows[0]?.installed;const authorization=installed?(await client.query('SELECT zee.testnet_policy_nonexpiring($1) nonexpiring,zee.testnet_unfunded_reuse_enabled($1) "reuseEnabled"',[Buffer.from(c.policy.sha256,'hex')])).rows[0]:undefined;
 if(authorization?.reuseEnabled){const members=(await client.query('SELECT order_id::text "orderId",zee.testnet_unfunded_attempt_reusable(order_id) reusable FROM zee.testnet_policy_admissions WHERE policy_sha256=$1 ORDER BY order_id',[Buffer.from(c.policy.sha256,'hex')])).rows;for(const member of s.snapshot.testnet_policy_quotes!.filter(row=>decodePgJsonbBytea(row.policy_sha256,32).toString('hex')===c.policy.sha256).map(row=>({orderId:row.quote_id}))){need(/^[a-f0-9-]{36}$/.test(member.orderId),'CURRENT_ORDER_ID');for(const path of[processRoot+'/'+member.orderId,p.roots.state+'/reverse-orders/'+member.orderId,p.roots.state+'/refund-orders/'+member.orderId]){await requireNoCurrentPolicyProcesses(path);try{await lstat(path);need(false,'CURRENT_ORDER_PROCESS_EXISTS');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}const quote=s.snapshot.quotes!.find(row=>row.id===member.orderId);need(quote,'CURRENT_QUOTE');await requireNoBaseOrderJournal(p.paths.baseJournal,quote!.settlement_id);}requireReuseQualifiedUnsignedRestart(policy.approval,c.policy.sha256,{...s,lineage,workerLease},{...authorization,members});}
 else requirePreUserIdleRestart(policy.approval,c.policy.sha256,{...s,lineage,workerLease});const sources=(await client.query("SELECT network,scanned_height::text,finalized_height::text,observed_at FROM zee.scanner_checkpoints WHERE network IN('zcash-testnet','base-sepolia') ORDER BY network")).rows,clock=(await client.query('SELECT clock_timestamp() checked_at')).rows[0]?.checked_at;requireIdleRestartFreshSources(sources,clock);await requireNoCurrentPolicyProcesses(processRoot);need((await pinned({path:configPath,sha256:configSha256},true)).equals(raw),'CONFIG_CHANGED');await policy.recheck();await requireNoSourceRecoveryMarker();await client.query('ROLLBACK');return{status:'POLICY_PRE_USER_IDLE_RESTART_ALLOWED',financialAction:false};
 }finally{await client.query('ROLLBACK').catch(()=>{});client.release();await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const[path,sha256]=process.argv.slice(2);try{need(path&&sha256&&process.argv.length===4,'ARGUMENTS');console.log(JSON.stringify(await checkPolicyIdleRestart(path!,sha256!)));}catch(e){console.error(JSON.stringify({status:'POLICY_IDLE_RESTART_REFUSED_MANUAL_REVIEW',code:(e as any)?.code??'PRIVATE_GATE_FAILURE',financialAction:false}));process.exitCode=1;}}
