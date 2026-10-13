import { spawn } from 'node:child_process';

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
   const fail=()=>{if(!settled){settled=true;reject(new Error('WALLET_UNAVAILABLE'));}};
   const timeout=setTimeout(()=>{child.kill();fail();},200_000);
   child.on('error',fail);child.stdout.on('data',data=>{stdout+=data;if(stdout.length>4_000_000){child.kill();fail();}});
   child.stderr.on('data',data=>{stderr+=data;if(stderr.length>10000){child.kill();fail();}});
   child.on('close',code=>{clearTimeout(timeout);if(settled)return;if(code!==0){fail();return;}
    try{const data=JSON.parse(stdout);settled=true;resolve(data);}catch{fail();}});
   child.stdin.on('error',fail);child.stdin.end(JSON.stringify(request));
  });
 }
 async validate(address:string){const r=await this.invoke({command:'validate',address});if(r.network!=='zcash-testnet'||r.shielded!==true)throw new Error('INVALID_ZCASH_RECEIVER');return r.receiver as string;}
 async allocate(){const r=await this.invoke({command:'allocate'});if(r.network!=='zcash-testnet'||r.shielded!==true)throw new Error('INVALID_ZCASH_RECEIVER');return r.receiver as string;}
 snapshot(checkHeights:number[]){return this.invoke({command:'snapshot',checkHeights});}
}
