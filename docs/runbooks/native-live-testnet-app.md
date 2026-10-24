# Native testnet app operations

This is the isolated 23 October 2026 Windows/WSL deployment. It uses Zcash
testnet TAZ and project-owned mockUSDC on Base Sepolia. It does not use Docker,
local PostgreSQL, NEAR execution or a historical G5 controller. The acceptance
target is one real circle: 0.001 TAZ to 0.1 mockUSDC and back to 0.001 shielded
TAZ. Service connectivity and setup transactions do not prove that circle.

## Fixed scope

| Component | Target |
| --- | --- |
| Neon project / branch | `raspy-truth-63998651` / `br-broad-pine-ao79wemx` |
| Financial database | `zee_app_20261023` |
| Chef / Envio databases | `zee_chef_20261023` / `zee_envio_20261023` |
| Existing V1 settlement | `0xe99aC648F85450B8ddEAEA088Aa99749C5e16DA3` |
| Project mockUSDC, 6 decimals | `0xD64C116352CEF2Adc9484098Ae332Fd9bA339A63` |
| New operator | `0x24FAFf408e7bB3c0ab076Aecc8fD3c00bD8b3087` |
| New EVM user payer | `0x4FFfdacf016B4fD1f0E9f3a77c3C1943540b055d` |
| Chef application project / birthday | `zeeswap_shadow_app_20261023` / `4532047` |
| Active / archive Envio schema | `envio_live_final` / `envio_archive` |
| Browser / API | `http://127.0.0.1:4183` / `http://127.0.0.1:3031` |
| Chef GraphQL / Envio export | `127.0.0.1:39375` / `127.0.0.1:8099` |

The app opening has four exact accounts: mockUSDC principal `200000`, TAZ
principal `200000`, TAZ fee `20000`, and Base ETH fee `500000000000000 wei`.
The other `12280000` zatoshi in the new physical capital note is unallocated.
Old pooled contract inventory and historical G4/G5 capital are excluded. V1
inventory is pooled onchain, so new-app reservation limits remain essential.
Source proceeds remain unreconciled until separately verified and journaled.

The new app profile accepts atomic input `100000` and at most one accepted order
per direction. Health exposes these bounds, and the browser shows 0.001 TAZ or
0.1 mockUSDC. Generic API profiles retain their earlier limits. A later limit
increase requires another capital and acceptance review.

## Ownership and runtime manifest

Current sessions, PIDs, configs and commands are recorded privately in
`.deploy-local/live-testnet-20261023/service-manifest.private.json`. These are
snapshot identifiers, not permanent IDs. Confirm a PID's exact command and config
before stopping it. Do not kill all Node, Python or WSL processes.

The API, static preview, Chef sync/server, Chef app projection, Envio engine,
Envio export and Envio app projection are independent. Observation processes
have no signing authority. Restart a projection without restarting its engine
or exporter unless that component itself needs recovery.

## Browser and API

From the repository root:

```powershell
pnpm --dir apps/web build
pnpm --dir apps/web exec vite preview --host 127.0.0.1 --port 4183
pnpm --dir api exec tsx scripts/serve-live-testnet.ts ../.deploy-local/live-testnet-20261023/launch.private.json
```

The guarded launch file binds only the new app database, new operator registry,
funding-only authorizer and the new same-treasury-UFVK viewing allocator. Do not
substitute old observer/operator configs. Startup does not activate controls.

```powershell
node .deploy-local/live-testnet-20261023/check-api.cjs
node .deploy-local/live-testnet-20261023/check-browser.cjs
```

Health must return 200, `integrationOnly:false` and bounds `100000` / `1`.
Before activation, quote creation remains `ROUTE_NOT_READY`; orders/deposits
remain zero. The actual Chromium connectivity check sends no wallet transaction.

## Chef and native source evidence

Keep the immutable Chef capital-exclusion proof unchanged. Its configured digest
uses the observation library's digest of the exact UTF-8 STRING: do not replace
it with raw-file SHA-256, parsed-JSON hashing or a trimmed string. Fresh native
capital snapshots always use new exclusive output paths.

The new operator treasury and watch allocator share a UFVK; the independent
shielded USER payer has a different UFVK. Their paths and identity fingerprints
remain private. Never substitute an old G1/G4/G5 signing wallet.

The actual engine commands use the installed pinned Chef CLI and private app.env:

```powershell
node --env-file=.deploy-local/chef-testnet-20261023/app.env indexers/zeer/node_modules/@zeer-dev/chef/dist/cli.js sync --config indexers/zeer/chef.config.ts --follow --poll-seconds 5
node --env-file=.deploy-local/chef-testnet-20261023/app.env indexers/zeer/node_modules/@zeer-dev/chef/dist/cli.js serve --config indexers/zeer/chef.config.ts --listen 127.0.0.1 --port 39375
pnpm --dir api exec tsx scripts/observe-live-chef.ts "ABSOLUTE_APP_OBSERVER_CONFIG"
```

