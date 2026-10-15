import { spawn } from 'node:child_process';
import {walletAdapterFailure,walletChildFailure,walletScannerDiagnostic} from './wallet-scanner-protocol.ts';

export interface WalletAdapter {
 validate(address:string):Promise<string>;
 allocate():Promise<string>;
 snapshot(checkHeights:number[]):Promise<unknown>;
}
export class LocalWalletAdapter implements WalletAdapter {
 constructor(private readonly command:string,private readonly args:string[]) {}
 private invoke(request:unknown):Promise<any> {
  return new Promise((resolve,reject)=>{
   const child=spawn(this.command,this.args,{stdio:['pipe','pipe','pipe'],windowsHide:true});
   let stdout='',stderr='',settled=false;
   const command=(request as any)?.command;
   const fail=(error:Error)=>{if(!settled){settled=true;clearTimeout(timeout);reject(error);}};
   const timeout=setTimeout(()=>{child.kill();fail(walletAdapterFailure(command,'ADAPTER_TIMEOUT','WALLET_ADAPTER_TIMEOUT_RECONCILE'));},200_000);
   child.on('error',()=>fail(walletAdapterFailure(command,'ADAPTER_SPAWN','WALLET_ADAPTER_SPAWN_RECONCILE')));
   child.stdout.on('data',data=>{stdout+=data;if(stdout.length>4_000_000){child.kill();fail(walletAdapterFailure(command,'ADAPTER_OUTPUT','WALLET_ADAPTER_OUTPUT_RECONCILE'));}});
   child.stderr.on('data',data=>{stderr+=data;if(stderr.length>10000){child.kill();fail(walletAdapterFailure(command,'ADAPTER_OUTPUT','WALLET_ADAPTER_OUTPUT_RECONCILE'));}});
   child.on('close',(code,signal)=>{clearTimeout(timeout);if(settled)return;if(code!==0||signal){fail(walletChildFailure(stdout,command,code,signal));return;}
    try{const data=JSON.parse(stdout);
     if(walletScannerDiagnostic(data)){fail(walletAdapterFailure(command,'ADAPTER_PROTOCOL','WALLET_PROTOCOL_MISMATCH_RECONCILE',true));return;}
     settled=true;resolve(data);
    }catch{fail(walletAdapterFailure(command,'ADAPTER_PROTOCOL','WALLET_PROTOCOL_MISMATCH_RECONCILE',true));}});
   child.stdin.on('error',()=>fail(walletAdapterFailure(command,'ADAPTER_STDIN','WALLET_ADAPTER_STDIN_RECONCILE')));child.stdin.end(JSON.stringify(request));
  });
 }
 async validate(address:string){const r=await this.invoke({command:'validate',address});if(r.network!=='zcash-testnet'||r.shielded!==true)throw new Error('INVALID_ZCASH_RECEIVER');return r.receiver as string;}
 async allocate(){const r=await this.invoke({command:'allocate'});if(r.network!=='zcash-testnet'||r.shielded!==true)throw new Error('INVALID_ZCASH_RECEIVER');return r.receiver as string;}
 snapshot(checkHeights:number[]){return this.invoke({command:'snapshot',checkHeights});}
}
