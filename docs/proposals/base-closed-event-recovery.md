# Proposed Base closed-history event recovery

Status: explicitly approved by the user on 27 October 2026. The amended
closed-history event-coverage gate applies only to this paused recovery.

The working agreement requires preservation of acceptance gates. The user
explicitly approved this change to the earlier all-header recovery rule;
financial gates and independent canonical receipt checks remain unchanged.
The current Base backlog exceeds 636,000 blocks. The old 64-block proof protocol
enumerates every interior header and cannot be treated as an event-only audit.

## Proposed amendment

For paused, fully closed-history recovery only, cover every missing block interval
by exhaustive unfiltered settlement-contract logs from an independent canonical RPC
and every raw SDK event for the same chain, contract and interval. Compare the exact
ordered sets. Read all retained, financial, event, interval-boundary, seam, checkpoint
and finalized-anchor headers. Omit only interior headers of log-empty spans.
Call this complete event coverage, never full-header coverage.

Preserve the actual Source generation/checkpoint, true SDK floor and original clocks.
The Source proof's PublicNode identity remains distinct from the actual Official
canonical reader. Protect admitted finalized F0 and require independently supported
Source-chosen finality; do not relabel providers or renew archived clocks.

Use fixed intervals of at most 200 blocks (the actual provider limit), 1,000 events
and 8 MB per response. Stop on overflow, an omitted or extra event, an unknown or
unclosed financial event, a fork, rollback, stale Source, or changed application state.
Keep strict read-only database roles, maximum two HTTP groups, maximum ten methods
per batch and at most twenty methods per 1,100 ms.

Before any app checkpoint publication, finish the whole gap, recheck canonical
anchors, take a fresh suffix near the head and obtain a separately reviewed Root
metadata-only approval. Publish through original-XID/CAS and durable-file boundaries.
Preserve every old financial row, old recovery case and failed attempt. This amendment
does not authorize payouts, capital changes, a stopped G5 restart or a price-feed mode.

## Concrete diagnostic evidence

Root's independent read-only pilot completed 20 intervals / 4,000 blocks from
50,174,048 through 50,178,047 in 44.226 seconds, including initial audit overhead.
All SDK and independent unfiltered log sets were empty and equal. It checked all
269 retained Base headers, two Native financial headers, Source start/end proofs
and canonical seams. No app SQL, cursor, admission or financial mutation occurred.

Summary SHA-256: 3d2f0c6450da9903d567e9925c43c492d5904f8a7bf3cb50873c29d65e9e055b.
Private diagnostic code passed 18 tests and independent peer review. An earlier
attempt stopped safely on the provider's 25-method rolling limit; its unchanged
files are retained. The replacement enforces a strict 20-method/1,100-ms window.

This pilot does not qualify the entire history, establish final publication
authority, or guarantee full-gap completion time. The changed proof boundary is
the omission of interior empty-block parent-chain enumeration; SDK/RPC completeness
and the independent canonical provider remain explicit trust assumptions.
