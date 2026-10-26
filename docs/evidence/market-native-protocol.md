# Market-reference native payout protocol

This evidence covers the separate `market-reverse-v1` testnet protocol. It does
not authorize wallet startup, policy activation, signing or broadcasting. The
legacy fixture protocol, G5 guards and bridge profiles remain unchanged.

## Implemented boundary

`market_native_protocol.py` independently checks the immutable accepted quote,
Kraken snapshot digest, both raw ZEC/USD and USDC/USD legs, their spread and
12-decimal midpoint, the selected conservative 12-decimal bid/inverse-ask ratio,
integer output rounding, recipients, source input, destination output and recorded
acceptance time. Snapshot expiry and quote expiry apply at acceptance. The payout
does not fetch a new price or reprice an accepted liability.

The independent vector uses ZEC/USD bid 1200 / ask 1202 and USDC/USD bid 0.999 /
ask 1.001:

| Direction | Source units | Destination units |
| --- | ---: | ---: |
| TAZ to mockUSDC | 100,000 zatoshis | 1,198,801 mockUSDC atomic units |
| mockUSDC to TAZ | 1,000,000 mockUSDC atomic units | 83,111 zatoshis |

Snapshot ID `12345678-1234-4234-8234-123456789abc`, retrieval
`2026-10-26T00:00:00.000Z`, expiry `2026-10-26T00:00:30.000Z` produces digest
`a150d27324f0487458b1d0dd2a7f2a40c5958a08be9a888c49be18b86c8e1ad8`.
These are public synthetic arithmetic fixtures, not market observations or payments.

`market_reverse_preflight.py` first validates this new protocol and then reuses
the unchanged canonical Base escrow COMMIT proof. That proof checks the original
mockUSDC input, successful canonical receipt, finalized COMMIT state, exact escrow,
operator, contract/token runtime identity and chain 84532. It does not reinterpret
the source input as a Zcash amount. The legacy equality/bounds validator remains
unchanged and rejects this market request.

`market_native_wallet.py` uses the existing maintained SDK prepared-raw kernel
through a separate initializer. SDK-selected notes, exact private receiver/output,
authenticated internal change, actual fee, expiry and raw bytes retain the kernel's
independent validation. Its market-specific command seam checks durable intent
and rechecks canonical Base authority plus the live SQL accepted-order/worker fence
immediately before external calculation. Broadcast repeats these checks and binds
the original signed DB transaction. An unknown broadcast blocks another send.

`market_owned_wallet.py` owns the complete native child process group and provides
the cleanup acknowledgement expected by `LocalReverseWalletAdapter`. It invokes
only the fixed market native script. It adds no new command to the old supervisor.

`market-native-runtime.ts` provides the concrete protected profile loader,
`marketNativeContexts` reverse-worker factory, immutable request/config generation,
Root capital approval checks, wallet adapter, original journal lookup, Base signer
transport and final guard. `market-native-guard.ts` is the finite authority/broadcast
CLI. The final guard reloads the accepted encrypted quote and snapshot, Root market
policy membership, original source COMMIT, operator advisory-lock ownership, runtime
epoch, fresh source checkpoints and live payout lease. Broadcast additionally binds
the original signed payload, transaction ID, raw hash and expiry.

The existing Base reverse signer remains suitable: its funding/COMMIT fields bind
the source amount, while its SETTLE receipt check independently compares confirmed
native delivery with `approved.amountZatoshi`. It does not apply the legacy native
fixture equality guard. No new contract deployment is required by these changes.

## Operator configuration contract

The separate Root-owned profile path is
`/opt/zeeswap-testnet/secrets/market-reverse-profile.private.json`. Its fields are:

- `version: 1`, `mode: MARKET_REFERENCE_NATIVE_TESTNET`, `enabled`,
  `marketPolicySha256`, and `maxAmountZatoshi` no greater than 10,000,000.
- `operatorProfile`: the existing independently verified Linux operator manifest.
  Reuse requires Root verification of the isolated current operator identity and
  physical capital. G5 wallets, bridge backing and unresolved customer funds are
  not implicit capital approval.
- `python`, `node {path, sha256}`, `signerConfig {path, sha256}`, `protoDir`.
- `scripts`: the exact map exported by `market-native-runtime.ts`, including all
  new market files and the reused kernel/profile/supervisor/Base signer/capital
  capture dependencies. Script paths stay inside the verified release.

Per-order files live only beneath
`/opt/zeeswap-testnet/state/market-reverse-orders/ORDER_UUID/`. The Root-owned
`capital-approval.private.json` binds:

```text
version = 1
purpose = market-reverse-v1
orderId = exact accepted order UUID
approvedDigest = canonical SHA-256 of the complete new private payout request
marketPolicySha256 = the accepted market policy
sourceFingerprint = verified operator UFVK fingerprint
notes = exact currently unspent approved native note identities and integer values
sources = explicit provenance proof files and hashes
capture = { path, sha256 } of the actual Root physical capture
```

