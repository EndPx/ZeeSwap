# Settlement integration design

Design baseline: 23 October 2026, Asia/Jakarta. This is a specification for future
implementation, not a report that these integrations are deployed or tested.
The existing [plan](../../plan.md) remains the product and acceptance authority.

## Decisions

| ID | Decision | Reason |
| --- | --- | --- |
| D01 | Zeer and Envio publish observations; ZeeSwap owns eligibility, reservations, signing and accounting. | An indexer rollback cannot reverse a payment. |
| D02 | Persist a complete reconciled range and its coverage certificate atomically. Never advance on a partial traversal. | Missing rows and invalidated cursors must not leave orphaned payments eligible. |
| D03 | Discover promptly, then independently satisfy the existing finality policy. | Faster indexing does not remove Zcash confirmations or Base finalization. |
| D04 | An accepted customer quote has exact input and exact net output, or a full source-principal refund under its disclosed conditions. | Provider repricing must not silently change the user's terms. |
| D05 | Create an executable provider quote only after the source is eligible and execution prerequisites are ready. | A short provider quote cannot safely cover the Zcash confirmation wait. |
| D06 | The operator pays route input, price drift, gas and valid-order refund fees from bounded reserved capital. | Customer principal and other orders' reserves cannot finance a route loss. |
| D07 | NEAR Intents has EVM endpoints only. Initial provider execution is treasury-to-treasury; final customer delivery remains a separate ZeeSwap operation. | A late provider delivery goes to ZeeSwap rather than paying a customer after refund. |
| D08 | Provider status, customer outcome, and economic reconciliation are separate state machines. | Provider success is not customer delivery; provider refund is not customer refund. |
| D09 | Irreversible customer payout/refund exclusion is enforced before returning source principal. | Timeout, lease expiry and a database flag cannot revoke a signed payment. |
| D10 | Provider integration remains disabled for the TAZ/mockUSDC baseline. | Public NEAR documentation currently offers no testnet deployment; existing contracts also restrict deployment to local/testnet chains. |

D07 deliberately adds a treasury receipt and final transfer. That costs gas,
requires destination inventory/contract support and may increase latency. It
preserves the existing cancellation model without relying on a provider API to
prove that no future transfer to the user is possible. Direct provider-to-user
delivery is a separate future design with different refund guarantees.

This remains a custodial operator model. Zcash data is shielded from public
observers under its protocol, EVM transfers are public, and ZeeSwap can correlate
the private order with both legs. Treasury routing does not make the route
atomic, trustless or unlinkable by timing/amount analysis.

## Specifications

1. [Observation adapters](observation-adapters.md): schemas, completeness,
   identities, freshness, cursors, replacement, finality and reorg handling.
2. [NEAR EVM quote policy](near-evm-quote-policy.md): immutable terms, two quote
   stages, capital limits, provider validation and both swap directions.
3. [Route recovery and accounting](evm-route-recovery.md): transition guards,
   signer recovery, refund authorization, liabilities and failure scenarios.

The documents define proposed internal DTOs and tables. They are not existing
Chef, Envio, 1Click or ZeeSwap APIs. A future implementation must introduce a new
execution mode, schema version and migrations explicitly; accepted orders retain
their original mode and terms. No migration, contract deployment, wallet process,
G5 continuation or provider payment is authorized by this documentation change.

## What exists and what changes

| Area | Inspected current boundary | Required future work |
| --- | --- | --- |
| Zcash observer | `api/src/observer.ts` accepts strict private schema-v1 snapshots; source checkpoints and observer epochs protect dispatch. | Add a private Chef projection and adapter without relaxing existing eligibility checks. |
| Base | `ZeeSwapSettlement.sol` owns mockUSDC inventory, signed funding, payout/cancellation and escrow states. | Add Envio projections and an adapter; preserve canonical RPC checks at financial boundaries. |
| Quote | Immutable pair, integer amounts, fixture pricing and reservations. | Add a disabled provider execution mode with bounded treasury exposure and two quote stages. |
| EVM provider | Architecture decision only; no live 1Click integration. | Add transport, payload verification, treasury routing and operation reconciliation after local gates. |
| Recovery | Existing source-refund guards require canonical exclusion of the opposing outcome. | Add provider books and versioned settlement interfaces. Current reverse escrow has no abort from `PAYOUT_COMMITTED`. |

