# G2 API and scanner integration evidence

Date: 2026-10-14 (Asia/Jakarta).

Explorer links were refreshed after a [read-only discrepancy check](explorer-verification.md): the original explorer's block listing was stale, while the node and ZecBlock confirmed this transaction at the same inclusion height.

## Outcome

A real Zcash testnet payment was associated with a quote created and accepted
through the local HTTP API. The viewing-only scanner independently decoded its
recipient, amount and memo, verified canonical inclusion, and updated the order
in Neon. **The order reached `READY`; no cross-chain swap was executed.**

| Observation | Result |
| --- | --- |
| Source amount | 100,000 zatoshi = 0.001 TAZ |
| Source transaction fee | 10,000 zatoshi = 0.0001 TAZ |
| Deposit transaction | [b3f67a8c…fba7ebc0](https://testnet.zecblock.com/tx/b3f67a8c045eb864a9b16828788271afe13e4b24a220e5ac794c17c0fba7ebc0) |
| Canonical inclusion height | 4,498,852 |
| Accepted funding cutoff | 4,498,857; the payment was timely |
| Observed intermediate API state | `CONFIRMING`, 8/10 confirmations; 1 deposit, 0 operations, 0 jobs |
| Completed observation | `READY`, 21 confirmations at scanned height 4,498,872 |
| Database records for this order | 1 deposit, 1 planned operation, 1 evaluation job |
| Repeat live scanner cycle | Still one operation; no duplicate economic intent |
| Wrong bearer capability | HTTP 404 |
| On-chain authorization | false |
| Destination payout | Not submitted |

The raw transaction's structural verifier reported V6 / NU7, **zero transparent
inputs/outputs**, an Ironwood-only bundle and fee-only value balance of 10,000
zatoshi. Amount and receiver evidence came from the decrypted note; the public
explorer cannot reveal those private fields.

The sender and operator are dedicated G1 test wallets. The source test payment
stays in the operator's wallet. Destination mockUSDC is not deployed yet;
development inventory is explicitly a fixture. The Base destination used in the
experiment is a placeholder and no destination asset was sent to it. This is
incoming-payment integration evidence, not liquidity or swap-settlement evidence.

## Replay and privacy behavior

The old standalone G1 payment, whose memo does not identify an API quote, was
quarantined instead of being matched to the new order. That historical note was
already spent during G1; its quarantine record is evidence requiring manual
historical reconciliation, not newly available inventory or another usable note.

The new quote received a fresh, SDK-derived shielded receiver. A local Rust helper
decrypted the actual receiver/value/memo from the canonical raw transaction using
only viewing authority. Source transaction IDs and full memos are encrypted
before database storage; lookup identities are HMACs. No viewing key was uploaded
to Neon or an explorer. Private HTTP status is authenticated and no-store.

The scanner was restarted through separate local process invocations and read
the chain again. Re-ingesting the same output did not create another deposit,
operation or job. The HTTP status no longer displays funding instructions after
the payment has been observed.

## Tests and deployment state

- 31 live PostgreSQL/database tests passed.
- 7 HTTP/snapshot boundary tests passed, including concurrent idempotent quote
  creation, capability access, invalid fields, CORS and reverse-route gating.
- 5 unit tests passed, including the versioned observer golden fixture.
- TypeScript typecheck and the pinned Rust helper build passed.
- Migrations 0006–0008 were tested before primary application. The primary now
  has **8 migrations, 16 application tables and 1 narrow status view**.

Three database branches have distinct purposes:

| Branch | Purpose |
| --- | --- |
| `production` / `br-empty-meadow-aowxzfl5` | Selected primary, migrated and paused; no smoke-test business data |
| `zeeswap-g2-database` / `br-solitary-flower-ao8ccjex` | Preserves this real intake experiment and its encrypted evidence |
| `zeeswap-g2-tests` / `br-muddy-waterfall-aoqd8o9b` | Isolated synthetic regression fixtures |

Primary acceptance/dispatch remain disabled and reconciliation remains required.
The primary operator wallet has not been provisioned through this adapter; it
must be configured explicitly instead of borrowing the G1 test wallet. The
local API used ephemeral loopback ports for tests and was stopped afterward.
No public server or continuously running relayer was deployed.

The Base read-only observer verified chain ID 84532, latest/finalized heads and
canonical finalized-block hashes. It has not verified a ZeeSwap settlement
receipt because no settlement contract exists yet.

## Remaining work

End-user extension/QR interoperability, G3 mockUSDC and Base escrow/settlement
contracts, signed contract authorizations, restricted payout dispatch, real
liquidity reconciliation and full recovery tests remain open. The reverse
Base-source route correctly returns `BASE_ESCROW_NOT_READY` until that funding
path exists. Neither these tests nor the operator model establish atomic,
trustless or non-custodial cross-chain settlement.
