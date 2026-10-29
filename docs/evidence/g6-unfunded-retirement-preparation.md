# Explicit unfunded operator attempt retirement preparation

Prepared after Root's implementation review on 29 October 2026. **No actual
closure collection, SQL retirement, reservation release or replacement acceptance
was executed by the coding agents.** Root must review actual facts before using
the mutating command.

The new read-only Python probe loads the original pinned R4 reader modules. It
does not alter the R4 profile, UFVK, birthday or original module fingerprints.
It reuses a complete physical snapshot and transparently retains all independently
decrypted matching notes, including spent, late, wrong-amount and internal notes.
It never substitutes a filtered deposit list for absence. Closed-window proof
requires the original cutoff height plus nine blocks. The payer check requires
the exact canonical 350,000 own-change note, empty calculated cache, no unknown
spend, actor quiescence and the existing payer lock held through observation.

`bridge-unfunded.ts --action collect` writes a private proof only when the book,
paired anchors, canonical absence, payer, actual Base NONE/supply/unpaid and exact
three fee-note predicates all pass. Both finalized and latest Base records are
checked. The book digest must remain unchanged during collection. An optional
certificate draft remains UID-owned/private, and is not a valid Root approval.

The separate Root-owned `ROOT_BRIDGE_ZERO_EXPOSURE_REPLACEMENT` certificate binds
that proof, original order/book/permit hashes and exactly one replacement. The
retire command recomputes actual facts under the existing row lock; it does not
acquire a second database client. It preserves the original accepted flag,
capability, memo, funding, deadlines and attempt count, records
`EXPIRED_UNFUNDED` with proof linkage and releases only the unused 10,000 fee
reservation once. Certificate replay does not credit fees again. A changed book
or changed original terms refuses.

Replacement admission is a separate explicit counter/tag under the original
permit lineage. It invokes ordinary `BridgeService.quote` and `accept` with a new
order/commitment and actual fresh clocks. Two concurrent accepts cannot consume
the single replacement twice. Another ordinary permit still cannot reset the
old accepted counter. A dedicated concrete mint coordinator and funded-circle
lineage check recognize only the actual authorized replacement; ordinary mint
authority is not widened.

Retired instructions remain observed. A matching external receipt becomes a
separate quarantined principal liability, with actual physical-control evidence,
incident and pause. It cannot mint, resume an old order, release another fee or
invoke refund signing. Replay cannot count the same note twice. Public startup
requires the retained certificate/probe monitor when such history exists.

Verification recorded locally:

- Nine synthetic Node financial tests cover missing facts, actual latest effects,
  certificate/book drift, replay, immutable original terms, no normal-permit reset,
  concurrent replacement acceptance, exact late quarantine and stale/unbacked
  quarantine refusal.
- The Python probe and existing native reader suite passed 17 Linux tests,
  including actual Linux payer-lock contention and positive lock ownership.
- Bridge payer tests bind the explicit replacement certificate while preserving
  the original permit, memo and cutoff checks.
- API/web TypeScript and focused frontend terminal-status tests passed.

Tests use synthetic chain/wallet boundaries unless explicitly described as Linux
filesystem/process checks. They are not live proof that the source window is
closed or that actual retirement is permitted.
