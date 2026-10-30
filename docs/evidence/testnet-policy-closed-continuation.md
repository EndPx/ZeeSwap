# Context-pinned closed-policy continuation with unchanged expiry

This ordinary continuation reuses the installed 0030/0031 predecessor gates.
It creates one immutable policy and one predecessor link, then enables the next
control epoch under the original-XID CAS. It executes no migration DDL, creates
no renewal authorization, allocates no capital and does not extend the permit.
The completed first successor, second successor and explicit 24-hour renewal
purposes remain unchanged.

A protected finite Root context supplies the immediate parent policy/raw SHA,
committed activation XID, paused control/xmin, next epoch, original expiry,
complete baseline digest, retained policy/link/runtime/renewal counts, and the
consumed and remaining lifetime quotas. The validator walks the full ancestor
chain, checks its counters and closed unfunded admissions, requires no customer
funds, holds or active worker, and binds the entire retained baseline. The new
policy preserves the exact expiry, financial release, source identity, profile,
assets, allocation, caps and principal/fee budgets.

Publication verifies the actual installed 0031 function bodies, owners, security
settings, grants and triggers before and inside the transaction. It retains the
fresh current Source, Native/Base capital and 30-second SQL source checks. A new
immutable approval and durable WSL ext4 original-XID intent precede policy/link
insertion and the control CAS. Exact reconciliation permits only those new rows
and the expected control change; every previous runtime row, predecessor link,
renewal authorization and application row must remain unchanged. Expired Root
context authority blocks a new publication but does not prevent original-intent
reconciliation.

Private seven-argument prepare/fresh helpers and a local configuration builder
produce the reviewed packet. The postcommit selector helper pins and atomically
replaces the existing effective worker ExecStart, idle ExecCondition and API
selector drop-ins at their existing paths. It archives their previous bytes and
checks effective systemd ExecStart/ExecCondition contain the new worker-config
SHA before starting the financial worker. Only its policy pin changes. The API
selector is updated only after actual new-policy worker readiness. Policy-hash
filename ordering is not used to select a later override.

Local verification: API typecheck and two synthetic continuation tests passed.
The tests preserve three policies' history, their two predecessor links, three
runtime rows and the existing renewal authorization, carry the already consumed
admission/quote, reject altered baselines and expiry/budget changes, and confirm
that publication executes no DDL. Three private Python helpers parsed
successfully. These checks do not establish an actual continuation commit,
worker readiness, customer transaction or settlement. Root records those
outcomes separately after original-XID reconciliation.
