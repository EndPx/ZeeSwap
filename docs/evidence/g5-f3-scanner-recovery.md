# Bounded F3 scanner-failure recovery

Status at 2026-10-15 16:18:04 UTC: **the explicitly reviewed F3 recovery and
subsequent ordinary F3 receipt verification passed**. The original F3 PAY was
canonically finalized and reconciled; three orders are SQL SETTLED and
ordinarily receipt-verified. The controller's first three slots are DONE and it
later stopped during the fourth reverse-quote step. A separate bounded no-effect
reconciliation passed at 16:10:43 UTC and cleared only its local controller
incident/inflight; database/main state and all three settlements were unchanged.
A subsequent normal driver accepted R4 at 16:18:04 UTC (AWAITING_FUNDS),
then reached a soft OBSERVER_WAIT at FUNDING_CALL with controller incident false.
The bounded driver continues; no R4 source-funding receipt is yet claimed.
The old failure's phase and cause remain unknown. Zero of four five-order barriers have
completed. The funded fourth-slot SDK fault/recovery remains pending; G5 is open.

The operator observed a generic WALLET_UNAVAILABLE failure during the first
source-wallet refresh of an F3 dispatch invocation. The retained sanitized
diagnostic identifies the exact dispatch failure and its two wallet-adapter
frames; it does not retain the underlying provider/SDK cause. A later successful
read-only snapshot does not retrospectively establish that cause. The failure
must therefore remain an unknown read-path failure. Its financial effects can
be assessed separately through the original journals, receipts and physical
balances.

## Literal recovery scope

The new `recover-f3-scanner` step in `api/scripts/g5-operator.ts` reuses the
existing fresh completed-order receipt verifier and full boundary reconciliation.
It is restricted to the literal retry run, its existing first two verified
settlements, the third forward order, zero batch barriers, reconciliation epoch
6 and the exact retained scanner diagnostic. Its additional argument is the
private controller configuration, bound to the same unchanged run manifest.
The controller must be frozen with precisely three slots, original inflight
`3 / DISPATCH`, and first two slots DONE. The recovery acquires the controller's
exclusive lock while holding the ordinary core run lock. It cannot race another
driver or accept a different source-funding/signing incident.

Before proceeding it verifies the names and byte hashes of the original first
fourteen SQL migrations. Future unapplied migrations 0015/0016 are excluded.
Existing original F3 PAY must already be durably stored. Only that original
attempt may remain unconfirmed. The operator independently checks its actual
canonical successful finalized receipt before invoking existing receipt
reconciliation while controls remain paused. Pending finality returns an honest
waiting result; no signature, broadcast, replacement nonce or new payout is
created. Reconciliation records an already-existing chain fact and does not
authorize clearing the incident by itself.

Recovery then requires exactly three SETTLED orders, exact confirmed source
deposits, three CONFIRMED payout operations/DONE jobs, discharged source
obligations, nine released reservations, four forward attempts, the original
reverse COMMIT/shielded payout/SETTLE, no refund and balanced accounting. F3's
failed lease must be retired. The existing independent verifier freshly checks
all three original source and destination receipt paths without source
ingestion or checkpoint rewrites.

The six current operator signed raws must equal their original private global
journals and recover the configured signer. All retained operator and payer
journal raws are checked for hash/signer/chain/nonce and exact chain input,
destination and value, with canonical receipts at or below a fresh finalized
head. No retained nonce may be at or beyond the expected next nonce. Older
historical journal transactions may have a known finalized success or revert;
their prior costs belong to the pinned opening. The six current payout-path
transactions must independently satisfy their successful receipt verifiers.
This does not require setup nonces that were never recorded in these journals
to be manufactured as journal files.

The full twelve-wallet physical capture and actual viewing-wallet source
snapshot must reconcile the two original forward proceeds and the original
reverse delivery against exact books, actual execution fees, contract balances,
zero open liabilities/reservations and no unexplained deficit. The nine unused
reverse wallets may have no unknown SDK calculation, approval, state or raw
journal. Actual latest/pending operator and payer nonces must be `11/11` and
`7/7`, and are checked again after the slow physical proof.

## Paused commit and local state

