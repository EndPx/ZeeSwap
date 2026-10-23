# Observation adapter contract

Specification v1, 23 October 2026. Proposed ZeeSwap internal interfaces, not
existing upstream endpoints. See [integration decisions](README.md).

## Ownership and trust

Zeer Prep supplies Zcash data. A private Chef project uses the protected local
UFVK and a watch-only scanner to produce authorized note receipts. Envio
HyperIndex projects Base events. Neither receives spend authority or calls a
settlement API from a handler. The ZeeSwap worker validates both sources, writes
Neon business state, and requests bounded operations from independent signers.

Only the configured Zcash testnet/consensus branch and Base Sepolia chain 84532
are enabled initially. Network upgrades need a reviewed registry change; an
unexpected branch, network, contract, schema, generation or account fingerprint
is a blocking condition. Configure the scan birthday no later than the earliest
accepted or retained deposit receiver; `latest` is not a recovery start height.

The viewing key exposes authorized note plaintexts, not the whole shielded chain
or spending rights. Keep it local to the scanner service. UFVK-derived data,
receivers, memo bytes, private order references and key fingerprints stay in
authenticated private storage and never enter Envio's public schema.

## Internal types

Amounts and revisions use canonical unsigned decimal strings: `0` or a nonzero
digit followed by digits. Reject signs, decimals, exponent notation, leading
zeros, out-of-range values and unsupported enum values. Asset bounds apply in
addition to the existing 78-digit database domain. Heights are bounded safe
integers for these networks; hashes and addresses use network-specific decoders.

```ts
type Header = {
  height: number;
  hash: string;
  parentHash: string;
  time: string; // validated UTC timestamp, not local discovery time
};

type Coverage = {
  protocol: "zee-observation-v1";
  adapter: "zeer-chef" | "envio-hyperindex";
  network: string; // exact configured network, never symbol-only
  registryDigest: string;
  projectionDigest: string; // schema + handler + filters + deployed contracts
  generation: string;
  revision: string; // adapter snapshot version; not a fabricated upstream field
  fromHeight: number;
  through: Header;
  complete: true;
  readStartedAt: string;
  readCompletedAt: string;
  sourceSampledAt: string;
  sourceHead: Header;
  recoveryFloor: number;
  canonicalCheckAt: string;
  canonicalSourceId: string;
  contentDigest: string; // deterministic canonical encoding of range + rows
};

type ZcashNote = {
  kind: "zcash-note";
  network: "zcash-testnet";
  receiptId: string; // upstream, account scoped, audit only
  txid: string;
  pool: "orchard" | "ironwood";
  outputIndex: number;
  block: Header;
  amountAtomic: string;
  receiverBytes: string; // decoded pool receiver, not a guessed UA
  memoHex: string; // private bytes, validated before parsing
  accountFingerprint: string;
  scope: "external" | "internal";
  origin: "unknown"; // scanner does not establish sender identity
  coinbase: boolean;
  sourcePrivacy: "shielded" | "mixed" | "transparent" | "unknown";
  privacyEvidenceDigest: string;
};

type BaseEvent = {
  kind: "base-contract-event";
  chainId: 84532;
  contract: string;
  abiDigest: string;
  txHash: string;
  transactionIndex: number;
  logIndex: number;
  block: Header;
  event: "Funded" | "PayoutCommitted" | "PayoutReserved" | "Paid"
    | "EscrowSettled" | "Refunded" | "SettlementCancelled"
    | "InventoryDeposited" | "InventoryWithdrawn";
  settlementId: string | null; // null for inventory-only events
  token: string; // pinned contract token; not guessed from an event symbol
  amountAtomic: string | null; // null if the ABI event has no amount
  decoded: Record<string, string>; // strict per-event schema, never arbitrary data
};

type ReplaceRange = {
  coverage: Coverage;
  headers: Header[]; // every height, including empty blocks
  observations: Array<ZcashNote | BaseEvent>;
};
```

`Coverage` is a local integrity and completeness record, not a consensus proof
or third-party attestation. Its `revision` is the Chef project revision for Chef;
the Envio adapter must implement its own coherent range version. No promise is
made that Envio exposes an equivalent revision or `/status` endpoint.

