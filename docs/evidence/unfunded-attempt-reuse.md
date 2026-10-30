# Safe unfunded attempt reuse

The 31 October user decision allows another swap attempt after a wallet attempt
expired without receiving funds. It does not reset admission history or increase
principal, fees, historical quote capacity or concurrency. Migration 0033 adds a
separate immutable `ROOT_TESTNET_UNFUNDED_REUSE` grant tied to the exact current
policy, its original committed activation, control epoch/xmin, profile,
contracts, original expiry and existing nonexpiring service authorization. A
protected external signer/journal review digest and finite Root publication
window are required. Private review paths and order mappings remain outside Git.

Capacity is based on funded or active admissions. SQL excludes an expired attempt
only while current proof establishes all of the following:

- `EXPIRED_UNFUNDED`, no primary deposit and a verified finite funding cutoff.
- No deposit by order ID **or original deposit reference**, no obligation,
  operation, chain transaction, outbox job or financial binding/attempt.
- Exactly three expected reservations, all released, and twelve exact ledger
  entries with zero net amount in each asset/bucket. Principal and fee buckets
  remain distinct when both use TAZ in the reverse direction.
- Only the original accepted and expired-unfunded order events.

The proof is evaluated again at every chargeable capacity query. All historical
quotes and admissions remain present. Historical quotes still consume the
original 32-quote allowance. Two chargeable admissions per direction, four fee
allocations, original principal budgets and one global active order remain the
limits. API availability version 4 explicitly identifies the capacity basis and
its Root authorization hash, alongside the qualified null service expiry.

The original admission body changes only its count source. Additional narrow
guards in the policy gate and financial membership function refuse excess
observed late exposure. Availability then reports paused with both directions
unavailable. A fresh ordinary target at exactly the original cap remains eligible.
Every financial attempt for a previously expired order that later receives any
deposit is fenced for separate Root recovery, even below the aggregate cap.
This prevents automatic late refunds using already released reservations. The
existing policy source-refund wrappers call the same financial membership gate.
No released reservation is recreated and no late liability is discarded.

The running financial worker, its original release, execution configuration,
lease and entry remain intact. SQL publication changes no financial rows or
control state and acquires no worker lease. Source ingestion and Core/indexer
code remain unchanged. Late deposits may still arrive externally; this change
does not claim to prevent them. It preserves their liability and refuses
unreviewed automatic spending.

## Verification

New authorization, explicit API version 4 and financial SQL boundary tests passed
**3/3**. API typecheck passed after the final SQL alias correction. The combined
reuse, lifetime, service-policy and policy-worker regressions passed **18/18**. The protected
Root operator CLI follows the original-XID intent/publication/reconciliation
boundary, pins the PostgreSQL system identity, and checks all four overridden
function bodies against their published predecessors. Before and after table
digests exclude only the new grant table.

The first real disposable VPS fixture reached safe repeated forward retries,
reverse ledger reuse and durable-binding rejection, then exposed an ambiguous
PL/pgSQL output-column reference in the new worker guard. The guard now qualifies
its event and chargeable-admission columns with aliases. No Main write or
financial execution occurred during this fixture. The corrected migration has
not weakened the tested financial restrictions.

The second real disposable VPS fixture completed with
`ISOLATED_UNFUNDED_REUSE_SQL_PASSED`. All eleven recorded checks passed: explicit
immutable version 4 authorization; retries exceeding the former historical
attempt count without resetting history; historical quote consumption retained;
exact reservation/ledger proof in both directions; durable binding rejection;
late deposits restoring chargeability; retired late targets blocked below the
cap; ordinary fresh targets allowed at the exact cap; excess late exposure
blocking financial membership and quote binding; finite quote/funding bounds;
and unchanged original budgets, expiry and financial worker. Availability was
also checked as paused with both directions false during excess exposure.
These are synthetic PostgreSQL fixture results. Main was untouched; no live
financial actor, signing, payment or settlement was executed. Live publication
remains a separate Root operator result.

The isolated runner is `api/scripts/test-unfunded-reuse-isolated.ts`, accepting a
protected context path with bootstrap `databaseUrl` and verified TLS `caPath`.
It requires an empty disposable test database and uses existing roles without
global role changes. It retains PostgreSQL expiry text and stable statement
timestamps, avoiding the earlier lifetime fixture precision issues.

The protected publication CLI is
`api/scripts/administer-unfunded-reuse-local.ts <context> publish|reconcile`.
The Root-only context and authorization must be reviewed before publication;
implementation and fixture evidence do not themselves grant live authority.
