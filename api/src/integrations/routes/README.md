# Isolated treasury route integration

This is a disabled, versioned `evm-treasury-route-v1` implementation. Existing
API routes, accepted orders, Neon migrations and signing services do not import
or execute it. Production execution is rejected unconditionally. No module
signs or broadcasts a transaction.

`OneClickHttp` implements the fixed official `/v0/quote` and `/v0/status`
transport, partner `X-API-Key`, redirect refusal, timeout, one in-flight request,
bounded body and strict wire decoding. Production verification calls the pinned
official `@defuse-protocol/one-click-sdk-typescript` 0.1.26 verifier. Live network
reads require an explicit opt-in and no network request is made by the tests.
Dry previews preserve absent execution deadlines as null. Provider state-change
time is distinct from status request time; an unchanged old status is still an
observation rather than a chain proof. Explorer links and `swapDetails` are never
fetched or accepted as authenticated receipt attribution.

The official quote wire shape alone does not establish exact net withdrawal
semantics for an approved asset. A separately pinned net-credit/fee policy is
mandatory; none is provided for production. Unknown execution fields, unsupported
deposit modes, unsigned responses and mismatched echoes fail closed. Fixtures
use a clearly labelled deterministic fixture signature, never the official
production signing key or a fake live signature.

`RouteEngine` connects preview, atomic capital reservation, immutable customer
terms, canonical source eligibility, bounded execution quote attempts, durable
funding intent, independent signed journal acknowledgement, treasury receipts,
customer branch proofs and per-asset ledger closure. It preserves one economic
provider operation even after expiry, revert, return or customer completion.
Provider output and return are separate accumulated facts; customer settlement
requires its own exact receipt. Source principal remains a segregated liability.
Return/loss accounting never changes customer principal. Late returns can reverse
previously recognized loss; late output after refund stays treasury inventory.
Aggregate gas spending is capped independently and never deducted from principal.

`PrivateFileRouteStore` is a concrete encrypted local persistence implementation
for isolated acceptance/recovery drills, with exclusive process lock, synchronous
transaction callback, file fsync and atomic replacement. It requires a path
outside the repository and uses the existing authenticated encryption boundary.
POSIX directory fsync is performed; no universal Windows power-loss durability
claim is made. A stale crash lock is never stolen by elapsed time. Production
Neon deployment, disaster recovery and live signer journals remain external
activation gates. A concrete `PostgresRouteStore` and separate opt-in DDL now
exist; see the [isolated PostgreSQL guide](../../../integrations/README.md).
Its row-lock/CAS, encrypted domain binding and unknown-COMMIT behavior are tested
with a transaction-aware mock. The DDL is unapplied; real PostgreSQL concurrency,
permissions and restore behavior remain to be verified.

Each new engine starts paused until the independent recovery port compares all
signer journals with the exact persisted book digest. Passive observations and
fixture capital seeds cannot unlock dispatch. A changed book revision fails
atomically before a new funding intent. Fatal provider validation/unknown status
pauses the affected mode durably. Thirty-minute/two-hour checks retain customer
liability and provider exposure and return a recovery action; they authorize no
transfer. Receipt economic identity uses chain, transaction and transaction-local
transfer ordinal, preserving allocation across block/global-log-index changes.

The mandatory `RouteProofs` port has no production implementation here. It must
independently validate canonical/final chain receipts, original transaction
semantics, vault control, token emitters, provider-to-receipt attribution, all
signer journals/fences, healthy observation epochs, fees and current settlement
states. Caller-supplied transaction hashes, booleans or indexer rows are not a
production implementation of that port. The fixture adapter lives only in tests.

V1 reverse escrow stays non-abortable once committed. The separate V2 fixture
path requires final/latest refund state, abort event/recovery digest, immutable
customer payout operation identity, fresh per-order nonce, fenced journals and
canonical proof that no successful or still-valid Zcash payout exists. This tests
the protocol guard contract, not an implemented Zcash nonpayment verifier or a
deployed V2 contract. Real activation still requires the reviewed new deployment
and independent consensus-expiry/journal recovery implementation.

Run the local pipeline without credentials, RPC or database access:

```powershell
pnpm --filter @zeeswap/api exec tsx --test test/integrations/route-policy.test.ts test/integrations/route-recovery.test.ts
pnpm --filter @zeeswap/api typecheck
```

The deterministic tests cover Q01-Q12 and R01-R20 policy/recovery branches,
including concurrent acceptance, an unknown original broadcast, funding revert,
late funding, partial returns, output followed by input remainder, customer
refund followed by late output/return, loss recovery after closure, source reorg,
re-inclusion with changed block log position, restore/startup refusal, stale
observer refusal, cancellation exclusion and V2 guarded-abort proof failures.
These are isolated synthetic tests, not real 1Click funding, real Zcash consensus
recovery, new production asset approval, or completion of the intentionally
stopped G5 run.
