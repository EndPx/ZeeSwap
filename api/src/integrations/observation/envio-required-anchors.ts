import type pg from'pg';
import{requireThat}from'./types.ts';
import type{FundingHint}from'./envio-live.ts';
/** Required current and monetary anchors only. Historical heartbeat rows remain
 * stored; their ancestor is protected by the independent last-admission hash. */
export function envioRequiredAnchorSql(schema='zee'){
 requireThat(/^[a-z_][a-z0-9_]{0,62}$/.test(schema),'INVALID_SQL_IDENTIFIER');const s=`"${schema}"`;
 return`WITH required(height,expected_hash,persist) AS (
 SELECT scanned_height,tip_hash,false FROM ${s}.scanner_checkpoints WHERE network='base-sepolia'
 UNION ALL SELECT s.finalized_height,b.block_hash,true FROM ${s}.scanner_checkpoints s LEFT JOIN ${s}.chain_observations b ON b.network=s.network AND b.height=s.finalized_height WHERE s.network='base-sepolia'
 UNION ALL SELECT block_height,block_hash,true FROM ${s}.deposits WHERE network='base-sepolia'
 UNION ALL SELECT block_height,block_hash,true FROM ${s}.base_attempts
 UNION ALL SELECT block_height,block_hash,true FROM ${s}.escrow_commits
 UNION ALL SELECT block_height,block_hash,true FROM ${s}.escrow_settlements
 UNION ALL SELECT base_height,base_block,true FROM ${s}.source_refunds
 UNION ALL SELECT height,hash,true FROM unnest($1::bigint[],$2::text[]) h(height,hash)
 ) SELECT height::text,expected_hash,bool_or(persist) AS persist FROM required WHERE height IS NOT NULL GROUP BY height,expected_hash ORDER BY height LIMIT 501`;
}
export async function requiredEnvioAnchors(pool:pg.Pool,hints:FundingHint[]){
 const rows=(await pool.query(envioRequiredAnchorSql(),[hints.map(h=>h.height),hints.map(h=>h.blockHash?.slice(2)??null)])).rows as{height:string;expected_hash:string|null;persist:boolean}[];
 requireThat(rows.length<=500,'RECONCILIATION_WINDOW_LIMIT');return rows;
}
