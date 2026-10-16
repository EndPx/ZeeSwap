import {createHash} from 'node:crypto';
import type pg from 'pg';
import {readFile} from 'node:fs/promises';
import type {G5State} from './g5-run.ts';
import {accessHash,type PrivateData} from './private-data.ts';
export const g5AttemptDigest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Only the audited Source7 predecessor and the explicitly reviewed Source13
 * predecessors, followed only by Source15. Every exception remains independently authenticated. */
export function requireG5ArchivedAttempts(state:G5State):any[]{
 const archive=state.archivedAttempts;
 if(archive===undefined){if(state.orders.some(o=>o.attempt!==undefined))throw Error('G5_UNAUDITED_QUOTE_ATTEMPT');return [];}
 if(state.runId!=='1f34e059-4de1-49f6-bbaa-323008577994'||state.batchSize!==5||!Array.isArray(archive)||![1,2,3].includes(archive.length))throw Error('G5_ONLY_LITERAL_ARCHIVED_SOURCE7_ATTEMPT');
 for(const [i,a] of archive.entries()){
  const sequence=[7,13,15][i],current=state.orders[sequence-1];
  if(a?.version!==1||a.sequence!==sequence||a.attempt!==1||a.direction!=='ZCASH_TO_BASE'||!a.orderId||!a.owner||!a.receiver||a.verified||a.receiptVerified
   ||!current||current.sequence!==sequence||current.attempt!==2||current.owner===a.owner||current.orderId===a.orderId||current.receiver===a.receiver
   ||typeof a.fundingFile!=='string'||!a.fundingFile.endsWith('.funding-'+sequence+'.json')||!a.auditFile||!/^[0-9a-f]{64}$/.test(a.auditSha256)||!/^[0-9a-f]{64}$/.test(a.fundingSha256)||!/^[0-9a-f]{64}$/.test(a.fundingBindingSha256)||!/^[0-9a-f]{64}$/.test(a.quotePayloadSha256)||!/^[1-9][0-9]*$/.test(a.cutoffHeight)||!Number.isFinite(Date.parse(a.archivedAt))||!/^[1-9][0-9]*$/.test(a.epoch))throw Error('G5_ONLY_LITERAL_ARCHIVED_SOURCE7_ATTEMPT');
 }
 if(state.orders.some(o=>o.attempt!==undefined&&!archive.some(a=>a.sequence===o.sequence))||new Set(archive.map(a=>a.orderId)).size!==archive.length||new Set(archive.map(a=>a.receiver)).size!==archive.length||new Set(archive.map(a=>a.owner)).size!==archive.length||state.orders.some(o=>archive.some(a=>a.orderId===o.orderId||a.owner===o.owner||a.receiver===o.receiver)))throw Error('G5_UNAUDITED_QUOTE_ATTEMPT');
 return archive;
}
/** Compatibility for the completed, immutable Source7 recovery. */
export function requireG5ArchivedAttemptState(state:G5State){return requireG5ArchivedAttempts(state)[0];}
export function g5FundingArtifact(stateFile:string,state:G5State,sequence:number){
 const archives=requireG5ArchivedAttempts(state),slot=state.orders.find(o=>o.sequence===sequence);
 return stateFile+'.funding-'+sequence+(archives.some(a=>a.sequence===sequence)&&slot?.attempt===2?'-attempt-2':'')+'.json';
}
/** The configured original argv is immutable; substitute only its exact funding
 * value with the authenticated current attempt's artifact. Never use a shell. */
