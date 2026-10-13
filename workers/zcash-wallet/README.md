# G1: Zcash testnet feasibility

This directory contains tools for the five-step **testnet** wallet experiment:
initialize separate wallets, receive a payment with a memo, decode it with a
viewing-only scanner, pay a separate recipient, then restart and rescan.
It is not the production relayer, signer API, or cross-chain settlement service.

See [the evidence report](../../docs/evidence/g1-feasibility.md) for observed results.

## Toolchain and provenance

- WSL Ubuntu 24.04; Rust/Cargo 1.99.0; Python 3.12.
- Official [zcash-devtool](https://github.com/zcash/zcash-devtool) at
  `5a26ee854e634a4e88d1d79dab13f8fbb1eac6b8` bootstraps encrypted test mnemonics.
  Its locked `zcash_protocol 0.10.5` lacks the live NU7 branch; **do not use it to
  send on the current testnet**.
- [zingolib](https://github.com/zingolabs/zingolib) at
  `0243894aee9b615c091cf27499c58cdfe325d05f`, with `zcash_protocol 0.11.0-pre.0`,
  performs the actual G1 scanning and payments. Rust wallet engine changes use
  separate data stores; the two engines never share a wallet database.
- `zingo-waitsync.patch` changes two CLI call sites to use the library's existing
  `sync_to_tip_and_await` method. Otherwise a restored wallet's persisted
  continuous-sync setting can make `--waitsync` wait indefinitely. The patch
  changes no cryptography, consensus rules, keys, or payment logic.
- The test build uses `--no-default-features --features nakednet-test-mode` and
  verified TLS to `testnet.zec.rocks:443`. It does **not** use Nym/Tor or provide
  network-layer anonymity. The server sees the client IP. Keep this a dedicated
  test build; do not reuse it as a production privacy configuration.
- Third-party source code remains in local tool checkouts with upstream licenses;
  only our small integration helpers and the two-line patch live in this repo.

## Local storage

The executed experiment lives at `$HOME/zeeswap-g1` inside the
`Ubuntu-24.04` WSL distribution. Its root is mode `0700`.

```text
tools/zcash-devtool/target/debug/   built CLIs and structural verifier
tools/zingolib/                    pinned source with local CLI patch
keys/                             age identity files, mode 0600
wallets/{sender-a,operator-b,recipient-c}/  original encrypted devtool wallets
zingo-wallets/{sender-a,operator-b,recipient-c}/ separate Zingo stores
zingo-wallets/operator-view/       UFVK-only scanner
zingo-wallets/operator-view-rescan/ fresh UFVK-only rescan from birthday
g1-wallet-addresses.json           dedicated test addresses
g1-observations.sqlite             G1 duplicate-observation guard
{a-to-b,b-to-c}.operation.json     durable send-attempt journals
```

Original mnemonics are encrypted by devtool. Zingo wallet files contain sensitive
wallet material and are protected by local filesystem permissions; **do not
claim these files are encrypted**. Never print/export recovery material to chat,
Git, analytics, or an explorer. The scanner stores a viewing key, not a spending
key. This run does not prove OS-level isolation: the processes use the same WSL
user. Separate service users and signer restrictions belong to deployment work.

Repository `.deploy-local/` is also ignored. It contains disposable tooling,
generated protobuf bindings, raw public transaction bytes and private test output.
Never commit this directory. Raw note listings/memos stay in the local runtime.

## Reproduce preparation

Use a fresh private root for a new experiment. Existing wallet directories and
operation journals are intentionally not overwritten. The following is the
Linux build procedure used for the pinned tools, after installing Rust and
`pkg-config libssl-dev libsqlite3-dev cmake protobuf-compiler`:

```sh
export G1_ROOT=$HOME/zeeswap-g1
export ZEE_REPO="$(pwd)" # Run from the repository root
umask 077
mkdir -p "$G1_ROOT/tools" "$G1_ROOT/keys" "$G1_ROOT/wallets"

git clone https://github.com/zcash/zcash-devtool.git "$G1_ROOT/tools/zcash-devtool"
git -C "$G1_ROOT/tools/zcash-devtool" checkout --detach 5a26ee854e634a4e88d1d79dab13f8fbb1eac6b8
export CARGO_TARGET_DIR="$G1_ROOT/tools/zcash-devtool/target"
export CARGO_PROFILE_DEV_DEBUG=0 CARGO_INCREMENTAL=0
cargo +stable build --locked --manifest-path "$G1_ROOT/tools/zcash-devtool/Cargo.toml" -j 4

git clone https://github.com/zingolabs/zingolib.git "$G1_ROOT/tools/zingolib"
git -C "$G1_ROOT/tools/zingolib" checkout --detach 0243894aee9b615c091cf27499c58cdfe325d05f
git -C "$G1_ROOT/tools/zingolib" apply --unidiff-zero "$ZEE_REPO/workers/zcash-wallet/zingo-waitsync.patch"
cargo +stable build --locked --manifest-path "$G1_ROOT/tools/zingolib/Cargo.toml" \
  -p zingo-cli --no-default-features --features nakednet-test-mode -j 4

for role in sender-a operator-b recipient-c; do
  mkdir -p "$G1_ROOT/wallets/$role"
  "$CARGO_TARGET_DIR/debug/zcash-devtool" wallet -w "$G1_ROOT/wallets/$role" \
    init --name "ZeeSwap-G1-$role" --identity "$G1_ROOT/keys/$role.age" -n test -s zecrocks < /dev/null
done
python3 "$ZEE_REPO/workers/zcash-wallet/g1_import_wallets.py" --root "$G1_ROOT"
python3 "$ZEE_REPO/workers/zcash-wallet/g1_view_wallet.py" --root "$G1_ROOT"
```

`g1_import_wallets.py` captures the locally generated mnemonic internally and
passes it via `ZINGO_SEED`, never a command-line seed argument. It does not import
an existing user's mainnet wallet. Inspect balances and use a faucet to fund only
the dedicated test sender. The successful run used the
[Valar testnet faucet](https://faucet.testnet.valargroup.dev/). Availability and
limits must be rechecked; a faucet's "sent" message is not a wallet receipt.

## Read-only observation

```sh
"$CARGO_TARGET_DIR/debug/zingo-cli" --chain testnet \
  --server https://testnet.zec.rocks:443 --waitsync \
  --data-dir "$G1_ROOT/zingo-wallets/operator-view" notes all \
  > "$G1_ROOT/view-notes.json" 2> "$G1_ROOT/view-sync.log"
```

Use `notes all`: a received note remains a deposit observation after it is spent.
Check the sync log and actual scanned heights; upstream CLI error paths can
print errors without a failing exit code. A parseable output alone is not proof
of a complete scan.

`g1_network.py` reads the current chain, NU7 branch, tip and optional transaction
over TLS. Generate its Python bindings from `walletrpc/{service,compact_formats}.proto`
under `lightwallet-protocol/` in the official lightwalletd source pinned at
`d16d48124e9ad4157ebc2324b5090c6ba201470c`. The setup used `grpcio==1.84.0`,
`grpcio-tools==1.84.0`, `protobuf==7.36.2` in an isolated Python environment.

```sh
python -m grpc_tools.protoc -I PROTO_DIR --python_out=PROTO_DIR \
  --grpc_python_out=PROTO_DIR PROTO_DIR/service.proto PROTO_DIR/compact_formats.proto
python g1_network.py --proto-dir PROTO_DIR --txid TXID \
  --output PRIVATE_NETWORK_JSON --raw-output PRIVATE_RAW_TRANSACTION
```

This probe refuses a different network or consensus branch. Obtain `--tip` for
the receipt checker from a fresh successful probe and reconcile the **same txid
and mined height**. The checker alone does not query a chain or handle reorgs.

```sh
python3 "$ZEE_REPO/workers/zcash-wallet/g1_receipts.py" \
  --notes "$G1_ROOT/view-notes.json" --memo zeeswap:g1:001 \
  --amount-zatoshis 1000000 --tip VERIFIED_CHAIN_TIP \
  --state "$G1_ROOT/g1-observations.sqlite"
```

It requires exactly one external shielded output with the expected decoded
amount and memo and at least 10 confirmations. Identity is `(txid,pool,index)`.
The amount comes from the note, not the memo. A second observation records zero
new rows. This SQLite guard is local G1 scaffolding; Neon business accounting,
rollback handling and the production outbox remain G2/G5.

## Bounded test transfers

`g1_send_once.py` supports only two fixed transfers among the dedicated wallets:

| Leg | Principal | Memo | Preflight fee limit |
| --- | ---: | --- | ---: |
| A to B | 1,000,000 zatoshi (0.01 TAZ) | `zeeswap:g1:001` | 10,000 zatoshi |
| B to C | 500,000 zatoshi (0.005 TAZ) | `zeeswap:g1:payout:001` | 10,000 zatoshi |

Run the second only after independently checking A-to-B with the scanner and
the network probe, then synchronizing the operator signer wallet. The fee limit
is a preflight check; this test harness is not a cryptographically bound quote
or a production signer policy. Verify the resulting transaction fee separately.

```sh
python3 "$ZEE_REPO/workers/zcash-wallet/g1_send_once.py" --root "$G1_ROOT" --leg a-to-b
# After receipt, confirmation and signer-state checks:
python3 "$ZEE_REPO/workers/zcash-wallet/g1_send_once.py" --root "$G1_ROOT" --leg b-to-c
```

The journal is created exclusively and fsynced **before** broadcast. Any existing
journal blocks a repeat, even if the earlier process timed out or crashed. This
deliberately favors stopping for reconciliation over automatically retrying an
ambiguous send. `broadcast` is not `confirmed`; confirm in the independent
recipient wallet and on the network. Do not delete a journal to retry.

## Structural privacy check and restart

Build the small verifier using its checked-in Cargo lockfile:

```sh
cargo +stable build --locked --manifest-path "$ZEE_REPO/workers/zcash-wallet/verify/Cargo.toml"
"$CARGO_TARGET_DIR/debug/zeeswap-g1-verify" RAW_TRANSACTION EXPECTED_TXID
```

For this experiment it requires NU7, zero transparent inputs/outputs, no Sprout,
Sapling or Orchard bundle, one Ironwood bundle, and a 10,000-zatoshi Ironwood
value balance (fee only). It verifies serialized structure and txid, not
consensus proofs or the shielded recipient. Pair it with network inclusion and
the independent decoded note receipt.

Restart the scanner, sync and record the same receipt again. Then create a fresh
viewing-only store from the same birthday and repeat a full rescan:

```sh
python3 "$ZEE_REPO/workers/zcash-wallet/g1_view_wallet.py" --root "$G1_ROOT" \
  --scanner-name operator-view-rescan
```

Both passes must keep `total_observations=1`. Reinvoking the same send leg must
refuse before reaching the wallet CLI. These checks do not replace the future
G5 crash/broadcast/reorg/refund tests.

Local receipt-policy tests: `python -m unittest discover -s workers/zcash-wallet -p 'test_*.py' -v`.
