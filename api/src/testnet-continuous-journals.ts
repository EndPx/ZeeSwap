/** Full historical closure in bounded pages; no lifetime order/quote cutoff. */
import {lstat,opendir,readFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {posix} from 'node:path';
import type pg from 'pg';
import {publicSettlementId,type BaseRegistry} from './base-contract.ts';
import {PrivateData} from './private-data.ts';
import {qualifyClosedJournalInventory,type ClosedJournalTree,type ClosedJournalFile,type ClosedJournalSql} from './testnet-closed-journals.ts';
const ROOT='/opt/zeeswap-testnet/state',sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
function need(v:unknown,c:string):asserts v{if(!v)throw Error('CONTINUOUS_JOURNAL_'+c);}
type Db=Pick<pg.PoolClient,'query'>;
/** Keyset reader shared with the bounded-memory fixture; includes all signed phases. */
export async function readContinuousClosedJournalPage(db:Db,cursor:string|null,delivered=false):Promise<ClosedJournalSql>{
  const rows:any[]=(await db.query(`SELECT q.*,o.state,d.amount::text received_amount,a.policy_sha256,a.accepted_epoch::text ${delivered?',zee.testnet_order_delivery_included(o.id) delivery_included':''} FROM zee.orders o JOIN zee.quotes q USING(id) LEFT JOIN zee.deposits d ON d.id=o.primary_deposit LEFT JOIN zee.testnet_policy_admissions a ON a.order_id=o.id WHERE ($1::uuid IS NULL OR o.id>$1::uuid) ORDER BY o.id LIMIT 32`,[cursor])).rows;
  const ids=rows.map(r=>r.id);
  const sql={orders:rows} as ClosedJournalSql;
  for(const table of ['base_bindings','base_attempts','escrow_bindings','escrow_commits','escrow_settlements','reverse_payouts','source_refunds'] as const){
   const receipts=['base_attempts','escrow_commits','escrow_settlements','reverse_payouts'].includes(table),network=table==='reverse_payouts'?'zcash-testnet':'base-sepolia';
   const canonical=receipts?`,EXISTS(SELECT 1 FROM zee.chain_observations b JOIN zee.scanner_checkpoints c USING(network) WHERE b.network='${network}' AND b.height=t.block_height AND b.block_hash=t.block_hash AND c.finalized_height>=b.height) canonical`:table==='source_refunds'?`,EXISTS(SELECT 1 FROM zee.chain_observations b JOIN zee.scanner_checkpoints c USING(network) WHERE b.network='base-sepolia' AND b.height=t.base_height AND b.block_hash=t.base_block AND c.finalized_height>=b.height) base_canonical,EXISTS(SELECT 1 FROM zee.chain_observations b JOIN zee.scanner_checkpoints c USING(network) WHERE b.network=CASE WHEN t.base_phase='CANCEL' THEN 'zcash-testnet' ELSE 'base-sepolia' END AND b.height=t.height AND b.block_hash=t.block_hash AND c.finalized_height>=b.height) canonical`:'';
   sql[table]=(await db.query(`SELECT t.*${canonical} FROM zee.${table} t WHERE order_id=ANY($1::uuid[]) ORDER BY order_id`,[ids])).rows;
   need(sql[table].length<=128,'PAGE_SQL_BOUND');
  }
  if(delivered)for(const row of rows.filter(r=>r.delivery_included)){
   const inclusions=(await db.query(`SELECT i.*,EXISTS(SELECT 1 FROM zee.chain_observations b WHERE b.network='base-sepolia' AND b.height=i.block_height AND b.block_hash=i.block_hash) inclusion_canonical FROM zee.base_inclusions i WHERE order_id=$1 AND valid ORDER BY phase`,[row.id])).rows;
   need(inclusions.length===2,'BACKGROUND_INCLUSIONS');
   for(const attempt of sql.base_attempts.filter(t=>t.order_id===row.id)){
    const included=inclusions.find(i=>i.phase===attempt.phase);need(included&&Buffer.isBuffer(included.tx_hash)&&included.tx_hash.equals(attempt.tx_hash),'BACKGROUND_SIGNED_IDENTITY');
    Object.assign(attempt,{delivery_included:true,inclusion_canonical:included.inclusion_canonical,block_height:included.block_height,block_hash:included.block_hash,receipt_payload:included.receipt_payload});
   }
  }
 return sql;
}

/** The caller holds a repeatable-read transaction and the observer mutex. */
export async function verifyContinuousClosedBooks(db:Db,keys:PrivateData,registry:BaseRegistry,trees:ClosedJournalTree[],delivered=false){
 const boundary=delivered?'SELECT NOT zee.testnet_global_slot_busy() yes':'SELECT zee.testnet_policy_closed_books() yes';
 need((await db.query(boundary)).rows[0]?.yes===true,'BOOKS_NOT_CLOSED');
 need(trees.length===4&&new Set(trees.map(t=>t.path)).size===4&&trees.every(t=>t.path.startsWith(ROOT+'/')&&posix.normalize(t.path)===t.path),'ROOTS');
 const baseline=new Set(trees.flatMap(t=>t.files.map(f=>t.path+'/'+f.relativePath))),lock=ROOT+'/base-signer-journal/signer.lock';
 async function directory(path:string){const s=await lstat(path),service=[ROOT,ROOT+'/base-signer-journal',ROOT+'/reverse-orders'].includes(path)&&s.uid===986&&s.gid===978&&(s.mode&0o777)===0o700;
  need(s.isDirectory()&&!s.isSymbolicLink()&&await realpath(path)===path&&(s.uid===0&&(s.mode&0o022)===0||service),'DIRECTORY');}
 async function* walk(path:string):AsyncGenerator<ClosedJournalFile>{
  const st=await lstat(path);need(!st.isSymbolicLink()&&await realpath(path)===path,'CANONICAL_PATH');
  if(st.isDirectory()){await directory(path);const dir=await opendir(path);for await(const item of dir)yield* walk(path+'/'+item.name);}
  else{need(st.isFile()&&st.uid===0&&(st.mode&0o077)===0&&st.size<=16000000,'FILE');yield{path,bytes:await readFile(path)};}
 }
 async function* files(){for(const t of trees){for(let parent=posix.dirname(t.path);parent.startsWith('/opt/zeeswap-testnet');parent=posix.dirname(parent))await directory(parent);
  try{yield* walk(t.path);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;need(t.files.length===0,'MISSING_ROOT');}}
 }
 async function inventory(){const hash=createHash('sha256');let count=0;for await(const f of files()){if(f.path===lock)need(f.bytes.length===0,'LOCK_CONTENT');hash.update(f.path+'\0'+sha(f.bytes)+'\n');count++;}return{digest:hash.digest('hex'),count};}
 const before=await inventory(),qualification=createHash('sha256');let cursor:string|null=null,orders=0,matched=0,pages=0;
 for(;;){
  const sql=await readContinuousClosedJournalPage(db,cursor,delivered),rows=sql.orders;
  if(rows.length===0&&pages>0)break;
  const prefixes=new Set(rows.map(r=>sha(publicSettlementId(r.settlement_id)))),idSet=new Set(rows.map(r=>r.id));
  const page:ClosedJournalFile[]=[];let size=0;
  for await(const f of files()){
   const root=trees.find(t=>f.path.startsWith(t.path+'/'));need(root,'OUTSIDE_ROOT');const relative=f.path.slice(root.path.length+1);
   const selected=root.path===ROOT+'/base-signer-journal'?prefixes.has(relative.slice(0,64)):idSet.has(relative.split('/')[0]!);
   if(baseline.has(f.path)||f.path===lock||selected){size+=f.bytes.length;need(size<=64000000&&page.length<4096,'PAGE_FILE_BOUND');page.push(f);if(selected&&!baseline.has(f.path)&&f.path!==lock)matched++;}
  }
  const proof=await qualifyClosedJournalInventory(trees,page,sql,keys,registry,delivered);qualification.update(proof.digest+'\n');orders+=rows.length;pages++;
  if(rows.length<32)break;cursor=rows.at(-1)!.id;
 }
 const after=await inventory();need(before.count===after.count&&before.digest===after.digest,'JOURNALS_CHANGED');
 // Every original baseline file was authenticated on each page. Every new file
 // must belong to one fully checked order; unknown files cannot disappear.
 let baselineCount=0,hasLock=false;for await(const f of files()){if(baseline.has(f.path))baselineCount++;if(f.path===lock&&!baseline.has(f.path))hasLock=true;}
 need(baselineCount===baseline.size&&matched+baselineCount+(hasLock?1:0)===after.count,'UNKNOWN_OR_UNCONSUMED_FILE');
 need((await db.query(boundary)).rows[0]?.yes===true,'BOOKS_CHANGED');
 return{digest:sha(qualification.digest('hex')+'\n'+after.digest),orders,files:after.count,pages};
}
