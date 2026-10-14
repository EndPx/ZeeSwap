# G4 first forward public-testnet settlement

Date: 2026-10-14 (Asia/Jakarta).

**Passed for one bounded forward order:** 0.001 shielded TAZ on Zcash testnet
produced 0.1 mockUSDC in a separate recipient wallet on Base Sepolia. The payment
is finalized, the private order is `SETTLED`, and receipt, inventory and ledger
reconciliation passed. G4 still requires the reverse direction.

The executable harness was published at commit
`769a8e8e52e4415691b175d3c483218ebebc8ad5`. Sol 6.1 subagents implemented and
reviewed the harness; the parent operator executed the public-testnet actions.
The final read-only verifier is published alongside this report.

## Network and transaction evidence

Zcash testnet used the pinned NU7-compatible wallet SDK and the existing
`testnet.zec.rocks:443` provider. Base Sepolia chain ID is 84532. Canonical token
and settlement addresses are in the [deployment registry](../../contracts/deployments/base-sepolia.json).

| Step | Transaction | Included block | Verified result |
| --- | --- | --- | --- |
| Shielded source payment | [748759e1…375d2](https://testnet.zecblock.com/tx/748759e182717d468b171ed425e538ed1e7fb32d8a7d2471b158fe883fc375d2) | 4,500,367 | 100,000 zatoshi received; 10,000 zatoshi source fee |
| Base reserve | [0xf4d475a3…cb82](https://sepolia.basescan.org/tx/0xf4d475a3cf91daa6ac18cb488d68faa0a2377c73839107322c920e0fadbfcb82) | 48,094,624 | Successful, canonical and finalized before payment |
| Base payment | [0xfea54673…dc08d](https://sepolia.basescan.org/tx/0xfea54673de6e8159a5d5e76dedb1ad11d6fce561c05debfb4924c695bdcdc08d) | 48,095,220 | Successful, canonical and finalized; 100,000 mock units paid |

The final verifier checked Base finalized block **48,098,869**, hash
`0x6b347b54e3804d81f301c9208fd4b32368859d983178f04df4196cc268ba4345`.
The final private status query reported **377 source confirmations**, exceeding
the ten-confirmation policy. Source inclusion preceded the accepted cutoff of
4,500,377. The finalized reserve was observed before the PAY transaction was sent.

The pinned structural verifier parsed the source's 9,166 raw bytes as a V6 NU7
transaction: **Ironwood-only, zero transparent inputs and zero transparent
outputs**. Sapling and Orchard value balances were zero; the Ironwood value
balance represented the 10,000-zatoshi fee. Re-fetching the transaction preserved
the raw-byte hash. The viewing-only wallet decoded the actual received value,
receiver and memo; these matched the private accepted order. The memo supplied
an opaque reference, not the authoritative amount or payout destination.

Explorer links are navigation aids. These results come from SDK decoding,
network RPC, canonical/finalized receipts and private database checks. This run
did not obtain a browser screenshot of either explorer.

## Independent recipient and accounting checks

The dedicated Base recipient is `0x85a9ca452E369B94Acf85a13601887550C72BD76`.
Its balance was captured before payment at canonical block 48,094,202, hash
`0xf1cda6549c0906aa5ff9abda5656a641ff02f4e411ba9eebbe0cf62abda15cd5`.
The verifier re-read that historical balance and the finalized post-payment
balance: **0 → 100,000 atomic mockUSDC units**, exactly **0.1 mockUSDC**.

| Reconciliation item | Verified value |
| --- | --- |
| Original operator mock inventory | 10,000,000 units = 10 mockUSDC |
| Final contract inventory / available inventory | 9,900,000 units = 9.9 mockUSDC |
| Token total supply after the run | 10,000,000 units = 10 mockUSDC |
| Initial operator gas capital | 1,000,000,000,000,000 wei |
| Actual reserve fee, including L1 fee | 3,564,840,000,388 wei |
| Actual PAY fee, including L1 fee | 1,699,060,000,094 wei |
| Total Base fees | 5,263,900,000,482 wei = 0.000005263900000482 test ETH |
| Final operator gas balance | 994,736,099,999,518 wei |
| Operator TAZ fee capital | 490,000 zatoshi, unchanged |
| Received source proceeds | 100,000 zatoshi in `operator:unreconciled` |
| Open reservations | 0; all three released |

The source wallet decreased from 11,380,000 to 11,270,000 zatoshi, including its
fee. The operator receiving wallet increased from 590,000 to 690,000 zatoshi.
The older G2 held note was excluded from opening capital. After funding, both
held notes were excluded from the fresh capital proof. The newly settled source
proceeds were not automatically credited to spendable TAZ inventory.

Database proof found exactly one quote/order, one exact confirmed shielded
deposit, one confirmed payout operation, one completed outbox job and two
confirmed Base attempts (`RESERVE`, `PAY`). The source obligation is
`DISCHARGED`; the contract's order state is `PAID`. All ledger sums balance per
asset, per event and for the order. Six opening entries match the persisted
capital intent. Wrong-capability order reads returned 404.

This is one economic payout, not two: reserving inventory and transferring it
are distinct Base transactions. The source send journal was retained and no
second source send was made.

## Explicit test-funding setup

The setup minter funded inventory before the order; the runtime operator has
no token minting role. No runtime mint filled this order.

| Setup action | Transaction |
| --- | --- |
| Mint 10 mockUSDC | [0x390c3517…fd11](https://sepolia.basescan.org/tx/0x390c3517b25ff1f9a5b691408518afdbf16868b97deb4783ee9ab15c5b27fd11) |
| Approve exactly 10 mockUSDC | [0x8f484878…fbb8](https://sepolia.basescan.org/tx/0x8f48487867c51b0870ffe6f3dfcf9a5ca3bf464f9b4e5b5f09f2cba6c141fbb8) |
| Deposit 10 mockUSDC inventory | [0x8a0053f8…7bd4](https://sepolia.basescan.org/tx/0x8a0053f8b0b8076ca65c8d1375889966e7dee9a3666fec8a502cec7c1f6c7bd4) |
| Fund operator with 0.001 test ETH | [0x93e6576c…65d7](https://sepolia.basescan.org/tx/0x93e6576c9db757566ee6b67c4a517d3322ccc56ee56ff3920b8a3f4b86fc65d7) |

All four setup transactions were finalized before order creation. Setup gas is
separate from the two runtime Base fees above. Pricing was the labelled fixture
rate **1 TAZ = 100 mockUSDC**, with zero protocol fee. mockUSDC has no economic
value, USD backing or Circle affiliation.

## Verification and operating state

The [preparation checkpoint](g4-forward-preflight.md) records nine unit, 38 DB/HTTP,
eight Anvil/Neon and eight Python tests. TypeScript typecheck passed again with
the final verifier. The following read-only check returned `verified: true`:

```sh
pnpm --filter @zeeswap/api exec tsx scripts/verify-live-forward.ts
```

It needs the existing private experiment, baseline and credentials. It uses a
short PostgreSQL read-only repeatable-read snapshot, releases it before RPC,
checks the original signed transaction identities against fresh finalized
receipts, and reconciles the historical recipient delta and accounting. It
neither signs nor broadcasts nor changes runtime controls. Its fixed branch
and one-order assertions deliberately make it a bounded experiment verifier.

Publication review passed `git diff --cached --check`. The staged-public-file
scan checked 99 files and found no configured credential or checked secret-pattern
matches; this is a targeted check, not a comprehensive security audit. Staged
migration bytes matched the applied working files. Private experiment and receipt
artifacts remain ignored.

The dedicated `zeeswap-g4-live-forward` experiment is closed. Acceptance and
dispatch are disabled. The primary was independently checked: ten migrations,
18 tables, two views, zero quotes/orders/deposits/operations/jobs and zero
nonzero inventory accounts; acceptance/dispatch disabled and reconciliation
required. The live evidence branch remains separate from the older intake
evidence and synthetic regression branches.

## Disclosure and remaining gates

The published amounts, test-wallet address and paired transaction hashes are a
deliberate disclosure for this dedicated demonstration. They link this example's
two legs. Raw receipts, full memos, shielded receivers, private order mappings,
access capabilities, keys, wallet stores and signing journals remain outside Git.

The operator knows the private order and holds inventory/source funds. Base
recipients and amounts are public. This proves one shielded-source forward
testnet settlement through an operator harness, not atomicity, trustlessness,
end-to-end anonymity, production readiness or a publicly deployed service.
Hosted lightwalletd remains a trust dependency. Reverse swaps, live refunds,
restore/recovery and alternating-order soak, the two-direction bridge, frontend,
demo video and submission remain open. No new continuous service was enabled.