export function g5SourceFundingArgv(args:string[],original:string,current:string){
 const positions=args.flatMap((a,i)=>a==='--funding'?[i]:[]);if(positions.length!==1||args[positions[0]+1]!==original)throw Error('G5_SOURCE_FIXED_FUNDING_ARGV_REQUIRED');
 const next=[...args];next[positions[0]+1]=current;return next;
}
export function validateG5ArchivedAttemptBooks(state:G5State,books:any,keys:PrivateData){
 for(const a of requireG5ArchivedAttempts(state)){
 const q=books.quotes.find((q:any)=>q.id===a.orderId),o=books.orders.find((o:any)=>o.id===a.orderId);
 if(!q||!o||q.direction!=='ZCASH_TO_BASE'||q.input_amount!=='100000'||q.output_amount!=='100000'||q.payout_fee!=='50000000000000'||q.refund_fee!=='10000'||!q.access_hash.equals(accessHash(a.owner))||createHash('sha256').update(q.private_payload).digest('hex')!==a.quotePayloadSha256||o.state!=='EXPIRED_UNFUNDED'||o.primary_deposit!==null||String(o.funding_cutoff_height)!==a.cutoffHeight)throw Error('G5_ARCHIVED_SOURCE7_SQL_ANCHOR_REQUIRED');
 const privateQuote=keys.open(q.private_payload,`quote:${q.id}:v1`) as any;
 const funding={orderId:a.orderId,receiver:a.receiver,memo:JSON.stringify({v:1,ref:privateQuote.reference}),amountZatoshi:'100000',maxFeeZatoshi:'10000',cutoffHeight:a.cutoffHeight};
 if(privateQuote.depositReceiver!==a.receiver||g5AttemptDigest(funding)!==a.fundingBindingSha256||!q.deposit_reference_hash.equals(keys.lookup('reference',privateQuote.reference))||!q.receiver_hash.equals(keys.lookup('receiver',a.receiver)))throw Error('G5_ARCHIVED_SOURCE7_FUNDING_BINDING_REQUIRED');
 for(const name of ['deposits','obligations','operations','forwards','commits','settles','shielded','refunds','bindings','escrowBindings'])if(books[name].some((r:any)=>r.order_id===a.orderId||name==='deposits'&&(r.receiver_hash.equals(q.receiver_hash)||r.reference_hash.equals(q.deposit_reference_hash))))throw Error('G5_ARCHIVED_SOURCE7_LATE_OR_FINANCIAL_EFFECT');
 if(books.jobs.some((j:any)=>books.operations.some((op:any)=>op.order_id===a.orderId&&op.id===j.operation_id)))throw Error('G5_ARCHIVED_SOURCE7_JOB_EXISTS');
 const reserves=books.reservations.filter((r:any)=>r.order_id===a.orderId),expected=[['mockUSDC','principal','100000'],['baseETH','fee','50000000000000'],['TAZ','fee','10000']];
 if(reserves.length!==3||expected.some(([asset,purpose,amount])=>reserves.filter((r:any)=>r.asset===asset&&r.purpose===purpose&&r.amount===amount&&r.released_at).length!==1))throw Error('G5_ARCHIVED_SOURCE7_RELEASED_RESERVES_REQUIRED');
 const rows=books.ledger.filter((r:any)=>r.order_id===a.orderId),totals=new Map<string,bigint>(),events=new Map<string,bigint>();
 const expiryEvents=[...new Set(rows.filter((r:any)=>r.event_id!==a.orderId).map((r:any)=>r.event_id))];
 if(expiryEvents.length!==1||rows.length!==12||expected.some(([asset,purpose,amount])=>[
  [a.orderId,purpose+':available','-'+amount],[a.orderId,purpose+':reserved',amount],
  [expiryEvents[0],purpose+':reserved','-'+amount],[expiryEvents[0],purpose+':available',amount]
 ].some(([event,bucket,value])=>rows.filter((r:any)=>r.asset===asset&&r.event_id===event&&r.bucket===bucket&&r.amount===value).length!==1)))throw Error('G5_ARCHIVED_SOURCE7_EXACT_RELEASE_EVENTS_REQUIRED');
 for(const r of rows){if(!expected.some(([asset,purpose,amount])=>r.asset===asset&&[purpose+':available',purpose+':reserved'].includes(r.bucket)&&(r.amount===amount||r.amount==='-'+amount)))throw Error('G5_ARCHIVED_SOURCE7_UNEXPECTED_LEDGER');const key=r.asset+':'+r.bucket;totals.set(key,(totals.get(key)??0n)+BigInt(r.amount));const event=r.event_id+':'+r.asset;events.set(event,(events.get(event)??0n)+BigInt(r.amount));}
 if(rows.length!==12||[...totals.values(),...events.values()].some(n=>n!==0n)||books.events.filter((e:any)=>e.order_id===a.orderId).map((e:any)=>e.event_type).sort().join(',')!=='ACCEPTED,EXPIRED_UNFUNDED')throw Error('G5_ARCHIVED_SOURCE7_BALANCED_EXPIRY_REQUIRED');
 }
}
export async function g5RunDatabasePartition(db:Pick<pg.Pool,'query'>,state:G5State,keys:PrivateData,stateFile?:string){
 const quotes=(await db.query('SELECT * FROM zee.quotes ORDER BY id')).rows,orders=(await db.query('SELECT * FROM zee.orders ORDER BY id')).rows,archives=requireG5ArchivedAttempts(state);
 if(archives.length){await requireG5ArchivedAttemptArtifacts(state,stateFile);const tables={deposits:'deposits',obligations:'obligations',operations:'operations',jobs:'outbox_jobs',reservations:'reservations',forwards:'base_attempts',commits:'escrow_commits',settles:'escrow_settlements',shielded:'reverse_payouts',refunds:'source_refunds',ledger:'ledger_entries',events:'order_events',bindings:'base_bindings',escrowBindings:'escrow_bindings'},books:any={quotes,orders};for(const [key,table] of Object.entries(tables))books[key]=(await db.query(`SELECT * FROM zee.${table}`)).rows;validateG5ArchivedAttemptBooks(state,books,keys);}
 const currentOrders=orders.filter(o=>!archives.some(a=>o.id===a.orderId)),currentQuotes=quotes.filter(q=>!archives.some(a=>q.id===a.orderId));
 if(state.orders.some(s=>s.orderId&&(!currentOrders.some(o=>o.id===s.orderId)||!currentQuotes.some(q=>q.id===s.orderId)))||currentOrders.some(o=>!state.orders.some(s=>s.orderId===o.id))||currentQuotes.some(q=>!state.orders.some(s=>s.orderId===q.id||!s.orderId&&q.access_hash.equals(accessHash(s.owner)))))throw Error('G5_UNMANIFESTED_QUOTE_OR_ORDER');
 return {orders:currentOrders,quotes:currentQuotes,expiredUnfundedAttempts:archives.length,acceptedQuoteCount:quotes.length};
}