The existing read-only `testnet_policy_capital.py` accepts a distinct policy digest
and can produce the required physical capture without changing its protocol. Its
observations must be fresh at approval. The factory independently validates both
current physical notes and their discharged/operator-capital provenance. A fresh
SDK note scan still occurs before calculation; a receipt total is never treated
as spendable capital.

The factory creates immutable `approved.private.json`, `preflight.private.json`,
`guard.private.json`, `prepared.private.json` and the worker state only after these
checks. Root capital approval is never generated automatically from HTTP input.
All these files, wallet data, keys, raw bytes and private mappings stay outside Git.

`api/scripts/market-native-approval-preview.ts PROFILE ORDER_UUID` supplies the
Root review step before capital approval. It reads the accepted encrypted quote
and stored confirmed COMMIT, writes only the fixed private
`candidate-approved.private.json` with exclusive creation/fsync, and returns the
approval digest. It does not sign, initialize a wallet, broadcast, or publish an
observation. Its output explicitly has `sourceProofFresh: false`: fresh canonical
COMMIT authority is established later by the native preflight, not by this preview.

## Local checks on 26 October 2026

The explicit Ubuntu-24.04 WSL Python 3.12 command passed **80 tests**, including
12 new market tests and 68 existing native, fixture and bridge regressions:

```sh
cd workers/zcash-wallet
python3 -m unittest test_market_native test_prepared_raw test_outgoing_recovery \
  test_linux_native_wallet test_reverse_preflight test_refund_raw \
  test_bridge_protocol test_bridge_native_wallet -q
```

The three Node/Python integration tests passed:

```sh
pnpm --dir api exec tsx --test test/market-native.test.ts
pnpm --dir api typecheck
```

The integration exercises an accepted encrypted quote fixture through the actual
request builder and accepted-terms guard, then the independent Python approval and
generic prepared-raw validator with synthetic SDK data. It checks a positive
106,889-zatoshi change output for a 200,000-zatoshi input, an 83,111-zatoshi payout
and a 10,000-zatoshi fee. Other tests reject stale-at-acceptance prices, modified
ratios/digests/recipients/refunds, source/output unit substitution, cancelled or
reorged Base commitments, unapproved profiles/capital, late guard failure and
repeated unknown broadcasts. The actual Linux supervisor refusal/reap path is tested.

These checks are local software evidence. They do not prove that the protected
Root profile, actual CLI guard/lease, funding inventory or SDK wallet is ready on
the operator host. No wallet initialization, native SDK signing, financial
broadcast, SSH or database mutation was performed by this subtask. Actual funded
two-direction market-priced settlement remains an operator acceptance gate.

## Separate market refund authority

The forward-source refund route also uses a distinct protocol and protected
profile. It does not pass a market order into the legacy fixture-policy guard:

- Profile `/opt/zeeswap-testnet/secrets/market-refund-profile.private.json`, mode
  `MARKET_REFERENCE_REFUND_TESTNET`, purpose `market-refund-v1`.
- Files `market_refund_wallet.py`, `market_refund_preflight.py`,
  `market_refund_owned_wallet.py`, `market-refund-native-runtime.ts` and
  `market-refund-native-guard.ts` provide the actual native transport, canonical
  CANCEL proof, factory and final guard.
- Private files live under `state/market-refund-orders/ORDER_UUID/`. The Root
  capital approval uses the same fields as reverse approval, with purpose
  `market-refund-v1`, and must include that order's confirmed `refund-source`
  provenance. Physical capital and market-specific provenance are independently
  checked by `approvedMarketCapital`; the old paused-policy helper is not called.
- `marketRefundRequest` binds the accepted quote plus the actual confirmed primary
  deposit ID, classification and amount. The refund is the full actual received
  native source, including eligible under/over/late payments up to the automatic
  bound. It never substitutes the market-converted destination amount.
- `MarketRefundAdapter` reuses the prepared-raw kernel and the market-specific
  late calculation seam. Its authority requires the unchanged canonical permanent
  Base CANCEL verifier plus fresh market membership and refund signing authority.
  Broadcast additionally checks the original signed refund, hash, raw bytes, fee
  and expiry. Price expiry after acceptance does not reprice or erase the refund.

The concrete factory exports `loadMarketRefundNative` and
`marketRefundNativeContexts`. The backend's separate market refund dispatcher and
SQL namespace supply the market epoch/signing checks; neither the legacy policy
context nor its 100,000-zatoshi campaign limit is silently reused.

After adding this boundary, the scoped Linux suite passed **86 tests** (18 market
tests and 68 existing regressions). The Node/Python integration suite passed
**4 tests**, including a forward quote with 1,198,801 destination mock units whose
refund remains the full 100,000 native source units. Add
`test_market_refund_native` to the Python command above. These tests also cover
late market-authority revocation, canonical cancellation races, retained unknown
broadcast state and actual owned-child refusal/reap. TypeScript checking passed.