`sourcePrivacy` needs a separately validated transaction-structure classifier
using canonical raw transaction data. Chef's `scope`, `origin`, receiver pool and
successful decryption do not prove fully shielded funding. Missing or ambiguous
evidence maps to `unknown` and cannot become the existing observer's
`shieldedSource: true`. Preserve the current verifier's narrow structural policy:
parse the complete transaction under the configured consensus branch, recompute
its txid, require zero transparent inputs AND outputs, no Sprout bundle, and
exactly one present supported shielded pool bundle. Normal intake additionally
rejects coinbase and internal transfers and accepts only the configured
Orchard/Ironwood note families. An otherwise shielded cross-pool transaction is
not silently upgraded to eligible. Version and test these rules before dispatch.
This describes the observed transaction structure, not historical anonymity,
sender identity, proof of source-of-funds or independent consensus validation.

Map the pool's receiver bytes through the network-aware wallet decoder into the
same canonical receiver representation used by accepted quotes. Comparing a
component's hex text to a Unified Address string is invalid. Treat memo bytes
with the pinned Zcash memo codec, then apply the existing canonical ZeeSwap
`makeMemo`/`parseMemo` format and exact receiver/reference binding. Do not strip
arbitrary bytes to turn malformed data into a valid instruction. Memo decryption
and instruction validation are separate checks; no amounts come from the memo.

## Stable identities and attribution

| Identity | Rule |
| --- | --- |
| Zcash economic output | Network + txid + pool + output/action index. Unique across accounts, generations and key rotations. |
| Zcash chain occurrence | Economic output identity + block hash/height. Re-inclusion changes occurrence, not economic value. |
| EVM log occurrence | Chain ID + emitter + tx hash + log index + block hash. |
| EVM business effect | Contract + public settlement ID + transition; reconcile all canonical attempts for that transition. |
| Range publication | Adapter/project identity + generation + revision + bounds + content digest. |

An EVM transaction can be re-included with a different log position. Preserve
occurrence history without paying again under a new log ID. Conflicting effects
for one settlement transition are an incident, not another valid payment.

One accepted Zcash order binds its private reference AND actual decoded receiver
to one primary output and exact source amount. A receipt ID that contains a key
fingerprint is not sufficient deduplication. Internal transfers, coinbase,
unknown references, copied memos, wrong receivers, second deposits and unsupported
pools go to exception records. Do not infer a shielded sender or refund receiver.

A Base `Transfer` is not a ZeeSwap deposit. Require the configured contract's
`Funded` event, successful receipt, immutable authorization, exact actual amount,
expected payer/refund address and current escrow state. An event whose amount is
absent must not acquire a fabricated zero amount.

## Chef projection and cursor contract

Create a dedicated private immutable, block-scoped projection. At minimum it
needs `blockHeight: Int! @index`, block hash/time, receipt/output identity,
network/account identity, value, receiver and original memo bytes. Chef's sample
`ReadableNote` does not itself establish this full contract. Handler context
provides block metadata; join/fetch canonical headers where parent hash is not
projected. Indexing the height field changes the schema identity and requires the
appropriate new project/generation and backfill; do not hot-edit a live schema.

```graphql
query {
  ReadableNoteList(
    first: 100
    range: { blockHeight: { gte: 4523000, lte: 4523015 } }
    orderBy: [{ blockHeight: ASC }, { id: ASC }]
  ) {
    items { id txid pool outputIndex blockHeight blockHash valueZat memoHex }
    nextCursor
  }
}
```

This is an illustrative query against the proposed ZeeSwap schema, not a claim
that an arbitrary upstream example already has those fields/indexes. Continue
with the exact cursor argument generated by the pinned Chef version. Do not
construct cursors, paginate by hash ID alone, or combine changed range/filter
parameters with an old cursor.

1. Read authenticated Chef `/status`; require ready entity reads and known,
   sufficiently fresh source observations. Capture generation/revision,
   checkpoint height/hash and retained recovery horizon.
2. Traverse a fixed inclusive range ordered by height and ID into staging.
   Page size is 100. Initial historical windows are 16 blocks; split further
   under response limits. A busy single height still requires every page.
3. Chef cursor invalidation (`409 CURSOR_INVALIDATED`) discards the entire staged
   traversal. Restart at the original lower bound. New commits anywhere in the
   project can invalidate continuation, even outside the requested range.
4. Re-read status at the end. Accept only the same generation/revision and
   checkpoint identity as the traversal's compatible read context. Fetch and
   compare canonical headers for the range and required retained anchors.
5. Atomically publish the replacement set and checkpoint. No financial worker
   can see the partially built range. Empty complete ranges remove old active
   observations in that range; an HTTP error or incomplete range removes none.

Each request is coherent; Chef does not retain one historical snapshot across
all HTTP pages. Therefore live traversal can starve. Limit a turn to three
restarts or 30 seconds, whichever is first, then keep the old checkpoint, publish
`WAIT_RANGE_UNSTABLE`, and back off five seconds with jitter. Do not spin, advance
past the unread block, or mark the source caught up. Admission limits and HTTP
503 are waits, never evidence that a range is empty.

