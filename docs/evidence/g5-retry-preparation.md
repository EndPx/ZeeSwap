# G5 retry preparation and independent source wallets

Date: 2026-10-15 (Asia/Jakarta). Starting revision:
`92dd96e8da1f96e64ec63a985d85d95e2c6c7e2f`.

A fresh retry environment preserves the first run's late-source incident.
Preparation is verified, but retry order execution and capitalization have not
started. The original refund liabilities remain separate requirements.

## Database and wallet preparation

Branch `zeeswap-g5-soak-retry` (`br-twilight-heart-ao6cx6pg`) was created from
the empty paused primary. Its endpoint is
`ep-aged-shadow-aojcoa3q.c-2.ap-southeast-1.aws.neon.tech`. All thirteen tested
migrations were verified/applied through its direct connection. Checks found
zero orders and inventory accounts, disabled acceptance/dispatch, and required
reconciliation. Private application keys were generated separately.

Ten independent test-user source wallets each received one `110000`-zatoshi
note, covering a `100000`-zatoshi source payment and its `10000` network fee.
A separate operator fee wallet received `30000` zatoshi. Setup transaction
`40fc99f8e558506a4da0b80e26ec9791231ceb88d69ded24131d516064e96d65`
was mined at height `4504126` and had nineteen confirmations at capture. All
eleven distinct notes were checked through synchronized wallets and independently
decrypted with the matching UFVK: exact recipient, amount, identity and shielded
source matched.

The setup transaction has zero transparent inputs/outputs and an Ironwood value
balance of `60000` zatoshi. Input/output conservation was verified separately:
`9655000 = 1130000 + 60000 + 8465000`. The original G1 parser's fixed `10000`
fee predicate is expected to return false for this larger batch; its structural
values were inspected without weakening that parser. Test-user source funds
remain distinct from operator payout capital. The additional operator fee note
has not been credited to a live run.

A new spending wallet and separate viewing-only source scanner were also
created, with the viewing identity pinned privately. They contain none of the
first run's source or fee-note history. Existing reverse capital wallets remain
under their original allocation until the first run closes; their balances are
not simultaneously credited to this fresh branch.

## SDK build and measured setup call

The same SDK source pin, `0243894aee9b615c091cf27499c58cdfe325d05f`, was built
with the existing patches/features in release mode using locked, offline
dependencies. Compilation completed in 5 minutes 4 seconds. The original debug
binary remains available and no source edit was made for this build.

| Artifact | SHA-256 |
| --- | --- |
| Release CLI | `ef1cbce8186feb852388cf56bb412a28285d57a75041d25efab1f74b9ef6b5d1` |
| Cargo lockfile | `b3e1fe97177133f35a71e2aea7ef09b2aeff42a4beba2bec9dcfead77b63c851` |
| Patched SDK command source | `386b8476cabe6b1748718143f5927a88ff5c4ba4a9e101ba86f318e01c208ed8` |

The CLI reports `Zingo CLI 0.1.1`. Empty recovery and an actual wallet viewing-key
fingerprint matched before use. The complete eleven-destination setup CLI call
took **19.448 seconds**, including startup/sync, proving and submission. This is
a measured whole-call duration for one setup transaction, not a pure proving
benchmark or a promised swap completion time. Canonical inclusion and all eleven
recipient decryptions subsequently passed.

## Base test-user fixtures

The source user's starting balance was explicitly supplied for the ten reverse
source payments:

| Setup | Transaction |
| --- | --- |
| 1000000 mockUSDC atomic units to the source user | `0xa81c81f14b5d61f6513527607a670eeab98e2f70804147f04b8ac0de0dc09df6` |
| 100000000000000 wei of source-user test gas | `0xd84a052bbabb79160d5b285a45b8c9da7d404899d65d590f3d39c213e3430ee6` |
| Exact 1000000-unit contract approval | `0x93584d83e8a36313613fa924e62e5124d9b317928041903a902aa8dfa6d0c194` |

Successful included receipts were checked. The approval is bounded to the total
ten source payments. These are explicit demo-user setup transactions. Operator
contract inventory remains `10000000` units; the separate reverse-refund escrow
holds `100000` units until that experiment completes. Its liability must clear
before the retry's strict zero-escrow physical opening check.

## Remaining work

The retry target, immediate source-funding driver and safe concurrency/recovery
rules still require implementation/review through the requested Sol 6.1 coding
workflow. The current runner has strict one-order boundaries. The signer JSON
compatibility fix and first-run refunds are also pending. No twenty-order result,
public payout service, or automatic reuse of held/unreconciled funds is implied
by this preparation checkpoint.
