# Closed-history Chef single-tip repair: prepared implementation

Prepared for the frozen epoch-217 incident. This is a new metadata-only repair
path for the existing nonempty closed financial history; the old prefunding
repair is unchanged and is not reused with fabricated empty tables or nonce-zero
capital. No live repair, new approval or observer restart was executed by this
implementation task.

## Exact allowed case

Root's completed diagnostic is explicitly `DIAGNOSTIC_CONFLICTS`, with
`noRepairAttestation: false`; it is not a repair authority. Its pinned raw SHA is:

```text
5dadb98fafb1b847be0bb9ab92070c5becfed87b36c3c40555e64e30ed69b36e
```

The observed case contains 1,671 retained native SQL rows and exactly one
conflicting unfinalized tip at 4540629. Its stored hash is
`0000407ce84f8804fb0baa33ee07355ebd39407b0c1bbe96edf9061bfe7d743f`;
the independently canonical replacement is
`00000d32ec4e937712c62f2e670d90252b79edaa679eb6868215b390a983205e`.
The contiguous common parent is 4540628 and finalized anchor 4540620 is canonical.
The cursor and native SQL checkpoint still select the old tip.

The live command is fixed to paused/reconciling **E217/xmin538330**, zero
authorization rows, no active leases, the full 19-table/70-row closed financial
digest `b1079860bfcbcdb6f022d59c1da18671e81cbcf44722e8d426c8922b09b5d57f`
and the pinned diagnostic. A financial anchor at the replaced tip, another
conflicting row, changed history/control/source or disabled original trigger
refuses repair.

Two compare-and-swap updates are permitted: replace that native chain row's
hash/time, then rewind the native checkpoint to common parent 4540628. Finalized
height **4540620**, finalized time and original `observed_at` remain unchanged.
The original `canonical_reorg` and `observer_rewind` triggers both run and each
requests reconciliation, so the expected control result is **217 → 219**, with
both control/checkpoint/tip row versions bound to the repair transaction's XID.
There is no epoch reset, trigger disabling, manual freshness renewal or financial
table write. The protected cursor rewinds to the same common parent only after
the original transaction is independently classified committed and exact.

## Root workflow

The new CLI is `api/scripts/repair-linux-chef-closed-tip.ts`. Its commands are
explicit Root operations on the existing VPS, using the reviewed public bytes:

```sh
HOME=/opt/zeeswap-testnet/home /usr/bin/node --import tsx \
  scripts/repair-linux-chef-closed-tip.ts inspect <NEW-protected-inspection-path>

HOME=/opt/zeeswap-testnet/home /usr/bin/node --import tsx \
  scripts/repair-linux-chef-closed-tip.ts issue <inspection-path> <inspection-raw-SHA256> \
  <published-code-commit> <explicit-UTC-expiry> <NEW-protected-approval-path>

HOME=/opt/zeeswap-testnet/home /usr/bin/node --import tsx \
  scripts/repair-linux-chef-closed-tip.ts apply <approval-path> <approval-raw-SHA256>

HOME=/opt/zeeswap-testnet/home /usr/bin/node --import tsx \
  scripts/repair-linux-chef-closed-tip.ts reconcile <approval-raw-SHA256>
```

Run from the physical API directory only after Root publishes the reviewed code,
verifies its remote commit and installs matching public Git/LF bytes. The
`issue` command's commit argument must be that published revision, not a pending
working-tree label. Inspection and approval files must be new
`.private.json` files directly beneath
`/opt/zeeswap-testnet/state/app-closed-tip-repair`, with Root ownership and mode
0600. The command does not infer a new financial authority. Inspection produces
an explicitly unapproved private snapshot. `issue` requires its raw hash,
rechecks current SQL/cursor/all canonical headers and runtime pins, and writes
only a new metadata approval with at most a two-hour expiry. Root must review
the inspection and actual published-code binding before requesting issuance.
Never expose the inspection, intent or financial rows in public logs.

Keep both application observers and financial workers stopped; the command
checks their process inventory, the existing native writer lock, Base application
advisory lock and observer-cycle lock. Chef Core continues following. Existing
private profile/runtime/source/binary identity checks are retained. Worker access
uses the original security-definer observer lock; no direct runtime-control
`FOR UPDATE` or new production privilege is required.

