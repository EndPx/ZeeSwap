# Reverse settlement integration

The implemented operator flow is **Base mockUSDC escrow → shielded TAZ payout**. The deployed
Base contract already supports funding, a payout commitment and settlement.
One bounded public-testnet order passed the signer, original-transaction recovery,
independent recipient receipt and final accounting checks; see
[the actual reverse evidence](evidence/g4-live-reverse.md). The public reverse
quote route remains closed pending service and end-user integration gates.

## Required sequence

1. Validate the shielded destination and reserve operator-owned TAZ principal,
   the Zcash transaction fee and Base execution/refund gas. Customer-held notes
   and unreconciled proceeds from the forward experiment are not capital.
2. Bind a signed funding authorization to the accepted order's token, payer,
   refund recipient, exact amount, nonce, funding cutoff and cancellation time.
   Keep the shielded destination and private order mapping off Base.
3. Observe a successful canonical, finalized `Funded` receipt from the configured
   contract. Match its transaction, event and escrow record to the immutable
   authorization; a direct ERC-20 transfer does not fund an order.
4. Journal and broadcast `commitPayout`. Wait for the canonical receipt to be
   finalized and re-read the escrow as `PAYOUT_COMMITTED`. Only that branch
   exclusion may authorize preparation of the shielded payout.
5. Persist the Zcash signing intent, selected notes, signed transaction identity
   and recoverable bytes before broadcasting. A timeout requires reconciliation
   of the original transaction; it does not authorize a fresh payment.
6. Independently decode the destination receipt, enforce the shielded-only
   structure and exact quoted amount, and wait for ten canonical confirmations.
7. Acknowledge delivery with `settleEscrow`, await its finalized receipt, and
   reconcile both chains' fees, liabilities and inventory before reporting
   `SETTLED`.

## Current boundaries

The first reverse implementation checkpoint concentrates on escrow/finality
validation and the checks required before Zcash signing. Its local integration
evidence is separate from the [completed forward public-testnet run](evidence/g4-live-forward.md).
See [reverse preflight evidence](evidence/g4-reverse-preflight.md) for the
Anvil/Neon and Python test results and the retained-fixture limitation.
Passing the commitment checks is not evidence that a Zcash payment was signed,
broadcast or received.

The pinned SDK now has a reproducible prepared-transaction export patch and a
durable operator adapter. It preserves signed bytes before broadcast, recovers
the original transaction, authenticates internal change and verifies recipient
delivery independently. The concrete operator sequence includes a fresh database
broadcast guard and a separate Base acknowledgement signer. See the
[recovery checkpoint](evidence/g4-reverse-recovery.md) and
[wallet module](../workers/zcash-wallet/README.md). Compiled code and synthetic
recovery tests remain distinct from funded public-testnet execution.

The first funded SDK export omitted internal change. The corrected exporter
includes the same transaction's authenticated internal incoming note and output
index. Recovery preserved the original signed bytes, which later confirmed as
the exact recipient payout. No replacement payment was calculated.

The deployed contract has no abort/refund transition from `PAYOUT_COMMITTED`.
A failed or ambiguous Zcash payout after commitment therefore remains an
operator recovery obligation. It must not be labelled refunded, expired or
settled solely because a timeout elapsed.

The primary and existing real-evidence branches remain paused. This work does
not enable a public reverse endpoint or a continuous operator service.
