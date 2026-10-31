# Delivered background admission

Date: 31 October 2026. Implementation and disposable PostgreSQL evidence only;
this document does not claim activation in the live service.

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