`ABSOLUTE_APP_OBSERVER_CONFIG` is the current
`.deploy-local/chef-testnet-20261023/application-observer.private.json`.
Its `--once` option publishes one bounded canonical observation; it is not a
pure no-write operation, and it never signs. Do not regenerate a project or
birthday as a restart mechanism.

Immediately before the parent checks opening/activation, capture a fresh native
proof using a NEW output path:

```powershell
.deploy-local/g1-python/Scripts/python.exe workers/zcash-wallet/live_capital_snapshot.py --config "ABSOLUTE_LIVE_CAPITAL_CONFIG" --output "ABSOLUTE_NEW_UNIQUE_PRIVATE_PROOF"
```

Use `.deploy-local/chef-testnet-20261023/live-capital.private.json` as the reviewed
config. Update only the fresh path and raw-byte digest in the new app opening
config. The native proof must be within 60 seconds at verification; stale proof
refuses without adding capital. Do not overwrite Chef's exclusion proof.

## Envio engine, export and app projection

The active engine is in Ubuntu WSL at
`/home/albary/zeeswap-envio-live/project`. Preserve its frozen live.yaml, private
.env.live, birthday and active `envio_live_final` schema. After confirming the
old specific engine is stopped:

```sh
export PATH=/home/albary/zeeswap-envio-live/tools/node-v24.18.0-linux-x64/bin:/usr/bin:/bin
cd /home/albary/zeeswap-envio-live/project
set -a
. ./.env.live
set +a
pnpm exec envio start --config live.yaml
```

The exporter has SELECT only on the six `zee_checkpoint`, `zee_headers`,
`zee_events` objects in `envio_archive` and `envio_live_final`. Load credentials
without printing them:

```powershell
$exportSettings = Get-Content .deploy-local/live-testnet-20261023/export.private.json -Raw | ConvertFrom-Json
$env:ENVIO_EXPORT_DATABASE_URL = $exportSettings.databaseUrl
$env:ENVIO_EXPORT_TOKEN = (Get-Content .deploy-local/envio-live-testnet/export-token.private -Raw).Trim()
pnpm --dir api exec tsx scripts/envio-export-server.ts "ABSOLUTE_EXPORT_CONFIG"
pnpm --dir api exec tsx scripts/observe-live-envio.ts "ABSOLUTE_ENVIO_OBSERVE_CONFIG"
```

Use the current private `envio-live-testnet/live/export.json` and
`envio-live-testnet/observe.private.json`. Export endpoints are authenticated
`/zee-observation/status` and `/zee-observation/export?from=<height>`. Keep bearer
values out of URLs/logs. The app projection uses the new operator registry and
polls every five seconds. Canonical contradictions and temporary finality
regression remain WAIT/reconciliation; never manufacture a fresh checkpoint.

## Opening, activation and shutdown

All six setup identities, baseline, intents, receipts and completed setup proof
remain private and immutable. Do not use the setup publisher as a generic
controller after later deployer actions. Parent-operated commands are separate:

```powershell
pnpm --dir api exec tsx scripts/live-testnet-capital.ts check ../.deploy-local/live-testnet-20261023/opening-config.private.json
pnpm --dir api exec tsx scripts/live-testnet-capital.ts apply-opening ../.deploy-local/live-testnet-20261023/opening-config.private.json
pnpm --dir api exec tsx scripts/live-testnet-capital.ts check-activation ../.deploy-local/live-testnet-20261023/opening-config.private.json
pnpm --dir api exec tsx scripts/live-testnet-capital.ts activate ../.deploy-local/live-testnet-20261023/opening-config.private.json
```

Opening requires six actual finalized Base receipts, a fresh native proof,
matching watch/signing authority, empty customer tables and paused controls. It
persists one private opening proof/event ID and books four accounts/eight
balanced rows under locks. Repeating it checks exact existing rows, not a second
capital credit. Opening leaves intake/dispatch paused.

Activation additionally requires the actual bounded-worker readiness artifact,
fresh canonical checkpoints for both chains, current bounded API metadata and
parent verification of forward/reverse/refund operators. Never fabricate that
artifact. Before stopping a financial actor after intake, pause new admission
and dispatch through the reviewed new-app control path and reconcile original
signed effects/obligations. Stopping HTTP is not a refund, expiry or settlement.

Send SIGINT to the recorded session or stop only a confirmed scoped PID. The
API listener must be port 3031 with a command containing serve-live-testnet.ts;
matching only node.exe is insufficient. Preserve private journals and original
bytes. Resolve an unknown outcome from its original hash/canonical receipt;
never change nonce, clear a guard, widen limits or fund a successor to hide it.

