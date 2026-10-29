import {spawn} from 'node:child_process';
import {pinnedExecutable,pinnedFile,type FilePin} from './profile.ts';
import {nativeDigest,nativeAuthorityOrder,type NativeBridgeRequest} from './native-authority.ts';
import type {Order} from '../model.ts';

export type NativeCommand='capital'|'prepare'|'recover'|'broadcast'|'receipt';
export type NativeCommandProfile={python:FilePin;worker:FilePin;profile:FilePin;approvedRequest:FilePin;approvedDigest:string;ownedSupervisor?:FilePin};
export function nativeJsonProcess(python:string,args:string[],payload:unknown,supervised=false):Promise<unknown>{
 const env=Object.fromEntries(['PATH','HOME','LANG'].flatMap(k=>process.env[k]===undefined?[]:[[k,process.env[k]!] ]));
 return new Promise((resolve,reject)=>{
  const child=spawn(python,args,{env,stdio:['pipe','pipe','pipe'],windowsHide:true});let output=Buffer.alloc(0),failed=false;
  const refuse=()=>{if(!failed){failed=true;if(!supervised){child.kill('SIGKILL');reject(Error('BRIDGE_NATIVE_UNAVAILABLE_RECONCILE_ORIGINAL'));}}};
  // The owned supervisor alone controls financial child timeout/reaping. An
  // outer kill must not abandon its proving descendants or release their lock.
  const timer=supervised?undefined:setTimeout(refuse,1200000);child.on('error',()=>{refuse();reject(Error('BRIDGE_NATIVE_UNAVAILABLE_RECONCILE_ORIGINAL'));});child.stdin.on('error',refuse);child.stderr.resume();
  child.stdout.on('data',(chunk:Buffer)=>{if(output.length+chunk.length>2*1024*1024){refuse();return;}output=Buffer.concat([output,chunk]);});
  child.on('close',code=>{if(timer)clearTimeout(timer);if(failed||code!==0){if(!failed)refuse();reject(Error('BRIDGE_NATIVE_UNAVAILABLE_RECONCILE_ORIGINAL'));return;}try{resolve(JSON.parse(output.toString('utf8')));}catch{refuse();reject(Error('BRIDGE_NATIVE_UNAVAILABLE_RECONCILE_ORIGINAL'));}});
  child.stdin.end(JSON.stringify(payload));
 });
}
/** Per-order production pipe, not a scanner or automatic signer qualification.
 * Native code retains its own protected profile, approval and fsync journal checks.
 * No shell, inherited credentials, automatic retries, or error output disclosure. */
export class NativeBridgeCommand {
 constructor(readonly pins:NativeCommandProfile){}
 async run(command:NativeCommand,order:Readonly<Order>):Promise<unknown>{
  if(process.platform!=='linux'||!process.getuid?.())throw Error('BRIDGE_NATIVE_DEDICATED_LINUX_REQUIRED');
  if(!['capital','prepare','recover','broadcast','receipt'].includes(command))throw Error('BRIDGE_NATIVE_COMMAND');
  await pinnedExecutable(this.pins.python);await pinnedFile(this.pins.worker);
  const profile=JSON.parse((await pinnedFile(this.pins.profile,true)).toString());
  const request=JSON.parse((await pinnedFile(this.pins.approvedRequest,true)).toString()) as NativeBridgeRequest;
  nativeAuthorityOrder(request,this.pins.approvedDigest);
  if(profile.approvedDigest!==this.pins.approvedDigest||nativeDigest(profile.approvedRequest)!==nativeDigest(this.pins.approvedRequest)||request.orderId!==order.id||request.bridgeId!==order.commitment||request.salt!==order.salt||request.amountZatoshi!==order.amountAtomic||request.recipient!==(order.deliveryKind==='REFUND'?order.refundRecipient:order.recipient)||profile.serviceUid!==process.getuid!())throw Error('BRIDGE_NATIVE_APPROVED_ORDER_BINDING');
  if(this.pins.ownedSupervisor){await pinnedFile(this.pins.ownedSupervisor);return nativeJsonProcess(this.pins.python.path,[this.pins.ownedSupervisor.path,'--kind','bridge','--script',this.pins.worker.path,'--config',this.pins.profile.path,'--profile-sha256',this.pins.profile.sha256],{command},true);}
  if(['prepare','broadcast'].includes(command))throw Error('BRIDGE_OWNED_SUPERVISOR_REQUIRED');
  return nativeJsonProcess(this.pins.python.path,[this.pins.worker.path,'--profile',this.pins.profile.path,'--profile-sha256',this.pins.profile.sha256],{command});
 }
}
