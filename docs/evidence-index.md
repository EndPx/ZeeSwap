# Evidence index

Start with the strongest outcome, then examine its boundary. Reports below are
dated records, not assertions that the current public deployment is accepting
orders. [Current readiness](submission-readiness.md) owns that status.

## Real public-testnet results

| Question | Report | What it proves |
| --- | --- | --- |
| Can shielded TAZ fund a Base payout? | [G4 forward swap](evidence/g4-live-forward.md) | Historical 0.001 shielded TAZ → 0.1 test USDC, original source/destination receipts, exact recipient delta and ledger reconciliation |
| Can Base escrow fund shielded TAZ? | [G4 reverse swap](evidence/g4-live-reverse.md) | Historical reverse delivery, independent shielded recipient verification and Base acknowledgement |
| Did one user complete both directions? | [First same-user circle](evidence/g5-first-roundtrip.md) | Two settled orders, original receipt verification, exact final balances and twelve-wallet reconciliation |
| Can eligible source refunds close principal? | [Funded refund experiments](evidence/g5-live-refund-experiments.md) | Both original full-principal refunds finalized under their respective cancellation/deadline gates |
| What did the larger campaign actually reach? | [Source15 retained checkpoint](evidence/g5-source15-unfunded-recovery.md) | Partial stopped G5 evidence, exact original-operation state and bounded no-effect expiry; not a completed twenty-order soak |
| Is there a real test faucet claim? | [USDC faucet](evidence/usdc-faucet-live.md) | Historical deployed, source-verified faucet and actual test claim; no swap settlement follows from a claim |

Historical reports call the deployed test token `mockUSDC`; the current product
label is `USDC`. Its contract identity and old financial records remain the same.
It has no Circle affiliation or monetary value.

## Implementation and recovery evidence

| Area | Reports | Evidence class / limit |
| --- | --- | --- |
| Shielded observation | [G1 feasibility](evidence/g1-feasibility.md), [G2 incoming payment](evidence/g2-api-scanner.md) | Real authorized testnet wallet/intake observations; intake `READY` alone is not a payout |
| Persistent accounting | [G2 database](evidence/g2-database.md) | Encrypted private data, guarded state, reservations and journals on remote PostgreSQL |
| Base settlement contracts | [G3 contracts](evidence/g3-contracts.md), [deployment registry](../contracts/deployments/base-sepolia.json) | Local contract tests plus historical deployed/source-verified identities |
| Forward integration | [G3 integration](evidence/g3-base-integration.md) | Anvil + Neon settlement fixture; separate from the real G4 reports above |
| Process interruption | [G5 worker interruption](evidence/g5-worker-interruption.md) | Actual local process interruption after Anvil broadcast and original-payment reconciliation |
| Old snapshot restoration | [Forward snapshot recovery](evidence/g5-snapshot-restore.md), [reverse snapshot recovery](evidence/g5-reverse-snapshot-restore.md) | Database rollback/journal reconstruction with explicitly scoped fixture or synthetic proof boundaries |
| Real SDK uncertainty recovery | [Funded SDK fault](evidence/g5-funded-sdk-fault.md) | Historical original-transaction recovery on testnet; does not close the broader G5 matrix |
| Source supervision | [Fatal observer incident](evidence/native-chef-fatal-supervision.md) | Observed failure, frozen state and bounded supervisor correction; not source recovery completion |

## Current product surfaces and separate bridge work

| Area | Reports | Boundary |
| --- | --- | --- |
| Public Linux application | [Deployment checkpoint](evidence/native-linux-live-checkpoint.md), [health compatibility](evidence/live-app-health-compatibility.md) | Actual frontend/API connectivity and health schema checks; financial readiness remains independent |
| Fixed pricing and faucet UI | [Public fixed-rate check](evidence/fixed-rate-faucet-live.md), [fixed-rate implementation](evidence/fixed-rate-settlement.md) | Exact configured terms and UI checks; fixture/browser arithmetic is not live settlement |
| Manual Zcash wallet flow | [Noir removal](evidence/noir-removal.md) | Current implementation uses exact QR/manual copy instructions; static release and real payment verification are separate |
| Historical Noir wallet flow | [Noir connection](evidence/noir-wallet-connection.md) | Superseded by the 31 October manual-wallet decision; old synthetic-provider tests remain historical evidence |
| Original UI assets | [Artwork provenance](../apps/web/evidence/original-brand-assets.md) | Original wallet, asset and network art plus reviewed deployed build |
| Bridge model and storage | [G6 implementation](evidence/g6-bridge-implementation.md), [design](bridge.md) | Local and isolated PostgreSQL bridge evidence; separate book and backing gates |
| Concrete Base bridge reads/signing | [G6 adapters](evidence/g6-bridge-base-adapters.md) | Canonical Base verification and restricted local mechanics; no implication of live two-way bridge delivery |
| Public Bridge screen | [G6 web checkpoint](evidence/g6-bridge-web-live.md) | Historical disabled public screen; consult [readiness](submission-readiness.md) for later deployment status |
| Motion demo | [Film provenance](../tools/demo-video/PROVENANCE.md), [design](../tools/demo-video/DESIGN.md) | Illustrated UI/wallet/architecture film with original assets; no fresh settlement |

## Reading the results correctly

Local unit/browser tests, Anvil fixtures, remote PostgreSQL tests, fixture
inventory, included chain transactions, finalized receipts and fully reconciled
cross-chain settlement are different evidence classes. No single class silently
stands in for another. In particular, SQL `SETTLED` is read alongside the original
receipt verifier and accounting checks; an included transaction may still await
canonical finality.

For the complete older narrative, use the byte-preserved
[legacy README](history/legacy-readme-20261029.txt). It is a plain-text archive so
its original root-relative links are preserved without becoming broken rendered
links; use this index to navigate evidence.
[plan.md](../plan.md) retains product decisions, chronological acceptance gates
and the larger recovery history.
