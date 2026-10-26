# ZeeSwap testnet bridge preparation

The isolated bridge implementation prepares a custodial TAZ representation on
Base Sepolia, `zeeTAZ`, with eight decimals. One atomic token unit represents one
zatoshi. It does not convert TAZ into mockUSDC. The operator attests shielded
receipts; this is not a trustless reserve proof or atomic cross-chain settlement.

The ordinary API startup does not construct a `BridgeService`. The public bridge
status consequently reports `unavailable`; private bridge writes return 503.
The migration is prepared, not applied to the application database. No bridge
wallet, live adapter, token deployment, financial authority or funded circle is
established by this module. Earlier swap evidence and the stopped G5 run retain
their original status.

## Components and boundaries

- `api/src/bridge/model.ts` owns exact integer state transitions, source replay
  identities, mint/cancellation exclusion, authenticated burn liabilities,
  principal coverage and reorg incident handling.
- `repository.ts` stores one encrypted bounded bridge book in `zee_bridge.books`.
  Each mutation takes PostgreSQL `FOR UPDATE` across processes. AEAD encryption
  reuses `PrivateData`, with a dedicated context. The book holds at most 1,000
  private orders; a larger service needs a separate archival design. SQL contains
  no shielded receivers, memos, raw transactions or private two-leg mappings.
- `service.ts` implements capability-scoped quote/accept/read operations.
  Admission compares an independent reconciliation result against the locked
  book, exact paired anchors and pinned contract identity. The runtime receives a
  clone of the current book and must not acquire another application DB client
  while that row lock is held. This avoids pool starvation under contention.
- `http.ts` exposes public aggregate status and private instructions. There is no
  HTTP evidence, signing, control, capital, refund or accounting mutation route.
  The main API applies existing origin/auth/rate restrictions to private bridge
  routes; `readOnly` forbids their writes even if a service object is supplied.
- `worker.ts` prepares shielded redemption/refund delivery only after a verifier
  establishes the finalized burn or permanent cancellation. It reserves principal
  and external fee capacity before signing and preserves an immutable intent.
  Unknown signing/broadcast outcomes retain the original transaction and liability.
- `journal.ts` provides an independent encrypted, append-only original-byte and
  pre-broadcast UNKNOWN journal. It fsyncs the record before network I/O and
  refuses automatic re-signing or re-broadcast after uncertainty. Its signer
  adapter must actually use `prepareOnce`/`broadcastOnce`; importing the class
  alone establishes no protection. Unix private permissions plus file/directory
  fsync are checked. Windows local tests exercise file fsync; live Windows ACL and
  directory durability remain unqualified.
- `0022_bridge.sql` creates only the isolated schema/table, with no runtime grants,
  seed records, wallet identity or activation. It does not touch swap tables.

`BridgeRuntime`, `BridgeEvidenceVerifier` and the SDK-specific
`BridgeDurableSigner` remain unwired extension interfaces. The additional
`adapters/base.ts` implements real dual-RPC canonical contract reads and Base fact
verification. `adapters/cast.ts` and `operation-journal.ts` implement pinned cast
keystore authorization, signed original transactions and a durable Base nonce/
UNKNOWN journal, exercised against an invocation-owned Anvil chain. Production
signing is deliberately refused until a concrete fresh native source/delivery
coordinator is qualified. The test exception permits only literal HTTP loopback
endpoints. The dedicated native protocol implementation is separately prepared;
its actual wallet qualification, Base preflight executable and end-to-end runtime
factory remain open. No fixture adapter is imported by runtime code.

The private order commitment uses an explicit cross-language positional preimage:
`["bridge-private-order-v1", salt, UUID, direction, amountAtomic, recipient,
refundRecipientOrNull, payerOrNull]`, compact JSON followed by SHA-256. Original
HTTP object property order cannot change the commitment or quote idempotency.
Independent Node/Python vectors bind both recipients and the payer.

## Accounting and concurrency

All quantities are integer decimal strings; accepted principal is bounded to
10,000–100,000,000 zatoshis. `C` is dedicated controlled principal, including
reserved notes; `D` is included outbound principal awaiting required confirmation.
The public aggregate calculation is:

```text
C + D >= circulating supply + unpaid redemptions
       + accepted unminted deposits + other unpaid bridge refunds
```

Admission/signing requires a fresh pair of chain heights, hashes and observation
times (maximum age 60 seconds; maximum future skew five seconds), separate
principal/fee/swap accounts and no incident. New exposure additionally requires
coverage and available external fee capital. Included principal moves `C → D`
while its liability stays unpaid. Confirmation removes `D` and the matching
liability. Before confirmation, a delivery reorg restores `D → C`, pauses admission
and retains original signed bytes. Repeated inclusion/reorg cycles reconcile the
same transaction; a reorg after completion freezes the order and records an
incident without automatic re-minting or fictional rollback.

Accepted onchain facts continue to enter the book when admission is paused or
the old checkpoint ages. Their independently verified receipt determines factual
accounting. Format/height checks in the model are not canonical receipt proof.
Existing repayments can proceed during an admission deficit/pause only with fresh
canonical signer checks, actual spendable dedicated principal and external fees.

Acceptance reserves a 10,000-zatoshi external shielded delivery/refund fee before
returning deposit/burn instructions. A finalized forward mint releases its unused
shielded refund reserve once. Worker signing reserves any missing fee allowance
before invoking the durable signer, retains it on an unknown signing outcome,
and reconciles the signed fee once. Base gas inventory, actual fee-note selection
and per-operation Base gas caps must be checked by the live runtime and signer;
they are not paid out of bridge principal.