The mutable tail must be replaced as one compatible visible set, even if its
fetches use smaller windows. It extends from the last sealed boundary through the
current complete checkpoint. Seal only history strictly below Chef's retained
undo floor after a compatible complete traversal. A lower/unknown floor, changed
generation, recovery reaching sealed history or storage cap blocks processing
and triggers explicit rebuild/reconciliation. A shallow fixed overlap alone is
not a general reorg solution. Use the upstream continuous consumer only for its
supported immutable block-scoped model, with its coherent SQLite read snapshot;
its mirror is still not the ZeeSwap financial database.

## Envio projection and cursor contract

Configure chain 84532, exact deployed settlement/token addresses, ABI digest and
deployment start block from the canonical registry. Enable `rollback_on_reorg`
explicitly and configure a supported nonzero `max_reorg_depth` (initial candidate
200), then test its actual Base Sepolia behavior on the pinned release. An
indexer recovery window is distinct from the payout finality policy.

Handlers write immutable event entities and block/checkpoint coverage only.
Capture transaction position and raw log identity. No handler calls a payout,
refund, webhook with financial side effects, or private order lookup. HyperIndex
rollback covers its own indexed state; it cannot undo Neon or a signer journal.
Prefer coherent HyperSync ingestion; RPC ingestion also needs raw-receipt/header
cross-checks at the worker boundary.

The adapter needs a server-side coherent export: either an authenticated
read-only repeatable-read transaction over the indexer database, or an export
service backed by a proven pinned snapshot/version. It uses keyset ordering
`(blockHeight, transactionIndex, logIndex, id)` within inclusive ranges. Snapshot
token, schema/network/filter digest, range, last tuple and generation are bound
in its opaque local cursor. Expired/invalid snapshots restart without publication.
Offset pagination over a live GraphQL table is not sufficient. If deployment
offers only GraphQL without a demonstrated coherent range export, I2 stays
blocked; do not invent upstream cursor or status guarantees.

The exporter reports fully processed contiguous block coverage, including empty
blocks, and captures it with the event rows. A list's highest event height or a
single found transaction is not an indexer checkpoint. Unknown processed coverage
can display an event as provisional but cannot establish absence, expiry or
financial eligibility. The same complete-tail replacement and explicit deep
reorg block rules apply. Configure a recovery horizon supported by actual source
and indexer retention; never infer it from `latest - 200` alone.

## Freshness and financial eligibility

Keep observation health separate from chain finality. A fresh service response
can report an old source, and a healthy source can have no new block.

| Check | Initial policy |
| --- | --- |
| Clock validation | UTC timestamps parse strictly; more than five seconds in the future is rejected. |
| Source liveness | Source sample and canonical RPC check no older than 60 seconds. A stalled follower's cached timestamp ages normally. |
| Coverage publication | Coherent read completed within the 30-second traversal budget; checked certificate must still be within 60 seconds at dispatch. |
| Coverage gap | Show immediately as catching up. Complete coverage must reach the order's required confirmation/finality height before that order can dispatch. |
| Global readiness | Stop new quote intake on an observation gap, unavailable status, unknown recovery horizon or contradictory source. Existing liabilities remain. |
| Zcash | Receipt block canonical; complete scan and current canonical source cover receipt height + 9, giving ten confirmations. |
| Base | Successful canonical receipt at or below a fresh RPC `finalized` header; current `latest` and contract state must be compatible. |

Initial discovery polling: keep Chef's documented five-second follow default;
worker health/range poll every two seconds with one active traversal per project.
This is a proposed scheduling default, not measured ZeeSwap latency. Faster
producer polling needs a bounded benchmark with concurrent ingestion and reader
capacity; do not reuse an earlier public-demo benchmark as wallet-discovery SLA.

A recent source sample may renew a certificate only after confirming unchanged
checkpoint/content, complete coverage, retained horizon and canonical anchors.
Never relabel an old file with `observedAt = now`. Projection revision need not
increase for a legitimate freshness-only update. Source head regression, a
finalized head regression or hash disagreement enters reconciliation; do not
clamp it to the previous value to hide the conflict.

At the financial boundary, the worker locks the current observer epoch and order,
checks a fresh compatible certificate, immutable quote and primary deposit, then
creates the operation/outbox atomically. The restricted signer rechecks current
authority/fence and permitted operation before signing. Freshness expiring
between preparation and dispatch pauses the operation. RPC finality and contract
branch checks remain authoritative; a projection cannot override them.

