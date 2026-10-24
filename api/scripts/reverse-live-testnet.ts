import {readFile,mkdir,open,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {isAbsolute,resolve,dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {connect} from '../src/db.ts';
import {PrivateData} from '../src/private-data.ts';
import {BaseContract} from '../src/base-contract.ts';
import {LocalReverseBaseSigner} from '../src/base-signer.ts';
import {LocalReverseWalletAdapter} from '../src/reverse-wallet-adapter.ts';
import {escrowTerms} from '../src/base-escrow.ts';
import {reversePayoutTerms} from '../src/reverse-settlement.ts';
import {approvalDigest} from '../src/reverse-authority.ts';
import {validateLiveDispatchScope,type LiveRuntime} from '../src/live-dispatch-scope.ts';
import {approvedLiveReverseCapital} from '../src/live-reverse-capital.ts';
import {dispatchLiveReverseOnce,type LiveReverseState,type ReverseStep} from '../src/live-reverse-dispatch.ts';
import {isObserverWait} from '../src/observer-frontiers.ts';

export const wslPath=(path:string)=>{const p=path.replaceAll('\\','/');if(!/^[A-Za-z]:\//.test(p))throw Error('LIVE_REVERSE_DRIVE_PATH_REQUIRED');return `/mnt/${p[0]!.toLowerCase()}/${p.slice(3)}`;};
export function parseLiveReverseArgs(args:string[]){
 const path=args[0];if(!path||path.startsWith('--'))throw Error('EXPLICIT_LIVE_REVERSE_CONFIG_REQUIRED');
 const seen=new Set<string>();let once=false,retry=false,order:string|undefined,step:ReverseStep|undefined;
 for(let i=1;i<args.length;i++){
  const flag=args[i]!;if(!['--once','--order','--step','--retry-same-bytes'].includes(flag)||seen.has(flag))throw Error('INVALID_LIVE_REVERSE_ARGUMENTS');seen.add(flag);
  if(flag==='--once'){once=true;continue;}if(flag==='--retry-same-bytes'){retry=true;continue;}
  const value=args[++i];if(!value||value.startsWith('--'))throw Error('LIVE_REVERSE_ARGUMENT_VALUE_REQUIRED');
  if(flag==='--order'){if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value))throw Error('LIVE_REVERSE_ORDER_REQUIRED');order=value;}
  else{if(!['COMMIT','APPROVE_NATIVE','NATIVE','ACK_BASE','COMPLETE','WAIT_ORDER'].includes(value))throw Error('LIVE_REVERSE_STEP_REQUIRED');step=value as ReverseStep;}
 }
 if((step&&(!once||!order))||(retry&&(!once||!order||!step||!['COMMIT','NATIVE','ACK_BASE'].includes(step))))throw Error('EXPLICIT_SINGLE_ORDER_STEP_REQUIRED');
 return {path,once,order,step,retry};
}
export async function durablePrivate(path:string,value:unknown){
 const temp=path+'.'+randomUUID()+'.tmp',file=await open(temp,'wx',0o600);
 try{await file.writeFile(JSON.stringify(value,null,2));await file.sync();}finally{await file.close();}await rename(temp,path);
}
export async function loadLiveReverseConfig(path:string){
 if(!isAbsolute(path))throw Error('EXPLICIT_LIVE_REVERSE_CONFIG_REQUIRED');
 const c=JSON.parse(await readFile(path,'utf8'));
 if(c.mode!=='LIVE_TESTNET_REVERSE'||typeof c.enabled!=='boolean'||![5,10,15].includes(c.pollSeconds)||!Number.isSafeInteger(c.maxCycles)||c.maxCycles<1||c.maxCycles>1000||!/^[1-9][0-9]*$/.test(c.maxAmountZatoshi)||BigInt(c.maxAmountZatoshi)>200000n)throw Error('LIVE_REVERSE_CONFIG_SCOPE');
 for(const field of ['runtimePath','registryPath','signerConfigPath','orderRoot','repositoryRoot','openingProofPath'])if(!isAbsolute(c[field]))throw Error('LIVE_REVERSE_ABSOLUTE_PATH_REQUIRED');
 if(resolve(c.orderRoot)!==resolve(c.repositoryRoot,'.deploy-local/chef-testnet-20261023/reverse-orders'))throw Error('LIVE_REVERSE_PRIVATE_ROOT_REQUIRED');
 const runtime=JSON.parse(await readFile(c.runtimePath,'utf8')) as LiveRuntime,registry=JSON.parse(await readFile(c.registryPath,'utf8')),signer=JSON.parse(await readFile(c.signerConfigPath,'utf8'));
 validateLiveDispatchScope(runtime,registry,signer);
 if(c.walletDir!=='/home/albary/zeeswap-testnet-capital-20261023/reverse-capital'||c.operatorUfvkFile!=='/home/albary/zeeswap-testnet-capital-20261023/operator-testnet.ufvk'
  ||!/^[0-9a-f]{64}$/.test(c.capitalUfvkSha256)||c.walletDistro!=='Ubuntu-24.04'||c.baseDistro!=='Ubuntu')throw Error('LIVE_REVERSE_WALLET_SCOPE');
 return {c,runtime,registry,signer};
}
export async function reverseLiveTestnet(configPath:string,once:boolean,orderArgument?:string,requestedStep?:ReverseStep,retry=false){
 const {c,runtime,registry,signer}=await loadLiveReverseConfig(configPath);
 if(!c.enabled){console.log(JSON.stringify({status:'LIVE_REVERSE_DISABLED',financialAction:false}));return;}
 const pool=connect(runtime.workerUrl,4),keys=new PrivateData(Buffer.from(runtime.payloadKeyHex,'hex'),Buffer.from(runtime.lookupKeyHex,'hex')),base=new BaseContract(registry);
 const stop=new AbortController();process.once('SIGINT',()=>stop.abort());process.once('SIGTERM',()=>stop.abort());
 const directory=(id:string)=>join(c.orderRoot,id),file=(id:string,name:string)=>join(directory(id),name);
 const python='/home/albary/zeeswap-g1/reverse-python/bin/python',script=(name:string)=>wslPath(join(c.repositoryRoot,'workers/zcash-wallet',name));
 const nativeRead=[wslPath(join(c.repositoryRoot,'workers/zcash-wallet/verify/target/debug/zeeswap-wallet-read.exe'))];
 const sdkArgs=(id:string)=>['-d',c.walletDistro,'--exec','env','RAYON_NUM_THREADS=2',python,script('owned_wallet_call.py'),'--script',script('prepared_raw.py'),'--config',wslPath(file(id,'prepared.private.json'))];
 const receiptCommand=(id:string)=>['/mnt/c/Windows/System32/wsl.exe',...sdkArgs(id)];
 const baseSignerFor=async(state:LiveReverseState)=>{
  await mkdir(directory(state.orderId),{recursive:true,mode:0o700});
  const privatePath=file(state.orderId,'base-signer.private.json');
  await durablePrivate(privatePath,{...signer,reverseApprovedRequest:wslPath(file(state.orderId,'approved.private.json')),
   reverseApprovedDigest:state.approvedDigest??'0'.repeat(64),reverseReceiptCommand:receiptCommand(state.orderId)});
  return new LocalReverseBaseSigner('wsl.exe',['-d',c.baseDistro,'--exec','python3',script('owned_wallet_call.py'),'--kind','base-reverse','--script',wslPath(join(c.repositoryRoot,'workers/base-signer/reverse_signer.py')),'--config',wslPath(privatePath)],true);
 };
 const context={pool,keys,base,maxAmountZatoshi:c.maxAmountZatoshi,
  async load(id:string):Promise<LiveReverseState>{
   await mkdir(directory(id),{recursive:true,mode:0o700});
   try{return JSON.parse(await readFile(file(id,'state.private.json'),'utf8'));}catch(e){if((e as any).code!=='ENOENT')throw e;return {version:1,orderId:id};}
  },
  async save(state:LiveReverseState){await durablePrivate(file(state.orderId,'state.private.json'),state);},
  baseSigner:baseSignerFor,
  async wallet(state:LiveReverseState){if(!state.approvedDigest)throw Error('LIVE_REVERSE_APPROVAL_REQUIRED');return new LocalReverseWalletAdapter('wsl.exe',sdkArgs(state.orderId),state.approvedDigest,true);},
  async nativeJournal(state:LiveReverseState){try{const journal=JSON.parse(await readFile(file(state.orderId,'payout-intent.private.json'),'utf8'));return {exists:true,broadcast:['BROADCAST_UNKNOWN','BROADCAST_ACKNOWLEDGED','DELIVERY_CONFIRMED'].includes(journal.state)};}catch(e){if((e as any).code!=='ENOENT')throw e;return {exists:false,broadcast:false};}},
  async approve(state:LiveReverseState){
   const id=state.orderId,terms=await escrowTerms(pool,keys,base,id),q=await reversePayoutTerms(pool,keys,id);
   const row=(await pool.query('SELECT * FROM zee.escrow_commits WHERE order_id=$1 AND confirmed',[id])).rows[0];if(!row)throw Error('FINALIZED_LIVE_COMMIT_REQUIRED');
   const proof=keys.open(row.receipt_payload,`escrow-proof:${id}:v1`) as any;
   const approved={version:1,orderId:id,settlementId:terms.id,recipient:q.recipient,amountZatoshi:q.amountZatoshi,maxFeeZatoshi:q.maxFeeZatoshi,
    base:{chainId:84532,contract:registry.contracts.ZeeSwapSettlement.address,token:terms.token,payer:terms.payer,refundRecipient:terms.refundRecipient,amountAtomic:terms.amount,
     cancellationAvailableAt:terms.cancellationAvailableAt,commitTxHash:proof.transactionHash,commitBlockNumber:String(proof.blockHeight),commitBlockHash:proof.blockHash}};
   const digest=approvalDigest(approved);if(state.approvedDigest&&state.approvedDigest!==digest)throw Error('LIVE_REVERSE_APPROVAL_CONFLICT');
   const approvedPath=file(id,'approved.private.json');
   try{if(approvalDigest(JSON.parse(await readFile(approvedPath,'utf8')))!==digest)throw Error('LIVE_REVERSE_EXISTING_APPROVAL_CHANGED');}catch(e){if((e as any).code!=='ENOENT')throw e;await durablePrivate(approvedPath,approved);}
   const capital=await approvedLiveReverseCapital(pool,keys,c.capitalSources);
   const preflightPath=file(id,'preflight.private.json');await durablePrivate(preflightPath,{readCommand:nativeRead,rpcUrl:registry.rpcUrl,hashCommand:['/home/albary/.foundry/bin/cast','keccak']});
   const guardPath=file(id,'guard.private.json');await durablePrivate(guardPath,{configPath:resolve(configPath),orderId:id,statePath:file(id,'state.private.json'),approvedRequest:approvedPath,approvedDigest:digest});
   const preparedConfig={walletDir:c.walletDir,cliCommand:['/home/albary/zeeswap-g1/tools/zcash-devtool/target/release/zingo-cli'],readCommand:nativeRead,
    verifyCommand:['/home/albary/zeeswap-g1/tools/zcash-devtool/target/debug/zeeswap-g1-verify'],protoDir:wslPath(join(c.repositoryRoot,'.deploy-local/g1-proto')),
    approvedRequest:wslPath(approvedPath),approvedDigest:digest,approvedCapitalNotes:capital,capitalUfvkSha256:c.capitalUfvkSha256,
    recipientProofMode:'operator-outgoing-recovery',operatorUfvkFile:c.operatorUfvkFile,
    lockPath:'/home/albary/zeeswap-testnet-capital-20261023/operator-wallet.lock',journalPath:wslPath(file(id,'payout-intent.private.json')),
    preflightCommand:[python,script('reverse_preflight.py'),'--config',wslPath(preflightPath),'--approved-request',wslPath(approvedPath),'--approved-digest',digest,'--registry',wslPath(c.registryPath)],
    beforeBroadcastGuardCommand:[wslPath(process.execPath),'--import',pathToFileURL(join(c.repositoryRoot,'api/node_modules/tsx/dist/loader.mjs')).href,join(c.repositoryRoot,'api/scripts/reverse-live-broadcast-guard.ts'),guardPath]};
   const configFile=file(id,'prepared.private.json');
   try{const old=JSON.parse(await readFile(configFile,'utf8'));if(old.approvedDigest!==digest)throw Error('LIVE_REVERSE_NATIVE_CONFIG_ALREADY_BOUND');}
   catch(e){if((e as any).code!=='ENOENT')throw e;await durablePrivate(configFile,preparedConfig);}
   state.approvedDigest=digest;await context.save(state);await baseSignerFor(state);
  }
 };
 let cycles=0;
 try{
  do{
   const orderId=orderArgument??(await pool.query(`SELECT o.id FROM zee.orders o JOIN zee.quotes q USING(id) WHERE q.direction='BASE_TO_ZCASH' AND q.execution_mode='base-escrow-v1' AND o.state='READY' ORDER BY o.accepted_at,o.id LIMIT 1`)).rows[0]?.id;
   if(!orderId)console.log(JSON.stringify({status:'WAIT_REVERSE_ORDER'}));
   else try{const result=await dispatchLiveReverseOnce(context,orderId,requestedStep,retry);console.log(JSON.stringify({event:'live-reverse-step',...result}));if(orderArgument&&['COMPLETE','SETTLED'].includes(result.status))break;}
   catch(error){if(isObserverWait(error))console.log(JSON.stringify({status:'WAIT_OBSERVER'}));else throw error;}
   cycles++;if(cycles>=c.maxCycles){console.log(JSON.stringify({status:'LIVE_REVERSE_CYCLE_LIMIT'}));break;}
   if(!once&&!stop.signal.aborted)await delay(c.pollSeconds*1000,undefined,{signal:stop.signal}).catch(()=>{});
  }while(!once&&!stop.signal.aborted);
 }finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{const args=parseLiveReverseArgs(process.argv.slice(2));
  await reverseLiveTestnet(args.path,args.once,args.order,args.step,args.retry);
 }catch{console.error(JSON.stringify({status:'LIVE_REVERSE_BLOCKED_RECONCILE',financialActionMayBeJournaled:true}));process.exitCode=1;}
}
