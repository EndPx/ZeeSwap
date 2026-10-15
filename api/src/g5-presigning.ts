import {G5_RETRY_TARGET,type G5State} from './g5-run.ts';
export function requireG5R2PreSigningRecovery(state:G5State,config:any,reverse:any){
 if(config.branchId!==G5_RETRY_TARGET.branchId||state.batchSize!==5||!state.incident||!state.policyInitialized||state.closed
  ||state.orders.length!==2||(state.barriers?.length??0)!==0||state.orders[0].direction!=='ZCASH_TO_BASE'||!state.orders[0].receiptVerified
  ||state.orders[1].direction!=='BASE_TO_ZCASH'||!state.orders.every((o,i)=>o.sequence===i+1&&o.orderId)
  ||reverse.orderId!==state.orders[1].orderId||reverse.owner!==state.orders[1].owner||reverse.approvedRequest||reverse.approvedDigest
  ||reverse.lastFailure?.step!=='approve-wallet'||reverse.lastFailure?.message!=='FINALIZED_COMMIT_REQUIRED')throw Error('G5_ONLY_R2_FRESH_COMMIT_WAIT_RECOVERABLE');
}
export function validateG5R2HeldAccounts(accounts:any[],forwardFees:string){
 const expected=[['mockUSDC','principal','900000','0'],['TAZ','principal','1000000','100000'],['TAZ','fee','130000','10000'],
 ['baseETH','fee',(300000000000000n-BigInt(forwardFees)).toString(),'50000000000000']];
 if(accounts.length!==4||expected.some(([asset,purpose,balance,reserved])=>accounts.filter(a=>a.asset===asset&&a.purpose===purpose&&a.balance===balance&&a.reserved===reserved).length!==1))throw Error('G5_R2_HELD_INVENTORY_MISMATCH');
}
export function validateG5R2Physical(opening:{inventory:string;operatorGas:string},forwardFees:string,commitFee:string,p:any){
 const inventory=BigInt(opening.inventory)-100000n,gas=BigInt(opening.operatorGas)-BigInt(forwardFees)-BigInt(commitFee);
 if(p.inventory!==inventory.toString()||p.available!==inventory.toString()||p.tokenBalance!==(inventory+100000n).toString()
  ||p.escrowLiability!=='100000'||p.gas!==gas.toString())throw Error('G5_R2_HELD_PHYSICAL_MISMATCH');
}
