# Envio live testnet observation evidence

Recorded 23 October 2026. This milestone operates a local Node observation
instance against Base Sepolia and a new remote Neon indexer database. It does
not deploy a public service, start Docker, sign a transaction, resume G5, or
establish new cross-chain settlement.

## Actual indexer and historical receipt

Envio HyperIndex **3.14.0**, Linux Node **24.18.0**, pnpm **10.21.0** and
TypeScript **6.0.3** ran in an isolated Linux source copy. The Node archive's
SHA-256 matched the official nodejs.org checksum. The TypeScript 7.0.2
configuration had passed codegen and standalone typecheck but actual startup
failed because Envio's handler checker calls the removed `ts.sys.fileExists`
API. Pinning TypeScript 6.0.3 resolved the actual startup failure; its lockfile
is checked in.

The archive instance processed **48093590–48093605**, exited successfully at
its configured end block, and produced **sixteen complete headers**, **one
selected event**, and **fifteen blocks with no selected event**. The event is
the previously publicized V1 `InventoryDeposited` receipt:

- Transaction [0x8a0053f8…7bd4](https://sepolia.basescan.org/tx/0x8a0053f8b0b8076ca65c8d1375889966e7dee9a3666fec8a502cec7c1f6c7bd4),
  block **48093596**, successful receipt.
- Actual decoded amount **10000000 atomic units** of the pinned six-decimal
  project mockUSDC, corresponding to the existing ten-token setup deposit.
- `verify-envio-archive.ts` independently fetched the canonical receipt,
  located the exact emitter/log index, decoded the event again, compared all
  decoded fields and amount, and compared all sixteen indexed headers with RPC.

This is discovery of an existing ZeeSwap public testnet setup transaction,
not a newly funded swap, customer deposit or cross-chain settlement.

## Coherent producer and live service

The current Node indexer uses remote database `zee_envio_20261023` on the new
integration branch and the frozen schema `envio_live_final`. It starts at
**49128651**. Earlier temporary diagnostic schemas remain separate and stopped;
no existing operator database or wallet process was resumed.

Each `BlockVisit` is enriched through an official effect with persistent
caching disabled. One HTTP request batches chain identity, the exact requested
header and the actual source head. Effects are limited to **six per second**,
with at most three attempts and a five-second timeout per attempt. Handler
writes use Envio entity APIs; they never write a second database transaction.
Envio's current-batch effect memory supports parallel preload and is discarded
after commit/reorg. An early eight-effect limit plus the primary RPC's
twenty-five-method-per-second quota caused a real fail-closed exit; the bounded
six-effect policy resumed the same committed schema successfully.

The three producer SQL views join actual `envio_chains.progress_block` with
complete block visits, all event entities and actually retained
`envio_checkpoints`. A contiguous visit check covers empty blocks as well.
The revision is the local PostgreSQL MVCC transaction horizon; the undo floor
is one block above the earliest retained checkpoint. Neither is described as
an upstream HyperIndex HTTP field.

The authenticated loopback export service listens on **127.0.0.1:8099** and
uses a separate SELECT-only principal. HyperIndex 3.14.0 itself grants schema
CREATE to PUBLIC during initialization; strict export startup detected and
refused that capability. CREATE was revoked on active/archive schemas, and
PUBLIC grants were removed from the stopped temporary schemas. The view
installer now performs this hardening. Startup verifies the principal's role
attributes, absence of schema CREATE and absence of table write privileges.
The export reads one read-only repeatable-read snapshot with bounded keyset
pages; stale samples, gaps and oversized ranges refuse publication.

An actual coherent live export independently verified **two hundred headers**
from **49129769 through 49129968**, with sampled source head **49129973**,
undo floor **49129724**, revision **11797** and source sample
**2026-10-23T09:31:03.785Z**. The live selected-event count was zero; this is
an observed empty complete range, not a fabricated customer event. Canonical
validation uses an independent PublicNode RPC with id-checked batches of at
most fifty headers. Sequential reads had exceeded the thirty-second budget;
batching preserves every comparison and that same budget.

The final producer generation binds projection digest
`91dad6a1a769d95f7ccfa8286e5bf2d55bf01225e1e86f9adbf9f2bcc1662e27`.
It includes the actual frozen config, schema and handler/header sources and
pinned Envio version. No active durable historical shadow mirror was silently
advanced when the generation was refreshed during this new runtime setup.

## New application publication

`observe-live-envio.ts` operates only against the new isolated application
database `zee_app_20261023` using its dedicated worker role. It consumes the
authenticated export, independently verifies canonical headers/finality,
rechecks persisted Base anchors, refuses a producer more than forty blocks
behind its sampled head and calls the existing `publishObserverBatch`.
It cannot sign or dispatch payments.

Actual repeated publications reached, among other checkpoints,
**49134106 scanned / 49127678 finalized**, with producer source head
**49134110** and source observation **2026-10-23T09:44:51.186Z**. A direct read
of the new application SQL confirmed this Base checkpoint alongside the
separate Chef source checkpoint. At that read, intake and dispatch remained
false and reconciliation remained true; this evidence does not claim that
application policy was enabled.

Accepted-order `Funded` events are matched through the application's existing
escrow binding and private settlement mapping. Known transaction hints are
stored in an authenticated encrypted private journal so they survive leaving
the current tail before Base finality. The existing `observeEscrowFunding`
must still verify the actual finalized receipt, canonical calldata,
authorization, payer, amount and escrow state before SQL funding can confirm.
Unknown IDs are ignored and counted. Actual publications in this milestone
contained **zero events and zero funding hints**; this new asynchronous hint
path has not been exercised by a newly funded user-approved order.

## Checks and remaining gates

| Check | Recorded result |
| --- | --- |
| Linux frozen project validation / actual startup | Passed with Envio 3.14.0 and TypeScript 6.0.3 |
| API TypeScript check | Passed |
| API integration regression | 75 passed, zero failed, one explicit external-PG skip |
| Dedicated producer tests with real new Neon DB | Three passed, zero skipped |
| Actual archive receipt and sixteen canonical headers | Passed |
| Actual two-hundred-header coherent live export | Passed |
| Strict SELECT-only authenticated HTTP export startup | Passed after removing upstream PUBLIC CREATE |
| Continuous new application Base observer publication | Observed repeatedly; no dispatch authority |
| Reviewed-path whitespace check | Passed |

The real PostgreSQL test holds a repeatable-read snapshot open while a second
connection atomically replaces synthetic fork headers and deletes an event.
The first export retains its old complete snapshot; the next export sees the
new complete empty range and a higher revision. Removing a required empty-block
visit refuses completeness. Additional tests reject reordered/duplicate RPC
identity errors, wrong heights and oversized canonical batches. This proves
SQL MVCC/replacement behavior, not a forced upstream HyperIndex reorg.

Remaining distinct gates include an actual forced HyperIndex rollback test,
full deployment-to-head backfill, a fully initialized durable historical
shadow mirror, newly funded hint reconciliation and user-approved cross-chain
execution. The current live application publisher validates a bounded current
tail and all its persisted anchors; it does not claim the historical mirror's
initial backfill. Bounds of five hundred persisted anchors/bindings and one
thousand export blocks are hard stops requiring deliberate retention/recovery
work rather than truncation.

Primary references: [Envio RPC configuration](https://docs.envio.dev/docs/HyperIndex/rpc-sync),
[block handlers](https://docs.envio.dev/docs/HyperIndex/block-handlers), and the
installed, integrity-pinned 3.14.0 source (`PgStorage`, `InternalTable`,
`LoadLayer`, `InMemoryStore` and `HandlerTypeCheckWorker`). Credentials, raw
runtime payloads, private order mappings and hint ciphertext remain outside Git.

## Pre-intake admission correction and open freshness gate

Further review found that an unconditional latest-two-hundred-block tail could
miss a `Funded` event after an observer outage. The publisher now uses an
authenticated encrypted version-two admission journal and the lower of its own
persisted frontier and the application's SQL frontier. This matters because
receipt reconciliation can independently advance the SQL Base head. Every new
height is traversed contiguously with an explicit **thirty-two-block replay
overlap**. A range exceeding one thousand blocks stops without checkpoint
advance. An accepted order with no admission journal blocks initialization.

Funding hints are fsynced before SQL head publication; the admission frontier
is fsynced afterward. A crash cannot advance SQL past a newly discovered hint
without retaining that hint. Canonical empty replacement removes pending hints
only inside the replaced range. The last admission hash is independently
checked; a changed old prefix pauses reconciliation instead of silently
accepting a deeper fork. Tests discover an event 350 blocks behind the new head,
refuse an oversized gap before export/SQL writes, and invalidate an orphan hint.

Read pressure was also measured rather than inferred from HTTP batch count.
The independent public gateway returned HTTP 429 / RPC `-32005` during a burst
of ten-method batches. The canonical reader now paces **at most twelve RPC
methods per second**, including bounded retries, with batches of at most ten
and at most two batches in flight. Every selected header remains checked;
the same thirty-second read budget applies. The actual provider is labelled
`base-sepolia-tenderly-rpc` in the explicit pre-intake profiles.

The prior publisher additionally rechecked every historical heartbeat anchor
and sent two sequential Neon queries per anchor. The live database had sixteen
stored Base anchor rows at measurement. The refined selector required only
**two current anchors**, one requiring persistence, and read them in **281 ms**.
It retains all monetary anchors: Base deposits, payout attempts, escrow
commits/settlements, source refunds and pending funding hints, plus the current
scanned/finalized checkpoints. Unreferenced historical heartbeat rows remain
stored and are not rewritten on every cycle. A real PostgreSQL fixture retained
old financial anchors while excluding two heartbeat-only heights, without
deleting any history. No historical G5 publication function was changed.

Development outages correctly reached the new gap refusal. The operator
explicitly authorized pre-intake admission recovery only after independent
checks found **zero quotes, orders, deposits and operations**, with intake and
dispatch disabled. Each prior journal's exact bytes were copied to a distinct
exclusive archive and left unchanged. New admission generations were recorded;
no customer deposit or accepted order was skipped, and no opening book was reset.
This permission does not create a post-intake reset path.

The first recorded five-minute source window was **not accepted**: over
302.544 seconds it had one successful publication and twenty-two waits,
eventually stopping on the oversized gap; maximum SQL checkpoint age was
333.451 seconds. Later method pacing produced repeated successful publications,
but a successful sustained freshness window on the final deployment is still
**OPEN**. This implementation milestone must not be described as completed
continuous-service acceptance or authority to enable customer intake. All
financial worker configurations remain disabled for parent operator review.

The final local integration regression ran with the explicit isolated Envio
PostgreSQL test URL enabled: **117 passed, zero failed, one skipped** (the
separate disposable HTTP database test). That run includes the real MVCC,
required-anchor preservation and operator-lock tests. The old signer-protocol
regression also passed seven tests. No test in this run funded an order or
started a financial worker. Working-candidate publication audit scanned 628
private configuration files plus referenced new secret files and found no
secret value in the proposed public working files; it printed counts and
filenames only. Existing unchanged G1 public-label exceptions remain restricted
to their original paths and hash.
