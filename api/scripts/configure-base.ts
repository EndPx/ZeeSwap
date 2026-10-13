import { BaseContract,loadBaseRegistry } from '../src/base-contract.ts';
import { connect,transaction } from '../src/db.ts';
import { requireDevelopment,requirePrimary } from './config.ts';

const settings=process.argv.includes('--production')?requirePrimary():requireDevelopment();
const base=new BaseContract(loadBaseRegistry());
await base.preflight(); // Includes finalized deployment receipts, code hashes and runtime roles.
const pool=connect(settings.adminUrl,1);
try{
 await transaction(pool,async c=>{
  await c.query('SELECT 1 FROM zee.runtime_control WHERE singleton FOR UPDATE');
  const existing=(await c.query("SELECT contract_address FROM zee.assets WHERE id='mockUSDC'")).rows[0].contract_address;
  if(existing&&existing.toLowerCase()!==base.registry.contracts.MockUSDC.address.toLowerCase())throw Error('Existing asset binding conflicts with registry');
  await c.query("UPDATE zee.assets SET contract_address=$1 WHERE id='mockUSDC'",[base.registry.contracts.MockUSDC.address]);
 });
 console.log({branchId:settings.branchId,token:base.registry.contracts.MockUSDC.address,activatedIntake:false,activatedDispatch:false});
}finally{await pool.end();}
