# Event-first Envio storage correction — completed source milestone

The bounded source-storage correction is complete: the original Envio source
resumed without reset, legacy per-block rows were removed after verified backups
and undo-horizon checks, physical space was reclaimed, and the corrected Docker
engine/export services are following with healthy status. Application source
identity cutover, its large contiguous recovery, UI readiness and financial
activation remain separate open work. Source health does not establish app or
financial readiness.

The incident came from the V1 handler persisting one `BlockVisit` entity for every
Base block, including empty blocks, with duplicated header JSON. SDK undo-history
pruning did not prune that ordinary entity table. Initial observations put the
relation at approximately 701–702 MB, about 98% of the source database, with roughly
10 MiB/hour growth. Chef was approximately 8.3 MiB. Root paused the old engine at
04:06:11 UTC, preserving progress 50328502 / checkpoint 1199852. The Native app
observer had failed earlier; that failure was not caused or repaired by this
source operation.

## Storage and proof contract

The correction retains Envio 3.14.0, the exact entity schema and handler name.
The new producer overwrites the single `84532:source-tip` row using the existing
BlockVisit shape. Its old `coverageComplete` field is false, both header JSON
fields are null, and its timestamp is an actual non-preload processor observation.
There is no external header RPC per processed block. Selected event rows still
grow with actual contract events; this is not a promise of zero future storage
growth or constant WAL/undo usage.

The separately versioned exporter captures SDK progress, its exact native
checkpoint ID/chain/height/hash, the processor tip and selected events in one
read-only MVCC snapshot. It obtains every requested header from canonical RPC
and compares SDK events with actual `eth_getLogs`: address, block/transaction/log
positions, hashes, topics/data and removed status. Supported optional provider
seconds/milliseconds fields must match the independently checked header second;
unknown extras refuse. A structural JSON parser is not an RPC attestation, so
consumers and qualification repeat the asynchronous RPC checks.

Processor time and actual RPC sample time remain separate. Their minimum governs
freshness; fresh RPC cannot renew a dead processor. The actual SDK undo floor is
retained. Forward SDK progress during a read is allowed with canonical fences;
rollback/fork, stale/future clocks, log omissions/extras/duplicates/removals and
deadline violations refuse. The per-HTTP maximum is 64 blocks, preserving the
40-block lag and 30-second read bounds rather than advertising an unworkable 256
headers at 24 methods/second. These are bounds, not a provider latency guarantee.
There is no birthday-wide `generate_series` completeness scan in V2 and no
complete certificate inferred from a height alone.

The projection/generation is explicitly new and derived from actual producer
file bytes. Old profiles, HMAC admission bytes, bootstrap receipts and financial
history were preserved. The two new source views committed with original view
definitions and all 48 table counts unchanged at that step. They were not rerun
to fix subsequent runtime errors. App adoption requires its own explicit FILE
cutover and contiguous recovery; no app checkpoint advance was inferred from
source qualification. Switching to Ponder was deferred because correcting this
storage/proof model avoided an additional framework migration; this is not a
claim that Ponder lacks suitable retention features.

## Verification and corrected runtime

Local source/model/consumer/selector and existing admission regressions passed
42 tests with zero skips plus API typechecking. The isolated PostgreSQL reclaim
fixture passed 6/6. Actual restored-SDK resume, pruning and follow after controlled
storage rollback preserved event/legacy fingerprints with no numeric-row
resurrection. That is not a full natural reorg driven through IndexerState.
The restored HTTP fixture passed all ten actual role/auth/range/event/concurrency/
cleanup checks plus independent RPC verification. Its earlier refused attempt
was retained with cause unproven; the later pass does not reclassify it.

Rehearsals identified the installed SDK's SSL literal (`false`, not `disable`),
automatic declaration generation requiring isolated generated-output writes, and
native Rust HTTPS requiring the pinned host CA bundle. Verification was never
disabled. The first production-source attempt then exposed two wrapper defects:
injecting `NODE_ENV=production` into the engine suppressed SDK environment defaults,
and a signal-only fatal promise did not keep Node's event loop alive. The failed
container and fatal state were retained. Independent readback confirmed progress
50328502/checkpoint1199852, no tip, 1,199,852 legacy rows and 2 selected events: the
failed attempt did not advance source rows. No actual restart storm is claimed.

