# ZeeSwap
**Swap across chains. Keep your ZEC shielded.**

ZeeSwap is building bidirectional swaps, constrained intents and a backed-token bridge between shielded Zcash and Base. The first swap pair is ZEC / USDC; the prototype uses TAZ on Zcash testnet and a project-owned mockUSDC on Base Sepolia. The mock and settlement contracts are deployed and source-verified.

Real testnet swaps are verified in both directions: **0.001 shielded TAZ → 0.1 mockUSDC** and **0.1 mockUSDC → 0.001 shielded TAZ**. After the initial G4 experiments, the first same-user circle also passed: both orders SETTLED, original receipts verified, exact final user balances and a reconciled twelve-wallet checkpoint. These use bounded operator harnesses and fixture pricing. The full product remains under construction.

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
- [Worker interruption recovery](docs/evidence/g5-worker-interruption.md): a real worker process is killed after an Anvil PAY broadcast; fresh connections reconcile the original payment once with exact accounting. Broader recovery and the public-testnet soak remain open.
- [Old database snapshot recovery](docs/evidence/g5-snapshot-restore.md): actual PostgreSQL dump/restore, atomic paused startup and reconstruction from the independent original signing journal; five local fault/recovery cases passed.
- [Bounded soak runner and funded capital](docs/evidence/g5-soak-runner.md): reviewed twenty-order manifest, ten independently verified capital wallets and idempotent opening ledger; public-testnet soak not yet completed.
- [Reverse snapshot recovery](docs/evidence/g5-reverse-snapshot-restore.md): actual PostgreSQL rollback and original journal reconstruction on Anvil with a synthetic Zcash verifier; funded SDK crash rehearsal remains pending.
- [Source refund boundaries](docs/evidence/g5-source-refunds.md): permanent cancellation and uncommitted escrow deadline gates, durable source refunds and full-principal accounting; live receipts are recorded separately below.
- [Actual funded refund experiments](docs/evidence/g5-live-refund-experiments.md) and [retry preparation](docs/evidence/g5-retry-preparation.md): both full-principal refunds are finalized, the historical run remains frozen and its capital allocation was released.
- [First same-user roundtrip](docs/evidence/g5-first-roundtrip.md): shielded TAZ to mockUSDC and back to the original wallet; two SETTLED orders, finalized original receipts, zero open obligations/reservations, balanced books and twelve-wallet reconciliation. That two-order circle remains preserved; the current retry has advanced to 3/20 ordinarily receipt-verified settlements, with zero of four five-order barriers complete.
- [Actual F3 recovery](docs/evidence/g5-f3-scanner-recovery.md) and [read-only scanner error boundaries](docs/evidence/g5-read-only-scanner-errors.md): the third original forward payment finalized, exact twelve-wallet/books reconciliation passed at epoch 6, and its ordinary receipt verifier passed by 15:52 UTC. A later fourth-slot quote-step stop passed a separate [bounded no-effect reconciliation](docs/evidence/g5-r4-empty-quote-recovery.md) at 16:10:43 UTC: no quote or financial effect, database/main state unchanged and only the local controller latch cleared. The next normal driver accepted the R4 quote at 16:18:04 UTC (AWAITING_FUNDS), then returned a normal observer wait at FUNDING_CALL with controller incident false. The original R4 source fund subsequently finalized and passed exact HELD/READY recovery at epoch 6. A separate pre-COMMIT configuration-read timeout passed its scoped controller-only recovery; the original COMMIT was then signed and broadcast. Root verified its canonical successful receipt at 17:17 UTC, with Base finality still pending. R4 is not yet SETTLED; the fourth-slot funded SDK fault/recovery and remaining seventeen settlements stay pending. The original scanner failure cause remains unknown.
- [Observer reliability](docs/evidence/g5-observer-frontiers.md), [bounded live controller](docs/evidence/g5-live-controller.md) and [held SDK fault rehearsal](docs/evidence/g5-funded-sdk-fault.md): actual scan/network-tip separation, epoch-fenced confirmations, once-only source actors and reviewed original-byte recovery. Local checks and replay observations passed; the remaining public-testnet settlements and funded interruption remain separate acceptance gates.

Current bounded-run status at 2026-10-15 17:34 UTC (2026-10-16 WIB): **3/20 settled, 0/4 barriers**. A completed-receipt descriptor check incorrectly required a redundant field absent from the original reverse configuration; that shape check is fixed and root's direct read-only proof of all three originals passed. The main incident and SQL reconciliation latch remain set at epoch 7, with intake/dispatch paused and the controller unchanged at OBSERVE_COMMIT. The [scoped verification recovery](docs/evidence/g5-r4-verify-binding-recovery.md) returned AWAITING_ORIGINAL_COMMIT_FINALITY at 17:33:36 UTC; it changed no latch or financial effect. Root's combined local verification then passed **107 TypeScript checks**, four Python scanner checks, typecheck and diff checks, with both invocation-owned database cleanups complete. Finalized original COMMIT proof, actual recovery and the R4 SDK fault/settlement remain pending.

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

There is no deployed frontend or publicly operated cross-chain payout service yet. Initial swaps in each direction and the first same-user roundtrip passed; public reverse HTTP intake, the remaining recovery/soak, end-user wallet integration and the bridge remain open. Primary intake and dispatch remain disabled. Contract tests require `git submodule update --init --recursive`; see the Foundry module guide.
