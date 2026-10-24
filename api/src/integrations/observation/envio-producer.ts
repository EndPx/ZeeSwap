import { requireThat, validatePolicy, type Policy } from './types.ts';

/** SQL views, not a second writer. Envio 3.14.0 commits entity changes,
 * envio_chains.progress_block and rollback in its own transaction. Reading
 * these views in one MVCC snapshot therefore shares that boundary. */
export function envioProducerViews(schema: string, policy: Policy, generation: string): string {
  validatePolicy(policy);
  requireThat(/^[a-z_][a-z0-9_]{0,62}$/.test(schema) && /^[a-zA-Z0-9_-]{1,100}$/.test(generation), 'INVALID_PRODUCER_ID');
  requireThat(policy.adapter === 'envio-hyperindex' && (policy.contractVersion ?? 'v1') === 'v1', 'WRONG_ADAPTER');
  const s = `"${schema}"`;
  return `CREATE OR REPLACE VIEW ${s}.zee_headers AS
SELECT 'base-v1'::text AS stream_id, "blockNumber" AS block_height, "headerJson"::jsonb AS payload
FROM ${s}."BlockVisit" WHERE "coverageComplete" = true;
CREATE OR REPLACE VIEW ${s}.zee_events AS
SELECT 'base-v1'::text AS stream_id, id, "blockNumber" AS block_height,
"transactionIndex" AS transaction_index, "logIndex" AS log_index,
jsonb_build_object('kind','base-contract-event','chainId',84532,'contract',contract,
'abiDigest','${policy.abiDigest}','txHash',"txHash",'transactionIndex',"transactionIndex",'logIndex',"logIndex",
'block',jsonb_build_object('height',"blockNumber",'hash',"blockHash",'parentHash',"blockParentHash",'time',
to_char(to_timestamp("blockTimestamp") AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
'event',"eventName",'settlementId',"settlementId",'token',token,'amountAtomic',"amountAtomic"::text,
'decoded',"decodedJson"::jsonb) AS payload
FROM ${s}."SettlementEvent" WHERE contract = '${policy.contract}' AND token = '${policy.token}' AND "contractVersion" = 'v1';
CREATE OR REPLACE VIEW ${s}.zee_checkpoint AS
SELECT 'base-v1'::text AS stream_id, jsonb_build_object(
'generation','${generation}',
'revision',pg_snapshot_xmax(pg_current_snapshot())::text,
'through',v."headerJson"::jsonb,
'recoveryFloor',COALESCE((SELECT MIN(block_number)+1 FROM ${s}.envio_checkpoints WHERE chain_id=84532),c.progress_block+1),
'sourceSampledAt',v."sourceSampledAt",'sourceHead',v."sourceHeadJson"::jsonb,
'projectionDigest','${policy.projectionDigest}','registryDigest','${policy.registryDigest}',
'complete',v."coverageComplete" AND NOT EXISTS (
SELECT 1 FROM generate_series(${policy.birthday},c.progress_block) n
LEFT JOIN ${s}."BlockVisit" b ON b.id = '84532:' || n::text
WHERE b.id IS NULL OR NOT b."coverageComplete")) AS payload
FROM ${s}.envio_chains c JOIN ${s}."BlockVisit" v ON v.id='84532:' || c.progress_block::text
WHERE c.id=84532 AND c.start_block=${policy.birthday};`;
}