## Manual one-circle actor

The new manual harness uses public quote/accept/status and continuous Chef/Envio
source discovery. No G5 import, twenty-order loop, mock mint or control activation
exists in it. A private new user actor config is distinct from the operator.
Capabilities, routing memos and signed artifacts stay private, outside URLs/Git.

```powershell
pnpm --dir api exec tsx scripts/live-testnet-circle.ts status ../.deploy-local/live-testnet-20261023/circle-config.private.json
```

Substitute ONE reviewed step at a time; this table is not a shell loop:

| Phase | Manual step(s) | Gate |
| --- | --- | --- |
| Actor initialization | `init` once | Empty user mock balance, native-valid receiver, config binding |
| Forward API | `quote-forward`, `accept-forward` | Exact 100000 terms and accepted canonical funding instructions |
| Shielded source | `native-prepare`, `native-broadcast` | Immutable approved request/memo/cutoff; reviewed original native bytes |
| Source read/recovery | `native-recover`, `native-receipt`, `status` | Owned cleanup and original journal; distinct inclusion, discovery, SQL ACK |
| Forward receipt | `verify-forward` | SQL SETTLED, finalized actual Paid/Transfer and user balance 100000 |
| Reverse API | `quote-reverse`, `accept-reverse` | Actual forward proceeds only; signed escrow terms and quoted payer |
| Exact approval | `prepare-approve`, `publish-approve` | User nonce 0, approve exactly 100000 to pinned V1 |
| Exact funding | `prepare-fund`, `publish-fund` | Approval canonical inclusion, nonce 1, live original funding window |
| Integrated observation | `status` | Continuous Envio discovery; canonical source finality and operator ACK |
| Circle receipt audit | `verify-circle` | Both SQL ACKs, final Base fund, independent canonical ten-confirmation shielded output and user gas conservation |

Each API POST and financial child invocation has a durable pre-intent. Existing
signed bytes/hashes are reconciled rather than regenerated. Unknown publish
intents block automatic sends. Native execution requires a positive owned-process
cleanup ACK; without it the harness retains its lock and journal. Do not delete
that lock or kill the supervising wrapper before cleanup to start another SDK
calculation. Prove the owned group exited and reconcile the original operation.

Approval may advance after canonical inclusion on the same EVM chain. Source
confirmation and cross-chain payout still wait for finality. The approval uses a
512-byte public fee upper-bound envelope; the larger funding ABI uses 768 bytes.
Signed raw bytes are never sent to fee-estimation RPCs. Both user EVM actions have
separate 10000000000000 wei fee caps and a 20000000000000 wei aggregate cap.

The private timeline distinguishes block time, first client-observed API
discovery, SQL confirmation, publish intent/ack and observed finality. Polling
observations are bounds, not exact indexer processing latency. Prepared,
submitted or merely included effects do not establish a completed circle.

## Verification and publication

Frontend fixtures and the opt-in HTTP database test are synthetic. The latter
creates a new UUID database, applies only tracked migrations 0001-0014, and drops
only that disposable database:

```powershell
$env:ZEE_TEST_LIVE_HTTP_DATABASE = '1'
pnpm --dir api exec tsx --test test/integrations/http-live-escrow-db.test.ts
Remove-Item Env:ZEE_TEST_LIVE_HTTP_DATABASE
```

Never reset a retained app/primary/historical database with fixtures. Keep keys,
wallet databases, UFVKs/fingerprints, API bearers, raw receipts, full memos and
private mappings outside Git. Publish only reviewed designated testnet summaries.
Do not report acceptance before both actual legs and exact accounting pass.

## Future VPS handoff

These services currently run on Windows/WSL and localhost. They are NOT deployed
to the user's VPS. Existing configs contain Windows paths, WSL distributions and
local native binaries; they are not portable Linux launch files.

SSH alias/config, domain, OS, installed runtimes and service manager must be
inspected first. A separate reviewed handoff can then provide Linux-native paths,
systemd units, protected wallet/journal transport and public ingress. Preserve
observer/signer separation and reconcile original signed effects before moving
an actor. Do not infer a server setup or copy signing material to an uninspected
host.

The parent has now performed read-only inspection of the candidate VPS: Ubuntu
24.04.4, Node 24.14.0 and pnpm 9.15.9 are present, alongside existing nginx-backed
applications. No ZeeSwap service/path or DNS record for the proposed
`zeeswap.endpx.cloud` was present at that inspection. This is server inventory,
not a deployment. Use an isolated Linux user, project-local compatible tooling,
new systemd units and scoped nginx changes in the later reviewed phase; preserve
the existing apps. Remote writes, wallet transfer and service startup remain
with the parent operator.
