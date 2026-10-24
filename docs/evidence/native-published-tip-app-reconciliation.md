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

The proposed application repair is restricted to this unfunded single-tip case.
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
- Application repair, new prefunding authority issuance, simultaneous source
  readiness and the first new two-way funded circle remain pending at this
  checkpoint. No customer payment or payout is claimed by these implementation
  tests.

Private approvals, raw receipts, full memos, wallet files, viewing keys, detailed
order mappings and RPC credentials are excluded from public Git history.
