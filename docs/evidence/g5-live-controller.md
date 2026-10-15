# G5 bounded live actor controller

Status at 2026-10-15 16:18:04 UTC: the controller has operated the third forward
order, whose original PAY is finalized and reconciled through a separately
reviewed [bounded scanner-failure recovery](g5-f3-scanner-recovery.md). The retry
has three SQL SETTLED and ordinarily receipt-verified orders. The first three
controller slots are DONE. A later fourth reverse-quote-step stop passed a
bounded no-effect reconciliation: no quote or financial effect, unchanged
database/main state and only the local controller latch cleared. A subsequent
normal driver accepted R4 at 16:18:04 UTC (AWAITING_FUNDS), then reached a soft
OBSERVER_WAIT at FUNDING_CALL with controller incident false. The driver
continues under its holds; no R4 source-funding receipt is yet claimed. The old
failure's cause remains unknown. Zero of four five-order barriers have completed; the funded
fourth-slot SDK interruption/recovery remains pending. G5 remains open. The controller adopted the first two settlements
only from paused core state with both orders SETTLED and their verification
flags present; it never source-funds, pays, or settles those orders again.

`api/scripts/g5-live-controller.ts` provides explicit `init`, `status`, `tick`,
and `release-hold` modes. `tick` is an operator-invoked bounded command, not a
background service. Its separate private controller state and exclusive lock
never hold the core manifest lock while invoking a core child command. The
read-only `g5-controller-status.ts` child acquires and releases that core lock
before another command starts.

The immutable private controller configuration binds the exact retry manifest,
run, nine remaining odd source actor command pairs, nine even payer preparers,
and their private outputs. It has `maxActive`, `admissionThrough`, and literal
stage holds. The initial operator policy can restrict admission through order
4, use one active order, and stop at `4:PREPARE_ZCASH`. No fault injection or
generic funded-incident recovery is provided by this controller.

The operator can explicitly release a configured stage hold or the named
`ADMISSION_THROUGH_RELEASED` and `MAX_ACTIVE_FOUR_RELEASED` policy holds. Those
decisions are saved separately in controller state, preserving the immutable
configuration and previous history. They are not automatic failure recovery.
An uncertain effect or crash with an inflight record prevents further ticks;
the original SDK operation or signed raw and nonce must be reconciled through
a separately reviewed recovery before continuing.

For each forward order, source sync precedes quote creation and exact once-only
funding. Admission steps receive priority so another order's long observation
cannot consume that quote's funding window. The source actor independently
checks the canonical core funding path, exact 100000 principal, 10000 source
fee, approved funded note, wallet identity, and eight-block margin before and
after proposal. A fixed controller intent is fsynced before invoking that actor.
The source actor retains its own separate fsynced SDK funding intent.

A forward START that returns a normal observer wait returns the controller to
SYNC before another admission attempt. After a successful admission or a later
bounded-tick resume, SOURCE_FUND performs another fixed read-only actor sync
immediately before invoking the fixed once-only fund command. This refreshes
the actor snapshot after a long Base observer wait or successful START. It does
not create another quote, rewrite funding instructions or extend the accepted
cutoff. The actor's original eight-block guard still stops an aged accepted
quote, and an existing source-funding intent still blocks sync/fund recovery.

For each reverse order, the controller derives the five-field funding approval
from the actual saved core funding object. It pins the immutable approval and
sorted-key digest before invoking the existing strict payer preparer. The
Windows approval-file IO anchors a native `/home` reference to the same WSL
distribution as its payer configuration. The native JSON reference remains
unchanged for the Python helper. Relative paths and traversal are rejected.
The prepared raw must match the original saved calldata, destination, zero value,
payer, chain, nonce, gas limit, gas price, raw hash and maximum cost. The original
hash is pinned to the private reverse observer configuration before RPC IO.
Existing original transaction lookup occurs before any first send. Ambiguous
send results freeze the controller with its original intent; they never invoke
a new payer transaction, replacement nonce or automatic source retry.

All operator commands execute sequentially. At most four slots may be active,
and each admission prechecks the existing available Base fee book against the
unchanged 50000000000000-wei quote cap. Before another preparation, the read-only
snapshot checks all original unconfirmed application raws against their signed
bytes, signer, chain, nonce and exact mapped order. Original canonical successful
inclusion and the advanced latest nonce allow another preparation while the
earlier order still awaits its own finalized receipt gate. An unmined raw or a
pending/latest nonce gap defers new preparation. The same forward slot can
dispatch again to finish its own retained raw. Multiple unmined raws, unknown
orders, changed bytes or contradictory canonical inclusion stop the snapshot.
Both core signers retain independent durable journals and nonce guards, and
each order retains its independent finalized receipt gates.

