# G1: Zcash testnet feasibility

## Bounded reverse raw transaction adapter

`prepared_raw.py` is a private Linux operator pipe for one isolated reverse
experiment. It uses the actual pinned wallet SDK to propose/sign, persist,
recover and submit exactly one Ironwood transaction. It does not enable the
public reverse route or turn the CLI into a continuous settlement service.

Reproduce the export integration on the same pinned checkout, preserving the
existing waitsync patch:

```sh
python3 workers/zcash-wallet/patch_prepared_sdk.py "$G1_ROOT/tools/zingolib"
CARGO_TARGET_DIR="$G1_ROOT/tools/zcash-devtool/target" \
CARGO_PROFILE_DEV_DEBUG=0 CARGO_INCREMENTAL=0 \
cargo +stable build --locked --manifest-path "$G1_ROOT/tools/zingolib/Cargo.toml" \
  -p zingo-cli --no-default-features --features nakednet-test-mode -j 4
cargo +stable build --locked --manifest-path workers/zcash-wallet/verify/Cargo.toml
python3 -m unittest discover -s workers/zcash-wallet -p 'test_*.py'
```

The patch adds `calculate ADDRESS ATOMIC_AMOUNT` and `calculate --recover`.
Calculation signs without transmission, stops the asynchronous saver, explicitly
flushes the wallet, and fsyncs the wallet file and parent directory with propagated
errors before exporting. Recovery exports already calculated transactions and
never creates another proposal. The export contains actual serialized bytes,
SDK txid/expiry/fee, nullifier-linked input note IDs and OVK-decrypted outputs.
`ownChange` is true only for an output also decrypted with the wallet's internal
incoming key. The pinned SDK's outgoing list excludes internal change, so the
export also includes incoming-internal notes from the same stored transaction,
using their actual decoded recipient/value rather than arithmetic inference.
Both output types carry their actual output index; indices must be nonnegative
and unique. Its response is private and must not be printed in public logs.

Provision a mode-0700 Linux private runtime directory with mode-0600 files. The
config fields are `cliCommand`, `readCommand`, `verifyCommand`,
`preflightCommand`, `beforeBroadcastGuardCommand`, `approvedRequest`,
`approvedDigest`, `journalPath`, `walletDir`, `lockPath`, `protoDir`,
`capitalUfvkSha256`, `approvedCapitalNotes` and `recipientUfvkFile`. Command
fields are operator-owned argument arrays; never accept them from API callers.
The private approved request follows `reverse_preflight.py` version 1. The
capital wallet must be separate `reverse-capital`, have a separately approved
UFVK digest, and contain only ten-confirmation Ironwood notes individually
approved as operator capital by `(pool,txid,index,value)`. Existing operator-b
notes, including held customer deposits, cannot qualify. `recipientUfvkFile`
contains the independent recipient's plain UFVK, never a spend key.

The stdin protocol accepts exactly one field:

```json
{"command":"prepare"}
```

Run `python3 workers/zcash-wallet/prepared_raw.py --config PRIVATE_CONFIG`.
Commands are `prepare`, `recover`, `broadcast`, and `receipt`. Prepare/recover
return private `{txid,rawTransaction,feeZatoshi,expiryHeight,selectedNotes,
outputs,operationId,amount,fee,recipient}`. `expiryHeight` and all amounts are
canonical integer strings. The receipt returns canonical mined block/tip
identities and times, the independent recipient's decrypted amount, immutable
`orderId` and `approvedDigest`, and at least
ten confirmations; receipt verification does not depend on the Base order still
being committed.

Prepare independently checks finalized Base commitment, genuinely synchronizes
the isolated wallet, and fsyncs an exclusive signing intent before calculation.
An existing intent always refuses a new calculation. A crash before durable SDK
save requires manual reconciliation; recovery cannot invent absent bytes. A crash
after durable SDK save can recover only one already calculated transaction and
verify it against the original capital list. Interrupted atomic journal updates
leave their `.tmp` files private and require reconciliation before another write.

