# Restricted native Linux worker transport

24 October 2026. Local boundary tests and deployment interfaces; no native payout,
refund, wallet transfer, VPS process start or customer settlement is claimed.

The new `linux_native_wallet.py` constructors bind the isolated relocated operator
profile and inherit the existing `Adapter.execute`/`Adapter.verify` financial
kernel. The refund constructor inherits `RefundAdapter.commitment`, retaining the
permanent finalized Base cancellation check. Legacy constructors still reject
the new `/opt` wallet path. No legacy wallet/profile guard was weakened.

`linux_operator_profile.py` checks the exact new application/chain/operator,
manifest and immutable file hashes, actual UFVK fingerprint, original application
opening binding, separate original Chef proof and operator-binding sidecar.
Native wallet paths must resolve to the new real directories, not symlinks into
old wallets. Runtime identity deliberately does not recheck the original mutable
wallet database hashes. Every native call validates reviewed script/artifact
hashes, original request bytes, per-order prepared configuration/state hash,
canonical preflight command, broadcast guard command and isolated HOME.

Both worker directions use the existing shared PostgreSQL advisory lock
`(84532, 20261023)`, the same operator Base journal and the existing native wallet
file lock. Node native calls use the existing owned Linux process-group supervisor
and require its positive cleanup ACK before financial locks may release. The only
supervisor change is adding `linux_native_wallet.py` to its explicit native script
allowlist. The Base reverse signer calls its read-only native receipt helper
directly inside the **outer Base supervisor's process group**. It does not nest a
second supervisor/session that could escape the outer cleanup boundary.

The new Node transport delegates transitions to `dispatchLiveReverseOnce` and
`dispatchLiveRefundOnce`. Existing SQL authority, source finality, signed-byte
journals, fee limits, lease/epoch checks, confirmed recipient/value recovery and
Base ACK checks remain in those kernels. Separate Linux broadcast guards repeat
the original raw transaction/approval/SQL identity checks and require the exact
recorded parent advisory-lock backend. Outgoing recovery remains explicitly
labelled custodial operator attestation; it does not request a recipient UFVK.

## Immutable profiles and mutable order approval

The root profiles are fixed at:

- `/opt/zeeswap-testnet/secrets/reverse-profile.private.json`, manifest pin
  `configPins.reverseProfile`.
- `/opt/zeeswap-testnet/secrets/refund-profile.private.json`, manifest pin
  `configPins.refundProfile`.

Both use `version: 1`, exact `mode` (`LINUX_TESTNET_REVERSE` or
`LINUX_TESTNET_REFUND`), `enabled`, `operatorProfile`, `python`, pinned `node` and
`signerConfig`, `handoffProof`, `protoDir`, `pollSeconds` (5 or 10), `maxCycles`
(1–1000) and `maxAmountZatoshi` (at most 200000; the initial circle uses 100000).
Python is `/opt/zeeswap-testnet/tools/python/bin/python`. Signer config paths are
the corresponding `reverse-signer.private.json` or `refund-signer.private.json`.
The protected root-owned relocation proof must match the profile and original
opening hash. HOME is `/opt/zeeswap-testnet/home`.

The `scripts` object pins these exact release files by path and SHA-256:

| Role | Relative to the reviewed release's `app/` directory |
| --- | --- |
| `native` | `workers/zcash-wallet/linux_native_wallet.py` |
| `profile` | `workers/zcash-wallet/linux_operator_profile.py` |
| `supervisor` | `workers/zcash-wallet/owned_wallet_call.py` |
| `preparedKernel` | `workers/zcash-wallet/prepared_raw.py` |
| `refundKernel` | `workers/zcash-wallet/refund_raw.py` |
| `outgoingKernel` | `workers/zcash-wallet/outgoing_recovery.py` |
| `preflight` | `workers/zcash-wallet/reverse_preflight.py` or `refund_preflight.py` |
| `guard` | `api/scripts/reverse-linux-broadcast-guard.ts` or `refund-linux-broadcast-guard.ts` |
| `baseSigner` | `workers/base-signer/reverse_signer.py` or `refund_signer.py` |

Do not append new capital sources to those pinned root profiles after customer
funding. Root instead writes a protected **root-owned** per-order file at
`state/reverse-orders/<order>/capital-approval.private.json` or
`state/refund-orders/<order>/capital-approval.private.json`. A service-readable
root/group mode 0640 is acceptable. It contains `version: 1`, exact `orderId`,
private `sourceFingerprint`, original `openingProofSha256` (the separate Chef
proof), and an explicit `sources` array. Source proof files must be under that
order's `proofs/` directory, with exact SHA-256 and provenance kind. The opening
source is always taken from the immutable manifest; it cannot be replaced here.

`approvedLiveReverseCapital` still checks each additional source against native
proof identity and SQL: settled primary incoming proceeds, confirmed own change,
or the refund's own eligible source after the refund-signing gate. Unsettled
liabilities and unknown notes remain excluded. This adds no ledger credit. Root
must review the first settled forward deposit before approving it as an input
alongside the opening note. The resulting native prepared config binds the exact
approval file hash and becomes immutable; subsequent file edits refuse.

Choose `enabled` during the reviewed prefunding manifest assembly. Later normal
financial authority comes from the SQL controls; worker profile edits after the
first customer order would invalidate the original relocation proof.

## Operator entrypoints

After reviewed package/profile installation, the manual bounded commands are:

```sh
node --import tsx api/scripts/reverse-linux-testnet.ts \
  /opt/zeeswap-testnet/secrets/reverse-profile.private.json \
  --once --order "$ORDER" --step COMMIT

node --import tsx api/scripts/refund-linux-testnet.ts \
  /opt/zeeswap-testnet/secrets/refund-profile.private.json \
  --once --order "$ORDER"
```

Reverse explicit steps are `COMMIT`, `APPROVE_NATIVE`, `NATIVE`, `ACK_BASE`,
`COMPLETE` and `WAIT_ORDER`; an explicit step requires `--once` and one UUID.
Same-byte retries require an explicit single order/step and an existing durable
attempt. Unknown/duplicate flags refuse before loading a profile or database.
Without `--once`, reviewed configuration bounds the number of cycles. No command
enables intake or dispatch. Refund remains an explicitly selected order workflow.

## Verification and pending gates

Local Node tests passed **3/3**, covering exact actor/nonce-journal/release scope,
per-order capital identity and proof scope, and strict financial CLI parsing.
Linux Python tests passed **6/6**, covering reverse/refund relocation constructors,
preserved kernel inheritance, old-wallet/arbitrary-command/user-key rejection,
legacy constructor refusal, actual pinned-file/symlink rejection, a consistently
repinned but different UFVK refusing the original opening identity, and an actual
supervised child refusal with positive
group cleanup ACK. That process test used an absent configuration, performed no
wallet/network/signing operation and is not a successful financial execution.

The coordinator still needs static API checking and broader kernel regressions
on the isolated VPS source, final unsigned private profile assembly, reviewed
operator-only handoff, actual capital conservation/unspent checks, full Chef
coverage recovery and a passing continuous freshness window. The initial funded
circle remains pending. Raw proof, approval and journal data stay outside Git.