The worker commits `broadcastAttempted` before RPC. A failed callback cannot roll
that flag back; another ordinary broadcast refuses pending reconciliation. The
independent journal also preserves UNKNOWN across application DB restore. Missing
or rolled-back external journals, a crash after the signing-start marker, torn
records, stale locks, expired originals and ambiguous outcomes require explicit
operator reconciliation. There is no automatic replacement/re-mint/unlock path.

## HTTP wire contract

Requests use existing `Authorization: Bearer <43-character capability>` and
`Idempotency-Key` headers. POST bodies are JSON, bounded to 8 KiB, with exact fields.
Never place a capability in a URL. Responses use `Cache-Control: no-store`.

`GET /v1/bridge/status` is public:

```json
{
  "schemaVersion": 1,
  "network": "testnet",
  "asset": {
    "symbol": "zeeTAZ", "decimals": 8, "baseChainId": 84532,
    "tokenAddress": null, "bridgeContractAddress": null, "runtimeCodeHash": null
  },
  "state": "unavailable", "reason": "BRIDGE_NOT_CONFIGURED",
  "forwardEnabled": false, "reverseEnabled": false,
  "maxObservationAgeSeconds": 60, "reserveReport": null
}
```

A configured report includes `operatorAttested: true`, separate decimal-string
`controlledZatoshi`, `inTransitZatoshi`, `circulatingZatoshi`,
`unpaidRedemptionsZatoshi`, `acceptedUnmintedZatoshi`, `otherRefundsZatoshi`,
`covered`, and `zcash`/`base` objects containing `height`, `hash`, `observedAt`.
The current contract is itself the ERC-20: token and bridge addresses must match.
Unavailable adapters produce an unavailable result without leaking their errors.

`POST /v1/bridge/quotes` accepts one of:

```json
{"direction":"TAZ_TO_ZEETAZ","amountAtomic":"100000","recipient":"<Base address>","refundRecipient":"<shielded receiver>"}
{"direction":"ZEETAZ_TO_TAZ","amountAtomic":"100000","recipient":"<shielded receiver>","payer":"<Base address>"}
```

`POST /v1/bridge/orders` accepts `{"quoteId":"<UUID>"}`. Quote and order share
the same random UUID. `GET /v1/bridge/orders/<UUID>` requires the same capability.
Unknown and unauthorized IDs are indistinguishable. A reused quote idempotency key
with different immutable input returns a conflict. Accepted-order reads/recovery
remain possible after expiry/admission pause.

All three private responses contain `id`, `direction`, `amountAtomic`,
`outputAmountAtomic` (the same exact principal), `recipient`, optional
`refundRecipient`/`payer`, `status`, `createdAt`, `expiresAt`, `funding`, `source`,
and `destination`. Quote `funding` is null. A forward accepted order receives:

```text
{kind:"shielded-deposit", network:"zcash-testnet", address, memo,
 cutoffHeight, cutoffTime}
```

The memo is an opaque provider string; encode its exact UTF-8 bytes into ZIP-321,
without assuming the swap memo format. Instructions are private. Forward cutoff
timestamps must be finite canonical ISO timestamps, future, and no later than
quote expiry. Async provisioning rechecks freshness and expiry before acceptance.

A reverse accepted order receives:

```text
{kind:"authenticated-burn", network:"base-sepolia", chainId:84532,
 contract, token, calldata, signature,
 terms:{id,payer,amount,payoutCommitment,nonce,deadline}}
```

The opaque onchain ID/payout commitment is salted and distinct from the private
UUID. Service validation binds exact payer/amount/commitment/deadline, calldata,
and EIP-712 signature from the pinned authorizer. Domain is `ZeeSwapBridge`,
version `1`, chain `84532`, verifying contract; primary type `Redemption` is
`(bytes32 id,address payer,uint256 amount,bytes32 payoutCommitment,uint256 nonce,uint256 deadline)`.
These instructions authorize the quoted payer to call `requestRedemption`; they
do not establish a burn receipt. The independent worker must discover and finalize
the actual event before signing shielded delivery. A direct ERC-20 burn is not an
authenticated redemption request.

States are `QUOTED`, `AWAITING_DEPOSIT`, `AWAITING_BURN`, `DEPOSIT_FINALIZED`,
`MINTED`, `CANCELLED`, `REDEMPTION_PENDING`, `PAYOUT_PENDING`, `IN_TRANSIT`,
`COMPLETED`, `FROZEN` (with `REFUND_PENDING` reserved). Source/destination evidence,
when present, contains only the capability-authorized `network`,
`transactionHash`, `blockHeight`, `blockHash`. Public aggregate status contains no
order IDs, receiver links, memos, viewing keys, raw transactions or receipts.

## Before live activation

Provision an independently isolated bridge principal wallet/account and external
fee accounts; qualify their ownership, shielded receiver and complete scanner
source history. Deploy and independently verify the paused contract, bytecode,
token/decimals, operator/authorizer/admin and chain identity. Implement the concrete
native coordinator/runtime factory above, including canonical receipt ancestry/finality and exact private
note/output/fee binding, durable mint/cancel attempts, gas caps and signer lead/
expiry policy. Pair actual wallet notes and Base totalSupply/unpaid counters at
named checkpoints and reconcile all accepted private obligations. Test crash,
COMMIT-unknown readback, old DB snapshot and independent signer-journal recovery
with those actual adapters before configuring a bounded live policy.

Only after those gates may a separately authorized operator apply the migration,
grant scoped roles, establish capital and enable admission. Test and independently
confirm both directions, cancellation/refund and recipient closure before claiming
G6 complete. Current local/isolated-PG evidence does not close these live gates.
