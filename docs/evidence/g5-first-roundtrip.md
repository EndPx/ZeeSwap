# G5 first same-user roundtrip

Date: 2026-10-15 (Asia/Jakarta). Networks: Zcash testnet and Base Sepolia.

Status: **one real same-user roundtrip passed**. Both private orders are SETTLED,
both original receipt paths passed fresh verification, and the complete
twelve-wallet/accounting checkpoint returned G5_ROUNDTRIP_CHECKPOINT with zero
unexplained deficits. This establishes two settled orders within the still-open
twenty-order G5 run; no five-order batch barrier was advanced.

This bounded experiment uses one test user's shielded source wallet and one
Base account. The reverse recipient is the original shielded source receiver,
verified through the source wallet's viewing identity and the immutable run
configuration. Actual user fixtures remain separate from operator capital.
Pricing is the explicitly labelled test fixture: `100000` zatoshi for `100000`
atomic mockUSDC units. Neither asset has production value in this experiment.

## Confirmed forward leg

The user paid `100000` zatoshi plus a separate `10000`-zatoshi Zcash network
fee. Source transaction
`7f25606d21338acfb87fd8d42b708dfbca53c82b10cbebe8ba9c719bbeb44ba3`
was included at height `4504570`, before the immutable funding cutoff `4504577`.
The structural verifier found V6/Nu7, no transparent inputs or outputs and an
Ironwood-only transaction. The viewing scanner authenticated the incoming note.

The original Base RESERVE transaction was
`0x06659604a3b21255b97c1ac2a723c29a25be8ecb394a6b4163e9c12eaceb0c1b`
at block `48147097`. The PAY transaction was
`0x533641cb3b19d9e07fe51e93110153434341d541fa581788081e2e575791bbaa`
at block `48147852`. Both canonical successful receipts passed the finalized
policy. Their combined operator fee was `4921900000549` wei, including L1 fees.
The Base user's mockUSDC balance increased from `1100000` to `1200000` units.
The private order is SETTLED and its independent receipt verification passed.

## Reverse leg and recovery boundary

The same Base user funded exactly `100000` mockUSDC units through the original
escrow authorization. Transaction
`0xdbc28d2a096aebb01821339a79189697ef520282ad7ddca61d64f8868a780587`
was included at block `48148744`, inside the accepted funding window. Its
`4453660000243`-wei network fee was paid by the user, separately from operator
capital. The successful canonical receipt is finalized.

The operator's original COMMIT transaction was
`0x2e3cab62d0d415257c5b9b2109899040163055cdf8a0be5be37028ec64c26204`
at block `48149364`, with a `749480000092`-wei fee. Its finalized receipt and
onchain PAYOUT_COMMITTED state were verified. A subsequent fresh approval
observation temporarily returned AWAITING_BASE_FINALITY; the former operator
wrapper treated that waiting result as an incident before creating any shielded
approval, calculation or signing intent.

The reviewed pre-signing recovery passed on the actual run. It independently
rechecked original source and payout receipts, both global raw journals, exact
held obligations/reservations, the retired job fence, twelve physical wallets
and the absence of SDK calculations. It preserved reconciliation epoch `3`
and all original transactions. Public intake and dispatch remained paused.
The normal approval path now returns a soft wait only for that exact pending
status; contradictions still fail closed. See [the recovery checks](g5-batch-operator.md).

The original shielded payout
`dec9808a44095353583af69b6c484240ccd9f1efcfb7591a80bf2e24a5fd8675`
was included at height `4504894`. Its raw SHA-256 is
`b78dfea4c5efd6d609f3a339260e4fb8da885281e0ac75ae53bbf6806e3b72b5`.
Canonical block membership and equality to the retained raw bytes passed.
Independent incoming-key decryption found exactly one matching Ironwood note
of `100000` zatoshi. Structural verification passed: no transparent inputs or
outputs, fee `10000` zatoshi, and authenticated zero-valued internal change.
No replacement transaction was calculated or sent.

The production verifier subsequently returned ZCASH_DELIVERY_FINALIZED after
the payout exceeded ten confirmations. The actual original user wallet was
also synchronized: its viewing identity matched the pinned reverse recipient,
it owned the original refund receiver, and it contained exactly one matching
incoming payout note with an unspent total of `100000` zatoshi. A separate
finalized Base balance read found `1100000` mockUSDC units, allowance `900000`
and `187313709998849` wei. The gas decrease from the initial
`191767369999092` wei equals the user's original funding fee exactly.

