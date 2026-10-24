import{readFile,mkdir}from'node:fs/promises';
import{isAbsolute,resolve,join}from'node:path';
import{fileURLToPath,pathToFileURL}from'node:url';
import{setTimeout as delay}from'node:timers/promises';
import{connect}from'../src/db.ts';
import{PrivateData}from'../src/private-data.ts';
import{BaseContract,type BaseRegistry}from'../src/base-contract.ts';
import{LocalBaseSigner,type PreparedBaseTransaction}from'../src/base-signer.ts';
import{LocalReverseWalletAdapter}from'../src/reverse-wallet-adapter.ts';
import{approvalDigest}from'../src/reverse-authority.ts';
import{validateLiveDispatchScope,type LiveRuntime,type LiveBaseSignerConfig}from'../src/live-dispatch-scope.ts';
import{approvedLiveReverseCapital}from'../src/live-reverse-capital.ts';
import{dispatchLiveRefundOnce,type LiveRefundState}from'../src/live-source-refund.ts';
import{durablePrivate,wslPath}from'./reverse-live-testnet.ts';

export async function loadLiveRefundConfig(path:string){
 if(!isAbsolute(path))throw Error('EXPLICIT_LIVE_REFUND_CONFIG_REQUIRED');
 const c=JSON.parse(await readFile(path,'utf8'));
 if(c.mode!=='LIVE_TESTNET_SOURCE_REFUND'||typeof c.enabled!=='boolean'||![5,10].includes(c.pollSeconds)||!Number.isSafeInteger(c.maxCycles)||c.maxCycles<1||c.maxCycles>1000)throw Error('WRONG_LIVE_REFUND_SCOPE');
 for(const name of['runtimePath','registryPath','signerConfigPath','orderRoot','repositoryRoot'])if(!isAbsolute(c[name]))throw Error('LIVE_REFUND_ABSOLUTE_PATH_REQUIRED');
 if(resolve(c.orderRoot)!==resolve(c.repositoryRoot,'.deploy-local/chef-testnet-20261023/refund-orders')||c.walletDir!=='/home/albary/zeeswap-testnet-capital-20261023/reverse-capital'
  ||c.operatorUfvkFile!=='/home/albary/zeeswap-testnet-capital-20261023/operator-testnet.ufvk'||!/^[0-9a-f]{64}$/.test(c.capitalUfvkSha256)||c.walletDistro!=='Ubuntu-24.04'||c.baseDistro!=='Ubuntu')throw Error('LIVE_REFUND_PRIVATE_WALLET_SCOPE');
 const runtime=JSON.parse(await readFile(c.runtimePath,'utf8'))as LiveRuntime,registry=JSON.parse(await readFile(c.registryPath,'utf8'))as BaseRegistry,signer=JSON.parse(await readFile(c.signerConfigPath,'utf8'))as LiveBaseSignerConfig;
 validateLiveDispatchScope(runtime,registry,signer);return{c,runtime,registry,signer};
}
class OwnedCancelSigner extends LocalBaseSigner{prepareCancellation():Promise<PreparedBaseTransaction>{return this.invoke({command:'prepare'});}}
export async function runLiveRefund(path:string,orderId:string,once:boolean,retry=false){
 const{c,runtime,registry,signer}=await loadLiveRefundConfig(path);if(!c.enabled)return{status:'LIVE_SOURCE_REFUND_DISABLED',financialAction:false};
 if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(orderId))throw Error('EXPLICIT_LIVE_REFUND_ORDER_REQUIRED');
 const pool=connect(runtime.workerUrl,3),keys=new PrivateData(Buffer.from(runtime.payloadKeyHex,'hex'),Buffer.from(runtime.lookupKeyHex,'hex')),base=new BaseContract(registry);
 const directory=join(c.orderRoot,orderId);await mkdir(directory,{recursive:true,mode:0o700});const file=(name:string)=>join(directory,name),script=(name:string)=>wslPath(join(c.repositoryRoot,'workers/zcash-wallet',name));
 const nativePython='/home/albary/zeeswap-g1/reverse-python/bin/python',nativeRead=[wslPath(join(c.repositoryRoot,'workers/zcash-wallet/verify/target/debug/zeeswap-wallet-read.exe'))];
 const sdkArgs=['-d',c.walletDistro,'--exec','env','RAYON_NUM_THREADS=2',nativePython,script('owned_wallet_call.py'),'--kind','native','--script',script('live_refund_raw.py'),'--config',wslPath(file('prepared.private.json'))];
 const context={pool,keys,base,
  async load(id:string):Promise<LiveRefundState>{try{return JSON.parse(await readFile(file('state.private.json'),'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;return{version:1,orderId:id};}},
  async save(state:LiveRefundState){await durablePrivate(file('state.private.json'),state);},
  async prepareCancel(state:LiveRefundState,source:any){
   const approved={version:1,kind:'SOURCE_REFUND_BASE',orderId,id:source.id,phase:'CANCEL',token:registry.contracts.MockUSDC.address,payer:registry.operator,refundRecipient:registry.operator,amount:source.row.received_amount,cancellationAvailableAt:'0'};
   const digest=approvalDigest(approved);if(state.baseApprovedDigest&&state.baseApprovedDigest!==digest)throw Error('IMMUTABLE_LIVE_CANCEL_APPROVAL_CONFLICT');
   const approvedPath=file('cancel-approved.private.json');try{if(approvalDigest(JSON.parse(await readFile(approvedPath,'utf8')))!==digest)throw Error('IMMUTABLE_LIVE_CANCEL_FILE_CONFLICT');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;await durablePrivate(approvedPath,approved);}
   const privateConfig=file('cancel-signer.private.json');await durablePrivate(privateConfig,{...signer,refundApprovedRequest:wslPath(approvedPath),refundApprovedDigest:digest});state.baseApprovedDigest=digest;await context.save(state);
   return new OwnedCancelSigner('wsl.exe',['-d',c.baseDistro,'--exec','python3',script('owned_wallet_call.py'),'--kind','base-refund','--script',wslPath(join(c.repositoryRoot,'workers/base-signer/refund_signer.py')),'--config',wslPath(privateConfig)],120000,true).prepareCancellation();
  },
  async approveNative(state:LiveRefundState,row:any,source:any){
   if(!c.capitalSources?.some((entry:any)=>entry.kind==='refund-source'&&entry.orderId===orderId))throw Error('REFUND_SOURCE_PROOF_APPROVAL_REQUIRED');
   const capital=await approvedLiveReverseCapital(pool,keys,c.capitalSources,orderId);
   const approved={version:1,kind:'ZCASH_SOURCE_REFUND',orderId,depositId:source.row.deposit_id,settlementId:source.id,recipient:source.recipient,amountZatoshi:source.row.received_amount,maxFeeZatoshi:source.row.refund_fee,
    base:{chainId:84532,contract:registry.contracts.ZeeSwapSettlement.address,token:registry.contracts.MockUSDC.address,cancelTxHash:state.basePreparedHash??(keys.open(row.base_payload,`source-refund:${orderId}:CANCEL:v1`)as PreparedBaseTransaction).hash,cancelBlockNumber:String(row.base_height),cancelBlockHash:'0x'+row.base_block}};
   const digest=approvalDigest(approved);if(state.approvedDigest&&state.approvedDigest!==digest)throw Error('IMMUTABLE_LIVE_NATIVE_REFUND_APPROVAL_CONFLICT');
   const approvedPath=file('approved.private.json');try{if(approvalDigest(JSON.parse(await readFile(approvedPath,'utf8')))!==digest)throw Error('IMMUTABLE_LIVE_NATIVE_REFUND_FILE_CONFLICT');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;await durablePrivate(approvedPath,approved);}
   const preflight=file('preflight.private.json');await durablePrivate(preflight,{readCommand:nativeRead,rpcUrl:registry.rpcUrl,hashCommand:['/home/albary/.foundry/bin/cast','keccak']});
   const guard=file('guard.private.json');await durablePrivate(guard,{configPath:resolve(path),orderId,statePath:file('state.private.json'),approvedRequest:approvedPath,approvedDigest:digest});
   const preparedConfig={liveProfile:'zeeswap-app-20261023',walletDir:c.walletDir,cliCommand:['/home/albary/zeeswap-g1/tools/zcash-devtool/target/release/zingo-cli'],readCommand:nativeRead,
    verifyCommand:['/home/albary/zeeswap-g1/tools/zcash-devtool/target/debug/zeeswap-g1-verify'],protoDir:wslPath(join(c.repositoryRoot,'.deploy-local/g1-proto')),approvedRequest:wslPath(approvedPath),approvedDigest:digest,approvedCapitalNotes:capital,capitalUfvkSha256:c.capitalUfvkSha256,
    recipientProofMode:'operator-outgoing-recovery',operatorUfvkFile:c.operatorUfvkFile,lockPath:'/home/albary/zeeswap-testnet-capital-20261023/operator-wallet.lock',journalPath:wslPath(file('refund-intent.private.json')),
    preflightCommand:[nativePython,script('refund_preflight.py'),'--config',wslPath(preflight),'--approved-request',wslPath(approvedPath),'--approved-digest',digest,'--registry',wslPath(c.registryPath)],
    beforeBroadcastGuardCommand:[wslPath(process.execPath),'--import',pathToFileURL(join(c.repositoryRoot,'api/node_modules/tsx/dist/loader.mjs')).href,join(c.repositoryRoot,'api/scripts/refund-live-broadcast-guard.ts'),guard]};
   const output=file('prepared.private.json');try{if(JSON.parse(await readFile(output,'utf8')).approvedDigest!==digest)throw Error('LIVE_REFUND_PREPARED_CONFIG_BOUND');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;await durablePrivate(output,preparedConfig);}
   state.approvedDigest=digest;await context.save(state);
  },
  async wallet(state:LiveRefundState){if(!state.approvedDigest)throw Error('LIVE_REFUND_APPROVAL_REQUIRED');return new LocalReverseWalletAdapter('wsl.exe',sdkArgs,state.approvedDigest,true);},
  async nativeJournal(_state:LiveRefundState){try{const journal=JSON.parse(await readFile(file('refund-intent.private.json'),'utf8'));return{exists:true,broadcast:['BROADCAST_UNKNOWN','BROADCAST_ACKNOWLEDGED','DELIVERY_CONFIRMED'].includes(journal.state)};}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;return{exists:false,broadcast:false};}}
 };
 const stop=new AbortController();process.once('SIGINT',()=>stop.abort());process.once('SIGTERM',()=>stop.abort());let cycles=0;
 try{do{const result=await dispatchLiveRefundOnce(context,orderId,retry);console.log(JSON.stringify({event:'live-source-refund',...result}));cycles++;if(once||result.status==='REFUNDED'||cycles>=c.maxCycles)break;if(!stop.signal.aborted)await delay(c.pollSeconds*1000,undefined,{signal:stop.signal}).catch(()=>{});}while(!stop.signal.aborted);return{status:'LIVE_REFUND_WORKER_STOPPED'};}
 finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{const args=process.argv.slice(2);if(!args[0]||!args[1]||args.slice(2).some(arg=>!['--once','--retry-same-bytes'].includes(arg)))throw Error('EXPLICIT_LIVE_REFUND_ARGUMENTS_REQUIRED');console.log(JSON.stringify(await runLiveRefund(args[0],args[1],args.includes('--once'),args.includes('--retry-same-bytes'))));}
 catch{console.error(JSON.stringify({status:'LIVE_REFUND_BLOCKED_RECONCILE_ORIGINAL_JOURNAL',financialActionMayBeJournaled:true}));process.exitCode=1;}}
