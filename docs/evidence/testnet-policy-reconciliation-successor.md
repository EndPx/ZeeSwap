# Reconciliation successor with cumulative pilot quotas

The original policy 10f is immutable at active epoch 236. Its one accepted forward
attempt expired unfunded; its quote and admission remain consumed. The reported
reconciliation acknowledgement moved control to epoch 237/xmin 131618. Restarting
the original epoch-236 worker cannot resume that policy, and an epoch rollback
would violate the generation fence.

The explicit successor path creates a normal version 1 policy at epoch 238, linked
to the original policy. It retains the original financial 6ebb worker release,
asset/profile/Source identities, all 2/2 directional limits, 32-quote limit,
budgets and exact original expiry. It introduces no allocation, time extension
or fresh quota. The immutable predecessor link records original activation 99985,
reconciliation acknowledgement 131618 and the carried one quote/one forward
admission. A predecessor can have only one successor.

Migration 0030 adds that link and an ancestor-hash helper. It replaces exactly
three existing SQL function bodies: quote binding, admission and availability.
Only their quota-count predicates change. Policies without a predecessor still
count themselves; the successor counts its own rows plus its ancestors. The
original 1/0 accepted counts and one quote therefore leave 1 forward, 2 reverse
and 31 quotes. Source, worker-lease, financial reservation, fee and global-slot
checks remain the original ones.

The read-only preparer requires exact paused control 237/xmin 131618, the original
unexpired policy, the sole expired-unfunded membership, no matching deposit or
unreleased hold, no active worker or global slot, and unchanged old runtime rows.
It reads current financial anchors/cursor and drafts a new current-financial
audit with no historical-readiness claim. The Native reader is explicitly bound
to published 08c828d and its protected current proof; the old 4a reader is refused.
The existing single-current-Source capture and real neutral/Base capital proofs
run before installing 0030. No 300-second observer qualification is added.

The Windows-local publisher uses the existing protected admin transport and a
new authoritative ext4 journal namespace. It verifies exact policy/migration
bytes, current Source and physical capital, original committed XIDs and actual
destination identity. The original intent precedes all DDL. Migration 0030, the
new immutable policy/link and control 237->238 CAS commit in one transaction.
Classification requires every pre-existing policy, quote, admission, expired
order, runtime row and financial row to remain unchanged. Unknown outcomes use
only the original journal/XID; a second attempt cannot reset counters.

Local verification: five successor tests and eight launch/current-Source regressions passed (13 total), covering original
expiry/caps, expired/no-funds closure, cumulative quota exhaustion, default
self-only counting, exact SQL-body equivalence except lineage predicates and
durable intent before atomic publication. API TypeScript passed. At that
preparation milestone the migration had not been applied. No recovery or
financial operation was executed by the implementation agents. Root reviews
and executes the bounded operator pipeline separately; these tests are not a resumed service or a completed swap.

Root's actual R2 publication reached original intent XID 189979 and then failed
while creating the predecessor table's foreign keys. The policy owner had no
table-level or column-level REFERENCES privilege; the earlier owner key-share
UPDATE grant is a separate permission. Root classified that original transaction
as `ABORTED_EXACT_NO_REPLAY`, with every old financial, policy, order and runtime
row unchanged and control still 237/xmin 131618. The corrected private abort
receipt has SHA256
`40f4b149047d35637ab3ed0b0a3f17c754e89f2ab33b839a5fa57ae2783e1cc5`;
the authoritative ext4 and local raw intents both have SHA256
`dc09c0f425135f505373359a3326b373d85d0762ae7bd95d5d879d4b484d60b6`.
The earlier incorrect receipt remains retained; only the corrected pin applies.

Migration 0030 now verifies the actual owner and absence of any existing
REFERENCES privilege, temporarily grants REFERENCES on only `policy_sha256` to
that owner, creates the foreign keys, and immediately revokes the grant. It checks
that the effective REFERENCES ACL returned to its original state. No API/worker
privilege or permanent owner grant is added. A focused offline test checks this
ordering and scope; the existing quota, expiry and atomic-publication tests are
retained. The R2 intent is not replayed. Any R3 attempt requires separate review,
fresh proof authority and the corrected migration under a new operator commit,
while retaining the same candidate policy, audit, expiry and carried counters.

