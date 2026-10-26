/** Root-only read-only inspection. No migration, authority, control or payment. */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyLinuxOperatorProfile} from '../src/linux-testnet-profile.ts';
import {connect} from '../src/db.ts';
import {loadMarketServicePolicyApi} from '../src/market-service-policy.ts';
export async function inspectMarketPolicy(proofPath?:string,proofSha256?:string){
 if(process.platform!=='linux'||process.getuid?.()!==0||process.env.HOME!=='/opt/zeeswap-testnet/home'||(proofPath===undefined)!==(proofSha256===undefined))throw Error('MARKET_INSPECTION_ROOT_SCOPE');
 const v=await verifyLinuxOperatorProfile('/opt/zeeswap-testnet/secrets/linux-operator-profile.private.json'),pool=connect(v.runtime.workerUrl,1);
 try{
  const who=(await pool.query('SELECT current_database() database,current_user role')).rows[0];if(who?.database!=='zee_app_20261023'||who.role!=='zee_app_worker_20261023')throw Error('MARKET_INSPECTION_DATABASE_SCOPE');
  const needed=[];for(const[table,migration]of [['root_testnet_service_policies','0020_bounded_testnet_service_policy.sql'],['check_testnet_policy_source_refund_signing','0021_testnet_service_refunds.sql'],['root_market_service_policies','0023_market_pricing.sql']]){
   const row=(await pool.query(table.startsWith('check_')?'SELECT to_regprocedure($1) object':'SELECT to_regclass($1) object',['zee.'+table+(table.startsWith('check_')?'(uuid,zee.digest)':'')])).rows[0];if(!row.object)needed.push(migration);
  }
  const control=(await pool.query('SELECT epoch::text,accepting_orders,dispatch_enabled,reconciliation_required FROM zee.runtime_control WHERE singleton')).rows[0],sources=(await pool.query('SELECT network,scanned_height::text,finalized_height::text,observed_at FROM zee.scanner_checkpoints ORDER BY network')).rows;
  if(needed.length)return{status:'MARKET_SQL_INSTALLATION_REQUIRED',requiredMigrations:needed,control,sources,financialAction:false};
  const scope={profileSha256:v.profileSha256,openingProofSha256:v.profile.immutable.openingProof.sha256,settlementContract:v.registry.contracts.ZeeSwapSettlement.address,tokenContract:v.registry.contracts.MockUSDC.address};
  const policy=proofPath?await loadMarketServicePolicyApi({ZEESWAP_MARKET_POLICY_PROOF:proofPath,ZEESWAP_MARKET_POLICY_SHA256:proofSha256},scope,pool):undefined;if(policy)await policy.recheck();
  return {status:policy?'MARKET_POLICY_PRIVATE_BINDINGS_VERIFIED':'MARKET_POLICY_NOT_CONFIGURED',control,sources,inventory:(await pool.query('SELECT asset,purpose,balance::text,reserved::text FROM zee.inventory_accounts ORDER BY asset,purpose')).rows,marketAdmissions:(await pool.query('SELECT count(*)::int count FROM zee.market_policy_admissions')).rows[0].count,financialAction:false,providerFetched:false};
 }finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const args=process.argv.slice(2);if(args.length!==0&&args.length!==2)throw Error('MARKET_INSPECTION_ARGS');inspectMarketPolicy(args[0],args[1]).then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('MARKET_INSPECTION_REFUSED');process.exitCode=1;});}
