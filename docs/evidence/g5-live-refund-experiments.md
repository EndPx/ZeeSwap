# G5 funded refund experiments and first-run incident

Date: 2026-10-15 (Asia/Jakarta). Latest verification: after confirmed shielded refund and allocation release.
Recovery implementation revisions: `db0b5b4` and `17ba4cd`.

Both source refunds are finalized and reconciled. The late shielded source was
returned using its original SDK transaction after the zero-change validator fix.
Its full principal is independently received, its liability is discharged, and
the first run capital allocation was explicitly released with balanced entries.
Neither experiment counts as a completed swap; the twenty-swap soak remains
**0/20** at this checkpoint.

## Late shielded source

The first G5 forward order had source cutoff height `4504010`. Its payment
`7e629b91c75bb13c1c063d2f9eb941aaaaf437da9410b6f0498cb25aee37eb37`
was mined at `4504016`, six blocks beyond the accepted cutoff. The observer
correctly recorded LATE and REFUND_REQUIRED, retaining the full
`100000`-zatoshi refund obligation. There was no Base payout attempt.

The operator first declined funding with a three-block safety margin, then
proceeded using only a before-cutoff check. That check was insufficient for
wallet processing and inclusion latency. The cutoff remains unchanged. Future
funding must synchronize the source wallet before quote creation, preserve a
larger height margin, and fund promptly. This incident is not a successful swap.

The source raw transaction passed the strict structural parser: Ironwood-only,
`10000`-zatoshi actual fee, zero transparent inputs and outputs. An additional
operator-owned `10000`-zatoshi fee note was funded explicitly by transaction
`01054412a278b824de5326890da14d6c0bdd00d9b548d3150fdd105dac3d1602`.
Both incoming notes were independently decrypted with at least ten canonical
confirmations: customer principal `100000`, operator fee capital `10000`.
The fee note was credited once through two balanced capital entries and was
not ingested as another customer deposit.

The original source order and incident manifest remain intact. Ordinary jobs
were retired and intake/dispatch remain disabled. The refund recipient belongs
to the original sender wallet; its viewing key remains private. The independently
synchronized recipient balance before refund was `8465000` zatoshi.

### Permanent Base cancellation passed

The first restricted signer preparation stopped before signing because the
installed cast returned versioned JSON while the parser expected a direct block.
The compatibility correction and ten signer tests passed before another
preparation was attempted. Frozen-incident recovery separately binds the exact
original run, order, owner, liability, refund approval and current operation epoch.

The original restricted cancellation transaction was signed, stored in the
independent signer journal and encrypted database record, then broadcast:

| Field | Verified value |
| --- | --- |
| Base cancellation | `0xe2df934a921320b3c67f090747097decc2556c4b3eca6a861770fe3180223358` |
| Included block | `48144600` |
| Block hash | `0x8b8600ab44d037f9bdf1efeb8899633a81a8a6cc21a633f8cd634f9157816c70` |
| Receipt | Successful, canonical and finalized |
| Terminal contract state | CANCELLED |
| Actual operator Base fee | `1006340000095` wei, including `95` wei L1 fee |

Both configured HTTPS Base RPCs agreed on finalized block `48144712`, above
the cancellation. The receipt verification also checked original operator,
contract, exact cancellation calldata, event and permanent terminal state.
A finalized cancellation permits the refund path; it does not prove a Zcash
recipient has received funds.

### Initial zero-change failure and original-byte recovery

The pinned SDK calculated and durably saved the original refund. Independent
Python validation parsed its signed bytes, selected notes and recipient
ciphertext. Its exact amounts are:

| Item | Zatoshi |
| --- | ---: |
| Selected customer principal | 100000 |
| Selected operator fee note | 10000 |
| Approved shielded recipient output | 100000 |
| SDK own-change output | 0 |
| Network fee | 10000 |

The previous TypeScript validator required every output amount to be positive,
including own change. It rejected this authenticated zero own-change output with
INVALID_PREPARED_ZCASH_PAYOUT. The coordinator reproduced the rejection using
the actual private prepared transaction. An original-byte recovery attempt
reproduced the same rejection; it did not calculate a replacement transaction.

At that initial failure the SDK journal remained PREPARED. No refund payload was stored in the
application database and no refund broadcast was attempted. At the checkpoint,
the original txid lookup returned NOT_FOUND; this is not cancellation or expiry
proof. Signed bytes, expiry, approval and wallet state are retained privately.
The correction in `0544144` allows canonical zero only for authenticated own change,
preserves positive recipient amounts, exact conservation and output indices,
and permitted recovery of the original transaction. Outputs were retained and
no replacement payment was calculated. Fresh canonical cancellation, expiry and
original raw-byte checks passed before broadcast.

The original shielded refund then succeeded:

