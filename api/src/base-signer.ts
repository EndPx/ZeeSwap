import {ObserverWaitError} from './observer-frontiers.ts';
import {signerBinding,signerReadWait,signerWaitEvidence,parseSignerPackets,signerFailureDiagnostic,validSignerReply} from './base-signer-protocol.ts';
import { spawn } from 'node:child_process';
import { keccak256, parseTransaction, recoverTransactionAddress, recoverTypedDataAddress, getAddress, type Hex, type TransactionSerialized } from 'viem';
import { payoutCall, payoutTypedData, type BaseRegistry, type PayoutTerms, type BasePhase } from './base-contract.ts';

export interface PreparedBaseTransaction {raw:Hex;hash:Hex;nonce:number;maxCost:string}
export interface BaseSigner {
 authorize(terms:PayoutTerms):Promise<Hex>;
 prepare(terms:PayoutTerms,phase:BasePhase):Promise<PreparedBaseTransaction>;
}
export class LocalBaseSigner implements BaseSigner {
 constructor(private readonly command:string,private readonly args:string[],private readonly timeoutMs=120000){}
 protected invoke(request:unknown):Promise<any>{return new Promise((resolve,reject)=>{
  const binding=signerBinding(request),child=spawn(this.command,this.args,{stdio:['pipe','pipe','pipe'],windowsHide:true});let output='',stderr='',done=false;
  let timer:ReturnType<typeof setTimeout>;
  const diagnostic=(code:string,exitCode:number|null=null,signal:string|null=null)=>{const packets=parseSignerPackets(stderr,binding);return signerFailureDiagnostic({version:1,...binding,code,exitCode,signal,python:packets.primary,cleanup:packets.cleanup})!;};
  const fail=(code:string,exitCode:number|null=null,signal:string|null=null)=>{if(!done){done=true;clearTimeout(timer);const safe=diagnostic(code,exitCode,signal);try{console.error(JSON.stringify({version:1,status:'BASE_SIGNER_INVOKE_FAILED',diagnostic:safe}));}catch{}reject(Object.assign(Error('BASE_SIGNER_UNAVAILABLE'),{signerDiagnostic:safe}));}};
  timer=setTimeout(()=>{child.kill();fail('SIGNER_TIMEOUT');},this.timeoutMs);
  child.on('error',()=>fail('SIGNER_SPAWN_FAILED'));child.stdin.on('error',()=>fail('SIGNER_STDIN_FAILED'));
  child.stdout.on('data',chunk=>{output=(output+chunk).slice(0,32769);if(output.length>32768){child.kill();fail('SIGNER_OUTPUT_LIMIT');}});
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(0,8193);if(stderr.length>8192){child.kill();fail('SIGNER_STDERR_LIMIT');}});
  child.on('close',(code,signal)=>{clearTimeout(timer);if(done)return;
   let result:any;try{result=JSON.parse(output);}catch{fail(signal?'SIGNER_SIGNAL':code===0?'SIGNER_RESPONSE_INVALID':'SIGNER_PROCESS_EXIT',code,signal);return;}
   if((code===75&&result?.status==='BASE_SIGNER_READ_WAIT'||code===76&&result?.status==='BASE_SIGNER_FINALITY_WAIT')&&signal===null&&signerReadWait(result,binding)&&signerWaitEvidence(stderr,result,binding)){
    done=true;const error=new ObserverWaitError({event:'base-signer-read',source:'forward-base-signer',status:'WAIT',network:'base-sepolia',reason:code===76?'RESERVE_AHEAD_OF_FINALIZED':'READ_TIMEOUT',command:binding.command,phase:binding.phase,requestDigest:binding.requestDigest,stage:result.stage});
    Object.assign(error,{signerDiagnostic:diagnostic(code===76?'SIGNER_FINALITY_WAIT':'SIGNER_READ_WAIT',code,signal)});reject(error);return;
   }
   if(code!==0||signal!==null){fail(signal?'SIGNER_SIGNAL':'SIGNER_PROCESS_EXIT',code,signal);return;}
   if(!validSignerReply(result,request)){fail('SIGNER_RESPONSE_INVALID',code,signal);return;}
   done=true;resolve(result);
  });
  child.stdin.end(JSON.stringify(request));
 });}
 async authorize(terms:PayoutTerms){return (await this.invoke({command:'authorize',terms,phase:'RESERVE'})).signature as Hex;}
 prepare(terms:PayoutTerms,phase:BasePhase){return this.invoke({command:'prepare',terms,phase});}
}
export class LocalReverseBaseSigner extends LocalBaseSigner {
 constructor(command:string,args:string[]){super(command,args,360000);}
 async authorizeFunding(terms:import('./base-escrow.ts').FundingTerms){return (await this.invoke({command:'authorize',terms,phase:'FUNDING'})).signature as Hex;}
 prepareEscrow(terms:import('./base-escrow.ts').FundingTerms,phase:'COMMIT'|'SETTLE'):Promise<PreparedBaseTransaction>{return this.invoke({command:'prepare',terms,phase});}
}
export async function validatePrepared(registry:BaseRegistry,terms:PayoutTerms,signature:Hex,phase:BasePhase,prepared:PreparedBaseTransaction){
 if(getAddress(await recoverTypedDataAddress({...payoutTypedData(registry,terms),signature}))!==getAddress(registry.operator))throw Error('INVALID_BASE_SIGNATURE');
 const tx=parseTransaction(prepared.raw);
 if(tx.type!=='legacy'||keccak256(prepared.raw)!==prepared.hash||!Number.isSafeInteger(prepared.nonce)||prepared.nonce<0||tx.nonce!==prepared.nonce||tx.chainId!==84532
  ||getAddress(await recoverTransactionAddress({serializedTransaction:prepared.raw as TransactionSerialized}))!==getAddress(registry.operator)
  ||tx.to?.toLowerCase()!==registry.contracts.ZeeSwapSettlement.address.toLowerCase()||(tx.value??0n)!==0n
  ||tx.data!==payoutCall(registry,terms,signature,phase)||!tx.gas||tx.gas>450000n)throw Error('INVALID_SIGNED_TRANSACTION');
 const gasPrice=tx.gasPrice;
 if(!gasPrice||gasPrice>20000000n||!/^[1-9][0-9]*$/.test(prepared.maxCost)||BigInt(prepared.maxCost)>10000000000000n||tx.gas*gasPrice>BigInt(prepared.maxCost))throw Error('INVALID_SIGNER_FEE_CAP');
}