Every verification reparses the raw transaction and independently decrypts its
recipient ciphertext. Broadcast additionally reexports the actual SDK transaction,
checks byte/input/output equality, refreshes the Base commitment and expiry window,
and requires a local durable job/fence guard. The guard receives
`{operationId,approvedDigest,txid,rawSha256}` over stdin and must return
`{authorized:true,txid,rawSha256}` only after independently checking the sealed
business transaction and current worker authority. This command is not a substitute
for the database fence implementation. Submission is journaled as ambiguous before
the gRPC call. A response-loss retry may submit only identical bytes; an acknowledged
submission refuses another broadcast. Recovery remains possible after expiry.

The Python fault-injection tests are synthetic state/durability checks, not signed
transaction or live settlement evidence. A successful compiled SDK empty-wallet
recovery proves the export command works; it does not prove funded preparation,
delivery, Base settlement, or final accounting.

`reverse_capital_snapshot.py` separately captures the private opening-capital
artifact consumed by the explicit database bootstrap. It verifies the pinned
capital UFVK, genuinely synchronizes the isolated wallet under its inherited
writer lock, and admits exactly one operator-approved 200,000-zatoshi Ironwood
note after ten confirmations. It independently fetches the canonical full
transaction, checks compact-block membership, decrypts the incoming ciphertext
with the capital UFVK, and rechecks all referenced block hashes before writing.
The actual note identity/value must match the configured capital whitelist;
unknown or spent notes refuse opening-capital reconciliation.

```sh
python3 workers/zcash-wallet/reverse_capital_snapshot.py \
  --config PRIVATE_PREPARED_CONFIG --output PRIVATE_CAPITAL_PROOF \
  --funding-txid INDEPENDENTLY_APPROVED_FUNDING_TXID
python3 workers/zcash-wallet/reverse_capital_snapshot.py \
  --config PRIVATE_PREPARED_CONFIG --output PRIVATE_CAPITAL_PROOF --refresh
```

`--refresh` reads canonical chain blocks without wallet synchronization or any
balance assertion. It emits only `{snapshot}`, with no received outputs, and
preserves previous referenced block heights. Additional private receipt heights
can be supplied with `--check-height`. It cannot claim that opening capital
remains unspent after payout. Both forms write private artifacts and print only
sanitized status/height and, for opening capture, balance/confirmation counts.
These artifacts have a 60-second freshness requirement in the existing observer
validator. Capital receipt evidence is not reverse payout or settlement evidence.

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

# Reverse commitment preflight (2026-10-14)

`reverse_preflight.py` is a read-only gate for an operator-approved private reverse
request. It has no proposal, calculate, signing, transmission, wallet mutation or
journal write command. Even a successful commitment check returns
`dispatchEnabled: false`. It does not enable reverse execution.

The private request uses the backend integration vocabulary:

```json
{
  "version": 1,
  "orderId": "private-order-uuid",
  "settlementId": "0x...32-byte-id",
  "recipient": "private-canonical-shielded-testnet-receiver",
  "amountZatoshi": "100000",
  "maxFeeZatoshi": "10000",
  "base": {
    "chainId": 84532,
    "contract": "0x...settlement",
    "token": "0x...mockUSDC",
    "payer": "0x...payer",
    "refundRecipient": "0x...refund-recipient",
    "amountAtomic": "100000",
    "cancellationAvailableAt": "...positive-decimal-timestamp",
    "commitTxHash": "0x...32-byte-hash",
    "commitBlockNumber": "...positive-decimal-height",
    "commitBlockHash": "0x...32-byte-hash"
  }
}
```

The separately supplied approved SHA-256 is over UTF-8 JSON serialized with sorted
keys and compact separators. It must come from trusted immutable private order
state or operator review, rather than a payout caller. Base commitment alone
cannot authenticate a Zcash recipient or output amount: those stay private and
are bound by the approved request. This gate is bounded to the existing labelled
fixture rate where source mockUSDC atomic units equal output zatoshis, existing
input caps and at most 10,000-zatoshi fee; it supplies no market pricing.

The private config contains `readCommand` for the existing SDK address-validation
pipe, `hashCommand` for local `cast keccak`, and a TLS `rpcUrl`. `hashCommand` is a
trusted command prefix such as `["/home/albary/.foundry/bin/cast", "keccak"]` when
running natively in the existing WSL environment. The HTTPS RPC request identifies
itself as `ZeeSwap-Testnet-Preflight/1.0`; the public endpoint refused Python's
default user agent with HTTP 403 during the actual read-only probe. Certificate
verification remains Python's standard verified TLS, without a custom insecure
context. Both chain-ID and finalized-block reads passed with the identified client.
Configuration and approved
requests belong outside Git. The command takes `--config`, `--approved-request`,
`--approved-digest` and `--registry`; successful private stdout contains gate
status, finalized height, the approved digest and private order ID. These last
two identities bind the raw adapter to the request actually checked by preflight.
Do not publish this private pipe response.

