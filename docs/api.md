# Quote/order API and Zcash observer

This is a local, testnet-only integration. It connects authenticated HTTP order
access to Neon and a real viewing-only Zcash scanner. No cross-chain payout,
public deployment, or browser-wallet connection is implied.

## HTTP interface

Start with `pnpm api:start`. The server binds **127.0.0.1:3031** by default.
Primary routes remain unavailable until the test asset registry and funding
infrastructure are explicitly enabled. `pnpm --filter @zeeswap/api exec tsx
scripts/serve.ts --integration` runs the labelled development mode instead; it
refuses the primary database. Integration inventory is a fixture, not on-chain
mockUSDC liquidity.

| Method and route | Behavior |
| --- | --- |
| `GET /health` | Minimal database connectivity status; no private data |
| `POST /v1/quotes` | Validate the requested pair/receivers, allocate a fresh shielded receiver and issue an idempotent quote |
| `GET /v1/quotes/:id` | Authenticated quote summary, without deposit instructions before acceptance |
| `POST /v1/orders/:id/accept` | Authenticated acceptance; atomically reserve inventory and return bound funding instructions |
| `GET /v1/orders/:id` | Authenticated status, source confirmation count and policy; funding instructions only while awaiting funds |

Clients generate a cryptographically random **32-byte base64url capability** and
send it in `Authorization: Bearer ...`. This is capability-based private order
access, not proof of wallet ownership or a user login. The database stores its
SHA-256 digest; it is never included in the deposit memo. A different capability
cannot read or accept another client's quote.

Quote creation also requires a UUID `Idempotency-Key`. The request identity is
HMAC-bound to that capability and the normalized body. Retrying the same request
returns the same quote; reusing the key with a different body returns 409.
Concurrent requests can allocate an unused extra receiver before the short SQL
transaction, but commit only one quote. Wallet allocation never runs under a
database transaction lock.

JSON quote body (the example contains placeholders, not funded addresses):

```json
{
  "direction": "ZCASH_TO_BASE",
  "inputAmount": "100000",
  "recipient": "BASE_RECIPIENT_ADDRESS",
  "refundRecipient": "TESTNET_UNIFIED_ADDRESS_WITH_ORCHARD_RECEIVER"
}
```

`inputAmount` is an atomic integer string; 100,000 zatoshi is 0.001 TAZ. The only
pricing mode currently implemented is the labelled fixture rate. Fees and the
deposit receiver are selected server-side. Clients cannot supply them in the body.
Acceptance requires `{}` as its body; it does not permit changing destinations.

Base recipient addresses use viem validation. Zcash addresses are decoded by the
maintained Rust SDK for the **testnet** network; the selected Orchard-family
shielded receiver is canonicalized, with no transparent fallback. Expiring UAs
and Sapling-only destinations are not supported by this first adapter.

Reverse `BASE_TO_ZCASH` funding currently returns `BASE_ESCROW_NOT_READY`.
Its signed escrow instructions require G3; the API does not substitute an EOA or
pretend a direct mock-token transfer satisfies that contract flow.

Responses use `Cache-Control: no-store`. Query-string credentials are rejected.
Unknown/malformed body fields, noncanonical amounts and invalid receivers fail.
Unknown orders and wrong capabilities return the same 404. The server has a
bounded JSON body and per-IP request window, no request-body/URL logging, and an
explicit-origin CORS policy. These local controls do not constitute a production
Internet deployment or distributed rate limiting.

## Private observer boundary

`workers/zcash-wallet/live_wallet.py` accepts only three local-pipe commands:

- `validate`: decode/canonicalize a testnet shielded receiver with the Rust SDK.
- `allocate`: derive a new receiver from the dedicated viewing-only wallet.
- `snapshot`: sync that wallet, discover received outputs, fetch canonical blocks
  and raw transactions, and decrypt the actual recipient/value/memo.

The adapter checks `wallet_kind` before allocation/scanning and refuses a wallet
loaded with spending authority. Its local process lock serializes wallet writers.
A timeout retains the lock for manual process reconciliation instead of allowing
another writer to proceed while the original may still be running.

`zeeswap-wallet-read`, built alongside the G1 structural verifier, uses
`zcash_client_backend::decrypt_transaction` and `zcash_keys`. Viewing keys pass
through captured local pipes, not CLI arguments, database rows or network calls.
It emits only incoming external notes and reconstructs each canonical receiver
from the **decrypted note**, not from a memo lookup or a guessed default address.

The snapshot producer verifies NU7/testnet identity, wallet scan completion,
canonical compact-block membership, raw transaction identity and mined height.
It checks prior observed heights again to catch a changed canonical block even
when an old note disappears from the wallet's current snapshot. It rejects a
wallet more than six blocks behind the responding server's tip.

The language-neutral contract is
[`snapshot.schema.json`](../workers/zcash-wallet/snapshot.schema.json), with a
synthetic [golden fixture](../workers/zcash-wallet/snapshot.golden.json).
The TypeScript validator consumes its field definitions, rejects extra fields,
enforces network/branch, integer values, block/output consistency and snapshot
freshness, and rejects duplicate output identities. This is a **private trusted
adapter boundary**, not an API accepting user-supplied receipt JSON.

Snapshots are ingested atomically through the restricted worker role. The
observer updates its checkpoint/canonical block records, records decoded
deposits, and creates one evaluation operation when the source policy is met.
Invalid/unknown memos remain quarantined. Internal change and zero-value notes do
not become customer deposits. Opaque transaction identity hashes deduplicate
replays. The snapshot timestamp cannot simply be refreshed on an old saved file:
obtain a new live snapshot for every observer cycle.

`baseHead` independently verifies chain ID 84532, a fresh latest header, a
`finalized` header, and the canonical hash at that finalized height. It does not
yet ingest settlement-contract events or prove a Base receipt for a ZeeSwap order.

## Commands and configuration

```sh
pnpm typecheck
pnpm test
pnpm test:integration
pnpm --filter @zeeswap/api observe -- --integration
```

For an exact one-shot development invocation use:

```sh
pnpm --filter @zeeswap/api exec tsx scripts/observe.ts --integration
```

Automated tests use **`zeeswap-g2-tests`**, branch
`br-muddy-waterfall-aoqd8o9b`. Real incoming-payment evidence is kept separately in
**`zeeswap-g2-database`**, branch `br-solitary-flower-ao8ccjex`. Test runners refuse
the evidence/primary branch before writing fixture checkpoints.

The primary adapter requires an explicit `ZEE_WALLET_CONFIG` and optionally
`ZEE_WALLET_PYTHON`. It does not silently reuse the G1 test wallet. Its startup
enters reconciliation mode. The local adapter config names the pinned CLI/read
binary commands, viewing-only wallet directory, protobuf directory and private
process-lock path. Keep that configuration and wallet data outside Git.

The runtime remains a local API plus a **one-shot observer**, not a deployed
continuous relayer. Service supervision, isolated OS identities, signer policy,
operator inventory reconciliation and recovery approval still need integration.
Hosted lightwalletd remains a trusted provider; this is not a full-validator proof.

## Live incoming-payment evidence

See [the API/scanner evidence report](evidence/g2-api-scanner.md). The successful
run created and accepted a quote through HTTP, sent a small real shielded TAZ
payment, and reached `READY` via the real scanner and Neon. It deliberately
stopped before any destination-chain payment.
