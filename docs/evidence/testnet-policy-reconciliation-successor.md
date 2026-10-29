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
new immutable policy/link and control 237ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢238 CAS commit in one transaction.
Classification requires every pre-existing policy, quote, admission, expired
order, runtime row and financial row to remain unchanged. Unknown outcomes use
only the original journal/XID; a second attempt cannot reset counters.

Local verification: four successor tests and eight launch/current-Source regressions passed (12 total), covering original
expiry/caps, expired/no-funds closure, cumulative quota exhaustion, default
self-only counting, exact SQL-body equivalence except lineage predicates and
durable intent before atomic publication. API TypeScript passed. The migration
has not been applied and no recovery or financial operation was executed by the
implementation agents. Root reviews and executes the bounded operator pipeline
separately; these tests are not a resumed service or a completed swap.
