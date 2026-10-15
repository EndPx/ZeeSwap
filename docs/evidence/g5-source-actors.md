# G5 private source actors

These helpers prepare the test-user source legs for the bounded G5 retry. Their
local tests do not establish a live swap, a recipient receipt, or completion of
the twenty-swap gate. No live wallet command, signature, broadcast, or database
write was executed while implementing or testing this increment.

## Shielded source actor

`workers/zcash-wallet/g5_source_actor.py` exposes separate `sync` and `fund`
commands. The operator synchronizes the isolated odd-sequence source wallet
before creating its quote. A later explicit sync can refresh an aged snapshot;
the previous private snapshot is retained. A funding intent prevents another
sync/fund cycle through this helper.

The helper binds the exact retry branch, run identifier, unchanged manifest
hash, current run state, odd source sequence, fixed wallet path, owned refund
receiver, actual exported UFVK hash, and approved note identity. Windows drive
paths are mapped to their WSL mount paths, and Ubuntu-24.04 UNC paths are mapped
to Linux paths without rewriting the manifest used for its binding hash. Other
UNC distributions, relative paths, and parent traversal are rejected.

Funding instructions must occupy the core's fixed per-sequence path. Their
order identifier and receiver must match that sequence in the run state. Order
UUID and memo reference are distinct values; the memo retains the canonical
`{"v":1,"ref":"..."}` form emitted by the core.

The wallet must contain exactly the approved unspent 110,000-zatoshi Ironwood
note, with at least ten confirmations, no unspent transparent coins, a complete
scan, and a scan within two blocks of the tip. The transfer is exactly 100,000
zatoshi with exactly 10,000 fee. The actor checks an eight-block minimum funding
window before and after the offline proposal. It fsyncs a fixed exclusive
intent and its parent directory before invoking `quicksend`. A timeout, crash,
or unexpected result preserves the intent. Recovery must inspect the original
SDK wallet and original operation; this helper never creates a replacement.

## Base test-user funding preparer

`workers/base-signer/g5_payer_funding.py` prepares one approved 100,000 mockUSDC
escrow `fund` transaction on Base Sepolia. It does not broadcast. It pins the
existing test-user payer, mock token, settlement contract, cast account,
password-file path, and existing shared payer journal. No mint, approval,
arbitrary calldata, or key export operation is exposed.

The approved funding object must equal the core reverse state's saved funding
object, and the order and sequence must match the unchanged manifest and current
run state. The preparer regenerates the exact `fund` calldata and validates
deployed code hashes. The private approval digest cannot substitute for these
core-state bindings.

The preparer takes the existing `signer.lock` and shares its `*.tx.json` nonce
journal with the payer's refund signer. Cast children inherit the lock file
descriptor, including the signing child, so a parent termination does not
release that kernel lock while the child remains alive. The latest and pending
nonces must agree; another journaled nonce must already have landed before a
new raw is prepared. An existing matching prepared raw is recovered unchanged.

Before a new signing operation, the helper parses block responses with the
shared strict `refund_signer.block_json` parser. It re-reads the canonical block
identity, reads a fresh latest head, rejects backwards/stale observations, and
requires more than sixty seconds remaining before the funding cutoff using both
the chain timestamp and local clock. Preparation is persisted before signing;
the resulting raw and hash are persisted before private output. Root/operator
review and broadcast remain separate operations.

## Controller scope

`api/src/g5-actor-controller.ts` is an orchestration policy with injected IO.
It bounds execution by step count and time, persists a funding latch before
delegating to a funding actor, freezes on uncertainty, and requires full barriers
at sequences 5, 10, 15, and 20. The live IO adapter is **not wired**. This policy
is not a runnable live twenty-order controller and is not settlement evidence.

The core verifier must only be invoked after observation reports `SETTLED`;
calling it as a pending-state poll would incident-latch the run. The literal
first forward/reverse circle is executed explicitly by the operator using
reviewed core commands and these bounded preparers.

## Local verification

Verified on Ubuntu-24.04 using disposable files and mocked wallet/cast IO:

- Source actor: **6 tests passed**, including distinct order/reference values,
  fixed core-slot bindings, eight-block boundary rejection, unknown-send
  preservation, run incident rejection, and Windows/Ubuntu path mapping.
- Base payer: **4 tests passed**, including saved-core funding equality,
  immutable raw recovery, nonce serialization, inherited lock descriptor
  delivery to cast IO, failed/malformed block envelopes, canonical hash change,
  stale latest timestamp, and funding cutoff rejection before signing.
- Controller policy: **3 tests passed**, including alternating sequence/barrier
  progression, durable pre-funding latch, uncertain-result freeze, and bounded
  waiting.
- API global TypeScript check: **passed**.

The lock-descriptor fixture checks that the cast invocation receives a live
descriptor; it does not claim a real funded process-kill experiment. Tests do not
reset any historical database or use an active live wallet. Private manifests,
funding instructions, memos, order mappings, raw transactions, journals, and
receipts remain outside Git.

## Ownership reply correction

The operator's first live pre-quote sync stopped with
`G5_SOURCE_REFUND_RECIPIENT_NOT_OWNED`. No quote or funding intent had been
created. Inspection showed that `check_address` returns an object containing
`is_wallet_address: "true"`, rather than the string as the entire reply.

The actor now requires that object, the strict string `"true"` ownership field,
the exact configured encoded refund address, unified address type, and strict
Orchard-only shielded flags. The added fixture uses the observed response shape
and rejects false/string-vs-boolean ownership confusion, another address, and
invalid shielded flags. The six source fixtures pass on Ubuntu-24.04. This
correction establishes parser compatibility locally; the operator must rerun
the pre-quote sync before proceeding.