| Field | Verified value |
| --- | --- |
| Shielded refund | `8ffeefcfd17dc9c43a0accabe800d3f9291e249aed582c85a71baaabdc0ea71b` |
| Included height | `4504483` |
| Canonical block hash | `00001c11f9a2e6882be9f6e660955464033defa9cfbac73d1e7405c686fac7be` |
| Independent receipt checkpoint | Height `4504498`, 16 confirmations |
| Full recipient principal | `100000` zatoshi |
| Separate operator network fee | `10000` zatoshi |
| Sender-wallet balance before / after | `8465000` / `8565000` zatoshi |
| Application state | REFUNDED |

The receipt checked original signed bytes, canonical membership and incoming
recipient decryption. The full balance increase is exactly `100000` zatoshi.
The first run then had zero open liabilities and reservations. Four original
inventory accounts were released to zero through eight balanced capital
withdrawal entries; no ledger history was deleted. Intake and dispatch stayed
disabled, reconciliation was enabled and the original incident manifest stayed
frozen. This prevents simultaneous allocation of the same reverse capital to
the first run and its retry.

## Funded reverse refund passed

A separate branch, `br-weathered-cell-aogn8u34`
(`zeeswap-g5-live-refunds`), preserves this experiment independently. Its quote
was backed by an independently decrypted `110000`-zatoshi capital note:
`100000` principal plus `10000` fee capacity. The source user's explicit
`100000`-unit mockUSDC setup mint was
`0xcbc0be5370498fabd0bcaa47909c8991cb55ff44ad44a5d8b9f3d88d5cca1d6f`;
its exact approval was
`0x83ffc09d04ee5e30093e0a7ee7e8d2dea84ea2d0a9786afa110b6e0dd99a890a`.

Source funding
`0xe19d3ec08f5df45c97e04487d70bf4b8a2feffaedba510568e18eb740bcdda4f`
was mined at Base block `48139912`. Independent finalized observation checked
the payer, calldata, event and `100000`-unit amount. The explicit refund decision
retired its ordinary payout job. There was no COMMIT or Zcash payout.

The immutable cancellation timestamp was `1792056060`, or 16:21 WIB. Both the
restricted signer and application checked the finalized canonical chain timestamp
against this deadline before refund preparation. The original payer signed and
submitted the original refund transaction:

| Field | Verified value |
| --- | --- |
| Base principal refund | `0x92095d69dab069a52bbc8edf377edbfa3c56091d21a8d3f40dc5a3ae23b1d09e` |
| Included block | `48144620` |
| Block hash | `0x550c4b1350d5c69fee7197bcc8793f1e1a6781e5c29f6911195e0687434970c8` |
| Receipt | Successful, canonical and finalized |
| Principal returned | `100000` mock units = `0.1 mockUSDC` |
| Refund destination | Original immutable payer/refund recipient |
| Caller-paid Base fee | `1208400000095` wei, including `95` wei L1 fee |
| Application state | REFUNDED |
| Open obligations / reservations | 0 / 0 |
| Unbalanced ledger events | 0 |

Verification checked exact refund calldata, Refunded event, recipient, amount,
terminal escrow state and canonical finality. The fee was recorded separately;
it was not deducted from principal or charged to operator ETH inventory.
Operator accounts retain `100000` TAZ principal, `10000` TAZ fee and
`100000000000000` wei Base fee capacity, all with zero reserved amount.

At finalized block `48144712`, aggregate contract escrow was zero, contract
inventory remained `10000000` mock units and payer balance was `1100000` units.
That payer balance includes the separate `1000000`-unit setup fixture for the
future soak. It is not operator liquidity or another completed swap.

## Verification and remaining gates

Coordinator checks passed: TypeScript typecheck; 17 API unit tests; 38 DB/HTTP
integration tests; 15 Anvil settlement tests; 49 wallet tests; 10 refund-signer
tests; 8 incident/refund API tests; and 6 disposable-database refund cases.
These local checks are distinct from the public-testnet receipts above.
All disposable settlement databases were removed; the historical neondb remained.

Both experiments end with acceptance and dispatch disabled. The fresh retry
branch still has zero orders and zero inventory accounts, with reconciliation
required. The first run remains frozen with its refund liability discharged and capital
allocation released. Fresh retry capitalization requires its own independent
physical proof and baseline. Primary and completed
G4 experiments were not activated by this work.

The funded SDK process-kill test and twenty alternating swaps remain incomplete. Batch-runner work is also incomplete: physical capture still
needs the additional fee-wallet proof, dedicated batch/targeted-claim/nonce tests,
and the separately bounded user-source actor. Those edits remain unpublished
and the runner has not been started. Coding remains assigned to Sol 6.1 as the
user requested; its tool reported a usage limit until approximately 18:50 WIB.
Full memos, addresses, viewing keys, raw receipts, signed transaction bytes and
private order mappings stay outside Git.
