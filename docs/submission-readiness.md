# Zecathon submission readiness

Reviewed against the [official event, rules and submission form](https://thezecathon.com/)
on 2026-10-14 (Asia/Jakarta). This repository is an implementation checkpoint;
the project has not been submitted and the full product is not complete.

The intended track is **Cross-Chain**. The product goal is bidirectional swaps,
constrained intents and a backed-token bridge between shielded Zcash and Base.
The prototype uses TAZ and project-owned mockUSDC, with fixture pricing.

Bridge implementation checkpoint (26 October): the separate TAZ/zeeTAZ interface
is visible on the public site with new deposits and burns disabled. Its paused
contract, encrypted accounting and private API preparation have local and
isolated PostgreSQL evidence; actual live bridge delivery remains unproven.
Use the [bridge implementation](evidence/g6-bridge-implementation.md) and
[actual public web check](evidence/g6-bridge-web-live.md) for the current scope.
Do not present the earlier swap receipts as bridge mint/redemption evidence.

## Reviewer entry points

| Material | Current evidence |
| --- | --- |
| Product, architecture and acceptance gates | [plan.md](../plan.md) |
| Repository and reproducible offline checks | [README](../README.md) |
| Deployed frontend and HTTPS API | [Public testnet interface](https://zeeswap.endpx.cloud/) and [Linux deployment checkpoint](evidence/native-linux-live-checkpoint.md); trading paused pending source freshness and the new funded circle |
| Shielded wallet feasibility | [G1 testnet receipts](evidence/g1-feasibility.md) |
| Accounting and persistence | [Database evidence](evidence/g2-database.md) |
| Real incoming payment through the local API and scanner | [G2 intake evidence](evidence/g2-api-scanner.md) |
| Foundry contracts and verified Base Sepolia deployment | [G3 contract evidence](evidence/g3-contracts.md) |
| Forward backend and durable signer integration | [Anvil + Neon integration evidence](evidence/g3-base-integration.md); live connection checks without payment |
| One real forward public-testnet swap | [G4 receipts and reconciliation](evidence/g4-live-forward.md): 0.001 shielded TAZ to 0.1 mockUSDC, finalized and SETTLED |
| Reverse escrow/signing prerequisites | [Historical reverse preflight](evidence/g4-reverse-preflight.md) |
| Durable reverse execution and recovery | [SDK adapter and repeatable tests](evidence/g4-reverse-recovery.md); distinguish synthetic destination proofs from live receipts |
| One real reverse public-testnet swap | [G4 reverse receipts and reconciliation](evidence/g4-live-reverse.md): 0.1 mockUSDC to 0.001 shielded TAZ, confirmed recipient delta and finalized Base acknowledgement |
| Same-user public-testnet roundtrip | [First G5 circle](evidence/g5-first-roundtrip.md): shielded TAZ to mockUSDC and back to the original shielded wallet; two SETTLED orders, finalized original receipts, exact user balances and twelve-wallet/accounting reconciliation. The twenty-order G5 gate remains open |
| Both full-principal source refunds | [Live refund experiments](evidence/g5-live-refund-experiments.md): finalized original shielded refund after permanent Base cancellation, plus finalized mockUSDC escrow refund after its accepted deadline |
| Forward worker process interruption | [G5 local recovery evidence](evidence/g5-worker-interruption.md): killed after Anvil PAY broadcast; fresh connections reconcile one original payment and exact accounting. This is not a public-testnet soak or old-snapshot restore |
| Forward old database snapshot restore | [G5 snapshot/journal recovery](evidence/g5-snapshot-restore.md): actual PostgreSQL rollback, atomic pause and canonical original PAY reconstruction; fixture signer, no live keystore or reverse wallet restore claimed |
| Public transaction lookup | [Explorer discrepancy and replacement link](evidence/explorer-verification.md) |

Only source, migrations, lockfiles, tests, configuration examples and sanitized
evidence are published. Credentials, wallet stores, viewing/spending keys, raw
note listings, access capabilities and local operator tooling remain private.

## Remaining submission gates

The official form requires a project name, one track, description (up to 2,000
characters), repository URL, usable demo URL, a two-minute video and confirmation
that the repository will be public. The rules also require code written within
the build window, allow libraries and require open source at submission.
Review provenance and select an explicit project license before final submission;
public repository visibility alone does not grant an open-source license.

The inspected deadline is **2026-10-28 23:59 UTC / 2026-10-29 06:59 WIB**.
Recheck the official form before the final submission. No draft or submission
was saved during this review.

The public repository, frontend and HTTPS API exist. The new deployment still
needs source-freshness acceptance and its funded two-way circle; a public
walkthrough video remains missing. mockUSDC and settlement contracts are deployed and source-verified.
Forward service integration and payout accounting have passed Anvil + Neon tests.
One public-testnet swap in each direction passed, including exact recipient
balance deltas and final accounting. The operator's reverse signer and original
transaction recovery were exercised with real TAZ. The first same-user circle
and both full-principal refund experiments also passed. Public reverse HTTP
intake, broader recovery/soak tests, end-user wallet integration and the
two-direction bridge remain open under G4–G7.
Never present `READY` as a successful destination payment.

## Historical clean-export verification

An export containing only staged public files passed frozen-lockfile installation,
TypeScript typecheck, five unit tests and five Python receipt tests on 2026-10-14.
These checks ran without private configuration. A targeted staged-file scan found
no matches for the locally configured credentials or the checked secret patterns;
it is not a comprehensive security audit. All eight exported migration checksums
match the applied working files, including their original line endings.
Historical live database/HTTP results are recorded separately in G2 evidence.
No test payment was resent while correcting explorer links.

The later bounded forward harness passed nine unit, 38 DB/HTTP, eight Anvil/Neon
and eight Python tests; see [G4 preparation](evidence/g4-forward-preflight.md).
The live settlement publication additionally passed TypeScript typecheck and the
read-only chain/database verifier described in [G4 evidence](evidence/g4-live-forward.md).
