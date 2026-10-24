/** Private native receipt provenance only. This never approves capital/books. */
import {mkdir,lstat,realpath,open,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {validateSnapshot,type Snapshot} from '../../observer.ts';
import {digest,requireThat,stable,type ReplaceRange} from './types.ts';
export async function persistChefReceiptEvidence(directory:string,project:string,sourceFingerprint:string,batch:ReplaceRange,full:Snapshot){
 validateSnapshot(full);requireThat(full.scannedHeight===batch.coverage.through.height&&full.tipHash===batch.coverage.through.hash,'CHEF_RECEIPT_RANGE');
 await mkdir(directory,{recursive:true,mode:0o700});const dirInfo=await lstat(directory);
 requireThat(dirInfo.isDirectory()&&!dirInfo.isSymbolicLink()&&await realpath(directory)===directory&&(process.platform!=='linux'||(dirInfo.mode&0o077)===0),'CHEF_RECEIPT_PRIVATE_DIRECTORY');
 const result:{path:string;receiptDigest:string}[]=[];
 for(const output of full.outputs){
  const receiptDigest=digest([output.txid,output.pool,output.index,output.blockHash]),path=join(directory,receiptDigest+'.private.json');
  const selected=new Set([full.scannedHeight,Math.max(0,full.scannedHeight-9),output.height]);
  const snapshot=validateSnapshot({...full,blocks:full.blocks.filter(b=>selected.has(b.height)),outputs:[output]});
  const proof={version:1,binding:'chef-sdk-nu7-single-pool-v1',project,sourceFingerprint,generation:batch.coverage.generation,
   sourceCoverageDigest:batch.coverage.contentDigest,receiptDigest,snapshot};
  try{const f=await open(path,'wx',0o600);try{await f.writeFile(JSON.stringify(proof));await f.sync();}finally{await f.close();}
   if(process.platform==='linux'){const d=await open(directory,'r');try{await d.sync();}finally{await d.close();}}}
  catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
   const info=await lstat(path);requireThat(info.isFile()&&!info.isSymbolicLink()&&await realpath(path)===path&&(process.platform!=='linux'||(info.mode&0o077)===0),'CHEF_RECEIPT_PRIVATE_FILE');
   const old=JSON.parse(await readFile(path,'utf8'));
   requireThat(old.version===1&&old.binding===proof.binding&&old.project===project&&old.sourceFingerprint===sourceFingerprint&&old.generation===proof.generation
    &&old.receiptDigest===receiptDigest&&stable(old.snapshot?.outputs)===stable([output]),'CHEF_RECEIPT_IMMUTABLE_IDENTITY_CHANGED');
  }
  result.push({path,receiptDigest});
 }
 return result;
}