Every stage advances only on its explicit status. `CONFIRMING`, ordinary
finality waits and typed observer-frontier waits stop or defer dependent work.
Unexpected statuses, child failure, timeout and unknown results preserve the
inflight record and freeze. The verifier is called only after the read-only
snapshot reports that exact order SETTLED. Receipt verification is distinct
from selecting a terminal stage: reconciliation at dispatch entry can finalize
the original PAY and finish its job before claim, returning NO_ELIGIBLE_JOB.
The next fresh snapshot promotes that DISPATCH slot to VERIFY before scheduler
selection. It does not mark the receipt verified or the slot DONE. The ordinary
independent verifier must still pass; a failed verification freezes normally.
Receipt verification is distinct
from batch verification. The core's full physical-wallet and ledger barriers
must pass at 5, 10, 15 and 20 before further batch admission; the final `close`
command still independently enforces the twenty-order gate.

Review during the real F3 run identified the terminal-progress gap described
above. A subsequent bounded invocation stopped on an unknown source
viewing-wallet read failure. The reviewed terminal-progress fix now promotes a fresh SETTLED snapshot
to ordinary VERIFY after PAY reconciliation returns no eligible job. The
separate literal F3 recovery freshly proved all three original receipt paths,
the twelve-wallet partition, exact books, retained raw journals/nonces and
paused epoch 6, then cleared only that incident and original inflight state.
Its successful result at 15:49 UTC reported total operator Base execution fees of
11413220001117 wei, balanced ledger and zero unexplained deficits. It left
intake/dispatch paused and F3 unverified at VERIFY, preserving all barriers and
stage holds. Root performed separate read-only canonical checks before resume.
The original scanner failure's provider/SDK cause remains unknown.

The ordinary F3 verifier subsequently passed. At 15:52:22 UTC, root observed
the first three slots DONE and the controller continuing to the fourth reverse
quote with its incident false. The preceding positive read-only assessments
of sequences 1 and 2 returned ORIGINAL_CANONICAL and changed no financial or
reconciliation state. This progression does not complete a five-order barrier
or establish the pending funded SDK fault/recovery gate.

The driver stopped at 15:52:37 UTC during the fourth reverse-quote
step, with controller incident true and original inflight
`4 / REVERSE_QUOTE`. The core incident flag stayed false; the slot had no
accepted order identifier, reverse state file or per-order diagnostic. No R4
funding or signing was reported. Root separately checked admission and the
initialization inputs in read-only mode without repeating the quote body; those
checks passed, but the earlier failure cause remains unknown. The controller
stays stopped until startup diagnostics and an explicitly bounded no-effect
reconciliation are reviewed and proved.

The separate [bounded R4 no-effect reconciliation](g5-r4-empty-quote-recovery.md)
passed at 16:10:43 UTC. All three fresh original receipt paths, the full twelve
wallets, exact books and original canonical-finalized journal/nonces reconciled
with zero unexplained deficits. It proved zero fourth-owner quotes and absent
funding/signing effects, changed no database/main state and cleared only the
local controller incident/inflight. R4 stays at REVERSE_QUOTE; this is not a
quote creation or a funded SDK interruption result.

Local validation: **11 new controller checks**, **3 nonce-readiness checks**,
**2 private-path checks**, and **3 existing actor-policy checks** passed, and
the API TypeScript check passed.
The new tests exercise all
remaining eighteen orders and four barriers with injected IO, terminal-only
verification, pending source observations, durable unknown-send freeze, exact
gas admission threshold, two mined originals awaiting application finality,
one unmined raw and global pending-nonce waits, altered/canonical-conflicting
raw rejection, operator-raw serialization, and the literal fourth
order hold. Three admission-freshness regressions cover repeated normal START
waits returning through sync, immediate pre-fund refresh after delayed successful
admission without changing instructions, and failed refresh preventing funding.
Two terminal-progress regressions cover PAY reconciliation returning no eligible
job followed by fresh SETTLED-to-VERIFY promotion, and a failed independent
verification remaining incomplete and frozen despite a terminal snapshot.
These local fixture checks are distinct from the actual original F3 execution
and scoped recovery recorded above. They do not themselves establish network
settlement, a funded SDK interruption/recovery, remaining settlements or G5
completion. Raw transactions, memos, private mappings, approvals and funding
files remain outside Git. Normal F3 verification and subsequent operator actions
require their separate evidence.

At 16:18:04 UTC, a separate normal driver actually accepted the R4 quote
(AWAITING_FUNDS). Its next FUNDING_CALL returned a typed OBSERVER_WAIT with
controller incident false. This normal pre-funding wait is distinct from the
16:10:43 UTC zero-quote audit and is not evidence of source funding, a hard stop,
a funded SDK interruption or a fourth settlement.

Root's final combined critical-milestone run at 16:19 UTC passed all **60
TypeScript checks in one command**, API typecheck and diff checks. The four
Python scanner checks also passed. These results do not replace the remaining
live receipt, funded SDK recovery and five-order barrier gates.

