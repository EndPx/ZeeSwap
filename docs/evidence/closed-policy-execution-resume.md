# Closed policy execution resumption

The original financial worker stopped after its Base PAY was included. Root
reported that the existing immutable PAY subsequently finalized and reconciled
the original receipt without signing or broadcasting another transaction. The
service remained paused at control epoch 243. The stop cause was not established;
absence of an exposed SQL error is not evidence of a particular transport fault.

Migration 0037 prepares one separately authorized idle resumption of the current
policy. It never moves control backward: original policy/accepted epoch 242 stays
immutable, paused epoch 243 advances to effective execution epoch 244. The
original policy SHA, accepted memberships, predecessor lineage, quotes, budgets,
fee allocations, inventory, ledger and original process journals remain intact.

`testnet_policy_execution_epoch(policy)` returns the original policy epoch by
default. An immutable `testnet_policy_execution_resumptions` grant selects 244
only for the exact original policy. Four SQL function replacements change only
the runtime-control epoch comparison. Their existing body, role ACL, lifetime,
reuse, capital timestamp, freshness, admission and financial checks survive.
In particular, `accepted_epoch` remains 242; it is never rewritten to 244.

Publication requires the actual paused xmin, an exact financial/full snapshot
digest, the reviewed new execution approval hash, exact migration bytes, exact
existing function-body baseline, finite Root publication authority of at most
five minutes, a durable original-XID intent, verified actual primary identity,
fresh actual sources/capital, both actor locks and the observer-cycle lock.
SQL independently refuses open orders, unconfirmed Base attempts, unreleased
reservations or reserved inventory. Only the new grant and monotonic control
transition may change. The publication helper rechecks every original snapshot
row and the fee xmin before committing. An ambiguous commit requires original
XID reconciliation; it is never automatically replayed.

The publication helper is `publishExecutionResume` in
`api/src/testnet-policy-execution-resume.ts`. Its approval schema and baseline
hash helper are exported. Pass both the exact `approvalRaw` bytes and their hash,
the exact execution approval bytes, migration text, an actual source/capital
guard, and a private fsynced intent callback. Keep the approval and full intent
outside Git. Installing 0037 alone does not insert a grant or resume control.

## Actual checks

A dedicated PostgreSQL database, `zee_execution_resume_test_20261031`, contained
an isolated restored schema and actual closed-book rows. The test runner refuses
the live database name. All fixture changes, including function replacements and
the simulated resumption, were enclosed in a transaction and rolled back.

Thirteen checks passed:

- Default execution epoch remains 242.
- Wrong paused xmin is refused.
- Expired publication authority is refused.
- A pending order fences resumption.
- The worker role cannot invoke the Root resumption.
- Effective execution epoch becomes 244 after the grant.
- Control advances monotonically to 244.
- Original policy, admissions, quotes, inventory and ledger are exactly unchanged.
- The grant refuses mutation.
- Worker readiness records effective epoch 244.
- Membership still returns original accepted epoch 242.
- Existing lifetime and unfunded-reuse grants remain valid.
- The ordinary admission gate accepts the effective execution epoch.

The bounded approval validator unit test passed. Final combined typecheck,
publication, actual resume result and operator postchecks are recorded by the
coordinating operator; fixture success is not a claim of live resumption.
