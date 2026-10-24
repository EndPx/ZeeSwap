# Discarding an unpublished checkpoint conflict

This follows the [reconciled admission implementation](native-reconciled-admission.md)
and records a later native testnet checkpoint. No new customer-funded order or
successful two-way circle is claimed.

The first explicit 0019 installation attempt refused before executing DDL:
runtime had advanced from epoch seven to ten. Its original journal was retained.
Read-only reconciliation found the complete financial snapshot unchanged,
16 migrations, no new authorization table or function, and unchanged 0017/0018
installation metadata. The old installation attempt was not replayed.

The newly installed observer diagnostics recorded three later
`CANONICAL_CHECKPOINT_MISMATCH` errors during traversal, before any publication
attempt. They did not contain the compared height/hash pair, so they cannot now
be classified as harmless unpublished conflicts. The cause of the original
epoch-seven incident also remains unproven.

Root stopped only the Chef application consumer and performed another complete
read-only canonical audit at the exact epoch-ten transaction version. From
23:47:44.476 to 23:48:49.793 UTC on 24 October, all **1,376 native header hashes
and 119 Base header hashes** matched independent reads. Cursor, checkpoints,
finalized and financial anchors, source generation and profile also matched.
The complete 39-row ledger snapshot remained unchanged. This is evidence of
hash canonicality at capture, not an attribution of the earlier errors or an
independent verification of stored timestamp fields.

A separately journaled installation, bound to that exact control version,
then applied only migration 0019. Root verified its committed transaction from a
fresh connection, all three function versions, table owner/privileges/immutable
trigger, the migration inventory and unchanged financial books. The live
database now has 17 migrations: 0001–0014, 0017, 0018 and 0019. The authorization
table remains empty; controls remain paused in reconciliation. No admission row,
activation or payment was part of installation.

## Reviewed observer behavior

The new typed `SourceCheckpointMismatch` retains the original
`CANONICAL_CHECKPOINT_MISMATCH` code. It records the compared source checkpoint's
project, generation, revision, height and hash, the actual independent header,
and whether that header came from a prefetched range or a fresh read. An
additional uncached read provides diagnostic evidence. It never changes a
header inside the rejected batch.

A complete traversal aborts before receipt classification, ingestion or cursor
saving. The runner may discard that entire batch and wait for a new traversal
only when every condition below holds:

- The error is the typed checkpoint comparison, during traversal, before any
  publication attempt.
- The mismatched height is strictly above every retained native SQL header,
  cursor, checkpoint, finalized height and native financial inclusion anchor.
- An uncached read succeeds at the expected height.
- Every persisted hash passes an independent canonical recheck, and SQL,
  runtime control and cursor remain unchanged.
- Source project, generation and the verified configuration identity remain
  unchanged.
- A private witness of the successful recheck is written and fsynced.

The next ordinary cycle starts a new complete traversal. It cannot publish
the discarded batch or substitute a freshly fetched hash into that batch.

Generic checkpoint errors, conflicts at a persisted height, mismatched response
heights, source identity changes, note conflicts and errors after publication
remain fatal. Failed or timed-out uncached reads, anchor checks, state rereads
and witness writes retain the original mismatch and reconciliation path.
Public output exposes allowlisted status/code/phase fields; detailed source
comparison and cache-origin information stay in private diagnostics.

Root's final focused run passed **31 tests with zero skips** across head-change,
cursor, anchor-header and live-runner suites, plus API typechecking. The new
cases exercise actual adapter traversal and actual local-reader cache-origin
behavior, as well as source/configuration changes, strict height boundaries,
timeout and fsync failure. Independent review verified the five changed Git
paths and passed all seven new behavioral cases. The combined private runtime
manifest verifies these five paths and the preceding 15 V3 paths together.

These are implementation checks, distinct from the actual chain audits and
from observing this new wait path live. At this code checkpoint, installing the
guard, resuming ordinary observation, issuing the epoch-ten Root authority,
fresh simultaneous readiness, monotonic activation and the funded
TAZ → mockUSDC → shielded TAZ circle remain pending. The historical G5 soak,
private signing journals, closed sessions and unapplied 0015/0016 files remain
preserved.
