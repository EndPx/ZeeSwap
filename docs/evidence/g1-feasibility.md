# G1 evidence: five-step Zcash wallet experiment

Observed on **2026-10-13**, with the final network checkpoint at
**23:54:37 WIB / 16:54:37 UTC**. The five-step **CLI testnet experiment passed**.
This is not evidence of a working ZeeSwap cross-chain swap, deployed relayer,
browser-wallet integration, or production readiness.

## Results

| Requested step | Observed evidence | Outcome |
| --- | --- | --- |
| 1. Prepare wallets, toolchain, testnet and funds | WSL Ubuntu 24.04; Rust/Cargo 1.99.0; separate A/B/C wallets plus viewing-only B; faucet receipt decoded as 12,500,000 zatoshi | Passed for CLI wallets |
| 2. Send shielded payment with memo | A paid B 1,000,000 zatoshi (0.01 TAZ); transaction included at height 4,498,501 | Passed |
| 3. Read amount and memo with scanner | B's UFVK-only wallet decoded the exact amount and expected memo, output index 1; at least 11 confirmations before payout | Passed |
| 4. Send shielded payout | B paid independent-wallet C 500,000 zatoshi (0.005 TAZ); C independently decoded the amount and expected memo; 14 confirmations at final checkpoint | Passed |
| 5. Restart and rescan | New scanner process and then a fresh viewing-only wallet rescanned from birthday; same deposit identity, zero new observations; repeated payout command rejected before wallet invocation | Passed for this bounded experiment |

Each A/B/C wallet has a different recovery seed. They are independent wallets
using the same pinned implementation, not independent implementations.

## Public test transaction references

These references deliberately identify the dedicated demonstration transactions.
No viewing keys, recovery material or full private note listings are published.
An explorer link proves neither private recipient nor amount; the local wallet
receipts provided those checks.

