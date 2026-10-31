# Judge guide

ZeeSwap is a testnet application for moving between shielded Zcash and Base.
Its swap and bridge paths have separate accounting and acceptance gates.
Use this short route to evaluate the product, implementation and evidence.

## Five-minute review

| Step | Open | Evaluate |
| --- | --- | --- |
| 1 | [Public interface](https://zeeswap.endpx.cloud/) and [current readiness](submission-readiness.md) | Product clarity, honest network/availability labels, wallet separation and exact amounts |
| 2 | [Architecture](architecture.md) | Who observes, who authorizes, who signs, and where privacy ends |
| 3 | [Historical forward swap](evidence/g4-live-forward.md) and [reverse swap](evidence/g4-live-reverse.md) | Original receipts, exact recipient deltas and accounting closure |
| 4 | [Same-user circle](evidence/g5-first-roundtrip.md) | Both directions together and independent wallet/ledger reconciliation |
| 5 | [Evidence index](evidence-index.md) | Recovery, refund, browser, contract and bridge proof boundaries |

The current interface can be assessed without approving a payment. If a service
is paused or unavailable, that state is part of the demonstration. Do not send
tokens to historical addresses or reconstruct instructions from evidence reports.
A valid payment instruction belongs to a currently accepted private order.

At the 31 October readiness checkpoint, both swap directions were enabled with
the remaining original pilot capacity. Fast execution uses canonical Base L2
inclusion while keeping delivery and finality distinct; Zcash still requires
ten confirmations. The separate bridge remains paused pending its actual funded
qualification. See the [current execution record](evidence/fast-forward-delivery.md)
before interpreting older disabled-state checkpoints or trying a new payment.

## What to look for in the code

- [`api/src`](../api/src): private order state, integer amounts, reservations,
  journal reconciliation and explicit admission gates.
- [`contracts/src`](../contracts/src): Base escrow/payout authority, permanent
  cancellation, role separation and separate bridge token lifecycle.
- [`workers/zcash-wallet`](../workers/zcash-wallet/README.md): native wallet and
  original-transaction recovery boundary.
- [`apps/web/src`](../apps/web/src): wallet approval, exact accepted terms,
  private capability handling and server-driven disabled states.
- [Observer projects](architecture.md): authorized receipt projection and public
  event projection remain separate from financial authorization.

Follow the [root verification commands](../README.md#verify-the-source) for
credential-free checks. Foundry needs initialized Git submodules. Remote
PostgreSQL tests need private isolated configuration and are not fresh-clone
offline checks.

## How to interpret the demo and results

The film is an illustrated product explanation. Its wallet actions and UI are
simulated; original asset and audio provenance is available in the
[film record](../tools/demo-video/PROVENANCE.md). Current public playback status
is available from the [published release](https://github.com/EndPx/ZeeSwap/releases/tag/demo-2026-10-29)
or the [direct MP4](https://github.com/EndPx/ZeeSwap/releases/download/demo-2026-10-29/zeeswap-original-logos.mp4).

Historical swap receipts establish bounded testnet execution. They do not
establish fresh availability on the current deployment, bridge backing or
redemption, mainnet behavior, an external audit, or completion of the stopped
G5 campaign. `READY` means a source-side condition, not delivered funds.

## Review the remaining work

The [current readiness table](submission-readiness.md) identifies live blockers
and missing submission assets. [Evidence](evidence-index.md) preserves the strong
results alongside their dates and limits. [plan.md](../plan.md) contains the
full decision history for a deeper technical review.

## First-user validation plan

The initial user hypothesis is a shielded Zcash holder who needs a Base USDC
balance, or a Base user who wants to receive into a shielded Zcash wallet.
ZeeSwap offers an explicit two-leg experience; an exchange deposit/withdrawal
or a sequence of separate swaps may fit users who prefer a different custody,
liquidity or account tradeoff. ZeeSwap must demonstrate a useful journey and
clear privacy boundaries before claiming an advantage over those alternatives.

This is a proposed experiment, not evidence of users or demand:

1. Recruit five volunteer Zcash/Base testnet users through a maintainer-led
   opt-in walkthrough in relevant wallet/developer communities. No partnership,
   community distribution agreement or recruitment result is claimed.
2. First test the no-funding flow: can each user identify the correct networks,
   the operator's custody, public Base visibility, exact output and disabled
   service state without prompting? Record completion and misunderstanding
   counts, without collecting wallet keys or linking participants to receipts.
3. After fresh financial acceptance passes, invite a separately authorized,
   bounded testnet trial. Measure completed journeys, time spent at each state,
   support interventions, unclear failures and repeat-use intent. A participant
   must approve their own wallet actions.
4. Review every privacy/custody misunderstanding before expansion. Require
   independent receipt/ledger closure for each funded trial; engagement alone
   does not establish settlement reliability.

Five participants are an exploratory usability sample, not market validation.
The next decision is whether the shielded-to-Base use case earns a repeat trial,
which step creates friction, and whether the stated custody tradeoff is accepted.