export async function requireG5ArchivedAttemptArtifacts(state:G5State,stateFile:string|undefined,read:(file:string)=>Promise<Buffer>=readFile){
 for(const a of requireG5ArchivedAttempts(state)){
 if(!stateFile||a.fundingFile!==stateFile+'.funding-'+a.sequence+'.json'||a.auditFile!==stateFile+'.source'+a.sequence+'-expired-audit.private.json')throw Error('G5_ARCHIVED_SOURCE7_FIXED_ARTIFACT_REQUIRED');
 const fundingBytes=await read(a.fundingFile),auditBytes=await read(a.auditFile);
 if(createHash('sha256').update(fundingBytes).digest('hex')!==a.fundingSha256||createHash('sha256').update(auditBytes).digest('hex')!==a.auditSha256)throw Error('G5_ARCHIVED_SOURCE7_ARTIFACT_CHANGED');
 const funding=JSON.parse(fundingBytes.toString('utf8')),audit=JSON.parse(auditBytes.toString('utf8'));
 if(g5AttemptDigest(funding)!==a.fundingBindingSha256||funding.orderId!==a.orderId||funding.receiver!==a.receiver||funding.cutoffHeight!==a.cutoffHeight||audit.version!==1||audit.status!=='G5_SOURCE'+a.sequence+'_NO_EFFECT_EXPIRY_AUDIT'||audit.runId!==state.runId||audit.sequence!==a.sequence||audit.orderId!==a.orderId||audit.cutoffHeight!==a.cutoffHeight||audit.fundingSha256!==a.fundingSha256||audit.epoch!==a.epoch)throw Error('G5_ARCHIVED_SOURCE7_AUDIT_BINDING_REQUIRED');
 }
}