| Transfer | Transaction | Mined height | Privately decoded amount |
| --- | --- | ---: | ---: |
| Faucet to A | [1fd26f4a…35c817b7](https://testnet.zecblock.com/tx/1fd26f4a45a8868b0008cf82e0e49a913a5c7f6f673f8d267b69d26e35c817b7) | 4,498,479 | 0.125 TAZ |
| A to B | [15670890…ec6af7b9](https://testnet.zecblock.com/tx/156708903609cbbabde0e10f03d372975b0438bd523ce455fff13d32ec6af7b9) | 4,498,501 | 0.01 TAZ |
| B to C | [4ccda169…c95ebe81](https://testnet.zecblock.com/tx/4ccda1690f2be064baceb50a84ffd193fe8b204365fc57eaf7ab4da1c95ebe81) | 4,498,517 | 0.005 TAZ |

The final network probe observed testnet tip **4,498,530**, hash
`00002a75894efaa6f77f0732e24e85ec03c30626c65428d041ecdc74f14dda67`.
The B-to-C transaction had **14 confirmations** at that observation. Confirmation
counts are snapshots, not immutable finality claims.

## Protocol and privacy checks

The live TLS endpoint `testnet.zec.rocks:443` returned `chainName=test`, consensus
branch **`77190ad9` (NU7)** and lightwallet protocol `v0.5.0`. Backends observed
behind the endpoint included Zakura 1.6.0 and Zebra 7.0.0-rc.0.

Both experiment payments were fetched as raw transactions and parsed by the
NU7-compatible SDK. The structural verifier confirmed for **each**:

- Expected txid and version V6 / branch NU7.
- **Zero transparent inputs and zero transparent outputs.**
- No Sprout, Sapling or Orchard bundle; an **Ironwood** bundle is present.
- Sapling and Orchard value balances are zero.
- Ironwood value balance is **10,000 zatoshi**, matching the transaction fee.
- No cross-pool principal movement in these two payments.

The receiver encoding reports an Orchard-family shielded receiver, but the actual
notes and V6 transaction bundles in this experiment are **Ironwood**. Pool claims
above come from decoded notes and parsed transactions, not the address prefix.

The scanner was initialized from the operator's UFVK, without a mnemonic/spending
key. An offline signing attempt failed with:

```text
Failed to construct sending transaction. No unified spending key found for this account. No spend capability
```

This establishes the wallet's viewing-only capability. It does not establish OS
isolation: both scanner and signer were operated under the same local WSL user.

The test used the explicit Zingo direct-network testing build over verified TLS.
It does not conceal the client's IP from the indexer or prove traffic-correlation
resistance. The eventual Base ERC-20 leg is also not private by default.

## Restart, rescan and accounting

The receipt checker uses `(txid, pool, output_index)` as the observation identity
and reads amounts from the decoded note, not from the memo. Its G1 threshold is
10 confirmations, checked against fresh public transaction observations.

| Check | New observations | Total observations |
| --- | ---: | ---: |
| First verified A-to-B receipt | 1 | 1 |
| Same receipt after scanner restart | 0 | 1 |
| Same receipt after fresh UFVK wallet rescan | 0 | 1 |

Full rescanning still identified the original received note after it had been
spent in B-to-C. `notes all` is required; unspent-note listings alone are not a
deposit history.

Each send wrote an exclusive, fsynced operation journal before broadcast. An
intentional repeat of `b-to-c` stopped with:

```text
Operation already recorded; refusing a second send. Reconcile the original.
```

This blocks repeated execution of the two fixed G1 operations. Crash recovery
during signing/broadcast, multiple workers, refund races and chain reorgs still
require the later production worker tests. No automatic memo-triggered payout
service was deployed in this experiment.

Final wallet synchronization found one confirmed, unspent shielded note in each:

| Wallet | Final zatoshi | Final TAZ |
| --- | ---: | ---: |
| A: sender | 11,490,000 | 0.1149 |
| B: operator | 490,000 | 0.0049 |
| C: recipient | 500,000 | 0.0050 |
| Total retained | **12,480,000** | **0.1248** |
| Two transfer fees | **20,000** | **0.0002** |
| Original funding | **12,500,000** | **0.1250** |

The conservation check passed exactly in integer zatoshis. The faucet paid its
own funding-transaction fee; that fee is outside the A/B/C experiment balance.

## Reproducibility and code validation

The [G1 tooling guide](../../workers/zcash-wallet/README.md) records pinned source
versions, build commands, runtime layout, receiver checks, sender caps and
reproduction commands. Sensitive runtime files stay in WSL or ignored local
directories.

Selected sources:

- zcash-devtool: `5a26ee854e634a4e88d1d79dab13f8fbb1eac6b8`.
- zingolib: `0243894aee9b615c091cf27499c58cdfe325d05f` plus the checked-in two-line
  CLI synchronization patch.
- zcash protocol SDK: `0.11.0-pre.0`; transaction primitives: `0.31.0-pre.1`.
- lightwalletd protobuf source: `d16d48124e9ad4157ebc2324b5090c6ba201470c`.

Built artifact SHA-256:

- `zingo-cli`: `04b9cb0d31c4273a598e7a79bbfbb17d33ebbd72b41974a5c0c5e320b9c74862`.
- `zeeswap-g1-verify`: `8e7329a52742b9320cd2e7f8417fc5eb21689ca4918cf4efd2cbdec84eb5bf88`.

Five local receipt-policy tests passed: confirmation boundary, amount mismatch,
ambiguous memo, change exclusion, and persistence/conflicting identity checks.
These tests supplement the live receipts; they are not a substitute for them.

## Remaining G1 and product work

The five requested **Zcash CLI steps** are complete. Before closing the broader
implementation-plan G1, validate the chosen end-user wallet/QR or extension
workflow, refresh Base RPC/finality preflight, and establish secure Neon access.
Production scanner/signer isolation and autonomous payout integration still need
implementation. No Base contract, mockUSDC deployment, cross-chain swap, or bridge
was claimed or tested by this experiment.
