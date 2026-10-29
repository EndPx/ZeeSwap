# Proposal: retire one zero-exposure operator source attempt

Status: **Root approved implementing the explicit mechanism; operator execution
still requires review of actual closure facts.** The preparation is recorded in
`docs/evidence/g6-unfunded-retirement-preparation.md`. This document itself
authorizes no retirement or replacement. The original accepted order, permit,
capability, cutoffs and failed-attempt evidence remain unchanged until the
separate reviewed certificate is executed.

## Problem and boundary

The controlled operator source order was accepted before its payer controller
was staged. Its five-minute source window can end without a source calculation
or transfer. The existing one-accepted-order-per-direction rule correctly
prevents another normal permit from resetting the slot. That regression must
remain valid.

Do not pay the expired instructions, amend their deadline, clear a signed cache,
delete an intent, mark `accepted=false` or pretend a refund/cancellation occurred.
The proposed exception is an explicitly Root-authorized replacement of one
proved **zero-principal-exposure attempt**, rather than a silent counter reset.

## Required closure evidence

Before Root can review a retirement certificate, collect and bind all of:

1. Exact original permit/order/book revision and encrypted payload digest,
   original receiver/memo commitment and immutable height/time cutoffs.
2. The original time cutoff has expired. The dedicated native scanner has
   complete canonical coverage through the original cutoff height plus nine
   blocks, so every height-eligible output has the required ten confirmations.
   Independently decrypt every matching incoming candidate and prove **no
   eligible receipt**, across spent and unspent retained notes. Checking only
   today's unspent balance or latest block is insufficient.
3. The actual controlled payer has no source calculation, signed original,
   broadcast marker or source intent for this order. Its calculated cache is
   empty; independent ownership/provenance still matches the approved 350,000
   note. Existing unrelated confirmed fee-setup history remains archived.
4. Dedicated bridge principal is exactly zero, in transit is zero, actual token
   supply is zero, actual Base unpaid redemption counter is zero and no order
   source/destination/attempt exists for the expired source order. The onchain
   mint state for its exact commitment must remain NONE.
5. Physical fee capital is the exact original three 10,000 notes. Available fee
   capital plus the unused original 10,000 reservation equals 30,000. No fee was
   spent or silently credited. No unknown outgoing journal or actor exists.
6. Fresh paired anchors, exact database/role/system identity and original
   canonical anchor ancestry. Conflicts, missing history, late matching money,
   unknown cache or a reorg stop retirement.

The actual cutoff-height closure can require waiting beyond the wall-clock
deadline. Do not shorten the financial absence proof to save time.

## Explicit replacement authority to review

If and only if those facts pass, a new Root-owned, raw-SHA-pinned
`ROOT_BRIDGE_ZERO_EXPOSURE_REPLACEMENT` certificate should name the exact retired
order, original permit, closure proofs, unused reservation, preserved archive and
one prospective replacement. Limit it to the same controlled payer, destinations,
100,000 principal, 10,000 fee and one concurrent liability. Permit **one**
replacement attempt; it does not authorize another funded exposure.

Keep the original order accepted and permanently recorded as a new explicit
`EXPIRED_UNFUNDED` terminal classification, with its original terms and closure
proof. Release its unused fee reservation once, under the same book lock and
exact physical reconciliation. Keep the original accepted-attempt count and
record the additional explicit replacement authorization separately. A normal
new qualification permit must still fail the existing no-counter-reset test.

The replacement controller must use a new order/commitment and fresh ordinary
`BridgeService.quote`/`accept`; never reuse or retime the expired instructions.
Mint/source authority must bind the explicit replacement certificate as well as
the original qualification lineage. Public-pilot counters remain separate and
unchanged. Final funded-circle proof must identify the actual replacement
deposit/mint and corresponding burn/delivery/ACK, not the retired order.

Original receivers and memos remain watched. Any later payment to the retired
instructions is quarantined as an explicit reconciliation liability; it cannot
mint, be ignored or fund the replacement. This does not enable production
funded-CANCEL or shielded-refund signing, which remain outside this proposal.

## Acceptance checks before implementation/execution

- Missing cutoff coverage, a matching receipt, signed cache, broadcast uncertainty,
  nonzero principal/supply/unpaid, changed fees or reorg refuses retirement.
- The original deadline, accepted flag, request hash, capability, funding and
  history remain byte-for-byte unchanged except the new explicit terminal
  classification/closure linkage.
- Fee reservation releases once; replay cannot credit another 10,000.
- Another ordinary permit cannot reset counters; certificate replay cannot create
  a second replacement; two concurrent replacement acceptances cannot both win.
- Expired original instructions always fail the payer at prepare and broadcast.
- Existing original-byte/UNKNOWN, canonical source, fee isolation and finality
  gates remain. Root must separately approve this exact exception before code or
  operator execution; no execution follows from this proposal file.
