/** One reviewed launch from exact closed books; never a financial recovery permission. */
import {open} from 'node:fs/promises';
import {dirname} from 'node:path';
export const FAST_IDLE_TABLES=['assets','inventory_accounts','quotes','orders','deposits','obligations','operations','reservations','ledger_entries','chain_transactions','outbox_jobs','base_bindings','base_attempts','escrow_bindings','escrow_commits','reverse_payouts','escrow_settlements','source_refunds','order_events','root_testnet_service_policies','testnet_policy_quotes','testnet_policy_admissions','testnet_service_runtime','base_inclusions','escrow_inclusions','testnet_policy_predecessors','testnet_policy_renewal_authorizations','testnet_service_lifetime_authorizations','testnet_unfunded_reuse_authorizations','root_native_circle_authorizations','testnet_policy_execution_resumptions'] as const;
export type TableDigest={rows:number;sha256:string};
export interface FastIdleLaunchProof {version:1;purpose:'ROOT_BASE_L2_IDLE_LAUNCH';workerConfigSha256:string;fastRootSha256:string;policySha256:string;activeEpoch:string;effectiveEpoch:string;controlXmin:string;approvedAt:string;publishBefore:string;originalWorkerPid:number;closedReceiptProof:{path:string;sha256:string};tableDigests:Record<string,TableDigest>}
function need(v:unknown,code:string):asserts v{if(!v)throw Error('FAST_IDLE_LAUNCH_'+code);}
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)&&v!=='0'.repeat(64);
export function validateFastIdleLaunchProof(v:unknown,expected:{workerConfigSha256:string;fastRootSha256:string;policySha256:string;activeEpoch:string;effectiveEpoch?:string},now=Date.now()):asserts v is FastIdleLaunchProof{
 const p=v as FastIdleLaunchProof;need(p?.version===1&&p.purpose==='ROOT_BASE_L2_IDLE_LAUNCH','PURPOSE');
 for(const key of ['workerConfigSha256','fastRootSha256','policySha256'] as const)need(hash(p[key])&&p[key]===expected[key],'EXACT_'+key);
 need(p.activeEpoch===expected.activeEpoch&&p.effectiveEpoch===(expected.effectiveEpoch??expected.activeEpoch)&&/^[1-9][0-9]*$/.test(p.effectiveEpoch)&&BigInt(p.effectiveEpoch)>=BigInt(p.activeEpoch)&&/^[1-9][0-9]*$/.test(p.activeEpoch)&&/^[1-9][0-9]*$/.test(p.controlXmin),'CONTROL');
 const at=Date.parse(p.approvedAt),until=Date.parse(p.publishBefore);need(Number.isFinite(at)&&Number.isFinite(until)&&at<=now&&until>now&&until>at&&until-at<=600000,'FINITE_START_WINDOW');
 need(Number.isSafeInteger(p.originalWorkerPid)&&p.originalWorkerPid>1,'ORIGINAL_PID');
 need(p.closedReceiptProof&&/^\/opt\/zeeswap-testnet\/state\/[A-Za-z0-9._/-]+\.private\.json$/.test(p.closedReceiptProof.path)&&!p.closedReceiptProof.path.split('/').includes('..')&&hash(p.closedReceiptProof.sha256),'CLOSED_RECEIPT_PROOF');
 need(p.tableDigests&&Object.keys(p.tableDigests).sort().join()===FAST_IDLE_TABLES.slice().sort().join(),'EXACT_TABLE_SET');
 for(const table of FAST_IDLE_TABLES){const d=p.tableDigests[table];need(d&&Number.isSafeInteger(d.rows)&&d.rows>=0&&d.rows<=4096&&hash(d.sha256),'TABLE_DIGEST');}
}
/** The exact SQL JSONB serialization is the digest input; no JS numeric or date transport. */
export function fastIdleTableDigestSql(table:string){need((FAST_IDLE_TABLES as readonly string[]).includes(table),'TABLE_NAME');return `SELECT count(*)::integer rows,encode(sha256(convert_to(COALESCE(jsonb_agg(r ORDER BY r::text),'[]'::jsonb)::text,'UTF8')),'hex') sha256 FROM (SELECT to_jsonb(t) r FROM zee.${table} t ORDER BY to_jsonb(t)::text LIMIT 4097) bounded`;}
export interface FastIdleLaunchState {control:{epoch:string;xmin:string;accepting_orders:boolean;dispatch_enabled:boolean;reconciliation_required:boolean};tableDigests:Record<string,TableDigest>;counts:Record<string,number>;originalWorkerAlive:boolean;financialProcessPids:number[];sources:{network:string;scanned_height:string;finalized_height:string;observed_at:string|Date}[];checkedAt:string|Date}
export const FAST_IDLE_ZERO_COUNTS=['nonterminal_orders','held_obligations','unreleased_reservations','reserved_inventory','unconfirmed_base','unconfirmed_commit','unconfirmed_native','unconfirmed_settle','unconfirmed_refund','unresolved_transactions','unconfirmed_operations','pending_jobs','financial_leases'] as const;
export function requireFastIdleLaunchState(p:FastIdleLaunchProof,s:FastIdleLaunchState){
 need(s.control.epoch===p.effectiveEpoch&&s.control.xmin===p.controlXmin&&s.control.accepting_orders===true&&s.control.dispatch_enabled===true&&s.control.reconciliation_required===false,'EXACT_ACTIVE_IDLE_CONTROL');
 need(!s.originalWorkerAlive&&s.financialProcessPids.length===0,'PHYSICAL_QUIESCENCE');
 need(Object.keys(s.counts).sort().join()===FAST_IDLE_ZERO_COUNTS.slice().sort().join()&&FAST_IDLE_ZERO_COUNTS.every(k=>s.counts[k]===0),'NO_UNRESOLVED_FINANCE');
 need(Object.keys(s.tableDigests).sort().join()===FAST_IDLE_TABLES.slice().sort().join()&&FAST_IDLE_TABLES.every(t=>s.tableDigests[t]?.rows===p.tableDigests[t]!.rows&&s.tableDigests[t]?.sha256===p.tableDigests[t]!.sha256),'EXACT_CLOSED_BOOKS');
 const now=new Date(s.checkedAt).getTime();need(Number.isFinite(now)&&s.sources.length===2&&new Set(s.sources.map(x=>x.network)).size===2&&['zcash-testnet','base-sepolia'].every(n=>s.sources.some(x=>x.network===n)),'SOURCES');
 for(const row of s.sources){const age=now-new Date(row.observed_at).getTime();need(/^(0|[1-9][0-9]*)$/.test(row.scanned_height)&&/^(0|[1-9][0-9]*)$/.test(row.finalized_height)&&BigInt(row.scanned_height)>=BigInt(row.finalized_height)&&Number.isFinite(age)&&age>=-5000&&age<=60000,'FRESH_SOURCES');}
}
/** wx is the sole mutation: consume this reviewed launch even if the following start fails. */
export async function consumeFastIdleLaunch(path:string,proofSha256:string,workerConfigSha256:string){
 need(hash(proofSha256)&&hash(workerConfigSha256),'CONSUMPTION_PINS');const file=await open(path,'wx',0o600);
 try{await file.writeFile(JSON.stringify({version:1,purpose:'ROOT_BASE_L2_IDLE_LAUNCH_CONSUMED',proofSha256,workerConfigSha256,consumedAt:new Date().toISOString()}));await file.sync();}finally{await file.close();}
 if(process.platform==='linux'){const directory=await open(dirname(path),'r');try{await directory.sync();}finally{await directory.close();}}
}
