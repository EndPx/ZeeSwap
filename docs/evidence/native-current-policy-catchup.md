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
