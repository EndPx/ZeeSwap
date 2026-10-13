import { readFile } from 'node:fs/promises';
import { connect } from '../src/db.ts';
import { BaseContract,loadBaseRegistry } from '../src/base-contract.ts';
import { LocalBaseSigner } from '../src/base-signer.ts';
import { dispatchBaseOnce,reconcileBaseReceipts } from '../src/base-settlement.ts';
import { baseHead,scanOnce } from '../src/observer.ts';
import { runtime } from './runtime.ts';

const r=await runtime(process.argv.includes('--integration')),pool=connect(r.workerUrl),base=new BaseContract(loadBaseRegistry());
try{
 if(process.argv.includes('--reconcile-only')){
  await base.preflight();console.log(await reconcileBaseReceipts(pool,r.keys,base));
 }else{
  const signerConfig=JSON.parse(await readFile(process.env.ZEE_BASE_SIGNER_CLIENT||new URL('../../.deploy-local/base-signer-client.json',import.meta.url),'utf8'));
  await baseHead(pool);await scanOnce(pool,r.keys,r.wallet);
  console.log(await dispatchBaseOnce(pool,r.keys,base,new LocalBaseSigner(signerConfig.command,signerConfig.args)));
 }
}catch{
 await pool.query('SELECT zee.enter_reconciliation()').catch(()=>{});
 console.error('Base settlement stopped; reconcile recorded attempts and private signer journal before resuming.');process.exitCode=1;
}finally{await pool.end();}
