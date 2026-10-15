import {parsePhysicalCaptureDiagnostics} from '../src/g5-physical-diagnostic.ts';
import {spawn} from 'node:child_process';
import {read} from './g5-context.ts';
import {g5PathIdentity,requireG5CommandConfig} from '../src/g5-run.ts';
export async function captureG5WalletPartition(c:any){
 if(typeof c.config.balanceProofCommand!=='string'||!Array.isArray(c.config.balanceProofArgs)||!c.config.balanceProofFile)throw Error('G5_FIXED_BALANCE_CAPTURE_REQUIRED');

 requireG5CommandConfig(c.config.balanceProofArgs,c.config.balanceCaptureConfigFile);
 const capture=await read(c.config.balanceCaptureConfigFile);
 const capturedView=await read(capture.deposit?.config),actualView=await read(c.config.walletConfig);
 // Windows's local scanner invokes WSL and uses Windows proto/lock paths;
 // the Linux capture config has direct CLI/proto paths. They must identify the
 // same wallet and the same scanner sentinel through the mounted filesystem.
 if(capture.runId!==c.state.runId||capture.reverse?.length!==10||g5PathIdentity(capturedView.walletDir)!==g5PathIdentity(actualView.walletDir)
  ||g5PathIdentity(capturedView.lockPath)!==g5PathIdentity(actualView.lockPath)||capture.deposit?.ufvkSha256!==c.config.depositUfvkSha256)throw Error('G5_PHYSICAL_CAPTURE_CONFIG_BINDING');
 for(let i=0;i<10;i++){
  const operator=await read(c.config.reverseOrders[i].configFile);requireG5CommandConfig(operator.zcashArgs,operator.zcashPrivateConfig);
  if(capture.reverse[i].sequence!==c.config.reverseOrders[i].sequence||g5PathIdentity(capture.reverse[i].config)!==g5PathIdentity(operator.zcashPrivateConfig))throw Error('G5_PHYSICAL_CAPTURE_CONFIG_BINDING');
 }
 if(c.state.batchSize&&g5PathIdentity(capture.feeCapital?.config)!==g5PathIdentity(c.config.extraFeeWalletConfig))throw Error('G5_PHYSICAL_FEE_CAPTURE_CONFIG_BINDING');

 await runG5PhysicalCaptureProcess(c.config.balanceProofCommand,c.config.balanceProofArgs);
}

/** Fixed physical-capture child boundary; retained diagnostics are sanitized
 * before the error leaves this function. No raw stderr is attached. */
export async function runG5PhysicalCaptureProcess(command:string,args:string[]){
 await new Promise<void>((resolve,reject)=>{
  const child=spawn(command,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});let size=0,stderr='';
  const failure=(code:string)=>Object.assign(Error(code),{physicalCaptureDiagnostic:parsePhysicalCaptureDiagnostics(stderr)});
  const timer=setTimeout(()=>{child.kill();reject(failure('G5_PHYSICAL_CAPTURE_TIMEOUT'));},300000);
  child.on('error',()=>{clearTimeout(timer);reject(failure('G5_PHYSICAL_CAPTURE_FAILED'));});child.stdout.on('data',b=>{size+=b.length;if(size>32768)child.kill();});child.stderr.on('data',b=>{if(stderr.length<32768)stderr=(stderr+b.toString()).slice(0,32768);});
  child.on('close',code=>{clearTimeout(timer);if(code===0&&size<=32768)resolve();else reject(failure('G5_PHYSICAL_CAPTURE_FAILED'));});
 });
}