The inspected Zeer checkout was commit
`e850cdd1472d05d8f551c2ecea7685a7aa8a5a19`; its Chef/CLI package manifests
declare 0.6.1. This is source inspection, not a new registry-install or ZeeSwap
integration test. Upstream documents carrying older test dates remain historical
evidence. Pin package integrity, scanner identity and generated schema again at
implementation time.

## Implementation order and exit gates

These are dependencies within future integration work, not replacements for
G1-G7 or permission to resume the stopped G5 soak.

| Gate | Bounded milestone | Required evidence before proceeding |
| --- | --- | --- |
| I0 | DTOs and isolated financial model | Strict schemas, unknown values rejected, integer vectors and every refund branch checked against the three specifications. No network spending. |
| I1 | Chef private adapter in shadow mode | Full-range replacement, same-height notes, 409/503 handling, restart, key rotation and deep-reorg refusal. Compare owned receipts with the existing observer without dispatch. |
| I2 | Envio adapter in shadow mode | Full event coverage, empty blocks, rollback deletions, re-inclusion and finalized RPC comparison. Handlers have no financial side effects. |
| I3 | Disabled route adapter and ledger | Recorded synthetic provider responses; expiry, failed/unknown broadcasts, partial refunds, late treasury credits and concurrency scenarios pass. Fixtures are labelled. |
| I4 | New contract/mode review | Payout cancellation tombstones; guarded reverse abort where needed; contract state races and crash/recovery tests. No reinterpretation of the current `Paid` event. |
| I5 | Controlled testnet ZeeSwap acceptance | New scope explicitly authorized; no automatic restart of historical G5. Testnet can validate native swap/adapter behavior, not real 1Click settlement. |
| I6 | Separately approved provider execution | Exact production chains/assets/contracts, amount and fee-inclusive spend cap, funded reserves, deployment review and recovery drill. Confirm actual provider funding/output/refund receipts and customer delivery separately. |

Neither an API preview nor synthetic provider fixtures close I6. If real-provider
acceptance is deferred, the UI must say that EVM routing is planned and the
existing testnet pair uses ZeeSwap liquidity directly.

## Review and sources

Acceptance cases are defined alongside each contract. Documentation checks,
known external gaps and publication scope are recorded in
[the design review](../evidence/integration-design-review.md).

Primary upstream references inspected for this design:

- [Zeer Chef consumption contract at the inspected commit](https://github.com/EndPx/zeer/blob/e850cdd1472d05d8f551c2ecea7685a7aa8a5a19/docs/CHEF_CONSUMPTION_API.md)
- [Zeer shielded receipt contract at that commit](https://github.com/EndPx/zeer/blob/e850cdd1472d05d8f551c2ecea7685a7aa8a5a19/docs/SHIELDED_RECEIPTS.md)
- [Zeer continuous-consumer verification at that commit](https://github.com/EndPx/zeer/blob/e850cdd1472d05d8f551c2ecea7685a7aa8a5a19/docs/CONTINUOUS_CONSUMER_VERIFICATION.md)
- [Envio HyperIndex reorg support](https://docs.envio.dev/docs/HyperIndex/reorgs-support)
- [1Click quote API](https://docs.near-intents.org/api-reference/oneclick/request-a-swap-quote)
- [1Click status API](https://docs.near-intents.org/api-reference/oneclick/check-swap-execution-status)
- [1Click authentication](https://docs.near-intents.org/integration/distribution-channels/1click-api/authentication)
- [Quote signatures](https://docs.near-intents.org/integration/distribution-channels/1click-api/verify-quote-signature)
- [Swap types](https://docs.near-intents.org/integration/distribution-channels/1click-api/swap-types)
- [Fee configuration](https://docs.near-intents.org/integration/distribution-channels/1click-api/fee-config)
- [NEAR Intents FAQ, including testnet availability](https://docs.near-intents.org/resources/faqs)