At 16:20:11 UTC, the next driver stopped after the original R4 payer funding
had been broadcast once. The production funding observer returned
AWAITING_BASE_FINALITY, but the controller's reverse OBSERVE_SOURCE contract
omitted that legitimate status. The controller froze before COMMIT; the core
incident flag remained false. The corrected contract accepts this wait only
for reverse source observation and keeps the same stage. Root invoked the
actual production observer in read-only mode at 16:29:18 UTC and confirmed
that its genuine wait result leaves the corrected controller at OBSERVE_SOURCE.

The [finalized-original-source reconciliation](g5-r4-funding-wait-recovery.md)
passed at 16:48:10 UTC. It proved the original funding receipt final, exact
HELD/READY books, all twelve wallets and original global journals/nonces, then
cleared only the controller incident/inflight latch. The result remained
**three SETTLED orders plus one funded, held R4**, with zero barriers and no
COMMIT, destination delivery or second source funding. The independent local
recovery/controller rerun passed **22 checks**. The controller suite now has
**16 checks**, including production-observer status coverage, durable sanitized
last outcomes, broadcast replay leading to fresh observation, and checkpoint
OBSERVER_WAIT without false barrier or close advancement.

A subsequent normal tick returned OBSERVER_WAIT without freezing. Another
normal tick stopped at 16:56:30 UTC during PREPARE_COMMIT initialization, with
a retained INIT_SLOT / ETIMEDOUT diagnostic identifying a private configuration
read before the signing body. The
[separate scoped startup-read recovery](g5-r4-precommit-startup-recovery.md)
reuses the finalized-source/held-book proof
and preserves PREPARE_COMMIT. Its eight local checks passed. Root's actual
invocation passed at approximately 17:14 UTC with the same three settled
orders, finalized original R4 source held READY, unchanged main state and no
new payment. A subsequent normal invocation signed and broadcast the original
COMMIT. Root verified canonical success at 17:17 UTC in block 48158125, nonce 11,
with an execution fee of 749720000158 wei (including 158 wei L1 fee); finality
remained pending. This is a commitment receipt, not a shielded delivery or
fourth settlement.
The observed initialization boundary does not identify a deeper host failure.

Four-active scheduling stayed disabled through the R4 SDK fault until the verified recovery and explicit release described below.
The preparation-priority helper is now wired into the durable controller state.
A known preparation OBSERVER_WAIT pins that order ahead of admission and other
preparations, through an existing lease's NO_ELIGIBLE_JOB wait, SQL import and
the original broadcast. Reverse preparation retains the pin through its
BROADCAST stage. Protected fresh terminal evidence can retire a stale pin;
local DONE alone cannot. An unknown effect stays frozen, and the global pending
raw guard remains authoritative.

The production regression passed in a newly created, invocation-owned UUID
database. Actual dispatchBaseOnce durably prepared one original raw before an
injected observer wait prevented SQL storage. The scheduler selected that same
order despite another eligible slot: it first waited on the existing lease,
then imported and broadcast the exact original nonce-11 raw. Only afterwards
did the other order prepare nonce 12. The test signer independently rejected
preparation while an earlier nonce remained unlanded. A generated offline key
and injected chain reads were used; no public chain or wallet was invoked.
The database was removed by its ownership-scoped cleanup.

Root independently reran all **23 controller/priority checks**, including the
production regression; all passed. Six child-diagnostic checks and API
typecheck also passed after the matching closed private-transport code list
was added. Neither this local concurrency proof nor a pending COMMIT receipt
completes the funded SDK interruption/recovery, 20-order soak or four barriers.

The separately executed fourth-slot SDK interruption and strict original-byte
recovery subsequently passed. Ordinary recover-zcash then imported the exact
original bytes; root's independent SQL proof at 18:06:40 UTC found one
unconfirmed R4 row matching the original marker transaction identity/raw digest
and protected HMAC, with amount 100000 and fee 10000. Only afterwards did root
explicitly release the PREPARE_ZCASH hold, MAX_ACTIVE_FOUR and
ADMISSION_THROUGH gates. The driver resumed at 18:07:30 UTC with four active
orders permitted and admission through 20. Main incident/reconciliation were
clear at epoch 8, and the first three receipt flags stayed true. The existing
SDK journal still selects recover-zcash, preserving the original calculation.
This continuation does not establish R4 broadcast, delivery, settlement or any
five-order barrier; progress remains three settled orders and zero barriers.

At 18:17:45 UTC, the same normal driver observed the fifth forward source READY
and acknowledged the original R4 broadcast with AWAITING_ZCASH_FINALITY.
Controller health and the three settled receipt flags remained intact. This
adds original-transaction broadcast evidence after the interruption/recovery;
it does not establish ten Zcash confirmations, verified delivery, Base SETTLE,
a fourth settlement or a batch barrier.
