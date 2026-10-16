# Coherent forward source admission

Date: 2026-10-16 UTC. Status: split admission implemented and independently
reviewed. Local controller/protocol regression batch passed 38 TypeScript tests;
root subsequently reported a combined 56 TypeScript checks and typecheck passed.
The final source-actor suite passed 21 Python checks after the supplementary
SYNC artifact-absence hardening. Actual expiry/archive of the second unfunded
predecessor passed at 2026-10-16 04:15:42.460 UTC, followed by an independent
post-check. Normal testnet execution of the new admission path subsequently
returned BROADCAST for source13 at 04:23:45 UTC and READY at 04:31:36 UTC.
This proves live admission/funding observation, not another settled execution.
This document does not claim twenty completed settlements.

## Observed refusal

The driver stopped during the thirteenth logical source-funding action at
03:41:31 UTC with the exact minimum-eight-block refusal. The accepted funding
window is unchanged: the stored actual deposit-wallet scan plus twelve blocks.
The source actor independently requires at least eight blocks before proposal
and again before its durable spending intent and send.

Retained private files show about 63.5 seconds between the earlier source SYNC
and funding-artifact publication. Another interval of about 53 seconds runs
from that publication to prefunding SYNC completion, including controller and
sync work; it is not a measurement of SDK duration alone. The retained tip
snapshots advanced from 4507005 to 4507010, with seven blocks remaining relative
to the accepted cutoff at the latter snapshot. No tip was read at the exact
acceptance instant, so this supports a pipeline-timing inference.

The same policy code/phase was historically used at both the initial and
post-proposal checks. The retained prefunding sync tip and code ordering narrow
this particular refusal to the initial check, conditional on that unchanged
retained snapshot; the code/phase alone was insufficient. Future diagnostics
distinguish initial and final checks.

Root separately proved the source's sole approved 110000-zatoshi input remained
confirmed and unspent, with no transparent capital, zero existing SDK
calculations, absent intent/result and no surviving scoped actor/SDK process.
The full read-only actor audit also passed canonical scan/parent and raw viewing
wallet pending checks. No source send or proposal is inferred merely from
missing files. The earlier unrelated source-7 failure remains UNKNOWN.

## Production flow

The forward path now performs slow preparation before accepting a quote.
Refund validation, receiver allocation and Base preflight precede the final
actual deposit-view refresh. The private prepared artifact binds run, manifest,
sequence, attempt, owner, receiver, source actor configuration, exact quote
inputs, runtime epoch and the actual Base preflight capture time. It creates no
quote, accepted order or reservation.

One durable SOURCE_FUND action then performs:

1. Actual source-wallet sync, retaining its authenticated tip capture time.
2. Thin SQL admission, with no Base RPC, SDK, observer refresh or receiver work.
3. Exclusive ADMITTED continuation journal persistence.
4. Immediate SQL-only epoch, runtime and accepted-owner/funding authority check.
5. One source actor fund call, preserving all its existing safety checks.

There is no controller snapshot, next tick or full SDK sync between acceptance
and the fund call. Local persistence or authority failure after acceptance stays
hard and preserves the original operation for reconciliation. Existing ADMITTED
continuations cannot silently be overwritten or replayed as a new funding call.

## Window and accounting guards

Before issuing a quote, admission locks the runtime row and validates actual
persisted source and Base checkpoint freshness, the canonical deposit scan
anchor, the captured source actor binding/tip, and the prepared epoch. A source
network tip never becomes a scanner checkpoint. The new conservative admission
gate requires at least ten blocks remaining relative to the unchanged
scan-plus-twelve cutoff. Ten passes; nine returns a pre-admission wait with no
quote, order, reservation or ledger insertion. Funding's minimum remains eight.
The extra two blocks are a buffer, not a promise that heads cannot advance;
a later loss of the eight-block margin still refuses hard without automatic
reissue or resend.

Quote issuance and acceptance share one database transaction. Failed acceptance
rolls issuance back, preventing an orphan quote. A replay that finds the same
accepted owner/order only reexports its original funding and original cutoff
under a distinct status; the automatic fund wrapper rejects that status. It
never creates a successor or resets an accepted deadline.

SOURCE_ADMISSION_WAIT is allowed only before acceptance. It returns the slot to
read-only preparation so an old Base or source capture can be refreshed through
real reads. Repeated pre-admission waits yield to already funded active work;
they cannot monopolize admission priority while other originals need receipt or
commitment progress. Original signer/raw priority guards remain in force.

## Source artifacts and verification

The source actor checks both intent and result with lstat-based absence before
and after read-only sync, including after the final authenticated tip read.
Orphan results, dangling intents and artifacts appearing during a read refuse
before emitting SYNCED readiness. SDK timeouts retain owned sentinels. Existing
fund checks, exact capital/UFVK/refund validation, proposal fee and both
eight-block checks remain unchanged.

The new tests cover actual thirteenth-slot timing, ten-versus-nine admission,
production callback ordering, durable handoff before authority/fund, unknown
post-proposal outcomes, original-only replay, funded-work fairness and the
unchanged first-circle state. The schema-14 regression suite exercises zero
business rows on pre-admission refusal, atomic rollback after issuance when
acceptance fails, unchanged scan-plus-twelve cutoff, and one original quote on
replay. Those use injected captures in an invocation-owned database, not live
chain proof. Final verification also includes the existing controller, source
wait, protocol, child-diagnostic and actor tests.

Private prepared and ADMITTED journals, original funding templates, actor sync
snapshots and expiry audits remain outside Git. The expiry/recovery operator
must include the new fixed artifact paths in its before/after absence or
original-reconciliation proof. The source-7 and source-13 predecessor records,
accepted cutoffs and once-only funding journals remain retained.
