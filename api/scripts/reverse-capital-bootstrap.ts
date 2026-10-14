/** Bounded operator capital reconciliation. Only the selected empty reverse
 * evidence branch receives its own capital; no forward inventory is imported.
 * This script never enables acceptance, dispatch, or clears reconciliation.
 */
import { readFile,open,rename } from 'node:fs/promises';
import { dirname,resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { connect,transaction } from '../src/db.ts';
import { requireDevelopment } from './config.ts';
import { BaseContract,loadBaseRegistry } from '../src/base-contract.ts';
import { validateSnapshot } from '../src/observer.ts';
import { validateReverseCapital,validateCapitalOpening } from '../src/reverse-capital.ts';
import { approvalDigest } from '../src/reverse-authority.ts';
import {reverseBaseRegistry} from '../src/reverse-base-rpc.ts';
const [step,path]=process.argv.slice(2);
if(!['bootstrap','refresh'].includes(step)||!path||process.argv.length!==4)throw Error('Explicit bootstrap/refresh and fixed private config required');
const config=JSON.parse(await readFile(path,'utf8'));
process.env.ZEE_DB_CONFIG=resolve(config.databaseConfig);const target=requireDevelopment();
if(target.branchId!=='br-small-sound-aozx7xa6')throw Error('Exact live reverse branch required');
const pool=connect(target.adminUrl,1),base=new BaseContract(reverseBaseRegistry(loadBaseRegistry(),config.baseRpcUrl));
async function durable(path:string,value:unknown){const temp=path+'.'+randomUUID()+'.tmp',file=await open(temp,'wx',0o600);
 try{await file.writeFile(JSON.stringify(value,null,2));await file.sync();}finally{await file.close();}await rename(temp,path);
 if(process.platform!=='win32'){const dir=await open(dirname(path),'r');try{await dir.sync();}finally{await dir.close();}}}
try{
 await base.preflight();
 const proof=JSON.parse(await readFile(resolve(config.capitalProofFile),'utf8'));
 const snapshot=step==='bootstrap'?validateReverseCapital(proof,config.approvedCapitalFundingTxid).snapshot:validateSnapshot(proof.snapshot);
 const heads=await base.heads();
 const references=(await pool.query(`SELECT DISTINCT height::text FROM zee.chain_observations WHERE network='base-sepolia'`)).rows;
 const canonical:{height:string;hash:string;time:Date}[]=[];
 for(const {height} of references){const block=await base.client.getBlock({blockNumber:BigInt(height)});canonical.push({height,hash:block.hash!.slice(2),time:new Date(Number(block.timestamp)*1000)});}
 // Pin and recheck the finalized Base head around capital balance reads.
 const gas=(await base.client.getBalance({address:base.registry.operator,blockNumber:heads.finalized.number})).toString();
 if((await base.client.getBlock({blockNumber:heads.finalized.number})).hash!==heads.finalized.hash)throw Error('BASE_REORG');
 const openingPath=resolve(config.openingStateFile??(config.stateFile+'.opening.json'));
 let opening:any;
 if(step==='bootstrap'){
  if(BigInt(gas)<100000000000000n)throw Error('BASE_GAS_CAPITAL_INSUFFICIENT');
  try{opening=JSON.parse(await readFile(openingPath,'utf8'));}catch(error){if((error as any).code!=='ENOENT')throw error;}
  if(!opening){opening={version:1,eventId:randomUUID(),fundingTxid:proof.fundingTxid,proofDigest:approvalDigest(proof),tazPrincipal:'190000',tazFee:'10000',baseFee:gas};await durable(openingPath,opening);}
  if(opening.fundingTxid!==proof.fundingTxid||opening.tazPrincipal!=='190000'||opening.tazFee!=='10000')throw Error('OPENING_CAPITAL_INTENT_CONFLICT');
 }
 await transaction(pool,async c=>{
  await c.query('SELECT zee.lock_observer_cycle()');
  if(step==='bootstrap'){
   const existing=(await c.query('SELECT asset,bucket,amount::text FROM zee.ledger_entries WHERE event_id=$1',[opening.eventId])).rows;
   const accounts=(await c.query('SELECT asset,purpose,balance::text,reserved::text FROM zee.inventory_accounts')).rows;
   validateCapitalOpening(opening,proof.fundingTxid,gas,existing,accounts);
   if(!existing.length){
    const occupied=(await c.query(`SELECT (SELECT count(*) FROM zee.orders)+(SELECT count(*) FROM zee.quotes)
     +(SELECT count(*) FROM zee.deposits)+(SELECT count(*) FROM zee.inventory_accounts)+(SELECT count(*) FROM zee.ledger_entries) AS n`)).rows[0].n;
    if(Number(occupied)!==0)throw Error('REVERSE_BOOTSTRAP_REQUIRES_EMPTY_BRANCH');
    for(const [asset,purpose,amount] of [['TAZ','principal',opening.tazPrincipal],['TAZ','fee',opening.tazFee],['baseETH','fee',opening.baseFee]]){
     await c.query('INSERT INTO zee.inventory_accounts(asset,purpose,balance,reserved) VALUES($1,$2,$3,0)',[asset,purpose,amount]);
     await c.query('INSERT INTO zee.ledger_entries(event_id,asset,bucket,amount) VALUES($1,$2,$3,$4),($1,$2,$5,-$4::numeric)',
      [opening.eventId,asset,purpose+':available',amount,purpose+':operator-capital']);
    }
   }
  }
  const finalized=snapshot.blocks.find(b=>b.height===snapshot.scannedHeight-9)!;
  await c.query(`INSERT INTO zee.scanner_checkpoints VALUES('zcash-testnet',$1,$2,$3,$4,$5)
   ON CONFLICT(network) DO UPDATE SET scanned_height=$1,tip_hash=$2,finalized_height=$3,finalized_time=$4,observed_at=$5`,
   [snapshot.scannedHeight,snapshot.tipHash,finalized.height,finalized.time,snapshot.observedAt]);
  for(const block of snapshot.blocks)await c.query(`INSERT INTO zee.chain_observations VALUES('zcash-testnet',$1,$2,$3)
   ON CONFLICT(network,height) DO UPDATE SET block_hash=$2,block_time=$3`,[block.height,block.hash,new Date(block.time)]);
  await c.query(`INSERT INTO zee.scanner_checkpoints VALUES('base-sepolia',$1,$2,$3,$4,clock_timestamp())
   ON CONFLICT(network) DO UPDATE SET scanned_height=$1,tip_hash=$2,finalized_height=$3,finalized_time=$4,observed_at=clock_timestamp()`,
   [String(heads.latest.number),heads.latest.hash!.slice(2),String(heads.finalized.number),new Date(Number(heads.finalized.timestamp)*1000)]);
  for(const block of canonical)await c.query(`UPDATE zee.chain_observations SET block_hash=$1,block_time=$2 WHERE network='base-sepolia' AND height=$3`,[block.hash,block.time,block.height]);
 });
 console.log(JSON.stringify({status:step==='bootstrap'?'REVERSE_CAPITAL_RECONCILED_PAUSED':'REVERSE_OBSERVERS_REFRESHED',dispatchEnabled:false}));
}catch{await pool.query('SELECT zee.enter_reconciliation()').catch(()=>{});console.error('REVERSE_CAPITAL_STEP_FAILED_RECONCILE');process.exitCode=1;}
finally{await pool.query('UPDATE zee.runtime_control SET accepting_orders=false,dispatch_enabled=false').catch(()=>{process.exitCode=1;});await pool.end();}
