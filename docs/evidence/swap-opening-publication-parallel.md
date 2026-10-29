# Opening publication read concurrency

Recorded 29 October 2026. Collector-only code/test checkpoint; live publication
latency must be measured by Root on the next actual scoped opening. This does
not record service activation or a completed swap/bridge circle.

## Demonstrated handoff pressure

The actual R6 opening retained Source sample 05:06:36.861 UTC, completed collection
at 05:06:45.077 UTC and issued approval at 05:06:45.216 UTC. Its local-admin intent
was recorded at 05:06:53.877 UTC; finish completed at approximately 05:07:11.572
UTC. The exact first ordinary cycle read status at 05:07:13.501 UTC, 36.640 seconds
after the retained Source sample. The Source clock was preserved throughout.

That cycle timed out while chasing a late tail. The published bounded final-tail
observer subsequently refused actual R7 with `EVENT_FIRST_FINAL_TAIL_RANGE` at
about 15.148 seconds rather than exporting a tail above 64 headers. That refusal
is preserved. This collector change reduces independent guard serialization;
it does not loosen the observer to accommodate an aged handoff.

## Same checks, bounded overlap

The collector's publication guard now runs four independent read-only groups
concurrently: protected code/config/approval/evidence/journal files; Native SQL,
cursor and actual canonical readiness; signer quiescence; and current Base
Source/finality/quiet-range verification. `Promise.allSettled` drains every
started check, and any rejection prevents progression to the next phase.

Only after that phase fully drains do the two direct Base clients run in
parallel. Each client retains its ordered opening-height hash, latest nonce and
pending nonce checks. Both client groups drain before success or failure. This
keeps the Source reader's RPC phase separate from the direct-client phase,
avoiding overlap between their independently paced queues. The final connection
and approval-clock checks run after all six groups complete successfully. The
same final fence also revalidates the returned original Native SQL/Source,
Base Source processor/independent-sample and signer-quiescence timestamps using
their existing freshness predicates. It performs no recapture or clock renewal;
a group that finished early cannot silently age past its guard during another
read. Native readiness records its parsed original source clocks for this fence.

The direct clients retain the collector's shared 75 ms method spacing. A serialized
permit queue now preserves that spacing under concurrent callers; the previous
single `last` variable alone would allow simultaneous callers to reserve the
same delay. The 700-method cap, 180-second collector RPC budget, 15-second request
timeout, read-only method allowlist, zero retries and redirect refusal remain.
The Source reader retains its original rolling 24-method pacing and deadline.

All three publication-kernel guard invocations remain unchanged: before original
intent creation, before metadata DML and before commit. Original-XID handling,
CAS, retained books, original admission and post-DML classification are untouched.
There is no guard cache, Source-height rebase, clock renewal, signer operation or
financial-state mutation added by this patch. Native, Source, quiescence and file
checks retain their existing failure conditions and bounds.

## Local verification

```sh
pnpm --dir api exec tsx --test test/swap-operator-opening-publication.test.ts test/swap-opening-readiness.test.ts test/swap-opening-publication-parallel.test.ts test/swap-opening-source-guard.test.ts
pnpm --dir api typecheck
```

All 17 cases passed with zero skips, including six new concurrency tests. These
prove actual overlap of all four first-phase callbacks; draining and refusal on
each independent failure; draining the other direct client after one failure;
final approval expiry after all reads; each aged original proof clock and no
clock mutation; shared method spacing; and refusal of
signing/batch methods and an aborted queued request. Existing cases retain the
atomic original-XID/CAS kernel, stale/intervened rollback, Source clocks,
canonical/finality checks, every quiet-range log interval and cancellation.
API typechecking, scoped diff whitespace and new-file whitespace checks passed.

Root must record actual next collection/intent/finish/first-cycle timings to
qualify any latency improvement. No new Source/RPC probe, live collector
execution, remote write or financial action was performed by the coding agent.
