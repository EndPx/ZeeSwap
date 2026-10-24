/** Explicit pre-funding relocation check. No financial mutation or ledger opening. */
import {readFile,open,chown,chmod} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {verifyLinuxOperatorProfile,verifyLinuxWalletTransport} from '../src/linux-testnet-profile.ts';
import {connect} from '../src/db.ts';
import {validateLiveOpeningRows} from '../src/live-testnet-opening.ts';
import {BaseContract} from '../src/base-contract.ts';
const [step,path]=process.argv.slice(2);if(!['check','write-proof'].includes(step)||!path||process.argv.length!==4)throw Error('Explicit Linux relocation check/write-proof required');
const verified=await verifyLinuxOperatorProfile(path),{profile,runtime,registry,opening}=verified;
await verifyLinuxWalletTransport(profile);const pool=connect(runtime.workerUrl,1);
try{
 const client=await pool.connect();let snapshot;
 try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const control=(await client.query('SELECT accepting_orders,dispatch_enabled,reconciliation_required,epoch::text FROM zee.runtime_control WHERE singleton')).rows[0];
  if(!control||control.accepting_orders||control.dispatch_enabled||!control.reconciliation_required||control.epoch!=='0')throw Error('LINUX_HANDOFF_REQUIRES_PAUSED_CONTROL');
  const counts=(await client.query(`SELECT (SELECT count(*) FROM zee.orders) quotes_orders,(SELECT count(*) FROM zee.quotes) quotes,(SELECT count(*) FROM zee.deposits) deposits,(SELECT count(*) FROM zee.obligations) obligations,(SELECT count(*) FROM zee.operations) operations`)).rows[0];
  if(Object.values(counts).some(v=>v!=='0'))throw Error('LINUX_PREFUNDING_EMPTY_CUSTOMER_TABLES_REQUIRED');
  const accounts=(await client.query('SELECT asset,purpose,balance::text,reserved::text FROM zee.inventory_accounts')).rows;
  const rows=(await client.query('SELECT event_id::text,asset,bucket,amount::text FROM zee.ledger_entries')).rows;
  validateLiveOpeningRows(opening.eventId,accounts,rows);snapshot={control,counts,accounts,openingLedgerRows:rows.length};await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
 const base=new BaseContract({...registry,rpcUrl:'https://base-sepolia-rpc.publicnode.com'});await base.preflight();const heads=await base.heads();const [latest,pending,gas]=await Promise.all([base.client.getTransactionCount({address:registry.operator,blockTag:'latest'}),base.client.getTransactionCount({address:registry.operator,blockTag:'pending'}),base.client.getBalance({address:registry.operator,blockNumber:heads.finalized.number})]);
 if(latest!==0||pending!==0||gas!==500000000000000n)throw Error('LINUX_PREFUNDING_OPERATOR_NONCE_OR_GAS_CHANGED');
 const proof={version:1,status:'PREFUNDING_RELOCATION_VERIFIED',verifiedAt:new Date().toISOString(),profileSha256:verified.profileSha256,openingProofSha256:profile.immutable.openingProof.sha256,branchId:profile.identity.branchId,database:profile.identity.database,operator:profile.identity.operator,operatorNonce:0,openingLedgerUnchanged:true,originalWalletCopyHashesVerified:true,logicalUfvkIdentityVerified:true,sqlMutation:false,snapshot};
 if(step==='write-proof'){
  if(process.getuid?.()!==0)throw Error('LINUX_ROOT_WRITES_PROTECTED_HANDOFF_PROOF');const proofPath=profile.roots.secrets+'/relocation-applied-proof.private.json';const fd=await open(proofPath,'wx',0o640);try{await fd.writeFile(JSON.stringify(proof,null,2)+'\n');await fd.sync();}finally{await fd.close();}
  const {stdout}=await promisify(execFile)('id',['-g','zeeswap-testnet']);const gid=Number(stdout.trim());if(!Number.isSafeInteger(gid)||gid<1)throw Error('LINUX_SERVICE_GROUP_REQUIRED');await chown(proofPath,0,gid);await chmod(proofPath,0o640);
 }
 console.log(JSON.stringify({status:step==='write-proof'?'LINUX_RELOCATION_PROOF_WRITTEN':'LINUX_RELOCATION_CHECK_PASSED',branchId:profile.identity.branchId,openingLedgerRows:8,accounts:4,operatorNonce:0,sqlMutation:false,servicesStarted:false}));
}finally{await pool.end();}
