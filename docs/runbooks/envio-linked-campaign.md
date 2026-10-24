# Explicit post-publication Envio catchup campaign

This implementation adds a separate Root-approved catchup after a completed
prefunding recovery and a later ordinary observer gap. It does not reopen,
rewrite, reseed or delete the completed recovery. Passing offline tests does not
prove a live gap has closed, fresh physical capital, activation or settlement.

The historical parent directory is fixed at
`/opt/zeeswap-testnet/state/envio/prefunding-recovery`. It must contain exactly542
valid hash-linked proofs, a completed publication at49672405, its original
sealed zero-hint admission, and the original publication intent and closure.
Root must pin the raw SHA256 of all four files. The closure commits the intent's
stable digest; that intent binds coverage, original SQL/admission and the sealed
candidate's raw bytes. The current V2 authority's original prefix applies to this
parent only. It is never applied to an empty new journal or bypassed with a
special zero-proof case.

A new approval has purpose `POST_PUBLICATION_PREFUNDING_ENVIO_CATCHUP` and pins
the current active admission bytes and exact Base checkpoint49676611, including
finality timestamp, original observation timestamp and scanner xmin. It pins
original R9 profile/handoff/opening identity, source generation/projection and
recovery-policy identity. This bounded implementation requires explicit
E4/xmin284222 authority. Any later epoch/xmin or changed admission/checkpoint
stops it; adapting to a different incident requires review. Root must independently
verify the current checkpoint with the recovery canonical reader.

The local-only template is
`.deploy-local/live-testnet-20261023/envio-linked-campaign-approval-UNARMED.private.json`.
It is deliberately invalid: zero hashes, missing dates and false stopped flags.
Do not invent hashes or turn those flags true without actual evidence.

## Root evidence and preparation

Root creates the approval and two pinned root0600 evidence files under the scoped
state directory. Existing current V2 authority selection remains explicit through
`ZEESWAP_PREFUNDING_EPOCH_PROOF` and `ZEESWAP_PREFUNDING_EPOCH_SHA256`. The CLI has no
service-stop command and no admin database credential. Root must stop the normal
observer and financial writers independently before issuing evidence.

The inactive proof shape is `{version:1,status:'ROOT_NORMAL_ENVIO_OBSERVER_STOPPED',
normalObserverStopped:true,verifiedAt:ACTUAL_ISO}`. The approval must be issued
within60seconds of that proof. Each round also scans process command lines for
the scoped ordinary observer and financial dispatchers and acquires the same
session advisory lock `(84532,20261024)` used by the ordinary observer.

The capital proof shape is `{version:1,status:'ROOT_LINKED_ENVIO_CAPITAL_VERIFIED',
profileSha256:ACTUAL_R9_SHA,epoch:'4',runtimeXmin:'284222',capital:EXACT_CAPITAL,
latestOperatorNonce:0,pendingOperatorNonce:0,financialWorkersStopped:true,
verifiedAt:ACTUAL_ISO}`. Root must build it from fresh independently checked native
and Base evidence and pin those underlying raw SHA values inside `capital`.
Its contents must exactly match the approval's capital object. Native physical
capital is verified at approval issuance (within60seconds), following the
prefunding authority model; the campaign does not call a wallet or falsely claim
that receipt is a later live physical read. Original assets/books remain guarded,
and current Base physical inventory/gas and latest/pending nonces are reread from
the independent Base client before each chunk and publication/reconciliation.
The native receipt remains an issuance snapshot. Root must bound approval expiry
to the operationally justified duration; the parser permits at most24hours.

All rounds recheck approval validity and raw bytes, all four parent raw files and
closure, stopped-process evidence, exact current E4/xmin, assets disabled, all four
original capital accounts, all eight opening ledger rows, no active leases and
all16 financial child tables empty in one coherent SELECT. The worker has no
SELECT grant on `api_quote_requests`. The guard instead requires a validated,
single-column, NOT NULL `quote_id -> quotes.id` foreign key through catalogs;
empty quotes then imply no request rows. No grant or migration is introduced.

## Root commands

Run from the deployed API directory, using reviewed current code. This runbook
contains command shapes only; no live execution is claimed.

```sh
/usr/bin/node --import tsx scripts/recover-linux-envio-linked-campaign.ts recover /opt/zeeswap-testnet/state/envio/ROOT_APPROVAL.private.json ACTUAL_APPROVAL_RAW_SHA 1
/usr/bin/node --import tsx scripts/recover-linux-envio-linked-campaign.ts publish /opt/zeeswap-testnet/state/envio/ROOT_APPROVAL.private.json ACTUAL_APPROVAL_RAW_SHA
/usr/bin/node --import tsx scripts/recover-linux-envio-linked-campaign.ts reconcile /opt/zeeswap-testnet/state/envio/ROOT_APPROVAL.private.json ACTUAL_APPROVAL_RAW_SHA
```

