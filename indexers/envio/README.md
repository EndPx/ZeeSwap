# ZeeSwap Envio project

Prepared project configuration for **public Base Sepolia observations**. No
indexer has been started or deployed by this milestone. Financial dispatch is
absent. This project cannot issue a source-observer eligibility certificate.

The default config pins the existing V1 settlement address
`0xe99aC648F85450B8ddEAEA088Aa99749C5e16DA3` and starts at its deployment block
`48078599`, from [`base-sepolia.json`](../../contracts/deployments/base-sepolia.json).
The associated mockUSDC is
`0xD64C116352CEF2Adc9484098Ae332Fd9bA339A63`. These are public testnet records;
configuration preparation does not establish a fresh RPC verification.

## Validate locally

Use Linux or WSL 2 with Node 24 and pnpm 10.21.0. The official Envio CLI does not
run natively on Windows. This folder has its own workspace and pinned lockfile:

```sh
cd indexers/envio
pnpm install --frozen-lockfile
pnpm validate
```

`validate` runs code generation and TypeScript checking only. It does not start
Docker, an indexer, a database, a signer, a wallet or a hosted deployment.
Generated `.envio` files remain ignored. Pin `envio` to `3.14.0`; its published
minimum Node version is 22.15, and this project uses Node 24. Exact registry
integrity is retained in the lockfile.

On 23 October 2026, frozen install and `pnpm validate` passed in an isolated
Ubuntu 24.04 source copy with Node 24.18.0, pnpm 10.21.0 and Envio 3.14.0.
The Linux Node archive's SHA-256 matched the official nodejs.org checksum.
Native Windows codegen was attempted first and refused the unsupported OS.
These checks prove configuration/code generation and handler type compatibility;
they are not evidence of an operating indexer, event ingestion or rollback.

For the minimal runtime, supply a separate remote indexer PostgreSQL database
and the explicit ignored config described below. `pnpm dev <config-path>` runs
the same minimal Linux launcher; it does not invoke Envio's Docker development
stack. The RPC source profile does not need an Envio API token. Hosted
deployment, credentials and account setup remain separate work.

The runtime pins TypeScript **6.0.3** because Envio 3.14.0's handler checker uses
the JavaScript compiler API (`ts.sys.fileExists`), which TypeScript 7 removed.
Codegen and standalone `tsc` with TypeScript 7 had passed; actual `envio start`
exposed that incompatibility. The compatible pin passed both validation and
actual archived/live indexing.

## Events and V2 opt-in

Handlers persist the seven V1 customer settlement events (`PayoutReserved`,
`Paid`, `SettlementCancelled`, `Funded`, `PayoutCommitted`, `EscrowSettled`,
`Refunded`) and the two inventory events. Every amount is preserved as an integer;
decoded values use decimal strings in `decodedJson`. Events retain chain,
contract, transaction, log position, block hash and parent hash. They contain
public EVM data only and never import the order database or signing code.

The V2 event type includes the same events and `EscrowAborted`. V2 is **off by
default**: no V2 address is configured on any chain. After a separately reviewed
testnet deployment, add its exact address to a `ZeeSwapSettlementV2` entry under
the Base Sepolia chain, set `ZEESWAP_ENABLE_V2=true` and the matching
`ZEESWAP_V2_ADDRESS`, review its token/deployment start block, and regenerate.
The current single-chain start block still covers the earlier V1 history.
Never point V2 at V1 or invent an address. `EscrowAborted` is a refund event;
its handler never converts it into `Paid` or `EscrowSettled`.

## Coverage and coherent export boundary

`indexer.onBlock` records `BlockVisit` for every processed block, including blocks
with zero selected events. The default profile retains `coverageComplete=false`.
The explicit `ZEESWAP_COHERENT_HEADERS=true` profile enriches each visit through
an official Envio effect with caching disabled, a six-call-per-second limit,
verified Base Sepolia chain identity, exact canonical header, sampled source
head and actual sample time. A replay re-reads canonical data. Entity writes
remain inside HyperIndex's batch and rollback; handlers never write external SQL.
Each effect batches the chain identity, requested block and latest block into
one HTTP request. A transient read failure gets at most three bounded attempts.
Envio's preload shares effects in memory within its current batch even when
persistent caching is disabled; committed/reorged cache entries are discarded.

The app's [`exportEnvioRange`](../../api/src/integrations/observation/envio.ts)
requires a coherent producer. The ZeeSwap-owned
[`envioProducerViews`](../../api/src/integrations/observation/envio-producer.ts)
builds SQL views over pinned HyperIndex **3.14.0** tables. It joins the real
`envio_chains.progress_block` with that block's enriched visit. All selected
events and visits must have committed with Envio's progress, and every height
from the configured birthday must have a complete visit. The views expose:

- Checkpoint: `stream_id`, `payload` with generation, revision, complete processed
  header, true recovery floor, real source liveness, policy/projection digests and
  `complete=true` only after every selected event and empty block is covered.
- Headers: `stream_id`, `block_height`, `payload` with exact canonical header,
  including empty blocks throughout the certified range.
- Events: `stream_id`, stable `id`, `block_height`, `transaction_index`,
  `log_index`, `payload` matching the strict ZeeSwap BaseEvent DTO, including
  pinned ABI digest, token, version and exact decoded field names.

