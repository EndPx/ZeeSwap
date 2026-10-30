# Pre-user worker idle restart condition

The financial worker's previously reported generic exit 78 did not preserve its
actual JavaScript exception. A nearby Base RPC throttle is a correlation, not a
proven cause. This change does not modify that worker, its public commit 6ebb,
execution manifest A70, native scripts or legacy PostgreSQL preload F0.

`check-testnet-policy-idle-restart.ts` is a separate Root-only, read-only systemd
ExecCondition. It verifies the exact current fixed worker configuration bytes,
policy proof and SQL binding, unchanged 6ebb execution closure and A70/F0 pins,
actual database system identity, and an unexpired active policy whose epoch
matches the active nonreconciling control. It does not call Source, a wallet,
signer, capital capture, service manager or SQL mutation function.

Permission is restricted to the state before the first current-policy user
interaction. The actual financial snapshot digest must equal the policy's
original `initialBooksSha256`, so a new quote, receipt or signing-related
financial database mutation refuses permission. Current policy quote/admission
counts must both be zero. The lineage must retain exactly the original one
expired, unfunded forward attempt and quote; its order cannot have an attached
or matching deposit. Closed legacy financial rows are preserved and allowed.
Any global active order, unresolved obligation/operation/transaction/job, busy
slot, Root authorization or existing worker lease refuses restart. A current
policy process directory must be absent or empty, with no symlink traversal.

This is not a general financial retry supervisor or an exhaustive wallet-journal
inventory. It relies on the narrowly proven absence of any current-policy target
to sign since the unchanged initial financial baseline. Once a user interacts,
automatic restart is unavailable and Root must review original journals and
liabilities. An unavailable proof or any unclassified gate error refuses the
condition. The original worker still performs its full actual capital capture,
pending nonce and wallet checks on startup; the condition makes no freshness or
backing claim and does not clear reconciliation or extend expiry.

Root may install a reviewed unit override using the new release's condition
entry and current fixed worker configuration SHA. The financial ExecStart and
working directory stay on their original 6ebb paths. The condition invocation
must remove `NODE_OPTIONS` and retain the protected current PostgreSQL transport
selectors. The worker keeps its original F0 preload environment. Backoff is 30
seconds, with a finite burst of four starts; a failed condition must skip the
worker rather than bypass the gate. Example shape, with actual reviewed paths
and config SHA supplied by Root:

```ini
[Unit]
StartLimitIntervalSec=300
StartLimitBurst=4
[Service]
ExecCondition=/usr/bin/env -u NODE_OPTIONS /usr/bin/node --import TSX_LOADER NEW_GATE_ENTRY /opt/zeeswap-testnet/secrets/testnet-policy-worker.private.json CURRENT_CONFIG_SHA
Restart=on-failure
RestartPreventExitStatus=
RestartForceExitStatus=78
RestartSec=30
```

The condition exits 0 only for the verified narrow idle state and 1 on refusal.
It does not start or restart a service itself. Root must review the concrete
override before use. No unit was installed and no runtime process was changed
by the coding task.

Local verification: five focused cases passed, covering retained closed legacy
rows, new financial mutations, new current-policy interactions or repeated
attempts, inactive/reconciling control and lease/expiry guards, and unresolved
legacy operations or ancestor funding. API typechecking and `git diff --check`
passed. These are local checks, not live restart or financial settlement proof.