The existing strict schema-v1 snapshot and its limits (1,000 blocks/outputs and
bounded retained-anchor checks) stay intact until a reviewed adapter change.
Use complete bounded batches plus explicit backpressure; never truncate receipts
to satisfy a limit. If an epoch cannot cover all required active anchors within
the supported bound, pause intake and reconciliation rather than falsely certify
them. Do not hot-switch the observer for an in-flight order.

## Persistence and reorg response

Proposed logical records: `observer_streams`, `observation_batches`,
`observation_occurrences`, `canonical_headers`, and `observer_checkpoints`.
Names are illustrative and do not prescribe new migrations over existing tables.
Store network/schema/generation, range bounds, content digest, canonical status,
first/last seen times, replacement revision and private evidence reference.

Publication takes a stream/epoch lock in one short SQL transaction: compare the
previous checkpoint, invalidate replaced occurrences, upsert the complete new
set, recalculate affected eligibility, append reorg facts, then advance the
checkpoint. Retain old occurrences as audit history. Never erase ledger entries,
operations or liabilities when an indexer entity disappears. No network requests
occur while holding that transaction.

| Reorg position | Required action |
| --- | --- |
| Provisional note/event, no operation | Invalidate occurrence and eligibility; keep receiver/reference and reservations until source reconciliation completes. |
| Prepared unsigned job | Revoke its fence, reconcile signer journal, and prevent signing while the source is orphaned. |
| Any signed/submitted opposing-chain action | Mark source exposure, stop affected dispatch and reconcile the original transaction. A DB rollback does not undo it. |
| Already delivered/refunded customer | Preserve outcome, open operator exposure/incident and reconcile. Do not create a second customer payment. |
| Re-included same output/event | Attach the new canonical occurrence; recompute finality under the same economic identity. |
| Beyond recovery floor or changed project | Block, rebuild from a verified anchor and reconcile all affected retained obligations before re-enabling. |

## Acceptance scenarios

| ID | Scenario | Expected result |
| --- | --- | --- |
| A01 | 205 notes share one height and random IDs | Three pages, all outputs present once; complete cursor traversal. |
| A02 | Revision changes after page one | Discard staged pages; no checkpoint or eligibility advance. |
| A03 | 409 repeated or 503 admission gate | Bounded wait; previous complete data retained. |
| A04 | Shorter branch removes a previously observed note | Complete-tail replacement marks it orphaned; no stale eligibility. |
| A05 | Same tx/output re-included; key rotated | One economic deposit, new occurrence; no second settlement. |
| A06 | Status timestamp fresh but cached source sample stale | No dispatch; never renew freshness from request time. |
| A07 | Ready projection lacks block hash, source privacy or complete coverage | Visible diagnostic only; financial readiness rejected. |
| A08 | Envio deletes a `Funded` entity during traversal | Old snapshot discarded or fully reconciled; no payout from mixed pages. |
| A09 | Empty range, malformed amount, wrong token, extra fields | Only an authenticated complete empty range can remove observations; malformed records reject the batch. |
| A10 | Receipt exists while finalized head is behind | Show confirmation progress; no dispatch. |
| A11 | Crash before/after publication commit | Either entire old or entire new set; replay idempotent. |
| A12 | Deep reorg below sealed history or source generation reset | Explicit block; no automatic cursor reset with signing enabled. |
| A13 | Orphan discovered after customer delivery | Incident/exposure recorded; delivery not erased or repeated. |
| A14 | More observations/anchors than current limits | Backpressure, no silent truncation or skipped output. |

Measure local monotonic durations for `block available -> receipt projected ->
receipt discovered -> order updated` separately from broadcast/mining,
confirmation wait, provider routing, and final payout. Publish p50/p95/max,
sample count, gaps, source freshness, retries and private key location. Same-host
durations use monotonic clocks; remote timestamps carry clock uncertainty. A
future initial performance target is p95 at most ten seconds from full block
availability to order observation under the declared load, not to settlement.
This target is not yet measured or accepted.

Required status mapping is explicit: Chef `generation`, `revision`,
`checkpoint.height/hash/status/undoFloor`, `source.status`, `source.checkedAt`,
`source.prepIndexedHeight`, `source.sourceObservedHeight` and
`source.sourceObservedAt` are read according to the pinned schema. Both cached
sample time and upstream observation time must satisfy liveness. Fetch the
canonical head header separately when the status supplies only a height. A
block's mining timestamp is not the source-liveness sample time. Unknown/null
fields block financial readiness; do not manufacture defaults. Envio must supply
equivalent facts through its separately implemented export/RPC adapter, not
through an assumed identical upstream JSON shape.
