# Dedicated native forward worker preparation

Recorded 23 October 2026. This is worker preparation and bounded verification
for the new testnet application. The private launch configuration was created
with `enabled: false`. No worker signing request, transaction preparation,
broadcast, intake activation or capital-book mutation occurred in this step.

## Scope and existing financial implementation

`api/scripts/dispatch-live-testnet.ts` calls the existing `dispatchBaseOnce`
and `reconcileBaseReceipts`. It preserves their SQL job leases, immutable
terms, restricted signer checks, durable transaction storage, same-byte retry,
canonical receipt verification and finality requirements. It never imports the
generic historical `base-dispatch.ts`, wallet adapter or SDK scanner.

The runner admits only the new integration branch/application database
`br-broad-pine-ao79wemx` / `zee_app_20261023`, its dedicated worker role,
Base Sepolia chain 84532, the pinned V1 settlement/mockUSDC addresses and
runtime code hashes, and the newly configured operator
`0x24FAFf408e7bB3c0ab076Aecc8fD3c00bD8b3087`.

The separate private forward signer configuration uses the existing original
`workers/base-signer/signer.py` through an exact eleven-argument WSL invocation
of the new Linux owned-process supervisor (`--kind base-forward`).
It cannot substitute the funding-authorization-only wrapper, append flags or
point at another signer configuration. Wallet account, password-file path and
journal root are pinned to the new October 23 namespace. The new forward and
reverse signers share this new journal root and its existing filesystem lock;
they never use the stopped G5 journals or wallet state.

## Concurrency and source readiness

`api/src/live-dispatch-scope.ts` supplies the shared forward/reverse operator
lock: session-level PostgreSQL advisory key **(84532, 20261023)**. Its dedicated
connection remains checked out for the entire settlement step. The worker
pool has three connections, leaving capacity for work and lease renewal.
Each pre-mutation refresh checks that the locked backend session still exists.
The code does not use an outer `Promise.race` timeout that could release this
lock while an asynchronous settlement operation continues.

Readiness comes from the new application's actual Chef and Envio SQL
checkpoints. Both observations must be at most sixty seconds old according to
PostgreSQL's clock, at most five seconds in the future, and have valid scanned
and finalized heights. Runtime dispatch must already be enabled with no
reconciliation flag. A captured runtime epoch is checked again at the existing
dispatcher's refresh gates. The runner does not scan an old wallet or renew
observer timestamps itself.

An explicit `--once` awaits one step and exits without a second poll. Loop mode
waits five seconds between complete steps. Signer requests retain the existing
signer protocol; the new supervisor owns a ninety-five-second child deadline,
process-group TERM/KILL and actual descendant reaping. The new supervised
transport does not kill `wsl.exe` on an outer timer: it requires exactly one
matching `OWNED_PROCESS_CLEANED` acknowledgement before settling. A missing
acknowledgement holds the caller and operator lock for explicit quiescence
review. Historical callers retain their previous default transport behavior.
Read waits remain authenticated waits. A hard or uncertain error stops the worker and enters
the existing reconciliation primitive inside the held operator callback,
before lock release, and only after the connected database and role were
authenticated. It does not automatically retry a fresh financial
operation or activate intake.

`--reconcile-only` invokes only the existing recorded-receipt reconciler under
the same operator lock. It cannot authorize, prepare or broadcast a new
transaction. The private file's disabled gate still applies.

## Checks

| Check | Observed result |
| --- | --- |
| Actual private launch with `enabled: false` and `--once` | `DISPATCH_DISABLED`, `broadcastAuthority: false` |
| Dedicated forward scope/readiness/scheduler tests | Six passed when the external-PG test URL was explicitly supplied |
| Real PostgreSQL advisory-lock contention | A second worker refused entry while the first held the key |
| Timeout cleanup scheduling | The key stayed held while the first callback awaited its cleanup; the next worker entered only afterward |
| Hard-failure pause ordering | A real PG key remained held during pause; the competing worker entered afterward |
| New supervised transport against actual child processes | Two passed: the owned ACK outlived the unsafe outer timeout; missing ACK held ownership |
| Old branch/operator, wrong worker/code hash/journal | Refused |
| Stale/future/missing sources, paused dispatch, changed epoch | Refused |
| Quote-only signer, extra signer flags, unbounded timeout | Refused before any signer invocation |
| Existing actual child signer-protocol regression | Seven passed |
| API TypeScript check | Passed |
| Reviewed-path whitespace check | Passed |

The real advisory-lock test ran on the separate new Envio test database, not
the financial application database. It took and released only advisory locks;
it did not create orders, claims, signer requests or payment attempts. The
timeout test verifies awaited lock cleanup scheduling; it is not a newly
broadcast transaction or a claim about remote WSL process recovery.

The parent operator must complete and verify the new capital books, keep the
actual source observers fresh, review and enable the private worker config,
then start this dedicated runner. First signing/broadcast and a newly funded
forward settlement remain unexecuted by this preparation step. This evidence
does not close those live acceptance gates or resume the stopped G5 run.
