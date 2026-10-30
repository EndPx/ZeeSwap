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
ExecCondition=/usr/bin/env -u NODE_OPTIONS -u ZEESWAP_LEGACY_PG_PRELOAD_MANIFEST -u ZEESWAP_LEGACY_PG_PRELOAD_MANIFEST_SHA256 -u ZEESWAP_LEGACY_PG_PRELOAD_AMENDMENT -u ZEESWAP_LEGACY_PG_PRELOAD_AMENDMENT_SHA256 /usr/bin/node --import TSX_LOADER NEW_GATE_ENTRY /opt/zeeswap-testnet/secrets/testnet-policy-worker.private.json CURRENT_CONFIG_SHA
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

Root's first live condition refused before starting the new financial worker:
the original F0 transport manifest is Root-owned mode 0640, while the first gate
incorrectly requested secret-only permissions. F0 now uses the existing public
pin rule: Root ownership, no group/world writes, unchanged raw SHA and unchanged
symlink/parent protection. Fixed worker config and A70 still require secret
permissions. No live permission or financial file is changed.

Root also confirmed that the worker can SELECT immutable predecessor rows but
cannot directly EXECUTE `testnet_policy_lineage`. The condition now reads those
rows in its existing read-only transaction and derives the current lineage
locally, with at most four policies, cycle detection, ambiguous-parent refusal
and a bounded input query. It requests no database grant. Seven focused tests
passed, including mode-0640 F0 acceptance with secret/write/owner refusals and
bounded local lineage with cycle/branch failures. API typechecking and
`git diff --check` passed. The earlier refusal remains preserved; no automatic
selector switch or service restart was performed by the coding agent.

## Fresh-source condition and single operational watchdog

The condition now also reads both actual SQL scanner checkpoints and the
database clock. Both Native and Base observations must be no older than 60
seconds, no more than five seconds in the future, and have scanned height at
least finalized height. Missing or malformed checkpoints refuse startup. This
prevents repeatedly starting the unchanged worker when its Source guard will
immediately fail. Eight idle-gate tests passed, including stale-to-fresh and
missing/future/finality failures, alongside API typechecking.

The fixed Root-owned recovery marker
`/opt/zeeswap-testnet/state/service-policy/preuser-source-recovery-active.private.json`
also blocks the financial condition, checked before loading configuration and
again immediately before success. The watchdog fsyncs it before stopping
consumers; the automatic Source entry uses the same marker through SQL intent,
commit and original file acknowledgement. Only exact acknowledgement or a
verified no-intent/no-mutation retry outcome may remove it. Manual review,
unknown operations and pending publication retain the block even if the SQL
checkpoint has become fresh. Nine idle-gate cases passed, including a marker
that refuses financial startup despite otherwise fresh SQL and initial books.

`deploy/linux/preuser-service-watchdog.py` is a separate Root operation that
defaults to inspection. Its one-shot service/timer checks every 30 seconds after
the preceding invocation finishes, preventing overlapping recovery runs. It
uses the separately pinned automatic Source recovery entry's SQL-only inspector
and original-intent reconciliation contract. Closed-state and policy checks
must pass before actor actions. An active or transitioning financial worker is
never stopped, signalled or restarted; the watchdog waits for its own exit.

When the financial worker is inactive and closed-state inspection permits
recovery, the watchdog stops only the ZeeSwap Native and Base consumers, never
the Core indexers. The exact Base unit is
`zeeswap-testnet-envio-observer.service`. It invokes metadata recovery explicitly
and resumes ordinary consumers only after exact acknowledgement or confirmed
absence of a pending publication. An ambiguous original intent or manual-review
halt keeps consumers stopped for Root review. It never erases an attempt or
replays unknown publication SQL.

Starting the financial worker requires the full fresh idle gate again, no
pending publication, and an inactive worker. Its failed state is reset only
after these checks pass. A private fsynced start history limits requests to four
per 300 seconds; expiry of that window permits a later eligible retry instead
of permanent start-limit lockout. The worker's installed ExecCondition repeats
the same gate immediately before its unchanged financial ExecStart. Once any
current-policy quote, funding or uncertain financial state exists, automatic
financial restart remains unavailable. The watchdog never changes policy,
quota, expiry, control, balances, wallet state or API selectors.

The Root-only watchdog configuration pins the worker config, gate and Source
entries, Source config, loader and transport environment file. Worker and Source
policy files must have identical pinned bytes, even if their protected paths
differ. The provided service enables explicit execution only when Root installs
it with the reviewed environment; the standalone command remains inspect-only
unless `--execute` is supplied. Ten Python tests passed in WSL Ubuntu, covering
inspection-only behavior, no active-worker restart, stale gate refusal, exact
metadata ACK ordering, ambiguous intent refusal, no-intent read failure recovery,
closed guard/backoff failures, finite retry history, unknown-exception marker
retention and exact consumer unit
restrictions. `git diff --check` passed. No unit was installed or run, and no
live Source/database/service action was performed by the coding agent.
