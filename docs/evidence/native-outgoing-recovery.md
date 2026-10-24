# Native operator outgoing recovery

Recorded 23 October 2026. This adds an explicit custodial operator attestation
mode for payouts to arbitrary shielded testnet recipients. It requires no user
viewing key. The previous controlled-recipient incoming-decryption mode remains
the default and retains its existing receipt checks.

The pinned maintained SDK `zcash_client_backend = 0.25.0-pre.1` already attempts
outgoing viewing key recovery in `decrypt_transaction`. Its `TransferType::Outgoing`
identifies an external recovered output; `TransferType::AccountInternal` identifies
incoming-internal change. The new native `recover_outgoing` pipe command exposes
only those categories, after full raw parsing, recomputed txid, complete byte
consumption and NU7 branch checks. It labels the result
`attestationMode: operator-outgoing-recovery`.

The new `outgoing_recovery.py` validator requires exactly one recovered external
output with the quoted canonical shielded recipient and exact amount. Every
recovered output must match the prepared transaction's actual output index,
canonical receiver, exact amount and change category. Internal change is accepted
only with the native SDK's `AccountInternal` category. Selected input value must
equal all actual recovered output values plus the exact **10000-zatoshi** fee.
Missing, duplicated, unknown, additional or changed outputs refuse verification.

`prepared_raw.py` enables this path only with explicit private
`recipientProofMode: operator-outgoing-recovery`, the fresh live operator wallet,
and an operator UFVK file matching its pinned capital-key digest. Supplying a
recipient UFVK in this mode refuses the mixed authority configuration. Unknown
modes refuse. The old mode continues to require its recipient viewing key.

Recovery and broadcast still reparse the original journaled transaction; the
existing immutable order approval, selected capital, finalized Base commitment,
durable signing/broadcast journals and before-broadcast fence remain in place.
The mined receipt still requires the exact prepared raw bytes, canonical compact
inclusion, ten confirmations and a final block-hash recheck. In the new mode it
repeats native outgoing recovery at the mined height and labels the persisted
receipt with the operator attestation mode. This attests encrypted payment output
creation and canonical inclusion; it is not evidence that the user's wallet has
synchronized or that the user has acknowledged receipt.

## Actual historical validation

Only the new copy of the closed G4 capital wallet was used to export a protected
UFVK. Original G4/G5 wallet stores were not opened for mutation. Against the
actual previously mined G4 payout bytes, the new command recovered:

- One external output of **100000 zatoshi** to the exact privately approved
  canonical recipient.
- One authenticated internal change output of **90000 zatoshi**.
- Exact conservation: **200000 input = 100000 payment + 90000 change + 10000 fee**.

The recovered payment identity and amount matched the existing independently
confirmed controlled-recipient G4 receipt. The new recovery check did not use the
recipient UFVK. Raw bytes, recipient, keys and comparison artifacts remain private.
This is historical validation of the new verification method, not a new payout.

Verification: the locked native reader build passed; **17 existing prepared-raw
tests passed on Linux**; **four new outgoing recovery tests passed**. The new tests
cover wrong recipient/amount/txid/pool/privacy, missing or duplicate outputs,
incorrect native categories, changed own-change data, fee/conservation mismatch,
mixed proof modes and wrong operator key digest. A Windows invocation of the
Linux-only prepared-raw suite could not import `fcntl`; rerunning that suite in
the required Linux environment passed.

The broader prepared/refund raw regression selection subsequently passed **26/26**
on Linux, alongside the **4/4** outgoing tests. The final built native reader
SHA-256 is
`1df0108d0d1b3cf4b42cfb4e8fcf2fe91965c7afffa439a433a490e1adc2dfba`.
Earlier evidence records the prior reader artifact before this additive command.

No new payment was proposed, signed, shielded or broadcast during this work.
Future proving must use `RAYON_NUM_THREADS=2` and the parent's reviewed financial
request. The first new live payout still requires its own prepared and mined proof.
