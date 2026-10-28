# Current operator Base opening implementation

Implementation and isolated verification, 29 October 2026. This document does
not claim a live publication, policy activation or funded browser swap.

The distinct `BASE_OPERATOR_SCOPE_OPENING_COMMITTED_EXACT` boundary retains
the known old RESERVED payout and PAYOUT_COMMITTED escrow, each 100000 atomic,
and records the historical interval that has not been exhaustively event-audited.
It does not issue complete-history metadata. Ordinary service limits remain
100000 atomic per order, two per direction and one active order.

## Code and actual capture

`swap-operator-opening.ts collect` reads the verified Linux operator profile,
all four configured operator signer files, the actual sole cancellation journal,
its raw signature and successful original canonical receipt, both independent
RPCs, coherent current-main SQL books, current Source SDK/RPC proof and the
existing fresh Native neutral-capital capture. It verifies immutable runtimes,
current operator roles, old liability structs and exact aggregate accounting.
It preserves the 269 stored Base rows and previously accepted prefix rather than
replaying their completed audit. The original checkpoint and admitted finality
are rechecked; retained rows remain bound by their original digest and archive.

The accepted prefix has **384 packets**, **3840 intervals**, **768000 blocks**
and **57380684 bytes**. Packet and interval counts are distinct. Its original
record digest, SDK height and revision remain unchanged and separately pinned.

The collector writes a non-executable review draft. Publication requires the
distinct Root approval purpose with the explicit history amendment flag and
exact evidence, original admission, control, financial books, retained rows,
archive and source pins. The source clock is not renewed. A fresh Source suffix
must remain consumable within the real SDK retained floor, including ordinary
overlap, with at most 150 blocks from the opening anchor and no newly observed
event requiring reconciliation.

Fresh authority after a Native metadata repair binds the exact newly captured
paused control epoch and xmin; canonical decimal epochs from 230 through the
PostgreSQL bigint maximum are permitted. An older approval still fails its exact
control/books/checkpoint CAS. The collector and publication guards independently
require a fresh Native SQL checkpoint, ready/fresh Chef source, correctly bound
current cursor and canonical SQL tip/finalized/cursor/source headers. A Native
checkpoint mismatch, stale observation or changed generation stops this path.
This permits a separately reviewed post-repair opening without renewing any old
Base campaign authority or bypassing the Native repair.

`publish` durably records the original XID and sealed candidate before the sole
checkpoint CAS. It never updates an old retained header or a financial row.
`finish` reads the original transaction's terminal status under the existing
observer/control lock, completes only the durable admission-file boundary and
writes the distinct completion receipt. Expired original authority cannot run
a new publication; original-XID completion remains reconcilable after expiry.
Unknown or intervened outcomes cannot replay the metadata transaction.

Version 4 admission preserves the opening scope when ordinary checkpoints
advance. The service launch receipt union verifies the new completion artifact
and binds its profile/registry/handoff/opening identity to the existing canonical
audit and policy. The five-minute source window, capital/fee allocation, exact
amounts, worker supervision, receipt and funded browser-circle checks remain.

## Verification

Focused local tests cover cancellation signature/receipt/event binding, current
main closed books, retained old liabilities, prefix packet/interval accounting,
SDK floor/overlap, explicit approval, honest unverified interval, metadata CAS,
original-XID classification and receipt/admission union. API TypeScript passed.

Actual PostgreSQL qualification used the existing isolated G3 test branch,
`br-wispy-dawn-aorsbba5`, on `ep-broad-math-aoxcd482`, database `neondb`.
The test asserts the project, branch, host, database and owner before mutation.
It creates one invocation-owned random schema and removes that exact schema
in `finally`; it does not alter live `zee` or retained historical fixtures.

Six actual PostgreSQL tests passed with zero skips, including the parent case:

- Restricted worker cannot mutate control, financial books or old observations.
- Failed durable intent aborts the original XID before metadata moves.
- An actual missed checkpoint xmin CAS rolls back completely.
- An adversarial AFTER UPDATE control trigger is detected and rolled back.
- A lost COMMIT acknowledgement resolves the original committed XID with all
  269 retained headers, 70 synthetic financial rows and control unchanged.
- The final case also runs original-XID finish under the real observer/control
  lock: an independent control UPDATE times out, finish emits no metadata DML,
  and its exact committed state remains unchanged.

The final PostgreSQL run completed in 9.918 seconds, exit 0. These are synthetic
restricted-role transaction proofs, not a live main-database opening or settlement.

PowerShell invocation:

```powershell
$env:OPERATOR_OPENING_TEST_CONFIG = (Resolve-Path ../.deploy-local/neon-settlement-tests.json).Path
pnpm exec tsx --test test/integrations/swap-operator-opening.pg.test.ts
```

Run the command from `api`. Root-only Linux operation uses the deployed Node 24
runtime and `swap-operator-opening.ts collect|publish|finish`, with explicit raw
SHA-256 pins for the configuration and, for publication/finish, Root approval.
Keep every actual capture, order mapping, journal, encrypted admission and
provider/configuration credential outside Git.