Only Root on Linux can run these commands. `recover` accepts1 to 20 chunks per
invocation; every256-block chunk overlaps32 blocks. Historical proof count stays
at most1024. The preserved original generation/profile/policy remain unchanged.
The independent recovery transport remains
`base-sepolia-recovery-publicnode-v1`; only the existing24/80 method pacing presets
are allowed. Normal Tenderly transport configuration is never rewritten.

The new directory is exactly `state/envio/catchup-<approval raw SHA>`, root0700.
Its `writer.lock` prevents concurrent local writers. The shared existing
`recovery-in-progress` marker contains that exact campaign identity and blocks
the normal observer. A marker from another campaign refuses startup. A stale
writer lock requires Root review; it is never stolen or silently removed.

After validating parent, approval, current state, current admission and canonical
baseline, the CLI creates the new zero-proof journal using the existing
`initialEnvioRecovery`. It archives the exact current admission bytes and writes
an immutable parent link. Every later invocation rechecks all prior proof tips
and both original anchors using `recheckEnvioRecovery`. Selected exports must
contain zero financial observations; none are discarded as empty hints. Partial
history changes only the private coverage file, never application SQL/readiness.

Final publication requires a fresh complete tail within the existing40-block lag
and original source freshness limits. It seals one candidate and validates its
opened plaintext against that complete admission. Under the existing restricted
runtime-row lock it repeats parent/state guards, obtains xid and confirms the
server supports transaction-status readback, then writes an exclusive durable
intent before any metadata INSERT/UPDATE. That intent pins original and intended
complete checkpoints including observation times and scanner xmin, unchanged
control xmin, financial digest, parent link and sealed candidate bytes.

The transaction refuses stored canonical contradictions and frontier regressions,
preserves old historical rows, inserts only the current/finalized anchors, and
CAS-updates the complete Base checkpoint once. Tail freshness is checked again
before first SQL mutation and before the checkpoint update. Root/SQL failures
leave the durable intent and shared marker for explicit review. No intent is
rewritten and no SQL publication is automatically replayed.

## Unknown COMMIT and finishing

An existing intent permits only explicit `reconcile`. Acknowledgment loss never
means success. Reconciliation checks the original xid status and exact intended
checkpoint (including its own transaction xmin), exact original control xmin and
unchanged financial digest. `committed + exact after` is required to install the
same sealed candidate. `aborted + exact before` stops for Root review; it never
replays. In-progress, unknown, different timestamps/xmin or any intervention stop.

Finishing reacquires the restricted runtime lock and performs confirmed readback
before replacing the admission. The replacement uses the same service UID986,
GID978 and0600 mode through a durable atomic file replacement. The original
baseline admission and parent link stay archived. A new completion receipt is
written and fsynced, then the matching shared marker is removed. The completed
542-proof parent directory is never written during any campaign operation.
A completed receipt with no marker refuses further replay; review that receipt.

This implementation is ready for independent review and isolated real-Postgres
verification. Offline fixtures and green typechecks alone do not authorize live
Root execution or establish successful catchup or cross-chain settlement.

## Offline implementation verification

On2026-10-24 the new linked campaign suite passed7/7 checks. Together with the
existing retained-history recovery and V1/V2 prefunding suites,43/43 checks passed.
The API TypeScript check and diff whitespace check passed. The fixtures include a
complete synthetic542-proof parent with encrypted admissions, raw-pin/closure
rejection, current epoch/xmin/FK/financial guards, durable publication ordering,
lost COMMIT acknowledgment and exact checkpoint-xmin reconciliation. No VPS,
wallet, source, database or financial action was executed for this verification.
Independent isolated PostgreSQL verification and actual Root approval issuance
remain required before any live campaign run.

```sh
pnpm --dir api typecheck
pnpm --dir api exec tsx --test test/integrations/envio-linked-campaign.test.ts test/integrations/envio-recovery.test.ts test/prefunding-epoch.test.ts test/prefunding-epoch-v2.test.ts
```

The subsequent finish-boundary correction passed8/8 focused checks and the API
TypeScript check. Its injected failures cover lease loss during the active
admission read (no install), admission write (marker retained), and durable
completion write (marker retained). The CLI checks the lease again immediately
before the atomic admission rename and immediately before marker unlink. No
filesystem or SQL action is retried on a lost session.


Root independently executed the production CAS fixture on the existing isolated
regression branch: one test passed with zero skips. The random fixture schema
was removed; no live application table was changed. The fixture used shipped
locks/triggers and checked actual lost-COMMIT readback, scanner xmin, preserved
controls and later intervention rejection. The corrected lease-loss suite passed
eight focused cases; observed loss during admission or durable completion leaves
the recovery marker in place without retry.
