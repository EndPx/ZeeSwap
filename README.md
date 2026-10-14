# ZeeSwap
**Swap across chains. Keep your ZEC shielded.**

ZeeSwap is building bidirectional swaps, constrained intents and a backed-token bridge between shielded Zcash and Base. The first swap pair is ZEC / USDC; the prototype uses TAZ on Zcash testnet and a project-owned mockUSDC on Base Sepolia. The mock and settlement contracts are deployed and source-verified.

One real testnet swap is verified in each direction: **0.001 shielded TAZ → 0.1 mockUSDC** and **0.1 mockUSDC → 0.001 shielded TAZ**. Both ran through bounded local operator harnesses, with exact recipient receipts, settled private orders and balanced accounting. The full product remains under construction.

- [Implementation plan](plan.md): scope, decisions and acceptance gates.
- [Zcash wallet tooling](workers/zcash-wallet/README.md) and [live G1 evidence](docs/evidence/g1-feasibility.md).
- [Database module](api/README.md) and [live Neon evidence](docs/evidence/g2-database.md): encrypted quotes, guarded order/deposit transitions, reservations, balanced journals and fenced jobs.
- [HTTP API and observer](docs/api.md) and [real incoming-payment evidence](docs/evidence/g2-api-scanner.md): one shielded deposit advances one private order to READY without a destination payout.
- [Submission readiness](docs/submission-readiness.md): evidence available to reviewers and the remaining demo requirements.
- [Explorer verification](docs/evidence/explorer-verification.md): confirmed transaction and explanation of the stale explorer link.
- [Foundry contracts](contracts/README.md), [deployment registry](contracts/deployments/base-sepolia.json) and [G3 evidence](docs/evidence/g3-contracts.md): tested, deployed and source-verified mockUSDC and Base settlement.
- [Forward backend integration](docs/base-integration.md) and [integration evidence](docs/evidence/g3-base-integration.md): private API, durable Base signer, finalized receipt observer and accounting tested through settlement on Anvil + Neon; live Base Sepolia connection checks passed without a payment.
- [Forward public-testnet settlement](docs/evidence/g4-live-forward.md): source and destination receipts, exact recipient delta, fees, ledger reconciliation and remaining gates.
- [Reverse public-testnet settlement](docs/evidence/g4-live-reverse.md): finalized escrow and acknowledgement, independent shielded recipient receipt, original-transaction recovery and complete accounting.
- [Reverse integration](docs/reverse-integration.md): escrow authorization and finalized commitment checks; the public reverse quote route remains closed while the guarded operator flow is validated.
- [Durable reverse adapter and repeatable tests](docs/evidence/g4-reverse-recovery.md): compiled SDK raw export, same-transaction recovery, guarded broadcast and independent receipt checks; local verification is distinguished from public-testnet payment evidence.

## Verify locally

With Node 24 and pnpm 10.21.0, these checks require no wallet or database credentials:

Run the Python wallet suite on Linux/WSL; the signer recovery tests exercise Linux
file locking and directory fsync.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
python -m unittest discover -s workers/zcash-wallet -p 'test_*.py'
```

`pnpm test:integration` requires private operator configuration and uses the isolated regression branch. These deployment scripts deliberately allowlist the project's Neon endpoints; a fresh clone cannot access them without credentials. See [database setup and test isolation](api/README.md). `pnpm api:start` also requires private runtime and wallet configuration; primary funding routes remain gated.

## Privacy and trust

The operator can decrypt payments addressed to its shielded receiver and holds settlement inventory. This prototype uses a custodial operator model. Base transfers are public, and the operator can associate both sides of an order. The shielded claim applies to the Zcash leg; it does not promise end-to-end anonymity, atomic settlement or trustless custody.

There is no deployed frontend or publicly operated cross-chain payout service yet. One swap in each direction passed; public reverse HTTP intake, broader recovery/soak, live refunds and the bridge remain open. Primary intake and dispatch remain disabled. Contract tests require `git submodule update --init --recursive`; see the Foundry module guide.