Root then ran a separate rollback-only DDL validation before collecting more
fresh proof. At validation XID 191942, PostgreSQL refused creation of the new
scope trigger because the migration had already reduced the new table owner's
privileges to SELECT/INSERT. The validation transaction rolled back; it created
no successor or activation. The migration now creates both triggers before
reducing the owner ACL, with the same final SELECT/INSERT owner privilege and
read-only worker/reader grants. The focused ordering regression covers this
dependency. Root validates the pinned SQL candidate in a rollback-only context
before the next fresh-proof publication attempt.

The second actual rollback-only validation passed at XID 192413 using SQL raw
SHA256 `b97f8761a8b22d2f0e8e4f5dabeb9ba7ddfb248b5a67a11474e0591b2af69011`.
Root verified identical financial/control/policy/runtime state and raw ACLs before
and after, absence of the new table after rollback, and final transaction status
`aborted`. The local validation receipt SHA256 is
`5a4450926107c95f10a1f7884bd061912f85117fd268580420e1dd81caf63ceb`.
This proves DDL compatibility in the actual restricted administrator context;
it neither publishes a successor nor enables admission. R3 still requires fresh
Source/capital evidence, a reviewed new operator manifest and its own original
publication journal.


## Actual R5 successor commitment

Root reported `COMMITTED_EXACT` for the separate R5 publication at original
XID 195922. Control advanced monotonically to epoch 238/xmin 195922, with the
same d699 successor candidate and the exact original expiry. The immutable
predecessor link carries one quote, one forward admission and zero reverse
admissions, leaving one forward attempt, two reverse attempts and 31 quotes.
The old policy, expired-unfunded order, memberships and runtime history remain
retained. The publication created zero payments and no new capital or budget.

The completed receipt is protected outside Git at
`/opt/zeeswap-testnet/state/service-policy/successor-20261030-r5/activation-completed.local.private.json`,
with SHA256
`71d05db18f9cc69a7e81304e76b20adb9d82f84f59a5d10e2cdbfeb803813d17`.
This was a new reviewed attempt after the classified R2 abort, not a replay of
that original intent. R3/R4 capture refusals remain retained; their failed
freshness checks did not create publication authority or relax the 60-second
capital guard.

A separate private diagnostic measured one unchanged legacy neutral read at
18.026 seconds: approximately 11.017 seconds in the SDK notes/waitsync phase,
1.002 seconds in sync-status and 5.007 seconds in Python network/validation.
That observation does not establish the cause of the earlier uninstrumented
62/88-second reads. The subsequent R5 operator run retained the actual capture
START and all original freshness guards.

Root subsequently completed the postcommit selector switch after actual worker
readiness. The old c2 worker configuration was archived byte-for-byte; only the
policy pin changed. The new worker configuration SHA256 is
`6cbec844b2779b5fbf4b74565862ebb61f77c86c72d07723def5fb697f50539c`.
Financial 6ebb code, the a70 execution manifest and the f0 PG shim remained
unchanged. The worker and API selectors now reference the d699 successor.

At `2026-10-29T20:10:10.071043Z` (30 October 2026, 03:10:10 WIB), Root's public
availability read returned `ready`, with both directions available, remaining
capacity of one forward attempt, two reverse attempts and 31 quotes, and zero
active orders. Root also recorded three actual `POLICY_IDLE_CAPITAL_VERIFIED`
worker messages and successful active-service checks. The original expiry is
still `2026-10-30T08:13:20.732Z` (30 October 2026, 15:13:20.732 WIB).

Root also verified the live frontend in a separate background browser tab. The
initial cached document referenced an older bundle; a build-qualified URL loaded
the current frontend. Its DOM showed `0.001 TAZ -> 0.1 USDC`, one forward attempt
remaining, zero active swaps and `Ready for a bounded testnet quote`. The actual
`Review swap` button was enabled. A full-page screenshot is retained privately.
Root created no quote, connected no wallet and submitted no customer payment.

These are bounded worker/API/browser readiness observations, not a stability
window or a customer-payment result. No customer broadcast, settlement or
completed swap is established by the successor receipt or readiness snapshot.
