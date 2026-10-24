import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {LocalBaseSigner} from '../../src/base-signer.ts';

const terms={id:`0x${'11'.repeat(32)}`,token:`0x${'22'.repeat(20)}`,recipient:`0x${'33'.repeat(20)}`,amount:'100000',nonce:'1',deadline:'9999999999'} as const;
const reply={signature:`0x${'44'.repeat(65)}`};
async function child(ack:boolean,run:(signer:LocalBaseSigner)=>Promise<void>){
 const dir=await mkdtemp(join(tmpdir(),'zee-owned-base-')),script=join(dir,'owned.cjs');
 try{await writeFile(script,`process.stdin.resume();process.stdin.on('end',()=>setTimeout(()=>{${ack?`process.stderr.write(JSON.stringify({status:'OWNED_PROCESS_CLEANED',groupReaped:true,kind:'base-forward'})+'\\n');`:''}process.stdout.write(${JSON.stringify(JSON.stringify(reply))});},80));`);
  await run(new LocalBaseSigner(process.execPath,[script,'--kind','base-forward'],1,true));
 }finally{assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep+'zee-owned-base-'));await rm(dir,{recursive:true});}
}
test('supervised actual child outlives unsafe outer timeout and returns only after owned cleanup ACK',async()=>{
 await child(true,async signer=>{const started=Date.now();assert.equal(await signer.authorize(terms),reply.signature);assert.ok(Date.now()-started>=70);});
});
test('closed actual child without cleanup ACK cannot settle the caller or release its operator ownership',async()=>{
 await child(false,async signer=>{
  const result=signer.authorize(terms).then(()=>'UNSAFE_RELEASE',()=>'UNSAFE_RELEASE');
  // Test observation only; production deliberately has no such release timer.
  assert.equal(await Promise.race([result,delay(200).then(()=>'OPERATOR_HOLD')]),'OPERATOR_HOLD');
 });
});
