# Second same-budget reconciliation successor preparation

The distinct second-successor operator purpose prepares a transition from the
paused epoch 239 to epoch 240. It binds the immediate parent policy at epoch 238,
its committed activation, and the existing immutable parent-to-ancestor link.
The completed first-successor path is unchanged.

This path requires one existing unfunded expired admission, no matching deposit,
no unreleased reservation, no active order, and no other worker lease. The ancestor
still owns its quote and admission. The new policy inherits the exact parent
expiry, financial release, profile, source identity, assets, principal and fee
budgets, direction limits and quote cap. It carries one quote and one forward
admission across both ancestors, leaving one forward admission, two reverse
admissions and 31 quotes. It creates no payment or capital allocation.

Migration 0030 must already be installed. The new read-only installation verifier
pins its published LF-normalized bytes, checks the unchanged 0020/0021 functions
and the five installed 0030 functions against their source bodies, owners,
security-definer flag and search path, and checks effective API/table privileges
and both predecessor triggers. This purpose never executes migration DDL.
The capital collector uses this installation verifier with the existing actual
neutral Native capture and Base physical-capital reads. It retains the original
60-second Native/capital limit and 30-second current SQL source gate.

Publication remains Windows-local through the existing Main TLS transport and
durable WSL ext4 journal. A new purpose and namespace prevent replaying the first
successor intent. The intent is persisted before policy/link insertion and the
original-XID control CAS. Exact reconciliation requires every old application
row, fee xmin, prior predecessor link and lifetime counter to remain unchanged.
An unknown or intervened transaction is never replayed.

A separate private preparation pipeline produces new immutable policy, baseline,
current Source proof, capital proof, short-lived Root approval and local transfer
configuration. A separate postcommit selector helper checks the exact committed
receipt and new policy, then permits changing only the policy pin in the fixed
financial worker configuration. The financial execution manifest and datastore
preload pins remain fixed. Worker readiness must pass before the API selector is
switched. Private profiles, receipts and mappings remain outside Git.

Local verification on 30 October 2026:

- `npm --prefix api run typecheck`: passed.
- First-successor, second-successor and installed-0030 tests: 9 passed.
- The new test transaction inserts one policy and one link, performs the epoch
  239-to-240 CAS, preserves two old runtime rows and the prior link, and executes
  no DDL. Mutated predecessor history is rejected during exact reconciliation.
- Catalog tests reject changed installed bodies, missing triggers, API write
  privileges and changed migration bytes; all verifier queries are read-only.
- Three private Python helper files parsed successfully.

These are local implementation checks. They do not establish that a new policy
was published, that a live worker became ready, or that a customer funded an
order. Root must record actual execution and original-XID reconciliation before
claiming any of those outcomes. The original permit expiry is never extended.
