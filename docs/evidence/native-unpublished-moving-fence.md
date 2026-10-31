# Native consumer unpublished moving-fence recovery

31 October 2026. Consumer-only change; no Core, Prep, Chef producer, source
generation, UFVK, birthday, SQL financial state or cursor edits.

## Actual diagnosis

The remote Native observer exited 78 at 04:50:54 UTC after a typed
`CANONICAL_CHECKPOINT_MISMATCH` during `TRAVERSE`, before publication. The
Source checkpoint was 4562060, while the independently read header at that
height had a different hash. Its persisted-range recheck then failed
`CHEF_PERSISTED_RANGE_CHANGED`: the independent end fence changed during the
read. This is evidence of competing unpublished tip views, rather than proof
that the persisted consumer cursor was orphaned.

A subsequent read-only check compared the actual private consumer cursor at
4562058 with the independent canonical header at that same height. Both were
`0000345f0dba957f84447fad3a70290ce080bc3711022a75eeb97d224738f396`.
The independently reread 4562060 retained the diagnostic's actual-header side.
No cursor rollback was justified or performed. The historical customer source
height 4560329 was independently readable; this check alone does not prove all
financial receipts or cross-chain settlement.

## Behavior

The dense reader now emits a typed changed-fence error with the two validated
headers. Only a typed prepublication Source-checkpoint mismatch in `TRAVERSE`
may defer when that changed fence is exactly the unpublished checkpoint above
all stored anchors, with a changed hash and a bounded recent range. The existing
wrapper first verifies the actual persisted checkpoint hash before any fence
read. A known checkpoint conflict cannot be hidden by a later fence failure.

The consumer performs its existing two unchanged SQL/configuration/cursor/source
identity checks, discards the failed range, and reports
`WAIT_UNVERIFIED_CANONICAL_READ`. It issues no positive prefix or freshness proof,
publishes no snapshot, writes no cursor and gains no dispatch authority. The next
ordinary cycle obtains new actual Source observations. Generic string errors,
timestamp-only changes, persisted-height conflicts, malformed ranges, changed
identities, changed world state and postpublication failures remain fail closed.

This defer is not automatic reopening authority. Root supervision separately
qualifies closed financial state, canonical historical receipts, current
generations and both fresh sources before reopening. A consumer restart retains
the actual cursor and recovery journal. A genuine persisted-cursor reorg still
requires a separately reviewed recovery path.

## Verification

Local targeted checks cover both changing fence reads, no positive witness or
metadata mutation, generic/persisted/timestamp-only fence failures and changed
worlds, plus the existing checkpoint, identity, financial-anchor and fatal-exit
guards. API typecheck passed. The focused run passed all 44 tests across
`chef-recent-prefix-wait`, `chef-persisted-range`, `chef-head-change`,
`chef-fatal-supervision` and `chef-mature-tail`. Three archival-reader fixtures
initially failed because their reader intentionally rejects unpublished heights
while the current helper selects its recent-prefix path; those fixtures now
explicitly disable that path to exercise their intended full-history audit.
No remote deployment or live reopening is claimed here.

## Ordinary archive growth boundary, 31 October

A later read-only diagnosis found the ordinary consumer repeatedly exiting 1
with `CHEF_PERSISTED_STATE_BOUND` in `READ_PERSISTED`, before traversal. The
native observation archive contained 10,006 rows, exceeding the reader's fixed
10,004-header snapshot limit. The retained financial tables contained two
native deposits, one source refund and no reverse payout. This failure did not
establish a stale producer or an unchanged-tip freshness problem.

The ordinary consumer now explicitly reads its current checkpoint ancestry
commitment, the ten-height overlap ending at that checkpoint, scanned/finalized
headers and every retained financial-anchor height. Its single SQL snapshot
also retains the original exact financial rows, runtime control and an archive
count/minimum/maximum summary. Both unchanged-world rereads use the same scope.
Historical observation rows remain stored. Root linked/current recovery readers
retain their original full-prefix read and bounds. The ordinary diagnostic
explicitly records its projected-anchor scope and
`allHistoricalHeadersAudited: false`; it makes no full-archive audit claim.

Checkpoint/cursor identity, fresh independent canonical reads, financial-anchor
hashes, source identity, two unchanged-world checks and postpublication failure
guards remain required. The change does not refresh timestamps, advance cursors
without ingestion, delete history or raise a lifetime archive cap.

Local verification passed API typecheck and 36 focused tests across ordinary
persisted-state bounds, recent-prefix waits, volatile heads, sibling ancestry,
live cursor publication, fatal supervision and deferred source rechecks.
Deployment and actual read-only SQL qualification are separate operator steps;
these local results alone do not establish remote availability.
