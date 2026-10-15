# R4 original funding finality wait

Status: the coordinator executed the reviewed scoped recovery successfully at
16:48:10 UTC. It returned G5_R4_ORIGINAL_FUNDED_WAIT_CONTROLLER_RECOVERED_PAUSED
under unchanged epoch 6, with **three SETTLED orders and R4 source HELD/READY**.
It preserved the original funding, main state and paused controls and left the
controller at OBSERVE_SOURCE with no new payment or barrier. R4 is not claimed
SETTLED. The retry still requires twenty actual settlements and four barriers.

The original fourth-order payer funding was submitted once. The controller
then froze at OBSERVE_SOURCE when the production funding observer returned the
ordinary AWAITING_BASE_FINALITY result. The old controller's reverse source
phase omitted that exact legitimate status, so its transition parser threw
after the successful child result. The previous code saved neither that result
nor a transition diagnostic. This was an engine status-contract gap, not
authority to fund again or replace the accepted quote.

The coordinator separately reproduced the actual production observation on the
original funding hash at 16:29 UTC: `observeEscrowFunding` returned
AWAITING_BASE_FINALITY, and the corrected pure phase transition remained at
OBSERVE_SOURCE. That read-only reproduction created no controller change or new
payment. Its private proof is separate from the local tests below.

## Normal status contract

Only a reverse OBSERVE_SOURCE phase now accepts AWAITING_BASE_FINALITY as a
normal waiting outcome. A forward source phase still rejects that status. The
controller waits at the same source phase until a later actual READY result,
then proceeds to COMMIT preparation under the existing source/lease/nonce
guards. No new funding command is invoked by this transition.

Before attempting any transition, the controller fsyncs the acknowledged
sequence/stage/status into `lastOutcome`. Its vocabulary is closed; an unknown
status is represented by UNKNOWN_STATUS and a SHA-256 digest rather than the
provider's text or extra result fields. A subsequent transition/action/save
failure retains a bounded static `transitionFailure` code and the original
inflight latch. Unknown outcomes remain frozen.

The status audit also preserves two other legitimate idempotent/waiting paths.
ALREADY_FINALIZED from reverse COMMIT/SETTLE broadcast moves only to the
respective fresh OBSERVE phase. It cannot authorize approval, delivery or final
verification by itself. Typed OBSERVER_WAIT at a full batch barrier or final
close stops normally with unchanged barriers/closed state; only a later
successful ordinary proof can advance either gate.

## Literal finalized-original recovery

The separately named `recover-r4-source-finality-wait` operator step accepts
only the literal current run and four bound slots, with first three receipt
checks complete, main incident/reconciliation false, paused controls at epoch
6, zero barriers and a controller frozen at fourth-slot OBSERVE_SOURCE. A
legacy missing `lastOutcome` is not itself waiting authority. The full actual
financial proof below is required. If a last outcome exists, it must identify
that same source phase and AWAITING_BASE_FINALITY. A retained transition-failure
code must identify the unexpected-status parser failure; a modern READY/save
failure is not admitted by this literal recovery scope.

The mode holds the existing core lock and the controller's exclusive lock. It
first verifies the original fourteen migration names/byte hashes and the
actual immutable fourth-order funding authorization, saved five-field funding
object, payer approval/digest, signed calldata, sender, chain and nonce. The
source is pinned to the original designated test funding hash
`0x962956490a2885d42bf14c1bc95d0d3a6d86ebe81f65c9e16e3b221bcef65a01`,
nonce 7, block 48156445 and its original block hash. The canonical successful
receipt must now be finalized, included before the immutable funding cutoff,
and show the original 100000-unit Funded event and exact user-paid fee.

If original funding is not finalized, it returns
AWAITING_ORIGINAL_FUND_FINALITY without observing it into the database or
clearing anything. Once finalized, the same normal source/view/Base refresh and
production `observeEscrowFunding` run **in process**; no nested core-locking CLI
is spawned. The ordinary observer must return READY. This records the real
original source deposit/HELD liability; it never signs, broadcasts, re-funds,
re-quotes or extends the accepted deadline.

After that observation, exactly the original first three orders remain SETTLED
and R4 is READY with one EXACT confirmed 100000-unit source, a HELD obligation,
PLANNED operation with chain authorization false, an unleased QUEUED job and
three exact unreleased reservations. No R4 COMMIT/SETTLE/shielded payout,
signing intent/result, SDK fault marker or shielded/Base destination approval
may exist. The payer funding approval is expected to be nonzero and must match
the original saved core funding; it is not confused with the still-zero
destination payout approvals.

The existing held-account/physical helpers verify all four capital accounts and
the twelve-wallet partition. The two original forward source notes and the
first reverse payout remain independently verified. Received reverse source
escrow remains separate from available contract inventory. Total original
operator Base fees stay 11413220001117 wei, with zero R4 COMMIT fee; the user's
funding gas is not charged to operator capital. All retained global raws must
be original, canonical and finalized, with operator next/pending nonces 11/11
and payer next/pending 8/8, repeated after the slow physical proof.

The ledger proof separately checks the original eight opening entries, every
event/asset balance, 200000 zatoshi and 100000 mockUSDC units of original
operator proceeds, and exact fourth-order customer-held/liability entries.
R4 has no operator proceeds or destination principal/fee spending. Each of the
six original operator journal paths carries an explicit phase; COMMIT/SETTLE
do not depend on optional table-projection fields to build their filenames.

The private audit precedes a final comparison of the epoch, healthy paused
controls, complete protected books, original main/controller files, all pinned
private configurations/journals and absent signing artifacts. The final
transaction changes no controls or main state. Only the controller incident and
inflight latch clear; fourth-slot OBSERVE_SOURCE and prior DONE slots remain.
The normal driver must observe again before proceeding. This recovery cannot
prepare COMMIT, mark R4 SETTLED, advance a barrier or clear a financial incident.

## Local checks

Six new recovery checks passed for literal scope, exact HELD/READY books,
separate escrow/operator-gas accounting and local controller-only restoration.
They also cover explicit original journal phases and independent negative
opening/balance/proceeds/held/expense ledger cases.
The sixteen controller checks also passed, including the actual production
funding observer with a missing-receipt fixture returning its real wait status,
delayed source-finality waits followed by READY, durable redacted outcome before
transition failure, broadcast replay requiring fresh observation, and checkpoint
waiting without false barrier/close claims. API typecheck passed.
The combined recovery/controller run passed twenty-two checks; diff checks
passed as well.

These are local fixtures and pure/injected checks. No G5 command, wallet,
signature, broadcast, actual source observer, database migration or control
operation was invoked by the implementation agent. Root's reviewed actual
finalized-source recovery and later normal dispatch require separate evidence.
The funded SDK fault rehearsal remains under its original fourteen-migration
guard; future migrations stay unapplied. Four-active-order scheduling also
remains gated on the separately identified post-sign/pre-store waiting-priority
fix and its verification.

The coordinator's independent pre-execution rerun passed all twenty-two
recovery/controller checks, API typecheck and diff checks. Its actual invocation
then verified the finalized original source, exact HELD/READY books and physical
partition before clearing only the controller latch. The private recovery audit
was retained. A later explicit normal tick returned OBSERVER_WAIT without
freezing; it did not change the count of three settlements. Subsequent COMMIT,
SDK fault, delivery and settlement remain their own operator evidence.
