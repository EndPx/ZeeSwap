# Explicit parallel consumer execution

This optional collection profile changes host-side independent verification,
Source read overlap and private-case byte accounting. It does not change the
Source Docker/SDK/export protocol, source generation, immutable completed selector,
SQL/admission checkpoint, financial authority or old serial execution release.

Root selects the exact profile in a NEW read-only permit and its private runtime
config. Omitting it retains the original serial path. Any profile/config mismatch
refuses; an old permit cannot enable the new path by changing a command flag.

```json
{
  "version": 1,
  "mode": "PARALLEL_HEADERS_PREFETCH_ONE",
  "headerGroups": 2,
  "maxHeaderBatch": 10,
  "consumerMethodsPerSecond": 24,
  "sourcePrefetchDepth": 1,
  "maxRawPacketBytes": 8000000,
  "independentReadBudgetMs": 30000,
  "byteAccounting": "OWNED_EXACT_BYTES_V1",
  "fullAuditEveryPackets": 256
}
```

## Old selection witness and new execution pins

Keep the completed selector and its old code-manifest files at their original
paths and bytes. They establish the adopted Source identity. Install the new
consumer in a separate immutable release and bind its actual public source,
runtime JSON and dependencies in the NEW execution code manifest. The new permit
retains the same SQL/admission baseline and source identity while carrying the
new `execution` descriptor and `codePins`.

Both entrypoints check mandatory pins against their actual executing file URL,
including the new profile/verifier/ledger and snapshot-schema JSON. Old selector
paths cannot satisfy that check. The source loader still validates the original
completed selector independently; it does not remap its witness onto new bytes.
Local tests bind an unchanged completed selector and a distinct execution release.
Actual installed-code/role/profile qualification remains Root's operator gate.

Archive the old read permit, two-packet prefix, diagnostics and marker lineage
through the reviewed Root procedure before creating a separate new campaign.
Do not relabel records with a new permit SHA or overwrite the old release. A new
explicit Root read permission is not an automatic extension of the previous TTL.

## Header/RPC concurrency and raw lookahead

The consumer has one fixed PublicNode reader queue paced at24 methods/s. Every
sample/header/log request and both header workers use that queue; batches remain
at most10. At most two ordered header groups run concurrently. A first failure
aborts and waits for both workers before returning the original error. Parallel
sample ancestry reads are also aborted and drained on failure. No retry exists.

The consumer may hold one current packet and one future raw packet, each bounded
to8MB at HTTP/schema boundaries. Only one Source export is in flight: future
dispatch begins after the current raw response has completed. Source's existing
reader queue remains unchanged. These are per-reader queues, not a claim of a
global combined24-method limit; Root must qualify actual aggregate RPC behavior.

Raw future data is not independent proof or acknowledged coverage. Its dispatch
starts one30-second packet deadline shared by status/raw/wait/verification and
durable acceptance. Original producer/read/expiry clocks are never renewed.
Before each accepted packet the current reader world, lease, code, selector,
admission, canonical anchors, exact range/seam, all headers/logs and original
freshness/40-block lag/finality/reorg checks still pass. Unknown events refuse.

No future data is written before its own complete verification and current fences.
Any failure, expiry, stop or invocation end aborts and awaits the pending future.
Expired buffered packets cannot trigger another speculative dispatch. A stop
during an already durable current append preserves that valid prefix but reports
failure rather than success. SIGTERM/SIGINT and final sample/metrics use the same
remaining invocation deadline. Pilot remains20 packets/five minutes.

The same `EVENT_FIRST_INDEPENDENT_SOURCE` code now carries only derived scalar
conjuncts/heights/clocks. The operator CLI allowlists those fields on failure.
It never emits raw events, auth, memos, recipients or arbitrary provider details.
The actual old invocation's composite failure did not prove which conjunct failed;
successful later gate samples do not retroactively identify it.

## Exact byte ledger and audits

Only the explicit new profile uses the ledger. Startup still verifies the complete
original store and scans actual case entries, sizes, ownership, nonsymlink paths
and hashes. It includes original permit/admission, numeric issued resumes, hash
ACKs, metrics, packets, records, segments and directories. Unknown entries refuse.
No saved counter replaces that scan. The existing single writer lock remains.

For each append, packet/record/segment/temp-manifest serialized buffers are known
and reserved together before IO. Both old and temporary manifests remain charged
until rename, directory fsync and exact readback succeed. Only then is the old
manifest released. Every resumed permission/ACK and metric written by the new
path is charged before effect. Any ambiguous write/fsync/readback poisons the
instance and stops; it does not release optimistic bytes or retry.

Production limits remain512MiB,42,000 campaign entries and40,000 store files,
including temporary replacement peaks. The1,000,000-block/16,384-packet/24-hour
and packet/RPC limits are unchanged. Unit-test limits may only lower these caps.

At every256-packet seal and before finish the complete Source-proof store and
actual byte/hash inventory are audited. Before accepting packet256 (current
count255), lookahead is suppressed so no future Source packet ages during audit.
Audit occurs after the accepted packet's30-second acceptance check, under the
global invocation/authority deadline, and before a fresh Source dispatch. Audit
time is included in reported elapsed throughput. Publication retains its original
full scans and separately fresh authority; this profile does not optimize it.

## Qualification remains open

Local synthetic concurrency/cancellation/filesystem tests establish mechanics,
not actual Source throughput or provider limits. Root must qualify the new release,
reader/code pins, fresh permit and actual20-packet Linux pilot. Near-terminal
full-audit latency and real proof sizes must be measured before an owned job.
The private metadata benchmarks use tiny synthetic files and make no chain-proof,
real disk-throughput, financial or catch-up-completion claim.

An actual pilot rate must exceed actual head growth and fit the remaining original
TTL, projected verified-block/packet count, disk and RSS budget with margin. No
owned run follows automatically. Root's separate publication/current-tail and
ordinary application-observer following gates remain open; collecting history is
not SQL publication, service activation or financial readiness.