The local revision is PostgreSQL's MVCC snapshot transaction horizon; it is
explicitly ZeeSwap-owned, not an upstream API token. The recovery floor is one
block above the earliest actually retained Envio checkpoint; with no retained
rollback checkpoint it is `progress_block+1`. The generation and projection
digest bind the exact config, handler/schema sources and Envio version. A fresh
deployment/config change needs a new generation and isolated schema.

[`envio-export-server.ts`](../../api/scripts/envio-export-server.ts) exposes the
authenticated `/zee-observation/export?from=...` protocol on loopback. It uses a
separate SELECT-only principal, one read-only repeatable-read transaction and
bounded keyset pages. It refuses stale source samples, gaps and oversized tails.
The consumer independently compares every canonical header and RPC finality.
An indexer's rollback depth of 200 is not Base finality evidence.
Canonical comparison supports authenticated, id-checked JSON-RPC batches of at
most fifty headers, keeping the same thirty-second read budget. The live
application profile narrows that to ten per batch, at most two batches in
flight, and twelve RPC methods per second including bounded retries. Its
explicit current provider is labelled `base-sepolia-tenderly-rpc`; earlier
diagnostic reads used PublicNode independently of the primary indexing source.

The authenticated status endpoint reports only the current coherent checkpoint.
[`observe-live-envio.ts`](../../api/scripts/observe-live-envio.ts) permits a
thirty-two-block bootstrap only while the new application has no accepted
orders. Subsequently its encrypted admission frontier and prior SQL checkpoint
govern contiguous traversal with a thirty-two-block replay overlap; a gap above
one thousand blocks stops without advancing. It verifies current heads and all
retained monetary/pending-hint anchors, preserves heartbeat-only history, checks
the last admission hash independently and publishes through the existing
`publishObserverBatch` conflict/epoch gate. It refuses a producer more than forty
blocks behind its sampled head. A new full-history shadow mirror still starts
at its configured birthday and refuses an oversized initial tail; this live
publisher never claims to have initialized that historical mirror.

Known accepted `Funded` events become encrypted private receipt hints. The
existing `observeEscrowFunding` independently verifies finalized transaction,
calldata, authorization, payer, amount and contract state before SQL can confirm
funding. Hints survive leaving the current tail. Unknown settlement IDs never
become order funding, and the observer has no signer or dispatch capability.

## Minimal remote-database runtime

Docker is not required or used. Prepare an ignored profile with:

```sh
pnpm --dir api exec tsx scripts/prepare-envio-live.ts /absolute/repo/.deploy-local/envio-live-testnet/live live
```

The `archive` alternative prepares a separate sixteen-block replay containing
the publicly recorded V1 inventory-deposit block 48093596. `live` pins a recent
birthday for an independent continuously running diagnostic instance. These
profiles do not claim a complete backfill from deployment block 48078599 and
cannot replace the historical recovery gate.

Copy the prepared config and current source into a Linux project, provision a
new remote PostgreSQL database/schema, and set `ENVIO_PG_HOST`, `ENVIO_PG_PORT`,
`ENVIO_PG_USER`, `ENVIO_PG_PASSWORD`, `ENVIO_PG_DATABASE`, `ENVIO_PG_SCHEMA` and a
separate `ENVIO_INDEXER_PORT`. Run `envio local db-migrate up` once for the new
schema, then `scripts/run-linux.sh config.yaml`. The script disables Hasura,
uses verified TLS, caps the Node heap at 256 MiB and uses two PG connections.
It never starts containers, installs a database or imports wallet services.

Install the producer views after migration with `install-envio-views.ts`, which
also revokes the upstream default schema CREATE grant to PUBLIC. Grant a separate export role only
schema USAGE and SELECT on those three views, and launch the export server with
its ignored config and environment credentials. Credentials and runtime logs
must stay under `.deploy-local` or another protected private runtime directory.
The real PostgreSQL concurrency test is opt-in through
`ENVIO_TEST_DATABASE_URL` against a new isolated database; it creates and removes
only its unique `envio_mvcc_*` schema. Its successful run proves MVCC behavior
under a concurrent synthetic replacement; actual indexer/reorg and live-chain
ingestion evidence must still be reported separately.

Official references inspected for this configuration:
[configuration](https://docs.envio.dev/docs/HyperIndex/configuration-file),
[event handlers](https://docs.envio.dev/docs/HyperIndex/event-handlers),
[block handlers](https://docs.envio.dev/docs/HyperIndex/block-handlers),
[rollback boundaries](https://docs.envio.dev/docs/HyperIndex/reorgs-support), and
[3.14.0 release](https://github.com/enviodev/hyperindex/releases/tag/v3.14.0).

## Dedicated live testnet source (2026-10-23)

The new isolated Neon database is `zee_envio_20261023` on branch
`br-broad-pine-ao79wemx`. The active live schema is **`envio_live_final`**; the
older `envio_live` schema is retained stopped. The archive schema is
`envio_archive`. Settlement readers must use the active schema explicitly.

The planned export login receives SELECT only on `zee_checkpoint`, `zee_headers`
and `zee_events` in `envio_archive` and `envio_live_final`. Credentials live in
the ignored `live-testnet-20261023/export.private.json` configuration, never in
this repository. Creating the reader requires all six actual export objects;
its grants do not enable financial intake, dispatch or settlement.