After fresh independent delivery checks, original SETTLE transaction
`0x602af4df3d5a5cacc7f10c334021a5635ebb3bc1aa6e57292c45ad082ab88725`
was signed with operator nonce `8` and successfully included at Base block
`48150800`. Its fee is `820180000161` wei, including L1 fee. Canonical membership
and finality passed at finalized head `48150880`. The production observer
freshly reverified the shielded delivery before returning SETTLED.

## Completed verification and closing reconciliation

A subsequent verification invocation encountered a reconciliation flag while
both orders remained SETTLED. Read-only inspection confirmed exact closing
books, discharged liabilities and no deposit-reorg event. Mixing a network-tip
checkpoint with a slightly lagging source-wallet scan is a plausible explanation;
the intermediate triggering snapshot was not retained, so the precise cause
is unproven. It is not evidence of an actual deposit reorg.

Completed-order verification now obtains fresh canonical source/recipient and
Base proofs without invoking observer ingestion or rewriting checkpoints.
Admission, dispatch and writer reorg guards remain unchanged. The separately
reviewed completed-first-circle recovery rechecked all original journals,
nonces, receipts, twelve physical wallets and exact closing accounting before
clearing the incident under the unchanged epoch `5`. It made no payment,
signature or replacement transaction. Both normal order-verification commands
then passed. The ordinary roundtrip checkpoint subsequently passed, preserving
zero batch barriers and reporting G5 incomplete.

The final independent user-wallet scan found one matching `100000`-zatoshi
incoming note with **98 confirmations** and no unspent transparent coins.
The zero-valued internal note from the first source transaction was separately
authenticated against that original canonical raw transaction and its internal
viewing identity. Unknown zeros were not discarded by a balance helper.

| Closing check | Observed result |
| --- | ---: |
| User shielded balance, starting at `110000` zatoshi | `100000` zatoshi; the difference is the first source network fee |
| User Base mockUSDC balance | `1100000` units, unchanged across the circle |
| User Base gas cost | `4453660000243` wei |
| SETTLED orders / confirmed operations / completed jobs | `2 / 2 / 2` |
| Open customer obligations / unreleased reservations | `0 / 0` |
| mockUSDC principal book | `900000` units |
| TAZ principal / fee books | `900000 / 120000` zatoshi |
| Base fee book | `293508439999198` wei |
| Actual total operator Base execution fees | `6491560000802` wei |
| Unreconciled source proceeds | `100000` zatoshi and `100000` mockUSDC units |
| Global contract inventory / available inventory / token balance | `10000000` units each |
| Global contract escrow liability | `0` |
| Allocated physical operator TAZ, excluding source proceeds | `1020000` zatoshi |
| Deposit-wallet TAZ source proceeds, separate from spendable capital | `100000` zatoshi |
| Unbalanced ledger groups / unexplained deficits | `0 / 0` |

The nine unused reverse wallets each retain `110000` zatoshi; the separate fee
wallet retains `30000`. Received source proceeds are not automatically recycled
into available capital. Fresh operator and payer next-nonce reads were `9` and
`7`, respectively, with no extra funding, runtime mint or replacement payout.
Acceptance and dispatch remain false; reconciliation and the local incident
are false after the reviewed recovery. The primary service remains paused.

Validation for these changes: **38 TypeScript checks** across the API, G5,
approval and recovery suites, **7 Linux physical-capture checks**, API typecheck
and diff checks passed. The actual recovery, both normal receipt verifiers,
the twelve-wallet checkpoint and the independent closing SQL/chain/wallet
observations passed separately from those local tests.

Publication review covered 198 staged public files. The targeted scan found no
matches for configured credentials or the checked secret patterns, and staged
migration bytes matched the applied working files. This is a bounded publication
check, not a comprehensive security audit.

This experiment does not complete the twenty-order G5 soak, its four batch
barriers, the remaining funded crash/reorg matrix, end-user wallet/UI integration,
the two-direction backed-token bridge, or public service activation. Primary
intake remains paused. Raw receipts, keys, viewing keys, full memos, wallet
databases and private order mappings remain outside Git. The transaction IDs
above are deliberate disclosure of designated test-wallet demonstrations.
