# G5 funded refund experiments and first-run incident

Date: 2026-10-15 (Asia/Jakarta). Starting revision:
`92dd96e8da1f96e64ec63a985d85d95e2c6c7e2f`.

Two actual testnet source payments now await refunds. Neither is a completed
swap or completed refund. The twenty-swap soak remains **0/20**. This report
preserves the failed first attempt and the actual custody obligations.

## Late shielded source

The first G5 forward order had source cutoff height `4504010`. Its payment
`7e629b91c75bb13c1c063d2f9eb941aaaaf437da9410b6f0498cb25aee37eb37`
was mined at `4504016`. The wallet's signed transfer returned exactly the
intended source note, but inclusion was six blocks beyond the accepted cutoff.
The observer correctly recorded `LATE` and `REFUND_REQUIRED`, retaining the
full `100000`-zatoshi refund obligation. There was no Base payout attempt.

The operator first declined funding with a three-block safety margin, then
proceeded using only a before-cutoff check. This was insufficient for wallet
processing and inclusion latency. The cutoff remains unchanged. Future funding
must prepare and synchronize the source wallet before quote creation, preserve
a larger height margin, and fund promptly. This incident is not counted as a
successful alternating swap.

The source raw transaction passed the existing strict structural parser:
Ironwood-only, `10000`-zatoshi actual fee, zero transparent inputs and outputs.
An additional operator-owned `10000`-zatoshi fee note was explicitly funded by
transaction
`01054412a278b824de5326890da14d6c0bdd00d9b548d3150fdd105dac3d1602`.
The restricted refund wallet was synchronized and both notes were independently
decrypted: customer principal `100000`, operator fee capital `10000`, both with
at least ten canonical confirmations. The fee note was credited once through
two balanced capital entries. It was not recorded as another customer deposit.

The original source order and incident manifest remain intact. Ordinary jobs
were retired, a source-refund decision was recorded, and intake/dispatch remain
disabled. The immutable approved refund recipient was confirmed as an address
of the original sender wallet; its viewing key is stored privately for actual
recipient verification. No shielded refund has been calculated or broadcast.

The restricted Base cancellation signer stopped before signing: the installed
`cast block --json` returns a versioned success envelope containing block
fields under `data`, while the implementation expected a direct block object.
This produced `KeyError('number')` during its read-only preflight. No CANCEL
transaction was created. The implementation needs a compatibility fix and
corresponding tests before this live refund proceeds. The live failure does not
invalidate the recorded local tests; it identifies an additional environment
case those tests did not cover.

## Funded reverse refund

A separate branch, `br-weathered-cell-aogn8u34`
(`zeeswap-g5-live-refunds`), preserves the reverse experiment independently.
Its quote was backed by a separately funded/decrypted `110000`-zatoshi note:
`100000` principal plus `10000` payout-fee capacity. The source user received
an explicit `100000`-unit mockUSDC setup mint, transaction
`0xcbc0be5370498fabd0bcaa47909c8991cb55ff44ad44a5d8b9f3d88d5cca1d6f`.
The user's exact approval was
`0x83ffc09d04ee5e30093e0a7ee7e8d2dea84ea2d0a9786afa110b6e0dd99a890a`.

Source funding
`0xe19d3ec08f5df45c97e04487d70bf4b8a2feffaedba510568e18eb740bcdda4f`
was mined at Base Sepolia block `48139912`. Independent finalized observation
matched the immutable payer, calldata, event and `100000`-unit amount and
advanced the order to READY. The explicit refund decision then retired the
ordinary payout job and set `REFUND_REQUIRED`. There is no COMMIT or Zcash
payout for this experiment.

The immutable cancellation timestamp is `1792056060`, corresponding to
**2026-10-15 16:21 WIB**. The canonical finalized chain timestamp must reach it
before refund preparation; wall-clock time alone is insufficient. The original
payer must call the refund. A fixed payer approval is bound privately, and the
full `100000` mockUSDC principal remains refundable without a gas deduction.
Payer-paid Base gas will be recorded separately. No refund signature or refund
broadcast is claimed at this checkpoint.

## Isolation and next evidence

Migration 0013 was applied transactionally to the two paused G5 branches after
the local refund checks passed. Existing migration hashes matched. Primary
remains at ten migrations and the completed G4 evidence branches were preserved.
The first G5 run's incident latch remains set; its capital cannot be assigned
to a new run until the liability is discharged and its allocation is explicitly
closed. These transactions and all approvals/journals remain outside public
intake. Full memos, viewing keys, raw receipts and private order mappings stay
outside Git.

Completion requires actual permanent Base cancellation and a shielded recipient
receipt for the late source, an actual finalized Base principal refund after
the reverse deadline, exact fee/ledger reconciliation, and paused closing
controls. Those results are pending.
