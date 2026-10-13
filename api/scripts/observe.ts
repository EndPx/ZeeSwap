import { connect } from '../src/db.ts';
import { baseHead, scanOnce } from '../src/observer.ts';
import { runtime } from './runtime.ts';
const integration=process.argv.includes('--integration');
const r=await runtime(integration),pool=connect(r.workerUrl);
try{
 if(!integration){
  if(!process.env.ZEE_WALLET_CONFIG)throw new Error('Configure the primary viewing-only wallet explicitly');
  await pool.query('SELECT zee.enter_reconciliation()');
 }
 console.log(JSON.stringify({base:await baseHead(pool),zcash:await scanOnce(pool,r.keys,r.wallet)}));
}catch{console.error('Observer cycle failed; inspect local adapter health. No payout was attempted.');process.exitCode=1;}
finally{await pool.end();}
