import {admitAndFundSource,sourceAdmittedPath} from '../src/g5-source-admission.ts';
/** Explicitly invoked private live adapter. Never schedule this CLI unattended.
 * All logs are sanitized; child stdout (including private funding data) stays
 * in memory. Uncertain effects retain a fixed fsynced inflight intent. */
import {spawn} from 'node:child_process';
import {open,unlink,lstat,readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {createPublicClient,http,keccak256,getAddress,recoverTransactionAddress,parseTransaction,type Hex,type TransactionSerialized} from 'viem';
import {read,durable,privateLocalPath} from './g5-context.ts';
import {g5Binding,G5_RETRY_TARGET,validateG5State,g5PathIdentity} from '../src/g5-run.ts';
import {initialG5LiveState,validateG5LiveState,runG5LiveBounded,syncAndFundG5Source,type G5LiveStage,type G5LiveSnapshot,type G5LiveState} from '../src/g5-live-controller.ts';
import {resolveG5ReferencedPrivatePath} from '../src/g5-private-path.ts';
import {sourcePrefundWait} from '../src/g5-source-protocol.ts';
import {g5FundingArtifact,g5SourceFundingArgv} from '../src/g5-quote-attempts.ts';
import {g5ChildDiagnostic} from '../src/g5-child-diagnostic.ts';
type Command={command:string;args:string[]};
const [mode,path,arg]=process.argv.slice(2);
if(!['init','tick','status','release-hold'].includes(mode)||!path||process.argv.length>5)throw Error('G5_LIVE_EXPLICIT_MODE_CONFIG_REQUIRED');
const cfg=await read(path),manifest=await read(cfg.runConfig),manifestBinding=g5Binding(manifest);
if(cfg.version!==1||manifest.branchId!==G5_RETRY_TARGET.branchId||cfg.runId!==manifest.runId||cfg.manifestBinding!==manifestBinding||!Array.isArray(cfg.sourceActors)||!Array.isArray(cfg.payerOrders)||cfg.sourceActors.length!==9||cfg.payerOrders.length!==9||cfg.sourceActors.some((s:any,i:number)=>s.sequence!==3+i*2)||cfg.payerOrders.some((s:any,i:number)=>s.sequence!==4+i*2))throw Error('G5_LIVE_FIXED_RETRY_CONFIG_REQUIRED');
if(!Number.isInteger(cfg.maxActive)||cfg.maxActive<1||cfg.maxActive>4||!Number.isInteger(cfg.admissionThrough)||cfg.admissionThrough<4||cfg.admissionThrough>20||!Array.isArray(cfg.holds)||cfg.holds.some((s:any)=>typeof s!=='string'))throw Error('G5_LIVE_ADMISSION_POLICY_REQUIRED');
const binding=createHash('sha256').update(JSON.stringify(cfg)).digest('hex'),statePath=privateLocalPath(cfg.stateFile);
if(g5PathIdentity(statePath)===g5PathIdentity(manifest.stateFile))throw Error('G5_LIVE_SEPARATE_STATE_REQUIRED');
const lock=await open(statePath+'.lock','wx',0o600);await lock.writeFile(JSON.stringify({pid:process.pid,runId:cfg.runId}));await lock.sync();
const apiDir=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let activeAction={sequence:0,stage:'SNAPSHOT'};
async function command(c:Command){
 if(typeof c.command!=='string'||!Array.isArray(c.args)||c.args.some(a=>typeof a!=='string'))throw Error('G5_LIVE_FIXED_ARGV_REQUIRED');
 return new Promise<any>((ok,no)=>{
  // No shell and no inherited stdio. Kill on timeout, preserve intent and treat
  // it as UNKNOWN even if a descendant might have completed the operation.
  const action={...activeAction},child=spawn(c.command,c.args,{cwd:apiDir,stdio:['ignore','pipe','pipe'],windowsHide:true});let stdout='',stderr='',size=0,settled=false;
  const fail=async(code:string,exitCode:number|null=null,signal:string|null=null)=>{if(settled)return;settled=true;clearTimeout(timer);
   await durable(statePath+'.child-diagnostic.private.json',g5ChildDiagnostic(stderr,action,exitCode,signal)).catch(()=>{});stderr='';stdout='';no(Error(code));};
  const timer=setTimeout(()=>{child.kill();void fail('G5_LIVE_CHILD_TIMEOUT_UNKNOWN');},cfg.commandTimeoutMilliseconds??240000);
  child.stdout.on('data',b=>{size+=b.length;if(size>1048576){child.kill();void fail('G5_LIVE_CHILD_OUTPUT_LIMIT');}else stdout+=b.toString();});
  child.stderr.on('data',b=>{if(stderr.length<65536)stderr+=b.toString().slice(0,65536-stderr.length);});child.on('error',error=>{stderr=String(error.stack??'Error:').slice(0,65536);void fail('G5_LIVE_CHILD_UNKNOWN');});
  child.on('close',(code,signal)=>{clearTimeout(timer);if(settled)return;if(code!==0){void fail('G5_LIVE_CHILD_UNKNOWN',code,signal);return;}try{const lines=stdout.trim().split(/\r?\n/);const value=JSON.parse(lines.at(-1)!);if(typeof(value.status??value.state)!=='string')throw Error();settled=true;stderr='';ok({...value,status:value.status??value.state});}catch{void fail('G5_LIVE_CHILD_PROTOCOL_UNKNOWN',code,signal);}});
 });
}
const script=(name:string,args:string[])=>command({command:process.execPath,args:['--import','tsx',resolve(apiDir,'scripts',name),...args]});
const snapshot=()=>{activeAction={sequence:0,stage:'SNAPSHOT'};return script('g5-controller-status.ts',[cfg.runConfig]) as Promise<G5LiveSnapshot>;};
const core=(step:string,sequence:number)=>script('g5-operator.ts',[step,cfg.runConfig,String(sequence)]);
const reverse=(step:string,sequence:number)=>script('g5-reverse-operator.ts',[step,manifest.reverseOrders.find((o:any)=>o.sequence===sequence).configFile]);
const base=createPublicClient({transport:http(manifest.baseRpcUrl,{timeout:30000,retryCount:0})});
async function payer(sequence:number,stage:G5LiveStage){
 const item=cfg.payerOrders.find((o:any)=>o.sequence===sequence),payerConfig=await read(item.configFile);
 const approvalPath=privateLocalPath(resolveG5ReferencedPrivatePath(item.configFile,payerConfig.approvedFile));
 const reversePath=manifest.reverseOrders.find((o:any)=>o.sequence===sequence).configFile,reverseConfig=await read(reversePath),saved=await read(reverseConfig.stateFile),coreState=await read(manifest.stateFile);validateG5State(coreState,manifest);
 const slot=coreState.orders.find((o:any)=>o.sequence===sequence);
 if(coreState.incident||coreState.closed||!slot?.orderId||saved.orderId!==slot.orderId||!saved.funding||Object.keys(saved.funding).sort().join(',')!=='data,signature,terms,to,value'||saved.funding.terms.amount!=='100000'||saved.funding.value!=='0'||payerConfig.runId!==cfg.runId||g5PathIdentity(payerConfig.runConfig)!==g5PathIdentity(cfg.runConfig))throw Error('G5_LIVE_PAYER_CORE_BINDING');
 const approved={version:1,branchId:manifest.branchId,sequence,orderId:slot.orderId,funding:saved.funding};
 // Python canonical() sorts keys recursively. This exact digest is checked
 // again by the narrow payer helper against the actual saved core object.
 const canonical=(v:any):string=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
 const digest=createHash('sha256').update(canonical(approved)).digest('hex');
 if(stage==='PAYER_APPROVAL'){
  if(payerConfig.approvedDigest!==digest&&!/^0{64}$/.test(payerConfig.approvedDigest))throw Error('G5_LIVE_PAYER_APPROVAL_IMMUTABLE');
  try{if(!isDeepStrictEqual(await read(approvalPath),approved))throw Error('G5_LIVE_APPROVED_FILE_CONFLICT');}catch(e){if((e as any).code!=='ENOENT')throw e;await durable(approvalPath,approved,true);}
  payerConfig.approvedDigest=digest;await durable(privateLocalPath(item.configFile),payerConfig);return {status:'PAYER_APPROVAL_SAVED'};
 }
 if(payerConfig.approvedDigest!==digest||!isDeepStrictEqual(await read(approvalPath),approved))throw Error('G5_LIVE_PAYER_APPROVAL_REQUIRED');
 if(stage==='PAYER_PREPARE')return command(item.prepare);
 const prepared=await read(item.preparedFile);
 if(typeof prepared.raw!=='string'||!/^0x[0-9a-f]{64}$/.test(prepared.hash)||keccak256(prepared.raw)!==prepared.hash||!Number.isSafeInteger(prepared.nonce)||prepared.maxCost!=='10000000000000'||getAddress(await recoverTransactionAddress({serializedTransaction:prepared.raw as TransactionSerialized}))!==getAddress(payerConfig.payer))throw Error('G5_LIVE_PAYER_ORIGINAL_RAW_REQUIRED');
 const tx=parseTransaction(prepared.raw as TransactionSerialized);
 if(tx.chainId!==84532||tx.nonce!==prepared.nonce||getAddress(tx.to!)!==getAddress(saved.funding.to)||tx.data!==saved.funding.data||(tx.value??0n)!==0n||tx.gas!==450000n||tx.gasPrice!==20000000n)throw Error('G5_LIVE_PAYER_RAW_CALL_MISMATCH');
 // Pin original hash before network IO. The reverse observer only accepts this
 // hash; no new calldata or replacement nonce can be created here.
 if(reverseConfig.fundingTransactionHash&&reverseConfig.fundingTransactionHash!==prepared.hash)throw Error('G5_LIVE_FUNDING_HASH_CONFLICT');
 reverseConfig.fundingTransactionHash=prepared.hash;await durable(privateLocalPath(reversePath),reverseConfig);
 if(await base.getChainId()!==84532)throw Error('G5_LIVE_PAYER_CHAIN');
 const known=await base.getTransaction({hash:prepared.hash as Hex}).catch(e=>{if(e.name==='TransactionNotFoundError')return null;throw e;});
 if(!known){
  const latest=await base.getTransactionCount({address:payerConfig.payer,blockTag:'latest'}),pending=await base.getTransactionCount({address:payerConfig.payer,blockTag:'pending'});
  if(latest!==prepared.nonce||pending!==prepared.nonce)throw Error('G5_LIVE_PAYER_NONCE_UNCERTAIN');
  const head=await base.getBlock({blockTag:'latest'}),same=await base.getBlock({blockNumber:head.number}),now=Math.floor(Date.now()/1000);
  if(head.hash!==same.hash||!Number.isSafeInteger(Number(head.timestamp))||now-Number(head.timestamp)< -30||now-Number(head.timestamp)>120||Math.max(now,Number(head.timestamp))+60>=Number(saved.funding.terms.fundingCutoff))throw Error('G5_LIVE_PAYER_FRESH_FUNDING_WINDOW_REQUIRED');
  if(await base.sendRawTransaction({serializedTransaction:prepared.raw})!==prepared.hash)throw Error('G5_LIVE_PAYER_BROADCAST_UNKNOWN');
 }
 return {status:'ORIGINAL_PAYER_BROADCAST_KNOWN'};
}
async function execute(sequence:number,stage:G5LiveStage|'BARRIER'|'CLOSE'){
 activeAction={sequence,stage};
 const actor=cfg.sourceActors.find((o:any)=>o.sequence===sequence);
 if(stage==='SYNC'){const result=await command(actor.sync);if(result.status==='SOURCE_PREFUND_WAIT'&&!sourcePrefundWait(result,sequence))throw Error('G5_LIVE_INVALID_SOURCE_SYNC_WAIT');return result;}
 if(stage==='SOURCE_FUND'){
  const state=await read(manifest.stateFile);validateG5State(state,manifest);const slot=state.orders.find((o:any)=>o.sequence===sequence);
  if(!slot||slot.orderId)throw Error('G5_SOURCE_ALREADY_ACCEPTED_RECONCILIATION_REQUIRED');
  const artifact=g5FundingArtifact(manifest.stateFile,state,sequence),original=manifest.stateFile+'.funding-'+sequence+'.json',admittedFile=sourceAdmittedPath(manifest.stateFile,slot);let fund=actor.fund;
  try{await lstat(privateLocalPath(admittedFile));throw Error('G5_SOURCE_ORIGINAL_ADMISSION_RECONCILIATION_REQUIRED');}catch(error){if((error as any).code!=='ENOENT')throw error;}
  if(artifact!==original){const index=fund.args.indexOf('--funding'),old=fund.args[index+1];if(index<0||g5PathIdentity(old)!==g5PathIdentity(original))throw Error('G5_SOURCE_FIXED_FUNDING_ARGV_REQUIRED');const current=old.slice(0,-5)+'-attempt-2.json';if(g5PathIdentity(current)!==g5PathIdentity(artifact))throw Error('G5_SOURCE_ATTEMPT_FUNDING_PATH_REQUIRED');fund={...fund,args:g5SourceFundingArgv(fund.args,old,current)};}
  return admitAndFundSource(sequence,{sync:()=>command(actor.sync),admit:()=>core('admit-source',sequence),
   recordAdmitted:async(result)=>{
    const accepted=await read(manifest.stateFile);validateG5State(accepted,manifest);const current=accepted.orders.find((o:any)=>o.sequence===sequence);
    if(!current?.orderId||current.owner!==slot.owner||current.receiver!==slot.receiver||Number(current.attempt??1)!==Number(slot.attempt??1)||g5FundingArtifact(manifest.stateFile,accepted,sequence)!==artifact||createHash('sha256').update(await readFile(privateLocalPath(artifact))).digest('hex')!==result.fundingSha256)throw Error('G5_SOURCE_ACCEPTED_FUNDING_BINDING_CHANGED');
    await durable(privateLocalPath(admittedFile),{version:1,status:'SOURCE_ADMITTED_PENDING_ONCE_ONLY_FUND',runId:accepted.runId,manifestBinding:accepted.binding,sequence,attempt:Number(current.attempt??1),epoch:result.epoch,fundingFile:artifact,fundingSha256:result.fundingSha256},true);
   },authorize:()=>core('source-fund-authority',sequence),fund:()=>command(fund)});
 }
 if(stage==='START')return core(sequence%2?'prepare-source':'start',sequence);
 if(stage==='VERIFY')return core('verify',sequence);
 if(stage==='BARRIER')return core('barrier',sequence);
 if(stage==='CLOSE')return core('close',sequence);
 if(stage.startsWith('PAYER_'))return payer(sequence,stage as G5LiveStage);
 if(stage==='OBSERVE_SOURCE')return sequence%2?core('observe',sequence):reverse('observe-funding',sequence);
 if(stage==='DISPATCH')return core('dispatch',sequence);
 if(stage==='PREPARE_ZCASH'){
  // A normal observer WAIT can occur after SDK durable calculation but before
  // DB import. An existing intent always selects the SDK's recover operation,
  // which only exports original bytes and never calculates a second payment.
  const rc=await read(manifest.reverseOrders.find((o:any)=>o.sequence===sequence).configFile),wallet=await read(rc.zcashPrivateConfig);
  try{await read(wallet.journalPath);}catch(error){if((error as any).code==='ENOENT')return reverse('prepare-zcash',sequence);throw error;}
  return reverse('recover-zcash',sequence);
 }
 const commands:Partial<Record<G5LiveStage,string>>={REVERSE_QUOTE:'quote',FUNDING_CALL:'funding',PREPARE_COMMIT:'prepare-commit',BROADCAST_COMMIT:'broadcast-commit',OBSERVE_COMMIT:'observe-commit',APPROVE_WALLET:'approve-wallet',PREPARE_ZCASH:'prepare-zcash',BROADCAST_ZCASH:'broadcast-zcash',OBSERVE_ZCASH:'observe-zcash',PREPARE_SETTLE:'prepare-settle',BROADCAST_SETTLE:'broadcast-settle',OBSERVE_SETTLE:'observe-settle'};
 if(!commands[stage as G5LiveStage])throw Error('G5_LIVE_UNKNOWN_STAGE');return reverse(commands[stage as G5LiveStage]!,sequence);
}
try{
 let state:G5LiveState;
 if(mode==='init'){state=initialG5LiveState(cfg.runId,binding,await snapshot());await durable(statePath,state,true);console.log(JSON.stringify({status:'G5_CONTROLLER_INITIALIZED',settledReceipts:2}));}
 else{
  state=await read(statePath);if(mode!=='status')validateG5LiveState(state,cfg.runId,binding);else if(state.runId!==cfg.runId||state.binding!==binding||state.version!==2)throw Error('G5_LIVE_STATUS_BINDING');
  if(mode==='status')console.log(JSON.stringify({status:'G5_CONTROLLER_STATUS',incident:state.incident,inflight:state.inflight,settledReceipts:state.slots.filter(s=>s.stage==='DONE').length,barriers:state.barriers,closed:state.closed,slots:state.slots}));
  else if(mode==='release-hold'){
   if(!arg||(!cfg.holds.includes(arg)&&!['ADMISSION_THROUGH_RELEASED','MAX_ACTIVE_FOUR_RELEASED'].includes(arg))||state.releasedHolds.includes(arg))throw Error('G5_LIVE_EXPLICIT_EXISTING_HOLD_REQUIRED');
   const snap=await snapshot();if(snap.incident||snap.reconciliationRequired)throw Error('G5_LIVE_HOLD_CORE_FROZEN');state.releasedHolds.push(arg);await durable(statePath,state);console.log(JSON.stringify({status:'G5_CONTROLLER_HOLD_RELEASED'}));
  }else{
   const result=await runG5LiveBounded(state,{maxSteps:cfg.maxSteps??30,maxMilliseconds:cfg.maxMilliseconds??60000,holds:cfg.holds,maxActive:cfg.maxActive,admissionThrough:cfg.admissionThrough},{now:()=>Date.now(),snapshot,save:s=>durable(statePath,s),execute,progress:p=>console.log(JSON.stringify({event:'G5_CONTROLLER_PROGRESS',...p}))});console.log(JSON.stringify(result));
   if(result.status==='UNKNOWN_OR_INCIDENT')process.exitCode=1;
  }
 }
}catch{console.error('G5_CONTROLLER_STOPPED_REVIEW_ORIGINAL_PRIVATE_STATE');process.exitCode=1;}
finally{await lock.close();await unlink(statePath+'.lock');}
