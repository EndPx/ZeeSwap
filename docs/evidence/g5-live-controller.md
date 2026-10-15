# G5 bounded live actor controller

Status: the live adapter is implemented and locally tested. These tests do not
establish another network settlement or completion of G5. The retry's existing
first two settlements are adopted only from paused core state with both orders
SETTLED and their receipt-verification flags present. The controller never
source-funds, pays, or settles those first two orders again.

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
from batch verification. The core's full physical-wallet and ledger barriers
must pass at 5, 10, 15 and 20 before further batch admission; the final `close`
command still independently enforces the twenty-order gate.

Local validation: **9 new controller checks**, **3 nonce-readiness checks**,
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
These are local fixtures. No live wallet, signature, RPC broadcast,
database mutation, or new settlement was performed during this implementation.
Raw transactions, memos, private mappings, approvals and funding files remain
outside Git. Actual operator execution and any additional settlements require
separate evidence.
