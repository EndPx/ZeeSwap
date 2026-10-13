# G3 contracts: Base Sepolia deployment

Date: 2026-10-14 (Asia/Jakarta). Read-only post-deployment check at
2026-10-13 21:07:45 UTC / 2026-10-14 04:07:45 WIB.

Subsequent [backend integration evidence](g3-base-integration.md) confirms finalized
deployment inclusion and records the forward Anvil + Neon settlement test.

## Outcome

`MockUSDC` and `ZeeSwapSettlement` were built from a `forge init` project, locally
tested, deployed with the existing `cast` keystore and source-verified through
Etherscan V2. Both verification jobs finished with **Pass - Verified**.

| Contract | Base Sepolia address | Successful deployment receipt |
| --- | --- | --- |
| MockUSDC | [0xD64C116352CEF2Adc9484098Ae332Fd9bA339A63](https://sepolia.basescan.org/address/0xD64C116352CEF2Adc9484098Ae332Fd9bA339A63#code) | [0xa04932…4f82e3](https://sepolia.basescan.org/tx/0xa04932baa5d65f75d9ead3fd8fe8263b3def27893015ace7e4d769b9c64f82e3), block 48,078,597 |
| ZeeSwapSettlement | [0xe99aC648F85450B8ddEAEA088Aa99749C5e16DA3](https://sepolia.basescan.org/address/0xe99aC648F85450B8ddEAEA088Aa99749C5e16DA3#code) | [0x389479…2510ca](https://sepolia.basescan.org/tx/0x3894790840eacdf734caedd07497c9d2e6c16f4fc8bf5583e412f43c7c2510ca), block 48,078,599 |

The [canonical registry](../../contracts/deployments/base-sepolia.json) records
chain ID 84532, addresses, transaction hashes, canonical block hashes and runtime
code hashes. Re-run the read-only check from `contracts/` with
`python3 script/check_deployment.py` and `cast` on PATH.

The refreshed RPC receipts have status 1 and match canonical block hashes. The
initial Foundry broadcast output had zero block-hash placeholders; it was not used
as canonical inclusion evidence. At this check the RPC finalized head was
48,078,076, below both deployment blocks. **Inclusion and source verification are
confirmed; finalized inclusion was still pending at the recorded check.**

## Verified initial configuration

- Deployer/admin/setup minter: `0xc82f469Aa95a2f7792300c8d11230e9023A98600`.
- Separate runtime operator/quote signer: `0x037F334b58D6Be70730aEe0d830096F9a431aF9B`.
- The operator has neither token minter nor token administrator authority.
- The settlement's immutable token address matches the deployed mock; decimals = 6.
- Total supply, operator inventory, reserved inventory and escrow liabilities are
  all zero. Deployment performs no setup mint, inventory funding or user order.
- No private key was exported. Wallet and API-key files remain outside Git.

The fresh canonical receipts report execution fees of 4,652,718,000,000 wei and
14,089,938,000,000 wei, plus L1 data fees of 2,203 and 10,299 wei respectively.
The sum of those reported fee fields is **0.000018742656012502 ETH testnet**.
This is deployment cost, not a measured cost per swap.

## Validation

Foundry 1.8.3; Solidity 0.8.30; Cancun; optimizer 200 runs. Dependencies are pinned
to OpenZeppelin Contracts v5.4.0 and forge-std v1.17.0 in `foundry.lock`.

- 28 unit/fuzz tests passed, including 512 cases for each of two fuzz tests.
- One stateful accounting invariant passed 128 runs of 64 actions: 8,192 handler
  calls. It recomputes outstanding escrow and reservations, conserves total mock
  balances and forbids more than one completed payment/refund per ID. Expected
  business reverts are caught by the handler; dedicated tests assert rejections.
- Rejection tests cover unauthorized actors, wrong chain/contract/operation,
  altered signed terms, duplicate nonces/IDs, look-alike tokens, cutoff boundaries,
  fee-on-transfer behavior and attempted withdrawal of escrow/reserved funds.
- `forge fmt --check` and `forge build --sizes` passed. Deployed runtime sizes are
  2,827 bytes for the mock and 10,043 bytes for settlement, below the EVM size limit.

Foundry lint still flags timestamp comparisons, exact balance comparisons and
events after calls. Timestamps deliberately enforce signed EVM deadlines; exact
balance deltas deliberately reject unsupported token behavior. Mutating fund
paths use `nonReentrant`; the reserved-payout signature path uses ECDSA recovery.
These observations are not an independent security audit.

## Boundaries and next gate

On-chain state enforces the chosen payout/refund branch; operator attestations
still establish Zcash delivery. Base data is public. The private quote mapping,
shielded recipient and Zcash transaction identity are not contract parameters.

There is no committed-escrow abort function in this version. A failed/ambiguous
Zcash payout after `PAYOUT_COMMITTED` requires reconciliation and can leave funds
locked; elapsed time cannot safely authorize an automatic refund.

Database asset activation, service-side EIP-712 authorizations, restricted signer
dispatch, finalized event ingestion, settlement accounting and two-direction
testnet execution remain open. The primary API/database stays gated. The bridge
is a later G6 module; these are swap settlement contracts, not a completed bridge.
