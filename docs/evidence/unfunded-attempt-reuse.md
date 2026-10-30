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

## Safe idle restart after a verified unfunded attempt

After SQL reuse publication the original worker had already exited naturally.
Its original preuser ExecCondition correctly refused the changed financial-book
baseline. A separate read-only qualification now handles this exact case without
changing the worker entry, execution pins or original finite default gate.

The new qualification requires actual SQL nonexpiring and reuse authorizations,
no worker lease or global unresolved state, exact current-policy quote/admission
correspondence, and a current positive strict SQL reusable proof for every such
admission. Each order must have no process directory under the current policy,
reverse or refund paths; parent directory protections and the original whole
current-policy journal-directory check remain enforced. Pending or unaccepted
quotes cannot inherit this permission.

It reconstructs the original baseline in memory by removing only the proven
current attempt IDs from quotes, orders, reservations, ledger entries, events
and policy quote/admission rows. Deposits, operations, bindings, inventory and
all other tables remain untouched. The resulting financial digest must equal
exactly the original policy's initial books, and the original ancestor,
lineage, control, source freshness, Root files and recovery-marker guards must
still pass. No database row is changed. Effective service lifetime comes from
verified SQL authorization at the actual wall clock; no fabricated clock or
policy expiry is used.

API typecheck and all **11** idle qualification tests passed, including the nine
original default-gate checks. New checks cover exact reconstruction without
mutating the snapshot, missing authorization/proof, changed original inventory,
pending quotes, deposits, funded state, signed operations and an existing lease.
This authorizes only a verified idle restart; an active or financially signed
attempt still requires its separate original-process review. Actual Root gate
execution and any subsequent worker start are separate operator results.

The successful gate status retains `POLICY_PRE_USER_IDLE_RESTART_ALLOWED` for
compatibility with the installed watchdog. Under the explicit SQL reuse grant,
that status includes the strict reconstructed safe-unfunded qualification above;
it does not imply the policy has never had a user interaction.

## Live publication and guarded worker start

Implementation commit `a219afcd4f28a49cbe2093213d48ee9e5853f32c` and strict
idle-qualification commit `4e378e3445f651a9e1718175cfbaee1fbfc79e87` were
published. Root committed migration 0033 and its reviewed reuse authorization in
original transaction **460474**, then reconciled that original XID without
replaying publication. Reuse authorization SHA256:
`d9b6bca29247491fc8bf64d958068dc2e333f1e72e4e50cc84476cd220555c76`.
The before/after digest of all existing Zee tables was identical:
`30ef2abf8c15a5d1d873749ebb3ce59398c88793ec7d055c4fd53dc85bf23706`.
Only the newly inserted authorization table was excluded. The current policy,
control epoch **242** and xmin **388504**, original A70 execution manifest,
financial configuration, limits and complete history were preserved. No quota,
order or financial ledger reset and no Source/Core change occurred.

The API and web release `unfunded-reuse-a219afc-r1` serves
`index-BpoCQfGs.js` and `browser-BAxKxRR_.js`. Served HTML SHA256:
`d865ac0f8c7eba5be0a8ac0ef6c55ffba7a7ca7213fe8db6a6ee876d17f6e688`.
The production API uses the same-origin HTTPS endpoint and the published faucet
address registry. New assets were published before switching HTML; older assets
remain available. The two disposable SQL fixture databases were cleaned up after
the tests.

The initial live version 4 response correctly restored **two forward and two
reverse admissions**, but reported `worker_unavailable`: the original worker
had exited naturally at 19:36 UTC, before this deployment, and the old preuser
baseline check refused the now changed books. Root did not stop that worker for
the SQL publication. At 19:46 UTC the new strict read-only qualification passed,
and Root installed the reviewed ExecCondition with matching watchdog pins.

An initial timer fallback passed the guard but encountered an inactive,
garbage-collected systemd unit when attempting `reset-failed`, so it did not
start a financial actor. The timer correction distinguishes inactive from failed
units and skips that reset for an inactive unit. At **19:48:55 UTC**, after the
actual guard passed, Root issued one normal `systemctl start`. ExecCondition
passed again at **19:48:56 UTC** and the original 6ebb worker became active as
PID **1331954**. Its financial release, entry and configuration remained
unchanged. This was one explicitly guarded operator start; the worker was not
left continuously running throughout deployment. Activity alone does not prove
a fresh capital tick or a completed financial operation.

At **30 October 2026, 19:49:41 UTC** (**31 October, 02:49:41 WIB**), an actual
headless Chrome run observed version **4**, status `ready`, both directions
available and remaining capacity **2 / 2**. The source amount displayed **0.001**
and **Get exact testnet quote** was enabled. The run observed no Preview Only
state, no exhausted-capacity notice and no page errors; health and availability
requests returned HTTP 200. All POST requests and localhost requests were blocked
during this verification. Therefore it created **no live quote, acceptance,
wallet request, payment or settlement**. The screenshot is retained privately;
no address or private mapping is included in this public evidence.