The engine now preserves its original absent `NODE_ENV`; only export selects
production mode. No SDK patch or fabricated Hasura credentials/defaults were
added. An installed-SDK Env.res import fixture reproduced the environment issue
with fake DB fields and no Main/DB-client import. The fatal hold now has a
referenced idle handle, cleared with both signal listeners on TERM/INT. It never
retries a child or renews source health. Root's final Linux suite passed 22/22,
zero skipped, including actual exit→latch→drain→idle hold→TERM and real CLI
startup-refusal→idle hold→INT cases. Peer review cleared the correction.

Final image: `sha256:a13db137077e124c32fe4a31f322f8f477aecd54c95fc7fe61309bffb5b0cfd6`.
Runtime raw SHA256: `6a6538e5732055167ddb84a1dccc944b49a13430ca3d467de6bf81a993ae8963`.
The source uses an explicit V2 descriptor/command/health branch; V1 guards remain
separate. Only new generated declarations/cache are writable, with public code,
SDK and CA mounts read-only. No laptop Docker or production Postgres/Hasura
container was introduced; the source continues using the existing Neon DB.

## Actual original-source maintenance

The corrected source resumed 50328502 without reset. Before cleanup, actual HTTP
plus independent RPC verified one selected event on the second read (4,832 ms);
the first read refused `EVENT_FIRST_INDEPENDENT_SOURCE` after 2,912 ms and remains
part of the record. Empty-range verification passed with 0 events (4,746 ms), and
64 headers passed on the first read (9,700 ms). These bounded observations are not
a performance guarantee. Source qualification reached 50388531 with undo floor
50388332, 1,199,852 legacy visits, one tip, zero numeric undo rows and 2 events.

Root then stopped all source writers and created a fresh full PostgreSQL 18
backup: 77,090,142 bytes, SHA256
`1b020cfa7d65b032f316bcf6b604cff2be9942a066d72651eaec44ce02cb717e`.
Its actual isolated PostgreSQL 18 restore matched all 48 row counts and logical
digests. This was additional to the original 69,251,708-byte pre-change backup
and its 48-table verified restore. Backup files and raw operator receipts remain
private; copying a backup alone was never counted as reclaimed space.

Before cleanup, independent application readback matched frozen control
E220 / xmin 617365, 70 financial rows with unchanged ledger digest (prefix `b107`),
zero authorization rows, unchanged admission bytes, SQL Base checkpoint 50174047
and all 269 retained Base rows. These facts were rechecked around maintenance;
the source operation did not authorize a financial control change.

The exact `BlockVisit$84532` leaf DELETE removed 1,199,852 legacy numeric visits and
was classified committed using the original transaction. Only that leaf and its
derived parent logical digest changed; the other 46 tables matched exactly.
The one tip, selected events, SDK checkpoints/metadata and application history
were preserved. A separate VACUUM FULL preserved the post-delete logical state
and reclaimed physical storage:

| Measurement | Observed bytes |
|---|---:|
| Source DB before the first source advancement |718,249,984|
| Source leaf at cleanup inspection |704,266,240|
| Source leaf before VACUUM FULL, after autovacuum activity |625,434,624|
| Source leaf after VACUUM FULL |32,768|
| Source DB after reclamation |17,432,576|
| Source DB after actual SDK restart/follow |18,284,544|

The actual post-cleanup SDK resumed the exact persisted height 50389387 and
followed to 50398531 (+9144), with one visit, zero numeric visits, zero numeric undo
rows and 2 events. No legacy numeric rows resurrected. Actual HTTP plus independent
RPC again verified the one-event range (4,729 ms) and empty range (4,801 ms), both on the
first read.

Both source containers were running and healthy when Root restored their
`unless-stopped` policies. Old host units remain disabled and condition-blocked;
old failed containers remain stopped with restart policy `no`. All test Postgres
containers are off. This is observed source follow and measured reclamation,
not a crash/reboot test or global app readiness. No paid upgrade, other-branch
deletion, app-consumer activation, financial execution or G5 restart occurred.

## Measurement limits and remaining work

PostgreSQL's measured DB/relation reduction above is actual. Neon control-plane
`logical_size` still reported 770,416,640 bytes after compaction. Its 84% alert
meter/quota scope was not reconciled with these PostgreSQL measurements. No claim
is made that the alert percentage dropped, that current quota utilization was
refreshed, or that PITR/history storage decreased. No exhaustion forecast is made.

The bounded source-storage milestone is complete. App source-identity adoption,
large contiguous recovery, UI readiness and financial activation remain open.
The [rollout runbook](../runbooks/envio-event-first-source.md) keeps their distinct
gates. Operator actions were performed by Root; the implementing agent made no
live database, Docker or service changes.
