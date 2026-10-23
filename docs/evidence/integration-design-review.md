# Settlement integration design review

Recorded 23 October 2026, Asia/Jakarta. Scope: design documentation only.
Baseline ZeeSwap commit: `b70cebf361dac440b16f8534b7f8fb18760ca8a6`.

## Requested deliverable

Specify the Zeer/Envio observation adapter, NEAR EVM quote-expiry/price-risk
policy, and EVM route retry/refund/accounting rules in enough detail to implement
and verify separately. The [design index](../design/README.md) links the three
contracts, decisions and future I0-I6 dependencies.

## Inspection and decisions

Read current `plan.md`, `AGENTS.md`, Git status, observer/epoch code, canonical
memo parsing, source refunds, Zcash transaction decoder and Base settlement
contract. Checked the Zeer source consumption/receipt/continuous-consumer
contracts at checkout commit `e850cdd1472d05d8f551c2ecea7685a7aa8a5a19`;
Chef/CLI manifests declare 0.6.1. This was source inspection, not a new package
install, native scan or live discovery benchmark.

Read current primary Envio reorg documentation and 1Click quote/status,
authentication, signature, swap-type, fee and FAQ documentation. The initial
authentication-header ambiguity was resolved by the current official guide:
partner JWT supports `X-API-Key` and `Authorization: Bearer`. The design chooses
`X-API-Key`, with no anonymous fallback. A search surfaced an old NEAR FAQ URL
that now returns 404; the cited current `docs.near-intents.org/resources/faqs`
loaded and explicitly states no testnet deployment. Zeer's hosted overview was
unavailable to the web fetch tool in this pass; the inspected local upstream
source contracts are linked at their commit instead.

The important design choice is treasury-to-treasury provider routing followed by
separate customer delivery. This adds cost/latency but makes late provider credits
independent of customer refund after an irreversible payout cancellation. Price
drift and route losses belong to bounded operator capital; provider USDC refunds
never determine a reduced Zcash principal refund.

## Design acceptance inventory

- A01-A14: 14 observation scenarios covering cursor instability, complete-tail
  replacement, key rotation, freshness, source privacy, reorgs and backpressure.
- Q01-Q12: 12 quote/capital scenarios covering expiry, fixed terms, input caps,
  signature/asset validation, fee semantics and source cancellation races.
- R01-R20: 20 recovery scenarios covering signed-but-unknown transactions,
  provider/customer divergence, partial returns, late credits, restore and races.

These **46 scenarios are specified requirements, not 46 executed software tests**.
No local test result, public-testnet receipt or provider settlement is claimed
by listing them.

## Material gaps retained as implementation gates

1. A dedicated private Chef projection needs block metadata, indexed height,
   canonical receiver conversion and the existing narrow raw-transaction privacy
   classifier. Chef receipt scope alone is insufficient.
2. Envio needs a demonstrated coherent export/checkpoint/empty-block contract;
   a live GraphQL page and highest event height cannot establish completeness.
3. Real provider payload/signature compatibility, net withdrawal/refund semantics,
   vault support, partner access and bounded production asset execution remain
   unverified in ZeeSwap.
4. Current Base contracts enforce local/testnet chain IDs and do not provide
   reverse committed-state abort. Future mode needs reviewed contract support,
   including a safe operator-paid refund executor, before activation.
5. Proposed polling/time/capital settings and discovery target are unmeasured
   design defaults. Confirmation/finality waits are not reduced by this design.

## Verification record

Read-only documentation validation passed for the five new files: 44 unique
section headings, 23 Markdown links with local targets/anchors checked, balanced
code fences, sequential A/Q/R IDs (14/12/20), plan references and six exact-integer
example vectors. The first validator run stopped on a literal wording assertion
(`no reverse abort` versus the actual `no abort from`); the expectation was
corrected and the complete check passed. No design invariant failed in that run.

Upstream reference verification compared the three cited Zeer contracts and two
package manifests against the exact cited commit, normalizing line endings.
Five current-code boundary assertions passed: allowed deployment chains, absent
abort method, ten source confirmations, observer freshness/skew and the existing
single-pool shielded-structure predicate. These are consistency checks, not new
runtime tests of the integrations.

`git diff --cached --check` passed. The reviewed publication list contains exactly
six paths: the four design documents, this evidence file and `plan.md`. The
publication audit scanned 327 indexed public files with zero secret findings;
its two unchanged historical public G1 demo-label exceptions remain unchanged.
Tracked migration bytes match the working baseline. All 26 pre-existing
untracked paths remain outside the index, with no runtime path staged. The final
evidence text is re-staged and the same audit rerun before publication.

## Non-actions and preserved work

No runtime source, database/migration, wallet, signer journal, deployment registry
or accepted order was changed. No financial operation, live SDK process or G5
driver was started. The historical G5 20/20 gate remains incomplete and stopped
at the user's request. The 26 pre-existing untracked source/migration/test/evidence
files are outside this milestone and must not be staged or published with it.
