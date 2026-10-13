# Zecathon submission readiness

Reviewed against the [official event, rules and submission form](https://thezecathon.com/)
on 2026-10-14 (Asia/Jakarta). This repository is an implementation checkpoint;
the project has not been submitted and the full product is not complete.

The intended track is **Cross-Chain**. The product goal is bidirectional swaps,
constrained intents and a backed-token bridge between shielded Zcash and Base.
The prototype uses TAZ and project-owned mockUSDC, with fixture pricing.

## Reviewer entry points

| Material | Current evidence |
| --- | --- |
| Product, architecture and acceptance gates | [plan.md](../plan.md) |
| Repository and reproducible offline checks | [README](../README.md) |
| Shielded wallet feasibility | [G1 testnet receipts](evidence/g1-feasibility.md) |
| Accounting and persistence | [Database evidence](evidence/g2-database.md) |
| Real incoming payment through the local API and scanner | [G2 intake evidence](evidence/g2-api-scanner.md) |
| Foundry contracts and verified Base Sepolia deployment | [G3 contract evidence](evidence/g3-contracts.md) |
| Forward backend and durable signer integration | [Anvil + Neon integration evidence](evidence/g3-base-integration.md); live connection checks without payment |
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

The public repository exists. A working frontend/demo and video are still
missing. mockUSDC and settlement contracts are deployed and source-verified.
Forward service integration and payout accounting have passed Anvil + Neon tests.
Public-testnet execution, the reverse signer, live refund execution, broader
recovery tests and the two-direction bridge remain open under G3–G7.
Never present `READY` as a successful destination payment.

## Verification for this publication

An export containing only staged public files passed frozen-lockfile installation,
TypeScript typecheck, five unit tests and five Python receipt tests on 2026-10-14.
These checks ran without private configuration. A targeted staged-file scan found
no matches for the locally configured credentials or the checked secret patterns;
it is not a comprehensive security audit. All eight exported migration checksums
match the applied working files, including their original line endings.
Historical live database/HTTP results are recorded separately in G2 evidence.
No test payment was resent while correcting explorer links.