A private incident/recovery proof is persisted before clearing anything. The
final transaction compares epoch 6, paused controls, the complete protected
database snapshot including accounting/original rows/jobs, the original local
states and diagnostic, private configuration/journal pins, and unchanged
migration bytes. It clears only reconciliation while preserving the epoch and
paused intake/dispatch.

Both local state files must then save successfully. Main incident becomes false
while F3 remains `receiptVerified: false`. Controller incident/inflight clear
and its third slot becomes VERIFY. No barrier advances and nothing marks that
slot DONE; the ordinary independent verifier must pass after normal resume.

If either local save fails or has an uncertain outcome, SQL reconciliation is
reinstated first under the same paused epoch. Recovery restores a local file
only when it still equals the exact original or proposed contents owned by
this recovery. Unrelated changed contents are preserved for operator audit.
The original frozen controller inflight record is retained whenever such an
owned restoration is possible. The private original proof remains available;
there is no generic clear flag or blind rerun authorization.

## Actual scoped recovery

Root executed `recover-f3-scanner` after independent code review and local
checks. It exited successfully at 15:49 UTC with
`G5_F3_ORIGINAL_PAY_SCANNER_RECOVERED_PAUSED`, preserving epoch 6 and the original
transactions. The private proof remains outside Git. This is an actual operator
recovery and original-receipt reconciliation, distinct from the synthetic
checks below.

The third forward order's original source was included at Zcash testnet height
4505154, within its original height-4505161 cutoff. Its retained Base Sepolia
transactions were:

| Original phase | Transaction | Operator nonce | Actual execution fee |
| --- | --- | --- | --- |
| RESERVE | `0x4270cfbc26936151b9216adb0d4b0ae29217e2b965556802d849e836e9394d9c` | 9 | 3564600000221 wei |
| PAY | `0x722b959d1c184264eda208fde7cbda7180aa07ed3b5f9f0145a493bf3b03e517` | 10 | 1357060000094 wei |

The original PAY was mined in block 48154781 and passed its canonical finalized
receipt gate before reconciliation. F3's total Base execution fees were
4921660000315 wei. No source resend, replacement raw, new nonce, signature,
broadcast or additional payout was produced by the recovery.

The successful recovery reported these reconciled results:

| Check | Observed result |
| --- | --- |
| SQL settlements | 3: two forward and one reverse |
| Total actual operator Base execution fees | 11413220001117 wei |
| Ledger balance | Balanced |
| Unexplained deficits | 0 |
| Physical partition and original receipt paths | Passed the complete twelve-wallet boundary and all three original receipt verifiers |
| Reconciliation epoch | Preserved at 6 |
| Intake and dispatch | Paused |
| Controller continuation | F3 at VERIFY; original inflight cleared through the scoped recovery |
| F3 normal receipt-verification flag | False; ordinary verification remains required |
| Five-order barriers | 0 |

The core, controller and scanner locks were absent after completion. No live
source-exposure migration was applied: the retry retained its original fourteen
migrations. Root began separate read-only canonical checks before any controller
resume; those checks and later normal F3 verification have their own results.
The unknown cause of the original `WALLET_UNAVAILABLE` failure remains unknown.
Neither successful read-only reprobes nor this recovery reclassifies it as a
confirmed provider timeout.

## Subsequent normal verification and separate read assessments

The paused recovery result above deliberately left F3 at VERIFY. Root resumed
only after its separate read-only checks. The ordinary controller/core verifier
then passed F3. At 15:52:22 UTC, root confirmed that all first three controller
slots were DONE, the controller incident was false and its active stage had
advanced to the fourth reverse quote. This supplies the separate normal
verification result that the recovery itself did not claim. It does not claim
fourth-order funding, a funded SDK interruption or a completed barrier.

At 15:52:37 UTC, that driver stopped during the fourth reverse-quote step. The controller retained its incident and inflight `4 / REVERSE_QUOTE`;
the core incident flag remained false. The fourth slot had no accepted order
identifier and its reverse state/diagnostic files were absent. No R4 funding,
signing or economic effect was reported. Root's separate read-only admission
and initialization checks subsequently passed without retrying the quote body;
those passes do not identify the earlier failure's cause or authorize clearing
its controller incident. Startup diagnostics and a bounded no-effect
reconciliation remain separate work from the completed F3 recovery.

