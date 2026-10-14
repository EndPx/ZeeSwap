# G4 first reverse public-testnet settlement

Run dates: 2026-10-14–15 (Asia/Jakarta).

**Passed for one bounded reverse order:** the independent shielded recipient
received the exact payout, the Base acknowledgement is canonical and finalized,
the private order is `SETTLED`, and the final read-only verifier returned
`verified: true`. Together with the [forward report](g4-live-forward.md), this
establishes one actual operator-driven swap in each direction.

The bounded order exchanges **0.1 mockUSDC on Base Sepolia for 0.001 shielded
TAZ on Zcash testnet**. It uses the labelled fixture rate of 1 TAZ = 100 mockUSDC,
zero protocol fee, and separate payer, operator-capital and recipient wallets.
mockUSDC is project-owned, has no economic value or USD backing and is not Circle
USDC. The operator supplies capital and attests Zcash delivery.

## Transaction evidence

| Step | Transaction | Included height | Amount or outcome |
| --- | --- | --- | --- |
| Source escrow funding | [0x633641ac…fa9824](https://sepolia.basescan.org/tx/0x633641ac3a5d131f53405e7926d4721bf68c2536b8b86c437409973444fa9824) | Base 48,101,971 | 100,000 mock units = 0.1 mockUSDC |
| Finalized payout commitment | [0xdf64ba61…93eebb](https://sepolia.basescan.org/tx/0xdf64ba61ca624d562a865739949e14665fcb23fee1f22adb5e8a53def393eebb) | Base 48,102,681 | `PAYOUT_COMMITTED`, observed finalized before Zcash signing |
| Shielded recipient delivery | [35289d89…2877ab](https://testnet.zecblock.com/tx/35289d8965f6e87a1ba1cba65a11ae47866202dd0b9bd8f8a0a9556cff2877ab) | Zcash 4,501,153 | 100,000 zatoshi = 0.001 TAZ |
| Base acknowledgement | [0xbe57dde2…9412a32](https://sepolia.basescan.org/tx/0xbe57dde2c4008fe1cf4aa68982d178b661a8d10dcf5cf0d4c5abbdc109412a32) | Base 48,118,061 | Successful `settleEscrow` receipt |

The source was included strictly before its quoted funding cutoff. The finalized
COMMIT and finalized `PAYOUT_COMMITTED` state were checked before calculation.
Zcash inclusion at 4,501,153 preceded the original transaction expiry of
4,501,229. The final read-only verification observed **1,200 confirmations**, well
above the ten-confirmation prototype policy. SETTLE was signed and broadcast
only after a fresh independent receipt returned `ZCASH_DELIVERY_FINALIZED`.

The NU7 V6 payout is **Ironwood-only, with zero transparent inputs and outputs**.
The pinned Rust parser verifies its txid, expiry and 10,000-zatoshi fee-only value
balance. The viewing-key adapter independently fetches the raw bytes, checks
canonical compact-block membership/mined height and decrypts the recipient note.
These RPC/SDK results establish the proof; explorer links are navigation aids.

## Actual recovery and note accounting

The first SDK export omitted authenticated internal change from its outgoing
list. The adapter rejected incomplete conservation before broadcast and retained
its signing intent. After the export correction, `calculate --recover` recovered
the original transaction. No second proposal or replacement payment was created.

Original and recovered 9,166-byte transaction payloads share SHA-256
`8e7c96c6c917adc4a7e7972169c294322a903a3ea1244eac15b4de852bfa0ca7`.
The recovered output identities are index 1 for the 100,000-zatoshi recipient
and index 0 for the 90,000-zatoshi internal change. The SDK obtains change from
its decrypted internal note, not an inferred subtraction. Exact conservation:

```text
200,000 input = 100,000 recipient + 90,000 authenticated change + 10,000 fee
```

The separate recipient SDK wallet increased from **500,000 to 600,000 confirmed
zatoshi**. Its note list contains exactly the new 100,000-zatoshi payout note and
its older 500,000-zatoshi note. The capital wallet independently shows the
original funding note spent in this txid and **90,000 confirmed unspent change**.
The new wallet was isolated from the operator's older customer-held and
unreconciled Zcash receipts, with one explicitly approved capital note.

## Fees and capital

| Item | Atomic value |
| --- | --- |
| Operator opening TAZ principal / fee reserve | 190,000 / 10,000 zatoshi |
| Actual Zcash payout fee | 10,000 zatoshi |
| COMMIT gas used / gas price / L1 fee | 37,486 / 20,000,000 wei / 261 wei |
| Actual COMMIT fee | 749,720,000,261 wei |
| SETTLE gas used / gas price / L1 fee | 41,021 / 20,000,000 wei / 750 wei |
| Actual SETTLE fee | 820,420,000,750 wei |
| Total runtime operator Base fees | 1,570,140,001,011 wei = 0.000001570140001011 test ETH |
| Source payer's escrow-funding fee | 4,262,140,000,252 wei, including L1 fee |

The source payer separately pays funding/approval gas. The runtime operator's
fees above do not include setup gas or the payer's costs. Existing 0.1 mockUSDC
from the forward demonstration funded this escrow; no additional token mint was
used. Contract inventory increased from 9,900,000 to **10,000,000 mock units**
after finalized acknowledgement. Token supply remained 10,000,000 units.

Explicit setup receipts:

- Capital-wallet funding: [200,000 shielded zatoshi](https://testnet.zecblock.com/tx/f43aec208cf4368cccd647f9a4a77e7b4de18345aa0dc44349608a254ce18357), at height 4,500,919 with a 10,000-zatoshi setup fee.
- Payer gas funding: [0.0001 test ETH](https://sepolia.basescan.org/tx/0xc7764a2efd4e0ddf0182fb86943994164e759f3982098e5bfd0cb9589034a287).
- Payer approval: [exactly 100,000 mockUSDC units](https://sepolia.basescan.org/tx/0xd56402a91f141d9afea50f25eb267082ba9399a4c200c83d09ec5493bbf74ad7).

## Final reconciliation

The final read-only verifier passed against finalized Base block **48,118,248**.
It matched the canonical source, COMMIT and SETTLE receipts, both independent
signer journals, the original raw payout, and the recipient's actual note lists.

| Final invariant | Verified result |
| --- | --- |
| Quotes / orders / source deposits / payout operations | Exactly one of each |
| Order / payout operation / source obligation | `SETTLED` / `CONFIRMED` / `DISCHARGED` |
| Outbox job | `DONE` |
| Open reservations | 0; all three released |
| Ledger sums | Balanced per asset and event |
| Payer mockUSDC balance | 100,000 → 0 units |
| Contract inventory | 9,900,000 → 10,000,000 mock units |
| Contract escrow liability | 0 |
| Operator ETH | 994,736,099,999,518 → 993,165,959,998,507 wei |
| TAZ principal / fee account | 90,000 / 0 zatoshi |
| Source proceeds | 100,000 mock units in `operator:unreconciled` |
| Runtime controls | Acceptance and dispatch disabled |

The physical source proceeds released by `settleEscrow` are separately recorded
as unreconciled capital in Neon. They are not silently credited into spendable
database inventory. The older real-intake and forward evidence remain separate.

The operator runs:

```sh
pnpm --filter @zeeswap/api exec tsx scripts/verify-live-reverse.ts PRIVATE_OPERATOR_CONFIG
```

The first verifier invocation exposed a versioned encryption-context mismatch:
its deposit read omitted the `:v1` suffix used by the repository. The correction
restores the same authenticated context without weakening any receipt or
identity check. Its rerun passed. Failure diagnostics contain only allowlisted
exception classes and source locations in an ignored private file.

The verifier requires a private independent recipient note capture and a
canonical pre-funding Base baseline. It takes a read-only database snapshot,
then separately checks network receipts and both signer journals. Its Python
companion only creates an ephemeral private parser input; it does not change
wallets or signing journals.

## Verification and remaining scope

Implementation/review used Sol 6.1 subagents. The guarded operator/raw-recovery
code is published in the [recovery checkpoint](g4-reverse-recovery.md). The final
corrected code passed 17 API unit tests, 40 wallet Python tests, five Base signer
tests, four read-only verifier negatives, TypeScript typecheck and the 14-case
Anvil/Neon integration suite. Disposable test databases were removed; historical
fixtures were preserved. Those synthetic destination tests are separate from
the actual testnet receipts above.

Publication review passed staged diff validation and a targeted scan of 130
public files with no configured-credential or checked secret-pattern matches.
Migration bytes matched the applied working files. This is a targeted check,
not a comprehensive security audit. Private successful verification output and
diagnostics remain ignored by Git; no test payment was resent for publication.

The selected primary was independently checked after execution: ten migrations,
18 tables and two views, zero quotes/orders/deposits/operations/jobs and zero
nonzero inventory accounts. Acceptance/dispatch remain disabled and primary
reconciliation is required. The reverse evidence branch retains its one settled
order with acceptance and dispatch disabled. No continuous service was started.

Base finality was verified through the explicitly selected PublicNode endpoint
after cross-provider block/receipt/code identity checks documented in the
recovery checkpoint. The selected policy remained canonical finalized receipts.
Zcash lightwalletd and the Base RPC remain trusted provider dependencies.

Published paired hashes, amounts and note indices deliberately disclose this
dedicated demonstration's route. Shielded receivers, memos, private order IDs,
capabilities, keys, raw receipts/transaction payloads, wallet stores and journals
remain outside Git. The operator can associate both legs. The proof concerns
shielded Zcash settlement and does not establish end-to-end anonymity, atomic
execution or trustless custody.

The public reverse HTTP route and primary intake remain closed. Broader
crash/restore/soak, live refunds, end-user wallet/UI integration, the two-direction
backed-token bridge, demo video and submission remain open.