The gate independently reads Base chain ID, fresh latest/finalized heads,
canonical successful commit receipt, exact `commitPayout(bytes32)` transaction,
registered operator sender and one matching commitment event. It verifies
registry contract addresses, canonical deployment blocks and finalized runtime
code hashes, then pins `eth_call` and `eth_getCode` to the finalized canonical
block hash using EIP-1898. Finalized `PAYOUT_COMMITTED`, full source escrow terms,
configured token and six decimals must match. A final block-hash reread guards
against a changed canonical snapshot. Any unsupported RPC method fails closed.
This trusts the configured chain provider as the existing prototype does; it is
not a Zcash proof or permission to spend after this process exits.

`validate_private_receipt` is a pure validator over supplied trusted SDK/parser
results. Tests prove rejection of incorrect amount, receiver, pool, transaction
identity, duplicate recipient note, transparent output and insufficient
confirmations. The function does not fetch raw bytes, authenticate caller data,
or prove block inclusion/canonicality itself. The raw adapter described above independently
fetch the raw transaction and canonical compact block, match inclusion and mined
height, run the existing Rust raw parser, and decrypt using the independent
recipient UFVK before using this function. Raw data, viewing keys and notes stay
private. Compilation and local fault tests do not establish live reverse receipt acceptance.

The earlier preflight slice inspected pinned SDK feasibility without wallet changes at zingolib commit
`0243894aee9b615c091cf27499c58cdfe325d05f` under the existing WSL G1 tools directory:

- `zingolib/src/lightclient/send.rs`: `calculate_stored_proposal` signs without
  transmitting and stores `Calculated` transactions in the wallet;
  `transmit_transactions` serializes the stored transaction before transmitting.
- `zingo-cli/src/commands.rs`: `calculate` exposes only the resulting `txids`;
  `transmit` sends stored calculated transactions. CLI source inspection found no
  signed raw export boundary. Existing `quicksend` remains unsuitable for the
  required external prepared-raw journal.

The raw adapter now implements the requirements identified by that earlier slice.
It uses a dedicated capital wallet/account whose approved notes
cannot include customer-held or unreconciled source proceeds. Its protections establish
one exclusive wallet/journal writer lock, fsync immutable intent before SDK
signing, extract the exact calculated transaction bytes and chosen note set,
verify recipient/value/privacy/fee/expiry from those bytes, and durably persist
raw bytes plus txid before broadcast. Atomic journal replacement uses file
and directory fsync. Recovery after a crash or timeout reconciles that exact
transaction; it cannot call another SDK send. Before broadcast it independently
rereads finalized Base commitment, immutable order authority and the durable job
guard. The actual compiled SDK was exercised with an isolated empty test wallet's
recovery export; no funded preparation or spend is proved by this local check.

The first funded preparation exposed the upstream outgoing-list omission of
internal change. The adapter refused incomplete conservation metadata and left
the signing intent intact. After the export correction, recovery read the already
persisted transaction and verified the exact original txid and signed bytes, one
100,000-zatoshi external output, 90,000-zatoshi authenticated change, a
10,000-zatoshi fee and unique actual output indices. The narrow metadata repair
may fill missing output indices only from the same persisted SDK transaction;
any difference in raw bytes, txid, fee, expiry, selected notes or output terms
refuses the update. This recovery did not calculate or broadcast another payment.
Actual delivery and cross-chain settlement require their separate receipts.
Private failures record only exception class and source locations in a mode-0600
file; exception text, subprocess arguments, keys, raw bytes and full memos are
excluded.

Verification: `python3 -m unittest discover -s workers/zcash-wallet -p 'test_*.py'`
passed 40 tests on Linux (including seventeen durable-adapter checks, three
capital proof checks and three RPC transport checks). EVM selectors
and the event topic were independently derived with installed Foundry `cast sig`
and `cast keccak` against the Solidity function/event names, rather than inferred
from the fixture. Reverse test RPC responses are synthetic and do not constitute
testnet commitment or reverse settlement evidence.
