# Native continuation after an unfunded expiry

This checkpoint records one refund and one subsequent unfunded expiry in the
isolated native testnet deployment. It does not establish a successful new swap
circle, reopen the historical G5 soak, or authorize another funded retry.

The second forward order was accepted while epoch six was active. Preparation
stopped before creating a financial journal because the SDK returned the two
approved notes in a different order. A separately supervised read-only diagnostic
verified identical unique note identities and values, with 12490000 zatoshi on
both sides. The strict identity-set correction passed seven Ubuntu/WSL tests.
Its next preparation attempt stopped before the payer helper at the unchanged
twelve-block lead gate: only eleven blocks remained. No new calculation,
signature, broadcast or transaction fee was created.

Root paused the application and retained the accepted cutoff. After the actual
application scanner reached height 4537249, an independent canonical header
matched its checkpoint. The existing `zee.expire_unfunded` function then closed
that order under a local admin transaction. Root verified committed transaction
status and exact readback. No migration or replacement acceptance was part of
that closure.

The resulting actual financial snapshot contains:

| Evidence | Observed result |
| --- | --- |
| Orders | One REFUNDED and one EXPIRED_UNFUNDED |
| Deposits / obligations | One original deposit and one discharged obligation |
| Operations / outbox | One confirmed refund and one done job |
| Reservations | All six released |
| Ledger | 39 rows; the exact original 27-row history is unchanged |
| Additional transaction costs | Zero for the unfunded candidate |

Root verified that the unfunded payer journal, raw transaction and temporary
files were absent. A fresh USER capture verified two mature canonical notes,
12490000 zatoshi, and an empty calculated cache. The closed harness state is
preserved separately from the original refunded session. A later read-only
preparation prefix passed address validation, synchronization, note matching,
coin checks and cache checks, then stopped at the already closed funding cutoff
before any durable signing intent. The payer's Base keystore address was also
checked without signing or broadcasting a transaction.

The replacement implementation permits one additional candidate with explicit
all-history caps of three forward acceptances and one reverse acceptance. Both
closed orders remain counted. The amount remains 100000 atomic units, the new
forward window remains forty blocks, and the twelve-block pre-step margin is
unchanged. It is restricted to paused epoch six and its exact transaction version,
then resumes to epoch seven. Reconciliation must already be clear.

Migration `0018` adds a separate five-argument admission function. Migration
`0017`, the original R9 identity, wallet provenance and financial balances remain
unchanged. The replacement validates the entire actual 39-row snapshot and the
specific zero-effect expiry before comparing the original historical baseline.
Readiness samples and acceptance counters always use the complete actual history.
The new harness uses a distinct namespace and rejects both prior payer-journal
paths, even if a prior journal is absent.

Root verification passed 29 focused TypeScript checks, API typechecking, a scoped
14-file publication audit, and two actual isolated PostgreSQL tests with zero
skips. The PostgreSQL cases cover serial admission and two independent clients
competing under the runtime lock. Their first run failed because a PL/pgSQL loop
record shadowed a query alias. Renaming only that loop record corrected the
function; both actual cases then passed. Each invocation removed its own test
schemas. This was performed on the existing isolated regression branch, not the
live application database.

At this code checkpoint, `0018` installation, replacement authority issuance,
the new five-minute source window, fresh physical capital/preflight checks,
manual resume, and the funded two-way circle remain separate execution gates.
Private keys, viewing keys, full memos, raw receipts and private order mappings
remain outside Git. SourceExposure migrations `0015` and `0016` remain unapplied.

The staged-byte audit also caught CRLF in the new migration, where repository
attributes preserve SQL bytes. Only the unpublished 0018 file was normalized to
LF; existing migrations and attributes were left unchanged. The actual
PostgreSQL fixtures now compare stored function source byte-for-byte against
the reviewed body after reversing only their own isolated schema qualification,
and verify its SHA. This prevents a deployment source-hash mismatch from being
missed by functional tests.
