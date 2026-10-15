# Completed-receipt descriptor validation recovery

Status: root's actual recovery passed at approximately 2026-10-15 17:39:30 UTC,
reporting G5_R4_VERIFY_BINDING_RECOVERED_PAUSED at epoch 7. It retained three
settled orders, the same finalized R4 source HELD/READY and the unchanged
controller at OBSERVE_COMMIT. The main incident and SQL reconciliation latch
cleared after the full original-effect proof, with no new payment or barrier.
Main/controller incidents were false and locks absent after exit. The earlier
invocation at 17:33:36 UTC had safely returned
AWAITING_ORIGINAL_COMMIT_FINALITY with both latches retained while finalized
height 48157972 was below original COMMIT inclusion 48158125. The implementation
agent performed no wallet, signing, broadcast, live database or G5 operator
action.

At 2026-10-15 17:22:53.339 UTC, root's ordinary verification of the completed
second order stopped with G5_COMPLETED_BASE_DESCRIPTOR_REQUIRED during
base-preflight. The new descriptor assembler required a redundant branchId
field which the original reverse configuration schema did not require. Root
confirmed that the field was absent while the original sequence, run, order,
owner and payer bindings matched. The assembler now permits absence and still
rejects a present mismatch. Its independent fourteen checks and API typecheck
passed. Root's subsequent direct read-only proof of all three completed
descriptors and their original Base receipts also passed, without SDK work,
ingestion, financial writes or clearing the incident. This failure has a
confirmed configuration-shape cause; earlier unknown scanner/quote failures
retain their original unknown classification.

The failure left the main incident and SQL reconciliation latch set at epoch
7, with intake/dispatch paused. The controller remained healthy at
OBSERVE_COMMIT, with no inflight effect. The first three ordinary receipt flags
remain true. The original R4 funding was already final; its original COMMIT
was included but had not yet been confirmed or charged in SQL.

`recover-r4-verify-binding` accepts only that literal run, diagnostic timestamp,
step, phase, code, exception class and four retained source frames. It also
requires the second reverse configuration's redundant field to remain absent
and pins the unchanged run/configuration files. The controller must remain
healthy at OBSERVE_COMMIT with a known commitment-finality wait; this mode
cannot clear a controller incident or an unknown preparation.

It reuses the reviewed R4 source/held proof but requires the original COMMIT
to be canonically finalized first: nonce 11, block 48158125, its exact original
transaction and block hashes, successful commitment event, original operator
signature/calldata and the protected SQL/journal bytes. The signed fee cap
must match the SQL cap, remain positive and bound both the transaction and
actual 749720000158 wei execution fee. Until finality is available, it returns
AWAITING_ORIGINAL_COMMIT_FINALITY with both latches retained.

The original source must remain exactly 100000 mockUSDC HELD with escrow
state 5 at fresh latest/finalized heads. R4 stays READY, its operation PLANNED,
and all three reservations remain held. The historical private lease must
match the queued SQL job with exactly one reconciliation fence advance; the
old lease is never restored. No shielded approval, calculation, signed output,
delivery or SETTLE may exist. Normal source observation and commitment
confirmation are deliberately not invoked by this mode.

SQL accounts and the independently balanced ledger must still reflect only
11413220001117 wei of the first three orders' operator execution fees. R4's
COMMIT row must remain unconfirmed with null receipt, block and fee fields.
The fresh physical gas proof separately deducts its already finalized
749720000158 wei fee exactly once. This reconciles the pending SQL confirmation
without inventing an expense, releasing a reservation or paying twice. The
full twelve-wallet partition, two original forward source notes, original
completed source/delivery receipts, all canonical-finalized global raw
journals, fourteen migration byte hashes and nonces `12/12` and `8/8` must
agree.

After a private audit, the final epoch-7 paused CAS compares the complete
protected books, unchanged main/controller files, all private pins, journal
listings and absent effects. It clears only SQL reconciliation and the main
incident. Controller contents, OBSERVE_COMMIT, receipt flags, reservations,
fees and barriers remain unchanged. An uncertain local main-file save first
re-freezes SQL and restores only this recovery's own original/proposed state;
it never overwrites foreign contents. Normal later OBSERVE_COMMIT must perform
the original receipt confirmation and fee charge after explicit resume.

Seven new local checks passed: explicit omitted-field cause with the authenticated run path; original funding event index/identity HMAC, encrypted source anchors and quote HMACs with negative cases; exact failure/controller scope and negative
variants; uncharged commitment and precise retired-lease books; distinct SQL
and physical fee models/nonces; successful main-only clear and refreeze-first
save failure; and foreign-state preservation. Together with the eight existing
source-wait/startup checks, all fifteen passed. API typecheck passed. These
checks establish the bounded recovery implementation. Root's separate actual
recovery subsequently passed as recorded above; it did not establish a fourth
settlement. G5 remains at three settled orders and zero barriers.

Root independently ran the combined critical suite at 17:34 UTC: all **107
TypeScript checks across fifteen test files** passed, along with four Python
scanner checks, API typecheck and diff checks. The production priority and
observer database checks used their own UUID databases and completed cleanup
with exit 0. This aggregate local verification remains distinct from public
testnet execution. Root resumed the reviewed normal driver at 17:40 UTC with
one active order, admission through sequence 4 and the PREPARE_ZCASH hold still
in place. That continuation is separate from the completed recovery; the
funded SDK interruption, delivery and R4 settlement remain pending.

The grouped reliability milestone was published as
`e3e66b860d8736172dc836fb8938e1fe515419b8`; root verified the remote SHA at
17:37 UTC. This subsequent actual-recovery evidence update was made locally
after publication and awaits the next grouped milestone.

The normal driver subsequently finalized the original COMMIT and saved the
immutable private wallet approval, then exited at 17:41:26 UTC at the existing
PREPARE_ZCASH rehearsal hold. Root started the already bound direct SDK
interruption test afterwards. That test is in progress: no interruption,
durable calculation, fault recovery or fourth settlement result is yet claimed.
The controller remains capped at one active order through this rehearsal.
