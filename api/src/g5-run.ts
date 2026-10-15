import {createHash} from 'node:crypto';
import {atomic} from './amounts.ts';

export const G5_TARGET={projectId:'raspy-truth-63998651',branchId:'br-weathered-bird-aoaodegw',branchName:'zeeswap-g5-live-soak',host:'ep-long-heart-ao6fqh1e.c-2.ap-southeast-1.aws.neon.tech'} as const;
export const G5_RETRY_TARGET={projectId:'raspy-truth-63998651',branchId:'br-twilight-heart-ao6cx6pg',branchName:'zeeswap-g5-soak-retry',host:'ep-aged-shadow-aojcoa3q.c-2.ap-southeast-1.aws.neon.tech'} as const;
export const G5_CAPITAL=[['mockUSDC','principal','1000000'],['TAZ','principal','1000000'],['TAZ','fee','100000'],['baseETH','fee','300000000000000']] as const;
export const g5Capital=(branchId:string=G5_TARGET.branchId)=>G5_CAPITAL.map(([asset,purpose,amount])=>[asset,purpose,asset==='TAZ'&&purpose==='fee'&&branchId===G5_RETRY_TARGET.branchId?'130000':amount]);
/** Compare a WSL config's Linux path with its operator UNC/mounted-drive path. */
export function g5PathIdentity(path:string){
 if(typeof path!=='string')throw Error('G5_FIXED_CONFIG_PATH_REQUIRED');
 let p=path.replaceAll('\\','/');p=p.replace(/^\/\/(?:wsl\.localhost|wsl\$)\/Ubuntu-24\.04(?=\/)/i,'');
 if(/^[a-zA-Z]:\//.test(p))p='/mnt/'+p[0].toLowerCase()+p.slice(2);
 if(!p.startsWith('/')||p.split('/').some(x=>x==='..'||x==='.'))throw Error('G5_ABSOLUTE_CONFIG_PATH_REQUIRED');return p;
}
export function requireG5CommandConfig(args:unknown,path:string){
 if(!Array.isArray(args)||args.filter(a=>a==='--config').length!==1)throw Error('G5_EXPLICIT_ADAPTER_CONFIG_REQUIRED');
 const i=args.indexOf('--config');if(g5PathIdentity(args[i+1])!==g5PathIdentity(path))throw Error('G5_ADAPTER_CONFIG_BINDING_MISMATCH');
}
export interface G5Order {sequence:number;direction:'ZCASH_TO_BASE'|'BASE_TO_ZCASH';orderId?:string;owner:string;receiver?:string;verified?:boolean;[key:string]:unknown}
export interface G5State {version:1;runId:string;binding:string;openingEventId:string;orders:G5Order[];closed?:boolean;policyInitialized?:boolean;incident?:boolean;batchSize?:5;barriers?:number[];extraFeeCapital?:any;openingCapital?:unknown;openingPhysical?:{blockNumber:string;blockHash:string;inventory:string;operatorGas:string}}
export function g5Direction(sequence:number){if(!Number.isSafeInteger(sequence)||sequence<1||sequence>20)throw Error('G5_SEQUENCE_REQUIRED');return sequence%2?'ZCASH_TO_BASE':'BASE_TO_ZCASH';}
export function requireG5Target(value:any,urls:string[]=[]){
 const target=value?.branchId===G5_RETRY_TARGET.branchId?G5_RETRY_TARGET:G5_TARGET;
 if(!value||value.projectId!==target.projectId||value.branchId!==target.branchId||value.branchName!==target.branchName||new URL(value.adminUrl).hostname!==target.host)throw Error('G5_EXACT_BRANCH_REQUIRED');
 for(const url of urls)if(new URL(url).hostname!==target.host.replace('.','-pooler.'))throw Error('G5_RUNTIME_BRANCH_MISMATCH');
 return value;
}
export function g5Binding(config:any){
 const expectedFee=config.branchId===G5_RETRY_TARGET.branchId?'50000000000000':'100000000000000';
 if(config.version!==1||!/^[0-9a-f-]{36}$/.test(config.runId)||![G5_TARGET.branchId,G5_RETRY_TARGET.branchId].includes(config.branchId)||config.baseFeeBudget!==expectedFee
  ||!config.forward?.recipient||(!config.batchSize&&!config.forward?.refundRecipient)||!Array.isArray(config.reverseOrders)||config.reverseOrders.length!==10)throw Error('G5_MANIFEST_REQUIRED');
 if(config.branchId===G5_RETRY_TARGET.branchId&&(config.batchSize!==5||!config.extraFeeWalletConfig))throw Error('G5_RETRY_BATCH_CAPITAL_PROFILE_REQUIRED');
 if(config.batchSize&&(!Array.isArray(config.forwardOrders)||config.forwardOrders.length!==10
  ||config.forwardOrders.some((o:any,i:number)=>o.sequence!==i*2+1||typeof o.refundRecipient!=='string')
  ||new Set(config.forwardOrders.map((o:any)=>o.refundRecipient)).size!==10))throw Error('G5_ISOLATED_USER_SOURCE_REFUNDS_REQUIRED');
 if(config.branchId===G5_TARGET.branchId&&config.batchSize!==undefined)throw Error('G5_HISTORICAL_RUN_PROFILE_IMMUTABLE');
 const paths=new Set<string>();for(let i=0;i<10;i++){const r=config.reverseOrders[i];if(r.sequence!==(i+1)*2||typeof r.configFile!=='string'||paths.has(r.configFile))throw Error('G5_ISOLATED_REVERSE_CONFIGS_REQUIRED');paths.add(r.configFile);}
 return createHash('sha256').update(JSON.stringify(config)).digest('hex');
}
export function validateG5State(state:G5State,config:any){
 if(state.version!==1||state.runId!==config.runId||state.binding!==g5Binding(config)||!state.openingEventId||!Array.isArray(state.orders)||state.orders.length>20)throw Error('G5_MANIFEST_BINDING_MISMATCH');
 if(state.batchSize!==config.batchSize)throw Error('G5_BATCH_PROFILE_MISMATCH');
 const barriers=state.barriers??[];if(barriers.some((n,i)=>n!==(i+1)*5)||barriers.length>4||(!state.batchSize&&barriers.length)||barriers.length*5>state.orders.length)throw Error('G5_BATCH_BARRIER_SEQUENCE');
 const ids=new Set<string>(),owners=new Set<string>();for(let i=0;i<state.orders.length;i++){
  const o=state.orders[i];if(o.sequence!==i+1||o.direction!==g5Direction(i+1)||typeof o.owner!=='string'||owners.has(o.owner))throw Error('G5_ORDER_SEQUENCE_MISMATCH');owners.add(o.owner);
  if(o.orderId){if(ids.has(o.orderId))throw Error('G5_DUPLICATE_ORDER');ids.add(o.orderId);}
  if(!o.verified&&((state.batchSize&&i<barriers.length*5)||(!state.batchSize&&i<state.orders.length-1)))throw Error('G5_PREDECESSOR_VERIFICATION_REQUIRED');
 }
 if(state.batchSize&&state.orders.length>barriers.length*5+5)throw Error('G5_FIVE_ORDER_BATCH_LIMIT');
}
export function requireG5Operational(state:G5State){if(state.incident)throw Error('G5_INCIDENT_RUN_FROZEN');if(state.closed)throw Error('G5_RUN_CLOSED');}
export function requireG5EmptyOpeningRecovery(state:G5State,config:any,audit:any){
 if(config.branchId!==G5_RETRY_TARGET.branchId||state.batchSize!==5||!state.incident||state.closed||state.policyInitialized
  ||state.orders.length!==0||(state.barriers?.length??0)!==0)throw Error('G5_ONLY_EMPTY_RETRY_OPENING_RECOVERABLE');
 const age=Date.now()-Date.parse(audit?.observedAt);
 if(audit?.version!==1||audit.runId!==state.runId||audit.statement!=='NO_SOURCE_FUNDING_OR_NEW_SIGNER_INTENTS'
  ||!Number.isFinite(age)||age< -5000||age>300000||!Array.isArray(audit.sourceActorConfigs)||audit.sourceActorConfigs.length!==10
  ||audit.sourceActorConfigs.some((s:any,i:number)=>s.sequence!==i*2+1||typeof s.configFile!=='string')
  ||new Set(audit.sourceActorConfigs.map((s:any)=>s.configFile)).size!==10)throw Error('G5_EXPLICIT_FRESH_EMPTY_OPENING_AUDIT_REQUIRED');
}
export function requireG5RoundtripCheckpoint(state:G5State){
 requireG5Operational(state);
 if(state.batchSize!==5||(state.barriers?.length??0)!==0||state.orders.length!==2
  ||state.orders.some((o,i)=>o.sequence!==i+1||o.direction!==g5Direction(i+1)||!o.orderId||!o.receiptVerified))throw Error('G5_TWO_SETTLED_RECEIPTS_REQUIRED');
}
export function requireG5CompletedRoundtripRecovery(state:G5State,config:any,diagnostic:any){
 if(config.branchId!==G5_RETRY_TARGET.branchId||state.batchSize!==5||!state.incident||!state.policyInitialized||state.closed
  ||(state.barriers?.length??0)!==0||state.orders.length!==2||!state.orders[0].receiptVerified||state.orders.some((o,i)=>o.sequence!==i+1||o.direction!==g5Direction(i+1)||!o.orderId)
  ||diagnostic?.step!=='verify'||diagnostic?.code!=='G5_EXPLICIT_RECONCILIATION_REQUIRED')throw Error('G5_ONLY_COMPLETED_FIRST_ROUNDTRIP_RECOVERABLE');
}
export function requireG5Next(state:G5State,sequence:number){
 g5Direction(sequence);requireG5Operational(state);
 if(state.batchSize){
  const start=(state.barriers?.length??0)*5+1,end=start+4;
  if(sequence<start||sequence>end)throw Error('G5_BATCH_BARRIER_REQUIRED');
  const existing=state.orders.find(o=>o.sequence===sequence);if(existing)return existing;
  if(sequence!==state.orders.length+1)throw Error('G5_NEXT_SEQUENCE_REQUIRED');return;
 }
 const current=state.orders.at(-1);if(current&&!current.verified){if(current.sequence!==sequence)throw Error('G5_ONE_OUTSTANDING_ORDER');return current;}
 if(sequence!==state.orders.length+1)throw Error('G5_NEXT_SEQUENCE_REQUIRED');
}
export interface G5Account {asset:string;purpose:string;balance:string;reserved:string}
export function expectedG5Balances(forwardSettled:number,reverseSettled:number,baseFee:string,branchId:string=G5_TARGET.branchId){
 if(!Number.isSafeInteger(forwardSettled)||!Number.isSafeInteger(reverseSettled)||forwardSettled<0||forwardSettled>10||reverseSettled<0||reverseSettled>forwardSettled||forwardSettled-reverseSettled>1)throw Error('G5_SETTLEMENT_SEQUENCE');
 const spent=atomic(baseFee);if(spent>300000000000000n)throw Error('G5_GAS_CAP_EXCEEDED');
 const fee=branchId===G5_RETRY_TARGET.branchId?130000n:100000n;
 return [['mockUSDC','principal',(1000000n-BigInt(forwardSettled)*100000n).toString()],['TAZ','principal',(1000000n-BigInt(reverseSettled)*100000n).toString()],['TAZ','fee',(fee-BigInt(reverseSettled)*10000n).toString()],['baseETH','fee',(300000000000000n-spent).toString()]];
}
/** At a completed-order boundary: proceeds are deliberately excluded from capital. */
export function validateG5Accounts(accounts:G5Account[],forward:number,reverse:number,fee:string,branchId:string=G5_TARGET.branchId){
 const expected=expectedG5Balances(forward,reverse,fee,branchId);
 if(accounts.length!==4||expected.some(([asset,purpose,balance])=>accounts.filter(a=>a.asset===asset&&a.purpose===purpose&&a.balance===balance&&a.reserved==='0').length!==1))throw Error('G5_INVENTORY_ACCOUNTING_MISMATCH');
}
export function validateG5OpeningLedger(rows:{event_id:string;asset:string;bucket:string;amount:string}[],eventId:string,branchId:string=G5_TARGET.branchId){
 if(rows.length!==8||g5Capital(branchId).some(([asset,purpose,amount])=>rows.filter(r=>r.event_id===eventId&&r.asset===asset&&r.bucket===purpose+':available'&&r.amount===amount).length!==1
  ||rows.filter(r=>r.event_id===eventId&&r.asset===asset&&r.bucket===purpose+':operator-capital'&&r.amount==='-'+amount).length!==1))throw Error('G5_OPENING_LEDGER_MISMATCH');
}
export function validateG5PhysicalBase(opening:{inventory:string;operatorGas:string},forward:number,reverse:number,fee:string,
 physical:{inventory:string;available:string;tokenBalance:string;escrowLiability:string;gas:string}){
 const expectedInventory=atomic(opening.inventory)-BigInt(forward)*100000n+BigInt(reverse)*100000n;
 const expectedGas=atomic(opening.operatorGas)-atomic(fee);
 if(expectedGas<0n||atomic(physical.inventory)!==expectedInventory||atomic(physical.available)!==expectedInventory||atomic(physical.tokenBalance)!==expectedInventory
  ||physical.escrowLiability!=='0'||atomic(physical.gas)!==expectedGas)throw Error('G5_UNEXPLAINED_PHYSICAL_BASE_DELTA');
}
export function validateG5WalletBalances(proof:any,state:G5State,forwardNotes:{pool:string;txid:string;index:number;value:string}[],reverseCount:number){
 const fresh=(p:any)=>{const age=Date.now()-Date.parse(p?.observedAt);if(!Number.isFinite(age)||age< -5000||age>300000||!Number.isSafeInteger(p.scannedHeight)||!/^[0-9a-f]{64}$/.test(p.tipHash))throw Error('G5_STALE_PHYSICAL_WALLET_PROOF');};
 if(proof?.version!==1||proof.runId!==state.runId||!Array.isArray(proof.reverse)||proof.reverse.length!==10||!Array.isArray(proof.deposit?.notes))throw Error('G5_PHYSICAL_WALLET_PROOF_REQUIRED');
 const identity=(n:any)=>JSON.stringify([n.pool,n.txid,n.index,n.value]);
 for(let i=0;i<10;i++){
  const p=proof.reverse[i],allocated=(state.openingCapital as any[])?.find(n=>n.sequence===(i+1)*2);fresh(p);
  if(p.sequence!==(i+1)*2||!allocated||p.ufvkSha256!==allocated.ufvkSha256||!Array.isArray(p.notes))throw Error('G5_PHYSICAL_WALLET_IDENTITY');
  const expected=i<reverseCount?[]:[{pool:allocated.pool,txid:allocated.txid,index:allocated.index,value:allocated.amount}];
  if(p.spendableZatoshi!==(i<reverseCount?'0':'110000')||p.notes.length!==expected.length||p.notes.some((n:any)=>!expected.some(e=>identity(n)===identity(e))))throw Error('G5_UNEXPLAINED_REVERSE_WALLET_DELTA');
 }
 fresh(proof.deposit);const actual=proof.deposit.notes.map(identity).sort(),expected=forwardNotes.map(identity).sort();
 if(proof.deposit.ufvkSha256!==(state.openingCapital as any[])?.[0]?.depositUfvkSha256||new Set(actual).size!==actual.length
  ||JSON.stringify(actual)!==JSON.stringify(expected)||atomic(proof.deposit.spendableZatoshi)!==BigInt(forwardNotes.length)*100000n)throw Error('G5_UNEXPLAINED_SOURCE_PROCEEDS_DELTA');
 if(state.batchSize){
  const fee=state.extraFeeCapital,p=proof.feeCapital;fresh(p);
  if(!fee||p.ufvkSha256!==fee.ufvkSha256||p.spendableZatoshi!=='30000'||p.notes?.length!==1
   ||identity(p.notes[0])!==identity({pool:fee.pool,txid:fee.txid,index:fee.index,value:fee.amount}))throw Error('G5_UNEXPLAINED_EXTRA_FEE_CAPITAL');
 }
}