That separate [R4 no-effect audit](g5-r4-empty-quote-recovery.md) subsequently
passed at 16:10:43 UTC. It proved zero fourth-owner quotes, unchanged three-order
business history, all original canonical-finalized journals/nonces and full
twelve-wallet/accounting reconciliation. It changed no database or main state
and cleared only the local controller latch, leaving R4 at REVERSE_QUOTE for a
separate normal invocation. The old fourth-step phase and cause remain unknown;
no quote or funding was created by the audit.

Before that resume, two fixed read-only canonical assessments independently
rechecked the first two orders' original source and destination records:

| Existing order | Assessment time (UTC) | Result |
| --- | --- | --- |
| Sequence 1, shielded source to Base | 2026-10-15T15:50:21.472Z | SOURCE_REINCLUDED; ORIGINAL_CANONICAL |
| Sequence 2, Base source to shielded recipient | 2026-10-15T15:50:43.196Z | SOURCE_REINCLUDED; ORIGINAL_CANONICAL |

These are positive observations of the unchanged original canonical
transactions, not an actual reorg/re-inclusion or an absence/loss experiment.
No exposure existed for these assessments. They made no financial, exposure,
reconciliation-control or ledger mutation and did not invoke owner-only loss
recognition. Their underlying private mappings and full results remain outside
Git. These read observations are separate from the critical scanner/controller
recovery code and do not complete the future source-loss acceptance work.

## Grouped milestone boundary

The bounded milestone groups the controller's terminal SETTLED-to-VERIFY
progress correction, static scanner diagnostics and narrowly classified
completed-RPC waits, the literal F3 recovery with failure-safe local-file
rollback, their regression checks, and the actual scoped recovery above.
It preserves the original source and payout transactions and the distinction
between SQL settlement, ordinary receipt verification and five-order barriers.
Source-exposure accounting/resolution code and publisher integration are
separate work; their presence in a checkout does not authorize live migration
or change the fourteen-migration recovery requirement.

## Local verification

Seven new pure/injected checks and the existing completed-first-circle guard
check passed (**eight checks** total). New coverage includes the literal run,
diagnostic and controller admission guard; changed migration bytes and final
nonce gaps; original raw canonical/finality contradictions; successful local
save leaving F3 unverified at VERIFY; uncertain partial local save with
refreeze-before-restoration; preservation of unrelated controller contents;
and refusal of incomplete settled books. API typecheck and diff checks passed.
The combined recovery/legacy guard and current controller run passed nineteen
checks. A separate disposable-database run also applied the deferred 0015/0016
DDL successfully and passed ten exposure checks; that establishes valid future
DDL only, not completed canonical-resolution tests or live migration authority.

Grouped critical-milestone verification passed **43 TypeScript checks** in
root's subsequent combined run, covering existing units, controller progress,
F3/completed recovery, spawned-process scanner protocol and diagnostics. Eight
additional startup/cleanup boundary checks then passed separately, including
actual CLI failures with synthetic configuration and filesystem lock-ownership
checks. API TypeScript and diff whitespace checks passed. Root also
independently reran the four Linux Python scanner checks and the four scanner
protocol checks.

The implementation-time checks alone did not establish live recovery. The
separately executed operator recovery above supplies the bounded live receipt
and reconciliation result, followed by ordinary F3 verification. The R4
funded SDK fault experiment, remaining settlements and four five-order
barriers remain separate acceptance work. No completion of G5 is inferred from
three SQL settlements or a successful recovery command.

At 16:18:04 UTC, a separate normal driver actually accepted the R4 quote
(AWAITING_FUNDS). Its next FUNDING_CALL returned a typed OBSERVER_WAIT with
controller incident false. This normal pre-funding wait is distinct from the
16:10:43 UTC zero-quote audit and is not evidence of source funding, a hard stop,
a funded SDK interruption or a fourth settlement.

Root's final combined critical-milestone run at 16:19 UTC passed all **60
TypeScript checks in one command**, API typecheck and diff checks. The four
Python scanner checks also passed. These results do not replace the remaining
live receipt, funded SDK recovery and five-order barrier gates.
