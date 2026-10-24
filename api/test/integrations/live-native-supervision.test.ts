import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {LocalReverseWalletAdapter} from '../../src/reverse-wallet-adapter.ts';
test('native adapter resolves/rejects only after exact positive supervised cleanup ACK',async()=>{
 const root=await mkdtemp(join(tmpdir(),'native-supervision-'));
 try{
  const script=join(root,'child.mjs');
  await writeFile(script,`process.stdin.resume();process.stdin.on('end',()=>{console.log('{}');console.error(JSON.stringify({status:'OWNED_PROCESS_CLEANED',groupReaped:true,kind:'native'}));});`);
  assert.deepEqual(await new LocalReverseWalletAdapter(process.execPath,[script],undefined,true).prepare(),{});
  await writeFile(script,`process.stdin.resume();process.stdin.on('end',()=>{console.error(JSON.stringify({status:'OWNED_PROCESS_CLEANED',groupReaped:true,kind:'native'}));process.exitCode=1;});`);
  await assert.rejects(new LocalReverseWalletAdapter(process.execPath,[script],undefined,true).prepare(),/REVERSE_WALLET_UNAVAILABLE_RECONCILE/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('missing or wrong cleanup ACK holds native promise instead of releasing caller financial lock',async()=>{
 const root=await mkdtemp(join(tmpdir(),'native-hold-'));
 try{
  for(const kind of [undefined,'base-forward']){
   const script=join(root,`child-${kind??'none'}.mjs`);
   await writeFile(script,`process.stdin.resume();process.stdin.on('end',()=>{console.log('{}');${kind?`console.error(JSON.stringify({status:'OWNED_PROCESS_CLEANED',groupReaped:true,kind:'${kind}'}));`:''}});`);
   let settled=false;void new LocalReverseWalletAdapter(process.execPath,[script],undefined,true).prepare().finally(()=>{settled=true;});
   await delay(250);assert.equal(settled,false);
  }
 }finally{await rm(root,{recursive:true,force:true});}
});
