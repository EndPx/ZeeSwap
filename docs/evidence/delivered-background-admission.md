# Delivered background admission

Date: 31 October 2026. Implementation, disposable PostgreSQL checks and the
scoped live activation below are recorded separately.

The continuous demo retains one foreground order. A forward order with the
original successful canonical Base RESERVE and PAY inclusions can continue
finalizing in the background while a subsequent order uses available inventory.
The original order remains `READY`, its payout remains unconfirmed, its source
liability remains `HELD`, and all financial reservations remain held. Finalized
settlement and source-proceeds credit retain their existing checks.

Migration `0040_testnet_delivered_background.sql` adds the shared
`testnet_order_delivery_included(uuid)` predicate. It requires the immutable
original policy admission epoch, explicit continuous-demo authorization, exact
confirmed canonical Zcash funding, fresh Sources, both original signed Base
attempts with matching valid canonical inclusions, the original signed payout
and job, the held source liability, and three exact held reservations. Foreign
refund, reverse, or chain-transaction records disqualify the order. A resumed
runtime epoch does not replace the immutable admission epoch.

The global admission gate excludes only qualifying delivered orders and their
linked financial records. Orphan and unrelated financial exposure remains
blocking. Availability reports the same foreground count. Reserved inventory
remains unavailable to subsequent orders; inclusion does not allocate capital
or credit source proceeds.

The worker independently refreshes the original receipt evidence before
background processing and capital capture. A changed or missing receipt fences
further execution for reconciliation. This does not authorize replacement
payouts or treat Base inclusion as Ethereum finality.

## Checks

- Local `npx tsc --noEmit`: passed.
- `git diff --check` for the migration and fixture runner: passed.
- Final focused TypeScript checks: **36/36 passed**, covering worker scheduling,
  capital qualification, closed journals, execution authority, restart behavior,
  and Source handling. Existing Linux native/forward and Base/reverse regression
  checks also passed **20/20**. API TypeScript checking passed. These are code
  and regression checks; they do not establish live activation.
- The disposable copied database fixture, with all changes inside a rolled-back
  transaction, passed the migration 0040 assertions after correcting the original
  admission epoch comparison. Its synthetic Base delivery height is above SQL
  finalized height. RESERVE alone, an invalid phase, a changed PAY transaction
  identity, a changed canonical block, stale Sources, and an orphan liability
  each block admission. A qualifying delivered order retains its `READY` state,
  `HELD` liability, three held reservations, two unconfirmed attempts, and leased
  payout job. A second order is admitted; a third is rejected. Unfinalized source
  proceeds cannot be credited.
- The combined disposable PostgreSQL fixture passed **60 cases**, including
  migration 0041 immutable execution continuation: the original tuple is valid
  before continuation, a wrong predecessor is rejected, the successor tuple
  becomes current, old worker and capital tuples are rejected, generation rows
  are immutable, and the original funded order remains `READY`. The returned
  result was `CONTINUOUS_DEMO_SQL_FIXTURE_PASS`, `cases: 60`, `rollback: true`,
  `mainWrites: false`. The successor's foreign-worker lease check is scoped to
  the current database, matching PostgreSQL advisory-lock isolation. No live
  activation is inferred from these fixture checks.

The fixture uses `api/scripts/test-continuous-demo-sql.ts` with
`--delivered-background` and the explicit disposable database-name guard.
It performs no signing, transfers, or writes to the main database.

The continuous startup adapter invokes the actual `gate` action, including the
fresh wallet and Base nonce checks, rather than only inspecting journal state.
Its five focused tests and API typechecking passed. The corrected adapter is
deployed as a separately pinned startup artifact; it does not alter the reviewed
financial release or its execution manifest.

A startup attempt exposed a separate freshness deadlock: the wallet capture ran
while holding the observer mutex and an older repeatable-read snapshot. The
gate now captures wallet evidence before beginning that transaction, then takes
a fresh snapshot and checks the unchanged capture hash, original proof clock,
current nonce, journals and Source freshness. Thresholds remain unchanged. The
12 focused startup/continuous checks passed, including Source publication during
capture and refusal before opening a transaction when capture fails.

## Live activation

Root installed migrations 0040 and 0041 in transaction `635718`, preserving
fingerprints for 34 existing financial/control tables and the ACLs of 39
existing tables. No transaction history or balances were reset. The first
successor grant was published in `635731`; the corrected Root gate continuation
was published in `638364`, retaining the same financial configuration and
capital approval. Neither publication minted assets or sent a payment.

The financial worker runs the immutable `f8c302d` release with 166 execution
pins and its original native supervisor bytes. Startup uses the separately
pinned `0d4333c` adapter and `e8d6ba6` Root gate. The initially incomplete
activation was reconciled against its original private intent after the actual
gate and worker startup succeeded. Its immutable record was preserved.

The actual wallet-before-lock startup succeeded, the worker published
`POLICY_IDLE_CAPITAL_VERIFIED`, and the updated supervisor timer is enabled and
active. Existing Chef and Envio consumers were retained. The public API was
`ready` at **17:02:31 WIB**, with zero foreground orders and both swap
directions available. A fresh headless browser also verified both quote dialog
buttons, the expected production bundle, HTTP 200 health/availability, zero
JavaScript errors and zero POST requests.

The user's preceding payout had already reached actual finality before the
cutover. The 60-case isolated fixture proves admission while the original
delivery remains unfinalized; this activation did not execute a new funded
background-delivery swap. The new slot behavior applies to canonical forward
Zcash-to-Base payouts. Reverse and bridge delivery were not relabelled as
background-complete by this change.
