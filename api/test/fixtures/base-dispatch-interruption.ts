import { BaseContract,type BaseRegistry } from '../../src/base-contract.ts';
import { dispatchBaseOnce } from '../../src/base-settlement.ts';
import type { PreparedBaseTransaction } from '../../src/base-signer.ts';
import { connect } from '../../src/db.ts';
import { runtime } from '../../scripts/runtime.ts';
import { requireDevelopment } from '../../scripts/config.ts';
import type { Hex } from 'viem';

// A real worker process, restricted to the invocation-owned synthetic DB and
// loopback Anvil. The parent kills it after submission, before dispatch returns.
process.once('message',async(message:unknown)=>{
 try{
  const settings=requireDevelopment();
  if(settings.branchId!=='br-wispy-dawn-aorsbba5'||!/^zee_test_[0-9a-f]{32}$/.test(new URL(settings.adminUrl).pathname.slice(1)))
   throw Error('DISPOSABLE_DATABASE_REQUIRED');
  const input=message as {registry:BaseRegistry;settlementId:Hex;signature:Hex;prepared:PreparedBaseTransaction};
  if(input.registry.rpcUrl!=='http://127.0.0.1:18745')throw Error('LOOPBACK_ANVIL_REQUIRED');
  const r=await runtime(true),target=new URL(r.workerUrl),expected=new URL(settings.adminUrl);
  if(target.pathname!==expected.pathname||target.hostname.replace('-pooler.','.')!==expected.hostname)
   throw Error('MIXED_DISPOSABLE_DATABASE_TARGET');
  const pool=connect(r.workerUrl,1),base=new BaseContract(input.registry,true);
  const send=base.client.sendRawTransaction;
  base.client.sendRawTransaction=async args=>{
   if(args.serializedTransaction!==input.prepared.raw)throw Error('UNEXPECTED_TRANSACTION');
   const hash=await send(args);
   // The transaction has reached Anvil; keep both the worker and DB pool alive
   // until the parent forcefully terminates the process, with no clean shutdown.
   await new Promise<void>((resolve,reject)=>process.send!({event:'broadcast',hash},error=>error?reject(error):resolve()));
   return new Promise<never>(()=>{});
  };
  await dispatchBaseOnce(pool,r.keys,base,{
   authorize:async terms=>{if(terms.id!==input.settlementId)throw Error('UNEXPECTED_ORDER');return input.signature;},
   prepare:async(terms,phase)=>{if(terms.id!==input.settlementId||phase!=='PAY')throw Error('UNEXPECTED_PHASE');return input.prepared;}
  });
  throw Error('DISPATCH_RETURNED_BEFORE_INTERRUPTION');
 }catch{
  // Do not send config, signed bytes, or DB errors into test output.
  process.send?.({event:'failed'});process.exitCode=1;
 }
});
