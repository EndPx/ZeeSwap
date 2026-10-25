# Closed-history Envio metadata recovery

This separate Root command closes a proven observation gap while financial
controls remain paused. It never activates acceptance/dispatch, renews a financial
authority, signs, pays, changes contracts, starts services or rewrites source state.
The original E4 prefunding/linked campaign implementation remains unchanged.

Use reviewed deployed code and a newly issued Root approval. Passing tests is
not approval or evidence of a live publication. The approval has status
`ROOT_ENVIO_CLOSED_HISTORY_METADATA_RECOVERY_APPROVED`, `metadataOnly:true`,
`noFinance:true`, and a maximum two-hour lifetime. Its `control` is the exact
current epoch/xmin at issuance; it is not fixed to the earlier E217 incident.

## Required Root evidence

The approval type is `ClosedApproval` in
`api/src/integrations/observation/envio-closed-recovery.ts`. Root supplies:

- Current deployed public commit; original profile, handoff and opening pins;
  original source generation/projection/registry; explicit recovery canonical
  identity `base-sepolia-recovery-publicnode-v1`.
- Exact paused control, all 19 financial tables' full-row digest and individual
  counts, zero financial authorization rows, complete Base checkpoint including
  timestamps/xmin, and actual encrypted admission raw SHA. Admission must decrypt
  to version two, zero hints, and the exact SQL checkpoint/source identity.
- Original expired V3 financial authority as a protected raw-pinned archive. Its
  original verification time validates closed-history facts only. Its expiry and
  historical paused epoch remain unchanged; it is never current financial authority.
- Raw pins to original completed 542-proof prefunding recovery and any subsequent
  completed linked campaigns: coverage, intent, completion and original admission.
  All original bytes/directories remain untouched. Historical campaigns validate
  their own closure, independently of today's control and ordinary observer progress.
- A protected stopped proof, issued within 60 seconds before approval, with
  `{version:1,status:'ROOT_ENVIO_METADATA_WRITERS_STOPPED',profileSha256,control,
  normalObserverStopped:true,financialWorkersStopped:true,verifiedAt}`.
- A fresh protected Base canonical audit matching `ClosedAudit`. It verifies all
  retained Base rows, checkpoint, finalized anchor, admission and financial anchors;
  pins exact rows/digest, full books, control, baseline, admission and public commit;
  records actual start/completion and `sqlMutation:false`. Approval issuance must
  follow completion within 60 seconds. Native findings remain separate; a Base
  audit must never relabel a known Native conflict as an all-chain canonical pass.

Files are root-owned regular files with exact realpaths and mode0600 under the
scoped state directory. Historical campaign directories are root0700 and have no
writer lock. The active admission remains UID986/GID978/mode0600. The runtime
uses the existing restricted worker role, not an admin database URL. The worker
needs existing SELECT access, the observer lock function, chain-observation INSERT
and scanner-checkpoint UPDATE. Root independently verifies these privileges.

## Historical source coverage

Explicit selected exports support complete retained historical ranges even below
the producer's current rollback `recoveryFloor`. That real floor is preserved.
It describes rollback checkpoints, not an invented lower bound for retained
complete `BlockVisit` records. A missing header or selected event stops recovery.
No source protocol/floor, generation or projection is rewritten.

Every chunk contains at most256 headers with32-block overlap. All selected
headers and the actual producer checkpoint M are independently canonical, with
the same30-second read budget. Source head/finality, source freshness, complete
event pagination, immutable hash-linked proofs and source identity remain checked.
Every selected contract observation and any admission hint is forbidden.

The recovery transport uses batches of10, at most two concurrent batches and the
existing24-method pacing default. Root may explicitly select the existing80 preset
through `ZEESWAP_RECOVERY_RPC_PACING=80`; this does not change normal Tenderly
configuration. Proof count is at most1024; no global/shared cache is introduced.

## Commands

These are shapes, not issued approvals or live results:

```sh
/usr/bin/node --import tsx scripts/recover-linux-envio-closed.ts recover /opt/zeeswap-testnet/state/envio/ACTUAL_APPROVAL.private.json ACTUAL_RAW_SHA 20
/usr/bin/node --import tsx scripts/recover-linux-envio-closed.ts publish /opt/zeeswap-testnet/state/envio/ACTUAL_APPROVAL.private.json ACTUAL_RAW_SHA
/usr/bin/node --import tsx scripts/recover-linux-envio-closed.ts reconcile /opt/zeeswap-testnet/state/envio/ACTUAL_APPROVAL.private.json ACTUAL_RAW_SHA
```

Only Root on Linux may execute. `recover` accepts1–20 chunks. It archives the
actual original admission and writes private coverage only. Each invocation
holds the existing session advisory lock `(84532,20261024)`, its campaign
`writer.lock`, and the shared `state/envio/recovery-in-progress` marker containing
`closed-history:<approval raw SHA>`. The campaign directory is exactly
`state/envio/closed-<approval raw SHA>`. Locks are never stolen.

Root must stop the ordinary Envio observer and financial writers independently.
The CLI rechecks process command lines; it has no service-stop command. Ordinary
observation remains blocked by the existing shared marker.

`publish` verifies retained canonical/financial anchors before one fresh bounded
tail under a shared30-second deadline. It never chases a growing tip in a loop.
If that single tail does not close the gap, no intent or SQL mutation occurs;
explicitly resume `recover`. The final proof must reach its actual producer
checkpoint, remain within40 blocks of source head, preserve finalized/observed
frontiers and remain fresh. Checks repeat after intent fsync and before mutation.

Under the original restricted runtime lock, one durable intent binds original
transaction ID/xmin, complete before/after checkpoint, exact full books/control,
original/candidate admission hashes and exact before/after retained Base rows.
Only current/finalized anchor INSERTs and one full checkpoint CAS may occur.
No historical row is replaced, deleted or silently contradicted.

## Lost acknowledgment and file completion

After a durable intent exists only `reconcile` is allowed. Read original
`pg_xact_status`; only committed plus exact after checkpoint/xmin/control/books/
rows permits the same sealed candidate installation. Aborted exact-before stops
for Root disposition. In-progress, unknown or intervened state stops without
SQL replay. An expired metadata approval also stops; Root must review that
original intent and must not invent a new publication or alter expiry to retry.

Completion reacquires the runtime lock, rereads exact committed state, accepts
only original or identical candidate admission bytes, then fsyncs the atomic
service-owned replacement and completion receipt before removing/fsyncing the
matching marker. Lease loss during any file await leaves the marker for explicit
review. A completed campaign without its marker refuses every command.

Root independently verifies final SQL/admission/retained rows/full books/control/
authorization count and preserved historical files before restarting the ordinary
observer. Actual healthy cycles and later financial readiness are separate gates.

## Verification

```sh
pnpm --dir api typecheck
pnpm --dir api exec tsx --test test/integrations/envio-closed-recovery.test.ts
# Root selects the existing isolated neondb branch; never the application DB:
ENVIO_CLOSED_TEST_DATABASE_URL=ACTUAL_PRIVATE_ISOLATED_URL pnpm --dir api exec tsx --test test/integrations/envio-closed-recovery.pg.test.ts
```

The PostgreSQL fixture pins the approved isolated host/database/role, creates one
random schema and removes only that invocation-owned schema. It runs the shipped
runtime-lock/reorg-trigger definitions and production metadata CAS. Synthetic
database/role labels are explicitly projected to exercise production snapshot
validation; actual deployed worker privileges remain Root's separate live check.