Before actual application, Root must observe the worker connection's
`statement_timeout` and `idle_in_transaction_session_timeout`. The normal adapter
sets a 15-second **per-statement** timeout, while canonical network verification
can take up to 180 seconds inside the locked transaction. No timeout is silently
extended here. Root independently observed a five-minute worker idle-in-transaction
limit, longer than this 180-second canonical phase; transaction timeout remains
an explicit preflight check. If an actual limit cannot accommodate the
verified phase, stop and review the schedule instead of granting privileges or
loosening a database setting without explicit review.

The approval binds full financial and metadata state, both checkpoints, every
stored network row/version, exact control, cursor bytes, current source/profile,
the diagnostic and installed repair code hashes. Independent canonical reads
recheck all native/Base rows and financial anchors, the common/replacement/final
headers and current Core checkpoint. A failed or ambiguous provider read is not
an orphan classification or permission to repair.

## Durable transaction and file boundary

Approval, diagnostic, complete before-state and original cursor bytes are
archived privately. The exact XID, predicted two-trigger state and candidate
cursor are fsynced in an intent, and the ordinary observer's shared repair marker
is installed **before** the two metadata updates. The current complete state must
match the predicted result before COMMIT. Original observation/finalized times
are compared exactly; no repaired timestamp is presented as a fresh scan.

After COMMIT or lost acknowledgement, a new verified worker connection reacquires
the advisory lock and reads `pg_xact_status` plus the complete current state.
Only `COMMITTED_EXACT` permits atomic service-owned cursor installation, durable
completion and marker removal under lease fences. Aborted, unknown, expired or
intervened outcomes retain the marker and prohibit SQL replay. `reconcile` never
executes the two updates. A failure before intent may leave a protected campaign
directory; inspect it and issue a separately reviewed new approval rather than
deleting evidence or automatically retrying.

After exact completion Root must verify epoch 219/current transaction version,
all financial rows, retained metadata/cursor, final anchor and preserved old
observation time. Keep both application observers stopped after native repair
until the separate Base closed-history authority is bound to the new current
control and its recovery/admission is verified. Root may then explicitly resume
ordinary observation under unchanged bounded-gap/current-source checks. This does not activate
finance; fresh joint readiness and a new financial
authority remain independent gates. No historical G5 run is resumed.

## Verification evidence

Five pure cases and API typechecking passed. They cover the exact closed-history
scope, full diagnostic binding, expiry/source/control/financial/trigger refusal,
the finalized/time-preserving expected result, tampered intent/cursor refusal,
unknown/intervened transaction classification and retained markers on lease loss.
Independent peer review also passed the five pure cases with zero skips and
cleared the final source after removing a redundant worker-forbidden direct
runtime-control row lock.

An actual isolated PostgreSQL fixture passed **one case, zero skips** on the
explicitly selected `neondb` test branch. It created a unique invocation schema,
used the shipped reconciliation/observer-lock/rewind functions and trigger
definitions, and executed the production updates under existing restricted role
`zeeswap_worker`. It proved direct runtime-control `FOR UPDATE` was denied and
all 19 financial tables lacked worker UPDATE permission. Schema-only grants
allowed the intended two metadata updates; no role or production grant changed.
The result advanced 217 → 219 in one XID, preserved finalized/observation times
and all 70 synthetic financial sentinel rows, classified a lost COMMIT ACK on
independent readback, refused replay CAS and detected a later equal-value
administrative intervention by xmin. The invocation schema was removed.

Root independently repeated the five pure cases and the restricted-role actual
PostgreSQL fixture: all six cases passed with zero skips. These are separate
verification runs. Those synthetic rows are not the live closed-history receipt
inventory and do not prove the live source or current financial digest. Root must
review the live inspection/approval before actual application. The implementation
also passed 99 broader local regression cases with zero skips and full API
typechecking; its code and operator commands remain preparation
until Root's actual publication/inspection/issuance/application receipts exist.

```powershell
pnpm --dir api exec tsx --test test/app-chef-closed-tip-repair.test.ts
pnpm --dir api typecheck
```

The isolated fixture is `test/app-chef-closed-tip-repair.pg.test.ts`. Supply
`CLOSED_TIP_REPAIR_TEST_DATABASE_URL`, `CLOSED_TIP_REPAIR_TEST_EXPECTED_HOST` and
`CLOSED_TIP_REPAIR_TEST_EXPECTED_DATABASE` privately. It refuses any database
other than the explicitly selected isolated `neondb` host and owner connection;
a missing URL is a skip, not a PostgreSQL pass. Live application access, SSH,
wallet calls, signing, service changes and Git publication were not performed by
the implementation agent.
