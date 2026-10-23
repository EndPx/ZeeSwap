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

To start a local observation instance later, supply the required infrastructure,
copy `.env.example` to ignored `.env`, configure a private `ENVIO_API_TOKEN`, and
run `pnpm dev` inside this directory. That command starts Envio's local
development services and indexing; it is **not part of validation** and was not
executed here. Use an isolated indexer database, never ZeeSwap's operator database.
Hosted deployment, credentials and account setup remain separate work.

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
with zero selected events. Its official callback exposes the block number, so
these visits deliberately retain `coverageComplete=false`. They do **not** invent
block hashes, finalized status, source head timestamps, revision tokens or undo
floors from the last event. Event entities and visit markers participate in
HyperIndex's normal rollback handling; external SQL/API writes are absent.

The app's [`exportEnvioRange`](../../api/src/integrations/observation/envio.ts)
requires a stronger producer contract. Before connecting this indexer to the
shadow consumer, implement and review a bridge that publishes all three views
in the **same database transaction and rollback boundary** as processed indexer
state:

- Checkpoint: `stream_id`, `payload` with generation, revision, complete processed
  header, true recovery floor, real source liveness, policy/projection digests and
  `complete=true` only after every selected event and empty block is covered.
- Headers: `stream_id`, `block_height`, `payload` with exact canonical header,
  including empty blocks throughout the certified range.
- Events: `stream_id`, stable `id`, `block_height`, `transaction_index`,
  `log_index`, `payload` matching the strict ZeeSwap BaseEvent DTO, including
  pinned ABI digest, token, version and exact decoded field names.

Current schema tables are **not those export views**. There is no producer bridge
or export HTTP service here. Creating an unrelated checkpoint table after an
event handler, polling ordinary GraphQL rows, or using `max(blockNumber)` cannot
close that gap. Until the bridge and real rollback/empty-block tests pass, this
project is a prepared event projection and cannot satisfy I2 live acceptance.
The consumer independently compares canonical headers and RPC finality; an
indexer's configured rollback depth of 200 is not Base finality evidence.

Official references inspected for this configuration:
[configuration](https://docs.envio.dev/docs/HyperIndex/configuration-file),
[event handlers](https://docs.envio.dev/docs/HyperIndex/event-handlers),
[block handlers](https://docs.envio.dev/docs/HyperIndex/block-handlers),
[rollback boundaries](https://docs.envio.dev/docs/HyperIndex/reorgs-support), and
[3.14.0 release](https://github.com/enviodev/hyperindex/releases/tag/v3.14.0).
