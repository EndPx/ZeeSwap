# Bounded concrete Base adapter checkpoint — 26 October 2026

This checkpoint adds concrete Base reads and restricted local signing mechanics.
It does not activate the API, qualify a bridge SDK wallet or complete G6.

## Implemented modules

`api/src/bridge/adapters/profile.ts` validates a versioned Base Sepolia deployment,
runtime bytecode, immutable admin/operator/authorizer, dedicated ledger identities,
two independent HTTPS reader hosts, fixed freshness policy and integer gas limits.
It rejects the historical live swap signer. Protected secrets are bounded to
16 MiB; executable pins use a separate streamed SHA-256 bound of 512 MiB and
metadata readback. Loopback local testing is a separate explicit option that
rejects HTTPS/public endpoints.

`base.ts` performs actual `eth_chainId`, canonical finalized/header/deployment
receipt/code and pinned-height contract reads on both configured clients. It
compares decimals, roles, operator gas balance, total supply and unpaid redemption
counter, then rechecks the canonical anchor and freshness. Its Base fact verifier
binds the exact transaction caller/contract/calldata, authenticated unique event,
amount, private commitment and canonical mint/cancellation/redemption record.

Fact ingestion and economic authority are separate: historical burn facts remain
observable after acknowledgment. Before a native payment,
`assertCanonicalOrder` acquires the currently agreed finalized anchor and also
checks each current canonical latest redemption record. A newer finalized or
included acknowledgment forbids another payment even if an old private book uses
a still-recent historical pair that previously reported `delivered=false`.

`cast.ts` invokes a hash-pinned cast binary directly, with explicit dedicated
encrypted keystores and pinned private password files. No shell or generic user
command is accepted. It checks the actual wallet address, EIP-712 authorization,
exact signed legacy transaction fields, chain, caller, calldata, nonce and gas
caps. Both readers must agree `latest nonce == pending nonce` before signing;
the original nonce is checked again before submission. Final receipt fees include
Base L1 fees when running against actual Base, within the immutable maximum cost.

`operation-journal.ts` serializes the signer across processes and persists an
encrypted, fsynced and read-back signing-start/nonce/UNKNOWN journal independent
of the application database. One unresolved signed transaction blocks another
nonce allocation. UNKNOWN is written before RPC; automatic resubmission and
signing after an interrupted operation are refused. Exact canonical final receipt
reconciliation releases its active nonce. A reverted/ambiguous original requires
separate operator reconciliation; no automatic nonce replacement is implemented.

Production `authorize`, `prepare` and `broadcast` throw
`BRIDGE_NATIVE_AUTHORITY_NOT_QUALIFIED` before effectful work. Persisted
`DEPOSIT_FINALIZED` or `COMPLETED` state alone cannot authorize a real mint or
liability acknowledgment. Removing this gate requires a concrete independently
canonical native source/delivery coordinator, not an operator-supplied boolean.
No production factory, preflight executable or service-startup wiring is supplied
by this checkpoint.

One final review finding remains an **open live activation limitation**:
`CanonicalBridgeBase.verify` currently calls `readAt`, whose minimum operator gas
balance check can refuse ingestion of an already finalized mint, burn or
cancellation when operating gas drops below its configured floor. The facts and
liabilities are not erased, but factual reconciliation remains blocked until gas
is available. Before activation, move that operating-capital admission condition
to the financial preflight while preserving strict canonical/role checks for
historical fact ingestion, and verify the low-gas case. No code change or new
test for this finding is claimed at this frozen checkpoint; production financial
effects remain refused and the runtime factory is absent.

## Actual local execution

Command:

```powershell
pnpm --dir api exec tsx --test test/bridge.test.ts test/bridge-journal.test.ts test/bridge-adapters-base.test.ts
pnpm --dir api typecheck
```

The final combined suite passed **31/31, zero skips**, with API typechecking.
This comprises 24 core/HTTP/native-file cases and seven cases including the parent
in the actual local Anvil adapter fixture. Earlier implementation checks exposed
and corrected the executable-vs-secret file-size/path distinction, absent RLP zero
value normalization and an overly narrow error-code expectation for an already
reconciled original. Those failures were not live bridge operations.

The invocation-owned native Anvil ran on literal `127.0.0.1`, an ephemeral port,
chain 84532 and zero base fee. No Docker, existing Anvil instance, production RPC,
historical swap wallet or live database was used. Generated unfunded test keys
were imported into temporary encrypted cast keystores; their private files and
the Anvil process were removed at test cleanup.

Actual Anvil evidence includes:

- canonical finalized deployment/bytecode/roles/decimals and initially paused state;
- production signer refusal and rejection of a public-HTTPS local-test bypass;
- actual cast EIP-712 authorization and original raw mint of exactly 100,000 units,
  with journal recovery and duplicate submission rejection;
- actual authenticated payer burn of exactly 100,000 units, finalized event binding,
  supply decrease and exact unpaid counter;
- actual cast-signed acknowledgment, permanent delivered-state refusal, and the
  old-pair-before-ACK regression;
- actual cast-signed permanent cancellation and rejection of a later mint for the
  same commitment.

The shielded source and delivery in this fixture are explicitly synthetic. The
private book intentionally retains its unpaid native liability when the fixture
demonstrates the contract ACK; this exposes the mismatch instead of claiming a
confirmed Zcash settlement. Two local clients read the same invocation-owned
Anvil; this verifies adapter mechanics, not independence of real infrastructure.

## Narrow commitment correction and remaining gates

Root approved a cross-language correction before any live bridge order exists.
The commitment now hashes the explicit versioned positional array documented in
`docs/bridge.md`; quote idempotency likewise uses ordered values rather than HTTP
object property order. Node and the independent native protocol use hardcoded
vectors for both directions, including refund recipient and payer. No migration
or existing swap commitment changed. The earlier isolated PostgreSQL evidence is
retained in `g6-bridge-implementation.md`; any later Root rerun after this narrow
change is recorded there: Root's final actual rerun passed 7/7 with zero skips,
7.130 seconds total (5.737-second body), repeating the same seven scenarios.

Actual native SDK wallet/profile qualification, exact dedicated principal/fee
note ownership and receiver recovery, the pinned native Base preflight executable,
fresh cross-chain MINT/ACK authority coordinator, full runtime factory, operational
capitalization and funded testnet two-way circle remain open. API startup remains
unconfigured/unavailable. No live migration, deployment, financial authority,
payment, bridge mint/burn, G5 continuation or mainnet work occurred.
