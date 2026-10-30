# Closed-current Native catchup

This separate Root operation addresses the stopped Native consumer's suffix
after reconciliation at control 239 / xmin 250387. Root recorded cursor and SQL
checkpoint 4,556,142, then a ready Core checkpoint above 4,557,770. That gap
exceeds the ordinary 1,000-block cycle bound. The ordinary bound is unchanged.
Neither the old prefunding epoch-zero recovery nor the old linked continuation
approval is current authority for this operation.

`recover-current-policy-chef.ts` supplies explicit `prepare`, `recover`,
`publish` and `reconcile` commands under a new Root-owned campaign. Its new
coverage-only version 4 reuses the linked suffix chunk/proof validation,
overlap rules, committed-XID classifier and cursor acknowledgement boundary.
Old approval validators continue to reject version 4. There is no new birthday,
project, account, source generation, financial worker code or admission policy.

The new authority binds the exact protected reconciliation baseline SHA-256
`3a0d5bb8c006c2589837c9171dcf522bbab65553bfd9ecdcd5ecc96dc15a9876`,
the current D699 policy and its predecessor, the retained 97-row financial and
policy snapshot, its unchanged legacy financial digest, paused control, original
cursor and checkpoint, original recovery journal, runtime profile and pinned
operator entry. The existing closed historical deposit/order/operation rows
remain intact. The carried policy attempt must be expired and unfunded, with no
matching/attached deposit, global busy slot, Root authorization or other worker
lease. The actual database system identifier must be 7701863382450487342.

Root must keep the Native observer and financial actors stopped. The command
holds the existing Native recovery writer lock and the worker supervisor lease,
checks relevant live processes, and maintains the shared recovery marker across
interrupted publication. It allows a finite suffix of at most 5,000 new blocks,
in chunks of at most 1,000 headers with the existing nine-block overlap. Every
chunk uses the existing complete Chef pagination, SDK receipt classifier and
canonical header validation. Any receipt or financial output refuses the
operation for manual review. No receipt is skipped or financially ingested.

Publication independently checks every retained persisted Native hash using
the original protected 08c reader module and its unchanged reader proof. It then
selects one final fresh target, fully traverses any bounded additional suffix,
rechecks the proof history and financial anchors, checks a fresh independent
head and exact current Source checkpoint, and constructs an empty-output
snapshot. The snapshot keeps the actual independent sample timestamp; it does
not refresh historical chunk timestamps. The ordinary observer's later
readiness still depends on its normal current-source guards.

Before the SQL publication, the existing observer transaction lock fences the
exact original checkpoint, persisted prefix, financial/policy baseline and
control. A private original-XID intent is fsynced before checkpoint/header
writes. Only a committed exact checkpoint/control and the expected header delta
can install the original candidate cursor, write completion and remove the
marker. An aborted, unknown or intervened original transaction cannot be replayed.
The cursor acknowledgement can finish after approval expiry; this never allows
a new publication under an expired approval. No control, policy, quota, balance,
receipt or financial row is written by this entry.

Local verification: five new focused cases and 19 existing linked-recovery
cases passed (24 total). They cover exact-purpose refusal and old-validator
separation, a complete 1,630-block two-chunk suffix, unexpected receipt and
proof/gap tampering, financial-state change refusal, and original cursor/time/
finality binding with committed-only acknowledgement. API TypeScript checking
passed. The locally protected actual baseline also passed the closed-books
validator without printing its private rows. This is offline baseline
validation, not a fresh database or Source observation. `git diff --check`
passed. No VPS command, Source probe, SQL mutation or service change was performed
by the coding agent. Live execution and original-XID results remain unverified.

The private file-only preparer takes the reviewed operator app, public commit
and a new `current-239-...` case name. It emits a protected config plus command
arrays. Root runs `prepare`, reviews the pinned authority, runs `recover`,
reviews complete coverage, and then explicitly runs `publish`. If an original
publication intent exists, only `reconcile` is permitted. A failed or ambiguous
operation retains its original files and marker; it does not start a new case.

## Historical wallet snapshot handoff correction

Root's first live prepared case failed with `INVALID_RANGE` before any chunk
proof, SQL intent or publication. The adapter returned a historical witness,
but the new CLI omitted it when calling the wallet snapshot bridge. The ordinary
range validator therefore rejected the actual current undo floor above the
selected historical chunk. This was a caller integration bug; the failed case
and immutable deployed release are retained unchanged.

The shared traversal used for both initial chunks and the final suffix now
passes the adapter's actual witness and project to `ChefWalletBridge.snapshot`,
with the actual current validation clock. It does not manufacture a witness or
rewrite coverage timestamps. A regression executes this production handoff
through the real wallet bridge with the undo floor above the chunk: an ordinary
call and a missing witness refuse, the real witness succeeds with unchanged
observation time, and a wrong project refuses. Six new current-catchup cases
and 19 existing linked cases passed (25 total), alongside API typechecking and
`git diff --check`. This correction is not evidence of successful live catchup.
Root must prepare a separate case with the corrected entry pin.

## Bounded final Source advancement

Root's second live case completed three private coverage chunks, then stopped
before an SQL intent because Core advanced while the final history audit ran.
The decoded target and SQL/cursor baseline remained unchanged. Exact equality
between the final Core height and decoded target was unnecessarily restrictive
for this observation-only handoff.

The final reread now permits Core to be at the decoded target or at most six
blocks ahead. Project and generation must remain unchanged. An independent
bounded canonical reader checks every header and parent link from the decoded
target through the reported current Core tip, including its exact tip hash.
The decoded target must remain canonical, with another uncached target check
before snapshot construction. Regressed, malformed or more distant Core
checkpoints, identity changes, missing headers, broken parent links and changed
target/tip hashes still refuse publication. The checkpoint remains the fully
decoded target; newer receipts belong to the next ordinary observation cycle.
The snapshot retains the actual independent sample timestamp.

Seven current-catchup focused tests passed, including the new production final
tail verification with six-block advancement and identity, regression, bound,
malformed-height, tip-hash, parent-fork and target-change failures. API
typechecking and `git diff --check` passed. The previous case's private proofs
and marker are preserved for Root's separately guarded prepublication retirement;
this patch does not retire them or claim a live publication succeeded.

Initial and final recovery target selection now matches the ordinary consumer's
two-block mature tail: decode through Core checkpoint height minus two. Before
selecting that header, the independent reader verifies all three headers and
parent links through the actual Core checkpoint and requires its exact reported
hash. The final up-to-six-block Source advancement check remains intact. No
receipt at or below the mature target is skipped; the newer tail belongs to the
ordinary consumer. The target retains its real header time and the snapshot
retains its real independent sample timestamp. Eight focused current-catchup
tests and API typechecking passed, including actual Core hash and parent-fork
refusals in mature target selection.

## Lease identity across publication connections

Root's third case reached publication validation but stopped before an SQL
intent with `CLOSED_STATE_CHANGED`. The actual baseline diff was empty. The
private coverage connection held the supervisor lease while the second pool
connection performed publication checks; excluding the querying backend PID
mistook the operation's own lease for another worker.

The entry now captures and validates the lease connection's backend PID and
excludes only that exact PID when checking for other worker leases, including
from the publication connection. Each fence verifies that the original lease
connection still has that PID and still owns the advisory lock. A lost lease or
any other worker remains a refusal. A focused two-connection regression checks
both connections against the same owner and confirms another worker is still
detected. Nine focused current-catchup tests, API typechecking and
`git diff --check` passed. No failed-case artifact, deployed release, Core or
Envio code was changed by this correction.
