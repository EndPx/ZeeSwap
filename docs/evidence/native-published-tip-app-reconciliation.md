# Published-tip application reconciliation

This checkpoint concerns the isolated native Linux testnet application. It does
not resume the stopped historical G5 soak and does not establish a new funded
cross-chain settlement.

On 24 October 2026, Prep's source epoch changed again after the first source-only
repair. This second incident replaced the unfinalized Zcash tip at height
4536137. Unlike the earlier incident, Chef core, the application's SQL checkpoint
and its durable cursor had all published that old tip. Independent comparison of
712 retained SQL/core header roles found that only the two roles for that tip
differed. The common ancestor at 4536136 and the previously finalized anchor at
4536128 remained canonical.

The application consumer was stopped. Intake and dispatch remained disabled,
reconciliation remained required at application epoch one, all customer books
were empty, and the original opening balances remained in place. The separate
Base recovery retained its proven prefix and continued without publishing partial
history or moving funds.

Root independently reviewed a source-only repair and repeated its six local
policy/runtime tests. The actual official Chef check, rollback/replay and verify
steps all completed successfully at approximately 14:51 UTC, with positive owned
process-group cleanup and retained private logs. The source generation was
preserved. Root archived the old source proof/configuration, bound a new proof to
Prep epoch 29 and resumed the same bounded source follower. An independent check
confirmed canonical source progress and the stopped application consumer. This
source repair intentionally left the application's old checkpoint and cursor
unchanged pending the separate application repair.

The implemented application repair is restricted to this unfunded single-tip case.
It archives the approved before-state and exact old cursor, creates a durable
transaction intent, and uses two compare-and-set metadata updates through the
restricted application worker role. Original reorg/rewind triggers remain active;
they advance the application epoch twice rather than resetting it. The scanner
returns to the common ancestor, with finalized height and timestamp taken from
4536127. Its old observation timestamp is preserved, so repair cannot manufacture
freshness. Financial tables, opening ledger, disabled assets and previous source
history must match their approved digests. Cursor replacement follows confirmed
SQL commit; an unknown commit requires transaction-status and exact-state readback
on a fresh connection, without replaying the updates.

A version-two prefunding authority binds the actual resulting application epoch,
runtime transaction version, metadata-repair receipt and complete retained Base
prefix. It preserves the original handoff and opening balances and does not
activate trading. The original version-one authority retains its literal epoch,
incident and prefix requirements. A later activation still requires fresh capital
verification and a new five-minute observation window for both sources.

Validation checkpoint:

- Six local official Chef runtime/policy tests passed; these are distinct from
  the successful live source-only repair above.
- Root executed the production metadata-update function against original shipped
  PostgreSQL triggers in an invocation-owned fixture schema on the existing
  isolated regression branch. The test passed with zero skips and removed its
  fixture schema. It verified both epoch increments, exact transaction xmin,
  unchanged observation time, the corrected finalized timestamp, retained older
  canonical anchor, lost-COMMIT-acknowledgment readback and rejection of a later
  equal-value intervention. This test did not write the live application.
- Root focused metadata, legacy-authority and V2-authority tests passed 24/24 with zero skips. Independent review passed 15 focused checks and found no blocking defect in the final design. API typecheck and diff checks passed.
- Continuous simultaneous source readiness and the first new
  two-way funded circle remain pending. No customer payment or payout is claimed
  by these implementation tests.

The first deployed read-only inspection refused before application mutation
because it incorrectly bounded chain headers by the wallet's note birthday.
Actual stored headers began at 4531977, before birthday 4532047; all 511 retained
rows remained present. A narrow correction separates header verification from
note scanning: it retains every stored height, bounds safe integer heights to
0..4536137, rejects duplicates and preserves the existing capacity limits. The
focused metadata suite passed 8/8 after this correction. The two production SQL
updates were unchanged. This refusal is not counted as successful application
repair.

Actual application execution subsequently passed at approximately 15:09 UTC.
Root first let the existing Base recovery child finish and verified normal lock
release, preserving all 422 proofs and the original SQL/admission baseline. Root
issued an approval after fresh original-note and Base capital checks and briefly
quiesced application writers. The repair committed through the worker role,
advanced the original triggers from epoch one to three, rewound SQL and the same
cursor to 4536136, and set finalized height/time to 4536127. Independent readback
confirmed empty customer books, unchanged opening rows and the transaction's exact
runtime version. A separate reconcile invocation confirmed the same committed
result and receipt without replaying the SQL updates.

Root then reverified canonical history and fresh physical capital and issued an
explicit V2 authority binding that metadata receipt, actual epoch/transaction
version, original handoff and all 422 retained Base proofs. The same Chef app
consumer resumed and published checkpoint 4536283 with an 8.3-second SQL observation
age at the subsequent check. The new bounded Base driver verified 21 published
runtime hashes and continued the existing prefix. This is source/application
recovery evidence; intake and dispatch remain disabled, and no funded circle is
claimed.

Full Base recovery subsequently completed with 542 retained proofs. Root verified
its completed receipt against the durable publication intent, the full journal
digest, original admission hash and the production complete-gap validator. The
publication advanced the original application Base checkpoint from 49553618 to
49672405, with finalized height 49665152 and recorded observation time
2026-10-24T15:39:12.018Z. The recovery marker was cleared and the normal Base
observer started. A later read-only check showed advancing Base and Zcash
checkpoints, observation ages 23.8 and 7.8 seconds, unchanged paused epoch three
and zero orders. A continuous simultaneous five-minute window is a separate gate
and was not claimed from that snapshot.

An independent read-only audit also verified the application repair receipt,
archived intent/cursor digests, committed transaction identity, original opening
ledger/inventory, all sixteen empty financial child tables, enabled original
triggers, unchanged handoff/profile/opening identity and the authorized Base
prefix. It performed no wallet, signing, service or database mutation.

During continued observation, a later Chef follower exit reported
`INVALID_RESPONSE_JSON`. Prep remained at epoch 29 and the stored checkpoint at
4536305 independently matched the chain. Root retained the failure evidence,
captured a fresh canonical proof with the frozen helper and resumed the same
bounded follower. No application rollback, epoch reset or financial mutation was
needed for this transient source-response failure. This operator recovery is
separate from unattended service resilience.

Private approvals, raw receipts, full memos, wallet files, viewing keys, detailed
order mappings and RPC credentials are excluded from public Git history.
